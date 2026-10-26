const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A network on four continents: POPs, waves, transit, IX ports, PNIs, caches and customers.
function bigNet(ev) {
  ev("ACT.start({});S.cash=1e10;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("for(const c of ['ams','lon','par','nyc','ash','chi','sjc','tok','hkg','sin','syd','sao'])ACT.buildPop({city:c})");
  ev("for(const [a,b] of [['fra','ams'],['ams','lon'],['lon','par'],['par','fra'],['lon','nyc'],['nyc','ash'],['ash','chi'],['chi','sjc'],['sjc','syd'],['tok','hkg'],['hkg','sin'],['sin','syd'],['nyc','sao']]){UI.via=null;openLinkModal(a,b);ACT.buildLink({tier:1});closeModal();}");
  ev("for(const c in S.pops){S.pops[c].bb=S.pops[c].bb||{d:0};S.pops[c].bb.d=500;}");
  ev("for(const [c,n] of [['fra','cog'],['nyc','lvl'],['sin','cog'],['tok','lvl']])ACT.buyTransit({city:c,net:n,tier:1})");
  ev("for(const c of ['fra','ams','lon','nyc','sin','tok'])ACT.buyIx({city:c,tier:1,signed:true});for(const c in S.ixp)ACT.rs({city:c});compute()");
  ev("for(const n of ['ggl','nfx','fbk','amz','akm'])for(const c of ['fra','nyc','sin'])ACT.pni({city:c,net:n,tier:1});compute()");
  ev("for(const n of ['nfx','ggl'])for(const c of ['fra','nyc','sin','lon'])ACT.cache({city:c,net:n})");
  ev("for(let i=0;i<150;i++){S.offers=[];spawnOffer();for(const o of S.offers.slice())if(bHas(o))ACT.accept({id:o.id});}closeModal();compute()");
}

test('a preferred exit far away still wins over a normal one next door', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'})");
  ev("UI.via=null;openLinkModal('fra','ams');ACT.buildLink({tier:1});closeModal();ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyTransit({city:'ams',net:'tly',tier:1});compute()");
  assert.equal(ev('S.links.length'), 1);
  const use = () => JSON.parse(ev("JSON.stringify(S.transit.map(t=>R.useT[t.id]||0))"));
  assert.equal(use()[1], 0, 'normal: the local transit carries it all');
  ev("S.transit[1].pref='high';compute()");
  const [fra, ams] = use();
  assert.ok(ams > 0 && ams > fra, `preferred: Amsterdam's transit comes first (${fra} / ${ams})`);
  assert.deepEqual(errors, []);
});

test('what crosses each link adds up, and is put together when it is looked at', () => {
  const { ev, errors } = load();
  bigNet(ev);
  assert.ok(ev("Object.keys(R.ef).length") > 5, 'traffic on many links');
  // every push adds the same amount to one egress, one network and one source city
  const bad = ev(`Object.keys(R.ef).filter(k=>{const r=R.ef[k],s=o=>Object.values(o).reduce((a,b)=>a+b,0),n=s(r.net);
    const load=S.links.filter(l=>edgeKey(l)===k).reduce((a,l)=>a+(R.load[l.id]||0),0);
    return Math.abs(n-s(r.eg))>1e-6*(1+n)||Math.abs(n-s(r.dst))>1e-6*(1+n)||Math.abs(n-load)>1e-6*(1+n);}).join()`);
  assert.equal(bad, '', 'per network, per egress, per source city and the link load agree');
  assert.equal(ev("const k=Object.keys(R.ef)[0];R.ef[k]===R.ef[k]"), true, 'the same record every time');
  assert.equal(ev("JSON.parse(JSON.stringify(R)).ef[Object.keys(R.ef)[0]].net!==undefined"), true);
  // the link panel reads it
  ev("const k=Object.keys(R.ef)[0],l=S.links.find(x=>edgeKey(x)===k);selectLink(l.id)");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Content from/);
  assert.deepEqual(errors, []);
});

