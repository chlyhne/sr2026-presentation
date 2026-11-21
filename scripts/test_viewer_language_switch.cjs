const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));

(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';
  await page.goto(new URL('events/sjaelland-rundt-2026/?lang=da',base).href);
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  let navigations=0;
  page.on('request',request=>{if(request.isNavigationRequest())navigations++;});
  await page.evaluate(()=>{
   const note={time:D.start+3600,text:'Min tekst',view:[...view],settings:sceneSettings()};
   notes=[note];setEventPanelExpanded(true);restoreNote(note);refreshPresentationEvents();syncTimelineViewport();
  });
  const picker=page.locator('[data-language-picker]');
  const choose=async language=>{
   await picker.getByRole('button').click();
   await picker.locator('a[lang="'+language+'"]').click();
   assert.equal(await page.locator('html').getAttribute('lang'),language);
  };
  await page.locator('#eventText').click();
  await page.locator('#eventTextEditor').fill('Tekst under redigering');
  const state=await page.evaluate(()=>{
   window.localeProbe={note:openedEvent,gl:webglTracks.gl,prepared:window.SR_PREPARED_COMMON,interval:null};
   return {view:[...view],time:currentTime(),draft:SRStorage.getItem('sr2026-notes')};
  });
  await choose('en');
  assert.equal(await page.locator('#deleteNote').textContent(),'Delete event');
  assert.equal(await page.locator('#eventPanelToggle').getAttribute('aria-label'),'Hide event panel');
  assert.equal(await page.locator('#eventTextEditor').inputValue(),'Tekst under redigering');
  assert.equal(await page.locator('#eventTextEditor').evaluate(node=>document.activeElement===node),true);
  assert.deepEqual(await page.evaluate(()=>({
   view:[...view],time:currentTime(),draft:SRStorage.getItem('sr2026-notes'),
   identities:openedEvent===localeProbe.note&&webglTracks.gl===localeProbe.gl&&window.SR_PREPARED_COMMON===localeProbe.prepared
  })),{...state,identities:true});

  await page.locator('#eventTextEditor').press('Escape');
  await page.locator('#playbackSpeed').selectOption('1');
  await page.locator('#play').click();
  await page.evaluate(()=>{localeProbe.interval=interval;});
  await choose('de');
  assert.equal(await page.locator('#eventPanelToggle').getAttribute('aria-label'),'Ereignisbereich ausblenden');
  assert.equal(await page.locator('#play').getAttribute('aria-label'),'Pause');
  assert.equal(await page.evaluate(()=>interval!==null&&interval===localeProbe.interval),true);
  assert.equal(navigations,0,'Changing language does not load another document');

  const landing=await context.newPage();
  await landing.goto(new URL('./',base).href);
  await landing.locator('.event-card').first().waitFor();
  assert.equal(await landing.locator('h1').textContent(),'Regatta auswählen');
  await landing.locator('[data-language-picker] button').click();
  await landing.locator('[data-languages] a[lang="en"]').click();
  assert.equal(await landing.locator('h1').textContent(),'Choose a regatta');
  assert.equal(await landing.locator('.event-card span').first().textContent(),'Open tracker →');
  assert.match(await landing.locator('.event-card').first().getAttribute('href'),/\?lang=en$/);
  assert.deepEqual(errors,[]);
  console.log('Firefox: language switches in place on the landing page and tracker, keeping the open editor, camera, prepared tracks and playback.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
