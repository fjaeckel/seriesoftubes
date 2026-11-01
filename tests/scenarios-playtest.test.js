// Rule C1, played (gameplay-rules): every handmade scenario has a reference strategy (scripts/lib/scenario-ref.js,
// the player's own actions, a plan a sensible human would follow) that wins within its days, and the obvious shortcut
// does not. Win windows follow the researched country demand and customer cones.
// A working local peering plan is a valid alternative to backhauling traffic abroad.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { play } = require('../scripts/lib/scenario-ref');

const HIRE = ['hire', ['transit', 'routers', 'repair', 'sales', 'ix']];
const home = (c) => [['bb', c], ['tr', c, 1], ['ix', c]];
const GN_H = ['hire', ['transit', 'routers', 'repair', 'sales', 'ix', 'caches', 'pni']];
const GN_REF = [['bb', 'icn'], ['ix', 'icn'], ['tr', 'icn', 1, 'ntt'], ['pni', 'icn', 'ktt', 1], ['pni', 'icn', 'skb', 1], ['pni', 'icn', 'lgu', 1], GN_H, ['served', 120], ['link', 'icn', 'tok', 1], ['tr', 'tok', 1], ['ix', 'tok'], ['last', 'icn'], ['pop', 'hkg']];
// ref: the reference plan; win: [earliest, latest] day it may win on; cheese: the shortcut, and `by`, the day before
// which it must not win (null: never within the scenario's days).
const PLAY = {
  stg: { ref: [['bb', 'stg'], ['ix', 'stg'], ['link', 'stg', 'fra', 1], ['ix', 'fra'], ['bb', 'fra'], ['link', 'fra', 'ams', 1], ['ix', 'ams'], ['bb', 'ams'], ['link', 'ams', 'lon', 1], ['ix', 'lon'], ['bb', 'lon'], ['link', 'fra', 'par', 1], ['ix', 'par'], ['bb', 'par'], ['hire', ['routers', 'repair', 'caches', 'pni', 'ix', 'sales'], { pni: { paid: true } }], ['link', 'stg', 'muc', 1], ['ix', 'muc'], ['bb', 'muc'], ['wait', 120], ['pnis'], ['link', 'lon', 'nyc', 2], ['ix', 'nyc'], ['bb', 'nyc'], ['wait', 200], ['pnis']],
    win: [30, 120], cheese: [['bb', 'stg'], ['ix', 'stg'], ['hire', ['routers', 'repair']]], by: null },
  // The other way round the planet: Paris, New York, Los Angeles, Tokyo, Hong Kong, Singapore.
  redsea: { ref: [...home('mrs'), ['link', 'mrs', 'par', 1], ['bb', 'par'], ['ix', 'par'], ['link', 'par', 'nyc', 1, 'amitie'], ['tr', 'nyc', 1], ['ix', 'nyc'], ['link', 'nyc', 'lax', 1], ['ix', 'lax'], ['tr', 'lax', 1], ['link', 'lax', 'tok', 1, 'jup'], ['bb', 'tok'], ['tr', 'tok', 1], ['ix', 'tok'], ['link', 'tok', 'hkg', 1, 'apg'], ['bb', 'hkg'], ['tr', 'hkg', 1], ['ix', 'hkg'], ['link', 'hkg', 'sin', 1], ['bb', 'sin'], ['tr', 'sin', 1], ['ix', 'sin'], HIRE],
    // 2.0.0: no more max-prefix outages to break the 30-day streak, so the reference can finish in under 100 days.
    win: [80, 250], cheese: [...home('mrs'), ['loans'], ['link', 'mrs', 'sin', 1], ['bb', 'sin']], by: null },
  spat: { ref: [...home('nyc'), HIRE], avoid: ['cog', 'drz'], win: [50, 140], cheese: [['bb', 'nyc'], ['tr', 'nyc', 1, 'cog'], ['hire', ['routers', 'repair']]], by: 160 },
  carnaval: { ref: [...home('rio'), ['hire'], ['wait', 69], ['prep', 'rio', 400], ['wait', 76], ['prep', 'rio', 400], ['wait', 83], ['prep', 'rio', 400]], win: [95, 95], cheese: [...home('rio'), ['loans']], by: null },
  darien: { ref: [...home('pan'), ['link', 'pan', 'bog', 1, 'pccs'], ['bb', 'bog'], ['ix', 'bog'], ['link', 'bog', 'lim', 1], ['bb', 'lim'], ['ix', 'lim'], ['link', 'lim', 'scl', 1], ['bb', 'scl'], ['ix', 'scl'], ['link', 'scl', 'sao', 1], ['bb', 'sao'], ['tr', 'sao', 1], ['ix', 'sao'], HIRE],
    win: [25, 90], cheese: [...['pan', 'bog', 'lim', 'scl', 'sao'].flatMap((c) => [['bb', c], ['tr', c, 1]]), ['hire']], by: null },
  c2c: { ref: [...home('cpt'), ['link', 'cpt', 'jnb', 1], ['bb', 'jnb'], ['tr', 'jnb', 1], ['ix', 'jnb'], ['link', 'jnb', 'nbo', 1], ['bb', 'nbo'], ['ix', 'nbo'], ['link', 'nbo', 'cai', 1], ['bb', 'cai'], ['ix', 'cai'], ['link', 'jnb', 'lag', 1], ['bb', 'lag'], ['ix', 'lag'], HIRE],
    win: [25, 130], cheese: [...home('cpt'), ['link', 'cpt', 'cai', 0], ['pop', 'lag'], ['pop', 'nbo'], ['hire']], by: null },
  ixbr: { ref: [...home('sao'), ...[['sao', 'rio', 1], ['sao', 'cpq', 0], ['sao', 'cwb', 0], ['cwb', 'poa', 0], ['rio', 'bhz', 0], ['bhz', 'bsb', 0], ['bsb', 'gyn', 0], ['rio', 'ssa', 0], ['ssa', 'rec', 0], ['rec', 'for', 0], ['rec', 'nat', 0], ['for', 'bel', 0], ['bel', 'mao', 0], ['bsb', 'cgb', 0], ['sao', 'vix', 0]].flatMap(([a, b, t]) => [['link', a, b, t], ['ix', b, 0]]), ['bb', 'rio'], ['tr', 'rio', 1], ['bb', 'bsb'], ['tr', 'bsb', 1], ['bb', 'for'], ['tr', 'for', 1], HIRE],
    win: [40, 120], cheese: [['bb', 'sao'], ['tr', 'sao', 1], ...['sao', 'rio', 'bsb', 'bhz', 'cwb', 'poa', 'for', 'rec', 'ssa', 'cpq', 'gyn', 'bel', 'mao', 'nat', 'vix', 'cgb'].flatMap((c) => [['pop', c], ['ix', c, 0]]), ['hire']], by: null },
  // Pay the three domestic incumbents, then keep an overseas exit available.
  gangnam: { ref: GN_REF, win: [100, 180], cheese: [...home('icn'), ['loans']], by: null },
  // 2.2: a center pulls the whole flood onto its own ingress, so a terabit flood needs a center that size (10T, level 4).
  flood: { ref: [...home('ams'), ['scrub', 'ams', 2], ['tr', 'ams', 1], HIRE], win: [80, 200], cheese: [...home('ams'), ['tr', 'ams', 1], ['loans']], by: 180 },
  fttb: { ref: [...home('syd'), ['link', 'syd', 'akl', 0, 'tasman'], ['link', 'syd', 'nou', 0, 'gond'], ...['mel', 'bne', 'adl', 'per'].flatMap((c) => [['bb', c], ['tr', c, 1]]), ['link', 'syd', 'mel', 1], ['link', 'syd', 'bne', 1], ['link', 'mel', 'adl', 1], ['link', 'adl', 'per', 0], HIRE],
    win: [80, 200], cheese: [...['syd', 'mel', 'bne', 'adl', 'per'].map((c) => ['bb', c]), ['tr', 'syd', 1], ['link', 'syd', 'akl', 0, 'tasman'], ['link', 'syd', 'nou', 0, 'gond'], ['loans']], by: 60 },
  // Tallinn has no transit: over the water to Helsinki and Stockholm on two cables each way, and round by land to Riga.
  baltic: { ref: [['bb', 'tll'], ['ix', 'tll'], ['link', 'tll', 'hel', 1, 'balt'], ['tr', 'hel', 1], ['link', 'tll', 'sto', 1, 'balt'], ['tr', 'sto', 1], ['link', 'tll', 'hel', 1, 'elisa'], ['link', 'tll', 'rix', 1], ['tr', 'rix', 1], ['hire', ['transit', 'routers', 'repair', 'ix']]],
    win: [90, 200], cheese: [['bb', 'tll'], ['ix', 'tll'], ['loans']], by: null },
  // The 1.6T chains: grow the traffic first, then light every hop at once (a day-0 build also gets there, just).
  pac: { ref: [...home('hnl'), ...home('lax'), ...home('syd'), ['link', 'lax', 'tok', 1, 'jup'], HIRE, ['served', 145], ['link', 'lax', 'hnl', 4, 'seaus'], ['link', 'hnl', 'suv', 4, 'scx'], ['link', 'suv', 'syd', 4, 'scx']],
    win: [30, 100], cheese: [...home('hnl'), ...home('lax'), ...home('syd'), ['link', 'lax', 'tok', 1, 'jup'], ['link', 'lax', 'syd', 3, 'hwk'], ['loans']], by: null },
  atl: { ref: [['bb', 'pdl'], ['tr', 'pdl', 1], ...home('mia'), ...home('mad'), ...home('lis'), HIRE, ['link', 'mia', 'bda', 4, 'sol'], ['link', 'bda', 'pdl', 4, 'sol'], ['link', 'pdl', 'mad', 4, 'sol'], ['served', 90], ['link', 'lis', 'tci', 4, 'ace'], ['link', 'tci', 'lag', 4, 'twoaf'], ['bb', 'lag']],
    win: [30, 120], cheese: [['bb', 'pdl'], ['tr', 'pdl', 1], ...home('mia'), ...home('mad'), ...home('lis'), ['link', 'mia', 'mad', 3, 'col3'], ['link', 'lis', 'lag', 3, 'equi'], ['loans']], by: null },
};

