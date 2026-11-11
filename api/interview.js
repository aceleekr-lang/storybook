// AI 인터뷰 · 정리 · 12쪽 흐름 제안 서버 함수 (Vercel) — Claude
// 필요한 환경변수: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY  (선택: INTERVIEW_MODEL, 기본 claude-sonnet-5-5)
const { readBody, makeRpc, check, claude, claudeJSON } = require('./_sb');

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
- 여덟 번쯤 주고받았거나 한 장면이 충분히 그려졌으면, 질문 대신 "오늘 이야기로 충분히 글을 쓸 수 있겠어요. 더 이야기하고 싶은 게 있으면 들려주시고, 아니면 아래 '인터뷰 마치기'를 눌러 주세요."처럼 마무리를 권합니다.
- 상대가 "그만", "끝", "다 했어요"처럼 끝내고 싶다고 하면 더 묻지 말고, 들려준 이야기에 고마움을 한 문장으로 전한 뒤 '인터뷰 마치기'를 눌러 달라고 안내합니다.
- 답은 꼭 완결된 문장으로 끝냅니다. 세 문장을 넘기지 않습니다.
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

const ESSAY = `당신은 주민의 구술을 짧은 수필로 옮겨 적는 편집자입니다. 아래 인터뷰에서 참여자가 들려준 이야기로, 참여자가 직접 쓴 것처럼 읽히는 1인칭("나") 수필 한 편을 씁니다.

지킬 것
- 인터뷰에 나온 사실만 씁니다. 장소·사람·연도·사건을 새로 지어내지 않습니다. 모르는 부분은 비워 두거나 흐릿하게 둡니다.
- 참여자의 표현, 사투리, 입말을 되도록 그대로 살립니다.
- 자연스러운 한국어로 씁니다. 번역투("~하는 것이었다", "~에 있어서", "그것은 마치 ~와도 같았다"), 같은 말 되풀이, 과장된 감탄, 억지 교훈, "소중한 추억", "잊지 못할" 같은 뻔한 표현을 피합니다.
- 보이고 들리고 냄새나던 것 같은 구체적인 장면으로 씁니다. 마지막 문단은 담백하게 지금의 나로 돌아와 끝냅니다.
- 길이는 책 한 쪽 분량인 공백 포함 600~720자, 문단 3~4개. 문단 사이는 빈 줄 하나. 750자를 넘기지 않습니다.
- 제목은 15자 안팎으로, "추억"·"그리움" 같은 막연한 말보다 글 속 장면이나 사물로 짓습니다. 예) 계곡물은 발끝부터 차가웠다, 철길 옆 붕어빵
- 다른 말 없이 JSON 하나만 출력: {"title":"수필 제목 (15자 안팎)","essay":"본문"}`;

const FIT = n => `아래 수필을 공백 포함 ${n}자 이내로 줄입니다. 글쓴이의 표현과 문장은 최대한 그대로 두고, 덜 중요한 문장과 꾸밈말만 덜어냅니다. 새 내용은 넣지 않습니다. 문단은 3~4개로 두고 문단 사이는 빈 줄 하나. 다른 말 없이 JSON 하나만 출력: {"essay":"본문"}`;

