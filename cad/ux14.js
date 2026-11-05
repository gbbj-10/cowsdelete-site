/* 무카 CAD v1.10.14 (2026-11-05) — 가상 사용자 시험(문의·부정 댓글 유형 8명) TOP 10 고치기 중 명령창·선택 부분
   index.html 의 전역(doc, tool, sel, ALIAS, KO_CMD, CMD_KO, preCommand, startTool, endTool, cancel, log …)을 그대로 씀.
   ① byId: 도형 id → 위치 Map (19,000개에서 Ctrl+A 16.9초 → 즉시)
   ② 영문 자판으로 친 한글(rkfh → 가로) · 확실한 오타(CIRCEL → CIRCLE) 를 알아서 고쳐 실행
   ③ 명령 도중 갇힘: 선택 중 ALL·L, 다른 명령 이름이 오면 바꿔 시작, "그만두려면 Esc" 안내, 예/아니오
   ④ 한글 기본말(도움말·되돌리기·취소·원형…) · 사람용 HELP · Esc 로 창 닫기
   ⑤ 띄어쓰기: "가로 300 세로 200" 을 칠 때 Space 가 명령을 끊어 버리던 것 */
(function () {
  'use strict';
  if (typeof doc === 'undefined' || typeof handleCommandText !== 'function') return;

  /* ---------- ① byId → Map (항상 정확: 찾은 위치에 그 도형이 그대로 있는지 확인하고, 아니면 다시 만듦) ---------- */
  let A = null, M = null;
  function build(arr) { A = arr; M = new Map(); for (let i = 0; i < arr.length; i++) { const e = arr[i]; if (e && !M.has(e.id)) M.set(e.id, i); } }
  byId = function (id) {
    const arr = doc.entities; if (arr !== A || !M) build(arr);
    const i = M.get(id); if (i !== undefined) { const e = arr[i]; if (e && e.id === id) return e; }
    const f = arr.find(e => e.id === id); if (f) build(arr); return f;
  };

  /* ---------- ② 영문 자판 → 한글 (두벌식) ---------- */
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const KEY = { q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ', a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ', z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
    Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ' };
  const VV = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
  const CC = { 'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ' };
  const SPLIT = {}; for (const [k, v] of Object.entries(CC)) SPLIT[v] = [k[0], k[1]];
  const isV = j => JUNG.includes(j);
  /* 글자 한 묶음(영문만)을 한글로. clean = 홀로 남은 자모 없이 모두 완성 글자 */
  function runKo(w) {
    const low = w === w.toUpperCase() ? w.toLowerCase() : w; /* Caps Lock 은 소문자로 */
    const J = [...low].map(c => KEY[c] || KEY[c.toLowerCase()]); if (J.some(x => !x)) return null;
    let out = '', ch = '', ju = '', jo = '', clean = true, syl = 0;
    const flush = () => {
      if (ch && ju) { out += String.fromCharCode(0xAC00 + CHO.indexOf(ch) * 588 + JUNG.indexOf(ju) * 28 + JONG.indexOf(jo)); syl++; }
      else { if (ch || ju || jo) clean = false; out += ch + ju + jo; }
      ch = ju = jo = '';
    };
    for (const j of J) {
      if (isV(j)) {
        if (ch && !ju) { ju = j; continue; }
        if (ch && ju && !jo && VV[ju + j]) { ju = VV[ju + j]; continue; }
        if (ch && ju && jo) { /* 받침이 다음 글자 첫소리로 넘어감 */
          let carry; if (SPLIT[jo]) { carry = SPLIT[jo][1]; jo = SPLIT[jo][0]; } else { carry = jo; jo = ''; }
          flush(); ch = carry; ju = j; continue;
        }
        flush(); ju = j; flush(); continue; /* 첫소리 없는 모음 → 홀로 남음 */
      }
      if (ch && ju && !jo && JONG.includes(j)) { jo = j; continue; }
      if (ch && ju && jo && CC[jo + j]) { jo = CC[jo + j]; continue; }
      if (ch || ju) flush();
      ch = j;
    }
    flush();
    return { ko: out, clean, syl };
  }
  function en2ko(s) {
    let clean = true, syl = 0, any = false;
    const ko = String(s).replace(/[A-Za-z]+/g, w => { any = true; const r = runKo(w); if (!r) { clean = false; return w; } if (!r.clean) clean = false; syl += r.syl; return r.ko; });
    return { ko, clean: any && clean, syl };
  }
  window.__muccaEn2ko = en2ko;

  /* ---------- ④ 한글 기본말 ---------- */
  const addKo = (k, v) => { if (!(k in KO_CMD) && (TOOLS[v] || v === 'layer_mgr')) KO_CMD[k] = v; };
  [['원형', 'circle'], ['동그라미', 'circle'], ['써클', 'circle'], ['서클', 'circle'], ['라인', 'line'], ['사각', 'rect'], ['직사각형', 'rect'],
   ['모두선택', 'selectall'], ['전부선택', 'selectall'], ['다선택', 'selectall'], ['전체선택', 'selectall'], ['클로드', 'aiconnect'], ['AI연결', 'aiconnect'], ['에이아이연결', 'aiconnect']].forEach(([k, v]) => addKo(k, v));
  const SPECIAL = {};
  const sp = (words, fn) => words.forEach(w => { if (!(w in KO_CMD)) SPECIAL[w] = fn; });
  sp(['도움말', '도움', '헬프', '명령어', '명령어목록', '명령목록', '사용법', '설명서', '무카', '안녕', '안녕하세요', '뭘', '뭐해', '뭐하지'], () => { help(); return true; });
  sp(['되돌리기', '실행취소', '되돌려', '뒤로', '언두'], () => { if (tool) { log('*취소*'); endTool(); } undo(); return true; });
  sp(['다시', '다시실행', '재실행', '리두'], () => { if (tool) { log('*취소*'); endTool(); } redo(); log('↷ 다시 실행 (방금 한 명령을 한 번 더 하려면 빈칸에서 Enter)', 'ok'); return true; });
  sp(['취소', '그만', '그만두기', '멈춰', '중지', '나가기'], () => { if (tool || (typeof fence !== 'undefined' && fence)) { cancel(); } else log('진행 중인 명령이 없습니다. 방금 한 일을 되돌리려면 "되돌리기" 또는 Ctrl+Z (맥 ⌘Z)', 'ok'); return true; });
  sp(['전체보기', '화면맞춤', '전체화면'], () => { if (tool) endTool(); zoomExtents(); log('전체 보기 (ZE)', 'ok'); return true; });
  sp(['가로', '세로', '지름', '파이'], () => { log('치수까지 한 줄로 쓰세요: "가로 300 세로 200" → 사각형 · "30파이" → 지름 30 원. 쓰고 놓을 곳을 클릭하면 그려집니다.', 'ok'); return true; });
  window.__muccaKoSpecial = SPECIAL;
  const koKey = t => String(t).replace(/\s+/g, '');
  const knownKo = k => !!(KO_CMD[k] || SPECIAL[k]);
  /* 문장 첫 낱말(뒤에 치수가 이어짐) — Space 로 끊지 않음 */
  const STARTERS = new Set(['가로', '세로', '지름', '파이']);
  const submitKo = k => !STARTERS.has(k) && knownKo(k);

  /* 명령 고르기 전(도구 없음)에 한글 기본말 처리 — 다른 모든 해석보다 먼저 */
  const _pre = preCommand;
  preCommand = function (orig) {
    const t = String(orig || '').trim();
    if (t && /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(t)) { const k = koKey(t); if (!KO_CMD[k] && SPECIAL[k]) { log('입력: ' + t, 'me'); return SPECIAL[k](); } }
    return _pre(orig);
  };

  /* 알 수 없는 영문 명령 → ② 한/영 · 확실한 오타 */
  let busy = false;
  window.__muccaUnknown = function (s, up) {
    if (busy || tool) return false;
    const r = en2ko(s);
    if (r.clean && /^[A-Za-z]/.test(s.trim())) {
      const first = koKey(r.ko.split(/\s+/)[0]), all = koKey(r.ko);
      if (r.syl >= 2 || knownKo(all) || knownKo(first)) {
        log(`한/영 자동 전환: ${s} → ${r.ko}`, 'ok');
        window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'KOFIX' });
        busy = true; try { if (preCommand(r.ko)) return true; } finally { busy = false; }
      }
    }
    const sg = typeof cmdSuggest === 'function' ? cmdSuggest(up) : null;
    if (sg && up.length >= 5 && cmdLev(up, sg) <= 1 && ALIAS[sg]) {
      const n = ALIAS[sg];
      log(`${s} → ${sg} (${CMD_KO[n] || n}) 로 알아듣고 실행합니다`, 'ok');
      window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'TYPOFIX' });
      if (n === 'layer_mgr') openLM(); else startTool(n);
      return true;
    }
    return false;
  };

  /* ③ 명령 도중: 긴 한글 단어는 영문 자판 글자로 바꾸지 않음(구멍 → RNAJD 방지). 한 글자 대답(ㅛ→Y)은 그대로 바꿈 */
  window.__muccaKoInTool = function (s) {
    const k = koKey(s); if (knownKo(k) || /^(예|네|응|아니오|아니요|아니)$/.test(k)) return true;
    return ko2en(k).length > 3;
  };
  const YES = /^(예|네|응|ㅇㅇ)$/, NO = /^(아니오|아니요|아니)$/;
  window.__muccaToolMiss = function (s, s0) {
    if (!tool) return false;
    const T = tool, up = String(s).trim().toUpperCase(), raw = String(s0 || s).trim(), k = koKey(raw), ko = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(raw);
    const cur = CMD_KO[T.name] || T.name || '명령', done = () => { setPrompt(tool ? tool.prompt : '명령:'); dirty = true; return true; };
    if (ko && (YES.test(k) || NO.test(k)) && T.onInput && T.onInput(YES.test(k) ? 'Y' : 'N')) return done();
    if (T.selecting) {
      if (up === 'ALL') { let n = 0; for (const e of pickableEnts()) { sel.add(e.id); n++; } changed(); log(`객체 ${n}개 선택됨 — 다 골랐으면 Enter`, 'ok'); return done(); }
      if (up === 'L') { const a = pickableEnts(), e = a[a.length - 1]; if (e) { sel.add(e.id); changed(); log('마지막에 그린 객체 1개 선택됨 — 다 골랐으면 Enter', 'ok'); } else log('고를 객체가 없습니다', 'err'); return done(); }
      if (/^(W|C|WP|CP|BOX)$/.test(up)) { log('창 선택은 화면에서 두 점을 클릭하세요 — 왼쪽→오른쪽 = 완전히 들어간 것만, 오른쪽→왼쪽 = 걸친 것까지. 울타리는 F. 그만두려면 Esc', 'ok'); return done(); }
    }
    if (ko && SPECIAL[k] && !KO_CMD[k]) { log('입력: ' + raw, 'me'); SPECIAL[k](); return done(); }
    let next = null;
    if (ko && KO_CMD[k]) next = KO_CMD[k];
    else if (!ko && ALIAS[up] && !(up.length === 1 && (T.selecting || new RegExp('\\(' + up + '\\)').test(T.prompt || '')))) next = ALIAS[up];
    if (next && next !== T.name) {
      log(`'${cur}' 을(를) 끝내고 '${CMD_KO[next] || next}' 시작`, 'ok'); endTool();
      if (next === 'layer_mgr') openLM(); else startTool(next);
      return done();
    }
    log(`입력을 이해하지 못했습니다: ${raw} — 지금은 '${cur}' 명령이 ${T.selecting ? '객체 선택(클릭·창·ALL)' : '점·값 입력(예: 100,50  @100,0  @100<30  100)'}을 기다립니다. 그만두려면 Esc`, 'err');
    return true;
  };

  /* ⑤ 띄어쓰기: 도구가 없을 때, 한글 문장(또는 영문 자판으로 친 한글)을 쓰는 중이면 Space 를 명령 확인으로 쓰지 않음 */
  window.__muccaSpaceKeep = function (v) {
    if (tool || (typeof fence !== 'undefined' && fence)) return false;
    const t = String(v || '').trim(); if (!t) return false;
    if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(t)) { const k = koKey(t); if (submitKo(k) || (typeof quickCircleTest === 'function' && quickCircleTest(t))) return false; return true; }
    if (ALIAS[t.toUpperCase()] || /^[\d@.,<\s-]+$/.test(t)) return false;
    if (/^W\s*\d/i.test(t)) return true; /* W300 H200 */
    const r = en2ko(t); if (r.clean) { const k = koKey(r.ko); return !submitKo(k) && (r.syl >= 2 || STARTERS.has(k)); }
    return false;
  };

  /* ---------- ④ 사람용 도움말 (HELP · ? · 도움말) ---------- */
  function help() {
    const box = document.createElement('div'); box.style.cssText = 'font-size:12.5px;line-height:1.45;max-width:640px';
    const rows = [
      ['그리기', 'L 선 · C 원 · REC 사각형 · PL 폴리선 · A 호 · T 문자 · H 해치'],
      ['고치기', 'E 지우기 · M 이동 · CO 복사 · RO 회전 · MI 대칭 · O 간격띄우기 · TR 자르기 · F 모깎기'],
      ['치수', 'DLI 선형 · DAL 정렬 · DDI 지름 · DRA 반지름 · DAN 각도'],
      ['한글로', '선 · 원 · 지우기 · 간격띄우기 · 되돌리기 · 취소 · 도움말 — 영문 자판으로 쳐도(rkfh) 알아서 바꿉니다'],
      ['치수만', '가로 300 세로 200 → 사각형 · 30파이 → 지름 30 원 (쓰고 놓을 곳 클릭)'],
      ['조작', 'Enter·Space = 확인 / 빈칸이면 직전 명령 다시 · Esc = 그만두기(창 닫기) · Ctrl+Z 되돌리기 · 휠 = 확대·축소 · 가운데 버튼 끌기 = 이동'],
      ['맥', '두 손가락 밀기 = 이동 · 핀치 = 확대 · delete = 지우기 · ⌘Z 되돌리기'],
      ['막히면', 'Esc 를 두세 번 누르면 처음 상태로 돌아갑니다']
    ];
    const tb = document.createElement('table'); tb.style.cssText = 'border-collapse:collapse;width:100%';
    for (const [a, b] of rows) { const tr = document.createElement('tr'); const th = document.createElement('th'); th.textContent = a; th.style.cssText = 'text-align:left;padding:2px 12px 2px 0;white-space:nowrap;vertical-align:top;color:var(--ink-dim);font-weight:600'; const td = document.createElement('td'); td.textContent = b; td.style.padding = '2px 0'; tr.append(th, td); tb.appendChild(tr); }
    box.appendChild(tb);
    const b1 = document.createElement('button'); b1.className = 'tbtn'; b1.textContent = '단축키 바꾸기'; b1.onclick = () => { m.remove(); startTool('aliasedit'); };
    const b2 = document.createElement('button'); b2.className = 'tbtn'; b2.textContent = 'AI 명령표 (개발자용)'; b2.onclick = () => { m.remove(); openApi(); };
    const m = modal('무카 CAD 도움말', box, [b1, b2]); m.id = 'muccaHelp';
    window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'HELP_OPEN' });
    return m;
  }
  window.__muccaHelp = help;
  if (typeof CMD_KO === 'object') CMD_KO.help = '도움말';

  /* ---------- ④ Esc 로 맨 위 창 닫기 (입력칸에서 쓰는 Esc·단축키 입력 중은 그대로) ---------- */
  addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || ev.isComposing) return;
    const ms = [...document.querySelectorAll('.modal')].filter(x => x.isConnected && x.offsetParent !== null && !x.hidden);
    if (!ms.length) return;
    const t = ev.target, top = ms[ms.length - 1];
    if (t && t !== cmdIn && t.closest && t.closest('.modal') && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (top.querySelector('.cap')) return;
    const x = top.querySelector('[data-x]');
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (x) x.click(); else top.remove();
  }, true);
})();
