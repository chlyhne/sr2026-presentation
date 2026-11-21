// Enabled by the local test server only. No external telemetry service.
(()=>{
 const config=window.SR_CONFIG;if(!config?.local||!config.diagnosticsUrl)return;
 const endpoint=new URL(config.diagnosticsUrl,document.baseURI),renderers=new Map(),seen=new Set();
 const session=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),started=performance.now();
 const recentErrors=[];
 let errorCount=0,lastLoadingState='',loadingReports=0;
 const clip=(value,length=3000)=>String(value??'').slice(0,length);
 const status=message=>{for(const node of document.querySelectorAll('[data-client-report-status]')){node.textContent=message;node.hidden=false;}};
 function snapshot(){
  const contexts={};
  for(const [name,read] of renderers){try{contexts[name]=read();}catch(error){contexts[name]={snapshotError:clip(error.message)};}}
  return {stage:clip(document.getElementById('viewerLoadingStage')?.textContent,256),progress:Number(document.getElementById('viewerLoadingProgress')?.value),
   loading:document.body.getAttribute('aria-busy')==='true',elapsedMs:Math.round(performance.now()-started),
   sourceFingerprint:window.SR_TRACK_SOURCE_FINGERPRINT||null,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],visibility:document.visibilityState,focused:document.hasFocus(),contexts};
 }
 async function report(kind,error,extra={}){
  const message=clip(error?.message??error),state=snapshot(),key=[kind,message,state.stage].join(':');
  const important=!['session','loading','reload','reload-blocked','control-ready','ready','gpu-ready','graphics-released','gpu-probe-step','gpu-probe-context','gpu-probe-second-context','gpu-probe-vertex','gpu-probe-upload','gpu-probe-feedback','gpu-probe-geometry','gpu-probe-draw'].includes(kind)&&!(kind==='gpu-probe-result'&&message===srText('Bestået'));
  if(important){if(seen.has(key)||errorCount>=20)return false;seen.add(key);errorCount++;recentErrors.push({kind,message:clip(message,600),stack:clip(error?.stack,800)});if(recentErrors.length>3)recentErrors.shift();status(srText('Sender fejlrapport …'));}
  const data={...extra,version:1,session,kind,message,stack:clip(error?.stack,5000),path:location.pathname,userAgent:clip(navigator.userAgent,512),time:new Date().toISOString(),state};
  try{
   const response=await fetch(endpoint,{method:'POST',mode:'same-origin',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),keepalive:true});
   if(!response.ok)throw Error('HTTP '+response.status);
   if(important)status(srText('Fejlrapport sendt til testserveren.'));return true;
  }catch(failure){if(important)status(srText('Fejlrapporten kunne ikke afleveres: ')+clip(failure.message));return false;}
 }
 window.SRClientDiagnostics={report,register:(name,read)=>renderers.set(name,read)};
 window.addEventListener('error',event=>{
  if(event.error||event.message)report('javascript',event.error||event.message,{source:clip(event.filename,1024),line:event.lineno,column:event.colno});
  else if(event.target?.tagName==='SCRIPT')report('resource',srText('JavaScript-modul kunne ikke indlæses'),{source:new URL(event.target.src,location.href).pathname});
 },true);
 window.addEventListener('unhandledrejection',event=>report('unhandledrejection',event.reason));
 function reloadSafe(){
  if(typeof editingNote!=='undefined'&&editingNote)return false;
  if(typeof eventImageUploads!=='undefined'&&eventImageUploads.size)return false;
  if(typeof inlineTextSession!=='undefined'&&inlineTextSession&&document.getElementById('eventTextEditor').value!==inlineTextSession.text)return false;
  if(typeof drawingGesture!=='undefined'&&drawingGesture)return false;
  if(typeof drag!=='undefined'&&drag)return false;
  if(document.querySelector('dialog[open]'))return false;
  return true;
 }
 if(config.clientControlUrl){
  const controlUrl=new URL(config.clientControlUrl,document.baseURI),handledKey='sr2026-test-reload';
  // config.js is fetched fresh for this document, so an existing command has
  // already been fulfilled by this navigation. Do not interrupt its startup.
  if(typeof config.clientControlRevision==='string')sessionStorage.setItem(handledKey,config.clientControlRevision);
  let blockedRevision=null,reloading=false;
  async function poll(){
   try{
    const response=await fetch(controlUrl,{cache:'no-store',mode:'same-origin',credentials:'omit'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const command=await response.json();
    if(command.command!=='reload'||typeof command.revision!=='string'||!Number.isFinite(command.expiresAt)||command.expiresAt<=Date.now())return;
    if(command.target==='iphone'&&!/iPhone/.test(navigator.userAgent))return;
    if(command.target&& !['all','iphone',session].includes(command.target))return;
    if(sessionStorage.getItem(handledKey)===command.revision)return;
    if(document.body.getAttribute('aria-busy')==='true'){
     status(srText('Automatisk genindlæsning afventer igangværende indlæsning.'));return;
    }
    if(!reloadSafe()){
     status(srText('Automatisk genindlæsning afventer ugemte ændringer.'));
     if(blockedRevision!==command.revision){blockedRevision=command.revision;await report('reload-blocked',srText('Genindlæsning afventer kladden'),{revision:command.revision});}
     return;
    }
    // This acknowledgement persists current state and recent errors before reload.
    if(!await report('reload',srText('Genindlæser testside efter serverkommando'),{revision:command.revision,recentErrors})){status(srText('Genindlæsning afventer aflevering af fejlrapporten.'));return;}
    if(!reloadSafe())return;
    if(window.SRReleaseGraphics){
     await window.SRReleaseGraphics();
     if(!await report('graphics-released',srText('GPU-kontekster frigivet før genindlæsning'),{revision:command.revision}))throw Error(srText('GPU-oprydningens status kunne ikke afleveres.'));
    }
    sessionStorage.setItem(handledKey,command.revision);reloading=true;
    status(srText('Genindlæser testside …'));location.reload();
   }catch(error){status(srText('Automatisk genindlæsning afventer testserveren: ')+clip(error.message));}
   finally{if(!reloading)setTimeout(poll,2000);}
  }
  report('control-ready',srText('Klienten er klar til serverstyret genindlæsning'));
  setTimeout(poll,2000);
 }
 report('session',srText('Klienten starter'));
 // A stopped load may not produce an exception. Retain its last changed stage.
 const timer=setInterval(()=>{
  if(document.body.getAttribute('aria-busy')!=='true'||loadingReports>=30){clearInterval(timer);return;}
  const state=snapshot(),key=[state.stage,state.progress].join(':');
  if(key!==lastLoadingState){lastLoadingState=key;loadingReports++;report('loading',srText('Indlæsning i gang'));}
 },5000);
})();
