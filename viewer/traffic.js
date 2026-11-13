const trafficKinds={separation_zone:'Skillezone',separation_line:'Skillelinje',
 separation_boundary:'Trafiksepareringens grænse',separation_lane:'Trafikretning',
 separation_roundabout:'Trafikrundkørsel',separation_crossing:'Trafikkrydsning'};
const trafficFeatures=D.traffic_separation.features.filter(feature=>feature.properties.kind!=='separation_lane').map(feature=>{
 const geometry=feature.geometry,lines=geometry.type==='Polygon'?geometry.coordinates:[geometry.coordinates];
 let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
 for(const line of lines)for(const [lon,lat] of line){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
 return {...feature,lines,bounds:{west,east,south,north},d:lines.map(line=>path(line)+(geometry.type==='Polygon'?'Z':'')).join(' ')};
});
const trafficHatch=el('pattern',{id:'trafficHatch',width:8,height:8,patternUnits:'userSpaceOnUse'},$('map').querySelector('defs'));
el('path',{d:'M -2 2 L 2 -2 M 0 8 L 8 0 M 6 10 L 10 6',stroke:'#000000','stroke-width':1.2,opacity:.7},trafficHatch);
let trafficKey=null;

function renderTraffic(){
 const layer=$('trafficSeparation'),enabled=$('traffic').checked;
 setAttr(layer,'display',enabled?'inline':'none');
 if(!enabled)return;
 const bounds=visibleMapBounds(),matrix=mapViewport()?.matrix;if(!bounds||!matrix)return;
 const rect=mapViewport().rect;
 const key=[bounds.west,bounds.east,bounds.south,bounds.north,rect.width,rect.height].join(':');
 if(key===trafficKey)return;
 trafficKey=key;
 const scale=1/Math.hypot(matrix.a,matrix.b);
 setAttr(trafficHatch,'patternTransform',`scale(${scale})`);
 for(const feature of trafficFeatures){
  const b=feature.bounds;if(b.east<bounds.west||b.west>bounds.east||b.north<bounds.south||b.south>bounds.north){feature.node?.remove();continue;}
  const kind=feature.properties.kind,fresh=!feature.node;
  const group=feature.node||(feature.node=el('g',{'data-tss-id':feature.id,'data-tss-kind':kind}));
  if(!group.parentNode)layer.append(group);
  const label=(feature.properties.name?feature.properties.name+' · ':'')+trafficKinds[kind];
  if(fresh)el('title',{},group).textContent=label;
  if(fresh){
   const area=feature.geometry.type==='Polygon';
   if(area)el('path',{d:feature.d,fill:'#000000','fill-opacity':.035,stroke:'none','fill-rule':'evenodd'},group);
   el('path',{d:feature.d,fill:area?'url(#trafficHatch)':'none','fill-rule':'evenodd',stroke:'#000000',
    'stroke-width':1.4,'stroke-linejoin':'round','vector-effect':'non-scaling-stroke'},group);
  }
 }
}
$('traffic').onchange=renderTraffic;
if(!trafficFeatures.length){$('traffic').checked=false;$('traffic').disabled=true;$('trafficInfo').textContent='Trafiksepareringsdata er ikke indlæst.';}
