# cad-lab/index.html → cad-lab/ai/index.html (AI 팀 실험판, 11-04 조미료님 결정)
# - 테스트 서버(cad-lab)의 파일을 그대로 씀(<base href="/cad-lab/">) → 기존 cad-lab·본체 파일은 바꾸지 않음
# - 주소가 /cad-lab/… 이라 운영자 잠금·시험 도면 등 테스트 서버 동작이 그대로 적용됨
# - AI 팀이 만든 것은 cad-lab/ai/ 안에만 둠: 새 스크립트는 cad-lab/ai/team-scripts.html 에 한 줄씩(<script src="ai/xxx.js?v=1"></script>)
# - 사용 기록은 app_ver 가 aiteam-… 로 남음
import re, pathlib
s = pathlib.Path('cad-lab/index.html').read_text(encoding='utf-8')
def rep(s, a, b):
    assert s.count(a) == 1, 'rep: ' + a[:60]; return s.replace(a, b, 1)
s = rep(s, '<head>', '<head>\n<base href="/cad-lab/">')
s = rep(s, '<title>무카 CAD 테스트</title>', '<title>무카 CAD AI 팀 실험판</title>')
assert 'noindex' in s
s = rep(s, 'COWS_CONFIG.appVer="lab-"+COWS_CONFIG.appVer', 'COWS_CONFIG.appVer="aiteam-"+COWS_CONFIG.appVer')
banner = '''<div id="aiteamBar" style="position:fixed;left:50%;transform:translateX(-50%);bottom:34px;z-index:9000;background:#7048e8;color:#fff;font:600 12px/1.4 var(--sans,sans-serif);padding:4px 12px;border-radius:12px;box-shadow:0 2px 8px #0006;pointer-events:none">🤖 AI 팀 실험판 — AI 팀원들이 회의하고 만든 기능을 시험하는 곳 (본 서버·테스트 서버와 별개)</div>
<script>try{document.title='무카 CAD AI 팀 실험판';window.MUCCA_AITEAM=true}catch(_){}</script>'''
team = pathlib.Path('cad-lab/ai/team-scripts.html')
t = team.read_text(encoding='utf-8').strip() if team.exists() else ''
s = rep(s, '</body>', banner + '\n<!-- AI 팀이 만든 스크립트 (cad-lab/ai/team-scripts.html) -->\n' + t + ('\n' if t else '') + '</body>')
pathlib.Path('cad-lab/ai/index.html').write_text(s, encoding='utf-8')
print('ok', len(s), 'team lines', len([l for l in t.splitlines() if l.strip()]))
