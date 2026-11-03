/* 무카 CAD 테스트 서버 — PDF 양식 (2026-11-03, pdfme 6.2.8 · MIT · 브라우저 안에서 만듦)
   명령 PDF양식 · 제출PDF · 도면표지 · 견적표지 · 부품표PDF  (상단 [출력 ▾] → PDF 양식)
   ① 도면 제출 묶음: 표지 + 지금 도면(벡터 PDF) + 부품표 를 한 PDF 로
   ② 도면 제출 표지 · ③ 부품표 · ④ 견적 표지
   - 부품표 줄은 지금 도면에서 읽음: 표준 부품 양식(엘보·티·레듀서) · 블록(속성 품명/규격/재질/수량) · 3D 부품
   - 표제란 양식 고치기: 칸 켜기/끄기 · 이름 바꾸기 · 순서 · 칸 수 · 회사 로고 · 색 (이 브라우저에 기억)
   - 양식 파일(.json): pdfme 양식 그대로 내보내기/불러오기 (pdfme 디자이너에서 고친 양식도 이름만 맞으면 씀)
   - 글꼴: MuccaKS Gothic (나눔고딕 부분 글꼴, OFL) · 파일·도면은 서버로 올라가지 않음
   AI 명령: {"cmd":"pdf_form","kind":"bundle|cover|bom|quote","info":{...},"rows":[[품명,규격,재질,수량,비고],...]} → 창을 열어 줌(저장은 사용자가 누름) */
