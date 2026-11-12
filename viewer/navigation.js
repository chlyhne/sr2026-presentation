// The route comes only from the permanent project asset loaded by boot.js.
const TRACK_GAIN_LIMIT=2,TRACK_GAIN_MISSING=-1e20,TRACK_COMPARISON_KEY='sr2026-track-comparison';
const TRACK_TIME_GAIN_LIMIT=120;
const TRACK_GAIN_UNDERFLOW_COLOUR='rgb(255,196,61)',TRACK_GAIN_OVERFLOW_COLOUR='rgb(255,0,255)';
const TRACK_LENGTH_KEY='sr2026-track-length',TRACK_LENGTHS=new Set([0,900,1800,3600,7200,14400,28800]);
const TRACK_FULL_WINDOW=boats.reduce((span,boat)=>boat.points.length?Math.max(span,D.end-boat.points[0][2]+1):span,D.end-D.start+1);
let trackLengthSeconds=7200;
function trackWindowSeconds(){return trackLengthSeconds===0?TRACK_FULL_WINDOW:trackLengthSeconds;}
function validComparison(value){
 return value&&typeof value.enabled==='boolean'&&['absolute','handicap','time'].includes(value.basis)
  &&(value.boatColour===undefined||typeof value.boatColour==='boolean')&&!(value.enabled&&value.boatColour)
  &&Object.keys(value).every(key=>['enabled','basis','boatColour'].includes(key));
}
let comparison={enabled:false,basis:'absolute'},comparisonRevision=0;
let navigationMode=null,navigationDraft=[],measurement=[],measurementOverride=null,gateMeasurement=[],gateOverride=null,gateDraft=[],navigationGesture=null,lastNavigationKey=null;
function eventToolPoints(note,field,count){
 const points=note[field]===undefined?[]:note[field];
 if(!Array.isArray(points)||![0,count].includes(points.length)||!points.every(point=>Array.isArray(point)&&point.length===2
  &&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<85))throw Error('Eventets '+field+' skal indeholde '+count+' gyldige geografiske punkter.');
 return points;
}
function eventMeasurement(note){return eventToolPoints(note,'measurement',2);}
function currentMeasurement(){
 if(window.SR_RHUMBLINE_SETUP)return measurement;
 const target=currentMapEvent();
 if(measurementOverride&&measurementOverride.target!==target)measurementOverride=null;
 if(measurementOverride)return measurementOverride.points;
 return target?eventMeasurement(target===editingNote?eventDraft:target):measurement;
}
function setMeasurement(points){
 const next=eventMeasurement({measurement:points}).map(point=>[...point]),target=currentMapEvent(),editable=editableSettingsEvent();
 if(editable){
  if(!stageEventChanges(editable,{measurement:next}))return false;
  measurement=[];measurementOverride=null;
 }else if(target){
  // Presentation changes are temporary and never alter the saved event.
  measurementOverride={target,points:next};
 }else{measurement=next;measurementOverride=null;}
 return true;
}
function currentGateMeasurement(){
 if(window.SR_RHUMBLINE_SETUP)return [];
 const target=currentMapEvent();
 if(gateOverride&&gateOverride.target!==target)gateOverride=null;
 if(gateOverride)return gateOverride.points;
 return target?eventGates(target===editingNote?eventDraft:target):gateMeasurement;
}
function setGateMeasurement(points){
 const next=eventGates({gates:points}).map(point=>[...point]);prepareGateTiming(next);
 const target=currentMapEvent(),editable=editableSettingsEvent();
 if(editable){if(!stageEventChanges(editable,{gates:next}))return false;gateMeasurement=[];gateOverride=null;}
 else if(target)gateOverride={target,points:next};
 else{gateMeasurement=next;gateOverride=null;}
 requestRender();return true;
}
function cancelNavigationGesture(){
 const gesture=navigationGesture;navigationGesture=null;
 if(gesture&&$('map').hasPointerCapture(gesture.pointerId))$('map').releasePointerCapture(gesture.pointerId);
}
function resetMapMeasurement(){
 cancelNavigationGesture();measurement=[];measurementOverride=null;gateMeasurement=[];gateOverride=null;navigationMode=null;navigationDraft=[];gateDraft=[];
}
function comparisonMessage(message){$('comparisonStatus').textContent=message;$('comparisonStatus').hidden=!message;}
try{
 const stored=localStorage.getItem(TRACK_COMPARISON_KEY);
 if(stored){const value=JSON.parse(stored);if(!validComparison(value))throw Error('Ugyldigt sammenligningsvalg.');comparison=value;}
}catch(error){comparisonMessage('Sammenligning kunne ikke indlæses: '+error.message);}
try{
 const stored=localStorage.getItem(TRACK_LENGTH_KEY);
 if(stored!==null){const value=JSON.parse(stored);if(!TRACK_LENGTHS.has(value))throw Error('Ugyldig sporlængde.');trackLengthSeconds=value;}
}catch(error){comparisonMessage('Sporlængde kunne ikke indlæses: '+error.message);}
const rhumbRoute=buildRhumbRoute(window.SR_RHUMBLINE.points);
if(comparison.enabled&&!rhumbRoute.legs.length){comparison.enabled=false;comparisonMessage('Den permanente rhumbline er endnu ikke defineret.');}
function referenceAtProgress(progress,stations=trackProfileCache.get(referenceBoat()?.points)?.stations){
 if(!stations)throw Error('Referencebådens sporprofil er ikke forberedt.');
 return packedReferenceAtProgress(progress,stations);
}
function referenceTimeAtProgress(progress){
 const boat=referenceBoat(),profile=trackProfileCache.get(boat.points);
 if(!profile)throw Error('Referencebådens sporprofil er ikke forberedt.');
 const {samples}=profile;
 for(let index=0;index<boat.points.length-1;index++){
  const offset=index*3,start=samples[offset+1],end=samples[offset+4];
  const from=boat.points[index][2],to=boat.points[index+1][2];
  if(samples[offset+2]<-1e19||samples[offset+5]<-1e19||to<=from||to-from>TRACK_MAX_GAP||end<=start||progress<start||progress>end)continue;
  return from+(to-from)*(progress-start)/(end-start);
 }
 return null;
}
function correctedProjectedSpeed(speed,handicap,referenceHandicap){
 if(!Number.isFinite(handicap)||handicap<=0||!Number.isFinite(referenceHandicap)||referenceHandicap<=0)return null;
 const factor=1+(referenceHandicap-handicap)*speed/3600;
 return factor>0?speed/factor:null;
}
function trackGainLimit(){return comparison.basis==='time'?TRACK_TIME_GAIN_LIMIT:TRACK_GAIN_LIMIT;}
function trackComparisonSample(boat,time){
 const ownProfile=trackProfileCache.get(boat.points),referenceProfile=trackProfileCache.get(referenceBoat()?.points);
 if(!ownProfile||!referenceProfile)throw Error('Sporenes sammenligningsprofiler er ikke forberedt.');
 const sample=projectedTrackSample(boat,time),reference=sample?referenceAtProgress(sample.progress):null;
 const timeGain=preparedTimeGain(boat,time,ownProfile,referenceProfile);
 if(!reference&&timeGain===null)return null;
 const vmg=sample?quantizeProjectedSpeed(sample.vmg):null;
 const corrected=vmg===null?null:correctedProjectedSpeed(vmg,boat.handicapSecondsPerNm,referenceBoat()?.handicapSecondsPerNm);
 return {absoluteGain:reference&&vmg!==null?vmg-reference.vmg:null,handicapGain:reference&&corrected!==null?corrected-reference.vmg:null,timeGain,
  vmg,referenceVmg:reference?.vmg??null,referenceTime:sample?referenceTimeAtProgress(sample.progress):null,progress:sample?.progress??null};
}
function trackGainSample(boat,time){
 const sample=trackComparisonSample(boat,time);if(!sample)return null;
 const gain=comparison.basis==='time'?sample.timeGain:comparison.basis==='handicap'?sample.handicapGain:sample.absoluteGain;
 return gain===null?null:{...sample,gain};
}
function saveReferenceBoat(id){
 return changeEventConfiguration(()=>{
  if(!boats.some(boat=>boat.id===id)){comparisonMessage('Ugyldig referencebåd.');return false;}
  if(id===referenceBoatId)return true;
  try{localStorage.setItem(REFERENCE_BOAT_KEY,id);}
  catch{comparisonMessage('Referencebåden kunne ikke gemmes. Ændringen er ikke anvendt.');return false;}
  referenceBoatId=id;comparisonRevision++;
  clearTrackHover();
  try{webglTracks.prepareComparison();}
  catch(error){webglTracks.fail(error);comparisonMessage(error.message);return false;}
  comparisonMessage('');syncNavigationControls();renderTrackSpeedLegend();requestRender();return true;
 });
}
function trackGainColour(value,limit=TRACK_GAIN_LIMIT){
 if(!Number.isFinite(value))return TRACK_SPEED_MISSING;
 if(value < -limit)return TRACK_GAIN_UNDERFLOW_COLOUR;
 if(value > limit)return TRACK_GAIN_OVERFLOW_COLOUR;
 const intensity=Math.min(1,Math.abs(value)/limit),target=value>=0?[0,60,255]:[215,25,28];
 return `rgb(${target.map(channel=>Math.round(245+(channel-245)*intensity)).join(',')})`;
}
const TRACK_GAIN_COLOURS=Array.from({length:TRACK_SPEED_BINS},(_,i)=>trackGainColour(-TRACK_GAIN_LIMIT+2*TRACK_GAIN_LIMIT*i/(TRACK_SPEED_BINS-1)));
function saveComparison(next){
 return changeEventConfiguration(()=>{
  if(handicapTracksEnabled){comparisonMessage('Handicapkompenseret spor bruger bådfarver.');syncNavigationControls();return false;}
  if(!validComparison(next)){comparisonMessage('Ugyldigt sammenligningsvalg.');return false;}
  if(next.enabled&&!rhumbRoute.legs.length){comparisonMessage('Den permanente rhumbline er endnu ikke defineret.');return false;}
  try{localStorage.setItem(TRACK_COMPARISON_KEY,JSON.stringify(next));}
  catch{comparisonMessage('Sammenligningsvalget kunne ikke gemmes. Ændringen er ikke anvendt.');return false;}
  comparison=next;
  comparisonMessage('');syncNavigationControls();renderTrackSpeedLegend();requestRender();return true;
 });
}
function syncNavigationControls(){
 syncReferenceBoatControls();
 $('trackStyle').value=trackUsesBoatColour()?'boat':comparison.enabled?comparison.basis:'speed';
 $('trackStyle').disabled=handicapTracksEnabled;$('trackLength').value=String(trackLengthSeconds);
 $('trackLengthSummary').textContent=trackLengthSeconds?`Spor: seneste ${$('trackLength').selectedOptions[0].textContent}`:'Spor: hele forløbet';
 $('finishMapLine').disabled=!navigationMode||navigationDraft.length<2;
 $('undoMapPoint').disabled=!navigationMode||!navigationDraft.length;
 $('map').classList.toggle('measuring',!!navigationMode);
}
function startMapLine(mode){
 stopPlayback();cancelPlacement();cancelDrawingGesture();setDrawingTool('pan');clearTrackHover();
 cancelNavigationGesture();navigationMode=mode;navigationDraft=[];gateDraft=[];
 setMapLayersExpanded(false);setMapTracksExpanded(false);$('comparisonStatus').hidden=true;
 syncNavigationControls();renderNavigation();
}
function cancelMapLine(){cancelNavigationGesture();navigationMode=null;navigationDraft=[];gateDraft=[];syncNavigationControls();renderNavigation();}
function finishMapLine(){
 if(navigationDraft.length<2)return;
 if(navigationMode==='route'){savePermanentRhumbline();return;}
 if(navigationMode==='measure'&&!setMeasurement(navigationDraft))return;
 cancelMapLine();
}
function addNavigationPoint(event){
 if(navigationMode!=='route')return;
 const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(mapViewport().inverse);
 const geographic=[9.5+point.x*4.5/1000,57-point.y*3/1180];
 if(Math.abs(geographic[0])>180||Math.abs(geographic[1])>=85){comparisonMessage('Punktet ligger uden for kortets måleområde.');return;}
 if(navigationDraft.length&&rhumbLeg(navigationDraft.at(-1),geographic).distance<1e-6)return;
 if(navigationDraft.length>=200){comparisonMessage('En rhumbline kan højst have 200 punkter.');return;}
 navigationDraft.push(geographic);
 syncNavigationControls();renderNavigation();
}
function navigationPoint(event,inverse){
 const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse),geographic=[9.5+point.x*4.5/1000,57-point.y*3/1180];
 return Math.abs(geographic[0])<=180&&Math.abs(geographic[1])<85?geographic:null;
}
function beginNavigationGesture(event){
 if(!['measure','gates'].includes(navigationMode))return false;
 event.preventDefault();
 if(navigationGesture)return true;
 const inverse=mapViewport().inverse,point=navigationPoint(event,inverse);if(!point)return true;
 navigationGesture={pointerId:event.pointerId,x:event.clientX,y:event.clientY,inverse};
 navigationDraft=[point,[...point]];$('map').setPointerCapture(event.pointerId);renderNavigation();return true;
}
function moveNavigationGesture(event){
 if(!navigationGesture)return false;
 if(event.pointerId!==navigationGesture.pointerId)return true;
 event.preventDefault();const point=navigationPoint(event,navigationGesture.inverse);
 if(point){navigationDraft[1]=point;renderNavigation();}return true;
}
function endNavigationGesture(event){
 if(!navigationGesture||event.pointerId!==navigationGesture.pointerId)return false;
 const gesture=navigationGesture;moveNavigationGesture(event);
 const valid=event.type==='pointerup'&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>4&&rhumbLeg(...navigationDraft).distance>=1e-6;
 cancelNavigationGesture();
 if(!valid){navigationDraft=[];renderNavigation();return true;}
 if(navigationMode==='measure')finishMapLine();
 else if(!gateDraft.length){gateDraft=navigationDraft;navigationDraft=[];renderNavigation();}
 else{
  try{if(setGateMeasurement([...gateDraft,...navigationDraft]))cancelMapLine();}
  catch(error){comparisonMessage(error.message);navigationDraft=[];renderNavigation();}
 }
 return true;
}
function renderNavigation(){
 const shownMeasurement=currentMeasurement(),gates=currentGateMeasurement();
 const results=navigationMode==='gates'||!gates.length?[]:gateResultsAtTime(gates,currentTime(),boats.filter(boatIsDisplayed));
 $('mapMeasureToggle').setAttribute('aria-pressed',String(!window.SR_RHUMBLINE_SETUP&&(navigationMode==='measure'||shownMeasurement.length>0)));
 $('mapGatesToggle').setAttribute('aria-pressed',String(navigationMode==='gates'||gates.length>0));
 const key=JSON.stringify([navigationMode,navigationDraft,shownMeasurement,gates,gateDraft,results.map(row=>[row.boat.id,row.passage.end])]);
 if(key===lastNavigationKey)return;lastNavigationKey=key;
 const layer=$('mapNavigation');layer.replaceChildren();
 function draw(points,colour,label,dashed=false){
  if(!points.length)return;
  el('path',{d:path(points),fill:'none',stroke:'#ffffff','stroke-width':5,'vector-effect':'non-scaling-stroke'},layer);
  el('path',{d:path(points),fill:'none',stroke:colour,'stroke-width':2,'stroke-dasharray':dashed?'7 5':'none','vector-effect':'non-scaling-stroke'},layer);
  for(const [i,point] of points.entries()){
   const [x,y]=xy(point),group=screenGroup(x,y,layer);
   el('circle',{r:4,fill:colour,stroke:'#fff','stroke-width':1.5},group);
   el('text',{x:7,y:-7,fill:colour,'font-size':11,'font-weight':700,stroke:'#fff','stroke-width':3,'paint-order':'stroke'},group).textContent=i+1;
   if(i){const leg=rhumbLeg(points[i-1],point);el('title',{},group).textContent=`${leg.distance.toFixed(2)} sømil · ${leg.bearing.toFixed(0)}°`;
    const [a,b]=xy(points[i-1]),mid=screenGroup((x+a)/2,(y+b)/2,layer);
    el('text',{y:-8,'text-anchor':'middle',fill:colour,'font-size':11,'font-weight':650,stroke:'#fff','stroke-width':3,'paint-order':'stroke'},mid).textContent=`${leg.distance.toLocaleString('da-DK',{maximumFractionDigits:2})} sm · ${Math.round(leg.bearing)}°`;
   }
  }
  const [x,y]=xy(points.at(-1)),group=screenGroup(x,y,layer),total=buildRhumbRoute(points).total;
  el('text',{x:8,y:17,fill:colour,'font-size':12,'font-weight':700,stroke:'#fff','stroke-width':3,'paint-order':'stroke'},group).textContent=`${label} · ${total.toLocaleString('da-DK',{maximumFractionDigits:2})} sm`;
 }
 function drawGate(points,number){
  if(points.length!==2)return;
  const colour=number===1?'#087b3d':'#a82a34';
  el('path',{d:path(points),fill:'none',stroke:'#fff','stroke-width':6,'vector-effect':'non-scaling-stroke','data-gate':number},layer);
  el('path',{d:path(points),fill:'none',stroke:colour,'stroke-width':3,'vector-effect':'non-scaling-stroke'},layer);
  for(const point of points){const [x,y]=xy(point);el('circle',{r:4,fill:colour,stroke:'#fff','stroke-width':1.5},screenGroup(x,y,layer));}
  const [a,b]=points.map(xy),label=screenGroup((a[0]+b[0])/2,(a[1]+b[1])/2,layer);
  el('text',{y:-9,'text-anchor':'middle',fill:colour,'font-size':12,'font-weight':700,stroke:'#fff','stroke-width':3,'paint-order':'stroke'},label).textContent='Gate '+number;
 }
 if(window.SR_RHUMBLINE_SETUP&&navigationMode!=='route'&&!shownMeasurement.length)draw(window.SR_RHUMBLINE.points,'#7b3294','Rhumbline',true);
 if(navigationMode!=='measure')draw(shownMeasurement,window.SR_RHUMBLINE_SETUP?'#7b3294':'#173d4c',window.SR_RHUMBLINE_SETUP?'Rhumbline':'Måling',!!window.SR_RHUMBLINE_SETUP);
 if(navigationMode==='gates'){
  drawGate(gateDraft,1);drawGate(navigationDraft,gateDraft.length?2:1);
 }else for(let i=0;i<gates.length;i+=2)drawGate(gates.slice(i,i+2),i/2+1);
 if(results.length)drawGateResults(layer,gates,results);
 if(navigationMode&&navigationMode!=='gates')draw(navigationDraft,navigationMode==='route'?'#7b3294':'#173d4c',navigationMode==='route'?'Rhumbline':'Måling',navigationMode==='route');
 const active=navigationMode?navigationDraft:shownMeasurement;
 $('measurementResult').textContent=active.length?`${buildRhumbRoute(active).total.toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2})} sømil` :'';
 resizeSymbols(layer);
}
function drawGateResults(layer,gates,results){
 const rankWidth=String(results.length).length*7.5+12,nameWidth=Math.max(...results.map(row=>row.boat.name.length))*7.5;
 const timeWidth=Math.max(...results.map(row=>row.duration.length))*7.5+16,width=20+rankWidth+nameWidth+timeWidth,height=36+results.length*18;
 const [firstA,firstB,a,b]=gates.map(xy),x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
 let nx=b[1]-a[1],ny=a[0]-b[0];const length=Math.hypot(nx,ny);nx/=length;ny/=length;
 // Put the whole upright panel beyond gate 2, on the side away from gate 1.
 const direction=nx*(x-(firstA[0]+firstB[0])/2)+ny*(y-(firstA[1]+firstB[1])/2);
 if(direction<0||direction===0&&(nx<0||nx===0&&ny<0)){nx=-nx;ny=-ny;}
 const offset=24+Math.abs(nx)*width/2+Math.abs(ny)*height/2,anchor=screenGroup(x,y,layer);
 anchor.setAttribute('class','gate-results');anchor.setAttribute('role','table');anchor.setAttribute('aria-label','Sejltider fra gate 1 til gate 2, hurtigste først');
 const panel=el('g',{transform:`translate(${nx*offset-width/2} ${ny*offset-height/2})`,'pointer-events':'none',fill:'#173d4c','font-family':'monospace','font-size':12},anchor);
 el('rect',{class:'gate-results-background',width,height,rx:5,fill:'#fffffff0',stroke:'#b8cbd5'},panel);
 el('text',{x:10,y:18,'font-family':'system-ui, sans-serif','font-weight':700,'font-size':11},panel).textContent='Gate 1 → 2 · sejltid';
 el('path',{d:`M0 26H${width}`,stroke:'#b8cbd5'},panel);
 for(const [index,row] of results.entries()){
  const group=el('g',{class:'gate-result',role:'row','data-boat-id':row.boat.id,'data-elapsed-seconds':row.passage.elapsed,transform:`translate(0 ${41+index*18})`,'font-weight':index?400:700},panel);
  el('text',{x:10},group).textContent=index+1;
  el('text',{x:10+rankWidth},group).textContent=row.boat.name;
  el('text',{x:width-10,'text-anchor':'end'},group).textContent=row.duration;
 }
}
$('mapMeasureToggle').onclick=()=>{
 if(navigationMode==='measure'||currentMeasurement().length){if(setMeasurement([]))cancelMapLine();}
 else startMapLine('measure');
};
$('mapGatesToggle').onclick=()=>{
 if(navigationMode==='gates'||currentGateMeasurement().length){if(setGateMeasurement([]))cancelMapLine();}
 else startMapLine('gates');
};
$('finishMapLine').onclick=finishMapLine;
$('undoMapPoint').onclick=()=>{navigationDraft.pop();syncNavigationControls();renderNavigation();};
$('trackStyle').onchange=()=>{
 const style=$('trackStyle').value;
 const plain=style==='speed'||style==='boat';
 if(!saveComparison({enabled:!plain,basis:plain?comparison.basis:style,boatColour:style==='boat'}))syncNavigationControls();
};
$('trackLength').onchange=()=>{
 changeEventConfiguration(()=>{
  const length=+$('trackLength').value;
  try{if(!TRACK_LENGTHS.has(length))throw Error('Ugyldig sporlængde.');localStorage.setItem(TRACK_LENGTH_KEY,JSON.stringify(length));}
  catch{comparisonMessage('Sporlængden kunne ikke gemmes.');syncNavigationControls();return;}
  trackLengthSeconds=length;comparisonMessage('');syncNavigationControls();requestRender();
 });
};
$('mapTracksToggle').addEventListener('click',()=>{if(!$('mapTracksPanel').hidden)setMapLayersExpanded(false);});
document.addEventListener('keydown',event=>{
 if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 if(event.key!=='Escape'&&event.target.closest('button')&&!(navigationMode&&event.key==='Backspace'))return;
 if(navigationMode&&['Escape','Enter','Backspace'].includes(event.key)){
  event.preventDefault();event.stopImmediatePropagation();
  if(window.SR_RHUMBLINE_SAVING)return;
  if(event.key==='Escape')cancelMapLine();
  else if(event.key==='Enter'&&navigationMode==='route')finishMapLine();
  else if(event.key==='Backspace'){
   if(navigationMode==='route')navigationDraft.pop();
   else{cancelNavigationGesture();if(!navigationDraft.length)gateDraft=[];navigationDraft=[];}
   syncNavigationControls();renderNavigation();
  }
 }else if(event.key==='Escape'&&!window.SR_RHUMBLINE_SETUP&&currentGateMeasurement().length){
  event.preventDefault();event.stopImmediatePropagation();if(setGateMeasurement([]))cancelMapLine();$('mapGatesToggle').focus();
 }else if(event.key==='Escape'&&currentMeasurement().length&&!window.SR_RHUMBLINE_SETUP){
  event.preventDefault();event.stopImmediatePropagation();if(setMeasurement([]))cancelMapLine();$('mapMeasureToggle').focus();
 }
},true);
if(referencePreferenceError)comparisonMessage(referencePreferenceError);
