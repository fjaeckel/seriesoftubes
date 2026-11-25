const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('the late viewport checks after loading keep the world image unless the size really changed', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.nextFail=1e9;S.nextEvent=1e9");
  ev("WL.key='painted'");
  assert.equal(ev("resizeSettled()"), false, 'same size: nothing to do');
  assert.equal(ev("WL.key"), 'painted', 'the world image is kept, so the first tap does not wait for a repaint');
  ev("window.innerWidth=500;window.innerHeight=700");
  assert.equal(ev("resizeSettled()"), true, 'a size that settled late is picked up');
  assert.equal(ev("WL.key"), null, 'and the world image is repainted for it');
  assert.equal(ev("CW+'x'+CH"), '500x700');
  assert.equal(ev("resizeSettled()"), false, 'once');
  assert.deepEqual(errors, []);
});
