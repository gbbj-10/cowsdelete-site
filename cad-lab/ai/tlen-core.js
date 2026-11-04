/* 총길이(TLEN) 계산 모듈 — AI 팀 4회차 개발1 (2026-11-04)
   계산만 한다. 화면·명령 등록은 tlen-ui.js(개발2).
   약속: window.TLEN = { ver, lenOf(e,opt), measure(ents,opt), scope() }
   - 선·호·원·폴리선(볼록 포함) → 본체 entLength(e)
   - 스플라인 → splineSamples(e) 꺾은선 합 (approx)
   - 타원·타원 호 → ellSamples(e,360) 꺾은선 합 (approx)
   - 블록(insert) → flatInsert(e) 로 회전·배율·대칭·중첩을 풀어 안쪽 합. sx≠sy 이고 안에 원·호·타원·볼록 폴리선이 있으면 approx
     블록 안 조각: 꺼짐·얼림 층이면 뺌 · byLayer 는 조각 층('0' 이면 insert 층) · 자기/순환 참조·6단 넘김은 skipped 'block-loop'
   - 그 밖(xline·ray·hatch·dim·table·text·mtext·attdef·point …)은 못 잰 것(skipped). prims() 일반 처리는 하지 않음(해치·표 이중 계산 방지)
   어떤 값이 들어와도 throw 하지 않는다. 도면(doc.entities)은 바꾸지 않는다. */
