// Multimode screens, compact (95-modals/47-49-fed-*.js, 94-dashboard/92-fedplay.js): the sheet says where you stand
// and what waits for an answer (Accept and Decline per request, the terms on a tap), settings fold away once joined,
// the server list leads with a recommended server and folds servers only heard of, the boards show a short first page
// with the own row in it or pinned, the looking glass and the players card show a first page. Local state only: the
// federation's reads are replaced by fixed answers, so nothing here opens a socket or reads a server.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { load } = require('./harness');

// Keys that pass the record checks, the same every run.
const K = (n) => crypto.createHash('sha256').update('fed-ux ' + n).digest('base64url');
const NAMES = Array.from({ length: 52 }, (_, i) => 'Player Net ' + i);
const STUBS = `(()=>{const now=FED.now(),K=${JSON.stringify(NAMES.map((n, i) => K(i)))},U1='wss://a.example/fed',U2='wss://b.example/fed';
  const SRVS=[{id:'sA',name:'Packet Lunch',source:'registry',sync:'open',nodes:[{url:U1,key:${JSON.stringify(K('nA'))}}],operators:[${JSON.stringify(K('oA'))}],langs:['en'],noLogs:true,desc:'',answered:now-60},
    {id:'sB',name:'Hop Shop',source:'registry',sync:'open',nodes:[{url:U2,key:${JSON.stringify(K('nB'))}}],operators:[${JSON.stringify(K('oB'))}],langs:['fr'],noLogs:false,desc:'',answered:now-3600},
    {id:'sC',name:'Lag Lagoon',source:'registry',sync:'selective',nodes:[{url:'wss://c.example/fed',key:${JSON.stringify(K('nC'))}}],operators:[${JSON.stringify(K('oC'))}],langs:['it'],noLogs:false,desc:'',answered:now-86400},
    {id:'sE',name:'Ping Pong Palace',source:'gossip',sync:'open',nodes:[{url:'wss://e.example/fed',key:${JSON.stringify(K('nE'))}}],operators:[${JSON.stringify(K('oE'))}],langs:[],noLogs:false,desc:'',seen:now-60}];
  const N=${JSON.stringify(NAMES)}.map((name,i)=>({key:K[i],name,asn:4200000100+i,home:'DE'}));
  window.UX={SRVS,N,U1,U2,slice:null};FU.can=true;FED.set=()=>0;FED.clear=()=>{};// no timers: nothing refreshes on its own
  Object.assign(window,{fedServers:async()=>SRVS.slice(),fedOpKey:async()=>null,fedGet:async()=>null,fedVotesTidy:async()=>{},fedShunned:async()=>[],fedHides:async()=>null,
    fedExclInfo:async()=>({shunned:false,confirmed:false,servers:[],reasons:[]}),fedAsn:async()=>4200000999,fedCatalogLoad:async()=>true,fedNetsStats:async()=>new Map(),
    fedWake:()=>{},fedPlayRefresh:async()=>{},fedPlayRun:async()=>{},fedRankView:async()=>UX.slice,
    fedNetworks:async()=>N.slice(0,30).map(n=>({key:n.key,srv:['sA'],quiet:{state:'active',factor:1000},rec:{t:now,body:{name:n.name,asn:n.asn,home:'DE',policy:'open',pops:['fra'],ix:['fra'],cust:1,day:10}}}))});})()`;

