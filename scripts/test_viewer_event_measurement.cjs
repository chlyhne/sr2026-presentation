const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const url=process.env.SR_VIEWER_URL||'http://127.0.0.1:18455/';
  await page.goto(url);await page.waitForSelector('main:not([inert])',{timeout:120000});
  const initial=await page.evaluate(()=>{
   const time=D.start+3600,settings={...sceneSettings(),wind:false,rain:false,boatFavouritesOnly:true,boats:[],annotationsVisible:false};
   notes=[{time,text:'Måling A',view:[230,250,620,760],settings,custom:{keep:true}},
    {time:time+60,text:'Uden måling',view:[230,250,620,760],settings},
    {time:time+60,text:'Samtidig måling',view:[230,250,620,760],settings,measurement:[[12,55.6],[12.1,55.65]]}];
   persistNotes(notes);showNotes();restoreNote(notes[0]);return JSON.parse(JSON.stringify(notes));
  });
  const stored=()=>page.evaluate(()=>JSON.parse(SRStorage.getItem('sr2026-notes')));
  const visible=()=>page.evaluate(()=>{flushRender();return {points:currentMeasurement(),text:$('mapNavigation').textContent,result:$('measurementResult').textContent,pressed:$('mapMeasureToggle').getAttribute('aria-pressed')};});
  const draw=async()=>{
   await page.locator('#mapMeasureToggle').click();
   for(const coordinate of [[12,55.5],[12.06,55.55]]){
    const p=await page.evaluate(coordinate=>new DOMPoint(...xy(coordinate)).matrixTransform(mapViewport().matrix).toJSON(),coordinate);
    await page.mouse.click(p.x,p.y);
   }
   return page.evaluate(()=>currentMeasurement().map(point=>[...point]));
  };
  const points=await draw();assert.equal(points.length,2);assert.match((await visible()).text,/Måling/);
  assert.deepEqual(await stored(),initial,'Drawing only changes the event draft');
  assert.deepEqual(await page.evaluate(()=>notes[0].measurement),undefined);
  assert.deepEqual(await page.evaluate(()=>eventDraft.measurement),points);
  await page.locator('#nextEvent').click();assert.equal(await page.evaluate(()=>activePresentationNote.text),'Måling A','Unsaved measurement uses the normal navigation guard');
  await page.locator('#save').click();
  assert.deepEqual((await stored())[0].measurement,points);assert.deepEqual((await stored())[0].custom,{keep:true});
  await page.locator('#nextEvent').click();assert.deepEqual((await visible()).points,[]);assert.equal((await visible()).text,'');assert.equal((await visible()).pressed,'false');
  await page.locator('#nextEvent').click();assert.deepEqual((await visible()).points,initial[2].measurement,'Same-time events have separate measurements');
  await page.evaluate(()=>restoreNote(notes[0]));assert.deepEqual((await visible()).points,points);
  await page.locator('#mapMeasureToggle').click();assert.deepEqual((await visible()).points,[]);
  assert.deepEqual((await stored())[0].measurement,points,'Removal also stays in the draft until Save');
  await page.locator('#cancelEdit').click();assert.deepEqual((await visible()).points,points,'Cancel restores the saved measurement');
  await page.locator('#mapMeasureToggle').click();await page.locator('#save').click();
  assert.deepEqual((await stored())[0].measurement,[],'Save persists removal');
  const replacement=await draw();await page.locator('#save').click();
  await page.evaluate(()=>setPresentationMode(true));await page.clock.install();await page.clock.pauseAt(new Date());
  await page.locator('#playbackSpeed').selectOption('1');await page.locator('#play').click();await page.clock.runFor(50);
  assert.equal(await page.evaluate(()=>currentTime()>notes[0].time),true);
  assert.deepEqual((await visible()).points,[]);assert.equal((await visible()).text,'');assert.equal((await visible()).result,'');assert.equal((await visible()).pressed,'false');
  await page.locator('#play').click();await page.evaluate(()=>restoreNote(notes[0]));assert.deepEqual((await visible()).points,replacement);
  await page.locator('#mapMeasureToggle').click();assert.deepEqual((await visible()).points,[]);
  assert.deepEqual((await stored())[0].measurement,replacement,'Presentation removal does not modify the saved event');
  await page.evaluate(()=>restoreNote(notes[0]));assert.deepEqual((await visible()).points,replacement);
  await page.evaluate(()=>{seekTimeline(offsetAtTime(notes[0].time+1),{snap:false});flushRender();});
  assert.deepEqual((await visible()).points,[],'Manual seeking away hides the event measurement');
  await page.evaluate(()=>{restoreNote(notes[0]);setPresentationMode(false);setCurrentTime(notes[0].time+20,{allowOutsideVisibleRanges:true});render();});
  const standalone=await draw();assert.deepEqual(await page.evaluate(()=>measurement),standalone);
  await page.locator('#note').fill('Nyt event med måling');await page.locator('#save').click();
  assert.deepEqual((await stored()).find(note=>note.text==='Nyt event med måling').measurement,standalone);
  assert.deepEqual(await page.evaluate(()=>measurement),[],'Saving consumes the standalone measurement');
  await page.evaluate(()=>{setCurrentTime(currentTime()+1,{allowOutsideVisibleRanges:true});render();});assert.equal((await visible()).text,'');
  await page.clock.resume();await page.reload();await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>restoreNote(notes.find(note=>note.text==='Nyt event med måling')));assert.deepEqual((await visible()).points,standalone,'Reload restores the saved geographic endpoints');
  const exported=await page.evaluate(async()=>{
   let data;const original=download;download=blob=>{data=blob.text().then(JSON.parse);};
   try{await exportEventNotes();return await data;}finally{download=original;}
  });
  assert.deepEqual(exported.notes.find(note=>note.text==='Nyt event med måling').measurement,standalone);
  const publicPage=await browser.newPage({viewport:{width:1500,height:1000}});
  publicPage.on('pageerror',error=>errors.push(error.message));
  await publicPage.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={local:false,admin:false};'}));
  await publicPage.route('**/presentation.json',route=>route.fulfill({json:exported}));
  await publicPage.goto(url);await publicPage.waitForSelector('main:not([inert])',{timeout:120000});
  assert.deepEqual(await publicPage.evaluate(()=>currentMeasurement()),replacement,'The published viewer restores event measurements');
  await publicPage.evaluate(()=>showPresentationEvent(2));assert.deepEqual(await publicPage.evaluate(()=>currentMeasurement()),[],'A published legacy event without the field clears the previous measurement');
  await publicPage.close();assert.deepEqual(errors,[]);
  console.log('Firefox PC: geographic measurement endpoints in event drafts, explicit Save/removal, Cancel, same-time events, playback/seek departure, presentation isolation, new event capture, reload, JSON export and published legacy events.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
