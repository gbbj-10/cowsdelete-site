  /* [테스트 서버] AI 고르기 칸: 연결 전에도 보여서 GPT·Gemini를 고를 수 있음
     (예전 연결 프로그램 v1.0.5 이하에 연결됐을 때만 숨김 — 그 버전은 Claude만 지원) */
  function engineSel(){let sel=document.getElementById('aiEngine');
    const live=!!AIC.es&&!!AIC.ver;
    if(live&&!AIC.engines){if(sel)sel.hidden=true;AIC.engine='claude';return}
    const known=live&&!!AIC.engines;
    if(!sel){sel=document.createElement('select');sel.id='aiEngine';sel.title='그릴 AI 고르기 (내 PC에 설치·로그인된 AI를 씁니다)';sel.setAttribute('aria-label','그릴 AI');sel.style.cssText='margin-right:4px;padding:3px 2px;max-width:84px;border-radius:6px;border:1px solid var(--rule);background:var(--chrome-2);color:var(--ink);font:500 12px var(--sans)';
      sel.onchange=()=>{const v=sel.value;AIC.engine=v;AIC.tab=v;try{localStorage.setItem(LSE,v)}catch(_){}
        if(AIC.state!=='on'){aiSt.textContent=ENG[v]+'로 그리려면 먼저 연결하세요. 상단 [AI 연결] 창에서 '+ENG[v]+' 순서를 따르면 됩니다.';engHelp(v);return}
        if(!engOk(v)){aiSt.textContent=(v==='claude'?'Claude Code':ENG_CLI[v])+'가 이 PC에 없습니다. 설치·로그인한 뒤 이 페이지를 새로고침하세요.';engHelp(v)}
        else{engHelp(null);setState(AIC.state)}};
      bAi.before(sel)}
    let want=AIC.engine;try{want=localStorage.getItem(LSE)||want}catch(_){}
    sel.replaceChildren(...Object.keys(ENG).map(k=>{const o=document.createElement('option');o.value=k;o.textContent=ENG[k]+(known&&!engOk(k)?' (설치 필요)':'');return o}));
    if(!ENG[want])want='claude';
    if(known&&!engOk(want)){let saved='';try{saved=localStorage.getItem(LSE)||''}catch(_){}const f=Object.keys(ENG).find(engOk);if(f&&!saved)want=f}
    sel.value=want;AIC.engine=want;sel.hidden=false;
    if(known&&engOk(want))engHelp(null)}
  const ENG_CLI={claude:'Claude Code',codex:'Codex CLI',gemini:'Gemini CLI'};
  /* 고른 AI의 연결 방법 바로가기 (입력칸 아래) */
  function engHelp(k){let b=document.getElementById('aiEngHelp');if(!k){if(b)b.hidden=true;return}
    if(!b){b=document.createElement('button');b.id='aiEngHelp';b.type='button';b.className='tbtn';b.style.cssText='margin:6px 0 2px;border:1px solid var(--rule);border-radius:6px';aiSt.after(b)}
    b.textContent=ENG[k]+' 연결 방법 보기';b.onclick=()=>openAic(k);b.hidden=false}
  window.__aicEngineSel=engineSel;
