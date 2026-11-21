const viewerTestContext=require('./viewer-test-locale.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{test}=require('node:test');
const catalog=JSON.parse(fs.readFileSync('viewer/events/catalog.json','utf8'));
const bridgeData=JSON.parse(fs.readFileSync('viewer/bridges.geojson','utf8'));
const configs=new Map(catalog.events.map(e=>[e.id,e]));
function storage(){const values={};Object.defineProperties(values,{getItem:{value:k=>values[k]??null},setItem:{value:(k,v)=>{values[k]=String(v);}},removeItem:{value:k=>{delete values[k];}}});return values;}
async function load(id,shared){
 const select={replaceChildren(){},value:''},location={href:'http://localhost/events/'+id+'/',search:''};
 const context=viewerTestContext({URL,URLSearchParams,Option:class{},window:{},localStorage:shared,location,noteNavigationAllowed:()=>true,document:{baseURI:'http://localhost/',querySelector:()=>({}),documentElement:{dataset:{eventId:id}},title:'',getElementById:key=>key==='eventSelect'?select:{firstChild:{textContent:''},textContent:''}},fetch:async file=>({ok:true,json:async()=>file==='events/catalog.json'?catalog:bridgeData})});
 vm.runInContext(fs.readFileSync('viewer/event-selection.js','utf8'),context);await context.loadEventSelection();return {context,select,location};
}
test('stævner isolate storage and explicitly migrate existing Sjælland Rundt annotations',async()=>{
 const shared=storage();shared.setItem('sr2026-notes','existing events');
 const sj=await load(catalog.default,shared),silver=await load('silverrudder-2025',shared);
 assert.equal(vm.runInContext("eventStorage.getItem('sr2026-notes')",sj.context),'existing events');
 assert.equal(vm.runInContext("eventStorage.getItem('sr2026-notes')",silver.context),null);
 vm.runInContext("eventStorage.setItem('sr2026-notes','silver notes')",silver.context);
 assert.equal(vm.runInContext("eventStorage.getItem('sr2026-notes')",sj.context),'existing events');
 sj.select.value='silverrudder-2025';sj.select.onchange();assert.equal(new URL(sj.location.href).pathname,'/events/silverrudder-2025/');
 assert.equal(shared.getItem('sr2026-notes'),'existing events');
});
test('Silverrudder merges seven source races on one course, with distinct starts and one overlay',()=>{
 const event=configs.get('silverrudder-2025');assert.equal(event.source.races.length,7);assert.equal(Object.keys(event.courses).length,1);
 assert.equal(new Set(event.source.races.map(r=>r.id)).size,7);assert.equal(new Set(event.source.races.map(r=>r.start)).size,7);
 assert.equal(event.features.handicap,false);
 for(const item of configs.values()){assert.equal(item.profileRoot,'events/'+item.id+'/track-profiles/');assert.ok(fs.existsSync(item.nativeFile));assert.ok(fs.existsSync(item.presentationFile));}
});
test('Silverrudder loads complete weather with its own radar source and asset paths',async()=>{
 const source=fs.readFileSync('viewer/weather.js','utf8');
 const implementation=source.slice(source.indexOf('const WIND_MODEL='));
 for(const [year,radar,count] of [[2024,'OPERA',328],[2025,'OPERA',290],[2026,'DMI',241]]){
  const {context}=await load('silverrudder-'+year,storage()),event=context.window.SR_EVENT;
  assert.equal(event.features.weather,true);
  assert.equal(event.weather.radar,radar);
  vm.runInContext(implementation,context);
  const manifest=JSON.parse(fs.readFileSync('viewer/'+event.weather.file,'utf8'));
  context.fetch=async file=>{
   assert.equal(file,event.weather.file);
   return {ok:true,json:async()=>manifest};
  };
  const data={};await context.loadEventWeather(event,data);
  assert.equal(data.radar.source,radar);
  assert.equal(data.radar.frames.length,count);
  const points=data.wind_models.dmi_harmonie_arome_europe;
  const barbs=context.prepareWindBarbFrames(points,p=>p).get(points[0].hourly.time[0]);
  assert.equal(barbs.length,247);
  assert.equal(barbs[0].direction,points[0].hourly.wind_direction_10m[0]);
  for(const frame of data.radar.frames)assert.ok(fs.existsSync('viewer/'+frame.file),frame.file);
  const incomplete={...manifest,radar:{...manifest.radar,frames:manifest.radar.frames.slice(1)}};
  assert.throws(()=>context.validateWeatherAssets(incomplete,event),/ufuldstændige vejrdata/);
 }
 const {context}=await load(catalog.default,storage());
 assert.equal(context.window.SR_EVENT.weather.embedded,true);
 assert.equal(context.window.SR_EVENT.weather.radar,'DMI');
});

test('wind barbs round to five knots and use the traditional calm, feather and pennant shapes',()=>{
 const context=viewerTestContext({}),source=fs.readFileSync('viewer/weather.js','utf8');
 vm.runInContext(source,context);
 const shape=knots=>context.windBarbPath(knots);
 assert.equal(shape(2.49).calm,true);
 assert.equal(shape(2.5).d,'M0 0V-26M0 -22L5 -24.5');
 assert.equal(shape(10).d,'M0 0V-26M0 -26L10 -31');
 assert.equal(shape(65).d,'M0 0V-26M0 -26H10L0 -20ZM0 -20L10 -25M0 -16L5 -18.5');
 const hourly={time:[0,3600],wind_speed_10m:[10*1852/3600,0],wind_direction_10m:[90,null]};
 const frames=context.prepareWindBarbFrames([{longitude:9.508,latitude:54.007,hourly}],p=>p);
 assert.equal(frames.get(0)[0].direction,90);
 assert.ok(Math.abs(frames.get(0)[0].knots-10)<1e-10);
 assert.equal(frames.get(3600)[0].glyph.calm,true);
});

test('an unknown stævne produces an explicit error',async()=>{await assert.rejects(load('unknown',storage()),/Ukendt/);});

test('event links preserve deployment prefixes in both public and admin pages',async()=>{
 const {context}=await load(catalog.default,storage());
 for(const base of ['https://example.com/repo/','https://admin.example.com/admin/']){
  context.document.baseURI=base;
  for(const event of catalog.events)assert.equal(vm.runInContext(`eventURL(${JSON.stringify(event.id)}).href`,context),base+'events/'+event.id+'/');
 }
});
test('renamed admin paths retain existing drafts without overwriting current drafts',async()=>{
 const values=storage(),prefix='sr-event:'+catalog.default+':';
 values.setItem(prefix+'sr2026-draft:/admin/:user','old draft');
 await load(catalog.default,values);
 assert.equal(values.getItem(prefix+'sr2026-draft:admin:user'),'old draft');
 values.setItem(prefix+'sr2026-draft:admin:user','new draft');
 await load(catalog.default,values);
 assert.equal(values.getItem(prefix+'sr2026-draft:admin:user'),'new draft');
});
test('static event shells share a template and resolve their assets at the site root',()=>{
 const {execFileSync}=require('node:child_process');
 const output=execFileSync(process.platform==='win32'?'python':'python3',['-c',"import sys,json;sys.path.insert(0,'scripts');from event_config import load_catalog,tracker_html;print(json.dumps({e['id']:tracker_html(e['id']) for e in load_catalog()['events']}))"],{encoding:'utf8',windowsHide:true});
 for(const [id,html] of Object.entries(JSON.parse(output))){
  assert.ok(html.includes('data-event-id="'+id+'"'));assert.ok(html.includes('<base href="../../">'));
  const base=new URL('../../','https://example.com/repo/events/'+id+'/');
  assert.equal(new URL('boot.js',base).href,'https://example.com/repo/boot.js');
 }
 const landing=fs.readFileSync('viewer/index.html','utf8');
 assert.ok(landing.includes('landing.js'));assert.ok(!landing.includes('boot.js'));
});

test('landing builds event cards without loading tracks and redirects old explicit links',async()=>{
 for(const search of ['', '?event=silverrudder-2025']){
  const nodes=new Map(),make=()=>({children:[],append(...items){this.children.push(...items);},setAttribute(){}});
  const document={baseURI:'https://example.com/repo/',getElementById:id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);},createElement:make};
  const calls=[],location={search,replace(url){this.redirect=url;}};
  const context=viewerTestContext({document,location,URL,URLSearchParams,fetch:async url=>{calls.push(url);return {ok:true,json:async()=>catalog};}});
  vm.runInContext(fs.readFileSync('viewer/event-selection.js','utf8'),context);
  await vm.runInContext(fs.readFileSync('viewer/landing.js','utf8'),context);
  assert.deepEqual(calls,['events/catalog.json']);
  if(search)assert.equal(location.redirect,'https://example.com/repo/events/silverrudder-2025/');
  else assert.equal(nodes.get('eventCards').children.length,catalog.events.length);
 }
});

