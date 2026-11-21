// Two decoded radar image slots for WebGL; retain front until back is ready.
class WeatherImageBuffer {
 constructor(id){
  this.id=id;this.frontNode=document.getElementById(id);this.backNode=this.frontNode.cloneNode(false);
  this.backNode.id=id+'Back';this.frontNode.after(this.backNode);
  this.front=null;this.back=null;this.paintReady=Promise.resolve();this.hide();
 }
 hide(){
  const changed=[this.frontNode,this.backNode].some(node=>node.getAttribute('visibility')!=='hidden');
  for(const node of [this.frontNode,this.backNode])node.setAttribute('visibility','hidden');
  if(changed)window.SRBackground?.invalidate();
 }
 prepare(key,createHref,retry=false){
  if(this.front?.key===key)return this.front;
  if(this.back?.key===key&&(!retry||!this.back.error))return this.back;
  this.back?.cancel?.();
  const entry={key,ready:false,error:null};this.back=entry;
  const node=this.backNode,reusableAfter=this.paintReady;
  entry.promise=(async()=>{
   try{
    // The retired front must survive its handoff before this slot is reused.
    await reusableAfter;
    if(this.back!==entry)return entry;
    node.onload=node.onerror=null;node.setAttribute('visibility','hidden');
    // Let the current frame finish before decoding the future radar frame.
    await new Promise(resolve=>setTimeout(resolve,0));
    if(this.back!==entry)return entry;
    const href=createHref(),image=new Image();entry.image=image;image.src=href;
    await image.decode();
    if(this.back!==entry)return entry;
    if(node.getAttribute('href')===href)node.removeAttribute('href');
    await new Promise((resolve,reject)=>{
     entry.cancel=()=>{node.onload=node.onerror=null;resolve();};
     node.onload=()=>{node.onload=node.onerror=null;resolve();};
     node.onerror=()=>{node.onload=node.onerror=null;reject(new Error(srText('Vejrbilledet kunne ikke indlæses.')));};
     node.setAttribute('href',href);
    });
    entry.cancel=null;
    if(this.back===entry){window.SRBackground?.prepareWeather(this,entry);entry.ready=true;node.dataset.weatherKey=key;}
   }catch(error){entry.error=error;}
   return entry;
  })();
  return entry;
 }
 display(key){
  if(this.front?.key===key&&this.front.ready){
   const changed=this.frontNode.getAttribute('visibility')!=='visible';this.frontNode.setAttribute('visibility','visible');
   if(changed)window.SRBackground?.invalidate();return true;
  }
  if(this.back?.key!==key||!this.back.ready)return false;
  const oldNode=this.frontNode,oldEntry=this.front;
  this.frontNode=this.backNode;this.front=this.back;this.backNode=oldNode;this.back=oldEntry;
  this.backNode.id=this.id+'Back';this.frontNode.id=this.id;
  // Hand the decoded source frame to the nominal renderer before retiring its old slot.
  oldNode.after(this.frontNode);this.frontNode.setAttribute('visibility','visible');
  const newNode=this.frontNode;
  if(oldEntry?.ready&&oldNode.getAttribute('visibility')==='visible'){
   this.paintReady=new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(this.frontNode===newNode&&this.backNode===oldNode)oldNode.setAttribute('visibility','hidden');
    resolve();
   })));
  }else{oldNode.setAttribute('visibility','hidden');this.paintReady=Promise.resolve();}
  window.SRBackground?.invalidate();return true;
 }
}
function nextWeatherTime(time,period){
 const boundary=Math.floor(time/period)*period+period;
 if(boundary>viewerEndTime())return null;
 if(!visibleTimeRanges.length)return boundary;
 for(const range of visibleTimeRanges)if(range.end>=boundary)return Math.max(boundary,range.start);
 return null;
}

const WIND_MODEL='dmi_harmonie_arome_europe';
const RADAR_OPACITY=.75;

const WEATHER_RADAR_INTERVAL=600;
function validateWeatherAssets(assets,event){
 const prefix=`weather/${event.id}/radar/`,radar=assets?.radar,points=assets?.wind_models?.[WIND_MODEL];
 const firstFrame=Math.floor(event.start/WEATHER_RADAR_INTERVAL)*WEATHER_RADAR_INTERVAL;
 const lastFrame=Math.floor(event.end/WEATHER_RADAR_INTERVAL)*WEATHER_RADAR_INTERVAL;
 const firstHour=Math.floor(event.start/3600)*3600,lastHour=Math.floor(event.end/3600)*3600;
 const fields=['wind_speed_10m','wind_direction_10m','wind_gusts_10m'];
 const invalid=()=>new SRMessageError('Ugyldige eller ufuldstændige vejrdata for {0}.',event.id);
 if(assets?.version!==1||assets.eventId!==event.id||radar?.source!==event.weather.radar||radar.quantity!=='DBZH'||
  radar.interval_seconds!==WEATHER_RADAR_INTERVAL||radar.projection!=='EPSG:4326'||JSON.stringify(radar.bbox)!=='[9.5,54,14,57]'||
  !Array.isArray(radar.frames)||radar.frames.length!==(lastFrame-firstFrame)/WEATHER_RADAR_INTERVAL+1||
  !radar.frames.every((frame,i)=>frame?.time===firstFrame+i*WEATHER_RADAR_INTERVAL&&frame.file===prefix+frame.time+'.png')||
  !Array.isArray(points)||points.length!==247)throw invalid();
 for(const point of points){
  const hourly=point?.hourly;
  if(![point?.latitude,point?.longitude].every(Number.isFinite)||
   !Array.isArray(hourly?.time)||hourly.time.length!==(lastHour-firstHour)/3600+1||
   !hourly.time.every((time,i)=>time===firstHour+i*3600)||
   !fields.every(key=>Array.isArray(hourly[key])&&hourly[key].length===hourly.time.length&&hourly[key].every(Number.isFinite)))
   throw invalid();
 }
 return assets;
}
async function loadEventWeather(event,data){
 if(!event.weather||event.weather.embedded)return;
 const response=await fetch(event.weather.file);
 if(!response.ok)throw new SRMessageError('Vejrdata kunne ikke hentes ({0}).',response.status);
 const assets=validateWeatherAssets(await response.json(),event);
 data.wind_models=assets.wind_models;
 data.radar=assets.radar;
}

