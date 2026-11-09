const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // Exercise public, read-only presentation mode from startup, without entering the editor.
  await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={admin:false,apiBase:""};'}));
  const t=Date.UTC(2026,5,11,9)/1000;
  await page.route('**/presentation.json',route=>route.fulfill({json:{version:1,speedPins:[],notes:[
   {time:t,text:'Første event',view:[230,250,620,760]},
   {time:t+60,text:'Andet event',view:[230,250,620,760]}
  ]}}));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  assert.equal(await page.evaluate(()=>window.SR_READONLY&&document.body.classList.contains('presenting')),true);
  assert.equal(await page.locator('aside').isVisible(),false);
  assert.equal(await page.locator('#endPresentation').isVisible(),false);
  await page.evaluate(t=>{
   const metadata=boatMetadata('Mercutio'),points=[[11.8,55.6,t-120],[11.8,55.6,t+120]];
   boats.splice(0,boats.length,...Array.from({length:12},(_,i)=>({id:'present-'+i,name:'Båd '+String(i+1).padStart(2,'0'),
    skipper:'Skipper '+i,boatType:'Seascape 27',metadata,points,speeds:[4,10]})));
   chosen.clear();for(const boat of boats){chosen.add(boat.name);colours[boat.name]='#ffdc42';}
   const [x,y]=xy([11.8,55.6]);view=[x-200,y-200,400,400];
   for(const note of notes)note.view=[...view];
   $('map').setAttribute('viewBox',view.join(' '));$('wind').checked=$('rain').checked=false;
   updateTimeline();selectedTime=t;render();
  },t);
  async function aligned(){
   await page.waitForFunction(()=>{
    const legend=$('trackSpeedLegend').querySelector('rect')?.getBoundingClientRect(),box=$('visibleBoats').getBoundingClientRect();
    return legend&&box.width>0&&Math.abs(box.x-legend.x)<1&&Math.abs(box.width-legend.width)<1&&Math.abs(box.y-legend.bottom-8)<1;
   });
  }
  await aligned();await page.locator('#visibleBoatsToggle').click();
  assert.equal(await page.locator('.visible-boat').count(),12);
  const anchor=page.locator('.visible-boat[data-boat-id="present-2"]');
  await anchor.hover();
  const position=(await anchor.boundingBox()).y;
  assert.equal(await page.locator('.boat-list-highlighted').getAttribute('data-boat-marker'),'present-2');
  await page.evaluate(()=>{
   window.savedPresentationPoints=boats[0].points;const t=currentTime();
   boats[0].points=[[25,50,t-120],[25,50,t+120]];
   const arrival={...boats[2],id:'newcomer',name:'Aardvark'};
   boats.push(arrival);chosen.add(arrival.name);colours[arrival.name]='#ffdc42';render();
  });
  assert.equal(await page.locator('.visible-boat').last().getAttribute('data-boat-id'),'newcomer');
  assert.equal(await page.locator('.visible-boat.is-outside').getAttribute('data-boat-id'),'present-0');
  assert.ok(Math.abs((await anchor.boundingBox()).y-position)<.01,'Presentation keeps row positions on arrivals/departures');
  assert.equal(await page.locator('.boat-list-highlighted').getAttribute('data-boat-marker'),'present-2');
  // Real playback must refresh speeds without replacing or moving the row being read.
  await page.locator('#play').click();
  await page.waitForFunction(t=>currentTime()>t+.2,t);
  await page.locator('#play').click();
  const idsBefore=await page.locator('.visible-boat').evaluateAll(rows=>rows.map(row=>row.dataset.boatId));
  await page.locator('#nextEvent').click();
  assert.deepEqual(await page.locator('.visible-boat').evaluateAll(rows=>rows.map(row=>row.dataset.boatId)),idsBefore,'Event navigation keeps the same boat slots');
  assert.equal(await page.locator('#eventText').textContent(),'Andet event');
  await page.screenshot({path:path.join(os.tmpdir(),'sr2026-boat-list-presentation-'+type.name()+'.png')});
  // Enter actual browser fullscreen through the presentation control.
  await page.locator('#presentationFullscreen').click();
  await page.waitForFunction(()=>!!document.fullscreenElement);
  await aligned();
  await anchor.hover();
  assert.equal(await page.locator('.boat-list-highlighted').getAttribute('data-boat-marker'),'present-2');
  const fullscreenTop=(await anchor.boundingBox()).y;
  await page.evaluate(()=>{boats[0].points=savedPresentationPoints;render();});
  assert.ok(Math.abs((await anchor.boundingBox()).y-fullscreenTop)<.01,'Returning boats keep row positions in fullscreen');
  const scene=await page.evaluate(()=>({time:currentTime(),view:[...view]}));
  await page.locator('#visibleBoatsPanel').hover();await page.mouse.wheel(0,160);await page.waitForTimeout(100);
  assert.ok(await page.locator('#visibleBoatsPanel').evaluate(node=>node.scrollTop>0));
  assert.deepEqual(await page.evaluate(()=>({time:currentTime(),view:[...view]})),scene,'Scrolling the fullscreen list does not change the scene');
  await page.mouse.move(1490,10);
  await page.locator('.visible-boat[data-boat-id="present-5"]').focus();await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('.boat-list-highlighted').getAttribute('data-boat-marker'),'present-6');
  await page.locator('#visibleBoatsToggle').click();
  assert.equal(await page.locator('#visibleBoatsPanel').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),true);
  await page.locator('#visibleBoatsToggle').click();
  assert.equal(await page.locator('.visible-boat.is-outside').count(),0);
  await page.locator('#presentationFullscreen').click();
  await page.waitForFunction(()=>!document.fullscreenElement);
  // Firefox reserves the first Escape for native fullscreen; test list Escape after exiting it.
  await page.locator('.visible-boat[data-boat-id="present-2"]').focus();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#visibleBoatsPanel').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.SR_READONLY&&document.body.classList.contains('presenting')),true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'public read-only presentation, folding, hover, stable arrivals/departures, playback, event navigation, actual fullscreen, stable returning boats, scroll, keyboard navigation, Escape, unchanged scene',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(error=>{console.error(error);process.exit(1)});
