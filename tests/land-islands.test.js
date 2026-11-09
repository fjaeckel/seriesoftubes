// "Afraid of sharks" (a path that never goes under the sea, 60-requirements.js) asked for every customer in the daily
// mood check: the land islands are worked out once for the check (TERR), and two cities have a land path exactly when
// they are on one island. Same answers as walking the links each time, with links cut, subsea or not, and cities alone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

test('land islands answer "a path without subsea" as walking the links does', () => {
  const { ev, errors } = load({ seed: 3 });
  ev(`S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;closeModal();compute();`);
  const cmp = () => JSON.parse(ev(`(()=>{const cs=Object.keys(S.pops).concat(['sin','nyc','lon',null,undefined]);let n=0,yes=0;const bad=[];
    for(const a of cs.slice(0,60))for(const b of cs){if(!a)continue;TERR=null;const w=terrestrialPath(a,b);TERR={S,gen:RW.gen,m:null};const i=terrestrialPath(a,b);TERR=null;
      n++;if(w)yes++;if(w!==i)bad.push(a+'-'+b);}return JSON.stringify({n,yes,bad:bad.slice(0,5)});})()`));
  let r = cmp();
  assert.deepEqual(r.bad, []);
  assert.ok(r.yes > 20 && r.yes < r.n, `pairs with a land path: ${r.yes} of ${r.n}`);
  // Cut a third of the land links (an island splits) and the answers still agree.
  ev("S.links.forEach((l,i)=>{if(!l.sub&&i%3===0)l.cut=S.day+5;})");
  const r2 = cmp();
  assert.deepEqual(r2.bad, []);
  assert.ok(r2.yes < r.yes, `fewer land paths once links are cut: ${r2.yes} < ${r.yes}`);
  // Kept for the day, the islands follow an action that routes (RW.gen), and are never used for another game.
  ev("TERR={S,gen:RW.gen,m:null};terrestrialPath('fra','ams');window.__m=TERR.m;S.links.forEach(l=>{if(!l.sub)l.cut=0;});compute();");
  assert.equal(ev("terrestrialPath('fra','ams')===(()=>{const t=TERR;TERR=null;const w=terrestrialPath('fra','ams');TERR=t;return w;})()&&TERR.m!==__m"), true, 'made again after routing');
  ev("const S0=S;S={...S,links:[]};window.__r=terrestrialPath('fra','ams');S=S0;TERR=null;");
  assert.equal(ev('__r'), false, 'another game walks its own links');
  // The daily check leaves no islands behind (a later question walks the links of the moment).
  ev('S.nextFail=S.nextEvent=S.day+99;dayTick()');
  assert.equal(ev('TERR'), null);
  assert.deepEqual(errors, []);
});
