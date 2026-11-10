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
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>{
   $('wind').checked=$('rain').checked=false;
   notes=[{time:D.start+7200,text:'Paneltest',view:[230,250,620,760],settings:sceneSettings()},
    {time:D.start+7500,text:'Næste event',view:[230,250,620,760],settings:sceneSettings()}];
   persistNotes(notes);showNotes();restoreNote(notes[0]);
   window.savedTrackBuffers=[...webglTracks.buffers];window.savedUploads=webglTracks.uploads;
  });
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await settle();
  const snapshot=()=>page.evaluate(()=>{
   const vp=mapViewport(),[x,y,w,h]=vp.viewBox,rect=id=>{const r=$(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};};
   return {centre:[x+w/2,y+h/2],scale:Math.hypot(vp.matrix.a,vp.matrix.b),time:currentTime(),
    map:rect('map'),timeline:rect('editingTimeline'),tools:rect('mapTools'),tab:rect('eventPanelToggle'),
    chosen:[...chosen],note:notes.indexOf(activePresentationNote),rate:playbackRate};
  });
  function sameCamera(a,b){
   a.centre.forEach((v,i)=>assert.ok(Math.abs(v-b.centre[i])<1e-3,'Geographic centre preserved'));
   assert.ok(Math.abs(a.scale-b.scale)<1e-6,'Zoom preserved');assert.equal(a.time,b.time);
   for(const key of ['chosen','note','rate'])assert.deepEqual(a[key],b[key]);
  }
  async function aligned(){
   const s=await snapshot();
   assert.ok(Math.abs(s.tab.right-s.map.right)<1,'Book tab follows map edge');
   assert.ok(Math.abs(s.tools.right-(s.map.right-12))<1,'Track/route/layer buttons follow map edge');
   assert.ok(Math.abs(s.timeline.width-s.map.width)<1,'Timeline follows map width');
   assert.equal(await page.evaluate(()=>{
    const vp=mapViewport();
    return webglBackground.canvas.width===vp.pixelWidth&&webglBackground.canvas.height===vp.pixelHeight
     &&webglTracks.canvas.width===vp.pixelWidth*2&&webglTracks.canvas.height===vp.pixelHeight*2
     &&savedUploads===webglTracks.uploads&&savedTrackBuffers.every(([key,value])=>webglTracks.buffers.get(key)===value)&&!hasRenderingFailure();
   }),true,'WebGL resizes without preparing fixed geometry again');
  }
  const initial=await snapshot();await aligned();
  await page.locator('#eventPanelToggle').focus();await page.keyboard.press('Enter');await settle();
  const collapsed=await snapshot();sameCamera(initial,collapsed);
  assert.ok(collapsed.map.width>initial.map.width+250);
  assert.equal(await page.locator('#eventPanelToggle').getAttribute('aria-expanded'),'false');
  for(const id of ['eventPanel','presentationFooter'])assert.equal(await page.locator('#'+id).isVisible(),false);
  await aligned();await page.screenshot({path:'/tmp/sr2026-panel-collapsed-firefox.png'});
  for(const id of ['mapTracksToggle','mapLayersToggle']){
   await page.locator('#'+id).click();assert.equal(await page.locator('#'+id).getAttribute('aria-expanded'), 'true');
   await page.locator('#'+id).click();
  }
  await page.locator('#mapMeasureToggle').click();assert.equal(await page.locator('#mapMeasureToggle').getAttribute('aria-pressed'),'true');
  await page.locator('#mapMeasureToggle').click();
  for(let i=0;i<3;i++){
   await page.locator('#eventPanelToggle').click();await settle();sameCamera(initial,await snapshot());await aligned();
  }
  assert.equal(await page.locator('#eventPanel').isVisible(),true);
  await page.screenshot({path:'/tmp/sr2026-panel-expanded-firefox.png'});
  // Valid edits save before collapsing; an invalid edit remains visible for correction.
  await page.locator('#eventText').click();await page.locator('#eventTextEditor').fill('Gem før kollaps');
  await page.locator('#eventPanelToggle').click();await settle();
  assert.equal(await page.evaluate(()=>notes[0].text),'Gem før kollaps');
  await page.locator('#eventPanelToggle').click();await settle();
  await page.locator('#eventText').click();await page.locator('#eventTextEditor').fill('');
  await page.evaluate(()=>setEventPanelExpanded(false));
  assert.equal(await page.locator('#eventTextEditor').isVisible(),true);
  assert.equal(await page.locator('#eventPanelToggle').getAttribute('aria-expanded'),'true');
  await page.locator('#eventTextEditor').press('Escape');
  await page.locator('#eventText').click();await page.locator('#eventTextEditor').fill('Gemning fejler');
  await page.evaluate(()=>{
   window.originalPanelStorage=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){if(key==='sr2026-notes')throw Error('quota');return originalPanelStorage.call(this,key,value);};
   setEventPanelExpanded(false);
  });
  assert.equal(await page.locator('#eventTextEditor').isVisible(),true);
  assert.match(await page.locator('#inlineTextStatus').textContent(),/kunne ikke gemmes/);
  await page.evaluate(()=>{Storage.prototype.setItem=originalPanelStorage;});await page.locator('#eventTextEditor').press('Escape');
  // An event image occupies the same resized map cell; the tab stays above it.
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=16;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#6599c2';ctx.fillRect(0,0,16,16);
   $('mapEventImageContent').src=canvas.toDataURL();$('mapEventImageContent').hidden=false;$('mapEventImage').hidden=false;
  });
  await page.locator('#eventPanelToggle').click();await settle();
  assert.equal(await page.evaluate(()=>{
   const image=$('mapEventImage').getBoundingClientRect(),map=$('map').getBoundingClientRect();
   return Math.abs(image.width-map.width)<1&&Math.abs(image.height-map.height)<1;
  }),true);
  await page.locator('#eventPanelToggle').click();await settle();await page.locator('#mapEventImage').click();
  // Enter in the search toggles every currently listed checkbox, including mixed selections.
  await page.locator('#visibleBoatsToggle').click();await page.locator('#boatSearchInput').fill('a');await settle();
  const matches=await page.evaluate(()=>visibleBoatEntries.map(entry=>entry.boat.name));assert.ok(matches.length>2);
  await page.evaluate(matches=>{
   window.outsideSearch=boats.find(boat=>!matches.includes(boat.name)).name;
   chosen.clear();chosen.add(matches[0]);chosen.add(outsideSearch);syncBoatChoices();render();
   window.beforeSearchToggle={chosen:[...chosen],time:currentTime(),view:[...view]};
  },matches);
  await page.locator('#boatSearchInput').press('Enter');await settle();
  const outside=await page.evaluate(()=>outsideSearch);
  assert.deepEqual(await page.evaluate(()=>[...chosen].sort()),[...matches.slice(1),outside].sort());
  assert.equal(await page.locator('#boatSearchInput').inputValue(),'a');
  assert.equal(await page.evaluate(()=>currentTime()===beforeSearchToggle.time&&JSON.stringify(view)===JSON.stringify(beforeSearchToggle.view)),true);
  await page.locator('#boatSearchInput').press('Enter');await settle();
  assert.deepEqual(await page.evaluate(()=>[...chosen].sort()),[matches[0],outside].sort());
  await page.locator('#boatSearchInput').fill('zz-no-matches');await settle();
  await page.locator('#boatSearchInput').press('Enter');assert.deepEqual(await page.evaluate(()=>[...chosen].sort()),[matches[0],outside].sort());
  await page.locator('#boatSearchClear').click();await page.locator('#visibleBoatsToggle').click();
  // Collapse persists through presentation mode and event navigation; playback keeps running.
  await page.locator('#eventPanelToggle').click();await settle();await page.locator('#startPresentation').click();await settle();
  assert.equal(await page.locator('#eventPanel').isVisible(),false);await aligned();
  await page.locator('#nextEvent').click();
  if(await page.evaluate(()=>!!eventPlaybackTarget))await page.locator('#nextEvent').click();
  assert.equal(await page.evaluate(()=>activePresentationNote===notes[1]),true);
  assert.equal(await page.locator('#eventPanel').isVisible(),false);
  await page.locator('#play').click();
  const playing=await page.evaluate(()=>({time:currentTime(),rate:playbackRate}));
  await page.locator('#eventPanelToggle').click();await settle();
  assert.equal(await page.evaluate(()=>!!interval),true);assert.equal(await page.evaluate(()=>playbackRate),playing.rate);
  assert.ok(await page.evaluate(()=>currentTime())>=playing.time);
  await page.locator('#play').click();await aligned();
  await page.setViewportSize({width:1250,height:900});await settle();await aligned();
  const resized=await snapshot();await page.locator('#eventPanelToggle').click();await settle();sameCamera(resized,await snapshot());await aligned();
  assert.deepEqual(errors,[]);
  console.log('Firefox desktop: panel/tab, camera, timeline, WebGL caches, toolbar menus, inline edits, search Enter, events, playback and desktop resizing passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
