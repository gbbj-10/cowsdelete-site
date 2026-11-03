/* 무카 CAD 테스트 서버 — 규격 찾기 (2026-11-03, morphic 방식: 답 + 출처 + 바로 쓰기)
   "KS 10K 100A 플랜지 치수" 처럼 물으면
   ① 무카에 들어 있는 표(배관 이음쇠 ASME B16.9)면 바로 답과 출처를 보여 주고 [이 치수로 그리기] = 양식 창
   ② 아니면 내 AI(새 대화)에게 '웹에서 찾아 표 + 출처로만 답, 그리지 말 것'을 보내고, 답을 카드로 보여 줌
      → [이 치수로 그리기] (같은 대화에 그리기 요청) · [표 복사]
   명령줄: 규격찾기 · 규격검색 (SPEC) · AI 입력칸 아래 [🔎 규격 찾기] */
(function () {
  'use strict';
  const evt = c => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: c }); } catch (_) { } };
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  let pending = null;   // { q, modal, body }
  /* AI 답 형식: '규격: …' 줄 · '| 항목 | 값 | 단위 |' 표 · '출처: URL 제목' 줄 */
  function parse(text) {
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const title = (lines.find(l => /^규격\s*[:：]/.test(l)) || '').replace(/^규격\s*[:：]\s*/, '');
    const rows = lines.filter(l => /^\|/.test(l) && !/^\|\s*-/.test(l)).map(l => l.replace(/^\||\|$/g, '').split('|').map(s => s.trim())).filter(r => r.length >= 2 && !/^항목$/.test(r[0]));
    const src = []; for (const l of lines) { if (!/^(출처|source)/i.test(l)) continue; const u = (l.match(/https?:\/\/[^\s)>\]]+/) || [])[0]; src.push({ url: u || '', label: l.replace(/^(출처|source)\s*[:：]?\s*/i, '').replace(u || '', '').replace(/[()\[\]]/g, '').trim() || (u ? new URL(u).hostname : '') }); }
    const note = lines.filter(l => /^(참고|주의|비고)\s*[:：]/.test(l)).join('\n');
    return { title, rows, src, note, ok: rows.length > 0 };
  }
  function cardHTML(p, local) {
    const t = `<div style="font-weight:600;margin-bottom:6px">${esc(p.title || '찾은 규격')}</div>`;
    const tb = `<table style="border-collapse:collapse;width:100%;font:12.5px/1.5 var(--mono,monospace)">${p.rows.map(r => `<tr>${r.map((c, i) => `<td style="padding:3px 6px;border-bottom:1px solid var(--rule);${i ? 'text-align:right' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    const s = p.src.length ? `<div style="margin-top:8px;font-size:12px"><b>출처</b><ol style="margin:4px 0 0;padding-left:18px">${p.src.map(x => `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label || x.url)}</a>` : esc(x.label)}</li>`).join('')}</ol></div>` : '<div style="margin-top:8px;font-size:12px;color:var(--danger,#d14)">출처가 없습니다 — 그대로 쓰지 말고 확인하세요</div>';
    const n = p.note ? `<div style="margin-top:6px;font-size:12px;opacity:.85;white-space:pre-line">${esc(p.note)}</div>` : '';
    const w = `<div style="margin-top:6px;font-size:11.5px;opacity:.7">${local ? '무카에 들어 있는 표에서 찾았습니다.' : 'AI가 웹에서 찾은 값입니다. 제작·발주 전에는 출처 원문과 제작사 표로 꼭 확인하세요.'}</div>`;
    return t + tb + s + n + w;
  }
  /* ① 무카 내장 표 (배관 이음쇠) */
  function local(q) {
    const P = window.PARTFORMS; if (!P) return null; const F = P.match(q); if (!F) return null;
    const sz = P.sizesIn(q), B = P.B169, pick = n => B.find(s => s.nps === n);
    const s = pick(sz[0] || 'NPS 4'); if (!s) return null;
    const src = [{ url: 'https://www.asme.org/codes-standards/find-codes-standards/b16-9-factory-made-wrought-buttwelding-fittings', label: 'ASME B16.9 Factory-Made Wrought Buttwelding Fittings (무카 내장 표)' }, { url: 'https://www.asme.org/codes-standards/find-codes-standards/b36-10m-welded-seamless-wrought-steel-pipe', label: 'ASME B36.10M 외경 (무카 내장 표)' }];
    let rows, title, v;
    if (F.id === 'elbow90') { title = `엘보 90° LR ${s.nps} (${s.dn})`; rows = [['외경', String(s.od), 'mm'], ['중심-끝 A (= 굽힘 반지름)', String(s.A), 'mm']]; v = { nps: s.nps }; }
    else if (F.id === 'tee') { title = `동경 티 ${s.nps} (${s.dn})`; rows = [['외경', String(s.od), 'mm'], ['중심-끝 C', String(s.C), 'mm'], ['본관 길이 2C', String(2 * s.C), 'mm']]; v = { nps: s.nps }; }
    else { const b = s, sm = pick(sz[1] || '') || B[Math.max(0, B.indexOf(b) - 1)]; title = `동심 레듀서 ${b.nps} × ${sm.nps}`; rows = [['큰 쪽 외경', String(b.od), 'mm'], ['작은 쪽 외경', String(sm.od), 'mm'], ['길이 H', String(b.H), 'mm']]; v = { big: b.nps, small: sm.nps }; }
    return { F, v, p: { title, rows, src, note: '참고: 맞대기 용접 이음쇠 표준 치수. 제작사마다 공차가 있습니다.', ok: true } };
  }
  function open(q0) {
    const box = document.createElement('div'); box.style.cssText = 'display:grid;gap:8px;min-width:min(520px,86vw)';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px';
    const inp = document.createElement('input'); inp.placeholder = '예: KS B 1511 10K 100A 플랜지 치수 · 엘보 4인치 · M12 육각볼트'; inp.value = q0 || ''; inp.style.flex = '1';
    const go = document.createElement('button'); go.className = 'tbtn primary'; go.textContent = '찾기'; row.append(inp, go);
    const body = document.createElement('div'); body.style.cssText = 'font-size:13px;line-height:1.5';
    body.innerHTML = '<div style="opacity:.75;font-size:12px">무카에 들어 있는 표에 있으면 바로 보여 주고, 없으면 연결된 내 AI가 웹에서 찾아 <b>출처와 함께</b> 표로 답합니다 (AI 사용량 1번).</div>';
    box.append(row, body);
    const m = modal('규격 찾기 (출처와 함께)', [box]); try { m.querySelector('.sheet').style.maxWidth = 'min(720px,96vw)'; } catch (_) { }
    const run = () => search(inp.value.trim(), m, body); go.onclick = run; inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) run(); };
    setTimeout(() => inp.focus(), 50); if (q0) run(); return m;
  }
  async function search(q, m, body) {
    if (!q) return; evt('SPEC_ASK');
    const L = local(q);
    if (L) { body.innerHTML = cardHTML(L.p, true); const bt = btns(body); add(bt, '이 치수로 그리기', true, () => { m.remove(); window.PARTFORMS.open(L.F.id, L.v); }); add(bt, '표 복사', false, () => copy(L.p)); evt('SPEC_LOCAL'); return; }
    const a = window.__aic;
    if (!a || a.state !== 'on' || !window.__aicPost) { body.innerHTML = '<div>무카에 들어 있는 표에는 없습니다. 웹에서 찾으려면 상단 <b>[AI 연결]</b>로 내 AI를 연결하세요.</div>'; return; }
    if (a.busy) { body.innerHTML = '<div>내 AI가 다른 요청을 처리하는 중입니다. 끝난 뒤 다시 찾아 주세요.</div>'; return; }
    const prompt = `[무카 CAD 규격 찾기 — 그리지 말고 답만 하세요]
질문: «${q.slice(0, 300)}»
웹 검색으로 공개 규격표·제작사 카탈로그를 찾아, 아래 형식으로만 한국어로 답하세요. 무카 CAD 도구(mucca_draw 등)는 쓰지 마세요.
규격: <규격 이름과 호칭>
| 항목 | 값 | 단위 |
| ... | ... | mm |
출처: <URL> <문서 제목>
(출처 줄은 실제로 연 페이지만, 1~3개)
참고: <등급·재질·공차처럼 꼭 알아야 할 것 한 줄, 없으면 생략>
값을 못 찾았으면 표 없이 '찾지 못함: 이유' 한 줄만.`;
    pending = { q, m, body, t0: performance.now() };
    body.innerHTML = '<div>내 AI가 웹에서 찾는 중… (보통 20초~1분)</div>';
    const r = await window.__aicPost('/prompt', { text: prompt, newChat: true, engine: a.engines ? a.engine : 'claude' });
    if (!r || !r.ok) { pending = null; body.innerHTML = '<div style="color:var(--danger,#d14)">AI에게 보내지 못했습니다: ' + esc((r && r.error) || '') + '</div>'; }
  }
  const btns = body => { const d = document.createElement('div'); d.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:10px'; body.appendChild(d); return d; };
  const add = (bt, t, pri, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn' + (pri ? ' primary' : ''); b.textContent = t; b.onclick = fn; bt.appendChild(b); };
  async function copy(p) { const s = (p.title ? p.title + '\n' : '') + p.rows.map(r => r.join('\t')).join('\n') + (p.src.length ? '\n출처: ' + p.src.map(x => x.url || x.label).join(' , ') : ''); try { await navigator.clipboard.writeText(s); toast('표를 복사했습니다'); } catch (_) { openText('규격 표', '아래를 복사하세요', s); } }
  /* AI 답 받기 (AI 단계 카드 훅에 이어 붙임) */
  const prev = window.__aiEvtHook;
  window.__aiEvtHook = d => {
    try { prev && prev(d); } catch (_) { }
    if (!pending || (d.kind !== 'done' && d.kind !== 'error')) return;
    const P = pending; pending = null; const text = String(d.text || '');
    if (!P.m.isConnected) { log('규격 찾기 답: ' + text.slice(0, 200), 'ok'); return; }
    const p = parse(text);
    if (d.kind === 'error' || !p.ok) { P.body.innerHTML = `<div>${/찾지 못함/.test(text) ? '찾지 못했습니다' : '답을 표로 읽지 못했습니다'}:</div><div style="white-space:pre-line;opacity:.85;margin-top:4px">${esc(text.slice(0, 600))}</div>`; evt('SPEC_AI_NONE'); return; }
    P.body.innerHTML = cardHTML(p, false); evt(p.src.length ? 'SPEC_AI_OK' : 'SPEC_AI_NOSRC');
    const bt = btns(P.body);
    add(bt, '이 치수로 그리기', true, async () => { const a = window.__aic; if (!a || a.busy) return; P.m.remove();
      const tbl = p.rows.map(r => r.join(' ')).join(', ');
      await window.__aicPost('/prompt', { text: `방금 찾은 규격 «${p.title}» 의 치수(${tbl})로 무카 CAD 에 정면도와 주요 치수를 그려 주세요. 값은 바꾸지 말고, 도면 아래에 '${p.title} · 출처 ${p.src.map(x => x.url).filter(Boolean).slice(0, 1).join('')}' 를 작은 글자로 적어 주세요.`, newChat: false, engine: a.engines ? a.engine : 'claude' });
      log(`규격 «${p.title}» 치수로 그리는 중…`, 'me'); evt('SPEC_DRAW'); });
    add(bt, '표 복사', false, () => copy(p));
  };
  /* 명령줄 · 버튼 */
  TOOLS.specsearch = () => { setTimeout(() => open('')); return null; };
  Object.assign(ALIAS, { SPEC: 'specsearch', SPECSEARCH: 'specsearch' });
  Object.assign(CMD_KO, { specsearch: '규격 찾기' });
  Object.assign(KO_CMD, { 규격찾기: 'specsearch', 규격검색: 'specsearch', 치수찾기: 'specsearch', 규격표: 'specsearch' });
  const btn = () => { const ai = document.getElementById('aiIn'); if (!ai || document.getElementById('aiSpecBtn')) return !!ai;
    const b = document.createElement('button'); b.id = 'aiSpecBtn'; b.type = 'button'; b.className = 'tbtn'; b.textContent = '🔎 규격 찾기'; b.title = '규격 치수를 출처와 함께 찾기 (KS·ASME 등)';
    b.onclick = () => open((ai.value || '').trim());
    const bar = document.querySelector('.aiAttach'); if (bar) { const first = bar.querySelector('button'); b.style.cssText = 'margin-left:4px'; first ? first.after(b) : bar.prepend(b); } else { b.style.cssText = 'margin:6px 0 0'; ai.after(b); } return true; };
  if (!btn()) { let n = 0; const t = setInterval(() => { if (btn() || ++n > 60) clearInterval(t); }, 500); }
  window.LABSPEC = { open, parse, local, get pending() { return pending; } };
})();
