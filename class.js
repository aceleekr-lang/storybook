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
    ['qr', 'qr0', 'qr2'].forEach(id => {
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

  function showAnswer(act, id) {
    const a = LIVE.answers.find(x => x.act === act && x.id === id); if (!a) return;
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
        <div class="chiprow">${list.map(a => `<button class="chip" style="--c:${colorOf(a.id)}" data-ans="${a.act}|${a.id}">${esc(a.data.call || a.name)}</button>`).join('') || '<span class="muted">아직 없어요 — 앱 “오늘 수업” 탭에서 적어요</span>'}</div>
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
    drawMap();
  }
  let liveOk = false;
  async function poll() {
    try { LIVE = Object.assign({ iv: [] }, await api('class_live', { acts: Object.keys(ACT) })); liveOk = true; render(); $('#liveDot').className = 'on'; $('#liveDot').title = '실시간 연결됨'; }
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

  applySettings();
  const h = /^#s(\d+)$/.exec(location.hash);
  show(h ? +h[1] - 1 : 0);
})();
