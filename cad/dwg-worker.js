/* 무카 CAD — DWG 변환 작업 공간 (Worker, ES 모듈)
   열기: DWG → acad-ts → DXF 글자
   저장: 무카 CAD DXF(R12) → acad-ts 로 읽기 → 기본값을 다 갖춘 새 도면에 옮겨 담기 → DWG
   (R12 를 그대로 DWG 로 쓰면 AutoCAD 가 "복구 필요"를 띄움: 핸들 표·레이아웃·2D 폴리선 정점 오류 — 2026-10-21 AutoCAD 2024 로 확인) */
import * as A from './vendor/acad-ts-3.6.0-m1.min.js';

const unesc = s => typeof s === 'string' ? s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : s;
/* \U+ 풀기 + UTF-8 바이트가 1252 로 잘못 읽힌 글자 되돌리기 */
const W1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
function fixStr(s) {
  if (typeof s !== 'string') return s;
  s = unesc(s);
  if (/[À-ÿ]/.test(s)) {
    const bytes = []; let ok = true;
    for (const c of s) { const k = c.charCodeAt(0); if (k < 256) bytes.push(k); else if (W1252[k] != null) bytes.push(W1252[k]); else { ok = false; break; } }
    if (ok) { try { s = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)); } catch (_) {} }
  }
  return s;
}

function rebuild(src, version) {
  const doc = new A.CadDocument(A.ACadVersion[version] ?? A.ACadVersion.AC1027, true);
  try { doc.header.tileModeEnabled = true; doc.header.showModelSpace = true; } catch (_) {}
  /* AutoCAD AUDIT: SPLINETYPE 은 5(2차) 또는 6(3차) 이어야 함 (acad-ts 기본값 0) */
  try { if (!(doc.header.splineType >= 5 && doc.header.splineType <= 6)) doc.header.splineType = 6; } catch (_) {}
  /* 한글이 ??? 로 안 보이게 기본 문자 스타일을 맑은 고딕(Windows 기본 TrueType)으로 */
  const std = doc.textStyles.get('Standard');
  try { std.filename = 'malgun.ttf'; std.bigFontFilename = null; } catch (_) {}
  for (const lt of src.lineTypes) {
    try {
      if (doc.lineTypes.contains(lt.name)) continue;
      const c = lt.clone(); c.description = fixStr(c.description) || '';
      c.description = c.description.replace(/[^\x20-\x7e가-힣]/g, '');
      doc.lineTypes.add(c);
    } catch (_) {}
  }
  const layer = name => {
    if (!name) return doc.layers.get('0');
    const nm = fixStr(name); let L = doc.layers.tryGetValue(nm); if (L) return L;
    const s = src.layers.tryGetValue(name); L = new A.Layer(); L.name = nm;
    try { if (s) L.color = s.color; } catch (_) {}
    try { if (s && s.lineType && s.lineType.name) { const lt = doc.lineTypes.tryGetValue(s.lineType.name); if (lt) L.lineType = lt; } } catch (_) {}
    doc.layers.add(L); return L;
  };
  const SIMPLE = ['Line', 'Circle', 'Arc', 'TextEntity', 'Solid', 'Point', 'Ellipse', 'MText', 'LwPolyline', 'Spline'];
  const skipped = {}; let n = 0;
  for (const e of src.modelSpace.entities) {
    const t = e.constructor.name; let x = null;
    try {
      if (t === 'Polyline2D') {
        /* 2D 폴리선(POLYLINE+VERTEX) → LWPOLYLINE: 정점 연결·레이어 오류를 피함 */
        const vs = [...e.vertices].map(v => { const w = new A.LwPolylineVertex(); w.location = new A.XY(v.location.x, v.location.y); w.bulge = v.bulge || 0; return w; });
        if (vs.length < 2) { skipped[t] = (skipped[t] || 0) + 1; continue; }
        x = new A.LwPolyline(vs); x.isClosed = e.isClosed; try { x.elevation = e.elevation || 0; } catch (_) {}
      } else if (SIMPLE.includes(t)) {
        x = e.clone();
        if (t === 'TextEntity' || t === 'MText') { x.value = fixStr(x.value); try { x.style = std; } catch (_) {} }
      } else { skipped[t] = (skipped[t] || 0) + 1; continue; }
      x.layer = layer(e.layer && e.layer.name);
      try { x.color = e.color; } catch (_) {}
      try { if (e.lineType && e.lineType.name && !/^by/i.test(e.lineType.name)) { const lt = doc.lineTypes.tryGetValue(e.lineType.name); if (lt) x.lineType = lt; } } catch (_) {}
      doc.modelSpace.entities.add(x); n++;
    } catch (_) { skipped[t] = (skipped[t] || 0) + 1; }
  }
  return { doc, n, skipped };
}

self.onmessage = e => {
  const { op, data, version } = e.data;
  try {
    if (op === 'read') {
      let doc = A.DwgReader.readFromStream(data, () => {});
      const ver = String(A.ACadVersion[doc.header.version] || doc.header.version);
      /* 큰 DWG 메모리 절약 (2026-10-25): DXF 글자를 작은 조각 수천만 개로 모아 한 번에 합치지 않고,
         1MB 마다 바이트로 바꿔 Blob 으로 넘김 (30MB DWG 기준 최대 메모리 4.9GB → 2.2GB) */
      const chunks = [], enc = new TextEncoder(); let buf = '';
      new A.DxfWriter({ write(s) { buf += s; if (buf.length > 1048576) { chunks.push(enc.encode(buf)); buf = ''; } } }, doc).write();
      if (buf) chunks.push(enc.encode(buf)); doc = null;
      const blob = new Blob(chunks, { type: 'text/plain' }); chunks.length = 0;
      self.postMessage({ ok: true, dxf: blob, ver });
    } else if (op === 'write') {
      const src = A.DxfReader.readFromStream(new TextEncoder().encode(data), () => {});
      const { doc, n, skipped } = rebuild(src, version || 'AC1027');
      const out = A.DwgWriter.writeToBuffer(doc);
      self.postMessage({ ok: true, dwg: out, n, skipped }, [out.buffer]);
    }
  } catch (x) { self.postMessage({ ok: false, error: String(x && x.message || x) }); }
};
