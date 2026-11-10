/* 무카 CAD AI 팀 실험판 — 치수 덮어쓰기 찾기 (DIMCHECK) 계산 부분 (개발1, 11회차, 2026-11-10)
   window.DIMCHK = { ver, parseNum(text, kind, dsep), scan(opt), verify(c) }  +  AI 명령 {"cmd":"dimfix"}
   - 측정 치수 종류는 1회차 DIMX.KINDS 로만 거름(DIMX 없으면 throw). 값은 dimGeom(e)._v × DS(e).lfac 로 직접(각도는 lfac 없음)
   - 비교 = dimFmt 와 같은 toFixed, 자리 d = max(스타일 dec(각도 adec), 글자 소수 자리). 기본 허용 0, tol 은 '>'
   - 판정 'diff'(다름) · 'same'(같지만 고정) · 'nonum'(숫자 없음) · 'hidden'(숨김 " ") · 'check'(확인 필요: 숫자는 다른데 Ø·R·°·±·()·TYP·개수 머리말 말고 다른 낱말이 섞였거나 |차이| > 실제 값의 절반 — fixable 은 true, 자동 고르기에선 빼야 함) · 'auto'(덮어쓰기 아님 — 줄로는 나오지만 fixable false. opt.over=true 면 덮어쓴 치수만)
   - fixText = 숫자 자리만 '<>' 로(TYP·()·2- 보존). 지름·반지름은 앞 Ø/%%c/⌀/R, 각도는 뒤 °/%%d 도 같이. 남는 게 없으면 null(=text 지움)
   - 꺼진·동결·잠긴 층, 블록 안(블록 편집 중 포함)은 고치기 불가. 블록 정의 안 치수 수 × 삽입 수는 skipped.block
   - 글자 규칙: 맨 앞 빼기 부호("-1499")는 nonum · "2-Ø48"(개수-기호-숫자)은 48 로 읽고 fixText "2-<>" · "2-1499"·"2-1500 TYP"(숫자 2개)는 nonum
   - diff = 글자 숫자 − 실제 형상 값(반올림 전 value). 판정(diff/same)은 toFixed(d) 비교
   도면 글자는 log·사용 기록·오류 문구에 넣지 않음(오류에는 id 만). */