(function () {
  'use strict';
  // 본체 전역(let/const/function)은 window 속성이 아닐 수 있어 이름으로 직접 찾는다(eval 안 씀)
  const G = (name) => { try {
    switch (name) {
      case 'doc': return typeof doc !== 'undefined' ? doc : undefined;
      case 'sel': return typeof sel !== 'undefined' ? sel : undefined;
      case 'entLength': return typeof entLength !== 'undefined' ? entLength : undefined;
      case 'flatInsert': return typeof flatInsert !== 'undefined' ? flatInsert : undefined;
      case 'splineSamples': return typeof splineSamples !== 'undefined' ? splineSamples : undefined;
      case 'ellSamples': return typeof ellSamples !== 'undefined' ? ellSamples : undefined;
      case 'visibleEnts': return typeof visibleEnts !== 'undefined' ? visibleEnts : undefined;
      case 'byId': return typeof byId !== 'undefined' ? byId : undefined;
    }
  } catch (_) { } return undefined; };
  const fn = (name) => { const f = G(name); return typeof f === 'function' ? f : null; };
  const fin = (v) => typeof v === 'number' && isFinite(v) && v >= 0;
  const isPt = (p) => p && typeof p.x === 'number' && typeof p.y === 'number' && isFinite(p.x) && isFinite(p.y);
  const D2R = Math.PI / 180;
  const n360 = (a) => ((a % 360) + 360) % 360;

  // 본체 함수는 불러올 때마다 찾는다(실험판에서 나중에 덮어쓸 수 있음). 없으면 안전한 대체.
  const B = {
    entLength: () => fn('entLength'),
    flatInsert: () => fn('flatInsert'),
    splineSamples: () => fn('splineSamples'),
    ellSamples: () => fn('ellSamples'),
    visibleEnts: () => fn('visibleEnts'),
    byId: () => fn('byId'),
  };

  function polySum(pts) {
    if (!Array.isArray(pts)) return null;
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (!isPt(a) || !isPt(b)) continue;
      s += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return s;
  }

  // 본체 entLength 가 없을 때만 쓰는 대체 (선·호·원·폴리선 bulge)
  function basicLen(e) {
    switch (e.type) {
      case 'line': return isPt(e.a) && isPt(e.b) ? Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) : null;
      case 'circle': return fin(e.r) ? 2 * Math.PI * e.r : null;
      case 'arc': return fin(e.r) ? e.r * (n360(e.a1 - e.a0) || 360) * D2R : null;
      case 'polyline': {
        const P = e.pts; if (!Array.isArray(P)) return null;
        const n = P.length, m = e.closed ? n : n - 1; let s = 0;
        for (let i = 0; i < m; i++) {
          const A = P[i], C = P[(i + 1) % n]; if (!isPt(A) || !isPt(C)) continue;
          const c = Math.hypot(C.x - A.x, C.y - A.y), b = (Array.isArray(e.b) && +e.b[i]) || 0;
          if (!b) s += c; else { const th = 4 * Math.atan(Math.abs(b)); s += c * th / (2 * Math.sin(th / 2)); }
        }
        return s;
      }
    }
    return null;
  }

  function ellipseFallback(e, n) {
    if (!isPt(e.c) || !fin(e.rx) || !fin(e.ry)) return null;
    const a0 = e.a0 == null ? 0 : +e.a0, sp = e.a0 == null ? 360 : (n360(e.a1 - e.a0) || 360);
    const r = (+e.rot || 0) * D2R, o = [];
    for (let i = 0; i <= n; i++) {
      const t = (a0 + sp * i / n) * D2R, x = e.rx * Math.cos(t), y = e.ry * Math.sin(t);
      o.push({ x: e.c.x + x * Math.cos(r) - y * Math.sin(r), y: e.c.y + x * Math.sin(r) + y * Math.cos(r) });
    }
    return o;
  }

  const CURVY = { circle: 1, arc: 1, ellipse: 1 };
  // sx≠sy 블록(중첩 포함) 안에 원·호·타원·볼록 폴리선이 있으면 근사 — flatInsert 가 원을 원으로 남기기 때문
  function nonUniformCurvy(ins, depth, seen) {
    if (!ins || depth > 6) return false;
    const blocks = G('doc') && G('doc').blocks; const b = blocks && blocks[ins.name];
    if (!b || !Array.isArray(b.ents)) return false;
    const sx = ins.sx == null ? 1 : +ins.sx, sy = ins.sy == null ? 1 : +ins.sy;
    const nu = Math.abs(Math.abs(sx) - Math.abs(sy)) > 1e-9 * Math.max(1, Math.abs(sx), Math.abs(sy));
    for (const s of b.ents) {
      if (!s) continue;
      if (s.type === 'insert') {
        if (nu && hasCurvy(s, depth + 1, seen)) return true;
        if (nonUniformCurvy(s, depth + 1, seen)) return true;
      } else if (nu && (CURVY[s.type] || (s.type === 'polyline' && Array.isArray(s.b) && s.b.some((v) => +v)))) return true;
    }
    return false;
  }
  function hasCurvy(ins, depth, seen) {
    if (!ins || depth > 6) return false;
    const blocks = G('doc') && G('doc').blocks; const b = blocks && blocks[ins.name];
    if (!b || !Array.isArray(b.ents)) return false;
    const key = ins.name; if (seen.has(key)) return seen.get(key); seen.set(key, false);
    let r = false;
    for (const s of b.ents) {
      if (!s) continue;
      if (CURVY[s.type] || (s.type === 'polyline' && Array.isArray(s.b) && s.b.some((v) => +v))) { r = true; break; }
      if (s.type === 'insert' && hasCurvy(s, depth + 1, seen)) { r = true; break; }
    }
    seen.set(key, r); return r;
  }

  // 한 도형 길이 (블록 제외) → {len, approx} | null
  function lenPlain(e) {
    switch (e.type) {
      case 'line': case 'arc': case 'circle': case 'polyline': {
        const f = B.entLength(); let v = null;
        try { v = f ? f(e) : basicLen(e); } catch (_) { try { v = basicLen(e); } catch (__) { v = null; } }
        return fin(v) ? { len: v, approx: false } : null;
      }
      case 'spline': {
        if (!Array.isArray(e.pts) || e.pts.length < 2) return null;
        const f = B.splineSamples(); let pts = null;
        try { pts = f ? f(e) : e.pts; } catch (_) { pts = e.pts; }
        const v = polySum(pts);
        return fin(v) ? { len: v, approx: true } : null;
      }
      case 'ellipse': {
        if (!isPt(e.c) || !fin(e.rx) || !fin(e.ry)) return null;
        const f = B.ellSamples(); let pts = null;
        try { pts = f ? f(e, 360) : ellipseFallback(e, 360); } catch (_) { pts = ellipseFallback(e, 360); }
        const v = polySum(pts);
        return fin(v) ? { len: v, approx: true } : null;
      }
    }
    return null;
  }

  // 블록 펼치기 → [{e, len, approx}] (평면 조각)
  // 꺼짐·얼림 도면층 이름 모음 (visibleEnts 와 같은 기준)
  function hiddenLayers() {
    const h = new Set();
    try { const d = G('doc'); if (d && Array.isArray(d.layers)) for (const l of d.layers) if (l && (!l.visible || l.frozen)) h.add(String(l.name)); } catch (_) { }
    return h;
  }

  // 자기 자신·순환 참조 또는 중첩 깊이 한도(6단) 넘김 → true. memo: 블록 이름 → 결과
  const MAX_DEPTH = 6;
  function blockLoop(name, stack, depth, memo) {
    if (memo && memo.has(name)) return memo.get(name);
    const d = G('doc'); const b = d && d.blocks && d.blocks[name];
    if (!b || !Array.isArray(b.ents)) return false;
    stack.add(name); let r = false;
    for (const s of b.ents) {
      if (!s || s.type !== 'insert') continue;
      if (stack.has(s.name) || depth + 1 > MAX_DEPTH || blockLoop(s.name, stack, depth + 1, memo)) { r = true; break; }
    }
    stack.delete(name);
    if (memo && depth === 0) memo.set(name, r);
    return r;
  }

  // 블록 펼치기 → {len, approx, parts, layers:Map(층→{len,n})} | {loop:true} | null
  // 조각 층: flatInsert 가 이미 '0' 층 조각을 insert 의 층으로 바꿔 줌(AutoCAD 상속). 꺼짐·얼림 층 조각은 뺌
  function blockParts(ins, hidden, memo) {
    const f = B.flatInsert(); if (!f || !ins || typeof ins.name !== 'string' || !isPt(ins.p)) return null;
    try { if (blockLoop(ins.name, new Set(), 0, memo)) return { loop: true }; } catch (_) { return { loop: true }; }
    let list;
    try { list = f(ins); } catch (_) { return null; }
    if (!Array.isArray(list)) return null;
    let approx = false;
    try { approx = nonUniformCurvy(ins, 0, new Map()); } catch (_) { approx = false; }
    const H = hidden || hiddenLayers(), insL = ins.layer == null || ins.layer === '' ? '0' : String(ins.layer);
    let len = 0, parts = 0; const layers = new Map();
    for (const p of list) {
      if (!p || p.type === 'insert') continue; // flatInsert 가 이미 중첩을 풀었음
      let pl = p.layer == null || p.layer === '' ? '0' : String(p.layer);
      if (pl === '0') pl = insL;
      if (H.has(pl)) continue;
      const r = lenPlain(p); if (!r) continue;
      len += r.len; parts++; if (r.approx) approx = true;
      let a = layers.get(pl); if (!a) { a = { len: 0, n: 0 }; layers.set(pl, a); } a.len += r.len; a.n++;
    }
    return { len, approx, parts, layers };
  }

  // 내부용: 못 잰 이유(skip)까지 돌려줌
  function lenOfX(e, opt, hidden, memo) {
    try {
      if (!e || typeof e !== 'object' || typeof e.type !== 'string') return null;
      if (e.type === 'insert') {
        if (opt && opt.blocks === false) return null;
        const r = blockParts(e, hidden, memo);
        if (r && r.loop) return { skip: 'block-loop' };
        if (!r || r.parts === 0) return null;
        return r;
      }
      return lenPlain(e);
    } catch (_) { return null; }
  }

  function lenOf(e, opt) {
    const r = lenOfX(e, opt);
    if (!r || r.skip) return null;
    return e.type === 'insert' ? { len: r.len, approx: r.approx, parts: r.parts } : r;
  }

  function toList(ents) {
    if (ents == null) return [];
    if (Array.isArray(ents)) return ents;
    try { if (typeof ents[Symbol.iterator] === 'function' && typeof ents !== 'string') return Array.from(ents); } catch (_) { }
    return typeof ents === 'object' ? [ents] : [];
  }

  function measure(ents, opt) {
    const o = opt && typeof opt === 'object' ? opt : {};
    const res = { total: 0, count: 0, approx: false, blockParts: 0, skipped: { n: 0, byType: {} }, byLayer: [], byType: [] };
    const L = new Map(), T = new Map(), hidden = hiddenLayers(), memo = new Map();
    let list = toList(ents);
    const byIdF = B.byId();
    let byIdMap = null;
    for (let i = 0; i < list.length; i++) {
      let e = list[i];
      if (typeof e === 'string') { // id 문자열도 받아 줌
        if (!byIdMap) { byIdMap = new Map(); const d = G('doc'); if (d && Array.isArray(d.entities)) for (const x of d.entities) if (x && x.id) byIdMap.set(x.id, x); }
        e = byIdMap.get(e) || (byIdF ? (() => { try { return byIdF(e); } catch (_) { return null; } })() : null);
      }
      const r = lenOfX(e, o, hidden, memo);
      if (!r || r.skip) {
        const t = r && r.skip ? r.skip : (e && typeof e === 'object' && typeof e.type === 'string' ? e.type : '?');
        res.skipped.n++; res.skipped.byType[t] = (res.skipped.byType[t] || 0) + 1;
        continue;
      }
      res.total += r.len; res.count++;
      if (r.approx) res.approx = true;
      const addL = (ln, len, n) => { let a = L.get(ln); if (!a) { a = { layer: ln, len: 0, n: 0 }; L.set(ln, a); } a.len += len; a.n += n; };
      if (e.type === 'insert') { res.blockParts += r.parts || 0; for (const [ln, v] of r.layers) addL(ln, v.len, v.n); }
      else addL(e.layer == null || e.layer === '' ? '0' : String(e.layer), r.len, 1);
      let b = T.get(e.type); if (!b) { b = { type: e.type, len: 0, n: 0 }; T.set(e.type, b); } b.len += r.len; b.n++;
    }
    res.byLayer = [...L.values()].sort((x, y) => y.len - x.len);
    res.byType = [...T.values()].sort((x, y) => y.len - x.len);
    return res;
  }

  function scope() {
    try {
      const S = G('sel');
      const d = G('doc');
      if (S && typeof S.size === 'number' && S.size > 0) {
        let ents;
        if (S.size > 64 && d && Array.isArray(d.entities)) ents = d.entities.filter((e) => e && S.has(e.id));
        else { const f = B.byId(); ents = [...S].map((id) => { try { return f ? f(id) : null; } catch (_) { return null; } }).filter(Boolean); }
        return { ents, label: '선택 ' + ents.length + '개' };
      }
      let ents = [];
      const v = B.visibleEnts();
      try { ents = v ? v() : (d && Array.isArray(d.entities) ? d.entities.slice() : []); } catch (_) { ents = d && Array.isArray(d.entities) ? d.entities.slice() : []; }
      if (!Array.isArray(ents)) ents = [];
      return { ents, label: '도면 전체(보이는 층) ' + ents.length + '개' };
    } catch (_) { return { ents: [], label: '도면 전체(보이는 층) 0개' }; }
  }

  window.TLEN = { ver: 1, lenOf, measure, scope };
})();
