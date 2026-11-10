/* 무카 CAD AI 팀 실험판 — 방 이름·면적 라벨 화면 (12회차 개발2, 2026-11-10)
   명령: ROOMTAG · RTAG · 한글 '방이름' · '면적라벨'  ('면적'·AREA 는 건드리지 않음)
   - 계산은 하지 않음: bound-core.js 의 BOUND.at, roomtag-core.js 의 ROOMTAG.label / nextName / key, COMMANDS.roomtag 만 부름
   - 방 안쪽 클릭(또는 2000,1500 입력)마다 미리보기 = 점선 경계 + 이름·면적 글자 자리 점선 상자 (화면 위 표시만 — 도면 객체 아님)
   - 이름은 자동 번호('방 1' → '방 2'). 클릭 전에 글자를 치면 다음 방 이름(그 뒤로 자동 번호)
   - Enter → runBatch([{cmd:'roomtag', rooms:[...]}],{label}) 1번 = 되돌리기 1번. R.ok false 면 undoStack.pop() 으로 되돌림
   - Esc 취소 · U 마지막 방 빼기 · M 단위 m²/mm² · I 섬 빼기(기본 끔) · H=300 글자 높이
   - 같은 경계 두 번 → 빼고 "문·틈으로 이어졌을 수 있음", 이미 라벨 있는 방(라벨 층 글자가 경계 안) 건너뛰기
   - open(틈) → GEOCHECK 안내. frame(도곽 의심) → 노란 경고, Y 일 때만 그 방에 frameOk:true(기본은 안 넣음). 라벨 층이 꺼짐·동결·잠김이면 만들지 않음
   - 화면 글자는 모두 textContent, 사용 기록은 'ROOMTAG' 이름만. window.TCOUNT 는 부르지 않음 */
