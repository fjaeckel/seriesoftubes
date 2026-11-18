// Answering requests from other players on a phone (94-dashboard/92-fedplay.js, 90-actions/94-fedplay.js): the
// Multimode sheet's "Waiting for your answer" list answers in place, a tap on a requester opens that network's own
// sheet (by its key: ASNs can collide), which names it, shows what it asks and has a Back to the list where it was
// and a Next to the following request. Local state only: the federation's reads are fixed answers and signing is a
// stub, so nothing here opens a socket or reads a server.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { load } = require('./harness');

const J = JSON.stringify;
const K = (n) => crypto.createHash('sha256').update('fed-review-flow ' + n).digest('base64url');
// Hop Along and Hop Scotch share an ASN on purpose (§3.4: the key is who a network is, not its number).
const NETS = ['Ping Floyd', 'Packet Shakur', 'Hop Along', 'Hop Scotch', 'Routing Stones', 'Byte Club', 'Tubular Bells', 'Fiber Optimist']
  .map((name, i) => ({ key: K(i), name, asn: i === 3 ? 4200000102 : 4200000100 + i }));
const STUBS = `(()=>{const now=FED.now(),U1='wss://a.example/fed',N=${J(NETS)};
  const SRVS=[{id:'sA',name:'Packet Lunch',source:'registry',sync:'open',nodes:[{url:U1,key:${J(K('nA'))}}],operators:[${J(K('oA'))}],langs:['en'],noLogs:true,desc:'',answered:now-60}];
  window.RF={SRVS,N,U1};FU.can=true;FED.set=()=>0;FED.clear=()=>{};// no timers: nothing refreshes on its own
  Object.assign(window,{fedServers:async()=>SRVS.slice(),fedOpKey:async()=>null,fedGet:async()=>null,fedVotesTidy:async()=>{},fedShunned:async()=>[],fedHides:async()=>null,
    fedExclInfo:async()=>({shunned:false,confirmed:false,servers:[],reasons:[]}),fedAsn:async()=>4200000999,fedCatalogLoad:async()=>true,fedNetsStats:async()=>new Map(),
    fedWake:()=>{},fedPlayRefresh:async()=>{},fedPlayRun:async()=>{},fedRankView:async()=>null,
    fedSignMine:async(kind,body,f)=>({v:1,kind,key:f.key.pub,t:FED.now(),body,sig:'x'}),
    fedNetworks:async()=>N.map(n=>({key:n.key,srv:['sA'],quiet:{state:'active',factor:1000},rec:{t:now,body:{name:n.name,asn:n.asn,home:'DE',policy:'open',pops:['fra'],ix:['fra'],cust:1,day:10}}}))});})()`;
// Requests waiting for review, oldest first: [network index, deal]. Routing Stones asks twice.
const RQ = [[0, 'peering'], [1, 'transit'], [2, 'peering'], [3, 'peering'], [4, 'peering'], [4, 'transit']];