const STORY = (n, full) => `당신은 주민과 함께 그림책을 만드는 동화 작가입니다. 참여자가 준 설정으로 경상남도 밀양시 가곡동을 배경으로 한 짧은 상상 이야기를 씁니다.

지킬 것
- 참여자가 준 설정(상상 카드, 주인공, 장소, 사건, 결말)을 중심으로 씁니다. 빈 칸은 이야기에 어울리게 채우되 설정에서 벗어나지 않습니다.
- 장면은 ${n}개입니다. ${n === 2 ? '1장면은 시작과 사건, 2장면은 해결과 끝.' : '한 장면 안에서 시작부터 끝까지.'}
- 이야기는 안정적인 서사 구조(발단→전개→위기·절정→결말)로 끝까지 완결합니다. 결말을 서둘러 몰아치지 말고, 단계마다 장면을 충분히 줍니다. 중간에 끊거나 '계속' 같은 말로 끝내지 않습니다.
- 장면마다 text(${full ? '분량 제한 없이 그 장면에 필요한 만큼 충분히(길어져도 괜찮음), 문단 사이 빈 줄 하나' : '책 한 쪽 분량, 공백 포함 400~550자, 문단 2~3개, 문단 사이 빈 줄 하나'})와 pic(그 장면의 세로 그림 묘사, 60~90자)을 씁니다.
- pic에는 누가·어디서·무엇을 하는지, 시간과 분위기를 그림으로 보이는 것만 적습니다. 글자·간판 글씨는 넣지 않습니다.
- 따뜻하고 쉬운 문장으로, 소리 내어 읽기 좋게 씁니다. 번역투, 뻔한 교훈, 과장된 감탄은 피합니다.
- 실존 인물, 유명 만화·영화 캐릭터, 상표는 쓰지 않습니다.
- 제목은 12자 안팎.
- 다른 말 없이 JSON 하나만 출력: {"title":"...","scenes":[{"text":"...","pic":"..."}]}`;

const INTRO = `참여자가 1회차 수업에 적은 자기소개 메모로, 책에 실을 자기소개 글을 1인칭("나")으로 씁니다.
- 공백 포함 180~260자, 문단 1~2개. 문단 사이 빈 줄 하나. (같은 쪽 아래에 동네 그림 지도가 들어가요)
- 메모에 있는 사실만 씁니다. 지어내지 않습니다. 자랑이나 과장 없이 담백하게, 참여자의 말투를 살립니다.
- 다른 말 없이 JSON 하나만 출력: {"text":"..."}`;

// ---- 4회차 사진 이야기 · 5회차 자유 주제 · 요약 ----
const LEN = { p1: '책 한 쪽 분량(공백 포함 600~720자)', p2: '책 두 쪽 분량(공백 포함 1,300~1,450자)', full: '분량 제한 없음. 길어져도 괜찮으니(보통 2,000~4,000자) 서사를 충분히 펼친다' };
const FORMS = { 수필: '1인칭 수필', 산문: '자유로운 산문', 동화: '아이도 읽을 수 있는 동화', 시: '시(연과 행을 나누어, 줄바꿈으로 행을 표시)', 이야기: '이야기' };
const PQ = `당신은 주민이 가져온 사진 한 장으로 이야기를 끌어내는 다정한 인터뷰어입니다. 사진을 잘 보고, 참여자가 적은 메모와 지금까지의 문답을 참고해 그 사진의 이야기를 구체화할 질문 8개를 만듭니다.
- 사진에 보이는 것(사람·장소·물건·계절·빛)을 짚어서 묻습니다. 예) "왼쪽에 서 있는 분은 누구인가요?"
- 언제·어디서·누구와·무슨 일이 있었는지, 사진 찍기 전과 후, 그때의 소리·냄새·날씨·마음, 사진 속 사람과의 사이, 지금 다시 보니 드는 생각을 골고루 묻습니다. 쉬운 질문부터 깊은 질문 순서로.
- 이미 대답한 것은 다시 묻지 않습니다. 한 질문은 한 문장, 쉽고 공손하게("당신"이라고 부르지 말고 주어 없이).
- 사진에 실존 유명인이 있어도 누구인지 추측하지 않습니다.`;
const PSTORY = (len, form, mine) => `당신은 주민의 사진과 이야기를 책에 실을 글로 옮기는 편집자입니다. ${mine ? `참여자가 직접 쓴 <내 초안>을 뼈대로 삼아, 사진과 메모·문답의 내용을 더해 ${FORMS[form] || '이야기'} 한 편으로 구체화합니다.
- <내 초안>의 사건 순서·표현·문장·말투를 최대한 그대로 살리고, 빠진 장면·묘사·마음을 문답에서 찾아 채웁니다. 초안에 없는 큰 사건을 새로 만들지 않습니다.` : `사진, 참여자의 메모와 문답을 바탕으로 ${FORMS[form] || '이야기'} 한 편을 씁니다.`}
- 문답과 메모에 나온 사실을 중심으로 씁니다. 장소·사람·연도·사건을 새로 지어내지 않습니다(동화·시는 상상을 더해도 됩니다).
- 참여자의 말투와 표현을 살리고, 사진 속 장면이 눈에 보이듯 씁니다.
- 서사 구조를 안정적으로 갖춥니다: 발단(때·곳·사람 소개) → 전개(일이 벌어지고 쌓임) → 위기·절정(마음이 가장 크게 움직이는 장면) → 결말(여운이 남는 마무리). 단계마다 장면과 묘사를 충분히 주고, 결말을 서둘러 몇 문장으로 몰아서 끝내지 않습니다.
- 분량: ${LEN[len] || LEN.full}. ${len === 'full' ? '분량을 아끼지 말고, 결말에 이르기까지 필요한 장면을 모두 씁니다. 결말도 한 문단 이상으로 차분히 씁니다.' : '분량 안에서 네 단계의 비중을 고르게 나누고, 결말까지 자연스럽게 이어지게 씁니다.'}
- 번역투, 뻔한 교훈, 과장된 감탄, "소중한 추억" 같은 말은 피합니다. 문단 사이는 빈 줄 하나.
- 제목은 15자 안팎으로 글 속 장면이나 사물로 짓습니다.`;
const SHRINK = target => `아래 글을 ${target === 'p1' ? '책 한 쪽(공백 포함 650자 이내)' : target === 'p2' ? '책 두 쪽(공백 포함 1,400자 이내)' : '책 네 쪽(공백 포함 2,800자 이내)'}에 들어가게 줄입니다.
- 이야기의 서사 구조(발단·전개·절정·결말)가 그대로 보이게 남깁니다. 결말을 잘라 내거나 한 문장으로 뭉뚱그리지 않습니다.
- 글쓴이의 표현과 문장을 최대한 그대로 쓰고, 덜 중요한 문장과 꾸밈말을 덜어냅니다. 새 내용은 넣지 않습니다.
- 문단 사이는 빈 줄 하나.`;

