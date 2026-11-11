// #101: once you have made Tier 1, conferences stop announcing themselves: no 30-day reminders, no report when one
// happens, no note from the sales engineer who booked it. What they do is unchanged, and the Deals panel still lists them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const setup = t1 => {
  const r = load();
  r.ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  r.ev(t1 ? 'S.done.t1=1' : 'delete S.done.t1');
  // Record every notification the conference code raises (toasts land in the NOC log too, so this catches both).
  r.ev("window.__t=[];const __o=toast;toast=(h,...a)=>{__t.push(String(h));return __o(h,...a)}");
  return r;
};
// A non-capacity conference: the day 30 days before it, and the day itself.
const CF = "CONFS.find(c=>!c.cap)";
const run = (ev, reg) => ev(`(()=>{const cf=${CF},d=confDay(cf,0),k=confKey(cf,0);
  S.day=d-30;confTick(d-30);${reg ? "S.confReg[k]=true;" : ''}S.day=d;confTick(d);return JSON.stringify(window.__t)})()`);

test('#101 before Tier 1, conferences still remind you and report back', () => {
  const { ev, errors } = setup(false);
  const t = JSON.parse(run(ev, true));
  assert.ok(t.some(h => /comes to .* in 30 days/.test(h)), 'the 30-day reminder');
  assert.ok(t.some(h => /You shook a lot of hands/.test(h)), 'the report on the day');
  assert.deepEqual(errors, []);
});

test('#101 after Tier 1, conferences say nothing, but attending still works and the Deals panel still lists them', () => {
  const { ev, errors } = setup(true);
  const t = JSON.parse(run(ev, true));
  assert.deepEqual(t, [], 'no reminder and no report');
  assert.ok(ev('!!(S.conf&&S.conf.until>S.day)'), 'the conference still gave its glow');
  assert.ok(ev(`(()=>{S.day=confDay(${CF},1)-20;return /Attend/.test(confSection())})()`), 'still listed in Deals');
  assert.deepEqual(errors, []);
});

test('#101 after Tier 1, a sales engineer still books conferences, without telling you each time', () => {
  const { ev, errors } = setup(true);
  // Hand the desk an engineer and run the desk on the day 30 days before the next conference.
  const booked = ev(`(()=>{const cf=${CF},d=confDay(cf,1),k=confKey(cf,1);S.day=d-30;
    S.sales={p:'eng'};S.confReg={};salesDay(d-30);return !!S.confReg[k]})()`);
  assert.equal(booked, true, 'the booking still happens');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(window.__t)')), []);
  assert.deepEqual(errors, []);
});
