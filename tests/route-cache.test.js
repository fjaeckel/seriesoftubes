// What compute() keeps between calls (src/game/80-simulation/29-route-cache.js): the shortest paths and the exit lists,
// rebuilt only when their key changes. These tests make sure every kind of change that can matter changes the key (a
// stale table would route yesterday's network), that demand alone does not (or nothing is gained), and that routing
// with the kept tables is exactly routing without them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

function open() {
  const h = load({ seed: 777 });
  h.ev(`S=migrate(JSON.parse(${lit(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();S.nextFail=S.day+999;S.nextEvent=S.day+999;compute();compute();`);
  return h;
}

// Applies a change, routes once with the kept tables and once without (from the same yesterday), and says which keys moved.
function step(ev, change) {
  ev(change);
  return JSON.parse(ev(`(()=>{const gk=RC.gk,xk=RC.xk,prior=R;compute();const a=JSON.stringify(R)+JSON.stringify(R.fl);
    const g=RC.gk!==gk,x=RC.xk!==xk;R=prior;RC.on=false;try{compute();}finally{RC.on=true;}const b=JSON.stringify(R)+JSON.stringify(R.fl);
    return JSON.stringify({g,x,same:a===b,len:a.length});})()`));
}

test('a change to links, POPs, ports, peering, events or RouteScript rebuilds what routing keeps; demand alone does not', () => {
  const { ev, errors } = open();
  assert.ok(ev('RC.gk!==null&&RC.xk!==null'), 'routing keeps its tables after a compute');
  // [what changes, the graph key moves, the exits key moves]
  const changes = [
    // Demand and capacity only: nothing structural, the kept tables are used.
    ['for(const c in S.pops)if(S.pops[c].bb)S.pops[c].bb.d*=1.07', false, false],
    ['S.biz.forEach(b=>b.bw*=1.1)', false, false],
    ["S.links.find(l=>l.kind==='wave').tier=1", false, false],
    ['S.transit[0].tier=Math.max(0,S.transit[0].tier-1)', false, false],
    ['S.day++', false, false],
    // The graph: a cut, a link gone, a link back, a metric, a POP down and up again, RouteScript's avoid.
    ['S.links[3].cut=S.day+3', true, true],
    ['S.links[3].cut=0', true, true],
    ['window.__l=S.links.splice(7,1)[0]', true, true],
    ['S.links.push(__l)', true, true],
    ["S.pairMet=S.pairMet||{};{const l=S.links[10];S.pairMet[l.a<l.b?l.a+'|'+l.b:l.b+'|'+l.a]='avoid';}", true, true],
    ['S.pops.sea.down=S.day+3', true, true],
    ['S.pops.sea.down=0', true, true],
    // The exits: transit ports, PNIs, caches, exchanges, sessions.
    ["S.transit[2].pref='low'", false, true],
    ["S.transit[2].pref='high'", false, true],
    ['S.transit[5].carry=true', false, true],
    ['S.transit[4].down=S.day+3', false, true],
    ['S.transit.splice(1,1)', false, true],
    ["S.pni[0].pref='high'", false, true],
    ['S.pni.splice(10,25)', false, true],
    ['S.caches.splice(0,30)', false, true],
    ["S.ixPref={};S.ixPref[Object.keys(S.ixp)[1]]='low'", false, true],
    ['S.ev.ixdown={};S.ev.ixdown[Object.keys(S.ixp)[2]]=S.day+3', false, true],
    ['delete S.rs[Object.keys(S.rs)[0]]', false, true],
    ['delete S.ixp[Object.keys(S.ixp)[3]]', false, true],
    // Events that change who reaches whom, and RouteScript.
    ["S.ev.rpki={nets:['ggl','nfx'],until:S.day+3}", false, true],
    ['S.ev.depeer=S.day+3', false, true],
    ["S.ev.leak={net:'fbk',until:S.day+3}", false, true],
    ["S.te={on:true,day:0,script:'prefer transit '+NET[S.transit[0].net].name+'\\nspill at 80%'};S.core={lv:2,run:2,legacy:true}", false, true],
    ["S.te.script+='\\nprefer pni for goggle'", false, true],
    // avoid link: the edge's weight, so the graph key moves too.
    ["{const l=S.links.find(x=>!linkDown(x));S.te.script+='\\navoid link '+CITY[l.a].name.toLowerCase()+'-'+CITY[l.b].name.toLowerCase();}", true, true],
  ];
  for (const [change, g, x] of changes) {
    const r = step(ev, change);
    assert.ok(r.same, `${change}: routing with the kept tables is routing without them`);
    if (g !== null) assert.equal(r.g, g, `${change}: the graph key ${g ? 'moves' : 'stays'}`);
    assert.equal(r.x, x, `${change}: the exits key ${x ? 'moves' : 'stays'}`);
    assert.ok(r.len > 1e5, 'a big network was routed');
  }
  assert.deepEqual(errors, []);
});

test('days in a row reuse the kept tables and route like a fresh start every day', () => {
  const { ev, errors } = open();
  for (let d = 0; d < 4; d++) {
    ev('dayTick()');
    const r = step(ev, '');
    assert.ok(r.same, `day ${d}: the same routing with and without the kept tables`);
    assert.ok(!r.g && !r.x, `day ${d}: a day of demand only keeps the tables`);
  }
  assert.deepEqual(errors, []);
});
