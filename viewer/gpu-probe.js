// Explicit diagnostic document, never a rendering fallback for the tracker.
(async()=>{
 const canvas=document.getElementById('probeCanvas');let gl=null,firstContext=null,phase='Starter',intentionalLoss=false;
 let mode='minimal';
 const report=(kind,message,extra={})=>window.SRClientDiagnostics.report(kind,message,{probe:mode,...extra});
 window.SRClientDiagnostics.register('probe',()=>({phase,mode,canvas:[canvas.width,canvas.height],contextLost:gl?.isContextLost()??null}));
 const step=async message=>{phase=message;document.getElementById('viewerLoadingStage').textContent=message;await report('gpu-probe-step',message);};
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(!intentionalLoss)report('gpu-probe-error',srText('Konteksttab under ')+phase);});
 try{
  const command=await fetch(window.SR_CONFIG.clientControlUrl,{cache:'no-store'}).then(response=>response.json());mode=command.probe||mode;
  await step(srText('Opret WebGL 2 · ')+mode);
  gl=canvas.getContext('webgl2',{alpha:true,antialias:mode!=='minimal-no-aa',depth:true,premultipliedAlpha:true});
  if(!gl)throw Error(srText('WebGL 2 kunne ikke oprettes.'));
  const attributes=gl.getContextAttributes();await report('gpu-probe-context','WebGL 2 oprettet',{attributes,webglVersion:gl.getParameter(gl.VERSION)});
  if(mode==='upload'){
   for(const [format,channels,label] of [[gl.RGBA32F,4,'geometri'],[gl.R32F,1,'farvetype']]){
    await step('Upload 106 teksturer · '+label);
    const height=channels===4?14:7;
    for(let boat=0;boat<106;boat++){
     gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());gl.texStorage2D(gl.TEXTURE_2D,1,format,1024,height);
     gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
     gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,1024,height,channels===4?gl.RGBA:gl.RED,gl.FLOAT,new Float32Array(1024*height*channels).fill(7));
    }
    const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();const deadline=performance.now()+5000;let polls=0;
    for(;;){
     const status=gl.clientWaitSync(sync,0,0);polls++;
     if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)break;
     if(gl.isContextLost()||status===gl.WAIT_FAILED||performance.now()>deadline)throw Error(srText('GPU-færdigsignal fejlede efter upload af ')+label+'; status='+status);
     await new Promise(resolve=>setTimeout(resolve,20));
    }
    gl.deleteSync(sync);await report('gpu-probe-upload',srText('Upload og færdigsignal bestået · ')+label,{polls});
   }
  }
  if(mode.startsWith('background')){
   firstContext=gl;
   await step(srText('Opret anden WebGL-kontekst med kortbaggrundens indstillinger'));
   const second=document.createElement('canvas');second.width=64;second.height=64;canvas.after(second);
   second.addEventListener('webglcontextlost',event=>{event.preventDefault();if(!intentionalLoss)report('gpu-probe-error',srText('Anden kontekst tabt under ')+phase);});
   gl=second.getContext('webgl2',{alpha:true,antialias:true,depth:false,stencil:false,premultipliedAlpha:true});
   if(!gl)throw Error(srText('Anden WebGL 2-kontekst kunne ikke oprettes.'));
   const debug=gl.getExtension('WEBGL_debug_renderer_info');
   await report('gpu-probe-second-context',srText('Anden WebGL 2-kontekst oprettet'),{attributes:gl.getContextAttributes(),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):''});
  }
  let trackSource=null,vertexSource=`#version 300 es
precision highp float;
void main(){vec2 p=gl_VertexID==0?vec2(-0.5,-0.5):gl_VertexID==1?vec2(0.5,-0.5):vec2(0.0,0.5);gl_Position=vec4(p,0.0,1.0);}`;
  if(mode==='line'){
   trackSource=await fetch('track-renderer.js',{cache:'no-store'}).then(response=>response.text());
   const match=trackSource.match(/const vertex=shader\(gl\.VERTEX_SHADER,this\.simpleTracks\?`([\s\S]*?)`:`/);
   if(!match)throw Error(srText('Den nominelle linje-shader kunne ikke findes.'));vertexSource=match[1];
  }
  if(mode.startsWith('background')){
   const source=await fetch('background-renderer.js',{cache:'no-store'}).then(response=>response.text());
   const Renderer=Function(source.slice(0,source.indexOf('const webglBackground='))+';return WebGLBackgroundRenderer;')();
   const renderer=Object.create(Renderer.prototype);renderer.canvas=gl.canvas;renderer.fail=error=>{throw error;};renderer.uploads=0;
   await step(srText('Kompilér alle nominelle kortprogrammer'));renderer.initializePrograms();
   const viewport={matrix:{a:1,b:0,c:0,d:1},rect:{width:64,height:64},topLeft:{x:0,y:0}};
   let geometry={land:{vertices:new Float32Array([8,8,0,0,56,8,0,0,32,56,0,0]),indices:new Uint32Array([0,1,2]),records:[]},coast:{vertices:new Float32Array([8,32,0,0,48,0,48,0,8,32,0,0,48,0,48,0,56,32,0,0,48,0,48,0,56,32,0,0,48,0,48,0]),indices:new Uint32Array([0,1,2,2,1,3]),records:[]}};
   if(mode==='background-real'){
    await step(srText('Hent faktiske kortdata uden sporberegning'));
    const manifest=await fetch('track-profiles/manifest.json').then(response=>response.json());
    const response=await fetch(manifest.dataFile),data=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    const viewer=await fetch('viewer.js').then(response=>response.text());
    const geoSource=viewer.slice(viewer.indexOf('const coastChunks='),viewer.indexOf('function positionScreenGroup'));
    const xy=point=>[(point[0]-9.5)/4.5*1000,(57-point[1])/3*1180];
    const {landPolygons,coastChunks}=Function('D',geoSource+';return {landPolygons,coastChunks};')(data);
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/earcut.js';script.onload=resolve;script.onerror=reject;document.body.append(script);});
    geometry=Function('xy','earcut',source.slice(0,source.indexOf('class WebGLBackgroundRenderer'))+';return prepareBackgroundGeometry;')(xy,window.earcut)(landPolygons,coastChunks);
    gl.canvas.width=340;gl.canvas.height=1182;viewport.rect={width:170,height:591};viewport.matrix={a:.17,b:0,c:0,d:.17};
    await report('gpu-probe-geometry',srText('Faktisk kortgeometri klargjort'),{landBytes:geometry.land.vertices.byteLength+geometry.land.indices.byteLength,coastBytes:geometry.coast.vertices.byteLength+geometry.coast.indices.byteLength});
   }
   const land=renderer.mesh(geometry.land,4),coast=renderer.mesh(geometry.coast,8);
   for(const [name,program,mesh,count] of [['land',renderer.landProgram,land,geometry.land.indices.length],['kyst',renderer.coastProgram,coast,geometry.coast.indices.length]]){
    await step(srText('Tegn nominel kortbaggrund · ')+name);renderer.camera(program,viewport);gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
    gl.bindVertexArray(mesh.vao);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_INT,0);
    const pixel=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw Error(srText('Korttegning fejlede · ')+name);
    await report('gpu-probe-draw',srText('Nominel kortbaggrund tegnet · ')+name,{pixel:[...pixel]});
   }
   await step(srText('Tegn nominelt kortgitter'));renderer.camera(renderer.gridProgram,viewport);
   gl.uniform2f(renderer.gridProgram.uniforms.gridStep,20,20);gl.uniform2f(renderer.gridProgram.uniforms.gridAnchor,0,0);
   const quad=gl.createVertexArray();gl.bindVertexArray(quad);gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);
   gl.drawArrays(gl.TRIANGLES,0,6);const pixel=new Uint8Array(4);gl.readPixels(20,20,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
   if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw Error(srText('Kortgitteret fejlede.'));
   await report('gpu-probe-draw',srText('Nominelt kortgitter tegnet'),{pixel:[...pixel]});
   const projection=source.match(/const projection=`([\s\S]*?)`;/),landShader=source.match(/this\.landProgram=this\.program\(`([\s\S]*?)`,/);
   if(!projection||!landShader)throw Error(srText('Kortbaggrundens nominelle vertexshader kunne ikke findes.'));
   vertexSource=landShader[1].replace('${projection}',projection[1]);
  }
  await step('Kompilér vertex · '+mode);
  const vertex=gl.createShader(gl.VERTEX_SHADER);gl.shaderSource(vertex,vertexSource);gl.compileShader(vertex);
  if(!gl.getShaderParameter(vertex,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(vertex)||srText('Vertexkompilering fejlede; contextLost=')+gl.isContextLost());
  await report('gpu-probe-vertex',srText('Vertexshader kompileret'),{sourceLength:vertexSource.length});
  if(mode==='line'){
   const match=trackSource.match(/const fragment=shader\(gl\.FRAGMENT_SHADER,`([\s\S]*?)`\);/);
   if(!match)throw Error(srText('Den nominelle fragmentshader kunne ikke findes.'));
   const fragmentSource=Function('TRACK_SPEED_BINS','return `'+match[1]+'`;').call({simpleTracks:true},128);
   await step(srText('Link og tegn nominelle enkle spor'));
   const fragment=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(fragment,fragmentSource);gl.compileShader(fragment);
   if(!gl.getShaderParameter(fragment,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(fragment)||srText('Sporfragment fejlede.'));
   const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||srText('Sporlink fejlede.'));
   gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());gl.viewport(0,0,64,64);
   const location=name=>gl.getUniformLocation(program,name);
   gl.uniform4f(location('origin'),0,0,0,0);gl.uniformMatrix2fv(location('screen'),false,new Float32Array([1,0,0,1]));
   gl.uniform2f(location('size'),64,64);gl.uniform4f(location('windowTime'),100,50,0,0);gl.uniform1f(location('radius'),3);
   gl.uniform1f(location('opacity'),1);gl.uniform1f(location('gainLimit'),1);gl.uniform1i(location('gainComponent'),0);
   const texture=(unit,internal,width,height,format,type,values)=>{
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());gl.texStorage2D(gl.TEXTURE_2D,1,internal,width,height);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,format,type,values);
   };
   texture(1,gl.RGBA8,131,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(131*4).map((_,i)=>i%4===1||i%4===3?255:0));gl.uniform1i(location('palette'),1);
   for(const count of [1,8193]){
    await step('Tegn '+count+srText(' enkle sporstykker'));
    const width=Math.min(1024,count*2),height=Math.ceil(count*2/width),positions=new Float32Array(width*height*4);
    for(let i=0;i<count;i++)positions.set([8,32,48,0,0,100,0,0],i*8);
    texture(0,gl.RGBA32F,width,height,gl.RGBA,gl.FLOAT,positions);gl.uniform1i(location('trackData'),0);
    const colourWidth=Math.min(1024,count+1),colourHeight=Math.ceil((count+1)/colourWidth);
    texture(2,gl.R32F,colourWidth,colourHeight,gl.RED,gl.FLOAT,new Float32Array(colourWidth*colourHeight).fill(5));gl.uniform1i(location('comparisonData'),2);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
    const pixel=new Uint8Array(4);gl.readPixels(16,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    if(gl.getError()!==gl.NO_ERROR||pixel[1]!==255)throw Error(srText('Sporets pixel kunne ikke bekræftes.'));
    await report('gpu-probe-draw',srText('Nominelle enkle spor tegnet'),{count,pixel:[...pixel]});
   }
  }
  if(mode!=='line'&&!mode.startsWith('background')){
   await step('Kompilér fragment');
   const fragment=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(fragment,'#version 300 es\nprecision highp float;out vec4 colour;void main(){colour=vec4(0.0,1.0,0.0,1.0);}');gl.compileShader(fragment);
   if(!gl.getShaderParameter(fragment,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(fragment)||srText('Fragmentkompilering fejlede.'));
   await step(srText('Link og tegn én trekant'));
   const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||srText('Link fejlede.'));
   gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());gl.viewport(0,0,64,64);gl.drawArrays(gl.TRIANGLES,0,3);
   const pixel=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
   if(gl.getError()!==gl.NO_ERROR||pixel[1]!==255)throw Error(srText('Trekantens pixel kunne ikke bekræftes.'));
   await report('gpu-probe-draw',srText('Minimal tegning bestået'),{pixel:[...pixel]});
  }
  document.getElementById('probeResult').textContent=srText('Test bestået: ')+mode;await report('gpu-probe-result',srText('Bestået'));
 }catch(error){document.getElementById('probeResult').textContent=error.message;await report('gpu-probe-result',error);}
 finally{intentionalLoss=true;for(const context of [gl,firstContext])if(context&&!context.isContextLost())context.getExtension('WEBGL_lose_context')?.loseContext();}
})();