test('Silverrudder editions reuse map and route but isolate data and presentations',()=>{
 const base=configs.get('silverrudder-2025');
 for(const id of ['silverrudder-2024','silverrudder-2026']){
  const event=configs.get(id);
  assert.equal(event.backgroundFile,base.backgroundFile);assert.deepEqual(event.courses,base.courses);assert.deepEqual(event.marks,base.marks);
  assert.notEqual(event.nativeFile,base.nativeFile);assert.notEqual(event.presentationFile,base.presentationFile);
  assert.equal(event.source.courseLines,'shared');assert.ok(event.boatStyle.featured.length>0);
  assert.equal(event.boatStyle.featuredModelPattern,base.boatStyle.featuredModelPattern);
 }
 const combined=configs.get('silverrudder-2026');
 assert.equal(combined.source.grouping,'classes');assert.equal(combined.source.races.length,1);
 assert.equal(combined.source.races[0].classes.length,7);
 assert.equal(new Set(combined.source.races[0].classes.map(c=>c.start)).size,7);
 assert.equal(configs.get('silverrudder-2024').source.races.length,7);
 const matches=new RegExp(base.boatStyle.featuredModelPattern,'i');
 for(const model of ['Seascape 27','Seascape 27/First 27','First 27SE','BENETEAU First 27 SE'])assert.ok(matches.test(model),model);
 for(const model of ['First 27.7','Seascape 24','First 24 SE'])assert.ok(!matches.test(model),model);
});

