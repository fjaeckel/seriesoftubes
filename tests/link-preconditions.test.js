// Typed orders (the MCP act tool) name both ends of a link, where the map only drags one from a POP of yours.
// A link from a city with no POP is refused, with a toast that says why and a dry run that reports it as blocked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSession, TOOLS } = require('../scripts/lib/mcp-game');

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
    assert.ok(q.quote.blocked.some((b) => why.test(b)), `${action} ${args.a}→${args.b}: ${JSON.stringify(q.quote.blocked)}`);
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
