// Rule O7, played: the big-network save becomes a rocket company and runs a full lasered Shortcrust through the real
// day tick (pieDay, launches, aging, incidents, spats, offers, moods, orbit income), by a sensible player's policy.
// Seeded. Orbit is judged on its own books (S.pie.book): the fixture's ground network loses money on its own.
// It plays until the books balance (at most 10 years). PIE_BALANCE_YEARS=10 node --test tests/pie-balance.test.js plays
// that many years whatever happens and prints them year by year, PIE_BALANCE_DIAG=1 also monthly with the spending by kind
// and PIE_BALANCE_SEED another seed (for tuning). PIE_BALANCE_GOV=1 plays only the run with government money (below).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const YEARS = +(process.env.PIE_BALANCE_YEARS || 0);

// The policy, once a day before the tick:
// - a company, a factory, the reuse R&D and two pads, the coastal POPs nearest the equator;
// - lasered Shortcrust on the reusable rocket while the crust is short of full (never past it: replacements only), at most
//   two launches per pad in the queue;
// - safe mode while a solar storm is on;
// - the ground grows with the customers: an antenna on the busiest dish when one is over 90% or the healthy dishes (fiber
//   there at least 97% up) hold less than 1.3x what is sold, a new dish when every healthy dish has 16, at a well-served
//   POP under the crust (fiber at least 98% up), cheapest landing rights first, the first eight spread out;
// - landing rights renewed before they lapse, every orbit offer signed.
// With gov (the second test), the same player also takes government money: asks 50% in every Rural Digital Pie Fund
// auction, takes the Ex-Im Pie Bank's loan and keeps a dish in its country (the covenant).
// compute() runs every 30 days and whenever what the sky carries changes (coverage in 10% steps, hubs, lasers,
// safe mode, an orbit incident or spat starting or ending, orbit billing going down or coming back); orbit income is booked from the last one, as in the game.
function sim(days, stop = false, seed = 7, gov = false) {
  const g = load({ seed });
  const save = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
  g.ev(`S=migrate(JSON.parse(${lit(save)}));S.pieV=1;UI.started=true;UI.pitched=true;UI.speed=0;S.nextFail=1e9;S.nextEvent=1e9;
    isTier1=()=>true;after=()=>{};pieModal=()=>{};compute();pieInit();ACT.pieFound();ACT.pieFactory();ACT.pieRd({k:'reuse'});ACT.pieRd({k:'las'});
    for(const c of Object.keys(S.pops).filter(c=>pieCoast(c)&&piePadOk(c,'short')).sort((a,b)=>Math.abs(CITY[a].lat)-Math.abs(CITY[b].lat)).slice(0,2))ACT.piePad({city:c});
    window.__site=()=>{const ds=S.pie.dishes,lic=c=>pieLicOk(CITY[c].cc)?0:pieLicPrice(CITY[c].cc);
      const c=Object.keys(S.pops).filter(c=>pieCovers('short',c)&&!ds.some(x=>x.city===c)&&sfOf(R,c)>=0.98).sort((a,b)=>lic(a)-lic(b)||CITY[b].P-CITY[a].P);
      return (ds.length<8&&c.find(x=>ds.every(d=>pieKm(d.city,x)>=1500)))||c[0];};
    window.__step=()=>{const P=S.pie,C=CRUSTS.short,rk=P.rd.reuse?'again':'falcon';S.nextFail=1e9;S.nextEvent=1e9;let dirty=false;
      while(P.q.length<2*P.pads.length&&pieLive('short')+P.crusts.short.queued+ROCKETS[rk].pies<=C.full){if(!pieQuote(rk,'short',{las:true}).ok)break;ACT.pieLaunch({rk,cr:'short'});}
      const storm=S.inc.some(i=>i.type==='piestorm'&&i.until>S.day);if(storm!==P.safe){ACT.pieSafe();dirty=true;}
      if(pieUp('short')){const ok=x=>pieLicOk(CITY[x.city].cc)&&sfOf(R,x.city)>=0.97,u=x=>((R.pie&&R.pie.used[x.city])||0)/(x.ant*PIE_ANT_G);
        const cap=pieDishes().filter(ok).reduce((a,d)=>a+d.g,0),need=Math.min(pieMarket(),pieSold()*1.3+400);
        if(cap<need||P.dishes.some(x=>ok(x)&&u(x)>0.9&&x.ant<PIE_ANT_MAX)){const d=P.dishes.filter(x=>ok(x)&&x.ant<PIE_ANT_MAX).sort((a,b)=>u(b)-u(a))[0];
          if(d)ACT.pieAnt({id:d.id});else{const c=__site();if(c){if(!pieLicOk(CITY[c].cc))ACT.pieLic({cc:CITY[c].cc});ACT.pieDish({city:c});}}}}
      for(const d of P.dishes){const l=P.lic[CITY[d.city].cc];if(l&&l.state==='ok'&&l.until-S.day<5)ACT.pieLic({cc:CITY[d.city].cc});}
      for(const o of S.offers.filter(o=>BIZ_T[o.type].orbit))ACT.accept({id:o.id});
      if(window.__gov){const G=P.gov;for(const a of G.auc)if(a.bid!==0.5)ACT.pieBid({id:a.id,f:0.5});if(G.ex)ACT.pieExim();
        const l=pieEximLoan();if(l&&!pieEximDishOk(l)){const c=Object.keys(S.pops).filter(c=>CITY[c].cc===l.pie.cc&&pieCovers('short',c)&&!P.dishes.some(x=>x.city===c)).sort((a,b)=>sfOf(R,b)-sfOf(R,a))[0];
          if(c){if(!pieLicOk(l.pie.cc))ACT.pieLic({cc:l.pie.cc});ACT.pieDish({city:c});}}}
      const key=[pieHubs().join(),Math.round(pieCarry('short')*10),Math.round(pieCov('short')*10),pieLased('short'),P.safe,S.inc.filter(i=>PIE_INC.includes(i.type)&&i.until>S.day).map(i=>i.id).join(),Object.keys(P.spat).join(),P.gov.aw.length,P.founder.bill>S.day].join('|');if(key!==window.__key)dirty=true;window.__key=key;
      const real=compute;compute=()=>{if(dirty||S.day%30===0){window.__nC=(window.__nC||0)+1;real();}};try{dayTick();}finally{compute=real;}};
    window.__year=()=>({y:Math.round(S.day/360),spent:S.pie.book.spent,earned:S.pie.book.earned,mo:(R.pie&&R.pie.rev)||0,cov:pieCov('short'),cust:S.biz.filter(b=>BIZ_T[b.type].orbit).length,dishes:S.pie.dishes.length,nC:window.__nC|0});
    window.__gov=${gov};closeModal()`);
  if (process.env.PIE_BALANCE_DIAG) g.ev(`window.__B={};for(const k of ['pieLaunch','pieDish','pieAnt','pieLic','pieRd','pieFound','pieFactory','piePad','fixInc','pieSpatPick']){const f=ACT[k];if(!f)continue;ACT[k]=a=>{const s0=S.pie.book.spent;const r=f(a);__B[k]=(__B[k]||0)+(S.pie.book.spent-s0)/1e6;return r;};}
    {const f=pieDay;pieDay=d=>{const s0=S.pie.book.spent;f(d);__B.day=(__B.day||0)+(S.pie.book.spent-s0)/1e6;};}
    {const f=pieRdfRevoke;pieRdfRevoke=(w,avg)=>{(window.__L=window.__L||[]).push(['revoked',S.day,w.city,S.pops[w.city]?'pop':'terminals',avg.toFixed(2),Math.round(w.mo/1e6)+'M/mo',S.biz.filter(b=>b.city===w.city&&BIZ_T[b.type].orbit).length].join(' '));f(w,avg);};}
    {const f=pieRdfClose;pieRdfClose=a=>{if(a.bid&&a.bid<=a.riv)(window.__L=window.__L||[]).push(['award',S.day,a.city,S.pops[a.city]?'pop':'terminals',CITY[a.city].P,Math.round(a.ask*a.bid/1e6)+'M/mo'].join(' '));f(a);};}`);
  const rows = [];
  try {
    const d0 = g.ev('S.day');
    for (let d = 1; d <= days; d++) {
      g.ev('__step()');
      if (d % 360 === 0) { rows.push(JSON.parse(g.ev('JSON.stringify(__year())'))); if (stop && rows[rows.length - 1].earned >= rows[rows.length - 1].spent) break; }
      if (process.env.PIE_BALANCE_DIAG && d % 30 === 0) console.log(d, g.ev(`JSON.stringify({c:S.biz.filter(b=>BIZ_T[b.type].orbit).length,un:S.biz.filter(b=>BIZ_T[b.type].orbit&&!((R.pie.sf[b.id]||0)>=0.95)).length,mo:Math.round(R.pie.rev/1e6),hubs:pieHubs(),las:pieLased('short'),cov:+pieCov('short').toFixed(2),inc:S.inc.filter(i=>i.type.startsWith('pie')).map(i=>i.type),spat:Object.keys(S.pie.spat),safe:S.pie.safe,B:Object.fromEntries(Object.entries(__B).map(([k,v])=>[k,Math.round(v)]))})`));
    }
    rows.d0 = d0;
  } finally { g.ev('closeModal()'); }
  return { rows, errors: g.errors, ev: g.ev };
}