test('bridge geometry is selected per event and preserves all requested crossings',async()=>{
 const common=['storebaelt-east','storebaelt-west'];
 for(const event of catalog.events){
  const {context}=await load(event.id,storage());
  const groups=[...new Set(context.window.SR_BRIDGE_FEATURES.map(f=>f.properties.bridge))];
  for(const id of common)assert.ok(groups.includes(id));
  if(event.id.startsWith('silverrudder-')){
   assert.equal(groups.length,5);
   for(const id of ['lillebaelt-old','lillebaelt-new','svendborgsund'])assert.ok(groups.includes(id));
   assert.ok(!groups.includes('faroe-north'));
  }else{
   for(const id of ['storstroem-old','storstroem-new','masnedsund','faroe-north','faroe-south','guldborg','frederik-ix'])assert.ok(groups.includes(id));
   assert.ok(!groups.includes('svendborgsund'));
  }
 }
 const {context}=await load(catalog.default,storage());
 context.fetch=async()=>({ok:false,status:404});
 await assert.rejects(context.loadEventBridgeFeatures(catalog,catalog.default),/404/);
 context.fetch=async()=>({ok:true,json:async()=>({type:'FeatureCollection',features:[]})});
 await assert.rejects(context.loadEventBridgeFeatures(catalog,catalog.default),/mangler geometri/);
});


test('bridge supports retain real closed OSM footprints and use the event bridge selection',async()=>{
 const earcut=require('../viewer/vendor/earcut.js');
 const supports=bridgeData.features.filter(f=>f.properties.source_kind==='support'&&!f.properties.approximate);
 assert.equal(supports.length,12);
 for(const feature of supports){
  assert.equal(feature.geometry.type,'Polygon');
  assert.match(feature.properties.source_url,/^https:\/\/www\.openstreetmap\.org\/way\/\d+$/);
  const ring=feature.geometry.coordinates[0];assert.deepEqual(ring[0],ring.at(-1));
  const flat=ring.flat(),triangles=earcut.default(flat,[],2);
  assert.ok(triangles.length>0);assert.ok(earcut.deviation(flat,[],2,triangles)<1e-6);
 }
 for(const event of catalog.events){
  const {context}=await load(event.id,storage());
  const selected=context.window.SR_BRIDGE_FEATURES.filter(f=>f.properties.source_kind==='support');
  assert.equal(selected.length,event.id.startsWith('silverrudder-')?72:68);
 }
 const {context}=await load(catalog.default,storage());
 const broken=JSON.parse(JSON.stringify(bridgeData));
 broken.features.find(f=>f.properties.source_kind==='support').geometry.coordinates[0].pop();
 context.fetch=async()=>({ok:true,json:async()=>broken});
 await assert.rejects(context.loadEventBridgeFeatures(catalog,catalog.default),/Ugyldig brogeometri/);
});


