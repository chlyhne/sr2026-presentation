const assert=require('node:assert/strict');
const path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const start=Date.parse('2026-06-11T08:00:00Z')/1000;
  const fixtures=[{time:start+3600,text:'Event A',view:[230,250,620,760],settings:{wind:false,rain:false,boats:[]},point:[650,400],drawings:[]},
   {time:start+7200,text:'Event B',view:[230,250,620,760],settings:{wind:false,rain:false,boats:['My']}},
   {time:start+10800,text:'Ældre event uden indstillinger',view:[230,250,620,760]}];
  await page.addInitScript(fixtures=>{
   if(!localStorage.getItem('sr2026-boat-test-seeded')){
    localStorage.setItem('sr2026-notes',JSON.stringify(fixtures));localStorage.setItem('sr2026-boat-test-seeded','1');
   }
  },fixtures);
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForFunction(()=>typeof changeBoatSelection==='function');
  const store=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  assert.deepEqual(await store(),fixtures,'Loading must preserve explicit empty/custom boats and missing optional settings');
  const migrationKeys=['sr2026-event-boats-initialized-v1','sr2026-event-boats-rosa-lux-v1','sr2026-event-boat-names-shown-v1'];
  assert.deepEqual(await page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),migrationKeys),[null,null,null]);
  const extra=await page.evaluate(()=>boats.find(b=>!featured.has(b.name)).name);
  const indices=await page.evaluate(()=>Object.fromEntries(boats.map((b,i)=>[b.name,i])));
  const checkbox=name=>page.locator('#choices input').nth(indices[name]);
  const chosenNames=()=>page.evaluate(()=>[...chosen]);
  await page.locator('.note-jump').first().click();
  assert.deepEqual(await chosenNames(),[],'Explicit empty boat selection survives initial loading');
  await checkbox('Mercutio').check();
  await checkbox(extra).check();assert.deepEqual(await chosenNames(),['Mercutio',extra]);
  const afterA=await store();assert.deepEqual(afterA[0].settings.boats,['Mercutio',extra]);assert.deepEqual(afterA.slice(1),fixtures.slice(1));
  assert.equal(await page.evaluate(()=>currentTime()),fixtures[0].time);
  assert.equal(await page.evaluate(()=>webglTracks.active),true);
  await page.locator('#nextEvent').click();assert.deepEqual(await chosenNames(),['My']);
  await checkbox('Vera').check();
  assert.deepEqual(await chosenNames(),['My','Vera']);
  const afterB=await store();assert.deepEqual(afterB[0],afterA[0]);assert.deepEqual(afterB[1].settings.boats,['My','Vera']);
  await page.locator('#previousEvent').click();assert.deepEqual(await chosenNames(),['Mercutio',extra]);
  // Snap selects the event/time without restoring its boat set or writing any selections.
  const snapped=await page.evaluate(()=>{
   const before=localStorage.getItem('sr2026-notes');seekTimeline(offsetAtTime(notes[1].time));
   return {boats:[...chosen],event:activePresentationNote.text,time:currentTime(),before,after:localStorage.getItem('sr2026-notes')};
  });
  assert.deepEqual(snapped.boats,['Mercutio',extra]);assert.equal(snapped.event,'Event B');assert.equal(snapped.time,fixtures[1].time);assert.equal(snapped.after,snapped.before);
  await page.locator('#nextEvent').click();assert.deepEqual(await chosenNames(),['Mercutio',extra],'Missing optional settings preserve the current boat selection');
  assert.deepEqual((await store())[2],fixtures[2],'Visiting an event without settings must not migrate it');
  await page.locator('#previousEvent').click();assert.deepEqual(await chosenNames(),['My','Vera']);
  await page.locator('#previousEvent').click();assert.deepEqual(await chosenNames(),['Mercutio',extra]);
  await page.locator('#startPresentation').click();await page.locator('#nextEvent').click();
  if(await page.evaluate(()=>!!eventPlaybackTarget))await page.locator('#nextEvent').click();
  assert.deepEqual(await chosenNames(),['My','Vera']);
  await page.locator('#previousEvent').click();assert.deepEqual(await chosenNames(),['Mercutio',extra]);await page.locator('#endPresentation').click();
  await page.locator('.note-edit').first().click();await checkbox(extra).uncheck();
  assert.deepEqual(await store(),afterB,'Full editor keeps boat changes in the draft');
  await page.locator('#cancelEdit').click();assert.deepEqual(await chosenNames(),['Mercutio',extra]);
  await page.locator('.note-edit').first().click();await checkbox('Vera').check();await page.locator('#save').click();
  assert.deepEqual((await store())[0].settings.boats,['Mercutio',extra,'Vera']);
  await page.locator('#visibleBoatsToggle').click();await page.locator('#boatClearFavourites').click();
  assert.deepEqual(await chosenNames(),[]);assert.deepEqual((await store())[0].settings.boats,[]);
  await page.locator('#nextEvent').click();assert.deepEqual(await chosenNames(),['My','Vera']);
  await page.locator('#previousEvent').click();assert.deepEqual(await chosenNames(),[],'An event may intentionally have no active boats');
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.note-jump').length===3);
  await page.locator('.note-jump').first().click();assert.deepEqual(await chosenNames(),[],'Reload must preserve saved custom choices');
  await page.locator('#nextEvent').click();assert.deepEqual(await chosenNames(),['My','Vera']);
  const beforeExplore=await store();
  await page.evaluate(()=>{selectedTime+=900;render();});await checkbox('Mercutio').check();
  assert.deepEqual(await store(),beforeExplore,'Exploring another time does not overwrite the last event');
  await page.locator('#note').fill('Nyt event med eget udvalg');await page.locator('#save').click();
  const newEvent=(await store()).find(n=>n.text==='Nyt event med eget udvalg');assert.deepEqual(newEvent.settings.boats,['My','Vera','Mercutio']);
  assert.deepEqual((await store())[1],beforeExplore[1]);
  await page.locator('#eventSelect').selectOption('1');const beforeFailure=await store();
  await page.evaluate(()=>{window.originalBoatStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='sr2026-notes')throw new Error('quota');return originalBoatStorage.call(this,key,value);};});
  await checkbox('Mercutio').click();assert.deepEqual(await store(),beforeFailure);assert.deepEqual(await chosenNames(),['My','Vera']);
  assert.equal(await checkbox('Mercutio').isChecked(),false);assert.match(await page.locator('#eventBoatStatus').textContent(),/kunne ikke gemmes/);
  await page.evaluate(()=>{Storage.prototype.setItem=originalBoatStorage;});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'no historical boat migrations, per-event autosave, draft save/cancel, next/previous restore, snap leaves choices/storage unchanged, empty selection, reload, new event, exploration, failed save rollback',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
