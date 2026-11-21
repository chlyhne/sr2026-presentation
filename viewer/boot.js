const VIEWER_SCRIPT_TIMEOUT_MS=45000;
const viewerScriptBase=new URL('.',document.currentScript.src);
function setViewerLoadingStage(stage){document.getElementById('viewerLoadingStage').textContent=stage;}
function updateViewerLoading(value){
 const progress=document.getElementById('viewerLoadingProgress');
 progress.value=value;progress.setAttribute('aria-valuetext',Math.floor(value)+srText(' % indlæst'));
}
function showViewerLoadingError(error){
 window.SRClientDiagnostics?.report('loading-error',error);
 document.getElementById('viewerLoadingProgress').hidden=true;
 const message=document.getElementById('viewerLoadingError');
 const stage=document.getElementById('viewerLoadingStage').textContent;
 message.textContent=(srText(error.message||'Siden kunne ikke indlæses. Genindlæs for at prøve igen.'))+srText(' Trin: ')+stage;message.hidden=false;
 document.getElementById('viewerLoadingRetry').hidden=false;
 document.body.setAttribute('aria-busy','false');
}
document.getElementById('viewerLoadingRetry').onclick=()=>location.reload();
function validatePresentationDocument(document){
 if(!document||document.version!==1||!Array.isArray(document.notes)||!Array.isArray(document.speedPins))throw Error(srText('Ugyldige præsentationsdata: version 1, notes og speedPins er påkrævet.'));
 return document;
}
const localEventSource='local';
const localEventSetKey='sr2026-local-event-set';
const eventSetFields={'sr2026-notes':'notes','sr2026-speed-pins':'speedPins'};
let eventSetSource=localEventSource;
let eventSetRevision=null;
let eventSetDocument=null;
function eventSetDraftKey(source){return 'sr2026-event-set:'+source;}
function readLocalEventSet(){
 const saved=eventStorage.getItem(localEventSetKey);
 if(saved!==null)return validatePresentationDocument(JSON.parse(saved));
 return validatePresentationDocument({version:1,
  notes:JSON.parse(eventStorage.getItem('sr2026-notes')??'[]'),
  speedPins:JSON.parse(eventStorage.getItem('sr2026-speed-pins')??'[]')});
}
function initializeEventSetStorage(){
 window.SRStorage={
  getItem:key=>{
   const field=eventSetFields[key];
   if(!field)return null;
   const document=eventSetSource===localEventSource?readLocalEventSet():eventSetDocument;
   return JSON.stringify(document[field]);
  },
  setItem:(key,value)=>{
   const field=eventSetFields[key];
   if(!field||window.SR_READONLY)return;
   if(eventSetSource===localEventSource){
    const document={...readLocalEventSet(),[field]:JSON.parse(value)};
    eventStorage.setItem(localEventSetKey,JSON.stringify(document));
    return;
   }
   const document={...eventSetDocument,[field]:JSON.parse(value)};
   eventStorage.setItem(eventSetDraftKey(eventSetSource),JSON.stringify({revision:eventSetRevision,document}));
   eventSetDocument=document;
  }
 };
}
(async()=>{
 await loadEventSelection();
 const event=window.SR_EVENT;
 const config=window.SR_CONFIG;
 if(!config)throw Error(srText('Viewerens konfiguration mangler.'));
 const local=!!config.local;
 const routeSetup=local&&new URLSearchParams(location.search).get('editRoute')==='1';
 window.SR_RHUMBLINE_SETUP=routeSetup;
 window.SR_SETUP_COURSE=new URLSearchParams(location.search).get('course')||Object.keys(event.courses)[0];
 if(!Object.hasOwn(event.courses,window.SR_SETUP_COURSE))throw Error(srText('Ukendt bane til rhumbline.'));
 window.SR_READONLY=!local&&!eventServiceAvailable();
 initializeEventSetStorage();
 if(routeSetup){
  window.SR_READONLY=true;
  const isolated=new Map([['sr2026-notes','[]'],['sr2026-speed-pins','[]']]);
  window.SRStorage={getItem:key=>isolated.get(key)??null,setItem:()=>{}};
 }
 if(window.SR_READONLY&&!local){
  eventSetDocument=await readPublishedEventSet('default');
  eventSetSource='public:default';
 }
 updateViewerLoading(5);
 const files=['track-time','tracks','track-local-data','track-source-codec','prepared-track-codec','replay-data','boat-details','boat-icons','weather','viewer','rendering','vendor/earcut','background-renderer','traffic','military','rhumbline-geometry','navigation-math','navigation','track-files','track-preparation','track-renderer','ghost-math','ghosts','speed-pins','boat-list','timeline','gate-timing','boat-compare','drawings','event-images','image-crop','event-videos','inline-text','event-panel','presentation','online',...(routeSetup?['rhumbline-editor']:[])];
 const preparationWeight=60,totalSteps=files.length+preparationWeight;
 let completed=0;
 for(const file of files){
  setViewerLoadingStage(srText('Indlæser ')+file+'.js');
  await new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=new URL(file+'.js',viewerScriptBase).href;
   const timer=setTimeout(()=>{script.remove();finish(Error(srText('Indlæsningen af {0}.js svarede ikke inden for 45 sekunder.',file)));},VIEWER_SCRIPT_TIMEOUT_MS);
   const finish=error=>{
    clearTimeout(timer);window.removeEventListener('error',executionError);script.onload=script.onerror=null;
    if(error)reject(error);else resolve();
   };
   const executionError=event=>{if(event.filename===script.src)finish(event.error||Error(event.message));};
   window.addEventListener('error',executionError);
   script.onload=()=>finish();
   script.onerror=()=>finish(Error(srText('Filen {0}.js kunne ikke indlæses. Genindlæs for at prøve igen.',file)));
   document.body.append(script);
  });
  if(file==='replay-data'){
   setViewerLoadingStage(srText('Henter færdige spor og kortdata'));
   await loadReplayData();
   const data=window.DATA;
   if(!data||!Array.isArray(data.coast)||!data.coast_metadata?.attribution||data.coast_metadata.license!=='ODbL-1.0')throw Error(srText('Kortdata mangler den detaljerede OSM-kystlinje.'));
   for(const name of ['land','course_lines','route_t','traffic_separation','military_areas']){
    if(!Array.isArray(data[name]?.features))throw Error(srText('Kortdata mangler laget ')+name+'.');
   }
  }
  if(file==='weather')await loadEventWeather(event,window.DATA);
  if(file==='rhumbline-geometry'){
   const definitions=Object.entries(event.courses).map(([course,definition])=>{
    const route={version:1,points:definition.points};
    if(!validRhumbline(route))throw Error(srText('Rhumbline for ')+course+srText(' er ugyldig.'));
    return [course,Object.freeze({version:1,points:Object.freeze(route.points.map(p=>Object.freeze(p)))})];
   });
   window.SR_RHUMBLINES=Object.freeze(Object.fromEntries(definitions));
   window.SR_RHUMBLINE=window.SR_RHUMBLINES[routeSetup?window.SR_SETUP_COURSE:Object.keys(event.courses)[0]];
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
 setViewerLoadingStage(srText('Initialiserer kortbaggrunden'));
 webglBackground.initialize();assertRenderingReady();
 await document.fonts.ready;
 setViewerLoadingStage(srText('Tegner kortbaggrunden første gang'));
 webglBackground.render(true);assertRenderingReady();
 await waitForGpu(webglBackground.gl,srText('Vent på kortbaggrundens første tegning'));assertRenderingReady();
 webglTracks.initialize();assertRenderingReady();
 await webglTracks.preparation.loadGeometry();assertRenderingReady();
 await webglTracks.prepareComparison();assertRenderingReady();
 await webglTracks.preparation.ready(srText('Vent på indlæst sporgeometri'));
 setViewerLoadingStage(srText('Forbereder første kortvisning'));
 viewerModulesReady=true;requestRender();
 await waitForMapReady();
 await webglTracks.preparation.ready(srText('Vent på sporenes første tegning'));assertRenderingReady();
 updateViewerLoading(100);
 await new Promise(resolve=>requestAnimationFrame(resolve));
 assertRenderingReady();
 $('viewerLoading').hidden=true;document.documentElement.classList.remove('viewer-loading');
 document.body.setAttribute('aria-busy','false');document.querySelector('main').inert=false;
 srOnLanguageChange(()=>{
  syncPlaybackControls();updateFullscreenButton();
  updateBoatCourseOptions();boatRaceControlsKey=null;boatListSource=[];updateVisibleBoats();
  syncNavigationControls();lastNavigationKey=null;renderNavigation();
  refreshPresentationEvents();updateDrawingControls();renderWindAvailability(currentTime());
  for(const record of boatMarkerNodes.values())updateBoatMarkerLabel(record);
  renderSpeedPins();mapCreditKey=null;trackLegendKey=null;renderMapCredit();
  boatCompareRenderKey='';if(!SIMPLE_IPHONE_TRACKS)renderBoatCompare();
  if($('inlineTextStatus').textContent)$('inlineTextStatus').textContent=$('annotationStatus').textContent;
 });
 initializeOnlineEvents();
 window.SRClientDiagnostics?.report('ready',srText('Kortet er klar'));
})().catch(showViewerLoadingError);