test('Vestbroen piers preserve measured southeast face anchors and stand perpendicular to the bridge',()=>{
 const earcut=require('../viewer/vendor/earcut.js');
 const piers=bridgeData.features.filter(f=>f.properties.construction==='vestbroen-measured-v1');
 const measurements=JSON.parse(fs.readFileSync('data/geography/vestbroen-piers.json','utf8'));
 const axis=bridgeData.features.find(f=>f.properties.bridge==='storebaelt-west'&&f.geometry.type==='LineString').geometry.coordinates;
 const metric=p=>[p[0]*6371000*Math.PI/180*Math.cos(55.31*Math.PI/180),p[1]*6371000*Math.PI/180];
 assert.equal(piers.length,62);
 for(const [i,f] of piers.entries()){
  assert.equal(f.properties.pier_number,i+2);assert.equal(f.properties.approximate,true);
  assert.equal(f.properties.length_metres,6);assert.equal(f.properties.width_metres,42);
  const ring=f.geometry.coordinates[0];assert.deepEqual(ring[0],ring.at(-1));
  const metres=(a,b)=>Math.hypot((a[0]-b[0])*Math.PI*6371000/180*Math.cos(55.31*Math.PI/180),(a[1]-b[1])*Math.PI*6371000/180);
  assert.ok(Math.abs(metres(ring[0],ring[1])-6)<.01);
  assert.ok(Math.abs(metres(ring[1],ring[2])-42)<.01);
  assert.deepEqual(f.properties.anchor,measurements.coordinates[i]);
  const anchor=metric(measurements.coordinates[i]),face=metric(ring[0].map((v,j)=>(v+ring[1][j])/2));
  assert.ok(Math.hypot(face[0]-anchor[0],face[1]-anchor[1])<.002);
  const a=metric(ring[1]),b=metric(ring[2]),across=[b[0]-a[0],b[1]-a[1]];
  assert.ok(across[0]<0&&across[1]>0,'pier extends northwest from the measured southeast face');
  const nearest=axis.slice(1).map((p,j)=>{
   const start=metric(axis[j]),end=metric(p),d=end.map((v,k)=>v-start[k]),length=Math.hypot(...d),t=d.map(v=>v/length);
   const s=Math.max(0,Math.min(length,(anchor[0]-start[0])*t[0]+(anchor[1]-start[1])*t[1]));
   return {distance:Math.hypot(anchor[0]-start[0]-s*t[0],anchor[1]-start[1]-s*t[1]),t};
  }).sort((a,b)=>a.distance-b.distance);
  // At a polyline vertex, both adjoining segments can be equally near.
  assert.ok(nearest.filter(s=>s.distance-nearest[0].distance<.002).some(s=>Math.abs(across[0]*s.t[0]+across[1]*s.t[1])<.002));
  if(i)assert.ok(f.properties.station_metres>piers[i-1].properties.station_metres);
  const flat=ring.flat();assert.ok(earcut.deviation(flat,[],2,earcut.default(flat,[],2))<1e-6);
 }

});


test('Storebaelt decks have filled geographic footprints with configured metre widths',()=>{
 const earcut=require('../viewer/vendor/earcut.js');
 const decks=bridgeData.features.filter(f=>f.properties.source_kind==='deck'&&f.properties.bridge.startsWith('storebaelt-'));assert.equal(decks.length,2);
 for(const deck of decks){
  const expected=deck.properties.bridge==='storebaelt-east'?25:40;
  assert.equal(deck.properties.deck_width_metres,expected);
  const ring=deck.geometry.coordinates[0],n=(ring.length-1)/2;assert.deepEqual(ring[0],ring.at(-1));
  for(const i of [0,n-1]){
   const a=ring[i],b=ring[2*n-1-i];
   const distance=Math.hypot((b[0]-a[0])*6371000*Math.PI/180*Math.cos(55.31*Math.PI/180),(b[1]-a[1])*6371000*Math.PI/180);
   assert.ok(Math.abs(distance-expected)<.01);
  }
  const flat=ring.flat();assert.ok(earcut.deviation(flat,[],2,earcut.default(flat,[],2))<1e-6);
 }
});


