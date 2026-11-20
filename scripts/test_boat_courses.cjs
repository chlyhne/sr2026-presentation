const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{test}=require('node:test');
const read=name=>fs.readFileSync('viewer/'+name+'.js','utf8');
test('course and race filters combine with favourites and search, and support all boats',()=>{
 const source=read('viewer'),context=vm.createContext({window:{SR_EVENT:{courses:{groensund:{name:'Grønsund'},boegestroemmen:{name:'Bøgestrømmen'}}}},Option:class{},$:()=>({replaceChildren(){}}),boats:[
  {id:'g1',name:'Alpha',course:'groensund',raceClassId:'race1',raceClassName:'Two-Racing'},
  {id:'g2',name:'Beta',course:'groensund',raceClassId:'race2',raceClassName:'Multi-Cruising'},
  {id:'b1',name:'Gamma',course:'boegestroemmen',raceClassId:'race1',raceClassName:'Two-Racing'}
 ],chosen:new Set(['Alpha'])});
 vm.runInContext(source.slice(source.indexOf('const BOAT_COURSE_NAMES='),source.indexOf('function createBoatHeartChoice(')),context);
 const displayed=()=>vm.runInContext('boats.filter(boatIsDisplayed).map(b=>b.id).join(",")',context);
 assert.equal(displayed(),'g1,g2,b1');
 vm.runInContext("boatCourseFilter='groensund';boatClassFilter='race1'",context);assert.equal(displayed(),'g1');
 vm.runInContext("boatCourseFilter='boegestroemmen'",context);assert.equal(displayed(),'b1');
 vm.runInContext("boatClassFilter='';boatSearchQuery='gamma'",context);assert.equal(displayed(),'b1');
 vm.runInContext('boatFavouritesOnly=true',context);assert.equal(displayed(),'');
 vm.runInContext("boatCourseFilter=boatClassFilter=boatSearchQuery='';boatFavouritesOnly=false",context);assert.equal(displayed(),'g1,g2,b1');
 assert.equal(context.validBoatRaceFilters('boegestroemmen','race2'),false);
 assert.equal(context.validBoatRaceFilters('invalid',''),false);
});
test('route-specific mirrors select stored arrays without rebuilding profiles',()=>{
 const context=vm.createContext({});vm.runInContext(read('track-files')+';this.Files=TrackFiles;',context);
 const files=new context.Files(),arrays={};
 for(const course of ['groensund','boegestroemmen'])for(const name of ['samples','stations','timeSamples','timeStations'])arrays[course+'_'+name]=new Float32Array([course==='groensund'?1:2]);
 files.common=new Map([['boat',{arrays}]]);
 assert.equal(files.mirror('boat','groensund').stations,arrays.groensund_stations);
 assert.equal(files.mirror('boat','boegestroemmen').stations,arrays.boegestroemmen_stations);
});
test('compact detail fields favour the allocation hiding the fewest letters',()=>{
 const source=read('boat-list'),context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('function allocateBoatDetailWidths('),source.indexOf('let boatDetailAvailableWidth=')),context);
 const allocate=context.allocateBoatDetailWidths;
 const wide=Array.from({length:6},(_,i)=>i*10),narrow=Array.from({length:13},(_,i)=>i*5);
 assert.deepEqual([...allocate(wide,narrow,80)],[30,50]);
 assert.deepEqual([...allocate([0,4,8],[0,5],30)],[8,22],'Short texts fit without unnecessary clipping');
 for(const width of [1,20,80,200]){
  const fields=allocate(wide,narrow,width);
  assert.ok(fields.every(value=>value>=0));assert.equal(fields[0]+fields[1],width);
 }
});
test('boat list values use the track units, including the reference boat',()=>{
 const source=read('speed-pins'),comparison={basis:'time'},context=vm.createContext({comparison,
  trackUsesComparison:()=>true,referenceBoat:()=>({id:'ref',name:'Reference'}),
  webglTracks:{comparisonSample:()=>({timeGain:12.5,absoluteGain:-1.2,handicapGain:0.8})}});
 vm.runInContext(source.slice(source.indexOf('function trackPinValue('),source.indexOf('function chooseTrackSpeed(')),context);
 const sample={speed:6,time:100},format=context.trackPinValue;
 assert.equal(format({id:'other'},sample,{includeReference:true}).label,'+12,50 s/100 m');
 assert.equal(format({id:'ref'},sample,{includeReference:true}).label,'+12,50 s/100 m');
 comparison.basis='absolute';assert.equal(format({id:'other'},sample,{includeReference:true}).label,'-1,20 kn');
 context.trackUsesComparison=()=>false;assert.equal(format({id:'ref'},sample,{includeReference:true}).label,'6,0 kn');
});

