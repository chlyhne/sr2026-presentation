const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={admin:false,apiBase:""};'}));
  await page.route('**/presentation.json',route=>route.fulfill({json:{version:1,notes:[],speedPins:[]}}));
  const imageID='11111111-1111-4111-8111-111111111111';
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  const photo=Buffer.from(await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=80;canvas.height=60;
   const context=canvas.getContext('2d');context.fillStyle='#ffce5c';context.fillRect(0,0,80,60);
   return canvas.toDataURL('image/png').split(',')[1];
  }),'base64');
  await page.route('**/event-images/'+imageID+'.png',route=>route.fulfill({contentType:'image/png',body:photo}));
  const fixture=await page.evaluate(imageID=>{
   const time=D.start+3600;
   const a={wind:false,windNumbers:false,rain:false,rainOpacity:.25,traffic:false,military:false,
    annotationsVisible:true,windModel:'dmi_harmonie_arome_europe',boats:['Mercutio','Vera'],boatNames:[]};
   const b={wind:true,windNumbers:true,rain:true,rainOpacity:.8,traffic:true,military:true,
    annotationsVisible:false,windModel:'era5',boats:['My'],boatNames:[boats.find(boat=>boat.name==='My').id]};
   notes=[
    {time,text:'A',view:[230,250,620,760],settings:a},
    {time:time+10.05,text:'B',view:[400,300,330,420],settings:b},
    {time:time+10.05,text:'B samme tid',view:[350,280,400,500],settings:{...a,boats:['Vera']}},
    {time:time+40,text:'C',view:[300,250,420,600],settings:{...b,boats:['Mercutio']}},
    {time:time+120,text:'D billede',view:[230,250,620,760],settings:a,image:{id:imageID,url:'event-images/'+imageID+'.png',name:'Foto'}}
   ];
   showNotes();restoreNote(notes[0]);
   return {time,notes:JSON.parse(JSON.stringify(notes))};
  },imageID);
  await page.clock.install();await page.clock.pauseAt(new Date());
  const state=()=>page.evaluate(()=>({time:currentTime(),playing:!!interval,target:eventPlaybackTarget?.text||null,
   event:activePresentationNote.text,settings:sceneSettings(),view:[...view],
   mercutio:xy(trackPosition(boats.find(boat=>boat.name==='Mercutio').points,currentTime()).point)}));
  const sceneMatches=(actual,index)=>{assert.deepEqual(actual.settings,fixture.notes[index].settings);assert.deepEqual(actual.view,fixture.notes[index].view);};
  const arrivalMatches=(actual,index,zoomIndex)=>{
   assert.deepEqual(actual.settings,fixture.notes[index].settings);
   assert.deepEqual(actual.view.slice(2),fixture.notes[zoomIndex].view.slice(2));
   assert.notDeepEqual(actual.view,fixture.notes[index].view,'Timed arrival does not restore the saved viewport');
  };
  const followingMatches=(actual,index)=>{
   assert.deepEqual(actual.settings,fixture.notes[index].settings);
   assert.deepEqual(actual.view.slice(2),fixture.notes[index].view.slice(2));
   assert.ok(Math.abs(actual.view[0]+actual.view[2]/2-actual.mercutio[0])<1e-6,'Mercutio is centered horizontally');
   assert.ok(Math.abs(actual.view[1]+actual.view[3]/2-actual.mercutio[1])<1e-6,'Mercutio is centered vertically');
  };
  await page.locator('#playbackSpeed').selectOption('10');await page.locator('#nextEvent').click();
  let s=await state();assert.equal(s.playing,true);assert.equal(s.target,'B');assert.equal(s.time,fixture.time);followingMatches(s,0);
  const initialView=s.view;
  await page.clock.runFor(200);s=await state();assert.ok(Math.abs(s.time-fixture.time-2)<.001);followingMatches(s,0);assert.notDeepEqual(s.view,initialView,'The viewport follows the moving boat');
  await page.locator('#playbackSpeed').selectOption('20');await page.clock.runFor(50);
  await page.evaluate(()=>updateTimeline());await page.clock.runFor(350);
  s=await state();assert.ok(Math.abs(s.time-fixture.time-10)<.001);assert.equal(s.playing,true);followingMatches(s,0);
  const arrivalView=s.view;
  await page.clock.runFor(100);
  s=await state();assert.equal(s.time,fixture.notes[1].time);assert.equal(s.event,'B');assert.equal(s.playing,false);assert.equal(s.target,null);arrivalMatches(s,1,0);assert.deepEqual(s.view,arrivalView,'Arrival keeps the last followed viewport without a jump');
  await page.clock.runFor(1000);s=await state();assert.equal(s.time,fixture.notes[1].time,'Arrival stops without overshooting');assert.deepEqual(s.view,arrivalView);
  // Same-time events have no transition duration. Keyboard forwards follows the same rules.
  await page.locator('#map').focus();await page.keyboard.press('PageDown');
  s=await state();assert.equal(s.event,'B samme tid');assert.equal(s.playing,false);sceneMatches(s,2);
  await page.keyboard.press('ArrowRight');await page.clock.runFor(100);
  s=await state();assert.equal(s.target,'C');assert.equal(s.playing,true);assert.ok(s.time<fixture.notes[3].time);followingMatches(s,2);
  await page.keyboard.press('ArrowRight');
  s=await state();assert.equal(s.time,fixture.notes[3].time);assert.equal(s.playing,false);sceneMatches(s,3);
  // Ordinary playback crosses events but never restores their saved settings or opens photos.
  await page.locator('#eventSelect').selectOption('0');await page.locator('#playbackSpeed').selectOption('400');
  await page.locator('#play').click();await page.clock.runFor(400);
  s=await state();assert.equal(s.target,null);assert.equal(s.playing,true);assert.ok(s.time>fixture.notes[4].time);sceneMatches(s,0);
  assert.equal(await page.locator('#mapEventImage').isVisible(),false);await page.locator('#play').click();
  // If ordinary playback is between events, Next jumps straight to the next future event.
  await page.locator('#eventSelect').selectOption('0');await page.locator('#playbackSpeed').selectOption('1');
  await page.locator('#play').click();await page.clock.runFor(500);await page.locator('#nextEvent').click();
  s=await state();assert.equal(s.time,fixture.notes[1].time);assert.equal(s.playing,false);sceneMatches(s,1);
  // Starting from an exact event while already playing starts a targeted transition.
  await page.locator('#eventSelect').selectOption('0');await page.locator('#play').click();await page.locator('#nextEvent').click();
  s=await state();assert.equal(s.target,'B');assert.equal(s.time,fixture.time);assert.equal(s.playing,true);
  await page.locator('#nextEvent').click();s=await state();assert.equal(s.time,fixture.notes[1].time);sceneMatches(s,1);
  // Scrubbing cancels the transition, while Previous and dropdown selection remain direct jumps.
  await page.locator('#eventSelect').selectOption('0');await page.locator('#nextEvent').click();await page.clock.runFor(200);
  await page.evaluate(time=>seekTimeline(offsetAtTime(time),{snap:false}),fixture.time+1);
  s=await state();assert.equal(s.playing,false);assert.equal(s.target,null);
  const scrubbed=s.time;await page.clock.runFor(500);assert.equal((await state()).time,scrubbed);
  await page.locator('#eventSelect').selectOption('2');await page.locator('#nextEvent').click();await page.locator('#previousEvent').click();
  s=await state();assert.equal(s.event,'B');assert.equal(s.playing,false);sceneMatches(s,1);
  // A target outside the slider's visible ranges still plays at the chosen real time rate.
  await page.locator('#eventSelect').selectOption('0');
  await page.evaluate(time=>{
   visibleTimeRanges=[{start:time,end:time+1}];boatTimeRanges=visibleTimeRanges;timelineLength=2;
   $('time').max=1;$('time').disabled=false;
  },fixture.time);
  await page.locator('#playbackSpeed').selectOption('10');await page.locator('#nextEvent').click();await page.clock.runFor(200);
  s=await state();assert.ok(Math.abs(s.time-fixture.time-2)<.001,JSON.stringify(s));assert.equal(s.playing,true);
  await page.clock.runFor(900);s=await state();assert.equal(s.time,fixture.notes[1].time);arrivalMatches(s,1,0);
  await page.locator('#eventSelect').selectOption('0');
  await page.evaluate(()=>{visibleTimeRanges=[];boatTimeRanges=[];timelineLength=0;$('time').disabled=$('play').disabled=true;});
  await page.locator('#nextEvent').click();assert.equal(await page.locator('#play').isEnabled(),true);
  await page.clock.runFor(1100);s=await state();assert.equal(s.time,fixture.notes[1].time);assert.equal(s.playing,false);arrivalMatches(s,1,0);
  // Arrival via Next restores photos as well as the scene, and stops at the final event.
  await page.locator('#eventSelect').selectOption('3');await page.locator('#playbackSpeed').selectOption('400');
  await page.locator('#nextEvent').click();assert.equal(await page.locator('#mapEventImage').isVisible(),false);
  await page.clock.runFor(150);const photoArrivalView=(await state()).view;
  await page.clock.runFor(50);s=await state();assert.equal(s.time,fixture.notes[4].time);assert.equal(s.playing,false);arrivalMatches(s,4,3);assert.deepEqual(s.view,photoArrivalView,'Photo arrival also keeps the followed viewport');
  await page.locator('#mapEventImageContent').waitFor({state:'visible'});
  assert.equal(await page.locator('#eventImageFigure').isVisible(),false);
  assert.equal(await page.locator('#nextEvent').isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(notes))),fixture.notes,'Navigation never edits the published events');
  assert.equal(await page.evaluate(()=>window.SR_READONLY&&document.body.classList.contains('presenting')),true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'public presentation, timed Next follows Mercutio with unchanged zoom even when unselected, selected/live speed, exact arrival preserves followed viewport and restores other settings, same-time events, keyboard/second press restores saved viewport, ordinary playback preserves setup, between-event skip, scrub cancellation, direct previous/dropdown, excluded time ranges, disabled slider, image arrival preserves viewport, final event, unchanged notes',errors}));
 }finally{await browser.close();}
}
check(firefox).catch(error=>{console.error(error);process.exit(1)});
