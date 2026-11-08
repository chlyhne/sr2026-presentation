const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForFunction(()=>typeof notes!=='undefined'&&typeof changeEventLayers==='function');
  await page.evaluate(()=>{
   const settings={...sceneSettings(),boats:['Mercutio'],wind:false,rain:false,traffic:false,military:true,windNumbers:false,annotationsVisible:true};
   notes=[{time:D.start+3600,text:'A',view:[230,250,620,760],settings:{...settings}},
    {time:D.start+7200,text:'B',view:[230,250,620,760],settings:{...settings,traffic:true,military:false,annotationsVisible:false}}];
   persistNotes(notes);showNotes();restoreNote(notes[0]);
  });
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  const before=await saved();
  await page.locator('#traffic').check();await page.locator('#military').uncheck();await page.locator('#windNumbers').check();
  await page.locator('#windModel').selectOption('era5');
  await page.locator('#rainOpacity').evaluate(e=>{e.value='.35';e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'));});
  const after=await saved();
  assert.deepEqual(after[1],before[1]);assert.equal(after[0].settings.traffic,true);assert.equal(after[0].settings.military,false);
  assert.equal(after[0].settings.windNumbers,true);assert.equal(after[0].settings.windModel,'era5');assert.equal(after[0].settings.rainOpacity,.35);
  const snapshot=await page.evaluate(()=>layerSettings());
  const snap=await page.evaluate(()=>{const before=localStorage.getItem('sr2026-notes');seekTimeline(offsetAtTime(notes[1].time));return {time:currentTime(),event:activePresentationNote.text,before,after:localStorage.getItem('sr2026-notes'),layers:layerSettings()};});
  assert.equal(snap.event,'B');assert.equal(snap.before,snap.after);assert.deepEqual(snap.layers,snapshot);
  await page.locator('#traffic').uncheck();
  const afterSnapEdit=await saved();assert.equal(afterSnapEdit[1].settings.traffic,false);
  assert.equal(afterSnapEdit[1].settings.windNumbers,before[1].settings.windNumbers);
  assert.equal(afterSnapEdit[1].settings.rainOpacity,before[1].settings.rainOpacity);
  // Direct event navigation must restore saved settings, including note visibility.
  await page.evaluate(()=>restoreNote(notes[1]));assert.equal(await page.locator('#annotationsVisible').isChecked(),false);
  await page.evaluate(()=>restoreNote(notes[0]));assert.deepEqual(await page.evaluate(()=>layerSettings()),snapshot);
  await page.evaluate(()=>setPresentationMode(true));
  const presenting=await page.evaluate(()=>{seekTimeline(offsetAtTime(notes[1].time));return layerSettings();});assert.deepEqual(presenting,snapshot);
  await page.evaluate(()=>setPresentationMode(false));
  // Full note editing keeps layer changes in the draft until Save.
  await page.evaluate(()=>beginNoteEditing(notes[0]));const draftBefore=await saved();await page.locator('#traffic').uncheck();
  assert.deepEqual(await saved(),draftBefore);await page.locator('#cancelEdit').click();assert.equal(await page.locator('#traffic').isChecked(),true);
  // Free time exploration never changes the last selected event.
  await page.evaluate(()=>setCurrentTime(notes[0].time+100));const freeBefore=await saved();await page.locator('#traffic').uncheck();assert.deepEqual(await saved(),freeBefore);
  // Saving failure restores the previous visible layers as well as preserving storage.
  await page.evaluate(()=>{restoreNote(notes[0]);window.originalStorage=SRStorage;window.SRStorage={setItem(){throw Error('Quota');}};});
  await page.locator('#traffic').click();assert.equal(await page.locator('#traffic').isChecked(),true);assert.deepEqual(await saved(),freeBefore);
  await page.evaluate(()=>window.SRStorage=window.originalStorage);
  await page.reload();await page.waitForFunction(()=>typeof restoreNote==='function');await page.evaluate(()=>restoreNote(notes[0]));
  assert.deepEqual(await page.evaluate(()=>layerSettings()),snapshot);assert.deepEqual(errors,[]);
  console.log('Event layers verified: autosave, isolation, navigation, snap in both modes, draft cancel, free time, save failure and reload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
