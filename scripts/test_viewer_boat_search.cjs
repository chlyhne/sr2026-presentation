const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const installTrackFixtures=require('./viewer-track-fixtures.cjs');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(readonly){
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  await installTrackFixtures(page);
  page.on('pageerror',error=>errors.push(error.message));
  if(readonly){
   await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={admin:false,apiBase:""};'}));
   await page.route('**/presentation.json',route=>route.fulfill({json:{version:1,speedPins:[],notes:[]}}));
  }
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  assert.equal(await page.evaluate(()=>window.SR_READONLY),readonly);
  await page.evaluate(()=>{
   stopPlayback();$('wind').checked=$('rain').checked=false;selectedTime=D.start+3600;
   const time=selectedTime,metadata=boatMetadata('Mercutio');
   const makeBoat=(id,name,skipper,boatType,lon)=>({id,name,skipper,boatType,metadata,
    points:[[lon,55.6,time-60],[lon+.01,55.6,time+120]],speeds:[5,8]});
   boats.splice(0,boats.length,
    makeBoat('kept','Mercutio','Kåre Gibsholm','Seascape 27',11.8),
    makeBoat('name','MATCH Sejler','Anders','X-99',12),
    makeBoat('skipper','Borealis','Lise Matchsen','Folkebåd',12.2),
    makeBoat('type','Cirrus','Peter','Match 28',12.4),
    makeBoat('outside','Match Udenfor','Bent','X-99',25),
    {...makeBoat('future','Match Senere','Sofie','X-99',12.3),points:[[12.3,55.6,time+600],[12.4,55.6,time+720]]});
   referenceBoatId=boats[0].id;
   for(const boat of boats)prepareTrackFixture(boat);
   chosen.clear();chosen.add('Mercutio');chosen.add('Borealis');
   for(const boat of boats)colours[boat.name]='#ffdc42';
   const [x,y]=xy([12,55.6]);view=[x-200,y-200,400,400];$('map').setAttribute('viewBox',view.join(' '));
   notes=[{time,text:'Søgetest',view:[...view],settings:sceneSettings()}];activePresentationNote=notes[0];
   if(!window.SR_READONLY)SRStorage.setItem('sr2026-notes',JSON.stringify(notes));
   updateTimeline();render();
  });
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const chosenNames=()=>page.evaluate(()=>[...chosen].sort());
  const rows=()=>page.locator('.visible-boat').evaluateAll(nodes=>nodes.map(node=>node.dataset.boatId).sort());
  const tracks=()=>page.evaluate(()=>webglTracks.order.map(boat=>boat.id).sort());
  const heart=id=>page.locator(`.visible-boat[data-boat-id="${id}"] input`);
  const search=page.locator('#boatSearchInput'),favourites=page.locator('#boatFavouritesOnly'),clear=page.locator('#boatClearFavourites');
  const all=['future','kept','name','outside','skipper','type'];
  const scene=await page.evaluate(()=>({time:currentTime(),view:[...view],notes:JSON.stringify(notes),stored:SRStorage.getItem('sr2026-notes')}));
  await page.locator('#visibleBoatsToggle').click();await settle();
  assert.deepEqual(await rows(),all,'Empty text shows every boat, including outside the viewport and before its start');
  assert.deepEqual(await tracks(),all,'Map tracks use the same filter as the list');
  assert.equal(await page.locator('#boatSelectAll,#boatDeselectAll,#boatSearchClear,#all').count(),0,'Obsolete select-all and Done controls are removed');
  assert.equal(await page.locator('label[for="boatSearchInput"] .sr-only').evaluate(node=>node.getBoundingClientRect().width),1,'Filter label is available to assistive technology without visible text');
  assert.equal(await page.locator('label[for="boatSearchInput"] svg').count(),1);
  assert.equal(await heart('kept').isChecked(),true);assert.equal(await heart('name').isChecked(),false);
  const fill=()=>heart('kept').evaluate(input=>getComputedStyle(input.nextElementSibling).fill);
  assert.notEqual(await fill(),'none');
  await search.fill('mAtCh');await settle();
  assert.deepEqual(await rows(),['future','name','outside','skipper','type']);
  assert.deepEqual(await tracks(),await rows());
  assert.deepEqual(await chosenNames(),['Borealis','Mercutio']);
  await favourites.click();await settle();
  assert.deepEqual(await rows(),['skipper'],'Text filters only favourite boats when the heart toggle is on');
  assert.deepEqual(await tracks(),['skipper']);
  assert.equal(await favourites.getAttribute('aria-pressed'),'true');
  await search.fill('');await settle();assert.deepEqual(await rows(),['kept','skipper']);
  await search.fill('kÅrE');await settle();assert.deepEqual(await rows(),['kept'],'Danish skipper search works within favourites');
  await search.fill('x-99');await settle();assert.deepEqual(await rows(),[],'Unstarred boats never leak into a favourite-only text filter');
  await favourites.click();await settle();assert.deepEqual(await rows(),['future','name','outside']);
  assert.deepEqual(await page.evaluate(()=>({time:currentTime(),view:[...view]})),{time:scene.time,view:scene.view},'Filtering changes neither camera nor time');
  if(readonly)assert.deepEqual(await page.evaluate(()=>({notes:JSON.stringify(notes),stored:SRStorage.getItem('sr2026-notes')})),{notes:scene.notes,stored:scene.stored});
  else assert.deepEqual(await page.evaluate(()=>({query:notes[0].settings.boatSearchQuery,favourites:notes[0].settings.boatFavouritesOnly})),{query:'x-99',favourites:false},'Editor filters autosave to the current event');
  await search.fill('match');await settle();
  await heart('name').check();await settle();
  assert.deepEqual(await chosenNames(),['Borealis','MATCH Sejler','Mercutio']);
  assert.equal(await heart('name').evaluate(input=>getComputedStyle(input.nextElementSibling).fill),'rgb(188, 49, 84)');
  await heart('skipper').uncheck();await settle();
  assert.deepEqual(await rows(),['future','name','outside','skipper','type'],'Empty hearts remain in the all-boats filter');
  await page.locator('[data-boat-marker="type"] .boat-hull').click();await settle();assert.equal(await heart('type').isChecked(),true);
  await favourites.click();await settle();assert.deepEqual(await rows(),['name','type']);
  await heart('name').uncheck();await settle();assert.deepEqual(await rows(),['type'],'A removed favourite disappears immediately from favourite-only results');
  await page.locator('.visible-boat[data-boat-id="type"]').focus();await page.keyboard.press('Space');await settle();
  assert.deepEqual(await rows(),[]);assert.deepEqual(await chosenNames(),['Mercutio']);
  assert.equal(await page.locator('#boatSearchInput').evaluate(node=>node===document.activeElement),true,'Focus returns to the filter if its active row disappears');
  await favourites.click();await search.fill('');await settle();
  await heart('name').check();await heart('type').check();await settle();
  // Enter inverts only the current list, preserving the old keyboard behaviour.
  await search.fill('match');await settle();await search.press('Enter');await settle();
  assert.deepEqual(await chosenNames(),['Borealis','Match Senere','Match Udenfor','Mercutio']);
  await search.press('Enter');await settle();assert.deepEqual(await chosenNames(),['Cirrus','MATCH Sejler','Mercutio']);
  await search.fill('does-not-exist');await settle();await search.press('Enter');
  assert.deepEqual(await chosenNames(),['Cirrus','MATCH Sejler','Mercutio']);
  await search.press('Escape');await settle();assert.deepEqual(await rows(),all);assert.equal(await search.inputValue(),'');
  await favourites.click();await search.fill('match');await settle();assert.deepEqual(await rows(),['name','type']);
  await page.locator('#visibleBoatsToggle').click();await settle();
  assert.deepEqual(await tracks(),['name','type'],'Collapsing the list does not change its live filter');
  await page.locator('#visibleBoatsToggle').click();await settle();assert.equal(await search.inputValue(),'match');
  // The broken heart clears every favourite, including Mercutio outside this text filter.
  await clear.click();await settle();assert.deepEqual(await chosenNames(),[]);assert.deepEqual(await rows(),[]);assert.deepEqual(await tracks(),[]);
  assert.equal(await clear.isEnabled(),false);
  assert.equal(await favourites.getAttribute('aria-pressed'),'true','Clearing favourites keeps favourite-only mode active');
  await favourites.click();await settle();assert.deepEqual(await rows(),['future','name','outside','skipper','type']);
  await search.fill('');await settle();assert.deepEqual(await rows(),all);
  await heart('kept').focus();await page.keyboard.press('Space');await settle();
  assert.deepEqual(await chosenNames(),['Mercutio'],'Native keyboard heart control works');
  if(readonly){
   assert.equal(await page.evaluate(()=>JSON.stringify(notes)),scene.notes,'Public favourite changes never modify saved events');
  }else{
   assert.deepEqual(await page.evaluate(()=>notes[0].settings.boats),['Mercutio'],'Hearts retain per-event autosave');
   await page.evaluate(()=>{window.originalSearchStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='sr2026-notes')throw Error('quota');return originalSearchStorage.call(this,key,value);};});
   await heart('name').click();await settle();assert.equal(await heart('name').isChecked(),false,'Failed saving rolls back the heart');
   await clear.click();await settle();assert.deepEqual(await chosenNames(),['Mercutio'],'A failed global clear restores all favourites');
   assert.match(await page.locator('#eventBoatStatus').textContent(),/kunne ikke gemmes/);
   await page.evaluate(()=>{Storage.prototype.setItem=originalSearchStorage;});
  }
  assert.equal(await page.evaluate(()=>!hasRenderingFailure()),true);
  await page.screenshot({path:path.join(os.tmpdir(),`sr2026-boat-filter-${readonly?'public':'editor'}.png`)});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:'firefox',readonly,checks:'all boats with empty filter, funnel and heart icons, live favourites and metadata filters, global broken-heart clear, Enter and keyboard hearts, collapsed filter, camera/time, event autosave and rollback',errors}));
 }finally{await browser.close();}
}
(async()=>{await check(false);await check(true);})().catch(error=>{console.error(error);process.exit(1);});
