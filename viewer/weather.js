// Two decoded SVG image slots: keep the front visible until the back is ready.
class WeatherImageBuffer {
 constructor(id){
  this.id=id;this.frontNode=document.getElementById(id);this.backNode=this.frontNode.cloneNode(false);
  this.backNode.id=id+'Back';this.frontNode.after(this.backNode);
  this.front=null;this.back=null;this.hide();
 }
 hide(){for(const node of [this.frontNode,this.backNode])node.setAttribute('visibility','hidden');}
 prepare(key,createHref,retry=false){
  if(this.front?.key===key)return this.front;
  if(this.back?.key===key&&(!retry||!this.back.error))return this.back;
  this.back?.cancel?.();
  const entry={key,ready:false,error:null};this.back=entry;
  const node=this.backNode;node.onload=node.onerror=null;
  node.setAttribute('visibility','hidden');
  entry.promise=(async()=>{
   try{
    // Yield before generating a future wind field so the current frame can finish.
    await new Promise(resolve=>setTimeout(resolve,0));
    if(this.back!==entry)return entry;
    const href=createHref(),image=new Image();entry.image=image;image.src=href;
    await image.decode();
    if(this.back!==entry)return entry;
    await new Promise((resolve,reject)=>{
     entry.cancel=()=>{node.onload=node.onerror=null;resolve();};
     node.onload=()=>{node.onload=node.onerror=null;resolve();};
     node.onerror=()=>{node.onload=node.onerror=null;reject(new Error('Vejrbilledet kunne ikke indlæses.'));};
     node.setAttribute('href',href);
    });
    entry.cancel=null;
    if(this.back===entry){entry.ready=true;node.dataset.weatherKey=key;}
   }catch(error){entry.error=error;}
   return entry;
  })();
  return entry;
 }
 display(key){
  if(this.front?.key===key&&this.front.ready){this.frontNode.setAttribute('visibility','visible');return true;}
  if(this.back?.key!==key||!this.back.ready)return false;
  const oldNode=this.frontNode,oldEntry=this.front;
  this.frontNode=this.backNode;this.front=this.back;this.backNode=oldNode;this.back=oldEntry;
  this.backNode.id=this.id+'Back';this.frontNode.id=this.id;
  this.frontNode.setAttribute('visibility','visible');this.backNode.setAttribute('visibility','hidden');
  return true;
 }
}
function nextWeatherTime(time,period){
 const boundary=Math.floor(time/period)*period+period;
 if(boundary>D.end)return null;
 if(!visibleTimeRanges.length)return boundary;
 for(const range of visibleTimeRanges)if(range.end>=boundary)return Math.max(boundary,range.start);
 return null;
}

// DMI's wind legend, read from dmi.dk/vejrkort on 7 November 2026.
// Values are in m/s. Keep the complete scale for storms as well as light winds.
const WIND_COLOURS = [[0,'#dcfaf7'],[2,'#9ef2e9'],[4,'#7deee2'],[6,'#16e1cc'],
 [8,'#6dbff2'],[10,'#3dabee'],[12,'#008fe9'],[14,'#fff5bf'],[16,'#ffec7f'],
 [18,'#ffd900'],[20,'#ffb200'],[22,'#ff8e52'],[24,'#ff5252'],[26,'#e63939'],
 [28,'#cc1f1f'],[32,'#800000'],[50,'#5c0033']];
// Each threshold is inclusive: the first blue covers 8 <= speed < 10 m/s.
const WIND_PALETTE=WIND_COLOURS.map(([value,c])=>[value,c.match(/\w\w/g).map(h=>parseInt(h,16))]);
function windColour(speed) {
 let colour=WIND_PALETTE[0][1];
 for(const [threshold,rgb] of WIND_PALETTE) {if(speed<threshold)break;colour=rgb;}
 return colour;
}
function windVector(speed,direction) {
 if(!Number.isFinite(speed)||speed<0||(!Number.isFinite(direction)&&speed!==0))return null;
 const angle=(direction||0)*Math.PI/180;
 return {east:-Math.sin(angle)*speed,north:-Math.cos(angle)*speed};
}
// Independent radar palette, shared with scripts/prepare_radar.py.
const RAIN_COLOURS = [[0,'#f44336'],[10,'#e93260'],[20,'#d62487'],[30,'#bb20aa'],
 [40,'#9823c5'],[50,'#7624d6'],[60,'#5416a8']];

function colourLegend(id, stops, unit) {
 const legend = document.getElementById(id);
 for (const [i,[value,colour]] of stops.entries()) {
  const swatch = document.createElement('span');
  swatch.style.background = colour;
  swatch.textContent = value;
  swatch.title = `${value}${i === stops.length-1 ? '+' : '–'+stops[i+1][0]} ${unit}`;
  swatch.setAttribute('aria-label',swatch.title);
  const rgb = colour.match(/\w\w/g).map(c => parseInt(c,16));
  if (rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722 < 125) swatch.className = 'dark';
  legend.append(swatch);
 }
}
colourLegend('windLegend', WIND_COLOURS, 'm/s');
colourLegend('rainLegend', RAIN_COLOURS, 'dBZ');

