/* 여러 도면 동시에 — 「새 창」 (v1.9.16, 2026-10-28 · 테스트 서버 10-28 시험 뒤 본체 반영, 유튜브 댓글 "여러 파일이 동시에 열릴 수 있을까요?")
   - 무카 CAD 는 창(브라우저 탭) 하나 = 도면 하나. 창을 더 열면 도면을 여러 개 동시에 열 수 있다.
   - 복사(Ctrl+C)는 PC 클립보드에 'MUCCACAD:' 로 들어가므로, 다른 창에서 Ctrl+V 하면 레이어·블록·치수 스타일까지 그대로 붙는다.
   - 이 파일: 상단 [새 창] 버튼 · 명령 NEWWIN(새창) · 새 창 안내 · 탭 제목 = 열린 파일 이름(창 구분용) */
(function () {
  'use strict';
  const BASE_TITLE = document.title || '무카 CAD';
  function openWin() {
    const u = new URL(location.href); u.searchParams.set('win', String(Date.now() % 100000)); u.hash = '';
    const w = window.open(u.toString(), '_blank');
    if (!w) { try { toast('팝업이 막혀 새 창을 못 열었습니다 — 주소창의 팝업 차단을 풀거나, 탭을 하나 더 열어 같은 주소로 들어가세요') } catch (_) { } return null }
    try { log('새 창을 열었습니다 — 그 창에서 [열기]로 다른 파일을 열고, 이 창에서 Ctrl+C 한 도형을 거기서 Ctrl+V 로 붙여넣으세요', 'ok') } catch (_) { }
    return null;
  }
  function setTitle(name) { document.title = (name ? name.replace(/\.[^.]+$/, '') + ' — ' : '') + BASE_TITLE }
  function init() {
    if (typeof TOOLS === 'undefined' || typeof ALIAS === 'undefined') return setTimeout(init, 200);
    TOOLS.newwin = openWin;
    Object.assign(ALIAS, { NEWWIN: 'newwin', NEWWINDOW: 'newwin', '새창': 'newwin', '새 창': 'newwin' });
    try { if (typeof CMD_KO !== 'undefined') CMD_KO.newwin = '새 창' } catch (_) { }
    try { if (typeof KO_CMD !== 'undefined') Object.assign(KO_CMD, { '새창': 'newwin', '새창열기': 'newwin', '창추가': 'newwin' }) } catch (_) { }
    const bNew = document.getElementById('bNew');
    if (bNew && !document.getElementById('bNewWin')) {
      const b = document.createElement('button'); b.className = 'tbtn'; b.id = 'bNewWin'; b.textContent = '새 창';
      b.title = '새 창에 무카 CAD 하나 더 열기 — 도면 여러 개를 동시에 열고, Ctrl+C / Ctrl+V 로 서로 붙여넣기 (명령: NEWWIN · 새창)';
      b.onclick = openWin; bNew.after(b);
    }
    const fi = document.getElementById('fileIn');
    if (fi) fi.addEventListener('change', () => { const f = fi.files && fi.files[0]; if (f) setTitle(f.name) });
    if (bNew) bNew.addEventListener('click', () => setTitle(''));
    if (new URLSearchParams(location.search).has('win')) {
      setTitle('새 창');
      setTimeout(() => { try { log('새 창입니다 — 위 [열기]로 다른 파일을 여세요. 다른 창에서 Ctrl+C 로 복사한 도형은 여기서 Ctrl+V 로 붙여넣을 수 있습니다(레이어·블록 포함).', 'ok'); toast('새 창 — [열기]로 다른 파일을 여세요') } catch (_) { } }, 1200);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.MUCCAMULTI = { openWin, setTitle };
})();
