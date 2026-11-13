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
  await page.waitForSelector('main:not([inert])');
  const prepared=await page.evaluate(()=>({
   geometry:boats.every(boat=>webglTracks.buffers.has(boat.points)),
   models:boats.every(boat=>trackModelCache.has(boat.points)),
   timeline:boats.every(boat=>timelineTrackCache.has(boat.points)),
   comparison:boats.every(boat=>
    trackProfileCache.has(boat.points)&&!!webglTracks.buffers.get(boat.points).comparisonTexture)
  }));
  assert.deepEqual(prepared,{geometry:true,models:true,timeline:true,comparison:true});
  assert.equal(await page.evaluate(()=>boats.every(boat=>{
   const rgb=webglTracks.boatColours.get(colours[boat.name]);
   return rgb?.length===3&&rgb.every(channel=>Number.isFinite(channel)&&channel>=0&&channel<=1);
  })),true);
  await page.evaluate(()=>{
   $('wind').checked=$('rain').checked=false;selectedTime=D.start+43200;render();
   window.fleetBufferUploads=webglTracks.uploads;
   // These operations must never be needed by a selection or mode change.
   const forbidden=()=>{throw Error('Faste data blev genberegnet efter indlæsning');};
   webglTracks.gl.createBuffer=forbidden;
   webglTracks.gl.bufferData=forbidden;
   webglTracks.gl.bufferSubData=forbidden;
   webglTracks.preparation.prepare=forbidden;
  });
  await page.locator('#visibleBoatsToggle').click();
  if(await page.locator('#boatClearFavourites').isEnabled())await page.locator('#boatClearFavourites').click();
  await page.locator('#boatSearchInput').press('Enter');
  await page.waitForFunction(()=>chosen.size===boats.length&&webglTracks.order.length===boats.length);
  await page.locator('#boatFavouritesOnly').click();await page.locator('#boatFavouritesOnly').click();
  await page.locator('#mapTracksToggle').click();
  await page.locator('#trackStyle').selectOption('absolute');
  await page.locator('#trackStyle').selectOption('handicap');
  await page.waitForFunction(()=>comparison.enabled&&comparison.basis==='handicap');
  await page.locator('#trackStyle').selectOption('time');
  await page.waitForFunction(()=>comparison.enabled&&comparison.basis==='time');
  await page.evaluate(()=>{flushRender();if(!webglTracks.active)throw Error(webglTracks.error);});
  await page.locator('#trackStyle').selectOption('boat');
  await page.evaluate(()=>{flushRender();if(!webglTracks.active)throw Error(webglTracks.error);});
  assert.equal(await page.locator('#trackSpeedLegend').textContent(),'');
  await page.locator('#trackStyle').selectOption('absolute');
  await page.locator('#trackLength').selectOption('900');
  await page.locator('#trackLength').selectOption('0');
  await page.locator('#trackLength').selectOption('7200');
  if(await page.locator('#boatClearFavourites').isEnabled())await page.locator('#boatClearFavourites').click();
  await page.locator('#boatSearchInput').press('Enter');
  await page.waitForFunction(()=>chosen.size===boats.length&&webglTracks.order.length===boats.length);
  await page.locator('#boatFavouritesOnly').click();await page.locator('#boatFavouritesOnly').click();
  await page.evaluate(()=>{
   selectedTime=D.start+14400;render();
   selectedTime=D.start+43200;render();
   if(!webglTracks.active)throw Error(webglTracks.error);
  });
  assert.equal(await page.evaluate(()=>webglTracks.uploads===fleetBufferUploads),true);
  await page.evaluate(()=>setPresentationMode(true));
  await page.locator('#mapTracksToggle').click();
  assert.equal(await page.locator('#mapTracksPanel').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mapTracksPanel').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),true);
  await page.locator('#mapTracksToggle').click();await page.locator('#mapLayersToggle').click();
  assert.equal(await page.locator('#mapTracksPanel').isVisible(),false);
  assert.equal(await page.locator('#mapLayersPanel').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('Firefox: hele feltet, bådfarver og alle tre sammenligningsgrundlag er forberedt før betjening; bådvalg, grundlag og tidsskift genberegner eller uploader ingen faste spordata.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
