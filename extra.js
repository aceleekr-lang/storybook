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
  async function makeImage({ prompt, style, aspect, owner, mode = 'draw', src = '' }) {
    const j = await post(C.imageUrl || '/api/image', { prompt, style, aspect, owner: owner || '', mode, src });
    const im = { ...(await store(await encode(b64Blob(j.b64, j.mime || 'image/jpeg')))), fit: 'cover', ai: true };
    await toAlbum(im, owner || '');
    return { im, left: j.left };
  }

  // 사진(파일·주소·캔버스) → 긴 변 max px JPEG data:URL (AI 서버로 보낼 크기)
  async function toData(srcAny, max = 1536) {
    let bmp;
    if (srcAny instanceof HTMLCanvasElement) bmp = srcAny;
    else if (typeof srcAny === 'string') { const r = await fetch(srcAny); if (!r.ok) throw new Error('사진을 불러오지 못했어요.'); bmp = await createImageBitmap(await r.blob()); }
    else bmp = await createImageBitmap(srcAny);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.88);
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
  async function genImage({ owner = '', frame = null, scene = '', text = '', whole = '', hint = '', album = false, photo = null } = {}) {
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
        <label class="f">장면 설명<textarea id="gP" rows="4" maxlength="3000" placeholder="예) 1980년대 겨울 아침, 밀양역 앞 골목에서 엄마 손을 잡고 걸어가는 여덟 살 아이. 입김이 하얗게 나오고 붕어빵 가게에서 김이 오른다.">${esc(scene)}</textarea></label>
        ${text || hint || whole ? `<p class="tip row" style="flex-wrap:wrap;gap:.3rem 1rem">${text || hint ? '<button class="linkbtn" id="gFrom" type="button">이 쪽 내용 불러오기</button>' : ''}${whole && whole.trim() !== text.trim() ? '<button class="linkbtn" id="gWhole" type="button">이 글 전체 불러오기</button>' : ''}</p>` : ''}
        <div class="f"><span>바탕 사진 <small>올리면 이 사진을 바탕으로 그림을 그려요 (장면 설명은 비워도 돼요)</small></span>
          <div class="row" style="gap:.5rem;flex-wrap:wrap;align-items:center"><img id="gSrcTh" class="gsrc" alt="바탕 사진" hidden><button type="button" class="btn btn-small" id="gSrc">사진 올리기</button><button type="button" class="btn btn-small btn-ghost" id="gSrcX" hidden>빼기</button></div></div>
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
      if (fromB) fromB.onclick = () => { $('#gP', d).value = [scene, text].filter(Boolean).join('\n').slice(0, 3000); $('#gP', d).focus(); };
      const wholeB = $('#gWhole', d);
      if (wholeB) wholeB.onclick = () => { $('#gP', d).value = ('이 글에서 가장 잘 어울리는 한 장면을 골라 그려 주세요.\n\n' + whole).slice(0, 3000); $('#gP', d).focus(); };
      // 바탕 사진
      let srcData = '';
      const showSrc = () => { const th = $('#gSrcTh', d); th.hidden = !srcData; if (srcData) th.src = srcData; $('#gSrcX', d).hidden = !srcData; $('#gSrc', d).textContent = srcData ? '다른 사진' : '사진 올리기'; };
      $('#gSrc', d).onclick = async () => { const f = await pickFile(); if (!f) return; try { srcData = await toData(f); showSrc(); } catch (err) { $('#gErr', d).textContent = err.message; } };
      $('#gSrcX', d).onclick = () => { srcData = ''; showSrc(); };
      if (photo && photo.url) toData(photo.url).then(x => { srcData = x; showSrc(); }).catch(() => {});
      // 만든 그림을 말로 고치기
      const fixRow = () => `<div class="gfix"><label class="f">이 그림 고치기 <small>고칠 점만 적어요. 나머지는 그대로 둬요</small><input id="gFix" placeholder="예) 하늘을 노을빛으로, 고양이를 한 마리 더, 할머니가 웃게"></label><button type="button" class="btn btn-ai" id="gFixGo">말한 대로 고치기</button></div>`;
      d.addEventListener('click', async e => {
        if (!e.target.closest('#gFixGo') || !last) return;
        const say = $('#gFix', d).value.trim(); if (say.length < 2) { $('#gErr', d).textContent = '어떻게 고칠지 적어 주세요.'; return; }
        const b = e.target.closest('#gFixGo'); b.disabled = true; $('#gErr', d).textContent = '';
        const out = $('#gOut', d); out.insertAdjacentHTML('afterbegin', '<div class="gen-wait"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><p>고치는 중이에요… 30초~1분쯤 걸려요.</p></div>');
        try { const r = await makeImage({ prompt: say, aspect: asp, owner, mode: 'revise', src: last.url }); last = r.im; if (r.left != null) left = r.left;
          out.innerHTML = `<img src="${esc(last.url)}" alt="고친 그림"><p class="muted small">고친 그림이에요. 더 고치려면 다시 적어 주세요.</p>${fixRow()}`; }
        catch (err) { $('#gErr', d).textContent = err.message; const w = $('.gen-wait', out); if (w) w.remove(); b.disabled = false; }
        finally { $('#gGo', d).textContent = goLabel(); }
      });
      $('#gUse', d).onclick = () => fin(last);
      $('#gGo', d).onclick = async () => {
        const prompt = $('#gP', d).value.trim();
        if (!srcData && prompt.replace(/\s/g, '').length < 4) { $('#gErr', d).textContent = '어떤 장면인지 조금 더 적어 주세요. 사진을 올리면 비워도 돼요.'; return; }
        const o = opts.find(x => x.v === $('#gS', d).value) || opts[opts.length - 1];
        const go1 = $('#gGo', d), out = $('#gOut', d);
        go1.disabled = true; $('#gUse', d).disabled = true; $('#gErr', d).textContent = '';
        out.hidden = false; out.innerHTML = '<div class="gen-wait"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><p>그리는 중이에요… 30초~1분쯤 걸려요. 창을 닫지 말고 기다려 주세요.</p></div>';
        try {
          const style = [o.prompt, detText(det), det.more ? `그 밖에: ${det.more}` : ''].filter(Boolean).join('. ');
          const r = await makeImage({ prompt, style, aspect: asp, owner, mode: srcData ? 'photo' : 'draw', src: srcData });
          last = r.im; if (r.left != null) left = r.left;
          out.innerHTML = `<img src="${esc(last.url)}" alt="AI가 그린 그림"><p class="muted small">사진첩에도 담겼어요. 고칠 점이 있으면 아래에 적어 보세요.</p>${fixRow()}`;
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
  // 수필: 한 쪽('글만')이 기본, 넘치면 둘째 쪽은 '글 + 아래 그림'. 문단·문장 끝에서 자름
  async function splitTwo(head, text) {
    text = String(text || '');
    const n1 = await Book.fitLength({ tpl: 'text', head, text, imgs: [] }, myTrack());
    let cut = n1;
    if (n1 < text.length) {
      const pb = text.lastIndexOf('\n', n1), sb = Math.max(text.lastIndexOf('. ', n1), text.lastIndexOf('다.', n1) + 1, text.lastIndexOf('요.', n1) + 1);
      if (pb > n1 * 0.6) cut = pb; else if (sb > n1 * 0.6) cut = sb + 1;
    }
    const a = text.slice(0, cut).trim(), b = text.slice(cut).trim();
    const n2 = b ? await Book.fitLength({ tpl: 'imgBottom', head: '', text: b, imgs: [] }, myTrack()) : 0; // 둘째 쪽 = 글 + 아래 그림
    const cont = !!b && !(/\n\s*$/.test(text.slice(0, cut)) || /^[ \t]*\n/.test(text.slice(cut)));
    return { a, b, fits: n2 >= b.length, over: b.slice(n2).replace(/\s/g, '').length, cap: cut + n2, cont };
  }

  const essayPages = (title, sp) => [{ tpl: 'text', sec: 'essay', head: title, text: sp.a, hint: '수필 (2회차)', contNext: sp.cont || undefined }].concat(sp.b ? [{ tpl: 'imgBottom', sec: 'essay', cont: sp.cont || undefined, text: sp.b, scene: `수필 「${title || ''}」 마지막 부분에 어울리는 장면`, hint: '수필 2쪽 — 아래 그림 칸을 눌러 글에 맞는 그림을 AI로 만들거나 사진을 올려요' + (sp.fits ? '' : '. 글이 넘치면 조금 줄여 주세요') }] : []);

  // ---------- 내 책 구성표: 모두 같은 순서, 쪽 수는 사람마다 다르게, 전체는 짝수 ----------
  const SECS = [
    { k: 'intro', name: '작가 소개', no: 1, min: 1, max: 1, how: '자기소개 글 + 가곡동 그림 지도' },
    { k: 'essay', name: '수필', no: 2, min: 1, max: 2, how: '한 쪽, 넘치면 둘째 쪽 아래에 그림' },
    { k: 'story', name: '상상 그림 이야기', no: 3, min: 2, max: 4, how: '세로 그림 + 글, 장면마다 두 쪽' },
    { k: 'photo', name: '사진 이야기', no: 4, min: 2, max: 4, how: '내 사진 또는 AI 그림 + 이야기' },
    { k: 'free', name: '자유 주제', no: 5, min: 2, max: 4, how: '시·산문·수필·동화 중 골라서' }
  ];
  const secOf = p => p.sec || (/작가 소개|자기소개|나를 소개/.test(p.hint || p.head || '') ? 'intro' : /수필/.test(p.hint || '') ? 'essay' : /상상/.test(p.hint || '') ? 'story' : /사진 이야기/.test(p.hint || '') ? 'photo' : /자유/.test(p.hint || '') ? 'free' : 'etc');
  const secRank = p => { const i = SECS.findIndex(x => x.k === secOf(p)); return i < 0 ? 99 : i; };
  async function openBookPlan(pages0) {
    let P = pages0.slice(), touched = false;
    return new Promise(resolve => {
      let done = false;
      const d = modal('<div id="bpIn"></div>', 'm-plan');
      const draw = () => {
        const cnt = k => P.filter(p => secOf(p) === k).length, etc = cnt('etc'), N = P.length;
        const sorted = P.every((p, i) => !i || secRank(P[i - 1]) <= secRank(p));
        $('#bpIn', d).innerHTML = `<h2>내 책 구성표</h2>
          <p class="muted">모두 같은 순서로 실어요. 쪽 수는 사람마다 달라도 되지만, <b>전체 쪽 수는 짝수</b>로 끝나야 인쇄할 때 펼침면이 맞아요.</p>
          <table class="bp"><thead><tr><th>순서</th><th>내용</th><th>쪽</th><th>지금</th></tr></thead><tbody>
          ${SECS.map((x, i) => { const n = cnt(x.k); return `<tr><td>${i + 1}</td><td><b>${x.name}</b> <small>${x.no}회차 · ${x.how}</small></td><td>${x.min === x.max ? x.min : `${x.min}~${x.max}`}</td><td class="${n ? (n < x.min || n > x.max ? 'warn' : 'ok') : 'muted'}">${n ? `${n < x.min || n > x.max ? '' : '✓ '}${n}쪽${n > x.max ? ' (많아요)' : n < x.min ? ' (모자라요)' : ''}` : (x.no > 3 ? `${x.no}회차에` : '아직')}</td></tr>`; }).join('')}
          ${etc ? `<tr><td>·</td><td>그 밖의 쪽 <small>순서대로 정렬하면 맨 뒤로 가요. 필요 없으면 "쪽 정리"로 지워요</small></td><td></td><td>${etc}쪽</td></tr>` : ''}
          </tbody></table>
          <p class="bp-sum">지금 모두 <b>${N}쪽</b> · ${N % 2 ? '<span class="warn">홀수예요 — 한 쪽을 더하거나 빼서 짝수로 맞춰 주세요</span>' : '<span class="ok">✓ 짝수</span>'}${sorted ? '' : ' · <span class="warn">순서가 섞여 있어요</span>'}</p>
          <div class="row end" style="flex-wrap:wrap">
            ${sorted ? '' : '<button class="btn" id="bpSort">구성 순서대로 정렬</button>'}
            ${N % 2 ? '<button class="btn" id="bpAdd">맨 끝에 그림 쪽 하나 더하기</button>' : ''}
            <button class="btn btn-ghost" data-close>닫기</button>${touched ? '<button class="btn btn-main" id="bpOk">이대로 내 책에 반영</button>' : ''}</div>`;
      };
      draw();
      d.addEventListener('close', () => { if (!done) { done = true; resolve(null); } });
      d.addEventListener('click', e => {
        if (e.target.closest('#bpSort')) { P = P.map((p, i) => [p, i]).sort((a, b) => secRank(a[0]) - secRank(b[0]) || a[1] - b[1]).map(x => x[0]); touched = true; draw(); }
        if (e.target.closest('#bpAdd')) { P = P.concat([{ tpl: 'fullSafe', head: '', text: '', imgs: [], hint: '짝수를 맞추려고 더한 그림 쪽 — 마무리 그림이나 사진을 넣어요' }]); touched = true; draw(); }
        if (e.target.closest('#bpOk')) { done = true; resolve(P); d.close(); }
      });
    });
  }

  // ---------- (예전) 12쪽 구성표 ----------
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
          <label class="f">작품집 제목 <small>"내 책 쓰기" 맨 위 작품집 제목 칸에도 적어 주세요</small><input data-k="title" value="${esc(P.title)}"></label>
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
            <div class="row" style="flex-wrap:wrap"><button class="btn" id="iToBook">정리를 내 책에 새 쪽으로 넣기</button>${D.done ? '<button class="btn btn-ai" id="iReSum">다시 정리하기</button>' : ''}</div></section>
          <section class="card iv-essay"><h2 class="h2">짧은 수필 <small>인터뷰에서 들려준 이야기로 써요</small></h2>
            ${D.essay ? `<label class="f">제목<input id="eTitle" value="${esc(D.essayTitle)}" maxlength="60"></label>
              <label class="f">본문 <small>직접 고칠 수 있어요. 고친 내용은 자동으로 저장돼요</small><textarea id="eBody" rows="14">${esc(D.essay)}</textarea></label>
              <p class="fitline" id="eFit">책에 들어가는지 확인하는 중…</p><p class="svstate" aria-live="polite"></p>
              <div class="row" style="flex-wrap:wrap"><button class="btn btn-main" id="iEssayBook">수필을 내 책에 넣기</button><button class="btn btn-ai" id="iFit" hidden>한 쪽에 맞게 줄이기</button><button class="btn btn-ai" id="iEssay">다시 쓰기</button></div>`
            : `<p class="muted">AI가 인터뷰 내용으로 책 한 쪽 분량(700자 안팎)의 수필과 제목을 써 줘요. 길어서 둘째 쪽으로 넘어가면 그 쪽 아래에 글에 맞는 그림을 넣어요. 없는 사실은 지어내지 않고, 내 말투를 살려요. 다 쓴 뒤에는 제목과 본문을 직접 고칠 수 있어요.</p>
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
          if (sp.fits) { el.className = 'fitline ok'; el.textContent = sp.b ? `✓ 두 쪽으로 이어져요 (${len}자). 둘째 쪽 아래에 글에 맞는 그림을 넣어요` : `✓ 책 한 쪽에 들어가요 (${len}자)`; btn.hidden = !sp.b; if (sp.b) fitMax = sp.a.length; }
          else { fitMax = sp.cap; el.className = 'fitline over'; el.textContent = `두 쪽(둘째 쪽은 그림 포함)보다 약 ${sp.over}자 길어요. 직접 줄이거나 "한 쪽에 맞게 줄이기"를 눌러 주세요.`; btn.hidden = false; fitMax = sp.a.length; }
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
          D.essay = r.essay; await save(); draw(); toast('한 쪽에 맞게 줄였어요. 빠진 문장이 아쉬우면 직접 고쳐 주세요.');
        });
        return;
      }
      const eb = e.target.closest('#iEssayBook');
      if (eb) {
        await busy(eb, '넣는 중…', async () => {
          await save();
          const sp = await splitTwo(D.essayTitle, D.essay);
          const n = await appendPage(essayPages(D.essayTitle, sp));
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
                <div class="row" style="flex-wrap:wrap;gap:.4rem"><button class="btn btn-small btn-ai" data-img="${i}">${p.img && p.img.url ? 'AI로 다시 그리기' : 'AI로 세로 그림 만들기'}</button><button class="btn btn-small" data-scup="${i}">사진·그림 올리기</button></div></div></div>
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
      const scu = e.target.closest('[data-scup]');
      if (scu) {
        const p = D.parts[+scu.dataset.scup], f = await pickFile(); if (!f) return;
        await busy(scu, '올리는 중…', async () => { const got = await uploadImage(f); p.img = got; await save(); draw(); toast('그림을 넣었어요. 세로로 꽉 차게 보여요.'); });
        return;
      }
      const im = e.target.closest('[data-img]');
      if (im) {
        const i = +im.dataset.img, p = D.parts[i];
        const got = await genImage({ frame: PICFR, scene: p.pic, text: p.text, whole: [D.title, ...D.parts.map(x => x.text)].filter(Boolean).join('\n\n') });
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
    { tpl: 'fullSafe', sec: 'story', imgs: p.img && p.img.url ? [p.img] : [], scene: p.pic, hint: `상상 그림 이야기 — 장면 ${i + 1} 그림` },
    { tpl: 'text', sec: 'story', head: i === 0 ? D.title : '', text: p.text, hint: `상상 그림 이야기 — 장면 ${i + 1} 글` }]);

  // ---------- 내 책 차례 맞추기: 자기소개 1쪽 + 수필 2쪽 + 상상 그림 이야기 2~4쪽 ----------
  // ---------- 작가 소개용 가곡동 그림 지도 (이야기 지도에 찍은 내 장소를 번호로) ----------
  const CIRC = '①②③④⑤⑥⑦⑧⑨';
  const MAPB = { lat0: 35.4655, lat1: 35.4855, lng0: 128.7555, lng1: 128.7845 }, MW = 1160, MH = 920; // 쪽의 그림 칸(116×92mm)과 같은 비율
  function gagokMap(pins) {
    const xy = (lat, lng) => [Math.min(MW - 46, Math.max(46, (lng - MAPB.lng0) / (MAPB.lng1 - MAPB.lng0) * MW)), Math.min(MH - 46, Math.max(46, (MAPB.lat1 - lat) / (MAPB.lat1 - MAPB.lat0) * MH))];
    const pts = [];
    pins.forEach((p, i) => { let [x, y] = xy(p.lat, p.lng); for (let k = 0; k < 8 && pts.some(q => Math.hypot(q[0] - x, q[1] - y) < 62); k++) { x += 44; y -= 18; } pts.push([Math.min(MW - 46, x), Math.max(46, y), i + 1]); });
    const [sx, sy] = xy(35.4745, 128.7705);
    const tree = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#9DC08B"/><circle cx="${x - r * .45}" cy="${y + r * .25}" r="${r * .7}" fill="#86B07A"/>`;
    const house = (x, y, c) => `<g transform="translate(${x} ${y})"><rect x="-22" y="-8" width="44" height="30" rx="3" fill="#F3DDB8" stroke="#B98F5A" stroke-width="3"/><path d="M-28 -6 L0 -30 L28 -6Z" fill="${c}" stroke="#8B5E34" stroke-width="3" stroke-linejoin="round"/></g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MW} ${MH}" width="${MW}" height="${MH}">
<rect width="${MW}" height="${MH}" rx="28" fill="#F7EFDD"/>
<path d="M0 170 C 230 90, 470 230, 720 150 S 1030 40, ${MW} 110 L ${MW} 0 L 0 0Z" fill="#CFE5EE"/>
<path d="M0 170 C 230 90, 470 230, 720 150 S 1030 40, ${MW} 110" fill="none" stroke="#8EC1DA" stroke-width="10"/>
<path d="M60 60 q 30 -14 60 0 t 60 0 M520 70 q 30 -14 60 0 t 60 0 M900 50 q 30 -14 60 0 t 60 0" fill="none" stroke="#A9D2E4" stroke-width="5" stroke-linecap="round"/>
<text x="120" y="118" font-size="40" fill="#4F8FB0" font-family="serif" font-weight="700">밀양강</text>
<path d="M0 ${MH} L0 760 C 90 700, 170 720, 240 780 C 300 730, 380 740, 430 ${MH}Z" fill="#CFE2BE"/>
<path d="M${MW} ${MH} L${MW} 700 C 1080 650, 1000 680, 960 760 C 900 740, 850 790, 830 ${MH}Z" fill="#CFE2BE"/>
<path d="M140 ${MH} C 260 640, 420 520, 560 470 S 900 380, ${MW} 330" fill="none" stroke="#E6D3AE" stroke-width="26" stroke-linecap="round"/>
<path d="M0 420 C 200 440, 380 520, 560 470" fill="none" stroke="#E6D3AE" stroke-width="18" stroke-linecap="round"/>
<path d="M${sx + 90} ${MH} C ${sx + 40} 700, ${sx - 10} ${sy + 80}, ${sx} ${sy} S ${sx + 30} 280, ${sx + 80} 150" fill="none" stroke="#6B5B4B" stroke-width="10"/>
<path d="M${sx + 90} ${MH} C ${sx + 40} 700, ${sx - 10} ${sy + 80}, ${sx} ${sy} S ${sx + 30} 280, ${sx + 80} 150" fill="none" stroke="#F7EFDD" stroke-width="4" stroke-dasharray="14 14"/>
<g transform="translate(${sx} ${sy})"><rect x="-74" y="-34" width="148" height="58" rx="10" fill="#FFF8EA" stroke="#6B5B4B" stroke-width="4"/><text x="0" y="8" text-anchor="middle" font-size="32" font-weight="700" fill="#4A3B2C" font-family="sans-serif">밀양역</text></g>
${house(250, 330, '#D98C6A')}${house(330, 560, '#C9A15A')}${house(470, 660, '#D98C6A')}${house(860, 520, '#B7865A')}${house(980, 250, '#D98C6A')}${house(180, 520, '#C9A15A')}
${tree(120, 290, 26)}${tree(420, 330, 22)}${tree(1040, 420, 26)}${tree(760, 690, 24)}${tree(600, 300, 20)}
<text x="${MW / 2 - 40}" y="${MH / 2 + 150}" text-anchor="middle" font-size="64" fill="#B79E7A" fill-opacity=".55" font-weight="700" font-family="serif" letter-spacing="14">가곡동</text>
${pts.map(([x, y, n]) => `<g transform="translate(${x} ${y})"><circle r="32" fill="#C0453A" stroke="#fff" stroke-width="6"/><text y="12" text-anchor="middle" font-size="34" font-weight="700" fill="#fff" font-family="sans-serif">${n}</text></g>`).join('')}
<text x="${MW - 30}" y="${MH - 24}" text-anchor="end" font-size="24" fill="#9A8466" font-family="sans-serif">그림 지도 · 위치는 대략이에요</text>
</svg>`;
    return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\n/g, '')), w: MW * 2, h: MH * 2 };
  }
  const placeLine = (p, i) => `${CIRC[i] || `(${i + 1})`} ${p.place}${p.era ? ` (${p.era})` : ''}`;

  async function openCompose({ owner = '', name = '' } = {}) {
    let ans, iv;
    let pins = [];
    try { [ans, iv, pins] = await Promise.all([api('answer_get', { id: owner }), api('note_get', { kind: 'interview', id: owner }), api('pins').then(r => r.pins || []).catch(() => [])]); }
    catch (err) { toast(err.message, true); return null; }
    const A = ans.answers || {}, I = iv.data || {};
    const intro = Object.assign({ text: '' }, (A.book_intro || {}).data), memo = (A.s1_intro || {}).data || {};
    const story = (A[STORY_ACT] || {}).data || { parts: [] };
    const myPins = pins.filter(p => (owner ? p.name === name : p.mine) && Number.isFinite(+p.lat)).slice(0, 9);
    const MAP = gagokMap(myPins), legend = myPins.length ? '지도 속 내 기억 장소\n' + myPins.map(placeLine).join('\n') : '';
    if (!intro.text && Object.values(memo).some(Boolean)) intro.text = [memo.call && `${memo.call}(이)라고 불러 주세요.`, memo.tie, memo.place && `기억 속 장소는 ${memo.place}.`].filter(Boolean).join(' ');
    const hasEssay = !!(I.essay || '').trim(), parts = (story.parts || []).length;
    return new Promise(resolve => {
      let done = false;
      const d = modal(`<h2>내 책 차례 맞추기</h2>
        <p class="muted">1·2·3회차 결과를 이 순서로 내 책에 넣어요. 다 넣은 뒤에도 쪽마다 고칠 수 있어요.</p>
        <ol class="cmp">
          <li><b>작가 소개 · 1쪽</b> <small>1회차 자기소개로 쓴 글 + 이야기 지도에 찍은 내 장소</small>
            <textarea id="cIntro" rows="5" placeholder="나를 소개하는 글 (200자 안팎)">${esc(intro.text)}</textarea>
            <div class="cmp-map"><img src="${MAP.url}" alt="가곡동 그림 지도에 내 장소 ${myPins.length}곳 표시">${myPins.length ? `<ul>${myPins.map((p, i) => `<li>${esc(placeLine(p, i))}</li>`).join('')}</ul>` : '<small class="muted">이야기 지도에 장소를 찍으면 이 그림 지도에 번호로 표시돼요.</small>'}</div>
            <button class="btn btn-small btn-ai" id="cIntroAi" ${Object.values(memo).some(Boolean) ? '' : 'disabled'}>1회차 자기소개로 AI 초안 쓰기</button>
            ${Object.values(memo).some(Boolean) ? '' : '<small class="muted">1회차 "오늘 수업" 자기소개가 비어 있어서 직접 적어 주세요.</small>'}</li>
          <li><b>수필 · 1~2쪽</b> ${hasEssay ? `<span class="ok">✓ 「${esc(I.essayTitle || '제목 미정')}」 ${I.essay.replace(/\s/g, '').length}자</span><small class="muted">한 쪽이 넘으면 둘째 쪽 아래에 글에 맞는 그림을 넣어요.</small>` : '<span class="warn">아직 없어요 — "AI 인터뷰"에서 수필을 먼저 써 주세요</span>'}</li>
          <li><b>상상 그림 이야기 · ${parts ? parts * 2 : '2~4'}쪽</b> ${parts ? `<span class="ok">✓ 「${esc(story.title || '제목 미정')}」 장면 ${parts}개, 그림 ${story.parts.filter(p => p.img && p.img.url).length}장</span>` : '<span class="warn">아직 없어요 — "상상 이야기"에서 먼저 써 주세요</span>'}</li>
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
        if (it) pages.push({ tpl: 'imgBottom', sec: 'intro', head: '작가 소개', text: it + (legend ? '\n\n' + legend : ''), imgs: [MAP], hint: '작가 소개 (1회차) — 아래는 이야기 지도에 찍은 내 장소예요' });
        if (hasEssay) pages.push(...essayPages(I.essayTitle, await splitTwo(I.essayTitle, I.essay)));
        if (parts) pages.push(...storyPages(story));
        done = true; resolve(pages); d.close();
      };
    });
  }


  // ---------- 사진 손보기: 선명하게 · 필터(사진 톤) · AI 색 되살리기 · AI 선명하게 복원 ----------
  const FILTERS = [
    ['원본', null], ['흑백', [.3, .59, .11, .3, .59, .11, .3, .59, .11, 0, 0, 0]], ['옛날 사진', [.393, .769, .189, .349, .686, .168, .272, .534, .131, 0, 0, 0]],
    ['따뜻하게', [1.08, 0, 0, 0, 1.02, 0, 0, 0, .9, 10, 4, -6]], ['시원하게', [.92, 0, 0, 0, 1, 0, 0, 0, 1.1, -6, 0, 10]],
    ['또렷한 색', 'vivid'], ['필름', [.95, .05, 0, .02, .92, .06, 0, .08, .86, 12, 8, 14]], ['밝게', [1, 0, 0, 0, 1, 0, 0, 0, 1, 22, 22, 22]]
  ];
  function applyMatrix(cx, w, h, m) {
    const im = cx.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (m === 'vivid') { const l = .3 * r + .59 * g + .11 * b; d[i] = l + (r - l) * 1.35; d[i + 1] = l + (g - l) * 1.35; d[i + 2] = l + (b - l) * 1.35; continue; }
      d[i] = m[0] * r + m[1] * g + m[2] * b + m[9]; d[i + 1] = m[3] * r + m[4] * g + m[5] * b + m[10]; d[i + 2] = m[6] * r + m[7] * g + m[8] * b + m[11];
    }
    cx.putImageData(im, 0, 0);
  }
  function sharpen(cx, w, h, amt = .6) { // 언샵 마스크(3×3)
    const src = cx.getImageData(0, 0, w, h), o = cx.createImageData(w, h), s = src.data, d = o.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!x || !y || x === w - 1 || y === h - 1) { d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255; continue; }
      for (let c = 0; c < 3; c++) { const v = s[i + c] * (1 + 4 * amt) - amt * (s[i - 4 + c] + s[i + 4 + c] + s[i - w * 4 + c] + s[i + w * 4 + c]); d[i + c] = v; }
      d[i + 3] = 255;
    }
    cx.putImageData(o, 0, 0);
  }
  async function photoTools({ url, owner = '' } = {}) {
    let base; // 지금 바탕 그림(AI 결과가 나오면 바뀜)
    const load = async u => { const r = await fetch(u); if (!r.ok) throw new Error('사진을 불러오지 못했어요.'); return createImageBitmap(await r.blob()); };
    try { base = await load(url); } catch (err) { toast(err.message, true); return null; }
    const MAX = 2400;
    let filt = 0, sharp = 0, aiUsed = false;
    return new Promise(resolve => {
      let done = false;
      const d = modal(`<h2>사진 손보기</h2>
        <p class="muted">필터는 바로 바뀌고 몇 번이든 해 볼 수 있어요. <b>AI</b> 버튼은 AI가 사진을 새로 만들어요(하루 그림 장수에서 1장씩 빠져요).</p>
        <div class="pt-view"><canvas id="ptC"></canvas></div>
        <div class="f"><span>사진 톤</span><div class="chips" id="ptF">${FILTERS.map(([n], i) => `<button type="button" class="chip-b ${i ? '' : 'on'}" data-f="${i}">${n}</button>`).join('')}</div></div>
        <div class="f"><span>선명하게</span><div class="seg-btns" id="ptS">${['그대로', '조금', '많이'].map((n, i) => `<button type="button" data-s="${i}" aria-pressed="${!i}">${n}</button>`).join('')}</div></div>
        <div class="f"><span>AI로 되살리기 <small>옛 사진·흐린 사진에 좋아요</small></span><div class="row" style="gap:.4rem;flex-wrap:wrap"><button type="button" class="btn btn-ai" data-ai="colorize">AI 색 되살리기 (흑백→컬러)</button><button type="button" class="btn btn-ai" data-ai="restore">AI 선명하게 복원</button></div></div>
        <p class="err" id="ptErr" role="alert"></p>
        <div class="row end"><button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-main" id="ptOk">이 사진 쓰기</button></div>`, 'm-gen');
      const cv = $('#ptC', d);
      const render = () => {
        const k = Math.min(1, MAX / Math.max(base.width, base.height));
        cv.width = Math.round(base.width * k); cv.height = Math.round(base.height * k);
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(base, 0, 0, cv.width, cv.height);
        if (FILTERS[filt][1]) applyMatrix(cx, cv.width, cv.height, FILTERS[filt][1]);
        if (sharp) sharpen(cx, cv.width, cv.height, sharp === 1 ? .35 : .8);
      };
      try { render(); } catch (err) { $('#ptErr', d).textContent = '이 사진은 여기서 손볼 수 없어요. 사진을 다시 올려 주세요.'; }
      d.addEventListener('close', () => { if (!done) { done = true; resolve(null); } });
      d.addEventListener('click', async e => {
        const f = e.target.closest('[data-f]'), sh = e.target.closest('[data-s]'), ai = e.target.closest('[data-ai]');
        if (f) { filt = +f.dataset.f; $$('[data-f]', d).forEach(x => x.classList.toggle('on', x === f)); render(); }
        if (sh) { sharp = +sh.dataset.s; $$('[data-s]', d).forEach(x => x.setAttribute('aria-pressed', x === sh)); render(); }
        if (ai) {
          if (!aiOk() && !(await askAi())) return;
          await busy(ai, '만드는 중… (30초~1분)', async () => {
            $('#ptErr', d).textContent = '';
            try {
              const j = await post(C.imageUrl || '/api/image', { mode: ai.dataset.ai, src: await toData(cv), prompt: '', owner });
              base = await createImageBitmap(b64Blob(j.b64, j.mime || 'image/jpeg')); filt = 0; sharp = 0; aiUsed = true;
              $$('[data-f]', d).forEach((x, i) => x.classList.toggle('on', !i)); $$('[data-s]', d).forEach((x, i) => x.setAttribute('aria-pressed', !i)); render();
              toast('AI가 손본 사진이에요. 마음에 들면 "이 사진 쓰기"를 눌러 주세요.');
            } catch (err) { $('#ptErr', d).textContent = err.message; }
          });
        }
        if (e.target.closest('#ptOk')) {
          if (!filt && !sharp && !aiUsed) { done = true; resolve(null); d.close(); return; }
          await busy(e.target.closest('#ptOk'), '저장 중…', async () => {
            try {
              const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .92));
              const im = { ...(await store(await encode(blob))), fit: 'cover' };
              await toAlbum(im, owner).catch(() => {});
              done = true; resolve(im); d.close();
            } catch (err) { $('#ptErr', d).textContent = err.message; }
          });
        }
      });
    });
  }

  // ---------- 4회차: 사진 한 장, 이야기 하나 ----------
  const PHOTO_ACT = 's4_photo';
  async function textPages(head, text, sec, hint) { // 글을 '글만' 쪽 여러 장으로 (첫 쪽에 제목)
    const out = []; let rest = String(text || '').trim(), first = true;
    while (rest && out.length < 10) {
      const n = await Book.fitLength({ tpl: 'text', head: first ? head : '', text: rest, imgs: [] }, myTrack());
      let cut = Math.max(40, n);
      if (cut < rest.length) { const pb = rest.lastIndexOf('\n', cut), sb = Math.max(rest.lastIndexOf('. ', cut), rest.lastIndexOf('다.', cut) + 1, rest.lastIndexOf('요.', cut) + 1); if (pb > cut * .6) cut = pb; else if (sb > cut * .6) cut = sb + 1; }
      const atPara = /\n\s*$/.test(rest.slice(0, cut)) || /^[ \t]*\n/.test(rest.slice(cut));
      const pgx = { tpl: 'text', sec, head: first ? head : '', text: rest.slice(0, cut).trim(), hint };
      if (out.length && out[out.length - 1]._open) pgx.cont = true;
      if (cut < rest.length && !atPara) { pgx.contNext = true; pgx._open = true; }
      out.push(pgx);
      rest = rest.slice(cut).trim(); first = false;
    }
    out.forEach(x => delete x._open);
    return out;
  }
  const LENS = [['p1', '한 쪽에 맞게'], ['p2', '두 쪽에 맞게'], ['full', '쪽수 상관없이 끝까지']];
  VIEWS.photo = async v => {
    const D = Object.assign({ photo: null, orig: null, memo: '', qa: [], len: 'full', mine: '', title: '', text: '', prev: '', toneDone: false }, ((await api('answer_get')).answers[PHOTO_ACT] || {}).data);
    const mineOk = () => String(D.mine || '').replace(/\s/g, '').length >= 20;
    let saveT = null;
    const svState = (t, bad) => $$('.svstate', v).forEach(el => { el.textContent = t; el.classList.toggle('bad', !!bad); });
    const save = () => { clearTimeout(saveT); saveT = null; S.dirty = false; svState('저장 중…');
      return api('answer_save', { act: PHOTO_ACT, data: D }).then(() => svState(`저장했어요 ${new Date().toTimeString().slice(0, 5)}`))
        .catch(err => { S.dirty = true; svState('저장하지 못했어요 — 인터넷 연결을 확인해 주세요', true); toast(err.message, true); }); };
    const later = () => { clearTimeout(saveT); S.dirty = true; svState('고치는 중…'); saveT = setTimeout(save, 800); };
    S.flush = async () => { if (saveT || S.dirty) await save(); };
    const draw = () => {
      v.innerHTML = `<h1 class="h">사진 한 장, 이야기 하나</h1>
        <p class="lead">내 사진(또는 AI 그림) 한 장으로 이야기를 써요. AI가 사진을 보고 질문하면 대답하면서 이야기를 구체화하고, 마지막에 AI 초안을 내 말로 고쳐요.</p>
        <p class="svstate" aria-live="polite"></p>
        <section class="card"><h2 class="h2">① 사진 고르기</h2>
          <div class="ph-row"><div class="ph-pic">${D.photo && D.photo.url ? `<img src="${esc(D.photo.thumb || D.photo.url)}" alt="고른 사진">` : '<span>사진이 아직 없어요</span>'}</div>
            <div class="ph-btns"><button class="btn btn-main" data-ph="up">${D.photo ? '다른 사진 올리기' : '사진 올리기'}</button>
              ${D.photo ? '<button class="btn" data-ph="tune">사진 손보기 <small>선명하게·색 되살리기·톤</small></button><button class="btn btn-ai" data-ph="art">이 사진을 그림으로</button>' : ''}
              <button class="btn btn-ai" data-ph="ai">${D.photo ? 'AI로 새 그림' : '사진이 없으면 AI로 그림'}</button>
              ${D.orig && D.photo && D.orig.url !== D.photo.url ? '<button class="btn btn-ghost" data-ph="back">처음 올린 사진으로</button>' : ''}</div></div>
          <label class="f" for="pMemo">이 사진 한 줄 <small>언제·어디서·누구와 (발표할 때 소개해요)</small><textarea id="pMemo" rows="2" data-k="memo" placeholder="예) 1985년 봄, 밀양역 앞에서 엄마와 동생이랑">${esc(D.memo)}</textarea></label></section>
        <section class="card"><h2 class="h2">② AI 질문으로 구체화 <small>대답은 짧아도 돼요</small></h2>
          ${D.qa.length ? `<ol class="qa">${D.qa.map((x, i) => `<li><p class="qa-q">${esc(x.q)}</p><textarea rows="2" data-qa="${i}" placeholder="대답을 적어 주세요">${esc(x.a || '')}</textarea></li>`).join('')}</ol>` : '<p class="muted">사진을 올리고 아래 버튼을 누르면 AI가 사진을 보고 질문 8개를 해요.</p>'}
          <div class="row" style="flex-wrap:wrap;gap:.5rem"><button class="btn btn-ai" id="pQ">${D.qa.length ? '질문 더 받기' : 'AI에게 질문 받기'}</button></div></section>
        <section class="card"><h2 class="h2">③ 이야기 쓰기 <small>네 단계로 해요</small></h2>
          <ol class="wsteps">
            <li class="ws ${mineOk() ? 'done' : 'now'}"><div class="ws-h"><b>3-1</b><span>내가 초안 쓰기</span>${mineOk() ? '<i>✓</i>' : ''}</div>
              <p class="muted">질문에 대답한 것을 떠올리며 생각나는 대로 3~5줄 써요. 맞춤법은 신경 쓰지 않아도 돼요.</p>
              <textarea id="pMine" rows="5" data-k="mine" placeholder="예) 1985년 봄, 엄마가 새 블라우스를 입고 밀양역 앞에서 사진을 찍자고 했다. 동생은 자꾸 눈을 감았다…">${esc(D.mine)}</textarea></li>
            <li class="ws ${D.text ? 'done' : mineOk() ? 'now' : ''}"><div class="ws-h"><b>3-2</b><span>AI가 구체화하기</span>${D.text ? '<i>✓</i>' : ''}</div>
              <p class="muted">내 초안을 뼈대로, 사진과 질문·대답을 더해 이야기를 살찌워요. 내 문장과 순서는 최대한 그대로 둬요.</p>
              <div class="f"><span>분량</span><div class="seg-btns" id="pLen">${LENS.map(([k, l]) => `<button type="button" data-len="${k}" aria-pressed="${D.len === k}">${l}</button>`).join('')}</div>
                <small class="muted">어느 쪽을 골라도 발단부터 결말까지 차근차근 써요.</small></div>
              <button class="btn btn-ai" id="pDraft" ${mineOk() ? '' : 'disabled'}>${D.text ? 'AI가 다시 구체화하기' : 'AI가 구체화하기'}</button>
              ${mineOk() ? '' : '<small class="muted">3-1 초안을 조금 더 써야 눌러져요 (20자 이상).</small>'}</li>
            <li class="ws ${D.toneDone ? 'done' : D.text ? 'now' : ''}"><div class="ws-h"><b>3-3</b><span>내가 말투 고치기</span>${D.toneDone ? '<i>✓</i>' : ''}</div>
              ${D.text || D.title ? `<p class="muted">세 군데만 고쳐도 내 글이 돼요: <b>내 말투</b>("정말 놀라웠다" → "아이고, 이게 뭐꼬") · <b>사진 속 한 가지</b> · <b>마지막 문장</b>.</p>
              <label class="f" for="pTitle">제목<input id="pTitle" data-k="title" value="${esc(D.title)}"></label>
              <label class="f" for="pText">글 <small>고친 내용은 자동으로 저장돼요</small><textarea id="pText" rows="12" data-k="text">${esc(D.text)}</textarea></label>
              <label class="check"><input type="checkbox" id="pTone" ${D.toneDone ? 'checked' : ''}> 내 말투로 다 고쳤어요</label>` : '<p class="muted">3-2를 하면 여기에 글이 나와요.</p>'}</li>
            <li class="ws ${D.text ? '' : ''}"><div class="ws-h"><b>3-4</b><span>길면 요약하기 <small>필요할 때만</small></span></div>
              ${D.text ? `<p class="fitline" id="pFit"></p>
              <div class="row" style="flex-wrap:wrap;gap:.4rem"><button class="btn btn-small btn-ai" data-shrink="p1">한 쪽으로</button><button class="btn btn-small btn-ai" data-shrink="p2">한 장(2쪽)으로</button><button class="btn btn-small btn-ai" data-shrink="p4">두 장(4쪽)으로</button>
                ${D.prev ? '<button class="btn btn-small btn-ghost" id="pUndo">요약 전으로 되돌리기</button>' : ''}</div>
              <small class="muted">결말까지 남기고 줄여요. 사진 이야기는 사진 포함 2~4쪽이 좋아요.</small>` : '<p class="muted">글이 생기면 쪽수를 알려 줘요.</p>'}</li>
          </ol></section>
        <section class="card"><h2 class="h2">④ 내 책에 넣기</h2>
          <p class="muted" id="pBookInfo">사진 1쪽 + 글 쪽으로 들어가요. 넣은 뒤 "내 책 쓰기"에서 다듬어요.</p>
          <button class="btn btn-main" id="pBook" ${D.text ? '' : 'disabled'}>내 책에 넣기</button></section>
        <p class="svstate" aria-live="polite"></p>`;
      checkFit();
    };
    let fitT = null;
    const checkFit = () => { clearTimeout(fitT); fitT = setTimeout(async () => {
      const el = $('#pFit', v), info = $('#pBookInfo', v); if (!el || !window.Book || !D.text) return;
      const tp = await textPages(D.title, D.text, 'photo', ''); if (!$('#pFit', v)) return;
      const n = tp.length + (D.photo ? 1 : 0), len = D.text.replace(/\s/g, '').length;
      el.className = 'fitline ' + (n <= 4 ? 'ok' : 'over');
      el.textContent = `글 ${tp.length}쪽 + 사진 ${D.photo ? 1 : 0}쪽 = ${n}쪽 (${len}자)${n > 4 ? ' — 사진 이야기는 2~4쪽이 좋아요. 요약하기로 줄여 보세요' : ''}`;
      if (info) info.textContent = `사진 ${D.photo ? 1 : 0}쪽 + 글 ${tp.length}쪽 = ${n}쪽으로 들어가요. 넣은 뒤 "내 책 쓰기"에서 다듬어요.`;
    }, 500); };
    draw();
    v.oninput = e => {
      const k = e.target.dataset.k; if (k) { const was = mineOk(); D[k] = e.target.value; later(); if (k === 'text' || k === 'title') checkFit(); if (k === 'mine' && was !== mineOk()) { const b = $('#pDraft', v); if (b) b.disabled = !mineOk(); } return; }
      const q = e.target.dataset.qa; if (q != null) { D.qa[+q].a = e.target.value; later(); }
    };
    v.onclick = async e => {
      const ph = e.target.closest('[data-ph]');
      if (ph) {
        const t = ph.dataset.ph;
        if (t === 'up') { const f = await pickFile(); if (!f) return; await busy(ph, '올리는 중…', async () => { const im = await uploadImage(f); D.photo = im; D.orig = im; await toAlbum(im, '').catch(() => {}); await save(); draw(); }); return; }
        if (t === 'tune') { const im = await photoTools({ url: D.photo.url }); if (im) { D.photo = im; await save(); draw(); } return; }
        if (t === 'art') { const im = await genImage({ frame: PICFR, photo: D.orig || D.photo, text: D.memo }); if (im) { D.photo = im; await save(); draw(); } return; }
        if (t === 'ai') { const im = await genImage({ frame: PICFR, scene: D.memo, text: D.text }); if (im) { D.photo = im; if (!D.orig) D.orig = null; await save(); draw(); } return; }
        if (t === 'back') { D.photo = D.orig; await save(); draw(); return; }
      }
      if (e.target.closest('#pQ')) {
        if (!aiOk() && !(await askAi())) return;
        await busy(e.target.closest('#pQ'), '사진을 보는 중… (15초쯤)', async () => {
          await save(); const r = await askAI({ mode: 'pq', photo: (D.orig || D.photo || {}).url || '', memo: D.memo, qa: D.qa });
          D.qa.push(...(r.qs || []).map(q => ({ q, a: '' }))); await save(); draw();
        });
        return;
      }
      const ln = e.target.closest('[data-len]'); if (ln) { D.len = ln.dataset.len; $$('[data-len]', v).forEach(x => x.setAttribute('aria-pressed', x === ln)); later(); return; }
      if (e.target.closest('#pDraft')) {
        if (D.text && !(await ask('AI가 다시 구체화할까요?', '지금 3-3의 글은 "요약 전으로 되돌리기"로 한 번 되살릴 수 있어요.', '다시 구체화하기'))) return;
        if (!aiOk() && !(await askAi())) return;
        await busy(e.target.closest('#pDraft'), '구체화하는 중… (30초~1분)', async () => {
          await save(); const base = { photo: (D.orig || D.photo || {}).url || '', memo: D.memo, qa: D.qa, len: D.len, form: '이야기', draft: D.mine };
          const r = await askAI({ mode: 'pstory', ...base }); let text = r.text || '', more = r.more;
          // 길어서 중간에 멈추면 알아서 이어 써서 결말까지 다 받음
          for (let k = 1; more && k <= 5; k++) {
            const b = $('#pDraft', v); if (b) b.textContent = `이어서 쓰는 중… (${k + 1}번째)`;
            const r2 = await askAI({ mode: 'pmore', ...base, title: r.title, text });
            const add = String(r2.text || ''); if (!add.trim()) break;
            text = /[.!?…"”’)]\s*$/.test(text) ? text.trimEnd() + '\n\n' + add.trimStart() : text + add; more = r2.more; // 문장 중간에서 끊겼으면 그대로 붙임
          }
          if (D.text) D.prev = D.text; D.title = (r.title || D.title || '').trim(); D.text = text.trim(); D.ai = D.text; D.toneDone = false; D.shrunk = ''; await save(); draw(); toast('구체화했어요. 3-3에서 내 말투로 고쳐 주세요.');
        });
        return;
      }
      const sk = e.target.closest('[data-shrink]');
      if (sk) {
        if (!aiOk() && !(await askAi())) return;
        await busy(sk, '줄이는 중…', async () => { await save(); const r = await askAI({ mode: 'shrink', text: D.text, target: sk.dataset.shrink }); D.prev = D.text; D.text = r.text; D.shrunk = { p1: '한 쪽', p2: '한 장(2쪽)', p4: '두 장(4쪽)' }[sk.dataset.shrink]; await save(); draw(); toast('줄였어요. 마음에 안 들면 "요약 전으로 되돌리기"를 눌러 주세요.'); });
        return;
      }
      if (e.target.id === 'pTone') { D.toneDone = e.target.checked; await save(); draw(); return; }
      if (e.target.closest('#pUndo')) { const t = D.text; D.text = D.prev; D.prev = t; D.shrunk = D.shrunk ? '' : D.shrunk; await save(); draw(); return; }
      if (e.target.closest('#pBook')) {
        await busy(e.target.closest('#pBook'), '넣는 중…', async () => {
          await save();
          const pages = (D.photo ? [{ tpl: 'fullSafe', sec: 'photo', imgs: [D.photo], hint: '사진 이야기 — 사진 (4회차)' }] : []).concat(await textPages(D.title, D.text, 'photo', '사진 이야기 — 글 (4회차)'));
          const n = await appendPage(pages); D.inBook = true; await save(); toast(`내 책에 ${pages.length}쪽을 넣었어요 (지금 모두 ${n}쪽). "내 책 쓰기"에서 다듬어 주세요.`);
        });
      }
    };
  };

  // ---------- 휴지통: 지운 쪽을 모아 두고 되살리기 (사람마다 하나, 최근 40묶음) ----------
  async function trashPut(owner, list, from) { // list = [{ i: 원래 자리, pg: 쪽 }]
    if (!list || !list.length) return;
    try {
      const items = ((await api('note_get', { kind: 'trash', id: owner })).data || {}).items || [];
      items.unshift({ at: new Date().toISOString(), from, idx: list.map(x => x.i), pages: list.map(x => x.pg) });
      while (items.length > 40 || JSON.stringify(items).length > 190000) items.pop();
      await api('note_save', { kind: 'trash', data: { items }, id: owner });
    } catch (err) { console.warn('휴지통 저장 실패', err); }
  }
  const pgLabel = p => String(p.head || '').trim() || String(p.text || '').trim().slice(0, 26) || ((p.imgs || []).some(i => i && i.url) ? '그림 쪽' : (p.hint ? p.hint.slice(0, 26) : '빈 쪽'));
  // 되살릴 쪽을 고르면 [{ i, pg }] 를 돌려줌
  async function openTrash({ owner = '' } = {}) {
    let items;
    try { items = ((await api('note_get', { kind: 'trash', id: owner })).data || {}).items || []; } catch (err) { toast(err.message, true); return null; }
    const saveT = () => api('note_save', { kind: 'trash', data: { items }, id: owner });
    return new Promise(resolve => {
      let done = false;
      const d = modal('<div id="trIn"></div>', 'm-plan');
      const draw = () => {
        $('#trIn', d).innerHTML = `<h2>휴지통</h2>
          <p class="muted">지운 쪽이 여기 모여요. <b>되살리기</b>를 누르면 원래 있던 자리 근처로 돌아가요. 최근 40번까지 남아요.</p>
          ${items.length ? `<ul class="tr-list">${items.map((it, k) => `<li><div><b>${new Date(it.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</b> · ${esc(it.from || '')} · ${it.pages.length}쪽
              <ul class="tr-pages">${it.pages.map((p, j) => `<li>${(it.idx[j] ?? 0) + 1}번째 쪽이었음 — ${esc(pgLabel(p))}</li>`).join('')}</ul></div>
              <div class="row" style="gap:.4rem;flex-wrap:wrap"><button class="btn btn-small btn-main" data-tr="${k}">되살리기</button><button class="btn btn-small btn-ghost btn-danger" data-trdel="${k}">완전히 지우기</button></div></li>`).join('')}</ul>` : '<p class="muted">휴지통이 비어 있어요.</p>'}
          <p class="err" id="trErr" role="alert"></p>
          <div class="row end"><button class="btn btn-ghost" data-close>닫기</button></div>`;
      };
      draw();
      d.addEventListener('close', () => { if (!done) { done = true; resolve(null); } });
      d.addEventListener('click', async e => {
        const r = e.target.closest('[data-tr]'), x = e.target.closest('[data-trdel]');
        if (!r && !x) return;
        const k = +(r || x).dataset[r ? 'tr' : 'trdel'];
        if (x && !(await ask('이 묶음을 완전히 지울까요?', '완전히 지우면 다시 되살릴 수 없어요.', '완전히 지우기'))) return;
        const it = items.splice(k, 1)[0];
        try { await saveT(); } catch (err) { items.splice(k, 0, it); $('#trErr', d).textContent = err.message; return; }
        if (r) { done = true; resolve(it.pages.map((pg, j) => ({ i: it.idx[j] ?? 9999, pg }))); d.close(); } else draw();
      });
    });
  }

  // ---------- 쪽 정리: 잘못 들어간 쪽 지우기 · 순서 바꾸기 · 글 고치기 (참여자 본인, 강사·운영자는 참여자 책도) ----------
  const PXW = 152 * 96 / 25.4;
  async function openPageManager({ owner = '', track, name = '' } = {}) {
    let r;
    try { r = await api('work_get', { track, id: owner }); } catch (err) { toast(err.message, true); return false; }
    const W = r.work; let rows = (Array.isArray(W.pages) ? W.pages : []).map((p, i) => ({ p: JSON.parse(JSON.stringify(p)), on: false, i }));
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
        if (a === 'del') { const n = rows.filter(x => x.on).length; if (!(await ask(`${n}쪽을 지울까요?`, '저장을 눌러야 실제로 지워져요. 지운 쪽은 휴지통에 모여서 되살릴 수 있어요.', '지우기'))) return; rows = rows.filter(x => !x.on); dirty = true; }
        draw();
      };
      $('#pmSave', d).onclick = async e => {
        if (!dirty) { done = true; resolve(false); d.close(); return; }
        await busy(e.target, '저장 중…', async () => {
          try {
            const kept = new Set(rows.map(x => x.i));
            await trashPut(owner, (W.pages || []).map((pg, i) => ({ i, pg })).filter(x => !kept.has(x.i)), '쪽 정리에서 지움');
            await api('work_save', { track, title: W.title, pen_name: W.pen_name, intro: W.intro, pages: rows.map(x => x.p), base: W.updated_at || '', id: owner });
            toast('쪽 정리를 저장했어요.'); done = true; resolve(true); d.close();
          } catch (err) { $('#pmErr', d).textContent = err.message === 'conflict' ? '그사이 다른 곳에서 이 책을 고쳤어요. 닫고 다시 열어 주세요.' : err.message; }
        });
      };
    });
  }
  window.YSX = { genImage, openPlan, openBookPlan, secOf, openCompose, openPageManager, trashPut, openTrash, photoTools };
})();
