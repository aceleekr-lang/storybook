// 글 읽어 주기 (Vercel) — OpenAI 음성(TTS). 강사·운영자만. 실패하면 앱이 브라우저 목소리로 대신 읽음
// 필요한 환경변수: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY · 선택: TTS_MODEL, TTS_VOICE
const { readBody, makeRpc } = require('./_sb');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST로만 부를 수 있어요.' }); return; }
  const { OPENAI_API_KEY, TTS_MODEL, TTS_VOICE } = process.env;
  if (!OPENAI_API_KEY) { res.status(500).json({ error: '음성 설정(OPENAI_API_KEY)이 비어 있어요.' }); return; }
  const body = readBody(req);
  const text = String(body.text || '').trim().slice(0, 3800);
  if (text.length < 2) { res.status(400).json({ error: '읽을 글이 없어요.' }); return; }
  // 로그인한 강사·운영자인지 확인
  try { const me = await makeRpc(body.token)('me', {}); if (!me || !me.me || !['teacher', 'admin'].includes(me.me.role)) { res.status(403).json({ error: '강사·운영자만 쓸 수 있어요.' }); return; } }
  catch { res.status(502).json({ error: '로그인 확인을 하지 못했어요.' }); return; }
  const voice = TTS_VOICE || 'coral';
  const chain = [...new Set([TTS_MODEL, 'gpt-4o-mini-tts', 'tts-1'].filter(Boolean))];
  for (const model of chain) {
    const req1 = { model, voice, input: text, response_format: 'mp3' };
    if (!/^tts-1/.test(model)) req1.instructions = '따뜻하고 차분한 한국어 낭독. 동네 이야기책을 소리 내어 읽어 주듯, 문장 끝과 문단 사이에서 자연스럽게 쉬어 갑니다. 시는 행과 연 사이에 여유를 둡니다.';
    try {
      const r = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req1) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); console.error('tts error', model, r.status, j && j.error && j.error.message); if (r.status === 401) break; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Cache-Control', 'no-store'); res.status(200).send(buf); return;
    } catch (e) { console.error('tts error', model, e && e.message); }
  }
  res.status(502).json({ error: 'AI 목소리를 만들지 못했어요. 브라우저 목소리로 읽을게요.' });
};
