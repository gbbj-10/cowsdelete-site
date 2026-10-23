/* 무카 CAD 테스트 서버 — 2D 대조 (lab 전용)
   3D 모델(규칙 엔진 결과 또는 AI가 model3d 로 만든 모델)을 6방향으로 2D 재투상(숨은선 포함)해서
   지금 2D 도면의 각 뷰와 선 단위로 대조한다.
     · 재현(recall)  = 원본 도면 선 중 3D 투상에 있는 비율  (빠진 선 = 빨강)
     · 정확(precision)= 3D 투상 선 중 원본 도면에 있는 비율  (남는 선 = 파랑)
   통과 기준: 재현·정확 모두 97% 이상. 미달이면 [AI로 3D] 버튼을 띄운다 (사용자 본인 Claude 로 실행 → 운영자 비용 0).
   방향은 자동으로 맞춘다: 도면 뷰마다 6방향 × 90° 회전 24가지 중 가장 잘 맞는 것을 고른다.
   연결 프로그램(허브)은 그대로: mucca_draw 의 {"cmd":"model3d_compare"} 와 mucca_snapshot(차이 그림)만 씀.
   lab3d.js(LAB3D)·labphoto.js(LABPHOTO) 뒤에 불러온다. */
(function () {
  'use strict';
  const C2 = window.LAB2D = { ver: 1, last: null };
  const lab = () => window.LAB3D, ph = () => window.LABPHOTO;
  const V = () => { const L = lab(); if (!L || !L._v) throw new Error('3D 기능을 불러오는 중입니다. 잠시 뒤 다시 시도하세요'); return L._v(); };
  const PASS = 0.97;
  const IGN_LAYERS = new Set(['중심선', '치수', '문자']);
  const IGN_LT = new Set(['center', 'phantom', 'dashdot']);
  const isHid = e => e.layer === '숨은선' || /hidden|dashed/i.test(String(e.lt || ''));
  const D2R = Math.PI / 180;

  /* ---------- 1) 2D 도면 → 꺾은선 ---------- */
  function arcSeg(c, r, a0, a1, n) { let A1 = a1; while (A1 <= a0) A1 += 360; const k = Math.max(4, Math.ceil(n * (A1 - a0) / 360)), o = []; for (let i = 0; i <= k; i++) { const t = (a0 + (A1 - a0) * i / k) * D2R; o.push([c.x + r * Math.cos(t), c.y + r * Math.sin(t)]); } return o; }
  function polyPts(e) {
    const P = e.pts, n = P.length, b = e.b || e.bulges || [], o = [[P[0].x, P[0].y]], segN = e.closed ? n : n - 1;
    for (let i = 0; i < segN; i++) {
      const p = P[i], q = P[(i + 1) % n], bu = +b[i] || 0;
      if (Math.abs(bu) > 1e-9) {
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), th = 4 * Math.atan(bu);
        const off = (d / 2) / Math.tan(th / 2), nx = -dy / d, ny = dx / d, c = { x: (p.x + q.x) / 2 + nx * off, y: (p.y + q.y) / 2 + ny * off };
        const a0 = Math.atan2(p.y - c.y, p.x - c.x), r = Math.hypot(p.x - c.x, p.y - c.y), k = Math.max(4, Math.ceil(Math.abs(th) / (2 * Math.PI) * 96));
        for (let j = 1; j <= k; j++) { const t = a0 + th * j / k; o.push([c.x + r * Math.cos(t), c.y + r * Math.sin(t)]); }
      } else o.push([q.x, q.y]);
    }
    return o;
  }
  function entPolys(e) {
    const E = window.ellPt;
    switch (e.type) {
      case 'line': return [[[e.a.x, e.a.y], [e.b.x, e.b.y]]];
      case 'polyline': return e.pts && e.pts.length > 1 ? [polyPts(e)] : [];
      case 'circle': return [arcSeg(e.c, Math.abs(e.r), 0, 360, 96)];
      case 'arc': return [arcSeg(e.c, e.r, e.a0, e.a1, 96)];
      case 'ellipse': { if (!E) return []; const s = []; let a0 = e.a0 == null ? 0 : e.a0, a1 = e.a0 == null ? 360 : e.a1; while (a1 <= a0) a1 += 360; for (let i = 0; i <= 96; i++) { const q = E(e, a0 + (a1 - a0) * i / 96); s.push([q.x, q.y]); } return [s]; }
      default: return [];
    }
  }
  // 도면 선: {vis, hid} (치수·문자·중심선 제외). opt.layers = 쓸 레이어만, opt.skip_layers = 뺄 레이어
  function drawingLines(opt) {
    let ents = lab().srcEnts();
    const only = Array.isArray(opt.layers) && opt.layers.length ? new Set(opt.layers) : null, skip = new Set(opt.skip_layers || []);
    const vis = [], hid = [];
    for (const e of ents) {
      if (!['line', 'polyline', 'circle', 'arc', 'ellipse'].includes(e.type)) continue;
      if (only ? !only.has(e.layer) : (IGN_LAYERS.has(e.layer) || skip.has(e.layer))) continue;
      if (e.lt && IGN_LT.has(String(e.lt).toLowerCase())) continue;
      (isHid(e) ? hid : vis).push(...entPolys(e));
    }
    return { vis, hid };
  }

  /* ---------- 2) 뷰 나누기 (가까운 선끼리 묶음) ---------- */
  const bbOf = polys => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of polys) for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; };
  const inBox = (b, p) => p.every(([x, y]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
  function clusters(L, opt) {
    const items = L.vis.map(p => ({ p, h: false })).concat(L.hid.map(p => ({ p, h: true })));
    if (!items.length) return [];
    if (Array.isArray(opt.views) && opt.views.length) {   // 직접 지정한 뷰 상자 [[x0,y0,x1,y1],...]
      return opt.views.map((v, i) => { const b = (Array.isArray(v) ? v : v.box).map(Number); const box = [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])];
        const its = items.filter(t => inBox(box, t.p)); return { no: i + 1, vis: its.filter(t => !t.h).map(t => t.p), hid: its.filter(t => t.h).map(t => t.p), want: v.view || null }; }).filter(c => c.vis.length);
    }
    const all = bbOf(items.map(t => t.p)), gap = Math.max(all.w, all.h) * (+opt.gap || 0.025);
    const bbs = items.map(t => bbOf([t.p])), par = items.map((_, i) => i);
    const f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    // 상자끼리 gap 안으로 가까우면 같은 뷰 (격자로 후보 줄이기)
    const cs = Math.max(gap * 4, Math.max(all.w, all.h) / 60), grid = new Map();
    bbs.forEach((b, i) => { for (let gx = Math.floor((b.x0 - gap) / cs); gx <= Math.floor((b.x1 + gap) / cs); gx++) for (let gy = Math.floor((b.y0 - gap) / cs); gy <= Math.floor((b.y1 + gap) / cs); gy++) { const k = gx + ',' + gy; (grid.get(k) || grid.set(k, []).get(k)).push(i); } });
    for (const L2 of grid.values()) for (let a = 0; a < L2.length; a++) for (let b = a + 1; b < L2.length; b++) {
      const i = L2[a], j = L2[b]; if (f(i) === f(j)) continue; const A = bbs[i], B = bbs[j];
      if (A.x0 - gap <= B.x1 && B.x0 - gap <= A.x1 && A.y0 - gap <= B.y1 && B.y0 - gap <= A.y1) {
        // 큰 테두리(도곽)는 안쪽 뷰와 상자만 겹치고 선은 멀다 → 선끼리 실제로 가까운지 한 번 더
        if (near(items[i].p, items[j].p, gap)) par[f(i)] = f(j);
      }
    }
    const g = new Map(); items.forEach((t, i) => { const r = f(i); (g.get(r) || g.set(r, []).get(r)).push(t); });
    let cl = [...g.values()].map(ts => ({ vis: ts.filter(t => !t.h).map(t => t.p), hid: ts.filter(t => t.h).map(t => t.p) })).filter(c => c.vis.length);
    cl.forEach(c => { c.bb = bbOf(c.vis.concat(c.hid)); });
    const D = Math.max(all.w, all.h);
    const inside = (a, b) => a !== b && a.bb.x0 >= b.bb.x0 - 1e-9 && a.bb.x1 <= b.bb.x1 + 1e-9 && a.bb.y0 >= b.bb.y0 - 1e-9 && a.bb.y1 <= b.bb.y1 + 1e-9;
    // 도곽(테두리) 판정: 선 대부분이 자기 상자 가장자리에 있고, 안에 서로 떨어진 큰 묶음(뷰)이 2개 이상
    const isFrame = b => {
      const kids = cl.filter(a => inside(a, b)), top = kids.filter(a => !kids.some(o => inside(a, o)));
      const big = top.filter(a => Math.max(a.bb.w, a.bb.h) >= Math.max(b.bb.w, b.bb.h) * 0.22);
      if (big.length < 2) return false;
      const sep = big.some((a, i) => big.some((o, j) => j > i && (a.bb.x1 < o.bb.x0 || o.bb.x1 < a.bb.x0 || a.bb.y1 < o.bb.y0 || o.bb.y1 < a.bb.y0)));
      if (!sep) return false;
      // 뷰는 도곽 안을 꽤 차지한다 (판의 장공·구멍 몇 개는 해당 없음)
      if (big.reduce((s, a) => s + a.bb.w * a.bb.h, 0) < b.bb.w * b.bb.h * 0.12) return false;
      const m = Math.max(b.bb.w, b.bb.h) * 0.03, pts = sample(b.vis, Math.max(b.bb.w, b.bb.h) / 300);
      const edge = pts.filter(([x, y]) => x - b.bb.x0 < m || b.bb.x1 - x < m || y - b.bb.y0 < m || b.bb.y1 - y < m || (x - b.bb.x0 > b.bb.w * 0.4 && y - b.bb.y0 < b.bb.h * 0.25)).length;
      return edge / (pts.length || 1) >= 0.6;
    };
    const frames = new Set(cl.filter(isFrame));
    // 뷰 안쪽에만 있는 선(구멍 원·키홈 등)은 그 뷰에 합침 — 가장 안쪽의 도곽 아닌 묶음으로
    for (const a of cl.slice().sort((p, q) => p.bb.w * p.bb.h - q.bb.w * q.bb.h)) {
      if (frames.has(a) || a.dead) continue;
      const host = cl.filter(b => !b.dead && !frames.has(b) && inside(a, b)).sort((p, q) => p.bb.w * p.bb.h - q.bb.w * q.bb.h)[0];
      if (host) { host.vis.push(...a.vis); host.hid.push(...a.hid); a.dead = true; }
    }
    // 도곽과 너무 작은 것(표 글자 조각 등) 빼기
    cl = cl.filter(c => !c.dead && !frames.has(c) && Math.max(c.bb.w, c.bb.h) > D * 0.04);
    cl.forEach(c => c.bb = bbOf(c.vis.concat(c.hid)));
    cl.sort((a, b) => (b.bb.w * b.bb.h) - (a.bb.w * a.bb.h));
    return cl.slice(0, +opt.max_views || 6).map((c, i) => Object.assign(c, { no: i + 1 }));
  }
  function near(P, Q, d) {
    const segs = p => { const o = []; for (let i = 0; i + 1 < p.length; i++) o.push([p[i], p[i + 1]]); return o; };
    const sd = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy; let t = L ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy); };
    const A = segs(P), B = segs(Q); if (A.length * B.length > 40000) return true;
    for (const [a, b] of A) for (const [c, e] of B) { if (sd(a, c, e) <= d || sd(b, c, e) <= d || sd(c, a, b) <= d || sd(e, a, b) <= d) return true; }
    return false;
  }

  /* ---------- 3) 3D → 6방향 투상 ---------- */
  const VIEWS = { right: [], left: [[180, [0, 0, 1]]], front: [[-90, [0, 0, 1]]], rear: [[90, [0, 0, 1]]], top: [[90, [1, 0, 0]]], bottom: [[-90, [1, 0, 0]]] };
  async function shapeOf(src) {
    const R = await V().ensureOCC();
    if (src === 'model') { const P = ph() && ph().model; if (!P) throw new Error('model3d 로 만든 3D 모델이 없습니다'); return { R, s: R.makeCompound(P.parts.map(p => p.shape.clone())), own: true }; }
    if (!lab().ruleSolid) throw new Error('규칙 엔진 3D를 꺼낼 수 없습니다');
    return { R, s: await lab().ruleSolid(), own: true };
  }
  async function project6(src) {
    const { R, s } = await shapeOf(src);
    const out = {};
    for (const [k, rots] of Object.entries(VIEWS)) {
      let t = s.clone(); for (const [a, ax] of rots) t = t.rotate(a, [0, 0, 0], ax);
      const pr = R.drawProjection(t, 'front');
      const toP = d => { const o = []; for (const path of d.toSVGPaths()) for (const pl of ph()._svgPolys(path)) o.push(pl.map(([x, y]) => [x, -y])); return o; };
      out[k] = { vis: toP(pr.visible), hid: toP(pr.hidden) };
      try { t.delete(); } catch (_) { }
    }
    try { s.delete(); } catch (_) { }
    return out;
  }

  /* ---------- 4) 선 대조 ---------- */
  function sample(polys, step) {
    const o = [];
    for (const p of polys) for (let i = 0; i + 1 < p.length; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[i + 1], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / step));
      for (let k = 0; k < n; k++) o.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
      if (i + 2 === p.length) o.push([x1, y1]);
    }
    return o;
  }
  function index(pts, cell) { const g = new Map(); for (const q of pts) { const k = Math.floor(q[0] / cell) + ',' + Math.floor(q[1] / cell); (g.get(k) || g.set(k, []).get(k)).push(q); } return g; }
  function hits(pts, g, cell, tol) {
    const t2 = tol * tol, out = new Uint8Array(pts.length);
    pts.forEach((q, i) => { const gx = Math.floor(q[0] / cell), gy = Math.floor(q[1] / cell);
      for (let a = -1; a <= 1 && !out[i]; a++) for (let b = -1; b <= 1 && !out[i]; b++) { const L = g.get((gx + a) + ',' + (gy + b)); if (L) for (const r of L) { const dx = r[0] - q[0], dy = r[1] - q[1]; if (dx * dx + dy * dy <= t2) { out[i] = 1; break; } } } });
    return out;
  }
  const xf = (polys, f) => polys.map(p => p.map(f));
  function scoreView(cv, P, tol, step, useHid) {
    const A = sample(useHid ? cv.vis.concat(cv.hid) : cv.vis, step), B = sample(useHid ? P.vis.concat(P.hid) : P.vis, step);
    if (!A.length || !B.length) return { rec: 0, prec: 0, f1: 0, A, B, hA: new Uint8Array(A.length), hB: new Uint8Array(B.length) };
    // 도면에 숨은선이 없는 뷰: 도면 선이 3D의 숨은 선 자리에 있어도 맞은 것으로 봄(선 종류는 안 따짐). 남는 선은 보이는 선만 셈
    const B2 = useHid ? B : B.concat(sample(P.hid, step));
    const cell = tol, hA = hits(A, index(B2, cell), cell, tol), hB = hits(B, index(A, cell), cell, tol);
    const rec = hA.reduce((s, v) => s + v, 0) / A.length, prec = hB.reduce((s, v) => s + v, 0) / B.length;
    return { rec, prec, f1: rec + prec ? 2 * rec * prec / (rec + prec) : 0, A, B, hA, hB };
  }
  // 투상 하나를 도면 뷰 자리로: 90°×k 회전 → (필요하면 배율) → 상자 가운데 맞춤
  function place(P, k, cbb, scale) {
    const rot = ([x, y]) => k === 0 ? [x, y] : k === 1 ? [-y, x] : k === 2 ? [-x, -y] : [y, -x];
    const R0 = { vis: xf(P.vis, rot), hid: xf(P.hid, rot) }, b = bbOf(R0.vis.concat(R0.hid));
    const s = scale || 1, f = ([x, y]) => [cbb.cx + (x - b.cx) * s, cbb.cy + (y - b.cy) * s];
    return { vis: xf(R0.vis, f), hid: xf(R0.hid, f), w: b.w * s, h: b.h * s };
  }

  async function compare(opt) {
    opt = opt || {};
    const L = drawingLines(opt);
    const cl = clusters(L, opt);
    if (!cl.length) throw new Error('대조할 2D 도면 선이 없습니다 (치수·문자·중심선 레이어는 뺍니다)');
    const src = opt.source || (ph() && ph().model ? 'model' : 'rule');
    const t0 = performance.now();
    const PR = await project6(src);
    const allbb = bbOf(cl.flatMap(c => c.vis.concat(c.hid))), D = Math.hypot(allbb.w, allbb.h);
    const tol = +opt.tol > 0 ? +opt.tol : Math.max(0.05, D * 0.004), step = tol / 2;
    const views = [];
    for (const c of cl) {
      const useHid = c.hid.length > 0;
      let best = null;
      for (const [vn, P] of Object.entries(PR)) {
        if (c.want && c.want !== vn) continue;
        if (!P.vis.length) continue;
        for (let k = 0; k < 4; k++) {
          let pl = place(P, k, c.bb, 1), sc = 1;
          const rw = c.bb.w / (pl.w || 1), rh = c.bb.h / (pl.h || 1);
          if (opt.scale > 0) { sc = +opt.scale; pl = place(P, k, c.bb, sc); }
          else if (opt.auto_scale && Math.abs(rw - rh) < 0.03 * Math.max(rw, rh) && Math.abs(rw - 1) > 0.02) { sc = (rw + rh) / 2; pl = place(P, k, c.bb, sc); }
          const sizeErr = Math.max(Math.abs(pl.w - c.bb.w) / (c.bb.w || 1), Math.abs(pl.h - c.bb.h) / (c.bb.h || 1));
          if (best && sizeErr > 0.15 && best.sizeErr <= 0.15) continue;
          const s = scoreView(c, pl, tol, step, useHid);
          const cand = { view: vn, rot: k * 90, scale: sc, sizeErr, s, pl, useHid };
          if (!best || (cand.sizeErr <= 0.15) > (best.sizeErr <= 0.15) || ((cand.sizeErr <= 0.15) === (best.sizeErr <= 0.15) && cand.s.f1 > best.s.f1)) best = cand;
        }
      }
      if (best) views.push(Object.assign({ c }, best));
    }
    // 합계 (표본 수로 가중)
    let nA = 0, hA = 0, nB = 0, hB = 0; for (const v of views) { nA += v.s.A.length; hA += v.s.hA.reduce((s, x) => s + x, 0); nB += v.s.B.length; hB += v.s.hB.reduce((s, x) => s + x, 0); }
    const rec = nA ? hA / nA : 0, prec = nB ? hB / nB : 0, f1 = rec + prec ? 2 * rec * prec / (rec + prec) : 0;
    const res = { source: src, pass: rec >= PASS && prec >= PASS, recall: +rec.toFixed(4), precision: +prec.toFixed(4), f1: +f1.toFixed(4), tol_mm: +tol.toFixed(3), ms: Math.round(performance.now() - t0),
      views: views.map(v => ({ no: v.c.no, box: [v.c.bb.x0, v.c.bb.y0, v.c.bb.x1, v.c.bb.y1].map(x => Math.round(x * 10) / 10), matched: v.view, rot: v.rot, scale: +v.scale.toFixed(4), size_err: +v.sizeErr.toFixed(3), hidden_used: v.useHid,
        recall: +v.s.rec.toFixed(4), precision: +v.s.prec.toFixed(4), missing_pts: v.s.hA.length - v.s.hA.reduce((s, x) => s + x, 0), extra_pts: v.s.hB.length - v.s.hB.reduce((s, x) => s + x, 0) })) };
    C2.last = { res, views, allbb, tol };
    return res;
  }
  C2.compare = compare;

  /* ---------- 5) 차이 그림 ---------- */
  function diffCanvas(W0) {
    const { res, views, allbb } = C2.last; const pad = Math.max(allbb.w, allbb.h) * 0.04;
    const bx = { x0: allbb.x0 - pad, y0: allbb.y0 - pad, w: allbb.w + pad * 2, h: allbb.h + pad * 2 };
    const W = W0 || 1400, k = W / bx.w, H = Math.round(bx.h * k) + 58;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const X = x => (x - bx.x0) * k, Y = y => 58 + (bx.y0 + bx.h - y) * k;
    const dot = (pts, hit, want, col, r) => { g.fillStyle = col; for (let i = 0; i < pts.length; i++) if (!!hit[i] === want) g.fillRect(X(pts[i][0]) - r / 2, Y(pts[i][1]) - r / 2, r, r); };
    for (const v of views) {
      dot(v.s.A, v.s.hA, true, '#9aa1aa', 1.6);            // 맞은 원본 선
      dot(v.s.B, v.s.hB, false, '#1e6fd9', 2.4);           // 남는 선 (3D에만 있음)
      dot(v.s.A, v.s.hA, false, '#e0242b', 2.6);           // 빠진 선 (도면에만 있음)
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.setLineDash([4, 4]); g.strokeRect(X(v.c.bb.x0) - 4, Y(v.c.bb.y1) - 4, (v.c.bb.w) * k + 8, (v.c.bb.h) * k + 8); g.setLineDash([]);
      g.fillStyle = '#333'; g.font = '13px sans-serif'; g.fillText(`뷰${v.c.no} = ${v.view}${v.rot ? ' ' + v.rot + '°' : ''} · 재현 ${(v.s.rec * 100).toFixed(1)}% · 정확 ${(v.s.prec * 100).toFixed(1)}%`, X(v.c.bb.x0), Y(v.c.bb.y1) - 10);
    }
    g.fillStyle = res.pass ? '#0f7a3d' : '#b3261e'; g.font = 'bold 18px sans-serif';
    g.fillText(`2D 대조 (${res.source === 'rule' ? '규칙 엔진' : 'AI 모델'}) — 재현 ${(res.recall * 100).toFixed(1)}% · 정확 ${(res.precision * 100).toFixed(1)}% · ${res.pass ? '통과' : '미달 (기준 97%)'}`, 12, 24);
    g.font = '13px sans-serif'; g.fillStyle = '#e0242b'; g.fillText('■ 빠진 선 (도면에 있는데 3D에 없음)', 12, 46); g.fillStyle = '#1e6fd9'; g.fillText('■ 남는 선 (3D에만 있음)', 260, 46); g.fillStyle = '#9aa1aa'; g.fillText('■ 맞은 선', 430, 46);
    return cv;
  }
  C2.diffCanvas = diffCanvas;

  /* ---------- 6) mucca_draw 명령 ---------- */
  async function cmdCompare(c) {
    const res = await compare(c);
    const cv = diffCanvas(); const u = cv.toDataURL('image/png');
    ph().queue.push({ png: u.slice(u.indexOf(',') + 1), note: `2D 대조 차이 그림 — 빨강 = 도면에 있는데 3D 투상에 없는 선(빠진 선), 파랑 = 3D 투상에만 있는 선(남는 선), 회색 = 맞은 선. 뷰마다 맞춘 방향이 위에 적혀 있다` });
    C2.lastImage = u; showResult(res, u);
    return Object.assign(res, { note: `차이 그림은 다음 mucca_snapshot 호출 때 옵니다${res.pass ? '' : ' → 빨강·파랑 부분을 고쳐 model3d 를 다시 실행하고 다시 대조 (최대 6회)'}` });
  }
  if (ph() && ph().addCmd) ph().addCmd('model3d_compare', cmdCompare);

  /* ---------- 7) 3D 창 버튼: [2D 대조] · [AI로 3D] ---------- */
  const st = document.createElement('style');
  st.textContent = `.v3d .l2r{position:absolute;left:8px;top:46px;z-index:5;max-width:min(440px,62%);font-size:12px;line-height:1.5;color:#e8eaed;background:rgba(22,24,28,.94);border:1px solid #3a3f47;border-radius:8px;padding:8px 28px 8px 10px}
.v3d .l2r .x{position:absolute;right:4px;top:2px;background:none;border:0;color:#9aa0a6;font-size:16px;cursor:pointer;line-height:1}
.v3d .l2r img{display:block;max-width:100%;max-height:180px;margin-top:6px;border:1px solid #3a3f47;border-radius:6px;cursor:zoom-in;background:#fff}
.v3d .l2r .ai{margin-top:6px;color:#bdc1c6}.v3d .l2r .ai button{background:#f1c232;color:#1b1b1b;border:0;border-radius:6px;padding:4px 10px;font-weight:600;cursor:pointer}.v3d .l2r .p{color:#5bd68a;font-weight:600}.v3d .l2r .f{color:#ff7b72;font-weight:600}`;
  document.head.appendChild(st);
  function addButtons() {
    const L = lab(); if (!L || !L._v) return false; const v = L._v(); const hd = v.pane && v.pane.querySelector('.v3h'); if (!hd || hd.querySelector('#l2cmp')) return true;
    const b = document.createElement('button'); b.className = 'btn'; b.id = 'l2cmp'; b.textContent = '2D 대조'; b.title = '3D를 다시 2D로 투상해서 지금 도면과 선 단위로 비교 (기준 97%)';
    const stl = hd.querySelector('#l3stl'); hd.insertBefore(b, stl);
    b.onclick = async () => {
      const old = b.textContent; b.disabled = true; b.textContent = '대조 중…';
      try { await v.ensure3D(); if (v.mode() === '2d') v.setMode('split'); const res = await compare({}); showResult(res, diffCanvas().toDataURL('image/png')); }
      catch (e) { showResult(null, null, (e && e.message) || String(e)); }
      finally { b.disabled = false; b.textContent = old; }
    };
    return true;
  }
  if (!addButtons()) { let n = 0; const t = setInterval(() => { if (addButtons() || ++n > 40) clearInterval(t); }, 500); }

  function showResult(res, img, err) {
    const v = V(); let box = v.pane.querySelector('.l2r'); if (!box) { box = document.createElement('div'); box.className = 'l2r'; (v.pane.querySelector('.v3c') || v.pane).append(box); }
    box.innerHTML = ''; box.style.display = '';
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = '닫기'; x.setAttribute('aria-label', '닫기'); x.onclick = () => { box.style.display = 'none'; }; box.append(x);
    if (err) { const e = document.createElement('div'); e.innerHTML = `<span class="f">2D 대조를 하지 못했습니다:</span> `; e.append(document.createTextNode(err)); box.append(e); return; }
    const h = document.createElement('div');
    h.innerHTML = `2D 대조 (${res.source === 'rule' ? '규칙 엔진' : 'AI 모델'}): 재현 <b>${(res.recall * 100).toFixed(1)}%</b> · 정확 <b>${(res.precision * 100).toFixed(1)}%</b> → <span class="${res.pass ? 'p' : 'f'}">${res.pass ? '통과' : '미달 (기준 97%)'}</span>`;
    box.append(h);
    if (img) { const im = document.createElement('img'); im.src = img; im.alt = '2D 대조 차이 그림'; im.onclick = () => { const w = window.open(); if (w) w.document.write(`<img src="${img}" style="max-width:100%">`); }; box.append(im); }
    if (!res.pass) {
      const d = document.createElement('div'); d.className = 'ai';
      const a = document.createElement('button'); a.className = 'btn go'; a.textContent = 'AI로 3D'; a.title = '내 Claude가 도면을 읽고 3D 코드를 쓴 뒤 2D 대조로 스스로 고칩니다 (최대 6회)';
      a.onclick = () => askAI(res); d.append(a, document.createTextNode(' 내 Claude가 3D를 만들고 대조로 스스로 고칩니다'));
      box.append(d);
    }
  }
  C2.prompt = res => `이 2D 도면으로 3D 모델을 만들어줘. mucca_guide 의 "2D → AI 3D" 절차대로, model3d_compare 재현·정확 97% 이상이 될 때까지 고쳐줘 (최대 6회).${res ? ` 지금 ${res.source === 'rule' ? '규칙 엔진' : '모델'} 대조 결과: 재현 ${(res.recall * 100).toFixed(1)}%, 정확 ${(res.precision * 100).toFixed(1)}%.` : ''}`;
  function askAI(res) {
    const aiIn = document.getElementById('aiIn'), bAi = document.getElementById('bAi'); if (!aiIn) return;
    const side = document.getElementById('side'); if (side && matchMedia('(max-width:820px)').matches) side.classList.add('open');
    aiIn.value = C2.prompt(res);
    const A = window.__aic;
    if (A && A.state === 'on' && A.claude && !A.busy && bAi) setTimeout(() => bAi.click(), 30);
    else { try { log('[AI로 3D] 요청을 오른쪽 AI 창에 옮겼습니다 → 상단 [AI 연결] 후 [그리기]를 누르세요', 'ok'); } catch (_) { } if (window.__aiChat) window.__aiChat.nudge(); aiIn.focus(); }
  }
  C2.askAI = askAI;

  /* ---------- 8) 가이드 (mucca_guide 뒤에 붙음) ---------- */
  C2.guide = `2D → AI 3D (테스트 서버 전용) — 지금 2D 도면(2면도·3면도)을 보고 3D를 만들고, 2D 대조로 스스로 고친다
 1. 도면 읽기: mucca_state · mucca_list 로 뷰 배치, 외형선·숨은선·중심선, 치수 값(치수 문자가 형상을 정한다)을 모은다. 필요하면 mucca_snapshot 으로 화면도 본다
 2. 규칙 엔진 먼저: {"cmd":"model3d_compare","source":"rule"} → pass 면 끝 (무료·즉시)
 3. 3D 코드: {"cmd":"model3d","code":"..."} — "사진 → 3D" 의 함수(box·cyl·revolve·prism·cut·union…)를 그대로 쓴다. 단위 mm, 도면 치수를 그대로 쓴다.
    방향은 자유: 대조가 뷰마다 6방향×90° 중 맞는 것을 스스로 찾는다. 권장: 정면도 가로 = X, 세로 = Z, 측면도 가로 = Y.
    부품이 여럿이면 part 를 나눠도 되고, 하나의 부품이면 part("P1","본체","body", 형상) 하나로.
 4. 대조: {"cmd":"model3d_compare"} → 결과 숫자 + 다음 mucca_snapshot 으로 차이 그림(빨강 = 빠진 선, 파랑 = 남는 선)
    뷰가 잘못 나뉘면 "views":[[x0,y0,x1,y1],...] 로 뷰 상자를 직접 주고, 도곽·표 레이어는 "skip_layers":["레이어"] 로 뺀다. 도면 배율이 1:1이 아니면 "scale":배율 또는 "auto_scale":true
 5. 빨강·파랑을 보고 코드를 고쳐 3→4를 반복 (최대 6회). 통과 기준: recall·precision 모두 0.97 이상
 6. 보고: 마지막 재현·정확, 몇 번 고쳤는지, 도면만으로 정할 수 없어 추정한 부분(두 뷰에 다 숨는 형상 등). STEP 은 3D 창의 [STEP 저장]`;
})();
