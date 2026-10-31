// The published weekly scenario: the generator (scripts/weekly-scenario.js) and its reference player, --check, and the
// game's side: fetched only when the Scenarios list opens, validated strictly, the in-browser weekly as the fallback,
// a goal type and progress card for each kind of week, the win, the streak and the share line.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load } = require('./harness');
const G = require('../scripts/weekly-scenario');

const DIR = path.join(__dirname, '..', 'site', 'scenarios', 'weekly');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-wkscn-'));
const committed = () => G.list(DIR).map((k) => JSON.parse(fs.readFileSync(path.join(DIR, k + '.json'), 'utf8')));
const tick = () => new Promise((r) => setTimeout(r, 30));
const serveFile = (ev, j) => ev(`UI.wsWk=null;window.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve(${JSON.stringify(j)})})`);
// One file per goal type, from the committed ones where a week has it: enough to check every card.
const GOALS = {
  served: { theme: 'budget', goal: { t: 'served', p: { g: 200 } }, desc: { l: 'wkscn.desc_city_on_a_shoestring', p: { city: 'fra' } } },
  reach: { theme: 'spat', rules: { spat: true }, goal: { t: 'reach', p: { r: 99, g: 150 } }, desc: { l: 'wkscn.desc_two_giants_de_peered_over', p: { city: 'fra' } } },
  path: { theme: 'cable', rules: { banPairs: ['grace:nyc-lon'] }, goal: { t: 'path', p: { a: 'fra', b: 'nyc', g: 400, n: 30 } }, desc: { l: 'wkscn.desc_cab_is_cut_for_the', p: { cab: 'grace', a: 'fra', b: 'nyc' } } },
  ix: { theme: 'region', goal: { t: 'ix', p: { reg: 'EU', n: 8 } }, desc: { l: 'wkscn.desc_every_exchange_in_reg_wants', p: { reg: 'EU', city: 'fra' } } },
  pops: { theme: 'island', goal: { t: 'pops', p: { cs: ['ams', 'par'] } }, desc: { l: 'wkscn.desc_city_is_surrounded_by_water', p: { city: 'fra' } } },
  event: { theme: 'event', goal: { t: 'event', p: { city: 'fra', g: 400, day: 120, dur: 3 } }, desc: { l: 'wkscn.desc_a_g_event_comes_to', p: { g: 400, city: 'fra', day: 120 } } },
  floods: { theme: 'flood', rules: { ddos: true }, goal: { t: 'floods', p: { n: 20, big: 2 } }, desc: { l: 'wkscn.desc_booters_picked_city_for_their', p: { city: 'fra' } } },
  lat: { theme: 'latency', goal: { t: 'lat', p: { a: 'fra', b: 'nyc', ms: 40, n: 30 } }, desc: { l: 'wkscn.desc_a_trading_firm_needs_a', p: { a: 'fra', b: 'nyc', ms: 40 } } },
};
const NAME = { budget: 'wkscn.name_shoestring_backbone', spat: 'wkscn.name_peering_pressure', cable: 'wkscn.name_cut_and_run', region: 'wkscn.name_planting_flags', island: 'wkscn.name_island_hopper', event: 'wkscn.name_stream_team', flood: 'wkscn.name_flood_week', latency: 'wkscn.name_ludicrous_speed' };
const fileFor = (t, key) => { const x = GOALS[t]; return { v: 1, key, theme: x.theme, city: 'fra', cash: 500000, days: 240, lvl: 2, rules: x.rules || {}, mods: [], goal: x.goal, name: { l: NAME[x.theme], p: {} }, desc: x.desc, seed: 42, par: 180, ref: { steps: [] } }; };

test('generator: deterministic for a week, and every theme a template the game knows', () => {
  const g = G.game(), a = tmp(), b = tmp();
  const j1 = G.generate(g, '2027-W10', a), j2 = G.generate(G.game(), '2027-W10', b);
  assert.deepEqual(j1, j2, 'same key, same scenario');
  const themes = JSON.parse(g.ev('JSON.stringify(Object.keys(WS_THEMES))')).sort(), goals = JSON.parse(g.ev('JSON.stringify(Object.keys(WS_GOALS))'));
  assert.deepEqual(Object.keys(G.TEMPLATES).sort(), themes, 'a template for each theme');
  for (const T of Object.values(G.TEMPLATES)) assert.ok(goals.includes(T.goal), `${T.goal} is a goal type of the game`);
  assert.deepEqual(g.errors, []);
});

