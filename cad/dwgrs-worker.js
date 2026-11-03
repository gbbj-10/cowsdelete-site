/* 무카 CAD — DWG 열기 변환 작업 공간 (acadrust 0.6.8 · MPL-2.0 · WebAssembly)
   DWG 바이트 → acadrust 로 읽기 → DXF 글자(파일과 같은 버전) → Blob 으로 넘김
   acad-ts(현재 본체)보다 큰 파일에서 약 4배 빠르고 메모리를 약 1/3 만 씀 (2026-11-03 시험) */
let W = null;
async function load() {
  if (W) return W;
  const url = new URL('vendor/mucca_dwg-0.6.8.wasm?v=2', self.location.href).href;
  let r;
  try { r = await WebAssembly.instantiateStreaming(fetch(url), {}); }
  catch (_) { const b = await (await fetch(url)).arrayBuffer(); r = await WebAssembly.instantiate(b, {}); }
  W = r.instance.exports; return W;
}
const text = (p, n) => new TextDecoder().decode(new Uint8Array(W.memory.buffer, p, n).slice());
self.onmessage = async e => {
  const { op, data } = e.data;
  try {
    if (op !== 'read') throw new Error('지원하지 않는 작업');
    self.postMessage({ progress: 1, st: 'load', k: 0, n: 1 });
    await load();
    const src = new Uint8Array(data);
    const ver = String.fromCharCode(...src.subarray(0, 6));
    self.postMessage({ progress: 1, st: 'conv', k: 0, n: 1 });
    const p = W.mdwg_alloc(src.length);
    new Uint8Array(W.memory.buffer, p, src.length).set(src);
    const rc = W.mdwg_to_dxf(p, src.length, 1);
    W.mdwg_free(p, src.length);
    if (rc) { const msg = text(W.mdwg_err_ptr(), W.mdwg_err_len()); W.mdwg_clear(); throw new Error(msg || '변환 실패'); }
    /* 깨진 파일은 failsafe 로 읽으면 '빈 도면'이 됨 → 실패로 보고 기존 변환기(acad-ts)에 넘김 */
    const cnt = W.mdwg_count ? W.mdwg_count() : -1;
    if (cnt === 0) { W.mdwg_clear(); throw new Error('읽을 수 있는 도형이 없습니다 (파일이 깨졌을 수 있음)'); }
    /* 결과를 1MB 조각으로 복사해 Blob 으로 (wasm 메모리를 그대로 넘기지 않음) */
    const op0 = W.mdwg_out_ptr(), n = W.mdwg_out_len(), parts = [];
    for (let i = 0; i < n; i += 1048576) parts.push(new Uint8Array(W.memory.buffer, op0 + i, Math.min(1048576, n - i)).slice());
    W.mdwg_clear();
    const blob = new Blob(parts, { type: 'text/plain' }); parts.length = 0;
    self.postMessage({ ok: true, dxf: blob, ver, bytes: n, count: cnt });
  } catch (x) { self.postMessage({ ok: false, error: String(x && x.message || x) }); }
};
