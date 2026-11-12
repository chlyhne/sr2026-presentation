const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  await require('./viewer-track-fixtures.cjs')(page);
  page.on('pageerror',error=>errors.push(error.message));
  const url=process.env.SR_VIEWER_URL||'http://127.0.0.1:18456/';
  await page.goto(url);await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>{
   stopPlayback();const time=D.start+3600,metadata=boatMetadata('Mercutio');
   const boat=(id,name,latitude,step=60,reverse=false)=>({id,name,metadata,handicapSecondsPerNm:580.6,
    points:Array.from({length:13},(_,i)=>[12+(reverse?12-i:i)*.01,latitude,time+i*step]),speeds:Array(13).fill(6)});
   boats.splice(0,boats.length,boat('fast','Mercutio',55.6),boat('slow','Vera',55.61,90),
    boat('outside','My',55.67),boat('reverse','THE HULK',55.62,60,true));
   referenceBoatId='fast';
   for(const boat of boats){prepareTrackFixture(boat);webglTracks.prepare(boat);prepareGateTrack(boat.points);}
   const settings={...sceneSettings(),wind:false,rain:false,traffic:false,military:false,boatFavouritesOnly:false,boatSearchQuery:'',comparison:{enabled:false,basis:'absolute'},handicapTracksEnabled:false};
   notes=[{time:time+700,text:'Gates A',view:[530,520,60,85],settings,measurement:[],gates:[],custom:{keep:true}},
    {time:time+710,text:'Gates B',view:[530,520,60,85],settings,measurement:[],gates:[]},
    {time:time+710,text:'Same time',view:[530,520,60,85],settings,measurement:[],gates:[]}];
   persistNotes(notes);showNotes();restoreNote(notes[0]);
  });
  const stored=()=>page.evaluate(()=>JSON.parse(SRStorage.getItem('sr2026-notes')));
  const gates=()=>page.evaluate(()=>{flushRender();return currentGateMeasurement().map(p=>[...p]);});
  const stroke=async(start,end,number)=>{
   const points=await page.evaluate(coordinates=>coordinates.map(coordinate=>new DOMPoint(...xy(coordinate)).matrixTransform(mapViewport().matrix).toJSON()),[start,end]);
   await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();
   const camera=await page.evaluate(()=>[...view]);
   await page.mouse.move(points[1].x,points[1].y,{steps:5});
   assert.equal(await page.locator(`#mapNavigation [data-gate="${number}"]`).count(),1,'Gate follows the pointer before release');
   assert.deepEqual(await page.evaluate(()=>view),camera,'Drawing gates never pans the map');
   await page.mouse.up();
  };
  const draw=async()=>{
   await page.locator('#mapGatesToggle').click();
   await stroke([12.02,55.58],[12.02,55.64],1);
   assert.equal(await page.evaluate(()=>gateDraft.length),2);
   assert.equal((await gates()).length,0,'One gate is not a completed measurement');
   await stroke([12.06,55.58],[12.06,55.64],2);
   assert.equal(await page.evaluate(()=>navigationMode),null);
   return gates();
  };
  const initial=await stored();
  await page.locator('#mapGatesToggle').click();
  await stroke([12.02,55.58],[12.02,55.64],1);
  await page.keyboard.press('Backspace');
  assert.equal(await page.evaluate(()=>gateDraft.length),0,'Backspace discards the first gate');
  await page.keyboard.press('Escape');assert.deepEqual(await gates(),[]);
  assert.deepEqual(await stored(),initial,'Cancelling a partial gate measurement does not edit the event');
  const points=await draw();
  assert.equal(points.length,4);assert.deepEqual(await stored(),initial,'Gate drawing stages the event draft');
  assert.deepEqual(await page.evaluate(()=>eventDraft.gates),points);
  const times=await page.evaluate(()=>{flushRender();return [...document.querySelectorAll('.boat-gate-time')].map(node=>({id:node.closest('[data-boat-marker]').dataset.boatMarker,seconds:+node.dataset.elapsedSeconds,text:node.textContent}));});
  assert.deepEqual(times.map(t=>t.id).sort(),['fast','slow'],'Finite gates and required order exclude other tracks');
  for(const timing of times){
   const expected=(points[2][0]-points[0][0])/.01*(timing.id==='fast'?60:90);
   assert.ok(Math.abs(timing.seconds-expected)<1e-4,`${timing.id}: ${timing.seconds} ~= ${expected}`);
   assert.match(timing.text,/1→2 · \d\d:\d\d,\d/);
  }
  await page.locator('#save').click();assert.deepEqual((await stored())[0].gates,points);
  assert.deepEqual((await stored())[0].custom,{keep:true});
  // Drawing a ruler alongside gates preserves the two independent event tools.
  await page.evaluate(()=>{setMeasurement([[12,55.6],[12.01,55.6]]);renderNavigation();});
  await page.locator('#save').click();assert.equal((await stored())[0].measurement.length,2);
  await page.locator('#mapGatesToggle').click();assert.deepEqual(await gates(),[]);
  assert.equal(await page.locator('.boat-gate-time').count(),0);
  await page.locator('#cancelEdit').click();assert.deepEqual(await gates(),points,'Cancel restores gates');
  // Boat/style/camera changes must use prepared crossings, even for an unselected boat.
  await page.evaluate(()=>{
   setPresentationMode(true);
   gateCurveCrossings=()=>{throw Error('Crossings must not be recomputed during interaction');};
   chosen.clear();chosen.add('Mercutio');boatFavouritesOnly=true;render();
   chosen.add('Vera');render();comparison={enabled:false,basis:'absolute',boatColour:true};render();
   changeMapView([view[0],view[1],view[2]*.95,view[3]*.95]);flushRender();
  });
  assert.equal(await page.locator('.boat-gate-time').count(),2);
  await page.evaluate(()=>restoreNote(notes[1]));assert.deepEqual(await gates(),[]);assert.equal(await page.locator('.boat-gate-time').count(),0);
  await page.evaluate(points=>{notes[2].gates=points;restoreNote(notes[2]);},points);assert.deepEqual(await gates(),points,'Same-time events have independent gates');
  await page.evaluate(()=>restoreNote(notes[0]));assert.deepEqual(await gates(),points);
  await page.evaluate(()=>{setPresentationMode(true);setCurrentTime(notes[0].time+1,{allowOutsideVisibleRanges:true});render();});
  assert.deepEqual(await gates(),[]);assert.equal(await page.locator('.boat-gate-time').count(),0,'Moving on removes event times as well as gates');
  await page.evaluate(()=>restoreNote(notes[0]));assert.deepEqual(await gates(),points);
  await page.locator('#mapGatesToggle').click();assert.deepEqual(await gates(),[]);
  assert.deepEqual((await stored())[0].gates,points,'Presentation changes are temporary');
  await page.evaluate(()=>{restoreNote(notes[0]);setPresentationMode(false);});
  await page.locator('#mapGatesToggle').click();await page.locator('#save').click();assert.deepEqual((await stored())[0].gates,[]);
  await page.evaluate(points=>{setCurrentTime(notes[0].time+2,{allowOutsideVisibleRanges:true});render();setGateMeasurement(points);flushRender();},points);
  await page.locator('#note').fill('New gates event');await page.locator('#save').click();
  assert.deepEqual((await stored()).find(n=>n.text==='New gates event').gates,points);
  assert.deepEqual(await page.evaluate(()=>gateMeasurement),[],'New event consumes standalone gates');
  const exported=await page.evaluate(async()=>{
   let data;const original=download;download=blob=>{data=blob.text().then(JSON.parse);};
   try{await exportEventNotes();return await data;}finally{download=original;}
  });
  assert.deepEqual(exported.notes.find(n=>n.text==='New gates event').gates,points);
  // A real public load prepares the saved geometry for the actual fleet before interaction.
  const publicPage=await browser.newPage({viewport:{width:1500,height:1000}});
  publicPage.on('pageerror',error=>errors.push(error.message));
  await publicPage.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={local:false,admin:false};'}));
  const document=JSON.parse(JSON.stringify(exported));document.notes=document.notes.filter(n=>n.text==='New gates event');
  delete document.notes[0].settings;
  await publicPage.route('**/presentation.json',route=>route.fulfill({json:document}));
  await publicPage.goto(url);await publicPage.waitForSelector('main:not([inert])',{timeout:120000});
  assert.deepEqual(await publicPage.evaluate(()=>currentGateMeasurement()),points);
  assert.equal(await publicPage.evaluate(()=>preparedGateTiming(currentGateMeasurement()).size===boats.length),true);
  await publicPage.close();assert.deepEqual(errors,[]);
  console.log('Firefox PC: two drags with live gates, real elapsed times, finite boundaries/order, event drafts/Save/Cancel/removal, selection/style/zoom reuse, event departure/return, presentation isolation, new events, export and public preparation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