test('every committed week verifies: not won on day 0, the reference wins on its par with time to spare', () => {
  const g = G.game(), files = committed();
  assert.ok(files.length >= 3, 'this week and the next two are committed');
  for (const j of files) {
    const v = G.verify(g, j);
    assert.ok(v.ok, `${j.key}: ${v.why}`);
    assert.equal(v.par, j.par, `${j.key}: par`);
    assert.ok(j.days >= 180 && j.days <= 365, `${j.key}: ${j.days} days, playable in a sitting or two`);
  }
  // Varied: no theme twice in a row, and the weeks start in different parts of the world.
  for (let i = 1; i < files.length; i++) assert.notEqual(files[i].theme, files[i - 1].theme);
  assert.equal(new Set(files.map((f) => g.ev(`CITY['${f.city}'].reg`))).size, files.length);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), { v: 1, weeks: G.list(DIR) });
  assert.deepEqual(g.errors, []);
});

test('the file is checked field by field, and --check rejects a tampered one', () => {
  const { ev, errors } = load(), j = committed()[0], ok = (x, key = j.key) => ev(`!!wsValid(${JSON.stringify(x)},'${key}')`);
  assert.equal(ok(j), true);
  const bad = {
    'another week': [j, '2020-W01'], 'not a week': [{ ...j, key: '2026-W99' }, '2026-W99'],
    'unknown field': [{ ...j, x: 1 }], 'old schema': [{ ...j, v: 0 }], 'unknown theme': [{ ...j, theme: 'pirates' }],
    'unknown city': [{ ...j, city: 'nope' }], 'days': [{ ...j, days: 5000 }], 'cash': [{ ...j, cash: -1 }], 'par after the end': [{ ...j, par: j.days + 1 }],
    'seed': [{ ...j, seed: 1.5 }], 'unknown rule': [{ ...j, rules: { noTransit: true } }], 'rule value': [{ ...j, rules: { spat: 'yes' } }],
    'bogus cable pair': [{ ...j, rules: { banPairs: ['nope:a-b'] } }], 'home banned': [{ ...j, rules: { banCities: [j.city] } }],
    'unknown mod': [{ ...j, mods: ['godmode'] }], 'too many mods': [{ ...j, mods: ['pricey', 'chaos', 'poor'] }],
    'unknown goal type': [{ ...j, goal: { t: 'win', p: {} } }], 'goal number': [{ ...j, goal: { t: 'served', p: { g: 1e9 } } }],
    'goal missing a parameter': [{ ...j, goal: { t: 'path', p: { a: 'fra', b: 'nyc', g: 100 } } }],
    'goal extra parameter': [{ ...j, goal: { t: 'served', p: { g: 100, x: 1 } } }], 'goal city': [{ ...j, goal: { t: 'lat', p: { a: 'fra', b: 'fra', ms: 10, n: 5 } } }],
    'floods without the flood rule': [{ ...j, rules: {}, goal: { t: 'floods', p: { n: 5, big: 0 } } }],
    'event after the end': [{ ...j, goal: { t: 'event', p: { city: j.city, g: 100, day: 360, dur: 5 } }, days: 300 }],
    'name from another theme': [{ ...j, name: { l: 'puzzles_weekly.detour', p: {} } }], 'text with code': [{ ...j, desc: { l: j.desc.l, p: { ...j.desc.p, x: '<b>' } } }],
    'label placeholder': [{ ...j, desc: { l: j.desc.l, p: Object.fromEntries(Object.keys(j.desc.p).map((k) => [k, 'nope'])) } }],
  };
  for (const [why, [x, key]] of Object.entries(bad)) assert.equal(ok(x, key || x.key), false, why);
  const dir = tmp();
  for (const f of committed()) fs.writeFileSync(path.join(dir, f.key + '.json'), JSON.stringify(f) + '\n');
  fs.copyFileSync(path.join(DIR, 'index.json'), path.join(dir, 'index.json'));
  fs.writeFileSync(path.join(dir, j.key + '.json'), JSON.stringify({ ...j, goal: { t: 'win', p: {} } }));
  const g = G.game();
  assert.deepEqual(G.check(g, dir, 0).filter((x) => x.startsWith(j.key)), [`${j.key}: the game rejects it`]);
  assert.deepEqual(errors, []);
});

test('--check: a week the reference no longer wins is regenerated as a new revision, a new par is just written', () => {
  const g = G.game(), dir = tmp(), j = committed()[0];
  fs.writeFileSync(path.join(dir, j.key + '.json'), JSON.stringify({ ...j, par: j.par + 1 }) + '\n');
  const now = g.ev(`pzWeekStart('${j.key}')`);
  let r = G.refresh(g, dir, now);
  assert.ok(r.fixed.includes(`${j.key}: new par ${j.par}`), r.fixed.join('; '));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, j.key + '.json'), 'utf8')).rev, undefined, 'a new par keeps the revision');
  // A goal its reference plan never reaches: as if a release changed the world under the week.
  fs.writeFileSync(path.join(dir, j.key + '.json'), JSON.stringify({ ...j, goal: { t: 'pops', p: { cs: ['scl'] } }, ref: { ...j.ref, steps: [] } }) + '\n');
  r = G.refresh(g, dir, now);
  const n = JSON.parse(fs.readFileSync(path.join(dir, j.key + '.json'), 'utf8'));
  assert.equal(n.rev, 2, r.fixed.join('; ') + r.bad.join('; '));
  assert.ok(G.verify(g, n).ok);
  // Past weeks keep their files.
  assert.deepEqual(G.refresh(g, dir, now + 30 * 864e5).fixed, []);
  assert.deepEqual(G.check(g, dir, now), []);
  assert.deepEqual(g.errors, []);
});

