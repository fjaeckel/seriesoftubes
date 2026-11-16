// #101: once you have made Tier 1, conferences stop announcing themselves: no 30-day reminders, no report when one
// happens, no note from the sales engineer who booked it. What they do is unchanged, and the Deals panel still lists them.
// Nothing pops up, but the notices are kept in the NOC log like any other; de-peerings go the same way.
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
  assert.doesNotMatch(ev("document.getElementById('toasts').textContent"), /in 30 days|shook a lot of hands/, 'nothing pops up');
  assert.ok(ev("S.log.some(e=>/comes to .* in 30 days/.test(e.t))"), 'the reminder is in the NOC log');
  assert.ok(ev("S.log.some(e=>/You shook a lot of hands/.test(e.t))"), 'and so is the report');
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
  assert.ok(ev("S.log.some(e=>/registered you for/.test(e.t))"), 'the booking is in the NOC log');
  assert.deepEqual(errors, []);
});

test('after Tier 1, the carriers a capacity conference sends are in the NOC log, not in a toast', () => {
  for (const t1 of [false, true]) {
    const { ev, errors } = setup(t1);
    const n = ev("(()=>{const c=Object.keys(CAP_ROUTES)[0];S.capDeal={at:S.day,c};const o=S.offers.length;capDealTick(S.day);return S.offers.length-o})()");
    assert.ok(n > 0, 'the offers arrive either way');
    assert.equal(/at the conference/.test(ev("document.getElementById('toasts').textContent")), !t1, t1 ? 'quiet' : 'a toast before Tier 1');
    assert.ok(ev("S.log.some(e=>/at the conference/.test(e.t))"), 'in the NOC log either way');
    assert.deepEqual(errors, []);
  }
});

test('after Tier 1, a de-peering and the peering spat are in the NOC log, not in a toast', () => {
  for (const t1 of [false, true]) {
    const { ev, errors } = setup(t1);
    const ix = ev('Object.keys(XIXM)[0]');
    ev(`S.nextFail=S.nextEvent=S.day+99;S.peers['ggl@${ix}']=true;window.snub=()=>({why:'Testing.'});dayTick()`);
    assert.equal(ev(`'ggl@${ix}' in S.peers`), false, 'the session ends either way');
    assert.equal(ev('S.stats.depeered'), 1, 'and still counts');
    assert.ok(ev("S.log.some(e=>/de-peered you/.test(e.t))"), 'in the NOC log either way');
    assert.equal(/de-peered you/.test(ev("document.getElementById('toasts').textContent")), !t1, t1 ? 'quiet' : 'a toast before Tier 1');
    // The spat is between Cogentle and Goggle: it only comes up for someone who buys transit from Cogentle, and it
    // is the last event on the list then, so the highest draw picks it.
    ev("document.getElementById('toasts').innerHTML='';ACT.buyTransit({city:'fra',net:'cog',tier:1});document.getElementById('toasts').innerHTML='';const __r=Math.random;Math.random=()=>0.999;try{fireEvent();}finally{Math.random=__r;}");
    assert.ok(ev("S.ev.depeer>S.day&&S.inc.some(i=>i.type==='depeer')"), 'the spat still happens, with its incident in the NOC');
    assert.ok(ev("S.log.some(e=>/Peering spat/.test(e.t)||/Peering spat/.test(e.h))"), 'in the NOC log either way');
    assert.equal(/Peering spat/.test(ev("document.getElementById('toasts').textContent")), !t1);
    assert.deepEqual(errors, []);
  }
});
