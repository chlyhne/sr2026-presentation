(async()=>{
 const config=window.SR_CONFIG||{}, local=!!config.local;
 window.SR_READONLY=!local;
 window.SRStorage=localStorage;
 if(!local){
  let initial={version:1,notes:[],speedPins:[]},sha=null;
  try{
   if(config.admin){
    const session=await fetch(config.apiBase+'/api/session',{cache:'no-store'}).then(r=>r.json());
    if(!session.canEdit){
     const message=Object.assign(document.createElement('p'),{textContent:'Log ind med en GitHub-konto med skriverettighed til præsentationens repository.'});
     const link=Object.assign(document.createElement('a'),{href:config.apiBase+'/auth/login',textContent:'Log ind med GitHub'});
     document.body.replaceChildren(message,link);return;
    }
    window.SR_READONLY=false;window.SR_LOGIN=session.login;
   }
   const url=config.admin?config.apiBase+'/api/presentation':'presentation.json';
   const response=await fetch(url,{cache:'no-store'});
   if(!response.ok)throw new Error('Præsentationen kunne ikke indlæses ('+response.status+').');
   const result=await response.json();initial=config.admin?result.document:result;sha=result.sha||null;
   if(!Array.isArray(initial.notes)||!Array.isArray(initial.speedPins))throw new Error('Ugyldige præsentationsdata.');

  }catch(error){
   document.body.replaceChildren(Object.assign(document.createElement('p'),{textContent:error.message}));return;
  }
  window.SR_SHA=sha;
  const draftKey='sr2026-draft:'+location.pathname+':'+(window.SR_LOGIN||'');
  if(config.admin){try{const draft=JSON.parse(localStorage.getItem(draftKey));if(draft&&draft.sha===sha){initial=draft.document;window.SR_RESTORED=true;}else if(draft){localStorage.setItem(draftKey+':previous',JSON.stringify(draft));}window.SR_PREVIOUS_DRAFT=JSON.parse(localStorage.getItem(draftKey+':previous')||'null');}catch{}}
  const memory=new Map([['sr2026-notes',JSON.stringify(initial.notes)],['sr2026-speed-pins',JSON.stringify(initial.speedPins)]]);
  window.SRStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>{
   if(window.SR_READONLY)return;
   memory.set(key,value);
   if(config.admin){localStorage.setItem(draftKey,JSON.stringify({sha:window.SR_SHA,document:{version:1,notes:JSON.parse(memory.get('sr2026-notes')),speedPins:JSON.parse(memory.get('sr2026-speed-pins'))}}));}
  }};
  window.SR_DRAFT_KEY=draftKey;
 }
 for(const file of ['data','boat-measurements','boat-icons','weather','viewer','vendor/earcut','background-renderer','traffic','military','tracks','track-renderer','speed-pins','timeline','drawings','event-images','event-videos','inline-text','presentation','online']){
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=file+'.js';s.onload=resolve;s.onerror=reject;document.body.append(s);});
  if(file==='boat-icons')await loadBoatHulls();
  if(file==='track-renderer')prepareSelectedTracks();
 }
})().catch(()=>{document.body.append(Object.assign(document.createElement('p'),{textContent:'Siden kunne ikke indlæses. Genindlæs for at prøve igen.'}));});
