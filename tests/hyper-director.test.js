// The Hyperscaler's director (60-features/38-hyper-director.js): every pressure event asks it first. Over long seeded
// runs it lets in a few crises per hundred days, more at higher levels, one at a time and with a quiet stretch after
// each; systems switch on at their level and are introduced once; a lone region bends and never fails whole; a grid
// trip is announced the day before with an answer; the eyeball world's events and chatter stay out of the charter (and
// only out of it); toasts there are for decisions and milestones; saves.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
const J = (ev, c) => JSON.parse(ev(`JSON.stringify((${c})??null)`));
/* A Hyperscaler in Frankfurt with transit; two regions (a Server Barn at home, a Rack Shack in Paris joined by a wave)
   unless one, German and French users, a startup with DNS and a game studio as tenants. */
function cloud(t, { seed = 7, one = false } = {}) {
  const h = load({ seed });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;ACT.buildPop({city:'par'});for(const c in S.pops)S.pops[c].rgen=RG_TOP;" +
    "for(const c of ['fra','par'])ACT.buyTransit({city:c,net:'cog',tier:3});S.hs.rg.fra={t:1,ready:0,mw:20};" +
    (one ? '' : "S.hs.rg.par={t:0,ready:0,mw:5};S.hs.pw.par=hsPwDef('par');") + "S.hs.cc.DE={d:300,since:0};S.hs.cc.FR={d:150,since:0};S.links=[];" + wave('fp', 'fra', 'par', 3) +
    "S.offers=[];for(const [id,k,p] of [['t1','startup',['vm','obj','dns']],['t2','game',['fn','k8s','cdn']]]){const o=hsOffer(k,'fra',10);o.id=id;o.p=p;S.offers.push(o);ACT.accept({id})}" +
    "for(const b of S.biz)b.since=-30;compute();hsDay(S.day);S.log=[]");
  return h;
}
// Counts what the director grants (crises only), with the state it granted in, while the days run at a pinned level.
const WATCH = "window.__g=[];{const f=hsDirAsk;window.hsDirAsk=(k,w,r)=>{const ok=f(k,w,r);if(ok&&S.hs&&!HS_DIR_OPPS.includes(k))__g.push({k,d:S.day,inc:S.inc.filter(i=>i.until>S.day&&i.start<S.day).length,c:S.hs.dir.c&&S.hs.dir.c.d===S.day&&S.hs.dir.c.k===k});return ok;};}";
// The tenants are kept content (rivals, launches and DNS outages need them there), the level and the cash pinned.
const run = (ev, lv, days) => J(ev, `(()=>{custLevel=()=>${lv};for(let i=0;i<${days};i++){S.lvl=${lv};S.cash=Math.max(S.cash,1e12);for(const b of hsTen())b.mood=Math.max(b.mood,85);dayTick();closeModal();}return __g})()`);

test('a few crises per hundred days, more at higher levels, one at a time, a quiet stretch after each', (t) => {
  const per = {};
  for (const lv of [1, 3, 6]) {
    const { ev, errors } = cloud(t);
    // Past the first months, so every system that can switch on has (and has been introduced).
    ev(`S.day=200;S.hs.dir.t=200;S.nextFail=S.nextEvent=210;${WATCH}`);
    const g = run(ev, lv, 400);
    const quiet = ev(`(S.lvl=${lv},hsDirQuiet())`);
    per[lv] = g.length / 4;
    t.diagnostic(`level ${lv}: ${g.length} crises in 400 days (${g.map((x) => x.k + '@' + x.d).join(' ')}), quiet ${quiet} days`);
    for (const x of g) {
      assert.equal(x.inc, 0, `nothing else was on when ${x.k} started on day ${x.d}`);
      assert.ok(x.c, `${x.k} on day ${x.d} is the crisis on now`);
    }
    for (let i = 1; i < g.length; i++) assert.ok(g[i].d - g[i - 1].d >= quiet, `a quiet stretch between ${g[i - 1].k}@${g[i - 1].d} and ${g[i].k}@${g[i].d}`);
    assert.deepEqual(errors, []);
  }
  t.diagnostic('crises per 100 days by level: ' + JSON.stringify(per));
  assert.ok(per[1] >= 0.5 && per[1] <= 3, 'level 1: one or two in a hundred days');
  assert.ok(per[3] >= 1 && per[3] <= 5, 'level 3: a few');
  assert.ok(per[6] >= 1.5 && per[6] <= 7, 'level 6: more, never a flood');
  assert.ok(per[6] >= per[1], 'bigger clouds meet more trouble');
});

