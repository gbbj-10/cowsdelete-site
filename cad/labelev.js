/* 무카 CAD v1.10.5 — 평면도 → 입면도 바탕 (명령 ELEV · 입면도)
   평면도에서 입면도로 그릴 벽 한 면(벽 선 + 문 열림 호 + 창 선)을 걸치게 선택 → 천장·문·창 높이 입력 → 놓을 위치 클릭
   - 벽 선이 끊긴 곳 = 개구부. 근처에 문 열림 호가 있으면 '문', 벽 두께 안에 창 선이 있으면 '창', 둘 다 없으면 '개구부'
   - 입면도 바탕: 바닥선·천장선, 문·창 사각형, 전체 폭·높이·개구부 폭 치수, 문·창 표
   - 높이는 평면도에 없으므로 입력값(기본 천장 2400 · 문 2100 · 창 아래 900 · 창 높이 1200, 단위 mm)
   문의 22번 (11-02) 「입면도 가능할까요?」 — 인테리어 공간 캐드 */
(function () {
  'use strict';
  const D = { H: 2400, Hd: 2100, sill: 900, Hw: 1200 };
  try { const s = JSON.parse(localStorage.getItem('muccacad.elev') || 'null'); if (s) Object.assign(D, s); } catch (_) {}
  const save = () => { try { localStorage.setItem('muccacad.elev', JSON.stringify(D)); } catch (_) {} };

  function segsOf(ents) {
    const segs = [], arcs = [];
    for (const e of ents) {
      if (!e) continue;
      if (e.type === 'line') segs.push([e.a, e.b]);
      else if (e.type === 'polyline' && e.pts) { for (let i = 0; i + 1 < e.pts.length; i++) segs.push([e.pts[i], e.pts[i + 1]]); if (e.closed && e.pts.length > 2) segs.push([e.pts[e.pts.length - 1], e.pts[0]]); }
      else if (e.type === 'arc') arcs.push(e);
      else if (e.type === 'circle') arcs.push({ c: e.c, r: e.r });
    }
    return { segs: segs.filter(s => Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y) > 1e-6), arcs };
  }

  /* 평면 분석 → { L, openings:[{u0,u1,kind}], u, v, o } */
  function analyze(ents) {
    const { segs, arcs } = segsOf(ents);
    if (!segs.length) throw new Error('벽 선(선·폴리선)이 선택되지 않았습니다');
    let lg = segs[0], ll = 0;
    for (const s of segs) { const l = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y); if (l > ll) { ll = l; lg = s; } }
    const ux = (lg[1].x - lg[0].x) / ll, uy = (lg[1].y - lg[0].y) / ll; const vx = -uy, vy = ux; const o = lg[0];
    const U = p => (p.x - o.x) * ux + (p.y - o.y) * uy, V = p => (p.x - o.x) * vx + (p.y - o.y) * vy;
    const par = [];
    for (const s of segs) {
      const l = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y), cr = Math.abs(((s[1].x - s[0].x) * uy - (s[1].y - s[0].y) * ux) / l);
      if (cr < 0.05) { const a = U(s[0]), b = U(s[1]); par.push({ u0: Math.min(a, b), u1: Math.max(a, b), v: (V(s[0]) + V(s[1])) / 2, l }); }
    }
    const ext = Math.max(...par.map(p => p.u1)) - Math.min(...par.map(p => p.u0));
    const vt = Math.max(2, ext * 0.004);
    const groups = [];
    for (const p of par.sort((a, b) => a.v - b.v)) { const g = groups.find(g => Math.abs(g.v - p.v) < vt); if (g) { g.items.push(p); g.len += p.l; } else groups.push({ v: p.v, items: [p], len: p.l }); }
    groups.sort((a, b) => b.len - a.len);
    const face = groups[0];
    const iv = face.items.map(p => [p.u0, p.u1]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of iv) { const m = merged[merged.length - 1]; if (m && a <= m[1] + vt) m[1] = Math.max(m[1], b); else merged.push([a, b]); }
    const u0 = merged[0][0], u1 = merged[merged.length - 1][1], L = u1 - u0;
    const minGap = Math.max(L * 0.02, vt * 3);
    /* 벽 두께 추정: 면 그룹 다음으로 긴 평행 그룹까지 거리 */
    const other = groups.slice(1).filter(g => g.len > face.len * 0.3).map(g => Math.abs(g.v - face.v)).sort((a, b) => a - b);
    const thick = other.length ? other[0] : L * 0.05;
    const openings = [];
    for (let i = 0; i + 1 < merged.length; i++) {
      const g0 = merged[i][1], g1 = merged[i + 1][0], w = g1 - g0; if (w < minGap) continue;
      let kind = '개구부';
      const door = arcs.some(a => { const cu = U(a.c), cv = V(a.c); return a.r > w * 0.45 && a.r < w * 1.3 && cu > g0 - w * 0.2 && cu < g1 + w * 0.2 && Math.abs(cv - face.v) < w * 1.4 + thick; });
      if (door) kind = '문';
      else {
        const glass = groups.slice(1).some(g => Math.abs(g.v - face.v) <= thick * 1.05 + vt && g.items.some(p => Math.min(p.u1, g1) - Math.max(p.u0, g0) > w * 0.5));
        if (glass) kind = '창';
      }
      openings.push({ u0: g0 - u0, u1: g1 - u0, kind });
    }
    return { L, openings, thick };
  }

  function draw(P, A) {
    const { L, openings } = A; const H = D.H, x0 = P.x, y0 = P.y;
    const th = Math.max(H * 0.03, 30);
    const c = [];
    c.push({ cmd: 'line', from: [x0 - L * 0.04, y0], to: [x0 + L * 1.04, y0] });
    c.push({ cmd: 'rect', from: [x0, y0], to: [x0 + L, y0 + H] });
    let nd = 0, nw = 0, no = 0; const sched = [];
    for (const op of openings) {
      const a = x0 + op.u0, b = x0 + op.u1, w = op.u1 - op.u0;
      let lo = 0, hi = D.Hd, tag;
      if (op.kind === '창') { lo = D.sill; hi = Math.min(H - 1, D.sill + D.Hw); tag = 'W' + (++nw); }
      else if (op.kind === '문') { tag = 'D' + (++nd); }
      else { hi = D.Hd; tag = 'O' + (++no); }
      hi = Math.min(hi, H);
      c.push({ cmd: 'rect', from: [a, y0 + lo], to: [b, y0 + hi] });
      if (op.kind === '문') { c.push({ cmd: 'line', from: [a + w * 0.12, y0 + hi * 0.48], to: [a + w * 0.12, y0 + hi * 0.52] }); }
      if (op.kind === '창') { c.push({ cmd: 'line', from: [(a + b) / 2, y0 + lo], to: [(a + b) / 2, y0 + hi] }); }
      c.push({ cmd: 'text', at: [(a + b) / 2, y0 + hi + th * 0.6], text: tag, h: th, align: 'center' });
      c.push({ cmd: 'dim_linear', p1: [a, y0], p2: [b, y0], at: [(a + b) / 2, y0 - th * 3] });
      if (lo > 0) c.push({ cmd: 'dim_linear', p1: [b, y0], p2: [b, y0 + lo], at: [b + th * 2.5, y0 + lo / 2] });
      c.push({ cmd: 'dim_linear', p1: [b, y0 + lo], p2: [b, y0 + hi], at: [b + th * 2.5, y0 + (lo + hi) / 2] });
      sched.push(`${tag} ${op.kind} ${Math.round(w)}×${Math.round(hi - lo)}${lo ? ` (아래 ${Math.round(lo)})` : ''}`);
    }
    c.push({ cmd: 'dim_linear', p1: [x0, y0], p2: [x0 + L, y0], at: [x0 + L / 2, y0 - th * 6] });
    c.push({ cmd: 'dim_linear', p1: [x0, y0], p2: [x0, y0 + H], at: [x0 - th * 4, y0 + H / 2] });
    c.push({ cmd: 'text', at: [x0, y0 + H + th * 3], text: `입면도 바탕 — 벽 ${Math.round(L)} · 천장 ${Math.round(H)}`, h: th * 1.3 });
    if (sched.length) c.push({ cmd: 'text', at: [x0, y0 - th * 9], text: sched.join('   '), h: th * 0.9 });
    const r = commit(c, `입면도 바탕: 벽 ${Math.round(L)} · 문 ${nd} · 창 ${nw}${no ? ` · 개구부 ${no}` : ''} (높이는 입력값 기준 — 보는 방향이 반대면 대칭(MI)으로 뒤집으세요)`);
    if (r.ok) window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'ELEV_OK' });
    return r;
  }

  const STEPS = [['H', '천장 높이'], ['Hd', '문 높이'], ['sill', '창 아래 높이(창턱)'], ['Hw', '창 높이']];
  TOOLS.elev = function () {
    const T = withSel({
      name: 'elev', step: 0, A: null,
      get prompt() {
        if (T.selecting) return '입면도로 그릴 벽 한 면(벽 선·문 열림 호·창 선)을 걸치게 선택 후 Enter:';
        if (T.step < STEPS.length) { const [k, n] = STEPS[T.step]; return `${n} 입력 <${D[k]}>:`; }
        return '입면도를 놓을 위치(왼쪽 아래 바닥점) 지정:';
      }, set prompt(v) {},
      get wantsPoint() { return !T.selecting && T.step >= STEPS.length; },
      afterSelect() {
        const ents = [...sel].map(byId); sel.clear();
        try { T.A = analyze(ents); } catch (e) { log('입면도: ' + e.message, 'err'); endTool(); return; }
        const k = T.A.openings.reduce((m, o) => (m[o.kind] = (m[o.kind] || 0) + 1, m), {});
        log(`벽 길이 ${Math.round(T.A.L)} · 개구부 ${T.A.openings.length}곳 (문 ${k['문'] || 0} · 창 ${k['창'] || 0} · 구분 못 함 ${k['개구부'] || 0}) — 높이를 입력하세요 (Enter = 기본값)`, 'ok');
        try { changed(); } catch (_) {} setPrompt(T.prompt);
      },
      onInput(s) {
        if (T.selecting || T.step >= STEPS.length) return false;
        const n = +String(s).trim().replace(/,/g, ''); if (!(n > 0)) { toast('숫자(mm)를 입력하세요'); return true; }
        D[STEPS[T.step][0]] = n; save(); T.step++; return true;
      },
      onEnter() { if (T.step < STEPS.length) { T.step++; return; } endTool(); },
      onPoint(p) { if (T.step < STEPS.length || !T.A) return; draw(p, T.A); endTool(); },
    });
    if (!T.selecting) setTimeout(() => { T.selecting = false; T.afterSelect(); });
    return T;
  };
  try {
    Object.assign(ALIAS, { ELEV: 'elev', ELEVATION: 'elev', IPMYEON: 'elev' });
    Object.assign(CMD_KO, { elev: '평면도 → 입면도 바탕' });
    Object.assign(CMD_WORD, { elev: ['ELEV', '입면도'] });
    Object.assign(KO_CMD, { 입면도: 'elev', 입면: 'elev', 입면도그리기: 'elev', 입면도바탕: 'elev' });
  } catch (e) { console.warn('elev hook', e); }
  window.MUCCAELEV = { analyze, draw, D };
})();
