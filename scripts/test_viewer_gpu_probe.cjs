const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8098/test/';
  for(const mode of ['minimal','minimal-no-aa','line','background','background-real','upload']){
   const page=await browser.newPage(),errors=[],reports=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/client-errors'))reports.push(request.postDataJSON());});
   await page.route('**/api/client-control',route=>route.fulfill({json:{command:null,probe:mode}}));
   await page.goto(new URL('gpu-probe.html',base).href);
   await page.waitForFunction(()=>document.getElementById('probeResult').textContent.startsWith('Test bestået'),null,{timeout:30000});
   assert.equal(await page.locator('#probeResult').textContent(),'Test bestået: '+mode);
   const context=reports.find(report=>report.kind==='gpu-probe-context');
   assert.equal(context.version,1);assert.equal(typeof context.webglVersion,'string');assert.equal(context.attributes.antialias,mode!=='minimal-no-aa');
   if(mode==='background')assert.ok(reports.some(report=>report.kind==='gpu-probe-second-context'&&report.attributes.depth===false));
   if(mode==='background-real')assert.ok(reports.some(report=>report.kind==='gpu-probe-geometry'&&report.coastBytes>1000000));
   if(mode==='upload')assert.equal(reports.filter(report=>report.kind==='gpu-probe-upload').length,2);
   if(mode==='line')assert.deepEqual(reports.filter(report=>report.kind==='gpu-probe-draw').map(report=>report.count),[1,8193]);
   if(mode==='minimal'||mode==='minimal-no-aa')assert.ok(reports.some(report=>report.kind==='gpu-probe-draw'&&report.pixel[1]===255));
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Firefox: minimal WebGL draws, actual line/background vertices and second context creation passed; diagnostic protocol/version preserved.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
