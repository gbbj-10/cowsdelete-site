# cowsdelete 사이트 (카우스 소거법 · 무카 CAD 베타)

정적 사이트 — GitHub Pages로 그대로 배포 (빌드 없음)

| 경로 | 내용 |
|---|---|
| `/` | 카우스 소거법 홈 · 무카 CAD 입구 · 업무 제보 |
| `/cad/` | 무카 CAD v1.8.1 웹 베타 (카카오 로그인 · 닉네임 · 클라우드 저장 · 의견 보내기) |
| `/privacy/` | 개인정보처리방침 |
| `/beta/` | 베타 이용 안내 |
| `assets/config.js` | Supabase 주소·공개 키 (공개돼도 되는 값, 데이터는 RLS로 보호) |
| `cad/vendor/supabase.js` | @supabase/supabase-js 2.117.3 (MIT) |
| `CNAME` | 연결할 도메인 |

데이터베이스: Supabase 프로젝트 `mucca-cad` (서울) — profiles · drawings · user_settings · events (모두 RLS)
