const trafficFeatures=D.traffic_separation.features.map(feature=>{
 if(feature.properties.kind!=='restricted_area')throw Error('Trafikseparering mangler forberedt områdeflade.');
 const geometry=feature.geometry;
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:null;
 if(!polygons)throw Error('Ugyldig områdeflade for trafikseparering.');
 const lines=polygons.flat();
 let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
 for(const line of lines)for(const [lon,lat] of line){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
 return {...feature,bounds:{west,east,south,north},d:lines.map(line=>path(line)+'Z').join(' ')};
});
const trafficHatch=el('pattern',{id:'trafficHatch',width:8,height:8,patternUnits:'userSpaceOnUse'},$('map').querySelector('defs'));
el('path',{d:'M -2 2 L 2 -2 M 0 8 L 8 0 M 6 10 L 10 6',stroke:'#000000','stroke-width':1.2,opacity:.7},trafficHatch);
let trafficKey=null;
function renderTraffic(){
 const layer=$('trafficSeparation'),enabled=$('traffic').checked;
 setAttr(layer,'display',enabled?'inline':'none');
 if(!enabled)return;
 const bounds=visibleMapBounds(),viewport=mapViewport();if(!bounds||!viewport)return;
 const {matrix,rect}=viewport;
 const key=[bounds.west,bounds.east,bounds.south,bounds.north,rect.width,rect.height].join(':');
 if(key===trafficKey)return;
 trafficKey=key;
 setAttr(trafficHatch,'patternTransform',`scale(${1/Math.hypot(matrix.a,matrix.b)})`);
 for(const feature of trafficFeatures){
  const b=feature.bounds;
  if(b.east<bounds.west||b.west>bounds.east||b.north<bounds.south||b.south>bounds.north){feature.node?.remove();continue;}
  if(!feature.node){
   const group=feature.node=el('g',{'data-tss-id':feature.id,'data-tss-kind':'restricted_area'});
   el('title',{},group).textContent=feature.properties.name;
   el('path',{d:feature.d,fill:'#000000','fill-opacity':.035,stroke:'none','fill-rule':'evenodd'},group);
   el('path',{d:feature.d,fill:'url(#trafficHatch)','fill-rule':'evenodd',stroke:'#000000',
    'stroke-width':1.4,'stroke-linejoin':'round','vector-effect':'non-scaling-stroke'},group);
  }
  if(!feature.node.parentNode)layer.append(feature.node);
 }
}
$('traffic').onchange=renderTraffic;
