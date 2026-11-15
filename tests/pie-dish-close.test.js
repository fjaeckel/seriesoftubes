// Pie in the Sky: taking a dish down with its antennas, to free a slot under PIE_DISH_MAX. Seeded; a sandbox.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const doc = (dom) => dom.window.document;
const company = (ev) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['lon','man','fra'])if(!S.pops[c])ACT.buildPop({city:c});ACT.pieFound();ACT.pieDish({city:'lon'});ACT.pieDish({city:'man'});ACT.pieAnt({id:S.pie.dishes[0].id});compute()");
};
// In a sandbox a refund comes off what it would have paid.
const refunded = (ev, code) => { const w = ev('S.pie.book.wouldHave'); ev(code); return Math.round(w - ev('S.pie.book.wouldHave')); };

test('a dish is taken down with its antennas after asking, for a quarter of what they cost', () => {
  const { ev, dom, errors } = load();
  company(ev);
  ev("ACT.pieTab({t:'dish'});ACT.pieCc({cc:'GB'})");
  const bin = doc(dom).querySelectorAll('#modal .pie-ccb [data-act=pieDishClose]');
  assert.equal(bin.length, 2, 'one bin per dish');
  ev("ACT.pieDishClose({city:'lon'})");
  assert.equal(ev('S.pie.dishes.length'), 2, 'the first tap only asks');
  const box = doc(dom).querySelector('#modal .pie-confirm');
  assert.match(box.textContent, /London and its 2 antennas/);
  assert.ok(box.querySelector('[data-act=pieDishClose].red'), 'the confirm button');
  ev("ACT.pieDishKeep()");
  assert.equal(doc(dom).querySelector('#modal .pie-confirm'), null, 'cancel keeps it');
  const back = ev("Math.round((piePrice(PIE_DISH)+2*pieAntPrice(0))*PIE_SALVAGE)");
  const mo = ev('pieMo()');
  assert.equal(refunded(ev, "ACT.pieDishClose({city:'lon',ok:true})"), back);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.pie.dishes.map(x=>x.city))')), ['man']);
  assert.equal(mo - ev('pieMo()'), ev('PIE_DISH_MO'), 'its monthly cost goes too');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('a freed slot takes a new dish at the cap', () => {
  const { ev, errors } = load();
  company(ev);
  ev("S.pie.dishes.push(...Array.from({length:PIE_DISH_MAX-2},(_,i)=>({id:'x'+i,city:'man',ant:1,down:0,band:0})))");
  ev("ACT.pieDish({city:'fra'})");
  assert.equal(ev("S.pie.dishes.some(x=>x.city==='fra')"), false, 'full');
  ev("ACT.pieDishClose({city:'lon',ok:true});ACT.pieDish({city:'fra'})");
  assert.equal(ev("S.pie.dishes.some(x=>x.city==='fra')"), true);
  ev("compute()");
  assert.deepEqual(errors, []);
});
