const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

// The sales trial (#185, the intern's sales order) runs the pass with the offer first and skips the pass without
// it when it cannot change the answer. It must sign exactly the offers the original two-pass trial signs.
const ORIGINAL = `(function(o){if(!o||!own(BIZ_T,o.type)||!(o.exp>S.day)||!(o.bw>0)||o.rate<0||!bCities(o).length||!bCities(o).every(popUp)||!reqOk(o))return null;
  const T=BIZ_T[o.type],b=offerCustomer(o);if(T.event&&(!(o.start>S.day)||!(o.dur>0)))return null;
  if(o.type==='capfib'&&S.biz.some(x=>x.type==='capfib'&&capPend(x)&&!x.link&&((x.city===o.city&&x.city2===o.city2)||(x.city===o.city2&&x.city2===o.city))))return null;
  if(T.fiber){const l=o.type==='capfib'?capFibLink(b):S.links.find(x=>x.id===o.link);if(!l)return null;b.link=l.id;
    if(!fiberOk(b)||(o.type==='wwave'&&(!(o.slots>0)||freeCh(l)<o.slots))||(o.type==='dfpair'&&!pairFree(l))||
      (o.type==='pairs'&&(!l.own||S.biz.some(x=>x.link===l.id&&['pairs','capfib','dfpair'].includes(x.type)))))return null;}
  const state=S,result=R,hot=UI.hotMap,future=S.biz.some(x=>BIZ_T[x.type].event&&x.start>S.day);
  try{S={...S,biz:S.biz};
    if(future){S.biz=S.biz.map(x=>BIZ_T[x.type].event&&x.start>S.day?{...x,start:S.day}:x);compute();}
    const healthy=S.biz.filter(x=>!bizWhy(x).length);if(T.event)b.start=S.day;if(T.cap)b.live=true;S.biz=S.biz.concat(b);compute();
    return !bizWhy(b).length&&healthy.every(x=>!bizWhy(x).length)?b:null;
  }finally{S=state;R=result;UI.hotMap=hot;b.start=o.start;if(T.cap)delete b.live;}})`;

test('the faster sales trial signs exactly the offers the two-pass trial signs', () => {
  const { ev, dom, errors } = load();
  try {
    const save = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
    ev(`S=migrate(JSON.parse(${JSON.stringify(save)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();window.slowOffer=${ORIGINAL};`);
    assert.ok(ev('S.biz.some(x=>BIZ_T[x.type].event&&x.start>S.day)'), 'the fixture has events booked ahead, so the shortcut runs');
    const seen = { yes: 0, no: 0, skipped: 0, third: 0 };
    ev('window.__n=0;const _c=compute;window.compute=function(){__n++;return _c.apply(this,arguments)}');
    for (let day = 0; day < 6; day++) {
      ev(`__reseed(${1000 + day});S.offers=[];for(let i=0;i<10;i++)spawnOffer();`);
      // Small offers that fit, and on alternate days a squeeze, so offers fail on capacity and on others' service too.
      ev(`for(const o of S.offers)o.bw=Math.max(1,Math.round(o.bw*${day % 2 ? 1 : 0.05}))`);
      if (day % 2) ev('for(const c in S.pops)S.pops[c].bb&&(S.pops[c].bb.d*=1.3)');
      // And circuits over the busiest links, which take bandwidth from customers who had it.
      ev(`for(const l of S.links.filter(l=>!linkDown(l)&&S.pops[l.a]&&S.pops[l.b]&&R.load[l.id]>1).sort((x,y)=>R.load[y.id]/capOf(y)-R.load[x.id]/capOf(x)).slice(${day},${day}+2))
        S.offers.push({id:'sq'+l.id,city:l.a,city2:l.b,name:'Squeeze',type:'l2vpn',bw:${day % 2 ? 300 : 2},rate:100,reqs:[],exp:S.day+30})`);
      for (const id of JSON.parse(ev('JSON.stringify(S.offers.map(o=>o.id))'))) {
        const o = `S.offers.find(x=>x.id===${JSON.stringify(id)})`;
        const before = ev('JSON.stringify(R.load)+R.served');
        ev('__n=0');const fast = ev(`JSON.stringify(autoOffer(${o}))`);const n = ev('__n');
        assert.equal(ev('JSON.stringify(R.load)+R.served'), before, 'a trial leaves the live result alone');
        const slow = ev(`JSON.stringify(slowOffer(${o}))`);
        assert.equal(fast, slow, `offer ${id} (${ev(`${o}.type`)}) on day ${day}`);
        if (fast !== 'null') seen.yes++; else seen.no++;
        if (n === 1) seen.skipped++;
        if (n === 2) seen.third++;
      }
      ev('S.nextFail=S.day+99;S.nextEvent=S.day+99;dayTick()');
    }
    assert.ok(seen.yes >= 3 && seen.no >= 3, `both answers come up (${JSON.stringify(seen)})`);
    assert.ok(seen.skipped >= 5, `the second pass is often skipped (${JSON.stringify(seen)})`);
    assert.ok(seen.third >= 3, `and run when the offer hurts someone (${JSON.stringify(seen)})`);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('with a scenic circuit the sales trial keeps both passes in their original order', () => {
  const { ev, dom, errors } = load();
  try {
    const save = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
    ev(`S=migrate(JSON.parse(${JSON.stringify(save)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();S.biz.find(b=>BIZ_T[b.type].l2).route='scenic';compute();window.slowOffer=${ORIGINAL};`);
    ev('window.__n=0;const _c=compute;window.compute=function(){__n++;return _c.apply(this,arguments)}');
    ev('__reseed(77);S.offers=[];for(let i=0;i<6;i++)spawnOffer();');
    for (const id of JSON.parse(ev('JSON.stringify(S.offers.map(o=>o.id))'))) {
      const o = `S.offers.find(x=>x.id===${JSON.stringify(id)})`;
      ev('__n=0');const fast = ev(`JSON.stringify(autoOffer(${o}))`);const n = ev('__n');
      assert.equal(fast, ev(`JSON.stringify(slowOffer(${o}))`), id);
      assert.ok(n === 0 || n === 2, 'both passes, as before');
    }
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
