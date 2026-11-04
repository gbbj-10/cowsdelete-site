/* 무카 CAD AI 팀 실험판 — 형상 치수 뽑기 (GEODIM) 계산 부분 (3회차 개발1, 2026-11-04)
   window.GEODIM = { extract(opts) }  +  AI 명령 {"cmd":"geo_dims","ids":[...]?,"attach":false}
   치수 객체가 없어도 선·원·호·폴리선·타원을 재서 뷰별 크기, 구멍 묶음(n-Ød), PCD, 간격을 뽑는다.
   규칙(시작 회의 조건 1~5):
   1 블록 배율이 가로·세로 다르면 그 안의 원은 원이 아니라 ellipses(why '블록 배율'). 꺼진·얼린 도면층은 블록 안에서도 뺌
   2 중심선·숨은선 = 선 종류(center·hidden·dash·phantom·dot·iso…) 또는 도면층 이름(중심·숨은·center·hidden) → skipped.aux
     원(구멍) 중심을 꿰뚫고 지나는 선 = '중심선 의심' → skipped.suspect, 크기에서 빼고 다르면 sizeAll 로 함께
   3 중심·반지름 같은 호를 합쳐 359° 이상이면 원, rx=ry 타원도 원. 지름 0.01 반올림, 합치지 않음(0.1 이내 차이는 warn)
   4 PCD = labmake.js holeGroups 의 세 점 원(circ3) 방식(복사) + 같은 지름은 동심원별로 다시 나눔 + 각도 간격 검사(직사각 4구멍 = null)
   5 뷰 = 도면층 이름이 뷰 이름이면 그것, 아니면 떨어진 덩어리. 덩어리 전에 모두를 감싸는 도곽 사각형은 뺌(skipped.frame)
   값은 도면 단위 그대로(척도·축척·$INSUNITS 반영 안 함). 도면은 바꾸지 않음. 사용 기록·네트워크 없음. */