test('a big network routes every flow to an exit with room, and caches serve their own city', () => {
  const { ev, errors } = load();
  bigNet(ev);
  for (let d = 0; d < 20; d++) ev('dayTick()');
  assert.ok(ev('R.served>0&&R.served<=R.demand+1e-6'));
  assert.equal(ev(`[...S.transit.map(t=>[R.useT[t.id]||0,lagCap(PORT[t.tier].g,t.n)]),...S.pni.map(p=>[R.usePni[p.id]||0,lagCap(PORT[p.tier].g,p.n)]),...S.caches.map(c=>[R.useCache[c.id]||0,CACHE_CAP])].filter(([u,c])=>u>c+1e-6).length`), 0, 'no port over capacity');
  assert.equal(ev("Object.keys(S.pops).filter(c=>R.citySrv[c]>R.cityDem[c]+1e-6).length"), 0, 'no city served more than it asked for');
  assert.ok(ev('S.caches.length>0&&S.caches.every(c=>R.useCache[c.id]>0)'), 'every cache serves its own city');
  assert.deepEqual(errors, []);
});

test('panels are patched in place: the same HTML, and buttons that now do something else are new', () => {
  const { ev, errors } = load();
  bigNet(ev);
  ev("selectCity('fra');ACT.tab({t:'peer'})");
  const fresh = "(()=>{const d=document.createElement('div');d.innerHTML=UI._ph;return d.innerHTML;})()";
  const same = () => ev(`(()=>{const a=[...document.getElementById('panelBody').querySelectorAll('*')],d=document.createElement('div');d.innerHTML=UI._ph;const b=[...d.querySelectorAll('*')];
    return a.length===b.length&&a.every((x,i)=>x.nodeName===b[i].nodeName&&x.attributes.length===b[i].attributes.length&&[...b[i].attributes].every(t=>x.getAttribute(t.name)===t.value)&&(x.children.length||x.textContent===b[i].textContent));})()`);
  assert.equal(same(), true);
  ev("window.__tab=document.querySelector('#panelBody [data-act=\"tab\"]')");
  for (let d = 0; d < 3; d++) ev('dayTick();renderPanel()');
  assert.equal(same(), true, 'patched panel matches a fresh render');
  assert.equal(ev("window.__tab===document.querySelector('#panelBody [data-act=\"tab\"]')"), true, 'an unchanged button stays the same button');
  // another city: its buttons act on that city, so a tap that started on the old ones cannot fire them (#44)
  ev("window.__btn=[...document.querySelectorAll('#panelBody [data-act]')].find(b=>(b.dataset.args||'').includes('\"fra\"'))");
  ev("selectCity('nyc');ACT.tab({t:'peer'})");
  assert.equal(same(), true);
  assert.equal(ev("document.getElementById('panelBody').contains(window.__btn)"), false);
  assert.ok(ev(fresh).length > 1000);
  assert.deepEqual(errors, []);
});

test('the network list shows where you connect to each network', () => {
  const { ev, errors } = load();
  bigNet(ev);
  // one index for the whole list says the same as asking network by network
  assert.equal(ev("const w=netWhereIdx();NETS.filter(n=>netWhere(n,w)!==netWhere(n)).length"), 0);
  assert.ok(ev("netWhere(NET.ggl).includes('goConn')"));
  ev("UI.leftOpen=true;ACT.leftTab({t:'nets'})");
  assert.match(ev("document.getElementById('leftBody').textContent"), /Goggle/);
  assert.deepEqual(errors, []);
});

test('the map draws a big network at every zoom, with a city or a link selected', () => {
  const { ev, errors } = load();
  bigNet(ev);
  ev("localStorage.setItem('sot-anim','on');UI.anim='on'");
  for (const sel of ['null', "{type:'city',id:'fra'}", "{type:'link',id:S.links[2].id}"]) {
    for (const z of [0.35, 0.6, 1.2, 2.5, 6]) ev(`UI.sel=${sel};cam.z=${z};draw(1000);draw(1016)`);
  }
  assert.ok(ev('ctx.calls.n') > 1000);
  assert.ok(ev("hitLink(...toS(CITY.fra.x,CITY.fra.y,0))!==undefined"));
  assert.deepEqual(errors, []);
});

