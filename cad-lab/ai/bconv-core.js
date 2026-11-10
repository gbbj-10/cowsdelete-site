/* 같은 모양 찾기 · 블록으로 바꾸기 계산 모듈 — AI 팀 13회차 개발1 (2026-11-10)
   AutoCAD 2025~2027 Smart Blocks "Search and Convert"(BCONVERT) 방식 따라잡기 v1.
   계산만 한다. 화면·명령 이름 등록은 bconv-ui.js(개발2). 여기서는 window.BCONV 와 COMMANDS.bconvert 만 더한다.
   약속(r13/04 결정):
     window.BCONV = { ver:1, sig(e), find(seedIds, opt{base?, rot:true, tol?}) }
       find -> { matches:[{ids, at:{x,y}, rot}], skipped:{prop, used, locked, other}, seed:{ids, base}, ms }
     COMMANDS.bconvert = c{seed, base:[x,y], name, expect:{matches}} -> { name, ids, n }
   v1 범위: 선·호·원만, 이동 + 0/90/180/270° 회전만(거울·축척 없음), 기준 모양 2개 이상·한 도면층, BEDIT 중 거절.
   방식
   - 대상 = pickableEnts()(꺼짐·얼림·잠김 층 제외) 중 선·호·원. insert(블록 안 객체)는 대상 아님.
     꺼짐·얼림·잠김 층의 같은 모양은 찾되 묶지 않고 skipped.locked 로 센다.
   - 거친 지문(길이·반지름·벌림각을 칸으로 나눈 번호, 이웃 칸까지)으로 후보를 줄이고, 실제 거리 ≤ tol 로 확정.
   - 닻 = 기준 모양 중 도면에서 같은 지문이 가장 드문 객체. 0°→90°→180°→270° 순서로 도면 전체를 훑어 처음 맞는 각도를 채택(대칭 모양은 0°).
     나머지 객체는 같은 변환으로 옮긴 자리 둘레 9칸(공간 해시)에서 짝을 찾는다. 회전은 정확한 90° 공식(삼각함수 오차 없음).
   - 호 각도는 360° 감기, 각도 오차는 tol/r. 선은 끝 순서 무관.
   - 한 번 쓴 객체(기준 모양 포함)는 다시 안 씀. 이미 찾은 묶음과 같은 자리·각도의 겹친 사본은 skipped.other.
   - find 는 doc 를 바꾸지 않고 log·사용 기록을 남기지 않는다. 지원 안 하는 입력은 throw.
   - bconvert 는 이름·expect 재검사 등 모든 검사를 끝낸 뒤에만 도면을 바꾼다. 원래 객체는 Set 한 번으로 지우고,
     insert 는 층 = 기준 층, color/lt/lw = null(ByLayer). 바꾸는 도중 예외가 나면 시작 직전 doc 사본(JSON)으로 되돌린 뒤 throw. */