(function () {
  'use strict';
  if (typeof doc !== 'object' || !doc) return;
  const SYM_D = /(%%[cC]|Ø|⌀|∅)$/, SYM_R = /R$/;
  const fnDimGeom = () => { try { return typeof dimGeom === 'function' ? dimGeom : null; } catch (_) { return null; } };
  const fnDS = () => { try { return typeof DS === 'function' ? DS : null; } catch (_) { return null; } };
  const inBedit = () => { try { return typeof bedit !== 'undefined' && !!bedit; } catch (_) { return false; } };
  const kinds = () => {
    const D = window.DIMX;
    if (!D || !Array.isArray(D.KINDS)) throw new Error('치수 목록(1회차 DIMX) 모듈이 없습니다');
    return new Set(D.KINDS);
  };
  const blank = (s, a, b) => s.slice(0, a) + ' '.repeat(b - a) + s.slice(b);
  const maskRe = (m, re) => m.replace(re, x => ' '.repeat(x.length));

  /* 숫자 글자 하나를 dsep 기준으로 읽기 -> {num, digits} | null */
  function readNum(tok, dsep) {
    const D = dsep === ',' ? ',' : '.', O = D === ',' ? '.' : ',';
    const eD = D === '.' ? '\\.' : ',', eO = O === '.' ? '\\.' : ',';
    let intPart = tok, frac = '';
    // 천 단위: 1,500 / 1.500.000 (O 묶음 3자리) + 선택 소수
    const th = new RegExp('^(\\d{1,3}(?:' + eO + '\\d{3})+)(?:' + eD + '(\\d+))?$').exec(tok);
    const thD = new RegExp('^(\\d{1,3}(?:' + eD + '\\d{3}){2,})$').exec(tok); // D 를 두 번 이상 3자리 묶음으로 쓴 경우
    if (th) { intPart = th[1].split(O).join(''); frac = th[2] || ''; }
    else if (thD) { intPart = thD[1].split(D).join(''); }
    else if (new RegExp('^\\d+(?:' + eD + '\\d+)?$').test(tok)) { const k = tok.indexOf(D); if (k >= 0) { intPart = tok.slice(0, k); frac = tok.slice(k + 1); } }
    else if (new RegExp('^\\d+' + eO + '\\d+$').test(tok)) { const k = tok.indexOf(O); intPart = tok.slice(0, k); frac = tok.slice(k + 1); } // 다른 소수점을 한 번 쓴 글자(관대)
    else return null;
    const num = parseFloat(intPart + (frac ? '.' + frac : ''));
    return isFinite(num) ? { num, digits: frac.length } : null;
  }

  /* 내부: 숫자 위치까지 찾기 */
  function parse0(text, kind, dsep) {
    if (text == null) return { nonum: true };
    const s = String(text);
    if (s.trim() === '') return { hidden: true };
    let m = s;
    m = maskRe(m, /\\[A-Za-z][^;\\{}]*;/g);          // MTEXT 서식 \H0.7x; \S+0.1^-0.2; 등
    m = maskRe(m, /\\P|\\~|[{}]/g);
    if (/^\s*[-−]\s*\d/.test(m)) return { nonum: true };  // 맨 앞 빼기 부호는 버리지 않고 nonum
    m = maskRe(m, /(±|%%[pP])\s*[\d.,]+/g);            // ±0.1
    m = maskRe(m, /[+]\s*[\d.,]+(\s*\/?\s*-\s*[\d.,]+)?/g); // +0.1/-0.2, +0.1 -0.2
    m = maskRe(m, /\s-\s*\d[\d.,]*$/g);                // 끝의 -0.2
    m = m.replace(/(\d)(\s*mm)\b/gi, (x, d, u) => d + ' '.repeat(u.length)); // 1500mm 의 mm
    m = maskRe(m, /°|%%[dD]/g);
    // 개수 머리말 2- 2X 4× (뒤에 기호가 올 때만)
    const cp = /^(\s*)(\d{1,3}\s*[-xX×]\s*)(?=(%%[cC]|Ø|⌀|∅|R|M|\())/.exec(m);
    if (cp) m = blank(m, cp[1].length, cp[1].length + cp[2].length);
    // 지름 기호, 숫자 바로 앞 R
    m = maskRe(m, /%%[cC]|Ø|⌀|∅/g);
    m = m.replace(/R(?=\s*\d)/g, (x, i) => (i === 0 || !/[A-Za-z0-9]/.test(m[i - 1])) ? ' ' : x);
    if (/[A-Za-z]\d|\d[A-Za-z]/.test(m)) return { nonum: true }; // H7, M10, 50h6
    const toks = []; const re = /\d[\d.,]*/g; let r;
    while ((r = re.exec(m))) { let t = r[0]; while (/[.,]$/.test(t)) t = t.slice(0, -1); toks.push({ t, a: r.index, b: r.index + t.length }); }
    if (toks.length !== 1) return { nonum: true };
    const T = toks[0], v = readNum(T.t, dsep);
    if (!v) return { nonum: true };
    return { num: v.num, digits: v.digits, a: T.a, b: T.b, rest: blank(m, T.a, T.b) };
  }

  function parseNum(text, kind, dsep) {
    const p = parse0(text, kind, dsep);
    if (p.hidden) return { hidden: true };
    if (p.nonum) return { nonum: true };
    return { num: p.num, digits: p.digits };
  }

  /* 숫자 자리만 '<>' 로 (종류에 따라 자동 머리·꼬리말도 같이) */
  function makeFix(text, kind, p, st, ePrefix) {
    const s = String(text); let a = p.a, b = p.b;
    const before = () => s.slice(0, a).replace(/\s+$/, ''), sp = () => s.slice(0, a).length - before().length;
    if (kind === 'diameter') { const m = SYM_D.exec(before()); if (m) a = a - sp() - m[0].length; }
    else if (kind === 'radius' || kind === 'jogged') { const m = SYM_R.exec(before()); if (m) a = a - sp() - 1; }
    else if ((kind === 'linear' || kind === 'aligned') && ePrefix) { const bf = before(); if (bf.endsWith(ePrefix)) a = a - sp() - ePrefix.length; }
    if (kind === 'angular') { const m = /^\s*(°|%%[dD])/.exec(s.slice(b)); if (m) b += m[0].length; }
    const pre = (st && st.pre) || '', suf = (st && st.suf) || '';
    if (pre && s.slice(0, a).endsWith(pre)) a -= pre.length;
    if (suf && s.slice(b).startsWith(suf)) b += suf.length;
    const out = s.slice(0, a) + '<>' + s.slice(b);
    return out.trim() === '<>' ? null : out;
  }

  /* 숫자 밖에 남은 글자가 허용 낱말(TYP·괄호·공백·점)뿐인지. 기호 Ø·R·°·±·공차·개수 머리말·MTEXT 서식은 parse0 에서 이미 지움 */
  function wordsMixed(rest, st, ePrefix) {
    let r = String(rest || '');
    for (const w of [st && st.pre, st && st.suf, ePrefix]) if (w) r = r.split(w).join(' ');
    r = r.replace(/(^|[^A-Za-z])TYP(ICAL)?\.?(?![A-Za-z])/gi, '$1 ').replace(/[\s()\[\].,]/g, '');
    return r !== '';
  }

  const clean = v => (v == null || !isFinite(v)) ? null : Number((+v).toFixed(10));
  function layerMap() { const M = new Map(); for (const l of doc.layers || []) M.set(l.name, l); return M; }
  function whyOf(e, LM, bed) {
    if (bed) return 'block';
    const l = LM.get(e.layer);
    if (!l) return null;
    if (l.visible === false) return 'off';
    if (l.frozen) return 'frozen';
    if (l.locked) return 'locked';
    return null;
  }

  /* 치수 하나 판정 */
  function judge(e, tol, LM, bed) {
    const DG = fnDimGeom(), DSf = fnDS();
    const st = (DSf ? DSf(e) : null) || {};
    const ang = e.kind === 'angular';
    let G = null; try { G = DG ? DG(e) : null; } catch (_) { G = null; }
    let v = G && typeof G._v === 'number' && isFinite(G._v) ? G._v : NaN;
    if (!ang && isFinite(v)) v *= (+st.lfac > 0 ? +st.lfac : 1);
    let shown = '';
    if (G && G.text) {
      shown = G.text.s == null ? '' : String(G.text.s);
      const X = G.extra; if (X && X.length) for (const x of X) if (x && x.s != null && x.s !== '') shown = shown ? shown + ' ' + x.s : String(x.s);
    }
    const t = e.text, txt = t == null ? '' : String(t);
    const over = txt !== '' && !txt.includes('<>');
    const why = whyOf(e, LM, bed);
    const row = { id: e.id, kind: e.kind, value: clean(v), shown, text: t == null ? null : txt, num: null, diff: null, verdict: 'auto', fixable: false, fixText: null, layer: e.layer == null ? '' : String(e.layer), why };
    if (!over) return row;
    const p = parse0(txt, e.kind, st.dsep);
    if (p.hidden) { row.verdict = 'hidden'; return row; }
    if (p.nonum || !isFinite(v)) { row.verdict = 'nonum'; if (!p.nonum) row.num = p.num; return row; }
    row.num = p.num;
    const dec = ang ? (st.adec ?? 0) : (st.dec ?? 2);
    const d = Math.min(20, Math.max(dec | 0, p.digits | 0));
    const vs = v.toFixed(d), ns = p.num.toFixed(d);
    const diff = clean(p.num - v);   // 글자 − 형상(반올림 전)
    row.diff = diff;
    if (vs === ns) row.verdict = 'same';
    else {
      row.verdict = (wordsMixed(p.rest, st, e.prefix) || (Math.abs(v) > 0 && Math.abs(diff) > Math.abs(v) / 2)) ? 'check' : 'diff';
      if (+tol > 0 && Math.abs(diff) <= +tol + 1e-12) row.withinTol = true; // tol 안이어도 판정은 그대로(same 로 바꾸지 않음)
    }
    row.fixText = makeFix(txt, e.kind, p, st, e.prefix);
    row.fixable = why == null;
    return row;
  }

  /* 블록 정의 안 치수 수 (중첩·순환 막기). *D 익명 치수 블록은 1개로 */
  function blockCounter(K) {
    const B = doc.blocks || {}, memo = new Map();
    const cnt = (name, stack) => {
      if (memo.has(name)) return memo.get(name);
      if (stack.has(name)) return 0;
      const b = B[name]; let n = 0;
      if (b && Array.isArray(b.ents)) {
        stack.add(name);
        for (const x of b.ents) {
          if (!x) continue;
          if (x.type === 'dim' && K.has(x.kind)) n++;
          else if (x.type === 'insert' && typeof x.name === 'string') n += cnt(x.name, stack);
        }
        stack.delete(name);
      }
      if (n === 0 && /^\*D/i.test(name)) n = 1;
      memo.set(name, n); return n;
    };
    return name => cnt(name, new Set());
  }

  function scan(opt) {
    opt = opt || {};
    const t0 = performance.now();
    const K = kinds(), LM = layerMap(), bed = inBedit(), tol = +opt.tol > 0 ? +opt.tol : 0, all = opt.over !== true;
    let src = doc.entities || [];
    if (Array.isArray(opt.ids)) { const want = new Set(opt.ids.map(String)); src = src.filter(e => e && want.has(String(e.id))); }
    const rows = [], skipped = { block: 0, off: 0, locked: 0 }; let total = 0;
    const bc = blockCounter(K);
    for (const e of src) {
      if (!e) continue;
      if (e.type === 'insert' && typeof e.name === 'string') { skipped.block += bc(e.name); continue; }
      if (e.type !== 'dim' || !K.has(e.kind)) continue;
      total++;
      const r = judge(e, tol, LM, bed);
      if (r.verdict === 'auto' && !all) continue;
      if (r.verdict !== 'auto') { if (r.why === 'off' || r.why === 'frozen') skipped.off++; else if (r.why === 'locked') skipped.locked++; else if (r.why === 'block') skipped.block++; }
      rows.push(r);
    }
    return { rows, total, skipped, ms: Math.round(performance.now() - t0) };
  }

  /* dimfix 검사: 하나라도 어긋나면 throw (도면은 안 바꿈). 통과하면 [{e, fixText}] */
  function verify(c) {
    c = c || {};
    const K = kinds();
    const ids = Array.isArray(c.ids) ? [...new Set(c.ids)] : [];
    if (!ids.length) throw new Error('dimfix: ids 가 비어 있습니다');
    const ex = c.expect && typeof c.expect === 'object' ? c.expect : null;
    if (!ex) throw new Error('dimfix: expect 가 없습니다');
    const bed = inBedit();
    if (bed) throw new Error('dimfix: 블록 편집 중에는 치수 글자를 되돌리지 않습니다');
    const want = new Set(ids.map(String)), M = new Map();
    for (const e of doc.entities || []) if (e && want.has(String(e.id))) M.set(String(e.id), e);
    const LM = layerMap(), plan = [];
    for (const id of ids) {
      const e = M.get(String(id));
      if (!e) throw new Error(`dimfix: 치수 #${id} 를 찾을 수 없습니다(블록 안이거나 지워짐)`);
      if (e.type !== 'dim' || !K.has(e.kind)) throw new Error(`dimfix: #${id} 는 측정 치수가 아닙니다`);
      const x = ex[id] != null ? ex[id] : ex[String(id)];
      if (!x || typeof x !== 'object') throw new Error(`dimfix: #${id} 의 expect 가 없습니다`);
      const cur = e.text == null ? null : String(e.text);
      if (cur !== (x.text == null ? null : String(x.text))) throw new Error(`dimfix: #${id} 글자가 검사 뒤 바뀌었습니다 — 다시 검사하세요`);
      const r = judge(e, 0, LM, false);
      const xv = x.value == null ? null : +x.value;
      if (r.value == null || xv == null || !isFinite(xv) || Math.abs(r.value - xv) > 1e-9 * Math.max(1, Math.abs(xv))) throw new Error(`dimfix: #${id} 측정값이 검사 뒤 바뀌었습니다 — 다시 검사하세요`);
      if (r.why) throw new Error(`dimfix: #${id} 는 ${r.why === 'locked' ? '잠긴' : r.why === 'frozen' ? '동결된' : '꺼진'} 도면층이라 고칠 수 없습니다`);
      if (r.verdict !== 'diff' && r.verdict !== 'same' && r.verdict !== 'check') throw new Error(`dimfix: #${id} 는 숫자를 읽을 수 없는 글자라 고치지 않습니다`);
      plan.push({ e, fixText: r.fixText });
    }
    return plan;
  }

  window.DIMCHK = { ver: 1, parseNum, scan, verify };

  if (typeof COMMANDS === 'object' && COMMANDS) {
    COMMANDS.dimfix = c => {
      const plan = verify(c); // 모두 통과해야 아래로
      for (const { e, fixText } of plan) { if (fixText == null) delete e.text; else e.text = fixText; }
      return { ids: plan.map(p => p.e.id), n: plan.length };
    };
  }
  const GUIDE = `치수 덮어쓰기
 · {"cmd":"dimfix","ids":[...],"expect":{"<id>":{"text":"<지금 글자>","value":<측정값>}}} — 덮어쓴 치수 글자의 숫자 자리를 실제 값 표시(<>)로 되돌림(TYP 같은 나머지 글자는 그대로, 형상은 안 바꿈). 글자·측정값이 expect 와 하나라도 다르거나 꺼진·잠긴 층·블록 안이면 아무것도 안 바꾸고 오류. 먼저 DIMCHK.scan() 결과의 text·value 를 expect 로`;
  const hook = () => { const g = window.LAB2D; if (g && typeof g.guide === 'string') { if (!g.guide.includes('"cmd":"dimfix"')) g.guide += '\n\n' + GUIDE; return true; } return false; };
  if (!hook()) { let n = 0; const t = setInterval(() => { if (hook() || ++n > 40) clearInterval(t); }, 500); }
})();
