const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
const url=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(new URL(request.url()).pathname));
  await page.goto(url);await page.waitForSelector('main:not([inert])',{timeout:120000});
  const initial=await page.evaluate(()=>{
   stopPlayback();const profiles=boats.map(b=>trackProfileCache.get(b.points)),records=boats.map(b=>webglTracks.buffers.get(b.points));
   if(!webglTracks.active)throw Error(webglTracks.error);
   if(profiles.some(p=>!p||!(p.stations instanceof Float32Array)))throw Error('Missing Float32 profile');
   if(records.some(r=>!r?.texture||!r?.comparisonTexture))throw Error('Missing GPU data');
   const uploads=webglTracks.uploads,pointCount=boats.reduce((n,b)=>n+b.points.length,0);
   for(const basis of ['absolute','handicap','time']){if(!saveComparison({enabled:true,basis,boatColour:false}))throw Error('Style failed');selectedTime=D.start+43200;render();}
   const oldReference=referenceBoatId;for(const boat of boats.slice(0,3))if(!saveReferenceBoat(boat.id))throw Error('Reference failed');saveReferenceBoat(oldReference);
   if(uploads!==webglTracks.uploads||boats.some((b,i)=>trackProfileCache.get(b.points)!==profiles[i]||webglTracks.buffers.get(b.points)!==records[i]))throw Error('Interaction recalculated fixed data');
   if(webglTracks.gl.getError())throw Error('WebGL error');
   return {boats:boats.length,pointCount,uploads,renderer:webglTracks.renderer,start:D.start,route:window.SR_RHUMBLINE};
  });
  assert.equal(initial.boats,106);assert.equal(initial.pointCount,730370);assert.equal(initial.uploads,106);
  assert.equal(requests.filter(p=>p.endsWith('/source.bin.gz')).length,1);assert.equal(requests.some(p=>p.endsWith('/profiles.bin.gz')||p.endsWith('/fleet.bin')||p.endsWith('/data.js')),false);
  const interpolation=await page.evaluate(()=>{
   const boat={...boats[0],points:[[12,55.6,D.start+100000.123],[12.001,55.601,D.start+100060.789],[12.004,55.6014,D.start+100180.567],[12.005,55.603,D.start+100240.321]],speeds:[31.125,32,33,34]};
   webglTracks.prepare(boat);const record=webglTracks.buffers.get(boat.points),data=webglTracks.preparation.read(record.texture,16,1);let maxError=0,curvature=0;
   for(let index=0;index<3;index++)for(const u of [.17,.5,.83]){
    const time=boat.points[index][2]+u*(boat.points[index+1][2]-boat.points[index][2]),expected=xy(trackValue(boat.points,index,time).point),offset=index*16;
    if(Math.abs(data[offset+12]+data[offset+14]-(boat.points[index][2]-D.start))>.00001)throw Error('Lost timestamp precision');
    for(let axis=0;axis<2;axis++){
     const gpu=data[offset+axis]+data[offset+4+axis]*(3*u*u-2*u*u*u)+data[offset+6+axis]*(u*u*u-2*u*u+u)+data[offset+8+axis]*(u*u*u-u*u);
     const linear=data[offset+axis]+data[offset+4+axis]*u;maxError=Math.max(maxError,Math.abs(gpu-expected[axis]));curvature=Math.max(curvature,Math.abs(gpu-linear));
    }
   }
   if(record.curvature<=0||curvature<.001)throw Error('Interpolation became linear');
   if(maxError>.00015)throw Error('GPU/marker cubic mismatch: '+maxError);
   if(data[10]!==31.125)throw Error('Source speed clipped to old 25 knot limit');
   return {maxError,curvature};
  });
  const resources=await page.evaluate(()=>{
   const gl=webglTracks.gl,originals=new Map(),live=new Map();
   for(const kind of ['Buffer','Texture','VertexArray','TransformFeedback','Framebuffer','Program','Shader']){
    const create='create'+kind,remove='delete'+kind;originals.set(create,gl[create]);originals.set(remove,gl[remove]);
    gl[create]=function(...args){const value=originals.get(create).apply(gl,args);live.set(value,kind);return value;};
    gl[remove]=function(value){live.delete(value);return originals.get(remove).call(gl,value);};
   }
   let preparation;
   try{
    const compile=gl.compileShader;gl.compileShader=()=>{throw Error('Injected shader compilation');};let constructorFailed=false;
    try{new GPUTrackPreparation({gl,buffers:new Map(),uploads:0});}catch(error){constructorFailed=error.message==='Injected shader compilation';}finally{gl.compileShader=compile;}
    if(!constructorFailed||live.size)throw Error('Failed shader initialization leaked resources');
    const renderer={gl,buffers:new Map(),uploads:0};preparation=new GPUTrackPreparation(renderer);const persistent=live.size;
    const boat={...boats[0],points:boats[0].points.slice(100,104),speeds:boats[0].speeds.slice(100,104)};
    for(const stage of ['feedback','profile','readback']){
     const method=stage==='feedback'?'drawArrays':stage==='profile'?'draw':'readProfile',owner=stage==='feedback'?gl:preparation,original=owner[method];
     owner[method]=()=>{throw Error('Injected '+stage);};let failed=false;
     try{preparation.prepare(boat);}catch(error){failed=error.message==='Injected '+stage;}finally{owner[method]=original;}
     if(!failed||renderer.buffers.size||trackProfileCache.has(boat.points)||preparation.denseSamples||live.size!==persistent)throw Error('Partial preparation leaked/published at '+stage+': '+live.size+'/'+persistent);
     if(gl.isEnabled(gl.RASTERIZER_DISCARD)||gl.getParameter(gl.FRAMEBUFFER_BINDING)!==null||gl.getError())throw Error('GPU state leaked at '+stage);
    }
    preparation.prepare(boat);if(renderer.buffers.size!==1)throw Error('Failed transaction poisoned later preparation');
    preparation.dispose();if(live.size||renderer.buffers.size||trackProfileCache.has(boat.points))throw Error('Dispose leaked GPU resources');
    return {injectedFailures:4,liveAfterDispose:live.size};
   }finally{preparation?.dispose();for(const [name,method] of originals)gl[name]=method;}
  });
  const fixtures=await page.evaluate(async()=>{
   const leg=rhumbRoute.legs[4],point=meters=>{const u=meters/(leg.distance*1852);return [(leg.x+leg.dx*u)/NAV_RAD,inverseMercatorLatitude(leg.y+leg.dy*u)];};
   const make=(id,meters,speeds,times=meters.map((_,i)=>i*60))=>({id:'gpu-test-'+id,name:'GPU '+id,course:boats[0].course,handicapSecondsPerNm:300,points:meters.map((m,i)=>[...point(1000+m),D.start+10000+times[i]]),speeds});
   const fixtures=[make('forward',[0,100,200],[4,4,4]),make('reverse',[200,100,0],[4,4,4]),make('repeat',[0,200,0,200],[4,4,4,4]),make('stop',[100,100],[0,0]),make('missing',[0,200],[null,null]),make('gap',[0,100,200,300],[4,4,4,4],[0,60,400,460]),make('isolated',[100],[4]),make('empty',[],[])];
   for(const boat of fixtures){colours[boat.name]='#ffdc42';boats.push(boat);await webglTracks.prepare(boat);}
   webglTracks.comparisonReference=null;webglTracks.prepareComparison();await webglTracks.preparation.ready();
   return fixtures.map(boat=>{const p=trackProfileCache.get(boat.points),station=Math.round((leg.start*1852+1100)/10);return {boat,from:station-15,stations:Array.from(p.stations.slice(station-15,station+16)),timeStations:Array.from(p.timeStations.slice(station-15,station+16)),samples:Array.from(p.samples),timeSamples:Array.from(p.timeSamples)};});
  });
  // Independent CPU oracle is test-only and is never served by the app.
  const c=vm.createContext({D:{start:initial.start}});for(const file of ['viewer/track-time.js','viewer/tracks.js','viewer/rhumbline-geometry.js','scripts/profile-reference-math.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),c);
  c.definition=initial.route;vm.runInContext('const rhumbRoute=buildRhumbRoute(definition.points);',c);
  for(const fixture of fixtures){
   const {boat,from}=fixture,expected=c.prepareReferenceProfile(boat),times=c.prepareTimeProfiles(boat).timeStations;
   for(let j=0;j<fixture.stations.length;j++){
    const speed=expected[from+j],wanted=speed<0?null:speed,actual=fixture.stations[j];
    assert.equal(actual>=0,wanted!==null,boat.id+' speed coverage station '+(from+j));
    if(wanted!==null)assert.ok(Math.abs(actual-wanted)<.005,boat.id+' speed '+actual+' / '+wanted);
    const target=times[from+j],value=fixture.timeStations[j];assert.equal(value>=0,target>=0,boat.id+' time coverage station '+(from+j));
    if(target>=0)assert.ok(Math.abs(value-target)<=Math.max(.005,Math.abs(target)*.002)||value>=1e15&&target===Infinity,boat.id+' time '+value+' / '+target);
   }
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',...initial,route:undefined,interpolation,resources,fixtures:fixtures.length,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
