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
   boats.splice(0,boats.length,boat('slow','Vera',55.61,90),boat('fast','Mercutio',55.6),
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
  const resultRows=()=>page.evaluate(()=>{flushRender();return [...document.querySelectorAll('.gate-result')].map(node=>({id:node.dataset.boatId,seconds:+node.dataset.elapsedSeconds,cells:[...node.querySelectorAll('text')].map(cell=>cell.textContent)}));});
  const times=await resultRows();
  assert.deepEqual(times.map(t=>t.id),['fast','slow'],'Rank by elapsed time, independent of fleet order; exclude finite misses and wrong gate order');
  assert.deepEqual(times.map(t=>t.cells.slice(0,2)),[['1','Mercutio'],['2','Vera']]);
  assert.equal(await page.locator('.gate-results').count(),1,'One result list at gate 2');
  assert.equal(await page.locator('#boatMarkers .boat-gate-time').count(),0,'No times attached to boat markers');
  for(const timing of times){
   const expected=(points[2][0]-points[0][0])/.01*(timing.id==='fast'?60:90);
   assert.ok(Math.abs(timing.seconds-expected)<1e-4,`${timing.id}: ${timing.seconds} ~= ${expected}`);
   assert.match(timing.cells[2],/\d\d:\d\d,\d/);
  }
  const placement=()=>page.evaluate(()=>{
   const list=document.querySelector('.gate-results-background').getBoundingClientRect(),gate=currentGateMeasurement().slice(2).map(p=>new DOMPoint(...xy(p)).matrixTransform(mapViewport().matrix));
   return {gap:list.left-gate[0].x,width:list.width,height:list.height,gate,rect:{left:list.left,right:list.right,top:list.top,bottom:list.bottom}};
  });
  const placed=await placement();assert.ok(placed.gap>=23&&placed.gap<=25,'List lies beyond the second gate');
  await page.locator('#save').click();assert.deepEqual((await stored())[0].gates,points);
  assert.deepEqual((await stored())[0].custom,{keep:true});
  // Drawing a ruler alongside gates preserves the two independent event tools.
  await page.evaluate(()=>{setMeasurement([[12,55.6],[12.01,55.6]]);renderNavigation();});
  await page.locator('#save').click();assert.equal((await stored())[0].measurement.length,2);
  await page.locator('#mapGatesToggle').click();assert.deepEqual(await gates(),[]);
  assert.equal(await page.locator('.gate-result').count(),0);
  await page.locator('#cancelEdit').click();assert.deepEqual(await gates(),points,'Cancel restores gates');
  // Boat/style/camera changes must use prepared crossings, even for an unselected boat.
  await page.evaluate(()=>{
   setPresentationMode(true);
   gateCurveCrossings=()=>{throw Error('Crossings must not be recomputed during interaction');};
   chosen.clear();chosen.add('Mercutio');boatFavouritesOnly=true;render();
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.deepEqual((await resultRows()).map(row=>row.id),['fast'],'The list follows boat selection');
  await page.evaluate(()=>{
   chosen.add('Vera');render();comparison={enabled:false,basis:'absolute',boatColour:true};render();
   // Fixed ranking is already sorted; interaction must not sort it again.
   const prepared=preparedGateTiming(currentGateMeasurement());prepared.ranking.sort=()=>{throw Error('Ranking sorted during interaction');};
  });
  const beforeZoom=await placement();
  await page.evaluate(()=>{
   changeMapView([view[0],view[1],view[2]*.95,view[3]*.95]);flushRender();
  });
  assert.deepEqual((await resultRows()).map(row=>row.id),['fast','slow']);
  const zoomed=await placement();assert.ok(Math.abs(zoomed.width-beforeZoom.width)<.1&&Math.abs(zoomed.height-beforeZoom.height)<.1,'Zoom preserves list size within Firefox subpixel rounding: '+JSON.stringify({beforeZoom,zoomed}));
  assert.ok(Math.abs(zoomed.gap-24)<1,'Zoom keeps the list outside the gate');
  // Reversing the sailing direction places the list on the other side of gate 2.
  await page.evaluate(()=>{
   const reversed=[...currentGateMeasurement().slice(2),...currentGateMeasurement().slice(0,2)];
   // Keep the prepared source results while probing annotation placement only.
   const layer=$('mapNavigation');layer.replaceChildren();drawGateResults(layer,reversed,preparedGateTiming(currentGateMeasurement()).ranking.slice(0,2));resizeSymbols(layer);
  });
  const otherSide=await page.evaluate(()=>{
   const rect=document.querySelector('.gate-results-background').getBoundingClientRect(),gate=new DOMPoint(...xy(currentGateMeasurement()[0])).matrixTransform(mapViewport().matrix);return gate.x-rect.right;
  });
  assert.ok(Math.abs(otherSide-24)<1,'The list stays outside gate 2 when sailing west');
  await page.evaluate(()=>{lastNavigationKey=null;renderNavigation();});
  if(process.env.SR_GATE_SCREENSHOT)await page.screenshot({path:process.env.SR_GATE_SCREENSHOT});
  await page.evaluate(()=>restoreNote(notes[1]));assert.deepEqual(await gates(),[]);assert.equal(await page.locator('.gate-result').count(),0);
  await page.evaluate(points=>{notes[2].gates=points;restoreNote(notes[2]);},points);assert.deepEqual(await gates(),points,'Same-time events have independent gates');
  await page.evaluate(()=>restoreNote(notes[0]));assert.deepEqual(await gates(),points);
  // First play from an event must carry both saved and temporary gates.
  const playOneSecond=async()=>{
   await page.locator('#play').click();
   assert.equal(await page.evaluate(()=>interval!==null),true,'Play starts');
   await page.evaluate(()=>{advancePlayback(playbackTickTime+1000/playbackRate);stopPlayback();flushRender();});
   assert.deepEqual(await gates(),points,'Gates survive playback and pause after leaving the exact event timestamp');
  };
  await playOneSecond();await playOneSecond();
  await page.evaluate(()=>{
   startPlayback();advancePlayback(playbackTickTime+(notes[1].time-currentTime()+.1)*1000/playbackRate);stopPlayback();render();
  });
  assert.deepEqual(await gates(),[],'Crossing the next event removes the previous gates');
  await page.evaluate(points=>{
   notes.push({...notes[1],time:notes[1].time+10,text:'Next gates',gates:points});
   startPlayback();advancePlayback(playbackTickTime+(notes.at(-1).time-currentTime()+.1)*1000/playbackRate);stopPlayback();render();
  },points);
  assert.deepEqual(await gates(),points,'Crossing an event between ticks activates its gates');
  await playOneSecond();
  await page.evaluate(()=>notes.pop());
  const beforeTemporary=await stored();
  for(const atEvent of [true,false]){
   await page.evaluate(({points,atEvent})=>{
    restoreNote(notes[0]);
    if(!atEvent)setCurrentTime(notes[0].time+1,{allowOutsideVisibleRanges:true});
    setGateMeasurement(points);render();
   },{points,atEvent});
   await playOneSecond();
   await page.evaluate(()=>{
    startPlayback();advancePlayback(playbackTickTime+(notes[1].time-currentTime()+.1)*1000/playbackRate);stopPlayback();render();
   });
   assert.deepEqual(await gates(),points,'Play across an event keeps temporary gates, whether drawn on or between events');
   await playOneSecond();
   await page.evaluate(()=>{setCurrentTime(notes[1].time+2,{allowOutsideVisibleRanges:true});render();});
   assert.deepEqual(await gates(),points,'Seeking between events keeps temporary gates');
   await page.evaluate(()=>{setCurrentTime(notes[1].time,{allowOutsideVisibleRanges:true});render();});
   assert.deepEqual(await gates(),[],'Seeking to an event clears temporary gates');
  }
  assert.deepEqual(await stored(),beforeTemporary,'Temporary gates never edit saved events');
  await page.evaluate(()=>restoreNote(notes[0]));
  await page.evaluate(()=>{
   startPlayback({target:notes[1]});advancePlayback(playbackTickTime+1000/playbackRate);stopPlayback();render();
  });
  assert.deepEqual(await gates(),points,'Play to the next event also keeps gates along the way');
  await page.evaluate(()=>{
   startPlayback({target:notes[1]});advancePlayback(playbackTickTime+(notes[1].time-currentTime())*1000/playbackRate);flushRender();
  });
  assert.deepEqual(await gates(),[],'Arriving at the next event releases gates');
  await page.evaluate(()=>restoreNote(notes[0]));
  await page.evaluate(()=>{setPresentationMode(true);setCurrentTime(notes[0].time+1,{allowOutsideVisibleRanges:true});render();});
  assert.deepEqual(await gates(),[]);assert.equal(await page.locator('.gate-result').count(),0,'Moving on removes event times as well as gates');
  await page.evaluate(()=>restoreNote(notes[0]));assert.deepEqual(await gates(),points);
  await page.locator('#mapGatesToggle').click();assert.deepEqual(await gates(),[]);
  assert.deepEqual((await stored())[0].gates,points,'Presentation changes are temporary');
  await page.evaluate(()=>{restoreNote(notes[0]);setPresentationMode(false);});
  await page.locator('#mapGatesToggle').click();await page.locator('#save').click();assert.deepEqual((await stored())[0].gates,[]);
  await page.evaluate(points=>{setCurrentTime(notes[0].time+2,{allowOutsideVisibleRanges:true});render();setGateMeasurement(points);flushRender();},points);
  await page.locator('#note').fill('New gates event');await page.locator('#save').click();
  assert.deepEqual((await stored()).find(n=>n.text==='New gates event').gates,points);
  assert.deepEqual(await page.evaluate(()=>gateMeasurement),[],'New event consumes standalone gates');
  await page.evaluate(points=>{setPresentationMode(true);setCurrentTime(D.start+3600+1600,{allowOutsideVisibleRanges:true});setGateMeasurement(points);render();},points);
  assert.equal(await page.locator('#boatMarkers .boat-marker').count(),0,'Current positions have expired');
  assert.deepEqual((await resultRows()).map(row=>row.id),['fast','slow'],'Completed results remain after the boat markers disappear');
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
  await publicPage.locator('#play').click();
  await publicPage.evaluate(()=>{advancePlayback(playbackTickTime+1000/playbackRate);stopPlayback();flushRender();});
  assert.deepEqual(await publicPage.evaluate(()=>currentGateMeasurement()),points,'First play after a fresh public load preserves gates');
  await publicPage.close();assert.deepEqual(errors,[]);
  console.log('Firefox PC: live gates, ranked result list outside gate 2 in both directions, constant size/gap on zoom, selection without recomputation or sorting, completed boats retained, event Save/Cancel/departure/return, export and public preparation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
