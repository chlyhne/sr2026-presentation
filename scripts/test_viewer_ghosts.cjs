const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
(async()=>{
 const browser=await firefox.launch({headless:false});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const fixture=await page.evaluate(()=>{
   stopPlayback();$('wind').checked=$('rain').checked=false;
   const boat=boats.find(boat=>boat.name==='My'),clock=ghostClocks.get(boat.id),sourceTime=boat.raceStartTime+10800;
   const time=ghostClockAtSource(clock,sourceTime),position=trackPosition(boat.points,sourceTime),actual=trackPosition(boat.points,time);
   chosen.clear();for(const name of ['Mercutio','Vera','My','THE HULK'])chosen.add(name);
   const a=xy(position.point),b=xy(actual.point),width=Math.max(4,Math.abs(a[0]-b[0])+4),height=Math.max(4,Math.abs(a[1]-b[1])+4);
   view=[Math.min(a[0],b[0])-2,Math.min(a[1],b[1])-2,width,height];
   selectedTime=time;setview();setCurrentTime(time,{fractional:true,allowOutsideVisibleRanges:true});render();
   window.ghostTestClock=clock;window.ghostTestIndex=clock.timelineIndex;
   window.ghostTestBytes=()=>[...webglTracks.buffers.values()].reduce((sum,record)=>sum+record.bytes,0);
   window.ghostTestInitial={uploads:webglTracks.uploads,bytes:ghostTestBytes(),buffers:webglTracks.buffers.size};
   prepareGhostClock=()=>{throw Error('Selection or playback recalculated a fixed ghost clock');};
   return {id:boat.id,time,sourceTime,point:position.point.slice(0,2),expected:xy(position.point),view:[...view],end:clock.end};
  });
  const ghost=page.locator('[data-ghost-boat="'+fixture.id+'"]');
  await page.locator('#mapTracksToggle').click();
  const choice=page.getByRole('checkbox',{name:'Handicapkompenseret spor',exact:true});
  assert.equal(await page.locator('#mapTracksPanel input[type="checkbox"]').count(),1);
  await choice.check();await page.locator('#mapTracksToggle').click();
  await ghost.waitFor();
  assert.equal(await page.locator('[data-ghost-boat]').count(),4,'One checkbox enables a ghost for every selected boat');
  const marker=await ghost.evaluate(group=>({
   x:+group.dataset.screenX,y:+group.dataset.screenY,time:+group.dataset.sourceTime,opacity:+group.getAttribute('opacity'),
   pointerEvents:getComputedStyle(group).pointerEvents,colour:group.querySelector('.boat-hull').getAttribute('fill'),
   hull:group.querySelector('.boat-hull').getAttribute('d'),name:group.querySelector('.boat-name').textContent
  }));
  assert.ok(Math.abs(marker.x-fixture.expected[0])<1e-6&&Math.abs(marker.y-fixture.expected[1])<1e-6);
  assert.ok(Math.abs(marker.time-fixture.sourceTime)<1e-6);assert.equal(marker.opacity,.38);assert.equal(marker.pointerEvents,'none');
  const original=page.locator('[data-boat-marker="'+fixture.id+'"]');
  assert.equal(marker.colour,await original.locator('.boat-hull').getAttribute('fill'));
  assert.equal(marker.hull,await original.locator('.boat-hull').getAttribute('d'));assert.match(marker.name,/My · handicap/);
  assert.equal(await page.locator('#ghostBoatMarkers path:not(.boat-hull)').count(),0,'The ghost must never get its own track line');
  await page.evaluate(()=>{
   if(ghostTestClock!==ghostClocks.get(boats.find(boat=>boat.name==='My').id)||ghostTestIndex!==ghostTestClock.timelineIndex)throw Error('Prepared clock/index was replaced');
   const current={uploads:webglTracks.uploads,bytes:ghostTestBytes(),buffers:webglTracks.buffers.size};
   if(JSON.stringify(current)!==JSON.stringify(ghostTestInitial))throw Error('A ghost allocated/uploaded track geometry');
  });
  // Changing style, reference and normal selection must not rebuild ghost data.
  await page.locator('#mapTracksToggle').click();
  for(const style of ['boat','absolute','handicap','time','speed'])await page.locator('#trackStyle').selectOption(style);
  await page.locator('#referenceBoat').selectOption(fixture.id);await page.locator('#mapTracksToggle').click();
  await page.evaluate(id=>{const boat=boats.find(boat=>boat.id===id);setBoatSelected(boat,false);flushRender();},fixture.id);
  assert.equal(await ghost.count(),0);
  await page.evaluate(id=>{const boat=boats.find(boat=>boat.id===id);setBoatSelected(boat,true);selectedTime=ghostClockAtSource(ghostClocks.get(id),boat.raceStartTime+10800);render();},fixture.id);
  await ghost.waitFor();
  assert.equal(await page.locator('[data-ghost-boat]').count(),4);
  await page.evaluate(()=>{setBoatSearch('XBOX');flushRender();});
  assert.equal(await page.locator('[data-ghost-boat]').count(),0,'Unselected search results must not receive ghosts');
  await page.evaluate(()=>{setBoatSearch('');flushRender();});
  await page.locator('#mapTracksToggle').click();await choice.uncheck();await page.locator('#mapTracksToggle').click();
  await page.waitForFunction(()=>$('ghostBoatMarkers').children.length===0);
  await page.locator('#mapTracksToggle').click();await choice.check();
  await page.screenshot({path:'/tmp/sr2026-handicap-checkbox.png'});
  await page.locator('#mapTracksToggle').click();await ghost.waitFor();
  await page.locator('#startPresentation').click();await ghost.waitFor();
  assert.equal(await ghost.getAttribute('opacity'),'.38');
  await page.screenshot({path:'/tmp/sr2026-ghost-boats.png'});
  await page.locator('#endPresentation').click();
  // Extend the slider beyond the weather interval through the last ghost finish.
  const finish=await page.evaluate(()=>{
   view=[230,250,620,760];setview();updateTimeline({preserveTime:true});
   const selected=boats.filter(showHandicapGhost).map(boat=>({boat,clock:ghostClocks.get(boat.id)})).sort((a,b)=>a.clock.end-b.clock.end);
   const winner=selected[0],last=selected.at(-1);setCurrentTime(last.clock.end+1,{fractional:true});render();
   return {winner:winner.boat.id,winnerTime:winner.clock.end,last:last.boat.id,lastTime:last.clock.end,time:currentTime(),dataEnd:D.end,rangesEnd:visibleTimeRanges.at(-1).end};
  });
  assert.ok(finish.lastTime>finish.dataEnd);assert.ok(finish.time>finish.lastTime);assert.ok(finish.rangesEnd>=finish.lastTime);
  assert.match(await page.locator('[data-ghost-boat="'+finish.last+'"]').getAttribute('aria-label'),/i mål/);
  await page.locator('#note').fill('Spøgelser i mål');await page.locator('#save').click();
  assert.ok(await page.evaluate(()=>timelineNotes().some(note=>note.time>D.end)));
  await page.evaluate(()=>beginNoteEditing(notes[0]));
  assert.equal(await page.locator('#noteTime').evaluate(input=>input.validity.rangeOverflow),false);
  await page.locator('#save').click();assert.equal(await page.evaluate(()=>editingNote),null);
  await page.evaluate(time=>{setCurrentTime(time,{fractional:true});render();},finish.winnerTime+.01);
  assert.match(await page.locator('[data-ghost-boat="'+finish.winner+'"]').getAttribute('aria-label'),/i mål/);
  const prepared=await page.evaluate(()=>({same:ghostTestClock===ghostClocks.get(boats.find(boat=>boat.name==='My').id),index:ghostTestIndex===ghostTestClock.timelineIndex}));
  assert.deepEqual(prepared,{same:true,index:true});
  await page.reload();await page.waitForSelector('main:not([inert])',{timeout:120000});
  assert.equal(await page.evaluate(()=>handicapTracksEnabled),true);
  const unavailable=await page.evaluate(()=>{
   const boat=boats.find(boat=>ghostClocks.get(boat.id).error);chosen.add(boat.name);render();return boat.name;
  });
  await page.locator('#mapTracksToggle').click();
  assert.equal(await choice.isChecked(),true);
  assert.equal(await page.locator('#mapTracksPanel input[type="checkbox"]').count(),1);
  assert.match(await page.locator('#ghostStatus').textContent(),/Registreret måltid mangler/);
  assert.ok((await page.locator('#ghostStatus').textContent()).includes(unavailable));
  await page.evaluate(()=>{
   window.originalHandicapStorage=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){if(key===HANDICAP_TRACKS_KEY)throw Error('quota');return originalHandicapStorage.call(this,key,value);};
  });
  await choice.click();assert.equal(await choice.isChecked(),true);
  assert.match(await page.locator('#ghostStatus').textContent(),/kunne ikke gemmes/);
  await page.evaluate(()=>Storage.prototype.setItem=originalHandicapStorage);
  await choice.uncheck();assert.equal(await choice.isChecked(),false);
  await page.reload();await page.waitForSelector('main:not([inert])',{timeout:120000});
  assert.equal(await page.evaluate(()=>handicapTracksEnabled),false);
  assert.deepEqual(errors,[]);
  console.log('Firefox PC: one handicap checkbox, automatic ghosts for selected boats, no ghosts for unselected search results, on/off and persistence, unchanged track clocks/buffers, reference/style changes, finish playback, presentation and explicit data/storage errors.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
