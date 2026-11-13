const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
const near=(actual,expected,tolerance=.005)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≈ ${expected}`);
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  await require('./viewer-track-fixtures.cjs')(page);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>{
   const points=[[11.99,55.6],[12.09,55.6]],route=buildRhumbRoute(points);
   rhumbRoute.legs=route.legs;rhumbRoute.total=route.total;
   window.SR_RHUMBLINE={version:1,points};
  });
  assert.equal(await page.evaluate(()=>boats.every(b=>b.handicapSecondsPerNm>0)),true);
  const alignment=await page.evaluate(()=>{
   const map=$('map').getBoundingClientRect(),buttons=['mapMeasureToggle','mapGatesToggle','mapTracksToggle','mapLayersToggle'].map(id=>$(id).getBoundingClientRect()),layers=buttons.at(-1);
   return {gaps:buttons.slice(1).map((button,i)=>button.left-buttons[i].right),top:layers.top-map.top,right:map.right-$('mapTools').getBoundingClientRect().right,aligned:buttons.every(button=>button.top===layers.top)};
  });
  assert.ok(alignment.aligned);alignment.gaps.forEach(gap=>near(gap,6,1));near(alignment.top,12,1);near(alignment.right,12,1);
  await page.setViewportSize({width:1200,height:900});
  const compact=await page.evaluate(()=>{
   const tools=$('mapTools').getBoundingClientRect(),legend=$('trackSpeedLegend').getBoundingClientRect();
   return {overlap:tools.left<legend.right&&tools.right>legend.left&&tools.top<legend.bottom&&tools.bottom>legend.top,
    aligned:$('mapMeasureToggle').getBoundingClientRect().top===$('mapLayersToggle').getBoundingClientRect().top};
  });
  assert.equal(compact.overlap,false);assert.equal(compact.aligned,true);
  await page.setViewportSize({width:1500,height:1000});
  assert.equal(await page.locator('#drawRhumbline,#clearRhumbline,#reverseRhumbline').count(),0,'The presentation cannot define the permanent route');
  const geographicDrag=async (start,end)=>{
   const points=await page.evaluate(coordinates=>coordinates.map(coordinate=>{
    const [x,y]=xy(coordinate),p=new DOMPoint(x,y).matrixTransform(mapViewport().matrix);return {x:p.x,y:p.y};
   }),[start,end]);
   await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();
   await page.mouse.move(points[1].x,points[1].y,{steps:5});await page.mouse.up();
  };
  await page.locator('#mapMeasureToggle').click();
  await geographicDrag([12,55.5],[12,55.5+1/60]);
  // Pointer coordinates are quantized to screen pixels at this overview zoom.
  near(await page.evaluate(()=>buildRhumbRoute(measurement).total),1.00067567,.15);
  assert.equal(await page.evaluate(()=>navigationMode),null);
  assert.match(await page.locator('#mapNavigation').textContent(),/Måling/);
  await page.locator('#mapMeasureToggle').click();
  assert.equal(await page.locator('#mapNavigation').textContent(),'');
  assert.deepEqual(await page.evaluate(()=>SR_RHUMBLINE.points),[[11.99,55.6],[12.09,55.6]]);
  // All boats pass the same positions at different times; cross-track offsets
  // must not change the comparison, and Mercutio need not be selected.
  await page.evaluate(()=>{
   stopPlayback();$('wind').checked=$('rain').checked=$('traffic').checked=$('military').checked=false;
   const time=D.start+3600,metadata=boatMetadata('Mercutio');
   function boat(id,name,offset,latitude,speeds,handicap=580.6){return {id,name,metadata,handicapSecondsPerNm:handicap,
    points:Array.from({length:9},(_,i)=>[12+i*.01,latitude,time+offset+i*60]),speeds};}
   boats.splice(0,boats.length,
    boat('reference','Mercutio',0,55.6,Array.from({length:9},(_,i)=>4+i*.5)),
    boat('rival','Rival',600,55.602,Array(9).fill(6)),
    boat('rated','Hurtig rating',1200,55.604,Array(9).fill(6),500),
    boat('later','Senere passage',1800,55.606,Array(9).fill(6)));
   referenceBoatId='reference';
   for(const boat of boats){
    prepareTrackFixture(boat);
    webglTracks.prepare(boat);
   }
   webglTracks.prepareComparison();
   for(const boat of boats){colours[boat.name]=boat.id==='rival'?'#ff4dac':'#ffdc42';}
   chosen.clear();chosen.add('Mercutio');chosen.add('Rival');chosen.add('Hurtig rating');
   selectedTime=time+1680;
   const [x,y]=xy([12.04,55.6]);view=[x-18,y-15,36,30];$('map').setAttribute('viewBox',view.join(' '));
   saveComparison({basis:'absolute',enabled:true});
   prepareSelectedTracks();updateTimeline();selectedTime=time+1680;render();
  });
  const numeric=await page.evaluate(()=>{
   const rival=boats[1],time=boats[0].points[0][2];
   const at=i=>trackGainSample(rival,rival.points[i][2]);
   return {early:at(0),middle:at(4),late:at(8),shifted:trackGainSample(boats[3],boats[3].points[4][2]),
    handicap:correctedProjectedSpeed(6,500,580.6),sameRating:correctedProjectedSpeed(6,580.6,580.6),
    north:rhumbLeg([12,55],[12,55+1/60]),east:rhumbLeg([12,55],[12.1,55]),
    projection:projectOnRhumbRoute([12.04,55.7]),missingRating:correctedProjectedSpeed(6,null,580.6)};
  });
  near(numeric.early.gain,2,.06);near(numeric.middle.gain,0,.06);near(numeric.late.gain,-2,.06);
  near(numeric.middle.referenceTime,await page.evaluate(()=>boats[0].points[4][2]),.1);
  near(numeric.shifted.gain,numeric.middle.gain);near(numeric.sameRating,6);
  near(numeric.handicap,6/(1+80.6*6/3600));assert.equal(numeric.missingRating,null);
  near(numeric.north.bearing,0);near(numeric.east.bearing,90);
  near(numeric.north.distance,1.00067567,.00001);
  const projectionChecks=await page.evaluate(()=>{
   const time=boats[1].points[4][2],northbound={...boats[1],points:[[12.04,55.59,time-60],[12.04,55.61,time+60]],speeds:[6,6]};
   const noPassage={...boats[1],points:[[12.085,55.6,time],[12.086,55.6,time+60]],speeds:[6,6]};
   const result={crosswind:trackGainSample(prepareTrackFixture(northbound),time),noPassage:trackGainSample(prepareTrackFixture(noPassage),time),
    nextLeg:projectOnRhumbRoute([12.11,55.05],buildRhumbRoute([[12,55],[12.1,55],[12.1,55.1]]))};
   chosen.delete('Mercutio');result.hiddenReference=trackGainSample(boats[1],time);chosen.add('Mercutio');return result;
  });
  near(projectionChecks.crosswind.vmg,0);near(projectionChecks.crosswind.gain,-6,.06);
  assert.equal(projectionChecks.noPassage,null);assert.equal(projectionChecks.nextLeg.leg,1);
  near(projectionChecks.nextLeg.bearing,0);near(projectionChecks.hiddenReference.gain,0,.06);
  // Read actual WebGL pixels, so the sign and Mercutio exception are tested
  // through the nominal renderer rather than only through a colour helper.
  async function pixels(){return page.evaluate(()=>{
   webglTracks.render(currentTime(),boats.filter(boatIsDisplayed),true);
   const gl=webglTracks.gl,matrix=$('map').getScreenCTM(),rect=$('map').getBoundingClientRect();
   function pixel(lon,lat){
    const [x,y]=xy([lon,lat]),screenPoint=new DOMPoint(x,y).matrixTransform(matrix);
    const px=Math.floor((screenPoint.x-rect.left)/rect.width*gl.drawingBufferWidth),py=Math.floor((rect.bottom-screenPoint.y)/rect.height*gl.drawingBufferHeight);
    const rgba=new Uint8Array(4);gl.readPixels(px,py,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return [...rgba];
   }
   return {fast:pixel(12.005,55.602),slow:pixel(12.075,55.602),reference:pixel(12.035,55.6),missing:pixel(12.035,55.608)};
  });}
  const coloured=await pixels();
  assert.ok(coloured.fast[2]>coloured.fast[0]+80,JSON.stringify(coloured));
  assert.ok(coloured.slow[0]>coloured.slow[2]+80,JSON.stringify(coloured));
  await page.locator('#mapTracksToggle').click();
  await page.locator('#trackStyle').selectOption('speed');
  const original=await pixels();assert.deepEqual(coloured.reference,[46,40,12,46],'Reference uses its own premultiplied boat colour at 18% opacity');
  assert.notDeepEqual(coloured.reference,original.reference,'Ordinary SOG view keeps its original colours and opacity');
  await page.evaluate(()=>{referenceBoatId='rival';comparisonRevision++;webglTracks.prepareComparison();});
  await page.locator('#trackStyle').selectOption('absolute');
  const switched=await pixels();
  assert.deepEqual(switched.fast,[46,14,31,46],'New reference uses its own faint boat colour');
  assert.deepEqual(switched.slow,switched.fast,'Reference colour and opacity are constant along its track');
  assert.notDeepEqual(switched.reference,original.reference,'The former reference now uses the comparison palette');
  await page.evaluate(()=>{referenceBoatId='reference';comparisonRevision++;webglTracks.prepareComparison();});
  await page.locator('#trackStyle').selectOption('absolute');
  await page.locator('#trackStyle').selectOption('handicap');
  const rated=await page.evaluate(()=>trackGainSample(boats[2],boats[2].points[4][2]));
  near(rated.gain,numeric.handicap-6,.06);
  assert.match(await page.locator('#trackSpeedLegend').textContent(),/ToD/);
  assert.deepEqual((await pixels()).reference,coloured.reference,'Handicap comparison uses the same faint reference');
  const timeMode=await page.evaluate(()=>{
   const gl=webglTracks.gl,originals=new Map();
   for(const name of ['bufferData','bufferSubData','createBuffer','texSubImage2D','beginTransformFeedback']){
    originals.set(name,gl[name]);gl[name]=()=>{throw Error('Changing track style recomputed or uploaded comparison data');};
   }
   try{
    if(!saveComparison({enabled:true,basis:'time'}))throw Error($('comparisonStatus').textContent);
    render();
    if(!webglTracks.active)throw Error(webglTracks.error);
    return [0,4,8].map(index=>trackGainSample(boats[1],boats[1].points[index][2]));
   }finally{for(const [name,method] of originals)gl[name]=method;}
  });
  for(const sample of timeMode)near(sample.gain,sample.timeGain);
  assert.match(await page.locator('#trackSpeedLegend').getAttribute('aria-label'),/sekunder pr\. 100 meter/);
  assert.match(await page.locator('#trackSpeedLegend').textContent(),/−120.*\+120/);
  const timePixels=await pixels();
  assert.ok(timePixels.fast[2]>timePixels.fast[0],JSON.stringify(timePixels));
  assert.ok(timePixels.slow[0]>timePixels.slow[2],JSON.stringify(timePixels));
  assert.deepEqual(timePixels.reference,coloured.reference,'Time comparison uses the same faint reference');
  const saturatedBlue=await page.evaluate(()=>({colour:trackGainColour(120,120),stop:$('trackSpeedLegend').querySelector('stop:last-child').getAttribute('stop-color'),loss:$('trackSpeedLegend').querySelector('stop').getAttribute('stop-color')}));
  assert.equal(saturatedBlue.colour,'rgb(0,60,255)');assert.equal(saturatedBlue.loss,'rgb(215,25,28)');assert.equal(saturatedBlue.stop,saturatedBlue.colour,'Legend uses the saturated blue from the track palette');
  const overlap=await page.evaluate(()=>{
   const laterReference={...boats[0],points:boats[0].points.map(p=>[p[0],55.602,p[2]+1200])};
   prepareTrackFixture(laterReference);
   webglTracks.prepare(laterReference);
   // Submit the newer reference last: it must still stay below the older rival.
   webglTracks.render(currentTime(),[boats[1],laterReference],true);
   const gl=webglTracks.gl,rect=$('map').getBoundingClientRect(),matrix=$('map').getScreenCTM();
   return [12.005,12.075].map(lon=>{
    const point=new DOMPoint(...xy([lon,55.602])).matrixTransform(matrix),rgba=new Uint8Array(4);
    gl.readPixels(Math.floor((point.x-rect.left)/rect.width*gl.drawingBufferWidth),Math.floor((rect.bottom-point.y)/rect.height*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
    return [...rgba];
   });
  });
  assert.deepEqual(overlap,[timePixels.fast,timePixels.slow],'The faint reference never covers other boats, regardless of passage time or submission order');
  await pixels();
  const hoverPoint=await page.evaluate(()=>{
   const point=new DOMPoint(...xy([12.005,55.602])).matrixTransform($('map').getScreenCTM());return {x:point.x,y:point.y};
  });
  await page.mouse.move(hoverPoint.x,hoverPoint.y);
  await page.waitForFunction(()=>document.querySelector('#trackHover')?.textContent.includes('s/100 m'));
  await page.locator('#trackLength').selectOption('900');
  const short=await pixels();assert.equal(short.reference[3],0);assert.equal(short.fast[3],0);assert.equal(short.slow[3],255);
  const oldReferenceHit=await page.evaluate(()=>{
   const p=new DOMPoint(...xy([12.035,55.6])).matrixTransform($('map').getScreenCTM());
   return nearestTrackSpeed(p.x,p.y,'reference');
  });
  assert.equal(oldReferenceHit,null,'Hidden old tracks cannot be picked');
  await page.locator('#trackLength').selectOption('0');
  const full=await pixels();assert.deepEqual(full.reference,coloured.reference);assert.equal(full.fast[3],255);
  await page.locator('#trackLength').selectOption('7200');
  const uploads=await page.evaluate(()=>webglTracks.uploads);
  await page.evaluate(()=>{selectedTime-=1;render();selectedTime+=1;render();});
  assert.equal(await page.evaluate(()=>webglTracks.uploads),uploads,'Playback retains geometry buffers');
  await page.evaluate(()=>{
   const missing={...boats[1],points:[[12.2,55.6,selectedTime],[12.21,55.6,selectedTime+60]],speeds:[6,6]};
   window.navigationMissingChecks={outside:trackGainSample(prepareTrackFixture(missing),selectedTime),
    gap:trackGainSample(prepareTrackFixture({...boats[1],points:[[12,55.6,0],[12.01,55.6,600]],speeds:[6,6]}),300),
    missingSog:trackGainSample(prepareTrackFixture({...boats[1],points:boats[1].points.map(p=>[...p]),speeds:Array(9).fill(null)}),boats[1].points[4][2])};
  });
  assert.deepEqual(await page.evaluate(()=>navigationMissingChecks),{outside:null,gap:null,missingSog:null});
  await page.evaluate(()=>{
   const boat={...boats[0],id:'missing-speed',name:'Missing speed',
    points:boats[0].points.map(point=>[point[0],55.608,point[2]]),speeds:Array(9).fill(null)};
   colours[boat.name]='#6cffff';boats.push(boat);chosen.add(boat.name);
   prepareTrackFixture(boat);
   webglTracks.prepare(boat);
   window.boatModeOriginals=new Map();
   for(const name of ['bufferData','bufferSubData','createBuffer','texSubImage2D','beginTransformFeedback']){
    boatModeOriginals.set(name,webglTracks.gl[name]);
    webglTracks.gl[name]=()=>{throw Error('Boat colours must not allocate or upload sample data');};
   }
  });
  await page.locator('#trackStyle').selectOption('boat');
  const boatPixels=await pixels();
  assert.deepEqual(boatPixels.reference,[255,220,66,255]);
  assert.deepEqual(boatPixels.fast,[255,77,172,255]);
  assert.deepEqual(boatPixels.slow,boatPixels.fast,'Boat colour is constant along the track');
  assert.deepEqual(boatPixels.missing,[108,255,255,255],'Missing speed does not hide the boat colour');
  assert.equal(await page.locator('#trackSpeedLegend').textContent(),'');
  assert.equal(await page.locator('#trackSpeedLegend').getAttribute('aria-label'),null);
  await page.locator('#trackStyle').selectOption('speed');
  const speedAgain=await pixels();assert.deepEqual(speedAgain.reference,original.reference);
  assert.deepEqual(speedAgain.missing,[138,148,155,255]);
  await page.locator('#trackStyle').selectOption('boat');
  await page.evaluate(()=>{
   for(const [name,method] of boatModeOriginals)webglTracks.gl[name]=method;
   if(!webglTracks.active)throw Error(webglTracks.error);
  });
  await page.locator('#mapMeasureToggle').click();
  // Saved global geometry survives event changes and a page reload.
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem(TRACK_COMPARISON_KEY)));
  await page.reload();await page.waitForSelector('main:not([inert])',{timeout:120000});
  assert.deepEqual(await page.evaluate(()=>comparison),saved);
  assert.equal(await page.locator('#trackStyle').inputValue(),'boat');
  await page.evaluate(()=>setPresentationMode(true));
  await page.locator('#mapMeasureToggle').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),true);
  assert.equal(await page.locator('#mapMeasureToggle').getAttribute('aria-pressed'),'false');
  await page.locator('#presentationFullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);
  assert.equal(await page.locator('#mapMeasureToggle').isVisible(),true);
  await page.locator('#presentationFullscreen').click();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:'firefox',checks:'permanent route asset, rhumb geometry and measurement, same-place speed independent of passage time, red/blue WebGL pixels, faint reference in its own colour, ToD, seconds per 100 metres, hover units, no mode recomputation, missing data, immutable geometry, persistence, presentation/fullscreen',numeric,coloured,timePixels,errors}));
  await page.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
