/* [테스트 서버] 저장 위치 고르기 — 2026-10-24
   크롬·엣지: ① 저장할 때마다 위치 묻기(윈도우 저장 창) ② 정한 폴더에 바로 저장 ③ 브라우저 다운로드 폴더(예전 방식)
   사파리·파이어폭스: 브라우저가 폴더 고르기를 지원하지 않아 ③ 그대로 + 브라우저 설정 안내
   모든 파일 저장(저장·DXF·DWG·PDF·PNG 등)은 offer() → dl.save() 를 지나므로 dl.save 만 감쌉니다. */
(function(){
  if(typeof dl==='undefined'||!dl||!dl.save||window.claude)return;
  const orig=dl.save.bind(dl);
  const CAN_ASK=typeof window.showSaveFilePicker==='function';
  const CAN_DIR=typeof window.showDirectoryPicker==='function';
  const LS='muccacad.savemode';
  const getMode=()=>{let m='';try{m=localStorage.getItem(LS)||''}catch(_){}if(m==='folder'&&!CAN_DIR)m='';if(m==='ask'&&!CAN_ASK)m='';return m||(CAN_ASK?'ask':'download')};
  const setMode=m=>{try{localStorage.setItem(LS,m)}catch(_){}};
  /* 고른 폴더(핸들)는 IndexedDB 에 보관 — 새로고침해도 유지 */
  const idb=()=>new Promise((res,rej)=>{const r=indexedDB.open('muccacad-save',1);r.onupgradeneeded=()=>r.result.createObjectStore('h');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  const hGet=async()=>{try{const d=await idb();return await new Promise(res=>{const q=d.transaction('h').objectStore('h').get('dir');q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)})}catch(_){return null}};
  const hSet=async v=>{try{const d=await idb();await new Promise(res=>{const t=d.transaction('h','readwrite');v?t.objectStore('h').put(v,'dir'):t.objectStore('h').delete('dir');t.oncomplete=res;t.onerror=res})}catch(_){}};
  let dirH=null;hGet().then(h=>{dirH=h;refreshBtn()});
  const toBlob=(filename,data)=>data instanceof Blob?data:new Blob([data],{type:/\.(json|lsp|js|dxf|txt|scr)$/i.test(filename)?'text/plain;charset=utf-8':'application/octet-stream'});
  const MIME={json:'application/json',dxf:'application/dxf',dwg:'application/acad',pdf:'application/pdf',png:'image/png',svg:'image/svg+xml',zip:'application/zip',lsp:'text/plain',scr:'text/plain',txt:'text/plain',csv:'text/csv'};
  const extOf=f=>{const m=/\.([a-z0-9]+)$/i.exec(f);return m?m[1].toLowerCase():''};
  const declined=()=>{const e=new Error('취소');e.code='declined';return e};
  const isGesture=e=>e&&(e.name==='SecurityError'||e.name==='NotAllowedError');
  async function write(fh,blob){const w=await fh.createWritable();await w.write(blob);await w.close()}
  async function permOK(h,ask){try{const o={mode:'readwrite'};if(await h.queryPermission(o)==='granted')return true;if(!ask)return false;return await h.requestPermission(o)==='granted'}catch(e){if(isGesture(e))throw e;return false}}
  async function uniqueName(dir,name){const i=name.lastIndexOf('.'),b=i>0?name.slice(0,i):name,x=i>0?name.slice(i):'';
    for(let n=1;n<200;n++){const t=n===1?name:`${b} (${n})${x}`;try{await dir.getFileHandle(t);}catch(e){if(e&&e.name==='NotFoundError')return t;throw e}}return `${b} (${Date.now()})${x}`}
  async function askSave(filename,blob){const ext=extOf(filename);
    const opt={suggestedName:filename,id:'muccacad'};if(dirH)opt.startIn=dirH;
    if(ext&&MIME[ext])opt.types=[{description:ext.toUpperCase()+' 파일',accept:{[MIME[ext]]:['.'+ext]}}];
    let fh;try{fh=await window.showSaveFilePicker(opt)}catch(e){if(e&&e.name==='AbortError')throw declined();if(e&&e.name==='TypeError'&&opt.types){delete opt.types;fh=await window.showSaveFilePicker(opt)}else throw e}
    await write(fh,blob);return fh.name}
  async function folderSave(filename,blob,gesture){if(!dirH)return null;
    if(!(await permOK(dirH,gesture)))return null;
    const name=await uniqueName(dirH,filename);const fh=await dirH.getFileHandle(name,{create:true});await write(fh,blob);return dirH.name+'/'+name}
  /* 파일 만들기가 오래 걸려(DWG·PDF 변환) 브라우저가 저장 창을 막으면 → [저장] 버튼 한 번 더 */
  function retryBox(filename,run){return new Promise((res,rej)=>{const o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center';
    const b=document.createElement('div');b.style.cssText='background:var(--panel,#1e2329);color:var(--ink,#eee);border:1px solid #555;border-radius:10px;padding:18px 20px;max-width:360px;font-size:14px;line-height:1.5';
    b.innerHTML=`<b>파일이 준비됐습니다</b><div style="margin:8px 0 14px;opacity:.85">${filename.replace(/[<>&]/g,'')}<br>[저장]을 누르면 저장 위치를 고를 수 있습니다.</div>`;
    const ok=document.createElement('button');ok.className='tbtn primary';ok.textContent='저장';const no=document.createElement('button');no.className='tbtn';no.textContent='취소';no.style.marginLeft='6px';
    ok.onclick=async()=>{o.remove();try{res(await run())}catch(e){rej(e)}};no.onclick=()=>{o.remove();rej(declined())};
    b.append(ok,no);o.append(b);document.body.append(o);ok.focus()})}
  dl.save=async function({filename,data}){const blob=toBlob(filename,data);const mode=getMode();
    const done=w=>{if(w)setTimeout(()=>{try{log('저장 위치: '+w,'ok')}catch(_){}},0);return w};
    try{
      if(mode==='folder'){let w=null;try{w=await folderSave(filename,blob,true)}catch(e){if(!isGesture(e))throw e;w=await retryBox(filename,()=>folderSave(filename,blob,true))}
        if(w)return done(w);
        toast('저장 폴더에 쓸 권한이 없어 위치를 묻습니다');if(!CAN_ASK)return orig({filename,data});}
      if(mode==='ask'||mode==='folder'){try{return done(await askSave(filename,blob))}catch(e){if(!isGesture(e))throw e;return done(await retryBox(filename,()=>askSave(filename,blob)))}}
    }catch(e){if(e&&e.code==='declined')throw e;try{log('저장 위치 기능 실패 → 다운로드 폴더로 저장합니다 ('+(e&&e.message||e)+')','err')}catch(_){}}
    return orig({filename,data})};
  /* 설정 창 (SAVEFOLDER · 저장폴더) */
  function openDlg(){const o=document.createElement('div');o.id='saveLocDlg';
    o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:center;justify-content:center';
    const b=document.createElement('div');b.style.cssText='background:var(--panel,#1e2329);color:var(--ink,#eee);border:1px solid #555;border-radius:10px;padding:18px 20px;width:min(440px,92vw);font-size:14px;line-height:1.55';
    const close=()=>{o.remove();refreshBtn()};o.onclick=e=>{if(e.target===o)close()};
    const render=()=>{const m=getMode();b.innerHTML='';const h=document.createElement('div');h.innerHTML='<b style="font-size:15px">저장 위치</b>';b.append(h);
      if(!CAN_ASK&&!CAN_DIR){const p=document.createElement('div');p.style.margin='10px 0';
        p.innerHTML='이 브라우저는 웹페이지에서 저장 폴더를 고르는 기능을 지원하지 않아, 파일이 브라우저의 <b>다운로드</b> 폴더에 저장됩니다.<br><br>위치를 바꾸려면 브라우저 설정에서 다운로드 폴더를 바꾸거나 "저장 전에 위치 묻기"를 켜 주세요. 크롬·엣지에서는 무카 CAD 안에서 바로 고를 수 있습니다.';b.append(p)}
      else{const opts=[];if(CAN_ASK)opts.push(['ask','저장할 때마다 위치 묻기','저장 창에서 폴더와 파일 이름을 고릅니다. 마지막에 고른 폴더를 기억합니다.']);
        if(CAN_DIR)opts.push(['folder','정한 폴더에 바로 저장','폴더를 한 번 고르면 묻지 않고 그 폴더에 저장합니다. 같은 이름이 있으면 (2)·(3)을 붙입니다.']);
        opts.push(['download','브라우저 다운로드 폴더','예전 방식입니다.']);
        for(const [k,t,d] of opts){const l=document.createElement('label');l.style.cssText='display:flex;gap:8px;align-items:flex-start;margin:10px 0;cursor:pointer';
          const r=document.createElement('input');r.type='radio';r.name='saveloc';r.checked=m===k;r.style.marginTop='4px';
          r.onchange=async()=>{if(k==='folder'&&!dirH){if(!(await pick()))return render()}setMode(k);render()};
          const s=document.createElement('div');s.innerHTML=`<b>${t}</b><div style="opacity:.75;font-size:12.5px">${d}</div>`;l.append(r,s);b.append(l);
          if(k==='folder'){const row=document.createElement('div');row.style.cssText='margin:-4px 0 6px 26px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
            const n=document.createElement('span');n.style.cssText='font-size:13px;opacity:.9';n.textContent=dirH?'📁 '+dirH.name:'(아직 고른 폴더 없음)';
            const pb=document.createElement('button');pb.className='tbtn';pb.textContent=dirH?'폴더 바꾸기':'폴더 고르기';pb.onclick=async()=>{if(await pick()){setMode('folder');render()}};
            row.append(n,pb);b.append(row)}}
        const tip=document.createElement('div');tip.style.cssText='opacity:.7;font-size:12px;margin-top:6px';tip.textContent='저장(JSON)·DXF·DWG·PDF·PNG 저장에 모두 적용됩니다. 윈도우 시스템 폴더 등 일부 폴더는 브라우저가 막습니다.';b.append(tip)}
      const f=document.createElement('div');f.style.cssText='text-align:right;margin-top:14px';const c=document.createElement('button');c.className='tbtn primary';c.textContent='닫기';c.onclick=close;f.append(c);b.append(f)};
    render();o.append(b);document.body.append(o)}
  async function pick(){try{const h=await window.showDirectoryPicker({id:'muccacad-dir',mode:'readwrite',startIn:dirH||'documents'});dirH=h;await hSet(h);try{log('저장 폴더: '+h.name,'ok')}catch(_){}return true}
    catch(e){if(!(e&&e.name==='AbortError'))try{log('폴더를 고르지 못했습니다: '+(e&&e.message||e),'err')}catch(_){}return false}}
  /* [저장] 옆 작은 버튼 */
  let btn=null;
  function refreshBtn(){if(!btn)return;const m=getMode();btn.title='저장 위치 — '+(m==='ask'?'저장할 때마다 묻기':m==='folder'?(dirH?'폴더: '+dirH.name:'정한 폴더'):'브라우저 다운로드 폴더')+' (SAVEFOLDER)'}
  (function(){const ref=document.getElementById('bSave');if(!ref)return;btn=document.createElement('button');btn.className='tbtn';btn.id='bSaveLoc';btn.textContent='📁';btn.setAttribute('aria-label','저장 위치');
    btn.onclick=openDlg;ref.parentNode.insertBefore(btn,ref.nextSibling);refreshBtn()})();
  /* [저장 ▾] · [출력 ▾] 메뉴 맨 아래에 '저장 위치 바꾸기' */
  function menuItem(cls,desc){const mi=document.createElement('button');mi.setAttribute('role','menuitem');mi.tabIndex=-1;mi.className='mi-saveloc';
    const row=document.createElement('span');row.className=cls?'row':'';const l=document.createElement('span');l.textContent='📁 저장 위치 바꾸기…';const k=document.createElement('span');k.className='k';k.textContent='SAVEFOLDER';if(cls){row.append(l,k);mi.append(row)}else mi.append(l,k);
    if(desc){const d=document.createElement('span');d.className='d';d.textContent=desc;mi.append(d)}
    mi.onclick=()=>{const m=mi.parentNode;if(m)m.hidden=true;document.querySelectorAll('#bSaveMenu,#bOut').forEach(b=>b.setAttribute('aria-expanded','false'));openDlg()};return mi}
  const curDesc=()=>{const m=getMode();return '지금: '+(m==='ask'?'저장할 때마다 위치 묻기':m==='folder'?(dirH?'폴더 '+dirH.name+'에 바로 저장':'정한 폴더에 바로 저장'):'브라우저 다운로드 폴더')};
  function hookMenus(){const sv=document.querySelector('.svMenu');
    if(sv){const add=()=>{const old=sv.querySelector('.mi-saveloc');if(old){const d=old.querySelector('.d');if(d)d.textContent=curDesc();return}if(!sv.childElementCount)return;sv.append(document.createElement('hr'),menuItem(true,curDesc()))};
      new MutationObserver(add).observe(sv,{childList:true});add()}
    const om=document.getElementById('outMenu');if(om&&!om.querySelector('.mi-saveloc'))om.append(menuItem(false,''))}
  hookMenus();setTimeout(hookMenus,1500);
  try{TOOLS.savefolder=()=>{setTimeout(openDlg);return null};
    Object.assign(ALIAS,{SAVEFOLDER:'savefolder',SAVELOC:'savefolder',SAVEPATH:'savefolder',SAVEDIR:'savefolder'});
    CMD_KO.savefolder='저장 위치';for(const k of ['저장위치','저장폴더','저장경로','저장장소'])KO_CMD[k]='savefolder'}catch(_){}
  window.LABSAVE={openDlg,getMode};
})();
