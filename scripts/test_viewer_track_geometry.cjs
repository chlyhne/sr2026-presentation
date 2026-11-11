const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:760}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await require('./viewer-track-fixtures.cjs')(page);
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18454/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const result=await page.evaluate(()=>{
   const check=(value,message)=>{if(!value)throw Error(message);};
   stopPlayback();consumeRenderRequest();
   const point=(x,y,t)=>[9.5+x*4.5/1000,57-y*3/1180,D.start+t];
   const fixture=(name,id,vertical=false)=>({...boats[0],name,id,points:Array.from({length:193},(_,i)=>vertical
    ?point(620+5*Math.sin(i/12),440+i*80/192,1050+i*10)
    :point(580+i*80/192,470+7*Math.sin(i/15),1000+i*10)),speeds:Array(193).fill(vertical?2:8),handicapSecondsPerNm:vertical?700:580});
   const a=fixture('Mercutio','geometry-a'),b=fixture('Vera','geometry-b',true),fleet=[a,b];
   boats.splice(0,boats.length,...fleet);referenceBoatId=a.id;
   const route=buildRhumbRoute([point(575,470,0).slice(0,2),point(665,470,0).slice(0,2)]);
   rhumbRoute.legs=route.legs;rhumbRoute.total=route.total;
   const renderer=webglTracks,gl=renderer.gl;
   for(const boat of fleet){prepareTrackFixture(boat);renderer.prepare(boat);}
   renderer.prepareComparison();handicapTracksEnabled=false;trackLengthSeconds=0;
   const read=()=>{const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
   const subdivisions=renderer.subdivisions,metrics=[];
   for(const width of [120,45])for(const mode of ['speed','boat','absolute','handicap','time']){
    comparison={enabled:!['speed','boat'].includes(mode),boatColour:mode==='boat',basis:['absolute','handicap','time'].includes(mode)?mode:'absolute'};
    view=[620-width/2,480-width/2,width,width];$('map').setAttribute('viewBox',view.join(' '));
    const before=renderer.stats.vertices;
    check(renderer.render(D.start+2765,fleet,true),renderer.error);const actual=read(),vertices=renderer.stats.vertices-before;
    renderer.subdivisions=function(record,viewport){return Math.max(128,subdivisions.call(this,record,viewport));};
    try{check(renderer.render(D.start+2765,fleet,true),renderer.error);}finally{renderer.subdivisions=subdivisions;}
    const expected=read(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    let covered=0,missing=0,extra=0,interior=0,badInterior=0;
    const nearby=(pixels,x,y)=>{
     for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(pixels[((y+dy)*w+x+dx)*4+3]>3)return true;
     return false;
    };
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
     const n=(y*w+x)*4;
     if(expected[n+3]>3){covered++;if(!nearby(actual,x,y))missing++;}
     if(actual[n+3]>3&&!nearby(expected,x,y))extra++;
     if(expected[n+3]<32)continue;
     let stable=true;
     for(let dy=-1;dy<=1&&stable;dy++)for(let dx=-1;dx<=1;dx++){
      const k=((y+dy)*w+x+dx)*4;
      if([0,1,2,3].some(c=>Math.abs(expected[k+c]-expected[n+c])>6)){stable=false;break;}
     }
     if(stable){interior++;if([0,1,2,3].some(c=>Math.abs(actual[n+c]-expected[n+c])>28))badInterior++;}
    }
    const metric={width,mode,covered,missing,extra,interior,badInterior,vertices};metrics.push(metric);
    check(covered>100&&interior>20,'Fixture did not cover track interiors: '+JSON.stringify(metric));
    check(missing===0&&extra===0&&badInterior<=Math.max(3,interior*.002),'Mismatch against 128 subdivisions: '+JSON.stringify(metric));
   }
   // Independently check the mathematical chord-error bound at mid-chord,
   // where the interpolation error is largest for a quadratic derivative.
   let samples=0,maxError=0;
   for(const width of [620,45,1,.05]){
    view=[620-width/2,480-width/2,width,width];$('map').setAttribute('viewBox',view.join(' '));
    const viewport=mapViewport();
    for(const boat of fleet){
     const count=renderer.subdivisions(renderer.buffers.get(boat.points),viewport),model=getTrackModel(boat.points);
     for(let i=0;i<boat.points.length-1;i+=7)for(let step=0;step<count;step++){
      const t0=boat.points[i][2],dt=boat.points[i+1][2]-t0;
      const p=u=>new DOMPoint(...xy(trackValue(boat.points,i,t0+u*dt,model).point)).matrixTransform(viewport.matrix);
      const left=p(step/count),right=p((step+1)/count),middle=p((step+.5)/count);
      const error=Math.hypot(middle.x-(left.x+right.x)/2,middle.y-(left.y+right.y)/2);maxError=Math.max(maxError,error);samples++;
      check(error<=TRACK_CURVE_ERROR_PX+.002,'Chord error exceeds CSS-pixel budget: '+JSON.stringify({width,i,count,error}));
     }
    }
   }
   check(gl.getError()===gl.NO_ERROR,'WebGL error');
   return {metrics,chordSamples:samples,maxError,errorBudget:TRACK_CURVE_ERROR_PX};
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',...result,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
