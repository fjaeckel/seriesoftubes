const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

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

test('the map keeps fiber capacities for one frame only, and skips links above or below the screen', () => {
  const { ev, errors } = load();
  bigNet(ev);
  ev("S.links.push({id:'dfT',a:'fra',b:'ams',kind:'df',own:true,km:kmBetween('fra','ams'),ready:0,ch:['zr4']});compute()");
  ev('cam.x=CITY.fra.x;cam.y=CITY.fra.y;cam.z=2;draw(0)');
  assert.equal(ev('DFC'), null, 'nothing is kept between frames');
  const cap = ev("dfCap(S.links.find(l=>l.id==='dfT'))");
  ev("S.links.find(l=>l.id==='dfT').ch.push('zr4');draw(0)");
  assert.equal(ev("dfCap(S.links.find(l=>l.id==='dfT'))"), 2 * cap, 'a new channel counts on the next frame');
  ev("window.__ds=drawShips;drawShips=()=>{throw new Error('boom')}");
  assert.throws(() => ev('draw(0)'));
  ev('drawShips=window.__ds');
  assert.equal(ev('DFC'), null, 'not even after a frame that failed');
  // The whole network far above the screen: the links cost nothing, as if there were none.
  const calls = (body) => ev(`(()=>{cam.x=CITY.fra.x;cam.y=CITY.fra.y+${'2000'};cam.z=2;${body};const n=ctx.calls.n;draw(0);return ctx.calls.n-n;})()`);
  const withLinks = calls(''), links = ev('JSON.stringify(S.links)');
  assert.equal(withLinks, calls('S.links=[]'));
  ev(`S.links=JSON.parse(${lit(links)})`);
  assert.deepEqual(errors, []);
});

test('a map with more than MAP_BUSY lines on screen leaves out link labels and fiber dots, and they come back', () => {
  const { ev, errors } = load();
  bigNet(ev);
  // Spy on the two things that go: the dotted line on lit fiber and the link labels.
  ev("window.__dots=0;window.__labels=[];ctx.setLineDash=d=>{if(d.length===2&&d[0]===1&&d[1]===6)__dots++;};const __pill=pill;pill=(t,...a)=>{if(/ DF$/.test(t))__labels.push(t);return __pill(t,...a);}");
  const frame = () => ev("__dots=0;__labels=[];draw(0);JSON.stringify([__dots,__labels.length])");
  const view = "cam.x=(CITY.fra.x+CITY.lon.x)/2;cam.y=(CITY.fra.y+CITY.lon.y)/2;cam.z=1.6;";
  const lines = () => ev("(()=>{const PI=pairIdx();return linesOnScreen(linkGroups().map(g=>linkGeom(g[0],PI.get(edgeKey(g[0])))),visibleKs());})()");
  ev("const ps=[['fra','ams'],['ams','lon'],['lon','par'],['par','fra'],['fra','lon'],['ams','par']];for(let i=0;i<20;i++){const [a,b]=ps[i%6];S.links.push({id:'dfB'+i,a,b,kind:'df',own:true,km:kmBetween(a,b),ready:0,ch:['zr4']});}compute()");
  ev(view);
  assert.ok(lines() < ev('MAP_BUSY'));
  const [dots, labels] = JSON.parse(frame());
  assert.ok(dots >= 20 && labels >= 20, 'a normal map shows them');
  ev("const ps2=[['fra','ams'],['ams','lon'],['lon','par'],['par','fra'],['fra','lon'],['ams','par']];for(let i=20;i<MAP_BUSY+20;i++){const [a,b]=ps2[i%6];S.links.push({id:'dfB'+i,a,b,kind:'df',own:true,km:kmBetween(a,b),ready:0,ch:['zr4']});}compute()");
  ev(view);
  assert.ok(lines() > ev('MAP_BUSY'));
  assert.equal(frame(), '[0,0]', 'a tangle of lines does not');
  ev("UI.sel={type:'link',id:'dfB3'}");
  assert.equal(frame(), '[0,1]', 'except the label of the selected link');
  ev("UI.sel=null;S.links=S.links.filter(l=>!/^dfB/.test(l.id)||+l.id.slice(3)<20);compute()");
  ev(view);
  assert.deepEqual(JSON.parse(frame()), [dots, labels], 'back as soon as fewer lines show');
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
  // Only the animation clock moves: ambient, drawn at most 30 times a second (tests/frame-pacing.test.js).
  const run = [frame(), frame(), frame(), frame()].filter((n) => n > 0).length;
  assert.ok(run >= 2 && run < 4, `with the clock running the map moves, every other frame at 60 Hz (${run} of 4)`);
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
  ev('while(cal(S.day+1).d!==1)dayTick();UI.speed=1;acc=DAY_MS');
  run(16);
  assert.equal(ev('cal(S.day).d'), 1, 'the first of a month');
  assert.ok(ev('FLOATS.length') > 0, 'payday shows the money');
  run(2000);
  assert.equal(ev('FLOATS.length'), 0, 'and it fades within two seconds of play');
  assert.deepEqual(errors, []);
});

