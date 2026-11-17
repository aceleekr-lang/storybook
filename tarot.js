/* 타로 메이저 아르카나 22장 — 그림: Rider-Waite-Smith(1909, 파멜라 콜먼 스미스, 저작권 만료)
   keys: 전통적인 바른 방향의 뜻 · story: 이야기 주제로 이어 갈 때의 실마리 */
window.TAROT = [
  { n: 0, ko: '바보', en: 'The Fool', keys: '새로운 출발 · 순수함 · 두려움 없는 모험', story: '아무것도 모른 채 길을 떠나던 날' },
  { n: 1, ko: '마법사', en: 'The Magician', keys: '시작하는 힘 · 재주 · 해내려는 마음', story: '내 손으로 처음 무언가를 만들어 낸 순간' },
  { n: 2, ko: '여사제', en: 'The High Priestess', keys: '직관 · 고요한 지혜 · 숨겨진 이야기', story: '말하지 않고 마음속에 간직해 온 것' },
  { n: 3, ko: '여황제', en: 'The Empress', keys: '풍요 · 돌봄 · 어머니의 품', story: '나를 먹이고 품어 준 사람과 부엌' },
  { n: 4, ko: '황제', en: 'The Emperor', keys: '질서 · 책임 · 든든한 울타리', story: '집안을 지키던 사람, 내가 짊어진 책임' },
  { n: 5, ko: '교황', en: 'The Hierophant', keys: '가르침 · 전통 · 믿음', story: '어른에게 배운 것, 대대로 이어진 풍습' },
  { n: 6, ko: '연인', en: 'The Lovers', keys: '사랑 · 마음을 나눔 · 중요한 선택', story: '마음이 통했던 사람, 갈림길에서의 선택' },
  { n: 7, ko: '전차', en: 'The Chariot', keys: '나아감 · 의지 · 이겨 냄', story: '힘들어도 앞으로 밀고 나아가던 때' },
  { n: 8, ko: '힘', en: 'Strength', keys: '부드러운 용기 · 인내 · 다독임', story: '큰소리 없이 견뎌 낸 일' },
  { n: 9, ko: '은둔자', en: 'The Hermit', keys: '홀로 걷는 길 · 돌아봄 · 작은 등불', story: '혼자 걸으며 생각에 잠기던 길' },
  { n: 10, ko: '운명의 수레바퀴', en: 'Wheel of Fortune', keys: '돌고 도는 때 · 전환점 · 인연', story: '삶이 크게 바뀐 날, 우연한 만남' },
  { n: 11, ko: '정의', en: 'Justice', keys: '균형 · 공정함 · 바른 결정', story: '옳다고 믿고 내린 결정' },
  { n: 12, ko: '매달린 사람', en: 'The Hanged Man', keys: '멈춤 · 다른 눈으로 보기 · 기다림', story: '멈춰 서서야 보이던 것' },
  { n: 13, ko: '죽음', en: 'Death', keys: '하나의 끝과 새로운 시작 · 변화', story: '무언가를 떠나보내고 새로 시작한 때 (실제 죽음이 아니라 변화를 뜻해요)' },
  { n: 14, ko: '절제', en: 'Temperance', keys: '조화 · 어우러짐 · 회복', story: '서로 다른 것이 섞여 하나가 된 순간' },
  { n: 15, ko: '악마', en: 'The Devil', keys: '얽매임 · 집착 · 벗어나고 싶은 것', story: '놓지 못했던 것, 벗어나고 싶던 굴레' },
  { n: 16, ko: '탑', en: 'The Tower', keys: '갑작스러운 변화 · 무너짐 뒤의 깨달음', story: '한순간에 모든 게 바뀌었던 일' },
  { n: 17, ko: '별', en: 'The Star', keys: '희망 · 회복 · 맑은 마음', story: '어두운 때에도 붙잡았던 희망' },
  { n: 18, ko: '달', en: 'The Moon', keys: '꿈 · 흐릿한 기억 · 불안과 상상', story: '꿈인지 기억인지 흐릿한 밤의 장면' },
  { n: 19, ko: '태양', en: 'The Sun', keys: '기쁨 · 어린 시절 · 환한 날', story: '가장 환하게 웃던 어린 날' },
  { n: 20, ko: '심판', en: 'Judgement', keys: '부름 · 다시 일어섬 · 새 출발', story: '다시 해 보자고 마음먹은 날' },
  { n: 21, ko: '세계', en: 'The World', keys: '완성 · 하나 됨 · 긴 여정의 끝', story: '긴 시간 끝에 마침내 이룬 것' }
];
window.TAROT_POS = ['과거', '현재', '미래'];
window.tarotImg = n => `/tarot/${String(n).padStart(2, '0')}.jpg`;