// A joined game on a phone held upright (360 px), the eight players in play, RQ waiting for this network's answer.
// The width is set after the game starts: a new game at 360 px in jsdom never gets past its first screen.
function joined() {
  const p = load();
  p.ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'})");
  p.ev('window.innerWidth=360;window.innerHeight=740');
  p.ev(STUBS);
  p.ev(`(()=>{const now=FED.now(),me=${J(K('me'))};
    S.fed={...fedNewState(),on:true,key:{pub:me,priv:${J(K('priv'))}},servers:[RF.U1],joined:Math.floor(now/86400)-40,deals:[]};
    FED.live={fed:S.fed,conns:new Map()};FED.st={[RF.U1]:{state:'connected',since:now-60,server:'sA',node:RF.U1}};
    S.fedn={h:'rf',nets:RF.N.map((n,i)=>({k:n.key,name:n.name,asn:n.asn,home:'DE',pops:['fra'],ix:['fra'],mix:[300,600,100],tr:1000*(i+1),cust:1,pol:'open',q:1000,st:'active',ai:false,t1:false,bid:'b'+i,at:now}))};
    const T={peering:{at:['fra'],via:'ix'},transit:{mbps:10000,perGbps:120,term:90,at:['fra']}};
    fedP().rq=${J(RQ)}.map(([n,deal],i)=>({id:'rq'+i,rec:{v:1,kind:'offer',key:RF.N[n].key,t:now-600+i,body:{deal,terms:T[deal]}}}));
    FEDN.h='';compute();})()`);
  assert.equal(p.ev('isPhone()'), true, 'a phone layout');
  assert.equal(p.ev('S.fedn.nets.length'), 8);
  return p;
}
// Lets the sheet's loads and the answers' promises finish (no timers run: FED.set is a stub).
const settle = async (p) => {
  for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 2)); if (p.ev('!!(FU.loading||FU.loadNext)')) await p.ev('FU.loading||null'); }
};
// Arrays made in the page are of its realm: read them back as JSON, so deepEqual compares only what they hold.
const js = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
const click = (p, sel) => p.ev(`(()=>{const b=document.querySelector(${J(sel)});if(!b)throw new Error('no button '+${J(sel)});b.click();})()`);
// Which sheet is open: the Multimode sheet's view, or a player network's sheet by the name in its title.
const sheet = (p) => p.ev("(()=>{const f=$('modalCard').querySelector('.fedui');return $('modal').hidden?'closed':f?'fu:'+f.dataset.fu:'net:'+$('modalCard').querySelector('h2').textContent.trim();})()");
// The Multimode sheet's list: each request row's network name, AS number and key fingerprint as shown.
const LIST = "#modalCard .fedui .fp-wait .fp-rq";
const listed = (p) => js(p, `[...document.querySelectorAll(${J(LIST)})].map(r=>r.querySelector('.fp-rqh .nm').textContent.split('·')[0].replace(/AS\\d+.*$/s,'').trim())`);
const meta = (p, i) => p.ev(`[...document.querySelectorAll(${J(LIST)})][${i}].querySelector('.fp-rqh .nm').textContent.replace(/\\s+/g,' ').trim()`);
const rowOf = (p, name) => { const i = listed(p).indexOf(name); assert.ok(i >= 0, name + ' waits in the list'); return i; };
const inRow = (p, name, sel) => {
  const i = rowOf(p, name);
  p.ev(`(()=>{const b=[...document.querySelectorAll(${J(LIST)})][${i}].querySelector(${J(sel)});if(!b)throw new Error('no '+${J(sel)}+' for '+${J(name)});b.click();})()`);
};
// A player network's sheet: its header (eyebrow), the requests of its own that wait (deal names), its Next button.
const eyebrow = (p) => p.ev("$('modalCard').querySelector('.eyebrow').textContent");
const own = (p) => js(p, "[...document.querySelectorAll('#modalCard .fp-wait .fp-rq .fp-rqh .nm')].map(x=>x.textContent.trim())");
const nextBtn = (p) => p.ev("(()=>{const b=$('modalCard').querySelector('.fp-next [data-act=\"fpNet\"]');return b?b.textContent.trim():null;})()");
const backInHead = (p) => p.ev("(()=>{const h=$('modalCard').firstElementChild,b=h&&h.querySelector(':scope>[data-act=\"fpBack\"]');return b?b.getAttribute('aria-label'):null;})()");
const fp = (k) => `#${k}`;

test('Accept and Decline in the waiting list answer that request and keep the list, even after another player\'s sheet was open', async () => {
  const p = joined();
  // Earlier, another player's sheet was open (from the players card: no Back, only ×) and closed with ×.
  await p.ev(`ACT.fpNet({key:RF.N[6].key})`);
  assert.equal(sheet(p), 'net:Tubular Bells');
  assert.equal(backInHead(p), null, 'opened from the players card: nothing to go back to');
  click(p, '#modalCard [data-act="closeModal"]');
  assert.equal(sheet(p), 'closed');
  // The pink Review button opens the Multimode sheet, where six requests from five networks wait.
  p.ev('ACT.fpQueue()'); await settle(p);
  assert.equal(sheet(p), 'fu:home');
  assert.deepEqual(listed(p), ['Ping Floyd', 'Packet Shakur', 'Hop Along', 'Hop Scotch', 'Routing Stones', 'Routing Stones']);
  inRow(p, 'Packet Shakur', '[data-act="fpAccept"]'); await settle(p);
  assert.equal(sheet(p), 'fu:home', 'the list stays: no other player\'s sheet opens over it');
  assert.deepEqual(js(p, "S.fed.deals.map(d=>[d.name,d.deal,d.st])"), [['Packet Shakur', 'transit', 'run']], 'the deal tapped, with the network tapped');
  assert.deepEqual(listed(p), ['Ping Floyd', 'Hop Along', 'Hop Scotch', 'Routing Stones', 'Routing Stones'], 'the answered request leaves the list at once');
  inRow(p, 'Hop Along', '[data-act="fpDecline"]'); await settle(p);
  assert.equal(sheet(p), 'fu:home');
  assert.deepEqual(listed(p), ['Ping Floyd', 'Hop Scotch', 'Routing Stones', 'Routing Stones']);
  assert.equal(p.ev("S.fedp.rq.some(q=>q.rec.key===RF.N[2].key)"), false, 'Hop Along\'s request is declined');
  assert.equal(p.ev("S.fedp.rq.some(q=>q.rec.key===RF.N[3].key)"), true, 'not the one of Hop Scotch, which shares its ASN');
  assert.deepEqual(p.errors, []);
});

test('With no other sheet opened before, an answer still takes its row off the list at once', async () => {
  const p = joined();
  p.ev('ACT.fpQueue()'); await settle(p);
  inRow(p, 'Ping Floyd', '[data-act="fpAccept"]'); await settle(p);
  assert.equal(sheet(p), 'fu:home');
  assert.equal(p.ev('S.fedp.rq.length'), 5);
  assert.deepEqual(listed(p), ['Packet Shakur', 'Hop Along', 'Hop Scotch', 'Routing Stones', 'Routing Stones'], 'the row goes, not only the request');
  assert.deepEqual(p.errors, []);
});