test("a new network starts without the last one's money floating over its map", () => {
  const { ev, errors } = load();
  bigNet(ev);
  ev("closeModal();ACT.animSet({v:'on'});setPref('pauseFurious',false);setPref('pauseIncident',false);window.__clk=5000;performance.now=()=>__clk;last=__clk;UI.speed=1");
  const run = (ms) => { for (let t = 0; t < ms; t += 16) ev('__clk+=16;frame(__clk)'); };
  run(2000);
  ev('while(cal(S.day+1).d!==1)dayTick();acc=DAY_MS');
  run(16);
  assert.ok(ev('FLOATS.length') > 0, 'payday shows the money');
  // A new game straight away: it waits, paused, for the player's first POP, and the clock of the floaters with it.
  ev("ACT.newgame();ACT.start({});closeModal();UI.speed=0");
  run(100);
  assert.equal(ev('FLOATS.length'), 0, "the old network's floaters are gone");
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
  const src = ev('compute.toString()'), csrc = ev('routeCore.toString()');
  const plain = src
    .replace('const ns=e.nets||NET_IDS;', 'const ns=NET_IDS;')
    // ...and without what routing keeps between calls (29-route-cache.js): the plain path builds everything afresh,
    // which also leaves the lists without kept orders, so the first group and the rest are scanned and sorted.
    .replace('RCON=RC.on', 'RCON=false');
  // The routing core (29-route-core.js) with its shortcuts off: Auto-TE's no-detour marks and its searches picked up
  // where the last one stopped back to the cache lookup and a fresh dijkstra() for every detour.
  let core = csrc
    .replace('if(!lst.hi&&!lst.mx&&ALONE[fci])', 'if(false)')
    .replace('if(!GN){\n        // One scan', 'if(false){\n        // One scan')
    .replace('if(P.dead)return 0;', '').replaceAll('if(r<=1e-6){P.dead=1;return 0;}', '')
    .replace('if(!P.dead)room-=push(', 'room-=push(').replace(/const gone=x=>\{[^\n]*\};/, 'const gone=x=>false;')
    // ...and every exit is called, even one whose path is full with no detour (dud()).
    .replace(/const dud=x=>\{[^\n]*\};/, 'const dud=x=>false;')
    .replace('if(TEF[key]===1)return null;const c0=teCache.get(key);', 'const c0=teCache.get(key);if(c0===false)return null;')
    .replace('const d=teSearch(src,dst);', 'const d=dijkstraTo(adj,src,wW,(v,e)=>e.res<=1e-3||(HAS[v]&&NRES[v]<=1e-3)||(CORE&&OUT[v]&&v!==dst),dst);')
    .replace('const d=dijkstraTo(adj,src,wW,', 'const {D:D0,P:P0}=dijkstra(adj,src,wW,').replace(',dst);\n    if(d===Infinity', ',dst),d=D0[dst];\n    if(d===Infinity')
    .replace('walkP(DJ.P,src,dst)', 'walkP(P0,src,dst)');
  // ...and the group split and sorting written the plain way, with array copies, as before they were made allocation-free
  const sg = core.indexOf('const ROOM=[],sendGroup='), sd = core.indexOf('const sortD=');
  assert.ok(sg > 0 && sd > sg, 'found the group sender and the sort');
  core = core.slice(0, sg) + `const ROOM=[],sendGroup=(g0,i0=0,i1=g0.length)=>{const g=g0.slice(i0,i1);for(const x of g)VISX[x]=vis;
    if(g.length>1){const room=g.map(x=>Math.max(0,CAPX[x]-USED[x])),tot=room.reduce((a,b)=>a+b,0),want=FREM[F];if(tot>1e-6)g.forEach((x,k)=>send(x,want*room[k]/tot));}
    for(const x of g){if(FREM[F]<=1e-6)break;send(x,FREM[F]);}};\n  ` + core.slice(sd).replace(/^const sortD=\(a,n=a\.length\)=>\{[^\n]*\};/, 'const sortD=(a,n=a.length)=>{const t=a.slice(0,n).sort(byDist);for(let i=0;i<n;i++)a[i]=t[i];};');
  assert.notEqual(src, plain); assert.notEqual(csrc, core);
  assert.equal((core.match(/if\(false\)/g) || []).length, 2, 'both shortcuts were found and switched off');
  assert.ok(!plain.includes('e.nets||NET_IDS'), 'the exit index was switched off');
  assert.ok(!core.includes('P.dead'), 'the full-path mark was switched off');
  assert.ok(core.includes('const dud=x=>false;'), 'every exit of a group is called');
  assert.ok(plain.includes('RCON=false') && !plain.includes('RC.on'), 'the kept routing tables were switched off');
  assert.ok(!core.includes('TEF[key]===1') && !core.includes('dijkstraTo(') && !core.includes('const d=teSearch(') && core.includes('if(c0===false)return null;'), "Auto-TE's shortcuts were switched off");
  assert.ok(core.includes('const sortD=(a,n=a.length)=>{const t=a.slice(0,n).sort(byDist);') && core.includes('g.forEach('), 'the plain group split and sort are in');
  ev('window.__plainC=' + plain.replace(/^function compute/, 'function') + ';window.__plainR=(' + core.replace(/^function routeCore/, 'function') + ')();');
  ev('window.__plain=function(){const r=ROUTE;ROUTE=__plainR;try{__plainC();}finally{ROUTE=r;}};');
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
    if(S.pni[3])S.pni[3].pref='high';if(S.transit[1])S.transit[1].pref='low';S.te={on:true,day:0};S.core={lv:2,run:2,legacy:true};S.nextFail=1e9;S.nextEvent=1e9;`);
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
    for(const c of ['fra','ams','bru']){S.pops[c].rgen=RG_TOP;S.pops[c].routers=RMAX;}if(!S.pops.fra.bb)ACT.launchBB({city:'fra'});S.pops.fra.bb.d=CITY.fra.P*0.8;
    const L=(a,b,t)=>{UI.via=null;UI.lmode='wave';UI.route='main';openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();};
    L('fra','ams',0);L('fra','bru',3);L('bru','ams',3);
    S.transit=[];const t=NETS.find(n=>n.price&&n.pops.includes('ams')&&n.type==='t1');ACT.buyTransit({city:'ams',net:t.id,tier:3});
    S.ixp={};S.pni=[];S.caches=[];S.te={on:true,day:0};S.core={lv:2,run:2,legacy:true};S.nextFail=1e9;S.nextEvent=1e9;`);
  const sig = () => ev('JSON.stringify({served:R.served,teMoved:R.teMoved,egT:R.egT,load:S.links.map(l=>R.load[l.id]||0),node:R.nodeLoad,t:R.useT})');
  for (const script of ['', 'spill at 70%', 'spill at 80% within 5 ms\nspill at 90% within 20 ms']) {
    ev(`S.te.script=${lit(script)}`);
    ev('compute()'); const fast = sig();
    ev('__plain()'); const ref = sig();
    assert.equal(fast, ref, `fast and plain route the same around the full link (${script || 'no script'})`);
    assert.ok(ev('R.teMoved') > 100, 'Auto-TE moved traffic through Brussels');
    assert.ok(ev("R.load[S.links.find(l=>l.a==='fra'&&l.b==='ams').id]") >= (script ? 6.9 : 9.99), 'the direct 10G link is full (up to the spill line)');
  }
  assert.deepEqual(errors, []);
});

