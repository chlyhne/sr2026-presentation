const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(readonly){
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  if(readonly){
   await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={admin:false,apiBase:""};'}));
   await page.route('**/presentation.json',route=>route.fulfill({json:{version:1,speedPins:[],notes:[]}}));
  }
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
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
   chosen.clear();chosen.add('Mercutio');chosen.add('Borealis');
   for(const boat of boats)colours[boat.name]='#ffdc42';
   const [x,y]=xy([12,55.6]);view=[x-200,y-200,400,400];$('map').setAttribute('viewBox',view.join(' '));
   notes=[{time,text:'Søgetest',view:[...view],settings:sceneSettings()}];activePresentationNote=notes[0];
   if(!window.SR_READONLY)SRStorage.setItem('sr2026-notes',JSON.stringify(notes));
   updateTimeline();render();
  });
  const chosenNames=()=>page.evaluate(()=>[...chosen].sort());
  const rows=()=>page.locator('.visible-boat').evaluateAll(nodes=>nodes.map(node=>node.dataset.boatId).sort());
  const markers=()=>page.locator('[data-boat-marker]').evaluateAll(nodes=>nodes.map(node=>node.dataset.boatMarker).sort());
  const tracks=()=>page.evaluate(()=>webglTracks.order.map(boat=>boat.id).sort());
  const checkbox=id=>page.locator(`.visible-boat[data-boat-id="${id}"] input`);
  const search=page.locator('#boatSearchInput');
  const scene=await page.evaluate(()=>({time:currentTime(),view:[...view],notes:JSON.stringify(notes),stored:SRStorage.getItem('sr2026-notes')}));
  await page.locator('#visibleBoatsToggle').click();
  assert.deepEqual(await rows(),['kept','skipper']);
  assert.equal(await checkbox('kept').isChecked(),true);
  await search.fill('mAtCh');
  await page.waitForFunction(()=>webglTracks.order.length===5);
  assert.deepEqual(await rows(),['future','name','outside','skipper','type'],'All metadata matches are listed, even outside the viewport or before their start');
  assert.deepEqual(await tracks(),['future','name','outside','skipper','type'],'Tracks use exactly the search matches, hiding checked nonmatches');
  assert.deepEqual(await markers(),['name','outside','skipper','type'],'Preview includes unchecked matches with a current position');
  assert.deepEqual(await chosenNames(),['Borealis','Mercutio'],'Typing does not change the selection');
  assert.deepEqual(await page.evaluate(()=>({time:currentTime(),view:[...view],notes:JSON.stringify(notes),stored:SRStorage.getItem('sr2026-notes')})),scene,'Search leaves scene and saved events unchanged');
  if(!readonly){
   await page.evaluate(()=>{
    window.originalSearchSnapshot=webglTracks.snapshot;
    webglTracks.snapshot=function(time,order,scale){window.searchSnapshotBoatIds=order.map(boat=>boat.id).sort();return originalSearchSnapshot.call(this,time,order,scale);};
   });
   const download=page.waitForEvent('download');await page.evaluate(()=>captureMap());await download;
   assert.deepEqual(await page.evaluate(()=>searchSnapshotBoatIds),await tracks(),'PNG uses the same filtered WebGL boat set');
   await page.evaluate(()=>{webglTracks.snapshot=originalSearchSnapshot;});
  }
  await search.press('ArrowLeft');await search.press('Home');await search.press('End');await search.press('Space');
  assert.equal(await search.inputValue(),'mAtCh ','Search retains native cursor/space behavior');
  assert.equal(await search.evaluate(node=>document.activeElement===node),true);
  assert.equal(await page.evaluate(()=>currentTime()),scene.time);
  await checkbox('name').check();
  assert.deepEqual(await chosenNames(),['Borealis','MATCH Sejler','Mercutio']);
  await checkbox('skipper').uncheck();
  assert.equal(await checkbox('skipper').isChecked(),false);
  assert.deepEqual(await markers(),['name','outside','skipper','type'],'Unchecking a search match leaves it in the preview');
  const shownNames=await page.evaluate(()=>[...shownBoatNames]);
  await page.locator('[data-boat-marker="type"] .boat-hull').click();
  assert.equal(await checkbox('type').isChecked(),true,'Map click includes a matching boat');
  assert.deepEqual(await page.evaluate(()=>[...shownBoatNames]),shownNames,'Search marker clicks do not toggle names');
  await page.locator('[data-boat-marker="type"]').focus();await page.keyboard.press('Space');
  assert.equal(await checkbox('type').isChecked(),false,'Map keyboard activation also toggles inclusion');
  assert.equal(await page.locator('[data-boat-marker="type"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('[data-boat-marker="type"]').evaluate(node=>document.activeElement===node),true);
  await search.fill('kÅrE');
  await page.waitForFunction(()=>webglTracks.order.length===1&&webglTracks.order[0].id==='kept');
  assert.deepEqual(await rows(),['kept'],'Skipper search supports Danish case folding');
  await search.fill('x-99');
  await page.waitForFunction(()=>webglTracks.order.length===3);
  assert.deepEqual(await rows(),['future','name','outside'],'Boat-type substring search');
  await search.fill('Ingen matcher dette');
  await page.waitForFunction(()=>webglTracks.order.length===0);
  assert.deepEqual(await rows(),[]);assert.deepEqual(await markers(),[]);
  assert.equal(await page.locator('#visibleBoatsEmpty').textContent(),'Ingen både matcher søgningen.');
  await page.locator('#boatSearchClear').click();
  await page.waitForFunction(()=>!isBoatSearchActive()&&webglTracks.order.length===2);
  assert.deepEqual(await rows(),['kept','name']);assert.deepEqual(await markers(),['kept','name']);
  assert.deepEqual(await tracks(),['kept','name'],'Finishing search shows only the final checked set');
  const selection=await chosenNames();
  await page.locator('[data-boat-marker="name"]').focus();await page.keyboard.press('Enter');
  assert.deepEqual(await chosenNames(),selection,'Normal map activation still toggles names, not selection');
  assert.equal(await page.evaluate(()=>shownBoatNames.has('name')),true);
  await checkbox('name').click();
  await page.waitForFunction(()=>webglTracks.order.length===1);
  assert.deepEqual(await rows(),['kept'],'Boats can also be deselected without a search');
  await search.fill('match');
  await page.waitForFunction(()=>webglTracks.order.length===5);
  await page.locator('.visible-boat[data-boat-id="type"]').focus();await page.keyboard.press('Space');
  assert.equal(await checkbox('type').isChecked(),true,'A focused list row supports keyboard selection');
  await search.focus();await search.press('Escape');
  await page.waitForFunction(()=>!isBoatSearchActive()&&webglTracks.order.length===2);
  assert.equal(await search.inputValue(),'');assert.equal(await page.locator('#visibleBoatsPanel').isVisible(),true);
  await search.fill('match');await page.locator('#visibleBoatsToggle').click();
  await page.waitForFunction(()=>!isBoatSearchActive()&&webglTracks.order.length===2);
  assert.equal(await page.locator('#visibleBoatsPanel').isVisible(),false,'Collapsing the menu also ends the temporary search');
  assert.equal(await page.evaluate(()=>currentTime()),scene.time);
  if(readonly){
   assert.equal(await page.evaluate(()=>JSON.stringify(notes)),scene.notes,'Public selections never change the saved event');
   assert.equal(await page.evaluate(()=>SRStorage.getItem('sr2026-notes')),scene.stored);
  }else{
   assert.deepEqual(await page.evaluate(()=>notes[0].settings.boats.sort()),['Cirrus','Mercutio'],'Editor selections reuse per-event autosave');
   await page.locator('#visibleBoatsToggle').click();await search.fill('match');
   await page.waitForFunction(()=>webglTracks.order.length===5);
   await page.evaluate(()=>{window.originalSearchStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='sr2026-notes')throw Error('quota');return originalSearchStorage.call(this,key,value);};});
   await checkbox('name').click();
   assert.equal(await checkbox('name').isChecked(),false,'Failed save rolls back the list checkbox');
   assert.deepEqual(await chosenNames(),['Cirrus','Mercutio']);
   assert.match(await page.locator('#eventBoatStatus').textContent(),/kunne ikke gemmes/);
   await page.evaluate(()=>{Storage.prototype.setItem=originalSearchStorage;});
  }
  await page.screenshot({path:path.join(os.tmpdir(),`sr2026-boat-search-${readonly?'public':'editor'}.png`)});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:'firefox',readonly,checks:'live metadata search, filtered WebGL tracks and markers, preview without changing saved choices, checkbox and map selection, keyboard, clear/collapse, per-event save and rollback',errors}));
 }finally{await browser.close();}
}
(async()=>{await check(false);await check(true);})().catch(error=>{console.error(error);process.exit(1);});
