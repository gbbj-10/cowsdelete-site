/* 무카 CAD — DWG 열기·저장 (브라우저 안에서 변환)
   - acad-ts (MIT, ACadSharp 의 TypeScript 이식) 를 DWG 를 열거나 저장할 때만 받음 (약 250KB, cad/vendor/, 큰 파일 속도 수정판 m1)
   - 파일은 서버로 올라가지 않고 이 브라우저 안에서만 변환됨
   - 변환은 별도 작업 공간(dwg-worker.js)에서 돌려서, 실패해도 캐드 화면은 멈추지 않음
   열기: DWG → (acad-ts) → DXF 글자 → 무카 CAD DXF 가져오기
   저장: 무카 CAD DXF 내보내기 → (acad-ts, 새 도면에 옮겨 담기) → DWG (기본 AutoCAD 2013 형식) */
(function () {
  'use strict';
  const VER = '3.6.0';
  const WORKER = new URL('dwg-worker.js?v=6', (document.currentScript && document.currentScript.src) || location.href).href;
  let used = false, cur = null;
  /* onProgress({st,k,n}): 작업 공간의 진행 알림 (open → read → build → dxf → send) */
  function run(msg, transfer, timeoutMs = 180000, onProgress) {
    used = true;
    return new Promise((ok, no) => {
      let w;
      try { w = new Worker(WORKER, { type: 'module' }); }
      catch (e) { return no(new Error('이 브라우저에서는 DWG 변환을 쓸 수 없습니다')); }
      const end = () => { try { w.terminate(); } catch (_) {} if (cur && cur.w === w) cur = null; };
      const t = setTimeout(() => { end(); no(new Error('시간이 너무 오래 걸립니다')); }, timeoutMs);
      cur = { w, stop: () => { clearTimeout(t); end(); no(Object.assign(new Error('취소했습니다'), { cancel: true })); } };
      w.onmessage = e => { if (e.data && e.data.progress) { try { onProgress && onProgress(e.data); } catch (_) {} return; } clearTimeout(t); end(); e.data.ok ? ok(e.data) : no(new Error(e.data.error)); };
      w.onerror = e => { clearTimeout(t); end(); no(new Error(e.message || '변환 도구를 불러오지 못했습니다 (인터넷 연결 확인)')); };
      w.postMessage(msg, transfer || []);
    });
  }
  const NAMES = { AC1009: 'R12', AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018' };
  window.MuccaDWG = {
    VER, WORKER, NAMES,
    license: 'acad-ts (MIT) · https://github.com/node-projects/acad-ts — ACadSharp (MIT) 이식',
    get firstTime() { return !used; },
    /* DWG File → { dxf: Blob(DXF 글자), ver: 'AC1032' 등 } · 시간 제한은 파일 크기에 맞춤 (3분 + 1MB 당 15초, 최대 15분) */
    async toDxf(file, onProgress) { const buf = await file.arrayBuffer(); return run({ op: 'read', data: buf }, [buf], Math.min(900000, 180000 + file.size / 1048576 * 15000), onProgress); },
    /* 지금 하는 변환 취소 (도면 열기 게이지의 [취소]) */
    cancel() { if (cur) cur.stop(); },
    /* 무카 CAD DXF 문자열 → DWG Uint8Array (기본 AutoCAD 2013 형식) */
    async fromDxf(dxfText, version = 'AC1027') { const r = await run({ op: 'write', data: dxfText, version }); this.lastSave = { n: r.n, blocks: r.blocks || 0, inserts: r.inserts || 0, attribs: r.attribs || 0, skipped: r.skipped || {} }; return r.dwg; },
    lastSave: null,
  };
})();
