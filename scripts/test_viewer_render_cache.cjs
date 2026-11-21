const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('events/sjaelland-rundt-2026/',process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/').href);await page.waitForSelector('main:not([inert])',{timeout:120000});
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
   renderWindBarbs(D.start+10800);assert($('winds').firstChild!==arrows,'Hour change did not rebuild wind');
   $('wind').checked=false;renderWindBarbs();assert(!$('winds').children.length,'Wind did not hide');
   $('wind').checked=true;renderWindBarbs();assert($('winds').children.length,'Wind did not return');
   const legendTransform=legend.getAttribute('transform'),beforePan=$('winds').firstChild;
   view=[view[0]+1,view[1]+1,view[2],view[3]];setview();flushRender();
   assert($('winds').firstChild===beforePan,'Pan replaced geographically anchored wind barbs');
   const windTransform=beforePan.getAttribute('transform');view[2]*=.8;view[3]*=.8;setview();flushRender();
   assert($('winds').firstChild.getAttribute('transform')!==windTransform,'Zoom did not resize wind symbols');
   assert($('trackSpeedLegend').firstChild===legend&&legend.getAttribute('transform')!==legendTransform,'Pan/zoom must reposition the retained legend');
   return {checks:'static DOM reuse, moving boats, hourly wind, layer toggles, stable pan and fixed-size zoom'};
  });
  const resized=await page.evaluate(()=>{window.transformBeforeResize=$('winds').firstChild.getAttribute('transform');return $('map').getBoundingClientRect().width;});
  await page.setViewportSize({width:1200,height:850});
  await page.waitForFunction(()=>$('winds').firstChild.getAttribute('transform')!==window.transformBeforeResize);
  assert.notEqual(await page.locator('#map').evaluate(e=>e.getBoundingClientRect().width),resized);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,resize:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
