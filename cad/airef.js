/* 무카 CAD — AI 입력칸에 참고 사진·그림·PDF 도면 첨부
   - 📎 버튼 · 붙여넣기(Ctrl+V) · 끌어다 놓기 · [열기]에서 고른 PDF/이미지로 최대 4장
   - PDF 는 쪽마다 이미지로 바꿔서 넣음 (pdf.js 는 PDF 를 넣을 때만 받음)
   - 연결 프로그램은 그대로: 요청에 "참고 이미지 N장" 안내를 붙이고,
     Claude 가 mucca_snapshot 을 부르면 화면 대신 첨부 이미지를 한 장씩 먼저 돌려줌 */
(function () {
  'use strict';
  const MAX = 4, MAXPX = 1568;
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const aiIn = document.getElementById('aiIn'), bAi = document.getElementById('bAi');
  const sec = aiIn && aiIn.closest('.sec');
  if (!aiIn || !bAi || !sec) return;
  const st = document.createElement('style');
  st.textContent = `
.aiRefs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0}
.aiRefs:empty{display:none}
.aiRef{position:relative;width:64px;height:64px;border:1px solid var(--rule);border-radius:6px;overflow:hidden;background:#fff}
.aiRef img{width:100%;height:100%;object-fit:contain;display:block}
.aiRef button{position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;border:0;background:rgba(0,0,0,.7);color:#fff;font:12px/18px var(--sans);cursor:pointer;padding:0}
.aiAttach{display:flex;align-items:flex-start;gap:8px;margin-top:6px;font-size:12px;line-height:1.45;color:var(--ink-dim)}
.aiAttach button{white-space:nowrap;flex:none;background:var(--chrome-2);color:var(--ink);border:1px solid var(--rule);border-radius:5px;padding:3px 9px;font:500 12px var(--sans);cursor:pointer}
.aiAttach button:focus-visible{outline:2px solid #6f9fd0;outline-offset:1px}
.sec.ai.dropping{outline:2px dashed #6f9fd0;outline-offset:-4px}
.aiMsg .aiThumbs{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}
.aiMsg .aiThumbs img{width:48px;height:48px;object-fit:contain;background:#fff;border-radius:4px;border:1px solid var(--rule)}`;
  document.head.appendChild(st);

  const bar = document.createElement('div'); bar.className = 'aiAttach';
  const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '📎 사진·PDF'; btn.title = '참고 사진·손그림·도면(PDF·JPG·PNG) 첨부 — 붙여넣기·끌어다 놓기도 됩니다';
  const tip = document.createElement('span');
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*,.pdf,application/pdf'; file.multiple = true; file.hidden = true;
  bar.append(btn, tip, file);
  const strip = document.createElement('div'); strip.className = 'aiRefs';
  aiIn.after(strip, bar);
  btn.onclick = () => file.click();
  file.onchange = () => { addFiles(file.files); file.value = ''; };

  let refs = [], queue = [], sentN = 0, busy = false;
  const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
  const isImg = f => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name || '');
  const canDraw = () => { const A = window.__aic; return !!(A && A.state === 'on' && (A.claude || (A.engines && Object.values(A.engines).some(Boolean)))); };

  function fromCanvas(src, name) {
    const k = Math.min(1, MAXPX / Math.max(src.width, src.height)), w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h);
    const data = c.toDataURL('image/png');
    return { name, w, h, png: data.slice(data.indexOf(',') + 1), url: data };
  }
  function imgToRef(f) {
    return new Promise((ok, no) => {
      const url = URL.createObjectURL(f), im = new Image();
      im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); URL.revokeObjectURL(url); ok(fromCanvas(c, f.name || '붙여넣은 이미지')); };
      im.onerror = () => { URL.revokeObjectURL(url); no(new Error('이미지를 읽지 못했습니다: ' + (f.name || ''))); };
      im.src = url;
    });
  }
  let pdfLib = null;
  function loadPdfJs() {
    if (pdfLib) return pdfLib;
    pdfLib = new Promise((ok, no) => {
      if (window.pdfjsLib) return ok(window.pdfjsLib);
      const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js';
      s.onload = () => { if (!window.pdfjsLib) return no(new Error('PDF 읽기 도구를 불러오지 못했습니다')); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = () => { pdfLib = null; no(new Error('PDF 읽기 도구를 받지 못했습니다 (인터넷 연결 확인)')); };
      document.head.appendChild(s);
    });
    return pdfLib;
  }
  async function pdfToRefs(f, room) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    const out = [], n = Math.min(doc.numPages, room);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i), v0 = page.getViewport({ scale: 1 });
      const k = Math.min(4, MAXPX / Math.max(v0.width, v0.height)), vp = page.getViewport({ scale: k });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      out.push(fromCanvas(c, `${f.name || 'PDF'} ${doc.numPages > 1 ? i + '쪽' : ''}`.trim()));
    }
    const skipped = doc.numPages - n; try { doc.destroy(); } catch (_) { }
    return { refs: out, skipped };
  }
  async function addFiles(list) {
    const fs = [...(list || [])].filter(f => isImg(f) || isPdf(f));
    if (!fs.length) return 0;
    busy = true; let added = 0, note = '';
    for (const f of fs) {
      const room = MAX - refs.length;
      if (room <= 0) { note = `최대 ${MAX}장까지 넣을 수 있습니다`; break; }
      try {
        if (isPdf(f)) {
          tip.textContent = `${f.name} 읽는 중…`;
          const r = await pdfToRefs(f, room); refs.push(...r.refs); added += r.refs.length;
          if (r.skipped > 0) note = `PDF가 길어서 앞 ${r.refs.length}쪽만 넣었습니다 (최대 ${MAX}장)`;
        } else { refs.push(await imgToRef(f)); added++; }
      } catch (e) { note = e.message || String(e); }
      paint();
    }
    busy = false; paint(); if (note) tip.textContent = note + ' · ' + tip.textContent;
    return added;
  }
  function paint() {
    strip.replaceChildren(...refs.map((r, i) => {
      const d = document.createElement('div'); d.className = 'aiRef'; d.title = `${r.name} · ${r.w}×${r.h}`;
      const im = document.createElement('img'); im.src = r.url; im.alt = r.name;
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = '빼기'; x.setAttribute('aria-label', r.name + ' 빼기'); x.onclick = () => { refs.splice(i, 1); paint(); };
      d.append(im, x); return d;
    }));
    if (busy) return;
    if (!refs.length) tip.textContent = '손그림·제품 사진·PDF 도면을 넣으면 Claude가 보고 그립니다';
    else if (canDraw()) tip.textContent = `참고 이미지 ${refs.length}장 · 요청을 쓰고 [그리기]`;
    else tip.textContent = `참고 이미지 ${refs.length}장 · 이 입력칸은 Claude 연결 + 내 PC의 Claude Code(Pro 이상)·Codex CLI·Gemini CLI 중 하나가 있어야 그립니다. 무료 요금제라면 같은 파일을 Claude 앱 대화창에 첨부하고 "무카 CAD에 그대로 그려줘"라고 쓰세요.`;
  }
  paint();
  setInterval(() => { if (refs.length && !busy) paint(); }, 2000);
  aiIn.addEventListener('paste', e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => isImg(f) || isPdf(f)); if (fs.length) { e.preventDefault(); addFiles(fs); } });
  sec.addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); e.stopPropagation(); sec.classList.add('dropping'); } });
  sec.addEventListener('dragleave', e => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('dropping'); });
  sec.addEventListener('drop', e => { sec.classList.remove('dropping'); if (e.dataTransfer.files.length) { e.preventDefault(); e.stopPropagation(); addFiles(e.dataTransfer.files); } });
  // 그림만 넣고 글을 안 쓴 경우 기본 요청
  bAi.addEventListener('click', () => { if (refs.length && !aiIn.value.trim() && bAi.textContent !== '중지') aiIn.value = '첨부한 도면을 그대로 2D 도면으로 그려줘'; }, true);

  window.AIREF = {
    /* 요청 보낼 때: 안내문 붙이고 첨부를 대기열로 */
    wrap(text) {
      if (!refs.length) return text;
      queue = refs.slice(); sentN = queue.length;
      const me = [...document.querySelectorAll('#aiLog .aiMsg.me')].pop();
      if (me) { const t = document.createElement('div'); t.className = 'aiThumbs'; for (const r of queue) { const i = document.createElement('img'); i.src = r.url; i.alt = r.name; t.append(i); } me.append(t); }
      refs = []; paint();
      return text + `\n\n[참고 이미지 ${sentN}장 첨부] 사용자가 사진·그림·PDF 도면을 첨부했다. 그리기 전에 mucca_snapshot 을 ${sentN}번 호출하면 첨부 이미지가 1장씩 순서대로 온다(그 다음 호출부터는 원래대로 CAD 화면). 도면이면 형상과 적힌 치수를 그대로 따라 그리고, 사진·손그림이면 형상 참고용이다. 치수는 사용자가 적은 값과 그림에 적힌 치수를 따르고, 없으면 비율로 추정해 마지막 답에 추정한 값을 알려준다. 큰 도면은 외형 → 세부 → 치수 순서로 나눠 그린다.`;
    },
    /* mucca_snapshot 이 불릴 때: 대기 중인 첨부가 있으면 그것부터 */
    next() {
      if (!queue.length) return null; const r = queue.shift(), i = sentN - queue.length;
      return { png: r.png, note: `참고 이미지 ${i}/${sentN} — 사용자가 첨부한 "${r.name}" (${r.w}×${r.h}px). CAD 화면이 아님.` };
    },
    done() { queue = []; },
    count: () => refs.length, add: addFiles, accepts: f => isImg(f) || isPdf(f)
  };
  window.LABREF = window.AIREF; /* 예전 이름 (테스트 서버) */
})();
