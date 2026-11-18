// The local route editor reuses the presentation's WebGL map.
document.body.classList.add('rhumbline-setup');document.title='Tegn permanent rhumbline';
$('wind').checked=$('rain').checked=$('traffic').checked=$('military').checked=false;
boatCourseFilter=window.SR_SETUP_COURSE;boatClassFilter='';boatFavouritesOnly=false;boatSearchQuery='';
chosen.clear();$('rhumblineTools').hidden=false;
const setupTitle=document.createElement('h1');setupTitle.textContent='Tegn rhumbline · '+BOAT_COURSE_NAMES[window.SR_SETUP_COURSE];
const canReplaceRhumbline=window.SR_EVENT.id==='silverrudder-2025';
$('rhumblineTools').prepend(setupTitle);
const setupStatus=document.createElement('p');setupStatus.id='rhumblineSaveStatus';setupStatus.setAttribute('role','status');
$('rhumblineTools').append(setupStatus);
const setupActions=document.createElement('div');setupActions.className='map-tool-actions';
const reverseRoute=document.createElement('button');reverseRoute.textContent='Vend retning';reverseRoute.type='button';
const restartRoute=document.createElement('button');restartRoute.textContent='Start forfra';restartRoute.type='button';
setupActions.append(reverseRoute,restartRoute);$('rhumblineTools').append(setupActions);
reverseRoute.onclick=()=>{navigationDraft.reverse();renderNavigation();};
restartRoute.onclick=()=>{startMapLine('route');updateSetupHelp();};
function updateSetupHelp(){
 $('measurementHelp').textContent='Klik på kortet for at tilføje punkter i sejlretningen. Træk et punkt for at flytte det. Dobbeltklik på et linjestykke for at indsætte et punkt. Punkter snapper til start/mål, og rutens ender kan snappe sammen.';
}
function lockRhumblineEditor(points){
 navigationMode=null;navigationDraft=[];measurement=points.map(p=>[...p]);syncNavigationControls();renderNavigation();
 $('finishMapLine').disabled=$('undoMapPoint').disabled=reverseRoute.disabled=restartRoute.disabled=true;
 $('measurementHelp').textContent='Rhumbline er gemt permanent. Præsentationen bruger nu disse punkter ved sammenligning med referencebåden.';
 setupStatus.textContent=`${points.length} punkter gemt · ${buildRhumbRoute(points).total.toLocaleString('da-DK',{maximumFractionDigits:2})} sømil`;
}
let savingRhumbline=false;
async function savePermanentRhumbline(){
 if(savingRhumbline||navigationDraft.length<2)return;
 const definition={version:1,points:navigationDraft.map(p=>[...p])};
 if(!validRhumbline(definition)){setupStatus.textContent='Ruten indeholder ugyldige punkter. Ret ruten, før du gemmer.';return;}
 savingRhumbline=true;window.SR_RHUMBLINE_SAVING=true;syncNavigationControls();
 $('finishMapLine').disabled=$('undoMapPoint').disabled=reverseRoute.disabled=restartRoute.disabled=true;
 setupStatus.textContent='Gemmer rhumbline og klargør sporfiler på serveren …';
 try{
  const payload=canReplaceRhumbline?{...definition,previousPoints:window.SR_RHUMBLINE.points}:definition;
  const response=await fetch('/api/rhumbline?event='+encodeURIComponent(window.SR_EVENT.id)+'&course='+window.SR_SETUP_COURSE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Rhumbline kunne ikke gemmes.');
  lockRhumblineEditor(result.points);
  $('measurementHelp').textContent='Rhumbline og sporfiler er gemt. Genindlæs præsentationen for at bruge den nye rute.';
 }catch(error){setupStatus.textContent=error.message;syncNavigationControls();reverseRoute.disabled=restartRoute.disabled=false;}
 finally{savingRhumbline=false;window.SR_RHUMBLINE_SAVING=false;}
}
const routeSnapPixels=12,routePointPixels=8;
const startFinishLines=D.course_lines.features.map(feature=>feature.geometry.coordinates);
let routePointDrag=null;
function routeEditable(){return navigationMode==='route'&&!savingRhumbline;}
function routePointer(event){
 const viewport=mapViewport();
 if(!viewport)return null;
 const point=navigationPoint(event,viewport.inverse);
 return point&&{point,mapPoint:xy(point),scale:viewport.matrix.a};
}
function routePointDistance(pointer,point){
 const [x,y]=xy(point),[px,py]=pointer.mapPoint;
 return Math.hypot(x-px,y-py)*pointer.scale;
}
function routePointAt(pointer){
 let index=-1,distance=routePointPixels;
 for(const [i,point] of navigationDraft.entries()){
  const candidate=routePointDistance(pointer,point);
  if(candidate<=distance){index=i;distance=candidate;}
 }
 return index;
}
function projectRouteSegment(pointer,a,b){
 const [x,y]=xy(a),[endX,endY]=xy(b),[px,py]=pointer.mapPoint;
 const dx=endX-x,dy=endY-y,lengthSquared=dx*dx+dy*dy;
 const fraction=lengthSquared?Math.max(0,Math.min(1,((px-x)*dx+(py-y)*dy)/lengthSquared)):0;
 return {fraction,point:a.map((value,i)=>value+fraction*(b[i]-value)),distance:Math.hypot(px-x-dx*fraction,py-y-dy*fraction)*pointer.scale};
}
function routeSegmentAt(pointer){
 let hit=null;
 for(let index=1;index<navigationDraft.length;index++){
  const segment=projectRouteSegment(pointer,navigationDraft[index-1],navigationDraft[index]);
  if(segment.fraction>0&&segment.fraction<1&&segment.distance<=(hit?.distance??routePointPixels))hit={...segment,index};
 }
 return hit;
}
function snappedRoutePoint(pointer,index){
 const last=navigationDraft.length-1;
 const opposite=index===0&&last>1?navigationDraft[last]:index>=last&&index>1&&last>=1?navigationDraft[0]:null;
 if(opposite&&routePointDistance(pointer,opposite)<=routeSnapPixels)return opposite;
 let point=pointer.point,distance=routeSnapPixels;
 for(const [a,b] of startFinishLines){
  const candidate=projectRouteSegment(pointer,a,b);
  if(candidate.distance<=distance){point=candidate.point;distance=candidate.distance;}
 }
 return point;
}
function updateRoutePoint(index,point,insert){
 const next=[...navigationDraft];
 next.splice(index,insert?0:1,point);
 if(!validRhumbline({version:1,points:next})&&next.length!==1)return;
 navigationDraft=next;syncNavigationControls();renderNavigation();
}
function insertRoutePoint(index,point){
 if(navigationDraft.length>=200){setupStatus.textContent='En rhumbline kan højst have 200 punkter.';return;}
 updateRoutePoint(index,point,true);
}
function addNavigationPoint(event){
 if(!routeEditable())return;
 const pointer=routePointer(event);
 if(!pointer||routePointAt(pointer)>=0||routeSegmentAt(pointer))return;
 const index=navigationDraft.length;
 insertRoutePoint(index,snappedRoutePoint(pointer,index));
}
const routeMap=$('map');
routeMap.addEventListener('dblclick',event=>{
 if(!routeEditable())return;
 const pointer=routePointer(event);
 if(!pointer||routePointAt(pointer)>=0)return;
 const segment=routeSegmentAt(pointer);
 if(segment)insertRoutePoint(segment.index,segment.point);
});
routeMap.addEventListener('pointerdown',event=>{
 if(routePointDrag){event.stopImmediatePropagation();return;}
 if(event.button!==0||!routeEditable())return;
 const pointer=routePointer(event),index=pointer?routePointAt(pointer):-1;
 if(index<0)return;
 event.preventDefault();event.stopImmediatePropagation();
 routePointDrag={id:event.pointerId,index,original:navigationDraft[index],x:event.clientX,y:event.clientY,moved:false};
 routeMap.setPointerCapture(event.pointerId);
 routeMap.classList.add('rhumbline-point-drag');
},true);
function moveRoutePoint(event){
 const gesture=routePointDrag;
 if(!gesture.moved&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<3)return;
 gesture.moved=true;
 const pointer=routePointer(event);
 if(pointer)updateRoutePoint(gesture.index,snappedRoutePoint(pointer,gesture.index),false);
}
routeMap.addEventListener('pointermove',event=>{
 if(routePointDrag?.id===event.pointerId){event.stopImmediatePropagation();moveRoutePoint(event);return;}
 const pointer=routeEditable()?routePointer(event):null;
 routeMap.classList.toggle('rhumbline-point-hover',!!pointer&&routePointAt(pointer)>=0);
},true);
function finishRoutePointDrag(commit){
 const {id,index,original}=routePointDrag;routePointDrag=null;
 if(!commit)updateRoutePoint(index,original,false);
 routeMap.classList.remove('rhumbline-point-drag');
 if(routeMap.hasPointerCapture(id))routeMap.releasePointerCapture(id);
}
for(const type of ['pointerup','pointercancel','lostpointercapture'])routeMap.addEventListener(type,event=>{
 if(routePointDrag?.id!==event.pointerId)return;
 event.stopImmediatePropagation();
 const commit=type==='pointerup';
 if(commit)moveRoutePoint(event);
 finishRoutePointDrag(commit);
},true);
window.addEventListener('keydown',event=>{
 if(!routePointDrag||!['Escape','Enter','Backspace'].includes(event.key))return;
 event.preventDefault();event.stopImmediatePropagation();
 if(event.key==='Escape')finishRoutePointDrag(false);
},true);
if(window.SR_RHUMBLINE.points.length&&!canReplaceRhumbline)lockRhumblineEditor(window.SR_RHUMBLINE.points);
else{
 startMapLine('route');updateSetupHelp();
 if(canReplaceRhumbline&&window.SR_RHUMBLINE.points.length){
  navigationDraft=window.SR_RHUMBLINE.points.map(p=>[...p]);
  syncNavigationControls();
 }
}
render();
