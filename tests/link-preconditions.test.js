// Typed orders (the MCP act tool) name both ends of a link and any city for a POP or an exchange, where the map only
// offers what a player can reach: a link dragged from one of your POPs, a POP in a city that is on the map, Found your
// own IX where the panel shows it. These hold the same lines: what the game refuses, it refuses with a toast that says
// why and a dry run that reports it as blocked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSession, TOOLS } = require('../scripts/lib/mcp-game');
const { lit } = require('../scripts/lib/js-literal');

function sandbox() {
  const s = createSession(), T = (name, args = {}) => TOOLS.find((t) => t.name === name).run(s, args), ev = (x) => s.game.ev(x);
  T('new_game', { city: 'sao', preset: 'sandbox', seed: 7, name: 'Probe' });
  const act = (action, args, dryRun) => T('act', { action, args, dryRun });
  return { s, ev, act, pops: () => JSON.parse(ev('JSON.stringify(Object.keys(S.pops).sort())')), links: () => ev('S.links.length') };
}

test('a dark fiber IRU, a wave or a cable from a city with no POP is refused, and its dry run says why', () => {
  const { s, act, pops, links } = sandbox();
  for (const [action, args, city] of [
    ['orderDf', { a: 'aju', b: 'rec', source: 'lease', system: 'roadm' }, 'Aracaju'],
    ['orderDf', { a: 'rio', b: 'sao', source: 'build', system: 'lite' }, 'Rio de Janeiro'],
    ['buildLink', { a: 'bsb', b: 'for', tier: 1 }, 'Brasília'],
    ['orderCable', { a: 'for', b: 'lis' }, 'Fortaleza'],
  ]) {
    const why = new RegExp(`You have no POP in ${city}`);
    const q = act(action, args, true);
    assert.equal(q.outcome, 'quote', action);
    assert.ok(q.quote.blocked.some((b) => why.test(b)), `${action} ${args.a}→${args.b}: ${lit(q.quote.blocked)}`);
    const r = act(action, args);
    assert.equal(r.outcome, 'rejected', `${action} ${args.a}→${args.b}`);
    assert.ok(r.toasts.some((t) => why.test(t)), JSON.stringify(r.toasts));
    assert.equal(r.charged, 0);
    assert.equal(r.cashChange, 0);
  }
  // nothing was built, and no POP opened at either end
  assert.deepEqual(pops(), ['sao']);
  assert.equal(links(), 0);
  assert.deepEqual(s.errors(), []);
});

test('from one of your POPs the same orders still go through and open a POP at the far end', () => {
  const { s, act, pops, links } = sandbox();
  for (const [action, args] of [
    ['orderDf', { a: 'sao', b: 'rio', source: 'lease', system: 'roadm' }],
    ['buildLink', { a: 'sao', b: 'bsb', tier: 1 }],
    ['orderCable', { a: 'rio', b: 'lis' }],
  ]) {
    assert.deepEqual(act(action, args, true).quote.blocked, [], action);
    assert.equal(act(action, args).outcome, 'applied', action);
  }
  assert.deepEqual(pops(), ['bsb', 'lis', 'rio', 'sao']);
  assert.equal(links(), 3);
  // the game's own click path is unchanged: the link window from a POP signs the IRU
  const { ev } = sandbox();
  ev("openLinkModal('sao','cwb');UI.lmode='df';UI.dfSrc='lease';UI.dfSys='lite';ACT.orderDf()");
  assert.equal(ev("S.links.filter(l=>l.kind==='df'&&l.a==='sao'&&l.b==='cwb').length"), 1);
  assert.ok(ev('!!S.pops.cwb'));
  assert.deepEqual(s.errors(), []);
});

