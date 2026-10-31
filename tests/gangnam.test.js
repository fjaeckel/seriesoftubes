// Gangnam Style Peering: sender pays, turned up by the scenario rule `sender` (and only there).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = (ev) => ev(`beginGame('T','icn',{scn:SCN.find(x=>x.id==='gangnam')});if(UI.pendGame)ACT.pitchSkip();closeModal();S.cash=1e8`);
const seoul = "ACT.launchBB({city:'icn'});ACT.buyTransit({city:'icn',net:'cog',tier:1});compute();for(let i=0;i<20;i++)dayTick();compute()";

test('sender pays: fee on Seoul transit, incumbents only over a paid PNI, cheap broadband', () => {
  const { ev, errors } = load();
  start(ev);
  ev(seoul);
  assert.ok(ev("scnRule('sender')"));
  assert.equal(ev("R.reachable.ktt||R.reachable.skb||R.reachable.lgu"), false, 'transit does not carry the incumbents');
  assert.ok(ev('R.reach') < 0.99);
  const t = JSON.parse(ev("(()=>{const t=S.transit[0],q=R.p95[t.id];return JSON.stringify({fee:krFee(t,q),q,mo:transitMo(t,q)})})()"));
  assert.ok(t.q > 0 && t.fee === Math.round(t.q * ev('KR_FEE')), 'a sender-pays fee per Gbps of transit');
  assert.ok(ev("Math.abs(R.rev.eyeballs-R.cityEye.icn*sfOf(R,'icn')*EYE_RATE*KR_ARPU)<1"));
  ev("ACT.pni({city:'icn',net:'ktt',tier:0});closeModal();for(let i=0;i<90&&!S.pni.every(pniOn);i++)dayTick();compute()");
  assert.ok(ev('R.reachable.ktt') && ev('R.reach') >= 0.99, 'a paid PNI with Kay-Tea brings the reach');
  assert.match(ev('scnCard()'), /Seoul served well/);
  assert.match(ev('scnCard()'), /Monthly profit/);
  assert.deepEqual(errors, []);
});

test('sender pays: Korean users mind a haul to Tokyo even over peering', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.launchBB({city:'icn'});UI.via=null;UI.route=null;openLinkModal('icn','tok');ACT.buildLink({tier:1});closeModal();for(const x of ixIdsIn('tok')){ACT.buyIx({city:x,tier:1,signed:true});ACT.rs({city:x});}compute()");
  assert.ok(ev('R.egT.ix') > 0 && !ev('R.egT.t'), 'only peering in Tokyo');
  assert.ok(ev('R.latF.icn') < 0.95, 'the haul costs service');
  assert.match(ev("latNote('icn')"), /Korean users notice/);
  assert.deepEqual(errors, []);
});

test('Korea outside the scenario keeps its usual prices', () => {
  const { ev, errors } = load();
  ev("UI.startCity='icn';ACT.start({});closeModal();S.cash=1e8");
  ev(seoul);
  assert.ok(!ev("scnRule('sender')"));
  assert.ok(ev('R.reachable.ktt'), 'transit reaches the incumbents');
  assert.equal(ev("krFee(S.transit[0],100)"), 0);
  assert.ok(ev("Math.abs(R.rev.eyeballs-R.cityEye.icn*sfOf(R,'icn')*EYE_RATE)<1"));
  assert.deepEqual(errors, []);
});

test('an older Gangnam save picks up the sender-pays rule', () => {
  const { ev, errors } = load();
  start(ev);
  const s = ev("(()=>{const o=JSON.parse(JSON.stringify(S));o.scn.rules={};return JSON.stringify(o);})()");
  ev(`S=migrate(JSON.parse(${JSON.stringify(s)}))`);
  assert.ok(ev("S.scn.rules.sender===true"));
  assert.deepEqual(errors, []);
});
