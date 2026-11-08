const militaryFeatures=(D.military_areas?.features||[]).map(feature=>{
 const rings=feature.geometry.coordinates;
 let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
 for(const ring of rings)for(const [lon,lat] of ring){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
 return {...feature,bounds:{west,east,south,north},d:rings.map(ring=>path(ring)+'Z').join(' ')};
});
const militaryHatch=el('pattern',{id:'militaryHatch',width:8,height:8,patternUnits:'userSpaceOnUse'},$('map').querySelector('defs'));
el('path',{d:'M -2 2 L 2 -2 M 0 8 L 8 0 M 6 10 L 10 6',stroke:'#000000','stroke-width':1.2,opacity:.7},militaryHatch);
let militaryKey=null;
function renderMilitary(){
 const layer=$('militaryAreas'),enabled=$('military').checked;
 layer.setAttribute('display',enabled?'inline':'none');
 if(!enabled)return;
 const viewport=mapViewport();if(!viewport)return;
 const {bounds,matrix}=viewport;
 const scale=1/Math.hypot(matrix.a,matrix.b);
 militaryHatch.setAttribute('patternTransform',`scale(${scale})`);
 const key=[bounds.west,bounds.east,bounds.south,bounds.north].join(':');if(key===militaryKey)return;
 militaryKey=key;layer.replaceChildren();
 for(const feature of militaryFeatures){
  const b=feature.bounds;if(b.east<bounds.west||b.west>bounds.east||b.north<bounds.south||b.south>bounds.north)continue;
  const group=el('g',{'data-military-id':feature.id,'aria-label':feature.properties.name},layer);
  el('title',{},group).textContent=feature.properties.name+' · skydeområdets afgrænsning';
  el('path',{d:feature.d,fill:'#000000','fill-opacity':.035,stroke:'none','fill-rule':'evenodd'},group);
  el('path',{d:feature.d,fill:'url(#militaryHatch)','fill-rule':'evenodd',stroke:'#000000',
   'stroke-width':1.4,'stroke-linejoin':'round','vector-effect':'non-scaling-stroke'},group);
 }
}
$('military').onchange=renderMilitary;
if(!militaryFeatures.length){$('military').checked=false;$('military').disabled=true;$('militaryInfo').textContent='Skydeområdets afgrænsning er ikke indlæst.';}
