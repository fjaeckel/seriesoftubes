// A fiber's capacity added up per run of identical optics, "is this fiber lit?" answered without adding it up
// (dfOn(), linkDown()), and latency searches over one list of each city's links (latGraph(), latRun(), latPairs():
// bestLat(), the boutique's routes, latency offers). Same answers as before: the old ways are written out here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
// The fixture's links as the player's own dark fiber (it has none), lit with 2 to 40 channels of one or two optics.
const GLASS = "S.links.forEach((l,i)=>{l.kind='df';l.own=true;l.sys='roadm';l.ready=0;l.regen=3;const o=['zr4','zr8','tp16','tp32'][i%4];l.ch=Array.from({length:2+i%39},(_,j)=>i%5===0&&j%3===0?'zr4':o);delete l.tier;})";
// Before: every channel's optG() added up, and the search that walked every link for every city it reached.
const OLD = `window.oldCap=l=>{if(l.ready>S.day||l.eqDown>S.day)return 0;const ch=l.ch||[];let g=0;for(const c of ch)g+=optG(c,l);const f=l.chFail&&l.chFail.until>S.day?l.chFail:null;if(f){const fo=f.o&&ch.includes(f.o)?f.o:ch.slice().sort((a,b)=>optG(a,l)-optG(b,l))[0];if(fo)g-=optG(fo,l);}return Math.max(0,Math.max(0,g)-mwG(l));};
window.oldLat=(a,b,f)=>{const ls=S.links.filter(l=>!linkDown(l)&&(!f||f(l)));const dist={[a]:0},done=new Set();for(;;){let u=null,ud=Infinity;for(const k in dist)if(!done.has(k)&&dist[k]<ud){u=k;ud=dist[k];}if(u===null)break;if(u===b)return ud;done.add(u);for(const l of ls){if(l.a!==u&&l.b!==u)continue;const v=l.a===u?l.b:l.a,nd=ud+linkLat(l)+0.05;if(nd<(dist[v]??Infinity))dist[v]=nd;}}return Infinity;};`;
// Seeded trouble on the fibers: cuts, a failed optic (named or not, over or not, maybe the only one), equipment down, still building,
// channels taken out or mixed, a subsea upgrade in service, managed waves sold on it (sometimes more than it carries).
const MESS = (v) => `(()=>{let x=${v * 7919 + 13};const rnd=()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648;};const D=S.day;
  for(const l of S.links){const r=rnd();if(r<.06)l.cut=D+5;else if(r<.14){if(rnd()<.4)l.ch=l.ch.slice(0,1);l.chFail={o:rnd()<.5&&l.ch.length?l.ch[l.ch.length-1]:rnd()<.5?'tp32':null,until:rnd()<.8?D+3:D-1};}
    else if(r<.18)l.eqDown=D+2;else if(r<.22)l.ready=D+4;else if(r<.28)l.ch=l.ch.slice(0,Math.floor(rnd()*3));else if(r<.32)l.ch=l.ch.map((c,i)=>i%2?c:'zr8');
    else if(r<.36){l.sub=true;l.km=2000+Math.floor(rnd()*9000);if(rnd()<.5)l.subterminal=D-1;if(rnd()<.5)l.subengineering=D-1;}
    if(rnd()<.15)S.biz.push({type:'mwave',link:l.id,slots:1+Math.floor(rnd()*30),g:rnd()<.5?100:400});}})()`;

test('a fiber is lit, and carries, what adding up every channel said', () => {
  const { ev, errors } = load({ seed: 3 });
  ev(`S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;closeModal();${GLASS};${OLD}`);
  let lit0 = 0, dark = 0;
  for (let v = 0; v < 6; v++) {
    ev(`S=migrate(JSON.parse(${lit(BIG)}));${GLASS};${MESS(v)};S.day+=${v}`);
    const r = JSON.parse(ev(`JSON.stringify(S.links.map(l=>[oldCap(l),dfCap(l),dfOn(l),linkDown(l),l.cut>S.day]))`));
    for (const [want, cap, on, down, cut] of r) {
      assert.equal(cap, want);
      assert.equal(on, want > 0);
      assert.equal(down, cut || !(want > 0));
      if (on) lit0++; else dark++;
    }
  }
  assert.ok(lit0 > 600 && dark > 30, `lit ${lit0}, dark ${dark}`);
  assert.deepEqual(errors, []);
});

test('latency searches give what walking every link gave: bestLat, every pair at once, the boutique\'s routes', () => {
  const { ev, errors } = load({ seed: 3 });
  ev(`S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;closeModal();${OLD}`);
  const P = "Object.keys(S.pops).slice(0,25).concat(FIN.filter(c=>S.pops[c]))";
  const check = (f) => JSON.parse(ev(`(()=>{const P=${P},f=${f},bad=[];let n=0;
      for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){const w=oldLat(P[i],P[j],f);if(bestLat(P[i],P[j],f)!==w)bad.push(P[i]+'-'+P[j]);if(isFinite(w))n++;}
      for(const [a,b,ms] of latPairs(P,f))if(ms!==oldLat(a,b,f))bad.push('pairs '+a+'-'+b);return JSON.stringify({n,bad:bad.slice(0,5)});})()`));
  // Leased waves, then some cut, then the player's own glass in trouble.
  let r = check('null');
  assert.deepEqual(r.bad, []);
  assert.ok(r.n > 150, `pairs with a path: ${r.n}`);
  ev("S.links.forEach((l,i)=>{if(i%4===0)l.cut=S.day+3;})");
  r = check("l=>l.kind!=='vxc'");
  assert.deepEqual(r.bad, []);
  ev(`S=migrate(JSON.parse(${lit(BIG)}));${GLASS};${MESS(2)};S.mode='normal';delete S.scn;S.charter='boutique'`);
  r = check('ownGlass');
  assert.deepEqual(r.bad, []);
  assert.ok(r.n > 50, `pairs over own glass: ${r.n}`);
  // The boutique's routes: each financial pair, its own glass against the best leased latency. In trouble, then not.
  const SOL = `(()=>{const f=FIN.filter(c=>S.pops[c]),v=[];for(let i=0;i<f.length;i++)for(let j=i+1;j<f.length;j++){const a=f[i],b=f[j],o=oldLat(a,b,ownGlass),l=leasedLat(a,b);if(isFinite(o)&&isFinite(l)&&o<l)v.push({a,b,o,l});}return JSON.stringify(v);})()`;
  assert.equal(ev('SOLC=null;JSON.stringify(solRoutes())'), ev(SOL));
  ev(`S=migrate(JSON.parse(${lit(BIG)}));${GLASS};S.mode='normal';delete S.scn;S.charter='boutique'`);
  const want = ev(SOL);
  assert.equal(ev('SOLC=null;JSON.stringify(solRoutes())'), want);
  assert.ok(JSON.parse(want).length >= 1, `routes that beat leased: ${want}`);
  assert.deepEqual(errors, []);
});
