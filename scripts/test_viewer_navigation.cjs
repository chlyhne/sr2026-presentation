const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
const near=(actual,expected,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≈ ${expected}`);
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
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
   const map=$('map').getBoundingClientRect(),measure=$('mapMeasureToggle').getBoundingClientRect(),layers=$('mapLayersToggle').getBoundingClientRect();
   return {gap:layers.left-measure.right,top:layers.top-map.top,right:map.right-$('mapTools').getBoundingClientRect().right,aligned:measure.top===layers.top};
  });
  assert.ok(alignment.aligned);near(alignment.gap,6,1);near(alignment.top,12,1);near(alignment.right,12,1);
  await page.setViewportSize({width:1200,height:900});
  const compact=await page.evaluate(()=>{
   const tools=$('mapTools').getBoundingClientRect(),legend=$('trackSpeedLegend').getBoundingClientRect();
   return {overlap:tools.left<legend.right&&tools.right>legend.left&&tools.top<legend.bottom&&tools.bottom>legend.top,
    aligned:$('mapMeasureToggle').getBoundingClientRect().top===$('mapLayersToggle').getBoundingClientRect().top};
  });
  assert.equal(compact.overlap,false);assert.equal(compact.aligned,true);
  await page.setViewportSize({width:1500,height:1000});
  assert.equal(await page.locator('#drawRhumbline,#clearRhumbline,#reverseRhumbline').count(),0,'The presentation cannot define the permanent route');
  const geographicClick=async coordinate=>{
   const p=await page.evaluate(coordinate=>{
    const [x,y]=xy(coordinate),p=new DOMPoint(x,y).matrixTransform($('map').getScreenCTM());return {x:p.x,y:p.y};
   },coordinate);
   await page.mouse.click(p.x,p.y);
  };
  await page.locator('#mapMeasureToggle').click();
  await geographicClick([12,55.5]);await geographicClick([12,55.5+1/60]);
  // A mouse click is quantized to screen pixels at this overview zoom.
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
    trackProfileCache.set(boat.points,{samples:prepareProjectedTrack(boat),stations:prepareReferenceProfile(boat)});
    webglTracks.prepare(boat);
   }
   webglTracks.prepareComparison();
   for(const boat of boats){colours[boat.name]=boat.id==='rival'?'#ff4dac':'#ffdc42';shownBoatNames.add(boat.id);}
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
  const timeMath=await page.evaluate(()=>({
   slow:timeGainPer100ReferenceMeters(3,4),fast:timeGainPer100ReferenceMeters(13,14),
   gain:timeGainPer100ReferenceMeters(4,3),equal:timeGainPer100ReferenceMeters(6,6),
   stopped:timeGainPer100ReferenceMeters(0,5),backwards:timeGainPer100ReferenceMeters(-5,5),
   missing:[[4,0],[0,0],[4,-1],[NaN,4],[Infinity,4],[4,Infinity],[4,NaN]].map(([speed,reference])=>timeGainPer100ReferenceMeters(speed,reference))
  }));
  near(timeMath.slow,-360000/1852/16);near(timeMath.fast,-360000/1852/196);
  near(timeMath.gain,360000/1852/9);near(timeMath.equal,0);
  near(timeMath.stopped,-360000/1852/5);near(timeMath.backwards,2*timeMath.stopped);
  assert.ok(Math.abs(timeMath.slow)>12*Math.abs(timeMath.fast));
  assert.deepEqual(timeMath.missing,Array(7).fill(null));
  const projectionChecks=await page.evaluate(()=>{
   const time=boats[1].points[4][2],northbound={...boats[1],points:[[12.04,55.59,time-60],[12.04,55.61,time+60]],speeds:[6,6]};
   const noPassage={...boats[1],points:[[12.085,55.6,time],[12.086,55.6,time+60]],speeds:[6,6]};
   const result={crosswind:trackGainSample(northbound,time),noPassage:trackGainSample(noPassage,time),
    nextLeg:projectOnRhumbRoute([12.11,55.05],buildRhumbRoute([[12,55],[12.1,55],[12.1,55.1]]))};
   chosen.delete('Mercutio');result.hiddenReference=trackGainSample(boats[1],time);chosen.add('Mercutio');return result;
  });
  near(projectionChecks.crosswind.vmg,0);near(projectionChecks.crosswind.gain,-6,.06);
  assert.equal(projectionChecks.noPassage,null);assert.equal(projectionChecks.nextLeg.leg,1);
  near(projectionChecks.nextLeg.bearing,0);near(projectionChecks.hiddenReference.gain,0,.06);
  const grid=await page.evaluate(()=>{
   const stations=new Uint16Array(referenceStationCount()).fill(REFERENCE_MISSING);
   stations[0]=0;stations[1]=1022;
   return {bytes:stations.byteLength,count:stations.length,
    values:[0,10/1852,20/1852].map(progress=>referenceAtProgress(progress,stations)?.vmg??null)};
  });
  assert.equal(grid.bytes,grid.count*2);assert.deepEqual(grid.values,[0,25,null],'Decoded 10-bit station codes, including zero and missing');
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
  for(const sample of timeMode)near(sample.gain,360000/1852*(sample.vmg-sample.referenceVmg)/(sample.referenceVmg**2));
  assert.match(await page.locator('#trackSpeedLegend').getAttribute('aria-label'),/sekunder pr\. 100 meter/);
  assert.match(await page.locator('#trackSpeedLegend').textContent(),/−120.*\+120/);
  const timePixels=await pixels();
  assert.ok(timePixels.fast[2]>timePixels.fast[0],JSON.stringify(timePixels));
  assert.ok(timePixels.slow[0]>timePixels.slow[2],JSON.stringify(timePixels));
  assert.deepEqual(timePixels.reference,coloured.reference,'Time comparison uses the same faint reference');
  const nonForward=await page.evaluate(()=>{
   const reference=boats[0],initialLength=boats.length,time=reference.points[0][2];
   const fixtures=[
    {...reference,id:'reverse',name:'Reverse test',points:reference.points.map((p,i)=>[12.08-i*.01,55.610,p[2]]),speeds:Array(9).fill(6)},
    {...reference,id:'stopped',name:'Stopped test',points:reference.points.map(p=>[12.04,55.612,p[2]]),speeds:Array(9).fill(0)},
    {...reference,id:'turn',name:'Turn test',points:reference.points.map((p,i)=>[12+Math.min(i,8-i)*.01,55.614,p[2]]),speeds:[6,6,6,6,0,6,6,6,6]},
    {...reference,id:'no-speed',name:'No speed test',points:reference.points.map(p=>[p[0],55.616,p[2]]),speeds:Array(9).fill(null)}
   ];
   for(const boat of fixtures){
    colours[boat.name]='#ffdc42';boats.push(boat);chosen.add(boat.name);
    trackProfileCache.set(boat.points,{samples:prepareProjectedTrack(boat),stations:prepareReferenceProfile(boat)});webglTracks.prepare(boat);
   }
   webglTracks.comparisonReference=null;webglTracks.prepareComparison();render();
   const gl=webglTracks.gl;
   function sample(boat,index){
    const sourceTime=boat.points[index][2],pin=trackPinValue(boat,trackSpeedSample(boat,sourceTime));
    const point=new DOMPoint(...xy(boat.points[index])).matrixTransform($('map').getScreenCTM()),rect=$('map').getBoundingClientRect(),pixel=new Uint8Array(4);
    gl.readPixels(Math.floor((point.x-rect.left)/rect.width*gl.drawingBufferWidth),Math.floor((rect.bottom-point.y)/rect.height*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    return {value:pin.value,label:pin.label,pixel:[...pixel]};
   }
   const result={reverse:sample(fixtures[0],4),stopped:sample(fixtures[1],4),turn:[3,4,5].map(index=>sample(fixtures[2],index)),missing:sample(fixtures[3],4)};
   const reverseSample=projectedTrackSample(fixtures[0],time+240),station=referenceAtProgress(reverseSample.progress);
   result.expected={reverse:timeGainPer100ReferenceMeters(quantizeProjectedSpeed(-6),station.vmg),stopped:timeGainPer100ReferenceMeters(0,station.vmg)};
   boats.splice(initialLength);for(const boat of fixtures)chosen.delete(boat.name);render();
   return result;
  });
  for(const key of ['reverse','stopped']){
   near(nonForward[key].value,nonForward.expected[key],.001);
   assert.ok(nonForward[key].pixel[0]>nonForward[key].pixel[2]+20,JSON.stringify(nonForward[key]));
   assert.equal(nonForward[key].pixel[3],255);
   assert.match(nonForward[key].label,/^-.*s\/100 m ref\.$/);
  }
  assert.ok(nonForward.reverse.value<nonForward.stopped.value,'Reverse progress loses more time than standing still');
  assert.ok(nonForward.turn.every(sample=>Number.isFinite(sample.value)),'GPU values remain valid through a turnaround at zero VMG');
  assert.equal(nonForward.missing.value,null);assert.equal(nonForward.missing.label,'Sammenligning mangler');
  assert.deepEqual(nonForward.missing.pixel,[138,148,155,255],'Genuinely missing SOG stays grey');
  const saturatedBlue=await page.evaluate(()=>({colour:trackGainColour(120,120),stop:$('trackSpeedLegend').querySelector('stop:last-child').getAttribute('stop-color'),loss:$('trackSpeedLegend').querySelector('stop').getAttribute('stop-color')}));
  assert.equal(saturatedBlue.colour,'rgb(0,60,255)');assert.equal(saturatedBlue.loss,'rgb(215,25,28)');assert.equal(saturatedBlue.stop,saturatedBlue.colour,'Legend uses the saturated blue from the track palette');
  const overlap=await page.evaluate(()=>{
   const laterReference={...boats[0],points:boats[0].points.map(p=>[p[0],55.602,p[2]+1200])};
   trackProfileCache.set(laterReference.points,{samples:prepareProjectedTrack(laterReference),stations:prepareReferenceProfile(laterReference)});
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
  await page.screenshot({path:'/tmp/sr2026-reference-track-firefox.png'});
  const hoverPoint=await page.evaluate(()=>{
   const point=new DOMPoint(...xy([12.005,55.602])).matrixTransform($('map').getScreenCTM());return {x:point.x,y:point.y};
  });
  await page.mouse.move(hoverPoint.x,hoverPoint.y);
  await page.waitForFunction(()=>document.querySelector('#trackHover')?.textContent.includes('s/100 m ref.'));
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
   window.navigationMissingChecks={outside:trackGainSample(missing,selectedTime),
    gap:projectedTrackSample({...boats[1],points:[[12,55.6,0],[12.01,55.6,600]],speeds:[6,6]},300),
    missingSog:projectedTrackSample({...boats[1],speeds:Array(9).fill(null)},boats[1].points[4][2])};
  });
  assert.deepEqual(await page.evaluate(()=>navigationMissingChecks),{outside:null,gap:null,missingSog:null});
  await page.evaluate(()=>{
   const boat={...boats[0],id:'missing-speed',name:'Missing speed',
    points:boats[0].points.map(point=>[point[0],55.608,point[2]]),speeds:Array(9).fill(null)};
   colours[boat.name]='#6cffff';boats.push(boat);chosen.add(boat.name);
   trackProfileCache.set(boat.points,{samples:prepareProjectedTrack(boat),stations:prepareReferenceProfile(boat)});
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
  await page.screenshot({path:'/tmp/sr2026-navigation-comparison.png'});
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
  console.log(JSON.stringify({browser:'firefox',checks:'permanent route asset, rhumb geometry and measurement, same-place speed independent of passage time, red/blue WebGL pixels, faint reference in its own colour, ToD, seconds per 100 metres, zero/reverse speeds, hover units, no mode recomputation, missing data, immutable geometry, persistence, presentation/fullscreen',numeric,timeMath,coloured,timePixels,errors}));
  await page.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
