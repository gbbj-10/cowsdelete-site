/* 무카 CAD AI 팀 실험판 — 총길이 창 (4회차 개발2, 2026-11-04)
   window.TLEN_UI = { open, toText, attach }
   명령: TLEN · TOTALLENGTH · 한글 '총길이' · '길이합계' · '전체길이' · '총연장' · '배관길이' ('총 길이' 띄어쓰기도 같음)
   - 계산은 하지 않음: tlen-core.js 의 TLEN.scope() / TLEN.measure(ents,{blocks}) 만 부름
   - 선택이 있으면 그것만, 없으면 도면 전체(보이는 도면층)
   - [복사] · [도면에 글자 넣기](점 클릭, Enter = 화면 가운데) → attach: runBatch 1번(되돌리기 1번) · [닫기] · Esc
   - 사용 기록은 'TLEN_OPEN' 이름만(값·도면층 이름은 보내지 않음). 화면 글자는 모두 textContent.
   - LEN·길이(lengthen·dist)는 덮어쓰지 않음. */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  const TITLE = '총길이 (선 길이 합계)';
  const MAX_ROWS = 30;
  const TYPE_KO = { line: '선', arc: '호', circle: '원', polyline: '폴리선', spline: '스플라인', ellipse: '타원', insert: '블록', xline: '무한선', ray: '광선',
    hatch: '해치', dim: '치수', table: '표', text: '글자', mtext: '글자', attdef: '속성', point: '점', node: '점', solid: '솔리드', image: '이미지' };
  const tk = t => TYPE_KO[t] || String(t == null ? '?' : t);
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const note = m => { try { toast(m); } catch (_) { } try { log(m, 'err'); } catch (_) { } };
  const fin = x => typeof x === 'number' && isFinite(x);
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  /* fmt(소수 2자리) + 천 단위 쉼표 */
  const f = v => {
    if (!fin(+v)) return '-';
    let s; try { s = fmt(+v); } catch (_) { s = String(Math.round(+v * 100) / 100); }
    const neg = s[0] === '-'; if (neg) s = s.slice(1);
    const i = s.indexOf('.'), a = i < 0 ? s : s.slice(0, i), b = i < 0 ? '' : s.slice(i);
    return (neg ? '-' : '') + a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + b;
  };
  const ok = () => !!(window.TLEN && typeof window.TLEN.measure === 'function');
  const missing = () => note('총길이 계산 모듈(tlen-core.js)을 불러오지 못했습니다. 새로고침 뒤 다시 해 주세요.');

  if (!document.getElementById('tlenCss')) {
    const st = document.createElement('style'); st.id = 'tlenCss';
    st.textContent = `
.modal.tlen{background:rgba(5,7,9,.38)}
.modal.tlen .sheet{width:min(620px,100%)}
.tlen .scope{margin:0 0 6px;color:var(--ink-dim);font-size:12px}
.tlen .big{margin:0;font:600 26px/1.25 var(--mono,monospace);color:var(--ink)}
.tlen .sub{margin:2px 0 8px;color:var(--ink-dim);font-size:12px}
.tlen .warn{margin:0 0 6px;padding:5px 8px;border:1px solid var(--tag);border-radius:6px;color:var(--tag);font-size:12px;line-height:1.45}
.tlen .line{margin:0 0 6px;font-size:12px;color:var(--ink);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center}
.tlen .line label{display:inline-flex;gap:4px;align-items:center;cursor:pointer;color:var(--ink-dim)}
.tlen h4{margin:10px 0 4px;font-size:12px;color:var(--ink-dim);font-weight:600}
.tlen .tw{max-height:min(32vh,300px);overflow:auto;border:1px solid var(--rule);border-radius:6px}
.tlen table{border-collapse:collapse;width:100%;font-size:12px}
.tlen th,.tlen td{padding:4px 8px;border-bottom:1px solid var(--rule);text-align:left;white-space:nowrap}
.tlen th{position:sticky;top:0;background:var(--chrome-2);color:var(--ink-dim);font-weight:600;z-index:1}
.tlen td.n{text-align:right;font-family:var(--mono,monospace)}
.tlen td.nm{max-width:260px;overflow:hidden;text-overflow:ellipsis}
.tlen .more{padding:4px 8px;color:var(--ink-dim);font-size:12px}`;
    document.head.appendChild(st);
  }

  /* ---------- 결과 읽기(약속 모양이 조금 달라도 버팀) ---------- */
  const skipN = r => { const s = r && r.skipped; return fin(s) ? s : (s && fin(s.n) ? s.n : 0); };
  const skipBy = r => { const s = r && r.skipped; return (s && typeof s === 'object' && s.byType && typeof s.byType === 'object') ? s.byType : {}; };
  const skipTxt = r => Object.entries(skipBy(r)).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${tk(t)} ${n}`).join(' · ');
  const meters = v => f(+v / 1000);

  /* ---------- 복사용 글자 ---------- */
  function toText(r, scopeLabel) {
    if (!r) return '';
    const L = [];
    if (scopeLabel) L.push('범위: ' + scopeLabel);
    L.push(`총길이 = ${f(r.total)}${r.approx ? ' (근사 포함)' : ''}  (mm 라면 = ${meters(r.total)} m)`);
    L.push(`잰 것 ${fin(r.count) ? r.count : 0}개` + (r.blockParts ? ` (블록 안 조각 ${r.blockParts}개 포함)` : ''));
    const sn = skipN(r); if (sn) L.push(`못 잰 것 ${sn}개` + (skipTxt(r) ? ` (${skipTxt(r)})` : ''));
    const bl = Array.isArray(r.byLayer) ? r.byLayer : [];
    if (bl.length) { L.push('', '[도면층별]', '도면층\t길이\t개수'); bl.forEach(w => L.push(`${w.layer == null ? '' : w.layer}\t${f(w.len)}\t${w.n}`)); }
    const bt = Array.isArray(r.byType) ? r.byType : [];
    if (bt.length) { L.push('', '[종류별]', '종류\t길이\t개수'); bt.forEach(w => L.push(`${tk(w.type)}\t${f(w.len)}\t${w.n}`)); }
    return L.join('\n');
  }

  /* ---------- 도면에 글자 넣기 ---------- */
  function centerPt() {
    try { if (typeof view === 'object' && fin(view.x) && fin(view.y)) return [view.x, view.y]; } catch (_) { }
    return [0, 0];
  }
  function attach(r, at) {
    if (!r || !fin(+r.total)) return { ok: false, error: '결과가 없습니다' };
    let p = at;
    if (p && !Array.isArray(p) && fin(p.x) && fin(p.y)) p = [p.x, p.y];
    if (!Array.isArray(p) || !fin(p[0]) || !fin(p[1])) p = centerPt();
    const h = 3.5 * ((typeof doc === 'object' && doc && +doc.dimScale) || 1);
    const text = '총길이 = ' + f(r.total) + (r.approx ? ' (근사)' : '');
    return runBatch([{ cmd: 'text', at: [p[0], p[1]], text, h }], { label: '총길이' });
  }
  /* 점 하나 받기: 클릭 또는 좌표 입력, Enter = 화면 가운데, Esc = 취소 */
  function pickAndAttach(r) {
    try {
      const done = p => {
        const a = attach(r, p);
        if (a && a.ok) say('총길이 글자를 넣었습니다 — 되돌리기(Ctrl+Z) 한 번에 지워집니다', 'ok');
        else say('글자를 넣지 못했습니다', 'err');
      };
      const T = { name: 'tlen_put', prompt: '총길이 글자 넣을 점 클릭 (Enter = 화면 가운데):',
        onPoint(p) { endTool(); done([p.x, p.y]); },
        onEnter() { endTool(); done(centerPt()); } };
      tool = T; setPrompt(T.prompt); try { markRibbon(); } catch (_) { } dirty = true;
      try { cmdIn.focus({ preventScroll: true }); } catch (_) { }
      say('총길이: 글자 넣을 점을 클릭하세요 (Enter = 화면 가운데, Esc = 취소)', 'ok');
    } catch (_) { const a = attach(r); if (a && a.ok) say('총길이 글자를 화면 가운데에 넣었습니다 — 되돌리기(Ctrl+Z) 한 번', 'ok'); }
  }

  /* ---------- 표 ---------- */
  function table(head, rows, more) {
    const tw = el('div', 'tw'), tb = el('table'), th = el('thead'), hr = el('tr');
    head.forEach(t => hr.appendChild(el('th', null, t))); th.appendChild(hr); tb.appendChild(th);
    const bd = el('tbody');
    rows.forEach(c => { const tr = el('tr'); tr.appendChild(el('td', 'nm', c[0])); tr.appendChild(el('td', 'n', c[1])); tr.appendChild(el('td', 'n', c[2])); bd.appendChild(tr); });
    tb.appendChild(bd); tw.appendChild(tb);
    if (more) tw.appendChild(el('div', 'more', more));
    return tw;
  }

  /* ---------- 창 ---------- */
  let cur = null;
  function close() { if (cur) { try { cur.remove(); } catch (_) { } cur = null; } }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && cur && cur.isConnected) { close(); } }, true);

  function open(result, scopeLabel) {
    if (!ok()) { missing(); return null; }
    let ents = null, label = scopeLabel || '';
    let blocks = true;
    const run = () => TLEN.measure(ents || [], { blocks });
    let r = result;
    try {
      if (!r || !ents) {
        const sc = typeof TLEN.scope === 'function' ? TLEN.scope() : null;
        if (sc) { ents = Array.isArray(sc.ents) ? sc.ents : []; if (!label) label = String(sc.label || ''); }
      }
      if (!r) r = run();
    } catch (_) { note('총길이를 재지 못했습니다'); return null; }
    if (!r) { note('총길이를 재지 못했습니다'); return null; }
    try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'TLEN_OPEN' }); } catch (_) { }

    close();
    const body = el('div', 'tlenBody');
    const foot = [];
    const bCopy = el('button', 'tbtn', '복사');
    const bPut = el('button', 'tbtn primary', '도면에 글자 넣기');
    const bX = el('button', 'tbtn', '닫기');

    function paint() {
      body.textContent = '';
      body.appendChild(el('p', 'scope', label || ''));
      body.appendChild(el('p', 'big', '총길이 ' + f(r.total)));
      body.appendChild(el('p', 'sub', `mm 라면 = ${meters(r.total)} m · 도면 단위 그대로 · 잰 것 ${fin(r.count) ? r.count : 0}개`));
      if (r.approx) body.appendChild(el('p', 'warn', '근사 포함 — 스플라인·타원(또는 비율이 다른 블록 안 원·호)은 촘촘한 꺾은선으로 잰 값입니다'));
      if (r.blockParts || !blocks) {
        const ln = el('div', 'line');
        ln.appendChild(el('span', null, blocks ? `블록 안 조각 ${r.blockParts}개 포함` : '블록 안은 빼고 잼'));
        const lb = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !blocks;
        cb.onchange = () => { blocks = !cb.checked; try { r = run(); } catch (_) { note('총길이를 다시 재지 못했습니다'); } paint(); };
        lb.appendChild(cb); lb.appendChild(el('span', null, '블록 안 빼기')); ln.appendChild(lb);
        body.appendChild(ln);
      }
      const sn = skipN(r);
      if (sn) body.appendChild(el('p', 'line', `못 잰 것 ${sn}개` + (skipTxt(r) ? ` (${skipTxt(r)})` : '') + ' — 무한선·해치·치수·글자 등은 합계에서 뺍니다'));
      const bl = Array.isArray(r.byLayer) ? r.byLayer : [];
      if (bl.length) {
        body.appendChild(el('h4', null, '도면층별'));
        body.appendChild(table(['도면층', '길이', '개수'], bl.slice(0, MAX_ROWS).map(w => [w.layer == null ? '' : w.layer, f(w.len), w.n]),
          bl.length > MAX_ROWS ? `그 밖 ${bl.length - MAX_ROWS}개 층 (복사하면 모두 들어감)` : ''));
      }
      const bt = Array.isArray(r.byType) ? r.byType : [];
      if (bt.length) {
        body.appendChild(el('h4', null, '종류별'));
        body.appendChild(table(['종류', '길이', '개수'], bt.map(w => [tk(w.type), f(w.len), w.n])));
      }
      if (!bl.length && !bt.length) body.appendChild(el('p', 'sub', '잴 수 있는 선·호·원·폴리선이 없습니다'));
      bPut.disabled = !(fin(r.count) && r.count > 0);
    }
    paint();

    bCopy.onclick = async () => {
      const t = toText(r, label);
      try { await navigator.clipboard.writeText(t); bCopy.textContent = '복사됨'; }
      catch (_) {
        try { const ta = el('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); bCopy.textContent = '복사됨'; }
        catch (__) { bCopy.textContent = '복사 못 함'; }
      }
    };
    bPut.onclick = () => { const rr = r; close(); pickAndAttach(rr); };
    bX.onclick = () => close();
    foot.push(bCopy, bPut, bX);

    let m;
    try { m = modal(TITLE, [body], foot); m.classList.add('tlen'); }
    catch (_) { note('총길이 창을 열지 못했습니다'); return null; }
    cur = m;
    const sh = m.querySelector('.sheet'); if (sh && !sh.getAttribute('role')) sh.setAttribute('role', 'dialog');
    say(`총길이: ${label} · 합계 ${f(r.total)}${r.approx ? ' (근사 포함)' : ''}`, 'ok');
    return m;
  }

  /* ---------- 명령 등록 ---------- */
  TOOLS.tlen = () => { try { open(); } catch (_) { note('총길이 창을 열지 못했습니다'); } return null; };
  Object.assign(ALIAS, { TLEN: 'tlen', TOTALLENGTH: 'tlen' });
  if (typeof CMD_KO === 'object') CMD_KO.tlen = '선 길이 합계';
  if (typeof KO_CMD === 'object') Object.assign(KO_CMD, { 총길이: 'tlen', 길이합계: 'tlen', 전체길이: 'tlen', 총연장: 'tlen', 배관길이: 'tlen', 선길이합계: 'tlen' });
  window.TLEN_UI = { open, toText, attach };
})();
