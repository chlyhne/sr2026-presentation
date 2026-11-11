const $=id=>document.getElementById(id), D=window.DATA, NS='http://www.w3.org/2000/svg';
const xy=([lon,lat])=>[(lon-9.5)/4.5*1000,(57-lat)/3*1180];
const timeFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Copenhagen',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const fmt=t=>timeFormatter.format(new Date(t*1000));
function el(tag,attrs={},parent){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(parent)parent.append(n);return n;}
function setAttr(node,name,value){value=String(value);if(node.getAttribute(name)!==value)node.setAttribute(name,value);}
// Geographic anchors move with the map; symbols use CSS pixel dimensions.
function screenGroup(x,y,parent){
 return el('g',{'data-screen-x':x,'data-screen-y':y,transform:`translate(${x} ${y})`},parent);
}
function resizeSymbols(){
 const matrix=mapViewport()?.matrix;
 if(!matrix)return;
 const inverseScale=1/Math.hypot(matrix.a,matrix.b);
 for(const group of $('map').querySelectorAll('[data-screen-x]')){
  // Keep the interactive circle in map coordinates. Firefox cannot reliably
  // hit-test a marker beneath a tiny inverse-scale transform at close zoom.
  const marker=group.classList.contains('boat-marker');
  const transform=`translate(${group.dataset.screenX} ${group.dataset.screenY})${marker?'':` scale(${inverseScale})`}`;
  if(group.getAttribute('transform')!==transform)group.setAttribute('transform',transform);
  if(marker)setAttr(group.boatHitTarget,'r',10*inverseScale);
 }
 resizeBoatIcons(matrix);
}
function path(points){return points.map((p,i)=>(i?'L':'M')+xy(p).join(',')).join(' ')}
let mapLayout=null,mapCamera=null;
function invalidateMapLayout(){mapLayout=null;mapCamera=null;}
function mapViewport(){
 // The root SVG uses xMidYMid/meet. Derive its projection from the camera and
 // cached CSS layout; never ask SVG to resolve layout for every layer/input.
 const rect=mapLayout||(mapLayout=$('map').getBoundingClientRect());
 const box=$('map').viewBox.baseVal,{x,y,width,height}=box,ratio=devicePixelRatio||1;
 if(!rect.width||!rect.height||!width||!height)return null;
 const key=[x,y,width,height,rect.left,rect.top,rect.width,rect.height,ratio].join(':');
 if(mapCamera?.key===key)return mapCamera;
 const scale=Math.min(rect.width/width,rect.height/height);
 const matrix=new DOMMatrix([scale,0,0,scale,rect.left+(rect.width-width*scale)/2-x*scale,rect.top+(rect.height-height*scale)/2-y*scale]);
 const inverse=matrix.inverse();
 const a=new DOMPoint(rect.left,rect.top).matrixTransform(inverse);
 const b=new DOMPoint(rect.right,rect.bottom).matrixTransform(inverse);
 return mapCamera={key,rect,matrix,inverse,topLeft:a,viewBox:[a.x,a.y,b.x-a.x,b.y-a.y],
  pixelWidth:Math.max(1,Math.round(rect.width*(devicePixelRatio||1))),pixelHeight:Math.max(1,Math.round(rect.height*(devicePixelRatio||1))),
  bounds:{west:9.5+a.x*4.5/1000,east:9.5+b.x*4.5/1000,south:57-b.y*3/1180,north:57-a.y*3/1180}};
}
function visibleMapBounds(){return mapViewport()?.bounds||null;}
function positionMapCanvas(host,canvas,viewport){
 const {rect,inverse,topLeft,pixelWidth,pixelHeight}=viewport;
 setAttr(host,'x',0);setAttr(host,'y',0);
 setAttr(host,'width',rect.width);setAttr(host,'height',rect.height);
 setAttr(host,'transform',`matrix(${inverse.a} ${inverse.b} ${inverse.c} ${inverse.d} ${topLeft.x} ${topLeft.y})`);
 if(canvas.width!==pixelWidth)canvas.width=pixelWidth;if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
}
function mapBoundsIntersect(a,b){return a.east>=b.west&&a.west<=b.east&&a.north>=b.south&&a.south<=b.north;}
// Cache the full geometry in small chunks, then draw only those in the viewport.
// Shared end points keep the detailed coastline continuous at chunk boundaries.
const coastChunks=[];
const LAND_FILL='#bdc7cb';
const landPolygons=D.land.features.map(feature=>{
 const rings=feature.geometry.coordinates,points=rings.flat();
 let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
 for(const [lon,lat] of points){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
 return {west,east,south,north,rings};
});
for(const line of D.coast)for(let start=0;start<line.length-1;start+=256){
 const points=line.slice(start,start+257);
 let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
 for(const [lon,lat] of points){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
 coastChunks.push({west,east,south,north,points,before:line[start-1],after:line[start+257]});
}
function positionScreenGroup(group,x,y,scale){
 setAttr(group,'data-screen-x',x);setAttr(group,'data-screen-y',y);
 setAttr(group,'transform',`translate(${x} ${y}) scale(${scale})`);
}
let mapCreditKey=null,mapCreditNodes=null;
function renderMapCredit(){
 const viewport=mapViewport();if(!viewport||mapCreditKey===viewport.key)return;
 mapCreditKey=viewport.key;renderTrackSpeedLegend();
 const {rect,matrix,inverse}=viewport,point=new DOMPoint(rect.right-8,rect.bottom-8).matrixTransform(inverse);
 const {meters,label}=mapGridLevel(viewport),width=meters*MAP_GRID_UNITS_PER_METER[0]*Math.hypot(matrix.a,matrix.b),panelWidth=Math.max(185,width+16);
 if(!mapCreditNodes){
  const group=screenGroup(point.x,point.y,$('mapCredit'));
  const panel=el('rect',{y:-64,height:70,rx:3,fill:'#ffffff',opacity:.88},group);
  const scale=el('g',{'data-map-scale':'',role:'img'},group);
  const line=el('path',{fill:'none',stroke:'#173d4c','stroke-width':1.5},scale);
  const text=el('text',{y:-49,'text-anchor':'middle','font-size':11,fill:'#173d4c'},scale);
  el('text',{x:-5,y:-12,'text-anchor':'end','font-size':10,fill:'#173d4c'},group).textContent=D.coast_metadata.attribution;
  el('text',{x:-5,y:1,'text-anchor':'end','font-size':10,fill:'#173d4c'},group).textContent='openstreetmap.org/copyright';
  mapCreditNodes={group,panel,scale,line,text};
 }
 const {group,panel,scale,line,text}=mapCreditNodes;
 positionScreenGroup(group,point.x,point.y,1/Math.hypot(matrix.a,matrix.b));
 setAttr(panel,'x',-panelWidth);setAttr(panel,'width',panelWidth);
 setAttr(scale,'data-meters',meters);setAttr(scale,'data-pixel-width',width);setAttr(scale,'aria-label',`Målestok: ${label}`);
 setAttr(line,'d',`M${-8-width},-45v7H-8v-7`);setAttr(text,'x',-8-width/2);
 if(text.textContent!==label)text.textContent=label;
}
const colours={Mercutio:'#ffdc42',Vera:'#ff4dac',My:'#6cffff','THE HULK':'#65ff84'};
const TRACK_STROKE_WIDTH=2.7,TRACK_OUTLINE_WIDTH=4.7;
const featured=new Set([...Object.keys(colours),'Rosa-Lux']),chosen=new Set();
const boats=D.boats.map(b=>({...b,...boatDetails[b.id],metadata:boatMetadata(b.name)})).sort((a,b)=>(featured.has(b.name)-featured.has(a.name))||a.name.localeCompare(b.name));
const REFERENCE_BOAT_KEY='sr2026-reference-boat';
let referenceBoatId=boats.find(boat=>boat.name==='Mercutio').id,referencePreferenceError='';
try{
 const stored=localStorage.getItem(REFERENCE_BOAT_KEY);
 if(stored!==null){
  if(!boats.some(boat=>boat.id===stored))throw Error('Ugyldig referencebåd.');
  referenceBoatId=stored;
 }
}catch(error){referencePreferenceError='Referencebåd kunne ikke indlæses: '+error.message;}
function referenceBoat(){return boats.find(boat=>boat.id===referenceBoatId);}
function syncReferenceBoatControls(){
 const boat=referenceBoat();
 $('referenceBoat').value=boat.id;
 $('referenceBoatHeading').textContent=` / ${boat.name}`;
 $('mapHeading').title='Sjælland Rundt 2026 / '+boat.name;
 for(const basis of ['absolute','handicap'])$('trackStyle').querySelector(`option[value="${basis}"]`).textContent=`Mod ${boat.name} · ${basis==='absolute'?'absolut':'handicap'}`;
 $('trackStyle').querySelector('option[value="time"]').textContent=`Mod ${boat.name} · tid / 100 m ref.`;
}
for(const boat of boats){
 const option=document.createElement('option');option.value=boat.id;option.textContent=boat.name;
 $('referenceBoat').append(option);
}
syncReferenceBoatControls();
$('referenceBoat').onchange=async()=>{
 try{if(!await saveReferenceBoat($('referenceBoat').value))syncReferenceBoatControls();}
 catch(error){comparisonMessage('Referencebåden kunne ikke ændres: '+error.message);syncReferenceBoatControls();}
};
let boatSearchQuery='',boatFavouritesOnly=false;
function isBoatSearchActive(){return boatSearchQuery.length>0;}
function isBoatFilterActive(){return boatFavouritesOnly||isBoatSearchActive();}
function boatIsDisplayed(boat){
 return (!boatFavouritesOnly||chosen.has(boat.name))&&(!isBoatSearchActive()
  ||[boat.name,boat.skipper,boat.boatType||boat.metadata?.boatType].some(value=>String(value||'').toLocaleLowerCase('da').includes(boatSearchQuery)));
}
function createBoatHeartChoice(boat,className=''){
 const choice=document.createElement('input');choice.type='checkbox';choice.className='boat-heart-choice '+className;choice.value=boat.name;choice.checked=chosen.has(boat.name);
 choice.setAttribute('aria-label','Favorit: '+boat.name);choice.onchange=()=>setBoatSelected(boat,choice.checked);
 const heart=el('svg',{class:'boat-heart-icon',width:20,height:20,viewBox:'0 0 24 24','aria-hidden':'true',fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round'});
 el('path',{d:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'},heart);
 return {choice,heart};
}
function syncBoatChoices(){
 for(const [i,b] of boats.entries()){
  const input=$('choices').children[i]?.querySelector('input');if(input)input.checked=chosen.has(b.name);
 }
 for(const input of $('visibleBoatsList').querySelectorAll('input'))input.checked=chosen.has(input.value);
}
function setBoatSelected(boat,selected){
 changeBoatSelection(()=>{if(selected)chosen.add(boat.name);else chosen.delete(boat.name);});
}
function setAllBoatsSelected(selected){
 changeBoatSelection(()=>{for(const boat of boats){if(selected)chosen.add(boat.name);else chosen.delete(boat.name);}});
}
function activateBoatMarker(id,focus=false){
 if(!isBoatFilterActive())return;
 const boat=boats.find(boat=>boat.id===id);if(!boat)return;
 setBoatSelected(boat,!chosen.has(boat.name));flushRender();
 if(focus)$('boatMarkers').querySelector(`[data-boat-marker="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
}
// Assign the complete field once, so toggling boats never changes their colours.
for(const [i,name] of [...new Set(boats.map(b=>b.name))].sort().entries()){
 if(!Object.hasOwn(colours,name))colours[name]=`hsl(${((18+i*137.507764)%360).toFixed(3)},78%,${42+i%3*7}%)`;
}
for(const b of boats){const label=document.createElement('label');label.className='boat';const {choice,heart}=createBoatHeartChoice(b);const dot=document.createElement('span');dot.className='dot';dot.style.background=colours[b.name];label.append(choice,heart,dot,document.createTextNode(b.name));$('choices').append(label)}
for(const [name,lon,lat] of [['Helsingør',12.61,56.04],['København',12.57,55.67],['Stevns',12.45,55.28],['Møn',12.3,54.98],['Farø',11.99,54.95],['Agersø',11.2,55.21],['Storebæltsbroen',11.03,55.33],['Røsnæs',10.87,55.74],['Sj. Odde',11.3,55.97],['Gilleleje',12.31,56.13]]){const [x,y]=xy([lon,lat]),group=screenGroup(x,y,$('places'));el('circle',{cx:0,cy:0,r:2,fill:'#173d4c'},group);const n=el('text',{x:4,y:-4,fill:'#173d4c','font-size':11,stroke:'#f4fafb','stroke-width':3,'paint-order':'stroke'},group);n.textContent=name}
// Red mark in Snekkeløb: user-supplied 56° 2.391′ N, 11° 16.523′ E.
{
 const [x,y]=xy([11+16.523/60,56+2.391/60]),group=screenGroup(x,y,$('seamarks'));
 el('circle',{id:'snekkeloebRedMark',cx:0,cy:0,r:5,fill:'#e02020',stroke:'#ffffff','stroke-width':1},group);
 el('title',{},group).textContent='Rød i Snekkeløb · 56° 2.391′ N 11° 16.523′ E';
}
// Rute T is an open line through the user's waypoints, in the base map layer.
for(const feature of D.course_lines.features){
 const {kind,name,reference_boat,reference_utc}=feature.properties,coordinates=feature.geometry.coordinates;
 const colour=kind==='start'?'#087b3d':'#c62738';
 const group=el('g',{'data-course-line':kind},$('courseLines'));
 el('title',{},group).textContent=`${name} · TracTrac${reference_utc?` · ${reference_boat} · start ${fmt(Date.parse(reference_utc)/1000)}`:''}`;
 el('path',{d:path(coordinates),fill:'none',stroke:'#ffffff','stroke-width':5,'vector-effect':'non-scaling-stroke'},group);
 el('path',{'data-line-geometry':kind,d:path(coordinates),fill:'none',stroke:colour,'stroke-width':2.5,
  'stroke-dasharray':kind==='finish'?'6 4':'none','vector-effect':'non-scaling-stroke'},group);
 for(const [i,coordinate] of coordinates.entries()){
  const [x,y]=xy(coordinate),marker=screenGroup(x,y,group);
  el('circle',{r:3,fill:colour,stroke:'#ffffff','stroke-width':1},marker);
  el('title',{},marker).textContent=feature.properties.endpoints[i].name;
 }
 const [x,y]=xy([(coordinates[0][0]+coordinates[1][0])/2,(coordinates[0][1]+coordinates[1][1])/2]);
 const label=screenGroup(x,y,group);
 el('text',{x:0,y:-10,'text-anchor':'middle',fill:colour,'font-size':12,'font-weight':750,
  stroke:'#ffffff','stroke-width':3,'paint-order':'stroke'},label).textContent=name;
}
for(const feature of D.route_t.features){
 const line=el('path',{'data-route-id':feature.id,d:path(feature.geometry.coordinates),fill:'none',
  stroke:'#000000','stroke-width':2,'stroke-linejoin':'round','stroke-linecap':'round',
  'vector-effect':'non-scaling-stroke'},$('routeT'));
 el('title',{},line).textContent=feature.properties.name+' · måtte ikke krydses under sejladsen';
}
let interval=null;
const windLabels={era5:'ERA5',ecmwf_ifs:'ECMWF IFS',dmi_harmonie_arome_europe:'DMI HARMONIE'};
let radarKey=null,radarStatus='indlæser …',radarReady=Promise.resolve();
const radarImageBuffer=new WeatherImageBuffer('radarImage');
function prepareNextRadar(time){
 const next=nextWeatherTime(time,600);if(next===null)return;
 const frame=D.radar?.frames.find(f=>f.time>=next);
 if(frame)radarImageBuffer.prepare(String(frame.time),()=>frame.file);
}
function renderRadar(time){
 const t=Math.floor(time/600)*600;
 $('precipitation').setAttribute('opacity',$('rainOpacity').value);
 const enabled=$('rain').checked,key=`${t}:${enabled}`;
 if(key===radarKey){if(enabled&&radarImageBuffer.front?.key===String(t))prepareNextRadar(time);return;}
 radarKey=key;
 if(!enabled){radarImageBuffer.hide();radarReady=Promise.resolve();radarStatus='slået fra';$('rainPeriod').textContent='Radar slået fra';return;}
 const frame=D.radar?.frames.find(f=>f.time===t);
 if(!frame){radarImageBuffer.hide();radarReady=Promise.resolve();radarStatus='mangler';$('rainPeriod').textContent=`DMI radar mangler ved ${fmt(t)}`;prepareNextRadar(time);return;}
 const finish=()=>{
  radarStatus=fmt(t);$('rainPeriod').textContent=`DMI radar: ${fmt(t)} · dBZ`;
  prepareNextRadar(time);status(currentTime());
 };
 const entry=radarImageBuffer.prepare(String(t),()=>frame.file,true);
 if(radarImageBuffer.display(String(t))){radarReady=Promise.resolve();finish();return;}
 // Keep the previous frame on screen while an unanticipated seek loads.
 radarStatus='indlæser …';$('rainPeriod').textContent=`DMI radar: ${fmt(t)} · indlæser …`;
 radarReady=entry.promise.then(()=>{
  if(key!==radarKey)return;
  if(entry.error){radarStatus='kunne ikke indlæses';$('rainPeriod').textContent=`DMI radar kunne ikke indlæses ved ${fmt(t)}`;status(currentTime());return;}
  if(radarImageBuffer.display(String(t)))finish();
 });
}

function status(t){
 const model=$('windModel').value,hour=Math.floor(t/3600)*3600,windAvailable=D.wind_models[model][0].hourly.time.includes(hour);
 $('status').textContent=`Vind: ${windLabels[model]} ${windAvailable?fmt(hour):'data mangler ved '+fmt(hour)} ${$('rain').checked?' · Radar DMI: '+radarStatus:''} · Tracks: interpoleret ved ${fmt(t)} · Noter gemmes i denne browser`;
}
const WIND_ARROW_SPACING=90;
let windArrowKey=null;
function renderWindArrows(t=currentTime()) {
 const layer=$('winds');
 if(!$('wind').checked){
  if(windArrowKey!==false)layer.replaceChildren();
  windArrowKey=false;return;
 }
 const map=$('map'),matrix=mapViewport()?.matrix;if(!matrix)return;
 const inverse=matrix.inverse(),scale=1/Math.hypot(matrix.a,matrix.b),rect=mapViewport().rect;
 const model=$('windModel').value,showNumbers=$('windNumbers').checked;
 const key=[Math.floor(t/3600),model,showNumbers,matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f,rect.width,rect.height].join(':');
 if(key===windArrowKey)return;
 windArrowKey=key;layer.replaceChildren();
 const samples=windSamplesAt(model,t);
 // The lattice belongs to the visible map. Zoom and pan change the geographic
 // location sampled at each node, while its distance to the next stays 90 px.
 for(let sy=WIND_ARROW_SPACING/2;sy<rect.height;sy+=WIND_ARROW_SPACING) {
  for(let sx=WIND_ARROW_SPACING/2;sx<rect.width;sx+=WIND_ARROW_SPACING) {
   const point=new DOMPoint(rect.left+sx,rect.top+sy).matrixTransform(inverse);
   const lon=9.5+point.x*4.5/1000,lat=57-point.y*3/1180;
   const wind=interpolateWind(samples,lon,lat);if(!wind)continue;
   const group=screenGroup(point.x,point.y,layer);
   group.setAttribute('transform',`translate(${point.x} ${point.y}) scale(${scale})`);
   if(wind.speed>0) {
    const length=9+wind.speed*1.4,dx=wind.east/wind.speed*length,dy=-wind.north/wind.speed*length;
    el('line',{x1:-dx/2,y1:-dy/2,x2:dx/2,y2:dy/2,stroke:'#183b49','stroke-width':2,'marker-end':'url(#arrow)'},group);
   } else el('circle',{r:2,fill:'#183b49'},group);
   if(showNumbers) {
    const text=el('text',{x:5,y:19,'font-size':10,fill:'#173d4c',stroke:'#f4fafb','stroke-width':3,'paint-order':'stroke'},group);
    text.textContent=wind.speed.toFixed(1)+' / '+(wind.gust==null?'–':wind.gust.toFixed(1));
   }
   el('title',{},group).textContent=`${windLabels[model]} · interpoleret: vind ${wind.speed.toFixed(1)} m/s, vindstød ${wind.gust==null?'mangler':wind.gust.toFixed(1)+' m/s'}, ${wind.direction==null?'vindstille':'fra '+wind.direction.toFixed(0)+'°'}, ${fmt(Math.floor(t/3600)*3600)}`;
  }
 }
}
// Keep state changes synchronous, but combine UI paint requests until the next
// browser frame. Full redraws subsume viewport-only redraws, in either order.
let renderRequest=null,renderRequestKind=null;
const RENDER_PRIORITY={background:1,viewport:2,full:3};
function requestRender({viewportOnly=false,backgroundOnly=false}={}){
 const kind=backgroundOnly?'background':viewportOnly?'viewport':'full';
 if(!renderRequestKind||RENDER_PRIORITY[kind]>RENDER_PRIORITY[renderRequestKind])renderRequestKind=kind;
 if(renderRequest===null)renderRequest=requestAnimationFrame(flushRender);
}
function consumeRenderRequest(){
 if(renderRequest!==null)cancelAnimationFrame(renderRequest);
 const kind=renderRequestKind;renderRequest=null;renderRequestKind=null;return kind;
}
function flushRender(){
 const kind=consumeRenderRequest();
 if(kind==='full')drawMap();else if(kind==='viewport')drawViewport();else if(kind==='background')webglBackground.render();
}
// Retain an immediate path for exports, scene restoration and programmatic use.
function render(){consumeRenderRequest();drawMap();}
function drawMap(){if(hasRenderingFailure())return;const t=currentTime();$('clock').textContent=fmt(t);$('clock').dateTime=new Date(t*1000).toISOString();renderWindField(t);renderRadar(t);webglBackground.render();status(t);renderWindArrows(t);renderTraffic();renderMilitary();
 renderTracks(t,{includeSpeedPins:false});
 renderAnnotations();
 renderNavigation();
 renderMapCredit();
}
function drawViewport(){
 if(hasRenderingFailure())return;webglBackground.render();renderWindArrows();renderTraffic();renderMilitary();webglTracks.redraw();resizeSymbols();renderSpeedPins();renderNoteDrawings();renderMapCredit();
 layoutVisibleBoats();
}
const boatMarkerNodes=new Map();
function renderTracks(t=currentTime(),{includeSpeedPins=true}={}){
 clearTrackHover();
 const markerLayer=$('boatMarkers');
 const drawingOrder=boats.filter(boatIsDisplayed).sort((a,b)=>(referenceBoatId===a.id)-(referenceBoatId===b.id));
 if(!webglTracks.render(t,drawingOrder))return;
 syncHandicapTracks();
 const active=new Set();let previous=null;
 for(const b of drawingOrder){
  const position=displayBoatPosition(b,t);if(!position)continue;
  active.add(b.id);
  const [x,y]=xy(position.point),color=colours[b.name];
  let record=boatMarkerNodes.get(b.id);
  if(record&&record.boat!==b){record.wrapper.remove();boatMarkerNodes.delete(b.id);record=null;}
  if(!record){
   const wrapper=el('g',{class:'boat-markers'}),group=screenGroup(x,y,wrapper);
   group.setAttribute('class','boat-marker');group.dataset.boatMarker=b.id;
   const title=el('title',{},group);
   group.boatHitTarget=el('circle',{cx:0,cy:0,r:0,fill:'transparent','pointer-events':'all'},group);
   const symbols=screenGroup(0,0,group);
   renderBoatIcon(symbols,b,position,position.replayTime,color);
   record={boat:b,wrapper,group,symbols,title,icon:group.querySelector('.boat-icon'),name:null};boatMarkerNodes.set(b.id,record);
  }
  const {wrapper,group,title,icon}=record;
  setAttr(group,'data-screen-x',x);setAttr(group,'data-screen-y',y);setAttr(group,'data-source-time',position.replayTime);
  if(handicapTracksEnabled)setAttr(group,'data-handicap-compensated','true');else group.removeAttribute('data-handicap-compensated');
  if(position.finished)setAttr(group,'data-handicap-finished','true');else group.removeAttribute('data-handicap-finished');
  const selectable=isBoatFilterActive();
  setAttr(group,'role',selectable?'button':'img');
  setAttr(group,'aria-label',selectable?`Tilføj/fjern favorit: ${b.name}`:b.name);
  if(selectable){setAttr(group,'tabindex','0');setAttr(group,'aria-pressed',String(chosen.has(b.name)));}
  else{group.removeAttribute('tabindex');group.removeAttribute('aria-pressed');}
  const description=`${b.name} · ${handicapTracksEnabled?'handicapkompenseret position · oprindeligt spor ved '+fmt(position.replayTime):position.interpolated?'interpoleret position ved '+fmt(t):'måling fra '+fmt(position.sourceTime)}`;
  if(title.textContent!==description)title.textContent=description;
  setAttr(icon,'data-lat',position.point[1]);setAttr(icon,'data-course',boatCourse(b.points,position.replayTime));
  if(!record.name){
   record.name=el('text',{class:'boat-name','pointer-events':'none',x:7,y:({Mercutio:-12,Vera:15,My:-4,'THE HULK':27}[b.name]||3),fill:color,
    'font-size':12,'font-weight':700,stroke:'#14212a','stroke-width':3,'paint-order':'stroke'},record.symbols);
   record.name.textContent=b.name;
  }
  const next=previous?previous.nextElementSibling:markerLayer.firstElementChild;
  if(next!==wrapper)markerLayer.insertBefore(wrapper,next);previous=wrapper;
 }
 for(const [id,record] of boatMarkerNodes)if(!active.has(id)){
  record.wrapper.remove();
  if(!boats.includes(record.boat))boatMarkerNodes.delete(id);
 }
 resizeSymbols();if(includeSpeedPins)renderSpeedPins();updateVisibleBoats(t);
}
function step(n){syncTimelineViewport();if(finishInlineTextEditing()&&!$('time').disabled){stopPlayback();setCurrentTime(timeAtOffset(+$('time').value+n));requestRender()}}
function setMapLayersExpanded(expanded){
 $('mapLayersPanel').hidden=!expanded;
 $('mapLayersToggle').setAttribute('aria-expanded',String(expanded));
}
function setMapTracksExpanded(expanded){
 $('mapTracksPanel').hidden=!expanded;
 $('mapTracksToggle').setAttribute('aria-expanded',String(expanded));
}
$('mapLayersToggle').onclick=()=>setMapLayersExpanded($('mapLayersPanel').hidden);
$('mapTracksToggle').onclick=()=>setMapTracksExpanded($('mapTracksPanel').hidden);
$('mapLayersToggle').addEventListener('click',()=>{if(!$('mapLayersPanel').hidden)setMapTracksExpanded(false);});
document.addEventListener('pointerdown',event=>{
 if(!$('mapLayers').contains(event.target))setMapLayersExpanded(false);
 if(!$('mapTracks').contains(event.target))setMapTracksExpanded(false);
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape')for(const name of ['mapLayers','mapTracks'])if(!$(name+'Panel').hidden){
  event.preventDefault();event.stopImmediatePropagation();$(name+'Panel').hidden=true;$(name+'Toggle').setAttribute('aria-expanded','false');$(name+'Toggle').focus();return;
 }
},true);
for(const id of ['wind','windModel','windNumbers','rain'])$(id).onchange=()=>requestRender();$('rainOpacity').oninput=()=>{$('precipitation').setAttribute('opacity',$('rainOpacity').value);window.SRBackground?.invalidate();};
// Advance from elapsed wall time, retaining fractions for smooth motion at 1x.
let playbackTickTime=0,playbackRate=+$('playbackSpeed').value,eventPlaybackTarget=null;
function syncPlaybackControls(){
 const playing=interval!==null,label=playing?'Pause':'Afspil',speed=$('playbackSpeed'),index=speed.selectedIndex;
 $('play').setAttribute('aria-label',label);$('play').title=label;
 $('playIcon').toggleAttribute('hidden',playing);$('pauseIcon').toggleAttribute('hidden',!playing);
 $('back').disabled=index<=0;$('next').disabled=index>=speed.options.length-1;
 $('back').title=index>0?'Lavere hastighed: '+speed.options[index-1].textContent:'Laveste hastighed: '+speed.options[0].textContent;
 $('next').title=index<speed.options.length-1?'Højere hastighed: '+speed.options[index+1].textContent:'Højeste hastighed: '+speed.options[index].textContent;
}
function updatePlaybackSpeed(){
 if(interval)advancePlayback(performance.now());
 playbackRate=+$('playbackSpeed').value;syncPlaybackControls();
}
function changePlaybackSpeed(direction){
 const speed=$('playbackSpeed'),index=Math.max(0,Math.min(speed.options.length-1,speed.selectedIndex+direction));
 if(index===speed.selectedIndex)return;
 speed.selectedIndex=index;updatePlaybackSpeed();startPlayback();
}
$('back').onclick=()=>changePlaybackSpeed(-1);$('next').onclick=()=>changePlaybackSpeed(1);
syncPlaybackControls();
function centerPlaybackOnReferenceBoat(){
 const boat=referenceBoat();
 const position=boat&&displayBoatPosition(boat,currentTime());
 if(!position)return;
 const [x,y]=xy(position.point);
 view=[x-view[2]/2,y-view[3]/2,view[2],view[3]];setview();
}
function advancePlayback(now){
 if(hasRenderingFailure()){stopPlayback();return;}
 const target=eventPlaybackTarget;
 if(target&&!notes.includes(target)){stopPlayback();return;}
 // Replay time is the clock. Viewport visits only describe the manual slider;
 // they must never seek, pause or terminate an already running clock.
 const end=target?target.time:viewerEndTime();
 const nextTime=currentTime()+Math.max(0,now-playbackTickTime)/1000*playbackRate;
 playbackTickTime=now;
 if(target&&nextTime>=end-1e-6){restoreNote(target,{showImage:true,restoreView:false});return;}
 if(currentTime()>=end){stopPlayback();return;}
 setCurrentTime(Math.min(end,nextTime),{fractional:true,crossedEvents:!target,allowOutsideVisibleRanges:true});
 if(target)centerPlaybackOnReferenceBoat();
 requestRender();
 if(nextTime>=end)stopPlayback();
}
function startPlayback({target=null}={}){
 if(interval!==null||hasRenderingFailure())return;
 if((!target&&currentTime()>=viewerEndTime())||!finishInlineTextEditing())return;
 prepareSelectedTracks();
 eventPlaybackTarget=target;
 playbackRate=+$('playbackSpeed').value;playbackTickTime=performance.now();
 $('play').disabled=false;interval=setInterval(()=>advancePlayback(performance.now()),50);syncPlaybackControls();
 if(target)centerPlaybackOnReferenceBoat();
}
$('play').onclick=()=>{
 if(interval){stopPlayback();return;}
 startPlayback();
};
$('playbackSpeed').onchange=updatePlaybackSpeed;
document.addEventListener('keydown',e=>{if(document.body.classList.contains('presenting'))return;if(e.key==='Escape'){cancelDrawingGesture();setDrawingTool('pan');cancelPlacement();closeTrackSpeedSelection();}if(['TEXTAREA','INPUT','SELECT','BUTTON'].includes(e.target.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();step(e.shiftKey?60:1)}if(e.key==='ArrowLeft'){e.preventDefault();step(e.shiftKey?-60:-1)}});
let view=[230,250,620,760];
function setview(){
 setAttr($('map'),'viewBox',view.join(' '));
 invalidateTimelineViewport();requestRender({viewportOnly:true});
}
$('reset').onclick=()=>{view=[230,250,620,760];setview()};
const MIN_MAP_VIEW_WIDTH=.05,MAX_MAP_VIEW_WIDTH=1800;
$('map').addEventListener('wheel',e=>{e.preventDefault();if(drawingGesture||(!e.deltaY&&!e.deltaX))return;const f=Math.max(MIN_MAP_VIEW_WIDTH,Math.min(MAX_MAP_VIEW_WIDTH,view[2]*((e.deltaY||e.deltaX)>0?1.15:1/1.15)))/view[2];if(f===1)return;const anchor=new DOMPoint(e.clientX,e.clientY).matrixTransform(mapViewport().inverse);view=[anchor.x+(view[0]-anchor.x)*f,anchor.y+(view[1]-anchor.y)*f,view[2]*f,view[3]*f];setview()},{passive:false});
let drag=null;
const map=$('map');
// The map owns the gesture, including when it starts on SVG text or an image.
// Native text selection and image dragging can otherwise cancel pointer events.
map.ondragstart=e=>e.preventDefault();
map.onpointerdown=e=>{
 if(e.button!==0||drag)return;
 clearTrackHover();
 if(beginDrawingGesture(e))return;
 e.preventDefault();
 drag={pointerId:e.pointerId,x:e.clientX,y:e.clientY,view:[...view],
  boatId:e.target.closest('[data-boat-marker]')?.dataset.boatMarker,
  noteIndex:e.target.closest('[data-note-index]')?.dataset.noteIndex,
  trackBoatId:e.target.closest('[data-track-boat-id]')?.dataset.trackBoatId,
  speedKey:e.target.closest('[data-speed-key]')?.dataset.speedKey,
  speedAction:e.target.closest('[data-speed-action]')?.dataset.speedAction,
  inverse:mapViewport().inverse,moved:false};
 map.setPointerCapture(e.pointerId);
 map.classList.add('panning');
};
map.onpointermove=e=>{
 if(moveDrawingGesture(e))return;
 if(!drag){updateTrackHover(e);return;}
 if(e.pointerId!==drag.pointerId)return;
 e.preventDefault();
 const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(Math.hypot(dx,dy)>4)drag.moved=true;
 if(!drag.moved)return;
 const delta=new DOMPoint(dx,dy).matrixTransform(new DOMMatrix([
  drag.inverse.a,drag.inverse.b,drag.inverse.c,drag.inverse.d,0,0]));
 view=[drag.view[0]-delta.x,drag.view[1]-delta.y,drag.view[2],drag.view[3]];
 setview();
};
function endPan(e){
 if(endDrawingGesture(e))return;
 if(!drag||e.pointerId!==drag.pointerId)return;
 const click=e.type==='pointerup'&&!drag.moved,{boatId,noteIndex,trackBoatId,speedKey,speedAction}=drag;
 drag=null;map.classList.remove('panning');
 if(map.hasPointerCapture(e.pointerId))map.releasePointerCapture(e.pointerId);
 if(click){
  if(navigationMode)addNavigationPoint(e);
  else if(placingNote)placeAnnotation(e);
  else if(noteIndex!==undefined&&!document.body.classList.contains('presenting'))beginNoteEditing(notes[+noteIndex]);
  else if(speedKey!==undefined)handleSpeedPinClick(speedAction,speedKey);
  else if(boatId)activateBoatMarker(boatId);
  else if(trackBoatId)chooseTrackSpeed(e,trackBoatId);
  else if(!document.body.classList.contains('presenting')){
   chooseTrackSpeed(e);
  }
 }
}
map.onpointerup=endPan;
map.onpointercancel=endPan;
map.onlostpointercapture=endPan;
map.onpointerleave=()=>clearTrackHover();
window.addEventListener('scroll',event=>{if(event.target!==document)return;invalidateMapLayout();requestRender({viewportOnly:true});},true);
map.addEventListener('keydown',e=>{
 const speedMarker=e.target.closest('[data-speed-key]');
 if(speedMarker&&(e.key==='Enter'||e.key===' ')){
  e.preventDefault();e.stopPropagation();handleSpeedPinClick(e.target.closest('[data-speed-action]')?.dataset.speedAction,speedMarker.dataset.speedKey);return;
 }
 const marker=e.target.closest('[data-boat-marker]');
 if(marker&&(e.key==='Enter'||e.key===' ')){
  e.preventDefault();e.stopPropagation();activateBoatMarker(marker.dataset.boatMarker,true);
 }
});
