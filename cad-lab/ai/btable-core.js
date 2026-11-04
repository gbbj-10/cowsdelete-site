/* 장비 일람표(BTABLE) 계산 모듈 — AI 팀 5회차 개발1 (2026-11-05)
   계산만 한다. 화면·명령 등록은 btable-ui.js(개발2).
   약속(01 3.2 + 04 고친 점): window.BTABLE = { ver:1, scope(), tags(ents,opt), collect(ents,opt), rows(result,opt), csv(result,opt), tableCmd(result,at,opt) }
   - 블록 삽입(insert)을 블록 이름(+고른 속성 값)별로 묶어 "놓인 횟수"를 센다 (QTY 속성 합 아님)
   - doc.blocks 는 (doc && doc.blocks) || {} 로만 읽는다. BL() 를 부르지 않는다(새 도면에 doc.blocks 를 만들어 버림)
   - 익명 블록(이름이 * 로 시작)은 줄로 안 보임(anon:true 면 *U… 만 보임). 그 안의 insert 는 항상 셈 — 맨 위 사슬이면 top
   - 층: 실제 층 = 자기 층('0'·빈 층이면 바깥 실제 층). 꺼짐(visible===false)·얼림(frozen) → 그 insert 와 아래를 뺌. doc.layers 에 없는 층 = 보임
   - 순환: 시작 전에 블록 그래프의 순환 블록 집합을 한 번에 찾음. 순환으로 멈춤 = skipped.loop, 깊이 7 이상 = skipped.deep (flatInsert 와 같게 안쪽 깊이 1~6 만 셈)
   - 걸음 수 한도 200만: 넘으면 그 아래는 안 걸고 skipped.loop 에 더함, Result.partial = true (평소 false)
   - 메모 키 = 이름|물려받은 층|깊이|맨위사슬. 순환 블록은 이 키로 메모하지 않음(경로 위 순환 블록 집합까지 키에 넣어야만 메모)
   어떤 값이 들어와도 throw 하지 않는다. 도면은 바꾸지 않는다. */
