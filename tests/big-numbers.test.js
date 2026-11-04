const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('money and bandwidth keep a readable unit past a billion dollars and a petabit', () => {
  const { ev, errors } = load();
  const f = x => ev(x);
  assert.equal(f('fmt$(1.5e6)'), '$1.50M');
  assert.equal(f('fmt$(250e6)'), '$250.0M');
  assert.equal(f('fmt$(999.97e6)'), '$1.00B');
  assert.equal(f('fmt$(1.2e9)'), '$1.20B');
  assert.equal(f('fmt$(-12.5e9)'), '-$12.5B');
  assert.equal(f('fmt$(120e9)'), '$120.0B');
  assert.equal(f('fmtG(2500)'), '2.50 Tbps');
  assert.equal(f('fmtG(999000)'), '999.0 Tbps');
  assert.equal(f('fmtG(999990)'), '1.00 Pbps');
  assert.equal(f('fmtG(12e6)'), '12.0 Pbps');
  // The map's fiber labels and the NOC graph axes use the short form.
  assert.equal(f('fmtCap(334000)'), '334T');
  assert.equal(f('fmtCap(1024000)'), '1P');
  assert.equal(f('fmtCap(3152700)'), '3.2P');
  assert.equal(f('fmtCap(400)'), '400G');
  assert.deepEqual(errors, []);
});
