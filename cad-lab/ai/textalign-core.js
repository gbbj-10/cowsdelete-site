/* 글자 줄 맞춤(TEXTALIGN) 계산 모듈 — AI 팀 10회차 개발1 (2026-11-10)
   계산과 COMMANDS.textalign 만. 화면·명령 이름 등록은 textalign-ui.js(개발2).
   약속(r10/04 결정):
     window.TALIGN = { ver:1, edges(e), plan(texts, opt) }
       edges(e) -> {left, center, right, base}   textW(e) + e.align 으로 직접 계산(bbox·entPts 안 씀)
                   base(밑줄 y) = e.mt ? p.y − h : p.y
       plan(texts, opt{baseId?, dir:'V'|'H', just:'L'|'C'|'R', space:'K'|'E'|'S', gap?})
            -> { moves:[{id, from:{x,y}, to:{x,y}}], skipped:{rotated, locked, off, block, mt, other}, base:id,
                 est, space }          (est·space 는 덧붙인 정보: 폭 추정이 낀 이동 수, 실제로 쓴 간격 방식)
     COMMANDS.textalign = c{ids, baseId?, dir?, just?, space?, gap?, expect?:{id:[x,y]}} -> {ids, n, ...}
   규칙
   - 순서는 자기 함수(9회차 TCOUNT 안 부름): V = 밑줄 y 큰 것부터, 같은 줄(0.5×h 안)은 왼쪽 가장자리 → id.
     H = 왼쪽 가장자리 작은 것부터 → 밑줄 y 큰 것 → id.
   - 기준 = baseId 또는 순서 첫 글자. 기준은 절대 안 움직임. 기준이 회전·글자 아님·없음이면 throw.
   - V: x 를 기준의 왼쪽/가운데/오른쪽 가장자리에 맞춤. H: 밑줄 y 를 기준 밑줄에 맞춤(x 그대로).
   - 간격 E: 처음·끝 그대로, 사이를 같은 간격(V 는 밑줄 y, H 는 왼쪽 가장자리). S: 기준에서 gap 씩(아래/오른쪽).
     E·S 는 기준 = 순서 첫 글자일 때만, 아니면 K 로 하고 space:'K' 로 알림. E·S 에선 여러 줄 글자를 뺌(skipped.mt).
   - 표째로 고름 막기: V 에서 같은 줄(밑줄 y 차 ≤ 0.5×h)·H 에서 같은 열(왼쪽 가장자리 차 ≤ 0.5×h)에 2개 이상이면
     plan·COMMANDS 모두 throw(메시지에 'grid'), opt.force / c.force 가 참이면 그대로 진행.
   - 높이·폭이 0 보다 큰 숫자가 아닌 글자는 skipped.other, 그런 글자가 기준이면 throw.
   - 빼는 것: 회전(0° 로 보는 허용 1e-6°), 꺼짐·얼림 층(off), 잠김 층(locked), 블록 참조(block), 글자 아닌 것·없는 id(other).
   - plan 은 도면을 안 바꾸고 기록·로그를 안 남김. COMMANDS 는 검사를 다 끝낸 뒤에만 e.p = {x,y} 새 객체로 바꿈. */
