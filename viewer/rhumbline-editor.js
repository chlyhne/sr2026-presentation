// Local, one-time setup. It reuses the presentation's nominal WebGL map.
document.body.classList.add('rhumbline-setup');document.title='Tegn permanent rhumbline';
$('wind').checked=$('rain').checked=$('traffic').checked=$('military').checked=false;
chosen.clear();setMeasurementExpanded(true);
const setupTitle=document.createElement('h1');setupTitle.textContent='Tegn rhumbline';
$('mapMeasurePanel').prepend(setupTitle);
const setupStatus=document.createElement('p');setupStatus.id='rhumblineSaveStatus';setupStatus.setAttribute('role','status');
$('mapMeasurePanel').append(setupStatus);
const setupActions=document.createElement('div');setupActions.className='map-tool-actions';
const reverseRoute=document.createElement('button');reverseRoute.textContent='Vend retning';reverseRoute.type='button';
const restartRoute=document.createElement('button');restartRoute.textContent='Start forfra';restartRoute.type='button';
setupActions.append(reverseRoute,restartRoute);$('mapMeasurePanel').append(setupActions);
reverseRoute.onclick=()=>{navigationDraft.reverse();renderNavigation();};
restartRoute.onclick=()=>{startMapLine('route');updateSetupHelp();};
$('finishMapLine').textContent='Gem permanent rhumbline';
$('cancelMapLine').hidden=true;
function updateSetupHelp(){
 $('measurementHelp').textContent='Klik punkterne på kortet i sejlretningen. Punkterne forbindes med lige streger. Zoom med musehjulet, og træk for at flytte kortet. Gem, når hele ruten er tegnet.';
 $('cancelMapLine').hidden=true;
}
function lockRhumblineEditor(points){
 navigationMode=null;navigationDraft=[];measurement=points.map(p=>[...p]);syncNavigationControls();renderNavigation();
 $('finishMapLine').disabled=$('undoMapPoint').disabled=reverseRoute.disabled=restartRoute.disabled=true;
 $('measurementHelp').textContent='Rhumbline er gemt permanent. Præsentationen bruger nu disse punkter ved sammenligning med referencebåden.';
 setupStatus.textContent=`${points.length} punkter gemt · ${buildRhumbRoute(points).total.toLocaleString('da-DK',{maximumFractionDigits:2})} sømil`;
 $('cancelMapLine').hidden=true;
}
let savingRhumbline=false;
async function savePermanentRhumbline(){
 if(savingRhumbline||navigationDraft.length<2)return;
 const definition={version:1,points:navigationDraft.map(p=>[...p])};
 if(!validRhumbline(definition)){setupStatus.textContent='Ruten indeholder ugyldige punkter. Ret ruten, før du gemmer.';return;}
 savingRhumbline=true;window.SR_RHUMBLINE_SAVING=true;syncNavigationControls();
 $('finishMapLine').disabled=$('undoMapPoint').disabled=reverseRoute.disabled=restartRoute.disabled=true;
 setupStatus.textContent='Gemmer rhumbline …';
 try{
  const response=await fetch('/api/rhumbline',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(definition)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Rhumbline kunne ikke gemmes.');
  lockRhumblineEditor(result.points);
 }catch(error){setupStatus.textContent=error.message;syncNavigationControls();reverseRoute.disabled=restartRoute.disabled=false;}
 finally{savingRhumbline=false;window.SR_RHUMBLINE_SAVING=false;}
}
// Map clicks cannot change the submitted draft while its permanent save runs.
const addSetupPoint=addNavigationPoint;
addNavigationPoint=event=>{if(!savingRhumbline)addSetupPoint(event);};
if(window.SR_RHUMBLINE.points.length)lockRhumblineEditor(window.SR_RHUMBLINE.points);
else{startMapLine('route');updateSetupHelp();}
render();
