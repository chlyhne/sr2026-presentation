const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 const commandFile=path.join(os.tmpdir(),'sr2026-client-control.json'),previous=fs.existsSync(commandFile)?fs.readFileSync(commandFile):null;
 try{
  const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8098/test/',url=new URL('api/client-control',base);
  const serverCommand={command:'reload',revision:'server-read-test',target:'test-no-client',expiresAt:Date.now()+60000};
  fs.writeFileSync(commandFile,JSON.stringify(serverCommand));
  const response=await fetch(url);assert.deepEqual(await response.json(),serverCommand);assert.match(response.headers.get('cache-control'),/no-store/);
  if(previous)fs.writeFileSync(commandFile,previous);else fs.unlinkSync(commandFile);
  const page=await browser.newPage(),errors=[],reports=[];
  let command={command:null},navigations=0;
  page.on('pageerror',error=>errors.push(error.message));page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  page.on('request',request=>{if(request.url().endsWith('/api/client-errors')&&request.method()==='POST')reports.push(request.postDataJSON());});
  await page.addInitScript(()=>{
   window.fixtureDirty=true;window.hasEventChanges=()=>fixtureDirty;
   window.SRReleaseGraphics=async()=>{await new Promise(resolve=>setTimeout(resolve,80));localStorage.setItem('reload-test-graphics-released',String(1+Number(localStorage.getItem('reload-test-graphics-released'))));};
  });
  await page.route('**/api/client-control',r=>r.fulfill({json:command}));
  await page.route('**/client-reload-test',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><body aria-busy="false"><p id="viewerLoadingStage">Reload test</p><progress id="viewerLoadingProgress" value="100" max="100"></progress><textarea id="note"></textarea><p data-client-report-status hidden></p><script src="config.js"></script><script src="client-diagnostics.js"></script>'}));
  await page.goto(new URL('client-reload-test',base).href);
  await page.evaluate(()=>{document.getElementById('note').value='Unsaved draft';});
  command={command:'reload',revision:'test-revision-1',target:'all',expiresAt:Date.now()+60000};
  await page.waitForFunction(()=>document.querySelector('[data-client-report-status]').textContent.includes('ugemte ændringer'));
  assert.equal(navigations,1);assert.equal(await page.locator('#note').inputValue(),'Unsaved draft');
  await page.evaluate(()=>SRClientDiagnostics.report('javascript','reload-buffer-test'));
  const navigation=page.waitForNavigation({waitUntil:'load'});
  await page.evaluate(()=>{fixtureDirty=false;document.getElementById('note').value='';localStorage.setItem('reload-test-saved-note','Saved note');});
  await navigation;assert.equal(navigations,2);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('sr2026-test-reload')),'test-revision-1');
  assert.equal(await page.evaluate(()=>localStorage.getItem('reload-test-saved-note')),'Saved note');
  assert.equal(await page.evaluate(()=>localStorage.getItem('reload-test-graphics-released')),'1');
  assert.ok(reports.some(report=>report.kind==='graphics-released'&&report.revision==='test-revision-1'));
  // The same command must not bounce the reloaded page into a loop.
  await page.waitForTimeout(2600);assert.equal(navigations,2);
  const acknowledgement=reports.find(report=>report.kind==='reload'&&report.revision==='test-revision-1');
  assert.ok(acknowledgement?.recentErrors.some(error=>error.message==='reload-buffer-test'));
  const persisted=fs.readFileSync(path.join(os.tmpdir(),'sr2026-client-errors.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(persisted.some(entry=>entry.report.kind==='reload'&&entry.report.revision==='test-revision-1'));
  // A later revision can reload again; the current expired revision cannot.
  await page.evaluate(()=>{fixtureDirty=false;});
  command={command:'reload',revision:'expired',target:'all',expiresAt:Date.now()-1};
  await page.waitForTimeout(2300);assert.equal(navigations,2);
  const secondNavigation=page.waitForNavigation({waitUntil:'load'});
  command={command:'reload',revision:'test-revision-2',target:'all',expiresAt:Date.now()+60000};await secondNavigation;
  assert.equal(navigations,3);
  await page.evaluate(()=>{fixtureDirty=false;document.body.setAttribute('aria-busy','true');});
  command={command:'reload',revision:'test-revision-3',target:'all',expiresAt:Date.now()+60000};
  await page.waitForFunction(()=>document.querySelector('[data-client-report-status]').textContent.includes('igangværende indlæsning'));
  assert.equal(navigations,3);
  const afterLoading=page.waitForNavigation({waitUntil:'load'});
  await page.evaluate(()=>document.body.setAttribute('aria-busy','false'));await afterLoading;assert.equal(navigations,4);
  // A fresh document fetched after an existing command already fulfils it.
  command={command:'reload',revision:'already-loaded',target:'all',expiresAt:Date.now()+60000};
  await page.route('**/config.js',async route=>{
   const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\nSR_CONFIG.clientControlRevision="already-loaded";'});
  });
  await page.goto(new URL('client-reload-test',base).href);assert.equal(navigations,5);
  await page.evaluate(()=>{fixtureDirty=false;});await page.waitForTimeout(2600);assert.equal(navigations,5);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('sr2026-test-reload')),'already-loaded');
  assert.deepEqual(errors,[]);
  console.log('Firefox: command endpoint, real reload, protected drafts/loading, persisted error acknowledgement, revision deduplication, fresh-document consumption and expiry passed.');
 }finally{
  if(previous)fs.writeFileSync(commandFile,previous);else if(fs.existsSync(commandFile))fs.unlinkSync(commandFile);
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exit(1);});
