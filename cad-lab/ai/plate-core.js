/* 판 문장 바로 그리기(PLATE) 계산 모듈 — AI 팀 6회차 개발1 (2026-11-09)
   계산만 한다. 화면·명령 등록·preCommand 감싸기는 plate-ui.js(개발2).
   약속(04_시작회의_결정.md): window.PLATECORE = { version:1, parse(text), check(spec), holeCenters(spec,at), build(spec,at) }
   - parse: 판 치수 2개(가로·세로 | W·H | AxB) + 구멍 낱말(구멍|홀|hole|타공) 이 둘 다 있을 때만 spec, 아니면 null.
       "구멍 없는/없이/빼고" → null. 어떤 값이 들어와도 throw 하지 않음(오류면 null).
   - 개수: 4개·네 개·네 귀퉁이·4-Ø10·귀퉁이(개수 없음) → corners, 1개(+가운데) 또는 가운데만 → center, 그 밖 → ask.
   - 지름: Ø ø φ Φ ∅ ⌀ %%c · 10파이 · 파이10 · 지름10 · 직경10 · d=10 · 구멍 D10 · 구멍 반지름5/구멍 R5(→Ø10). M10 만 → ask.
   - 안쪽 거리 없음 → round(max(d, 0.1·min(w,h))) + read '(기본값)'.
   - SS400·SUS304 같은 재질, 두께 10·10T·t10·AxBxC 의 C 는 그리지 않음(두께는 read 에만), unread 에도 안 넣음.
   - check: 그리기 전에 막을 오류(쉬운 말, 숫자는 spec 값만, 입력 문장은 넣지 않음). 닿음(벽 두께 0)도 오류로 봄.
   - build: check 통과한 spec 만. rect → (r>0) fillet polyline → circle ×n, 모두 '외형선'.
   전역 함수·도면은 건드리지 않는다(순수 계산). */
