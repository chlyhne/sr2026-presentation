const $=id=>document.getElementById(id), D=window.DATA, NS='http://www.w3.org/2000/svg';
document.documentElement.classList.toggle('iphone',SIMPLE_IPHONE_TRACKS);
const xy=([lon,lat])=>[(lon-9.5)/4.5*1000,(57-lat)/3*1180];
const timeFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:window.SR_EVENT.timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const fmt=t=>timeFormatter.format(new Date(t*1000));
function el(tag,attrs={},parent){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(parent)parent.append(n);return n;}
function setAttr(node,name,value){value=String(value);if(node.getAttribute(name)!==value)node.setAttribute(name,value);}
// Geographic anchors move with the map; symbols use CSS pixel dimensions.
function screenGroup(x,y,parent){
 return el('g',{'data-screen-x':x,'data-screen-y':y,transform:`translate(${x} ${y})`},parent);
}
function resizeSymbols(root=$('mapSurface')){
 const matrix=mapViewport()?.matrix;
 if(!matrix)return;
 const inverseScale=1/Math.hypot(matrix.a,matrix.b);
 for(const group of root.querySelectorAll('[data-screen-x]')){
  // Keep the interactive circle in map coordinates. Firefox cannot reliably
  // hit-test a marker beneath a tiny inverse-scale transform at close zoom.
  const marker=group.classList.contains('boat-marker');
  const transform=`translate(${group.dataset.screenX} ${group.dataset.screenY})${marker?'':` scale(${inverseScale})`}`;
  if(group.getAttribute('transform')!==transform)group.setAttribute('transform',transform);
  if(marker)setAttr(group.boatHitTarget,'r',10*inverseScale);
 }
 if(root===$('mapSurface'))resizeBoatIcons(matrix);
}
function path(points){return points.map((p,i)=>(i?'L':'M')+xy(p).join(',')).join(' ')}
let mapLayout=null,mapCamera=null;
function invalidateMapLayout(){mapLayout=null;mapCamera=null;}
function mapCanvasResolution(rect,requestedRatio=devicePixelRatio||1){
 // Bound both WebGL drawing buffers independently of display density. In
 // particular, track supersampling must not multiply a Retina display's DPR.
 const ratio=Math.min(2,requestedRatio);
 return {pixelWidth:Math.max(1,Math.round(rect.width*ratio)),pixelHeight:Math.max(1,Math.round(rect.height*ratio))};
}
function mapViewport(){
 // The root SVG uses xMidYMid/meet. Derive its projection from the camera and
 // cached CSS layout; never ask SVG to resolve layout for every layer/input.
 const rect=mapLayout||(mapLayout=$('map').getBoundingClientRect());
 const box=$('map').viewBox.baseVal,{x,y,width,height}=box,ratio=devicePixelRatio||1;
 if(!rect.width||!rect.height||!width||!height)return null;
 const key=[x,y,width,height,rect.left,rect.top,rect.width,rect.height,ratio].join(':');
 if(mapCamera?.key===key)return mapCamera;
 setAttr($('mapBase'),'viewBox',`${x} ${y} ${width} ${height}`);
 const scale=Math.min(rect.width/width,rect.height/height);
 const matrix=new DOMMatrix([scale,0,0,scale,rect.left+(rect.width-width*scale)/2-x*scale,rect.top+(rect.height-height*scale)/2-y*scale]);
 const inverse=matrix.inverse();
 const a=new DOMPoint(rect.left,rect.top).matrixTransform(inverse);
 const b=new DOMPoint(rect.right,rect.bottom).matrixTransform(inverse);
 return mapCamera={key,rect,matrix,inverse,topLeft:a,viewBox:[a.x,a.y,b.x-a.x,b.y-a.y],
  ...mapCanvasResolution(rect),
  bounds:{west:9.5+a.x*4.5/1000,east:9.5+b.x*4.5/1000,south:57-b.y*3/1180,north:57-a.y*3/1180}};
}
function visibleMapBounds(){return mapViewport()?.bounds||null;}
function positionMapCanvas(canvas,viewport){
 const {pixelWidth,pixelHeight}=viewport;
 // HTML layers share the SVG's CSS viewport. Camera projection remains in the
 // WebGL shaders, without embedding accelerated canvases inside foreignObject.
 if(canvas.width!==pixelWidth)canvas.width=pixelWidth;if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
}
function mapBoundsIntersect(a,b){return a.east>=b.west&&a.west<=b.east&&a.north>=b.south&&a.south<=b.north;}
// Cache the full geometry in small chunks, then draw only those in the viewport.
// Shared end points keep the detailed coastline continuous at chunk boundaries.
const coastChunks=[];
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
const bridgeChunks=window.SR_BRIDGE_FEATURES.filter(feature=>feature.geometry.type==='LineString'&&!feature.properties.deck_width_metres).map(feature=>{
 const points=feature.geometry.coordinates;let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
 for(const [lon,lat] of points){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
 return {west,east,south,north,points};
});
const bridgeAreaPolygons=window.SR_BRIDGE_FEATURES.filter(feature=>feature.geometry.type==='Polygon').map(feature=>{
 const rings=feature.geometry.coordinates,points=rings.flat();let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
 for(const [lon,lat] of points){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
 return {west,east,south,north,rings,kind:feature.properties.source_kind};
});
const bridgeSupportPolygons=bridgeAreaPolygons.filter(p=>p.kind==='support');
const bridgeDeckPolygons=bridgeAreaPolygons.filter(p=>p.kind==='deck');
for(const polygon of bridgeDeckPolygons)for(const points of polygon.rings)bridgeChunks.push({...polygon,points});
function positionScreenGroup(group,x,y,scale){
 setAttr(group,'data-screen-x',x);setAttr(group,'data-screen-y',y);
 setAttr(group,'transform',`translate(${x} ${y}) scale(${scale})`);
}
let mapCreditKey=null,mapCreditNodes=null,visibleBoatOverlayBounds=null;
function renderMapCredit(){
 const viewport=mapViewport();if(!viewport||mapCreditKey===viewport.key)return;
 mapCreditKey=viewport.key;renderTrackSpeedLegend();
 const {rect,matrix,inverse}=viewport,point=new DOMPoint(rect.right-8,rect.bottom-8).matrixTransform(inverse);
 const {meters,label}=mapScaleLevel(viewport),width=meters*MAP_GRID_UNITS_PER_METER[0]*Math.hypot(matrix.a,matrix.b);
 if(!mapCreditNodes){
  const group=screenGroup(point.x,point.y,$('mapCredit'));
  const scale=el('g',{'data-map-scale':'',role:'img'},group);
  const line=el('path',{fill:'none',stroke:'#173d4c','stroke-width':1.25},scale);
  const text=el('text',{y:-31,'text-anchor':'middle','font-size':10,fill:'#173d4c'},scale);
  el('text',{x:0,y:-10,'text-anchor':'end','font-size':9,fill:'#173d4c'},group).textContent=D.coast_metadata.attribution;
  el('text',{x:0,y:1,'text-anchor':'end','font-size':9,fill:'#173d4c'},group).textContent='openstreetmap.org/copyright';
  mapCreditNodes={group,scale,line,text};
 }
 const {group,scale,line,text}=mapCreditNodes;
 const list=visibleBoatOverlayBounds;
 const covered=list&&list.width>0&&list.left<rect.left+8+width&&list.right>rect.left+8
  &&list.top<rect.bottom-6&&list.bottom>rect.bottom-30;
 const scaleLeft=covered?list.right+8:rect.left+8;
 setAttr(scale,'transform',`translate(${scaleLeft+width-(rect.right-8)} 22)`);
 setAttr(scale,'data-placement',covered?'beside-list':'left');
 positionScreenGroup(group,point.x,point.y,1/Math.hypot(matrix.a,matrix.b));
 setAttr(scale,'data-meters',meters);setAttr(scale,'data-pixel-width',width);setAttr(scale,'aria-label',srText("Målestok: {0}",srText(label)));
 setAttr(line,'d',`M${-width},-27v5H0v-5`);setAttr(text,'x',-width/2);
 if(text.textContent!==srText(label))text.textContent=srText(label);
}
const colours={...window.SR_EVENT.boatStyle.colours};
let followedBoatId=null,timelineDragPointer=null;
const TRACK_STROKE_WIDTH=2.7,TRACK_OUTLINE_WIDTH=4.7;
const featured=new Set(window.SR_EVENT.boatStyle.featured),chosen=new Set();
const boats=D.boats.map(b=>({...b,...boatDetails[b.id],metadata:boatMetadata(b.name)})).sort((a,b)=>(featured.has(b.name)-featured.has(a.name))||a.name.localeCompare(b.name));
const REFERENCE_BOAT_KEY='sr2026-reference-boat';
let referenceBoatId=window.SR_EVENT.defaultReference,referencePreferenceError='';
try{
 const stored=eventStorage.getItem(REFERENCE_BOAT_KEY);
 if(stored!==null){
  if(!boats.some(boat=>boat.id===stored))throw Error(srText('Ugyldig referencebåd.'));
  referenceBoatId=stored;
 }
}catch(error){referencePreferenceError=srText('Referencebåd kunne ikke indlæses: ')+error.message;}
function referenceBoat(){return boats.find(boat=>boat.id===referenceBoatId);}
function syncReferenceBoatControls(){
 const boat=referenceBoat();
 $('referenceBoat').value=boat.id;
 $('referenceBoatHeading').textContent=` / ${boat.name}`;
 $('mapHeading').title=window.SR_EVENT.title+' / '+boat.name;
 for(const option of $('trackStyle').querySelectorAll('option[value="absolute"],option[value="handicap"]')){
  srBind(option,'textContent',()=>srText("Mod {0} · {1}",boat.name,option.value==='absolute'?srText('absolut'):srText('handicap')));
 }
 srBind($('trackStyle').querySelector('option[value="time"]'),'textContent',()=>srText("Mod {0} · tid / 100 m ref.",boat.name));
}
for(const boat of boats){
 const option=document.createElement('option');option.value=boat.id;option.textContent=boat.name;
 $('referenceBoat').append(option);
}
syncReferenceBoatControls();
$('referenceBoat').onchange=async()=>{
 try{if(!await saveReferenceBoat($('referenceBoat').value))syncReferenceBoatControls();}
 catch(error){comparisonMessage(srText('Referencebåden kunne ikke ændres: ')+error.message);syncReferenceBoatControls();}
};
const BOAT_COURSE_NAMES=Object.fromEntries(Object.entries(window.SR_EVENT.courses).map(([id,course])=>[id,course.name]));
function updateBoatCourseOptions(){
 const control=$('boatCourseSelect');
 control.replaceChildren(new Option(srText('Alle baner'),''),...Object.entries(BOAT_COURSE_NAMES).map(([id,name])=>new Option(srText(name),id)));
 control.value=boatCourseFilter;
}
const boatRaceClasses=new Map(Object.keys(BOAT_COURSE_NAMES).map(course=>[course,new Map(boats.filter(b=>b.course===course).map(b=>[b.raceClassId,b.raceClassName]))]));
let boatSearchQuery='',boatFavouritesOnly=false,boatCourseFilter='',boatClassFilter='';
updateBoatCourseOptions();
function validBoatRaceFilters(course,raceClass){
 return (course===''||Object.hasOwn(BOAT_COURSE_NAMES,course))&&typeof raceClass==='string'
  &&(!raceClass||(course?boatRaceClasses.get(course).has(raceClass):[...boatRaceClasses.values()].some(classes=>classes.has(raceClass))));
}
function isBoatSearchActive(){return boatSearchQuery.length>0;}
function isBoatFilterActive(){return boatFavouritesOnly||isBoatSearchActive()||!!boatCourseFilter||!!boatClassFilter;}
function boatIsDisplayed(boat){
 return (!boatCourseFilter||boat.course===boatCourseFilter)&&(!boatClassFilter||boat.raceClassId===boatClassFilter)
  &&(!boatFavouritesOnly||chosen.has(boat.name))&&(!isBoatSearchActive()
  ||[boat.name,boat.skipper,boat.boatType||boat.metadata?.boatType].some(value=>String(value||'').toLocaleLowerCase('da').includes(boatSearchQuery)));
}
function createBoatHeartChoice(boat,className=''){
 const choice=document.createElement('input');choice.type='checkbox';choice.className='boat-heart-choice '+className;choice.value=boat.name;choice.checked=chosen.has(boat.name);
 srBindAttribute(choice,'aria-label',()=>srText('Favorit: {0}',boat.name));choice.onchange=()=>setBoatSelected(boat,choice.checked);
 const heart=el('svg',{class:'boat-heart-icon',width:20,height:20,viewBox:'0 0 24 24','aria-hidden':'true',fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round'});
 el('path',{d:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'},heart);
 return {choice,heart};
}
function syncBoatChoices(){
 for(const input of $('visibleBoatsList').querySelectorAll('input[type=checkbox]'))input.checked=chosen.has(input.value);
}
function setBoatSelected(boat,selected){
 changeBoatSelection(()=>{if(selected)chosen.add(boat.name);else chosen.delete(boat.name);});
}
function setAllBoatsSelected(selected){
 changeBoatSelection(()=>{for(const boat of boats){if(selected)chosen.add(boat.name);else chosen.delete(boat.name);}});
}
// Assign the complete field once, so toggling boats never changes their colours.
for(const [i,name] of [...new Set(boats.map(b=>b.name))].sort().entries()){
 if(!Object.hasOwn(colours,name))colours[name]=`hsl(${((18+i*137.507764)%360).toFixed(3)},78%,${42+i%3*7}%)`;
}
const BOAT_COLOURS_KEY='boat-colour-overrides';
const localBoatColours=JSON.parse(eventStorage.getItem(BOAT_COLOURS_KEY)||'{}');
for(const boat of boats)if(Object.hasOwn(localBoatColours,boat.id)){
 const colour=localBoatColours[boat.id];
 if(!/^#[0-9a-f]{6}$/i.test(colour))throw Error(srText('Ugyldig lokal bådfarve.'));
 colours[boat.name]=colour;
}
for(const [name,lon,lat] of window.SR_EVENT.places){const [x,y]=xy([lon,lat]),group=screenGroup(x,y,$('places'));el('circle',{cx:0,cy:0,r:2,fill:'#173d4c'},group);const n=el('text',{x:4,y:-4,fill:'#173d4c','font-size':11,stroke:'#f4fafb','stroke-width':3,'paint-order':'stroke'},group);n.textContent=name}
// User-supplied mandatory marks; preserve the original decimal minutes.
for(const [id,lon,lat,title] of window.SR_EVENT.marks){
 const [x,y]=xy([lon,lat]),group=screenGroup(x,y,$('seamarks'));
 el('circle',{id,cx:0,cy:0,r:5,fill:'#e02020',stroke:'#ffffff','stroke-width':1},group);
 srBind(el('title',{},group),'textContent',()=>srText(title));
}
function courseLineEndpointLabel(name){
 const numbered=/^Start(-Finish)? ([A-Z])$/.exec(name);
 return numbered?srText(numbered[1]?'Start / mål {0}':'Start {0}',numbered[2]):srText(name);
}
for(const feature of D.course_lines.features){
 const {kind,name,reference_boat,reference_utc}=feature.properties,coordinates=feature.geometry.coordinates;
 const colour=kind==='start'||kind==='start-finish'?'#087b3d':'#c62738';
 const group=el('g',{'data-course-line':kind},$('courseLines'));
 srBind(el('title',{},group),'textContent',()=>`${srText(name)} · TracTrac${reference_boat?` · ${reference_boat}`:''}${reference_utc?srText(' · start {0}',fmt(Date.parse(reference_utc)/1000)):''}`);
 el('path',{d:path(coordinates),fill:'none',stroke:'#ffffff','stroke-width':5,'vector-effect':'non-scaling-stroke'},group);
 el('path',{'data-line-geometry':kind,d:path(coordinates),fill:'none',stroke:colour,'stroke-width':2.5,
  'stroke-dasharray':kind==='finish'?'6 4':'none','vector-effect':'non-scaling-stroke'},group);
 for(const [i,coordinate] of coordinates.entries()){
  const [x,y]=xy(coordinate),marker=screenGroup(x,y,group);
  el('circle',{r:3,fill:colour,stroke:'#ffffff','stroke-width':1},marker);
  srBind(el('title',{},marker),'textContent',()=>courseLineEndpointLabel(feature.properties.endpoints[i].name));
 }
 const [x,y]=xy([(coordinates[0][0]+coordinates[1][0])/2,(coordinates[0][1]+coordinates[1][1])/2]);
 const label=screenGroup(x,y,group);
 srBind(el('text',{x:0,y:-10,'text-anchor':'middle',fill:colour,'font-size':12,'font-weight':750,
  stroke:'#ffffff','stroke-width':3,'paint-order':'stroke'},label),'textContent',()=>srText(name));
}
// Rute T is an open line through the user's waypoints, in the base map layer.
for(const feature of D.route_t.features){
 const line=el('path',{'data-route-id':feature.id,d:path(feature.geometry.coordinates),fill:'none',
  stroke:'#000000','stroke-width':2,'stroke-linejoin':'round','stroke-linecap':'round',
  'vector-effect':'non-scaling-stroke'},$('routeT'));
 srBind(el('title',{},line),'textContent',()=>srText(feature.properties.name)+srText(' · måtte ikke krydses under sejladsen'));
}
let interval=null;

const WIND_MODE_LABELS={off:'Vind slukket',mean:'Middelvind',gust:'Vindpust'};
const WIND_MODES=Object.keys(WIND_MODE_LABELS);
let windMode='off',rainEnabled=false;
function nextWindMode(){return WIND_MODES[(WIND_MODES.indexOf(windMode)+1)%WIND_MODES.length];}
function setWindMode(mode){
 windMode=mode;$('wind').dataset.mode=mode;updateWeatherButtonLabels();
}
function setRainEnabled(enabled){
 rainEnabled=enabled;setAttr($('rain'),'aria-pressed',String(enabled));
}
let radarKey=null,radarStatus='indlæser …',radarReady=Promise.resolve();
const radarImageBuffer=new WeatherImageBuffer('radarImage');
function prepareNextRadar(time){
 const next=nextWeatherTime(time,WEATHER_RADAR_INTERVAL);if(next===null)return;
 const frame=D.radar?.frames.find(f=>f.time>=next);
 if(frame)radarImageBuffer.prepare(String(frame.time),()=>frame.file);
}
function renderRadar(time){
 const t=Math.floor(time/WEATHER_RADAR_INTERVAL)*WEATHER_RADAR_INTERVAL;
 const enabled=rainEnabled,key=`${t}:${enabled}`;
 if(key===radarKey){if(enabled&&radarImageBuffer.front?.key===String(t))prepareNextRadar(time);return;}
 radarKey=key;
 const rainPeriod=$('rainPeriod');
 srBind(rainPeriod,'textContent',()=>'');
 if(!enabled){radarImageBuffer.hide();radarReady=Promise.resolve();radarStatus='slået fra';return;}
 const frame=D.radar?.frames.find(f=>f.time===t);
 if(!frame){radarImageBuffer.hide();radarReady=Promise.resolve();radarStatus='mangler';srBind(rainPeriod,'textContent',()=>srText('Nedbørsdata mangler ved {0}',fmt(t)));prepareNextRadar(time);return;}
 const finish=()=>{
  radarStatus='klar';prepareNextRadar(time);
 };
 const entry=radarImageBuffer.prepare(String(t),()=>frame.file,true);
 if(radarImageBuffer.display(String(t))){radarReady=Promise.resolve();finish();return;}
 // Keep the previous frame on screen while an unanticipated seek loads.
 radarStatus='indlæser …';
 radarReady=entry.promise.then(()=>{
  if(key!==radarKey)return;
  if(entry.error){radarStatus='kunne ikke indlæses';srBind(rainPeriod,'textContent',()=>srText('Nedbørsdata kunne ikke indlæses ved {0}',fmt(t)));return;}
  if(radarImageBuffer.display(String(t)))finish();
 });
}

const WIND_UNIT_KEY='sr-wind-unit',windUnitSelect=$('windUnit');
let windUnit='kn';
try{if(localStorage.getItem(WIND_UNIT_KEY)==='m/s')windUnit='m/s';}catch{}
windUnitSelect.value=windUnit;
function windSpeedNumber(knots){
 const value=windUnit==='m/s'?knots*WIND_KNOT_TO_MS:knots;
 return value.toLocaleString(srLocale,{minimumFractionDigits:1,maximumFractionDigits:1});
}
function refreshWindSelection(){renderWindSelection(currentTime());}
windUnitSelect.onchange=()=>{
 windUnit=windUnitSelect.value;
 try{localStorage.setItem(WIND_UNIT_KEY,windUnit);}catch{}
 refreshWindSelection();
};
srOnLanguageChange(refreshWindSelection);

function renderWindAvailability(t){
 const hour=Math.floor(t/3600)*3600;
 const missing=windMode!=='off'&&!windBarbGrid?.frames.has(hour);
 setBoatListText($('windPeriod'),missing?srText('Vinddata mangler ved {0}',fmt(hour)):'');
}
const WIND_BARB_SPACING=90;
const windBarbGrid=window.SR_EVENT.features.weather?prepareWindBarbGrid(D.wind_models[WIND_MODEL]):null;
let windSelection=null;
function closeWindSelection(){
 if(!windSelection)return;
 windSelection=null;setAttr($('windSelection'),'visibility','hidden');
}
function chooseWind(e){
 const viewport=mapViewport();if(!viewport)return;
 const {x,y}=new DOMPoint(e.clientX,e.clientY).matrixTransform(viewport.inverse);
 windSelection={x,y};
 if(pickedTrackSpeed)closeTrackSpeedSelection();
 stopPlayback();renderWindSelection(currentTime());
}
function renderWindSelection(t){
 if(!windSelection)return;
 if(windMode==='off'){closeWindSelection();return;}
 const layer=$('windSelection'),viewport=mapViewport();
 if(!viewport)return;
 const {rect,matrix}=viewport,{x,y}=windSelection;
 const screen=new DOMPoint(x,y).matrixTransform(matrix);
 const visible=screen.x>=rect.left&&screen.x<=rect.right&&screen.y>=rect.top&&screen.y<=rect.bottom;
 setAttr(layer,'visibility',visible?'visible':'hidden');
 if(!visible)return;
 setAttr(layer,'transform',`translate(${x} ${y}) scale(${1/matrix.a})`);
 const text=$('windSelectionText'),hour=Math.floor(t/3600)*3600;
 if(windSelection.hour!==hour||windSelection.mode!==windMode){
  const frame=windBarbGrid?.frames.get(hour),lon=9.5+x*4.5/1000,lat=57-y*3/1180;
  windSelection.sample=frame?windBarbAt(windBarbGrid,frame,lon,lat,Math.cos(lat*Math.PI/180),windMode):null;
  windSelection.hour=hour;windSelection.mode=windMode;windSelection.locale=null;
 }
 if(windSelection.locale!==srLocale||windSelection.unit!==windUnit){
  const sample=windSelection.sample;
  if(!sample)text.textContent=srText('Vinddata mangler her');
  else{
   const speed=srText(windUnit==='m/s'?'{0} m/s':'{0} kn',windSpeedNumber(sample.knots));
   const label=srText(WIND_MODE_LABELS[windMode]);
   text.textContent=sample.direction!==null?srText('{0} {1} · fra {2}°',label,speed,(Math.round(sample.direction)+360)%360):
    sample.knots<1e-9?srText('Vindstille · {0}',speed):srText('{0} {1} · retning mangler',label,speed);
  }
  windSelection.width=text.getComputedTextLength();windSelection.locale=srLocale;windSelection.unit=windUnit;
 }
 const left=screen.x+windSelection.width+12>rect.right;
 setAttr(text,'x',left?-8:8);setAttr(text,'text-anchor',left?'end':'start');
 setAttr(text,'y',screen.y-20<rect.top?18:-9);
}
let windBarbKey=null;
function renderWindBarbs(t=currentTime()){
 renderWindSelection(t);
 const layer=$('winds'),hour=Math.floor(t/3600)*3600;
 const frame=windMode!=='off'?windBarbGrid?.frames.get(hour):null;
 if(!frame){setAttr(layer,'visibility','hidden');return;}
 const viewport=mapViewport();if(!viewport)return;
 setAttr(layer,'visibility','visible');
 const key=windMode+':'+hour+':'+viewport.key;
 if(key===windBarbKey)return;
 windBarbKey=key;
 const {rect,topLeft,matrix}=viewport,scale=1/matrix.a;
 // Undo the map camera once for the layer. Each retained path is in CSS pixels.
 setAttr(layer,'transform',`translate(${topLeft.x} ${topLeft.y}) scale(${scale})`);
 let index=0;
 for(let sy=WIND_BARB_SPACING/2;sy<rect.height;sy+=WIND_BARB_SPACING){
  const lat=57-(topLeft.y+sy*scale)*3/1180,lonScale=Math.cos(lat*Math.PI/180);
  for(let sx=WIND_BARB_SPACING/2;sx<rect.width;sx+=WIND_BARB_SPACING){
   const lon=9.5+(topLeft.x+sx*scale)*4.5/1000;
   const barb=windBarbAt(windBarbGrid,frame,lon,lat,lonScale,windMode);
   if(!barb||barb.band&&barb.direction===null)continue;
   const symbol=layer.children[index++]||el('path',{class:'wind-barb'},layer);
   setAttr(symbol,'d',barb.d);
   setAttr(symbol,'fill',barb.band?'currentColor':'none');
   setAttr(symbol,'transform',`translate(${sx} ${sy}) rotate(${barb.band?Math.round(barb.direction):0})`);
  }
 }
 while(layer.children.length>index)layer.lastElementChild.remove();
}
// Keep state changes synchronous, but combine UI paint requests until the next
// browser frame. Full redraws subsume viewport-only redraws, in either order.
let viewerModulesReady=false;
let renderRequest=null,renderRequestKind=null;
const RENDER_PRIORITY={background:1,viewport:2,full:3};
function requestRender({viewportOnly=false,backgroundOnly=false}={}){
 const kind=backgroundOnly?'background':viewportOnly?'viewport':'full';
 if(!renderRequestKind||RENDER_PRIORITY[kind]>RENDER_PRIORITY[renderRequestKind])renderRequestKind=kind;
 if(viewerModulesReady&&renderRequest===null)renderRequest=requestAnimationFrame(flushRender);
}
function consumeRenderRequest(){
 if(renderRequest!==null)cancelAnimationFrame(renderRequest);
 const kind=renderRequestKind;renderRequest=null;renderRequestKind=null;return kind;
}
function flushRender(){
 if(!viewerModulesReady)return;
 const kind=consumeRenderRequest();
 if(kind==='full')drawMap();else if(kind==='viewport')drawViewport();else if(kind==='background')webglBackground.render();
}
// Retain an immediate path for exports, scene restoration and programmatic use.
function render(){if(!viewerModulesReady){requestRender();return;}consumeRenderRequest();drawMap();}
function drawMap(){if(hasRenderingFailure())return;if(followedBoatId&&centerViewOnBoat(boats.find(boat=>boat.id===followedBoatId)))setview();const t=currentTime();$('clock').textContent=fmt(t);$('clock').dateTime=new Date(t*1000).toISOString();renderRadar(t);webglBackground.render();renderWindAvailability(t);renderWindBarbs(t);renderTraffic();renderMilitary();
 renderTracks(t,{includeSpeedPins:false});
 renderAnnotations();
 renderNavigation();
 if(!SIMPLE_IPHONE_TRACKS)renderBoatCompare();
 renderMapCredit();
}
function drawViewport(){
 if(hasRenderingFailure())return;webglBackground.render();renderWindBarbs();renderTraffic();renderMilitary();webglTracks.redraw();resizeSymbols();renderSpeedPins();renderNoteDrawings();
 layoutVisibleBoats();if(!SIMPLE_IPHONE_TRACKS)renderBoatCompare();renderMapCredit();
}
const boatMarkerNodes=new Map();
function updateBoatMarkerLabel({boat,group,title,lastPosition:position,lastTime:time}){
 setAttr(group,'aria-label',srText('Vis {0} i bådlisten',boat.name));
 const description=`${boat.name} · ${handicapTracksEnabled?srText('handicapkompenseret position · oprindeligt spor ved ')+fmt(position.replayTime):position.interpolated?srText('interpoleret position ved ')+fmt(time):srText('måling fra ')+fmt(position.sourceTime)}`;
 if(title.textContent!==description)title.textContent=description;
}

function renderTracks(t=currentTime(),{includeSpeedPins=true}={}){
 clearTrackHover();
 const markerLayer=$('boatMarkers');
 const drawingOrder=boats.filter(boatIsDisplayed).sort((a,b)=>(referenceBoatId===a.id)-(referenceBoatId===b.id));
 if(!webglTracks.render(t,drawingOrder))return;
 syncHandicapTracks();
 const active=new Set();let previous=null,markerTopologyChanged=false;
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
  const {wrapper,group,icon}=record;
  setAttr(group,'data-screen-x',x);setAttr(group,'data-screen-y',y);setAttr(group,'data-source-time',position.replayTime);
  if(handicapTracksEnabled)setAttr(group,'data-handicap-compensated','true');else group.removeAttribute('data-handicap-compensated');
  if(position.finished)setAttr(group,'data-handicap-finished','true');else group.removeAttribute('data-handicap-finished');
  setAttr(group,'role','button');setAttr(group,'tabindex','0');
  record.lastPosition=position;record.lastTime=t;
  updateBoatMarkerLabel(record);
  setAttr(icon.querySelector('.boat-hull'),'fill',color);
  if(record.name)setAttr(record.name,'fill',color);
  setAttr(icon,'data-lat',position.point[1]);setAttr(icon,'data-course',boatCourse(b.points,position.replayTime));
  if(!record.name){
   record.name=el('text',{class:'boat-name','pointer-events':'none',x:7,y:(window.SR_EVENT.boatStyle.labelOffsets[b.name]??3),fill:color,
    'font-size':12,'font-weight':700,stroke:'#14212a','stroke-width':3,'paint-order':'stroke'},record.symbols);
   record.name.textContent=b.name;
  }
  const next=previous?previous.nextElementSibling:markerLayer.firstElementChild;
  if(next!==wrapper){markerLayer.insertBefore(wrapper,next);markerTopologyChanged=true;}previous=wrapper;
 }
 for(const [id,record] of boatMarkerNodes)if(!active.has(id)){
  if(record.wrapper.parentNode)markerTopologyChanged=true;
  record.wrapper.remove();
  if(!boats.includes(record.boat))boatMarkerNodes.delete(id);
 }
 resizeSymbols();if(includeSpeedPins)renderSpeedPins();updateVisibleBoats(t);
 if(markerTopologyChanged)scheduleBoatHoverRefresh();
}
function step(n){syncTimelineViewport();if(finishEventEditing()&&!$('time').disabled){stopPlayback();leaveOpenedEvent();setCurrentTime(timeAtOffset(+$('time').value+n));requestRender()}}
function setMapTracksExpanded(expanded){
 $('mapTracksPanel').hidden=!expanded;
 $('mapTracksToggle').setAttribute('aria-expanded',String(expanded));
}
$('mapTracksToggle').onclick=()=>setMapTracksExpanded($('mapTracksPanel').hidden);
document.addEventListener('pointerdown',event=>{
 if(!$('mapTracks').contains(event.target))setMapTracksExpanded(false);
});
document.addEventListener('keydown',event=>{
 if(document.querySelector('dialog[open]'))return;
 if(event.key==='Escape'&&!$('mapTracksPanel').hidden){
  event.preventDefault();event.stopImmediatePropagation();setMapTracksExpanded(false);$('mapTracksToggle').focus();
 }
},true);
// Advance from elapsed wall time, retaining fractions for smooth motion at 1x.
let playbackTickTime=0,playbackRate=+$('playbackSpeed').value,eventPlaybackTarget=null;
function syncPlaybackControls(){
 const playing=interval!==null,label=playing?srText('Pause'):srText('Afspil'),speed=$('playbackSpeed'),index=speed.selectedIndex;
 $('play').setAttribute('aria-label',label);$('play').title=label;
 $('playIcon').toggleAttribute('hidden',playing);$('pauseIcon').toggleAttribute('hidden',!playing);
 $('back').disabled=index<=0;$('next').disabled=index>=speed.options.length-1;
 srBind($('back'),'title',()=>index>0?srText('Lavere hastighed: ')+speed.options[index-1].textContent:srText('Laveste hastighed: ')+speed.options[0].textContent);
 srBind($('next'),'title',()=>index<speed.options.length-1?srText('Højere hastighed: ')+speed.options[index+1].textContent:srText('Højeste hastighed: ')+speed.options[index].textContent);
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
function centerViewOnBoat(boat){
 if(timelineDragPointer!==null)return false;
 const position=boat&&displayBoatPosition(boat,currentTime());
 if(!position)return false;
 const [x,y]=xy(position.point),left=x-view[2]/2,top=y-view[3]/2;
 if(view[0]===left&&view[1]===top)return false;
 view=[left,top,view[2],view[3]];return true;
}
function followBoatOnMap(id){
 followedBoatId=id;
 if(centerViewOnBoat(boats.find(boat=>boat.id===id)))setview();
 if(typeof openedEvent!=='undefined'&&openedEvent){followedScene=true;updateEventSceneControls();}
}
function centerPlaybackOnReferenceBoat(){
 if(centerViewOnBoat(referenceBoat()))setview();
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
 setCurrentTime(Math.min(end,nextTime),{fractional:true,crossedEvents:!target,allowOutsideVisibleRanges:true,preservePlaybackGates:true});
 if(target)centerPlaybackOnReferenceBoat();
 requestRender();
 if(nextTime>=end)stopPlayback();
}
function startPlayback({target=null}={}){
 if(interval!==null||hasRenderingFailure())return;
 if((!target&&currentTime()>=viewerEndTime())||!finishEventEditing())return;
 leaveOpenedEvent();if(target)followedBoatId=null;
 prepareSelectedTracks();
 if(playbackGateMeasurement===null){
  const points=currentGateMeasurement().map(point=>[...point]);
  playbackGateMeasurement={points,event:gateOverride?null:currentMapEvent()};
 }
 eventPlaybackTarget=target;
 playbackRate=+$('playbackSpeed').value;playbackTickTime=performance.now();
 $('play').disabled=false;interval=setInterval(()=>advancePlayback(performance.now()),50);syncPlaybackControls();
 if(target)centerPlaybackOnReferenceBoat();
 updatePresentationControls();
}
$('play').onclick=()=>{
 if(interval){stopPlayback();return;}
 startPlayback();
};
$('playbackSpeed').onchange=updatePlaybackSpeed;
let view=[...window.SR_EVENT.initialView];
function setview(){
 if(followedBoatId)centerViewOnBoat(boats.find(boat=>boat.id===followedBoatId));
 setAttr($('map'),'viewBox',view.join(' '));
 scheduleBoatHoverRefresh();
 invalidateTimelineViewport();requestRender({viewportOnly:true});
}
function changeMapView(next){
 view=next;setview();markEventCameraChange();
}
const MIN_MAP_VIEW_WIDTH=.05,MAX_MAP_VIEW_WIDTH=1800;
$('map').addEventListener('wheel',e=>{e.preventDefault();if(drawingGesture||navigationGesture||(!e.deltaY&&!e.deltaX))return;const f=Math.max(MIN_MAP_VIEW_WIDTH,Math.min(MAX_MAP_VIEW_WIDTH,view[2]*((e.deltaY||e.deltaX)>0?1.15:1/1.15)))/view[2];if(f===1)return;const anchor=new DOMPoint(e.clientX,e.clientY).matrixTransform(mapViewport().inverse);changeMapView([anchor.x+(view[0]-anchor.x)*f,anchor.y+(view[1]-anchor.y)*f,view[2]*f,view[3]*f])},{passive:false});
let drag=null;
const map=$('map');
// The map owns the gesture, including when it starts on SVG text or an image.
// Native text selection and image dragging can otherwise cancel pointer events.
map.ondragstart=e=>e.preventDefault();
function rebaseMapGesture(){
 const points=[...drag.pointers.values()];
 drag.view=[...view];drag.inverse=mapViewport().inverse;
 drag.pointerId=drag.pointers.keys().next().value;
 drag.x=points.reduce((sum,p)=>sum+p.x,0)/points.length;
 drag.y=points.reduce((sum,p)=>sum+p.y,0)/points.length;
 drag.distance=points.length===2?Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y):0;
}
map.onpointerdown=e=>{
 if(e.button!==0)return;
 // A new primary touch starts a new contact sequence. Any retained fingers
 // belong to an interrupted sequence whose final event never reached us.
 if(e.pointerType==='touch'&&e.isPrimary)cancelPan();
 if(drag){
  if(e.pointerType!=='touch'||drag.pointerType!=='touch'||drag.pointers.size!==1||drag.pointers.has(e.pointerId))return;
  e.preventDefault();drag.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag.moved=true;
  rebaseMapGesture();map.setPointerCapture(e.pointerId);return;
 }
 clearTrackHover();
 if(beginNavigationGesture(e)||beginDrawingGesture(e)){closeWindSelection();return;}
 followedBoatId=null;
 e.preventDefault();
 drag={pointerId:e.pointerId,pointerType:e.pointerType,pointers:new Map([[e.pointerId,{x:e.clientX,y:e.clientY}]]),
  x:e.clientX,y:e.clientY,view:[...view],event:openedEvent,
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
 if(moveNavigationGesture(e))return;
 if(moveDrawingGesture(e))return;
 if(!drag){updateTrackHover(e);return;}
 if(!drag.pointers.has(e.pointerId))return;
 e.preventDefault();
 drag.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(drag.pointers.size===2){
  const [a,b]=[...drag.pointers.values()],distance=Math.hypot(b.x-a.x,b.y-a.y);
  if(!drag.distance||!distance){rebaseMapGesture();return;}
  const factor=Math.max(MIN_MAP_VIEW_WIDTH,Math.min(MAX_MAP_VIEW_WIDTH,drag.view[2]*drag.distance/distance))/drag.view[2];
  const anchor=new DOMPoint(drag.x,drag.y).matrixTransform(drag.inverse);
  const center=new DOMPoint((a.x+b.x)/2,(a.y+b.y)/2).matrixTransform(drag.inverse);
  // Only distance and midpoint affect the camera; finger angle never rotates it.
  view=[anchor.x+(drag.view[0]-center.x)*factor,anchor.y+(drag.view[1]-center.y)*factor,drag.view[2]*factor,drag.view[3]*factor];
  // Consume each movement, including clamped zoom. Reversing direction must
  // respond immediately instead of undoing an accumulated distance overshoot.
  setview();rebaseMapGesture();return;
 }
 const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(Math.hypot(dx,dy)>4)drag.moved=true;
 if(!drag.moved)return;
 const delta=new DOMPoint(dx,dy).matrixTransform(new DOMMatrix([
  drag.inverse.a,drag.inverse.b,drag.inverse.c,drag.inverse.d,0,0]));
 view=[drag.view[0]-delta.x,drag.view[1]-delta.y,drag.view[2],drag.view[3]];
 setview();
};
function endPan(e){
 if(endNavigationGesture(e))return;
 if(endDrawingGesture(e))return;
 if(!drag||!drag.pointers.has(e.pointerId))return;
 drag.pointers.delete(e.pointerId);
 if(drag.pointers.size){
  drag.moved=true;rebaseMapGesture();
  if(map.hasPointerCapture(e.pointerId))map.releasePointerCapture(e.pointerId);
  return;
 }
 const click=e.type==='pointerup'&&!drag.moved,{boatId,noteIndex,trackBoatId,speedKey,speedAction}=drag;
 if(drag.moved&&drag.event===openedEvent)markEventCameraChange();
 drag=null;map.classList.remove('panning');
 if(map.hasPointerCapture(e.pointerId))map.releasePointerCapture(e.pointerId);
 if(click){
  if(windMode==='off'||navigationMode==='route'||placingNote||noteIndex!==undefined||speedKey!==undefined||boatId)closeWindSelection();
  if(navigationMode==='route')addNavigationPoint(e);
  else if(placingNote)placeAnnotation(e);
  else if(noteIndex!==undefined)beginNoteEditing(notes[+noteIndex]);
  else if(speedKey!==undefined)handleSpeedPinClick(speedAction,speedKey);
  else if(boatId)focusBoatInList(boatId);
  else if(windMode!=='off')chooseWind(e);
  else if(trackBoatId)chooseTrackSpeed(e,trackBoatId);
  else chooseTrackSpeed(e);
 }
}
map.onpointerup=endPan;
map.onpointercancel=endPan;
map.onlostpointercapture=endPan;
map.onpointerleave=()=>clearTrackHover();
function cancelPan(){
 if(!drag)return;
 for(const pointerId of [...drag.pointers.keys()])endPan({type:'pointercancel',pointerId});
}
window.addEventListener('blur',cancelPan);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelPan();});
window.addEventListener('scroll',event=>{if(event.target!==document)return;invalidateMapLayout();requestRender({viewportOnly:true});},true);
map.addEventListener('keydown',e=>{
 const marker=e.target.closest('[data-boat-marker]');
 if(marker&&(e.key==='Enter'||e.key===' ')){
  e.preventDefault();e.stopPropagation();focusBoatInList(marker.dataset.boatMarker);return;
 }
 const speedMarker=e.target.closest('[data-speed-key]');
 if(speedMarker&&(e.key==='Enter'||e.key===' ')){
  e.preventDefault();e.stopPropagation();handleSpeedPinClick(e.target.closest('[data-speed-action]')?.dataset.speedAction,speedMarker.dataset.speedKey);return;
 }

});

$('map').setAttribute('viewBox',window.SR_EVENT.initialView.join(' '));
$('mapBase').setAttribute('viewBox',window.SR_EVENT.initialView.join(' '));
const weatherAvailable=window.SR_EVENT.features.weather;
for(const id of ['wind','rain'])$(id).disabled=!weatherAvailable;
function updateWeatherButtonLabels(){
 setAttr($('wind'),'aria-label',srText(WIND_MODE_LABELS[windMode]));
 setAttr($('wind'),'title',weatherAvailable?srText('Skift til {0}',srText(WIND_MODE_LABELS[nextWindMode()])):srText('Vejrdata er ikke importeret for dette stævne'));
 setAttr($('rain'),'title',srText(weatherAvailable?'Nedbørsradar':'Vejrdata er ikke importeret for dette stævne'));
}
updateWeatherButtonLabels();srOnLanguageChange(updateWeatherButtonLabels);
$('wind').onclick=()=>{setWindMode(nextWindMode());updateEventSceneControls();requestRender();};
$('rain').onclick=()=>{setRainEnabled(!rainEnabled);updateEventSceneControls();requestRender();};

let sceneOverlays={...window.SR_EVENT.layers,annotationsVisible:true};
