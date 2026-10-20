/* 무카 CAD — DWG 열기·저장 (브라우저 안에서 변환)
   - acad-ts (MIT, ACadSharp 의 TypeScript 이식) 를 DWG 를 열거나 저장할 때만 받음 (약 250KB, cad/vendor/)
   - 파일은 서버로 올라가지 않고 이 브라우저 안에서만 변환됨
   - 변환은 별도 작업 공간(Worker)에서 돌려서, 실패해도 캐드 화면은 멈추지 않음
   열기: DWG → (acad-ts) → DXF 글자 → 무카 CAD DXF 가져오기
   저장: 무카 CAD DXF 내보내기 → (acad-ts) → DWG (기본 AutoCAD 2013 형식) */
(function () {
  'use strict';
  const VER = '3.6.0';
  /* 무카 CAD 서버에 함께 올린 묶음 (클래스 이름 보존 빌드 — 원본 압축판은 브라우저에서 이름이 바뀌어 동작 안 함) */
  const LIB = new URL(`vendor/acad-ts-${VER}.min.js`, (document.currentScript && document.currentScript.src) || location.href).href;
  const SRC = `import * as A from '${LIB}';
const unesc = s => typeof s === 'string' ? s.replace(/\\\\U\\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : s;
function fixText(doc) {
  const fix = e => { for (const k of ['value', 'prompt', 'tag']) { try { if (typeof e[k] === 'string' && e[k].includes('\\\\U+')) e[k] = unesc(e[k]); } catch (_) {} } };
  try { for (const e of doc.modelSpace.entities) fix(e); } catch (_) {}
  try { for (const br of doc.blockRecords) { try { for (const e of br.entities) fix(e); } catch (_) {} } } catch (_) {}
}
self.onmessage = e => {
  const { op, data, version } = e.data, notes = [];
  try {
    if (op === 'read') {
      const doc = A.DwgReader.readFromStream(data, (s, n) => notes.push(n && n.message));
      const parts = []; const w = new A.DxfWriter({ write(s) { parts.push(s); } }, doc); w.write();
      const ver = String(A.ACadVersion[doc.header.version] || doc.header.version);
      self.postMessage({ ok: true, dxf: parts.join(''), ver });
    } else if (op === 'write') {
      const doc = A.DxfReader.readFromStream(new TextEncoder().encode(data), (s, n) => notes.push(n && n.message));
      doc.createDefaults(); fixText(doc);
      doc.header.version = A.ACadVersion[version || 'AC1027'];
      const out = A.DwgWriter.writeToBuffer(doc);
      self.postMessage({ ok: true, dwg: out }, [out.buffer]);
    }
  } catch (x) { self.postMessage({ ok: false, error: String(x && x.message || x) }); }
};`;
  let used = false;
  function run(msg, transfer, timeoutMs = 180000) {
    used = true;
    return new Promise((ok, no) => {
      let w, url;
      try { url = URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' })); w = new Worker(url, { type: 'module' }); }
      catch (e) { return no(new Error('이 브라우저에서는 DWG 변환을 쓸 수 없습니다')); }
      const end = () => { try { w.terminate(); } catch (_) {} URL.revokeObjectURL(url); };
      const t = setTimeout(() => { end(); no(new Error('시간이 너무 오래 걸립니다')); }, timeoutMs);
      w.onmessage = e => { clearTimeout(t); end(); e.data.ok ? ok(e.data) : no(new Error(e.data.error)); };
      w.onerror = e => { clearTimeout(t); end(); no(new Error(e.message || '변환 도구를 불러오지 못했습니다 (인터넷 연결 확인)')); };
      w.postMessage(msg, transfer || []);
    });
  }
  const NAMES = { AC1009: 'R12', AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018' };
  window.MuccaDWG = {
    VER, LIB, NAMES,
    license: 'acad-ts (MIT) · https://github.com/node-projects/acad-ts — ACadSharp (MIT) 이식',
    get firstTime() { return !used; },
    /* DWG File → { dxf: 문자열, ver: 'AC1032' 등 } */
    async toDxf(file) { const buf = await file.arrayBuffer(); return run({ op: 'read', data: buf }, [buf]); },
    /* 무카 CAD DXF 문자열 → DWG Uint8Array (기본 AutoCAD 2013 형식) */
    async fromDxf(dxfText, version = 'AC1027') { const r = await run({ op: 'write', data: dxfText, version }); return r.dwg; }
  };
})();
