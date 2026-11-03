/* 무카 CAD — DWG 열기 새 변환기 (2026-11-03 테스트 서버 시험 → v1.10.8 본체)
   DWG 열기를 acadrust(MPL-2.0, Rust → WebAssembly)로 먼저 하고, 실패하면 지금 엔진(acad-ts)으로 다시 엶.
   - 공개·시험 DWG 137개: 두 엔진으로 연 화면 결과(도형 수·종류·범위·글자)가 모두 같음. 3·10·15MB 도면 열기 2~3배 빠름(변환만 약 4배), 메모리 약 1/3
   - 처음 한 번 변환기(약 1.5MB 압축 전송)를 받음. 파일은 서버로 올라가지 않음
   - 엔진 고정(시험용): localStorage 'mucca.dwgEngine' = 'ts' 면 acad-ts 만, 'rs' 면 acadrust 만(실패해도 다시 안 함)
   - 저장(DWG로 저장)은 그대로 acad-ts (AutoCAD 2024 에서 AUDIT 0 확인된 경로) */
(function () {
  'use strict';
  const D = window.MuccaDWG; if (!D || D.__rs) return;
  const WORKER = new URL('dwgrs-worker.js?v=2', (document.currentScript && document.currentScript.src) || location.href).href;
  const orig = D.toDxf.bind(D), origCancel = D.cancel.bind(D);
  let cur = null, rsUsed = false;
  const engine = () => { try { return localStorage.getItem('mucca.dwgEngine') || window.__dwgEngine || 'auto'; } catch (_) { return window.__dwgEngine || 'auto'; } };
  function runRs(file, onProgress) {
    return new Promise(async (ok, no) => {
      const buf = await file.arrayBuffer();
      let w; try { w = new Worker(WORKER); } catch (e) { return no(new Error('이 브라우저에서는 새 변환기를 쓸 수 없습니다')); }
      const mb = file.size / 1048576, expect = 2 + mb * 0.6, t0 = performance.now();
      /* acadrust 는 진행 알림이 없어서 경과 시간으로 막대를 채움 (끝나기 전엔 75% 를 넘지 않음) */
      const tick = setInterval(() => { try { onProgress && onProgress({ st: 'dxf', k: Math.min(0.95, (performance.now() - t0) / 1000 / expect), n: 1 }); } catch (_) {} }, 250);
      const end = () => { clearInterval(tick); try { w.terminate(); } catch (_) {} if (cur && cur.w === w) cur = null; };
      const lim = setTimeout(() => { end(); no(new Error('시간이 너무 오래 걸립니다')); }, Math.min(900000, 120000 + mb * 10000));
      cur = { w, stop: () => { clearTimeout(lim); end(); no(Object.assign(new Error('취소했습니다'), { cancel: true })); } };
      w.onmessage = e => {
        const d = e.data || {};
        if (d.progress) { if (d.st === 'load') try { onProgress && onProgress({ st: 'open', k: 0, n: 1 }); } catch (_) {} return; }
        clearTimeout(lim); end(); d.ok ? ok(d) : no(new Error(d.error || '변환 실패'));
      };
      w.onerror = e => { clearTimeout(lim); end(); no(new Error(e.message || '새 변환기를 불러오지 못했습니다')); };
      w.postMessage({ op: 'read', data: buf }, [buf]);
    });
  }
  D.__rs = true;
  D.toDxf = async function (file, onProgress) {
    const eng = engine();
    if (eng === 'ts') { const r = await orig(file, onProgress); r.engine = 'acad-ts'; D.lastEngine = r.engine; return r; }
    const t0 = performance.now();
    try {
      const r = await runRs(file, onProgress); rsUsed = true;
      r.engine = 'acadrust'; r.ms = Math.round(performance.now() - t0); D.lastEngine = r.engine;
      window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'DWG_RS_OK' });
      return r;
    } catch (e) {
      if (e && e.cancel) throw e;
      window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'DWG_RS_FAIL' });
      if (eng === 'rs') throw e;
      try { (window.log || console.log)(`새 변환기(acadrust)로 못 열어서 기존 변환기로 다시 엽니다 (${String(e && e.message || e).slice(0, 80)})`, ''); } catch (_) {}
      const r = await orig(file, onProgress); r.engine = 'acad-ts'; r.fallback = String(e && e.message || e); D.lastEngine = r.engine; return r;
    }
  };
  D.cancel = function () { if (cur) cur.stop(); else origCancel(); };
  D.rsLicense = 'acadrust 0.6.8 (MPL-2.0) · https://github.com/hakanaktt/acadrust';
})();
