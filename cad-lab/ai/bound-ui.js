/* 무카 CAD AI 팀 실험판 — 경계 만들기 화면 (8회차 개발2, 2026-11-10)
   명령: BO · BOUNDARY · 한글 '경계' · '경계만들기'
   - 계산은 하지 않음: bound-core.js 의 BOUND.at(p,opt) / BOUND.suspects(outer) 와 COMMANDS.boundary 만 부름
   - 안쪽 점 클릭(또는 50,25 입력)마다 미리보기 = 점선 고리 + 면적 글자 (화면 위 표시만 — 도면 객체 아님)
   - Enter → 모든 점이 ok 일 때만 runBatch([{cmd:'boundary',points,ids?,islands}],{label:'경계 만들기'}) 1번 = 되돌리기 1번
   - Esc → 아무것도 만들지 않음. 옵션 섬(I) 기본 꺼짐. U = 마지막 점 빼기
   - 실패 안내 3종(open / bad-point / too-many), 노란 경고(suspects>0 · bigFrame), 단위·근사 표시, 현재 층 꺼짐·잠김 안내
   - 단축키 저장 샘 막기: diffShortcuts 를 한 번만 감싸, 실험판이 넣은 키(BO·BOUNDARY → boundary, GEOCHECK·GCK 등)를 저장에서 뺌
   - 화면 글자는 모두 textContent, 사용 기록은 'BOUNDARY' 이름만, 복사 글자는 숫자만
   - ALIAS 는 BO·BOUNDARY 두 키만 덮어씀. 나머지는 없는 키만 새로 넣음 */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  if (window.BOUND_UI) return; // 두 번 불려도 render·diffShortcuts 를 두 번 감싸지 않게
  const LABEL = '경계 만들기';
  const UNIT = '도면 단위²(mm² 가정)';
  const fin = x => typeof x === 'number' && isFinite(x);
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const note = m => { try { toast(m); } catch (_) { } try { log(m, 'err'); } catch (_) { } };
  const evt = name => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: name }); } catch (_) { } };
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  const B = () => (window.BOUND && typeof window.BOUND.at === 'function') ? window.BOUND : null;
  const hasCmd = () => { try { return typeof COMMANDS === 'object' && typeof COMMANDS.boundary === 'function'; } catch (_) { return false; } };
  const nf = (v, k) => { if (!fin(+v)) return '-'; const s = (+v).toFixed(k == null ? 3 : k); return s.indexOf('.') < 0 ? s : s.replace(/\.?0+$/, ''); };
  const numOnly = v => { const s = nf(Math.abs(+v || 0), 6); return /^[0-9.]+$/.test(s) ? s : '0'; };
  const selIds = () => { try { if (sel && (sel.size != null ? sel.size : sel.length)) return [...sel]; } catch (_) { } return null; };
  const geoOK = () => { try { return typeof TOOLS.geocheck === 'function'; } catch (_) { return false; } };

  /* ---------- 단축키 저장 샘 막기 (실험판 키가 본체 단축키 저장에 섞이지 않게) ---------- */
  const LAB_VAL = { BO: 'boundary', BOUNDARY: 'boundary', GEOCHECK: 'geocheck', GCK: 'geocheck' };
  const labSnap = new Map();
  /* 불러올 때 찍어 둔 실험판 키: 본체 기본값과 다르고, 사용자가 저장해 둔 값(localStorage)도 아닌 키
     = 실험판 스크립트(labcmds 등)가 넣은 키. 값이 그대로일 때만 저장에서 뺌(사용자가 나중에 바꾸면 저장됨) */
  let savedAdd = null, savedDel = [];
  try { const raw = localStorage.getItem(typeof SC_KEY === 'string' ? SC_KEY : 'muccacad.shortcuts.v1'); const d = raw ? JSON.parse(raw) : null; savedAdd = d && d.add && typeof d.add === 'object' ? d.add : {}; savedDel = d && Array.isArray(d.del) ? d.del : []; } catch (_) { savedAdd = {}; savedDel = []; }
  /* 저장 직전의 기존 저장 값 (없으면 불러올 때 읽은 값) */
  function savedNow() {
    let d = null;
    try { const raw = localStorage.getItem(typeof SC_KEY === 'string' ? SC_KEY : 'muccacad.shortcuts.v1'); d = raw ? JSON.parse(raw) : null; } catch (_) { d = null; }
    const add = d && d.add && typeof d.add === 'object' ? d.add : (savedAdd || {});
    const del = d && Array.isArray(d.del) ? d.del : (savedDel || []);
    return { add, del };
  }
  function snapLab() {
    try {
      for (const [a, t] of Object.entries(ALIAS)) {
        if (ALIAS_DEF[a] === t) continue;
        if (savedAdd[a] === t && LAB_VAL[a] !== t && !labTool(t)) continue; // 사용자가 저장해 둔 본체 명령 키는 남김
        labSnap.set(a, t);
      }
    } catch (_) { }
  }
  /* 실험판 도구 이름 = TOOLS 에 있는데 본체 기본 ALIAS(ALIAS_DEF)·KEYMAP 기본값에는 없는 값 (부를 때마다 코드로 정함) */
  let defValsC = null;
  const defVals = () => {
    if (defValsC) return defValsC;
    const s = new Set();
    try { for (const v of Object.values(ALIAS_DEF)) s.add(v); } catch (_) { }
    try { for (const v of Object.values(KEYMAP_DEF)) s.add(v); } catch (_) { }
    return (defValsC = s);
  };
  const labTool = t => { try { return typeof t === 'string' && typeof TOOLS[t] === 'function' && !defVals().has(t); } catch (_) { return false; } };
  const isLab = (a, t) => LAB_VAL[a] === t || labTool(t) || (labSnap.has(a) && labSnap.get(a) === t);
  try {
    if (typeof diffShortcuts === 'function' && !diffShortcuts.__bnd) {
      const _dBnd = diffShortcuts;
      const w = function () {
        const r = _dBnd.apply(this, arguments);
        try {
          if (r && r.add && typeof r.add === 'object') {
            const sv = savedNow();
            for (const a of Object.keys(r.add)) {
              if (!isLab(a, r.add[a])) continue;
              delete r.add[a];
              // 사용자가 이미 저장해 둔 값이 있으면 그 값을 되돌려 넣음 (실험판 값만 아니면)
              if (Object.prototype.hasOwnProperty.call(sv.add, a) && typeof sv.add[a] === 'string' && !(LAB_VAL[a] === sv.add[a] || labTool(sv.add[a]))) r.add[a] = sv.add[a];
              else if (sv.del.includes(a) && Array.isArray(r.del) && !r.del.includes(a)) { try { if (a in ALIAS_DEF) r.del.push(a); } catch (_) { } }
            }
          }
        } catch (_) { }
        return r;
      };
      w.__bnd = true;
      diffShortcuts = w;
    }
  } catch (_) { }

  /* ---------- 모양 ---------- */
  if (!document.getElementById('boundCss')) {
    const st = document.createElement('style'); st.id = 'boundCss';
    st.textContent = `
.bndp{position:absolute;left:10px;top:10px;z-index:4;width:min(380px,calc(100% - 20px));background:var(--chrome,#191d23);color:var(--ink,#dfe4ea);border:1px solid var(--rule,#2c333d);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.45;box-shadow:0 6px 22px rgba(0,0,0,.4)}
.bndp h4{margin:0 0 4px;font-size:12px;font-weight:600}
.bndp .dim{color:var(--ink-dim,#8b95a3)}
.bndp .sum{margin:2px 0;font-family:var(--mono,monospace)}
.bndp .row{margin:1px 0;font-family:var(--mono,monospace);color:var(--ink-dim,#8b95a3)}
.bndp .warn{margin:4px 0 0;padding:4px 7px;border:1px solid var(--tag,#f1c232);border-radius:6px;color:var(--tag,#f1c232)}
.bndp .fail{margin:4px 0 0;padding:5px 7px;border:1px solid #ff6b6b;border-radius:6px;color:#ff9d9d}
.bndp .fail button{margin-top:4px}
.bndp .btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}`;
    document.head.appendChild(st);
  }

  /* ---------- 상태 ---------- */
  let T = null, panel = null;
  const stats = list => {
    const s = { n: list.length, area: 0, perim: 0, isl: 0, islArea: 0, net: 0, approx: false };
    for (const k of list) { const r = k.r; s.area += +r.area || 0; s.perim += +r.perim || 0; s.isl += Array.isArray(r.islands) ? r.islands.length : 0; s.islArea += +r.islandArea || 0; s.net += fin(+r.net) ? +r.net : (+r.area || 0) - (+r.islandArea || 0); if (r.approx) s.approx = true; }
    return s;
  };
  function sumText(list) {
    const s = stats(list);
    let t = `경계 ${s.n}개 · 면적 ${nf(s.area)} · 둘레 ${nf(s.perim)}`;
    if (s.isl) t += ` · 섬 ${s.isl}개 −${nf(s.islArea)} → 순면적 ${nf(s.net)}`;
    t += ` (${UNIT})`;
    if (s.approx) t += ' · 호 포함 — 면적 근사';
    return t;
  }
  /* 같은 고리 = 반올림한 꼭짓점 좌표 묶음이 같음 (bound-core.js COMMANDS.boundary 의 key 와 같은 방식) */
  const loopKey = l => (Array.isArray(l) ? l : []).map(q => (+q[0]).toPrecision(12) + ',' + (+q[1]).toPrecision(12)).sort().join(';');
  function failText(r) {
    const c = r && r.code;
    if (c === 'open') return '닫힌 경계를 찾지 못했습니다 — 선 끝에 틈이 있으면 GEOCHECK(선 끝 점검)로 먼저 고치세요';
    if (c === 'bad-point') return '선 위를 눌렀습니다 — 안쪽을 누르세요';
    if (c === 'too-many') return '객체가 너무 많아 찾지 못했습니다 — S 로 범위를 골라 BO';
    if (c === 'error' && r.missing) return String(r.msg);
    if (c === 'error') return '경계 계산 오류 — 다시 시도하거나 S 로 범위를 줄이세요';
    return '경계를 찾지 못했습니다' + (r && r.msg ? ' — ' + String(r.msg).slice(0, 120) : '');
  }
  function layerState() {
    try {
      const name = doc.current; const L = typeof layerOf === 'function' ? layerOf(name) : null;
      if (!L) return null;
      if (L.visible === false || L.frozen) return { name, what: '꺼져(또는 동결돼) 있어 만든 경계가 안 보입니다' };
      if (L.locked) return { name, what: '잠겨 있어 만든 경계를 고칠 수 없습니다' };
    } catch (_) { }
    return null;
  }
  const atOpt = () => { const o = { islands: !!(T && T.islands) }; try { o.near = 3 / view.s; } catch (_) { o.near = 0; } if (T && T.ids) o.ids = T.ids.slice(); return o; };
  function callAt(p) {
    const M = B(); if (!M) return { ok: false, code: 'error', missing: true, msg: '경계 모듈(bound-core.js)이 아직 없습니다' };
    let r; try { r = M.at({ x: p.x, y: p.y }, atOpt()); } catch (e) { r = { ok: false, code: 'error', msg: e && e.message }; }
    if (!r || typeof r !== 'object') return { ok: false, code: 'error', msg: '결과 없음' };
    if (r.ok && !(Array.isArray(r.outer) && r.outer.length >= 3)) return { ok: false, code: 'error', msg: '결과 모양이 다름' };
    return r;
  }
  function suspectsOf(r) { try { const M = B(); if (!M || typeof M.suspects !== 'function') return -1; const n = +M.suspects(r.outer); return fin(n) ? n : -1; } catch (_) { return -1; } }
  const redraw = () => { try { dirty = true; } catch (_) { } };

  /* ---------- 창(화면 위 작은 판) ---------- */
  function closePanel() { if (panel) { try { panel.remove(); } catch (_) { } panel = null; } }
  function paint() {
    if (!T) { closePanel(); return; }
    const host = document.getElementById('view') || document.body;
    if (!panel || !panel.isConnected) { panel = el('div', 'bndp'); panel.setAttribute('role', 'status'); host.appendChild(panel); }
    panel.textContent = '';
    panel.appendChild(el('h4', null, '경계 만들기 (BO)'));
    panel.appendChild(el('div', 'dim', (T.ids ? `범위: 선택한 객체 ${T.ids.length}개 · ` : '') + '안쪽 점을 누르세요 · Enter 만들기 · Esc 취소 · U 마지막 점 빼기'));
    const ls = layerState();
    if (ls) panel.appendChild(el('div', 'warn', `현재 층 "${ls.name}" 이 ${ls.what}`));
    if (T.picks.length) {
      panel.appendChild(el('div', 'sum', sumText(T.picks)));
      T.picks.forEach((k, i) => {
        const r = k.r, ni = Array.isArray(r.islands) ? r.islands.length : 0;
        panel.appendChild(el('div', 'row', `${i + 1}) 면적 ${nf(r.area)} · 둘레 ${nf(r.perim)}` + (ni ? ` · 섬 ${ni}개 → 순면적 ${nf(r.net)}` : '') + (r.approx ? ' · 근사' : '')));
        if (k.sus > 0) panel.appendChild(el('div', 'warn', `${i + 1}) 안쪽에 틈 의심 ${k.sus}곳 — GEOCHECK(선 끝 점검)로 확인하세요`));
        if (r.bigFrame) panel.appendChild(el('div', 'warn', `${i + 1}) 도면 테두리(도곽)를 경계로 잡았을 수 있음`));
      });
    }
    if (T.fail) {
      const f = el('div', 'fail'); f.appendChild(el('div', null, failText(T.fail)));
      if (T.fail.code === 'open' && geoOK()) {
        const b = el('button', 'tbtn', '선 끝 점검 열기');
        b.onclick = () => { try { endTool(); } catch (_) { } try { startTool('geocheck'); } catch (_) { note('선 끝 점검을 열지 못했습니다'); } };
        f.appendChild(b);
      }
      panel.appendChild(f);
    }
    const btns = el('div', 'btns');
    const bI = el('button', 'tbtn', `섬(I): ${T.islands ? '켬 — 섬도 폴리선으로' : '끔'}`);
    bI.onclick = () => { toggleIslands(); refocus(); };
    const bOk = el('button', 'tbtn primary', '만들기 (Enter)'); bOk.disabled = !T.picks.length;
    bOk.onclick = () => { if (T) T.onEnter(); try { setPrompt(tool ? tool.prompt : '명령:'); } catch (_) { } refocus(); };
    const bX = el('button', 'tbtn', '취소 (Esc)');
    bX.onclick = () => { try { log('*취소*'); endTool(); } catch (_) { } refocus(); };
    btns.append(bI, bOk, bX);
    if (T.picks.length) {
      const bC = el('button', 'tbtn', '순면적 복사');
      bC.onclick = () => { const s = numOnly(stats(T.picks).net); try { navigator.clipboard.writeText(s).then(() => toast('복사: ' + s), () => toast('복사하지 못했습니다')); } catch (_) { toast('복사하지 못했습니다'); } refocus(); };
      btns.appendChild(bC);
    }
    panel.appendChild(btns);
  }
  const refocus = () => { try { cmdIn.focus({ preventScroll: true }); } catch (_) { } };

  /* ---------- 미리보기 그리기 (render 를 한 번만 감쌈) ---------- */
  try {
    const _rBnd = render;
    render = function () {
      _rBnd.apply(this, arguments);
      if (T && tool !== T) { T = null; closePanel(); }
      if (!T) return;
      try {
        const c = ctx2; c.save(); c.setTransform(DPR, 0, 0, DPR, 0, 0);
        const ring = (pts, w, col) => { if (!Array.isArray(pts) || pts.length < 2) return; c.beginPath(); pts.forEach((q, i) => { const s = S({ x: q[0], y: q[1] }); i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); }); c.closePath(); c.lineWidth = w; c.strokeStyle = col; c.stroke(); };
        c.setLineDash([6, 4]);
        T.picks.forEach((k, i) => {
          const r = k.r;
          c.fillStyle = 'rgba(241,194,50,.10)'; c.beginPath(); r.outer.forEach((q, j) => { const s = S({ x: q[0], y: q[1] }); j ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); }); c.closePath(); c.fill();
          ring(r.outer, 2, 'rgba(241,194,50,.95)');
          (r.islands || []).forEach(lp => ring(lp, 1.4, 'rgba(110,200,255,.95)'));
          const s = S(k.p), txt = `${i + 1}) ${nf(fin(+r.net) ? r.net : r.area)}${r.approx ? ' ≈' : ''}`;
          c.setLineDash([]); c.font = '600 12px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)'; c.strokeText(txt, s.x, s.y); c.fillStyle = '#f1c232'; c.fillText(txt, s.x, s.y);
          c.setLineDash([6, 4]);
        });
        if (T.failAt) { const s = S(T.failAt); c.setLineDash([]); c.lineWidth = 2; c.strokeStyle = '#ff5b5b'; c.beginPath(); c.moveTo(s.x - 6, s.y - 6); c.lineTo(s.x + 6, s.y + 6); c.moveTo(s.x + 6, s.y - 6); c.lineTo(s.x - 6, s.y + 6); c.stroke(); }
        c.restore();
      } catch (_) { }
    };
  } catch (_) { }

  function toggleIslands() {
    if (!T) return;
    T.islands = !T.islands;
    // 옵션이 바뀌면 이미 고른 점을 다시 계산
    T.picks = T.picks.map(k => { const r = callAt(k.p); return r.ok ? { p: k.p, r, sus: suspectsOf(r) } : null; }).filter(Boolean);
    say(`경계 만들기: 섬(I) ${T.islands ? '켬 — 가장 바깥 섬도 폴리선으로 만듦' : '끔'}`, 'ok');
    paint(); redraw();
  }

  function makeTool() {
    const ids = selIds();
    const t = {
      name: 'boundary', wantsPoint: false, picks: [], islands: false, ids, fail: null, failAt: null, layerOk: false,
      get prompt() { return `내부 점 지정 또는 [섬(I) ${t.islands ? '켬' : '끔'} / 빼기(U)] — ${t.picks.length ? `경계 ${t.picks.length}개 · Enter 만들기` : 'Enter 끝'}:`; }, set prompt(v) { },
      onInput(s) {
        const u = String(s || '').trim().toUpperCase();
        if (u === 'I') { toggleIslands(); return true; }
        if (u === 'U') { if (t.picks.length) { t.picks.pop(); t.fail = null; t.failAt = null; say('경계 만들기: 마지막 점을 뺐습니다'); } else say('뺄 점이 없습니다', 'err'); paint(); return true; }
        return false;
      },
      onPoint(p) {
        let q = p;
        try { if (p === cursor && rawW && fin(rawW.x)) q = rawW; } catch (_) { } // 클릭은 스냅 전 점, 입력(50,25)은 그대로
        if (!q || !fin(q.x) || !fin(q.y)) return;
        const r = callAt(q);
        if (!r.ok) { t.fail = r; t.failAt = { x: q.x, y: q.y }; say(failText(r), 'err'); paint(); redraw(); return; }
        const kk = loopKey(r.outer), dup = t.picks.find(k => loopKey(k.r.outer) === kk); // 꼭짓점 좌표로 (bound-core 와 같은 방식)
        if (dup) { t.fail = null; t.failAt = null; say('이미 고른 경계입니다', 'err'); paint(); return; }
        const k = { p: { x: q.x, y: q.y }, r, sus: suspectsOf(r) };
        t.picks.push(k); t.fail = null; t.failAt = null;
        const ni = Array.isArray(r.islands) ? r.islands.length : 0;
        say(`경계 ${t.picks.length} · 면적 ${nf(r.area)} · 둘레 ${nf(r.perim)}` + (ni ? ` · 섬 ${ni}개 −${nf(r.islandArea)} → 순면적 ${nf(r.net)}` : '') + ` (${UNIT})` + (r.approx ? ' · 호 포함 — 면적 근사' : ''), 'ok');
        if (k.sus > 0) say(`경고: 안쪽에 틈 의심 ${k.sus}곳 — GEOCHECK(선 끝 점검)로 확인하세요`, 'err');
        if (r.bigFrame) say('경고: 도면 테두리(도곽)를 경계로 잡았을 수 있음', 'err');
        paint(); redraw();
      },
      onEnter() {
        if (!t.picks.length) { endTool(); return; }
        if (!hasCmd()) { note('경계 만들기 명령(bound-core.js)이 아직 없습니다. 새로고침 뒤 다시 해 주세요.'); return; }
        // 모든 점을 지금 옵션으로 다시 확인 — 하나라도 실패면 만들지 않음
        for (let i = 0; i < t.picks.length; i++) {
          const r = callAt(t.picks[i].p);
          if (!r.ok) { t.fail = r; t.failAt = t.picks[i].p; note(`${i + 1}번째 점: ${failText(r)} — 아무것도 만들지 않았습니다 (U 로 빼기)`); paint(); redraw(); return; }
        }
        const ls = layerState();
        if (ls && !t.layerOk) { t.layerOk = true; note(`현재 층 "${ls.name}" 이 ${ls.what} — 그래도 만들려면 Enter, 그만두려면 Esc`); paint(); return; }
        const cmd = { cmd: 'boundary', points: t.picks.map(k => [k.p.x, k.p.y]), islands: !!t.islands };
        if (t.ids) cmd.ids = t.ids.slice();
        const sum = sumText(t.picks);
        let u0 = -1; try { u0 = undoStack.length; } catch (_) { }
        let R = null; try { R = runBatch([cmd], { label: LABEL }); } catch (e) { R = { ok: false, errors: [e && e.message] }; }
        if (!R || !R.ok) {
          try { if (u0 >= 0 && undoStack.length > u0) { doc = JSON.parse(undoStack.pop()); changed(); } } catch (_) { }
          const m = R && R.errors && R.errors[0] ? String(R.errors[0]).replace(/^#\d+ \w+: /, '').slice(0, 160) : '';
          note('경계를 만들지 못했습니다' + (m ? ' — ' + m : '') + ' · 도면은 그대로입니다');
          return;
        }
        const r0 = (R.results && R.results[0]) || {};
        const n = Array.isArray(r0.ids) ? r0.ids.length : t.picks.length;
        say(`경계 만들기: 폴리선 ${n}개 — ${sum} · 되돌리기(Ctrl+Z) 한 번에 원래대로`, 'ok');
        endTool();
      }
    };
    return t;
  }

  /* ---------- 명령 등록 ---------- */
  TOOLS.boundary = () => {
    evt('BOUNDARY');
    if (!B()) note('경계 모듈(bound-core.js)이 아직 없습니다 — 점은 찍을 수 있지만 경계를 찾지 못합니다');
    T = makeTool();
    setTimeout(() => { if (T && tool === T) { paint(); const ls = layerState(); if (ls) note(`현재 층 "${ls.name}" 이 ${ls.what}`); } }, 0);
    return T;
  };
  ALIAS.BO = 'boundary'; ALIAS.BOUNDARY = 'boundary'; // 이 두 키만 덮어씀 (본래 na_boundary 안내)
  if (typeof CMD_KO === 'object' && !CMD_KO.boundary) CMD_KO.boundary = LABEL;
  if (typeof KO_CMD === 'object') for (const [k, v] of Object.entries({ 경계: 'boundary', 경계만들기: 'boundary' })) if (!(k in KO_CMD)) KO_CMD[k] = v;

  snapLab();
  try { if (document.readyState !== 'complete') window.addEventListener('load', snapLab, { once: true }); } catch (_) { }

  window.BOUND_UI = {
    ver: 1,
    state: () => (T && tool === T ? { n: T.picks.length, islands: !!T.islands, fail: T.fail ? T.fail.code : null, ids: T.ids ? T.ids.length : 0, text: T.picks.length ? sumText(T.picks) : '' } : null),
    labKeys: () => { try { return Object.entries(ALIAS).filter(([a, t]) => ALIAS_DEF[a] !== t && isLab(a, t)).map(([a]) => a); } catch (_) { return []; } }
  };
})();
