const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForFunction(()=>typeof stopPlayback==='function');
  const result=await page.evaluate(()=>{
   const assert=(condition,message)=>{if(!condition)throw Error(message);};
   $('wind').checked=true;setCurrentTime(D.start+7200);render();
   const arrows=$('winds').firstChild,legend=$('trackSpeedLegend').firstChild,credit=$('mapCredit').firstChild;
   const marker=$('boatMarkers').querySelector('.boat-marker').getAttribute('transform');
   setCurrentTime(D.start+7240);render();
   assert($('winds').firstChild===arrows,'Wind DOM changed within one hour');
   assert($('trackSpeedLegend').firstChild===legend,'Legend DOM changed during playback');
   assert($('mapCredit').firstChild===credit,'Credit DOM changed during playback');
   assert($('boatMarkers').querySelector('.boat-marker').getAttribute('transform')!==marker,'Boats must continue moving');
   renderWindArrows(D.start+10800);assert($('winds').firstChild!==arrows,'Hour change did not rebuild wind');
   const hourArrows=$('winds').firstChild;$('windNumbers').checked=true;renderWindArrows(D.start+10800);
   assert($('winds').firstChild!==hourArrows&&$('winds').querySelector('text'),'Wind numbers not refreshed');
   $('wind').checked=false;renderWindArrows();assert(!$('winds').children.length,'Wind did not hide');
   $('wind').checked=true;renderWindArrows();assert($('winds').children.length,'Wind did not return');
   const beforeZoom=$('winds').firstChild;view=[view[0]+1,view[1]+1,view[2]*.8,view[3]*.8];setview();flushRender();
   assert($('winds').firstChild!==beforeZoom,'Pan/zoom did not rebuild wind');
   assert($('trackSpeedLegend').firstChild!==legend,'Pan/zoom did not reposition legend');
   return {checks:'static DOM reuse, moving boats, hourly wind, layer toggles, numbers, pan and zoom'};
  });
  const resized=await page.evaluate(()=>{window.arrowsBeforeResize=$('winds').firstChild;return $('map').getBoundingClientRect().width;});
  await page.setViewportSize({width:1200,height:850});
  await page.waitForFunction(()=>$('winds').firstChild!==window.arrowsBeforeResize);
  assert.notEqual(await page.locator('#map').evaluate(e=>e.getBoundingClientRect().width),resized);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,resize:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
