/* 방 이름·면적 라벨(ROOMTAG) 계산 모듈 — AI 팀 12회차 개발1 (2026-11-10)
   계산만 한다. 화면·명령 이름 등록은 roomtag-ui.js(개발2). 여기서는 COMMANDS.roomtag 하나만 더한다.
   약속(r12/04 결정):
     window.ROOMTAG = { ver:1, defaults, label(r,opt), nextName(prev), key(r) }  (+ 덧붙인 도우미: tagged(r,layer), fmt(mm2,opt))
     COMMANDS.roomtag = c{rooms:[{pick:[x,y], name, key?}], unit?, dec?, islands?, h?, layer?} -> {ids, n, total}
   방식
   - 경계 = 8회차 window.BOUND.at(p) 결과 그대로(고치지 않음, 읽기만). 면적 = islands ? net : area (mm²).
   - 반올림 = mm² 를 먼저 정수로 → 10^(6-dec) 로 나눠 Math.round → 문자열은 정수 자리로 조립(toFixed 단독 금지: 11.745→11.75).
   - 근사(곡선 벽, r.approx) 면 '≈' 를 붙임. 고정 글자(필드 아님).
   - 자리: 무게중심 → 안쪽 격자점(경계·섬에서 먼 순) → 클릭 점. 두 줄 글자 상자(본체 textW, 가운데 맞춤,
     기준선~기준선+높이)가 경계 안·섬 밖·어느 변과도 안 겹치는 첫 자리. 없으면 가장 먼 점 + fits:false.
   - 도곽: frameWhy() — 고리 안 열린 벽 사슬 / 안쪽 닫힌 사슬·최상위 닫힌 섬이 2 m² 이상 / 섬 넓이 합 30% 이상이면 'frame' 거절(bigBox 안 씀).
     거절 결과에도 area·text·loop 를 담음(UI 가 Y 전에 보여 줌). opt.frameOk / c.frameOk / room.frameOk 가 true 면 통과.
   - COMMANDS: 같은 경계·이미 라벨 있는 방(tagged)은 skipped 로 빼고 번호를 먹지 않음.
   - label() 은 doc·undoStack 를 건드리지 않고 throw 하지 않는다. log·사용 기록을 남기지 않는다(도면 글자 금지). */
