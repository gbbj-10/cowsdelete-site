# cad/index.html → cad-lab/index.html (테스트 서버용 복사본). 본 캐드를 고친 뒤 다시 돌리면 3D 테스트판도 같은 상태로 맞춰짐.
import re, pathlib
src = pathlib.Path('cad/index.html').read_text(encoding='utf-8')
s = src
s = s.replace('<title>무카 CAD</title>', '<title>무카 CAD 테스트</title>\n<meta name="robots" content="noindex,nofollow">', 1)
s = re.sub(r'<script src="cloud\.js\?v=([^"]+)"></script>', r'<script src="../cad/cloud.js?v=\1"></script>\n<script src="lab3d.js?v=13"></script>\n<script src="labphoto.js?v=3"></script>\n<script src="lab2dcheck.js?v=1"></script>\n<script src="labcases.js?v=1"></script>\n<script src="labparts.js?v=1"></script>', s, count=1)
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
a="startTool(n);return true}\n    const en=ko2en(t)"
assert s.count(a)==1, 'parts hook'
s=s.replace(a,"startTool(n);return true}\n    if(window.LABPARTS&&LABPARTS.handle(key))return true;const en=ko2en(t)",1)
# [테스트 서버] AI별 연결 안내 (Claude · GPT · Gemini) — scripts/lab_aiguide.js 의 두 부분으로 교체
A,B=pathlib.Path('scripts/lab_aiguide.js').read_text(encoding='utf-8').split('//@@SPLIT@@\n')
def region(s,start,end,new):
    i=s.index(start); j=s.index(end,i)+len(end); assert s.count(start)==1, start[:40]; return s[:i]+new+s[j:]
s=region(s,'  function engineSel(){','  window.__aicEngineSel=engineSel;\n',A)
s=region(s,'  function renderDlg(){const d=AIC.dlg;',"AIC.dlg=modal('Claude 연결 — 내 Claude로 그리기',[box]);AIC.dlg.id='aicDlg';renderDlg();\n    }\n",B)
def rep(s,a,b):
    assert s.count(a)==1, 'aiguide: '+a[:50]; return s.replace(a,b,1)
s=rep(s,"setTimeout(()=>{const c=lsGet();if(c)connect(c,{silent:true})","setTimeout(()=>{engineSel();const c=lsGet();if(c)connect(c,{silent:true})")
s=rep(s,"+ENG_INSTALL[eng]+' — 설치 후 새로고침하세요.';return}","+ENG_INSTALL[eng]+' — 설치 후 새로고침하세요.';engHelp(eng);openAic(eng);return}")
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
assert s.count('lab3d.js') == 1 and 'view3d' in s and 'noindex' in s and 'lab-' in s, 'patch failed'
pathlib.Path('cad-lab').mkdir(exist_ok=True)
pathlib.Path('cad-lab/index.html').write_text(s, encoding='utf-8')
print('ok', len(s))
