const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await require('./viewer-track-fixtures.cjs')(page);
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18454/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.waitForTimeout(200);
  await page.clock.install();await page.clock.pauseAt(new Date());
  await page.evaluate(()=>{
   stopPlayback();notes=[];activePresentationNote=null;
   $('wind').checked=$('rain').checked=false;comparison.enabled=false;handicapTracksEnabled=false;
   const boat={...boats[0],points:Array.from({length:101},(_,i)=>{
    const t=i*100,x=500+(t<=3000?t:t<=6000?6000-t:t-6000)*.01;
    return [9.5+x*4.5/1000,57-500*3/1180,D.start+t];
   }),speeds:Array(101).fill(8)};
   boats.splice(0,boats.length,boat);referenceBoatId=boat.id;boatFavouritesOnly=false;boatSearchQuery='';
   prepareTrackFixture(boat);webglTracks.prepare(boat);
   window.probeView=(x,width)=>{
    const rect=mapViewport().rect,height=width*rect.height/rect.width;
    view=[x,500-height/2,width,height];setview();
   };
   window.probeStart=(time,rate=10)=>{
    stopPlayback();setCurrentTime(D.start+time,{fractional:true,allowOutsideVisibleRanges:true});
    probeView(501,.1);syncTimelineViewport();render();$('playbackSpeed').value=String(rate);
   };
   window.probeZoomOut=()=>{
    const rect=mapViewport().rect;
    for(let i=0;i<55;i++)$('map').dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,deltaY:100,cancelable:true}));
    flushRender();
   };
  });
  const state=()=>page.evaluate(()=>{flushRender();return {time:currentTime()-D.start,playing:interval!==null,sliderEnd:visibleTimeRanges.at(-1)?.end-D.start,
   marker:$('boatMarkers').querySelector('.boat-marker')?.dataset.sourceTime,playDisabled:$('play').disabled,sliderDisabled:$('time').disabled};});
  for(const start of [100.05,6100.05]){
   await page.evaluate(start=>probeStart(start),start);
   await page.locator('#play').click();await page.evaluate(()=>probeZoomOut());await page.clock.runFor(2000);
   const s=await state();assert.ok(Math.abs(s.time-start-20)<.001,'Zoom must cross old visit boundaries without seeking: '+JSON.stringify(s));
   assert.equal(s.playing,true,'Old viewport end must not stop playback');
   assert.ok(s.sliderEnd>9000);assert.ok(Math.abs(Number(s.marker)-(await page.evaluate(()=>currentTime())))<.001,'Boat and replay clock agree');
  }
  await page.evaluate(()=>probeStart(3000));await page.clock.runFor(200);
  assert.equal((await state()).time,3000,'A derived viewport update preserves an out-of-view time');
  await page.locator('#play').click();await page.clock.runFor(50);
  assert.ok(Math.abs((await state()).time-3000.5)<.001,'Starting outside slider visits must not seek');
  await page.evaluate(()=>probeStart(109.9,1));await page.locator('#play').click();
  for(let i=1;i<=10;i++){
   await page.clock.runFor(50);const s=await state();
   assert.ok(Math.abs(s.time-109.9-i*.05)<.001,'Every tick crosses the visit end continuously: '+JSON.stringify(s));assert.equal(s.playing,true);
  }
  await page.evaluate(()=>{stopPlayback();probeView(9000,20);syncTimelineViewport();});
  let s=await state();assert.equal(s.sliderDisabled,true);assert.equal(s.playDisabled,false,'Play remains available with no visits');
  await page.locator('#play').click();await page.clock.runFor(25);await page.evaluate(()=>updateTimeline());await page.clock.runFor(25);
  const after=await state();assert.ok(Math.abs(after.time-s.time-.05)<.001,'Derived refresh must not reset the tick timestamp');
  await page.locator('#play').click();s=await state();assert.equal(s.playing,false);assert.equal(s.playDisabled,false,'Resume remains available with a disabled slider');
  await page.locator('#play').click();await page.clock.runFor(50);assert.ok(Math.abs((await state()).time-s.time-.05)<.001);
  await page.evaluate(()=>{stopPlayback();setCurrentTime(D.end-.075,{fractional:true,allowOutsideVisibleRanges:true});$('playbackSpeed').value='1';});
  await page.locator('#play').click();await page.clock.runFor(100);
  s=await state();assert.equal(s.time,await page.evaluate(()=>D.end-D.start));assert.equal(s.playing,false);assert.equal(s.playDisabled,true,'Ordinary playback ends exactly at the global source end');
  const end=await page.evaluate(()=>{
   handicapTracksEnabled=true;const end=viewerEndTime();boatFavouritesOnly=true;chosen.clear();updateTimeline();
   if(viewerEndTime()!==end||end!==VIEWER_DATA_END)throw Error('Handicap playback end depends on displayed boats');
   setCurrentTime(end-.075,{fractional:true,allowOutsideVisibleRanges:true});return end-D.start;
  });
  await page.locator('#play').click();await page.clock.runFor(100);
  s=await state();assert.equal(s.time,end);assert.equal(s.playing,false);assert.equal(s.playDisabled,true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',checks:'real wheel zoom across old visit boundaries and end, preserved gap time on start, continuous fractional ticks, empty viewport play/pause/resume, derived refresh between ticks, source and handicap global end, retained marker agrees with clock',errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
