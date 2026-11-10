/* 선 끝 점검(GEOCHECK) 계산 모듈 — AI 팀 7회차 개발1 (2026-11-10)
   계산만 한다. 화면·명령 이름 등록은 geocheck-ui.js(개발2). 여기서는 COMMANDS.geofix(고치기 명령) 하나만 더한다.
   약속(04 시작회의 결정): window.GEOCHK = { ver:1, defaults, scope(), scan(ents,opt), applyFixes(fixes) }
   찾는 것: 틈(gap, 끝-끝) · 못 미침(under) · 넘침(over) · 각도(angle, 찾기만·기본 꺼짐)
   - free(고칠 수 있는 것): line 의 a·b, 열린 곧은 polyline(e.b 없음 또는 모두 0)의 첫·끝 점. 닫힌 폴리선은 끝이 없음(선분만 상대로 씀)
   - anchor(읽기 전용 상대): 호 끝·원·볼록 폴리선·블록 펼친 사본(flatInsert)·잠긴 층 객체. 안 움직임
   - 무시: 꺼짐/동결 층(hidden), 제외 층(layer). 짧은 선(길이 < 2×tol)은 free 에서 빼고(short) "이미 닿았나" 판단에만 씀
   - 끝점·선분은 격자 해시에 넣어 근처만 비교(모든 쌍 비교 없음). 긴 선분은 지나가는 칸만 등록, 칸이 너무 많으면 따로 목록
   - 고치는 규칙 1~7 = 04 문서. 모든 이동 ≤ tol, 한 끝은 한 번만
   scan 은 도면·undoStack 을 바꾸지 않고 throw 하지 않는다(오류면 issues:[] + error). 사용 기록·log 에 도면 글자를 넣지 않는다. */
