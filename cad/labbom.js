/* 무카 CAD v1.10.5 — 표(BOM) → 엑셀 (명령 BOM · 표내보내기 · 물량)
   - PDF(글자가 들어 있는 PDF: 캐드에서 출력한 ISO·배관도·부품도) 여러 장을 고르면 쪽마다 BOM 표를 찾아 엑셀로 저장
   - 지금 도면(DWG·DXF)의 글자, 또는 선택한 글자로도 같은 표를 만듦
   - '같은 품목 합산' 시트: 여러 장 ISO 의 같은 품목(설명·규격이 같은 줄)을 수량끼리 더함 → 견적·자재 신청용
   - 모든 처리는 이 브라우저 안에서만 함 (도면·PDF 를 서버로 보내지 않음). PDF 읽기 도구(pdf.js)만 처음 한 번 받음
   문의 21번 (11-02) 「PDF 도면 BOM 엑셀로 변환」 */
(function () {
  'use strict';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const KW = /(Q'?TY|QUANT|수량|DESC|품명|명칭|NAME|SIZE|규격|사이즈|MAT'?L|MATERIAL|재질|PT\.?\s*NO|^NO\.?$|ITEM|품번|번호|UNIT|단위|SPEC|비고|REMARK|WEIGHT|중량|DIA|NPS|SCH|CODE|코드)/i;
  const QTYK = /(Q'?TY|QUANT|수량)/i;
  const IDK = /(PT\.?\s*NO|^NO\.?$|ITEM|품번|^번호$|MARK)/i;

  let pdfLib = null;
  function loadPdf() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfLib) return pdfLib;
    pdfLib = new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js';
      s.onload = () => { if (!window.pdfjsLib) return no(new Error('PDF 읽기 도구를 불러오지 못했습니다')); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = () => { pdfLib = null; no(new Error('PDF 읽기 도구를 받지 못했습니다 (인터넷 연결 확인)')); };
      document.head.appendChild(s);
    });
    return pdfLib;
  }

  /* PDF → 글자 조각 [{x,y,w,h,s,page}] */
  async function pdfItems(files, onProg) {
    const lib = await loadPdf(); const out = []; let pageNo = 0, noText = 0;
    for (const f of files) {
      const pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        pageNo++; onProg && onProg(`${f.name} ${i}/${pdf.numPages}쪽 읽는 중…`);
        const pg = await pdf.getPage(i); const tc = await pg.getTextContent();
        const label = files.length > 1 || pdf.numPages > 1 ? `${f.name.replace(/\.pdf$/i, '')}${pdf.numPages > 1 ? ' p' + i : ''}` : f.name.replace(/\.pdf$/i, '');
        let n = 0;
        for (const it of tc.items) {
          const s = String(it.str || '').trim(); if (!s) continue;
          const t = it.transform; const h = Math.hypot(t[2], t[3]) || it.height || 1;
          out.push({ x: t[4], y: t[5], w: it.width || s.length * h * 0.55, h, s, page: label }); n++;
        }
        if (!n) noText++;
      }
    }
    return { items: out, pages: pageNo, noText };
  }

  /* 도면 글자 → 글자 조각 */
  function entItems(ents) {
    const out = [];
    const tw = e => { try { return typeof textW === 'function' ? textW(e) : 0; } catch (_) { return 0; } };
    for (const e of ents) {
      if (!e || (e.type !== 'text' && e.type !== 'mtext')) continue;
      if (Math.abs(((e.rot || 0) % 180 + 180) % 180) > 1) continue; /* 세로 글자는 표에서 뺌 */
      const lines = String(e.s != null ? e.s : (e.text || '')).replace(/\\P/g, '\n').split('\n');
      const h = e.h || 2.5; const p = e.p || e.at || { x: 0, y: 0 };
      lines.forEach((s, k) => {
        s = s.replace(/\{\\[^;]*;|\}|\\[A-Za-z][^;]*;/g, '').trim(); if (!s) return;
        let w = lines.length === 1 ? tw(e) : 0; if (!w) w = s.length * h * 0.75;
        let x = p.x; if (e.align === 'center') x -= w / 2; else if (e.align === 'right') x -= w;
        out.push({ x, y: p.y - k * h * 1.6, w, h, s, page: '도면' });
      });
    }
    return out;
  }

  const med = a => { if (!a.length) return 1; const b = [...a].sort((p, q) => p - q); return b[b.length >> 1]; };

  /* 한 쪽의 글자 → 줄(행) — 같은 높이 글자를 묶고, 붙어 있는 조각은 한 칸으로 */
  function rowsOf(items) {
    const hm = med(items.map(i => i.h));
    const srt = [...items].sort((a, b) => b.y - a.y);
    const rows = [];
    for (const it of srt) {
      const r = rows.length && Math.abs(rows[rows.length - 1].y - it.y) < hm * 0.5 ? rows[rows.length - 1] : null;
      if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
    }
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      const cells = [];
      for (const it of r.items) {
        const c = cells[cells.length - 1];
        if (c && it.x - (c.x + c.w) < Math.max(it.h, c.h) * 0.35) { c.s += (it.x - (c.x + c.w) > it.h * 0.1 ? ' ' : '') + it.s; c.w = it.x + it.w - c.x; }
        else cells.push({ x: it.x, w: it.w, h: it.h, s: it.s });
      }
      r.cells = cells;
    }
    return { rows, hm };
  }

  /* 한 쪽에서 표 찾기: 머리줄(QTY·DESCRIPTION·SIZE 처럼 표 머리 낱말 2개 이상)부터 아래로 */
  function tablesOf(items) {
    const { rows, hm } = rowsOf(items);
    const isHead = r => r.cells.filter(c => KW.test(c.s) && c.s.length <= 24).length >= 2;
    const tables = [];
    for (let i = 0; i < rows.length; i++) {
      if (!isHead(rows[i])) continue;
      const head = rows[i].cells;
      const cx = head.map(c => c.x + c.w / 2);
      const x0 = head[0].x - hm * 3, x1 = head[head.length - 1].x + head[head.length - 1].w + hm * 12;
      const body = []; let lastY = rows[i].y; const pitch = hm * 4;
      for (let j = i + 1; j < rows.length; j++) {
        const r = rows[j];
        if (isHead(r)) break;
        const cells = r.cells.filter(c => c.x + c.w > x0 && c.x < x1);
        if (!cells.length) { if (lastY - r.y > pitch * 2) break; continue; }
        if (lastY - r.y > pitch * 2.5) break;
        const line = new Array(head.length).fill('');
        for (const c of cells) {
          const m = c.x + c.w / 2; let k = 0, best = 1e18;
          for (let q = 0; q < cx.length; q++) { const d = Math.abs(m - cx[q]); if (d < best) { best = d; k = q; } }
          /* 왼쪽 정렬 칸(설명처럼 긴 글)은 시작점이 머리 칸 시작점과 더 가까우면 그 칸 */
          for (let q = 0; q < head.length; q++) if (Math.abs(c.x - head[q].x) < hm * 0.8) { k = q; break; }
          line[k] = line[k] ? line[k] + ' ' + c.s : c.s;
        }
        body.push(line); lastY = r.y;
      }
      if (body.length) tables.push({ head: head.map(c => c.s), body });
    }
    return { tables, rows };
  }

  /* 머리줄이 없으면 글자 전체를 칸 위치로 나눠 표로 */
  function plainTable(rows, hm) {
    const xs = [...rows.flatMap(r => r.cells.map(c => c.x))].sort((a, b) => a - b);
    const starts = [];
    for (const x of xs) if (!starts.length || x - starts[starts.length - 1] > hm * 2.5) starts.push(x);
    const body = rows.map(r => {
      const line = new Array(starts.length).fill('');
      for (const c of r.cells) { let k = 0; for (let q = 0; q < starts.length; q++) if (c.x >= starts[q] - hm) k = q; line[k] = line[k] ? line[k] + ' ' + c.s : c.s; }
      return line;
    });
    return { head: starts.map((_, i) => '칸' + (i + 1)), body };
  }

  /* 쪽별로 표 만들기 → 하나로 모음 (같은 머리 모양끼리 한 표) */
  function buildAll(items) {
    const byPage = new Map();
    for (const it of items) { if (!byPage.has(it.page)) byPage.set(it.page, []); byPage.get(it.page).push(it); }
    let head = null; const body = []; let found = 0; const pagesNoTable = [];
    for (const [page, its] of byPage) {
      const { tables } = tablesOf(its);
      if (!tables.length) { pagesNoTable.push(page); continue; }
      for (const t of tables) {
        found++;
        if (!head) head = t.head;
        /* 머리 칸 수가 다르면 같은 이름 칸에 맞춰 넣음 */
        const map = t.head.map(h => { const k = head.findIndex(x => norm(x) === norm(h)); return k; });
        for (const l of t.body) {
          const row = new Array(head.length).fill('');
          l.forEach((v, i) => { const k = map[i] >= 0 ? map[i] : -1; if (k >= 0) row[k] = row[k] ? row[k] + ' ' + v : v; else if (v) { head.push(t.head[i]); row.push(v); } });
          body.push([page, ...row]);
        }
      }
    }
    if (!found) {
      /* 표 머리를 못 찾음 → 글자 전체 */
      const all = [];
      for (const [page, its] of byPage) { const { rows, hm } = rowsOf(its); const t = plainTable(rows, hm); if (!head || t.head.length > head.length) head = t.head; for (const l of t.body) all.push([page, ...l]); }
      return { head: ['쪽', ...(head || [])], body: all.map(r => { while (r.length < (head || []).length + 1) r.push(''); return r; }), found: 0, pagesNoTable };
    }
    const w = head.length + 1;
    return { head: ['쪽', ...head], body: body.map(r => { while (r.length < w) r.push(''); return r; }), found, pagesNoTable };
  }
  const norm = s => String(s).toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');

  /* 같은 품목 합산: 번호 칸·쪽 칸을 빼고 나머지가 같으면 수량을 더함 */
  function mergeQty(t) {
    const qi = t.head.findIndex(h => QTYK.test(h));
    if (qi < 0) return null;
    const keep = t.head.map((h, i) => i).filter(i => i !== 0 && i !== qi && !IDK.test(t.head[i]));
    const m = new Map();
    for (const r of t.body) {
      const raw = String(r[qi] || '').trim();
      const mm = raw.replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([A-Za-z가-힣"'.]*)$/);
      const unit = mm ? mm[2].toUpperCase() : '';
      const key = keep.map(i => r[i]).join('\u0001') + '\u0001' + unit + (mm ? '' : '\u0001?' + raw);
      if (!keep.some(i => r[i])) continue;
      const o = m.get(key) || { cols: keep.map(i => r[i]), unit, qty: 0, raw: mm ? '' : raw, n: 0, pages: new Set() };
      if (mm) o.qty += +mm[1]; o.n++; o.pages.add(r[0]); m.set(key, o);
    }
    const head = [...keep.map(i => t.head[i]), '합계 수량', '단위', '줄 수', '쪽 수'];
    const body = [...m.values()].map(o => [...o.cols, o.raw ? o.raw : Math.round(o.qty * 1000) / 1000, o.unit, o.n, o.pages.size]);
    return { head, body };
  }

  /* ---------- 엑셀(.xlsx) — 압축 없는 zip 으로 직접 만듦 ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = i => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - 1 - r) / 26; } return s; };
  function sheetXml(t) {
    const rows = [t.head, ...t.body];
    const xr = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
      const ref = colName(ci) + (ri + 1);
      if (ri > 0 && typeof v === 'string' && /^-?(0|[1-9]\d{0,11})(\.\d+)?$/.test(v.trim())) v = +v.trim();
      if (ri > 0 && typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      if (v === '' || v == null) return '';
      return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('') + '</row>').join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${xr}</sheetData></worksheet>`;
  }
  function xlsx(sheets) {
    const files = [];
    const add = (n, s) => files.push([n, new TextEncoder().encode(s)]);
    add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    add('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
    return zipMany(files);
  }
  function crc(d) { if (typeof crc32 === 'function') return crc32(d); let c, t = crc._t; if (!t) { t = crc._t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } } c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = t[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipMany(files) {
    const parts = [], cen = []; let off = 0;
    for (const [name, data] of files) {
      const nb = new TextEncoder().encode(name), c = crc(data) >>> 0;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, c, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, c, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), nb);
      off += 30 + nb.length + data.length;
    }
    const csz = cen.reduce((a, b) => a + b.length, 0);
    const en = new DataView(new ArrayBuffer(22));
    en.setUint32(0, 0x06054b50, true); en.setUint16(8, files.length, true); en.setUint16(10, files.length, true); en.setUint32(12, csz, true); en.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(en.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const csv = t => '﻿' + [t.head, ...t.body].map(r => r.map(v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');

  /* ---------- 창 ---------- */
  function tableHtml(t, max) {
    const h = '<tr>' + t.head.map(x => `<th>${esc(x)}</th>`).join('') + '</tr>';
    const b = t.body.slice(0, max).map(r => '<tr>' + r.map(x => `<td>${esc(x)}</td>`).join('') + '</tr>').join('');
    return `<div class="bomWrap"><table class="bomT">${h}${b}</table></div>` + (t.body.length > max ? `<p class="bomMore">… 외 ${t.body.length - max}줄 (엑셀에는 모두 들어감)</p>` : '');
  }
  function css() {
    if (document.getElementById('bomCss')) return;
    const s = document.createElement('style'); s.id = 'bomCss';
    s.textContent = '.bomWrap{max-height:46vh;overflow:auto;border:1px solid var(--line,#3334);border-radius:6px;margin:6px 0}.bomT{border-collapse:collapse;font-size:12px;width:100%}.bomT th,.bomT td{border:1px solid var(--line,#3334);padding:3px 6px;text-align:left;white-space:nowrap}.bomT th{position:sticky;top:0;background:var(--panel,#222);font-weight:600}.bomMore{font-size:12px;opacity:.75;margin:2px 0}.bomTabs{display:flex;gap:6px;margin:6px 0}.bomTabs button.on{outline:2px solid var(--acc,#4af)}.bomNote{font-size:12px;opacity:.85;margin:4px 0;line-height:1.5}';
    document.head.appendChild(s);
  }

  function showResult(t, info) {
    css();
    const merged = mergeQty(t);
    const box = document.createElement('div');
    const p = document.createElement('p'); p.className = 'bomNote';
    p.innerHTML = `${esc(info)}<br>표 ${t.found || 0}개 · ${t.body.length}줄${merged ? ` · 같은 품목 합산 ${merged.body.length}종` : ''}. 칸이 어긋난 곳은 엑셀에서 고쳐 주세요. <b>이 처리는 이 브라우저 안에서만 하며 도면을 서버로 보내지 않습니다.</b>` + (t.pagesNoTable && t.pagesNoTable.length && t.found ? `<br>표를 못 찾은 쪽: ${esc(t.pagesNoTable.slice(0, 6).join(', '))}${t.pagesNoTable.length > 6 ? ' …' : ''}` : '') + (!t.found ? '<br>표 머리줄(QTY·DESCRIPTION·SIZE·수량·품명 등)을 못 찾아 글자 전체를 칸 위치대로 나눴습니다.' : '');
    const tabs = document.createElement('div'); tabs.className = 'bomTabs';
    const view = document.createElement('div');
    const show = (which) => { view.innerHTML = tableHtml(which === 'm' && merged ? merged : t, 200); [...tabs.children].forEach(b => b.classList.toggle('on', b.dataset.k === which)); };
    const mk = (k, label) => { const b = document.createElement('button'); b.className = 'tbtn'; b.dataset.k = k; b.textContent = label; b.onclick = () => show(k); tabs.appendChild(b); };
    mk('o', '찾은 표 그대로'); if (merged) mk('m', '같은 품목 합산');
    box.append(p, tabs, view); show(merged ? 'm' : 'o');
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const bx = document.createElement('button'); bx.className = 'tbtn primary'; bx.textContent = '엑셀(.xlsx) 저장';
    bx.onclick = () => { const sh = [{ name: '찾은 표', head: t.head, body: t.body }]; if (merged) sh.push({ name: '같은 품목 합산', head: merged.head, body: merged.body }); offer(`BOM_${stamp}.xlsx`, xlsx(sh)); log(`BOM 엑셀 저장 (${t.body.length}줄${merged ? ` · 합산 ${merged.body.length}종` : ''})`, 'ok'); window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'BOM_XLSX' }); };
    const bc = document.createElement('button'); bc.className = 'tbtn'; bc.textContent = 'CSV 저장';
    bc.onclick = () => { offer(`BOM_${stamp}.csv`, new Blob([csv(merged && view.querySelector('th') && tabs.querySelector('.on')?.dataset.k === 'm' ? merged : t)], { type: 'text/csv;charset=utf-8' })); };
    const bt = document.createElement('button'); bt.className = 'tbtn'; bt.textContent = '도면에 표로 넣기';
    bt.onclick = () => {
      const src = merged && tabs.querySelector('.on')?.dataset.k === 'm' ? merged : t;
      const rows = [src.head, ...src.body.slice(0, 300)].map(r => r.map(v => String(v ?? '')));
      const cols = rows[0].map((_, i) => Math.max(12, Math.min(160, Math.max(...rows.map(r => [...(r[i] || '')].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 1 : 0.62), 0))) * 2.5 + 4)));
      const r = commit({ cmd: 'table', at: [0, 0], cols, rows, h: 2.5 }, `표 넣기 (${rows.length - 1}줄) — 원점(0,0)에 놓았습니다. 이동(M)으로 옮기세요`);
      if (!r.ok) log('표 넣기는 지금 도면에서 쓸 수 없습니다 — 엑셀로 저장해 주세요', 'err'); else if (typeof zoomExtents === 'function') try { zoomExtents(); } catch (_) {}
    };
    modal('BOM · 표 → 엑셀', [box], [bx, bc, bt]);
  }

  function pickPdf() {
    return new Promise(ok => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,application/pdf'; i.multiple = true; i.onchange = () => ok([...i.files]); i.click(); });
  }
  async function fromPdfFiles(files) {
    if (!files || !files.length) return;
    log(`BOM: PDF ${files.length}개 읽는 중… (이 브라우저 안에서만 처리)`, 'me');
    let r;
    try { r = await pdfItems(files, s => { const el = document.getElementById('st'); if (el) el.textContent = s; }); }
    catch (e) { log('BOM: ' + e.message, 'err'); return; }
    if (!r.items.length) { log(`BOM: 글자가 없는 PDF 입니다 (스캔·사진 PDF). 이런 PDF 는 [열기]로 첨부한 뒤 오른쪽 AI 입력칸에 "BOM 표를 엑셀로 정리해 줘"라고 요청하세요.`, 'err'); return; }
    const t = buildAll(r.items);
    showResult(t, `PDF ${files.length}개 · ${r.pages}쪽 읽음${r.noText ? ` (글자 없는 스캔 쪽 ${r.noText}개는 빠짐)` : ''}`);
    window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'BOM_PDF' });
  }
  function fromDrawing(onlySel) {
    const ents = onlySel ? [...sel].map(byId) : doc.entities;
    const its = entItems(ents);
    if (!its.length) { log(onlySel ? 'BOM: 선택한 것 중에 글자가 없습니다' : 'BOM: 도면에 글자가 없습니다 (블록 안 글자는 분해(X) 뒤에 읽힙니다)', 'err'); return; }
    const t = buildAll(its);
    showResult(t, `${onlySel ? '선택한' : '지금 도면의'} 글자 ${its.length}개에서 찾음`);
    window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'BOM_DWG' });
  }

  function open() {
    css();
    const nSel = [...sel].map(byId).filter(e => e && (e.type === 'text' || e.type === 'mtext')).length;
    const nAll = doc.entities.filter(e => e.type === 'text' || e.type === 'mtext').length;
    const p = document.createElement('p'); p.className = 'bomNote';
    p.innerHTML = '도면 안의 BOM(부품표·자재표)을 찾아 <b>엑셀</b>로 저장합니다. 여러 장 ISO 도면이면 <b>같은 품목 수량을 합산</b>한 시트도 만듭니다.<br>· 글자가 들어 있는 PDF(캐드에서 출력한 PDF)는 바로 읽습니다. 스캔·사진 PDF는 AI 입력칸에 첨부해 요청하세요.<br>· 모든 처리는 이 브라우저 안에서만 합니다.';
    const b1 = document.createElement('button'); b1.className = 'tbtn primary'; b1.textContent = 'PDF 고르기 (여러 개 가능)';
    const b2 = document.createElement('button'); b2.className = 'tbtn'; b2.textContent = `지금 도면 글자 (${nAll})`; b2.disabled = !nAll;
    const b3 = document.createElement('button'); b3.className = 'tbtn'; b3.textContent = `선택한 글자 (${nSel})`; b3.disabled = !nSel;
    const m = modal('BOM · 표 → 엑셀', [p], [b1, b2, b3]);
    const close = () => { try { (m && m.remove) ? m.remove() : document.querySelector('.modal:last-of-type')?.remove(); } catch (_) {} };
    b1.onclick = async () => { const f = await pickPdf(); close(); fromPdfFiles(f); };
    b2.onclick = () => { close(); fromDrawing(false); };
    b3.onclick = () => { close(); fromDrawing(true); };
  }

  window.MUCCABOM = { open, fromPdfFiles, fromDrawing, _t: { buildAll, mergeQty, entItems, xlsx, rowsOf } };
  try {
    TOOLS.bom = () => { setTimeout(open); return null; };
    Object.assign(ALIAS, { BOM: 'bom', BOMOUT: 'bom', TABLEOUT: 'bom', TABLEEXPORT: 'bom', MTO: 'bom' });
    Object.assign(CMD_KO, { bom: 'BOM · 표 → 엑셀' });
    Object.assign(CMD_WORD, { bom: ['BOM', '표 엑셀로'] });
    Object.assign(KO_CMD, { 표내보내기: 'bom', 표추출: 'bom', 부품표: 'bom', 자재표: 'bom', 물량: 'bom', 물량산출: 'bom', 엑셀: 'bom', 엑셀로: 'bom', 비오엠: 'bom' });
  } catch (e) { console.warn('bom hook', e); }
})();