test('long lists in the NOC dashboard show 100 rows at a time and grow on request', () => {
  const { ev, errors } = load();
  bigNet(ev);
  // well over a hundred PNIs and customers
  ev("const cs=Object.keys(S.pops);let i=0;for(const n of NETS)for(const c of cs.slice(0,2))S.pni.push({id:'tp'+(i++),city:c,net:n.id,tier:0,n:1,site:'a',sacrif:false});");
  ev("for(let j=0;j<150;j++)S.biz.push({id:'tb'+j,city:'fra',city2:null,name:'Test '+j,type:'dia',bw:1,rate:100,mood:50+j%40,since:0,reqs:[],pm:50});compute()");
  const total = ev('conns().length');
  assert.ok(total > 200);
  ev("UI.dtab='conn';ACT.connOpen()");
  const rows = () => ev("document.querySelectorAll('#dashCard tbody tr').length");
  assert.equal(rows(), 100);
  assert.match(ev("document.querySelector('#dashCard [data-act=\"listMore\"]').textContent"), /\+100 more connections/);
  assert.match(ev("document.getElementById('dashCard').textContent"), new RegExp(`${total} connections`), 'totals still count every connection');
  ev("document.querySelector('#dashCard [data-act=\"listMore\"]').click()");
  assert.equal(rows(), 200);
  ev("ACT.connSort({k:'mo'})");
  assert.equal(rows(), 100, 'a new sort starts short again');
  // customers
  ev("ACT.custOpen()");
  const custRows = () => ev("document.querySelectorAll('#custSec .row').length");
  assert.equal(custRows(), 100);
  const left = ev('S.biz.length') - 100;
  assert.ok(ev("document.querySelector('#custSec [data-act=\"listMore\"]').textContent").startsWith(`+${Math.min(100, left)} more customer`));
  ev("ACT.listMore({k:'cust'});ACT.listMore({k:'cust'});ACT.listMore({k:'nope'})");
  assert.equal(custRows(), Math.min(300, ev('S.biz.length')));
  // phones get the same cap
  ev("window.innerWidth=390;UI.dtab='conn';ACT.connOpen()");
  assert.equal(ev("document.querySelectorAll('#connSec .row').length"), 100);
  assert.deepEqual(errors, []);
});

test('the map is only redrawn when something on it can have changed', () => {
  const { ev, errors } = load();
  bigNet(ev);
  ev("closeModal();UI.anim='on';UI.speed=0;last=100000;worldLayer(cam.z)");
  let T = 100000;
  const frame = (code = '', dt = 16) => { if (code) ev(code); const a = ev('ctx.calls.n'); T += dt; ev(`frame(${T})`); return ev('ctx.calls.n') - a; };
  frame(); frame();
  assert.equal(frame(), 0, 'paused and untouched: nothing is drawn');
  assert.ok(frame('cam.x+=5') > 0, 'moving the map redraws it');
  assert.equal(frame(), 0);
  assert.ok(frame("UI.hover='ams'") > 0, 'pointing at a city redraws');
  assert.ok(frame("UI.sel={type:'city',id:'fra'}") > 0, 'selecting redraws');
  assert.ok(frame('dayTick()') > 0, 'a new day redraws');
  assert.equal(frame(), 0);
  assert.ok(frame('', 1100) > 0, 'and once a second anyway');
  assert.ok(frame('WL.key=null') > 0, 'the land picture catching up after a zoom or resize redraws');
  ev('UI.speed=1');
  assert.ok(frame() > 0 && frame() > 0, 'with the clock running every frame moves');
  ev("ACT.animSet({v:'off'})");
  frame(); frame();
  assert.equal(frame(), 0, 'with animations off the running map stands still between days');
  assert.deepEqual(errors, []);
});

