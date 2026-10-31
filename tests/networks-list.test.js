const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('the Networks list shows 100 networks at a time, with a button for the rest', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();UI.left='nets';UI.leftOpen=true;UI.tailOpen=false;ACT.netFilter({f:'all'})");
  const total = ev("NETS.filter(n=>!n.tail).length");
  assert.ok(total > 100, 'enough networks to page');
  const rows = () => ev("[...document.querySelectorAll('#left .row .nm .meta')].filter(e=>/^AS\\d/.test(e.textContent)).length");
  assert.equal(rows(), 100);
  assert.ok(ev("!!document.querySelector('#left [data-act=listMore]')"));
  ev("document.querySelector('#left [data-act=listMore]').click()");
  assert.equal(rows(), Math.min(total, 200));
  ev("ACT.netFilter({f:'all'})");
  assert.equal(rows(), 100, 'a new filter starts at the first page again');
  assert.deepEqual(errors, []);
});