(function () {
  'use strict';
  // 본체 전역(let/const/function)은 window 속성이 아닐 수 있어 이름으로 직접 찾는다(tlen-core 와 같은 방식)
  const G = (name) => { try {
    switch (name) {
      case 'doc': return typeof doc !== 'undefined' ? doc : undefined;
      case 'sel': return typeof sel !== 'undefined' ? sel : undefined;
      case 'flatInsert': return typeof flatInsert !== 'undefined' ? flatInsert : undefined;
      case 'COMMANDS': return typeof COMMANDS !== 'undefined' ? COMMANDS : undefined;
    }
  } catch (_) { } return undefined; };
  const now = () => { try { return performance.now(); } catch (_) { return Date.now(); } };

  const DEFAULTS = { tol: 1, angTol: 1, kinds: { gap: true, under: true, over: true, angle: false },
    excludeLayers: '치수|DIM|중심|CENTER|숨은|HIDDEN|해치|HATCH' };
  const TOUCH = 1e-6;      // 이미 닿음
  const EPS = 1e-9;        // 허용값 비교 여유 (d <= tol + EPS)
  const SIN1 = Math.sin(Math.PI / 180); // 방향 차이 1°
  const MAXC = 65536;      // 선분 하나가 고운 칸에 등록될 칸 수 상한(넘으면 성긴 칸)
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const isPt = (p) => p && fin(p.x) && fin(p.y);
  const n360 = (a) => ((a % 360) + 360) % 360;

  // ---------- opt ----------
  function normOpt(o) {
    o = o && typeof o === 'object' ? o : {};
    const pos = (v, d) => { const n = +v; return (v !== null && v !== '' && v !== undefined && isFinite(n) && n > 0) ? n : d; };
    const tol = pos(o.tol, DEFAULTS.tol), angTol = pos(o.angTol, DEFAULTS.angTol);
    const kinds = Object.assign({}, DEFAULTS.kinds);
    if (o.kinds && typeof o.kinds === 'object') for (const k of Object.keys(kinds)) if (k in o.kinds) kinds[k] = !!o.kinds[k];
    // 제외 층: 정규식으로 쓰지 않음(사용자 입력 정규식은 탭을 멈추게 할 수 있음) → '|' 로 나눈 낱말을 대소문자 무시 부분 문자열로 비교
    let ex = ('excludeLayers' in o) ? o.excludeLayers : DEFAULTS.excludeLayers, exList = [];
    try {
      if (ex instanceof RegExp) ex = ex.source;
      if (Array.isArray(ex)) ex = ex.filter(v => typeof v === 'string').join('|');
      if (typeof ex === 'string') exList = ex.split('|').map(v => v.trim().toLowerCase()).filter(Boolean).slice(0, 200);
    } catch (_) { exList = []; }
    let angles = null;
    if (Array.isArray(o.angles)) { const a = o.angles.map(Number).filter(fin).map(v => ((v % 180) + 180) % 180); if (a.length) angles = a; }
    return { tol, angTol, kinds, exList, angles };
  }

  // 볼록 마디 → 호 {c,r,a0,a1} (본체 bulgeArc 와 같은 식: 반시계 a0→a1)
  function bulgeArcOf(A, B, b) {
    const dx = B.x - A.x, dy = B.y - A.y, c = Math.hypot(dx, dy); if (!b || c < 1e-12) return null;
    const th = 4 * Math.atan(Math.abs(b)), r = c / (2 * Math.sin(th / 2)), mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const ux = dx / c, uy = dy / c, d = (c / 2) / Math.tan(th / 2), s = Math.sign(b);
    const cx = mx - uy * d * s, cy = my + ux * d * s;
    const aA = n360(Math.atan2(A.y - cy, A.x - cx) * R2D), aB = n360(Math.atan2(B.y - cy, B.x - cx) * R2D);
    return b > 0 ? { cx, cy, r, a0: aA, a1: aB } : { cx, cy, r, a0: aB, a1: aA };
  }

  // ---------- 격자 해시 ----------
  const hk = (ix, iy) => { let h = Math.imul(ix, 0x9E3779B1) ^ Math.imul(iy, 0x85EBCA77); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); return h ^ (h >>> 12); };
  // 칸 → 머리 번호 (열린 주소 해시, 정수 칸 좌표를 그대로 비교 — Map 보다 빠름)
  function cellHash(want) {
    let cap = 1024; while (cap < want * 2) cap *= 2;
    let mask = cap - 1, KX = new Int32Array(cap), KY = new Int32Array(cap), HD = new Int32Array(cap), US = new Uint8Array(cap), n = 0;
    const grow = () => {
      const oKX = KX, oKY = KY, oHD = HD, oUS = US, oc = cap; cap *= 2; mask = cap - 1;
      KX = new Int32Array(cap); KY = new Int32Array(cap); HD = new Int32Array(cap); US = new Uint8Array(cap);
      for (let i = 0; i < oc; i++) if (oUS[i]) { let h = hk(oKX[i], oKY[i]) & mask; while (US[h]) h = (h + 1) & mask; US[h] = 1; KX[h] = oKX[i]; KY[h] = oKY[i]; HD[h] = oHD[i]; }
    };
    return {
      push(ix, iy, node) { ix |= 0; iy |= 0; let h = hk(ix, iy) & mask;
        while (US[h]) { if (KX[h] === ix && KY[h] === iy) { const o = HD[h]; HD[h] = node; return o; } h = (h + 1) & mask; }
        US[h] = 1; KX[h] = ix; KY[h] = iy; HD[h] = node; if (++n * 2 > cap) grow(); return -1; },
      get(ix, iy) { ix |= 0; iy |= 0; let h = hk(ix, iy) & mask;
        while (US[h]) { if (KX[h] === ix && KY[h] === iy) return HD[h]; h = (h + 1) & mask; } return -1; }
    };
  }

  function emptyResult(tol, t0, err) {
    const r = { issues: [], scanned: 0, skipped: { block: 0, hidden: 0, locked: 0, short: 0, layer: 0, other: 0 }, tol: tol || DEFAULTS.tol, unitSuspect: false, ms: Math.round((now() - t0) * 10) / 10 };
    if (err) r.error = String(err && err.message || err).slice(0, 200);
    return r;
  }

  // ---------- scan ----------
  function scan(ents, opt) {
    const t0 = now(); let O;
    try { O = normOpt(opt); } catch (e) { return emptyResult(DEFAULTS.tol, t0, e); }
    try { return scanCore(ents, O, t0); } catch (e) { return emptyResult(O.tol, t0, e); }
  }

  function scanCore(ents, O, t0) {
    const tol = O.tol, TL = tol + EPS, d0 = G('doc');
    const list = Array.isArray(ents) ? ents : (ents && typeof ents === 'object' && typeof ents[Symbol.iterator] === 'function' ? [...ents] : []);
    const skipped = { block: 0, hidden: 0, locked: 0, short: 0, layer: 0, other: 0 };
    // 층 정보 (doc.layers 로 직접 판단)
    const LM = new Map(); if (d0 && Array.isArray(d0.layers)) for (const l of d0.layers) if (l && !LM.has(l.name)) LM.set(l.name, l);
    const LI = new Map();
    const exHit = (name) => { if (!O.exList.length) return false; const n = name.toLowerCase(); for (const w of O.exList) if (n.indexOf(w) >= 0) return true; return false; };
    const layerInfo = (name) => {
      name = (name == null || name === '') ? '0' : String(name);
      let r = LI.get(name);
      if (!r) { const l = LM.get(name); r = { hidden: !!l && (l.visible === false || !!l.frozen), locked: !!l && !!l.locked, ex: exHit(name) }; LI.set(name, r); }
      return r;
    };

    // 항목(item): 아이디·free 여부·폴리선 점 수
    const IID = [], IFREE = [], IPN = [];
    // 끝점: 좌표·항목·쪽(0/1)·종류(0 free, 1 anchor, 2 닿음 판단만)·free 끝은 이웃 점·마지막 마디 길이·자기 마디 범위
    const EX = [], EY = [], EI = [], ES = [], EK = [], ENX = [], ENY = [], ELS = [], EAL = [], EAH = [];
    // 선분: 끝·항목·마디 번호·종류
    const SAX = [], SAY = [], SBX = [], SBY = [], SI = [], SP = [], SK = [];
    // 곡선(닿음 판단만): 원·호·볼록 마디
    const CX = [], CY = [], CR = [], CA0 = [], CA1 = [], CF = [];
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const bb = (x, y) => { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; };

    const newItem = (id, free, pn) => { IID.push(id); IFREE.push(free); IPN.push(pn); return IID.length - 1; };
    const addEnd = (x, y, it, side, kind, nx, ny, ls, al, ah) => { EX.push(x); EY.push(y); EI.push(it); ES.push(side); EK.push(kind); ENX.push(nx); ENY.push(ny); ELS.push(ls); EAL.push(al); EAH.push(ah); bb(x, y); };
    const addSeg = (a, b, it, i, kind) => { SAX.push(a.x); SAY.push(a.y); SBX.push(b.x); SBY.push(b.y); SI.push(it); SP.push(i); SK.push(kind); bb(a.x, a.y); bb(b.x, b.y); };
    const addCurve = (cx, cy, r, a0, a1, full) => { CX.push(cx); CY.push(cy); CR.push(Math.abs(r)); CA0.push(a0); CA1.push(a1); CF.push(full); bb(cx - r, cy - r); bb(cx + r, cy + r); };

    // 읽기 전용 상대 넣기 (kind 1 = anchor). 돌려줌: 넣었으면 true
    function addAnchor(e, rid) {
      const t = e && e.type;
      if (t === 'line') {
        if (!isPt(e.a) || !isPt(e.b)) return false;
        const it = newItem(rid, false, 0); addSeg(e.a, e.b, it, -1, 1);
        addEnd(e.a.x, e.a.y, it, 0, 1, 0, 0, 0, 0, 0); addEnd(e.b.x, e.b.y, it, 1, 1, 0, 0, 0, 0, 0); return true;
      }
      if (t === 'polyline') {
        const p = e.pts; if (!Array.isArray(p) || p.length < 2 || !p.every(isPt)) return false;
        const n = p.length, m = e.closed ? n : n - 1, it = newItem(rid, false, n), bl = Array.isArray(e.b) ? e.b : null;
        for (let i = 0; i < m; i++) {
          const A = p[i], B = p[(i + 1) % n], bg = bl ? +bl[i] || 0 : 0;
          if (bg) { const a = bulgeArcOf(A, B, bg); if (a) addCurve(a.cx, a.cy, a.r, a.a0, a.a1, false); else addSeg(A, B, it, i, 1); }
          else addSeg(A, B, it, i, 1);
        }
        if (!e.closed) { addEnd(p[0].x, p[0].y, it, 0, 1, 0, 0, 0, 0, 0); addEnd(p[n - 1].x, p[n - 1].y, it, 1, 1, 0, 0, 0, 0, 0); }
        return true;
      }
      if (t === 'arc') {
        if (!isPt(e.c) || !fin(e.r) || !fin(e.a0) || !fin(e.a1)) return false;
        const r = Math.abs(e.r), it = newItem(rid, false, 0);
        addCurve(e.c.x, e.c.y, r, e.a0, e.a1, false);
        addEnd(e.c.x + r * Math.cos(e.a0 * D2R), e.c.y + r * Math.sin(e.a0 * D2R), it, 0, 1, 0, 0, 0, 0, 0);
        addEnd(e.c.x + r * Math.cos(e.a1 * D2R), e.c.y + r * Math.sin(e.a1 * D2R), it, 1, 1, 0, 0, 0, 0, 0);
        return true;
      }
      if (t === 'circle') {
        if (!isPt(e.c) || !fin(e.r)) return false;
        addCurve(e.c.x, e.c.y, e.r, 0, 360, true); return true;
      }
      if (t === 'ellipse') { // 타원 호의 두 끝만 (본체 ellPt·ellSpan 과 같은 식). 닫힌 타원은 끝 없음
        if (!isPt(e.c) || !fin(e.rx) || !fin(e.ry) || e.a0 == null || !fin(+e.a0) || !fin(+e.a1)) return false;
        const a0 = +e.a0, sp = n360(+e.a1 - a0); if (!sp) return false;
        const rr = (+e.rot || 0) * D2R, P = (t2) => { const x = e.rx * Math.cos(t2 * D2R), y = e.ry * Math.sin(t2 * D2R); return { x: e.c.x + x * Math.cos(rr) - y * Math.sin(rr), y: e.c.y + x * Math.sin(rr) + y * Math.cos(rr) }; };
        const A = P(a0), B = P(a0 + sp), it = newItem(rid, false, 0);
        addEnd(A.x, A.y, it, 0, 1, 0, 0, 0, 0, 0); addEnd(B.x, B.y, it, 1, 1, 0, 0, 0, 0, 0); return true;
      }
      if (t === 'spline') { // 맞춤점 스플라인은 첫·끝 맞춤점을 지남(본체 splineBez). 닫힌 것은 끝 없음
        const p = e.pts; if (!Array.isArray(p) || p.length < 2 || !isPt(p[0]) || !isPt(p[p.length - 1])) return false;
        if (e.closed && p.length > 2) return false;
        const it = newItem(rid, false, 0), q = p[p.length - 1];
        addEnd(p[0].x, p[0].y, it, 0, 1, 0, 0, 0, 0, 0); addEnd(q.x, q.y, it, 1, 1, 0, 0, 0, 0, 0); return true;
      }
      return false;
    }
    const straightPoly = (e) => e.type === 'polyline' && !(Array.isArray(e.b) && e.b.some(v => +v));

    // free 로 넣기. kind 0 = free, 2 = 짧은 선(닿음 판단만)
    function addFree(e, kind) {
      if (e.type === 'line') {
        const it = newItem(e.id, kind === 0, 0), L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
        addSeg(e.a, e.b, it, -1, kind);
        addEnd(e.a.x, e.a.y, it, 0, kind, e.b.x, e.b.y, L, 0, 0); addEnd(e.b.x, e.b.y, it, 1, kind, e.a.x, e.a.y, L, 0, 0);
        return;
      }
      const p = e.pts, n = p.length, m = e.closed ? n : n - 1, it = newItem(e.id, kind === 0, n);
      for (let i = 0; i < m; i++) addSeg(p[i], p[(i + 1) % n], it, i, kind);
      if (e.closed) return;
      // 첫 끝: 앞으로 가며 처음 다른 점 = 이웃, 그때까지 마디 0..k0 는 자기 마디
      let k0 = 0; while (k0 < n - 1 && Math.hypot(p[k0 + 1].x - p[0].x, p[k0 + 1].y - p[0].y) < 1e-12) k0++;
      let k1 = n - 1; while (k1 > 0 && Math.hypot(p[k1 - 1].x - p[n - 1].x, p[k1 - 1].y - p[n - 1].y) < 1e-12) k1--;
      const N0 = p[Math.min(k0 + 1, n - 1)], N1 = p[Math.max(k1 - 1, 0)];
      addEnd(p[0].x, p[0].y, it, 0, kind, N0.x, N0.y, Math.hypot(N0.x - p[0].x, N0.y - p[0].y), 0, k0);
      addEnd(p[n - 1].x, p[n - 1].y, it, 1, kind, N1.x, N1.y, Math.hypot(N1.x - p[n - 1].x, N1.y - p[n - 1].y), k1 - 1, n - 2);
    }

    // ---- 1) 나누기 ----
    let scanned = 0;
    const flat = G('flatInsert'), flatFn = typeof flat === 'function' ? flat : null;
    for (const e of list) {
      if (!e || typeof e !== 'object') { skipped.other++; continue; }
      const LIe = layerInfo(e.layer);
      if (LIe.hidden) { skipped.hidden++; continue; }
      if (LIe.ex) { skipped.layer++; continue; }
      const t = e.type;
      if (t === 'insert') {
        skipped.block++;
        if (!flatFn) continue;
        try {
          const fl = flatFn(e);
          if (Array.isArray(fl)) for (const f of fl) {
            if (!f || f.type === 'insert') continue;
            const fli = layerInfo(f.layer); if (fli.hidden || fli.ex) continue;
            addAnchor(f, e.id);
          }
        } catch (_) { /* 펼치기 실패 → 건너뜀 */ }
        continue;
      }
      if (LIe.locked) { skipped.locked++; addAnchor(e, e.id); continue; }
      if (t === 'line' || straightPoly(e)) {
        let ok, L = 0;
        if (t === 'line') { ok = isPt(e.a) && isPt(e.b); if (ok) L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y); }
        else {
          const p = e.pts; ok = Array.isArray(p) && p.length >= 2 && p.every(isPt);
          if (ok) { const n = p.length, m = e.closed ? n : n - 1; for (let i = 0; i < m; i++) { const A = p[i], B = p[(i + 1) % n]; L += Math.hypot(B.x - A.x, B.y - A.y); } }
        }
        if (!ok) { skipped.other++; continue; }
        if (e.id == null) { skipped.other++; addAnchor(e, e.id); continue; }
        if (L < 2 * tol) { skipped.short++; addFree(e, 2); continue; }
        scanned++; addFree(e, 0); continue;
      }
      // 호·원·볼록 폴리선 = anchor, 그 밖 = 안 봄
      skipped.other++;
      if (t === 'arc' || t === 'circle' || t === 'polyline' || t === 'ellipse' || t === 'spline') addAnchor(e, e.id);
    }

    const nE = EX.length, nS = SAX.length, nC = CX.length;
    const unitSuspect = isFinite(bx0) && Math.max(bx1 - bx0, by1 - by0) < 50 && scanned > 0;
    const issues = [];

    // ---- 2) 끝점 격자 (칸 = 2×tol → 반경 tol 찾기는 칸 2×2 까지) ----
    const cs = Math.max(2 * tol, 1e-6);
    const PH = cellHash(nE), PN = new Int32Array(nE);
    for (let i = 0; i < nE; i++) PN[i] = PH.push(Math.floor(EX[i] / cs), Math.floor(EY[i] / cs), i);
    const ptQuery = (x, y, r, cb) => {
      const ix0 = Math.floor((x - r) / cs), ix1 = Math.floor((x + r) / cs), iy0 = Math.floor((y - r) / cs), iy1 = Math.floor((y + r) / cs);
      for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) {
        let j = PH.get(ix, iy); while (j >= 0) { if (cb(j) === true) return true; j = PN[j]; }
      }
      return false;
    };

    // ---- 3) 선분·곡선 격자: 고운 칸(선분 길이 중앙값 정도) + 아주 긴 것은 성긴 칸 ----
    let cs2 = cs;
    if (nS) {
      const step = Math.max(1, Math.floor(nS / 2001)), smp = [];
      for (let s = 0; s < nS; s += step) smp.push(Math.hypot(SBX[s] - SAX[s], SBY[s] - SAY[s]));
      smp.sort((a, b) => a - b); const med = smp[smp.length >> 1] || 0;
      cs2 = Math.max(cs, med);
    }
    const ext = isFinite(bx0) ? Math.max(bx1 - bx0, by1 - by0) : 0;
    const cs3 = Math.max(cs2 * 4, ext / 1024);
    let NI = new Int32Array(1 << 16), NN = new Int32Array(1 << 16), nN = 0;
    const GF = { cs: cs2, H: cellHash(nS + nC) }, GC = { cs: cs3, H: cellHash(64) }; let usedC = false;
    const reg = (g, code, ix, iy) => {
      if (nN === NI.length) { const a = new Int32Array(nN * 2); a.set(NI); NI = a; const b2 = new Int32Array(nN * 2); b2.set(NN); NN = b2; }
      NI[nN] = code; NN[nN] = g.H.push(ix, iy, nN); nN++;
    };
    const R = TL;
    const regBox = (g, code, x0, y0, x1, y1) => { const c = g.cs, ix0 = Math.floor(x0 / c), ix1 = Math.floor(x1 / c), iy0 = Math.floor(y0 / c), iy1 = Math.floor(y1 / c);
      for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) reg(g, code, ix, iy); };
    const regSeg = (g, s) => {
      const c = g.cs, ax = SAX[s], ay = SAY[s], bx = SBX[s], by = SBY[s], dx = bx - ax, dy = by - ay;
      const ix0 = Math.floor((Math.min(ax, bx) - R) / c), ix1 = Math.floor((Math.max(ax, bx) + R) / c);
      // 칸 기둥마다 선분이 지나는 y 범위만
      for (let ix = ix0; ix <= ix1; ix++) {
        let ta = 0, tb = 1;
        if (Math.abs(dx) > 1e-12) { ta = (ix * c - R - ax) / dx; tb = ((ix + 1) * c + R - ax) / dx; if (ta > tb) { const q = ta; ta = tb; tb = q; } }
        if (ta < 0) ta = 0; if (tb > 1) tb = 1; if (ta > tb) continue;
        const ya = ay + dy * ta, yb = ay + dy * tb;
        const iy0 = Math.floor(((ya < yb ? ya : yb) - R) / c), iy1 = Math.floor(((ya < yb ? yb : ya) + R) / c);
        for (let iy = iy0; iy <= iy1; iy++) reg(g, s, ix, iy);
      }
    };
    for (let s = 0; s < nS; s++) {
      const ax = SAX[s], ay = SAY[s], bx = SBX[s], by = SBY[s];
      const x0 = Math.min(ax, bx) - R, x1 = Math.max(ax, bx) + R, y0 = Math.min(ay, by) - R, y1 = Math.max(ay, by) + R;
      const cols = Math.floor(x1 / cs2) - Math.floor(x0 / cs2) + 1, rows = Math.floor(y1 / cs2) - Math.floor(y0 / cs2) + 1;
      if (cols * rows <= 16) { regBox(GF, s, x0, y0, x1, y1); continue; }
      if (2 * (cols + rows) + 8 <= MAXC) regSeg(GF, s); else { regSeg(GC, s); usedC = true; }
    }
    for (let c = 0; c < nC; c++) {
      const r = CR[c] + R, x0 = CX[c] - r, x1 = CX[c] + r, y0 = CY[c] - r, y1 = CY[c] + r;
      const n2 = (Math.floor(x1 / cs2) - Math.floor(x0 / cs2) + 1) * (Math.floor(y1 / cs2) - Math.floor(y0 / cs2) + 1);
      if (n2 <= MAXC) regBox(GF, nS + c, x0, y0, x1, y1);
      else { regBox(GC, nS + c, x0, y0, x1, y1); usedC = true; }
    }
    const stamp = new Int32Array(nS + nC); let qid = 0;
    const segQuery = (x, y, r, cb) => {
      qid++;
      for (let gi = 0; gi < 2; gi++) {
        const g = gi ? GC : GF; if (gi && !usedC) break;
        const c = g.cs, H = g.H, ix0 = Math.floor((x - r) / c), ix1 = Math.floor((x + r) / c), iy0 = Math.floor((y - r) / c), iy1 = Math.floor((y + r) / c);
        for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) {
          let j = H.get(ix, iy);
          while (j >= 0) { const k = NI[j]; if (stamp[k] !== qid) { stamp[k] = qid; if (cb(k) === true) return true; } j = NN[j]; }
        }
      }
      return false;
    };
    // 점-선분 거리와 투영 t
    let _t = 0;
    const segD = (x, y, s) => {
      const ax = SAX[s], ay = SAY[s], dx = SBX[s] - ax, dy = SBY[s] - ay, L2 = dx * dx + dy * dy;
      let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; _t = t; if (t < 0) t = 0; else if (t > 1) t = 1;
      return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    };
    const curveD = (x, y, c) => {
      const vx = x - CX[c], vy = y - CY[c], r = CR[c], dd = Math.hypot(vx, vy);
      if (CF[c]) return Math.abs(dd - r);
      const a = n360(Math.atan2(vy, vx) * R2D), span = n360(CA1[c] - CA0[c]) || 360;
      if (n360(a - CA0[c]) <= span + 1e-9) return Math.abs(dd - r);
      const p0x = CX[c] + r * Math.cos(CA0[c] * D2R), p0y = CY[c] + r * Math.sin(CA0[c] * D2R);
      const p1x = CX[c] + r * Math.cos(CA1[c] * D2R), p1y = CY[c] + r * Math.sin(CA1[c] * D2R);
      return Math.min(Math.hypot(x - p0x, y - p0y), Math.hypot(x - p1x, y - p1y));
    };

    // ---- 4) 열린 free 끝 (규칙 1: 1e-6 안으로 닿은 끝은 정상) — 자주 도는 곳이라 콜백 없이 풂 ----
    const open = new Uint8Array(nE), T2 = TOUCH * TOUCH;
    const freeEnds = [];
    for (let i = 0; i < nE; i++) {
      if (EK[i] !== 0) continue;
      const x = EX[i], y = EY[i], it = EI[i];
      let touched = false;
      const ix0 = Math.floor((x - TOUCH) / cs), ix1 = Math.floor((x + TOUCH) / cs), iy0 = Math.floor((y - TOUCH) / cs), iy1 = Math.floor((y + TOUCH) / cs);
      pe: for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) {
        for (let j = PH.get(ix, iy); j >= 0; j = PN[j]) { if (j === i) continue; const dx = EX[j] - x, dy = EY[j] - y; if (dx * dx + dy * dy <= T2) { touched = true; break pe; } }
      }
      if (!touched) {
        const isLine = IPN[it] === 0, al = EAL[i], ah = EAH[i];
        qid++;
        ps: for (let gi = 0; gi < 2; gi++) {
          const g = gi ? GC : GF; if (gi && !usedC) break;
          const c = g.cs, H = g.H, jx0 = Math.floor((x - TOUCH) / c), jx1 = Math.floor((x + TOUCH) / c), jy0 = Math.floor((y - TOUCH) / c), jy1 = Math.floor((y + TOUCH) / c);
          for (let ix = jx0; ix <= jx1; ix++) for (let iy = jy0; iy <= jy1; iy++) {
            for (let j = H.get(ix, iy); j >= 0; j = NN[j]) {
              const k = NI[j]; if (stamp[k] === qid) continue; stamp[k] = qid;
              if (k >= nS) { if (curveD(x, y, k - nS) <= TOUCH) { touched = true; break ps; } continue; }
              if (SI[k] === it && (isLine || (SP[k] >= al && SP[k] <= ah))) continue;
              if (segD(x, y, k) <= TOUCH) { touched = true; break ps; }
            }
          }
        }
      }
      if (!touched) { open[i] = 1; freeEnds.push(i); }
    }

    const fixed = new Uint8Array(nE);
    const pushIssue = (k, idList, at, d, fix) => { issues.push({ k, ids: [...new Set(idList)], at: { x: at.x, y: at.y }, d, fix }); };
    const fixOf = (i, x, y) => ({ id: IID[EI[i]], end: ES[i], to: { x, y }, from: { x: EX[i], y: EY[i] } });
    const mkFix = (members, tx, ty) => { const f = []; for (const i of members) { if (Math.hypot(EX[i] - tx, EY[i] - ty) > 1e-12) f.push(fixOf(i, tx, ty)); fixed[i] = 1; } return f; };

    // ---- 5) 틈 (규칙 1~4) ----
    if (O.kinds.gap && freeEnds.length) {
      const par = new Int32Array(nE); for (const i of freeEnds) par[i] = i;
      const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      const edges = [];
      const sameBad = (i, j) => EI[i] === EI[j] && IPN[EI[i]] < 3; // 같은 선(또는 2점 폴리선)의 두 끝은 묶지 않음
      const near = new Uint8Array(nE), TL2 = TL * TL; // near: 다른 열린 free 끝이나 anchor 끝이 tol 안에 있음
      for (const i of freeEnds) {
        const x = EX[i], y = EY[i];
        const ix0 = Math.floor((x - TL) / cs), ix1 = Math.floor((x + TL) / cs), iy0 = Math.floor((y - TL) / cs), iy1 = Math.floor((y + TL) / cs);
        for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) {
          for (let j = PH.get(ix, iy); j >= 0; j = PN[j]) {
            if (j === i) continue;
            const ek = EK[j]; if (ek === 2 || (ek === 0 && !open[j])) continue;
            const dx = EX[j] - x, dy = EY[j] - y; if (dx * dx + dy * dy > TL2) continue;
            if (ek === 1) { near[i] = 1; continue; }
            if (j < i || sameBad(i, j)) continue;
            near[i] = 1; near[j] = 1;
            edges.push([i, j, Math.hypot(dx, dy)]); const a = find(i), b = find(j); if (a !== b) par[a] = b;
          }
        }
      }
      const groups = new Map();
      for (const i of freeEnds) { if (!near[i]) continue; const r = find(i); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(i); }
      const edgeOf = new Map(); // 무리 → 간선
      if (edges.length) for (const e of edges) { const r = find(e[0]); let a = edgeOf.get(r); if (!a) edgeOf.set(r, a = []); a.push(e); }

      // 두 끝 (규칙 3)
      const pair = (i, j) => {
        const e1x = EX[i], e1y = EY[i], e2x = EX[j], e2y = EY[j];
        const v1x = e1x - ENX[i], v1y = e1y - ENY[i], v2x = e2x - ENX[j], v2y = e2y - ENY[j];
        const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y), cr = v1x * v2y - v1y * v2x;
        let tx = (e1x + e2x) / 2, ty = (e1y + e2y) / 2;
        if (l1 > 1e-12 && l2 > 1e-12 && Math.abs(cr) / (l1 * l2) > SIN1) {
          const t = ((e2x - e1x) * v2y - (e2y - e1y) * v2x) / cr, X = e1x + v1x * t, Y = e1y + v1y * t;
          if (Math.hypot(X - e1x, Y - e1y) <= TL && Math.hypot(X - e2x, Y - e2y) <= TL) { tx = X; ty = Y; }
        }
        pushIssue('gap', [IID[EI[i]], IID[EI[j]]], { x: (e1x + e2x) / 2, y: (e1y + e2y) / 2 }, Math.hypot(e2x - e1x, e2y - e1y), mkFix([i, j], tx, ty));
      };
      // anchor 끝 (규칙 2)
      const tryAnchor = (g) => {
        const cand = new Set();
        for (const i of g) ptQuery(EX[i], EY[i], TL, j => { if (EK[j] === 1 && Math.hypot(EX[j] - EX[i], EY[j] - EY[i]) <= TL) cand.add(j); });
        if (!cand.size) return false;
        let gx = 0, gy = 0; for (const i of g) { gx += EX[i]; gy += EY[i]; } gx /= g.length; gy /= g.length;
        let best = -1, bd = Infinity, bmax = 0;
        for (const a of cand) {
          let mx = 0; for (const i of g) mx = Math.max(mx, Math.hypot(EX[i] - EX[a], EY[i] - EY[a]));
          if (mx > TL) continue;
          const dc = Math.hypot(gx - EX[a], gy - EY[a]);
          if (dc < bd) { bd = dc; best = a; bmax = mx; }
        }
        if (best < 0) return false;
        let ax = EX[best], ay = EY[best], sx = ax, sy = ay; for (const i of g) { sx += EX[i]; sy += EY[i]; }
        pushIssue('gap', g.map(i => IID[EI[i]]).concat([IID[EI[best]]]), { x: sx / (g.length + 1), y: sy / (g.length + 1) }, bmax, mkFix(g, ax, ay));
        return true;
      };
      for (const [r, g] of groups) {
        if (tryAnchor(g)) continue;
        if (g.length === 1) continue;           // → 규칙 5
        if (g.length === 2) { pair(g[0], g[1]); continue; }
        // 셋 이상 (규칙 4): 무게중심, 단 이동 ≤ tol 이고 같은 선 두 끝이 없을 때
        let gx = 0, gy = 0; for (const i of g) { gx += EX[i]; gy += EY[i]; } gx /= g.length; gy /= g.length;
        let ok = true; const seen = new Set();
        for (const i of g) { if (Math.hypot(EX[i] - gx, EY[i] - gy) > TL) { ok = false; break; } if (IPN[EI[i]] < 3) { if (seen.has(EI[i])) { ok = false; break; } seen.add(EI[i]); } }
        if (ok) {
          let mx = 0; for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length && b < a + 64; b++) mx = Math.max(mx, Math.hypot(EX[g[a]] - EX[g[b]], EY[g[a]] - EY[g[b]]));
          pushIssue('gap', g.map(i => IID[EI[i]]), { x: gx, y: gy }, mx, mkFix(g, gx, gy)); continue;
        }
        // 안 되면 가까운 쌍부터 둘씩
        const es = (edgeOf.get(r) || []).slice().sort((a, b) => a[2] - b[2]);
        for (const [i, j] of es) if (!fixed[i] && !fixed[j]) pair(i, j);
      }
    }

    // ---- 6) 못 미침·넘침 (규칙 5) ----
    if ((O.kinds.under || O.kinds.over) && freeEnds.length) {
      for (const i of freeEnds) {
        if (fixed[i]) continue;
        const x = EX[i], y = EY[i], it = EI[i];
        let vx = x - ENX[i], vy = y - ENY[i]; const vl = Math.hypot(vx, vy); if (vl < 1e-12) continue; vx /= vl; vy /= vl;
        const ls = ELS[i];
        let best = null;
        segQuery(x, y, TL, c => {
          if (c >= nS || SK[c] === 2 || SI[c] === it) return;
          const d = segD(x, y, c); if (d > TL || _t < -1e-9 || _t > 1 + 1e-9) return;
          const ax = SAX[c], ay = SAY[c], abx = SBX[c] - ax, aby = SBY[c] - ay, abl = Math.hypot(abx, aby); if (abl < 1e-12) return;
          const den = vx * aby - vy * abx; if (Math.abs(den) < 1e-9 * abl) return;
          const qx = ax - x, qy = ay - y, k = (qx * aby - qy * abx) / den, u = (qx * vy - qy * vx) / den;
          if (u < -1e-9 || u > 1 + 1e-9) return;
          const m = Math.abs(k); if (m > TL || m <= TOUCH) return;
          if (k < 0 && -k >= ls - 1e-9) return;
          const kind = k > 0 ? 'under' : 'over'; if (!O.kinds[kind]) return;
          if (!best || m < best.m) best = { m, k: kind, c, X: x + vx * k, Y: y + vy * k };
        });
        if (best) pushIssue(best.k, [IID[it], IID[SI[best.c]]], { x: best.X, y: best.Y }, best.m, mkFix([i], best.X, best.Y));
      }
    }

    // ---- 7) 각도 (찾기만) ----
    if (O.kinds.angle) {
      const angs = O.angles || [0, 45, 90, 135], at = O.angTol + EPS;
      for (let s = 0; s < nS; s++) {
        if (SK[s] !== 0) continue;
        const dx = SBX[s] - SAX[s], dy = SBY[s] - SAY[s]; if (Math.hypot(dx, dy) < 1e-12) continue;
        const a = ((Math.atan2(dy, dx) * R2D) % 180 + 180) % 180;
        let dv = Infinity; for (const g of angs) { let q = Math.abs(a - g) % 180; if (q > 90) q = 180 - q; if (q < dv) dv = q; }
        if (dv > 1e-9 && dv <= at) issues.push({ k: 'angle', ids: [IID[SI[s]]], at: { x: SAX[s] + dx / 2, y: SAY[s] + dy / 2 }, d: dv, fix: [] });
      }
    }

    return { issues, scanned, skipped, tol, unitSuspect, ms: Math.round((now() - t0) * 10) / 10 };
  }

  // ---------- 고치기 ----------
  let MAPC = null; // runBatch 한 번(동기 실행) 안에서만 쓰는 id→객체 지도
  function entMap(d) {
    if (MAPC && MAPC.arr === d.entities && MAPC.len === d.entities.length && MAPC.layers === d.layers) return MAPC;
    const map = new Map(); for (const e of d.entities) if (e && e.id != null && !map.has(e.id)) map.set(e.id, e);
    const bad = new Set(); if (Array.isArray(d.layers)) for (const l of d.layers) if (l && (l.locked || l.visible === false || l.frozen)) bad.add(l.name);
    MAPC = { arr: d.entities, len: d.entities.length, layers: d.layers, map, bad };
    try { Promise.resolve().then(() => { MAPC = null; }); } catch (_) { MAPC = null; }
    return MAPC;
  }
  function applyFixes(fixes) {
    const out = { moved: 0, ids: [], skipped: 0 };
    try {
      const d = G('doc'); if (!d || !Array.isArray(d.entities)) return out;
      const arr = Array.isArray(fixes) ? fixes : (fixes && typeof fixes === 'object' ? [fixes] : []);
      if (!arr.length) return out;
      const C = entMap(d), done = new Set(), idSet = new Set();
      const one = (f) => {
          if (!f || typeof f !== 'object') return false;
          const e = C.map.get(f.id); if (!e || e.id !== f.id) return false;
          const end = (f.end === 0 || f.end === '0') ? 0 : (f.end === 1 || f.end === '1') ? 1 : -1; if (end < 0) return false;
          const to = Array.isArray(f.to) ? { x: +f.to[0], y: +f.to[1] } : (f.to && { x: +f.to.x, y: +f.to.y });
          if (!to || !fin(to.x) || !fin(to.y)) return false;
          if (C.bad.has((e.layer == null || e.layer === '') ? '0' : e.layer)) return false;   // 잠김·꺼짐·동결 층
          const key = String(f.id) + '|' + end; if (done.has(key)) return false;
          // 검사 뒤 그 끝이 옮겨졌으면(from 에서 1e-6 넘게) 건너뜀 — 낡은 고치기로 끝이 멀리 날아가지 않게
          const fr = Array.isArray(f.from) ? { x: +f.from[0], y: +f.from[1] } : (f.from && typeof f.from === 'object' ? { x: +f.from.x, y: +f.from.y } : null);
          const cur = e.type === 'line' ? (end === 0 ? e.a : e.b) : (e.type === 'polyline' && Array.isArray(e.pts) && e.pts.length ? (end === 0 ? e.pts[0] : e.pts[e.pts.length - 1]) : null);
          if (fr && (!fin(fr.x) || !fin(fr.y) || !isPt(cur) || Math.hypot(cur.x - fr.x, cur.y - fr.y) > 1e-6)) return false;
          if (e.type === 'line') {
            if (!isPt(e.a) || !isPt(e.b)) return false;
            done.add(key);
            if (end === 0) e.a = Object.assign({}, e.a, to); else e.b = Object.assign({}, e.b, to);
          } else if (e.type === 'polyline') {
            const p = e.pts;
            if (e.closed || !Array.isArray(p) || p.length < 2 || (Array.isArray(e.b) && e.b.some(v => +v))) return false; // anchor 는 안 바꿈
            done.add(key);
            const k = end === 0 ? 0 : p.length - 1; p[k] = Object.assign({}, p[k], to);
          } else return false;
          out.moved++; if (!idSet.has(e.id)) { idSet.add(e.id); out.ids.push(e.id); }
          return true;
      };
      for (const f of arr) { let ok = false; try { ok = one(f); } catch (_) { ok = false; } if (!ok) out.skipped++; }
    } catch (_) { }
    return out;
  }

  function scope() {
    try {
      const d = G('doc'); if (!d || !Array.isArray(d.entities)) return [];
      const s = G('sel'); let has = null;
      if (s instanceof Set && s.size) has = (id) => s.has(id);
      else if (Array.isArray(s) && s.length) { const ss = new Set(s); has = (id) => ss.has(id); }
      if (has) return d.entities.filter(e => e && has(e.id));
      return d.entities.slice();
    } catch (_) { return []; }
  }

  window.GEOCHK = { ver: 1, defaults: JSON.parse(JSON.stringify(DEFAULTS)), scope, scan, applyFixes };

  // AI·runBatch 명령: {cmd:'geofix', fixes:[...]} (fix 한 건 {cmd:'geofix', id, end, to} 도 받음)
  try {
    const CM = G('COMMANDS');
    if (CM && typeof CM === 'object') {
      CM.geofix = function (c) {
        const list = c && Array.isArray(c.fixes) ? c.fixes : (c && c.id != null && c.to ? [c] : []);
        const r = applyFixes(list);
        return { ids: r.ids, moved: r.moved, skipped: r.skipped };
      };
    }
  } catch (_) { }
})();
