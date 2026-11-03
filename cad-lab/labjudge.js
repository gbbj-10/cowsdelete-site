/* 무카 CAD 테스트 서버 — 판정 AI (2026-11-03, Multi-Agent-CAD 의 '따로 검사하는 Judge' 방식)
   오른쪽 AI 입력칸으로 그린 뒤, [판정 AI로 한 번 더 확인] 을 켜 두면
   ① 새 대화(만든 과정을 모르는 AI)로 '그리지 말고 판정만' 요청 → 5면 자가검사·화면을 보고 합격/불합격 + 고칠 점
   ② 불합격이면 [판정대로 고치기] 버튼 → 판정한 대화에 고치라고 요청 (model3d_code 로 지금 코드를 읽고 고침)
   사용자 AI 사용량이 한 번 더 듭니다(기본 꺼짐). 연결 프로그램은 그대로(기존 /prompt 사용). */
(function () {
  'use strict';
  const LSK = 'mucca.judge', MAXFIX = 1;
  const A = () => window.__aic, post = (...a) => window.__aicPost(...a);
  let on = false; try { on = localStorage.getItem(LSK) === '1'; } catch (_) { }
  let lastReq = '', phase = 'idle', fixes = 0, verdictText = '';   // phase: idle · user · judge · fix
  const st = () => document.getElementById('aiSt'), inp = () => document.getElementById('aiIn'), btn = () => document.getElementById('bAi');
  const evt = c => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: c }); } catch (_) { } };

  function ui() {
    const b = btn(); if (!b || document.getElementById('aiJudgeOpt')) return !!b;
    const wrap = document.createElement('label'); wrap.id = 'aiJudgeOpt'; wrap.style.cssText = 'display:flex;gap:6px;align-items:flex-start;margin:6px 0 2px;font-size:12px;line-height:1.45;color:var(--ink-dim);cursor:pointer';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = on; cb.style.marginTop = '2px';
    cb.onchange = () => { on = cb.checked; try { localStorage.setItem(LSK, on ? '1' : '0'); } catch (_) { } evt(on ? 'AI_JUDGE_ON' : 'AI_JUDGE_OFF'); };
    const t = document.createElement('span'); t.innerHTML = '<b>판정 AI로 한 번 더 확인</b> — 다 그리면 만든 과정을 모르는 새 AI가 5면 그림·점검 결과로 합격/불합격을 판정합니다 (AI 사용량이 한 번 더 듭니다)';
    wrap.append(cb, t);
    const anchor = document.getElementById('aiNew') || b; (anchor.parentElement || b.parentElement).after(wrap);
    /* 사용자가 [그리기] 누를 때 요청 글 기억 */
    b.addEventListener('click', () => { const a = A(); if (!a || a.state !== 'on' || a.busy) return; const v = (inp() && inp().value || '').trim(); if (v) { lastReq = v; phase = 'user'; fixes = 0; } }, true);
    return true;
  }
  function verdictBox(text, pass) {
    let box = document.getElementById('aiJudgeBox');
    if (!box) { box = document.createElement('div'); box.id = 'aiJudgeBox'; box.style.cssText = 'margin:6px 0 2px;display:grid;gap:6px;border:1px solid var(--rule);border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.5'; (document.getElementById('aiJudgeOpt') || st()).after(box); }
    box.hidden = false; box.style.borderColor = pass ? 'var(--ok,#2a8)' : 'var(--danger,#d14)';
    const h = document.createElement('b'); h.textContent = pass ? '판정 AI: 합격' : '판정 AI: 불합격 — 고칠 점';
    const p = document.createElement('div'); p.style.whiteSpace = 'pre-line'; p.textContent = text.replace(/^\s*판정\s*[:：]\s*(합격|불합격)\s*/,'').trim() || '(설명 없음)';
    const kids = [h, p];
    if (!pass && fixes < MAXFIX) { const f = document.createElement('button'); f.className = 'tbtn primary'; f.textContent = '판정대로 고치기'; f.onclick = () => { box.hidden = true; fix(); }; kids.push(f); }
    const x = document.createElement('button'); x.className = 'tbtn'; x.textContent = '닫기'; x.onclick = () => { box.hidden = true; }; kids.push(x);
    box.replaceChildren(...kids);
  }
  async function judge() {
    phase = 'judge'; evt('AI_JUDGE');
    const prompt = `[무카 CAD 판정 요청 — 그리지 말고 판정만 하세요]
당신은 방금 만들어진 결과를 처음 보는 검사자입니다. 아래 사용자 요청과 지금 무카 CAD 화면의 결과를 비교해 판정만 합니다.
도형을 고치거나 새로 그리지 마세요. mucca_draw 는 확인용 명령만 씁니다: {"cmd":"model3d_views"} · {"cmd":"model3d_inspect"} · {"cmd":"model3d_code"} · {"cmd":"audit"}.
사용자 요청: «${lastReq.slice(0, 1500)}»
확인 순서: mucca_state 로 도면을 보고, 3D 모델이 있으면 mucca_draw 로 {"cmd":"model3d_views"} 를 실행한 뒤 mucca_snapshot 으로 5면 그림을 봅니다. 2D 도면이면 mucca_snapshot 으로 봅니다.
판정 기준: 요청한 치수·개수·구멍·위치가 맞는지, 부품이 크게 겹치거나 떠 있지 않은지, 빠진 것이 없는지.
답(한국어, 6줄 이내): 첫 줄은 정확히 '판정: 합격' 또는 '판정: 불합격'. 다음 줄부터 '- 고칠 점'을 최대 4개(부품 번호·치수를 넣어서). 합격이면 확인한 핵심 치수 한 줄.`;
    const a = A(); const r = await post('/prompt', { text: prompt, newChat: true, engine: a.engines ? a.engine : 'claude' });
    if (!r || !r.ok) { phase = 'idle'; if (st()) st().textContent = '판정 AI를 부르지 못했습니다: ' + ((r && r.error) || ''); }
    else log('판정 AI(새 대화)가 결과를 확인하는 중…', 'me');
  }
  async function fix() {
    phase = 'fix'; fixes++; evt('AI_JUDGE_FIX');
    const prompt = `방금 판정한 고칠 점대로 고쳐 주세요. 3D 모델이면 {"cmd":"model3d_code"} 로 지금 코드를 읽고, 고칠 부품만 같은 번호로 {"cmd":"model3d_add"} 로 다시 보내거나 model3d 를 고친 코드로 다시 실행하세요. 2D 도면이면 mucca_draw 로 고칩니다. 끝나면 {"cmd":"model3d_views"} 로 한 번 확인하고 고친 내용을 짧게 알려 주세요.
판정 내용:
${verdictText.slice(0, 1500)}`;
    const a = A(); const r = await post('/prompt', { text: prompt, newChat: false, engine: a.engines ? a.engine : 'claude' });
    if (!r || !r.ok) { phase = 'idle'; if (st()) st().textContent = '고치기 요청 실패: ' + ((r && r.error) || ''); } else log('판정대로 고치는 중…', 'me');
  }
  /* AI 가 끝났는지: 명령 기록에 'Claude: …'·'GPT: …'·'Gemini: …'(완료) 또는 'AI 실패: …' 줄이 새로 붙을 때 */
  function onLine(t, cls) {
    const ok = /^(Claude|GPT|Gemini): /.test(t), bad = /^AI 실패: /.test(t) || (cls === 'err' && /^AI/.test(t));
    if (!ok && !bad) return;
    const text = t.replace(/^(Claude|GPT|Gemini|AI 실패): /, '').trim();
    if (phase === 'user') { if (on && ok && lastReq) setTimeout(judge, 400); else phase = 'idle'; }
    else if (phase === 'judge') {
      if (bad) { phase = 'idle'; return; }
      const m = text.match(/판정\s*[:：]\s*(합격|불합격)/); verdictText = text;
      if (m) { verdictBox(text, m[1] === '합격'); evt(m[1] === '합격' ? 'AI_JUDGE_PASS' : 'AI_JUDGE_FAILV'); }
      else verdictBox('판정 AI 답에서 합격/불합격을 찾지 못했습니다:\n' + text.slice(0, 300), false);
      phase = 'idle';
    } else if (phase === 'fix') { phase = 'idle'; if (ok) log('판정대로 고쳤습니다. 다시 확인하려면 판정 확인을 켠 채 새 요청을 보내세요', 'ok'); }
  }
  const watch = () => { if (typeof histEl === 'undefined' || !histEl) return false;
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) onLine(n.textContent || '', n.className || ''); }).observe(histEl, { childList: true }); return true; };
  if (!watch()) { let k = 0; const t = setInterval(() => { if (watch() || ++k > 40) clearInterval(t); }, 500); }
  { let k = 0; const t = setInterval(() => { if (ui() || ++k > 120) clearInterval(t); }, 500); }
  window.LABJUDGE = { get on() { return on; }, set on(v) { on = !!v; }, judge, fix, get phase() { return phase; }, _state: () => ({ lastReq, phase, fixes, verdictText }) };
})();
