const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await require('./viewer-track-fixtures.cjs')(page);
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18453/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const fleet=await page.evaluate(()=>{
   const check=(condition,message)=>{if(!condition)throw Error(message);};
   stopPlayback();$('wind').checked=$('rain').checked=false;
   const renderer=webglTracks,gl=renderer.gl,initial=[...renderer.buffers],uploads=renderer.uploads,originals=new Map();
   let draws=0,geometryDraws=0,compositeDraws=0,offsets=0,descriptors=0;
   for(const name of ['vertexAttribPointer','vertexAttribIPointer','vertexAttribDivisor','enableVertexAttribArray','createBuffer','bufferData','bufferSubData','texImage2D','getBufferSubData']){
    originals.set(name,gl[name]);gl[name]=()=>{throw Error('Playback changed fixed GPU data or bindings: '+name);};
   }
   originals.set('drawArraysInstanced',gl.drawArraysInstanced);
   gl.drawArraysInstanced=(...args)=>{draws++;if(args[2]===renderer.vertexCount)geometryDraws++;else compositeDraws++;return originals.get('drawArraysInstanced').apply(gl,args);};
   originals.set('texSubImage2D',gl.texSubImage2D);
   gl.texSubImage2D=(...args)=>{
    check(gl.getParameter(gl.TEXTURE_BINDING_2D)===renderer.cache.descriptorTexture,'Only transient composition descriptors may upload during playback');
    descriptors++;return originals.get('texSubImage2D').apply(gl,args);
   };
   originals.set('uniform1i',gl.uniform1i);
   gl.uniform1i=(location,value)=>{if(location===renderer.uniforms.firstInstance)offsets++;return originals.get('uniform1i').call(gl,location,value);};
   const modes=['speed','boat','absolute','handicap','time'],times=[43199.95,43200,43200.05,43209.95,43210,43210.05,43199.95];
   try{
    for(const mode of modes){
     comparison={enabled:!['boat','speed'].includes(mode),boatColour:mode==='boat',basis:['absolute','handicap','time'].includes(mode)?mode:'absolute'};
     for(const compensated of [false,true]){
      handicapTracksEnabled=compensated;
      for(const tail of [900,7200,0]){
       trackLengthSeconds=tail;
       const order=tail===0?boats.slice(0,4):boats;
       for(const time of times)check(renderer.render(D.start+time,order,true),renderer.error);
      }
     }
    }
   }finally{for(const [name,original] of originals)gl[name]=original;handicapTracksEnabled=false;trackLengthSeconds=7200;}
   check(draws>1000&&geometryDraws===offsets&&compositeDraws>0&&descriptors>0,'Select geometry intervals and batch cached tiles without rebinding attributes');
   check(renderer.uploads===uploads&&initial.every(([points,record])=>renderer.buffers.get(points)===record),'Keep all GPU resources');
   check(gl.getError()===gl.NO_ERROR,'No WebGL errors at synchronized sample boundaries');
   return {boats:boats.length,draws,geometryDraws,compositeDraws,offsets,descriptors,attributeChanges:0,fixedDataUploads:0};
  });
  const pixels=await page.evaluate(()=>{
   const check=(condition,message)=>{if(!condition)throw Error(message);};
   const renderer=webglTracks,gl=renderer.gl,original=boats[0],route=buildRhumbRoute([[12,55.6],[12.2,55.6]]);
   rhumbRoute.legs=route.legs;rhumbRoute.total=route.total;
   const points=Array.from({length:1100},(_,index)=>[12+index*.0001,55.602+.0004*Math.sin(index*.1),D.start+1000+index*10]);
   const source={...original,id:'texture-source',name:'Texture source',points,speeds:points.map(()=>8),handicapSecondsPerNm:580.6};
   const reference={...original,id:'texture-reference',name:'Mercutio',points:points.map(point=>[point[0],55.6,point[2]]),speeds:points.map(()=>4),handicapSecondsPerNm:580.6};
   boats.splice(0,boats.length,source,reference);referenceBoatId=reference.id;colours[source.name]='#ffdc42';
   renderer.boatColours.set(colours[source.name],new Float32Array([1,220/255,66/255]));
   for(const boat of boats){prepareTrackFixture(boat);renderer.prepare(boat);}
   renderer.prepareComparison();
   let checked=0;
   for(const mode of ['speed','boat','absolute','handicap','time']){
    comparison={enabled:!['boat','speed'].includes(mode),boatColour:mode==='boat',basis:['absolute','handicap','time'].includes(mode)?mode:'absolute'};
    for(const index of [255,256,1023,1024]){
     const sample=trackSpeedSample(source,points[index][2]+4),[x,y]=xy(sample.point);
     view=[x-.6,y-.6,1.2,1.2];$('map').setAttribute('viewBox',view.join(' '));
     check(renderer.render(points[index+3][2]+.05,[source],true),renderer.error);
     const location=new DOMPoint(x,y).matrixTransform($('map').getScreenCTM()),rect=$('map').getBoundingClientRect(),actual=new Uint8Array(4);
     gl.readPixels(Math.floor((location.x-rect.left)/rect.width*gl.drawingBufferWidth),Math.floor((rect.bottom-location.y)/rect.height*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,actual);
     let expected;
     if(mode==='boat')expected=[255,220,66];
     else if(mode==='speed')expected=TRACK_SPEED_COLOURS[speedBin(sample.speed)].match(/\d+/g).map(Number);
     else{
      const gains=renderer.comparisonSample(source,sample.time),value=gains[mode==='time'?'timeGain':mode==='handicap'?'handicapGain':'absoluteGain'],limit=trackGainLimit();
      const colour=value===null?TRACK_SPEED_MISSING:value < -limit?TRACK_GAIN_UNDERFLOW_COLOUR:value>limit?TRACK_GAIN_OVERFLOW_COLOUR:TRACK_GAIN_COLOURS[Math.round((value+limit)/(2*limit)*127)];
      expected=colour.startsWith('#')?[1,3,5].map(offset=>parseInt(colour.slice(offset,offset+2),16)):colour.match(/\d+/g).map(Number);
     }
     check(actual[3]===255&&expected.every((value,component)=>Math.abs(actual[component]-value)<=12),JSON.stringify({mode,index,actual:[...actual],expected}));checked++;
    }
   }
   check(gl.getError()===gl.NO_ERROR,'No WebGL errors crossing texture rows');
   return {checked};
  });
  assert.equal(pixels.checked,20);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:'firefox',fleet,pixels,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
