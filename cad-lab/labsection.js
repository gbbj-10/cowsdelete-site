/* 단면도 → 회전체 · 단조/가공 외형 나누기 — 2026-11-03 (테스트 서버 → 같은 날 본체, cad/·cad-lab/ 같은 파일) (요청 게시판 「기어도면 작도후 클로드가 제안하는 개선 요청사항」 3·4번)
   ① revolve_section : 축(중심선) + 단면 외곽선만 주면 선·호를 닫힌 프로파일로 자동 연결해 회전 → model3d 로 만듦(2D 대조·STEP·도면 만들기 그대로)
   ② outline_split   : 같은 외형선 레이어에 겹친 두 윤곽(평행선·동심 호, 간격 0.2~6mm)을 찾아
                        바깥쪽(재료가 더 많은 쪽) = 단조외형, 안쪽 = 가공외형 레이어로 나눔
   ③ 단면도 전용 대조(2번)는 lab2dcheck.js 의 {"cmd":"model3d_compare","section":true}
   AI 명령(mucca_draw): {"cmd":"revolve_section",...} · {"cmd":"outline_split",...}   명령줄: 회전체(REVSECTION) · 단조가공(FORGESPLIT) */
(function () {
  const ph = () => window.LABPHOTO, lab = () => window.LAB3D;
  if (!ph() || !lab()) return;
  const D2R = Math.PI / 180;
  const IGN = new Set(['중심선', '치수', '문자', '숨은선']), IGN_LT = new Set(['center', 'phantom', 'dashdot', 'hidden', 'dashed']);
  const isOutline = e => ['line', 'polyline', 'arc', 'circle', 'ellipse'].includes(e.type) && !IGN.has(e.layer) && !/해치|hatch/i.test(String(e.layer || '')) && !(e.lt && IGN_LT.has(String(e.lt).toLowerCase()));
  const isCenter = e => e.type === 'line' && (e.layer === '중심선' || /center|dashdot|phantom/i.test(String(e.lt || '')));
  const FORGE = '단조외형', MACH = '가공외형';

  /* ---------- 도형 고르기: ids · box · 선택 · 전체 ---------- */
  function pick(c) {
    let L;
    if (Array.isArray(c.ids) && c.ids.length) { const w = new Set(c.ids.map(String)); L = doc.entities.filter(e => w.has(String(e.id))); if (!L.length) throw new Error('ids 에 맞는 도형이 없습니다 (mucca_list 의 id)'); }
    else if (Array.isArray(c.box) && c.box.length === 4) { const [a, b, x, y] = c.box.map(Number), x0 = Math.min(a, x), x1 = Math.max(a, x), y0 = Math.min(b, y), y1 = Math.max(b, y); L = doc.entities.filter(e => { const q = bbox([e]); return q && q.minX >= x0 && q.maxX <= x1 && q.minY >= y0 && q.maxY <= y1; }); }
    else if (typeof sel !== 'undefined' && sel.size) L = doc.entities.filter(e => sel.has(e.id));
    else L = doc.entities.slice();
    return L;
  }
  /* ---------- 도형 → 꺾은선 ([x,y] 점들) ---------- */
  function arcPts(cx, cy, r, a0, a1) { let A1 = a1; while (A1 <= a0) A1 += 360; const k = Math.max(3, Math.ceil((A1 - a0) / 2)), o = []; for (let i = 0; i <= k; i++) { const t = (a0 + (A1 - a0) * i / k) * D2R; o.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return o; }
  function polyOf(e) {
    switch (e.type) {
      case 'line': return [[e.a.x, e.a.y], [e.b.x, e.b.y]];
      case 'arc': return arcPts(e.c.x, e.c.y, e.r, e.a0, e.a1);
      case 'circle': return arcPts(e.c.x, e.c.y, Math.abs(e.r), 0, 360);
      case 'ellipse': { if (!window.ellPt) return null; let a0 = e.a0 == null ? 0 : e.a0, a1 = e.a0 == null ? 360 : e.a1; while (a1 <= a0) a1 += 360; const o = []; for (let i = 0; i <= 120; i++) { const q = ellPt(e, a0 + (a1 - a0) * i / 120); o.push([q.x, q.y]); } return o; }
      case 'polyline': {
        const P = e.pts, n = P.length, b = e.b || [], o = [[P[0].x, P[0].y]], segN = e.closed ? n : n - 1;
        for (let i = 0; i < segN; i++) {
          const p = P[i], q = P[(i + 1) % n], bu = +b[i] || 0;
          if (Math.abs(bu) > 1e-9) { const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), th = 4 * Math.atan(bu), off = (d / 2) / Math.tan(th / 2), c = { x: (p.x + q.x) / 2 - dy / d * off, y: (p.y + q.y) / 2 + dx / d * off }, r = Math.hypot(p.x - c.x, p.y - c.y), a0 = Math.atan2(p.y - c.y, p.x - c.x), k = Math.max(3, Math.ceil(Math.abs(th) / D2R / 2)); for (let j = 1; j <= k; j++) { const t = a0 + th * j / k; o.push([c.x + r * Math.cos(t), c.y + r * Math.sin(t)]); } }
          else o.push([q.x, q.y]);
        }
        return o;
      }
    }
    return null;
  }
  const areaOf = p => { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const perimOf = p => { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; };
  const inPoly = (pt, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const bbP = polys => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of polys) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; };
  // 닫힌 영역: 끝점 맞추기·T자 쪼개기·면 찾기(lab3d planarOuter) → 덩어리마다 바깥 윤곽. 얇은 띠(가공 여유 사이 틈)는 뺌
  function regions(polys) {
    const b = bbP(polys), tol = Math.max(1e-3, Math.hypot(b.w, b.h) * 2e-4);
    const r = lab().planarOuter(polys.map(p => p.map(([x, y]) => ({ x, y }))), tol);
    return { tol, loops: r.loops.map(l => l.pts.map(q => [q.x, q.y])).filter(p => Math.abs(areaOf(p)) > tol * tol * 10) };
  }
  // 영역 안(재료) 판정: 안에 든 윤곽 수가 홀수면 재료
  const solidTest = loops => pt => loops.reduce((n, p) => n + (inPoly(pt, p) ? 1 : 0), 0) % 2 === 1;

  /* ---------- ② 겹친 두 윤곽 → 단조(바깥) / 가공(안쪽) ---------- */
  function splitOutline(c, ents0) {
    const ents = (ents0 || flatEnts(pick(c))).filter(isOutline);
    const mn = c.min > 0 ? +c.min : 0.2, mx = c.max > 0 ? +c.max : 6;
    const segs = [];   // {e, k:'l'|'a', ...}
    for (const e of ents) {
      if (e.type === 'line') { const L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y); if (L > 1e-6) segs.push({ e, k: 'l', a: [e.a.x, e.a.y], b: [e.b.x, e.b.y], L, d: [(e.b.x - e.a.x) / L, (e.b.y - e.a.y) / L] }); }
      else if (e.type === 'arc' || e.type === 'circle') segs.push({ e, k: 'a', c: [e.c.x, e.c.y], r: Math.abs(e.r), a0: e.type === 'arc' ? e.a0 : 0, a1: e.type === 'arc' ? e.a1 : 360 });
      else if (e.type === 'polyline' && e.pts.length > 1 && !(e.b || []).some(x => Math.abs(+x || 0) > 1e-9)) { const P = e.pts, n = e.closed ? P.length : P.length - 1; for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % P.length], L = Math.hypot(q.x - p.x, q.y - p.y); if (L > 1e-6) segs.push({ e, k: 'l', a: [p.x, p.y], b: [q.x, q.y], L, d: [(q.x - p.x) / L, (q.y - p.y) / L] }); } }
    }
    const polys = ents.map(polyOf).filter(p => p && p.length > 1);
    if (!polys.length) throw new Error('외형선이 없습니다 (치수·문자·중심선·숨은선 레이어는 뺍니다)');
    const R = regions(polys), solid = solidTest(R.loops.filter(p => Math.abs(areaOf(p)) / (perimOf(p) ** 2) > 0.004));
    const vote = new Map(), add = (e, k, w) => { const v = vote.get(e) || { o: 0, i: 0 }; v[k] += w; vote.set(e, v); };
    const pairs = []; let amb = 0;
    const span = (a0, a1) => { let s = a1 - a0; while (s <= 0) s += 360; return s; };
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i], B = segs[j]; if (A.e === B.e || A.k !== B.k) continue;
      let gap, qa, qb, w;
      if (A.k === 'l') {
        if (Math.abs(A.d[0] * B.d[1] - A.d[1] * B.d[0]) > 0.002) continue;
        const nx = -A.d[1], ny = A.d[0], off = (B.a[0] - A.a[0]) * nx + (B.a[1] - A.a[1]) * ny; gap = Math.abs(off); if (gap < mn || gap > mx) continue;
        const pr = q => (q[0] - A.a[0]) * A.d[0] + (q[1] - A.a[1]) * A.d[1], s0 = Math.max(0, Math.min(pr(B.a), pr(B.b))), s1 = Math.min(A.L, Math.max(pr(B.a), pr(B.b)));
        if (s1 - s0 < 0.3 * Math.min(A.L, B.L)) continue;
        const sm = (s0 + s1) / 2, sg = Math.sign(off), eps = Math.min(gap / 3, 0.2);
        const pa = [A.a[0] + A.d[0] * sm, A.a[1] + A.d[1] * sm], pb = [pa[0] + nx * off, pa[1] + ny * off];
        qa = [pa[0] - nx * sg * eps, pa[1] - ny * sg * eps]; qb = [pb[0] + nx * sg * eps, pb[1] + ny * sg * eps]; w = s1 - s0;
      } else {
        if (Math.hypot(A.c[0] - B.c[0], A.c[1] - B.c[1]) > 0.05) continue;
        gap = Math.abs(A.r - B.r); if (gap < mn || gap > mx) continue;
        const am = ((A.a0 + span(A.a0, A.a1) / 2) % 360) * D2R, eps = Math.min(gap / 3, 0.2), sg = A.r > B.r ? 1 : -1;
        qa = [A.c[0] + (A.r + sg * eps) * Math.cos(am), A.c[1] + (A.r + sg * eps) * Math.sin(am)]; qb = [A.c[0] + (B.r - sg * eps) * Math.cos(am), A.c[1] + (B.r - sg * eps) * Math.sin(am)]; w = Math.min(A.r, B.r) * Math.min(span(A.a0, A.a1), span(B.a0, B.a1)) * D2R;
      }
      const oa = !solid(qa), ob = !solid(qb);   // 바깥으로 한 걸음 나간 점이 재료 밖 = 바깥(단조) 윤곽
      if (oa === ob) { amb++; continue; }
      const [O, I] = oa ? [A, B] : [B, A]; add(O.e, 'o', w); add(I.e, 'i', w); pairs.push({ gap: +gap.toFixed(3), outer: O.e.id, inner: I.e.id });
    }
    const outer = [], inner = [];
    for (const [e, v] of vote) (v.o > v.i ? outer : inner).push(e);
    // 2차: 짝이 없는 선(단조 윤곽이 가공 윤곽과 한 줄로 겹치다 끝만 튀어나온 것 등) — 가공 영역 = 바깥 윤곽 안의 면 중
    //   '얇은 띠(가공 여유)'를 뺀 나머지. 그 경계 위에 없는 선 = 단조, 가공 경계에만 있고 바깥 윤곽엔 없는 선 = 가공
    if (pairs.length) {
      const tol = R.tol, F = lab().planarOuter(polys.map(p => p.map(([x, y]) => ({ x, y }))), tol, true).faces || [];
      const P2 = f => f.pts.map(q => [q.x, q.y]);
      const outSet = new Set(outer), outPolys = outer.map(polyOf).filter(Boolean);
      const sd = (q, a, c) => { const vx = c[0] - a[0], vy = c[1] - a[1], L = vx * vx + vy * vy; let t = L ? ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(q[0] - a[0] - t * vx, q[1] - a[1] - t * vy); };
      const onPoly = (q, p, cl) => { const n = p.length; for (let i = 0; i < n - (cl ? 0 : 1); i++) if (sd(q, p[i], p[(i + 1) % n]) <= tol * 2) return true; return false; };
      const bounded = F.filter(f => !f.outer && Math.abs(f.sA) > tol * tol * 4).map(f => ({ p: P2(f), A: Math.abs(f.sA) }));
      const strip = f => { const per = perimOf(f.p), w = 2 * f.A / per; if (w > mx) return false; let k = 0; for (let i = 0; i < f.p.length; i++) { const m = [(f.p[i][0] + f.p[(i + 1) % f.p.length][0]) / 2, (f.p[i][1] + f.p[(i + 1) % f.p.length][1]) / 2]; if (outPolys.some(o => onPoly(m, o, false))) k++; } return k > 0; };
      const mach = bounded.filter(f => !strip(f)).map(f => f.p), env = R.loops;
      const at = (p, t) => { const L = []; let s = 0; for (let i = 1; i < p.length; i++) { s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); L.push(s); } const g = s * t; for (let i = 1; i < p.length; i++) if (L[i - 1] >= g) { const s0 = i > 1 ? L[i - 2] : 0, f = (g - s0) / ((L[i - 1] - s0) || 1); return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f]; } return p[p.length - 1]; };
      const seen = new Set(outer.concat(inner));
      // 짝을 찾은 곳 근처만 (표제란·상세도처럼 떨어진 도형은 안 건드림)
      const pb = bbP(outer.concat(inner).map(polyOf).filter(Boolean)), m2 = mx * 2, near = p => p.every(([x, y]) => x >= pb.x0 - m2 && x <= pb.x1 + m2 && y >= pb.y0 - m2 && y <= pb.y1 + m2);
      for (const e of ents) {
        if (seen.has(e)) continue; const p = polyOf(e); if (!p || p.length < 2 || !near(p)) continue;
        const qs = [0.02, 0.25, 0.5, 0.75, 0.98].map(t => at(p, t));   // 끝 가까이도 봄: 한 줄로 겹치다 끝만 튀어나온 단조 선
        const onM = qs.every(q => mach.some(m => onPoly(q, m, true))), onE = qs.every(q => env.some(m => onPoly(q, m, true)));
        if (!onM && onE) { outer.push(e); outSet.add(e); } else if (onM && !onE) inner.push(e);
      }
    }
    return { outer, inner, pairs, amb, solidLoops: R.loops.length };
  }
  function applySplit(r) {
    pushUndo(); ensureLayer(FORGE, 6); ensureLayer(MACH, 4);
    const top = new Set(doc.entities); let n = 0;
    for (const e of r.outer) if (top.has(e)) { e.layer = FORGE; n++; }
    for (const e of r.inner) if (top.has(e)) { e.layer = MACH; n++; }
    try { geomVer++; } catch (_) { } changed(); return n;
  }
  async function cmdSplit(c) {
    const r = splitOutline(c);
    let moved = 0; if (c.apply !== false && (r.outer.length || r.inner.length)) moved = applySplit(r);
    const gaps = r.pairs.map(p => p.gap);
    return { pairs: r.pairs.length, outer: r.outer.map(e => e.id), inner: r.inner.map(e => e.id), ambiguous: r.amb, gap_mm: gaps.length ? [Math.min(...gaps), Math.max(...gaps)] : null, applied: moved,
      note: r.pairs.length ? `겹친 윤곽 ${r.pairs.length}쌍 → 바깥(재료가 더 많은 쪽) ${r.outer.length}개 = '${FORGE}', 안쪽 ${r.inner.length}개 = '${MACH}'${c.apply === false ? ' (apply:false — 레이어는 안 바꿈)' : ' 레이어로 옮김 (되돌리기 Ctrl+Z)'}. 대조할 때 단조 외형을 빼려면 model3d_compare 에 "skip_layers":["${FORGE}"]` : '간격 0.2~6mm 로 나란히 겹친 윤곽(평행선·동심 호)을 찾지 못했습니다 — min·max 로 간격 범위를 바꿀 수 있습니다' };
  }

  /* ---------- ① 축 + 단면 외곽선 → 회전체 ---------- */
  function axisOf(c, outs) {
    if (Array.isArray(c.axis) && c.axis.length === 2 && Array.isArray(c.axis[0])) return { a: c.axis[0].map(Number), b: c.axis[1].map(Number), src: '좌표' };
    if (c.axis != null) { const e = flatEnts(doc.entities).find(x => String(x.id) === String(c.axis)); if (!e || e.type !== 'line') throw new Error('axis 는 중심선(선) id 또는 [[x1,y1],[x2,y2]]'); return { a: [e.a.x, e.a.y], b: [e.b.x, e.b.y], src: 'id ' + e.id }; }
    // 자동: 외곽선 상자를 지나는 중심선 중 가장 긴 것
    const B = bbP(outs.map(polyOf).filter(Boolean)), D = Math.hypot(B.w, B.h), cx = B.x0 + B.w / 2, cy = B.y0 + B.h / 2;
    let best = null;
    for (const e of flatEnts(doc.entities)) {
      if (!isCenter(e)) continue; const L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y); if (L < D * 0.2) continue;
      const d = [(e.b.x - e.a.x) / L, (e.b.y - e.a.y) / L], off = Math.abs((cx - e.a.x) * -d[1] + (cy - e.a.y) * d[0]);
      if (off > D * 0.6) continue;
      const u0 = (B.x0 - e.a.x) * d[0], sc = L - off * 0.5; if (!best || sc > best.sc) best = { sc, a: [e.a.x, e.a.y], b: [e.b.x, e.b.y], src: 'id ' + e.id };
    }
    if (!best) throw new Error('축(중심선)을 찾지 못했습니다 — axis 에 중심선 id 나 [[x1,y1],[x2,y2]] 를 주세요');
    return best;
  }
  // 반평면(v·sg ≥ 0)으로 자르기 (Sutherland–Hodgman)
  function clipHalf(P, sg) {
    const o = [], n = P.length, inn = q => q[1] * sg >= -1e-9;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], ia = inn(a), ib = inn(b);
      if (ia) o.push(a);
      if (ia !== ib) { const t = a[1] / (a[1] - b[1]); o.push([a[0] + (b[0] - a[0]) * t, 0]); }
    }
    return o;
  }
  function sectionProfile(c) {
    let ents = flatEnts(pick(c)).filter(isOutline);
    let split = null;
    if (c.use === 'inner' || c.use === 'machined' || c.use === '가공') {   // 가공 외형만: 단조(바깥) 윤곽 빼기
      split = splitOutline(c, ents); const out = new Set(split.outer); ents = ents.filter(e => !out.has(e) && e.layer !== FORGE);
    } else if (c.use === 'outer' || c.use === 'forged' || c.use === '단조') ents = ents.filter(e => e.layer !== MACH);
    if (!ents.length) throw new Error('단면 외곽선이 없습니다 (ids·box·선택 또는 외형선 레이어)');
    const ax = axisOf(c, ents);
    const L = Math.hypot(ax.b[0] - ax.a[0], ax.b[1] - ax.a[1]), d = [(ax.b[0] - ax.a[0]) / L, (ax.b[1] - ax.a[1]) / L];
    const toUV = ([x, y]) => [(x - ax.a[0]) * d[0] + (y - ax.a[1]) * d[1], (x - ax.a[0]) * -d[1] + (y - ax.a[1]) * d[0]];
    const R = regions(ents.map(polyOf).filter(p => p && p.length > 1));
    // 축 길이 밖(표제란·상세도 등)과 축에서 너무 먼 것은 뺌 — ids/box 로 직접 고르면 그대로
    const pickAll = (Array.isArray(c.ids) && c.ids.length) || Array.isArray(c.box);
    let loops = R.loops.map(p => p.map(toUV));
    const span = loops.length ? Math.max(...loops.map(p => Math.max(...p.map(q => Math.abs(q[1]))))) : 0;
    if (!pickAll) loops = loops.filter(p => { const us = p.map(q => q[0]); return Math.min(...us) >= -L * 0.05 && Math.max(...us) <= L * 1.05; });
    if (!loops.length) throw new Error('축 길이 안에 닫힌 단면이 없습니다 — 외곽선이 끊겼거나(틈) 축이 다릅니다. ids·box 로 단면만 골라 주세요');
    // 쓸 쪽: 축 위(+)·아래(-) 중 넓은 쪽 (side:"+"/"-")
    const side = c.side === '-' ? -1 : c.side === '+' ? 1 : (() => { let p = 0, m = 0; for (const P of loops) { const a = Math.abs(areaOf(P)); const v = P.reduce((s, q) => s + q[1], 0); if (v >= 0) p += a; else m += a; } return p >= m ? 1 : -1; })();
    const halves = loops.map(P => clipHalf(P, side).map(([u, v]) => [u, Math.abs(v)])).filter(P => P.length >= 3 && Math.abs(areaOf(P)) > R.tol * R.tol * 10);
    if (!halves.length) throw new Error('축 한쪽에 단면이 없습니다');
    // 안에 든 윤곽(속이 빈 곳) = 빼기
    const depth = halves.map((P, i) => halves.reduce((n, Q, j) => n + (j !== i && Math.abs(areaOf(Q)) > Math.abs(areaOf(P)) && P.filter(q => inPoly(q, Q)).length > P.length / 2 ? 1 : 0), 0));
    const u0 = Math.min(...halves.flatMap(P => P.map(q => q[0])));
    const fmt = P => '[' + P.map(([u, r]) => `[${+r.toFixed(4)},${+(u - u0).toFixed(4)}]`).join(',') + ']';
    const pos = halves.filter((_, i) => depth[i] % 2 === 0), neg = halves.filter((_, i) => depth[i] % 2 === 1);
    const rev = P => `revolve([0,0,0],"X",${fmt(P)})`;
    const body = pos.length === 1 ? rev(pos[0]) : `union(${pos.map(rev).join(',')})`;
    const shape = neg.length ? `cut(${body},${neg.map(rev).join(',')})` : body;
    const no = String(c.no || 'S1').replace(/"/g, ''), name = String(c.name || '회전체').replace(/"/g, ''), col = String(c.color || 'metal').replace(/"/g, '');
    const maxR = Math.max(...halves.flatMap(P => P.map(q => q[1]))), len = Math.max(...halves.flatMap(P => P.map(q => q[0]))) - u0;
    return { code: `part("${no}","${name}","${col}",${shape});`, info: { axis: { from: ax.a.map(v => +v.toFixed(3)), to: ax.b.map(v => +v.toFixed(3)), found: ax.src }, side: side > 0 ? '+' : '-', regions: pos.length, holes: neg.length, points: halves.reduce((s, P) => s + P.length, 0), length_mm: +len.toFixed(3), max_dia_mm: +(2 * maxR).toFixed(3), use: split ? `가공 외형만 (단조 윤곽 ${split.outer.length}개 뺌)` : (c.use ? '단조 외형' : '그대로'), skipped_far: R.loops.length - loops.length } };
  }
  async function cmdRevolve(c) {
    const P = sectionProfile(c);
    const r = (await ph().cmds([{ cmd: 'model3d', code: P.code }])).results[0];
    if (!r.ok) throw new Error('회전체를 만들지 못했습니다: ' + r.error);
    return Object.assign({}, P.info, { parts: r.parts, size_mm: r.size_mm, code: P.code.length <= 6000 ? P.code : undefined, code_chars: P.code.length,
      note: '회전체 3D 를 만들었습니다(축 = 3D X 축). 대조는 {"cmd":"model3d_compare","section":true}, 키홈·구멍처럼 회전체가 아닌 부분은 이 code 에 cut(...) 을 더해 model3d 로 다시 보내세요' });
  }
  ph().addCmd('revolve_section', cmdRevolve);
  ph().addCmd('outline_split', cmdSplit);
  window.LABSECTION = { splitOutline, sectionProfile, cmdRevolve, cmdSplit };

  /* ---------- 명령줄 ---------- */
  try {
    TOOLS.revsection = () => { (async () => { try { const v = lab()._v(); await v.ensure3D(); if (v.mode() === '2d') v.setMode('split'); const r = await cmdRevolve({}); log(`회전체 3D: 길이 ${r.length_mm} · 최대 지름 ${r.max_dia_mm} mm · 단면 ${r.regions}개${r.holes ? ' · 빈 곳 ' + r.holes : ''} (축 ${r.axis.found}) — 단면만 선택하면 그 도형만 씀`, 'ok'); } catch (e) { log('회전체를 만들지 못했습니다: ' + (e.message || e), 'err'); } })(); return null; };
    TOOLS.forgesplit = () => { try { const r = splitOutline({}); if (!r.pairs.length) { log('겹친 두 윤곽(간격 0.2~6mm)을 찾지 못했습니다', 'err'); return null; } const n = applySplit(r); log(`단조/가공 외형 나눔: 겹친 윤곽 ${r.pairs.length}쌍 → 바깥 ${r.outer.length}개 '${FORGE}'(자홍) · 안쪽 ${r.inner.length}개 '${MACH}'(하늘)${r.amb ? ` · 판단 못 한 쌍 ${r.amb}` : ''} (되돌리기 Ctrl+Z)`, 'ok'); } catch (e) { log('나누지 못했습니다: ' + (e.message || e), 'err'); } return null; };
    Object.assign(ALIAS, { REVSECTION: 'revsection', REVOLVESECTION: 'revsection', FORGESPLIT: 'forgesplit', OUTLINESPLIT: 'forgesplit' });
    Object.assign(CMD_KO, { revsection: '단면 → 회전체', forgesplit: '단조·가공 외형 나누기' });
    for (const k of ['회전체', '단면회전', '회전체만들기']) KO_CMD[k] = 'revsection';
    for (const k of ['단조가공', '단조외형', '가공외형', '외형나누기']) KO_CMD[k] = 'forgesplit';
  } catch (_) { }

  /* ---------- 가이드 (mucca_guide 뒤에 붙음) ---------- */
  const G = `단면도 · 회전체 (축·기어·플랜지·풀리처럼 축 둘레로 도는 부품)
 · {"cmd":"revolve_section"} — 축(중심선)과 단면 외곽선으로 회전체 3D 를 바로 만든다. 선·호를 하나씩 읽어 점을 계산할 필요 없음
     고르기: "ids":[외곽선 id...] 또는 "box":[x0,y0,x1,y1] 또는 지금 선택 (없으면 축 길이 안의 외형선 전부 — 표제란·상세도는 자동으로 빠짐)
     "axis": 중심선 id 또는 [[x1,y1],[x2,y2]] (없으면 단면을 지나는 가장 긴 중심선) · "side":"+"|"-" (전단면이면 넓은 쪽 자동)
     "use":"inner" = 가공 외형만(겹친 단조 윤곽은 뺌) · "outer" = 단조 외형 · "no"·"name"·"color" 부품 번호·이름·색
     → 결과의 code(회전체 코드)에 키홈·구멍을 cut 으로 더해 model3d 로 다시 보낼 수 있다
 · {"cmd":"outline_split"} — 같은 외형선 레이어에 겹친 두 윤곽(단조 외곽선과 가공 외곽선, 간격 0.2~6mm)을 찾아 바깥쪽 = '${FORGE}', 안쪽 = '${MACH}' 레이어로 나눔 ("apply":false 면 판정만, "min"·"max" 간격 범위)
 · 단면도 대조: {"cmd":"model3d_compare","section":true} — 3D 를 축이 지나는 면으로 잘라 그 윤곽(자른 면 + 뒤로 보이는 선)을 도면 단면과 비교. 크기가 3D 와 안 맞는 묶음(표제란·상세도·글자 표)은 자동으로 빼고 excluded 에 적음
     가공 외형만 대조하려면 outline_split 뒤 "skip_layers":["${FORGE}"]`;
  const hook = () => { const g = window.LAB2D; if (g && typeof g.guide === 'string') { if (!g.guide.includes('revolve_section')) g.guide += '\n\n' + G; return true; } return false; };
  if (!hook()) { let n = 0; const t = setInterval(() => { if (hook() || ++n > 40) clearInterval(t); }, 500); }
})();
