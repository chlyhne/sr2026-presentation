const assert=require('node:assert/strict');
const path=require('node:path');
const installTrackFixtures=require('./viewer-track-fixtures.cjs');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  await installTrackFixtures(page);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const fixtures=await page.evaluate(()=>{
   const settings={...sceneSettings(),rain:false,wind:false,boats:['Mercutio']};
   return [{time:D.start+3600,text:'Event ved start',point:xy([12.6,56.02]),view:[230,250,620,760],settings},
    {time:D.start+18*3600,text:'Event undervejs',view:[230,250,620,760],settings},
    {time:D.start+25*3600,text:'Event uden både',view:[900,60,15,15],settings:{...settings,boats:[]}},
    {time:D.start+25*3600,text:'Et andet event på samme tid',view:[900,60,15,15],settings:{...settings,boats:[]}}];
  });
  await page.evaluate(notes=>localStorage.setItem('sr2026-notes',JSON.stringify(notes)),fixtures);
  await page.reload();await page.waitForSelector('main:not([inert])',{timeout:120000});await page.waitForFunction(()=>document.querySelectorAll('.note-jump').length===4);
  const original=await page.evaluate(()=>localStorage.getItem('sr2026-notes'));
  async function checkDesktopControls(){
   const map=await page.locator('#map').boundingBox(),panel=await page.locator('#eventPanel').boundingBox();
   const timeline=await page.locator('#editingTimeline').boundingBox(),navigation=await page.locator('#presentationFooter').boundingBox();
   assert.ok(Math.abs(timeline.x-map.x)<1&&Math.abs(timeline.width-map.width)<1,'Timeline aligns under map');
   assert.ok(Math.abs(navigation.x-panel.x)<1&&Math.abs(navigation.width-panel.width)<1,'Event navigation aligns under right panel');
   assert.ok(Math.abs(timeline.y-navigation.y)<1,'Controls share one row');
   assert.ok(Math.abs(timeline.y-(map.y+map.height))<1);
   assert.ok(Math.abs(navigation.y-(panel.y+panel.height))<1);
   assert.match(await page.locator('#clock').textContent(),/^\d{2}:\d{2}:\d{2}$/);
   assert.equal(await page.locator('#timelineHelp').count(),0);
   assert.equal(await page.locator('#timeWindow').isVisible(),false);
   assert.equal(await page.locator('#status').isVisible(),false);
  }
  await checkDesktopControls();
  assert.equal(await page.locator('#timelineEvents .timeline-event').count(),3);
  async function scrubNear(index,delta=15){
   const time=fixtures[index].time;
   await page.evaluate(({time,delta})=>{
    const distance=Math.min(Math.abs(delta),Math.floor(eventSnapWindowSeconds()/2));
    $('time').value=offsetAtTime(time)+Math.sign(delta)*distance;
    $('time').dispatchEvent(new Event('input',{bubbles:true}));
   },{time,delta});
   assert.equal(await page.evaluate(()=>currentTime()),time,'Slider snaps exactly to the event');
   assert.equal(await page.locator('#eventSelect').inputValue(),String(index));
  }
  await scrubNear(1);
  await page.locator('#time').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>currentTime()),fixtures[1].time+1,'Keyboard escapes the snap zone');
  await page.keyboard.press('Shift+ArrowRight');assert.equal(await page.evaluate(()=>currentTime()),fixtures[1].time+61);
  await page.locator('#startPresentation').click();
  assert.equal(await page.locator('#editingTimeline').isVisible(),true);
  assert.equal(await page.locator('aside').isVisible(),false);
  await checkDesktopControls();
  assert.match(await page.locator('#eventTime').textContent(),/^\d{2}:\d{2}:\d{2}$/);
  assert.equal(await page.evaluate(()=>currentTime()),fixtures[1].time);
  await scrubNear(0,-5);
  await page.waitForFunction(()=>$('annotations').children.length===1);
  assert.equal(await page.locator('#annotations > g').count(),1);
  const savedView=await page.evaluate(()=>[...view]);
  await scrubNear(1);
  assert.deepEqual(await page.evaluate(()=>[...view]),savedView,'Scrubbing keeps the current map view');
  await page.locator('#time').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>currentTime()),fixtures[1].time+1,'Arrows on slider move time, not events');
  assert.equal(await page.locator('#eventSelect').inputValue(),'1');
  await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>currentTime()),await page.evaluate(()=>timeAtOffset(0)));
  // A free position away from event markers remains an ordinary time selection.
  const unsnapped=await page.evaluate(()=>{
   const offset=Math.floor(timelineLength*.4);seekTimeline(offset);return {actual:currentTime(),expected:timeAtOffset(offset)};
  });assert.equal(unsnapped.actual,unsnapped.expected);
  await page.locator('#eventSelect').selectOption('2');
  assert.equal(await page.evaluate(()=>currentTime()),fixtures[2].time);
  assert.equal(await page.locator('#time').isDisabled(),false,'No-boats events still have a usable presentation slider');
  const before=await page.evaluate(()=>currentTime());
  await page.setViewportSize({width:1100,height:850});await page.waitForTimeout(100);
  const box=await page.locator('#map').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-140);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>currentTime()),before,'Zoom and resize preserve scrub time');
  assert.equal(await page.locator('#timelineEvents .timeline-event').count(),0,'No snap markers without visible boats');
  const noBoatSeek=await page.evaluate(()=>{
   const offset=offsetAtTime(activePresentationNote.time)+500;seekTimeline(offset);
   return {time:currentTime(),expected:timeAtOffset(offset)};
  });assert.equal(noBoatSeek.time,noBoatSeek.expected,'No snapping in full-range fallback without visible boats');
  await page.locator('#eventSelect').selectOption('3');
  assert.equal(await page.evaluate(()=>currentTime()),fixtures[3].time);
  await page.locator('#time').focus();await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(()=>currentTime()),fixtures[3].time-1);
  await page.locator('#next').click();assert.equal(await page.evaluate(()=>currentTime()),fixtures[3].time);
  await page.locator('#play').click();
  await page.waitForFunction(time=>currentTime()>time,fixtures[3].time);
  await page.locator('#play').click();const paused=await page.evaluate(()=>currentTime());
  await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>currentTime()),paused);
  await page.locator('#eventSelect').selectOption('1');assert.equal(await page.evaluate(()=>currentTime()),fixtures[1].time);
  await page.setViewportSize({width:390,height:740});await page.waitForTimeout(100);
  const mobile=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,map:$('map').getBoundingClientRect().height,
   bottom:$('presentationFooter').getBoundingClientRect().bottom,slider:$('time').getBoundingClientRect().width}));
  assert.ok(mobile.scroll<=mobile.width);assert.ok(mobile.map>250);assert.ok(mobile.bottom<=742);assert.ok(mobile.slider>300);
  await page.screenshot({path:'/tmp/sr2026-timeline-'+type.name()+'-mobile.png'});
  await page.setViewportSize({width:1500,height:1000});await page.waitForTimeout(100);
  await page.screenshot({path:'/tmp/sr2026-timeline-'+type.name()+'-desktop.png'});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#editingTimeline').isVisible(),true);
  assert.equal(await page.locator('#presentationFooter').isVisible(),true);
  await checkDesktopControls();
  await scrubNear(1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('sr2026-notes')),original,'Scrubbing does not modify events');
  // Reproduce two visits to the same small map window, separated by many events.
  const gapChecks=await page.evaluate(()=>{
   const start=D.start,end=D.end;
   const points=[[11,55,start+1000],[11.001,55,start+1060],[11,55,end-1060],[11.001,55,end-1000]];
   boats.splice(0,boats.length,{id:'gap-test',name:'Gap Test',metadata:boatMetadata('Gap Test'),points,speeds:[4,4,5,5]});
   referenceBoatId=boats[0].id;prepareTrackFixture(boats[0]);
   colours['Gap Test']='#ffdc42';chosen.clear();chosen.add('Gap Test');
   const [x,y]=xy([11,55]),mapView=[x-5,y-5,20,20];
   const settings={...sceneSettings(),boats:['Gap Test']};
   notes=[{time:start+1030,text:'Første passage',view:mapView,settings},
    ...[12000,50000,80000].map((t,i)=>({time:start+t,text:'Event i hullet '+i,view:mapView,settings})),
    {time:end-1030,text:'Sidste passage',view:mapView,settings}];
   localStorage.setItem('sr2026-notes',JSON.stringify(notes));const stored=localStorage.getItem('sr2026-notes');
   showNotes();restoreNote(notes[0]);
   const check=(ok,message)=>{if(!ok)throw new Error(message);};
   for(const presenting of [false,true]){
    setPresentationMode(presenting);view=[...mapView];setview();
    check(boatTimeRanges.length===2,'Exactly two boat visits');
    check(visibleTimeRanges.length===2,'Events must not insert singleton ranges in the gap');
    check(snappableTimelineNotes().length===2,'Only events within boat visits may snap');
    check($('timelineEvents').children.length===2,'Gap events do not appear as snap targets');
    for(let offset=0;offset<timelineLength;offset++){
     const time=timeAtOffset(offset);
     check(time<=start+1360||time>=end-1060,'Slider must skip the entire gap');
    }
    const boundary=boatTimeRanges[0].end-boatTimeRanges[0].start;
    for(const offset of [boundary-1,boundary,boundary+1,boundary+2]){
     seekTimeline(offset);
     check(currentTime()<=start+1360||currentTime()>=end-1060,'Seeking around seam cannot snap into the gap');
    }
    for(const index of [0,4]){
     const offset=offsetAtTime(notes[index].time);seekTimeline(offset);
     check(currentTime()===notes[index].time,'Visible events still snap');
    }
    restoreNote(notes[1]);
    check(currentTime()===notes[1].time,'Manual jump to a gap event preserves exact time');
    if(presenting){
     movePresentationEvent(1);if(eventPlaybackTarget)movePresentationEvent(1);
     check(currentTime()===notes[2].time,'Next event can enter the gap with a second press');
     movePresentationEvent(-1);check(currentTime()===notes[1].time,'Previous event can enter the gap');
     view=[...mapView];setview();check(currentTime()===notes[1].time,'Gap event survives view updates');
    }
    check(snappableTimelineNotes().length===2,'Manually selected gap event never becomes a snap target');
    check(visibleTimeRanges.length===2,'Manual gap navigation never adds gap times to slider');
    seekTimeline(boundary);check(currentTime()<=start+1360||currentTime()>=end-1060,'Scrubbing leaves manual gap event behind');
    check(localStorage.getItem('sr2026-notes')===stored,'Gap navigation does not change saved notes');
   }
   return true;
  });assert.equal(gapChecks,true);
  const proportionalSnapChecks=await page.evaluate(()=>{
   const eventTime=D.start+10800,[x,y]=xy([11,55]);
   const boat={id:'snap-test',name:'Snap Test',metadata:boatMetadata('Snap Test'),points:Array.from({length:361},(_,i)=>[11,55,D.start+i*60]),speeds:Array(361).fill(5)};
   boats.splice(0,boats.length,boat);colours[boat.name]='#ffdc42';chosen.clear();chosen.add(boat.name);
   referenceBoatId=boat.id;prepareTrackFixture(boat);
   notes=[{time:eventTime,text:'Zoom snap',view:[x-310,y-310,620,620],settings:{...sceneSettings(),boats:[boat.name]}}];
   showNotes();restoreNote(notes[0]);
   const stored=localStorage.getItem('sr2026-notes');
   const check=(ok,message)=>{if(!ok)throw new Error(message);};
   for(const presenting of [false,true]){
    setPresentationMode(presenting);
    for(const width of [1240,620,310,62,6.2]){
     view=[x-width/2,y-width/2,width,width];setview();
     const limit=(timelineLength-1)*.01;
     check(Math.abs(eventSnapWindowSeconds()-limit)<1e-6,'Snap window is one percent of the slider at every map zoom');
     check(limit>60,'Long timelines snap beyond the old fixed time cap');
     for(const sign of [-1,1]){
      seekTimeline(offsetAtTime(eventTime)+sign*Math.floor(limit));
      check(currentTime()===eventTime,'Snap includes the one-percent threshold on both sides');
      const outside=offsetAtTime(eventTime)+sign*(Math.floor(limit)+1);seekTimeline(outside);
      check(currentTime()===timeAtOffset(outside),'Outside the one-percent threshold must not snap');
     }
     check(chosen.size===1&&chosen.has(boat.name),'Snapping preserves active boats');
     check(view[2]===width,'Snapping preserves map zoom');
    }
    // Adjacent offsets across a compressed gap must not snap backwards in time.
    boat.points=[[11,55,D.start+1000],[11,55,D.start+1060],[11,55,D.end-1060],[11,55,D.end-1000]];
    prepareTrackFixture(boat);
    view=[x-310,y-310,620,620];setview();
    notes[0].time=boatTimeRanges[0].end;renderTimelineEvents();
    const afterGap=offsetAtTime(boatTimeRanges[1].start);seekTimeline(afterGap);
    check(currentTime()===boatTimeRanges[1].start,'No snap across a hidden time gap even one slider second away');
    boat.points=Array.from({length:361},(_,i)=>[11,55,D.start+i*60]);notes[0].time=eventTime;
    prepareTrackFixture(boat);
   }
   check(localStorage.getItem('sr2026-notes')===stored,'Proportional snapping does not persist changes');
   return true;
  });assert.equal(proportionalSnapChecks,true);
  // Real pointer input: a short passage resolves seconds into multiple pixels.
  for(const presenting of [false,true]){
   await page.evaluate(presenting=>{
    setPresentationMode(presenting);
    const t=notes[0].time;
    boats[0].points=[-60,0,60].map(delta=>[11,55,t+delta]);
    prepareTrackFixture(boats[0]);
    view=[...notes[0].view];setview();
   },presenting);
   await page.waitForTimeout(100);
   const rect=await page.locator('#time').boundingBox();
   const ratio=await page.evaluate(()=>offsetAtTime(notes[0].time)/(timelineLength-1));
   const snapPixels=(rect.width-16)*.01;
   for(const fraction of [.4,2]){
    const delta=snapPixels*fraction;
    await page.locator('#time').click({position:{x:8+(rect.width-16)*ratio+delta,y:rect.height/2}});
    assert.equal(await page.evaluate(()=>currentTime()===notes[0].time),fraction<1,'Pointer snaps only inside one percent of the slider');
   }
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'slider in both modes, one-percent snap window at all map zooms, no fixed time cap, pointer snap inside/outside one percent, no snap across hidden gaps, manual gap navigation, keyboard, playback, no boats, resize, mobile layout, event persistence',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
