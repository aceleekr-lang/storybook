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
const LEN = { dr: '아래 초안 분량을 따름', p1: '책 한 쪽 분량(공백 포함 600~720자)', p2: '책 두 쪽 분량(공백 포함 1,300~1,450자)', full: '분량 제한 없음. 길어져도 괜찮으니(보통 2,000~4,000자) 서사를 충분히 펼친다' };
const FORMS = { 수필: '1인칭 수필', 산문: '자유로운 산문', 소설: '짧은 소설(현대문학)', 동화: '아이도 읽을 수 있는 동화', 시: '시(연과 행을 나누어, 줄바꿈으로 행을 표시)', 이야기: '이야기' };
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
// ---- 5회차 마음 읽기 · 자유 주제 ----
const SAFE = `- 이것은 심리 진단이 아니라 글감을 찾는 대화입니다. 병명·증상·건강·성격 유형을 판단하거나 단정하지 않습니다. 상처를 캐묻지 않고, 대답하기 싫으면 건너뛰어도 된다는 태도로 다정하게 씁니다.`;
const MQ = `당신은 타로 카드로 글감을 함께 찾는 다정한 글쓰기 안내자입니다. 참여자가 과거·현재·미래 자리에 뽑은 타로 메이저 아르카나 세 장(전통적인 뜻과 이야기 실마리 포함)과 지금까지의 문답을 보고, 그 카드가 일깨우는 기억·사람·장소·바람을 꺼낼 질문 8개를 만듭니다.
${SAFE}
- 자리의 뜻을 살려 묻습니다. 과거 카드는 실제 지나온 기억을, 현재 카드는 지금의 마음과 일상을, 미래 카드는 바람과 상상을 묻습니다. 예) "과거 자리의 '태양'처럼 가장 환하게 웃던 날은 언제였나요?", "미래 자리의 '별'처럼 앞으로 붙잡고 싶은 희망은 무엇인가요?"
- 카드 그림에 보이는 것(별·달·태양·길·물·사람의 몸짓)도 질문 재료로 씁니다. 점이나 운세처럼 단정하지 않습니다.
- 실제 기억을 묻는 질문과 상상을 여는 질문을 섞습니다(사실과 허구가 섞인 글을 쓰기 위해).
- 쉬운 질문에서 깊은 질문 순서로, 한 질문은 한 문장, 공손하게("당신"이라고 부르지 말고 주어 없이).
- 이미 대답한 것은 다시 묻지 않습니다.`;
const MTURN = `당신은 마을 이야기책 수업에서 타로 카드로 이야기를 꺼내 주는 다정한 타로 상담가입니다. 한 번에 질문 하나씩, 대화하듯 인터뷰를 이어 갑니다. 점·운세·예언은 하지 않고, 카드는 기억과 마음을 여는 실마리로만 씁니다.
${SAFE}
- 순서: 과거 카드 → 현재 카드 → 미래 카드. 과거는 실제 지나온 기억, 현재는 지금의 마음과 일상, 미래는 바람과 상상을 묻습니다.
- 질문은 모두 5~9개. 한 카드에 최소 1개, 대답이 풍성하면 다음 카드로, 짧거나 건너뛰면 더 쉬운 질문으로 한 번 더 묻거나 다음 카드로 넘어갑니다.
- say(1~2문장):
  · 새 카드로 넘어갈 때(그 자리의 첫 질문)는 카드를 먼저 짧게 풀어 줍니다. 예) "과거 자리에 '태양'이 나왔네요. 아이가 해바라기 밭에서 활짝 웃는 그림인데, 마음껏 환했던 시절을 뜻하는 카드예요."
  · 맨 처음에는 짧은 인사 뒤에 과거 카드를 풉니다.
  · 그 밖에는 바로 앞 대답을 그분이 쓴 낱말 그대로 받아 짧게 공감합니다. 예) "할머니 댁 마루에서 먹던 수박이라니, 그 여름 소리가 들리는 것 같아요."
  · 분석·해석·평가("~한 성향이시네요", "~를 의미합니다")와 판에 박힌 칭찬("멋지네요", "좋은 대답이에요")은 쓰지 않습니다.
- q(한 문장): 바로 앞 대답에서 이어지는 구체적인 질문. 언제·누구와·어디서·무슨 소리나 냄새·그때 마음처럼 장면이 떠오르게 묻습니다. 새 카드의 첫 질문은 그 카드의 뜻이나 그림과 그분의 삶을 잇습니다. 주어("당신") 없이 공손하게.
- pos: 이번 질문의 자리(과거/현재/미래).
- done: 세 자리를 모두 물었고 글감이 충분하면 yes(최소 5개). 그러면 say에 짧은 감사와 "이제 세 장을 이어서 마음을 읽어 볼게요" 같은 마무리를 쓰고 q는 비웁니다. 아니면 no.`;
const MREAD = `당신은 다정한 타로 상담가이자 글쓰기 안내자입니다. 과거·현재·미래 자리의 타로 카드 세 장과 인터뷰 대답을 엮어, 그분의 이야기를 그분에게 들려주듯 되돌려 줍니다.
- 점·운세·예언이 아닙니다. "~할 것이다" 같은 미래 단정은 하지 않고, 카드는 이야기의 실마리로만 씁니다.
${SAFE}
- reading(4~6문장): 분석이나 해석 보고서처럼 쓰지 않습니다. "성향", "의미합니다", "보여 줍니다", "~하는 분이시군요" 같은 말을 쓰지 않습니다.
  · 그분이 실제로 한 말(낱말·장면)을 따옴표로 두세 군데 그대로 살려, 과거 → 현재 → 미래가 하나의 이야기로 이어지게 들려줍니다. 카드 이름은 자연스럽게 한 번씩만 짚습니다.
  · 예) "'태양' 카드 앞에서 떠올리신 건 '할머니 댁 마루의 수박'이었어요. 그 여름의 환한 마음이 지금 '퇴근길 철길'을 걸을 때도 문득 돌아오고, '별' 카드 앞에서는 손녀에게 그 길을 걸어 보게 하고 싶다고 하셨지요."
  · 마지막 문장은 "이 이야기를 글로 써 보면 어떨까요?"처럼 아래 주제로 자연스럽게 잇습니다.
- 주제 세 개(t1, t2, t3)를 추천합니다. 각 주제는 "제목 | 형식 | 사실 비율 | 이유" 한 줄로 씁니다.
  · 제목: 15자 안팎의 글 제목 후보
  · 형식: 시, 소설, 수필, 동화 중 하나 (소설은 짧은 현대 소설) (세 주제의 형식은 되도록 서로 다르게)
  · 사실 비율: 실제 기억과 상상의 비율. 예) 사실 70 상상 30 — 실제 기억을 뼈대로 하고 상상을 섞는 글을 권합니다
  · 이유: 어떤 카드(자리)·대답에서 왔는지 한 문장`;
