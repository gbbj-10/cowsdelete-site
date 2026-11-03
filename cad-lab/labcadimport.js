/* 무카 CAD 테스트 서버 — 외부 CAD 파일 가져오기 (2026-11-03, cadmpeg 0.6.7 · Apache-2.0 · WebAssembly)
   [열기]·끌어다 놓기로 SolidWorks(.sldprt) · Fusion 360(.f3d) · Inventor(.ipt) · CATIA(.CATPart) · Rhino(.3dm) · FreeCAD(.FCStd)
   · IGES(.igs/.iges) · SAT(.sat) 를 열면 브라우저 안에서 STEP 으로 바꾼 뒤 3D 창에 부품으로 넣음. STEP(.step/.stp)은 바로 넣음.
   파일은 서버로 올라가지 않음. 넣은 뒤에는 5면 자가검사 · 도면 만들기 · STEP 저장 · 에셋을 그대로 씀
   AI 명령: 없음(파일은 사용자가 엶) · 시험용: window.LABCADIMPORT.toStep(file) */
(function () {
  'use strict';
  const NATIVE = /\.(sldprt|f3d|ipt|catpart|3dm|fcstd|igs|iges|sat|sab)$/i, STEP = /\.(step|stp)$/i;
  const WORKER = new URL('cadconv-worker.js?v=1', (document.currentScript && document.currentScript.src) || location.href).href;
  const NAMES = { sldprt: 'SolidWorks', f3d: 'Fusion 360', ipt: 'Inventor', catpart: 'CATIA', '3dm': 'Rhino', fcstd: 'FreeCAD', igs: 'IGES', iges: 'IGES', sat: 'ACIS SAT', sab: 'ACIS SAB', step: 'STEP', stp: 'STEP' };
  const extOf = n => (String(n).match(/\.([^.]+)$/) || [])[1] ? String(n).match(/\.([^.]+)$/)[1].toLowerCase() : '';
  const evt = c => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: c }); } catch (_) { } };
  let used = false;
  function toStep(file) {
    return new Promise(async (ok, no) => {
      const buf = await file.arrayBuffer(); let w;
      try { w = new Worker(WORKER); } catch (e) { return no(new Error('이 브라우저에서는 변환을 쓸 수 없습니다')); }
      const t = setTimeout(() => { try { w.terminate(); } catch (_) { } no(new Error('시간이 너무 오래 걸립니다')); }, Math.min(600000, 120000 + file.size / 1048576 * 20000));
      w.onmessage = e => { const d = e.data || {}; if (d.progress) return; clearTimeout(t); try { w.terminate(); } catch (_) { } d.ok ? ok(d) : no(new Error(d.error || '변환 실패')); };
      w.onerror = e => { clearTimeout(t); try { w.terminate(); } catch (_) { } no(new Error(e.message || '변환 도구를 불러오지 못했습니다')); };
      w.postMessage({ data: buf, ext: extOf(file.name) }, [buf]);
    });
  }
  async function importCad(f) {
    const ext = extOf(f.name), kind = NAMES[ext] || ext.toUpperCase(), mb = f.size / 1048576, t0 = performance.now();
    evt('CADIMP_TRY_' + ext.toUpperCase());
    log(`${f.name}: ${kind} 파일을 3D 로 여는 중…${!STEP.test(f.name) && !used ? ' (처음 한 번은 변환 도구 약 13MB를 받습니다. 파일은 서버로 올라가지 않습니다)' : ''}`, 'me');
    const G = typeof openGauge === 'function' ? openGauge(f.name, mb, null) : null; if (G) G.set(5, STEP.test(f.name) ? 'STEP 읽는 중' : kind + ' → STEP 바꾸는 중', 60);
    try {
      let step, info = {};
      if (STEP.test(f.name)) step = new Uint8Array(await f.arrayBuffer());
      else { used = true; const r = await toStep(f); step = r.step; info = r.info || {}; }
      if (G) G.set(65, '3D 엔진에 넣는 중', 90);
      const v = window.LAB3D._v(); await v.ensure3D(); if (v.mode() === '2d') v.setMode('split'); const R = await v.ensureOCC();
      const shape = await R.importSTEP(new Blob([step], { type: 'application/step' }));
      if (!shape || !shape.wrapped) throw new Error('STEP 안에 3D 형상이 없습니다');
      /* 변환이 깨진 경우(끝없는 면 등): 크기가 말이 안 되면 넣지 않음 (11-03 시험: CATIA 공개 시험 파일 1개가 이렇게 나옴) */
      try { const B = shape.boundingBox.bounds, sz = [0, 1, 2].map(i => B[1][i] - B[0][i]);
        if (!sz.every(x => isFinite(x) && x >= 0 && x < 1e6)) { try { shape.delete(); } catch (_) { } throw new Error(`${kind} 파일을 바꾸는 중 형상이 깨졌습니다(크기 계산 불가)`); } } catch (e) { if (/깨졌/.test(e.message)) throw e; }
      window.__muccaImport = [shape];
      const nm = f.name.replace(/\.[^.]+$/, '').replace(/["\\]/g, '').slice(0, 40) || '가져온 부품';
      const r = (await window.LABPHOTO.cmds([{ cmd: 'model3d', code: `part("I1", ${JSON.stringify(nm)}, "metal", window.__muccaImport.shift())` }])).results[0];
      if (!r.ok) throw new Error(r.error);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      if (G) G.done(true, `${r.size_mm.join(' × ')} mm · ${secs}초`, '3D 로 열었습니다');
      log(`${f.name}: ${kind} → 3D 열기 완료 (크기 ${r.size_mm.join(' × ')} mm${info.faces ? ` · 면 ${info.faces}개` : ''}${info.decode_losses || info.export_losses ? ` · 바뀌며 빠진 정보 ${(info.decode_losses || 0) + (info.export_losses || 0)}건` : ''} · ${secs}초). 이제 [도면 만들기]·[STEP 저장]·5면 자가검사를 쓸 수 있습니다.`, 'ok');
      if (!STEP.test(f.name)) log('외부 CAD 변환: 오픈소스 cadmpeg(Apache-2.0) [테스트 서버]. 형식마다 읽는 정도가 다릅니다(곡면·조립·치수 정보는 빠질 수 있음).', '');
      evt('CADIMP_OK_' + ext.toUpperCase());
    } catch (e) {
      if (G) G.done(false, String(e && e.message || e).slice(0, 80));
      log(`${f.name}: 3D 로 열지 못했습니다 (${String(e && e.message || e).slice(0, 200)}). 원래 프로그램에서 STEP(.step)으로 저장해 열면 가장 확실합니다.`, 'err');
      evt('CADIMP_FAIL_' + ext.toUpperCase());
    }
    return true;
  }
  /* [열기]·끌어다 놓기 연결 */
  try {
    const _os = openSpecial;
    openSpecial = async function (f) { if (f && (NATIVE.test(f.name) || STEP.test(f.name))) return importCad(f); return _os(f); };
    const fi = document.getElementById('fileIn'); if (fi && !/sldprt/.test(fi.accept)) fi.accept += ',.step,.stp,.sldprt,.f3d,.ipt,.CATPart,.3dm,.FCStd,.igs,.iges,.sat';
  } catch (e) { console.warn('labcadimport hook', e); }
  window.LABCADIMPORT = { toStep, importCad };
})();
