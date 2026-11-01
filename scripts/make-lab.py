# cad/index.html → cad-lab/index.html (테스트 서버용 복사본). 본 캐드를 고친 뒤 다시 돌리면 3D 테스트판도 같은 상태로 맞춰짐.
import re, pathlib
src = pathlib.Path('cad/index.html').read_text(encoding='utf-8')
s = src
s = s.replace('<title>무카 CAD</title>', '<title>무카 CAD 테스트</title>\n<meta name="robots" content="noindex,nofollow">', 1)
s = re.sub(r'<script src="cloud\.js\?v=([^"]+)"></script>', r'<script src="../cad/cloud.js?v=\1"></script>', s, count=1)
# v1.10.0 (11-01): 3D 기능(lab3d·labphoto·lab2dcheck·labasset·labmake)은 본체에 들어감 → 본체의 <script src="lab3d.js…"> 는 테스트판에선 cad-lab/ 의 같은 이름 파일을 씀(새 기능은 여기서 먼저 고쳐 시험 → 확인 뒤 cad/ 로 복사)
# 아직 시험 중인 기능만 테스트판에 더함: 시험 도면 · 탱크 부품 · 저장 위치 고르기 · 명령줄 = AI 입력창
_m = re.search(r'<script src="labmake\.js\?v=[^"]+"></script>', s); assert _m, 'labmake tag'
s = s[:_m.end()] + '\n<script src="labcases.js?v=1"></script>\n<script src="labparts.js?v=1"></script>\n<script src="labsave.js?v=1"></script>\n<script src="labcmdai.js?v=1"></script>' + s[_m.end():]
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
assert '../cad/multi.js' in s, 'multi path'
assert '../cad/parts.js' in s, 'parts path'
# [테스트 서버] AI별 연결 안내 (Claude · GPT · Gemini) — scripts/lab_aiguide.js 의 두 부분으로 교체
A,B=pathlib.Path('scripts/lab_aiguide.js').read_text(encoding='utf-8').split('//@@SPLIT@@\n')
def region(s,start,end,new):
    i=s.index(start); j=s.index(end,i)+len(end); assert s.count(start)==1, start[:40]; return s[:i]+new+s[j:]
s=region(s,'  function engineSel(){','  window.__aicEngineSel=engineSel;\n',A)
s=region(s,'  function renderDlg(){const d=AIC.dlg;',"AIC.dlg=modal('Claude 연결 — 내 Claude로 그리기',[box]);AIC.dlg.id='aicDlg';renderDlg();\n    }\n",B)
def rep(s,a,b):
    assert s.count(a)==1, 'aiguide: '+a[:50]; return s.replace(a,b,1)
s=rep(s,"setTimeout(()=>{const c=lsGet();if(c)connect(c,{silent:true})","setTimeout(()=>{engineSel();const c=lsGet();if(c)connect(c,{silent:true})")
s=rep(s,"if(eng!=='claude'&&!engOk(eng)&&!(await engRecheck(eng)))return;","if(eng!=='claude'&&!engOk(eng)&&!(await engRecheck(eng))){engHelp(eng);openAic(eng);return}")
s=rep(s,"aiSt.textContent='먼저 상단 [Claude 연결]에서 내 Claude를 연결하세요.';openAic()","aiSt.textContent='먼저 상단 [AI 연결]에서 내 AI를 연결하세요.';openAic()")
s=rep(s,"""top.innerHTML='<span class="aicDot" aria-hidden="true"></span>Claude 연결';top.title='Claude 연결 — 내 Claude로 그리기 (Claude 앱 · Claude Code)'""","""top.innerHTML='<span class="aicDot" aria-hidden="true"></span>AI 연결';top.title='AI 연결 — 내 Claude · GPT · Gemini로 그리기'""")
s=rep(s,"Object.assign(ALIAS,{AICONNECT:'aiconnect',MCP:'aiconnect',CLAUDE:'aiconnect'});Object.assign(CMD_KO,{aiconnect:'Claude 연결'})","Object.assign(ALIAS,{AICONNECT:'aiconnect',MCP:'aiconnect',CLAUDE:'aiconnect',GPT:'aiconnect',CODEX:'aiconnect',GEMINI:'aiconnect'});Object.assign(CMD_KO,{aiconnect:'AI 연결'})")
s=rep(s,"#aiNew{margin-left:6px}#bAi,#aiNew{white-space:nowrap}","#aiNew{margin-left:6px}#bAi,#aiNew{white-space:nowrap}\n.aicTabs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:12px 0 2px}.aicTabs .sub{margin-right:4px}.aicTab[aria-pressed=\"true\"]{background:#f1c232;color:#111;border-color:#f1c232;font-weight:700}.aicTabHint{margin-top:4px}")
# 버튼 이름이 바뀌었으니 안내 문구도 [AI 연결] (연결 프로그램 소스 줄은 그대로)
_i=s.index('const MUCCA_MCP_SRC="'); _j=s.index('\n',_i)
_f=lambda t:t.replace('[Claude 연결]','[AI 연결]').replace('Claude 연결됨 · 연결 프로그램 v','AI 연결됨 · 연결 프로그램 v').replace('Claude 연결 완료','AI 연결 완료')
s=_f(s[:_i])+s[_i:_j]+_f(s[_j:])
s=rep(s,"</b>로 내 Claude를 연결하면, 아래 칸에 쓴 말대로 도면을 그려 줍니다.","</b>로 내 AI(Claude · GPT · Gemini)를 연결하면, 아래 칸에 쓴 말대로 도면을 그려 줍니다.")
s=rep(s,'<button class="tbtn primary cn" type="button">Claude 연결하기</button>','<button class="tbtn primary cn" type="button">AI 연결하기</button>')
s=rep(s,"'내 Claude가 연결되어 있습니다. 아래 칸에","'내 AI가 연결되어 있습니다. 아래 칸에")
assert 'function curTab()' in s and "modal('AI 연결 — 내 AI로 그리기'" in s, 'aiguide patch'
assert s.count('lab3d.js') == 1 and s.count('labcases.js') == 1 and 'view3d' in s and 'noindex' in s and 'lab-' in s, 'patch failed'
# [테스트 서버] 명령줄 = AI 입력창 (cad-lab/labcmdai.js): 명령이 아닌 한글은 전부 LABCMDAI.route 로
s=rep(s,"    log('입력: '+t,'me');\n    logLink(","    if(window.LABCMDAI)return LABCMDAI.route(t,'KO_'+en.replace(/[^A-Z0-9_.-]/g,'').slice(0,21));\n    log('입력: '+t,'me');\n    logLink(")
s=rep(s,"function routeToAI(t){","function routeToAI(t){if(window.LABCMDAI)return LABCMDAI.route(t,'AI_ROUTE');")
pathlib.Path('cad-lab').mkdir(exist_ok=True)
pathlib.Path('cad-lab/index.html').write_text(s, encoding='utf-8')
print('ok', len(s))