const CRAFT = {
  시: '시: 연과 행을 나누고(줄바꿈으로 행, 빈 줄로 연), 3~5연. 설명하지 말고 이미지·소리·감각으로 보여 줍니다. 핵심 낱말이나 구절을 한두 번 되풀이해 울림을 줍니다. 마지막 연은 여운으로 닫습니다. 산문처럼 길게 늘어놓지 않습니다.',
  소설: '짧은 소설(현대문학): 인물 한두 명, 하나의 사건과 그 안의 갈등. 설명하지 말고 장면·행동·대화(큰따옴표)로 보여 줍니다. 1인칭이나 3인칭 중 하나로 시점을 끝까지 지킵니다. 지금의 한 장면에서 시작해 과거와 상상이 끼어들고, 전환점(마음이 바뀌는 순간)을 지나 여운이 남는 결말로 닫습니다. 교훈을 말하지 않고, 마지막 장면이 의미를 품게 합니다.',
  산문: '산문: 한 장면에서 시작해 생각이 번져 가는 글. 장면 → 떠오른 기억 → 생각의 확장 → 다시 장면으로 돌아와 닫기. 문장의 호흡을 고르게 합니다.',
  수필: '수필: 1인칭 체험을 구체적인 장면으로 보여 주고, 그 체험에서 얻은 깨달음을 억지 교훈 없이 담백하게 닫습니다. 체험(발단) → 사건의 전개 → 마음이 크게 움직이는 순간 → 지금의 나.',
  동화: '동화: 주인공(사람·동물·사물) → 주인공의 바람 → 길을 막는 시련 → 도움이나 깨달음 → 변화한 결말. 아이도 소리 내어 읽기 좋은 쉬운 문장과 의성어·의태어, 반복되는 말. 타로 카드 그림 속 사물·인물이 등장인물이나 열쇠가 되게 합니다.'
};
const RECOMPOSE = `- 문답은 받아 적을 재료가 아닙니다. 인터뷰를 하며 느낀 그분의 이야기와 마음결(무엇을 그리워하고, 무엇을 붙잡고 싶고, 어떤 빛깔의 시간을 살아왔는지)을 먼저 깊이 이해한 뒤, 그것을 문학의 언어로 새로 지어 전합니다.
- 가장 중요한 규칙: 대답에 나온 낱말은 단 하나도 그대로 쓰지 않습니다. 명사·동사·형용사·부사 모두 같은 뜻의 다른 말, 비유, 이미지, 감각으로 바꿉니다. 예) 대답 "할머니 댁 마루에서 수박을 먹었어요" → "주름진 손이 갈라 준 여름의 붉은 속살, 나무 바닥에 번지던 서늘한 그늘". 단, 사람 이름과 지명(가곡동·밀양역·순이 할머니 같은 고유명사)만은 사실이므로 그대로 둡니다.
- 문답 순서나 카드 순서대로 따라가지 않고, 대답마다 한 문단씩 늘어놓지도 않습니다.
- 아래 재구성 방식 가운데 형식과 이야기에 가장 어울리는 하나를 골라 글 전체의 축으로 삼습니다.
  · 시간 뒤집기: 지금(또는 마지막 장면)에서 시작해 과거로 거슬러 갔다가 돌아오기
  · 한 사물의 눈: 이야기 속 물건·장소가 화자가 되어 들려주기
  · 한 순간 확대: 한 장면을 크게 펼치고, 다른 기억은 그 장면 속 떠오름으로 끼워 넣기
  · 되풀이되는 감각: 하나의 소리·냄새·빛을 고리로 서로 떨어진 기억을 잇기
  · 말 걸기: 그리운 사람이나 미래의 누군가에게 건네는 편지·독백
  · 대비: 그때와 지금, 사실과 상상을 나란히 놓아 비추기
- 문학성: 설명하지 말고 보여 줍니다. 구체적인 이미지와 감각, 비유, 문장의 리듬, 여백으로 마음을 전하고, 감정을 이름 붙여 말하지("그리웠다", "행복했다") 않습니다. 누가·어디서·무엇을 했는지 같은 사실의 뼈대는 바꾸지 않습니다.`;
// 대답 속 낱말이 초안에 그대로 들어갔는지 (조사·어미를 떼고 2글자 이상, 고유명사로 보이는 말 제외)
const PROPER = /(동|역|시|읍|면|리|강|산|천|교|길|로|시장|학교|마을|공원)$/;
const STOP = new Set(['그때', '그날', '지금', '우리', '저희', '정말', '너무', '그냥', '조금', '많이', '같아', '같은', '있었', '없었', '했어', '했던', '하는', '있는', '없는', '그런', '이런', '저런', '어릴', '생각', '기억', '마음', '사람', '때문']);
const echoed = (qa, text) => { const t = String(text || ''), seen = new Set();
  (Array.isArray(qa) ? qa : []).forEach(x => String((x && x.a) || '').split(/[^가-힣A-Za-z0-9]+/).forEach(w => {
    let k = w; for (let n = 0; n < 3; n++) k = k.replace(/(에서는|에서|으로|에게|한테|까지|부터|처럼|이랑|하고|이에요|예요|에요|어요|아요|였어요|었어요|았어요|했어요|이었|였|은|는|이|가|을|를|에|의|와|과|도|만|로|요|다)$/, '');
    if (k.length >= 2 && !STOP.has(k) && !PROPER.test(k) && t.includes(k)) seen.add(k); }));
  return [...seen]; };
