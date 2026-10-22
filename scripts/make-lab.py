# cad/index.html → cad-lab/index.html (테스트 서버용 복사본). 본 캐드를 고친 뒤 다시 돌리면 3D 테스트판도 같은 상태로 맞춰짐.
import re, pathlib
src = pathlib.Path('cad/index.html').read_text(encoding='utf-8')
s = src
s = s.replace('<title>무카 CAD</title>', '<title>무카 CAD 테스트</title>\n<meta name="robots" content="noindex,nofollow">', 1)
s = re.sub(r'<script src="cloud\.js\?v=([^"]+)"></script>', r'<script src="../cad/cloud.js?v=\1"></script>\n<script src="lab3d.js?v=13"></script>\n<script src="labphoto.js?v=3"></script>\n<script src="lab2dcheck.js?v=1"></script>\n<script src="labcases.js?v=1"></script>', s, count=1)
s = re.sub(r'(<script src="\.\./assets/config\.js[^"]*"></script>)', r'\1\n<script>window.COWS_CONFIG&&(COWS_CONFIG.appVer="lab-"+COWS_CONFIG.appVer)</script>', s, count=1)
hook = "ALIAS['3D']='view3d';ALIAS['3DVIEW']='view3d';ALIAS['2D3D']='view3d';TOOLS.view3d=()=>{if(window.LAB3D)LAB3D.toggle();else log('3D 기능을 불러오는 중입니다','err');return null};\n"
s = s.replace('const ALIAS_DEF=Object.assign({},ALIAS)', hook + 'const ALIAS_DEF=Object.assign({},ALIAS)', 1)
# AI 채팅 참고 이미지(📎)는 본 캐드(cad/airef.js)에 들어감 → 테스트판은 경로만 맞춤
s = s.replace('<script src="airef.js', '<script src="../cad/airef.js', 1)
s = s.replace('<script src="dwg.js', '<script src="../cad/dwg.js', 1)
assert '../cad/airef.js' in s, 'airef path'
# 사진 → 3D: 기존 연결 도구(mucca_draw·mucca_snapshot·mucca_guide)에 연결 (허브는 그대로)
a="if(!Array.isArray(cmds)||!cmds.length)throw new Error('commands 배열이 비어 있습니다');"
assert s.count(a)==1, 'draw hook'
s=s.replace(a, a+"if(window.LABPHOTO&&cmds.some(c=>LABPHOTO.isCmd(c)))return LABPHOTO.cmds(cmds);",1)
a="mucca_snapshot:async a=>{if(window.AIREF){const _r=AIREF.next();if(_r)return _r}"
assert s.count(a)==1, 'snap hook'
s=s.replace(a,"mucca_snapshot:async a=>{if(window.LABPHOTO){const _p=LABPHOTO.next();if(_p)return _p}if(window.AIREF){const _r=AIREF.next();if(_r)return _r}",1)
a="new Error('commands 배열이 비어 있습니다');"
a2=r"mucca_guide:()=>{const s=summary();return `${API_DOC}\n\n${RULES}\n\n현재 도면: ${JSON.stringify(s)}"
assert s.count(a2)==1, 'guide hook'
s=s.replace(a2,r"mucca_guide:()=>{const s=summary();return `${API_DOC}\n\n${RULES}${window.LABPHOTO?'\n\n'+LABPHOTO.guide:''}${window.LAB2D?'\n\n'+LAB2D.guide:''}\n\n현재 도면: ${JSON.stringify(s)}",1)
assert s.count('lab3d.js') == 1 and 'view3d' in s and 'noindex' in s and 'lab-' in s, 'patch failed'
pathlib.Path('cad-lab').mkdir(exist_ok=True)
pathlib.Path('cad-lab/index.html').write_text(s, encoding='utf-8')
print('ok', len(s))
