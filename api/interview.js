// AI 인터뷰 · 정리 · 12쪽 흐름 제안 서버 함수 (Vercel) — Claude
// 필요한 환경변수: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY  (선택: INTERVIEW_MODEL, 기본 claude-sonnet-5-5)
const { readBody, makeRpc, check, claude, parseJSON } = require('./_sb');

const ASK = `당신은 밀양시 가곡동 상상창고에서 열리는 「AI를 활용한 가곡동 이야기 책 만들기」 수업의 인터뷰 진행자입니다.
참여자는 여러 나이대의 성인이고, 가곡동(또는 자기가 살아온 동네)의 장소·사람·일상에 얽힌 기억으로 12쪽짜리 이야기책을 만듭니다.
당신의 일은 질문을 던져 기억을 꺼내 주는 것입니다. 이야기를 대신 지어 주지 않습니다.

규칙
- 상대를 부를 때는 "당신"이라고 합니다. "어르신", "선생님", "할머니", "할아버지", "고객님" 같은 호칭이나 나이를 짐작한 말은 쓰지 않습니다. 호칭 없이 말해도 됩니다.
- 한 번에 질문은 딱 하나. 짧고 쉬운 존댓말로, 두세 문장 안에서 끝냅니다.
- 먼저 상대가 한 말을 한 구절로 짧게 받아 주고(따라 말하기·공감), 이어서 질문합니다. 칭찬을 부풀리지 않습니다.
- 질문은 구체적인 장면으로 좁혀 갑니다: 언제(계절·나이·연도), 어디(골목·가게·집 안), 누구(이름·관계·생김새), 무엇을 보고·듣고·냄새 맡았는지, 그때 마음, 지금 생각하면 어떤지.
- 대답이 짧으면 고를 수 있게 예시 두세 개를 붙여 묻습니다. 대답이 길면 그중 가장 생생한 한 부분을 골라 더 묻습니다.
- 사투리·옛말은 그대로 받아들입니다. 장소·인물·연도는 지어내지 않고, 확실하지 않으면 물어봅니다.
- 상대가 힘든 기억을 꺼내면 더 캐묻지 말고, 이야기하고 싶은 만큼만 해도 된다고 말한 뒤 다른 쪽으로 질문을 돌립니다.
- 대여섯 번 주고받은 뒤에는 가끔 "지금까지 이야기로 정리해 볼까요, 더 이야기해 볼까요?"라고 물어도 됩니다.
- 질문만 출력합니다. 머리말·목록·따옴표 없이.`;

const SUM = `당신은 이야기책 수업의 글쓰기 선생님입니다. 아래 인터뷰 대화를 읽고 참여자가 책을 쓸 수 있게 글감을 정리합니다.
- 참여자가 실제로 한 말만 씁니다. 없는 사실을 보태지 않습니다. 참여자의 표현·사투리를 살립니다.
- 다른 말 없이 JSON 하나만 출력합니다:
{"summary":"글감 정리. 장소·때·사람·장면·그때 마음을 짧은 문단 3~5개로. 각 문단은 줄바꿈으로 나눔",
 "topic":"이 이야기의 주제 한 줄 제안",
 "reader":"이 이야기를 읽으면 좋을 독자 제안 (짧게)",
 "message":"독자에게 전할 핵심 메시지 한 문장 제안",
 "missing":"더 물어보면 좋을 것 한두 가지 (짧게)"}`;

const PLAN = `당신은 12쪽 그림책 구성을 돕는 편집자입니다. 참여자의 주제·독자·핵심 메시지와 글감을 보고, 글 쪽 5개와 그림 쪽 5개가 번갈아 나오는 흐름을 제안합니다.
- 글감에 있는 사실만 씁니다. 지어내지 않습니다. 글감이 모자라면 장면 메모 끝에 "(더 떠올려 보기)"를 붙입니다.
- 장면 1~5는 시간·감정이 흘러가도록 순서를 잡고, 마지막 장면은 핵심 메시지로 닫습니다.
- text: 그 글 쪽에 쓸 내용 메모 (40자 안팎, 참여자가 직접 쓸 수 있게 방향만).
- pic: 바로 옆 그림 쪽에 그릴 장면 묘사 (60자 안팎, 누가·어디서·무엇을·계절·분위기, 글자 없이 그림으로 보이는 것만).
- cover: 제목면 그림 장면 묘사 (60자 안팎). title: 책 제목 제안 (15자 안팎).
- 다른 말 없이 JSON 하나만 출력: {"title":"...","cover":"...","scenes":[{"text":"...","pic":"..."}, ... 5개]}`;