// Auto-TE's searches for a detour, on meshes of thin and thick links where POPs fill up and some sit outside the core
// (TE never steers through them, but may end there): a search from a city picks up where the last one from there
// stopped until a link or router runs out of room, and an exit whose full path has no detour is not called. Several
// seeded networks, from light to heavy load, must route exactly as the plain path that searches every time.
test('Auto-TE detours route like the plain path on crowded meshes with POPs outside the core', () => {
  const { ev, errors } = load();
  plainCompute(ev);
  // The fast core, counting the searches that were picked up: answered at once, or gone on from where the last stopped.
  const csrc = ev('routeCore.toString()'), counted = csrc.replace('if(go){g=LRg;if(DJ.done[dst]===g)return DJ.D[dst];', 'if(go){g=LRg;if(DJ.done[dst]===g){__TE.had++;return DJ.D[dst];}__TE.went++;');
  assert.notEqual(counted, csrc, 'found the picked-up search');
  ev('window.__TE={had:0,went:0};ROUTE=(' + counted.replace(/^function routeCore/, 'function') + ')();');
  const CS = ['fra', 'ams', 'bru', 'par', 'lon', 'zrh', 'mil', 'vie', 'prg', 'ber', 'muc', 'mad', 'cph', 'waw', 'mrs', 'ham', 'dus'];
  let moved = 0, outs = 0;
  for (let seed = 1; seed <= 6; seed++) {
    let a = seed * 7919;
    const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; }, int = (n) => Math.floor(rnd() * n);
    const cs = CS.filter(() => rnd() < 0.75), links = [];
    for (let i = 1; i < cs.length; i++) links.push([cs[int(i)], cs[i], int(4)]);
    for (let k = 0; k < cs.length; k++) { const x = cs[int(cs.length)], y = cs[int(cs.length)]; if (x !== y) links.push([x, y, int(4)]); }
    const out = cs.filter(() => rnd() < 0.3), up = cs.filter((c) => out.includes(c) || rnd() < 0.3).concat(cs[0]);
    ev(`ACT.start({});S.cash=1e12;S.lvl=13;for(const g of GOALS)S.done[g.id]=0;S.pops={};S.links=[];S.transit=[];
      const cs=${JSON.stringify(cs)},out=${JSON.stringify(out)},IN=RG.findIndex(g=>g.cr>=3&&!g.noMpls),OUT=RG.findIndex(g=>g.cr<2);
      for(const c of cs){ACT.buildPop({city:c});const p=S.pops[c];p.rgen=RG_TOP;p.routers=RMAX;if(!p.bb)ACT.launchBB({city:c});}
      const L=(a,b,t)=>{UI.via=null;UI.lmode='wave';UI.route='main';try{openLinkModal(a,b);ACT.buildLink({tier:t});}catch(e){}closeModal();};
      for(const [a,b,t] of ${JSON.stringify(links)})L(a,b,t);
      for(const c of ${JSON.stringify(up)}){const t=NETS.find(n=>n.price&&n.pops.includes(c)&&(n.type==='t1'||n.type==='t2'));if(t)ACT.buyTransit({city:c,net:t.id,tier:3});}
      // Then the routers: some too old for the core, and few enough that POPs fill up too.
      for(const c of cs){const p=S.pops[c];p.rgen=out.includes(c)?OUT:IN;p.routers=1+${int(3)};}
      S.ixp={};S.pni=[];S.caches=[];S.biz=[];S.te={on:true,day:0};S.core={lv:3,run:2};S.nextFail=1e9;S.nextEvent=1e9;`);
    assert.ok(ev('coreOn()&&coreTE()'), 'the core rules apply and Auto-TE runs');
    outs += ev('Object.keys(S.pops).filter(c=>!inCore(c)).length');
    const sig = () => ev('JSON.stringify({served:R.served,teMoved:R.teMoved,egT:R.egT,load:S.links.map(l=>R.load[l.id]||0),node:R.nodeLoad,t:R.useT,f:R.fl.map(f=>[f.got,f.via])})');
    for (const load of [0.3, 0.8, 1.6, 3]) {
      ev(`for(const c in S.pops)S.pops[c].bb.d=CITY[c].P*${load}`);
      ev('compute()'); const fast = sig(); moved += ev('R.teMoved');
      ev('__plain()'); const ref = sig();
      assert.equal(fast, ref, `network ${seed} at load ${load}: the fast and the plain path route the same`);
    }
  }
  assert.ok(moved > 100, 'Auto-TE found detours');
  assert.ok(outs > 0, 'some POPs are outside the core');
  assert.ok(ev('__TE.had') > 0 && ev('__TE.went') > 0, 'searches were picked up: some answered at once, some gone on');
  assert.deepEqual(errors, []);
});

