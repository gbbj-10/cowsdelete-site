/* 무카 CAD 테스트 서버 — AI 채팅에 참고 사진·그림 첨부
   - 📎 버튼 · 붙여넣기(Ctrl+V) · 끌어다 놓기로 최대 4장
   - 연결 프로그램 v1.0.3 그대로: 요청에 "참고 이미지 N장" 안내를 붙이고,
     Claude가 mucca_snapshot 을 부르면 화면 대신 첨부 이미지를 한 장씩 먼저 돌려줌 */
(function () {
  'use strict';
  const MAX = 4, MAXPX = 1280;
  const aiIn = document.getElementById('aiIn'), bAi = document.getElementById('bAi');
  const sec = aiIn && aiIn.closest('.sec');
  if (!aiIn || !bAi || !sec) return;
  const st = document.createElement('style');
  st.textContent = `
.aiRefs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0}
.aiRefs:empty{display:none}
.aiRef{position:relative;width:64px;height:64px;border:1px solid var(--rule);border-radius:6px;overflow:hidden;background:var(--ground)}
.aiRef img{width:100%;height:100%;object-fit:cover;display:block}
.aiRef button{position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;border:0;background:rgba(0,0,0,.7);color:#fff;font:12px/18px var(--sans);cursor:pointer;padding:0}
.aiAttach{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:var(--ink-dim)}
.aiAttach button{white-space:nowrap;flex:none;background:var(--chrome-2);color:var(--ink);border:1px solid var(--rule);border-radius:5px;padding:3px 9px;font:500 12px var(--sans);cursor:pointer}
.sec.ai.dropping{outline:2px dashed #6f9fd0;outline-offset:-4px}
.aiMsg .aiThumbs{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}
.aiMsg .aiThumbs img{width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid var(--rule)}`;
  document.head.appendChild(st);

  const bar = document.createElement('div'); bar.className = 'aiAttach';
  const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '📎 사진·그림'; btn.title = '참고 사진·손그림·도면 이미지 첨부 (붙여넣기·끌어다 놓기도 됩니다)';
  const tip = document.createElement('span'); tip.textContent = '손그림·제품 사진을 넣으면 Claude가 보고 그립니다';
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.multiple = true; file.hidden = true;
  bar.append(btn, tip, file);
  const strip = document.createElement('div'); strip.className = 'aiRefs';
  aiIn.after(strip, bar);
  btn.onclick = () => file.click();
  file.onchange = () => { addFiles(file.files); file.value = ''; };

  let refs = [], queue = [], sentN = 0;
  function toPng(f) {
    return new Promise((ok, no) => {
      const url = URL.createObjectURL(f), im = new Image();
      im.onload = () => {
        const k = Math.min(1, MAXPX / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
        const data = c.toDataURL('image/png'); ok({ name: f.name || '붙여넣은 이미지', w, h, png: data.slice(data.indexOf(',') + 1), url });
      };
      im.onerror = () => { URL.revokeObjectURL(url); no(new Error('이미지를 읽지 못했습니다: ' + (f.name || ''))); };
      im.src = url;
    });
  }
  async function addFiles(list) {
    const fs = [...(list || [])].filter(f => /^image\//.test(f.type));
    if (!fs.length) return;
    for (const f of fs) {
      if (refs.length >= MAX) { tip.textContent = `최대 ${MAX}장까지 넣을 수 있습니다`; break; }
      try { refs.push(await toPng(f)); } catch (e) { tip.textContent = e.message; }
    }
    paint();
  }
  function paint() {
    strip.replaceChildren(...refs.map((r, i) => {
      const d = document.createElement('div'); d.className = 'aiRef'; d.title = `${r.name} · ${r.w}×${r.h}`;
      const im = document.createElement('img'); im.src = r.url; im.alt = r.name;
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = '빼기'; x.onclick = () => { URL.revokeObjectURL(r.url); refs.splice(i, 1); paint(); };
      d.append(im, x); return d;
    }));
    tip.textContent = refs.length ? `참고 이미지 ${refs.length}장 · 요청을 쓰고 [그리기]` : '손그림·제품 사진을 넣으면 Claude가 보고 그립니다';
  }
  aiIn.addEventListener('paste', e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => /^image\//.test(f.type)); if (fs.length) { e.preventDefault(); addFiles(fs); } });
  sec.addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); sec.classList.add('dropping'); } });
  sec.addEventListener('dragleave', e => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('dropping'); });
  sec.addEventListener('drop', e => { sec.classList.remove('dropping'); if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
  // 사진만 넣고 글을 안 쓴 경우 기본 요청
  bAi.addEventListener('click', () => { if (refs.length && !aiIn.value.trim() && bAi.textContent !== '중지') aiIn.value = '첨부한 그림을 보고 2D 도면으로 그려줘'; }, true);

  window.LABREF = {
    /* 요청 보낼 때: 안내문 붙이고 첨부를 대기열로 */
    wrap(text) {
      if (!refs.length) return text;
      queue = refs.slice(); sentN = queue.length;
      const me = [...document.querySelectorAll('#aiLog .aiMsg.me')].pop();
      if (me) { const t = document.createElement('div'); t.className = 'aiThumbs'; for (const r of queue) { const i = document.createElement('img'); i.src = r.url; i.alt = r.name; t.append(i); } me.append(t); }
      refs = []; paint();
      return text + `\n\n[참고 이미지 ${sentN}장 첨부] 사용자가 사진·그림을 첨부했다. 그리기 전에 mucca_snapshot 을 ${sentN}번 호출하면 첨부 이미지가 1장씩 순서대로 온다(그 다음 호출부터는 원래대로 CAD 화면). 사진은 형상을 이해하는 용도이고, 치수는 사용자가 적은 값과 그림에 적힌 치수를 따른다. 그림에 치수가 없으면 비율로 추정하고 마지막 답에 추정한 값을 알려준다.`;
    },
    /* mucca_snapshot 이 불릴 때: 대기 중인 첨부가 있으면 그것부터 */
    next() {
      if (!queue.length) return null; const r = queue.shift(), i = sentN - queue.length;
      return { png: r.png, note: `참고 이미지 ${i}/${sentN} — 사용자가 첨부한 "${r.name}" (${r.w}×${r.h}px). CAD 화면이 아님.` };
    },
    done() { queue = []; },
    count: () => refs.length, add: addFiles
  };
})();
