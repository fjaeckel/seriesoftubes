const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Level 6 with a 1.6T IX port in Amsterdam; the first 3.2T model unlocks at level 7.
const setup = () => {
  const page = load();
  page.ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;S.lvl=6;ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG.findIndex(r=>r.pn==='1.6T');ACT.buyIx({city:'ams',tier:4})");
  page.ev("var G32=RG.findIndex(r=>r.pn==='3.2T'&&r.lvl===7),T32=PORT.findIndex(p=>p.n==='3.2T')");
  return page;
};
const demoRouter = ev => ev("ACT.demoAsk({k:'rg',id:G32});S.day=S.demo['rg:'+G32];ACT.upRouter({city:'ams',g:G32})");
const offers = (ev, html) => ev(html).includes('&quot;tier&quot;:5');

test('#435 a demo 3.2T router can upgrade an IX port to 3.2T', () => {
  const { ev, errors } = setup();
  demoRouter(ev);
  assert.equal(ev("S.pops.ams.rgen===G32"), true, 'the demo unit is installed');
  assert.equal(ev("S.ixp.ams"), 4);
  assert.equal(offers(ev, "ixBlock('ams',false)"), true, 'IX panel offers 3.2T');
  assert.equal(offers(ev, "connUp({k:'ix',id:'ams'})"), true, 'connections list offers 3.2T');
  ev("ACT.buyIx({city:'ams',tier:T32})");
  assert.equal(ev("S.ixp.ams"), 5);
  assert.deepEqual(errors, []);
});

test('#435 the fastest waves show once a router that takes them runs at a POP', () => {
  const { ev, errors } = setup();
  const top = "LT.findIndex(t=>t.n==='12.8T')";
  assert.equal(ev(`waveShown(${top})`), false);
  demoRouter(ev);
  assert.equal(ev(`waveShown(${top})`), true);
  assert.deepEqual(errors, []);
});

test('#435 3.2T stays hidden until a router that takes it is unlocked or installed', () => {
  const { ev, errors } = setup();
  assert.equal(ev("portShown(T32)"), false);
  assert.equal(offers(ev, "ixBlock('ams',false)"), false);
  ev("S.lvl=7");
  assert.equal(ev("portShown(T32)"), true, 'unlocked by level, as before');
  assert.deepEqual(errors, []);
});
