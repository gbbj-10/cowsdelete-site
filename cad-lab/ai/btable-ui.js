/* 무카 CAD AI 팀 실험판 — 장비 일람표 창 (5회차 개발2, 2026-11-05)
   window.BTABLE_UI = { open }
   명령: BTABLE · BCOUNT · EQLIST · BLOCKTABLE · 한글 '장비일람표' · '기기목록' · '장비목록' · '블록일람표' · '블록수량표'
   - 계산은 하지 않음: btable-core.js 의 BTABLE.scope / tags / collect / rows / csv / tableCmd 만 부름
   - [도면에 표 넣기](점 클릭 · Enter = 화면 가운데 · Esc = 취소) → runBatch 1번(되돌리기 1번)
   - [CSV 저장] · [엑셀 저장](MUCCABOM 있을 때만) · [복사] · [닫기] · Esc
   - 도면 내용(블록 이름·속성 값·태그)은 모두 textContent 로만 화면에 씀 (HTML 문자열로 넣지 않음).
   - 사용 기록은 BTABLE_OPEN · BTABLE_TABLE · BTABLE_CSV · BTABLE_XLSX 이름만 (도면 내용·태그 이름은 보내지 않음).
   - ALIAS·KO_CMD 는 이미 있는 키를 덮지 않음. '일람표'·'수량표' 단독은 넣지 않음. */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  const TITLE = '장비 일람표';
  const MAX_ROWS = 200;
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const note = m => { try { toast(m); } catch (_) { } try { log(m, 'err'); } catch (_) { } };
  const evt = name => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: name }); } catch (_) { } };
  const fin = x => typeof x === 'number' && isFinite(x);
  const num = x => (fin(+x) ? +x : 0);
  const str = v => (v == null ? '' : String(v));
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  const B = () => (window.BTABLE && typeof window.BTABLE.collect === 'function') ? window.BTABLE : null;
  const missing = () => note('장비 일람표: 계산 모듈을 불러오지 못했습니다 (btable-core.js). 새로고침 뒤 다시 해 주세요.');
  const call = (f, dflt) => { try { const v = f(); return v == null ? dflt : v; } catch (_) { return dflt; } };

  if (!document.getElementById('btableCss')) {
    const st = document.createElement('style'); st.id = 'btableCss';
    st.textContent = `
.modal.btab{background:rgba(5,7,9,.38)}
.modal.btab .sheet{width:min(720px,100%)}
.btab .scope{margin:0 0 6px;color:var(--ink-dim);font-size:12px}
.btab .opt{margin:0 0 6px;font-size:12px;color:var(--ink);display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center}
.btab .opt b{font-weight:600;color:var(--ink-dim);min-width:64px}
.btab .opt label{display:inline-flex;gap:4px;align-items:center;cursor:pointer}
.btab .tags{margin:-2px 0 6px 76px;display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12px}
.btab .tags label{display:inline-flex;gap:4px;align-items:center;cursor:pointer}
.btab .tags .dim,.btab .dim{color:var(--ink-dim)}
.btab .info{margin:0 0 6px;font-size:12px;color:var(--ink-dim);line-height:1.45}
.btab .warn{margin:0 0 6px;padding:5px 8px;border:1px solid var(--tag);border-radius:6px;color:var(--tag);font-size:12px;line-height:1.45}
.btab .empty{margin:10px 0;padding:14px;border:1px dashed var(--rule);border-radius:6px;text-align:center;color:var(--ink-dim);font-size:13px}
.btab .tw{max-height:min(38vh,360px);overflow:auto;border:1px solid var(--rule);border-radius:6px}
.btab table{border-collapse:collapse;width:100%;font-size:12px}
.btab th,.btab td{padding:4px 8px;border-bottom:1px solid var(--rule);text-align:left;white-space:nowrap}
.btab th{position:sticky;top:0;background:var(--chrome-2);color:var(--ink-dim);font-weight:600;z-index:1}
.btab tbody tr{cursor:pointer}
.btab tbody tr:hover,.btab tbody tr:focus{background:var(--chrome-2);outline:none}
.btab td.n{text-align:right;font-family:var(--mono,monospace)}
.btab td.nm{max-width:240px;overflow:hidden;text-overflow:ellipsis}
.btab td.ev{color:var(--ink-dim);font-style:italic}
.btab tfoot td{font-weight:600;border-bottom:0;background:var(--chrome-2)}
.btab .more{padding:4px 8px;color:var(--ink-dim);font-size:12px}`;
    document.head.appendChild(st);
  }

  /* ---------- 결과 읽기 (모양이 조금 달라도 버팀) ---------- */
  const groupsOf = r => (r && Array.isArray(r.groups) ? r.groups.filter(g => g && typeof g === 'object') : []);
  const totalLabel = opt => (opt.nested === 'all' ? '합계(안쪽 포함)' : '합계');
  function skippedText(r) {
    const s = (r && r.skipped && typeof r.skipped === 'object') ? r.skipped : {};
    const parts = [];
    const an = (s.anon && typeof s.anon === 'object') ? s.anon : {};
    const anU = Object.entries(an).filter(([k, n]) => /^\*u/i.test(k) && num(n) > 0).reduce((a, [, n]) => a + num(n), 0);
    const anO = Object.entries(an).filter(([k, n]) => !/^\*u/i.test(k) && num(n) > 0).sort((a, b) => num(b[1]) - num(a[1]));
    if (anU) parts.push(`이름 없는 블록(*U) ${anU}개`);
    if (anO.length) parts.push('익명 ' + anO.map(([k, n]) => `${k} ${num(n)}`).join('·'));
    if (num(s.hidden)) parts.push(`꺼진·얼린 층 ${num(s.hidden)}개(블록 안 포함)`);
    if (num(s.loop)) parts.push(`순환 블록 ${num(s.loop)}개`);
    if (num(s.deep)) parts.push(`6단 넘게 들어간 블록 ${num(s.deep)}개`);
    const L = [];
    if (r && r.partial) L.push('도면이 너무 복잡해 일부만 셌습니다(순환 블록)');
    if (parts.length) L.push('뺀 것: ' + parts.join(' · ') + (anU ? ' — *U 는 동적 블록일 수 있습니다(안에 든 블록은 셌습니다)' : ''));
    if (num(s.missing)) L.push(`블록 정의가 없는 것 ${num(s.missing)}개는 '정의 없음' 표시로 셌습니다`);
    return L;
  }
  /* rows() 를 안전하게 */
  function rowsOf(r, opt) {
    const BT = B(); const x = BT ? call(() => BT.rows(r, opt), null) : null;
    const head = x && Array.isArray(x.head) ? x.head.map(str) : ['No', '블록 이름', ...(opt.by === 'attrs' ? opt.tags : []), '개수'];
    const body = x && Array.isArray(x.body) ? x.body.map(row => (Array.isArray(row) ? row : [])) : [];
    const total = x && fin(+x.total) ? +x.total : num(r && r.total);
    return { head, body, total };
  }
  /* 복사용 글자 (탭 구분, 엑셀에 바로 붙임) */
  function toText(r, opt) {
    const t = rowsOf(r, opt);
    /* CSV(core csvCell)와 같은 수식 막기: 앞 공백·탭·CR 을 뺀 글이 = + - @ 로 시작하면 앞에 ' (순수 음수 '-1'·'-0.5' 와 '-' 한 글자는 그대로) */
    const clean = v => {
      if (typeof v === 'number') return isFinite(v) ? String(v) : '';
      const s = str(v).replace(/[\t\r\n]+/g, ' '), h = s.replace(/^\s+/, '');
      return (/^[=+\-@]/.test(h) && !/^-\d+(\.\d+)?$/.test(h) && h !== '-') ? "'" + s : s;
    };
    const L = [t.head.map(clean).join('\t')];
    t.body.forEach(row => L.push(row.map(clean).join('\t')));
    const last = new Array(Math.max(1, t.head.length)).fill('');
    last[0] = totalLabel(opt); last[last.length - 1] = String(t.total);
    L.push(last.join('\t'));
    return L.join('\r\n');
  }
  function stamp() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  /* ---------- 도면에 표 넣기 ---------- */
  function centerPt() {
    try { if (typeof view === 'object' && fin(view.x) && fin(view.y)) return [view.x, view.y]; } catch (_) { }
    return [0, 0];
  }
  function attach(r, opt, at) {
    const BT = B(); if (!BT) { missing(); return { ok: false }; }
    let p = at;
    if (p && !Array.isArray(p) && fin(p.x) && fin(p.y)) p = [p.x, p.y];
    if (!Array.isArray(p) || !fin(p[0]) || !fin(p[1])) p = centerPt();
    let cmd;
    try { cmd = BT.tableCmd(r, [p[0], p[1]], opt); } catch (_) { cmd = null; }
    if (!cmd || typeof cmd !== 'object') return { ok: false };
    try { return runBatch([cmd], { label: TITLE }); } catch (_) { return { ok: false }; }
  }
  function pickAndAttach(r, opt) {
    const done = p => {
      const a = attach(r, opt, p);
      if (a && a.ok) { say('장비 일람표를 넣었습니다 — 되돌리기 한 번에 지워집니다', 'ok'); evt('BTABLE_TABLE'); }
      else say('장비 일람표를 넣지 못했습니다', 'err');
    };
    try {
      const T = { name: 'btable_put', prompt: '장비 일람표 표의 왼쪽 위 점 클릭 (Enter = 화면 가운데):',
        onPoint(p) { endTool(); done([p.x, p.y]); },
        onEnter() { endTool(); done(centerPt()); } };
      tool = T; setPrompt(T.prompt); try { markRibbon(); } catch (_) { } dirty = true;
      try { cmdIn.focus({ preventScroll: true }); } catch (_) { }
      say('장비 일람표: 표의 왼쪽 위 점을 클릭하세요 (Enter = 화면 가운데, Esc = 취소)', 'ok');
    } catch (_) { done(centerPt()); }
  }

  /* ---------- 줄 누르기 = 그 줄의 맨 위 블록 선택 ---------- */
  function selectIds(ids) {
    if (!Array.isArray(ids) || !ids.length) { say('이 줄에서 고를 블록이 없습니다'); return; }
    try {
      let okIds = ids.map(String);
      if (typeof pickableEnts === 'function') { const pk = new Set(pickableEnts().map(e => e.id)); okIds = okIds.filter(id => pk.has(id)); }
      else if (typeof byId === 'function') okIds = okIds.filter(id => byId(id));
      sel = new Set(okIds); changed();
      say(`블록 ${okIds.length}개를 골랐습니다` + (okIds.length < ids.length ? ` (꺼진·잠긴 층 ${ids.length - okIds.length}개는 고르지 않음)` : ''), 'ok');
    } catch (_) { note('블록을 고르지 못했습니다'); }
  }

  /* ---------- 창 ---------- */
  let cur = null;
  function close() { if (cur) { try { cur.remove(); } catch (_) { } cur = null; } }
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && cur && cur.isConnected) { ev.preventDefault(); ev.stopPropagation(); close(); }
  }, true);

  function radio(name, val, label, checked, onPick) {
    const lb = el('label'), i = el('input'); i.type = 'radio'; i.name = name; i.value = val; i.checked = !!checked;
    i.onchange = () => { if (i.checked) onPick(val); };
    lb.append(i, el('span', null, label)); return lb;
  }
  function check(label, checked, onSet) {
    const lb = el('label'), i = el('input'); i.type = 'checkbox'; i.checked = !!checked;
    i.onchange = () => onSet(i.checked);
    lb.append(i, el('span', null, label)); return lb;
  }

  function open() {
    const BT = B();
    if (!BT) { missing(); return null; }
    const sc = call(() => BT.scope(), null) || {};
    const ents = Array.isArray(sc.ents) ? sc.ents : null;
    const label = str(sc.label) || (sc.sel ? '선택 범위' : '도면 전체');
    const opt = { by: 'name', tags: [], nested: 'outer', hidden: false, anon: false, ids: true, title: TITLE };
    const picked = new Set();      // 고른 태그 (도면 내용 — 화면에만, 기록 안 함)
    let r = null, tagList = [];
    const run = () => {
      opt.tags = opt.by === 'attrs' ? tagList.map(t => t.tag).filter(t => picked.has(t)) : [];
      try { r = BT.collect(ents, Object.assign({}, opt)); } catch (_) { r = null; }
      if (!r || typeof r !== 'object') r = { ok: false, groups: [], total: 0, skipped: {} };
    };
    const loadTags = () => {
      const t = call(() => BT.tags(ents, { nested: opt.nested, hidden: opt.hidden, anon: opt.anon }), []);
      tagList = (Array.isArray(t) ? t : []).filter(x => x && x.tag != null).map(x => ({ tag: str(x.tag), n: num(x.n) }));
      for (const k of [...picked]) if (!tagList.some(t => t.tag === k)) picked.delete(k);
    };
    loadTags(); run();
    evt('BTABLE_OPEN');

    close();
    const body = el('div', 'btabBody');
    const bPut = el('button', 'tbtn primary', '도면에 표 넣기');
    const bCsv = el('button', 'tbtn', 'CSV 저장');
    const hasX = !!(window.MUCCABOM && MUCCABOM._t && typeof MUCCABOM._t.xlsx === 'function');
    const bX = hasX ? el('button', 'tbtn', '엑셀 저장') : null;
    const bCopy = el('button', 'tbtn', '복사');
    const bClose = el('button', 'tbtn', '닫기');

    function paint() {
      body.textContent = '';
      body.appendChild(el('p', 'scope', '범위: ' + label));

      /* 묶는 기준 */
      const o1 = el('div', 'opt'); o1.appendChild(el('b', null, '묶는 기준'));
      o1.appendChild(radio('btabBy', 'name', '블록 이름', opt.by === 'name', v => { opt.by = v; run(); paint(); }));
      o1.appendChild(radio('btabBy', 'attrs', '블록 이름 + 속성', opt.by === 'attrs', v => { opt.by = v; run(); paint(); }));
      body.appendChild(o1);
      if (opt.by === 'attrs') {
        const tg = el('div', 'tags');
        if (!tagList.length) tg.appendChild(el('span', 'dim', '이 범위의 블록에는 속성이 없습니다'));
        else {
          tagList.forEach(t => tg.appendChild(check(`${t.tag} (${t.n})`, picked.has(t.tag), on => { if (on) picked.add(t.tag); else picked.delete(t.tag); run(); paint(); })));
          if (!picked.size) tg.appendChild(el('span', 'dim', '— 나눌 속성을 고르세요'));
        }
        body.appendChild(tg);
      }
      /* 중첩 */
      const o2 = el('div', 'opt'); o2.appendChild(el('b', null, '중첩 블록'));
      const reN = v => { opt.nested = v; loadTags(); run(); paint(); };
      o2.appendChild(radio('btabNest', 'outer', '바깥 블록만', opt.nested === 'outer', reN));
      o2.appendChild(radio('btabNest', 'all', '안쪽 블록까지', opt.nested === 'all', reN));
      body.appendChild(o2);
      /* 체크 */
      const o3 = el('div', 'opt'); o3.appendChild(el('b', null, '더 세기'));
      o3.appendChild(check('꺼진·얼린 층도 세기', opt.hidden, on => { opt.hidden = on; loadTags(); run(); paint(); }));
      o3.appendChild(check('이름 없는 블록(*U) 줄로 보기', opt.anon, on => { opt.anon = on; loadTags(); run(); paint(); }));
      body.appendChild(o3);

      body.appendChild(el('p', 'info', '개수 = 도면에 놓인 횟수입니다 (QTY 같은 수량 속성의 합이 아닙니다)'));

      const gs = groupsOf(r);
      if (r.ok === false && r.error) body.appendChild(el('p', 'warn', '블록을 세지 못했습니다: ' + str(r.error)));
      skippedText(r).forEach(t => body.appendChild(el('p', 'warn', t)));

      const empty = !gs.length;
      if (empty) {
        body.appendChild(el('div', 'empty', '블록이 없습니다' + (sc.sel ? ' (선택한 것 안에 블록이 없습니다 — 선택을 풀면 도면 전체를 셉니다)' : '')));
      } else {
        const tags = opt.by === 'attrs' ? opt.tags : [];
        const tw = el('div', 'tw'), tb = el('table'), th = el('thead'), hr = el('tr');
        const headCols = ['No', '블록 이름', ...tags, '개수'];
        if (opt.nested === 'all') headCols.push('맨 위 · 안쪽');
        headCols.forEach(t => hr.appendChild(el('th', null, t)));
        th.appendChild(hr); tb.appendChild(th);
        const bd = el('tbody');
        gs.slice(0, MAX_ROWS).forEach((g, i) => {
          const tr = el('tr'); tr.tabIndex = 0;
          tr.appendChild(el('td', 'n', i + 1));
          tr.appendChild(el('td', 'nm', str(g.name) + (g.missing ? ' (정의 없음)' : '')));
          const vals = (g.vals && typeof g.vals === 'object') ? g.vals : {};
          tags.forEach(t => { const v = str(vals[t]); tr.appendChild(v === '' ? el('td', 'nm ev', '(빈 값)') : el('td', 'nm', v)); });
          tr.appendChild(el('td', 'n', num(g.count)));
          if (opt.nested === 'all') tr.appendChild(el('td', 'n dim', `${num(g.top)} · ${num(g.nested)}`));
          const pick = () => selectIds(Array.isArray(g.ids) ? g.ids : []);
          tr.onclick = pick; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(); } };
          bd.appendChild(tr);
        });
        tb.appendChild(bd);
        const tf = el('tfoot'), fr = el('tr');
        const lead = el('td', null, totalLabel(opt)); lead.colSpan = 2 + tags.length; fr.appendChild(lead);
        fr.appendChild(el('td', 'n', num(r.total)));
        if (opt.nested === 'all') fr.appendChild(el('td', 'n dim', ''));
        tf.appendChild(fr); tb.appendChild(tf);
        tw.appendChild(tb);
        if (gs.length > MAX_ROWS) tw.appendChild(el('div', 'more', `외 ${gs.length - MAX_ROWS}줄 (표 넣기·CSV·엑셀에는 모두 들어감)`));
        body.appendChild(tw);
        body.appendChild(el('p', 'info', `${gs.length}줄 · 맨 위 블록 ${num(r.topInserts)}개` +
          ' · 줄을 누르면 그 블록을 고릅니다' + (opt.nested === 'all' ? ' (안쪽 블록은 품은 바깥 블록을 고릅니다)' : '')));
      }
      bPut.disabled = empty; bCsv.disabled = empty; bCopy.disabled = empty; if (bX) bX.disabled = empty;
    }
    paint();

    bPut.onclick = () => {
      if (!groupsOf(r).length) return;
      const rr = r, oo = Object.assign({}, opt);
      if (groupsOf(rr).length > MAX_ROWS) say(`장비 일람표: ${groupsOf(rr).length}줄짜리 긴 표입니다`, 'err');
      close(); pickAndAttach(rr, oo);
    };
    bCsv.onclick = () => {
      const BT2 = B(); if (!BT2) { missing(); return; }
      let s; try { s = BT2.csv(r, Object.assign({}, opt)); } catch (_) { s = null; }
      if (typeof s !== 'string') { note('CSV 를 만들지 못했습니다'); return; }
      try { offer(`장비일람표_${stamp()}.csv`, s); evt('BTABLE_CSV'); }
      catch (_) { note('CSV 를 저장하지 못했습니다'); }
    };
    if (bX) bX.onclick = () => {
      const t = rowsOf(r, opt);
      try {
        const data = MUCCABOM._t.xlsx([{ name: TITLE, head: t.head, body: t.body }]);
        offer(`장비일람표_${stamp()}.xlsx`, data instanceof Blob ? data : new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        evt('BTABLE_XLSX');
      } catch (_) { note('엑셀 파일을 만들지 못했습니다'); }
    };
    bCopy.onclick = async () => {
      const t = toText(r, opt);
      try { await navigator.clipboard.writeText(t); bCopy.textContent = '복사됨'; }
      catch (_) {
        try { const ta = el('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select();
          const okc = document.execCommand('copy'); ta.remove(); if (!okc) throw 0; bCopy.textContent = '복사됨'; }
        catch (__) { try { openText(TITLE, '아래 내용을 복사해 엑셀에 붙여 넣으세요.', t); } catch (___) { bCopy.textContent = '복사 못 함'; } }
      }
    };
    bClose.onclick = () => close();
    const foot = [bPut, bCsv]; if (bX) foot.push(bX); foot.push(bCopy, bClose);

    let m;
    try { m = modal(TITLE, [body], foot); m.classList.add('btab'); }
    catch (_) { note('장비 일람표 창을 열지 못했습니다'); return null; }
    cur = m;
    return m;
  }

  /* ---------- 명령 등록 ---------- */
  TOOLS.btable = () => { try { open(); } catch (_) { note('장비 일람표 창을 열지 못했습니다'); } return null; };
  for (const k of ['BTABLE', 'BCOUNT', 'EQLIST', 'BLOCKTABLE']) if (!(k in ALIAS)) ALIAS[k] = 'btable';
  if (typeof CMD_KO === 'object' && CMD_KO) CMD_KO.btable = TITLE;
  if (typeof KO_CMD === 'object' && KO_CMD) for (const k of ['장비일람표', '기기목록', '장비목록', '블록일람표', '블록수량표']) if (!(k in KO_CMD)) KO_CMD[k] = 'btable';
  window.BTABLE_UI = { open };
})();
