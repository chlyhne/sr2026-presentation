const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const fixture=await page.evaluate(()=>{
   stopPlayback();$('wind').checked=$('rain').checked=false;
   const starters=boats.filter(boat=>!ghostClocks.get(boat.id).error);
   if(new Set(starters.map(boat=>ghostClocks.get(boat.id).start)).size!==1)throw Error('Courses do not share one start signal');
   chosen.clear();for(const boat of starters)chosen.add(boat.name);
   setHandicapTracks(true);selectedTime=HANDICAP_COMMON_START;render();
   if($('boatMarkers').querySelectorAll('.boat-marker').length!==starters.length)throw Error('Not all compensated boats appear at the common signal');
   for(const marker of $('boatMarkers').querySelectorAll('.boat-marker')){
    const boat=boats.find(boat=>boat.id===marker.dataset.boatMarker);
    if(+marker.dataset.sourceTime!==boat.raceStartTime)throw Error('Start was moved to a GPS point or line crossing');
   }
   selectedTime=HANDICAP_COMMON_START-.01;render();
   if($('boatMarkers').querySelector('.boat-marker'))throw Error('A compensated boat started before the common signal');
   setHandicapTracks(false);
   const boat=boats.find(boat=>boat.name==='My'),clock=ghostClocks.get(boat.id),sourceTime=boat.raceStartTime+10800;
   const time=ghostClockAtSource(clock,sourceTime),position=trackPosition(boat.points,sourceTime),actual=trackPosition(boat.points,time);
   chosen.clear();for(const name of ['Mercutio','Vera','My','THE HULK'])chosen.add(name);
   const a=xy(position.point),b=xy(actual.point);
   view=[Math.min(a[0],b[0])-2,Math.min(a[1],b[1])-2,Math.max(4,Math.abs(a[0]-b[0])+4),Math.max(4,Math.abs(a[1]-b[1])+4)];
   selectedTime=time;setview();setCurrentTime(time,{fractional:true,allowOutsideVisibleRanges:true});
   saveComparison({enabled:true,basis:'time',boatColour:false});render();
   window.handicapTestClock=clock;window.handicapTestIndex=clock.timelineIndex;
   window.handicapTestInitial={uploads:webglTracks.uploads,bytes:[...webglTracks.buffers.values()].reduce((sum,record)=>sum+record.bytes,0),buffers:webglTracks.buffers.size};
   prepareGhostClock=()=>{throw Error('Interaction recalculated a fixed handicap clock');};
   return {id:boat.id,time,sourceTime,expected:a,original:b,colour:colours[boat.name],hull:$('boatMarkers').querySelector(`[data-boat-marker="${boat.id}"] .boat-hull`).getAttribute('d'),view:[...view]};
  });
  const marker=page.locator('[data-boat-marker="'+fixture.id+'"]'),choice=page.getByRole('checkbox',{name:'Handicapkompenseret spor',exact:true});
  await page.locator('#mapTracksToggle').click();
  assert.equal(await page.locator('#mapTracksPanel input[type="checkbox"]').count(),1);
  await choice.check();assert.equal(await page.locator('#trackStyle').inputValue(),'boat');
  assert.equal(await page.locator('#trackStyle').isDisabled(),true);
  await page.locator('#mapTracksToggle').click();
  await page.waitForFunction(()=>$('boatMarkers').querySelectorAll('[data-handicap-compensated]').length===4);
  const position=await marker.evaluate(group=>({x:+group.dataset.screenX,y:+group.dataset.screenY,time:+group.dataset.sourceTime,
   opacity:getComputedStyle(group).opacity,role:group.getAttribute('role'),name:group.querySelector('.boat-name').textContent,
   colour:group.querySelector('.boat-hull').getAttribute('fill'),hull:group.querySelector('.boat-hull').getAttribute('d')}));
  assert.ok(Math.abs(position.x-fixture.expected[0])<1e-6&&Math.abs(position.y-fixture.expected[1])<1e-6);
  assert.ok(Math.abs(position.time-fixture.sourceTime)<1e-6);assert.equal(position.opacity,'1');assert.equal(position.role,'button');
  assert.equal(position.name,'My');assert.equal(position.colour,fixture.colour);assert.equal(position.hull,fixture.hull);
  assert.equal(await page.locator('#boatMarkers .boat-marker').count(),4,'Only one normal marker per selected boat');
  assert.equal(await page.locator('#ghostBoatMarkers,.ghost-boat,[data-ghost-boat]').count(),0);
  assert.equal(await page.locator('#trackSpeedLegend > *').count(),0,'No speed/comparison scale in solid boat colour mode');
  // Check actual WebGL pixels behind and beyond the compensated bow.
  const pixels=await page.evaluate(fixture=>{
   const boat=boats.find(boat=>boat.id===fixture.id),gl=webglTracks.gl;
   chosen.clear();chosen.add(boat.name);render();webglTracks.render(currentTime(),[boat],true);
   const pixel=time=>{
    const [x,y]=xy(trackPosition(boat.points,time).point),matrix=$('map').getScreenCTM(),rect=$('map').getBoundingClientRect();
    const screen=new DOMPoint(x,y).matrixTransform(matrix),value=new Uint8Array(4);
    gl.readPixels(Math.floor((screen.x-rect.left)/rect.width*gl.drawingBufferWidth),gl.drawingBufferHeight-1-Math.floor((screen.y-rect.top)/rect.height*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,value);return [...value];
   };
   const window=displayTrackWindow(boat,currentTime());
   return {behind:pixel(fixture.sourceTime-30),ahead:pixel(fixture.sourceTime+60),original:pixel(fixture.time),to:window.to,
    fromClock:displayedTrackTime(boat,window.from),solid:gl.getUniform(webglTracks.program,webglTracks.uniforms.boatColourMode)};
  },fixture);
  assert.ok(pixels.behind[3]>240);assert.ok(pixels.behind.slice(0,3).every((value,i)=>Math.abs(value-[108,255,255][i])<12));
  assert.equal(pixels.ahead[3],0,'The track must not continue ahead of the compensated boat');
  assert.equal(pixels.original[3],0,'The track must not extend to the original position');
  assert.ok(Math.abs(pixels.to-fixture.sourceTime)<1e-6);assert.ok(Math.abs(pixels.fromClock-(fixture.time-7200))<1e-6);assert.equal(pixels.solid,true);
  // Existing name interaction and the visible boat list use the same marker.
  await marker.focus();await page.keyboard.press('Enter');assert.equal(await marker.locator('.boat-name').count(),0);
  await marker.focus();await page.keyboard.press('Enter');assert.equal(await marker.locator('.boat-name').textContent(),'My');
  assert.deepEqual(await page.evaluate(()=>visibleBoatEntries.map(entry=>entry.boat.name)),['My']);
  const pinPoint=await page.evaluate(fixture=>{
   const boat=boats.find(boat=>boat.id===fixture.id),time=fixture.sourceTime-60;
   const point=new DOMPoint(...xy(trackSpeedSample(boat,time).point)).matrixTransform($('map').getScreenCTM());
   return {x:point.x,y:point.y,time};
  },fixture);
  await page.mouse.click(pinPoint.x,pinPoint.y);await page.locator('[data-speed-action="pin"]').click();
  assert.equal(await page.locator('[data-pinned="true"]').count(),1);assert.match(await page.locator('.track-speed-label').textContent(),/ kn$/);
  await page.evaluate(()=>{speedPins=[];pickedTrackSpeed=null;renderSpeedPins();});
  await page.locator('#mapTracksToggle').click();await page.locator('#referenceBoat').selectOption(fixture.id);
  await choice.uncheck();assert.equal(await page.locator('#trackStyle').isDisabled(),false);assert.equal(await page.locator('#trackStyle').inputValue(),'time');
  await page.locator('#mapTracksToggle').click();
  await page.waitForFunction(()=>!$('boatMarkers').querySelector('[data-handicap-compensated]'));
  const original=await marker.evaluate(group=>[+group.dataset.screenX,+group.dataset.screenY]);
  assert.ok(Math.abs(original[0]-fixture.original[0])<1e-6&&Math.abs(original[1]-fixture.original[1])<1e-6);
  await page.locator('#mapTracksToggle').click();await choice.check();await page.locator('#mapTracksToggle').click();
  await page.evaluate(()=>{for(const name of ['Mercutio','Vera','My','THE HULK'])chosen.add(name);render();});
  await page.locator('#startPresentation').click();
  await page.screenshot({path:'/tmp/sr2026-handicap-mode.png'});
  assert.equal(await page.locator('#boatMarkers .boat-marker').count(),4);
  assert.equal(await marker.evaluate(group=>getComputedStyle(group).opacity),'1');
  await page.locator('#endPresentation').click();
  const finish=await page.evaluate(()=>{
   const beyond=boats.find(boat=>!ghostClocks.get(boat.id).error&&ghostClocks.get(boat.id).end>D.end);
   if(!beyond)throw Error('Expected a compensated finish after the complete source-data window');
   chosen.add(beyond.name);
   view=[230,250,620,760];setview();updateTimeline({preserveTime:true});
   const selected=boats.filter(boatIsDisplayed).map(boat=>({boat,clock:ghostClocks.get(boat.id)})).sort((a,b)=>a.clock.end-b.clock.end);
   const winner=selected[0],last=selected.at(-1);setCurrentTime(last.clock.end+1,{fractional:true});render();
   return {winner:winner.boat.id,winnerTime:winner.clock.end,last:last.boat.id,lastTime:last.clock.end,time:currentTime(),dataEnd:D.end,rangesEnd:visibleTimeRanges.at(-1).end};
  });
  assert.ok(finish.lastTime>finish.dataEnd&&finish.time>finish.lastTime&&finish.rangesEnd>=finish.lastTime);
  assert.equal(await page.locator('[data-boat-marker="'+finish.last+'"]').getAttribute('data-handicap-finished'),'true');
  const fullTrack=await page.evaluate(id=>{
   const boat=boats.find(boat=>boat.id===id),clock=ghostClocks.get(id),previousLength=trackLengthSeconds;
   trackLengthSeconds=0;const window=displayTrackWindow(boat,currentTime());trackLengthSeconds=previousLength;
   return {from:window.from,to:window.to,start:clock.sourceStart,finish:clock.sourceEnd};
  },finish.last);
  assert.equal(fullTrack.from,fullTrack.start);assert.equal(fullTrack.to,fullTrack.finish);
  await page.locator('#note').fill('Handicapkompenserede både i mål');await page.locator('#save').click();
  assert.ok(await page.evaluate(()=>timelineNotes().some(note=>note.time>D.end)));
  await page.evaluate(()=>beginNoteEditing(notes[0]));assert.equal(await page.locator('#noteTime').evaluate(input=>input.validity.rangeOverflow),false);
  await page.locator('#save').click();assert.equal(await page.evaluate(()=>editingNote),null);
  const prepared=await page.evaluate(()=>({same:handicapTestClock===ghostClocks.get(boats.find(boat=>boat.name==='My').id),index:handicapTestIndex===handicapTestClock.timelineIndex,
   initial:handicapTestInitial,current:{uploads:webglTracks.uploads,bytes:[...webglTracks.buffers.values()].reduce((sum,record)=>sum+record.bytes,0),buffers:webglTracks.buffers.size}}));
  assert.equal(prepared.same,true);assert.equal(prepared.index,true);assert.deepEqual(prepared.current,prepared.initial);
  await page.reload();await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.locator('#mapTracksToggle').click();assert.equal(await choice.isChecked(),true);
  assert.equal(await page.locator('#trackStyle').isDisabled(),true);assert.equal(await page.locator('#trackStyle').inputValue(),'boat');
  const unavailable=await page.evaluate(()=>{
   const boat=boats.find(boat=>ghostClocks.get(boat.id).error);chosen.add(boat.name);render();return {name:boat.name,id:boat.id};
  });
  assert.match(await page.locator('#ghostStatus').textContent(),/Registreret måltid mangler/);
  assert.ok((await page.locator('#ghostStatus').textContent()).includes(unavailable.name));
  assert.equal(await page.locator('[data-boat-marker="'+unavailable.id+'"]').count(),0,'No fallback to an original boat in compensated mode');
  await page.evaluate(()=>{
   window.originalHandicapStorage=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){if(key===HANDICAP_TRACKS_KEY)throw Error('quota');return originalHandicapStorage.call(this,key,value);};
  });
  await choice.click();assert.equal(await choice.isChecked(),true);assert.match(await page.locator('#ghostStatus').textContent(),/kunne ikke gemmes/);
  await page.evaluate(()=>Storage.prototype.setItem=originalHandicapStorage);await choice.uncheck();
  await page.reload();await page.waitForSelector('main:not([inert])',{timeout:120000});assert.equal(await page.evaluate(()=>handicapTracksEnabled),false);
  assert.deepEqual(errors,[]);
  console.log('Firefox PC: one opaque compensated marker, solid boat colours, rendered track ends/tails and pins follow corrected time, normal name/list interactions, restored original mode, fixed buffers/clocks, finish playback, events, persistence and explicit errors.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