test('after a day the open panels catch up on the next frame, even when every frame has a day', () => {
  const { ev, errors } = load();
  bigNet(ev);
  ev("closeModal();selectCity('fra');window.__rp=0;const rp0=renderPanel;renderPanel=function(){__rp++;return rp0.apply(this,arguments);}");
  ev('UI.speed=1;acc=DAY_MS;last=0;frame(16)');
  const day = ev('S.day');
  assert.equal(ev('__rp'), 0, 'the frame with the day leaves the panels for later');
  ev('frame(32)');
  assert.equal(ev('__rp'), 1, 'the next frame updates them');
  assert.equal(ev('S.day'), day);
  // a day on every frame: the panels still follow, one frame behind
  for (let i = 0; i < 3; i++) ev(`acc=DAY_MS;frame(${48 + 16 * i})`);
  assert.equal(ev('__rp'), 3, 'each frame shows the day before it');
  ev('frame(96)');
  assert.equal(ev('__rp'), 4);
  assert.deepEqual(errors, []);
});

test('payday money floaters fade after a long pause instead of piling up', () => {
  const { ev, errors } = load();
  bigNet(ev);
  // a fake clock, so a ten-minute pause takes no time; no auto-pause in the middle
  ev("closeModal();ACT.animSet({v:'on'});setPref('pauseFurious',false);setPref('pauseIncident',false);window.__clk=5000;performance.now=()=>__clk;last=__clk;UI.speed=1");
  const run = (ms) => { for (let t = 0; t < ms; t += 16) ev('__clk+=16;frame(__clk)'); };
  run(2000);
  assert.equal(ev('FLOATS.length'), 0, 'floaters from building the network have faded');
  ev('UI.speed=0;__clk+=600000;frame(__clk)');
  ev('while(S.day%30!==29)dayTick();UI.speed=1;acc=DAY_MS');
  run(16);
  assert.equal(ev('S.day%30'), 0);
  assert.ok(ev('FLOATS.length') > 0, 'payday shows the money');
  run(2000);
  assert.equal(ev('FLOATS.length'), 0, 'and it fades within two seconds of play');
  assert.deepEqual(errors, []);
});

test('the map is not drawn while the dashboard covers the whole screen', () => {
  const { ev, errors } = load();
  bigNet(ev);
  ev("closeModal();ACT.animSet({v:'on'});setPref('pauseFurious',false);setPref('pauseIncident',false);window.__clk=5000;performance.now=()=>__clk;last=__clk;UI.speed=1");
  const frame = () => { const a = ev('ctx.calls.n'); ev('__clk+=16;frame(__clk)'); return ev('ctx.calls.n') - a; };
  // jsdom has no layout, so the card says where it is: on a phone, scrolled down, it fills the screen
  const at = (top) => ev(`$('dashCard').getBoundingClientRect=()=>({top:${top},left:0,right:innerWidth,bottom:innerHeight+900})`);
  for (let t = 0; t < 2000; t += 16) frame();
  assert.equal(ev('FLOATS.length'), 0, 'floaters from building the network have faded');
  assert.ok(frame() > 0, 'the running map is drawn every frame');
  ev('ACT.connOpen()'); at(-40);
  assert.equal(frame(), 0, 'nothing is drawn under the dashboard');
  ev('while(S.day%30!==29)dayTick();acc=DAY_MS');
  for (let i = 0; i < 100; i++) assert.equal(frame(), 0);
  assert.equal(ev('S.day%30'), 0, 'the game kept running');
  assert.equal(ev('FLOATS.length'), 0, 'and payday money does not pile up out of sight');
  at(6);
  assert.ok(frame() > 0, 'back at the top, the strip of map above the card is drawn again');
  at(-40); frame();
  ev("$('dashCard').getBoundingClientRect=()=>({top:60,left:120,right:900,bottom:700})");
  assert.ok(frame() > 0, 'a dashboard with the map around it (desktop) does not stop it');
  at(-40); frame();
  ev('ACT.dashClose()');
  assert.ok(frame() > 0, 'closing the dashboard draws the map again');
  assert.deepEqual(errors, []);
});

