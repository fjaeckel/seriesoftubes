// The Hyperscaler's badges and share card (88-days/26-hyper-badges.js): each badge from its own fact, the counters that
// record what leaves no trace (a protest won, a model that hallucinated, a price war matched to the end), none of them in
// a classic game, and the share card's rows for the charter, in every language.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
function start(t, opts = {}) {
  const h = load({ seed: 7, ...opts });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;compute()");
  return h;
}
const IDS = ['hs_rg1', 'hs_drill1', 'hs_prot', 'hs_ontime', 'hs_ship', 'hs_flop', 'hs_spare', 'hs_lost', 'hs_survive', 'hs_cont', 'hs_war', 'hs_smr'];
const ok = (ev, id) => ev(`BADGES.find(b=>b.id==='${id}').ok()`);

test('the Hyperscaler badges: one per milestone, the existing two integrated, no duplicates', (t) => {
  const { ev, errors } = start(t);
  const all = J(ev, 'BADGES.map(b=>b.id)');
  assert.equal(new Set(all).size, all.length, 'badge ids are unique');
  for (const id of IDS.concat(['hs_t1', 'cloud9'])) assert.ok(all.includes(id), id);
  assert.equal(all.filter((id) => /^hs_|^cloud9$/.test(id)).length, IDS.length + 2);
  for (const id of IDS) assert.equal(ok(ev, id), false, `${id} not earned at the start`);
  assert.equal(ev("BADGES.find(b=>b.id==='hs_cont').d"), 'Run regions on 5 continents.', 'the mark comes from Cloud Nine');
  assert.deepEqual(errors, []);
});

test('each badge comes from its own fact, and checkBadges awards them', (t) => {
  const { ev, errors } = start(t);
  const set = {
    hs_rg1: "S.hs.rg.par={t:1,ready:S.day,mw:20}",
    hs_drill1: "S.hs.drill['fra|par']=S.day",
    hs_ontime: 'S.hs.jd=1',
    hs_ship: 'S.hs.ai=1',
    hs_spare: "S.biz.push({id:'iru',type:'dfpair',city:'fra',city2:'par',name:'Tubular Telecom',bw:1,rate:1,mood:100,reqs:[]})",
    hs_lost: 'S.stats.hsLost=1',
    hs_survive: 'S.hs.fsv=1',
    hs_cont: "for(const c of ['nyc','sao','tok','jnb'])S.hs.rg[c]={t:1,ready:S.day,mw:20}",
    hs_smr: "S.hs.pw.fra.own=[{k:'smr',ready:S.day+5}]",
  };
  for (const [id, code] of Object.entries(set)) {
    assert.equal(ok(ev, id), false, id);
    ev(code);
    if (id === 'hs_smr') { assert.equal(ok(ev, id), false, 'a reactor still being built does not count'); ev('S.hs.pw.fra.own[0].ready=S.day'); }
    assert.equal(ok(ev, id), true, id);
  }
  assert.equal(ev('hsC9Cont()'), 5);
  ev('checkBadges()');
  for (const id of Object.keys(set)) assert.equal(typeof ev(`S.ach['${id}']`), 'number', `${id} awarded`);
  assert.deepEqual(errors, []);
});

