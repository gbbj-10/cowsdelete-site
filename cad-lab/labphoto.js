/* 무카 CAD 테스트 서버 — 사진 → 3D (lab 전용)
   사용자가 AI 입력칸 📎 로 사진을 붙이고 "이 사진으로 3D 만들어줘 (발판 500)" 처럼 요청하면,
   사용자의 Claude 가 연결 프로그램의 기존 도구(mucca_guide · mucca_draw · mucca_snapshot)만으로
     ① 사진 격자로 픽셀 좌표 읽기 → ② 치수 1개로 비율 계산 → ③ 부품별 3D 코드(replicad) 실행
     → ④ 3D 윤곽을 사진에 겹쳐 확인·수정 → ⑤ 3D 보기 → ⑥ 2D 도면(투영도)으로 넣기
   까지 하도록 명령과 절차(가이드)를 제공한다. 연결 프로그램(허브)은 바꾸지 않는다.
   이 파일은 lab3d.js 의 LAB3D._v() (three.js·OpenCascade·3D 창)를 씀 */
(function () {
  'use strict';
  const PH = window.LABPHOTO = { photos: [], queue: [], model: null, ver: 1 };
  const MAXPX = 1568;
  const lab = () => window.LAB3D;
  const V = () => { const L = lab(); if (!L || !L._v) throw new Error('3D 기능을 불러오는 중입니다. 잠시 뒤 다시 시도하세요'); return L._v(); };

  /* ---------------- 1) 사진 ---------------- */
  function loadImg(url) { return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('사진을 읽지 못했습니다')); im.src = url; }); }
  async function addPhoto(url, name) {
    let im = await loadImg(url);
    const k = Math.min(1, MAXPX / Math.max(im.naturalWidth, im.naturalHeight));
    if (k < 1) { const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); im = await loadImg(c.toDataURL('image/jpeg', 0.92)); }
    const p = { i: PH.photos.length + 1, name: name || ('사진 ' + (PH.photos.length + 1)), w: im.naturalWidth, h: im.naturalHeight, img: im };
    PH.photos.push(p); return p;
  }
  PH.addPhoto = addPhoto;
  // 📎 첨부: 요청을 보낼 때 대화창에 붙는 썸네일(원본 데이터)을 사진 목록으로 잡아 둠
  function hookAiref() {
    const A = window.AIREF; if (!A || A.__ph) return; A.__ph = true;
    // 대비책: 썸네일을 못 잡았으면 Claude 가 첨부를 받아 갈 때(mucca_snapshot) 잡음
    const n0 = A.next.bind(A);
    A.next = function () { const r = n0(); try { const m = r && /참고 이미지 (\d+)\//.exec(r.note || ''); if (m && PH.photos.length < +m[1]) { const nm = (/"(.+?)"/.exec(r.note) || [])[1]; PH.pending = Promise.resolve(PH.pending).then(() => addPhoto('data:image/png;base64,' + r.png, nm)).catch(() => { }); } } catch (_) { } return r; };
    const w0 = A.wrap.bind(A);
    A.wrap = function (text) {
      const ims = [...document.querySelectorAll('.aiRefs .aiRef img')].map(i => ({ src: i.src, alt: i.alt }));   // 보내기 직전 첨부 칸의 사진
      const t = w0(text); if (t === text) return t;
      if (ims.length) { PH.photos = []; PH.pending = Promise.all(ims.map(i => addPhoto(i.src, i.alt))).catch(() => { }); }
      return t + '\n[테스트 서버] 사진·손그림으로 3D 모델을 만들어 달라는 요청이면 mucca_guide 의 "사진 → 3D" 절차를 따른다 (첨부 사진은 photo_list 로 번호 확인).';
    };
  }
  hookAiref(); setTimeout(hookAiref, 1500); setTimeout(hookAiref, 5000);
  function photo(n) { const p = PH.photos[(n || 1) - 1]; if (!p) throw new Error(PH.photos.length ? `사진 ${n}번이 없습니다 (1~${PH.photos.length})` : '첨부된 사진이 없습니다. 사용자에게 AI 입력칸 📎 로 사진을 붙여 달라고 하세요'); return p; }

  /* 이미지 대기열: 다음 mucca_snapshot 이 이걸 먼저 돌려줌 */
  function enqueue(canvas, note) { const u = canvas.toDataURL('image/png'); PH.queue.push({ png: u.slice(u.indexOf(',') + 1), note }); PH.lastImage = u; }
  PH.next = () => PH.queue.length ? PH.queue.shift() : null;
  const QN = n => `다음 mucca_snapshot 호출 때 이 이미지가 옵니다${n > 1 ? ` (대기 ${n}장)` : ''}`;

  function niceStep(span, n) { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p; return 10 * p; }
  function gridImage(c) {
    const p = photo(c.photo);
    let [x0, y0, x1, y1] = Array.isArray(c.crop) && c.crop.length === 4 ? c.crop.map(Number) : [0, 0, p.w, p.h];
    x0 = Math.max(0, Math.min(x0, p.w - 2)); y0 = Math.max(0, Math.min(y0, p.h - 2)); x1 = Math.max(x0 + 2, Math.min(x1, p.w)); y1 = Math.max(y0 + 2, Math.min(y1, p.h));
    const cw = x1 - x0, ch = y1 - y0, k = Math.min(1400 / Math.max(cw, ch), 6), W = Math.round(cw * k), H = Math.round(ch * k);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.drawImage(p.img, x0, y0, cw, ch, 0, 0, W, H);
    const step = +c.step > 0 ? +c.step : niceStep(Math.max(cw, ch), 14), minor = step / 2;
    g.lineWidth = 1; g.font = `bold ${Math.max(12, Math.round(14))}px sans-serif`; g.textBaseline = 'top';
    for (let pass = 0; pass < 2; pass++) {
      const st = pass ? step : minor;
      g.strokeStyle = pass ? 'rgba(255,40,40,.85)' : 'rgba(80,190,255,.55)';
      for (let x = Math.ceil(x0 / st) * st; x <= x1; x += st) { const X = Math.round((x - x0) * k) + 0.5; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, H); g.stroke(); }
      for (let y = Math.ceil(y0 / st) * st; y <= y1; y += st) { const Y = Math.round((y - y0) * k) + 0.5; g.beginPath(); g.moveTo(0, Y); g.lineTo(W, Y); g.stroke(); }
    }
    const lab_ = (t, X, Y, col) => { const w = g.measureText(t).width + 6; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(X, Y, w, 17); g.fillStyle = col; g.fillText(t, X + 3, Y + 2); };
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const X = Math.round((x - x0) * k); for (const Y of [2, Math.round(H / 2), H - 20]) lab_(String(Math.round(x)), X + 2, Y, '#c00'); }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const Y = Math.round((y - y0) * k); for (const X of [2, Math.round(W / 2)]) lab_(String(Math.round(y)), X, Y + 2, '#0047b3'); }
    if (minor * k >= 45) {   // 확대했을 때는 가는 선에도 숫자
      g.font = '11px sans-serif';
      for (let x = Math.ceil(x0 / step) * step + minor; x <= x1; x += step) lab_(String(Math.round(x)), Math.round((x - x0) * k) + 2, 22, '#c00');
      for (let y = Math.ceil(y0 / step) * step + minor; y <= y1; y += step) lab_(String(Math.round(y)), 2, Math.round((y - y0) * k) + 2, '#0047b3');
      g.font = 'bold 14px sans-serif';
    }
    for (const m of (Array.isArray(c.mark) ? c.mark : []).slice(0, 60)) {
      const X = (m[0] - x0) * k, Y = (m[1] - y0) * k; g.strokeStyle = '#ffe600'; g.lineWidth = 3; g.beginPath(); g.moveTo(X - 12, Y); g.lineTo(X + 12, Y); g.moveTo(X, Y - 12); g.lineTo(X, Y + 12); g.stroke();
      g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.arc(X, Y, 5, 0, 7); g.stroke(); if (m[2]) lab_(String(m[2]), X + 8, Y + 6, '#000');
    }
    enqueue(cv, `사진 ${p.i} 격자 — 빨간 숫자 = 사진 가로 픽셀(x), 파란 숫자 = 세로 픽셀(y, 아래로 증가). 굵은 선 간격 ${step}px` + (c.crop ? ` · 확대 영역 [${[x0, y0, x1, y1].map(Math.round)}]` : '') + (c.mark ? ' · 노란 + = 지정한 점' : '') + ` · 이 이미지는 사진을 ${k.toFixed(2)}배로 그린 것 — 위치는 반드시 격자 숫자(사진 픽셀)로 읽고, 화면 위치로 계산하지 말 것`);
    return { photo: p.i, size: [p.w, p.h], crop: [x0, y0, x1, y1].map(Math.round), step, image_scale: +k.toFixed(3), note: QN(PH.queue.length) };
  }

  /* ---------------- 2) 3D 코드 실행 (replicad) ---------------- */
  const COL = { body: '#dbe7a8', dark: '#2c2e31', black: '#151517', rubber: '#1b1b1b', chrome: '#cfd3d8', silver: '#a2a6ab', metal: '#8e959c', yellow: '#e8b422', white: '#f2f2f2', red: '#c62828', orange: '#e8771e', green: '#3f8f4f', blue: '#2f6fb3', grip: '#66756a', screen: '#1f242b', lens: '#d8e3ee', wood: '#b58a5a', glass: '#bcd4e6' };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], len3 = a => Math.hypot(a[0], a[1], a[2]);
  function helpers(R, parts) {
    const own = [];  // 지우기용
    const keep = s => (own.push(s), s);
    const H = {};
    H.C = COL;
    H.part = (no, name, color, shape) => {
      if (!shape || !shape.wrapped) throw new Error(`part(${no}): 형상이 아닙니다`);
      parts.push({ no: String(no), name: String(name || no), color: COL[color] || color || '#c8c8c8', shape });
    };
    H.box = (p0, p1) => R.makeBox(p0, p1);
    H.cyl = (p0, p1, r) => { const d = sub(p1, p0), L = len3(d); if (L < 1e-6) throw new Error('cyl: 두 점이 같습니다'); return R.makeCylinder(r, L, p0, d.map(x => x / L)); };
    H.tube = (p0, p1, rOut, rIn) => { const d = sub(p1, p0), L = len3(d), u = d.map(x => x / L); const o = H.cyl(p0, p1, rOut); if (!(rIn > 0)) return o; const e = 0.5; return o.cut(H.cyl(sub(p0, u.map(x => x * e)), add3(p1, u.map(x => x * e)), rIn)); };
    H.sphere = (c, r) => R.makeSphere(r).translate(c);
    // 축 돌리기: Z축 → dir
    const orient = (s, dir) => {
      let d = typeof dir === 'string' ? ({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], '-X': [-1, 0, 0], '-Y': [0, -1, 0], '-Z': [0, 0, -1] })[dir.toUpperCase()] : dir;
      if (!d) throw new Error('축은 "X"·"Y"·"Z" 또는 [x,y,z]'); const L = len3(d); d = d.map(x => x / L);
      const ax = [-d[1], d[0], 0], s2 = len3(ax), ang = Math.atan2(s2, d[2]) * 180 / Math.PI;
      if (s2 < 1e-9) return d[2] > 0 ? s : s.rotate(180, [0, 0, 0], [1, 0, 0]);
      return s.rotate(ang, [0, 0, 0], ax.map(x => x / s2));
    };
    // 회전체: prof = [[반지름, 축방향 위치], ...] 닫힌 다각형 (축 위 점 c 기준)
    H.revolve = (c, axis, prof) => {
      if (!Array.isArray(prof) || prof.length < 3) throw new Error('revolve: 단면 점 3개 이상');
      let d = R.draw(prof[0]); for (const q of prof.slice(1)) d = d.lineTo(q); const s = d.close().sketchOnPlane('XZ').revolve();
      return orient(s, axis || 'Z').translate(c);
    };
    H.torus = (c, Rr, r, axis) => orient(R.drawCircle(r).translate(Rr, 0).sketchOnPlane('XZ').revolve(), axis || 'Z').translate(c);
    // 바퀴 타이어: 둥근 단면(폭 w, 두께 t, 모서리 r)을 축 둘레로
    H.tire = (c, axis, Rout, w, t, r) => orient(R.drawRoundedRectangle(t, w, Math.min(r == null ? t / 2.5 : r, t / 2 - 0.01, w / 2 - 0.01)).translate(Rout - t / 2, 0).sketchOnPlane('XZ').revolve(), axis || 'Y').translate(c);
    // 2D 윤곽 → 돌출. plane: 'XY'(u=x,v=y, 깊이=z) · 'XZ'(u=x,v=z, 깊이=y) · 'YZ'(u=y,v=z, 깊이=x)
    function drawing(prof) {
      if (Array.isArray(prof)) { let d = R.draw(prof[0]); for (const q of prof.slice(1)) d = d.lineTo(q); return d.close(); }
      const at = prof.at || [0, 0];
      if (prof.rrect) { const [w, h, r] = prof.rrect; return (r > 0 ? R.drawRoundedRectangle(w, h, Math.min(r, w / 2 - 0.01, h / 2 - 0.01)) : R.drawRectangle(w, h)).rotate(prof.angle || 0).translate(at[0], at[1]); }
      if (prof.circle) return R.drawCircle(prof.circle).translate(at[0], at[1]);
      if (prof.slot) { const [L, w] = prof.slot; return R.drawRoundedRectangle(L, w, w / 2 - 0.01).rotate(prof.angle || 0).translate(at[0], at[1]); }
      if (prof.smooth) { const P = prof.smooth; return R.drawPointsInterpolation(P.concat([P[0]])).close(); }
      throw new Error('윤곽은 점 배열 또는 {rrect:[w,h,r]} · {circle:r} · {slot:[길이,폭]} · {smooth:[점들]} (+ at:[u,v], angle)');
    }
    function extrudeDrawing(plane, dr, d0, d1) {
      if (!(d1 > d0)) [d0, d1] = [Math.min(d0, d1), Math.max(d0, d1)]; if (d1 - d0 < 1e-6) throw new Error('돌출 깊이가 0입니다');
      const P = String(plane || 'XY').toUpperCase();
      if (P === 'XY') return dr.sketchOnPlane('XY', d0).extrude(d1 - d0);
      if (P === 'XZ') return dr.sketchOnPlane('XY', -d1).extrude(d1 - d0).rotate(90, [0, 0, 0], [1, 0, 0]);
      if (P === 'YZ') return dr.sketchOnPlane('XY', d0).extrude(d1 - d0).rotate(90, [0, 0, 0], [1, 0, 0]).rotate(90, [0, 0, 0], [0, 0, 1]);
      throw new Error('plane 은 "XY" · "XZ" · "YZ"');
    }
    H.prism = (plane, prof, d0, d1) => extrudeDrawing(plane, drawing(prof), d0, d1);
    const pol = (c, r, a) => [c[0] + r * Math.cos(a * Math.PI / 180), c[1] + r * Math.sin(a * Math.PI / 180)];
    // 원호 띠(흙받이·덮개): 중심 c, 안·바깥 반지름, 각도 a0→a1(도, 반시계)
    H.arcBand = (plane, c, rIn, rOut, a0, a1, d0, d1) => {
      const am = (a0 + a1) / 2;
      const dr = R.draw(pol(c, rOut, a0)).threePointsArcTo(pol(c, rOut, a1), pol(c, rOut, am)).lineTo(pol(c, rIn, a1)).threePointsArcTo(pol(c, rIn, a0), pol(c, rIn, am)).close();
      return extrudeDrawing(plane, dr, d0, d1);
    };
    // 케이블·파이프: 점들을 지나는 매끈한 관 (조각 원통 묶음)
    H.pipe = (pts, r) => {
      const P = pts.map(p => p.slice()), out = [];
      const cr = (p0, p1, p2, p3, t) => [0, 1, 2].map(i => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t * t * t));
      const S = [P[0]];
      for (let i = 0; i < P.length - 1; i++) { const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)]; for (let k = 1; k <= 6; k++) S.push(cr(p0, p1, p2, p3, k / 6)); }
      for (let i = 0; i < S.length - 1; i++) { if (len3(sub(S[i + 1], S[i])) < 1e-3) continue; out.push(H.cyl(S[i], S[i + 1], r)); if (i) out.push(R.makeSphere(r).translate(S[i])); }
      return R.makeCompound(out);
    };
    H.union = (...a) => { a = a.flat(); let s = a[0]; for (const b of a.slice(1)) s = s.fuse(b); return s; };
    H.cut = (a, ...b) => { let s = a; for (const x of b.flat()) s = s.cut(x); return s; };
    H.common = (a, b) => a.intersect(b);
    H.group = (...a) => R.makeCompound(a.flat());
    H.move = (s, d) => s.translate(d);
    H.turn = (s, deg, axis, center) => s.rotate(deg, center || [0, 0, 0], typeof axis === 'string' ? ({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] })[axis.toUpperCase()] : (axis || [0, 0, 1]));
    H.mirrorY = s => s.clone().mirror('XZ');   // y → -y 대칭 복사 (원본 유지)
    H.mirrorX = s => s.clone().mirror('YZ');
    H.copy = s => s.clone();
    H.soften = (s, r) => { try { const f = s.clone().fillet(r); s.delete(); return f; } catch (_) { return s; } };
    H.lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
    H.polar = pol;
    H.px = null; H.px3 = null;  // model3d 에서 scale 을 주면 사진 픽셀 → mm 변환 함수가 들어감
    return { H, own };
  }

  const AsyncFn = Object.getPrototypeOf(async function () { }).constructor;
  // 코드 1번째 줄이 오류 스택에서 몇 번째 줄로 나오는지 (브라우저마다 다름)
  const LINE0 = (() => { try { new AsyncFn('"use strict";{\nthrow new Error("x")\n}')().catch(() => { }); } catch (_) { } try { new Function('"use strict";{\nthrow new Error("x")\n}')(); } catch (e) { const m = String(e.stack || '').match(/<anonymous>:(\d+)/); if (m) return +m[1] - 1; } return 2; })();
  async function runModel(c) {
    const v = V(); await v.ensure3D(); const R = await v.ensureOCC();
    const code = Array.isArray(c.code) ? c.code.join('\n') : String(c.code || ''); if (!code.trim()) throw new Error('code 가 비어 있습니다');
    const parts = []; const { H } = helpers(R, parts);
    if (c.scale) { const s = c.scale; const mmpp = +s.mm_per_px || (s.px_per_mm ? 1 / s.px_per_mm : 0); const o = s.origin || [0, 0]; if (mmpp > 0) { H.px = (x, y) => [(x - o[0]) * mmpp, (o[1] - y) * mmpp]; H.px3 = (x, y, ymm) => [(x - o[0]) * mmpp, ymm || 0, (o[1] - y) * mmpp]; } }
    const names = Object.keys(H);
    let ret;
    try { ret = await new AsyncFn('R', ...names, '"use strict";{\n' + code + '\n}')(R, ...names.map(k => H[k])); }
    catch (e) {
      for (const p of parts) try { p.shape.delete(); } catch (_) { }
      const m = String(e && e.stack || '').match(/<anonymous>:(\d+):(\d+)/); const line = m ? +m[1] - LINE0 : null;
      const msg = (e && e.message) || String(e);
      throw new Error(`코드 오류${line ? ` (코드 ${line}번째 줄: ${code.split('\n')[line - 1] ? code.split('\n')[line - 1].trim().slice(0, 120) : ''})` : ''}: ${msg}${/deleted/.test(msg) ? ' — replicad 는 translate·rotate·fuse·cut 한 원본을 지웁니다. 같은 형상을 다시 쓰려면 copy(s) 로 복사하세요' : ''}`);
    }
    if (ret && !parts.length) { (Array.isArray(ret) ? ret : [ret]).forEach((s, i) => s && s.wrapped && H.part('P' + (i + 1), '부품 ' + (i + 1), 'body', s)); }
    if (!parts.length) throw new Error('부품이 없습니다. part(번호, 이름, 색, 형상) 으로 넣으세요');
    // 이전 모델 정리
    if (PH.model) { for (const p of PH.model.parts) try { p.shape.delete(); } catch (_) { } try { PH.model.comp && PH.model.comp.delete(); } catch (_) { } }
    PH.model = { parts, code, proj: {}, at: Date.now() };
    show();
    const bb = modelBox();
    const by = {}; for (const p of parts) (by[p.no] = by[p.no] || { no: p.no, name: p.name, n: 0 }).n++;
    return { parts: parts.length, kinds: Object.keys(by).length, size_mm: bb.size.map(r1), min: bb.min.map(r1), max: bb.max.map(r1), list: Object.values(by).map(b => b.no + ' ' + b.name + (b.n > 1 ? '×' + b.n : '')).join(', ').slice(0, 1500), next: 'model3d_check 로 사진에 겹쳐 확인 → model3d_view 로 3D 확인' };
  }
  const r1 = x => Math.round(x * 10) / 10;
  function modelBox() {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of PH.model.parts) { const b = p.shape.boundingBox.bounds; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b[0][i]); mx[i] = Math.max(mx[i], b[1][i]); } }
    return { min: mn, max: mx, size: mx.map((x, i) => x - mn[i]), center: mx.map((x, i) => (x + mn[i]) / 2) };
  }
  function meshes(T) {
    const out = []; const diag = len3(modelBox().size) || 100;
    for (const p of PH.model.parts) {
      if (!p.geo) {
        const m = p.shape.mesh({ tolerance: Math.max(0.02, diag * 0.0004), angularTolerance: 0.3 });
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(m.vertices, 3));
        if (m.normals && m.normals.length === m.vertices.length) g.setAttribute('normal', new T.Float32BufferAttribute(m.normals, 3)); g.setIndex(m.triangles); if (!g.attributes.normal) g.computeVertexNormals();
        g.computeBoundingBox(); p.geo = g; p.edges = new T.EdgesGeometry(g, 28);
      }
      const col = new T.Color(p.color), dark = col.getHSL({}).l < 0.25;
      out.push({ p, mesh: new T.Mesh(p.geo, new T.MeshStandardMaterial({ color: col, roughness: /chrome|silver|metal/.test(p.color) ? 0.3 : 0.62, metalness: 0.05, side: T.DoubleSide })),
        line: new T.LineSegments(p.edges, new T.LineBasicMaterial({ color: dark ? 0x55606b : 0x1b2633, transparent: true, opacity: dark ? 0.5 : 0.35 })) });
    }
    return out;
  }
  function show() {
    const v = V(), T = v.T, L = lab();
    while (v.root.children.length) v.root.remove(v.root.children[0]);
    const rx = new T.Matrix4().makeRotationX(-Math.PI / 2);
    for (const m of meshes(T)) { const p = m.p; if (!p.geoV) { p.geoV = p.geo.clone().applyMatrix4(rx); p.geoV.computeBoundingBox(); p.edgesV = new T.EdgesGeometry(p.geoV, 28); }
      v.root.add(new T.Mesh(p.geoV, m.mesh.material)); v.root.add(new T.LineSegments(p.edgesV, m.line.material)); }
    L.ext = { kind: 'photo', step: async () => { const R = await v.ensureOCC(); return R.makeCompound(PH.model.parts.map(p => p.shape.clone())).blobSTEP(); } };
    if (v.mode() === '2d') v.setMode('split');
    v.emptyEl.style.display = 'none';
    const bb = modelBox();
    v.stEl.innerHTML = `<span class="ok">사진 → 3D 모델</span> <span class="i">· 부품 ${PH.model.parts.length}개 · 크기 ${bb.size.map(x => Math.round(x)).join(' × ')} mm</span><br><span class="i">· 2D 도면으로 3D를 다시 만들려면 명령창에 3DRESET</span>`;
    v.setView('iso'); v.fit3(); v.draw3();
  }

  /* ---------------- 3) 투영 (사진 겹침 · 2D 도면) ---------------- */
  // 보기 이름 → 모델을 돌려서 replicad 'front'(X 오른쪽, Z 위, -Y 쪽에서 봄)로 맞춤
  const VIEWS = {
    right: [], left: [[180, [0, 0, 1]]], front: [[-90, [0, 0, 1]]], rear: [[90, [0, 0, 1]]],
    top: [[90, [1, 0, 0]]], bottom: [[-90, [1, 0, 0]]]
  };
  const VIEW_KO = { right: '오른쪽 옆(+X가 오른쪽)', left: '왼쪽 옆', front: '앞(+X 쪽에서 봄)', rear: '뒤', top: '위', bottom: '아래' };
  async function projection(view) {
    if (!PH.model) throw new Error('먼저 model3d 로 3D 모델을 만드세요');
    if (!VIEWS[view]) throw new Error('view 는 ' + Object.keys(VIEWS).join(' · '));
    if (PH.model.proj[view]) return PH.model.proj[view];
    const R = await V().ensureOCC();
    let s = R.makeCompound(PH.model.parts.map(p => p.shape.clone()));
    for (const [a, ax] of VIEWS[view]) s = s.rotate(a, [0, 0, 0], ax);
    const pr = R.drawProjection(s, 'front');
    const toPolys = d => { const o = []; for (const path of d.toSVGPaths()) for (const pl of svgPolys(path)) o.push(pl.map(([x, y]) => [x, -y])); return o; };
    const res = { vis: toPolys(pr.visible), hid: toPolys(pr.hidden) };
    try { s.delete(); } catch (_) { }
    PH.model.proj[view] = res; return res;
  }
  PH._projection = projection;
  // SVG 경로 → 꺾은선들 (M L H V C Q A Z)
  function svgPolys(d) {
    const t = String(d).match(/[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || []; let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0; const out = []; let cur = null;
    const num = () => +t[i++];
    const push = (x, y) => { if (!cur) { cur = [[cx, cy]]; out.push(cur); } cur.push([x, y]); cx = x; cy = y; };
    while (i < t.length) {
      if (/[A-Za-z]/.test(t[i])) cmd = t[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      if (C === 'M') { let x = num(), y = num(); if (rel) { x += cx; y += cy; } cx = sx = x; cy = sy = y; cur = null; cmd = rel ? 'l' : 'L'; }
      else if (C === 'L') { let x = num(), y = num(); if (rel) { x += cx; y += cy; } push(x, y); }
      else if (C === 'H') { let x = num(); if (rel) x += cx; push(x, cy); }
      else if (C === 'V') { let y = num(); if (rel) y += cy; push(cx, y); }
      else if (C === 'C') { let a = [num(), num(), num(), num(), num(), num()]; if (rel) a = a.map((v, k) => v + (k % 2 ? cy : cx)); const x0 = cx, y0 = cy; for (let k = 1; k <= 12; k++) { const s = k / 12, u = 1 - s; push(u * u * u * x0 + 3 * u * u * s * a[0] + 3 * u * s * s * a[2] + s * s * s * a[4], u * u * u * y0 + 3 * u * u * s * a[1] + 3 * u * s * s * a[3] + s * s * s * a[5]); } }
      else if (C === 'Q') { let a = [num(), num(), num(), num()]; if (rel) a = a.map((v, k) => v + (k % 2 ? cy : cx)); const x0 = cx, y0 = cy; for (let k = 1; k <= 10; k++) { const s = k / 10, u = 1 - s; push(u * u * x0 + 2 * u * s * a[0] + s * s * a[2], u * u * y0 + 2 * u * s * a[1] + s * s * a[3]); } }
      else if (C === 'A') {
        let rx = Math.abs(num()), ry = Math.abs(num()); const phi = num() * Math.PI / 180, fa = num(), fs = num(); let x = num(), y = num(); if (rel) { x += cx; y += cy; }
        const pts = arcPts(cx, cy, rx, ry, phi, fa, fs, x, y); for (const q of pts) push(q[0], q[1]);
      }
      else if (C === 'Z') { push(sx, sy); cur = null; }
      else { i++; }
    }
    return out.filter(p => p.length > 1);
  }
  function arcPts(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    if (!rx || !ry) return [[x2, y2]];
    const cp = Math.cos(phi), sp = Math.sin(phi), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    let lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const sg = fa === fs ? -1 : 1, num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = sg * Math.sqrt(Math.max(0, num / den)), cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const ccx = cp * cxp - sp * cyp + (x1 + x2) / 2, ccy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry); let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 24))), o = [];
    for (let k = 1; k <= n; k++) { const t = t1 + dt * k / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t); o.push([cp * ex - sp * ey + ccx, sp * ex + cp * ey + ccy]); }
    return o;
  }

  async function checkImage(c) {
    const p = photo(c.photo), view = c.view || 'right', pr = await projection(view);
    let map;
    if (Array.isArray(c.fit) && c.fit.length === 2) {   // [[사진x,사진y, 모델u,모델v], ...] 두 점으로 배율·회전·위치 맞춤
      const [[x1, y1, u1, v1], [x2, y2, u2, v2]] = c.fit.map(a => a.map(Number));
      const du = u2 - u1, dv = v2 - v1, dx = x2 - x1, dy = -(y2 - y1), d2 = du * du + dv * dv; if (!(d2 > 0)) throw new Error('fit 두 점의 모델 좌표가 같습니다');
      const a = (dx * du + dy * dv) / d2, b = (dy * du - dx * dv) / d2;   // 복소수 곱: (a+bi)(u+vi)
      map = ([u, v]) => [x1 + a * (u - u1) - b * (v - v1), y1 - (b * (u - u1) + a * (v - v1))];
      c._fit = { mm_per_px: +(1 / Math.hypot(a, b)).toFixed(4), rot_deg: +(Math.atan2(b, a) * 180 / Math.PI).toFixed(2), origin: map([0, 0]).map(Math.round) };
    } else {
      const s = c.scale || c; const mmpp = +s.mm_per_px || (+s.px_per_mm ? 1 / +s.px_per_mm : 0);
      if (!(mmpp > 0)) throw new Error('scale.mm_per_px (사진 1픽셀이 몇 mm인지) 가 필요합니다 (또는 fit 두 점). 예: 사진에서 500mm 가 580px 이면 0.862');
      const o = s.origin || c.origin; if (!Array.isArray(o)) throw new Error('scale.origin = 모델 원점(0,0,0)이 사진에서 놓이는 픽셀 [x, y]');
      const rot = (+(s.rot || c.rot || 0)) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
      map = ([u, v]) => [o[0] + (u * cr - v * sr) / mmpp, o[1] - (u * sr + v * cr) / mmpp];
    }
    const k = Math.min(1, 1400 / Math.max(p.w, p.h)), W = Math.round(p.w * k), H = Math.round(p.h * k);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.drawImage(p.img, 0, 0, W, H); g.fillStyle = 'rgba(255,255,255,.42)'; g.fillRect(0, 0, W, H);
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const stroke = (polys, col, w, dash) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); for (const pl of polys) { g.beginPath(); pl.forEach((q, j) => { const [x, y] = map(q); bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); j ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k); }); g.stroke(); } g.setLineDash([]); };
    if (c.hidden) stroke(pr.hid, 'rgba(40,110,220,.55)', 1.2, [5, 4]);
    stroke(pr.vis, 'rgba(225,20,110,.95)', 2);
    // 원점 표시
    const [ox, oy] = map([0, 0]); g.strokeStyle = '#00a046'; g.lineWidth = 2; g.beginPath(); g.moveTo(ox * k - 10, oy * k); g.lineTo(ox * k + 10, oy * k); g.moveTo(ox * k, oy * k - 10); g.lineTo(ox * k, oy * k + 10); g.stroke();
    g.font = 'bold 15px sans-serif'; g.fillStyle = 'rgba(255,255,255,.88)'; g.fillRect(6, 6, 470, 24); g.fillStyle = '#b0005a'; g.fillText(`3D 윤곽(${VIEW_KO[view]}) — 분홍선이 사진 윤곽과 겹쳐야 함 · 초록 + = 원점`, 12, 24);
    enqueue(cv, `사진 ${p.i} 위에 3D 모델 ${VIEW_KO[view]} 윤곽을 겹친 그림. 어긋난 곳의 부품 좌표를 고쳐 model3d 를 다시 실행하세요`);
    return { photo: p.i, view, model_on_photo_px: [bx0, by0, bx1, by1].map(Math.round), photo_px: [p.w, p.h], ...(c._fit ? { fit_result: c._fit } : {}), note: QN(PH.queue.length) };
  }

  /* ---------------- 4) 3D 보기 이미지 ---------------- */
  const CAMS = { iso: [1, -1, 0.75], front34: [1, -0.9, 0.55], rear34: [-1, -0.9, 0.55], right: [0, -1, 0], left: [0, 1, 0], front: [1, 0, 0], rear: [-1, 0, 0], top: [0, 0, 1], top34: [0.5, -0.6, 1.2] };
  function viewImage(c) {
    if (!PH.model) throw new Error('먼저 model3d 로 3D 모델을 만드세요');
    const v = V(), T = v.T; const W = Math.min(1600, c.w || 1200), H = Math.min(1200, c.h || 900);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const rr = new T.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); rr.setSize(W, H, false); rr.setClearColor(0xf3f5f7, 1);
    const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x8a8f96, 1.1));
    const l1 = new T.DirectionalLight(0xffffff, 1.5); sc.add(l1); const l2 = new T.DirectionalLight(0xffffff, 0.5); sc.add(l2);
    const ms = meshes(T); for (const m of ms) { sc.add(m.mesh); sc.add(m.line); }
    const bb = modelBox(), ctr = new T.Vector3(...bb.center), rad = len3(bb.size) / 2;
    let dir = CAMS[c.view || 'iso'] || CAMS.iso; dir = new T.Vector3(...dir).normalize();
    const cam = new T.PerspectiveCamera(28, W / H, rad / 50, rad * 50);
    cam.up.set(0, 0, 1); if (Math.abs(dir.z) > 0.99) cam.up.set(0, 1, 0);
    const dist = rad / Math.sin(14 * Math.PI / 180) * (c.zoom ? 1 / c.zoom : 0.9);
    cam.position.copy(ctr.clone().add(dir.clone().multiplyScalar(dist))); cam.lookAt(ctr);
    l1.position.copy(cam.position.clone().add(new T.Vector3(0, 0, rad * 2))); l2.position.copy(ctr.clone().sub(dir.clone().multiplyScalar(dist)));
    rr.render(sc, cam);
    const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d'); g.drawImage(cv, 0, 0);
    if (c.labels !== false) {
      const seen = new Set(); g.font = 'bold 13px sans-serif';
      for (const m of ms) { const p = m.p; if (seen.has(p.no)) continue; seen.add(p.no);
        const ctr2 = p.geo.boundingBox.getCenter(new T.Vector3()).project(cam); const x = (ctr2.x + 1) / 2 * W, y = (1 - ctr2.y) / 2 * H; if (ctr2.z > 1) continue;
        const t = p.no, w = g.measureText(t).width + 8; g.fillStyle = 'rgba(255,255,255,.9)'; g.strokeStyle = '#2f6fb3'; g.lineWidth = 1.2; g.fillRect(x - w / 2, y - 9, w, 18); g.strokeRect(x - w / 2, y - 9, w, 18); g.fillStyle = '#16324f'; g.fillText(t, x - w / 2 + 4, y + 5); }
    }
    g.font = 'bold 16px sans-serif'; g.fillStyle = '#16324f'; g.fillText(`3D 모델 · ${c.view || 'iso'} · 부품 ${PH.model.parts.length}개 · ${bb.size.map(Math.round).join('×')} mm`, 14, 26);
    for (const m of ms) { m.mesh.material.dispose(); m.line.material.dispose(); }
    rr.dispose(); try { rr.forceContextLoss(); } catch (_) { }
    enqueue(out, `3D 모델 미리보기 (${c.view || 'iso'})${c.labels !== false ? ' · 네모 = 부품 번호' : ''}`);
    return { view: c.view || 'iso', note: QN(PH.queue.length) };
  }

  /* ---------------- 5) 3D → 2D 도면 ---------------- */
  async function to2d(c) {
    const views = (Array.isArray(c.views) && c.views.length ? c.views : ['right', 'front', 'top']).slice(0, 4);
    const at = c.at || (() => { try { const s = cad.state(); return s.bbox ? [Math.ceil((s.bbox.maxX + 200) / 10) * 10, 0] : [0, 0]; } catch (_) { return [0, 0]; } })();
    const gap = c.gap || 150; const P = []; for (const v of views) P.push({ v, pr: await projection(v) });
    const bbox = pr => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const pl of pr.vis.concat(pr.hid)) for (const [x, y] of pl) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; };
    // 배치: 1번 = 기준, 2번 = 오른쪽, 3번 = 위, 4번 = 왼쪽
    const B = P.map(q => bbox(q.pr)), off = [];
    off[0] = [at[0] - B[0].x0, at[1] - B[0].y0];
    if (P[1]) off[1] = [at[0] + B[0].w + gap - B[1].x0, at[1] - B[1].y0];
    if (P[2]) off[2] = [at[0] - B[2].x0, at[1] + B[0].h + gap - B[2].y0];
    if (P[3]) off[3] = [at[0] - gap - B[3].w - B[3].x0, at[1] - B[3].y0];
    const cmds = [], rnd = x => Math.round(x * 100) / 100, big = Math.max(...B.map(b => Math.max(b.w, b.h))), TH = Math.max(2.5, Math.round(big / 45));
    if (c.dims !== false) cmds.push({ cmd: 'dimstyle', name: '사진3D', from: 'ISO-25', txt: TH, dec: 0, asz: Math.max(2.5, Math.round(TH * 0.8)), current: false });
    const simp = pl => { const o = [pl[0]]; for (let i = 1; i < pl.length - 1; i++) { const a = o[o.length - 1], b = pl[i], d = pl[i + 1]; const cr = Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])); const L = Math.hypot(d[0] - a[0], d[1] - a[1]) || 1; if (cr / L > 0.02) o.push(b); } o.push(pl[pl.length - 1]); return o; };
    P.forEach((q, j) => {
      const [dx, dy] = off[j];
      const put = (pl, layer) => { const s = simp(pl); if (s.length < 2) return; if (s.length === 2) cmds.push({ cmd: 'line', from: [rnd(s[0][0] + dx), rnd(s[0][1] + dy)], to: [rnd(s[1][0] + dx), rnd(s[1][1] + dy)], layer }); else cmds.push({ cmd: 'polyline', points: s.map(([x, y]) => [rnd(x + dx), rnd(y + dy)]), closed: false, layer }); };
      for (const pl of q.pr.vis) put(pl, '외형선');
      if (c.hidden !== false) for (const pl of q.pr.hid) put(pl, '숨은선');
      if (c.dims !== false) {
        const b = B[j], x0 = b.x0 + dx, y0 = b.y0 + dy, x1 = b.x1 + dx, y1 = b.y1 + dy, sp = Math.max(b.w, b.h) * 0.06 + 10;
        cmds.push({ cmd: 'dim_linear', p1: [rnd(x0), rnd(y0)], p2: [rnd(x1), rnd(y0)], at: [rnd((x0 + x1) / 2), rnd(y0 - sp)], dir: 'h', layer: '치수', style: '사진3D' });
        cmds.push({ cmd: 'dim_linear', p1: [rnd(x1), rnd(y0)], p2: [rnd(x1), rnd(y1)], at: [rnd(x1 + sp), rnd((y0 + y1) / 2)], dir: 'v', layer: '치수', style: '사진3D' });
      }
      if (c.title !== false) cmds.push({ cmd: 'text', at: [rnd((B[j].x0 + B[j].x1) / 2 + dx), rnd(B[j].y0 + dy - Math.max(B[j].w, B[j].h) * 0.06 - 10 - TH * 4)], text: ({ right: '우측면도', left: '좌측면도', front: '정면도', rear: '배면도', top: '평면도', bottom: '저면도' })[q.v] || q.v, h: Math.round(TH * 1.4), align: 'center', layer: '문자' });
    });
    // 부품 번호 풍선 + 부품표 (1번 보기 기준)
    let bomN = 0;
    if (c.bom !== false && PH.model.parts.length > 1) {
      const UV = { right: (x, y, z) => [x, z], left: (x, y, z) => [-x, z], front: (x, y, z) => [y, z], rear: (x, y, z) => [-y, z], top: (x, y, z) => [x, y], bottom: (x, y, z) => [x, -y] }[views[0]];
      const by = new Map();
      for (const p of PH.model.parts) { const b = p.shape.boundingBox.bounds, ctr = [0, 1, 2].map(i => (b[0][i] + b[1][i]) / 2); if (!by.has(p.no)) by.set(p.no, { no: p.no, name: p.name, n: 0, pts: [] }); const e = by.get(p.no); e.n++; e.pts.push(UV(...ctr)); }
      const list = [...by.values()].map(e => ({ ...e, a: e.pts[0] })).slice(0, 60); bomN = list.length;
      // 기준 보기 좌표로 바꿈 (UV 는 투영 전 좌표 → 투영 결과와 같은 축이므로 off[0] 만 더함)
      const [dx, dy] = off[0], b0 = B[0], R0 = TH * 1.5, gapB = R0 * 2.6;
      list.sort((p1, p2) => p1.a[0] - p2.a[0]);
      // 높은 부품 → 보기 왼쪽 세로줄(위에서 아래로), 낮은 부품 → 보기 아래 가로줄(왼쪽에서 오른쪽으로)
      const vMid = b0.y0 + b0.h * 0.3, hi = list.filter(e => e.a[1] > vMid).sort((p1, p2) => p2.a[1] - p1.a[1]), lo = list.filter(e => e.a[1] <= vMid).sort((p1, p2) => p1.a[0] - p2.a[0]);
      const place = [];
      const perCol = Math.max(1, Math.floor(b0.h / (R0 * 2.3))), nCol = Math.ceil(hi.length / perCol);
      hi.forEach((e, i) => { const col = Math.floor(i / perCol), inCol = Math.min(perCol, hi.length - col * perCol), k = i % perCol;
        const step = b0.h / Math.max(1, inCol); place.push({ e, bx: b0.x0 + dx - TH * 6 - col * R0 * 2.6, by: b0.y1 + dy - step * (k + 0.5) - (col % 2 ? step / 2 : 0) }); });
      const yBase = b0.y0 + dy - Math.max(b0.w, b0.h) * 0.06 - 10 - TH * 8, perRow = Math.max(1, Math.floor((b0.w + 4 * R0) / (R0 * 2.4)));
      lo.forEach((e, i) => { const row = Math.floor(i / perRow), nIn = Math.min(perRow, lo.length - row * perRow), col = i % perRow, st = (b0.w + 2 * R0) / Math.max(1, nIn);
        place.push({ e, bx: b0.x0 + dx - R0 + st * (col + 0.5) + (row % 2 ? st / 2 : 0), by: yBase - row * R0 * 2.6 }); });
      place.forEach(({ e, bx, by: by_ }) => {
        const ax = e.a[0] + dx, ay = e.a[1] + dy;
        const L = Math.hypot(ax - bx, ay - by_) || 1, ex = bx + (ax - bx) / L * R0, ey = by_ + (ay - by_) / L * R0;
        cmds.push({ cmd: 'line', from: [rnd(ex), rnd(ey)], to: [rnd(ax), rnd(ay)], layer: '치수' });
        cmds.push({ cmd: 'circle', center: [rnd(ax), rnd(ay)], r: rnd(TH * 0.25), layer: '치수' });
        cmds.push({ cmd: 'circle', center: [rnd(bx), rnd(by_)], r: rnd(R0), layer: '치수' });
        cmds.push({ cmd: 'text', at: [rnd(bx), rnd(by_ - TH * 0.5)], text: e.no, h: TH, align: 'center', layer: '문자' });
      });
      // 부품표: 모든 보기의 오른쪽
      const right = Math.max(...B.map((b, j) => b.x1 + off[j][0])) + gap + TH * 6, top = Math.max(...B.map((b, j) => b.y1 + off[j][1]));
      const rh = TH * 2, cw = [TH * 5, TH * 16, TH * 4], W = cw[0] + cw[1] + cw[2];
      const rowsT = [['번호', '부품명', '수량']].concat(list.slice().sort((p1, p2) => p1.no.localeCompare(p2.no, 'ko', { numeric: true })).map(e => [e.no, e.name, String(e.n)]));
      rowsT.forEach((r, i) => { const y = top - i * rh; cmds.push({ cmd: 'line', from: [rnd(right), rnd(y)], to: [rnd(right + W), rnd(y)], layer: i ? '문자' : '외형선' });
        let x = right; r.forEach((t, k) => { cmds.push({ cmd: 'text', at: [rnd(k === 1 ? x + TH * 0.6 : x + cw[k] / 2), rnd(y - rh * 0.72)], text: String(t).slice(0, 18), h: rnd(TH * 0.9), align: k === 1 ? 'left' : 'center', layer: '문자' }); x += cw[k]; }); });
      const yb = top - rowsT.length * rh; cmds.push({ cmd: 'line', from: [rnd(right), rnd(yb)], to: [rnd(right + W), rnd(yb)], layer: '외형선' });
      let x = right; for (const w of [0].concat(cw)) { x += w; cmds.push({ cmd: 'line', from: [rnd(x), rnd(top)], to: [rnd(x), rnd(yb)], layer: '외형선' }); }
      cmds.push({ cmd: 'text', at: [rnd(right), rnd(top + TH * 1.2)], text: '부품표', h: rnd(TH * 1.2), align: 'left', layer: '문자' });
    }
    const r = runBatch(cmds); try { zoomExtents(); } catch (_) { }
    return { views, entities: cmds.length, bom: bomN, errors: (r.errors || []).slice(0, 10), placed_at: at, sizes: B.map(b => [Math.round(b.w), Math.round(b.h)]) };
  }

  /* ---------------- 명령 묶음 (mucca_draw 로 들어옴) ---------------- */
  const CMD = {
    photo_list: async () => { if (PH.pending) await PH.pending; return { photos: PH.photos.map(p => ({ photo: p.i, name: p.name, size_px: [p.w, p.h] })), note: PH.photos.length ? '사진 픽셀 좌표는 photo_grid 격자 이미지로 읽으세요' : '첨부 사진이 없습니다. 사용자에게 📎 로 사진을 붙여 다시 요청해 달라고 하세요' }; },
    photo_grid: c => gridImage(c),
    model3d: c => runModel(c),
    model3d_check: c => checkImage(c),
    model3d_view: c => viewImage(c),
    model3d_to2d: c => to2d(c),
    model3d_clear: () => { reset3d(); return { cleared: true }; }
  };
  PH.cmds = async function (cmds) {
    if (PH.pending) await PH.pending;
    const out = [];
    for (const c of cmds) {
      const k = String(c && c.cmd || '');
      try { const f = CMD[k]; if (!f) throw new Error('사진·3D 명령은 ' + Object.keys(CMD).join(' · ') + ' 입니다 (다른 그리기 명령과 섞지 말고 따로 보내세요)'); out.push(Object.assign({ cmd: k, ok: true }, await f(c))); }
      catch (e) { out.push({ cmd: k, ok: false, error: (e && e.message) || String(e) }); }
    }
    return { ok: out.every(x => x.ok !== false), results: out };
  };
  PH.isCmd = c => /^(photo_|model3d)/.test(String(c && c.cmd || ''));
  function reset3d() { const L = lab(); if (L) { L.ext = null; try { L.rebuild(true); } catch (_) { } } }
  // 명령창: 3DRESET
  try { if (typeof ALIAS === 'object' && typeof TOOLS === 'object') { ALIAS['3DRESET'] = 'photo3dreset'; TOOLS.photo3dreset = () => { reset3d(); log('2D 도면 기준 3D로 돌아갔습니다', 'ok'); return null; }; } } catch (_) { }

  /* ---------------- 가이드 (mucca_guide 뒤에 붙음) ---------------- */
  PH.guide = `사진 → 3D (테스트 서버 전용) — 사진·손그림 + 치수 1개로 부품을 이해해서 3D 모델과 2D 도면을 만든다
명령은 mucca_draw 로 보내되 다른 그리기 명령과 섞지 않는다. 이미지 결과는 바로 다음 mucca_snapshot 호출로 받는다.

절차 (사용자에게는 단계마다 짧게 알린다)
 1. 첨부 사진 받기: 요청에 "참고 이미지 N장"이 있으면 mucca_snapshot 을 N번 불러 사진을 모두 본다 → {"cmd":"photo_list"} 로 번호·크기 확인
 2. 기준 치수 찾기: 요청문이나 사진에 적힌 치수(예: 발판 500)를 찾는다. 하나도 없으면 사용자에게 물어보고, 답이 없으면 흔한 크기로 가정하고 그 사실을 알린다
 3. 픽셀 좌표 읽기: 가장 반듯한 옆/정면 사진에 {"cmd":"photo_grid","photo":1} → 필요한 곳은 "crop":[x0,y0,x1,y1] 로 확대.
    격자 이미지는 확대·축소돼 있으니 위치는 반드시 격자 숫자(사진 픽셀)로 읽는다. 중요한 점은 먼저 "mark":[[x,y,"이름"],...] 로 찍어 맞는지 확인하고 쓴다.
    기준 치수 양 끝 픽셀로 mm_per_px = 실제mm ÷ 픽셀거리
 4. 부품 이해: 사진들(앞·뒤·옆·위)을 보고 보이는 부품을 빠짐없이 목록으로 만든다 — 그룹 기호+번호(예: K1 핸들바, W1 앞바퀴),
    모양(원통·판·회전체·띠…), 색, 위치·크기(픽셀→mm). 옆 사진에서 길이·높이, 앞/뒤/위 사진에서 폭을 비율로 잡는다.
    사진에 안 보이는 치수는 같은 사진 안 다른 부품과의 비율로 추정하고 추정임을 기록한다
 5. 좌표계: 단위 mm · X = 제품 앞쪽 · Y = 제품 왼쪽 · Z = 위 · 바닥 Z=0 · 원점은 기준이 되는 점(예: 뒷바퀴 축 아래 바닥).
    제품 앞쪽이 사진 오른쪽을 향한 옆 사진 = 제품의 오른쪽 면(카메라가 -Y 쪽) = view "right". 앞쪽이 사진 왼쪽을 향하면 view "left".
    앞에서 찍은 사진(view "front")은 사진 왼쪽이 제품 오른쪽(-Y), 뒤에서 찍은 사진(view "rear")은 사진 왼쪽이 제품 왼쪽(+Y).
    원근: 위에서 내려다본 사진은 윗면·아랫면 모서리가 갈라져 보인다 → 두 모서리의 가운데를 쓴다. 두 바퀴 접지점 높이가 다르면 평균을 바닥으로.
 6. 3D 코드: {"cmd":"model3d","code":"..."} — 부품마다 part("K1","핸들바","black", 형상). 코드는 JavaScript(replicad). 줄 배열로 줘도 된다: "code":["줄1","줄2"]
    변수 이름은 자유(아래 함수 이름과 같아도 코드 안에서 다시 선언하면 그 이름이 우선). 같은 번호로 part 를 여러 번 불러도 된다(같은 부품으로 묶임)
 7. 겹쳐 확인: {"cmd":"model3d_check","photo":1,"view":"right","scale":{"mm_per_px":0.862,"origin":[210,1825]},"hidden":false}
    또는 두 점 맞춤 {"cmd":"model3d_check","photo":2,"view":"front","fit":[[사진x1,사진y1,모델u1,모델v1],[사진x2,사진y2,모델u2,모델v2]]}
      (u,v = 그 보기의 가로·세로 mm: right → (x,z) · left → (-x,z) · front → (y,z) · rear → (-y,z) · top → (x,y). 원근이 강한 앞·뒤 사진에 좋음)
    → mucca_snapshot 으로 그림을 보고 분홍 윤곽이 사진과 어긋난 부품을 고쳐 model3d 를 다시 (최소 2번)
 8. 3D 확인: {"cmd":"model3d_view","view":"front34"} (iso·front34·rear34·right·front·top) → 부품 번호 표시된 그림
 9. 2D 도면: {"cmd":"model3d_to2d","views":["right","front","top"]} → 외형선·숨은선·전체 치수·제목 + 부품 번호 풍선·부품표(끄려면 "bom":false)
    (1번 보기 기준, 2번 오른쪽, 3번 위)
10. 보고: 부품 목록(번호·이름), 전체 치수, 추정한 값과 한계(원근·가려진 면). STEP 은 3D 창의 [STEP 저장]

3D 코드에서 쓰는 함수 (점은 [x,y,z], 각도는 도·반시계)
  box([x0,y0,z0],[x1,y1,z1])            두 모서리로 상자
  cyl(p0, p1, r)                        p0→p1 원통 (기울어진 스템·포크·핸들바)
  tube(p0, p1, rOut, rIn)               속이 빈 관
  sphere(c, r) · torus(c, R, r, "Y")
  tire(c, "Y", 바깥반지름, 폭, 두께, 모서리r)   바퀴 타이어 (축 방향 "X"|"Y"|"Z")
  revolve(c, "Y", [[r,a],...])          단면(반지름 r, 축방향 a) 닫힌 다각형을 축 둘레로 회전 (림·허브·노즐). r=0 (축 위 점) 써도 됨
  prism(plane, 윤곽, d0, d1)            2D 윤곽 돌출. plane "XZ"=옆모습(u=x,v=z, 깊이 y d0→d1) · "XY"=위(u=x,v=y, 깊이 z) · "YZ"=앞(u=y,v=z, 깊이 x)
     윤곽: [[u,v],...] 다각형 · {rrect:[u방향 길이, v방향 길이, 모서리r],at:[u,v],angle:도} · {circle:r,at} · {slot:[길이,폭],at,angle} · {smooth:[[u,v],...]} 매끈한 닫힌 곡선
  arcBand(plane, [cu,cv], rIn, rOut, a0, a1, d0, d1)   원호 띠 (흙받이·덮개). 각도는 u축에서 반시계
  pipe([[x,y,z],...], r)                점들을 지나는 매끈한 관 (케이블·호스)
  union(a,b,...) · cut(a, b, ...) · common(a,b) · group(a,b,...)
  move(s,[dx,dy,dz]) · turn(s, 도, "X"|"Y"|"Z"|[x,y,z], 중심) · mirrorY(s) = y→-y 대칭 복사(원본 유지) · mirrorX(s) · copy(s)
  soften(s, r)  모서리 둥글게 (실패하면 그대로)
  lerp(a,b,t) · polar([cu,cv], r, 도)
  px(x,y) → [x mm, z mm] · px3(x,y, y mm) → [x, y, z] : model3d 에 "scale":{"mm_per_px":..,"origin":[..]} 를 함께 주면 옆 사진 픽셀을 바로 mm 로
  색: body dark black rubber chrome silver metal yellow white red orange green blue grip screen lens wood glass 또는 "#rrggbb"
  주의: replicad 는 move·turn·union·cut 한 원본을 지운다 → 같은 형상을 두 번 쓰려면 copy(s). 부품은 겹쳐도 된다(합칠 필요 없음)

예시 (바퀴 2개 + 발판 + 기울어진 스템)
  const R0=115, FX=940;
  for (const [no,x] of [["W1",FX],["W2",0]]) { part(no, no==="W1"?"앞바퀴":"뒷바퀴", "rubber", tire([x,0,R0],"Y",R0,62,38,14));
    part(no, "림", "dark", revolve([x,0,R0],"Y",[[66,-23],[78,-23],[78,23],[66,23]])); }
  part("D1","발판","body", prism("XY",{rrect:[675,176,60],at:[432,0]},58,118));
  const top=[640,0,1185]; part("T1","스템","body", cyl([FX,0,R0+200], top, 30));
  part("K2","핸들바","black", cyl([top[0],-270,top[2]],[top[0],270,top[2]],13));`;
})();