(function () {
  'use strict';
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const SKIP = new Set(['dim', 'text', 'hatch', 'xline', 'attdef', 'point', 'mtext', 'ray']);
  const PAD = 0.1;            // 글자 상자 여유(× 이름 높이)
  const NAME_UP = 0.25, AREA_DN = 1.05; // 기준선 위치(× h): 이름 at.y+0.25h, 면적 at.y−1.05h
  const GRID = 48;            // 안쪽 격자 한 변 칸 수(최대)
  const MAXNAME = 100;
  const defaults = { name: '방 1', unit: 'm2', dec: 2, islands: false, h: 250, ah: 0.7, layer: '방이름' };

  const P = (q) => Array.isArray(q) ? { x: +q[0], y: +q[1] } : { x: +q.x, y: +q.y };
  const areaS = (lp) => { let A = 0; for (let i = 0; i < lp.length; i++) { const a = lp[i], b = lp[(i + 1) % lp.length]; A += a.x * b.y - b.x * a.y; } return A / 2; };
  function inP(p, poly) {
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-12) + a.x)) ins = !ins; }
    return ins;
  }
  function centroid(lp) {
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < lp.length; i++) { const a = lp[i], b = lp[(i + 1) % lp.length], k = a.x * b.y - b.x * a.y; A += k; cx += (a.x + b.x) * k; cy += (a.y + b.y) * k; }
    if (Math.abs(A) < 1e-12) { let x = 0, y = 0; for (const q of lp) { x += q.x; y += q.y; } return { x: x / lp.length, y: y / lp.length }; }
    return { x: cx / (3 * A), y: cy / (3 * A) };
  }
  const segD = (q, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let t = L > 0 ? ((q.x - a.x) * dx + (q.y - a.y) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y); };
  /* 선분이 닫힌 상자 [x0,y0,x1,y1] 와 겹치나 (Liang–Barsky) */
  function segHitsBox(a, b, R) {
    let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
    const pq = [[-dx, a.x - R[0]], [dx, R[2] - a.x], [-dy, a.y - R[1]], [dy, R[3] - a.y]];
    for (const [p, q] of pq) {
      if (p === 0) { if (q < 0) return false; continue; }
      const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t0 <= t1;
  }
  const tw = (s, h) => {
    try { if (typeof textW === 'function') return textW({ type: 'text', s: String(s), h }); } catch (_) {}
    return h * 0.62 * [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 1.55 : 1), 0);
  };
  const lpOf = (l) => (Array.isArray(l) ? l : []).map(P);
  function edgesOf(loops) { const E = []; for (const l of loops) for (let i = 0; i < l.length; i++) E.push([l[i], l[(i + 1) % l.length]]); return E; }

  /* ---------- 이름 ---------- */
  function cleanName(s) { s = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim(); return [...s].slice(0, MAXNAME).join(''); }
  function nextName(prev) {
    const s = cleanName(prev);
    if (!s) return defaults.name;
    const m = /^(.*?)(\d+)$/.exec(s);
    if (!m) return cleanName(s + ' 2');
    const d = m[2], n = (BigInt(d) + 1n).toString();
    return cleanName(m[1] + (n.length < d.length ? n.padStart(d.length, '0') : n));
  }

  /* ---------- 같은 방 키(꼭짓점, 8회차 COMMANDS.boundary 와 같은 방식) ---------- */
  function key(r) {
    const l = r && Array.isArray(r.outer) ? r.outer : [];
    return l.map(q => { const p = P(q); return p.x.toPrecision(12) + ',' + p.y.toPrecision(12); }).sort().join(';');
  }

  /* ---------- 면적 글자 ---------- */
  function normOpt(opt) {
    opt = opt && typeof opt === 'object' ? opt : {};
    const unit = opt.unit === 'mm2' || opt.unit === 'mm²' ? 'mm2' : 'm2';
    let dec = opt.dec == null || opt.dec === '' ? defaults.dec : Math.round(+opt.dec); if (!fin(dec)) dec = defaults.dec; dec = Math.max(0, Math.min(6, dec));
    let h = opt.h == null || opt.h === '' ? defaults.h : +opt.h; if (!fin(h) || h <= 0) h = defaults.h;
    let ah = opt.ah == null || opt.ah === '' ? defaults.ah : +opt.ah; if (!fin(ah) || ah <= 0 || ah > 2) ah = defaults.ah;
    return { unit, dec: unit === 'mm2' ? 0 : dec, h, ah, islands: opt.islands == null ? defaults.islands : !!opt.islands,
      name: cleanName(opt.name) || defaults.name, frameOk: !!opt.frameOk };
  }
  /* mm² → {v:Number, s:'12.00'} (반올림은 정수 단계에서) */
  function fmt(mm2, opt) {
    const o = normOpt(opt);
    const A = Math.round(Math.abs(+mm2) || 0); // mm² 정수
    if (o.unit === 'mm2') return { v: A, s: String(A), u: 'mm²' };
    const q = 10 ** (6 - o.dec), n = Math.round(A / q); // A/q 는 .5 경계에서 정확(정수 ÷ 10의 거듭제곱)
    const p10 = 10 ** o.dec, ip = Math.floor(n / p10), fp = n - ip * p10;
    return { v: n / p10, s: o.dec ? ip + '.' + String(fp).padStart(o.dec, '0') : String(ip), u: 'm²' };
  }

  /* ---------- 도곽 의심(조건 4, 마감 회의 결정 — bigBox 안 씀) ----------
     (나) 고리 안(고리 선 위 아님)에 통째로 든 열린 조각(선·열린 폴리선 변·호 = 1개씩, 블록 펼침, 글자·치수·닫힌 객체·섬 안 조각 제외)을
          끝점(허용 0.5)으로 이어 묶음 → 조각 3개 이상 묶음이 열려 있음(틈 난 방·벽) 이면 의심,
          (나') 닫힌 묶음(조각 3개 이상, 최상위 조각 포함) 하나라도 상자 넓이 ≥ 2 m² 이면 의심(안에 다른 방). 선 기둥·문 블록은 안 걸림.
     (다') 최상위(블록 밖) 닫힌 섬(닫힌 폴리선·원·타원) 하나라도 넓이 ≥ 2 m² 이면 의심. 블록 안 섬(가구)은 (다)만.
     (다) 닫힌 섬 넓이 합 ≥ 고리 넓이 30%.
     (가) BOUND.bigFrame 은 방 하나뿐 도면의 가구 블록·선 기둥에서도 켜져(실측) 단독으로 쓰지 않음 — (나)가 같은 경우를 더 좁게 봄. */
  const JOIN = 0.5, OPEN_MIN = 3, ROOM_MIN = 2e6, ISL_PCT = 0.30; // ROOM_MIN = 2 m² (도면 단위 mm 가정)
  function frameWhy(r, outer, isl) {
    const gross = fin(+r.area) ? +r.area : Math.abs(areaS(outer));
    if (!(gross > 0)) return null;
    const isA = fin(+r.islandArea) ? +r.islandArea : isl.reduce((t, l) => t + Math.abs(areaS(l)), 0);
    if (isA >= ISL_PCT * gross) return 'islands';
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of outer) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
    const tol = Math.max(JOIN, 1e-6 * Math.max(x1 - x0, y1 - y0));
    const onLoop = (q) => { for (let i = 0; i < outer.length; i++) if (segD(q, outer[i], outer[(i + 1) % outer.length]) <= tol) return true; return false; };
    const iBox = isl.map(l => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const q of l) { if (q.x < a) a = q.x; if (q.x > c) c = q.x; if (q.y < b) b = q.y; if (q.y > d) d = q.y; } return [a - tol, b - tol, c + tol, d + tol]; });
    const inIsl = (pts) => iBox.some((w, k) => pts.every(q => q.x >= w[0] && q.x <= w[2] && q.y >= w[1] && q.y <= w[3]) && pts.some(q => inP(q, isl[k])));
    const pieces = []; // {a, b, pts, top}
    const closedObj = (f) => f.type === 'circle' || f.type === 'ellipse' || (f.type === 'polyline' && f.closed && Array.isArray(f.pts) && f.pts.length > 2);
    let curTop = true, bigIsl = false;
    const takePrim = (q) => {
      let a, b, pts;
      if (q.k === 's') { a = q.a; b = q.b; pts = [a, b, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]; }
      else { if (q.a0 == null) return; const R = Math.abs(q.r), sp = ((((q.a1 - q.a0) % 360) + 360) % 360) || 360, n = Math.max(8, Math.ceil(sp / 6)); pts = [];
        for (let i = 0; i <= n; i++) { const g = (q.a0 + sp * i / n) * Math.PI / 180; pts.push({ x: q.c.x + R * Math.cos(g), y: q.c.y + R * Math.sin(g) }); }
        a = pts[0]; b = pts[pts.length - 1]; }
      if (!pts.every(v => fin(v.x) && fin(v.y) && inP(v, outer) && !onLoop(v))) return; // 통째로 안 + 고리 선에 안 닿음
      if (isl.length && inIsl(pts)) return; // 섬(가구 등) 안 조각
      pieces.push({ a, b, pts, top: curTop });
    };
    const loopArea = (f) => { let L = null; try { L = typeof closedLoopOf === 'function' ? closedLoopOf(f) : null; } catch (_) { L = null; }
      if (!L && f.type === 'polyline') L = f.pts; if (!L || L.length < 3) return null; return L; };
    const takeEnt = (f) => { if (!f || SKIP.has(f.type) || f.type === 'insert') return;
      if (closedObj(f)) { // (다') 최상위 닫힌 섬이 방만큼 크면(≥ 2 m²) 도곽 의심. 블록 안(가구)은 뺌
        if (curTop && !bigIsl) { const L = loopArea(f); if (L && L.every(v => inP(v, outer) && !onLoop(v)) && Math.abs(areaS(L)) >= ROOM_MIN) bigIsl = true; }
        return; } let ps; try { ps = prims(f); } catch (_) { ps = []; } for (const q of ps) takePrim(q); };
    const vis = typeof visibleEnts === 'function' ? visibleEnts() : doc.entities;
    for (const e of vis) {
      if (!e || SKIP.has(e.type)) continue;
      let bx = null; try { bx = boxOf(e); } catch (_) { bx = null; }
      if (bx && (bx[2] < x0 || bx[0] > x1 || bx[3] < y0 || bx[1] > y1)) continue;
      if (e.type === 'insert') { let fl = []; try { fl = flatEnts([e]); } catch (_) { fl = []; } curTop = false; for (const f of fl) takeEnt(f); curTop = true; }
      else takeEnt(e);
      if (bigIsl) return 'room-island';
      if (pieces.length > 20000) return 'many'; // 너무 많음 → 안전하게 의심
    }
    if (!pieces.length) return null;
    // 끝점 묶기: 끝점 2n 개를 격자(칸 = tol)로 합쳐 정점 번호 → union-find
    const cell = tol * 2, grid = new Map(), V = [];
    const vid = (q) => { const gx = Math.floor(q.x / cell), gy = Math.floor(q.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const L = grid.get((gx + dx) + ',' + (gy + dy)); if (L) for (const k of L) if (Math.hypot(V[k].x - q.x, V[k].y - q.y) <= tol) return k; }
      const k = V.length; V.push(q); const key0 = gx + ',' + gy; if (!grid.has(key0)) grid.set(key0, []); grid.get(key0).push(k); return k; };
    const E = pieces.map(pc => [vid(pc.a), vid(pc.b)]);
    const par = V.map((_, i) => i), find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const deg = new Array(V.length).fill(0);
    for (const [u, v] of E) { deg[u]++; deg[v]++; par[find(u)] = find(v); }
    const comp = new Map();
    E.forEach(([u, v], i) => { const c = find(u); if (!comp.has(c)) comp.set(c, { n: 0, open: false, top: false, b: [Infinity, Infinity, -Infinity, -Infinity] }); const C = comp.get(c); C.n++; if (pieces[i].top) C.top = true;
      if (u === v) { /* 닫힌 호 등 */ } for (const w of [u, v]) if (deg[w] < 2) C.open = true;
      for (const q of pieces[i].pts) { if (q.x < C.b[0]) C.b[0] = q.x; if (q.y < C.b[1]) C.b[1] = q.y; if (q.x > C.b[2]) C.b[2] = q.x; if (q.y > C.b[3]) C.b[3] = q.y; } });
    for (const C of comp.values()) {
      if (C.n < OPEN_MIN) continue;
      if (C.open) return 'open-chain';
      // (나') 닫힌 묶음 하나라도 상자 넓이 ≥ 2 m² 이면 안에 다른 방(블록 안 조각만으로 된 묶음 = 가구는 뺌)
      if (C.top && (C.b[2] - C.b[0]) * (C.b[3] - C.b[1]) >= ROOM_MIN) return 'inner-room';
    }
    return null;
  }

  /* ---------- 근사 다시 보기: r.approx 는 고리 상자 안에 곡선만 있어도 켜짐(가구 블록 원 등).
     실제로 곡선이 면적에 들어갔는지 = 고리 변의 가운데 점이 어떤 직선 조각 위에도 없으면(곡선을 6° 로 나눈 현) 근사 ---------- */
  function curvy(loops) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of loops) for (const q of l) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
    const tol = 1e-6 * Math.max(x1 - x0, y1 - y0, Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1), 1), W = [x0 - tol, y0 - tol, x1 + tol, y1 + tol];
    const S = [], vis = typeof visibleEnts === 'function' ? visibleEnts() : doc.entities;
    const hitW = (e) => { let b = null; try { b = boxOf(e); } catch (_) { b = null; } return !b || !(b[2] < W[0] || b[0] > W[2] || b[3] < W[1] || b[1] > W[3]); };
    const take = (f) => {
      if (f.type === 'line') { if (f.a && f.b) S.push([f.a, f.b]); return; }
      if (f.type === 'polyline' && Array.isArray(f.pts)) { const n = f.pts.length, m = f.closed && n > 2 ? n : n - 1;
        for (let i = 0; i < m; i++) if (!(Array.isArray(f.b) && +f.b[i])) S.push([f.pts[i], f.pts[(i + 1) % n]]); }
    };
    for (const e of vis) {
      if (!e || SKIP.has(e.type) || !hitW(e)) continue;
      if (e.type === 'insert') { let fl = []; try { fl = flatEnts([e]); } catch (_) { fl = []; } for (const f of fl) if (f) take(f); } else take(e);
    }
    for (const l of loops) for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!S.some(s => segD(m, s[0], s[1]) <= tol)) return true;
    }
    return false;
  }

  /* ---------- 자리 찾기 ---------- */
  function boxesAt(pt, wN, wA, h, ah) {
    const pad = PAD * h;
    return [
      [pt.x - wN / 2 - pad, pt.y + NAME_UP * h - pad, pt.x + wN / 2 + pad, pt.y + (NAME_UP + 1) * h + pad],
      [pt.x - wA / 2 - pad, pt.y - AREA_DN * h - pad, pt.x + wA / 2 + pad, pt.y - AREA_DN * h + ah * h + pad]
    ];
  }
  function fitsAt(pt, wN, wA, h, ah, outer, isl, E) {
    for (const R of boxesAt(pt, wN, wA, h, ah)) {
      const c = { x: (R[0] + R[2]) / 2, y: (R[1] + R[3]) / 2 };
      if (!inP(c, outer) || isl.some(l => inP(c, l))) return false;
      for (const s of E) {
        if (Math.max(s[0].x, s[1].x) < R[0] || Math.min(s[0].x, s[1].x) > R[2] || Math.max(s[0].y, s[1].y) < R[1] || Math.min(s[0].y, s[1].y) > R[3]) continue;
        if (segHitsBox(s[0], s[1], R)) return false;
      }
    }
    return true;
  }
  function place(outer, isl, wN, wA, h, ah, click) {
    const E = edgesOf([outer].concat(isl));
    const free = (q) => inP(q, outer) && !isl.some(l => inP(q, l));
    const c = centroid(outer);
    if (free(c) && fitsAt(c, wN, wA, h, ah, outer, isl, E)) return { at: c, fits: true, how: 'centroid' };
    // 안쪽 격자: 클릭 점과 상관없이 고리만으로 정해짐(같은 방이면 같은 자리)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of outer) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
    const W = x1 - x0, H = y1 - y0, st = Math.max(W, H) / GRID || 1;
    const nx = Math.max(1, Math.min(GRID * 2, Math.ceil(W / st))), ny = Math.max(1, Math.min(GRID * 2, Math.ceil(H / st)));
    const cand = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const q = { x: x0 + (i + 0.5) * W / nx, y: y0 + (j + 0.5) * H / ny };
      if (!free(q)) continue;
      let d = Infinity; for (const s of E) { const v = segD(q, s[0], s[1]); if (v < d) d = v; }
      cand.push({ q, d, i, j });
    }
    cand.sort((a, b) => (b.d - a.d) || (b.j - a.j) || (a.i - b.i));
    for (const k of cand) if (fitsAt(k.q, wN, wA, h, ah, outer, isl, E)) return { at: k.q, fits: true, how: 'grid' };
    if (click && free(click) && fitsAt(click, wN, wA, h, ah, outer, isl, E)) return { at: { x: click.x, y: click.y }, fits: true, how: 'click' };
    if (cand.length) return { at: cand[0].q, fits: false, how: 'far' };
    return { at: free(c) ? c : (click || c), fits: false, how: 'far' };
  }

  /* ---------- label ---------- */
  function label(r, opt) {
    try {
      if (!r || typeof r !== 'object') return { ok: false, code: 'error', msg: '경계 결과가 없습니다' };
      if (!r.ok) {
        const code = ['open', 'bad-point', 'too-many', 'error', 'frame'].includes(r.code) ? r.code : 'error';
        return { ok: false, code, msg: String(r.msg || '닫힌 경계를 찾지 못했습니다') };
      }
      const o = normOpt(opt);
      const outer = lpOf(r.outer), isl = (Array.isArray(r.islands) ? r.islands : []).map(lpOf).filter(l => l.length >= 3);
      if (outer.length < 3 || !outer.every(q => fin(q.x) && fin(q.y))) return { ok: false, code: 'error', msg: '경계 꼭짓점이 올바르지 않습니다' };
      const gross = fin(+r.area) ? +r.area : Math.abs(areaS(outer));
      const isA = fin(+r.islandArea) ? +r.islandArea : isl.reduce((s, l) => s + Math.abs(areaS(l)), 0);
      if (!o.frameOk) {
        const why = frameWhy(r, outer, isl);
        if (why) { const G = fmt(gross, o); // UI 가 Y 전에 잡힌 면적·점선 경계를 보여 줄 수 있게
          return { ok: false, code: 'frame', why, area: G.v, text: G.s + ' ' + G.u, loop: outer.map(q => [q.x, q.y]),
            msg: `바깥 테두리(도곽)를 잡았을 수 있습니다 — 잡힌 면적 ${G.s} ${G.u}. 방에 틈이 있는지 GEOCHECK 로 확인하세요 (정말 이 방이면 "그래도 넣기")` }; }
      }
      const mm2 = o.islands ? (fin(+r.net) ? +r.net : gross - isA) : gross;
      const F = fmt(mm2, o), FI = fmt(isA, o);
      let approx = !!r.approx; if (approx) { try { approx = curvy(o.islands ? [outer].concat(isl) : [outer]); } catch (_) { approx = true; } }
      const text = (approx ? '≈' : '') + F.s + ' ' + F.u;
      const h = o.h, ah = o.ah;
      const wN = tw(o.name, h), wA = tw(text, ah * h);
      const click = opt && opt.pick != null ? P(opt.pick) : null;
      const pl = place(outer, isl, wN, wA, h, ah, click && fin(click.x) && fin(click.y) ? click : null);
      return { ok: true, area: F.v, text, at: { x: pl.at.x, y: pl.at.y }, fits: pl.fits,
        islandsOff: { n: isl.length, area: FI.v, sub: o.islands }, approx, how: pl.how, name: o.name, h, ah };
    } catch (e) {
      return { ok: false, code: 'error', msg: '라벨 계산 오류: ' + String(e && e.message || e).slice(0, 120) };
    }
  }

  /* 이미 라벨 있는 방: layer 층 글자 중 기준점이 고리 안(섬 밖)인 것이 있나 */
  function tagged(r, layer) {
    try {
      if (!r || !r.ok) return false;
      const L = layer || defaults.layer, outer = lpOf(r.outer), isl = (r.islands || []).map(lpOf);
      return doc.entities.some(e => e && e.type === 'text' && e.layer === L && e.p && inP(e.p, outer) && !isl.some(l => inP(e.p, l)));
    } catch (_) { return false; }
  }

  window.ROOMTAG = { ver: 1, defaults, label, nextName, key, tagged, fmt };

  /* ---------- AI·배치 명령: 모두 먼저 계산 → 하나라도 실패면 throw(글자 0개) ---------- */
  COMMANDS.roomtag = (c) => {
    c = c || {};
    if (!window.BOUND || typeof BOUND.at !== 'function') throw new Error('경계 만들기(8회차) 모듈이 없습니다');
    const rooms = Array.isArray(c.rooms) ? c.rooms : [];
    if (!rooms.length) throw new Error('rooms(방 안쪽 점 목록)가 필요합니다 — [{pick:[x, y], name}]');
    if (c.unit != null && !['m2', 'mm2', 'm²', 'mm²'].includes(c.unit)) throw new Error("unit 은 'm2' 또는 'mm2' 입니다");
    if (c.h != null && !(+c.h > 0)) throw new Error('h(글자 높이)는 0보다 커야 합니다');
    const layer = String(c.layer == null || c.layer === '' ? defaults.layer : c.layer).trim();
    if (!layer) throw new Error('layer 이름이 비었습니다');
    const L0 = typeof layerOf === 'function' ? layerOf(layer) : doc.layers.find(l => l.name === layer);
    if (L0 && (!L0.visible || L0.frozen || L0.locked))
      throw new Error(`'${layer}' 도면층이 ${L0.frozen ? '동결' : !L0.visible ? '꺼짐' : '잠김'} 상태입니다 — 켜거나 풀고 다시 하세요`);
    const base = { unit: c.unit, dec: c.dec, islands: c.islands, h: c.h, ah: c.ah, frameOk: c.frameOk };
    const plan = [], seen = new Map(), skipped = []; let prev = null;
    rooms.forEach((rm, i) => {
      const tag = rooms.length > 1 ? `방 ${i + 1}: ` : '';
      const pk = rm && (rm.pick != null ? rm.pick : rm.at);
      let p = null; try { p = pk != null ? P(pk) : null; } catch (_) { p = null; }
      if (!p || !fin(p.x) || !fin(p.y)) throw new Error(tag + 'pick 형식은 [x, y] 입니다');
      const r = BOUND.at(p, {});
      if (!r || !r.ok) { const Lb = label(r, base); throw new Error(tag + Lb.msg); }
      const k = key(r);
      if (rm.key != null && rm.key !== k) throw new Error(tag + '도면이 바뀌었습니다 — 다시 고르세요');
      if (seen.has(k)) { skipped.push({ i, same: seen.get(k), why: 'same', msg: `앞 방(${seen.get(k) + 1})과 같은 경계 — 문·틈으로 이어졌을 수 있음` }); return; } // 번호를 먹지 않음
      if (tagged(r, layer)) { skipped.push({ i, why: 'tagged', msg: '이미 라벨 있는 방 — 건너뜀' }); return; }
      const name = cleanName(rm.name) || (prev == null ? defaults.name : nextName(prev));
      prev = name;
      const lb = label(r, Object.assign({}, base, { name, pick: [p.x, p.y], frameOk: c.frameOk || rm.frameOk }));
      if (!lb.ok) throw new Error(tag + lb.msg);
      seen.set(k, i);
      plan.push({ name, lb });
    });
    const ids = []; let total = 0;
    ensureLayer(layer);
    for (const { name, lb } of plan) {
      const h = lb.h, ah = lb.ah;
      ids.push(COMMANDS.text({ at: [lb.at.x, lb.at.y + NAME_UP * h], text: name, h, align: 'center', layer }).id);
      ids.push(COMMANDS.text({ at: [lb.at.x, lb.at.y - AREA_DN * h], text: lb.text, h: ah * h, align: 'center', layer }).id);
      total += lb.area;
    }
    const o = normOpt(base), p10 = 10 ** o.dec;
    total = Math.round(total * p10) / p10;
    return { ids, n: plan.length, total, skipped, unfit: plan.filter(x => !x.lb.fits).length };
  };
})();
