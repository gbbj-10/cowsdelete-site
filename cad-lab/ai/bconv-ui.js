/* 무카 CAD AI 팀 실험판 — 같은 모양 찾기 · 블록으로 바꾸기 화면 (13회차 개발2, 2026-11-10)
   근거: AutoCAD 2025~2027 Smart Blocks Search and Convert (BCONVERT). 스스로 찾기(Detect)는 하지 않음.
   명령
   - BSEARCH · 한글 '같은모양찾기' : 기준 모양 고르기 → Enter → 찾은 묶음을 선택 상태로 + 로그 (도면 안 바꿈)
   - BCONVERT · BCV · 한글 '같은모양블록' · '블록변환' :
       기준 고르기 → 기준점(Enter = 가운데) → 찾은 묶음 빨간 상자(화면 위 표시만, 도면 객체 아님)
       → 블록 이름 <모양N> (대소문자 무시로 이미 있으면 거절) → 확인 창 "n곳을 블록 '이름' 삽입으로 바꿈 · U 로 되돌림"
       → runBatch([{cmd:'bconvert',seed,base,name,expect}],{label:'같은 모양 블록으로'}) 1번 = 되돌리기 1번
       R.ok 가 false 면 빈 되돌리기 칸을 없애고 실패만 안내 (도면은 core 가 복원)
   - 계산은 하지 않음: bconv-core.js 의 BCONV.find 와 COMMANDS.bconvert 만 부름
   - 화면 글자는 모두 textContent, 사용 기록은 'BSEARCH' / 'BCONVERT' 이름만
   - TOOLS·ALIAS·KO_CMD·CMD_KO 키는 없을 때만 넣음(BC·BCOUNT·BCLOSE 등 안 건드림).
     단축키 저장 샘은 bound-ui.js 의 diffShortcuts 감싸기가 실험 도구를 자동으로 빼므로 여기서 감싸지 않음 */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  if (window.BCONV_UI) return; // 두 번 불려도 render 를 두 번 감싸지 않게
  const LABEL = '같은 모양 블록으로';
  const MAX_BOX = 3000; // 화면에 그릴 빨간 상자 수 상한 (큰 도면 속도)
  const fin = x => typeof x === 'number' && isFinite(x);
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const note = m => { try { toast(m); } catch (_) { } try { log(m, 'err'); } catch (_) { } };
  const evt = name => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: name }); } catch (_) { } };
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  const BC = () => (window.BCONV && typeof window.BCONV.find === 'function') ? window.BCONV : null;
  const hasCmd = () => { try { return typeof COMMANDS === 'object' && typeof COMMANDS.bconvert === 'function'; } catch (_) { return false; } };
  const errMsg = e => String((e && e.message) || e || '').replace(/^#\d+ \w+: /, '').slice(0, 180);
  /* core 가 일부러 던진 거절(Error)은 그 문구 그대로, 코드 오류(TypeError 등)는 '내부 오류'로 구분 */
  const whyText = e => ((e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError) ? '내부 오류 — ' : '') + (errMsg(e) || '알 수 없는 오류');
  const nf = v => { if (!fin(+v)) return '-'; const s = (+v).toFixed(3); return s.replace(/\.?0+$/, ''); };
  const keep = m => (/도면은 그대로/.test(m) ? '' : ' · 도면은 그대로입니다'); // core 문구에 이미 있으면 두 번 쓰지 않음
  const redraw = () => { try { dirty = true; } catch (_) { } };
  const refocus = () => { try { cmdIn.focus({ preventScroll: true }); } catch (_) { } };
  const inBedit = () => { try { return typeof bedit !== 'undefined' && !!bedit; } catch (_) { return false; } };
  const preSel = () => { try { return sel && sel.size ? [...sel] : null; } catch (_) { return null; } };

  if (!document.getElementById('bconvCss')) {
    const st = document.createElement('style'); st.id = 'bconvCss';
    st.textContent = `
.bcvp{position:absolute;left:10px;top:10px;z-index:4;width:min(400px,calc(100% - 20px));background:var(--chrome,#191d23);color:var(--ink,#dfe4ea);border:1px solid var(--rule,#2c333d);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.45;box-shadow:0 6px 22px rgba(0,0,0,.4)}
.bcvp h4{margin:0 0 4px;font-size:12px;font-weight:600}
.bcvp .dim{color:var(--ink-dim,#8b95a3)}
.bcvp .sum{margin:2px 0;font-family:var(--mono,monospace)}
.bcvp .warn{margin:4px 0 0;padding:4px 7px;border:1px solid var(--tag,#f1c232);border-radius:6px;color:var(--tag,#f1c232)}
.bcvp .fail{margin:4px 0 0;padding:5px 7px;border:1px solid #ff6b6b;border-radius:6px;color:#ff9d9d}
.modal.bcvc{background:rgba(5,7,9,.45);z-index:6}
.modal.bcvc .sheet{width:min(420px,100%)}
.bcvc p{margin:0 0 6px;font-size:12px}
.bcvc ul{margin:4px 0 8px 18px;padding:0;font-size:12px;line-height:1.6}`;
    document.head.appendChild(st);
  }

  /* ---------- 결과 읽기 ---------- */
  const ROT_ORDER = [90, 180, 270];
  function rotText(ms) {
    const c = { 90: 0, 180: 0, 270: 0 };
    for (const m of ms) if (c[m.rot] != null) c[m.rot]++;
    const parts = ROT_ORDER.filter(r => c[r] > 0).map(r => `${r}° ${c[r]}`);
    return parts.length ? ` (회전 ${parts.join(' · ')})` : '';
  }
  function skipText(sk) {
    const s = sk && typeof sk === 'object' ? sk : {};
    const P = [['prop', '층·색 다름'], ['used', '이미 다른 묶음에 쓰임'], ['locked', '잠긴·꺼진 층'], ['other', '그 밖']];
    const parts = P.filter(([k]) => +s[k] > 0).map(([k, t]) => `${t} ${+s[k]}`);
    return parts.length ? ' · 뺀 것: ' + parts.join(' · ') : '';
  }
  const sumText = F => `같은 모양 ${F.matches.length}묶음${rotText(F.matches)}${skipText(F.skipped)}`;
  function readFind(F) {
    if (!F || typeof F !== 'object' || !Array.isArray(F.matches)) throw new TypeError('찾기 결과 모양이 약속과 다름');
    const matches = F.matches.filter(m => m && Array.isArray(m.ids) && m.ids.length && m.at && fin(+m.at.x) && fin(+m.at.y))
      .map(m => ({ ids: m.ids.slice(), at: { x: +m.at.x, y: +m.at.y }, rot: [0, 90, 180, 270].includes(+m.rot) ? +m.rot : 0 }));
    const seed = F.seed && typeof F.seed === 'object' ? F.seed : {};
    return { matches, skipped: F.skipped || {}, seed: { ids: Array.isArray(seed.ids) ? seed.ids.slice() : null, base: seed.base && fin(+seed.base.x) && fin(+seed.base.y) ? { x: +seed.base.x, y: +seed.base.y } : null }, ms: +F.ms };
  }
  /* 찾기 — 성공이면 {F}, 실패면 {err} (도면은 안 바꿈) */
  function runFind(ids, base) {
    const M = BC();
    if (!M) return { err: '같은 모양 찾기 모듈(bconv-core.js)이 아직 없습니다. 새로고침 뒤 다시 해 주세요.' };
    const opt = { rot: true }; if (base) opt.base = { x: base.x, y: base.y };
    try { return { F: readFind(M.find(ids.slice(), opt)) }; } catch (e) { return { err: whyText(e) }; }
  }
  /* 상자 = 묶음 객체들의 둘레 상자 (id 표를 한 번만 만듦) */
  function boxesOf(groups) {
    const map = new Map(); try { for (const e of doc.entities) map.set(e.id, e); } catch (_) { }
    const out = [];
    for (const ids of groups) {
      if (out.length >= MAX_BOX) break;
      const ents = ids.map(id => map.get(id)).filter(Boolean); if (!ents.length) continue;
      let b = null; try { b = bbox(ents); } catch (_) { b = null; }
      if (b && fin(b.minX) && fin(b.maxX) && fin(b.minY) && fin(b.maxY)) out.push(b);
    }
    return out;
  }
  function selectIds(ids) {
    try { sel.clear(); for (const id of ids) sel.add(id); } catch (_) { }
    try { renderProps(); updateInfo(); } catch (_) { }
    redraw();
  }

  /* ---------- 상태 · 창 ---------- */
  let T = null, panel = null, confirmM = null;
  function closeConfirm() { if (confirmM) { try { confirmM.remove(); } catch (_) { } confirmM = null; } }
  function closePanel() { if (panel) { try { panel.remove(); } catch (_) { } panel = null; } }
  function clearAll() { T = null; closePanel(); closeConfirm(); redraw(); }
  function paint() {
    if (!T || T.mode !== 'convert' || T.selecting) { closePanel(); return; }
    const host = document.getElementById('view') || document.body;
    if (!panel || !panel.isConnected) { panel = el('div', 'bcvp'); panel.setAttribute('role', 'status'); host.appendChild(panel); }
    panel.textContent = '';
    panel.appendChild(el('h4', null, '같은 모양 블록으로 (BCONVERT)'));
    panel.appendChild(el('div', 'dim', `기준 모양 객체 ${T.ids.length}개 · Esc 취소`));
    if (T.step === 'base') panel.appendChild(el('div', 'dim', '기준점을 누르세요 · Enter = 기준 모양 가운데'));
    if (T.F) {
      panel.appendChild(el('div', 'sum', sumText(T.F)));
      if (T.F.matches.length > MAX_BOX) panel.appendChild(el('div', 'dim', `빨간 상자는 앞 ${MAX_BOX}곳만 그림`));
      panel.appendChild(el('div', 'dim', '빨간 상자 = 찾은 곳 (화면 표시만) · 주황 점선 = 기준 모양'));
    }
    if (T.fail) panel.appendChild(el('div', 'fail', T.fail));
  }

  /* ---------- 빨간 상자 (render 를 한 번만 감쌈, 도구가 끝나면 사라짐) ---------- */
  try {
    const _rBcv = render;
    render = function () {
      _rBcv.apply(this, arguments);
      if (T && tool !== T) clearAll();
      if (!T || !T.boxes) return;
      try {
        const c = ctx2; c.save(); c.setTransform(DPR, 0, 0, DPR, 0, 0);
        const rect = (b, pad) => { const p = S({ x: b.minX, y: b.maxY }), q = S({ x: b.maxX, y: b.minY }); c.strokeRect(p.x - pad, p.y - pad, (q.x - p.x) + 2 * pad, (q.y - p.y) + 2 * pad); };
        if (T.seedBox) { c.setLineDash([5, 4]); c.lineWidth = 1.6; c.strokeStyle = 'rgba(255,160,40,.95)'; rect(T.seedBox, 5); }
        c.setLineDash([]);
        c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,.5)'; for (const b of T.boxes) rect(b, 4);
        c.lineWidth = 1.8; c.strokeStyle = '#ff3b3b'; for (const b of T.boxes) rect(b, 4);
        if (T.baseP) { const s = S(T.baseP); c.lineWidth = 1.6; c.strokeStyle = 'rgba(255,160,40,.95)'; c.beginPath(); c.moveTo(s.x - 7, s.y); c.lineTo(s.x + 7, s.y); c.moveTo(s.x, s.y - 7); c.lineTo(s.x, s.y + 7); c.stroke(); }
        c.restore();
      } catch (_) { }
    };
  } catch (_) { }

  /* ---------- 이름 ---------- */
  const blockNames = () => { try { return Object.keys(doc.blocks || {}); } catch (_) { return []; } };
  const takenAs = n => { const u = String(n).toUpperCase(); const k = blockNames().find(k => String(k).toUpperCase() === u); return k == null ? null : String(k); }; // 이미 있는 실제 이름
  const nameTaken = n => takenAs(n) != null;
  function defName() { let i = 1; while (nameTaken('모양' + i)) i++; return '모양' + i; }
  function badName(n) {
    if (!n) return '이름이 비었습니다';
    if (n.length > 255) return '이름이 너무 깁니다 (255자까지)';
    if (n[0] === '*') return '* 로 시작하는 이름(익명 블록)은 쓸 수 없습니다';
    if (/[<>\/\\":;?*|=`,]/.test(n)) return '이름에 < > / \\ " : ; ? * | = ` , 는 쓸 수 없습니다';
    const had = takenAs(n);
    if (had != null) return `블록 '${had}' 가 이미 있습니다 (대소문자 무시) — 다른 이름을 입력하세요`;
    return '';
  }

  /* ---------- 적용 ---------- */
  function apply(t) {
    closeConfirm();
    if (!hasCmd()) { note('블록으로 바꾸기 명령(bconv-core.js)이 아직 없습니다 · 도면은 그대로입니다'); endTool(); return; }
    const F = t.F, base = F.seed.base || t.baseP;
    if (!base) { note('기준점을 알 수 없어 바꾸지 않았습니다 · 도면은 그대로입니다'); endTool(); return; }
    const cmd = {
      cmd: 'bconvert', seed: t.ids.slice(), base: [base.x, base.y], name: t.bname,
      expect: { matches: F.matches.map(m => ({ ids: m.ids.slice(), at: { x: m.at.x, y: m.at.y }, rot: m.rot })) }
    };
    let u0 = -1; try { u0 = undoStack.length; } catch (_) { }
    let R = null; try { R = runBatch([cmd], { label: LABEL }); } catch (e) { R = { ok: false, errors: [errMsg(e)] }; }
    if (!R || !R.ok) {
      // runBatch 가 넣은 빈 되돌리기 칸을 없앰 (그 칸 = 시작 전 도면, core 가 이미 복원했어도 한 번 더 맞춤)
      try { if (u0 >= 0 && undoStack.length > u0) { const snap = undoStack.pop(); doc = JSON.parse(snap); changed(); } } catch (_) { }
      const m = R && R.errors && R.errors[0] ? errMsg(R.errors[0]) : '';
      note('블록으로 바꾸지 못했습니다' + (m ? ' — ' + m : '') + keep(m));
      endTool(); return;
    }
    const r0 = (R.results && R.results[0]) || {};
    const n = fin(+r0.n) ? +r0.n : (Array.isArray(r0.ids) ? r0.ids.length : F.matches.length + 1);
    const nm = typeof r0.name === 'string' && r0.name ? r0.name : t.bname;
    say(`같은 모양 블록으로: ${n}곳을 블록 '${nm}' 삽입으로 바꿈 · 되돌리기(Ctrl+Z / U) 한 번에 원래대로`, 'ok');
    try { sel.clear(); renderProps(); updateInfo(); } catch (_) { }
    endTool();
  }
  function askConfirm(t) {
    closeConfirm();
    const n = t.F.matches.length + 1;
    const body = el('div', 'bcvc');
    body.appendChild(el('p', null, `${n}곳을 블록 '${t.bname}' 삽입으로 바꿈 · U 로 되돌림`));
    const ul = el('ul');
    ul.appendChild(el('li', null, `기준 모양 1곳 + 찾은 곳 ${t.F.matches.length}곳${rotText(t.F.matches)}`));
    const nObj = t.ids.length + t.F.matches.reduce((a, m) => a + m.ids.length, 0);
    ul.appendChild(el('li', null, `원래 객체 ${nObj}개가 삽입 ${n}개로 바뀜`));
    const sk = skipText(t.F.skipped); if (sk) ul.appendChild(el('li', null, sk.replace(/^ · /, '') + ' (안 바꿈)'));
    ul.appendChild(el('li', 'dim', '삽입의 층 = 기준 모양 층, 색·선종류·굵기 = 층 따름'));
    body.appendChild(ul);
    const bNo = el('button', 'tbtn', '취소'), bYes = el('button', 'tbtn primary', '바꾸기');
    let m;
    try { m = modal('블록으로 바꾸기 확인', [body], [bNo, bYes]); m.classList.add('bcvc'); } catch (_) { apply(t); return; }
    confirmM = m;
    bNo.onclick = () => { closeConfirm(); say('같은 모양 블록으로: 취소 — 도면은 그대로입니다'); try { endTool(); } catch (_) { } refocus(); };
    bYes.onclick = () => { if (T === t && tool === t) apply(t); refocus(); };
    // 닫기 단추·바깥 누름으로 닫혀도 도구를 끝냄
    try { new MutationObserver((_, ob) => { if (!m.isConnected) { ob.disconnect(); if (confirmM === m) { confirmM = null; if (T === t && tool === t && t.step === 'confirm') { say('같은 모양 블록으로: 취소 — 도면은 그대로입니다'); endTool(); } } } }).observe(m.parentNode, { childList: true }); } catch (_) { }
    setTimeout(() => { try { bYes.focus(); } catch (_) { } }, 0);
  }

  /* ---------- 도구 ---------- */
  function makeTool(mode) {
    const pre = preSel();
    const t = {
      name: mode === 'search' ? 'bsearch' : 'bconvert', mode, selecting: !pre, spaceEmptyEnter: true,
      get wantsPoint() { return t.step === 'base'; }, set wantsPoint(v) { },
      step: pre ? 'base' : 'sel', ids: pre || [], baseP: null, F: null, boxes: null, seedBox: null, bname: '', fail: null,
      get prompt() {
        if (t.selecting) return '기준 모양 선택 (예: 문 한 짝, 끝나면 Enter):';
        if (t.step === 'base') return '기준점 지정 <Enter = 가운데>:';
        if (t.step === 'name') return `블록 이름 <${defName()}>:`;
        if (t.step === 'confirm') return '확인 창에서 [바꾸기] 또는 Esc:';
        return '명령:';
      }, set prompt(v) { },
      wantsText() { return t.step === 'name'; },
      afterSelect() {
        t.selecting = false;
        try { t.ids = [...sel]; } catch (_) { t.ids = []; }
        if (t.mode === 'search') { doSearch(t); return; }
        t.step = 'base'; paint(); try { setPrompt(t.prompt); } catch (_) { } redraw();
      },
      onPoint(p) {
        if (t.selecting || t.step !== 'base') return;
        if (!p || !fin(p.x) || !fin(p.y)) return;
        doFind(t, { x: p.x, y: p.y });
      },
      onInput(s) {
        if (t.selecting) return false;
        if (t.step === 'name') { takeName(t, String(s || '').trim()); return true; }
        if (t.step === 'confirm') { say('확인 창에서 [바꾸기] 또는 [취소]를 누르세요', 'err'); return true; }
        return false; // base 단계의 50,25 같은 점 입력은 본체가 onPoint 로 넘김
      },
      onEnter() {
        if (t.step === 'base') { doFind(t, null); return; }
        if (t.step === 'name') { takeName(t, ''); return; }
        if (t.step === 'confirm') { if (confirmM && confirmM.isConnected) apply(t); else endTool(); return; }
        endTool();
      }
    };
    return t;
  }
  /* 기준 모양 객체를 다시 고름 (선택 = 기준만 보이게) */
  function doSearch(t) {
    const R = runFind(t.ids, null);
    if (R.err) { note('같은 모양을 찾지 못했습니다 — ' + R.err + keep(R.err)); endTool(); return; }
    const F = R.F, all = new Set(t.ids);
    for (const m of F.matches) for (const id of m.ids) all.add(id);
    endTool();
    selectIds([...all]);
    say(sumText(F) + ` · 기준 포함 ${all.size}개 선택${fin(F.ms) ? ` (${Math.round(F.ms)} ms)` : ''}` + (F.matches.length ? ' · 블록으로 바꾸려면 BCONVERT' : ''), F.matches.length ? 'ok' : 'err');
  }
  function doFind(t, base) {
    const R = runFind(t.ids, base);
    if (R.err) { note('같은 모양을 찾지 못했습니다 — ' + R.err + keep(R.err)); endTool(); return; }
    const F = R.F;
    t.F = F; t.baseP = F.seed.base || base; t.fail = null;
    t.boxes = boxesOf(F.matches.map(m => m.ids));
    const sb = boxesOf([t.ids]); t.seedBox = sb[0] || null;
    try { sel.clear(); renderProps(); updateInfo(); } catch (_) { }
    say(sumText(F) + (fin(F.ms) ? ` (${Math.round(F.ms)} ms)` : ''), F.matches.length ? 'ok' : 'err');
    if (!F.matches.length) { note('같은 모양을 찾지 못해 바꾸지 않았습니다 — 기준 모양만 블록으로 만들려면 BLOCK'); endTool(); return; }
    if (!hasCmd()) note('블록으로 바꾸기 명령(bconv-core.js)이 아직 없습니다 — 찾기만 됩니다');
    t.step = 'name'; try { hud.style.display = 'none'; } catch (_) { }
    paint(); try { setPrompt(t.prompt); } catch (_) { } redraw();
  }
  function takeName(t, s) {
    const n = s || defName();
    const bad = badName(n);
    if (bad) { t.fail = bad; say(bad, 'err'); paint(); return; }
    t.bname = n; t.fail = null; t.step = 'confirm'; paint();
    try { setPrompt(t.prompt); } catch (_) { }
    askConfirm(t);
  }
  function start(mode) {
    evt(mode === 'search' ? 'BSEARCH' : 'BCONVERT');
    if (inBedit()) { note('블록 편집(BEDIT) 중에는 쓸 수 없습니다 — 편집을 닫고 다시 해 주세요'); return null; }
    if (!BC()) { note('같은 모양 찾기 모듈(bconv-core.js)이 아직 없습니다. 새로고침 뒤 다시 해 주세요.'); return null; }
    clearAll();
    const t = makeTool(mode);
    T = t;
    if (!t.selecting) {
      if (mode === 'search') { setTimeout(() => { if (T === t && tool === t) doSearch(t); }, 0); }
      else setTimeout(() => { if (T === t && tool === t) { paint(); redraw(); } }, 0);
    }
    return t;
  }

  /* ---------- 명령 등록 (없는 키만) ---------- */
  if (typeof TOOLS.bsearch !== 'function') TOOLS.bsearch = () => start('search');
  if (typeof TOOLS.bconvert !== 'function') TOOLS.bconvert = () => start('convert');
  if (!('BSEARCH' in ALIAS)) ALIAS.BSEARCH = 'bsearch';
  for (const k of ['BCONVERT', 'BCV']) if (!(k in ALIAS)) ALIAS[k] = 'bconvert';
  if (typeof CMD_KO === 'object') { if (!CMD_KO.bsearch) CMD_KO.bsearch = '같은 모양 찾기'; if (!CMD_KO.bconvert) CMD_KO.bconvert = LABEL; }
  if (typeof KO_CMD === 'object') for (const [k, v] of Object.entries({ 같은모양찾기: 'bsearch', 같은모양블록: 'bconvert', 블록변환: 'bconvert' })) if (!(k in KO_CMD)) KO_CMD[k] = v;

  window.BCONV_UI = {
    ver: 1,
    state: () => (T && tool === T ? {
      mode: T.mode, step: T.selecting ? 'sel' : T.step, n: T.ids.length, name: T.bname || null, fail: T.fail,
      found: T.F ? T.F.matches.length : null, boxes: T.boxes ? T.boxes.length : 0, text: T.F ? sumText(T.F) : '', confirm: !!(confirmM && confirmM.isConnected)
    } : null)
  };
})();
