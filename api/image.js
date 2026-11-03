// AI 그림 만들기 서버 함수 (Vercel) — OpenAI 이미지 API(ChatGPT 이미지)
// 필요한 환경변수: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
// 선택: IMAGE_MODEL (기본 gpt-image-1), IMAGE_QUALITY (기본 medium — low / medium / high)
const { readBody, makeRpc, check } = require('./_sb');

const SIZE = { portrait: '1024x1536', landscape: '1536x1024', square: '1024x1024' };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST로만 부를 수 있어요.' }); return; }
  const { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, IMAGE_MODEL, IMAGE_QUALITY } = process.env;
  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'AI 그림 서버 설정(OPENAI_API_KEY 등 환경변수)이 비어 있어요. 운영자에게 알려 주세요.' }); return;
  }
  const body = readBody(req);
  const scene = String(body.prompt || '').trim();
  const style = String(body.style || '').trim().slice(0, 600);
  const size = SIZE[body.aspect] || SIZE.portrait;
  if (scene.replace(/\s/g, '').length < 4) { res.status(400).json({ error: '어떤 장면인지 조금 더 적어 주세요.' }); return; }
  if (scene.length > 1200) { res.status(400).json({ error: '장면 설명은 1,200자까지 적을 수 있어요.' }); return; }

  // 1) 로그인·동의·오늘 남은 장수 확인 (차감은 성공했을 때만)
  const rpc = makeRpc(body.token);
  const q = await check(res, rpc, 'image', body.owner);
  if (!q) return;

  // 2) 그림 요청
  const prompt = [
    '한국 경상남도 밀양시 가곡동 주민들이 함께 만드는 동네 이야기책의 삽화.',
    style ? `그림체: ${style}` : '그림체: 따뜻하고 부드러운 그림책 삽화.',
    `장면: ${scene}`,
    '지킬 것: 그림 안에 글자·숫자·간판 글씨·말풍선·서명·워터마크를 넣지 않는다. 실존 유명인의 얼굴을 그리지 않는다. 책 한 쪽에 들어갈 한 장면만 그린다.'
  ].join('\n\n');
  const model = IMAGE_MODEL || 'gpt-image-1';
  const req1 = { model, prompt, size, n: 1 };
  if (/^gpt-image/.test(model)) Object.assign(req1, { quality: IMAGE_QUALITY || 'medium', output_format: 'jpeg', output_compression: 90 });
  else req1.response_format = 'b64_json';

  let b64;
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req1)
    });
    const j = await r.json();
    if (!r.ok) {
      const code = (j && j.error && (j.error.code || j.error.type)) || '';
      const msg = (j && j.error && j.error.message) || `status ${r.status}`;
      console.error('image error', r.status, code, msg);
      if (/moderation|safety|content_policy/i.test(code + msg)) {
        res.status(400).json({ error: '이 설명으로는 그림을 만들 수 없다고 해요. 표현을 조금 바꿔서 다시 해 주세요.' }); return;
      }
      if (r.status === 401) { res.status(500).json({ error: 'AI 그림 키(OPENAI_API_KEY)가 맞지 않아요. 운영자에게 알려 주세요.' }); return; }
      if (r.status === 429) { res.status(503).json({ error: 'AI 그림 서버가 바빠요(또는 충전 금액이 부족해요). 잠시 뒤 다시 해 주세요.' }); return; }
      throw new Error(msg);
    }
    b64 = j && j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) throw new Error('빈 응답');
  } catch (e) {
    console.error('image error', e && e.message);
    res.status(502).json({ error: 'AI 그림이 잠깐 안 돼요. 조금 뒤 다시 눌러 주세요.' }); return;
  }

  // 3) 성공했을 때만 1장 셈
  let used = null;
  try { used = (await rpc('ai_use', { kind: 'image' })).used; } catch { /* 셈 실패는 결과에 영향 없음 */ }
  res.status(200).json({ b64, mime: /^gpt-image/.test(model) ? 'image/jpeg' : 'image/png', used, left: q.left == null ? null : Math.max(0, q.left - 1) });
};
