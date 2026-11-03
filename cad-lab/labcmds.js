/* 무카 CAD 테스트 서버 — 오토캐드 명령 점검표에서 고른 명령 (2026-11-03)
   cadcraft(MIT/Apache, 오토캐드식 Rust CAD)의 명령 433개와 무카 명령을 맞대어 본 결과, 무카에 없는 136개 중
   도면 작업에 자주 쓰고 무카 구조로 바로 되는 것을 골라 넣음. (화면 그리기를 바꿔야 하는 ISOLATEOBJECTS 같은 것은 뺌)
   - OOPS : 마지막으로 지운 객체 되살리기
   - 도면층: LAYISO·LAYUNISO·LAYFRZ·LAYLCK·LAYULK·LAYCUR·LAYMCUR·LAYMCH·LAYMRG·LAYDEL
   - 고르기·세기: SELECTSIMILAR · COUNT
   - 고치기: REVERSE · TXT2MTXT · BREAKLINE · BLEND
   - 정보: MASSPROP(면적·둘레·도심·단면 2차 모멘트) · AUDIT(도면 점검·고치기) · STATUS
   - 켜고 끄기: ORTHO · GRID · POLAR · OTRACK (명령으로 치기)
   - 다른 이름: MEASUREGEOM/MEA → DIST, CHPROP/CHANGE → 특성 창, IMPORT/IMP → 열기, PRINTPDF/PDFBOOK → 출력
   AI(mucca_draw)용: {"cmd":"massprop","ids":[..]} · {"cmd":"audit","fix":true} · {"cmd":"select_similar","ids":[..]} */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof COMMANDS !== 'object') return;
  const r3 = x => Math.round(x * 1000) / 1000, f = x => (typeof fmt === 'function' ? fmt(x) : String(r3(x)));
  const selEnts = () => [...sel].map(byId).filter(Boolean);
  const entOf = x => (x && typeof x === 'object' ? x : x != null ? byId(x) : null);
  const need = (name, how) => { log(`${how || '객체'}를 먼저 선택한 뒤 ${name} 를 입력하세요.`, 'err'); return null; };
  const done = () => { changed(); dirty = true; };

  /* ---------- OOPS: 지운 객체 기억 ---------- */
  let lastErased = null;
  const _del = COMMANDS.delete;
  COMMANDS.delete = function (c, ctx) {
    let keep = null;
    try { const ids = c.all ? doc.entities.map(e => e.id) : resolveIds(c.ids, ctx); const s = new Set(ids); keep = doc.entities.filter(e => s.has(e.id)).map(e => structuredClone(e)); } catch (_) { }
    const r = _del.call(this, c, ctx);
    if (keep && keep.length && !c.__noOops) lastErased = keep;
    return r;
  };
  TOOLS.oops = () => {
    if (!lastErased || !lastErased.length) { log('되살릴 지운 객체가 없습니다', 'err'); return null; }
    pushUndo(); const have = new Set(doc.entities.map(e => e.id)); let n = 0;
    for (const e of lastErased) { if (have.has(e.id)) continue; if (e.layer) ensureLayer(e.layer); doc.entities.push(structuredClone(e)); n++; }
    lastErased = null; done(); log(`지운 객체 ${n}개를 되살렸습니다 (OOPS)`, 'ok'); return null;
  };

  /* ---------- 도면층 ---------- */
  const layersOfSel = () => [...new Set(selEnts().map(e => e.layer).filter(Boolean))];
  let isoSaved = null;
  TOOLS.layiso = () => {
    const keep = new Set(layersOfSel()); if (!keep.size) return need('LAYISO', '남길 도면층의 객체');
    pushUndo(); isoSaved = doc.layers.map(l => ({ name: l.name, visible: l.visible, frozen: l.frozen }));
    let n = 0; for (const l of doc.layers) if (!keep.has(l.name) && l.visible !== false) { l.visible = false; n++; }
    if (!keep.has(doc.current)) doc.current = [...keep][0];
    done(); log(`도면층 ${[...keep].join(', ')} 만 남기고 ${n}개를 껐습니다 (되돌리기: LAYUNISO)`, 'ok'); return null;
  };
  TOOLS.layuniso = () => {
    if (!isoSaved) { log('LAYISO 로 끈 도면층이 없습니다 (모두 켜기 = LAYON)', 'err'); return null; }
    pushUndo(); for (const s of isoSaved) { const l = layerOf(s.name); if (l) { l.visible = s.visible; l.frozen = s.frozen; } }
    isoSaved = null; done(); log('LAYISO 전 도면층 상태로 돌렸습니다', 'ok'); return null;
  };
  const setFlag = (name, key, val, msg) => () => {
    const all = layersOfSel(), names = all.filter(n => !(key !== 'locked' && n === doc.current));
    if (!names.length) { if (all.length) { log(`현재 도면층 '${doc.current}' 은 ${msg}할 수 없습니다. 다른 도면층을 현재로 바꾼 뒤 다시 하세요`, 'err'); return null; } return need(name, `${msg}할 도면층의 객체`); }
    pushUndo(); for (const n of names) { const l = layerOf(n); if (l) l[key] = val; }
    if (key !== 'locked' || val) for (const e of doc.entities) if (names.includes(e.layer)) sel.delete(e.id);
    done(); log(`도면층 ${names.join(', ')} ${msg}`, 'ok'); return null;
  };
  TOOLS.layfrz = setFlag('LAYFRZ', 'frozen', true, '동결');
  TOOLS.laylck = setFlag('LAYLCK', 'locked', true, '잠금');
  TOOLS.layulk = () => {
    const names = layersOfSel(); pushUndo(); let n = 0;
    if (names.length) { for (const nm of names) { const l = layerOf(nm); if (l && l.locked) { l.locked = false; n++; } } }
    else for (const l of doc.layers) if (l.locked) { l.locked = false; n++; }   // 잠긴 객체는 고를 수 없으니, 선택이 없으면 모두 풂
    done(); log(n ? `잠긴 도면층 ${n}개를 풀었습니다` : '잠긴 도면층이 없습니다', 'ok'); return null;
  };
  TOOLS.laycur = () => {
    const es = selEnts(); if (!es.length) return need('LAYCUR');
    pushUndo(); for (const e of es) e.layer = doc.current; done(); log(`객체 ${es.length}개를 현재 도면층 '${doc.current}' 으로 옮겼습니다`, 'ok'); return null;
  };
  TOOLS.laymcur = () => {
    const ls = layersOfSel(); if (ls.length !== 1) { log(ls.length ? '현재로 만들 도면층의 객체를 하나만 고르세요' : '현재로 만들 도면층의 객체를 먼저 선택하세요 (LAYMCUR)', 'err'); return null; }
    doc.current = ls[0]; done(); log(`현재 도면층: ${ls[0]}`, 'ok'); return null;
  };
  /* 대상 객체를 클릭해서 그 도면층으로: LAYMCH(선택 객체만) · LAYMRG(선택 객체의 도면층 전체를 합치고 지움) */
  const pickTarget = (name, label, apply) => () => {
    const T = withSel({
      name, prompt: '대상 도면층의 객체 클릭:',
      run() { T.prompt = '대상 도면층의 객체 클릭:'; },
      onPoint(p) { const e = entOf(pick(p)); if (!e) { log('객체를 찾지 못했습니다. 다시 클릭하세요', 'err'); return; } apply(e.layer); sel.clear(); endTool(); },
      onEnter() { endTool(); }
    });
    if (T.selecting) T.afterSelect = () => { T.selecting = false; T.prompt = '대상 도면층의 객체 클릭:'; };
    return T;
  };
  TOOLS.laymch = pickTarget('laymch', '도면층 맞추기', to => { const es = selEnts(); pushUndo(); for (const e of es) e.layer = to; done(); log(`객체 ${es.length}개를 도면층 '${to}' 으로 옮겼습니다`, 'ok'); });
  TOOLS.laymrg = pickTarget('laymrg', '도면층 합치기', to => {
    const from = layersOfSel().filter(n => n !== to && n !== '0'); if (!from.length) { log('합칠 도면층이 없습니다', 'err'); return; }
    pushUndo(); let n = 0; for (const e of doc.entities) if (from.includes(e.layer)) { e.layer = to; n++; }
    if (from.includes(doc.current)) doc.current = to;
    doc.layers = doc.layers.filter(l => !from.includes(l.name)); done(); log(`도면층 ${from.join(', ')} → '${to}' 로 합쳤습니다 (객체 ${n}개, 되돌리기 Ctrl+Z)`, 'ok');
  });
  TOOLS.laydel = () => {
    const all = layersOfSel(), ls = all.filter(n => n !== '0' && n !== doc.current);
    if (!ls.length) { if (all.length) { log(`0 도면층과 현재 도면층 '${doc.current}' 은 지울 수 없습니다`, 'err'); return null; } return need('LAYDEL', '지울 도면층의 객체'); }
    pushUndo(); const s = new Set(ls), gone = doc.entities.filter(e => s.has(e.layer)).map(e => structuredClone(e));
    doc.entities = doc.entities.filter(e => !s.has(e.layer)); doc.layers = doc.layers.filter(l => !s.has(l.name)); sel.clear(); lastErased = gone;
    done(); log(`도면층 ${ls.join(', ')} 와 그 객체 ${gone.length}개를 지웠습니다 (되돌리기 Ctrl+Z)`, 'ok'); return null;
  };

  /* ---------- 고르기 · 세기 ---------- */
  function similar(ids) {
    const src = (ids ? ids.map(byId) : selEnts()).filter(Boolean); if (!src.length) return [];
    const key = e => e.type + '|' + e.layer + '|' + (e.type === 'insert' ? e.name || e.block : '') + '|' + (e.mt ? 'mt' : '');
    const keys = new Set(src.map(key)), ok = new Set(pickableEnts().map(e => e.id));
    return doc.entities.filter(e => ok.has(e.id) && keys.has(key(e))).map(e => e.id);
  }
  TOOLS.selectsimilar = () => {
    const ids = similar(); if (!ids.length) return need('SELECTSIMILAR', '기준 객체');
    for (const id of ids) sel.add(id); dirty = true; renderProps && renderProps(); updateInfo && updateInfo();
    log(`비슷한 객체(같은 종류·도면층${selEnts().some(e => e.type === 'insert') ? '·블록 이름' : ''}) ${ids.length}개를 선택했습니다`, 'ok'); return null;
  };
  COMMANDS.select_similar = c => { const ids = similar(c.ids && c.ids.length ? c.ids : null); return { ids, count: ids.length }; };
  TOOLS.count = () => {
    const es = selEnts(); const ins = es.filter(e => e.type === 'insert');
    if (ins.length) {
      const names = [...new Set(ins.map(e => e.name || e.block))];
      const all = doc.entities.filter(e => e.type === 'insert' && names.includes(e.name || e.block));
      sel.clear(); for (const e of all) sel.add(e.id); dirty = true;
      log('블록 세기: ' + names.map(n => `${n} ${all.filter(e => (e.name || e.block) === n).length}개`).join(' · ') + ' (모두 선택함)', 'ok'); return null;
    }
    const src = es.length ? es : doc.entities; const by = {};
    for (const e of src) { const k = (typeof TYPE_KO === 'object' && TYPE_KO[e.type]) || e.type; by[k] = (by[k] || 0) + 1; }
    log(`${es.length ? '선택한' : '도면 전체'} 객체 ${src.length}개: ` + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '), 'ok'); return null;
  };

  /* ---------- 고치기 ---------- */
  TOOLS.reverse = () => {
    const es = selEnts().filter(e => ['line', 'polyline', 'spline', 'arc'].includes(e.type)); if (!es.length) return need('REVERSE', '선·폴리선·스플라인');
    pushUndo();
    for (const e of es) { if (e.type === 'line') { const t = e.a; e.a = e.b; e.b = t; } else if (e.pts) e.pts.reverse(); else if (e.type === 'arc') { /* 호는 방향이 정해져 있어 그대로 */ } }
    done(); log(`객체 ${es.length}개의 방향을 뒤집었습니다`, 'ok'); return null;
  };
  TOOLS.txt2mtxt = () => {
    const ts = selEnts().filter(e => e.type === 'text'); if (ts.length < 2) return need('TXT2MTXT', '합칠 한 줄 문자(2개 이상)');
    const rows = ts.slice().sort((a, b) => (b.p.y - a.p.y) || (a.p.x - b.p.x));
    const lines = []; let cur = null;   // 높이의 절반 안이면 같은 줄로 보고 왼쪽부터 띄어 붙임
    for (const t of rows) { if (cur && Math.abs(cur.y - t.p.y) < (t.h || 3.5) * 0.5) cur.s.push(t); else { cur = { y: t.p.y, s: [t] }; lines.push(cur); } }
    const text = lines.map(l => l.s.sort((a, b) => a.p.x - b.p.x).map(t => t.s).join(' ')).join('\n');
    const top = rows[0], h = top.h || 3.5, x0 = Math.min(...ts.map(t => t.p.x));
    pushUndo(); const keep = new Set(ts.map(t => t.id)); doc.entities = doc.entities.filter(e => !keep.has(e.id)); sel.clear();
    const r = runBatch([{ cmd: 'mtext', at: [x0, top.p.y], text, h, layer: top.layer }]); if (!r.ok) log(r.errors.join(' / '), 'err');
    done(); log(`한 줄 문자 ${ts.length}개를 여러 줄 문자 1개(${lines.length}줄)로 합쳤습니다`, 'ok'); return null;
  };
  /* 끊김선 기호: 두 점 사이 직선 + 가운데 지그재그 (오토캐드 BREAKLINE 과 같은 모양) */
  function breakPts(a, b, size) {
    const L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-9) return null; const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y, y: u.x };
    const s = Math.min(size || L * 0.08, L * 0.3), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, at = (t, k) => ({ x: m.x + u.x * t + n.x * k, y: m.y + u.y * t + n.y * k });
    return [a, at(-s / 2, 0), at(-s / 4, s), at(s / 4, -s), at(s / 2, 0), b];
  }
  TOOLS.breakline = () => {
    const T = { name: 'breakline', prompt: '끊김선 첫 점:', onPoint(p) { if (!T.a) { T.a = p; T.last = p; T.prompt = '끊김선 끝점:'; } else { const pts = breakPts(T.a, p); if (pts) commit({ cmd: 'polyline', points: pts.map(q => [q.x, q.y]) }, '끊김선'); endTool(); } },
      onEnter() { endTool(); }, preview(c, cur) { if (!T.a) return; const pts = breakPts(T.a, cur); if (!pts) return; c.save(); c.globalAlpha = .6; strokeEnt(c, { type: 'polyline', pts, closed: false, layer: doc.current }); c.restore(); } };
    return T;
  };
  COMMANDS.breakline = c => { const a = P(c.from, 'from'), b = P(c.to, 'to'), pts = breakPts(a, b, c.size ? +c.size : null); if (!pts) throw new Error('두 점이 같습니다'); return { id: newEnt({ type: 'polyline', pts, closed: false }, c) }; };
  /* BLEND: 열린 두 선의 가까운 끝을 부드러운 곡선(스플라인)으로 잇기 */
  function endsOf(e) { if (e.type === 'line') return [e.a, e.b, { x: e.a.x - e.b.x, y: e.a.y - e.b.y }, { x: e.b.x - e.a.x, y: e.b.y - e.a.y }];
    if ((e.type === 'polyline' || e.type === 'spline') && !e.closed && e.pts.length > 1) { const p = e.pts, n = p.length; return [p[0], p[n - 1], { x: p[0].x - p[1].x, y: p[0].y - p[1].y }, { x: p[n - 1].x - p[n - 2].x, y: p[n - 1].y - p[n - 2].y }]; }
    if (e.type === 'arc') { const r0 = e.a0 * Math.PI / 180, r1 = e.a1 * Math.PI / 180; return [polar(e.c, e.r, e.a0), polar(e.c, e.r, e.a1), { x: Math.sin(r0), y: -Math.cos(r0) }, { x: -Math.sin(r1), y: Math.cos(r1) }]; }   // 각도는 도(°), 반시계 호
    return null; }
  TOOLS.blend = () => {
    const es = selEnts().filter(e => endsOf(e)); if (es.length !== 2) { log('이을 열린 선·폴리선·스플라인 2개를 선택한 뒤 BLEND 를 입력하세요', 'err'); return null; }
    const [A, B] = es.map(endsOf); let best = null;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const d = Math.hypot(A[i].x - B[j].x, A[i].y - B[j].y); if (!best || d < best.d) best = { d, p: A[i], q: B[j], tp: A[2 + i], tq: B[2 + j] }; }
    if (best.d < 1e-9) { log('두 끝이 이미 붙어 있습니다', 'err'); return null; }
    const nrm = v => { const L = Math.hypot(v.x, v.y) || 1; return { x: v.x / L, y: v.y / L }; }, k = best.d / 3, tp = nrm(best.tp), tq = nrm(best.tq);
    const c1 = { x: best.p.x + tp.x * k, y: best.p.y + tp.y * k }, c2 = { x: best.q.x + tq.x * k, y: best.q.y + tq.y * k };
    const bz = t => { const u = 1 - t; return { x: u * u * u * best.p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * best.q.x, y: u * u * u * best.p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * best.q.y }; };
    const pts = Array.from({ length: 9 }, (_, i) => bz(i / 8));
    commit({ cmd: 'spline', points: pts.map(q => [q.x, q.y]) }, `두 끝을 부드럽게 이었습니다 (간격 ${f(best.d)})`); sel.clear(); return null;
  };

  /* ---------- 정보 ---------- */
  /* 닫힌 도형의 면적 성질. 큰 것 안에 들어간 작은 닫힌 도형은 구멍으로 뺌 */
  function loopOf(e) {
    if (e.type === 'circle') return { circle: true, c: e.c, r: Math.abs(e.r) };
    const lp = closedLoopOf(e); return lp && lp.length > 2 ? { pts: lp } : null;
  }
  function propsOf(L) {
    if (L.circle) { const r = L.r, A = Math.PI * r * r, I = Math.PI * r ** 4 / 4; return { A, P: 2 * Math.PI * r, cx: L.c.x, cy: L.c.y, Ixc: I, Iyc: I, Ixyc: 0 }; }
    const p = L.pts, n = p.length; let A = 0, cx = 0, cy = 0, Ix = 0, Iy = 0, Ixy = 0, P = 0;
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n], k = a.x * b.y - b.x * a.y; A += k; cx += (a.x + b.x) * k; cy += (a.y + b.y) * k;
      Ix += (a.y * a.y + a.y * b.y + b.y * b.y) * k; Iy += (a.x * a.x + a.x * b.x + b.x * b.x) * k; Ixy += (a.x * b.y + 2 * a.x * a.y + 2 * b.x * b.y + b.x * a.y) * k; P += Math.hypot(b.x - a.x, b.y - a.y); }
    A /= 2; cx /= 6 * A; cy /= 6 * A; Ix /= 12; Iy /= 12; Ixy /= 24; const s = Math.sign(A) || 1; A = Math.abs(A); Ix *= s; Iy *= s; Ixy *= s;
    return { A, P, cx, cy, Ixc: Ix - A * cy * cy, Iyc: Iy - A * cx * cx, Ixyc: Ixy - A * cx * cy };
  }
  const inside = (pt, L) => { if (L.circle) return Math.hypot(pt.x - L.c.x, pt.y - L.c.y) < L.r; let c = false; const p = L.pts; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if (((p[i].y > pt.y) !== (p[j].y > pt.y)) && pt.x < (p[j].x - p[i].x) * (pt.y - p[i].y) / (p[j].y - p[i].y) + p[i].x) c = !c; } return c; };
  function massprop(ids) {
    const es = (ids ? ids.map(byId) : selEnts()).filter(Boolean), Ls = es.map(e => ({ e, L: loopOf(e) })).filter(x => x.L);
    if (!Ls.length) throw new Error('닫힌 도형(닫힌 폴리선·원·사각형)을 선택하세요');
    for (const x of Ls) x.pp = propsOf(x.L);
    Ls.sort((a, b) => b.pp.A - a.pp.A);
    const outer = Ls[0]; let A = outer.pp.A, Sx = outer.pp.A * outer.pp.cx, Sy = outer.pp.A * outer.pp.cy; const holes = [];
    for (const x of Ls.slice(1)) { const c = { x: x.pp.cx, y: x.pp.cy }; if (inside(c, outer.L)) { holes.push(x); A -= x.pp.A; Sx -= x.pp.A * x.pp.cx; Sy -= x.pp.A * x.pp.cy; } }
    const cx = Sx / A, cy = Sy / A; let Ix = 0, Iy = 0, Ixy = 0;
    for (const [x, sgn] of [[outer, 1], ...holes.map(h => [h, -1])]) { const q = x.pp, dx = q.cx - cx, dy = q.cy - cy; Ix += sgn * (q.Ixc + q.A * dy * dy); Iy += sgn * (q.Iyc + q.A * dx * dx); Ixy += sgn * (q.Ixyc + q.A * dx * dy); }
    const ext = Ls.reduce((m, x) => { const pts = x.L.circle ? [{ x: x.L.c.x - x.L.r, y: x.L.c.y - x.L.r }, { x: x.L.c.x + x.L.r, y: x.L.c.y + x.L.r }] : x.L.pts; for (const p of pts) { m[0] = Math.min(m[0], p.x); m[1] = Math.min(m[1], p.y); m[2] = Math.max(m[2], p.x); m[3] = Math.max(m[3], p.y); } return m; }, [Infinity, Infinity, -Infinity, -Infinity]);
    const ymax = Math.max(ext[3] - cy, cy - ext[1]), xmax = Math.max(ext[2] - cx, cx - ext[0]);
    const avg = (Ix + Iy) / 2, rad = Math.hypot((Ix - Iy) / 2, Ixy), I1 = avg + rad, I2 = avg - rad, th = 0.5 * Math.atan2(-2 * Ixy, Ix - Iy) * 180 / Math.PI;
    return { area: r3(A), perimeter: r3(outer.pp.P + holes.reduce((s, h) => s + h.pp.P, 0)), centroid: [r3(cx), r3(cy)], holes: holes.length, others: Ls.length - 1 - holes.length,
      Ix: r3(Ix), Iy: r3(Iy), Ixy: r3(Ixy), Zx: r3(Ix / ymax), Zy: r3(Iy / xmax), kx: r3(Math.sqrt(Ix / A)), ky: r3(Math.sqrt(Iy / A)), I1: r3(I1), I2: r3(I2), principal_deg: r3(th), extents: ext.map(r3), unit: 'mm' };
  }
  COMMANDS.massprop = c => massprop(c.ids && c.ids.length ? c.ids : null);
  TOOLS.massprop = () => {
    if (!sel.size) return need('MASSPROP', '닫힌 도형(바깥 윤곽 + 구멍)');
    try { const m = massprop(null);
      const txt = `면적 ${f(m.area)} mm² · 둘레 ${f(m.perimeter)} mm · 도심 (${f(m.centroid[0])}, ${f(m.centroid[1])})${m.holes ? ` · 구멍 ${m.holes}개 뺌` : ''}\n` +
        `도심 기준 단면 2차 모멘트 Ix ${f(m.Ix)} · Iy ${f(m.Iy)} · Ixy ${f(m.Ixy)} mm⁴\n단면 계수 Zx ${f(m.Zx)} · Zy ${f(m.Zy)} mm³ · 회전 반경 kx ${f(m.kx)} · ky ${f(m.ky)} mm\n주축 I1 ${f(m.I1)} · I2 ${f(m.I2)} mm⁴ (각도 ${f(m.principal_deg)}°)`;
      log('MASSPROP — ' + txt.replace(/\n/g, ' · '), 'ok');
      if (typeof openText === 'function') openText('면적 성질 (MASSPROP)', '선택한 닫힌 도형의 면적 성질입니다. 큰 윤곽 안에 들어간 닫힌 도형은 구멍으로 뺐습니다. 폴리선은 꼭짓점을 이은 직선 기준입니다.', txt);
    } catch (e) { log('MASSPROP: ' + (e.message || e), 'err'); }
    return null;
  };
  /* AUDIT: 길이 0 선·반지름 0 원·좌표 이상·빈 문자·없는 도면층·같은 번호 객체 */
  function audit(fix) {
    const bad = { zero_line: [], zero_circle: [], nan: [], empty_text: [], missing_layer: new Set(), dup_id: [] };
    const fin = v => typeof v === 'number' && isFinite(v), ptOk = p => p && fin(p.x) && fin(p.y), seen = new Set();
    for (const e of doc.entities) {
      if (seen.has(e.id)) bad.dup_id.push(e); seen.add(e.id);
      if (e.layer && !layerOf(e.layer)) bad.missing_layer.add(e.layer);
      if (e.type === 'line') { if (!ptOk(e.a) || !ptOk(e.b)) bad.nan.push(e); else if (Math.hypot(e.a.x - e.b.x, e.a.y - e.b.y) < 1e-9) bad.zero_line.push(e); }
      else if (e.type === 'circle' || e.type === 'arc') { if (!ptOk(e.c) || !fin(e.r)) bad.nan.push(e); else if (Math.abs(e.r) < 1e-9) bad.zero_circle.push(e); }
      else if (e.pts) { if (e.pts.some(p => !ptOk(p))) bad.nan.push(e); }
      else if (e.type === 'text') { if (!ptOk(e.p)) bad.nan.push(e); else if (!String(e.s || '').trim()) bad.empty_text.push(e); }
    }
    const res = { zero_line: bad.zero_line.length, zero_circle: bad.zero_circle.length, bad_coords: bad.nan.length, empty_text: bad.empty_text.length, missing_layers: [...bad.missing_layer], duplicate_ids: bad.dup_id.length };
    res.problems = res.zero_line + res.zero_circle + res.bad_coords + res.empty_text + res.missing_layers.length + res.duplicate_ids;
    if (fix && res.problems) {
      pushUndo(); const kill = new Set([...bad.zero_line, ...bad.zero_circle, ...bad.nan, ...bad.empty_text]);
      doc.entities = doc.entities.filter(e => !kill.has(e)); for (const n of bad.missing_layer) ensureLayer(n);
      for (const e of bad.dup_id) e.id = 'e' + Math.random().toString(36).slice(2, 10);
      sel.clear(); done(); res.fixed = true;
    }
    return res;
  }
  COMMANDS.audit = c => audit(!!c.fix);
  TOOLS.audit = () => {
    const r = audit(true);
    log(r.problems ? `도면 점검: 길이 0 선 ${r.zero_line} · 반지름 0 원 ${r.zero_circle} · 좌표 이상 ${r.bad_coords} · 빈 문자 ${r.empty_text} · 없는 도면층 ${r.missing_layers.length} · 같은 번호 ${r.duplicate_ids} → 고쳤습니다 (되돌리기 Ctrl+Z)` : '도면 점검: 문제 없음', r.problems ? 'ok' : 'ok');
    return null;
  };
  TOOLS.status = () => {
    const by = {}; for (const e of doc.entities) by[e.type] = (by[e.type] || 0) + 1;
    let b = null; try { b = cad && cad.state ? cad.state().bbox : null; } catch (_) { }
    const lay = doc.layers.length, off = doc.layers.filter(l => l.visible === false || l.frozen).length;
    log(`도면 상태: 객체 ${doc.entities.length}개 (${Object.entries(by).sort((a, c) => c[1] - a[1]).slice(0, 8).map(([k, v]) => `${(typeof TYPE_KO === 'object' && TYPE_KO[k]) || k} ${v}`).join(' · ')}) · 도면층 ${lay}개(꺼짐·동결 ${off}) · 현재 도면층 ${doc.current}` + (b ? ` · 범위 (${f(b.minX)}, ${f(b.minY)}) ~ (${f(b.maxX)}, ${f(b.maxY)})` : '') + ` · 직교 ${flags.ortho ? '켬' : '끔'} · 스냅 ${flags.osnap ? '켬' : '끔'}`, 'ok');
    return null;
  };

  /* ---------- 켜고 끄기 (명령으로) ---------- */
  const tog = (k, ko) => () => { flags[k] = !flags[k]; try { syncToggles(); } catch (_) { } dirty = true; log(`${ko} ${flags[k] ? '켬' : '끔'}`, 'ok'); return null; };
  TOOLS.orthocmd = tog('ortho', '직교'); TOOLS.gridcmd = tog('grid', '그리드'); TOOLS.polarcmd = tog('polar', '극좌표 추적'); TOOLS.otrackcmd = tog('otrack', '객체 추적');

  /* ---------- 이름 붙이기 ---------- */
  Object.assign(ALIAS, {
    OOPS: 'oops',
    LAYISO: 'layiso', LAYUNISO: 'layuniso', LAYFRZ: 'layfrz', LAYLCK: 'laylck', LAYULK: 'layulk', LAYCUR: 'laycur', LAYMCUR: 'laymcur', LAYMCH: 'laymch', LAYMRG: 'laymrg', LAYDEL: 'laydel',
    SELECTSIMILAR: 'selectsimilar', COUNT: 'count', REVERSE: 'reverse', TXT2MTXT: 'txt2mtxt', BREAKLINE: 'breakline', BLEND: 'blend', BLENDCURVES: 'blend',
    MASSPROP: 'massprop', AUDIT: 'audit', STATUS: 'status',
    ORTHO: 'orthocmd', GRID: 'gridcmd', POLAR: 'polarcmd', OTRACK: 'otrackcmd'
  });
  const alias2 = { MEASUREGEOM: 'dist', MEA: 'dist', CHPROP: 'properties', CHANGE: 'properties', IMPORT: 'opendwg', IMP: 'opendwg', PRINTPDF: 'plot', PDFBOOK: 'plot' };
  for (const [k, v] of Object.entries(alias2)) if (TOOLS[v] && !ALIAS[k]) ALIAS[k] = v;
  Object.assign(CMD_KO, {
    oops: '지운 객체 되살리기', layiso: '도면층 하나만 보기', layuniso: '도면층 보기 되돌리기', layfrz: '도면층 동결', laylck: '도면층 잠금', layulk: '도면층 잠금 풀기', laycur: '현재 도면층으로 옮기기',
    laymcur: '객체 도면층을 현재로', laymch: '도면층 맞추기', laymrg: '도면층 합치기', laydel: '도면층 지우기', selectsimilar: '비슷한 객체 선택', count: '개수 세기', reverse: '방향 뒤집기',
    txt2mtxt: '문자 합치기', breakline: '끊김선', blend: '두 끝 부드럽게 잇기', massprop: '면적 성질', audit: '도면 점검', status: '도면 상태',
    orthocmd: '직교 켜기·끄기', gridcmd: '그리드 켜기·끄기', polarcmd: '극좌표 켜기·끄기', otrackcmd: '객체 추적 켜기·끄기'
  });
  const KO = { 지운객체되살리기: 'oops', 되살리기: 'oops', 도면층하나만: 'layiso', 도면층격리: 'layiso', 격리해제: 'layuniso', 도면층동결: 'layfrz', 도면층잠금: 'laylck', 잠금풀기: 'layulk',
    현재도면층으로: 'laycur', 도면층맞추기: 'laymch', 도면층합치기: 'laymrg', 도면층지우기: 'laydel', 비슷한객체: 'selectsimilar', 유사객체선택: 'selectsimilar', 개수세기: 'count', 블록개수: 'count',
    방향뒤집기: 'reverse', 문자합치기: 'txt2mtxt', 끊김선: 'breakline', 파단선: 'breakline', 부드럽게잇기: 'blend', 면적성질: 'massprop', 단면2차모멘트: 'massprop', 단면계수: 'massprop', 도면점검: 'audit', 도면상태: 'status' };
  if (typeof KO_CMD === 'object') Object.assign(KO_CMD, KO);
  window.LABCMDS = { massprop, audit, similar, breakPts, list: Object.keys(KO) };

  /* AI 안내 (mucca_guide 뒤) */
  const G = `면적 성질 · 도면 점검 (테스트 서버)
 · {"cmd":"massprop","ids":[닫힌 도형 id...]} — 면적·둘레·도심·단면 2차 모멘트(Ix·Iy·Ixy)·단면 계수·회전 반경. 큰 윤곽 안의 닫힌 도형은 구멍으로 뺌
 · {"cmd":"audit","fix":true} — 길이 0 선·반지름 0 원·좌표 이상·빈 문자·없는 도면층 점검(fix 면 고침)
 · {"cmd":"select_similar","ids":[...]} — 같은 종류·도면층(블록은 이름까지) 객체 id 목록
 · {"cmd":"breakline","from":[x,y],"to":[x,y]} — 끊김선(파단선) 기호`;
  const hook = () => { const g = window.LAB2D; if (g && typeof g.guide === 'string') { if (!g.guide.includes('"cmd":"massprop"')) g.guide += '\n\n' + G; return true; } return false; };
  if (!hook()) { let n = 0; const t = setInterval(() => { if (hook() || ++n > 40) clearInterval(t); }, 500); }
})();
