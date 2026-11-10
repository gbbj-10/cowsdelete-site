/* 번호 자동 매기기(TCOUNT) 계산 모듈 — AI 팀 9회차 개발1 (2026-11-10)
   계산만 한다. 화면·명령 이름 등록(TOOLS·ALIAS·KO_CMD·CMD_KO)은 tcount-ui.js(개발2). 여기서는 COMMANDS.tcount 하나만 더한다.
   약속(r9/04 시작회의 결정):
     window.TCOUNT = { ver:1,
       pickTexts(ids) -> { texts:[ent], skipped:{ other, locked, off, block, attr, table, dim } },
       order(texts, by) -> 새 배열(원본 안 바꿈)   by: 'y' | 'x' | 'sel'
       plan(texts, opt) -> { rows:[{id, before, after}], unchanged:[id], first, last }   잘못된 입력은 throw
     }
     COMMANDS.tcount = c{ ids:[...]|'selection', by?, start?, step?, mode?, sep?, expect? } -> { ids, n, first, last, skipped, unchanged }
   대상 / 빠지는 것 (pickTexts)
   - 대상 = type 'text'(한 줄 문자, 여러 줄 문자 mt 포함)만. 꺼진(visible:false)·얼린(frozen) 층 → skipped.off, 잠긴 층 → skipped.locked
     (화면 선택은 원래 못 고르지만 AI·JSON 경로로는 들어오므로 여기서 doc.layers 로 직접 막는다)
   - 한 객체는 한 칸에만 센다(skipped 합계 = 뺀 객체 수). 속성(attrs) 있는 insert → skipped.attr, 속성 없는 insert → skipped.block
   - table → skipped.table, dim(치수·벌룬) → skipped.dim, 나머지·없는 id → skipped.other. 속성·표 칸·치수 글자는 절대 안 바꾼다.
   순서 규칙 (10회차 TEXTALIGN 도 같은 규칙을 "복사"해 씀 — 코드를 서로 묶지 않음. 이 문단을 바꾸지 말 것)
   - 기준 y(ky) = 여러 줄 문자(mt)면 p.y − h(넣는 점이 글자 위쪽), 아니면 p.y(밑줄). 기준 x = p.x. h 없거나 0 이하면 2.5. 회전·맞춤은 무시.
   - by 'y'(위→아래, 줄 안 왼→오른): ky 큰 순(같으면 x 작은 순, 그다음 넘겨준 순서)으로 한 번 정렬한 뒤 위에서부터 훑어
     줄을 묶는다. 줄의 기준 = 줄 첫 글자. 줄 첫 글자 f 와 다음 글자 g 의 차 ky(f)−ky(g) ≤ 0.5 × min(h(f), h(g)) 면 같은 줄,
     아니면 g 가 새 줄의 첫 글자. 줄 안은 x 작은 순(같으면 ky 큰 순, 그다음 넘겨준 순서).
   - by 'x'(왼→오른, 열 안 위→아래): x 작은 순으로 정렬 → 열 첫 글자 기준 x 차 ≤ 0.5 × min(h) 면 같은 열 → 열 안은 ky 큰 순.
   - 허용값은 정렬 비교 함수 안에 넣지 않는다(A~B, B~C, A≁C 일 때 결과가 엔진마다 달라짐). 경계값(차 = 허용값)은 같은 줄.
   - by 'sel' = 넘겨준 순서 그대로.
   번호 (plan)
   - start: '1' | '001' | number. 문자열 우선(AI 가 001 을 숫자 1 로 보내면 채움이 사라짐). 정수부가 0 으로 시작하고 두 자리 이상이면
     그 길이만큼 0 채움, 넘치면 자르지 않음(999 → 1000). 음수는 채움 없이 '-3'. 소수는 자릿수 = max(시작, 증가)로 정수 계산(0.6000000001 없음).
   - step: 0 이 아닌 수. 거부(throw): 증가 0, 음수+채움('-01'), 숫자 아닌 시작값, 소수 10자리 넘음, 안전 정수 범위 넘음.
   - mode O: 글자 전체를 번호로 · P: 번호+sep+글자 · U: 글자+sep+번호 · F: 글자 안 '#' 전부를 같은 번호로
     ('#' 없는 글자는 unchanged 로, 번호를 쓰지 않음). sep 기본 '-'.
   COMMANDS.tcount: 없는 id·expect 불일치·대상 0·잘못된 입력이면 아무것도 안 바꾸고 throw. 다 계산한 뒤에만 e.s 를 바꾼다.
   expect: {id: '옛 글자'} 또는 {id: {s, p:{x,y}, layer}} — 있는 항목만 비교. 대상 글자가 expect 에 없거나 expect 의 id 가 지워졌어도 throw.
   이 파일은 log·toast·사용 기록을 남기지 않는다(도면 글자를 어디에도 보내지 않음). */
