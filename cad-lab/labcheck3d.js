/* 무카 CAD 테스트 서버 — 3D 자가검사 (2026-11-03)
   ① model3d_views : 만든 3D 를 5면(등각·정면·옆·위·아래) 한 장으로 그리고, 숫자로 점검
        - 겹침: 두 부품이 실제로 같은 공간을 차지 (OCC 교집합 부피)
        - 떠 있음: 다른 어떤 부품과도 닿지 않는 부품 (OCC 최단 거리)
        - 부피 0: 면만 있고 속이 없는 부품
      (Amagine3D 의 5면 검토 · Multi-Agent-CAD 의 따로 검사하는 단계를 무카 방식으로)
   ② model3d_selftest : 정답을 아는 표준 형상 9개를 만들어 부피·겉넓이·무게중심·크기를 공식 값과 비교
        + 화면용 삼각형(메시) 부피 · STEP 저장 → 다시 읽기 부피 (solidcraft 의 '정답 비교 시험' 방식)
   명령줄: 5면 (VIEW5) · 3D자체시험 (SELFTEST3D)   AI: {"cmd":"model3d_views"} · {"cmd":"model3d_selftest"} */
(function () {
  'use strict';
  const ph = () => window.LABPHOTO, lab = () => window.LAB3D;
  const r2 = x => Math.round(x * 100) / 100;
  const KO = { iso: '등각', front: '정면', right: '옆면', top: '윗면', bottom: '아랫면', rear: '뒷면', left: '왼쪽', front34: '앞 3/4', rear34: '뒤 3/4' };
  const occ = async () => { const v = lab()._v(); await v.ensure3D(); return v.ensureOCC(); };

  /* ---------- 점검 ---------- */
  function boxOf(p) { const b = p.shape.boundingBox.bounds; return { min: b[0], max: b[1] }; }
  const boxGap = (a, b) => { let g = 0; for (let i = 0; i < 3; i++) { const d = Math.max(a.min[i] - b.max[i], b.min[i] - a.max[i], 0); g = Math.max(g, d); } return g; };
  function volOf(R, s) { try { const m = R.measureShapeVolumeProperties(s); const v = m.volume; try { m.delete(); } catch (_) { } return v; } catch (_) { return null; } }
  async function inspect(c) {
    const R = await occ(), PH = ph();
    if (!PH.model) throw new Error('먼저 model3d 로 3D 모델을 만드세요');
    const P = PH.model.parts, n = P.length, t0 = performance.now();
    const B = P.map(boxOf), V = P.map(p => volOf(R, p.shape));
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const b of B) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b.min[i]); mx[i] = Math.max(mx[i], b.max[i]); }
    const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
    const touch = c.touch_mm != null ? +c.touch_mm : Math.max(0.05, diag * 0.0005);   // 이 거리 안이면 닿은 것으로 봄
    const empty = [], overlap = [], floating = [];
    P.forEach((p, i) => { if (!(V[i] > 1e-6)) empty.push({ part: p.no, name: p.name }); });
    const MAXPAIR = c.max_pairs || 400, BUDGET = c.budget_ms || 20000; let pairs = 0, skipped = 0;
    const near = P.map(() => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const g = boxGap(B[i], B[j]); if (g > touch) continue;
      near[i].push(j); near[j].push(i);
      if (g > 0 || !(V[i] > 0) || !(V[j] > 0)) continue;
      if (pairs >= MAXPAIR || performance.now() - t0 > BUDGET) { skipped++; continue; } pairs++;
      let iv = 0;
      try { const x = P[i].shape.clone().intersect(P[j].shape.clone()); iv = volOf(R, x) || 0; try { x.delete(); } catch (_) { } } catch (_) { iv = 0; }
      const small = Math.min(V[i], V[j]);
      if (iv > Math.max(0.5, small * 0.001)) overlap.push({ a: P[i].no, b: P[j].no, vol_mm3: r2(iv), pct_of_smaller: r2(iv / small * 100) });
    }
    if (n > 1) {
      for (let i = 0; i < n; i++) {
        if (!near[i].length) { let g = Infinity; for (let j = 0; j < n; j++) if (j !== i) g = Math.min(g, boxGap(B[i], B[j])); floating.push({ part: P[i].no, name: P[i].name, gap_mm: r2(g), how: '상자 간격' }); continue; }
        let best = Infinity;
        for (const j of near[i].slice(0, 6)) { try { const d = R.measureDistanceBetween(P[i].shape, P[j].shape); best = Math.min(best, d); if (best <= touch) break; } catch (_) { best = Math.min(best, 0); } }
        if (best > touch) floating.push({ part: P[i].no, name: P[i].name, gap_mm: r2(best), how: '최단 거리' });
      }
    }
    /* 같은 번호 부품(나사 여러 개)은 한 줄로 묶어서 알려 줌 */
    const uniq = (arr, key) => { const m = new Map(); for (const x of arr) { const k = key(x); const o = m.get(k); if (o) o.count++; else m.set(k, Object.assign({ count: 1 }, x)); } return [...m.values()]; };
    overlap.sort((a, b) => b.pct_of_smaller - a.pct_of_smaller);
    /* 작은 부품 부피의 5% 이상 = 큰 겹침(고칠 것), 그보다 작으면 '살짝 박힘'(볼트·용접처럼 일부러일 수 있음) */
    const big = overlap.filter(o => o.pct_of_smaller >= 5), small = overlap.filter(o => o.pct_of_smaller < 5);
    const ov = uniq(big, x => x.a + '|' + x.b), sm = uniq(small, x => x.a + '|' + x.b), fl = uniq(floating, x => x.part), em = uniq(empty, x => x.part);
    return { parts: n, size_mm: mx.map((x, i) => r2(x - mn[i])), touch_mm: r2(touch), overlap: ov.slice(0, 30), overlap_small: sm.slice(0, 30), floating: fl.slice(0, 30), empty: em.slice(0, 30), pairs_checked: pairs, pairs_skipped: skipped, ms: Math.round(performance.now() - t0), ok: !ov.length && !fl.length && !em.length };
  }

  /* ---------- 5면 그림 ---------- */
  const loadImg = b64 => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = 'data:image/png;base64,' + b64; });
  async function views5(c) {
    const PH = ph(); if (!PH.model) throw new Error('먼저 model3d 로 3D 모델을 만드세요');
    const views = (Array.isArray(c.views) && c.views.length ? c.views : ['iso', 'front', 'right', 'top', 'bottom']).slice(0, 5);
    const chk = c.check === false ? null : await inspect(c);
    const q0 = PH.queue.length;
    for (const v of views) { const r = (await PH.cmds([{ cmd: 'model3d_view', view: v, w: 640, h: 480, labels: c.labels }])).results[0]; if (!r.ok) throw new Error(r.error); }
    const shots = PH.queue.splice(q0, views.length);
    const CW = 640, CH = 480, out = document.createElement('canvas'); out.width = CW * 3; out.height = CH * 2;
    const g = out.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, out.width, out.height);
    for (let k = 0; k < shots.length; k++) {
      const im = await loadImg(shots[k].png), x = (k % 3) * CW, y = Math.floor(k / 3) * CH;
      g.drawImage(im, x, y, CW, CH);
      g.fillStyle = '#16324f'; g.fillRect(x, y + CH - 30, 120, 30); g.fillStyle = '#fff'; g.font = 'bold 17px sans-serif'; g.fillText(KO[views[k]] || views[k], x + 12, y + CH - 9);
      g.strokeStyle = '#c9d2dc'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, CW - 2, CH - 2);
    }
    /* 6번째 칸: 점검 결과 */
    const X = 2 * CW, Y = CH; g.fillStyle = '#f7f9fb'; g.fillRect(X, Y, CW, CH); g.strokeStyle = '#c9d2dc'; g.strokeRect(X + 1, Y + 1, CW - 2, CH - 2);
    let ly = Y + 36; const line = (t, col, bold) => { if (ly > Y + CH - 14) return; g.fillStyle = col || '#16324f'; g.font = (bold ? 'bold ' : '') + '16px sans-serif'; g.fillText(t.length > 58 ? t.slice(0, 57) + '…' : t, X + 18, ly); ly += 24; };
    line('자가검사 — 부품 ' + PH.model.parts.length + '개', '#16324f', true);
    if (!chk) line('(점검 끔)', '#555');
    else {
      line(chk.ok ? '✔ 큰 겹침·떠 있음·부피 0 없음' : '고칠 곳이 있습니다', chk.ok ? '#1b7a3a' : '#b42318', true);
      for (const o of chk.overlap.slice(0, 6)) line(`겹침  ${o.a} ↔ ${o.b}  ${o.vol_mm3} mm³ (${o.pct_of_smaller}%)${o.count > 1 ? ' ×' + o.count : ''}`, '#b42318');
      if (chk.overlap.length > 6) line(`… 겹침 ${chk.overlap.length - 6}쌍 더`, '#b42318');
      for (const f of chk.floating.slice(0, 5)) line(`떠 있음  ${f.part} ${f.name}  틈 ${f.gap_mm} mm${f.count > 1 ? ' ×' + f.count : ''}`, '#b54708');
      for (const e of chk.empty.slice(0, 3)) line(`부피 0  ${e.part} ${e.name}`, '#b54708');
      if (chk.overlap_small.length) line(`살짝 박힘(5% 미만) ${chk.overlap_small.length}쌍: ` + chk.overlap_small.slice(0, 4).map(o => o.a + '↔' + o.b).join(' '), '#667085');
      if (chk.pairs_skipped) line(`시간 한도로 ${chk.pairs_skipped}쌍은 검사 못 함`, '#667085');
      ly += 6; line(`닿음 기준 ${chk.touch_mm} mm · 교집합 검사 ${chk.pairs_checked}쌍 · ${(chk.ms / 1000).toFixed(1)}초`, '#667085');
    }
    const u = out.toDataURL('image/png');
    const note = `3D 5면 자가검사 (${views.map(v => KO[v] || v).join('·')})${chk ? (chk.ok ? ' · 문제 없음' : ` · 큰 겹침 ${chk.overlap.length} · 떠 있음 ${chk.floating.length} · 부피0 ${chk.empty.length} — 그림의 부품 번호를 보고 해당 part 좌표를 고쳐 model3d 를 다시`) : ''}`;
    PH.queue.push({ png: u.slice(u.indexOf(',') + 1), note }); PH.lastImage = u;
    return Object.assign({ views, image: 'mucca_snapshot 으로 5면 그림을 보세요', note }, chk ? { check: chk } : {});
  }

  /* ---------- 정답 비교 시험 ---------- */
  const PI = Math.PI;
  const CASES = [
    { id: 'box', ko: '상자 100×60×40', make: R => R.makeBox([0, 0, 0], [100, 60, 40]), V: 240000, A: 24800, C: [50, 30, 20], BB: [100, 60, 40] },
    { id: 'cyl', ko: '원기둥 R25×80', make: R => R.makeCylinder(25, 80, [0, 0, 0], [0, 0, 1]), V: PI * 625 * 80, A: 2 * PI * 625 + 2 * PI * 25 * 80, C: [0, 0, 40], BB: [50, 50, 80] },
    { id: 'tube', ko: '관 R30/R20×100 (X축)', make: R => R.makeCylinder(30, 100, [0, 0, 0], [1, 0, 0]).cut(R.makeCylinder(20, 102, [-1, 0, 0], [1, 0, 0])), V: PI * 500 * 100, A: 2 * PI * 50 * 100 + 2 * PI * 500, C: [50, 0, 0], BB: [100, 60, 60] },
    { id: 'sphere', ko: '구 R20 @ (10,20,30)', make: R => R.makeSphere(20).translate([10, 20, 30]), V: 4 / 3 * PI * 8000, A: 4 * PI * 400, C: [10, 20, 30], BB: [40, 40, 40] },
    { id: 'plate', ko: '판 200×100×10 + 구멍 Ø12×4', make: R => { let s = R.makeBox([0, 0, 0], [200, 100, 10]); for (const [x, y] of [[20, 20], [180, 20], [20, 80], [180, 80]]) s = s.cut(R.makeCylinder(6, 12, [x, y, -1], [0, 0, 1])); return s; }, V: 200000 - 4 * PI * 36 * 10, A: 2 * (20000 - 4 * PI * 36) + 2 * (2000 + 1000) + 4 * 2 * PI * 6 * 10, C: [100, 50, 5], BB: [200, 100, 10] },
    { id: 'cone', ko: '원뿔대 R30→R10×50 (회전)', make: R => R.draw([0, 0]).lineTo([30, 0]).lineTo([10, 50]).lineTo([0, 50]).close().sketchOnPlane('XZ').revolve(), V: PI * 50 / 3 * (900 + 300 + 100), A: PI * (900 + 100) + PI * 40 * Math.hypot(20, 50), C: [0, 0, 50 * (900 + 600 + 300) / (4 * 1300)], BB: [60, 60, 50] },
    { id: 'fillet', ko: '모서리 R5 둥근 정육면체 100', make: R => R.makeBox([0, 0, 0], [100, 100, 100]).fillet(5), V: 90 ** 3 + 6 * 90 * 90 * 5 + 3 * PI * 25 * 90 + 4 / 3 * PI * 125, A: 6 * 8100 + 6 * PI * 5 * 90 + 4 * PI * 25, C: [50, 50, 50], BB: [100, 100, 100] },
    { id: 'lbracket', ko: 'ㄱ자 브래킷 (합치기)', make: R => R.makeBox([0, 0, 0], [100, 50, 10]).fuse(R.makeBox([0, 0, 0], [10, 50, 100])), V: 95000, A: 2 * (100 * 50 + 10 * 50 + 100 * 10) * 2 - 2 * (10 * 50 + 10 * 10) - 2 * 10 * 50 + 0, C: [(50000 * 50 + 50000 * 5 - 5000 * 5) / 95000, 25, (50000 * 5 + 50000 * 50 - 5000 * 5) / 95000], BB: [100, 50, 100] },
    { id: 'rot', ko: '상자 Z축 30° 회전', make: R => R.makeBox([0, 0, 0], [100, 60, 40]).rotate(30, [0, 0, 0], [0, 0, 1]), V: 240000, A: 24800, C: [50 * Math.cos(PI / 6) - 30 * Math.sin(PI / 6), 50 * Math.sin(PI / 6) + 30 * Math.cos(PI / 6), 20], BB: [100 * Math.cos(PI / 6) + 60 * Math.sin(PI / 6), 100 * Math.sin(PI / 6) + 60 * Math.cos(PI / 6), 40] }
  ];
  /* ㄱ자 겉넓이: 두 상자 겉넓이 합 − 겹친 상자(10×50×10)가 만든 안쪽 면. 직접 셈: */
  CASES.find(c => c.id === 'lbracket').A = (() => {
    // 바닥판 100×50×10 + 세운판 10×50×100, 겹침 10×50×10 (x0..10, z0..10)
    // 바깥면: 아래(100×50) + 뒤·앞(100×10 + 10×90 각 2장) + 오른쪽 끝(50×10) + 바닥판 윗면(90×50) + 세운판 왼쪽(50×100) + 세운판 오른쪽(50×90) + 세운판 위(10×50)
    return 100 * 50 + 2 * (100 * 10 + 10 * 90) + 50 * 10 + 90 * 50 + 50 * 100 + 50 * 90 + 10 * 50;
  })();
  function meshVol(s) {
    const m = s.mesh({ tolerance: 0.01, angularTolerance: 0.1 }), v = m.vertices, t = m.triangles; let V = 0;
    for (let i = 0; i < t.length; i += 3) { const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
      V += (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) / 6; }
    return Math.abs(V);
  }
  async function selftest(c) {
    const R = await occ(), t0 = performance.now(), rows = [];
    const want = Array.isArray(c.only) ? new Set(c.only) : null;
    for (const k of CASES) {
      if (want && !want.has(k.id)) continue;
      const row = { id: k.id, name: k.ko }; let s = null;
      try {
        s = k.make(R);
        const vp = R.measureShapeVolumeProperties(s), V = vp.volume, C = vp.centerOfMass; try { vp.delete(); } catch (_) { }
        const sp = R.measureShapeSurfaceProperties(s), A = sp.area; try { sp.delete(); } catch (_) { }
        const b = s.boundingBox.bounds, BB = [0, 1, 2].map(i => b[1][i] - b[0][i]);
        row.vol = { got: r2(V), want: r2(k.V), err_pct: +(Math.abs(V - k.V) / k.V * 100).toFixed(5) };
        row.area = { got: r2(A), want: r2(k.A), err_pct: +(Math.abs(A - k.A) / k.A * 100).toFixed(5) };
        row.center = { got: C.map(r2), want: k.C.map(r2), err_mm: +Math.hypot(...C.map((x, i) => x - k.C[i])).toFixed(4) };
        row.size = { got: BB.map(r2), want: k.BB.map(r2), err_mm: +Math.max(...BB.map((x, i) => Math.abs(x - k.BB[i]))).toFixed(3) };
        const mv = meshVol(s); row.mesh_vol_err_pct = +(Math.abs(mv - k.V) / k.V * 100).toFixed(3);
        if (c.step !== false) {
          try { const blob = R.exportSTEP([{ shape: s.clone(), name: k.id }]); const back = await R.importSTEP(blob); const bv = volOf(R, back); row.step_vol_err_pct = bv == null ? null : +(Math.abs(bv - k.V) / k.V * 100).toFixed(5); row.step_kb = +(blob.size / 1024).toFixed(1); try { back.delete(); } catch (_) { } }
          catch (e) { row.step_vol_err_pct = null; row.step_err = String(e && e.message || e).slice(0, 80); }
        }
        /* 판정: OCC 값은 공식과 0.01% 안, 무게중심 0.01mm, 크기 0.05mm(상자 계산 여유), 화면 메시 1%, STEP 왕복 0.01% */
        const bad = [];
        if (row.vol.err_pct > 0.01) bad.push('부피'); if (row.area.err_pct > 0.01) bad.push('겉넓이'); if (row.center.err_mm > 0.01) bad.push('무게중심');
        if (row.size.err_mm > 0.05) bad.push('크기'); if (row.mesh_vol_err_pct > 1) bad.push('화면 메시'); if (c.step !== false && !(row.step_vol_err_pct <= 0.01)) bad.push('STEP 왕복');
        row.pass = !bad.length; if (bad.length) row.fail = bad;
      } catch (e) { row.pass = false; row.fail = ['만들기 오류: ' + String(e && e.message || e).slice(0, 100)]; }
      try { s && s.delete(); } catch (_) { }
      rows.push(row);
    }
    const pass = rows.filter(r => r.pass).length;
    window.__selftest3d = { pass, total: rows.length, rows, ms: Math.round(performance.now() - t0) };
    return { pass, total: rows.length, ms: window.__selftest3d.ms, rows, note: pass === rows.length ? '모든 표준 형상이 공식 값과 맞습니다' : '틀린 항목: ' + rows.filter(r => !r.pass).map(r => r.name + '(' + r.fail.join('·') + ')').join(', ') };
  }

  ph().addCmd('model3d_views', views5);
  ph().addCmd('model3d_inspect', inspect);
  ph().addCmd('model3d_selftest', selftest);
  window.LABCHECK3D = { inspect, views5, selftest, CASES };

  /* ---------- 명령줄 ---------- */
  /* 3D 만 보기(2D 칸 숨김)일 때도 보이게: 창을 화면 전체 위로 */
  function lift(m) { try { document.body.appendChild(m); m.style.position = 'fixed'; m.style.zIndex = '60'; } catch (_) { } return m; }
  function showImage(title, url, text) {
    const im = document.createElement('img'); im.src = url; im.alt = title; im.style.cssText = 'display:block;max-width:100%;height:auto;border-radius:6px;background:#fff';
    const p = document.createElement('p'); p.style.cssText = 'margin:8px 0 0;white-space:pre-line'; p.textContent = text || '';
    const m = lift(modal(title, [im, p])); try { m.querySelector('.sheet').style.maxWidth = 'min(1280px, 96vw)'; m.querySelector('.sheet').style.width = 'min(1280px, 96vw)'; } catch (_) { }
  }
  try {
    TOOLS.view5 = () => { (async () => { try { if (!ph().model) { log('5면 자가검사는 AI 로 만든 3D(model3d)가 있을 때 씁니다', 'err'); return; } log('3D 5면 그림과 겹침·떠 있음 점검 중…', 'me'); const r = await views5({}); const k = r.check; log(`5면 자가검사: ${k.ok ? '문제 없음' : `큰 겹침 ${k.overlap.length}쌍 · 떠 있음 ${k.floating.length} · 부피 0 ${k.empty.length}`} (부품 ${k.parts}개, ${(k.ms / 1000).toFixed(1)}초)`, k.ok ? 'ok' : 'err'); showImage('3D 5면 자가검사', ph().lastImage, (k.ok ? '큰 겹침·떠 있음·부피 0 없음' : [...k.floating.map(f => `떠 있음 ${f.part} ${f.name} : 다른 부품과 ${f.gap_mm} mm 떨어짐`), ...k.empty.map(e => `부피 0 ${e.part} ${e.name}`), ...k.overlap.slice(0, 10).map(o => `겹침 ${o.a} ↔ ${o.b} : ${o.vol_mm3} mm³ (작은 쪽의 ${o.pct_of_smaller}%)`), k.overlap.length > 10 ? `… 큰 겹침 ${k.overlap.length - 10}쌍 더` : ''].filter(Boolean).join('\n')) + (k.overlap_small.length ? `\n살짝 박힘(5% 미만, 볼트·용접처럼 일부러일 수 있음) ${k.overlap_small.length}쌍` : '') + '\nAI 로 만든 3D 라면 같은 AI 대화에서 "5면 자가검사 결과대로 고쳐 줘" 라고 하면 됩니다.'); } catch (e) { log('5면 자가검사 실패: ' + (e.message || e), 'err'); } })(); return null; };
    TOOLS.selftest3d = () => { (async () => { try { log('3D 정답 비교 시험 중 (표준 형상 9개)…', 'me'); const r = await selftest({}); log(`3D 정답 비교 시험: ${r.pass}/${r.total} 통과 (${(r.ms / 1000).toFixed(1)}초)${r.pass === r.total ? '' : ' — ' + r.note}`, r.pass === r.total ? 'ok' : 'err');
      const t = document.createElement('table'); t.style.cssText = 'border-collapse:collapse;font:12px/1.5 var(--mono,monospace);width:100%';
      t.innerHTML = '<tr><th style="text-align:left">형상</th><th>부피 오차%</th><th>겉넓이 오차%</th><th>무게중심 mm</th><th>크기 mm</th><th>메시%</th><th>STEP%</th><th>판정</th></tr>' + r.rows.map(x => `<tr><td>${x.name}</td><td>${x.vol ? x.vol.err_pct : '-'}</td><td>${x.area ? x.area.err_pct : '-'}</td><td>${x.center ? x.center.err_mm : '-'}</td><td>${x.size ? x.size.err_mm : '-'}</td><td>${x.mesh_vol_err_pct ?? '-'}</td><td>${x.step_vol_err_pct ?? '-'}</td><td>${x.pass ? '통과' : '✗ ' + x.fail.join('·')}</td></tr>`).join('');
      t.querySelectorAll('td,th').forEach(e => { e.style.padding = '3px 6px'; e.style.borderBottom = '1px solid var(--rule,#ccc)'; if (e.cellIndex) e.style.textAlign = 'right'; });
      lift(modal(`3D 정답 비교 시험 — ${r.pass}/${r.total} 통과`, [t])); } catch (e) { log('3D 정답 비교 시험 실패: ' + (e.message || e), 'err'); } })(); return null; };
    Object.assign(ALIAS, { VIEW5: 'view5', '5VIEW': 'view5', INSPECT3D: 'view5', SELFTEST3D: 'selftest3d', TEST3D: 'selftest3d' });
    Object.assign(CMD_KO, { view5: '3D 5면 자가검사', selftest3d: '3D 정답 비교 시험' });
    for (const k of ['5면', '5면검사', '5면그림', '자가검사', '3D점검', '겹침검사']) KO_CMD[k] = 'view5';
    for (const k of ['3D자체시험', '정답비교', '정답비교시험', '3D시험']) KO_CMD[k] = 'selftest3d';
  } catch (_) { }

  /* ---------- 가이드 (mucca_guide 뒤에 붙음) ---------- */
  const G = `3D 자가검사 (model3d 다음에 꼭)
 · {"cmd":"model3d_views"} — 3D 를 등각·정면·옆면·윗면·아랫면 5면 한 장으로 그리고(부품 번호 표시), 숫자로 점검:
     overlap = 두 부품이 같은 공간을 크게 차지(작은 부품 부피의 5% 이상, mm³·%) · overlap_small = 살짝 박힘(5% 미만, 볼트·용접처럼 일부러일 수 있음) · floating = 어떤 부품과도 닿지 않음(틈 mm) · empty = 부피 0
     → mucca_snapshot 으로 그림을 보고, 결과가 ok 가 아니면 해당 part 좌표를 고쳐 model3d 를 다시 → 다시 model3d_views (최소 1번 확인)
     일부러 겹치게 만든 것(용접 덧살 등)은 그대로 둬도 되지만, 사용자에게 말로 알려 줄 것
     "views":["iso","front","right","top","bottom"] 로 바꿀 수 있음 (rear·left·front34·rear34 도 됨) · "touch_mm": 닿음 기준
 · {"cmd":"model3d_inspect"} — 그림 없이 숫자 점검만
 · {"cmd":"model3d_selftest"} — 3D 엔진 정답 비교 시험(표준 형상 9개의 부피·겉넓이·무게중심·크기·메시·STEP 왕복). 지금 모델은 건드리지 않음`;
  const hook = () => { const g = window.LAB2D; if (g && typeof g.guide === 'string') { if (!g.guide.includes('model3d_views')) g.guide += '\n\n' + G; return true; } return false; };
  if (!hook()) { let n = 0; const t = setInterval(() => { if (hook() || ++n > 40) clearInterval(t); }, 500); }
})();
