const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>{setPresentationMode(true);$('wind').checked=$('rain').checked=false;});
  await page.waitForTimeout(100);
  await page.clock.install();await page.clock.pauseAt(new Date());
  const fixture=await page.evaluate(()=>{
   syncTimelineViewport();
   const base=D.start+3600,settings={...sceneSettings(),wind:true,rain:true,boats:[]};
   notes=[[100,'A'],[110,'B'],[120,'C'],[120,'C duplicate'],[500.025,'Hidden'],[1100,'Next visit']].map(([t,text])=>({time:base+t,text,view:[0,0,2,2],settings}));
   persistNotes(notes);showNotes();
   visibleTimeRanges=[{start:base,end:base+300},{start:base+1000,end:base+1300}];boatTimeRanges=visibleTimeRanges.map(r=>({...r}));timelineLength=602;
   $('time').max=601;$('time').disabled=false;$('play').disabled=false;
   selectedTime=base+90;activePresentationNote=notes[0];setCurrentTime(selectedTime);render();
   return {base,scene:sceneSettings(),view:[...view],saved:localStorage.getItem('sr2026-notes')};
  });
  const state=()=>page.evaluate(()=>({time:currentTime(),event:activePresentationNote.text,playing:!!interval,scene:sceneSettings(),view:[...view],saved:localStorage.getItem('sr2026-notes')}));
  const preserved=s=>{assert.deepEqual(s.scene,fixture.scene);assert.deepEqual(s.view,fixture.view);assert.equal(s.saved,fixture.saved);};
  await page.locator('#playbackSpeed').selectOption('400');await page.locator('#play').click();await page.clock.runFor(100);
  let s=await state();assert.equal(s.time,fixture.base+130);assert.equal(s.event,'C');assert.equal(s.playing,true);preserved(s);
  await page.clock.runFor(100);s=await state();assert.equal(s.time,fixture.base+170);assert.equal(s.event,'C');preserved(s);
  await page.locator('#play').click();
  // Fractional 1x ticks must select an event even without hitting its exact time.
  await page.evaluate(base=>{selectedTime=base+99.95;activePresentationNote=notes[1];setCurrentTime(selectedTime,{fractional:true});},fixture.base);
  await page.locator('#playbackSpeed').selectOption('1');await page.locator('#play').click();await page.clock.runFor(100);
  s=await state();assert.ok(Math.abs(s.time-fixture.base-100.05)<.001);assert.equal(s.event,'A');assert.equal(s.playing,true);preserved(s);await page.locator('#play').click();
  // Continuous replay selects crossed events even in a gap, without stopping.
  await page.evaluate(base=>{selectedTime=base+290;activePresentationNote=notes[0];setCurrentTime(selectedTime);},fixture.base);
  await page.locator('#playbackSpeed').selectOption('400');await page.locator('#play').click();await page.clock.runFor(100);
  s=await state();assert.equal(s.time,fixture.base+330);assert.equal(s.event,'A');assert.equal(s.playing,true);
  await page.clock.runFor(1900);s=await state();assert.equal(s.time,fixture.base+1090);assert.equal(s.event,'Hidden');assert.equal(s.playing,true);preserved(s);
  await page.clock.runFor(50);s=await state();assert.equal(s.time,fixture.base+1110);assert.equal(s.event,'Next visit');preserved(s);await page.locator('#play').click();
  // Large slider movements activate crossed events in both directions.
  await page.evaluate(base=>{
   // Initial layout may have refreshed the real geographic slider during
   // playback. Install the manual-slider fixture after that refresh.
   syncTimelineViewport();
   visibleTimeRanges=[{start:base,end:base+300},{start:base+1000,end:base+1300}];boatTimeRanges=visibleTimeRanges.map(r=>({...r}));timelineLength=602;
   $('time').max=601;$('time').disabled=false;
   selectedTime=base+90;setCurrentTime(selectedTime);$('time').value=220;$('time').dispatchEvent(new Event('input'));
  },fixture.base);
  s=await state();assert.equal(s.time,fixture.base+220);assert.equal(s.event,'C');preserved(s);
  await page.evaluate(()=>{$('time').value=80;$('time').dispatchEvent(new Event('input'));});
  s=await state();assert.equal(s.time,fixture.base+80);assert.equal(s.event,'A');preserved(s);
  // Mouse wheel selects crossed events and can keep moving away from them.
  await page.evaluate(base=>{setCurrentTime(base+99);$('time').dispatchEvent(new WheelEvent('wheel',{deltaY:1,cancelable:true}));},fixture.base);
  s=await state();assert.equal(s.time,fixture.base+100);assert.equal(s.event,'A');preserved(s);
  await page.evaluate(()=>$('time').dispatchEvent(new WheelEvent('wheel',{deltaY:1,cancelable:true})));
  s=await state();assert.equal(s.time,fixture.base+101);assert.equal(s.event,'A');preserved(s);
  await page.evaluate(base=>{setCurrentTime(base+90);$('time').dispatchEvent(new WheelEvent('wheel',{deltaY:1,shiftKey:true,cancelable:true}));},fixture.base);
  s=await state();assert.equal(s.time,fixture.base+150);assert.equal(s.event,'C');preserved(s);
  // A manually chosen event among same-time events stays chosen on crossing.
  await page.evaluate(base=>{setCurrentTime(base+90);activePresentationNote=notes[3];},fixture.base);
  await page.locator('#playbackSpeed').selectOption('400');await page.locator('#play').click();await page.clock.runFor(100);
  s=await state();assert.equal(s.event,'C duplicate');assert.equal(s.playing,true);preserved(s);await page.locator('#play').click();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:type.name(),checks:'continuous 400x and fractional 1x playback, crossed events, compressed gaps, forward/reverse scrub, wheel, stable same-time selection, unchanged scene/storage',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
