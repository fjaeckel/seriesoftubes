// #453: the Hyperscaler's hauls ("Your backbone to <city>") follow Auto-TE and its RouteScript spill rules like other
// traffic, instead of filling the shortest path to the brim while a parallel path sits empty.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
/* As in hyper-traffic.test.js: regions in Frankfurt and Paris, French users enter in Paris, which has room for 400 of
   them, so 100 ride the backbone from Frankfurt. The direct 100G wave `fp`, the way round through Amsterdam 800G each.
   No bulk classes: only the haul is on the backbone. */
function net(t) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});HS_ZC.s=S;for(const k of ['DE','FR','NL','GB','US','BE'])if(ccInfo(k))HS_ZC.m.set(k,[[ccInfo(k).main,1]]);S.cash=1e12;S.lvl=2;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});ACT.buildPop({city:'ams'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;ACT.buyTransit({city:S.home,net:'cog',tier:3});ACT.buyTransit({city:'par',net:'cog',tier:3});" +
    "S.hs.rg.par={t:0,ready:0,mw:5};S.hs.cc.DE={d:300,since:0};S.hs.cc.FR={d:500,since:0};S.links=[];CX_BULK.length=0;" +
    wave('fp', 'fra', 'par', 1) + wave('fa', 'fra', 'ams', 3) + wave('ap', 'ams', 'par', 3) + 'compute()');
  return h;
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const haulOn = (ev, id) => ev(`(()=>{const f=R.ef[edgeKey(S.links.find(l=>l.id===${lit(id)}))];if(!f)return 0;let s=0;for(const k in f.eg)if(k.startsWith('cx:'))s+=f.eg[k];return s;})()`);

test('#453 a haul fills the shortest path to the brim without Auto-TE', (t) => {
  const { ev, errors } = net(t);
  assert.ok(near(ev('R.hs.cc.FR.want'), 100) && near(ev('R.hs.cc.FR.got'), 100), 'the haul arrives');
  assert.ok(near(ev('R.load.fp'), 100), 'all of it on the direct wave: ' + ev('R.load.fp'));
  assert.ok(near(ev('R.load.fa||0'), 0));
  assert.deepEqual(errors, []);
});

test('#453 with Auto-TE and spill rules, the haul spills to the way round and the direct wave is not congested', (t) => {
  const { ev, errors } = net(t);
  ev("S.core.run=Math.max(S.core.run,2);S.te={on:true,l2:false,day:0,script:'spill at 80% within 10 ms\\nspill at 85% within 20 ms\\nspill at 90%'};compute()");
  assert.ok(ev('!!teRules()'), 'the script parses');
  assert.ok(near(ev('R.hs.cc.FR.got'), 100), 'every bit of the haul still arrives: ' + ev('R.hs.cc.FR.got'));
  const fp = ev('R.load.fp'), fa = ev('R.load.fa||0'), ap = ev('R.load.ap||0');
  assert.ok(fp <= 90 + 1e-6, 'the direct wave stays under the last spill mark: ' + fp);
  assert.ok(fa >= 10 - 1e-6 && near(fa, ap), 'the rest goes round through Amsterdam: ' + fa + ' / ' + ap);
  assert.ok(near(fp + fa, 100), 'nothing doubled: ' + (fp + fa));
  assert.ok(ev('R.teMoved') > 0, 'counted as moved by TE');
  // What crosses each link is still told as the haul, by its own label.
  assert.ok(near(haulOn(ev, 'fp'), fp) && near(haulOn(ev, 'fa'), fa), 'the haul is what the links carry');
  assert.match(ev("R.egDesc['cx:par'].lab"), /par|Paris/i);
  // The same answer twice: no hysteresis to flap on.
  const once = ev('JSON.stringify(R.load)');
  ev('compute()');
  assert.equal(ev('JSON.stringify(R.load)'), once);
  // Auto-TE off: back to the shortest path.
  ev('S.te.on=false;compute()');
  assert.ok(near(ev('R.load.fp'), 100));
  assert.deepEqual(errors, []);
});