(function () {
  'use strict';
  const SRC = (document.currentScript && document.currentScript.src) || location.href;
  const V = new URL('vendor/', SRC).href, LIB = V + 'pdfme-gen-6.2.8.min.js?v=1';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const LSK = 'mucca.pdfform';
  const evt = c => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: c }); } catch (_) { } };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  /* ---------- 불러오기 (처음 한 번: 도구 약 0.8MB + 글꼴 0.55MB, 압축 기준) ---------- */
  let libP = null, fontP = null, pdfjsP = null;
  const script = (src, ok) => new Promise((res, no) => { const s = document.createElement('script'); s.src = src; s.onload = () => ok() ? res(ok()) : no(new Error('도구를 불러오지 못했습니다')); s.onerror = () => no(new Error('도구를 받지 못했습니다 (인터넷 연결 확인)')); document.head.appendChild(s); });
  const loadLib = () => window.PDFME ? Promise.resolve(window.PDFME) : (libP = libP || script(LIB, () => window.PDFME).catch(e => { libP = null; throw e; }));
  async function gunzip(url) {
    const r = await fetch(url); if (!r.ok) throw new Error('글꼴을 받지 못했습니다 (' + r.status + ')');
    const b = new Uint8Array(await r.arrayBuffer());
    if (b[0] !== 0x1f || b[1] !== 0x8b) return b;   // 서버가 이미 풀어 준 경우
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 글꼴 압축 풀기를 지원하지 않습니다');
    return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  }
  const loadFonts = () => fontP = fontP || Promise.all([gunzip(V + 'MuccaKSGothic-Regular.ttf.gz'), gunzip(V + 'MuccaKSGothic-Bold.ttf.gz')])
    .then(([r, b]) => ({ KR: { data: r, fallback: true, subset: true }, KRB: { data: b, subset: true } })).catch(e => { fontP = null; throw e; });
  const loadPdfjs = () => window.pdfjsLib ? Promise.resolve(window.pdfjsLib) : (pdfjsP = pdfjsP || script(PDFJS + 'pdf.min.js', () => window.pdfjsLib).then(L => { L.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; return L; }).catch(e => { pdfjsP = null; throw e; }));

  /* ---------- 설정 (이 브라우저에 기억) ---------- */
  const TB_FIELDS = [['project', '프로젝트', 1], ['title', '도면명', 1], ['dwgno', '도면 번호', 1], ['rev', '개정', 1], ['date', '날짜', 1], ['scale', '축척', 0], ['author', '작성', 1], ['checker', '검토', 1], ['approver', '승인', 1]];
  const INFO = [['company', '회사·팀 이름', '예: ○○설계팀'], ['project', '프로젝트', '예: 냉각수 배관 개선'], ['title', '도면명', '예: 펌프 출구 배관'], ['dwgno', '도면 번호', '예: P-101'], ['rev', '개정', '0'],
    ['date', '날짜', ''], ['scale', '축척', '예: 1:10'], ['author', '작성', '이름'], ['checker', '검토', ''], ['approver', '승인', ''],
    ['client', '받는 곳', '예: ○○공장 설비팀'], ['subject', '건명', '예: 배관 이음쇠 제작'], ['valid', '유효 기간', '예: 제출일로부터 30일'], ['contact', '연락처', '전화·메일'], ['note', '비고', '']];
  const KIND = { bundle: '도면 제출 묶음 (표지 + 도면 + 부품표)', cover: '도면 제출 표지', bom: '부품표', quote: '견적 표지 (견적 내역 포함)' };
  const KIND_INFO = { bundle: ['company', 'project', 'title', 'dwgno', 'rev', 'date', 'scale', 'author', 'checker', 'approver', 'client', 'note'], cover: ['company', 'project', 'title', 'dwgno', 'rev', 'date', 'scale', 'author', 'checker', 'approver', 'client', 'note'],
    bom: ['company', 'project', 'title', 'dwgno', 'rev', 'date', 'author', 'checker', 'approver', 'note'], quote: ['company', 'client', 'subject', 'project', 'date', 'valid', 'author', 'contact', 'note'] };
  function defCfg() { return { kind: 'bundle', info: { rev: '0', date: today() }, tb: { fields: TB_FIELDS.map(([key, label, on]) => ({ key, label, on: !!on })), cols: 3, logo: '', color: '#1f3a5f' }, custom: {} }; }
  let cfg = defCfg();
  try { const s = JSON.parse(localStorage.getItem(LSK) || 'null'); if (s) { cfg = Object.assign(defCfg(), s); cfg.tb = Object.assign(defCfg().tb, s.tb || {}); cfg.custom = s.custom || {}; for (const [k, l] of TB_FIELDS) if (!cfg.tb.fields.some(f => f.key === k)) cfg.tb.fields.push({ key: k, label: l, on: false }); } } catch (_) { }
  const save = () => { try { localStorage.setItem(LSK, JSON.stringify(cfg)); } catch (e) { if (cfg.tb.logo) log('로고 그림이 커서 이 브라우저에 기억하지 못했습니다 (400KB 이하 권장)', 'err'); } };

  /* ---------- 부품표 줄 읽기 ---------- */
  const COLS = ['품명', '규격', '재질', '수량', '비고'];
  function collectRows() {
    const out = [], add = (name, spec, mat, qty, note) => { const k = [name, spec, mat, note].join('\u0001'); const f = out.find(r => r.k === k); if (f) f.r[3] = String((+f.r[3] || 0) + (+qty || 1)); else out.push({ k, r: [name, spec, mat, String(qty || 1), note] }); };
    const has = id => { try { return !!byId(id); } catch (_) { return false; } };
    try { for (const d of (window.PARTFORMS && PARTFORMS.drawn ? PARTFORMS.drawn() : [])) if (!d.ids.length || d.ids.some(has)) add(d.name, d.spec || '', '', 1, '표준품 양식'); } catch (_) { }
    try {
      const pick = (A, re) => { for (const [k, v] of Object.entries(A || {})) if (re.test(k) && String(v).trim()) return String(v).trim(); return ''; };
      for (const e of doc.entities) {
        if (e.type !== 'insert' || /^\*|^(TITLE|BORDER|FRAME|표제|도곽|테두리)/i.test(e.name || '')) continue;
        let A = e.attrs || {}; try { if (typeof blockAtts === 'function') A = Object.assign(Object.fromEntries(blockAtts(e.name).map(a => [a.tag, a.def || ''])), A); } catch (_) { }
        add(pick(A, /^(NAME|DESC|PART|품명|명칭|이름)/i) || e.name, pick(A, /^(SPEC|SIZE|NPS|DN|규격|사이즈|호칭)/i), pick(A, /^(MAT|재질)/i), +pick(A, /^(Q'?TY|QUANT|수량)/i) || 1, pick(A, /^(NOTE|REMARK|비고)/i) || '블록');
      }
    } catch (_) { }
    try { const M = window.LABPHOTO && LABPHOTO.model; if (M) for (const p of M.parts) add(p.name || p.no, '', '', 1, '3D 부품 ' + p.no); } catch (_) { }
    return out.map(o => o.r);
  }

  /* ---------- 지금 도면 그림 (표지용) ---------- */
  function drawingImage() {
    try {
      if (!doc.entities.length || typeof plotRender !== 'function') return null;
      const ps = Object.assign({}, plotSet, { paper: 'A4', orient: 'land', area: 'ext', fit: true, center: true, tb: false, style: 'mono' });
      let { cnv } = plotRender(ps, 200);
      /* 종이 여백을 잘라 도면만 크게 (흰색이 아닌 곳의 범위 + 3%) */
      try { const W = cnv.width, H = cnv.height, d = cnv.getContext('2d').getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
        const bx = Math.round(W * 0.03), byy = Math.round(H * 0.03);   // 종이 테두리 선은 빼고
        for (let y = byy; y < H - byy; y += 2) for (let x = bx; x < W - bx; x += 2) { const i = (y * W + x) * 4; if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        if (x1 > x0 && y1 > y0) { const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03) + 4; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W, x1 + m); y1 = Math.min(H, y1 + m);
          const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(cnv, -x0, -y0); cnv = c; } } catch (_) { }
      return { url: cnv.toDataURL('image/jpeg', 0.9), w: cnv.width, h: cnv.height };
    } catch (e) { console.warn('pdfform image', e); return null; }
  }

  /* ---------- 양식(pdfme template) 만들기 ---------- */
  const T = (name, x, y, w, h, content, o) => Object.assign({ name, type: 'text', position: { x, y }, width: w, height: h, content: String(content ?? ''), readOnly: true, fontName: 'KR', fontSize: 9, fontColor: '#111111', alignment: 'left', verticalAlignment: 'middle', lineHeight: 1.1, characterSpacing: 0, backgroundColor: '' }, o || {});
  const R = (name, x, y, w, h, o) => Object.assign({ name, type: 'rectangle', position: { x, y }, width: w, height: h, borderWidth: 0.3, borderColor: '#333333', color: '', readOnly: true }, o || {});
  const IMG = (name, x, y, w, h, url) => ({ name, type: 'image', position: { x, y }, width: w, height: h, content: url, readOnly: true });
  let uid = 0; const nm = p => p + (++uid);
  /* 표제란: 왼쪽 회사(로고) + 오른쪽 칸들 */
  function titleBlock(info, pw, ph) {
    const F = cfg.tb.fields.filter(f => f.on), cols = Math.max(1, Math.min(5, +cfg.tb.cols || 3)), rows = Math.max(2, Math.ceil(F.length / cols)), ch = 10, h = rows * ch;
    const x0 = 10, y0 = ph - 10 - h, W = pw - 20, lw = 46, gw = (W - lw) / cols, s = [];
    s.push(R(nm('tbBox'), x0, y0, W, h, { borderWidth: 0.6, borderColor: cfg.tb.color }));
    s.push(R(nm('tbL'), x0, y0, lw, h, { borderColor: cfg.tb.color }));
    if (cfg.tb.logo) { s.push(IMG(nm('tbLogo'), x0 + 2, y0 + 2, lw - 4, h * 0.55 - 2, cfg.tb.logo)); s.push(T(nm('tbCo'), x0 + 2, y0 + h * 0.58, lw - 4, h * 0.38, info.company || '', { fontName: 'KRB', fontSize: 9, alignment: 'center' })); }
    else s.push(T(nm('tbCo'), x0 + 2, y0 + 2, lw - 4, h - 4, info.company || '회사·팀 이름', { fontName: 'KRB', fontSize: 11, alignment: 'center', fontColor: info.company ? cfg.tb.color : '#999999' }));
    F.forEach((f, i) => { const r = Math.floor(i / cols), c = i % cols, x = x0 + lw + c * gw, y = y0 + r * ch;
      s.push(R(nm('tbC'), x, y, gw, ch, { borderColor: cfg.tb.color }));
      s.push(T(nm('tbK'), x + 1.2, y + 0.6, gw - 2.4, 3.4, f.label, { fontSize: 5.5, fontColor: '#666666', verticalAlignment: 'top' }));
      s.push(T(nm('tbV'), x + 1.2, y + 3.6, gw - 2.4, ch - 4.2, info[f.key] || '', { fontSize: 9, dynamicFontSize: { min: 5, max: 9, fit: 'horizontal' } })); });
    for (let i = F.length; i < rows * cols; i++) { const r = Math.floor(i / cols), c = i % cols; s.push(R(nm('tbE'), x0 + lw + c * gw, y0 + r * ch, gw, ch, { borderColor: cfg.tb.color })); }
    return { s, h };
  }
  const footer = (pw, ph, label) => [T(nm('pg'), pw - 60, ph - 8.5, 50, 5, `${label} · {currentPage} / {totalPages}`, { fontSize: 7, fontColor: '#777777', alignment: 'right' }),
    T(nm('mk'), 10, ph - 8.5, 80, 5, '무카 CAD PDF 양식', { fontSize: 6.5, fontColor: '#aaaaaa' })];
  const tableStyle = (head, pct, colAlign) => ({
    showHead: true, head, headWidthPercentages: pct, repeatHead: true,
    tableStyles: { borderColor: cfg.tb.color, borderWidth: 0.3 },
    headStyles: { fontName: 'KRB', fontSize: 8.5, characterSpacing: 0, alignment: 'center', verticalAlignment: 'middle', lineHeight: 1, fontColor: '#ffffff', borderColor: cfg.tb.color, backgroundColor: cfg.tb.color, borderWidth: { top: 0, right: 0, bottom: 0, left: 0 }, padding: { top: 2, right: 2, bottom: 2, left: 2 } },
    bodyStyles: { fontName: 'KR', fontSize: 8.5, characterSpacing: 0, alignment: 'left', verticalAlignment: 'middle', lineHeight: 1.1, fontColor: '#111111', borderColor: '#9aa3ad', backgroundColor: '', alternateBackgroundColor: '#f3f5f8', borderWidth: { top: 0.2, right: 0.2, bottom: 0.2, left: 0.2 }, padding: { top: 1.6, right: 2, bottom: 1.6, left: 2 } },
    columnStyles: { alignment: colAlign || {} } });

  function bomTemplate(info, rows) {
    const pw = 210, ph = 297, tb = titleBlock(info, pw, ph), top = 30;
    const stat = [T(nm('h'), 10, 10, 120, 10, '부품표 (BOM)', { fontName: 'KRB', fontSize: 16, fontColor: cfg.tb.color }),
      T(nm('h2'), 10, 20, 190, 6, [info.project, info.title, info.dwgno && '도면 ' + info.dwgno, info.date].filter(Boolean).join('  ·  '), { fontSize: 8.5, fontColor: '#444444' }),
      R(nm('hl'), 10, 27, 190, 0.1, { borderWidth: 0.6, borderColor: cfg.tb.color }), ...tb.s, ...footer(pw, ph, '부품표')];
    const body = rows.map((r, i) => [String(i + 1), ...r.slice(0, 5).map(v => String(v ?? ''))]);
    const tbl = Object.assign({ name: 'bom', type: 'table', position: { x: 10, y: top }, width: 190, height: 8 + 7 * Math.max(1, body.length), content: JSON.stringify(body.length ? body : [['', '', '', '', '', '']]), readOnly: true },
      tableStyle(['번호', ...COLS], [8, 30, 28, 13, 8, 13], { 0: 'center', 4: 'center' }));
    return { basePdf: { width: pw, height: ph, padding: [top, 10, tb.h + 14, 10], staticSchema: stat }, schemas: [[tbl]] };
  }
  function coverTemplate(info, img, toc) {
    const pw = 210, ph = 297, tb = titleBlock(info, pw, ph), s = [];
    const band = R(nm('band'), 0, 0, pw, 4, { color: cfg.tb.color, borderWidth: 0 });   // 표가 있는 쪽은 위쪽 여백 안의 칸이 밀리므로 위 띠는 쪽마다 그리는 칸으로
    s.push(T(nm('co'), 10, 12, 190, 7, info.company || '', { fontName: 'KRB', fontSize: 11, fontColor: cfg.tb.color }));
    s.push(T(nm('h'), 10, 26, 190, 14, '도면 제출서', { fontName: 'KRB', fontSize: 26, alignment: 'center', characterSpacing: 2 }));
    s.push(T(nm('h2'), 10, 41, 190, 7, info.project || '', { fontSize: 11, alignment: 'center', fontColor: '#444444' }));
    const kv = [['도면명', info.title], ['도면 번호', info.dwgno], ['개정', info.rev], ['제출일', info.date], ['받는 곳', info.client], ['축척', info.scale]].filter(([, v]) => v);
    let y = 54; const half = Math.ceil(kv.length / 2);
    kv.forEach(([k, v], i) => { const c = i < half ? 0 : 1, r = i < half ? i : i - half, x = 10 + c * 95, yy = y + r * 8;
      s.push(R(nm('kvb'), x, yy, 95, 8, { borderColor: '#9aa3ad', borderWidth: 0.2 })); s.push(R(nm('kvk'), x, yy, 24, 8, { color: '#eef1f5', borderColor: '#9aa3ad', borderWidth: 0.2 }));
      s.push(T(nm('kk'), x + 1.5, yy, 21, 8, k, { fontSize: 8, fontColor: '#444444' })); s.push(T(nm('kv'), x + 26, yy, 67, 8, v, { fontSize: 9.5, dynamicFontSize: { min: 6, max: 9.5, fit: 'horizontal' } })); });
    y += Math.max(1, half) * 8 + 6;
    const tocH = toc && toc.length ? 10 + toc.length * 7 : 0, noteH = info.note ? 14 : 0;
    const boxH = Math.max(60, ph - 10 - tb.h - 6 - y - tocH - noteH - (tocH ? 6 : 0));
    s.push(R(nm('imgb'), 10, y, 190, boxH, { borderColor: '#9aa3ad', borderWidth: 0.3 }));
    if (img) { const k = Math.min((190 - 4) / img.w, (boxH - 4) / img.h), w = img.w * k, h = img.h * k; s.push(IMG(nm('img'), 10 + (190 - w) / 2, y + (boxH - h) / 2, w, h, img.url)); }
    else s.push(T(nm('noimg'), 10, y, 190, boxH, '(도면 그림 없음 — 2D 도면을 그리면 여기에 들어갑니다)', { alignment: 'center', fontColor: '#999999' }));
    y += boxH + 6;
    if (tocH) { s.push(T(nm('toch'), 10, y, 190, 6, '제출 목록', { fontName: 'KRB', fontSize: 9.5, fontColor: cfg.tb.color }));
      s.push(Object.assign({ name: nm('toc'), type: 'table', position: { x: 10, y: y + 7 }, width: 190, height: 7 * (toc.length + 1), content: JSON.stringify(toc), readOnly: true }, tableStyle(['순서', '문서', '쪽'], [10, 75, 15], { 0: 'center', 2: 'center' }))); y += tocH; }
    if (noteH) s.push(T(nm('note'), 10, y + 2, 190, 11, '비고: ' + info.note, { fontSize: 8.5, verticalAlignment: 'top', fontColor: '#333333' }));
    return { basePdf: { width: pw, height: ph, padding: [10, 10, 10, 10], staticSchema: [band, ...tb.s, ...footer(pw, ph, '표지')] }, schemas: [s] };
  }
  function quoteTemplate(info, rows) {
    const pw = 210, ph = 297, s = [], C = cfg.tb.color;
    s.push(T(nm('h'), 10, 14, 190, 14, '견  적  서', { fontName: 'KRB', fontSize: 26, alignment: 'center', characterSpacing: 4 }));
    s.push(T(nm('to'), 10, 34, 110, 9, (info.client || '받는 곳') + '  귀하', { fontName: 'KRB', fontSize: 13, fontColor: info.client ? '#111111' : '#999999' }));
    s.push(R(nm('tol'), 10, 43, 105, 0.1, { borderWidth: 0.5, borderColor: '#333333' }));
    const L = [['건명', info.subject], ['프로젝트', info.project], ['제출일', info.date], ['유효 기간', info.valid]].filter(([, v]) => v);
    L.forEach(([k, v], i) => { s.push(T(nm('lk'), 10, 47 + i * 7, 22, 7, k, { fontSize: 8.5, fontColor: '#555555' })); s.push(T(nm('lv'), 32, 47 + i * 7, 84, 7, v, { fontSize: 9.5, dynamicFontSize: { min: 6, max: 9.5, fit: 'horizontal' } })); });
    /* 공급자 칸 */
    const bx = 122, by = 34, bw = 78, bh = 42; s.push(R(nm('sb'), bx, by, bw, bh, { borderColor: C, borderWidth: 0.5 })); s.push(R(nm('sbh'), bx, by, 9, bh, { color: C, borderWidth: 0 }));
    s.push(T(nm('sbt'), bx, by, 9, bh, '공\n급\n자', { fontName: 'KRB', fontSize: 9, fontColor: '#ffffff', alignment: 'center', lineHeight: 1.5 }));
    if (cfg.tb.logo) s.push(IMG(nm('logo'), bx + 11, by + 2, 30, 12, cfg.tb.logo));
    s.push(T(nm('sco'), bx + 11, by + (cfg.tb.logo ? 15 : 3), bw - 13, 8, info.company || '회사·팀 이름', { fontName: 'KRB', fontSize: 11, fontColor: info.company ? '#111111' : '#999999', dynamicFontSize: { min: 6, max: 11, fit: 'horizontal' } }));
    s.push(T(nm('sau'), bx + 11, by + 25, bw - 13, 6, info.author ? '담당  ' + info.author : '', { fontSize: 8.5 }));
    s.push(T(nm('sct'), bx + 11, by + 32, bw - 13, 6, info.contact ? '연락처  ' + info.contact : '', { fontSize: 8.5, dynamicFontSize: { min: 5, max: 8.5, fit: 'horizontal' } }));
    /* 견적 내역 (단가·금액은 사용자가 넣은 값만, 계산은 수량×단가) */
    let sum = 0, any = false; const money = n => Math.round(n).toLocaleString('ko-KR');
    const body = rows.map((r, i) => { const q = parseFloat(String(r[3]).replace(/,/g, '')), u = parseFloat(String(r[5] ?? '').replace(/,/g, '')); const amt = isFinite(q) && isFinite(u) ? q * u : NaN; if (isFinite(amt)) { sum += amt; any = true; }
      return [String(i + 1), String(r[0] ?? ''), String(r[1] ?? ''), String(r[3] ?? ''), isFinite(u) ? money(u) : '', isFinite(amt) ? money(amt) : '', String(r[4] ?? '')]; });
    const ty = 84; s.push(T(nm('sum'), 10, ty - 1, 190, 8, any ? `합계 금액  ${money(sum)} 원 (부가세 별도)` : '합계 금액  (단가를 넣으면 계산됩니다)', { fontName: 'KRB', fontSize: 11, alignment: 'right', fontColor: any ? C : '#999999' }));
    const tbl = Object.assign({ name: 'quote', type: 'table', position: { x: 10, y: ty + 9 }, width: 190, height: 8 + 7 * Math.max(1, body.length), content: JSON.stringify(body.length ? body : [['', '', '', '', '', '', '']]), readOnly: true },
      tableStyle(['번호', '품명', '규격', '수량', '단가', '금액', '비고'], [7, 27, 24, 8, 12, 12, 10], { 0: 'center', 3: 'center', 4: 'right', 5: 'right' }));
    const st = [R(nm('band'), 0, 0, pw, 4, { color: C, borderWidth: 0 }), ...footer(pw, ph, '견적서')];
    if (info.note) st.push(T(nm('qn'), 10, ph - 24, 190, 12, '비고: ' + info.note, { fontSize: 8.5, verticalAlignment: 'top' }));
    return { basePdf: { width: pw, height: ph, padding: [12, 10, info.note ? 28 : 16, 10], staticSchema: st }, schemas: [[...s, tbl]] };
  }

  /* ---------- 만들기 ---------- */
  const fill = (tpl, info, rows, img) => {   // 사용자가 불러온 pdfme 양식: 이름이 맞는 칸에 값을 넣음
    const inp = {}; for (const pg of tpl.schemas || []) for (const sc of pg) { const n = sc.name; if (sc.readOnly) continue;
      if (n in info) inp[n] = String(info[n] ?? ''); else if (sc.type === 'table' && /bom|quote|부품|rows/i.test(n)) inp[n] = JSON.stringify(rows.map((r, i) => [String(i + 1), ...r.map(String)]).map(r => r.slice(0, (sc.head || r).length)));
      else if (sc.type === 'image' && img && /draw|도면|img/i.test(n)) inp[n] = img.url; else if (n === 'today') inp[n] = today(); }
    return [inp]; };
  async function gen(tpl, inputs) { const P = await loadLib(), font = await loadFonts(); return P.generate({ template: tpl, inputs: inputs || [{}], plugins: P.schemas, options: { font, title: 'mucca-pdf-form', author: 'Mucca CAD' } }); }
  const pages = async u8 => (await PDFME.PDFDocument.load(u8)).getPageCount();
  async function build(kind, info, rows) {
    uid = 0; info = Object.assign({}, info); if (!info.date) info.date = today();
    const C = cfg.custom || {}, img = (kind === 'bundle' || kind === 'cover') ? drawingImage() : null;
    const one = async (k, extra) => { const ct = C[k]; if (ct) return gen(ct, fill(ct, info, rows, img));
      return gen(k === 'bom' ? bomTemplate(info, rows) : k === 'quote' ? quoteTemplate(info, rows) : coverTemplate(info, img, extra)); };
    if (kind !== 'bundle') { const u8 = await one(kind); return { u8, pages: await pages(u8), parts: [[KIND[kind], await pages(u8)]] }; }
    /* 묶음: 부품표 → 도면(벡터 PDF) → 표지(목록에 쪽 수) → 합치기 */
    const bom = rows.length ? await one('bom') : null;
    let dwg = null; if (doc.entities.length && typeof plotVectorPdf === 'function') { try { const ps = Object.assign({}, plotSet, { title: info.title || plotSet.title, author: info.author || plotSet.author }); dwg = new Uint8Array(await (await plotVectorPdf(ps)).arrayBuffer()); } catch (e) { console.warn('pdfform dwg', e); } }
    const nB = bom ? await pages(bom) : 0, nD = dwg ? await pages(dwg) : 0;
    const toc = [['1', '도면 제출 표지', '1']]; if (dwg) toc.push([String(toc.length + 1), '도면' + (info.title ? ' — ' + info.title : '') + (info.dwgno ? ` (${info.dwgno})` : ''), String(nD)]); if (bom) toc.push([String(toc.length + 1), '부품표', String(nB)]);
    const cov = await one('cover', toc);
    const out = await PDFME.PDFDocument.create(); out.setTitle((info.title || '도면 제출') + (info.dwgno ? ' ' + info.dwgno : '')); out.setCreator('Mucca CAD (pdfme)');
    for (const u of [cov, dwg, bom]) if (u) { const d = await PDFME.PDFDocument.load(u); (await out.copyPages(d, d.getPageIndices())).forEach(p => out.addPage(p)); }
    const u8 = await out.save(); const parts = [['표지', await pages(cov)]]; if (dwg) parts.push(['도면', nD]); if (bom) parts.push(['부품표', nB]);
    return { u8, pages: out.getPageCount(), parts };
  }

  /* ---------- 창 ---------- */
  const el = (t, a, kids) => { const e = document.createElement(t); if (a) for (const [k, v] of Object.entries(a)) k === 'style' ? e.style.cssText = v : k in e ? e[k] = v : e.setAttribute(k, v); for (const c of [].concat(kids || [])) if (c != null) e.append(c); return e; };
  const css = `.pff{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:14px;min-height:0}@media(max-width:760px){.pff{grid-template-columns:1fr}}
.pff fieldset{border:1px solid var(--rule);border-radius:8px;padding:8px 10px;margin:0 0 10px;min-width:0}.pff legend{font-weight:600;font-size:12.5px;padding:0 4px}
.pff .g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 8px}.pff .g label{display:grid;gap:2px;font-size:11.5px;color:var(--ink-dim)}.pff input,.pff select{min-width:0;width:100%;box-sizing:border-box}
.pff .g input,.pff select{background:var(--ground);border:1px solid var(--rule);border-radius:4px;padding:4px 6px;font:12px var(--mono);color:var(--ink)}.pff .tbf input:not([type=checkbox]){background:var(--ground);border:1px solid var(--rule);border-radius:4px;padding:3px 6px;color:var(--ink)}
.pff table{width:100%;min-width:600px;border-collapse:collapse;font-size:12px}.pff td,.pff th{border:1px solid var(--rule);padding:0}.pff th{font-weight:600;padding:3px 4px;background:var(--chrome-2,transparent);font-size:11.5px}
.pff td input{border:0;background:transparent;padding:4px 5px;font:inherit;color:inherit}.pff td.n{text-align:center;width:28px;opacity:.7}.pff td.x{width:26px;text-align:center}.pff .bt{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.pff .tbf{display:grid;grid-template-columns:22px 1fr 56px;gap:4px 6px;align-items:center;font-size:12px}.pff .pv{position:sticky;top:0;display:grid;gap:6px;align-content:start}
.pff .pv canvas{width:100%;height:auto;background:#fff;border:1px solid var(--rule);border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,.25)}.pff .pvbar{display:flex;gap:6px;align-items:center;font-size:12px}.pff .pvbar span{flex:1;opacity:.85}
.pff .wrap{max-height:230px;overflow:auto}.pff small.d{display:block;font-size:11px;opacity:.75;margin-top:4px;line-height:1.45}`;
  let cur = null;
  function open(opt) {
    opt = opt || {}; if (!document.getElementById('pffCss')) document.head.append(el('style', { id: 'pffCss', textContent: css }));
    if (opt.kind && KIND[opt.kind]) cfg.kind = opt.kind; if (opt.info) Object.assign(cfg.info, opt.info);
    let rows = Array.isArray(opt.rows) && opt.rows.length ? opt.rows.map(r => COLS.map((_, i) => String(r[i] ?? '')).concat([String(r[5] ?? '')])) : collectRows().map(r => r.concat(['']));
    const info = cfg.info; if (!info.date) info.date = today();
    let last = null, pdfDoc = null, page = 1, busy = false;
    const left = el('div'), right = el('div', { className: 'pv' }), box = el('div', { className: 'pff' }, [left, right]);
    /* 종류 */
    const kindSel = el('select', { id: 'pffKind' }); kindSel.innerHTML = Object.entries(KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); kindSel.value = cfg.kind;
    const fsK = el('fieldset', null, [el('legend', { textContent: '만들 PDF' }), kindSel, el('small', { className: 'd', id: 'pffKindD' })]);
    /* 정보 */
    const gi = el('div', { className: 'g' }), fsI = el('fieldset', null, [el('legend', { textContent: '도면 정보' }), gi]);
    const drawInfo = () => { gi.replaceChildren(...KIND_INFO[cfg.kind].map(k => { const d = INFO.find(x => x[0] === k); const i = el('input', { value: info[k] || '', placeholder: d[2] }); i.dataset.k = k; i.oninput = () => { info[k] = i.value; dirty(); }; return el('label', null, [d[1], i]); }));
      document.getElementById('pffKindD') && (document.getElementById('pffKindD').textContent = { bundle: '표지(도면 그림·제출 목록) → 지금 도면(벡터, 플롯 설정 그대로) → 부품표 순서로 한 파일', cover: '도면 그림과 도면 정보가 들어간 표지 1쪽', bom: '아래 부품표 줄로 표 (길면 다음 쪽으로 이어짐, 표제란은 쪽마다)', quote: '받는 곳·공급자·견적 내역 (단가를 넣은 줄만 금액 계산)' }[cfg.kind]); };
    /* 부품표 */
    const tb = el('tbody'), thead = el('thead'), tbl = el('table', null, [thead, tb]);
    const drawRows = () => { const q = cfg.kind === 'quote'; thead.innerHTML = `<tr><th>#</th>${COLS.map(c => `<th>${c}</th>`).join('')}${q ? '<th>단가</th>' : ''}<th></th></tr>`;
      tb.replaceChildren(...rows.map((r, ri) => el('tr', null, [el('td', { className: 'n', textContent: String(ri + 1) }), ...COLS.concat(q ? ['단가'] : []).map((c, ci) => { const i = el('input', { value: r[ci] || '', inputMode: ci === 3 || ci === 5 ? 'decimal' : 'text', 'aria-label': `${ri + 1}번 ${c}` }); i.oninput = () => { r[ci] = i.value; dirty(); }; return el('td', null, [i]); }),
        el('td', { className: 'x' }, [el('button', { type: 'button', className: 'mini', textContent: '✕', title: '이 줄 지우기', onclick: () => { rows.splice(ri, 1); drawRows(); dirty(); } })])]))); };
    const fsB = el('fieldset', null, [el('legend', { textContent: '부품표 줄' }), el('div', { className: 'wrap' }, [tbl]), el('div', { className: 'bt' }, [
      el('button', { type: 'button', className: 'tbtn', textContent: '지금 도면에서 다시 읽기', onclick: () => { rows = collectRows().map(r => r.concat([''])); drawRows(); dirty(); log(`부품표: 도면에서 ${rows.length}줄 읽음`, ''); } }),
      el('button', { type: 'button', className: 'tbtn', textContent: '줄 추가', onclick: () => { rows.push(['', '', '', '1', '', '']); drawRows(); const ins = tb.querySelectorAll('tr:last-child input'); ins[0] && ins[0].focus(); } }),
      el('button', { type: 'button', className: 'tbtn', textContent: '모두 지우기', onclick: () => { rows = []; drawRows(); dirty(); } })]),
      el('small', { className: 'd', textContent: '읽는 곳: 표준 부품 양식(엘보·티·레듀서) · 블록(속성 품명/규격/재질/수량, 같은 것은 수량 합산) · 3D 부품. 칸은 직접 고칠 수 있습니다.' })]);
    /* 표제란 양식 */
    const tbList = el('div', { className: 'tbf' }), fsT = el('details', null, [el('summary', { textContent: '표제란 양식 고치기 (칸 · 이름 · 순서 · 로고 · 색)', style: 'cursor:pointer;font-weight:600;font-size:12.5px;margin-bottom:6px' })]);
    const drawTb = () => { tbList.replaceChildren(...cfg.tb.fields.flatMap((f, i) => { const cb = el('input', { type: 'checkbox', checked: f.on, title: '켜기/끄기', onchange: () => { f.on = cb.checked; dirty(1); } });
      const nmI = el('input', { value: f.label, 'aria-label': '칸 이름', oninput: () => { f.label = nmI.value || f.key; dirty(1); } });
      const mv = d => () => { const j = i + d; if (j < 0 || j >= cfg.tb.fields.length) return; [cfg.tb.fields[i], cfg.tb.fields[j]] = [cfg.tb.fields[j], cfg.tb.fields[i]]; drawTb(); dirty(1); };
      return [cb, nmI, el('span', { style: 'display:flex;gap:2px' }, [el('button', { type: 'button', className: 'mini', textContent: '↑', title: '위로', onclick: mv(-1) }), el('button', { type: 'button', className: 'mini', textContent: '↓', title: '아래로', onclick: mv(1) })])]; })); };
    const colsSel = el('select', { onchange: () => { cfg.tb.cols = +colsSel.value; dirty(1); } }); colsSel.innerHTML = [2, 3, 4, 5].map(n => `<option value="${n}">${n}칸</option>`).join(''); colsSel.value = String(cfg.tb.cols);
    const colI = el('input', { type: 'color', value: cfg.tb.color, oninput: () => { cfg.tb.color = colI.value; dirty(1); }, style: 'width:48px;height:28px;padding:0' });
    const logoI = el('input', { type: 'file', accept: 'image/png,image/jpeg', style: 'display:none', onchange: () => { const f = logoI.files[0]; if (!f) return; if (f.size > 400 * 1024) { log('로고 그림은 400KB 이하로 넣어 주세요', 'err'); return; } const r = new FileReader(); r.onload = () => { cfg.tb.logo = r.result; dirty(1); logoS.textContent = '로고: ' + f.name; }; r.readAsDataURL(f); } });
    const logoS = el('span', { style: 'font-size:12px;opacity:.8', textContent: cfg.tb.logo ? '로고: 넣음' : '로고 없음' });
    const jsonI = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: async () => { const f = jsonI.files[0]; if (!f) return; try { const t = JSON.parse(await f.text()); if (!t || !t.basePdf || !Array.isArray(t.schemas)) throw new Error('pdfme 양식(basePdf·schemas)이 아닙니다'); const k = cfg.kind === 'bundle' ? 'cover' : cfg.kind; cfg.custom[k] = t; dirty(1); log(`PDF 양식: ${KIND[k]} 에 불러온 양식을 씁니다 (${f.name})`, 'ok'); evt('PDFFORM_TPL_IN'); customS(); } catch (e) { log('양식 파일을 읽지 못했습니다: ' + e.message, 'err'); } jsonI.value = ''; } });
    const cs = el('small', { className: 'd' }); const customS = () => { const n = Object.keys(cfg.custom || {}).filter(k => cfg.custom[k]); cs.textContent = n.length ? '불러온 양식 사용 중: ' + n.map(k => KIND[k].split(' (')[0]).join(', ') : 'pdfme 디자이너(playground.pdfme.com)에서 고친 양식(.json)을 불러오면 그 양식을 씁니다. 칸 이름을 project·title·dwgno·date·company·author 처럼 맞추면 값이 들어가고, 표 이름을 bom 으로 하면 부품표 줄이 들어갑니다.'; };
    fsT.append(tbList, el('div', { className: 'bt' }, [el('label', { style: 'display:flex;gap:4px;align-items:center;font-size:12px' }, ['칸 수', colsSel]), el('label', { style: 'display:flex;gap:4px;align-items:center;font-size:12px' }, ['색', colI]),
      el('button', { type: 'button', className: 'tbtn', textContent: '회사 로고 넣기', onclick: () => logoI.click() }), el('button', { type: 'button', className: 'tbtn', textContent: '로고 빼기', onclick: () => { cfg.tb.logo = ''; logoS.textContent = '로고 없음'; dirty(1); } }), logoS, logoI]),
      el('div', { className: 'bt' }, [el('button', { type: 'button', className: 'tbtn', textContent: '양식 파일 내보내기 (.json)', onclick: async () => { const k = cfg.kind === 'bundle' ? 'cover' : cfg.kind; uid = 0; const t = cfg.custom[k] || (k === 'bom' ? bomTemplate(info, rows) : k === 'quote' ? quoteTemplate(info, rows) : coverTemplate(info, null, [['1', '도면 제출 표지', '1']]));
        await offer(`mucca-pdf-${k}-template.json`, JSON.stringify(t, null, 1)); evt('PDFFORM_TPL_OUT'); } }),
        el('button', { type: 'button', className: 'tbtn', textContent: '양식 파일 불러오기', onclick: () => jsonI.click() }), jsonI,
        el('button', { type: 'button', className: 'tbtn', textContent: '기본 양식으로', onclick: () => { const d = defCfg(); cfg.tb = d.tb; cfg.custom = {}; colsSel.value = '3'; colI.value = d.tb.color; logoS.textContent = '로고 없음'; drawTb(); customS(); dirty(1); } })]), cs);
    /* 미리보기 */
    const cnv = el('canvas', { width: 420, height: 594, 'aria-label': 'PDF 미리보기' }), pvInfo = el('span', { textContent: '[미리보기] 를 누르면 여기에 보입니다' });
    const prev = el('button', { type: 'button', className: 'mini', textContent: '◀', onclick: () => showPage(page - 1) }), next = el('button', { type: 'button', className: 'mini', textContent: '▶', onclick: () => showPage(page + 1) });
    right.append(el('div', { className: 'pvbar' }, [prev, pvInfo, next]), cnv, el('small', { className: 'd', textContent: 'PDF 는 이 브라우저 안에서 만듭니다(도면·부품표를 서버로 보내지 않음). 처음 한 번은 양식 도구와 한글 글꼴(약 1.3MB)을 받습니다.' }));
    async function showPage(n) { if (!pdfDoc) return; page = Math.max(1, Math.min(pdfDoc.numPages, n)); const pg = await pdfDoc.getPage(page), vp = pg.getViewport({ scale: 1 }), k = Math.min(2, 840 / vp.width), v2 = pg.getViewport({ scale: k });
      cnv.width = Math.round(v2.width); cnv.height = Math.round(v2.height); await pg.render({ canvasContext: cnv.getContext('2d'), viewport: v2, intent: 'print' }).promise; /* print: 창이 가려져 있어도 멈추지 않음 */ pvInfo.textContent = `${page} / ${pdfDoc.numPages}쪽 · ${(last.u8.length / 1024).toFixed(0)}KB${last.parts.length > 1 ? ' · ' + last.parts.map(p => p[0] + ' ' + p[1]).join(' + ') : ''}`; }
    let tmr = null; function dirty(tbChanged) { last = null; save(); clearTimeout(tmr); if (tbChanged || pdfDoc) tmr = setTimeout(() => run(false), 700); }
    async function run(fromBtn) {
      if (busy) return last; busy = true; pvB.disabled = svB.disabled = true; pvInfo.textContent = '만드는 중…';
      try { last = await build(cfg.kind, info, rows); try { const L = await loadPdfjs(); pdfDoc = await L.getDocument({ data: last.u8.slice() }).promise; await showPage(fromBtn ? 1 : page); } catch (e) { pvInfo.textContent = `${last.pages}쪽 · ${(last.u8.length / 1024).toFixed(0)}KB (미리보기 도구를 받지 못해 그림은 생략)`; }
        if (fromBtn) evt('PDFFORM_PREVIEW_' + cfg.kind.toUpperCase()); return last; }
      catch (e) { console.error(e); pvInfo.textContent = 'PDF 를 만들지 못했습니다: ' + (e && e.message || e); log('PDF 양식 실패: ' + (e && e.message || e), 'err'); return null; }
      finally { busy = false; pvB.disabled = svB.disabled = false; }
    }
    const pvB = el('button', { type: 'button', className: 'tbtn', textContent: '미리보기', onclick: () => run(true) });
    const svB = el('button', { type: 'button', className: 'tbtn primary', textContent: 'PDF 저장', onclick: async () => { const r = last || await run(true); if (!r) return;
      const fn = ([info.dwgno, info.title || (cfg.kind === 'quote' ? info.subject : '')].filter(Boolean).join('_') || 'mucca') .replace(/[\\/:*?"<>|]+/g, '_') + '_' + { bundle: '제출', cover: '표지', bom: '부품표', quote: '견적' }[cfg.kind] + '.pdf';
      log(`PDF 양식: ${KIND[cfg.kind]} · ${r.pages}쪽 · ${(r.u8.length / 1024).toFixed(0)}KB`, 'ok'); evt('PDFFORM_SAVE_' + cfg.kind.toUpperCase()); window.__lastPdf = new Blob([r.u8], { type: 'application/pdf' }); await offer(fn, window.__lastPdf); } });
    const clB = el('button', { type: 'button', className: 'tbtn', textContent: '닫기' });
    kindSel.onchange = () => { cfg.kind = kindSel.value; drawInfo(); drawRows(); dirty(1); };
    left.append(fsK, fsI, fsB, fsT); drawInfo(); drawRows(); drawTb(); customS();
    box.querySelectorAll('input,select').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
    box.addEventListener('keydown', e => e.stopPropagation());
    const m = modal('PDF 양식 — 표지 · 부품표 · 제출 묶음 · 견적', [box], [clB, pvB, svB]); const sh = m.querySelector('.sheet'); if (sh) sh.style.width = 'min(1060px,100%)';
    clB.onclick = () => { m.remove(); cur = null; try { cmdIn.focus(); } catch (_) { } };
    cur = { m, run, get last() { return last; }, get rows() { return rows; }, info, page: () => page };
    evt('PDFFORM_OPEN'); setTimeout(() => run(true), 50);
    return cur;
  }

  /* ---------- 명령 · AI ---------- */
  TOOLS.pdfform = () => { setTimeout(() => open()); return null; };
  TOOLS.pdfsubmit = () => { setTimeout(() => open({ kind: 'bundle' })); return null; };
  TOOLS.pdfcover = () => { setTimeout(() => open({ kind: 'cover' })); return null; };
  TOOLS.pdfbom = () => { setTimeout(() => open({ kind: 'bom' })); return null; };
  TOOLS.pdfquote = () => { setTimeout(() => open({ kind: 'quote' })); return null; };
  Object.assign(ALIAS, { PDFFORM: 'pdfform', SUBMITPDF: 'pdfsubmit', COVERPDF: 'pdfcover', BOMPDF: 'pdfbom', QUOTEPDF: 'pdfquote' });
  Object.assign(CMD_KO, { pdfform: 'PDF 양식', pdfsubmit: '도면 제출 PDF', pdfcover: '도면 제출 표지', pdfbom: '부품표 PDF', pdfquote: '견적 표지' });
  Object.assign(KO_CMD, { PDF양식: 'pdfform', 양식PDF: 'pdfform', 제출PDF: 'pdfsubmit', 도면제출: 'pdfsubmit', 제출묶음: 'pdfsubmit', 표지: 'pdfcover', 도면표지: 'pdfcover', 제출표지: 'pdfcover', 부품표PDF: 'pdfbom', 견적표지: 'pdfquote', 견적서: 'pdfquote', 견적PDF: 'pdfquote' });
  COMMANDS.pdf_form = c => { const k = KIND[c.kind] ? c.kind : 'bundle'; const w = open({ kind: k, info: c.info && typeof c.info === 'object' ? c.info : null, rows: Array.isArray(c.rows) ? c.rows : null });
    return { opened: KIND[k], rows: w.rows.length, note: 'PDF 양식 창을 열었습니다. 저장은 사용자가 [PDF 저장] 을 눌러야 합니다. info 키: ' + INFO.map(x => x[0]).join(',') }; };
  const G = `[PDF 양식] 사용자가 "표지/부품표/제출 PDF/견적서 만들어 줘" 하면 {"cmd":"pdf_form","kind":"bundle|cover|bom|quote","info":{"project":"","title":"","dwgno":"","author":""},"rows":[["품명","규격","재질","수량","비고"]]} — 창만 열고 저장은 사용자가 누릅니다. rows 를 빼면 지금 도면(표준 부품·블록·3D 부품)에서 읽습니다. 단가·고객 정보는 사용자가 준 값만 넣습니다.`;
  const hook = () => { const g = window.LAB2D; if (g && typeof g.guide === 'string') { if (!g.guide.includes('pdf_form')) g.guide += '\n\n' + G; return true; } return false; };
  if (!hook()) { let n = 0; const t = setInterval(() => { if (hook() || ++n > 40) clearInterval(t); }, 500); }
  /* 툴바: [PDF 출력] 옆에 [PDF 양식] */
  (function () { if (document.getElementById('miPdfForm')) return; const menu = document.getElementById('outMenu'), ref = document.getElementById('miPdf');
    if (menu) { const mi = el('button', { id: 'miPdfForm', role: 'menuitem', tabIndex: -1 }, [el('span', { textContent: 'PDF 양식 (표지·부품표·제출 묶음·견적)' }), el('span', { className: 'k', textContent: 'PDFFORM' })]);
      mi.onclick = () => { menu.hidden = true; const ob = document.getElementById('bOut'); if (ob) ob.setAttribute('aria-expanded', 'false'); open(); }; ref ? ref.after(mi) : menu.appendChild(mi); return; }
    const pb = document.getElementById('bPdf'); if (pb) pb.after(el('button', { className: 'tbtn', id: 'miPdfForm', textContent: 'PDF 양식', onclick: () => open() })); })();
  window.LABPDFFORM = { open, build, collectRows, loadLib, loadFonts, templates: { bom: bomTemplate, cover: coverTemplate, quote: quoteTemplate }, get cfg() { return cfg; }, get cur() { return cur; } };
})();
