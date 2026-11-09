/* 무카 CAD AI 팀 실험판 — 판 문장 바로 그리기 화면 (6회차 개발2, 2026-11-09)
   window.PLATE_UI = { version, handle(text,{cmd}) }
   명령: PLATE · 한글 '판그리기' · '구멍판' → 판 문장을 묻고 그림
   명령 없이 친 문장도 바로 읽음: "가로 300 세로 200 판에 모서리 R10, 구멍 Ø10 네 귀퉁이 20 안쪽"
   - 계산은 하지 않음: plate-core.js 의 PLATECORE.parse / check / holeCenters / build 만 부름(부를 때마다 그 순간 찾음)
   - PLATECORE 가 없거나 parse 가 null 이면 아무것도 가로채지 않고 원래 preCommand 로 그대로 넘김
     (가로 300 세로 200 · 300x200 · W300 H200 사각형, 엘보 양식, AI 카드 모두 그대로)
   - AI 가 연결돼 있고 못 읽은 말(또는 물어볼 것)이 있으면 원래 경로(AI)로 넘김
   - 구석점: 클릭 또는 명령창 0,0 · Esc 취소 · 커서 따라 판 윤곽+구멍 미리보기(도면에는 넣지 않음)
   - runBatch 1번(되돌리기 1번). 실패하거나 모깎기가 4곳이 아니면 undo() 로 되돌림
   - 사용 기록은 ('unknown_cmd',{cmd:'PLATE'}) 만. 화면 글자는 모두 log()(textContent). hook 안 오류는 모두 잡음 */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object' || typeof preCommand !== 'function') return;
  if (window.PLATE_UI) return;

  const EX = '가로 300 세로 200 판에 구멍 Ø10 네 귀퉁이 20 안쪽';
  const ASK_PROMPT = '판 문장 입력 (예: ' + EX + '):';
  const core = () => { const P = window.PLATECORE; return (P && typeof P.parse === 'function' && typeof P.build === 'function') ? P : null; };
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const fin = x => typeof x === 'number' && isFinite(x);
  const nf = v => { try { return fmt(+v); } catch (_) { return String(Math.round(+v * 1000) / 1000); } };
  const evt = () => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'PLATE' }); } catch (_) { } };
  const aiOn = () => { try { const A = window.__aic; return !!(A && A.state === 'on'); } catch (_) { return false; } };
  const fenceOn = () => { try { return typeof fence !== 'undefined' && !!fence; } catch (_) { return false; } };
  const clip = (x, n) => { const s = String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  const list = a => (Array.isArray(a) ? a : []).map(x => clip(x, 40)).filter(Boolean);
  const THICK = /두께|^\s*t\s*=?\s*\d|\d\s*T\s*$/i;

  /* ---------- 글자 만들기 ---------- */
  function holeTxt(spec) {
    const H = spec.holes || {};
    return `구멍 ${H.n}-Ø${nf(H.d)}` + (H.layout === 'center' ? ' (가운데)' : ` (안쪽 ${nf(H.inset)}${spec.insetDefault ? ', 기본값' : ''})`);
  }
  function promptTxt(spec) {
    return `판 ${nf(spec.w)}×${nf(spec.h)} · ${holeTxt(spec)}` + (spec.r > 0 ? ` · 모서리 R${nf(spec.r)}` : '') + ' — 왼쪽 아래 구석점 지정:';
  }
  const readTxt = spec => { const r = list(spec.read); return r.length ? r.join(', ') : '-'; };
  const q = a => a.map(x => `'${x}'`).join(', ');

  /* ---------- 미리보기 (커서 = 왼쪽 아래 구석점) ---------- */
  function preview(spec, c, cur) {
    const P = core(); if (!P || !cur) return;
    const w = +spec.w, h = +spec.h, s = view.s, r = Math.max(0, Math.min(+spec.r || 0, Math.min(w, h) / 2)) * s;
    const A = S({ x: cur.x, y: cur.y }), B = S({ x: cur.x + w, y: cur.y }), C = S({ x: cur.x + w, y: cur.y + h }), D = S({ x: cur.x, y: cur.y + h });
    c.beginPath();
    c.moveTo((A.x + B.x) / 2, (A.y + B.y) / 2);
    c.arcTo(B.x, B.y, C.x, C.y, r); c.arcTo(C.x, C.y, D.x, D.y, r); c.arcTo(D.x, D.y, A.x, A.y, r); c.arcTo(A.x, A.y, B.x, B.y, r);
    c.closePath(); c.stroke();
    let cs = []; try { cs = P.holeCenters(spec, { x: cur.x, y: cur.y }) || []; } catch (_) { cs = []; }
    const rr = Math.abs((+spec.holes.d / 2) * s);
    if (!(rr > 0) || !isFinite(rr)) return;
    for (const p of cs) { if (!p || !fin(p.x) || !fin(p.y)) continue; const z = S(p); c.beginPath(); c.arc(z.x, z.y, rr, 0, Math.PI * 2); c.stroke(); }
  }

  /* ---------- 그리기 (runBatch 1번, 이상하면 되돌림) ---------- */
  function draw(spec, p) {
    const P = core();
    if (!P) { say('판 계산 모듈(plate-core.js)을 불러오지 못했습니다. 새로고침 뒤 다시 해 주세요.', 'err'); return false; }
    let cmds;
    try { cmds = P.build(spec, { x: +p.x, y: +p.y }); } catch (e) { say('판을 그리지 않았습니다: ' + clip(e && e.message ? e.message : '치수를 다시 확인해 주세요', 120), 'err'); return false; }
    if (!Array.isArray(cmds) || !cmds.length) { say('판을 그리지 않았습니다: 그릴 것이 없습니다', 'err'); return false; }
    const u0 = undoStack.length, n0 = doc.entities.length, want = 1 + ((spec.holes && +spec.holes.n) || 0);
    let R = null;
    try { R = runBatch(cmds, { label: '판 그리기' }); } catch (_) { R = null; }
    let bad = null;
    if (!R || !R.ok) bad = '그리는 중 오류가 나서 되돌렸습니다 — 치수를 확인해 주세요';
    else if (+spec.r > 0) {
      const i = cmds.findIndex(c => c && String(c.cmd).toLowerCase() === 'fillet');
      const fr = i >= 0 ? R.results[i] : null;
      if (!fr || fr.count !== 4) bad = `모서리 R${nf(spec.r)} 을(를) 네 곳 모두 깎지 못해 되돌렸습니다 — R 을 줄여 보세요`;
    }
    if (!bad && doc.entities.length - n0 !== want) bad = '도형 수가 예상과 달라 되돌렸습니다';
    if (bad) { try { if (undoStack.length > u0) undo(); } catch (_) { } say(bad, 'err'); return false; }
    const H = spec.holes || {};
    say(`판 ${nf(spec.w)}×${nf(spec.h)} · 구멍 ${H.n}개 Ø${nf(H.d)} 그렸습니다 (AI 없이 · 읽은 치수: ${readTxt(spec)})`, 'ok');
    const un = list(spec.unread), th = un.filter(x => THICK.test(x)), other = un.filter(x => !THICK.test(x));
    if (th.length) say(`${q(th)} 은(는) 2D 도면이라 생략했습니다`, 'ok');
    if (other.length) say(`${q(other)} 은(는) 읽지 못해 빼고 그렸습니다`, 'err');
    say('되돌리기(U · Ctrl+Z) 한 번에 판과 구멍이 함께 지워집니다', 'ok');
    return true;
  }

  /* ---------- 구석점 고르기 도구 ---------- */
  function startPick(spec) {
    const T = {
      name: 'plate', prompt: promptTxt(spec),
      onPoint(p) { endTool(); try { draw(spec, p); } catch (_) { say('판을 그리지 못했습니다', 'err'); } },
      preview(c, cur) { preview(spec, c, cur); }
    };
    tool = T; try { lastCmd = 'plate'; } catch (_) { }
    setPrompt(T.prompt); try { markRibbon(); } catch (_) { } dirty = true;
    try { cmdIn.focus({ preventScroll: true }); } catch (_) { }
    say(`판 ${nf(spec.w)}×${nf(spec.h)} · ${holeTxt(spec)}${spec.r > 0 ? ' · 모서리 R' + nf(spec.r) : ''} — 왼쪽 아래 구석점을 클릭하거나 좌표(예: 0,0)를 입력하세요. 그만두려면 Esc`, 'ok');
  }

  /* 문장 하나 처리. true = 처리함(그림·안내), false = 판 문장이 아님/넘김 */
  function handle(text, opt) {
    const fromCmd = !!(opt && opt.cmd);
    const P = core(); if (!P) return false;
    const t = String(text || '').trim(); if (!t) return false;
    let spec = null;
    try { spec = P.parse(t); } catch (_) { spec = null; }
    if (!spec || typeof spec !== 'object') return false;
    const unread = list(spec.unread);
    if (!fromCmd && aiOn() && (unread.length || spec.ask)) return false; /* AI 가 할 수 있는 일은 AI 로 */
    try {
      if (!fromCmd) say('입력: ' + t, 'me');
      evt();
      if (spec.ask) {
        say(`판을 그리지 않았습니다: ${clip(spec.ask, 120)} (AI 없이 · 읽은 치수: ${readTxt(spec)})`, 'err');
        if (unread.length) say(`읽지 못한 말: ${q(unread)}`, 'err');
        return true;
      }
      let err = null;
      try { err = typeof P.check === 'function' ? P.check(spec) : null; } catch (_) { err = '치수를 확인하지 못했습니다'; }
      if (err) { say(`판을 그리지 않았습니다: ${clip(err, 160)} (읽은 치수: ${readTxt(spec)})`, 'err'); return true; }
      if (!(fin(+spec.w) && fin(+spec.h) && spec.holes && fin(+spec.holes.d))) { say('판을 그리지 않았습니다: 치수를 읽지 못했습니다', 'err'); return true; }
      startPick(spec);
    } catch (_) { try { endTool(); } catch (__) { } say('판 문장을 처리하지 못했습니다', 'err'); }
    return true;
  }

  /* ---------- 명령 없이 친 문장: preCommand 가장 바깥에서 감쌈 ---------- */
  const _pre = preCommand;
  preCommand = function (s) {
    try {
      if (!tool && !fenceOn()) {
        const t = String(s || '').trim();
        if (t && t[0] !== '[' && t[0] !== '{' && /\d/.test(t) && handle(t, { cmd: false })) return true;
      }
    } catch (_) { }
    return _pre(s);
  };

  /* ---------- 명령: PLATE · 판그리기 · 구멍판 ---------- */
  TOOLS.plate = () => {
    const T = {
      name: 'plate_ask', wantsPoint: false, prompt: ASK_PROMPT,
      wantsText() { return true; },
      onInput(s) {
        const t = String(s || '').trim(); if (!t) return false;
        const up = t.toUpperCase();
        if (/^[A-Z]+$/.test(up) && ALIAS[up] && ALIAS[up] !== 'plate') { endTool(); if (ALIAS[up] === 'layer_mgr') { try { openLM(); } catch (_) { } } else startTool(ALIAS[up]); return true; }
        if (!core()) { say('판 계산 모듈(plate-core.js)을 불러오지 못했습니다. 새로고침 뒤 다시 해 주세요.', 'err'); endTool(); return true; }
        endTool();
        let done = false;
        try { done = handle(t, { cmd: true }); } catch (_) { done = false; }
        if (!done) {
          say('판 문장으로 읽지 못했습니다 — 판 치수 2개(가로·세로)와 구멍(지름·개수)을 함께 써 주세요. 예: ' + EX, 'err');
          tool = T; setPrompt(T.prompt); dirty = true;
        }
        return true;
      },
      onEnter() { endTool(); }
    };
    if (!core()) say('판 계산 모듈(plate-core.js)이 아직 없습니다 — 문장을 넣어도 그리지 못할 수 있습니다', 'err');
    else say('판 그리기: 한 줄로 쓰세요 — 판 치수 · 구멍 지름 · 개수(4개=네 귀퉁이, 1개=가운데) · 안쪽 거리 · 모서리 R. 예: ' + EX, 'ok');
    return T;
  };
  if (!('PLATE' in ALIAS)) ALIAS.PLATE = 'plate';
  if (typeof CMD_KO === 'object' && CMD_KO && !('plate' in CMD_KO)) CMD_KO.plate = '판 그리기';
  if (typeof KO_CMD === 'object' && KO_CMD) for (const k of ['판그리기', '구멍판']) if (!(k in KO_CMD)) KO_CMD[k] = 'plate';

  window.PLATE_UI = { version: 1, handle };
})();