(function () {
  'use strict';
  if (typeof COMMANDS !== 'object' || !COMMANDS) return;
  const DEF_H = 2.5, EPS = 1e-9, MAX_DEC = 10;
  const STALE = '글자가 바뀌었습니다 — 다시 TCOUNT 하세요';
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const hOf = (e) => (fin(e.h) && e.h > 0 ? e.h : DEF_H);
  const kyOf = (e) => { const y = e.p && fin(e.p.y) ? e.p.y : 0; return e.mt ? y - hOf(e) : y; };
  const kxOf = (e) => (e.p && fin(e.p.x) ? e.p.x : 0);
  const layerState = () => { const m = new Map(); for (const l of (doc.layers || [])) if (l && !m.has(l.name)) m.set(l.name, l); return m; };
  const entMap = () => { const m = new Map(); for (const e of doc.entities) m.set(e.id, e); return m; };
  const selIds = () => (sel && typeof sel[Symbol.iterator] === 'function' ? Array.from(sel) : []);
  const idList = (ids) => {
    if (ids === 'selection') return selIds();
    if (!Array.isArray(ids)) throw new Error("ids(객체 id 목록 또는 'selection')가 필요합니다");
    return ids;
  };

  function pickIn(ids, map) {
    const L = layerState(), texts = [], seen = new Set();
    const skipped = { other: 0, locked: 0, off: 0, block: 0, attr: 0, table: 0, dim: 0 };
    for (const id of ids) {
      if (seen.has(id)) continue; seen.add(id);
      const e = map.get(id);
      if (!e) { skipped.other++; continue; }
      if (e.type !== 'text') {
        if (e.type === 'insert') { if (e.attrs && typeof e.attrs === 'object' && Object.keys(e.attrs).length) skipped.attr++; else skipped.block++; }
        else if (e.type === 'table') skipped.table++;
        else if (e.type === 'dim') skipped.dim++;
        else skipped.other++;
        continue;
      }
      const l = L.get(e.layer == null ? '0' : e.layer);
      if (l && (l.visible === false || l.frozen)) { skipped.off++; continue; }
      if (l && l.locked) { skipped.locked++; continue; }
      texts.push(e);
    }
    return { texts, skipped };
  }
  function pickTexts(ids) { return pickIn(idList(ids), entMap()); }

  /* 한 번 정렬 → 첫 글자 기준으로 묶기 → 묶음 안 정렬 (규칙은 맨 위 주석) */
  function order(texts, by) {
    if (!Array.isArray(texts)) throw new Error('texts(글자 목록)가 필요합니다');
    const b = normBy(by), n = texts.length;
    if (b === 'sel' || n < 2) return texts.slice();
    const kx = new Float64Array(n), ky = new Float64Array(n), h = new Float64Array(n), idx = new Array(n);
    for (let i = 0; i < n; i++) { const e = texts[i]; kx[i] = kxOf(e); ky[i] = kyOf(e); h[i] = hOf(e); idx[i] = i; }
    const yFirst = (a, c) => (ky[c] - ky[a]) || (kx[a] - kx[c]) || (a - c);   // ky 큰 순 → x 작은 순 → 넘겨준 순
    const xFirst = (a, c) => (kx[a] - kx[c]) || (ky[c] - ky[a]) || (a - c);   // x 작은 순 → ky 큰 순 → 넘겨준 순
    const main = b === 'y' ? yFirst : xFirst, inner = b === 'y' ? xFirst : yFirst;
    const gap = b === 'y' ? (f, g) => ky[f] - ky[g] : (f, g) => kx[g] - kx[f];
    idx.sort(main);
    const out = new Array(n); let k = 0, s = 0;
    const flush = (end) => { const grp = idx.slice(s, end); if (grp.length > 1) grp.sort(inner); for (const i of grp) out[k++] = texts[i]; s = end; };
    for (let j = 1; j < n; j++) {
      const f = idx[s], g = idx[j], tol = 0.5 * Math.min(h[f], h[g]);
      const ref = b === 'y' ? ky[f] : kx[f];
      if (!(gap(f, g) <= tol + EPS * Math.max(1, Math.abs(ref)))) flush(j);
    }
    flush(n);
    return out;
  }
  function normBy(by) {
    const v = by == null || by === '' ? 'y' : String(by).toLowerCase();
    if (v === 'y') return 'y';
    if (v === 'x') return 'x';
    if (v === 'sel' || v === 's') return 'sel';
    throw new Error("순서(by)는 'y'(위→아래) · 'x'(왼→오른) · 'sel'(고른 순서) 중 하나입니다");
  }

  /* 숫자 글자 → {neg, int, frac} (지수 표기·기호는 거부) */
  const NUM_RE = /^([+-]?)(\d+)(?:\.(\d+))?$/;
  function parseNum(v, what) {
    if (typeof v === 'number') { if (!fin(v)) throw new Error(what + '는 숫자로 입력하세요'); v = String(v); }
    if (typeof v !== 'string') throw new Error(what + '는 숫자로 입력하세요');
    const m = NUM_RE.exec(v.trim());
    if (!m) throw new Error(what + '는 숫자로 입력하세요 (예: 1, 001, 10, 0.5)');
    return { neg: m[1] === '-', int: m[2], frac: m[3] || '' };
  }
  function makeNumbers(opt) {
    const st = parseNum(opt.start == null || opt.start === '' ? '1' : opt.start, '시작 번호');
    const sp = parseNum(opt.step == null || opt.step === '' ? 1 : opt.step, '증가');
    const pad = st.int.length > 1 && st.int[0] === '0' ? st.int.length : 0;
    if (pad && st.neg) throw new Error('음수 시작 번호에는 0 채우기(예: -01)를 쓸 수 없습니다');
    const d = Math.max(st.frac.length, sp.frac.length);
    if (d > MAX_DEC) throw new Error('소수 자릿수는 ' + MAX_DEC + '자리까지입니다');
    const scaled = (q) => { const v = Number(q.int + q.frac.padEnd(d, '0')); return q.neg ? -v : v; };
    const base = scaled(st), inc = scaled(sp);
    if (!Number.isSafeInteger(base) || !Number.isSafeInteger(inc)) throw new Error('번호가 너무 큽니다');
    if (inc === 0) throw new Error('증가는 0 이 아니어야 합니다 (모두 같은 번호가 됨)');
    const fmt = (i) => {
      const v = base + i * inc;
      if (!Number.isSafeInteger(v)) throw new Error('번호가 너무 큽니다');
      const neg = v < 0, digits = String(Math.abs(v)).padStart(d + 1, '0');
      let ip = d ? digits.slice(0, digits.length - d) : digits; const fp = d ? digits.slice(digits.length - d) : '';
      if (!neg && pad) ip = ip.padStart(pad, '0');
      return (neg ? '-' : '') + ip + (d ? '.' + fp : '');
    };
    return fmt;
  }
  function normMode(m) {
    const v = m == null || m === '' ? 'O' : String(m).toUpperCase();
    if (v === 'O' || v === 'P' || v === 'U' || v === 'F') return v;
    throw new Error("넣는 방법(mode)은 'O'(바꾸기) · 'P'(앞에 붙이기) · 'U'(뒤에 붙이기) · 'F'(# 자리) 중 하나입니다");
  }

  function plan(texts, opt) {
    if (!Array.isArray(texts)) throw new Error('texts(글자 목록)가 필요합니다');
    opt = opt || {};
    const mode = normMode(opt.mode), fmt = makeNumbers(opt);
    const sep = opt.sep == null ? '-' : String(opt.sep);
    if (sep.length > 20) throw new Error('구분자(sep)는 20자까지입니다');
    const rows = [], unchanged = []; let first = null, last = null, i = 0;
    for (const e of texts) {
      const before = e.s == null ? '' : String(e.s);
      if (mode === 'F' && before.indexOf('#') < 0) { unchanged.push(e.id); continue; }
      const no = fmt(i++);
      const after = mode === 'O' ? no : mode === 'P' ? no + sep + before : mode === 'U' ? before + sep + no : before.split('#').join(no);
      rows.push({ id: e.id, before, after });
      if (first === null) first = no; last = no;
    }
    return { rows, unchanged, first, last };
  }

  const near = (a, b) => fin(a) && fin(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  function checkExpect(expect, texts, map) {
    if (expect == null) return;
    if (typeof expect !== 'object' || Array.isArray(expect)) throw new Error('expect 는 {id: 옛 글자} 모양이어야 합니다');
    for (const id of Object.keys(expect)) {
      const e = map.get(id), v = expect[id];
      if (!e) throw new Error(STALE + ' (지워진 글자가 있음)');
      const s = e.s == null ? '' : String(e.s);
      if (v != null && typeof v === 'object') {
        if (v.s != null && String(v.s) !== s) throw new Error(STALE);
        if (v.p != null) { const px = Array.isArray(v.p) ? v.p[0] : v.p.x, py = Array.isArray(v.p) ? v.p[1] : v.p.y;
          if (!e.p || !near(+px, e.p.x) || !near(+py, e.p.y)) throw new Error(STALE + ' (글자가 옮겨짐)'); }
        if (v.layer != null && String(v.layer) !== String(e.layer == null ? '0' : e.layer)) throw new Error(STALE + ' (층이 바뀜)');
      } else if (String(v) !== s) throw new Error(STALE);
    }
    for (const e of texts) if (!Object.prototype.hasOwnProperty.call(expect, e.id)) throw new Error(STALE + ' (미리 본 목록에 없는 글자가 있음)');
  }

  window.TCOUNT = { ver: 1, pickTexts, order, plan };

  /* AI·배치 명령: 검사·계획을 다 끝낸 뒤에만 바꾼다. 실패면 throw(도면 그대로). 되돌리기 칸은 runBatch 가 만들고, 실패 때 빼는 것은 화면(UI) 몫 */
  COMMANDS.tcount = (c) => {
    c = c || {};
    const ids = idList(c.ids), map = entMap();
    let miss = 0; for (const id of ids) if (!map.has(id)) miss++;
    if (miss) throw new Error('없는 객체가 ' + miss + '개 있습니다 (지워졌거나 잘못된 id) — 다시 고르세요');
    const { texts, skipped } = pickIn(ids, map);
    if (!texts.length) {
      const k = [['locked', '잠긴 층'], ['off', '꺼진·얼린 층'], ['block', '블록'], ['attr', '속성 블록'], ['table', '표'], ['dim', '치수·벌룬'], ['other', '기타']]
        .filter(([key]) => skipped[key]).map(([key, ko]) => ko + ' ' + skipped[key]).join(' · ');
      throw new Error('번호를 넣을 문자가 없습니다 (한 줄·여러 줄 문자만 대상' + (k ? ' — 뺀 것: ' + k : '') + ')');
    }
    checkExpect(c.expect, texts, map);
    const P = plan(order(texts, c.by), c);
    if (!P.rows.length) throw new Error('# 이 있는 글자가 없습니다 — 넣는 방법 F 는 글자 안의 # 자리에 번호를 넣습니다');
    for (const r of P.rows) map.get(r.id).s = r.after;
    return { ids: P.rows.map(r => r.id), n: P.rows.length, first: P.first, last: P.last, skipped, unchanged: P.unchanged };
  };
})();
