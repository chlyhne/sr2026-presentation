// Offline, robustly fitted constant-velocity model. Retained source rows are
// returned unchanged: the filter detects outliers; it does not smooth the GPS.
// Continuous white acceleration: Q=q*[[dt^3/3,dt^2/2],[dt^2/2,dt]].
const EARTH=6371008.8,RADIANS=Math.PI/180,CHI2_MEDIAN=2*Math.log(2);
function median(values){
 if(!values.length)throw Error('Cannot fit an empty sample');
 const sorted=values.slice().sort((a,b)=>a-b),i=sorted.length>>1;
 return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2;
}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function filterTrack(points,policy){
 if(policy?.method!=='bidirectional-kalman-v1'||!['gapSeconds','minInnovationMetres','gateSquared','minNoiseMetres','maxNoiseMetres','minProcessNoise','maxProcessNoise'].every(key=>Number.isFinite(policy[key])&&policy[key]>0)
  ||policy.minNoiseMetres>policy.maxNoiseMetres||policy.minProcessNoise>policy.maxProcessNoise)throw Error('Invalid Kalman filter configuration');
 const count=points.length;
 if(count<5)return {points:points.slice(),removed:[],fit:null};
 const latitude=median(points.map(p=>p[1])),east=EARTH*RADIANS*Math.cos(latitude*RADIANS),north=EARTH*RADIANS;
 const origin=points[0],xy=points.map(p=>[(p[0]-origin[0])*east,(p[1]-origin[1])*north]);
 const ranges=[];let start=0;
 for(let i=1;i<count;i++){
  const dt=(points[i][2]-points[i-1][2])/1000;
  if(!Number.isFinite(dt)||dt<=0)throw Error('Kalman input times must increase');
  if(dt>policy.gapSeconds){ranges.push([start,i]);start=i;}
 }
 ranges.push([start,count]);
 const noise=[],motion=[];
 for(const [a,b] of ranges)for(let i=a+1;i<b-1;i++){
  const before=(points[i][2]-points[i-1][2])/1000,after=(points[i+1][2]-points[i][2])/1000;
  const w=before/(before+after),dx=xy[i][0]-(1-w)*xy[i-1][0]-w*xy[i+1][0],dy=xy[i][1]-(1-w)*xy[i-1][1]-w*xy[i+1][1];
  noise.push((dx*dx+dy*dy)/(CHI2_MEDIAN*(1+(1-w)**2+w*w)));
  const vx=(xy[i+1][0]-xy[i][0])/after-(xy[i][0]-xy[i-1][0])/before;
  const vy=(xy[i+1][1]-xy[i][1])/after-(xy[i][1]-xy[i-1][1])/before;
  motion.push({variance:(vx*vx+vy*vy)/CHI2_MEDIAN,measurement:1/before**2+1/after**2+(1/before+1/after)**2,duration:before+after});
 }
 // Fewer than three connected fixes cannot distinguish noise from motion.
 if(!noise.length)return {points:points.slice(),removed:[],fit:null};
 const r=clamp(median(noise),policy.minNoiseMetres**2,policy.maxNoiseMetres**2);
 const q=clamp(median(motion.map(m=>3*(m.variance-r*m.measurement)/m.duration)),policy.minProcessNoise,policy.maxProcessNoise);
 function scan(a,b,direction){
  const scores=new Map(),indexes=Array.from({length:Math.min(5,b-a)},(_,j)=>direction===1?a+j:b-1-j);
  const first=indexes[0],time=i=>direction*(points[i][2]-points[first][2])/1000;
  // Theil-Sen initialization resists a bad first or last GPS fix.
  const velocities=[[],[]];
  for(let j=0;j<indexes.length;j++)for(let k=j+1;k<indexes.length;k++){
   const i=indexes[j],l=indexes[k],dt=time(l)-time(i);
   for(let axis=0;axis<2;axis++)velocities[axis].push((xy[l][axis]-xy[i][axis])/dt);
  }
  let vx=median(velocities[0]),vy=median(velocities[1]);
  let x=median(indexes.map(i=>xy[i][0]-vx*time(i))),y=median(indexes.map(i=>xy[i][1]-vy*time(i)));
  let pp=4*r,pv=0,vv=4,lastTime=0;
  for(let i=first;i>=a&&i<b;i+=direction){
   const t=time(i),dt=t-lastTime;lastTime=t;
   x+=vx*dt;y+=vy*dt;
   pp+=2*dt*pv+dt*dt*vv+q*dt**3/3;pv+=dt*vv+q*dt*dt/2;vv+=q*dt;
   const dx=xy[i][0]-x,dy=xy[i][1]-y,distanceSquared=dx*dx+dy*dy,s=pp+r,nis=distanceSquared/s;
   const rejected=nis>policy.gateSquared&&distanceSquared>policy.minInnovationMetres**2;
   scores.set(i,{rejected,nis,innovationMetres:Math.sqrt(distanceSquared)});
   if(rejected)continue;
   const kp=pp/s,kv=pv/s;
   x+=kp*dx;y+=kp*dy;vx+=kv*dx;vy+=kv*dy;
   vv=Math.max(0,vv-pv*pv/s);pv*=r/s;pp*=r/s;
  }
  return scores;
 }
 const removed=[],reject=new Set();
 for(const [a,b] of ranges){
  if(b-a<5)continue;
  const forward=scan(a,b,1),backward=scan(a,b,-1);
  for(let i=a;i<b;i++)if(forward.get(i).rejected&&backward.get(i).rejected){
   reject.add(i);removed.push({index:i,point:points[i],forward:forward.get(i),backward:backward.get(i)});
  }
 }
 return {points:points.filter((_,i)=>!reject.has(i)),removed,fit:{measurementNoiseMetres:Math.sqrt(r),processNoise:q}};
}
module.exports={filterTrack};
