// The Hyperscaler's reference player (scripts/lib/hyper-bot.js), phase 4's gate: it plays the charter through the game's
// own actions from day 0, On-call, with the usual failures. Once it runs two regions or more with their replicas
// pinned and a failover drill passed, a region is taken out for real: its users fail over to the replica without
// losing data, are served well while it is down, and the outage counts as survived when it is back. The bot's progress
// a month at a time is printed as a diagnostic for the balance pass.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { install } = require('../scripts/lib/hyper-bot');

test('the reference bot plays a Hyperscaler and survives a region loss once it has replicas and drills', (t) => {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  const { ev, errors } = h;
  install(ev);
  ev("beginGame('Cloud Bot','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});UI.speed=0;closeModal();__hsBot.start()");
  // Day by day until it has two regions with a passed drill (and at most two and a half years).
  const out = JSON.parse(ev(`(()=>{const rows=[];for(let i=0;i<900;i++){__hsBot.day();dayTick();closeModal();if(S.lost)break;
    if(S.day%30===0)rows.push({day:S.day,lv:S.lvl||1,cash:Math.round(S.cash),users:Math.round(hsUsers()),peak:Math.round(S.stats.peak),rg:hsRgs().length,ct:hsCont(),ten:hsTen().length});
    if(hsRgs().length>=2&&Object.keys(S.hs.drill).length&&Object.keys(S.hs.rep).length>=2&&!S.hs.dx&&!Object.keys(S.hs.out).length&&hsRgs().some(c=>hsFailReady(c)&&hsLagAt(c)<HS_RISK&&hsHomedAt(c).length))break;}
    return JSON.stringify({rows,day:S.day,lost:!!S.lost});})()`));
  t.diagnostic('bot by month: ' + out.rows.map((r) => `d${r.day} lv${r.lv} $${Math.round(r.cash / 1000)}k ${r.users}G users peak ${r.peak}G ${r.rg} regions ${r.ct} cont ${r.ten} tenants`).join(' | '));
  assert.equal(out.lost, false, 'the bot never goes broke');
  assert.ok(out.day < 900, 'two regions, replicas and a passed drill within two and a half years');
  assert.equal(ev('S.hs.flost'), 0, 'no data lost to the failures it met on the way');
  assert.ok(ev("S.offers.concat(S.biz).every(o=>o.type==='cloud')"), 'cloud tenants only, never transit');
  // A real region failure: a region with users at home whose failover holds tonight (with a leased cage early on, the
  // newest region may not have users of its own yet).
  const c = ev('hsRgs().find(c=>hsFailReady(c)&&hsLagAt(c)<HS_RISK&&hsHomedAt(c).length)');
  const b = ev(`hsRepOf(${JSON.stringify(c)})`);
  const homed = JSON.parse(ev(`JSON.stringify(Object.fromEntries(hsHomedAt(${JSON.stringify(c)}).map(k=>[k,S.hs.cc[k].d])))`));
  assert.ok(Object.keys(homed).length > 0, 'users call the region home');
  const fsv = ev('S.hs.fsv');
  ev(`hsRegionFail(${JSON.stringify(c)},2,'test');compute()`);
  assert.equal(ev('S.hs.flost'), 0, 'no data lost: the backlog was under the limit');
  for (const [k, d] of Object.entries(homed)) assert.ok(ev(`S.hs.cc.${k}.d`) >= d - 1e-6, `${k} lost no users`);
  assert.equal(ev(`R.hs.fo[${JSON.stringify(c)}]`), b, 'its users fail over to its replica');
  for (const k of Object.keys(homed)) assert.ok(ev(`hsQ(R,'${k}')`) >= 0.9, `${k} is served well from the replica: ${ev(`hsQ(R,'${k}')`)}`);
  // The bot plays on; the region comes back, and the outage counts as survived.
  ev('for(let i=0;i<4;i++){__hsBot.day();dayTick();closeModal();}');
  assert.equal(ev(`!!S.hs.out[${JSON.stringify(c)}]`), false, 'the region is back');
  assert.equal(ev('S.hs.fsv'), fsv + 1, 'the failure was survived');
  assert.equal(ev('S.hs.flost'), 0);
  assert.ok(ev("S.done.hs_survive!==undefined&&S.done.hs_drill!==undefined&&S.done.hs_rep!==undefined"), 'its goals are met');
  assert.deepEqual(errors, []);
});
