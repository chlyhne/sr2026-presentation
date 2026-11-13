const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await require('./viewer-track-fixtures.cjs')(page);
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>{
   stopPlayback();$('wind').checked=$('rain').checked=false;
   const route=buildRhumbRoute([[12,55.6],[12.1,55.6]]);rhumbRoute.legs=route.legs;rhumbRoute.total=route.total;
   const original=boats.find(boat=>boat.name==='Mercutio'),time=D.start+3600;
   function fixture(id,lat,speeds,reverse=false){
    return {...original,id,name:id==='reference'?'Mercutio':id,handicapSecondsPerNm:580.6,
     points:[[reverse?12.08:12,lat,time],[reverse?12:12.08,lat,time+240]],speeds};
   }
   boats.splice(0,boats.length,fixture('reference',55.6,[1,1]),fixture('gain',55.602,[25,25]),
    fixture('loss',55.604,[6,6],true),fixture('crossing',55.606,[1,25]),fixture('missing',55.608,[null,null]),fixture('timeLoss',55.610,[.5,.5]));
   referenceBoatId='reference';chosen.clear();
   for(const boat of boats){
    colours[boat.name]='#ffdc42';chosen.add(boat.name);
    prepareTrackFixture(boat);
    webglTracks.prepare(boat);
   }
   webglTracks.prepareComparison();
   const [x,y]=xy([12.04,55.604]);view=[x-14,y-13,28,26];selectedTime=time+300;setview();render();
   window.overflowUploads=webglTracks.uploads;window.overflowBuffers=[...webglTracks.buffers];
   // Overflow colours are prepared at startup; changing styles must not upload them again.
   for(const name of ['createBuffer','bufferData','bufferSubData','texImage2D'])
    webglTracks.gl[name]=()=>{throw Error('Style switch uploaded or rebuilt fixed data: '+name);};
   const gl=webglTracks.gl,upload=gl.texSubImage2D;
   gl.texSubImage2D=function(...args){
    throw Error('Style switch uploaded GPU texture data');
    return upload.apply(this,args);
   };
   window.overflowSample=(id,fraction=.5)=>{
    const boat=boats.find(boat=>boat.id===id),time=boat.points[0][2]+fraction*240,sample=trackSpeedSample(boat,time);
    const point=new DOMPoint(...xy(sample.point)).matrixTransform($('map').getScreenCTM()),rect=$('map').getBoundingClientRect(),rgba=new Uint8Array(4),gl=webglTracks.gl;
    gl.readPixels(Math.floor((point.x-rect.left)/rect.width*gl.drawingBufferWidth),Math.floor((rect.bottom-point.y)/rect.height*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
    return {pixel:[...rgba],pin:trackPinValue(boat,sample)};
   };
  });
  const setStyle=async style=>{
   await page.locator('#mapTracksToggle').click();await page.locator('#trackStyle').selectOption(style);await page.locator('#mapTracksToggle').click();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  for(const style of ['absolute','handicap','time']){
   await setStyle(style);
   const state=await page.evaluate(()=>{
    webglTracks.render(currentTime(),webglTracks.order,true);
    const limit=trackGainLimit(),end=webglTracks.comparisonSample(boats.find(boat=>boat.id==='crossing'),boats[0].points[1][2]);
    const endGain=end[comparison.basis==='time'?'timeGain':comparison.basis==='handicap'?'handicapGain':'absoluteGain'];
    return {limit,gain:overflowSample('gain'),loss:overflowSample(comparison.basis==='time'?'timeLoss':'loss'),missing:overflowSample('missing'),reference:overflowSample('reference'),
     inside:overflowSample('crossing',.5*limit/endGain),outside:overflowSample('crossing',1.5*limit/endGain),
     colours:[-limit-.001,-limit,0,limit,limit+.001,NaN].map(value=>trackGainColour(value,limit)),
     extensions:[...$('trackSpeedLegend').querySelectorAll('[data-gain-overflow]')].map(node=>node.getAttribute('fill')),
     labels:[...$('trackSpeedLegend').querySelectorAll('text[y="54"]')].map(node=>node.textContent),
     description:$('trackSpeedLegend').getAttribute('aria-label'),active:webglTracks.active,error:webglTracks.gl.getError()};
   });
   assert.deepEqual(state.gain.pixel,[255,0,255,255],style+': positive overflow is magenta');
   assert.deepEqual(state.loss.pixel,[255,196,61,255],style+': negative overflow is warm yellow');
   assert.deepEqual(state.missing.pixel,[138,148,155,255],style+': missing data stays grey');
   assert.deepEqual(state.reference.pixel,[46,40,12,46],style+': reference keeps its faint boat colour');
   assert.ok(state.gain.pin.value>state.limit&&state.loss.pin.value < -state.limit,'Pins retain actual values beyond the scale');
   assert.notDeepEqual(state.inside.pixel,state.gain.pixel,'Interpolation stays blue before crossing the limit');
   assert.ok(state.inside.pixel[2]>state.inside.pixel[0]);
   assert.deepEqual(state.outside.pixel,state.gain.pixel,'Interpolated values become magenta after crossing the limit');
   assert.deepEqual(state.colours,['rgb(255,196,61)','rgb(215,25,28)','rgb(245,245,245)','rgb(0,60,255)','rgb(255,0,255)','#8a949b'],'Exact boundaries keep their ordinary endpoint colour');
   assert.deepEqual(state.extensions,['rgb(255,196,61)','rgb(255,0,255)']);
   assert.deepEqual(state.labels,['−'+state.limit,'0','+'+state.limit]);
   assert.match(state.description,/varm gul.*magenta/);assert.equal(state.active,true);assert.equal(state.error,0);
  }
  await page.screenshot({path:'/tmp/sr2026-scale-overflow-firefox.png'});
  await setStyle('speed');
  assert.equal(await page.locator('[data-gain-overflow]').count(),0,'SOG legend has no comparison overflow markers');
  const sog=await page.evaluate(()=>{
   webglTracks.render(currentTime(),webglTracks.order,true);
   return {actual:overflowSample('gain').pixel,expected:TRACK_SPEED_COLOURS[speedBin(25)].match(/\d+/g).map(Number)};
  });
  assert.deepEqual(sog.actual,[...sog.expected,255],'Normal SOG palette is unchanged');
  assert.equal(await page.evaluate(()=>webglTracks.uploads===overflowUploads&&overflowBuffers.every(([key,value])=>webglTracks.buffers.get(key)===value)),true);
  assert.deepEqual(errors,[]);
  console.log('Firefox desktop: magenta/yellow WebGL overflow in all comparison modes, exact bounds, interpolation, missing data, reference colour, legend extensions, unclipped pins, SOG and prepared buffers passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
