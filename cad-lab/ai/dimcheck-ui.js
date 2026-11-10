/* 무카 CAD AI 팀 실험판 — 치수 덮어쓰기 찾기 창 (11회차 개발2, 2026-11-10)
   window.DIMCHECK_UI = { open, close, scanNow, pickDiff, clearPick, fix, csv, state }
   명령: DIMCHECK · DCK · 한글 '치수검사' · '치수덮어쓰기' ('치수 검사' 띄어쓰기도 같음)
   - 계산·고치기는 하지 않음: dimcheck-core.js 의 DIMCHK.scan(opt) 와 COMMANDS.dimfix 만 부름
   - 범위: 고른 객체가 있으면 그 안의 치수, 없으면 도면 전체
   - 표: 번호 · 종류 · 측정값 · 보이는 글자 · 차이 · 판정. 다름 먼저, 500줄까지(나머지는 CSV)
   - 줄을 누르면 그 치수로 확대 + 선택. 체크 박스는 기본 없음, [다름만 고르기] 단추
     (마감 회의: verdict 'diff' 이고 withinTol 아닌 줄만. 'check'(확인 필요)는 손으로 체크할 때만)
   - 확인 창에 바뀌는 글자 앞 5개 "전 → 후"(본체 dimGeom 으로 그린 글자) · 표 밖 개수 · 확인 필요 개수
   - [고른 n개 글자 되돌리기] → 확인 창 "n개 글자만 바뀜 · 형상은 그대로 · U 로 되돌림"
     → 검사 뒤 도면이 바뀌었으면 고치지 않고 다시 검사
     → runBatch 전에 DIMCHK.scan({ids}) 로 dimfix 와 같은 검사(글자·측정값·고칠 수 있음)를 먼저 해 빈 되돌리기 칸을 만들지 않음
     → runBatch([{cmd:'dimfix', ids, expect}], {label:'치수 글자 되돌리기'}) 1번 = 되돌리기 1번. R.ok false 면 undoStack.pop()
   - 화면 말투는 "다름(형상과 글자가 다름)" — 단정하지 않음. 형상을 고칠지 글자를 고칠지는 사용자 판단
   - 도면 글자는 모두 textContent(모달 제목 포함). CSV 는 수식 주입 막기(= + - @ 로 시작하면 앞에 ').
   - 사용 기록은 'DIMCHECK' 이름만. 이미 있는 TOOLS·ALIAS·KO_CMD·CMD_KO 키는 덮지 않음(새 키만). */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  if (window.DIMCHECK_UI) return; // 두 번 불려도 changed 를 두 번 감싸지 않게
  const TITLE = '치수 덮어쓰기 찾기';
  const LABEL = '치수 글자 되돌리기';
  const MAX_ROWS = 500;
  const KIND_KO = { linear: '선형', aligned: '정렬', radius: '반지름', diameter: '지름', angular: '각도', arclen: '호 길이', jogged: '꺾인 반지름', ordinate: '좌표' };
  const V_KO = { diff: '다름', check: '확인 필요', same: '같음(고정)', hidden: '숨김', nonum: '숫자 없음', auto: '자동' };
  const V_ORDER = { diff: 0, check: 1, same: 2, hidden: 3, nonum: 4, auto: 5 };
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const note = m => { try { toast(m); } catch (_) { } try { log(m, 'err'); } catch (_) { } };
  const evt = () => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'DIMCHECK' }); } catch (_) { } };
  const fin = x => typeof x === 'number' && isFinite(x);
  const num = x => (fin(+x) ? +x : 0);
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  const C = () => (window.DIMCHK && typeof window.DIMCHK.scan === 'function') ? window.DIMCHK : null;
  const hasFix = () => { try { return typeof COMMANDS === 'object' && typeof COMMANDS.dimfix === 'function'; } catch (_) { return false; } };
  const missing = () => note('치수 검사 모듈이 아직 없습니다 (dimcheck-core.js). 새로고침 뒤 다시 해 주세요.');
  const nf = (v, k) => { if (!fin(+v)) return '-'; const s = (+v).toFixed(k == null ? 4 : k); return s.indexOf('.') < 0 ? s : s.replace(/\.?0+$/, ''); };
  const kindKo = k => KIND_KO[k] || String(k == null ? '?' : k);
  const vKo = v => V_KO[v] || String(v == null ? '?' : v);
  const vTxt = x => vKo(x.verdict) + (x.verdict === 'diff' && x.withinTol ? '(허용값 안)' : '');
  const valTxt = r => (fin(+r.value) ? nf(r.value) + (r.kind === 'angular' ? '°' : '') : '-');
  const diffTxt = r => { if ((r.verdict !== 'diff' && r.verdict !== 'check') || !fin(+r.diff)) return ''; const d = +r.diff; return (d > 0 ? '+' : d < 0 ? '−' : '') + nf(Math.abs(d)); };
  const shownTxt = r => { const s = r.shown != null ? String(r.shown) : (r.text != null ? String(r.text) : ''); return s; };

  if (!document.getElementById('dimcheckCss')) {
    const st = document.createElement('style'); st.id = 'dimcheckCss';
    st.textContent = `
.modal.dck{background:transparent;pointer-events:none;place-items:start end}
.modal.dck .sheet{pointer-events:auto;width:min(560px,100%);max-height:100%;box-shadow:0 8px 28px rgba(0,0,0,.45)}
.modal.dckc{background:rgba(5,7,9,.45);z-index:6}
.modal.dckc .sheet{width:min(400px,100%)}
.dck .scope{margin:0 0 6px;color:var(--ink-dim);font-size:12px}
.dck .dim{color:var(--ink-dim)}
.dck .info{margin:6px 0 0;font-size:12px;color:var(--ink-dim);line-height:1.45}
.dck .warn{margin:0 0 6px;padding:5px 8px;border:1px solid var(--tag);border-radius:6px;color:var(--tag);font-size:12px;line-height:1.45}
.dck .empty{margin:8px 0;padding:12px;border:1px dashed var(--rule);border-radius:6px;text-align:center;color:var(--ink-dim);font-size:13px}
.dck .sum{margin:4px 0 6px;font-size:12px;color:var(--ink)}
.dck .bar{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:0 0 6px;font-size:12px}
.dck .bar label{display:inline-flex;gap:4px;align-items:center;cursor:pointer;color:var(--ink-dim)}
.dck .tw{max-height:min(46vh,420px);overflow:auto;border:1px solid var(--rule);border-radius:6px}
.dck table{border-collapse:collapse;width:100%;font-size:12px}
.dck th,.dck td{padding:4px 7px;border-bottom:1px solid var(--rule);text-align:left;white-space:nowrap}
.dck td.tx{max-width:150px;overflow:hidden;text-overflow:ellipsis;font-family:var(--mono,monospace)}
.dck th{position:sticky;top:0;background:var(--chrome-2);color:var(--ink-dim);font-weight:600;z-index:1}
.dck tbody tr{cursor:pointer}
.dck tbody tr:hover,.dck tbody tr:focus{background:var(--chrome-2);outline:none}
.dck tbody tr.on{outline:1px solid var(--accent,#4da3ff);outline-offset:-1px}
.dck td.n{text-align:right;font-family:var(--mono,monospace)}
.dck td.v-diff{color:#ff6b6b;font-weight:600}
.dck td.v-same{color:var(--tag,#f1c232)}
.dck td.v-check{color:#ff9f43;font-weight:600}
.dckc ul.pv{margin:2px 0 8px 16px;padding:0;font:12px var(--mono,monospace);line-height:1.6}
.dckc ul.pv li{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dckc .warn{padding:5px 8px;border:1px solid var(--tag);border-radius:6px;color:var(--tag)}
.dck td.v-hidden,.dck td.v-nonum,.dck td.v-auto{color:var(--ink-dim)}
.dck .more{padding:4px 8px;color:var(--ink-dim);font-size:12px}
.dckc p{margin:0 0 6px;font-size:12px;line-height:1.5}
.dckc .big{font-size:13px;font-weight:600}`;
    document.head.appendChild(st);
  }

  /* 모달 제목도 textContent 로 (본체 modal 은 제목을 aria-label 에 innerHTML 로 넣으므로 빈 제목으로 만들고 뒤에 채움) */
  function mkModal(title, body, foot, cls) {
    const m = modal('', [body], foot);
    try { const h = m.querySelector('header span'); if (h) h.textContent = title; const sh = m.querySelector('.sheet'); if (sh) sh.setAttribute('aria-label', title); } catch (_) { }
    if (cls) m.classList.add(cls);
    return m;
  }

  /* ---------- 검사 뒤 도면이 바뀌었나 (geocheck-ui 와 같은 서명 방식) ---------- */
  let onChg = null;
  try {
    if (typeof changed === 'function' && !changed.__dck) {
      const _cDck = changed;
      const w = function () {
        try { return _cDck.apply(this, arguments); }
        finally { if (onChg) { try { onChg(); } catch (_) { } } }
      };
      w.__dck = true;
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

  /* ---------- 결과 읽기 ---------- */
  const rowsOf = r => (r && Array.isArray(r.rows) ? r.rows.filter(x => x && typeof x === 'object' && x.id != null) : [])
    .map((x, i) => ({ x, i })).sort((a, b) => ((V_ORDER[a.x.verdict] ?? 9) - (V_ORDER[b.x.verdict] ?? 9)) || (a.i - b.i)).map(o => o.x);
  const canFix = x => !!(x && x.fixable === true && (x.verdict === 'diff' || x.verdict === 'check' || x.verdict === 'same' || x.verdict === 'hidden'));
  /* [다름만 고르기] 대상: 다름 · 허용값 밖 · 고칠 수 있음 ('확인 필요'는 손으로 체크할 때만) */
  const autoPick = x => !!(x && x.verdict === 'diff' && !x.withinTol && canFix(x));
  function skipText(r) {
    const s = (r && r.skipped && typeof r.skipped === 'object') ? r.skipped : {};
    const P = [['block', '블록 안'], ['off', '꺼진·얼린 층'], ['locked', '잠긴 층']];
    const parts = P.filter(([k]) => num(s[k]) > 0).map(([k, t]) => `${t} ${num(s[k])}개`);
    return parts.length ? parts.join(' · ') + ' — 이 치수는 고치지 않음' : '';
  }
  const entMap = () => { const M = new Map(); try { for (const e of doc.entities) M.set(e.id, e); } catch (_) { } return M; };
  const selIds = () => { try { if (sel && (sel.size != null ? sel.size : sel.length)) return [...sel]; } catch (_) { } return null; };

  function zoomTo(id) {
    try {
      const e = entMap().get(id); if (!e) return false;
      let b = null; try { b = bbox([e]); } catch (_) { b = null; }
      if (!b || !fin(b.minX) || !fin(b.maxX)) return false;
      const w = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1e-3), pad = w * 0.6 + 5;
      zoomBox(b.minX - pad, b.minY - pad, b.maxX + pad, b.maxY + pad);
      try { sel.clear(); sel.add(id); } catch (_) { }
      try { changed(); } catch (_) { }
      dirty = true; return true;
    } catch (_) { return false; }
  }

  /* ---------- CSV (전부, 수식 주입 막기) ---------- */
  const cell = v => {
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    let s = String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
    const h = s.replace(/^\s+/, '');
    if (/^[=+\-@]/.test(h) && !/^-\d+(\.\d+)?$/.test(h) && h !== '-') s = "'" + s;
    return /[",]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  function toCSV(list) {
    const L = [['No', '종류', '측정값', '보이는 글자', '차이(글자-형상)', '판정', '고칠 수 있음'].map(cell).join(',')];
    list.forEach((x, i) => L.push([i + 1, kindKo(x.kind), fin(+x.value) ? +nf(x.value) : '', shownTxt(x), (x.verdict === 'diff' || x.verdict === 'check') && fin(+x.diff) ? +nf(x.diff) : '', vTxt(x), canFix(x) ? '예' : ''].map(cell).join(',')));
    return '﻿' + L.join('\r\n') + '\r\n';
  }
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

  /* ---------- 창 ---------- */
  let cur = null, curConfirm = null, st = null;
  function close() {
    if (curConfirm) { try { curConfirm.remove(); } catch (_) { } curConfirm = null; }
    if (cur) { try { cur.remove(); } catch (_) { } cur = null; }
    st = null; onChg = null;
  }
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || !cur || !cur.isConnected) return;
    if (curConfirm && curConfirm.isConnected) { curConfirm.remove(); curConfirm = null; ev.stopPropagation(); return; }
    close();
  }, true);
  try {
    const vw = document.getElementById('view');
    if (vw) new MutationObserver(() => { if (cur && !cur.isConnected) { cur = null; st = null; onChg = null; } }).observe(vw, { childList: true });
  } catch (_) { }

  function open() {
    if (!C()) { missing(); return null; }
    evt();
    close();
    const ids0 = selIds();
    st = { scope: ids0, r: null, list: [], pick: -1, chk: new Set(), showAuto: false, sig: null, stale: false };
    const S0 = st;

    const body = el('div', 'dck');
    const scopeP = el('p', 'scope');
    const staleBox = el('div');
    const bar = el('div', 'bar');
    const bDiff = el('button', 'tbtn', '다름만 고르기');
    const bNone = el('button', 'tbtn', '모두 풀기');
    const lbA = el('label'), cbA = el('input'); cbA.type = 'checkbox'; cbA.checked = false;
    lbA.append(cbA, el('span', null, '자동 치수도 보기'));
    const pickN = el('span', 'dim');
    bar.append(bDiff, bNone, lbA, pickN);
    const res = el('div');
    const info = el('p', 'info');
    const help = el('p', 'info', '다름 = 형상(측정값)과 치수 글자가 다름. 형상을 고칠지 글자를 고칠지는 사용자가 판단하세요. 되돌리기는 덮어쓴 숫자 자리만 측정값(<>)으로 바꾸고 TYP·()·2- 같은 글자는 남깁니다.');
    body.append(scopeP, staleBox, bar, res, info, help);

    const bScan = el('button', 'tbtn', '검사');
    const bCsv = el('button', 'tbtn', 'CSV');
    const bFix = el('button', 'tbtn primary', '고른 것 글자 되돌리기');
    const bX = el('button', 'tbtn', '닫기');

    const isStale = () => !!S0.sig && !sameSig(S0.sig, docSig());
    function paintStale() {
      staleBox.textContent = '';
      if (S0.stale) staleBox.appendChild(el('p', 'warn', '도면이 바뀜 — [검사]를 다시 누르세요'));
      res.style.opacity = S0.stale ? '.45' : '';
    }
    onChg = () => { if (st === S0 && cur && cur.isConnected && S0.r && !S0.stale && isStale()) { S0.stale = true; paintStale(); paintPick(); } };
    const guard = () => { if (!isStale()) return true; note('검사 뒤 도면이 바뀌어 다시 검사했습니다 — 다시 골라 주세요'); scanNow(); return false; };

    const visible = () => S0.list.filter(x => S0.showAuto || x.verdict !== 'auto');
    function paintPick() {
      const n = S0.chk.size;
      const vis = new Set(visible().slice(0, MAX_ROWS).map(x => x.id));
      let out = 0; for (const id of S0.chk) if (!vis.has(id)) out++;
      pickN.textContent = n ? `고른 것 ${n}개` + (out ? ` (표 밖 ${out}개 포함)` : '') : '고른 것 없음';
      bFix.textContent = n ? `고른 ${n}개 글자 되돌리기` : '고른 것 글자 되돌리기';
      bFix.disabled = !n || S0.stale;
      const nd = S0.list.filter(autoPick).length;
      bDiff.disabled = !nd; bNone.disabled = !n;
    }

    function paintResult() {
      res.textContent = ''; info.textContent = '';
      const r = S0.r;
      if (!r) { res.appendChild(el('p', 'dim', '[검사] 를 누르세요')); paintPick(); return; }
      const cnt = {}; S0.list.forEach(x => { cnt[x.verdict] = (cnt[x.verdict] || 0) + 1; });
      const sumTxt = ['diff', 'check', 'same', 'hidden', 'nonum', 'auto'].filter(k => cnt[k]).map(k => `${vKo(k)} ${cnt[k]}`).join(' · ');
      res.appendChild(el('p', 'sum', `본 치수 ${fin(+r.total) ? +r.total : S0.list.length}개` + (sumTxt ? ` — ${sumTxt}` : '') + (fin(+r.ms) ? ` · ${Math.round(r.ms)} ms` : '')));
      if (cnt.check) res.appendChild(el('p', 'warn', `확인 필요 ${cnt.check}개 — 낱말이 섞였거나 차이가 커서 일부러 쓴 글자일 수 있음. [다름만 고르기]에서 빠지고, 손으로 체크할 때만 고칩니다.`));
      if (!cnt.diff && !cnt.check) res.appendChild(el('p', 'empty', cnt.same || cnt.hidden || cnt.nonum ? '형상과 글자가 다른 치수 없음 (덮어쓴 글자는 있음)' : '덮어쓴 치수 글자 없음'));
      const list = visible();
      if (list.length) {
        const tw = el('div', 'tw'), tb = el('table'), th = el('thead'), hr = el('tr');
        ['', 'No', '종류', '측정값', '보이는 글자', '차이', '판정'].forEach(t => hr.appendChild(el('th', null, t)));
        th.appendChild(hr); tb.appendChild(th);
        const bd = el('tbody');
        list.slice(0, MAX_ROWS).forEach((x, n) => {
          const tr = el('tr'); tr.tabIndex = 0; if (n === S0.pick) tr.className = 'on';
          const td0 = el('td'), cb = el('input'); cb.type = 'checkbox';
          const can = canFix(x);
          cb.disabled = !can; cb.checked = can && S0.chk.has(x.id);
          const WHY = { locked: '잠긴 층', off: '꺼진 층', frozen: '얼린 층', block: '블록 안' };
          cb.title = can ? '글자 되돌리기에 넣기' : (x.verdict === 'auto' ? '덮어쓰지 않은 치수' : x.verdict === 'nonum' ? '숫자가 없어 판정 안 함' : '고칠 수 없음' + (WHY[x.why] ? ` (${WHY[x.why]})` : '(꺼진·잠긴 층 등)'));
          cb.onclick = ev => ev.stopPropagation();
          cb.onchange = () => { if (cb.checked) S0.chk.add(x.id); else S0.chk.delete(x.id); paintPick(); };
          td0.appendChild(cb); tr.appendChild(td0);
          tr.appendChild(el('td', 'n', n + 1));
          tr.appendChild(el('td', null, kindKo(x.kind)));
          tr.appendChild(el('td', 'n', valTxt(x)));
          const tdT = el('td', 'tx', shownTxt(x)); tdT.title = shownTxt(x); tr.appendChild(tdT);
          tr.appendChild(el('td', 'n', diffTxt(x)));
          tr.appendChild(el('td', 'v-' + String(x.verdict).replace(/[^a-z]/g, ''), vTxt(x)));
          const go = () => {
            S0.pick = n; [...bd.children].forEach((y, j) => { y.className = j === n ? 'on' : ''; });
            if (!zoomTo(x.id)) note('이 치수로 확대하지 못했습니다');
          };
          tr.onclick = go;
          tr.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); go(); } };
          bd.appendChild(tr);
        });
        tb.appendChild(bd); tw.appendChild(tb);
        if (list.length > MAX_ROWS) tw.appendChild(el('div', 'more', `나머지 ${list.length - MAX_ROWS}개는 CSV 로 보세요`));
        res.appendChild(tw);
      }
      info.textContent = skipText(r);
      paintPick();
    }

    function scanNow() {
      const M = C(); if (!M) { missing(); return null; }
      const opt = { tol: 0 }; if (S0.scope) opt.ids = S0.scope.slice();
      let r = null, err = null;
      try { r = M.scan(opt); } catch (e) { err = e; r = null; }
      if (!r || typeof r !== 'object') { note('치수 검사를 하지 못했습니다' + (err && err.message ? ': ' + err.message : '')); return null; }
      S0.r = r; S0.list = rowsOf(r); S0.pick = -1; S0.chk = new Set(); S0.sig = docSig(); S0.stale = false;
      scopeP.textContent = S0.scope ? `범위: 고른 객체 ${S0.scope.length}개 안의 치수` : '범위: 도면 전체';
      paintStale(); paintResult();
      return r;
    }

    function pickDiff() {
      if (S0.stale) { guard(); return 0; }
      S0.chk = new Set(S0.list.filter(autoPick).map(x => x.id));
      paintResult(); return S0.chk.size;
    }
    function clearPick() { S0.chk = new Set(); paintResult(); }

    /* dimfix 와 같은 검사를 runBatch 전에: 지금 다시 검사해 글자·측정값이 검사 때와 같고 아직 고칠 수 있는지 */
    function precheck(ids, expect) {
      const M = C(); if (!M) return '치수 검사 모듈이 없습니다';
      let r2 = null; try { r2 = M.scan({ ids: ids.slice(), tol: 0 }); } catch (e) { return '다시 검사하지 못했습니다' + (e && e.message ? ': ' + e.message : ''); }
      const now = new Map(); for (const x of (r2 && Array.isArray(r2.rows) ? r2.rows : [])) if (x && x.id != null) now.set(x.id, x);
      const Ent = entMap();
      let bad = 0;
      for (const id of ids) {
        const x = now.get(id), e = Ent.get(id), ex = expect[id];
        if (!x || !e || !ex || !canFix(x)) { bad++; continue; }
        const tNow = e.text == null ? null : String(e.text);
        if (tNow !== ex.text || x.text !== ex.text) { bad++; continue; }
        if (!(fin(+x.value) && fin(+ex.value) && +x.value === +ex.value)) { bad++; continue; }
      }
      return bad ? `${bad}개가 검사 때와 달라졌습니다` : '';
    }

    function apply() {
      if (!hasFix()) { note('치수 글자 되돌리기 명령(dimfix)이 아직 없습니다 (dimcheck-core.js)'); return null; }
      if (!guard()) return null;
      const byId = new Map(S0.list.map(x => [x.id, x]));
      const rowsF = [...S0.chk].map(id => byId.get(id)).filter(canFix);
      if (!rowsF.length) { say('고른 치수가 없습니다', 'err'); return null; }
      const ids = rowsF.map(x => x.id), expect = {};
      for (const x of rowsF) expect[x.id] = { text: x.text == null ? null : String(x.text), value: x.value };
      const why = precheck(ids, expect);
      if (why) { note(`${why} — 아무것도 바꾸지 않고 다시 검사했습니다`); scanNow(); return null; }
      const u0 = (typeof undoStack === 'object' && undoStack) ? undoStack.length : -1;
      let R = null, err = null;
      try { R = runBatch([{ cmd: 'dimfix', ids, expect }], { label: LABEL }); } catch (e) { err = e; R = null; }
      if (!R || !R.ok) {
        // 빈 되돌리기 칸을 빼고, 그 사본으로 도면도 runBatch 전 그대로 (dimfix 는 throw 때 아무것도 안 바꾸지만 한 번 더 지킴)
        try { if (u0 >= 0 && undoStack.length > u0) { const snap = undoStack.pop(); doc = JSON.parse(snap); sel.clear(); changed(); } } catch (_) { }
        const m = (R && R.errors && R.errors[0]) || (err && err.message) || '';
        note('치수 글자를 바꾸지 못했습니다 — 바뀐 것 없음' + (m ? ` (${m})` : ''));
        if (cur) scanNow();
        return R;
      }
      const r0 = (R.results && R.results[0]) || {};
      const n = fin(+r0.n) ? +r0.n : (Array.isArray(r0.ids) ? r0.ids.length : ids.length);
      say(`치수 덮어쓰기 찾기: 치수 ${n}개 글자를 측정값으로 되돌림 · 형상은 그대로 · 되돌리기(Ctrl+Z) 한 번에 원래대로`, 'ok');
      if (cur) scanNow();
      return R;
    }

    /* 고친 뒤 화면 글자: fixText 를 넣은 사본으로 본체 dimGeom 이 그리는 글자 그대로 (안 되면 <> 자리에 측정값) */
    function afterTxt(x, e) {
      try {
        if (e && typeof dimGeom === 'function') {
          const c = Object.assign({}, e); if (x.fixText == null) delete c.text; else c.text = x.fixText;
          const g = dimGeom(c); if (g && g.text && g.text.s != null) return String(g.text.s);
        }
      } catch (_) { }
      const v = valTxt(x);
      return x.fixText == null ? v : String(x.fixText).replace('<>', v);
    }
    function fix(skipConfirm) {
      if (!guard()) return null;
      const byId = new Map(S0.list.map(x => [x.id, x]));
      const rowsF = [...S0.chk].map(id => byId.get(id)).filter(canFix);
      const n = rowsF.length;
      if (!n) { say('되돌릴 치수를 먼저 고르세요 ([다름만 고르기])', 'err'); return null; }
      if (skipConfirm === true) return apply();
      const vis = new Set(visible().slice(0, MAX_ROWS).map(x => x.id));
      const nOut = rowsF.filter(x => !vis.has(x.id)).length, nChk = rowsF.filter(x => x.verdict === 'check').length;
      const Ent = entMap();
      const b = el('div', 'dck');
      b.appendChild(el('p', 'big', `${n}개 글자만 바뀜 · 형상은 그대로 · U 로 되돌림`));
      b.appendChild(el('p', 'dim', n > 5 ? `바뀌는 글자 (앞 5개 / ${n}개)` : '바뀌는 글자'));
      const ul = el('ul', 'pv');
      rowsF.slice(0, 5).forEach(x => { const li = el('li', null, `${shownTxt(x)} → ${afterTxt(x, Ent.get(x.id))}`); li.title = li.textContent; ul.appendChild(li); });
      b.appendChild(ul);
      if (nOut) b.appendChild(el('p', null, `표 밖(500줄 뒤) ${nOut}개 포함 — CSV 로 확인할 수 있음`));
      const nChkAll = S0.list.filter(x => x.verdict === 'check').length;
      if (nChk) b.appendChild(el('p', 'warn', `확인 필요 ${nChkAll}개 중 ${nChk}개 포함 — 낱말이 섞였거나 차이가 큰 글자`));
      else if (nChkAll) b.appendChild(el('p', 'dim', `확인 필요 ${nChkAll}개는 빠짐 — 손으로 체크할 때만 고침`));
      b.appendChild(el('p', 'dim', '덮어쓴 숫자 자리만 측정값으로 바꿉니다. 형상이 맞는지는 먼저 확인하세요.'));
      const bYes = el('button', 'tbtn primary', '글자 되돌리기'), bNo = el('button', 'tbtn', '취소');
      let m;
      try { m = mkModal('글자 되돌리기 확인', b, [bNo, bYes], 'dckc'); } catch (_) { note('확인 창을 열지 못했습니다'); return null; }
      curConfirm = m;
      bNo.onclick = () => { m.remove(); curConfirm = null; };
      bYes.onclick = () => { m.remove(); curConfirm = null; apply(); };
      setTimeout(() => { try { bNo.focus(); } catch (_) { } }, 0);
      return m;
    }

    function csv() {
      if (!S0.r) return null;
      const s = toCSV(S0.list);
      try { offer(`치수검사_${stamp()}.csv`, s); } catch (_) { note('CSV 를 저장하지 못했습니다'); }
      return s;
    }

    bScan.onclick = () => scanNow();
    bCsv.onclick = () => csv();
    bFix.onclick = () => fix();
    bX.onclick = () => close();
    bDiff.onclick = () => pickDiff();
    bNone.onclick = () => clearPick();
    cbA.onchange = () => { S0.showAuto = cbA.checked; S0.pick = -1; paintResult(); };

    let m;
    try { m = mkModal(TITLE, body, [bScan, bCsv, bFix, bX], 'dck'); }
    catch (_) { note('치수 검사 창을 열지 못했습니다'); return null; }
    cur = m;
    try { const x = m.querySelector('[data-x]'); if (x) x.onclick = () => close(); } catch (_) { }
    S0.api = { scanNow, pickDiff, clearPick, fix, csv };
    if (scanNow()) say('치수 덮어쓰기 찾기: 줄을 누르면 그 치수로 갑니다 · 다름 = 형상과 글자가 다름', 'ok');
    return m;
  }

  /* ---------- 명령 등록 (새 키만) ---------- */
  if (!TOOLS.dimcheck) TOOLS.dimcheck = () => { try { open(); } catch (_) { note('치수 검사 창을 열지 못했습니다'); } return null; };
  for (const [k, v] of Object.entries({ DIMCHECK: 'dimcheck', DCK: 'dimcheck' })) if (!(k in ALIAS)) ALIAS[k] = v;
  if (typeof CMD_KO === 'object' && !CMD_KO.dimcheck) CMD_KO.dimcheck = TITLE;
  if (typeof KO_CMD === 'object') for (const [k, v] of Object.entries({ 치수검사: 'dimcheck', 치수덮어쓰기: 'dimcheck' })) if (!(k in KO_CMD)) KO_CMD[k] = v;

  const api = f => (...a) => (st && st.api ? st.api[f](...a) : null);
  window.DIMCHECK_UI = {
    ver: 1, open, close,
    scanNow: api('scanNow'), pickDiff: api('pickDiff'), clearPick: api('clearPick'), fix: api('fix'), csv: api('csv'),
    state: () => (st ? { n: st.list.length, diff: st.list.filter(x => x.verdict === 'diff').length, check: st.list.filter(x => x.verdict === 'check').length, picked: [...st.chk], stale: !!st.stale, scope: st.scope ? st.scope.length : null } : null)
  };
})();
