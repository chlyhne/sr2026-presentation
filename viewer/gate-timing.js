// Fixed source curves and their spatial index are prepared before interaction.
// Gate edits calculate all boats once; selection, camera and replay only look up results.
const gateTrackCache=new WeakMap(),gateTimingCache=new Map();
function prepareGateTrack(points){
 if(gateTrackCache.has(points))return gateTrackCache.get(points);
 const segments=new Uint32Array(points.length);
 for(let i=1;i<points.length;i++)segments[i]=points[i][2]>points[i-1][2]&&points[i][2]-points[i-1][2]<=TRACK_MAX_GAP?segments[i-1]:i;
 const record={segments,model:getTrackModel(points),index:prepareTimelineTrack(points)};
 gateTrackCache.set(points,record);return record;
}
for(const boat of boats)prepareGateTrack(boat.points);
function eventGates(note){
 const points=eventToolPoints(note,'gates',4);
 for(let i=0;i<points.length;i+=2)if(rhumbLeg(points[i],points[i+1]).distance<1e-6)throw Error('Hver gate skal have to forskellige endepunkter.');
 return points;
}
function gateCurveCoefficients(points,i,gate,model){
 const a=points[i],b=points[i+1],dt=b[2]-a[2],dx=gate[1][0]-gate[0][0],dy=gate[1][1]-gate[0][1];
 const cross=(x,y)=>dx*y-dy*x;
 const x=b[0]-a[0],y=b[1]-a[1],mx=model.slopes[0][i]*dt,my=model.slopes[1][i]*dt,nx=model.slopes[0][i+1]*dt,ny=model.slopes[1][i+1]*dt;
 return [cross(a[0]-gate[0][0],a[1]-gate[0][1]),cross(mx,my),cross(3*x-2*mx-nx,3*y-2*my-ny),cross(-2*x+mx+nx,-2*y+my+ny)];
}
function gatePolynomialRoots(c){
 const scale=Math.max(...c.map(Math.abs));if(!scale)return [];
 const [d,e,f,g]=c.map(value=>value/scale),evaluate=u=>((g*u+f)*u+e)*u+d;
 const cuts=[0,1],a=3*g,b=2*f,discriminant=b*b-4*a*e;
 if(Math.abs(a)<1e-14){if(Math.abs(b)>1e-14){const u=-e/b;if(u>0&&u<1)cuts.push(u);}}
 else if(discriminant>=0){
  const root=Math.sqrt(discriminant),q=-.5*(b+(b>=0?root:-root));
  for(const u of q===0?[-b/(2*a)]:[q/a,e/q])if(u>0&&u<1)cuts.push(u);
 }
 cuts.sort((a,b)=>a-b);const roots=[];
 for(const u of cuts)if(Math.abs(evaluate(u))<1e-12)roots.push(u);
 for(let i=1;i<cuts.length;i++){
  let left=cuts[i-1],right=cuts[i],sign=evaluate(left);
  if(sign*evaluate(right)>=0)continue;
  for(let step=0;step<48;step++){
   const middle=(left+right)/2,value=evaluate(middle);
   if(sign*value<=0)right=middle;else{left=middle;sign=value;}
  }
  roots.push((left+right)/2);
 }
 return roots.sort((a,b)=>a-b).filter((u,i,all)=>!i||u-all[i-1]>1e-9);
}
function gateCurveCrossings(points,gate){
 const record=gateTrackCache.get(points);if(!record)throw Error('Sporet er ikke forberedt til gate-måling.');
 const {model,index,segments}=record,hits=[],dx=gate[1][0]-gate[0][0],dy=gate[1][1]-gate[0][1],length2=dx*dx+dy*dy;
 const box={west:Math.min(gate[0][0],gate[1][0]),east:Math.max(gate[0][0],gate[1][0]),south:Math.min(gate[0][1],gate[1][1]),north:Math.max(gate[0][1],gate[1][1])};
 const connected=i=>i>=0&&i+1<points.length&&points[i+1][2]>points[i][2]&&points[i+1][2]-points[i][2]<=TRACK_MAX_GAP;
 // Sign immediately to either side of a knot, including stationary derivatives.
 const side=(i,end)=>{
  if(!connected(i))return null;
  const c=gateCurveCoefficients(points,i,gate,model),scale=Math.max(...c.map(Math.abs));
  const terms=end?[-c[1]-2*c[2]-3*c[3],c[2]+3*c[3],-c[3]]:[c[1],c[2],c[3]];
  return Math.sign(terms.find(value=>Math.abs(value)>scale*1e-10)||0);
 };
 const visit=node=>{
  if(!mapBoundsIntersect(node,box))return;
  if(node.left){visit(node.left);visit(node.right);return;}
  for(let i=node.first;i<node.end;i++){
   if(!connected(i))continue;
   const a=points[i],b=points[i+1];
   if(Math.max(a[0],b[0])<box.west||Math.min(a[0],b[0])>box.east||Math.max(a[1],b[1])<box.south||Math.min(a[1],b[1])>box.north)continue;
   const c=gateCurveCoefficients(points,i,gate,model),scale=Math.max(...c.map(Math.abs));
   for(const u of gatePolynomialRoots(c)){
    if(u<1e-8||u>1-1e-8){
     const knot=u<.5?i:i+1,before=side(knot-1,true),after=side(knot,false);
     if(before===0||after===0||before!==null&&after!==null&&before===after)continue;
    }else{
     const derivative=c[1]+2*c[2]*u+3*c[3]*u*u,second=2*c[2]+6*c[3]*u;
     if(Math.abs(derivative)<=scale*1e-9&&Math.abs(second)>scale*1e-9)continue;
    }
    const time=a[2]+u*(b[2]-a[2]),point=trackValue(points,i,time,model).point;
    const along=((point[0]-gate[0][0])*dx+(point[1]-gate[0][1])*dy)/length2;
    if(along>=-1e-9&&along<=1+1e-9&&time>=D.start&&time<=D.end)hits.push({time,segment:segments[i]});
   }
  }
 };
 visit(index);hits.sort((a,b)=>a.time-b.time);
 return hits.filter((hit,i)=>!i||Math.abs(hit.time-hits[i-1].time)>1e-5);
}
function prepareGateTiming(gates){
 if(!gates.length)return null;
 const key=JSON.stringify(gates),cached=gateTimingCache.get(key);
 if(cached&&cached.size===boats.length&&boats.every(boat=>cached.get(boat.id)?.points===boat.points))return cached;
 const result=new Map();
 for(const boat of boats){
  const crossings=[...gateCurveCrossings(boat.points,gates.slice(0,2)).map(hit=>({...hit,gate:1})),...gateCurveCrossings(boat.points,gates.slice(2,4)).map(hit=>({...hit,gate:2}))].sort((a,b)=>a.time-b.time||a.gate-b.gate);
  const passages=[];let start=null,segment=null;
  for(const hit of crossings){
   if(hit.segment!==segment){start=null;segment=hit.segment;}
   if(hit.gate===1)start=hit.time;
   else if(start!==null&&hit.time>start+1e-6){passages.push({start,end:hit.time,elapsed:hit.time-start});start=null;}
  }
  result.set(boat.id,{points:boat.points,passages});
 }
 gateTimingCache.set(key,result);return result;
}
function preparedGateTiming(gates){
 if(!gates.length)return null;
 const result=gateTimingCache.get(JSON.stringify(gates));if(!result)throw Error('Gate-tiderne er ikke forberedt.');return result;
}
function gatePassageAtTime(record,boat,time){
 if(!record)return null;
 if(record.points!==boat.points)throw Error('Gate-tiderne tilhører et andet spor.');
 const all=record.passages;let lo=0,hi=all.length;
 while(lo<hi){const mid=(lo+hi)>>>1,end=displayedTrackTime(boat,all[mid].end);if(end!==null&&end<=time)lo=mid+1;else hi=mid;}
 return lo?all[lo-1]:null;
}
function formatGateDuration(seconds){
 const tenths=Math.round(seconds*10),hours=Math.floor(tenths/36000),minutes=Math.floor(tenths/600)%60,whole=Math.floor(tenths/10)%60;
 return (hours?hours+':':'')+String(minutes).padStart(2,'0')+':'+String(whole).padStart(2,'0')+','+tenths%10;
}
