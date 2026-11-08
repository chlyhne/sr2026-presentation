const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(process.env.SR_TRACK_RENDERER)await page.addInitScript(renderer=>window.SR_TRACK_RENDERER=renderer,process.env.SR_TRACK_RENDERER);
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>typeof nearestTrackSpeed==='function'&&typeof stopPlayback==='function');
  const target=await page.evaluate(()=>{
   const boat=boats.find(b=>b.name==='Mercutio');
   const index=boat.points.findIndex((p,i)=>p[2]>D.start+26*3600&&boat.points[i+1]?.[2]-p[2]<300&&boat.speeds[i]>4);
   const a=boat.points[index],b=boat.points[index+1],time=a[2]+.37*(b[2]-a[2]);
   const point=trackValue(boat.points,index,time).point,[x,y]=xy(point);
   chosen.clear();chosen.add(boat.name);$('wind').checked=$('rain').checked=false;
   view=[x-4,y-4,8,8];setview();selectedTime=time+600;render();
   const screen=new DOMPoint(x,y).matrixTransform($('map').getScreenCTM());
   const hit=nearestTrackSpeed(screen.x,screen.y,boat.id);
   if(Math.abs(hit.time-time)>.002)throw new Error('Picker did not resolve exact cubic time');
   const sample=trackSpeedSample(boat,time),expected=boat.speeds[index]+.37*(boat.speeds[index+1]-boat.speeds[index]);
   if(Math.abs(sample.speed-expected)>1e-9)throw new Error('SOG must interpolate native speed values');
   const gap={id:'gap',points:[[11,55,100],[12,56,500]],speeds:[2,12]};
   if(trackSpeedSample(gap,300)!==null)throw new Error('Do not interpolate pins over track gaps');
   if(trackSpeedSample({...gap,points:[[11,55,100],[11.01,55,200]],speeds:[null,12]},150).speed!==null)throw new Error('Do not fabricate missing SOG');
   const note={time:currentTime(),text:'Event med fartmærke',view:[...view],settings:sceneSettings()};
   notes=[note];localStorage.setItem('sr2026-notes',JSON.stringify(notes));showNotes();
   return {x:screen.x,y:screen.y,time,boatId:boat.id,view:[...view],now:currentTime()};
  });
  const notesBefore=await page.evaluate(()=>localStorage.getItem('sr2026-notes'));
  const renderer=await page.evaluate(()=>webglTracks.active?'webgl':'svg');
  if(renderer==='webgl'){
   await page.mouse.move(target.x,target.y);
   await page.waitForFunction(()=>!$('trackHover')?.hidden&&$('map').classList.contains('track-hover'));
   assert.match(await page.locator('#trackHover').textContent(),/Mercutio · SOG/);
  }
  await page.mouse.click(target.x,target.y);
  assert.equal(await page.locator('#speedMarkers [data-pinned="false"]').count(),1);
  assert.equal(await page.locator('#speedMarkers [data-speed-action="pin"]').count(),1);
  const picked=await page.evaluate(()=>({...pickedTrackSpeed}));
  assert.equal(picked.boatId,target.boatId);assert.ok(Math.abs(picked.time-target.time)<2);
  assert.match(await page.locator('.track-speed-label').textContent(),/^\d+,\d kn$/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('sr2026-speed-pins')),null,'Click alone must not pin');
  await page.locator('#startPresentation').click();assert.equal(await page.locator('#speedMarkers > g').count(),0,'Unpinned selection stays out of presentation');
  await page.locator('#endPresentation').click();await page.locator('.note-jump').click();
  await page.mouse.click(target.x,target.y);
  const beforePan=await page.evaluate(()=>[...view]);
  await page.mouse.move(target.x,target.y);await page.mouse.down();await page.mouse.move(target.x+35,target.y+20,{steps:5});await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(()=>[...view]),beforePan,'Dragging from a track still pans');
  await page.locator('.note-jump').click();
  await page.mouse.click(target.x,target.y);
  await page.locator('[data-speed-action="pin"]').click();
  let pins=await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-speed-pins')));
  assert.equal(pins.length,1);assert.equal(pins[0].boatId,target.boatId);
  assert.equal(await page.locator('#speedMarkers [data-pinned="true"]').count(),1);
  // Re-clicking and pinning the same point removes, rather than duplicates, the pin.
  await page.locator('[data-speed-action="unpin"]').focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>speedPins.length),0);
  await page.locator('[data-speed-action="pin"]').click();pins=await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-speed-pins')));
  assert.equal(pins.length,1);
  const labelBefore=await page.locator('.track-speed-label').textContent();
  await page.evaluate(()=>{const serialize=XMLSerializer.prototype.serializeToString;XMLSerializer.prototype.serializeToString=function(node){const xml=serialize.call(this,node);window.speedPinSVG=xml;return xml;};});
  const download=page.waitForEvent('download');await page.evaluate(()=>captureMap());
  await(await download).saveAs('/tmp/sr2026-speed-pins-'+type.name()+'-map.png');
  const exported=await page.evaluate(()=>{
   const doc=new DOMParser().parseFromString(speedPinSVG,'image/svg+xml');
   return {pins:doc.querySelectorAll('#speedMarkers [data-pinned="true"]').length,buttons:doc.querySelectorAll('[data-speed-action]').length,hits:doc.querySelectorAll('.track-hit-targets').length};
  });assert.deepEqual(exported,{pins:1,buttons:0,hits:0});
  await page.reload();await page.waitForFunction(()=>typeof speedPins!=='undefined'&&speedPins.length===1);
  await page.locator('.note-jump').click();assert.equal(await page.locator('.track-speed-label').textContent(),labelBefore);
  await page.locator('#startPresentation').click();assert.equal(await page.locator('#speedMarkers [data-pinned="true"]').count(),1);
  assert.equal(await page.locator('[data-speed-action]').count(),0);
  assert.equal(await page.evaluate(()=>webglTracks.active?getComputedStyle(webglTracks.host).pointerEvents:getComputedStyle(document.querySelector('.track-hit-target')).pointerEvents),'none');
  const visibility=await page.evaluate(pin=>{
   const seen=()=>{render();return $('speedMarkers').children.length;};
   selectedTime=pin.time-1;const future=seen();
   selectedTime=pin.time+7201;const old=seen();
   selectedTime=pin.time+7199;const inTail=seen();
   chosen.clear();const unselected=seen();chosen.add('Mercutio');
   view=[0,0,10,10];setview();const offscreen=seen();
   return {future,old,inTail,unselected,offscreen};
  },pins[0]);assert.deepEqual(visibility,{future:0,old:0,inTail:1,unselected:0,offscreen:0});
  await page.locator('#eventSelect').selectOption('0');
  await page.mouse.move(700,450);await page.mouse.wheel(0,-120);await page.waitForTimeout(100);
  assert.equal(await page.locator('#speedMarkers [data-pinned="true"]').count(),1);
  assert.equal(await page.locator('.track-speed-label').textContent(),labelBefore);
  await page.screenshot({path:'/tmp/sr2026-speed-pins-'+type.name()+'-presentation.png'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-speed-pins'))),pins,'Time and viewport changes preserve pins');
  assert.equal(await page.evaluate(()=>localStorage.getItem('sr2026-notes')),notesBefore,'Pins do not modify saved events');
  await page.locator('#endPresentation').click();await page.locator('.note-jump').click();
  await page.locator('#speedMarkers [data-pinned="true"]').click();
  assert.equal(await page.locator('[data-speed-action="unpin"]').count(),1);
  await page.locator('[data-speed-action="unpin"]').click();assert.equal(await page.evaluate(()=>speedPins.length),0);
  await page.evaluate(()=>{window.originalPinStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='sr2026-speed-pins')throw new Error('quota');return originalPinStorage.call(this,key,value);};});
  await page.locator('[data-speed-action="pin"]').click();assert.equal(await page.evaluate(()=>speedPins.length),0);
  assert.match(await page.locator('#speedPinStatus').textContent(),/kunne ikke gemmes/);
  await page.evaluate(()=>{Storage.prototype.setItem=originalPinStorage;});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),renderer,checks:'exact curve picking, hover, native speed interpolation, click preview, pin/unpin/keyboard, persistence, selected boats, tail and viewport visibility, no gaps, panning, presentation, zoom, PNG, failed save',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
