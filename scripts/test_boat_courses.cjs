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