// The year the books balance, within the year it happens. The run stops there (at most 10 years); one that never
// balances is carried on by its last year's net, for the message.
function payback(rows) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], p = rows[i - 1] || { y: 0, spent: 0, earned: 0 };
    if (r.earned >= r.spent) return p.y + (p.spent - p.earned) / ((r.earned - p.earned) - (r.spent - p.spent));
  }
  const a = rows[rows.length - 2], b = rows[rows.length - 1], net = (b.earned - a.earned) - (b.spent - a.spent);
  return net > 0 ? b.y + (b.spent - b.earned) / net : Infinity;
}

let BASE = null;
test('O7: a full lasered Shortcrust, run sensibly through the game loop, pays back in 5 to 10 years', { timeout: 600000, skip: !!process.env.PIE_BALANCE_GOV }, () => {
  const years = YEARS || 10;
  const { rows, errors } = sim(360 * years, !YEARS, +(process.env.PIE_BALANCE_SEED || 7));
  if (YEARS) for (const r of rows) console.log(`year ${r.y}: spent ${(r.spent / 1e9).toFixed(2)}B, earned ${(r.earned / 1e9).toFixed(2)}B, orbit ${(r.mo / 1e6).toFixed(0)}M/mo, ${Math.round(r.cov * 100)}% covered, ${r.cust} customers, ${r.dishes} dishes, ${r.nC} computes`);
  const last = rows[rows.length - 1], y = payback(rows);
  if (YEARS) console.log(`payback: year ${y.toFixed(1)}`);
  assert.ok(last.cov > 0.9, `O7: the crust is full after ${years} years (${Math.round(last.cov * 100)}%)`);
  assert.ok(last.cust > 30, `O7: customers stay (${last.cust})`);
  assert.ok(y >= 5, `O7: a full Shortcrust pays back in ${y.toFixed(1)} years; make orbit dearer or its customers fewer`);
  BASE = y;
  assert.ok(y <= 10, `O7: a full Shortcrust pays back in ${y.toFixed(1)} years (spent ${(last.spent / 1e9).toFixed(1)}B, earned ${(last.earned / 1e9).toFixed(1)}B by year ${last.y}); make orbit cheaper or its customers more`);
  assert.deepEqual(errors, []);
});

