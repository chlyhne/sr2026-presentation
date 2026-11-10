// One rendering path. Fail visibly instead of changing the implementation.
const renderingErrors=new Map();
function hasRenderingFailure(){return renderingErrors.size>0;}
function reportRenderingFailure(layer,error){
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
 $('renderingErrorDetails').textContent='';$('play').disabled=$('time').disabled;
}
function assertRenderingReady(){
 if(hasRenderingFailure())throw Error([...renderingErrors].map(([name,message])=>`${name}: ${message}`).join('\n'));
}
async function waitForMapReady(){
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
