// Plays random actions against the real game for a while and fails on any exception, in the game or in the
// browser's console. Seeds are fixed so a failure is reproducible: `node --test tests/fuzz.test.js`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const SEEDS = (process.env.FUZZ_SEEDS || '3,11,42').split(',').map(Number);
const DAYS = Number(process.env.FUZZ_DAYS || 700);

for (const seed of SEEDS) {
  test(`fuzz: random play on seed ${seed} never throws`, () => {
    const { ev, errors } = load({ seed });
    let r = seed * 7919 + 13;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    const bad = new Map();
    const ex = (code, tag) => { try { return ev(code); } catch (e) { const k = `${tag}: ${String(e.message).slice(0, 120)} @ ${String((e.stack || '').split('\n')[1] || '').slice(0, 90)}`; bad.set(k, (bad.get(k) || 0) + 1); return null; } };
    ex('ACT.start({});S.cash=3e8;S.lvl=4;for(const g of GOALS)S.done[g.id]=0', 'start');
    const FORCE = ['quake', 'canyon', 'volcano', 'hijack', 'dispute', 'redsea', 'baltic'];
    for (let d = 0; d < DAYS; d++) {
      if (d % 7 === 0) {
        const cities = JSON.parse(ex('JSON.stringify(Object.keys(S.pops))', 'pops') || '[]');
        const any = () => cities[Math.floor(rnd() * cities.length)];
        const cid = JSON.parse(ex(`JSON.stringify(CITIES[${Math.floor(rnd() * 400)}].id)`, 'c'));
        const calls = [
          `ACT.buildPop({city:'${cid}'})`, `ACT.launchBB({city:'${any()}'})`,
          `ACT.buyTransit({city:'${any()}',net:NETS.filter(n=>n.price)[${Math.floor(rnd() * 30)}%NETS.filter(n=>n.price).length].id,tier:${Math.floor(rnd() * 4)}})`,
          `{const a='${any()}',b='${any()}';if(a!==b){UI.pending={a,b};ACT.buildLink({tier:${Math.floor(rnd() * 4)}});}}`,
          `ACT.addRouter({city:'${any()}',n:${1 + Math.floor(rnd() * 5)}})`, `ACT.buyIx({city:'${any()}',tier:${Math.floor(rnd() * 4)},signed:true})`,
          `ACT.rs({city:'${any()}'})`, `ACT.peerAll({city:'${any()}'})`, `{const i=S.inc[0];if(i)ACT.fixInc({id:i.id});}`,
          "{const s=stf();if(s.pool.length)ACT.stHire({id:s.pool[0].id});}", "{const s=stf();if(s.people.length){const r=['sales','noc','srnoc','arch','peer','mkt']["+Math.floor(rnd()*6)+"];polOf(r).mode=['ask','auto']["+Math.floor(rnd()*2)+"];polOf(r).budget=1e6;polOf(r).reserve=0;}}", 'if(stf().inbox.length)ACT.stApprove({id:stf().inbox[0].id})', 'ACT.contracts();ACT.deals();ACT.legacy();ACT.ops()', 'if((S.deals||[]).length)ACT.dealTake({id:S.deals[0].id})', 'ACT.opsFreeze()', `ACT.opsMaint({city:'${any()}'})`, 'ACT.secRov()', 'ACT.secIrr()', 'ACT.secAuto()', 'ACT.secRenew()',
          `{const t=S.transit[0];if(t)ACT.setCommit({id:t.id,v:[0.2,0.5,0.8][${Math.floor(rnd() * 3)}]});}`,
          `S.te={on:true,script:['prepend transit cogent x2','lowpref transit ntt','prefer pni for netflix','spill at 80%'][${Math.floor(rnd() * 4)}]};`,
          `fireEvent('${FORCE[Math.floor(rnd() * FORCE.length)]}')`, `fireFailure('${['cut', 'crash', 'power', 'leak', 'rpki', 'ddos', 'transit'][Math.floor(rnd() * 7)]}')`,
          'if(S.ev.dispute)ACT.dispPay()', 'ACT.dispPublic()', `ACT.trace({});ACT.trTool({tool:['ping','mtr','lg','trace'][${Math.floor(rnd() * 4)}]})`,
          'ACT.timelapse();ACT.tlClose()', "routesModal(['ov','up','pe','px','pa','cu','sec'][" + Math.floor(rnd() * 7) + '])',
        ];
        ex(calls[Math.floor(rnd() * calls.length)], 'act');
      }
      ex('dayTick()', 'dayTick');
      if (d % 40 === 0) ex('renderPanel();renderLeft();renderHUD()', 'render');
      if (d % 200 === 0) ex('save();S=migrate(JSON.parse(JSON.stringify(S)));compute()', 'migrate');
      if (ex('S.lost', 'lost')) break;
    }
    assert.deepEqual([...bad], [], 'exceptions while playing');
    assert.deepEqual(errors, []);
  });
}
