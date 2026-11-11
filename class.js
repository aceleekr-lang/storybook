/* 수업 화면 — 회차별 슬라이드(data-sess) + 앱 데이터 실시간 연동 (강사·운영자 전용). ?s=2 처럼 회차를 고르고, 없으면 오늘 날짜로 고름 */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  // ---- 회차 고르기 ----
  const SESSIONS = window.CURRIC.story.sessions;
  const SNO = (() => {
    const q = +new URLSearchParams(location.search).get('s');
    if (SESSIONS.some(x => x.no === q)) return q;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const d = x => { const m = /(\d+)월\s*(\d+)일/.exec(x.day || ''); return m ? new Date(2026, +m[1] - 1, +m[2]) : null; };
    const has = n => document.querySelector(`.slide[data-sess="${n}"]`) || n === 1;
    const today = SESSIONS.find(x => d(x) && +d(x) === +t && has(x.no));
    const past = SESSIONS.filter(x => d(x) && d(x) <= t && has(x.no)).pop();
    return (today || past || SESSIONS[0]).no;
  })();
  const all = $$('.slide');
  all.forEach(s => { s.hidden = true; });
  const slides = all.filter(s => (s.dataset.sess || '1') === String(SNO));
  const store = { get(k, d) { try { const v = localStorage.getItem('ysc_' + k); return v == null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem('ysc_' + k, v); } catch { /* 저장 안 돼도 화면은 그대로 */ } } };
  let cur = 0;

  // ---- 무대 크기 맞추기 ----
  const stage = $('#stage');
  const fit = () => { const k = Math.min(innerWidth / 1600, innerHeight / 900); stage.style.transform = `translate(-50%, -50%) scale(${k})`; };
  addEventListener('resize', fit); fit();

  // ---- 화면 넘기기 ----
  function show(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, j) => { s.hidden = j !== cur; });
    const s = slides[cur];
    $('#prog').style.width = ((cur + 1) / slides.length * 100) + '%';
    $('#pageNo').textContent = `${cur + 1} / ${slides.length}`;
    $('#secName').textContent = `${s.dataset.time || ''}  ${s.dataset.sec || ''}`;
    $('#notes').textContent = s.dataset.note || '';
    try { history.replaceState(null, '', '#s' + (cur + 1)); } catch { /* 무시 */ }
    if (window.__onShow) window.__onShow(cur);
  }
  $('#pPrev').onclick = () => show(cur - 1);
  $('#pNext').onclick = () => show(cur + 1);
  addEventListener('keydown', e => {
    if (e.target.closest('input, textarea') || !$('#setPanel').hidden) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); show(cur + 1); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); show(cur - 1); }
    if (e.key === 'n' || e.key === 'N') $('#notes').hidden = !$('#notes').hidden;
  });
  $('#bNote').onclick = () => { $('#notes').hidden = !$('#notes').hidden; };
  $('#bFull').onclick = () => { const d = document; if (d.fullscreenElement) d.exitFullscreen().catch(() => {}); else (d.documentElement.requestFullscreen ? d.documentElement.requestFullscreen() : Promise.reject()).catch(() => {}); };
  const tick = () => { const t = new Date(); $('#clock').textContent = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
  tick(); setInterval(tick, 15000);

  // ---- 목차 ----
  $('#bToc').onclick = () => {
    $('#toc').innerHTML = `<li class="toc-s">${SESSIONS.filter(x => x.no === 1 || document.querySelector(`.slide[data-sess="${x.no}"]`)).map(x => `<a href="?s=${x.no}" class="${x.no === SNO ? 'cur' : ''}">${x.no}회차</a>`).join('')}</li>` + slides.map((s, i) => `<li><button data-go="${i}" class="${i === cur ? 'cur' : ''}"><span class="tm">${s.dataset.time || ''}</span>${(s.querySelector('h1, h2') || {}).textContent || s.dataset.sec}</button></li>`).join('');
    $('#tocPanel').hidden = false;
  };
  $('#toc').onclick = e => { const b = e.target.closest('[data-go]'); if (b) { show(+b.dataset.go); $('#tocPanel').hidden = true; } };
  $$('.panel').forEach(p => p.addEventListener('click', e => { if (e.target === p || e.target.closest('[data-close]')) p.hidden = true; }));

  // ---- 설정 (앱 주소·강사·참여자) ----
  let names = [];
  function applySettings() {
    const url = location.origin + location.pathname.replace(/class\.html$/, '');
    const teacher = store.get('teacher', ''), line = store.get('line', '');
    $$('[data-bind="teacher"]').forEach(el => { el.textContent = teacher || '강사 이름'; });
    $$('[data-bind="teacherLine"]').forEach(el => { el.textContent = line || '한 줄 소개를 ⚙ 설정에서 적어 주세요'; });
    ['qr', 'qr0', 'qr2', 'qr3', 'qr4'].forEach(id => {
      const box = $('#' + id); box.innerHTML = '';
      const sz = Math.round(parseFloat(box.style.width) || 340);
      if (url && window.QRCode) new QRCode(box, { text: url, width: sz, height: sz, correctLevel: QRCode.CorrectLevel.M });
      else box.innerHTML = '<p class="need">QR을 만들 수 없어요<br>(인터넷 연결 확인)</p>';
    });
    $('#urlText').textContent = url ? url.replace(/^https?:\/\//, '') : '';
  }
  $('#bSet').onclick = () => {
    $('#sTeacher').value = store.get('teacher', ''); $('#sLine').value = store.get('line', '');
    $('#setPanel').hidden = false;
  };
  $('#sSave').onclick = () => {
    store.set('teacher', $('#sTeacher').value.trim()); store.set('line', $('#sLine').value.trim());
    applySettings(); $('#setPanel').hidden = true;
  };

  // ---- 타이머 ----
  $$('.timer').forEach(tm => {
    const min = +(tm.closest('.slide').dataset.timer || 5);
    let left = min * 60, id = null;
    const b = tm.querySelector('b'), go = tm.querySelector('[data-t=go]');
    const draw = () => { b.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; tm.classList.toggle('done', left === 0); };
    go.onclick = () => {
      if (id) { clearInterval(id); id = null; go.textContent = '이어서'; return; }
      go.textContent = '멈춤';
      id = setInterval(() => { left = Math.max(0, left - 1); draw(); if (!left) { clearInterval(id); id = null; go.textContent = '끝!'; } }, 1000);
    };
    tm.querySelector('[data-t=reset]').onclick = () => { clearInterval(id); id = null; left = min * 60; go.textContent = '시작'; draw(); };
    draw();
  });

  // ---- 샘플 그림 (포스터의 강·철교 풍경을 장면마다 다르게) ----
  function scene(o) {
    const W = 380, H = 562;
    const sky = o.sky || ['#BFE3F5', '#EAF6FB'];
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><linearGradient id="sk${o.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#sk${o.id})"/>`;
    if (o.moon) s += `<circle cx="300" cy="80" r="26" fill="#FFF3C4"/>`;
    if (o.sun) s += `<circle cx="80" cy="${o.sunY || 110}" r="34" fill="${o.sun}" opacity=".9"/>`;
    s += `<path d="M0 230 Q90 150 190 210 T380 190 V330 H0Z" fill="${o.hill1 || '#8FC37E'}"/>
      <path d="M0 270 Q120 220 240 262 T380 250 V340 H0Z" fill="${o.hill2 || '#6FAE6A'}"/>`;
    if (o.river) s += `<rect y="300" width="${W}" height="60" fill="${o.river}"/><g fill="#7a7a7a"><rect x="0" y="292" width="${W}" height="8"/>${[30, 110, 190, 270, 350].map(x => `<rect x="${x}" y="300" width="9" height="40"/>`).join('')}</g>`;
    if (o.train) s += `<g><rect x="${o.train}" y="270" width="150" height="24" rx="6" fill="#EDEDED" stroke="#4a5a7a" stroke-width="2"/>${[0, 1, 2, 3, 4].map(i => `<rect x="${o.train + 12 + i * 27}" y="276" width="16" height="9" fill="${o.night ? '#FFD86B' : '#9CC9E6'}"/>`).join('')}</g>`;
    s += `<rect y="${o.river ? 360 : 330}" width="${W}" height="${H}" fill="${o.ground || '#D9CDB5'}"/>`;
    (o.houses || []).forEach(([x, y, c]) => { s += `<g><rect x="${x}" y="${y}" width="70" height="56" fill="${c}"/><path d="M${x - 8} ${y} L${x + 35} ${y - 30} L${x + 78} ${y}Z" fill="#7A4E3A"/><rect x="${x + 24}" y="${y + 16}" width="22" height="18" fill="${o.night ? '#FFD86B' : '#BFDDEE'}"/></g>`; });
    if (o.tree) s += `<g><rect x="${o.tree}" y="360" width="12" height="80" fill="#6B4B32"/><circle cx="${o.tree + 6}" cy="350" r="44" fill="#5E9B4E"/>${[[-20, -6], [14, -18], [22, 10], [-8, 18], [0, -30]].map(([dx, dy]) => `<circle cx="${o.tree + 6 + dx}" cy="${350 + dy}" r="6" fill="#F08A2E"/>`).join('')}</g>`;
    if (o.cart) s += `<g><rect x="${o.cart}" y="420" width="120" height="60" rx="6" fill="#C9583A"/><rect x="${o.cart + 10}" y="404" width="100" height="18" fill="#3D3D3D"/><circle cx="${o.cart + 22}" cy="488" r="14" fill="#333"/><circle cx="${o.cart + 98}" cy="488" r="14" fill="#333"/>${[0, 1, 2].map(i => `<path d="M${o.cart + 30 + i * 28} 400 q8 -16 0 -32 q-8 -16 0 -32" stroke="#fff" stroke-width="4" fill="none" opacity=".75"/>`).join('')}</g>`;
    (o.people || []).forEach(([x, y, c, k]) => { const r = k || 1; s += `<g><circle cx="${x}" cy="${y - 52 * r}" r="${13 * r}" fill="#F2C9A0"/><rect x="${x - 15 * r}" y="${y - 38 * r}" width="${30 * r}" height="${40 * r}" rx="${10 * r}" fill="${c}"/></g>`; });
    if (o.crowd) for (let i = 0; i < 14; i++) { const x = 20 + (i * 26) % 350, y = 470 + (i % 3) * 22; s += `<circle cx="${x}" cy="${y - 30}" r="9" fill="#E9BE95"/><rect x="${x - 10}" y="${y - 21}" width="20" height="26" rx="7" fill="${['#3E8DBA', '#E04F6A', '#2F7A45', '#F4C234', '#8E5BC4'][i % 5]}"/>`; }
    if (o.snow) for (let i = 0; i < 46; i++) s += `<circle cx="${(i * 83) % W}" cy="${(i * 137) % H}" r="${2 + (i % 3)}" fill="#fff" opacity=".9"/>`;
    return s + '</svg>';
  }
  const face = `<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#E3F0E6"/><circle cx="60" cy="50" r="24" fill="#F2C9A0"/><path d="M36 44 Q60 14 84 44 Q78 30 60 28 Q42 30 36 44Z" fill="#D9D9D9"/><rect x="30" y="78" width="60" height="50" rx="24" fill="#2F7A45"/></svg>`;
  const P = [
    { k: 'cov', role: '1쪽 · 제목면', svg: scene({ id: 1, sky: ['#1E2D55', '#47608E'], moon: 1, night: 1, hill1: '#3E5B4A', hill2: '#2F4A3B', train: 200, houses: [[40, 300, '#C9B79A']], ground: '#E8EEF4', snow: 1 }), title: '철길 옆 붕어빵', by: '글·그림 김순이 (예시)',
      why: ['제목면', '책 제목과 이야기 전체를 한 장으로 보여 주는 그림이에요. 2회차까지 정하지 않아도 괜찮아요.'] },
    { k: 'text', role: '2쪽 · 글 1', paras: ['1983년 겨울, 우리 가족은 가곡동 철길 옆 작은 집으로 이사를 왔다.', '밤마다 기차가 지나가면 창문이 덜컹거렸다. 무서워서 이불을 뒤집어쓰면 어머니는 "기차가 우리 집에 인사하고 가는 기다" 하셨다.'],
      why: ['글 1 · 시작', '언제, 어디서, 누가. 첫 장면에 이 세 가지만 있으면 독자가 따라와요.'] },
    { k: 'pic', role: '3쪽 · 그림 1', svg: scene({ id: 3, sky: ['#2A3A66', '#5B6F9A'], moon: 1, night: 1, hill1: '#45624F', hill2: '#36513F', train: 150, houses: [[60, 300, '#D8C6A6'], [200, 310, '#C8B08E']], ground: '#DADFE6', snow: 1 }),
      why: ['그림 1', '글 1의 장면을 그대로 그려요. "철길 옆 작은 집, 창문 불빛, 지나가는 기차" — 이 한 줄이 AI에게 줄 그림 설명이 돼요.'] },
    { k: 'text', role: '4쪽 · 글 2', paras: ['어머니는 역 앞 골목에서 붕어빵을 구우셨다. 나는 학교가 끝나면 리어카 옆에 쪼그려 앉아 숙제를 했다.', '반죽 냄새가 공책에 배어서, 선생님은 내 공책을 펼 때마다 웃으셨다.'],
      why: ['글 2 · 일상', '그 장소에서 늘 하던 일. 냄새, 소리 같은 감각 하나가 들어가면 장면이 살아나요.'] },
    { k: 'pic', role: '5쪽 · 그림 2', svg: scene({ id: 5, sky: ['#F6D9B8', '#FBEFDF'], sun: '#F4A24A', sunY: 140, houses: [[20, 290, '#E2D3B8'], [280, 300, '#D5C29F']], cart: 150, people: [[110, 470, '#3E8DBA', .8], [290, 470, '#8E5BC4']], ground: '#D8CBB2' }),
      why: ['그림 2', '사람이 무엇을 하고 있는지 보여 주는 그림. 표정이나 몸짓을 설명에 넣어요.'] },
    { k: 'text', role: '6쪽 · 글 3', paras: ['가장 바쁜 날은 장날이었다. 역 앞이 사람들로 꽉 찼다.', '"단팥 많이 넣어 주이소." 할머니들이 줄을 섰고, 나는 신문지 봉투를 접느라 손끝이 까매졌다.'],
      why: ['글 3 · 가장 생생한 장면', '이야기의 한가운데. 그때 들은 말을 그대로(사투리도!) 옮기면 힘이 생겨요.'] },
    { k: 'pic', role: '7쪽 · 그림 3', svg: scene({ id: 7, sky: ['#BFE3F5', '#EAF6FB'], sun: '#FFE08A', houses: [[10, 290, '#E5D6BC'], [150, 296, '#D9C7A5'], [290, 290, '#E8DCC6']], crowd: 1, cart: 240, ground: '#D7CCB6' }),
      why: ['그림 3', '사람 많은 장면도 좋아요. 장소가 어떤 곳이었는지 한눈에 보여 줘요.'] },
    { k: 'text', role: '8쪽 · 글 4', paras: ['열두 살 겨울, 어머니가 감기로 누우셨다. 나는 처음으로 혼자 붕어빵 틀을 잡았다.', '반은 타고 반은 덜 익었다. 그래도 단골 할아버지는 "오늘 거는 특별하네" 하시며 끝까지 다 사 가셨다.'],
      why: ['글 4 · 달라지는 순간', '무언가가 바뀌는 장면. 그때 내 마음이 어땠는지 한 줄 넣어 봐요.'] },
    { k: 'pic', role: '9쪽 · 그림 4', svg: scene({ id: 9, sky: ['#9FB7CC', '#D9E4EE'], houses: [[250, 300, '#CDBB9C']], cart: 90, people: [[70, 470, '#E04F6A', .8], [250, 474, '#5A5A5A']], ground: '#E6EBEF', snow: 1 }),
      why: ['그림 4', '두 사람 사이의 장면. 누가 왼쪽, 누가 오른쪽에 있는지까지 적으면 원하는 그림이 잘 나와요.'] },
    { k: 'text', role: '10쪽 · 글 5', paras: ['지금 그 골목에는 리어카가 없다. 철길도 그때보다 조용하다.', '그래도 겨울 저녁에 기차 소리가 들리면, 나는 아직도 반죽 냄새를 맡는다. 골목은 바뀌어도 그 겨울의 따뜻함은 남아 있다.'],
      why: ['글 5 · 닫기', '지금의 나로 돌아와서 마무리. 독자에게 남기고 싶은 한 문장(핵심 메시지)이 여기 들어가요.'] },
    { k: 'pic', role: '11쪽 · 그림 5', svg: scene({ id: 11, sky: ['#F3A96B', '#FBE1C2'], sun: '#F06A3A', sunY: 200, river: '#5FA4CF', train: 30, tree: 300, people: [[200, 480, '#2F7A45']], ground: '#D9CDB5' }),
      why: ['그림 5', '마지막 그림은 여운이 남게. 노을, 뒷모습, 강과 철교처럼 가곡동다운 풍경이 잘 어울려요.'] },
    { k: 'bio', role: '12쪽 · 지은이 소개',
      why: ['지은이 소개', '나와 가곡동의 인연을 짧게. 내 사진이나 AI로 그린 내 모습을 넣어요. 7회차에 써요.'] }
  ];
  const SPREADS = [[0], [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11]];
  let sp = 0;
  const pageHTML = (p, n) => {
    const role = `<span class="role">${p.role}</span>`;
    if (p.k === 'cov') return `<div class="pg cov">${role}${p.svg}<div class="ct"><b>${p.title}</b><span>${p.by}</span></div></div>`;
    if (p.k === 'pic') return `<div class="pg pic">${role}${p.svg}</div>`;
    if (p.k === 'text') return `<div class="pg text">${role}${p.paras.map(x => `<p>${x}</p>`).join('')}<span class="folio">${n}</span></div>`;
    return `<div class="pg bio">${role}<div class="face">${face}</div><h4>지은이 김순이</h4><p>가곡동 철길 옆에서 마흔 해를 살았다. 지금도 겨울이면 붕어빵을 사서 손주들과 나눠 먹는다. 이 책은 처음 써 본 나의 이야기다.</p><span class="folio">${n}</span></div>`;
  };
  function drawBook() {
    const ids = SPREADS[sp];
    $('#spread').innerHTML = ids.map(i => pageHTML(P[i], i + 1)).join('');
    $('#why').innerHTML = ids.map(i => `<div><b>${P[i].why[0]}</b>${P[i].why[1]}</div>`).join('<hr style="border:0;border-top:2px dashed #DCE3D3;margin:14px 0">');
    $('#bDots').innerHTML = SPREADS.map((_, i) => `<i class="${i === sp ? 'on' : ''}"></i>`).join('');
    $('#bPrev').disabled = sp === 0; $('#bNext').disabled = sp === SPREADS.length - 1;
  }
  $('#bPrev').onclick = () => { sp = Math.max(0, sp - 1); drawBook(); };
  $('#bNext').onclick = () => { sp = Math.min(SPREADS.length - 1, sp + 1); drawBook(); };
  $('#bRoles').onclick = e => { const on = $('#spread').classList.toggle('noroles'); e.target.textContent = on ? '역할 표시 켜기' : '역할 표시 끄기'; };
  drawBook();

  // ---- 기억 카드 ----
  const CARDS = ['어릴 때 자주 가던 곳', '지금은 사라진 곳', '누군가를 기다리던 곳', '냄새로 기억나는 곳', '가곡동에 처음 온 날 본 곳', '매일 지나다니는 길', '비 오는 날 생각나는 곳', '꼭 다시 가 보고 싶은 곳'];
  const drawCards = () => { $('#cards').innerHTML = CARDS.map((c, i) => `<button class="mc" data-c="${i}" aria-label="기억 카드 ${i + 1}"><span class="back">기억 ${i + 1}</span><span class="front">${c}</span></button>`).join(''); };
  drawCards();
  $('#cards').onclick = e => { const b = e.target.closest('.mc'); if (b) b.classList.toggle('open'); };
  $('#cDraw').onclick = () => {
    const closed = $$('.mc:not(.open)'); $$('.mc.pick').forEach(x => x.classList.remove('pick'));
    if (!closed.length) return;
    const b = closed[Math.floor(Math.random() * closed.length)]; b.classList.add('open', 'pick');
  };
  $('#cAll').onclick = () => $$('.mc').forEach(b => b.classList.add('open'));
  $('#cReset').onclick = drawCards;

  // ---- 이름 뽑기 ----
  let used = [];
  $('#rSpin').onclick = () => {
    const pool = names.filter(n => !used.includes(n));
    if (!names.length) { $('#rName').textContent = '?'; $('#rPicked').textContent = '앱에 가입·승인된 참여자가 아직 없어요.'; return; }
    if (!pool.length) { $('#rPicked').textContent = '모든 분이 발표했어요. "처음으로"를 누르면 다시 뽑아요.'; return; }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let n = 0; const end = reduce ? 0 : 16; const btn = $('#rSpin'); btn.disabled = true;
    const step = () => {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      $('#rName').textContent = pick;
      if (n++ < end) setTimeout(step, 60 + n * 12);
      else { used.push(pick); $('#rPicked').textContent = '발표한 분: ' + used.join(', '); btn.disabled = false;
        const mine = LIVE.pins.filter(p => p.name === pick); $('#rPins').innerHTML = mine.length ? `<b>${esc(pick)}님이 남긴 장소</b><br>${mine.map(p => esc(p.place) + (p.era ? ` (${esc(p.era)})` : '')).join('<br>')}` : ''; }
    };
    step();
  };
  $('#rReset').onclick = () => { used = []; $('#rName').textContent = '?'; $('#rPicked').textContent = ''; $('#rPins').innerHTML = ''; };


  // ===================== 앱 데이터 실시간 연동 (5초마다) =====================
  const C = window.BK_CONFIG, CUR = window.CURRIC;
  const SESS = CUR.story.sessions.find(s => s.no === SNO);
  const ACT = Object.fromEntries((SESS.acts || []).map(a => [a.id, a]));
  const TOKEN = (() => { try { return localStorage.getItem('ys_token') || sessionStorage.getItem('ys_token') || ''; } catch { return ''; } })();
  const hdr = () => { const h = { apikey: C.key, 'Content-Type': 'application/json' }; if (C.key.startsWith('eyJ')) h.Authorization = 'Bearer ' + C.key; return h; };
  async function api(action, data = {}) {
    const r = await fetch(`${C.url}/rest/v1/rpc/ys_api`, { method: 'POST', headers: hdr(), body: JSON.stringify({ p_token: TOKEN, p_action: action, p_data: data }) });
    if (!r.ok) throw new Error('서버 오류 ' + r.status);
    const j = await r.json(); if (j && j.error) throw new Error(j.error); return j;
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let LIVE = { answers: [], members: [], pins: [], iv: [] }, ME = null;
  const MAPS = {}; // 지도 칸(.livemap)마다 { map, layer, fitted }
  const COLORS = ['#E04F6A', '#3E8DBA', '#2F7A45', '#EE7B30', '#8E5BC4', '#2BA39A', '#D9488A', '#2E5BB8', '#B8860B', '#5A6A80'];
  const colorOf = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const ansOf = act => LIVE.answers.filter(a => a.act === act);
  const summary = a => (ACT[a.act] ? ACT[a.act].fields.map(f => a.data[f.k]).filter(Boolean).join(' · ') : '');

  // AI 인터뷰 내용 보기 (정리 · 수필 · 대화 전체)
  async function showInterview(id, name) {
    $('#ansv').innerHTML = `<div class="ansv-in"><p class="ansv-k">AI 인터뷰</p><h2>${esc(name)}</h2><p class="muted">불러오는 중…</p></div>`;
    $('#ansv').hidden = false;
    let D = {};
    try { D = (await api('note_get', { kind: 'interview', id })).data || {}; }
    catch (err) { $('#ansv .ansv-in').innerHTML += `<p class="muted">${esc(err.message)}</p>`; return; }
    const msgs = D.msgs || [];
    const field = (k, v) => v ? `<div class="ansv-f"><b>${k}</b><p>${esc(v).replace(/\n/g, '<br>')}</p></div>` : '';
    const sum = D.summary ? field('주제', D.topic) + field('독자', D.reader) + field('핵심 메시지', D.message) + field('정리', D.summary) : '<p class="muted ivempty">아직 정리하지 않았어요. 앱에서 "인터뷰 마치기"를 누르면 정리돼요.</p>';
    const essay = D.essay ? `<h3 class="ivess-t">${esc(D.essayTitle || '제목 없음')}</h3><div class="ivess">${esc(D.essay).replace(/\n/g, '<br>')}</div>` : '<p class="muted ivempty">아직 수필을 쓰지 않았어요.</p>';
    const talk = msgs.length ? msgs.map(m => `<div class="ivm ${m.r === 'ai' ? 'ai' : 'me'}">${esc(m.t).replace(/\n/g, '<br>')}</div>`).join('') : '<p class="muted ivempty">아직 대화가 없어요.</p>';
    const first = D.essay ? 'essay' : D.summary ? 'sum' : 'talk';
    const tabs = [['sum', '정리'], ['essay', '수필'], ['talk', `대화 전체 (대답 ${msgs.filter(m => m.r === 'me').length}번)`]];
    $('#ansv').innerHTML = `<div class="ansv-in ivview" style="--c:${colorOf(id)}"><p class="ansv-k">AI 인터뷰${D.done ? ' · 마침' : ' · 진행 중'}</p><h2>${esc(name)}</h2>
      <div class="ivtabs">${tabs.map(([k, l]) => `<button class="ivtab" data-ivtab="${k}" aria-pressed="${k === first}">${l}</button>`).join('')}</div>
      <div class="ivpane" data-pane="sum" ${first === 'sum' ? '' : 'hidden'}>${sum}</div>
      <div class="ivpane" data-pane="essay" ${first === 'essay' ? '' : 'hidden'}>${essay}</div>
      <div class="ivpane" data-pane="talk" ${first === 'talk' ? '' : 'hidden'}>${talk}</div>
      <button class="btn main" id="ansClose">닫기</button></div>`;
  }

  const storyHTML = d => `<div class="sto">${(d.parts || []).map((p, i) => `<div class="sp">${p.img && p.img.url ? `<img src="${esc(p.img.url)}" alt="">` : '<div class="noimg"></div>'}<p class="tx">${esc(p.text || '').replace(/\n/g, '<br>')}</p></div>`).join('') || '<p class="muted">아직 초안을 쓰지 않았어요.</p>'}</div>`;
  function showAnswer(act, id) {
    const a = LIVE.answers.find(x => x.act === act && x.id === id); if (!a) return;
    if (act === 's3_story') {
      $('#ansv').innerHTML = `<div class="ansv-in ivview" style="--c:${colorOf(id)}"><p class="ansv-k">상상 그림 이야기 · ${esc(a.name)}</p><h2>${esc(a.data.title || a.data.card || '제목 없음')}</h2>
        <div class="ivpane">${storyHTML(a.data)}</div><button class="btn main" id="ansClose">닫기</button></div>`;
      $('#ansv').hidden = false; return;
    }
    if (act === 's4_photo') { const d = a.data, p = d.photo;
      $('#ansv').innerHTML = `<div class="ansv-in ivview" style="--c:${colorOf(id)}"><p class="ansv-k">사진 이야기 · ${esc(a.name)}</p><h2>${esc(d.title || d.memo || '사진 이야기')}</h2>
        ${p && p.url ? `<img class="sv-thumb" src="${esc(p.url)}" alt="">` : ''}<p class="sv-text">${esc(d.text || '아직 이야기를 쓰지 않았어요.').replace(/\n/g, '<br>')}</p><button class="btn main" id="ansClose">닫기</button></div>`;
      $('#ansv').hidden = false; return;
    }
    const def = ACT[act];
    $('#ansv').innerHTML = `<div class="ansv-in" style="--c:${colorOf(id)}"><p class="ansv-k">${esc(def ? def.title : act)}</p><h2>${esc(a.data.call ? `${a.data.call} (${a.name})` : a.name)}</h2>
      ${(def ? def.fields : []).filter(f => a.data[f.k] && f.k !== 'call').map(f => `<div class="ansv-f"><b>${esc(f.label)}</b><p>${esc(a.data[f.k]).replace(/\n/g, '<br>')}</p></div>`).join('')}
      <button class="btn main" id="ansClose">닫기</button></div>`;
    $('#ansv').hidden = false;
  }
  $('#ansv').addEventListener('click', e => { if (e.target.id === 'ansv' || e.target.id === 'ansClose') $('#ansv').hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape') $('#ansv').hidden = true; });
  document.addEventListener('click', async e => {
    const c = e.target.closest('[data-ans]'); if (c) { const [act, id] = c.dataset.ans.split('|'); showAnswer(act, id); return; }
    const ivb = e.target.closest('[data-iv]'); if (ivb) { showInterview(ivb.dataset.iv, ivb.textContent); return; }
    const tab = e.target.closest('[data-ivtab]');
    if (tab) { $$('.ivtab').forEach(b => b.setAttribute('aria-pressed', b === tab)); $$('.ivpane').forEach(x => { x.hidden = x.dataset.pane !== tab.dataset.ivtab; }); return; }
    const ap = e.target.closest('[data-approve]');
    if (ap) { ap.disabled = true; try { await api('person_approve', { id: ap.dataset.approve, ok: true }); await poll(); } catch (err) { ap.disabled = false; ap.textContent = err.message; } }
  });

  function initMap() {
    if (!window.L) return;
    $$('.livemap').forEach(box => {
      if (MAPS[box.id] || box.offsetParent === null) return;
      const M = Object.assign({ lat: 35.4755, lng: 128.77, zoom: 15 }, C.map || {});
      const map = L.map(box, { zoomControl: true, attributionControl: true }).setView([M.lat, M.lng], M.zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      MAPS[box.id] = { map, layer: L.layerGroup().addTo(map), fitted: false };
    });
    drawMap();
  }
  function drawMap() {
    Object.values(MAPS).forEach(m => {
      m.map.invalidateSize(); m.layer.clearLayers();
      LIVE.pins.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 11, weight: 3, color: '#fff', fillColor: colorOf(p.pid), fillOpacity: .95 })
        .bindTooltip(`${esc(p.place)} · ${esc(p.name)}`, { direction: 'top' }).addTo(m.layer));
      if (!m.fitted && LIVE.pins.length) { m.fitted = true; m.map.fitBounds(L.latLngBounds(LIVE.pins.map(p => [p.lat, p.lng])).pad(0.25), { maxZoom: 16 }); }
    });
  }
  window.__onShow = () => { setTimeout(initMap, 60); };

  function render() {
    const ok = LIVE.members.filter(m => m.approved), wait = LIVE.members.filter(m => !m.approved);
    $$('[data-live=signup]').forEach(el => { el.innerHTML = `가입 <b>${ok.length}</b>명${wait.length ? ` · 승인 기다리는 <b class="warn">${wait.length}</b>명` : ''}`; });
    const pd = $('#pending');
    if (pd) pd.innerHTML = wait.length ? `<p>승인 기다리는 분</p>${wait.map(m => ME && ME.role === 'admin' ? `<button class="chip" data-approve="${m.id}">${esc(m.name)} 승인</button>` : `<span class="chip">${esc(m.name)}</span>`).join('')}` : '';
    $$('.subs[data-act]').forEach(el => {
      const list = ansOf(el.dataset.act);
      const missing = ok.filter(m => !list.some(a => a.id === m.id));
      el.innerHTML = `<p>앱에 적어 낸 분 <b>${list.length}</b>명${ok.length ? ` / ${ok.length}명` : ''} <small>이름을 누르면 크게 보여요</small></p>
        <div class="chiprow">${list.map(a => `<button class="chip" style="--c:${colorOf(a.id)}" data-ans="${a.act}|${a.id}">${esc(a.data.call || a.name)}${a.act === 's3_story' ? ` ${(a.data.parts || []).length ? '✎' : ''}${(a.data.parts || []).filter(p => p.img && p.img.url).map(() => '▣').join('')}` : ''}</button>`).join('') || '<span class="muted">아직 없어요 — 앱 “오늘 수업” 탭에서 적어요</span>'}</div>
        ${missing.length && list.length ? `<p class="miss">아직: ${missing.map(m => esc(m.name)).join(', ')}</p>` : ''}`;
    });
    $$('[data-wall]').forEach(el => {
      const list = ansOf(el.dataset.wall);
      el.innerHTML = list.length ? list.map(a => `<button class="wnote" style="--c:${colorOf(a.id)}" data-ans="${a.act}|${a.id}"><span>${esc(summary(a))}</span><b>${esc(a.name)}</b></button>`).join('') : '<p class="muted">앱 “오늘 수업” 탭에서 적으면 여기에 바로 붙어요.</p>';
    });
    const people = new Map(); LIVE.pins.forEach(p => people.set(p.pid, (people.get(p.pid) || { name: p.name, n: 0 })) && people.get(p.pid).n++);
    $$('[data-live=pins]').forEach(el => { el.innerHTML = `<p>지도에 남긴 장소 <b>${LIVE.pins.length}</b>곳 · <b>${people.size}</b>명</p><div class="chiprow">${[...people].map(([id, x]) => `<span class="chip" style="--c:${colorOf(id)}">${esc(x.name)} ${x.n}</span>`).join('')}</div>`; });
    // AI 인터뷰 진행 현황 (대답 수·정리 여부만)
    $$('[data-live=iv]').forEach(el => {
      const by = new Map(LIVE.iv.map(x => [x.id, x]));
      const started = ok.filter(m => by.get(m.id) && by.get(m.id).answers > 0).length, summed = ok.filter(m => by.get(m.id) && by.get(m.id).sum).length;
      const noAi = ok.filter(m => !m.ai);
      el.innerHTML = `<p>인터뷰 시작 <b>${started}</b>명 · 정리까지 <b>${summed}</b>명 / ${ok.length}명${noAi.length ? ` <small>AI 동의 안 한 분: ${noAi.map(m => esc(m.name)).join(', ')}</small>` : ''}</p>
        <div class="ivb">${ok.map(m => { const x = by.get(m.id) || { answers: 0 }; const w = Math.min(100, x.answers * 10);
          return `<div class="ivr"><button class="ivn" data-iv="${m.id}" title="눌러서 내용 보기">${esc(m.name)}</button><span class="ivbar"><i style="width:${w}%;background:${colorOf(m.id)}"></i></span><span class="ivc">${x.answers}번${x.sum ? ' <b>✓정리</b>' : ''}</span></div>`; }).join('')}</div>`;
    });
    names = ok.map(m => m.name);
    if (typeof renderProg === 'function') { renderProg(); renderSpots(); }
    drawMap();
  }
  let liveOk = false;
  async function poll() {
    try { LIVE = Object.assign({ iv: [] }, await api('class_live', { acts: Object.keys(ACT) }));
      if (document.querySelector('[data-prog="base"], [data-prog="book"], [data-spot="book"]') && slides.some(x => x.querySelector('[data-prog="base"], [data-prog="book"], [data-spot="book"]'))) {
        try { (await api('board')).rows.forEach(r => BOARD.set(r.id, r)); } catch { /* 현황 없이 진행 */ } } liveOk = true; render(); $('#liveDot').className = 'on'; $('#liveDot').title = '실시간 연결됨'; }
    catch (err) { $('#liveDot').className = 'off'; $('#liveDot').title = '연결 끊김: ' + err.message; }
  }
  (async () => {
    const gate = $('#gate');
    if (!TOKEN) { gate.hidden = false; return; }
    try { ME = (await api('me')).me; } catch { gate.hidden = false; return; }
    if (!ME || ME.role === 'member') { gate.hidden = false; $('#gateMsg').textContent = `${ME ? ME.name + '님은 참여자 계정이에요. ' : ''}수업 화면은 강사·운영자 계정으로만 열 수 있어요.`; return; }
    await poll(); setInterval(() => { if (!document.hidden) poll(); }, 5000);
  })();

  // ---- 2회차: 진짜일까, 지어냈을까 ----
  document.addEventListener('click', e => { const t = e.target.closest('.tf'); if (t) t.classList.toggle('open'); });
  const tfAll = $('#tfAll'); if (tfAll) tfAll.onclick = () => $$('.tf').forEach(t => t.classList.add('open'));
  const tfReset = $('#tfReset'); if (tfReset) tfReset.onclick = () => $$('.tf').forEach(t => t.classList.remove('open'));
  // ---- 2회차: 핵심 메시지 들어 보기 (이름 뽑기) ----
  let used2 = [];
  const r2 = $('#r2Spin');
  if (r2) {
    r2.onclick = () => {
      const pool = names.filter(n => !used2.includes(n));
      if (!names.length) { $('#r2Msg').textContent = '앱에 가입·승인된 참여자가 아직 없어요.'; return; }
      if (!pool.length) { $('#r2Msg').textContent = '모든 분이 발표했어요. "처음으로"를 누르면 다시 뽑아요.'; return; }
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let n = 0; const end = reduce ? 0 : 16; r2.disabled = true;
      const step = () => {
        const pick = pool[Math.floor(Math.random() * pool.length)]; $('#r2Name').textContent = pick;
        if (n++ < end) { setTimeout(step, 60 + n * 12); return; }
        used2.push(pick); r2.disabled = false;
        const a = LIVE.answers.find(x => x.act === 's2_topic' && x.name === pick);
        $('#r2Msg').innerHTML = a && a.data.message ? `“${esc(a.data.message)}”` : '<span class="muted">아직 앱에 적지 않았어요 — 말로 들려주세요</span>';
      };
      step();
    };
    $('#r2Reset').onclick = () => { used2 = []; $('#r2Name').textContent = '?'; $('#r2Msg').textContent = ''; };
  }

  // ---- 3회차: 상상 카드 · 수필 낭독 · 상상 이야기 보기 ----
  // 상상 카드 6종 — 앱(extra.js IM_CATS)과 같은 내용. 카드를 누를 때마다 그 종류의 다른 상상이 나와요.
  const IM_CATS = [{"name": "말하는 사물·동물", "cards": ["밀양강 물고기가 말을 한다면", "오래된 우체통이 답장을 보낸다면", "고양이가 가곡동 길 안내를 맡는다면", "밀양역 시계가 지나간 이야기를 들려준다면", "골목 담벼락 그림이 밤마다 움직인다면", "우리 집 장독대가 할머니의 비밀을 안다면"]}, {"name": "시간 여행", "cards": ["30년 뒤 가곡동 아이가 나를 찾아온다면", "열 살의 내가 오늘 가곡동에 나타난다면", "기차에서 내리니 50년 전 밀양역이라면", "낡은 사진 속으로 걸어 들어갈 수 있다면", "100년 뒤 누군가 내 이야기책을 발견한다면", "가곡동의 하루가 거꾸로 흐른다면"]}, {"name": "사라진 것이 돌아온다면", "cards": ["사라진 가게가 하룻밤만 다시 문을 연다면", "문 닫은 옛 극장에 다시 영화가 걸린다면", "헐린 옛집이 하룻밤 다시 생겨난다면", "그리운 사람이 장날에 한 번 들른다면", "어릴 적 잃어버린 물건이 택배로 돌아온다면", "골목에서 옛 동무들 목소리가 들린다면"]}, {"name": "날씨·계절의 마법", "cards": ["가곡동에 하루 동안 눈이 펑펑 내린다면", "비가 올 때마다 옛 노래가 들린다면", "밀양강이 하룻밤 꽁꽁 얼어 길이 된다면", "한여름에 벚꽃이 다시 핀다면", "안개 속에서 또 다른 가곡동이 나타난다면", "보름달이 상상창고 지붕에 내려앉는다면"]}, {"name": "동네의 비밀", "cards": ["상상창고에 밤마다 불이 켜진다면", "가곡동 골목에 작은 기차역이 하나 더 생긴다면", "철길 아래에 비밀 통로가 있다면", "동네 큰 나무가 마을 일을 모두 기억한다면", "골목마다 숨은 문이 하나씩 있다면", "밤 12시에만 열리는 시장이 있다면"]}, {"name": "내가 주인공", "cards": ["내가 하루 동안 가곡동 동장이 된다면", "내가 투명인간이 되어 동네를 걷는다면", "내가 가곡동을 지키는 수호신이라면", "내가 이웃의 소원을 하나씩 들어준다면", "내가 새가 되어 가곡동을 내려다본다면", "내 꿈이 이웃들의 꿈과 이어진다면"]}];
  const c3 = $('#cards3');
  if (c3) {
    const seen = IM_CATS.map(() => []);
    const roll = i => { const c = IM_CATS[i].cards, left = c.filter(x => !seen[i].includes(x)); if (!left.length) seen[i].length = 0; const pick = (left.length ? left : c)[Math.floor(Math.random() * (left.length || c.length))]; seen[i].push(pick); return pick; };
    const draw3 = () => { seen.forEach(x => x.length = 0); c3.innerHTML = IM_CATS.map((c, i) => `<button class="mc" data-i="${i}" aria-label="${c.name} 카드"><span class="back">${c.name}</span><span class="front"><small>${c.name}</small>만약에 ${roll(i)}</span></button>`).join(''); };
    const flip = b => { if (b.classList.contains('open')) { b.querySelector('.front').innerHTML = `<small>${IM_CATS[+b.dataset.i].name}</small>만약에 ${roll(+b.dataset.i)}`; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } else b.classList.add('open'); };
    draw3(); c3.onclick = e => { const b = e.target.closest('.mc'); if (b) flip(b); };
    $('#c3Draw').onclick = () => { const all = [...c3.querySelectorAll('.mc')]; c3.querySelectorAll('.pick').forEach(x => x.classList.remove('pick')); const b = all[Math.floor(Math.random() * all.length)]; flip(b); b.classList.add('pick'); };
    $('#c3All').onclick = () => c3.querySelectorAll('.mc').forEach(b => b.classList.add('open'));
    $('#c3Reset').onclick = draw3;
  }
  function roulette(pre, pool, onPick) {
    const spin = $(`#${pre}Spin`); if (!spin) return;
    let used = [];
    spin.onclick = () => {
      const all = pool(), left = all.filter(m => !used.includes(m.id));
      if (!all.length) { $(`#${pre}Name`).textContent = '?'; onPick(null, '아직 뽑을 사람이 없어요.'); return; }
      if (!left.length) { onPick(null, '모든 분이 발표했어요. "처음으로"를 누르면 다시 뽑아요.'); return; }
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; let n = 0; const end = reduce ? 0 : 14; spin.disabled = true;
      const step = () => { const m = left[Math.floor(Math.random() * left.length)]; $(`#${pre}Name`).textContent = m.name;
        if (n++ < end) { setTimeout(step, 60 + n * 12); return; } used.push(m.id); spin.disabled = false; onPick(m); };
      step();
    };
    $(`#${pre}Reset`).onclick = () => { used = []; $(`#${pre}Name`).textContent = '?'; onPick(null, ''); };
  }
  roulette('r3a', () => LIVE.members.filter(m => m.approved), async (m, msg) => {
    const out = $('#r3aMsg'); if (!m) { out.textContent = msg || ''; return; }
    out.innerHTML = '<p class="muted">수필을 불러오는 중…</p>';
    try { const D = (await api('note_get', { kind: 'interview', id: m.id })).data || {};
      out.innerHTML = D.essay ? `<h3>${esc(D.essayTitle || '제목 없음')}</h3>${esc(D.essay.split(/\n\s*\n/).slice(0, 2).join('\n\n')).replace(/\n/g, '<br>')} …` : '<span class="muted">아직 수필이 없어요 — 인터뷰에서 기억에 남는 이야기를 말로 들려주세요</span>';
    } catch (err) { out.textContent = err.message; }
  });
  roulette('r3b', () => LIVE.answers.filter(a => a.act === 's3_story' && (a.data.parts || []).length).map(a => ({ id: a.id, name: a.name })), (m, msg) => {
    const out = $('#r3bView'); if (!m) { out.innerHTML = `<p class="muted" style="font-size:30px">${esc(msg || '이름을 뽑으면 그분의 상상 그림 이야기가 떠요.')}</p>`; return; }
    const a = LIVE.answers.find(x => x.act === 's3_story' && x.id === m.id); const p = (a.data.parts || [])[0] || {};
    out.innerHTML = `${p.img && p.img.url ? `<img src="${esc(p.img.url)}" alt="">` : '<div class="noimg">그림 아직</div>'}<div><h3>${esc(a.data.title || '제목 없음')}</h3><div class="tx">${esc(p.text || '').replace(/\n/g, '<br>')}</div>
      ${(a.data.parts || []).length > 1 ? `<button class="btn" data-ans="s3_story|${a.id}" style="margin-top:14px">다음 장면까지 보기</button>` : ''}</div>`;
  });

  // ---- 3회차: 진행 현황(data-prog)과 공유발표 스포트라이트(data-spot) ----
  const BOARD = new Map();
  const dataOf = act => id => ((LIVE.answers.find(x => x.act === act && x.id === id) || {}).data) || {};
  const storyOf = dataOf('s3_story'), photoOf = dataOf('s4_photo');
  const seedN = d => ['who', 'where', 'what', 'ending'].filter(k => String(d[k] || '').trim()).length;
  const PRED = {
    base: m => ((BOARD.get(m.id) || {}).npages || 0) >= 2,
    idea: m => { const d = storyOf(m.id); return !!(String(d.card || '').trim() || String(d.idea || '').trim()); },
    seed: m => seedN(storyOf(m.id)) >= 2,
    text: m => (storyOf(m.id).parts || []).length > 0,
    img: m => (storyOf(m.id).parts || []).some(p => p.img && p.img.url),
    book: m => ((BOARD.get(m.id) || {}).npages || 0) > 0,
    photo: m => !!(photoOf(m.id).photo && photoOf(m.id).photo.url),
    qa: m => (photoOf(m.id).qa || []).filter(x => String(x.a || '').trim()).length >= 2,
    ptext: m => !!String(photoOf(m.id).text || '').trim(),
    pmine: m => String(photoOf(m.id).mine || '').replace(/\s/g, '').length >= 20,
    pai: m => !!String(photoOf(m.id).ai || photoOf(m.id).text || '').trim(),
    ptone: m => !!photoOf(m.id).toneDone,
    pshrink: m => !!photoOf(m.id).shrunk,
    pbook: m => !!photoOf(m.id).inBook
  };
  const PV = { base: 'book', pbook: 'book' };
  const stepOf = id => { const d = photoOf(id); return d.toneDone ? '말투✓' : d.text ? '구체화' : String(d.mine || '').trim() ? '초안' : ''; }; // 진행 현황 → 이름 눌렀을 때 보여 줄 내용
  const PLABEL = { base: '작가 소개·수필을 넣은 분 (2쪽 이상)', idea: '카드를 고른 분', seed: '씨앗을 두 칸 이상 채운 분', text: '초안을 받은 분', img: '그림을 만든 분', book: '책에 쪽이 있는 분', photo: '사진을 고른 분', qa: 'AI 질문에 두 개 이상 대답한 분', ptext: 'AI 구체화까지 한 분 (이름 옆: 지금 단계)', pmine: '3-1 내가 초안을 쓴 분', pai: '3-2 AI가 구체화한 분', ptone: '3-3 말투를 고친 분', pshrink: '3-4 요약한 분 (필요할 때만)', pbook: '사진 이야기를 책에 넣은 분' };
  const approved = () => LIVE.members.filter(m => m.approved);
  function renderProg() {
    $$('[data-prog]').forEach(el => {
      const t = el.dataset.prog, ms = approved(), done = ms.filter(PRED[t]);
      el.innerHTML = `<p>${PLABEL[t]} <b>${done.length}</b> / ${ms.length}명</p>
        <div class="chiprow">${ms.map(m => { const st = t === 'ptext' ? stepOf(m.id) : ''; return PRED[t](m) ? `<button class="chip done" style="--c:${colorOf(m.id)}" data-pv="${t}|${m.id}">✓ ${esc(m.name)}${st ? ` · ${st}` : ''}</button>` : `<span class="chip not" style="--c:${colorOf(m.id)}">${esc(m.name)}${st ? ` · ${st}` : ''}</span>`; }).join('')}</div>`;
    });
  }
  const SPOT = new Map(); // wrap → { sel, used:Set, page }
  const nl = s => esc(s || '').replace(/\n/g, '<br>');
  const nameOf = id => (LIVE.members.find(m => m.id === id) || {}).name || '';
  function spotOverview(t) {
    const ms = approved().filter(PRED[t]);
    if (!ms.length) return '<p class="muted" style="font-size:30px">아직 올라온 것이 없어요. 앱에서 저장하면 여기에 바로 떠요.</p>';
    if (t === 'photo') return `<div class="sv-grid">${ms.map(m => { const p = photoOf(m.id).photo; return `<button data-spick="${m.id}"><img src="${esc(p.thumb || p.url)}" alt="">${esc(m.name)}</button>`; }).join('')}</div>`;
    if (t === 'qa' || t === 'ptext') return `<div class="sv-wall">${ms.map(m => { const d = photoOf(m.id); return `<button data-spick="${m.id}" style="--c:${colorOf(m.id)}"><b>${esc(m.name)}</b>${esc(t === 'qa' ? d.memo || `질문 ${d.qa.length}개` : `「${d.title || '제목 없음'}」`).slice(0, 90)}</button>`; }).join('')}</div>`;
    if (t === 'img') return `<div class="sv-grid">${ms.map(m => { const p = (storyOf(m.id).parts || []).find(x => x.img && x.img.url); return `<button data-spick="${m.id}"><img src="${esc(p.img.thumb || p.img.url)}" alt="">${esc(m.name)}</button>`; }).join('')}</div>`;
    return `<div class="sv-wall">${ms.map(m => { const d = storyOf(m.id), b = BOARD.get(m.id) || {};
      const line = t === 'idea' ? `${d.card || ''}${d.idea ? ` — ${d.idea}` : ''}` : t === 'seed' ? [d.who, d.where, d.what].filter(Boolean).join(' · ') : t === 'text' ? `「${d.title || '제목 없음'}」` : `${b.npages || 0}쪽 · 그림 ${b.imgs || 0}장`;
      return `<button data-spick="${m.id}" style="--c:${colorOf(m.id)}"><b>${esc(m.name)}</b>${esc(line).slice(0, 90)}</button>`; }).join('')}</div>`;
  }
  async function spotView(wrap, t, id) {
    const v = wrap.querySelector('.spot-v'), d = storyOf(id), name = nameOf(id);
    if (t === 'idea') v.innerHTML = `<p class="sv-k">${esc(name)}님의 소재</p><p class="sv-card">${esc(d.card || '카드 없음')}</p><p class="sv-idea">${nl(d.idea)}</p>`;
    if (t === 'seed') v.innerHTML = `<p class="sv-k">${esc(name)}님의 이야기 씨앗 · ${esc(d.card || '')}</p><div class="sv-seed">${[['누가', d.who], ['어디서', d.where], ['무슨 일이', d.what], ['어떻게 끝날까', d.ending]].map(([k, x]) => `<div><b>${k}</b><span>${nl(x) || '—'}</span></div>`).join('')}</div>`;
    if (t === 'text') v.innerHTML = `<p class="sv-k">${esc(name)}님의 상상 이야기</p><h3 class="sv-title">${esc(d.title || '제목 없음')}</h3>${(d.parts || []).map((p, i) => `${i ? '<hr style="border:0;border-top:2px dashed #DCE3D3;margin:18px 0">' : ''}<p class="sv-text">${nl(p.text)}</p>`).join('')}`;
    if (t === 'img') v.innerHTML = `<p class="sv-k">${esc(name)}님 · 「${esc(d.title || '')}」</p><div class="sv-imgs">${(d.parts || []).filter(p => p.img && p.img.url).map(p => `<img src="${esc(p.img.url)}" alt="">`).join('')}</div>`;
    if (t === 'photo') { const p = photoOf(id); v.innerHTML = `<p class="sv-k">${esc(name)}님의 사진</p><div class="sv-photo"><img src="${esc(p.photo.url)}" alt=""><p class="sv-idea">${nl(p.memo) || ''}</p></div>`; }
    if (t === 'qa') { const p = photoOf(id); v.innerHTML = `<p class="sv-k">${esc(name)}님 · AI 질문과 대답</p>${p.photo ? `<img class="sv-thumb" src="${esc(p.photo.thumb || p.photo.url)}" alt="">` : ''}${p.memo ? `<p class="sv-idea" style="font-size:30px">${nl(p.memo)}</p>` : ''}<ol class="sv-qa">${(p.qa || []).filter(x => String(x.a || '').trim()).map(x => `<li><b>${esc(x.q)}</b><span>${nl(x.a)}</span></li>`).join('')}</ol>`; }
    if (['pmine', 'pai', 'ptone', 'pshrink'].includes(t)) { const p = photoOf(id);
      const body = t === 'pmine' ? p.mine : t === 'pai' ? (p.ai || p.text) : p.text;
      const lab = { pmine: '3-1 내가 쓴 초안', pai: '3-2 AI가 구체화한 글', ptone: '3-3 내 말투로 고친 글', pshrink: `3-4 요약한 글 (${p.shrunk || ''})` }[t];
      v.innerHTML = `<p class="sv-k">${esc(name)}님 · ${lab}</p>${p.photo ? `<img class="sv-thumb" src="${esc(p.photo.thumb || p.photo.url)}" alt="">` : ''}${t !== 'pmine' && p.title ? `<h3 class="sv-title">${esc(p.title)}</h3>` : ''}<p class="sv-text">${nl(body)}</p>`; }
    if (t === 'ptext') { const p = photoOf(id); v.innerHTML = `<p class="sv-k">${esc(name)}님의 사진 이야기 · ${stepOf(id) || ''}</p>${p.photo ? `<img class="sv-thumb" src="${esc(p.photo.thumb || p.photo.url)}" alt="">` : ''}<h3 class="sv-title">${esc(p.title || '제목 없음')}</h3><p class="sv-text">${nl(p.text)}</p>${p.mine ? `<details class="sv-mine"><summary>3-1 내가 쓴 초안 보기</summary><p>${nl(p.mine)}</p></details>` : ''}`; }
    if (t === 'book') {
      v.innerHTML = '<p class="muted" style="font-size:28px">책을 불러오는 중…</p>';
      try {
        const w = (await api('work_get', { track: 'story', id })).work; const st = SPOT.get(wrap); st.pages = w.pages || []; st.page = 0; st.bookTitle = w.title;
        drawBookV(wrap, name);
      } catch (err) { v.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
    }
  }
  const FULL = ['full', 'fullSafe', 'fullText'];
  function pageBox(p, n) {
    if (!p) return '';
    const im = (p.imgs || []).find(x => x && x.url) || ((p.els || []).find(e => e.img && e.img.url) || {}).img;
    if (FULL.includes(p.tpl) && im) return `<button class="bkv-pg" data-bz="${n - 1}" aria-label="${n}쪽 크게 보기"><img class="full" src="${esc(im.url)}" alt=""><span class="pn">${n}</span></button>`;
    const txt = pageText(p);
    return `<button class="bkv-pg" data-bz="${n - 1}" aria-label="${n}쪽 크게 보기">${im ? `<img class="sm" src="${esc(im.thumb || im.url)}" alt="">` : ''}${p.head ? `<h4>${esc(p.head)}</h4>` : ''}<p>${esc(txt)}</p><span class="pn">${n}</span></button>`;
  }
  const pageText = p => p.text || (p.els || []).filter(e => e.t === 'text').map(e => e.text).join('\n\n');
  const pageImg = p => (p.imgs || []).find(x => x && x.url) || ((p.els || []).find(e => e.img && e.img.url) || {}).img;
  // 한 쪽 크게 보기 — 프로젝터에서 글씨가 읽히도록
  function zoomBox(p, n) {
    const im = pageImg(p), txt = pageText(p);
    return `<div class="bkv-z" data-bz="-1" title="누르면 두 쪽 보기로">${im ? `<img src="${esc(im.url)}" alt="">` : ''}<div>${p.head ? `<h4>${esc(p.head)}</h4>` : ''}${txt ? `<p>${esc(txt)}</p>` : ''}<p class="muted" style="font-size:22px;margin-top:14px">${n}쪽 · 누르면 두 쪽 보기로</p></div></div>`;
  }
  function drawBookV(wrap, name) {
    const st = SPOT.get(wrap), v = wrap.querySelector('.spot-v'), P = st.pages, i = st.page;
    if (st.zoom != null && P[st.zoom]) {
      const z = st.zoom;
      v.innerHTML = `<div class="bkv"><div class="bkv-nav" style="justify-content:space-between"><span class="sv-k" style="margin:0">${esc(name)}님의 책 · ${z + 1} / ${P.length}쪽</span><span style="display:flex;gap:10px"><button class="btn" data-bzs="-1" ${z > 0 ? '' : 'disabled'}>◀ 앞 쪽</button><button class="btn" data-bz="-1">두 쪽 보기</button><button class="btn" data-bzs="1" ${z + 1 < P.length ? '' : 'disabled'}>뒤 쪽 ▶</button></span></div>${zoomBox(P[z], z + 1)}</div>`;
      v.scrollTop = 0; return;
    }
    v.innerHTML = `<div class="bkv"><p class="sv-k" style="text-align:center">${esc(name)}님의 책 · ${P.length}쪽</p>
      <div class="bkv-sp">${P.length ? pageBox(P[i], i + 1) + pageBox(P[i + 1], i + 2) : '<p class="muted">아직 쪽이 없어요.</p>'}</div>
      <div class="bkv-nav"><button class="btn" data-bk="-2" ${i > 0 ? '' : 'disabled'}>◀ 이전</button><span>${P.length ? `${i + 1}${P[i + 1] ? `–${i + 2}` : ''} / ${P.length}쪽` : ''}</span><button class="btn" data-bk="2" ${i + 2 < P.length ? '' : 'disabled'}>다음 ▶</button></div>${P.length ? '<p class="bkv-hint">쪽을 누르면 크게 보여요</p>' : ''}</div>`;
  }
  function renderSpots() {
    $$('.spotwrap').forEach(wrap => {
      const t = wrap.dataset.spot;
      if (!SPOT.has(wrap)) {
        SPOT.set(wrap, { sel: null, used: new Set() });
        wrap.innerHTML = `<div class="spot-l"><div class="rname spot-name">?</div><div class="row"><button class="btn main" data-spin>이름 뽑기</button><button class="btn" data-sall>모두 보기</button></div>
          <p class="muted" style="margin:0;font-size:22px">이름을 눌러도 바로 보여요</p><div class="chiprow spot-list"></div></div><div class="spot-v"></div>`;
      }
      const st = SPOT.get(wrap), ms = approved().filter(PRED[t]);
      wrap.querySelector('.spot-list').innerHTML = ms.map(m => `<button class="chip ${st.used.has(m.id) ? 'used' : ''} ${st.sel === m.id ? 'cur' : ''}" style="--c:${colorOf(m.id)}" data-spick="${m.id}">${st.used.has(m.id) ? '✓ ' : ''}${esc(m.name)}</button>`).join('') || '<span class="muted">아직 없어요</span>';
      if (!st.sel) wrap.querySelector('.spot-v').innerHTML = spotOverview(t);
    });
  }
  function spotPick(wrap, id) {
    const st = SPOT.get(wrap); st.sel = id; st.used.add(id); st.zoom = null;
    wrap.querySelector('.spot-name').textContent = nameOf(id); renderSpots(); spotView(wrap, wrap.dataset.spot, id);
  }
  document.addEventListener('click', e => {
    const pv = e.target.closest('[data-pv]');
    if (pv) { // 진행 현황의 이름 → 그 사람이 이 단계에서 한 것
      const [t0, id] = pv.dataset.pv.split('|'), t = PV[t0] || t0;
      $('#ansv').innerHTML = `<div class="ansv-in pvwrap" data-spot="${t}" style="--c:${colorOf(id)}"><div style="display:flex;justify-content:space-between;align-items:center"><p class="ansv-k">${esc(PLABEL[t0] || '')}</p><button class="btn" id="ansClose">닫기</button></div><div class="spot-v"></div></div>`;
      const w = $('#ansv .pvwrap'); SPOT.set(w, { sel: id, used: new Set() }); $('#ansv').hidden = false; spotView(w, t, id); return;
    }
    const wrap = e.target.closest('.spotwrap, .pvwrap'); if (!wrap) return;
    const pk = e.target.closest('[data-spick]'); if (pk) { spotPick(wrap, pk.dataset.spick); return; }
    if (e.target.closest('[data-sall]')) { const st = SPOT.get(wrap); st.sel = null; wrap.querySelector('.spot-name').textContent = '?'; renderSpots(); return; }
    const bz = e.target.closest('[data-bz]'); if (bz) { const st = SPOT.get(wrap), k = +bz.dataset.bz; st.zoom = k < 0 ? null : k; if (k >= 0) st.page = k - (k % 2); drawBookV(wrap, nameOf(st.sel)); return; }
    const bzs = e.target.closest('[data-bzs]'); if (bzs) { const st = SPOT.get(wrap); st.zoom = Math.min(st.pages.length - 1, Math.max(0, st.zoom + +bzs.dataset.bzs)); st.page = st.zoom - (st.zoom % 2); drawBookV(wrap, nameOf(st.sel)); return; }
    const bk = e.target.closest('[data-bk]'); if (bk) { const st = SPOT.get(wrap); st.page = Math.max(0, st.page + +bk.dataset.bk); drawBookV(wrap, nameOf(st.sel)); return; }
    const sp = e.target.closest('[data-spin]');
    if (sp) {
      const st = SPOT.get(wrap), ms = approved().filter(PRED[wrap.dataset.spot]); let left = ms.filter(m => !st.used.has(m.id));
      if (!ms.length) return; if (!left.length) { st.used.clear(); left = ms; }
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; let n = 0; const end = reduce ? 0 : 14; sp.disabled = true;
      const step = () => { const m = left[Math.floor(Math.random() * left.length)]; wrap.querySelector('.spot-name').textContent = m.name;
        if (n++ < end) { setTimeout(step, 60 + n * 12); return; } sp.disabled = false; spotPick(wrap, m.id); };
      step();
    }
  });

  applySettings();
  const h = /^#s(\d+)$/.exec(location.hash);
  show(h ? +h[1] - 1 : 0);
})();
