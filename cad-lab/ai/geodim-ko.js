/* AI 팀 실험판 — "치수 넣어줘" 한 마디로 형상 치수 붙이기 (11-04 조미료님 요청 「치수 넣어줘 명령어로도 가능할까?」)
   - 형상 치수 뽑기(GEODIM, geodim-core.js) 로 재고 → GEODIM_UI.attach 로 바로 붙임(창 없이). 선택이 있으면 그것만.
   - 한글: 치수 넣어줘 · 치수 넣기 · 치수 붙여줘 · 치수 달아줘 · 자동 치수 … (띄어쓰기 상관없음) / 영문: DIMAUTO
   - 되돌리기 한 번(Ctrl+Z)에 모두 사라짐. 표로 먼저 보고 싶으면 '형상치수'.
   - AI 가 연결돼 있으면 같은 말에 {"cmd":"geo_dims","attach":true} 를 쓰도록 안내문에 한 줄 더함. */
(() => {
  'use strict';
  const say = (m, c) => { try { log(m, c); } catch (_) { try { toast(m); } catch (__) { } } };
  const errMsg = e => String((e && e.message) || e || '').slice(0, 120);

  function put(ids) {
    try {
      if (!window.GEODIM || !window.GEODIM_UI) { say('형상 치수 모듈을 불러오지 못했습니다. 새로고침 뒤 다시 해 주세요.', 'err'); return null; }
      const r = GEODIM.extract({ ids: ids && ids.length ? ids : undefined, view: 'auto' });
      if (!r || !r.ok) { say('치수를 넣지 못했습니다: ' + ((r && r.error) || '잴 형상이 없습니다'), 'err'); return r; }
      const a = GEODIM_UI.attach(r);
      try { window.__muccaEvt && window.__muccaEvt('unknown_cmd', { cmd: 'GEODIM_KO' }); } catch (_) { }
      if (a && a.ok) {
        const scope = ids && ids.length ? `선택한 ${ids.length}개` : '도면 전체';
        say(`치수 ${a.added}개를 붙였습니다 (${scope} · 뷰 ${r.views.length}개 · '치수' 도면층) — 형상에서 잰 값이니 설계 치수는 원 도면으로 확인하세요. 되돌리기: Ctrl+Z, 표로 보기: 형상치수`, 'ok');
      } else say('치수를 넣지 못했습니다: ' + ((a && (a.error || (a.errors || []).join(' / '))) || '알 수 없는 문제'), 'err');
      return a;
    } catch (e) { say('치수를 넣지 못했습니다: ' + errMsg(e), 'err'); return null; }
  }

  try {
    TOOLS.dimauto = () => { const ids = (typeof sel !== 'undefined' && sel && sel.size) ? [...sel] : null; put(ids); return null; };
    Object.assign(ALIAS, { DIMAUTO: 'dimauto' });
    if (typeof CMD_KO === 'object') CMD_KO.dimauto = '치수 넣기';
    const ko = ['치수넣어줘', '치수넣어', '치수넣기', '치수넣어주세요', '치수붙여줘', '치수붙이기', '치수달아줘', '치수달기', '자동치수', '치수자동', '치수자동기입'];
    if (typeof KO_CMD === 'object') for (const k of ko) if (!KO_CMD[k]) KO_CMD[k] = 'dimauto';
  } catch (e) { console.warn('geodim-ko', e); }

  const LINE = `· 사용자가 "치수 넣어줘"·"치수 달아줘"처럼 도면에 치수를 넣어 달라고 하면 {"cmd":"geo_dims","attach":true} (선택한 것만이면 "ids") — 형상을 재서 뷰별 가로·세로, 구멍 n-Ø, PCD 치수를 '치수' 도면층에 붙임(되돌리기 1번).`;
  const hook = () => { try { const g = window.LAB2D; if (g && typeof g.guide === 'string') { if (!g.guide.includes('"attach":true}')) g.guide += '\n' + LINE; return true; } } catch (_) { return true; } return false; };
  if (!hook()) { let n = 0; const t = setInterval(() => { if (hook() || ++n > 40) clearInterval(t); }, 500); }

  window.GEODIM_KO = { put };
})();
