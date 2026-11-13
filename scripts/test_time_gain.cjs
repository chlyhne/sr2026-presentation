const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../viewer/navigation-math.js'),'utf8'),context);
const gain=context.timeGainPer100Meters,density=speed=>3600/(1852*Math.abs(speed));
const near=(actual,expected)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-9,`${actual} expected ${expected}`);

test('time density differences show seconds gained per 100 physical meters',()=>{
 near(gain(density(4),density(4)),0);
 near(gain(density(3),density(4)),-360000/1852/12);
 near(gain(density(13),density(14)),-360000/1852/182);
 near(gain(density(4),density(3)),360000/1852/12);
 assert.ok(Math.abs(gain(density(3),density(4)))>15*Math.abs(gain(density(13),density(14))));
});

test('a reference crossing three times contributes triple density; own reverse is positive time',()=>{
 near(gain(density(4),3*density(4)),200*density(4));
 near(gain(density(-4),3*density(4)),200*density(4));
 near(gain(density(-4),density(4)),0);
});

test('zero progress has explicit overflow, not a missing colour; infinity minus infinity is undefined',()=>{
 assert.ok(gain(Infinity,density(5))< -1e16);
 assert.ok(gain(density(5),Infinity)>1e16);
 assert.equal(gain(Infinity,Infinity),null);
 assert.equal(gain(Math.fround(1e15),Math.fround(1e15)),null);
 assert.equal(gain(Math.fround(1e15),Infinity),null);
 near(gain(0,0),0);
 for(const [own,reference] of [[-1,1],[1,-1],[NaN,1],[1,NaN],[undefined,1],[1,undefined],[null,1],[1,null],[-Infinity,1]])assert.equal(gain(own,reference),null);
});