(function () {
  'use strict';
  if (typeof TOOLS !== 'object' || typeof ALIAS !== 'object') return;
  if (window.ROOMTAG_UI) return; // 두 번 불려도 render 를 두 번 감싸지 않게
  const LABEL = '방 이름·면적 라벨';
  const fin = x => typeof x === 'number' && isFinite(x);
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const note = m => { try { toast(m); } catch (_) { } try { log(m, 'err'); } catch (_) { } };
  const evt = name => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: name }); } catch (_) { } };
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = String(txt); return x; };
  const B = () => (window.BOUND && typeof window.BOUND.at === 'function') ? window.BOUND : null;
  const RT = () => (window.ROOMTAG && typeof window.ROOMTAG.label === 'function') ? window.ROOMTAG : null;
  const hasCmd = () => { try { return typeof COMMANDS === 'object' && typeof COMMANDS.roomtag === 'function'; } catch (_) { return false; } };
  const geoOK = () => { try { return typeof TOOLS.geocheck === 'function'; } catch (_) { return false; } };
  const DEF0 = { name: '방 1', unit: 'm2', dec: 2, islands: false, h: 250, ah: 0.7, layer: '방이름' };
  const defs = () => { const M = RT(); return Object.assign({}, DEF0, M && M.defaults && typeof M.defaults === 'object' ? M.defaults : {}); };
  const uName = u => u === 'mm2' ? 'mm²' : 'm²';
  /* mm² → 단위 값 (mm² 정수 단계 반올림 뒤 나눔 — 화면 요약용. 라벨 글자는 core 의 text 를 그대로 씀) */
  const conv = (mm2, u, dec) => { const a = Math.round(+mm2 || 0); if (u === 'mm2') return String(a); const k = Math.pow(10, dec); return (Math.round(a / Math.pow(10, 6 - dec)) / k).toFixed(dec); };
  /* core 가 아직 없을 때만 쓰는 같은 규칙: '방 3' → '방 4', 'A-09' → 'A-10', 숫자 없으면 ' 2' */
  function nextNameLocal(s) {
    s = String(s == null ? '' : s);
    const m = s.match(/^(.*?)(\d+)(\D*)$/);
    if (!m) return s + ' 2';
    const n = String(+m[2] + 1), w = m[2].length;
    return m[1] + (n.length < w ? '0'.repeat(w - n.length) + n : n) + m[3];
  }
  const nextName = s => { const M = RT(); try { if (M && typeof M.nextName === 'function') { const r = M.nextName(s); if (typeof r === 'string' && r) return r; } } catch (_) { } return nextNameLocal(s); };
  const loopKey = l => (Array.isArray(l) ? l : []).map(q => (+q[0]).toPrecision(12) + ',' + (+q[1]).toPrecision(12)).sort().join(';');
  const keyOf = r => { const M = RT(); try { if (M && typeof M.key === 'function') { const k = M.key(r); if (k != null) return String(k); } } catch (_) { } return loopKey(r && r.outer); };
  const tw = (h, s) => { try { return textW({ h, s }); } catch (_) { return h * 0.62 * [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 1.55 : 1), 0); } };
  const ptIn = (p, loop) => { const P = loop.map(q => ({ x: q[0], y: q[1] })); try { return inPoly(p, P); } catch (_) { let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-12) + a.x)) ins = !ins; } return ins; } };

  /* ---------- 모양 ---------- */
  if (!document.getElementById('rtagCss')) {
    const st = document.createElement('style'); st.id = 'rtagCss';
    st.textContent = `
.rtgp{position:absolute;left:10px;top:10px;z-index:4;width:min(400px,calc(100% - 20px));pointer-events:none;background:var(--chrome,#191d23);color:var(--ink,#dfe4ea);border:1px solid var(--rule,#2c333d);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.45;box-shadow:0 6px 22px rgba(0,0,0,.4)}
.rtgp h4{margin:0 0 4px;font-size:12px;font-weight:600}
.rtgp .dim{color:var(--ink-dim,#8b95a3)}
.rtgp .sum{margin:2px 0;font-family:var(--mono,monospace)}
.rtgp .row{margin:1px 0;font-family:var(--mono,monospace);color:var(--ink-dim,#8b95a3)}
.rtgp .warn{margin:4px 0 0;padding:4px 7px;border:1px solid var(--tag,#f1c232);border-radius:6px;color:var(--tag,#f1c232)}
.rtgp .fail{margin:4px 0 0;padding:5px 7px;border:1px solid #ff6b6b;border-radius:6px;color:#ff9d9d}
.rtgp .fail button{margin-top:4px}
.rtgp .btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.rtgp button{pointer-events:auto}`;
    document.head.appendChild(st);
  }

  /* ---------- 상태 ---------- */
  let T = null, panel = null;
  function failText(r) {
    const c = r && r.code;
    if (c === 'frame') return '도면 테두리(도곽)를 방으로 잡았습니다 — 방 벽에 틈이 있을 수 있으니 GEOCHECK(선 끝 점검)로 확인하세요';
    if (c === 'open') return '닫힌 방을 찾지 못했습니다 — 벽 끝에 틈이 있으면 GEOCHECK(선 끝 점검)로 먼저 고치세요';
    if (c === 'bad-point') return '선 위를 눌렀습니다 — 방 안쪽을 누르세요';
    if (c === 'too-many') return '객체가 너무 많아 찾지 못했습니다 — S 로 범위를 골라 다시 하세요';
    if (c === 'missing') return String(r.msg);
    if (c === 'error') return '라벨 계산 오류' + (r.msg ? ' — ' + String(r.msg).slice(0, 140) : '');
    return '방을 찾지 못했습니다' + (r && r.msg ? ' — ' + String(r.msg).slice(0, 120) : '');
  }
  const wantGeo = r => r && (r.code === 'open' || r.code === 'frame');
  /* 도곽 의심 미리보기: core 가 frame 결과에 loop·area·text 를 담으면 그것을, 없으면 BOUND 결과(mm²)를 단위로 바꿔 씀 */
  const toLoop = l => Array.isArray(l) && l.length >= 3 ? l.map(q => Array.isArray(q) ? [+q[0], +q[1]] : [+q.x, +q.y]).filter(q => fin(q[0]) && fin(q[1])) : null;
  function frameView(res) {
    const r = res.r || {};
    const loop = toLoop(res.loop) || toLoop(res.outer) || toLoop(r.outer);
    let txt = '';
    if (typeof res.text === 'string' && res.text) txt = res.text;
    else if (fin(+res.area)) txt = (+res.area).toFixed(T.unit === 'mm2' ? 0 : T.dec) + ' ' + uName(T.unit);
    else { const mm = T.islands && fin(+r.net) ? +r.net : +r.area; if (fin(mm)) txt = conv(mm, T.unit, T.dec) + ' ' + uName(T.unit); }
    return { loop, txt, why: typeof res.why === 'string' ? res.why : '', isl: T.islands && Array.isArray(r.islands) ? r.islands : [] };
  }
  const isCmdName = s => { try { const raw = String(s || '').trim(), u = raw.toUpperCase(), k = raw.replace(/\s+/g, ''); return !!((ALIAS[u] && ALIAS[u] !== 'roomtag') || (KO_CMD[k] && KO_CMD[k] !== 'roomtag')); } catch (_) { return false; } };
  const isSelf = s => { try { const raw = String(s || '').trim(); return ALIAS[raw.toUpperCase()] === 'roomtag' || KO_CMD[raw.replace(/\s+/g, '')] === 'roomtag'; } catch (_) { return false; } };
  const FRAME_MSG = '도면 테두리(도곽)를 경계로 잡았을 수 있음 — 틈이면 GEOCHECK. 정말 이 방이면 Y 로 그래도 넣기';
  /* core frameWhy 값별 안내: 'room-island'·'inner-room'(방 안 큰 닫힌 도형) / 'open-chain'(끊긴 선 묶음) / 'islands'·'many'·그 밖(도곽 문구) */
  const frameMsg = why => why === 'room-island' || why === 'inner-room' ? '방 안에 2 m² 넘는 닫힌 도형(탱크·기둥·작은 방?)이 있어 확인합니다 — 이 방이 맞으면 Y'
    : why === 'open-chain' ? '방 안에 끊긴 선 묶음(틈 난 벽 또는 선으로 그린 가구)이 있음 — 틈이면 GEOCHECK, 가구면 Y'
    : FRAME_MSG;
  const frameTag = why => why === 'room-island' || why === 'inner-room' || why === 'open-chain' ? '확인?' : '도곽?';
  /* 경계에 호가 들어간 결과(≈): core 의 approx(curvy) 를 먼저, 없으면 글자의 ≈ */
  const ARC_MSG = '경계에 호(문 열림 등)가 들어감 — 문 층을 끄고 다시 하면 정확';
  const isArc = L => L && (L.approx === true || (L.approx == null && /≈/.test(String(L.text || ''))));
  /* 라벨 층 상태: 꺼짐·동결·잠김이면 만들지 않음 (층이 없으면 core 가 새로 만듦 = 문제 없음) */
  function layerBad(name) {
    try {
      const L = typeof layerOf === 'function' ? layerOf(name) : null;
      if (!L) return null;
      if (L.visible === false) return '꺼져 있습니다';
      if (L.frozen) return '동결돼 있습니다';
      if (L.locked) return '잠겨 있습니다';
    } catch (_) { }
    return null;
  }
  /* 이미 라벨 있는 방 = 라벨 층의 글자 중 기준점이 경계 안(섬 안 제외)인 것 */
  function hasLabel(r, layer) {
    const M = RT(); if (M && typeof M.tagged === 'function') { try { return !!M.tagged(r, layer); } catch (_) { } }
    try {
      for (const e of doc.entities) {
        if (!e || e.type !== 'text' || e.layer !== layer || !e.p || !fin(e.p.x)) continue;
        if (!ptIn(e.p, r.outer)) continue;
        if ((r.islands || []).some(lp => ptIn(e.p, lp))) continue;
        return true;
      }
    } catch (_) { }
    return false;
  }
  const atOpt = () => { const o = { islands: !!(T && T.islands) }; try { o.near = 3 / view.s; } catch (_) { o.near = 0; } return o; };
  const lblOpt = (p, name, frameOk) => ({ name, frameOk: !!frameOk, unit: T.unit, dec: T.dec, islands: !!T.islands, h: T.h, ah: T.ah, layer: T.layer, pick: [p.x, p.y], p: { x: p.x, y: p.y } });
  /* 한 점 계산: BOUND.at → ROOMTAG.label. 실패는 {ok:false, code, msg} */
  function calc(p, name, frameOk) {
    const Bm = B(); if (!Bm) return { ok: false, code: 'missing', msg: '경계 모듈(bound-core.js)이 아직 없습니다' };
    const M = RT(); if (!M) return { ok: false, code: 'missing', msg: '라벨 모듈(roomtag-core.js)이 아직 없습니다' };
    let r; try { r = Bm.at({ x: p.x, y: p.y }, atOpt()); } catch (e) { r = { ok: false, code: 'error', msg: e && e.message }; }
    if (!r || typeof r !== 'object') return { ok: false, code: 'error', msg: '경계 결과 없음' };
    if (!r.ok) return r;
    if (!(Array.isArray(r.outer) && r.outer.length >= 3)) return { ok: false, code: 'error', msg: '경계 결과 모양이 다름' };
    let L; try { L = M.label(r, lblOpt(p, name, frameOk)); } catch (e) { L = { ok: false, code: 'error', msg: e && e.message }; }
    if (!L || typeof L !== 'object') return { ok: false, code: 'error', msg: '라벨 결과 없음' };
    if (!L.ok) return L.code === 'frame' ? Object.assign({}, L, { r }) : L;
    if (!L.at || !fin(+L.at.x) || !fin(+L.at.y) || typeof L.text !== 'string') return { ok: false, code: 'error', msg: '라벨 결과 모양이 다름' };
    return { ok: true, r, L };
  }
  const redraw = () => { try { dirty = true; } catch (_) { } };
  /* 섬 안내: islandsOff = { n, area(라벨 단위 값 — core 와 같은 단위) }. 값이 없으면 BOUND 결과(mm²)를 바꿔 씀 */
  const isoText = (k) => {
    const io = k.L.islandsOff || {}, r = k.r;
    const n = fin(+io.n) ? +io.n : (Array.isArray(r.islands) ? r.islands.length : 0);
    if (!n) return '';
    const v = fin(+io.area) ? (+io.area).toFixed(T.unit === 'mm2' ? 0 : T.dec) : conv(r.islandArea, T.unit, T.dec);
    return T.islands ? `섬 ${n}개 −${v} ${uName(T.unit)} 뺌` : `섬 ${n}개(${v} ${uName(T.unit)}) 안 뺌 — I 로 켜면 뺌`;
  };
  function sumText() {
    let tot = 0, approx = false, big = 0;
    for (const k of T.picks) { const a = +k.L.area; if (fin(a)) tot += a; if (k.L.approx === true || /≈/.test(k.L.text)) approx = true; if (k.L.fits === false) big++; }
    const d = T.unit === 'mm2' ? 0 : T.dec;
    return { t: `방 ${T.picks.length}개 · 합계 ${approx ? '≈' : ''}${tot.toFixed(d)} ${uName(T.unit)}`, big };
  }
  /* 미리보기 글자 상자(도면 좌표) — 약속 배치: 이름 기준선 at.y+0.25h, 면적 기준선 at.y−1.05h, 가운데 맞춤 */
  function boxes(k) {
    const h = T.h, ah = T.ah * h, a = k.L.at;
    const wn = tw(h, k.name), wa = tw(ah, k.L.text);
    return [
      { x0: a.x - wn / 2, y0: a.y + 0.25 * h, x1: a.x + wn / 2, y1: a.y + 1.25 * h, s: k.name, h, by: a.y + 0.25 * h },
      { x0: a.x - wa / 2, y0: a.y - 1.05 * h, x1: a.x + wa / 2, y1: a.y - 1.05 * h + ah, s: k.L.text, h: ah, by: a.y - 1.05 * h }
    ];
  }

  /* ---------- 창(화면 위 작은 판) ---------- */
  function closePanel() { if (panel) { try { panel.remove(); } catch (_) { } panel = null; } }
  const refocus = () => { try { cmdIn.focus({ preventScroll: true }); } catch (_) { } };
  function paint() {
    if (!T) { closePanel(); return; }
    const host = document.getElementById('view') || document.body;
    if (!panel || !panel.isConnected) { panel = el('div', 'rtgp'); panel.setAttribute('role', 'status'); host.appendChild(panel); }
    panel.textContent = '';
    panel.appendChild(el('h4', null, '방 이름·면적 라벨 (ROOMTAG)'));
    panel.appendChild(el('div', 'dim', `방 안쪽을 누르세요 · 다음 이름 "${T.next}" (글자를 치면 바꿈) · Enter 만들기 · Esc 취소 · U 마지막 방 빼기`));
    panel.appendChild(el('div', 'dim', `라벨 층 "${T.layer}" · 이름 높이 ${T.h} · 면적 높이 ${Math.round(T.ah * T.h * 100) / 100} · 고정 글자 — 벽을 고치면 다시 하세요`));
    panel.appendChild(el('div', 'dim', '블록 안 벽은 층이 꺼져 있어도 경계로 씀 · 다른 명령(LINE 등)을 치면 이 도구를 끝내고 넘어감 · 명령 이름과 같은 방 이름은 앞에 \' 를 붙임'));
    if (T.islands) panel.appendChild(el('div', 'dim', '섬 빼기 켬: 닫힌 폴리선·원 기둥만 섬으로 빠짐 (선 4개로 그린 기둥은 안 빠짐)'));
    const lb = layerBad(T.layer);
    if (lb) panel.appendChild(el('div', 'warn', `라벨 층 "${T.layer}" 이 ${lb} — 층을 켜거나 풀어야 만들 수 있습니다`));
    if (T.picks.length) {
      const s = sumText();
      panel.appendChild(el('div', 'sum', s.t));
      T.picks.forEach((k, i) => {
        if (i >= 8) { if (i === 8) panel.appendChild(el('div', 'row', `… 방 ${T.picks.length - 8}개 더`)); return; }
        const it = isoText(k);
        panel.appendChild(el('div', 'row', `${i + 1}) ${k.name} · ${k.L.text}` + (it ? ' · ' + it : '') + (k.frameOk ? ' · 확인 뒤 Y 로 넣음' : '')));
        if (isArc(k.L)) panel.appendChild(el('div', 'warn', `${i + 1}) ${ARC_MSG}`));
        if (k.L.fits === false) panel.appendChild(el('div', 'warn', `${i + 1}) 글자가 방보다 큼 — 가장 넓은 자리에 넣습니다 (H=값 으로 글자 높이 줄이기)`));
      });
    }
    if (T.info) panel.appendChild(el('div', 'warn', T.info));
    if (T.pend) {
      const w = el('div', 'warn'); w.appendChild(el('div', null, (T.pend.txt ? `잡힌 면적 ${T.pend.txt} (점선) — ` : '') + frameMsg(T.pend.why)));
      const bb = el('div', 'btns');
      const bY = el('button', 'tbtn', '그래도 넣기 (Y)'); bY.onclick = () => { if (T) acceptFrame(T); try { setPrompt(tool ? tool.prompt : '명령:'); } catch (_) { } refocus(); };
      bb.appendChild(bY);
      if (geoOK()) { const bG = el('button', 'tbtn', '선 끝 점검 열기'); bG.onclick = () => { try { endTool(); } catch (_) { } try { startTool('geocheck'); } catch (_) { note('선 끝 점검을 열지 못했습니다'); } }; bb.appendChild(bG); }
      w.appendChild(bb); panel.appendChild(w);
    }
    if (T.fail) {
      const f = el('div', 'fail'); f.appendChild(el('div', null, failText(T.fail)));
      if (wantGeo(T.fail) && geoOK()) {
        const b = el('button', 'tbtn', '선 끝 점검 열기');
        b.onclick = () => { try { endTool(); } catch (_) { } try { startTool('geocheck'); } catch (_) { note('선 끝 점검을 열지 못했습니다'); } };
        f.appendChild(b);
      }
      panel.appendChild(f);
    }
    const btns = el('div', 'btns');
    const bU = el('button', 'tbtn', `단위(M): ${uName(T.unit)}`);
    bU.onclick = () => { toggleUnit(); refocus(); };
    const bI = el('button', 'tbtn', `섬 빼기(I): ${T.islands ? '켬' : '끔'}`);
    bI.onclick = () => { toggleIslands(); refocus(); };
    const bOk = el('button', 'tbtn primary', '만들기 (Enter)'); bOk.disabled = !T.picks.length;
    bOk.onclick = () => { if (T) T.onEnter(); try { setPrompt(tool ? tool.prompt : '명령:'); } catch (_) { } refocus(); };
    const bX = el('button', 'tbtn', '취소 (Esc)');
    bX.onclick = () => { try { log('*취소*'); endTool(); } catch (_) { } refocus(); };
    btns.append(bU, bI, bOk, bX);
    panel.appendChild(btns);
  }

  /* ---------- 미리보기 그리기 (render 를 한 번만 감쌈) ---------- */
  try {
    const _rRtg = render;
    render = function () {
      _rRtg.apply(this, arguments);
      if (T && tool !== T) { T = null; closePanel(); }
      if (!T) return;
      try {
        const c = ctx2; c.save(); c.setTransform(DPR, 0, 0, DPR, 0, 0);
        const path = pts => { c.beginPath(); pts.forEach((q, j) => { const s = S({ x: q[0], y: q[1] }); j ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); }); c.closePath(); };
        T.picks.forEach(k => {
          const r = k.r;
          c.setLineDash([6, 4]);
          c.fillStyle = 'rgba(241,194,50,.08)'; path(r.outer); c.fill();
          c.lineWidth = 1.6; c.strokeStyle = 'rgba(241,194,50,.9)'; path(r.outer); c.stroke();
          if (T.islands) (r.islands || []).forEach(lp => { c.lineWidth = 1.2; c.strokeStyle = 'rgba(110,200,255,.9)'; path(lp); c.stroke(); });
          const col = k.L.fits === false ? '#ff6b6b' : '#7fd6ff';
          for (const b of boxes(k)) {
            const p0 = S({ x: b.x0, y: b.y1 }), p1 = S({ x: b.x1, y: b.y0 });
            c.setLineDash([4, 3]); c.lineWidth = 1.2; c.strokeStyle = col; c.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
            const px = b.h * view.s;
            if (px >= 5) {
              const q = S({ x: (b.x0 + b.x1) / 2, y: b.by });
              c.setLineDash([]); c.font = `${Math.min(200, px).toFixed(1)}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
              c.fillStyle = col; c.globalAlpha = 0.85; c.fillText(b.s, q.x, q.y); c.globalAlpha = 1;
            }
          }
        });
        if (T.pend && T.pend.loop) {
          const pl = T.pend.loop;
          c.setLineDash([8, 5]); c.fillStyle = 'rgba(255,140,60,.07)'; path(pl); c.fill();
          c.lineWidth = 2; c.strokeStyle = 'rgba(255,140,60,.95)'; path(pl); c.stroke();
          T.pend.isl.forEach(lp => { c.lineWidth = 1.2; c.strokeStyle = 'rgba(110,200,255,.9)'; path(lp); c.stroke(); });
          if (T.pend.txt) { const s = S(T.pend.p); c.setLineDash([]); c.font = '600 13px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)'; const tg = frameTag(T.pend.why) + ' ' + T.pend.txt; c.strokeText(tg, s.x, s.y - 9); c.fillStyle = '#ff8c3c'; c.fillText(tg, s.x, s.y - 9); }
        }
        if (T.failAt) { const s = S(T.failAt); c.setLineDash([]); c.lineWidth = 2; c.strokeStyle = '#ff5b5b'; c.beginPath(); c.moveTo(s.x - 6, s.y - 6); c.lineTo(s.x + 6, s.y + 6); c.moveTo(s.x + 6, s.y - 6); c.lineTo(s.x - 6, s.y + 6); c.stroke(); }
        c.restore();
      } catch (_) { }
    };
  } catch (_) { }

  /* 옵션이 바뀌면 고른 방을 모두 다시 계산 (실패한 것은 빼고 알림) */
  function recalc(why) {
    const keep = [], lost = [];
    for (const k of T.picks) { const q = calc(k.p, k.name, k.frameOk); if (q.ok) keep.push(Object.assign({}, k, { r: q.r, L: q.L, key: keyOf(q.r) })); else lost.push(k.name); }
    T.picks = keep;
    if (lost.length) note(`${why}: 다시 계산하지 못한 방 ${lost.length}개를 뺐습니다`);
  }
  function toggleUnit() { if (!T) return; T.pend = null; T.unit = T.unit === 'mm2' ? 'm2' : 'mm2'; recalc('단위 변경'); say(`방 라벨: 단위 ${uName(T.unit)}`, 'ok'); paint(); redraw(); }
  function toggleIslands() { if (!T) return; T.pend = null; T.islands = !T.islands; recalc('섬 빼기 변경'); say(`방 라벨: 섬 빼기(I) ${T.islands ? '켬 — 닫힌 기둥 면적을 뺌' : '끔'}`, 'ok'); paint(); redraw(); }
  function setH(v) { if (!T) return false; T.pend = null; if (!(fin(v) && v > 0 && v < 1e6)) { say('글자 높이는 0보다 큰 수입니다 (예: H=300)', 'err'); return true; } T.h = v; recalc('글자 높이 변경'); say(`방 라벨: 이름 글자 높이 ${v}`, 'ok'); paint(); redraw(); return true; }

  /* 계산된 방을 목록에 넣음: 같은 경계·이미 라벨 있는 방은 빼고 안내 */
  function addPick(t, q, res, frameOk) {
    const key = keyOf(res.r), dup = t.picks.findIndex(k => k.key === key);
    if (dup >= 0) {
      t.info = `${dup + 1}) "${t.picks[dup].name}" 과 같은 경계입니다 — 이번 클릭은 뺐습니다. 다른 방이라면 문·틈으로 이어졌을 수 있음 (문 자리에 선을 긋거나 GEOCHECK)`;
      say(t.info, 'err'); paint(); return;
    }
    if (hasLabel(res.r, t.layer)) {
      t.info = `이미 "${t.layer}" 층 라벨이 있는 방 — 건너뜀`;
      say(t.info, 'err'); paint(); return;
    }
    const k = { p: { x: q.x, y: q.y }, r: res.r, L: res.L, name: t.next, key, frameOk: !!frameOk };
    t.picks.push(k); t.next = nextName(k.name);
    const it = isoText(k);
    say(`방 라벨 ${t.picks.length}) ${k.name} · ${k.L.text}` + (it ? ' · ' + it : '') + (frameOk ? ' · 확인 뒤 Y 로 넣음' : ''), 'ok');
    if (isArc(k.L)) say(`알림: "${k.name}" ${ARC_MSG}`, 'err');
    if (k.L.fits === false) say(`경고: "${k.name}" 글자가 방보다 큼 — 가장 넓은 자리에 넣습니다`, 'err');
    paint(); redraw();
  }
  /* Y: 도곽 의심(frame)으로 멈춘 그 방만 frameOk:true 로 다시 계산해 넣음 */
  function acceptFrame(t) {
    const pd = t.pend; if (!pd) { say('그래도 넣을 방이 없습니다', 'err'); return; }
    t.pend = null; t.failAt = null; t.info = '';
    const res = calc(pd.p, t.next, true);
    if (!res.ok) { t.fail = res; t.failAt = pd.p; say(failText(res), 'err'); paint(); redraw(); return; }
    t.fail = null;
    addPick(t, pd.p, res, true);
  }

  function makeTool() {
    const D = defs();
    const t = {
      name: 'roomtag', wantsPoint: false, picks: [], fail: null, failAt: null, info: '', pend: null,
      next: String(D.name || '방 1'), unit: D.unit === 'mm2' ? 'mm2' : 'm2', dec: fin(+D.dec) ? Math.max(0, Math.min(6, Math.round(+D.dec))) : 2,
      islands: false, h: fin(+D.h) && +D.h > 0 ? +D.h : 250, ah: fin(+D.ah) && +D.ah > 0 ? +D.ah : 0.7, layer: String(D.layer || '방이름'),
      wantsText() { return true; }, // 한글 이름이 영문 자판으로 바뀌지 않게
      get prompt() { return `방 안쪽 클릭 또는 [이름 입력 <${t.next}> / 단위(M) ${uName(t.unit)} / 섬(I) ${t.islands ? '켬' : '끔'} / 빼기(U)${t.pend ? ' / 그래도 넣기(Y)' : ''}] — ${t.picks.length ? `방 ${t.picks.length}개 · Enter 만들기` : 'Enter 끝'}:`; }, set prompt(v) { },
      onInput(s) {
        const raw = String(s || '').trim(); if (!raw) return false;
        let u = raw.toUpperCase();
        if (/^[ㄱ-ㅎㅏ-ㅣ]$/.test(raw)) { try { u = ko2en(raw).toUpperCase(); } catch (_) { } } // 한글 자판으로 친 I·U·M
        if (u === 'Y' && t.pend) { acceptFrame(t); return true; }
        if (u === 'I') { toggleIslands(); return true; }
        if (u === 'M') { toggleUnit(); return true; }
        if (u === 'U') {
          t.pend = null; if (t.picks.length) { const k = t.picks.pop(); t.next = k.name; t.fail = null; t.failAt = null; t.info = ''; say(`방 라벨: "${k.name}" 을 뺐습니다`); }
          else say('뺄 방이 없습니다', 'err');
          paint(); redraw(); return true;
        }
        const mh = raw.match(/^H\s*[=\s]\s*([\d.]+)$/i); if (mh) return setH(+mh[1]);
        if (raw[0] === "'" && raw.length > 1) { const nm = raw.slice(1).trim(); if (nm && nm.length <= 60) { t.next = nm; t.info = ''; say(`방 라벨: 다음 방 이름 "${nm}" (그 뒤로 자동 번호)`, 'ok'); paint(); } return true; }
        if (isSelf(raw)) { say('이미 방 라벨 도구 중입니다', 'err'); return true; }
        if (isCmdName(raw)) {
          // 다른 명령 이름(LINE·L·선 등)은 방 이름으로 받지 않음 — 이 도구를 끝내고 그 명령으로 넘김 (고른 방은 만들지 않음)
          const n = t.picks.length;
          try { log('*취소*'); } catch (_) { }
          if (n) say(`방 라벨: 고른 방 ${n}개는 만들지 않고 끝냈습니다`, 'err');
          try { endTool(); } catch (_) { }
          setTimeout(() => { try { handleCommandText(raw); } catch (_) { } }, 0);
          return true;
        }
        // 좌표(2000,1500 · @100,0 · @100<30)는 점으로 넘김
        if (/^@?\s*-?[\d.]+\s*[,<]/.test(raw)) return false;
        if (raw.length > 60) { say('이름은 60자까지입니다', 'err'); return true; }
        t.next = raw; t.info = '';
        say(`방 라벨: 다음 방 이름 "${raw}" (그 뒤로 자동 번호)`, 'ok');
        paint(); return true;
      },
      onPoint(p) {
        let q = p;
        try { if (p === cursor && rawW && fin(rawW.x)) q = rawW; } catch (_) { } // 클릭은 스냅 전 점, 입력은 그대로
        if (!q || !fin(q.x) || !fin(q.y)) return;
        const res = calc(q, t.next, false);
        t.info = ''; t.pend = null;
        if (!res.ok && res.code === 'frame') { const fv = frameView(res); t.pend = Object.assign({ p: { x: q.x, y: q.y } }, fv); t.fail = null; t.failAt = { x: q.x, y: q.y }; say((fv.txt ? `잡힌 면적 ${fv.txt} — ` : '') + frameMsg(fv.why), 'err'); paint(); redraw(); return; }
        if (!res.ok) { t.fail = res; t.failAt = { x: q.x, y: q.y }; say(failText(res), 'err'); paint(); redraw(); return; }
        t.fail = null; t.failAt = null;
        addPick(t, q, res, false);
      },
      onEnter() {
        if (!t.picks.length) { endTool(); return; }
        if (!hasCmd()) { note('방 라벨 명령(roomtag-core.js)이 아직 없습니다. 새로고침 뒤 다시 해 주세요.'); return; }
        const lb = layerBad(t.layer);
        if (lb) { note(`라벨 층 "${t.layer}" 이 ${lb} — 아무것도 만들지 않았습니다 (층을 켜거나 푼 뒤 Enter)`); paint(); return; }
        let big = t.picks.filter(k => k.L.fits === false).length;
        const cmd = {
          cmd: 'roomtag',
          rooms: t.picks.map(k => Object.assign({ pick: [k.p.x, k.p.y], name: k.name, key: k.key }, k.frameOk ? { frameOk: true } : {})),
          unit: t.unit, dec: t.dec, islands: !!t.islands, h: t.h, layer: t.layer
        };
        const sum = sumText().t;
        let u0 = -1; try { u0 = undoStack.length; } catch (_) { }
        let R = null; try { R = runBatch([cmd], { label: LABEL }); } catch (e) { R = { ok: false, errors: [e && e.message] }; }
        if (!R || !R.ok) {
          try { if (u0 >= 0 && undoStack.length > u0) { doc = JSON.parse(undoStack.pop()); changed(); } } catch (_) { }
          const m = R && R.errors && R.errors[0] ? String(R.errors[0]).replace(/^#\d+ \w+: /, '').slice(0, 160) : '';
          note('라벨을 만들지 못했습니다' + (m ? ' — ' + m : '') + ' · 도면은 그대로입니다');
          return;
        }
        const r0 = (R.results && R.results[0]) || {};
        const n = fin(+r0.n) ? +r0.n : t.picks.length;
        if (fin(+r0.unfit)) big = +r0.unfit;
        const skp = Array.isArray(r0.skipped) ? r0.skipped.length : 0;
        const arcN = t.picks.filter(k => isArc(k.L)).length;
        say(`방 라벨: ${n}개 방에 이름·면적 글자 — ${sum}` + (arcN ? ` · ≈ ${arcN}개: ${ARC_MSG}` : '') + (skp ? ` · 같은 경계로 빠진 방 ${skp}개(문·틈으로 이어졌을 수 있음)` : '') + (big ? ` · 글자가 방보다 큼 ${big}개` : '') + ' · 고정 글자(벽을 고치면 다시) · 되돌리기(Ctrl+Z) 한 번에 원래대로', 'ok');
        endTool();
      }
    };
    return t;
  }

  /* ---------- 명령 등록 ---------- */
  TOOLS.roomtag = () => {
    evt('ROOMTAG');
    if (!B()) note('경계 모듈(bound-core.js)이 아직 없습니다 — 방을 찾지 못합니다');
    else if (!RT()) note('라벨 모듈(roomtag-core.js)이 아직 없습니다 — 방을 찾지 못합니다');
    T = makeTool();
    setTimeout(() => { if (T && tool === T) { paint(); const lb = layerBad(T.layer); if (lb) note(`라벨 층 "${T.layer}" 이 ${lb}`); } }, 0);
    return T;
  };
  for (const a of ['ROOMTAG', 'RTAG']) if (!(a in ALIAS)) ALIAS[a] = 'roomtag';
  if (typeof CMD_KO === 'object' && !CMD_KO.roomtag) CMD_KO.roomtag = LABEL;
  if (typeof KO_CMD === 'object') for (const k of ['방이름', '면적라벨']) if (!(k in KO_CMD)) KO_CMD[k] = 'roomtag';

  window.ROOMTAG_UI = {
    ver: 1,
    state: () => (T && tool === T ? { n: T.picks.length, pend: !!T.pend, frameOk: T.picks.map(k => !!k.frameOk), next: T.next, unit: T.unit, islands: !!T.islands, h: T.h, fail: T.fail ? T.fail.code : null, info: T.info, names: T.picks.map(k => k.name), texts: T.picks.map(k => k.L.text) } : null)
  };
})();
