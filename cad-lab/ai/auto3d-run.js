/* 무카 CAD AI 팀 실험판 — 3D 자동설계 실행·검사·화면 (2회차 개발2, 2026-11-04)
   window.AUTO3D = { verify, measure, run, open }
   - run({std:'KS10K', size:'100A', face:'RF'|'FF', drawing:false})
       설계(AUTO3D_FLANGE.design, auto3d-flange.js) → LABPHOTO model3d 로 3D 만들기 → 3D 에서 직접 재기 → verify
       drawing:true 일 때만 model3d_drawing (사용자 도면에 3면도가 실제로 그려지므로 기본 끔)
   - 재는 값은 모두 3D 형상(B-rep)에서: 외형 크기 = 경계 상자, 부피 = OCC 부피, 볼트 구멍 = 바닥면의 원 모서리(중심·지름), PCD = 구멍 중심이 놓인 원 지름
     (같은 설계표에서 만든 값과 비교하므로 "형상이 설계대로 만들어졌는지" 검사. 치수표 자체 검사는 QA 정답표가 따로 함)
   - AI 명령: {"cmd":"model3d_auto","part":"flange","std":"KS10K","size":"100A","face":"RF","drawing":false}
   - 명령줄: FLANGE3D · 플랜지3D · 플랜지 3D → 창
   - 사용 기록은 'AUTO3D_OPEN' · 'AUTO3D_RUN' 이름만 (호칭·값은 보내지 않음) */
