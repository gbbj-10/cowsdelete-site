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

/* acad-ts 는 R12 DXF 의 BLOCK 기준점(10·20·30)을 읽지 않고 0,0 으로 둠 → DXF 글자에서 직접 찾음 { 블록 이름: [x,y,z] } */
function blockBases(text) {
  const out = new Map(); if (typeof text !== 'string') return out;
  const i0 = text.search(/\n\s*BLOCKS\s*\r?\n/); if (i0 < 0) return out;
  const L = text.slice(i0 + 1).split(/\r?\n/);   /* L[0] = 'BLOCKS', 그다음부터 [번호, 값] 짝 */
  for (let i = 1; i + 1 < L.length; i += 2) {
    const c = L[i].trim(), v = L[i + 1].trim();
    if (c === '0' && v === 'ENDSEC') break;
    if (c === '0' && v === 'BLOCK') {
      let nm = null, x = 0, y = 0, z = 0;
      for (let j = i + 2; j + 1 < L.length; j += 2) { const cc = L[j].trim(), vv = L[j + 1].trim(); if (cc === '0') break; if (cc === '2') nm = L[j + 1].replace(/\s+$/, ''); else if (cc === '10') x = +vv; else if (cc === '20') y = +vv; else if (cc === '30') z = +vv; }
      if (nm != null && (x || y || z)) out.set(nm, [x, y, z]);
    }
  }
  return out;
}
function rebuild(src, version, bases) {
  const doc = new A.CadDocument(A.ACadVersion[version] ?? A.ACadVersion.AC1027, true);
  try { doc.header.tileModeEnabled = true; doc.header.showModelSpace = true; } catch (_) {}
  /* AutoCAD AUDIT: SPLINETYPE 은 5(2차) 또는 6(3차) 이어야 함 (acad-ts 기본값 0) */
  try { if (!(doc.header.splineType >= 5 && doc.header.splineType <= 6)) doc.header.splineType = 6; } catch (_) {}
  /* 2026-10-25 AutoCAD 2024 확인: acad-ts 기본값이 ANGDIR=1(각도를 시계 방향으로 잼)·INSUNITS=0(단위 없음)이라
     AutoCAD 에서 이 도면에 각도를 치면 반대로 돌고, 다른 도면에 블록으로 넣을 때 mm 로 맞춰지지 않았음 → AutoCAD 미터법 기본값으로 */
  try { doc.header.angularDirection = 0; } catch (_) {}
  try { doc.header.insUnits = 4; } catch (_) {}   /* 4 = 밀리미터 (무카 CAD 단위) */
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
  const skipped = {}; let n = 0, nb = 0, ni = 0, na = 0;
  const skip = t => { skipped[t] = (skipped[t] || 0) + 1; };
  const common = (e, x) => {
    x.layer = layer(e.layer && e.layer.name);
    try { x.color = e.color; } catch (_) {}
    try { if (e.lineType && e.lineType.name && !/^by/i.test(e.lineType.name)) { const lt = doc.lineTypes.tryGetValue(e.lineType.name); if (lt) x.lineType = lt; } } catch (_) {}
    return x;
  };
  const txt = x => { try { x.style = std; } catch (_) {} return x; };
  /* 블록 (2026-10-25): 예전에는 블록 삽입(INSERT)을 건너뛰어 DWG 에서 블록이 통째로 빠졌음.
     쓰이는 블록만 새 도면에 정의(이름·기준점·속 도형·속성 정의)하고 삽입·속성을 옮긴다. 중첩 블록도 됨 */
  const BAD = /[<>\/\\":;?*|,=`]/g;
  const blocks = new Map(), used = new Set();
  const blockFor = br => {
    if (!br) return null;
    if (blocks.has(br)) return blocks.get(br);
    let name = (fixStr(br.name) || 'BLOCK').replace(BAD, '_').slice(0, 255), k = 2;
    if (/^\*(model|paper)_space/i.test(name)) return null;
    if (name.startsWith('*')) name = 'MUCCA' + name.slice(1);   /* 이름 없는(익명) 블록은 일반 블록으로 */
    while (used.has(name.toUpperCase()) || doc.blockRecords.contains(name)) name = name.replace(/_\d+$/, '') + '_' + (k++);
    used.add(name.toUpperCase());
    const R = new A.BlockRecord(name);
    /* 2026-10-25 AutoCAD 2024 AUDIT: acad-ts 기본값 canScale=true 가 BLOCK_RECORD 281=1(균일 축척만)로 써져서
       좌우 반전·X/Y 다른 배율 삽입이 "scale invalid → uniform" 으로 잡힘. AutoCAD 보통 블록처럼 0(비균일 허용)으로 */
    try { R.canScale = false; } catch (_) {}
    /* acad-ts 기본값 isExplodable=false → AutoCAD 에서 "분해 허용: 아니오"라 EXPLODE 가 안 됨. 보통 블록처럼 분해 허용 */
    try { R.isExplodable = true; } catch (_) {}
    try { let bp = br.blockEntity && br.blockEntity.basePoint; const q = bases && bases.get(br.name);
      if (q && (!bp || (!bp.x && !bp.y && !bp.z))) bp = { x: q[0], y: q[1], z: q[2] };
      if (bp) R.blockEntity.basePoint = new A.XYZ(bp.x, bp.y, bp.z || 0); } catch (_) {}
    doc.blockRecords.add(R); blocks.set(br, R); nb++;
    for (const e of br.entities) { const x = copy(e); if (x) try { put(R.entities, x); } catch (_) { skip(e.constructor.name); } }
    return R;
  };
  /* 넣기: acad-ts 는 삽입을 도면에 넣어도 그 속성(ATTRIB)·끝 표시(SEQEND)를 등록하지 않아 DWG 에 빈 참조로 써짐 → 직접 등록 */
  function put(list, x) {
    list.add(x);
    if (x instanceof A.Insert && x.attributes && x.attributes.length) {
      for (const a of x.attributes) if (!a.document) { try { a.owner = x; } catch (_) {} doc._addCadObject(a); }
      if (!x.attributes.seqend) { const q = new A.Seqend(); try { q.owner = x; } catch (_) {} x.attributes.seqend = q; }
      if (!x.attributes.seqend.document) doc._addCadObject(x.attributes.seqend);
    }
  }
  function copy(e) {
    const t = e.constructor.name;
    try {
      if (t === 'Polyline2D') {
        /* 2D 폴리선(POLYLINE+VERTEX) → LWPOLYLINE: 정점 연결·레이어 오류를 피함 */
        const vs = [...e.vertices].map(v => { const w = new A.LwPolylineVertex(); w.location = new A.XY(v.location.x, v.location.y); w.bulge = v.bulge || 0; return w; });
        if (vs.length < 2) { skip(t); return null; }
        const x = new A.LwPolyline(vs); x.isClosed = e.isClosed; try { x.elevation = e.elevation || 0; } catch (_) {}
        return common(e, x);
      }
      if (SIMPLE.includes(t)) {
        const x = e.clone();
        if (t === 'TextEntity' || t === 'MText') { x.value = fixStr(x.value); txt(x); }
        return common(e, x);
      }
      if (t === 'AttributeDefinition') {
        const x = e.clone(); x.value = fixStr(x.value); x.tag = fixStr(x.tag); try { x.prompt = fixStr(x.prompt); } catch (_) {}
        return common(e, txt(x));
      }
      if (t === 'Insert') {
        const R = blockFor(e.block); if (!R) { skip(t); return null; }
        const x = new A.Insert(R);
        const p = e.insertPoint || { x: 0, y: 0, z: 0 }; x.insertPoint = new A.XYZ(p.x, p.y, p.z || 0);
        x.xScale = e.xScale || 1; x.yScale = e.yScale || 1; x.zScale = e.zScale || 1; x.rotation = e.rotation || 0;
        try { if (e.normal) x.normal = new A.XYZ(e.normal.x, e.normal.y, e.normal.z); } catch (_) {}
        /* 속성: 새 삽입이 블록의 속성 정의로 이미 만든 속성이 있으면 같은 이름(태그)에 값만 넣고, 없으면 옮겨 붙임 */
        const have = new Map(); try { for (const a of x.attributes) have.set(String(a.tag).toUpperCase(), a); } catch (_) {}
        for (const a of (e.attributes || [])) {
          const tag = fixStr(a.tag), val = fixStr(a.value), h = have.get(String(tag).toUpperCase());
          try {
            if (h) { h.value = val; try { h.insertPoint = new A.XYZ(a.insertPoint.x, a.insertPoint.y, a.insertPoint.z || 0); h.height = a.height; h.rotation = a.rotation; } catch (_) {} }
            else { const c = a.clone(); c.tag = tag; c.value = val; common(a, txt(c)); x.attributes.push(c); }
            na++;
          } catch (_) { skip('Attribute'); }
        }
        ni++; return common(e, x);
      }
    } catch (_) {}
    skip(t); return null;
  }
  for (const e of src.modelSpace.entities) {
    const x = copy(e); if (!x) continue;
    try { put(doc.modelSpace.entities, x); n++; } catch (_) { skip(e.constructor.name); }
  }
  return { doc, n, skipped, blocks: nb, inserts: ni, attribs: na };
}

/* 진행 알림 (2026-10-25): acad-ts 가 부르는 globalThis.__acadProgress 를 화면으로 전달 (0.12초에 한 번까지) */
let lastP = 0;
const prog = (st, k, n) => { const t = Date.now(); if (t - lastP < 120 && k < n) return; lastP = t; self.postMessage({ progress: 1, st, k, n }); };
globalThis.__acadProgress = prog;

self.onmessage = e => {
  const { op, data, version } = e.data;
  try {
    if (op === 'read') {
      prog('open', 0, 1);
      let doc = A.DwgReader.readFromStream(data, () => {});
      const ver = String(A.ACadVersion[doc.header.version] || doc.header.version);
      /* 큰 DWG 메모리 절약 (2026-10-25): DXF 글자를 작은 조각 수천만 개로 모아 한 번에 합치지 않고,
         1MB 마다 바이트로 바꿔 Blob 으로 넘김 (30MB DWG 기준 최대 메모리 4.9GB → 2.2GB) */
      const chunks = [], enc = new TextEncoder(); let buf = '';
      new A.DxfWriter({ write(s) { buf += s; if (buf.length > 1048576) { chunks.push(enc.encode(buf)); buf = ''; } } }, doc).write();
      if (buf) chunks.push(enc.encode(buf)); doc = null; lastP = 0; prog('send', 1, 1);
      const blob = new Blob(chunks, { type: 'text/plain' }); chunks.length = 0;
      self.postMessage({ ok: true, dxf: blob, ver });
    } else if (op === 'write') {
      const src = A.DxfReader.readFromStream(new TextEncoder().encode(data), () => {});
      const { doc, n, skipped, blocks, inserts, attribs } = rebuild(src, version || 'AC1027', blockBases(data));
      const out = A.DwgWriter.writeToBuffer(doc);
      self.postMessage({ ok: true, dwg: out, n, skipped, blocks, inserts, attribs }, [out.buffer]);
    }
  } catch (x) { self.postMessage({ ok: false, error: String(x && x.message || x) }); }
};
