// The route comes only from the permanent project asset loaded by boot.js.
const TRACK_GAIN_LIMIT=2,TRACK_GAIN_MISSING=-1e20,TRACK_COMPARISON_KEY='sr2026-track-comparison';
const TRACK_TIME_GAIN_LIMIT=20,TRACK_SECONDS_PER_100_METERS=3600*100/1852;
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
function timeGainPer100Meters(speed,referenceSpeed){
 if(!Number.isFinite(speed)||!Number.isFinite(referenceSpeed)||speed<=0||referenceSpeed<=0)return null;
 return TRACK_SECONDS_PER_100_METERS*(1/referenceSpeed-1/speed);
}
function trackGainLimit(){return comparison.basis==='time'?TRACK_TIME_GAIN_LIMIT:TRACK_GAIN_LIMIT;}
function trackComparisonSample(boat,time){
 const sample=projectedTrackSample(boat,time);if(!sample)return null;
 const reference=referenceAtProgress(sample.progress);if(!reference)return null;
 const vmg=quantizeProjectedSpeed(sample.vmg);
 const corrected=correctedProjectedSpeed(vmg,boat.handicapSecondsPerNm,referenceBoat()?.handicapSecondsPerNm);
 return {absoluteGain:vmg-reference.vmg,handicapGain:corrected===null?null:corrected-reference.vmg,timeGain:timeGainPer100Meters(vmg,reference.vmg),
  vmg,referenceVmg:reference.vmg,referenceTime:referenceTimeAtProgress(sample.progress),progress:sample.progress};
}
function trackGainSample(boat,time){
 const sample=trackComparisonSample(boat,time);if(!sample)return null;
 const gain=comparison.basis==='time'?sample.timeGain:comparison.basis==='handicap'?sample.handicapGain:sample.absoluteGain;
 return gain===null?null:{...sample,gain};
}
function saveReferenceBoat(id){
 if(!boats.some(boat=>boat.id===id)){comparisonMessage('Ugyldig referencebåd.');return false;}
 if(id===referenceBoatId)return true;
 try{localStorage.setItem(REFERENCE_BOAT_KEY,id);}
 catch{comparisonMessage('Referencebåden kunne ikke gemmes. Ændringen er ikke anvendt.');return false;}
 referenceBoatId=id;comparisonRevision++;
 clearTrackHover();
 try{webglTracks.prepareComparison();}
 catch(error){webglTracks.fail(error);comparisonMessage(error.message);return false;}
 comparisonMessage('');syncNavigationControls();renderTrackSpeedLegend();requestRender();return true;
}
function trackGainColour(value,limit=TRACK_GAIN_LIMIT){
 if(!Number.isFinite(value))return TRACK_SPEED_MISSING;
 const intensity=Math.min(1,Math.abs(value)/limit),target=value>=0?[215,25,28]:[33,102,172];
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
 syncReferenceBoatControls();
 $('trackStyle').value=comparison.enabled?comparison.basis:comparison.boatColour?'boat':'speed';$('trackLength').value=String(trackLengthSeconds);
 $('trackLengthSummary').textContent=trackLengthSeconds?`Spor: seneste ${$('trackLength').selectedOptions[0].textContent}`:'Spor: hele forløbet';
 $('finishMapLine').disabled=!navigationMode||navigationDraft.length<2;
 $('undoMapPoint').disabled=!navigationMode||!navigationDraft.length;
 $('mapMeasureToggle').setAttribute('aria-pressed',String(!window.SR_RHUMBLINE_SETUP&&(navigationMode==='measure'||measurement.length>0)));
 $('map').classList.toggle('measuring',!!navigationMode);
}
function startMapLine(mode){
 stopPlayback();cancelPlacement();cancelDrawingGesture();setDrawingTool('pan');clearTrackHover();
 navigationMode=mode;navigationDraft=[];
 setMapLayersExpanded(false);setMapTracksExpanded(false);$('comparisonStatus').hidden=true;
 syncNavigationControls();renderNavigation();
}
function cancelMapLine(){navigationMode=null;navigationDraft=[];syncNavigationControls();renderNavigation();}
function finishMapLine(){
 if(navigationDraft.length<2)return;
 if(navigationMode==='route'){savePermanentRhumbline();return;}
 if(navigationMode==='measure')measurement=navigationDraft.map(p=>[...p]);
 cancelMapLine();
}
function addNavigationPoint(event){
 const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('map').getScreenCTM().inverse());
 const geographic=[9.5+point.x*4.5/1000,57-point.y*3/1180];
 if(Math.abs(geographic[0])>180||Math.abs(geographic[1])>=85){comparisonMessage('Punktet ligger uden for kortets måleområde.');return;}
 if(navigationDraft.length&&rhumbLeg(navigationDraft.at(-1),geographic).distance<1e-6)return;
 if(navigationDraft.length>=200){comparisonMessage('En rhumbline kan højst have 200 punkter.');return;}
 navigationDraft.push(geographic);
 if(navigationMode==='measure'&&navigationDraft.length===2){finishMapLine();return;}
 syncNavigationControls();renderNavigation();
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
$('mapMeasureToggle').onclick=()=>{
 if(navigationMode==='measure'||measurement.length){measurement=[];cancelMapLine();}
 else startMapLine('measure');
};
$('finishMapLine').onclick=finishMapLine;
$('undoMapPoint').onclick=()=>{navigationDraft.pop();syncNavigationControls();renderNavigation();};
$('trackStyle').onchange=()=>{
 const style=$('trackStyle').value;
 const plain=style==='speed'||style==='boat';
 if(!saveComparison({enabled:!plain,basis:plain?comparison.basis:style,boatColour:style==='boat'}))syncNavigationControls();
};
$('trackLength').onchange=()=>{
 const length=+$('trackLength').value;
 try{if(!TRACK_LENGTHS.has(length))throw Error('Ugyldig sporlængde.');localStorage.setItem(TRACK_LENGTH_KEY,JSON.stringify(length));}
 catch{comparisonMessage('Sporlængden kunne ikke gemmes.');syncNavigationControls();return;}
 trackLengthSeconds=length;comparisonMessage('');syncNavigationControls();requestRender();
};
$('mapTracksToggle').addEventListener('click',()=>{if(!$('mapTracksPanel').hidden)setMapLayersExpanded(false);});
document.addEventListener('keydown',event=>{
 if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 if(event.key!=='Escape'&&event.target.closest('button'))return;
 if(navigationMode&&['Escape','Enter','Backspace'].includes(event.key)){
  event.preventDefault();event.stopImmediatePropagation();
  if(window.SR_RHUMBLINE_SAVING)return;
  if(event.key==='Escape')cancelMapLine();else if(event.key==='Enter'&&navigationMode==='route')finishMapLine();else if(event.key==='Backspace'){navigationDraft.pop();syncNavigationControls();renderNavigation();}
 }else if(event.key==='Escape'&&measurement.length&&!window.SR_RHUMBLINE_SETUP){
  event.preventDefault();event.stopImmediatePropagation();measurement=[];cancelMapLine();$('mapMeasureToggle').focus();
 }
},true);
if(referencePreferenceError)comparisonMessage(referencePreferenceError);
syncNavigationControls();