test('the budget grows with level, regions and the chaos rule; opportunities are capped, not budgeted', (t) => {
  const { ev, errors } = cloud(t);
  const grow = (lv, chaos, rg) => ev(`(()=>{S.lvl=${lv};S.rules.chaos=${lit(chaos)};${rg ? '' : "S.hs.rg.par.ready=1e9;"}Object.assign(S.hs.dir,{b:0,t:S.day,c:null});S.day+=10;hsDirSettle();const b=S.hs.dir.b;S.day-=10;S.hs.rg.par.ready=0;return b})()`);
  assert.ok(grow(6, 'normal', true) > grow(1, 'normal', true), 'level');
  assert.ok(grow(3, 'normal', true) > grow(3, 'normal', false), 'live regions');
  assert.ok(grow(3, 'spicy', true) > grow(3, 'normal', true) && grow(3, 'normal', true) > grow(3, 'calm', true), 'chaos');
  assert.equal(grow(3, 'none', true), 0, 'no chaos, no budget');
  assert.ok(ev("(S.lvl=1,S.rules.chaos='calm',hsDirQuiet())") > ev("(S.lvl=6,S.rules.chaos='normal',hsDirQuiet())"), 'calm and small: longer quiet');
  // The budget caps: a long wait does not bank a flood.
  ev("S.rules.chaos='normal';S.lvl=3;Object.assign(S.hs.dir,{b:0,t:S.day});S.day+=5000;hsDirSettle();S.day-=5000");
  assert.equal(ev('S.hs.dir.b'), ev('hsDirCap()'));
  // Opportunities: never more than HS_DIR_OPP waiting at once, whatever the budget.
  ev("S.hs.dir.b=0;S.offers=[];S.hs.jo=[];S.hs.rs.o=[]");
  assert.equal(ev("hsDirAsk('ten')"), true);
  ev("for(let i=0;i<HS_DIR_OPP;i++)S.offers.push(hsOffer('startup','fra',5))");
  assert.equal(ev("hsDirAsk('ten')"), false, 'the desk is full');
  assert.equal(ev("(()=>{let n=S.offers.length;for(let i=0;i<50;i++)spawnOffer();return S.offers.length-n})()"), 0, 'and nothing more calls');
  assert.deepEqual(errors, []);
});

