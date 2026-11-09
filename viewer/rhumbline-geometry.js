// Spherical rhumb geometry. Coordinates stay geographic; distances are nautical miles.
const NAV_RADIUS_NM=6371008.8/1852,NAV_RAD=Math.PI/180;
const mercatorLatitude=latitude=>Math.asinh(Math.tan(latitude*NAV_RAD));
const inverseMercatorLatitude=y=>Math.atan(Math.sinh(y))/NAV_RAD;
function rhumbLeg(a,b){
 const dx=(b[0]-a[0])*NAV_RAD,dy=mercatorLatitude(b[1])-mercatorLatitude(a[1]);
 const dp=(b[1]-a[1])*NAV_RAD,q=Math.abs(dy)>1e-12?dp/dy:Math.cos(a[1]*NAV_RAD);
 return {distance:NAV_RADIUS_NM*Math.hypot(dp,q*dx),bearing:(Math.atan2(dx,dy)/NAV_RAD+360)%360};
}
function validRhumbline(value){
 return value&&value.version===1&&Array.isArray(value.points)&&value.points.length<=200
  &&(value.points.length===0||value.points.length>=2)
  &&value.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<85)
  &&value.points.every((p,i)=>!i||(Math.abs(p[0]-value.points[i-1][0])<180&&rhumbLeg(value.points[i-1],p).distance>1e-6));
}
function buildRhumbRoute(points){
 let total=0;
 const legs=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],x=a[0]*NAV_RAD,y=mercatorLatitude(a[1]);
  const dx=(b[0]-a[0])*NAV_RAD,dy=mercatorLatitude(b[1])-y,length2=dx*dx+dy*dy;
  const {distance,bearing}=rhumbLeg(a,b);
  legs.push({a,b,x,y,dx,dy,length2,distance,bearing,start:total,index:i-1});total+=distance;
 }
 return {legs,total};
}
function projectOnRhumbRoute(point,route=rhumbRoute){
 const x=point[0]*NAV_RAD,y=mercatorLatitude(point[1]);
 let best=null;
 for(const leg of route.legs){
  const raw=((x-leg.x)*leg.dx+(y-leg.y)*leg.dy)/leg.length2;
  const u=Math.max(0,Math.min(1,raw)),px=leg.x+u*leg.dx,py=leg.y+u*leg.dy;
  // Compare actual local distances rather than screen distances or Mercator scale.
  const distance=Math.hypot(x-px,y-py)*Math.cos(point[1]*NAV_RAD);
  if(best&&distance>=best.distance)continue;
  const foot=[px/NAV_RAD,inverseMercatorLatitude(py)];
  best={distance,progress:leg.start+rhumbLeg(leg.a,foot).distance,leg:leg.index,bearing:leg.bearing,
   outside:(leg.index===0&&raw< -1e-10)||(leg.index===route.legs.length-1&&raw>1+1e-10)};
 }
 return best;
}
