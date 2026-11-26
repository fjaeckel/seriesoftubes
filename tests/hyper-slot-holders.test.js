// #491: a region counts its compute slots, but the player could not tell which customers hold them, so freeing slots
// for an AI run meant dropping customers at random. Each cloud tenant holds one slot in its home region (b.rg), wherever
// it is based; other customers hold none. The tenant's rows say where its slot is, and the region says who holds its slots.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function net(t) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;ACT.buyTransit({city:S.home,net:'cog',tier:3});ACT.buyTransit({city:'par',net:'cog',tier:3});S.offers=[];" +
    // A tenant based in Paris whose servers (and slot) are in Frankfurt, and one at home in Frankfurt.
    "for(const [c,n] of [['par','Paris Pastries'],['fra','Wurst Case']]){const K=CLOUD_TENANTS.startup,o=hsOffer('startup',c,K.opts[0],1);o.name=n;const b=offerCustomer(o);b.rg='fra';S.biz.push(clSign(b));}" +
    'compute()');
  return h;
}

test('#491 each tenant says which region holds its compute slot, and the region says who holds its slots', (t) => {
  const { ev, errors } = net(t);
  assert.equal(ev("S.hs.rg.fra?1:0"), 1);
  assert.equal(ev("hsSlotsUsed('fra')"), 2, 'both tenants hold a slot in Frankfurt');
  // The Paris city panel lists the tenant based there, with its slot in Frankfurt.
  const parRow = ev("hsTenBody('par',hsTen().filter(b=>b.city==='par'))");
  assert.match(parRow, /Paris Pastries/);
  assert.match(parRow, /1 compute slot in Frankfurt/);
  // Frankfurt's region explains its count, and lists the guest from Paris with its slot and a way to drop it.
  assert.match(ev("hsRgBody('fra')"), /Tenants hold 2, training runs 0/);
  const run = ev("hsRunSpec('fra').body()");
  assert.match(run, /Paris Pastries/);
  assert.match(run, /1 compute slot in Frankfurt/);
  assert.match(run, /data-act="dropBiz"/);
  // The customers list says it too; a customer that is not a tenant holds no slot and says nothing.
  ev("S.biz.push(clSign(offerCustomer({id:uid(),city:'par',city2:'fra',link:null,slots:0,what:'',name:'Photon Express',type:'mwave',bw:1,rate:1000,reqs:[],exp:S.day+1})))");
  ev("window.innerWidth=390;UI.tab='dash';renderAll()");
  const cs = ev("custSection()");
  const rowOf = (n) => cs.split('data-cid=').find((r) => r.includes(n)) || '';
  assert.match(rowOf('Wurst Case'), /1 compute slot in Frankfurt/);
  assert.ok(rowOf('Photon Express') && !/compute slot/.test(rowOf('Photon Express')), 'other customers hold none');
  assert.deepEqual(errors, []);
});

test('#491 outside a cloud, customers rows show no slots', (t) => {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  assert.equal(h.ev("S.biz.map(hsSlotTxt).join('')"), '');
  assert.doesNotMatch(h.ev('custSection()'), /compute slot/);
  assert.deepEqual(h.errors, []);
});
