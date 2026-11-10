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
 const x=point[0]*NAV_RAD,y=mercatorLatitude(point[1]),scale=Math.cos(point[1]*NAV_RAD);
 let best=null,bestDistance=Infinity,bestRaw=0,bestX=0,bestY=0;
 for(const leg of route.legs){
  const raw=((x-leg.x)*leg.dx+(y-leg.y)*leg.dy)/leg.length2;
  const u=Math.max(0,Math.min(1,raw)),px=leg.x+u*leg.dx,py=leg.y+u*leg.dy;
  const distance=Math.hypot(x-px,y-py)*scale;
  if(best&&distance>=bestDistance)continue;
  best=leg;bestDistance=distance;bestRaw=raw;bestX=px;bestY=py;
 }
 if(!best)return null;
 const foot=[bestX/NAV_RAD,inverseMercatorLatitude(bestY)];
 return {distance:bestDistance,progress:best.start+rhumbLeg(best.a,foot).distance,leg:best.index,bearing:best.bearing,
  outside:(best.index===0&&bestRaw< -1e-10)||(best.index===route.legs.length-1&&bestRaw>1+1e-10)};
}