// A joined game (two servers, one connected), 8 players in play, `rq` requests to review and `out` of its own waiting,
// and a board of 50 rows with this network at `rank`.
function joined(o = {}) {
  const p = load();
  p.ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'})");
  p.ev(STUBS);
  p.ev(`(()=>{const now=FED.now(),me=${JSON.stringify(K('me'))},rank=${o.rank || 63};
    S.fed={...fedNewState(),on:true,key:{pub:me,priv:${JSON.stringify(K('priv'))}},servers:[UX.U1,UX.U2],joined:Math.floor(now/86400)-40,deals:[]};
    FED.live={fed:S.fed,conns:new Map()};FED.st={[UX.U1]:{state:'connected',since:now-60,server:'sA',node:UX.U1},[UX.U2]:{state:'offline',since:now-600,server:'sB',node:UX.U2}};
    const rows=UX.N.slice(0,50).map((n,i)=>({key:n.key,rank:i+1,value:5e6-i*1000,asn:n.asn,name:n.name,home:'DE'}));
    if(rank<=50)rows[rank-1]={...rows[rank-1],key:me,name:S.name};
    UX.slice={rows,me:{rank,value:rank<=50?rows[rank-1].value:900},n:300,at:null,untrusted:[]};
    S.fedn={h:'ux',nets:UX.N.slice(0,8).map((n,i)=>({k:n.key,name:n.name,asn:n.asn,home:'DE',pops:['fra'],ix:['fra'],mix:[300,600,100],tr:1000*(i+1),cust:1,pol:'open',q:1000,st:'active',ai:false,t1:false,bid:'b'+i,at:now}))};
    const P=fedP();P.rq=[...Array(${o.rq ?? 2})].map((_,i)=>({id:'rq'+i,rec:{v:1,kind:'offer',key:UX.N[i].key,t:now,body:i?{deal:'transit',terms:{mbps:10000,perGbps:120,term:90,at:['fra']}}:{deal:'peering',terms:{at:['fra'],via:'ix'}}}}));
    S.fed.deals=[...Array(${o.out ?? 1})].map((_,i)=>({id:'d'+i,key:UX.N[10+i].key,name:UX.N[10+i].name,deal:'peering',role:'buy',terms:{at:['fra'],via:'ix'},st:'wait',start:now,end:null,on:false}));
    FEDN.h='';compute();})()`);
  return p;
}
const settle = async (p) => { for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 5)); if (!p.ev('!!(FU.loading||FU.loadNext)')) break; await p.ev('FU.loading||null'); } };
const q = (p, sel) => p.ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const txt = (p) => p.ev("$('modalCard').textContent");

test('the Multimode sheet says where you stand and lists what waits for an answer, settings folded', async () => {
  const p = joined({ rq: 2, out: 1 });
  p.ev("ACT.fuOpen({v:'home'})"); await settle(p);
  assert.match(p.ev("document.querySelector('#modalCard .fu-where').textContent"), /connected.*AS4200000999/s, 'status and identity first');
  assert.match(txt(p), /Waiting for your answer/);
  assert.equal(q(p, '#modalCard .fp-wait .fp-rq'), 2, 'one card per request');
  assert.equal(q(p, '#modalCard .fp-rq [data-act="fpAccept"]'), 2);
  assert.equal(q(p, '#modalCard .fp-rq [data-act="fpDecline"]'), 2);
  // Accept and Decline come before the terms; the terms are one line until tapped.
  assert.equal(p.ev(`[...document.querySelectorAll('#modalCard .fp-rq')][1].firstElementChild.className`), 'fp-rqh');
  assert.equal(q(p, '#modalCard .fp-terms.open'), 0);
  p.ev(`ACT.fpFold({k:'t:rq1'})`);
  assert.equal(q(p, '#modalCard .fp-terms.open'), 1, 'a tap shows all the terms');
  assert.match(p.ev("document.querySelector('#modalCard .fp-terms.open').textContent"), /10(\.0)? Gbps/);
  // This network's own request, waiting for theirs, with a way to the player's sheet.
  assert.match(txt(p), /waiting for their answer/i);
  assert.equal(q(p, '#modalCard .fp-out [data-act="fpNet"]'), 1);
  // Settings and privacy fold away once joined, and unfold on a tap.
  assert.equal(q(p, '#modalCard [data-act="fuShare"]'), 0);
  assert.equal(q(p, '#modalCard [data-act="privacy"]'), 1, 'the privacy text stays one tap away');
  p.ev("ACT.fuFold({k:'set'})");
  assert.equal(q(p, '#modalCard [data-act="fuShare"]'), 2);
  assert.match(txt(p), /Share my country.*Muted networks.*Operating a server.*Leave for good/s);
  // Requests to review, from a toast or the players card, open this sheet.
  p.ev('ACT.fuClose();ACT.fpQueue()');
  assert.equal(p.ev("$('modalCard').querySelector('.fedui').dataset.fu"), 'home');
  assert.deepEqual(p.errors, []);
});

