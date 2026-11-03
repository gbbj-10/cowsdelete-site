/* 무카 CAD 테스트 서버 — 부품 선택 창 양식 엔진 (2026-11-03, OpnForm 방식)
   부품 하나 = 양식 정의 하나: 이름·찾는 말·칸(fields, JSON) + 안내 줄(info) + 그리기(draw → 무카 명령 배열)
   칸 종류: select · number · check · text, 조건부로 보이기(showIf), 최소·최대, 마지막 고른 값 기억
   → 예약 작업·AI가 새 부품 창을 PARTFORMS.add({...}) 한 번으로 더할 수 있음
   들어 있는 양식: 엘보 90° LR · 동경 티 · 동심 레듀서 (ASME B16.9 맞대기 용접 이음쇠, 참고 치수)
   명령줄: 엘보·티·레듀서(ELBOW·TEE·REDUCER) · AI: {"cmd":"part_form","id":"elbow90","values":{"nps":"NPS 4"}} · {"cmd":"part_form_list"} */
(function () {
  'use strict';
  const f1 = x => Math.round(x * 10) / 10;
  /* ASME B36.10M 외경 · B16.9 엘보 90° LR 중심-끝 A · 동경 티 중심-끝 C · 동심 레듀서 길이 H (mm, 큰 쪽 기준) */
  const B169 = [
    ['NPS 1', 'DN25', 33.4, 38, 38, 51], ['NPS 1-1/4', 'DN32', 42.2, 48, 48, 51], ['NPS 1-1/2', 'DN40', 48.3, 57, 57, 64],
    ['NPS 2', 'DN50', 60.3, 76, 64, 76], ['NPS 2-1/2', 'DN65', 73.0, 95, 76, 89], ['NPS 3', 'DN80', 88.9, 114, 86, 89],
    ['NPS 4', 'DN100', 114.3, 152, 105, 102], ['NPS 5', 'DN125', 141.3, 190, 124, 127], ['NPS 6', 'DN150', 168.3, 229, 143, 140],
    ['NPS 8', 'DN200', 219.1, 305, 178, 152], ['NPS 10', 'DN250', 273.0, 381, 216, 178], ['NPS 12', 'DN300', 323.8, 457, 254, 203]
  ].map(r => ({ nps: r[0], dn: r[1], od: r[2], A: r[3], C: r[4], H: r[5] }));
  const WALL = { 'Sch10S': [2.77, 2.77, 2.77, 2.77, 3.05, 3.05, 3.05, 3.40, 3.40, 3.76, 4.19, 4.57], 'Sch40': [3.38, 3.56, 3.68, 3.91, 5.16, 5.49, 6.02, 6.55, 7.11, 8.18, 9.27, 10.31], 'Sch80': [4.55, 4.85, 5.08, 5.54, 7.01, 7.62, 8.56, 9.53, 10.97, 12.70, 15.09, 17.48] };
  const size = nps => B169.find(s => s.nps === nps) || B169[6];
  const tOf = (nps, sch) => WALL[sch] ? WALL[sch][B169.indexOf(size(nps))] : 0;
  const SIZE_OPTS = B169.map(s => [s.nps, `${s.nps} (${s.dn} · Ø${s.od})`]);
  const SRC = 'ASME B16.9 (맞대기 용접 이음쇠) · B36.10M 외경 — 참고 치수, 제작 전 제작사 표 확인';
  const spot = () => { try { const b = cad.state().bbox; return b ? [Math.ceil((b.maxX + 150) / 10) * 10, Math.round((b.minY + b.maxY) / 2)] : [0, 0]; } catch (_) { return [0, 0]; } };
  const L = { o: '외형선', h: '숨은선', c: '중심선' };
  const txt = (at, s, h) => ({ cmd: 'text', at, text: s, h });

  const FORMS = [];
  /* ---------- 엘보 90° LR ---------- */
  FORMS.push({
    id: 'elbow90', name: '엘보 90° (LR, 맞대기 용접)', keywords: ['엘보', '엘보우', '90도엘보', '곡관', 'ELBOW'],
    fields: [
      { key: 'nps', label: '호칭', type: 'select', options: SIZE_OPTS, default: 'NPS 4' },
      { key: 'wall', label: '두께 선(숨은선)', type: 'check', default: false },
      { key: 'sch', label: '스케줄', type: 'select', options: [['Sch10S', 'Sch10S'], ['Sch40', 'Sch40'], ['Sch80', 'Sch80']], default: 'Sch40', showIf: { wall: true } },
      { key: 'dims', label: '치수 넣기', type: 'check', default: true }
    ],
    spec: v => `${v.nps} (${size(v.nps).dn})${v.wall ? ' ' + v.sch : ''} · ASME B16.9`,
    info: v => { const s = size(v.nps); return `외경 Ø${s.od} · 중심-끝 A ${s.A} (= 굽힘 반지름 R)${v.wall ? ` · 두께 ${tOf(v.nps, v.sch)}` : ''}`; },
    draw(v, at) {
      const s = size(v.nps), A = s.A, r = s.od / 2, [cx, cy] = at, c = [];
      // 굽힘 중심 (cx,cy) · 끝 1 = y=cy 수평면(아래로 이어짐) · 끝 2 = x=cx 수직면(왼쪽으로 이어짐) · 두 배관 중심선 교점 (cx+A, cy+A)
      c.push({ cmd: 'arc', center: [cx, cy], r: A + r, start: 0, end: 90, layer: L.o }, { cmd: 'arc', center: [cx, cy], r: A - r, start: 0, end: 90, layer: L.o });
      c.push({ cmd: 'line', from: [cx + A - r, cy], to: [cx + A + r, cy], layer: L.o }, { cmd: 'line', from: [cx, cy + A - r], to: [cx, cy + A + r], layer: L.o });
      c.push({ cmd: 'arc', center: [cx, cy], r: A, start: 0, end: 90, layer: L.c });
      c.push({ cmd: 'line', from: [cx + A, cy - 8], to: [cx + A, cy + A + 8], layer: L.c }, { cmd: 'line', from: [cx - 8, cy + A], to: [cx + A + 8, cy + A], layer: L.c });
      if (v.wall) { const t = tOf(v.nps, v.sch); c.push({ cmd: 'arc', center: [cx, cy], r: A + r - t, start: 0, end: 90, layer: L.h }, { cmd: 'arc', center: [cx, cy], r: A - r + t, start: 0, end: 90, layer: L.h }); }
      if (v.dims) { const g = Math.max(15, r * 0.8);
        c.push({ cmd: 'dim_linear', p1: [cx + A, cy], p2: [cx + A, cy + A], at: [cx + A + r + g, cy + A / 2], dir: 'v' });
        c.push({ cmd: 'dim_linear', p1: [cx, cy + A], p2: [cx + A, cy + A], at: [cx + A / 2, cy + A + r + g], dir: 'h' });
        c.push({ cmd: 'dim_linear', p1: [cx + A - r, cy], p2: [cx + A + r, cy], at: [cx + A, cy - g], dir: 'h', prefix: 'Ø' }); }
      const h = Math.max(2.5, Math.min(8, s.od / 14));
      c.push(txt([cx, cy - r - h * 5], `엘보 90° LR ${s.nps} (${s.dn})${v.wall ? ' ' + v.sch : ''}`, h), txt([cx, cy - r - h * 7], SRC, h * 0.6));
      return c;
    }
  });
  /* ---------- 동경 티 ---------- */
  FORMS.push({
    id: 'tee', name: '티 (동경, 맞대기 용접)', keywords: ['=티', '동경티', '티이음', '티관', '분기관', 'TEE'],
    fields: [
      { key: 'nps', label: '호칭', type: 'select', options: SIZE_OPTS, default: 'NPS 4' },
      { key: 'dims', label: '치수 넣기', type: 'check', default: true }
    ],
    spec: v => `${v.nps} (${size(v.nps).dn}) · ASME B16.9`,
    info: v => { const s = size(v.nps); return `외경 Ø${s.od} · 중심-끝 C ${s.C} (본관 길이 ${2 * s.C})`; },
    draw(v, at) {
      const s = size(v.nps), C = s.C, r = s.od / 2, [cx, cy] = at, c = [];   // 중심 (cx,cy) · 본관 좌우 · 가지관 위
      c.push({ cmd: 'line', from: [cx - C, cy - r], to: [cx + C, cy - r], layer: L.o });
      c.push({ cmd: 'line', from: [cx - C, cy + r], to: [cx - r, cy + r], layer: L.o }, { cmd: 'line', from: [cx + r, cy + r], to: [cx + C, cy + r], layer: L.o });
      c.push({ cmd: 'line', from: [cx - r, cy + r], to: [cx - r, cy + C], layer: L.o }, { cmd: 'line', from: [cx + r, cy + r], to: [cx + r, cy + C], layer: L.o });
      c.push({ cmd: 'line', from: [cx - C, cy - r], to: [cx - C, cy + r], layer: L.o }, { cmd: 'line', from: [cx + C, cy - r], to: [cx + C, cy + r], layer: L.o }, { cmd: 'line', from: [cx - r, cy + C], to: [cx + r, cy + C], layer: L.o });
      c.push({ cmd: 'line', from: [cx - C - 8, cy], to: [cx + C + 8, cy], layer: L.c }, { cmd: 'line', from: [cx, cy - r - 8], to: [cx, cy + C + 8], layer: L.c });
      if (v.dims) { const g = Math.max(15, r * 0.8);
        c.push({ cmd: 'dim_linear', p1: [cx - C, cy - r], p2: [cx, cy - r], at: [cx - C / 2, cy - r - g], dir: 'h' }, { cmd: 'dim_linear', p1: [cx, cy - r], p2: [cx + C, cy - r], at: [cx + C / 2, cy - r - g], dir: 'h' });
        c.push({ cmd: 'dim_linear', p1: [cx + r, cy], p2: [cx + r, cy + C], at: [cx + r + g, cy + C / 2], dir: 'v' });
        c.push({ cmd: 'dim_linear', p1: [cx + C, cy - r], p2: [cx + C, cy + r], at: [cx + C + g, cy], dir: 'v', prefix: 'Ø' }); }
      const h = Math.max(2.5, Math.min(8, s.od / 14));
      c.push(txt([cx - C, cy - r - h * 6], `동경 티 ${s.nps} (${s.dn})`, h), txt([cx - C, cy - r - h * 8], SRC, h * 0.6));
      return c;
    }
  });
  /* ---------- 동심 레듀서 ---------- */
  FORMS.push({
    id: 'reducer', name: '레듀서 (동심, 맞대기 용접)', keywords: ['레듀서', '리듀서', '레듀샤', '축소관', 'REDUCER', '동심레듀서'],
    fields: [
      { key: 'big', label: '큰 쪽', type: 'select', options: SIZE_OPTS.slice(1), default: 'NPS 4' },
      { key: 'small', label: '작은 쪽', type: 'select', options: SIZE_OPTS, default: 'NPS 3', check: v => B169.indexOf(size(v.small)) < B169.indexOf(size(v.big)) || '작은 쪽은 큰 쪽보다 작아야 합니다' },
      { key: 'dims', label: '치수 넣기', type: 'check', default: true }
    ],
    spec: v => `${v.big} × ${v.small} (${size(v.big).dn} × ${size(v.small).dn}) · ASME B16.9`,
    info: v => { const b = size(v.big), s = size(v.small); return `큰 쪽 Ø${b.od} → 작은 쪽 Ø${s.od} · 길이 H ${b.H}`; },
    draw(v, at) {
      const b = size(v.big), s = size(v.small), H = b.H, R = b.od / 2, r = s.od / 2, [x0, cy] = at, c = [];
      c.push({ cmd: 'polyline', points: [[x0, cy - R], [x0 + H, cy - r], [x0 + H, cy + r], [x0, cy + R]], closed: true, layer: L.o });
      c.push({ cmd: 'line', from: [x0 - 8, cy], to: [x0 + H + 8, cy], layer: L.c });
      if (v.dims) { const g = Math.max(15, R * 0.6);
        c.push({ cmd: 'dim_linear', p1: [x0, cy - R], p2: [x0 + H, cy - R], at: [x0 + H / 2, cy - R - g], dir: 'h' });
        c.push({ cmd: 'dim_linear', p1: [x0, cy - R], p2: [x0, cy + R], at: [x0 - g, cy], dir: 'v', prefix: 'Ø' });
        c.push({ cmd: 'dim_linear', p1: [x0 + H, cy - r], p2: [x0 + H, cy + r], at: [x0 + H + g, cy], dir: 'v', prefix: 'Ø' }); }
      const h = Math.max(2.5, Math.min(8, b.od / 14));
      c.push(txt([x0, cy - R - h * 6], `동심 레듀서 ${b.nps} × ${s.nps}`, h), txt([x0, cy - R - h * 8], SRC, h * 0.6));
      return c;
    }
  });

  /* ---------- 양식 엔진 ---------- */
  const LSK = 'mucca.partform.';
  const remember = id => { try { return JSON.parse(localStorage.getItem(LSK + id) || '{}'); } catch (_) { return {}; } };
  const defaults = (F, given) => { const v = Object.assign({}, remember(F.id)); for (const fd of F.fields) if (v[fd.key] == null) v[fd.key] = fd.default; return Object.assign(v, given || {}); };
  const visible = (fd, v) => !fd.showIf || Object.entries(fd.showIf).every(([k, want]) => v[k] === want);
  function validate(F, v) {
    for (const fd of F.fields) { if (!visible(fd, v)) continue; const x = v[fd.key];
      if (fd.type === 'number') { if (!isFinite(+x)) return `${fd.label}: 숫자를 넣으세요`; if (fd.min != null && +x < fd.min) return `${fd.label}: ${fd.min} 이상`; if (fd.max != null && +x > fd.max) return `${fd.label}: ${fd.max} 이하`; }
      if (fd.type === 'select' && fd.options && !fd.options.some(o => o[0] === x)) return `${fd.label}: 고를 수 없는 값 (${x})`;
      if (fd.check) { const r = fd.check(v); if (r !== true) return r; } }
    return null;
  }
  const DRAWN = [];
  function draw(F, v, at) {
    const err = validate(F, v); if (err) throw new Error(err);
    const cmds = F.draw(v, at || spot()); const r = runBatch(cmds, { label: F.name });
    if (!r.ok) throw new Error(r.errors[0]);
    /* PDF 부품표(labpdfform)가 읽도록: 그린 표준 부품 기록 (지운 것은 엔티티가 없으면 빠짐) */
    const ids = []; for (const x of r.results || []) { if (x && x.id) ids.push(x.id); if (x && Array.isArray(x.ids)) ids.push(...x.ids); }
    DRAWN.push({ form: F.id, name: F.name, spec: F.spec ? F.spec(v) : (F.info ? F.info(v) : ''), values: Object.assign({}, v), ids, at: Date.now() });
    try { localStorage.setItem(LSK + F.id, JSON.stringify(v)); } catch (_) { }
    return { entities: cmds.length, info: F.info ? F.info(v) : '', values: v };
  }
  function open(F, given) {
    const v = defaults(F, given), box = document.createElement('div');
    box.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:8px 10px;align-items:center;min-width:min(420px,80vw)';
    const info = document.createElement('div'); info.style.cssText = 'grid-column:1/-1;font-size:12px;opacity:.85;line-height:1.5';
    const err = document.createElement('div'); err.style.cssText = 'grid-column:1/-1;font-size:12px;color:var(--danger,#d14)';
    const rows = [];
    const refresh = () => { for (const r of rows) { const on = visible(r.fd, v); r.lb.hidden = !on; r.el.hidden = !on; } info.textContent = F.info ? F.info(v) : ''; const e = validate(F, v); err.textContent = e || ''; ok.disabled = !!e; };
    for (const fd of F.fields) {
      const lb = document.createElement('label'); lb.textContent = fd.label; let el;
      if (fd.type === 'select') { el = document.createElement('select'); el.innerHTML = fd.options.map(o => `<option value="${o[0]}">${o[1]}</option>`).join(''); el.value = v[fd.key]; el.onchange = () => { v[fd.key] = el.value; refresh(); }; }
      else if (fd.type === 'check') { el = document.createElement('input'); el.type = 'checkbox'; el.checked = !!v[fd.key]; el.style.justifySelf = 'start'; el.onchange = () => { v[fd.key] = el.checked; refresh(); }; }
      else { el = document.createElement('input'); el.value = v[fd.key] ?? ''; if (fd.type === 'number') el.inputMode = 'decimal'; el.oninput = () => { v[fd.key] = fd.type === 'number' ? +el.value : el.value; refresh(); }; }
      rows.push({ fd, lb, el }); box.append(lb, el);
    }
    box.append(info, err);
    const ok = document.createElement('button'); ok.className = 'tbtn primary'; ok.textContent = '그리기';
    const m = modal(F.name + ' 그리기', [box], [ok]); refresh();
    ok.onclick = () => { try { const r = draw(F, v); m.remove(); try { zoomExtents(); } catch (_) { } log(`${F.name} 그림 — ${r.info}`, 'ok'); } catch (e) { err.textContent = e.message || String(e); } };
    return m;
  }
  const byId = id => FORMS.find(F => F.id === id);
  const match = key => { const raw = String(key || '').toUpperCase(), k = raw.replace(/\s+/g, '');   // 영문은 낱말 단위(STEEL 안의 TEE 는 아님), 한글은 붙여 쓴 것도
    const toks = raw.split(/\s+/);
    return FORMS.find(F => F.keywords.some(w => { const W = String(w).toUpperCase(); if (W[0] === '=') return toks.includes(W.slice(1));   // '=티' = 낱말로 '티' 만 (티타늄·파티션 X)
      return /^[A-Z0-9 ]+$/.test(W) ? new RegExp('(^|[^A-Z])' + W + '([^A-Z]|$)').test(raw) : k.includes(W.replace(/\s+/g, '')); })); };
  window.PARTFORMS = {
    add(def) { if (!def || !def.id || !Array.isArray(def.fields) || typeof def.draw !== 'function') throw new Error('id·fields·draw 가 필요합니다'); const i = FORMS.findIndex(F => F.id === def.id); if (i >= 0) FORMS[i] = def; else FORMS.push(def); return def.id; },
    list: () => FORMS.map(F => ({ id: F.id, name: F.name, keywords: F.keywords, fields: F.fields.map(fd => ({ key: fd.key, label: fd.label, type: fd.type, options: fd.options && fd.options.map(o => o[0]), default: fd.default, showIf: fd.showIf })) })),
    open: (id, v) => { const F = byId(id); if (!F) throw new Error('없는 양식: ' + id); return open(F, v); },
    draw: (id, v, at) => { const F = byId(id); if (!F) throw new Error('없는 양식: ' + id); return draw(F, defaults(F, v), at); },
    match, B169, sizesIn, drawn: () => DRAWN
  };
  /* 한글 입력 가로채기: 파이프·탱크(테스트판 labparts · 본체 parts.js) 앞에서 엘보·티·레듀서 */
  const hookParts = () => { const P = window.LABPARTS || window.MUCCAPARTS; if (!P || P.__forms) return !!(P && P.__forms); const orig = P.handle.bind(P);
    P.handle = key => { const F = match(key); if (F && !/파이프|배관|강관|탱크/.test(key)) { open(F); log(`'${key}' → ${F.name} 고르기 창`, 'ok'); return true; } return orig(key); }; P.__forms = true; return true; };
  if (!hookParts()) { let n = 0; const t = setInterval(() => { if (hookParts() || ++n > 40) clearInterval(t); }, 300); }
  /* 짧은 한글 입력('엘보 4인치' · '100A 레듀서 80A' · '티 DN150')은 AI 로 보내기 전에 양식을 크기 채운 채로 엶 */
  const DN = { 25: 'NPS 1', 32: 'NPS 1-1/4', 40: 'NPS 1-1/2', 50: 'NPS 2', 65: 'NPS 2-1/2', 80: 'NPS 3', 100: 'NPS 4', 125: 'NPS 5', 150: 'NPS 6', 200: 'NPS 8', 250: 'NPS 10', 300: 'NPS 12' };
  const INCH = { '1': 'NPS 1', '1-1/4': 'NPS 1-1/4', '1.25': 'NPS 1-1/4', '1-1/2': 'NPS 1-1/2', '1.5': 'NPS 1-1/2', '2': 'NPS 2', '2-1/2': 'NPS 2-1/2', '2.5': 'NPS 2-1/2', '3': 'NPS 3', '4': 'NPS 4', '5': 'NPS 5', '6': 'NPS 6', '8': 'NPS 8', '10': 'NPS 10', '12': 'NPS 12' };
  function sizesIn(t) {
    const out = [], re = /(?:NPS\s*)?(\d+(?:[-.]\d+(?:\/\d)?)?)\s*(인치|in(?:ch)?\b|"|B\b|A\b|(?=\s*$))|DN\s*(\d+)/gi; let m;
    while ((m = re.exec(t))) { if (m[3]) { if (DN[m[3]]) out.push(DN[m[3]]); continue; } const n = m[1], u = (m[2] || '').toUpperCase();
      if (u === 'A') { if (DN[n]) out.push(DN[n]); } else if (/NPS/i.test(m[0]) || u === '인치' || u.startsWith('IN') || u === '"' || u === 'B') { if (INCH[n]) out.push(INCH[n]); } }
    return out;
  }
  function preset(F, t) { const sz = sizesIn(t); if (!sz.length) return {}; if (F.id === 'reducer') { const v = { big: sz[0] }; if (sz[1]) v.small = sz[1]; if (sz[1] && B169.indexOf(size(sz[1])) > B169.indexOf(size(sz[0]))) { v.big = sz[1]; v.small = sz[0]; } return v; } return { nps: sz[0] }; }
  try {
    const _pre = preCommand;
    preCommand = function (orig) { const t = String(orig || '').trim();
      if (/[가-힣]/.test(t) && t.replace(/\s+/g, '').length <= 16 && !/파이프|배관|강관|탱크/.test(t)) { const F = match(t); if (F) { const v = preset(F, t); log('입력: ' + t, 'me'); open(F, v); log(`'${t}' → ${F.name} 고르기 창${Object.keys(v).length ? ' (크기 채움: ' + Object.values(v).join(' × ') + ')' : ''}`, 'ok'); return true; } }
      return _pre(orig); };
  } catch (e) { console.warn('partforms preCommand', e); }
  /* AI 명령 · 명령줄 */
  COMMANDS.part_form = c => { const at = c.at ? [+c.at[0], +c.at[1]] : null; return PARTFORMS.draw(String(c.id || ''), c.values || {}, at); };
  COMMANDS.part_form_list = () => ({ forms: PARTFORMS.list() });
  TOOLS.partelbow = () => { setTimeout(() => PARTFORMS.open('elbow90')); return null; };
  TOOLS.parttee = () => { setTimeout(() => PARTFORMS.open('tee')); return null; };
  TOOLS.partreducer = () => { setTimeout(() => PARTFORMS.open('reducer')); return null; };
  Object.assign(ALIAS, { ELBOW: 'partelbow', ELL: 'partelbow', TEE: 'parttee', REDUCER: 'partreducer' });
  Object.assign(CMD_KO, { partelbow: '엘보 그리기', parttee: '티 그리기', partreducer: '레듀서 그리기' });
  Object.assign(KO_CMD, { 엘보: 'partelbow', 엘보우: 'partelbow', 곡관: 'partelbow', 티: 'parttee', 동경티: 'parttee', 레듀서: 'partreducer', 리듀서: 'partreducer', 축소관: 'partreducer' });
  const G = `배관 이음쇠 (ASME B16.9 참고 치수) — 양식으로 바로 그리기
 · {"cmd":"part_form_list"} — 들어 있는 부품 양식과 칸 목록
 · {"cmd":"part_form","id":"elbow90","values":{"nps":"NPS 4","wall":true,"sch":"Sch40"},"at":[x,y]} — 엘보 90° LR (at = 굽힘 중심)
 · {"cmd":"part_form","id":"tee","values":{"nps":"NPS 6"}} · {"cmd":"part_form","id":"reducer","values":{"big":"NPS 4","small":"NPS 3"}}
   호칭은 "NPS 1" ~ "NPS 12" (DN25~DN300)`;
  const hook = () => { const g = window.LAB2D; if (g && typeof g.guide === 'string') { if (!g.guide.includes('part_form_list')) g.guide += '\n\n' + G; return true; } return false; };
  if (!hook()) { let n = 0; const t = setInterval(() => { if (hook() || ++n > 40) clearInterval(t); }, 500); }
})();
