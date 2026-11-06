// A day that changes the network mid-way (an outage, an event, the intern's shift) routes again. In play that goes to the
// route worker too, so a big network does not stop for it. jsdom has no Worker: a stand-in hands each post to rwServe() on
// the page, cloned as postMessage clones it, and answers the way the worker does.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const WORKER = `window.__q=[];window.__pg=0;{const c=compute;compute=function(){__pg++;return c();};}
  rwStart=()=>({postMessage:m=>__q.push(structuredClone(m))});
  window.__serve=()=>{const m=__q.shift(),S0=S,R0=R,g=RW.gen,pg=__pg,pm=window.postMessage;let got=null;window.postMessage=x=>{got=x;};
    rwServe(m);S=S0;R=R0;RW.gen=g;__pg=pg;window.postMessage=pm;rwDone(structuredClone(got));};
  window.__day=()=>{let n=0;rwDay();while(RW.job){__serve();n++;}return n;};`;
// The whole game and the next random number: the log and the camera carry clock time and the view.
const SIG = "JSON.stringify({S:{...S,log:0,cam:0,uiSpeed:0},served:R.served,load:R.load,next:Math.random()})";
const open = (t, setup) => { const h = load({ seed: 777 }); t.after(() => h.dom.window.close());
  h.dom.window.structuredClone = globalThis.structuredClone;
  h.ev('Date.now=()=>1e12'); h.ev(setup); h.ev('__reseed(4242)'); return h; };   // ids carry the time
const big = `S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();autoPause=()=>false;S.cash=1e13;ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal();compute();`;
// Every shift changes what the network carries, so every shift has to route again.
const busy = "S.nextFail=S.nextEvent=1e9;for(const k in S.ops.on)S.ops.on[k]=false;S.ops.on.optics=true;OPS_RUN.optics=X=>{for(const c in S.pops){const p=S.pops[c];if(p.bb){p.bb.d*=1.01;break;}}X.did('optics','x');};";

test('a shift that changes the network routes in the worker, with the same day as routing on the page', (t) => {
  const a = open(t, big + busy), b = open(t, big + busy + WORKER);
  a.ev('for(let i=0;i<3;i++)dayTick()');
  const trips = b.ev('[__day(),__day(),__day()]');
  assert.deepEqual([...trips], [2, 2, 2], 'the day, then the shift');
  assert.equal(b.ev('__pg'), 0, 'nothing routed on the page');
  assert.equal(b.ev(SIG), a.ev(SIG));
  assert.deepEqual([...a.errors, ...b.errors], []);
});

test('a shift with nothing to do makes no second trip', (t) => {
  const b = open(t, big + "S.nextFail=S.nextEvent=1e9;for(const k in S.ops.on)S.ops.on[k]=false;" + WORKER);
  assert.equal(b.ev('__day()'), 1);
  assert.equal(b.ev('__pg'), 0);
  assert.deepEqual(b.errors, []);
});

test('outages and events go through the worker too, and the day still comes out the same', (t) => {
  const stage = busy + 'S.nextFail=S.nextEvent=S.day+1;';
  const a = open(t, big + stage), b = open(t, big + stage + WORKER);
  a.ev('dayTick()');
  assert.equal(b.ev('__day()'), 3, 'the day, the outage and event, the shift');
  assert.equal(b.ev(SIG), a.ev(SIG));
  assert.deepEqual([...a.errors, ...b.errors], []);
});

test('the day is not over, and not saved, until its last trip is back', (t) => {
  const b = open(t, big + busy + WORKER);
  b.ev('UI.panelsDue=false;rwDay();__serve()');
  assert.ok(b.ev('!!RW.job'), 'the shift is being routed');
  assert.equal(b.ev('UI.panelsDue'), false, 'the panels wait for the end of the day');
  assert.equal(b.ev('UI.panelsDue=false;save();UI.saveDue'), true, 'half a day is not saved');
  b.ev('__serve()');
  assert.ok(b.ev('!RW.job'));
  assert.equal(b.ev('UI.panelsDue'), true, 'the panels catch up');
  assert.equal(b.ev('UI.saveDue'), false, 'and the save waits no longer');
  assert.deepEqual(b.errors, []);
});

test('a worker that dies mid-day: the day is finished on the page', (t) => {
  const a = open(t, big + busy), b = open(t, big + busy + WORKER);
  a.ev('dayTick()');
  // The end of a day changes little a signature sees here, so it is counted as well.
  b.ev('window.__end=0;checkGoals=(f=>()=>{__end++;f();})(checkGoals);rwDay();__serve();rwKill()');
  assert.ok(b.ev('!RW.job'));
  assert.equal(b.ev('__end'), 1, 'the rest of the day ran');
  assert.equal(b.ev('UI.panelsDue'), true);
  assert.equal(b.ev(SIG), a.ev(SIG));
  // And later days route on the page, whatever the first half of the day asks for.
  b.ev('RW.dead=true;__q.length=0;rwDay()');
  assert.equal(b.ev('__q.length'), 0);
  assert.ok(b.ev('!RW.job'));
  assert.deepEqual([...a.errors, ...b.errors], []);
});

test('quiet notifications hold in play: the whole day, on either side of the worker', (t) => {
  const b = open(t, big + busy + WORKER + "PREFS={quiet:true};dayPre=(f=>()=>{toast('Before routing','good');return f();})(dayPre);dayPost=(f=>(d,r)=>{toast('After routing','good');f(d,r);})(dayPost);OPS_RUN.optics=(f=>X=>{f(X);X.did('optics','x');})(OPS_RUN.optics);checkGoals=(f=>()=>{toast('After the shift','good');f();})(checkGoals);");
  // Every toast that pops up, also those a later one pushes out of the three on show.
  b.ev("{const box=document.getElementById('toasts'),p=box.prepend.bind(box);window.__pop='';box.prepend=el=>{__pop+=el.textContent+' ';p(el);};}__day();");
  assert.doesNotMatch(b.ev('__pop'), /routing|shift/, 'nothing routine pops up');
  for (const s of ['Before routing', 'After routing', 'After the shift'])
    assert.equal(b.ev(`S.log.some(e=>/${s}/.test(JSON.stringify(e)))`), true, `the NOC log has "${s}"`);
  assert.equal(b.ev('UI.tick'), false, 'and a click right after the day is a click');
  assert.deepEqual(b.errors, []);
});

test('afraid of sharks: the answer is what a walk over the land fiber says, cached or not, and the check is cheap', (t) => {
  const b = open(t, big);
  const plain = "(a,b)=>{const ad={};for(const l of S.links)if(!linkDown(l)&&!l.sub){(ad[l.a]=ad[l.a]||[]).push(l.b);(ad[l.b]=ad[l.b]||[]).push(l.a);}const s=new Set([a]),q=[a];while(q.length){const u=q.shift();if(u===b)return true;for(const v of ad[u]||[])if(!s.has(v)){s.add(v);q.push(v);}}return false;}";
  const same = () => b.ev(`(()=>{const p=${plain},c=CITIES.map(x=>x.id).filter((_,i)=>i%9===0);let bad=0,yes=0,no=0;for(const x of c)for(const y of c){const w=p(x,y);if(w)yes++;else no++;if(terrestrialPath(x,y)!==w)bad++;TERR={};if(terrestrialPath(x,y)!==w)bad++;TERR=null;}return JSON.stringify({bad,yes:yes>0,no:no>0});})()`);
  assert.deepEqual(JSON.parse(same()), { bad: 0, yes: true, no: true });
  // Cut every land link out of the busiest city: outside a customer pass, the answer follows at once.
  b.ev("{const c=S.links.find(l=>!l.sub&&!linkDown(l)).a;window.__a=c;window.__o=S.links.find(l=>!l.sub&&!linkDown(l)&&(l.a===c||l.b===c));window.__o=__o.a===c?__o.b:__o.a;}");
  assert.equal(b.ev('terrestrialPath(__a,__o)'), true);
  b.ev("for(const l of S.links)if(!l.sub&&(l.a===__a||l.b===__a))l.cut=S.day+9;");
  assert.equal(b.ev('terrestrialPath(__a,__o)'), false);
  assert.deepEqual(JSON.parse(same()).bad, 0);
  // A day with many such customers scans the land fiber once for them all, and leaves nothing cached behind.
  const n = b.ev(`S.nextFail=S.nextEvent=1e9;for(const k in S.ops.on)S.ops.on[k]=false;let k=0;for(const x of S.biz)if(x.city2&&k<40){x.reqs=['sharks'];k++;}
    window.__g=0;terrGroups=(f=>()=>{__g++;return f();})(terrGroups);dayTick();__g`);
  assert.equal(n, 1);
  assert.equal(b.ev('TERR'), null);
  assert.deepEqual(b.errors, []);
});