(function () {
  'use strict';
  const ph = () => window.LABPHOTO, lab = () => window.LAB3D, FL = () => window.AUTO3D_FLANGE;
  const TITLE = '플랜지 3D 자동설계 (KS 10K SOP)';
  const TOL_MM = 0.05, TOL_VOL = 0.001;   // 외형·구멍·PCD ±0.05 mm, 부피 ±0.1 %
  const NOT_IN_STD = '90A·175A·225A';
  const evt = n => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: n }); } catch (_) { } };
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const r2 = x => Math.round(x * 100) / 100, r3 = x => Math.round(x * 1000) / 1000;
  const fin = x => typeof x === 'number' && isFinite(x);
  const errMsg = e => String((e && e.message) || e || '알 수 없는 오류').slice(0, 300);

  /* ---------------- 호칭 ---------------- */
  const sizes = () => { const F = FL(); return F && Array.isArray(F.SIZES) ? F.SIZES.map(String) : []; };
  function normSize(s) {
    let t = String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
    if (/^\d+(\.\d+)?$/.test(t)) t += 'A';
    return t;
  }
  const unsupported = s => `'${s}' 은(는) 이번 표에 없는 호칭입니다 (지원 ${sizes().length}종: ${sizes().join(', ')}). ${NOT_IN_STD} 는 규격에는 있지만 이번 표에는 아직 없습니다.`;

  /* ---------------- 검사 ---------------- */
  /* rows: {name, want, got, ok}  ok: true/false, 못 잰 항목은 ok:null (판정에서 뺌, 표에는 남김) */
  function verify(expect, measured) {
    const E = expect || {}, M = measured || {}, rows = [];
    const row = (name, want, got, ok) => rows.push({ name, want, got: got == null ? '못 잼' : got, ok: got == null ? null : !!ok });
    if (Array.isArray(E.size_mm) && E.size_mm.length === 3) {
      const W = E.size_mm.map(Number), G = Array.isArray(M.size_mm) && M.size_mm.length === 3 && M.size_mm.every(fin) ? M.size_mm : null;
      const ax = ['가로', '세로', '높이(두께)'];
      for (let i = 0; i < 3; i++) row(`외형 ${ax[i]} mm`, r3(W[i]), G ? r3(G[i]) : null, G && Math.abs(G[i] - W[i]) <= TOL_MM);
    }
    if (fin(+E.vol_mm3) && +E.vol_mm3 > 0) {
      const w = +E.vol_mm3, g = fin(M.vol_mm3) ? M.vol_mm3 : null;
      row('부피 mm³ (±0.1%)', Math.round(w), g == null ? null : Math.round(g), g != null && Math.abs(g - w) / w <= TOL_VOL);
    }
    const H = E.holes || null, MH = M.holes || null;
    if (H && H.n != null) row('볼트 구멍 수', +H.n, MH && fin(MH.n) ? MH.n : null, MH && MH.n === +H.n);
    if (H && H.d != null) row('볼트 구멍 지름 mm', r3(+H.d), MH && fin(MH.d) ? r3(MH.d) : null, MH && fin(MH.d) && Math.abs(MH.d - +H.d) <= TOL_MM && (!fin(MH.d_spread) || MH.d_spread <= TOL_MM));
    if (E.pcd != null) row('PCD mm', r3(+E.pcd), fin(M.pcd) ? r3(M.pcd) : null, fin(M.pcd) && Math.abs(M.pcd - +E.pcd) <= TOL_MM && (!fin(M.pcd_spread) || M.pcd_spread <= TOL_MM));
    const judged = rows.filter(r => r.ok !== null);
    return { pass: judged.length > 0 && judged.every(r => r.ok), rows, measured_rows: judged.length, unmeasured_rows: rows.length - judged.length };
  }

  /* ---------------- 3D 에서 재기 ---------------- */
  const P3 = p => [p.x, p.y, p.z];
  function circle3(a, b, c) {   // 세 점을 지나는 원 (중심·반지름)
    const ab = a.map((v, i) => b[i] - v), ac = a.map((v, i) => c[i] - v);
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const n2 = cr[0] ** 2 + cr[1] ** 2 + cr[2] ** 2; if (n2 < 1e-18) return null;
    const ab2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2, ac2 = ac[0] ** 2 + ac[1] ** 2 + ac[2] ** 2;
    const t1 = [cr[1] * ab[2] - cr[2] * ab[1], cr[2] * ab[0] - cr[0] * ab[2], cr[0] * ab[1] - cr[1] * ab[0]];   // cr × ab
    const t2 = [ac[1] * cr[2] - ac[2] * cr[1], ac[2] * cr[0] - ac[0] * cr[2], ac[0] * cr[1] - ac[1] * cr[0]];   // ac × cr
    const o = [0, 1, 2].map(i => (ac2 * t1[i] + ab2 * t2[i]) / (2 * n2));
    return { c: a.map((v, i) => v + o[i]), r: Math.hypot(o[0], o[1], o[2]) };
  }
  async function measure() {
    const out = { size_mm: null, vol_mm3: null, holes: null, pcd: null, notes: [] };
    const PH = ph(); if (!PH || !PH.model || !PH.model.parts || !PH.model.parts.length) { out.notes.push('3D 모델이 없어 재지 못했습니다'); return out; }
    const parts = PH.model.parts;
    let R = null; try { R = await lab()._v().ensureOCC(); } catch (_) { }
    // 외형 크기 (경계 상자, 반올림 전 값)
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    try { for (const p of parts) { const b = p.shape.boundingBox.bounds; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b[0][i]); mx[i] = Math.max(mx[i], b[1][i]); } }
      out.size_mm = mx.map((x, i) => r3(x - mn[i])); } catch (e) { out.notes.push('크기 재기 실패: ' + errMsg(e)); }
    // 부피
    try { if (R && R.measureShapeVolumeProperties) { let v = 0; for (const p of parts) { const m = R.measureShapeVolumeProperties(p.shape); v += m.volume; try { m.delete(); } catch (_) { } } out.vol_mm3 = r2(v); } else out.notes.push('부피: 3D 엔진의 부피 재기를 찾지 못했습니다'); }
    catch (e) { out.vol_mm3 = null; out.notes.push('부피 재기 실패: ' + errMsg(e)); }
    // 볼트 구멍·PCD: 가장 얇은 방향(판 두께 방향)의 바닥면에 있는 원 모서리
    try {
      if (!out.size_mm) throw new Error('크기를 몰라 구멍을 찾지 못했습니다');
      const ax = out.size_mm.indexOf(Math.min(...out.size_mm)), z0 = mn[ax], u = [0, 1, 2].filter(i => i !== ax);
      const ctr = u.map(i => (mn[i] + mx[i]) / 2), eps = 1e-3;
      const circ = [];
      for (const p of parts) for (const e of p.shape.edges) {
        if (e.geomType !== 'CIRCLE') continue;
        const a = P3(e.pointAt(0)), b = P3(e.pointAt(1 / 3)), c = P3(e.pointAt(2 / 3));
        if (![a, b, c].every(q => Math.abs(q[ax] - z0) < eps)) continue;
        const k = circle3(a, b, c); if (!k) continue;
        const x = k.c[u[0]] - ctr[0], y = k.c[u[1]] - ctr[1];
        if (!circ.some(o => Math.hypot(o.x - x, o.y - y) < 0.01 && Math.abs(o.r - k.r) < 0.01)) circ.push({ x, y, r: k.r, off: Math.hypot(x, y) });   // 같은 원이 여러 토막이면 하나로
      }
      const scale = Math.max(...out.size_mm) || 1, holes = circ.filter(o => o.off > scale * 0.01);
      if (!holes.length) { out.holes = { n: 0, d: null }; out.notes.push('바닥면에서 볼트 구멍을 찾지 못했습니다'); }
      else {
        const ds = holes.map(o => o.r * 2), pc = holes.map(o => o.off * 2);
        const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
        out.holes = { n: holes.length, d: r3(avg(ds)), d_spread: r3(Math.max(...ds) - Math.min(...ds)) };
        out.pcd = r3(avg(pc)); out.pcd_spread = r3(Math.max(...pc) - Math.min(...pc));
      }
      const cen = circ.filter(o => o.off <= scale * 0.01).map(o => r2(o.r * 2)).sort((a, b) => b - a);
      if (cen.length) out.center_circles_d = cen;   // 바깥지름·안지름 (참고)
    } catch (e) { out.holes = null; out.pcd = null; out.notes.push('구멍 재기 실패: ' + errMsg(e)); }
    return out;
  }

  /* ---------------- 실행 ---------------- */
  let busy = false;
  function show3D() { try { const v = lab() && lab()._v(); if (v && v.mode && v.mode() === '2d') v.setMode('split'); setTimeout(() => { try { v.setView && v.setView('iso'); v.fit3 && v.fit3(); } catch (_) { } }, 120); } catch (_) { } }
  async function run(o) {
    const t0 = performance.now();
    try {
      o = o || {};
      if (busy) return { ok: false, error: '지금 다른 3D 자동설계를 하는 중입니다. 끝난 뒤 다시 해 보세요.' };
      const F = FL();
      if (!F || typeof F.design !== 'function') return { ok: false, error: '플랜지 설계 모듈(auto3d-flange.js)을 찾지 못했습니다. 화면을 새로 고친 뒤 다시 해 보세요.' };
      const PH = ph();
      if (!PH || typeof PH.cmds !== 'function') return { ok: false, error: '3D 모듈이 아직 준비되지 않았습니다. 잠시 뒤 다시 해 보세요.' };
      const std = String(o.std || 'KS10K'), size = normSize(o.size), face = String(o.face || 'RF').toUpperCase();
      if (!size) return { ok: false, error: `호칭(size)을 넣어 주세요 (지원 ${sizes().length}종: ${sizes().join(', ')})` };
      if (face !== 'RF' && face !== 'FF') return { ok: false, error: "면 모양(face)은 'RF'(돋음면) 또는 'FF'(평면) 입니다" };
      if (sizes().length && !sizes().includes(size)) return { ok: false, error: unsupported(size) };
      busy = true;
      try {
        let d; try { d = F.design({ std, size, face }); } catch (e) { return { ok: false, error: '설계 중 오류: ' + errMsg(e) }; }
        if (!d || !d.ok) return { ok: false, error: (d && d.error) || '설계하지 못했습니다' };
        const code = Array.isArray(d.code) ? d.code.join('\n') : String(d.code || '');
        const r = await PH.cmds([{ cmd: 'model3d', code }]), m = r && r.results && r.results[0];
        if (!m || !m.ok) return { ok: false, design: d, error: '3D 만들기 실패: ' + ((m && m.error) || '알 수 없는 오류') };
        show3D();
        const measured = await measure();
        const check = verify(d.expect, measured);
        const res = { ok: true, design: d, measured, check, ms: 0 };
        if (o.drawing === true) {
          try { const q = await PH.cmds([{ cmd: 'model3d_drawing', title: d.title }]); res.drawing = q.results[0]; }
          catch (e) { res.drawing = { ok: false, error: errMsg(e) }; }
        }
        res.ms = Math.round(performance.now() - t0);
        return res;
      } finally { busy = false; }
    } catch (e) { busy = false; return { ok: false, error: errMsg(e), ms: Math.round(performance.now() - t0) }; }
  }

  /* AI 결과 요약 (code 는 빼고) */
  function brief(r) {
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || '실패' };
    const d = r.design || {}, out = { ok: true, title: d.title, dims: d.dims, src: d.src, notes: d.notes, measured: r.measured, check: r.check, ms: r.ms };
    if (r.drawing) { const w = r.drawing; out.drawing = w.ok ? { ok: true, holes: w.holes, pcd: w.pcd, dims: w.dims, frame: w.frame } : { ok: false, error: w.error || (w.errors || []).join(' · ') }; }
    out.note = r.check && r.check.pass ? '3D 에서 잰 값이 설계값과 모두 맞습니다' : '맞지 않는 항목이 있습니다(check.rows 참고)';
    out.next = r.drawing ? '도면이 그려졌습니다' : '2D 도면이 필요하면 "drawing":true 로 다시 보내거나 {"cmd":"model3d_drawing"}';
    return out;
  }
  async function aiCmd(c) {
    c = c || {};
    const part = String(c.part || 'flange').toLowerCase();
    if (part !== 'flange') return { ok: false, error: `지금은 part:"flange"(KS 10K SOP 플랜지)만 됩니다 ('${String(c.part).slice(0, 30)}' 은 아직 없음)` };
    evt('AUTO3D_RUN');
    return brief(await run({ std: c.std, size: c.size, face: c.face, drawing: c.drawing === true }));
  }
  const GUIDE = `3D 자동설계 (규격 부품) — 값만 넣으면 3D 를 스스로 설계해 만들고 3D 에서 재서 검사
 · {"cmd":"model3d_auto","part":"flange","std":"KS10K","size":"100A","face":"RF"} → 플랜지 KS 10K SOP (RF 돋음면 / FF 평면)
   결과: dims(설계 치수) · measured(3D 에서 잰 크기·부피·볼트 구멍·PCD) · check.rows(항목별 맞음/틀림, 못 잰 항목은 '못 잼')
   "drawing":true 를 넣을 때만 사용자 도면에 3면도를 그림(기본 끔). 출처(src) 문구와 "제작 전 규격판(KS B 1511) 대조"를 사용자에게 꼭 알릴 것, 안지름 d0 는 참고값`;
  const hook = (n) => { const P = ph(); if (!P || typeof P.addCmd !== 'function') { if ((n || 0) < 60) setTimeout(() => hook((n || 0) + 1), 400); return; }
    try { P.addCmd('model3d_auto', aiCmd); if (typeof P.guide === 'string' && !P.guide.includes('model3d_auto')) P.guide += '\n\n' + GUIDE; } catch (_) { } };
  hook(0);

  /* ---------------- 창 ---------------- */
  if (!document.getElementById('auto3dCss')) {
    const st = document.createElement('style'); st.id = 'auto3dCss';
    st.textContent = `
.modal.auto3d{background:transparent;pointer-events:none;place-items:start start}
.modal.auto3d .sheet{pointer-events:auto;width:min(460px,100%);max-height:calc(100% - 8px);box-shadow:0 8px 30px rgba(0,0,0,.35)}
.modal.auto3d .body{overflow:auto}
.auto3d .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 8px}
.auto3d label{color:var(--ink-dim);font-size:12px}
.auto3d select{font:inherit;background:var(--chrome-2);color:var(--ink);border:1px solid var(--rule);border-radius:6px;padding:4px 6px}
.auto3d .hint{margin:0 0 8px;color:var(--ink-dim);font-size:12px;line-height:1.5}
.auto3d .stat{margin:0 0 8px;font-size:13px}
.auto3d .stat.ok{color:#3fb950}.auto3d .stat.bad{color:#f85149}
.auto3d h4{margin:10px 0 4px;font-size:12px;color:var(--ink-dim);font-weight:600}
.auto3d table{border-collapse:collapse;width:100%;font-size:12px}
.auto3d th,.auto3d td{padding:4px 6px;border-bottom:1px solid var(--rule);text-align:left}
.auto3d th{color:var(--ink-dim);font-weight:600}
.auto3d td.n{text-align:right;font-family:var(--mono,monospace)}
.auto3d td.y{color:#3fb950;text-align:center}.auto3d td.x{color:#f85149;text-align:center}.auto3d td.q{color:var(--ink-dim);text-align:center}
.auto3d .src{margin:8px 0 0;padding:6px 8px;border-left:3px solid var(--tag);background:var(--chrome-2);font-size:12px;line-height:1.5;white-space:pre-line}`;
    document.head.appendChild(st);
  }
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  const fmt = v => v == null || v === '' ? '' : String(v);

  function table(head, rows) {
    const t = el('table'), hr = el('tr'); head.forEach(h => hr.appendChild(el('th', null, h))); const th = el('thead'); th.appendChild(hr); t.appendChild(th);
    const tb = el('tbody'); rows.forEach(r => { const tr = el('tr'); r.forEach(c => { const td = el('td', c.cls || null, c.t); tr.appendChild(td); }); tb.appendChild(tr); }); t.appendChild(tb); return t;
  }
  function dimsTable(d) {
    const x = d || {}, rows = [];
    const put = (k, v, note) => rows.push([{ t: k }, { t: fmt(v), cls: 'n' }, { t: note || '' }]);
    put('바깥지름 D', x.D); put('볼트 구멍 중심원 C (PCD)', x.C);
    put('볼트 구멍 n-Ø h', x.n != null ? `${x.n}-Ø${fmt(x.h)}` : ''); put('볼트', x.bolt);
    put('전체 두께 t', x.t, (x.face || '') === 'FF' ? 'FF 평면' : 'RF 높이 f 포함'); put('RF 지름 g', x.g); put('RF 높이 f', x.f);
    put('안지름 d0', x.d0, '참고 (규격판 확인)');
    return table(['항목', 'mm', '비고'], rows);
  }
  function checkTable(c) {
    const rows = (c && c.rows || []).map(r => [{ t: r.name }, { t: fmt(r.want), cls: 'n' }, { t: fmt(r.got), cls: 'n' }, r.ok === null ? { t: '못 잼', cls: 'q' } : r.ok ? { t: '✔', cls: 'y' } : { t: '✖', cls: 'x' }]);
    return table(['검사 항목', '설계값(표)', '3D 에서 잰 값', '판정'], rows);
  }

  let win = null, last = null;
  function open() {
    try {
      evt('AUTO3D_OPEN');
      if (win && win.isConnected) win.remove();
      const F = FL(), S = sizes(), body = el('div', 'auto3d');
      if (!F || !S.length) {
        body.appendChild(el('p', 'stat bad', '플랜지 설계 모듈(auto3d-flange.js)을 찾지 못했습니다. 화면을 새로 고친 뒤 다시 해 보세요.'));
        win = modal(TITLE, [body]); win.classList.add('auto3d'); return win;
      }
      body.appendChild(el('p', 'hint', '호칭과 면 모양만 고르면 KS 10K SOP(슬립온) 플랜지를 3D 로 설계해 만들고, 3D 에서 직접 재서 맞는지 검사합니다.'));
      const r1 = el('div', 'row');
      const ls = el('label', null, '호칭'), sz = el('select'); sz.setAttribute('aria-label', '호칭');
      for (const s of S) { const op = el('option', null, s); op.value = s; sz.appendChild(op); }
      sz.value = S.includes((last && last.size) || '100A') ? ((last && last.size) || '100A') : S[0];
      const lf = el('label', null, '면 모양'), fc = el('select'); fc.setAttribute('aria-label', '면 모양');
      [['RF', 'RF (돋음면)'], ['FF', 'FF (평면)']].forEach(([v, t]) => { const op = el('option', null, t); op.value = v; fc.appendChild(op); });
      fc.value = (last && last.face) || 'RF';
      r1.append(ls, sz, lf, fc); body.appendChild(r1);
      body.appendChild(el('p', 'hint', `지원 ${S.length}종: ${S.join(', ')}. ${NOT_IN_STD} 는 규격에는 있지만 이번 표에는 아직 없습니다.`));
      const warn = el('p', 'hint', '');   // 이미 3D 모델이 있으면 바뀐다는 안내 (확인 창 없이 안내만)
      const hasModel = () => { try { const P = ph(), L = lab(); return !!(P && P.model && P.model.parts && P.model.parts.length && L && L.ext && L.ext.kind === 'photo'); } catch (_) { return false; } };
      const upWarn = () => { const on = hasModel(); warn.textContent = on ? '⚠ 지금 있는 3D 모델을 이 플랜지로 바꿉니다 (2D 도면은 그대로).' : ''; warn.style.display = on ? '' : 'none'; };
      upWarn();
      const stat = el('p', 'stat', ''), res = el('div'); body.append(warn, stat, res);

      const bMake = el('button', 'tbtn primary', '3D 만들기'), bDraw = el('button', 'tbtn', '도면 만들기');
      bDraw.disabled = true; bDraw.title = '먼저 [3D 만들기]';
      let made = null;
      bMake.onclick = async () => {
        bMake.disabled = true; bDraw.disabled = true; stat.className = 'stat'; stat.textContent = '3D 를 설계해 만드는 중… (처음에는 3D 엔진을 불러오느라 몇 초 걸립니다)'; res.textContent = '';
        evt('AUTO3D_RUN');
        last = { size: sz.value, face: fc.value };
        try {
          const r = await run({ std: 'KS10K', size: sz.value, face: fc.value, drawing: false });
          if (!r.ok) { stat.className = 'stat bad'; stat.textContent = '만들지 못했습니다: ' + r.error; say('플랜지 3D: ' + r.error, 'err'); return; }
          made = r;
          const c = r.check, nOk = c.rows.filter(x => x.ok === true).length, nBad = c.rows.filter(x => x.ok === false).length, nQ = c.rows.filter(x => x.ok === null).length;
          stat.className = 'stat ' + (c.pass ? 'ok' : 'bad');
          stat.textContent = `${r.design.title || '플랜지'} — ${c.pass ? '✔ 3D 형상 검사 통과 — 설계값(표)대로 만들어졌는지 확인한 것입니다. 규격 치수는 아래 출처로 확인하세요' : '✖ 3D 형상 검사 불합격 — 3D 가 설계값(표)과 다르게 만들어졌습니다(✖ 항목). 규격 치수는 아래 출처로 확인하세요'} (맞음 ${nOk} · 틀림 ${nBad}${nQ ? ' · 못 잼 ' + nQ : ''}, ${(r.ms / 1000).toFixed(1)}초)`;
          const notes = Array.isArray(r.design.notes) ? r.design.notes.filter(Boolean).map(String) : [];
          res.appendChild(el('div', 'src', [r.design.src ? '출처: ' + r.design.src : '', '제작 전 규격판(KS B 1511)과 꼭 대조하세요. 안지름 d0 는 참고값입니다.', ...notes].filter(Boolean).join('\n')));
          res.appendChild(el('h4', null, '3D 형상 검사표 (3D 에서 직접 잰 값 ↔ 설계값(표))')); res.appendChild(checkTable(c));
          res.appendChild(el('h4', null, '치수 요약')); res.appendChild(dimsTable(Object.assign({ face: fc.value }, r.design.dims || {})));
          if (r.measured && r.measured.notes && r.measured.notes.length) res.appendChild(el('p', 'hint', r.measured.notes.join(' · ')));
          bDraw.disabled = false; bDraw.title = '3면도를 지금 도면 오른쪽 빈 곳에 그립니다';
          say(`플랜지 3D: ${r.design.title || ''} 만듦 · 3D 형상 검사 ${c.pass ? '통과' : '불합격'} (${(r.ms / 1000).toFixed(1)}초)`, c.pass ? 'ok' : 'err');
        } catch (e) { stat.className = 'stat bad'; stat.textContent = '만들지 못했습니다: ' + errMsg(e); }
        finally { bMake.disabled = false; upWarn(); }
      };
      bDraw.onclick = async () => {
        if (!made) return;
        bDraw.disabled = true; bMake.disabled = true;
        try {
          const q = await ph().cmds([{ cmd: 'model3d_drawing', title: made.design.title }]), w = q.results[0];
          if (w && w.ok) say(`도면 만들기: 3면도를 그렸습니다 (치수 ${w.dims}개) — 되돌리기(Ctrl+Z)로 지울 수 있습니다`, 'ok');
          else say('도면 만들기 실패: ' + ((w && (w.error || (w.errors || []).join(' · '))) || '알 수 없는 오류'), 'err');
        } catch (e) { say('도면 만들기 실패: ' + errMsg(e), 'err'); }
        finally { bDraw.disabled = false; bMake.disabled = false; }
      };
      win = modal(TITLE, [body], [bMake, bDraw]); win.classList.add('auto3d');
      return win;
    } catch (e) { say('플랜지 3D 창을 열지 못했습니다: ' + errMsg(e), 'err'); return null; }
  }

  /* ---------------- 명령줄 ---------------- */
  try {
    if (typeof TOOLS === 'object' && typeof ALIAS === 'object') {
      TOOLS.flange3d = () => { open(); return null; };
      ALIAS.FLANGE3D = 'flange3d'; ALIAS.AUTO3D = 'flange3d';
      if (typeof CMD_KO === 'object') CMD_KO.flange3d = '플랜지 3D 자동설계';
      if (typeof KO_CMD === 'object') for (const k of ['플랜지3D', '플랜지3d', '플랜지자동설계', '3D플랜지', '3d플랜지']) KO_CMD[k] = 'flange3d';
    }
  } catch (_) { }

  window.AUTO3D = { verify, measure, run, open, _brief: brief, _norm: normSize };
})();
