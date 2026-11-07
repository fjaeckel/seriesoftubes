const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./harness');
// #257: months have their real lengths, and leap years come every four years (not every hundred, but every four hundred).
test('#257 the calendar has real months and leap years',()=>{
 const {ev,dom,errors}=load();try{
 ev("ACT.start({})");
 assert.equal(ev('dateStr(0)'),'Y1 · Jan 1');
 assert.equal(ev('dateStr(30)'),'Y1 · Jan 31','January has 31 days');
 assert.equal(ev('dateStr(31)'),'Y1 · Feb 1');
 assert.equal(ev('dateStr(58)'),'Y1 · Feb 28');
 assert.equal(ev('dateStr(59)'),'Y1 · Mar 1','no 29 February in Y1');
 assert.equal(ev('dateStr(364)'),'Y1 · Dec 31');
 assert.equal(ev('dateStr(365)'),'Y2 · Jan 1');
 const y4=ev('yearStart(4)');assert.equal(y4,3*365);
 assert.equal(ev(`dateStr(${y4}+59)`),'Y4 · Feb 29','Y4 is a leap year');
 assert.equal(ev(`dateStr(${y4}+365)`),'Y4 · Dec 31');
 assert.equal(ev(`dateStr(${y4}+366)`),'Y5 · Jan 1');
 assert.equal(ev('[100,200,400].map(leapY).join()'),'false,false,true');
 // every day is one date, in order: a round trip through dayOf over 401 years
 assert.equal(ev(`(()=>{for(let d=0;d<yearStart(402);d++){const c=cal(d);if(dayOf(c.y,c.m,c.d)!==d)return d;}return -1})()`),-1);
 assert.equal(ev('[0,31,59,90].map(monLen).join()'),'31,28,31,30');
 assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
test('#257 loan statements and the intern budget follow calendar months',()=>{
 const {ev,dom}=load();try{
 ev("ACT.start({})");
 assert.equal(ev('monthiversary(30,58)'),true,'a loan taken on 31 January has its statement on 28 February');
 assert.equal(ev('monthiversary(30,59)'),false);
 assert.equal(ev('monthiversary(30,89)'),true,'and on 31 March');
 assert.equal(ev('monthiversary(30,30)'),false,'not on the day it starts');
 assert.equal(ev('[30,31,58,59].map(monthIdx).join()'),'0,1,1,2');
 // an old save, mid-month in 30-day months, keeps its intern budget month
 ev("const s=JSON.parse(JSON.stringify(S));delete s.calV;s.day=95;s.ops.mon=3;migrate(s);window.__s=s");
 assert.equal(ev('__s.ops.mon'),ev('monthIdx(95)'));assert.equal(ev('__s.calV'),1);
 assert.equal(ev('S.calV'),1,'new games start on the calendar');
 }finally{dom.window.close();}
});
test('#257 conferences fall on the 10th of their month',()=>{
 const {ev,dom}=load();try{
 ev("ACT.start({});S.day=0");
 const c=ev("upcomingConfs(400).map(x=>dateStr(x.day))");
 assert.ok(c.length>0);for(const x of c)assert.match(x,/ 10$/);
 }finally{dom.window.close();}
});
