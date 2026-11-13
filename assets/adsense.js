/* 구글 애드센스 광고 자리 채우기
   · 게시자 ID(COWS_CONFIG.ads.adsense.client)가 비어 있으면 아무것도 하지 않음
   · 광고 자리: <div class="gad" data-gad="article|list" hidden></div> — 광고 단위 ID(slots)가 있을 때만 채움
   · 편집기(/cad/)·테스트 서버·처리방침·고지·베타 안내에서는 실행하지 않음 (정책: 도구 화면·내용 없는 화면 제외)
   · 표시 문구는 '광고' 만 (애드센스 정책: '광고'·'스폰서 링크' 외의 제목 금지) */
(function () {
  'use strict';
  var A = (window.COWS_CONFIG || {}).ads || {}, G = A.adsense;
  if (!G || !/^ca-pub-\d{10,20}$/.test(G.client || '')) return;
  if (/^\/(cad|cad-lab|privacy|oss|beta)(\/|$)/.test(location.pathname)) return;
  var spots = document.querySelectorAll('.gad[data-gad]');

  var st = document.createElement('style');
  st.textContent = '.gad{margin:32px auto;max-width:980px}' +
    '.gad .gad-l{font:12px/1.4 system-ui,sans-serif;color:#8a9099;margin:0 0 6px;letter-spacing:.04em}' +
    '.gad ins.adsbygoogle{display:block;min-height:90px}';
  document.head.appendChild(st);

  var s = document.createElement('script');
  s.async = true; s.crossOrigin = 'anonymous';
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(G.client);
  document.head.appendChild(s);

  var slots = G.slots || {};
  Array.prototype.forEach.call(spots, function (el) {
    var id = slots[el.getAttribute('data-gad')];
    if (!/^\d{6,}$/.test(id || '')) return;
    var lab = document.createElement('p'); lab.className = 'gad-l'; lab.textContent = '광고';
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle'; ins.style.display = 'block';
    ins.setAttribute('data-ad-client', G.client); ins.setAttribute('data-ad-slot', id);
    ins.setAttribute('data-ad-format', 'auto'); ins.setAttribute('data-full-width-responsive', 'true');
    el.replaceChildren(lab, ins); el.hidden = false;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  });
})();
