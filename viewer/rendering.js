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
$('reloadRendering').onclick=()=>location.reload();
