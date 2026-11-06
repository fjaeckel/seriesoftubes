// #262: the intern's "Light more fiber" order can be told to light new fiber with the biggest optic instead of the
// most Gbps per dollar. It is still an intern: once a fiber is lit it keeps adding what is in there, never swaps.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit: js } = require('../scripts/lib/js-literal');

const BASE = "ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=4;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "ACT.launchBB({city:'fra'});S.pops.fra.rgen=2;ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buildPop({city:'ams'});S.pops.ams.rgen=2;compute();" +
  "ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal()";
// A ROADMaster fiber Frankfurt–Amsterdam, dark or lit with `ch`, running at `hot` of what it carries.
const fiber = (ch, hot) => `S.links.push({id:'f',a:'fra',b:'ams',kind:'df',sys:'roadm',ch:${js(ch)},km:450,sub:false,ready:0,cut:0,mo:1,trench:'f'});compute();R.load.f=dfCap(S.links.at(-1))*${hot}`;
function game(t, ch, hot, p, cap) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  h.ev(fiber(ch, hot));
  h.ev(`S.ops.on.optics=true;S.ops.p.optics=${js(p)};${cap === undefined ? '' : `S.ops.cap.optics=${cap};`}opsDay(S.day)`);
  return h;
}
const lit = (ev) => JSON.parse(ev("JSON.stringify(S.links.find(l=>l.id==='f').ch)"));

test('#262 by default the intern lights new fiber with the most Gbps per dollar, as before', (t) => {
  const { ev, errors } = game(t, [], 0, {});
  assert.equal(ev("opsP('optics','pick')"), 'cheap');
  assert.deepEqual(lit(ev), ['zr8']);
  assert.deepEqual(errors, []);
});

test('#262 told to go big, the intern lights new fiber with the most Gbps per channel', (t) => {
  const { ev, errors } = game(t, [], 0, { pick: 'big' });
  assert.deepEqual(lit(ev), ['tp16']);
  assert.deepEqual(errors, []);
});

test('#262 the biggest optic that fits the budget, and it never swaps what is already lit', (t) => {
  const a = game(t, [], 0, { pick: 'big' }, 50000);
  assert.deepEqual(lit(a.ev), ['zr8'], 'a 1.6T shelf is over budget, so the next biggest');
  assert.equal(a.ev("S.ops.log.some(e=>/budget/i.test(JSON.stringify(e)))"), false, 'asking is not running out of budget');
  const b = game(t, ['zr4'], 0.95, { pick: 'big' });
  assert.deepEqual(lit(b.ev), ['zr4', 'zr4'], 'hot fiber gets more of what is lit');
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
});

test('#262 the setting is saved, an unknown value falls back, and it shows on the phone', (t) => {
  const { ev, dom, errors } = game(t, [], 0, { pick: 'big' });
  const back = (p) => ev(`(()=>{const s=JSON.parse(JSON.stringify(S));s.ops.p.optics=${js(p)};sanitize(s);return JSON.stringify(s.ops.p.optics);})()`);
  assert.deepEqual(JSON.parse(back({ pick: 'big' })), { pick: 'big' });
  assert.deepEqual(JSON.parse(back({ pick: 'huge' })), {});
  assert.deepEqual(JSON.parse(back(undefined)), {}, 'an old save without it');
  dom.window.innerWidth = 360;
  ev("ACT.phoneTab({t:'noc'})");
  dom.window.document.querySelector('#leftBody [data-act="opsOpen"]').click();
  const sel = [...dom.window.document.querySelectorAll('#modalCard select[data-chg="opsParam"]')].find((s) => s.dataset.args.includes('pick'));
  assert.ok(sel, 'the Optics list is in the sheet');
  assert.match(sel.closest('label').textContent, /Optics/);
  assert.equal(sel.options[sel.selectedIndex].textContent, 'biggest on new fiber');
  sel.value = [...sel.options].find((o) => o.textContent !== 'biggest on new fiber').value;
  sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(ev("opsP('optics','pick')"), 'cheap');
  assert.deepEqual(errors, []);
});
