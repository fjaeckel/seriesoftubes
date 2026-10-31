const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./harness');
function setup(ev,sub=false){ev(`ACT.start({});S.cash=1e9;S.lvl=13;S.day=100;for(const g of GOALS)S.done[g.id]=0;
 S.pops.fra.rgen=mainRG(4);S.pops.fra.routers=16;S.pops.ams={...S.pops.fra};
 S.links=[{id:'fiber',a:'fra',b:'ams',kind:'df',own:true,sub:${sub},sys:'roadm',km:400,ch:[],ready:0,day:0,cut:0,mo:1}];
 UI.sel={type:'link',id:'fiber'};renderPanel();`);}
const count=ev=>ev('S.links[0].ch.length');
for(const sub of [false,true])test(`typed counts buy and remove optics on ${sub?'subsea':'land'} fiber`,()=>{
 const {ev,dom,errors}=load();try{
 setup(ev,sub);const doc=dom.window.document;
 const f=doc.querySelector('form.optic-count[data-optic="zr4"]'),input=f.elements.count;
 input.focus();input.value='5';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 const cost=ev("5*chCost(S.links[0],'zr4')"),cash=ev('S.cash');
 assert.ok(f.querySelector('button').textContent.includes(ev(`fmt$(${cost})`)));
 ev('S.day++;renderPanel()');
 assert.equal(doc.activeElement,input,'tick preserves the focused field');assert.equal(input.value,'5');
 assert.ok(f.querySelector('button').textContent.includes(ev(`fmt$(${cost})`)));
 f.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(count(ev),5);assert.equal(cash-ev('S.cash'),cost);
 ev("ACT.setChCount({id:'fiber',o:'zr4',n:2})");assert.equal(count(ev),2);assert.equal(ev('S.spares.zr4'),3);
 const before=ev('S.cash');ev("ACT.setChCount({id:'fiber',o:'zr4',n:5})");assert.equal(count(ev),5);assert.equal(ev('S.cash'),before);assert.equal(ev('S.spares.zr4'),0);
 ev("ACT.setChCount({id:'fiber',o:'zr4',n:0})");assert.equal(count(ev),0);assert.equal(ev('S.spares.zr4'),5);
 assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
test('batch price matches individual channel purchases with spares, regen cards and tariffs',()=>{
 const {ev,dom}=load();try{setup(ev);ev("S.links[0].regen=2;S.spares={zr4:2};S.ev.tariff=S.day+20");
 const expected=ev("2*Math.round(optCost('zr4')*REGEN_CH*2)+3*Math.round(optCost('zr4')*(1+REGEN_CH*2))");
 assert.equal(ev("opticCountCost(S.links[0],'zr4',5)"),expected);
 const cash=ev('S.cash');ev("ACT.setChCount({id:'fiber',o:'zr4',n:5})");assert.equal(cash-ev('S.cash'),expected);
 setup(ev);ev("S.links[0].regen=2;S.spares={zr4:2};S.ev.tariff=S.day+20");const cash2=ev('S.cash');
 ev("for(let i=0;i<5;i++)ACT.addCh({id:'fiber',o:'zr4'})");assert.equal(cash2-ev('S.cash'),expected);
 }finally{dom.window.close();}
});
test('unaffordable batches, port limits and invalid input never partially change state',()=>{
 const {ev,dom}=load();try{setup(ev);ev('S.cash=1');
 ev("ACT.setChCount({id:'fiber',o:'zr4',n:5})");assert.equal(count(ev),0);assert.equal(ev('S.cash'),1);
 ev('S.cash=1e9;S.pops.ams.routers=1');const max=ev("Math.floor(portsMax('ams')-portsUsed('ams'))");
 ev(`ACT.setChCount({id:'fiber',o:'zr4',n:${max+1}})`);assert.equal(count(ev),0);assert.equal(ev('S.cash'),1e9);
 ev('S.pops.ams.routers=16');
 for(const n of ['NaN','Infinity','-1','1.5','65',"'3'"]){ev(`ACT.setChCount({id:'fiber',o:'zr4',n:${n}})`);assert.equal(count(ev),0);}
 ev("ACT.setChCount({id:'missing',o:'zr4',n:2});ACT.setChCount({id:'fiber',o:'missing',n:2})");assert.equal(ev('S.cash'),1e9);
 }finally{dom.window.close();}
});
test('channel reservations and reach, line-system, level and router compatibility still apply',()=>{
 const {ev,dom}=load();try{setup(ev);
 ev("S.links[0].ch=Array(63).fill('zr8');ACT.setChCount({id:'fiber',o:'zr4',n:2})");assert.equal(count(ev),63);
 setup(ev);ev("S.biz.push({type:'wwave',link:'fiber',slots:63});ACT.setChCount({id:'fiber',o:'zr4',n:2})");assert.equal(count(ev),0);
 setup(ev);ev("S.links[0].km=20000;ACT.setChCount({id:'fiber',o:'zr4',n:2})");assert.equal(count(ev),0);
 setup(ev);ev("S.links[0].sys='lite';ACT.setChCount({id:'fiber',o:'tp16',n:2})");assert.equal(count(ev),0);
 setup(ev);ev("S.lvl=1;S.done={};ACT.setChCount({id:'fiber',o:'tp16',n:2})");assert.equal(count(ev),0);
 setup(ev);ev("S.pops.ams.rgen=0;ACT.setChCount({id:'fiber',o:'tp32',n:2})");assert.equal(count(ev),0);
 setup(ev);ev("S.links[0].ch=['zr4','zr8','zr4'];ACT.setChCount({id:'fiber',o:'zr4',n:0})");assert.equal(ev("JSON.stringify(S.links[0].ch)"),'["zr8"]');
 }finally{dom.window.close();}
});
test('plus and minus buttons work alongside typed counts',()=>{
 const {ev,dom,errors}=load();try{setup(ev);const doc=dom.window.document;
 const plus=()=>[...doc.querySelectorAll('[data-act="addCh"]')].find(b=>JSON.parse(b.dataset.args).o==='zr4');
 const minus=()=>[...doc.querySelectorAll('[data-act="rmCh"]')].find(b=>JSON.parse(b.dataset.args).o==='zr4');
 const input=()=>doc.querySelector('form.optic-count[data-optic="zr4"] input');
 plus().click();assert.equal(count(ev),1);assert.equal(input().value,'1');
 input().value='4';input().dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 input().form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(count(ev),4);minus().click();assert.equal(count(ev),3);assert.equal(input().value,'3');
 plus().click();assert.equal(count(ev),4);assert.equal(input().value,'4');assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});

test('draft counts and quotes stay together when reopening a panel or using shortcuts',()=>{
 const {ev,dom}=load();try{setup(ev);const doc=dom.window.document;
 const field=()=>doc.querySelector('form.optic-count[data-optic="zr4"] input');
 field().value='5';field().dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 ev("UI.sel=null;renderPanel();$('panelBody').innerHTML='';UI.sel={type:'link',id:'fiber'};renderPanel()");
 assert.equal(field().value,'5');
 ev("ACT.addCh({id:'fiber',o:'zr4'});ACT.rmCh({id:'fiber',o:'zr4'})");
 assert.equal(field().value,'0');assert.ok(field().form.querySelector('button').textContent.includes(ev('fmt$(0)')));
 field().value='';field().dispatchEvent(new dom.window.Event('input',{bubbles:true}));ev('S.day++;renderPanel()');
 assert.equal(field().value,'','empty in-progress entry survives a tick');
 }finally{dom.window.close();}
});
test('#229 giving up a fiber puts its optics on the spares shelf, and so does decommissioning its POP',()=>{
 const {ev,dom,errors}=load();try{
 setup(ev);
 // a leased IRU (not your own build) with mixed optics
 ev("Object.assign(S.links[0],{own:false,ch:['zr4','zr4','tp16']});S.spares={zr4:1};compute()");
 ev("ACT.rmLink({id:'fiber'})");assert.equal(ev('S.links.length'),1,'the first click only asks');
 ev("ACT.rmLink({id:'fiber'})");assert.equal(ev('S.links.length'),0,'cancelled');
 assert.equal(ev('S.spares.zr4'),3);assert.equal(ev('S.spares.tp16'),1);
 assert.match(ev("S.log.map(e=>e.t).join(' | ')"),/3 optics went back on the spares shelf/);
 // the next channel of that type uses a spare for free
 ev("S.links.push({id:'f2',a:'fra',b:'ams',kind:'df',own:true,sys:'roadm',km:400,ch:[],ready:0,day:0,cut:0,mo:1});compute()");
 const cash=ev('S.cash');ev("ACT.setChCount({id:'f2',o:'zr4',n:3})");assert.equal(ev('S.cash'),cash,'spares are used first');assert.equal(ev('S.spares.zr4'),0);
 // decommissioning a POP returns the optics of every link it takes with it
 ev("S.pops.lon={...S.pops.fra};S.links.push({id:'f3',a:'lon',b:'ams',kind:'df',own:true,sys:'roadm',km:400,ch:['tp16','tp16'],ready:0,day:0,cut:0,mo:1});compute()");
 ev("decommission(['lon'])");
 assert.equal(ev("S.links.some(l=>l.id==='f3')"),false);assert.equal(ev('S.spares.tp16'),3);
 // a link without optics says nothing about spares
 ev("S.log=[];S.links.push({id:'f4',a:'fra',b:'ams',kind:'df',own:true,sys:'roadm',km:400,ch:[],ready:0,day:0,cut:0,mo:1});compute();ACT.rmLink({id:'f4'});ACT.rmLink({id:'f4'})");
 assert.doesNotMatch(ev("S.log.map(e=>e.t).join(' | ')"),/spares shelf/);
 assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