test('a POP in a retired small city is refused with a toast naming an open city nearby, and its dry run is blocked', () => {
  const { s, ev, act, pops } = sandbox();
  const q = act('buildPop', { city: 'aju' }, true);
  assert.deepEqual(q.quote.blocked, [ev("apiText(popOffWhy('aju'))")]);
  assert.match(q.quote.blocked[0], /Aracaju is off the map/);
  const r = act('buildPop', { city: 'aju' });
  assert.equal(r.outcome, 'rejected');
  assert.ok(r.toasts.some((t) => /Aracaju is off the map.*\n.*Build in Salvador instead/s.test(t)), JSON.stringify(r.toasts));
  assert.equal(r.charged, 0);
  // every retired city names an open city in its own country to build in instead
  const near = JSON.parse(ev(`JSON.stringify(CITIES.filter(c=>c.off).map(c=>{const m=popOffWhy(c.id).match(/Build in (.+) instead/);
    const o=m&&CITIES.find(x=>x.name===m[1]);return {c:c.id,ok:!!o&&!o.off&&o.cc===c.cc};}))`));
  assert.ok(near.length > 0, 'there are retired cities');
  assert.deepEqual(near.filter((x) => !x.ok), []);
  // an open city still takes a POP; an unknown id does nothing and says nothing
  assert.equal(act('buildPop', { city: 'ssa' }).outcome, 'applied');
  ev("ACT.buildPop({city:'nope'})");
  assert.deepEqual(pops(), ['sao', 'ssa']);
  assert.deepEqual(s.errors(), []);
});

test('an old save that kept a POP in a retired city keeps it, and buildPop there stays quiet', () => {
  const { s, ev, act } = sandbox();
  ev("S.pops.aju={day:0,bb:null,boost:0,down:0,routers:1,gen:false};S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.ok(ev("!!S.pops.aju&&cityOn('aju')"));
  const r = act('buildPop', { city: 'aju' });
  assert.equal(r.outcome, 'no_effect');
  assert.deepEqual(r.toasts, []);
  // and a link may start there, since it is one of your POPs
  assert.equal(act('orderDf', { a: 'aju', b: 'rec', source: 'lease', system: 'roadm' }).outcome, 'applied');
  assert.deepEqual(s.errors(), []);
});

test('founding your own exchange says why it cannot: mainland China, an exchange already there, yours already there, no POP', () => {
  const { s, ev, act } = sandbox();
  const name = (c) => ev(`CITY.${c}.name`);
  const refused = (city, why) => {
    const q = act('foundIx', { city }, true);
    assert.equal(q.quote.blocked.length, 1, `${city}: ${lit(q.quote.blocked)}`);
    assert.match(q.quote.blocked[0], why, city);
    const r = act('foundIx', { city });
    assert.equal(r.outcome, 'rejected', city);
    assert.ok(r.toasts.some((t) => why.test(t)), `${city}: ${lit(r.toasts)}`);
    assert.equal(r.charged, 0);
  };
  // mainland China comes first: a POP there would not help (Charlie's Shanghai and Beijing had POPs)
  refused('pek', /Running an exchange in mainland China takes a different license/);
  ev('S.pops.sha={day:0,bb:null,boost:0,down:0,routers:1,gen:false}');
  refused('sha', /Running an exchange in mainland China takes a different license/);
  refused('sao', new RegExp(`${name('sao')} already has an exchange, ${ev('CITY.sao.ix')}`));
  refused('mex', new RegExp(`You have no POP in ${name('mex')}.*\\n.*found the exchange`, 's'));
  act('buildPop', { city: 'mex' });
  assert.deepEqual(act('foundIx', { city: 'mex' }, true).quote.blocked, []);
  assert.equal(act('foundIx', { city: 'mex' }).outcome, 'applied');
  refused('mex', new RegExp(`You already run ${ev('S.myIx.mex.name')} in ${name('mex')}`));
  assert.equal(ev('Object.keys(S.myIx).join()'), 'mex');
  // the panel's own button still founds one
  ev("ACT.buildPop({city:'rek'});ACT.foundIx({city:'rek'})");
  assert.ok(ev('!!S.myIx.rek'));
  ev("ACT.foundIx({city:'nope'})");
  assert.deepEqual(s.errors(), []);
});