test('Vestbroen deck uses a bounded rigid fit to fixed measured pier centres',()=>{
 const deck=bridgeData.features.find(f=>f.id==='storebaelt-west-deck'),fit=deck.properties.alignment;
 assert.ok(Math.abs(fit.rotation_degrees)<=2);
 assert.ok(Math.abs(fit.translation_east_metres)<=20&&Math.abs(fit.translation_north_metres)<=20);
 assert.equal(fit.pier_count,62);assert.ok(fit.rms_after_metres<fit.rms_before_metres);
 const metric=p=>[p[0]*6371000*Math.PI/180*Math.cos(55.31*Math.PI/180),p[1]*6371000*Math.PI/180];
 const ring=deck.geometry.coordinates[0],n=(ring.length-1)/2;
 const centreline=ring.slice(0,n).map((a,i)=>metric(a.map((v,j)=>(v+ring[2*n-1-i][j])/2)));
 const distances=bridgeData.features.filter(f=>f.properties.construction==='vestbroen-measured-v1').map(f=>{
  const corners=f.geometry.coordinates[0].slice(0,4).map(metric),p=[0,1].map(j=>corners.reduce((sum,c)=>sum+c[j],0)/4);
  return Math.min(...centreline.slice(1).map((end,i)=>{
   const start=centreline[i],v=end.map((x,j)=>x-start[j]),lengthSquared=v[0]**2+v[1]**2;
   const t=Math.max(0,Math.min(1,((p[0]-start[0])*v[0]+(p[1]-start[1])*v[1])/lengthSquared));
   return Math.hypot(p[0]-start[0]-t*v[0],p[1]-start[1]-t*v[1]);
  }));
 });
 const rms=Math.sqrt(distances.reduce((sum,d)=>sum+d*d,0)/distances.length);
 assert.ok(Math.abs(rms-fit.rms_after_metres)<.002);assert.ok(Math.max(...distances)<1);
});


for(const bridge of ['lillebaelt-old','lillebaelt-new'])test(bridge+' deck width matches the long sides of the unchanged hexagonal piers',()=>{
 const deck=bridgeData.features.find(f=>f.id===bridge+'-deck');
 const supports=bridgeData.features.filter(f=>f.properties.bridge===bridge&&f.properties.source_kind==='support');
 const metres=(a,b)=>Math.hypot((b[0]-a[0])*6371000*Math.PI/180*Math.cos(55.31*Math.PI/180),(b[1]-a[1])*6371000*Math.PI/180);
 const expected=supports.reduce((sum,f)=>{
  const ring=f.geometry.coordinates[0];assert.equal(ring.length,7);
  return sum+Math.max(...ring.slice(1).map((p,i)=>metres(ring[i],p)));
 },0)/supports.length;
 assert.ok(Math.abs(deck.properties.deck_width_metres-expected)<.001);
 const ring=deck.geometry.coordinates[0],n=(ring.length-1)/2;
 assert.ok(Math.abs(metres(ring[0],ring[2*n-1])-expected)<.002);
 const earcut=require('../viewer/vendor/earcut.js'),flat=ring.flat();
 assert.ok(earcut.deviation(flat,[],2,earcut.default(flat,[],2))<1e-6);
});


test('new Lillebaelt deck aligns through both pylon centres with equal end spans and unchanged length',()=>{
 const deck=bridgeData.features.find(f=>f.id==='lillebaelt-new-deck'),fit=deck.properties.alignment;
 const metric=p=>[p[0]*6371000*Math.PI/180*Math.cos(55.31*Math.PI/180),p[1]*6371000*Math.PI/180];
 const ring=deck.geometry.coordinates[0].map(metric);
 const start=ring[0].map((v,i)=>(v+ring[3][i])/2),end=ring[1].map((v,i)=>(v+ring[2][i])/2);
 const v=end.map((x,i)=>x-start[i]),length=Math.hypot(...v),t=v.map(x=>x/length);
 const positions=fit.pylon_centres_lonlat.map(metric).map(p=>{
  const offset=p.map((x,i)=>x-start[i]);
  assert.ok(Math.abs(offset[0]*t[1]-offset[1]*t[0])<.002);
  return offset[0]*t[0]+offset[1]*t[1];
 }).sort((a,b)=>a-b);
 assert.ok(positions[0]>0&&positions[1]<length);
 assert.ok(Math.abs(positions[0]-(length-positions[1]))<.002);
 assert.ok(Math.abs(length-fit.deck_length_metres)<.002);
 assert.ok(Math.abs(positions[0]-fit.end_span_metres)<.002);
 const source=bridgeData.features.find(f=>f.properties.bridge==='lillebaelt-new'&&f.geometry.type==='LineString').geometry.coordinates.map(metric);
 assert.ok(Math.abs(length-Math.hypot(source[1][0]-source[0][0],source[1][1]-source[0][1]))<.002);
});

