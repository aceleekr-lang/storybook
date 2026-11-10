// 서버 함수 공용 도구 (밑줄로 시작하는 파일은 Vercel이 주소로 만들지 않음)
function readBody(req) {
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  return body;
}

// Supabase ys_api 부르기 — 로그인 토큰 확인과 하루 횟수는 데이터베이스가 맡음
function makeRpc(token) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  const h = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SUPABASE_ANON_KEY;
  return async (action, data = {}) => {
    const r = await fetch(`${String(SUPABASE_URL).replace(/\/$/, '')}/rest/v1/rpc/ys_api`, {
      method: 'POST', headers: h, body: JSON.stringify({ p_token: String(token || ''), p_action: action, p_data: data })
    });
    return r.json();
  };
}

// 쓰기 전 확인. 실패하면 응답을 보내고 null을 돌려줌
async function check(res, rpc, kind, owner) {
  let q;
  try { q = await rpc('ai_check', { kind, id: String(owner || '') }); }
  catch { res.status(502).json({ error: '로그인 확인을 하지 못했어요. 잠시 뒤 다시 해 주세요.' }); return null; }
  if (!q || q.error) { res.status(q && q.error === 'auth' ? 401 : 403).json({ error: (q && q.error) || '로그인 확인 실패' }); return null; }
  return q;
}

// Claude 부르기 — 서버가 붐비면(429·5xx·529) 잠깐 쉬었다가 한 번 더. 함수 제한 시간(60초)을 넘지 않게 앞 시도가 길었으면 다시 하지 않음
const wait = ms => new Promise(z => setTimeout(z, ms));
async function call(payload) {
  const { ANTHROPIC_API_KEY, INTERVIEW_MODEL } = process.env;
  const t0 = Date.now();
  for (let k = 0; ; k++) {
    let r, j;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ model: INTERVIEW_MODEL || 'claude-sonnet-5-5' }, payload))
      });
      j = await r.json().catch(() => ({}));
    } catch (e) { r = { ok: false, status: 0 }; j = { error: { message: e.message } }; }
    if (r.ok) return j;
    const msg = (j && j.error && j.error.message) || `status ${r.status}`;
    const busy = r.status === 0 || r.status === 429 || r.status >= 500;
    if (busy && k < 2 && Date.now() - t0 < 20000) { await wait(1500 * (k + 1)); continue; }
    const err = new Error(msg); err.status = r.status; err.busy = busy; throw err;
  }
}

// 결과를 정해진 모양으로 받기 — 태그 형식(<title>…</title>)이라 따옴표·줄바꿈이 많아도 깨지지 않음
const untag = (raw, k) => { const m = raw.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`)); return m ? m[1].trim() : null; };
async function claudeJSON({ system, messages, max_tokens = 3000, schema }) {
  const keys = Object.keys(schema);
  const fmt = keys.map(k => schema[k] === 'scenes' ? '<scene><text>장면 글</text><pic>그림 묘사</pic></scene>  (장면 수만큼 반복)' : `<${k}>…</${k}>`).join('\n');
  const sys = system + `\n\n출력 형식(가장 중요): 위에 적힌 JSON 형식은 쓰지 말고 아래 태그 형식으로만 출력합니다. 태그 밖에는 아무것도 쓰지 않습니다. 글 안의 따옴표·줄바꿈은 그대로 씁니다.\n${fmt}`;
  const j = await call({ max_tokens, system: sys, messages });
  const raw = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const out = {}; let found = 0;
  keys.forEach(k => {
    if (schema[k] === 'scenes') { out[k] = [...raw.matchAll(/<scene>([\s\S]*?)(?:<\/scene>|$)/g)].map(m => ({ text: untag(m[1], 'text') || '', pic: untag(m[1], 'pic') || '' })).filter(x => x.text); if (out[k].length) found++; }
    else { const v = untag(raw, k); out[k] = v || ''; if (v) found++; }
  });
  if (found) return out;
  try { return parseJSON(raw); } catch { const e = new Error(`형식 없음 (${j.stop_reason || ''}) ${raw.slice(0, 40)}`); e.status = 'fmt'; throw e; }
}

async function claude({ system, messages, max_tokens = 1500 }) {
  const j = await call({ max_tokens, system, messages });
  let text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  // 길이 제한에 걸려 문장 중간에서 끊겼으면 마지막으로 끝난 문장까지만 남김
  if (j.stop_reason === 'max_tokens') {
    const m = text.match(/^[\s\S]*[.?!。？！](?=\s|$)|^[\s\S]*(?:요|다|까)[.?!]?(?=\s|$)/);
    if (m && m[0].length > text.length * 0.4) text = m[0].trim();
  }
  return text;
}

const parseJSON = raw => {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}'); const s = raw.slice(a, b + 1);
  try { return JSON.parse(s); }
  catch { // 문자열 안의 그냥 줄바꿈을 \n으로 바꿔 한 번 더
    let out = '', inS = false, esc = false;
    for (const ch of s) { if (inS) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inS = false; else if (ch === '\n') { out += '\\n'; continue; } else if (ch === '\r') continue; } else if (ch === '"') inS = true; out += ch; }
    return JSON.parse(out);
  }
};

module.exports = { readBody, makeRpc, check, claude, claudeJSON, parseJSON };