test('systems switch on at their level, each introduced once, a few days apart; old saves are not lectured', (t) => {
  const { ev, errors } = cloud(t);
  const on = (lv) => J(ev, `(S.lvl=${lv},Object.fromEntries(Object.keys(HS_DIR_INTRO).map(k=>[k,hsDirCan(k)])))`);
  ev('S.day=10');
  assert.deepEqual(on(1), { pev: false, ddos: false, rv: false, ai: false, freeze: false, inc: false, law: false, fail: false });
  assert.deepEqual(on(2), { pev: true, ddos: true, rv: false, ai: false, freeze: false, inc: false, law: false, fail: false });
  assert.deepEqual(on(3), { pev: true, ddos: true, rv: true, ai: true, freeze: true, inc: false, law: false, fail: false });
  assert.deepEqual(on(4), { pev: true, ddos: true, rv: true, ai: true, freeze: true, inc: true, law: true, fail: false }, 'region failures wait for day HS_DIR_BIG');
  ev('S.day=HS_DIR_BIG');
  assert.equal(on(4).fail, true);
  ev("S.hs.rg.par.ready=1e9");
  assert.equal(on(8).fail, false, 'and for a second live region');
  assert.equal(on(8).ai, false, 'AI runs need two regions too');
  ev("S.hs.rg.par.ready=0;delete S.biz.find(b=>b.id==='t2').ck;S.biz.find(b=>b.id==='t2').ck='startup'");
  assert.equal(on(8).freeze, false, 'launch days need a game studio');
  ev("S.biz.find(b=>b.id==='t2').ck='game'");
  // Not on before its introduction: rivals bid on nothing until then.
  ev('S.lvl=3');
  assert.equal(ev("hsDirOn('rv')"), false);
  ev("S.offers.push(Object.assign(hsOffer('startup','fra',10),{id:'o1'}));hsRvDay(S.day)");
  assert.equal(ev('S.hs.rv.of.o1.w'), -1, 'no bid before rivals are introduced');
  // Introductions: one each, HS_DIR_GAP days apart, never again.
  ev('S.lvl=4;S.log=[]');
  const shown = J(ev, "(()=>{const o=[];for(let i=0;i<60;i++){S.day++;S.lvl=4;const n=S.log.length;hsDirDay(S.day);if(S.log.length>n)o.push([S.day,S.log[0].t])}return o})()");
  assert.equal(shown.length, 8, shown.map((x) => x[1]).join(' | '));
  assert.match(shown.map((x) => x[1]).join(' '), /Rival clouds have noticed you/);
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i][0] - shown[i - 1][0] >= ev('HS_DIR_GAP'));
  assert.equal(ev("(()=>{const n=S.log.length;for(let i=0;i<30;i++){S.day++;hsDirDay(S.day)}return S.log.length-n})()"), 0, 'once');
  assert.equal(ev("hsDirOn('rv')&&hsDirOn('fail')"), true);
  // A Hyperscaler save from before the director: its systems count as introduced, silently.
  const back = J(ev, "(()=>{const s=JSON.parse(JSON.stringify(S));delete s.hs.dir;const r=parseSave(JSON.stringify(s));S=migrate(r.s);S.log=[];for(let i=0;i<20;i++){S.day++;hsDirDay(S.day)}return {i:S.hs.dir.i,log:S.log.length}})()");
  assert.equal(back.log, 0);
  assert.deepEqual(Object.keys(back.i).sort(), ['ai', 'ddos', 'fail', 'freeze', 'inc', 'law', 'pev', 'rv']);
  assert.deepEqual(errors, []);
});

test('a lone region bends, never breaks: outages degrade it, and nothing takes it down whole', (t) => {
  const { ev, errors } = cloud(t, { one: true });
  ev(`S.day=400;S.lvl=8;S.rules.chaos='spicy';Object.assign(S.hs.dir,{b:9,t:400,i:Object.fromEntries(Object.keys(HS_DIR_INTRO).map(k=>[k,0]))});compute()`);
  assert.equal(ev('hsSolo()'), 'fra');
  const g0 = ev('R.hs.rg.fra.g');
  assert.ok(g0 > 0);
  // A router crash and a power cut at its POP: grid trouble instead, half of its room, the same repair.
  for (const k of ['crash', 'power', 'oops']) {
    ev(`S.inc=[];S.pops.fra.routers=1;delete S.pops.fra.gen;delete S.pops.fra.site2;delete S.pops.fra.down;(()=>{const r=Math.random;Math.random=()=>0;try{fireFailure(${lit(k)})}finally{Math.random=r}})()`);
    const i = J(ev, "S.inc.find(i=>i.ref==='fra')");
    assert.ok(i, k + ' hit Frankfurt');
    assert.equal(i.type, 'hspow', k + ' became grid trouble');
    assert.match(i.msg, /only region/);
    assert.equal(ev('popUp("fra")'), true, 'the POP stays up');
    ev('compute()');
    assert.ok(ev('R.hs.rg.fra.g') >= g0 * 0.4 && ev('R.hs.rg.fra.g') <= g0 * 0.7, 'serving 40 to 70%');
    assert.ok(i.cost > 0, 'with its repair');
    ev('S.inc=[];compute()');
    assert.equal(ev('R.hs.rg.fra.g'), g0, 'and back in full once it is over');
  }
  // A grid squeezed to nothing: no warning, no trip, no region failure kind, no Chaos Kong; a year of spicy days.
  ev("hsPwMk('fra').cap=1;S.hs.pev=[{k:'heat',reg:'EU',until:1e9}];S.monkey={on:1,start:S.day,until:S.day+999,snip:S.day,n:0,hurt:0,c:'fra'}");
  assert.equal(ev('hsFailOn()||hsKong()'), false);
  const out = J(ev, "(()=>{const o={trip:0,region:0,out:0,warn:0};for(let i=0;i<365;i++){Object.assign(S.hs.dir,{c:null,q:0,b:9});S.cash=1e12;dayTick();closeModal();if(S.hs.dir.w)o.warn++;if(S.inc.some(x=>x.type==='region'))o.region++;if(Object.keys(S.hs.out).length)o.out++;}return o})()");
  assert.deepEqual(out, { trip: 0, region: 0, out: 0, warn: 0 });
  assert.deepEqual(errors, []);
});