(function () {
  'use strict';
  const ROT_TOL = 1e-6, EXP_TOL = 1e-9;
  const FR = { left: 0, center: 0.5, right: 1 };          // 맞춤점이 글자 폭의 어디인지
  const KEY = { L: 'left', C: 'center', R: 'right' };
  const fin = Number.isFinite;

  const alignFr = e => (e.align === 'center' ? 0.5 : e.align === 'right' ? 1 : 0);
  const isMulti = e => String(e.s).includes('\n');   // 실제로 두 줄 이상 (한 줄 mt 는 밑줄 함수로 처리됨)
  const baseY = e => (e.mt ? e.p.y - e.h : e.p.y);
  const isRot = e => { let r = +e.rot || 0; if (!fin(r)) return true; r = ((r % 360) + 360) % 360; return Math.min(r, 360 - r) > ROT_TOL; };

  function edges(e) {
    if (!e || !e.p) throw new Error('글자가 아닙니다');
    const w = textW(e), L = e.p.x - alignFr(e) * w;
    return { left: L, center: L + w / 2, right: L + w, base: baseY(e) };
  }

  // 높이·폭이 0 보다 큰 숫자인가 (아니면 폭 계산이 NaN 이 되어 "이미 맞음"으로 둔갑함)
  function sizeOK(e) {
    const h = e.h;
    if (typeof h !== 'number' || !fin(h) || h <= 0) return false;
    let w; try { w = textW(e); } catch (_) { return false; }
    return typeof w === 'number' && fin(w) && w > 0;
  }

  // 표째로 고른 것 막기: V 는 같은 줄(밑줄 y 차 ≤ 0.5×h), H 는 같은 열(왼쪽 가장자리 차 ≤ 0.5×h)에 2개 이상이면 그 개수
  function gridMax(items, dir) {
    const v = dir === 'V', key = x => (v ? -x.g.base : x.g.left);
    const s = items.slice().sort((a, b) => key(a) - key(b));
    let mx = 1;
    for (let i = 0; i < s.length;) {
      const k0 = key(s[i]), tol = 0.5 * s[i].e.h; let j = i + 1;
      while (j < s.length && key(s[j]) - k0 <= tol) j++;
      if (j - i > mx) mx = j - i; i = j;
    }
    return mx;
  }

  function layerState(e) {
    const l = typeof layerOf === 'function' ? layerOf(e.layer) : (doc.layers || []).find(x => x.name === e.layer);
    if (!l) return '';
    if (l.visible === false || l.frozen) return 'off';
    if (l.locked) return 'locked';
    return '';
  }

  function normOpt(opt) {
    opt = opt || {};
    const up = (v, d) => (v == null || v === '' ? d : String(v).trim().toUpperCase());
    const dir = up(opt.dir, 'V'), just = up(opt.just, 'L'), space = up(opt.space, 'K');
    if (dir !== 'V' && dir !== 'H') throw new Error(`dir 은 'V'(세로 줄) 또는 'H'(가로 줄)입니다: ${String(opt.dir).slice(0, 20)}`);
    if (!KEY[just]) throw new Error(`just 는 'L'·'C'·'R' 입니다: ${String(opt.just).slice(0, 20)}`);
    if (space !== 'K' && space !== 'E' && space !== 'S') throw new Error(`space 는 'K'(그대로)·'E'(같은 간격)·'S'(값 지정)입니다: ${String(opt.space).slice(0, 20)}`);
    let gap = null;
    if (space === 'S') { gap = +opt.gap; if (!fin(gap) || gap <= 0) throw new Error('space S 에는 0 보다 큰 gap(간격 값)이 필요합니다'); }
    return { dir, just, space, gap, baseId: opt.baseId };
  }

  // 자기 순서 함수 (9회차와 같은 0.5×h 같은 줄 규칙, 기준은 밑줄 y·왼쪽 가장자리)
  function order(items, dir) {
    const cmpId = (a, b) => (String(a.e.id) < String(b.e.id) ? -1 : String(a.e.id) > String(b.e.id) ? 1 : 0);
    if (dir === 'H') return items.slice().sort((a, b) => a.g.left - b.g.left || b.g.base - a.g.base || cmpId(a, b));
    const s = items.slice().sort((a, b) => b.g.base - a.g.base || a.g.left - b.g.left || cmpId(a, b));
    const out = [];
    for (let i = 0; i < s.length;) {
      const top = s[i].g.base, tol = 0.5 * (+s[i].e.h || 0); let j = i + 1;
      while (j < s.length && top - s[j].g.base <= tol) j++;
      const row = s.slice(i, j); if (row.length > 1) row.sort((a, b) => a.g.left - b.g.left || cmpId(a, b));
      for (const r of row) out.push(r); i = j;
    }
    return out;
  }

  // texts: 글자 객체 배열(없는 것·null 은 other). find: id → 객체(기준이 목록 밖일 때)
  function planIn(texts, opt, find) {
    const o = normOpt(opt);
    const skipped = { rotated: 0, locked: 0, off: 0, block: 0, mt: 0, other: 0 };
    const seen = new Set(), items = [];
    const useSpace = o.space !== 'K';
    for (const e of texts || []) {
      if (!e || typeof e !== 'object') { skipped.other++; continue; }
      if (seen.has(e)) continue; seen.add(e);
      if (e.type === 'insert') { skipped.block++; continue; }
      if (e.type !== 'text' || !e.p || !fin(e.p.x) || !fin(e.p.y)) { skipped.other++; continue; }
      if (!sizeOK(e)) { skipped.other++; continue; }
      const ls = layerState(e);
      if (ls === 'off') { skipped.off++; continue; }
      if (ls === 'locked') { skipped.locked++; continue; }
      if (isRot(e)) { skipped.rotated++; continue; }
      items.push({ e, g: null, multi: isMulti(e) });
    }
    // 기준 글자
    let baseE = null;
    if (o.baseId != null && o.baseId !== '') {
      const k = String(o.baseId);
      const it = items.find(x => String(x.e.id) === k);
      baseE = it ? it.e : (find ? find(k) : null);
      if (!baseE) {
        const t = [...seen].find(x => String(x.id) === k);
        baseE = t || null;
      }
      if (!baseE) throw new Error('기준 문자를 찾을 수 없습니다 (baseId)');
      if (baseE.type !== 'text' || !baseE.p) throw new Error('기준은 문자여야 합니다');
      if (isRot(baseE)) throw new Error('기준 문자가 돌아가 있습니다 — 돌아가지 않은 문자를 기준으로 고르세요');
    }
    if (baseE && !sizeOK(baseE)) throw new Error('기준 문자의 높이(또는 폭)가 없습니다 — 다른 문자를 기준으로 고르세요');
    let space = o.space;
    // E·S 에서 여러 줄 글자는 뺌 (기준 글자는 빼지 않음)
    let work = items;
    if (useSpace) work = items.filter(x => { if (x.multi && x.e !== baseE) { skipped.mt++; return false; } return true; });
    for (const x of work) x.g = edges(x.e);
    const T = order(work, o.dir);
    if (!opt || !opt.force) {
      const g = gridMax(T, o.dir);
      if (g > 1) throw new Error(o.dir === 'V'
        ? `같은 줄에 글자가 ${g}개 있습니다 — 표째로 고른 것 같습니다. 한 열씩 고르세요 (도면은 그대로, grid)`
        : `같은 열에 글자가 ${g}개 있습니다 — 표째로 고른 것 같습니다. 한 줄씩 고르세요 (도면은 그대로, grid)`);
    }
    if (!baseE) baseE = T.length ? T[0].e : null;
    const res = { moves: [], skipped, base: baseE ? baseE.id : null, est: 0, space };
    if (!baseE || T.length + (T.some(x => x.e === baseE) ? 0 : 1) < 2) return res;
    if (useSpace && isMulti(baseE)) space = 'K';   // 기준이 여러 줄이면 간격이 겹침 → 그대로
    const bi = T.findIndex(x => x.e === baseE);
    if (space !== 'K' && bi !== 0) space = 'K';
    if (space === 'E' && T.length < 3) space = 'K';
    res.space = space;
    const be = edges(baseE), key = KEY[o.just], kf = FR[key];
    const n = T.length;
    const L0 = T[0].g.left, Ln = T[n - 1].g.left, B0 = T[0].g.base, Bn = T[n - 1].g.base;
    for (let i = 0; i < n; i++) {
      const { e, g } = T[i];
      if (e === baseE) continue;
      let x = e.p.x, y = e.p.y, est = false;
      if (o.dir === 'V') {
        x = e.p.x + be[key] - g[key];
        est = kf !== alignFr(baseE) || kf !== alignFr(e);
        if (space === 'E') y = e.p.y + (B0 + (Bn - B0) * i / (n - 1)) - g.base;
        else if (space === 'S') y = e.p.y + (be.base - o.gap * i) - g.base;
      } else {
        y = e.p.y + be.base - g.base;
        if (space === 'E') { x = e.p.x + (L0 + (Ln - L0) * i / (n - 1)) - g.left; est = alignFr(e) !== 0 || alignFr(T[0].e) !== 0 || alignFr(T[n - 1].e) !== 0; }
        else if (space === 'S') { x = e.p.x + (be.left + o.gap * i) - g.left; est = alignFr(e) !== 0 || alignFr(baseE) !== 0; }
      }
      if (Math.abs(x - e.p.x) > 1e-12 || Math.abs(y - e.p.y) > 1e-12) {
        res.moves.push({ id: e.id, from: { x: e.p.x, y: e.p.y }, to: { x, y } });
        if (est) res.est++;
      }
    }
    return res;
  }

  function plan(texts, opt) {
    let map = null;
    const find = k => { if (!map) map = new Map(doc.entities.map(e => [String(e.id), e])); return map.get(k) || null; };
    return planIn(texts, opt, find);
  }

  window.TALIGN = { ver: 1, edges, plan };

  /* AI·배치 명령: 검사 먼저(옵션·기준·expect) → 하나라도 실패면 throw(아무것도 안 바꿈) → e.p 새 객체 */
  COMMANDS.textalign = (c) => {
    c = c || {};
    let ids;
    if (Array.isArray(c.ids)) ids = c.ids;
    else if (c.ids === 'selection' && typeof sel !== 'undefined') ids = [...sel];
    else if (c.ids == null) ids = [];
    else throw new Error('ids 는 문자 id 배열입니다');
    const map = new Map();
    for (const e of doc.entities) map.set(String(e.id), e);
    const uniq = [...new Set(ids.map(String))];
    const texts = uniq.map(k => map.get(k) || null);
    const r = planIn(texts, c, k => map.get(k) || null);
    // expect: 검사 때 자리와 지금 자리가 같아야 함 (낡은 결과로 도면을 망치지 않게)
    if (c.expect != null) {
      if (typeof c.expect !== 'object') throw new Error('expect 는 {id:[x,y]} 입니다');
      for (const [k, q] of Object.entries(c.expect)) {
        const e = map.get(String(k));
        const qx = Array.isArray(q) ? +q[0] : q && +q.x, qy = Array.isArray(q) ? +q[1] : q && +q.y;
        if (!e || !e.p || !fin(qx) || !fin(qy) || Math.abs(e.p.x - qx) > EXP_TOL || Math.abs(e.p.y - qy) > EXP_TOL)
          throw new Error('검사한 뒤 도면이 바뀌었습니다 — 아무것도 옮기지 않았습니다. 다시 실행하세요');
      }
    }
    for (const m of r.moves) { const e = map.get(String(m.id)); e.p = { x: m.to.x, y: m.to.y }; }
    return { ids: r.moves.map(m => m.id), n: r.moves.length, skipped: r.skipped, base: r.base, est: r.est, space: r.space };
  };
})();
