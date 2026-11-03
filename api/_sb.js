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

async function claude({ system, messages, max_tokens = 1500 }) {
  const { ANTHROPIC_API_KEY, INTERVIEW_MODEL } = process.env;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: INTERVIEW_MODEL || 'claude-sonnet-5-5', max_tokens, system, messages })
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && j.error.message) || `status ${r.status}`);
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
}

const parseJSON = raw => { const a = raw.indexOf('{'), b = raw.lastIndexOf('}'); return JSON.parse(raw.slice(a, b + 1)); };

module.exports = { readBody, makeRpc, check, claude, parseJSON };