test('a grid trip is announced the day before, with an answer; unanswered, the region fails over', (t) => {
  const { ev, errors } = cloud(t);
  ev(`S.day=300;S.lvl=6;Object.assign(S.hs.dir,{b:9,t:300,i:Object.fromEntries(Object.keys(HS_DIR_INTRO).map(k=>[k,0]))});S.hs.rep.par='fra';S.hs.rep.fra='par';compute()`);
  const dayOf = "(()=>{let d=S.day+1;while(hstr(S.asn+'|trip|par|'+d)%1000>=250)d++;return d})()";
  const d = ev(dayOf);
  ev(`hsPwMk('par').cap=1;S.day=${d};S.log=[];hsFailDay(${d})`);
  const w = J(ev, 'S.hs.dir.w');
  assert.deepEqual(w, { c: 'par', d: d + 1, k: 'cut', ok: 0 }, 'a warning for tomorrow');
  assert.equal(ev("S.inc.some(i=>i.type==='region')"), false, 'nothing tripped yet');
  assert.match(ev('S.log[0].t'), /probably trip tomorrow/);
  assert.match(ev('hsCard()'), /may trip tomorrow/);
  assert.match(ev('hsCard()'), /data-act="hsPrecool"/);
  // Answered: rented kit, the night is survived.
  const c0 = ev('S.cash'), cost = ev("hsChillCost('par')");
  ev("ACT.hsPrecool({city:'par'})");
  assert.equal(c0 - ev('S.cash'), cost);
  ev(`S.day=${d + 1};hsFailDay(${d + 1})`);
  assert.equal(ev("S.inc.some(i=>i.type==='region')"), false, 'held');
  assert.equal(ev('S.hs.dir.w'), null);
  // Unanswered: it trips the next day, as a region failure with its failover.
  ev(`S.hs.dir.c=null;S.hs.dir.q=0;S.day=${d + 1}`);
  const d2 = ev(dayOf);
  ev(`S.day=${d2};hsFailDay(${d2})`);
  assert.equal(ev('S.hs.dir.w.d'), d2 + 1);
  ev(`S.day=${d2 + 1};hsFailDay(${d2 + 1})`);
  assert.ok(ev("S.inc.some(i=>i.type==='region'&&i.ref==='par')"), 'tripped');
  assert.ok(ev("!!S.hs.out.par"), 'and failed over');
  // An answer with nothing to answer is refused.
  const c1 = ev('S.cash');
  ev("ACT.hsPrecool({city:'fra'})");
  assert.equal(ev('S.cash'), c1);
  assert.deepEqual(errors, []);
});

