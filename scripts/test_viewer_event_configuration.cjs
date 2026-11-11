const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const published=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../presentation/presentation.json'),'utf8'));
  const migrated=await page.evaluate(history=>{
   const before=JSON.stringify(history);
   const settings=history.notes.map(note=>eventSettings(note.settings));
   return {count:settings.length,unchanged:JSON.stringify(history)===before,complete:settings.every(value=>value.mapVersion===1)};
  },published);
  assert.deepEqual(migrated,{count:published.notes.length,unchanged:true,complete:true});
  const fixtures=await page.evaluate(()=>{
   const base=sceneSettings(),mercutio=boats.find(boat=>boat.name==='Mercutio'),vera=boats.find(boat=>boat.name==='Vera');
   notes=[
    {time:D.start+3600,text:'Complete A',view:[230,250,620,760],settings:{...base,comparison:{enabled:true,basis:'time',boatColour:false},
     referenceBoatId:vera.id,trackLengthSeconds:900,boatSearchQuery:'mer',boatFavouritesOnly:true,boats:['Mercutio'],boatNames:[mercutio.id]}},
    {time:D.start+7200,text:'Complete B',view:[200,200,500,600],settings:{...base,comparison:{enabled:false,basis:'handicap',boatColour:true},
     referenceBoatId:mercutio.id,trackLengthSeconds:0,handicapTracksEnabled:true,boatSearchQuery:'',boatFavouritesOnly:false,boats:['Vera']}},
    {time:D.start+10800,text:'Legacy',view:[100,200,700,800],point:[400,500],customMetadata:{keep:true},
     settings:{boats:[],boatNames:[],wind:false,rain:false,annotationsVisible:false}},
    {time:D.start+14400,text:'Old without settings',view:[0,0,1000,1180]}
   ];
   window.originalEventProfiles=boats.map(boat=>trackProfileCache.get(boat.points));
   persistNotes(notes);showNotes();restoreNote(notes[0]);
   return JSON.parse(JSON.stringify(notes));
  });
  const allNames=await page.evaluate(()=>boats.map(boat=>boat.id));
  const withNames=settings=>({...settings,boatNames:allNames});
  const snapshot=()=>page.evaluate(()=>sceneSettings());
  const saved=()=>page.evaluate(()=>JSON.parse(SRStorage.getItem('sr2026-notes')));
  assert.deepEqual(await snapshot(),withNames(fixtures[0].settings));
  const soft=await page.evaluate(()=>{const before=[...view];restoreNote(notes[1],{restoreView:false});return {before,after:[...view]};});
  assert.deepEqual(soft.after,soft.before);assert.deepEqual(await snapshot(),withNames(fixtures[1].settings));
  await page.evaluate(()=>restoreNote(notes[1]));assert.deepEqual(await page.evaluate(()=>view),fixtures[1].view);
  await page.evaluate(()=>restoreNote(notes[2]));
  const legacy=await snapshot();assert.equal(legacy.mapVersion,1);assert.equal(legacy.trackLengthSeconds,7200);
  assert.equal(legacy.referenceBoatId,fixtures[1].settings.referenceBoatId);assert.equal(legacy.comparison.enabled,false);
  assert.equal(legacy.handicapTracksEnabled,false);assert.equal(legacy.boatFavouritesOnly,true);assert.equal(legacy.boatSearchQuery,'');
  assert.deepEqual(legacy.boats,[]);assert.deepEqual(legacy.boatNames,allNames);assert.equal(legacy.wind,false);assert.equal(legacy.annotationsVisible,false);
  assert.deepEqual(await page.evaluate(()=>boats.filter(boatIsDisplayed).map(boat=>boat.id)),[]);
  assert.deepEqual(await saved(),fixtures);
  const rejected=await page.evaluate(()=>{
   const invalid=[{...sceneSettings(),mapVersion:2},{...sceneSettings(),referenceBoatId:'missing'},{mapVersion:1}];
   return invalid.map(settings=>{try{eventSettings(settings);return false;}catch{return true;}});
  });
  assert.deepEqual(rejected,[true,true,true]);
  await page.evaluate(()=>restoreNote(notes[3]));
  assert.deepEqual((await snapshot()).boats,[]);
  assert.equal((await snapshot()).wind,false);assert.equal((await snapshot()).rain,false);
  assert.equal((await snapshot()).boatFavouritesOnly,false);
  await page.evaluate(()=>restoreNote(notes[0]));
  await page.evaluate(()=>{
   saveReferenceBoat(boats.find(boat=>boat.name==='My').id);
   saveComparison({enabled:true,basis:'absolute',boatColour:false});
   $('trackLength').value='3600';$('trackLength').dispatchEvent(new Event('change'));
   setBoatFavouritesOnly(false);setBoatSearch('vera');
   setBoatSelected(boats.find(boat=>boat.name==='Vera'),true);
  });
  assert.deepEqual((await saved())[0].settings,await snapshot());
  assert.deepEqual((await saved()).slice(1),fixtures.slice(1));
  await page.evaluate(()=>setHandicapTracks(true));
  assert.equal((await saved())[0].settings.handicapTracksEnabled,true);
  const changed=await saved();
  await page.evaluate(()=>beginNoteEditing(notes[0]));
  await page.evaluate(()=>{setHandicapTracks(false);setBoatSearch('rosa');saveReferenceBoat(boats[0].id);});
  assert.deepEqual(await saved(),changed);
  await page.locator('#cancelEdit').click();assert.deepEqual(await snapshot(),changed[0].settings);
  await page.evaluate(()=>{
   beginNoteEditing(notes[0]);setHandicapTracks(false);setBoatSearch('my');
   saveComparison({enabled:false,basis:'absolute',boatColour:true});saveAnnotation();
  });
  assert.deepEqual((await saved())[0].settings,await snapshot());
  const beforeFailure=await snapshot(),storedBeforeFailure=await saved();
  const referenceBeforeFailure=await page.evaluate(()=>localStorage.getItem(REFERENCE_BOAT_KEY));
  await page.evaluate(()=>{window.originalEventStorage=SRStorage;window.SRStorage={setItem(){throw Error('Quota');}};});
  await page.evaluate(()=>saveReferenceBoat(boats.find(boat=>boat.id!==referenceBoatId).id));
  assert.deepEqual(await snapshot(),beforeFailure);
  assert.equal(await page.evaluate(()=>localStorage.getItem(REFERENCE_BOAT_KEY)),referenceBeforeFailure);
  await page.evaluate(()=>{setBoatSearch('bad');setBoatFavouritesOnly(true);});
  assert.deepEqual(await snapshot(),beforeFailure);
  await page.evaluate(()=>window.SRStorage=window.originalEventStorage);assert.deepEqual(await saved(),storedBeforeFailure);
  await page.evaluate(()=>{setCurrentTime(notes[0].time+100);setBoatSearch('free');setHandicapTracks(true);});
  assert.deepEqual(await saved(),storedBeforeFailure);
  await page.evaluate(()=>{restoreNote(notes[0]);window.SR_READONLY=true;setBoatSearch('public');saveReferenceBoat(boats[0].id);window.SR_READONLY=false;});
  assert.deepEqual(await saved(),storedBeforeFailure);
  assert.equal(await page.evaluate(()=>boats.every((boat,index)=>trackProfileCache.get(boat.points)===originalEventProfiles[index])),true);
  await page.reload();await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>restoreNote(notes[0]));assert.deepEqual(await snapshot(),storedBeforeFailure[0].settings);
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,notes:[fixtures[2]],speedPins:[]}))});
  await page.waitForFunction(()=>notes.length===1&&notes[0].text==='Legacy');
  await page.evaluate(()=>restoreNote(notes[0]));assert.deepEqual(await snapshot(),legacy);
  await page.evaluate(()=>{setBoatSearch('imported');});
  const imported=(await saved())[0];assert.deepEqual(imported.customMetadata,fixtures[2].customMetadata);
  assert.deepEqual(imported.point,fixtures[2].point);assert.deepEqual(imported.view,fixtures[2].view);assert.equal(imported.settings.mapVersion,1);
  assert.deepEqual(errors,[]);
  console.log('Event configuration verified: complete restoration, legacy/import compatibility, autosave, draft save/cancel, rollback, read-only, unchanged profiles and camera behavior.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
