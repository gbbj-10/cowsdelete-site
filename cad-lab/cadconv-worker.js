/* 무카 CAD 테스트 서버 — 외부 CAD 파일 → STEP 변환 작업 공간 (cadmpeg 0.6.7 · Apache-2.0 · WebAssembly)
   SolidWorks(.sldprt) · Fusion 360(.f3d) · Inventor(.ipt) · CATIA(.CATPart) · Rhino(.3dm) · FreeCAD(.FCStd) · IGES · SAT → STEP 바이트 */
let W = null;
async function load() {
  if (W) return W;
  const url = new URL('vendor/mucca_cadconv-0.6.7.wasm.gz?v=1', self.location.href).href;
  /* 빌드에 섞여 들어온 wasm-bindgen 자리표시 함수 4개는 실제로 불리지 않음 → 빈 함수로 채움 */
  /* 저장소·전송 크기를 줄이려고 gzip 으로 둠(56MB → 12.6MB) → 브라우저 안에서 풂 */
  const res = await fetch(url); if (!res.ok) throw new Error('변환 도구를 받지 못했습니다 (' + res.status + ')');
  let bytes = await res.arrayBuffer(); const h = new Uint8Array(bytes, 0, 2);
  if (h[0] === 0x1f && h[1] === 0x8b) bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();   // 서버가 이미 풀어 주면 그대로
  const mod = await WebAssembly.compile(bytes);
  const imp = {}; for (const i of WebAssembly.Module.imports(mod)) (imp[i.module] = imp[i.module] || {})[i.name] = () => 0;
  W = (await WebAssembly.instantiate(mod, imp)).exports; return W;
}
const txt = (p, n) => new TextDecoder().decode(new Uint8Array(W.memory.buffer, p, n).slice());
self.onmessage = async e => {
  const { data, ext } = e.data;
  try {
    self.postMessage({ progress: 1, st: 'load' }); await load(); self.postMessage({ progress: 1, st: 'conv' });
    const src = new Uint8Array(data), eb = new TextEncoder().encode(ext || '');
    const p = W.mcc_alloc(src.length); new Uint8Array(W.memory.buffer, p, src.length).set(src);
    const q = W.mcc_alloc(Math.max(1, eb.length)); new Uint8Array(W.memory.buffer, q, eb.length).set(eb);
    const rc = W.mcc_to_step(p, src.length, q, eb.length); W.mcc_free(p, src.length); W.mcc_free(q, Math.max(1, eb.length));
    const msg = txt(W.mcc_msg_ptr(), W.mcc_msg_len());
    if (rc) { W.mcc_clear(); throw new Error(msg || '변환 실패'); }
    const step = new Uint8Array(W.memory.buffer, W.mcc_out_ptr(), W.mcc_out_len()).slice(); W.mcc_clear();
    let info = {}; try { info = JSON.parse(msg); } catch (_) { }
    self.postMessage({ ok: true, step, info }, [step.buffer]);
  } catch (x) { self.postMessage({ ok: false, error: String(x && x.message || x) }); }
};