const clip = (s, n) => String(s || '').slice(0, n);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST로만 부를 수 있어요.' }); return; }
  const { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'AI 서버 설정(환경변수)이 비어 있어요. 운영자에게 알려 주세요.' }); return;
  }
  const body = readBody(req);
  const mode = ['ask', 'sum', 'plan'].includes(body.mode) ? body.mode : 'ask';
  // msgs: [{r:'ai'|'me', t:'...'}] — 최근 40개만
  const msgs = (Array.isArray(body.msgs) ? body.msgs : []).filter(m => m && m.t).slice(-40).map(m => ({ r: m.r === 'ai' ? 'ai' : 'me', t: clip(m.t, 2000) }));
  const seed = clip(body.seed, 300);

  const rpc = makeRpc(body.token);
  const q = await check(res, rpc, 'interview', body.owner);
  if (!q) return;

  try {
    let out;
    if (mode === 'ask') {
      // Claude 대화는 user로 시작하고 번갈아야 함 → 시작 안내를 user로 두고 같은 쪽이 이어지면 합침
      const conv = [{ role: 'user', content: seed ? `인터뷰를 시작해 주세요. 제가 이야기하고 싶은 기억: ${seed}` : '인터뷰를 시작해 주세요. 가곡동이나 제가 살아온 동네의 기억을 이야기하고 싶어요.' }];
      for (const m of msgs) {
        const role = m.r === 'ai' ? 'assistant' : 'user';
        const last = conv[conv.length - 1];
        if (last.role === role) last.content += '\n' + m.t; else conv.push({ role, content: m.t });
      }
      if (conv[conv.length - 1].role === 'assistant') conv.push({ role: 'user', content: '(다음 질문을 해 주세요)' });
      out = { text: clip(await claude({ system: ASK, messages: conv, max_tokens: 400 }), 600) };
    } else if (mode === 'sum') {
      if (msgs.filter(m => m.r === 'me').length < 1) { res.status(400).json({ error: '정리할 대답이 아직 없어요.' }); return; }
      const talk = msgs.map(m => `${m.r === 'ai' ? '질문' : '대답'}: ${m.t}`).join('\n');
      const j = parseJSON(await claude({ system: SUM, messages: [{ role: 'user', content: `<인터뷰>\n${talk}\n</인터뷰>` }], max_tokens: 1500 }));
      out = { summary: clip(j.summary, 3000), topic: clip(j.topic, 200), reader: clip(j.reader, 200), message: clip(j.message, 300), missing: clip(j.missing, 300) };
    } else {
      const info = `주제: ${clip(body.topic, 300)}\n독자: ${clip(body.reader, 200)}\n핵심 메시지: ${clip(body.message, 300)}\n\n<글감>\n${clip(body.summary, 4000)}\n</글감>`;
      if ([body.topic, body.reader, body.message, body.summary].join('').replace(/\s/g, '').length < 4) { res.status(400).json({ error: '주제·독자·핵심 메시지나 인터뷰 정리를 먼저 적어 주세요.' }); return; }
      const j = parseJSON(await claude({ system: PLAN, messages: [{ role: 'user', content: info }], max_tokens: 1500 }));
      const scenes = (Array.isArray(j.scenes) ? j.scenes : []).slice(0, 5).map(s => ({ text: clip(s && s.text, 200), pic: clip(s && s.pic, 250) }));
      out = { title: clip(j.title, 60), cover: clip(j.cover, 250), scenes };
    }
    try { await rpc('ai_use', { kind: 'interview' }); } catch { /* 셈 실패는 결과에 영향 없음 */ }
    res.status(200).json(out);
  } catch (e) {
    console.error('interview error', e && e.message);
    res.status(502).json({ error: 'AI가 잠깐 답하지 못했어요. 조금 뒤 다시 눌러 주세요.' });
  }
};
