/* 무카 CAD AI 팀 실험판 — 선 끝 점검 창 (7회차 개발2, 2026-11-10)
   window.GEOCHECK_UI = { open, close, scanNow, fixAll, fixOne, rows }
   명령: GEOCHECK · GCK · 한글 '선끝점검' · '틈찾기' ('선 끝 점검' 띄어쓰기도 같음)
   - 계산·고치기는 하지 않음: geocheck-core.js 의 GEOCHK.defaults / scope() / scan(ents,opt) 와 COMMANDS.geofix 만 부름
   - 결과 줄을 누르면 그 자리(at)로 확대 + 빨간 동그라미(화면 위 표시만 — 도면 객체 아님, 창을 닫으면 사라짐)
   - [이것 고치기] · [모두 고치기](종류별·층별 개수 확인 창 뒤) → runBatch([{cmd:'geofix',fixes}],{label:'선 끝 점검 고치기'}) 1번 = 되돌리기 1번 → 자동 다시 검사
   - 각도 issue 는 fix 가 없어 "찾기만"
   - 검사 뒤 도면이 바뀌면(서명: doc·객체 수·되돌리기 스택) 고치지 않고 다시 검사, 창에 '도면이 바뀜' 표시 (마감 회의 조건, 11-10)
   - geofix 결과의 skipped(수 또는 배열)가 있으면 'n건은 검사 뒤 위치가 바뀌어 건너뜀'
   - 도면 글자(층 이름 등)는 모두 textContent. 사용 기록은 GEOCHECK · GEOCHECK_FIX · GEOCHECK_FIXALL 이름만.
   - 이미 있는 TOOLS·ALIAS·KO_CMD·CMD_KO 키는 덮지 않음(새 키만). */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  if (window.GEOCHECK_UI) return; // 두 번 불려도 render·changed 를 두 번 감싸지 않게
  const TITLE = '선 끝 점검 (틈·못 미침·넘침)';
  const LABEL = '선 끝 점검 고치기';
  const MAX_ROWS = 300;
  const KIND_KO = { gap: '틈', under: '못 미침', over: '넘침', angle: '각도' };
  const KIND_ORDER = { gap: 0, under: 1, over: 2, angle: 3 };
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const note = m => { try { toast(m); } catch (_) { } try { log(m, 'err'); } catch (_) { } };
  const evt = name => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: name }); } catch (_) { } };
  const fin = x => typeof x === 'number' && isFinite(x);
  const num = x => (fin(+x) ? +x : 0);
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  const G = () => (window.GEOCHK && typeof window.GEOCHK.scan === 'function') ? window.GEOCHK : null;
  const hasFix = () => { try { return typeof COMMANDS === 'object' && typeof COMMANDS.geofix === 'function'; } catch (_) { return false; } };
  const missing = () => note('선 끝 점검 모듈이 아직 없습니다 (geocheck-core.js). 새로고침 뒤 다시 해 주세요.');
  const nf = (v, k) => { if (!fin(+v)) return '-'; const s = (+v).toFixed(k == null ? 3 : k); return s.indexOf('.') < 0 ? s : s.replace(/\.?0+$/, ''); };
  const kindKo = k => KIND_KO[k] || String(k == null ? '?' : k);
  const dTxt = i => (i.k === 'angle' ? nf(i.d, 2) + '°' : nf(i.d, 3) + ' mm');

  if (!document.getElementById('geocheckCss')) {
    const st = document.createElement('style'); st.id = 'geocheckCss';
    st.textContent = `
.modal.gck{background:transparent;pointer-events:none;place-items:start end}
.modal.gck .sheet{pointer-events:auto;width:min(460px,100%);max-height:100%;box-shadow:0 8px 28px rgba(0,0,0,.45)}
.modal.gckc{background:rgba(5,7,9,.45);z-index:6}
.modal.gckc .sheet{width:min(420px,100%)}
.gck .scope{margin:0 0 6px;color:var(--ink-dim);font-size:12px}
.gck .opt{margin:0 0 6px;font-size:12px;color:var(--ink);display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center}
.gck .opt b{font-weight:600;color:var(--ink-dim);min-width:58px}
.gck .opt label{display:inline-flex;gap:4px;align-items:center;cursor:pointer}
.gck .opt input[type=number]{width:72px;background:var(--ground);color:var(--ink);border:1px solid var(--rule);border-radius:5px;padding:2px 5px;font:12px var(--mono,monospace)}
.gck .opt input[type=text]{flex:1;min-width:160px;background:var(--ground);color:var(--ink);border:1px solid var(--rule);border-radius:5px;padding:2px 5px;font:12px var(--mono,monospace)}
.gck .dim{color:var(--ink-dim)}
.gck .info{margin:6px 0 0;font-size:12px;color:var(--ink-dim);line-height:1.45}
.gck .warn{margin:0 0 6px;padding:5px 8px;border:1px solid var(--tag);border-radius:6px;color:var(--tag);font-size:12px;line-height:1.45}
.gck .empty{margin:8px 0;padding:12px;border:1px dashed var(--rule);border-radius:6px;text-align:center;color:var(--ink-dim);font-size:13px}
.gck .sum{margin:4px 0 6px;font-size:12px;color:var(--ink)}
.gck .tw{max-height:min(40vh,360px);overflow:auto;border:1px solid var(--rule);border-radius:6px}
.gck table{border-collapse:collapse;width:100%;font-size:12px}
.gck th,.gck td{padding:4px 8px;border-bottom:1px solid var(--rule);text-align:left;white-space:nowrap}
.gck th{position:sticky;top:0;background:var(--chrome-2);color:var(--ink-dim);font-weight:600;z-index:1}
.gck tbody tr{cursor:pointer}
.gck tbody tr:hover,.gck tbody tr:focus{background:var(--chrome-2);outline:none}
.gck tbody tr.on{background:rgba(255,77,77,.16)}
.gck td.n{text-align:right;font-family:var(--mono,monospace)}
.gck td.fo{color:var(--ink-dim);font-style:italic}
.gck .more{padding:4px 8px;color:var(--ink-dim);font-size:12px}
.gckc ul{margin:4px 0 8px 18px;padding:0;font-size:12px;line-height:1.6}
.gckc p{margin:0 0 6px;font-size:12px}`;
    document.head.appendChild(st);
  }

  /* ---------- 화면 위 빨간 동그라미 (도면 객체 아님) ---------- */
  let mark = null; // {x,y}
  try {
    const _rGck = render;
    render = function () {
      _rGck.apply(this, arguments);
      if (!mark) return;
      try {
        const c = ctx2; c.save(); c.setTransform(DPR, 0, 0, DPR, 0, 0);
        const q = S(mark); c.globalAlpha = 1; c.setLineDash([]);
        c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.arc(q.x, q.y, 16, 0, Math.PI * 2); c.stroke();
        c.lineWidth = 2.2; c.strokeStyle = '#ff3b3b'; c.beginPath(); c.arc(q.x, q.y, 16, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(q.x, q.y, 2.2, 0, Math.PI * 2); c.fill();
        c.restore();
      } catch (_) { }
    };
  } catch (_) { }
  const setMark = p => { mark = p && fin(p.x) && fin(p.y) ? { x: p.x, y: p.y } : null; try { dirty = true; } catch (_) { } };

  function zoomAt(p, i, tol) {
    try {
      if (!p || !fin(p.x) || !fin(p.y) || typeof zoomBox !== 'function') return false;
      const h = Math.max(20 * (tol || 1), 8 * (i && i.k !== 'angle' ? num(i.d) : 0), 1e-3);
      zoomBox(p.x - h, p.y - h, p.x + h, p.y + h); dirty = true; return true;
    } catch (_) { return false; }
  }

  /* ---------- 검사 뒤 도면이 바뀌었나 ----------
     changed() 를 한 번만 감싸 횟수를 세고(원래 함수를 그대로 부르고 예외도 그대로 나감),
     바뀜 판단은 서명으로: doc·entities 객체, 객체 수, 되돌리기/다시실행 수, 되돌리기 맨 위 사본.
     (선택만 바꾸는 changed() 는 서명이 같아 '바뀜'이 아님) */
  let chgN = 0, onChg = null;
  try {
    if (typeof changed === 'function' && !changed.__gck) {
      const _cGck = changed;
      const w = function () {
        try { return _cGck.apply(this, arguments); }
        finally { chgN++; if (onChg) { try { onChg(); } catch (_) { } } }
      };
      w.__gck = true;
      changed = w;
    }
  } catch (_) { }
  function docSig() {
    let d = null, es = null, n = -1, u = -1, top = null, rd = -1;
    try { d = doc; es = doc.entities; n = es.length; } catch (_) { }
    try { u = undoStack.length; top = u ? undoStack[u - 1] : null; } catch (_) { }
    try { rd = redoStack.length; } catch (_) { }
    return { d, es, n, u, top, rd };
  }
  const sameSig = (a, b) => !!(a && b && a.d === b.d && a.es === b.es && a.n === b.n && a.u === b.u && a.top === b.top && a.rd === b.rd);

  /* ---------- 결과 읽기 (모양이 조금 달라도 버팀) ---------- */
  const issuesOf = r => (r && Array.isArray(r.issues) ? r.issues.filter(i => i && typeof i === 'object') : [])
    .map((i, n) => ({ i, n })).sort((a, b) => ((KIND_ORDER[a.i.k] ?? 9) - (KIND_ORDER[b.i.k] ?? 9)) || (a.n - b.n)).map(x => x.i);
  const fixesOf = i => (i && Array.isArray(i.fix) ? i.fix.filter(f => f && f.id != null && (f.end === 0 || f.end === 1) && f.to && fin(f.to.x) && fin(f.to.y)) : []);
  function allFixes(list) {
    const seen = new Set(), out = [];
    for (const i of list) for (const f of fixesOf(i)) { const k = f.id + '|' + f.end; if (seen.has(k)) continue; seen.add(k); out.push({ id: f.id, end: f.end, to: { x: f.to.x, y: f.to.y } }); }
    return out;
  }
  function skipText(r) {
    const s = (r && r.skipped && typeof r.skipped === 'object') ? r.skipped : {};
    const P = [['block', '블록 안'], ['hidden', '꺼진 층'], ['locked', '잠긴 층'], ['short', '짧은 선'], ['layer', '제외 층'], ['other', '그 밖(호·타원·글자·치수 등)']];
    const parts = P.filter(([k]) => num(s[k]) > 0).map(([k, t]) => `${t} ${num(s[k])}`);
    return parts.length ? parts.join(' · ') + ' 은 안 봄' : '';
  }
  function rows(r) {
    return issuesOf(r).map(i => ({ kind: kindKo(i.k), d: dTxt(i), n: Array.isArray(i.ids) ? i.ids.length : 0, fix: fixesOf(i).length > 0 }));
  }

  /* ---------- 고치기 ---------- */
  function apply(fixes, what) {
    if (!hasFix()) { note('선 끝 고치기 명령(geofix)이 아직 없습니다 (geocheck-core.js)'); return null; }
    if (!fixes.length) { say('고칠 것이 없습니다', 'err'); return null; }
    const u0 = (typeof undoStack === 'object' && undoStack) ? undoStack.length : -1;
    let R = null;
    try { R = runBatch([{ cmd: 'geofix', fixes }], { label: LABEL }); } catch (_) { R = null; }
    if (!R || !R.ok) {
      try { if (u0 >= 0 && undoStack.length > u0) undo(); } catch (_) { }
      say('선 끝을 고치지 못해 되돌렸습니다', 'err'); return null;
    }
    const r0 = R.results && R.results[0] || {};
    const nIds = Array.isArray(r0.ids) ? r0.ids.length : null;
    const sk = Array.isArray(r0.skipped) ? r0.skipped.length : (fin(+r0.skipped) ? +r0.skipped : 0);
    const mv = fin(+r0.moved) ? +r0.moved : Math.max(0, fixes.length - sk);
    say(`선 끝 점검: ${what} — 끝점 ${mv}곳 옮김${nIds != null ? ` (객체 ${nIds}개)` : ''} · 되돌리기(Ctrl+Z) 한 번에 원래대로`, 'ok');
    if (sk > 0) note(`${sk}건은 검사 뒤 위치가 바뀌어 건너뜀`);
    return R;
  }

  /* ---------- 확인 창 (종류별·층별 개수) ---------- */
  function confirmAll(list, fixes, onYes) {
    const byKind = {}; for (const i of list) if (fixesOf(i).length) byKind[i.k] = (byKind[i.k] || 0) + 1;
    const ids = new Set(fixes.map(f => f.id)), byLayer = new Map();
    const M = new Map(); try { for (const e of doc.entities) M.set(e.id, e); } catch (_) { }
    for (const id of ids) { const e = M.get(id); const L = e && e.layer != null ? String(e.layer) : '(층 없음)'; byLayer.set(L, (byLayer.get(L) || 0) + 1); }
    const body = el('div', 'gck');
    body.appendChild(el('p', null, `끝점 ${fixes.length}곳 · 객체 ${ids.size}개를 옮깁니다. 계속할까요?`));
    body.appendChild(el('p', 'dim', '종류별'));
    const u1 = el('ul'); Object.keys(byKind).sort((a, b) => (KIND_ORDER[a] ?? 9) - (KIND_ORDER[b] ?? 9)).forEach(k => u1.appendChild(el('li', null, `${kindKo(k)} ${byKind[k]}건`))); body.appendChild(u1);
    body.appendChild(el('p', 'dim', '층별 (옮기는 객체 수)'));
    const u2 = el('ul'); const ls = [...byLayer.entries()].sort((a, b) => b[1] - a[1]);
    ls.slice(0, 20).forEach(([L, n]) => u2.appendChild(el('li', null, `${L} — ${n}개`)));
    if (ls.length > 20) u2.appendChild(el('li', 'dim', `그 밖 ${ls.length - 20}개 층`));
    body.appendChild(u2);
    const bYes = el('button', 'tbtn primary', '모두 고치기'), bNo = el('button', 'tbtn', '취소');
    let m;
    try { m = modal('모두 고치기 확인', [body], [bNo, bYes]); m.classList.add('gckc'); } catch (_) { return; }
    bNo.onclick = () => m.remove();
    bYes.onclick = () => { m.remove(); onYes(); };
    setTimeout(() => { try { bYes.focus(); } catch (_) { } }, 0);
    return m;
  }

  /* ---------- 창 ---------- */
  let cur = null, curConfirm = null, st = null;
  function close() {
    if (curConfirm) { try { curConfirm.remove(); } catch (_) { } curConfirm = null; }
    if (cur) { try { cur.remove(); } catch (_) { } cur = null; }
    st = null; onChg = null; setMark(null);
  }
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || !cur || !cur.isConnected) return;
    if (curConfirm && curConfirm.isConnected) { curConfirm.remove(); curConfirm = null; ev.stopPropagation(); return; }
    close();
  }, true);
  /* 창이 다른 길(닫기 단추 등)로 없어져도 동그라미를 지움 */
  try {
    const vw = document.getElementById('view');
    if (vw) new MutationObserver(() => { if (cur && !cur.isConnected) { cur = null; st = null; onChg = null; setMark(null); } }).observe(vw, { childList: true });
  } catch (_) { }

  function open() {
    const M = G();
    if (!M) { missing(); return null; }
    evt('GEOCHECK');
    close();
    const D = (M.defaults && typeof M.defaults === 'object') ? M.defaults : {};
    const DK = (D.kinds && typeof D.kinds === 'object') ? D.kinds : {};
    st = {
      tol: fin(+D.tol) && +D.tol > 0 ? +D.tol : 1,
      angTol: fin(+D.angTol) && +D.angTol > 0 ? +D.angTol : 1,
      kinds: { gap: DK.gap !== false, under: DK.under !== false, over: DK.over !== false, angle: DK.angle === true },
      exclude: typeof D.excludeLayers === 'string' ? D.excludeLayers : '치수|DIM|중심|CENTER|숨은|HIDDEN|해치|HATCH',
      r: null, list: [], pick: -1, sig: null, stale: false
    };
    const S0 = st;

    const body = el('div', 'gck');
    const scopeP = el('p', 'scope');
    // 입력
    const o1 = el('div', 'opt');
    o1.appendChild(el('b', null, '허용값'));
    const iTol = el('input'); iTol.type = 'number'; iTol.min = '0'; iTol.step = 'any'; iTol.value = String(st.tol); iTol.title = '도면 단위 (mm 가정)';
    o1.appendChild(iTol); o1.appendChild(el('span', 'dim', '도면 단위 (mm 가정)'));
    const o2 = el('div', 'opt');
    o2.appendChild(el('b', null, '각도 허용'));
    const iAng = el('input'); iAng.type = 'number'; iAng.min = '0'; iAng.step = 'any'; iAng.value = String(st.angTol);
    o2.appendChild(iAng); o2.appendChild(el('span', 'dim', '° (0·45·90·135… 에서 이만큼 안으로 비뚤어진 선)'));
    const o3 = el('div', 'opt'); o3.appendChild(el('b', null, '찾을 것'));
    const cbs = {};
    for (const k of ['gap', 'under', 'over', 'angle']) {
      const lb = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!st.kinds[k]; cbs[k] = cb;
      lb.appendChild(cb); lb.appendChild(el('span', null, kindKo(k) + (k === 'angle' ? ' (찾기만)' : ''))); o3.appendChild(lb);
    }
    const o4 = el('div', 'opt'); o4.appendChild(el('b', null, '제외 층'));
    const iEx = el('input'); iEx.type = 'text'; iEx.value = st.exclude; iEx.title = '이 글자가 이름에 든 층은 안 봄 (| 로 구분, 대소문자 무시)';
    o4.appendChild(iEx);
    const warnBox = el('div');
    const staleBox = el('div');
    const res = el('div');
    const info = el('p', 'info');
    body.append(scopeP, o1, o2, o3, o4, staleBox, warnBox, res, info);

    const isStale = () => !!S0.sig && !sameSig(S0.sig, docSig());
    function paintStale() {
      staleBox.textContent = '';
      if (S0.stale) staleBox.appendChild(el('p', 'warn', '도면이 바뀜 — [검사]를 다시 누르세요'));
      res.style.opacity = S0.stale ? '.45' : ''; info.style.opacity = S0.stale ? '.45' : '';
    }
    /* 창이 열린 동안 Ctrl+Z·다른 편집이 있으면 표시 */
    onChg = () => { if (st === S0 && cur && cur.isConnected && S0.r && !S0.stale && isStale()) { S0.stale = true; paintStale(); } };
    /* 고치기 전에 확인: 바뀌었으면 고치지 않고 다시 검사 */
    const guard = () => { if (!isStale()) return true; note('검사 뒤 도면이 바뀌어 다시 검사했습니다'); scanNow(); return false; };

    const bOne = el('button', 'tbtn', '이것 고치기');
    const bAll = el('button', 'tbtn primary', '모두 고치기');
    const bScan = el('button', 'tbtn', '검사');
    const bX = el('button', 'tbtn', '닫기');

    function readOpt() {
      const t = +iTol.value, a = +iAng.value;
      if (!fin(t) || t <= 0) { note('허용값은 0보다 큰 수로 넣어 주세요'); return null; }
      if (!fin(a) || a <= 0 || a >= 45) { note('각도 허용값은 0보다 크고 45보다 작은 수로 넣어 주세요'); return null; }
      const kinds = {}; for (const k in cbs) kinds[k] = !!cbs[k].checked;
      if (!kinds.gap && !kinds.under && !kinds.over && !kinds.angle) { note('찾을 것을 하나 이상 켜 주세요'); return null; }
      S0.tol = t; S0.angTol = a; S0.kinds = kinds; S0.exclude = String(iEx.value || '');
      return { tol: t, angTol: a, kinds: Object.assign({}, kinds), excludeLayers: S0.exclude };
    }

    function paintResult() {
      res.textContent = ''; warnBox.textContent = ''; info.textContent = '';
      const r = S0.r;
      if (!r) { res.appendChild(el('p', 'dim', '[검사] 를 누르세요')); bOne.disabled = true; bAll.disabled = true; return; }
      if (r.unitSuspect) warnBox.appendChild(el('p', 'warn', 'inch 도면일 수 있음 — 허용값을 0.04 정도로'));
      const list = S0.list;
      const nFix = list.filter(i => fixesOf(i).length).length;
      const cnt = {}; list.forEach(i => { cnt[i.k] = (cnt[i.k] || 0) + 1; });
      const sumTxt = Object.keys(cnt).sort((a, b) => (KIND_ORDER[a] ?? 9) - (KIND_ORDER[b] ?? 9)).map(k => `${kindKo(k)} ${cnt[k]}`).join(' · ');
      res.appendChild(el('p', 'sum', `본 선·폴리선 ${num(r.scanned)}개 · 찾은 것 ${list.length}건` + (sumTxt ? ` (${sumTxt})` : '') + ` · 허용값 ${nf(fin(+r.tol) ? r.tol : S0.tol)}` + (fin(+r.ms) ? ` · ${Math.round(r.ms)} ms` : '')));
      const gapLike = list.filter(i => i.k === 'gap' || i.k === 'under' || i.k === 'over').length;
      if (!gapLike) res.appendChild(el('p', 'empty', '틈·못 미침·넘침 없음'));
      if (list.length) {
        const tw = el('div', 'tw'), tb = el('table'), th = el('thead'), hr = el('tr');
        ['No', '종류', '거리 · 각도', '객체 수', '고치기'].forEach(t => hr.appendChild(el('th', null, t)));
        th.appendChild(hr); tb.appendChild(th);
        const bd = el('tbody');
        list.slice(0, MAX_ROWS).forEach((i, n) => {
          const tr = el('tr'); tr.tabIndex = 0; if (n === S0.pick) tr.className = 'on';
          tr.appendChild(el('td', 'n', n + 1));
          tr.appendChild(el('td', null, kindKo(i.k)));
          tr.appendChild(el('td', 'n', dTxt(i)));
          tr.appendChild(el('td', 'n', Array.isArray(i.ids) ? i.ids.length : 0));
          const can = fixesOf(i).length > 0;
          tr.appendChild(el('td', can ? null : 'fo', can ? `끝 ${fixesOf(i).length}곳` : '찾기만'));
          const go = () => {
            S0.pick = n; [...bd.children].forEach((x, j) => { x.className = j === n ? 'on' : ''; });
            if (i.at && fin(i.at.x) && fin(i.at.y)) { zoomAt(i.at, i, S0.tol); setMark(i.at); }
            bOne.disabled = !can;
          };
          tr.onclick = go;
          tr.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); go(); } };
          bd.appendChild(tr);
        });
        tb.appendChild(bd); tw.appendChild(tb);
        if (list.length > MAX_ROWS) tw.appendChild(el('div', 'more', `그 밖 ${list.length - MAX_ROWS}건 ([모두 고치기]에는 들어감)`));
        res.appendChild(tw);
      }
      const sk = skipText(r);
      info.textContent = sk || '';
      const pi = S0.pick >= 0 ? list[S0.pick] : null;
      bOne.disabled = !(pi && fixesOf(pi).length);
      bAll.disabled = !nFix;
      bAll.textContent = nFix ? `모두 고치기 (${nFix})` : '모두 고치기';
    }

    function scanNow() {
      const MM = G(); if (!MM) { missing(); return null; }
      const opt = readOpt(); if (!opt) return null;
      let ents = [];
      try { const sc = typeof MM.scope === 'function' ? MM.scope() : null; ents = Array.isArray(sc) ? sc : (sc && Array.isArray(sc.ents) ? sc.ents : []); } catch (_) { ents = []; }
      let selN = 0; try { selN = sel && (sel.size != null ? sel.size : sel.length) || 0; } catch (_) { }
      scopeP.textContent = (selN ? `범위: 선택한 객체 ${ents.length}개` : `범위: 도면 전체 ${ents.length}개`) + ' · 고치는 것은 선과 열린 곧은 폴리선의 끝점만';
      let r = null;
      try { r = MM.scan(ents, opt); } catch (_) { r = null; }
      if (!r || typeof r !== 'object') { note('선 끝 점검을 하지 못했습니다'); return null; }
      S0.r = r; S0.list = issuesOf(r); S0.pick = -1; S0.sig = docSig(); S0.stale = false; setMark(null);
      paintStale();
      paintResult();
      return r;
    }

    function fixOne() {
      const i = S0.pick >= 0 ? S0.list[S0.pick] : null;
      const fx = i ? fixesOf(i) : [];
      if (!fx.length) { say(i ? '각도는 찾기만 합니다 — 직접 고쳐 주세요' : '고칠 줄을 먼저 누르세요', 'err'); return null; }
      if (!guard()) return null;
      evt('GEOCHECK_FIX');
      const R = apply(allFixes([i]), `${kindKo(i.k)} 1건`);
      if (R && cur) scanNow();
      return R;
    }
    function fixAll(skipConfirm) {
      if (!guard()) return null;
      const list = S0.list.filter(i => fixesOf(i).length);
      const fixes = allFixes(list);
      if (!fixes.length) { say('고칠 것이 없습니다 (각도는 찾기만)', 'err'); return null; }
      const go = () => {
        if (!guard()) return null;
        evt('GEOCHECK_FIXALL');
        const R = apply(fixes, `${list.length}건 모두`);
        if (R && cur) scanNow();
        return R;
      };
      if (skipConfirm === true) return go();
      curConfirm = confirmAll(list, fixes, go) || null;
      return curConfirm;
    }

    bScan.onclick = () => scanNow();
    bOne.onclick = () => fixOne();
    bAll.onclick = () => fixAll();
    bX.onclick = () => close();
    [iTol, iAng, iEx].forEach(x => { x.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); scanNow(); } if (ev.key === 'Escape') close(); }; });

    let m;
    try { m = modal(TITLE, [body], [bScan, bOne, bAll, bX]); m.classList.add('gck'); }
    catch (_) { note('선 끝 점검 창을 열지 못했습니다'); return null; }
    cur = m;
    try { const x = m.querySelector('[data-x]'); if (x) x.onclick = () => close(); } catch (_) { }
    S0.api = { scanNow, fixOne, fixAll };
    scanNow();
    say('선 끝 점검: 줄을 누르면 그 자리로 갑니다 · [모두 고치기]는 되돌리기 한 번', 'ok');
    return m;
  }

  /* ---------- 명령 등록 (새 키만) ---------- */
  if (!TOOLS.geocheck) TOOLS.geocheck = () => { try { open(); } catch (_) { note('선 끝 점검 창을 열지 못했습니다'); } return null; };
  for (const [k, v] of Object.entries({ GEOCHECK: 'geocheck', GCK: 'geocheck' })) if (!(k in ALIAS)) ALIAS[k] = v;
  if (typeof CMD_KO === 'object' && !CMD_KO.geocheck) CMD_KO.geocheck = '선 끝 점검';
  if (typeof KO_CMD === 'object') for (const [k, v] of Object.entries({ 선끝점검: 'geocheck', 틈찾기: 'geocheck' })) if (!(k in KO_CMD)) KO_CMD[k] = v;

  window.GEOCHECK_UI = {
    open, close, rows,
    scanNow: () => (st && st.api ? st.api.scanNow() : null),
    fixOne: () => (st && st.api ? st.api.fixOne() : null),
    fixAll: skip => (st && st.api ? st.api.fixAll(skip) : null),
    state: () => (st ? { tol: st.tol, angTol: st.angTol, kinds: Object.assign({}, st.kinds), n: st.list.length, pick: st.pick, stale: !!st.stale, mark: mark ? Object.assign({}, mark) : null } : null)
  };
})();
