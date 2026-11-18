// Distributions are prepared for the whole fleet at startup and on gate edits.
const boatCompareCache=new Map(),BOAT_COMPARE_BINS=1601,BOAT_COMPARE_MAX={speed:20,pace:7200};
function boatCompareDistribution(boat,passages){
 const bins={speed:new Float64Array(BOAT_COMPARE_BINS),pace:new Float64Array(BOAT_COMPARE_BINS)},points=boat.points,speeds=boat.speeds,overflow={speed:0,pace:0};
 const profile=webglTracks.preparation.files.mirror(boat.id,boat.course);
 const allTrack=passages===null;if(allTrack)passages=[{start:D.start,end:D.end}];
 let passage=0;
 for(let i=0;i+1<points.length;i++){
  const start=points[i][2],end=points[i+1][2],dt=end-start,a=speeds[i],b=speeds[i+1];
  if(dt<=0||dt>TRACK_MAX_GAP||!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0)continue;
  while(passage<passages.length&&passages[passage].end<=start)passage++;
  for(let j=passage;j<passages.length&&passages[j].start<end;j++){
   const lo=Math.max(start,passages[j].start),hi=Math.min(end,passages[j].end);
   if(hi<=lo)continue;
   const speed=a+(b-a)*((lo+hi)/2-start)/dt;
   const add=(metric,value)=>{const bin=Math.min(BOAT_COMPARE_BINS-1,Math.round(value/BOAT_COMPARE_MAX[metric]*(BOAT_COMPARE_BINS-1)));bins[metric][bin]+=hi-lo;};
   if(speed>BOAT_COMPARE_MAX.speed)overflow.speed+=hi-lo;
   add('speed',speed);

  }
 }
 const stationCount=profile.timeStations.length,include=new Uint8Array(stationCount);
 if(allTrack)include.fill(1);
 else{
  const position=time=>{
   let low=0,high=points.length;
   while(low<high){const mid=(low+high)>>>1;if(points[mid][2]<=time)low=mid+1;else high=mid;}
   const i=low-1;if(i<0||i+1>=points.length||samplesInvalid(i)||samplesInvalid(i+1))return null;
   const dt=points[i+1][2]-points[i][2];if(dt<=0||dt>TRACK_MAX_GAP)return null;
   const f=(time-points[i][2])/dt;return (profile.samples[i*3+1]*(1-f)+profile.samples[(i+1)*3+1]*f)*185.2;
  };
  const samplesInvalid=i=>profile.samples[i*3]<0;
  for(const part of passages){
   const a=position(part.start),b=position(part.end);if(a===null||b===null)continue;
   const first=Math.max(0,Math.ceil(Math.min(a,b))),last=Math.min(stationCount-1,Math.floor(Math.max(a,b)));
   if(last>=first)include.fill(1,first,last+1);
  }
 }
 for(let i=0;i<stationCount;i++)if(include[i]){
  const seconds=profile.timeStations[i]*1852;
  if(!Number.isFinite(seconds)||seconds<0)continue;
  if(seconds>BOAT_COMPARE_MAX.pace)overflow.pace++;else bins.pace[Math.min(BOAT_COMPARE_BINS-1,Math.round(seconds/BOAT_COMPARE_MAX.pace*(BOAT_COMPARE_BINS-1)))]++;
 }
 const distribution=(bins,metric)=>{const radius=metric==='speed'?24:6,sigma=metric==='speed'?10:2.5,weights=Array.from({length:2*radius+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2));const smooth=Array.from(bins,(_,i)=>{let sum=0;for(let j=-radius;j<=radius;j++)if(i+j>=0&&i+j<bins.length)sum+=bins[i+j]*weights[j+radius];return sum;});
 const peak=Math.max(...smooth);if(!peak)return null;
 const tail=new Float64Array(BOAT_COMPARE_BINS+1);tail[BOAT_COMPARE_BINS]=metric==='pace'?overflow.pace:0;
 for(let i=BOAT_COMPARE_BINS-1;i>=0;i--)tail[i]=tail[i+1]+bins[i];
 return {shape:smooth.map(value=>value/peak),tail};};
 return {speed:distribution(bins.speed,'speed'),pace:distribution(bins.pace,'pace')};
}
function prepareBoatCompareGates(key,timing){
 const distributions=new Map();
 for(const boat of boats)distributions.set(boat.id,boatCompareDistribution(boat,timing.get(boat.id).passages));
 boatCompareCache.set(key,distributions);
}
if(!SIMPLE_IPHONE_TRACKS){
 const all=new Map();for(const boat of boats)all.set(boat.id,boatCompareDistribution(boat,null));boatCompareCache.set('',all);
 const select=$('boatCompareReference');
 select.onchange=()=>{boatCompareRenderKey='';renderBoatCompare();};
 $('boatCompareMetric').onchange=()=>{boatCompareZoom=null;boatCompareRenderKey='';renderBoatCompare();};
 $('boatCompareResetZoom').onclick=()=>{boatCompareZoom=null;boatCompareRenderKey='';renderBoatCompare();};
 $('boatCompareToggle').onclick=()=>{
  if(!$('boatComparePanel').hidden){closeBoatCompare();return;}
  if(!document.body.classList.contains('event-panel-collapsed'))setEventPanelExpanded(false);
  document.body.classList.add('boat-compare-open');$('boatComparePanel').hidden=false;$('boatCompareToggle').setAttribute('aria-expanded','true');
  invalidateMapLayout();requestRender();
 };
}
let boatCompareRenderKey='',boatCompareReferenceKey='',boatCompareZoom=null;
function closeBoatCompare(){
 if($('boatComparePanel').hidden)return;
 $('boatComparePanel').hidden=true;document.body.classList.remove('boat-compare-open');$('boatCompareToggle').setAttribute('aria-expanded','false');invalidateMapLayout();requestRender();
}
function syncBoatCompareReference(){
 const select=$('boatCompareReference'),viewport=mapViewport();
 if(!viewport)return;
 const [left,top,width,height]=viewport.viewBox;
 const visible=boats.filter(boat=>{
  const marker=boatMarkerNodes.get(boat.id)?.group;
  if(!marker?.isConnected)return false;
  const x=+marker.dataset.screenX,y=+marker.dataset.screenY;
  return x>=left&&x<=left+width&&y>=top&&y<=top+height;
 });
 const key=JSON.stringify(visible.map(boat=>boat.id));
 if(key===boatCompareReferenceKey)return;
 boatCompareReferenceKey=key;
 const previous=select.value;
 select.replaceChildren(select.options[0],...visible.map(boat=>new Option(boat.name,boat.id)));
 select.value=visible.some(boat=>boat.id===previous)?previous:'';
 select.disabled=!visible.length;
}
function renderBoatCompare(){
 if($('boatComparePanel').hidden)return;
 syncBoatCompareReference();
 const gates=currentGateMeasurement(),key=gates.length?JSON.stringify(gates):'',data=boatCompareCache.get(key);
 if(!data)throw Error('SOG-fordelingerne for gates er ikke forberedt.');
 const reference=boats.find(boat=>boat.id===$('boatCompareReference').value),selected=boats.filter(boat=>boatIsDisplayed(boat)&&boat.id!==reference?.id);
 const metric=$('boatCompareMetric').value;
 const renderKey=JSON.stringify([key,metric,reference?.id,selected.map(boat=>boat.id)]);if(renderKey===boatCompareRenderKey)return;boatCompareRenderKey=renderKey;
 $('boatCompareScope').textContent=(gates.length?'Mellem gates · alle passager':'Hele sporet')+(metric==='speed'?' · SOG i knob':' · tempo i sekunder pr. sømil')+(metric==='speed'?' · tidsvægtet':' · pr. rhumbline-station')+(reference?' · reference nederst':'')+(metric==='speed'?' · 20+ samlet ved højre kant':' · tempo over 7200 vises ikke');
 $('boatCompareResetZoom').hidden=!boatCompareZoom;
 const host=$('boatComparePlots');host.replaceChildren();
 if(!selected.length){host.textContent=reference?'Ingen andre både vises med de valgte filtre.':'Ingen både vises med de valgte filtre.';return;}
 const ns='http://www.w3.org/2000/svg';
 const visible=[...selected,...(reference?[reference]:[])].map(boat=>data.get(boat.id)[metric]).filter(Boolean);
 let first=BOAT_COMPARE_BINS-1,last=0;
 for(const distribution of visible)for(let i=0;i<BOAT_COMPARE_BINS;i++)if(distribution.shape[i]>0){first=Math.min(first,i);last=Math.max(last,i);}
 if(!visible.length){first=0;last=BOAT_COMPARE_BINS-1;}
 const max=BOAT_COMPARE_MAX[metric],step=metric==='speed'?1:180;
 const autoMin=Math.max(0,Math.floor(first*max/(BOAT_COMPARE_BINS-1)/step)*step),autoMax=Math.min(max,Math.max(autoMin+step,Math.ceil(last*max/(BOAT_COMPARE_BINS-1)/step)*step));
 const [minValue,maxValue]=boatCompareZoom||[autoMin,autoMax];
 const valueAt=fraction=>minValue+fraction*(maxValue-minValue);
 const indexAt=fraction=>Math.max(0,Math.min(BOAT_COMPARE_BINS-1,valueAt(fraction)/max*(BOAT_COMPARE_BINS-1)));
 const digits=Math.min(4,Math.max(metric==='speed'?1:0,Math.ceil(-Math.log10((maxValue-minValue)/4))));
 const formatValue=value=>value.toLocaleString('da-DK',{maximumFractionDigits:digits});
 for(const boat of selected){
  const row=document.createElement('div'),title=document.createElement('div');title.textContent=boat.name+(reference&&reference.id!==boat.id?' / '+reference.name:'');row.append(title);
  const split=!!reference&&reference.id!==boat.id;
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 240 68');svg.setAttribute('role','img');svg.setAttribute('aria-label',(metric==='speed'?'Fartfordeling for ':'Tempofordeling for ')+title.textContent);
  const plot=(values,colour,side)=>{
   if(!values)return false;
   const path=document.createElementNS(ns,'path'),coords=[];
   for(let i=0;i<=400;i++){const index=indexAt(i/400),lo=Math.floor(index),part=index-lo,v=values.shape[lo]*(1-part)+(values.shape[Math.min(lo+1,BOAT_COMPARE_BINS-1)]||0)*part;coords.push([10+i*220/400,32-v*24*side]);}
   let d='M 10 32 '+coords.map(([x,y])=>`L ${x} ${y}`).join(' ')+' L 230 32';
   if(!split)d+=' '+coords.slice().reverse().map(([x,y])=>`L ${x} ${64-y}`).join(' ');
   path.setAttribute('d',d+' Z');path.setAttribute('fill',colour);path.setAttribute('fill-opacity','.8');svg.append(path);return true;
  };
  const own=plot(data.get(boat.id)[metric],colours[boat.name],1);
  const ref=reference&&reference.id!==boat.id?plot(data.get(reference.id)[metric],colours[reference.name],-1):false;
  const axis=document.createElementNS(ns,'path');axis.setAttribute('d','M10 32H230');axis.setAttribute('stroke','#edf4f7');axis.setAttribute('stroke-width','.5');svg.append(axis);row.append(svg);
  const labels=document.createElement('div');labels.className='boat-compare-axis';for(let i=0;i<=4;i++){const label=document.createElement('span'),value=valueAt(i/4);label.textContent=formatValue(value)+(i===4?(metric==='speed'?' kn':' s/sømil'):'');labels.append(label);}row.append(labels);
  const ticks=document.createElementNS(ns,'path');let tickPath='';for(let i=0;i<=20;i++){const x=10+i*11;tickPath+=`M${x} 63v${i%5===0?4:2} `;}ticks.setAttribute('d',tickPath);ticks.setAttribute('stroke','#b8cbd5');ticks.setAttribute('stroke-width','.6');svg.append(ticks);
  const selection=document.createElementNS(ns,'rect');selection.setAttribute('y','3');selection.setAttribute('height','58');selection.setAttribute('fill','#fff');selection.setAttribute('fill-opacity','.2');selection.setAttribute('stroke','#fff');selection.setAttribute('stroke-width','.6');selection.setAttribute('visibility','hidden');svg.append(selection);
  let drag=null;
  const pointerX=event=>Math.max(10,Math.min(230,new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse()).x));
  svg.addEventListener('pointerdown',event=>{if(event.button!==0||event.pointerType!=='mouse')return;event.preventDefault();const x=pointerX(event);drag={id:event.pointerId,start:x};svg.setPointerCapture(event.pointerId);selection.setAttribute('x',x);selection.setAttribute('width','0');selection.setAttribute('visibility','visible');});
  svg.addEventListener('pointerup',event=>{if(!drag||drag.id!==event.pointerId)return;const x=pointerX(event),start=drag.start;drag=null;selection.setAttribute('visibility','hidden');if(Math.abs(x-start)<5)return;const toValue=position=>valueAt((position-10)/220);boatCompareZoom=[toValue(Math.min(x,start)),toValue(Math.max(x,start))];boatCompareRenderKey='';renderBoatCompare();});
  svg.addEventListener('pointercancel',()=>{drag=null;selection.setAttribute('visibility','hidden');});
  const marker=document.createElementNS(ns,'line');marker.setAttribute('y1','3');marker.setAttribute('y2','61');marker.setAttribute('stroke','#fff');marker.setAttribute('stroke-width','1');marker.setAttribute('visibility','hidden');svg.append(marker);
  const readout=document.createElement('div');readout.className='boat-compare-readout';readout.hidden=true;row.append(readout);
  svg.addEventListener('pointermove',event=>{
   if(drag&&drag.id===event.pointerId){const x=pointerX(event);selection.setAttribute('x',Math.min(x,drag.start));selection.setAttribute('width',Math.abs(x-drag.start));marker.setAttribute('visibility','hidden');readout.hidden=true;return;}
   const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse()),fraction=Math.max(0,Math.min(1,(point.x-10)/220)),position=indexAt(fraction),index=Math.floor(position),part=position-index;
   marker.setAttribute('x1',10+fraction*220);marker.setAttribute('x2',10+fraction*220);marker.setAttribute('visibility','visible');
   const percent=distribution=>{if(!distribution)return '–';const tail=distribution.tail;const above=(tail[index]*(1-part)+tail[index+1]*part)/tail[0];return ((metric==='pace'?1-above:above)*100).toFixed(1).replace('.',',')+' %';};
   const value=formatValue(valueAt(fraction))+(metric==='speed'?' kn':' s/sømil');
   readout.textContent=value+(metric==='pace'?' · ca. under: ':' · ca. over: ')+boat.name+' '+percent(data.get(boat.id)[metric])+(split?' · '+reference.name+' '+percent(data.get(reference.id)[metric]):'');readout.hidden=false;
  });
  svg.addEventListener('pointerleave',()=>{marker.setAttribute('visibility','hidden');readout.hidden=true;});
  if(!own||(reference&&reference.id!==boat.id&&!ref)){const msg=document.createElement('small');msg.textContent='Ingen gyldig passage eller måledata for '+(!own?boat.name:reference.name)+'.';row.append(msg);}
  host.append(row);
 }
}
