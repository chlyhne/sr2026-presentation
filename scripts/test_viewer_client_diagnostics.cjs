const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8098/test/',page=await browser.newPage(),marker='diagnostics-test-'+Date.now();
  const html='<!doctype html><meta charset="utf-8"><body aria-busy="true"><section id="viewerLoading"><progress id="viewerLoadingProgress" value="85" max="100"></progress><p id="viewerLoadingStage">Testtrin</p><p id="viewerLoadingError" hidden></p><button id="viewerLoadingRetry" hidden></button><p data-client-report-status hidden></p></section><section id="renderingError" hidden><pre id="renderingErrorDetails"></pre><button id="reloadRendering"></button></section><button id="play"></button><textarea id="note">PRIVATE TEST DRAFT</textarea>';
  await page.route('**/client-diagnostics-test',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:html}));
  await page.goto(new URL('client-diagnostics-test',base).href);
  await page.evaluate(()=>{window.$=id=>document.getElementById(id);const interval=window.setInterval;window.setInterval=(fn,ms)=>interval(fn,ms===5000?50:ms);});
  await page.addScriptTag({url:new URL('config.js',base).href});
  await page.addScriptTag({url:new URL('client-diagnostics.js',base).href});
  await page.waitForResponse(response=>response.url().endsWith('/api/client-errors')&&response.request().postDataJSON().kind==='loading'&&response.status()===201);
  await page.addScriptTag({url:new URL('rendering.js',base).href});
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../viewer/boot.js'),'utf8').split('(async()=>{')[0]});
  await page.evaluate(marker=>{
   SRClientDiagnostics.register('spor',()=>({phase:'Kompilér testshader',canvas:[300,150],contextLost:true,boatsPrepared:0}));
   reportRenderingFailure('Spor',Error(marker));reportRenderingFailure('Spor',Error(marker));
   showViewerLoadingError(Error(marker+'-loader'));
   dispatchEvent(new ErrorEvent('error',{message:marker+'-javascript',error:Error(marker+'-javascript')}));
  },marker);
  await page.waitForFunction(()=>document.querySelector('[data-client-report-status]').textContent.includes('sendt'));
  const file=path.join(os.tmpdir(),'sr2026-client-errors.jsonl');
  let reports;
  await (async()=>{
   for(let i=0;i<30;i++){
    reports=fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
    if(reports.filter(entry=>entry.report.message.startsWith(marker)).length===3)return;
    await new Promise(resolve=>setTimeout(resolve,50));
   }
   throw Error('Client reports were not written to the local server log');
  })();
  const received=reports.filter(entry=>entry.report.message.startsWith(marker));
  assert.equal(received.length,3);assert.deepEqual(received.map(entry=>entry.report.kind).sort(),['javascript','loading-error','rendering-Spor']);
  assert.equal(received[0].report.state.progress,85);assert.equal(received[0].report.state.stage,'Testtrin');
  assert.equal(received[0].report.state.contexts.spor.phase,'Kompilér testshader');assert.deepEqual(received[0].report.state.contexts.spor.canvas,[300,150]);
  assert.equal(JSON.stringify(received).includes('PRIVATE TEST DRAFT'),false);
  // Reporting failure remains visible and does not recursively report itself.
  await page.route('**/api/client-errors',r=>r.fulfill({status:503,body:'unavailable'}));
  assert.equal(await page.evaluate(()=>SRClientDiagnostics.report('javascript','delivery-failure-test')),false);
  assert.match(await page.locator('[data-client-report-status]').textContent(),/kunne ikke afleveres.*HTTP 503/);
  const publicPage=await browser.newPage();
  await publicPage.route('**/client-diagnostics-test',r=>r.fulfill({contentType:'text/html',body:html}));
  await publicPage.goto(new URL('client-diagnostics-test',base).href);
  await publicPage.evaluate(()=>{window.SR_CONFIG={admin:false,apiBase:''};});
  await publicPage.addScriptTag({url:new URL('client-diagnostics.js',base).href});
  assert.equal(await publicPage.evaluate(()=>typeof SRClientDiagnostics),'undefined');
  const url=new URL('api/client-errors',base),origin=new URL(base).origin;
  const forbidden=await fetch(url,{method:'POST',headers:{Origin:'http://another-host','Content-Type':'application/json'},body:JSON.stringify({version:1,session:'test',kind:'test',message:marker})});
  assert.equal(forbidden.status,403);
  const malformed=await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'invalid'});assert.equal(malformed.status,400);
  console.log('Firefox: automatic rendering/loading/JS reports reached the actual local log, metadata, deduplication, loading heartbeat, failed delivery status and disabled public telemetry passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
