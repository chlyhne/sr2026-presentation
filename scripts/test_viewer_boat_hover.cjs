const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.join(os.tmpdir(),'sr2026-test-tools'),path.join(os.homedir(),'AppData/Local/Temp/sr2026-test-tools')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18516/events/sjaelland-rundt-2026/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>{
   stopPlayback();boatSearchQuery='';boatCourseFilter=boatClassFilter='';boatFavouritesOnly=true;
   chosen.clear();for(const boat of orderedListBoats().slice(0,30))chosen.add(boat.name);
   setVisibleBoatsExpanded(true);requestRender();
  });
  await settle();
  const row=page.locator('#visibleBoatsList .visible-boat').nth(2),rect=await row.boundingBox();
  const pointer={x:rect.x+rect.width*.55,y:rect.y+rect.height*.5};
  await page.mouse.move(pointer.x,pointer.y);await settle();
  const current=()=>page.evaluate(({x,y})=>({
   actual:document.elementFromPoint(x,y)?.closest('#visibleBoatsList [data-boat-id]')?.dataset.boatId||null,
   hovered:hoveredVisibleBoatId,
   highlighted:[...document.querySelectorAll('#visibleBoatsList .highlighted')].map(n=>n.dataset.boatId)
  }),pointer);
  const initial=await current();assert.ok(initial.actual);assert.equal(initial.hovered,initial.actual);
  // The mouse stays still as two preceding rows disappear.
  await page.evaluate(()=>{
   for(const row of [...$('visibleBoatsList').children].slice(0,2))chosen.delete(boats.find(b=>b.id===row.dataset.boatId).name);
   requestRender();
  });
  await settle();
  const filtered=await current();assert.ok(filtered.actual);assert.notEqual(filtered.actual,initial.actual);
  assert.equal(filtered.hovered,filtered.actual);assert.deepEqual(filtered.highlighted,[filtered.actual]);
  // Scrolling must also update the boat without any mouse movement.
  await page.evaluate(()=>$('visibleBoatsPanel').scrollTop+=100);await settle();
  const scrolled=await current();assert.ok(scrolled.actual);assert.notEqual(scrolled.actual,filtered.actual);
  assert.equal(scrolled.hovered,scrolled.actual);assert.deepEqual(scrolled.highlighted,[scrolled.actual]);
  await page.mouse.move(1400,900);await settle();
  assert.equal(await page.evaluate(()=>hoveredVisibleBoatId),null);
  assert.deepEqual(errors,[]);console.log('Firefox: stationary hover follows changed boat rows and scrolling.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
