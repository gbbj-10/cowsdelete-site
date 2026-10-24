/* 무카 CAD — 부품 고르고 그리기: 파이프  v1 · 2026-10-24 (테스트 서버 labparts.js 에서 파이프만 본체로 옮김)
   명령창에 '파이프'·'배관'·'강관'(또는 PIPE)을 치면:
   ① 무카 라이브러리에 같은 이름의 블록이 있으면 위에 보여 주고 바로 넣을 수 있게 함 (로그인 시)
   ② 아래에서 규격(KS/ASME)·호칭·스케줄·길이를 골라 공개 규격표대로 정면(단면)·측면을 그림
   치수 출처
   - KS: KS D 3562(압력배관용 탄소강관) · KS D 3576(배관용 스테인리스강관, Sch10S) — JIS G 3454/3459 와 같은 치수
   - ASME: B36.10M(탄소강, Sch40·80·160) · B36.19M(스테인리스, Sch10S) */
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

  TOOLS.partpipe = () => { setTimeout(openPipe); return null; };
  Object.assign(ALIAS, { PIPE: 'partpipe', PIPES: 'partpipe' });
  Object.assign(CMD_KO, { partpipe: '파이프 그리기' });
  Object.assign(KO_CMD, { 파이프: 'partpipe', 배관: 'partpipe', 강관: 'partpipe', 관: 'partpipe' });
  window.MUCCAPARTS = {
    handle(key) { // 한글 입력 안에 부품 이름이 들어 있으면 고르기 창 ('파이프에' 등)
      if (/파이프|배관|강관/.test(key)) { openPipe(); log(`'${key}' → 파이프 고르기 창`, 'ok'); return true; }
      return false;
    },
    pipeCmds, pipeData
  };
})();
