/* 카우스 소거법 사이트 공통 설정 — 공개되어도 되는 값만 (Supabase 공개 키는 RLS로 보호됨) */
window.COWS_CONFIG = {
  supabaseUrl: 'https://bsvefchazvkcqjslzwqy.supabase.co',
  supabaseKey: 'sb_publishable_F_d9GtNWuHni48Kiivcdmg_E74B-Mpp',
  appVer: 'web-1.10.19',
  homeUrl: '/',
  youtube: 'https://www.youtube.com/@cowsdelete',
  ep1: 'https://youtu.be/sbg-gBG2x40',
  ep2: 'https://youtu.be/vi42ztaCKw0',
  /* 쿠팡 파트너스 다이나믹 배너 (고객 관심 기반 추천) — 크기별 배너 ID */
  ads: {
    coupang: {
      trackingCode: 'AF2513653',
      banners: { '728x90': 1040632, '468x60': 1040633, '320x100': 1040634 }
    },
    /* 구글 애드센스 — 게시자 ID(ca-pub-…)를 넣기 전까지는 아무것도 불러오지 않음.
       값 넣기: python3 scripts/set-adsense.py ca-pub-XXXXXXXXXXXXXXXX [article=광고단위ID] [list=광고단위ID]
       광고는 내용 있는 페이지(/s/ /p/ /r/ 글, 커뮤니티 목록, 무카 CAD 소개, AI 연결 안내)에만. 편집기(/cad/)·테스트 서버·안내 페이지에는 넣지 않음 */
    adsense: { client: '', slots: { article: '', list: '' } }
  }
};
