const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
const source=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/tractrac/combined_tracks.json'),'utf8'));
const entries=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/boat-dimensions/manage2sail-entries.json'),'utf8'));
async function check(browserType){
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  // Metadata is matched by participant ID, including boats with manual dimension overrides.
  const metadata=await page.evaluate(()=>boats.map(({id,skipper,boatType})=>({id,skipper,boatType})));
  assert.equal(metadata.length,106);
  for(const boat of metadata){
   const competitor=source.competitors[boat.id];
   assert.equal(boat.skipper,competitor.description.trim());
   const matches=entries.filter(entry=>String(entry.BowNumber)===String(competitor.uniqueId));
   if(matches.length===1&&matches[0].BoatType&&!['0','-','–'].includes(matches[0].BoatType))assert.equal(boat.boatType,matches[0].BoatType.trim());
  }
  assert.equal(await page.locator('#visibleBoatsToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#visibleBoatsPanel').isVisible(),false);
  async function aligned(){
   await page.waitForFunction(()=>{
    const legend=$('trackSpeedLegend').querySelector('rect')?.getBoundingClientRect(),box=$('visibleBoats').getBoundingClientRect();
    return legend&&box.width>0&&Math.abs(box.x-legend.x)<1&&Math.abs(box.width-legend.width)<1&&Math.abs(box.y-legend.y-legend.height-8)<1;
   });
  }
  await aligned();
  const testTime=await page.evaluate(()=>{
   $('wind').checked=$('rain').checked=false;selectedTime=D.start+3600;
   const t=selectedTime,metadata=boatMetadata('Mercutio'),points=[[11.8,55.6,t-60],[11.8,55.6,t+60]];
   const visible=Array.from({length:14},(_,i)=>({id:'list-'+i,name:'Båd '+String(i+1).padStart(2,'0'),skipper:i?'Skipper '+i:'Kåre <b>Gibsholm</b>',boatType:'Seascape 27',metadata,points,speeds:i===1?[null,null]:i===2?[25,25]:[4,8]}));
   const extra=[
    {...visible[0],id:'outside',name:'Udenfor',points:[[25,50,t-60],[25,50,t+60]]},
    {...visible[0],id:'old-track',name:'Kun gammelt spor',points:[[11.8,55.6,t-60],[25,50,t]]},
    {...visible[0],id:'stale',name:'For gammel position',points:[[11.8,55.6,t-301]]},
    {...visible[0],id:'future',name:'Endnu ikke startet',points:[[11.8,55.6,t+10]]},
    {...visible[0],id:'deselected',name:'Fravalgt båd'}
   ];
   boats.splice(0,boats.length,...visible,...extra);chosen.clear();
   for(const boat of boats){colours[boat.name]='#ffdc42';if(boat.id!=='deselected')chosen.add(boat.name);}
   const [x,y]=xy([11.8,55.6]);view=[x-200,y-200,400,400];$('map').setAttribute('viewBox',view.join(' '));render();
   return t;
  });
  assert.equal(await page.locator('#visibleBoatsCount').textContent(),'· 14');
  const closed=await page.locator('#visibleBoats').boundingBox();assert.ok(closed.height<=34,'Collapsed list is a small bar');
  await page.locator('#visibleBoatsToggle').click();await aligned();
  assert.equal(await page.locator('.visible-boat').count(),14);
  assert.equal(await page.locator('.visible-boat').first().locator('.visible-boat-skipper').textContent(),'Skipper: Kåre <b>Gibsholm</b>');
  assert.equal(await page.locator('.visible-boat b').count(),0,'Names are plain text');
  assert.equal(await page.locator('.visible-boat').first().locator('.visible-boat-type').textContent(),'Bådtype: Seascape 27');
  assert.equal(await page.locator('.visible-boat').first().locator('.visible-boat-speed').textContent(),'6,0 kn');
  assert.equal(await page.locator('.visible-boat').nth(1).locator('.visible-boat-speed').textContent(),'Fart mangler');
  assert.equal(await page.locator('.visible-boat').nth(2).locator('.visible-boat-speed').textContent(),'25,0 kn','Speeds above the colour scale are not capped');
  const scroll=await page.locator('#visibleBoatsPanel').evaluate(node=>({height:node.clientHeight,total:node.scrollHeight}));
  assert.ok(scroll.total>scroll.height,'Expanded list scrolls');
  async function iconLength(){return page.locator('[data-boat-marker="list-0"] .boat-hull').evaluate(hull=>{
   const bounds=hull.getBBox(),matrix=hull.getScreenCTM();return Math.hypot(matrix.c,matrix.d)*bounds.height;
  });}
  const normal=await iconLength();await page.locator('.visible-boat').first().hover();
  assert.ok(Math.abs(await iconLength()/normal-1.8)<.001,'Hover enlarges the actual boat hull');
  assert.equal(await page.locator('.boat-list-highlighted').getAttribute('data-boat-marker'),'list-0');
  await page.evaluate(()=>{window.keptBoatRow=$('visibleBoatsList').firstChild;selectedTime+=30;render();});
  assert.equal(await page.evaluate(()=>keptBoatRow===$('visibleBoatsList').firstChild),true,'Playback retains row DOM');
  assert.equal(await page.locator('.visible-boat').first().locator('.visible-boat-speed').textContent(),'7,0 kn');
  assert.ok(Math.abs(await iconLength()/normal-1.8)<.001,'Hover survives a marker redraw');
  await page.mouse.move(1490,10);assert.ok(Math.abs(await iconLength()/normal-1)<.001,'Mouse leave restores the hull size');
  // Departures disappear immediately; arrivals join the alphabetical order.
  await page.evaluate(()=>{
   window.listOriginalPoints=boats[0].points;
   const t=currentTime();boats[0].points=[[25,50,t-60],[25,50,t+60]];
   const arrival={...boats[5],id:'arrival',name:'Albatros',skipper:'Et meget langt skippernavn som ikke må flytte andre rækker',boatType:'En meget lang bådtype der tidligere kunne ombryde teksten'};
   boats.push(arrival);chosen.add(arrival.name);colours[arrival.name]='#ffdc42';render();
  });
  assert.equal(await page.locator('.visible-boat').first().getAttribute('data-boat-id'),'arrival','New boats join alphabetically');
  assert.equal(await page.locator('.visible-boat[data-boat-id="list-0"]').count(),0,'Departing boats are removed immediately');
  const names=await page.locator('.visible-boat-name').allTextContents();
  assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,'da')));
  assert.equal(await page.locator('.visible-boat').first().evaluate(node=>node.getBoundingClientRect().height),await page.locator('.visible-boat').last().evaluate(node=>node.getBoundingClientRect().height),'Long names and status text retain the same row height');
  await page.evaluate(()=>{
   boats[0].points=listOriginalPoints;chosen.delete('Albatros');boats.splice(boats.findIndex(boat=>boat.id==='arrival'),1);render();
  });
  assert.equal(await page.locator('.visible-boat').first().getAttribute('data-boat-id'),'list-0','Returning boats join alphabetically');
  // Map hover reveals a row without changing keyboard focus, map view or time.
  await page.evaluate(()=>{
   const boat=boats.find(boat=>boat.id==='list-13');
   boat.points=boats[0].points.map(point=>[12.3,55.4,point[2]]);render();$('visibleBoatsPanel').scrollTop=0;
  });
  const target=page.locator('.visible-boat[data-boat-id="list-13"]');
  const colour=await target.evaluate(node=>getComputedStyle(node).borderLeftColor);
  assert.equal(colour,'rgb(255, 220, 66)','Boat colour is visible without hover');
  const sceneBefore=await page.evaluate(()=>({view:[...view],time:currentTime(),focus:document.activeElement.id}));
  await page.locator('[data-boat-marker="list-13"] .boat-hull').hover();
  assert.equal(await target.evaluate(node=>node.classList.contains('highlighted')),true);
  assert.ok(await page.locator('#visibleBoatsPanel').evaluate(node=>node.scrollTop>0),'Map hover scrolls the list');
  const rowBounds=await target.boundingBox(),panelBounds=await page.locator('#visibleBoatsPanel').boundingBox();
  assert.ok(rowBounds.y>=panelBounds.y&&rowBounds.y+rowBounds.height<=panelBounds.y+panelBounds.height+.5);
  assert.equal(await target.evaluate(node=>getComputedStyle(node).borderLeftColor),colour,'Highlight preserves boat colour');
  assert.notEqual(await target.evaluate(node=>getComputedStyle(node).boxShadow),'none','Highlight uses a separate frame');
  assert.deepEqual(await page.evaluate(()=>({view:[...view],time:currentTime(),focus:document.activeElement.id})),sceneBefore);
  const listBottom=(await page.locator('#visibleBoats').boundingBox());
  const mapBottom=(await page.locator('#map').boundingBox());
  assert.ok(Math.abs(listBottom.y+listBottom.height-mapBottom.y-mapBottom.height)<1,'Expanded list reaches the bottom of the map');
  await page.mouse.move(1490,10);
  await page.locator('.visible-boat').first().focus();
  assert.equal(await page.locator('.boat-list-highlighted').getAttribute('data-boat-marker'),'list-0');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('.boat-list-highlighted').getAttribute('data-boat-marker'),'list-1');
  assert.equal(await page.evaluate(()=>currentTime()),testTime+30,'List keyboard navigation does not seek the map');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#visibleBoatsPanel').isVisible(),false);
  assert.equal(await page.locator('.boat-list-highlighted').count(),0);
  // A short gap holds the source position/speed; after five minutes the icon and row disappear.
  await page.evaluate(t=>{selectedTime=t+61;render();},testTime);
  await page.locator('#visibleBoatsToggle').click();
  assert.equal(await page.locator('.visible-boat').first().locator('.visible-boat-speed').textContent(),'8,0 kn');
  await page.evaluate(t=>{selectedTime=t+361;render();},testTime);
  assert.equal(await page.locator('.visible-boat').count(),0,'No departed boats remain in the list');
  assert.equal(await page.locator('#visibleBoatsEmpty').isVisible(),true);
  await page.evaluate(t=>{selectedTime=t;render();},testTime);
  assert.equal(await page.locator('.visible-boat').count(),14);
  await page.evaluate(()=>changeBoatSelection(()=>chosen.delete('Båd 01')));
  await page.waitForFunction(()=>document.querySelectorAll('.visible-boat').length===13);
  assert.equal(await page.locator('.visible-boat').count(),13,'Boat selection updates the list');
  await page.evaluate(()=>{view=[10000,10000,400,400];$('map').setAttribute('viewBox',view.join(' '));drawViewport();});
  assert.equal(await page.locator('.visible-boat').count(),0,'Viewport-only pan removes out-of-view rows');
  await page.evaluate(()=>{const [x,y]=xy([11.8,55.6]);view=[x-200,y-200,400,400];$('map').setAttribute('viewBox',view.join(' '));drawViewport();});
  await aligned();
  // Points in SVG's letterboxed gutter are visible and must appear too.
  await page.evaluate(t=>{
   const {rect,inverse}=mapViewport(),p=new DOMPoint(rect.left+3,rect.top+3).matrixTransform(inverse);
   const point=[9.5+p.x*4.5/1000,57-p.y*3/1180];
   const boat={...boats[0],id:'gutter',name:'Synlig i sidekant',points:[[...point,t-60],[...point,t+60]]};
   boats.push(boat);chosen.add(boat.name);colours[boat.name]='#ffffff';render();
  },testTime);
  assert.equal(await page.locator('[data-boat-id="gutter"].visible-boat').count(),1);
  await page.screenshot({path:path.join(os.tmpdir(),'sr2026-boat-list-'+browserType.name()+'-desktop.png')});
  await page.locator('#visibleBoatsPanel').hover();
  const before=await page.evaluate(()=>[...view]);await page.mouse.wheel(0,180);
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>[...view]),before,'Scrolling the list never zooms the map');
  assert.ok(await page.locator('#visibleBoatsPanel').evaluate(node=>node.scrollTop>0));
  await page.locator('#visibleBoatsToggle').click();
  assert.equal(await page.locator('#visibleBoatsPanel').isVisible(),false,'Clicking the bar folds the list up');
  assert.equal(await page.locator('.visible-boat').count(),0,'Collapse discards retained slots');
  await page.locator('#visibleBoatsToggle').click();
  assert.equal(await page.locator('.visible-boat.is-outside').count(),0,'Reopening starts with currently visible boats only');
  const reopenedNames=await page.locator('.visible-boat-name').allTextContents();
  assert.deepEqual(reopenedNames,[...reopenedNames].sort((a,b)=>a.localeCompare(b,'da')),'Reopening restores alphabetical order');
  const state=await page.evaluate(()=>({time:currentTime(),view:[...view]}));
  await page.evaluate(()=>{
   notes=[{time:currentTime(),text:'Bådliste',view:[...view],settings:sceneSettings()}];activePresentationNote=notes[0];showNotes();setPresentationMode(true);
  });
  await aligned();assert.equal(await page.locator('#visibleBoatsPanel').isVisible(),true);
  await page.locator('[data-boat-marker="list-13"] .boat-hull').hover();
  assert.equal(await page.locator('.visible-boat[data-boat-id="list-13"]').evaluate(node=>node.classList.contains('highlighted')),true,'Map hover also reveals the row in presentation mode');
  assert.ok(await page.evaluate(()=>Math.abs($('visibleBoats').getBoundingClientRect().bottom-$('map').getBoundingClientRect().bottom)<1));
  await page.locator('.visible-boat').first().focus();await page.keyboard.press('Escape');
  assert.equal(await page.locator('body').evaluate(node=>node.classList.contains('presenting')),true,'Escape folds the list before leaving presentation');
  assert.deepEqual(await page.evaluate(()=>({time:currentTime(),view:[...view]})),state);
  await page.locator('#visibleBoatsToggle').click();
  if(process.env.SR_FULL_TEST==='1'){
  await page.setViewportSize({width:390,height:740});await aligned();
  const mobile=await page.evaluate(()=>({right:$('visibleBoats').getBoundingClientRect().right,bottom:$('visibleBoats').getBoundingClientRect().bottom,mapBottom:$('map').getBoundingClientRect().bottom,width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(mobile.right<=mobile.width&&mobile.scroll<=mobile.width&&mobile.bottom<=mobile.mapBottom);
  await page.screenshot({path:path.join(os.tmpdir(),'sr2026-boat-list-'+browserType.name()+'-mobile.png')});
  await page.setViewportSize({width:1500,height:1000});
  }
  const imageID='11111111-1111-4111-8111-111111111111';
  await page.route('**/event-images/'+imageID+'.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
  await page.evaluate(id=>{
   notes[0].image={id,url:'event-images/'+id+'.png',name:'Foto'};updatePresentationControls();
   return showMapEventImage(notes[0].image,notes[0]);
  },imageID);
  assert.equal(await page.locator('#visibleBoats').isVisible(),false,'Photo overlays cover the list too');
  await page.locator('#mapEventImage').click();assert.equal(await page.locator('#visibleBoats').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:browserType.name(),checks:'visible boats only, alphabetical arrivals/departures, map hover reveals row, permanent boat colours, separate highlight, full map height, list hover/focus, playback, presentation, unchanged scene',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of process.env.SR_FULL_TEST==='1'?[chromium,firefox]:[firefox])await check(type);})().catch(error=>{console.error(error);process.exit(1)});
