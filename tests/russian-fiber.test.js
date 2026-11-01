const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('domestic Russian fiber crosses the Urals without an intercontinental restriction', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Urals Truly','mos',{mode:'sandbox'});S.cash=1e10;S.lvl=13;S.pops.mos.rgen=9");
  const chain = ['mos', 'kzn', 'ufa', 'svx', 'oms', 'ovb', 'kja', 'ikt', 'khv', 'vvo'];
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1], b = chain[i];
    assert.equal(ev(`landX('${a}','${b}')`), false, `${a} to ${b} stays domestic`);
    assert.equal(ev(`landMult('${a}','${b}')`), 1);
    assert.equal(ev(`landWhy('${a}','${b}')`), '');
    assert.ok(ev(`dfAllowed('${a}','${b}')`));
    ev(`UI.lmode='df';UI.dfSrc='${i % 2 ? 'lease' : 'build'}';UI.dfSys='roadm';openLinkModal('${a}','${b}');ACT.orderDf();closeModal()`);
    assert.equal(ev('S.links.length'), i, 'the order creates a fiber');
    assert.equal(ev('S.links.at(-1).sub'), false);
    assert.equal(ev('S.links.at(-1).own'), i % 2 === 0);
    ev(`S.pops.${b}.rgen=9;window.fiber=S.links.at(-1);fiber.ready=S.day;while(spanKm(fiber)>OPT.tp16.reach&&(fiber.regen||0)<REGEN_MAX)ACT.regen({id:fiber.id,d:1});ACT.addCh({id:fiber.id,o:'tp16'})`);
    assert.ok(ev('capOf(fiber)>0'), 'the pair can be lit');
  }
  assert.ok(ev("pathExists('mos','vvo')"), 'the whole domestic chain carries traffic');
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.ok(ev("pathExists('mos','vvo')"), 'the chain survives a save');
  for (const c of ['dks', 'tik', 'pvs', 'dyr', 'pkc', 'uus']) assert.ok(ev(`isSub('mos','${c}')&&!dfAllowed('mos','${c}')`), `${c} keeps its remote landing rules`);
  assert.ok(ev("landX('ist','dxb')&&!dfAllowed('ist','dxb')"), 'international restrictions still apply');
  assert.equal(ev("dfAllowed('mos','kyv')"), false, 'closed corridors still apply');
  assert.deepEqual(errors, []);
});