(function () {
  'use strict';
  const ROTS = [0, 90, 180, 270];
  const TYPES = new Set(['line', 'arc', 'circle']);
  const now = () => { try { return performance.now(); } catch (_) { return Date.now(); } };
  const n360 = (a) => ((a % 360) + 360) % 360;
  const nz = (v) => (v === undefined ? null : v);
  /* 정확한 90° 배수 회전 */
  const R = (p, rot) => rot === 0 ? { x: p.x, y: p.y } : rot === 90 ? { x: -p.y, y: p.x } : rot === 180 ? { x: -p.x, y: -p.y } : { x: p.y, y: -p.x };
  const near = (a, b, t) => Math.abs(a.x - b.x) <= t && Math.abs(a.y - b.y) <= t && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= t * t;
  const angDiff = (a, b) => { const d = n360(a - b); return d > 180 ? 360 - d : d; };
  const sweepOf = (e) => { const s = n360(e.a1 - e.a0); return s === 0 ? 360 : s; };
  const lenOf = (e) => Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
  const repOf = (e) => e.type === 'line' ? { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 } : e.c;
  const geomOK = (e) => {
    const f = Number.isFinite;
    if (e.type === 'line') return e.a && e.b && f(e.a.x) && f(e.a.y) && f(e.b.x) && f(e.b.y);
    if (e.type === 'circle') return e.c && f(e.c.x) && f(e.c.y) && f(e.r) && e.r > 0;
    if (e.type === 'arc') return e.c && f(e.c.x) && f(e.c.y) && f(e.r) && e.r > 0 && f(e.a0) && f(e.a1);
    return false;
  };
  /* 지문 수: 선 = [길이], 원 = [r], 호 = [r, 벌림각×r(호 길이 단위로 맞춤)] */
  const vals = (e) => e.type === 'line' ? [lenOf(e)] : e.type === 'circle' ? [e.r] : [e.r, sweepOf(e) * Math.PI / 180 * e.r];
  const T1 = { line: 'L', circle: 'C', arc: 'A' };
  function keyOf(e, q, off) { const v = vals(e); let s = T1[e.type]; for (let i = 0; i < v.length; i++) s += ':' + (Math.floor(v[i] / q) + (off ? off[i] : 0)); return s; }
  function keysAround(e, q) { // 이웃 칸까지(1차원 3칸, 호는 2차원 9칸)
    const out = []; const n = vals(e).length;
    if (n === 1) { for (const d of [-1, 0, 1]) out.push(keyOf(e, q, [d])); }
    else { for (const d of [-1, 0, 1]) for (const g of [-1, 0, 1]) out.push(keyOf(e, q, [d, g])); }
    return out;
  }
  const sameVals = (a, b, tol) => { if (a.type !== b.type) return false; const x = vals(a), y = vals(b); for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > tol * 10) return false; return true; };
  /* 기준 객체 s 를 (rot, t) 로 옮긴 모양 */
  function xf(s, rot, t) {
    const F = (p) => { const r = R(p, rot); return { x: r.x + t.x, y: r.y + t.y }; };
    if (s.type === 'line') return { type: 'line', a: F(s.a), b: F(s.b) };
    if (s.type === 'circle') return { type: 'circle', c: F(s.c), r: s.r };
    return { type: 'arc', c: F(s.c), r: s.r, a0: n360(s.a0 + rot), a1: n360(s.a1 + rot) };
  }
  /* 실제 거리로 같은 모양인지 */
  function sameGeom(g, e, tol) {
    if (g.type !== e.type) return false;
    if (g.type === 'line') return (near(g.a, e.a, tol) && near(g.b, e.b, tol)) || (near(g.a, e.b, tol) && near(g.b, e.a, tol));
    if (!near(g.c, e.c, tol) || Math.abs(g.r - e.r) > tol) return false;
    if (g.type === 'circle') return true;
    const ta = (tol / Math.max(g.r, 1e-12)) * 180 / Math.PI;
    if (Math.abs(sweepOf(g) - sweepOf(e)) > 2 * ta) return false;
    return angDiff(g.a0, e.a0) <= ta && angDiff(g.a1, e.a1) <= ta;
  }
  const propsKey = (e) => [e.layer, nz(e.color), nz(e.lt), nz(e.lw)].join('\u0001');
  function arcBox(e, P) { // 호의 실제 범위(사분점 포함)
    const pt = (d) => P(e.c.x + e.r * Math.cos(d * Math.PI / 180), e.c.y + e.r * Math.sin(d * Math.PI / 180));
    pt(e.a0); pt(e.a1); const sw = sweepOf(e);
    for (const q of [0, 90, 180, 270]) if (n360(q - e.a0) <= sw) pt(q);
  }
  function seedBox(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const P = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const e of list) {
      if (e.type === 'line') { P(e.a.x, e.a.y); P(e.b.x, e.b.y); }
      else if (e.type === 'circle') { P(e.c.x - e.r, e.c.y - e.r); P(e.c.x + e.r, e.c.y + e.r); }
      else arcBox(e, P);
    }
    return { x0, y0, x1, y1 };
  }
  const D = () => doc; // 본체 전역(let)은 맨 이름으로 — 호출 때마다
  function inBedit() { try { return typeof bedit !== 'undefined' && bedit != null; } catch (_) { return false; } }

  function sig(e) {
    if (!e || !TYPES.has(e.type) || !geomOK(e)) return null;
    return keyOf(e, 0.001);
  }

  function find(seedIds, opt) {
    const t0 = now(); opt = opt || {};
    if (inBedit()) throw new Error('블록 편집(BEDIT) 중에는 같은 모양 찾기를 할 수 없습니다 — BCLOSE 후 다시 하세요');
    const ids = [...new Set(Array.isArray(seedIds) ? seedIds : (seedIds instanceof Set ? [...seedIds] : []))];
    if (ids.length < 2) throw new Error('기준 모양은 객체 2개 이상을 고르세요 (예: 문 = 선 + 호)');
    const all = D().entities, byIdMap = new Map(), idSet = new Set(ids);
    for (const e of all) if (idSet.has(e.id)) byIdMap.set(e.id, e);
    const okLayers = new Set(D().layers.filter((l) => l.visible && !l.frozen && !l.locked).map((l) => l.name));
    const seed = ids.map((id) => { const e = byIdMap.get(id); if (!e) throw new Error('기준 모양 객체가 도면에 없습니다'); return e; });
    for (const e of seed) {
      if (!TYPES.has(e.type)) throw new Error('같은 모양 찾기 v1 은 선·호·원만 됩니다 (폴리선·블록·글자 등은 지원 안 함)');
      if (!geomOK(e)) throw new Error('기준 모양에 좌표가 잘못된 객체가 있습니다');
      if (!okLayers.has(e.layer)) throw new Error('기준 모양이 꺼짐·얼림·잠김 도면층에 있습니다');
    }
    const L0 = seed[0].layer;
    if (seed.some((e) => e.layer !== L0)) throw new Error('기준 모양은 한 도면층에 있어야 합니다');
    const rots = opt.rot === false ? [0] : ROTS;
    const sb = seedBox(seed);
    let base;
    if (opt.base != null) {
      const b = Array.isArray(opt.base) ? { x: +opt.base[0], y: +opt.base[1] } : { x: +opt.base.x, y: +opt.base.y };
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) throw new Error('기준점 형식은 {x, y} 입니다');
      base = b;
    } else base = { x: (sb.x0 + sb.x1) / 2, y: (sb.y0 + sb.y1) / 2 };

    /* 대상: 선·호·원(블록 안 객체는 doc.entities 에 없음). 지문이 기준 모양과 비슷한 것만 색인 */
    let tol = +opt.tol;
    if (!(tol > 0)) {   /* 기준 모양 크기로(도면 전체로 잡으면 먼 곳 선 하나에 tol 이 커져 r905 를 r900 으로 봄) — 0.001~0.01 */
      const diag = Math.hypot(sb.x1 - sb.x0, sb.y1 - sb.y0);
      tol = Math.max(0.001, Math.min(0.01, 1e-6 * (Number.isFinite(diag) ? diag : 0)));
    }
    const q = Math.max(tol * 16, 1e-9);          // 지문 칸(거친 비교 허용 10·tol 보다 넓게)
    const cs = Math.max(tol * 4, 1e-9);          // 공간 해시 칸
    const want = new Map();                       // 지문 칸 -> 기준 객체 번호들
    seed.forEach((s, i) => { for (const k of keysAround(s, q)) { let a = want.get(k); if (!a) want.set(k, a = []); if (!a.includes(i)) a.push(i); } });
    const grid = new Map(), bySeed = seed.map(() => []);
    const hk = (ix, iy) => Math.imul(ix | 0, 73856093) ^ Math.imul(iy | 0, 19349663);   // 칸 번호 해시(겹쳐도 실제 거리로 다시 확인하므로 안전)
    const ck = (x, y) => hk(Math.floor(x / cs), Math.floor(y / cs));
    for (const e of all) {
      if (!TYPES.has(e.type) || !geomOK(e)) continue;
      const hit = want.get(keyOf(e, q)); if (!hit) continue;
      let any = false;
      for (const i of hit) if (sameVals(seed[i], e, tol)) { bySeed[i].push(e); any = true; }
      if (!any) continue;
      const p = repOf(e), k = ck(p.x, p.y); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(e);
    }
    const lookup = (g, used, taken) => { // 옮긴 모양 g 와 같은 객체: 쓸 수 있는 것 우선, 없으면 쓴 것 있는지
      const p = repOf(g), ix = Math.floor(p.x / cs), iy = Math.floor(p.y / cs); let usedHit = null;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const c = grid.get(hk(ix + dx, iy + dy)); if (!c) continue;
        for (const e of c) { if (taken.has(e.id) || !sameGeom(g, e, tol)) continue; if (used.has(e.id)) { usedHit = usedHit || e; continue; } return { e }; }
      }
      return usedHit ? { usedHit } : null;
    };

    /* 닻 = 후보가 가장 적은 기준 객체(같으면 원보다 선·호 — 방향이 정해짐) */
    let ai = 0;
    for (let i = 1; i < seed.length; i++) {
      const a = bySeed[i].length, b = bySeed[ai].length;
      if (a < b || (a === b && seed[ai].type === 'circle' && seed[i].type !== 'circle')) ai = i;
    }
    const A = seed[ai];
    const used = new Set(ids), matches = [], skipped = { prop: 0, used: 0, locked: 0, other: 0 };
    const placed = [{ at: base, rot: 0 }];       // 기준 모양 자리 포함
    const seedProps = seed.map(propsKey);
    const cands = bySeed[ai].slice().sort((a, b) => { const p = repOf(a), r = repOf(b); return (p.x - r.x) || (p.y - r.y) || (String(a.id) < String(b.id) ? -1 : 1); });
    /* 각도 바깥 고리: 도면 전체에서 0° 일치를 먼저 다 찾고, 그다음 90°·180°·270° (대칭 모양도 0° 로 고정) */
    const blocked = new Set();
    for (const rot of rots) {
      for (const C of cands) {
        if (used.has(C.id)) continue;
        /* 닻을 C 에 맞추는 이동 t */
        const ts = [];
        if (A.type === 'line') { const ra = R(A.a, rot); ts.push({ x: C.a.x - ra.x, y: C.a.y - ra.y }, { x: C.b.x - ra.x, y: C.b.y - ra.y }); }
        else { const rc = R(A.c, rot); ts.push({ x: C.c.x - rc.x, y: C.c.y - rc.y }); }
        for (const t of ts) {
          if (!sameGeom(xf(A, rot, t), C, tol)) continue;
          const taken = new Set([C.id]), grp = new Array(seed.length); grp[ai] = C; let ok = true, ub = false;
          for (let i = 0; i < seed.length && ok; i++) {
            if (i === ai) continue;
            const r = lookup(xf(seed[i], rot, t), used, taken);
            if (!r) ok = false; else if (r.e) { grp[i] = r.e; taken.add(r.e.id); } else { ok = false; ub = true; }
          }
          if (!ok) { if (ub) blocked.add(C.id); continue; }
          /* 일치 — 분류 */
          const rb = R(base, rot), at = { x: rb.x + t.x, y: rb.y + t.y };
          const gids = grp.map((e) => e.id);
          for (const id of gids) used.add(id);
          if (grp.some((e) => !okLayers.has(e.layer))) skipped.locked++;
          else if (placed.some((p) => p.rot === rot && near(p.at, at, tol))) skipped.other++;   // 겹친 사본
          else if (grp.some((e, i) => propsKey(e) !== seedProps[i])) skipped.prop++;
          else { matches.push({ ids: gids, at, rot }); placed.push({ at, rot }); }
          break;
        }
      }
    }
    for (const id of blocked) if (!used.has(id)) skipped.used++;   // 짝이 이미 다른 묶음에 쓰여 못 묶은 닻
    return { matches, skipped, seed: { ids: seed.map((e) => e.id), base: { x: base.x, y: base.y } }, ms: Math.round((now() - t0) * 10) / 10, tol };
  }

  /* ----- 블록으로 바꾸기 (runBatch 안에서 불림 — 되돌리기 1번은 runBatch 의 pushUndo) ----- */
  const BAD_NAME = /[<>\/\\":;?*|,=`]/;
  function bconvert(c) {
    c = c || {};
    if (inBedit()) throw new Error('블록 편집(BEDIT) 중에는 블록으로 바꿀 수 없습니다 — BCLOSE 후 다시 하세요');
    const name = String(c.name == null ? '' : c.name).trim();
    if (!name) throw new Error('블록 이름이 필요합니다');
    if (BAD_NAME.test(name)) throw new Error('이름에 쓸 수 없는 문자가 있습니다');
    const B = BL(), low = name.toLowerCase();
    for (const k of Object.keys(B)) if (k.toLowerCase() === low) throw new Error('같은 이름의 블록이 있습니다 (대소문자 무시): ' + k);
    const seedIds = Array.isArray(c.seed) ? c.seed : [];
    const base = c.base == null ? null : (Array.isArray(c.base) ? { x: +c.base[0], y: +c.base[1] } : { x: +c.base.x, y: +c.base.y });
    const R0 = find(seedIds, { base, rot: c.rot !== false, tol: c.tol });
    const exp = c.expect && Array.isArray(c.expect.matches) ? c.expect.matches : null;
    if (!exp) return { name, ids: [], n: 0, dry: true, found: R0.matches.length, skipped: R0.skipped }; // 미리보기 없이 도면 안 바꿈
    /* expect 의 모든 묶음이 지금도 그대로인지(id 집합·자리·각도) */
    const key = (ids) => ids.map(String).sort().join('\u0001');
    const cur = new Map(R0.matches.map((m) => [key(m.ids), m]));
    const todo = [], seen = new Set();
    for (const m of exp) {
      if (!m || !Array.isArray(m.ids)) throw new Error('expect 형식이 잘못되었습니다');
      const k = key(m.ids); if (seen.has(k)) throw new Error('expect 에 같은 묶음이 두 번 있습니다'); seen.add(k);
      const f = cur.get(k), at = m.at && { x: +(Array.isArray(m.at) ? m.at[0] : m.at.x), y: +(Array.isArray(m.at) ? m.at[1] : m.at.y) };
      if (!f || !at || +m.rot !== f.rot || !near(at, f.at, R0.tol)) throw new Error('찾은 뒤 도면이 바뀌었습니다 — 같은 모양을 다시 찾으세요 (도면은 그대로)');
      todo.push(f);
    }
    const seed = R0.seed.ids.map((id) => byId(id)), lay = seed[0].layer, b0 = R0.seed.base;
    const del = new Set(R0.seed.ids); for (const m of todo) for (const id of m.ids) del.add(id);

    /* 여기서부터 도면을 바꿈 — 예외 나면 사본으로 복원 */
    const snap = JSON.stringify(doc);
    /* 시험 전용: window.__BCONV_TEST_FAIL__ = k 가 있으면 insert k개 뒤 일부러 실패(한 번 쓰고 지움) */
    let failAt = null;
    try { if (window.__BCONV_TEST_FAIL__ != null) { failAt = +window.__BCONV_TEST_FAIL__; delete window.__BCONV_TEST_FAIL__; } } catch (_) {}
    try {
      const ents = seed.map((e) => { const x = JSON.parse(JSON.stringify(e)); delete x.id; delete x._ins; return x; });
      B[name] = { base: { x: b0.x, y: b0.y }, ents };
      const keep = []; for (const e of doc.entities) if (!del.has(e.id)) keep.push(e);
      doc.entities = keep;
      try { for (const id of del) sel.delete(id); } catch (_) {}
      const out = [], mk = (p, rot) => {
        if (failAt != null && out.length >= failAt) throw new Error('시험용 중간 실패');
        out.push(newEnt({ type: 'insert', name, p: { x: p.x, y: p.y }, sx: 1, sy: 1, rot, color: null, lt: null, lw: null }, { layer: lay }));
      };
      mk(b0, 0);
      for (const m of todo) mk(m.at, m.rot);
      return { name, ids: out, n: out.length };
    } catch (err) {
      doc = JSON.parse(snap);
      try { sel.clear(); } catch (_) {}
      throw err;
    }
  }

  const API = { ver: 1, sig, find };
  window.BCONV = API;
  COMMANDS.bconvert = (c) => bconvert(c);
})();
