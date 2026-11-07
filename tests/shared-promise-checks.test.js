// Diverse paths, a land path and a latency budget asked for many pairs on one network: the offers spotted for
// sovereign clouds (spots0()) and the intern's check before taking a wave out (opsDecomSafe()) build one graph per
// network and ask it for every pair (divGraph()/divOn(), promiseCheck()). Same answers as before: the old ways are
// written out here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
// Before: each question filtered the links again and built both searches' graphs from lists.
const OLD = `window.oldDiv=(a,b)=>{const rem=remoteCities(),ok=c=>popUp(c)||rem.includes(c),live=S.links.filter(l=>!linkDown(l)&&ok(l.a)&&ok(l.b));
  const srlg=l=>l.kind==='vxc'?'fab:'+l.prov:(l.trench||l.id);
  const bfs=ls=>{const adj={};for(const l of ls){(adj[l.a]=adj[l.a]||[]).push([l.b,l]);(adj[l.b]=adj[l.b]||[]).push([l.a,l]);}
    const prev={[a]:null},q=[a];while(q.length){const u=q.shift();if(u===b)break;for(const [v,l] of adj[u]||[])if(!(v in prev)){prev[v]=l;q.push(v);}}
    if(!(b in prev))return null;const path=[];let v=b;while(v!==a){const l=prev[v];path.push(l);v=l.a===v?l.b:l.a;}return path;};
  const p1=bfs(live);if(!p1)return false;const used=new Set(p1.map(srlg));return !!bfs(live.filter(l=>!used.has(srlg(l))));};
window.oldLand=(a,b)=>{const adj={};for(const l of S.links.filter(l=>!l.sub&&!linkDown(l))){(adj[l.a]=adj[l.a]||[]).push(l.b);(adj[l.b]=adj[l.b]||[]).push(l.a);}
  const seen=new Set([a]),q=[a];while(q.length){const u=q.shift();if(u===b)return true;for(const v of adj[u]||[])if(!seen.has(v)){seen.add(v);q.push(v);}}return false;};
window.oldLat=(a,b)=>{const ls=S.links.filter(l=>!linkDown(l));const dist={[a]:0},done=new Set();for(;;){let u=null,ud=Infinity;for(const k in dist)if(!done.has(k)&&dist[k]<ud){u=k;ud=dist[k];}
  if(u===null)break;if(u===b)return ud;done.add(u);for(const l of ls){if(l.a!==u&&l.b!==u)continue;const v=l.a===u?l.b:l.a,nd=ud+linkLat(l)+0.05;if(nd<(dist[v]??Infinity))dist[v]=nd;}}return Infinity;};
window.oldSafe=l=>{const bz=S.biz.filter(b=>(b.reqs||[]).some(k=>k==='diverse'||k==='sharks'||k==='lat')&&b.city2);if(!bz.length)return true;
  const chk=b=>(b.reqs||[]).every(k=>k==='diverse'?oldDiv(b.city,b.city2):k==='sharks'?oldLand(b.city,b.city2):k==='lat'?oldLat(b.city,b.city2)<=b.latMax:true);
  const was=bz.filter(chk),all=S.links;S.links=all.filter(x=>x!==l);try{return was.every(chk);}finally{S.links=all;}};`;
// Seeded trouble: cuts, POPs down, trenches shared by several links, a VXC to a city with no POP.
const MESS = (v) => `(()=>{let x=${v * 7919 + 13};const rnd=()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648;};const D=S.day;
  for(const l of S.links)if(rnd()<.1)l.cut=D+3;for(const c in S.pops)if(rnd()<.06)S.pops[c].down=D+2;
  const ls=S.links.filter(l=>!l.sub);for(let i=${v};i<ls.length;i+=6)ls[i].trench='shared'+(i%3);
  const p=FABS.find(f=>f.cities.some(c=>S.pops[c])&&f.cities.some(c=>!S.pops[c]));if(p&&${v}%2){const a=p.cities.find(c=>S.pops[c]),b=p.cities.find(c=>!S.pops[c]);
    S.links.push({id:'vx'+${v},a,b,kind:'vxc',prov:p.id,vt:'1g',km:kmBetween(a,b),sub:isSub(a,b),mo:1,cut:0,day:0});}})()`;

