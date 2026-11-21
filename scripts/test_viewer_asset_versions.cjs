const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));

(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[],assets=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/\.(js|css)$/,route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname.endsWith('/config.js'))return route.continue();
   assets.push(pathname);
   return /\/assets\/[a-f0-9]{20}\//.test(pathname)?route.continue():route.abort();
  });
  await page.goto(new URL('events/silverrudder-2025/',process.env.SR_VIEWER_URL).href);
  await page.waitForSelector('main:not([inert])');
  const revision=assets.find(asset=>asset.endsWith('/boot.js')).match(/\/assets\/[a-f0-9]{20}\//)[0];
  assert.ok(assets.some(asset=>asset.endsWith('/viewer.js')));
  assert.ok(assets.some(asset=>asset.endsWith('/viewer.css')));
  assert.ok(assets.every(asset=>asset.includes(revision)));
  assert.deepEqual(errors,[]);
  console.log('Firefox: the packaged tracker starts with one asset version and no legacy script or style URLs.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