test('hover refresh follows the current hit target and coalesces layout changes',()=>{
 const source=read('boat-list'),frames=[];let hit=null;
 const target=(kind,id)=>({closest:selector=>selector.startsWith('#visibleBoatsList')&&kind==='list'?{dataset:{boatId:id}}:selector.startsWith('#map')&&kind==='map'?{dataset:{boatMarker:id}}:null});
 const context=vm.createContext({hoveredVisibleBoatId:null,hoveredMapBoatId:null,document:{elementFromPoint:()=>hit},
  requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},refreshVisibleBoatHighlight(){},
  setHoveredMapBoat(id){context.hoveredMapBoatId=id;}});
 vm.runInContext(source.slice(source.indexOf('let boatHoverPoint='),source.indexOf("document.addEventListener('pointermove'")),context);
 context.trackBoatHoverPointer({clientX:10,clientY:20,pointerType:'mouse',buttons:0,target:target('list','a')});
 assert.equal(context.hoveredVisibleBoatId,'a');hit=target('list','b');
 context.scheduleBoatHoverRefresh();context.scheduleBoatHoverRefresh();assert.equal(frames.length,1);
 frames.shift()();assert.equal(context.hoveredVisibleBoatId,'b');
 hit=target('map','c');context.scheduleBoatHoverRefresh();frames.shift()();
 assert.equal(context.hoveredVisibleBoatId,null);assert.equal(context.hoveredMapBoatId,'c');
 context.trackBoatHoverPointer({pointerType:'touch',buttons:0});assert.equal(context.hoveredMapBoatId,null);
 context.scheduleBoatHoverRefresh();assert.equal(frames.length,0);
});


test('boat row expansion leaves favourites unchanged and colour changes persist locally and invalidate GPU colour',()=>{
 const source=read('boat-list'),saved=new Map(),attributes={},properties={},frames=[];
 const row={extra:{hidden:true},node:{dataset:{boatId:'boat1'},setAttribute:(k,v)=>attributes[k]=v,style:{setProperty:(k,v)=>properties[k]=v}},colour:{value:''}};
 const context=vm.createContext({localBoatColours:{},BOAT_COLOURS_KEY:'boat-colour-overrides',eventStorage:{setItem:(k,v)=>saved.set(k,v)},
  colours:{Alpha:'#112233'},webglTracks:{boatColours:new Map(),lastKey:'cached'},boatCompareRenderKey:'cached',
  visibleBoatRows:new Map([['boat1',row]]),$:()=>({children:[]}),requestRender:()=>frames.push(1),scheduleBoatHoverRefresh(){}});
 vm.runInContext(source.slice(source.indexOf('const expandedBoatRows='),source.indexOf('function createVisibleBoatRow(')),context);
 context.toggleBoatRow(row);assert.equal(row.extra.hidden,false);assert.equal(attributes['aria-expanded'],'true');
 context.toggleBoatRow(row);assert.equal(row.extra.hidden,true);
 context.setLocalBoatColour({id:'boat1',name:'Alpha'},'#abcdef');
 assert.equal(context.colours.Alpha,'#abcdef');assert.equal(row.colour.value,'#abcdef');assert.equal(properties['--boat-colour'],'#abcdef');
 assert.deepEqual(JSON.parse(saved.get('boat-colour-overrides')),{boat1:'#abcdef'});
 const rgb=[...context.webglTracks.boatColours.get('#abcdef')];
 rgb.forEach((v,i)=>assert.ok(Math.abs(v-[171,205,239][i]/255)<1e-6));
 assert.equal(context.webglTracks.lastKey,null);assert.equal(context.boatCompareRenderKey,'');assert.equal(frames.length,1);
 assert.throws(()=>context.setLocalBoatColour({id:'boat1',name:'Alpha'},'invalid'),/Ugyldig/);
});