test('the eyeball world\'s events stay out of the charter, and only out of it', (t) => {
  // The same 300 world events, in the charter and in a classic game.
  const events = (h) => J(h.ev, `(()=>{const seen={grant:0,viral:0,golden:0,cake:0,landban:0};for(let i=0;i<300;i++){const c=S.cash;S.ev.viral=S.ev.golden=0;delete S.ev.landban;
    if(S.hs)Object.assign(S.hs.dir,{c:null,q:0,b:9});S.inc=[];runNow(eventRun());if(S.cash-c===30000)seen.grant++;if(S.cash-c===8000)seen.cake++;if(S.ev.viral)seen.viral++;if(S.ev.golden)seen.golden++;if(S.ev.landban)seen.landban++;}return seen})()`);
  const { ev, errors } = cloud(t);
  ev("S.day=400;S.pops.sha={};S.peers['drz@fra']=1");
  const hs = events({ ev });
  assert.deepEqual(hs, { grant: 0, viral: 0, golden: 0, cake: 0, landban: 0 }, 'none in the charter');
  const c = load({ seed: 7 });
  t.after(() => c.dom.window.close());
  c.ev("ACT.start({});S.cash=1e9;ACT.buildPop({city:'par'});S.day=400;compute()");
  const cl = events(c);
  assert.ok(cl.grant > 0 && cl.viral > 0 && cl.landban > 0, 'all of them in a classic game: ' + JSON.stringify(cl));
  assert.equal(c.ev('hsDirAsk("classic")&&hsDirAsk("inc")&&hsDirAsk("ten")'), true, 'a classic game never asks anything');
  assert.equal(c.ev('S.hs===undefined'), true);
  assert.deepEqual(errors, []);
  assert.deepEqual(c.errors, []);
});

test('toasts in the charter: decisions and milestones pop up, the rest goes to the NOC log, two at most', (t) => {
  const { ev, dom, errors } = cloud(t);
  ev("$('toasts').innerHTML='';S.log=[];UI.tick=true;toast('chatter','');toast('news','bad');toast('needs you','bad',[{l:'Open',act:'popGo',args:{city:'fra'}}]);toast('milestone','goal');UI.tick=false");
  const txt = ev("$('toasts').textContent");
  assert.doesNotMatch(txt, /chatter|news/);
  assert.match(txt, /needs you/);
  assert.match(txt, /milestone/);
  assert.equal(ev('S.log.length'), 4, 'every one is in the log');
  ev("UI.tick=true;for(let i=0;i<6;i++)toast('decide '+'abcdef'[i],'bad',[{l:'Open',act:'popGo',args:{city:'fra'}}]);UI.tick=false");
  assert.ok(ev("$('toasts').querySelectorAll('.toast').length") <= 2, 'two on screen at most');
  // What the player does still answers at once.
  ev("$('toasts').innerHTML='';toast('done','good')");
  assert.match(ev("$('toasts').textContent"), /done/);
  // A classic game is as it was.
  const c = load({ seed: 7 });
  t.after(() => c.dom.window.close());
  c.ev("ACT.start({});$('toasts').innerHTML='';UI.tick=true;toast('chatter','');UI.tick=false");
  assert.match(c.ev("$('toasts').textContent"), /chatter/);
  assert.deepEqual(errors, []);
  assert.deepEqual(c.errors, []);
  void dom;
});

test('saves: the director round-trips, junk is repaired, a classic save has none', (t) => {
  const { ev, errors } = cloud(t);
  ev("S.hs.dir={b:'lots',t:-5,q:'x',c:{k:'prot',d:3,r:'fra'},i:{rv:4,nope:2,law:'7'},w:{c:'par',d:9,k:'heat',ok:1},h:[['war',5],'junk',[3,4]]}");
  const back = J(ev, '(()=>{const r=parseSave(JSON.stringify(S));return migrate(r.s).hs.dir})()');
  assert.deepEqual(back, { b: 0, t: 0, q: 0, c: { k: 'prot', d: 3, r: 'fra' }, i: { rv: 4, law: 7 }, w: { c: 'par', d: 9, k: 'heat', ok: 1 }, h: [['war', 5]] });
  ev("S.hs.dir.w={c:'lon',d:1,k:'cut'}");
  assert.equal(J(ev, '(()=>{const r=parseSave(JSON.stringify(S));return migrate(r.s).hs.dir.w})()'), null, 'a warning for a region you do not have');
  const c = load({ seed: 7 });
  t.after(() => c.dom.window.close());
  c.ev("ACT.start({})");
  assert.equal(c.ev('(()=>{const r=parseSave(JSON.stringify(S));return migrate(r.s).hs===undefined})()'), true);
  assert.deepEqual(errors, []);
});
