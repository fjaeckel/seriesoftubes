// The Hyperscaler's pacing (the brief's "First balance pass"): the reference bot (scripts/lib/hyper-bot.js), playing well
// from day 0, reaches level 4 or more within the first game year and never goes broke; a lazy player who only launches
// at home and signs what calls is not ruined; and money alone cannot buy Cloud Nine in months (the ocean cable takes
// level 9 and more than a year to lay). Seeded, so the same games every time. The bot's year prints as a diagnostic.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { install, play } = require('../scripts/lib/hyper-bot');

test('a good player reaches level 4 or more in the first year, and the bot never goes broke', (t) => {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  const out = play(h.ev, { days: 365, every: 60 });
  t.diagnostic('bot year one: ' + out.rows.map((r) => `d${r.day} lv${r.lv} $${Math.round(r.cash / 1000)}k peak ${r.peak}G ${r.rg} regions ${r.ct} cont ${r.ten} tenants`).join(' | ') + ` · levels reached on days ${JSON.stringify(out.lv)}`);
  assert.equal(out.lost, false, 'never broke');
  const lv = out.rows[out.rows.length - 1].lv;
  assert.ok(lv >= 4, `level ${lv} by day 365`);
  assert.ok(out.lv[3] > 0 && out.lv[3] <= 300, `two regions and level 3 well inside the year (day ${out.lv[3]})`);
  assert.equal(h.ev('S.hs.won'), 0, 'no Cloud Nine in year one');
  assert.deepEqual(h.errors, []);
});

test('a lazy player is not ruined, and money alone cannot buy Cloud Nine in months', (t) => {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  const lazy = play(h.ev, { days: 365, every: 120, lazy: true });
  assert.equal(lazy.lost, false, 'a year of doing little does not bankrupt you');
  assert.ok(lazy.rows[lazy.rows.length - 1].cash > 100000, 'and the cash is still there');
  // An aggressive player with a bottomless wallet: the bot from day 0 with $100M.
  const g = load({ seed: 11 });
  t.after(() => g.dom.window.close());
  install(g.ev);
  g.ev("beginGame('Rich Bot','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});UI.speed=0;closeModal();S.cash=1e8;__hsBot.start()");
  const r = JSON.parse(g.ev('(()=>{for(let i=0;i<240;i++){__hsBot.day();dayTick();closeModal();}return JSON.stringify({won:S.hs.won,lv:S.lvl,c9:hsC9()})})()'));
  t.diagnostic('rich bot after 240 days: ' + JSON.stringify(r));
  assert.equal(r.won, 0, 'no Cloud Nine in eight months, however rich');
  assert.equal(r.c9.cab, false, 'no ocean cable of its own yet');
  assert.deepEqual(h.errors.concat(g.errors), []);
});
