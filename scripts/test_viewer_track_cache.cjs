const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));

(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:760}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await require('./viewer-track-fixtures.cjs')(page);
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18453/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const result=await page.evaluate(()=>{
   stopPlayback();
   const renderer=webglTracks,gl=renderer.gl,cache=renderer.cache;
   if(!renderer.active||!cache)throw Error('Nominal cached WebGL renderer unavailable: '+renderer.error);
   const failures=[],checks=[],metrics=[],reuseChecks=[];
   const check=(condition,message)=>{if(!condition)throw Error(message);};
   let currentTest='';
   const test=(name,body)=>{
    currentTest=name;const count=failures.length;
    try{body();if(failures.length===count)checks.push(name);}catch(error){failures.push({name,error:error.message});}
    finally{
     const error=gl.getError();if(error!==gl.NO_ERROR)failures.push({name,error:'WebGL error '+error});
     setView();
    }
   };
   const point=(x,y,t)=>[9.5+x*4.5/1000,57-y*3/1180,D.start+t];
   let serial=0;
   const fixture=(name,position,{start=1000,step=10,speed=8,count=193,time}={})=>{
    const points=Array.from({length:count},(_,i)=>point(...position(i),time?time(i):start+i*step));
    return {...boats[0],id:'cache-'+(++serial),name,points,speeds:points.map((_,i)=>typeof speed==='function'?speed(i):speed),handicapSecondsPerNm:580.6};
   };
   const setView=(next=[570,430,100,100])=>{view=[...next];$('map').setAttribute('viewBox',view.join(' '));};
   const style=mode=>{comparison={enabled:!['boat','speed'].includes(mode),boatColour:mode==='boat',basis:['absolute','handicap','time'].includes(mode)?mode:'absolute'};};
   const setup=(fleet,mode='boat')=>{
    boats.splice(0,boats.length,...fleet);chosen.clear();fleet.forEach(boat=>chosen.add(boat.name));
    referenceBoatId=fleet[0].id;handicapTracksEnabled=false;trackLengthSeconds=0;style(mode);setView();
    for(const [i,boat] of fleet.entries()){
     const colour=i?'#20d0ff':'#ffb020';colours[boat.name]=colour;
     renderer.boatColours.set(colour,new Float32Array(i?[32/255,208/255,1]:[1,176/255,32/255]));
     prepareTrackFixture(boat);renderer.prepare(boat);
    }
    renderer.prepareComparison();cache.reset();
   };
   const stats=()=>({...cache.stats});
   const delta=(before,after)=>Object.fromEntries(Object.keys(after).map(key=>[key,after[key]-before[key]]));
   const read=()=>{
    const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
   };
   const at=(image,x,y)=>{
    const viewport=mapViewport(),p=new DOMPoint(x,y).matrixTransform(viewport.matrix);
    const px=Math.floor((p.x-viewport.rect.left)*gl.drawingBufferWidth/viewport.rect.width);
    const py=gl.drawingBufferHeight-1-Math.floor((p.y-viewport.rect.top)*gl.drawingBufferHeight/viewport.rect.height);
    return [...image.subarray((py*gl.drawingBufferWidth+px)*4,(py*gl.drawingBufferWidth+px)*4+4)];
   };
   const colour=(image,x,y,expected,label)=>{
    const actual=at(image,x,y);check(actual.length===4&&actual.every((v,i)=>Math.abs(v-expected[i])<=18),label+': '+JSON.stringify({actual,expected,x,y}));
   };
   const draw=(time,order=boats,windows)=>{
    const states=[],original=cache.add,before=stats();
    cache.add=function(state){
     if(windows?.has(state.boat)){
      const window=windows.get(state.boat),points=state.boat.points;
      state={...state,window,first:Math.max(0,timeBoundary(points,window.from)-1),last:timeBoundary(points,window.to,true)};
     }
     states.push(state);return original.call(this,state);
    };
    try{check(renderer.render(D.start+time,order,true),'render failed: '+renderer.error);}finally{cache.add=original;}
    const after=stats(),image=read(),dynamic=cache.groups.flatMap(group=>group.dynamic).reduce((sum,state)=>sum+state.last-state.first,0);
    check(after.frames-before.frames===1,'One forced draw must produce exactly one cache frame');
    return {image,states,delta:delta(before,after),dynamic};
   };
   const oracle=states=>{
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
    gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const viewport=mapViewport();
    for(const reference of [true,false]){
     for(const state of states)if(state.isReference===reference)renderer.drawRange(state,viewport,true);
     gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    gl.flush();return read();
   };
   const compare=(frame,label)=>{
    const expected=oracle(frame.states),actual=frame.image,width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
    let interior=0,badInterior=0,missing=0,extra=0,covered=0;const examples=[];
    const nearby=(image,x,y)=>{
     for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(image[((y+dy)*width+x+dx)*4+3]>3)return true;
     return false;
    };
    for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
     const offset=(y*width+x)*4,a=actual[offset+3],e=expected[offset+3];
     if(e>3){covered++;if(!nearby(actual,x,y))missing++;}
     if(a>3&&!nearby(expected,x,y))extra++;
     if(e<32)continue;
     let stable=true;
     for(let dy=-1;dy<=1&&stable;dy++)for(let dx=-1;dx<=1;dx++){
      const neighbour=((y+dy)*width+x+dx)*4;
      if([0,1,2,3].some(c=>Math.abs(expected[neighbour+c]-expected[offset+c])>6)){stable=false;break;}
     }
     if(stable){
      interior++;
      if([0,1,2,3].some(c=>Math.abs(actual[offset+c]-expected[offset+c])>28)){
       badInterior++;if(examples.length<3)examples.push({x,y,actual:[...actual.subarray(offset,offset+4)],expected:[...expected.subarray(offset,offset+4)]});
      }
     }
    }
    const report={label,interior,badInterior,missing,extra,covered,examples};metrics.push(report);
    check(covered>100&&interior>20,'Oracle did not exercise visible track interiors: '+JSON.stringify(report));
    if(badInterior>Math.max(3,interior*.002)||missing!==0||extra!==0)failures.push({name:currentTest,error:'Pixel mismatch: '+JSON.stringify(report)});
    check(gl.getError()===gl.NO_ERROR,'WebGL error after '+label);
   };
   const reuse=(frame,label)=>{
    check(frame.delta.builds===0&&frame.delta.hits>0,label+': expected retained raster blocks, '+JSON.stringify(frame.delta));
    check(frame.delta.geometryInstances===frame.dynamic,label+': geometry outside boundary ranges, '+JSON.stringify({delta:frame.delta,dynamic:frame.dynamic}));
    check(frame.dynamic<=frame.states.length*64,label+': more than two partial chunks per boat: '+frame.dynamic);
    reuseChecks.push({label,delta:frame.delta,dynamic:frame.dynamic});
   };

   const route=buildRhumbRoute([point(580,460,0).slice(0,2),point(660,460,0).slice(0,2)]);
   rhumbRoute.legs=route.legs;rhumbRoute.total=route.total;
   const a=fixture('Cache horizontal',i=>[580+i*80/192,460]);
   const b=fixture('Cache vertical',i=>[620,440+i*80/192],{start:1050,speed:2});
   setup([a,b]);
   test('cold cache and boundary-only warm playback',()=>{
    const cold=draw(2765);check(cold.delta.builds>0&&cold.delta.bytes>0&&cold.delta.compositeInstances>0,'Cold frame did not allocate and composite tiles');
    compare(cold,'cold crossing');
    for(const time of [2765.25,2766,2765.25,2765]){const frame=draw(time);reuse(frame,'time '+time);compare(frame,'warm/reverse '+time);}
   });
   test('cached crossing uses local passage time independent of submission order',()=>{
    const frame=draw(2765,[b,a]);reuse(frame,'reverse submission');compare(frame,'reverse submission');
    colour(frame.image,620,460,[255,176,32,255],'Horizontal passage is newer at crossing');
   });
   test('deselection and reselection retain raster blocks',()=>{
    chosen.delete(b.name);reuse(draw(2765,[a]),'deselection');chosen.add(b.name);
    const frame=draw(2765,[a,b]);reuse(frame,'reselection');compare(frame,'reselection');
   });
   test('pan inside retained world tiles',()=>{
    setView([570.5,430.5,100,100]);const frame=draw(2765);reuse(frame,'small pan');compare(frame,'small pan');setView();
   });
   test('new zoom draws geometry, stable scale builds tiles, prior zoom reuses them',()=>{
    setView([575,435,90,90]);const zoom=draw(2765);
    check(zoom.delta.builds===0&&zoom.delta.bytes===0,'New zoom built disposable raster tiles');
    check(zoom.delta.compositeInstances===0&&zoom.dynamic>0,'New zoom must draw its geometry at the exact scale');compare(zoom,'cold zoom');
    const moving=draw(2765.1);check(moving.delta.builds===0&&moving.delta.bytes===0,'Playback between zoom events built disposable tiles');
    cache.buildAfter=0; // Advance the admission deadline without a wall-clock sleep in the pixel fixture.
    const stable=draw(2765);check(stable.delta.builds>0,'Reused scale did not build raster tiles');compare(stable,'stable zoom');
    reuse(draw(2765.25),'stable zoom playback');
    setView();const back=draw(2765);reuse(back,'return zoom');compare(back,'return zoom');
   });
   test('style variants and prepared boat-colour updates',()=>{
    const parallel=fixture('Style comparison',i=>[580+i*80/192,470],{step:12,speed:4});parallel.handicapSecondsPerNm=700;
    setup([a,parallel]);draw(2765);
    const sample=renderer.comparisonSample(parallel,D.start+1900);
    check(sample&&['absoluteGain','handicapGain','timeGain'].every(key=>Number.isFinite(sample[key])),'Style fixture must have valid gains for all three bases');
    for(const mode of ['speed','absolute','handicap','time','boat']){style(mode);const frame=draw(2765);compare(frame,'style '+mode);}
    style('boat');reuse(draw(2765),'return boat style');
    colours[a.name]='#c040ff';renderer.boatColours.set('#c040ff',new Float32Array([192/255,64/255,1]));
    const changed=draw(2765);check(changed.delta.builds>0,'Changed colour did not create a style variant');compare(changed,'changed boat colour');
    colour(changed.image,610,460,[192,64,255,255],'Updated cached colour');
   });
   test('reference is faint and remains underneath newer or older boats',()=>{
    setup([a,b],'absolute');const frame=draw(2765,[b,a]);compare(frame,'faint reference');
    check(Math.abs(at(frame.image,610,460)[3]-46)<=3,'Reference-only interior must have 18% opacity');
    check(at(frame.image,620,460)[3]===255,'Other boat must cover reference at crossing');
    referenceBoatId=b.id;comparisonRevision++;renderer.prepareComparison();
    const changed=draw(2765);check(changed.delta.builds>0,'Reference change retained stale comparison rasters');compare(changed,'changed reference');
    check(Math.abs(at(changed.image,620,470)[3]-46)<=3,'Changed reference must become faint');
   });
   test('cache reset clears entries and atlas memory without resetting counters',()=>{
    const before=stats();cache.reset();const reset=stats();
    check(cache.entries.size===0&&cache.pages.length===0,'reset retained atlas entries');
    for(const key of ['builds','hits','geometryInstances','compositeInstances','frames'])check(reset[key]===before[key],'reset cleared '+key);
    check(reset.bytes<before.bytes,'reset did not release atlas memory');check(draw(2765).delta.builds>0,'reset did not rebuild tiles');
   });

   test('cached and dynamic crossing and future path clipping',()=>{
    const dynamic=fixture('Boundary crossing',i=>[620,420+i*40/145],{start:1300});setup([a,dynamic]);
    const frame=draw(2755);check(frame.delta.builds>0&&frame.dynamic>0,'Need both cached and dynamic geometry');compare(frame,'cached/dynamic crossing');
    colour(frame.image,620,460,[32,208,255,255],'Newer dynamic crossing');
    check(at(frame.image,620,468)[3]===0,'Future path is visible');
   });
   test('moving tail reveals earlier underlying boat',()=>{
    const old=fixture('Underlying',i=>[580+i*80/192,460],{start:1000,step:5});
    const newer=fixture('Departing tail',i=>[620,440+i*80/192],{start:1800,step:2});setup([old,newer],'absolute');
    const windowAt=time=>new Map([[old,{from:D.start+1000,to:D.start+time}],[newer,{from:D.start+time-900,to:D.start+time}]]);
    const before=draw(2765,boats,windowAt(2765));compare(before,'before tail departure');
    check(at(before.image,620,460)[3]===255,'Opaque newer boat must cover earlier reference before its tail departs');
    const after=draw(2830,boats,windowAt(2830));compare(after,'after tail departure');
    colour(after.image,620,460,[46,32,6,46],'Earlier faint reference revealed');
    compare(draw(2765,boats,windowAt(2765)),'reverse tail departure');
   });
   test('self crossing preserves newest passage across chunk boundaries',()=>{
    const self=fixture('Self crossing',i=>i<=64?[580+i*80/64,460]:i<=128?[660-(i-64)*40/64,460+(i-64)*40/64]:[620,500-(i-128)*80/64],{speed:i=>i<128?12:2});
    setup([self],'speed');const frame=draw(2895);compare(frame,'self crossing');
    const expected=TRACK_SPEED_COLOURS[speedBin(2)].match(/\d+/g).map(Number);colour(frame.image,620,460,[...expected,255],'Newest self crossing');
   });
   test('continuous tracks have no chunk or world-tile seams',()=>{
    setup([a]);const frame=draw(2895);compare(frame,'chunk and tile seams');
    for(let i=1;i<188;i++)colour(frame.image,580+i*80/192,460,[255,176,32,255],'Continuous centreline sample '+i);
   });
   test('gaps remain empty inside cached chunks',()=>{
    const gap=fixture('Gap',i=>[i<80?580+i*.25:620+(i-80)*.25,480],{time:i=>1000+i*10+(i>=80?600:0)});setup([gap]);
    const frame=draw(3495);compare(frame,'gap');check(at(frame.image,610,480)[3]===0,'Gap over five minutes became a line');
   });
   test('fractional times and millisecond ordering near voyage end',()=>{
    const older=fixture('Late older',i=>[580+i*80/192,480],{start:140000,step:.5});
    const newer=fixture('Late newer',i=>[580+i*80/192,480],{start:140000.003,step:.5});setup([older,newer]);
    trackLengthSeconds=7200;
    for(const time of [140090.251,140090.252,140090.251]){
     const frame=draw(time,[newer,older]);compare(frame,'millisecond '+time);
     colour(frame.image,620,480,[32,208,255,255],'Three-millisecond newer track');
    }
   });
   return {browser:'firefox',gpu:renderer.renderer,pixels:[gl.drawingBufferWidth,gl.drawingBufferHeight],checks,failures,reuseChecks,stats:stats(),metrics};
  });
  console.log(JSON.stringify(result,null,2));
  assert.deepEqual(errors,[],'Uncaught browser errors');
  assert.deepEqual(result.failures,[],'Cached track regression failures (see scenario diagnostics above)');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