test('the tracker has separate selectors for the stævne and the presentation event',()=>{
 const html=fs.readFileSync('viewer/tracker.html','utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(ids).size,ids.length);
 assert.ok(ids.includes('eventSelect'));
 assert.ok(ids.includes('presentationEventSelect'));
});

test('event scene changes stay in the preview until captured and undo leaves content edits intact',()=>{
 const source=fs.readFileSync('viewer/presentation.js','utf8'),nodes=new Map(),writes=[];
 const note={time:10,text:'Original',view:[0,0,100,100],settings:{boats:[],boatSearchQuery:'',boatFavouritesOnly:false,wind:false}};
 const copy=value=>JSON.parse(JSON.stringify(value));
 const context=viewerTestContext({
  $:id=>{if(!nodes.has(id))nodes.set(id,{setAttribute(){}});return nodes.get(id);},window:{SR_READONLY:false},
  openedEvent:note,editingNote:note,newEventDraft:null,interval:null,notes:[note],view:[0,0,100,100],
  sceneCameraBaseline:[0,0,100,100],sceneCameraEdited:false,followedScene:false,followedBoatId:null,
  sceneUndo:null,sceneFeedback:'',boatSearchQuery:'',boats:[{name:'Alpha'},{name:'Beta'}],
  boatIsDisplayed:boat=>boat.name==='Alpha',previewSettings:{...note.settings},EVENT_LAYER_KEYS:['wind'],
  eventToolsVisible:()=>true,setBoatListText:(node,value)=>{node.textContent=value;},
  eventSettings:settings=>settings,eventGates:()=>[],eventMeasurement:()=>[],
  currentMeasurement:()=>[],currentGateMeasurement:()=>[],
  validatedEventVideo:()=>null,persistNotes:next=>{writes.push(copy(next));return true;},
  restoreNote(){},finishInlineTextEditing:()=>true,updateTimeline(){},requestRender(){}
 });
 vm.runInContext(`
  function sceneSettings(){return {...previewSettings};}
  function applySceneSettings(settings){previewSettings={...settings};boatSearchQuery=settings.boatSearchQuery;}
 `,context);
 vm.runInContext(source.slice(source.indexOf('function eventHasContent('),source.indexOf('function sceneSettings()')),context);
 vm.runInContext(source.slice(source.indexOf('function captureScene('),source.indexOf('function restoreNote(')),context);
 vm.runInContext("view=[-10,-20,80,80];markEventCameraChange();previewSettings.wind=true;previewSettings.boatSearchQuery=boatSearchQuery='alpha';updateEventSceneControls()",context);
 assert.equal(writes.length,0);
 assert.match(nodes.get('eventSceneStatus').textContent,/Udsnit · Både · Lag · 1 båd/);
 nodes.get('captureEventScene').onclick();
 assert.equal(writes.length,1);
 assert.deepEqual(writes[0][0].view,[-10,-20,80,80]);
 assert.deepEqual(writes[0][0].settings.boats,['Alpha']);
 assert.equal(writes[0][0].settings.boatSearchQuery,'');
 context.updateEventContent(note,{text:'Ny tekst'});
 nodes.get('undoEventScene').onclick();
 assert.equal(writes.length,3);
 assert.equal(writes[2][0].text,'Ny tekst');
 assert.deepEqual(writes[2][0].view,[0,0,100,100]);
 assert.equal(writes[2][0].settings.wind,false);
});

test('layout resize preserves the preview centre and geographic scale',()=>{
 const source=fs.readFileSync('viewer/presentation.js','utf8'),context=viewerTestContext({});
 vm.runInContext(source.slice(source.indexOf('function resizedSceneCamera('),source.indexOf('function resizeEventSceneBaseline(')),context);
 const rect={width:800,height:600},changed={width:500,height:600},view=[100,200,200,300];
 const next=[...context.resizedSceneCamera(view,rect,changed)];
 assert.deepEqual(next,[75,200,250,300]);
 assert.equal(Math.max(next[2]/changed.width,next[3]/changed.height),Math.max(view[2]/rect.width,view[3]/rect.height));
});

test('an edit made while publishing stays in the draft under the published revision',async()=>{
 const source=fs.readFileSync('viewer/online.js','utf8'),buttons=new Map(),draft=storage();
 let release,submitted;
 const context=viewerTestContext({
  notes:[{time:10,text:'Til udgivelse'}],speedPins:[],eventImageUploads:new Map(),eventStorage:draft,
  window:{SR_CONFIG:{admin:true,apiBase:''},SR_SHA:'version-a',SR_DRAFT_KEY:'draft'},
  document:{
   body:{append(){}},
   createElement:()=>({setAttribute(){}}),
   querySelector:()=>({after(){},append(button){buttons.set(button.textContent,button);}})
  },
  showPresentationEvent(){},eventAPI:path=>path,noteNavigationAllowed:()=>true,
  fetch:(path,request)=>{
   assert.equal(path,'/api/presentation');
   submitted=JSON.parse(request.body);
   return new Promise(resolve=>{release=resolve;});
  }
 });
 vm.runInContext(source,context);
 const publishing=buttons.get('Udgiv').onclick();
 assert.equal(submitted.document.notes[0].text,'Til udgivelse');
 context.notes[0].text='Rettet under udgivelse';
 release({ok:true,json:async()=>({sha:'version-b'})});
 await publishing;
 assert.deepEqual(JSON.parse(draft.getItem('draft')),{
  sha:'version-b',document:{version:1,notes:[{time:10,text:'Rettet under udgivelse'}],speedPins:[]}
 });
});

test('the layer menu only offers wind, radar and grid switches',()=>{
 const html=fs.readFileSync('viewer/tracker.html','utf8');
 const panel=html.match(/<div id="mapLayersPanel"[^>]*>([\s\S]*?)<\/div>/)?.[1];
 assert.ok(panel);
 const controls=[...panel.matchAll(/<(input|button|select)\b[^>]*\bid="([^"]+)"/g)].map(match=>match[2]);
 assert.deepEqual(controls,['wind','rain','grid']);
});

test('deleting the opened event saves the remaining notes and selects the following event',()=>{
 const source=fs.readFileSync('viewer/presentation.js','utf8'),nodes=new Map();
 const first={time:1},current={time:2},next={time:3};
 const context=viewerTestContext({
  $:id=>{if(!nodes.has(id))nodes.set(id,{focus(){},setAttribute(){}});return nodes.get(id);},
  notes:[first,current,next],editingNote:current,newEventDraft:null,
  finishInlineTextEditing:()=>true,confirm:()=>false,
  persistNotes(remaining){context.saved=[...remaining];return true;},
  leaveOpenedEvent(){},refreshEditedEvent(){},restoreNote(note){context.opened=note;}
 });
 vm.runInContext(source.slice(source.indexOf("$('deleteNote').onclick"),source.indexOf("$('placeNote').onclick")),context);
 nodes.get('deleteNote').onclick();
 assert.equal(context.saved,undefined);
 context.confirm=()=>true;
 nodes.get('deleteNote').onclick();
 assert.deepEqual(context.saved,[first,next]);
 assert.equal(context.opened,next);
});

test('language choice updates visible text, accessibility labels and switcher links',()=>{
 const source=['i18n-messages','i18n'].map(name=>fs.readFileSync('viewer/'+name+'.js','utf8')).join('\n');
 const langKey='sr-language',preference=storage(),listeners=new Map();
 preference.setItem(langKey,'en');
 const heading={childNodes:[{nodeType:3,data:'Brug i eventet'}]};
 const field={dataset:{i18nAttrs:'aria-label title'},attrs:{'aria-label':'Forrige event',title:'Forrige event'},
  getAttribute(name){return this.attrs[name];},setAttribute(name,value){this.attrs[name]=value;}};
 const button={setAttribute(name,value){this[name]=value;},focus(){this.focused=true;}};
 const choices=['da','en','de','fr'].map(lang=>({lang,setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];}}));
 const panel={hidden:true,querySelectorAll:()=>choices};
 const picker={querySelector:query=>query==='button'?button:panel,contains:node=>node===button};
 const url='http://localhost/events/silverrudder-2025/?editRoute=1&lang=de#map';
 const dynamic={textContent:'',setAttribute(){}},location={href:url};
 const document={baseURI:'http://localhost/',documentElement:{},
  querySelectorAll:selector=>({'[data-i18n]':[heading],'[data-i18n-attrs]':[field],'[data-language-picker]':[picker],'[data-i18n-live]':[dynamic]})[selector],
  addEventListener:(type,callback)=>listeners.set(type,callback)};
 const history={state:{kept:true},replaceState(state,title,next){assert.deepEqual(state,this.state);location.href=next.href;}};
 const context=vm.createContext({document,location,history,localStorage:preference,URL,Node:{TEXT_NODE:3}});
 vm.runInContext(source,context);
 assert.equal(document.documentElement.lang,'de');
 assert.equal(preference.getItem(langKey),'de');
 assert.equal(heading.childNodes[0].data,'Für Ereignis übernehmen');
 assert.deepEqual(field.attrs,{'aria-label':'Vorheriges Ereignis',title:'Vorheriges Ereignis'});
 assert.equal(button.textContent,'🇩🇪');
 assert.equal(choices[2]['aria-current'],'true');
 assert.equal(choices[1].href.href,'http://localhost/events/silverrudder-2025/?editRoute=1&lang=en#map');
 assert.equal(context.srLanguageURL('events/sjaelland-rundt-2026/').search,'?lang=de');
 assert.equal(context.srText('Event {0} af {1}',3,8),'Ereignis 3 von 8');
 button.onclick();
 assert.equal(panel.hidden,false);
 listeners.get('keydown')({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(panel.hidden,true);
 assert.equal(button.focused,true);
 const error=vm.runInContext("new SRMessageError('Billedet kunne ikke klargøres.')",context);
 context.srBind(dynamic,'textContent',()=>context.srErrorText(error));
 assert.equal(dynamic.textContent,'Bild konnte nicht vorbereitet werden.');
 choices[1].onclick({preventDefault(){}});
 assert.equal(document.documentElement.lang,'en');
 assert.equal(heading.childNodes[0].data,'Use in event');
 assert.equal(field.attrs['aria-label'],'Previous event');
 assert.equal(dynamic.textContent,'Could not prepare the image.');
 assert.equal(button.textContent,'🇬🇧');
 assert.equal(choices[2]['aria-current'],undefined);
 assert.equal(choices[1]['aria-current'],'true');
 assert.equal(location.href,'http://localhost/events/silverrudder-2025/?editRoute=1&lang=en#map');
 choices[0].onclick({preventDefault(){}});
 assert.equal(heading.childNodes[0].data,'Brug i eventet');
 assert.equal(dynamic.textContent,'Billedet kunne ikke klargøres.');
 assert.equal(button.textContent,'🇩🇰');
 choices[2].onclick({preventDefault(){}});
 assert.equal(document.documentElement.lang,'de');
 choices[3].onclick({preventDefault(){}});
 assert.equal(document.documentElement.lang,'fr');
 assert.equal(button.textContent,'🇫🇷');
 assert.equal(heading.childNodes[0].data,'Utiliser pour l’événement');
 assert.equal(field.attrs['aria-label'],'Événement précédent');
 assert.equal(dynamic.textContent,'Impossible de préparer l’image.');
 assert.equal(context.srText('Event {0} af {1}',3,8),'Événement 3 sur 8');
 assert.equal(context.srLanguageURL('events/sjaelland-rundt-2026/').search,'?lang=fr');

 document.querySelectorAll=()=>[];
 context.location.href='http://localhost/?lang=unsupported';
 const remembered=vm.createContext({document,location:context.location,localStorage:preference,URL});
 vm.runInContext(source,remembered);
 assert.equal(document.documentElement.lang,'fr');
});

test('translated labels never replace the saved comparison identifiers',()=>{
 const source=fs.readFileSync('viewer/navigation.js','utf8');
 for(const [language,label] of Object.entries({en:'Delete event',de:'Ereignis löschen',fr:'Supprimer l’événement'})){
  const context=viewerTestContext({},language);
  vm.runInContext(source.slice(source.indexOf('function validComparison('),source.indexOf('let comparison=')),context);
  assert.equal(context.validComparison({enabled:true,basis:'handicap',boatColour:false}),true);
  assert.equal(context.srText('Slet event'),label);
  assert.equal(context.srText('En båd ved broen'),'En båd ved broen');
 }
});

test('every translation keeps the placeholders of its Danish key',()=>{
 const context=viewerTestContext();
 const all=vm.runInContext('SR_MESSAGES',context),languages=vm.runInContext('SR_MESSAGE_LANGUAGES',context);
 const placeholders=message=>[...new Set(message.match(/\{\d+\}/g)||[])].sort();
 for(const [key,translations] of Object.entries(all)){
  assert.equal(translations.length,languages.length);
  for(const value of translations){
   assert.ok(value.trim(),key);
   assert.deepEqual(placeholders(value),placeholders(key),key);
  }
 }
});
