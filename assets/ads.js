/* 광고 자리 채우기 — 쿠팡 파트너스 다이나믹 배너(iframe)
   · 홈: #adrow / #adSlot  (넓으면 728×90, 좁으면 320×100)
   · 무카 CAD: #ribbonAd / #ribbonAdSlot  (1800px 이상 728×90, 1280~1799px 468×60, 그보다 좁으면 숨김)
   · 대가성 문구는 각 광고 자리 HTML 에 들어 있음 */
(function(){
  'use strict';
  var A=(window.COWS_CONFIG||{}).ads; if(!A||!A.coupang)return;
  var C=A.coupang;
  function src(id,w,h){return 'https://ads-partners.coupang.com/widgets.html?id='+id+'&template=carousel&trackingCode='+encodeURIComponent(C.trackingCode)+'&subId=&width='+w+'&height='+h+'&tsource='}
  function fill(slot,size){
    if(!slot||slot.dataset.size===size)return;
    var id=C.banners[size]; if(!id)return;
    var wh=size.split('x'), f=document.createElement('iframe');
    f.src=src(id,wh[0],wh[1]); f.width=wh[0]; f.height=wh[1];
    f.setAttribute('frameborder','0'); f.setAttribute('scrolling','no'); f.setAttribute('referrerpolicy','unsafe-url');
    f.title='쿠팡 파트너스 광고'; f.style.cssText='border:0;display:block;max-width:100%';
    slot.dataset.size=size; slot.classList.add('filled'); slot.replaceChildren(f);
  }
  function run(){
    var row=document.getElementById('adrow');
    if(row){row.hidden=false; var s=document.getElementById('adSlot'); if(s)fill(s, s.clientWidth>=728?'728x90':'320x100')}
    var ra=document.getElementById('ribbonAd');
    if(ra){ra.hidden=false; if(getComputedStyle(ra).display!=='none')fill(document.getElementById('ribbonAdSlot'), innerWidth>=1800?'728x90':'468x60')}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  var t; addEventListener('resize',function(){clearTimeout(t);t=setTimeout(run,200)});
})();
