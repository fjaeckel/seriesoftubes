const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('every city has at most four Tier 2 sellers without losing local peering', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Markets','fra',{mode:'sandbox'})");
  assert.equal(ev("CITIES.filter(c=>NETS.filter(n=>n.type!=='t1'&&sellsAt(n,c.id)).length>4).map(c=>c.id).join()"), '');
  assert.equal(ev("CITIES.filter(c=>!c.off&&!c.ixOnly&&!NETS.some(n=>sellsAt(n,c.id))).map(c=>c.id).join()"), 'pcn');
  assert.equal(ev("CITIES.some(c=>NETS.some(n=>n.type==='t1'&&n.price&&n.pops.includes(c.id)&&(!n.homeOnly||(Array.isArray(n.cc)?n.cc:[n.cc]).includes(c.cc))&&(!c.au||AU_SELLERS.includes(n.id))&&!sellsAt(n,c.id)))"), false);
  for (const [city, id] of [['han', 'fpt'], ['lhe', 'ptc'], ['khi', 'twa'], ['pek', 'cmb']]) assert.ok(ev(`sellsAt(NET.${id},'${city}')`), `${id} sells locally in ${city}`);
  assert.equal(ev("NETS.filter(n=>sellsAt(n,'sah')).map(n=>n.id).join()"), 'ypt');
  assert.equal(ev("NETS.filter(n=>sellsAt(n,'pyo')).map(n=>n.id).join()"), 'kpt');
  assert.ok(ev("NET.gsl.pops.includes('fra')&&ixMembers('fra').includes('gsl')&&!sellsAt(NET.gsl,'fra')"), 'interconnection presence survives the sales shortlist');
  assert.deepEqual(errors, []);
});

test('an existing unlisted transit contract survives reload and upgrades through the city panel', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Old contract','fra',{mode:'sandbox'});ACT.launchBB({city:'fra'});S.pops.fra.rgen=RG_TOP;S.pops.fra.routers=3;S.transit.push({id:'old-gsl',city:'fra',net:'gsl',tier:0,down:0});S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.ok(ev('R.useT["old-gsl"]>0'));
  ev("UI.sel={type:'city',id:'fra'};UI.tab='up';renderPanel()");
  assert.match(dom.window.document.getElementById('panelBody').textContent, /Glowball Sakura Lager/);
  ev("ACT.buyTransit({city:'fra',net:'gsl',tier:1})");
  assert.equal(ev('S.transit.find(t=>t.id==="old-gsl").tier'), 1);
  ev("S.transit=[];ACT.buyTransit({city:'fra',net:'gsl',tier:1})");
  assert.equal(ev('S.transit.length'), 0, 'a new contract must be on the shortlist');
  assert.deepEqual(errors, []);
});

test('removed NPC networks are absent from the roster and customer relationships', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  assert.equal(ev("NETS.some(n=>[35280,6424,15830].includes(n.asn)||['f5n','edgoo','equin'].includes(n.id)||(n.up||[]).some(id=>['f5n','edgoo','equin'].includes(id)))"), false);
  assert.equal(ev('NET.ups.asn'), 6830);
  assert.equal(ev('NET.ups.name'), 'Liberty Gobble');
  assert.deepEqual(errors, []);
});

test('the intern can grow a saved contract that is no longer offered', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Old contract','fra',{mode:'sandbox'});S.cash=1e9;S.pops.fra.rgen=RG_TOP;S.pops.fra.routers=4;S.transit.push({id:'old-gsl',city:'fra',net:'gsl',tier:1,n:4,hist:[600],down:0});compute();ACT.opsHire({id:'kevin'});S.ops.floor=0;S.ops.on.transit=true;S.ops.p.transit={x:1.5,prov:'gsl'};opsDay(S.day)");
  assert.equal(ev("S.transit.find(t=>t.id==='old-gsl').tier"), 2);
  assert.equal(ev('S.transit.length'), 1);
  assert.deepEqual(errors, []);
});
