/* 무카 CAD 테스트 서버 — AI 입력칸 진행 단계 카드 (2026-11-03, assistant-ui 방식)
   내 AI가 그리는 동안 도구를 부를 때마다 한 줄씩 쌓아서 보여 줌(명령표 확인 → 그리는 중 → 화면 확인 …, 단계별 걸린 시간)
   끝나면 결과 한 줄 + [요청 고쳐 다시 보내기] · [다시 보내기] · [새 대화로 다시]
   본체 aiEvent 에 window.__aiEvtHook 한 줄을 끼움(make-lab.py) · 연결 프로그램 그대로 */
(function () {
  'use strict';
  const KO = { WebSearch: '공개 자료 검색', WebFetch: '공개 자료 읽기', mucca_guide: '명령표 확인', mucca_draw: '그리는 중', mucca_state: '도면 확인', mucca_list: '도형 읽기', mucca_snapshot: '화면 보기', mucca_undo: '되돌리기', mucca_pairing_code: '연결 확인' };
  const ICON = { mucca_guide: '📖', mucca_draw: '✏️', mucca_state: '📐', mucca_list: '📋', mucca_snapshot: '👁', mucca_undo: '↩', WebSearch: '🔎', WebFetch: '🌐' };
  const ENG = { claude: 'Claude', codex: 'GPT', gemini: 'Gemini' };
  let card = null, steps = [], t0 = 0, last = null, lastReq = '', timer = null, thought = '';
  const sec = ms => (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + '초';
  const css = `#aiSteps{margin:6px 0 2px;border:1px solid var(--rule);border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.45;background:var(--chrome-2,transparent)}
#aiSteps .h{display:flex;justify-content:space-between;gap:8px;font-weight:600;margin-bottom:4px}#aiSteps .h small{font-weight:400;opacity:.75;font-family:var(--mono)}
#aiSteps ol{margin:0;padding:0;list-style:none;display:grid;gap:2px;max-height:180px;overflow:auto}
#aiSteps li{display:grid;grid-template-columns:18px 1fr auto;gap:6px;align-items:center}#aiSteps li .t{opacity:.7;font-family:var(--mono);font-size:11.5px}
#aiSteps li.run .n::after{content:' …';animation:aisBlink 1s steps(2) infinite}@keyframes aisBlink{50%{opacity:.2}}
#aiSteps .th{margin-top:4px;opacity:.75;font-size:12px;max-height:3.2em;overflow:hidden}
#aiSteps .end{margin-top:6px;padding-top:6px;border-top:1px dashed var(--rule)}#aiSteps .end.ok b{color:var(--ok,#2a8)}#aiSteps .end.bad b{color:var(--danger,#d14)}
#aiSteps .bt{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}@media (prefers-reduced-motion:reduce){#aiSteps li.run .n::after{animation:none}}`;
  function ensure() {
    if (!document.getElementById('aiStepsCss')) { const st = document.createElement('style'); st.id = 'aiStepsCss'; st.textContent = css; document.head.appendChild(st); }
    if (card && card.isConnected) return card;
    const st = document.getElementById('aiSt'); if (!st) return null;
    card = document.createElement('div'); card.id = 'aiSteps'; card.setAttribute('aria-live', 'polite'); st.after(card); return card;
  }
  function render(end) {
    const c = ensure(); if (!c) return; c.hidden = false;
    const a = window.__aic || {}, eng = ENG[(a.engines ? a.engine : 'claude')] || 'AI', now = performance.now();
    const rows = steps.map((s, i) => { const run = !end && i === steps.length - 1; const d = (steps[i + 1] ? steps[i + 1].at : (end ? end.at : now)) - s.at;
      return `<li class="${run ? 'run' : ''}"><span>${s.icon}</span><span class="n">${s.name}${s.count > 1 ? ` ×${s.count}` : ''}</span><span class="t">${sec(d)}</span></li>`; }).join('');
    const head = `<div class="h"><span>${eng} 진행 단계</span><small>${sec((end ? end.at : now) - t0)}</small></div>`;
    const th = !end && thought ? `<div class="th">💭 ${esc(thought.slice(-160))}</div>` : '';
    let tail = '';
    if (end) tail = `<div class="end ${end.ok ? 'ok' : 'bad'}"><b>${end.ok ? '끝남' : '실패'}</b> · 단계 ${steps.length}개 · ${sec(end.at - t0)}${end.text ? '<div style="margin-top:3px;white-space:pre-line">' + esc(end.text.slice(0, 300)) + '</div>' : ''}</div><div class="bt"></div>`;
    c.innerHTML = head + `<ol>${rows || '<li><span>⏳</span><span class="n">요청 보내는 중</span><span class="t"></span></li>'}</ol>` + th + tail;
    if (end) { const bt = c.querySelector('.bt');
      const b = (txt, cls, fn) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'tbtn' + (cls ? ' ' + cls : ''); x.textContent = txt; x.onclick = fn; bt.appendChild(x); };
      if (lastReq) { b('요청 고쳐 다시 보내기', 'primary', () => { const i = document.getElementById('aiIn'); if (i) { i.value = lastReq; i.focus(); i.setSelectionRange(i.value.length, i.value.length); } c.hidden = true; });
        b('다시 보내기', '', () => resend(false)); b('새 대화로 다시', '', () => resend(true)); }
      b('닫기', '', () => { c.hidden = true; }); }
    const ol = c.querySelector('ol'); if (ol) ol.scrollTop = ol.scrollHeight;
  }
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  async function resend(fresh) {
    const a = window.__aic, i = document.getElementById('aiIn'), b = document.getElementById('bAi'); if (!a || a.state !== 'on' || a.busy || !i || !b) return;
    if (fresh) { a.newChat = true; try { window.__aicPost && await window.__aicPost('/newchat'); } catch (_) { } }
    i.value = lastReq; b.click(); try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: fresh ? 'AI_STEPS_NEW' : 'AI_STEPS_RESEND' }); } catch (_) { }
  }
  window.__aiEvtHook = d => {
    const now = performance.now();
    if (d.kind === 'start') { steps = []; thought = ''; t0 = now; last = null; clearInterval(timer); timer = setInterval(() => render(), 500); render(); return; }
    if (!t0) { t0 = now; clearInterval(timer); timer = setInterval(() => render(), 500); }
    if (d.kind === 'tool') { const raw = String(d.name || '').replace(/^.*(mucca_(?:guide|draw|state|list|snapshot|undo|pairing_code))$/, '$1').replace(/^(google_)?web_search$/i, 'WebSearch').replace(/^web_fetch$/i, 'WebFetch'); d = Object.assign({}, d, { name: raw }); const name = KO[raw] || raw || '도구'; const top = steps[steps.length - 1];
      if (top && top.raw === d.name) top.count++; else steps.push({ raw: d.name, name, icon: ICON[d.name] || '🔧', at: now, count: 1 }); thought = ''; render(); return; }
    if (d.kind === 'text') { thought = String(d.text || '').trim(); return; }
    if (d.kind === 'done' || d.kind === 'error') { clearInterval(timer); timer = null; last = { ok: d.kind === 'done' && d.ok !== false, at: now, text: String(d.text || '').trim() }; render(last); t0 = 0; }
  };
  /* 사용자가 [그리기] 누를 때 요청 기억 */
  const hookBtn = () => { const b = document.getElementById('bAi'); if (!b || b.__steps) return !!b; b.__steps = true;
    b.addEventListener('click', () => { const a = window.__aic; if (!a || a.state !== 'on' || a.busy) return; const v = (document.getElementById('aiIn') || {}).value; if (v && v.trim()) lastReq = v.trim(); }, true); return true; };
  if (!hookBtn()) { let n = 0; const t = setInterval(() => { if (hookBtn() || ++n > 60) clearInterval(t); }, 500); }
  window.LABAISTEPS = { get steps() { return steps; }, get lastReq() { return lastReq; }, set lastReq(v) { lastReq = v; } };
})();