(function () {
  'use strict';
  // 본체 전역(let/const/function)은 window 속성이 아닐 수 있어 이름으로 직접 찾는다(tlen-core 14줄과 같은 방식)
  const G = (name) => { try {
    switch (name) {
      case 'doc': return typeof doc !== 'undefined' ? doc : undefined;
      case 'sel': return typeof sel !== 'undefined' ? sel : undefined;
      case 'byId': return typeof byId !== 'undefined' ? byId : undefined;
      case 'blockAtts': return typeof blockAtts !== 'undefined' ? blockAtts : undefined;
      case 'twOf': return typeof twOf !== 'undefined' ? twOf : undefined;
    }
  } catch (_) { } return undefined; };
  const fn = (name) => { const f = G(name); return typeof f === 'function' ? f : null; };
  const SEP = '\u0001';
  const MAX_DEPTH = 6;
  const MAX_STEPS = 2000000; // 걸음 수 한도 — 서로 품은 순환 블록이 빽빽하면 넘김 → 더 내려가지 않고 skipped.loop 에 더함, partial:true
  const now = () => { try { return performance.now(); } catch (_) { return Date.now(); } };
  let COLL = null;
  const collator = () => { if (!COLL) { try { COLL = new Intl.Collator('ko', { numeric: true }); } catch (_) { COLL = { compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0) }; } } return COLL; };

  // ---------- opt ----------
  function normOpt(o) {
    o = o && typeof o === 'object' ? o : {};
    let tags = [];
    try {
      if (Array.isArray(o.tags)) for (const t of o.tags) {
        if (typeof t !== 'string' && typeof t !== 'number') continue;
        const T = String(t).trim().toUpperCase(); if (T && !tags.includes(T)) tags.push(T);
      }
    } catch (_) { tags = []; }
    const by = o.by === 'attrs' ? 'attrs' : 'name';
    return {
      by, tags: by === 'attrs' ? tags : [],
      nested: o.nested === 'all' ? 'all' : 'outer',
      hidden: o.hidden === true, anon: o.anon === true, ids: o.ids !== false,
      title: typeof o.title === 'string' ? o.title : '장비 일람표',
      h: typeof o.h === 'number' && isFinite(o.h) && o.h > 0 ? o.h : null,
    };
  }
  const pubOpt = (O) => ({ by: O.by, tags: O.tags.slice(), nested: O.nested, hidden: O.hidden, anon: O.anon });

  // ---------- 작은 도우미 ----------
  const nameOf = (e) => (typeof e.name === 'string' ? e.name : (typeof e.name === 'number' && isFinite(e.name) ? String(e.name) : ''));
  const isAnon = (n) => n.charCodeAt(0) === 42; // '*'
  const isU = (n) => n.length > 1 && (n.charCodeAt(1) === 85 || n.charCodeAt(1) === 117); // *U / *u
  const anonKey = (n) => n.slice(0, 2).toUpperCase();
  const layerName = (v) => (v == null || v === '' ? '0' : String(v));
  function blocksOf(d) { try { const b = d && d.blocks; return b && typeof b === 'object' ? b : {}; } catch (_) { return {}; } }
  function blockOf(B, n) { try { const b = Object.prototype.hasOwnProperty.call(B, n) ? B[n] : null; return b && Array.isArray(b.ents) ? b : null; } catch (_) { return null; } }
  function hiddenSet(d) {
    const h = new Set();
    try { if (d && Array.isArray(d.layers)) for (const l of d.layers) if (l && (l.visible === false || l.frozen)) h.add(String(l.name)); } catch (_) { }
    return h;
  }
  const zeroSk = () => ({ n: 0, anon: {}, hidden: 0, loop: 0, deep: 0, missing: 0, notInsert: 0 });
  const failRes = (O, msg, t0) => ({ ok: false, error: String(msg || '알 수 없는 오류'), opt: pubOpt(O), groups: [], total: 0, topInserts: 0, skipped: zeroSk(), partial: false, ms: Math.round((now() - t0) * 10) / 10 });

  // 순환에 걸린 블록 이름 집합 (Tarjan SCC, 반복형 — 재귀 깊이 걱정 없음). 크기 2 이상 묶음 또는 자기 자신을 품은 블록
  function cycleSet(B) {
    const out = new Set();
    let names; try { names = Object.keys(B); } catch (_) { return out; }
    const adj = new Map();
    for (const n of names) {
      const b = blockOf(B, n); const s = new Set();
      if (b) for (const x of b.ents) { if (x && x.type === 'insert') { const m = nameOf(x); if (blockOf(B, m)) s.add(m); } }
      adj.set(n, [...s]);
    }
    const idx = new Map(), low = new Map(), onSt = new Set(), st = []; let k = 0;
    for (const root of names) {
      if (idx.has(root)) continue;
      const work = [[root, 0]]; idx.set(root, k); low.set(root, k); k++; st.push(root); onSt.add(root);
      while (work.length) {
        const top = work[work.length - 1], v = top[0], nb = adj.get(v) || [];
        if (top[1] < nb.length) {
          const w = nb[top[1]++];
          if (!idx.has(w)) { idx.set(w, k); low.set(w, k); k++; st.push(w); onSt.add(w); work.push([w, 0]); }
          else if (onSt.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        } else {
          work.pop();
          if (work.length) { const p = work[work.length - 1][0]; low.set(p, Math.min(low.get(p), low.get(v))); }
          if (low.get(v) === idx.get(v)) {
            const comp = []; let w;
            do { w = st.pop(); onSt.delete(w); comp.push(w); } while (w !== v);
            if (comp.length > 1) for (const c of comp) out.add(c);
            else if ((adj.get(v) || []).includes(v)) out.add(v);
          }
        }
      }
    }
    return out;
  }

  // 속성 기본값(블록 정의의 attdef) — 이름별 메모. blockAtts 는 doc.blocks 가 이미 있을 때만 부름(없으면 BL() 이 도면을 바꿈)
  function makeAttr(d, B) {
    const memo = new Map();
    const BA = fn('blockAtts');
    const hasBlocks = (() => { try { return !!(d && d.blocks && typeof d.blocks === 'object'); } catch (_) { return false; } })();
    function defs(n) {
      let r = memo.get(n); if (r) return r;
      const o = {};
      let list = null;
      if (BA && hasBlocks) { try { const a = BA(n); if (Array.isArray(a)) list = a; } catch (_) { list = null; } }
      if (!list) { const b = blockOf(B, n); list = b ? b.ents.filter((x) => x && x.type === 'attdef') : []; }
      for (const a of list) {
        if (!a || a.tag == null) continue;
        const T = String(a.tag).trim().toUpperCase(); if (!T) continue;
        const v = a.def != null ? a.def : (a.value != null ? a.value : '');
        o[T] = String(v).trim();
      }
      r = { o, tags: Object.keys(o).sort() }; memo.set(n, r); return r;
    }
    // e 의 태그 값: 기본값 위에 e.attrs (태그 대문자, 값 앞뒤 공백 자름)
    function val(e, n, T) {
      try {
        const A = e.attrs;
        if (A && typeof A === 'object') {
          if (A[T] != null) return String(A[T]).trim();
          for (const k in A) if (Object.prototype.hasOwnProperty.call(A, k) && A[k] != null && String(k).trim().toUpperCase() === T) return String(A[k]).trim();
        }
      } catch (_) { }
      const D = defs(n).o; return D[T] != null ? D[T] : '';
    }
    function tagSet(e, n) {
      const base = defs(n).tags; let extra = null;
      try {
        const A = e.attrs;
        if (A && typeof A === 'object') for (const k in A) {
          if (!Object.prototype.hasOwnProperty.call(A, k)) continue;
          const T = String(k).trim().toUpperCase(); if (!T || base.includes(T)) continue;
          (extra || (extra = [])).includes(T) || extra.push(T);
        }
      } catch (_) { }
      return extra ? base.concat(extra).sort() : base;
    }
    return { val, tagSet };
  }

  // ---------- 범위 ----------
  function scope() {
    try {
      const d = G('doc'), S = G('sel');
      const all = d && Array.isArray(d.entities) ? d.entities : [];
      if (S && typeof S.size === 'number' && S.size > 0 && typeof S.has === 'function') {
        let ents;
        if (S.size > 64) ents = all.filter((e) => e && S.has(e.id));
        else { const f = fn('byId'); ents = []; for (const id of S) { let e = null; try { e = f ? f(id) : null; } catch (_) { e = null; } if (!e) e = all.find((x) => x && x.id === id) || null; if (e) ents.push(e); } }
        return { ents, label: '선택 ' + ents.length + '개', sel: true };
      }
      const H = hiddenSet(d); let n = 0;
      for (const e of all) if (e && !H.has(layerName(e.layer))) n++;
      return { ents: all.slice(), label: '도면 전체(보이는 층) ' + n + '개', sel: false };
    } catch (_) { return { ents: [], label: '도면 전체(보이는 층) 0개', sel: false }; }
  }

  // ents: 객체 배열 | id 문자열 배열 | Set | null(→ scope().ents)
  function toList(ents, d) {
    if (ents == null) return scope().ents;
    let arr;
    if (Array.isArray(ents)) arr = ents;
    else if (typeof ents === 'object' && typeof ents[Symbol.iterator] === 'function') arr = [...ents];
    else return null;
    let map = null; const out = [];
    for (const x of arr) {
      if (x && typeof x === 'object') { out.push(x); continue; }
      if (typeof x === 'string' || typeof x === 'number') {
        if (!map) { map = new Map(); try { for (const e of (d && Array.isArray(d.entities) ? d.entities : [])) if (e && e.id != null) map.set(String(e.id), e); } catch (_) { } }
        const e = map.get(String(x)); if (e) out.push(e);
      }
    }
    return out;
  }

  // ---------- 핵심 세기 ----------
  // keyMode: 'group'(opt 기준) | 'tags'(tags() 용: 이름 + 태그 묶음)
  function core(ents, O, keyMode) {
    const t0 = now();
    const d = G('doc'), B = blocksOf(d), H = O.hidden ? new Set() : hiddenSet(d);
    const list = toList(ents, d);
    if (!list) return failRes(O, 'ents 는 객체 배열·id 배열·Set 이어야 합니다', t0);
    const CYC = cycleSet(B), AT = makeAttr(d, B), ALL = O.nested === 'all', tags = O.tags;
    const sk = zeroSk();
    const memo = new Map();
    let steps = 0, partial = false;

    function keyOf(e, n) {
      if (keyMode === 'tags') { const ts = AT.tagSet(e, n); return { key: n + '\u0002' + ts.join(SEP), vals: null, ts }; }
      if (!tags.length) return { key: n, vals: {} };
      const vals = {}; let key = n;
      for (const T of tags) { const v = AT.val(e, n, T); vals[T] = v; key += SEP + v; }
      return { key, vals };
    }
    const newSk = () => ({ anon: {}, hidden: 0, loop: 0, deep: 0, missing: 0 });
    function addSk(a, b) { for (const k in b.anon) a.anon[k] = (a.anon[k] || 0) + b.anon[k]; a.hidden += b.hidden; a.loop += b.loop; a.deep += b.deep; a.missing += b.missing; }

    // 블록 n 의 안쪽(깊이 dep 의 insert 들)을 센다. L = 물려받은 실제 층, chain = 안의 insert 를 top 으로 셀지, path = 지금 경로(이름 Set)
    function walk(n, L, dep, chain, path) {
      const b = blockOf(B, n);
      const R = { g: new Map(), sk: newSk() };
      if (!b) return R;
      for (const s of b.ents) {
        if (!s || typeof s !== 'object' || s.type !== 'insert') continue;
        steps++;
        const m = nameOf(s);
        if (path.has(m)) { R.sk.loop++; continue; }
        if (dep > MAX_DEPTH) { R.sk.deep++; continue; }
        let sl = layerName(s.layer); if (sl === '0') sl = L;
        if (H.has(sl)) { R.sk.hidden++; continue; }
        const an = isAnon(m), row = !an || (O.anon && isU(m)), sb = blockOf(B, m);
        if (row) {
          const k = keyOf(s, m); let g = R.g.get(k.key);
          if (!g) { g = { name: m, vals: k.vals, ts: k.ts, missing: !sb, top: 0, nested: 0 }; R.g.set(k.key, g); }
          if (chain) g.top++; else g.nested++;
          if (!sb) R.sk.missing++;
        } else R.sk.anon[anonKey(m)] = (R.sk.anon[anonKey(m)] || 0) + 1;
        if (sb && (ALL || (chain && an))) {
          if (steps > MAX_STEPS) { R.sk.loop++; partial = true; continue; } // 한도 넘김: 이 insert 안쪽은 안 걸음
          const C = get(m, sl, dep + 1, chain && an, path);
          steps += C.g.size;
          for (const [kk, cg] of C.g) {
            let g = R.g.get(kk);
            if (!g) { g = { name: cg.name, vals: cg.vals, ts: cg.ts, missing: cg.missing, top: 0, nested: 0 }; R.g.set(kk, g); }
            g.top += cg.top; g.nested += cg.nested;
          }
          addSk(R.sk, C.sk);
        }
      }
      return R;
    }
    function get(n, L, dep, chain, path) {
      let key = n + '|' + L + '|' + dep + '|' + (chain ? 1 : 0);
      if (CYC.has(n)) { // 순환 블록: 경로 위 순환 블록 집합이 결과를 바꾸므로 그것까지 키에 넣음
        const on = []; for (const p of path) if (CYC.has(p)) on.push(p);
        key += '|' + on.sort().join(SEP);
      }
      let r = memo.get(key); if (r) return r;
      path.add(n);
      try { r = walk(n, L, dep, chain, path); } finally { path.delete(n); }
      memo.set(key, r); return r;
    }

    const groups = new Map(); let topInserts = 0;
    const gOf = (kk, name, vals, ts, missing) => {
      let g = groups.get(kk);
      if (!g) { g = { key: kk, name, vals, count: 0, top: 0, nested: 0, missing: !!missing }; if (ts) g._ts = ts; if (O.ids) g.ids = []; g._last = null; groups.set(kk, g); }
      return g;
    };
    const pushId = (g, id) => { if (g.ids && id != null && g._last !== id) { g.ids.push(id); g._last = id; } };
    try {
      for (const e of list) {
        if (!e || typeof e !== 'object') continue;
        if (e.type !== 'insert') { sk.notInsert++; continue; }
        const n = nameOf(e), lay = layerName(e.layer);
        if (H.has(lay)) { sk.hidden++; continue; }
        topInserts++;
        const an = isAnon(n), row = !an || (O.anon && isU(n)), b = blockOf(B, n);
        if (row) {
          const k = keyOf(e, n), g = gOf(k.key, n, k.vals, k.ts, !b);
          g.top++; pushId(g, e.id);
          if (!b) sk.missing++;
        } else sk.anon[anonKey(n)] = (sk.anon[anonKey(n)] || 0) + 1;
        if (b && (ALL || an)) {
          const C = get(n, lay, 1, an, new Set());
          for (const [kk, cg] of C.g) {
            const g = gOf(kk, cg.name, cg.vals, cg.ts, cg.missing);
            g.top += cg.top; g.nested += cg.nested; pushId(g, e.id);
          }
          addSk(sk, C.sk);
        }
      }
    } catch (err) { return failRes(O, (err && err.message) || err, t0); }

    let total = 0; const out = [];
    for (const g of groups.values()) { g.count = g.top + g.nested; total += g.count; delete g._last; out.push(g); }
    const C = collator();
    out.sort((a, b) => {
      let c = C.compare(a.name, b.name); if (c) return c;
      for (const T of tags) { c = C.compare((a.vals && a.vals[T]) || '', (b.vals && b.vals[T]) || ''); if (c) return c; }
      return 0;
    });
    let an = 0; for (const k in sk.anon) an += sk.anon[k];
    sk.n = an + sk.hidden + sk.loop + sk.deep;
    return { ok: true, opt: pubOpt(O), groups: out, total, topInserts, skipped: sk, partial, ms: Math.round((now() - t0) * 10) / 10 };
  }

  function collect(ents, opt) {
    const O = normOpt(opt);
    try {
      const r = core(ents, O, 'group');
      if (r.ok) for (const g of r.groups) delete g._ts;
      return r;
    } catch (err) { return failRes(O, (err && err.message) || err, now()); }
  }

  // 범위 안 insert 가 가진 속성 태그 → [{tag, n}] (n = 그 태그를 가진 insert 가 놓인 횟수, 내림차순 → 이름순)
  function tags(ents, opt) {
    try {
      const O = normOpt(Object.assign({}, opt && typeof opt === 'object' ? opt : {}, { by: 'name', tags: [] }));
      O.ids = false;
      const r = core(ents, O, 'tags');
      if (!r.ok) return [];
      const cnt = new Map();
      for (const g of r.groups) for (const T of (g._ts || [])) cnt.set(T, (cnt.get(T) || 0) + g.count);
      const C = collator();
      return [...cnt].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || C.compare(a.tag, b.tag));
    } catch (_) { return []; }
  }

  // ---------- 표·CSV ----------
  function resOk(result) { return result && typeof result === 'object' && Array.isArray(result.groups); }
  function tagsOfRes(result, opt) {
    const ro = resOk(result) && result.opt ? normOpt(result.opt) : normOpt(opt);
    return ro.tags;
  }
  function rows(result, opt) {
    try {
      const T = tagsOfRes(result, opt);
      const head = ['No', '블록 이름'].concat(T, ['개수']);
      const body = []; let total = 0;
      if (resOk(result)) {
        let i = 0;
        for (const g of result.groups) {
          if (!g || typeof g !== 'object') continue;
          const c = typeof g.count === 'number' && isFinite(g.count) ? g.count : 0;
          const vals = g.vals && typeof g.vals === 'object' ? g.vals : {};
          body.push([++i, String(g.name == null ? '' : g.name)].concat(T.map((t) => (vals[t] == null ? '' : String(vals[t]))), [c]));
          total += c;
        }
      }
      return { head, body, total };
    } catch (_) { return { head: ['No', '블록 이름', '개수'], body: [], total: 0 }; }
  }

  // CSV 수식 막기: = + - @ 탭 CR 로 시작하면 앞에 ' (단 -5·-0.5 같은 순수 음수와 '-' 한 글자는 그대로)
  function csvCell(v) {
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-\d+(\.\d+)?$/.test(s) && s !== '-') s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function csv(result, opt) {
    try {
      const R = rows(result, opt);
      const lines = [R.head].concat(R.body).map((r) => r.map(csvCell).join(','));
      return '﻿' + lines.join('\r\n') + '\r\n';
    } catch (_) { return '﻿'; }
  }

  // 표 칸 거르기 (본체 4883~ _tg46 칸 문법 무효화): 문자열만, '^' → '＾', 줄바꿈·\P → 공백, 남은 \ 는 모두 ＼ (\H…; 등 서식 시작 무효화)
  function cellSafe(v) {
    if (v == null) return '';
    let s = typeof v === 'number' ? (isFinite(v) ? String(v) : '') : String(v);
    s = s.replace(/\r\n|\r|\n/g, ' ').replace(/\\P/g, ' ').replace(/\\/g, '＼');
    if (s === '^') s = '＾';
    return s;
  }
  function textWidth(s, h) {
    const f = fn('twOf');
    if (f) { try { const w = f(s, h); if (typeof w === 'number' && isFinite(w) && w >= 0) return w; } catch (_) { } }
    return [...String(s)].length * h * 1.0;
  }
  function toAt(at) {
    try {
      if (Array.isArray(at) && at.length >= 2) { const x = +at[0], y = +at[1]; if (isFinite(x) && isFinite(y)) return [x, y]; }
      if (at && typeof at === 'object') { const x = +at.x, y = +at.y; if (isFinite(x) && isFinite(y)) return [x, y]; }
    } catch (_) { }
    return [0, 0];
  }
  function tableLayer(d) {
    try {
      const L = d && Array.isArray(d.layers) ? d.layers.find((l) => l && l.name === '문자') : null;
      if (L && (L.visible === false || L.frozen)) {
        const c = d && typeof d.current === 'string' && d.current ? d.current : '0';
        return c;
      }
    } catch (_) { return '문자'; }
    return '문자';
  }
  function tableCmd(result, at, opt) {
    const d = G('doc');
    let O; try { O = normOpt(Object.assign({}, resOk(result) && result.opt ? result.opt : {}, opt && typeof opt === 'object' ? opt : {})); } catch (_) { O = normOpt(null); }
    let h = O.h;
    if (!h) { let ds = 1; try { ds = d && typeof d.dimScale === 'number' && isFinite(d.dimScale) && d.dimScale > 0 ? d.dimScale : 1; } catch (_) { ds = 1; } h = 2.5 * ds; }
    h = Math.round(h * 1000) / 1000 || 2.5;
    try {
      const R = rows(result, opt);
      const C = R.head.length;
      const nested = resOk(result) && result.opt && result.opt.nested === 'all';
      const sumRow = [nested ? '합계(안쪽 포함)' : '합계'];
      for (let i = 1; i < C - 1; i++) sumRow.push('');
      sumRow.push(String(R.total));
      const grid = [R.head.map(cellSafe)].concat(R.body.map((r) => r.map(cellSafe)), [sumRow.map(cellSafe)]);
      const cols = [];
      for (let c = 0; c < C; c++) { let w = 0; for (const r of grid) w = Math.max(w, textWidth(r[c], h)); cols.push(w + 2 * h); }
      const title = cellSafe(O.title);
      const tw = textWidth(title, h * 1.2) + 2 * h, W = cols.reduce((a, b) => a + b, 0);
      if (tw > W) cols[1] += tw - W;
      for (let c = 0; c < C; c++) cols[c] = Math.max(Math.ceil(cols[c] * 10) / 10, 0.1);
      // 제목 줄: 본체 3644 규칙(rows[0] 의 둘째 칸부터 모두 null 이면 제목 줄 1.2배·가로 합침) — null 은 이 한 경우만
      const titleRow = [title]; for (let i = 1; i < C; i++) titleRow.push(null);
      const align = []; for (let c = 0; c < C; c++) align.push(c === 0 || c === C - 1 ? 'center' : 'left');
      return { cmd: 'table', at: toAt(at), cols, rows: [titleRow].concat(grid), h, align, layer: tableLayer(d) };
    } catch (_) {
      return { cmd: 'table', at: toAt(at), cols: [10 * h, 30 * h, 10 * h], rows: [['장비 일람표', null, null], ['No', '블록 이름', '개수'], ['합계', '', '0']], h, align: ['center', 'left', 'center'], layer: '문자' };
    }
  }

  window.BTABLE = { ver: 1, scope, tags, collect, rows, csv, tableCmd };
})();
