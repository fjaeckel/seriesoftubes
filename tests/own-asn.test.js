const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('pick your own AS number next to the name, or leave it empty for a random one (#135)', () => {
  const { ev, errors } = load();
  assert.ok(ev("!!document.querySelector('.network-name .nmwrap #nmIn')&&!!document.querySelector('.nmwrap .reroll[data-act=randomName]')"), 'round reroll button inside the name box');
  const sug = ev("+document.getElementById('asnIn').placeholder");
  assert.ok(ev(`asnOk(${sug})`), 'the suggestion is usable');
  const set = v => ev(`(()=>{const i=document.getElementById('asnIn');i.value=${JSON.stringify(v)};i.dispatchEvent(new Event('input'));return i.value})()`);
  assert.equal(set('AS 2-0-1-9-1-7'), '201917', 'only digits stay');
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(ev('S.asn'), 201917);
  assert.match(ev("document.getElementById('hAsn').textContent"), /AS201917/);
  assert.deepEqual(errors, []);
});

test('an AS number that would not route is refused before the game starts', () => {
  const { ev, errors } = load();
  for (const bad of ['0', '23456', '64512', '4200000001', String(ev('NETS[0].asn'))]) {
    assert.equal(ev(`asnOk(${bad})`), false, bad);
  }
  ev("(()=>{const i=document.getElementById('asnIn');i.value='64512';i.dispatchEvent(new Event('input'))})()");
  assert.ok(ev("document.getElementById('asnIn').classList.contains('bad')"));
  ev('ACT.start({})');
  assert.equal(ev('S'), null, 'no game');
  assert.match(ev("document.getElementById('toasts').textContent"), /won't route/);
  ev("(()=>{const i=document.getElementById('asnIn');i.value='';i.dispatchEvent(new Event('input'))})()");
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  assert.ok(ev('asnOk(S.asn)&&S.asn>=200000'), 'empty: a random one');
  assert.deepEqual(errors, []);
});
