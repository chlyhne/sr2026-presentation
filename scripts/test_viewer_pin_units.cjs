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
  const target=await page.evaluate(()=>{
   stopPlayback();$('wind').checked=$('rain').checked=false;
   // Independent CPU oracle at the source endpoints, interpolated as on the GPU.
   window.pinExpected=(boat,index)=>{
    const profile=trackProfileCache.get(boat.points),reference=referenceBoat(),referenceProfile=trackProfileCache.get(reference.points);
    const gains=[index,index+1].map(i=>{
     const speed=profile.samples[i*3+2],passage=referenceAtStation(profile.samples[i*3],trackProfileCache.get(reference.points).stations);
     const corrected=correctedProjectedSpeed(speed,boat.handicapSecondsPerNm,reference.handicapSecondsPerNm);
     const station=profile.timeSamples[i*2],valid=speed>=-1e19&&passage;
     return [valid?speed-passage.vmg:null,valid&&corrected!==null?corrected-passage.vmg:null,station<0?null:timeGainPer100Meters(profile.timeSamples[i*2+1],referenceProfile.timeStations[station])];
    });
    return ['absolute','handicap','time'].map((basis,i)=>!gains[0]||!gains[1]||gains[0][i]===null||gains[1][i]===null?null:gains[0][i]+.37*(gains[1][i]-gains[0][i]));
   };
   let target,missing;
   for(const boat of boats){
    if(boat.id===referenceBoatId)continue;
    for(let i=1;i<boat.points.length-1;i++){
     const a=boat.points[i],b=boat.points[i+1];
     if(b[2]<=a[2]||b[2]-a[2]>TRACK_MAX_GAP)continue;
     const time=a[2]+.37*(b[2]-a[2]),sample=trackSpeedSample(boat,time);
     if(sample.speed===null)continue;
     const expected=pinExpected(boat,i);
     if(!target&&expected.every(v=>v!==null)&&Math.abs(expected[0]-expected[1])>.05&&Math.abs(expected[2])>.5&&Math.abs(expected[2])<1e12)target={boatId:boat.id,time,index:i,expected,sog:sample.speed};
     if(!missing&&sample.speed>3&&Math.hypot(b[0]-a[0],b[1]-a[1])>.0002&&expected.every(v=>v===null))missing={boatId:boat.id,time};
     if(target&&missing)break;
    }
    if(target&&missing)break;
   }
   if(!target||!missing)throw Error('Expected valid and missing comparison fixtures');
   window.pinTarget=target;window.pinMissing=missing;
   window.showPinFixture=fixture=>{
    setBoatFavouritesOnly(true);
    const boat=boats.find(b=>b.id===fixture.boatId),sample=trackSpeedSample(boat,fixture.time),[x,y]=xy(sample.point);
    chosen.clear();chosen.add(boat.name);view=[x-4,y-4,8,8];selectedTime=fixture.time+60;
    pickedTrackSpeed={boatId:boat.id,time:fixture.time};setview();render();
   };
   showPinFixture(target);
   return {...target,missing};
  });
  const label=page.locator('.track-speed-label'),format=(value,digits)=>value.toLocaleString('da-DK',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const setStyle=async style=>{
   await page.locator('#mapTracksToggle').click();await page.locator('#trackStyle').selectOption(style);
   await page.locator('#mapTracksToggle').click();
  };
  // Create pins with actual pointer input after selecting each track style.
  for(const style of ['speed','boat','absolute','handicap','time']){
   await setStyle(style);
   const point=await page.evaluate(async target=>{
    pickedTrackSpeed=null;render();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    flushRender();
    const boat=boats.find(b=>b.id===target.boatId),sample=trackSpeedSample(boat,target.time);
    const point=new DOMPoint(...xy(sample.point)).matrixTransform($('map').getScreenCTM());
    return {x:point.x,y:point.y};
   },target);
   await page.mouse.click(point.x,point.y);
   assert.equal(await page.locator('[data-speed-action="pin"]').count(),1,style+' must allow a new pin');
   await page.locator('[data-speed-action="pin"]').click();
   await page.waitForSelector('[data-pinned="true"]');
   assert.equal(await page.evaluate(()=>speedPins.length),1,style+' pin click must save');
   assert.match(await label.textContent(),style==='time'?/s\/100 m$/:/ kn$/);
   await page.locator('[data-speed-action="unpin"]').click();
   assert.equal(await page.evaluate(()=>speedPins.length),0);
  }
  await setStyle('speed');await page.evaluate(()=>showPinFixture(pinTarget));
  await page.locator('[data-speed-action="pin"]').click();
  const pins=await page.evaluate(()=>JSON.parse(SRStorage.getItem('sr2026-speed-pins')));
  assert.equal(pins.length,1);assert.deepEqual(Object.keys(pins[0]).sort(),['boatId','id','time']);
  assert.equal(await label.textContent(),format(target.sog,1)+' kn');
  await setStyle('absolute');
  await page.evaluate(()=>{
   const forbidden=()=>{throw Error('Style switch recalculated or reread prepared comparisons');};
   prepareProjectedTrack=prepareReferenceProfile=prepareTimeProfiles=projectedTimeSample=projectedTrackSample=trackComparisonSample=forbidden;
   window.pinOriginalRead=webglTracks.gl.getBufferSubData;webglTracks.gl.getBufferSubData=forbidden;
   webglTracks.prepareComparison=forbidden;
  });
  for(const [style,index,unit] of [['absolute',0,'kn'],['handicap',1,'kn'],['time',2,'s/100 m'],['absolute',0,'kn']]){
   await setStyle(style);
   const expected=target.expected[index],text=await label.textContent();
   assert.equal(text,(expected>0?'+':'')+format(expected,2)+' '+unit);
   const accessible=await page.locator('#speedMarkers > g').getAttribute('aria-label');
   assert.match(accessible,/ved samme sted på ruten/);
   if(style==='handicap')assert.match(accessible,/ToD/);
  }
  for(const style of ['boat','speed']){await setStyle(style);assert.equal(await label.textContent(),format(target.sog,1)+' kn');}
  await setStyle('time');
  const scale=await page.evaluate(()=>({
   labels:[...$('trackSpeedLegend').querySelectorAll('text')].filter(text=>text.getAttribute('y')==='54').map(text=>text.textContent),
   limit:webglTracks.gl.getUniform(webglTracks.program,webglTracks.uniforms.gainLimit)
  }));
  assert.deepEqual(scale.labels,['−120','0','+120']);assert.equal(scale.limit,120);
  await page.locator('#startPresentation').click();
  assert.match(await label.textContent(),/s\/100 m$/);
  assert.equal(await page.locator('[data-speed-action]').count(),0);
  await page.screenshot({path:'/tmp/sr2026-pin-units.png'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(SRStorage.getItem('sr2026-speed-pins'))),pins);
  await page.reload();await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(target=>{
   const boat=boats.find(b=>b.id===target.boatId),[x,y]=xy(trackSpeedSample(boat,target.time).point);
   chosen.clear();chosen.add(boat.name);view=[x-4,y-4,8,8];selectedTime=target.time+60;setview();render();
   setBoatFavouritesOnly(true);
  },target);
  assert.match(await label.textContent(),/s\/100 m$/);
  // Reference changes invalidate cached numeric values; the reference's own
  // visible track and pin keep their original SOG rather than showing zero.
  await page.locator('#mapTracksToggle').click();await page.locator('#referenceBoat').selectOption(target.boatId);await page.locator('#mapTracksToggle').click();
  assert.equal(await label.textContent(),format(target.sog,1)+' kn');
  await page.locator('#mapTracksToggle').click();
  const otherReference=await page.evaluate(id=>boats.find(b=>b.id!==id&&b.name==='Mercutio').id,target.boatId);
  await page.locator('#referenceBoat').selectOption(otherReference);await page.locator('#mapTracksToggle').click();
  assert.equal(await label.textContent(),(target.expected[2]>0?'+':'')+format(target.expected[2],2)+' s/100 m');
  // Use a real interval whose prepared comparisons are missing but SOG exists.
  const missing=target.missing;
  for(const style of ['absolute','handicap','time']){
   await setStyle(style);
   const point=await page.evaluate(async missing=>{
    const boat=boats.find(b=>b.id===missing.boatId),[x,y]=xy(trackSpeedSample(boat,missing.time).point);
    chosen.clear();chosen.add(boat.name);view=[x-4,y-4,8,8];selectedTime=missing.time+60;
    speedPins=[];pickedTrackSpeed=null;setview();render();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));flushRender();
    const point=new DOMPoint(x,y).matrixTransform($('map').getScreenCTM());return {x:point.x,y:point.y};
   },missing);
   await page.mouse.click(point.x,point.y);
   assert.equal(await label.textContent(),'Sammenligning mangler');assert.equal(await page.locator('[data-speed-action="pin"]').count(),1);
   await page.locator('[data-speed-action="pin"]').click();
   await page.waitForSelector('[data-pinned="true"]');assert.equal(await page.evaluate(()=>speedPins.length),1);
   assert.equal(await label.textContent(),'Sammenligning mangler');
   await page.locator('[data-speed-action="unpin"]').click();assert.equal(await page.evaluate(()=>speedPins.length),0);
  }
  assert.deepEqual(errors,[]);
  console.log('Firefox PC: pin values and units match prepared track comparisons; style switches reuse all three bases; SOG, reference changes, persistence, presentation and missing data checked.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
