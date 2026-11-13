const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
const url=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';
(async()=>{
 const browser=await firefox.launch({headless:true});let publishedPin;
 try{
  for(const readonly of [false,true]){
   const context=await browser.newContext({viewport:{width:1500,height:1000}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.SR_CONFIG='+JSON.stringify({local:!readonly,admin:false,apiBase:''})}));
   if(readonly)await page.route('**/presentation.json',r=>r.fulfill({json:{version:1,notes:[],speedPins:[publishedPin]}}));
   await page.goto(url);await page.waitForSelector('main:not([inert])',{timeout:120000});
   const target=await page.evaluate(async saved=>{
    stopPlayback();notes=[];activePresentationNote=null;$('wind').checked=$('rain').checked=false;
    const boat=saved?boats.find(b=>b.id===saved.boatId):boats.find(b=>b.name==='Mercutio');
    const index=boat.points.findIndex((p,i)=>p[2]>D.start+26*3600&&boat.points[i+1]?.[2]-p[2]<300&&boat.speeds[i]>4);
    const time=saved?.time??boat.points[index][2]+.37*(boat.points[index+1][2]-boat.points[index][2]);
    const [x,y]=xy(trackSpeedSample(boat,time).point);chosen.clear();chosen.add(boat.name);boatFavouritesOnly=true;
    selectedTime=time+90;view=[x-4,y-4,8,8];comparison={enabled:false,basis:'absolute',boatColour:false};setview();render();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));flushRender();
    const point=new DOMPoint(x,y).matrixTransform(mapViewport().matrix);return {boatId:boat.id,time,x:point.x,y:point.y};
   },readonly?publishedPin:null);
   if(!readonly){
    await page.mouse.click(target.x,target.y);await page.locator('[data-speed-action="pin"]').click();
    publishedPin=await page.evaluate(()=>speedPins[0]);await page.evaluate(()=>setPresentationMode(true));
   }
   const saved=await page.evaluate(()=>SRStorage.getItem('sr2026-speed-pins')),clock=await page.evaluate(()=>currentTime());
   await page.locator('[data-pinned="true"] circle').first().click();
   await page.locator('[data-speed-action="unpin"]').focus();await page.keyboard.press('Space');
   assert.equal(await page.locator('[data-pinned="true"]').count(),0);assert.equal(await page.evaluate(()=>currentTime()),clock);
   assert.equal(await page.evaluate(()=>SRStorage.getItem('sr2026-speed-pins')),saved);
   await page.locator('[data-speed-action="pin"]').click();assert.equal(await page.locator('[data-pinned="true"]').count(),1);
   assert.equal(await page.evaluate(()=>JSON.stringify(speedPins[0])),JSON.stringify(publishedPin));
   await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),true);
   if(!readonly){await page.evaluate(()=>setPresentationMode(false));assert.equal(await page.evaluate(()=>visibleSpeedPins()[0].id),publishedPin.id);}
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{flushRender();resolve();}))));
   const list=await page.evaluate(target=>{
    flushRender();$('speedMarkers').setAttribute('visibility','hidden');const boat=boats.find(b=>b.id===target.boatId),position=displayBoatPosition(boat,currentTime()),[mx,my]=xy(position.point),scale=Math.hypot(mapViewport().matrix.a,mapViewport().matrix.b);
    const rows=boats.map((b,i)=>({boat:b,passage:{elapsed:100+i,end:currentTime()},duration:'01:40,0'}));
    const width=36+String(rows.length).length*7.5+12+Math.max(...rows.map(r=>r.boat.name.length))*7.5+7*7.5+16;
    const gx=mx-(24+width/2)/scale,geo=(x,y)=>[9.5+x*4.5/1000,57-y*3/1180];
    const gates=[geo(gx-1,my-1),geo(gx-1,my+1),geo(gx,my-1),geo(gx,my+1)];
    $('gateResults').replaceChildren();drawGateResults($('gateResults'),gates,rows);resizeSymbols($('gateResults'));
    const layers=[...$('map').children].map(n=>n.id),p=new DOMPoint(mx,my).matrixTransform(mapViewport().matrix);
    return {layers,overBoat:document.elementFromPoint(p.x,p.y)?.closest('[data-boat-marker]')?.dataset.boatMarker,height:document.querySelector('.gate-results-background').getBoundingClientRect().height,view:[...view]};
   },target);
   assert.ok(list.layers.indexOf('routes')<list.layers.indexOf('gateResults')&&list.layers.indexOf('gateResults')<list.layers.indexOf('boatMarkers'));
   assert.equal(list.overBoat,target.boatId,'Boat icon remains clickable above the gate box');assert.ok(Math.abs(list.height-300)<1.5,'Stable screen height: '+list.height);
   const scroller=page.locator('[data-gate-results-scroll]'),box=await scroller.boundingBox();
   await page.mouse.move(box.x+12,box.y+30);await page.mouse.wheel(0,500);
   await page.waitForFunction(()=>document.querySelector('[data-gate-results-scroll]').scrollTop>0);
   assert.deepEqual(await page.evaluate(()=>view),list.view,'List wheel must not zoom the map');
   await scroller.focus();await page.keyboard.press('End');
   await page.waitForFunction(()=>{const s=document.querySelector('[data-gate-results-scroll]');return s.scrollTop+s.clientHeight>=s.scrollHeight-1;});
   assert.equal(await page.evaluate(()=>currentTime()),clock,'List keyboard must not navigate events');
   const before=await scroller.evaluate(s=>s.scrollTop);
   await page.evaluate(()=>{changeMapView([view[0],view[1],view[2]*.95,view[3]*.95]);flushRender();});
   assert.equal(await scroller.evaluate(s=>s.scrollTop),before);assert.equal(await page.locator('.gate-result').count(),106);
   assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',readonly,temporaryPins:true,gateScroll:true,layerOrder:true,errors}));
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
