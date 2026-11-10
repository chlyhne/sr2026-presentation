const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
const url=process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/';
(async()=>{
 const browser=await firefox.launch({headless:false});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.waitForSelector('main:not([inert])',{timeout:120000});
  const baseline=await page.evaluate(()=>{
   $('wind').checked=$('rain').checked=false;stopPlayback();selectedTime=D.start+43200;render();
   const bytes=()=>boats.reduce((total,boat)=>{
    const profile=trackProfileCache.get(boat.points),record=webglTracks.buffers.get(boat.points);
    total.cpu+=profile.samples.byteLength+profile.stations.byteLength;total.gpu+=record.bytes;
    return total;
   },{cpu:0,gpu:0});
   window.referenceTestBytes=bytes;window.referenceTestInitial=bytes();
   window.referenceTestUploads=webglTracks.uploads;
   const forbidden=()=>{throw Error('Referencevalg genberegnede eller allokerede faste spordata');};
   projectedTrackSample=prepareProjectedTrack=prepareReferencePassages=forbidden;
   webglTracks.gl.createBuffer=webglTracks.gl.bufferData=webglTracks.gl.bufferSubData=forbidden;
   return {id:referenceBoatId,count:boats.length,bytes:referenceTestInitial};
  });
  await page.locator('#mapTracksToggle').click();
  assert.equal(await page.locator('#referenceBoat option').count(),baseline.count);
  const candidates=await page.evaluate(()=>['Vera','My','THE HULK'].map(name=>boats.find(boat=>boat.name===name).id));
  const timings=[],checks=[];
  for(const id of [...candidates,baseline.id,...candidates]){
   const result=await page.evaluate(id=>{
    const gl=webglTracks.gl;gl.finish();const start=performance.now();
    if(!saveReferenceBoat(id))throw Error($('comparisonStatus').textContent);
    gl.finish();const milliseconds=performance.now()-start;
    const reference=referenceBoat(),stations=trackProfileCache.get(reference.points).stations;
    let checked=0,maxError=0,missing=0;
    for(const boat of boats){
     const samples=trackProfileCache.get(boat.points).samples,record=webglTracks.buffers.get(boat.points);
     const gains=new Float32Array((boat.points.length+1)*2);
     gl.bindBuffer(gl.COPY_READ_BUFFER,record.comparisonBuffer);gl.getBufferSubData(gl.COPY_READ_BUFFER,0,gains);
     const stride=Math.max(1,Math.floor(boat.points.length/31));
     for(let index=0;index<boat.points.length;index+=stride){
      const speed=samples[index*3+2],progress=samples[index*3]+samples[index*3+1];
      const passage=speed<-1e19?null:packedReferenceAtProgress(progress,stations);
      const corrected=correctedProjectedSpeed(speed,boat.handicapSecondsPerNm,reference.handicapSecondsPerNm);
      const expected=[passage?speed-passage.vmg:null,passage&&corrected!==null?corrected-passage.vmg:null];
      for(let basis=0;basis<2;basis++){
       const actual=gains[index*2+basis];
       if(expected[basis]===null){
        if(actual>=-1e19)throw Error(`Missing comparison was coloured: ${boat.name} #${index}`);
        missing++;
       }else{
        const difference=Math.abs(actual-expected[basis]);maxError=Math.max(maxError,difference);
        if(difference>0.0002)throw Error(`CPU/GPU mismatch: ${boat.name} #${index}: ${actual} vs ${expected[basis]}`);
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
  console.log(JSON.stringify({browser:'firefox',checks,timingsMs:timings,bytes:baseline.bytes,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
