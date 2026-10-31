/* 무카 CAD 테스트 서버 — 만들기 도구 (lab 전용, 2026-10-31)
   text-to-cad(github.com/earthtojake/text-to-cad) 기능을 보고 무카 CAD 에 맞게 들여온 것.
   ① 3D → 치수 도면  : 3D 창 [도면 만들기] · 명령 {"cmd":"model3d_drawing"}
      AI 모델(model3d) 또는 규칙 엔진 3D 를 3각법(정면·평면·우측면, 숨은선 포함)으로 펼치고
      원·호를 진짜 원·호로 되살려 구멍 지름(n-Øxx)·PCD·중심선·전체 크기 치수·도곽·표제란까지 넣는다.
   ② 가공 전 점검     : [출력 ▾] › 가공 전 점검 · 명령 CUTCHECK / 가공점검 · AI {"cmd":"cut_check","thickness":3}
      레이저·워터젯·판금용 DXF 를 보내기 전에 열린 윤곽·겹친 선·아주 짧은 선·판 두께보다 작은 구멍·
      구멍 사이 얇은 살·남은 글자/치수/해치를 찾아 화면에 빨간 표시. 브라우저 안에서만 돌고 비용 0.
   ③ 3MF 저장        : 3D 창 [3MF] — 3D 프린터 슬라이서용 (단위 mm)
   lab3d.js(LAB3D)·labphoto.js(LABPHOTO) 뒤에 불러온다. 연결 프로그램(허브)은 그대로. */
