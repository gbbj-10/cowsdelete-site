# cad/index.html → cad-lab/index.html (테스트 서버용 복사본). 본 캐드를 고친 뒤 다시 돌리면 3D 테스트판도 같은 상태로 맞춰짐.
import re, pathlib
src = pathlib.Path('cad/index.html').read_text(encoding='utf-8')
s = src
s = s.replace('<title>무카 CAD</title>', '<title>무카 CAD 테스트</title>\n<meta name="robots" content="noindex,nofollow">', 1)
s = re.sub(r'<script src="cloud\.js\?v=([^"]+)"></script>', r'<script src="../cad/cloud.js?v=\1"></script>', s, count=1)
# v1.10.0 (11-01): 3D 기능(lab3d·labphoto·lab2dcheck·labasset·labmake)은 본체에 들어감 → 본체의 <script src="lab3d.js…"> 는 테스트판에선 cad-lab/ 의 같은 이름 파일을 씀(새 기능은 여기서 먼저 고쳐 시험 → 확인 뒤 cad/ 로 복사)
# 아직 시험 중인 기능만 테스트판에 더함: 시험 도면 · 탱크 부품 · 명령줄 = AI 입력창 (저장 위치 고르기 labsave.js·AI별 연결 안내는 v1.10.1 에서 본체로)
_m = re.search(r'<script src="labmake\.js\?v=[^"]+"></script>', s); assert _m, 'labmake tag'
s = s[:_m.end()] + '\n<script src="labcases.js?v=1"></script>\n<script src="labparts.js?v=1"></script>\n<script src="labcmdai.js?v=1"></script>\n<script src="labpartforms.js?v=2"></script>\n<script src="labaisteps.js?v=2"></script>\n<script src="labspec.js?v=1"></script>\n<script src="labpdfform.js?v=3"></script>' + s[_m.end():]
s = re.sub(r'(<script src="\.\./assets/config\.js[^"]*"></script>)', r'\1\n<script>window.COWS_CONFIG&&(COWS_CONFIG.appVer="lab-"+COWS_CONFIG.appVer)</script>', s, count=1)
# AI 채팅 참고 이미지(📎)는 본 캐드(cad/airef.js)에 들어감 → 테스트판은 경로만 맞춤
s = s.replace('<script src="airef.js', '<script src="../cad/airef.js', 1)
s = s.replace('<script src="dwg.js', '<script src="../cad/dwg.js', 1)
assert '../cad/airef.js' in s, 'airef path'
# 사진 → 3D 연결(mucca_draw·mucca_snapshot·mucca_guide)은 v1.10.0 부터 본체에 있음
assert "LABPHOTO.isCmd(c)" in s and 'LAB2D.guide' in s and 'LABPHOTO.next()' in s, 'main 3D hooks'
# 파이프는 본체(cad/parts.js)로 옮김(v1.9.9). 테스트판은 labparts.js(파이프+탱크)가 먼저 처리
a="if(window.MUCCAPARTS&&MUCCAPARTS.handle(key))return true;"
assert s.count(a)==1, 'parts hook'
s=s.replace(a,"if(window.LABPARTS&&LABPARTS.handle(key))return true;"+a,1)
s=s.replace('<script src="parts.js', '<script src="../cad/parts.js', 1)
s=s.replace('<script src="multi.js', '<script src="../cad/multi.js', 1)
s=s.replace('<script src="labbom.js', '<script src="../cad/labbom.js', 1)
s=s.replace('<script src="labelev.js', '<script src="../cad/labelev.js', 1)
assert '../cad/labbom.js' in s and '../cad/labelev.js' in s, 'bom/elev path'
assert '../cad/multi.js' in s, 'multi path'
assert '../cad/parts.js' in s, 'parts path'
# AI별 연결 안내(Claude · GPT · Gemini 탭)는 v1.10.1 부터 본체에 있음 (scripts/lab_aiguide.js 는 기록용)
def rep(s,a,b):
    assert s.count(a)==1, 'rep: '+a[:50]; return s.replace(a,b,1)
assert 'function curTab()' in s and "modal('AI 연결 — 내 AI로 그리기'" in s, 'aiguide patch'
assert s.count('lab3d.js') == 1 and s.count('labcases.js') == 1 and s.count('labsave.js') == 1 and s.count('labsection.js') == 1 and 'view3d' in s and 'noindex' in s and 'lab-' in s, 'patch failed'
# [테스트 서버] 명령줄 = AI 입력창 (cad-lab/labcmdai.js): 명령이 아닌 한글은 전부 LABCMDAI.route 로
s=rep(s,"    log('입력: '+t,'me');\n    logLink(","    if(window.LABCMDAI)return LABCMDAI.route(t,'KO_'+en.replace(/[^A-Z0-9_.-]/g,'').slice(0,21));\n    log('입력: '+t,'me');\n    logLink(")
s=rep(s,"function routeToAI(t){","function routeToAI(t){if(window.LABCMDAI)return LABCMDAI.route(t,'AI_ROUTE');")
# 11-03: DWG 새 변환기(labdwgrs)·3D 자가검사(labcheck3d)·아랫면 시점은 v1.10.8 에서 본체로 → 테스트판은 cad-lab/ 의 같은 이름 파일을 씀
assert s.count('labdwgrs.js') == 1 and s.count('labcheck3d.js') == 1, 'v1.10.8 scripts'
# v1.10.9 (11-03 저녁): 명령 24개(labcmds)·판정 AI(labjudge, __aicPost)·외부 CAD(labcadimport)·model3d_add 는 본체로 → 테스트판은 cad-lab/ 의 같은 파일
assert s.count('labcmds.js') == 1 and s.count('labjudge.js') == 1 and s.count('labcadimport.js') == 1 and '__aicPost=post' in s, 'v1.10.9 scripts'
# 11-03 밤: AI 진행 단계 카드(labaisteps.js)·규격 찾기(labspec.js)가 AI 답을 받도록 aiEvent 에 훅 한 줄
s = rep(s, "  function aiEvent(d){", "  function aiEvent(d){try{window.__aiEvtHook&&window.__aiEvtHook(d)}catch(_){}")
pathlib.Path('cad-lab').mkdir(exist_ok=True)
pathlib.Path('cad-lab/index.html').write_text(s, encoding='utf-8')
print('ok', len(s))
