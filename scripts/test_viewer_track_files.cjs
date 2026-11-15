const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8098/test/';
 try{
  for(const simple of [false,true]){
   const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],requests=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
   await page.addInitScript(()=>{
    window.Worker=class{constructor(){throw Error('Client worker must not be used');}};
    indexedDB.open=()=>{throw Error('Client track storage must not be used');};
   });
   await page.route('**/tracks.js',async route=>{
    const response=await route.fetch();let source=await response.text();
    if(simple)source=source.replace(/const SIMPLE_IPHONE_TRACKS=.*?;/,'const SIMPLE_IPHONE_TRACKS=true;');
    source+='\ngetTrackModel=points=>{if(!trackModelCache.has(points))throw Error("Client tried to prepare a curve");return trackModelCache.get(points);};prepareTrackTimeIndex=points=>{if(!trackTimeIndexes.has(points))throw Error("Client tried to prepare an index");return trackTimeIndexes.get(points);};';
    await route.fulfill({response,body:source});
   });
   const began=Date.now();await page.goto(base);await page.waitForSelector('main:not([inert])',{timeout:60000});
   const initial=await page.evaluate(()=>({boats:webglTracks.buffers.size,ready:webglTracks.graphicsReady,geometryReleased:webglTracks.preparation.files.geometry===null,bytes:[...webglTracks.buffers.values()].reduce((sum,r)=>sum+r.bytes,0)}));
   assert.equal(initial.boats,106);assert.equal(initial.ready,true);assert.equal(initial.geometryReleased,true);
   const checkColours=async()=>page.evaluate(()=>{
    const reference=referenceBoat(),referenceProfile=trackProfileCache.get(reference.points);let checked=0;
    for(const boat of boats){
     const profile=trackProfileCache.get(boat.points),values=webglTracks.buffers.get(boat.points).colourValues,n=boat.points.length;
     for(const index of new Set([0,Math.floor(n/3),Math.floor(2*n/3),n-1]))if(index>=0&&index<n){
      const station=profile.samples[index*3],vmg=profile.samples[index*3+2],timeStation=profile.timeSamples[index*2],cost=profile.timeSamples[index*2+1];
      const expected=[null,null,null],speed=referenceProfile.stations[station],time=referenceProfile.timeStations[timeStation];
      if(station>=0&&vmg> -1e19&&speed>=0){expected[0]=vmg-speed;const factor=1+((reference.handicapSecondsPerNm||0)-(boat.handicapSecondsPerNm||0))*vmg/3600;if(boat.handicapSecondsPerNm>0&&reference.handicapSecondsPerNm>0&&factor>0)expected[1]=vmg/factor-speed;}
      if(timeStation>=0&&cost>=0&&time>=0&&!(cost>=Math.fround(1e15)&&time>=Math.fround(1e15)))expected[2]=100*(time-cost);
      for(const [component,mode] of ['absolute','handicap','time'].entries()){
       const actual=values[mode][index],wanted=expected[component];
       if(wanted===null){if(actual>=-1e19)throw Error('Missing comparison changed: '+boat.name+'/'+mode);}
       else if(Math.abs(actual-wanted)>Math.max(.00001,Math.abs(wanted)*.000001))throw Error('Prepared comparison differs: '+boat.name+'/'+mode);
       checked++;
      }
     }
    }
    return checked;
   });
   assert.ok(await checkColours()>1000);
   const before=requests.filter(url=>url.endsWith('.bin.gz')).length;
   for(const mode of ['boat','absolute','handicap','time','speed']){
    const state=await page.evaluate(async mode=>{
     comparison={enabled:!['boat','speed'].includes(mode),boatColour:mode==='boat',basis:['absolute','handicap','time'].includes(mode)?mode:'absolute'};
     await webglTracks.prepareComparison();webglTracks.render(currentTime(),boats,true);await webglTracks.preparation.ready('Test af færdige filer');assertRenderingReady();
     const records=[...webglTracks.buffers.values()];
     return {mode:webglTracks.loadedMode,error:webglTracks.gl.getError(),bytes:records.reduce((sum,r)=>sum+r.styleBytes,0),expected:mode==='boat'?0:records.reduce((sum,r)=>sum+r.comparisonWidth*r.comparisonHeight*4,0)};
    },mode);
    assert.equal(state.mode,mode);assert.equal(state.error,0);assert.equal(state.bytes,state.expected);
   }
   assert.equal(requests.filter(url=>url.endsWith('.bin.gz')).length,before,'Style changes use prepared arrays without any download or computation');
   const changed=await page.evaluate(async()=>{
    referenceBoatId=boats.find(boat=>boat.name==='Vera').id;await webglTracks.prepareComparison();assertRenderingReady();
    return {id:referenceBoatId,loaded:webglTracks.preparation.files.referenceId};
   });
   assert.equal(changed.loaded,changed.id);assert.ok(await checkColours()>1000);assert.equal(requests.filter(url=>url.endsWith('.bin.gz')).length,before+1,'A reference change fetches exactly its prepared file');
   const missing=await page.evaluate(()=>window.SR_TRACK_MANIFEST.prepared.references.find(entry=>entry.id===boats.find(boat=>boat.name==='My').id).file);
   await page.route('**/'+missing.split('/').at(-1),route=>route.fulfill({status:404,body:'missing prepared reference'}));
   const failure=await page.evaluate(async()=>{
    referenceBoatId=boats.find(boat=>boat.name==='My').id;await webglTracks.prepareComparison();return {active:webglTracks.active,error:webglTracks.error,visible:!$('renderingError').hidden};
   });
   assert.equal(failure.active,false);assert.equal(failure.visible,true);assert.match(failure.error,/404/);assert.deepEqual(errors,[]);
   assert.equal(requests.some(url=>url.includes('track-preparation-worker')||url.includes('track-preparation-math')),false);
   console.log(JSON.stringify({simple,initial,loadMs:Date.now()-began,checks:'build files only; no worker, IndexedDB, curve/index preparation; all styles; prepared reference swap; explicit missing-file error'}));
   await page.close();
  }
  for(const mode of ['missing','invalid-gzip']){
   const page=await browser.newPage();await page.addInitScript(()=>{
    window.testWebGLContexts=0;const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2')testWebGLContexts++;return get.call(this,type,...args);};
    window.Worker=class{constructor(){throw Error('No preparation fallback');}};
   });
   await page.route('**/common.bin.gz',route=>route.fulfill({status:mode==='missing'?404:200,body:mode==='missing'?'missing':'not gzip'}));
   await page.goto(base);await page.waitForSelector('#viewerLoadingError:not([hidden])',{timeout:30000});
   assert.equal(await page.evaluate(()=>testWebGLContexts),0);assert.equal(await page.locator('main').getAttribute('inert'),'');await page.close();
  }
  console.log('Firefox: missing or corrupt prepared data fails before WebGL; client computation is never used as a fallback.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
