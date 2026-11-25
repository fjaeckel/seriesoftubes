const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('a founded exchange can be renamed from its panel', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("S.myIx.fra={name:'Old-IX Frankfurt',members:[],next:S.day+4};S.ixp.fra=2;compute()");
  assert.match(ev("ixSection('fra')"), /data-act="ixRename"/, 'the panel has a rename button');
  ev("ACT.ixRename({city:'fra'})");
  ev("$('ixRnIn').value='  Tube   Hub  '");
  ev("ACT.ixRenameGo({city:'fra'})");
  assert.equal(ev("S.myIx.fra.name"), 'Tube Hub', 'spaces collapsed');
  assert.equal(ev("ixName('fra')"), 'Tube Hub');
  ev("ACT.ixRename({city:'fra'});$('ixRnIn').value='   ';ACT.ixRenameGo({city:'fra'})");
  assert.equal(ev("S.myIx.fra.name"), 'Tube Hub', 'an empty name changes nothing');
  assert.deepEqual(errors, []);
});

test('an exchange you did not found has no rename button or window', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyIx({city:'fra',tier:1,signed:1});compute()");
  assert.doesNotMatch(ev("ixSection('fra')"), /ixRename/);
  ev("ACT.ixRename({city:'fra'})");
  assert.equal(ev("!!$('ixRnIn')"), false);
  assert.deepEqual(errors, []);
});