// #89's fast paths must route exactly like the plain path. plainCompute() builds window.__plain, a copy of compute()
// with every shortcut turned off (the POP's-own-exits shortcut, the first-group scan with its list clean-up, the
// per-network exit index and the full-path mark), and the group split and sort written the plain way. The tests below
// compare the two on a busy network (Auto-TE, then a RouteScript that keeps headroom on every link) and on a small one
// where Auto-TE has to route around a full link, so it keeps holding when the game's numbers change.
function plainCompute(ev) {
  const src = ev('compute.toString()');
  let plain = src
    .replace('if(!lst.hi&&ALONE[f.ci])', 'if(false)')
    .replace('if(!G.length){\n        // One scan', 'if(false){\n        // One scan')
    .replace('for(const n of e.nets||NET_IDS)', 'for(const n of NET_IDS)')
    .replace('if(P.dead)return 0;', '').replaceAll('if(r<=1e-6){P.dead=1;return 0;}', '')
    .replace('if(!P.dead)room-=push(', 'room-=push(').replace(/const gone=e=>\{[^\n]*\};/, 'const gone=e=>false;');
  // ...and the group split and sorting written the plain way, with array copies, as before they were made allocation-free
  const sg = plain.indexOf('const ROOM=[],sendGroup='), sd = plain.indexOf('const sortD=');
  assert.ok(sg > 0 && sd > sg, 'found the group sender and the sort');
  plain = plain.slice(0, sg) + `const ROOM=[],sendGroup=(g0,i0=0,i1=g0.length)=>{const g=g0.slice(i0,i1);for(const e of g)e.vis=vis;
    if(g.length>1){const room=g.map(e=>Math.max(0,e.cap-e.used)),tot=room.reduce((a,b)=>a+b,0),want=f.rem;if(tot>1e-6)g.forEach((e,k)=>send(e,want*room[k]/tot));}
    for(const e of g){if(f.rem<=1e-6)break;send(e,f.rem);}};\n  ` + plain.slice(sd).replace(/^const sortD=a=>\{[^\n]*\};/, 'const sortD=a=>a.sort(byDist);');
  for (const [a, b] of [[src, plain]]) assert.notEqual(a, b);
  assert.equal((plain.match(/if\(false\)/g) || []).length, 2, 'both shortcuts were found and switched off');
  assert.ok(!plain.includes('e.nets||NET_IDS'), 'the exit index was switched off');
  assert.ok(!plain.includes('P.dead'), 'the full-path mark was switched off');
  assert.ok(plain.includes('const sortD=a=>a.sort(byDist);') && plain.includes('g.forEach('), 'the plain group split and sort are in');
  ev('window.__plain=' + plain.replace(/^function compute/, 'function'));
}