test('fiber customers are checked by link id the same way with or without the lookup tables', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'})");
  // Dark fibers: one fine, one cut, one waiting for gear, one not built yet, and a second link reusing an id (the first one wins).
  ev(`(()=>{const sys=Object.keys(DF_SYS)[0],L=(id,o)=>S.links.push({id,a:'fra',b:'ams',kind:'df',sys,km:400,ready:0,ch:[],own:true,...o});
    L('f1',{});L('f2',{cut:S.day+5});L('f3',{eqDown:S.day+5});L('f4',{ready:S.day+30});L('f1',{cut:S.day+5});
    let n=0;const B=(type,link,o)=>S.biz.push({id:'b'+(n++),type,link,city:'fra',city2:'ams',bw:1,rate:1,mood:80,reqs:[],...o});
    for(const l of ['f1','f2','f3','f4','gone'])for(const t of ['wwave','dfpair','pairs'])B(t,l,{slots:t==='wwave'?2:undefined});
    B('wwave','f1',{slots:3});B('wwave','f1',{});B('dfpair','f3',{});})()`);
  const r = JSON.parse(ev(`(()=>{const ids=linkIds(),u=fiberUse(),out=[];
    for(const b of S.biz)if(BIZ_T[b.type].fiber)out.push([b.id,fiberOk(b),fiberOk(b,ids),bizSf(b),bizSf(b,ids)]);
    for(const l of S.links)if(l.kind==='df')out.push([l.id,soldSlots(l),soldSlots(l,u),freeCh(l),freeCh(l,u),pairFree(l),pairFree(l,u)]);
    return JSON.stringify(out);})()`));
  for (const row of r) {
    const [id, ...v] = row;
    for (let i = 0; i < v.length; i += 2) assert.equal(v[i + 1], v[i], `${id}: column ${i / 2}`);
  }
  assert.ok(r.some((x) => x[0] === 'f1' && x[1] === 5), 'f1 has 5 alien-wave slots sold');
  assert.ok(r.some((x) => x[1] === true) && r.some((x) => x[1] === false), 'some fibers are up and some are not');
  assert.deepEqual(errors, []);
});