(function () {
  'use strict';
  if (typeof doc !== 'object' || !doc) return;
  const D2 = Math.PI / 180;
  const R2 = x => Math.round(x * 100) / 100, R3 = x => Math.round(x * 1000) / 1000;
  const n360 = a => { a = a % 360; return a < 0 ? a + 360 : a; };
  const fn = name => { try { const f = window[name] || (0, eval)('typeof ' + name + "==='function'?" + name + ':null'); return typeof f === 'function' ? f : null; } catch (_) { return null; } };
  const MAX_ENTS = 100000;   // 펼친 뒤 도형 수 상한
  const GEO = new Set(['line', 'polyline', 'circle', 'arc', 'ellipse', 'spline']);
  const AUX_LT = /center|hidden|dash|phantom|dot|iso|border|divide|중심|숨은/i;
  const AUX_LAYER = /중심|숨은|center|hidden/i;
  const VIEW_KO = /(좌측면|우측면|정면|평면|하면|저면|측면|배면|상면|단면)/;
  const VIEW_EN = /(^|[^a-z])(front|top|bottom|left|right|side|back|rear|section)([^a-z]|$)/i;
  const FRAME_LAYER = /도곽|표제|frame|border|title/i;
  const isViewName = s => VIEW_KO.test(s || '') || VIEW_EN.test(s || '');

  /* ---------- 세 점 원 (labmake.js circ3 복사) ---------- */
  function circ3(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-12) return null;
    const a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
    const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    return { x, y, r: Math.hypot(a[0] - x, a[1] - y) };
  }
  /* labmake holeGroups 의 세 점 고르기: 첫 점, 그와 가장 먼 점, 둘 모두에서 가장 먼 점 */
  function circ3Pick(C) {
    const a0 = C[0], a1 = C.reduce((m, p) => Math.hypot(p[0] - a0[0], p[1] - a0[1]) > Math.hypot(m[0] - a0[0], m[1] - a0[1]) ? p : m, C[1]);
    const a2 = C.reduce((m, p) => { const f = q => Math.min(Math.hypot(q[0] - a0[0], q[1] - a0[1]), Math.hypot(q[0] - a1[0], q[1] - a1[1])); return f(p) > f(m) ? p : m; }, C[1]);
    return circ3(a0, a1, a2);
  }
  const onTol = r => Math.max(0.02, r * 0.0005);
  /* 원 위 점들의 각도 간격이 한 간격(360/k)의 정수배인지 — 빠진 구멍은 허용, 직사각 배치는 거름 */
  function evenAngles(P, cc) {
    if (P.length < 3) return false;
    const A = P.map(p => n360(Math.atan2(p[1] - cc.y, p[0] - cc.x) / D2)).sort((a, b) => a - b);
    const G = A.map((a, i) => i ? a - A[i - 1] : a + 360 - A[A.length - 1]);
    const g0 = Math.min(...G); if (g0 < 0.5) return false;
    const k = Math.round(360 / g0); if (k < 3 || Math.abs(360 / k - g0) > 0.3) return false;
    const pitch = 360 / k;
    if (!G.every(g => Math.abs(g / pitch - Math.round(g / pitch)) * pitch < 0.3)) return false;
    return P.length * 2 > k || P.length >= 3 && k <= 4;   // 절반 넘게 있어야 PCD 로 봄
  }
  /* 같은 지름 중심들 → [{pts, pcd}] (동심원별로 나눔, 남는 것은 pcd null 한 묶음) */
  function splitPCD(C, d) {
    const out = []; let R = C.slice();
    const valid = (cc, pts) => cc && cc.r > d && evenAngles(pts, cc);
    const inl = cc => R.filter(p => Math.abs(Math.hypot(p[0] - cc.x, p[1] - cc.y) - cc.r) < onTol(cc.r));
    for (let guard = 0; R.length >= 3 && guard < 20; guard++) {
      let best = null;
      // ① labmake 방식: 전체로 한 원 (모두 위에 있으면 끝)
      const cw = circ3Pick(R);
      if (cw) { const I = inl(cw); if (I.length === R.length && valid(cw, I)) best = { cc: cw, I }; }
      // ② 섞인 묶음: 세 점 조합 중 가장 많은 점이 올라가는 원 (40개까지)
      if (!best && R.length <= 40) {
        const n = R.length;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
          const cc = circ3(R[i], R[j], R[k]); if (!cc || cc.r <= d) continue;
          if (best && best.cc && Math.abs(best.cc.x - cc.x) < 1e-6 && Math.abs(best.cc.y - cc.y) < 1e-6 && Math.abs(best.cc.r - cc.r) < 1e-6) continue;
          const I = inl(cc); if (best && I.length <= best.I.length) continue;
          if (valid(cc, I)) best = { cc, I };
        }
      }
      if (!best) break;
      // 정밀 중심: 올라간 점들로 다시 세 점 원(labmake 방식)
      const cr = circ3Pick(best.I) || best.cc;
      const used = new Set(best.I);
      out.push({ pts: best.I, pcd: { d: R3(cr.r * 2), c: [R3(cr.x), R3(cr.y)] } });
      R = R.filter(p => !used.has(p));
    }
    if (R.length) out.push({ pts: R, pcd: null });
    return out;
  }

  /* ---------- 도형 범위 상자 [x0,y0,x1,y1] ---------- */
  function arcBox(c, r, a0, sw) {
    const pts = [a0, a0 + sw]; for (let a = 0; a < 720; a += 90) { const s = n360(a - a0); if (s <= sw && a < 360) pts.push(a); }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const a of pts) { const x = c.x + r * Math.cos(a * D2), y = c.y + r * Math.sin(a * D2); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  }
  const ptsBox = P => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of P) { if (!p) continue; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return x0 === Infinity ? null : [x0, y0, x1, y1]; };
  function ebox(e) {
    switch (e.type) {
      case 'line': return ptsBox([e.a, e.b]);
      case 'polyline': case 'spline': return ptsBox(e.pts || []);
      case 'circle': return [e.c.x - e.r, e.c.y - e.r, e.c.x + e.r, e.c.y + e.r];
      case 'arc': return arcBox(e.c, e.r, n360(e.a0), n360(e.a1 - e.a0) || 360);
      case 'ellipse': {
        if (e._pseudo || e.a0 == null) { const t = (e.rot || 0) * D2, hx = Math.hypot(e.rx * Math.cos(t), e.ry * Math.sin(t)), hy = Math.hypot(e.rx * Math.sin(t), e.ry * Math.cos(t)); return [e.c.x - hx, e.c.y - hy, e.c.x + hx, e.c.y + hy]; }
        const es = fn('ellSamples'); if (es) { try { return ptsBox(es(e, 72)); } catch (_) { } }
        const r = Math.max(Math.abs(e.rx), Math.abs(e.ry)); return [e.c.x - r, e.c.y - r, e.c.x + r, e.c.y + r];
      }
    }
    return null;
  }
  const unionBox = (a, b) => a ? (b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : a) : b;
  const boxOf = L => { let b = null; for (const it of L) b = unionBox(b, it.box); return b; };
  const ovl = (a, b, g) => a[0] <= b[2] + g && b[0] <= a[2] + g && a[1] <= b[3] + g && b[1] <= a[3] + g;

  /* ---------- 블록 배율 따라가기 (flatInsert 와 같은 순서로 배율·회전 기록) ---------- */
  function metaOf(ins, depth, acc) {
    const BLf = fn('BL'); const b = BLf ? BLf()[ins.name] : null; if (!b || depth > 6) return [];
    const sx = Math.abs(ins.sx ?? 1), sy = Math.abs(ins.sy ?? 1);
    const nu = Math.abs(sx - sy) > 1e-9 * Math.max(sx, sy, 1e-12);
    const cur = { nu: acc.nu || nu, sx: acc.sx * sx, sy: acc.sy * sy, rot: acc.rot + (ins.rot || 0) };
    const out = [];
    for (const src of b.ents || []) { if (src.type === 'insert') { const m = metaOf(src, depth + 1, cur); for (const x of m) out.push(x); } else out.push(cur); }
    return out;
  }

  function extract(o) {
    const t0 = performance.now();
    try {
      o = o || {};
      const tol = +o.tol > 0 ? +o.tol : 0.01;
      const mode = ['auto', 'layer', 'cluster', 'none'].includes(o.view) ? o.view : 'auto';
      const flatInsert = fn('flatInsert');
      const LM = new Map((doc.layers || []).map(l => [l.name, l]));
      const shown = name => { const L = LM.get(name); return !L || (L.visible !== false && !L.frozen); };
      const skipped = { aux: 0, suspect: 0, frame: 0, hiddenLayer: 0 };
      const warnings = [];
      let src = doc.entities || [];
      if (Array.isArray(o.ids) && o.ids.length) { const S = new Set(o.ids.map(String)); src = src.filter(e => S.has(String(e.id))); }

      /* 1) 펼치기 + 꺼진 층 + 블록 배율 */
      const items = [];   // {e, m}
      const texts = [];   // 글자 위치(도곽·표제란 판단용)
      let cut = false;
      for (const e of src) {
        if (items.length > MAX_ENTS) { cut = true; break; }
        if ((e.type === 'text' || e.type === 'mtext') && e.p && shown(e.layer)) { texts.push(e.p); continue; }
        if (e.type !== 'insert' && !GEO.has(e.type)) continue;
        if (!shown(e.layer)) { skipped.hiddenLayer++; continue; }
        if (e.type !== 'insert') { items.push({ e, m: null }); continue; }
        let F = []; try { F = flatInsert ? flatInsert(e) : []; } catch (_) { F = []; }
        let M = metaOf(e, 0, { nu: false, sx: 1, sy: 1, rot: 0 });
        if (M.length !== F.length) { const sx = Math.abs(e.sx ?? 1), sy = Math.abs(e.sy ?? 1); const m = { nu: Math.abs(sx - sy) > 1e-9, sx, sy, rot: e.rot || 0 }; M = F.map(() => m); }
        for (let i = 0; i < F.length; i++) {
          const f = F[i]; if (!GEO.has(f.type)) continue;
          if (!shown(f.layer)) { skipped.hiddenLayer++; continue; }
          items.push({ e: f, m: M[i] });
        }
      }
      if (items.length > MAX_ENTS) return { ok: false, error: `도형이 너무 많습니다(${items.length.toLocaleString()}개${cut ? ' 이상' : ''}). 잴 부분을 선택한 뒤 다시 실행하세요`, ms: R3(performance.now() - t0) };
      /* 2) 중심선·숨은선 */
      const isAux = e => { const L = LM.get(e.layer) || {}; const lt = String((e.lt && !/^by(layer|block)$/i.test(e.lt)) ? e.lt : (L.lt || '')); return (lt && !/^continuous$/i.test(lt) && AUX_LT.test(lt)) || AUX_LAYER.test(e.layer || ''); };
      const geo = [];
      for (const it of items) { if (isAux(it.e)) { skipped.aux++; continue; } geo.push(it); }

      /* 3) 원 만들기: 원·rx=ry 타원·호 합치기 / 블록 배율 원은 타원 */
      const shapes = [];      // {e, box, kind:'geo'|'circle', c, r, line?}
      const ellAll = [];      // {c, rx, ry, why}
      const arcs = new Map();
      let nuCount = 0;
      for (const { e, m } of geo) {
        if (e.type === 'circle' && m && m.nu) {
          const r0 = e.r / Math.sqrt(m.sx * m.sy), pe = { type: 'ellipse', _pseudo: true, c: e.c, rx: r0 * m.sx, ry: r0 * m.sy, rot: m.rot };
          ellAll.push({ c: e.c, rx: pe.rx, ry: pe.ry, why: '블록 배율' }); nuCount++;
          shapes.push({ e: pe, box: ebox(pe), kind: 'geo' }); continue;
        }
        if (e.type === 'circle') { shapes.push({ e, box: ebox(e), kind: 'circle', c: e.c, r: e.r }); continue; }
        if (e.type === 'ellipse') {
          const full = e.a0 == null || e.a1 == null || (n360(e.a1 - e.a0) || 360) >= 359;
          if (full && Math.abs(Math.abs(e.rx) - Math.abs(e.ry)) <= tol / 2 && !(m && m.nu)) { const r = (Math.abs(e.rx) + Math.abs(e.ry)) / 2; shapes.push({ e, box: [e.c.x - r, e.c.y - r, e.c.x + r, e.c.y + r], kind: 'circle', c: e.c, r }); continue; }
          if (full) ellAll.push({ c: e.c, rx: Math.abs(e.rx), ry: Math.abs(e.ry), why: m && m.nu ? '블록 배율' : '타원' });
          shapes.push({ e, box: ebox(e), kind: 'geo' }); continue;
        }
        if (e.type === 'arc' && !(m && m.nu)) {
          const k = R3(e.c.x) + ',' + R3(e.c.y) + ',' + R3(e.r);
          (arcs.get(k) || arcs.set(k, []).get(k)).push(e);
        }
        const b = ebox(e); if (b) shapes.push({ e, box: b, kind: 'geo', line: e.type === 'line' });
      }
      if (nuCount) warnings.push(`블록 배율이 가로·세로 달라 원이 타원이 된 것 ${nuCount}개는 구멍에서 빼고 ellipses 에 따로 적었습니다`);
      let merged = 0;
      for (const L of arcs.values()) {
        const iv = [];
        for (const a of L) { const s = n360(a.a0), sw = n360(a.a1 - a.a0) || 360; if (s + sw > 360) { iv.push([s, 360]); iv.push([0, s + sw - 360]); } else iv.push([s, s + sw]); }
        iv.sort((p, q) => p[0] - q[0]); let tot = 0, cs = null, ce = null;
        for (const [s, e2] of iv) { if (cs === null) { cs = s; ce = e2; } else if (s <= ce + 1e-6) ce = Math.max(ce, e2); else { tot += ce - cs; cs = s; ce = e2; } }
        if (cs !== null) tot += ce - cs;
        if (tot >= 359) { const a = L[0]; shapes.push({ e: a, box: [a.c.x - a.r, a.c.y - a.r, a.c.x + a.r, a.c.y + a.r], kind: 'circle', c: a.c, r: a.r, merged: true, _skipBox: true }); merged++; }
      }
      const circles = shapes.filter(s => s.kind === 'circle');
      if (!shapes.length) return { ok: false, error: '잴 형상이 없습니다 — 선·원·호·폴리선이 없거나 모두 꺼진 도면층·중심선·숨은선입니다', ms: R3(performance.now() - t0) };

      /* 4) 중심선 의심: 원 중심을 꿰뚫고 양쪽으로 원 밖까지 지나는 선 */
      //    원 중심을 격자 칸에 넣고, 선이 지나는 칸(과 이웃 칸)의 원만 검사 — 큰 도면에서도 빠르게
      if (circles.length) {
        let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity;
        for (const c of circles) { cx0 = Math.min(cx0, c.c.x); cy0 = Math.min(cy0, c.c.y); cx1 = Math.max(cx1, c.c.x); cy1 = Math.max(cy1, c.c.y); }
        const W = Math.max(cx1 - cx0, cy1 - cy0, 1e-9), cell = Math.max(W / Math.ceil(Math.sqrt(circles.length)), tol * 4);
        const NX = Math.floor((cx1 - cx0) / cell) + 1, NY = Math.floor((cy1 - cy0) / cell) + 1;
        const grid = new Map(), key = (ix, iy) => ix * 4194304 + iy;
        for (const c of circles) { const k = key(Math.floor((c.c.x - cx0) / cell), Math.floor((c.c.y - cy0) / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(c); }
        let stamp = 0; const seen = new Map();
        for (const s of shapes) {
          if (!s.line) continue;
          const a = s.e.a, b = s.e.b, dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; if (L2 < 1e-18) continue;
          // 원 중심 상자(한 칸 여유)로 선을 자름 (Liang–Barsky)
          let u0 = 0, u1 = 1; const ex0 = cx0 - cell, ey0 = cy0 - cell, ex1 = cx1 + cell, ey1 = cy1 + cell;
          const P4 = [-dx, dx, -dy, dy], Q4 = [a.x - ex0, ex1 - a.x, a.y - ey0, ey1 - a.y]; let out = false;
          for (let i = 0; i < 4; i++) { if (P4[i] === 0) { if (Q4[i] < 0) { out = true; break; } continue; } const r = Q4[i] / P4[i]; if (P4[i] < 0) { if (r > u1) { out = true; break; } if (r > u0) u0 = r; } else { if (r < u0) { out = true; break; } if (r < u1) u1 = r; } }
          if (out) continue;
          const Ln = Math.sqrt(L2), steps = Math.max(1, Math.ceil((u1 - u0) * Ln / (cell * 0.5)));
          stamp++;
          for (let st = 0; st <= steps && !s.suspect; st++) {
            const u = u0 + (u1 - u0) * st / steps, gx = Math.floor((a.x + dx * u - cx0) / cell), gy = Math.floor((a.y + dy * u - cy0) / cell);
            for (let ix = gx - 1; ix <= gx + 1 && !s.suspect; ix++) for (let iy = gy - 1; iy <= gy + 1 && !s.suspect; iy++) {
              if (ix < 0 || iy < 0 || ix >= NX || iy >= NY) continue;
              const k = key(ix, iy); if (seen.get(k) === stamp) continue; seen.set(k, stamp);
              const L = grid.get(k); if (!L) continue;
              for (const c of L) {
                const px = c.c.x - a.x, py = c.c.y - a.y, t = (px * dx + py * dy) / L2; if (t <= 0 || t >= 1) continue;
                if (Math.abs(px * dy - py * dx) / Ln > tol) continue;
                if (t * Ln > c.r + tol && (1 - t) * Ln > c.r + tol) { s.suspect = c; break; }
              }
            }
          }
          if (s.suspect) skipped.suspect++;
        }
      }
      /* 합친 호 원은 상자 계산에서 중복(호가 이미 있음) — 표시용만 */
      const boxShapes = shapes.filter(s => !s._skipBox && !s.suspect);
      if (!boxShapes.length) return { ok: false, error: '잴 형상이 없습니다 — 남은 형상이 모두 중심선으로 보입니다', ms: R3(performance.now() - t0) };

      /* 5) 도곽 사각형 빼기 (모두를 감싸는 닫힌 사각형, 빼면 덩어리가 2개 이상 → 도곽) */
      const all0 = boxOf(boxShapes), diag = Math.hypot(all0[2] - all0[0], all0[3] - all0[1]) || 1;
      const gap = Math.max(tol, diag * 0.005);
      const isRect = e => { if (e.type !== 'polyline' || !e.pts) return false; let P = e.pts.slice(); if (P.length === 5 && Math.hypot(P[0].x - P[4].x, P[0].y - P[4].y) < 1e-9) P.pop(); if (P.length !== 4 || !(e.closed || e.pts.length === 5)) return false; for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4]; if (Math.abs(p.x - q.x) > 1e-6 && Math.abs(p.y - q.y) > 1e-6) return false; } return true; };
      const clusters = list => {   // 상자 겹침(틈 gap)으로 덩어리
        const n = list.length, par = list.map((_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
        const idx = list.map((_, i) => i).sort((p, q) => list[p].box[0] - list[q].box[0]);
        for (let a = 0; a < n; a++) { const A = list[idx[a]].box; for (let b = a + 1; b < n; b++) { const B = list[idx[b]].box; if (B[0] > A[2] + gap) break; if (ovl(A, B, gap)) { const x = f(idx[a]), y = f(idx[b]); if (x !== y) par[x] = y; } } }
        const g = new Map(); list.forEach((s, i) => { const r = f(i); (g.get(r) || g.set(r, []).get(r)).push(s); });
        let G = [...g.values()].map(L => ({ L, box: boxOf(L) }));
        for (let changed = true; changed;) { changed = false;   // 덩어리 상자끼리 겹치면 합침 (x 순 정렬 훑기)
          G.sort((p, q) => p.box[0] - q.box[0]); const H = [];
          for (const g of G) { let m = false; for (let i = H.length - 1; i >= 0; i--) { const h = H[i]; if (ovl(h.box, g.box, gap)) { h.L = h.L.concat(g.L); h.box = unionBox(h.box, g.box); m = changed = true; break; } } if (!m) H.push(g); }
          G = H; }
        return G;
      };
      let work = boxShapes;
      if (mode !== 'layer') {
        for (let guard = 0; guard < 3; guard++) {
          const allB = boxOf(work);
          const fr = work.find(s => isRect(s.e) && Math.abs(s.box[0] - allB[0]) <= tol && Math.abs(s.box[1] - allB[1]) <= tol && Math.abs(s.box[2] - allB[2]) <= tol && Math.abs(s.box[3] - allB[3]) <= tol);
          if (!fr) break;
          const rest = work.filter(s => s !== fr); if (!rest.length) break;
          // 도곽 = 빼고 나면 선·폴리선이 있는 덩어리가 2개 이상(뷰·표제란) 이고, 사각형이 다른 형상과 다른 도면층(또는 도곽 이름 층)
          const area = (fr.box[2] - fr.box[0]) * (fr.box[3] - fr.box[1]) || 1;
          const big = clusters(rest).filter(c => c.L.some(s => s.e.type === 'line' || s.e.type === 'polyline') && (c.box[2] - c.box[0]) * (c.box[3] - c.box[1]) >= area * 0.005);
          // 도곽 = 사각형 안에 글자(표제란 등)가 있거나, 빼고 나면 선이 있는 떨어진 덩어리가 2개 이상 (부품 외곽 사각형은 빼지 않음)
          const hasText = texts.some(p => p.x >= fr.box[0] && p.x <= fr.box[2] && p.y >= fr.box[1] && p.y <= fr.box[3]);
          if (FRAME_LAYER.test(fr.e.layer || '') || hasText || big.length >= 2) { work = rest; fr.frame = true; skipped.frame++; } else break;
        }
        if (skipped.frame) {
          const nf = skipped.frame;
          // 표제란: 글자가 들어 있고 원·호가 없는 덩어리 → 뷰에서 뺌
          if (texts.length) {
            const G = clusters(work), drop = new Set();
            for (const c of G) { if (G.length < 2 || c.L.some(s => s.kind === 'circle' || s.e.type === 'arc')) continue; if (texts.some(p => p.x >= c.box[0] && p.x <= c.box[2] && p.y >= c.box[1] && p.y <= c.box[3])) { for (const s of c.L) drop.add(s); skipped.frame++; } }
            if (drop.size) work = work.filter(s => !drop.has(s));
          }
          warnings.push(`모든 형상을 감싸는 도곽 사각형 ${nf}개` + (skipped.frame > nf ? `와 표제란 ${skipped.frame - nf}곳` : '') + '을 빼고 뷰를 나눴습니다');
        }
      }

      /* 6) 뷰 나누기 */
      const workSet = new Set(work);
      const circNoBox = shapes.filter(s => s._skipBox && !s.suspect);   // 합친 호 원
      let views = [];
      const layerViews = [...new Set(work.map(s => s.e.layer))].filter(isViewName);
      if (mode === 'none') views = [{ name: '전체', L: work.slice() }];
      else if ((mode === 'layer' || mode === 'auto') && layerViews.length) {
        const by = new Map(layerViews.map(n => [n, []])); const rest = [];
        for (const s of work) (by.has(s.e.layer) ? by.get(s.e.layer) : rest).push(s);
        views = [...by.entries()].map(([name, L]) => ({ name, L }));
        const left = [];
        for (const s of rest) { const cx = (s.box[0] + s.box[2]) / 2, cy = (s.box[1] + s.box[3]) / 2; const v = views.find(v => { const b = boxOf(v.L); return cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]; }); if (v) v.L.push(s); else left.push(s); }
        if (left.length) { if (mode === 'layer') views.push({ name: '기타', L: left }); else clusters(left).forEach((c, i) => views.push({ name: '덩어리 ' + (i + 1), L: c.L })); }
      } else {
        if (mode === 'layer') warnings.push('뷰 이름(정면·평면·측면…) 도면층이 없어 떨어진 덩어리로 나눴습니다');
        if (work.length > 20000) warnings.push('큰 도면은 뷰 나누기가 거칠 수 있음(떨어진 뷰가 한 덩어리로 합쳐질 수 있으니 잴 부분을 선택해 보세요)');
        const G = clusters(work).sort((a, b) => (b.box[3] - a.box[3]) || (a.box[0] - b.box[0]));
        // 위→아래 줄, 줄 안에서 왼→오
        G.sort((a, b) => { const ya = (a.box[1] + a.box[3]) / 2, yb = (b.box[1] + b.box[3]) / 2, h = Math.min(a.box[3] - a.box[1], b.box[3] - b.box[1]) / 2; return Math.abs(ya - yb) > h ? yb - ya : a.box[0] - b.box[0]; });
        views = G.length === 1 ? [{ name: '전체', L: G[0].L }] : G.map((c, i) => ({ name: '뷰 ' + (i + 1), L: c.L }));
      }
      for (const v of views) v.box = boxOf(v.L);
      const inBox = (b, p) => p.x >= b[0] - tol && p.x <= b[2] + tol && p.y >= b[1] - tol && p.y <= b[3] + tol;
      const viewOf = p => { let best = null, ba = Infinity; for (const v of views) { if (!inBox(v.box, p)) continue; const a = (v.box[2] - v.box[0]) * (v.box[3] - v.box[1]); if (a < ba) { ba = a; best = v; } } return best; };
      for (const s of circNoBox) { const v = viewOf(s.c); if (v) v.L.push(s); }
      for (const s of shapes) if (s.suspect) { const v = (views.find(v => v.L.includes(s.suspect)) || viewOf(s.suspect.c)); if (v) (v.sus = v.sus || []).push(s); }
      void workSet;

      /* 7) 뷰별 결과 */
      const out = views.filter(v => v.box).map(v => {
        const b = v.box, size = [R3(b[2] - b[0]), R3(b[3] - b[1])];
        let sizeAll = null;
        if (v.sus && v.sus.length) { const ba = unionBox(b, boxOf(v.sus)); const sa = [R3(ba[2] - ba[0]), R3(ba[3] - ba[1])]; if (sa[0] !== size[0] || sa[1] !== size[1]) sizeAll = sa; }
        const byD = new Map();
        for (const s of v.L) if (s.kind === 'circle') { const k = Math.round(2 * s.r * 100); (byD.get(k) || byD.set(k, []).get(k)).push([s.c.x, s.c.y]); }
        const holes = [];
        for (const [k, C] of [...byD.entries()].sort((p, q) => p[0] - q[0])) {
          const d = k / 100;
          const parts = C.length >= 3 ? splitPCD(C, d) : [{ pts: C, pcd: null }];
          parts.sort((p, q) => (q.pcd ? 1 : 0) - (p.pcd ? 1 : 0) || q.pts.length - p.pts.length);
          for (const g of parts) {
            const xs = [...new Set(g.pts.map(p => R3(p[0])))], ys = [...new Set(g.pts.map(p => R3(p[1])))];
            const sx = xs.slice().sort((a, c) => a - c), sy = ys.slice().sort((a, c) => a - c);
            const centers = g.pts.map(p => [R3(p[0]), R3(p[1])]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
            holes.push({ d, n: g.pts.length, centers, pcd: g.pcd, pitchX: xs.length >= 2 ? R3(Math.max(...xs) - Math.min(...xs)) : null, pitchY: ys.length >= 2 ? R3(Math.max(...ys) - Math.min(...ys)) : null, warn: null,
              gapsX: sx.slice(1).map((x, i) => R3(x - sx[i])), gapsY: sy.slice(1).map((y, i) => R3(y - sy[i])) });
          }
        }
        for (const h of holes) {
          const near = [...new Set(holes.filter(o2 => o2.d !== h.d && Math.abs(o2.d - h.d) <= 0.1 + 1e-6).map(o2 => o2.d))];
          if (near.length) h.warn = '비슷한 지름 ' + near.map(x => 'Ø' + x).join('·') + ' 이 따로 있음(0.1 이내 — 합치지 않음, 같은 구멍인지 확인)';
        }
        const eg = new Map();
        for (const el of ellAll) { if (!inBox(b, el.c) || viewOf(el.c) !== v) continue; const key = R2(el.rx) + '|' + R2(el.ry) + '|' + el.why; const g = eg.get(key) || eg.set(key, { rx: R2(el.rx), ry: R2(el.ry), n: 0, why: el.why }).get(key); g.n++; }
        return { name: v.name, box: b.map(R3), size, sizeAll, holes, ellipses: [...eg.values()].sort((p, q) => p.rx - q.rx) };
      });
      // 어느 뷰에도 안 들어간 타원
      if (merged) warnings.push(`같은 중심·반지름 호를 합쳐 원으로 본 것 ${merged}개`);
      if (skipped.suspect) warnings.push(`구멍 중심을 지나는 선 ${skipped.suspect}개를 중심선으로 의심해 크기에서 뺐습니다(sizeAll = 넣었을 때)`);
      if (skipped.hiddenLayer) warnings.push(`꺼진·얼린 도면층 형상 ${skipped.hiddenLayer}개는 뺐습니다(블록 안 포함)`);
      return { ok: true, ms: R3(performance.now() - t0), views: out, skipped, warnings };
    } catch (err) {
      return { ok: false, error: '형상 치수를 뽑다가 문제가 생겼습니다: ' + (err && err.message || err), ms: R3(performance.now() - t0) };
    }
  }

  window.GEODIM = { extract, _splitPCD: splitPCD };

  /* AI 명령: {"cmd":"geo_dims","ids":[...]?,"view":"auto"?,"attach":false} — attach:true 이고 GEODIM_UI 가 있으면 도면에 치수 붙이기 */
  if (typeof COMMANDS === 'object' && COMMANDS) {
    COMMANDS.geo_dims = (c, ctx) => {
      try {
        c = c || {};
        let ids = c.ids;
        if (ids != null && !Array.isArray(ids)) { const ri = fn('resolveIds'); try { ids = ri ? ri(ids, ctx) : [ids]; } catch (_) { ids = [ids]; } }
        const r = extract({ ids, view: c.view || 'auto', tol: c.tol });
        if (!r.ok) return r;
        const brief = { ok: true, note: '형상에서 잰 값입니다(도면 단위 그대로 — 척도·축척·블록 배율이 반영 안 됐을 수 있음). 설계 치수는 원 도면으로 확인하세요', ms: r.ms, skipped: r.skipped, warnings: r.warnings,
          views: r.views.map(v => ({ ...v, holes: v.holes.map(h => ({ ...h, centers: h.centers.slice(0, 20), centers_total: h.centers.length })) })) };
        if (c.attach === true) {
          const U = window.GEODIM_UI;
          if (U && typeof U.attach === 'function') { try { brief.attach = U.attach(r, { record: false }); }   /* runBatch 안 — 되돌리기 1번만 쌓이게 */ catch (e) { brief.attach = { ok: false, error: '치수 붙이기 실패: ' + (e && e.message || e) }; } }
          else brief.attach = { ok: false, error: '치수 붙이기 기능(GEODIM_UI)이 아직 없습니다' };
        }
        return brief;
      } catch (e) { return { ok: false, error: '형상 치수 명령 오류: ' + (e && e.message || e) }; }
    };
  }
  const GUIDE = `형상 치수 뽑기
 · {"cmd":"geo_dims"} 또는 {"cmd":"geo_dims","ids":[...],"view":"auto|layer|cluster|none"} — 치수 객체가 없어도 형상을 재서 뷰별 크기·구멍 묶음(지름·개수·중심)·PCD·간격을 돌려줌(중심은 앞 20개). 중심선·숨은선·도곽은 뺌. 도면 단위 그대로. "attach":true 면 도면에 치수를 붙임`;
  const hook = () => { try { const g = window.LAB2D; if (g && typeof g.guide === 'string') { if (!g.guide.includes('"cmd":"geo_dims"')) g.guide += '\n\n' + GUIDE; return true; } } catch (_) { return true; } return false; };
  if (!hook()) { let n = 0; const t = setInterval(() => { if (hook() || ++n > 40) clearInterval(t); }, 500); }
})();