//@@SPLIT@@
  /* [테스트 서버] AI별 연결 안내 — 연결 창에서 Claude · GPT · Gemini 중 고른 AI의 순서만 보여 줌 */
  const ENG_TABS={claude:'Claude',codex:'GPT (ChatGPT)',gemini:'Gemini'};
  function curTab(){let t=AIC.tab||AIC.engine;if(!ENG[t]){try{t=localStorage.getItem(LSE)}catch(_){}}return ENG[t]?t:'claude'}
  function setEngine(k){AIC.tab=k;AIC.engine=k;try{localStorage.setItem(LSE,k)}catch(_){}const sel=document.getElementById('aiEngine');if(sel&&[...sel.options].some(o=>o.value===k))sel.value=k}
  function renderDlg(){const d=AIC.dlg;if(!d||!d.isConnected)return;const tab=curTab(),L=ENG[tab],V='연결됨 · 연결 프로그램 v'+(AIC.ver||'?');
    const s=d.querySelector('.aicStat');s.dataset.st=AIC.state;let txt;
    if(AIC.state==='on'){
      if(outdated())txt=V+' — 예전 버전입니다. '+(tab==='claude'?'아래 ①로 새 파일을 받아 ②처럼 다시 설치하세요':'아래 ③에서 새 파일을 받아 다시 실행하세요')+' (최신 v'+MUCCA_MCP_VER+')';
      else if(tab==='claude')txt=V+(AIC.claude?' · Claude Code 사용 가능 — 오른쪽 입력칸으로 그릴 수 있습니다':' · Claude Code 없음 — Claude 앱 대화로 그릴 수 있습니다 (오른쪽 입력칸은 아래 Claude Code 필요)');
      else txt=V+(engOk(tab)?' · '+L+' 사용 가능 — 입력칸 왼쪽에서 '+L+'를 고르고 [그리기]를 누르세요':' · 이 PC에서 '+ENG_CLI[tab]+'를 못 찾았습니다 — 아래 ②를 마친 뒤 무카 CAD를 새로고침하세요');
    }else txt=AIC.state==='connecting'?'연결하는 중…':'연결 안 됨 — 아래 순서대로 연결하세요';
    s.querySelector('.txt').textContent=txt;
    const e=d.querySelector('.aicErr');e.textContent=AIC.err||'';e.hidden=!AIC.err;
    const w=d.querySelector('.aicWait');if(w)w.textContent=(AIC.waiting&&AIC.state!=='on')?(tab==='claude'?'⏳ 설치를 기다리는 중… Claude 앱에서 [설치]를 누르면 자동으로 연결됩니다.':'⏳ 연결 프로그램을 기다리는 중… 검은 창에서 명령을 실행하면 자동으로 연결됩니다.'):(AIC.state==='on'?'✓ 연결됐습니다.':'');
    const dc=d.querySelector('#aicDisc');if(dc)dc.hidden=AIC.state!=='on'&&!AIC.code;
    d.querySelectorAll('.aicTab').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.e===tab)))}
  const stepEl=(n,title)=>el('div','aicStep','<b><span class="n">'+n+'</span>'+title+'</b>');
  /* 공통: 자동 연결이 안 될 때 */
  function manualEl(tab){
    const s=el('details','aicStep');s.append(el('summary',null,'자동 연결이 안 될 때 — 연결 코드 직접 넣기'));
    const r=el('div','aicRow');const ci=el('input','aicCode');ci.id='aicCodeIn';ci.inputMode='numeric';ci.maxLength=6;ci.placeholder='000000';ci.value=AIC.code||lsGet();ci.autocomplete='off';ci.setAttribute('aria-label','연결 코드 6자리');
    const bc=el('button','tbtn primary');bc.id='aicConnect';bc.textContent='연결';bc.onclick=()=>connect(ci.value);ci.addEventListener('keydown',e=>{if(e.key==='Enter')connect(ci.value)});
    const bd=el('button','tbtn');bd.id='aicDisc';bd.textContent='연결 해제';bd.onclick=disconnect;r.append(ci,bc,bd);s.append(r);
    s.append(el('p','sub',tab==='claude'?'다른 브라우저나 다른 PC에서 받은 파일로 설치했다면, Claude 앱에 <b>"무카 연결 코드 알려줘"</b>라고 물어 나온 6자리를 넣으세요.':'연결 프로그램 검은 창에 나온 <b>연결 코드 6자리</b>를 넣으세요. 다른 브라우저에서 받은 파일이면 코드가 달라서 자동으로 이어지지 않습니다.'));
    if(tab==='claude'){
      const bJ=el('button','tbtn');bJ.id='aicJs';bJ.textContent='직접 실행용 파일 받기 (.js)';bJ.onclick=getJs;
      s.append(el('p','sub','<b>직접 실행</b>(Node.js 18 이상): 아래 파일을 받아 그 폴더에서 명령을 실행하면 이 화면이 자동으로 연결됩니다.'));
      const rj=el('div','aicRow');rj.append(bJ);s.append(rj);s.append(cmdRow('터미널','node mucca-mcp.js'))}
    return s}
  /* GPT · Gemini 공통: Node.js → CLI → 연결 프로그램 → 고르고 그리기 */
  function cliSteps(tab){const L=ENG[tab],gpt=tab==='codex',CLI=ENG_CLI[tab],out=[];
    const s1=stepEl(1,'Node.js 설치 (처음 한 번)');
    s1.append(el('p','sub','연결 프로그램과 '+CLI+'는 Node.js로 돌아갑니다. <a href="https://nodejs.org/ko/download" target="_blank" rel="noopener">nodejs.org</a>에서 LTS 버전(20 이상)을 받아 설치하세요. 이미 있으면 건너뛰세요.'));
    s1.append(cmdRow('설치 확인','node -v'));
    s1.append(el('p','sub','명령은 Windows는 <b>명령 프롬프트(cmd)</b>, Mac은 <b>터미널</b>에 붙여 넣고 Enter를 누르세요.'));
    out.push(s1);
    const s2=stepEl(2,(gpt?'Codex':'Gemini CLI')+' 설치·로그인 (처음 한 번)');
    if(gpt){
      s2.append(el('p','sub','GPT는 OpenAI의 <b>Codex CLI</b>로 그립니다. 로그인은 <b>ChatGPT 계정</b>으로 하고, 사용량은 <b>내 ChatGPT 요금제</b>에서 나갑니다. API 키는 필요 없습니다.'));
      s2.append(cmdRow('설치','npm i -g @openai/codex'));s2.append(cmdRow('로그인','codex login'));
      s2.append(el('p','sub','<code>codex login</code>을 실행하면 브라우저가 열립니다. <b>Sign in with ChatGPT</b>로 로그인하면 끝납니다. Codex를 쓸 수 있는 요금제인지는 ChatGPT 설정에서 확인하세요.'));
    }else{
      s2.append(el('p','sub','Gemini는 구글의 <b>Gemini CLI</b>로 그립니다. 로그인은 <b>구글 계정</b>으로 하고, 무료 사용량이 있습니다. API 키는 필요 없습니다.'));
      s2.append(cmdRow('설치','npm i -g @google/gemini-cli'));s2.append(cmdRow('로그인','gemini'));
      s2.append(el('p','sub','<code>gemini</code>를 처음 실행하면 로그인 방법을 묻습니다. <b>Login with Google</b>을 고르고 브라우저에서 로그인하세요. 끝나면 <code>/quit</code>를 쳐서 닫으면 됩니다.'));
    }
    s2.append(el('p','sub','설치 중 <b>권한 오류</b>가 나면 Mac은 명령 앞에 <code>sudo </code>를 붙이세요. Windows PowerShell에서 "스크립트를 실행할 수 없으므로" 오류가 나면 명령 프롬프트(cmd)에서 다시 실행하세요.'));
    out.push(s2);
    const s3=stepEl(3,'연결 프로그램 켜기');
    const r3=el('div','aicRow');const bJ=el('button','tbtn primary');bJ.id='aicJs';bJ.textContent='연결 프로그램 받기 (mucca-mcp.js)';bJ.onclick=getJs;r3.append(bJ);s3.append(r3);
    s3.append(el('p','sub','받은 파일이 있는 폴더(보통 다운로드)에서 아래 명령을 실행하세요. 이 브라우저 전용 연결 코드가 파일 안에 들어 있어서 실행하면 이 화면이 저절로 연결됩니다.'));
    s3.append(cmdRow('Windows (cmd)','cd %USERPROFILE%\\Downloads && node mucca-mcp.js'));
    s3.append(cmdRow('Mac · Linux','cd ~/Downloads && node mucca-mcp.js'));
    const wait=el('p','sub aicWait','');wait.style.cssText='color:#f1c232;font-weight:600;margin:4px 0';s3.append(wait);
    s3.append(el('p','sub','검은 창이 열려 있는 동안만 연결됩니다(다음에도 이 명령만 다시 실행). 창에 <b>"Claude Code 없음"</b>이라고 나와도 괜찮습니다 — '+L+'는 '+CLI+'로 그립니다. 파일 이름이 <code>mucca-mcp (1).js</code>처럼 바뀌었으면 명령의 이름도 똑같이 바꾸세요.'));
    out.push(s3);
    const s4=stepEl(4,L+' 고르고 그리기');
    s4.append(el('p','sub','오른쪽 입력칸 왼쪽 목록에서 <b>'+L+'</b>를 고르고 요청(예: "바깥지름 120 플랜지 그려줘")을 쓴 뒤 <b>[그리기]</b>를 누르세요. '+CLI+'를 방금 설치했다면 무카 CAD를 한 번 새로고침하세요.'));
    out.push(s4);
    const s5=el('details','aicStep');s5.append(el('summary',null,(gpt?'Codex':'Gemini CLI')+' 대화에서 그리기 (선택)'));
    s5.append(el('p','sub',(gpt?'Codex':'Gemini CLI')+' 대화창에서 "무카 CAD에 플랜지 그려줘"처럼 말해서 그리려면, 연결 프로그램을 한 번 등록하세요. 경로는 파일을 저장한 위치로 바꾸세요. 등록하면 '+(gpt?'Codex':'Gemini CLI')+'가 실행될 때 연결 프로그램도 같이 켜집니다.'));
    s5.append(cmdRow('등록 (Windows)',gpt?'codex mcp add mucca -- node "C:\\Users\\내이름\\Downloads\\mucca-mcp.js"':'gemini mcp add mucca node "C:\\Users\\내이름\\Downloads\\mucca-mcp.js"'));
    s5.append(cmdRow('등록 (Mac)',gpt?'codex mcp add mucca -- node ~/Downloads/mucca-mcp.js':'gemini mcp add mucca node ~/Downloads/mucca-mcp.js'));
    s5.append(el('p','sub',gpt?'Codex 앱·IDE 확장도 같은 설정을 씁니다. ChatGPT 웹 대화창은 내 PC의 프로그램과 바로 연결되지 않으니 위 ①~④나 Codex를 쓰세요.':'등록 확인: <code>gemini mcp list</code>'));
    out.push(s5);
    return out}
  function claudeSteps(){const out=[];
    const s1=stepEl(1,'연결 파일 받기');
    const r1=el('div','aicRow');const bM=el('button','tbtn primary');bM.id='aicMcpb';bM.textContent='Claude 연결 파일 받기';bM.onclick=getMcpb;r1.append(bM);s1.append(r1);
    s1.append(el('p','sub','<code>mucca-cad.mcpb</code> 파일이 내려받아집니다. 이 브라우저 전용 연결 코드가 파일 안에 미리 들어 있습니다.'));out.push(s1);
    const s2=stepEl(2,'Claude 앱에 설치');
    s2.append(el('p','sub','1. 받은 파일을 Claude 앱 창 <b>프로필 › 설정 › 확장 프로그램</b> 화면에 끌어다 놓으세요.<br>2. <b>[설치]</b>를 눌러 주세요.'));
    const warn=el('p','sub','⚠ 주의: 연결 파일을 받은 이 창은 닫지 말고 그대로 둔 채 진행해 주세요.');warn.style.cssText='color:#f1c232;font-weight:600;margin-top:6px';s2.append(warn);out.push(s2);
    const s3=stepEl(3,'자동 연결');
    const wait=el('p','sub aicWait','');wait.style.cssText='color:#f1c232;font-weight:600;margin:4px 0';s3.append(wait);
    s3.append(el('p','sub','설치가 끝나면 이 화면이 저절로 연결되고 위쪽 불이 초록색으로 바뀝니다. 그다음 Claude 앱 대화에서 <b>"무카 CAD에 플랜지 그려줘"</b>처럼 말하면 이 화면에 그려집니다. PC를 바꾸면 그 PC에서 1~2번을 한 번 더 하세요.'));out.push(s3);
    const s4=el('details','aicStep');s4.append(el('summary',null,'오른쪽 입력칸으로 그리려면 — Claude Code 설치·로그인 (선택)'));
    s4.append(el('p','sub','입력칸 요청은 연결 프로그램이 내 PC의 <b>Claude Code</b>를 실행해 처리합니다. Claude Pro·Max 등 Claude Code를 쓸 수 있는 요금제가 필요합니다(무료 요금제 불가).'));
    s4.append(cmdRow('Windows PowerShell','irm https://claude.ai/install.ps1 | iex'));
    s4.append(cmdRow('macOS · Linux','curl -fsSL https://claude.ai/install.sh | bash'));
    s4.append(cmdRow('설치 후 로그인','claude'));
    s4.append(el('p','sub','<code>claude</code>를 실행하면 브라우저 로그인 창이 열립니다. 로그인한 뒤 연결 프로그램을 다시 실행하면(Claude 앱은 다시 켜기) "Claude Code 사용 가능"으로 바뀝니다.'));out.push(s4);
    const s5=el('details','aicStep');s5.append(el('summary',null,'Claude Code 대화에서 쓰기 (선택)'));
    s5.append(el('p','sub','터미널의 Claude Code 대화에서도 무카 CAD에 그리려면 직접 실행용 파일을 받은 뒤 한 번 등록하세요. 경로는 파일을 저장한 위치로 바꾸세요.'));
    s5.append(cmdRow('등록','claude mcp add mucca -- node "C:\\Users\\내이름\\Downloads\\mucca-mcp.js"'));out.push(s5);
    return out}
  const stepsFor=tab=>(tab==='claude'?claudeSteps():cliSteps(tab)).concat([manualEl(tab)]);
  function openAic(eng){
    if(typeof eng==='string'&&ENG[eng])setEngine(eng);
    if(AIC.dlg&&AIC.dlg.isConnected){try{AIC.dlg.remove()}catch(_){}}
    const box=el('div','aicBox');
    box.append(el('div','aicStat','<span class="dot"></span><span class="txt"></span>'));
    const err=el('p','aicErr');err.style.cssText='color:#eb5757;margin:8px 0 0';box.append(err);
    box.append(el('p','sub','무카 CAD는 AI를 직접 부르지 않습니다. 내 PC의 <b>연결 프로그램</b>이 내 AI(Claude · GPT · Gemini)와 이 화면을 이어 주고, 사용량은 <b>내 구독·계정</b>에서 나갑니다. 도면 데이터는 무카 CAD 서버로 보내지 않습니다.'));
    const tabs=el('div','aicTabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','쓸 AI 고르기');
    tabs.append(el('span','sub','어떤 AI를 쓰세요?'));
    const panel=el('div','aicPanel');
    for(const k of Object.keys(ENG)){const b=el('button','tbtn aicTab');b.type='button';b.dataset.e=k;b.textContent=ENG_TABS[k];
      b.onclick=()=>{setEngine(k);panel.replaceChildren(...stepsFor(k));renderDlg()};tabs.append(b)}
    box.append(tabs);
    box.append(el('p','sub aicTabHint','고른 AI에 맞는 순서만 보여 드립니다. 여기서 고른 AI가 오른쪽 입력칸의 기본 AI가 됩니다.'));
    panel.append(...stepsFor(curTab()));box.append(panel);
    box.append(el('p','sub','보안: 연결 프로그램은 이 PC(127.0.0.1)에서만 열리고, 이 사이트에서 온 요청이면서 연결 코드가 맞을 때만 응답합니다. Claude Code·Codex·Gemini CLI는 무카 CAD 도구와 웹 검색만 쓰도록 실행되어 파일·명령 실행 도구를 쓰지 않습니다.'));
    AIC.dlg=modal('AI 연결 — 내 AI로 그리기',[box]);AIC.dlg.id='aicDlg';renderDlg();
    }