test('C1 played: every scenario has a reference strategy and a shortcut that fails', () => {
  const g = load();
  const ids = JSON.parse(g.ev('JSON.stringify(SCN.map(x=>x.id))'));
  assert.deepEqual(Object.keys(PLAY).sort(), ids.slice().sort(), 'C1: every scenario has a reference strategy here');
});

for (const [id, P] of Object.entries(PLAY)) {
  test(`${id}: the reference wins in its days, the shortcut does not`, () => {
    const g = load();
    const r = play(g.ev, id, P.ref, { avoid: P.avoid });
    assert.ok(r.won !== null, `${id}: the reference does not win (${JSON.stringify(r)})`);
    assert.ok(r.won >= P.win[0] && r.won <= P.win[1] && (id === 'carnaval' || r.won <= r.limit * 0.75), `${id}: won on day ${r.won}, want ${P.win.join('-')} of ${r.limit}`);
    const c = play(g.ev, id, P.cheese, { days: P.by || undefined });
    assert.ok(c.won === null, `${id}: the shortcut wins on day ${c.won}${P.by ? ` (before day ${P.by})` : ''}`);
    assert.deepEqual(g.errors, []);
  });
}

// Missing domestic interconnects or relying entirely on a distant exit fails the Seoul service target.
for (const [name, plan] of Object.entries({
  'Seoul transit and Kay-Tea': [['bb', 'icn'], ['ix', 'icn'], ['tr', 'icn', 1], ['pni', 'icn', 'ktt', 0], GN_H],
  'everything from Tokyo': [['bb', 'icn'], ['link', 'icn', 'tok', 1], ['tr', 'tok', 1], ['ix', 'tok'], ['pni', 'tok', 'ktt', 0], ['pop', 'hkg'], GN_H],
  'the 1.x reference': [...home('icn'), ['link', 'icn', 'tok', 1], ['ix', 'tok'], ['tr', 'tok', 1], ['link', 'icn', 'hkg', 1], ['ix', 'hkg'], ['tr', 'hkg', 1], HIRE],
})) {
  test(`gangnam: ${name} does not win`, () => {
    const g = load();
    const r = play(g.ev, 'gangnam', plan);
    assert.equal(r.won, null, `${name} won on day ${r.won}`);
    assert.deepEqual(g.errors, []);
  });
}

test('gangnam: paying all three domestic incumbents also works with Seoul transit first', () => {
  const { ev, dom, errors } = load();
  try {
    const r = play(ev, 'gangnam', GN_REF.filter(s => s[0] !== 'last'));
    assert.ok(r.won !== null && r.won < r.limit * 0.75, 'a fully paid local blend is a valid strategy');
    assert.ok(ev("['ktt','skb','lgu'].every(id=>S.pni.some(p=>p.net===id&&pniOn(p)))"));
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
