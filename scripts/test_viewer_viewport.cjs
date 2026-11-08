const assert=require('node:assert/strict'),path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},deviceScaleFactor:2}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.SR_TRACK_RENDERER='webgl');
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForFunction(()=>typeof captureMap==='function');
  async function edges(reduced=false){return page.evaluate(reduced=>{
   const check=(v,message)=>{if(!v)throw Error(message);};
   check(webglTracks.active,'GPU must be active');
   const boat=boats.find(b=>b.name==='Mercutio'),map=$('map'),rect=map.getBoundingClientRect(),inverse=map.getScreenCTM().inverse();
   const w=rect.width,h=rect.height;
   const lines=[[[w*.1,8],[w*.9,8]],[[w*.1,h-8],[w*.9,h-8]],[[8,h*.1],[8,h*.9]],[[w-8,h*.1],[w-8,h*.9]]];
   boat.points=lines.flatMap((line,i)=>line.map(([x,y],j)=>{
    const p=new DOMPoint(rect.left+x,rect.top+y).matrixTransform(inverse);
    return [9.5+p.x*4.5/1000,57-p.y*3/1180,D.start+100+i*500+j*60];
   }));boat.speeds=boat.points.map(()=>7.5);
   chosen.clear();chosen.add(boat.name);$('wind').checked=$('rain').checked=false;selectedTime=D.start+2000;render();
   const viewport=mapViewport(),gl=webglTracks.gl;
   check(webglTracks.viewport===viewport&&visibleMapBounds()===viewport.bounds,'Layers do not share the viewport snapshot');
   const canvasRect=webglTracks.canvas.getBoundingClientRect();
   for(const name of ['left','top','right','bottom'])check(Math.abs(canvasRect[name]-rect[name])<.1,'Canvas boundary mismatch: '+name);
   const expected=TRACK_SPEED_COLOURS[speedBin(7.5)].match(/\d+/g).map(Number);
   webglTracks.render(selectedTime,webglTracks.order,true);
   const actual=[];
   for(const line of lines){
    const x=(line[0][0]+line[1][0])/2,y=(line[0][1]+line[1][1])/2,pixel=new Uint8Array(4);
    gl.readPixels(Math.floor(x/w*gl.drawingBufferWidth),gl.drawingBufferHeight-1-Math.floor(y/h*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    check(pixel[3]>0,'Visible track clipped at an interior map edge: '+JSON.stringify({line,pixel:[...pixel],reduced}));
    if(!reduced)check(expected.every((v,i)=>Math.abs(pixel[i]-v)<8),'Track projection does not match SVG projection: '+[...pixel]);
    actual.push([...pixel]);
   }
   check([...gl.getParameter(gl.VIEWPORT)].join(',')===[0,0,gl.drawingBufferWidth,gl.drawingBufferHeight].join(','),'Viewport does not cover actual framebuffer');
   check(gl.getError()===0,'GPU error');return {width:w,height:h,reduced,pixels:actual};
  },reduced);}
  const result=[await edges()];
  await page.locator('#startPresentation').click();await page.setViewportSize({width:1920,height:1080});
  await page.waitForFunction(()=>mapViewportRefresh===null&&webglTracks.viewport===mapViewport());result.push(await edges());
  await page.setViewportSize({width:2560,height:1440});
  await page.locator('#presentationFullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.waitForFunction(()=>mapViewportRefresh===null&&webglTracks.viewport===mapViewport());result.push(await edges());
  await page.locator('#presentationFullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
  await page.waitForTimeout(150);
  await page.setViewportSize({width:900,height:1400});
  await page.waitForFunction(()=>mapViewportRefresh===null&&webglTracks.viewport===mapViewport());result.push(await edges());
  // Simulate a browser allocating fewer framebuffer pixels than requested.
  // CSS/SVG boundaries must stay fixed while the render resolution changes.
  await page.evaluate(()=>{
   const canvas=webglTracks.canvas;
   for(const name of ['width','height']){
    const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,name),limit=Math.floor(canvas[name]/2);
    Object.defineProperty(canvas,name,{configurable:true,get(){return descriptor.get.call(this);},set(v){descriptor.set.call(this,Math.min(v,limit));}});
   }
   webglTracks.viewportKey=null;webglTracks.lastKey=null;
  });
  result.push(await edges(true));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:type.name(),checks:'shared viewport, all four rendered edges, editor/presentation, real fullscreen enter/exit, wide/tall letterboxing, HiDPI, reduced framebuffer',sizes:result.map(({width,height,reduced})=>({width,height,reduced})),errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