const F5 = f => f === '산문' ? '소설' : f; // 예전 '산문' → 짧은 소설
const DLEN = { 시: '공백 포함 600~800자, 4~6연', 소설: '공백 포함 1,300~1,600자', 수필: '공백 포함 1,000~1,400자', 동화: '공백 포함 700~1,000자' };
const FSTORY = (len, form, ratio, mine) => `당신은 주민과 함께 마을 이야기책을 만드는 글쓰기 선생님입니다. 참여자가 과거·현재·미래 자리에 뽑은 타로 카드 세 장, 문답, 정한 주제로 ${form || '수필'} 한 편을 씁니다. 배경은 경상남도 밀양시 가곡동과 참여자의 삶입니다.
${mine ? '- 참여자가 직접 쓴 <내 초안>을 뼈대로 삼아 구체화합니다. 초안의 사건 순서·표현·문장·말투를 최대한 살리고, 문답에서 장면과 마음을 찾아 채웁니다.' : RECOMPOSE}
- 형식의 짜임새를 지킵니다. ${CRAFT[form] || CRAFT['수필']}
- 사실과 허구를 섞습니다. ${ratio || '사실 70 상상 30'} 정도로, 문답에 나온 실제 기억(특히 과거·현재 카드)을 뼈대로 하고 카드에서 온 상상(특히 미래 카드)을 자연스럽게 엮습니다. 실제 사람·장소의 이름은 문답에 나온 것만 씁니다.
- 뽑은 타로 카드 세 장의 상징(그림 속 사물·빛·몸짓)과 과거→현재→미래의 흐름이 글 안에 자연스럽게 녹아들게 합니다. 카드 이름을 그대로 나열하지 않습니다.
- 분량: ${LEN[len] || LEN.full}. ${len === 'full' ? '분량을 아끼지 말고 결말까지 차근차근 씁니다.' : '분량 안에서 짜임새를 고르게 나누고 결말까지 자연스럽게 잇습니다.'} 결말을 서둘러 몰아치지 않습니다.
- 번역투, 뻔한 교훈, 과장된 감탄, "소중한 추억" 같은 말은 피합니다.
- 제목은 15자 안팎으로 글 속 장면이나 상징으로 짓습니다.`;
const MARKS = `아래 글에서 상상(허구)으로 지어낸 부분을 찾아 표시합니다. <문답>에 나온 실제 기억은 사실입니다.
- 글자는 한 글자도 바꾸지 않고, 상상으로 보이는 구절만 ⟦ 와 ⟧ 로 감쌉니다. 사실 부분은 그대로 둡니다.
- 판단이 어려우면 표시하지 않습니다.`;
const REVIEW = form => `당신은 다정하고 정확한 글쓰기 선생님입니다. 아래 ${form || ''} 글을 읽고 첨삭합니다.
- good: 이 글에서 가장 잘된 점 한 가지를 구체적으로(어느 문장이 왜 좋은지) 한두 문장.
- fix1, fix2, fix3: 고치면 좋아질 점 세 가지. 각각 "어느 부분 → 이렇게 바꿔 보기" 형식으로 짧고 구체적으로. ${form ? `${form}의 짜임새(${CRAFT[form] ? CRAFT[form].split(':')[1].slice(0, 60) : ''}…)를 기준으로 봅니다.` : ''}
- 맞춤법보다 장면·표현·짜임새를 먼저 봅니다. 글쓴이의 말투는 존중합니다.`;
const REFORM = form => `아래 글의 내용과 핵심 장면은 그대로 두고 형식만 ${form}(으)로 바꿔 다시 씁니다. ${CRAFT[form] || ''} 글쓴이의 표현을 되도록 살립니다. 제목도 형식에 맞게 다시 짓습니다.`;

