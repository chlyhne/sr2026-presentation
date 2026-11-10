const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>{
   chosen.clear();chosen.add('Mercutio');$('wind').checked=false;$('rain').checked=false;updateTimeline();setCurrentTime(D.start+3600);render();
   window.framesPlayed=0;window.originalAdvance=advancePlayback;advancePlayback=now=>{framesPlayed++;originalAdvance(now);};
  });
  await page.clock.install();await page.clock.pauseAt(new Date());
  const rates=await page.locator('#playbackSpeed option').evaluateAll(options=>options.map(o=>+o.value));assert.deepEqual(rates,[1,2,5,10,20,100,200,400]);
  assert.deepEqual(await page.locator('.transport-controls > button').evaluateAll(buttons=>buttons.map(button=>button.id)),['previousEvent','back','play','next','nextEvent']);
  assert.equal(await page.locator('#play').getAttribute('aria-label'),'Afspil');
  assert.equal(await page.locator('#playIcon').isVisible(),true);assert.equal(await page.locator('#pauseIcon').isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'Stop',exact:true}).count(),0);
  const beforeSpeedChange=await page.evaluate(()=>currentTime());
  assert.equal(await page.locator('#back').isDisabled(),true);
  for(const rate of rates.slice(1)){
   await page.locator('#next').click();assert.equal(await page.locator('#playbackSpeed').inputValue(),String(rate));
   assert.equal(await page.evaluate(()=>currentTime()),beforeSpeedChange);assert.equal(await page.evaluate(()=>!!interval),false);
  }
  assert.equal(await page.locator('#next').isDisabled(),true);
  for(const rate of rates.slice(0,-1).reverse()){
   await page.locator('#back').click();assert.equal(await page.locator('#playbackSpeed').inputValue(),String(rate));
   assert.equal(await page.evaluate(()=>currentTime()),beforeSpeedChange);assert.equal(await page.evaluate(()=>!!interval),false);
  }
  assert.equal(await page.locator('#back').isDisabled(),true);
  assert.equal(await page.evaluate(()=>playbackRate),1);
  await page.locator('#play').click();
  assert.equal(await page.locator('#play').getAttribute('aria-label'),'Pause');
  assert.equal(await page.locator('#playIcon').isVisible(),false);assert.equal(await page.locator('#pauseIcon').isVisible(),true);
  const initial=await page.evaluate(()=>currentTime());await page.clock.runFor(50);
  assert.ok(Math.abs(await page.evaluate(()=>currentTime())-initial-.05)<.001,'1x retains twentieth seconds');
  await page.clock.runFor(950);assert.equal(await page.evaluate(()=>framesPlayed),20);assert.ok(Math.abs(await page.evaluate(()=>currentTime())-initial-1)<.001);
  for(const rate of rates.slice(1)){
   await page.locator('#playbackSpeed').selectOption(String(rate));const before=await page.evaluate(()=>currentTime());
   await page.clock.runFor(1000);assert.ok(Math.abs(await page.evaluate(()=>currentTime())-before-rate)<.001,rate+'x follows elapsed time');
  }
  await page.locator('#play').click();const paused=await page.evaluate(()=>currentTime());await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>currentTime()),paused);
  assert.equal(await page.locator('#play').getAttribute('aria-label'),'Afspil');
  await page.locator('#playbackSpeed').selectOption('5');await page.locator('#play').click();
  await page.locator('#back').click();let before=await page.evaluate(()=>currentTime());
  assert.equal(await page.locator('#playbackSpeed').inputValue(),'2');assert.equal(await page.evaluate(()=>!!interval),true);
  await page.clock.runFor(1000);assert.ok(Math.abs(await page.evaluate(()=>currentTime())-before-2)<.001,'Slower is still forward playback');
  await page.locator('#next').click();before=await page.evaluate(()=>currentTime());
  assert.equal(await page.locator('#playbackSpeed').inputValue(),'5');assert.equal(await page.evaluate(()=>!!interval),true);
  await page.clock.runFor(1000);assert.ok(Math.abs(await page.evaluate(()=>currentTime())-before-5)<.001,'Faster changes one speed level without pausing');
  await page.locator('#time').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>!!interval),false,'Manual keyboard step pauses');
  // Crossing hidden periods and stopping at the end must work with fractional frames.
  await page.evaluate(()=>{visibleTimeRanges=[{start:D.start,end:D.start+2},{start:D.start+100,end:D.start+103}];timelineLength=7;selectedTime=D.start;$('time').disabled=false;$('time').max=6;$('playbackSpeed').value='10';});
  await page.locator('#play').click();await page.clock.runFor(300);assert.equal(await page.evaluate(()=>currentTime()),await page.evaluate(()=>D.start+100));
  await page.clock.runFor(300);assert.equal(await page.evaluate(()=>currentTime()),await page.evaluate(()=>D.start+103));assert.equal(await page.evaluate(()=>!!interval),false);
  assert.equal(await page.locator('#playIcon').isVisible(),true);assert.equal(await page.locator('#pauseIcon').isVisible(),false);
  await page.evaluate(()=>{
   const settings={...sceneSettings(),wind:false,rain:false},time=D.start+3600;
   notes=[{time,text:'A',view:[230,250,620,760],settings},{time:time+60,text:'B',view:[230,250,620,760],settings},{time:time+120,text:'C',view:[230,250,620,760],settings}];
   showNotes();restoreNote(notes[1]);
  });
  await page.locator('#previousEvent').click();assert.equal(await page.evaluate(()=>activePresentationNote.text),'A');assert.equal(await page.locator('#previousEvent').isDisabled(),true);
  await page.locator('#nextEvent').click();assert.equal(await page.evaluate(()=>activePresentationNote.text),'B');
  await page.locator('#nextEvent').click();assert.equal(await page.evaluate(()=>activePresentationNote.text),'C');assert.equal(await page.locator('#nextEvent').isDisabled(),true);
  await page.locator('#eventSelect').selectOption('1');await page.locator('#playbackSpeed').selectOption('5');
  await page.screenshot({path:'/tmp/sr2026-playbar.png'});
  assert.deepEqual(errors,[]);console.log('Firefox PC: conventional transport order and icons, play/pause, all speed steps and bounds, no reverse playback, unchanged paused time, live speed changes, 20 FPS, fractional playback, keyboard steps, event navigation, hidden periods and end pause.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
