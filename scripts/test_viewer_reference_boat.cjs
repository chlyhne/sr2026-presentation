const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
const url=process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/';
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.waitForSelector('main:not([inert])',{timeout:120000});
  const baseline=await page.evaluate(()=>{
   $('wind').checked=$('rain').checked=false;stopPlayback();selectedTime=D.start+43200;render();
   const bytes=()=>boats.reduce((total,boat)=>{
    const profile=trackProfileCache.get(boat.points),record=webglTracks.buffers.get(boat.points);
    total.cpu+=profile.samples.byteLength+profile.stations.byteLength+profile.timeSamples.byteLength+profile.timeStations.byteLength;total.gpu+=record.bytes;
    return total;
   },{cpu:0,gpu:0});
   window.referenceTestBytes=bytes;window.referenceTestInitial=bytes();
   window.referenceTestUploads=webglTracks.uploads;
   const forbidden=()=>{throw Error('Referencevalg genberegnede eller allokerede faste spordata');};
   webglTracks.preparation.prepare=forbidden;
   webglTracks.gl.createBuffer=webglTracks.gl.bufferData=webglTracks.gl.bufferSubData=forbidden;
   return {id:referenceBoatId,count:boats.length,bytes:referenceTestInitial,expectedCpu:boats.reduce((sum,boat)=>sum+(boat.points.length+1)*20+referenceStationCount()*8,0)};
  });
  assert.equal(baseline.bytes.cpu,baseline.expectedCpu,'All speed and time profiles remain linear in points and stations, never boat pairs');
  const format=await page.evaluate(()=>({
   bytes:boats.reduce((sum,boat)=>sum+trackProfileCache.get(boat.points).stations.byteLength,0),
   count:referenceStationCount(),boats:boats.length,
   compact:boats.every(boat=>trackProfileCache.get(boat.points).stations instanceof Float32Array),
   textureBytes:1024*Math.ceil(referenceStationCount()/1024)*16
  }));
  assert.equal(format.compact,true);assert.equal(format.bytes,format.count*format.boats*4);
  assert.equal(format.textureBytes,1024*Math.ceil(format.count/1024)*16);
  const manifest=await page.evaluate(async()=>await (await fetch('track-profiles/manifest.json',{cache:'no-store'})).json());
  assert.equal(manifest.version,10);assert.equal(manifest.replayEncoding,'source-integers-xor-byteplanes-v1');assert.equal(manifest.bundleFile,undefined);
  const downloads=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>/\/track-profiles\/.*\.bin\.gz$/.test(new URL(entry.name).pathname)).map(entry=>entry.name));
  assert.equal(downloads.length,1);assert.ok(downloads[0].endsWith('/source.bin.gz'));
  assert.equal(await page.evaluate(()=>boats.every(boat=>trackProfileCache.get(boat.points).stations.buffer.byteLength===referenceStationCount()*4)),true);
  await page.locator('#mapTracksToggle').click();
  assert.equal(await page.locator('#referenceBoat option').count(),baseline.count);
  const candidates=await page.evaluate(()=>['Vera','My','THE HULK'].map(name=>boats.find(boat=>boat.name===name).id));
  const timings=[],checks=[];
  for(const id of [...candidates,baseline.id,...candidates]){
   const result=await page.evaluate(id=>{
    const gl=webglTracks.gl;gl.finish();const start=performance.now();
    if(!saveReferenceBoat(id))throw Error($('comparisonStatus').textContent);
    gl.finish();const milliseconds=performance.now()-start;
    const reference=referenceBoat(),referenceProfile=trackProfileCache.get(reference.points),stations=referenceProfile.stations;
    let checked=0,maxError=0,missing=0;
    for(const boat of boats){
     const profile=trackProfileCache.get(boat.points),samples=profile.samples,record=webglTracks.buffers.get(boat.points);
     const gains=webglTracks.preparation.read(record.comparisonTexture,1024,record.comparisonHeight);
     const stride=Math.max(1,Math.floor(boat.points.length/31));
     for(let index=0;index<boat.points.length;index+=stride){
      const speed=samples[index*3+2],station=samples[index*3];
      const passage=speed<-1e19?null:referenceAtStation(station,stations);
      const corrected=correctedProjectedSpeed(speed,boat.handicapSecondsPerNm,reference.handicapSecondsPerNm);
      const timeStation=profile.timeSamples[index*2];
      const expected=[passage?speed-passage.vmg:null,passage&&corrected!==null?corrected-passage.vmg:null,timeStation<0?null:timeGainPer100Meters(profile.timeSamples[index*2+1],referenceProfile.timeStations[timeStation])];
      for(let basis=0;basis<3;basis++){
       const actual=gains[index*4+basis];
       if(expected[basis]===null){
        if(actual>=-1e19)throw Error(`Missing comparison was coloured: ${boat.name} #${index}`);
        missing++;
       }else{
        const difference=Math.abs(actual-expected[basis]);maxError=Math.max(maxError,difference);
        const handicapFactor=1+(reference.handicapSecondsPerNm-boat.handicapSecondsPerNm)*speed/3600;
        const conditioning=basis===1?Math.max(1,1/Math.abs(handicapFactor)):1;
        const tolerance=(basis===2?.002:.0002)+Math.abs(expected[basis])*.000002*conditioning;
        if(difference>tolerance)throw Error(`CPU/GPU mismatch: ${boat.name} #${index}: ${actual} vs ${expected[basis]}`);
        checked++;
       }
      }
     }
    }
    gl.bindBuffer(gl.COPY_READ_BUFFER,null);
    if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error after reference lookup');
    return {milliseconds,checked,missing,maxError,name:reference.name,bytes:referenceTestBytes()};
   },id);
   assert.ok(result.milliseconds<1000,`Reference switch took ${result.milliseconds} ms`);
   assert.ok(result.checked>1000);assert.deepEqual(result.bytes,baseline.bytes);
   assert.equal(await page.locator('#referenceBoatHeading').textContent(),` / ${result.name}`);
   timings.push(result.milliseconds);checks.push({name:result.name,checked:result.checked,missing:result.missing,maxError:result.maxError});
  }
  await page.locator('#trackStyle').selectOption('absolute');
  await page.locator('#trackStyle').selectOption('handicap');
  await page.locator('#trackStyle').selectOption('time');
  await page.evaluate(()=>{
   chosen.clear();selectedTime+=60;render();
   for(const boat of boats)chosen.add(boat.name);
   selectedTime-=60;render();
   if(!webglTracks.active)throw Error(webglTracks.error);
  });
  assert.equal(await page.evaluate(()=>webglTracks.uploads),await page.evaluate(()=>referenceTestUploads));
  const rejected=await page.evaluate(()=>{
   const original=Storage.prototype.setItem,previous=referenceBoatId;
   Storage.prototype.setItem=()=>{throw Error('Storage unavailable');};
   let result;
   try{result=saveReferenceBoat(boats.find(boat=>boat.id!==previous).id);}
   finally{Storage.prototype.setItem=original;}
   return {result,unchanged:referenceBoatId===previous,message:$('comparisonStatus').textContent};
  });
  assert.equal(rejected.result,false);assert.equal(rejected.unchanged,true);assert.match(rejected.message,/kunne ikke gemmes/);
  const saved=await page.evaluate(()=>referenceBoatId);
  await page.reload();await page.waitForSelector('main:not([inert])',{timeout:120000});
  assert.equal(await page.evaluate(()=>referenceBoatId),saved);
  assert.equal(await page.locator('#referenceBoat').inputValue(),saved);
  await page.evaluate(()=>{
   const extension=webglTracks.gl.getExtension('WEBGL_lose_context');
   if(!extension)throw Error('Firefox context-loss test requires WEBGL_lose_context');
   window.referenceContextExtension=extension;extension.loseContext();
  });
  await page.waitForFunction(()=>!webglTracks.active);
  await page.evaluate(()=>referenceContextExtension.restoreContext());
  await page.waitForFunction(()=>webglTracks.active&&webglTracks.comparisonReference===referenceBoat().points,null,{timeout:30000});
  assert.equal(await page.evaluate(()=>webglTracks.buffers.size),baseline.count);
  assert.deepEqual(errors,[]);
  const broken=await browser.newPage();
  await broken.route('**/track-profiles/manifest.json',route=>route.fulfill({json:{version:0}}));
  await broken.goto(url);await broken.waitForSelector('#viewerLoadingError:not([hidden])');
  assert.equal(await broken.locator('main').getAttribute('inert'),'');
  assert.equal(await broken.locator('#viewerLoadingRetry').isVisible(),true);
  await broken.close();
  for(const [key,value] of [['version',8],['coordinateScale',1000],['replayEncoding','float32'],['sourcePointBytes',20],['replayFile','track-profiles/../source.bin.gz'],['replayBytes',1],['sourceOffset',1],['pointCount',1]]){
   const invalid=await browser.newPage();
   await invalid.route('**/track-profiles/manifest.json',async route=>{
    const response=await route.fetch(),manifest=await response.json();
    if(['sourceOffset','pointCount'].includes(key))manifest.boats[0][key]=value;
    else manifest[key]=value;
    await route.fulfill({json:manifest});
   });
   await invalid.goto(url);await invalid.waitForSelector('#viewerLoadingError:not([hidden])');
   assert.equal(await invalid.evaluate(()=>typeof boats==='undefined'||typeof trackProfileCache==='undefined'||boats.every(boat=>!trackProfileCache.has(boat.points))),true);
   await invalid.close();
  }
  const invalid=await browser.newPage();
  await invalid.route('**/source.bin.gz',async route=>{
   const response=await route.fetch(),body=await response.body();await route.fulfill({body:body.subarray(1)});
  });
  await invalid.goto(url);await invalid.waitForSelector('#viewerLoadingError:not([hidden])');
  assert.equal(await invalid.locator('main').getAttribute('inert'),'');await invalid.close();
  console.log(JSON.stringify({browser:'firefox',checks,timingsMs:timings,bytes:baseline.bytes,format,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