test('fast routing gives exactly the same result as the plain path it replaces', () => {
  const { ev, errors } = load();
  plainCompute(ev);
  ev(`ACT.start({});S.cash=1e12;S.lvl=13;S.won=true;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});
    const cs=ALLC.filter(c=>!CITY[c].cn).slice(0,40);for(const c of cs){if(!S.pops[c])ACT.buildPop({city:c});S.pops[c].rgen=10;S.pops[c].routers=4;if(!S.pops[c].bb)ACT.launchBB({city:c});S.pops[c].bb.d=CITY[c].P*0.7;}
    const L=(a,b,t)=>{UI.via=null;UI.lmode='wave';UI.route='diverse';try{openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();}catch(e){}};
    for(let i=1;i<cs.length;i++)L(cs[i-1],cs[i],2);for(let i=0;i<cs.length;i+=4)L(cs[i],cs[(i+9)%cs.length],1);
    // two upstreams in some cities and route servers on every exchange: equal-cost choices at the same POP
    for(const c of cs.slice(0,14)){const ts=NETS.filter(n=>n.price&&n.pops.includes(c)&&(n.type==='t1'||n.type==='t2')).slice(0,2);for(const t of ts)ACT.buyTransit({city:c,net:t.id,tier:1});}
    for(const c of cs)for(const x of ixIdsIn(c)){try{ACT.buyIx({city:x,tier:1});}catch(e){}if(S.dk&&S.dk.q){S.dk.q=null;closeModal();}if(S.ixp[x]!==undefined&&!S.rs[x])ACT.rs({city:x});}
    compute();for(const n of NETS)for(const c of cs)if(n.pops.includes(c)&&peerOk(n.id,'pni',c).ok&&S.pni.length<150)S.pni.push({id:'p'+n.id+c,net:n.id,city:c,tier:1,n:1});
    for(const n of NETS.filter(n=>n.cache))for(const c of cs.slice(0,15))for(const k of [1,2])S.caches.push({id:'c'+k+n.id+c,city:c,net:n.id,site:'a'});
    if(S.pni[3])S.pni[3].pref='high';if(S.transit[1])S.transit[1].pref='low';S.te={on:true,day:0};S.nextFail=1e9;S.nextEvent=1e9;`);
  const sig = () => ev(`JSON.stringify({served:R.served,demand:R.demand,reach:R.reach,peered:R.peered,teMoved:R.teMoved,egT:R.egT,
    srv:Object.keys(R.citySrv).sort().map(c=>[c,R.citySrv[c]]),load:S.links.map(l=>R.load[l.id]||0),node:Object.keys(R.nodeLoad).sort().map(c=>[c,R.nodeLoad[c]]),
    t:Object.keys(R.useT).sort().map(k=>[k,R.useT[k]]),p:Object.keys(R.usePni).sort().map(k=>[k,R.usePni[k]]),ix:Object.keys(R.useIx).sort().map(k=>[k,R.useIx[k]]),c:Object.keys(R.useCache).sort().map(k=>[k,R.useCache[k]])})`);
  for (let day = 0; day < 6; day++) {
    // the last days run a RouteScript: spill keeps headroom on every link (push with a reserve), plus preferences
    if (day === 4) ev(`S.te.script='spill at 80%\\nprefer transit '+NET[S.transit[0].net].name+'\\nprotect customers';`);
    if (day >= 4) assert.ok(ev('!!teRules()&&teRules().spill===0.8'), 'the RouteScript is active');
    ev('compute()'); const fast = sig();
    ev('__plain()'); const ref = sig();
    assert.equal(fast, ref, `day ${day}: the fast and the plain path route the same traffic`);
    ev('compute();dayTick()');
  }
  assert.ok(ev('S.pni.length') > 50 && ev('S.caches.length') > 50, 'a network big enough to exercise every path');
  assert.ok(ev('R.served') > 1000 && ev("S.transit.length") > 14, 'traffic flows over transit, peering and caches');
  assert.deepEqual(errors, []);
});

test('Auto-TE routes around a full link exactly like the plain path', () => {
  const { ev, errors } = load();
  plainCompute(ev);
  // Frankfurt reaches its only upstream in Amsterdam over a 10G wave, or the long way through Brussels on 800G.
  ev(`ACT.start({});S.cash=1e12;S.lvl=13;for(const g of GOALS)S.done[g.id]=0;for(const c of ['ams','bru'])ACT.buildPop({city:c});
    for(const c of ['fra','ams','bru']){S.pops[c].rgen=RG.length-1;S.pops[c].routers=RMAX;}if(!S.pops.fra.bb)ACT.launchBB({city:'fra'});S.pops.fra.bb.d=CITY.fra.P*0.8;
    const L=(a,b,t)=>{UI.via=null;UI.lmode='wave';UI.route='main';openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();};
    L('fra','ams',0);L('fra','bru',3);L('bru','ams',3);
    S.transit=[];const t=NETS.find(n=>n.price&&n.pops.includes('ams')&&n.type==='t1');ACT.buyTransit({city:'ams',net:t.id,tier:3});
    S.ixp={};S.pni=[];S.caches=[];S.te={on:true,day:0};S.nextFail=1e9;S.nextEvent=1e9;`);
  const sig = () => ev('JSON.stringify({served:R.served,teMoved:R.teMoved,egT:R.egT,load:S.links.map(l=>R.load[l.id]||0),node:R.nodeLoad,t:R.useT})');
  for (const script of ['', 'spill at 70%']) {
    ev(`S.te.script=${JSON.stringify(script)}`);
    ev('compute()'); const fast = sig();
    ev('__plain()'); const ref = sig();
    assert.equal(fast, ref, `fast and plain route the same around the full link (${script || 'no script'})`);
    assert.ok(ev('R.teMoved') > 100, 'Auto-TE moved traffic through Brussels');
    assert.ok(ev("R.load[S.links.find(l=>l.a==='fra'&&l.b==='ams').id]") >= (script ? 6.9 : 9.99), 'the direct 10G link is full (up to the spill line)');
  }
  assert.deepEqual(errors, []);
});