const WIND_KNOT_TO_MS=1852/3600;
// The staff points north before rotation by the wind's direction of origin.
function windBarbPath(knots){
 const units=Math.round(knots/5);
 if(units===0)return 'M-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0';
 const flags=Math.floor(units/10),feathers=Math.floor(units%10/2),half=units%2;
 let d='M0 0V-24',y=-24;
 for(let i=0;i<flags;i++,y+=7)d+=`M0 ${y}H9L0 ${y+6}Z`;
 for(let i=0;i<feathers;i++,y+=4)d+=`M0 ${y}L9 ${y-4}`;
 if(half){
  if(!flags&&!feathers)y+=4;
  d+=`M0 ${y}L4.5 ${y-2}`;
 }
 return d;
}

function prepareWindBarbGrid(points){
 const frames=new Map();
 const locations=points.map(({longitude,latitude},index)=>({
  longitude,latitude,index,column:Math.round((longitude-9.5)*4),row:Math.round((latitude-54)*4)
 }));
 let maxKnots=0;
 for(const [index,{hourly}] of points.entries()){
  for(const [i,hour] of hourly.time.entries()){
   const speed=hourly.wind_speed_10m[i],direction=hourly.wind_direction_10m[i];
   if(!Number.isFinite(speed)||speed<0||(speed>0&&!Number.isFinite(direction)))continue;
   const knots=speed/WIND_KNOT_TO_MS,angle=(speed?direction:0)*Math.PI/180;
   const gust=hourly.wind_gusts_10m?.[i],gustKnots=Number.isFinite(gust)&&gust>=0?gust/WIND_KNOT_TO_MS:null;
   if(!frames.has(hour))frames.set(hour,[]);
   frames.get(hour)[index]={east:knots*Math.sin(angle),north:knots*Math.cos(angle),gustKnots};
   maxKnots=Math.max(knots,gustKnots??0,maxKnots);
  }
 }
 // Model cell coordinates have small offsets from the requested quarter-degree grid.
 // Include a margin of neighbouring rows and columns before ranking real distances.
 const neighbours=Array.from({length:13},(_,row)=>Array.from({length:19},(_,column)=>
  locations.filter(site=>Math.abs(site.column-column)<=3&&Math.abs(site.row-row)<=2)));
 const glyphs=Array.from({length:Math.ceil(maxKnots/5)+1},(_,index)=>windBarbPath(index*5));
 return {frames,neighbours,glyphs};
}

function windBarbAt(grid,frame,longitude,latitude,lonScale,mode='mean'){
 if(longitude<9.5||longitude>14||latitude<54||latitude>57)return null;
 const sites=grid.neighbours[Math.round((latitude-54)*4)][Math.round((longitude-9.5)*4)];
 const nearest=[];
 for(const site of sites){
  const vector=frame[site.index];if(!vector)continue;
  const distance=((site.longitude-longitude)*lonScale)**2+(site.latitude-latitude)**2;
  let at=nearest.length;
  while(at>0&&distance<nearest[at-1].distance)at--;
  if(at===4)continue;
  nearest.splice(at,0,{distance,vector});
  if(nearest.length>4)nearest.pop();
 }
 if(!nearest.length||nearest[0].distance>.3**2)return null;
 if(nearest[0].distance<1e-12)nearest.length=1;
 let east=0,north=0,total=0,gust=0,gustWeight=0;
 for(const {distance,vector} of nearest){
  const weight=1/Math.max(distance,1e-12);
  east+=vector.east*weight;north+=vector.north*weight;total+=weight;
  if(mode==='gust'&&vector.gustKnots!==null){gust+=vector.gustKnots*weight;gustWeight+=weight;}
 }
 if(mode==='gust'&&!gustWeight)return null;
 const mean=Math.hypot(east,north)/total,knots=mode==='gust'?gust/gustWeight:mean,band=Math.round(knots/5);
 // The source records gust speed and the mean wind direction.
 return {d:grid.glyphs[band],band,knots,direction:mean<1e-9?null:Math.atan2(east,north)*180/Math.PI};
}
