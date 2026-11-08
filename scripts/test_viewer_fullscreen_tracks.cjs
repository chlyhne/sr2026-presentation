const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
const presentation=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../presentation/presentation.json'),'utf8'));
async function check(type){
 const browser=await type.launch({headless:process.env.SR_HEADLESS==='1'});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.SR_TRACK_RENDERER='webgl');
  await page.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={local:false,admin:false};'}));
  await page.route('**/presentation.json',r=>r.fulfill({json:presentation}));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForSelector('#onlineStatus',{state:'attached'});
  let samples=0;
  for(const fullscreen of [false,true,false]){
   if(fullscreen)await page.locator('#presentationFullscreen').click();
   else await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});
   await page.waitForFunction(fullscreen=>!!document.fullscreenElement===fullscreen,fullscreen);
   const result=await page.evaluate(async()=>{
    let samples=0;
    for(let i=0;i<notes.length;i++){
     showPresentationEvent(i);hideMapEventImage();hideEventVideo();
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     const check=(ok,message)=>{if(!ok)throw Error('Event '+i+': '+message);};
     check(webglTracks.active,'GPU renderer stopped: '+webglTracks.error);
     const {matrix,rect}=mapViewport(),gl=webglTracks.gl,host=webglTracks.host.getBoundingClientRect();
     check(['left','top','right','bottom'].every(k=>Math.abs(rect[k]-host[k])<.1),'Track clipping disagrees with map viewport');
     check(webglBackground.active,'Background renderer stopped: '+webglBackground.error);
     const background=webglBackground.host.getBoundingClientRect();
     check(['left','top','right','bottom'].every(k=>Math.abs(rect[k]-background[k])<.1),'Background clipping disagrees with map viewport');
     check(webglBackground.gl.getError()===0,'Background WebGL error');
     for(const text of $('map').querySelectorAll('#places text,.boat-name')){
      const transform=text.getScreenCTM(),pixels=parseFloat(getComputedStyle(text).fontSize)*Math.hypot(transform.a,transform.b);
      check(pixels>=10&&pixels<=13,'Map text size changed to '+pixels+' px');
     }
     webglTracks.render(currentTime(),webglTracks.order,true);
     for(const boat of webglTracks.order){
      const point=boat.points.find(p=>{
       if(p[2]<currentTime()-7199||p[2]>=currentTime())return false;
       const screen=new DOMPoint(...xy(p)).matrixTransform(matrix);
       return screen.x>rect.left+10&&screen.x<rect.right-10&&screen.y>rect.top+10&&screen.y<rect.bottom-10;
      });
      if(!point)continue;
      const screen=new DOMPoint(...xy(point)).matrixTransform(matrix),pixel=new Uint8Array(4);
      gl.readPixels(Math.floor((screen.x-rect.left)/rect.width*gl.drawingBufferWidth),gl.drawingBufferHeight-1-Math.floor((screen.y-rect.top)/rect.height*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      check(pixel[3]>0,'Visible source position has no rendered track');samples++;
     }
     check(gl.getError()===0,'WebGL error');
    }
    return samples;
   });samples+=result;
  }
  assert.ok(samples>0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),events:presentation.notes.length,states:3,trackPixelSamples:samples,checks:'published events, original close zooms, presentation/fullscreen enter/exit, HiDPI, map text size, shared clipping, actual track pixels',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
