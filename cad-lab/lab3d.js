/* 무카 CAD 테스트 서버 — 2D | 3D 나란히 보기 (lab 전용)
   - 3D 엔진(three.js)은 페이지가 뜬 뒤 쉬는 시간에 미리 받고, 3D 버튼을 누르면 바로 씀
   - STEP 저장용 OpenCascade(약 7.2MB)는 STEP 버튼에 마우스를 올리거나 누를 때만 받음
   - 2D 도면이 바뀌면 3D가 따라 바뀜 (0.25초 뒤 다시 계산)
   이 파일은 cad-lab/index.html 본문 스크립트(전역 doc·changed·flatEnts…)를 그대로 씀 */
(function () {
  'use strict';
  const LAB = window.LAB3D = {};
  const OCC_CDN = 'https://cdn.jsdelivr.net/npm/replicad-opencascadejs@1.1.0/dist/';
  const OCC_BASE = window.__OCC_BASE || OCC_CDN;
  const IGN_LAYERS = new Set(['중심선', '숨은선', '치수', '문자']);
  const IGN_LT = new Set(['center', 'hidden', 'dashed', 'phantom', 'dashdot']);
  const D2R_ = Math.PI / 180;

  /* ---------------- 운영자 전용 게이트 ---------------- */
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const gateBox = document.createElement('div');
  gateBox.className = 'labgate';
  function showGate(msg, link) {
    gateBox.innerHTML = '';
    const b = document.createElement('div'); b.className = 'lgb';
    const h = document.createElement('h2'); h.textContent = '무카 CAD 테스트 서버';
    const p = document.createElement('p'); p.textContent = msg;
    b.append(h, p);
    if (link) { const a = document.createElement('a'); a.href = link[0]; a.textContent = link[1]; a.className = 'lgl'; b.append(a); }
    gateBox.append(b); if (!gateBox.isConnected) document.body.append(gateBox);
  }
  function session() {
    try {
      for (const k of Object.keys(localStorage)) {
        if (/^sb-.*-auth-token$/.test(k)) { const v = JSON.parse(localStorage.getItem(k)); const s = v && (v.currentSession || v); if (s && s.access_token && s.user) return s; }
      }
    } catch (_) { }
    return null;
  }
  async function checkAdmin() {
    if (isLocal) return true;
    const cfg = window.COWS_CONFIG || {};
    for (let i = 0; i < 600; i++) {
      const s = session();
      if (s) {
        try {
          const r = await fetch(cfg.supabaseUrl + '/rest/v1/rpc/is_official', {
            method: 'POST', headers: { 'content-type': 'application/json', apikey: cfg.supabaseKey, authorization: 'Bearer ' + s.access_token },
            body: JSON.stringify({ uid: s.user.id })
          });
          if (r.ok) { const ok = await r.json(); if (ok === true) { gateBox.remove(); return true; } showGate('운영자 계정 전용 테스트 페이지입니다.', ['/cad/', '무카 CAD로 가기']); return false; }
        } catch (_) { }
      } else if (i === 3) showGate('운영자(흑우) 계정으로 로그인하면 열립니다. 무카 CAD에서 먼저 로그인한 뒤 이 주소를 다시 열어 주세요.', ['/cad/', '무카 CAD에서 로그인']);
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;
  }

  /* ---------------- 스타일 ---------------- */
  const st = document.createElement('style');
  st.textContent = `
.labgate{position:fixed;inset:0;z-index:99;background:rgba(10,12,15,.96);display:grid;place-items:center}
.labgate .lgb{max-width:420px;padding:28px;border:1px solid var(--rule);background:var(--chrome);border-radius:10px}
.labgate h2{margin:0 0 10px;font-size:18px}.labgate p{color:var(--ink-dim);margin:0 0 16px}
.labgate .lgl{color:var(--sel)}
.labtag{background:#e0702a;color:#fff;border-radius:4px;padding:1px 7px;font:600 11px/18px var(--sans);margin-left:6px}
.work.l3split{grid-template-columns:minmax(0,1fr) minmax(0,1fr) var(--l3side,252px)!important}
.work.l3only{grid-template-columns:0 minmax(0,1fr) var(--l3side,252px)!important}
.work.l3only>.view{visibility:hidden}
.v3d{display:none;position:relative;min-width:0;min-height:0;background:#0d1014;border-left:1px solid var(--rule);flex-direction:column}
.work.l3split>.v3d,.work.l3only>.v3d{display:flex}
.v3h{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid var(--rule);background:var(--chrome);font-size:12px}
.v3h .seg{display:inline-flex;border:1px solid var(--rule);border-radius:6px;overflow:hidden}
.v3h .seg button{background:transparent;color:var(--ink-dim);border:0;padding:3px 9px;font:500 12px var(--sans);cursor:pointer}
.v3h .seg button[aria-pressed=true]{background:#e0702a;color:#fff}
.v3h select,.v3h input{background:var(--chrome-2);color:var(--ink);border:1px solid var(--rule);border-radius:5px;font:12px var(--sans);padding:2px 4px}
.v3h input{width:52px}
.v3h .sp{flex:1}
.v3h .btn{background:var(--chrome-2);color:var(--ink);border:1px solid var(--rule);border-radius:5px;padding:3px 9px;font:500 12px var(--sans);cursor:pointer}
.v3h .btn.go{background:#3a8a5c;border-color:#3a8a5c;color:#fff}
.v3c{position:relative;flex:1;min-height:0}
.v3c canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}.v3c canvas.dragging{cursor:grabbing}
.v3v{position:absolute;top:8px;right:8px;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.v3v button{background:rgba(32,37,45,.85);color:var(--ink);border:1px solid var(--rule);border-radius:5px;padding:3px 8px;font:500 12px var(--sans);cursor:pointer}
.v3v button:hover{border-color:#6f9fd0}.v3v button[aria-pressed=true]{background:#e0702a;border-color:#e0702a;color:#fff}
.v3hint{position:absolute;top:40px;right:10px;text-align:right;color:var(--ink-dim);font-size:11.5px;pointer-events:none;opacity:.8}
.v3s{position:absolute;left:8px;bottom:8px;right:8px;font-size:12px;line-height:1.5;pointer-events:none}
.v3s .i{color:var(--ink-dim)}.v3s .w{color:#f1c232}.v3s .e{color:var(--danger)}.v3s .ok{color:var(--ok)}
.v3e{position:absolute;inset:0;display:grid;place-items:center;color:var(--ink-dim);font-size:13px;text-align:center;padding:20px;pointer-events:none}
@media (max-width:900px){.work.l3split,.work.l3only{grid-template-columns:1fr!important;grid-template-rows:1fr 1fr}.work.l3only>.view{display:none}}
`;
  document.head.appendChild(st);

  /* ---------------- 화면 만들기 ---------------- */
  const work = document.querySelector('.work'), viewEl = document.getElementById('view');
  const pane = document.createElement('div'); pane.className = 'v3d'; pane.id = 'v3d';
  pane.innerHTML = `<div class="v3h">
    <span class="seg" role="group" aria-label="보기"><button data-m="2d">2D</button><button data-m="split">2D | 3D</button><button data-m="3d">3D</button></span>
    <label>형상 <select id="l3kind"><option value="auto">자동</option><option value="extrude">돌출(판재)</option><option value="revolve">회전체</option><option value="section">단면도(부품도)</option><option value="stack">단면 쌓기</option></select></label>
    <label>두께 <input id="l3t" type="number" min="0.1" step="any" value="10" title="측면도가 없을 때 쓰는 두께(mm)"></label>
    <label>시험 도면 <select id="l3case"><option value="">불러오기…</option></select></label>
    <span class="sp"></span>
    <button class="btn" id="l3stl" title="3D 모양을 STL 파일로 저장">STL</button>
    <button class="btn go" id="l3step" title="편집 가능한 3D 파일(STEP). 처음 한 번 엔진(약 7MB)을 받습니다">STEP 저장</button>
  </div><div class="v3c"><canvas id="l3cv"></canvas><div class="v3v" role="group" aria-label="시점"><button data-v="iso" title="등각">등각</button><button data-v="front" title="도면 정면 그대로">정면</button><button data-v="top" title="위에서">윗면</button><button data-v="right" title="오른쪽에서">측면</button><button data-v="fit" title="화면에 맞춤 (더블클릭)">맞춤</button><button data-v="spin" id="l3spin" aria-pressed="false" title="천천히 돌려 보기">돌려보기</button></div><div class="v3hint">드래그: 돌리기 · 오른쪽/가운데 드래그: 이동 · 휠: 확대 · 더블클릭: 맞춤</div><div class="v3e" id="l3empty">2D에 닫힌 윤곽(원·사각형·폴리선)을 그리면 3D가 생깁니다.<br>정면도 오른쪽(또는 위)에 측면도를 그리면 두께·회전체를 알아서 읽습니다.</div><div class="v3s" id="l3st"></div></div>`;
  viewEl.after(pane);
  const side = work.querySelector('.side');
  function sideW() { const w = side ? side.getBoundingClientRect().width : 252; return Math.round(w || 252) + 'px'; }

  const tb = document.getElementById('bAiFocus');
  const b3 = document.createElement('button'); b3.className = 'tbtn'; b3.id = 'b3d'; b3.textContent = '3D'; b3.title = '2D | 3D 나란히 보기 (명령: 3D)';
  if (tb) tb.before(b3);
  const brand = document.querySelector('.brand, .logo, #brand');
  const tag = document.createElement('span'); tag.className = 'labtag'; tag.textContent = 'TEST';
  (brand || b3).after(tag);

  let mode = '2d';
  try { mode = localStorage.getItem('muccalab.v3mode') || '2d'; } catch (_) { }
  function setMode(m) {
    mode = m; try { localStorage.setItem('muccalab.v3mode', m); } catch (_) { }
    work.style.setProperty('--l3side', sideW());
    work.classList.toggle('l3split', m === 'split'); work.classList.toggle('l3only', m === '3d');
    pane.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    b3.classList.toggle('primary', m !== '2d');
    if (m !== '2d') ensure3D().then(() => { resize3(); rebuild(true); });
  }
  pane.querySelectorAll('.seg button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  b3.onclick = () => setMode(mode === '2d' ? 'split' : '2d');
  LAB.toggle = () => setMode(mode === '2d' ? 'split' : '2d');
  LAB.setMode = setMode;
  const kindSel = pane.querySelector('#l3kind'), tIn = pane.querySelector('#l3t'), stEl = pane.querySelector('#l3st'), emptyEl = pane.querySelector('#l3empty');
  kindSel.onchange = () => rebuild(true); tIn.onchange = () => rebuild(true);
  const caseSel = pane.querySelector('#l3case');
  function fillCases() { const L = window.LABCASES || []; if (caseSel.options.length > 1 || !L.length) return; for (const c of L) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.lv + '. ' + c.title; caseSel.append(o); } }
  setTimeout(fillCases, 0); setTimeout(fillCases, 1500);
  caseSel.addEventListener('keydown', e => e.stopPropagation());
  LAB.loadCase = id => { const c = (window.LABCASES || []).find(x => x.id === id); if (!c) return false;
    runBatch([{ cmd: 'clear' }].concat(c.cmds)); try { zoomExtents(); } catch (_) { } log('시험 도면: ' + c.lv + '. ' + c.title + ' — 기대: ' + c.expect + ' (Ctrl+Z로 되돌리기)', 'ok'); return true; };
  caseSel.onchange = () => { const id = caseSel.value; caseSel.value = ''; if (!id) return;
    if (doc.entities.length && !confirm('지금 도면을 지우고 시험 도면을 불러올까요? (Ctrl+Z로 되돌릴 수 있습니다)')) return;
    LAB.loadCase(id); if (mode === '2d') setMode('split'); else rebuild(true); };
  const spinBtn = pane.querySelector('#l3spin');
  pane.querySelector('.v3v').onclick = e => { const b = e.target.closest('button'); if (!b || !T) return; const v = b.dataset.v;
    if (v === 'fit') { fit3(); draw3(); } else if (v === 'spin') { spin = !spin; b.setAttribute('aria-pressed', String(spin)); } else setView(v === 'front' ? 'front' : v); };
  tIn.addEventListener('keydown', e => e.stopPropagation()); kindSel.addEventListener('keydown', e => e.stopPropagation());

  /* ---------------- 3D 엔진 (three.js) 지연 로딩 ---------------- */
  let T = null, loading3 = null;
  function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('불러오기 실패: ' + src)); document.head.appendChild(s); }); }
  function ensure3D() {
    if (T) return Promise.resolve(T);
    if (!loading3) { const t0 = performance.now(); loading3 = loadScript('three-lab.js?v=2').then(() => { T = window.THREE_LAB; LAB.loadMs = Math.round(performance.now() - t0); init3(); return T; }); }
    return loading3;
  }
  // 페이지가 뜨고 2.5초 뒤 쉬는 시간에 미리 받아 둠 (3D 버튼을 처음 눌러도 바로 뜨게)
  setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 1)))(() => ensure3D().catch(() => { })), 2500);

  /* 3D 창 = 모델을 손으로 돌리는 영역
     왼쪽 드래그: 드래그한 방향으로 모델이 굴러감 · 오른쪽/가운데 드래그(또는 Shift): 이동
     휠: 확대·축소 · 더블클릭: 화면에 맞춤 · 두 손가락: 확대·이동 */
  let renderer, scene, cam, pivot, base, root, cv3, ro3, spin = false;
  const vw = { dist: 300, tx: 0, tz: 0 };
  function init3() {
    cv3 = pane.querySelector('#l3cv');
    renderer = new T.WebGLRenderer({ canvas: cv3, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x0d1014, 1);
    scene = new T.Scene();
    cam = new T.PerspectiveCamera(35, 1, 0.1, 1e6); cam.up.set(0, 0, 1);
    scene.add(new T.HemisphereLight(0xdfe8f5, 0x20262e, 0.9));
    const L1 = new T.DirectionalLight(0xffffff, 1.6); L1.position.set(0.8, -1.6, 1.4); scene.add(L1);
    const L2 = new T.DirectionalLight(0x9fb7d6, 0.5); L2.position.set(-1.5, 1, -1); scene.add(L2);
    // pivot(사용자 회전) → base(도면 XY를 정면으로 세움) → root(모델 중심을 원점으로)
    pivot = new T.Group(); base = new T.Group(); root = new T.Group();
    base.rotation.x = Math.PI / 2; pivot.add(base); base.add(root); scene.add(pivot);
    setView('iso', true);
    ro3 = new ResizeObserver(resize3); ro3.observe(pane.querySelector('.v3c'));
    const pts = new Map(); let drag = null, pinch = null;
    const rot = (ax, ay, az, a) => { const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(ax, ay, az), a); pivot.quaternion.premultiply(q); };
    cv3.addEventListener('pointerdown', e => {
      e.preventDefault(); cv3.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist: vw.dist, tx: vw.tx, tz: vw.tz }; drag = null; }
      else drag = { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.button === 2 || e.shiftKey };
      spin = false; spinBtn && spinBtn.setAttribute('aria-pressed', 'false'); cv3.classList.add('dragging');
    });
    cv3.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const k = vw.dist * 0.0012;
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        vw.dist = Math.max(1e-3, pinch.dist * pinch.d / Math.max(1, d)); vw.tx = pinch.tx - (mx - pinch.mx) * k; vw.tz = pinch.tz + (my - pinch.my) * k; draw3(); return;
      }
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) { vw.tx -= dx * k; vw.tz += dy * k; }
      else { rot(0, 0, 1, dx * 0.009); rot(1, 0, 0, dy * 0.009); }
      draw3();
    });
    const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { drag = null; cv3.classList.remove('dragging'); } };
    cv3.addEventListener('pointerup', end); cv3.addEventListener('pointercancel', end);
    cv3.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); vw.dist *= Math.exp(e.deltaY * 0.0012); draw3(); }, { passive: false });
    cv3.addEventListener('dblclick', () => { fit3(); draw3(); });
    cv3.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
    const loop = () => { if (spin && mode !== '2d') { rot(0, 0, 1, 0.012); draw3(); } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  }
  // 시점: 정면 = 도면 그대로, 등각 = 오른쪽 위에서 비스듬히
  function setView(v, keepFit) {
    const q = new T.Quaternion(), qa = (x, y, z, a) => new T.Quaternion().setFromAxisAngle(new T.Vector3(x, y, z), a);
    if (v === 'iso') q.premultiply(qa(0, 0, 1, -Math.PI / 4)).premultiply(qa(1, 0, 0, Math.atan(1 / Math.SQRT2)));
    else if (v === 'top') q.premultiply(qa(1, 0, 0, Math.PI / 2));
    else if (v === 'right') q.premultiply(qa(0, 0, 1, -Math.PI / 2));
    pivot.quaternion.copy(q); if (!keepFit) { vw.tx = 0; vw.tz = 0; } draw3();
  }
  LAB.setView = v => { if (pivot) setView(v); };
  function resize3() {
    if (!renderer) return; const c = pane.querySelector('.v3c').getBoundingClientRect();
    const w = Math.max(1, c.width), h = Math.max(1, c.height);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); draw3();
  }
  function draw3() {
    if (!renderer) return;
    cam.position.set(vw.tx, -vw.dist, vw.tz); cam.lookAt(vw.tx, 0, vw.tz); renderer.render(scene, cam);
  }
  // 모델 중심을 회전 중심으로 옮기고 화면에 맞춤
  function centerModel() {
    root.position.set(0, 0, 0); const bb = new T.Box3();
    root.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox); } });
    if (bb.isEmpty()) return null; const c = bb.getCenter(new T.Vector3()); root.position.set(-c.x, -c.y, -c.z); return bb;
  }
  function fit3() {
    const bb = centerModel(); if (!bb) return;
    const r = bb.getSize(new T.Vector3()).length() / 2; vw.tx = 0; vw.tz = 0;
    vw.dist = r / Math.sin(cam.fov * D2R_ / 2) * 1.08 / Math.min(1, cam.aspect || 1) ** 0.5;
  }

  /* ---------------- 2D → 닫힌 윤곽 ---------------- */
  function arcPts(c, r, a0, a1, n) { let A1 = a1; while (A1 <= a0) A1 += 360; const k = Math.max(4, Math.ceil(n * (A1 - a0) / 360)), o = []; for (let i = 0; i <= k; i++) { const t = (a0 + (A1 - a0) * i / k) * D2R_; o.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) }); } return o; }
  function area(p) { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a.x * b.y - b.x * a.y; } return s / 2; }
  function bboxOf(p) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of p) { if (q.x < x0) x0 = q.x; if (q.y < y0) y0 = q.y; if (q.x > x1) x1 = q.x; if (q.y > y1) y1 = q.y; } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; }
  function inPoly(pt, p) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
  function dedupe(p, tol) { const o = []; for (const q of p) { const l = o[o.length - 1]; if (!l || Math.hypot(l.x - q.x, l.y - q.y) > tol) o.push(q); } if (o.length > 2 && Math.hypot(o[0].x - o[o.length - 1].x, o[0].y - o[o.length - 1].y) <= tol) o.pop(); return o; }

  // 폴리선의 볼록(bulge) 구간은 호로 풀어서 점으로
  function plPts(e) {
    const P = e.pts, n = P.length, b = e.b || [], o = [{ x: P[0].x, y: P[0].y }];
    const segN = e.closed ? n : n - 1;
    for (let i = 0; i < segN; i++) {
      const p = P[i], q = P[(i + 1) % n], bu = +b[i] || 0;
      if (Math.abs(bu) > 1e-9) {
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), th = 4 * Math.atan(bu);
        const off = (d / 2) / Math.tan(th / 2), nx = -dy / d, ny = dx / d;
        const c = { x: (p.x + q.x) / 2 + nx * off, y: (p.y + q.y) / 2 + ny * off }, r = Math.hypot(p.x - c.x, p.y - c.y);
        const a0 = Math.atan2(p.y - c.y, p.x - c.x), k = Math.max(4, Math.ceil(Math.abs(th) / (2 * Math.PI) * 96));
        for (let j = 1; j <= k; j++) { const t = a0 + th * j / k; o.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) }); }
      } else o.push({ x: q.x, y: q.y });
    }
    return o;
  }

  // 평면 그래프 바깥 경계: 끝점 맞추기 → T자 교차 쪼개기 → 반쪽 모서리로 면 찾기 → 덩어리마다 가장 넓은 면 = 바깥 윤곽
  function planarOuter(polys, tol) {
    const segs = [];
    for (const p of polys) for (let i = 0; i < p.length - 1; i++) if (Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y) > tol * 0.01) segs.push([p[i], p[i + 1]]);
    const cell = tol * 2, grid = new Map(), nodes = []; let snap = 0;
    const nodeOf = q => {
      const gx = Math.floor(q.x / cell), gy = Math.floor(q.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const L = grid.get((gx + dx) + ',' + (gy + dy)); if (L) for (const n of L) { const d = Math.hypot(nodes[n].x - q.x, nodes[n].y - q.y); if (d <= tol) { if (d > snap) snap = d; return n; } } }
      const n = nodes.length; nodes.push({ x: q.x, y: q.y }); const k = gx + ',' + gy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); return n;
    };
    let E = []; for (const [a, b] of segs) { const u = nodeOf(a), v = nodeOf(b); if (u !== v) E.push([u, v]); }
    // 원래 선(선·호·곡선 하나)의 끝점 = 꼭짓점 표시 (3D에서 면 경계로 남김)
    for (const p of polys) if (p.length >= 2) { nodes[nodeOf(p[0])].key = true; nodes[nodeOf(p[p.length - 1])].key = true; }
    // T자 교차: 다른 선 중간에 닿는 끝점에서 그 선을 쪼갬
    if (E.length && nodes.length) {
      let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity; for (const q of nodes) { X0 = Math.min(X0, q.x); Y0 = Math.min(Y0, q.y); X1 = Math.max(X1, q.x); Y1 = Math.max(Y1, q.y); }
      const cs = Math.max(tol * 4, Math.hypot(X1 - X0, Y1 - Y0) / 150), sg = new Map();
      E.forEach(([u, v], i) => { const a = nodes[u], b = nodes[v]; for (let gx = Math.floor((Math.min(a.x, b.x) - tol) / cs); gx <= Math.floor((Math.max(a.x, b.x) + tol) / cs); gx++) for (let gy = Math.floor((Math.min(a.y, b.y) - tol) / cs); gy <= Math.floor((Math.max(a.y, b.y) + tol) / cs); gy++) { const k = gx + ',' + gy; if (!sg.has(k)) sg.set(k, []); sg.get(k).push(i); } });
      const cut = new Map();
      nodes.forEach((q, n) => { const L = sg.get(Math.floor(q.x / cs) + ',' + Math.floor(q.y / cs)); if (!L) return; for (const i of L) { const [u, v] = E[i]; if (u === n || v === n) continue; const a = nodes[u], b = nodes[v], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; if (!l2) continue; const t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2; if (t <= 1e-6 || t >= 1 - 1e-6) continue; if (Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y) <= tol) { if (!cut.has(i)) cut.set(i, []); cut.get(i).push([t, n]); } } });
      if (cut.size) { const E2 = []; E.forEach(([u, v], i) => { const c = cut.get(i); if (!c) { E2.push([u, v]); return; } c.sort((a, b) => a[0] - b[0]); let prev = u; for (const [, n] of c) { if (n !== prev) E2.push([prev, n]); prev = n; } if (prev !== v) E2.push([prev, v]); }); E = E2; }
    }
    // 중복 모서리 제거 + 이웃 목록(각도순)
    const seen = new Set(), adj = new Map();
    for (const [u, v] of E) { const k = u < v ? u + '_' + v : v + '_' + u; if (seen.has(k)) continue; seen.add(k); for (const [a, b] of [[u, v], [v, u]]) { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); } }
    for (const [a, L] of adj) L.sort((p, q) => Math.atan2(nodes[p].y - nodes[a].y, nodes[p].x - nodes[a].x) - Math.atan2(nodes[q].y - nodes[a].y, nodes[q].x - nodes[a].x));
    // 덩어리(연결 요소)
    const comp = new Map(); let nc = 0;
    for (const s0 of adj.keys()) { if (comp.has(s0)) continue; const st = [s0]; comp.set(s0, nc); while (st.length) { const a = st.pop(); for (const b of adj.get(a)) if (!comp.has(b)) { comp.set(b, nc); st.push(b); } } nc++; }
    // 면 따라 돌기: (u→v) 다음은 v에서 (v→u) 바로 시계 방향 이웃
    const used = new Set(), best = new Map();
    for (const [u0, L0] of adj) for (const v0 of L0) {
      if (used.has(u0 + '>' + v0)) continue;
      let u = u0, v = v0; const face = []; let guard = 0;
      while (!used.has(u + '>' + v) && guard++ < 200000) { used.add(u + '>' + v); face.push(u); const L = adj.get(v), i = L.indexOf(u), w = L[(i - 1 + L.length) % L.length]; u = v; v = w; }
      const pts = face.map(n => nodes[n]); const A = Math.abs(area(pts)), c = comp.get(u0);
      if (!best.has(c) || A > best.get(c).A) best.set(c, { A, pts });
    }
    const out = [], leftSegs = []; let leftN = 0;
    for (let c = 0; c < nc; c++) {
      const b = best.get(c);
      if (b && b.A > tol * tol * 4) {
        // 왕복 가시(매달린 선) 제거
        let p = b.pts.slice(), ch = true; while (ch && p.length > 3) { ch = false; for (let i = 0; i < p.length; i++) { const a = p[(i - 1 + p.length) % p.length], q = p[(i + 1) % p.length]; if (a === q) { p.splice(i, 1); p.splice(i % p.length, 1); ch = true; break; } } }
        out.push({ pts: dedupe(p, tol / 10) });
      } else { leftN++; }
    }
    if (leftN) for (const [u, v] of E) { const c = comp.get(u); const b = best.get(c); if (!(b && b.A > tol * tol * 4)) leftSegs.push([nodes[u], nodes[v]]); }
    return { loops: out.filter(l => l.pts.length >= 3), left: leftSegs, leftN, snap };
  }

  // 3D로 바꿀 도형: CAD에서 선택한 것이 있으면 그것만 (부품도에서 부품 하나 고르기)
  function srcEnts() {
    try { if (typeof sel !== 'undefined' && sel.size) { const L = doc.entities.filter(e => sel.has(e.id)); if (L.length) return flatEnts(L); } } catch (_) { }
    try { return flatEnts(visibleEnts()); } catch (_) { return doc.entities.slice(); }
  }
  LAB.srcEnts = srcEnts;
  LAB._dbg = () => ({ rowHull, collectLoops, solid: pl => solidFor(occR, pl), ensureOCC });
  LAB._loops = () => { const r = collectLoops(); return r.loops.filter(L => !L.parent).map(L => ({ bb: [L.bb.x0, L.bb.y0, L.bb.x1, L.bb.y1].map(v => +v.toFixed(1)), n: L.pts.length, c: !!L.circle, kids: L.kids.length })); };

  // 뷰 실루엣 보강: 같은 뷰의 조각(외형선·해치 경계)을 모아 높이마다 가장 넓은 범위로 채움 (부분 단면·구멍으로 끊긴 윤곽용)
  function rowHull(L, tol) {
    const segs = [];
    for (const e of srcEnts()) {
      if (IGN_LAYERS.has(e.layer) && e.layer !== '해치') continue;
      if (e.type === 'line') segs.push([e.a, e.b]);
      else if (e.type === 'polyline') { const P = plPts(e); for (let i = 0; i < P.length - 1; i++) segs.push([P[i], P[i + 1]]); }
      else if (e.type === 'arc') { const P = arcPts(e.c, e.r, e.a0, e.a1, 48); for (let i = 0; i < P.length - 1; i++) segs.push([P[i], P[i + 1]]); }
      else if (e.type === 'hatch' && Array.isArray(e.loops)) for (const lp of e.loops) for (let i = 0; i < lp.length; i++) segs.push([lp[i], lp[(i + 1) % lp.length]]);
    }
    // 반쪽 뷰: 중심선(대칭축)도 윤곽의 한쪽 변 (중심선 레이어라 위에서 빠짐)
    if (L.half) { const A = L.half, us = [[L.bb.x0, L.bb.y0], [L.bb.x1, L.bb.y0], [L.bb.x0, L.bb.y1], [L.bb.x1, L.bb.y1]].map(([x, y]) => (x - A.a.x) * A.d.x + (y - A.a.y) * A.d.y), u0 = Math.min(...us) - tol, u1 = Math.max(...us) + tol;
      segs.push([{ x: A.a.x + A.d.x * u0, y: A.a.y + A.d.y * u0 }, { x: A.a.x + A.d.x * u1, y: A.a.y + A.d.y * u1 }]); }
    let bb = { ...L.bb }; const g = L.bb.h * 0.12; const inY = sg => Math.max(sg[0].y, sg[1].y) >= bb.y0 - tol && Math.min(sg[0].y, sg[1].y) <= bb.y1 + tol;
    const use = new Set(); let grew = true;
    while (grew) { grew = false; segs.forEach((sg, i) => { if (use.has(i) || !inY(sg)) return; const x0 = Math.min(sg[0].x, sg[1].x), x1 = Math.max(sg[0].x, sg[1].x); if (x1 < bb.x0 - g || x0 > bb.x1 + g) return; use.add(i); if (x0 < bb.x0 || x1 > bb.x1) { bb.x0 = Math.min(bb.x0, x0); bb.x1 = Math.max(bb.x1, x1); grew = true; } }); }
    const S2 = [...use].map(i => segs[i]), N = 120, left = [], right = [];
    for (let k = 0; k <= N; k++) {
      const y = L.bb.y0 + (L.bb.y1 - L.bb.y0) * (k === 0 ? 0.0005 : k === N ? 0.9995 : k / N); let lo = Infinity, hi = -Infinity;
      for (const [a, b] of S2) { if ((a.y - y) * (b.y - y) > 0) continue; if (a.y === b.y) { lo = Math.min(lo, a.x, b.x); hi = Math.max(hi, a.x, b.x); continue; } const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y); lo = Math.min(lo, x); hi = Math.max(hi, x); }
      if (lo < hi) { left.push({ x: lo, y }); right.push({ x: hi, y }); }
    }
    let pts = dedupe(left.concat(right.reverse()), tol / 4);
    // 일직선 위 점은 합침 (점이 많으면 정밀 엔진이 느려짐)
    for (let pass = 0; pass < 3; pass++) { const q = []; for (let i = 0, n = pts.length; i < n; i++) { const A = q.length ? q[q.length - 1] : pts[(i - 1 + n) % n], B = pts[i], C = pts[(i + 1) % n]; const L = Math.hypot(C.x - A.x, C.y - A.y) || 1; if (Math.abs((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)) / L > tol * 0.3) q.push(B); } pts = q; }
    const a = Math.abs(area(pts));
    return a > L.a * 1.02 ? { pts, bb: bboxOf(pts), a, half: L.half, kids: L.kids } : L;
  }
  function collectLoops(hiddenOnly) {
    let ents = [];
    ents = srcEnts();
    const isHid = e => e.layer === '숨은선' || /hidden|dashed/i.test(String(e.lt || ''));
    ents = ents.filter(e => ['line', 'polyline', 'circle', 'arc', 'ellipse'].includes(e.type) && (hiddenOnly ? isHid(e) : (!IGN_LAYERS.has(e.layer) && !(e.lt && IGN_LT.has(String(e.lt).toLowerCase())))));
    if (!ents.length) return { loops: [], tol: 0.01 };
    // 허용 오차: 도면 크기의 0.05%
    let all = [];
    for (const e of ents) {
      if (e.type === 'line') all.push(e.a, e.b); else if (e.type === 'polyline') all.push(...e.pts); else if (e.c) all.push({ x: e.c.x - (e.r || e.rx || 0), y: e.c.y - (e.r || e.rx || 0) }, { x: e.c.x + (e.r || e.rx || 0), y: e.c.y + (e.r || e.rx || 0) });
    }
    const bb = bboxOf(all), tol = Math.max(1e-4, Math.hypot(bb.w, bb.h) * 5e-4);
    const loops = [], open = [];
    for (const e of ents) {
      if (e.type === 'circle') loops.push({ circle: { c: { x: e.c.x, y: e.c.y }, r: Math.abs(e.r) }, pts: arcPts(e.c, Math.abs(e.r), 0, 360, 96).slice(0, -1) });
      else if (e.type === 'ellipse' && e.a0 == null) { const s = []; for (let i = 0; i < 96; i++) s.push(ellPt(e, i * 360 / 96)); loops.push({ pts: s }); }
      else if (e.type === 'polyline') { const p = plPts(e); const cl = e.closed || (p.length > 2 && Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) <= tol); open.push(cl ? p.concat([p[0]]) : p); }   /* 닫힌 폴리선도 선들과 한 그래프로 → 단면도 윤곽이 하나로 이어짐 */
      else if (e.type === 'line') open.push([{ x: e.a.x, y: e.a.y }, { x: e.b.x, y: e.b.y }]);
      else if (e.type === 'arc') open.push(arcPts(e.c, e.r, e.a0, e.a1, 96));
      else if (e.type === 'ellipse') { let a1 = e.a1; while (a1 <= e.a0) a1 += 360; const s = []; for (let i = 0; i <= 48; i++) s.push(ellPt(e, e.a0 + (a1 - e.a0) * i / 48)); open.push(s); }
    }
    // 열린 선·호 이어 붙이기 (1차: 정밀 / 2차: 손그림처럼 벌어진 끝 메우기)
    function chainAll(list, tl) {
      const used = new Array(list.length).fill(false), near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= tl, out = [], left = []; let gap = 0;
      const g = (a, b) => { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d > gap) gap = d; };
      for (let i = 0; i < list.length; i++) {
        if (used[i]) continue; used[i] = true; let chain = list[i].slice(), grew = true; const parts = [i];
        while (grew && !(chain.length > 3 && near(chain[0], chain[chain.length - 1]))) {
          grew = false;
          for (let j = 0; j < list.length; j++) {
            if (used[j]) continue; const sg = list[j], end = chain[chain.length - 1], beg = chain[0];
            if (near(end, sg[0])) { g(end, sg[0]); chain = chain.concat(sg.slice(1)); }
            else if (near(end, sg[sg.length - 1])) { g(end, sg[sg.length - 1]); chain = chain.concat(sg.slice(0, -1).reverse()); }
            else if (near(beg, sg[sg.length - 1])) { g(beg, sg[sg.length - 1]); chain = sg.slice(0, -1).concat(chain); }
            else if (near(beg, sg[0])) { g(beg, sg[0]); chain = sg.slice(1).reverse().concat(chain); }
            else continue;
            used[j] = true; parts.push(j); grew = true; break;
          }
        }
        if (chain.length > 3 && near(chain[0], chain[chain.length - 1])) { g(chain[0], chain[chain.length - 1]); out.push({ pts: dedupe(chain, tl / 10) }); }
        else for (const k of parts) left.push(list[k]);
      }
      return { out, left, gap };
    }
    // 대칭 도시(반쪽만 그린 뷰): 열린 윤곽 끝이 중심선 위에 2개 이상 있으면 그 사이를 중심선으로 닫음
    const halfAx = [];
    if (!hiddenOnly) {
      let cls = []; try { cls = srcEnts().filter(e => e.type === 'line' && (e.layer === '중심선' || /center/i.test(String(e.lt || '')))); } catch (_) { }
      const ends = []; for (const pc of open) { const a = pc[0], b = pc[pc.length - 1]; if (Math.hypot(a.x - b.x, a.y - b.y) > tol) ends.push(a, b); }
      for (const e of cls) {
        const L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y); if (L < tol * 10) continue; const d = { x: (e.b.x - e.a.x) / L, y: (e.b.y - e.a.y) / L };
        const on = ends.map(q => ({ q, u: (q.x - e.a.x) * d.x + (q.y - e.a.y) * d.y, s: (q.x - e.a.x) * -d.y + (q.y - e.a.y) * d.x })).filter(v => Math.abs(v.s) <= tol * 3 && v.u >= -tol && v.u <= L + tol).sort((a, b) => a.u - b.u);
        const uniq = []; for (const v of on) if (!uniq.length || v.u - uniq[uniq.length - 1].u > tol) uniq.push(v);
        if (uniq.length < 2) continue;
        for (let i = 0; i < uniq.length - 1; i++) open.push([{ x: e.a.x + d.x * uniq[i].u, y: e.a.y + d.y * uniq[i].u }, { x: e.a.x + d.x * uniq[i + 1].u, y: e.a.y + d.y * uniq[i + 1].u }]);
        halfAx.push({ a: e.a, d });
      }
    }
    // 선 전체를 평면 그래프로 보고 덩어리마다 가장 바깥 경계를 따라 돎 (T자·Y자 교차가 많은 실제 투상도용)
    const g1 = planarOuter(open, tol); loops.push(...g1.loops);
    let gapFixed = 0, openLeft = 0;
    if (g1.left.length) { const g2 = planarOuter(g1.left, Math.max(tol * 10, Math.hypot(bb.w, bb.h) * 0.006)); loops.push(...g2.loops); if (g2.loops.length) gapFixed = g2.snap; openLeft = g2.leftN; }
    // 한 직선 위에 있는 꼭짓점 빼기 (다른 선과 교차해서 생긴 점 → 3D에서 면이 쪼개져 2D로 다시 뽑으면 없는 선이 생김)
    const colTol = Math.max(1e-9, Math.hypot(bb.w, bb.h) * 1e-7);
    for (const L of loops) if (!L.circle && L.pts.length > 3) { let P = L.pts; for (let pass = 0; pass < 2; pass++) { const q = []; for (let i = 0, n = P.length; i < n; i++) { const A = q.length ? q[q.length - 1] : P[(i - 1 + n) % n], B = P[i], C = P[(i + 1) % n], len = Math.hypot(C.x - A.x, C.y - A.y) || 1; const dev = Math.abs((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)) / len; const dot = (B.x - A.x) * (C.x - B.x) + (B.y - A.y) * (C.y - B.y); if (dev > colTol || dot < 0) q.push(B); } P = q; } if (P.length >= 3) L.pts = P; }
    for (const L of loops) { L.a = Math.abs(area(L.pts)); L.bb = bboxOf(L.pts); }
    // 호 여러 개로 그려진 원(한 바퀴): 모든 점이 중심에서 같은 거리면 원으로 봄 → 회전체 판단에 씀
    for (const L of loops) if (!L.circle && L.pts.length >= 12) { const c = { x: (L.bb.x0 + L.bb.x1) / 2, y: (L.bb.y0 + L.bb.y1) / 2 }, rs = L.pts.map(q => Math.hypot(q.x - c.x, q.y - c.y)), r = (Math.max(...rs) + Math.min(...rs)) / 2; if (r > tol * 4 && Math.max(...rs) - Math.min(...rs) <= Math.max(tol * 2, r * 0.004) && Math.abs(L.bb.w - L.bb.h) <= tol * 4) L.circle = { c, r }; }
    for (const L of loops) {
      if (L.circle) continue; let bestA = null, bestSpan = 0;
      for (const A of halfAx) { const us = L.pts.filter(q => Math.abs((q.x - A.a.x) * -A.d.y + (q.y - A.a.y) * A.d.x) <= tol * 2).map(q => (q.x - A.a.x) * A.d.x + (q.y - A.a.y) * A.d.y); if (us.length < 2) continue; const span = Math.max(...us) - Math.min(...us), ext = Math.abs(A.d.x) > 0.5 ? L.bb.w : L.bb.h; if (span > ext * 0.3 && span > bestSpan) { bestSpan = span; bestA = A; } }
      // 축이 윤곽의 한쪽 끝에 있어야 반쪽 뷰 (가운데를 지나면 온전한 뷰)
      if (bestA) { const ss = L.pts.map(q => (q.x - bestA.a.x) * -bestA.d.y + (q.y - bestA.a.y) * bestA.d.x); if (Math.min(...ss) > -tol * 3 || Math.max(...ss) < tol * 3) L.half = bestA; }
    }
    // 같은 자리에 겹친 윤곽(원 + 같은 원을 호로 또 그린 것 등)은 하나만
    const uniqL = []; for (const L of loops) { if (uniqL.some(U => Math.abs(U.bb.x0 - L.bb.x0) <= tol && Math.abs(U.bb.y0 - L.bb.y0) <= tol && Math.abs(U.bb.x1 - L.bb.x1) <= tol && Math.abs(U.bb.y1 - L.bb.y1) <= tol && Math.abs(U.a - L.a) <= Math.max(U.a, L.a) * 0.01)) continue; uniqL.push(L); }
    loops.length = 0; loops.push(...uniqL);
    // 포함 관계 (가장 작은 바깥 윤곽이 부모)
    const ok = loops.filter(L => L.pts.length >= 3 && L.a > tol * tol);
    ok.sort((a, b) => b.a - a.a);
    for (let i = 0; i < ok.length; i++) {
      const L = ok[i]; L.kids = []; L.parent = null;
      for (let j = i - 1; j >= 0; j--) { const P = ok[j]; if (P.bb.x0 - tol <= L.bb.x0 && P.bb.x1 + tol >= L.bb.x1 && P.bb.y0 - tol <= L.bb.y0 && P.bb.y1 + tol >= L.bb.y1 && inPoly(L.pts[0], P.pts) && P.a > L.a * 1.0001) { L.parent = P; break; } }
    }
    for (const L of ok) if (L.parent) L.parent.kids.push(L);
    // 문자 위치 (도곽·표제란 판단용)
    let texts = []; try { texts = srcEnts().filter(e => e.type === 'text' && e.p).map(e => e.p); } catch (_) { }
    return { loops: ok, tol, gapFixed, openLeft, texts };
  }


  // 모따기 찾기 (육각·사각 너트, 볼트 머리): 정면도 바깥 윤곽 안쪽에 같은 중심의 원·호(모서리보다 작은 반지름)가 있고,
  //  측면도 끝면 가까이에 선 끝점이 모여 있으면(모따기 깊이) → 원뿔로 모서리를 깎음
  function findChamfer(front, side, t, tol, seg) {
    if (front.circle) return null;
    const c = { x: (front.bb.x0 + front.bb.x1) / 2, y: (front.bb.y0 + front.bb.y1) / 2 };
    const Rc = Math.max(...front.pts.map(q => Math.hypot(q.x - c.x, q.y - c.y))), Rin = Math.min(...front.pts.map(q => Math.hypot(q.x - c.x, q.y - c.y)));
    const ents = srcEnts();
    const arcs = ents.filter(e => (e.type === 'arc' || e.type === 'circle') && !IGN_LAYERS.has(e.layer) && e.c && Math.hypot(e.c.x - c.x, e.c.y - c.y) <= tol * 4 && e.r >= Rin * 0.85 && e.r < Rc - tol * 2);
    if (!arcs.length) return null;
    const rc = Math.min(...arcs.map(e => e.r));
    const sx0 = seg ? side.bb.x0 + seg[0] : side.bb.x0, sx1 = seg ? side.bb.x0 + seg[1] : side.bb.x1, lim = Math.min((sx1 - sx0) * 0.35, Rc);
    let dL = null, dR = null;
    for (const e of ents) {
      if (e.layer === '중심선' || e.layer === '치수' || e.layer === '문자') continue;
      const P = e.type === 'line' ? [e.a, e.b] : e.type === 'polyline' ? [e.pts[0], e.pts[e.pts.length - 1]] : null; if (!P) continue;
      for (const q of P) { if (q.y < side.bb.y0 - tol || q.y > side.bb.y1 + tol || q.x < sx0 - tol || q.x > sx1 + tol) continue;
        const a = q.x - sx0, b = sx1 - q.x; if (a > tol * 2 && a < lim) dL = dL == null ? a : Math.min(dL, a); if (b > tol * 2 && b < lim) dR = dR == null ? b : Math.min(dR, b); }
    }
    if (dL == null && dR == null) return null;
    return { c, rc, Rc, dL, dR, z0: seg ? seg[0] : 0, z1: seg ? seg[1] : t };
  }
  /* ---------------- 단면도(해치) → 회전체: 실기 부품도처럼 한 장에 여러 부품 ---------------- */
  function sectionPlan() {
    let ents = srcEnts();
    const hatches = ents.filter(e => e.type === 'hatch' && Array.isArray(e.loops) && e.loops.length);
    const axes = ents.filter(e => e.type === 'line' && (e.layer === '중심선' || /center/i.test(String(e.lt || ''))) && Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) > 1e-6);
    if (!axes.length) return null;
    let all = []; for (const e of ents) { if (e.type === 'line') all.push(e.a, e.b); else if (e.type === 'polyline') all.push(...e.pts); }
    for (const h of hatches) for (const lp of h.loops) all.push(...lp);
    if (!all.length) return null;
    const BB = bboxOf(all), diag = Math.hypot(BB.w, BB.h), tolA = Math.max(0.05, diag * 0.002);
    const AX = axes.map(e => { const d = unit(sub(e.b, e.a)); return { a: e.a, d, n: perp(d), len: Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) }; });
    const loc = (A, q) => ({ u: (q.x - A.a.x) * A.d.x + (q.y - A.a.y) * A.d.y, s: (q.x - A.a.x) * A.n.x + (q.y - A.a.y) * A.n.y });
    // 해치 영역 (섬 모양 안쪽 고리는 빼고 바깥 고리만)
    const regs = [];
    for (const h of hatches) {
      const L = h.loops.map(lp => lp.map(q => ({ x: q.x, y: q.y }))).filter(lp => lp.length >= 3).map(pts => ({ pts, a: Math.abs(area(pts)), bb: bboxOf(pts) }));
      for (const r of L) if (!L.some(o => o !== r && o.a > r.a && inPoly(r.pts[0], o.pts))) regs.push(r);
    }
    // 각 영역: 한쪽에만 있고 반대편에 대칭 짝이 있는 중심선을 축으로
    //  (키홈 때문에 안쪽은 달라도 됨: 바깥 지름·길이·넓이로 짝을 봄)
    function assign(AXs) {
      for (const r of regs) {
        if (r.ax) continue; let best = null;
        for (const A of AXs) {
          const L = r.pts.map(q => loc(A, q)), smin = Math.min(...L.map(v => v.s)), smax = Math.max(...L.map(v => v.s));
          if (smin < -tolA && smax > tolA) continue;
          const u0 = Math.min(...L.map(v => v.u)), u1 = Math.max(...L.map(v => v.u)), ov = Math.max(0, Math.min(u1, A.len) - Math.max(u0, 0));
          if (ov < (u1 - u0) * 0.3) continue;
          const outer = Math.max(Math.abs(smin), Math.abs(smax)), near = Math.min(Math.abs(smin), Math.abs(smax)), t = Math.max(tolA * 4, (u1 - u0) * 0.03, outer * 0.02);
          const mate = regs.find(o => o !== r && Math.abs(o.a - r.a) <= Math.max(r.a, o.a) * 0.25 && (() => { const M = o.pts.map(q => loc(A, q)); const m0 = Math.min(...M.map(v => v.u)), m1 = Math.max(...M.map(v => v.u));
            const ms0 = Math.min(...M.map(v => v.s)), ms1 = Math.max(...M.map(v => v.s)); if (Math.sign(ms0 + ms1) === Math.sign(smin + smax)) return false;
            return Math.abs(m0 - u0) < t && Math.abs(m1 - u1) < t && Math.abs(Math.max(Math.abs(ms0), Math.abs(ms1)) - outer) < t; })());
          if (!mate) continue;
          if (!best || near < best.near) best = { A, near, mate };
        }
        if (best) { r.ax = best; if (!best.mate.ax) best.mate.ax = { A: best.A, near: best.near, mate: r }; }
      }
    }
    assign(AX);
    // 중심선이 안 그려진 경우: 대칭인 단면 짝에서 축을 찾아냄
    const SYN = [];
    for (const r of regs) {
      if (r.ax) continue;
      for (const o of regs) {
        if (o === r || o.ax || Math.abs(o.a - r.a) > Math.max(r.a, o.a) * 0.25) continue;
        const t = Math.max(tolA * 4, Math.max(r.bb.w, r.bb.h) * 0.03);
        if (Math.abs(r.bb.x0 - o.bb.x0) < t && Math.abs(r.bb.x1 - o.bb.x1) < t && (r.bb.y0 > o.bb.y1 - t || o.bb.y0 > r.bb.y1 - t)) {
          const c = (Math.max(r.bb.y1, o.bb.y1) + Math.min(r.bb.y0, o.bb.y0)) / 2;
          const span = Math.max(r.bb.y1, o.bb.y1) - Math.min(r.bb.y0, o.bb.y0); const X0 = Math.min(r.bb.x0, o.bb.x0), X1 = Math.max(r.bb.x1, o.bb.x1); if (AX.some(A => Math.abs(A.d.y) < 0.02 && Math.abs(A.a.y - c) < span * 0.1 && overlap(Math.min(A.a.x, A.a.x + A.d.x * A.len), Math.max(A.a.x, A.a.x + A.d.x * A.len), X0, X1) > 0)) continue;
          if (!SYN.some(A => Math.abs(A.d.y) < 1e-9 && Math.abs(A.a.y - c) < t)) SYN.push({ a: { x: Math.min(r.bb.x0, o.bb.x0) - t, y: c }, d: { x: 1, y: 0 }, n: { x: 0, y: 1 }, len: Math.max(r.bb.w, o.bb.w) + 2 * t, syn: true });
        } else if (Math.abs(r.bb.y0 - o.bb.y0) < t && Math.abs(r.bb.y1 - o.bb.y1) < t && (r.bb.x0 > o.bb.x1 - t || o.bb.x0 > r.bb.x1 - t)) {
          const c = (Math.max(r.bb.x1, o.bb.x1) + Math.min(r.bb.x0, o.bb.x0)) / 2;
          const span = Math.max(r.bb.x1, o.bb.x1) - Math.min(r.bb.x0, o.bb.x0); const Y0 = Math.min(r.bb.y0, o.bb.y0), Y1 = Math.max(r.bb.y1, o.bb.y1); if (AX.some(A => Math.abs(A.d.x) < 0.02 && Math.abs(A.a.x - c) < span * 0.1 && overlap(Math.min(A.a.y, A.a.y + A.d.y * A.len), Math.max(A.a.y, A.a.y + A.d.y * A.len), Y0, Y1) > 0)) continue;
          if (!SYN.some(A => Math.abs(A.d.x) < 1e-9 && Math.abs(A.a.x - c) < t)) SYN.push({ a: { x: c, y: Math.min(r.bb.y0, o.bb.y0) - t }, d: { x: 0, y: 1 }, n: { x: -1, y: 0 }, len: Math.max(r.bb.h, o.bb.h) + 2 * t, syn: true });
        }
      }
    }
    if (SYN.length) assign(SYN);
    // 외형선 조각 (더 큰 몸체에 붙은 단면인지 판단용)
    const segs = [];
    for (const e of ents) { if (IGN_LAYERS.has(e.layer) || e.layer === '해치') continue; if (e.type === 'line') segs.push([e.a, e.b]); else if (e.type === 'polyline') { const P = e.pts; for (let i = 0; i < P.length - (e.closed ? 0 : 1); i++) segs.push([P[i], P[(i + 1) % P.length]]); } }
    function attached(A, grp) {
      const U = grp.flatMap(r => r.pts.map(q => loc(A, q))), u0 = Math.min(...U.map(v => v.u)), u1 = Math.max(...U.map(v => v.u)), out = Math.max(...U.map(v => Math.abs(v.s)));
      const t = Math.max(tolA * 3, out * 0.03);
      return segs.some(([a, b]) => { const p = loc(A, a), q = loc(A, b); if (Math.max(p.u, q.u) < u0 - t || Math.min(p.u, q.u) > u1 + t) return false;
        const pa = Math.abs(p.s), qa = Math.abs(q.s); return (Math.abs(pa - out) < t && qa > out * 1.5) || (Math.abs(qa - out) < t && pa > out * 1.5); });
    }
    // 부품 = 같은 축 영역 묶음. 짝 중 넓은 쪽(키홈 없는 쪽)만 씀
    const parts = [], used = new Set(); let skipped = 0;
    const keep = r => r.a > r.ax.mate.a || (r.a === r.ax.mate.a && regs.indexOf(r) < regs.indexOf(r.ax.mate));
    for (const r of regs) {
      if (!r.ax || used.has(r)) continue;
      const A = r.ax.A, grp = regs.filter(o => o.ax && o.ax.A === A && keep(o));
      regs.filter(o => o.ax && o.ax.A === A).forEach(o => used.add(o));
      if (grp.length && attached(A, regs.filter(o => o.ax && o.ax.A === A))) { skipped++; continue; }
      if (grp.length) parts.push({ A, regs: grp, src: A.syn ? '단면·축 추정' : '단면' });
    }
    // 해치 없는 긴 외형(축): 중심선이 가운데를 지나고 위아래 대칭
    const { loops, tol } = collectLoops();
    for (const L of loops) {
      if (L.circle || (L.parent && !(L.parent.bb.w * L.parent.bb.h > L.a * 20 && Math.abs(L.parent.a - L.parent.bb.w * L.parent.bb.h) < L.parent.a * 0.01))) continue;
      if (regs.some(r => overlap(r.bb.x0, r.bb.x1, L.bb.x0, L.bb.x1) > 0 && overlap(r.bb.y0, r.bb.y1, L.bb.y0, L.bb.y1) > 0)) continue;
      for (const A of AX) {
        const P = L.pts.map(q => loc(A, q)), u0 = Math.min(...P.map(v => v.u)), u1 = Math.max(...P.map(v => v.u)), s0 = Math.min(...P.map(v => v.s)), s1 = Math.max(...P.map(v => v.s));
        if (!(s0 < -tolA && s1 > tolA) || Math.abs(s0 + s1) > Math.max(tolA * 4, (s1 - s0) * 0.03)) continue;
        if (u1 - u0 < (s1 - s0) * 2 || Math.max(0, Math.min(u1, A.len) - Math.max(u0, 0)) < (u1 - u0) * 0.5) continue;
        // 윗절반 윤곽: 꼭짓점마다 구간을 나눠 반지름을 읽음
        const half = u => { let m = 0; for (let i = 0, n = P.length; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; if ((a.u - u) * (b.u - u) <= 0 && a.u !== b.u) m = Math.max(m, Math.abs(a.s + (b.s - a.s) * (u - a.u) / (b.u - a.u))); } return m; };
        const st = []; for (const u of [...new Set(P.map(v => v.u))].sort((a, b) => a - b)) if (!st.length || u - st[st.length - 1] > tol) st.push(u);
        const prof = [{ r: 0, u: st[0] }];
        for (let i = 0; i < st.length - 1; i++) { const a = st[i], b = st[i + 1], e = Math.min(tol, (b - a) / 10); prof.push({ r: half(a + e), u: a }, { r: half(b - e), u: b }); }
        prof.push({ r: 0, u: st[st.length - 1] });
        const rmx = Math.max(...prof.map(v => v.r)), Lp = st[st.length - 1] - st[0], endOK = (u, k) => { const a = half(u + k * Lp * 0.002), b = half(u + k * Lp * 0.02); return b > 0 && a / b > 0.6; };
        if (!endOK(st[0], 1) || !endOK(st[st.length - 1], -1) || prof[1].r < rmx * 0.15 || prof[prof.length - 2].r < rmx * 0.15) continue; /* 양끝이 둥근 장공·키홈 상세도는 제외 */
        if (rmx * 2 < 6 || Lp < 6) continue;   /* Ø6 미만 기호·상세 표시는 제외 */
        parts.push({ A, side: 1, prof, src: '외형' }); break;
      }
    }
    if (!parts.length) return null;
    // 부품마다 (r, u) 윤곽으로 바꿈
    for (const pt of parts) {
      if (pt.prof) { const u0 = pt.prof[0].u; pt.polys = [pt.prof.map(v => ({ r: v.r, u: v.u - u0 }))]; }
      else { const P = pt.regs.map(r => r.pts.map(q => { const v = loc(pt.A, q); return { r: Math.abs(v.s), u: v.u }; })); const u0 = Math.min(...P.flat().map(v => v.u)); pt.polys = P.map(pp => pp.map(v => ({ r: v.r, u: v.u - u0 }))); }
      pt.polys = pt.polys.map(pp => { const o = []; for (const v of pp) { const l = o[o.length - 1]; if (!l || Math.hypot(l.r - v.r, l.u - v.u) > 1e-4) o.push(v); } if (o.length > 2 && Math.hypot(o[0].r - o[o.length - 1].r, o[0].u - o[o.length - 1].u) <= 1e-4) o.pop(); return o; }).filter(pp => pp.length >= 3);
      pt.D = 2 * Math.max(...pt.polys.flat().map(v => v.r)); pt.L = Math.max(...pt.polys.flat().map(v => v.u));
      pt.cx = pt.A.a.x + pt.A.d.x * 0; // 정렬용
    }
    parts.sort((a, b) => (b.A.a.y - a.A.a.y) || (a.A.a.x - b.A.a.x));
    const nonrev = regs.filter(r => !used.has(r)).length + skipped;
    LAB._sec = { regs: regs.map(r => ({ bb: [r.bb.x0, r.bb.y0, r.bb.x1, r.bb.y1].map(v => +v.toFixed(1)), a: +r.a.toFixed(1), ax: r.ax ? (r.ax.A.syn ? 'syn' : 'cl') : null, axY: r.ax ? +r.ax.A.a.y.toFixed(1) : null })), syn: SYN.length, skipped };
    const info = [], warn = [];
    if (nonrev) info.push(`대칭 짝이 없는 단면 ${nonrev}곳(본체·하우징 등 회전체가 아닌 부품)은 아직 3D로 만들지 못했습니다`);
    info.push('단면에 안 보이는 구멍(볼트 구멍·키홈 등)은 빠집니다');
    return { kind: 'parts', parts, warn, info, tol: tolA, holes: [] };
  }


  // 단면 쌓기 (두 방향 모두 시도): A = 정면도가 단면·측면도가 길이 윤곽 / B = 측면도가 단면·정면도가 길이 윤곽
  function stackPlan(front, side, tol, info0, warn0) {
    const a = stackTry(front, side, tol, 'A'), b = stackTry(front, side, tol, 'B');
    const score = r => r ? r.cover * 10 - r.assumed / Math.max(1, r.segs.length) * 3 - r.segs.length * 0.001 : -Infinity;
    const best = score(a) >= score(b) ? a : b; LAB._stackAB = { a: a && { cover: a.cover, assumed: a.assumed, n: a.segs.length }, b: b && { cover: b.cover, assumed: b.assumed, n: b.segs.length } };
    if (!best) return null;
    const info = info0.slice();
    if (best.assumed) info.push(`맞는 단면 윤곽이 없는 구간 ${best.assumed}개는 둥근 단면으로 가정했습니다`);
    if (best.blind) info.push(`숨은선으로 깊이를 읽은 막힌 구멍·자리파기 ${best.blind}개`);
    const kinds = new Set(best.segs.map(g => g.cone ? '원뿔' : g.loop.circle ? '원' : g.loop === best.S ? '단면 윤곽' : '다각형'));
    const polySeg = best.segs.filter(g => g.loop && !g.loop.circle);
    if (polySeg.length) { const Lp = polySeg[0].loop, zz0 = Math.min(...polySeg.filter(g => g.loop === Lp).map(g => g.z)), zz1 = Math.max(...polySeg.filter(g => g.loop === Lp).map(g => g.z + g.L)); const ch = findChamfer(Lp, best.P, best.total, tol, [zz0, zz1]); if (ch) ch.Rbig = Math.max(best.S.bb.w, best.S.bb.h, best.P.bb.h) * 0.75; if (ch) { best.chamfer = ch; info.push(`모따기: 정면도 원 Ø${fmt3(ch.rc * 2)}에서 시작 (육각 머리 모서리를 원뿔로 깎음)`); } }
    return Object.assign(best, { kind: 'stack', front, side, warn: warn0, info, tol, t: best.total, desc: [...kinds].join('·') + (best.mode === 'B' ? ' · 측면도 기준' : '') });
  }
  function stackTry(front, side, tol, mode) {
    const P = mode === 'A' ? side : front, S = mode === 'A' ? front : side;   // P: 길이 윤곽, S: 단면이 나오는 뷰
    const SP = P.pts, pb = P.bb, t = Math.max(tol * 4, Math.max(S.bb.w, S.bb.h, P.bb.h) * 0.01);
    const ext = u => { let lo = Infinity, hi = -Infinity; for (let i = 0, n = SP.length; i < n; i++) { const a = SP[i], b = SP[(i + 1) % n]; if ((a.x - u) * (b.x - u) <= 0 && a.x !== b.x) { const v = a.y + (b.y - a.y) * (u - a.x) / (b.x - a.x); lo = Math.min(lo, v); hi = Math.max(hi, v); } } return lo <= hi ? [lo, hi] : null; };
    const cands = [S]; (function walk(L) { for (const k of L.kids) { cands.push(k); walk(k); } })(S);
    try { for (const L of collectLoops(true).loops) if (L.bb.x0 >= S.bb.x0 - t && L.bb.x1 <= S.bb.x1 + t && L.bb.y0 >= S.bb.y0 - t && L.bb.y1 <= S.bb.y1 + t) { L.hidden = true; cands.push(L); } } catch (_) { }
    const pick = (lo, hi) => { let best = null; for (const L of cands) { if (Math.abs(L.bb.y0 - lo) > t || Math.abs(L.bb.y1 - hi) > t) continue; const sc = (L === S ? 3 : 0) + (L.hidden ? 0 : 1) + L.a * 1e-9; if (!best || sc > best.sc) best = { L, sc }; } return best && best.L; };
    let hid = []; try { hid = srcEnts().filter(e => (e.layer === '숨은선' || /hidden|dashed/i.test(String(e.lt || ''))) && e.type === 'line'); } catch (_) { }
    const hseg = hid.map(e => [e.a, e.b]).filter(([a, b]) => Math.abs(a.y - b.y) <= t * 0.5 && Math.min(a.x, b.x) >= pb.x0 - t && Math.max(a.x, b.x) <= pb.x1 + t && a.y >= pb.y0 - t && a.y <= pb.y1 + t);
    const depthOf = L => { const r0 = []; for (const [a, b] of hseg) if (Math.abs(a.y - L.bb.y0) <= t || Math.abs(a.y - L.bb.y1) <= t) r0.push([Math.min(a.x, b.x), Math.max(a.x, b.x)]); if (!r0.length) return null; return [Math.min(...r0.map(r => r[0])) - pb.x0, Math.max(...r0.map(r => r[1])) - pb.x0]; };
    const us = []; for (const q of SP) if (!us.some(u => Math.abs(u - q.x) <= tol)) us.push(q.x); us.sort((a, b) => a - b);
    const segs = []; let covered = 0, usedS = false, assumed = 0; const total = us[us.length - 1] - us[0];
    const sc = S.circle ? S.circle.c : { x: (S.bb.x0 + S.bb.x1) / 2, y: (S.bb.y0 + S.bb.y1) / 2 };
    const hasRound = cands.some(L => L.circle && Math.abs(L.circle.c.y - sc.y) <= t);
    for (let i = 0; i < us.length - 1; i++) {
      const a = us[i], b = us[i + 1], e = Math.min(tol, (b - a) / 10); if (b - a <= tol) continue;
      const ea = ext(a + e), eb = ext(b - e), em = ext((a + b) / 2); if (!ea || !eb || !em) continue;
      const g = { z: a - pb.x0, L: b - a };
      const same = Math.abs(ea[0] - eb[0]) <= t && Math.abs(ea[1] - eb[1]) <= t;
      const L = pick(em[0], em[1]);
      if (L && same) { g.loop = L; if (L === S) usedS = true; }
      else {
        const La = pick(ea[0], ea[1]), Lb = pick(eb[0], eb[1]), cy = (ea[0] + ea[1]) / 2;
        const centered = Math.abs((eb[0] + eb[1]) / 2 - cy) <= t && Math.abs(cy - sc.y) <= t;
        if (centered && (!La || La.circle) && (!Lb || Lb.circle) && (S.circle || (La && La.circle) || (Lb && Lb.circle))) {
          const cc = (La && La.circle && La.circle.c) || (Lb && Lb.circle && Lb.circle.c) || sc;
          g.cone = { c: cc, rA: (ea[1] - ea[0]) / 2, rB: (eb[1] - eb[0]) / 2 };
        } else if (L) g.loop = L;
        else if (centered && hasRound && Math.abs((em[0] + em[1]) / 2 - sc.y) <= t) { g.cone = { c: sc, rA: (ea[1] - ea[0]) / 2, rB: (eb[1] - eb[0]) / 2 }; g.assumed = true; assumed++; }
        else continue;
      }
      covered += g.L; segs.push(g);
    }
    if (!segs.length || covered < total * 0.9 || !usedS) return null;
    if (segs.every(g => g.loop === S)) return null;   // 단순 돌출과 같음 → 기존 방식
    // 단면은 단면 뷰 윤곽 안에 들어가야 함 (얇은 와셔·기어를 거꾸로 읽는 것 방지)
    for (const g of segs) if (g.cone) { const r = Math.max(g.cone.rA, g.cone.rB), c = g.cone.c; if (c.x - r < S.bb.x0 - t || c.x + r > S.bb.x1 + t || c.y - r < S.bb.y0 - t || c.y + r > S.bb.y1 + t) return null; }
    // 모든 단면이 같은 중심의 원이면 회전체 방식이 더 정확함
    const allRound = segs.every(g => g.cone || (g.loop && g.loop.circle));
    if (allRound) { const c0 = segs[0].cone ? segs[0].cone.c : segs[0].loop.circle.c; if (segs.every(g => { const c = g.cone ? g.cone.c : g.loop.circle.c; return Math.hypot(c.x - c0.x, c.y - c0.y) <= t; })) return null; }
    const sectionSet = new Set(segs.map(g => g.loop).filter(Boolean));
    const holes = []; let blind = 0;
    for (const L of cands) {
      if (L === S || L.hidden || sectionSet.has(L)) continue;
      if (L.kids && L.kids.some(k => sectionSet.has(k))) continue;
      const d = depthOf(L), rng = d || [0, total];
      if (d && (d[1] - d[0]) < total - t) blind++;
      holes.push({ loop: L, z0: Math.max(0, rng[0]), z1: Math.min(total, rng[1]) });
    }
    return { mode, P, S, segs, holes, total, cover: covered / total, assumed, blind };
  }
  // 단면 쌓기 좌표: 단면 뷰 점 → (단면 평면 2D), 3D 놓는 법
  //  A: 단면=정면도 (x-ox, y-oy), 길이=Z  /  B: 단면=측면도 (y-oy, x-측면 왼쪽)= (Y, Z), 길이=X
  function stackFrame(pl) {
    const o = { x: (pl.front.bb.x0 + pl.front.bb.x1) / 2, y: (pl.front.bb.y0 + pl.front.bb.y1) / 2 };
    if (pl.mode === 'B') { const sx0 = pl.side.bb.x0, fx0 = pl.front.bb.x0; return { o, map: q => ({ x: q.y - o.y, y: q.x - sx0 }), axis0: fx0 - o.x }; }
    return { o, map: q => ({ x: q.x - o.x, y: q.y - o.y }), axis0: 0 };
  }

  /* ---------------- 정면·측면 판단 → 3D 계획 ---------------- */
  const fmt3 = v => (Math.round(v * 100) / 100).toString();
  function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }
  function plan() {
    if (kindSel.value === 'auto' || kindSel.value === 'section') { const sp = sectionPlan(); if (sp) return sp; if (kindSel.value === 'section') return { empty: true }; }
    const { loops, tol, gapFixed, openLeft, texts } = collectLoops();
    let tops = loops.filter(L => !L.parent);
    if (!tops.length) return { empty: true };
    const warn = [], info = []; var bigDiff = false, hugeDiff = false;
    if (gapFixed > tol) info.push(`벌어진 선 끝을 이어 붙였습니다 (최대 ${fmt3(gapFixed)}mm)`);
    if (openLeft) info.push(`닫히지 않은 선 묶음 ${openLeft}개는 건너뛰었습니다`);
    const isRect = L => !L.circle && Math.abs(L.a - L.bb.w * L.bb.h) / (L.bb.w * L.bb.h) < 0.01;
    const textsIn = L => texts.filter(q => q.x > L.bb.x0 && q.x < L.bb.x1 && q.y > L.bb.y0 && q.y < L.bb.y1 && inPoly(q, L.pts)).length;
    // 도곽(테두리) 건너뛰기: 사각형 안에 큰 윤곽들이 있고, 이중 테두리이거나 안에 문자가 있으면 테두리로 보고 안쪽을 꺼냄
    let frames = 0;
    for (let guard = 0; guard < 4; guard++) {
      const fr = tops.find(L => isRect(L) && (L.kids.some(k => isRect(k) && k.a > L.a * 0.7) ||
        (L.kids.filter(k => k.a > L.a * 0.02).length >= 2 && L.kids.some(k => k.a > L.a * 0.08) && textsIn(L) >= 2)));
      if (!fr) break; frames++;
      tops = tops.filter(L => L !== fr).concat(fr.kids); for (const k of fr.kids) k.parent = null;
    }
    if (frames) info.push(`도면 테두리(도곽) ${frames}개는 건너뛰었습니다`);
    // 표제란(문자가 2개 이상 든 사각형)은 정면·측면 후보에서 뺌
    const titles = tops.filter(L => isRect(L) && textsIn(L) >= 2 && !L.kids.some(k => k.a > L.a * 0.08));
    if (titles.length) { tops = tops.filter(L => !titles.includes(L)); info.push('표제란은 건너뛰었습니다'); }
    if (!tops.length) return { empty: true };
    // 정면도: 원이 바깥 윤곽이면서 같은 중심의 원이 있는 뷰 우선, 없으면 가장 큰 뷰
    const isRound = L => L.circle && L.kids.some(k => k.circle && Math.hypot(k.circle.c.x - L.circle.c.x, k.circle.c.y - L.circle.c.y) <= tol * 4);
    const bigA = Math.max(...tops.map(L => L.a));
    const nb = L => { let h = 0, v = 0; for (const M of tops) { if (M === L) continue; if (overlap(L.bb.y0, L.bb.y1, M.bb.y0, M.bb.y1) / Math.min(L.bb.h, M.bb.h) > 0.6 && (M.bb.x0 > L.bb.x1 - tol || M.bb.x1 < L.bb.x0 + tol)) h++; if (overlap(L.bb.x0, L.bb.x1, M.bb.x0, M.bb.x1) / Math.min(L.bb.w, M.bb.w) > 0.6 && (M.bb.y0 > L.bb.y1 - tol || M.bb.y1 < L.bb.y0 + tol)) v++; } return h && v; };
    const hub = tops.filter(L => L.a >= bigA * 0.2 && nb(L)).sort((a, b) => b.a - a.a)[0];
    // 원 뷰와 나란한 다른 뷰가 있으면 원 뷰를 정면으로 (볼트·축처럼 옆모습이 더 커도 회전체로 읽게)
    const pairOf = L => tops.find(M => M !== L && ((overlap(L.bb.y0, L.bb.y1, M.bb.y0, M.bb.y1) / Math.min(L.bb.h, M.bb.h) > 0.6 && Math.abs(M.bb.h - L.bb.h) <= Math.max(L.bb.h, M.bb.h) * 0.15) || (overlap(L.bb.x0, L.bb.x1, M.bb.x0, M.bb.x1) / Math.min(L.bb.w, M.bb.w) > 0.6 && Math.abs(M.bb.w - L.bb.w) <= Math.max(L.bb.w, M.bb.w) * 0.15)));
    const roundNb = !(hub && hub.circle) ? tops.filter(L => L !== hub && L.circle && L.a >= bigA * 0.05 && (hub ? nb(L) : pairOf(L))).sort((a, b) => b.a - a.a)[0] : null;
    let front = roundNb || hub || tops.find(L => isRound(L) && L.a >= bigA * 0.5) || tops.find(L => L.circle && L.a >= bigA * 0.5) || tops.reduce((m, L) => L.a > m.a ? L : m, tops[0]);
    // 측면도: 정면과 가로(같은 높이) 또는 세로(같은 너비)로 나란한 가장 가까운 뷰
    let sideV = null, dir = null, best = Infinity, sideH = null, bestH = Infinity, topV = null, bestV = Infinity;
    for (const L of tops) {
      if (L === front) continue;
      const oy = overlap(front.bb.y0, front.bb.y1, L.bb.y0, L.bb.y1) / Math.min(front.bb.h, L.bb.h);
      const ox = overlap(front.bb.x0, front.bb.x1, L.bb.x0, L.bb.x1) / Math.min(front.bb.w, L.bb.w);
      const dx = L.bb.x0 > front.bb.x1 ? L.bb.x0 - front.bb.x1 : front.bb.x0 - L.bb.x1, dy = L.bb.y0 > front.bb.y1 ? L.bb.y0 - front.bb.y1 : front.bb.y0 - L.bb.y1;
      if (oy > 0.6 && dx > -tol && dx < bestH && L.bb.x0 > front.bb.x1 - tol) { bestH = dx; sideH = L; }
      if (ox > 0.6 && dy > -tol && dy < bestV) { bestV = dy; topV = L; }
      if (oy > 0.6 && dx > -tol && dx < best) { best = dx; sideV = L; dir = 'h'; }
      if (ox > 0.6 && dy > -tol && dy < best) { best = dy; sideV = L; dir = 'v'; }
    }

    // ── 3면 교차: 정면·오른쪽 측면·윗면(또는 아래 단면) 세 장이 다 있으면
    if (kindSel.value === 'auto' && sideH && topV && !front.circle) {
      sideV = sideH; dir = 'h';
      const secs = [];   // 윗면 쪽 뷰가 단면도(해치)면 그 단면 모양
      for (const e of srcEnts()) if (e.type === 'hatch' && Array.isArray(e.loops)) for (const lp of e.loops) { const pts = lp.map(q => ({ x: q.x, y: q.y })), bb = bboxOf(pts); if (bb.x0 >= topV.bb.x0 - tol && bb.x1 <= topV.bb.x1 + tol && bb.y0 >= topV.bb.y0 - tol && bb.y1 <= topV.bb.y1 + tol && pts.length >= 3) secs.push({ pts, bb, a: Math.abs(area(pts)) }); }
      const below = topV.bb.y1 <= front.bb.y0 + tol;
      // 높이 구간: 받침(측면도에서 전체 길이로 이어진 아래 부분) / 지지부 / 몸통(측면도의 가장 큰 원)
      // 높이 구간: 정면도 폭이 바뀌는 곳 → 받침 위 / 몸통 아래
      const FP = front.pts, fAt = y => { let lo = Infinity, hi = -Infinity; for (let i = 0, n = FP.length; i < n; i++) { const a = FP[i], b = FP[(i + 1) % n]; if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) { const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y); lo = Math.min(lo, x); hi = Math.max(hi, x); } } return hi > lo ? hi - lo : 0; };
      const N = 400, fy = k => front.bb.y0 + front.bb.h * k / N, wBot = fAt(fy(2)), wTop = fAt(fy(N - 2));
      let baseTop = null, bossBot = null;
      for (let k = 2; k < N; k++) if (fAt(fy(k)) < wBot * 0.95) { baseTop = fy(k - 1); break; }
      for (let k = N - 2; k > 0; k--) if (fAt(fy(k)) < wTop * 0.95) { bossBot = fy(k + 1); break; }
      let zones = null;
      if (secs.length && baseTop != null && bossBot != null && bossBot > baseTop + tol) zones = { baseTop, bossBot };
      const sideHoles = sideH.kids.filter(k => !k.kids.length && Math.max(k.bb.w, k.bb.h) > sideH.bb.h * 0.08);
      const topHoles = []; (function walk(L) { for (const k of L.kids) { if (k.kids.length) walk(k); else if (!secs.some(sc => Math.abs(sc.bb.x0 - k.bb.x0) < tol * 4 && Math.abs(sc.bb.y1 - k.bb.y1) < tol * 4)) topHoles.push(k); } })(topV);
      if (sideH.kids.length > sideHoles.length) info.push(`측면도의 작은 구멍 ${sideH.kids.length - sideHoles.length}개(탭 등)는 깊이를 몰라 뺐습니다`);
      if (zones) info.push(`높이를 받침·지지부·몸통 3구간으로 나눠, 지지부는 ${below ? '아래' : '위'} 단면도의 해치 모양을 썼습니다`);
      else if (secs.length) info.push('단면도 구간을 못 나눠 바깥 윤곽만 겹쳤습니다');
      if (sideH.half || topV.half) info.push(`대칭 도시(반쪽) 뷰 ${[sideH.half && '측면도', topV.half && '단면도'].filter(Boolean).join('·')}를 중심선 기준으로 펼쳤습니다`);
      const sH = rowHull(sideH, tol), tDepth = sideH.half ? 2 * Math.max(...sH.pts.map(q => Math.abs(q.x - sideH.half.a.x))) : sH.bb.w;
      const sideX = rowHull(sideH, tol); if (sideX !== sideH) info.push('측면도의 끊긴 윤곽(부분 단면·구멍)을 높이별 최대 폭으로 이어 붙였습니다');
      // 몸통 안쪽(베어링 자리·관통 구멍): 정면 단면(해치)의 빈 공간을 가로 중심선 기준 회전체로 뺌
      const bore = (() => {
        const fsec = []; for (const e of srcEnts()) if (e.type === 'hatch' && Array.isArray(e.loops)) for (const lp of e.loops) { const pts = lp.map(q => ({ x: q.x, y: q.y })), bb = bboxOf(pts); if (pts.length >= 3 && bb.x0 >= front.bb.x0 - tol && bb.x1 <= front.bb.x1 + tol && bb.y0 >= front.bb.y0 - tol && bb.y1 <= front.bb.y1 + tol) fsec.push(pts); }
        if (fsec.length < 2) return null;
        const yLo = zones ? zones.bossBot : front.bb.y0 + front.bb.h * 0.4;
        let ax = null; for (const e of srcEnts()) if (e.type === 'line' && (e.layer === '중심선' || /center/i.test(String(e.lt || ''))) && Math.abs(e.a.y - e.b.y) <= tol && e.a.y > yLo && e.a.y < front.bb.y1 && Math.min(e.a.x, e.b.x) <= front.bb.x0 + front.bb.w * 0.25 && Math.max(e.a.x, e.b.x) >= front.bb.x1 - front.bb.w * 0.25) { ax = e.a.y; break; }
        if (ax == null) return null;
        const inHatch = q => fsec.some(P => inPoly(q, P));
        // 세로선 x 에서 축 위·아래로 가장 가까운 해치 경계 → 안쪽 반지름
        const rAt = x => { let up = Infinity, dn = Infinity; for (const P of fsec) for (let i = 0, n = P.length; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue; const y = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x); if (y > ax + tol) up = Math.min(up, y - ax); else if (y < ax - tol) dn = Math.min(dn, ax - y); } return Math.min(up, dn); };
        const N = 400, prof = [];
        for (let k = 0; k <= N; k++) { const x = front.bb.x0 + front.bb.w * (k === 0 ? 0.001 : k === N ? 0.999 : k / N); if (inHatch({ x, y: ax })) { prof.push(null); continue; } const r = rAt(x); prof.push(isFinite(r) && r < front.bb.h / 2 ? r : null); }
        // 같은 반지름 구간으로 묶기
        const segs = []; for (let k = 0; k <= N; k++) { const r = prof[k], x = front.bb.x0 + front.bb.w * k / N; if (r == null) { continue; } const last = segs[segs.length - 1]; if (last && Math.abs(last.r - r) <= tol * 2 && Math.abs(last.x1 - x) <= front.bb.w / N * 1.5) { last.x1 = x; last.rs.push(r); } else segs.push({ x0: x, x1: x, r, rs: [r] }); }
        for (const g of segs) { const q = g.rs.slice().sort((a, b) => a - b); g.r = q[q.length >> 1]; delete g.rs; }
        const good = segs.filter(g => g.x1 - g.x0 >= tol * 4 && g.r > tol * 4);
        // 구간 경계는 해치 꼭짓점 x 에 맞춤 (표본 간격만큼 어긋나지 않게), 반지름은 0.01 단위
        const vx = []; for (const P of fsec) for (const q of P) vx.push(q.x);
        const snap = x => { let b = x, d = front.bb.w / N * 2; for (const v of vx) if (Math.abs(v - x) < d) { d = Math.abs(v - x); b = v; } return b; };
        for (let i = 0; i < good.length; i++) { const g = good[i]; g.r = Math.round(g.r * 100) / 100; g.x0 = snap(g.x0); g.x1 = snap(g.x1); if (i && Math.abs(good[i - 1].x1 - g.x0) <= front.bb.w / N * 2) { const m = good[i - 1].r > g.r ? g.x0 : good[i - 1].x1; good[i - 1].x1 = g.x0 = m; } }
        if (!good.length) return null;
        // 바깥까지 이어진 구간은 끝면 밖으로 조금 더 (깔끔하게 뚫리도록)
        if (good[0].x0 <= front.bb.x0 + front.bb.w / N * 2) good[0].x0 = front.bb.x0 - 1;
        const lastG = good[good.length - 1]; if (lastG.x1 >= front.bb.x1 - front.bb.w / N * 2) lastG.x1 = front.bb.x1 + 1;
        // 바깥 모양도 같은 축의 회전체 (정면도 위쪽 윤곽 = 바깥 반지름) → 몸통 윗면이 평평하게 잘리지 않게
        const outer = []; for (let k = 0; k <= 200; k++) { const x = front.bb.x0 + front.bb.w * (k === 0 ? 0.0005 : k === 200 ? 0.9995 : k / 200); let top = -Infinity; const P = front.pts; for (let i = 0, n = P.length; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue; top = Math.max(top, a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x)); } if (top > ax + tol) outer.push({ x: k === 0 ? front.bb.x0 : k === 200 ? front.bb.x1 : x, r: top - ax }); }
        let op = outer; for (let pass = 0; pass < 3; pass++) { const q = []; for (let i = 0; i < op.length; i++) { if (i === 0 || i === op.length - 1) { q.push(op[i]); continue; } const A = q[q.length - 1], B = op[i], C = op[i + 1]; const L = Math.hypot(C.x - A.x, C.r - A.r) || 1; if (Math.abs((B.x - A.x) * (C.r - A.r) - (B.r - A.r) * (C.x - A.x)) / L > tol * 0.3) q.push(B); } op = q; }
        return { y: ax, segs: good, outer: op.length >= 2 ? op : null };
      })();
      if (bore) { const ds = [...new Set(bore.segs.map(g => fmt3(g.r * 2)))]; info.push(`몸통 안쪽: 정면 단면의 빈 공간을 회전시켜 뺐습니다 (Ø${ds.join(' · Ø')})`); }
      return { kind: 'tri', front, side: sideX, top: topV, below, secs, zones, sideHoles, topHoles, bore, holes: [], t: tDepth, warn, info, tol };
    }
    const others = tops.filter(L => L !== front && L !== sideV).length;
    if (others) info.push(`나머지 윤곽 ${others}개는 3D에 쓰지 않았습니다`);

    // ── 단면 쌓기: 측면도를 길이 방향으로 잘라, 구간마다 높이가 맞는 정면도 윤곽(육각·원·사각…)을 단면으로 씀
    //    구멍 깊이는 측면도 숨은선에서 읽음 (볼트·너트·축·보스 달린 판 등)
    // ── 돌출 ∩ 회전: 정면이 둘레를 따라 반복되는 모양(스프로킷·기어)이고 측면 윤곽 반높이 = 정면 최대 반지름이면
    //    정면 돌출과 측면 윤곽 회전체의 겹침 (톱니 끝 모따기 등)
    if (kindSel.value === 'auto' && !front.circle && sideV && dir === 'h' && !sideV.circle && !isRect(sideV)) {
      const c = { x: (front.bb.x0 + front.bb.x1) / 2, y: (front.bb.y0 + front.bb.y1) / 2 }, Rf = Math.max(...front.pts.map(q => Math.hypot(q.x - c.x, q.y - c.y)));
      const sh = sideV.bb.h / 2, smid = (sideV.bb.y0 + sideV.bb.y1) / 2;
      if (Math.abs(front.bb.w - front.bb.h) <= front.bb.w * 0.02 && Math.abs(Rf - sh) <= Rf * 0.02 && Math.abs(smid - c.y) <= Rf * 0.02 && front.pts.length >= 24) {
        const P = sideV.pts.map(q => ({ u: q.x, v: q.y - c.y, key: q.key })), n = P.length;
        let top = 0; for (let i = 1; i < n; i++) if (P[i].v > P[top].v) top = i;
        const fw = [P[top]]; for (let i = 1; i < n; i++) { const q = P[(top + i) % n]; if (q.v < -tol) break; fw.push(q); if (q.v <= tol) break; }
        const bw = []; for (let i = 1; i < n; i++) { const q = P[(top - i + n) % n]; if (q.v < -tol) break; bw.push(q); if (q.v <= tol) break; }
        let ch = bw.reverse().concat(fw); if (ch[0].u > ch[ch.length - 1].u) ch = ch.reverse();
        if (ch.length >= 3) {
          const prof = [[0, ch[0].u - sideV.bb.x0, true]].concat(ch.map(q => [Math.max(0, q.v), q.u - sideV.bb.x0, q.key]), [[0, ch[ch.length - 1].u - sideV.bb.x0, true]]);
          prof[1][2] = true; prof[prof.length - 2][2] = true;
          const holes = []; (function walk(L) { for (const k of L.kids) { if (k.kids.length) walk(k); else holes.push(k); } })(front);
          info.push('정면 돌출 ∩ 측면 윤곽 회전체 (톱니 끝 모따기 등)');
          return { kind: 'extrev', front, side: sideV, c, prof, holes, t: sideV.bb.w, warn, info, tol };
        }
      }
    }
    if ((kindSel.value === 'stack' || kindSel.value === 'auto') && sideV && dir === 'h' && !sideV.circle) {
      const st0 = stackPlan(front, sideV, tol, info, warn);
      // 정면이 원이면 회전체(막힌 구멍 깊이 포함)가 더 정확 → 원이 아닌 단면(플랜지 너트의 육각 등)이 실제로 쓰일 때만 단면 쌓기
      if (st0 && (!front.circle || kindSel.value === 'stack' || st0.segs.some(g => g.loop && !g.loop.circle && g.L >= st0.total * 0.1))) return st0;
      if (kindSel.value === 'stack') warn.push('구간마다 맞는 정면 윤곽을 다 찾지 못해 다른 방식으로 만들었습니다');
    }
    let kind = kindSel.value === 'stack' ? 'auto' : kindSel.value;
    const sideRect = sideV && (sideV.circle || isRect(sideV));
    if (kind === 'auto') kind = (front.circle && sideV && !sideV.circle) ? 'revolve' : (!front.circle && sideV && dir === 'h' && !sideRect) ? 'intersect' : 'extrude';
    if (sideV && sideV.kids.length && kind !== 'intersect') info.push(`측면도 안쪽 윤곽 ${sideV.kids.length}개(키홈·홈 등)는 아직 3D에 반영하지 않았습니다`);
    if (kind === 'revolve' && !front.circle) { warn.push('정면도 바깥 윤곽이 원이 아니라서 돌출로 만들었습니다'); kind = 'extrude'; }
    if (kind === 'revolve' && !sideV) { warn.push('측면도가 없어 회전체 길이를 몰라 두께만큼 돌출했습니다'); kind = 'extrude'; }

    // 정면·측면 크기 비교 (손그림 오차 허용)
    if (sideV) {
      const fH = dir === 'h' ? front.bb.h : front.bb.w, sH = dir === 'h' ? sideV.bb.h : sideV.bb.w;
      const diff = Math.abs(fH - sH) / Math.max(fH, sH);
      if (diff > 0.10) { warn.push(`${dir === 'h' ? '높이' : '너비'}가 다릅니다: 정면도 ${fmt3(fH)} / 측면도 ${fmt3(sH)} (차이 ${Math.round(diff * 100)}%). 정면도에 맞춰 만들었습니다. 어느 쪽이 맞나요?`); var bigDiff = true; if (diff > 0.25) var hugeDiff = true; }
      else if (diff > tol / Math.max(fH, sH) * 4) info.push(`정면·측면 차이 ${Math.round(diff * 1000) / 10}% → 정면도에 맞췄습니다`);
    }

    if (kind === 'revolve' && hugeDiff && kindSel.value === 'auto') { warn.push('정면·측면 크기가 많이 달라 회전체가 아니라고 보고 2면 교차로 만들었습니다'); kind = sideV && dir === 'h' ? 'intersect' : 'extrude'; }
    if (kind === 'extrude') {
      let t = +tIn.value || 10, tSrc = '입력한 두께';
      if (sideV) {
        t = dir === 'h' ? sideV.bb.w : sideV.bb.h; tSrc = '측면도';
        if (!sideRect) warn.push(dir === 'v' ? '윗면도 모양은 아직 두께로만 읽습니다 (측면도를 정면도 오른쪽에 그려 주세요)' : '측면도 모양은 두께로만 읽었습니다 (형상: 자동으로 두면 2면 교차로 만듭니다)');
      }
      // 안쪽 윤곽: 비어 있으면 구멍, 안에 또 윤곽이 있으면 턱·보스 선으로 보고 그 안쪽을 구멍으로
      const holes = []; let steps = 0;
      (function walk(L) { for (const k of L.kids) { if (k.kids.length) { steps++; walk(k); } else holes.push(k); } })(front);
      if (steps) info.push(`안쪽 윤곽 ${steps}개는 턱·보스(카운터보어 등) 선으로 보고 안쪽 구멍만 뚫었습니다`);
      const chamfer = sideV && dir === 'h' ? findChamfer(front, sideV, t, tol) : null;
      // 헬리컬 기어: 측면도에 두께 전체를 가로지르는 비스듬한 곡선이 많으면 비틀림 각도를 읽음
      let twist = 0;
      if (sideV && dir === 'h' && !front.circle) {
        const c = { x: (front.bb.x0 + front.bb.x1) / 2, y: (front.bb.y0 + front.bb.y1) / 2 }, Rf = Math.max(...front.pts.map(q => Math.hypot(q.x - c.x, q.y - c.y))), sx0 = sideV.bb.x0, sx1 = sideV.bb.x1, ds = [];
        for (const e of srcEnts()) { if (e.layer !== '외형선' || e.type !== 'polyline' || !e.pts || e.pts.length < 3) continue; const P = e.pts.slice().sort((a, b) => a.x - b.x), L = P[0], Rr = P[P.length - 1]; if (L.x > sx0 + tol * 2 || Rr.x < sx1 - tol * 2) continue; const yl = (L.y - c.y) / Rf, yr = (Rr.y - c.y) / Rf; if (Math.abs(yl) > 0.4 || Math.abs(yr) > 0.4) continue; ds.push((Math.asin(yr) - Math.asin(yl)) * 180 / Math.PI); }
        if (ds.length >= 6) { ds.sort((a, b) => a - b); const m = ds[ds.length >> 1]; if (Math.abs(m) > 1) { twist = m; info.push(`헬리컬: 측면도 비스듬한 선에서 비틀림 ${fmt3(m)}° 읽음`); } }
      }
      if (chamfer) info.push(`모따기: 정면도 원 Ø${fmt3(chamfer.rc * 2)}에서 시작, 깊이 ${[chamfer.dL, chamfer.dR].filter(Boolean).map(fmt3).join(' · ')} (육각 너트처럼 모서리를 원뿔로 깎음)`);
      return { kind, front, holes, t, tSrc, chamfer, twist, warn, info, tol };
    }
    if (kind === 'intersect') {
      // 2면 교차: 정면도를 깊이만큼, 측면도를 너비만큼 각각 돌출해 겹치는 부분만 남김 (정밀 엔진)
      const holes = []; let steps = 0;
      (function walk(L) { for (const k of L.kids) { if (k.kids.length) { steps++; walk(k); } else holes.push(k); } })(front);
      if (steps) info.push(`안쪽 윤곽 ${steps}개는 턱·보스 선으로 보고 안쪽 구멍만 뚫었습니다`);
      return { kind, front, holes, side: sideV, sideHoles: sideV.kids.filter(k => !k.kids.length), t: sideV.bb.w, warn, info, tol };
    }
    // 회전체: 측면도 윤곽을 축 방향으로 잘라 구간별 반지름을 읽음
    const fc = front.circle.c, R0 = front.circle.r;
    const tr = dir === 'h' ? (p => ({ u: p.x, v: p.y })) : (p => ({ u: p.y, v: p.x }));
    const sp = sideV.pts.map(tr);
    const axisV = dir === 'h' ? fc.y : fc.x, sideMid = dir === 'h' ? (sideV.bb.y0 + sideV.bb.y1) / 2 : (sideV.bb.x0 + sideV.bb.x1) / 2;
    let v0 = axisV;
    if (Math.abs(sideMid - axisV) > Math.max(tol * 4, R0 * 0.03)) { warn.push(`중심이 어긋납니다: 정면도 원 중심 ${fmt3(axisV)} / 측면도 중심 ${fmt3(sideMid)}. 측면도 중심을 축으로 썼습니다`); v0 = sideMid; }
    const half = u => { let m = 0; for (let i = 0, n = sp.length; i < n; i++) { const a = sp[i], b = sp[(i + 1) % n]; if ((a.u - u) * (b.u - u) <= 0 && a.u !== b.u) { const v = a.v + (b.v - a.v) * (u - a.u) / (b.u - a.u); m = Math.max(m, Math.abs(v - v0)); } } return m; };
    let us = [...new Set(sp.map(p => p.u))].sort((a, b) => a - b), st = [];
    for (const u of us) if (!st.length || u - st[st.length - 1] > tol) st.push(u);
    const segs = [];
    for (let i = 0; i < st.length - 1; i++) { const a = st[i], b = st[i + 1], e = Math.min(tol, (b - a) / 10); const rA = half(a + e), rB = half(b - e); if (rA > tol || rB > tol) segs.push({ z: a - st[0], L: b - a, rA, rB }); }
    // 반지름이 정면도 원보다 크면 경고
    const rMax = Math.max(...segs.map(s => Math.max(s.rA, s.rB)));
    const sc = R0 / rMax;
    if (Math.abs(sc - 1) > 0.10 && !bigDiff) warn.push(`지름이 다릅니다: 정면도 Ø${fmt3(R0 * 2)} / 측면도 Ø${fmt3(rMax * 2)}. 정면도에 맞춰 만들었습니다`);
    if (Math.abs(sc - 1) > 1e-6) for (const s of segs) { s.rA *= sc; s.rB *= sc; }
    // 동심원 중 측면도에 없는 가장 큰 안쪽 원 = 관통 구멍(보어)
    const conc = [], holes = [];
    const isConc = k => k.circle && Math.hypot(k.circle.c.x - fc.x, k.circle.c.y - fc.y) <= tol * 4;
    // 동심원 안쪽(예: 허브 원 안의 보어 원)까지 따라 들어가며 읽음
    (function walk(L) { for (const k of L.kids) { if (isConc(k)) { conc.push(k.circle.r); walk(k); } else holes.push(k); } })(front);
    const radii = segs.flatMap(s => [s.rA, s.rB]), rMin = Math.min(...radii);
    const matches = r => radii.some(x => Math.abs(x - r) <= Math.max(tol * 4, r * 0.01));
    let bore = 0;
    for (const r of conc) if (!matches(r) && r < rMin - tol && (!bore || r < bore)) bore = r;   // 가장 안쪽 원 = 관통 구멍
    let unknown = conc.filter(r => r !== bore && !matches(r));
    // 보어 모서리 모따기: 보어보다 조금 큰 동심원 (양쪽 끝 45°)
    let boreCh = 0;
    if (bore > 0) { const c = unknown.filter(r => r > bore + tol && r < bore * 1.12 + tol * 2); if (c.length) { boreCh = Math.min(...c) - bore; unknown = unknown.filter(r => !c.includes(r)); info.push(`보어 모따기 ${fmt3(boreCh)}`); } }
    // 숨은선 동심원(뒤쪽 홈·자리파기)도 안쪽 단 후보
    for (const e of srcEnts()) if (e.type === 'circle' && (e.layer === '숨은선' || /hidden|dashed/i.test(String(e.lt || ''))) && Math.hypot(e.c.x - fc.x, e.c.y - fc.y) <= tol * 4 && e.r < R0 - tol && e.r !== bore && !matches(e.r) && !unknown.some(r => Math.abs(r - e.r) <= tol)) unknown.push(e.r);
    // 안쪽 단(소켓·카운터보어 등): 측면도의 축과 나란한 선(숨은선 포함)이 같은 반지름에 있으면 그 길이만큼 판 구멍
    const steps = [];
    if (unknown.length) {
      const Ls = []; for (const e of srcEnts()) { if (!(e.type === 'line' || (e.type === 'polyline' && e.pts && e.pts.length >= 2)) || ['중심선', '치수', '문자'].includes(e.layer) || /center/i.test(String(e.lt || ''))) continue; const PP = e.type === 'line' ? [e.a, e.b] : e.pts.map(q => q), TT = PP.map(tr); if (Math.max(...TT.map(q => q.v)) - Math.min(...TT.map(q => q.v)) > tol) continue; const a = TT.reduce((m, q) => q.u < m.u ? q : m), b = TT.reduce((m, q) => q.u > m.u ? q : m); const u0 = Math.min(a.u, b.u), u1 = Math.max(a.u, b.u); if (u1 < st[0] - tol || u0 > st[st.length - 1] + tol) continue; Ls.push({ r: Math.abs(a.v - v0) * sc, u0, u1 }); }
      for (const r of unknown) { const m = Ls.filter(l => Math.abs(l.r - r) <= Math.max(tol * 4, r * 0.01)); if (!m.length) continue; const u0 = Math.min(...m.map(l => l.u0)), u1 = Math.max(...m.map(l => l.u1)); if (u1 - u0 > tol) steps.push({ r, z0: u0 - st[0], z1: u1 - st[0] }); }
      if (steps.length) { info.push(`안쪽 단 ${steps.map(q => 'Ø' + fmt3(q.r * 2) + ' 깊이 ' + fmt3(q.z1 - q.z0)).join(', ')} (측면도 선으로 깊이 읽음)`); unknown = unknown.filter(r => !steps.some(q => q.r === r)); }
    }
    if (unknown.length) info.push(`측면도와 맞지 않는 동심원 ${unknown.map(r => 'Ø' + fmt3(r * 2)).join(', ')}은 건너뛰었습니다`);
    // 정면의 구멍(육각 렌치 홈 등) 깊이: 측면도에서 구멍 가장자리 높이에 축과 나란한 선이 있으면 그 길이만큼만
    {
      const Ls = []; for (const e of srcEnts()) { if (!(e.type === 'line' || (e.type === 'polyline' && e.pts && e.pts.length >= 2)) || ['중심선', '치수', '문자'].includes(e.layer) || /center/i.test(String(e.lt || ''))) continue; const PP = e.type === 'line' ? [e.a, e.b] : e.pts.map(q => q), TT = PP.map(tr); if (Math.max(...TT.map(q => q.v)) - Math.min(...TT.map(q => q.v)) > tol) continue; const a = TT.reduce((m, q) => q.u < m.u ? q : m), b = TT.reduce((m, q) => q.u > m.u ? q : m); const u0 = Math.min(a.u, b.u), u1 = Math.max(a.u, b.u); if (u1 < st[0] - tol || u0 > st[st.length - 1] + tol) continue; Ls.push({ v: (a.v - v0) * sc, u0, u1 }); }
      let nb = 0;
      for (const h of holes) {
        const e0 = (dir === 'h' ? h.bb.y0 - fc.y : h.bb.x0 - fc.x), e1 = (dir === 'h' ? h.bb.y1 - fc.y : h.bb.x1 - fc.x), tl = Math.max(tol, (e1 - e0) * 0.005);
        const m = Ls.filter(l => Math.abs(l.v - e0) <= tl || Math.abs(l.v - e1) <= tl); if (!m.length) continue;
        const u0 = Math.min(...m.map(l => l.u0)), u1 = Math.max(...m.map(l => l.u1)), tot = st[st.length - 1] - st[0];
        // 구멍 범위 바깥쪽에 재료가 없으면(플랜지 판만 뚫는 볼트 구멍 등) 관통으로 둠
        const rAtZ = z => { let m = 0; for (const g of segs) if (z >= g.z - 1e-9 && z <= g.z + g.L + 1e-9) m = Math.max(m, g.rA + (g.rB - g.rA) * (z - g.z) / Math.max(g.L, 1e-9)); return m; };
        const hc = { x: (h.bb.x0 + h.bb.x1) / 2 - fc.x, y: (h.bb.y0 + h.bb.y1) / 2 - fc.y }, dmin = Math.hypot(hc.x, hc.y) - Math.max(h.bb.w, h.bb.h) / 2;
        const z0 = u0 - st[0], z1 = u1 - st[0], openBefore = z0 <= tol * 2 || rAtZ(z0 - tol * 3) < dmin, openAfter = z1 >= tot - tol * 2 || rAtZ(z1 + tol * 3) < dmin;
        if (u1 - u0 > tol && u1 - u0 < tot - tol * 2 && !(openBefore && openAfter)) { h.z0 = z0; h.z1 = z1; nb++; }
      }
      if (nb) info.push(`막힌 구멍 ${nb}개는 측면도 선으로 깊이를 읽었습니다`);
    }
    // 볼 베어링: 정면에 피치원 위에 같은 크기 원·호가 여러 개, 측면도에 같은 크기 원이 한 줄로 → 링 사이 틈 + 볼
    let balls = null;
    try {
      const sm = srcEnts().filter(e => (e.type === 'arc' || e.type === 'circle') && e.c && !['중심선', '치수', '문자'].includes(e.layer));
      const fr = sm.filter(e => Math.hypot(e.c.x - fc.x, e.c.y - fc.y) > tol * 4 && Math.hypot(e.c.x - fc.x, e.c.y - fc.y) + e.r < R0 + tol && Math.abs(e.c.x - fc.x) <= R0 + tol && Math.abs(e.c.y - fc.y) <= R0 + tol);
      const byR = new Map(); for (const e of fr) { const k = Math.round(e.r / (tol * 2)); if (!byR.has(k)) byR.set(k, []); byR.get(k).push(e); }
      for (const [, L] of byR) {
        const rb = L[0].r, cs = []; for (const e of L) if (!cs.some(c => Math.hypot(c.x - e.c.x, c.y - e.c.y) <= tol * 2)) cs.push({ x: e.c.x, y: e.c.y });
        if (cs.length < 4) continue;
        const ds = cs.map(c => Math.hypot(c.x - fc.x, c.y - fc.y)), Rp = ds.reduce((a, b) => a + b) / ds.length;
        if (ds.some(d => Math.abs(d - Rp) > tol * 4)) continue;
        // 측면도의 같은 크기 원 → 축 방향 위치
        const sc2 = sm.filter(e => Math.abs(e.r - rb) <= tol * 2 && sideV.bb && e.c.x >= sideV.bb.x0 - tol && e.c.x <= sideV.bb.x1 + tol && e.c.y >= sideV.bb.y0 - tol && e.c.y <= sideV.bb.y1 + tol);
        if (!sc2.length) continue;
        const zb = sc2.map(e => tr(e.c).u).sort((a, b) => a - b)[sc2.length >> 1] - st[0];
        const rr = conc.concat(radii).filter(r => r > tol);
        const rin = Math.max(...rr.filter(r => r < Rp - rb * 0.3)), rout = Math.min(...rr.filter(r => r > Rp + rb * 0.3));
        if (!isFinite(rin) || !isFinite(rout)) continue;
        // 링 안쪽 모서리 모따기: 틈 경계 바로 바깥의 동심원 (정면에 보이는 원)
        const allR = conc.concat(unknown), gap = rout - rin;
        const rinC = Math.min(rin, ...allR.filter(r => r < rin - tol && r > rin - gap * 0.3)), routC = Math.max(rout, ...allR.filter(r => r > rout + tol && r < rout + gap * 0.3));
        balls = { rb, Rp, zb, centers: cs.map(c => ({ x: c.x - fc.x, y: c.y - fc.y })), rin, rout, rinC, routC };
        unknown = unknown.filter(r => Math.abs(r - rinC) > tol && Math.abs(r - routC) > tol);
        unknown = unknown.filter(r => Math.abs(r - rin) > tol * 2 && Math.abs(r - rout) > tol * 2);
        info.push(`볼 베어링: 볼 ${cs.length}개 (Ø${fmt3(rb * 2)}, 피치원 Ø${fmt3(Rp * 2)}), 링 사이 틈 Ø${fmt3(rin * 2)}~Ø${fmt3(rout * 2)}`);
        break;
      }
    } catch (_) { balls = null; }
    if (balls) for (let i = steps.length - 1; i >= 0; i--) if (Math.abs(steps[i].r - balls.rin) <= tol * 2 || Math.abs(steps[i].r - balls.rout) <= tol * 2) steps.splice(i, 1);
    // 회전체 윤곽(반쪽): 측면도 윤곽에서 축 위쪽 부분만 순서대로 (매끈하게 한 번에 돌리기용)
    let prof = null;
    try {
      const P = sideV.pts.map(q => ({ u: tr(q).u, v: tr(q).v - v0, key: q.key })), n = P.length;
      let top = 0; for (let i = 1; i < n; i++) if (P[i].v > P[top].v) top = i;
      const fw = [P[top]]; for (let i = 1; i < n; i++) { const q = P[(top + i) % n]; if (q.v < -tol) break; fw.push(q); if (q.v <= tol) break; }
      const bw = []; for (let i = 1; i < n; i++) { const q = P[(top - i + n) % n]; if (q.v < -tol) break; bw.push(q); if (q.v <= tol) break; }
      let ch = bw.reverse().concat(fw); if (ch[0].u > ch[ch.length - 1].u) ch = ch.reverse();
      if (ch.length >= 3 && Math.abs(ch[0].v) <= tol * 2 && Math.abs(ch[ch.length - 1].v) <= tol * 2) {
        prof = ch.map(q => [Math.max(0, q.v * sc), q.u - st[0], q.key]); prof[0][0] = 0; prof[prof.length - 1][0] = 0; prof[0][2] = prof[prof.length - 1][2] = true;
      } else if (ch.length >= 2) {
        prof = [[0, ch[0].u - st[0], true]].concat(ch.map(q => [Math.max(0, q.v * sc), q.u - st[0], q.key]), [[0, ch[ch.length - 1].u - st[0], true]]);
        prof[1][2] = true; prof[prof.length - 2][2] = true;
      }
    } catch (_) { prof = null; }
    return { kind, front, fc, segs, prof, bore, boreCh, steps, balls, holes, warn, info, tol, total: st[st.length - 1] - st[0] };
  }

  /* ---------------- 3D 만들기 (three.js) ---------------- */
  const MAT = () => new T.MeshStandardMaterial({ color: 0x6f9fd0, metalness: 0.25, roughness: 0.55 });
  function shapeFrom(loop, origin, asHole) {
    const S2 = asHole ? new T.Path() : new T.Shape();
    if (loop.circle) { S2.absarc(loop.circle.c.x - origin.x, loop.circle.c.y - origin.y, loop.circle.r, 0, Math.PI * 2, !!asHole); return S2; }
    let p = loop.pts.map(q => ({ x: q.x - origin.x, y: q.y - origin.y }));
    const ccw = area(p) > 0; if (asHole ? ccw : !ccw) p = p.slice().reverse();
    S2.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) S2.lineTo(p[i].x, p[i].y); S2.closePath(); return S2;
  }
  function addMesh(geo) { const m = new T.Mesh(geo, MAT()); root.add(m); const ed = new T.LineSegments(new T.EdgesGeometry(geo, 25), new T.LineBasicMaterial({ color: 0x0b1a2a, transparent: true, opacity: 0.55 })); root.add(ed); }
  let lastPlan = null, lastKey = '';
  function build(pl) {
    while (root.children.length) { const c = root.children.pop(); c.geometry && c.geometry.dispose(); }
    const segN = pl.holes.length > 300 ? 10 : pl.holes.length > 60 ? 24 : 72;
    if (pl.kind === 'stack') {
      const F = stackFrame(pl), M = pl.mode === 'B';
      const shp = (loop, hole) => { const S2 = hole ? new T.Path() : new T.Shape(); if (loop.circle) { const c = F.map(loop.circle.c); S2.absarc(c.x, c.y, loop.circle.r, 0, Math.PI * 2, !!hole); return S2; } let pp = loop.pts.map(F.map); const ccw = area(pp) > 0; if (hole ? ccw : !ccw) pp = pp.slice().reverse(); S2.moveTo(pp[0].x, pp[0].y); for (let i = 1; i < pp.length; i++) S2.lineTo(pp[i].x, pp[i].y); S2.closePath(); return S2; };
      const place = (geo, z0) => { if (M) { const m = new T.Matrix4(); m.set(0, 0, 1, F.axis0 + z0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1); geo.applyMatrix4(m); } else geo.translate(0, 0, z0); return geo; };
      const cuts = new Set(); for (const h of pl.holes) { cuts.add(h.z0); cuts.add(h.z1); }
      for (const g of pl.segs) {
        const bnd = [g.z, ...[...cuts].filter(z => z > g.z + 1e-6 && z < g.z + g.L - 1e-6).sort((a, b) => a - b), g.z + g.L];
        for (let k = 0; k < bnd.length - 1; k++) {
          const z0 = bnd[k], z1 = bnd[k + 1], zm = (z0 + z1) / 2, act = pl.holes.filter(h => h.z0 <= zm && h.z1 >= zm);
          if (g.cone) {
            const f = z => g.cone.rA + (g.cone.rB - g.cone.rA) * (z - g.z) / g.L, bore = act.filter(h => h.loop.circle && Math.hypot(h.loop.circle.c.x - g.cone.c.x, h.loop.circle.c.y - g.cone.c.y) < pl.tol * 4).map(h => h.loop.circle.r);
            const rb = bore.length ? Math.max(...bore) : 0, v = [new T.Vector2(rb, 0), new T.Vector2(f(z0), 0), new T.Vector2(f(z1), z1 - z0), new T.Vector2(rb, z1 - z0), new T.Vector2(rb, 0)];
            const geo = new T.LatheGeometry(v, 72); geo.rotateX(Math.PI / 2); const c = F.map(g.cone.c); geo.translate(c.x, c.y, 0); addMesh(place(geo, z0));
          } else {
            const sh = shp(g.loop, false);
            for (const h of act) { const hb = h.loop.bb, lb = g.loop.bb; if (hb.x0 > lb.x0 && hb.x1 < lb.x1 && hb.y0 > lb.y0 && hb.y1 < lb.y1) sh.holes.push(shp(h.loop, true)); }
            addMesh(place(new T.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: segN }), z0));
          }
        }
      }
      return {};
    }
    if (pl.kind === 'parts') {
      let x = 0;
      pl.parts.forEach((pt, i) => {
        if (i) x += pl.parts[i - 1].D / 2 + pt.D / 2 + Math.max(15, pt.D * 0.3); pt.x = x;
        for (const poly of pt.polys) {
          const v = poly.map(q => new T.Vector2(Math.max(0, q.r), q.u)); v.push(v[0].clone());
          const g = new T.LatheGeometry(v, 96); g.rotateX(Math.PI / 2); g.translate(x, 0, 0);
          const m = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x6f9fd0, metalness: 0.25, roughness: 0.55, side: T.DoubleSide })); root.add(m);
        }
      });
      return {};
    }
    if (pl.kind === 'intersect' || pl.kind === 'tri' || pl.kind === 'extrev') {
      if (!occR) {
        stEl.innerHTML += '<br><span class="i">정밀 계산 엔진을 받는 중입니다 (처음 한 번, 약 6MB)…</span>';
        ensureOCC().then(() => rebuild(true)).catch(e => { stEl.innerHTML += '<br><span class="e">정밀 엔진을 받지 못했습니다: ' + e.message + '</span>'; });
        return { waiting: true };
      }
      const m = solidFor(occR, pl).mesh({ tolerance: 0.05, angularTolerance: 0.25 });
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(m.vertices, 3));
      if (m.normals && m.normals.length === m.vertices.length) g.setAttribute('normal', new T.Float32BufferAttribute(m.normals, 3)); g.setIndex(m.triangles); if (!g.attributes.normal) g.computeVertexNormals();
      addMesh(g); return {};
    }
    if (pl.kind === 'extrude') {
      const o = { x: (pl.front.bb.x0 + pl.front.bb.x1) / 2, y: (pl.front.bb.y0 + pl.front.bb.y1) / 2 };
      const sh = shapeFrom(pl.front, o, false); for (const h of pl.holes) sh.holes.push(shapeFrom(h, o, true));
      addMesh(new T.ExtrudeGeometry(sh, { depth: pl.t, bevelEnabled: false, curveSegments: segN }));
      return { o };
    }
    const o = pl.fc;
    for (const s of pl.segs) {
      if (Math.abs(s.rA - s.rB) <= pl.tol) {
        const r = (s.rA + s.rB) / 2, sh = new T.Shape(); sh.absarc(0, 0, r, 0, Math.PI * 2, false);
        if (pl.bore > 0) { const b = new T.Path(); b.absarc(0, 0, pl.bore, 0, Math.PI * 2, true); sh.holes.push(b); }
        for (const h of pl.holes) { const hb = h.bb, cx = (hb.x0 + hb.x1) / 2 - o.x, cy = (hb.y0 + hb.y1) / 2 - o.y, hr = Math.max(hb.w, hb.h) / 2, d = Math.hypot(cx, cy); if (d + hr < r - pl.tol && d - hr > pl.bore + pl.tol) sh.holes.push(shapeFrom(h, o, true)); }
        const g = new T.ExtrudeGeometry(sh, { depth: s.L, bevelEnabled: false, curveSegments: segN }); g.translate(0, 0, s.z); addMesh(g);
      } else {
        const rb = pl.bore, pts = [new T.Vector2(rb, 0), new T.Vector2(s.rA, 0), new T.Vector2(s.rB, s.L), new T.Vector2(rb, s.L), new T.Vector2(rb, 0)];
        const g = new T.LatheGeometry(pts, 96); g.rotateX(Math.PI / 2); g.translate(0, 0, s.z); addMesh(g);
      }
    }
    return { o };
  }
  function status(pl) {
    const L = [];
    if (pl.kind === 'extrude') L.push(`<span class="ok">돌출</span> <span class="i">· 두께 ${fmt3(pl.t)} (${pl.tSrc}) · 구멍 ${pl.holes.length}개</span>`);
    else if (pl.kind === 'stack') L.push(`<span class="ok">단면 쌓기</span> <span class="i">· 길이 ${fmt3(pl.total)} · 구간 ${pl.segs.length}개 (${pl.desc}) · 구멍 ${pl.holes.length}개</span>`);
    else if (pl.kind === 'parts') { L.push(`<span class="ok">단면도 → 회전체 ${pl.parts.length}개</span>`); pl.parts.forEach((pt, i) => L.push(`<span class="i">· 부품 ${i + 1}: Ø${fmt3(pt.D)} × ${fmt3(pt.L)} (${pt.src}${pt.regs ? ' ' + pt.regs.length + '곳' : ''})</span>`)); }
    else if (pl.kind === 'extrev') L.push(`<span class="ok">돌출 ∩ 회전 (정밀)</span> <span class="i">· 두께 ${fmt3(pl.t)} · 구멍 ${pl.holes.length}개</span>`);
    else if (pl.kind === 'tri') L.push(`<span class="ok">3면 교차 (정밀)</span> <span class="i">· 너비 ${fmt3(pl.front.bb.w)} · 높이 ${fmt3(pl.front.bb.h)} · 깊이 ${fmt3(pl.t)}${pl.zones ? ' · 단면도 사용' : ''} · 구멍 ${pl.sideHoles.length + pl.topHoles.length}개</span>`);
    else if (pl.kind === 'intersect') L.push(`<span class="ok">2면 교차 (정밀)</span> <span class="i">· 너비 ${fmt3(pl.front.bb.w)} · 높이 ${fmt3(pl.front.bb.h)} · 깊이 ${fmt3(pl.t)} · 정면 구멍 ${pl.holes.length}개${pl.sideHoles.length ? ' · 측면 구멍 ' + pl.sideHoles.length + '개' : ''}</span>`);
    else L.push(`<span class="ok">회전체</span> <span class="i">· 외경 Ø${fmt3(pl.front.circle.r * 2)} · 길이 ${fmt3(pl.total)} · 구간 ${pl.segs.length}개${pl.bore ? ' · 보어 Ø' + fmt3(pl.bore * 2) : ''} · 구멍 ${pl.holes.length}개</span>`);
    try { if (sel.size) L.push(`<span class="i">· 선택한 도형 ${sel.size}개만으로 만들었습니다 (Esc로 선택 해제하면 전체)</span>`); } catch (_) { }
    for (const w of pl.warn) L.push(`<span class="w">⚠ ${w}</span>`);
    for (const i of pl.info) L.push(`<span class="i">· ${i}</span>`);
    stEl.innerHTML = L.join('<br>');
  }
  function rebuild(force) {
    if (!T || mode === '2d') return;
    let pl;
    try { pl = plan(); } catch (err) { stEl.innerHTML = `<span class="e">3D로 바꾸지 못했습니다: ${err.message}</span>`; return; }
    if (pl.empty) { while (root.children.length) root.children.pop(); emptyEl.style.display = ''; stEl.textContent = ''; lastPlan = null; draw3(); return; }
    emptyEl.style.display = 'none';
    const key = pl.kind === 'tri' ? JSON.stringify(['tri', pl.front.bb, pl.side.bb, pl.top.bb, pl.secs.length, pl.zones, !!occR, srcEnts().length]) : pl.kind === 'stack' ? JSON.stringify(['stack', pl.mode, pl.total, pl.segs.map(g => [g.z, g.L, g.cone ? [g.cone.rA, g.cone.rB] : g.loop.bb]), pl.holes.map(h => [h.loop.bb, h.z0, h.z1])]) : pl.kind === 'parts' ? JSON.stringify(['parts', pl.parts.map(p => [p.D, p.L, p.polys.length])]) : JSON.stringify([pl.kind, pl.t, pl.segs, pl.bore, pl.front.pts.length, pl.front.bb, pl.holes.map(h => h.bb), pl.side && pl.side.pts.length, pl.side && pl.side.bb, !!occR]);
    const first = !lastPlan;
    lastPlan = pl; status(pl);
    if (key === lastKey && !force) return; lastKey = key;
    const b = build(pl); if (b && b.waiting) { lastKey = ''; draw3(); return; } if (first || force) fit3(); else centerModel(); draw3();
  }
  LAB.rebuild = rebuild; LAB.plan = () => plan();
  let selSig = ''; setInterval(() => { if (mode === '2d' || !T) return; let sg = ''; try { sg = sel.size + ':' + [...sel].slice(0, 50).join(','); } catch (_) { } if (sg !== selSig) { selSig = sg; rebuild(true); } }, 600);

  // 2D가 바뀌면 3D도 다시 (0.25초 모아서)
  let tmr = 0;
  const _changed = changed;
  changed = function () { const r = _changed.apply(this, arguments); if (mode !== '2d') { clearTimeout(tmr); tmr = setTimeout(() => rebuild(false), 250); } return r; };

  /* ---------------- 저장: STL ---------------- */
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  function baseName() { const t = (document.title || 'mucca').replace(/\s*[-|·].*$/, '').trim(); return (window.__docName || t || 'mucca').replace(/[\\/:*?"<>|]/g, '_'); }
  pane.querySelector('#l3stl').onclick = async () => {
    await ensure3D(); if (!lastPlan) { log('3D로 만들 윤곽이 없습니다', 'err'); return; }
    const tris = [];
    root.traverse(o => { if (!o.isMesh) return; const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry; const p = g.attributes.position; for (let i = 0; i < p.count; i++) tris.push(p.getX(i), p.getY(i), p.getZ(i)); });
    const n = tris.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf); dv.setUint32(80, n, true);
    for (let i = 0; i < n; i++) { const o = 84 + i * 50; for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, tris[i * 9 + k], true); }
    download(new Blob([buf], { type: 'model/stl' }), baseName() + '.stl'); log('STL 저장: 삼각형 ' + n + '개', 'ok');
  };

  /* ---------------- 저장: STEP (OpenCascade는 이때만 받음) ---------------- */
  let occP = null, occR = null;
  function ensureOCC() {
    if (!occP) {
      const t0 = performance.now();
      occP = Promise.all([import(new URL('replicad-lab.mjs?v=1', location.href).href), import(OCC_BASE + 'replicad_single.js')]).then(async ([R, M]) => {
        const oc = await M.default({ locateFile: () => OCC_BASE + 'replicad_single.wasm' }); R.setOC(oc); occR = R; LAB.occMs = Math.round(performance.now() - t0); return R;
      });
      occP.catch(() => { occP = null; });
    }
    return occP;
  }
  const stepBtn = pane.querySelector('#l3step');
  stepBtn.addEventListener('pointerenter', () => { ensureOCC().catch(() => { }); }, { once: true });
  // 닫힌 꼭짓점 목록 → 그림: 꺾이는 곳(20° 넘게)은 직선 꼭짓점, 그 사이 완만한 점들은 매끈한 곡선 하나로
  //  (점으로 쪼갠 곡선을 그대로 돌출하면 작은 평면 수십 개가 생겨 2D로 다시 뽑을 때 없는 선이 잔뜩 생김)
  function polyDraw(R, pp, opt) {
    const xy = q => [q[0], q[1]];
    const lines = () => { let d = R.draw(xy(pp[0])); for (let i = 1; i < pp.length; i++) d = d.lineTo(xy(pp[i])); return d.close(); };
    if (!LAB.smooth || pp.length < 6 || !R.drawPointsInterpolation || !R.Blueprint) return lines();
    try {
      const P = pp.slice(); if (Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-9) P.pop();
      const n = P.length, turn = i => { const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]]; return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI; };
      const kt = opt && opt.keyTurn || 0; const corner = P.map((q, i) => { const a = turn(i); return a > 20 || (!!q[2] && a >= kt); });
      let st = corner.indexOf(true); if (st < 0) return R.drawPointsInterpolation(P.concat([P[0]]).map(xy), {}, { closeShape: true });
      const curves = []; let i = st;
      do { let j = (i + 1) % n; const run = [P[i]]; while (!corner[j]) { run.push(P[j]); j = (j + 1) % n; } run.push(P[j]);
        // 거의 곧은 구간(현에서 0.4% 이내)은 직선 하나로
        const A = run[0], B = run[run.length - 1], ch = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
        const dev = Math.max(...run.map(q => Math.abs((q[0] - A[0]) * (B[1] - A[1]) - (q[1] - A[1]) * (B[0] - A[0])) / ch));
        if (run.length > 2 && dev < ch * 0.004) curves.push(...R.draw(xy(A)).lineTo(xy(B)).done().blueprint.curves);
        else if (run.length <= 3) for (let k = 0; k < run.length - 1; k++) curves.push(...R.draw(xy(run[k])).lineTo(xy(run[k + 1])).done().blueprint.curves);
        else curves.push(...R.drawPointsInterpolation(run.map(xy)).blueprint.curves);
        i = j; } while (i !== st);
      return new R.Drawing(new R.Blueprint(curves));
    } catch (_) { return lines(); }
  }
  LAB.smooth = true;
  // 모따기 원뿔로 깎기: 끝면에서 반지름 rc, 깊이 d 에서 모서리 반지름 Rc 에 닿음 (축 = Z, 길이 0~t)
  function chamferCut(R, s, ch, t, o, alongX) {
    const z0 = ch.z0 || 0, z1 = ch.z1 == null ? t : ch.z1, Rb = Math.max(ch.Rc * 1.3, ch.Rbig || 0), kL = ch.dL ? (ch.Rc - ch.rc) / ch.dL : 0, kR = ch.dR ? (ch.Rc - ch.rc) / ch.dR : 0;
    let eL = ch.dL ? z0 + (Rb - ch.rc) / kL : z0, eR = ch.dR ? z1 - (Rb - ch.rc) / kR : z1;
    if (eL > eR) { const m = (eL + eR) / 2; eL = eR = m; }
    const pts = [[0, -1], [Rb, -1]];
    if (ch.dL) pts.push([Rb, z0], [ch.rc, z0], [Rb, eL]); 
    if (ch.dR) pts.push([Rb, eR], [ch.rc, z1], [Rb, z1]);
    pts.push([Rb, t + 1], [0, t + 1]);
    const P2 = []; for (const q of pts) { const l = P2[P2.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-7) P2.push(q); }
    let d = R.draw(P2[0]); for (let i = 1; i < P2.length; i++) d = d.lineTo(P2[i]);
    try { let cone = d.close().sketchOnPlane('XZ').revolve(); cone = alongX ? cone.rotate(90, [0, 0, 0], [0, 1, 0]).translate(alongX) : cone.translate([ch.c.x - o.x, ch.c.y - o.y, 0]); return s.intersect(cone); } catch (e) { LAB._chErr = String(e && e.message || e); return s; }
  }
  function rDraw(R, loop, o) {
    if (loop.circle) return R.drawCircle(loop.circle.r).translate(loop.circle.c.x - o.x, loop.circle.c.y - o.y);
    return polyDraw(R, loop.pts.map(p => [p.x - o.x, p.y - o.y, p.key]));
  }
  // 구멍은 하나씩 뚫지 않고 한꺼번에 (1,000개도 몇 초)
  function holeTools(R, holes, o, z0, len) { return holes.map(h => h.circle ? R.makeCylinder(h.circle.r, len, [h.circle.c.x - o.x, h.circle.c.y - o.y, z0], [0, 0, 1]) : rDraw(R, h, o).sketchOnPlane('XY', z0).extrude(len)); }
  // 겹치는 도구(보어+모따기 등)를 한 묶음으로 빼면 일부가 안 빠지는 경우가 있어, 적으면 하나씩 뺌
  function cutAll(R, s, tools) { if (!tools.length) return s; if (tools.length <= 12) { for (const t of tools) s = s.cut(t); return s; } return s.cut(R.makeCompound(tools)); }
  function solidFor(R, pl) {
    if (pl.kind === 'tri') {
      const o = { x: (pl.front.bb.x0 + pl.front.bb.x1) / 2, y: (pl.front.bb.y0 + pl.front.bb.y1) / 2 }, W = pl.front.bb, D = pl.side.bb.w, sb = pl.side.bb, tb = pl.top.bb;
      const poly = (pts, f) => polyDraw(R, pts.map(q => { const r = f(q); r[2] = q.key; return r; }));
      const drawL = (L, f) => L.circle ? (() => { const c = f(L.circle.c); return R.drawCircle(L.circle.r).translate(c[0], c[1]); })() : poly(L.pts, f);
      const mir = (A, q) => { const u = (q.x - A.a.x) * A.d.x + (q.y - A.a.y) * A.d.y, w = (q.x - A.a.x) * -A.d.y + (q.y - A.a.y) * A.d.x; return { x: A.a.x + A.d.x * u + A.d.y * w, y: A.a.y + A.d.y * u - A.d.x * w }; };
      const mirL = (A, L) => L.circle ? { circle: { c: mir(A, L.circle.c), r: L.circle.r } } : { pts: L.pts.map(q => mir(A, q)) };
      // 반쪽 뷰면 중심선이 깊이 0 (대칭면)
      const sZ0 = pl.side.half && Math.abs(pl.side.half.d.y) > 0.5 ? pl.side.half.a.x : sb.x0;
      const tZ0 = pl.top.half && Math.abs(pl.top.half.d.x) > 0.5 ? pl.top.half.a.y : (pl.below ? tb.y1 : tb.y0);
      const fF = q => [q.x - o.x, q.y - o.y], fS = q => [q.y - o.y, q.x - sZ0], fT = q => [q.x - o.x, pl.below ? tZ0 - q.y : q.y - tZ0];
      const both = (L, f, A) => { let d = drawL(L, f); if (A) d = d.fuse(drawL(mirL(A, L), f)); return d; };
      const zs = pl.side.pts.map(q => q.x - sZ0), zMin = pl.side.half ? -Math.max(...zs.map(Math.abs)) : Math.min(...zs), zMax = Math.max(...zs.map(z => pl.side.half ? Math.abs(z) : z));
      const F = drawL(pl.front, fF).sketchOnPlane('XY', zMin - 1).extrude(zMax - zMin + 2);
      let sd = both(pl.side, fS, pl.side.half); for (const h of pl.sideHoles) sd = sd.cut(both(h, fS, pl.side.half));
      const S = sd.sketchOnPlane('YZ', W.x0 - o.x - 1).extrude(W.w + 2);
      const yTop = W.y1 - o.y + 1, H = W.h + 2;
      const onXZ = d => { let x = d.sketchOnPlane('XZ', -yTop).extrude(H); const b = x.boundingBox.bounds; if (b[1][1] < yTop - H / 2) return x; return x; };
      // 윗면(단면) 구멍은 2D 그림에서 빼지 않고 3D 원기둥으로 한 번에 뚫음 (2D 빼기는 그림이 여러 벌로 겹쳐 구멍이 메워지는 경우가 있음)
      const td = both(pl.top, fT, pl.top.half);
      let T = onXZ(td);
      const topTools = [];
      for (const h of pl.topHoles) for (const L of pl.top.half ? [h, mirL(pl.top.half, h)] : [h]) {
        if (L.circle) { const c = fT(L.circle.c); topTools.push(R.makeCylinder(L.circle.r, H + 2, [c[0], W.y0 - o.y - 2, c[1]], [0, 1, 0])); }
        else topTools.push(onXZ(drawL(L, fT)));
      }
      const box = (y0, y1) => R.makeBox([W.x0 - o.x - 5, y0 - o.y, zMin - 5], [W.x1 - o.x + 5, y1 - o.y, zMax + 5]);
      const FS = F.intersect(S); let s = FS.intersect(T);
      if (pl.zones && pl.secs.length) {
        let sec = null; for (const sc of pl.secs) { let d = poly(sc.pts, fT); if (pl.top.half) d = d.fuse(poly(sc.pts.map(q => mir(pl.top.half, q)), fT)); sec = sec ? sec.fuse(d) : d; }
        const SEC = onXZ(sec);
        const base = s.intersect(box(W.y0 - 1, pl.zones.baseTop));
        const sup = FS.intersect(box(pl.zones.baseTop, pl.zones.bossBot)).intersect(SEC);
        let boss = s.intersect(box(pl.zones.bossBot, W.y1 + 1));
        if (pl.bore && pl.bore.outer) {
          // 몸통 = 정면도 바깥 윤곽을 축으로 돌린 회전체 ∩ 측면도 ∩ 윗면(단면)
          const yc = pl.bore.y - o.y, op = pl.bore.outer; let d = R.draw([op[0].x - o.x, yc]); for (const q of op) d = d.lineTo([q.x - o.x, yc + q.r]); d = d.lineTo([op[op.length - 1].x - o.x, yc]);
          const REV = d.close().sketchOnPlane('XY').revolve([1, 0, 0], { origin: [0, yc, 0] });
          boss = REV.intersect(S).intersect(T).intersect(box(pl.zones.bossBot, W.y1 + 1));
        }
        s = base.fuse(sup).fuse(boss);
      }
      s = cutAll(R, s, topTools);
      if (pl.bore) {
        const yc = pl.bore.y - o.y; let cut = null;
        for (const g of pl.bore.segs) { const c = R.makeCylinder(g.r, g.x1 - g.x0, [g.x0 - o.x, yc, 0], [1, 0, 0]); cut = cut ? cut.fuse(c) : c; }
        if (cut) s = s.cut(cut);
      }
      return s;
    }
    if (pl.kind === 'stack') {
      const F = stackFrame(pl), M = pl.mode === 'B', PL = M ? 'YZ' : 'XY', off = z => (M ? F.axis0 : 0) + z;
      const dm = loop => { if (loop.circle) { const c = F.map(loop.circle.c); return R.drawCircle(loop.circle.r).translate(c.x, c.y); } return polyDraw(R, loop.pts.map(q => { const m = F.map(q); return [m.x, m.y, q.key]; })); };
      let s = null;
      // 다각형 단면(육각 등)이 원뿔 구간과 붙어 있으면 그 원뿔 구간까지 늘려 겹침 (원뿔 면과 만나는 곡선 모서리)
      const segs2 = pl.segs.map(g => Object.assign({}, g));
      for (let i = 0; i < segs2.length; i++) { const g = segs2[i]; if (!g.loop || g.loop.circle) continue;
        const cr = Math.max(...g.loop.pts.map(q => Math.hypot(q.x - (g.loop.bb.x0 + g.loop.bb.x1) / 2, q.y - (g.loop.bb.y0 + g.loop.bb.y1) / 2)));
        let j = i + 1; while (j < segs2.length && segs2[j].cone && Math.max(segs2[j].cone.rA, segs2[j].cone.rB) >= cr * 0.98) { g.L = segs2[j].z + segs2[j].L - g.z; j++; if (Math.max(segs2[j - 1].cone.rA, segs2[j - 1].cone.rB) >= cr) break; }
        j = i - 1; while (j >= 0 && segs2[j].cone && Math.max(segs2[j].cone.rA, segs2[j].cone.rB) >= cr * 0.98) { const e = g.z + g.L; g.z = segs2[j].z; g.L = e - g.z; j--; if (Math.max(segs2[j + 1].cone.rA, segs2[j + 1].cone.rB) >= cr) break; } }
      // 같은 중심의 둥근 구간(원·원뿔)이 이어지면 측면 윤곽 하나로 매끈하게 돌림 (둥근 테두리에 구간 경계선이 안 생기게)
      const roundC = g => g.cone ? g.cone.c : (g.loop && g.loop.circle ? g.loop.circle.c : null), rr = g => g.cone ? [g.cone.rA, g.cone.rB] : [g.loop.circle.r, g.loop.circle.r];
      const runs = []; for (const g of segs2) { const c = roundC(g), last = runs[runs.length - 1]; if (c && last && last.c && Math.hypot(last.c.x - c.x, last.c.y - c.y) <= pl.tol * 4 && Math.abs(last.z1 - g.z) <= pl.tol) { last.segs.push(g); last.z1 = g.z + g.L; } else runs.push({ c, segs: [g], z0: g.z, z1: g.z + g.L }); }
      for (const run of runs) {
        if (!run.c || run.segs.length < 2 || !LAB.smooth) continue;
        try {
          const pr = [[0, run.z0, true]]; for (const g of run.segs) { const [a, b] = rr(g); pr.push([a, g.z], [b, g.z + g.L]); } pr.push([0, run.z1, true]);
          const P2 = []; for (const q of pr) { const l = P2[P2.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > pl.tol * 0.05) P2.push(q); }
          P2[1][2] = true; P2[P2.length - 2][2] = true;
          let part = polyDraw(R, P2, { keyTurn: 3 }).sketchOnPlane('XZ').revolve(); const c = F.map(run.c);
          part = M ? part.rotate(90, [0, 0, 0], [0, 1, 0]).translate([F.axis0, c.x, c.y]) : part.translate([c.x, c.y, 0]);
          s = s ? s.fuse(part) : part; run.done = true;
        } catch (_) { }
      }
      const doneSegs = new Set(runs.filter(r => r.done).flatMap(r => r.segs));
      for (const g of segs2) {
        if (doneSegs.has(g)) continue;
        let part;
        if (g.cone) { const c = F.map(g.cone.c); part = R.drawCircle(Math.max(g.cone.rA, 1e-3)).translate(c.x, c.y).sketchOnPlane(PL, off(g.z)).loftWith(R.drawCircle(Math.max(g.cone.rB, 1e-3)).translate(c.x, c.y).sketchOnPlane(PL, off(g.z + g.L))); }
        else part = dm(g.loop).sketchOnPlane(PL, off(g.z)).extrude(g.L);
        s = s ? s.fuse(part) : part;
      }
      const tools = pl.holes.map(h => { const z0 = h.z0 <= 1e-6 ? -1 : h.z0, z1 = h.z1 >= pl.total - 1e-6 ? pl.total + 1 : h.z1;
        if (h.loop.circle) { const c = F.map(h.loop.circle.c); return M ? R.makeCylinder(h.loop.circle.r, z1 - z0, [off(z0), c.x, c.y], [1, 0, 0]) : R.makeCylinder(h.loop.circle.r, z1 - z0, [c.x, c.y, z0], [0, 0, 1]); }
        return dm(h.loop).sketchOnPlane(PL, off(z0)).extrude(z1 - z0); });
      if (pl.chamfer && !M) s = chamferCut(R, s, pl.chamfer, pl.total, F.o);
      else if (pl.chamfer && M) { const c3 = F.map(pl.chamfer.c); s = chamferCut(R, s, Object.assign({}, pl.chamfer, { c: { x: 0, y: 0 } }), pl.total, { x: 0, y: 0 }, [F.axis0, c3.x, c3.y]); }
      return cutAll(R, s, tools);
    }
    if (pl.kind === 'parts') {
      const out = pl.parts.map(pt => { let s = null; for (const poly of pt.polys) { let d = R.draw([Math.max(0, poly[0].r), poly[0].u]); for (let i = 1; i < poly.length; i++) d = d.lineTo([Math.max(0, poly[i].r), poly[i].u]); const sol = d.close().sketchOnPlane('XZ').revolve(); s = s ? s.fuse(sol) : sol; } return s.translate([pt.x || 0, 0, 0]); });
      return out.length === 1 ? out[0] : R.makeCompound(out);
    }
    if (pl.kind === 'extrev') {
      const o = { x: (pl.front.bb.x0 + pl.front.bb.x1) / 2, y: (pl.front.bb.y0 + pl.front.bb.y1) / 2 };
      let s = rDraw(R, pl.front, o).sketchOnPlane().extrude(pl.t);
      const pr = []; for (const q of pl.prof) { const l = pr[pr.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > pl.tol * 0.05) pr.push(q.slice()); else if (q[2]) l[2] = true; }
      try { const rv = polyDraw(R, pr, { keyTurn: 3 }).sketchOnPlane('XZ').revolve().translate([pl.c.x - o.x, pl.c.y - o.y, 0]); s = s.intersect(rv); } catch (_) { }
      return cutAll(R, s, holeTools(R, pl.holes, o, -1, pl.t + 2));
    }
    if (pl.kind === 'extrude' || pl.kind === 'intersect') {
      const o = { x: (pl.front.bb.x0 + pl.front.bb.x1) / 2, y: (pl.front.bb.y0 + pl.front.bb.y1) / 2 };
      let s = pl.twist ? rDraw(R, pl.front, o).sketchOnPlane().extrude(pl.t, { twistAngle: pl.twist * (LAB.twistSign || 1) }) : rDraw(R, pl.front, o).sketchOnPlane().extrude(pl.t);
      if (pl.chamfer) s = chamferCut(R, s, pl.chamfer, pl.t, o);
      s = cutAll(R, s, holeTools(R, pl.holes, o, -1, pl.t + 2));
      if (pl.kind === 'intersect') {
        // 측면도: (높이, 깊이) → YZ 평면, 너비 방향(X)으로 돌출
        const sb = pl.side.bb, toYZ = q => [q.y - o.y, q.x - sb.x0];
        const sd = loop => { if (loop.circle) return R.drawCircle(loop.circle.r).translate(loop.circle.c.y - o.y, loop.circle.c.x - sb.x0); return polyDraw(R, loop.pts.map(q => { const r = toYZ(q); r[2] = q.key; return r; })); };
        let d = sd(pl.side); for (const h of pl.sideHoles) d = d.cut(sd(h));
        const W = pl.front.bb, sideSolid = d.sketchOnPlane('YZ', W.x0 - o.x - 1).extrude(W.w + 2);
        s = s.intersect(sideSolid);
      }
      return s;
    }
    const o = pl.fc; let s = null;
    // 측면도 반쪽 윤곽을 그대로 한 번에 돌림 (둥근 머리·모따기가 매끈한 면 하나로 → 구간마다 생기던 원 모양 경계선 없음)
    if (LAB.smooth) {
      try {
        if (!pl.prof) throw new Error('no profile');
        const pr = []; for (const q of pl.prof) { const l = pr[pr.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > pl.tol * 0.05) pr.push(q.slice()); else if (q[2]) l[2] = true; }
        s = polyDraw(R, pr).sketchOnPlane('XZ').revolve(); LAB._revErr = null;
      } catch (e) { s = null; LAB._revErr = String(e && e.message || e); }
    }
    if (!s) for (const g of pl.segs) {
      let part;
      if (Math.abs(g.rA - g.rB) <= pl.tol) part = R.drawCircle((g.rA + g.rB) / 2).sketchOnPlane('XY', g.z).extrude(g.L);
      else part = R.drawCircle(Math.max(g.rA, 1e-3)).sketchOnPlane('XY', g.z).loftWith(R.drawCircle(Math.max(g.rB, 1e-3)).sketchOnPlane('XY', g.z + g.L));
      s = s ? s.fuse(part) : part;
    }
    const len = pl.total + 2, tools = holeTools(R, pl.holes.filter(h => h.z0 == null), o, -1, len);
    for (const h of pl.holes.filter(h => h.z0 != null)) { const z0 = h.z0 <= Math.max(pl.tol * 4, pl.total * 0.03) ? -1 : h.z0, z1 = h.z1 >= pl.total - Math.max(pl.tol * 4, pl.total * 0.03) ? pl.total + 1 : h.z1; tools.push(...holeTools(R, [h], o, z0, z1 - z0)); }
    if (pl.bore > 0) tools.push(R.makeCylinder(pl.bore, len, [0, 0, -1], [0, 0, 1]));
    if (pl.bore > 0 && pl.boreCh > 0) { const b = pl.bore, c = pl.boreCh, L0 = pl.total;
      for (const pts of [[[0, -1], [b + c + 1, -1], [b, c], [0, c]], [[0, L0 + 1], [b + c + 1, L0 + 1], [b, L0 - c], [0, L0 - c]]]) { let d = R.draw(pts[0]); for (let i = 1; i < pts.length; i++) d = d.lineTo(pts[i]); try { tools.push(d.close().sketchOnPlane('XZ').revolve()); } catch (e) { LAB._chErr = String(e && e.message || e); } } }
    const endT = Math.max(pl.tol * 4, pl.total * 0.03);
    for (const q of pl.steps || []) { const z0 = q.z0 <= endT ? -1 : q.z0, z1 = q.z1 >= pl.total - endT ? pl.total + 1 : q.z1; tools.push(R.makeCylinder(q.r, z1 - z0, [0, 0, z0], [0, 0, 1])); }
    if (pl.balls) {
      const b = pl.balls;
      try {
        const L0 = pl.total, dO = b.routC - b.rout, dI = b.rin - b.rinC;
        const gp = [[b.rinC, -0.001], [b.routC, -0.001], [b.rout, dO], [b.rout, L0 - dO], [b.routC, L0 + 0.001], [b.rinC, L0 + 0.001], [b.rin, L0 - dI], [b.rin, dI]];
        let gd = R.draw(gp[0]); for (let i = 1; i < gp.length; i++) gd = gd.lineTo(gp[i]);
        let ring = gd.close().sketchOnPlane('XZ').revolve();
        const groove = R.drawCircle(b.rb * 1.02).translate(b.Rp, b.zb).sketchOnPlane('XZ').revolve();
        let out = cutAll(R, s, tools).cut(ring).cut(groove);
        const sph = b.centers.map(c => R.makeSphere(b.rb).translate([c.x, c.y, b.zb]));
        out = out.fuse(sph.length === 1 ? sph[0] : R.makeCompound(sph));
        return out;
      } catch (e) { LAB._ballErr = String(e && e.message || e); }
    }
    return cutAll(R, s, tools);
  }
  // 같은 평면·같은 원통으로 나뉜 면을 하나로 합침 (구간을 나눠 만든 3D에 생기는 쓸데없는 경계선 정리 → 2D로 다시 뽑았을 때 없는 선이 안 생김)
  function tidy(s) { try { const t = s && s.simplify ? s.simplify() : s; return t || s; } catch (_) { return s; } }
  LAB.tidy = true;
  const volOf = (R, s) => { try { return R.measureVolume ? R.measureVolume(s) : null; } catch (_) { return null; } };
  async function makeSolid(R, pl) {
    let s = solidFor(R, pl);
    // 매끈한 곡선으로 만든 교차(불리언)가 실패하면(부피가 크게 다름) 꺾은선 방식으로 다시
    if (LAB.smooth && (pl.kind === 'intersect' || pl.kind === 'tri' || pl.kind === 'extrev')) {
      const v1 = volOf(R, s); if (pl.kind === 'extrev' && v1 > 0) return LAB.tidy ? tidy(s) : s; LAB.smooth = false; let s2 = null; try { s2 = solidFor(R, pl); } catch (_) { } LAB.smooth = true;
      const v2 = s2 ? volOf(R, s2) : null;
      if (s2 && v2 && (!v1 || v1 <= 0 || Math.abs(v1 - v2) / v2 > 0.1)) s = s2;
    }
    return LAB.tidy ? tidy(s) : s;
  }
  stepBtn.onclick = async () => {
    if (!lastPlan) { log('3D로 만들 윤곽이 없습니다', 'err'); return; }
    const old = stepBtn.textContent; stepBtn.disabled = true; stepBtn.textContent = occP ? 'STEP 만드는 중…' : '엔진 받는 중…';
    try {
      const t0 = performance.now(); const R = await ensureOCC(); stepBtn.textContent = lastPlan.holes && lastPlan.holes.length > 200 ? `STEP 만드는 중… (구멍 ${lastPlan.holes.length}개, 몇 초 걸립니다)` : 'STEP 만드는 중…'; await new Promise(r => setTimeout(r, 60));
      const solid = await makeSolid(R, lastPlan); const blob = solid.blobSTEP();
      LAB.stepMs = Math.round(performance.now() - t0); LAB.stepBytes = blob.size; LAB.lastStep = blob;
      if (!LAB.noDownload) download(blob, baseName() + '.step');
      log(`STEP 저장 (${(blob.size / 1024).toFixed(0)}KB, ${(LAB.stepMs / 1000).toFixed(1)}초)`, 'ok');
    } catch (err) { log('STEP을 만들지 못했습니다: ' + (err && err.message || err), 'err'); LAB.stepErr = String(err && err.message || err); }
    finally { stepBtn.disabled = false; stepBtn.textContent = old; }
  };

  /* ---------------- 시작 ---------------- */
  checkAdmin().then(ok => { if (ok && mode !== '2d') setMode(mode); });
  if (mode !== '2d') setMode(mode);
})();
