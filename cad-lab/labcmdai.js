/* [테스트 서버] 명령줄 = AI 입력창 (2026-10-25)
   1) 명령·별칭·부품 이름이면 지금처럼 바로 실행, 그 밖의 한글 문장은 전부 AI 로
   2) AI 가 연결돼 있으면 명령줄에서 바로 내 AI 에게 보냄 (오른쪽 창은 대화 기록)
   3) 연결 전이면 명령줄 바로 위에 카드: [AI 연결하기] · [커뮤니티에서 찾기] · 명령 약자 안내
   + 한글을 치는 동안 Space 는 띄어쓰기 (명령·문장 모두 Enter 로 실행 — '지름 50 원 그려줘' 가 '지름'에서 끊기지 않게), 입력칸 오른쪽에 "Enter: AI에게 보내기" 표시
   make-lab.py 가 본체의 '명령어가 아닙니다' 안내와 routeToAI 앞에 LABCMDAI.route 를 끼움 */
(function () {
  if (typeof cmdIn === 'undefined') return;
  const KO = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;
  const evt = c => { try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: c }); } catch (_) {} };
  const idle = () => !tool && !(typeof fence !== 'undefined' && fence) && !(typeof pendWin !== 'undefined' && pendWin);
  /* 지금 입력이 명령(바로 실행되는 것)인지 */
  function isCmd(v) {
    const t = v.trim(); if (!t) return true;
    if (t[0] === '[' || t[0] === '{') return true;
    const key = t.replace(/\s+/g, '');
    if (KO_CMD[key]) return true;
    let en = ''; try { en = ko2en(t).toUpperCase().replace(/\s+/g, ''); } catch (_) {}
    if (ALIAS[en] || ALIAS[t.toUpperCase()]) return true;
    if (typeof quickCircleTest === 'function' && quickCircleTest(t)) return true;
    if (/파이프|배관|강관|탱크|압력용기|저장조|경판/.test(key)) return true; // 부품 고르기 창
    return false;
  }
  const sentence = v => idle() && KO.test(v) && !isCmd(v);
  const A = () => window.__aic || {};
  const engOk = () => { const a = A(); if (a.state !== 'on') return false; const e = a.engines ? a.engine : 'claude'; return e === 'claude' ? !!a.claude : !!(a.engines && a.engines[e]); };

  /* --- 표시: 입력칸 오른쪽 작은 칩 --- */
  const st = document.createElement('style');
  st.textContent = `.cmd{position:relative}
#labAiChip{flex:none;font:11px/1 var(--mono);padding:4px 7px;border:1px solid var(--tag);border-radius:10px;color:var(--tag);white-space:nowrap;cursor:pointer;background:transparent}
#labAiChip[hidden]{display:none}
#labAiCard{position:absolute;left:12px;right:12px;bottom:100%;margin-bottom:6px;z-index:40;background:var(--chrome);border:1px solid var(--tag);border-radius:8px;padding:10px 12px;box-shadow:0 4px 18px rgba(0,0,0,.25);font:13px/1.55 system-ui,sans-serif;color:var(--ink);max-width:560px}
#labAiCard b{color:var(--tag)}#labAiCard .row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
#labAiCard .x{position:absolute;top:4px;right:6px;border:0;background:transparent;color:var(--ink-dim);font-size:16px;cursor:pointer}
#labAiCard .sub{color:var(--ink-dim);font-size:12px;margin-top:6px}`;
  document.head.appendChild(st);
  const chip = document.createElement('button'); chip.type = 'button'; chip.id = 'labAiChip'; chip.hidden = true;
  chip.onclick = () => { const v = cmdIn.value; cmdIn.value = ''; paint(); handleCommandText(v.replace(/\s+$/, '')); };
  cmdIn.after(chip);
  function paint() { const on = sentence(cmdIn.value); chip.hidden = !on; if (on) chip.textContent = engOk() ? 'Enter: 내 AI에게 보내기' : 'Enter: AI로 그리기 안내'; }
  ['input', 'keyup', 'compositionupdate', 'compositionend', 'focus'].forEach(k => cmdIn.addEventListener(k, () => setTimeout(paint, 0)));

  /* --- 한글 문장 입력 중에는 Space = 띄어쓰기 (명령 실행 아님) ---
     본체는 AutoCAD 처럼 Space 로 명령을 실행해서 '가로 300 세로 200' 이 '가로' 에서 끊김 */
  document.addEventListener('keydown', ev => {
    if (ev.target !== cmdIn || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (!(ev.code === 'Space' || ev.key === ' ')) return;
    if (!(idle() && KO.test(cmdIn.value))) return; // 한글이 들어 있으면 Space 는 띄어쓰기 · 한글 명령('선')은 Enter 로 실행
    ev.stopPropagation(); // 본체의 Space=실행 처리로 가지 않음 · 기본 동작(띄어쓰기)은 그대로
    setTimeout(paint, 0);
  }, true);

  /* --- 카드 --- */
  let card = null;
  function closeCard() { if (card) { card.remove(); card = null; } }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
  function showCard(t, mode) {
    closeCard();
    const host = cmdIn.closest('.cmd') || document.body;
    card = document.createElement('div'); card.id = 'labAiCard'; card.setAttribute('role', 'dialog');
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = '닫기 (Esc)'; x.onclick = closeCard;
    const p = document.createElement('div');
    const row = document.createElement('div'); row.className = 'row';
    const b1 = document.createElement('button'); b1.className = 'tbtn primary'; b1.type = 'button';
    const b2 = document.createElement('a'); b2.className = 'tbtn'; b2.href = '/community/?q=' + encodeURIComponent(t); b2.target = '_blank'; b2.rel = 'noopener';
    b2.textContent = `커뮤니티에서 '${t.length > 12 ? t.slice(0, 12) + '…' : t}' 찾기`;
    const sub = document.createElement('div'); sub.className = 'sub';
    sub.textContent = '명령은 영어 약자로 바로 됩니다: 선 L · 원 C · 사각형 REC · 지우기 E · 간격띄우기 O';
    if (mode === 'nocli') {
      p.innerHTML = '<b>AI는 연결됐지만</b> 이 PC에 Claude Code(또는 GPT·Gemini CLI)가 없어 입력창으로는 그릴 수 없습니다. Claude 앱 대화창에 <b>"무카 CAD에 ' + esc(t) + ' 그려줘"</b>라고 쓰면 그려집니다.';
      b1.textContent = '연결 창 열기';
    } else {
      p.innerHTML = '<b>\'' + esc(t) + '\'</b> — 명령이 아니라 말로 쓴 요청이네요. 내 AI(Claude · GPT · Gemini)를 연결하면 이 입력창에 쓴 말대로 그려 줍니다. (비용은 내 AI 구독 사용량)';
      b1.textContent = 'AI 연결하기';
    }
    b1.onclick = () => { closeCard(); try { TOOLS.aiconnect(); } catch (_) {} };
    row.append(b1, b2);
    card.append(x, p, row, sub); host.appendChild(card);
    evt(mode === 'nocli' ? 'AI_CARD_NOCLI' : 'AI_CARD');
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  /* 다음 명령을 치면 카드 닫기 */
  document.addEventListener('keydown', e => { if (e.target === cmdIn && e.key === 'Enter' && card && !sentence(cmdIn.value)) closeCard(); }, true);

  /* --- 보내기 --- */
  function route(t, tag) {
    evt(tag || 'AI_ROUTE');
    log('입력: ' + t, 'me');
    try { aiIn.value = t; } catch (_) {}
    const a = A();
    if (a.state === 'on' && engOk()) {
      closeCard();
      if (a.busy) { log('내 AI가 앞 요청을 그리는 중입니다 — 끝난 뒤 다시 Enter 를 누르세요 (오른쪽 창에서 진행 상황)', 'err'); return true; }
      const side = document.getElementById('side'); if (side && matchMedia('(max-width:820px)').matches) side.classList.add('open');
      log('→ 내 AI에게 보냈습니다. 진행 상황과 대화 기록은 오른쪽 창에 나옵니다.', 'ok');
      evt('AI_SEND_CMDLINE');
      setTimeout(() => bAi.click(), 30);
      return true;
    }
    if (a.state === 'on') { log('AI는 연결됐지만 이 PC에서 입력창으로 그릴 AI가 없습니다 — 위 안내를 보세요.', 'err'); showCard(t, 'nocli'); return true; }
    log('말로 쓴 요청입니다 — AI를 연결하면 그대로 그려 줍니다 (위 안내).', 'ok');
    showCard(t, 'off');
    return true;
  }
  window.LABCMDAI = { route, isCmd, sentence, closeCard };
})();
