/* 카우스 소거법 사이트 공통 설정 — 공개되어도 되는 값만 (Supabase 공개 키는 RLS로 보호됨) */
window.COWS_CONFIG = {
  supabaseUrl: 'https://bsvefchazvkcqjslzwqy.supabase.co',
  supabaseKey: 'sb_publishable_F_d9GtNWuHni48Kiivcdmg_E74B-Mpp',
  appVer: 'web-1.8.9',
  homeUrl: '/',
  youtube: 'https://www.youtube.com/@cowsdelete',
  ep1: 'https://youtu.be/sbg-gBG2x40',
  ep2: 'https://youtu.be/vi42ztaCKw0',
  /* 쿠팡 파트너스 다이나믹 배너 (고객 관심 기반 추천) — 크기별 배너 ID */
  ads: {
    coupang: {
      trackingCode: 'AF2513653',
      banners: { '728x90': 1040632, '468x60': 1040633, '320x100': 1040634 }
    }
  }
};
