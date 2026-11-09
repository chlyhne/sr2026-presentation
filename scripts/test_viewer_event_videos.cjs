const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true}),errors=[],embeds=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#254254"/></svg>'}));
  await page.route('https://www.youtube-nocookie.com/embed/**',route=>{
   embeds.push({url:route.request().url(),referer:route.request().headers().referer});
   return route.fulfill({contentType:'text/html',body:'<!doctype html><body style="background:black;color:white"><button>YouTube-afspiller (test)</button></body>'});
  });
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  const parsed=await page.evaluate(()=>{
   const urls=['https://www.youtube.com/watch?v=M7lc1UVf-VE','https://youtu.be/M7lc1UVf-VE?t=1m30s',
    'https://m.youtube.com/shorts/M7lc1UVf-VE','https://www.youtube.com/live/M7lc1UVf-VE',
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?start=42','youtube.com/watch?v=M7lc1UVf-VE#t=12'];
   const invalid=['https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','javascript:alert(1)',
    '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>','https://example.com/M7lc1UVf-VE',
    'https://youtu.be/invalid','https://youtube.com/playlist?list=123','https://youtube.com@evil.test/watch?v=M7lc1UVf-VE'];
   return {valid:urls.map(parseYouTubeVideo),invalid:invalid.map(url=>{try{parseYouTubeVideo(url);return false;}catch{return true;}})};
  });
  assert.deepEqual(parsed.valid.map(v=>v.id),Array(6).fill('M7lc1UVf-VE'));
  assert.deepEqual(parsed.valid.map(v=>v.start),[0,90,0,0,42,12]);assert.ok(parsed.invalid.every(Boolean));
  await page.evaluate(()=>{
   const settings={...sceneSettings(),wind:false,rain:false,boats:['Mercutio']};
   localStorage.setItem('sr2026-notes',JSON.stringify([{time:D.start+3600,text:'Eksisterende event',view:[230,250,620,760],settings}]));
  });
  await page.reload();await page.waitForFunction(()=>notes.length===1);
  const existing=await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))[0]);
  await page.evaluate(()=>{selectedTime=D.start+7200;render();});
  await page.locator('#noteVideo').fill('https://example.com/not-youtube');
  await page.locator('#save').click();
  assert.equal(await page.evaluate(()=>notes.length),1);assert.equal(await page.locator('#noteVideo').getAttribute('aria-invalid'),'true');
  await page.locator('#noteVideo').fill('https://youtu.be/M7lc1UVf-VE?t=1m30s');
  await page.locator('#note').fill('Kladde til video');
  assert.equal(await page.locator('#eventText').textContent(),'Kladde til video');
  assert.equal(await page.locator('#eventVideoFigure').isVisible(),true);
  assert.equal(await page.locator('#eventCounter').textContent(),'Nyt event');
  assert.equal(await page.locator('#save').textContent(),'Gem event');
  await page.locator('#startPresentation').click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),false,'Unsaved video cannot be discarded by navigation');
  await page.locator('#eventText').click();await page.locator('#eventTextEditor').fill('En video fra turen');
  await page.keyboard.press('Control+Enter');
  assert.equal(await page.locator('#note').inputValue(),'En video fra turen');
  await page.locator('#note').fill('');await page.locator('#save').click();
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  assert.equal(stored.length,2);assert.deepEqual(stored[0],existing);assert.equal(stored[1].text,'');
  assert.deepEqual(stored[1].video,parsed.valid[1]);
  assert.equal(await page.locator('#noteVideo').inputValue(),'');
  assert.match(await page.locator('.note-jump').nth(1).textContent(),/YouTube-video/);
  assert.equal(embeds.length,0,'Saving a video does not load or play it');
  await page.reload();await page.waitForFunction(()=>notes.length===2);
  await page.locator('.note-jump').nth(1).click();
  assert.equal(await page.locator('#eventVideoFigure').isVisible(),true);
  assert.equal(await page.locator('#eventVideoOverlay').isVisible(),false);
  const snapshot=()=>page.evaluate(()=>({time:currentTime(),view:[...view],boats:[...chosen],saved:localStorage.getItem('sr2026-notes')}));
  const before=await snapshot();
  async function openVideo(){
   await page.locator('#eventVideoButton').click();
   await page.waitForFunction(()=>!$('eventVideoOverlay').hidden&&$('eventVideoPlayer').querySelector('iframe'));
   await page.waitForFunction(()=>document.fullscreenElement===null||document.fullscreenElement===$('eventVideoOverlay')||document.fullscreenElement===document.documentElement);
   assert.equal(await page.evaluate(()=>!!interval),false);
   const overlay=await page.locator('#eventVideoOverlay').boundingBox();
   const size=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
   assert.ok(overlay.x===0&&overlay.y===0&&Math.abs(overlay.width-size.width)<2&&Math.abs(overlay.height-size.height)<2,'Video covers the entire viewport');
   assert.equal(await page.locator('#eventVideoPlayer iframe').getAttribute('allowfullscreen'),'');
   assert.equal(await page.locator('#eventVideoPlayer iframe').getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');
   const url=new URL(await page.locator('#eventVideoPlayer iframe').getAttribute('src'));
   assert.equal(url.hostname,'www.youtube-nocookie.com');assert.equal(url.pathname,'/embed/M7lc1UVf-VE');
   assert.equal(url.searchParams.get('autoplay'),'1');assert.equal(url.searchParams.get('start'),'90');
  }
  await openVideo();
  await page.screenshot({path:'/tmp/sr2026-youtube-'+type.name()+'.png'});
  await page.locator('#closeEventVideo').click();
  await page.waitForFunction(()=>!document.fullscreenElement);
  assert.equal(await page.locator('#eventVideoPlayer iframe').count(),0,'Closing unloads player and stops audio');
  assert.deepEqual(await snapshot(),before,'Closing preserves map, time, boats and saved events');
  await openVideo();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>$('eventVideoOverlay').hidden&&!document.fullscreenElement);
  assert.deepEqual(await snapshot(),before);
  await openVideo();
  await page.evaluate(()=>$('eventVideoPlayer').querySelector('iframe').requestFullscreen());
  assert.equal(await page.locator('#eventVideoOverlay').isVisible(),true,'Fullscreen inside the player must not tear down the video');
  assert.equal(await page.locator('#eventVideoPlayer iframe').count(),1);
  await page.evaluate(()=>document.exitFullscreen());
  await page.evaluate(()=>hideEventVideo());
  await page.waitForFunction(()=>!document.fullscreenElement);
  await openVideo();await page.evaluate(()=>seekTimeline(offsetAtTime(notes[1].time)));
  await page.waitForFunction(()=>$('eventVideoOverlay').hidden&&!document.fullscreenElement);
  assert.equal(await page.locator('#eventVideoPlayer iframe').count(),0,'Timeline input unloads the video and never opens it on snap');
  // Inline edits preserve the video, including clearing all text again.
  await page.locator('#eventText').click();await page.locator('#eventTextEditor').fill('Beskrivelse');await page.keyboard.press('Control+Enter');
  await page.locator('#eventText').click();await page.locator('#eventTextEditor').fill('');await page.keyboard.press('Control+Enter');
  assert.deepEqual((await page.evaluate(()=>notes[1])).video,stored[1].video);
  await page.locator('.note-edit').nth(1).click();
  assert.equal(await page.locator('#noteVideo').inputValue(),stored[1].video.url);
  await page.locator('#removeNoteVideo').click();assert.equal(await page.locator('#eventVideoFigure').isVisible(),false);
  await page.locator('#cancelEdit').click();assert.equal(await page.locator('#eventVideoFigure').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))),stored);
  await page.locator('.note-edit').nth(1).click();await page.locator('#note').fill('Video med tekst');
  await page.locator('#save').click();stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  assert.deepEqual(stored[1].video,parsed.valid[1]);
  await page.locator('#startPresentation').click();
  assert.equal(await page.locator('#eventVideoFigure').isVisible(),true);
  const numberOfEmbeds=embeds.length;
  await page.locator('#previousEvent').click();assert.equal(await page.locator('#eventVideoFigure').isVisible(),false);
  await page.locator('#nextEvent').click();
  if(await page.evaluate(()=>!!eventPlaybackTarget))await page.locator('#nextEvent').click();
  assert.equal(await page.locator('#eventVideoFigure').isVisible(),true);
  assert.equal(embeds.length,numberOfEmbeds,'Event navigation never starts video automatically');
  await openVideo();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>$('eventVideoOverlay').hidden&&!document.fullscreenElement);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),true,'Escape closes video before ending presentation');
  // A presentation that already owns fullscreen keeps it when the video closes.
  await page.evaluate(()=>document.documentElement.requestFullscreen());
  await openVideo();await page.locator('#closeEventVideo').click();
  assert.equal(await page.evaluate(()=>document.fullscreenElement===document.documentElement),true);
  await page.evaluate(()=>document.exitFullscreen());
  // Fullscreen rejection must be explicit, with no alternate player.
  await page.evaluate(()=>{$('eventVideoOverlay').requestFullscreen=()=>Promise.reject(new Error('test denied'));});
  await page.locator('#eventVideoButton').click();
  await page.waitForFunction(()=>$('eventVideoStatus').textContent.includes('test denied'));
  assert.equal(await page.locator('#eventVideoOverlay').isVisible(),false);
  assert.equal(await page.locator('#eventVideoPlayer iframe').count(),0);
  const download=page.waitForEvent('download');await page.evaluate(()=>exportEventNotes());
  const exported=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));
  assert.deepEqual(exported.notes,stored,'Export keeps the video link and start offset');
  await page.locator('#endPresentation').click();await page.locator('.note-edit').nth(1).click();
  await page.locator('#removeNoteVideo').click();await page.locator('#save').click();
  assert.equal(await page.locator('#eventVideoFigure').isVisible(),false);
  assert.equal(await page.evaluate(()=>notes[1].video),null);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'YouTube link formats and validation, video-only event, draft preview, reload, inline text, edit/cancel/remove, fullscreen player on click, browser fullscreen ownership, Escape, player teardown, no autoplay on navigation, explicit fullscreen failure, JSON export',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(error=>{console.error(error);process.exit(1)});
