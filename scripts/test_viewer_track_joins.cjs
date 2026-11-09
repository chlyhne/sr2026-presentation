const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1300,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  const result=await page.evaluate(async()=>{
   const check=(ok,message)=>{if(!ok)throw Error(message);};
   const point=(x,y,t)=>[9.5+x*4.5/1000,57-y*3/1180,D.start+t];
   const straight=Array.from({length:201},(_,i)=>point(580+i*.2,480,100+i));
   const curved=Array.from({length:201},(_,i)=>point(580+i*.2,480+3*Math.sin(i/40),100+i));
   const expected=TRACK_SPEED_COLOURS[speedBin(7.5)].match(/\d+/g).map(Number);
   const antialiasedPixels=pixels=>{
    const outline=[23,49,62];let count=0;
    for(let offset=0;offset<pixels.length;offset+=4){
     if(pixels[offset+3]!==255)continue;
     const blend=(pixels[offset+1]-outline[1])/(expected[1]-outline[1]);
     if(blend>.05&&blend<.95&&outline.every((value,index)=>Math.abs(pixels[offset+index]-(value+blend*(expected[index]-value)))<3))count++;
    }
    return count;
   };
   const edgeLevels=pixels=>{
    const levels=new Set();
    for(let offset=3;offset<pixels.length;offset+=4)if(pixels[offset]>0&&pixels[offset]<255)levels.add(pixels[offset]);
    return levels.size;
   };
   const boat={id:'joined-track',name:'joined-track',points:straight,speeds:straight.map(()=>7.5)};
   const renderer=webglTracks,gl=renderer.gl;
   check(renderer.active,'Nominal WebGL must be active: '+renderer.error);
   let samples=0;
   for(const points of [straight,curved])for(const width of [100,60,45]){
    boat.points=points;view=[600-width/2,480-width/2,width,width];$('map').setAttribute('viewBox',view.join(' '));
    const time=D.start+301;renderer.render(time,[boat],true);
    const viewport=mapViewport(),pixels=new Uint8Array(renderer.canvas.width*renderer.canvas.height*4);
    gl.readPixels(0,0,renderer.canvas.width,renderer.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    check(antialiasedPixels(pixels)>20,'Missing antialiasing between the speed colour and outline at zoom '+width);
    if(points===curved){
     const display=document.createElement('canvas');display.width=viewport.pixelWidth;display.height=viewport.pixelHeight;
     const context=display.getContext('2d');context.drawImage(renderer.canvas,0,0,display.width,display.height);
     check(edgeLevels(context.getImageData(0,0,display.width,display.height).data)>3,'Outer track edge must have finer coverage than four-sample MSAA at zoom '+width);
    }
    const pixel=(x,y)=>{
     const p=new DOMPoint(x,y).matrixTransform(viewport.matrix);
     const px=Math.floor((p.x-viewport.rect.left)*renderer.canvas.width/viewport.rect.width);
     const py=renderer.canvas.height-1-Math.floor((p.y-viewport.rect.top)*renderer.canvas.height/viewport.rect.height);
     return [...pixels.slice((py*renderer.canvas.width+px)*4,(py*renderer.canvas.width+px)*4+4)];
    };
    for(let i=5;i<195;i++)for(const u of [0,.25,.5,.75]){
     const position=trackValue(points,i,points[i][2]+u,getTrackModel(points)).point;
     const actual=pixel(...xy(position));
     check(actual[3]>240&&actual.slice(0,3).every((v,j)=>Math.abs(v-expected[j])<20),
      'Outline crosses connected track: '+JSON.stringify({width,i,u,actual,expected}));samples++;
    }
   }
   // Window clipping and real gap boundaries must keep round outer caps.
   boat.points=[point(590,480,100),point(610,480,200),point(620,480,1000),point(630,480,1100)];boat.speeds=[7.5,7.5,7.5,7.5];
   view=[570,450,80,60];$('map').setAttribute('viewBox',view.join(' '));
   let caps=0;
   for(const time of [150,1101,7350]){
    renderer.render(D.start+time,[boat],true);
    const v=mapViewport(),scale=renderer.canvas.width/v.rect.width;
    for(const x of time===150?[590,600]:time===1101?[590,610,620,630]:[600,610,620,630]){
     const p=new DOMPoint(x,480).matrixTransform(v.matrix);
     for(const delta of [-.6,.6]){
      const data=new Uint8Array(4);
      gl.readPixels(Math.floor((p.x-v.rect.left+delta)*scale),renderer.canvas.height-1-Math.floor((p.y-v.rect.top)*scale),1,1,gl.RGBA,gl.UNSIGNED_BYTE,data);
      const blend=(data[1]-49)/(expected[1]-49);
      check(data[3]>240&&blend>.7&&[23,49,62].every((value,index)=>Math.abs(data[index]-(value+blend*(expected[index]-value)))<3),'Missing cap at '+JSON.stringify({time,x,delta,data:[...data]}));caps++;
     }
    }
   }
   // The same geometry must stay seamless when rasterized at PNG resolution.
   boat.points=curved;boat.speeds=curved.map(()=>7.5);
   const png=renderer.snapshot(D.start+301,[boat],2),image=new Image();image.src=png;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=Math.round(mapViewport().rect.width*2);canvas.height=Math.round(mapViewport().rect.height*2);
   const context=canvas.getContext('2d');context.drawImage(image,0,0,canvas.width,canvas.height);
   check(antialiasedPixels(context.getImageData(0,0,canvas.width,canvas.height).data)>20,'PNG must use the same antialiased colour/outline boundary');
   check(edgeLevels(context.getImageData(0,0,canvas.width,canvas.height).data)>3,'PNG must preserve the supersampled outer edge');
   const v=mapViewport();
   for(let i=5;i<195;i++){
    const p=new DOMPoint(...xy(trackValue(curved,i,curved[i][2]+.5,getTrackModel(curved)).point)).matrixTransform(v.matrix);
    const actual=context.getImageData(Math.floor((p.x-v.rect.left)*canvas.width/v.rect.width),Math.floor((p.y-v.rect.top)*canvas.height/v.rect.height),1,1).data;
    check(actual[3]>240&&expected.every((n,j)=>Math.abs(actual[j]-n)<20),'Outline crosses PNG track at '+i);
   }
   return {samples,caps,png:true};
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',checks:'dense straight and curved joins, antialiased colour/outline boundary, supersampled outer edge, zoom, round caps at gaps and clipped ends, same nominal antialiased PNG renderer',...result,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