const SHRINK = target => `아래 글을 ${target === 'p1' ? '책 한 쪽(공백 포함 650자 이내)' : target === 'p2' ? '책 두 쪽(공백 포함 1,400자 이내)' : target === 'p3' ? '책 세 쪽(공백 포함 2,100자 이내)' : '책 네 쪽(공백 포함 2,800자 이내)'}에 들어가게 줄입니다.
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
  const mode = ['ask', 'sum', 'plan', 'essay', 'fit', 'story', 'intro', 'pq', 'pstory', 'pmore', 'shrink', 'mq', 'mturn', 'mread', 'fdraft', 'fstory', 'fmore', 'marks', 'review', 'reform'].includes(body.mode) ? body.mode : 'ask';
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
        const j = await claudeJSON({ system: PQ, messages: [{ role: 'user', content }], max_tokens: 3000, schema: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1, q8: 1 } });
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
    } else if (['mq', 'mturn', 'mread', 'fdraft', 'fstory', 'fmore'].includes(mode)) {
      const cards = (Array.isArray(body.cards) ? body.cards : []).slice(0, 3).filter(x => x && x.name);
      const picks = cards.length ? cards.map(x => `${clip(x.pos, 6)} — ${clip(x.name, 20)}(${clip(x.en, 30)}): ${clip(x.keys, 80)} / 이야기 실마리: ${clip(x.story, 80)}`) : (Array.isArray(body.picks) ? body.picks : []).slice(0, 3).map(x => clip(x, 20)).filter(Boolean);
      const qa = (Array.isArray(body.qa) ? body.qa : []).filter(x => x && (x.q || x.a)).slice(0, 24).map(x => `${x.pos ? `[${clip(x.pos, 6)}] ` : ''}질문: ${clip(x.q, 300)}\n대답: ${clip(x.a, 1500) || '(건너뜀)'}`).join('\n\n');
      const mine = clip(body.draft, 6000).trim(), form = ['시', '소설', '수필', '동화'].includes(F5(body.form)) ? F5(body.form) : '수필';
      const ratio = clip(body.ratio, 30), len = ['p1', 'p2', 'full'].includes(body.len) ? body.len : 'full';
      if (!picks.length) { res.status(400).json({ error: '타로 카드를 먼저 뽑아 주세요.' }); return; }
      const info = [cards.length ? `뽑은 타로 카드 (과거·현재·미래 자리):\n${picks.join('\n')}` : `고른 상징 카드: ${picks.join(', ')}`, qa && `<문답>\n${qa}\n</문답>`, body.theme && `정한 주제: ${clip(body.theme, 100)}`, (mode === 'fstory' || mode === 'fmore') && mine && `<내 초안>\n${mine}\n</내 초안>`].filter(Boolean).join('\n\n');
      if (mode === 'mq') {
        const j = await claudeJSON({ system: MQ, messages: [{ role: 'user', content: info }], max_tokens: 3000, schema: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1, q8: 1 } });
        out = { qs: [j.q1, j.q2, j.q3, j.q4, j.q5, j.q6, j.q7, j.q8].map(x => clip(x, 200).trim()).filter(Boolean) };
      } else if (mode === 'mturn') { // 한 번에 한 질문씩 — 앞 대답을 받아 이어 가는 인터뷰
        const all = (Array.isArray(body.qa) ? body.qa : []).filter(x => x && x.q), n = all.length;
        const cnt = ['과거', '현재', '미래'].map(p => `${p} ${all.filter(x => x.pos === p).length}개`).join(', ');
        const last = all[n - 1];
        if (n >= 9) { out = { say: '이야기 들려주셔서 고마워요. 이제 세 장을 이어서 마음을 읽어 볼게요.', q: '', pos: '', done: true }; }
        else {
          const ask = `${info}\n\n지금까지 질문 ${n}개 (${cnt}).${last ? `\n바로 앞 질문: ${clip(last.q, 300)}\n바로 앞 대답: ${clip(last.a, 1500) || '(건너뜀)'}` : '\n아직 질문이 없습니다. 인사와 함께 과거 카드부터 시작하세요.'}${n < 5 ? '\n아직 5개가 안 되었으니 done은 no입니다.' : ''}${n >= 8 ? '\n이번이 마지막 질문이 되게 하세요.' : ''}`;
          const j = await claudeJSON({ system: MTURN, messages: [{ role: 'user', content: ask }], max_tokens: 3000, schema: { say: 1, q: 1, pos: 1, done: 1 } });
          const done = n >= 5 && /^\s*(yes|y|true|예|네)/i.test(String(j.done || '')), q = clip(j.q, 200).trim();
          out = { say: clip(j.say, 300).trim(), q: done ? '' : q, pos: ['과거', '현재', '미래'].includes(String(j.pos || '').trim()) ? String(j.pos).trim() : (last && last.pos) || '과거', done: done || !q };
        }
      } else if (mode === 'mread') {
        const j = await claudeJSON({ system: MREAD, messages: [{ role: 'user', content: info }], max_tokens: 4000, schema: { reading: 1, t1: 1, t2: 1, t3: 1 } });
        const th = [j.t1, j.t2, j.t3].map(x => String(x || '').split('|').map(y => y.trim())).filter(x => x[0]).map(([title, form, ratio, why]) => ({ title: clip(title, 40), form: ['시', '소설', '수필', '동화'].includes(F5(form)) ? F5(form) : '수필', ratio: clip(ratio, 30), why: clip(why, 200) }));
        out = { reading: clip(j.reading, 600).trim(), themes: th };
      } else if (mode === 'fdraft') { const tD = Date.now(); // 3-1 AI 초안: 참여자가 고치기 좋은 짧은 뼈대
        let j = await claudeJSON({ system: FSTORY('dr', form, ratio, '') + `\n\n지금은 '초안'입니다. 분량은 ${DLEN[form] || DLEN['수필']}. 완결된 한 편으로 씁니다. 처음·가운데·끝을 모두 갖추고, 마지막 문장까지 장면이나 여운으로 분명하게 닫습니다. 빈칸·괄호·\"(여기에 ~)\" 같은 채울 자리, 말줄임으로 끝내기, 이어질 것처럼 끊기를 하지 않습니다.\n- how: 고른 재구성 방식과 축을 한 줄로. 예) "시간 뒤집기 — 오늘 철길에서 시작해 할머니 댁 여름으로"${body.prevHow ? `\n- 지난번 초안은 '${clip(body.prevHow, 80)}' 방식이었습니다. 이번에는 다른 재구성 방식을 고릅니다.` : ''}`,
          messages: [{ role: 'user', content: info }], max_tokens: 4000, schema: { title: 1, how: 1, text: 1 } });
        if (!String(j.text || '').trim()) { j = await claudeJSON({ system: FSTORY('dr', form, ratio, '') + `\n\n지금은 '초안'입니다. 분량은 ${DLEN[form] || DLEN['수필']}, 결말까지 완결. 본문은 반드시 <text> 태그 안에 씁니다.\n- how: 고른 재구성 방식과 축을 한 줄로.`, messages: [{ role: 'user', content: info }], max_tokens: 5000, schema: { title: 1, how: 1, text: 1 } }); }
        if (!String(j.text || '').trim()) { res.status(502).json({ error: 'AI 초안이 비어서 왔어요. 한 번 더 눌러 주세요.' }); return; }
        if (j.cut && j.text) { try { const c = await claudeJSON({ system: FSTORY('dr', form, ratio, '') + `\n\n지금은 이어 쓰기입니다. <앞부분>을 되풀이하지 말고 끊긴 바로 다음 글자부터 결말까지 써서 완결합니다. 대답의 낱말을 그대로 쓰지 않는 규칙도 지킵니다.`, messages: [{ role: 'user', content: `${info}\n\n<앞부분>\n${j.text}\n</앞부분>` }], max_tokens: 3000, schema: { text: 1 } }); if (c.text) j.text = j.text + c.text; } catch (e) { /* 앞부분 유지 */ } }
        let j2 = j; const hits = echoed(body.qa, j.text);
        if (hits.length >= 2 && Date.now() - tD < 45000) { try { const r2 = await claudeJSON({ system: FSTORY('dr', form, ratio, '') + `\n\n지금은 '초안'입니다. 분량은 ${DLEN[form] || DLEN['수필']}, 결말까지 완결.\n- how: 고른 재구성 방식과 축을 한 줄로.`, messages: [{ role: 'user', content: info }, { role: 'assistant', content: `<title>${j.title}</title><how>${j.how}</how><text>${j.text}</text>` }, { role: 'user', content: `대답에 나온 낱말이 그대로 들어갔습니다: ${hits.slice(0, 12).join(', ')}. 이 낱말들을 하나도 쓰지 말고 다른 말·비유·이미지로 바꿔, 같은 재구성 방식으로 다시 써 주세요.` }], max_tokens: 4000, schema: { title: 1, how: 1, text: 1 } }); if (r2.text && !r2.cut && echoed(body.qa, r2.text).length < hits.length) j2 = r2; } catch (e) { /* 첫 초안 유지 */ } }
        j = j2;
        out = { title: clip(j.title, 60).trim(), how: clip(j.how, 120).trim(), text: clip(j.text, 5000).trim() };
      } else if (mode === 'fmore') {
        const j = await claudeJSON({ system: FSTORY(len, form, ratio, mine) + `\n\n지금은 이어 쓰기입니다. 제목은 「${clip(body.title, 60)}」입니다. <앞부분>은 이미 쓴 글입니다. 되풀이하지 말고 끊긴 바로 다음 글자부터 이어서 결말까지 씁니다.`,
          messages: [{ role: 'user', content: `${info}\n\n<앞부분>\n${clip(body.text, 14000)}\n</앞부분>` }], max_tokens: 5000, schema: { text: 1 } });
        out = { text: clip(j.text, 12000), more: !!j.cut };
      } else {
        const j = await claudeJSON({ system: FSTORY(len, form, ratio, mine), messages: [{ role: 'user', content: info }], max_tokens: len === 'full' ? 5000 : 4000, schema: { title: 1, text: 1 } });
        out = { title: clip(j.title, 60).trim(), text: clip(j.text, 12000), more: !!j.cut };
      }
    } else if (mode === 'marks' || mode === 'review' || mode === 'reform') {
      const text = clip(body.text, 9000);
      if (text.replace(/\s/g, '').length < 30) { res.status(400).json({ error: '글을 조금 더 써 주세요.' }); return; }
      const form = ['시', '소설', '수필', '동화'].includes(F5(body.form)) ? F5(body.form) : '';
      if (mode === 'marks') {
        const qa = (Array.isArray(body.qa) ? body.qa : []).filter(x => x && x.a).slice(0, 24).map(x => `질문: ${clip(x.q, 300)}\n대답: ${clip(x.a, 1500)}`).join('\n\n');
        const j = await claudeJSON({ system: MARKS, messages: [{ role: 'user', content: `<문답>\n${qa || '(없음)'}\n</문답>\n\n<글>\n${text}\n</글>` }], max_tokens: 6000, schema: { text: 1 } });
        out = { marked: clip(j.text, 12000) };
      } else if (mode === 'review') {
        const j = await claudeJSON({ system: REVIEW(form), messages: [{ role: 'user', content: `<글>\n${text}\n</글>` }], max_tokens: 3000, schema: { good: 1, fix1: 1, fix2: 1, fix3: 1 } });
        out = { good: clip(j.good, 400).trim(), fixes: [j.fix1, j.fix2, j.fix3].map(x => clip(x, 300).trim()).filter(Boolean) };
      } else {
        const to = ['시', '소설', '수필', '동화'].includes(F5(body.to)) ? F5(body.to) : '시';
        const j = await claudeJSON({ system: REFORM(to), messages: [{ role: 'user', content: `<글>\n${text}\n</글>` }], max_tokens: 5000, schema: { title: 1, text: 1 } });
        out = { title: clip(j.title, 60).trim(), text: clip(j.text, 12000).trim() };
      }
    } else if (mode === 'shrink') {
      const text = clip(body.text, 9000), target = ['p1', 'p2', 'p3', 'p4'].includes(body.target) ? body.target : 'p1';
      if (text.replace(/\s/g, '').length < 50) { res.status(400).json({ error: '줄일 글이 없어요.' }); return; }
      const j = await claudeJSON({ system: SHRINK(target), messages: [{ role: 'user', content: `<글>\n${text}\n</글>` }], max_tokens: 5000, schema: { text: 1 } });
      out = { text: clip(j.text, 6000) };
    } else if (mode === 'intro') {
      const memo = clip(body.memo, 1200);
      if (memo.replace(/\s/g, '').length < 4) { res.status(400).json({ error: '자기소개 메모가 없어요. "오늘 수업" 1회차 자기소개를 먼저 적어 주세요.' }); return; }
      const j = await claudeJSON({ system: INTRO, messages: [{ role: 'user', content: memo }], max_tokens: 3000, schema: { text: 1 } });
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
