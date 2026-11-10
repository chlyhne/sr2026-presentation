function updateViewerLoading(value){
 const progress=document.getElementById('viewerLoadingProgress');
 progress.value=value;progress.setAttribute('aria-valuetext',Math.floor(value)+' % indlæst');
}
function showViewerLoadingError(error){
 document.getElementById('viewerLoadingProgress').hidden=true;
 const message=document.getElementById('viewerLoadingError');
 message.textContent=error.message||'Siden kunne ikke indlæses. Genindlæs for at prøve igen.';message.hidden=false;
 document.getElementById('viewerLoadingRetry').hidden=false;
 document.body.setAttribute('aria-busy','false');
}
document.getElementById('viewerLoadingRetry').onclick=()=>location.reload();
(async()=>{
 const config=window.SR_CONFIG||{}, local=!!config.local;
 const routeSetup=local&&location.pathname==='/rhumbline.html';
 window.SR_RHUMBLINE_SETUP=routeSetup;
 window.SR_READONLY=!local;
 window.SRStorage=localStorage;
 if(routeSetup){
  window.SR_READONLY=true;
  const isolated=new Map([['sr2026-notes','[]'],['sr2026-speed-pins','[]']]);
  window.SRStorage={getItem:key=>isolated.get(key)||null,setItem:()=>{}};
 }
 if(!local){
  let initial={version:1,notes:[],speedPins:[]},sha=null;
  try{
   if(config.admin){
    const session=await fetch(config.apiBase+'/api/session',{cache:'no-store'}).then(r=>r.json());
    if(!session.canEdit){
     const message=Object.assign(document.createElement('p'),{textContent:'Log ind med en GitHub-konto med skriverettighed til præsentationens repository.'});
     const link=Object.assign(document.createElement('a'),{href:config.apiBase+'/auth/login',textContent:'Log ind med GitHub'});
     document.body.replaceChildren(message,link);document.documentElement.classList.remove('viewer-loading');document.body.setAttribute('aria-busy','false');return;
    }
    window.SR_READONLY=false;window.SR_LOGIN=session.login;
   }
   const url=config.admin?config.apiBase+'/api/presentation':'presentation.json';
   const response=await fetch(url,{cache:'no-store'});
   if(!response.ok)throw new Error('Præsentationen kunne ikke indlæses ('+response.status+').');
   const result=await response.json();initial=config.admin?result.document:result;sha=result.sha||null;
   if(!Array.isArray(initial.notes)||!Array.isArray(initial.speedPins))throw new Error('Ugyldige præsentationsdata.');

  }catch(error){
   showViewerLoadingError(error);return;
  }
  window.SR_SHA=sha;
  const draftKey='sr2026-draft:'+location.pathname+':'+(window.SR_LOGIN||'');
  if(config.admin){try{const draft=JSON.parse(localStorage.getItem(draftKey));if(draft&&draft.sha===sha){initial=draft.document;window.SR_RESTORED=true;}else if(draft){localStorage.setItem(draftKey+':previous',JSON.stringify(draft));}window.SR_PREVIOUS_DRAFT=JSON.parse(localStorage.getItem(draftKey+':previous')||'null');}catch{}}
  const memory=new Map([['sr2026-notes',JSON.stringify(initial.notes)],['sr2026-speed-pins',JSON.stringify(initial.speedPins)]]);
  window.SRStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>{
   if(window.SR_READONLY)return;
   const next=new Map(memory);next.set(key,value);
   if(config.admin){localStorage.setItem(draftKey,JSON.stringify({sha:window.SR_SHA,document:{version:1,notes:JSON.parse(next.get('sr2026-notes')),speedPins:JSON.parse(next.get('sr2026-speed-pins'))}}));}
   memory.set(key,value);
  }};
  window.SR_DRAFT_KEY=draftKey;
 }
 updateViewerLoading(5);
 const files=['data','boat-measurements','boat-details','boat-icons','weather','track-time','viewer','rendering','vendor/earcut','background-renderer','traffic','military','tracks','rhumbline-geometry','navigation-math','navigation','track-profiles','track-renderer','speed-pins','boat-list','timeline','drawings','event-images','image-crop','event-videos','inline-text','presentation','online',...(routeSetup?['rhumbline-editor']:[])];
 const preparationWeight=60,totalSteps=files.length+preparationWeight;
 let completed=0;
 for(const file of files){
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=file+'.js';s.onload=resolve;s.onerror=()=>reject(Error('Filen '+file+'.js kunne ikke indlæses. Genindlæs for at prøve igen.'));document.body.append(s);});
  if(file==='rhumbline-geometry'){
   const response=await fetch('rhumbline.json',{cache:'no-store'});
   if(!response.ok)throw Error('Den permanente rhumbline kunne ikke indlæses ('+response.status+').');
   const route=await response.json();
   if(!validRhumbline(route))throw Error('Den permanente rhumbline indeholder ugyldige punkter.');
   window.SR_RHUMBLINE=Object.freeze({version:1,points:Object.freeze(route.points.map(p=>Object.freeze(p)))});
  }
  if(file==='boat-icons')await loadBoatHulls();
  if(file==='track-profiles'&&!routeSetup)await loadTrackProfiles();
  if(file==='track-renderer'){
   if(routeSetup)prepareSelectedTracks();
   else{
    await prepareFleetTracks((prepared,total)=>updateViewerLoading(5+90*(completed+preparationWeight*prepared/total)/totalSteps));
    if(webglTracks.active)webglTracks.prepareComparison();
   }
   completed+=preparationWeight;
  }
  updateViewerLoading(5+90*++completed/totalSteps);
 }
 await waitForMapReady();
 updateViewerLoading(100);
 await new Promise(resolve=>requestAnimationFrame(resolve));
 $('viewerLoading').hidden=true;document.documentElement.classList.remove('viewer-loading');
 document.body.setAttribute('aria-busy','false');document.querySelector('header').inert=false;document.querySelector('main').inert=false;
})().catch(showViewerLoadingError);
