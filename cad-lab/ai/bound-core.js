/* 경계 만들기(BOUNDARY) 계산 모듈 — AI 팀 8회차 개발1 (2026-11-10)
   계산만 한다. 화면·명령 이름 등록은 bound-ui.js(개발2). 여기서는 COMMANDS.boundary 하나만 더한다.
   약속(r8/04 시작회의 결정):
     window.BOUND = { ver:1, at(p, opt{ids?, islands?, near?, auto?}), suspects(outer) }
     COMMANDS.boundary = c{points|pick, ids?, islands?} -> {ids, area, net}
   방식
   - 본체 findBoundary(경계 찾기)를 그대로 쓴다. findBoundaryIn 처럼 전역 visibleEnts 를 try/finally 로 잠깐 바꿔
     "클릭 점을 원점으로 옮긴 사본 목록"을 돌려주게 한다(먼 좌표 대책). doc 의 실제 객체·doc.blocks 는 안 건드린다.
   - 자동 창을 항상 먼저: 클릭 점 중심 반폭 h(대상 상자 대각선/256 부터) 창과 상자가 겹치는 객체만, 창 밖으로 나가는
     선분은 창 경계에서 자름(긴 선·ray 가 합치기 허용값을 키우지 않게). 바깥 고리가 창 안에 들어오면 채택, 아니면 h×2, 최대 12번.
     (창에 완전히 들어온 고리는 창 밖 객체로 바뀔 수 없음 — 창 밖 조각은 끝이 매달려 지워지거나 고리 밖에 있음)
   - 섬은 가장 바깥 것만(다른 섬 안에 든 섬은 뺌). 선 위 클릭은 bad-point.
   - at() 은 doc·undoStack·changed() 를 건드리지 않고 throw 하지 않는다. 사용 기록·log 를 남기지 않는다. */
