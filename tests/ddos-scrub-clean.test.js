// #289: the clean traffic a scrubbing center sends back to its target is the target's own traffic, not the flood.
// On a link it must not show as DDoS junk, which made a 12 G attack look like hundreds of gigs of junk on the backbone.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('#289 scrubbed traffic coming back to the target is not counted as DDoS junk on the backbone', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40;ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  ev("ACT.buildPop({city:'ams'});UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});closeModal()");
  // A big customer (200 G port) hit by a small 12 G flood, with a 10T scrubbing center in Amsterdam always on.
  ev("S.biz.push({id:'h',type:'host',name:'Big Host',city:'fra',bw:200,rate:100,mood:80,since:0,reqs:[]});S.scrubs=[{city:'ams',tier:2}];S.scrubMode='always'");
  ev("S.ev.ddos={id:'atk',city:'fra',tgt:'h',vec:'dns',gbps:12,start:S.day,until:S.day+2,bh:false};compute()");
  const m = JSON.parse(ev("(()=>{const m=ddosReport(ddosAll()[0]);return JSON.stringify({pulled:m.pulled,cleaned:m.cleaned,over:m.over})})()"));
  assert.equal(m.pulled, 12, 'the whole flood is pulled to the scrubbing center');
  assert.equal(m.over, 0, 'and cleaned in full');
  const net = JSON.parse(ev("JSON.stringify(R.ef[edgeKey(S.links.find(l=>l.a==='fra'&&l.b==='ams'||l.a==='ams'&&l.b==='fra'))].net)"));
  assert.ok(!(net.junk > 1e-6), `no junk on the link: ${JSON.stringify(net)}`);
  assert.ok(net.scrub > 50, `the clean traffic is shown as such: ${JSON.stringify(net)}`);
  const h = ev("trafficSection(S.links.find(l=>l.a==='fra'&&l.b==='ams'||l.a==='ams'&&l.b==='fra'))");
  assert.doesNotMatch(h, /DDoS junk/);
  assert.match(h, new RegExp(ev("tr('common.scrubbed_traffic')")));
  assert.deepEqual(errors, []);
});

test('#289 a flood that does ride the backbone is still DDoS junk', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40");
  ev("ACT.buildPop({city:'ams'});UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});closeModal();ACT.buyTransit({city:'ams',net:'cog',tier:1})");
  ev("S.biz.push({id:'g',type:'game',name:'Lag Lords',city:'fra',bw:10,rate:100,mood:80,since:0,reqs:[]})");
  ev("S.ev.ddos={id:'atk',city:'fra',tgt:'g',vec:'ack',gbps:20,start:S.day,until:S.day+2,bh:false};compute()");
  const net = JSON.parse(ev("JSON.stringify(R.ef[edgeKey(S.links.find(l=>l.a==='fra'&&l.b==='ams'||l.a==='ams'&&l.b==='fra'))].net)"));
  assert.ok(net.junk > 1, `junk on the link: ${JSON.stringify(net)}`);
  assert.ok(!(net.scrub > 0));
  assert.deepEqual(errors, []);
});
