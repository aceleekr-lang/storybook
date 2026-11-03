/* 가곡동 이야기책 — 이야기 지도 · AI 인터뷰 · 그림체 투표 · AI 그림(ChatGPT 이미지) · 12쪽 구성표
   app.js가 window.YS로 내준 도구를 씁니다. app.js 다음에 불러와야 해요. */
(() => {
  'use strict';
  const Y = window.YS;
  if (!Y) return;
  const { C, CUR, TRACKS, S, VIEWS, api, go, modal, ask, toast, esc, $, $$, busy, store, encode, toAlbum, uploadImage, pickFile, isStaff, aiOk, askAi, signOutLocal } = Y;
  const myTrack = () => (S.me && (S.me.tracks || []).find(t => CUR[t])) || TRACKS[0];

  // ---------- 서버 함수 부르기 ----------
  async function post(url, body) {
    let r;
    try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: S.token, ...body }) }); }
    catch { throw new Error('인터넷 연결을 확인해 주세요.'); }
    let j = {};
    try { j = await r.json(); } catch { throw new Error(`서버가 답하지 않아요 (${r.status}). 운영자에게 알려 주세요.`); }
    if (j.error === 'auth') { signOutLocal(); throw new Error('다시 로그인해 주세요.'); }
    if (!r.ok || j.error) throw new Error(j.error || `오류가 났어요 (${r.status}).`);
    return j;
  }
  const askAI = body => post(C.interviewUrl || '/api/interview', body);

  // ---------- AI 그림 ----------
  const aspectOf = fr => { if (!fr) return 'portrait'; const r = fr[0] / fr[1]; return r > 1.15 ? 'landscape' : r < 0.87 ? 'portrait' : 'square'; };
  const b64Blob = (b64, type) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
  // 그림을 만들어 저장소에 올리고 사진첩에 담음 → {url, thumb, w, h, fit}
  async function makeImage({ prompt, style, aspect, owner }) {
    const j = await post(C.imageUrl || '/api/image', { prompt, style, aspect, owner: owner || '' });
    const im = { ...(await store(await encode(b64Blob(j.b64, j.mime || 'image/jpeg')))), fit: 'cover', ai: true };
    await toAlbum(im, owner || '');
    return { im, left: j.left };
  }

  // 그림 만들기 창. 쓸 그림을 고르면 그 그림을, 닫으면 null (album: true면 만든 마지막 그림)
  async function genImage({ owner = '', frame = null, scene = '', text = '', hint = '', album = false } = {}) {
    if (!aiOk() && !(await askAi())) return null;
    let st, left;
    try { [st, left] = await Promise.all([api('styles'), api('ai_check', { kind: 'image', id: owner }).then(r => r.left)]); }
    catch (err) { toast(err.message, true); return null; }
    const opts = [];
    if (st.picked) opts.push({ v: 'p', name: `공동 그림체 — ${st.picked.name}`, prompt: st.picked.prompt });
    st.styles.filter(s => !st.picked || s.id !== st.picked.id).forEach(s => opts.push({ v: s.id, name: `후보 — ${s.name}`, prompt: s.prompt }));
    opts.push({ v: '', name: '그림체 정하지 않음 (기본 그림책풍)', prompt: '' });
    let asp = aspectOf(frame), last = null;
    const goLabel = () => `${last ? '다시 만들기' : '그림 만들기'}${left != null ? ` (오늘 ${left}장 남음)` : ''}`;
    return new Promise(resolve => {
      let done = false;
      const fin = v => { if (!done) { done = true; resolve(v); } d.close(); };
      const d = modal(`<h2>AI로 그림 만들기</h2>
        <p class="muted">누가 · 어디서 · 무엇을 하는지, 계절·시간·분위기를 적으면 더 잘 그려요. 그림 안에 글자는 넣지 않아요.</p>
        <label class="f">장면 설명<textarea id="gP" rows="4" maxlength="1200" placeholder="예) 1980년대 겨울 아침, 밀양역 앞 골목에서 엄마 손을 잡고 걸어가는 여덟 살 아이. 입김이 하얗게 나오고 붕어빵 가게에서 김이 오른다.">${esc(scene)}</textarea></label>
        ${text || hint ? '<p class="tip"><button class="linkbtn" id="gFrom" type="button">이 쪽의 질문·글을 가져와서 고치기</button></p>' : ''}
        <label class="f">그림체<select id="gS">${opts.map(o => `<option value="${esc(o.v)}">${esc(o.name)}</option>`).join('')}</select></label>
        <div class="f"><span>모양 ${frame ? '<small>그림 칸에 맞춰 골라 뒀어요</small>' : ''}</span><div class="seg-btns" id="gA">
          ${[['portrait', '세로'], ['landscape', '가로'], ['square', '정사각']].map(([k, l]) => `<button type="button" data-asp="${k}" aria-pressed="${asp === k}">${l}</button>`).join('')}</div></div>
        <div class="gen-out" id="gOut" hidden></div>
        <p class="err" id="gErr" role="alert"></p>
        <div class="row end"><button class="btn btn-ghost" data-close>닫기</button>
          <button class="btn" id="gUse" hidden>${album ? '확인' : '이 그림 쓰기'}</button>
          <button class="btn btn-main" id="gGo" ${left === 0 ? 'disabled' : ''}>${goLabel()}</button></div>`, 'm-gen');
      d.addEventListener('close', () => { if (!done) { done = true; resolve(album ? last : null); } });
      $('#gA', d).onclick = e => { const b = e.target.closest('[data-asp]'); if (!b) return; asp = b.dataset.asp; $$('[data-asp]', d).forEach(x => x.setAttribute('aria-pressed', x === b)); };
      const fromB = $('#gFrom', d);
      if (fromB) fromB.onclick = () => { $('#gP', d).value = [scene, hint.replace(/^\d+쪽 [^—]*— ?/, ''), text].filter(Boolean).join('\n').slice(0, 1200); $('#gP', d).focus(); };
      $('#gUse', d).onclick = () => fin(last);
      $('#gGo', d).onclick = async () => {
        const prompt = $('#gP', d).value.trim();
        if (prompt.replace(/\s/g, '').length < 4) { $('#gErr', d).textContent = '어떤 장면인지 조금 더 적어 주세요.'; return; }
        const o = opts.find(x => x.v === $('#gS', d).value) || opts[opts.length - 1];
        const go1 = $('#gGo', d), out = $('#gOut', d);
        go1.disabled = true; $('#gUse', d).disabled = true; $('#gErr', d).textContent = '';
        out.hidden = false; out.innerHTML = '<div class="gen-wait"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><p>그리는 중이에요… 30초~1분쯤 걸려요. 창을 닫지 말고 기다려 주세요.</p></div>';
        try {
          const r = await makeImage({ prompt, style: o.prompt, aspect: asp, owner });
          last = r.im; if (r.left != null) left = r.left;
          out.innerHTML = `<img src="${esc(last.url)}" alt="AI가 그린 그림"><p class="muted small">사진첩에도 담겼어요. 마음에 안 들면 설명을 고쳐서 다시 만들어 보세요.</p>`;
          $('#gUse', d).hidden = false;
        } catch (err) {
          $('#gErr', d).textContent = err.message;
          out.innerHTML = last ? `<img src="${esc(last.url)}" alt="">` : ''; out.hidden = !last;
        } finally {
          go1.textContent = goLabel(); go1.disabled = left === 0; $('#gUse', d).disabled = false;
        }
      };
    });
  }

  // ---------- 쪽 하나를 내 책 끝에 붙이기 (내 책 쓰기 화면 밖에서) ----------
  async function appendPage(pg) {
    const track = myTrack();
    const r = await api('work_get', { track, id: '' });
    const w = r.work; const pages = Array.isArray(w.pages) ? w.pages : [];
    pages.push(Object.assign({ tpl: 'text', head: '', text: '', imgs: [] }, pg));
    await api('work_save', { track, title: w.title, pen_name: w.pen_name, intro: w.intro, pages, base: w.updated_at || '' });
    return pages.length;
  }
  const saveNote = (kind, data) => api('note_save', { kind, data });

  // ---------- 12쪽 구성표 ----------
  const ROLES = [
    { k: '제목면', tpl: 'fullText', pic: true, ph: '제목면 그림 — 내 이야기 전체를 한 장으로 보여 주는 장면' },
    { k: '글 1', tpl: 'text', ph: '첫 장면 — 언제, 어디서, 누가?' }, { k: '그림 1', tpl: 'fullSafe', pic: true, ph: '글 1 옆에 그릴 장면' },
    { k: '글 2', tpl: 'text', ph: '무슨 일이 일어나나요?' }, { k: '그림 2', tpl: 'fullSafe', pic: true, ph: '글 2 옆에 그릴 장면' },
    { k: '글 3', tpl: 'text', ph: '가장 생생한 장면' }, { k: '그림 3', tpl: 'fullSafe', pic: true, ph: '글 3 옆에 그릴 장면' },
    { k: '글 4', tpl: 'text', ph: '달라지는 것, 그때의 마음' }, { k: '그림 4', tpl: 'fullSafe', pic: true, ph: '글 4 옆에 그릴 장면' },
    { k: '글 5', tpl: 'text', ph: '마지막 장면 — 핵심 메시지로 닫기' }, { k: '그림 5', tpl: 'fullSafe', pic: true, ph: '글 5 옆에 그릴 장면' },
    { k: '지은이 소개', tpl: 'imgSmall', ph: '나와 가곡동의 인연, 내 사진이나 그림' }
  ];
  async function openPlan({ owner = '', title = '' } = {}) {
    let plan, iv;
    try { [plan, iv] = await Promise.all([api('note_get', { kind: 'plan', id: owner }), api('note_get', { kind: 'interview', id: owner })]); }
    catch (err) { toast(err.message, true); return null; }
    const P = Object.assign({ topic: '', reader: '', message: '', title: '', rows: [] }, plan.data);
    const I = iv.data || {};
    if (!P.topic && I.topic) P.topic = I.topic; if (!P.reader && I.reader) P.reader = I.reader; if (!P.message && I.message) P.message = I.message;
    if (!P.title) P.title = title;
    P.rows = ROLES.map((_, i) => P.rows[i] || '');
    return new Promise(resolve => {
      let done = false, saveT = null;
      const save = () => { clearTimeout(saveT); saveT = null; return api('note_save', { kind: 'plan', data: P, id: owner }).then(() => { const s = $('#plState', d); if (s) s.textContent = '저장했어요'; }).catch(() => {}); };
      const later = () => { const s = $('#plState', d); if (s) s.textContent = '고치는 중…'; clearTimeout(saveT); saveT = setTimeout(save, 1200); };
      const d = modal(`<h2>12쪽 구성표</h2>
        <p class="muted">제목면 → 글·그림 5쌍 → 지은이 소개, 모두 12쪽이에요. 칸마다 그 쪽에 들어갈 장면을 짧게 적어 주세요. 그림 쪽에 적은 장면은 "AI로 그림 만들기"에 그대로 들어가요.</p>
        <div class="plan-top">
          <label class="f">주제<input data-k="topic" value="${esc(P.topic)}" placeholder="예) 밀양역 앞 시장에서 자란 나의 어린 시절"></label>
          <label class="f">독자<input data-k="reader" value="${esc(P.reader)}" placeholder="예) 가곡동에 새로 이사 온 이웃, 손주들"></label>
          <label class="f">핵심 메시지<input data-k="message" value="${esc(P.message)}" placeholder="예) 골목은 바뀌어도 사람의 정은 남는다"></label>
          <label class="f">작품 제목 <small>"내 책 쓰기" 맨 위 작품 제목 칸에도 적어 주세요</small><input data-k="title" value="${esc(P.title)}"></label>
        </div>
        <p class="row"><button class="btn btn-ai" id="plAi" type="button">AI에게 흐름 제안받기</button><small class="muted">위 칸과 AI 인터뷰 정리를 보고 빈 장면을 채워 줘요. 채운 뒤 마음대로 고치세요.</small></p>
        <ol class="plan-rows">${ROLES.map((r, i) => `<li class="pr ${r.pic ? 'pr-pic' : r.k === '제목면' || r.k === '지은이 소개' ? 'pr-end' : 'pr-txt'}"><span class="pr-n">${i + 1}쪽 · ${esc(r.k)}</span>
          <textarea data-row="${i}" rows="2" placeholder="${esc(r.ph)}">${esc(P.rows[i])}</textarea></li>`).join('')}</ol>
        <p class="err" id="plErr" role="alert"></p>
        <div class="row between"><span class="muted small" id="plState"></span><span class="row"><button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-main" id="plMake">이 구성표로 12쪽 만들기</button></span></div>`, 'm-plan');
      d.addEventListener('close', () => { if (saveT) save(); if (!done) { done = true; resolve(null); } });
      d.oninput = e => {
        const k = e.target.dataset.k, row = e.target.dataset.row;
        if (k) P[k] = e.target.value; else if (row != null) P.rows[+row] = e.target.value; else return;
        later();
      };
      $('#plAi', d).onclick = async () => {
        if (!aiOk() && !(await askAi())) return;
        const filled = P.rows.slice(1, 11).some(x => x.trim());
        if (filled && !(await ask('AI 제안으로 장면 칸을 채울까요?', '이미 적은 칸은 그대로 두고, 빈 칸만 채워요.', '빈 칸 채우기'))) return;
        const b = $('#plAi', d); b.disabled = true; b.textContent = '흐름을 짜는 중… (20초쯤)'; $('#plErr', d).textContent = '';
        try {
          const r = await askAI({ mode: 'plan', topic: P.topic, reader: P.reader, message: P.message, summary: I.summary || '', owner });
          const put = (i, val) => { if (val && !P.rows[i].trim()) { P.rows[i] = val; const ta = $(`[data-row="${i}"]`, d); if (ta) ta.value = val; } };
          put(0, r.cover);
          (r.scenes || []).forEach((s, j) => { put(1 + j * 2, s.text); put(2 + j * 2, s.pic); });
          if (r.title && !P.title.trim()) { P.title = r.title; $('[data-k="title"]', d).value = r.title; }
          later(); toast('흐름을 채웠어요. 내 이야기에 맞게 고쳐 주세요.');
        } catch (err) { $('#plErr', d).textContent = err.message; }
        finally { b.disabled = false; b.textContent = 'AI에게 흐름 제안받기'; }
      };
      $('#plMake', d).onclick = async () => {
        await save();
        const pages = ROLES.map((r, i) => {
          const memo = P.rows[i].trim();
          const pg = { tpl: r.tpl, head: i === 0 ? P.title.trim() : r.k === '지은이 소개' ? '지은이 소개' : '', text: '', imgs: [], hint: `${i + 1}쪽 ${r.k}${memo ? ` — ${memo}` : ` — ${r.ph}`}` };
          if (r.pic && memo) pg.scene = memo;
          return pg;
        });
        done = true; resolve(pages); d.close();
      };
    });
  }

  // ---------- AI 인터뷰 ----------
  VIEWS.interview = async (v, arg) => {
    const [nt, pr] = await Promise.all([api('note_get', { kind: 'interview' }), api('pins').catch(() => ({ pins: [] }))]);
    const D = Object.assign({ msgs: [], summary: '', topic: '', reader: '', message: '', missing: '' }, nt.data);
    const myPins = pr.pins.filter(p => p.mine);
    let seed = arg.seed || '', sending = false, saveT = null;
    const save = () => { clearTimeout(saveT); saveT = null; return saveNote('interview', D).catch(err => toast('저장하지 못했어요: ' + err.message, true)); };
    const later = () => { clearTimeout(saveT); saveT = setTimeout(save, 1200); };
    S.flush = async () => { if (saveT) await save(); };
    const answers = () => D.msgs.filter(m => m.r === 'me').length;
    const bubble = m => `<div class="bub ${m.r === 'ai' ? 'b-ai' : 'b-me'}"><p>${esc(m.t).replace(/\n/g, '<br>')}</p></div>`;
    const draw = () => {
      v.innerHTML = `<h1 class="h">AI 인터뷰</h1>
        <p class="lead">AI가 하나씩 질문하고, 내가 대답하면서 기억을 꺼내요. 충분히 이야기했으면 "정리하기"를 눌러 글감으로 모아요. 대화는 저절로 저장돼요.</p>
        ${aiOk() ? '' : '<div class="banner">AI 인터뷰를 쓰려면 AI 기능 동의가 필요해요. <button class="btn btn-small" id="iAgree">동의하기</button></div>'}
        ${!D.msgs.length ? `<section class="card iv-start">
            <label class="f">어떤 기억을 이야기해 볼까요? <small>비워 두면 AI가 처음부터 물어봐요</small>
              <input id="iSeed" value="${esc(seed)}" maxlength="300" placeholder="예) 어릴 적 밀양역 앞 시장, 가곡동으로 이사 온 날"></label>
            ${myPins.length ? `<p class="muted small">이야기 지도에 남긴 내 장소에서 고르기</p><div class="chips">${myPins.map(p => `<button class="chip-b" data-seed="${esc([p.place, p.era, p.memo].filter(Boolean).join(' · '))}">${esc(p.place)}</button>`).join('')}</div>` : ''}
            <button class="btn btn-main btn-wide" id="iStart">인터뷰 시작하기</button></section>`
        : `<section class="chat" id="chat">${D.msgs.map(bubble).join('')}</section>
          <form class="send" id="iForm"><label class="sr" for="iMsg">대답</label>
            <textarea id="iMsg" rows="3" placeholder="생각나는 대로 편하게 적어 주세요. 휴대폰 키보드의 마이크 버튼으로 말해도 돼요."></textarea>
            <button class="btn btn-main" id="iSend">보내기</button></form>
          <div class="row"><button class="btn btn-ai" id="iSum" ${answers() ? '' : 'disabled'}>지금까지 이야기 정리하기</button><button class="btn btn-ghost btn-small" id="iReset">처음부터 다시</button></div>`}
        ${D.summary ? `<section class="card iv-sum"><h2 class="h2">글감 정리 <small>고쳐도 돼요</small></h2>
            <label class="f">정리<textarea id="sSummary" rows="8">${esc(D.summary)}</textarea></label>
            <label class="f">주제<input id="sTopic" value="${esc(D.topic)}"></label>
            <label class="f">독자<input id="sReader" value="${esc(D.reader)}"></label>
            <label class="f">핵심 메시지<input id="sMessage" value="${esc(D.message)}"></label>
            ${D.missing ? `<p class="tip"><b>더 떠올려 보면 좋을 것</b> ${esc(D.missing)}</p>` : ''}
            <div class="row"><button class="btn btn-main" id="iToBook">내 책에 새 쪽으로 넣기</button><button class="btn" id="iToPlan">12쪽 구성표에 주제 옮기기</button></div></section>` : ''}`;
      const ch = $('#chat', v); if (ch) ch.scrollTop = ch.scrollHeight;
    };
    draw();
    const ask1 = async () => {
      if (sending) return; sending = true;
      const ch = $('#chat', v);
      if (ch) { ch.insertAdjacentHTML('beforeend', '<div class="bub b-ai typing"><p><span class="dots"><i></i><i></i><i></i></span></p></div>'); ch.scrollTop = ch.scrollHeight; }
      $$('#iSend, #iSum, #iStart', v).forEach(b => { b.disabled = true; });
      try {
        const r = await askAI({ mode: 'ask', msgs: D.msgs, seed: D.seed || '' });
        D.msgs.push({ r: 'ai', t: r.text }); await save();
      } catch (err) { toast(err.message, true); }
      finally { sending = false; draw(); const ta = $('#iMsg', v); if (ta) ta.focus(); }
    };
    v.oninput = e => {
      const map = { sSummary: 'summary', sTopic: 'topic', sReader: 'reader', sMessage: 'message' };
      if (map[e.target.id]) { D[map[e.target.id]] = e.target.value; later(); }
      if (e.target.id === 'iSeed') seed = e.target.value;
    };
    v.onsubmit = async e => {
      e.preventDefault();
      const ta = $('#iMsg', v); const t = ta.value.trim(); if (!t || sending) return;
      if (!aiOk() && !(await askAi())) return;
      D.msgs.push({ r: 'me', t }); draw(); await ask1();
    };
    v.onclick = async e => {
      if (e.target.closest('#iAgree')) { if (await askAi()) draw(); return; }
      const sd = e.target.closest('[data-seed]'); if (sd) { seed = sd.dataset.seed; $('#iSeed', v).value = seed; return; }
      if (e.target.closest('#iStart')) {
        if (!aiOk() && !(await askAi())) return;
        D.seed = seed.trim(); draw(); await ask1(); return;
      }
      if (e.target.closest('#iReset')) {
        if (!(await ask('인터뷰를 처음부터 다시 할까요?', '지금까지 나눈 대화가 지워져요. 아래 글감 정리는 남아요.', '다시 하기'))) return;
        D.msgs = []; D.seed = ''; seed = ''; await save(); draw(); return;
      }
      const sm = e.target.closest('#iSum');
      if (sm) {
        if (!aiOk() && !(await askAi())) return;
        if (D.summary && !(await ask('글감 정리를 새로 할까요?', '지금 정리 칸에 고친 내용은 새 정리로 바뀌어요.', '새로 정리하기'))) return;
        await busy(sm, '정리하는 중… (20초쯤)', async () => {
          const r = await askAI({ mode: 'sum', msgs: D.msgs });
          Object.assign(D, { summary: r.summary, topic: r.topic, reader: r.reader, message: r.message, missing: r.missing });
          await save(); draw(); toast('정리했어요. 아래에서 확인하고 고쳐 주세요.');
          const s = $('.iv-sum', v); if (s) s.scrollIntoView({ behavior: 'smooth' });
        });
        return;
      }
      const tb = e.target.closest('#iToBook');
      if (tb) {
        await busy(tb, '넣는 중…', async () => {
          await save();
          const n = await appendPage({ tpl: 'text', text: D.summary, hint: 'AI 인터뷰 정리 — 이 메모를 바탕으로 내 말로 다시 써 보세요.' });
          toast(`내 책 ${n}번째 쪽에 넣었어요. "내 책 쓰기"에서 다듬어 주세요.`);
        });
        return;
      }
      const tp = e.target.closest('#iToPlan');
      if (tp) {
        await busy(tp, '옮기는 중…', async () => {
          const cur = (await api('note_get', { kind: 'plan' })).data || {};
          const has = cur.topic || cur.reader || cur.message;
          if (has && !(await ask('구성표의 주제·독자·핵심 메시지를 바꿀까요?', '구성표에 이미 적어 둔 내용이 있어요.', '바꾸기'))) return;
          await saveNote('plan', { ...cur, topic: D.topic, reader: D.reader, message: D.message });
          toast('옮겼어요. "내 책 쓰기" → "12쪽 구성표"에서 이어서 하세요.');
        });
      }
    };
  };

  // ---------- 이야기 지도 ----------
  VIEWS.map = async v => {
    let pins = (await api('pins')).pins, onlyMine = false, map = null, layer = null;
    const M = Object.assign({ lat: 35.4755, lng: 128.77, zoom: 15 }, C.map || {});
    v.innerHTML = `<h1 class="h">이야기 지도</h1>
      <p class="lead">기억 속 장소를 지도에 남겨요. <b>지도에서 그 자리를 누르면</b> 장소와 기억을 적을 수 있어요. 함께 수업하는 분들이 남긴 장소도 같이 보여요.</p>
      <div class="row map-tools"><button class="btn btn-small" id="mMine" aria-pressed="false">내 장소만 보기</button><span class="legend"><i class="lg-me"></i>내 장소 <i class="lg-ot"></i>다른 분 장소</span></div>
      <div id="ysmap" class="ysmap" role="application" aria-label="이야기 지도"></div>
      <h2 class="h2">남긴 장소 <small id="pinN"></small></h2><ul class="pin-list" id="pinList"></ul>`;
    const shown = () => pins.filter(p => !onlyMine || p.mine);
    const drawList = () => {
      const list = shown();
      $('#pinN', v).textContent = `${list.length}곳`;
      $('#pinList', v).innerHTML = list.length ? list.slice().reverse().map(p => `<li><button class="pin-row ${p.mine ? 'mine' : ''}" data-pin="${p.id}">
          <b>${esc(p.place)}</b>${p.era ? ` <span class="muted">${esc(p.era)}</span>` : ''}<small>${esc(p.name)}</small>${p.memo ? `<span class="pin-memo">${esc(p.memo)}</span>` : ''}</button></li>`).join('')
        : '<li class="muted">아직 남긴 장소가 없어요. 지도에서 기억 속 장소를 눌러 보세요.</li>';
    };
    const drawMarks = () => {
      if (!map) return;
      layer.clearLayers();
      shown().forEach(p => {
        const mk = window.L.circleMarker([p.lat, p.lng], { radius: p.mine ? 11 : 8, weight: 3, color: '#fff', fillColor: p.mine ? '#C2572D' : '#2F5D8A', fillOpacity: .95 });
        mk.bindTooltip(p.place, { direction: 'top', offset: [0, -8] });
        mk.on('click', () => pinDialog(p));
        mk.addTo(layer);
      });
    };
    const reload = async () => { pins = (await api('pins')).pins; drawMarks(); drawList(); };
    const form = (p = {}) => `<label class="f">장소 이름<input id="pPlace" maxlength="60" value="${esc(p.place || '')}" placeholder="예) 밀양역 앞 시장, 가곡초등학교 운동장"></label>
        <label class="f">언제 <small>대충이어도 돼요</small><input id="pEra" maxlength="40" value="${esc(p.era || '')}" placeholder="예) 1980년대, 초등학생 때, 결혼한 해"></label>
        <label class="f">어떤 기억이 있나요?<textarea id="pMemo" rows="4" maxlength="600" placeholder="그곳에서 본 것, 들은 것, 만난 사람…">${esc(p.memo || '')}</textarea></label>
        <p class="err" id="pErr" role="alert"></p>`;
    const addDialog = ll => {
      const d = modal(`<h2>여기에 기억 남기기</h2>${form()}
        <p class="muted small">함께 수업하는 분들이 볼 수 있어요.</p>
        <div class="row end"><button class="btn btn-ghost" data-close>취소</button><button class="btn btn-main" id="pSave">남기기</button></div>`, 'm-pin');
      setTimeout(() => $('#pPlace', d).focus(), 50);
      $('#pSave', d).onclick = async () => {
        try { await api('pin_add', { lat: ll.lat, lng: ll.lng, place: $('#pPlace', d).value, era: $('#pEra', d).value, memo: $('#pMemo', d).value }); d.close(); toast('지도에 남겼어요.'); await reload(); }
        catch (err) { $('#pErr', d).textContent = err.message; }
      };
    };
    const pinDialog = p => {
      const can = p.mine || isStaff();
      const d = modal(`<h2>${esc(p.place)}</h2><p class="muted">${esc(p.name)}${p.era ? ` · ${esc(p.era)}` : ''}</p>
        ${p.memo ? `<p class="pin-big">${esc(p.memo).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="stack">
          ${p.mine ? '<button class="btn btn-ai" id="pIv">이 기억으로 AI 인터뷰 하기</button><button class="btn" id="pBook">내 책에 이 기억으로 쪽 만들기</button>' : ''}
          ${can ? '<button class="btn" id="pEdit">고치기</button><button class="btn btn-ghost btn-danger" id="pDel">지우기</button>' : ''}
          <button class="btn btn-ghost" data-close>닫기</button></div>`, 'm-pin');
      const on = (id, fn) => { const b = $(id, d); if (b) b.onclick = fn; };
      on('#pIv', () => { d.close(); go('interview', { seed: [p.place, p.era, p.memo].filter(Boolean).join(' · ') }); });
      on('#pBook', async () => {
        try { const n = await appendPage({ tpl: 'imgTop', head: p.place, text: p.memo, hint: `이야기 지도 — ${p.place}${p.era ? ` (${p.era})` : ''}`, scene: [p.place, p.era, p.memo].filter(Boolean).join(', ').slice(0, 300) }); d.close(); toast(`내 책 ${n}번째 쪽으로 넣었어요.`); }
        catch (err) { toast(err.message, true); }
      });
      on('#pDel', async () => {
        if (!(await ask(`"${p.place}"를 지도에서 지울까요?`, '', '지우기'))) return;
        try { await api('pin_del', { pid: p.id }); d.close(); await reload(); } catch (err) { toast(err.message, true); }
      });
      on('#pEdit', () => {
        d.close();
        const e = modal(`<h2>장소 고치기</h2>${form(p)}<div class="row end"><button class="btn btn-ghost" data-close>취소</button><button class="btn btn-main" id="pSave">저장</button></div>`, 'm-pin');
        $('#pSave', e).onclick = async () => {
          try { await api('pin_set', { pid: p.id, place: $('#pPlace', e).value, era: $('#pEra', e).value, memo: $('#pMemo', e).value }); e.close(); toast('고쳤어요.'); await reload(); }
          catch (err) { $('#pErr', e).textContent = err.message; }
        };
      });
    };
    if (window.L) {
      map = window.L.map($('#ysmap', v), { zoomControl: true, tap: true }).setView([M.lat, M.lng], M.zoom);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      layer = window.L.layerGroup().addTo(map);
      map.on('click', e => addDialog(e.latlng));
      setTimeout(() => map.invalidateSize(), 60);
      S.cleanup = () => { map.remove(); map = null; };
    } else {
      $('#ysmap', v).outerHTML = `<div class="empty"><p>지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요. 지도 없이 장소를 적으려면</p><button class="btn" id="mNoMap">장소 적기</button></div>`;
      $('#mNoMap', v).onclick = () => addDialog({ lat: M.lat, lng: M.lng });
    }
    drawMarks(); drawList();
    v.onclick = e => {
      const mm = e.target.closest('#mMine');
      if (mm) { onlyMine = !onlyMine; mm.setAttribute('aria-pressed', onlyMine); mm.textContent = onlyMine ? '모든 장소 보기' : '내 장소만 보기'; drawMarks(); drawList(); return; }
      const pr = e.target.closest('[data-pin]');
      if (pr) { const p = pins.find(x => x.id === pr.dataset.pin); if (!p) return; if (map) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 16)); pinDialog(p); }
    };
  };

  // ---------- 그림체 투표 ----------
  const PRESETS = [
    ['수채화 그림책', '맑고 투명한 수채화 그림책 삽화. 부드러운 번짐, 따뜻한 햇살, 종이 질감이 살짝 보이는 밝은 색감.'],
    ['색연필 그림', '따뜻한 색연필로 그린 그림책 삽화. 손으로 그린 선이 보이고, 파스텔 톤의 포근한 색감.'],
    ['연필 스케치와 옅은 채색', '연필 스케치 선 위에 옅은 수채 채색을 더한 삽화. 기록화 같은 차분한 분위기, 여백이 많은 구도.'],
    ['판화풍', '목판화 느낌의 삽화. 굵고 단순한 선, 서너 가지로 제한된 색, 소박하고 힘 있는 분위기.'],
    ['크레파스 동화', '크레파스와 오일파스텔로 그린 동화책 그림. 굵은 질감, 선명하고 따뜻한 색, 친근한 분위기.'],
    ['옛 사진 같은 세피아', '빛바랜 옛날 사진 같은 세피아 톤 일러스트. 1970~80년대 한국 동네의 정겨운 분위기, 부드러운 빛.']
  ];
  const SAMPLE = '가을 오후, 밀양 가곡동의 오래된 골목. 감나무 아래 평상에 할머니와 손녀가 앉아 이야기를 나누고, 담장 너머로 기차역 지붕이 살짝 보인다.';
  VIEWS.style = async v => {
    let st = await api('styles');
    const staff = isStaff();
    const draw = () => {
      const max = Math.max(1, ...st.styles.map(s => s.votes));
      v.innerHTML = `<h1 class="h">그림체</h1>
        <p class="lead">우리 책의 그림을 한 가지 그림체로 맞추면 한 권의 책처럼 보여요. 마음에 드는 그림체에 투표해 주세요. 선생님이 정하면 AI 그림을 만들 때 그 그림체가 저절로 들어가요.</p>
        ${st.picked ? `<div class="banner ok">정해진 공동 그림체: <b>${esc(st.picked.name)}</b></div>` : `<p class="muted">아직 정하지 않았어요 · 지금까지 ${st.voters}명이 투표했어요.</p>`}
        ${staff ? `<div class="row"><button class="btn btn-main" id="sAdd">그림체 후보 더하기</button>${st.styles.length ? '' : '<button class="btn" id="sPreset">추천 후보 6개 한 번에 넣기</button>'}</div>
          <p class="muted small">"AI로 견본 만들기"는 모든 후보에 같은 장면(${esc(SAMPLE.slice(0, 22))}…)을 그려서 비교하기 좋아요.</p>` : ''}
        ${st.styles.length ? `<div class="sty-grid">${st.styles.map(s => {
          const picked = st.picked && st.picked.id === s.id, mine = st.mine === s.id;
          return `<article class="sty ${mine ? 'voted' : ''} ${picked ? 'picked' : ''}">
            <div class="sty-img">${s.url ? `<button class="tile-img" data-view="${esc(s.url)}" aria-label="크게 보기"><img src="${esc(s.thumb || s.url)}" alt="" loading="lazy"></button>` : '<span>견본 그림 없음</span>'}</div>
            <div class="sty-b"><h3>${esc(s.name)}${picked ? ' <span class="chip chip-ok">정함</span>' : ''}</h3><p>${esc(s.prompt)}</p>
              <div class="vbar" aria-hidden="true"><span style="width:${Math.round(s.votes / max * 100)}%"></span></div><p class="small muted">${s.votes}표</p>
              <div class="row"><button class="btn btn-small ${mine ? '' : 'btn-main'}" data-vote="${mine ? '' : s.id}">${mine ? '투표했어요 (취소)' : '이 그림체에 투표'}</button></div>
              ${staff ? `<div class="row sty-staff"><button class="btn btn-small btn-ai" data-sample="${s.id}">AI로 견본 만들기</button><button class="btn btn-small" data-upl="${s.id}">견본 올리기</button>
                <button class="btn btn-small" data-edit="${s.id}">고치기</button><button class="btn btn-small ${picked ? '' : 'btn-main'}" data-pick="${picked ? '' : s.id}">${picked ? '정한 것 풀기' : '이걸로 정하기'}</button>
                <button class="btn btn-small btn-ghost btn-danger" data-del="${s.id}">지우기</button></div>` : ''}</div></article>`;
        }).join('')}</div>` : `<div class="empty"><p>${staff ? '그림체 후보를 더해 주세요.' : '선생님이 그림체 후보를 올리면 여기서 투표할 수 있어요.'}</p></div>`}`;
    };
    const reload = async () => { st = await api('styles'); draw(); };
    const editDialog = s => {
      const d = modal(`<h2>${s ? '그림체 고치기' : '그림체 후보 더하기'}</h2>
        <label class="f">이름<input id="yName" maxlength="40" value="${esc(s ? s.name : '')}" placeholder="예) 수채화 그림책"></label>
        <label class="f">그림체 설명 <small>AI 그림을 만들 때 이 글이 그대로 들어가요</small><textarea id="yPrompt" rows="4" maxlength="600" placeholder="예) 맑고 투명한 수채화 그림책 삽화. 부드러운 번짐, 따뜻한 햇살.">${esc(s ? s.prompt : '')}</textarea></label>
        <p class="err" id="yErr" role="alert"></p>
        <div class="row end"><button class="btn btn-ghost" data-close>취소</button><button class="btn btn-main" id="ySave">저장</button></div>`);
      $('#ySave', d).onclick = async () => {
        try { await api('style_save', { sid: s ? s.id : '', name: $('#yName', d).value, prompt: $('#yPrompt', d).value }); d.close(); await reload(); }
        catch (err) { $('#yErr', d).textContent = err.message; }
      };
    };
    draw();
    v.onclick = async e => {
      const find = id => st.styles.find(x => x.id === id);
      const vw = e.target.closest('[data-view]'); if (vw) { Y.viewPhoto(vw.dataset.view); return; }
      if (e.target.closest('#sAdd')) { editDialog(null); return; }
      const ps = e.target.closest('#sPreset');
      if (ps) { await busy(ps, '넣는 중…', async () => { for (const [name, prompt] of PRESETS) await api('style_save', { name, prompt }); await reload(); }); return; }
      const vt = e.target.closest('[data-vote]');
      if (vt) { await busy(vt, '', async () => { await api('vote', { sid: vt.dataset.vote }); await reload(); toast(vt.dataset.vote ? '투표했어요. 다른 그림체로 바꿔도 돼요.' : '투표를 취소했어요.'); }); return; }
      const ed = e.target.closest('[data-edit]'); if (ed) { editDialog(find(ed.dataset.edit)); return; }
      const pk = e.target.closest('[data-pick]');
      if (pk) {
        const s = find(pk.dataset.pick);
        if (s && !(await ask(`"${s.name}"으로 정할까요?`, '참여자가 AI 그림을 만들 때 이 그림체가 먼저 골라져요. 나중에 바꿀 수 있어요.', '정하기'))) return;
        await busy(pk, '', async () => { await api('style_pick', { sid: pk.dataset.pick }); await reload(); });
        return;
      }
      const dl = e.target.closest('[data-del]');
      if (dl) {
        const s = find(dl.dataset.del);
        if (!(await ask(`"${s.name}" 후보를 지울까요?`, '이 후보에 한 투표도 함께 지워져요.', '지우기'))) return;
        await busy(dl, '', async () => { await api('style_del', { sid: s.id }); await reload(); });
        return;
      }
      const sm = e.target.closest('[data-sample]');
      if (sm) {
        const s = find(sm.dataset.sample);
        await busy(sm, '그리는 중… (1분쯤)', async () => {
          const { im } = await makeImage({ prompt: SAMPLE, style: s.prompt, aspect: 'landscape' });
          await api('style_save', { sid: s.id, name: s.name, prompt: s.prompt, url: im.url, thumb: im.thumb }); await reload(); toast('견본을 만들었어요.');
        });
        return;
      }
      const up = e.target.closest('[data-upl]');
      if (up) {
        const s = find(up.dataset.upl); const f = await pickFile(); if (!f) return;
        await busy(up, '올리는 중…', async () => {
          const im = await uploadImage(f);
          await api('style_save', { sid: s.id, name: s.name, prompt: s.prompt, url: im.url, thumb: im.thumb }); await reload();
        });
      }
    };
  };

  // ---------- 오늘 수업 (curriculum.js의 acts → 수업 화면 class.html에 실시간으로 뜸) ----------
  const YEAR = 2026; // curriculum.js의 day("11월 3일(화)")를 날짜로 읽을 때 쓰는 해
  const sessDate = s => { const m = /(\d+)월\s*(\d+)일/.exec(s.day || ''); return m ? new Date(YEAR, +m[1] - 1, +m[2]) : null; };
  function pickSession(list) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const dated = list.filter(sessDate);
    return dated.find(s => +sessDate(s) === +t) || dated.find(s => sessDate(s) > t) || list[list.length - 1];
  }
  const hm = d => { const t = new Date(d); return `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
  VIEWS.today = async (v, arg) => {
    const cur = CUR[myTrack()]; const ss = cur.sessions;
    let s = ss.find(x => x.no === arg.no) || pickSession(ss);
    let answers = (await api('answer_get')).answers || {};
    const field = (a, f, val) => {
      const id = `f_${a.id}_${f.k}`;
      if (f.choices) return `<fieldset class="f chips-r"><legend>${esc(f.label)}</legend>${f.choices.map((c, i) => `<label class="chip-r"><input type="radio" name="${id}" id="${id}_${i}" value="${esc(c)}" ${val === c ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</fieldset>`;
      return `<label class="f" for="${id}">${esc(f.label)}${f.area ? `<textarea id="${id}" rows="3" maxlength="${f.max || 600}" placeholder="${esc(f.ph || '')}">${esc(val || '')}</textarea>`
        : `<input id="${id}" maxlength="${f.max || 100}" placeholder="${esc(f.ph || '')}" value="${esc(val || '')}">`}</label>`;
    };
    const draw = () => {
      const acts = s.acts || [];
      v.innerHTML = `<h1 class="h">오늘 수업</h1>
        <div class="chips" role="group" aria-label="회차 고르기">${ss.map(x => `<button class="chip-b ${x.no === s.no ? 'on' : ''}" data-no="${x.no}">${x.no}회 ${esc((x.day || '').replace(/\(.\)/, ''))}</button>`).join('')}</div>
        <section class="card"><p class="muted small">${s.no}회차${s.day ? ` · ${esc(s.day)}` : ''}</p><h2 class="h2">${esc(s.title)}</h2></section>
        ${acts.length ? acts.map(a => { const got = answers[a.id]; const d = (got && got.data) || {};
          return `<form class="card act" data-act="${a.id}"><h2 class="h2">${esc(a.title)}</h2>${a.desc ? `<p class="muted">${esc(a.desc)}</p>` : ''}
            ${a.fields.map(f => field(a, f, d[f.k])).join('')}
            <div class="row"><button class="btn btn-main" type="submit">${got ? '고쳐서 다시 내기' : '제출하기'}</button>
            ${got ? `<span class="muted small">제출했어요 ${hm(got.at)} · 수업 화면에 보여요</span>` : ''}</div></form>`; }).join('')
          : '<div class="empty"><p>이 회차에는 앱에서 적을 활동이 없어요. 선생님 안내를 따라 주세요.</p></div>'}
        <div class="row" style="flex-wrap:wrap"><button class="btn" data-go="map">이야기 지도 열기</button><button class="btn" data-go="interview">AI 인터뷰 열기</button><button class="btn" data-go="write">내 책 쓰기</button></div>`;
    };
    draw();
    v.onclick = e => {
      const n = e.target.closest('[data-no]'); if (n) { s = ss.find(x => x.no === +n.dataset.no); draw(); return; }
      const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
    };
    v.onsubmit = async e => {
      e.preventDefault();
      const fm = e.target.closest('form[data-act]'); if (!fm) return;
      const a = s.acts.find(x => x.id === fm.dataset.act); const data = {};
      a.fields.forEach(f => {
        const id = `f_${a.id}_${f.k}`;
        data[f.k] = f.choices ? ((fm.querySelector(`input[name="${id}"]:checked`) || {}).value || '') : fm.querySelector('#' + id).value.trim();
      });
      if (!Object.values(data).some(x => x)) { toast('한 칸 이상 적어 주세요.', true); return; }
      const b = fm.querySelector('button[type=submit]');
      await busy(b, '내는 중…', async () => {
        await api('answer_save', { act: a.id, data });
        answers[a.id] = { data, at: new Date().toISOString() }; draw(); toast('냈어요. 수업 화면에 보여요.');
      });
    };
  };

  window.YSX = { genImage, openPlan };
})();
