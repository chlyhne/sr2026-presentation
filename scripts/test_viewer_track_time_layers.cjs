const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1300,height:850},acceptDownloads:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.SR_TRACK_RENDERER='webgl';});
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  const initial=await page.evaluate(()=>({gpu:webglTracks.active,error:webglTracks.error,renderer:webglTracks.renderer}));
  assert.equal(initial.gpu,true,'Exercise real WebGL depth and the software fallback: '+initial.error);
  for(const mode of ['webgl','software']){
   const result=await page.evaluate(mode=>{
    const check=(ok,message)=>{if(!ok)throw Error(mode+': '+message);};
    window.layerTestMode=mode;webglTracks.active=mode==='webgl';webglTracks.host.setAttribute('display',mode==='webgl'?'inline':'none');
    const point=(x,y,t)=>[9.5+x*4.5/1000,57-y*3/1180,D.start+t];
    const metadata=boatMetadata('Mercutio');
    const a={id:'time-a',name:'Mercutio',metadata,points:[point(580,460,100),point(620,460,200),point(580,500,500),point(620,500,600)],speeds:[12,12,12,12]};
    const b={id:'time-b',name:'Other',metadata,points:[point(600,440,250),point(600,520,450)],speeds:[2,2]};
    boats.splice(0,boats.length,a,b);chosen.clear();chosen.add(a.name);chosen.add(b.name);colours.Other='#ffffff';
    $('wind').checked=$('rain').checked=$('traffic').checked=$('military').checked=$('annotationsVisible').checked=false;
    for(const id of ['places','seamarks','boatMarkers','speedMarkers','trackSpeedLegend'])$(id).setAttribute('visibility','hidden');
    view=[570,430,60,100];$('map').setAttribute('viewBox',view.join(' '));selectedTime=D.start+650;
    const renderer=webglTracks.active?webglTracks:softwareTracks;
    const pixel=(x,y)=>{
     const viewport=mapViewport(),p=new DOMPoint(x,y).matrixTransform(viewport.matrix);
     const px=Math.floor((p.x-viewport.rect.left)*renderer.canvas.width/viewport.rect.width),py=Math.floor((p.y-viewport.rect.top)*renderer.canvas.height/viewport.rect.height);
     if(mode==='software')return [...renderer.context.getImageData(px,py,1,1).data];
     const out=new Uint8Array(4);renderer.gl.readPixels(px,renderer.canvas.height-1-py,1,1,renderer.gl.RGBA,renderer.gl.UNSIGNED_BYTE,out);return [...out];
    };
    const expected=speed=>TRACK_SPEED_COLOURS[speedBin(speed)].match(/\d+/g).map(Number);
    const matches=(actual,speed)=>actual[3]>240&&actual.slice(0,3).every((value,i)=>Math.abs(value-expected(speed)[i])<=14);
    const draw=(time,order=[a,b])=>{selectedTime=D.start+time;renderer.render(selectedTime,order,true);};
    draw(650);check(matches(pixel(600,460),2),'newer B must cover Mercutio at first crossing: '+pixel(600,460));
    check(matches(pixel(600,500),12),'newer Mercutio must cover B at second crossing: '+pixel(600,500));
    draw(650,[b,a]);check(matches(pixel(600,460),2)&&matches(pixel(600,500),12),'boat submission order changed crossing colours');
    for(const [x,y,id] of [[600,460,b.id],[600,500,a.id]]){
     const p=new DOMPoint(x,y).matrixTransform($('map').getScreenCTM());
     check(nearestTrackSpeed(p.x,p.y,undefined,true)?.boatId===id,'click must choose newest local passage');
    }
    const saved=a.points;
    a.points=[point(580,460,100),point(620,460,200),point(580,460,300),point(620,460,400)];a.speeds=[12,12,2,2];
    draw(650,[a]);check(matches(pixel(600,460),2),'self-crossing must show newest passage, not highest speed bin');
    a.points=[point(580,460,140000),point(620,460,140100)];a.speeds=[12,12];
    b.points=[point(580,460,140000.003),point(620,460,140100.003)];
    draw(140101,[b,a]);check(matches(pixel(600,460),2),'millisecond time difference lost near voyage end');
    a.points=[point(580,460,100),point(620,460,1000)];a.speeds=[12,12];
    draw(1100,[a]);check(pixel(600,460)[3]===0,'gap over five minutes must not become a line');
    a.points=saved;a.speeds=[12,12,12,12];b.points=[point(600,440,250),point(600,520,450)];
    for(const time of [650,7400,650]){draw(time);check(matches(pixel(600,460),2)&&matches(pixel(600,500),12),'clipping or reverse seek changed time ordering');}
    let uploads=0;
    if(mode==='webgl'){
     const gl=renderer.gl,original=gl.bufferData.bind(gl);gl.bufferData=(...args)=>{uploads++;return original(...args);};
     try{for(const time of [651,700,650])draw(time);}finally{gl.bufferData=original;}
     check(uploads===0,'playback uploaded new geometry');
    }
    render();renderer.render(selectedTime,[a,b],true);
    window.layerExpected={first:expected(2),second:expected(12)};
    return {mode,crossings:[pixel(600,460),pixel(600,500)],uploads};
   },mode);
   const download=page.waitForEvent('download');await page.evaluate(()=>captureMap());
   const file=await(await download).path(),base64=fs.readFileSync(file).toString('base64');
   const exported=await page.evaluate(async base64=>{
    const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);
    const viewport=mapViewport();
    return [[600,460],[600,500]].map(([x,y])=>{
     const p=new DOMPoint(x,y).matrixTransform(viewport.matrix);
     return [...context.getImageData(Math.floor((p.x-viewport.rect.left)*canvas.width/viewport.rect.width),Math.floor((p.y-viewport.rect.top)*canvas.height/viewport.rect.height),1,1).data];
    });
   },base64);
   const expected=await page.evaluate(()=>layerExpected);
   for(const [i,colour] of [expected.first,expected.second].entries())assert.ok(exported[i].slice(0,3).every((value,j)=>Math.abs(value-colour[j])<=20),'PNG must preserve temporal ordering: '+JSON.stringify({mode,exported,expected}));
   console.log(JSON.stringify({...result,png:true}));
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',checks:'local timestamps, two opposite crossings, boat-order independence, self-crossing, millisecond precision, gaps, time-window clipping, reverse seek, click selection, immutable GPU buffers, PNG, both rendering paths',errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
