const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  for(const readonly of [false,true]){
   const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   if(readonly){
    await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={admin:false,apiBase:""};'}));
    await page.route('**/presentation.json',route=>route.fulfill({json:{version:1,notes:[],speedPins:[]}}));
   }
   await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18176/');
   await page.waitForSelector('main:not([inert])',{timeout:120000});
   const button=page.getByRole('button',{name:'Mål afstand',exact:true});
   assert.equal(await button.textContent(),'','The ruler has no text caption');
   assert.equal(await button.locator('svg').count(),1);
   assert.equal(await page.locator('#mapMeasurePanel,#measureDistance,#clearMeasurement,#cancelMapLine').count(),0,'No measurement submenu or obsolete controls');
   assert.equal(await page.locator('#rhumblineTools').isVisible(),false,'Permanent route controls are separate');
   const map=await page.locator('#map').boundingBox();
   const first={x:map.x+map.width*.50,y:map.y+map.height*.45};
   const second={x:map.x+map.width*.70,y:map.y+map.height*.65};
   const click=point=>page.mouse.click(point.x,point.y);
   await page.locator('#mapLayersToggle').click();
   await button.click();
   assert.equal(await page.locator('#mapLayersPanel').isVisible(),false);
   assert.equal(await button.getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>navigationMode),'measure');
   const before=await page.evaluate(()=>JSON.stringify(SR_RHUMBLINE));
   await click(first);
   assert.equal(await page.evaluate(()=>navigationDraft.length),1);
   await click(first);
   assert.equal(await page.evaluate(()=>navigationDraft.length),1,'A repeated position is not a second point');
   await button.focus();await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>navigationMode),null,'The ruler also toggles off from the keyboard');
   assert.equal(await page.locator('#mapNavigation').textContent(),'');
   await button.click();await click(first);await click(second);
   assert.equal(await page.evaluate(()=>navigationMode),null,'The second point automatically finishes the measurement');
   assert.equal(await page.evaluate(()=>measurement.length),2);
   assert.equal(await button.getAttribute('aria-pressed'),'true','Completed measurement remains active until cleared');
   assert.match(await page.locator('#mapNavigation').textContent(),/Måling.*sm/);
   const completed=await page.evaluate(()=>JSON.stringify(measurement));
   await click({x:first.x,y:second.y});
   assert.equal(await page.evaluate(()=>JSON.stringify(measurement)),completed,'Further map clicks cannot extend the measurement');
   assert.equal(await page.evaluate(()=>JSON.stringify(SR_RHUMBLINE)),before);
   await button.click();
   assert.equal(await button.getAttribute('aria-pressed'),'false');
   assert.equal(await page.locator('#mapNavigation').textContent(),'');
   await button.click();
   await page.mouse.move(first.x,first.y);await page.mouse.down();
   await page.mouse.move(first.x+45,first.y+30,{steps:5});await page.mouse.up();
   assert.equal(await page.evaluate(()=>navigationDraft.length),0,'Panning does not place a measurement point');
   await click(first);await page.keyboard.press('Escape');
   assert.equal(await button.getAttribute('aria-pressed'),'false');
   assert.equal(await page.locator('#mapNavigation').textContent(),'');
   await button.click();await click(first);await click(second);await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>measurement.length),0,'Escape clears a completed measurement');
   assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),readonly,'Escape does not exit presentation while clearing a measurement');
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({browser:'firefox',readonly,checks:'ruler icon, no submenu, two-click measurement, clear/restart, keyboard, panning, permanent route untouched',errors}));
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
