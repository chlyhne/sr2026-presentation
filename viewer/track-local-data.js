// Cheap, linear startup preparation. No route projection or station integration.
function preparationLayout(texels,channels=4){
 const width=Math.min(1024,Math.max(1,texels)),height=Math.max(1,Math.ceil(texels/width));
 return {width,height,values:new Float32Array(width*height*channels)};
}
function prepareLocalTrackData(boat,start,simple){
 const points=boat.points,n=points.length,model=getTrackModel(points);
 const connected=i=>i>=0&&i+1<n&&points[i+1][2]>points[i][2]&&points[i+1][2]-points[i][2]<=TRACK_MAX_GAP;
 const xy=p=>[(p[0]-9.5)*1000/4.5,(57-p[1])*1180/3];
 const geometry=preparationLayout(Math.max(simple?2:4,n*(simple?2:4))),lineGeometry=simple?geometry:preparationLayout(Math.max(2,n*2));
 const colour=preparationLayout(Math.max(1024,n+1),1),speed=colour.values,caps=[],bounds=new Float64Array(n);
 speed.fill(-1);let curvature=0;
 for(let i=0;i<n;i++){
  const a=points[i],next=connected(i),previous=connected(i-1),b=next?points[i+1]:a,h=next?b[2]-a[2]:0;
  const position=xy(a),delta=[(b[0]-a[0])*1000/4.5,-(b[1]-a[1])*1180/3],stamp=a[2]-start,high=Math.fround(stamp);
  const flags=next?Number(!previous)+2*Number(!connected(i+1)):(previous?0:3);
  if(flags&1)caps.push(i,-1);if(flags&2)caps.push(i,1);
  speed[i]=boat.speeds[i]??-1;
  lineGeometry.values.set([...position,...delta,high,h,stamp-high,flags],i*8);
  const m0=next?[model.slopes[0][i]*h*1000/4.5,-model.slopes[1][i]*h*1180/3]:[0,0];
  const m1=next?[model.slopes[0][i+1]*h*1000/4.5,-model.slopes[1][i+1]*h*1180/3]:[0,0];
  if(!simple)geometry.values.set([Math.fround(position[0]),Math.fround(position[1]),position[0]-Math.fround(position[0]),position[1]-Math.fround(position[1]),
   ...delta,...m0,...m1,boat.speeds[i]??-1,boat.speeds[next?i+1:i]??-1,high,h,stamp-high,flags],i*16);
  if(next){
   const bound=3*Math.max(Math.hypot(m0[0]*500.94/3,m0[1]*282.9916/3),
    Math.hypot((delta[0]-(m0[0]+m1[0])/3)*500.94,(delta[1]-(m0[1]+m1[1])/3)*282.9916),Math.hypot(m1[0]*500.94/3,m1[1]*282.9916/3));
   bounds[i]=bound;
   curvature=Math.max(curvature,Math.hypot(6*delta[0]-4*m0[0]-2*m1[0],6*delta[1]-4*m0[1]-2*m1[1]),
    Math.hypot(-6*delta[0]+2*m0[0]+4*m1[0],-6*delta[1]+2*m0[1]+4*m1[1]));
  }
 }
 if(n)speed[n]=speed[n-1];
 const capWidth=Math.max(1,Math.min(1024,caps.length/2)),capHeight=Math.max(1,Math.ceil(caps.length/2/capWidth));
 const capValues=simple?null:new Int32Array(capWidth*capHeight*2);if(capValues)capValues.set(caps);
 return {geometry:geometry.values,lineGeometry:lineGeometry.values,speed,caps:capValues,bounds,
  record:{pointCount:n,geometryWidth:geometry.width,geometryHeight:geometry.height,geometryBytes:geometry.values.byteLength,
   geometryFile:simple?'geometry-line':'geometry-cubic',comparisonWidth:colour.width,comparisonHeight:colour.height,
   capWidth,capHeight,capBytes:capValues?.byteLength||0,capCount:simple?0:caps.length/2,curvature}};
}

// CPU annotations use the same lookup semantics as the vertex shader.
function trackComparisonAt(own,reference,index,handicap,referenceHandicap){
 const missing=-1e20,infinity=Math.fround(1e15),values=new Float32Array(4).fill(missing);
 const station=own.samples[index*3],vmg=own.samples[index*3+2],timeStation=own.timeSamples[index*2],cost=own.timeSamples[index*2+1];
 const speed=reference.stations[station],time=reference.timeStations[timeStation];
 if(station>=0&&vmg>-1e19&&speed>=0){values[0]=vmg-speed;const factor=1+(referenceHandicap-handicap)*vmg/3600;if(handicap>0&&referenceHandicap>0&&factor>0)values[1]=vmg/factor-speed;}
 if(timeStation>=0&&cost>=0&&time>=0&&!(cost>=infinity&&time>=infinity))values[2]=100*(time-cost);
 return values;
}

// Time density at a source knot is a reciprocal of its VMG; no route work.
function restoreTrackTimeSamples(samples){
 if(!(samples instanceof Float32Array)||samples.length%3)throw Error('Ugyldige VMG-opslag.');
 const result=new Float32Array(samples.length/3*2),infinity=Math.fround(1e15);
 for(let i=0;i<samples.length/3;i++){
  const station=samples[i*3],vmg=samples[i*3+2],valid=station>=0&&vmg>-1e19;
  result[i*2]=valid?station:-1;
  result[i*2+1]=valid?(vmg===0?infinity:Math.min(infinity,3600/(1852*Math.abs(vmg)))):-1e20;
 }
 return result;
}
