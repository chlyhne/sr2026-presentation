const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),started=performance.now();
function run(args,env=process.env){
 const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
const extended=args[0]==='--extended',names=extended?args.slice(1):[];
if(args.length&&(!extended||!names.length)){
 console.error('Usage: node scripts/test.cjs [--extended gates zoom ...]');process.exit(1);
}
const browserFiles=names.map(name=>{
 if(!/^[a-z_]+$/.test(name))throw Error('Invalid test name: '+name);
 const file='scripts/test_viewer_'+name+'.cjs',source=fs.readFileSync(path.join(root,file),'utf8');
 if(/headless\s*:\s*false/.test(source))throw Error(file+' must use headless Firefox before running.');
 return file;
});
// Parse code without executing browser modules or loading generated data bundles.
let checked=0;
for(const folder of ['viewer','scripts'])for(const name of fs.readdirSync(path.join(root,folder))){
 if(!/\.(js|cjs)$/.test(name))continue;
 const file=path.join(root,folder,name);if(fs.statSync(file).size>1024*1024)continue;
 new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});checked++;
}
run(['--test','backend/worker.test.mjs','scripts/test_gate_timing.cjs','scripts/test_gate_results.cjs','scripts/test_time_gain.cjs','scripts/test_track_profiles.cjs','scripts/test_replay_data.cjs']);
console.log(`Quick checks passed: ${checked} syntax checks and focused logic tests in ${((performance.now()-started)/1000).toFixed(2)} s.`);
if(extended){
 const env={...process.env,SR_VIEWER_URL:process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/'};
 for(const file of browserFiles)run([file],env);
}
