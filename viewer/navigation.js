// Spherical rhumb geometry. Coordinates stay geographic; distances are nautical miles.
const NAV_RADIUS_NM=6371008.8/1852,NAV_RAD=Math.PI/180,TRACK_GAIN_LIMIT=2,TRACK_GAIN_MISSING=-1e20;
const mercatorLatitude=latitude=>Math.asinh(Math.tan(latitude*NAV_RAD));
const inverseMercatorLatitude=y=>Math.atan(Math.sinh(y))/NAV_RAD;
function rhumbLeg(a,b){
 const dx=(b[0]-a[0])*NAV_RAD,dy=mercatorLatitude(b[1])-mercatorLatitude(a[1]);
 const dp=(b[1]-a[1])*NAV_RAD,q=Math.abs(dy)>1e-12?dp/dy:Math.cos(a[1]*NAV_RAD);
 return {distance:NAV_RADIUS_NM*Math.hypot(dp,q*dx),bearing:(Math.atan2(dx,dy)/NAV_RAD+360)%360};
}
function validComparison(value){
 return value&&typeof value.enabled==='boolean'&&['absolute','handicap'].includes(value.basis)
  &&Array.isArray(value.route)&&value.route.length<=200&&(value.route.length===0||value.route.length>=2)
  &&value.route.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<85)
  &&value.route.every((p,i)=>!i||(Math.abs(p[0]-value.route[i-1][0])<180&&rhumbLeg(value.route[i-1],p).distance>1e-6))
  &&(!value.enabled||value.route.length>=2);
}
let comparison={route:[],enabled:false,basis:'absolute'},comparisonRevision=0,referencePassages=null;
let navigationMode=null,navigationDraft=[],measurement=[],lastNavigationKey=null;
function comparisonMessage(message){$('comparisonStatus').textContent=message;$('comparisonStatus').hidden=!message;}
try{
 const stored=SRStorage.getItem('sr2026-comparison');
 if(stored){const value=JSON.parse(stored);if(!validComparison(value))throw Error('Ugyldig rhumbline eller sammenligning.');comparison=value;}
}catch(error){comparisonMessage('Rhumbline kunne ikke indlæses: '+error.message);}
let rhumbRoute=buildRhumbRoute(comparison.route);
function buildRhumbRoute(points){
 let total=0;
 const legs=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],x=a[0]*NAV_RAD,y=mercatorLatitude(a[1]);
  const dx=(b[0]-a[0])*NAV_RAD,dy=mercatorLatitude(b[1])-y,length2=dx*dx+dy*dy;
  const {distance,bearing}=rhumbLeg(a,b);
  legs.push({a,b,x,y,dx,dy,length2,distance,bearing,start:total,index:i-1});total+=distance;
 }
 return {legs,total};
}
function projectOnRhumbRoute(point,route=rhumbRoute){
 const x=point[0]*NAV_RAD,y=mercatorLatitude(point[1]);
 let best=null;
 for(const leg of route.legs){
  const raw=((x-leg.x)*leg.dx+(y-leg.y)*leg.dy)/leg.length2;
  const u=Math.max(0,Math.min(1,raw)),px=leg.x+u*leg.dx,py=leg.y+u*leg.dy;
  // Compare actual local distances rather than screen distances or Mercator scale.
  const distance=Math.hypot(x-px,y-py)*Math.cos(point[1]*NAV_RAD);
  if(best&&distance>=best.distance)continue;
  const foot=[px/NAV_RAD,inverseMercatorLatitude(py)];
  best={distance,progress:leg.start+rhumbLeg(leg.a,foot).distance,leg:leg.index,bearing:leg.bearing,
   outside:(leg.index===0&&raw< -1e-10)||(leg.index===route.legs.length-1&&raw>1+1e-10)};
 }
 return best;
}
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
 intervals.sort((a,b)=>a.low-b.low||a.a.time-b.a.time);
 let maximum=-Infinity;
 const maxHigh=intervals.map(interval=>maximum=Math.max(maximum,interval.high));
 referencePassages={points:boat?.points,boat,revision:comparisonRevision,intervals,maxHigh};return referencePassages;
}
function referenceAtProgress(progress){
 const {intervals,maxHigh}=mercutioPassages();
 let lo=0,hi=intervals.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(intervals[mid].low<=progress)lo=mid+1;else hi=mid;}
 let first=null;
 for(let i=lo-1;i>=0&&maxHigh[i]>=progress;i--){
  const candidate=intervals[i];if(candidate.high<progress)continue;
  if(!first||candidate.a.time<first.a.time)first=candidate;
 }
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
function trackGainSample(boat,time){
 const sample=projectedTrackSample(boat,time);if(!sample)return null;
 const reference=referenceAtProgress(sample.progress);if(!reference)return null;
 let speed=sample.vmg;
 if(comparison.basis==='handicap')speed=correctedProjectedSpeed(speed,boat.handicapSecondsPerNm,mercutioPassages().boat?.handicapSecondsPerNm);
 if(speed===null)return null;
 return {gain:speed-reference.vmg,vmg:sample.vmg,referenceVmg:reference.vmg,referenceTime:reference.time,progress:sample.progress};
}
function trackGainColour(value){
 if(!Number.isFinite(value))return TRACK_SPEED_MISSING;
 const intensity=Math.min(1,Math.abs(value)/TRACK_GAIN_LIMIT),target=value>=0?[215,25,28]:[33,102,172];
 return `rgb(${target.map(channel=>Math.round(245+(channel-245)*intensity)).join(',')})`;
}
const TRACK_GAIN_COLOURS=Array.from({length:TRACK_SPEED_BINS},(_,i)=>trackGainColour(-TRACK_GAIN_LIMIT+2*TRACK_GAIN_LIMIT*i/(TRACK_SPEED_BINS-1)));
function saveComparison(next){
 if(!validComparison(next)){comparisonMessage('Ugyldig rhumbline. Brug mindst to forskellige punkter i sejlretningen.');return false;}
 try{if(!window.SR_READONLY)SRStorage.setItem('sr2026-comparison',JSON.stringify(next));}
 catch{comparisonMessage('Rhumbline og sammenligning kunne ikke gemmes. Ændringen er ikke anvendt.');return false;}
 const routeChanged=JSON.stringify(next.route)!==JSON.stringify(comparison.route);
 comparison=next;
 if(routeChanged){comparisonRevision++;referencePassages=null;rhumbRoute=buildRhumbRoute(next.route);}
 comparisonMessage('');syncNavigationControls();renderNavigation();renderTrackSpeedLegend();requestRender();return true;
}
function syncNavigationControls(){
 $('trackComparisonToggle').setAttribute('aria-pressed',String(comparison.enabled));$('comparisonBasis').value=comparison.basis;
 $('clearRhumbline').disabled=$('reverseRhumbline').disabled=comparison.route.length<2||!!navigationMode;
 $('clearMeasurement').disabled=!measurement.length||!!navigationMode;
 $('finishMapLine').disabled=!navigationMode||navigationDraft.length<2;
 $('undoMapPoint').disabled=!navigationMode||!navigationDraft.length;$('cancelMapLine').hidden=!navigationMode;
 $('measureDistance').setAttribute('aria-pressed',String(navigationMode==='measure'));
 $('drawRhumbline').setAttribute('aria-pressed',String(navigationMode==='route'));
 $('rhumblineSummary').textContent=comparison.route.length?`Rhumbline: ${comparison.route.length} punkter · ${rhumbRoute.total.toLocaleString('da-DK',{maximumFractionDigits:2})} sømil. Fælles for hele præsentationen.`:'Ingen rhumbline tegnet endnu.';
 $('map').classList.toggle('measuring',!!navigationMode);
}
function setMeasurementExpanded(expanded){
 $('mapMeasurePanel').hidden=!expanded;$('mapMeasureToggle').setAttribute('aria-expanded',String(expanded));
 if(expanded){setMapLayersExpanded(false);$('comparisonStatus').hidden=true;}
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
 if(navigationMode==='route'&&!saveComparison({...comparison,route:navigationDraft.map(p=>[...p])}))return;
 if(navigationMode==='measure')measurement=navigationDraft.map(p=>[...p]);
 cancelMapLine();$('measurementHelp').textContent='Klik Mål afstand eller Tegn rhumbline for at tegne en ny linje.';
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
 const key=JSON.stringify([comparison.route,navigationMode,navigationDraft,measurement]);
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
 if(navigationMode!=='route')draw(comparison.route,'#7b3294','Rhumbline',true);
 if(navigationMode!=='measure')draw(measurement,'#173d4c','Måling');
 if(navigationMode)draw(navigationDraft,navigationMode==='route'?'#7b3294':'#173d4c',navigationMode==='route'?'Rhumbline':'Måling',navigationMode==='route');
 const active=navigationMode?navigationDraft:measurement;
 $('measurementResult').textContent=active.length?`${buildRhumbRoute(active).total.toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2})} sømil` :'';
 resizeSymbols();
}
$('mapMeasureToggle').onclick=()=>{setMeasurementExpanded($('mapMeasurePanel').hidden);if(!$('mapMeasurePanel').hidden)syncNavigationControls();};
$('measureDistance').onclick=()=>startMapLine('measure');$('drawRhumbline').onclick=()=>startMapLine('route');
$('finishMapLine').onclick=finishMapLine;$('cancelMapLine').onclick=cancelMapLine;
$('undoMapPoint').onclick=()=>{navigationDraft.pop();syncNavigationControls();renderNavigation();};
$('clearMeasurement').onclick=()=>{measurement=[];syncNavigationControls();renderNavigation();};
$('clearRhumbline').onclick=()=>{if(saveComparison({...comparison,route:[],enabled:false}))comparisonMessage('Rhumbline ryddet. Sammenligning er slået fra.');};
$('reverseRhumbline').onclick=()=>saveComparison({...comparison,route:[...comparison.route].reverse()});
$('trackComparisonToggle').onclick=()=>{
 if(!comparison.enabled&&comparison.route.length<2){comparisonMessage('Tegn først en rhumbline: Mål → Tegn rhumbline.');return;}
 saveComparison({...comparison,enabled:!comparison.enabled});
};
$('comparisonBasis').onchange=()=>{if(!saveComparison({...comparison,basis:$('comparisonBasis').value}))syncNavigationControls();};
$('mapLayersToggle').addEventListener('click',()=>setMeasurementExpanded(false));
document.addEventListener('pointerdown',event=>{if(!$('mapTools').contains(event.target)&&!navigationMode)setMeasurementExpanded(false);});
document.addEventListener('keydown',event=>{
 if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 if(navigationMode&&['Escape','Enter','Backspace'].includes(event.key)){
  event.preventDefault();event.stopImmediatePropagation();
  if(event.key==='Escape')cancelMapLine();else if(event.key==='Enter')finishMapLine();else{navigationDraft.pop();syncNavigationControls();renderNavigation();}
 }else if(event.key==='Escape'&&!$('mapMeasurePanel').hidden){
  event.preventDefault();event.stopImmediatePropagation();setMeasurementExpanded(false);$('mapMeasureToggle').focus();
 }
},true);
syncNavigationControls();