// Government money (src/game/60-features/99-pie-subsidies.js, the Pitcairn grant has no town in this save) helps, but
// never turns the constellation into a bargain: at most two years sooner than without it, and never under four.
test('O7: government money pays back sooner, by two years at most', { timeout: 600000 }, () => {
  const years = YEARS || 10, seed = +(process.env.PIE_BALANCE_SEED || 7);
  const { rows, errors, ev } = sim(360 * years, !YEARS, seed, true);
  if (YEARS) for (const r of rows) console.log(`gov year ${r.y}: spent ${(r.spent / 1e9).toFixed(2)}B, earned ${(r.earned / 1e9).toFixed(2)}B, orbit ${(r.mo / 1e6).toFixed(0)}M/mo, ${r.cust} customers`);
  const y = payback(rows), st = JSON.parse(ev('JSON.stringify({won:S.stats.pieRdf|0,lost:S.stats.pieRdfLost|0,aw:S.pie.gov.aw.length,mo:pieGovMo(),exim:(S.loans.find(l=>l.bank===\'exim\')||{}).pie||null})'));
  if (process.env.PIE_BALANCE_DIAG) for (const l of JSON.parse(ev('JSON.stringify(window.__L||[])'))) console.log(l);
  if (YEARS) console.log(`gov payback: year ${y.toFixed(1)} (${st.won} awards won, ${st.lost} revoked, ${st.aw} in force at ${(st.mo / 1e6).toFixed(1)}M/mo, Ex-Im ${JSON.stringify(st.exim)})`);
  assert.ok(st.won > 0, 'the fund awarded something');
  assert.ok(y >= 4, `O7: with government money a full Shortcrust pays back in ${y.toFixed(1)} years; the fund pays too much`);
  if (BASE !== null) {
    assert.ok(y <= BASE + 0.3, `government money must not slow payback (the runs differ by chance after the first auction) (${y.toFixed(1)} vs ${BASE.toFixed(1)})`);
    assert.ok(BASE - y <= 2, `O7: government money pays back ${(BASE - y).toFixed(1)} years sooner (${y.toFixed(1)} vs ${BASE.toFixed(1)}); the fund pays too much`);
  }
  assert.deepEqual(errors, []);
});