test('A requester\'s name opens that network\'s sheet by its key, with a Back to the list where it was', async () => {
  const p = joined();
  p.ev('ACT.fpQueue()'); await settle(p);
  assert.equal(sheet(p), 'fu:home');
  // Two networks share an ASN: each row says which is which by its key's fingerprint.
  const fpA = p.ev(`fedFp(RF.N[2].key)`), fpS = p.ev(`fedFp(RF.N[3].key)`);
  assert.notEqual(fpA, fpS);
  assert.match(meta(p, rowOf(p, 'Hop Along')), new RegExp(`^Hop Along AS4200000102 ${fp(fpA)} · `));
  assert.match(meta(p, rowOf(p, 'Hop Scotch')), new RegExp(`^Hop Scotch AS4200000102 ${fp(fpS)} · `));
  // Scrolled down the list, then the queue changes order under it (an answer elsewhere, a new request) before the tap.
  p.ev("$('modalCard').scrollTop=137");
  p.ev(`S.fedp.rq.reverse();S.fedp.rq.unshift({id:'rqX',rec:{v:1,kind:'offer',key:RF.N[5].key,t:FED.now(),body:{deal:'peering',terms:{at:['fra'],via:'ix'}}}})`);
  inRow(p, 'Hop Scotch', '.fp-who'); await settle(p);
  assert.equal(sheet(p), 'net:Hop Scotch', 'the network tapped, not the one now at that place in the queue nor its ASN twin');
  assert.match(eyebrow(p), new RegExp(`AS4200000102 ${fp(fpS)}`));
  assert.equal(p.ev("$('modalCard').scrollTop"), 0, 'the sheet starts at its top');
  assert.equal(backInHead(p), p.ev("tr('common.back')"), 'a Back in the header, next to ×');
  assert.deepEqual(own(p), [p.ev("fedDealName('peering')")], 'what Hop Scotch asks for, and nothing of Hop Along');
  assert.equal(p.ev("$('modalCard').querySelectorAll('.fp-wait [data-act=\"fpAccept\"]').length"), 1);
  click(p, '#modalCard [data-act="fpBack"]'); await settle(p);
  assert.equal(sheet(p), 'fu:home', 'back to the list');
  assert.equal(p.ev("$('modalCard').scrollTop"), 137, 'where it was');
  assert.equal(listed(p).length, 7, 'nothing answered on the way');
  assert.deepEqual(p.errors, []);
});

test('Next goes through every network that waits, in the list\'s order from the one tapped, then says nothing is left', async () => {
  const p = joined();
  p.ev('ACT.fpQueue()'); await settle(p);
  // Started in the middle of the list: Ping Floyd, above, is skipped for now.
  inRow(p, 'Packet Shakur', '.fp-who'); await settle(p);
  assert.equal(sheet(p), 'net:Packet Shakur');
  assert.equal(nextBtn(p), p.ev("tr('fedplay.next_waiting',{net:'Hop Along'})"), 'the network after it in the list is a tap away');
  click(p, '#modalCard .fp-wait [data-act="fpAccept"]'); await settle(p);
  assert.equal(sheet(p), 'net:Packet Shakur', 'an answer keeps this sheet');
  assert.deepEqual(own(p), [], 'its request answered');
  // Accept or Decline each in turn, from the sheet each Next opens: Routing Stones asks twice, then round to Ping Floyd.
  const steps = [['Hop Along', 'fpAccept'], ['Hop Scotch', 'fpDecline'], ['Routing Stones', 'fpAccept'], ['Routing Stones', 'fpAccept'], ['Ping Floyd', 'fpAccept']];
  for (const [i, [name, act]] of steps.entries()) {
    if (i === 0 || steps[i - 1][0] !== name) {
      assert.equal(nextBtn(p), p.ev(`tr('fedplay.next_waiting',{net:${J(name)}})`));
      click(p, '#modalCard .fp-next [data-act="fpNet"]'); await settle(p);
      assert.equal(sheet(p), 'net:' + name);
      assert.ok(backInHead(p), 'Back stays on the way');
    }
    click(p, `#modalCard .fp-wait [data-act="${act}"]`); await settle(p);
    assert.equal(sheet(p), 'net:' + name);
  }
  assert.equal(p.ev('S.fedp.rq.length'), 0);
  assert.equal(nextBtn(p), null);
  assert.equal(p.ev("$('modalCard').querySelector('.fp-next .empty').textContent"), p.ev("tr('fedplay.nothing_to_review')"));
  assert.deepEqual(js(p, "S.fed.deals.map(d=>[d.name,d.deal]).sort()"),
    [['Hop Along', 'peering'], ['Packet Shakur', 'transit'], ['Ping Floyd', 'peering'], ['Routing Stones', 'peering'], ['Routing Stones', 'transit']]);
  click(p, '#modalCard .fp-next [data-act="fpBack"]'); await settle(p);
  assert.equal(sheet(p), 'fu:home');
  assert.deepEqual(listed(p), [], 'nothing waits any more');
  assert.deepEqual(p.errors, []);
});
