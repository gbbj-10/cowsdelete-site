/* 무카 CAD — DWG 열기 (브라우저 안에서 DWG → DXF 변환)
   - LibreDWG(GPLv3, 오픈소스)를 웹어셈블리로 만든 @mlightcad/libredwg-web 을 DWG 를 열 때만 받음
   - 파일은 서버로 올라가지 않고 이 브라우저 안에서만 변환됨
   - 변환은 별도 작업 공간(Worker)에서 돌려서, 변환이 실패해도 캐드 화면은 멈추지 않음 */
(function () {
  'use strict';
  const VER = '0.8.1';
  const BASE = `https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@${VER}/wasm/`;
  const SRC = `import createModule from '${BASE}libredwg-web.js';
self.onmessage = async e => {
  try {
    const m = await createModule({ locateFile: f => '${BASE}' + f, print() {}, printErr() {} });
    m.FS.writeFile('in.dwg', new Uint8Array(e.data));
    const code = m.dwg_write_dxf('in.dwg', 'out.dxf');
    let out = null; try { out = m.FS.readFile('out.dxf'); } catch (_) {}
    if (!out || !out.length) throw new Error('변환 결과가 비었습니다 (코드 ' + code + ')');
    self.postMessage({ ok: true, code, dxf: out }, [out.buffer]);
  } catch (x) { self.postMessage({ ok: false, error: String(x && x.message || x) }); }
};`;
  let used = false;
  window.MuccaDWG = {
    VER, BASE,
    license: 'LibreDWG (GPLv3) · https://www.gnu.org/software/libredwg/ · 웹 버전 https://github.com/mlightcad/libredwg-web',
    get firstTime() { return !used; },
    /* DWG File → DXF 바이트(Uint8Array) */
    toDxf(file, timeoutMs = 180000) {
      used = true;
      return new Promise((ok, no) => {
        let w, url;
        try { url = URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' })); w = new Worker(url, { type: 'module' }); }
        catch (e) { return no(new Error('이 브라우저에서는 DWG 변환을 쓸 수 없습니다')); }
        const end = () => { try { w.terminate(); } catch (_) {} URL.revokeObjectURL(url); };
        const t = setTimeout(() => { end(); no(new Error('시간이 너무 오래 걸립니다')); }, timeoutMs);
        w.onmessage = e => { clearTimeout(t); end(); e.data.ok ? ok(e.data.dxf) : no(new Error(e.data.error)); };
        w.onerror = e => { clearTimeout(t); end(); no(new Error(e.message || '변환 도구를 불러오지 못했습니다 (인터넷 연결 확인)')); };
        file.arrayBuffer().then(buf => w.postMessage(buf, [buf]), err => { clearTimeout(t); end(); no(err); });
      });
    }
  };
})();
