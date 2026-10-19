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
.v3c canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
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
    <label>형상 <select id="l3kind"><option value="auto">자동</option><option value="extrude">돌출(판재)</option><option value="revolve">회전체</option></select></label>
    <label>두께 <input id="l3t" type="number" min="0.1" step="any" value="10" title="측면도가 없을 때 쓰는 두께(mm)"></label>
    <span class="sp"></span>
    <button class="btn" id="l3stl" title="3D 모양을 STL 파일로 저장">STL</button>
    <button class="btn go" id="l3step" title="편집 가능한 3D 파일(STEP). 처음 한 번 엔진(약 7MB)을 받습니다">STEP 저장</button>
  </div><div class="v3c"><canvas id="l3cv"></canvas><div class="v3e" id="l3empty">2D에 닫힌 윤곽(원·사각형·폴리선)을 그리면 3D가 생깁니다.<br>정면도 오른쪽(또는 위)에 측면도를 그리면 두께·회전체를 알아서 읽습니다.</div><div class="v3s" id="l3st"></div></div>`;
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
  tIn.addEventListener('keydown', e => e.stopPropagation()); kindSel.addEventListener('keydown', e => e.stopPropagation());

  /* ---------------- 3D 엔진 (three.js) 지연 로딩 ---------------- */
  let T = null, loading3 = null;
  function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('불러오기 실패: ' + src)); document.head.appendChild(s); }); }
  function ensure3D() {
    if (T) return Promise.resolve(T);
    if (!loading3) { const t0 = performance.now(); loading3 = loadScript('three-lab.js?v=1').then(() => { T = window.THREE_LAB; LAB.loadMs = Math.round(performance.now() - t0); init3(); return T; }); }
    return loading3;
  }
  // 페이지가 뜨고 2.5초 뒤 쉬는 시간에 미리 받아 둠 (3D 버튼을 처음 눌러도 바로 뜨게)
  setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 1)))(() => ensure3D().catch(() => { })), 2500);

  let renderer, scene, cam, root, cv3, ro3;
  const orb = { th: -0.9, ph: 1.05, r: 300, tx: 0, ty: 0, tz: 0 };
  function init3() {
    cv3 = pane.querySelector('#l3cv');
    renderer = new T.WebGLRenderer({ canvas: cv3, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x0d1014, 1);
    scene = new T.Scene();
    cam = new T.PerspectiveCamera(35, 1, 0.1, 1e6);
    scene.add(new T.HemisphereLight(0xdfe8f5, 0x20262e, 0.9));
    const L1 = new T.DirectionalLight(0xffffff, 1.6); L1.position.set(1, -1.4, 2.2); scene.add(L1);
    const L2 = new T.DirectionalLight(0x9fb7d6, 0.5); L2.position.set(-1.5, 1, -1); scene.add(L2);
    root = new T.Group(); scene.add(root);
    ro3 = new ResizeObserver(resize3); ro3.observe(pane.querySelector('.v3c'));
    let drag = null;
    cv3.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button, th: orb.th, ph: orb.ph, tx: orb.tx, ty: orb.ty, tz: orb.tz }; cv3.setPointerCapture(e.pointerId); cv3.style.cursor = 'grabbing'; });
    cv3.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.b === 0 && !e.shiftKey) { orb.th = drag.th - dx * 0.008; orb.ph = Math.max(0.05, Math.min(Math.PI - 0.05, drag.ph - dy * 0.008)); }
      else {
        const k = orb.r * 0.0016, th = orb.th, ph = orb.ph;
        const rx = -Math.sin(th), ry = Math.cos(th);
        const ux = -Math.cos(ph) * Math.cos(th), uy = -Math.cos(ph) * Math.sin(th), uz = Math.sin(ph);
        orb.tx = drag.tx - (rx * dx - ux * dy) * k; orb.ty = drag.ty - (ry * dx - uy * dy) * k; orb.tz = drag.tz + uz * dy * k;
      }
      draw3();
    });
    const end = e => { drag = null; cv3.style.cursor = 'grab'; };
    cv3.addEventListener('pointerup', end); cv3.addEventListener('pointercancel', end);
    cv3.addEventListener('wheel', e => { e.preventDefault(); orb.r *= Math.exp(e.deltaY * 0.0012); draw3(); }, { passive: false });
    cv3.addEventListener('dblclick', () => { fit3(); draw3(); });
    cv3.addEventListener('contextmenu', e => e.preventDefault());
  }
  function resize3() {
    if (!renderer) return; const c = pane.querySelector('.v3c').getBoundingClientRect();
    const w = Math.max(1, c.width), h = Math.max(1, c.height);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); draw3();
  }
  function draw3() {
    if (!renderer) return;
    const { th, ph, r } = orb;
    cam.up.set(0, 0, 1);
    cam.position.set(orb.tx + r * Math.sin(ph) * Math.cos(th), orb.ty + r * Math.sin(ph) * Math.sin(th), orb.tz + r * Math.cos(ph));
    cam.lookAt(orb.tx, orb.ty, orb.tz); renderer.render(scene, cam);
  }
  function fit3() {
    const bb = new T.Box3().setFromObject(root); if (bb.isEmpty()) return;
    const s = bb.getBoundingSphere(new T.Sphere()); orb.tx = s.center.x; orb.ty = s.center.y; orb.tz = s.center.z;
    orb.r = s.radius / Math.sin(cam.fov * D2R_ / 2) * 1.15;
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
  function collectLoops() {
    let ents = [];
    try { ents = flatEnts(visibleEnts()); } catch (_) { ents = doc.entities.slice(); }
    ents = ents.filter(e => ['line', 'polyline', 'circle', 'arc', 'ellipse'].includes(e.type) && !IGN_LAYERS.has(e.layer) && !(e.lt && IGN_LT.has(String(e.lt).toLowerCase())));
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
      else if (e.type === 'polyline') { const p = plPts(e); const cl = e.closed || (p.length > 2 && Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) <= tol); if (cl) loops.push({ pts: dedupe(p, tol / 10) }); else open.push(p); }
      else if (e.type === 'line') open.push([{ x: e.a.x, y: e.a.y }, { x: e.b.x, y: e.b.y }]);
      else if (e.type === 'arc') open.push(arcPts(e.c, e.r, e.a0, e.a1, 96));
      else if (e.type === 'ellipse') { let a1 = e.a1; while (a1 <= e.a0) a1 += 360; const s = []; for (let i = 0; i <= 48; i++) s.push(ellPt(e, e.a0 + (a1 - e.a0) * i / 48)); open.push(s); }
    }
    // 열린 선·호 이어 붙이기
    const used = new Array(open.length).fill(false), near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
    for (let i = 0; i < open.length; i++) {
      if (used[i]) continue; used[i] = true; let chain = open[i].slice(), grew = true;
      while (grew && !near(chain[0], chain[chain.length - 1])) {
        grew = false;
        for (let j = 0; j < open.length; j++) {
          if (used[j]) continue; const s = open[j], end = chain[chain.length - 1], beg = chain[0];
          if (near(end, s[0])) chain = chain.concat(s.slice(1)); else if (near(end, s[s.length - 1])) chain = chain.concat(s.slice(0, -1).reverse());
          else if (near(beg, s[s.length - 1])) chain = s.slice(0, -1).concat(chain); else if (near(beg, s[0])) chain = s.slice(1).reverse().concat(chain); else continue;
          used[j] = true; grew = true; break;
        }
      }
      if (chain.length > 3 && near(chain[0], chain[chain.length - 1])) loops.push({ pts: dedupe(chain, tol / 10) });
    }
    for (const L of loops) { L.a = Math.abs(area(L.pts)); L.bb = bboxOf(L.pts); }
    // 포함 관계 (가장 작은 바깥 윤곽이 부모)
    const ok = loops.filter(L => L.pts.length >= 3 && L.a > tol * tol);
    ok.sort((a, b) => b.a - a.a);
    for (let i = 0; i < ok.length; i++) {
      const L = ok[i]; L.kids = []; L.parent = null;
      for (let j = i - 1; j >= 0; j--) { const P = ok[j]; if (P.bb.x0 - tol <= L.bb.x0 && P.bb.x1 + tol >= L.bb.x1 && P.bb.y0 - tol <= L.bb.y0 && P.bb.y1 + tol >= L.bb.y1 && inPoly(L.pts[0], P.pts) && P.a > L.a * 1.0001) { L.parent = P; break; } }
    }
    for (const L of ok) if (L.parent) L.parent.kids.push(L);
    return { loops: ok, tol };
  }

  /* ---------------- 정면·측면 판단 → 3D 계획 ---------------- */
  const fmt3 = v => (Math.round(v * 100) / 100).toString();
  function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }
  function plan() {
    const { loops, tol } = collectLoops();
    const tops = loops.filter(L => !L.parent);
    if (!tops.length) return { empty: true };
    const warn = [], info = []; var bigDiff = false;
    // 정면도: 원이 바깥 윤곽이면서 같은 중심의 원이 있는 뷰 우선, 없으면 가장 큰 뷰
    const isRound = L => L.circle && L.kids.some(k => k.circle && Math.hypot(k.circle.c.x - L.circle.c.x, k.circle.c.y - L.circle.c.y) <= tol * 4);
    let front = tops.find(isRound) || tops.find(L => L.circle) || tops[0];
    // 측면도: 정면과 가로(같은 높이) 또는 세로(같은 너비)로 나란한 가장 가까운 뷰
    let sideV = null, dir = null, best = Infinity;
    for (const L of tops) {
      if (L === front) continue;
      const oy = overlap(front.bb.y0, front.bb.y1, L.bb.y0, L.bb.y1) / Math.min(front.bb.h, L.bb.h);
      const ox = overlap(front.bb.x0, front.bb.x1, L.bb.x0, L.bb.x1) / Math.min(front.bb.w, L.bb.w);
      const dx = L.bb.x0 > front.bb.x1 ? L.bb.x0 - front.bb.x1 : front.bb.x0 - L.bb.x1, dy = L.bb.y0 > front.bb.y1 ? L.bb.y0 - front.bb.y1 : front.bb.y0 - L.bb.y1;
      if (oy > 0.6 && dx > -tol && dx < best) { best = dx; sideV = L; dir = 'h'; }
      if (ox > 0.6 && dy > -tol && dy < best) { best = dy; sideV = L; dir = 'v'; }
    }
    const others = tops.filter(L => L !== front && L !== sideV).length;
    if (others) info.push(`나머지 윤곽 ${others}개는 3D에 쓰지 않았습니다`);
    let kind = kindSel.value;
    if (kind === 'auto') kind = (front.circle && sideV) ? 'revolve' : 'extrude';
    if (kind === 'revolve' && !front.circle) { warn.push('정면도 바깥 윤곽이 원이 아니라서 돌출로 만들었습니다'); kind = 'extrude'; }
    if (kind === 'revolve' && !sideV) { warn.push('측면도가 없어 회전체 길이를 몰라 두께만큼 돌출했습니다'); kind = 'extrude'; }

    // 정면·측면 크기 비교 (손그림 오차 허용)
    if (sideV) {
      const fH = dir === 'h' ? front.bb.h : front.bb.w, sH = dir === 'h' ? sideV.bb.h : sideV.bb.w;
      const diff = Math.abs(fH - sH) / Math.max(fH, sH);
      if (diff > 0.10) { warn.push(`${dir === 'h' ? '높이' : '너비'}가 다릅니다: 정면도 ${fmt3(fH)} / 측면도 ${fmt3(sH)} (차이 ${Math.round(diff * 100)}%). 정면도에 맞춰 만들었습니다. 어느 쪽이 맞나요?`); var bigDiff = true; }
      else if (diff > tol / Math.max(fH, sH) * 4) info.push(`정면·측면 차이 ${Math.round(diff * 1000) / 10}% → 정면도에 맞췄습니다`);
    }

    if (kind === 'extrude') {
      let t = +tIn.value || 10, tSrc = '입력한 두께';
      if (sideV) {
        t = dir === 'h' ? sideV.bb.w : sideV.bb.h; tSrc = '측면도';
        if (sideV.pts.length > 4 && !sideV.circle) { const rectish = Math.abs(sideV.a - sideV.bb.w * sideV.bb.h) / (sideV.bb.w * sideV.bb.h) < 0.02; if (!rectish) warn.push('측면도가 단순 사각형이 아니어서 두께만 읽었습니다 (계단·턱 모양은 아직 반영 안 됨)'); }
      }
      // 안쪽 윤곽: 비어 있으면 구멍, 안에 또 윤곽이 있으면 턱·보스 선으로 보고 그 안쪽을 구멍으로
      const holes = []; let steps = 0;
      (function walk(L) { for (const k of L.kids) { if (k.kids.length) { steps++; walk(k); } else holes.push(k); } })(front);
      if (steps) info.push(`안쪽 윤곽 ${steps}개는 턱·보스 선으로 보고 뚫지 않았습니다 (회전체면 측면도를 그려 주세요)`);
      return { kind, front, holes, t, tSrc, warn, info, tol };
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
    const matches = r => radii.some(x => Math.abs(x - r) <= Math.max(tol * 4, r * 0.03));
    let bore = 0;
    for (const r of conc) if (!matches(r) && r < rMin - tol && r > bore) bore = r;
    const unknown = conc.filter(r => r !== bore && !matches(r));
    if (unknown.length) info.push(`측면도와 맞지 않는 동심원 ${unknown.map(r => 'Ø' + fmt3(r * 2)).join(', ')}은 건너뛰었습니다`);
    return { kind, front, fc, segs, bore, holes, warn, info, tol, total: st[st.length - 1] - st[0] };
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
    if (pl.kind === 'extrude') {
      const o = { x: (pl.front.bb.x0 + pl.front.bb.x1) / 2, y: (pl.front.bb.y0 + pl.front.bb.y1) / 2 };
      const sh = shapeFrom(pl.front, o, false); for (const h of pl.holes) sh.holes.push(shapeFrom(h, o, true));
      addMesh(new T.ExtrudeGeometry(sh, { depth: pl.t, bevelEnabled: false, curveSegments: 72 }));
      return { o };
    }
    const o = pl.fc;
    for (const s of pl.segs) {
      if (Math.abs(s.rA - s.rB) <= pl.tol) {
        const r = (s.rA + s.rB) / 2, sh = new T.Shape(); sh.absarc(0, 0, r, 0, Math.PI * 2, false);
        if (pl.bore > 0) { const b = new T.Path(); b.absarc(0, 0, pl.bore, 0, Math.PI * 2, true); sh.holes.push(b); }
        for (const h of pl.holes) { const hb = h.bb, cx = (hb.x0 + hb.x1) / 2 - o.x, cy = (hb.y0 + hb.y1) / 2 - o.y, hr = Math.max(hb.w, hb.h) / 2, d = Math.hypot(cx, cy); if (d + hr < r - pl.tol && d - hr > pl.bore + pl.tol) sh.holes.push(shapeFrom(h, o, true)); }
        const g = new T.ExtrudeGeometry(sh, { depth: s.L, bevelEnabled: false, curveSegments: 72 }); g.translate(0, 0, s.z); addMesh(g);
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
    else L.push(`<span class="ok">회전체</span> <span class="i">· 외경 Ø${fmt3(pl.front.circle.r * 2)} · 길이 ${fmt3(pl.total)} · 구간 ${pl.segs.length}개${pl.bore ? ' · 보어 Ø' + fmt3(pl.bore * 2) : ''} · 구멍 ${pl.holes.length}개</span>`);
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
    const key = JSON.stringify([pl.kind, pl.t, pl.segs, pl.bore, pl.front.pts.length, pl.front.bb, pl.holes.map(h => h.bb)]);
    const first = !lastPlan;
    lastPlan = pl; status(pl);
    if (key === lastKey && !force) return; lastKey = key;
    build(pl); if (first || force) fit3(); draw3();
  }
  LAB.rebuild = rebuild; LAB.plan = () => plan();

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
  let occP = null;
  function ensureOCC() {
    if (!occP) {
      const t0 = performance.now();
      occP = Promise.all([import(new URL('replicad-lab.mjs?v=1', location.href).href), import(OCC_BASE + 'replicad_single.js')]).then(async ([R, M]) => {
        const oc = await M.default({ locateFile: () => OCC_BASE + 'replicad_single.wasm' }); R.setOC(oc); LAB.occMs = Math.round(performance.now() - t0); return R;
      });
      occP.catch(() => { occP = null; });
    }
    return occP;
  }
  const stepBtn = pane.querySelector('#l3step');
  stepBtn.addEventListener('pointerenter', () => { ensureOCC().catch(() => { }); }, { once: true });
  function rDraw(R, loop, o) {
    if (loop.circle) return R.drawCircle(loop.circle.r).translate(loop.circle.c.x - o.x, loop.circle.c.y - o.y);
    const p = loop.pts; let d = R.draw([p[0].x - o.x, p[0].y - o.y]); for (let i = 1; i < p.length; i++) d = d.lineTo([p[i].x - o.x, p[i].y - o.y]); return d.close();
  }
  async function makeSolid(R, pl) {
    if (pl.kind === 'extrude') {
      const o = { x: (pl.front.bb.x0 + pl.front.bb.x1) / 2, y: (pl.front.bb.y0 + pl.front.bb.y1) / 2 };
      let d = rDraw(R, pl.front, o); for (const h of pl.holes) d = d.cut(rDraw(R, h, o));
      return d.sketchOnPlane().extrude(pl.t);
    }
    const o = pl.fc; let s = null;
    for (const g of pl.segs) {
      let part;
      if (Math.abs(g.rA - g.rB) <= pl.tol) part = R.drawCircle((g.rA + g.rB) / 2).sketchOnPlane('XY', g.z).extrude(g.L);
      else part = R.drawCircle(Math.max(g.rA, 1e-3)).sketchOnPlane('XY', g.z).loftWith(R.drawCircle(Math.max(g.rB, 1e-3)).sketchOnPlane('XY', g.z + g.L));
      s = s ? s.fuse(part) : part;
    }
    const len = pl.total + 2;
    if (pl.bore > 0) s = s.cut(R.drawCircle(pl.bore).sketchOnPlane('XY', -1).extrude(len));
    for (const h of pl.holes) s = s.cut(rDraw(R, h, o).sketchOnPlane('XY', -1).extrude(len));
    return s;
  }
  stepBtn.onclick = async () => {
    if (!lastPlan) { log('3D로 만들 윤곽이 없습니다', 'err'); return; }
    const old = stepBtn.textContent; stepBtn.disabled = true; stepBtn.textContent = occP ? 'STEP 만드는 중…' : '엔진 받는 중…';
    try {
      const t0 = performance.now(); const R = await ensureOCC(); stepBtn.textContent = 'STEP 만드는 중…';
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
