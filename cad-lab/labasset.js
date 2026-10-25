/* 무카 CAD 테스트 서버 — 3D → 영업 에셋 (3화 ③)
   3D 창 [에셋 ▾] : 제품샷(흰 배경) · 분해도 · 360° 회전 영상(mp4) · GLB · 웹 3D 보기(HTML 파일 1개) · 아이폰 AR(USDZ)
   모두 브라우저 안에서 만든다 (서버·토큰 비용 없음). 엔진(three-asset.js, 약 0.8MB)은 처음 쓸 때만 받는다.
   AI 연결: mucca_draw 의 {"cmd":"model3d_asset","make":["shots","exploded","video","glb","html"]} */
(() => {
  'use strict';
  const AS = window.LABASSET = { ver: 1, files: [] };
  const lab = () => window.LAB3D, ph = () => window.LABPHOTO;
  const V = () => { const L = lab(); if (!L || !L._v) throw new Error('3D 기능을 불러오는 중입니다'); return L._v(); };
  let TA = null, loading = null;
  const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('불러오기 실패: ' + src)); document.head.appendChild(s); });
  const ensure = () => TA ? Promise.resolve(TA) : (loading = loading || loadScript('three-asset.js?v=2').then(() => (TA = window.THREE_ASSET)));
  const METAL = { '#cfd3d8': 0.18, '#a2a6ab': 0.3, '#8e959c': 0.34 };   // chrome · silver · metal (labphoto COL)
  const DARK = new Set(['#2c2e31', '#151517', '#1b1b1b', '#1f242b']);
  const CAMS = { front34: [1, -0.9, 0.55], iso: [1, -1, 0.75], rear34: [-1, -0.9, 0.55], front: [1, 0, 0.02], right: [0, -1, 0.02], left: [0, 1, 0.02], rear: [-1, 0, 0.02], top: [0.001, -0.001, 1], top34: [0.5, -0.6, 1.2] };
  const VIEW_KO = { front34: '대표(45°)', iso: '등각', rear34: '뒤 45°', front: '정면', right: '측면', left: '왼쪽', rear: '뒤', top: '위', top34: '위 45°' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const r1 = x => Math.round(x * 10) / 10;

  /* ---------------- 1) 모델 부품 꺼내기 (Z 위, mm) ---------------- */
  function srcParts(fine) {
    const P = ph();
    if (P && P.model && P.model.parts && P.model.parts.length && lab().ext) {
      let diag = 100; try { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const p of P.model.parts) { const b = p.shape.boundingBox.bounds; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b[0][i]); mx[i] = Math.max(mx[i], b[1][i]); } } diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]); } catch (_) { }
      return P.model.parts.map(p => {
        let pos, nor, idx;
        if (fine) { try { const m = p.shape.mesh({ tolerance: Math.max(0.01, diag * 0.00015), angularTolerance: 0.1 }); pos = new Float32Array(m.vertices); nor = m.normals && m.normals.length === m.vertices.length ? new Float32Array(m.normals) : null; idx = Uint32Array.from(m.triangles); } catch (_) { } }
        if (!pos && p.geo) { pos = p.geo.attributes.position.array; nor = p.geo.attributes.normal ? p.geo.attributes.normal.array : null; idx = p.geo.index ? p.geo.index.array : null; }
        if (!pos) throw new Error('부품 ' + p.no + ' 을 메시로 바꾸지 못했습니다');
        return { no: p.no, name: p.name, color: String(p.color || '#c8c8c8').toLowerCase(), pos, nor, idx };
      });
    }
    // 규칙 엔진 3D: 3D 창의 메시 (도면 XY → 세운 좌표)
    const v = V(), root = v.root, base = root.parent; if (!root || !root.children.some(o => o.isMesh)) throw new Error('3D 모델이 없습니다. 먼저 3D 를 만드세요');
    root.updateMatrix(); base.updateMatrix();
    const M = new v.T.Matrix4().multiplyMatrices(base.matrix, root.matrix), out = [];
    root.children.forEach(o => {
      if (!o.isMesh) return; const g = o.geometry.clone(); o.updateMatrix(); g.applyMatrix4(new v.T.Matrix4().multiplyMatrices(M, o.matrix));
      if (!g.attributes.normal) g.computeVertexNormals();
      out.push({ no: 'P1', name: '본체', color: '#6f9fd0', pos: g.attributes.position.array, nor: g.attributes.normal.array, idx: g.index ? g.index.array : null });
    });
    return out;
  }

  /* ---------------- 2) 장면 ---------------- */
  function material(col) {
    const c = col.toLowerCase();
    if (METAL[c] != null) return new TA.MeshPhysicalMaterial({ color: c, metalness: 0.85, roughness: METAL[c] });
    if (DARK.has(c)) return new TA.MeshPhysicalMaterial({ color: c, metalness: 0.05, roughness: 0.72 });
    return new TA.MeshPhysicalMaterial({ color: c, metalness: 0.12, roughness: 0.42, clearcoat: 0.15, clearcoatRoughness: 0.35 });   // 도장면
  }
  // parts → Group(Z 위, mm). 부품 번호마다 묶음 노드 + 분해 방향(userData.explode)
  function buildModel(parts) {
    const root = new TA.Group(); root.name = 'model';
    const by = new Map();
    for (const p of parts) {
      let n = by.get(p.no); if (!n) { n = new TA.Group(); n.name = p.no + ' ' + p.name; n.userData.no = p.no; by.set(p.no, n); root.add(n); }
      const g = new TA.BufferGeometry(); g.setAttribute('position', new TA.BufferAttribute(new Float32Array(p.pos), 3));
      if (p.nor) g.setAttribute('normal', new TA.BufferAttribute(new Float32Array(p.nor), 3)); if (p.idx) g.setIndex(new TA.BufferAttribute(Uint32Array.from(p.idx), 1)); if (!p.nor) g.computeVertexNormals();
      g.computeBoundingBox(); const m = new TA.Mesh(g, material(p.color)); m.name = p.name; m.castShadow = true; m.receiveShadow = true; n.add(m);
    }
    return withExplode(root);
  }
  function withExplode(root) {
    const bb = new TA.Box3().setFromObject(root), C = bb.getCenter(new TA.Vector3()), half = bb.getSize(new TA.Vector3()).multiplyScalar(0.5);
    // 분해: 부품 중심이 전체 중심에서 가장 많이 벗어난 축(전체 크기 대비)으로만 밀어냄
    for (const n of root.children) {
      const c = new TA.Box3().setFromObject(n).getCenter(new TA.Vector3()), o = c.clone().sub(C);
      const k = [0, 1, 2].map(i => Math.abs(o.getComponent(i)) / Math.max(1e-6, half.getComponent(i)));
      const ax = k.indexOf(Math.max(...k)), d = new TA.Vector3(); if (k[ax] > 0.08) d.setComponent(ax, o.getComponent(ax) * 0.9);
      n.userData.explode = d.toArray().map(r1);
    }
    root.userData.box = bb; return root;
  }
  function explode(root, k) { for (const n of root.children) { const d = n.userData.explode || [0, 0, 0]; n.position.set(d[0] * k, d[1] * k, d[2] * k); } root.updateMatrixWorld(true); }
  // 바깥 GLB (Tripo 등): Y 위 → Z 위, 부품(최상위 자식)마다 묶고 형상을 굳혀 넣음. 재질·텍스처는 그대로
  let glbSrc = null;
  async function loadGLB(ab, name) {
    await ensure(); const g = await new TA.GLTFLoader().parseAsync(ab, '');
    let lv = g.scene; while (lv.children.length === 1 && !lv.children[0].isMesh) lv = lv.children[0];
    const nodes = lv.children.length ? lv.children : [lv]; g.scene.updateMatrixWorld(true);
    const up = new TA.Matrix4().makeRotationZ(Math.PI / 2).multiply(new TA.Matrix4().makeRotationX(Math.PI / 2)), out = [];   // glTF: Y 위·앞 +Z → 우리: Z 위·앞 +X
    for (const n of nodes) { const meshes = []; n.traverse(o => { if (o.isMesh) meshes.push(o); }); if (!meshes.length) continue; out.push({ name: n.name || 'part', meshes: meshes.map(m => ({ geo: m.geometry.clone().applyMatrix4(new TA.Matrix4().multiplyMatrices(up, m.matrixWorld)), mat: m.material })) }); }
    // 크기: 가장 긴 변 = 1000 (단위 모름)
    const bb = new TA.Box3(); for (const p of out) for (const m of p.meshes) { m.geo.computeBoundingBox(); bb.union(m.geo.boundingBox); }
    const k = 1000 / Math.max(...bb.getSize(new TA.Vector3()).toArray()); for (const p of out) for (const m of p.meshes) { m.geo.scale(k, k, k); if (!m.geo.attributes.normal) m.geo.computeVertexNormals(); }
    let tris = 0; for (const p of out) for (const m of p.meshes) tris += (m.geo.index ? m.geo.index.count : m.geo.attributes.position.count) / 3;
    glbSrc = { name: name || 'GLB', parts: out }; return { parts: out.length, tris: Math.round(tris), textured: out.some(p => p.meshes.some(m => m.mat && m.mat.map)) };
  }
  AS.loadGLB = loadGLB; AS.clearGLB = () => { glbSrc = null; };
  function getModel(fine) {
    if (!glbSrc) return buildModel(srcParts(fine));
    const root = new TA.Group(); root.name = 'model';
    for (const p of glbSrc.parts) { const n = new TA.Group(); n.name = p.name; for (const m of p.meshes) { const me = new TA.Mesh(m.geo, m.mat); me.castShadow = me.receiveShadow = true; n.add(me); } root.add(n); }
    return withExplode(root);
  }

  // 흰 배경 스튜디오: 환경광 + 위 조명 + 바닥 그림자
  function stage(W, H) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const rr = new TA.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, alpha: false });
    rr.setPixelRatio(1); rr.setSize(W, H, false); rr.toneMapping = TA.NeutralToneMapping; rr.toneMappingExposure = 1.0; rr.outputColorSpace = TA.SRGBColorSpace;
    rr.shadowMap.enabled = true; rr.shadowMap.type = TA.PCFSoftShadowMap; rr.setClearColor(0xffffff, 1);
    const sc = new TA.Scene(); sc.background = new TA.Color(0xffffff);
    const pm = new TA.PMREMGenerator(rr); const env = pm.fromScene(new TA.RoomEnvironment(), 0.04); sc.environment = env.texture; sc.environmentIntensity = 0.75; pm.dispose();
    sc.add(new TA.HemisphereLight(0xffffff, 0xd8dce2, 0.5));
    const sun = new TA.DirectionalLight(0xffffff, 1.35); sun.castShadow = true; sc.add(sun); sc.add(sun.target);
    const ground = new TA.Mesh(new TA.PlaneGeometry(1, 1), new TA.ShadowMaterial({ opacity: 0.17 })); ground.receiveShadow = true; sc.add(ground);
    const cam = new TA.PerspectiveCamera(26, W / H, 1, 1e6);
    return {
      cv, rr, sc, cam, sun, ground, env,
      light(dir) {   // 카메라 왼쪽 위에서 비추는 주 조명 → 그림자는 모델 뒤 오른쪽
        const c = this.c, r = this.r, a = Math.atan2(dir.y, dir.x) + 0.75; sun.position.set(c.x + Math.cos(a) * r * 1.8, c.y + Math.sin(a) * r * 1.8, c.z + r * 3.4); sun.target.position.copy(c); sun.target.updateMatrixWorld();
      },
      put(model) {
        sc.add(model); const bb = new TA.Box3().setFromObject(model), c = bb.getCenter(new TA.Vector3()), r = bb.getSize(new TA.Vector3()).length() / 2;
        ground.scale.set(r * 14, r * 14, 1); ground.position.set(c.x, c.y, bb.min.z - r * 0.001);
        sun.position.set(c.x - r * 1.1, c.y - r * 1.6, c.z + r * 3.2); sun.target.position.copy(c);
        const s = sun.shadow.camera; s.left = s.bottom = -r * 2.4; s.right = s.top = r * 2.4; s.near = r * 0.2; s.far = r * 9; s.updateProjectionMatrix();
        sun.shadow.mapSize.set(4096, 4096); sun.shadow.radius = 8; sun.shadow.blurSamples = 16; sun.shadow.bias = -0.0003; sun.shadow.normalBias = r * 0.0008;
        cam.near = r / 200; cam.far = r * 200; cam.updateProjectionMatrix(); this.c = c; this.r = r; return { bb, c, r };
      },
      dispose() { try { env.dispose(); } catch (_) { } rr.dispose(); try { rr.forceContextLoss(); } catch (_) { } }
    };
  }
  // 카메라 방향 dir 로 bb 를 화면 margin 안에 꽉 차게 (가운데 맞춤 2회)
  // 모델 꼭짓점을 최대 6천 개 뽑아 둠 (상자 모서리보다 꽉 맞게)
  function samplePts(model) {
    model.updateMatrixWorld(true); const all = []; model.traverse(o => { if (o.isMesh) all.push(o); });
    let n = 0; for (const m of all) n += m.geometry.attributes.position.count; const step = Math.max(1, Math.ceil(n / 6000)), out = [];
    for (const m of all) { const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i += step) out.push(new TA.Vector3(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(m.matrixWorld)); }
    return out;
  }
  function fitCam(cam, bb, dir, margin, pts) {
    const c = bb.getCenter(new TA.Vector3()), size = bb.getSize(new TA.Vector3()).length();
    if (!pts) { pts = []; for (let i = 0; i < 8; i++) pts.push(new TA.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)); }
    cam.up.set(0, 0, 1); if (Math.abs(dir.z) > 0.98) cam.up.set(0, 1, 0);
    let tgt = c.clone(), dist = size * 2;
    for (let it = 0; it < 3; it++) {
      let lo = size * 0.05, hi = size * 30;
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) / 2; cam.position.copy(tgt).addScaledVector(dir, mid); cam.lookAt(tgt); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        let m = 0; for (const p of pts) { if (p.clone().applyMatrix4(cam.matrixWorldInverse).z > -cam.near * 2) { m = 99; break; } const q = p.clone().project(cam); m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); }
        if (m > margin) lo = mid; else hi = mid;
      }
      dist = hi; cam.position.copy(tgt).addScaledVector(dir, dist); cam.lookAt(tgt); cam.updateMatrixWorld();
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const p of pts) { const q = p.clone().project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const hh = dist * Math.tan(cam.fov * Math.PI / 360), hw = hh * cam.aspect, R = new TA.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), U = new TA.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      tgt.addScaledVector(R, (x0 + x1) / 2 * hw).addScaledVector(U, (y0 + y1) / 2 * hh);
    }
    cam.position.copy(tgt).addScaledVector(dir, dist); cam.lookAt(tgt); cam.updateMatrixWorld(); return { tgt, dist };
  }
  const dirOf = v => new TA.Vector3(...(Array.isArray(v) ? v : (CAMS[v] || CAMS.front34))).normalize();
  // 큰 그림: ss 배로 그린 뒤 줄여서 계단 없앰
  function snap(st, W, H, ss) {
    st.rr.render(st.sc, st.cam); if (ss === 1) return st.cv;
    const o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(st.cv, 0, 0, W, H); return o;
  }
  const toBlob = (cv, type, q) => new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error('그림 저장 실패')), type || 'image/png', q));
  const sizeOf = res => res === '4k' ? [3840, 2160] : res === '720' ? [1280, 720] : [1920, 1080];

  /* ---------------- 3) 제품샷 · 분해도 ---------------- */
  async function shots(o) {
    await ensure(); const [W, H] = o.size || sizeOf(o.res), ss = o.ss || (W <= 2000 ? 2 : 1);
    const model = getModel(true), st = stage(W * ss, H * ss); const info = st.put(model);
    if (o.fov) { st.cam.fov = o.fov; st.cam.updateProjectionMatrix(); }
    const out = [];
    try {
      for (const v of (o.views || ['front34', 'front', 'right', 'top34'])) {
        explode(model, 0); const d = dirOf(v); st.light(d); fitCam(st.cam, new TA.Box3().setFromObject(model), d, o.margin || 0.86, samplePts(model));
        out.push({ name: `제품샷_${VIEW_KO[v] || v}.png`, blob: await toBlob(snap(st, W, H, ss)), view: v }); await sleep(0);
      }
      if (o.exploded) {
        if (model.children.length < 2) out.push({ skip: '부품이 1개라 분해도를 만들 수 없습니다' });
        else { explode(model, o.k || 1); st.put(model); const d = dirOf(o.exView || 'front34'); st.light(d); fitCam(st.cam, new TA.Box3().setFromObject(model), d, 0.88, samplePts(model));
          out.push({ name: '분해도.png', blob: await toBlob(snap(st, W, H, ss)), view: 'exploded' }); explode(model, 0); }
      }
    } finally { st.dispose(); }
    return { files: out.filter(f => f.blob), skipped: out.filter(f => f.skip).map(f => f.skip), size_mm: info.bb.getSize(new TA.Vector3()).toArray().map(r1), W, H, parts: model.children.length };
  }

  /* ---------------- 4) 360° 회전 영상 (mp4) ---------------- */
  async function video(o) {
    await ensure(); if (!window.VideoEncoder) throw new Error('이 브라우저는 영상 만들기(WebCodecs)를 지원하지 않습니다. 크롬·엣지 최신판에서 해 주세요');
    const [W, H] = o.size || sizeOf(o.res || '1080'), fps = o.fps || 30, sec = o.sec || 8, N = Math.round(fps * sec);
    const cands = [['avc1.640033', 'avc'], ['avc1.4d0033', 'avc'], ['avc1.42003e', 'avc'], ['vp09.00.41.08', 'vp9']];
    let cfg = null, mc = null;
    for (const [codec, m] of cands) { const c = { codec, width: W, height: H, bitrate: o.bitrate || (W > 2000 ? 24e6 : 10e6), framerate: fps }; if (codec.startsWith('avc')) c.avc = { format: 'avc' }; try { const s = await VideoEncoder.isConfigSupported(c); if (s.supported) { cfg = c; mc = m; break; } } catch (_) { } }
    if (!cfg) throw new Error('이 브라우저에서 쓸 수 있는 영상 형식(H.264·VP9)이 없습니다');
    const model = getModel(true), st = stage(W, H); const info = st.put(model);
    const muxer = new TA.Muxer({ target: new TA.ArrayBufferTarget(), video: { codec: mc, width: W, height: H, frameRate: fps }, fastStart: 'in-memory' });
    let err = null; const enc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => { err = e; } }); enc.configure(cfg);
    const bb = info.bb, c = info.c, d0 = dirOf(o.view || 'front34'), el = Math.atan2(d0.z, Math.hypot(d0.x, d0.y)), az0 = Math.atan2(d0.y, d0.x);
    // 모든 각도에서 들어가는 거리 = 각도별 맞춤 거리의 최댓값 (가운데는 고정)
    let dist = 0; const tz = c.z, sp = samplePts(model);
    for (let i = 0; i < 24; i++) { const a = az0 + i * Math.PI / 12, d = new TA.Vector3(Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), Math.sin(el)); dist = Math.max(dist, fitCam(st.cam, bb, d, o.margin || 0.84, sp).dist); }
    st.light(d0);   // 조명은 고정, 카메라만 돎 (제품이 도는 것처럼 보임)
    const t0 = performance.now();
    try {
      for (let i = 0; i < N; i++) {
        if (err) throw err;
        const a = az0 + (o.dir === 'cw' ? -1 : 1) * 2 * Math.PI * i / N, d = new TA.Vector3(Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), Math.sin(el));
        st.cam.up.set(0, 0, 1); st.cam.position.set(c.x, c.y, tz).addScaledVector(d, dist); st.cam.lookAt(c.x, c.y, tz);
        st.rr.render(st.sc, st.cam);
        const fr = new VideoFrame(st.cv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        enc.encode(fr, { keyFrame: i % (fps * 2) === 0 }); fr.close();
        while (enc.encodeQueueSize > 4) await sleep(2);
        if (o.onProgress && i % 10 === 0) o.onProgress(i / N);
      }
      await enc.flush(); if (err) throw err; muxer.finalize();
    } finally { try { enc.close(); } catch (_) { } st.dispose(); }
    const buf = muxer.target.buffer;
    return { files: [{ name: `360도_회전_${sec}초.mp4`, blob: new Blob([buf], { type: 'video/mp4' }) }], codec: cfg.codec, W, H, fps, sec, ms: Math.round(performance.now() - t0) };
  }

  /* ---------------- 5) GLB · USDZ · 웹 3D 보기 ---------------- */
  // 내보내기용: Z 위 → Y 위, mm → m (glTF·USDZ 표준)
  function exportRoot(fine) { const model = getModel(fine !== false); const top = new TA.Group(); top.name = 'mucca'; top.rotation.x = -Math.PI / 2; top.scale.setScalar(0.001); top.add(model); top.updateMatrixWorld(true); return { top, model }; }
  async function glb() { await ensure(); const { top, model } = exportRoot(); const buf = await new TA.GLTFExporter().parseAsync(top, { binary: true }); return { files: [{ name: '보기용_3D.glb', blob: new Blob([buf], { type: 'model/gltf-binary' }) }], parts: model.children.length, buf }; }
  async function usdz() { await ensure(); const { top } = exportRoot(); const u8 = await new TA.USDZExporter().parseAsync(top, { quickLookCompatible: true }); return { files: [{ name: '아이폰_AR.usdz', blob: new Blob([u8], { type: 'model/vnd.usdz+zip' }) }] }; }
  let viewJs = null;
  async function html(o) {
    const g = o && o.glbBuf ? { buf: o.glbBuf, parts: o.parts } : await glb();
    if (!viewJs) viewJs = await (await fetch('three-view.js?v=1')).text();
    const u8 = new Uint8Array(g.buf); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    const title = (o && o.title) || docTitle(), esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>${esc(title)} — 3D 보기</title>
<style>html,body{margin:0;height:100%;background:#fff;font-family:-apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#1f2a37;overflow:hidden;touch-action:none}#cv{position:fixed;inset:0;width:100%;height:100%;display:block}
.top{position:fixed;left:0;right:0;top:0;padding:12px 16px;background:linear-gradient(#fff,rgba(255,255,255,0));pointer-events:none}.top b{font-size:17px}.top small{display:block;color:#6b7684;font-size:12px;margin-top:2px}
.bar{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:8px;align-items:center;background:rgba(255,255,255,.94);border:1px solid #e3e7ec;border-radius:999px;padding:6px 10px;box-shadow:0 4px 18px rgba(0,0,0,.08);white-space:nowrap}
.bar button{font:inherit;font-size:14px;border:0;background:#eef2f6;color:#1f2a37;border-radius:999px;padding:8px 14px}.bar button[aria-pressed=true]{background:#1f2a37;color:#fff}.bar label{font-size:13px;color:#4b5563;display:flex;align-items:center;gap:6px}.bar input{width:110px}
#ld{position:fixed;inset:0;display:grid;place-items:center;color:#6b7684;font-size:14px}.ft{position:fixed;right:10px;bottom:calc(64px + env(safe-area-inset-bottom));font-size:11px;color:#9aa3ad}</style></head>
<body><canvas id="cv"></canvas><div class="top"><b>${esc(title)}</b><small>한 손가락: 돌리기 · 두 손가락: 확대·이동</small></div><div id="ld">3D 를 여는 중…</div>
<div class="bar"><button id="spin" aria-pressed="true">돌리기</button><button id="home">처음 시점</button><label id="exw">분해 <input id="ex" type="range" min="0" max="100" value="0"></label></div>
<div class="ft">무카 CAD 로 만든 참고용 3D · 치수는 도면으로 확인</div>
<script id="glb" type="application/octet-stream">${btoa(s)}</script><script>${viewJs.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
    return { files: [{ name: '웹3D보기.html', blob: new Blob([page], { type: 'text/html' }) }], parts: g.parts };
  }
  function docTitle() { if (glbSrc) return glbSrc.name; try { const t = V().baseName(); return /^(무카 CAD( 테스트)?|mucca)$/i.test(t) ? '3D 모델' : t; } catch (_) { return '3D 모델'; } }

  /* ---------------- 6) 묶음 · 저장 · 휴대폰 공유 ---------------- */
  function save(files) { const v = V(); const base = docTitle(); files.forEach((f, i) => setTimeout(() => v.download(f.blob, base + '_' + f.name), i * 350)); }
  async function zip(files) { await ensure(); const o = {}; for (const f of files) o[f.name] = new Uint8Array(await f.blob.arrayBuffer()); return new Blob([TA.zipSync(o, { level: 0 })], { type: 'application/zip' }); }
  const SHAREABLE = /\.(png|jpe?g|mp4|html)$/i;
  function shareFiles() { const base = docTitle(); return AS.files.filter(f => SHAREABLE.test(f.name)).map(f => new File([f.blob], base + '_' + f.name, { type: f.blob.type || 'application/octet-stream' })); }
  AS.canShare = () => { try { const fs = shareFiles(); return !!(fs.length && navigator.canShare && navigator.canShare({ files: fs })); } catch (_) { return false; } };
  AS.share = async () => {   // 사용자가 버튼을 눌렀을 때만 (브라우저 규칙)
    let fs = shareFiles(); if (!fs.length) throw new Error('먼저 에셋을 만드세요');
    if (!navigator.canShare) throw new Error('이 브라우저는 파일 공유를 지원하지 않습니다');
    if (!navigator.canShare({ files: fs })) { fs = fs.filter(f => navigator.canShare({ files: [f] })); if (!fs.length) throw new Error('이 기기에서 공유할 수 있는 파일 형식이 없습니다'); }
    await navigator.share({ files: fs, title: docTitle() + ' 3D 에셋' }); return fs.map(f => f.name);
  };

  // make: shots · exploded · video · glb · html · usdz
  async function make(o) {
    o = o || {}; const mk = new Set(o.make || ['shots', 'exploded', 'video', 'glb', 'html']); const res = { ms: {} }, files = [];
    const step = async (k, f) => { const t = performance.now(); prog(k); const r = await f(); res.ms[k] = Math.round(performance.now() - t); return r; };
    if (mk.has('shots') || mk.has('exploded')) { const r = await step('shots', () => shots({ res: o.res, views: mk.has('shots') ? o.views : [], exploded: mk.has('exploded'), exView: o.exView })); files.push(...r.files); res.size_mm = r.size_mm; res.image_px = [r.W, r.H]; res.parts = r.parts; if (r.skipped.length) res.skipped = r.skipped; }
    let g = null; if (mk.has('glb') || mk.has('html')) { g = await step('glb', () => glb()); if (mk.has('glb')) files.push(...g.files); }
    if (mk.has('html')) { const r = await step('html', () => html({ glbBuf: g.buf, parts: g.parts })); files.push(...r.files); }
    if (mk.has('usdz')) { const r = await step('usdz', () => usdz()); files.push(...r.files); }
    if (mk.has('video')) { const r = await step('video', () => video({ res: o.videoRes || '1080', sec: o.sec, onProgress: p => prog('video', p) })); files.push(...r.files); res.video = { codec: r.codec, px: [r.W, r.H], fps: r.fps, sec: r.sec }; }
    AS.files = files; res.files = files.map(f => ({ name: f.name, kb: Math.round(f.blob.size / 1024) })); prog(null);
    return res;
  }
  let progEl = null; function prog(k, p) { if (!progEl) return; progEl.textContent = k ? ({ shots: '제품샷 그리는 중…', glb: 'GLB 만드는 중…', html: '웹 3D 보기 만드는 중…', usdz: 'USDZ 만드는 중…', video: '360° 영상 만드는 중… ' + (p ? Math.round(p * 100) + '%' : '') })[k] || '' : ''; }
  AS.make = make; AS.shots = shots; AS.video = video; AS.glb = glb; AS.html = html; AS.usdz = usdz; AS.zip = zip; AS.ensure = ensure; AS.srcParts = srcParts;

  /* ---------------- 7) 3D 창 [에셋 ▾] 메뉴 ---------------- */
  function ui() {
    let v; try { v = V(); } catch (_) { return setTimeout(ui, 500); }
    const stlBtn = v.pane.querySelector('#l3stl'); if (!stlBtn || v.pane.querySelector('#l3asset')) return;
    const css = document.createElement('style'); css.textContent = `.asw{position:relative;display:inline-block}.asm{position:absolute;right:0;top:calc(100% + 4px);z-index:50;background:#fff;color:#1f2a37;border:1px solid #d6dbe1;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:6px;min-width:250px;display:none;font-size:13px}.asm.on{display:block}.asm button{display:block;width:100%;text-align:left;border:0;background:none;padding:7px 10px;border-radius:6px;font:inherit;color:inherit;cursor:pointer}.asm button:hover{background:#eef3f8}.asm button:disabled{opacity:.45;cursor:default}.asm hr{border:0;border-top:1px solid #e6e9ee;margin:5px 2px}.asm label{display:flex;gap:6px;align-items:center;padding:4px 10px;color:#4b5563}.asm .p{padding:4px 10px;color:#2f6fb3;min-height:16px}.asm .hint{padding:2px 10px 4px;color:#7b8794;font-size:12px;line-height:1.4}`;
    document.head.appendChild(css);
    const w = document.createElement('span'); w.className = 'asw';
    w.innerHTML = `<button class="btn" id="l3asset" title="영업용 그림·영상·보기 파일 만들기">에셋 ▾</button><div class="asm" id="l3am">
<label>해상도 <select id="l3ares"><option value="1080">1920×1080</option><option value="4k">3840×2160 (4K)</option></select></label>
<button data-a="all">한 번에 만들기 (제품샷·분해도·영상·GLB·웹 보기)</button><hr>
<button data-a="shots">제품샷 4장 (흰 배경)</button><button data-a="exploded">분해도</button><button data-a="video">360° 회전 영상 (mp4, 8초)</button>
<button data-a="glb">GLB (보기용 3D, 색 포함)</button><button data-a="html">웹 3D 보기 (HTML 파일 1개)</button><button data-a="usdz">아이폰 AR (USDZ)</button><hr>
<button data-a="loadglb" id="l3aglb">다른 3D 파일(GLB)로 만들기…</button><input type="file" id="l3aglbf" accept=".glb" hidden><hr>
<button data-a="share" id="l3ashare" disabled>📱 휴대폰으로 보내기 (카톡 등)</button><div class="hint">휴대폰에서 누르면 공유 창 → 카카오톡 → 나와의 채팅. PC 는 받은 파일을 카톡 나와의 채팅에 끌어다 놓으세요</div><div class="p" id="l3ap"></div></div>`;
    stlBtn.before(w);
    const menu = w.querySelector('#l3am'), shareBtn = w.querySelector('#l3ashare'); progEl = w.querySelector('#l3ap');
    w.querySelector('#l3asset').onclick = e => { e.stopPropagation(); menu.classList.toggle('on'); shareBtn.disabled = !AS.files.length; };
    document.addEventListener('pointerdown', e => { if (!w.contains(e.target)) menu.classList.remove('on'); });
    menu.addEventListener('keydown', e => e.stopPropagation());
    let busy = false;
    menu.querySelectorAll('button[data-a]').forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === 'loadglb') {
        if (glbSrc) { glbSrc = null; b.textContent = '다른 3D 파일(GLB)로 만들기…'; log('에셋 대상: 지금 3D 모델', 'ok'); return; }
        const fi = menu.querySelector('#l3aglbf'); fi.onchange = async () => { const f = fi.files[0]; fi.value = ''; if (!f) return; try { const r = await loadGLB(await f.arrayBuffer(), f.name.replace(/\.glb$/i, '')); b.textContent = '↩ 지금 3D 모델로 되돌리기 (GLB: ' + f.name + ')'; log(`에셋 대상: ${f.name} (부품 ${r.parts}개 · 삼각형 ${r.tris.toLocaleString()}개${r.textured ? ' · 텍스처 있음' : ''})`, 'ok'); } catch (e) { log('GLB 를 열지 못했습니다: ' + (e && e.message || e), 'err'); } }; fi.click(); return;
      }
      if (a === 'share') { try { const n = await AS.share(); log(`공유 창으로 보냄: ${n.join(', ')}`, 'ok'); } catch (e) { if (e && e.name === 'AbortError') return; log((e && e.message || e) + ' — 파일을 저장해서 카톡 나와의 채팅에 끌어다 놓으세요', 'err'); save(AS.files); } return; }
      if (busy) return; busy = true; menu.querySelectorAll('button').forEach(x => x.disabled = true);
      const res = menu.querySelector('#l3ares').value, t0 = performance.now();
      try {
        const mk = a === 'all' ? ['shots', 'exploded', 'video', 'glb', 'html'] : [a];
        const r = await make({ make: mk, res });
        if (!AS.files.length) throw new Error((r.skipped || ['만든 파일이 없습니다']).join(' · '));
        if (AS.files.length > 2 && !lab().noDownload) { const z = await zip(AS.files); V().download(z, docTitle() + '_영업에셋.zip'); } else if (!lab().noDownload) save(AS.files);
        log(`에셋 ${AS.files.length}개 (${((performance.now() - t0) / 1000).toFixed(1)}초): ${r.files.map(f => f.name + ' ' + (f.kb > 1024 ? (f.kb / 1024).toFixed(1) + 'MB' : f.kb + 'KB')).join(' · ')}`, 'ok');
        if (r.skipped) log(r.skipped.join(' · '), 'err');
      } catch (e) { log('에셋을 만들지 못했습니다: ' + (e && e.message || e), 'err'); prog(null); }
      finally { busy = false; menu.querySelectorAll('button').forEach(x => x.disabled = false); shareBtn.disabled = !AS.files.length; }
    });
  }
  function log(t, k) { try { if (typeof window.log === 'function') window.log(t, k); else console.log(t); } catch (_) { console.log(t); } }
  setTimeout(ui, 800);

  /* ---------------- 8) AI 명령 (mucca_draw) ---------------- */
  const hook = () => { const P = ph(); if (!P || !P.addCmd) return setTimeout(hook, 400);
    P.addCmd('model3d_asset', async c => {
      const mk = Array.isArray(c.make) && c.make.length ? c.make : ['shots', 'exploded', 'video', 'glb', 'html'];
      const r = await make({ make: mk, res: c.res, views: c.views, sec: c.sec, exView: c.exploded_view });
      if (!lab().noDownload && c.download !== false && AS.files.length) { if (AS.files.length > 2) V().download(await zip(AS.files), docTitle() + '_영업에셋.zip'); else save(AS.files); }
      // 미리보기: 대표 제품샷(또는 분해도)을 다음 mucca_snapshot 으로
      const pv = AS.files.find(f => /\.png$/.test(f.name));
      if (pv && P.queue) { const im = await createImageBitmap(pv.blob); const k = Math.min(1, 1400 / im.width), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); const u = cv.toDataURL('image/png'); P.queue.push({ png: u.slice(u.indexOf(',') + 1), note: '에셋 미리보기: ' + pv.name }); P.lastImage = u; r.note = '다음 mucca_snapshot 호출 때 미리보기 그림이 옵니다'; }
      r.next = '파일은 사용자 다운로드 폴더(묶음 zip). 휴대폰으로 보내려면 사용자가 3D 창 [에셋 ▾] › 휴대폰으로 보내기를 누름'; return r;
    });
    P.guide += `\n\n3D → 영업 에셋 (테스트 서버) — 3D 모델이 있을 때 {"cmd":"model3d_asset","make":["shots","exploded","video","glb","html"],"res":"1080"|"4k"}
  shots = 흰 배경 제품샷 4장(대표 45°·정면·측면·위 45°, "views" 로 바꿈: front34 iso rear34 front right left rear top top34) · exploded = 분해도(부품 번호별로 벌림)
  video = 360° 회전 mp4 8초("sec") · glb = 보기용 3D(색 포함, m 단위) · html = 휴대폰에서 돌려 보는 HTML 파일 1개(분해 슬라이더) · usdz = 아이폰 AR
  결과는 사용자 다운로드 폴더에 zip 으로, 대표 그림은 다음 mucca_snapshot 으로 온다. 휴대폰(카톡)으로 보내기는 사용자가 [에셋 ▾] 메뉴에서 직접 누른다`;
  }; hook();
})();