test('the page never asks for a weekly scenario on load, only when the Scenarios list opens', async () => {
  const { ev, errors } = load();
  ev("window.__f=[];window.fetch=(u,o)=>{__f.push(String(u));return Promise.resolve({ok:false,json:()=>Promise.reject()})}");
  ev("showTitle();for(let i=0;i<5;i++)frame(performance.now()+i*1000);renderAll()");
  assert.equal(ev("__f.filter(u=>/scenarios/.test(u)).length"), 0, 'nothing on the title screen');
  ev("ACT.start({});for(let i=0;i<3;i++)dayTick();renderAll()");
  assert.equal(ev("__f.filter(u=>/scenarios/.test(u)).length"), 0, 'nothing while playing');
  ev('ACT.scenarios({})');
  const key = ev('pzWeekKey(new Date())');
  assert.deepEqual(ev("JSON.stringify(__f.filter(u=>/scenarios/.test(u)))"), JSON.stringify([`scenarios/weekly/${key}.json`]));
  ev('closeModal();ACT.scenarios({})');
  assert.equal(ev("__f.filter(u=>/scenarios/.test(u)).length"), 1, 'once is enough while it is loading');
  await tick();
  assert.deepEqual(errors, []);
});

test('the published scenario is played when it is good, the in-browser weekly when it is missing, offline or bad', async () => {
  const { ev, dom, errors } = load(), key = ev('pzWeekKey(new Date())'), good = { ...committed()[1], key };
  for (const [how, why] of [
    ["Promise.resolve({ok:false,status:404,json:()=>Promise.reject()})", 'missing'],
    ["Promise.reject(new TypeError('offline'))", 'offline'],
    ["Promise.resolve({ok:true,json:()=>Promise.reject(new SyntaxError('x'))})", 'not JSON'],
    [`Promise.resolve({ok:true,json:()=>Promise.resolve(${JSON.stringify({ ...good, city: 'nope' })})})`, 'an unknown city'],
    [`Promise.resolve({ok:true,json:()=>Promise.resolve(${JSON.stringify({ ...good, key: '2020-W01' })})})`, 'another week'],
  ]) {
    ev(`UI.wsWk=null;window.fetch=()=>${how}`); ev('ACT.scenarios({})'); await tick();
    assert.equal(ev('wsDef()'), null, why);
    assert.match(dom.window.document.getElementById('wsRow').textContent, new RegExp(ev(`tr('features.weekly_challenge_key',{key:'${key}'})`)), why);
    ev("document.querySelector('#wsRow [data-act=startWeekly]').click();if(UI.pendGame)ACT.pitchSkip()");
    assert.equal(ev("S.scn.id==='weekly'&&!S.scn.wk&&S.scn.key"), key, `${why}: the in-browser weekly`);
  }
  serveFile(ev, good); ev('ACT.scenarios({})'); await tick();
  assert.match(dom.window.document.getElementById('wsRow').textContent, new RegExp(ev('wsTxt(wsDef().name)').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  ev("document.querySelector('#wsRow [data-act=startWeekly]').click();if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(ev('S.scn.wk.key'), key);
  assert.equal(ev('S.rules.preset'), 'oncall', 'M4: On-call');
  assert.equal(ev('S.cash'), good.mods.includes('poor') ? 100000 : good.cash);
  assert.deepEqual(errors, []);
});

test('every goal type has a progress card, needs play, and wins, streaks and shares', () => {
  const { ev, dom, errors } = load(), key = ev('pzWeekKey(new Date())');
  for (const t of Object.keys(GOALS)) {
    const f = fileFor(t, key);
    assert.equal(ev(`wsBegin(${JSON.stringify(f)},'T')`), true, t);
    ev('if(UI.pendGame)ACT.pitchSkip();closeModal();compute();renderAll()');
    assert.equal(ev('wsOk()'), false, `${t}: not won on day 0`);
    assert.ok(ev('scnProg().items.length') > 0, `${t}: a progress card`);
    const card = ev('scnCard()');
    assert.doesNotMatch(card, /wkscn\.|\{\w+\}|undefined|NaN/, `${t}: ${card}`);
    if (t === 'event') assert.equal(ev("S.biz.filter(b=>b.type==='event'&&b.start===120&&b.bw===400).length"), 1, 'the event is booked');
    if (t === 'floods') assert.equal(ev("scnRule('ddos')"), true);
  }
  // A win: a POP goal met on day 1, recorded for the week, with a streak and the share line.
  ev("localStorage.removeItem('sot-wkscn')");
  ev(`wsBegin(${JSON.stringify(fileFor('pops', key))},'T');if(UI.pendGame)ACT.pitchSkip();closeModal()`);
  // Waves take a few days to light (real lead times), so the goal is met once they are up.
  const build = "for(const c of ['ams','par']){UI.via=null;openLinkModal('fra',c);ACT.buildLink({tier:1});closeModal();}for(let i=0;i<90&&!S.scn.done;i++)dayTick()";
  ev(build);
  const d = ev('S.scn.done');
  assert.ok(d > 0 && d < 90, `won on day ${d}`);
  assert.match(dom.window.document.getElementById('modal').textContent, new RegExp(`Won on day ${d}!`));
  assert.equal(ev('wsShareText()'), `Series of Tubes weekly ${key} “Island Hopper” won day ${d} (par 180) · seriesoftub.es`);
  const rec = JSON.parse(ev("localStorage.getItem('sot-wkscn')"));
  assert.deepEqual(rec.w[key], { d, rv: 1 });
  assert.equal(rec.streak.n, 1);
  // Last week won too: the streak grows; a gap starts it again.
  ev(`localStorage.setItem('sot-wkscn',JSON.stringify({go:{},w:{},streak:{last:pzPrevKey('${key}'),n:3,best:3}}))`);
  ev(`wsBegin(${JSON.stringify(fileFor('pops', key))},'T');if(UI.pendGame)ACT.pitchSkip();closeModal()`);
  ev(build);
  assert.equal(JSON.parse(ev("localStorage.getItem('sot-wkscn')")).streak.n, 4);
  assert.equal(ev(`wsStreak(wsLoad(),pzKeyAdd('${key}',2))`), 0);
  assert.deepEqual(errors, []);
});

test('saves keep the scenario, checked again on load; a tampered one plays on as the in-browser weekly', () => {
  const { ev, errors } = load(), key = ev('pzWeekKey(new Date())');
  ev(`wsBegin(${JSON.stringify(fileFor('path', key))},'T');if(UI.pendGame)ACT.pitchSkip();closeModal();S.scn.run=7`);
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.equal(ev("S.scn.wk.goal.t+':'+S.scn.run+':'+S.scn.home"), 'path:7:fra');
  ev("S.scn.wk.goal={t:'win',p:{}};S.scn.run='x';S=migrate(JSON.parse(JSON.stringify(S)));compute();renderAll()");
  assert.equal(ev("S.scn.id+':'+(S.scn.wk===undefined)+':'+(S.scn.run===undefined)"), 'weekly:true:true');
  ev('for(let i=0;i<3;i++)dayTick();scnCard()');
  assert.deepEqual(errors, []);
});

test('weekly scenario in every language and on a 360 px phone, with the door badge until started', async () => {
  for (const lang of ['de', 'es', 'fr', 'it', 'pt']) {
    const { ev, dom, errors } = load({ lang }), key = ev('pzWeekKey(new Date())'), doc = dom.window.document;
    ev("innerWidth=360;innerHeight=740;dispatchEvent(new Event('resize'));showTitle()");
    const badge = () => !!doc.querySelector('.door[data-door=scn] .pznew');
    assert.equal(badge(), true, `${lang}: badge before the week is started`);
    for (const j of committed()) {
      serveFile(ev, { ...j, key }); ev('ACT.scenarios({})'); await tick();
      const row = doc.getElementById('wsRow');
      assert.doesNotMatch(row.textContent, /wkscn\.|\{\w+\}|undefined|NaN/, `${lang} ${j.key}: no raw labels or placeholders`);
      assert.notEqual(ev('wsTxt(wsDef().desc)'), ev("(d=>EN[d.l].replace(/\\{(\\w+)\\}/g,(m,k)=>wsVal(k,d.p[k])))(wsDef().desc)"), `${lang}: translated text`);
      ev("document.querySelector('#wsRow [data-act=startWeekly]').click();if(UI.pendGame)ACT.pitchSkip();closeModal();renderAll()");
      assert.doesNotMatch(ev('scnCard()'), /wkscn\.|\{\w+\}|undefined|NaN/, `${lang} ${j.key}: card`);
    }
    ev('showTitle()');
    assert.equal(badge(), false, `${lang}: no badge once started`);
    assert.deepEqual(errors, [], lang);
  }
});