// Interpolate the archived samples for a continuous background. This adds no
// weather information or meteorological resolution.
const windGrids = new Map();
let windFieldKey=null,windReady=Promise.resolve(),windFieldError=null;
const windImageBuffer=new WeatherImageBuffer('windImage');
function windGrid(model) {
 if (windGrids.has(model)) return windGrids.get(model);
 const width=200, height=236, points=window.DATA.wind_models[model];
 const indices=new Int16Array(width*height*4).fill(-1);
 const weights=new Float32Array(indices.length);
 for(let y=0; y<height; y++) for(let x=0; x<width; x++) {
  const lon=9.5+(x+.5)*4.5/width, lat=57-(y+.5)*3/height;
  const nearest=[];
  for(let i=0; i<points.length; i++) {
   const p=points[i], distance=((p.longitude-lon)*Math.cos(lat*Math.PI/180))**2+(p.latitude-lat)**2;
   if(nearest.length===4 && distance>=nearest[3][1]) continue;
   nearest.push([i,distance]); nearest.sort((a,b)=>a[1]-b[1]); nearest.length=Math.min(nearest.length,4);
  }
  // Do not extend the colour field across gaps larger than the sampling grid.
  if(nearest[0][1]>.3**2) continue;
  if(nearest[0][1]<1e-12)nearest.length=1;
  for(let n=0; n<nearest.length; n++) {
   const offset=(y*width+x)*4+n;
   indices[offset]=nearest[n][0]; weights[offset]=1/Math.max(nearest[n][1],1e-12);
  }
 }
 const grid={width,height,indices,weights}; windGrids.set(model,grid); return grid;
}
function prepareNextWind(time,model){
 const next=nextWeatherTime(time,3600);if(next===null)return;
 const hour=Math.floor(next/3600)*3600,key=`${model}:${hour}`;
 windImageBuffer.prepare(key,()=>buildWindField(model,hour));
}
function renderWindField(t){
 if(!document.getElementById('wind').checked){windFieldKey=null;windReady=Promise.resolve();windFieldError=null;windImageBuffer.hide();return;}
 const model=document.getElementById('windModel').value,hour=Math.floor(t/3600)*3600,key=`${model}:${hour}`;
 if(key===windFieldKey){if(windImageBuffer.front?.key===key)prepareNextWind(t,model);return;}
 windFieldKey=key;windFieldError=null;
 const entry=windImageBuffer.prepare(key,()=>buildWindField(model,hour),true);
 if(windImageBuffer.display(key)){windReady=Promise.resolve();prepareNextWind(t,model);return;}
 windReady=entry.promise.then(()=>{
  if(windFieldKey!==key||!document.getElementById('wind').checked)return;
  if(entry.error){windFieldError=entry.error;return;}
  if(windImageBuffer.display(key))prepareNextWind(t,model);
 });
}
function buildWindField(model,hour){
 const grid=windGrid(model), points=window.DATA.wind_models[model];
 const values=points.map(p=>{
  const i=p.hourly.time.indexOf(hour);
  return windVector(p.hourly.wind_speed_10m[i],p.hourly.wind_direction_10m[i]);
 });
 const canvas=document.createElement('canvas'); canvas.width=grid.width; canvas.height=grid.height;
 const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(grid.width,grid.height);
 for(let p=0; p<grid.width*grid.height; p++) {
  let east=0,north=0,total=0;
  for(let n=0; n<4; n++) {
   const i=p*4+n, value=values[grid.indices[i]];
   if(!value)continue;
   east+=value.east*grid.weights[i];north+=value.north*grid.weights[i];total+=grid.weights[i];
  }
  if(!total) continue;
  const speed=Math.hypot(east/total,north/total);
  pixels.data.set([...windColour(speed),255],p*4);
 }
 ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
}

let windSampleKey=null,windSamples=[];
function windSamplesAt(model,time) {
 const hour=Math.floor(time/3600)*3600,key=`${model}:${hour}`;
 if(key===windSampleKey)return windSamples;
 windSamples=[];
 for(const p of window.DATA.wind_models[model]) {
  const i=p.hourly.time.indexOf(hour),speed=p.hourly.wind_speed_10m[i],direction=p.hourly.wind_direction_10m[i];
  const vector=windVector(speed,direction);if(!vector)continue;
  windSamples.push({lon:p.longitude,lat:p.latitude,...vector,gust:p.hourly.wind_gusts_10m?.[i]});
 }
 windSampleKey=key;return windSamples;
}

function interpolateWind(samples,lon,lat) {
 // Match the geographic extent of the colour field and avoid extrapolating
 // across gaps larger than the original sampling grid.
 if(lon<9.5||lon>14||lat<54||lat>57)return null;
 const nearest=[],lonScale=Math.cos(lat*Math.PI/180);
 for(const sample of samples) {
  const distance=((sample.lon-lon)*lonScale)**2+(sample.lat-lat)**2;
  if(nearest.length===4&&distance>=nearest[3].distance)continue;
  nearest.push({sample,distance});nearest.sort((a,b)=>a.distance-b.distance);
  if(nearest.length>4)nearest.pop();
 }
 if(!nearest.length||nearest[0].distance>.3**2)return null;
 // Preserve source values exactly when a grid point coincides with a sample.
 if(nearest[0].distance<1e-12)nearest.length=1;
 let east=0,north=0,total=0,gust=0,gustWeight=0;
 for(const {sample,distance} of nearest) {
  const weight=1/Math.max(distance,1e-12);
  east+=sample.east*weight;north+=sample.north*weight;total+=weight;
  if(Number.isFinite(sample.gust)){gust+=sample.gust*weight;gustWeight+=weight;}
 }
 east/=total;north/=total;
 const speed=Math.hypot(east,north);
 // Average vector components, never angles: 359° and 1° must remain northerly.
 return {east,north,speed:speed<1e-9?0:speed,
  direction:speed<1e-9?null:(Math.atan2(-east,-north)*180/Math.PI+360)%360,
  gust:gustWeight?gust/gustWeight:null};
}