const clip = (s, n) => String(s || '').slice(0, n);
const photoPart = (url, sbUrl) => { try { const u = new URL(String(url || '')); if (u.protocol === 'https:' && u.host === new URL(sbUrl).host) return [{ type: 'image', source: { type: 'url', url: u.href } }]; } catch { /* 사진 없음 */ } return []; };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST로만 부를 수 있어요.' }); return; }
  const { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'AI 서버 설정(환경변수)이 비어 있어요. 운영자에게 알려 주세요.' }); return;
  }
  const body = readBody(req);
  const mode = ['ask', 'sum', 'plan', 'essay', 'fit', 'story', 'intro', 'pq', 'pstory', 'pmore', 'shrink'].includes(body.mode) ? body.mode : 'ask';
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
      out = { text: clip(await claude({ system: ASK, messages: conv, max_tokens: 1200 }), 800) };
    } else if (mode === 'sum') {
      if (msgs.filter(m => m.r === 'me').length < 1) { res.status(400).json({ error: '정리할 대답이 아직 없어요.' }); return; }
      const talk = msgs.map(m => `${m.r === 'ai' ? '질문' : '대답'}: ${m.t}`).join('\n');
      const j = await claudeJSON({ system: SUM, messages: [{ role: 'user', content: `<인터뷰>\n${talk}\n</인터뷰>` }], max_tokens: 3000, schema: { summary: 1, topic: 1, reader: 1, message: 1, missing: 1 } });
      out = { summary: clip(j.summary, 3000), topic: clip(j.topic, 200), reader: clip(j.reader, 200), message: clip(j.message, 300), missing: clip(j.missing, 300) };
    } else if (mode === 'fit') {
      const essay = clip(body.essay, 4000), max = Math.max(300, Math.min(1800, +body.max || 600));
      if (essay.replace(/\s/g, '').length < 50) { res.status(400).json({ error: '줄일 글이 없어요.' }); return; }
      const j = await claudeJSON({ system: FIT(max), messages: [{ role: 'user', content: `<수필>\n${essay}\n</수필>` }], max_tokens: 3000, schema: { essay: 1 } });
      out = { essay: clip(j.essay, 3000) };
    } else if (mode === 'story') {
      const n = +body.scenes === 2 ? 2 : 1;
      const set = [['상상 카드', body.card], ['떠오른 한 줄', body.idea], ['주인공', body.who], ['장소', body.where], ['무슨 일', body.what], ['어떻게 끝날까', body.ending]]
        .filter(([, x]) => String(x || '').trim()).map(([k, x]) => `${k}: ${clip(x, 300)}`).join('\n');
      if (set.replace(/\s/g, '').length < 6) { res.status(400).json({ error: '상상 카드를 고르거나 이야기 씨앗을 한 칸 이상 적어 주세요.' }); return; }
      const j = await claudeJSON({ system: STORY(n, body.len === 'full'), messages: [{ role: 'user', content: set }], max_tokens: body.len === 'full' ? 7000 : 4000, schema: { title: 1, scenes: 'scenes' } });
      out = { title: clip(j.title, 40), scenes: (Array.isArray(j.scenes) ? j.scenes : []).slice(0, n).map(x => ({ text: clip(x && x.text, 4000), pic: clip(x && x.pic, 300) })) };
    } else if (mode === 'pq' || mode === 'pstory' || mode === 'pmore') {
      const img = photoPart(body.photo, SUPABASE_URL);
      const qa = (Array.isArray(body.qa) ? body.qa : []).filter(x => x && (x.q || x.a)).slice(0, 20).map(x => `질문: ${clip(x.q, 300)}\n대답: ${clip(x.a, 1500) || '(아직 없음)'}`).join('\n\n');
      const mine = clip(body.draft, 6000).trim();
      const info = [body.memo && `참여자 메모: ${clip(body.memo, 1500)}`, qa && `<문답>\n${qa}\n</문답>`, mode !== 'pq' && mine && `<내 초안>\n${mine}\n</내 초안>`].filter(Boolean).join('\n\n');
      if (!img.length && info.replace(/\s/g, '').length < 6) { res.status(400).json({ error: '사진을 올리거나 메모를 조금 적어 주세요.' }); return; }
      const content = [...img, { type: 'text', text: (img.length ? '' : '(사진 없이) ') + (info || '사진을 보고 시작해 주세요.') }];
      if (mode === 'pq') {
        const j = await claudeJSON({ system: PQ, messages: [{ role: 'user', content }], max_tokens: 2000, schema: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1, q8: 1 } });
        out = { qs: [j.q1, j.q2, j.q3, j.q4, j.q5, j.q6, j.q7, j.q8].map(x => clip(x, 200).trim()).filter(Boolean) };
      } else {
        const len = ['p1', 'p2', 'full'].includes(body.len) ? body.len : 'full';
        if (mode === 'pmore') { // 길어서 멈춘 글을 이어서 결말까지
          const sofar = clip(body.text, 14000);
          const j = await claudeJSON({ system: PSTORY(len, body.form, mine) + `\n\n지금은 이어 쓰기입니다. 제목은 「${clip(body.title, 60)}」입니다. 아래 <앞부분>은 이미 쓴 글입니다. 앞부분을 되풀이하지 말고, 끊긴 바로 다음 글자부터 이어서 결말까지 씁니다.`,
            messages: [{ role: 'user', content: [...content, { type: 'text', text: `<앞부분>\n${sofar}\n</앞부분>` }] }], max_tokens: 5000, schema: { text: 1 } });
          out = { text: clip(j.text, 12000), more: !!j.cut };
        } else {
          const j = await claudeJSON({ system: PSTORY(len, body.form, mine), messages: [{ role: 'user', content }], max_tokens: len === 'full' ? 5000 : 4000, schema: { title: 1, text: 1 } });
          out = { title: clip(j.title, 60), text: clip(j.text, 12000), more: !!j.cut };
        }
      }
    } else if (mode === 'shrink') {
      const text = clip(body.text, 9000), target = ['p1', 'p2', 'p4'].includes(body.target) ? body.target : 'p1';
      if (text.replace(/\s/g, '').length < 50) { res.status(400).json({ error: '줄일 글이 없어요.' }); return; }
      const j = await claudeJSON({ system: SHRINK(target), messages: [{ role: 'user', content: `<글>\n${text}\n</글>` }], max_tokens: 5000, schema: { text: 1 } });
      out = { text: clip(j.text, 6000) };
    } else if (mode === 'intro') {
      const memo = clip(body.memo, 1200);
      if (memo.replace(/\s/g, '').length < 4) { res.status(400).json({ error: '자기소개 메모가 없어요. "오늘 수업" 1회차 자기소개를 먼저 적어 주세요.' }); return; }
      const j = await claudeJSON({ system: INTRO, messages: [{ role: 'user', content: memo }], max_tokens: 2000, schema: { text: 1 } });
      out = { text: clip(j.text, 800) };
    } else if (mode === 'essay') {
      if (msgs.filter(m => m.r === 'me').length < 2) { res.status(400).json({ error: '수필을 쓰려면 인터뷰에서 조금 더 이야기해 주세요.' }); return; }
      const talk = msgs.map(m => `${m.r === 'ai' ? '질문' : '대답'}: ${m.t}`).join('\n');
      const extra = [body.topic && `주제: ${clip(body.topic, 300)}`, body.message && `핵심 메시지: ${clip(body.message, 300)}`].filter(Boolean).join('\n');
      const j = await claudeJSON({ system: ESSAY, messages: [{ role: 'user', content: `${extra ? extra + '\n\n' : ''}<인터뷰>\n${talk}\n</인터뷰>` }], max_tokens: 4000, schema: { title: 1, essay: 1 } });
      out = { title: clip(j.title, 60), essay: clip(j.essay, 3000) };
    } else {
      const info = `주제: ${clip(body.topic, 300)}\n독자: ${clip(body.reader, 200)}\n핵심 메시지: ${clip(body.message, 300)}\n\n<글감>\n${clip(body.summary, 4000)}\n</글감>`;
      if ([body.topic, body.reader, body.message, body.summary].join('').replace(/\s/g, '').length < 4) { res.status(400).json({ error: '주제·독자·핵심 메시지나 인터뷰 정리를 먼저 적어 주세요.' }); return; }
      const j = await claudeJSON({ system: PLAN, messages: [{ role: 'user', content: info }], max_tokens: 3000, schema: { title: 1, cover: 1, scenes: 'scenes' } });
      const scenes = (Array.isArray(j.scenes) ? j.scenes : []).slice(0, 5).map(s => ({ text: clip(s && s.text, 200), pic: clip(s && s.pic, 250) }));
      out = { title: clip(j.title, 60), cover: clip(j.cover, 250), scenes };
    }
    try { await rpc('ai_use', { kind: 'interview' }); } catch { /* 셈 실패는 결과에 영향 없음 */ }
    res.status(200).json(out);
  } catch (e) {
    console.error('interview error', mode, e && e.status, e && e.message);
    const m = String((e && e.message) || '');
    if (e && e.status === 401) { res.status(500).json({ error: 'AI 키(ANTHROPIC_API_KEY)가 맞지 않아요. 운영자에게 알려 주세요.' }); return; }
    if (/credit|balance|billing/i.test(m)) { res.status(500).json({ error: 'AI 이용 금액이 부족해요. 운영자에게 알려 주세요.' }); return; }
    if (e && e.busy) { res.status(503).json({ error: 'AI 서버가 지금 붐벼요. 10초쯤 뒤 다시 눌러 주세요. 적은 내용은 그대로 남아 있어요.' }); return; }
    res.status(502).json({ error: `AI가 답을 마무리하지 못했어요. 한 번 더 눌러 주세요. 적은 내용은 그대로 남아 있어요. (확인용: ${(e && e.status) || ''} ${m.slice(0, 70)})` });
  }
};
