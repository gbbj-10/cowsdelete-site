/* 무카 CAD AI 팀 실험판 — 치수 목록 창 (개발2, 2026-11-04)
   명령: DIMEXTRACT (별칭 DIMLIST) · 한글 '치수목록' · '치수추출'
   - 선택한 객체가 있으면 그 안의 치수만, 없으면 도면 전체 치수를 표로 보여 줌
   - 행을 누르면 그 치수를 선택하고 화면을 그쪽으로 옮김
   - [CSV 받기] · [엑셀 받기](MUCCABOM 엑셀 도구가 있을 때만)
   - 도면은 바꾸지 않음(되돌리기 필요 없음). 사용 기록은 창 열기 한 번만(값·글자 안 보냄)
   데이터는 labdimx-core.js 의 window.DIMX.list / toCSV / KIND_KO 를 실행 시점에 찾아 씀. */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  const MAX = 2000;

  /* 도면 이름: 마지막으로 연 파일 이름을 기억(openFile 을 감싸기만 함, 동작은 그대로) */
  let lastName = '';
  try {
    if (typeof window.openFile === 'function' && !window.openFile.__dimxWrap) {
      const _of = window.openFile;
      const w = function (f) { try { if (f && f.name) lastName = String(f.name); } catch (_) { } return _of.apply(this, arguments); };
      w.__dimxWrap = true; window.openFile = w;
    }
  } catch (_) { }
  const drawingName = () => {
    let n = (typeof window.__docName === 'string' && window.__docName) || lastName || '도면';
    n = n.replace(/\.(dxf|dwg|json|pdf)$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
    return (n || '도면').slice(0, 60);
  };

  /* 스타일 (기존 창 .modal/.sheet 위에 표만 더함, 다크 색 변수 사용) */
  if (!document.getElementById('dimxCss')) {
    const st = document.createElement('style'); st.id = 'dimxCss';
    st.textContent = `
.modal.dimx{background:rgba(5,7,9,.38)}
.modal.dimx .sheet{width:min(860px,100%)}
.dimx .sum{margin:0 0 8px;color:var(--ink)}
.dimx .sum b{color:var(--tag)}
.dimx .hint{margin:0 0 8px;color:var(--ink-dim);font-size:12px}
.dimx .warn{margin:0 0 8px;color:var(--tag);font-size:12px}
.dimx .tw{max-height:min(52vh,460px);overflow:auto;border:1px solid var(--rule);border-radius:6px}
.dimx table{border-collapse:collapse;width:100%;font-size:12px}
.dimx th,.dimx td{padding:5px 8px;border-bottom:1px solid var(--rule);text-align:left;white-space:nowrap}
.dimx th{position:sticky;top:0;background:var(--chrome-2);color:var(--ink-dim);font-weight:600;z-index:1}
.dimx td.n{text-align:right;font-family:var(--mono)}
.dimx td.t{font-family:var(--mono);max-width:220px;overflow:hidden;text-overflow:ellipsis}
.dimx td.ov{text-align:center;color:var(--tag)}
.dimx tbody tr{cursor:pointer}
.dimx tbody tr:hover{background:var(--chrome-2)}
.dimx tbody tr.on{background:rgba(90,169,255,.18);outline:1px solid var(--sel)}
.dimx .empty{padding:18px 4px;color:var(--ink-dim);text-align:center}`;
    document.head.appendChild(st);
  }

  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const num = v => (typeof v === 'number' && isFinite(v) ? String(Math.round(v * 10000) / 10000) : (v == null ? '' : String(v)));
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };

  function selectAndShow(id) {
    try {
      const e = typeof byId === 'function' ? byId(id) : null;
      if (!e) { say('그 치수를 도면에서 찾지 못했습니다 (지워졌을 수 있습니다)', 'err'); return false; }
      sel.clear(); sel.add(id);
      try {
        const b = typeof bbox === 'function' ? bbox([e]) : null;
        if (b && typeof zoomBox === 'function' && isFinite(b.minX) && isFinite(b.maxX)) {
          const w = Math.max(1, b.maxX - b.minX), h = Math.max(1, b.maxY - b.minY), p = Math.max(w, h) * 0.6 + 5;
          zoomBox(b.minX - p, b.minY - p, b.maxX + p, b.maxY + p);
        }
      } catch (_) { }
      dirty = true;
      try { renderProps(); } catch (_) { } try { updateInfo(); } catch (_) { }
      return true;
    } catch (err) { say('선택하지 못했습니다: ' + (err && err.message || err), 'err'); return false; }
  }

  function open(ids) {
    const D = window.DIMX;
    if (!D || typeof D.list !== 'function') { say('치수 목록 모듈을 불러오지 못했습니다. 화면을 새로 고친 뒤 다시 해 보세요.', 'err'); return null; }
    try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'DIMX_OPEN' }); } catch (_) { }
    let r;
    try { r = D.list(ids && ids.length ? { ids } : {}) || {}; }
    catch (err) { say('치수를 읽다가 문제가 생겼습니다: ' + (err && err.message || err), 'err'); return null; }
    const rows = Array.isArray(r.rows) ? r.rows : [];
    const skipped = (r.skipped && +r.skipped.block) || 0;
    const KO = D.KIND_KO || {};
    const scope = ids && ids.length ? '선택한 객체' : '도면 전체';

    const body = el('div', 'dimx');
    const sum = el('p', 'sum');
    sum.innerHTML = `${scope} · 치수 <b></b>개 · 읽지 못한 치수 <b></b>개(블록으로 들어온 치수)`;
    const bs = sum.querySelectorAll('b'); bs[0].textContent = rows.length; bs[1].textContent = skipped;
    body.appendChild(sum);

    const foot = [];
    if (!rows.length) {
      body.appendChild(el('div', 'empty', ids && ids.length
        ? '선택한 객체 안에 치수가 없습니다. 선택을 풀고 다시 하면 도면 전체 치수를 봅니다.'
        : (skipped ? '읽을 수 있는 치수가 없습니다. 블록으로 들어온 치수는 아직 읽지 못합니다.' : '이 도면에는 치수가 없습니다.')));
    } else {
      body.appendChild(el('p', 'hint', '줄을 누르면 그 치수를 선택하고 화면을 그쪽으로 옮깁니다. 값은 측정값×측정 축척, "화면 글자"는 도면에 보이는 글자 그대로입니다.'));
      if (rows.length > MAX) body.appendChild(el('p', 'warn', `앞 ${MAX}개만 보임 — 전체는 CSV 로 받으세요.`));
      const tw = el('div', 'tw'), tb = el('table'), th = el('thead'), hr = el('tr');
      for (const h of ['번호', '종류', '값', '단위', '화면 글자', '덮어씀', '도면층']) { const c = el('th', null, h); if (h === '번호' || h === '값') c.style.textAlign = 'right'; if (h === '덮어씀') c.style.textAlign = 'center'; hr.appendChild(c); }
      th.appendChild(hr); tb.appendChild(th);
      const tbd = el('tbody'), frag = document.createDocumentFragment();
      const n = Math.min(rows.length, MAX);
      for (let i = 0; i < n; i++) {
        const w = rows[i], tr = el('tr'); tr.dataset.id = w.id; tr.dataset.i = i;
        tr.appendChild(el('td', 'n', w.no != null ? String(w.no) : String(i + 1)));
        tr.appendChild(el('td', null, KO[w.kind] || w.kind || ''));
        tr.appendChild(el('td', 'n', num(w.value)));
        tr.appendChild(el('td', null, w.unit == null ? '' : String(w.unit)));
        const tt = el('td', 't', w.text == null ? '' : String(w.text)); tt.title = tt.textContent; tr.appendChild(tt);
        tr.appendChild(el('td', 'ov', w.override ? '✔' : ''));
        tr.appendChild(el('td', null, w.layer == null ? '' : String(w.layer)));
        frag.appendChild(tr);
      }
      tbd.appendChild(frag); tb.appendChild(tbd); tw.appendChild(tb); body.appendChild(tw);
      tbd.addEventListener('click', ev => {
        const tr = ev.target.closest && ev.target.closest('tr'); if (!tr || tr.dataset.id == null) return;
        const w = rows[+tr.dataset.i]; if (!w) return;
        if (selectAndShow(w.id)) { tbd.querySelectorAll('tr.on').forEach(x => x.classList.remove('on')); tr.classList.add('on'); }
      });

      const stamp = drawingName();
      const bc = el('button', 'tbtn primary', 'CSV 받기');
      bc.onclick = () => {
        try {
          const csv = '﻿' + D.toCSV(rows);
          offer(`치수목록_${stamp}.csv`, csv);
        } catch (err) { say('CSV 를 만들지 못했습니다: ' + (err && err.message || err), 'err'); }
      };
      foot.push(bc);
      const X = window.MUCCABOM && MUCCABOM._t && typeof MUCCABOM._t.xlsx === 'function' ? MUCCABOM._t.xlsx : null;
      if (X) {
        const bx = el('button', 'tbtn', '엑셀 받기');
        bx.onclick = () => {
          try {
            const head = ['번호', '종류', '값', '단위', '화면 글자', '덮어씀', '도면층'];
            const bodyRows = rows.map((w, i) => [w.no != null ? w.no : i + 1, KO[w.kind] || w.kind || '', typeof w.value === 'number' && isFinite(w.value) ? w.value : (w.value == null ? '' : String(w.value)),
              w.unit == null ? '' : String(w.unit), w.text == null ? '' : String(w.text), w.override ? 'O' : '', w.layer == null ? '' : String(w.layer)]);
            offer(`치수목록_${stamp}.xlsx`, X([{ name: '치수 목록', head, body: bodyRows }]));
          } catch (err) { say('엑셀 파일을 만들지 못했습니다: ' + (err && err.message || err), 'err'); }
        };
        foot.push(bx);
      }
    }
    let m;
    try { m = modal('치수 목록', [body], foot.length ? foot : null); m.classList.add('dimx'); }
    catch (err) { say('목록 창을 열지 못했습니다: ' + (err && err.message || err), 'err'); return null; }
    say(`치수 목록: ${scope} 치수 ${rows.length}개${skipped ? ` · 읽지 못한 치수 ${skipped}개(블록)` : ''}`, 'ok');
    return m;
  }

  /* 명령 등록 (labcmds.js 와 같은 방식) */
  TOOLS.dimextract = () => { const ids = sel && sel.size ? [...sel] : null; open(ids); return null; };
  Object.assign(ALIAS, { DIMEXTRACT: 'dimextract', DIMLIST: 'dimextract' });
  if (typeof CMD_KO === 'object') CMD_KO.dimextract = '치수 목록';
  if (typeof KO_CMD === 'object') Object.assign(KO_CMD, { 치수목록: 'dimextract', 치수추출: 'dimextract', 치수목록뽑기: 'dimextract' });
  window.DIMXUI = { open, selectAndShow };
})();
