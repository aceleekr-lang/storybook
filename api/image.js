// AI 그림 만들기 서버 함수 (Vercel) — OpenAI 이미지 API(ChatGPT 이미지)
// 필요한 환경변수: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
// 선택: IMAGE_MODEL (기본 gpt-image-2 → 안 되면 gpt-image-1 → gpt-image-1-mini), IMAGE_QUALITY (기본 medium — low / medium / high)
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
  const style = String(body.style || '').trim().slice(0, 1200);
  const size = SIZE[body.aspect] || SIZE.portrait;
  // mode: draw(새로 그리기) · photo(올린 사진을 바탕으로 그림) · revise(만든 그림을 말로 고치기) · colorize(사진 색 되살리기) · restore(사진 선명하게)
  const mode = ['photo', 'revise', 'colorize', 'restore'].includes(body.mode) ? body.mode : 'draw';
  const src = mode === 'draw' ? '' : String(body.src || '');
  if (mode !== 'draw' && !src) { res.status(400).json({ error: '바탕이 될 사진이 없어요.' }); return; }
  if (['draw', 'revise'].includes(mode) && scene.replace(/\s/g, '').length < 4) { res.status(400).json({ error: mode === 'revise' ? '어떻게 고칠지 적어 주세요.' : '어떤 장면인지 조금 더 적어 주세요.' }); return; }
  if (scene.length > 3000) { res.status(400).json({ error: '장면 설명은 3,000자까지 적을 수 있어요.' }); return; }

  // 1) 로그인·동의·오늘 남은 장수 확인 (차감은 성공했을 때만)
  const rpc = makeRpc(body.token);
  const q = await check(res, rpc, 'image', body.owner);
  if (!q) return;

  // 2) 바탕 사진 불러오기 (data:URL 또는 우리 Supabase 저장소 주소만)
  let srcBlob = null;
  if (src) {
    try {
      if (src.startsWith('data:image/')) { const m = src.match(/^data:(image\/[\w+]+);base64,(.+)$/); srcBlob = new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }); }
      else {
        const u = new URL(src), sb = new URL(SUPABASE_URL);
        if (u.protocol !== 'https:' || u.host !== sb.host) throw new Error('host');
        const r = await fetch(u); if (!r.ok) throw new Error('fetch ' + r.status);
        srcBlob = new Blob([Buffer.from(await r.arrayBuffer())], { type: r.headers.get('content-type') || 'image/jpeg' });
      }
      if (srcBlob.size > 20e6) throw new Error('too big');
    } catch (e) { console.error('src error', e && e.message); res.status(400).json({ error: '바탕 사진을 불러오지 못했어요. 사진을 다시 올려 주세요.' }); return; }
  }
  const KEEP = '지킬 것: 그림 안에 글자·숫자·간판 글씨·말풍선·서명·워터마크를 넣지 않는다. 실존 유명인의 얼굴을 그리지 않는다.';
  const prompt = mode === 'photo' ? [
    '첨부한 사진을 바탕으로, 한국 밀양시 가곡동 주민들이 만드는 동네 이야기책의 삽화로 다시 그린다. 사진 속 장소·사람의 배치·구도·분위기는 살리고, 사진이 아니라 손으로 그린 그림처럼 표현한다.',
    style ? `그림체: ${style}` : '그림체: 따뜻하고 부드러운 그림책 삽화.',
    scene ? `더 바라는 점: ${scene}` : '', KEEP
  ].filter(Boolean).join('\n\n') : mode === 'revise' ? [
    '첨부한 그림을 아래 요청대로 고친다. 요청하지 않은 부분(그림체·구도·인물·색감)은 최대한 그대로 둔다.',
    `고칠 점: ${scene}`, KEEP
  ].join('\n\n') : mode === 'colorize' ? [
    '첨부한 옛 사진(흑백이거나 색이 바랜 사진)에 그 시대에 맞는 자연스러운 색을 입혀 복원한다. 사람 얼굴·몸짓·옷·배경·구도는 바꾸지 않고, 그림처럼 바꾸지 말고 사진 그대로의 질감을 유지한다. 새 사람이나 물건을 더하지 않는다.',
    scene ? `참고: ${scene}` : ''
  ].filter(Boolean).join('\n\n') : mode === 'restore' ? [
    '첨부한 사진을 선명하게 복원한다. 흐림·흔들림·잡티·긁힘·접힌 자국을 줄이고 초점을 또렷하게 한다. 사람 얼굴·표정·구도·색은 바꾸지 않고 사진 그대로의 질감을 유지한다. 새 사람이나 물건을 더하지 않는다.',
    scene ? `참고: ${scene}` : ''
  ].filter(Boolean).join('\n\n') : [
    '한국 경상남도 밀양시 가곡동 주민들이 함께 만드는 동네 이야기책의 삽화.',
    style ? `그림체: ${style}` : '그림체: 따뜻하고 부드러운 그림책 삽화.',
    scene.length > 500 ? `장면: 아래 글에서 가장 잘 어울리는 한 장면을 골라 그린다.\n<글>\n${scene}\n</글>` : `장면: ${scene}`,
    '지킬 것: 그림 안에 글자·숫자·간판 글씨·말풍선·서명·워터마크를 넣지 않는다. 실존 유명인의 얼굴을 그리지 않는다. 책 한 쪽에 들어갈 한 장면만 그린다.'
  ].join('\n\n');
  // 한 모델로 그려 보기. 실패하면 { err } 를 돌려줌
  const DALLE = { portrait: '1024x1792', landscape: '1792x1024', square: '1024x1024' };
  async function draw(model) {
    const gi = /^gpt-image/.test(model);
    const req1 = { model, prompt, n: 1, size: srcBlob && mode !== 'photo' ? 'auto' : gi ? size : (DALLE[body.aspect] || DALLE.portrait) }; // 고치기·복원은 원래 사진 비율 그대로
    if (gi) Object.assign(req1, { quality: IMAGE_QUALITY || 'medium', output_format: 'jpeg', output_compression: 90 });
    else Object.assign(req1, { response_format: 'b64_json', quality: 'standard' });
    try {
      let r, j;
      for (let k = 0; k < 4; k++) {
        if (srcBlob) { // 바탕 그림이 있으면 '그림 고치기(edits)'
          const fd = new FormData();
          Object.entries(req1).forEach(([k, v]) => fd.append(k, String(v)));
          fd.append('image', srcBlob, srcBlob.type === 'image/png' ? 'src.png' : 'src.jpg');
          r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: fd });
        } else r = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req1)
        });
        j = await r.json().catch(() => ({}));
        // 이 모델이 모르는 설정이 있으면 그 설정만 빼고 다시 (예: Unknown parameter: 'output_compression')
        const e = (j && j.error) || {}, bad = e.param || ((String(e.message || '').match(/parameter:? ?'([\w.]+)'/i) || [])[1]);
        if (!r.ok && r.status === 400 && bad && bad in req1 && !['model', 'prompt', 'image'].includes(bad)) { // 모르는 설정·맞지 않는 값은 빼고 다시
          console.error('image param dropped', model, bad); delete req1[bad]; continue;
        }
        break;
      }
      if (!r.ok) {
        const code = (j && j.error && (j.error.code || j.error.type)) || '', msg = (j && j.error && j.error.message) || `status ${r.status}`;
        console.error('image error', model, r.status, code, msg);
        return { err: { status: r.status, code, msg } };
      }
      const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
      return b64 ? { b64, mime: req1.output_format === 'jpeg' ? 'image/jpeg' : 'image/png' } : { err: { status: 0, code: 'empty', msg: '빈 응답' } };
    } catch (e) { console.error('image error', model, e && e.message); return { err: { status: 0, code: 'net', msg: String(e && e.message) } }; }
  }
  // 쓸 수 있는 모델을 차례로 (DALL·E는 2026년 5월 종료). 환경변수 IMAGE_MODEL이 있으면 그것부터
  const chain = [...new Set([IMAGE_MODEL, 'gpt-image-2', 'gpt-image-1', 'gpt-image-1-mini'].filter(m => m && !/^dall-e/.test(m)))];
  let out, errs = [];
  for (const m of chain) {
    out = await draw(m);
    if (!out.err) break;
    errs.push(`${m}: ${out.err.status} ${String(out.err.msg).slice(0, 60)}`);
    if (/moderation|safety|content_policy/i.test(out.err.code + out.err.msg) || out.err.status === 401 || out.err.status === 429) break; // 모델을 바꿔도 같은 결과
  }
  if (out.err) {
    const { status, code, msg } = out.err;
    if (errs.some(x => /verif/i.test(x)) && errs.every(x => /verif|does not exist|not found|404/i.test(x))) { res.status(500).json({ error: 'OpenAI 조직 인증(Verify Organization)이 아직 끝나지 않아 그림 모델을 쓸 수 없어요. 인증이 끝나면 바로 돼요.' }); return; }
    if (/moderation|safety|content_policy/i.test(code + msg)) { res.status(400).json({ error: '이 설명으로는 그림을 만들 수 없어요. 표현을 조금 바꿔서 다시 해 주세요.' }); return; }
    if (status === 401) { res.status(500).json({ error: 'AI 그림 키(OPENAI_API_KEY)가 맞지 않아요. 운영자에게 알려 주세요.' }); return; }
    if (/billing|quota|insufficient/i.test(code + msg)) { res.status(500).json({ error: 'OpenAI 이용 금액(크레딧)이 부족해요. 운영자에게 알려 주세요.' }); return; }
    if (status === 429) { res.status(503).json({ error: 'AI 그림 서버가 바빠요. 30초쯤 뒤 다시 눌러 주세요.' }); return; }
    res.status(502).json({ error: `AI 그림을 만들지 못했어요. 조금 뒤 다시 눌러 주세요. (확인용: ${errs.join(' / ').slice(0, 300)})` }); return;
  }
  const b64 = out.b64;

  // 3) 성공했을 때만 1장 셈
  let used = null;
  try { used = (await rpc('ai_use', { kind: 'image' })).used; } catch { /* 셈 실패는 결과에 영향 없음 */ }
  res.status(200).json({ b64, mime: out.mime, used, left: q.left == null ? null : Math.max(0, q.left - 1) });
};
