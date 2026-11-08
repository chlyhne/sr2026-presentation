// Metres. Other boats use provisional dimensions until measured values are supplied.
const boatDimensionOverrides={
 mercutio:{lengthM:8,beamM:2.54},vera:{lengthM:8,beamM:2.54},
 my:{lengthM:8,beamM:2.54},saltamalin:{lengthM:8,beamM:2.54},
 'the hulk':{lengthM:10.3,beamM:2.18},
 'rosa-lux':{lengthM:10,beamM:3},
 alice:{lengthM:8,beamM:2.51},moster:{lengthM:7.77,beamM:2.5}
};
function boatDimensions(name){
 return boatDimensionOverrides[name.toLowerCase()]||{lengthM:10,beamM:3,estimated:true};
}
// Hull from cuteboat.svg. Its tight bounds map the hull to unit beam and length.
const BOAT_HULL_PATH='m 16.707798,43.669827 c -0.06396,3.175447 0.191719,6.871511 0.191719,6.871511 h 3.93206 3.931543 c 0,0 0.4548,-6.570802 0,-9.717352 -0.674261,-4.664911 -3.928601,-12.781853 -3.931543,-12.789192 -0.0029,0.0073 -3.257799,8.12428 -3.93206,12.789192 -0.1137,0.786637 -0.170401,1.787359 -0.191719,2.845841 z';
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
 const icon=el('g',{class:'boat-icon','data-lat':position.point[1],
  'data-course':boatCourse(boat.points,time),'data-length-m':boat.dimensions.lengthM,
  'data-beam-m':boat.dimensions.beamM},group);
 // Coordinates and bounds come directly from the supplied Inkscape hull.
 el('path',{class:'boat-hull',d:BOAT_HULL_PATH,
  transform:`scale(${1/8.26772689819336} ${1/22.506546020507812}) translate(-20.831390380859375 -39.288063049316406)`,
  fill:colour,stroke:'#14212a','stroke-width':1,'vector-effect':'non-scaling-stroke'},icon);
}
function resizeBoatIcons(matrix){
 // The map is linear in longitude/latitude, so east and north have distinct scales.
 const radians=Math.PI/180,earthRadius=6371008.8;
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
  const minimumScale=Math.max(1,8/(beam*Math.hypot(bx,by)));
  icon.dataset.displayBeamPx=beam*Math.hypot(bx,by)*minimumScale;
  icon.setAttribute('transform',`matrix(${bx*beam*minimumScale} ${by*beam*minimumScale} ${-lx*length*minimumScale} ${-ly*length*minimumScale} 0 0)`);
  const name=icon.parentNode.querySelector('.boat-name');
  if(name)name.setAttribute('x',Math.max(7,(Math.abs(bx*beam)+Math.abs(lx*length))*minimumScale/2+3));
 }
}
