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
    try { j = await r.json(); } catch { throw new Error(r.status === 504 ? 'AI가 글을 쓰는 데 시간이 오래 걸렸어요. 한 번 더 눌러 주세요. 적은 내용은 그대로 남아 있어요.' : `서버가 답하지 않아요 (${r.status}). 잠시 뒤 다시 해 보고, 계속되면 운영자에게 알려 주세요.`); }
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

  // 그림 세부 설정 (그림 만들 때 고름). 고른 값은 이 기기에 기억해 둠
  const DETAIL = [
    { k: 'tech', label: '기법', opts: ['수채화', '색연필', '크레파스·오일파스텔', '유화', '목판화', '연필 스케치에 옅은 채색', '수묵 담채', '종이 콜라주', '부드러운 디지털 일러스트', '옛 그림책 인쇄 느낌'] },
    { k: 'color', label: '색감', opts: ['따뜻한 노을빛', '맑은 파스텔', '선명하고 밝은 원색', '차분한 흙빛·초록', '푸른 새벽빛', '빛바랜 세피아', '흑백'] },
    { k: 'mood', label: '분위기', opts: ['포근하고 정겨운', '밝고 활기찬', '조용하고 고요한', '신비롭고 꿈같은', '조금 쓸쓸한', '익살스럽고 유쾌한'] },
    { k: 'time', label: '시간', opts: ['이른 아침', '한낮', '해 질 녘', '밤(달빛·가로등)'] },
    { k: 'season', label: '계절', opts: ['봄(꽃)', '여름(초록·물놀이)', '가을(단풍·감)', '겨울(눈)'] },
    { k: 'view', label: '구도·시점', opts: ['인물 가까이', '인물과 배경이 반반', '멀리서 본 마을 풍경', '위에서 내려다보기', '아래에서 올려다보기', '뒷모습'] },
    { k: 'face', label: '인물 표현', opts: ['동그란 얼굴의 그림책 인물', '사실적인 사람', '귀여운 동물 의인화', '사람 없이 풍경만'] },
    { k: 'line', label: '선', opts: ['굵은 외곽선', '가늘고 섬세한 선', '외곽선 없이 색면으로'] },
    { k: 'tex', label: '질감', opts: ['도톰한 종이 질감', '붓 자국이 보이게', '매끈하게', '연필 결이 보이게'] }
  ];
  const detLoad = () => { try { return JSON.parse(localStorage.getItem('ys_imgdet') || '{}'); } catch { return {}; } };
  const detSave = d => { try { localStorage.setItem('ys_imgdet', JSON.stringify(d)); } catch { /* 무시 */ } };
  const detText = d => DETAIL.filter(g => d[g.k]).map(g => `${g.label}: ${d[g.k]}`).join(', ');

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
    let asp = aspectOf(frame), last = null; const det = detLoad();
    const goLabel = () => `${last ? '다시 만들기' : '그림 만들기'}${left != null ? ` (오늘 ${left}장 남음)` : ''}`;
    return new Promise(resolve => {
      let done = false;
      const fin = v => { if (!done) { done = true; resolve(v); } d.close(); };
      const d = modal(`<h2>AI로 그림 만들기</h2>
        <p class="muted">누가 · 어디서 · 무엇을 하는지, 계절·시간·분위기를 적으면 더 잘 그려요. 그림 안에 글자는 넣지 않아요.</p>
        <label class="f">장면 설명<textarea id="gP" rows="4" maxlength="1200" placeholder="예) 1980년대 겨울 아침, 밀양역 앞 골목에서 엄마 손을 잡고 걸어가는 여덟 살 아이. 입김이 하얗게 나오고 붕어빵 가게에서 김이 오른다.">${esc(scene)}</textarea></label>
        ${text || hint ? '<p class="tip"><button class="linkbtn" id="gFrom" type="button">이 쪽의 질문과 글 불러오기</button></p>' : ''}
        <label class="f">그림체<select id="gS">${opts.map(o => `<option value="${esc(o.v)}">${esc(o.name)}</option>`).join('')}</select></label>
        <details class="gdet" id="gDet" open><summary>그림 세부 설정 <small id="gDetSum">${esc(detText(det) || '고르지 않으면 AI가 알아서 정해요')}</small></summary>
          ${DETAIL.map(g => `<div class="dg"><span class="dg-l">${g.label}</span><div class="dg-o">${g.opts.map(o => `<button type="button" class="dchip" data-dg="${g.k}" data-dv="${esc(o)}" aria-pressed="${det[g.k] === o}">${esc(o)}</button>`).join('')}</div></div>`).join('')}
          <label class="f">더 바라는 점 <small>예) 할머니는 꽃무늬 몸빼 바지, 강아지는 누렁이</small><input id="gMore" maxlength="200" value="${esc(det.more || '')}"></label>
          <button type="button" class="linkbtn" id="gDetReset">세부 설정 모두 지우기</button></details>
        <div class="f"><span>모양 ${frame ? '<small>그림 칸에 맞춰 골라 뒀어요</small>' : ''}</span><div class="seg-btns" id="gA">
          ${[['portrait', '세로'], ['landscape', '가로'], ['square', '정사각']].map(([k, l]) => `<button type="button" data-asp="${k}" aria-pressed="${asp === k}">${l}</button>`).join('')}</div></div>
        <div class="gen-out" id="gOut" hidden></div>
        <p class="err" id="gErr" role="alert"></p>
        <div class="row end"><button class="btn btn-ghost" data-close>닫기</button>
          <button class="btn" id="gUse" hidden>${album ? '확인' : '이 그림 쓰기'}</button>
          <button class="btn btn-main" id="gGo" ${left === 0 ? 'disabled' : ''}>${goLabel()}</button></div>`, 'm-gen');
      d.addEventListener('close', () => { if (!done) { done = true; resolve(album ? last : null); } });
      $('#gDet', d).onclick = e => {
        const c = e.target.closest('[data-dg]');
        if (c) { const k = c.dataset.dg; det[k] = det[k] === c.dataset.dv ? undefined : c.dataset.dv; if (!det[k]) delete det[k];
          $$(`[data-dg="${k}"]`, d).forEach(x => x.setAttribute('aria-pressed', det[k] === x.dataset.dv)); }
        if (e.target.closest('#gDetReset')) { Object.keys(det).forEach(k => delete det[k]); $$('[data-dg]', d).forEach(x => x.setAttribute('aria-pressed', 'false')); $('#gMore', d).value = ''; }
        detSave(det); $('#gDetSum', d).textContent = detText(det) || '고르지 않으면 AI가 알아서 정해요';
      };
      $('#gMore', d).oninput = e => { const v = e.target.value.trim(); if (v) det.more = v; else delete det.more; detSave(det); };
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
          const style = [o.prompt, detText(det), det.more ? `그 밖에: ${det.more}` : ''].filter(Boolean).join('. ');
          const r = await makeImage({ prompt, style, aspect: asp, owner });
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
    (Array.isArray(pg) ? pg : [pg]).forEach(x => pages.push(Object.assign({ tpl: 'text', head: '', text: '', imgs: [] }, x)));
    await api('work_save', { track, title: w.title, pen_name: w.pen_name, intro: w.intro, pages, base: w.updated_at || '' });
    return pages.length;
  }
  const saveNote = (kind, data) => api('note_save', { kind, data });
  // 글을 '글만' 틀 두 쪽으로 나눔 (첫 쪽에 제목). 문단·문장 끝에서 자름
  async function splitTwo(head, text) {
    text = String(text || '');
    const n1 = await Book.fitLength({ tpl: 'text', head, text, imgs: [] }, myTrack());
    let cut = n1;
    if (n1 < text.length) {
      const pb = text.lastIndexOf('\n', n1), sb = Math.max(text.lastIndexOf('. ', n1), text.lastIndexOf('다.', n1) + 1, text.lastIndexOf('요.', n1) + 1);
      if (pb > n1 * 0.6) cut = pb; else if (sb > n1 * 0.6) cut = sb + 1;
    }
    const a = text.slice(0, cut).trim(), b = text.slice(cut).trim();
    const n2 = b ? await Book.fitLength({ tpl: 'text', head: '', text: b, imgs: [] }, myTrack()) : 0;
    return { a, b, fits: n2 >= b.length, over: b.slice(n2).replace(/\s/g, '').length, cap: cut + n2 };
  }

  // ---------- 12쪽 구성표 ----------
  const ROLES = [
    { k: '제목면', tpl: 'fullText', pic: true, ph: '제목면 그림 — 내 이야기 전체를 한 장으로 보여 주는 장면' },
    { k: '글 1', tpl: 'text', ph: '첫 장면 — 언제, 어디서, 누가?' }, { k: '그림 1', tpl: 'fullSafe', pic: true, ph: '글 1 옆에 그릴 장면' },
    { k: '글 2', tpl: 'text', ph: '무슨 일이 일어나나요?' }, { k: '그림 2', tpl: 'fullSafe', pic: true, ph: '글 2 옆에 그릴 장면' },
    { k: '글 3', tpl: 'text', ph: '가장 생생한 장면' }, { k: '그림 3', tpl: 'fullSafe', pic: true, ph: '글 3 옆에 그릴 장면' },
    { k: '글 4', tpl: 'text', ph: '달라지는 것, 그때의 마음' }, { k: '그림 4', tpl: 'fullSafe', pic: true, ph: '글 4 옆에 그릴 장면' },
    { k: '글 5', tpl: 'text', ph: '마지막 장면 — 핵심 메시지로 마무리' }, { k: '그림 5', tpl: 'fullSafe', pic: true, ph: '글 5 옆에 그릴 장면' },
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
        <p class="row"><button class="btn btn-ai" id="plAi" type="button">AI에게 흐름 제안받기</button><small class="muted">위 칸과 AI 인터뷰 정리를 바탕으로 빈 장면 칸을 채워 드려요. 채운 뒤에는 자유롭게 고치세요.</small></p>
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
          later(); toast('장면 칸을 채웠어요. 내 이야기에 맞게 고쳐 주세요.');
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
    const D = Object.assign({ msgs: [], summary: '', topic: '', reader: '', message: '', missing: '', done: false, essayTitle: '', essay: '' }, nt.data);
    const myPins = pr.pins.filter(p => p.mine);
    let seed = arg.seed || '', sending = false, saveT = null;
    const svState = (t, bad) => $$('.svstate', v).forEach(el => { el.textContent = t; el.classList.toggle('bad', !!bad); });
    const save = () => { clearTimeout(saveT); saveT = null; S.dirty = false; svState('저장 중…');
      return saveNote('interview', D).then(() => svState(`저장했어요 ${new Date().toTimeString().slice(0, 5)}`))
        .catch(err => { S.dirty = true; svState('저장하지 못했어요 — 인터넷 연결을 확인해 주세요', true); toast('저장하지 못했어요: ' + err.message, true); }); };
    const later = () => { clearTimeout(saveT); S.dirty = true; svState('고치는 중…'); saveT = setTimeout(save, 800); };
    S.flush = async () => { if (saveT) await save(); };
    const answers = () => D.msgs.filter(m => m.r === 'me').length;
    const bubble = m => `<div class="bub ${m.r === 'ai' ? 'b-ai' : 'b-me'}"><p>${esc(m.t).replace(/\n/g, '<br>')}</p></div>`;
    const draw = () => {
      v.innerHTML = `<h1 class="h">AI 인터뷰</h1>
        <p class="lead">AI가 하나씩 질문하고, 내가 대답하면서 기억을 꺼내요. 충분히 이야기했으면 <b>인터뷰 마치기</b>를 눌러 주세요. 이야기를 정리해 주고, 원하면 짧은 수필로도 써 줘요. 대화는 자동으로 저장돼요.</p>
        ${aiOk() ? '' : '<div class="banner">AI 인터뷰를 쓰려면 AI 기능 동의가 필요해요. <button class="btn btn-small" id="iAgree">동의하기</button></div>'}
        ${!D.msgs.length ? `<section class="card iv-start">
            <label class="f">어떤 기억을 이야기해 볼까요? <small>비워 두면 AI가 처음부터 물어봐요</small>
              <input id="iSeed" value="${esc(seed)}" maxlength="300" placeholder="예) 어릴 적 밀양역 앞 시장, 가곡동으로 이사 온 날"></label>
            ${myPins.length ? `<p class="muted small">이야기 지도에 남긴 내 장소에서 고르기</p><div class="chips">${myPins.map(p => `<button class="chip-b" data-seed="${esc([p.place, p.era, p.memo].filter(Boolean).join(' · '))}">${esc(p.place)}</button>`).join('')}</div>` : ''}
            <button class="btn btn-main btn-wide" id="iStart">인터뷰 시작하기</button></section>`
        : `<section class="chat" id="chat">${D.msgs.map(bubble).join('')}</section>
          ${D.done ? `<div class="banner ok">인터뷰를 마쳤어요. 대답 ${answers()}번, 고마워요! <button class="btn btn-small" id="iMore">이어서 더 이야기하기</button></div>`
          : `<form class="send" id="iForm"><label class="sr" for="iMsg">대답</label>
            <textarea id="iMsg" rows="3" placeholder="생각나는 대로 편하게 적어 주세요. 휴대폰 키보드의 마이크 버튼을 누르고 말로 해도 돼요."></textarea>
            <button class="btn btn-main" id="iSend">보내기</button></form>
          ${answers() >= 8 ? '<p class="tip">이야기를 충분히 들려주셨어요. 더 하고 싶은 이야기가 없으면 인터뷰를 마쳐도 좋아요.</p>' : ''}
          <div class="row"><button class="btn btn-ai" id="iSum" ${answers() ? '' : 'disabled'}>인터뷰 마치기</button><button class="btn btn-ghost btn-small" id="iReset">처음부터 다시</button></div>`}`}
        ${D.summary ? `<p class="svstate" aria-live="polite"></p><section class="card iv-sum"><h2 class="h2">인터뷰 정리 <small>AI가 정리했어요. 내 기억과 다른 곳은 고쳐 주세요</small></h2>
            <label class="f">정리<textarea id="sSummary" rows="8">${esc(D.summary)}</textarea></label>
            <label class="f">주제<input id="sTopic" value="${esc(D.topic)}"></label>
            <label class="f">독자<input id="sReader" value="${esc(D.reader)}"></label>
            <label class="f">핵심 메시지<input id="sMessage" value="${esc(D.message)}"></label>
            ${D.missing ? `<p class="tip"><b>더 떠올려 보면 좋을 것</b> ${esc(D.missing)}</p>` : ''}
            <div class="row" style="flex-wrap:wrap"><button class="btn" id="iToBook">정리를 내 책에 새 쪽으로 넣기</button><button class="btn" id="iToPlan">12쪽 구성표에 주제 옮기기</button>${D.done ? '<button class="btn btn-ai" id="iReSum">다시 정리하기</button>' : ''}</div></section>
          <section class="card iv-essay"><h2 class="h2">짧은 수필 <small>인터뷰에서 들려준 이야기로 써요</small></h2>
            ${D.essay ? `<label class="f">제목<input id="eTitle" value="${esc(D.essayTitle)}" maxlength="60"></label>
              <label class="f">본문 <small>직접 고칠 수 있어요. 고친 내용은 자동으로 저장돼요</small><textarea id="eBody" rows="14">${esc(D.essay)}</textarea></label>
              <p class="fitline" id="eFit">책 두 쪽에 들어가는지 확인하는 중…</p><p class="svstate" aria-live="polite"></p>
              <div class="row" style="flex-wrap:wrap"><button class="btn btn-main" id="iEssayBook">수필을 내 책에 넣기</button><button class="btn btn-ai" id="iFit" hidden>두 쪽에 맞게 줄이기</button><button class="btn btn-ai" id="iEssay">다시 쓰기</button></div>`
            : `<p class="muted">AI가 인터뷰 내용으로 책 두 쪽 분량(1,200자 안팎)의 수필과 제목을 써 줘요. 없는 사실은 지어내지 않고, 내 말투를 살려요. 다 쓴 뒤에는 제목과 본문을 직접 고칠 수 있어요.</p>
              <button class="btn btn-ai" id="iEssay" ${answers() >= 2 ? '' : 'disabled'}>이 이야기로 짧은 수필 쓰기</button>`}</section>` : ''}`;
      const ch = $('#chat', v); if (ch) ch.scrollTop = ch.scrollHeight;
      checkFit();
    };
    // 수필이 책 한 쪽(글만 틀)에 들어가는지 실제 조판으로 확인
    let fitT = null, fitMax = 0;
    const checkFit = () => {
      clearTimeout(fitT);
      fitT = setTimeout(async () => {
        const el = $('#eFit', v), btn = $('#iFit', v); if (!el || !window.Book) return;
        const text = D.essay || '';
        try {
          const sp = await splitTwo(D.essayTitle, text);
          const len = text.replace(/\s/g, '').length;
          if (sp.fits) { el.className = 'fitline ok'; el.textContent = sp.b ? `✓ 책 두 쪽에 들어가요 (${len}자)` : `✓ 지금은 한 쪽 분량이에요 (${len}자). 두 쪽을 채우려면 조금 더 써도 좋아요`; btn.hidden = true; }
          else { fitMax = sp.cap; el.className = 'fitline over'; el.textContent = `책 두 쪽보다 약 ${sp.over}자 길어요. 직접 줄이거나 "두 쪽에 맞게 줄이기"를 눌러 주세요.`; btn.hidden = false; }
        } catch { el.textContent = ''; }
      }, 500);
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
      const map = { sSummary: 'summary', sTopic: 'topic', sReader: 'reader', sMessage: 'message', eTitle: 'essayTitle', eBody: 'essay' };
      if (map[e.target.id]) { D[map[e.target.id]] = e.target.value; later(); if (e.target.id === 'eBody' || e.target.id === 'eTitle') checkFit(); }
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
      if (e.target.closest('#iMore')) { D.done = false; await save(); draw(); const ta = $('#iMsg', v); if (ta) ta.focus(); return; }
      const sm = e.target.closest('#iSum, #iReSum');
      if (sm) {
        if (!aiOk() && !(await askAi())) return;
        const again = sm.id === 'iReSum' || !!D.summary;
        if (sm.id === 'iSum' && !(await ask('인터뷰를 마칠까요?', '지금까지 나눈 이야기를 AI가 정리해 드려요. 나중에 "이어서 더 이야기하기"로 다시 열 수 있어요.', '마치고 정리하기'))) return;
        if (again && !(await ask('정리를 새로 할까요?', '정리 칸에 직접 고친 내용은 새 정리로 덮어써져요.', '새로 정리하기'))) { if (sm.id === 'iSum') { D.done = true; await save(); draw(); } return; }
        await busy(sm, '정리하는 중… (20초쯤)', async () => {
          const r = await askAI({ mode: 'sum', msgs: D.msgs });
          Object.assign(D, { summary: r.summary, topic: r.topic, reader: r.reader, message: r.message, missing: r.missing, done: true });
          await save(); draw(); toast('정리했어요. 아래에서 확인하고 고쳐 주세요.');
          const s = $('.iv-sum', v); if (s) s.scrollIntoView({ behavior: 'smooth' });
        });
        return;
      }
      const es = e.target.closest('#iEssay');
      if (es) {
        if (!aiOk() && !(await askAi())) return;
        if (D.essay && !(await ask('수필을 새로 쓸까요?', '지금 수필 칸에 고친 내용은 새 글로 덮어써져요.', '새로 쓰기'))) return;
        await busy(es, '수필을 쓰는 중… (30초쯤)', async () => {
          await save();
          const r = await askAI({ mode: 'essay', msgs: D.msgs, topic: D.topic, message: D.message });
          Object.assign(D, { essayTitle: r.title, essay: r.essay });
          await save(); draw(); toast('수필을 썼어요. 읽어 보고 내 말투에 맞게 고쳐 주세요.');
          const s = $('.iv-essay', v); if (s) s.scrollIntoView({ behavior: 'smooth' });
        });
        return;
      }
      const fb = e.target.closest('#iFit');
      if (fb) {
        if (!aiOk() && !(await askAi())) return;
        await busy(fb, '줄이는 중… (20초쯤)', async () => {
          await save();
          const r = await askAI({ mode: 'fit', essay: D.essay, max: Math.max(300, fitMax - 30) });
          D.essay = r.essay; await save(); draw(); toast('두 쪽에 맞게 줄였어요. 빠진 문장이 아쉬우면 직접 고쳐 주세요.');
        });
        return;
      }
      const eb = e.target.closest('#iEssayBook');
      if (eb) {
        await busy(eb, '넣는 중…', async () => {
          await save();
          const sp = await splitTwo(D.essayTitle, D.essay);
          const n = await appendPage([{ tpl: 'text', head: D.essayTitle, text: sp.a, hint: '수필 1쪽 (2회차)' }].concat(sp.b ? [{ tpl: 'text', text: sp.b, hint: '수필 2쪽 (2회차)' + (sp.fits ? '' : ' — 글이 넘치면 "넘친 글 다음 쪽으로 옮기기"를 눌러 주세요') }] : []));
          toast(`내 책 ${n}번째 쪽에 넣었어요. "내 책 쓰기"에서 다듬어 주세요.`);
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
        <label class="f">언제 <small>대략이어도 괜찮아요</small><input id="pEra" maxlength="40" value="${esc(p.era || '')}" placeholder="예) 1980년대, 초등학생 때, 결혼한 해"></label>
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
          ${p.mine ? '<button class="btn btn-ai" id="pIv">이 기억으로 AI 인터뷰하기</button><button class="btn" id="pBook">이 기억으로 내 책에 쪽 만들기</button>' : ''}
          ${can ? '<button class="btn" id="pEdit">고치기</button><button class="btn btn-ghost btn-danger" id="pDel">지우기</button>' : ''}
          <button class="btn btn-ghost" data-close>닫기</button></div>`, 'm-pin');
      const on = (id, fn) => { const b = $(id, d); if (b) b.onclick = fn; };
      on('#pIv', () => { d.close(); go('interview', { seed: [p.place, p.era, p.memo].filter(Boolean).join(' · ') }); });
      on('#pBook', async () => {
        try { const n = await appendPage({ tpl: 'imgTop', head: p.place, text: p.memo, hint: `이야기 지도 — ${p.place}${p.era ? ` (${p.era})` : ''}`, scene: [p.place, p.era, p.memo].filter(Boolean).join(', ').slice(0, 300) }); d.close(); toast(`내 책 ${n}번째 쪽으로 넣었어요.`); }
        catch (err) { toast(err.message, true); }
      });
      on('#pDel', async () => {
        if (!(await ask(`"${p.place}" 장소를 지도에서 지울까요?`, '', '지우기'))) return;
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
        <p class="lead">우리 책의 그림을 한 가지 그림체로 맞추면 한 권의 책처럼 보여요. 마음에 드는 그림체에 투표해 주세요. 선생님이 정하면 AI 그림을 만들 때 그 그림체가 자동으로 적용돼요.</p>
        ${st.picked ? `<div class="banner ok">정해진 공동 그림체: <b>${esc(st.picked.name)}</b></div>` : `<p class="muted">아직 정하지 않았어요 · 지금까지 ${st.voters}명이 투표했어요.</p>`}
        ${staff ? `<div class="row"><button class="btn btn-main" id="sAdd">그림체 후보 더하기</button>${st.styles.length ? '' : '<button class="btn" id="sPreset">추천 후보 6개 한 번에 넣기</button>'}</div>
          <p class="muted small">"AI로 견본 만들기"는 모든 후보에 같은 장면(${esc(SAMPLE.slice(0, 22))}…)을 그려서 비교하기 좋아요.</p>` : ''}
        ${st.styles.length ? `<div class="sty-grid">${st.styles.map(s => {
          const picked = st.picked && st.picked.id === s.id, mine = st.mine === s.id;
          return `<article class="sty ${mine ? 'voted' : ''} ${picked ? 'picked' : ''}">
            <div class="sty-img">${s.url ? `<button class="tile-img" data-view="${esc(s.url)}" aria-label="크게 보기"><img src="${esc(s.thumb || s.url)}" alt="" loading="lazy"></button>` : '<span>견본 그림 없음</span>'}</div>
            <div class="sty-b"><h3>${esc(s.name)}${picked ? ' <span class="chip chip-ok">선정</span>' : ''}</h3><p>${esc(s.prompt)}</p>
              <div class="vbar" aria-hidden="true"><span style="width:${Math.round(s.votes / max * 100)}%"></span></div><p class="small muted">${s.votes}표</p>
              <div class="row"><button class="btn btn-small ${mine ? '' : 'btn-main'}" data-vote="${mine ? '' : s.id}">${mine ? '투표 취소' : '이 그림체에 투표'}</button></div>
              ${staff ? `<div class="row sty-staff"><button class="btn btn-small btn-ai" data-sample="${s.id}">AI로 견본 만들기</button><button class="btn btn-small" data-upl="${s.id}">견본 올리기</button>
                <button class="btn btn-small" data-edit="${s.id}">고치기</button><button class="btn btn-small ${picked ? '' : 'btn-main'}" data-pick="${picked ? '' : s.id}">${picked ? '선정 취소' : '이 그림체로 정하기'}</button>
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
        if (s && !(await ask(`"${s.name}" 그림체로 정할까요?`, '참여자가 AI 그림을 만들 때 이 그림체가 먼저 골라져요. 나중에 바꿀 수 있어요.', '정하기'))) return;
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
          if (a.go) return `<section class="card act"><h2 class="h2">${esc(a.title)}</h2>${a.desc ? `<p class="muted">${esc(a.desc)}</p>` : ''}
            ${got ? `<p class="muted small">저장됨 ${hm(got.at)} · 수업 화면에 보여요</p>` : ''}<button class="btn btn-main" data-go="${a.go}">${esc(a.btn || '열기')}</button></section>`;
          return `<form class="card act" data-act="${a.id}"><h2 class="h2">${esc(a.title)}</h2>${a.desc ? `<p class="muted">${esc(a.desc)}</p>` : ''}
            ${a.fields.map(f => field(a, f, d[f.k])).join('')}
            <div class="row"><button class="btn btn-main" type="submit">${got ? '고쳐서 다시 제출하기' : '제출하기'}</button>
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
      await busy(b, '제출하는 중…', async () => {
        await api('answer_save', { act: a.id, data });
        answers[a.id] = { data, at: new Date().toISOString() }; draw(); toast('제출했어요. 수업 화면에 바로 보여요.');
      });
    };
  };

  // ---------- 상상 그림 이야기 (3회차): 세로 그림 1쪽 + 글 1쪽 = 한 장면, 1~2장면 ----------
  // 상상 카드 — 6가지 종류 × 6장. 글자만 고치면 앱과 수업 화면(class.js IM_CATS)에 반영돼요.
  const IM_CATS = [{"name": "말하는 사물·동물", "cards": ["만약에 밀양강 물고기가 말을 한다면", "만약에 오래된 우체통이 답장을 보낸다면", "만약에 고양이가 가곡동 길 안내를 맡는다면", "만약에 밀양역 시계가 지나간 이야기를 들려준다면", "만약에 골목 담벼락 그림이 밤마다 움직인다면", "만약에 우리 집 장독대가 할머니의 비밀을 안다면"]}, {"name": "시간 여행", "cards": ["만약에 30년 뒤 가곡동 아이가 나를 찾아온다면", "만약에 열 살의 내가 오늘 가곡동에 나타난다면", "만약에 기차에서 내리니 50년 전 밀양역이라면", "만약에 낡은 사진 속으로 걸어 들어갈 수 있다면", "만약에 100년 뒤 누군가 내 이야기책을 발견한다면", "만약에 가곡동의 하루가 거꾸로 흐른다면"]}, {"name": "사라진 것이 돌아온다면", "cards": ["만약에 사라진 가게가 하룻밤만 다시 문을 연다면", "만약에 문 닫은 옛 극장에 다시 영화가 걸린다면", "만약에 헐린 옛집이 하룻밤 다시 생겨난다면", "만약에 그리운 사람이 장날에 한 번 들른다면", "만약에 어릴 적 잃어버린 물건이 택배로 돌아온다면", "만약에 골목에서 옛 동무들 목소리가 들린다면"]}, {"name": "날씨·계절의 마법", "cards": ["만약에 가곡동에 하루 동안 눈이 펑펑 내린다면", "만약에 비가 올 때마다 옛 노래가 들린다면", "만약에 밀양강이 하룻밤 꽁꽁 얼어 길이 된다면", "만약에 한여름에 벚꽃이 다시 핀다면", "만약에 안개 속에서 또 다른 가곡동이 나타난다면", "만약에 보름달이 상상창고 지붕에 내려앉는다면"]}, {"name": "동네의 비밀", "cards": ["만약에 상상창고에 밤마다 불이 켜진다면", "만약에 가곡동 골목에 작은 기차역이 하나 더 생긴다면", "만약에 철길 아래에 비밀 통로가 있다면", "만약에 동네 큰 나무가 마을 일을 모두 기억한다면", "만약에 골목마다 숨은 문이 하나씩 있다면", "만약에 밤 12시에만 열리는 시장이 있다면"]}, {"name": "내가 주인공", "cards": ["만약에 내가 하루 동안 가곡동 동장이 된다면", "만약에 내가 투명인간이 되어 동네를 걷는다면", "만약에 내가 가곡동을 지키는 수호신이라면", "만약에 내가 이웃의 소원을 하나씩 들어준다면", "만약에 내가 새가 되어 가곡동을 내려다본다면", "만약에 내 꿈이 이웃들의 꿈과 이어진다면"]}];
  const IMAGINE = IM_CATS.flatMap(c => c.cards);
  let imCat = -1; // 지금 펼친 종류
  const STORY_ACT = 's3_story';
  const PICFR = [132, 205]; // 세로 그림 칸(안전영역 안에 가득) 비율
  VIEWS.story = async v => {
    const D = Object.assign({ card: '', idea: '', who: '', where: '', what: '', ending: '', scenes: 1, title: '', parts: [] }, ((await api('answer_get')).answers[STORY_ACT] || {}).data);
    let saveT = null;
    const svState = (t, bad) => $$('.svstate', v).forEach(el => { el.textContent = t; el.classList.toggle('bad', !!bad); });
    const save = () => { clearTimeout(saveT); saveT = null; S.dirty = false; svState('저장 중…');
      return api('answer_save', { act: STORY_ACT, data: D }).then(() => svState(`저장했어요 ${new Date().toTimeString().slice(0, 5)}`))
        .catch(err => { S.dirty = true; svState('저장하지 못했어요 — 인터넷 연결을 확인해 주세요', true); toast(err.message, true); }); };
    const later = () => { clearTimeout(saveT); S.dirty = true; svState('고치는 중…'); saveT = setTimeout(save, 800); };
    S.flush = async () => { if (saveT || S.dirty) await save(); };
    const inp = (id, k, ph, area) => area ? `<textarea id="${id}" rows="2" data-k="${k}" placeholder="${esc(ph)}">${esc(D[k])}</textarea>` : `<input id="${id}" data-k="${k}" value="${esc(D[k])}" placeholder="${esc(ph)}">`;
    if (imCat < 0 && D.card) imCat = IM_CATS.findIndex(x => x.cards.includes(D.card));
    const drawCards = () => {
      $$('[data-imcat]', v).forEach(b => b.classList.toggle('on', +b.dataset.imcat === imCat));
      const box = $('.imcards', v); if (!box) return;
      box.innerHTML = imCat < 0 ? '' : IM_CATS[imCat].cards.map(c => `<button class="chip-b ${D.card === c ? 'on' : ''}" data-card="${esc(c)}">${esc(c)}</button>`).join('');
      const now = $('.imnow', v); const html = D.card && IMAGINE.includes(D.card) ? `고른 카드 · <b>${esc(D.card)}</b>` : '';
      if (now) { now.innerHTML = html; now.hidden = !html; } else if (html) box.insertAdjacentHTML('afterend', `<p class="imnow">${html}</p>`);
    };
    const draw = () => {
      v.innerHTML = `<h1 class="h">상상 그림 이야기</h1>
        <p class="lead">가곡동을 배경으로 새로운 상상 이야기를 지어요. <b>세로 그림 한 쪽 + 글 한 쪽</b>이 한 장면이에요. AI가 초안을 쓰면 내 말로 고치고, 장면마다 그림을 만들어요.</p>
        <p class="svstate" aria-live="polite"></p>
        <section class="card"><h2 class="h2">① 상상 카드 고르기</h2>
          <p class="muted" style="margin:.2rem 0 .5rem">상상의 종류를 먼저 고르고, 마음에 드는 카드를 눌러요.</p>
          <div class="chips imcats" role="group" aria-label="상상의 종류">${IM_CATS.map((c, i) => `<button class="chip-b ${i === imCat ? 'on' : ''}" data-imcat="${i}">${esc(c.name)}</button>`).join('')}<button class="chip-b" data-imrand>아무거나 뽑기</button></div>
          <div class="chips imcards">${imCat < 0 ? '' : IM_CATS[imCat].cards.map(c => `<button class="chip-b ${D.card === c ? 'on' : ''}" data-card="${esc(c)}">${esc(c)}</button>`).join('')}</div>
          ${D.card && IMAGINE.includes(D.card) ? `<p class="imnow">고른 카드 · <b>${esc(D.card)}</b></p>` : ''}
          <label class="f" for="sCard">직접 적기<input id="sCard" data-k="card" value="${esc(IMAGINE.includes(D.card) ? '' : D.card)}" placeholder="예) 만약에 가곡동 담벼락 그림이 밤마다 움직인다면"></label>
          <label class="f" for="sIdea">이 카드로 떠오른 한 줄 <small>발표할 때 소개해요</small>${inp('sIdea', 'idea', '예) 할아버지가 우체통에서 30년 전 엄마 편지를 찾는다', true)}</label></section>
        <section class="card"><h2 class="h2">② 이야기 씨앗 <small>한두 칸만 적어도 돼요</small></h2>
          <label class="f" for="sWho">누가 (주인공)${inp('sWho', 'who', '예) 우체부 할아버지, 길고양이 누리')}</label>
          <label class="f" for="sWhere">어디서${inp('sWhere', 'where', '예) 밀양역 뒤 골목, 상상창고 앞 마당')}</label>
          <label class="f" for="sWhat">무슨 일이 생길까${inp('sWhat', 'what', '예) 우체통에서 30년 전 편지가 나온다', true)}</label>
          <label class="f" for="sEnd">어떻게 끝날까${inp('sEnd', 'ending', '예) 편지 주인을 찾아 동네 사람들이 모인다', true)}</label>
          <div class="f"><span>분량</span><div class="seg-btns" role="group">
            <button data-sc="1" aria-pressed="${+D.scenes !== 2}">2쪽 (한 장면)</button><button data-sc="2" aria-pressed="${+D.scenes === 2}">4쪽 (두 장면)</button></div></div>
          <button class="btn btn-ai btn-wide" id="sDraft">${D.parts.length ? 'AI 초안 다시 쓰기' : 'AI 초안 쓰기'}</button></section>
        ${D.parts.length ? `<section class="card"><h2 class="h2">③ 내 말로 고치기</h2>
          <label class="f" for="sTitle">제목<input id="sTitle" data-k="title" value="${esc(D.title)}" maxlength="40"></label>
          ${D.parts.map((p, i) => `<div class="scene"><h3 class="sc-h">장면 ${i + 1} <small>${i * 2 + 1}쪽 그림 · ${i * 2 + 2}쪽 글</small></h3>
            <div class="sc-row"><div class="sc-pic">${p.img && p.img.url ? `<img src="${esc(p.img.thumb || p.img.url)}" alt="장면 ${i + 1} 그림">` : '<span>세로 그림</span>'}</div>
              <div class="sc-side"><label class="f" for="sPic${i}">그림 장면 설명<textarea id="sPic${i}" rows="4" data-part="${i}" data-pk="pic">${esc(p.pic)}</textarea></label>
                <button class="btn btn-small btn-ai" data-img="${i}">${p.img && p.img.url ? 'AI로 다시 그리기' : 'AI로 세로 그림 만들기'}</button></div></div>
            <label class="f" for="sText${i}">글 <small>직접 고칠 수 있어요. 고친 내용은 자동으로 저장돼요</small><textarea id="sText${i}" rows="9" data-part="${i}" data-pk="text">${esc(p.text)}</textarea></label>
            <p class="fitline" data-fit="${i}"></p></div>`).join('')}
          <button class="btn btn-main btn-wide" id="sBook">내 책에 넣기 (${D.parts.length * 2}쪽)</button>
          <p class="muted small">"내 책 쓰기 → 책 차례 맞추기"를 쓰면 자기소개·수필과 함께 순서대로 넣어 줘요.</p></section>` : ''}`;
      checkFits();
    };
    let fitT = null;
    const checkFits = () => { clearTimeout(fitT); fitT = setTimeout(async () => {
      for (const [i, p] of D.parts.entries()) {
        const el = $(`[data-fit="${i}"]`, v); if (!el || !window.Book) continue;
        const n = await Book.fitLength({ tpl: 'text', head: i === 0 ? D.title : '', text: p.text || '', imgs: [] }, myTrack());
        const over = (p.text || '').slice(n).replace(/\s/g, '').length;
        el.className = 'fitline ' + (over ? 'over' : 'ok'); el.textContent = over ? `책 한 쪽보다 약 ${over}자 길어요. 조금 줄여 주세요.` : `✓ 책 한 쪽에 들어가요 (${(p.text || '').replace(/\s/g, '').length}자)`;
      } }, 500); };
    draw();
    v.oninput = e => {
      const k = e.target.dataset.k, pi = e.target.dataset.part;
      if (k) { D[k] = e.target.value; if (k === 'card') $$('[data-card]', v).forEach(b => b.classList.toggle('on', b.dataset.card === D.card)); }
      else if (pi != null) D.parts[+pi][e.target.dataset.pk] = e.target.value; else return;
      later(); if (k === 'title' || e.target.dataset.pk === 'text') checkFits();
    };
    v.onclick = async e => {
      const ic = e.target.closest('[data-imcat]'); if (ic) { imCat = +ic.dataset.imcat === imCat ? -1 : +ic.dataset.imcat; drawCards(); return; }
      if (e.target.closest('[data-imrand]')) { const all = IMAGINE.filter(x => x !== D.card); D.card = all[Math.floor(Math.random() * all.length)]; imCat = IM_CATS.findIndex(x => x.cards.includes(D.card)); $('#sCard', v).value = ''; drawCards(); later(); return; }
      const c = e.target.closest('[data-card]'); if (c) { D.card = c.dataset.card; $('#sCard', v).value = ''; drawCards(); later(); return; }
      const sc = e.target.closest('[data-sc]'); if (sc) { D.scenes = +sc.dataset.sc; $$('[data-sc]', v).forEach(b => b.setAttribute('aria-pressed', b === sc)); later(); return; }
      const dr = e.target.closest('#sDraft');
      if (dr) {
        if (!aiOk() && !(await askAi())) return;
        if (D.parts.length && !(await ask('초안을 다시 쓸까요?', '지금 고친 글과 그림 설명이 새 초안으로 바뀌어요. 만든 그림은 사진첩에 남아 있어요.', '다시 쓰기'))) return;
        await busy(dr, '이야기를 쓰는 중… (30초쯤)', async () => {
          const r = await askAI({ mode: 'story', card: D.card, idea: D.idea, who: D.who, where: D.where, what: D.what, ending: D.ending, scenes: D.scenes });
          D.title = r.title; D.parts = r.scenes.map(x => ({ text: x.text, pic: x.pic, img: null }));
          await save(); draw(); toast('초안을 썼어요. 내 말로 고치고 그림을 만들어 보세요.');
        });
        return;
      }
      const im = e.target.closest('[data-img]');
      if (im) {
        const i = +im.dataset.img, p = D.parts[i];
        const got = await genImage({ frame: PICFR, scene: p.pic, text: p.text });
        if (got) { p.img = got; await save(); draw(); }
        return;
      }
      const bk = e.target.closest('#sBook');
      if (bk) {
        await busy(bk, '넣는 중…', async () => { await save(); const n = await appendPage(storyPages(D)); toast(`내 책 ${n}번째 쪽까지 넣었어요. "내 책 쓰기"에서 확인해 주세요.`); });
      }
    };
  };
  const storyPages = D => D.parts.flatMap((p, i) => [
    { tpl: 'fullSafe', imgs: p.img && p.img.url ? [p.img] : [], scene: p.pic, hint: `상상 그림 이야기 — 장면 ${i + 1} 그림` },
    { tpl: 'text', head: i === 0 ? D.title : '', text: p.text, hint: `상상 그림 이야기 — 장면 ${i + 1} 글` }]);

  // ---------- 내 책 차례 맞추기: 자기소개 1쪽 + 수필 2쪽 + 상상 그림 이야기 2~4쪽 ----------
  async function openCompose({ owner = '' } = {}) {
    let ans, iv;
    try { [ans, iv] = await Promise.all([api('answer_get', { id: owner }), api('note_get', { kind: 'interview', id: owner })]); }
    catch (err) { toast(err.message, true); return null; }
    const A = ans.answers || {}, I = iv.data || {};
    const intro = Object.assign({ text: '' }, (A.book_intro || {}).data), memo = (A.s1_intro || {}).data || {};
    const story = (A[STORY_ACT] || {}).data || { parts: [] };
    const hasEssay = !!(I.essay || '').trim(), parts = (story.parts || []).length;
    return new Promise(resolve => {
      let done = false;
      const d = modal(`<h2>내 책 차례 맞추기</h2>
        <p class="muted">세 가지를 이 순서로 내 책에 넣어요. 다 넣은 뒤에도 쪽마다 고칠 수 있어요.</p>
        <ol class="cmp">
          <li><b>자기소개 · 1쪽</b> <small>작은 사진 + 소개 글 (사진은 넣은 뒤 그 쪽에서 골라요)</small>
            <textarea id="cIntro" rows="5" placeholder="나를 소개하는 글 (250~350자)">${esc(intro.text)}</textarea>
            <button class="btn btn-small btn-ai" id="cIntroAi" ${Object.values(memo).some(Boolean) ? '' : 'disabled'}>1회차 자기소개로 AI 초안 쓰기</button>
            ${Object.values(memo).some(Boolean) ? '' : '<small class="muted">1회차 "오늘 수업" 자기소개가 비어 있어서 직접 적어 주세요.</small>'}</li>
          <li><b>수필 · 2쪽</b> ${hasEssay ? `<span class="ok">✓ 「${esc(I.essayTitle || '제목 없음')}」 ${I.essay.replace(/\s/g, '').length}자</span>${I.essay.replace(/\s/g, '').length < 750 ? '<small class="warn">한 쪽 분량이에요. "AI 인터뷰" 수필 칸에서 "다시 쓰기"를 누르면 두 쪽 분량으로 다시 써 줘요. 그대로 넣어도 돼요.</small>' : ''}` : '<span class="warn">아직 없어요 — "AI 인터뷰"에서 수필을 먼저 써 주세요</span>'}</li>
          <li><b>상상 그림 이야기 · ${parts ? parts * 2 : '2~4'}쪽</b> ${parts ? `<span class="ok">✓ 「${esc(story.title || '제목 없음')}」 장면 ${parts}개, 그림 ${story.parts.filter(p => p.img && p.img.url).length}장</span>` : '<span class="warn">아직 없어요 — "상상 이야기"에서 먼저 써 주세요</span>'}</li>
        </ol>
        <p class="err" id="cErr" role="alert"></p>
        <div class="row end"><button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-main" id="cGo">이 순서로 내 책 만들기</button></div>`, 'm-plan');
      d.addEventListener('close', () => { if (!done) { done = true; resolve(null); } });
      const saveIntro = () => api('answer_save', { act: 'book_intro', data: { text: $('#cIntro', d).value }, id: owner }).catch(() => {});
      $('#cIntro', d).onchange = saveIntro;
      $('#cIntroAi', d).onclick = async e => {
        if (!aiOk() && !(await askAi())) return;
        await busy(e.target, '쓰는 중… (15초쯤)', async () => {
          const r = await askAI({ mode: 'intro', memo: [memo.call && `불리고 싶은 이름: ${memo.call}`, memo.tie && `가곡동과의 인연: ${memo.tie}`, memo.place && `기억 속 장소: ${memo.place}`].filter(Boolean).join('\n'), owner });
          $('#cIntro', d).value = r.text; await saveIntro();
        });
      };
      $('#cGo', d).onclick = async () => {
        const it = $('#cIntro', d).value.trim();
        if (!it && !hasEssay && !parts) { $('#cErr', d).textContent = '넣을 글이 아직 없어요.'; return; }
        await saveIntro();
        const pages = [];
        if (it) pages.push({ tpl: 'imgSmall', head: '나를 소개합니다', text: it, hint: '자기소개 — 작은 사진 칸에 내 사진이나 그림을 넣어 주세요' });
        if (hasEssay) { const sp = await splitTwo(I.essayTitle, I.essay); pages.push({ tpl: 'text', head: I.essayTitle, text: sp.a, hint: '수필 1쪽 (2회차)' }); if (sp.b) pages.push({ tpl: 'text', text: sp.b, hint: '수필 2쪽 (2회차)' }); }
        if (parts) pages.push(...storyPages(story));
        done = true; resolve(pages); d.close();
      };
    });
  }


  // ---------- 쪽 정리: 잘못 들어간 쪽 지우기 · 순서 바꾸기 · 글 고치기 (참여자 본인, 강사·운영자는 참여자 책도) ----------
  const PXW = 152 * 96 / 25.4;
  async function openPageManager({ owner = '', track, name = '' } = {}) {
    let r;
    try { r = await api('work_get', { track, id: owner }); } catch (err) { toast(err.message, true); return false; }
    const W = r.work; let rows = (Array.isArray(W.pages) ? W.pages : []).map(p => ({ p: JSON.parse(JSON.stringify(p)), on: false }));
    const isEmpty = p => !String(p.head || '').trim() && !String(p.text || '').trim() && !(p.imgs || []).some(i => i && i.url) && !(p.els || []).length && !p.scene && !p.hint;
    const key = p => JSON.stringify([p.tpl, (p.head || '').trim(), (p.text || '').trim(), (p.imgs || []).map(i => i && i.url), (p.els || []).length]);
    return new Promise(resolve => {
      let done = false, dirty = false;
      const d = modal(`<h2>쪽 정리${name ? ` — ${esc(name)}` : ''}</h2>
        <p class="muted">잘못 들어간 쪽을 골라 지우고, ▲▼로 순서를 바꾸고, 글을 바로 고칠 수 있어요. <b>저장</b>을 눌러야 책에 반영돼요.</p>
        <div class="pm-tools"><button class="btn btn-small" data-pm="empty">빈 쪽 고르기</button><button class="btn btn-small" data-pm="dup">겹친 쪽 고르기</button>
          <button class="btn btn-small" data-pm="none">선택 풀기</button><button class="btn btn-small btn-danger" data-pm="del">선택한 쪽 지우기</button></div>
        <ol class="pm-list" id="pmList"></ol>
        <p class="err" id="pmErr" role="alert"></p>
        <div class="row end"><button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-main" id="pmSave">저장</button></div>`, 'm-pm');
      const draw = () => {
        $('#pmList', d).innerHTML = rows.length ? rows.map((x, i) => { const p = x.p, t = Book.tpl(p.tpl);
          return `<li class="pm-row ${x.on ? 'on' : ''}">
            <label class="pm-chk"><input type="checkbox" data-pon="${i}" ${x.on ? 'checked' : ''} aria-label="${i + 1}쪽 고르기"><b>${i + 1}</b></label>
            <span class="pm-mini"><span class="mini" style="zoom:${(70 / PXW).toFixed(4)}">${Book.pageHTML(p, { track, n: i + 1, folio: false, lite: true })}</span></span>
            <div class="pm-body"><small>${esc(t.name)}${p.hint ? ` · ${esc(p.hint.slice(0, 40))}` : ''}</small>
              ${t.free ? '<p class="muted small">"내 마음대로" 쪽은 내 책 쓰기에서 고쳐요.</p>' : `${t.head ? `<input data-ph="${i}" value="${esc(p.head || '')}" placeholder="${esc(t.head)}" aria-label="${i + 1}쪽 제목">` : ''}
              <textarea data-pt="${i}" rows="3" aria-label="${i + 1}쪽 글">${esc(p.text || '')}</textarea>`}</div>
            <div class="pm-mv"><button class="icon-btn" data-up="${i}" ${i ? '' : 'disabled'} aria-label="앞으로">▲</button><button class="icon-btn" data-dn="${i}" ${i < rows.length - 1 ? '' : 'disabled'} aria-label="뒤로">▼</button></div></li>`; }).join('')
          : '<li class="muted">쪽이 없어요.</li>';
        const n = rows.filter(x => x.on).length; $('[data-pm="del"]', d).textContent = n ? `선택한 ${n}쪽 지우기` : '선택한 쪽 지우기'; $('[data-pm="del"]', d).disabled = !n;
      };
      draw();
      d.addEventListener('close', () => { if (!done) { done = true; resolve(false); } });
      d.oninput = e => { const h = e.target.dataset.ph, t = e.target.dataset.pt; if (h != null) rows[+h].p.head = e.target.value; else if (t != null) rows[+t].p.text = e.target.value; else return; dirty = true; };
      d.onclick = async e => {
        const c = e.target.closest('[data-pon]'); if (c) { rows[+c.dataset.pon].on = c.checked; draw(); return; }
        const up = e.target.closest('[data-up]'), dn = e.target.closest('[data-dn]');
        if (up || dn) { const i = +(up || dn).dataset[up ? 'up' : 'dn'], j = i + (up ? -1 : 1); [rows[i], rows[j]] = [rows[j], rows[i]]; dirty = true; draw(); return; }
        const t = e.target.closest('[data-pm]'); if (!t) return;
        const a = t.dataset.pm;
        if (a === 'empty') { let n = 0; rows.forEach(x => { if (isEmpty(x.p)) { x.on = true; n++; } }); toast(n ? `빈 쪽 ${n}개를 골랐어요.` : '빈 쪽이 없어요.'); }
        if (a === 'dup') { const seen = new Set(); let n = 0; rows.forEach(x => { const k = key(x.p); if (seen.has(k)) { x.on = true; n++; } else seen.add(k); }); toast(n ? `앞 쪽과 똑같은 쪽 ${n}개를 골랐어요.` : '겹친 쪽이 없어요.'); }
        if (a === 'none') rows.forEach(x => { x.on = false; });
        if (a === 'del') { const n = rows.filter(x => x.on).length; if (!(await ask(`${n}쪽을 지울까요?`, '저장을 눌러야 실제로 지워져요. 저장 전에는 닫기로 취소할 수 있어요.', '지우기'))) return; rows = rows.filter(x => !x.on); dirty = true; }
        draw();
      };
      $('#pmSave', d).onclick = async e => {
        if (!dirty) { done = true; resolve(false); d.close(); return; }
        await busy(e.target, '저장 중…', async () => {
          try {
            await api('work_save', { track, title: W.title, pen_name: W.pen_name, intro: W.intro, pages: rows.map(x => x.p), base: W.updated_at || '', id: owner });
            toast('쪽 정리를 저장했어요.'); done = true; resolve(true); d.close();
          } catch (err) { $('#pmErr', d).textContent = err.message === 'conflict' ? '그사이 다른 곳에서 이 책을 고쳤어요. 닫고 다시 열어 주세요.' : err.message; }
        });
      };
    });
  }
  window.YSX = { genImage, openPlan, openCompose, openPageManager };
})();
