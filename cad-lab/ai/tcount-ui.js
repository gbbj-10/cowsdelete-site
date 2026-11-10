/* 무카 CAD AI 팀 실험판 — 번호 자동 매기기 화면 (9회차 개발2, 2026-11-10)
   명령: TCOUNT · TCN · 한글 '번호매기기' · '번호넣기' (TC·TN 은 안 씀, COUNT(개수 세기)는 그대로)
   - 계산은 하지 않음: tcount-core.js 의 TCOUNT.pickTexts / order / plan 과 COMMANDS.tcount 만 부름
   - 질문 순서: 문자 선택 → 순서 Y/X/S → 시작 번호,증가 → 넣는 방법 O/P/U/F → 미리보기(원래 → 바뀔 글자) 확인
   - 적용: runBatch([{cmd:'tcount',ids,by,start,step,mode,expect}],{label:'번호 매기기'}) 1번 = 되돌리기 1번
     R.ok 가 false 면 undoStack.pop() 으로 빈 되돌리기 칸을 없애고 실패만 안내(성공 안내 안 함)
   - 빠진 것은 종류별 개수로 안내(다른 객체·잠긴 층·꺼진 층·블록·속성·표·치수)
   - 화면 글자는 모두 textContent, 사용 기록은 'TCOUNT' 이름만
   - TOOLS·ALIAS·KO_CMD·CMD_KO 키는 없을 때만 넣음. 단축키 저장 샘은 bound-ui.js 의 diffShortcuts 감싸기가
     "TOOLS 에 있고 본체 기본값에 없는 도구"를 자동으로 빼므로 여기서 따로 감싸지 않음 */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  if (window.TCOUNT_UI) return; // 두 번 불려도 render 를 두 번 감싸지 않게
  const LABEL = '번호 매기기';
  const MAX_ROWS = 200;      // 미리보기 표에 보여 줄 줄 수 (나머지는 개수만)
  const MAX_DRAW = 3000;     // 도면 위 미리보기 글자 수 상한 (큰 도면 속도)
  const fin = x => typeof x === 'number' && isFinite(x);
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const note = m => { try { toast(m); } catch (_) { } try { log(m, 'err'); } catch (_) { } };
  const evt = name => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: name }); } catch (_) { } };
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  const M = () => (window.TCOUNT && typeof window.TCOUNT.plan === 'function' && typeof window.TCOUNT.pickTexts === 'function' && typeof window.TCOUNT.order === 'function') ? window.TCOUNT : null;
  const hasCmd = () => { try { return typeof COMMANDS === 'object' && typeof COMMANDS.tcount === 'function'; } catch (_) { return false; } };
  const errMsg = e => String((e && e.message) || e || '').replace(/^#\d+ \w+: /, '').slice(0, 160);

  const BY = { Y: 'y', X: 'x', S: 'sel' };
  const BY_KO = { y: '위→아래', x: '왼→오른', sel: '고른 순서' };
  const MODE_KO = { O: '바꾸기', P: '앞에 붙이기', U: '뒤에 붙이기', F: '# 자리 바꾸기' };
  const SKIP_KO = [['other', '다른 객체'], ['locked', '잠긴 층 문자'], ['off', '꺼진·얼린 층 문자'], ['block', '블록 안·블록'], ['attr', '속성 블록'], ['table', '표'], ['dim', '치수·벌룬']];
  function skipText(sk) {
    if (!sk || typeof sk !== 'object') return '';
    const parts = [];
    for (const [k, ko] of SKIP_KO) { const n = +sk[k] || 0; if (n > 0) parts.push(`${ko} ${n}`); }
    for (const k of Object.keys(sk)) if (!SKIP_KO.some(x => x[0] === k)) { const n = +sk[k] || 0; if (n > 0) parts.push(`기타 ${n}`); }
    return parts.length ? '뺀 것: ' + parts.join(' · ') + ' (속성·표 칸·치수 글자는 바꾸지 않음)' : '';
  }

  /* ---------- 모양 ---------- */
  if (!document.getElementById('tcountCss')) {
    const st = document.createElement('style'); st.id = 'tcountCss';
    st.textContent = `
.tcnp{position:absolute;left:10px;top:10px;z-index:4;width:min(420px,calc(100% - 20px));max-height:calc(100% - 20px);overflow:auto;background:var(--chrome,#191d23);color:var(--ink,#dfe4ea);border:1px solid var(--rule,#2c333d);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.45;box-shadow:0 6px 22px rgba(0,0,0,.4)}
.tcnp h4{margin:0 0 4px;font-size:12px;font-weight:600}
.tcnp .dim{color:var(--ink-dim,#8b95a3)}
.tcnp .sum{margin:2px 0;font-family:var(--mono,monospace)}
.tcnp .warn{margin:4px 0 0;padding:4px 7px;border:1px solid var(--tag,#f1c232);border-radius:6px;color:var(--tag,#f1c232)}
.tcnp .fail{margin:4px 0 0;padding:5px 7px;border:1px solid #ff6b6b;border-radius:6px;color:#ff9d9d}
.tcnp table{width:100%;border-collapse:collapse;margin-top:4px;font-family:var(--mono,monospace)}
.tcnp td,.tcnp th{padding:1px 4px;border-bottom:1px solid var(--rule,#2c333d);text-align:left;vertical-align:top;word-break:break-all}
.tcnp th{color:var(--ink-dim,#8b95a3);font-weight:500}
.tcnp td.n{color:var(--ink-dim,#8b95a3);width:2.5em}
.tcnp td.a{color:var(--tag,#f1c232)}
.tcnp .btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}`;
    document.head.appendChild(st);
  }

  /* ---------- 상태 ---------- */
  let T = null, panel = null;
  const refocus = () => { try { cmdIn.focus({ preventScroll: true }); } catch (_) { } };
  const redraw = () => { try { dirty = true; } catch (_) { } };
  function closePanel() { if (panel) { try { panel.remove(); } catch (_) { } panel = null; } }

  /* 지금 글자 상태를 expect 로 찍어 둠 (적용 때 core 가 비교 — 낡은 미리보기로 고치지 않게) */
  function snapExpect(texts) {
    const ex = {};
    for (const e of texts) ex[e.id] = { s: e.s, p: { x: e.p && e.p.x, y: e.p && e.p.y }, layer: e.layer };
    return ex;
  }

  /* 시작·증가 입력 나누기: "10,5" / "001" / "0.5,0.1" / "" → 기본값. 숫자 검사는 core(plan) 가 함 */
  function parseNum(s) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return { start: T.start, step: T.step_ };
    const a = t.split(/\s*[,，]\s*/);
    if (a.length > 2 || !a[0]) return null;
    const step = a.length === 2 ? (a[1] === '' ? T.step_ : Number(a[1])) : T.step_;
    return { start: a[0], step };
  }

  function buildPlan(mode) {
    const C = M(); if (!C) throw new Error('번호 매기기 모듈(tcount-core.js)이 아직 없습니다');
    const ordered = C.order(T.texts, T.by);
    const p = C.plan(ordered, { start: T.start, step: T.step_, mode: mode || T.mode, sep: '-' });
    if (!p || !Array.isArray(p.rows)) throw new Error('계획 결과 모양이 다름');
    return p;
  }

  /* ---------- 창(화면 위 작은 판) ---------- */
  function paint() {
    if (!T) { closePanel(); return; }
    const host = document.getElementById('view') || document.body;
    if (!panel || !panel.isConnected) { panel = el('div', 'tcnp'); panel.setAttribute('role', 'status'); host.appendChild(panel); }
    panel.textContent = '';
    panel.appendChild(el('h4', null, '번호 매기기 (TCOUNT)'));
    if (T.step === 'sel') { panel.appendChild(el('div', 'dim', '번호 붙일 문자(한 줄·여러 줄)를 고르고 Enter · Esc 취소')); return; }
    panel.appendChild(el('div', 'sum', `문자 ${T.texts.length}개` + (T.nOther ? ` (${T.nOther}개 뺌)` : '')));
    const sk = skipText(T.skipped); if (sk) panel.appendChild(el('div', 'dim', sk));
    if (T.rot) panel.appendChild(el('div', 'dim', `회전 글자 ${T.rot}개 포함 — 순서는 넣는 점 기준(세로로 쓴 열은 X 순서 권장)`));
    const opts = [`순서 ${BY_KO[T.by]}`];
    if (T.step === 'mode' || T.step === 'ok') opts.push(`시작 ${T.start} · 증가 ${T.step_}`);
    if (T.step === 'ok') opts.push(MODE_KO[T.mode]);
    panel.appendChild(el('div', 'dim', opts.join(' · ')));
    if (T.by === 'sel') panel.appendChild(el('div', 'dim', '고른 순서 = 하나씩 클릭한 순서 (창으로 고르면 도면에 그려진 순서)'));
    if (T.fail) panel.appendChild(el('div', 'fail', T.fail));
    if (T.step === 'ok' && T.plan) {
      const p = T.plan;
      panel.appendChild(el('div', 'sum', `미리보기: 번호 ${p.rows.length}개 (${p.first == null ? '-' : p.first} → ${p.last == null ? '-' : p.last})`));
      if (p.unchanged && p.unchanged.length) panel.appendChild(el('div', 'warn', `# 없는 글자 ${p.unchanged.length}개는 그대로 둠 (번호를 쓰지 않음)`));
      const tb = el('table'), hr = el('tr');
      hr.append(el('th', null, '#'), el('th', null, '원래'), el('th', null, '바뀔 글자')); tb.appendChild(hr);
      p.rows.slice(0, MAX_ROWS).forEach((r, i) => { const tr = el('tr'); tr.append(el('td', 'n', i + 1), el('td', null, r.before), el('td', 'a', r.after)); tb.appendChild(tr); });
      panel.appendChild(tb);
      if (p.rows.length > MAX_ROWS) panel.appendChild(el('div', 'dim', `… 외 ${p.rows.length - MAX_ROWS}개`));
      const btns = el('div', 'btns');
      const bOk = el('button', 'tbtn primary', '적용 (Enter)'); bOk.disabled = !p.rows.length;
      bOk.onclick = () => { if (T) apply(); try { setPrompt(tool ? tool.prompt : '명령:'); } catch (_) { } refocus(); };
      const bB = el('button', 'tbtn', '뒤로 (B)');
      bB.onclick = () => { if (T) { T.step = 'mode'; T.plan = null; T.fail = null; paint(); redraw(); } try { setPrompt(tool ? tool.prompt : '명령:'); } catch (_) { } refocus(); };
      const bX = el('button', 'tbtn', '취소 (Esc)');
      bX.onclick = () => { try { log('*취소*'); endTool(); } catch (_) { } refocus(); };
      btns.append(bOk, bB, bX); panel.appendChild(btns);
    }
  }

  /* ---------- 도면 위 미리보기 (render 를 한 번만 감쌈 — 도면 객체 아님) ---------- */
  try {
    const _rTcn = render;
    render = function () {
      _rTcn.apply(this, arguments);
      if (T && tool !== T) { T = null; closePanel(); }
      if (!T || T.step !== 'ok' || !T.plan) return;
      try {
        const c = ctx2; c.save(); c.setTransform(DPR, 0, 0, DPR, 0, 0);
        c.font = '600 12px system-ui,sans-serif'; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.lineWidth = 3;
        const rows = T.plan.rows, n = Math.min(rows.length, MAX_DRAW);
        for (let i = 0; i < n; i++) {
          const e = byId(rows[i].id); if (!e || !e.p) continue;
          const s = S(e.p), txt = String(rows[i].after).slice(0, 40);
          if (s.x < -50 || s.y < -20 || s.x > W + 50 || s.y > H + 40) continue;
          c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(txt, s.x, s.y - 2); c.fillStyle = '#f1c232'; c.fillText(txt, s.x, s.y - 2);
        }
        c.restore();
      } catch (_) { }
    };
  } catch (_) { }

  /* ---------- 단계 ---------- */
  function afterPick() {
    const C = M();
    if (!C) { note('번호 매기기 모듈(tcount-core.js)이 아직 없습니다. 새로고침 뒤 다시 해 주세요.'); endTool(); return false; }
    const ids = [...sel];
    let r;
    try { r = C.pickTexts(ids); } catch (e) { note('문자를 고르지 못했습니다 — ' + errMsg(e)); endTool(); return false; }
    const texts = r && Array.isArray(r.texts) ? r.texts : [];
    T.ids = ids; T.texts = texts; T.skipped = (r && r.skipped) || {};
    T.nOther = Math.max(0, ids.length - texts.length);
    T.rot = texts.filter(e => fin(+e.rot) && Math.abs(+e.rot) > 1e-9).length;
    const sk = skipText(T.skipped);
    if (!texts.length) {
      note('번호 붙일 문자가 없습니다' + (sk ? ' — ' + sk : '') + ' · 한 줄 문자·여러 줄 문자를 고르세요');
      endTool(); return false;
    }
    say(`번호 매기기: 문자 ${texts.length}개` + (T.nOther ? ` (${T.nOther}개 뺌)` : '') + (sk ? ' · ' + sk : ''), 'ok');
    T.step = 'by'; T.fail = null;
    paint(); return true;
  }

  function toPreview() {
    let p;
    try { p = buildPlan(); } catch (e) { T.fail = '미리보기를 만들지 못했습니다 — ' + errMsg(e); T.step = 'mode'; note(T.fail); paint(); return; }
    T.plan = p; T.expect = snapExpect(T.texts); T.fail = null; T.step = 'ok';
    say(`미리보기: 번호 ${p.rows.length}개 (${p.first} → ${p.last})` + (p.unchanged && p.unchanged.length ? ` · # 없는 글자 ${p.unchanged.length}개 그대로` : '') + ' — Enter 적용 · B 뒤로 · Esc 취소');
    if (!p.rows.length) note('바꿀 글자가 없습니다 (# 자리 바꾸기인데 # 이 든 글자가 없음) — B 로 넣는 방법을 바꾸세요');
    paint(); redraw();
  }

  function apply() {
    if (!T || T.step !== 'ok' || !T.plan) return;
    if (!T.plan.rows.length) { note('바꿀 글자가 없습니다 — B 로 넣는 방법을 바꾸세요'); return; }
    if (!hasCmd()) { note('번호 매기기 명령(tcount-core.js)이 아직 없습니다. 새로고침 뒤 다시 해 주세요.'); return; }
    const cmd = { cmd: 'tcount', ids: T.texts.map(e => e.id), by: T.by, start: T.start, step: T.step_, mode: T.mode, expect: T.expect };
    let u0 = -1; try { u0 = undoStack.length; } catch (_) { }
    let R = null; try { R = runBatch([cmd], { label: LABEL }); } catch (e) { R = { ok: false, errors: [errMsg(e)] }; }
    if (!R || !R.ok) {
      // 빈 되돌리기 칸 없애기 (+ 혹시 반쯤 바뀌었으면 그 칸으로 되돌림)
      try { if (u0 >= 0 && undoStack.length > u0) { doc = JSON.parse(undoStack.pop()); changed(); } } catch (_) { }
      const m = R && R.errors && R.errors[0] ? errMsg(R.errors[0]) : '';
      T.fail = '번호를 넣지 못했습니다' + (m ? ' — ' + m : '') + ' · 도면은 그대로입니다';
      T.step = 'mode'; T.plan = null; T.expect = null; // 미리보기를 새로 만들게 (Enter 로 같은 이유로 또 실패하지 않게)
      note(T.fail); paint(); redraw();
      return;
    }
    const r0 = (R.results && R.results[0]) || {};
    const n = fin(+r0.n) ? +r0.n : (Array.isArray(r0.ids) ? r0.ids.length : T.plan.rows.length);
    const first = r0.first != null ? r0.first : T.plan.first, last = r0.last != null ? r0.last : T.plan.last;
    say(`번호 ${n}개를 넣었습니다 (${first} → ${last}) · 되돌리기(Ctrl+Z) 한 번에 원래대로`, 'ok');
    try { sel.clear(); changed(); } catch (_) { } // 큰 선택(20만 개)이 남으면 매 프레임 선택 강조로 느려짐 — 명령 끝나면 선택 풂
    endTool();
  }

  function makeTool() {
    const t = {
      name: 'tcount', wantsPoint: false, selecting: !sel.size, allowEmptySel: false,
      step: sel.size ? 'by' : 'sel', ids: [], texts: [], skipped: {}, nOther: 0, rot: 0,
      by: 'y', start: '1', step_: 1, mode: 'O', plan: null, expect: null, fail: null,
      get prompt() {
        if (t.selecting || t.step === 'sel') return '번호 붙일 문자 선택 (끝나면 Enter):';
        if (t.step === 'by') return `순서 [위→아래(Y) / 왼→오른(X) / 고른 순서(S)] <${({ y: 'Y', x: 'X', sel: 'S' })[t.by]}>:`;
        if (t.step === 'num') return `시작 번호,증가 <${t.start},${t.step_}>:`;
        if (t.step === 'mode') return `넣는 방법 [바꾸기(O) / 앞에 붙이기(P) / 뒤에 붙이기(U) / # 자리 바꾸기(F)] <${t.mode}>:`;
        if (t.step === 'ok') return '미리보기 확인 후 선택 [적용(Enter) / 뒤로(B) / 취소(Esc)]:';
        return '명령:';
      }, set prompt(v) { },
      afterSelect() { t.selecting = false; if (afterPick()) { try { setPrompt(t.prompt); } catch (_) { } } },
      onInput(s) { return answer(String(s == null ? '' : s).trim()); },
      onEnter() { answer(''); }
    };
    // 'step' 이름이 단계와 증가에 겹치지 않게 증가는 step_ 로 둠
    return t;
  }

  /* 단계별 답 (빈 답 = 기본값) — 처리했으면 true */
  function answer(s) {
    if (!T || tool !== T) return false;
    const u = s.toUpperCase();
    if (T.step === 'by') {
      if (u && !BY[u]) { note('Y·X·S 중 하나를 입력하세요'); return true; }
      if (u) T.by = BY[u];
      T.step = 'num'; T.fail = null; paint(); return true;
    }
    if (T.step === 'num') {
      const v = parseNum(s);
      if (!v) { T.fail = '예: 1,1 · 10,5 · 001,1 처럼 "시작 번호,증가" 로 입력하세요'; note(T.fail); paint(); return true; }
      const keep = { start: T.start, step_: T.step_ };
      T.start = v.start; T.step_ = v.step;
      try { buildPlan('O'); } catch (e) { // 시작·증가가 잘못되면 core(plan) 가 throw — 그 단계에 그대로 머묾
        T.start = keep.start; T.step_ = keep.step_;
        T.fail = '시작 번호·증가를 확인하세요 — ' + errMsg(e); note(T.fail); paint(); return true;
      }
      T.step = 'mode'; T.fail = null; paint(); return true;
    }
    if (T.step === 'mode') {
      if (u && !MODE_KO[u]) { note('O·P·U·F 중 하나를 입력하세요'); return true; }
      if (u) T.mode = u;
      toPreview(); return true;
    }
    if (T.step === 'ok') {
      if (!u) { apply(); return true; }
      if (u === 'B') { T.step = 'mode'; T.plan = null; T.fail = null; paint(); redraw(); return true; }
      note('Enter 적용 · B 뒤로 · Esc 취소'); return true;
    }
    return false;
  }

  /* ---------- 명령 등록 (키는 없을 때만) ---------- */
  if (!TOOLS.tcount) TOOLS.tcount = () => {
    evt('TCOUNT');
    if (!M()) { note('번호 매기기 모듈(tcount-core.js)이 아직 없습니다. 새로고침 뒤 다시 해 주세요.'); return null; }
    T = makeTool();
    if (!T.selecting && !afterPick()) { T = null; return null; } // 미리 고른 것에 문자가 없으면 도구를 열지 않음
    setTimeout(() => { if (T && tool === T) { paint(); try { setPrompt(T.prompt); } catch (_) { } } }, 0);
    return T;
  };
  for (const [k, v] of Object.entries({ TCOUNT: 'tcount', TCN: 'tcount' })) if (!(k in ALIAS)) ALIAS[k] = v;
  if (typeof CMD_KO === 'object' && !CMD_KO.tcount) CMD_KO.tcount = LABEL;
  if (typeof KO_CMD === 'object') for (const [k, v] of Object.entries({ 번호매기기: 'tcount', 번호넣기: 'tcount' })) if (!(k in KO_CMD)) KO_CMD[k] = v;

  window.TCOUNT_UI = {
    ver: 1,
    state: () => (T && tool === T ? { step: T.step, n: T.texts.length, by: T.by, start: T.start, inc: T.step_, mode: T.mode, rows: T.plan ? T.plan.rows.length : 0, fail: T.fail || null } : null)
  };
})();
