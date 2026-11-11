// #336: the NOC dashboard's connection list can shrink connections too (a smaller port, one LAG member fewer) and
// chase a PNI that is on order, with the same buttons and rules as the POP panel.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A transit LAG, a live PNI LAG, a PNI on order and an IX LAG, all in Frankfurt, set up directly so nothing is left to luck.
const setup = () => {
  const r = load();
  r.ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;S.offers=[];S.nextFail=S.nextEvent=1e6;if(!S.pops.fra)ACT.buildPop({city:'fra'})");
  r.ev(`(()=>{const free=NETS.filter(n=>n.type!=='t1'&&n.type!=='cdn'&&n.pops.includes('fra')&&!msfNope(n.id,'fra')).map(n=>n.id);
    S.transit=[{id:'t1',city:'fra',net:'cog',tier:2,n:2}];
    S.pni=[{id:'p1',city:'fra',net:free[0],tier:2,n:2,ready:0,site:'a',sacrif:false},{id:'p2',city:'fra',net:free[1],tier:1,n:1,ready:S.day+60,site:'a',sacrif:false}];
    const x=ixIdsIn('fra')[0];S.ixp={[x]:2};S.ixn={[x]:2};window.__ix=x;compute();})()`);
  return r;
};
const open = (ev, phone) => ev(`window.innerWidth=${phone ? 390 : 1280};UI.dtab='conn';ACT.connOpen()`);
// Every button in the list as act + args, to compare with what the POP panel offers.
const acts = (ev, sel) => JSON.parse(ev(`JSON.stringify([...document.querySelectorAll('${sel} [data-act]')].map(b=>b.dataset.act+' '+b.dataset.args))`));
const has = (list, act, args) => list.includes(`${act} ${JSON.stringify(args)}`);

for (const phone of [false, true]) {
  test(`#336 the connection list offers downgrades and a chase (${phone ? 'phone' : 'desktop'})`, () => {
    const { ev, errors } = setup();
    open(ev, phone);
    const ix = ev('window.__ix'), a = acts(ev, '#connSec');
    assert.ok(has(a, 'downT', { id: 't1' }) && has(a, 'lagT', { id: 't1', d: -1 }), 'transit: smaller port, one member fewer');
    assert.ok(has(a, 'downP', { id: 'p1' }) && has(a, 'lagP', { id: 'p1', d: -1 }), 'PNI: smaller port, one member fewer');
    assert.ok(has(a, 'pniChase', { id: 'p2' }), 'a PNI on order can be chased');
    assert.ok(!has(a, 'pniChase', { id: 'p1' }) && !has(a, 'downP', { id: 'p2' }), 'no chase for a live PNI, no downgrade for one on order');
    assert.ok(has(a, 'downIx', { city: ix }) && has(a, 'lagIx', { city: ix, d: -1 }), 'IX: smaller port, one member fewer');
    assert.match(ev("document.getElementById('connSec').textContent"), /Downgrade 100G/);
    assert.deepEqual(errors, []);
  });
}

test('#336 the buttons in the list do what the POP panel buttons do', () => {
  const { ev, errors } = setup();
  const ix = ev('window.__ix');
  open(ev, false);
  const click = (act, args) => {
    const ok = ev(`(()=>{const b=[...document.querySelectorAll('#connSec [data-act]')].find(b=>b.dataset.act===${JSON.stringify(act)}&&b.dataset.args===${JSON.stringify(JSON.stringify(args))});if(!b)return false;b.click();return true})()`);
    assert.ok(ok, `${act} ${JSON.stringify(args)} is in the list`);
    open(ev, false);
  };
  click('downT', { id: 't1' });
  assert.equal(ev("S.transit[0].tier"), 1);
  click('lagT', { id: 't1', d: -1 });
  assert.equal(ev("S.transit[0].n||1"), 1);
  click('downP', { id: 'p1' });
  assert.equal(ev("S.pni.find(p=>p.id==='p1').tier"), 1);
  click('lagP', { id: 'p1', d: -1 });
  assert.equal(ev("S.pni.find(p=>p.id==='p1').n||1"), 1);
  click('downIx', { city: ix });
  assert.equal(ev(`S.ixp['${ix}']`), 1);
  click('lagIx', { city: ix, d: -1 });
  assert.equal(ev(`(S.ixn||{})['${ix}']||1`), 1);
  // A chase that lands takes a month off the wait, as from the POP panel.
  const ready = ev("S.pni.find(p=>p.id==='p2').ready");
  ev("Math.random=()=>0");
  click('pniChase', { id: 'p2' });
  assert.equal(ev("S.pni.find(p=>p.id==='p2').ready"), Math.max(ev('S.day') + 1, ready - 30));
  // No more members to take away: those buttons go away.
  const a = acts(ev, '#connSec');
  assert.ok(!has(a, 'lagT', { id: 't1', d: -1 }) && !has(a, 'lagP', { id: 'p1', d: -1 }) && !has(a, 'lagIx', { city: ix, d: -1 }));
  assert.deepEqual(errors, []);
});

test('#336 the list offers the same downgrades as the POP panel', () => {
  const { ev, errors } = setup();
  open(ev, false);
  const dash = acts(ev, '#connSec').filter(x => /^(downT|lagT|downIx|lagIx) /.test(x) && !x.includes('"d":1'));
  ev("UI.sel={type:'city',id:'fra'};UI.tab='up';renderPanel()");
  const panel = acts(ev, '#panelBody').filter(x => /^(downT|lagT) /.test(x) && !x.includes('"d":1'));
  assert.ok(panel.length >= 2, `the POP panel shows the transit downgrades: ${panel}`);
  for (const x of panel) assert.ok(dash.includes(x), `${x} is in the list too`);
  assert.deepEqual(errors, []);
});
