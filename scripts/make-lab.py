# cad/index.html → cad-lab/index.html (테스트 서버용 복사본). 본 캐드를 고친 뒤 다시 돌리면 3D 테스트판도 같은 상태로 맞춰짐.
import re, pathlib
src = pathlib.Path('cad/index.html').read_text(encoding='utf-8')
s = src
s = s.replace('<title>무카 CAD</title>', '<title>무카 CAD 테스트</title>\n<meta name="robots" content="noindex,nofollow">', 1)
s = re.sub(r'<script src="cloud\.js\?v=([^"]+)"></script>', r'<script src="../cad/cloud.js?v=\1"></script>\n<script src="lab3d.js?v=10"></script>\n<script src="labcases.js?v=1"></script>', s, count=1)
s = re.sub(r'(<script src="\.\./assets/config\.js[^"]*"></script>)', r'\1\n<script>window.COWS_CONFIG&&(COWS_CONFIG.appVer="lab-"+COWS_CONFIG.appVer)</script>', s, count=1)
hook = "ALIAS['3D']='view3d';ALIAS['3DVIEW']='view3d';ALIAS['2D3D']='view3d';TOOLS.view3d=()=>{if(window.LAB3D)LAB3D.toggle();else log('3D 기능을 불러오는 중입니다','err');return null};\n"
s = s.replace('const ALIAS_DEF=Object.assign({},ALIAS)', hook + 'const ALIAS_DEF=Object.assign({},ALIAS)', 1)
# AI 채팅 참고 이미지(📎)는 본 캐드(cad/airef.js)에 들어감 → 테스트판은 경로만 맞춤
s = s.replace('<script src="airef.js', '<script src="../cad/airef.js', 1)
s = s.replace('<script src="dwg.js', '<script src="../cad/dwg.js', 1)
assert '../cad/airef.js' in s, 'airef path'
assert s.count('lab3d.js') == 1 and 'view3d' in s and 'noindex' in s and 'lab-' in s, 'patch failed'
pathlib.Path('cad-lab').mkdir(exist_ok=True)
pathlib.Path('cad-lab/index.html').write_text(s, encoding='utf-8')
print('ok', len(s))
