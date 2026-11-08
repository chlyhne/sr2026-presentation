const assert=require('node:assert/strict'),path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  // Editing must use Danish time even when the browser uses another zone.
  const page=await browser.newPage({viewport:{width:1500,height:1000},timezoneId:'America/Los_Angeles'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForFunction(()=>typeof captureMap==='function');
  const fixture=await page.evaluate(()=>{
   const settings={...sceneSettings(),wind:false,rain:false,boats:[],boatNames:[]};
   notes=[{time:D.start+3600,utc:new Date((D.start+3600)*1000).toISOString(),text:'Flytbart event',point:[600,420],lon:12.2,lat:55.9,
    drawings:[{tool:'line',colour:'#e02020',width:4,points:[[590,410],[610,430]]}],view:[230,250,620,760],settings,extra:{preserve:true}},
    {time:D.start+7200,text:'Næste event',view:[230,250,620,760],settings}];
   speedPins=[{id:'unrelated-pin',boatId:boats[0].id,time:D.start+4000}];
   SRStorage.setItem('sr2026-speed-pins',JSON.stringify(speedPins));persistNotes(notes);showNotes();restoreNote(notes[0]);
   return {notes:JSON.parse(JSON.stringify(notes)),pins:JSON.parse(JSON.stringify(speedPins)),newTime:D.start+90000};
  });
  const value=time=>new Date((time+7200)*1000).toISOString().slice(0,19).replace(/:00$/,'');
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  await page.locator('.note-edit').first().click();
  assert.equal(await page.locator('#noteTimeField').isVisible(),true);
  assert.equal(await page.evaluate(()=>parseEventTimeInput($('noteTime').value)),fixture.notes[0].time);
  await page.locator('#noteTime').fill(value(fixture.newTime));
  assert.deepEqual(await stored(),fixture.notes,'Draft time must not change saved events');
  await page.locator('#cancelEdit').click();assert.deepEqual(await stored(),fixture.notes);
  assert.equal(await page.locator('#noteTimeField').isVisible(),false);
  await page.locator('.note-edit').first().click();await page.locator('#noteTime').fill('');await page.locator('#save').click();
  assert.deepEqual(await stored(),fixture.notes);assert.match(await page.locator('#annotationStatus').textContent(),/gyldigt tidspunkt/);
  await page.locator('#noteTime').fill('2027-01-01T12:00');await page.locator('#save').click();assert.deepEqual(await stored(),fixture.notes);
  await page.locator('#noteTime').fill(value(fixture.newTime));await page.locator('#save').click();
  const expected=[fixture.notes[1],{...fixture.notes[0],time:fixture.newTime,utc:new Date(fixture.newTime*1000).toISOString()}];
  assert.deepEqual(await stored(),expected,'Only timestamp/UTC changes; drawings, marker, settings and extra fields survive');
  assert.equal(await page.evaluate(()=>currentTime()),fixture.newTime);
  assert.equal(await page.locator('#eventSelect').inputValue(),'1');assert.equal(await page.locator('#eventText').textContent(),'Flytbart event');
  await page.locator('#previousEvent').click();assert.equal(await page.locator('#eventText').textContent(),'Næste event');
  await page.locator('#nextEvent').click();assert.equal(await page.locator('#eventText').textContent(),'Flytbart event');
  assert.deepEqual(await page.evaluate(()=>speedPins),fixture.pins,'Speed pins keep their source times');
  // Storage failure must retain the saved timestamp and keep the edit open.
  await page.locator('.note-edit').nth(1).click();await page.locator('#noteTime').fill(value(fixture.notes[0].time));
  await page.evaluate(()=>{window.originalTimeStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(key,v){if(key==='sr2026-notes')throw Error('quota');return originalTimeStorage.call(this,key,v);};});
  await page.locator('#save').click();assert.deepEqual(await stored(),expected);assert.equal(await page.locator('#noteTimeField').isVisible(),true);
  await page.evaluate(()=>Storage.prototype.setItem=originalTimeStorage);await page.locator('#cancelEdit').click();
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.note-edit').length===2);
  assert.deepEqual(await stored(),expected);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:type.name(),checks:'Danish wall time in foreign browser zone, draft/cancel, validation, next-day sorting/navigation, data and pins preserved, failed save, reload',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