(function () {
  'use strict';
  const MK = window.LABMAKE = { ver: 1 };
  const lab = () => window.LAB3D, ph = () => window.LABPHOTO;
  const V = () => { const L = lab(); if (!L || !L._v) throw new Error('3D 기능을 불러오는 중입니다. 잠시 뒤 다시 시도하세요'); return L._v(); };
  const rnd = x => Math.round(x * 1000) / 1000, D2R = Math.PI / 180;
  const fmtN = x => { const r = Math.round(x * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };

  /* ================= ① 3D → 치수 도면 ================= */
  // 3각법(KS): 정면도 = X 가로·Z 세로, 평면도 = X 가로·Y 세로(정면도 위), 우측면도 = Y 가로·Z 세로(정면도 오른쪽)
  // replicad drawProjection(s,'front') 는 (x,z) 를 그림 → 평면도·우측면도는 형상을 돌려서 같은 방식으로 투상
  const VIEWS = [
    { k: 'front', name: '정면도', rots: [] },
    { k: 'top', name: '평면도', rots: [[90, [1, 0, 0]]] },
    { k: 'right', name: '우측면도', rots: [[-90, [0, 0, 1]]] }
  ];
  async function shapeOf(src) {
    const R = await V().ensureOCC();
    const P = ph() && ph().model;
    if (src !== 'rule' && P && P.parts && P.parts.length) return { R, s: R.makeCompound(P.parts.map(p => p.shape.clone())), src: 'model' };
    if (src === 'model') throw new Error('model3d 로 만든 3D 모델이 없습니다');
    if (!lab().ruleSolid) throw new Error('규칙 엔진 3D를 꺼낼 수 없습니다');
    return { R, s: await lab().ruleSolid(), src: 'rule' };
  }
  function projectAll(R, s) {
    const toP = d => { const o = []; for (const path of d.toSVGPaths()) for (const pl of ph()._svgPolys(path)) if (pl.length > 1) o.push(pl.map(([x, y]) => [x, -y])); return o; };
    const out = {};
    for (const v of VIEWS) {
      let t = s.clone(); for (const [a, ax] of v.rots) t = t.rotate(a, [0, 0, 0], ax);
      const pr = R.drawProjection(t, 'front');
      out[v.k] = { vis: toP(pr.visible), hid: toP(pr.hidden) };
      try { t.delete(); } catch (_) { }
    }
    return out;
  }
  // 세 점으로 원
  function circ3(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-12) return null;
    const a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
    const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    return { x, y, r: Math.hypot(a[0] - x, a[1] - y) };
  }
  // 꺾은선 하나 → 선 · 호 · 원 · 꺾은선
  function classify(pl, D) {
    const n = pl.length, A = pl[0], B = pl[n - 1], closed = Math.hypot(A[0] - B[0], A[1] - B[1]) < D * 1e-6 + 1e-6;
    const ch = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (n === 2) return ch > 1e-6 ? { t: 'line', a: A, b: B } : null;
    // 곧은가
    if (!closed) { const dev = Math.max(...pl.map(q => Math.abs((q[0] - A[0]) * (B[1] - A[1]) - (q[1] - A[1]) * (B[0] - A[0])) / (ch || 1))); if (dev < Math.max(1e-4, ch * 1e-4)) return { t: 'line', a: A, b: B }; }
    if (n >= 5) {
      const m = pl[Math.floor(n / 3)], m2 = pl[Math.floor(2 * n / 3)];
      const c = closed ? circ3(A, m, m2) : circ3(A, pl[Math.floor(n / 2)], B);
      if (c && c.r < D * 5) {
        const tol = Math.max(1e-3, c.r * 2e-3);
        if (pl.every(q => Math.abs(Math.hypot(q[0] - c.x, q[1] - c.y) - c.r) < tol)) {
          if (closed) return { t: 'circle', c, r: c.r };
          // 호: 진행 방향(반시계/시계)
          const cr = (pl[1][0] - A[0]) * (pl[2][1] - pl[1][1]) - (pl[1][1] - A[1]) * (pl[2][0] - pl[1][0]);
          let a0 = Math.atan2(A[1] - c.y, A[0] - c.x) / D2R, a1 = Math.atan2(B[1] - c.y, B[0] - c.x) / D2R;
          if (cr < 0) [a0, a1] = [a1, a0];
          const sw = ((a1 - a0) % 360 + 360) % 360;
          return { t: 'arc', c, r: c.r, a0: (a0 + 360) % 360, a1: (a1 + 360) % 360, sw: sw || 360 };
        }
      }
    }
    // 꺾은선: 일직선 위 중간점 빼기
    const o = [pl[0]];
    for (let i = 1; i < n - 1; i++) { const a = o[o.length - 1], b = pl[i], d = pl[i + 1]; const cr = Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])), L = Math.hypot(d[0] - a[0], d[1] - a[1]) || 1; if (cr / L > 1e-4) o.push(b); }
    o.push(pl[n - 1]);
    if (closed && o.length > 2) o.pop();
    return { t: 'poly', pts: o, closed };
  }
  function viewGeom(P, D) {
    const key = g => g.t === 'line' ? [g.a, g.b].map(p => p.map(v => Math.round(v * 100)).join(',')).sort().join('|') : g.t + ':' + Math.round(g.c.x * 100) + ',' + Math.round(g.c.y * 100) + ',' + Math.round(g.r * 100) + (g.t === 'arc' ? ',' + Math.round(g.a0) + ',' + Math.round(g.a1) : '');
    const seen = new Set(), out = { vis: [], hid: [] };
    for (const kind of ['vis', 'hid']) for (const pl of P[kind]) {
      const g = classify(pl, D); if (!g) continue;
      if (g.t !== 'poly') { const k = key(g); if (seen.has(k)) continue; seen.add(k); }
      out[kind].push(g);
    }
    // 같은 중심·반지름 호들이 360° 를 채우면 원 하나로
    for (const kind of ['vis', 'hid']) {
      const arcs = out[kind].filter(g => g.t === 'arc'), grp = new Map();
      for (const a of arcs) { const k = Math.round(a.c.x * 50) + ',' + Math.round(a.c.y * 50) + ',' + Math.round(a.r * 50); (grp.get(k) || grp.set(k, []).get(k)).push(a); }
      for (const L of grp.values()) {
        const tot = L.reduce((s, a) => s + a.sw, 0);
        if (L.length > 1 && tot > 359) { out[kind] = out[kind].filter(g => !L.includes(g)); out[kind].push({ t: 'circle', c: L[0].c, r: L[0].r }); }
      }
    }
    // 숨은선 중 보이는 선과 겹치는 것 빼기 (원·호는 같은 것, 직선은 조각마다 — 위 면 모서리 바로 밑의 아래 면 모서리 등)
    const vk = new Set(out.vis.filter(g => g.t !== 'poly').map(key));
    const tol = Math.max(1e-3, D * 1e-5), vseg = [];
    for (const g of out.vis) { if (g.t === 'line') vseg.push([g.a, g.b]); else if (g.t === 'poly') { const P = g.closed ? g.pts.concat([g.pts[0]]) : g.pts; for (let i = 0; i + 1 < P.length; i++) vseg.push([P[i], P[i + 1]]); } }
    const onV = (p, q) => vseg.some(([a, b]) => { const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy; if (!L2) return false;
      const d = r => { const t = ((r[0] - a[0]) * vx + (r[1] - a[1]) * vy) / L2; return t >= -1e-6 && t <= 1 + 1e-6 && Math.abs((r[0] - a[0]) * vy - (r[1] - a[1]) * vx) / Math.sqrt(L2) <= tol; };
      return d(p) && d(q); });
    const hid = [];
    for (const g of out.hid) {
      if (g.t === 'circle' || g.t === 'arc') { if (!vk.has(key(g))) hid.push(g); continue; }
      const P = g.t === 'line' ? [g.a, g.b] : (g.closed ? g.pts.concat([g.pts[0]]) : g.pts);
      let run = [P[0]];
      const flush = () => { if (run.length > 1) hid.push(run.length === 2 ? { t: 'line', a: run[0], b: run[1] } : { t: 'poly', pts: run, closed: false }); };
      for (let i = 0; i + 1 < P.length; i++) { if (onV(P[i], P[i + 1])) { flush(); run = [P[i + 1]]; } else run.push(P[i + 1]); }
      flush();
    }
    out.hid = hid;
    return out;
  }
  function bbOf(G) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const P = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const g of G) {
      if (g.t === 'line') { P(...g.a); P(...g.b); }
      else if (g.t === 'poly') for (const q of g.pts) P(...q);
      else if (g.t === 'circle') { P(g.c.x - g.r, g.c.y - g.r); P(g.c.x + g.r, g.c.y + g.r); }
      else if (g.t === 'arc') { const pts = [g.a0, g.a1]; for (let a = 0; a < 360; a += 90) { const s = ((a - g.a0) % 360 + 360) % 360; if (s <= g.sw) pts.push(a); } for (const a of pts) P(g.c.x + g.r * Math.cos(a * D2R), g.c.y + g.r * Math.sin(a * D2R)); }
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  // 같은 지름 구멍 무리 → 개수, PCD(같은 원 위에 고르게 있으면)
  function holeGroups(G) {
    const cs = G.filter(g => g.t === 'circle'), m = new Map();
    for (const c of cs) { const k = Math.round(c.r * 20); (m.get(k) || m.set(k, []).get(k)).push(c); }
    const out = [];
    for (const L of m.values()) {
      const g = { d: L[0].r * 2, list: L, n: L.length, pcd: null };
      if (L.length >= 3) {
        // 구멍 중심 셋(서로 가장 먼 쪽)으로 원을 잡고 모든 중심이 그 원 위에 있는지 (일부가 가려져 빠져도 PCD 를 찾음)
        const C = L.map(c => [c.c.x, c.c.y]), a0 = C[0], a1 = C.reduce((m, p) => Math.hypot(p[0] - a0[0], p[1] - a0[1]) > Math.hypot(m[0] - a0[0], m[1] - a0[1]) ? p : m, C[1]);
        const a2 = C.reduce((m, p) => { const f = q => Math.min(Math.hypot(q[0] - a0[0], q[1] - a0[1]), Math.hypot(q[0] - a1[0], q[1] - a1[1])); return f(p) > f(m) ? p : m; }, C[1]);
        const cc = circ3(a0, a1, a2);
        if (cc && cc.r > g.d && C.every(p => Math.abs(Math.hypot(p[0] - cc.x, p[1] - cc.y) - cc.r) < Math.max(0.05, cc.r * 0.005))) g.pcd = { x: cc.x, y: cc.y, d: cc.r * 2 };
      }
      out.push(g);
    }
    return out.sort((a, b) => b.d - a.d);
  }
  async function makeDrawing(c) {
    c = c || {};
    const t0 = performance.now();
    const { R, s, src } = await shapeOf(c.source);
    let PR; try { PR = projectAll(R, s); } finally { try { s.delete(); } catch (_) { } }
    const all = Object.values(PR).flatMap(p => p.vis.concat(p.hid)).flat();
    if (!all.length) throw new Error('3D 모델을 투상했지만 선이 없습니다');
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]), D = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 100;
    const G = {}, B = {};
    for (const v of VIEWS) { G[v.k] = viewGeom(PR[v.k], D); B[v.k] = bbOf(G[v.k].vis.concat(G[v.k].hid)); }
    const big = Math.max(...VIEWS.map(v => Math.max(B[v.k].w, B[v.k].h))), TH = Math.max(2.5, Math.round(big / 45 * 2) / 2), sp = Math.max(TH * 3, big * 0.06);
    const gap = Math.max(TH * 12, big * 0.35);
    // 기준점: 지금 도면 오른쪽 빈 곳 (도면이 비어 있으면 0,0)
    let at = c.at; if (!at) { const bb = doc.entities.length ? bbox() : null; at = bb ? [Math.ceil((bb.maxX + gap * 2) / 10) * 10, Math.round(bb.minY / 10) * 10] : [0, 0]; }
    const F = B.front, off = {
      front: [at[0] - F.x0, at[1] - F.y0],
      top: [at[0] - B.top.x0 + (F.w - B.top.w) / 2, at[1] + F.h + gap - B.top.y0],
      right: [at[0] + F.w + gap - B.right.x0, at[1] - B.right.y0 + (F.h - B.right.h) / 2]
    };
    // 3각법 정렬: 평면도 X 는 정면도 X 와 같게, 우측면도 Z 는 정면도 Z 와 같게
    off.top[0] = off.front[0]; off.right[1] = off.front[1];
    const cmds = [], dims = [], P2 = (p, o) => [rnd(p[0] + o[0]), rnd(p[1] + o[1])], PC = (cc, o) => [rnd(cc.x + o[0]), rnd(cc.y + o[1])];
    cmds.push({ cmd: 'layer', name: '외형선', current: false }, { cmd: 'layer', name: '숨은선', current: false }, { cmd: 'layer', name: '중심선', current: false }, { cmd: 'layer', name: '치수', current: false });
    cmds.push({ cmd: 'dimstyle', name: '3D도면', from: 'ISO-25', txt: TH, dec: 1, asz: Math.max(2.5, Math.round(TH * 0.8)), current: false });
    const put = (g, o, layer) => {
      if (g.t === 'line') cmds.push({ cmd: 'line', from: P2(g.a, o), to: P2(g.b, o), layer });
      else if (g.t === 'circle') cmds.push({ cmd: 'circle', center: PC(g.c, o), r: rnd(g.r), layer });
      else if (g.t === 'arc') cmds.push({ cmd: 'arc', center: PC(g.c, o), r: rnd(g.r), start: rnd(g.a0), end: rnd(g.a1), layer });
      else cmds.push({ cmd: 'polyline', points: g.pts.map(p => P2(p, o)), closed: g.closed, layer });
    };
    const stat = { lines: 0, circles: 0, arcs: 0, polys: 0, holes: [], pcd: [] };
    let frame = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x0, y0, x1, y1) => { frame.x0 = Math.min(frame.x0, x0); frame.y0 = Math.min(frame.y0, y0); frame.x1 = Math.max(frame.x1, x1); frame.y1 = Math.max(frame.y1, y1); };
    for (const v of VIEWS) {
      const g = G[v.k], o = off[v.k], b = B[v.k];
      if (c.hidden !== false) for (const e of g.hid) put(e, o, '숨은선');
      for (const e of g.vis) { put(e, o, '외형선'); stat[{ line: 'lines', circle: 'circles', arc: 'arcs', poly: 'polys' }[e.t]]++; }
      const x0 = b.x0 + o[0], y0 = b.y0 + o[1], x1 = b.x1 + o[0], y1 = b.y1 + o[1];
      grow(x0 - sp * 2.5, y0 - sp * 2.5 - TH * 3, x1 + sp, y1 + sp);
      // 중심선 (원마다 십자)
      if (c.centerlines !== false) for (const e of g.vis.filter(e => e.t === 'circle').slice(0, 300)) { const q = PC(e.c, o), L = e.r * 1.25 + TH * 0.6; cmds.push({ cmd: 'line', from: [rnd(q[0] - L), q[1]], to: [rnd(q[0] + L), q[1]], layer: '중심선' }, { cmd: 'line', from: [q[0], rnd(q[1] - L)], to: [q[0], rnd(q[1] + L)], layer: '중심선' }); }
      if (c.dims === false) continue;
      // 전체 크기: 정면도 = 가로(아래)·높이(왼쪽), 평면도 = 깊이(왼쪽), 우측면도 = 깊이(아래)
      if (v.k === 'front' || v.k === 'right') dims.push({ cmd: 'dim_linear', p1: [rnd(x0), rnd(y0)], p2: [rnd(x1), rnd(y0)], at: [rnd((x0 + x1) / 2), rnd(y0 - sp * 1.6)], dir: 'h', layer: '치수', style: '3D도면' });
      if (v.k === 'front' || v.k === 'top') dims.push({ cmd: 'dim_linear', p1: [rnd(x0), rnd(y0)], p2: [rnd(x0), rnd(y1)], at: [rnd(x0 - sp * 1.6), rnd((y0 + y1) / 2)], dir: 'v', layer: '치수', style: '3D도면' });
      // 구멍: 같은 지름끼리 하나에만 n-Ø 치수, 고르게 놓인 3개 이상이면 PCD
      const hg = holeGroups(g.vis).slice(0, c.max_holes || 8);
      for (const h of hg) {
        const tip = h.list.slice().sort((p, q) => (q.c.x + q.c.y) - (p.c.x + p.c.y))[0];
        dims.push({ cmd: 'dim_diameter', center: PC(tip.c, o), r: rnd(tip.r), angle: 45, text: h.n > 1 ? `${h.n}-Ø${fmtN(h.d)}` : undefined, layer: '치수', style: '3D도면' });
        stat.holes.push({ view: v.name, d: +fmtN(h.d), n: h.n });
        if (h.pcd && !g.vis.some(e => e.t === 'circle' && Math.abs(e.r * 2 - h.pcd.d) < 0.05 && Math.hypot(e.c.x - h.pcd.x, e.c.y - h.pcd.y) < 0.05)) {
          const q = PC(h.pcd, o); cmds.push({ cmd: 'circle', center: q, r: rnd(h.pcd.d / 2), layer: '중심선' });
          dims.push({ cmd: 'dim_diameter', center: q, r: rnd(h.pcd.d / 2), angle: 135, text: `PCD Ø${fmtN(h.pcd.d)}`, layer: '치수', style: '3D도면' });
          stat.pcd.push({ view: v.name, d: +fmtN(h.pcd.d), n: h.n });
        }
      }
      if (c.titles !== false) cmds.push({ cmd: 'text', at: [rnd((x0 + x1) / 2), rnd(y0 - sp * 2.5 - TH * 1.5)], text: v.name, h: rnd(TH * 1.3), layer: '문자', align: 'center' });
    }
    // 도곽 + 표제란
    const m = Math.max(TH * 4, big * 0.08), TBH = TH * 9, TBW = Math.max(TH * 48, (frame.x1 - frame.x0) * 0.4);
    let fx0 = frame.x0 - m, fy0 = frame.y0 - m - TBH, fx1 = Math.max(frame.x1 + m, fx0 + TBW + m), fy1 = frame.y1 + m;
    if (c.frame !== false) {
      cmds.push({ cmd: 'polyline', points: [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]].map(p => p.map(rnd)), closed: true, layer: '외형선' });
      const tx0 = fx1 - TBW, ty1 = fy0 + TBH, rowH = TBH / 4;
      cmds.push({ cmd: 'polyline', points: [[tx0, fy0], [fx1, fy0], [fx1, ty1], [tx0, ty1]].map(p => p.map(rnd)), closed: true, layer: '외형선' });
      for (let i = 1; i < 4; i++) cmds.push({ cmd: 'line', from: [rnd(tx0), rnd(fy0 + rowH * i)], to: [rnd(fx1), rnd(fy0 + rowH * i)], layer: '외형선' });
      const name = String(c.title || (src === 'model' && ph().model && ph().model.parts[0] && ph().model.parts[0].name) || (typeof window.__docName === 'string' && window.__docName) || '3D 모델').slice(0, 40);
      const d = new Date(), ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const rows = [`도면명: ${name}`, `3각법 · 단위 mm · 척도 1:1 · ${ds}`, `원본: ${src === 'model' ? 'AI 3D 모델(model3d)' : '규칙 엔진 3D'} → 2D 자동 도면`, '무카 CAD 테스트 서버 · 치수는 확인 후 사용'];
      rows.forEach((t, i) => cmds.push({ cmd: 'text', at: [rnd(tx0 + TH), rnd(ty1 - rowH * (i + 1) + (rowH - TH) / 2)], text: t, h: rnd(i ? TH * 0.9 : TH * 1.1), layer: '문자' }));
    }
    const r = runBatch(cmds.concat(dims), { label: '3D → 도면' });
    const errs = (r.errors || []).concat((r.results || []).filter(x => x && x.ok === false).map(x => x.error));
    try { zoomBox(fx0, fy0, fx1, fy1); } catch (_) { }
    const res = { ok: !errs.length, source: src, views: VIEWS.map(v => ({ name: v.name, w: +fmtN(B[v.k].w), h: +fmtN(B[v.k].h) })), lines: stat.lines, circles: stat.circles, arcs: stat.arcs, polylines: stat.polys, holes: stat.holes, pcd: stat.pcd, dims: dims.length, frame: [rnd(fx0), rnd(fy0), rnd(fx1), rnd(fy1)], ms: Math.round(performance.now() - t0) };
    if (errs.length) res.errors = errs.slice(0, 5);
    MK.lastDrawing = res;
    return res;
  }
  MK.makeDrawing = makeDrawing;
  const sizeTxt = res => { const f = res.views[0], t = res.views[1]; return `${f.w} × ${t.h} × ${f.h}`; };
  const summary = res => `3D → 도면: 3각법 3면도 · 크기 ${sizeTxt(res)} mm · 선 ${res.lines} · 원 ${res.circles} · 호 ${res.arcs}${res.holes.length ? ' · 원 지름 ' + res.holes.map(h => `${h.view} ${h.n > 1 ? h.n + '-' : ''}Ø${h.d}`).join(', ') : ''}${res.pcd.length ? ' · PCD ' + res.pcd.map(p => 'Ø' + p.d).join(', ') : ''} · 치수 ${res.dims}개 (${(res.ms / 1000).toFixed(1)}초)`;
  if (ph() && ph().addCmd) ph().addCmd('model3d_drawing', async c => { const r = await makeDrawing(c); return r; });

  /* ================= ③ 3MF 저장 ================= */
  function zipFiles(files) {   // 무압축 zip (여러 파일)
    const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
    for (const f of files) {
      const nb = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      parts.push(lh, nb, data); cd.push(ch, nb); off += 30 + nb.length + data.length;
    }
    const cdSize = cd.reduce((s, x) => s + (x.byteLength), 0), en = new DataView(new ArrayBuffer(22));
    en.setUint32(0, 0x06054b50, true); en.setUint16(8, files.length, true); en.setUint16(10, files.length, true); en.setUint32(12, cdSize, true); en.setUint32(16, off, true);
    return new Blob([...parts, ...cd, en], { type: 'model/3mf' });
  }
  function make3MF(root, T) {
    const vmap = new Map(), verts = [], tris = [], k = v => Math.round(v * 1e4);
    const id = (x, y, z) => { const key = k(x) + ',' + k(y) + ',' + k(z); let i = vmap.get(key); if (i == null) { i = verts.length; vmap.set(key, i); verts.push([x, y, z]); } return i; };
    root.updateMatrixWorld(true); const rootInv = T ? new T.Matrix4().copy(root.matrixWorld).invert() : null; const L3 = window.LAB3D, yUp = !!(L3 && L3.ext && L3.ext.yUp);   // 화면용 돌림·가운데 맞춤은 빼고 모델 좌표(mm, Z 위)로
    root.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, p = g.attributes.position, m = (T ? new T.Matrix4().multiplyMatrices(rootInv, o.matrixWorld) : o.matrixWorld).elements;
      const W = i => { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], Z = m[2] * x + m[6] * y + m[10] * z + m[14]; return yUp ? [X, -Z, Y] : [X, Y, Z]; };   // 사진·AI 모델은 Y 위로 넣어져 있음 → Z 위로 되돌림 (규칙 엔진 3D 는 이미 Z 위)
      for (let i = 0; i + 2 < p.count; i += 3) { const a = id(...W(i)), b = id(...W(i + 1)), c = id(...W(i + 2)); if (a !== b && b !== c && a !== c) tris.push([a, b, c]); }
    });
    if (!tris.length) throw new Error('3D 모양이 없습니다');
    const f = v => (Math.round(v * 1e4) / 1e4).toString();
    const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="ko-KR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n <metadata name="Application">Mucca CAD (cowsdelete.com)</metadata>\n <resources>\n  <object id="1" type="model">\n   <mesh>\n    <vertices>\n${verts.map(v => `     <vertex x="${f(v[0])}" y="${f(v[1])}" z="${f(v[2])}"/>`).join('\n')}\n    </vertices>\n    <triangles>\n${tris.map(t => `     <triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`).join('\n')}\n    </triangles>\n   </mesh>\n  </object>\n </resources>\n <build>\n  <item objectid="1"/>\n </build>\n</model>\n`;
    const ct = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n`;
    const rels = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n`;
    return { blob: zipFiles([{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: rels }, { name: '3D/3dmodel.model', data: model }]), verts: verts.length, tris: tris.length };
  }
  MK.make3MF = make3MF;

  /* 3D 창 버튼: [도면 만들기] · [3MF] */
  function addButtons() {
    const L = lab(); if (!L || !L._v) return false; const v = L._v(); const hd = v.pane && v.pane.querySelector('.v3h'); if (!hd) return false; if (hd.querySelector('#l3draw')) return true;
    const stl = hd.querySelector('#l3stl');
    const b = document.createElement('button'); b.className = 'btn'; b.id = 'l3draw'; b.textContent = '도면 만들기'; b.title = '3D를 3각법(정면·평면·우측면) 2D 도면으로 — 숨은선·구멍 n-Ø·PCD·중심선·전체 치수·도곽 (도면 오른쪽 빈 곳에 그림)';
    b.onclick = async () => {
      const old = b.textContent; b.disabled = true; b.textContent = '도면 만드는 중…';
      try { await v.ensure3D(); const res = await makeDrawing({}); log(summary(res), res.ok ? 'ok' : 'err'); if (res.errors) log('일부 명령 오류: ' + res.errors.join(' / '), 'err'); if (v.mode() === '3d') v.setMode('split'); }
      catch (e) { log('도면을 만들지 못했습니다: ' + ((e && e.message) || e), 'err'); }
      finally { b.disabled = false; b.textContent = old; }
    };
    const m = document.createElement('button'); m.className = 'btn'; m.id = 'l33mf'; m.textContent = '3MF'; m.title = '3D 프린터 슬라이서용 3MF 파일 (단위 mm)';
    m.onclick = async () => {
      try { await v.ensure3D(); const vv = V(), r = make3MF(vv.root, vv.T); MK.last3MF = r; if (!lab().noDownload) v.download(r.blob, v.baseName() + '.3mf'); log(`3MF 저장: 꼭짓점 ${r.verts.toLocaleString('ko-KR')}개 · 삼각형 ${r.tris.toLocaleString('ko-KR')}개 (${(r.blob.size / 1024).toFixed(0)}KB)`, 'ok'); }
      catch (e) { log('3MF를 만들지 못했습니다: ' + ((e && e.message) || e), 'err'); }
    };
    if (stl) { stl.before(b); stl.after(m); } else hd.append(b, m);
    return true;
  }
  if (!addButtons()) { let n = 0; const t = setInterval(() => { if (addButtons() || ++n > 60) clearInterval(t); }, 500); }

  /* ================= ② 가공 전 점검 ================= */
  const CUT_SKIP_LAYERS = /^(치수|문자|중심선|숨은선|defpoints|dim|text|center)/i;
  let MARK = [];   // 화면 표시 [{x,y,kind}]
  const KINDS = {
    open: { t: '열린 윤곽(끊긴 끝)', c: '#ff5252', tip: '레이저는 닫힌 윤곽만 오려냅니다. 끝점을 이어 주세요 (JOIN · 연장 EX · 모깎기 F 0)' },
    dup: { t: '겹친 선·원', c: '#ff9f40', tip: '같은 자리를 두 번 자르면 그을음·과열. OVERKILL(중복 제거)로 지우세요' },
    short: { t: '아주 짧은 선', c: '#ffd166', tip: '0.2mm 보다 짧은 조각은 대부분 잘못 그린 것. 지우거나 이어 주세요' },
    hole: { t: '판 두께보다 작은 구멍', c: '#4dabf7', tip: '레이저·플라즈마는 보통 구멍 지름 ≥ 판 두께. 더 작으면 드릴 가공으로 표시하세요' },
    web: { t: '구멍 사이 살이 얇음', c: '#b197fc', tip: '구멍과 구멍 사이 살이 판 두께보다 얇으면 휘거나 녹아 붙습니다' },
    note: { t: '자르지 않을 글자·치수·해치', c: '#adb5bd', tip: '가공용 DXF 에서는 빼거나 별도 도면층으로 옮기세요(업체가 선으로 잘라 버릴 수 있음)' }
  };
  function cutCheck(opt) {
    opt = opt || {};
    const T = +opt.thickness > 0 ? +opt.thickness : 3, minLen = +opt.min_len > 0 ? +opt.min_len : 0.2, tol = +opt.tol > 0 ? +opt.tol : 0.01;
    const ents = flatEnts(visibleEnts());
    const issues = [], add = (kind, x, y, info) => issues.push({ kind, x: rnd(x), y: rnd(y), info });
    const cut = [], notes = { text: 0, dim: 0, hatch: 0, other: 0 };
    for (const e of ents) {
      if (e.type === 'text' || e.type === 'mtext' || e.type === 'attdef') { notes.text++; continue; }
      if (e.type === 'dim') { notes.dim++; continue; }
      if (e.type === 'hatch') { notes.hatch++; continue; }
      if (CUT_SKIP_LAYERS.test(String(e.layer || ''))) continue;
      if (['line', 'arc', 'circle', 'polyline', 'ellipse', 'spline'].includes(e.type)) cut.push(e); else notes.other++;
    }
    // 끝점 그래프 (열린 끝 찾기)
    const ends = [], segs = [];
    const P = (c, r, a) => ({ x: c.x + r * Math.cos(a * D2R), y: c.y + r * Math.sin(a * D2R) });
    for (const e of cut) {
      if (e.type === 'line') { ends.push(e.a, e.b); segs.push({ a: e.a, b: e.b, e }); }
      else if (e.type === 'arc') { const a = P(e.c, e.r, e.a0), b = P(e.c, e.r, e.a1); ends.push(a, b); const sw = ((e.a1 - e.a0) % 360 + 360) % 360 || 360; if (e.r * sw * D2R < minLen) add('short', a.x, a.y, `호 길이 ${(e.r * sw * D2R).toFixed(3)}mm`); }
      else if (e.type === 'polyline' && e.pts && e.pts.length > 1) {
        const n = e.pts.length, closed = e.closed || Math.hypot(e.pts[0].x - e.pts[n - 1].x, e.pts[0].y - e.pts[n - 1].y) < tol;
        if (!closed) ends.push(e.pts[0], e.pts[n - 1]);
        const bu = e.b || [];
        for (let i = 0; i < n - 1 + (e.closed ? 1 : 0); i++) { const a = e.pts[i], b = e.pts[(i + 1) % n]; if (!(Math.abs(+bu[i] || 0) > 1e-9)) segs.push({ a, b, e }); else if (Math.hypot(b.x - a.x, b.y - a.y) < minLen) add('short', a.x, a.y, '폴리선 호 조각'); }
      }
      else if (e.type === 'spline' && e.pts && e.pts.length > 1 && !e.closed) ends.push(e.pts[0], e.pts[e.pts.length - 1]);
    }
    // 짧은 선
    for (const s of segs) { const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y); if (L < minLen) add('short', (s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2, `길이 ${L.toFixed(3)}mm`); }
    // 열린 끝: 다른 끝점과 tol 안에서 만나지 않는 끝
    const cell = Math.max(tol * 4, 1e-6), grid = new Map(), gk = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
    ends.forEach((p, i) => { const k = gk(p.x, p.y); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
    const lone = [];
    ends.forEach((p, i) => {
      const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell); let deg = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = grid.get((gx + a) + ',' + (gy + b)); if (L) for (const j of L) if (j !== i && Math.hypot(ends[j].x - p.x, ends[j].y - p.y) <= tol) deg++; }
      if (!deg) lone.push(p);
    });
    // 끝점이 다른 선의 중간에 닿아 있으면(T자) 열린 끝이 아님 → 근처 선분과 거리로 한 번 더 거름
    const onSeg = p => segs.some(s => { if ((s.a === p) || (s.b === p)) return false; const vx = s.b.x - s.a.x, vy = s.b.y - s.a.y, L2 = vx * vx + vy * vy; if (!L2) return false; let t = ((p.x - s.a.x) * vx + (p.y - s.a.y) * vy) / L2; if (t < -1e-9 || t > 1 + 1e-9) return false; return Math.hypot(s.a.x + t * vx - p.x, s.a.y + t * vy - p.y) <= tol; })
      || cut.some(e => (e.type === 'circle' || e.type === 'arc') && Math.abs(Math.hypot(p.x - e.c.x, p.y - e.c.y) - e.r) <= tol && !(e.type === 'arc' && (Math.hypot(P(e.c, e.r, e.a0).x - p.x, P(e.c, e.r, e.a0).y - p.y) <= tol || Math.hypot(P(e.c, e.r, e.a1).x - p.x, P(e.c, e.r, e.a1).y - p.y) <= tol)));
    for (const p of lone) if (!(lone.length < 400 && segs.length < 20000 && onSeg(p))) add('open', p.x, p.y, '이어지지 않은 끝');
    // 겹친 선 (같은 직선 위에서 구간이 겹침)
    const lineKey = new Map();
    for (const s of segs) {
      let dx = s.b.x - s.a.x, dy = s.b.y - s.a.y; const L = Math.hypot(dx, dy); if (L < 1e-9) continue; dx /= L; dy /= L; if (dx < -1e-9 || (Math.abs(dx) < 1e-9 && dy < 0)) { dx = -dx; dy = -dy; }
      const ang = Math.round(Math.atan2(dy, dx) / D2R * 1000), dist = Math.round((s.a.x * dy - s.a.y * dx) / tol), k = ang + ':' + dist;
      const t0 = s.a.x * dx + s.a.y * dy, t1 = s.b.x * dx + s.b.y * dy;
      (lineKey.get(k) || lineKey.set(k, []).get(k)).push({ lo: Math.min(t0, t1), hi: Math.max(t0, t1), s });
    }
    for (const L of lineKey.values()) {
      if (L.length < 2) continue; L.sort((p, q) => p.lo - q.lo);
      let cur = L[0];
      for (let i = 1; i < L.length; i++) { const q = L[i]; if (q.lo < cur.hi - tol) { const m = (q.lo + Math.min(q.hi, cur.hi)) / 2, s = q.s, dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, LL = Math.hypot(dx, dy) || 1, t = (m - (s.a.x * dx + s.a.y * dy) / LL) / LL; add('dup', s.a.x + dx * t, s.a.y + dy * t, `겹친 길이 ${(Math.min(q.hi, cur.hi) - q.lo).toFixed(2)}mm`); } if (q.hi > cur.hi) cur = q; }
    }
    // 같은 원·호 두 번
    const ck = new Map();
    for (const e of cut) if (e.type === 'circle' || e.type === 'arc') { const k = e.type + Math.round(e.c.x / tol) + ',' + Math.round(e.c.y / tol) + ',' + Math.round(e.r / tol) + (e.type === 'arc' ? ',' + Math.round(e.a0) + ',' + Math.round(e.a1) : ''); if (ck.has(k)) add('dup', e.c.x + e.r, e.c.y, `같은 ${e.type === 'circle' ? '원' : '호'} R${fmtN(e.r)}`); else ck.set(k, e); }
    // 작은 구멍 · 얇은 살
    const circles = cut.filter(e => e.type === 'circle');
    for (const e of circles) if (e.r * 2 < T - 1e-9) add('hole', e.c.x, e.c.y, `Ø${fmtN(e.r * 2)} < 판 두께 ${T}`);
    if (circles.length < 3000) for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i], b = circles[j], d = Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y), web = d - a.r - b.r;
      if (web > tol && web < T - 1e-9 && d > Math.abs(a.r - b.r)) add('web', (a.c.x + b.c.x) / 2, (a.c.y + b.c.y) / 2, `살 ${web.toFixed(2)}mm < 판 두께 ${T}`);
    }
    if (notes.text + notes.dim + notes.hatch) { const bb = bbox(); add('note', bb ? bb.minX : 0, bb ? bb.maxY : 0, `글자 ${notes.text} · 치수 ${notes.dim} · 해치 ${notes.hatch}`); }
    const count = {}; for (const k of Object.keys(KINDS)) count[k] = issues.filter(x => x.kind === k).length;
    const real = issues.filter(x => x.kind !== 'note').length;
    const res = { ok: real === 0, thickness: T, min_len: minLen, tol, checked: cut.length, count, notes, issues: issues.slice(0, 500), truncated: issues.length > 500 };
    MK.lastCut = res;
    return res;
  }
  MK.cutCheck = cutCheck;
  // 화면 표시: 그리기 뒤에 원 표시
  const _render = render;
  render = function () {
    _render.apply(this, arguments);
    if (!MARK.length) return;
    try {
      const c = ctx2; c.save(); c.setTransform(DPR, 0, 0, DPR, 0, 0); c.lineWidth = 2; c.setLineDash([]);
      for (const m of MARK.slice(0, 2000)) { const q = S(m); c.strokeStyle = KINDS[m.kind].c; c.beginPath(); c.arc(q.x, q.y, 9, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(q.x - 13, q.y); c.lineTo(q.x - 9, q.y); c.moveTo(q.x + 9, q.y); c.lineTo(q.x + 13, q.y); c.stroke(); }
      c.restore();
    } catch (_) { }
  };
  const showMarks = list => { MARK = list.filter(x => x.kind !== 'note'); dirty = true; };
  MK.clearMarks = () => { MARK = []; dirty = true; };
  const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { } };
  function openCutDlg() {
    const wrap = document.createElement('div'); wrap.className = 'cutDlg';
    const row = document.createElement('div'); row.className = 'cutRow';
    row.innerHTML = '<label>판 두께 <input id="cutT" type="number" min="0.1" step="0.1" style="width:70px"> mm</label> <label>짧은 선 기준 <input id="cutL" type="number" min="0.01" step="0.05" style="width:70px"> mm</label> ';
    const run = document.createElement('button'); run.className = 'tbtn primary'; run.textContent = '점검'; row.append(run);
    const out = document.createElement('div'); out.className = 'cutOut';
    const hint = document.createElement('p'); hint.className = 'cutHint'; hint.textContent = '레이저·워터젯·판금 업체에 DXF 를 보내기 전에, 보이는 도면층의 선을 검사합니다(치수·문자·중심선·숨은선 도면층은 자르지 않는 것으로 봄). 빨간 표시를 누르면 그 자리로 갑니다.';
    wrap.append(hint, row, out);
    const clr = document.createElement('button'); clr.className = 'tbtn'; clr.textContent = '표시 지우기'; clr.onclick = () => { MK.clearMarks(); };
    const dlg = modal('가공 전 점검 — 레이저·판금 DXF', [wrap], [clr]);
    dlg.classList.add('cutModal');
    const iT = wrap.querySelector('#cutT'), iL = wrap.querySelector('#cutL');
    iT.value = lsGet('muccacad.cutT', '3'); iL.value = lsGet('muccacad.cutL', '0.2');
    const go = () => {
      lsSet('muccacad.cutT', iT.value); lsSet('muccacad.cutL', iL.value);
      const res = cutCheck({ thickness: +iT.value, min_len: +iL.value }); showMarks(res.issues); render(); out.innerHTML = '';
      const h = document.createElement('div'); h.className = 'cutSum';
      const real = res.issues.filter(x => x.kind !== 'note').length;
      h.innerHTML = real ? `<b style="color:#ff7b72">문제 ${real}곳</b> · 검사한 선 ${res.checked}개` : `<b style="color:#5bd68a">문제 없음</b> · 검사한 선 ${res.checked}개`;
      out.append(h);
      for (const [k, K] of Object.entries(KINDS)) {
        const L = res.issues.filter(x => x.kind === k); if (!L.length) continue;
        const sec = document.createElement('details'); sec.open = k !== 'note' && L.length <= 20;
        const sm = document.createElement('summary'); sm.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${K.c};margin-right:6px"></span>${K.t} <b>${k === 'note' ? '' : L.length}</b>`; sec.append(sm);
        const tip = document.createElement('div'); tip.className = 'cutTip'; tip.textContent = K.tip; sec.append(tip);
        const ul = document.createElement('ul');
        for (const x of L.slice(0, 50)) { const li = document.createElement('li'); const a = document.createElement('button'); a.className = 'cutGo'; a.textContent = `${x.info} (${fmtN(x.x)}, ${fmtN(x.y)})`; a.onclick = () => { const s = Math.max(5, T0() * 6); zoomBox(x.x - s, x.y - s, x.x + s, x.y + s); }; li.append(a); ul.append(li); }
        if (L.length > 50) { const li = document.createElement('li'); li.textContent = `… 외 ${L.length - 50}곳`; ul.append(li); }
        sec.append(ul); out.append(sec);
      }
      log(`가공 전 점검 (판 두께 ${res.thickness}mm): ${real ? Object.entries(res.count).filter(([k, n]) => n && k !== 'note').map(([k, n]) => `${KINDS[k].t} ${n}`).join(' · ') : '문제 없음'}${res.count.note ? ' · ' + res.issues.find(x => x.kind === 'note').info : ''}`, real ? 'err' : 'ok');
    };
    const T0 = () => +iT.value || 3;
    run.onclick = go; iT.onkeydown = iL.onkeydown = e => { if (e.key === 'Enter') go(); };
    go();
  }
  MK.openCutDlg = openCutDlg;
  const st = document.createElement('style');
  st.textContent = `.modal.cutModal{background:none;pointer-events:none;place-items:start end;padding:0}.cutModal .sheet{pointer-events:auto;max-width:440px;width:min(440px,calc(100% - 16px));margin:8px;max-height:calc(100% - 16px);box-shadow:0 8px 24px rgba(0,0,0,.5)}.cutModal .sheet .body{overflow:auto}.cutDlg{font-size:13px;line-height:1.5}.cutHint{margin:0 0 8px;color:var(--ink-dim,#9aa4b5)}.cutRow{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px}.cutRow input{background:#1b1f27;color:var(--ink,#e8eaed);border:1px solid #444c58;border-radius:4px;padding:3px 6px}
.cutOut details{margin:6px 0;border:1px solid #39465c;border-radius:6px;padding:4px 8px}.cutOut summary{cursor:pointer}.cutTip{color:var(--ink-dim,#9aa4b5);font-size:12px;margin:4px 0}.cutOut ul{margin:2px 0 4px 16px;padding:0}.cutGo{background:none;border:0;color:#8ab4f8;cursor:pointer;padding:1px 0;font:inherit;text-align:left}.cutGo:hover{text-decoration:underline}.cutSum{margin:4px 0 6px}`;
  document.head.appendChild(st);
  // 명령·메뉴·AI 명령
  try {
    TOOLS.cutcheck = () => { openCutDlg(); return null; };
    Object.assign(ALIAS, { CUTCHECK: 'cutcheck', DFM: 'cutcheck', LASERCHECK: 'cutcheck' });
    try { CMD_KO.cutcheck = '가공 전 점검'; } catch (_) { }
    try { Object.assign(KO_CMD, { 가공점검: 'cutcheck', 가공전점검: 'cutcheck', 레이저점검: 'cutcheck', 판금점검: 'cutcheck' }); } catch (_) { }
    COMMANDS.cut_check = c => { const r = cutCheck(c); showMarks(r.issues); return r; };
  } catch (e) { console.warn('labmake cutcheck', e); }
  function addMenu() {
    const m = document.getElementById('outMenu'); if (!m) return false; if (m.querySelector('#miCut')) return true;
    const mi = document.createElement('button'); mi.id = 'miCut'; mi.setAttribute('role', 'menuitem'); mi.tabIndex = -1;
    const l = document.createElement('span'); l.textContent = '가공 전 점검 (레이저·판금)'; const k = document.createElement('span'); k.className = 'k'; k.textContent = 'CUTCHECK'; mi.append(l, k);
    mi.onclick = () => { m.hidden = true; const b = document.getElementById('bOut'); if (b) b.setAttribute('aria-expanded', 'false'); openCutDlg(); };
    const dxf = m.querySelector('#miDxf'); if (dxf) dxf.before(mi); else m.append(mi);
    return true;
  }
  if (!addMenu()) { let n = 0; const t = setInterval(() => { if (addMenu() || ++n > 40) clearInterval(t); }, 500); }

  /* 가이드 (mucca_guide 뒤에 붙음) */
  MK.guide = `3D → 2D 도면 · 가공 전 점검 (테스트 서버 전용)
 · {"cmd":"model3d_drawing"} — 지금 3D(AI 모델 model3d, 없으면 규칙 엔진)를 3각법 3면도(정면=X·Z, 평면=X·Y, 우측면=Y·Z)로 펼쳐 도면 오른쪽 빈 곳에 그림. 원·호 복원, 숨은선, 구멍 n-Ø, PCD, 중심선, 전체 크기 치수, 도곽·표제란. 옵션: "source":"model"|"rule", "hidden":false, "dims":false, "frame":false, "title":"도면명", "at":[x,y]
 · {"cmd":"cut_check","thickness":판두께mm} (일반 그리기 명령) — 레이저·판금 DXF 점검: 열린 끝·겹친 선·0.2mm 미만 선·판 두께보다 작은 구멍·얇은 살·남은 글자/치수/해치. 결과 issues 의 x,y 로 위치 확인`;
  try {
    const _g = window.LAB2D; if (_g && typeof _g.guide === 'string' && !_g.guide.includes('model3d_drawing')) _g.guide += '\n\n' + MK.guide;
  } catch (_) { }
})();
