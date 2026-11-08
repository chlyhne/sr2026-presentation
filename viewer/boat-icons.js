// Metres. Other boats use provisional dimensions until measured values are supplied.
const boatMetadataOverrides={
 mercutio:{lengthM:8,beamM:2.54,hull:'modern'},vera:{lengthM:8,beamM:2.54,hull:'modern'},
 my:{lengthM:8,beamM:2.54,hull:'modern'},saltamalin:{lengthM:8,beamM:2.54,hull:'modern'},
 'the hulk':{lengthM:10.3,beamM:3.18,hull:'modern'},
 'rosa-lux':{lengthM:10,beamM:3,hull:'common'},
 xbox:{lengthM:12.75,beamM:4.18,hull:'modern'},
 'quinta light':{lengthM:12.55,beamM:4.3,hull:'modern'},
 'hansen 3.5':{lengthM:10.65,beamM:3.53},
 munje:{lengthM:13.35,beamM:4.25,hull:'common'},
 'vi ses':{lengthM:10.21,beamM:3.21,hull:'common'},
 'dream on':{lengthM:15.88,beamM:3.86,hull:'common'},
 norma:{lengthM:9.96,beamM:3.1,hull:'common'},
 // User-approved standard Luffe 40: https://sailboatdata.com/sailboat/luffe-40/
 'tjørn':{lengthM:12.25,beamM:3.3,hull:'common'},
 // 39 feet, with Munje's length-to-beam ratio as requested.
 sabrina:{lengthM:39*0.3048,beamM:39*0.3048*4.25/13.35,hull:'common'},
 laolao:{hull:'modern'},
 alice:{lengthM:8,beamM:2.51},moster:{lengthM:7.77,beamM:2.5},
 slipstik:{lengthM:10,beamM:2.3,hull:'classic'},ambra:{lengthM:10,beamM:2.3,hull:'classic'}
};
function boatMetadata(name){
 const key=name.toLowerCase(),manual=boatMetadataOverrides[key]||{};
 const dimensions=manual.lengthM!==undefined
  ?{lengthM:manual.lengthM,beamM:manual.beamM,measurementBasis:'user'}
  :sourcedBoatDimensions[key]||{lengthM:10,beamM:3,estimated:true};
 return {...dimensions,hull:manual.hull||'common'};
}
// Load the editable SVG assets once. Tight hull bounds define true length and beam.
const boatHulls={};
async function loadBoatHulls(){
 for(const name of ['modern','classic','common']){
  const response=await fetch(name+'.svg');
  if(!response.ok)throw new Error('Bådformen '+name+' kunne ikke indlæses.');
  const svg=new DOMParser().parseFromString(await response.text(),'image/svg+xml');
  const d=svg.querySelector('path')?.getAttribute('d');
  if(!d)throw new Error('Bådformen '+name+' mangler et skrog.');
  const measuring=document.createElementNS('http://www.w3.org/2000/svg','svg');
  measuring.style.cssText='position:absolute;width:0;height:0;visibility:hidden';
  const path=document.createElementNS(measuring.namespaceURI,'path');path.setAttribute('d',d);
  measuring.append(path);document.body.append(measuring);
  const bounds=path.getBBox();measuring.remove();
  boatHulls[name]={d,transform:`scale(${1/bounds.width} ${1/bounds.height}) translate(${-bounds.x-bounds.width/2} ${-bounds.y-bounds.height/2})`};
 }
}
function boatCourse(points,time){
 const i=Math.max(0,timeBoundary(points,time,true)-1),a=points[i],b=points[i+1];
 if(b&&b[2]>a[2]&&b[2]-a[2]<=TRACK_MAX_GAP){
  const v=trackValue(points,i,time).velocity;
  if(Math.hypot(v[0],v[1])>1e-12)return Math.atan2(v[0]*Math.cos(a[1]*Math.PI/180),v[1]);
  if(b[0]!==a[0]||b[1]!==a[1])return Math.atan2((b[0]-a[0])*Math.cos(a[1]*Math.PI/180),b[1]-a[1]);
 }
 if(i>0&&a[2]-points[i-1][2]<=TRACK_MAX_GAP){
  const previous=points[i-1];return Math.atan2((a[0]-previous[0])*Math.cos(a[1]*Math.PI/180),a[1]-previous[1]);
 }
 return 0;
}
function renderBoatIcon(group,boat,position,time,colour){
 const hull=boatHulls[boat.metadata.hull];
 const icon=el('g',{class:'boat-icon','data-hull':boat.metadata.hull,'data-lat':position.point[1],
  'data-course':boatCourse(boat.points,time),'data-length-m':boat.metadata.lengthM,
  'data-beam-m':boat.metadata.beamM},group);
 el('path',{class:'boat-hull',d:hull.d,transform:hull.transform,
  fill:colour,stroke:'#14212a','stroke-width':1,'vector-effect':'non-scaling-stroke'},icon);
}
function resizeBoatIcons(matrix){
 // The map is linear in longitude/latitude, so east and north have distinct scales.
 const radians=Math.PI/180,earthRadius=6371008.8,minimumPixelsPerMetre=8/2.54;
 for(const icon of $('map').querySelectorAll('.boat-icon')){
  const latitude=+icon.dataset.lat*radians,course=+icon.dataset.course;
  const east=1000/(4.5*radians*earthRadius*Math.cos(latitude));
  const north=1180/(3*radians*earthRadius);
  const sin=Math.sin(course),cos=Math.cos(course);
  const beam=+icon.dataset.beamM,length=+icon.dataset.lengthM;
  // Screen-space vectors for starboard beam and the stern-to-bow axis.
  const bx=matrix.a*east*cos+matrix.c*north*sin;
  const by=matrix.b*east*cos+matrix.d*north*sin;
  const lx=matrix.a*east*sin-matrix.c*north*cos;
  const ly=matrix.b*east*sin-matrix.d*north*cos;
  // The minimum is pixels per metre, shared by all hull sizes.
  const beamScale=Math.max(1,minimumPixelsPerMetre/Math.hypot(bx,by));
  const lengthScale=Math.max(1,minimumPixelsPerMetre/Math.hypot(lx,ly));
  icon.dataset.displayBeamPx=beam*Math.hypot(bx,by)*beamScale;
  icon.setAttribute('transform',`matrix(${bx*beam*beamScale} ${by*beam*beamScale} ${-lx*length*lengthScale} ${-ly*length*lengthScale} 0 0)`);
  const name=icon.parentNode.querySelector('.boat-name');
  if(name)name.setAttribute('x',Math.max(7,(Math.abs(bx*beam)*beamScale+Math.abs(lx*length)*lengthScale)/2+3));
 }
}