test('the counters: a protest won, a model that hallucinated in public, a price war matched to the end', (t) => {
  const { ev, errors } = start(t);
  // A protest won with goodwill.
  ev("hsPwMk('fra');S.hs.prot.fra={kind:'delay',until:S.day+30,g:1,on:'rg',from:S.day};S.hs.pw.fra.gw=10");
  assert.equal(ev("hsProtWin('fra')"), false, 'not enough goodwill');
  assert.equal(ok(ev, 'hs_prot'), false);
  ev('S.hs.pw.fra.gw=HS_GW_WIN');
  assert.equal(ev("hsProtWin('fra')"), true);
  assert.equal(ev('S.stats.hsProt'), 1);
  assert.equal(ok(ev, 'hs_prot'), true);
  // A model fed nothing flops (a start day whose seeded roll flops it) and the parrot badge follows.
  const s = ev("(()=>{for(let s=0;s<500;s++){const m={a:'fra',b:'par',start:s,n:0,k:0};if(hsFlopRoll(m)<hsFlopP(0))return s;}return -1})()");
  assert.ok(s >= 0);
  ev(`S.hs.own.push({id:'m1',n:0,k:0,a:'fra',b:'par',g:1600,tb:100,done:0,mw:4,start:${s},due:S.day});hsShip(S.hs.own[0],S.day)`);
  assert.equal(ev('S.hs.ai|0'), 0);
  assert.equal(ev('S.stats.hsFlop'), 1);
  assert.equal(ok(ev, 'hs_flop'), true);
  assert.equal(ok(ev, 'hs_ship'), false, 'a flop is not a shipped model');
  // A price war that ends while you match it is won; one you ignored is not.
  ev("S.hs.rv.pw={w:0,reg:'EU',from:S.day-50,until:S.day,f:0.2,m:0};hsRvDay(S.day)");
  assert.equal(ev('S.stats.hsWar||0'), 0);
  assert.equal(ok(ev, 'hs_war'), false);
  ev("S.hs.rv.pw={w:0,reg:'EU',from:S.day-50,until:S.day,f:0.2,m:1};hsRvDay(S.day)");
  assert.equal(ev('S.stats.hsWar'), 1);
  assert.equal(ok(ev, 'hs_war'), true);
  // The counters survive a save.
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(ev('JSON.stringify(S)'))});const s=migrate(r.s);return [s.stats.hsProt,s.stats.hsFlop,s.stats.hsWar];})()`);
  assert.deepEqual(back, [1, 1, 1]);
  assert.deepEqual(errors, []);
});

test('a classic game never earns a Hyperscaler badge', (t) => {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  const { ev, errors } = h;
  ev("ACT.start({});ACT.charter({k:'global'});S.stats.hsProt=1;S.stats.hsFlop=1;S.stats.hsWar=1;S.stats.hsLost=1;S.biz.push({id:'iru',type:'dfpair',city:'fra',city2:'par',name:'x',bw:1,rate:1,mood:100,reqs:[]});checkBadges()");
  for (const id of IDS) { assert.equal(ok(ev, id), false, id); assert.equal(ev(`S.ach['${id}']===undefined`), true, id); }
  assert.deepEqual(errors, []);
});

test('the share card: regions, continents, users, the peak between regions and Cloud Nine', (t) => {
  const { ev, errors } = start(t);
  ev("ACT.hsLaunch({cc:'DE'});ACT.hsLaunch({cc:'FR'});S.hs.rg.par={t:1,ready:S.day,mw:20};S.hs.rg.nyc={t:1,ready:S.day,mw:20};S.hs.bpk=1234;S.hs.drill['fra|par']=1;compute()");
  const rows = J(ev, 'hsShareRows([])');
  const m = Object.fromEntries(rows);
  assert.equal(m['☁️ Cloud Nine'], '2/5 continents');
  assert.equal(m.Regions, '3 on 2 continents');
  assert.match(m.Users, /in 2 countries$/);
  assert.equal(m['Peak between regions'], '1.23 Tbps');
  assert.equal(m['Drills passed'], '1');
  assert.ok(rows.length <= 9, 'fits the card');
  ev('S.hs.won=400');
  assert.equal(J(ev, 'hsShareRows([])')[0][1], ev('dateStr(400)'));
  // The card draws them, in place of a carrier's rows.
  assert.equal(ev('!!shareCanvas()'), true);
  ev("S.charter='global';delete S.hs");
  assert.equal(ev('!!shareCanvas()'), true, 'a classic card still draws');
  assert.deepEqual(errors, []);
});

for (const lang of ['it', 'pt', 'fr', 'es', 'de']) {
  test(`${lang}: the badges and share rows render`, (t) => {
    const { ev, errors } = start(t, { lang });
    const raw = (s) => /hyper_badges\.|\{[a-z]+\}|undefined|NaN/.test(s);
    for (const b of J(ev, "BADGES.filter(b=>/^hs_/.test(b.id)).map(b=>[b.t,b.d])")) for (const s of b) assert.ok(s && !raw(s), `${lang}: ${s}`);
    ev("ACT.hsLaunch({cc:'DE'});S.hs.won=10");
    for (const r of J(ev, 'hsShareRows([])')) for (const s of r) assert.ok(!raw(String(s)), `${lang}: ${s}`);
    assert.deepEqual(errors, []);
  });
}
