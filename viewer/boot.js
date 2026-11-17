const VIEWER_SCRIPT_TIMEOUT_MS=45000;
function setViewerLoadingStage(stage){document.getElementById('viewerLoadingStage').textContent=stage;}
function updateViewerLoading(value){
 const progress=document.getElementById('viewerLoadingProgress');
 progress.value=value;progress.setAttribute('aria-valuetext',Math.floor(value)+' % indlæst');
}
function showViewerLoadingError(error){
 window.SRClientDiagnostics?.report('loading-error',error);
 document.getElementById('viewerLoadingProgress').hidden=true;
 const message=document.getElementById('viewerLoadingError');
 const stage=document.getElementById('viewerLoadingStage').textContent;
 message.textContent=(error.message||'Siden kunne ikke indlæses. Genindlæs for at prøve igen.')+' Trin: '+stage;message.hidden=false;
 document.getElementById('viewerLoadingRetry').hidden=false;
 document.body.setAttribute('aria-busy','false');
}
document.getElementById('viewerLoadingRetry').onclick=()=>location.reload();
function validatePresentationDocument(document){
 if(!document||document.version!==1||!Array.isArray(document.notes)||!Array.isArray(document.speedPins))throw Error('Ugyldige præsentationsdata: version 1, notes og speedPins er påkrævet.');
 return document;
}
(async()=>{
 const config=window.SR_CONFIG;
 if(!config)throw Error('Viewerens konfiguration mangler.');
 const local=!!config.local;
 const routeSetup=local&&location.pathname==='/rhumbline.html';
 window.SR_RHUMBLINE_SETUP=routeSetup;
 window.SR_SETUP_COURSE=new URLSearchParams(location.search).get('course')||'groensund';
 if(!['groensund','boegestroemmen'].includes(window.SR_SETUP_COURSE))throw Error('Ukendt bane til rhumbline.');
 window.SR_READONLY=!local;
 window.SRStorage=localStorage;
 if(routeSetup){
  window.SR_READONLY=true;
  const isolated=new Map([['sr2026-notes','[]'],['sr2026-speed-pins','[]']]);
  window.SRStorage={getItem:key=>isolated.get(key)??null,setItem:()=>{}};
 }
 if(!local){
  let initial,sha=null;
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
   const result=await response.json();initial=validatePresentationDocument(config.admin?result.document:result);sha=result.sha||null;

  }catch(error){
   showViewerLoadingError(error);return;
  }
  window.SR_SHA=sha;
  const draftKey='sr2026-draft:'+location.pathname+':'+(window.SR_LOGIN||'');
  if(config.admin){
   const draft=JSON.parse(localStorage.getItem(draftKey));
   if(draft){
    validatePresentationDocument(draft.document);
    if(draft.sha===sha){initial=draft.document;window.SR_RESTORED=true;}
    else localStorage.setItem(draftKey+':previous',JSON.stringify(draft));
   }
   window.SR_PREVIOUS_DRAFT=JSON.parse(localStorage.getItem(draftKey+':previous')??'null');
   if(window.SR_PREVIOUS_DRAFT)validatePresentationDocument(window.SR_PREVIOUS_DRAFT.document);
  }
  const memory=new Map([['sr2026-notes',JSON.stringify(initial.notes)],['sr2026-speed-pins',JSON.stringify(initial.speedPins)]]);
  window.SRStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>{
   if(window.SR_READONLY)return;
   const next=new Map(memory);next.set(key,value);
   if(config.admin){localStorage.setItem(draftKey,JSON.stringify({sha:window.SR_SHA,document:{version:1,notes:JSON.parse(next.get('sr2026-notes')),speedPins:JSON.parse(next.get('sr2026-speed-pins'))}}));}
   memory.set(key,value);
  }};
  window.SR_DRAFT_KEY=draftKey;
 }
 updateViewerLoading(5);
 const files=['track-time','tracks','track-local-data','track-source-codec','prepared-track-codec','replay-data','boat-measurements','boat-details','boat-icons','weather','viewer','rendering','vendor/earcut','background-renderer','traffic','military','rhumbline-geometry','navigation-math','navigation','track-files','track-preparation','track-renderer','ghost-math','ghosts','speed-pins','boat-list','timeline','gate-timing','boat-compare','drawings','event-images','image-crop','event-videos','inline-text','event-panel','presentation','online',...(routeSetup?['rhumbline-editor']:[])];
 const preparationWeight=60,totalSteps=files.length+preparationWeight;
 let completed=0;
 for(const file of files){
  setViewerLoadingStage('Indlæser '+file+'.js');
  await new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=file+'.js';
   const timer=setTimeout(()=>{script.remove();finish(Error('Indlæsningen af '+file+'.js svarede ikke inden for 45 sekunder.'));},VIEWER_SCRIPT_TIMEOUT_MS);
   const finish=error=>{
    clearTimeout(timer);window.removeEventListener('error',executionError);script.onload=script.onerror=null;
    if(error)reject(error);else resolve();
   };
   const executionError=event=>{if(event.filename===script.src)finish(event.error||Error(event.message));};
   window.addEventListener('error',executionError);
   script.onload=()=>finish();
   script.onerror=()=>finish(Error('Filen '+file+'.js kunne ikke indlæses. Genindlæs for at prøve igen.'));
   document.body.append(script);
  });
  if(file==='replay-data'){
   setViewerLoadingStage('Henter færdige spor og kortdata');
   await loadReplayData();
   const data=window.DATA;
   if(!data||!Array.isArray(data.coast)||!data.coast_metadata?.attribution||data.coast_metadata.license!=='ODbL-1.0')throw Error('Kortdata mangler den detaljerede OSM-kystlinje.');
   for(const name of ['land','course_lines','route_t','traffic_separation','military_areas']){
    if(!Array.isArray(data[name]?.features))throw Error('Kortdata mangler laget '+name+'.');
   }
  }
  if(file==='rhumbline-geometry'){
   const definitions=await Promise.all(['groensund','boegestroemmen'].map(async course=>{
    const response=await fetch(course==='groensund'?'rhumbline.json':'rhumbline-boegestroemmen.json',{cache:'no-store'});
    if(!response.ok)throw Error('Rhumbline for '+course+' kunne ikke indlæses ('+response.status+').');
    const route=await response.json();
    if(!validRhumbline(route))throw Error('Rhumbline for '+course+' indeholder ugyldige punkter.');
    return [course,Object.freeze({version:1,points:Object.freeze(route.points.map(p=>Object.freeze(p)))})];
   }));
   window.SR_RHUMBLINES=Object.freeze(Object.fromEntries(definitions));
   window.SR_RHUMBLINE=window.SR_RHUMBLINES[routeSetup?window.SR_SETUP_COURSE:'groensund'];
  }
  if(file==='boat-icons')await loadBoatHulls();
  if(file==='track-renderer'){
   assertRenderingReady();
   await prepareFleetTracks((prepared,total)=>updateViewerLoading(5+90*(completed+preparationWeight*prepared/total)/totalSteps));
   if(webglTracks.active)await webglTracks.preparation.compare(referenceBoat());
   assertRenderingReady();
   completed+=preparationWeight;
  }
  updateViewerLoading(5+90*++completed/totalSteps);
 }
 setViewerLoadingStage('Initialiserer kortbaggrunden');
 webglBackground.initialize();assertRenderingReady();
 await document.fonts.ready;
 setViewerLoadingStage('Tegner kortbaggrunden første gang');
 webglBackground.render(true);assertRenderingReady();
 await waitForGpu(webglBackground.gl,'Vent på kortbaggrundens første tegning');assertRenderingReady();
 webglTracks.initialize();assertRenderingReady();
 await webglTracks.preparation.loadGeometry();assertRenderingReady();
 await webglTracks.prepareComparison();assertRenderingReady();
 await webglTracks.preparation.ready('Vent på indlæst sporgeometri');
 setViewerLoadingStage('Forbereder første kortvisning');
 viewerModulesReady=true;requestRender();
 await waitForMapReady();
 await webglTracks.preparation.ready('Vent på sporenes første tegning');assertRenderingReady();
 updateViewerLoading(100);
 await new Promise(resolve=>requestAnimationFrame(resolve));
 assertRenderingReady();
 $('viewerLoading').hidden=true;document.documentElement.classList.remove('viewer-loading');
 document.body.setAttribute('aria-busy','false');document.querySelector('main').inert=false;
 window.SRClientDiagnostics?.report('ready','Kortet er klar');
})().catch(showViewerLoadingError);