test('map boat activation opens, expands and focuses its list row without toggling on repeat',()=>{
 const source=read('boat-list'),calls=[],row={extra:{hidden:true},node:{}};
 const context=vm.createContext({followBoatOnMap:id=>calls.push(['follow',id]),expandedBoatRows:new Set(),visibleBoatRows:new Map([['boat1',row]]),
  setVisibleBoatsExpanded:value=>calls.push(['panel',value]),toggleBoatRow:r=>{r.extra.hidden=false;calls.push(['expand']);},
  scrollVisibleBoatRow:node=>calls.push(['scroll',node===row.node]),refreshVisibleBoatHighlight(){},scheduleBoatHoverRefresh(){}});
 row.node.focus=options=>calls.push(['focus',options.preventScroll]);
 vm.runInContext(source.slice(source.indexOf('function focusBoatInList('),source.indexOf('function createVisibleBoatRow(')),context);
 context.focusBoatInList('boat1');context.focusBoatInList('boat1');
 assert.equal(row.extra.hidden,false);assert.ok(context.expandedBoatRows.has('boat1'));
 assert.equal(calls.filter(c=>c[0]==='expand').length,1);
 assert.equal(calls.filter(c=>c[0]==='focus'&&c[1]).length,2);
 assert.equal(calls.filter(c=>c[0]==='scroll'&&c[1]).length,2);
});


test('clicked boat camera keeps the boat centred through zoom and playback without changing reference',()=>{
 const source=read('viewer'),boat={id:'follow'},reference={id:'reference'};
 let point=[100,200];const context=vm.createContext({boats:[boat],followedBoatId:null,timelineDragPointer:null,view:[0,0,80,40],
  displayBoatPosition:()=>({point}),currentTime:()=>0,xy:p=>p,referenceBoat:()=>reference,
  setAttr(){},$:()=>({}),scheduleBoatHoverRefresh(){},invalidateTimelineViewport(){},requestRender(){}});
 vm.runInContext(source.slice(source.indexOf('function centerViewOnBoat('),source.indexOf('function advancePlayback(')),context);
 vm.runInContext(source.slice(source.indexOf('function setview(){'),source.indexOf('function changeMapView(')),context);
 context.followBoatOnMap('follow');assert.equal(context.followedBoatId,'follow');
 assert.deepEqual([...context.view],[60,180,80,40]);
 context.view=[999,999,40,20];context.setview();assert.deepEqual([...context.view],[80,190,40,20]);
 point=[120,230];assert.equal(context.centerViewOnBoat(boat),true);assert.deepEqual([...context.view],[100,220,40,20]);
 assert.equal(context.centerViewOnBoat(boat),false,'Stationary follow does not schedule an endless render loop');
 context.timelineDragPointer=17;point=[150,270];
 assert.equal(context.centerViewOnBoat(boat),false);assert.deepEqual([...context.view],[100,220,40,20]);
 context.timelineDragPointer=null;assert.equal(context.centerViewOnBoat(boat),true);assert.deepEqual([...context.view],[130,260,40,20]);
 assert.equal(context.referenceBoat(),reference);
});
