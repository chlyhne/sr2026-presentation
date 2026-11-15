const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8098/test/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>{
   stopPlayback();finishNoteEditing();
   const settings=sceneSettings(),time=D.start+3600;
   notes=[{time,text:'Oprindelig',settings,view:[...view]},{time:time+600,text:'Næste',settings,view:[...view]}];
   persistNotes(notes);showNotes();restoreNote(notes[0]);
   window.firstFixture=notes[0];window.secondFixture=notes[1];
  });
  const dialog=page.locator('#eventChangesDialog');
  const dirty=async text=>{await page.evaluate(()=>restoreNote(firstFixture));await page.locator('#note').fill(text);};
  const next=()=>page.evaluate(()=>restoreNote(secondFixture));
  await dirty('Behold kladden');await next();await dialog.waitFor({state:'visible'});
  assert.deepEqual(await dialog.locator('button').allTextContents(),['Gem','Gem ikke','Annullér']);
  await page.locator('#eventChangesCancel').click();
  assert.equal(await page.locator('#note').inputValue(),'Behold kladden');
  assert.equal(await page.evaluate(()=>activePresentationNote===firstFixture&&hasEventChanges()),true);
  await next();await page.locator('#eventChangesDiscard').click();
  assert.equal(await page.evaluate(()=>activePresentationNote===secondFixture&&firstFixture.text==='Oprindelig'),true);
  await dirty('Gemt via prompt');await next();await page.locator('#eventChangesSave').click();
  assert.equal(await page.evaluate(()=>activePresentationNote===secondFixture&&firstFixture.text==='Gemt via prompt'),true);
  assert.equal(await page.evaluate(()=>JSON.parse(SRStorage.getItem('sr2026-notes'))[0].text),'Gemt via prompt');
  await dirty('Gem fejler');
  await page.evaluate(()=>{window.originalPersistNotes=persistNotes;persistNotes=()=>{$('annotationStatus').textContent='Test: lager fyldt';return false;};});
  await next();await page.locator('#eventChangesSave').click();
  assert.equal(await dialog.isVisible(),true);assert.match(await page.locator('#eventChangesStatus').textContent(),/lager fyldt/);
  assert.equal(await page.evaluate(()=>activePresentationNote===firstFixture&&firstFixture.text==='Gemt via prompt'&&hasEventChanges()),true);
  await page.evaluate(()=>{persistNotes=originalPersistNotes;});
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
  assert.equal(await page.locator('#note').inputValue(),'Gem fejler');
  // Continue playback only after resolving the prompt.
  await page.evaluate(()=>startPlayback());await page.locator('#eventChangesDiscard').click();
  assert.equal(await page.evaluate(()=>interval!==null),true);await page.evaluate(()=>stopPlayback());
  // Capture the destination event, even when saving reorders the event list.
  await dirty('Flyttet event');
  await page.locator('#noteTime').fill(await page.evaluate(()=>eventTimeInputValue(secondFixture.time+600)));
  await page.evaluate(()=>showPresentationEvent(notes.indexOf(secondFixture)));
  await page.locator('#eventChangesSave').click();
  assert.equal(await page.evaluate(()=>activePresentationNote===secondFixture&&notes.indexOf(firstFixture)>notes.indexOf(secondFixture)),true);
  await dirty('Præsentationskladde');await page.evaluate(()=>setPresentationMode(true));
  await page.locator('#eventChangesCancel').click();assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),false);
  await page.evaluate(()=>setPresentationMode(true));await page.locator('#eventChangesSave').click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')&&firstFixture.text==='Præsentationskladde'),true);
  assert.deepEqual(errors,[]);
  console.log('Firefox: save/discard/cancel, Escape, failed save, retained drafts, playback, reordered destinations and presentation passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