test('not joined: the explanation and the settings show, nothing waits', async () => {
  const p = load();
  p.ev('ACT.start({})'); p.ev(STUBS);
  p.ev("ACT.fuOpen({v:'home'})"); await settle(p);
  assert.match(txt(p), /Other players' networks become places/);
  assert.equal(q(p, '#modalCard .fp-wait'), 0);
  assert.equal(q(p, '#modalCard [data-act="fuFold"]'), 0);
  assert.equal(q(p, '#modalCard [data-act="fuOpen"][data-args*="opkey"]'), 1);
  assert.deepEqual(p.errors, []);
});

test('servers: a recommended one first, compact cards with Join beside the name, servers only heard of folded', async () => {
  const p = load();
  p.ev('ACT.start({})'); p.ev(STUBS);
  p.ev("ACT.fuOpen({v:'join'})"); await settle(p);
  const cards = JSON.parse(p.ev(`JSON.stringify([...document.querySelectorAll('#modalCard .fu-srv')].map(c=>({name:c.querySelector('b').textContent,first:c.firstElementChild.className,rec:c.classList.contains('rec'),join:!!c.querySelector('.fu-srvh [data-act="fuJoin"]')})))`));
  assert.deepEqual(cards.map((c) => c.name), ['Packet Lunch', 'Hop Shop', 'Lag Lagoon'], 'the open server that answered last leads; only heard of is folded');
  assert.ok(cards[0].rec && !cards[1].rec, 'one is recommended');
  assert.ok(cards.every((c) => c.first === 'fu-pol' && c.join), 'policy first, Join on the name line');
  assert.match(txt(p), /Recommended/);
  p.ev("ACT.fuFold({k:'heard'})");
  assert.equal(q(p, '#modalCard .fu-srv'), 4);
  assert.deepEqual(p.errors, []);
});

test('boards: the top ten first, the own row highlighted in it or pinned below, all fifty on a tap', async () => {
  let p = joined({ rank: 30 });
  p.ev("ACT.fuOpen({v:'boards'})"); await settle(p);
  assert.equal(q(p, '#modalCard .fu-board:not(.fu-mine .fu-board) .fu-row'), 10);
  assert.equal(q(p, '#modalCard .fu-mine .fu-me'), 1, 'rank 30 is pinned below the first page');
  assert.match(p.ev("document.querySelector('#modalCard .fu-mine').textContent"), /30/);
  p.ev("ACT.fuFold({k:'rows'})");
  assert.equal(q(p, '#modalCard .fu-board .fu-row'), 50);
  assert.equal(q(p, '#modalCard .fu-mine'), 0, 'in the list once it is all shown');
  assert.equal(q(p, '#modalCard .fu-row.fu-me'), 1);
  assert.deepEqual(p.errors, []);
  p = joined({ rank: 4 });
  p.ev("ACT.fuOpen({v:'boards'})"); await settle(p);
  assert.equal(q(p, '#modalCard .fu-mine'), 0);
  assert.equal(p.ev("[...document.querySelectorAll('#modalCard .fu-row')].findIndex(r=>r.classList.contains('fu-me'))"), 3, 'highlighted in place');
  p = joined({ rank: 63 });
  p.ev("ACT.fuOpen({v:'boards'})"); await settle(p);
  assert.equal(q(p, '#modalCard .fu-mine .fu-me'), 1, 'outside the top 50: pinned too');
  assert.deepEqual(p.errors, []);
});

test('looking glass and the players card show a first page', async () => {
  const p = joined();
  p.ev("ACT.fuOpen({v:'glass'})"); await settle(p);
  const nets = () => p.ev(`document.querySelectorAll('#modalCard .fu-list')[1].children.length`);
  assert.equal(nets(), 20);
  p.ev("ACT.fuFold({k:'nets'})");
  assert.equal(nets(), 30);
  p.ev('ACT.fuClose()');
  const card = () => p.ev("(()=>{const d=document.createElement('div');d.innerHTML=fedPlayCard();return d.querySelectorAll('[data-act=\"fpNet\"]').length})()");
  const first = card();
  p.ev("ACT.fpFold({k:'all'})");
  assert.equal(card() - first, 3, 'eight players: five, then all of them');
  assert.deepEqual(p.errors, []);
});
