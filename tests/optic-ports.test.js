const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./harness');
// #256: a 1.6T transponder on 800G routers hands off as two 800G clients, so it takes two ports at each end.
function setup(ev,g){ev(`ACT.start({});S.cash=1e9;S.lvl=13;S.day=100;for(const g of GOALS)S.done[g.id]=0;
 S.pops.fra.rgen=${g};S.pops.fra.routers=1;S.pops.ams={...S.pops.fra};
 S.links=[{id:'fiber',a:'fra',b:'ams',kind:'df',own:false,sys:'roadm',km:400,ch:[],ready:0,day:0,cut:0,mo:1}];compute();`);}
test('#256 a 1.6T optic takes two 800G router ports at each end, one 1.6T port',()=>{
 const {ev,dom,errors}=load();try{
 setup(ev,'mainRG(2)');
 assert.equal(ev("RG[S.pops.fra.rgen].pn"),'800G');
 ev("ACT.addCh({id:'fiber',o:'tp16'})");
 assert.equal(ev('portsUsed("fra")'),2,'two 800G clients');assert.equal(ev('portsUsed("ams")'),2);
 ev("ACT.addCh({id:'fiber',o:'zr8'})");
 assert.equal(ev('portsUsed("fra")'),3,'an 800ZR+ plugs into one port');
 ev("ACT.setChCount({id:'fiber',o:'tp16',n:3})");
 assert.equal(ev('portsUsed("fra")'),7);
 // the panel says so
 ev("UI.sel={type:'link',id:'fiber'};renderPanel()");
 assert.match(dom.window.document.getElementById('panel').textContent,/takes 2 router ports at each end/);
 // a 1.6T router carries the same optic in one port, and the swap is counted at the new speed
 assert.equal(ev('portsUsed("fra",mainRG(3))'),4);
 ev('S.pops.fra.rgen=S.pops.ams.rgen=mainRG(3)');
 assert.equal(ev('portsUsed("fra")'),4);
 assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
test('#256 a full 800G router has no room for a 1.6T optic that needs two ports',()=>{
 const {ev,dom}=load();try{
 setup(ev,'mainRG(2)');
 const free=ev('portsMax("fra")')-1;
 ev(`S.links[0].ch=Array(${free}).fill('zr8');compute()`);
 assert.equal(ev('portsMax("fra")-portsUsed("fra")'),1);
 ev("ACT.addCh({id:'fiber',o:'tp16'})");
 assert.equal(ev("S.links[0].ch.filter(o=>o==='tp16').length"),0,'one free port is not enough');
 ev("ACT.addCh({id:'fiber',o:'zr8'})");
 assert.equal(ev('portsMax("fra")-portsUsed("fra")'),0,'but an 800ZR+ still fits');
 }finally{dom.window.close();}
});