(function () {
  'use strict';
  const EPS = 1e-9;
  const MARK = '\u0001';
  const LAYER = '외형선';
  const MAX_LEN = 300;

  const rnd = (v) => Math.round(v * 1e6) / 1e6;
  const fmt = (v) => { const x = rnd(+v); return String(Number.isInteger(x) ? x : +x.toFixed(3)); };
  const fin = (v) => typeof v === 'number' && isFinite(v);

  // 숫자 + 단위
  const N = '(\\d+(?:\\.\\d+)?)(?!\\d|\\.\\d)';
  const U = '(?:\\s*(mm|MM|미리|밀리|cm|CM|센치|센티|미터|m)(?![A-Za-z0-9]))?';
  const unitK = (u) => !u ? null : /^(cm|CM|센치|센티)$/.test(u) ? 10 : /^(미터|m)$/.test(u) ? 1000 : 1;
  const val = (n, u, fb) => rnd(+n * (unitK(u) || fb || 1));

  const KO_NUM = { '한': 1, '하나': 1, '두': 2, '둘': 2, '세': 3, '셋': 3, '네': 4, '넷': 4, '다섯': 5, '여섯': 6, '일곱': 7, '여덟': 8, '아홉': 9, '열': 10 };

  const HOLE_WORD = /구멍|홀(?!더)|타공|holes?/i;
  const HOLE_NEG = /(?:구멍|홀|타공|holes?)\s*(?:은|이|는)?\s*(?:없는|없이|없음|없고|없게|없어|빼고|제외|안\s*뚫|뚫지\s*않)|(?:no|without)\s+holes?/i;
  const PLATE_WORD = /판|플레이트|plate/i;
  // 구멍 자리를 바꾸는 말(못 읽음 → 그리지 않고 ask). 낱말 종류 이름만 보여 줌(입력 원문 안 넣음)
  const PLACE_WORDS = [
    ['PCD', /PCD|P\.C\.D|볼트\s*원|피씨디/i],
    ['피치·간격', /피치|pitch|간격|사이\s*거리|중심\s*거리/i],
    ['위·아래·왼쪽·오른쪽', /위쪽|아래쪽|왼쪽|오른쪽|윗(?:변|쪽|면|줄)?|아랫(?:변|쪽|면|줄)?|좌측|우측|상단|하단|좌우|상하|한쪽|양쪽|양\s*끝/],
    ['줄·열', /(?<![가-힣])(?:\d+\s*)?(?:줄|열|행)(?:로|으로|씩|에|마다)?(?![가-힣])(?!\s*(?:개|곳|군데))|가로\s*\d+\s*(?:개|줄)|세로\s*\d+\s*(?:개|줄)/],
    ['대각', /대각/],
    ['…만', /(?:귀퉁이|모서리|구석|코너|모퉁이|쪽|변|끝)\s*(?:에|에서)?\s*만(?!들)/]
  ];

  // 군말(읽지 못한 말에 넣지 않음)
  const FILLER_WORDS = [
    '판', '판재', '판넬', '패널', '플레이트', 'plate', '철판', '강판', '평판', '사각판', '사각', '사각형', '직사각형', '네모', '박스',
    '구멍', '홀', '타공', 'hole', 'holes', '뚫린', '뚫은', '뚫어', '뚫어줘', '뚫어주세요', '뚫고', '뚫기', '뚫', '뚫린것',
    '그려줘', '그려', '그려라', '그리기', '그려주세요', '그려줄래', '그려봐', '그려줘요', '그린', '그릴', '그리고',
    '만들어줘', '만들어', '만들기', '만들어주세요', '만들', '만들어줘요',
    '주세요', '줘', '해줘', '해주세요', '해', '좀', '부탁', '부탁해', '부탁합니다', '합니다', '해요', '요', '입니다',
    '하나', '하나씩', '각각', '각', '모두', '전부', '위치', '크기', '사이즈', '짜리', '인', '있는', '있게', '있도록',
    '안쪽', '안', '가장자리', '끝', '테두리', '외곽', '귀퉁이', '모서리', '구석', '모퉁이', '코너', '네', '개', '곳', '군데', '씩',
    'mm', 'MM', '미리', '밀리', '및', '와', '과', '하고', '에', '에서', '를', '을', '로', '으로', '의', '이', '가', '은', '는', '도',
    '고', '이고', '이며', '면', '하면', '된', '되는', '되게', '정도', '약', '대략', '같이', '처럼', '모양', '형태', '에다', '에다가', '위에',
    '볼트', '가공', '도면', '평면', '2D', '2d', '재질', '스텐', '스테인리스', '스테인레스', '서스', '알루미늄', '알미늄', '철', '아크릴', '두께', '가로', '세로'
  ];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const PARTICLES = '(?:에서|으로|에는|에도|에다|에|을|를|로|은|는|이|가|의|과|와|도|만|랑|이랑|하고|씩|요)';
  const FILLER_RE = new RegExp('^(?:' + FILLER_WORDS.map(esc).join('|') + ')' + PARTICLES + '*$', 'i');
  const PART_TAIL = new RegExp(PARTICLES + '+$');

  function parseCore(text) {
    if (typeof text !== 'string') return null;
    let s = text;
    try { s = s.normalize('NFKC'); } catch (_) { }
    s = s.replace(/[\r\n\t]+/g, ' ').replace(MARK, ' ');
    if (!s.trim() || s.length > MAX_LEN) return null;
    // 1,200 → 1200 (세 자리 묶음만)
    s = s.replace(/(?<![\d.])(\d{1,3})((?:,\d{3})+)(?![\d])/g, (m, a, b) => a + b.replace(/,/g, ''));

    if (!HOLE_WORD.test(s)) return null;
    if (HOLE_NEG.test(s)) return null;

    let work = s;
    const unreadAt = []; // {i, t}
    const eat = (src, flags, fn) => {
      const g = new RegExp(src, (flags || '').replace('g', '') + 'g');
      let m;
      while ((m = g.exec(work))) {
        if (!m[0]) { g.lastIndex++; continue; }
        const keep = fn(m);
        if (keep !== false) work = work.slice(0, m.index) + MARK.repeat(m[0].length) + work.slice(m.index + m[0].length);
      }
    };

    // ── 재질 (무시) ──
    eat('(?<![A-Za-z])(?:SS|SUS|STS|SM|SA|SCM|STKM|AL)\\s*-?\\s*\\d{2,4}[A-Za-z]{0,2}(?![A-Za-z0-9])', 'i', () => true);
    eat('(?<![A-Za-z])(?:A\\d{4}[A-Za-z]{0,2}|S\\d{2}C|SPCC|SPHC|SGCC|SECC|SPCE|POM|PVC|PE|PP|PC)(?![A-Za-z0-9])', '', () => true);
    eat('MC나일론', '', () => true);

    // ── 판 치수 ──
    let w = null, h = null, thick = null;
    {
      const mw = new RegExp('가로\\s*(?:는|은|:|=)?\\s*' + N + U).exec(work);
      const mh = new RegExp('세로\\s*(?:는|은|:|=)?\\s*' + N + U).exec(work);
      if (mw && mh) {
        const u2 = unitK(mh[2]), u1 = unitK(mw[2]);
        w = val(mw[1], mw[2], u2 || 1); h = val(mh[1], mh[2], u1 || 1);
        if (!mw[2] && mh[2]) w = val(mw[1], mh[2]);
        for (const m of [mw, mh]) work = work.slice(0, m.index) + MARK.repeat(m[0].length) + work.slice(m.index + m[0].length);
      }
    }
    if (w == null) {
      const mw = new RegExp('(?<![A-Za-z])[Ww]\\s*[:=]?\\s*' + N + U).exec(work);
      const mh = new RegExp('(?<![A-Za-z])[Hh]\\s*[:=]?\\s*' + N + U).exec(work);
      if (mw && mh) {
        const u2 = unitK(mh[2]);
        w = val(mw[1], mw[2], u2 || 1); h = val(mh[1], mh[2], unitK(mw[2]) || 1);
        for (const m of [mw, mh]) work = work.slice(0, m.index) + MARK.repeat(m[0].length) + work.slice(m.index + m[0].length);
      }
    }
    if (w == null) {
      const re = new RegExp('(?<![A-Za-z0-9.\\-])' + N + U + '\\s*[xX×*]\\s*' + N + U + '(?:\\s*[xX×*]\\s*' + N + U + '\\s*(?:T|t)?(?![A-Za-z]))?');
      const m = re.exec(work);
      if (m && (PLATE_WORD.test(s) || !work.slice(0, m.index).trim())) {
        const ue = unitK(m[4]) || unitK(m[2]) || 1;
        w = val(m[1], m[2], ue); h = val(m[3], m[4], ue);
        if (m[5]) thick = val(m[5], m[6], ue);
        work = work.slice(0, m.index) + MARK.repeat(m[0].length) + work.slice(m.index + m[0].length);
      }
    }
    if (!(fin(w) && fin(h))) return null;

    // ── 두께 (그림엔 안 씀) ──
    eat('두께\\s*(?:는|은|:|=)?\\s*' + N + U + '\\s*(?:T|t|티)?(?![A-Za-z])', '', (m) => { if (thick == null) thick = val(m[1], m[2]); });
    eat('(?<![A-Za-z])[tT]\\s*=?\\s*' + N + U + '(?![A-Za-z])', '', (m) => { if (thick == null) thick = val(m[1], m[2]); });
    eat('(?<![\\d.])' + N + '\\s*(?:T|t|티)(?![A-Za-z가-힣])', '', (m) => { if (thick == null) thick = val(m[1]); });

    // ── 지름 · 개수 ──
    const diams = [], counts = [];
    let mSeen = false;
    const DSYM = '(?:[ØøφΦ∅⌀]|%%[cC])';
    eat('(?<![\\d.])(\\d+)\\s*-\\s*' + DSYM + '\\s*' + N + U, '', (m) => { counts.push(+m[1]); diams.push(val(m[2], m[3])); });
    // M 나사 (탭/볼트) — 지름으로 바꾸지 않음
    eat('(?:(\\d+)\\s*-\\s*)?(?:(탭|탭구멍|태핑|볼트|나사)\\s*)?(?<![A-Za-z])M\\s*(\\d+(?:\\.\\d+)?)(?!\\d|\\.\\d)(?:\\s*[xX×]\\s*(\\d+(?:\\.\\d+)?))?(?:\\s*(탭|볼트|나사))?', '', (m) => {
      if (m[1]) counts.push(+m[1]);
      mSeen = true;
      const word = m[2] || m[5] || '';
      const t = (word ? word + ' ' : '') + 'M' + m[3] + (m[4] ? '×' + m[4] : '');
      unreadAt.push({ i: m.index, t });
    });
    // 구멍 반지름 / 구멍 R5 (구멍 낱말 바로 뒤일 때만)
    eat('(구멍|홀)\\s*(?:의)?\\s*(?:반지름|반경|R|r)\\s*(?:은|는|:|=)?\\s*' + N + U, '', (m) => { diams.push(rnd(2 * val(m[2], m[3]))); return m[0].length; });
    eat(DSYM + '\\s*' + N + U, '', (m) => { diams.push(val(m[1], m[2])); });
    eat(N + U + '\\s*파이', '', (m) => { diams.push(val(m[1], m[2])); });
    eat('(?:파이|지름|직경)\\s*(?:은|는|이|가|:|=)?\\s*' + N + U + '(?!\\s*(?:개|곳|군데|ea|EA))', '', (m) => { diams.push(val(m[1], m[2])); });
    eat('(?<![A-Za-z])[Dd]\\s*=\\s*' + N + U, '', (m) => { diams.push(val(m[1], m[2])); });
    eat('((?:구멍|홀)\\s*)[Dd]\\s*' + N + U + '(?![A-Za-z])', '', (m) => { diams.push(val(m[2], m[3])); });
    eat('(?<![A-Za-z])[Dd]\\s*' + N + U + '(?=\\s*(?:구멍|홀))', '', (m) => { diams.push(val(m[1], m[2])); });

    // ── 모서리 R ──
    const rs = [];
    eat('(?:(?:모서리|코너|귀퉁이|모퉁이|외곽)\\s*(?:를|은|는|의|에)?\\s*)?(?<![A-Za-z])(?:R|r|라운드|반지름|반경|필렛|fillet|모깎기)\\s*(?:은|는|:|=)?\\s*' + N + U + '(?:\\s*(?:로|으로))?(?:\\s*(?:라운드|둥글게|깎기|깎아|깎고|처리|필렛|모깎기))?', 'i', (m) => { rs.push(val(m[1], m[2])); });
    eat('(?<![\\d.])' + N + U + '\\s*R(?![A-Za-z])', '', (m) => { rs.push(val(m[1], m[2])); });
    eat('(?:모서리|코너|귀퉁이)\\s*(?:를|은|는)?\\s*' + N + U + '\\s*(?:로|으로)?\\s*(?:둥글게|라운드|필렛|모깎기|깎)', '', (m) => { rs.push(val(m[1], m[2])); });

    // ── 자리: 귀퉁이 / 가운데 ──
    let cornerHint = false, centerHint = false;
    eat('네\\s*(?=귀퉁이|모서리|구석|코너|모퉁이)', '', () => { cornerHint = true; });
    if (/귀퉁이|구석|모퉁이/.test(work)) cornerHint = true;
    if (/(?:모서리|코너)\s*(?:마다|에(?!서)|쪽|부분)/.test(work)) cornerHint = true;
    eat('정중앙|가운데|중앙|중심|센터|center', 'i', () => { centerHint = true; });

    // ── 안쪽 거리 ──
    const insets = [];
    const NOTCNT = '(?!\\s*(?:개|곳|군데|ea|EA|R(?![A-Za-z])))';
    const TAIL = '(?:\\s*씩)?(?:\\s*(?:안쪽|안으로|들어간|들어와서|들어와|떨어진|떨어져서|떨어져|띄워서|띄워|띄우고|띄운|간격|여유))?(?:에|으로|로)?';
    eat('(?:귀퉁이|모서리|가장자리|끝|변|테두리|외곽|구석|모퉁이|코너|엣지|에지|edge)\\s*(?:에서|로부터|으로부터|부터)?\\s*(?:각각|각|모두)?\\s*' + N + U + NOTCNT + TAIL, 'i', (m) => { insets.push(val(m[1], m[2])); });
    eat('(?:안쪽|안으로|인셋|inset)\\s*(?:으로|에서|로)?\\s*(?:거리)?\\s*(?:는|은|:|=)?\\s*' + N + U + NOTCNT, 'i', (m) => { insets.push(val(m[1], m[2])); });
    eat('(?<![\\d.])' + N + U + '(?:\\s*씩)?\\s*(?:안쪽|안으로|들어간|들어와서|들어와|떨어진|떨어져서|떨어져|띄워서|띄워|띄우고|띄운)', '', (m) => { insets.push(val(m[1], m[2])); });

    // ── 개수 ──
    eat('(?<![\\d.])(\\d+)\\s*(?:개|곳|군데|ea|EA)(?![A-Za-z])', '', (m) => { counts.push(+m[1]); });
    eat('(한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\\s*(?:개|곳|군데)', '', (m) => { counts.push(KO_NUM[m[1]]); });

    // ── 남은 말 → unread ──
    eat('구멍|홀(?!더)|타공|holes?', 'i', () => true);
    const segs = work.split(new RegExp(MARK + '+'));
    let pos = 0;
    for (const seg of segs) {
      const toks = seg.split(/[\s,;:!?()[\]{}~·'"`]+/);
      let cur = [];
      const flush = () => { if (cur.length) { unreadAt.push({ i: pos, t: cur.join(' ') }); cur = []; } };
      for (let t of toks) {
        t = t.replace(/^[.\-_/]+|[.\-_/]+$/g, '');
        if (!t) continue;
        if (FILLER_RE.test(t)) { flush(); continue; }
        const st = t.replace(PART_TAIL, '');
        if (st.length >= 2 && st !== t) { if (FILLER_RE.test(st)) { flush(); continue; } t = st; }
        cur.push(t);
      }
      flush();
      pos += seg.length + 1;
    }
    // 위치 순서: M 은 원래 index, 남은 말은 대략 위치 — 둘 다 문장 위치 기준으로 정렬
    const unread = [];
    {
      // 남은 말 위치를 원문 기준으로 다시 찾음
      const items = unreadAt.map((u) => ({ i: u.t && s.indexOf(u.t) >= 0 ? s.indexOf(u.t) : u.i, t: u.t }));
      items.sort((a, b) => a.i - b.i);
      for (const u of items) { const t = u.t.slice(0, 30); if (t && !unread.includes(t)) unread.push(t); if (unread.length >= 8) break; }
    }

    // ── 정리 ──
    const uniq = (a) => a.filter((v, i) => a.findIndex((x) => Math.abs(x - v) < 1e-9) === i);
    const D = uniq(diams), C = uniq(counts), Rv = uniq(rs), I = uniq(insets);
    let ask = null;
    const place = PLACE_WORDS.filter(([, re]) => re.test(s)).map(([k]) => k);
    if (place.length) ask = '구멍 배치(' + place.join(', ') + ')는 아직 못 읽습니다. 네 귀퉁이(안쪽 거리)나 가운데 1개만 됩니다';
    const r = Rv.length ? Rv[0] : 0;
    if (Rv.length > 1) ask = '모서리 R 이 두 가지 이상 적혀 있습니다. 한 가지만 적어 주세요 (예: 모서리 R10)';

    let n = null, layout = null;
    if (C.length > 1) ask = ask || '구멍 개수가 두 가지 이상 적혀 있습니다. 4개(네 귀퉁이)나 1개(가운데) 중 하나만 됩니다';
    else if (C.length === 1) {
      const c = C[0];
      if (c === 4) { if (centerHint && !cornerHint) ask = ask || '구멍 4개는 네 귀퉁이에만 놓을 수 있습니다 (예: 구멍 Ø10 4개 안쪽 20)'; else { n = 4; layout = 'corners'; } }
      else if (c === 1) { if (cornerHint && !centerHint) ask = ask || '구멍 1개는 가운데에만 놓을 수 있습니다 (예: 구멍 Ø10 1개 가운데)'; else { n = 1; layout = 'center'; } }
      else ask = ask || ('구멍 ' + c + '개 배치는 아직 못 그립니다. 4개(네 귀퉁이)나 1개(가운데)만 됩니다');
    } else {
      if (cornerHint && !centerHint) { n = 4; layout = 'corners'; }
      else if (centerHint && !cornerHint) { n = 1; layout = 'center'; }
      else if (cornerHint && centerHint) ask = ask || '구멍 자리가 귀퉁이인지 가운데인지 모르겠습니다. 4개(네 귀퉁이)나 1개(가운데) 중 하나로 적어 주세요';
      else ask = ask || '구멍 개수와 자리를 알려 주세요 (예: 구멍 Ø10 네 귀퉁이 20 안쪽 / 구멍 Ø10 1개 가운데)';
    }

    let d = null;
    if (D.length === 1) d = D[0];
    else if (D.length > 1) ask = ask || '구멍 지름이 두 가지 이상 적혀 있습니다. 한 가지만 됩니다 (예: 구멍 Ø10)';
    else if (mSeen) ask = ask || 'M 나사 표기는 탭인지 볼트 구멍인지 몰라 지름으로 바꾸지 않았습니다. 구멍 지름을 알려 주세요 (예: 구멍 Ø11)';
    else ask = ask || '구멍 지름을 알려 주세요 (예: 구멍 Ø10)';

    let inset = null, insetDefault = false;
    if (I.length > 1) ask = ask || '안쪽 거리가 두 가지 이상 적혀 있습니다. 한 가지만 됩니다 (예: 안쪽 20)';
    if (layout === 'center') inset = 0;
    else if (I.length === 1) inset = I[0];
    else if (d != null && fin(d)) { inset = Math.round(Math.max(d, 0.1 * Math.min(w, h))); insetDefault = true; }

    const read = ['가로 ' + fmt(w), '세로 ' + fmt(h)];
    if (r > 0) read.push('모서리 R' + fmt(r));
    if (d != null || n != null) read.push('구멍 ' + (d != null ? 'Ø' + fmt(d) : 'Ø?') + (n != null ? ' ×' + n : '') + (layout === 'center' ? ' (가운데)' : ''));
    if (layout === 'corners' && inset != null) read.push('안쪽 ' + fmt(inset) + (insetDefault ? ' (기본값)' : ''));
    if (layout === 'center' && I.length) read.push('안쪽 ' + fmt(I[0]) + ' (가운데 구멍이라 안 씀)');
    if (thick != null && fin(thick)) read.push('두께 ' + fmt(thick) + ' (그림엔 안 씀)');

    return {
      w, h, r,
      holes: { n, d, inset, layout },
      insetDefault,
      read, unread,
      ask
    };
  }

  function parse(text) {
    try { return parseCore(text); } catch (_) { return null; }
  }

  // 구멍 중심 (at 기준, spec 좌표는 판 왼쪽 아래 = 0,0)
  function relCenters(spec) {
    const H = spec && spec.holes;
    if (!H || !H.n) return [];
    const w = +spec.w, h = +spec.h;
    if (H.layout === 'center') return [{ x: w / 2, y: h / 2 }];
    if (H.layout === 'corners') { const i = +H.inset; return [{ x: i, y: i }, { x: w - i, y: i }, { x: w - i, y: h - i }, { x: i, y: h - i }]; }
    return [];
  }
  const ptOf = (at) => {
    if (Array.isArray(at)) return { x: +at[0], y: +at[1] };
    if (at && typeof at === 'object') return { x: +at.x, y: +at.y };
    return { x: 0, y: 0 };
  };

  function holeCenters(spec, at) {
    try {
      const p = ptOf(at);
      if (!fin(p.x) || !fin(p.y)) return [];
      return relCenters(spec).map((c) => ({ x: rnd(p.x + c.x), y: rnd(p.y + c.y) }));
    } catch (_) { return []; }
  }

  function check(spec) {
    try {
      if (!spec || typeof spec !== 'object') return '판 정보가 없습니다.';
      if (spec.ask) return String(spec.ask);
      const w = +spec.w, h = +spec.h, r = +(spec.r || 0);
      if (!(fin(w) && fin(h) && w > 0 && h > 0)) return '판의 가로·세로는 0보다 커야 합니다.';
      if (w > 1e7 || h > 1e7) return '판이 너무 큽니다 (가로·세로 10,000,000 이하만 됩니다).';
      if (!(fin(r) && r >= 0)) return '모서리 R 은 0 이상이어야 합니다.';
      const m = Math.min(w, h);
      if (r > 0 && r >= m / 2 - EPS) return '모서리 R' + fmt(r) + ' 이 너무 큽니다. 짧은 변 ' + fmt(m) + ' 의 절반(' + fmt(m / 2) + ')보다 작아야 네 모서리를 모두 깎을 수 있습니다.';
      const H = spec.holes;
      if (!H || !H.n) return null; // 구멍 없는 판(개발2 가 직접 만든 spec)
      const d = +H.d;
      if (!(fin(d) && d > 0)) return '구멍 지름은 0보다 커야 합니다.';
      const rho = d / 2;
      if (H.layout === 'corners') {
        if (H.n !== 4) return '귀퉁이 구멍은 4개만 됩니다.';
        const i = +H.inset;
        if (!(fin(i) && i > 0)) return '안쪽 거리는 0보다 커야 합니다.';
        if (i > m / 2 + EPS) return '안쪽 거리 ' + fmt(i) + ' 가 판 짧은 변의 절반(' + fmt(m / 2) + ')보다 큽니다.';
        if (i <= rho + EPS) return '구멍이 판 가장자리에 닿거나 밖으로 나갑니다. 안쪽 거리(' + fmt(i) + ')가 구멍 반지름(' + fmt(rho) + ')보다 커야 합니다.';
        const gap = Math.min(w - 2 * i, h - 2 * i);
        if (gap <= d + EPS) return '구멍끼리 닿거나 겹칩니다. 구멍 중심 사이 ' + fmt(gap) + ' 가 지름 ' + fmt(d) + ' 보다 커야 합니다. 안쪽 거리를 줄이거나 지름을 줄이세요.';
      } else if (H.layout === 'center') {
        if (H.n !== 1) return '가운데 구멍은 1개만 됩니다.';
        if (d >= m - EPS) return '구멍(지름 ' + fmt(d) + ')이 판 짧은 변 ' + fmt(m) + ' 보다 작아야 합니다.';
      } else {
        return '구멍은 4개(네 귀퉁이)나 1개(가운데)만 됩니다.';
      }
      if (r > 0 && rho < r) {
        // 둥근 판 = 안쪽 사각형 [r,w-r]×[r,h-r] 에서 r 이내인 점들. 구멍이 다 들어가려면 거리 + 반지름 < r
        for (const c of relCenters(spec)) {
          const dx = Math.max(r - c.x, 0, c.x - (w - r)), dy = Math.max(r - c.y, 0, c.y - (h - r));
          if (Math.hypot(dx, dy) + rho >= r - EPS) return '구멍이 둥근 모서리(R' + fmt(r) + ') 밖으로 나가거나 닿습니다. 안쪽 거리를 늘리거나 R 을 줄이세요.';
        }
      }
      return null;
    } catch (_) { return '판 정보를 확인하지 못했습니다.'; }
  }

  function build(spec, at) {
    const err = check(spec);
    if (err) throw new Error(err);
    const p = ptOf(at);
    if (!fin(p.x) || !fin(p.y)) throw new Error('구석점 좌표가 올바르지 않습니다.');
    const w = +spec.w, h = +spec.h, r = +(spec.r || 0);
    const out = [{ cmd: 'rect', at: [p.x, p.y], w, h, layer: LAYER }];
    if (r > 0) out.push({ cmd: 'fillet', id: 'last', polyline: true, r });
    const d = spec.holes && spec.holes.n ? +spec.holes.d : 0;
    for (const c of holeCenters(spec, p)) out.push({ cmd: 'circle', center: [c.x, c.y], d, layer: LAYER });
    return out;
  }

  window.PLATECORE = { version: 1, parse, check, holeCenters, build };
})();
