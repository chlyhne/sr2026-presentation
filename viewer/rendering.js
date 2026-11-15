// One rendering path. Fail visibly instead of changing the implementation.
const renderingErrors=new Map();
let releasingPageGraphics=false,graphicsReleaseTask=null;
window.SRReleaseGraphics=()=>graphicsReleaseTask??=(async()=>{
 releasingPageGraphics=true;viewerModulesReady=false;
 const track=typeof webglTracks==='undefined'?null:webglTracks,background=typeof webglBackground==='undefined'?null:webglBackground;
 if(track){track.active=false;track.preparation?.dispose();}
 if(background)background.active=false;
 const pending=[];
 for(const renderer of [track,background]){
  const gl=renderer?.gl;if(!gl||gl.isContextLost())continue;
  const extension=gl.getExtension('WEBGL_lose_context');
  if(!extension)throw Error('WebGL-konteksten kunne ikke frigives før genindlæsning.');
  pending.push(new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('GPU-frigivelsen svarede ikke inden for 2 sekunder.')),2000);
   renderer.canvas.addEventListener('webglcontextlost',()=>{clearTimeout(timer);resolve();},{once:true});
   extension.loseContext();
  }));
 }
 await Promise.all(pending);
})();
window.addEventListener('pagehide',event=>{if(!event.persisted)window.SRReleaseGraphics().catch(()=>{});});
function hasRenderingFailure(){return renderingErrors.size>0;}
function reportRenderingFailure(layer,error){
 window.SRClientDiagnostics?.report('rendering-'+layer,error);
 renderingErrors.set(layer,error?.message||String(error));
 document.body.classList.add('rendering-failed');
 $('renderingErrorDetails').textContent=[...renderingErrors].map(([name,message])=>`${name}: ${message}`).join('\n');
 $('renderingError').hidden=false;
 if(typeof stopPlayback==='function')stopPlayback();
 $('play').disabled=true;
}
function clearRenderingFailure(layer){
 renderingErrors.delete(layer);
 if(renderingErrors.size){$('renderingErrorDetails').textContent=[...renderingErrors].map(([name,message])=>`${name}: ${message}`).join('\n');return;}
 document.body.classList.remove('rendering-failed');$('renderingError').hidden=true;
 $('renderingErrorDetails').textContent='';
 // The timeline is loaded after WebGL initialization during boot.
 if(typeof syncPlaybackAvailability==='function')syncPlaybackAvailability();
}
function assertRenderingReady(){
 if(hasRenderingFailure())throw Error([...renderingErrors].map(([name,message])=>`${name}: ${message}`).join('\n'));
}
async function waitForGpu(gl,label,aborted=()=>false){
 setViewerLoadingStage(label);
 const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),deadline=performance.now()+30000;
 if(!sync)throw Error('GPU-færdigsignal kunne ikke oprettes: '+label);
 gl.flush();
 try{
  for(;;){
   if(aborted()||gl.isContextLost())throw Error('WebGL-konteksten blev mistet: '+label);
   if(performance.now()>deadline)throw Error('GPU-operationen svarede ikke inden for 30 sekunder: '+label);
   const status=gl.clientWaitSync(sync,0,0);
   if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return;
   if(status===gl.WAIT_FAILED)throw Error('GPU-færdigsignal fejlede: '+label);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }finally{if(!aborted()&&!gl.isContextLost())gl.deleteSync(sync);}
}
async function waitForMapReady(){
 await webglTracks.prepareComparison();
 assertRenderingReady();
 await document.fonts.ready;
 let radarPending,windPending;
 do{
  flushRender();
  radarPending=radarReady;windPending=windReady;await Promise.all([radarPending,windPending]);
  await Promise.all([radarImageBuffer.paintReady,windImageBuffer.paintReady]);
 }while(renderRequestKind!==null||radarPending!==radarReady||windPending!==windReady);
 assertRenderingReady();
 if($('wind').checked&&windFieldError)throw Error('Vindkortet kunne ikke indlæses. Prøv igen.');
 if($('rain').checked&&radarStatus==='kunne ikke indlæses')throw Error('Radaren kunne ikke indlæses. Prøv igen, eller slå radarlaget fra.');
}
$('reloadRendering').onclick=()=>location.reload();
