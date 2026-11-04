/* 무카 CAD AI 팀 실험판 — 형상 치수 뽑기 창 (3회차 개발2, 2026-11-04)
   window.GEODIM_UI = { open, attach, toCSV }
   명령: GEODIM · 한글 '형상치수' · '자동치수추출' ('치수추출'은 1회차 DIMEXTRACT 가 씀)
   - 선택이 있으면 그것만, 없으면 도면 전체를 GEODIM.extract(geodim-core.js) 로 재서 뷰별 표로 보여 줌
   - 행을 누르면 그 구멍 묶음(또는 뷰) 쪽으로 화면 이동. 도면은 바꾸지 않음
   - [CSV 받기] · [도면에 치수 붙이기] = attach(result): runBatch 1번(되돌리기 1번)으로 '치수' 도면층에
     뷰마다 가로·세로 dim_linear, 구멍 묶음마다 dim_diameter('{n}-<>' / '<>'), PCD 는 가상 원 dim_diameter('PCD <>').
     글자에 '<>'(측정값)를 남겨 1회차 DIMX 가 '덮어씀'으로 보지 않게 함. 기존 도형은 하나도 안 바꿈.
   - 사용 기록은 'GEODIM_OPEN' · 'GEODIM_ATTACH' 이름만 (값·글자는 보내지 않음). 화면 글자는 모두 textContent. */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  const TITLE = '형상 치수 뽑기';
  const NOTE = '형상에서 잰 값입니다(도면 단위 그대로 — 척도·축척·블록 배율이 반영 안 됐을 수 있음). 설계 치수는 원 도면으로 확인하세요';
  const ELL_WHY = '블록 배율로 타원 — 원 지름 아님';
  const ELL_OTHER = '타원 — 구멍으로 세지 않음';
  const LAYER = '치수';
  const evt = n => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: n }); } catch (_) { } };
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const fin = x => typeof x === 'number' && isFinite(x);
  const f2 = v => (fin(+v) && v !== null && v !== '' ? String(Math.round(+v * 100) / 100) : '');
  const errMsg = e => String((e && e.message) || e || '알 수 없는 오류').slice(0, 300);
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  const arr = v => (Array.isArray(v) ? v : (fin(v) ? [v] : []));
  const pitchTxt = v => { const a = arr(v).map(f2).filter(Boolean); if (a.length > 8) return a.slice(0, 8).join(', ') + ` … (+${a.length - 8})`; return a.join(', '); };
  const hasPcd = h => !!(h && h.pcd && fin(+h.pcd.d) && +h.pcd.d > 0);
  const holeLabel = h => (h.n > 1 ? `${h.n}-Ø${f2(h.d)}` : `Ø${f2(h.d)}`);
  const sizeTxt = s => (Array.isArray(s) && s.length >= 2 ? `${f2(s[0])} × ${f2(s[1])}` : '');
  const sameSize = (a, b) => Array.isArray(a) && Array.isArray(b) && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

  let lastName = '';
  try {
    if (typeof window.openFile === 'function' && !window.openFile.__geodimWrap) {
      const _of = window.openFile;
      const w = function (f) { try { if (f && f.name) lastName = String(f.name); } catch (_) { } return _of.apply(this, arguments); };
      w.__geodimWrap = true; w.__dimxWrap = _of.__dimxWrap; window.openFile = w;
    }
  } catch (_) { }
  const drawingName = () => {
    let n = (typeof window.__docName === 'string' && window.__docName) || lastName || '도면';
    n = n.replace(/\.(dxf|dwg|json|pdf)$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
    return (n || '도면').slice(0, 60);
  };

  if (!document.getElementById('geodimCss')) {
    const st = document.createElement('style'); st.id = 'geodimCss';
    st.textContent = `
.modal.geodim{background:rgba(5,7,9,.38)}
.modal.geodim .sheet{width:min(900px,100%)}
.geodim .note{margin:0 0 8px;padding:6px 8px;border:1px solid var(--tag);border-radius:6px;color:var(--tag);font-size:12px;line-height:1.45}
.geodim .sum{margin:0 0 6px;color:var(--ink)}
.geodim .sum b{color:var(--tag)}
.geodim .hint{margin:0 0 8px;color:var(--ink-dim);font-size:12px}
.geodim ul.wl{margin:0 0 8px 18px;padding:0;color:var(--tag);font-size:12px}
.geodim .tw{max-height:min(52vh,480px);overflow:auto;border:1px solid var(--rule);border-radius:6px}
.geodim table{border-collapse:collapse;width:100%;font-size:12px}
.geodim th,.geodim td{padding:5px 8px;border-bottom:1px solid var(--rule);text-align:left;white-space:nowrap}
.geodim th{position:sticky;top:0;background:var(--chrome-2);color:var(--ink-dim);font-weight:600;z-index:1}
.geodim td.n{text-align:right;font-family:var(--mono)}
.geodim td.m{font-family:var(--mono)}
.geodim td.w{color:var(--tag);white-space:normal;min-width:120px}
.geodim tr.vh td{background:var(--chrome-2);color:var(--ink);font-weight:600}
.geodim tbody tr{cursor:pointer}
.geodim tbody tr:hover{background:var(--chrome-2)}
.geodim tbody tr.on{background:rgba(90,169,255,.18);outline:1px solid var(--sel)}
.geodim .empty{padding:18px 4px;color:var(--ink-dim);text-align:center}`;
    document.head.appendChild(st);
  }

  /* ---------- 표 행 만들기 (화면·CSV 공통) ---------- */
  function rowsOf(r) {
    const out = [];
    (r && Array.isArray(r.views) ? r.views : []).forEach((v, vi) => {
      const vn = String(v && v.name != null ? v.name : `뷰 ${vi + 1}`);
      let sw = '';
      if (v.sizeAll && !sameSize(v.sizeAll, v.size)) sw = `중심선 의심 포함 시 ${sizeTxt(v.sizeAll)}`;
      out.push({ kind: 'size', view: vn, vi, item: `형상 크기 ${sizeTxt(v.size)}`, n: '', d: '', pcd: '', px: '', py: '', warn: sw, box: v.box });
      (Array.isArray(v.holes) ? v.holes : []).forEach((h, hi) => {
        out.push({ kind: 'hole', view: vn, vi, hi, item: holeLabel(h), n: h.n, d: f2(h.d), pcd: hasPcd(h) ? `Ø${f2(h.pcd.d)}` : '',
          px: hasPcd(h) ? '' : pitchTxt(h.pitchX), py: hasPcd(h) ? '' : pitchTxt(h.pitchY), warn: h.warn ? String(h.warn) : '', h });
      });
      (Array.isArray(v.ellipses) ? v.ellipses : []).forEach(e => {
        out.push({ kind: 'ell', view: vn, vi, item: `타원 ${f2(2 * e.rx)}×${f2(2 * e.ry)}`, n: e.n, d: '', pcd: '', px: '', py: '',
          warn: /블록\s*배율/.test(String(e.why || '')) ? ELL_WHY : ELL_OTHER, e });
      });
    });
    return out;
  }
  function toCSV(r) {
    const q = v => { let s = v == null ? '' : String(v); if (/^[=+@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const lines = [['뷰', '항목', '개수', '지름', 'PCD', '양 끝 중심 거리(가로)', '양 끝 중심 거리(세로)', '경고'].map(q).join(',')];
    for (const w of rowsOf(r)) lines.push([w.view, w.item, w.n, w.d, w.pcd, w.px.replace(/, /g, ' / '), w.py.replace(/, /g, ' / '), w.warn].map(q).join(','));
    return lines.join('\r\n') + '\r\n';
  }

  /* ---------- 화면 이동 ---------- */
  function zoomTo(x0, y0, x1, y1) {
    try {
      if (typeof zoomBox !== 'function' || ![x0, y0, x1, y1].every(fin)) return false;
      const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), p = Math.max(w, h) * 0.35 + 5;
      zoomBox(x0 - p, y0 - p, x1 + p, y1 + p); dirty = true; return true;
    } catch (_) { return false; }
  }
  function showRow(w) {
    try {
      if (w.kind === 'hole' && w.h && Array.isArray(w.h.centers) && w.h.centers.length) {
        const rr = (+w.h.d || 0) / 2; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const c of w.h.centers) { if (!Array.isArray(c)) continue; x0 = Math.min(x0, c[0] - rr); y0 = Math.min(y0, c[1] - rr); x1 = Math.max(x1, c[0] + rr); y1 = Math.max(y1, c[1] + rr); }
        if (w.h.pcd && Array.isArray(w.h.pcd.c)) { const R = (+w.h.pcd.d || 0) / 2 + rr; x0 = Math.min(x0, w.h.pcd.c[0] - R); y0 = Math.min(y0, w.h.pcd.c[1] - R); x1 = Math.max(x1, w.h.pcd.c[0] + R); y1 = Math.max(y1, w.h.pcd.c[1] + R); }
        return zoomTo(x0, y0, x1, y1);
      }
      const b = w.box || (w.vb && w.vb.box);
      if (Array.isArray(b) && b.length >= 4) return zoomTo(b[0], b[1], b[2], b[3]);
    } catch (_) { }
    return false;
  }

  /* ---------- 도면에 치수 붙이기 ---------- */
  function buildCmds(r) {
    const cmds = [];
    const ds = (() => { try { return (+doc.dimScale || 1); } catch (_) { return 1; } })();
    for (const v of (r && Array.isArray(r.views) ? r.views : [])) {
      const b = v && v.box;
      if (Array.isArray(b) && b.length >= 4 && b.slice(0, 4).every(fin)) {
        const [x0, y0, x1, y1] = b, w = x1 - x0, h = y1 - y0, off = Math.max(8 * ds, 0.08 * Math.max(w, h));
        if (w > 1e-6) cmds.push({ cmd: 'dim_linear', p1: [x0, y0], p2: [x1, y0], at: [(x0 + x1) / 2, y0 - off], dir: 'h', layer: LAYER });
        if (h > 1e-6) cmds.push({ cmd: 'dim_linear', p1: [x0, y0], p2: [x0, y1], at: [x0 - off, (y0 + y1) / 2], dir: 'v', layer: LAYER });
      }
      for (const hl of (Array.isArray(v && v.holes) ? v.holes : [])) {
        const d = +hl.d; if (!(d > 0)) continue;
        const cs = (Array.isArray(hl.centers) ? hl.centers : []).filter(c => Array.isArray(c) && fin(+c[0]) && fin(+c[1]));
        if (!cs.length) continue;
        const rep = cs.reduce((a, c) => (c[0] + c[1] > a[0] + a[1] ? c : a), cs[0]);   // 오른쪽 위 구멍 = 지시선이 밖으로
        const n = +hl.n || cs.length;
        cmds.push({ cmd: 'dim_diameter', center: [+rep[0], +rep[1]], r: d / 2, angle: 45, text: n > 1 ? `${n}-<>` : '<>', layer: LAYER });
        if (hl.pcd && +hl.pcd.d > 0 && Array.isArray(hl.pcd.c) && fin(+hl.pcd.c[0]) && fin(+hl.pcd.c[1]))
          cmds.push({ cmd: 'dim_diameter', center: [+hl.pcd.c[0], +hl.pcd.c[1]], r: +hl.pcd.d / 2, angle: 135, text: 'PCD <>', layer: LAYER });
      }
    }
    return cmds;
  }
  function attach(result, opts) {
    try {
      opts = opts || {};
      let r = result;
      if (!r || !Array.isArray(r.views)) {
        const G = window.GEODIM;
        if (!G || typeof G.extract !== 'function') return { ok: false, added: 0, error: '형상 치수 모듈(GEODIM)을 불러오지 못했습니다' };
        r = G.extract(Object.assign({ view: 'auto' }, r && typeof r === 'object' ? r : {}));
      }
      if (!r || r.ok === false) return { ok: false, added: 0, error: (r && r.error) || '형상을 재지 못했습니다' };
      const cmds = buildCmds(r);
      if (!cmds.length) return { ok: false, added: 0, error: '붙일 치수가 없습니다' };
      const before = doc.entities.length;
      const R = runBatch(cmds, { record: opts.record !== false, label: TITLE });
      const ids = (R && R.results || []).filter(x => x && x.ok && x.id).map(x => x.id);
      try { dirty = true; } catch (_) { }
      evt('GEODIM_ATTACH');
      const out = { ok: !!(R && R.ok), added: ids.length, ids, entities: doc.entities.length, before };
      if (R && R.errors && R.errors.length) out.errors = R.errors.slice(0, 10);
      return out;
    } catch (err) { return { ok: false, added: 0, error: errMsg(err) }; }
  }

  /* ---------- 창 ---------- */
  function open(ids) {
    evt('GEODIM_OPEN');
    const G = window.GEODIM;
    const scope = ids && ids.length ? `선택한 객체 ${ids.length}개` : '도면 전체';
    const body = el('div', 'geodim');
    body.appendChild(el('p', 'note', NOTE));
    let r = null;
    if (!G || typeof G.extract !== 'function') r = { ok: false, error: '형상 치수 모듈(GEODIM)을 불러오지 못했습니다. 화면을 새로 고친 뒤 다시 해 보세요.' };
    else {
      try { r = G.extract(ids && ids.length ? { ids, view: 'auto' } : { view: 'auto' }) || { ok: false, error: '결과가 비었습니다' }; }
      catch (err) { r = { ok: false, error: '형상을 재다가 문제가 생겼습니다: ' + errMsg(err) }; }
    }
    const foot = [];
    if (!r || r.ok === false) {
      body.appendChild(el('div', 'empty', (r && r.error) || '형상을 재지 못했습니다'));
      if (ids && ids.length) body.appendChild(el('p', 'hint', '선택을 풀고 다시 하면 도면 전체를 잽니다.'));
    } else {
      const views = Array.isArray(r.views) ? r.views : [];
      const sk = r.skipped || {};
      const sum = el('p', 'sum');
      const parts = [[scope + ' · 뷰 ', views.length, '개'], [' · 빼낸 중심선·숨은선 ', +sk.aux || 0, '개'], [' · 중심선 의심 ', +sk.suspect || 0, '개'], [' · 도곽 ', +sk.frame || 0, '개']];
      if (+sk.hiddenLayer) parts.push([' · 꺼진 도면층 ', +sk.hiddenLayer, '개']);
      for (const [a, n, c] of parts) { sum.appendChild(document.createTextNode(a)); sum.appendChild(el('b', null, n)); sum.appendChild(document.createTextNode(c)); }
      if (fin(r.ms)) sum.appendChild(document.createTextNode(` · ${Math.round(r.ms)} ms`));
      body.appendChild(sum);
      const warns = Array.isArray(r.warnings) ? r.warnings.filter(Boolean) : [];
      if (warns.length) { const ul = el('ul', 'wl'); warns.slice(0, 12).forEach(w => ul.appendChild(el('li', null, w))); if (warns.length > 12) ul.appendChild(el('li', null, `… 외 ${warns.length - 12}개`)); body.appendChild(ul); }
      const rows = rowsOf(r);
      if (!views.length) body.appendChild(el('div', 'empty', '잴 형상이 없습니다.'));
      else {
        body.appendChild(el('p', 'hint', '줄을 누르면 그 구멍(또는 뷰) 쪽으로 화면을 옮깁니다. 양 끝 중심 거리 = 묶음에서 가장 왼쪽·오른쪽(가로), 가장 아래·위(세로) 구멍 중심 사이 거리입니다. PCD 가 있는 둥근 배치는 PCD 만 보여 줍니다.'));
        const tw = el('div', 'tw'), tb = el('table'), th = el('thead'), hr = el('tr');
        for (const h of ['항목', '개수', '지름', 'PCD', '양 끝 중심 거리(가로)', '양 끝 중심 거리(세로)', '경고']) { const c = el('th', null, h); if (h === '개수' || h === '지름') c.style.textAlign = 'right'; hr.appendChild(c); }
        th.appendChild(hr); tb.appendChild(th);
        const tbd = el('tbody');
        rows.forEach((w, i) => {
          if (w.kind === 'size') { const vh = el('tr', 'vh'); vh.dataset.i = i; const td = el('td', null, w.view); td.colSpan = 7; vh.appendChild(td); tbd.appendChild(vh); }
          const tr = el('tr'); tr.dataset.i = i;
          tr.appendChild(el('td', 'm', w.item)); tr.appendChild(el('td', 'n', w.n)); tr.appendChild(el('td', 'n', w.d)); tr.appendChild(el('td', 'm', w.pcd));
          tr.appendChild(el('td', 'm', w.px)); tr.appendChild(el('td', 'm', w.py)); tr.appendChild(el('td', 'w', w.warn));
          tbd.appendChild(tr);
        });
        tb.appendChild(tbd); tw.appendChild(tb); body.appendChild(tw);
        tbd.addEventListener('click', ev => {
          try {
            const tr = ev.target.closest && ev.target.closest('tr'); if (!tr || tr.dataset.i == null) return;
            const w = rows[+tr.dataset.i]; if (!w) return;
            if (showRow(w)) { tbd.querySelectorAll('tr.on').forEach(x => x.classList.remove('on')); tr.classList.add('on'); }
          } catch (_) { }
        });
        const stamp = drawingName();
        const bc = el('button', 'tbtn', 'CSV 받기');
        bc.onclick = () => { try { offer(`형상치수_${stamp}.csv`, '﻿' + toCSV(r)); } catch (err) { say('CSV 를 만들지 못했습니다: ' + errMsg(err), 'err'); } };
        const ba = el('button', 'tbtn primary', '도면에 치수 붙이기');
        ba.onclick = () => {
          try {
            const a = attach(r);
            if (a.ok || a.added) {
              ba.disabled = true; ba.textContent = `붙였습니다 (${a.added}개)`;
              say(`형상 치수: '${LAYER}' 도면층에 치수 ${a.added}개를 붙였습니다 — 되돌리기(Ctrl+Z) 한 번에 모두 지워집니다`, 'ok');
              if (a.errors && a.errors.length) say('일부 치수를 붙이지 못했습니다: ' + a.errors.slice(0, 3).join(' / '), 'err');
            } else say('치수를 붙이지 못했습니다: ' + (a.error || (a.errors || []).join(' / ')), 'err');
          } catch (err) { say('치수를 붙이지 못했습니다: ' + errMsg(err), 'err'); }
        };
        foot.push(bc, ba);
      }
      const nh = views.reduce((s, v) => s + (Array.isArray(v.holes) ? v.holes.length : 0), 0);
      say(`형상 치수: ${scope} · 뷰 ${views.length}개 · 구멍 묶음 ${nh}개`, 'ok');
    }
    let m;
    try { m = modal(TITLE, [body], foot.length ? foot : null); m.classList.add('geodim'); }
    catch (err) { say('형상 치수 창을 열지 못했습니다: ' + errMsg(err), 'err'); return null; }
    return m;
  }

  /* ---------- 명령 등록 ---------- */
  TOOLS.geodim = () => { try { const ids = sel && sel.size ? [...sel] : null; open(ids); } catch (err) { say('형상 치수: ' + errMsg(err), 'err'); } return null; };
  Object.assign(ALIAS, { GEODIM: 'geodim' });
  if (typeof CMD_KO === 'object') CMD_KO.geodim = '형상 치수';
  if (typeof KO_CMD === 'object') Object.assign(KO_CMD, { 형상치수: 'geodim', 자동치수추출: 'geodim', 형상치수뽑기: 'geodim' });
  window.GEODIM_UI = { open, attach, toCSV, _rows: rowsOf, _cmds: buildCmds };
})();
