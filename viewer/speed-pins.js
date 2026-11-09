// Pins identify a boat and source time. Values always come from recorded SOG.
let speedPins=[],pickedTrackSpeed=null;
try{
 const saved=JSON.parse(SRStorage.getItem('sr2026-speed-pins')||'[]');
 if(Array.isArray(saved))speedPins=saved.filter(p=>p&&typeof p.id==='string'&&typeof p.boatId==='string'&&Number.isFinite(p.time)&&boats.some(b=>b.id===p.boatId));
}catch{}
function trackSpeedSample(boat,time){
 const points=boat.points,i=timeBoundary(points,time,true)-1;if(i<0)return null;
 const a=points[i],b=points[i+1],s0=boat.speeds?.[i],s1=boat.speeds?.[i+1];
 if(time===a[2])return {boatId:boat.id,time,point:a,speed:speedBin(s0)<0?null:s0};
 if(!b||b[2]<=a[2]||b[2]-a[2]>TRACK_MAX_GAP||time>b[2])return null;
 const speed=speedBin(s0)<0||speedBin(s1)<0?null:s0+(s1-s0)*(time-a[2])/(b[2]-a[2]);
 return {boatId:boat.id,time,point:trackValue(points,i,time).point,speed};
}
function nearestTrackSpeed(clientX,clientY,boatId,topmost=false){
 const matrix=$('map').getScreenCTM();if(!matrix)return null;
 const now=currentTime(),start=now-7200,limit=topmost?8*8:12*12;
 let best=null,bestDistance=limit,bestPainted=false;
 const paintedRadius2=(TRACK_OUTLINE_WIDTH/2+.5)**2;
 function consider(boat,time,d){
  if(d>limit)return;
  const painted=d<=paintedRadius2;
  const wins=topmost
   ?!best||(painted&&!bestPainted)||(painted===bestPainted&&(painted?time>=best.time:d<bestDistance||(d===bestDistance&&time>=best.time)))
   :d<=bestDistance;
  if(wins){bestDistance=d;bestPainted=painted;best={boatId:boat.id,time};}
 }
 function distance(point){
  const [x,y]=xy(point),dx=matrix.a*x+matrix.c*y+matrix.e-clientX,dy=matrix.b*x+matrix.d*y+matrix.f-clientY;
  return dx*dx+dy*dy;
 }
 const order=topmost?[...boats].sort((a,b)=>(a.name==='Mercutio')-(b.name==='Mercutio')):boats;
 for(const boat of order){
  if(!boatIsDisplayed(boat)||(boatId&&boat.id!==boatId))continue;
  const points=boat.points,model=getTrackModel(points);
  for(let i=Math.max(0,timeBoundary(points,start)-1);i<points.length&&points[i][2]<=now;i++){
   const a=points[i],b=points[i+1],gap=b?b[2]-a[2]:0;
   if(!b||gap<=0||gap>TRACK_MAX_GAP){
    if(a[2]<start)continue;
    consider(boat,a[2],distance(a));continue;
   }
   const from=Math.max(start,a[2]),to=Math.min(now,b[2]);if(to<from)continue;
   // PCHIP stays inside the source endpoints' coordinate rectangle.
   const p0=new DOMPoint(...xy(a)).matrixTransform(matrix),p1=new DOMPoint(...xy(b)).matrixTransform(matrix);
   if(clientX<Math.min(p0.x,p1.x)-12||clientX>Math.max(p0.x,p1.x)+12||clientY<Math.min(p0.y,p1.y)-12||clientY>Math.max(p0.y,p1.y)+12)continue;
   const evaluate=time=>distance(trackValue(points,i,time,model).point);
   let nearest=from,minimum=Infinity,sampleIndex=0;
   const steps=12;
   for(let j=0;j<=steps;j++){
    const time=from+(to-from)*j/steps,d=evaluate(time);
    if(d<minimum){minimum=d;nearest=time;sampleIndex=j;}
   }
   // Refine the best bracket on the native cubic, independently of zoom.
   let lo=from+(to-from)*Math.max(0,sampleIndex-1)/steps,hi=from+(to-from)*Math.min(steps,sampleIndex+1)/steps;
   const ratio=(Math.sqrt(5)-1)/2;
   let left=hi-ratio*(hi-lo),right=lo+ratio*(hi-lo),dl=evaluate(left),dr=evaluate(right);
   for(let j=0;j<32;j++){
    if(dl<dr){hi=right;right=left;dr=dl;left=hi-ratio*(hi-lo);dl=evaluate(left);}
    else{lo=left;left=right;dl=dr;right=lo+ratio*(hi-lo);dr=evaluate(right);}
   }
   const refined=(lo+hi)/2,d=evaluate(refined);
   if(d<minimum){minimum=d;nearest=refined;}
   consider(boat,nearest,minimum);
  }
 }
 return best;
}
function matchingSpeedPin(sample){
 return speedPins.find(p=>p.boatId===sample.boatId&&Math.abs(p.time-sample.time)<.05);
}
function chooseTrackSpeed(e,boatId){
 if(document.body.classList.contains('presenting'))return;
 pickedTrackSpeed=nearestTrackSpeed(e.clientX,e.clientY,boatId,!boatId);
 if(pickedTrackSpeed)stopPlayback();
 renderSpeedPins();
}
// Resolve the newest visible passage on demand while paused, for both renderers.
let trackHoverTimer=null,trackHoverTip=null;
function clearTrackHover(){
 if(trackHoverTimer!==null){clearTimeout(trackHoverTimer);trackHoverTimer=null;}
 if(trackHoverTip&&!trackHoverTip.hidden){trackHoverTip.hidden=true;$('map').classList.remove('track-hover');}
}
function updateTrackHover(e){
 if(interval||placingNote||navigationMode||drawingTool!=='pan'||document.body.classList.contains('presenting')||
  e.target.closest('[data-boat-marker],[data-note-index],[data-speed-key]')){clearTrackHover();return;}
 if(trackHoverTimer!==null)clearTimeout(trackHoverTimer);
 const {clientX,clientY}=e;
 trackHoverTimer=setTimeout(()=>{
  trackHoverTimer=null;
  const hit=nearestTrackSpeed(clientX,clientY,undefined,true);
  if(!hit){clearTrackHover();return;}
  const boat=boats.find(b=>b.id===hit.boatId),sample=trackSpeedSample(boat,hit.time);
  if(!sample){clearTrackHover();return;}
  if(!trackHoverTip){trackHoverTip=document.createElement('div');trackHoverTip.id='trackHover';trackHoverTip.setAttribute('role','tooltip');document.body.append(trackHoverTip);}
  const speed=sample.speed===null?'fart mangler':`SOG ${sample.speed.toLocaleString('da-DK',{minimumFractionDigits:1,maximumFractionDigits:1})} knob`;
  let difference='';
  if(comparison.enabled&&boat.name!=='Mercutio'){
   const relative=trackGainSample(boat,hit.time),basis=comparison.basis==='handicap'?'ToD':'absolut';
   difference=relative?` · ${relative.gain>=0?'Henter +':'Taber '}${relative.gain.toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2})} kn (${basis}) · Mercutio samme sted kl. ${fmt(relative.referenceTime)}`:' · Sammenligning mangler ved dette sted';
  }
  trackHoverTip.textContent=`${boat.name} · ${speed}${difference} · TracTrac`;
  trackHoverTip.hidden=false;trackHoverTip.style.left=Math.max(4,Math.min(clientX+12,innerWidth-trackHoverTip.offsetWidth-4))+'px';
  trackHoverTip.style.top=Math.max(4,Math.min(clientY+16,innerHeight-trackHoverTip.offsetHeight-4))+'px';
  $('map').classList.add('track-hover');
 },80);
}
function closeTrackSpeedSelection(){pickedTrackSpeed=null;renderSpeedPins();}
function toggleSpeedPin(){
 if(!pickedTrackSpeed||document.body.classList.contains('presenting'))return;
 const boat=boats.find(b=>b.id===pickedTrackSpeed.boatId),sample=boat&&trackSpeedSample(boat,pickedTrackSpeed.time);
 if(!sample||sample.speed===null)return;
 const existing=matchingSpeedPin(sample);
 const next=existing?speedPins.filter(p=>p!==existing):[...speedPins,{id:crypto.randomUUID(),boatId:sample.boatId,time:sample.time}];
 try{SRStorage.setItem('sr2026-speed-pins',JSON.stringify(next));speedPins=next;$('speedPinStatus').textContent='';}
 catch{$('speedPinStatus').textContent='Fartmærket kunne ikke gemmes i browseren.';}
 renderSpeedPins();
}
function handleSpeedPinClick(action,key){
 if(document.body.classList.contains('presenting'))return;
 if(action){toggleSpeedPin();return;}
 const pin=speedPins.find(p=>p.id===key);
 if(pin)pickedTrackSpeed={boatId:pin.boatId,time:pin.time};
 else if(key==='preview'&&pickedTrackSpeed){pickedTrackSpeed=null;}
 renderSpeedPins();
}
function renderSpeedPins(){
 const layer=$('speedMarkers');layer.replaceChildren();
 const map=$('map'),matrix=map.getScreenCTM();if(!matrix)return;
 const rect=map.getBoundingClientRect(),scale=1/Math.hypot(matrix.a,matrix.b),now=currentTime();
 const presenting=document.body.classList.contains('presenting');
 const entries=speedPins.map(pin=>({...pin,pinned:true}));
 if(!presenting&&pickedTrackSpeed&&!matchingSpeedPin(pickedTrackSpeed))entries.push({...pickedTrackSpeed,id:'preview',pinned:false});
 const mercutioIds=new Set(boats.filter(b=>b.name==='Mercutio').map(b=>b.id));
 entries.sort((a,b)=>mercutioIds.has(a.boatId)-mercutioIds.has(b.boatId));
 for(const entry of entries){
  const boat=boats.find(b=>b.id===entry.boatId);
  if(!boat||!boatIsDisplayed(boat)||entry.time<now-7200||entry.time>now)continue;
  const sample=trackSpeedSample(boat,entry.time);if(!sample)continue;
  const [x,y]=xy(sample.point),screen=new DOMPoint(x,y).matrixTransform(matrix);
  if(screen.x<rect.left||screen.x>rect.right||screen.y<rect.top||screen.y>rect.bottom)continue;
  const colour=colours[boat.name],group=screenGroup(x,y,layer);
  group.dataset.speedKey=entry.id;group.dataset.boatId=boat.id;group.dataset.trackTime=entry.time;
  group.dataset.pinned=String(entry.pinned);group.setAttribute('class','speed-marker');
  group.setAttribute('transform',`translate(${x} ${y}) scale(${scale})`);
  const value=sample.speed===null?'Fart mangler':sample.speed.toLocaleString('da-DK',{minimumFractionDigits:1,maximumFractionDigits:1})+' kn';
  const label=value,accessibleLabel=boat.name+' · '+value;
  el('title',{},group).textContent=`${label} · ${fmt(entry.time)} · SOG fra TracTrac`;
  el('circle',{r:10,fill:'transparent','pointer-events':'all'},group);
  if(entry.pinned)el('circle',{r:7,fill:'none',stroke:colour,'stroke-width':1.5},group);
  el('circle',{r:4,fill:colour,stroke:'#14212a','stroke-width':1.5},group);
  const width=label.length*7.2,left=screen.x+width+12>rect.right?-width-8:8;
  const top=screen.y+45>rect.bottom?-42:screen.y-20<rect.top?20:-12;
  el('text',{class:'track-speed-label',x:left,y:top,fill:colour,'font-size':12,'font-weight':700,
   stroke:'#14212a','stroke-width':3,'paint-order':'stroke'},group).textContent=label;
  if(!presenting){
   group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',accessibleLabel);
   const selected=pickedTrackSpeed&&entry.boatId===pickedTrackSpeed.boatId&&Math.abs(entry.time-pickedTrackSpeed.time)<.05;
   if(selected&&sample.speed!==null){
    const button=el('g',{'data-speed-action':entry.pinned?'unpin':'pin',role:'button',tabindex:0,
     'aria-label':entry.pinned?'Fjern pin for '+accessibleLabel:'Pin '+accessibleLabel},group);
    const buttonWidth=entry.pinned?76:44;
    el('rect',{x:left,y:top+8,width:buttonWidth,height:24,rx:4,fill:'#f4fafb',stroke:'#365766','stroke-width':1},button);
    el('text',{x:left+buttonWidth/2,y:top+24,'text-anchor':'middle',fill:'#14212a','font-size':12,'font-weight':650},button).textContent=entry.pinned?'Fjern pin':'Pin';
   }
  }
 }
}
