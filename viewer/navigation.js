// The route comes only from the permanent project asset loaded by boot.js.
const TRACK_GAIN_LIMIT=2,TRACK_GAIN_MISSING=-1e20,TRACK_COMPARISON_KEY='sr2026-track-comparison';
const TRACK_LENGTH_KEY='sr2026-track-length',TRACK_LENGTHS=new Set([0,900,1800,3600,7200,14400,28800]);
const TRACK_FULL_WINDOW=boats.reduce((span,boat)=>boat.points.length?Math.max(span,D.end-boat.points[0][2]+1):span,D.end-D.start+1);
let trackLengthSeconds=7200;
function trackWindowSeconds(){return trackLengthSeconds===0?TRACK_FULL_WINDOW:trackLengthSeconds;}
function validComparison(value){
 return value&&typeof value.enabled==='boolean'&&['absolute','handicap'].includes(value.basis)
  &&Object.keys(value).every(key=>['enabled','basis'].includes(key));
}
let comparison={enabled:false,basis:'absolute'},comparisonRevision=0,referencePassages=null;
let navigationMode=null,navigationDraft=[],measurement=[],lastNavigationKey=null;
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
// A sample uses recorded SOG and the direction of the nominal PCHIP track.
// Tracking holes, missing SOG and an unknown direction remain missing data.
function projectedTrackSample(boat,time){
 const points=boat.points,index=timeBoundary(points,time,true)-1;if(index<0)return null;
 const a=points[index],b=points[index+1],model=getTrackModel(points);
 let point,velocity,speed;
 if(time===a[2]){
  const previous=points[index-1];
  if((!b||b[2]-a[2]>TRACK_MAX_GAP)&&(!previous||a[2]-previous[2]>TRACK_MAX_GAP))return null;
  point=a;velocity=[model.slopes[0][index],model.slopes[1][index]];speed=boat.speeds?.[index];
 }else{
  if(!b||b[2]<=a[2]||b[2]-a[2]>TRACK_MAX_GAP)return null;
  const s0=boat.speeds?.[index],s1=boat.speeds?.[index+1];
  if(!Number.isFinite(s0)||s0<0||!Number.isFinite(s1)||s1<0)return null;
  ({point,velocity}=trackValue(points,index,time,model));speed=s0+(s1-s0)*(time-a[2])/(b[2]-a[2]);
 }
 if(!Number.isFinite(speed)||speed<0)return null;
 const projected=projectOnRhumbRoute(point);if(!projected||projected.outside)return null;
 const east=velocity[0]*Math.cos(point[1]*NAV_RAD),north=velocity[1],length=Math.hypot(east,north);
 if(length<1e-15&&speed>0)return null;
 const course=projected.bearing*NAV_RAD;
 const vmg=length>0?speed*(east*Math.sin(course)+north*Math.cos(course))/length:0;
 return {...projected,vmg,time};
}
function mercutioPassages(){
 const boat=boats.find(b=>b.name==='Mercutio');
 if(referencePassages?.points===boat?.points&&referencePassages.revision===comparisonRevision)return referencePassages;
 const intervals=[];
 if(boat)for(let i=0;i<boat.points.length-1;i++){
  const start=boat.points[i][2],end=boat.points[i+1][2],duration=end-start;
  if(duration<=0||duration>TRACK_MAX_GAP)continue;
  // Subdivide in source time, independently of map zoom. This resolves bends
  // and SOG changes before interpolation at the other boat's along-route place.
  const steps=Math.ceil(duration/5);let a=projectedTrackSample(boat,start);
  for(let j=1;j<=steps;j++){
   const b=projectedTrackSample(boat,start+duration*j/steps);
   if(a&&b&&b.progress>a.progress+1e-9)intervals.push({a,b,low:a.progress,high:b.progress});
   a=b;
  }
 }
 const stations=prepareReferenceStations(intervals);
 referencePassages={points:boat?.points,boat,revision:comparisonRevision,stations};return referencePassages;
}
// Resolve overlapping passages once. Every query then needs only a binary
// search, including routes where the start and finish are close together.
function prepareReferenceStations(intervals){
 const events=[];
 for(const interval of intervals){events.push({at:interval.low,start:interval},{at:interval.high,end:interval});}
 events.sort((a,b)=>a.at-b.at);
 const heap=[],active=new Set(),stations=[];
 function push(interval){
  active.add(interval);heap.push(interval);let i=heap.length-1;
  while(i){const parent=(i-1)>>>1;if(heap[parent].a.time<=interval.a.time)break;heap[i]=heap[parent];i=parent;}
  heap[i]=interval;
 }
 function firstActive(){
  while(heap.length&&!active.has(heap[0])){
   const last=heap.pop();if(!heap.length)break;
   let i=0;
   while(i*2+1<heap.length){
    let child=i*2+1;if(child+1<heap.length&&heap[child+1].a.time<heap[child].a.time)child++;
    if(last.a.time<=heap[child].a.time)break;heap[i]=heap[child];i=child;
   }
   heap[i]=last;
  }
  return heap[0]||null;
 }
 for(let i=0;i<events.length;){
  const at=events[i].at;let end=i;while(end<events.length&&events[end].at===at)end++;
  for(let j=i;j<end;j++)if(events[j].start)push(events[j].start);
  const point=firstActive();
  for(let j=i;j<end;j++)if(events[j].end)active.delete(events[j].end);
  stations.push({at,point,after:firstActive()});i=end;
 }
 return stations;
}
function referenceAtProgress(progress,stations=mercutioPassages().stations){
 let lo=0,hi=stations.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(stations[mid].at<=progress)lo=mid+1;else hi=mid;}
 if(!lo)return null;
 const station=stations[lo-1],first=progress===station.at?station.point:station.after;
 if(!first)return null;
 const fraction=(progress-first.low)/(first.high-first.low);
 return {vmg:first.a.vmg+(first.b.vmg-first.a.vmg)*fraction,time:first.a.time+(first.b.time-first.a.time)*fraction};
}
function correctedProjectedSpeed(speed,handicap,referenceHandicap){
 if(!Number.isFinite(handicap)||handicap<=0||!Number.isFinite(referenceHandicap)||referenceHandicap<=0)return null;
 // ToD corrected passage time per NM: 3600/v + TA_Mercutio - TA_boat.
 // Express its reciprocal as an equivalent speed on Mercutio's handicap.
 const factor=1+(referenceHandicap-handicap)*speed/3600;
 return factor>0?speed/factor:null;
}
function trackComparisonSample(boat,time){
 const sample=projectedTrackSample(boat,time);if(!sample)return null;
 const reference=referenceAtProgress(sample.progress);if(!reference)return null;
 const corrected=correctedProjectedSpeed(sample.vmg,boat.handicapSecondsPerNm,mercutioPassages().boat?.handicapSecondsPerNm);
 return {absoluteGain:sample.vmg-reference.vmg,handicapGain:corrected===null?null:corrected-reference.vmg,
  vmg:sample.vmg,referenceVmg:reference.vmg,referenceTime:reference.time,progress:sample.progress};
}
function trackGainSample(boat,time){
 const sample=trackComparisonSample(boat,time);if(!sample)return null;
 const gain=comparison.basis==='handicap'?sample.handicapGain:sample.absoluteGain;
 return gain===null?null:{...sample,gain};
}
// Both modes share the projection and Mercutio lookup. Keep this CPU data
// independently of the GPU, so context restoration only uploads it again.
const trackComparisonCache=new WeakMap();
function prepareTrackComparison(boat){
 if(trackComparisonCache.has(boat.points))return trackComparisonCache.get(boat.points);
 const values=new Float32Array(boat.points.length*4);
 let a=boat.points.length?trackComparisonSample(boat,boat.points[0][2]):null;
 for(let i=0;i<boat.points.length;i++){
  const b=i+1<boat.points.length?trackComparisonSample(boat,boat.points[i+1][2]):a;
  values.set([a?.absoluteGain??TRACK_GAIN_MISSING,b?.absoluteGain??TRACK_GAIN_MISSING,
   a?.handicapGain??TRACK_GAIN_MISSING,b?.handicapGain??TRACK_GAIN_MISSING],i*4);
  a=b;
 }
 trackComparisonCache.set(boat.points,values);return values;
}
function trackGainColour(value){
 if(!Number.isFinite(value))return TRACK_SPEED_MISSING;
 const intensity=Math.min(1,Math.abs(value)/TRACK_GAIN_LIMIT),target=value>=0?[215,25,28]:[33,102,172];
 return `rgb(${target.map(channel=>Math.round(245+(channel-245)*intensity)).join(',')})`;
}
const TRACK_GAIN_COLOURS=Array.from({length:TRACK_SPEED_BINS},(_,i)=>trackGainColour(-TRACK_GAIN_LIMIT+2*TRACK_GAIN_LIMIT*i/(TRACK_SPEED_BINS-1)));
function saveComparison(next){
 if(!validComparison(next)){comparisonMessage('Ugyldigt sammenligningsvalg.');return false;}
 if(next.enabled&&!rhumbRoute.legs.length){comparisonMessage('Den permanente rhumbline er endnu ikke defineret.');return false;}
 try{localStorage.setItem(TRACK_COMPARISON_KEY,JSON.stringify(next));}
 catch{comparisonMessage('Sammenligningsvalget kunne ikke gemmes. Ændringen er ikke anvendt.');return false;}
 comparison=next;
 comparisonMessage('');syncNavigationControls();renderTrackSpeedLegend();requestRender();return true;
}
function syncNavigationControls(){
 $('trackStyle').value=comparison.enabled?comparison.basis:'speed';$('trackLength').value=String(trackLengthSeconds);
 $('trackLengthSummary').textContent=trackLengthSeconds?`Spor: seneste ${$('trackLength').selectedOptions[0].textContent}`:'Spor: hele forløbet';
 $('clearMeasurement').disabled=!measurement.length||!!navigationMode;
 $('finishMapLine').disabled=!navigationMode||navigationDraft.length<2;
 $('undoMapPoint').disabled=!navigationMode||!navigationDraft.length;$('cancelMapLine').hidden=!navigationMode;
 $('measureDistance').setAttribute('aria-pressed',String(navigationMode==='measure'));
 $('map').classList.toggle('measuring',!!navigationMode);
}
function setMeasurementExpanded(expanded){
 $('mapMeasurePanel').hidden=!expanded;$('mapMeasureToggle').setAttribute('aria-expanded',String(expanded));
 if(expanded){setMapLayersExpanded(false);$('comparisonStatus').hidden=true;}
 if(expanded)setMapTracksExpanded(false);
}
function startMapLine(mode){
 stopPlayback();cancelPlacement();cancelDrawingGesture();setDrawingTool('pan');clearTrackHover();
 navigationMode=mode;navigationDraft=[];setMeasurementExpanded(true);
 $('measurementHelp').textContent='Klik punkterne på kortet i rækkefølge. Træk for at flytte kortet. Afslut med Færdig eller Enter; Escape annullerer.';
 syncNavigationControls();renderNavigation();
}
function cancelMapLine(){navigationMode=null;navigationDraft=[];syncNavigationControls();renderNavigation();}
function finishMapLine(){
 if(navigationDraft.length<2)return;
 if(navigationMode==='route'){savePermanentRhumbline();return;}
 if(navigationMode==='measure')measurement=navigationDraft.map(p=>[...p]);
 cancelMapLine();$('measurementHelp').textContent='Klik Mål afstand for at tegne en ny måling.';
}
function addNavigationPoint(event){
 const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('map').getScreenCTM().inverse());
 const geographic=[9.5+point.x*4.5/1000,57-point.y*3/1180];
 if(Math.abs(geographic[0])>180||Math.abs(geographic[1])>=85){comparisonMessage('Punktet ligger uden for kortets måleområde.');return;}
 if(navigationDraft.length&&rhumbLeg(navigationDraft.at(-1),geographic).distance<1e-6)return;
 if(navigationDraft.length>=200){comparisonMessage('En rhumbline kan højst have 200 punkter.');return;}
 navigationDraft.push(geographic);syncNavigationControls();renderNavigation();
}
function renderNavigation(){
 const key=JSON.stringify([navigationMode,navigationDraft,measurement]);
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
 if(window.SR_RHUMBLINE_SETUP&&navigationMode!=='route'&&!measurement.length)draw(window.SR_RHUMBLINE.points,'#7b3294','Rhumbline',true);
 if(navigationMode!=='measure')draw(measurement,window.SR_RHUMBLINE_SETUP?'#7b3294':'#173d4c',window.SR_RHUMBLINE_SETUP?'Rhumbline':'Måling',!!window.SR_RHUMBLINE_SETUP);
 if(navigationMode)draw(navigationDraft,navigationMode==='route'?'#7b3294':'#173d4c',navigationMode==='route'?'Rhumbline':'Måling',navigationMode==='route');
 const active=navigationMode?navigationDraft:measurement;
 $('measurementResult').textContent=active.length?`${buildRhumbRoute(active).total.toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2})} sømil` :'';
 resizeSymbols();
}
$('mapMeasureToggle').onclick=()=>{setMeasurementExpanded($('mapMeasurePanel').hidden);if(!$('mapMeasurePanel').hidden)syncNavigationControls();};
$('measureDistance').onclick=()=>startMapLine('measure');
$('finishMapLine').onclick=finishMapLine;$('cancelMapLine').onclick=cancelMapLine;
$('undoMapPoint').onclick=()=>{navigationDraft.pop();syncNavigationControls();renderNavigation();};
$('clearMeasurement').onclick=()=>{measurement=[];syncNavigationControls();renderNavigation();};
$('trackStyle').onchange=()=>{
 const style=$('trackStyle').value;
 if(!saveComparison({enabled:style!=='speed',basis:style==='speed'?comparison.basis:style}))syncNavigationControls();
};
$('trackLength').onchange=()=>{
 const length=+$('trackLength').value;
 try{if(!TRACK_LENGTHS.has(length))throw Error('Ugyldig sporlængde.');localStorage.setItem(TRACK_LENGTH_KEY,JSON.stringify(length));}
 catch{comparisonMessage('Sporlængden kunne ikke gemmes.');syncNavigationControls();return;}
 trackLengthSeconds=length;comparisonMessage('');syncNavigationControls();requestRender();
};
$('mapTracksToggle').addEventListener('click',()=>{if(!$('mapTracksPanel').hidden){setMeasurementExpanded(false);setMapLayersExpanded(false);}});
$('mapLayersToggle').addEventListener('click',()=>setMeasurementExpanded(false));
document.addEventListener('pointerdown',event=>{if(!$('mapTools').contains(event.target)&&!navigationMode)setMeasurementExpanded(false);});
document.addEventListener('keydown',event=>{
 if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 if(navigationMode&&['Escape','Enter','Backspace'].includes(event.key)){
  event.preventDefault();event.stopImmediatePropagation();
  if(window.SR_RHUMBLINE_SAVING)return;
  if(event.key==='Escape')cancelMapLine();else if(event.key==='Enter')finishMapLine();else{navigationDraft.pop();syncNavigationControls();renderNavigation();}
 }else if(event.key==='Escape'&&!$('mapMeasurePanel').hidden){
  event.preventDefault();event.stopImmediatePropagation();setMeasurementExpanded(false);$('mapMeasureToggle').focus();
 }
},true);
syncNavigationControls();
