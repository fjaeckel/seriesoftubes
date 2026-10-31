// Rule C1, played (gameplay-rules): every handmade scenario has a reference strategy (scripts/lib/scenario-ref.js,
// the player's own actions, a plan a sensible human would follow) that wins within its days, and the obvious shortcut
// does not. The win days below were recorded in the 2.0.0 playtest; a balance change that moves them far is a change
// in how the scenario plays, so look before you re-record.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { play } = require('../scripts/lib/scenario-ref');

const HIRE = ['hire', ['transit', 'routers', 'repair', 'sales', 'ix']];
const home = (c) => [['bb', c], ['tr', c, 1], ['ix', c]];
const GN_H = ['hire', ['transit', 'routers', 'repair', 'sales', 'ix', 'caches', 'pni']];
const GN_REF = [['bb', 'icn'], ['ix', 'icn'], ['tr', 'icn', 1], ['pni', 'icn', 'ktt', 0], GN_H, ['served', 120], ['link', 'icn', 'tok', 1], ['tr', 'tok', 1], ['ix', 'tok'], ['last', 'icn'], ['pop', 'hkg']];
// ref: the reference plan; win: [earliest, latest] day it may win on; cheese: the shortcut, and `by`, the day before
// which it must not win (null: never within the scenario's days).
const PLAY = {
  stg: { ref: [['bb', 'stg'], ['ix', 'stg'], ['link', 'stg', 'fra', 1], ['ix', 'fra'], ['bb', 'fra'], ['link', 'fra', 'ams', 1], ['ix', 'ams'], ['bb', 'ams'], ['link', 'ams', 'lon', 1], ['ix', 'lon'], ['bb', 'lon'], ['link', 'fra', 'par', 1], ['ix', 'par'], ['bb', 'par'], ['hire', ['routers', 'repair', 'caches', 'pni', 'ix', 'sales'], { pni: { paid: true } }], ['link', 'stg', 'muc', 1], ['ix', 'muc'], ['bb', 'muc'], ['wait', 120], ['pnis'], ['link', 'lon', 'nyc', 2], ['ix', 'nyc'], ['bb', 'nyc'], ['wait', 200], ['pnis']],
    win: [120, 240], cheese: [['bb', 'stg'], ['ix', 'stg'], ['link', 'stg', 'fra', 1], ['ix', 'fra'], ['bb', 'fra'], ['loans'], ['hire', ['routers', 'repair']]], by: null },
  // The other way round the planet: Paris, New York, Los Angeles, Tokyo, Hong Kong, Singapore.
  redsea: { ref: [...home('mrs'), ['link', 'mrs', 'par', 1], ['bb', 'par'], ['ix', 'par'], ['link', 'par', 'nyc', 1, 'amitie'], ['tr', 'nyc', 1], ['ix', 'nyc'], ['link', 'nyc', 'lax', 1], ['ix', 'lax'], ['tr', 'lax', 1], ['link', 'lax', 'tok', 1, 'jup'], ['bb', 'tok'], ['tr', 'tok', 1], ['ix', 'tok'], ['link', 'tok', 'hkg', 1, 'apg'], ['bb', 'hkg'], ['tr', 'hkg', 1], ['ix', 'hkg'], ['link', 'hkg', 'sin', 1], ['bb', 'sin'], ['tr', 'sin', 1], ['ix', 'sin'], HIRE],
    // 2.0.0: no more max-prefix outages to break the 30-day streak, so the reference can finish in under 100 days.
    win: [80, 250], cheese: [...home('mrs'), ['loans'], ['link', 'mrs', 'sin', 1], ['bb', 'sin']], by: null },
  spat: { ref: [...home('nyc'), HIRE], avoid: ['cog'], win: [50, 140], cheese: [...home('nyc'), ['hire', ['routers', 'repair']]], by: 160 },
  carnaval: { ref: [...home('rio'), ['hire'], ['wait', 69], ['prep', 'rio', 400], ['wait', 76], ['prep', 'rio', 400], ['wait', 83], ['prep', 'rio', 400]], win: [95, 95], cheese: [...home('rio'), ['loans']], by: null },
  darien: { ref: [...home('pan'), ['link', 'pan', 'bog', 1, 'pccs'], ['bb', 'bog'], ['ix', 'bog'], ['link', 'bog', 'lim', 1], ['bb', 'lim'], ['ix', 'lim'], ['link', 'lim', 'scl', 1], ['bb', 'scl'], ['ix', 'scl'], ['link', 'scl', 'sao', 1], ['bb', 'sao'], ['tr', 'sao', 1], ['ix', 'sao'], HIRE],
    win: [30, 90], cheese: [...['pan', 'bog', 'lim', 'scl', 'sao'].flatMap((c) => [['bb', c], ['tr', c, 1]]), ['hire']], by: null },
  c2c: { ref: [...home('cpt'), ['link', 'cpt', 'jnb', 1], ['bb', 'jnb'], ['tr', 'jnb', 1], ['ix', 'jnb'], ['link', 'jnb', 'nbo', 1], ['bb', 'nbo'], ['ix', 'nbo'], ['link', 'nbo', 'cai', 1], ['bb', 'cai'], ['ix', 'cai'], ['link', 'jnb', 'lag', 1], ['bb', 'lag'], ['ix', 'lag'], HIRE],
    win: [70, 200], cheese: [...home('cpt'), ['link', 'cpt', 'cai', 0], ['pop', 'lag'], ['pop', 'nbo'], ['hire']], by: null },
  ixbr: { ref: [...home('sao'), ...[['sao', 'rio', 1], ['sao', 'cpq', 0], ['sao', 'cwb', 0], ['cwb', 'poa', 0], ['rio', 'bhz', 0], ['bhz', 'bsb', 0], ['bsb', 'gyn', 0], ['rio', 'ssa', 0], ['ssa', 'rec', 0], ['rec', 'for', 0], ['rec', 'nat', 0], ['for', 'bel', 0], ['bel', 'mao', 0], ['bsb', 'cgb', 0], ['sao', 'vix', 0]].flatMap(([a, b, t]) => [['link', a, b, t], ['ix', b, 0]]), ['bb', 'rio'], ['tr', 'rio', 1], ['bb', 'bsb'], ['tr', 'bsb', 1], ['bb', 'for'], ['tr', 'for', 1], HIRE],
    win: [40, 120], cheese: [['bb', 'sao'], ['tr', 'sao', 1], ...['sao', 'rio', 'bsb', 'bhz', 'cwb', 'poa', 'for', 'rec', 'ssa', 'cpq', 'gyn', 'bel', 'mao', 'nat', 'vix', 'cgb'].flatMap((c) => [['pop', c], ['ix', c, 0]]), ['hire']], by: null },
  // Sender pays: Seoul transit to start (dear, but fast), one paid PNI with Kay-Tea for reach, then haul the bulk from
  // Tokyo and keep Seoul transit as the last resort. Seoul alone loses money on the sender-pays fee and never wins.
  gangnam: { ref: GN_REF, win: [130, 190], cheese: [...home('icn'), ['loans']], by: null },
  // Bigger routers bring Flowspec, which also takes floods: without a scrubbing center it takes twice as long.
  flood: { ref: [...home('ams'), ['scrub', 'ams', 1], ['tr', 'ams', 1], HIRE], win: [80, 200], cheese: [...home('ams'), ['tr', 'ams', 1], ['loans']], by: 180 },
  fttb: { ref: [...home('syd'), ['link', 'syd', 'akl', 0, 'tasman'], ['link', 'syd', 'nou', 0, 'gond'], ...['mel', 'bne', 'adl', 'per'].flatMap((c) => [['bb', c], ['tr', c, 1]]), ['link', 'syd', 'mel', 1], ['link', 'syd', 'bne', 1], ['link', 'mel', 'adl', 1], ['link', 'adl', 'per', 0], HIRE],
    win: [80, 200], cheese: [...['syd', 'mel', 'bne', 'adl', 'per'].map((c) => ['bb', c]), ['tr', 'syd', 1], ['link', 'syd', 'akl', 0, 'tasman'], ['link', 'syd', 'nou', 0, 'gond'], ['loans']], by: 60 },
  // Tallinn has no transit: over the water to Helsinki and Stockholm on two cables each way, and round by land to Riga.
  baltic: { ref: [['bb', 'tll'], ['ix', 'tll'], ['link', 'tll', 'hel', 1, 'balt'], ['tr', 'hel', 1], ['link', 'tll', 'sto', 1, 'balt'], ['tr', 'sto', 1], ['link', 'tll', 'hel', 1, 'elisa'], ['link', 'tll', 'rix', 1], ['tr', 'rix', 1], ['hire', ['transit', 'routers', 'repair', 'ix']]],
    win: [90, 200], cheese: [['bb', 'tll'], ['ix', 'tll'], ['loans']], by: null },
  // The 1.6T chains: grow the traffic first, then light every hop at once (a day-0 build also gets there, just).
  pac: { ref: [...home('hnl'), ...home('lax'), ...home('syd'), ['link', 'lax', 'tok', 1, 'jup'], HIRE, ['served', 145], ['link', 'lax', 'hnl', 4, 'seaus'], ['link', 'hnl', 'suv', 4, 'scx'], ['link', 'suv', 'syd', 4, 'scx']],
    win: [50, 120], cheese: [...home('hnl'), ...home('lax'), ...home('syd'), ['link', 'lax', 'tok', 1, 'jup'], ['link', 'lax', 'syd', 3, 'hwk'], ['loans']], by: null },
  atl: { ref: [['bb', 'pdl'], ['tr', 'pdl', 1], ...home('mia'), ...home('mad'), ...home('lis'), HIRE, ['link', 'mia', 'bda', 4, 'sol'], ['link', 'bda', 'pdl', 4, 'sol'], ['link', 'pdl', 'mad', 4, 'sol'], ['served', 90], ['link', 'lis', 'tci', 4, 'ace'], ['link', 'tci', 'lag', 4, 'twoaf'], ['bb', 'lag']],
    win: [40, 120], cheese: [['bb', 'pdl'], ['tr', 'pdl', 1], ...home('mia'), ...home('mad'), ...home('lis'), ['link', 'mia', 'mad', 3, 'col3'], ['link', 'lis', 'lag', 3, 'equi'], ['loans']], by: null },
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

// Gangnam Style Peering bites every way (2.0.0 playtest): paying the sender-pays fee on everything loses money, hauling
// everything from Tokyo is too slow for Korean users, and the old plan (transit everywhere, no Kay-Tea) has neither
// the reach nor the profit. The reference's Seoul transit as first choice, not last resort, also stays in the red.
for (const [name, plan] of Object.entries({
  'Seoul transit and Kay-Tea': [['bb', 'icn'], ['ix', 'icn'], ['tr', 'icn', 1], ['pni', 'icn', 'ktt', 0], GN_H],
  'everything from Tokyo': [['bb', 'icn'], ['link', 'icn', 'tok', 1], ['tr', 'tok', 1], ['ix', 'tok'], ['pni', 'tok', 'ktt', 0], ['pop', 'hkg'], GN_H],
  'the 1.x reference': [...home('icn'), ['link', 'icn', 'tok', 1], ['ix', 'tok'], ['tr', 'tok', 1], ['link', 'icn', 'hkg', 1], ['ix', 'hkg'], ['tr', 'hkg', 1], HIRE],
  'Tokyo haul, Seoul transit first': GN_REF.filter((s) => s[0] !== 'last'),
})) {
  test(`gangnam: ${name} does not win`, () => {
    const g = load();
    const r = play(g.ev, 'gangnam', plan);
    assert.equal(r.won, null, `${name} won on day ${r.won}`);
    assert.deepEqual(g.errors, []);
  });
}
