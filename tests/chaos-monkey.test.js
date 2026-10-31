const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A small network on a fixed seed: Frankfurt, Amsterdam, London and Paris in a ring, with a spur out to Zurich.
function net(preset) {
  const { ev, errors, dom } = load();
  ev(`beginGame('Monkey Testers','fra',${JSON.stringify({ mode: 'normal', preset })});if(UI.pendGame)ACT.pitchSkip()`);
  ev("S.cash=1e9;S.lvl=4;for(const c of ['ams','lon','par','zrh'])ACT.buildPop({city:c})");
  ev("ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  ev("for(const [a,b] of [['fra','ams'],['ams','lon'],['lon','par'],['par','fra'],['fra','zrh']]){UI.pending={a,b};ACT.buildLink({tier:1});}closeModal()");
  ev('for(let i=0;i<60;i++)dayTick();S.inc=[];for(const l of S.links)l.cut=0;compute()');
  return { ev, errors, dom };
}
const link = (ev, a, b) => `S.links.find(l=>(l.a==='${a}'&&l.b==='${b}')||(l.a==='${b}'&&l.b==='${a}'))`;

test('the chaos monkey visits On-call and BGP at 3 a.m., never Change Freeze or Sandbox', () => {
  for (const [preset, ok] of [['oncall', true], ['bgp', true], ['freeze', false]]) {
    const { ev, errors } = net(preset);
    assert.equal(ev('mkElig()'), ok, preset);
    ev('S.monkey.next=S.day;dayTick()');
    assert.equal(ev('!!S.monkey.on'), ok, preset);
    assert.deepEqual(errors, []);
  }
  const { ev } = net('oncall');
  ev("S.mode='sandbox'");
  assert.equal(ev('mkElig()'), false);
  ev("S.mode='normal';S.monkey.next=S.day;dayTick();S.scn={rules:{}}");
  assert.equal(ev('mkOn()'), false, 'never in a scenario');
});

test('a visit lasts 120 to 240 days, snips every couple of weeks and pauses the usual failures', () => {
  const { ev, errors } = net('oncall');
  ev('S.monkey.next=S.day;dayTick()');
  const len = ev('S.monkey.until-S.monkey.start');
  assert.ok(len >= 120 && len <= 240, `visit of ${len} days`);
  ev('S.nextFail=S.day');
  const nf = ev('S.nextFail');
  ev('for(let i=0;i<60;i++)dayTick()');
  assert.ok(ev('S.monkey.n') >= 2, 'it snipped');
  assert.equal(ev('S.nextFail'), nf, 'no ordinary failure fired while it was here');
  assert.ok(ev("S.inc.some(i=>i.type==='cut')||S.stats.survived>0"));
  // It leaves on time, and the ordinary failures wait a little before they start again.
  ev('for(let i=0;i<200&&S.monkey.on;i++)dayTick()');
  assert.equal(ev('S.monkey.on'), 0);
  assert.ok(ev('S.monkey.next>S.day+200'));
  assert.ok(ev('S.nextFail>=S.day'));
  assert.deepEqual(errors, []);
});

test('weak spots are tubes with no other way round', () => {
  const { ev } = net('oncall');
  assert.equal(ev(`mkWeak(${link(ev, 'fra', 'zrh')})`), true);
  assert.equal(ev(`mkWeak(${link(ev, 'fra', 'ams')})`), false);
});

test('outlasting it unnoticed pays a bonus and earns the badge; going home hurt pays nothing', () => {
  const { ev, errors } = net('oncall');
  ev('S.monkey.next=S.day;dayTick();S.monkey.n=4;S.monkey.hurt=0;S.monkey.until=S.day+1');
  const cash = ev('S.cash'), bonus = ev('mkBonus()');
  ev('dayTick();checkBadges()');
  assert.equal(ev('S.monkey.on'), 0);
  assert.equal(ev('S.stats.mkSurv'), 1);
  assert.ok(ev('S.cash') >= cash + bonus - 1e6, 'bonus paid');
  assert.ok(ev("S.ach.monkey!==undefined"));
  ev('S.monkey.next=S.day;dayTick();S.monkey.n=4;S.monkey.hurt=2;S.monkey.until=S.day+1;dayTick()');
  assert.equal(ev('S.stats.mkSurv'), 1, 'no bonus when customers felt it');
  assert.deepEqual(errors, []);
});

test('a banana sends it home early, for a price', () => {
  const { ev, errors, dom } = net('bgp');
  ev("S.monkey.next=S.day;dayTick();UI.left='noc';renderLeft()");
  assert.ok(dom.window.document.querySelector('[data-act=mkBanana]'), 'the NOC card offers a banana');
  const cash = ev('S.cash'), cost = ev('mkBananaCost()');
  ev('ACT.mkBanana({})');
  assert.equal(ev('S.monkey.on'), 0);
  assert.equal(ev('S.cash'), cash - cost);
  assert.equal(ev('S.stats.mkSurv||0'), 0);
  ev('S.cash=0;S.monkey.next=S.day;dayTick();ACT.mkBanana({})');
  assert.equal(ev('S.monkey.on'), 1, 'no banana without the cash');
  assert.deepEqual(errors, []);
});

test('saves keep the monkey; old and broken saves are repaired', () => {
  const { ev, errors } = net('oncall');
  ev('S.monkey.next=S.day;dayTick();const t=JSON.stringify(packSave(S));S=migrate(JSON.parse(t))');
  assert.equal(ev('S.monkey.on'), 1);
  assert.ok(ev('S.monkey.until>S.day'));
  ev("const o=JSON.parse(JSON.stringify(packSave(S)));delete o.monkey;S=migrate(o)");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.monkey)')), { next: null, on: 0 });
  ev("const o=JSON.parse(JSON.stringify(packSave(S)));o.monkey={on:1,until:'soon',n:-3,hurt:99,c:'<b>'};S=migrate(o)");
  assert.equal(ev('S.monkey.n'), 0);
  assert.equal(ev('S.monkey.hurt'), 0);
  assert.equal(ev('S.monkey.c'), ev('S.home'));
  assert.ok(ev('S.monkey.until>=S.monkey.start'));
  ev('for(let i=0;i<5;i++)dayTick()');
  assert.deepEqual(errors, []);
});

