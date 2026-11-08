const trafficKinds={separation_zone:'Skillezone',separation_line:'Skillelinje',
 separation_boundary:'Trafiksepareringens grænse',separation_lane:'Trafikretning',
 separation_roundabout:'Trafikrundkørsel',separation_crossing:'Trafikkrydsning'};
const trafficFeatures=(D.traffic_separation?.features||[]).map(feature=>{
 const geometry=feature.geometry,lines=geometry.type==='Polygon'?geometry.coordinates:[geometry.coordinates];
 let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
 for(const line of lines)for(const [lon,lat] of line){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
 return {...feature,lines,bounds:{west,east,south,north},d:lines.map(line=>path(line)+(geometry.type==='Polygon'?'Z':'')).join(' ')};
});
const trafficHatch=el('pattern',{id:'trafficHatch',width:8,height:8,patternUnits:'userSpaceOnUse'},$('map').querySelector('defs'));
el('path',{d:'M -2 2 L 2 -2 M 0 8 L 8 0 M 6 10 L 10 6',stroke:'#922987','stroke-width':1.2,opacity:.7},trafficHatch);
let trafficKey=null;

function clipTrafficSegment(a,b,rect){
 const dx=b.x-a.x,dy=b.y-a.y;
 let lo=0,hi=1;
 for(const [p,q] of [[-dx,a.x-rect.left],[dx,rect.right-a.x],[-dy,a.y-rect.top],[dy,rect.bottom-a.y]]){
  if(p===0){if(q<0)return null;continue;}
  const r=q/p;if(p<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);
  if(lo>hi)return null;
 }
 return [lo,hi];
}

function trafficLaneArrows(points,matrix,rect){
 const visible=[],arrows=[];
 let offset=0;
 for(let i=1;i<points.length;i++){
  const [ax,ay]=xy(points[i-1]),[bx,by]=xy(points[i]);
  const a=new DOMPoint(ax,ay).matrixTransform(matrix),b=new DOMPoint(bx,by).matrixTransform(matrix);
  const length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)continue;
  const clipped=clipTrafficSegment(a,b,rect);
  if(clipped)visible.push({a,b,length,offset,start:clipped[0]*length,end:clipped[1]*length});
  offset+=length;
 }
 const at=(piece,distance)=>{
  const u=distance/piece.length;
  return {x:piece.a.x+(piece.b.x-piece.a.x)*u,y:piece.a.y+(piece.b.y-piece.a.y)*u,
   angle:Math.atan2(piece.b.y-piece.a.y,piece.b.x-piece.a.x)*180/Math.PI};
 };
 let previousDistance=-Infinity;
 for(const piece of visible){
  const start=piece.offset+piece.start,end=piece.offset+piece.end;
  for(let d=Math.ceil((start-65)/130)*130+65;d<=end;d+=130){
   if(Math.abs(d-previousDistance)<1e-6)continue;
   arrows.push(at(piece,d-piece.offset));previousDistance=d;
  }
 }
 // Short visible lanes still receive one direction arrow.
 const visibleLength=visible.reduce((sum,p)=>sum+p.end-p.start,0);
 if(!arrows.length&&visibleLength>15){
  let halfway=visibleLength/2;
  for(const piece of visible){
   if(halfway<=piece.end-piece.start){arrows.push(at(piece,piece.start+halfway));break;}
   halfway-=piece.end-piece.start;
  }
 }
 return arrows;
}

function renderTraffic(){
 const layer=$('trafficSeparation'),enabled=$('traffic').checked;
 layer.setAttribute('display',enabled?'inline':'none');
 if(!enabled)return;
 const bounds=visibleMapBounds(),matrix=$('map').getScreenCTM();if(!bounds||!matrix)return;
 const rect=$('map').getBoundingClientRect();
 const key=[bounds.west,bounds.east,bounds.south,bounds.north,rect.width,rect.height].join(':');
 if(key===trafficKey)return;
 trafficKey=key;layer.replaceChildren();
 const scale=1/Math.hypot(matrix.a,matrix.b),inverse=matrix.inverse();
 trafficHatch.setAttribute('patternTransform',`scale(${scale})`);
 for(const feature of trafficFeatures){
  const b=feature.bounds;if(b.east<bounds.west||b.west>bounds.east||b.north<bounds.south||b.south>bounds.north)continue;
  const kind=feature.properties.kind,group=el('g',{'data-tss-id':feature.id,'data-tss-kind':kind},layer);
  const label=(feature.properties.name?feature.properties.name+' · ':'')+trafficKinds[kind];
  el('title',{},group).textContent=label;
  if(kind==='separation_lane'){
   for(const arrow of trafficLaneArrows(feature.lines[0],matrix,rect)){
    const point=new DOMPoint(arrow.x,arrow.y).matrixTransform(inverse);
    const anchor=screenGroup(point.x,point.y,group);anchor.dataset.tssArrow='true';
    anchor.setAttribute('transform',`translate(${point.x} ${point.y}) scale(${scale})`);
    const symbol=el('g',{transform:`rotate(${arrow.angle})`},anchor);
    const shape={d:'M -9 -5 L 7 0 L -9 5 M -11 0 L 7 0',fill:'none','stroke-linejoin':'round','stroke-linecap':'round'};
    el('path',{...shape,stroke:'#ffffff','stroke-width':4.5,opacity:.9},symbol);
    el('path',{...shape,stroke:'#922987','stroke-width':2.2},symbol);
   }
  }else{
   const zone=kind==='separation_zone';
   if(zone)el('path',{d:feature.d,fill:'#b044a6','fill-opacity':.1,stroke:'none','fill-rule':'evenodd'},group);
   el('path',{d:feature.d,fill:zone?'url(#trafficHatch)':'none','fill-rule':'evenodd',stroke:'#922987',
    'stroke-width':kind==='separation_line'?2:1.4,
    'stroke-dasharray':['separation_boundary','separation_roundabout','separation_crossing'].includes(kind)?'7 5':'none',
    'stroke-linejoin':'round','vector-effect':'non-scaling-stroke'},group);
  }
 }
}
$('traffic').onchange=renderTraffic;
if(!trafficFeatures.length){$('traffic').checked=false;$('traffic').disabled=true;$('trafficInfo').textContent='Trafiksepareringsdata er ikke indlæst.';}
