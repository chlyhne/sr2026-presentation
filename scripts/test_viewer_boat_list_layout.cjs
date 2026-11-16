const assert=require('node:assert/strict');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright'));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:800}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('sr2026-track-comparison',JSON.stringify({enabled:false,basis:'absolute',boatColour:true})));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18516/');
  await page.waitForSelector('main:not([inert])',{timeout:60000});
  const settled=async placement=>{
   await page.waitForFunction(expected=>{
    flushRender();return document.querySelector('[data-map-scale]')?.dataset.placement===expected;
   },placement);
   return page.evaluate(()=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};};
    return {list:rect($('visibleBoats')),map:rect($('map')),scale:rect(document.querySelector('[data-map-scale]')),
     panel:{height:$('visibleBoatsPanel').clientHeight,scroll:$('visibleBoatsPanel').scrollHeight},rows:$('visibleBoatsList').children.length};
   });
  };
  await page.locator('#visibleBoatsToggle').click();
  const full=await settled('beside-list');
  assert.ok(full.panel.scroll>full.panel.height,'A long list scrolls within the available map height');
  assert.ok(full.scale.left>=full.list.right+4&&full.scale.left<=full.list.right+12,'The visible scale clears the panel with a small gap');
  assert.ok(full.map.bottom-full.scale.bottom>=4&&full.map.bottom-full.scale.bottom<=12,'The scale stays at the bottom');
  await page.locator('#boatSearchInput').fill('Mercutio');
  const short=await settled('left');
  assert.equal(short.rows,1);assert.ok(short.list.height<full.list.height/2,'The list shrinks to its contents');
  assert.ok(short.list.bottom<short.scale.top,'The short panel does not cover the scale');
  assert.ok(Math.abs(short.scale.left-short.map.left-8)<4,'The scale returns to the left when space is free');
  await page.locator('#boatSearchInput').fill('');await settled('beside-list');
  await page.locator('#visibleBoatsToggle').click();
  const collapsed=await settled('left');assert.ok(collapsed.list.height<40);
  assert.deepEqual(errors,[]);
  console.log('Firefox: boat list follows content height, long lists scroll, and the bottom scale moves beside the list only on actual overlap.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