test('"Met the Chaos Monkey" comes from a visit, not from an ordinary fiber cut', () => {
  const { ev, errors } = net('oncall');
  ev("fireFailure('cut');checkBadges()");
  assert.equal(ev('S.ach.backhoe===undefined'), true, 'a cut alone is not the monkey');
  ev('S.monkey.next=S.day;dayTick();checkBadges()');
  assert.notEqual(ev('S.ach.backhoe'), undefined);
  assert.equal(ev("BADGES.find(b=>b.id==='backhoe').t"), 'Met the Chaos Monkey');
  assert.deepEqual(errors, []);
});

test('#226 the monkey\'s notice in the NOC has no Open button that would open the NOC again', () => {
  const { ev, errors } = net('oncall');
  ev('mkArrive(S.day);ACT.leftTab({t:"noc"})');
  const row = ev(`(()=>{const e=S.log.find(x=>x.o&&x.o.a==='tab'&&x.o.v==='noc');if(!e)return 'none';const r=[...document.querySelectorAll('#left .row.note')].find(n=>n.textContent.includes(e.t.slice(0,20)));return r?(r.querySelector('[data-act=logOpen]')?'button':'no button'):'not shown'})()`);
  assert.equal(row, 'no button');
  // a notice that opens something else keeps its button
  ev("toast('A test notice','',[],{a:'bank'});ACT.leftTab({t:'noc'})");
  assert.equal(ev(`!![...document.querySelectorAll('#left .row.note')].find(n=>n.textContent.includes('A test notice')).querySelector('[data-act=logOpen]')`), true);
  assert.deepEqual(errors, []);
});
