const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const navigation=fs.readFileSync('viewer/navigation.js','utf8'),viewer=fs.readFileSync('viewer/viewer.js','utf8');
// Exercise the production SVG composition without loading a browser or fleet.
const element=(tag,attrs={},parent)=>{
 const node={tag,attrs,children:[],textContent:'',setAttribute(key,value){this.attrs[key]=value;}};
 if(parent)parent.children.push(node);return node;
};
const context=vm.createContext({el:element,screenGroup:(x,y,parent)=>element('g',{'data-screen-x':x,'data-screen-y':y},parent)});
vm.runInContext(viewer.split('\n').find(line=>line.startsWith('const xy=')),context);
const project=vm.runInContext('xy',context);
vm.runInContext(navigation.slice(navigation.indexOf('function drawGateResults('),navigation.indexOf("$('mapMeasureToggle').onclick")),context);
const rows=[{boat:{id:'fast',name:'Mercutio'},passage:{elapsed:240},duration:'04:00,0'},
 {boat:{id:'slow',name:'Vera'},passage:{elapsed:360},duration:'06:00,0'}];
const variants=[
 [[12,55.5],[12,55.6],[12.1,55.5],[12.1,55.6]],
 [[12.1,55.5],[12.1,55.6],[12,55.5],[12,55.6]],
 [[12,55.5],[12.1,55.5],[12,55.6],[12.1,55.6]],
 [[12,55.6],[12.1,55.6],[12,55.5],[12.1,55.5]],
 [[12,55.5],[12.1,55.6],[12.1,55.5],[12.2,55.6]],
 [[12,55.5],[12.1,55.6],[12.2,55.6],[12.1,55.5]]
];
for(const gates of variants){
 const layer=element('g');context.drawGateResults(layer,gates,rows);
 const anchor=layer.children[0],panel=anchor.children[0],rect=panel.children[0],{width,height}=rect.attrs;
 const [left,top]=panel.attrs.transform.match(/translate\(([^ ]+) ([^)]+)\)/).slice(1).map(Number);
 const projected=gates.map(project),[firstA,firstB,a,b]=projected;
 const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],from=[(firstA[0]+firstB[0])/2,(firstA[1]+firstB[1])/2];
 assert.equal(anchor.attrs['data-screen-x'],mid[0]);assert.equal(anchor.attrs['data-screen-y'],mid[1]);
 let nx=b[1]-a[1],ny=a[0]-b[0];const length=Math.hypot(nx,ny);nx/=length;ny/=length;
 if(nx*(mid[0]-from[0])+ny*(mid[1]-from[1])<0){nx=-nx;ny=-ny;}
 const nearest=Math.min(...[[left,top],[left+width,top],[left,top+height],[left+width,top+height]].map(([x,y])=>nx*x+ny*y));
 assert.ok(Math.abs(nearest-24)<1e-9,'The whole upright list clears gate 2 by 24 screen pixels in every direction');
 const rendered=panel.children.filter(node=>node.attrs.class==='gate-result');
 assert.deepEqual(rendered.map(node=>node.children.map(cell=>cell.textContent)),[[1,'Mercutio','04:00,0'],[2,'Vera','06:00,0']]);
 assert.deepEqual(rendered.map(node=>node.attrs['data-boat-id']),['fast','slow']);
 assert.ok(rect.attrs.width>150&&rect.attrs.height>60,'The list has a readable panel');
}
console.log('Gate results: ranked rows, geographic anchor, and the entire panel outside the finish gate in six orientations.');
