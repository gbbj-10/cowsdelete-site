#!/usr/bin/env python3
"""구글 애드센스 게시자 ID·광고 단위 ID 넣기 (한 번만 돌리면 됨)

  python3 scripts/set-adsense.py ca-pub-1234567890123456
  python3 scripts/set-adsense.py ca-pub-1234567890123456 article=1111111111 list=2222222222

하는 일
  1. assets/config.js 의 ads.adsense.client / slots 값을 채움
  2. 사이트 루트에 ads.txt 를 만듦 (google.com, pub-…, DIRECT, f08c47fec0942fa0)
  3. 홈(index.html) <head> 에 사이트 소유 확인 메타 태그를 넣음 (<meta name="google-adsense-account">)
  4. config.js 를 불러오는 페이지의 캐시 번호(?v=)를 올려 새 값이 바로 퍼지게 함
"""
import re, sys, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
if len(sys.argv) < 2 or not re.fullmatch(r'ca-pub-\d{10,20}', sys.argv[1]):
    sys.exit('사용법: set-adsense.py ca-pub-XXXXXXXXXXXXXXXX [article=광고단위ID] [list=광고단위ID]')
client = sys.argv[1]
slots = {'article': '', 'list': ''}
for a in sys.argv[2:]:
    k, _, v = a.partition('=')
    if k not in slots or not re.fullmatch(r'\d{6,}', v):
        sys.exit(f'잘못된 값: {a} (article=숫자 또는 list=숫자)')
    slots[k] = v

cfg = ROOT / 'assets/config.js'
s = cfg.read_text(encoding='utf-8')
new = f"adsense: {{ client: '{client}', slots: {{ article: '{slots['article']}', list: '{slots['list']}' }} }}"
s2, n = re.subn(r"adsense:\s*\{\s*client:\s*'[^']*',\s*slots:\s*\{[^}]*\}\s*\}", new, s)
if n != 1:
    sys.exit('config.js 에서 adsense 설정 줄을 찾지 못함')
cfg.write_text(s2, encoding='utf-8')

pub = client.replace('ca-', '')
(ROOT / 'ads.txt').write_text(f'google.com, {pub}, DIRECT, f08c47fec0942fa0\n', encoding='utf-8')

home = ROOT / 'index.html'
h = home.read_text(encoding='utf-8')
meta = f'<meta name="google-adsense-account" content="{client}">'
h = re.sub(r'<meta name="google-adsense-account" content="[^"]*">\n?', '', h)
h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + meta, 1)
home.write_text(h, encoding='utf-8')

ver = datetime.date.today().strftime('%Y%m%d') + 'ads'
pages = 0
for p in [ROOT / 'index.html', ROOT / 'community/index.html', ROOT / 'mucca/index.html',
          ROOT / 'guide/ai-connect/index.html', ROOT / 'scripts/build-static.mjs']:
    t = p.read_text(encoding='utf-8')
    t2 = re.sub(r'/assets/config\.js\?v=[0-9a-z]+', '/assets/config.js?v=' + ver, t)
    if t2 != t:
        p.write_text(t2, encoding='utf-8'); pages += 1
print(f'완료: {client} · 광고 단위 {slots} · ads.txt · 홈 확인 태그 · 캐시 번호 {pages}곳')
print('다음: git 커밋·push → 정적 페이지 자동 갱신(30분 안) → 애드센스에서 [확인] 누르기')
