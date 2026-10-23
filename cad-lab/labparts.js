/* 무카 CAD 테스트 서버 — 부품 고르고 그리기 (파이프 · 탱크)  v1 · 2026-10-23
   명령창에 '파이프'·'탱크'(또는 PIPE·TANK)를 치면:
   ① 무카 라이브러리에 같은 이름의 블록이 있으면 위에 보여 주고 바로 넣을 수 있게 함
   ② 아래에서 규격·치수를 골라 공개 규격표·계산식대로 직접 그림
   치수 출처
   - KS: KS D 3562(압력배관용 탄소강관) · KS D 3576(배관용 스테인리스강관, Sch10S) — JIS G 3454/3459 와 같은 치수
   - ASME: B36.10M(탄소강, Sch40·80·160) · B36.19M(스테인리스, Sch10S)
   - 경판 모양: 2:1 반타원(깊이 = 내경/4), KS 접시형(크라운 R = 내경, 너클 r = 10%), ASME F&D(크라운 L = 외경, 너클 r = 6% 외경), 반구, 평판
   - 참고 두께: ASME Sec.VIII Div.1 UG-27(동체) · UG-32(경판) · App.1-4(d)(접시형 일반식) */
(function () {
  'use strict';
  const KS_SIZES = [ // 호칭, 인치, 외경, {10S,40,80,160}
    ['15A', '1/2B', 21.7, [2.1, 2.8, 3.7, 4.7]], ['20A', '3/4B', 27.2, [2.1, 2.9, 3.9, 5.5]],
    ['25A', '1B', 34.0, [2.8, 3.4, 4.5, 6.4]], ['32A', '1-1/4B', 42.7, [2.8, 3.6, 4.9, 6.4]],
    ['40A', '1-1/2B', 48.6, [2.8, 3.7, 5.1, 7.1]], ['50A', '2B', 60.5, [2.8, 3.9, 5.5, 8.7]],
    ['65A', '2-1/2B', 76.3, [3.0, 5.2, 7.0, 9.5]], ['80A', '3B', 89.1, [3.0, 5.5, 7.6, 11.1]],
    ['100A', '4B', 114.3, [3.0, 6.0, 8.6, 13.5]], ['125A', '5B', 139.8, [3.4, 6.6, 9.5, 15.9]],
    ['150A', '6B', 165.2, [3.4, 7.1, 11.0, 18.2]], ['200A', '8B', 216.3, [4.0, 8.2, 12.7, 23.0]],
    ['250A', '10B', 267.4, [4.0, 9.3, 15.1, 28.6]], ['300A', '12B', 318.5, [4.5, 10.3, 17.4, 33.3]]];
  const ASME_SIZES = [
    ['NPS 1/2', 'DN15', 21.3, [2.11, 2.77, 3.73, 4.78]], ['NPS 3/4', 'DN20', 26.7, [2.11, 2.87, 3.91, 5.56]],
    ['NPS 1', 'DN25', 33.4, [2.77, 3.38, 4.55, 6.35]], ['NPS 1-1/4', 'DN32', 42.2, [2.77, 3.56, 4.85, 6.35]],
    ['NPS 1-1/2', 'DN40', 48.3, [2.77, 3.68, 5.08, 7.14]], ['NPS 2', 'DN50', 60.3, [2.77, 3.91, 5.54, 8.74]],
    ['NPS 2-1/2', 'DN65', 73.0, [3.05, 5.16, 7.01, 9.53]], ['NPS 3', 'DN80', 88.9, [3.05, 5.49, 7.62, 11.13]],
    ['NPS 4', 'DN100', 114.3, [3.05, 6.02, 8.56, 13.49]], ['NPS 5', 'DN125', 141.3, [3.40, 6.55, 9.53, 15.88]],
    ['NPS 6', 'DN150', 168.3, [3.40, 7.11, 10.97, 18.26]], ['NPS 8', 'DN200', 219.1, [3.76, 8.18, 12.70, 23.01]],
    ['NPS 10', 'DN250', 273.0, [4.19, 9.27, 15.09, 28.58]], ['NPS 12', 'DN300', 323.8, [4.57, 10.31, 17.48, 33.32]]];
  const SCH = ['Sch10S', 'Sch40', 'Sch80', 'Sch160'];
  const STD = { KS: { name: 'KS D 3562 · 3576', sizes: KS_SIZES }, ASME: { name: 'ASME B36.10M · B36.19M', sizes: ASME_SIZES } };
  const HEADS = {
    SE: '2:1 반타원형 (깊이 = 내경/4)',
    KS10: 'KS 접시형 (R = 내경, r = 10%)',
    FD6: 'ASME F&D (L = 외경, r = 6%)',
    HEMI: '반구형',
    FLAT: '평판'
  };
  const f1 = v => (Math.round(v * 10) / 10).toString();
  const f2 = v => (Math.round(v * 100) / 100).toString();

  /* ---------- 라이브러리(공유 블록) 찾기 ---------- */
  async function searchLib(words) {
    const C = window.__muccaCloud; if (!C || !C.sb) return { login: false, rows: [] };
    let qb = C.sb.from('shared_items').select('id,kind,title,author_nick,sort_group,copies').eq('status', 'public').eq('kind', 'block')
      .or(words.map(w => `title.ilike.%${w}%`).join(','));
    const { data, error } = await qb.order('sort_group', { ascending: false }).order('copies', { ascending: false }).limit(8);
    if (error) return { login: true, rows: [], err: error.message };
    return { login: true, rows: data || [] };
  }
  async function insertLib(id) {
    const C = window.__muccaCloud;
    const { data, error } = await C.sb.rpc('community_copy', { item_id: id }); if (error) throw new Error(error.message);
    const d = data.data || {}; let name = String(d.name || data.title).replace(/[<>\/\\":;?*|,=`]/g, ' ').trim(), n = name, i = 2;
    while (BL()[n]) n = `${name}_${i++}`;
    for (const e of (d.block && d.block.ents) || []) if (e.layer) ensureLayer(e.layer);
    BL()[n] = d.block; const at = freeSpot();
    const r = runBatch([{ cmd: 'insert', name: n, at, scale: 1, rot: 0 }]); changed(); zoomExtents();
    log(`라이브러리 블록 '${data.title}' 넣음 (${data.author || '무카'})`, 'ok'); return r;
  }
  function libBox(words) {
    const box = document.createElement('div'); box.style.cssText = 'margin:0 0 10px;padding:8px 10px;border:1px solid var(--line,#ccc);border-radius:8px;font-size:13px';
    box.textContent = '무카 라이브러리에서 찾는 중…';
    searchLib(words).then(({ login, rows, err }) => {
      if (!login) { box.innerHTML = '라이브러리 블록은 로그인하면 함께 보여 드립니다. 아래에서 바로 그릴 수 있어요.'; return; }
      if (err || !rows.length) { box.innerHTML = '라이브러리에 맞는 블록이 없습니다 → 아래에서 골라 그리세요.'; return; }
      box.innerHTML = '<b>라이브러리에 있는 블록</b> (바로 넣기)';
      for (const r of rows) {
        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:4px';
        const t = document.createElement('span'); t.style.flex = '1'; t.textContent = `${r.title} · ${r.author_nick || ''}${r.sort_group > 0 ? ' (공개 규격)' : ''}`;
        let b;
        if (r.sort_group > 0) { b = document.createElement('button'); b.className = 'tbtn'; b.textContent = '넣기'; b.onclick = async () => { b.disabled = true; try { await insertLib(r.id); b.textContent = '넣음' } catch (e) { toast(e.message); b.disabled = false } }; }
        else { b = document.createElement('a'); b.className = 'tbtn'; b.textContent = '커뮤니티'; b.target = '_blank'; b.href = '/community/?q=' + encodeURIComponent(r.title); }
        row.append(t, b); box.append(row);
      }
    }).catch(() => { box.textContent = '라이브러리를 불러오지 못했습니다. 아래에서 바로 그릴 수 있어요.'; });
    return box;
  }
  function freeSpot() { const b = bbox(); return b ? [Math.ceil((b.maxX + 100) / 10) * 10, 0] : [0, 0]; }

  /* ---------- 폼 ---------- */
  function form(html) {
    const f = document.createElement('div'); f.className = 'qsf'; f.innerHTML = html;
    f.querySelectorAll('input,select').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
    return f;
  }
  const opt = (list, sel) => list.map(([v, t]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${t}</option>`).join('');

  /* ---------- 파이프 ---------- */
  function pipeData(std, idx, sch) { const s = STD[std].sizes[idx]; const od = s[2], t = s[3][sch]; return { std, label: s[0], alt: s[1], od, t, id: od - 2 * t, sch: SCH[sch] }; }
  function pipeCmds(p, L, o) {
    const [ox, oy] = o, R = p.od / 2, r = p.id / 2, c = [];
    const ks = Math.max(1, Math.round(Math.max(p.od, L / 3) / 120)); if (!(doc.dimScale >= ks)) c.push({ cmd: 'dim_scale', value: ks });
    const ring = (rr) => Array.from({ length: 72 }, (_, i) => [ox + rr * Math.cos(i * Math.PI / 36), oy + rr * Math.sin(i * Math.PI / 36)]);
    // 정면(단면)
    c.push({ cmd: 'hatch', loops: [ring(R), ring(r)], pattern: 'ANSI31', scale: Math.max(0.3, p.od / 100), layer: '외형선' });
    c.push({ cmd: 'circle', center: [ox, oy], r: R, layer: '외형선' }, { cmd: 'circle', center: [ox, oy], r: r, layer: '외형선' });
    c.push({ cmd: 'line', from: [ox - R - 5, oy], to: [ox + R + 5, oy], layer: '중심선' }, { cmd: 'line', from: [ox, oy - R - 5], to: [ox, oy + R + 5], layer: '중심선' });
    c.push({ cmd: 'dim_diameter', center: [ox, oy], r: R, angle: 45 });
    // 측면
    const sx = ox + R + Math.max(30, p.od * 0.6);
    c.push({ cmd: 'rect', from: [sx, oy - R], to: [sx + L, oy + R], layer: '외형선' });
    c.push({ cmd: 'line', from: [sx, oy + r], to: [sx + L, oy + r], layer: '숨은선' }, { cmd: 'line', from: [sx, oy - r], to: [sx + L, oy - r], layer: '숨은선' });
    c.push({ cmd: 'line', from: [sx - 5, oy], to: [sx + L + 5, oy], layer: '중심선' });
    c.push({ cmd: 'dim_linear', p1: [sx, oy - R], p2: [sx + L, oy - R], at: [sx + L / 2, oy - R - Math.max(12, p.od * 0.25)] });
    c.push({ cmd: 'dim_linear', p1: [sx + L, oy + R], p2: [sx + L, oy - R], at: [sx + L + Math.max(12, p.od * 0.25), oy], dir: 'v', prefix: 'Ø' });
    c.push({ cmd: 'dim_linear', p1: [sx, oy + r], p2: [sx, oy - r], at: [sx - Math.max(10, p.od * 0.2), oy], dir: 'v', prefix: 'Ø' });
    const h = Math.max(2.5, Math.min(10, p.od / 12));
    c.push({ cmd: 'text', at: [ox - R, oy - R - h * 4], text: `${STD[p.std].name}  ${p.label} (${p.alt})  ${p.sch}`, h });
    c.push({ cmd: 'text', at: [ox - R, oy - R - h * 6], text: `외경 Ø${f2(p.od)} · 두께 ${f2(p.t)} · 내경 Ø${f2(p.id)} · 길이 ${L}`, h: h * 0.8 });
    return c;
  }
  function openPipe() {
    const f = form(`<label>규격</label><select id="ppS">${opt([['KS', 'KS (KS D 3562·3576, 호칭 A)'], ['ASME', 'ASME (B36.10M·B36.19M, NPS)']], 'KS')}</select>
      <label>호칭</label><select id="ppN"></select>
      <label>스케줄</label><select id="ppC">${opt(SCH.map((s, i) => [String(i), s]), '1')}</select>
      <label>길이(mm)</label><input id="ppL" value="300">
      <label></label><div id="ppI" style="font-size:12px;opacity:.8"></div>`);
    const q = s => f.querySelector(s);
    const fill = () => { const st = q('#ppS').value, cur = q('#ppN').selectedIndex; q('#ppN').innerHTML = STD[st].sizes.map((s, i) => `<option value="${i}">${s[0]} (${s[1]})</option>`).join(''); q('#ppN').selectedIndex = cur >= 0 ? cur : 5; info(); };
    const info = () => { const p = pipeData(q('#ppS').value, +q('#ppN').value, +q('#ppC').value); q('#ppI').textContent = `외경 Ø${f2(p.od)} · 두께 ${f2(p.t)} · 내경 Ø${f2(p.id)}${p.sch === 'Sch10S' ? ' · 10S = 스테인리스관' : ''}`; };
    q('#ppS').onchange = fill; q('#ppN').onchange = info; q('#ppC').onchange = info; fill();
    const ok = document.createElement('button'); ok.className = 'tbtn primary'; ok.textContent = '그리기';
    const m = modal('파이프 그리기', [libBox(['파이프', '배관', '강관', 'PIPE']), f], [ok]);
    ok.onclick = () => {
      const p = pipeData(q('#ppS').value, +q('#ppN').value, +q('#ppC').value), L = Math.max(1, +q('#ppL').value || 300);
      const r = runBatch(pipeCmds(p, L, freeSpot()), { label: '파이프' }); if (!r.ok) { toast(r.errors[0]); return; }
      m.remove(); zoomExtents(); log(`파이프 ${p.label} ${p.sch} (${STD[p.std].name}) 그림 — 외경 Ø${f2(p.od)}, 두께 ${f2(p.t)}`, 'ok');
    };
  }

  /* ---------- 탱크(압력용기) ---------- */
  // 경판 안쪽/바깥 윤곽: 접선(T.L)에서 바깥으로 z(축 방향) · ρ(반지름) 점 목록. z=0 이 접선.
  function headProfile(type, a, th, sf, ts) {
    const N = 24, inn = [], out = [];
    if (type === 'FLAT') { // 평판: 동체 끝에 판을 붙임
      const R = a + ts; return { inn: [[0, a], [0, 0]], out: [[0, R], [th, R], [th, 0]], depth: 0, sf: 0, note: '평판 (두께 ' + th + ')' };
    }
    inn.push([0, a]); out.push([0, a + th]);
    if (sf > 0) { inn.push([sf, a]); out.push([sf, a + th]); }
    let depth;
    if (type === 'SE') {
      const b = a / 2; depth = b; // 2:1 → 깊이 = D/4
      for (let i = 1; i <= N; i++) { const u = i / N * Math.PI / 2, z = b * Math.sin(u), rho = a * Math.cos(u);
        const nz = Math.sin(u) / b, nr = Math.cos(u) / a, nl = Math.hypot(nz, nr);
        inn.push([sf + z, rho]); out.push([sf + z + th * nz / nl, rho + th * nr / nl]); }
      return { inn, out, depth, sf, note: '2:1 반타원 · 깊이 h = D/4 = ' + f1(depth) };
    }
    if (type === 'HEMI') {
      depth = a;
      for (let i = 1; i <= N; i++) { const u = i / N * Math.PI / 2; inn.push([sf + a * Math.sin(u), a * Math.cos(u)]); out.push([sf + (a + th) * Math.sin(u), (a + th) * Math.cos(u)]); }
      return { inn, out, depth, sf, note: '반구 · R = D/2 = ' + f1(a) };
    }
    // 접시형(토리구형)
    const D = 2 * a, Do = D + 2 * th;
    const Rc = type === 'FD6' ? Do - th : D;          // 안쪽 크라운 반지름 (ASME: L = 외경 → 안쪽 L-t)
    const rk = type === 'FD6' ? 0.06 * Do : 0.1 * D;  // 너클 반지름
    const zc = Math.sqrt((Rc - rk) ** 2 - (a - rk) ** 2);
    depth = Rc - zc; const th1 = Math.atan2(zc, a - rk);
    for (let i = 1; i <= N / 2; i++) { const u = th1 * i / (N / 2);
      inn.push([sf + rk * Math.sin(u), (a - rk) + rk * Math.cos(u)]); out.push([sf + (rk + th) * Math.sin(u), (a - rk) + (rk + th) * Math.cos(u)]); }
    for (let i = 1; i <= N; i++) { const u = th1 + (Math.PI / 2 - th1) * i / N;
      inn.push([sf - zc + Rc * Math.sin(u), Rc * Math.cos(u)]); out.push([sf - zc + (Rc + th) * Math.sin(u), (Rc + th) * Math.cos(u)]); }
    return { inn, out, depth, sf, Rc, rk, note: `${type === 'FD6' ? 'ASME F&D' : 'KS 접시형'} · 크라운 R ${f1(Rc)} · 너클 r ${f1(rk)} · 깊이 h ${f1(depth)}` };
  }
  function reqThk(type, Di, P, S, E, CA, th) { // ASME VIII-1 (MPa · mm)
    const R = Di / 2 + CA, D = Di + 2 * CA;
    const shell = P * R / (S * E - 0.6 * P) + CA;
    let head = null, how = '';
    if (type === 'SE') { head = P * D / (2 * S * E - 0.2 * P) + CA; how = 'UG-32 t = PD/(2SE-0.2P)'; }
    else if (type === 'HEMI') { head = P * R / (2 * S * E - 0.2 * P) + CA; how = 'UG-32 t = PL/(2SE-0.2P)'; }
    else if (type === 'FD6' || type === 'KS10') { const L = type === 'FD6' ? D + (th || 0) : D, r = type === 'FD6' ? 0.06 * (D + 2 * (th || 0)) : 0.1 * D, M = 0.25 * (3 + Math.sqrt(L / r));
      head = P * L * M / (2 * S * E - 0.2 * P) + CA; how = `App.1-4(d) t = PLM/(2SE-0.2P), M = ${f2(M)}`; }
    else how = '평판은 UG-34(부착 방식 계수 C)로 따로 계산';
    return { shell, head, how };
  }
  function tankCmds(o, g) {
    const { Di, Ls, ts, th, type, sf, vert, P, S, E, CA } = g, a = Di / 2;
    const hp = headProfile(type, a, th, sf, ts);
    const half = Ls / 2;
    // 축 좌표(z) → 도면 좌표. 가로: x=z, y=ρ / 세로: x=ρ, y=z
    const T = (z, rho) => vert ? [o[0] + rho, o[1] + z] : [o[0] + z, o[1] + rho];
    const loop = prof => { const right = prof.map(([z, rho]) => [half + z, rho]); const left = prof.map(([z, rho]) => [-half - z, rho]).reverse();
      const top = left.concat(right); return top.concat(top.slice().reverse().map(([z, rho]) => [z, -rho])); };
    const innLoop = loop(hp.inn);
    // 바깥 윤곽을 접선 기준으로 다시 만든다(정확한 계단)
    const outTop = [];
    const rightOut = (type === 'FLAT' ? [[0, a + ts], ...hp.out.slice(1)] : hp.out).map(([z, rho]) => [half + z, rho]);
    const leftOut = rightOut.map(([z, rho]) => [-z, rho]).reverse();
    outTop.push(...leftOut);
    if (type !== 'FLAT' && Math.abs(th - ts) > 1e-9) { outTop.push([-half, a + ts], [half, a + ts]); }
    outTop.push(...rightOut);
    const outBot = outTop.slice().reverse().map(([z, rho]) => [z, -rho]);
    const OUT = outTop.concat(outBot).map(p => T(p[0], p[1])), INN = innLoop.map(p => T(p[0], p[1]));
    const c = [];
    const ks = Math.max(1, Math.round(Di / 120)); if (!(doc.dimScale >= ks)) c.push({ cmd: 'dim_scale', value: ks });
    c.push({ cmd: 'hatch', loops: [OUT, INN], pattern: 'ANSI31', scale: Math.max(0.5, Di / 200), layer: '외형선' });
    c.push({ cmd: 'polyline', points: OUT, closed: true, layer: '외형선' }, { cmd: 'polyline', points: INN, closed: true, layer: '외형선' });
    const ext = half + (type === 'FLAT' ? th : hp.sf + hp.depth + th);
    c.push({ cmd: 'line', from: T(-ext - 20, 0), to: T(ext + 20, 0), layer: '중심선' });
    for (const s of [-1, 1]) c.push({ cmd: 'line', from: T(s * half, -a - Math.max(ts, th) - 15), to: T(s * half, a + Math.max(ts, th) + 15), layer: '중심선' });
    const gap = Math.max(15, Di * 0.08), R0 = a + Math.max(ts, th);
    if (!vert) {
      c.push({ cmd: 'dim_linear', p1: T(-half, R0), p2: T(half, R0), at: T(0, R0 + gap), text: `T.L~T.L ${f1(Ls)}` });
      c.push({ cmd: 'dim_linear', p1: T(-ext, 0), p2: T(ext, 0), at: T(0, -R0 - gap * 2), dir: 'h', text: `전체 ${f1(2 * ext)}` });
      if (type !== 'FLAT') c.push({ cmd: 'dim_linear', p1: T(half + hp.sf, -a), p2: T(half + hp.sf + hp.depth, 0), at: T(half + hp.sf + hp.depth / 2, -R0 - gap), dir: 'h', text: `h ${f1(hp.depth)}` });
      c.push({ cmd: 'dim_linear', p1: T(-half * 0.5, a), p2: T(-half * 0.5, -a), at: T(-half * 0.5 + gap, 0), dir: 'v', prefix: 'Ø', text: `ID Ø${f1(Di)}` });
    } else {
      c.push({ cmd: 'dim_linear', p1: T(-half, R0), p2: T(half, R0), at: T(0, R0 + gap), dir: 'v', text: `T.L~T.L ${f1(Ls)}` });
      c.push({ cmd: 'dim_linear', p1: T(-ext, 0), p2: T(ext, 0), at: T(0, -R0 - gap * 2), dir: 'v', text: `전체 ${f1(2 * ext)}` });
      c.push({ cmd: 'dim_linear', p1: T(-half * 0.5, a), p2: T(-half * 0.5, -a), at: T(-half * 0.5 + gap, 0), dir: 'h', text: `ID Ø${f1(Di)}` });
    }
    c.push({ cmd: 'text', at: T(half + 3, R0 + 3), text: 'T.L', h: Math.max(2.5, Di / 50) });
    // 사양·계산 표기
    const h = Math.max(3, Di / 40), b = vert ? [o[0] - R0, o[1] - ext - gap * 4] : [o[0] - ext, o[1] - R0 - gap * 4];
    const lines = [`탱크  ID Ø${f1(Di)} · 동체 t${ts} · 경판 t${th} · T.L~T.L ${f1(Ls)}`, `경판: ${hp.note}${type !== 'FLAT' ? ' · 직선부 S.F ' + f1(hp.sf) : ''}`];
    if (P > 0 && S > 0) {
      const rq = reqThk(type, Di, P, S, E, CA, th);
      lines.push(`참고 필요 두께 (ASME VIII-1, P ${P} MPa · S ${S} MPa · E ${E} · C.A ${CA}): 동체 ${f2(rq.shell)} ${rq.shell <= ts ? 'OK' : '부족'}` +
        (rq.head != null ? ` · 경판 ${f2(rq.head)} ${rq.head <= th ? 'OK' : '부족'} (${rq.how})` : ` · ${rq.how}`));
      lines.push('동체 UG-27 t = PR/(SE-0.6P) — 성형 감소 두께·노즐 보강·외압은 따로 검토');
    }
    lines.forEach((s, i) => c.push({ cmd: 'text', at: [b[0], b[1] - i * h * 1.8], text: s, h: i ? h * 0.75 : h }));
    return c;
  }
  function openTank() {
    const f = form(`<label>내경 ID(mm)</label><input id="tkD" value="1000">
      <label>동체 길이 T.L~T.L</label><input id="tkL" value="2000">
      <label>동체 두께(mm)</label><input id="tkTs" value="6">
      <label>경판 종류</label><select id="tkH">${opt(Object.entries(HEADS), 'SE')}</select>
      <label>경판 두께(mm)</label><input id="tkTh" value="8">
      <label>직선부 S.F(mm)</label><input id="tkSf" value="40">
      <label>방향</label><select id="tkV">${opt([['h', '가로(횡형)'], ['v', '세로(입형)']], 'h')}</select>
      <label></label><div style="font-size:12px;opacity:.8">아래는 선택: 넣으면 ASME 식으로 필요 두께를 참고로 적어 드립니다</div>
      <label>설계 압력 P(MPa)</label><input id="tkP" placeholder="예: 0.98">
      <label>허용 응력 S(MPa)</label><input id="tkS" placeholder="예: 138 (SA-516-70)">
      <label>용접 효율 E</label><input id="tkE" value="0.85">
      <label>부식 여유(mm)</label><input id="tkC" value="0">
      <label></label><div id="tkI" style="font-size:12px;opacity:.8"></div>`);
    const q = s => f.querySelector(s), n = (s, d) => { const v = parseFloat(q(s).value); return isFinite(v) ? v : d; };
    const info = () => { const t = q('#tkH').value, a = n('#tkD', 1000) / 2, th = n('#tkTh', 8);
      const hp = t === 'FLAT' ? { note: '평판' } : headProfile(t, a, th, n('#tkSf', 40), n('#tkTs', 6)); q('#tkI').textContent = hp.note;
      q('#tkSf').disabled = t === 'FLAT'; };
    f.querySelectorAll('input,select').forEach(i => i.addEventListener('input', info)); info();
    const ok = document.createElement('button'); ok.className = 'tbtn primary'; ok.textContent = '그리기';
    const m = modal('탱크(압력용기) 그리기', [libBox(['탱크', '저장조', '압력용기', '경판', 'TANK']), f], [ok]);
    ok.onclick = () => {
      const g = { Di: n('#tkD', 1000), Ls: n('#tkL', 2000), ts: n('#tkTs', 6), th: n('#tkTh', 8), type: q('#tkH').value, sf: Math.max(0, n('#tkSf', 40)), vert: q('#tkV').value === 'v',
        P: n('#tkP', 0), S: n('#tkS', 0), E: n('#tkE', 1), CA: n('#tkC', 0) };
      if (!(g.Di > 0 && g.Ls > 0 && g.ts > 0 && g.th > 0)) { toast('내경·길이·두께는 0보다 커야 합니다'); return; }
      const r = runBatch(tankCmds(freeSpot(), g), { label: '탱크' }); if (!r.ok) { toast(r.errors[0]); return; }
      m.remove(); zoomExtents(); log(`탱크 ID Ø${g.Di} · ${HEADS[g.type]} 경판 그림 (치수는 입력값, 경판 모양은 계산식)`, 'ok');
    };
  }

  /* ---------- 연결 ---------- */
  TOOLS.partpipe = () => { setTimeout(openPipe); return null; };
  TOOLS.parttank = () => { setTimeout(openTank); return null; };
  Object.assign(ALIAS, { PIPE: 'partpipe', PIPES: 'partpipe', TANK: 'parttank', VESSEL: 'parttank' });
  Object.assign(CMD_KO, { partpipe: '파이프 그리기', parttank: '탱크 그리기' });
  Object.assign(KO_CMD, { 파이프: 'partpipe', 배관: 'partpipe', 강관: 'partpipe', 관: 'partpipe', 탱크: 'parttank', 압력용기: 'parttank', 저장조: 'parttank', 저장탱크: 'parttank', 경판: 'parttank', 용기: 'parttank' });
  window.LABPARTS = {
    handle(key) { // 한글 입력 안에 부품 이름이 들어 있으면 고르기 창
      if (/파이프|배관|강관/.test(key)) { openPipe(); log(`'${key}' → 파이프 고르기 창`, 'ok'); return true; }
      if (/탱크|압력용기|저장조|경판/.test(key)) { openTank(); log(`'${key}' → 탱크 고르기 창`, 'ok'); return true; }
      return false;
    },
    pipeCmds, tankCmds, headProfile, reqThk, pipeData
  };
})();
