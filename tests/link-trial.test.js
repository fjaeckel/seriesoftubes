// #62 on a big network: a redundancy check routes once (the failed link), and uses the live routing as "before".
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('#62 a redundancy check computes only the trial, and matches comparing two fresh routings', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;ACT.buildPop({city:'bde'});ACT.buildPop({city:'ams'});S.biz=[{id:'circuit',name:'Test Circuit',type:'l2vpn',city:'fra',city2:'bde',bw:80,rate:1,reqs:[]}]");
  ev("S.links=[{id:'main',a:'fra',b:'bde',kind:'wave',tier:1,km:100,mo:100,cut:0},{id:'a',a:'fra',b:'ams',kind:'wave',tier:0,km:100,mo:100,cut:0},{id:'b',a:'ams',b:'bde',kind:'wave',tier:0,km:100,mo:100,cut:0}];compute()");
  ev("window.__n=0;window.__c=compute;compute=function(){window.__n++;return window.__c.apply(this,arguments);}");
  const t = JSON.parse(ev("JSON.stringify(linkTrial('main'))"));
  assert.equal(ev('window.__n'), 1, 'one routing pass per check');
  assert.equal(t.split, false);
  assert.equal(t.loss, 70);
  assert.equal(ev("linkTrial('nope')"), null);
  assert.equal(ev('window.__n'), 1, 'an unknown link costs nothing');
  ev('compute=window.__c');
  // the old way: route the copy twice, before and after the cut
  const old = ev(`(()=>{const save=S,live=R;try{S=JSON.parse(JSON.stringify(save));compute();const b=R;S.links[0].cut=S.day+1;compute();
    const g=c=>Math.max(0,(b.citySrv[c]||0)-(R.citySrv[c]||0)),l2=Math.max(0,(b.l2.circuit||0)-(R.l2.circuit||0));
    return Object.keys(S.pops).reduce((a,c)=>a+(g(c)>.01?g(c):0),0)+(l2>.01?l2:0);}finally{S=save;R=live;}})()`);
  assert.equal(t.loss, old);
  assert.deepEqual(errors, []);
});