(function () {
  'use strict';
  const MAX_TRIES = 12, SEG_MAX = 6000, D2R = Math.PI / 180;
  const SKIP = new Set(['dim', 'text', 'hatch', 'xline', 'attdef', 'point', 'mtext']);
  const CURVE = new Set(['circle', 'arc', 'ellipse', 'spline']);
  const now = () => { try { return performance.now(); } catch (_) { return Date.now(); } };
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const n360 = (a) => ((a % 360) + 360) % 360;
  const polarL = (c, r, deg) => ({ x: c.x + r * Math.cos(deg * D2R), y: c.y + r * Math.sin(deg * D2R) });
  const MSG = {
    many: '도형이 너무 많습니다 — S(객체 선택)로 범위를 골라 BO 를 다시 하세요 (큰 블록은 블록 대신 범위를 고르세요)',
    open: '닫힌 경계를 찾지 못했습니다',
    bad: '선 위를 눌렀습니다 — 안쪽을 누르세요'
  };
  const codeOf = (m) => /너무 많/.test(m) ? 'too-many' : /찾지 못/.test(m) ? 'open' : 'error';

  /* 본체 전역은 window 속성이 아닐 수 있어 맨 이름으로(호출 때마다) 찾는다 */
  const visList = () => (typeof visibleEnts === 'function' ? visibleEnts() : doc.entities);

  /* 상자 = 본체 boxOf(공유 배열 _SB 일 수 있으니 바로 복사). null 이면 prims 로 상자를 만들어 봄(ray 는 끝없음 = null) */
  function boxCopy(e) {
    let b = null; try { b = boxOf(e); } catch (_) { b = null; }
    if (b) return [b[0], b[1], b[2], b[3]];
    if (e.type === 'ray' || e.type === 'insert') return null;
    try {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const P = (p) => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; };
      for (const q of prims(e)) { if (q.k === 's') { P(q.a); P(q.b); } else { const r = Math.abs(q.r); P({ x: q.c.x - r, y: q.c.y - r }); P({ x: q.c.x + r, y: q.c.y + r }); } }
      return isFinite(x0 + y0 + x1 + y1) ? [x0, y0, x1, y1] : null;
    } catch (_) { return null; }
  }
  const hit = (b, w) => !b || !(b[2] < w[0] || b[0] > w[2] || b[3] < w[1] || b[1] > w[3]);
  const within = (b, w) => !!b && b[0] > w[0] && b[2] < w[2] && b[1] > w[1] && b[3] < w[3];

  /* 선분 [a,b] 를 상자 [-h,h]² 로 자름 (Liang–Barsky). 밖이면 null */
  function clip(a, b, h) {
    let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
    const pq = [[-dx, a.x + h], [dx, h - a.x], [-dy, a.y + h], [dy, h - a.y]];
    for (const [p, q] of pq) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }];
  }
  const arcN = (q) => { const sp = q.a0 == null ? 360 : (n360(q.a1 - q.a0) || 360); return { a0: q.a0 ?? 0, sp, n: Math.max(8, Math.ceil(sp / 6)) }; };

  /* 사본 만들기: 원점 = O, 창 반폭 h(null 이면 자르지 않음). 반환 {list, segs, curves:[box..]} 또는 {many:true} */
  function buildCopies(src, O, h) {
    const list = [], curves = []; let segs = 0;
    const sh = (p) => ({ x: p.x - O.x, y: p.y - O.y });
    const W = h == null ? null : [-h, -h, h, h];
    const line = (a, b) => {
      if (W) { const c = clip(a, b, h); if (!c) return; a = c[0]; b = c[1]; }
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 0) return;
      list.push({ type: 'line', a, b, layer: '0' }); segs++;
    };
    const primSegs = (e) => { // 이미 옮긴 사본 e 를 선분으로 (호는 본체 findBoundary 와 같은 6° 나눔)
      for (const q of prims(e)) {
        if (q.k === 's') { line(q.a, q.b); continue; }
        const A = arcN(q); for (let i = 0; i < A.n; i++) line(polarL(q.c, q.r, A.a0 + A.sp * i / A.n), polarL(q.c, q.r, A.a0 + A.sp * (i + 1) / A.n));
      }
    };
    for (const it of src) {
      if (segs > SEG_MAX) return { many: true };
      const e = it.e, t = e.type, b = it.b; // b = 월드 상자 또는 null
      const bl = b ? [b[0] - O.x, b[1] - O.y, b[2] - O.x, b[3] - O.y] : null;
      const inside = !W || within(bl, W);
      if (CURVE.has(t) || (t === 'polyline' && Array.isArray(e.b) && e.b.some(v => +v))) if (bl) curves.push(bl);
      if (t === 'line') { if (!e.a || !e.b) continue; line(sh(e.a), sh(e.b)); continue; }
      if (t === 'polyline' || t === 'circle' || t === 'arc' || t === 'ellipse') {
        let c;
        if (t === 'arc' || t === 'ellipse') { c = structuredClone(e); c.c = sh(e.c); } // 이동만: 각도·반지름 그대로(정확)
        else { c = structuredClone(e); transformEnt(c, sh, null, false); }
        if (inside) { // 통째로 둠 → 본체가 같은 방식으로 나누고, 원·닫힌 폴리선·타원은 섬으로도 잡힘
          let n = 0; for (const q of prims(c)) n += q.k === 's' ? 1 : arcN(q).n; segs += n; list.push(c);
        } else primSegs(c);
        continue;
      }
      // 스플라인·표·ray·기타: 본체 prims 로 선분을 얻어 옮기고 자름
      let ps; try { ps = prims(e); } catch (_) { ps = []; }
      for (const q of ps) {
        if (q.k === 's') { line(sh(q.a), sh(q.b)); continue; }
        const qc = { c: sh(q.c), r: q.r, a0: q.a0, a1: q.a1 }, A = arcN(qc);
        for (let i = 0; i < A.n; i++) line(polarL(qc.c, qc.r, A.a0 + A.sp * i / A.n), polarL(qc.c, qc.r, A.a0 + A.sp * (i + 1) / A.n));
      }
    }
    return segs > SEG_MAX ? { many: true } : { list, segs, curves };
  }

  /* 본체 findBoundary 를 사본 목록으로 부름 (visibleEnts 를 잠깐 바꿈, finally 로 되돌림) */
  function runFB(list) {
    const save = visibleEnts;
    visibleEnts = () => list;
    try { return { L: findBoundary({ x: 0, y: 0 }) }; }
    catch (e) { const m = String(e && e.message || e); return { code: codeOf(m), msg: m }; }
    finally { visibleEnts = save; }
  }

  /* 한 줄 위 점 합치기(꺾이는 각 sin < 1e-9 이고 앞으로 가는 점만) + 겹친 점 빼기 */
  function simplify(lp) {
    let o = lp.slice(), ch = true;
    while (ch && o.length > 3) {
      ch = false;
      for (let i = 0; i < o.length && o.length > 3; i++) {
        const a = o[(i - 1 + o.length) % o.length], b = o[i], c = o[(i + 1) % o.length];
        const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y, lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
        if (lu <= 1e-12 * (1 + Math.abs(b.x) + Math.abs(b.y))) { o.splice(i, 1); i--; ch = true; continue; }
        if (Math.abs(ux * vy - uy * vx) <= 1e-9 * lu * lv && ux * vx + uy * vy > 0) { o.splice(i, 1); i--; ch = true; }
      }
    }
    return o;
  }
  const areaS = (lp) => { let A = 0; for (let i = 0; i < lp.length; i++) { const a = lp[i], b = lp[(i + 1) % lp.length]; A += a.x * b.y - b.x * a.y; } return A / 2; };
  const perimS = (lp) => { let s = 0; for (let i = 0; i < lp.length; i++) { const a = lp[i], b = lp[(i + 1) % lp.length]; s += Math.hypot(b.x - a.x, b.y - a.y); } return s; };
  function inP(p, poly) {
    if (typeof inPoly === 'function') return inPoly(p, poly);
    let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-12) + a.x)) ins = !ins; } return ins;
  }
  const isClosedObj = (e) => { try { return typeof closedLoopOf === 'function' && !!closedLoopOf(e); } catch (_) { return false; } };

  /* 대상 목록: [{e, b}] — 최상위 객체와 상자(복사본) */
  function targets(opt) {
    let vis = visList();
    if (opt && Array.isArray(opt.ids) && opt.ids.length) { const s = new Set(opt.ids); vis = vis.filter(e => s.has(e.id)); }
    const out = [];
    for (const e of vis) { if (!e || SKIP.has(e.type)) continue; out.push({ e, b: boxCopy(e) }); }
    return out;
  }
  /* 창과 겹치는 것만 고르고, 블록은 펼쳐 조각마다 다시 고름 */
  function pick(T, w) {
    const out = [];
    for (const it of T) {
      if (!hit(it.b, w)) continue;
      if (it.e.type !== 'insert') { out.push(it); continue; }
      let fl = []; try { fl = flatEnts([it.e]); } catch (_) { fl = []; }
      for (const f of fl) { if (!f || SKIP.has(f.type)) continue; const fb = boxCopy(f); if (hit(fb, w)) out.push({ e: f, b: fb }); }
    }
    return out;
  }
  function flatAll(T) { return pick(T, [-Infinity, -Infinity, Infinity, Infinity]); }

  /* 클릭 점에서 가장 가까운 선(본체 prims 기준, 호는 참 거리) */
  function onLine(T, p, nearTol) {
    const r = nearTol, w = [p.x - r, p.y - r, p.x + r, p.y + r];
    for (const it of pick(T, w)) {
      let ps; try { ps = prims(it.e); } catch (_) { continue; }
      for (const q of ps) {
        if (q.k === 's') {
          const ax = q.a.x - p.x, ay = q.a.y - p.y, bx = q.b.x - p.x, by = q.b.y - p.y, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          let t = L > 0 ? -(ax * dx + ay * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          if (Math.hypot(ax + dx * t, ay + dy * t) <= r) return true;
        } else {
          const cx = q.c.x - p.x, cy = q.c.y - p.y, d = Math.hypot(cx, cy), R = Math.abs(q.r);
          if (q.a0 == null) { if (Math.abs(d - R) <= r) return true; continue; }
          const ang = n360(Math.atan2(-cy, -cx) / D2R), sp = n360(q.a1 - q.a0) || 360;
          if (n360(ang - q.a0) <= sp && Math.abs(d - R) <= r) return true;
          for (const g of [q.a0, q.a1]) { const e2 = polarL({ x: cx, y: cy }, R, g); if (Math.hypot(e2.x, e2.y) <= r) return true; }
        }
      }
    }
    return false;
  }

  function at(p, opt) {
    const t0 = now();
    try {
      opt = opt && typeof opt === 'object' ? opt : {};
      if (!p || !fin(+p.x) || !fin(+p.y)) return { ok: false, code: 'bad-point', msg: '점 형식은 {x, y} 입니다' };
      const P0 = { x: +p.x, y: +p.y };
      const T = targets(opt);
      if (!T.length) return { ok: false, code: 'open', msg: MSG.open, tries: 0, ms: Math.round(now() - t0) };
      // 대상 전체 상자
      let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
      for (const it of T) { const b = it.b; if (!b) continue; if (b[0] < X0) X0 = b[0]; if (b[1] < Y0) Y0 = b[1]; if (b[2] > X1) X1 = b[2]; if (b[3] > Y1) Y1 = b[3]; }
      const haveBB = isFinite(X0 + Y0 + X1 + Y1);
      const diag = haveBB ? Math.hypot(X1 - X0, Y1 - Y0) : 0;
      // 선 위 클릭
      const nearTol = Math.max(fin(+opt.near) && +opt.near > 0 ? +opt.near : 0, 1e-9);
      if (onLine(T, P0, nearTol)) return { ok: false, code: 'bad-point', msg: MSG.bad, tries: 0, ms: Math.round(now() - t0) };

      let res = null, win = null, tries = 0, last = { code: 'open', msg: MSG.open }, curves = [];
      if (opt.auto === false) { // 창 없이(옮긴 사본만) — 시험·비교용
        tries = 1;
        const cp = buildCopies(flatAll(T), P0, null);
        if (cp.many) last = { code: 'too-many', msg: MSG.many };
        else { const r = runFB(cp.list); if (r.L) { res = r.L; curves = cp.curves; } else last = r; }
      } else {
        let h = diag > 0 ? diag / 256 : 1, lo = 0, hi = Infinity; // lo = 모자랐던 가장 큰 h, hi = 너무 많았던 가장 작은 h
        const noNull = !T.some(it => !it.b);
        for (tries = 1; tries <= MAX_TRIES; tries++) {
          const w = [P0.x - h, P0.y - h, P0.x + h, P0.y + h];
          const cover = haveBB && w[0] <= X0 && w[1] <= Y0 && w[2] >= X1 && w[3] >= Y1; // 창이 대상 전체를 덮음
          const cp = buildCopies(pick(T, w), P0, h);
          let r = cp.many ? { code: 'too-many', msg: MSG.many } : runFB(cp.list);
          if (r.L) {
            const lim = h * (1 - 1e-9);
            if ((cover && noNull) || r.L[0].every(v => Math.abs(v.x) < lim && Math.abs(v.y) < lim)) { res = r.L; win = w; curves = cp.curves; break; }
            r = { code: 'open', msg: MSG.open }; // 창에 걸침 → 넓힘
          }
          if (r.code === 'error') r = { code: 'error', msg: /^경계 계산 오류/.test(r.msg) ? r.msg : '경계 계산 오류: ' + String(r.msg).slice(0, 120) }; // 내부 오류는 open 으로 숨기지 않음(창 넓히기는 계속)
          last = r;
          if (r.code === 'too-many') { hi = h; h = lo > 0 ? (lo + hi) / 2 : h / 4; } // 너무 많음 → 창을 줄여 봄(멀리 떨어진 객체 때문에 첫 창이 클 때)
          else { if (cover && noNull) break; lo = h; h = isFinite(hi) ? (lo + hi) / 2 : h * 2; }
          if (isFinite(hi) && (hi / Math.max(lo, 1e-300) < 1.05 || h < 1e-9)) { if (last.code !== 'error') last = { code: 'too-many', msg: MSG.many }; break; }
        }
        if (tries > MAX_TRIES) tries = MAX_TRIES;
        if (!res && isFinite(hi) && last.code !== 'error') last = { code: 'too-many', msg: MSG.many }; // 더 넓은 창이 필요한데 그 창은 너무 많음 → S 로 범위 고르기 안내
      }
      if (!res) return { ok: false, code: last.code, msg: last.code === 'too-many' ? MSG.many : last.msg, tries, ms: Math.round(now() - t0) };

      // 결과 정리(옮긴 좌표에서) → 원래 좌표로
      let outerS = simplify(res[0]); if (areaS(outerS) < 0) outerS.reverse();
      let isl = res.slice(1).map(l => { const s = simplify(l); if (areaS(s) < 0) s.reverse(); return s; });
      // 가장 바깥 섬만 + 같은 섬 두 번 빼기
      const ia = isl.map(l => Math.abs(areaS(l)));
      isl = isl.filter((l, i) => !isl.some((m, j) => j !== i && (
        (ia[j] > ia[i] * (1 + 1e-9) && l.every(q => inP(q, m))) ||
        (j < i && Math.abs(ia[j] - ia[i]) <= 1e-9 * ia[i] && m.length === l.length && l.every(q => m.some(r => Math.abs(r.x - q.x) + Math.abs(r.y - q.y) < 1e-9 * (1 + h0(res)))))
      )));
      const area = Math.abs(areaS(outerS)), perim = perimS(outerS);
      const islandArea = isl.reduce((s, l) => s + Math.abs(areaS(l)), 0);
      // 근사: 고리 상자 안(겹침)에 곡선 객체가 있으면
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const q of outerS) { if (q.x < bx0) bx0 = q.x; if (q.x > bx1) bx1 = q.x; if (q.y < by0) by0 = q.y; if (q.y > by1) by1 = q.y; }
      const LB = [bx0, by0, bx1, by1], approx = curves.some(b => hit(b, LB));
      const back = (l) => l.map(q => [q.x + P0.x, q.y + P0.y]);
      const WB = [bx0 + P0.x, by0 + P0.y, bx1 + P0.x, by1 + P0.y];
      // 도곽 의심: 고리 상자가 대상 상자의 가로·세로 90% 이상(bigBox) + 그 안에 섬이 아닌 다른 객체가 있음(bigFrame)
      const bigBox = haveBB && (X1 - X0) > 0 && (Y1 - Y0) > 0 && (WB[2] - WB[0]) >= 0.9 * (X1 - X0) && (WB[3] - WB[1]) >= 0.9 * (Y1 - Y0);
      let bigFrame = false;
      if (bigBox) {
        const ex = 1e-6 * Math.max(WB[2] - WB[0], WB[3] - WB[1]), inner = [WB[0] + ex, WB[1] + ex, WB[2] - ex, WB[3] - ex];
        // "고리를 이루지 않는 다른 객체": 고리 선 위에 끝점이 하나도 없고, 섬(닫힌 객체)도 아니고, 고리 안에 통째로 든 것
        const exS = Math.max(ex, 1e-9), segD = (q, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let t = L > 0 ? ((q.x - a.x) * dx + (q.y - a.y) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y); };
        const onLoop = (q) => { for (let i = 0; i < outerS.length; i++) if (segD(q, outerS[i], outerS[(i + 1) % outerS.length]) <= exS) return true; return false; };
        const ptsOf = (e) => { const o = []; let ps = []; try { ps = e.type === 'insert' ? flatEnts([e]).flatMap(f => SKIP.has(f.type) ? [] : prims(f)) : prims(e); } catch (_) { ps = []; }
          for (const q of ps) { if (q.k === 's') { o.push(q.a, q.b); } else { const A = arcN(q); for (let i = 0; i <= A.n; i += Math.max(1, A.n >> 3)) o.push(polarL(q.c, q.r, A.a0 + A.sp * i / A.n)); } } return o; };
        bigFrame = T.some(it => {
          if (!within(it.b, inner) || isClosedObj(it.e)) return false;
          const ps = ptsOf(it.e).map(q => ({ x: q.x - P0.x, y: q.y - P0.y })); if (!ps.length) return false;
          return ps.every(q => !onLoop(q) && inP(q, outerS));
        });
      }
      return { ok: true, outer: back(outerS), islands: isl.map(back), area, perim, islandArea, net: area - islandArea,
        approx, bigFrame, bigBox, win, tries, ms: Math.round((now() - t0) * 10) / 10 };
    } catch (e) {
      return { ok: false, code: 'error', msg: '경계 계산 오류: ' + String(e && e.message || e).slice(0, 120), ms: Math.round(now() - t0) };
    }
  }
  function h0(L) { let m = 0; for (const q of L[0]) m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); return m; }

  /* 고리 안 틈 의심 수: GEOCHK 있으면 고리 상자 근처 객체만 scan → issues 중 at 이 고리 안인 것. 없으면 -1 */
  function suspects(outer) {
    try {
      if (!window.GEOCHK || typeof GEOCHK.scan !== 'function') return -1;
      if (!Array.isArray(outer) || outer.length < 3) return 0;
      const poly = outer.map(q => Array.isArray(q) ? { x: +q[0], y: +q[1] } : { x: +q.x, y: +q.y });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of poly) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
      const tol = (GEOCHK.defaults && +GEOCHK.defaults.tol) || 1, w = [x0 - tol, y0 - tol, x1 + tol, y1 + tol];
      const cand = doc.entities.filter(e => e && hit(boxCopy(e), w));
      const r = GEOCHK.scan(cand);
      return ((r && r.issues) || []).filter(i => i && i.at && inP(i.at, poly)).length;
    } catch (_) { return -1; }
  }

  window.BOUND = { ver: 1, at, suspects };

  /* AI·배치 명령: 모든 점을 먼저 계산 → 하나라도 실패면 throw(아무것도 안 만듦) → 현재 층에 닫힌 폴리선 */
  COMMANDS.boundary = (c) => {
    c = c || {};
    const raw = Array.isArray(c.points) && c.points.length ? c.points : (c.pick != null ? [c.pick] : (c.at != null ? [c.at] : []));
    if (!raw.length) throw new Error('points(안쪽 점 [x, y] 목록)가 필요합니다');
    let ids;
    if (Array.isArray(c.ids)) ids = c.ids.slice();
    else if (c.ids === 'selection') ids = [...sel];
    const pts = raw.map((q, i) => { const v = Array.isArray(q) ? { x: +q[0], y: +q[1] } : (q && typeof q === 'object' ? { x: +q.x, y: +q.y } : null);
      if (!v || !fin(v.x) || !fin(v.y)) throw new Error(`점 ${i + 1}: 형식은 [x, y] 입니다`); return v; });
    const R = pts.map(p => at(p, { ids, near: c.near }));
    const bad = R.findIndex(r => !r.ok);
    if (bad >= 0) throw new Error((R.length > 1 ? `점 ${bad + 1}: ` : '') + R[bad].msg);
    const out = [], seen = new Set(); let area = 0, net = 0;
    const key = (l) => l.map(q => q[0].toPrecision(12) + ',' + q[1].toPrecision(12)).sort().join(';');
    for (const r of R) {
      const loops = [r.outer].concat(c.islands ? r.islands : []);
      const k0 = key(r.outer); if (seen.has(k0)) continue; // 같은 칸을 두 번 누름
      area += r.area; net += r.net;
      for (const l of loops) { const k = key(l); if (seen.has(k)) continue; seen.add(k); out.push(COMMANDS.polyline({ points: l, closed: true }).id); }
    }
    return { ids: out, area, net };
  };
})();
