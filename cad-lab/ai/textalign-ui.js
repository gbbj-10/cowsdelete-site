/* 무카 CAD AI 팀 실험판 — 글자 줄 맞춤 화면 (10회차 개발2, 2026-11-10)
   명령: TEXTALIGN · TXA · TA · 한글 '글자맞춤' · '문자정렬' ('정렬' 은 쓰지 않음 — 본체 ALIGN. AL·ALIGN 안 건드림)
   - 계산·바꾸기는 하지 않음: textalign-core.js 의 TALIGN.edges / TALIGN.plan 과 COMMANDS.textalign 만 부름
   - 흐름: 글자 선택(Enter) → 기준 글자 클릭(Enter = 맨 위/맨 왼쪽 자동) → 방향 V/H → (V) 맞춤 L/C → (V) 간격 K/E → 적용
   - 적용 = runBatch([{cmd:'textalign',ids,baseId?,dir,just,space,expect}],{label:'글자 줄 맞춤'}) 1번 = 되돌리기 1번
     R.ok 가 false 면 undoStack.pop() 로 되돌리기 칸을 빼고(도면도 그 사본으로 되돌림) 실패 안내 — 성공 로그는 R.ok 일 때만
   - 빠진 글자는 종류별 개수 안내(회전·잠김·꺼짐·블록 안·여러 줄·글자 아님)
   - 화면 위 표시(기준 글자 상자·안내선)는 도면 객체가 아님. 화면 글자는 모두 textContent
   - 사용 기록은 'TEXTALIGN' 이름만 (도면 글자는 보내지 않음)
   - TOOLS·ALIAS·KO_CMD·CMD_KO 는 없는 키만 넣음. 단축키 저장에서 빠지는 것은 bound-ui.js 의 diffShortcuts 감싸기가 맡음(TOOLS 에 있는 실험 도구) */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  if (window.TEXTALIGN_UI) return; // 두 번 불려도 render 를 두 번 감싸지 않게
  const LABEL = '글자 줄 맞춤';
  const ROT_TOL = 1e-6; // 도(°) — 기준 글자 회전 미리 거르기 (최종 판단은 core)
  const fin = x => typeof x === 'number' && isFinite(x);
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const note = m => { try { toast(m); } catch (_) { } try { log(m, 'err'); } catch (_) { } };
  const evt = name => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: name }); } catch (_) { } };
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  const TA = () => (window.TALIGN && typeof window.TALIGN.plan === 'function') ? window.TALIGN : null;
  const hasCmd = () => { try { return typeof COMMANDS === 'object' && typeof COMMANDS.textalign === 'function'; } catch (_) { return false; } };
  const ent = id => { try { return byId(id); } catch (_) { return null; } };
  const isText = e => !!e && e.type === 'text';
  const rotOf = e => { const r = ((+e.rot || 0) % 360 + 360) % 360; return Math.min(r, 360 - r); };
  const DIR_KO = { V: '세로 줄', H: '가로 줄' };
  const JUST_KO = { L: '왼쪽', C: '가운데', R: '오른쪽' };
  const SPACE_KO = { K: '그대로', E: '같은 간격' };
  const cnt = v => Array.isArray(v) ? v.length : (fin(+v) ? +v : 0);
  const SKIP_KO = [
    ['rotated', '회전된 글자'], ['locked', '잠긴 층 글자'], ['off', '꺼진·얼린 층 글자'],
    ['block', '블록 안 글자'], ['mt', '여러 줄 글자(같은 간격에서 뺌)'], ['other', '글자가 아닌 객체(치수·표·속성 정의 등)']
  ];
  function skipText(sk) {
    if (!sk || typeof sk !== 'object') return '';
    const out = [];
    for (const [k, ko] of SKIP_KO) { const n = cnt(sk[k]); if (n > 0) out.push(`${ko} ${n}개`); }
    for (const k of Object.keys(sk)) { if (SKIP_KO.some(x => x[0] === k)) continue; const n = cnt(sk[k]); if (n > 0) out.push(`기타 ${n}개`); }
    return out.length ? '뺀 것: ' + out.join(' · ') : '';
  }
  const errMsg = e => String((e && e.message) || e || '').replace(/^#\d+ \w+: /, '').slice(0, 160);
  /* 표째 고름(같은 줄·같은 열에 2개 이상) — core 가 메시지에 'grid' 를 넣어 throw */
  const isGrid = e => { try { return (e && e.code === 'grid') || /grid/i.test(String((e && e.message) || e || '')); } catch (_) { return false; } };
  const GRID_MSG = '표처럼 여러 열(줄)을 함께 골랐습니다 — 한 열(한 줄)씩 고르세요 · 도면은 그대로입니다';
  /* 도구 도중 친 것이 다른 명령 이름이면 true (본체 __muccaToolMiss 가 도구를 끝내고 그 명령으로 넘김) */
  const isCmdName = s => { try { const raw = String(s || '').trim(), u = raw.toUpperCase(), k = raw.replace(/\s+/g, ''); return !!((ALIAS[u] && ALIAS[u] !== 'textalign') || (KO_CMD[k] && KO_CMD[k] !== 'textalign')); } catch (_) { return false; } };

  if (!document.getElementById('txaCss')) {
    const st = document.createElement('style'); st.id = 'txaCss';
    st.textContent = `
.txap{position:absolute;left:10px;top:10px;z-index:4;width:min(380px,calc(100% - 20px));background:var(--chrome,#191d23);color:var(--ink,#dfe4ea);border:1px solid var(--rule,#2c333d);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.45;box-shadow:0 6px 22px rgba(0,0,0,.4)}
.txap h4{margin:0 0 4px;font-size:12px;font-weight:600}
.txap .dim{color:var(--ink-dim,#8b95a3)}
.txap .sum{margin:2px 0;font-family:var(--mono,monospace)}
.txap .warn{margin:4px 0 0;padding:4px 7px;border:1px solid var(--tag,#f1c232);border-radius:6px;color:var(--tag,#f1c232)}
.txap .fail{margin:4px 0 0;padding:5px 7px;border:1px solid #ff6b6b;border-radius:6px;color:#ff9d9d}
.txap .btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}`;
    document.head.appendChild(st);
  }

  /* ---------- 상태 ---------- */
  let T = null, panel = null;
  const refocus = () => { try { cmdIn.focus({ preventScroll: true }); } catch (_) { } };
  const redraw = () => { try { dirty = true; } catch (_) { } };
  const curPrompt = () => { try { setPrompt(tool ? tool.prompt : '명령:'); } catch (_) { } };
  function closePanel() { if (panel) { try { panel.remove(); } catch (_) { } panel = null; } }

  /* 지금 고른 옵션 → plan/명령 옵션 (H 는 v1 에서 간격 K 만) */
  function optOf(t) {
    const o = { dir: t.dir || 'V', just: t.dir === 'H' ? 'L' : (t.just || 'L'), space: t.dir === 'H' ? 'K' : (t.space || 'K') };
    if (t.baseId != null) o.baseId = t.baseId;
    return o;
  }
  function choiceText(t) {
    const o = optOf(t), a = [`방향 ${DIR_KO[o.dir]}`];
    if (o.dir === 'V') { if (t.just) a.push(`맞춤 ${JUST_KO[o.just] || o.just}`); if (t.space) a.push(`간격 ${SPACE_KO[o.space] || o.space}`); }
    else a.push('밑줄 맞춤 · 간격 그대로');
    return a.join(' · ');
  }

  function paint() {
    if (!T) { closePanel(); return; }
    const host = document.getElementById('view') || document.body;
    if (!panel || !panel.isConnected) { panel = el('div', 'txap'); panel.setAttribute('role', 'status'); host.appendChild(panel); }
    panel.textContent = '';
    panel.appendChild(el('h4', null, '글자 줄 맞춤 (TEXTALIGN)'));
    if (T.selecting) {
      panel.appendChild(el('div', 'dim', '맞출 글자(한 줄·여러 줄 문자)를 고르고 Enter · Esc 취소'));
    } else {
      const nT = T.ids.filter(id => isText(ent(id))).length;
      panel.appendChild(el('div', 'sum', `글자 ${nT}개` + (T.ids.length > nT ? ` (글자 아닌 것 ${T.ids.length - nT}개는 뺌)` : '') + ' · 기준: ' + (T.baseId != null ? '고른 글자' : '자동(맨 위·맨 왼쪽)')));
      if (T.step !== 'base') panel.appendChild(el('div', 'sum', choiceText(T)));
      const hint = { base: '기준 글자를 누르세요 · Enter = 자동', dir: 'V = 위아래로 쌓인 글자의 x 맞춤 · H = 옆으로 놓인 글자의 밑줄(y) 맞춤', just: '글자 자체의 정렬 값은 바꾸지 않고 위치만 옮깁니다', space: 'K = 위아래 위치 그대로 · E = 처음·끝 글자는 그대로, 사이를 같은 간격으로' }[T.step];
      if (hint) panel.appendChild(el('div', 'dim', hint));
      if (T.step === 'just' || (T.step === 'space' && T.just === 'C')) panel.appendChild(el('div', 'warn', '가운데 맞춤은 글자 폭을 추정해 계산합니다(±10% 안팎) — 글꼴에 따라 조금 어긋날 수 있음'));
    }
    if (T.fail) panel.appendChild(el('div', 'fail', T.fail));
    const btns = el('div', 'btns');
    const opts = { dir: [['V', '세로 줄 (V)'], ['H', '가로 줄 (H)']], just: [['L', '왼쪽 (L)'], ['C', '가운데 (C) · 추정']], space: [['K', '그대로 (K)'], ['E', '같은 간격 (E)']] }[T.step];
    if (opts && !T.selecting) for (const [k, txt] of opts) {
      const b = el('button', 'tbtn', txt);
      b.onclick = () => { if (T && T.onInput(k)) { curPrompt(); redraw(); } refocus(); };
      btns.appendChild(b);
    }
    const bX = el('button', 'tbtn', '취소 (Esc)');
    bX.onclick = () => { try { log('*취소*'); endTool(); } catch (_) { } refocus(); };
    btns.appendChild(bX);
    panel.appendChild(btns);
  }

  /* ---------- 화면 위 표시: 고른 글자 밑줄 · 기준 글자 상자 · 안내선 (render 를 한 번만 감쌈) ---------- */
  try {
    const _rTxa = render;
    render = function () {
      _rTxa.apply(this, arguments);
      if (T && tool !== T) { T = null; closePanel(); }
      if (!T || T.selecting) return;
      const M = TA(); if (!M || typeof M.edges !== 'function') return;
      try {
        const c = ctx2; c.save(); c.setTransform(DPR, 0, 0, DPR, 0, 0); c.setLineDash([]);
        const MAXD = 2000; let k = 0;
        for (const id of T.ids) {
          if (k++ > MAXD) break;
          const e = ent(id); if (!isText(e) || rotOf(e) > ROT_TOL) continue;
          let g; try { g = M.edges(e); } catch (_) { g = null; }
          if (!g || !fin(g.left) || !fin(g.right) || !fin(g.base)) continue;
          const a = S({ x: g.left, y: g.base }), b = S({ x: g.right, y: g.base });
          const isB = T.baseId != null && id === T.baseId;
          c.lineWidth = isB ? 2 : 1.2; c.strokeStyle = isB ? '#f1c232' : 'rgba(110,200,255,.85)';
          c.beginPath(); c.moveTo(a.x, a.y + 2); c.lineTo(b.x, b.y + 2); c.stroke();
          if (isB) { const top = S({ x: g.left, y: g.base + (+e.h || 0) }); c.strokeRect(a.x - 2, top.y - 2, (b.x - a.x) + 4, (a.y - top.y) + 6); }
        }
        if (T.baseId != null && T.step !== 'base') {
          const e = ent(T.baseId); let g = null; try { g = isText(e) ? M.edges(e) : null; } catch (_) { g = null; }
          if (g) {
            c.setLineDash([6, 4]); c.lineWidth = 1; c.strokeStyle = 'rgba(241,194,50,.8)'; c.beginPath();
            if (T.dir === 'H') { const q = S({ x: g.left, y: g.base }); c.moveTo(0, q.y); c.lineTo(W, q.y); }
            else if (T.dir === 'V') { const x = (T.just === 'C' ? g.center : g.left); if (fin(x)) { const q = S({ x, y: g.base }); c.moveTo(q.x, 0); c.lineTo(q.x, H); } }
            c.stroke();
          }
        }
        c.restore();
      } catch (_) { }
    };
  } catch (_) { }

  /* ---------- 적용 ---------- */
  function apply(t) {
    const M = TA();
    if (!M || !hasCmd()) { note('글자 줄 맞춤 모듈(textalign-core.js)이 아직 없습니다. 새로고침 뒤 다시 해 주세요. 도면은 그대로입니다'); endTool(); return; }
    const opt = optOf(t);
    const ents = t.ids.map(ent).filter(Boolean);
    if (ents.length !== t.ids.length) { note('고른 객체 일부가 지워졌습니다 — 다시 선택해 주세요. 도면은 그대로입니다'); endTool(); return; }
    let P;
    try { P = M.plan(ents, opt); } catch (e) {
      if (isGrid(e)) { note('글자 줄 맞춤: ' + GRID_MSG); endTool(); return; } // runBatch 부르지 않음 = 되돌리기 칸 그대로
      note('맞추지 못했습니다 — ' + (errMsg(e) || '계산 오류') + ' · 도면은 그대로입니다'); endTool(); return;
    }
    if (!P || !Array.isArray(P.moves)) { note('맞추지 못했습니다 — 계산 결과 모양이 다릅니다 · 도면은 그대로입니다'); endTool(); return; }
    const sk = skipText(P.skipped);
    const moving = P.moves.filter(m => m && m.from && m.to && (Math.abs(m.to.x - m.from.x) > 1e-9 || Math.abs(m.to.y - m.from.y) > 1e-9));
    if (!moving.length) { say('글자 줄 맞춤: 옮길 글자가 없습니다 (이미 맞춰져 있음)' + (sk ? ' · ' + sk : ''), sk ? 'err' : 'ok'); endTool(); return; }
    // 검사 때 위치(expect) — 이 위치가 아니면 core 가 아무것도 바꾸지 않고 throw
    const expect = {};
    for (const e of ents) if (isText(e) && e.p && fin(e.p.x) && fin(e.p.y)) expect[e.id] = [e.p.x, e.p.y];
    const cmd = { cmd: 'textalign', ids: t.ids.slice(), dir: opt.dir, just: opt.just, space: opt.space, expect };
    if (opt.baseId != null) cmd.baseId = opt.baseId;
    let u0 = -1; try { u0 = undoStack.length; } catch (_) { }
    let redo0 = null; try { redo0 = redoStack.slice(); } catch (_) { } // pushUndo 가 다시 하기 기록을 비우므로 실패 때 되돌릴 사본
    let R = null; try { R = runBatch([cmd], { label: LABEL }); } catch (e) { R = { ok: false, errors: [errMsg(e)] }; }
    if (!R || !R.ok) {
      try {
        if (u0 >= 0 && undoStack.length > u0) { const snap = undoStack.pop(); doc = JSON.parse(snap); if (redo0) redoStack = redo0; changed(); }
      } catch (_) { }
      const m = R && R.errors && R.errors[0] ? errMsg(R.errors[0]) : '';
      if (isGrid(m)) { note('글자 줄 맞춤: ' + GRID_MSG); endTool(); return; }
      note('글자를 맞추지 못했습니다' + (m ? ' — ' + m : '') + ' · 도면은 그대로입니다');
      endTool(); return;
    }
    const r0 = (R.results && R.results[0]) || {};
    const n = fin(+r0.n) ? +r0.n : (Array.isArray(r0.ids) ? r0.ids.length : moving.length);
    const how = opt.dir === 'H' ? '가로 줄 밑줄' : `${JUST_KO[opt.just] || opt.just}, ${SPACE_KO[opt.space] || opt.space}`;
    say(`글자 줄 맞춤: 문자 ${n}개를 맞췄습니다 (${how}) · 되돌리기(Ctrl+Z) 한 번에 원래대로`, 'ok');
    if (opt.just === 'C') say('가운데 맞춤은 글자 폭 추정값으로 계산했습니다(±10% 안팎)');
    if (sk) say('글자 줄 맞춤 ' + sk, 'err');
    try { sel.clear(); renderProps(); updateInfo(); } catch (_) { }
    endTool();
  }

  /* ---------- 도구 ---------- */
  function makeTool() {
    const pre = (() => { try { return sel && sel.size ? [...sel] : null; } catch (_) { return null; } })();
    const t = {
      name: 'textalign', wantsPoint: false, selecting: !pre, step: pre ? 'base' : 'sel',
      ids: pre || [], baseId: null, dir: null, just: null, space: null, fail: null,
      get prompt() {
        if (t.selecting) return '맞출 문자 선택 (끝나면 Enter):';
        return {
          base: '기준 문자 선택 또는 Enter=맨 위(맨 왼쪽) 문자:',
          dir: '방향 [세로 줄(V) / 가로 줄(H)] <V>:',
          just: '맞춤 [왼쪽(L) / 가운데(C, 폭 추정)] <L>:',
          space: '간격 [그대로(K) / 같은 간격(E)] <K>:'
        }[t.step] || '명령:';
      }, set prompt(v) { },
      afterSelect() {
        t.selecting = false;
        try { t.ids = [...sel]; } catch (_) { t.ids = []; }
        if (!startCheck(t)) return;
        t.step = 'base'; paint(); curPrompt(); redraw();
      },
      onPoint(p) {
        if (t.selecting || t.step !== 'base') return;
        let q = p; try { if (p === cursor && rawW && fin(rawW.x)) q = rawW; } catch (_) { } // 클릭은 스냅 전 점, 입력(50,25)은 그대로
        if (!q || !fin(q.x) || !fin(q.y)) return;
        let e = null; try { e = pick(q); } catch (_) { e = null; }
        if (!e) { t.fail = '글자를 누르세요 (빈 곳을 눌렀습니다) — Enter 면 자동 기준'; say(t.fail, 'err'); paint(); return; }
        if (!isText(e)) { t.fail = '기준은 글자(문자)만 됩니다 — 다른 것을 눌렀습니다'; say(t.fail, 'err'); paint(); return; }
        if (rotOf(e) > ROT_TOL) { t.fail = '회전된 글자는 기준으로 쓸 수 없습니다 — 다른 글자를 누르거나 Enter'; say(t.fail, 'err'); paint(); return; }
        if (!t.ids.includes(e.id)) t.ids.push(e.id); // 고른 글자 밖이면 기준으로만 더함(기준은 움직이지 않음)
        t.baseId = e.id; t.fail = null; t.step = 'dir';
        say('글자 줄 맞춤: 기준 글자를 골랐습니다', 'ok');
        paint(); redraw();
      },
      onInput(s) {
        if (t.selecting) return false;
        const u = String(s || '').trim().toUpperCase();
        // 이 단계의 선택지가 아니고 다른 명령 이름(L·TCOUNT·한글 명령 등)이면 false → 본체가 이 도구를 끝내고 그 명령으로 넘김
        if (t.step === 'dir') { if (u === 'V' || u === 'H') { t.dir = u; next(t); return true; } return isCmdName(s) ? false : bad(t, 'V 또는 H'); }
        if (t.step === 'just') { if (u === 'L' || u === 'C') { t.just = u; next(t); return true; } if (u === 'R') return bad(t, 'L 또는 C (오른쪽 R 은 아직 없음)'); return isCmdName(s) ? false : bad(t, 'L 또는 C'); }
        if (t.step === 'space') { if (u === 'K' || u === 'E') { t.space = u; next(t); return true; } if (u === 'S') return bad(t, 'K 또는 E (값 지정 S 는 아직 없음)'); return isCmdName(s) ? false : bad(t, 'K 또는 E'); }
        if (t.step === 'base') return false; // 50,25 같은 점 입력은 본체가 onPoint 로 넘김
        return false;
      },
      onEnter() {
        if (t.step === 'base') { t.baseId = null; t.fail = null; t.step = 'dir'; paint(); redraw(); return; }
        if (t.step === 'dir') { t.dir = 'V'; next(t); return; }
        if (t.step === 'just') { t.just = 'L'; next(t); return; }
        if (t.step === 'space') { t.space = 'K'; next(t); return; }
        endTool();
      }
    };
    return t;
  }
  function bad(t, what) { t.fail = `${what} 를 입력하세요 (다른 명령은 Esc 먼저)`; say(t.fail, 'err'); paint(); return true; }
  function next(t) {
    t.fail = null;
    if (t.step === 'dir') t.step = t.dir === 'H' ? 'go' : 'just';
    else if (t.step === 'just') t.step = 'space';
    else if (t.step === 'space') t.step = 'go';
    if (t.step === 'go') { apply(t); return; }
    paint(); redraw();
  }
  /* 고른 것 확인: 글자가 하나도 없으면 끝냄 */
  function startCheck(t) {
    const nT = t.ids.filter(id => isText(ent(id))).length;
    if (!nT) { note('고른 것 중 글자(한 줄·여러 줄 문자)가 없습니다 — 글자를 골라 다시 TEXTALIGN'); endTool(); return false; }
    if (!TA() || !hasCmd()) note('글자 줄 맞춤 모듈(textalign-core.js)이 아직 없습니다 — 고를 수는 있지만 맞추지는 못합니다');
    return true;
  }

  /* ---------- 명령 등록 (없는 키만) ---------- */
  if (typeof TOOLS.textalign !== 'function') {
    TOOLS.textalign = () => {
      evt('TEXTALIGN');
      const t = makeTool();
      if (!t.selecting && !startCheck(t)) return null;
      T = t;
      setTimeout(() => { if (T && tool === T) { paint(); redraw(); } }, 0);
      return T;
    };
  }
  for (const k of ['TEXTALIGN', 'TXA', 'TA']) if (!(k in ALIAS)) ALIAS[k] = 'textalign';
  if (typeof CMD_KO === 'object' && !CMD_KO.textalign) CMD_KO.textalign = LABEL;
  if (typeof KO_CMD === 'object') for (const k of ['글자맞춤', '문자정렬']) if (!(k in KO_CMD)) KO_CMD[k] = 'textalign';

  window.TEXTALIGN_UI = {
    ver: 1,
    state: () => (T && tool === T ? { step: T.selecting ? 'sel' : T.step, n: T.ids.length, baseId: T.baseId, dir: T.dir, just: T.just, space: T.space, fail: T.fail } : null)
  };
})();