test('diverse paths: one graph for every pair answers like a search per pair, and spots the same sovereign clouds', () => {
  const { ev, errors } = load({ seed: 3 });
  ev(`S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;closeModal();${OLD}`);
  let yes = 0, no = 0;
  for (let v = 0; v < 6; v++) {
    ev(`S=migrate(JSON.parse(${lit(BIG)}));${v ? MESS(v) : ''}`);
    const r = JSON.parse(ev(`(()=>{const C=Object.keys(S.pops).filter((c,i)=>i%3===0).concat(S.links.filter(l=>l.kind==='vxc').map(l=>l.b),['nowhere']),g=divGraph(),bad=[];let y=0,n=0;
      for(const a of C)for(const b of C){const w=oldDiv(a,b);if(diversePaths(a,b)!==w||divOn(g,a,b)!==w)bad.push(a+'-'+b);w?y++:n++;}
      const by={};for(const c of Object.keys(S.pops).filter(bizCity))(by[CITY[c].cc]=by[CITY[c].cc]||[]).push(c);const sov=[];
      for(const cs of Object.values(by))for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++)if(oldDiv(cs[i],cs[j]))sov.push(cs[i]+'-'+cs[j]);
      const got=spots0(0).filter(s=>s.t==='sov').map(s=>s.a+'-'+s.b);return JSON.stringify({y,n,bad:bad.slice(0,5),sov,got});})()`));
    assert.deepEqual(r.bad, [], `state ${v}`);
    assert.deepEqual(r.got, r.sov, `sovereign clouds, state ${v}`);
    yes += r.y; no += r.n;
  }
  assert.ok(yes > 300 && no > 1000, `diverse ${yes}, not ${no}`);
  assert.deepEqual(errors, []);
});

test('taking a wave out: the shared check refuses what asking customer by customer refused, for each promise', () => {
  const { ev, errors } = load({ seed: 3 });
  ev(`S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;closeModal();${OLD}`);
  // Customers between linked POPs: diverse paths, afraid of sharks, a latency budget just above today's best.
  const BIZ = `(()=>{const ls=S.links.filter(l=>S.pops[l.a]&&S.pops[l.b]);let n=0;for(let i=0;i<ls.length;i+=2){const l=ls[i],k=['diverse','sharks','lat'][n%3],b={id:'pc'+n++,city:l.a,city2:l.b,type:'l2',bw:1,reqs:[k]};
    if(k==='lat')b.latMax=+(bestLat(l.a,l.b)+0.02).toFixed(2);if(k!=='lat'||isFinite(b.latMax))S.biz.push(b);}})()`;
  const refused = { diverse: 0, sharks: 0, lat: 0 };
  for (let v = 0; v < 4; v++) {
    ev(`S=migrate(JSON.parse(${lit(BIG)}));${v ? MESS(v) : ''};${BIZ}`);
    // From a few hubs to every POP: several customers of one city, some served and some not.
    const hub = JSON.parse(ev(`(()=>{const P=Object.keys(S.pops),H=P.filter((c,i)=>i%25===0);let n=0;for(const a of H)for(const b of P)if(a!==b)for(const k of ['diverse','sharks','lat']){const o={id:'hb'+n++,city:a,city2:b,type:'l2',bw:1,reqs:[k]};
        if(k==='lat')o.latMax=n%2?oldLat(a,b):oldLat(a,b)*0.995;S.biz.push(o);}
      const chk=b=>(b.reqs||[]).every(k=>k==='diverse'?oldDiv(b.city,b.city2):k==='sharks'?oldLand(b.city,b.city2):k==='lat'?oldLat(b.city,b.city2)<=b.latMax:true);
      const pc=promiseCheck(),bz=S.biz.filter(b=>/^hb/.test(b.id)),w=bz.map(chk);S.biz=S.biz.filter(b=>!/^hb/.test(b.id));
      return JSON.stringify({bad:bz.filter((b,i)=>pc(b)!==w[i]).map(b=>b.id).slice(0,5),yes:w.filter(Boolean).length,n:w.length});})()`));
    assert.deepEqual(hub.bad, [], `hubs, state ${v}`);
    assert.ok(hub.yes > 50 && hub.n - hub.yes > 50, JSON.stringify(hub));
    const r = JSON.parse(ev(`(()=>{const bad=[],why=[],all=S.biz;for(const l of S.links.slice(0,60)){const w=oldSafe(l);if(opsDecomSafe(l)!==w)bad.push(l.id);
        if(!w)for(const k of ['diverse','sharks','lat']){S.biz=all.filter(b=>/^pc/.test(b.id)&&b.reqs[0]===k);if(!oldSafe(l))why.push(k);S.biz=all;}}
      return JSON.stringify({bad,why});})()`));
    assert.deepEqual(r.bad, [], `state ${v}`);
    for (const k of r.why) refused[k]++;
  }
  for (const k in refused) assert.ok(refused[k] >= 2, `refused for ${k}: ${JSON.stringify(refused)}`);
  assert.deepEqual(errors, []);
});

test('latency searches at the edges: a city with no link, the same city twice, a city nobody reaches', () => {
  const { ev, errors } = load({ seed: 3 });
  ev(`S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;closeModal();`);
  const r = JSON.parse(ev(`(()=>{const lone=CITIES.find(c=>!S.links.some(l=>l.a===c.id||l.b===c.id)).id,p=S.links[0].a,g=latGraph(),d=latRun(g,p);
    return JSON.stringify([bestLat(lone,lone),bestLat(p,p),bestLat(lone,p),bestLat(p,lone),latRun(g,lone),latAt(g,d,p,p),latAt(g,d,p,lone),latAt(g,null,lone,p),
      latPairs([lone,p,lone]).map(x=>x[2])]);})()`));
  assert.deepEqual(r, [0, 0, null, null, null, 0, null, null, [null, 0, null]]);
  assert.deepEqual(errors, []);
});
