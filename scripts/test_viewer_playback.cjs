const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForFunction(()=>typeof stopPlayback==='function');
  await page.evaluate(()=>{
   chosen.clear();chosen.add('Mercutio');$('wind').checked=false;$('rain').checked=false;updateTimeline();setCurrentTime(D.start+3600);render();
   window.framesPlayed=0;window.originalAdvance=advancePlayback;advancePlayback=now=>{framesPlayed++;originalAdvance(now);};
  });
  await page.clock.install();await page.clock.pauseAt(new Date());
  const rates=await page.locator('#playbackSpeed option').evaluateAll(options=>options.map(o=>+o.value));assert.deepEqual(rates,[1,2,5,10,20,100,200,400]);
  await page.locator('#play').click();
  const initial=await page.evaluate(()=>currentTime());await page.clock.runFor(50);
  assert.ok(Math.abs(await page.evaluate(()=>currentTime())-initial-.05)<.001,'1x retains twentieth seconds');
  await page.clock.runFor(950);assert.equal(await page.evaluate(()=>framesPlayed),20);assert.ok(Math.abs(await page.evaluate(()=>currentTime())-initial-1)<.001);
  for(const rate of rates.slice(1)){
   await page.locator('#playbackSpeed').selectOption(String(rate));const before=await page.evaluate(()=>currentTime());
   await page.clock.runFor(1000);assert.ok(Math.abs(await page.evaluate(()=>currentTime())-before-rate)<.001,rate+'x follows elapsed time');
  }
  await page.locator('#play').click();const paused=await page.evaluate(()=>currentTime());await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>currentTime()),paused);
  await page.locator('#play').click();await page.locator('#next').click();assert.equal(await page.evaluate(()=>!!interval),false,'Manual step pauses');
  // Crossing hidden periods and stopping at the end must work with fractional frames.
  await page.evaluate(()=>{visibleTimeRanges=[{start:D.start,end:D.start+2},{start:D.start+100,end:D.start+103}];timelineLength=7;selectedTime=D.start;$('time').disabled=false;$('time').max=6;$('playbackSpeed').value='10';});
  await page.locator('#play').click();await page.clock.runFor(300);assert.equal(await page.evaluate(()=>currentTime()),await page.evaluate(()=>D.start+100));
  await page.clock.runFor(300);assert.equal(await page.evaluate(()=>currentTime()),await page.evaluate(()=>D.start+103));assert.equal(await page.evaluate(()=>!!interval),false);
  assert.deepEqual(errors,[]);console.log('Playback verified in desktop Firefox: 20 FPS, fractional 1x, every speed, live speed changes, pause, manual stepping, hidden periods, end stop.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
