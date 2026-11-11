const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1300,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const initial=await page.evaluate(()=>({gpu:webglTracks.active,error:webglTracks.error,renderer:webglTracks.renderer}));
  assert.equal(initial.gpu,true,'Exercise nominal WebGL depth: '+initial.error);
  for(const mode of ['webgl']){
   const result=await page.evaluate(mode=>{
    const check=(ok,message)=>{if(!ok)throw Error(mode+': '+message);};
    const point=(x,y,t)=>[9.5+x*4.5/1000,57-y*3/1180,D.start+t];
    const metadata=boatMetadata('Mercutio');
    const a={id:'time-a',name:'Mercutio',metadata,points:[point(580,460,100),point(620,460,200),point(580,500,500),point(620,500,600)],speeds:[12,12,12,12]};
    const b={id:'time-b',name:'Other',metadata,points:[point(600,440,250),point(600,520,450)],speeds:[2,2]};
    boats.splice(0,boats.length,a,b);chosen.clear();chosen.add(a.name);chosen.add(b.name);colours.Other='#ffffff';
    referenceBoatId=a.id;
    $('wind').checked=$('rain').checked=$('traffic').checked=$('military').checked=$('annotationsVisible').checked=false;
    for(const id of ['places','seamarks','boatMarkers','speedMarkers','trackSpeedLegend'])$(id).setAttribute('visibility','hidden');
    view=[570,430,60,100];$('map').setAttribute('viewBox',view.join(' '));selectedTime=D.start+650;
    const renderer=webglTracks;
    const pixel=(x,y)=>{
     const viewport=mapViewport(),p=new DOMPoint(x,y).matrixTransform(viewport.matrix);
     const px=Math.floor((p.x-viewport.rect.left)*renderer.canvas.width/viewport.rect.width),py=Math.floor((p.y-viewport.rect.top)*renderer.canvas.height/viewport.rect.height);
     const out=new Uint8Array(4);renderer.gl.readPixels(px,renderer.canvas.height-1-py,1,1,renderer.gl.RGBA,renderer.gl.UNSIGNED_BYTE,out);return [...out];
    };
    const expected=speed=>TRACK_SPEED_COLOURS[speedBin(speed)].match(/\d+/g).map(Number);
    const matches=(actual,speed)=>actual[3]>240&&actual.slice(0,3).every((value,i)=>Math.abs(value-expected(speed)[i])<=14);
    const draw=(time,order=[a,b])=>{
     for(const boat of order)if(!trackProfileCache.has(boat.points))trackProfileCache.set(boat.points,{
      samples:prepareProjectedTrack(boat),stations:prepareReferenceProfile(boat),...prepareTimeProfiles(boat)
     });
     selectedTime=D.start+time;renderer.render(selectedTime,order,true);
    };
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
    return {mode,crossings:[pixel(600,460),pixel(600,500)],uploads};
   },mode);
   console.log(JSON.stringify(result));
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',checks:'local timestamps, two opposite crossings, boat-order independence, self-crossing, millisecond precision, gaps, time-window clipping, reverse seek, click selection, immutable GPU buffers',errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
