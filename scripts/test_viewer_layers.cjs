const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('events/sjaelland-rundt-2026/',process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/').href);
  await page.waitForSelector('main:not([inert])');
  await page.evaluate(()=>{setCurrentTime(1781200800);stopPlayback();});
  const wind=page.locator('#wind'),rain=page.locator('#rain');
  assert.equal(await wind.getAttribute('data-mode'),'off');
  await wind.click();
  assert.equal(await wind.getAttribute('data-mode'),'mean');
  await page.waitForFunction(()=>$('winds').getAttribute('visibility')==='visible');
  const before=await page.locator('#winds path').evaluateAll(paths=>paths.map(p=>p.getAttribute('d')));
  await rain.click();
  assert.equal(await rain.getAttribute('aria-pressed'),'true');
  await wind.click();
  assert.equal(await wind.getAttribute('data-mode'),'gust');
  await page.waitForFunction(old=>[...$('winds').children].some((path,index)=>path.getAttribute('d')!==old[index]),before);
  assert.equal(await rain.getAttribute('aria-pressed'),'true');
  assert.deepEqual(await page.evaluate(()=>[sceneSettings().windMode,eventSettings({wind:true}).windMode]),['gust','mean']);
  await wind.click();
  await page.waitForFunction(()=>$('winds').getAttribute('visibility')==='hidden');
  await rain.click();
  assert.equal(await rain.getAttribute('aria-pressed'),'false');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
