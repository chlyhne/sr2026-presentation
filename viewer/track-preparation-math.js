// The sole preparation algorithm. Executed at build time for each course.
// Persisted lanes match the WebGL renderer: geometry RGBA32F, scalar colours
// R32F, knots [local metres, VMG, seconds/metre, leg, time, index, station, leg start].
const PREP_MISSING=-1e20,PREP_INFINITY=Math.fround(1e15);
function prepareTrackData(boat,route,start,simple){
 const points=boat.points,n=points.length,model=getTrackModel(points),stationCount=Math.ceil(route.total*1852/10)+1;
 const connected=i=>i>=0&&i+1<n&&points[i+1][2]>points[i][2]&&points[i+1][2]-points[i][2]<=TRACK_MAX_GAP;
 const local=prepareLocalTrackData(boat,start,simple),knots=preparationLayout(Math.max(2,n*2)),divisions=new Uint32Array(n);
 let denseCount=0;
 const project=(point,direction,sog)=>{
  const p=projectOnRhumbRoute(point,route);
  if(!p||p.outside)return [-1,PREP_MISSING,PREP_MISSING,-1,0];
  const leg=route.legs[p.leg],metres=p.progress*1852,legStart=leg.start*1852;
  const east=direction[0]*Math.cos(point[1]*NAV_RAD),north=direction[1],length=Math.hypot(east,north);
  if(!Number.isFinite(sog)||sog<0||(length<1e-15&&sog>0))return [metres-legStart,PREP_MISSING,PREP_MISSING,p.leg,legStart];
  const course=p.bearing*NAV_RAD,alignment=length?(east*Math.sin(course)+north*Math.cos(course))/length:0;
  const vmg=Math.abs(alignment)<=Number.EPSILON*8?0:sog*alignment;
  return [metres-legStart,vmg,vmg===0?PREP_INFINITY:Math.min(PREP_INFINITY,3600/(1852*Math.abs(vmg))),p.leg,legStart];
 };
 for(let i=0;i<n;i++){
  const a=points[i],next=connected(i),previous=connected(i-1),b=next?points[i+1]:a,stamp=a[2]-start;
  if(next){divisions[i]=route.legs.length?Math.max(1,Math.ceil(local.bounds[i]/8)):0;denseCount+=divisions[i]?divisions[i]+1:0;}
  const direction=next?[b[0]-a[0],b[1]-a[1]]:previous?[a[0]-points[i-1][0],a[1]-points[i-1][1]]:[0,0];
  const p=project(a,direction,boat.speeds[i]);
  if(!next&&!previous)p[1]=p[2]=PREP_MISSING;
  const station=p[3]>=0?Math.floor((p[0]+p[4])/10+.5):-1;
  knots.values.set([p[0],p[1],p[2],p[3],stamp,i,station,p[4]],i*8);
 }
 if(!Number.isSafeInteger(denseCount)||denseCount>8000000)throw Error('For mange tætte sporprøver: '+boat.name);
 const dense=new Float64Array(denseCount*8);
 for(let i=0,at=0;i<n;i++)if(divisions[i]){
  const a=points[i],b=points[i+1],s0=boat.speeds[i],s1=boat.speeds[i+1],cost0=knots.values[i*8+2],cost1=knots.values[(i+1)*8+2];
  for(let step=0;step<=divisions[i];step++){
   const u=step/divisions[i],time=a[2]+(b[2]-a[2])*u,evaluation=trackCurveValue(points,i,time,model);
   const sog=Number.isFinite(s0)&&s0>=0&&Number.isFinite(s1)&&s1>=0?s0+(s1-s0)*u:-1,p=project(evaluation.point,evaluation.velocity,sog);
   const cost=cost0<0||cost1<0?PREP_MISSING:cost0>=PREP_INFINITY||cost1>=PREP_INFINITY?PREP_INFINITY:cost0+(cost1-cost0)*u;
   dense.set([p[0]+p[4],p[1],cost,p[3],time-start,i,1,p[0]],at++*8);
  }
 }
 const profile=prepareTrackStations(dense,stationCount),mirror=trackProfileMirror(n,knots.values,profile,stationCount);
 return {...local,knots:knots.values,profile,mirror,record:{...local.record,denseSamples:denseCount}};
}
function prepareTrackStations(dense,stationCount){
 const count=dense.length/8,groups=Math.ceil(count/64),ranges=new Int32Array(groups*2),sizes=new Uint32Array(stationCount),offsets=new Uint32Array(stationCount+1);
 // Index candidate blocks by station. This preserves chronological passage
 // processing without traversing the full voyage again for every station.
 for(let group=0;group<groups;group++){
  let low=Infinity,high=-Infinity;
  for(let i=group*64;i<Math.min(group*64+65,count);i++)if(dense[i*8+7]>=0&&dense[i*8+3]>=0){low=Math.min(low,dense[i*8]);high=Math.max(high,dense[i*8]);}
  const first=Number.isFinite(low)?Math.max(0,Math.ceil((low-5)/10)):1,last=Number.isFinite(high)?Math.min(stationCount-1,Math.floor((high+5)/10)):0;
  ranges.set([first,last],group*2);for(let station=first;station<=last;station++)sizes[station]++;
 }
 for(let i=0;i<stationCount;i++)offsets[i+1]=offsets[i]+sizes[i];
 const candidates=new Uint32Array(offsets[stationCount]),cursor=offsets.slice();
 for(let group=0;group<groups;group++)for(let station=ranges[group*2];station<=ranges[group*2+1];station++)candidates[cursor[station]++]=group;
 const profile=new Float32Array(1024*Math.ceil(stationCount/1024)*4);
 for(let i=0;i<profile.length;i+=4){profile[i]=profile[i+1]=PREP_MISSING;}
 for(let station=0;station<stationCount;station++){
  const center=station*10;
  let total=0,weighted=0,metres=0,speed=PREP_MISSING,speedTime=-1,speedSpan=0,extreme=0,direction=0,hasTime=false,speedDone=false,infinite=false,previousGroup=-2;
  const finish=()=>{if(metres>0){total+=weighted/metres;hasTime=true;}weighted=0;metres=0;};
  for(let candidate=offsets[station];candidate<offsets[station+1];candidate++){
   const group=candidates[candidate];
   if(group!==previousGroup+1){finish();direction=0;if(speed>=0)speedDone=true;}previousGroup=group;
   for(let index=group*64;index<Math.min(group*64+64,count-1);index++){
    const a=index*8,b=a+8,from=dense[a]-center,to=dense[b]-center,delta=to-from,dt=dense[b+4]-dense[a+4];
    if(dt===0&&dense[b+5]-dense[a+5]<=1)continue;
    const valid=dense[a+7]>=0&&dense[b+7]>=0&&dense[a+3]>=0&&dense[b+3]>=0&&(Math.abs(dense[a+3]-dense[b+3])<=1||Math.abs(delta)<=10)
     &&dt>0&&dt<=TRACK_MAX_GAP&&dense[a+6]>0&&dense[b+5]-dense[a+5]<=1;
    const sign=Math.sign(delta);
    if(valid&&delta===0){if(Math.abs(from)<=5&&dense[a+2]>=0&&dense[b+2]>=0){total+=dt/10;hasTime=true;}continue;}
    if(valid&&direction!==0&&sign!==direction&&Math.abs(to-extreme)<=.2)continue;
    if(!valid||sign!==direction){finish();if(speed>=0)speedDone=true;direction=valid?sign:0;extreme=to;}
    if(!valid)continue;
    extreme=direction>0?Math.max(extreme,to):Math.min(extreme,to);
    const begin=Math.max(-5,Math.min(from,to)),end=Math.min(5,Math.max(from,to));
    if(end<=begin){finish();if(speed>=0)speedDone=true;continue;}
    if(delta>0&&dense[a+1]>-1e19&&dense[b+1]>-1e19&&!speedDone){
     const u=Math.max(0,Math.min(1,-from/delta));speed=Math.max(0,dense[a+1]+(dense[b+1]-dense[a+1])*u);
     speedTime=dense[a+4]+dt*u;speedSpan=dt;if(from<=0&&to>=0)speedDone=true;
    }
    if(dense[a+2]>=0&&dense[b+2]>=0){
     const u=Math.max(0,Math.min(1,((begin+end)/2-from)/delta)),overflow=dense[a+2]>=PREP_INFINITY||dense[b+2]>=PREP_INFINITY;
     infinite||=overflow;const density=overflow?PREP_INFINITY:dense[a+2]+(dense[b+2]-dense[a+2])*u;
     weighted+=density*(end-begin);metres+=end-begin;
    }
   }
  }
  finish();profile.set([speed,hasTime?(infinite?PREP_INFINITY:Math.min(total,PREP_INFINITY)):PREP_MISSING,speedTime,speedSpan],station*4);
 }
 return profile;
}
function trackProfileMirror(count,knots,profile,stationCount){
 const samples=new Float32Array((count+1)*3),timeSamples=new Float32Array((count+1)*2),stations=new Float32Array(stationCount),timeStations=new Float32Array(stationCount);
 for(let i=0;i<count;i++){
  const at=i*8,station=knots[at+6],valid=station>=0&&station<stationCount,hasSpeed=valid&&knots[at+1]>-1e19,hasTime=valid&&knots[at+2]>=0;
  samples.set([hasSpeed?station:-1,valid?(knots[at]+knots[at+7])/1852:0,hasSpeed?knots[at+1]:PREP_MISSING],i*3);
  timeSamples.set([hasTime?station:-1,hasTime?knots[at+2]:PREP_MISSING],i*2);
 }
 if(count){samples.set(samples.subarray((count-1)*3,count*3),count*3);timeSamples.set(timeSamples.subarray((count-1)*2,count*2),count*2);}
 else{samples.set([-1,0,PREP_MISSING]);timeSamples.set([-1,PREP_MISSING]);}
 for(let i=0;i<stationCount;i++){stations[i]=profile[i*4];timeStations[i]=profile[i*4+1];}
 return {samples,stations,timeSamples,timeStations};
}
function compareTrackData(knots,count,reference,handicap,referenceHandicap,stationCount){
 const size=1024*Math.max(1,Math.ceil((count+1)/1024)),gains=new Float32Array(size*4).fill(PREP_MISSING),colours=Array.from({length:3},()=>new Float32Array(size).fill(PREP_MISSING));
 for(let i=0;count>0&&i<=count;i++){
  const at=Math.min(i,count-1)*8,station=Math.trunc(knots[at+6]),vmg=knots[at+1],cost=knots[at+2];
  if(knots[at]<0||station<0||station>=stationCount)continue;
  const speed=reference[station*4],time=reference[station*4+1];
  if(vmg>-1e19&&speed>=0){
   colours[0][i]=vmg-speed;const factor=1+(referenceHandicap-handicap)*vmg/3600;
   if(handicap>0&&referenceHandicap>0&&factor>0)colours[1][i]=vmg/factor-speed;
  }
  if(cost>=0&&time>=0&&!(cost>=PREP_INFINITY&&time>=PREP_INFINITY))colours[2][i]=100*(time-cost);
  for(let component=0;component<3;component++)gains[i*4+component]=colours[component][i];
 }
 return {gains,colours};
}
