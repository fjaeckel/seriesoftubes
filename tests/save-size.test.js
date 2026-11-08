const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { until } = require('./net');
const { lit } = require('../scripts/lib/js-literal');

// Make the browser's storage refuse the save: 'QuotaExceededError' (too big) or 'SecurityError' (not allowed).
const refuse = name => `window.__err=${lit(name)};{const P=Object.getPrototypeOf(localStorage),set=P.setItem;
  P.setItem=function(k,v){if(k.startsWith('sot-save-v1')&&__err){const e=new Error('no');e.name=__err;throw e;}return set.call(this,k,v);};}`;

test('#176 a save that does not fit tells the player once, with Export, and the menu says so', () => {
  const { ev, dom, errors } = load();
  ev("ACT.start({});UI.saveFail=null;" + refuse('QuotaExceededError'));
  ev('S.cash++;save()');
  const toasts = () => [...dom.window.document.querySelectorAll('.toast')].filter(t => /not being saved/.test(t.textContent));
  assert.equal(toasts().length, 1, 'one warning');
  assert.match(toasts()[0].textContent, /too big for this browser/);
  assert.ok(toasts()[0].querySelector('[data-act=exportSave]'), 'with an Export button');
  ev('UI.saveFail.at-=1e6;save();save(true)');
  assert.equal(toasts().length, 1, 'not again for every retry');
  ev('ACT.menu()');
  const card = ev("document.getElementById('modalCard').innerHTML");
  assert.match(card, /not being saved/);
  assert.doesNotMatch(card, /saves itself every few seconds/, 'the menu no longer claims it saves');
  // Once a save works again, the menu goes back to normal.
  ev("__err=null;save(true);ACT.menu()");
  assert.equal(ev('saveFailing()'), false);
  assert.match(ev("document.getElementById('modalCard').innerHTML"), /saves itself every few seconds/);
  assert.deepEqual(errors, []);
});

test('#176 storage that is blocked altogether gets its own advice', () => {
  const { ev, dom, errors } = load();
  // The game moves on first: a save of the very text the slot already holds writes nothing.
  ev("ACT.start({});UI.saveFail=null;" + refuse('SecurityError') + ';S.cash+=1;save()');
  assert.match(dom.window.document.body.textContent, /private window/);
  assert.deepEqual(errors, []);
});

// A network with plenty of alien waves and ordinary customers, the shape of big late-game saves.
const bigBiz = "ACT.start({});S.cash=1e9;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});" +
  "S.links.push({id:'df1',a:'fra',b:'ams',kind:'df',own:true,km:450,sys:'roadm',ch:[],ready:0,mo:500,day:0,cut:0});" +
  "for(let i=0;i<300;i++){const slots=1+i%4;S.biz.push({id:'w'+i,city:'fra',city2:'ams',reqs:[],latMax:null,route:'normal',name:'Carrier '+i,type:'wwave',bw:1,rate:4000,mood:100-i%9*1.37,since:i,sites:null,link:'df1',slots,what:wwWhat(S.links.find(l=>l.id==='df1'),slots),pm:i%2?100:99,warned:i%5===0,warn60:false});}" +
  "S.biz.push({id:'l2',city:'fra',city2:'ams',reqs:['diverse'],latMax:3.2,route:'fast',name:'Fast Co',type:'hft',bw:5,rate:900,mood:80,since:0,sites:null,slots:0,pm:81,warned:false,warn60:true});" +
  "S.biz.push({id:'d1',city:'fra',city2:null,reqs:[],latMax:null,route:'normal',name:'Plain Co',type:'dia',bw:5,rate:600,mood:100,since:0,sites:null,slots:0});" +
  // Signed customers carry a contract (#178): when the term ends and the market it was priced in.
  "for(const b of S.biz)if(clOn(b)){b.te=400;b.mk=1;}compute()";
const sorted = "JSON.stringify(S.biz.map(b=>Object.keys(b).sort().map(k=>[k,b[k]])))";

test('#176 saves leave customer defaults out, and loading puts them back exactly', () => {
  const { ev, errors } = load();
  ev(bigBiz);
  const full = ev('JSON.stringify(S).length'), packed = ev('JSON.stringify(packSave(S)).length');
  assert.ok(packed < full * 0.75, `the save is much smaller (${packed} vs ${full})`);
  const before = ev(sorted);
  ev("save(true);S=migrate(loadSave());compute()");
  const after = JSON.parse(ev(sorted)), want = JSON.parse(before);
  // Customers that never got warnings or a previous mood come back with the defaults; everything else is identical.
  const norm = list => list.map(b => Object.fromEntries(b)).map(b => ({ pm: b.mood, warned: false, warn60: false, ...b }));
  assert.deepEqual(norm(after), norm(want));
  assert.equal(ev("S.biz.find(b=>b.id==='l2').route"), 'fast', 'a chosen route is kept');
  assert.equal(ev("S.biz.find(b=>b.id==='w7').what"), ev("wwWhat(S.links.find(l=>l.id==='df1'),4)"), 'alien waves get their description back');
  assert.match(ev("slotRaw(UI.slot)"), /"Carrier 1"/);
  assert.doesNotMatch(ev("slotRaw(UI.slot)"), /alien wave on your/, 'descriptions are not stored');
  assert.deepEqual(errors, []);
});

test('#176 an older, unpacked save still loads the same', () => {
  const { ev, errors } = load();
  ev(bigBiz);
  const before = ev(sorted);
  ev("S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  const norm = list => list.map(b => Object.fromEntries(b)).map(b => ({ pm: b.mood, warned: false, warn60: false, ...b }));
  assert.deepEqual(norm(JSON.parse(ev(sorted))), norm(JSON.parse(before)));
  assert.deepEqual(errors, []);
});

// Compressing runs in the background: wait for it, without depending on how long it takes.
// Waits for the page's async work (storage, channels) to land: up to 20 s, as a busy runner may need.
const settle = async (ev, cond, what) => assert.ok(await until(() => ev(cond)), what || cond);
const huge = "for(let i=0;i<12000;i++){const slots=1+i%4;S.biz.push({id:'h'+i,city:'fra',city2:'ams',name:'Huge Carrier '+i,type:'wwave',bw:1,rate:4000+i,mood:100,since:i,link:'df1',slots,what:wwWhat(S.links.find(l=>l.id==='df1'),slots)});}compute()";

test('#176 small saves stay plain JSON, written at once', () => {
  const { ev, errors } = load({ gzip: true });
  ev("ACT.start({});save(true)");
  assert.equal(ev("slotRaw(UI.slot)[0]"), '{');
  assert.deepEqual(errors, []);
});

test('#176 a huge save is gzipped into storage and the next visit loads it', async () => {
  const a = load({ gzip: true });
  a.ev(bigBiz + ';' + huge);
  assert.ok(a.ev('JSON.stringify(packSave(S)).length') >= a.ev('GZ_MIN'), 'big enough to compress');
  a.ev('save(true)');
  await settle(a.ev, "(slotRaw(UI.slot)||'').startsWith(GZ)");
  const raw = a.ev("slotRaw(UI.slot)"), full = a.ev('JSON.stringify(packSave(S)).length');
  assert.ok(raw.length < full / 4, `much smaller in storage (${raw.length} vs ${full})`);
  const before = a.ev("JSON.stringify([S.name,S.day,S.biz.length,S.biz.find(b=>b.id==='h77').what])");
  // The next visit: the page unpacks it before booting and continues the same network.
  const b = load({ gzip: true, storage: { 'sot-save-v1': raw } });
  await settle(b.ev, 'UI.started===true');
  assert.equal(b.ev("JSON.stringify([S.name,S.day,S.biz.length,S.biz.find(b=>b.id==='h77').what])"), before);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
});

test('#176 a newer save is never overwritten by an older one still compressing', async () => {
  const { ev, errors } = load({ gzip: true });
  ev(bigBiz + ';' + huge);
  ev("save(true);S.name='Newer';save(true);S.name='Newest';save(true)");
  await settle(ev, "!UI.gzBusy&&(slotRaw(UI.slot)||'').startsWith(GZ)");
  ev("gunzip(slotRaw(UI.slot)).then(t=>window.__t=JSON.parse(t).name)");
  await settle(ev, "!!window.__t");
  assert.equal(ev('__t'), 'Newest');
  // A new game started while a big save compresses: the old network does not come back.
  ev("save(true);ACT.newgame();ACT.start({});window.__new=S.name");
  await settle(ev, '!UI.gzBusy');
  assert.equal(ev("JSON.parse(slotRaw(UI.slot)).name"), ev('__new'), 'the new game stays saved');
  assert.deepEqual(errors, []);
});

test('#176 a damaged compressed save is kept, marked damaged, and the player is told', async () => {
  const { ev, dom, errors } = load({ gzip: true, storage: { 'sot-save-v1': 'gz:bm90IGd6aXA=' } });
  await settle(ev, "slotIdx().length===1&&/could not be/.test(document.getElementById('toasts').textContent)");
  assert.equal(ev("slotIdx()[0].broken"), true, 'listed as damaged, so it can still be exported or deleted');
  assert.equal(ev("slotRaw('main')"), 'gz:bm90IGd6aXA=', 'the damaged save is kept as it was');
  assert.equal(ev('!!UI.started'), false);
  assert.deepEqual(errors, []);
});

// A big network's autosave is compressed in the route worker (rwGzip()), not on the page: deflating it there held the
// page about as long as writing it plain. jsdom has no Worker: a second page answers as the worker, messages cloned
// both ways. A save as the page closes stays plain, and a worker lost mid-job leaves its job to the page.
test('a big autosave is compressed in the route worker and loads back; a closing save stays plain', async () => {
  const a = load({ gzip: true }), w = load({ gzip: true });
  for (const h of [a, w]) h.dom.window.structuredClone = globalThis.structuredClone;
  a.ev(bigBiz + ";for(let i=0;i<2500;i++){const slots=1+i%4;S.biz.push({id:'m'+i,city:'fra',city2:'ams',name:'Mid Carrier '+i,type:'wwave',bw:1,rate:4000+i,mood:100,since:i,link:'df1',slots,what:wwWhat(S.links.find(l=>l.id==='df1'),slots)});}compute()");
  const len = a.ev('JSON.stringify(packSave(S)).length');
  assert.ok(len >= a.ev('GZ_BG') && len < a.ev('GZ_MIN'), `between the two thresholds: ${len}`);
  a.ev("window.__q=[];window.__pz=0;const gp=gzPipe;gzPipe=(...x)=>{__pz++;return gp(...x);};rwOn=()=>!RW.dead;rwStart=()=>RW.w||(RW.w={postMessage:m=>__q.push(structuredClone(m)),terminate(){__q.length=0;}});");
  w.ev('window.__out=[];window.postMessage=(m)=>{__out.push(structuredClone(m));};');
  const pump = async () => { for (let k = 0; k < 200; k++) {
    while (a.ev('__q.length')) { w.dom.window.__m = a.ev('__q.shift()'); w.ev('rwServe(__m)'); }
    while (w.ev('__out.length')) { a.dom.window.__a = w.ev('__out.shift()'); a.ev('rwMsg(__a)'); }
    if (a.ev("(slotRaw(UI.slot)||'').startsWith(GZ)&&!UI.gzBusy")) return; await new Promise((r) => setTimeout(r, 5)); } };
  // Closing: plain text, at once.
  a.ev('save(true)');
  assert.equal(a.ev('slotRaw(UI.slot)[0]'), '{', 'a save as the page closes is written plain');
  // The autosave: compressed by the worker.
  a.ev("S.name='Worker Zip';save()");
  assert.equal(a.ev('__q.length'), 1, 'the text went to the worker');
  await pump();
  assert.ok(a.ev("slotRaw(UI.slot).startsWith(GZ)"), 'stored compressed');
  assert.equal(a.ev('__pz'), 0, 'nothing was deflated on the page');
  a.ev("gunzip(slotRaw(UI.slot)).then(t=>{const j=JSON.parse(t);window.__t=[j.name,j.day,j.biz.length].join('|');})");
  await settle(a.ev, '!!window.__t');
  assert.equal(a.ev('__t'), a.ev("[S.name,S.day,S.biz.length].join('|')"));
  // The worker lost while it compresses: the page compresses that save itself.
  a.ev("__pz=0;S.name='Page Zip';save();rwKill()");
  await settle(a.ev, "!UI.gzBusy&&__pz>0", 'compressed on the page');
  a.ev("window.__t=null;gunzip(slotRaw(UI.slot)).then(t=>window.__t=JSON.parse(t).name)");
  await settle(a.ev, '!!window.__t');
  assert.equal(a.ev('__t'), 'Page Zip');
  assert.deepEqual(a.errors, []);
  assert.deepEqual(w.errors, []);
});

// A big network that moved on since its last save is packed, turned into text and compressed by the route worker
// (rwSave()): the page copies the game over and writes what comes back. A paused game (same day) is still compared on
// the page, so an unchanged one is not written again. The worker lost mid-save: the next frame saves again, here.
test('a big game that moved on is saved by the route worker, a paused one is still compared on the page', async () => {
  const a = load({ gzip: true }), w = load({ gzip: true });
  for (const h of [a, w]) h.dom.window.structuredClone = globalThis.structuredClone;
  a.ev(bigBiz + ";for(let i=0;i<2500;i++){const slots=1+i%4;S.biz.push({id:'m'+i,city:'fra',city2:'ams',name:'Mid Carrier '+i,type:'wwave',bw:1,rate:4000+i,mood:100,since:i,link:'df1',slots,what:wwWhat(S.links.find(l=>l.id==='df1'),slots)});}compute()");
  a.ev("window.__q=[];window.__pk=0;const pk=packBiz;packBiz=b=>{__pk++;return pk(b);};rwOn=()=>!RW.dead;rwStart=()=>RW.w||(RW.w={postMessage:m=>__q.push(structuredClone(m)),terminate(){__q.length=0;}});");
  w.ev('window.__out=[];window.postMessage=(m)=>{__out.push(structuredClone(m));};');
  const pump = async (cond) => { for (let k = 0; k < 300; k++) {
    while (a.ev('__q.length')) { w.dom.window.__m = a.ev('__q.shift()'); w.ev('rwServe(__m)'); }
    while (w.ev('__out.length')) { a.dom.window.__a = w.ev('__out.shift()'); a.ev('rwMsg(__a)'); }
    if (a.ev(cond)) return; await new Promise((r) => setTimeout(r, 5)); } assert.fail('never: ' + cond); };
  // The first save of the session is made here, and tells the slot which day it holds.
  a.ev('save()'); await pump("!UI.gzBusy&&(slotRaw(UI.slot)||'').startsWith(GZ)");
  // A day later: the whole save goes to the worker.
  a.ev("__pk=0;S.day++;S.name='Moved On';save()");
  assert.equal(a.ev('__q.length&&!!__q[0].sv&&!!__q[0].S'), true, 'the game went to the worker');
  await pump("!UI.gzBusy&&SLOT.day[UI.slot]===S.day");
  assert.equal(a.ev('__pk'), 0, 'nothing was packed on the page');
  a.ev("window.__t=null;gunzip(slotRaw(UI.slot)).then(t=>{const j=JSON.parse(t);window.__t=[j.name,j.day,j.biz.length,!!j.sv].join('|');})");
  await settle(a.ev, '!!window.__t');
  assert.equal(a.ev('__t'), a.ev("[S.name,S.day,S.biz.length,true].join('|')"), 'the slot holds the game, stamped');
  assert.equal(a.ev('SLOT.txt[UI.slot]===JSON.stringify(packSave(S))'), true, 'the slot knows its text');
  a.ev('__pk=0');
  // Paused, nothing changed: compared on the page and not written again.
  a.ev("__pk=0;window.__w=0;const sp=slotPut;slotPut=(...x)=>{__w++;return sp(...x);};save()");
  assert.equal(a.ev('__q.length'), 0, 'nothing went to the worker');
  assert.ok(a.ev('__pk') > 0, 'packed here, to compare');
  assert.equal(a.ev('__w'), 0, 'the same game is not written again');
  // The worker lost while it saves: the next frame saves again.
  a.ev("S.day++;save();rwKill()");
  await settle(a.ev, '!UI.gzBusy');
  assert.equal(a.ev('UI.lastSave'), 0, 'the next frame saves again');
  assert.deepEqual(a.errors, []);
  assert.deepEqual(w.errors, []);
});

// Loaded from a big slot, the game's first save once it moves on already goes to the worker: the slot knows its day.
test('the first save after loading a big slot goes to the route worker once the game moves on', async () => {
  const a = load({ gzip: true });
  a.ev(bigBiz + ';' + huge);
  a.ev('save(true)');
  await settle(a.ev, "(slotRaw(UI.slot)||'').startsWith(GZ)");
  const b = load({ gzip: true, storage: { 'sot-save-v1': a.ev('slotRaw(UI.slot)') } });
  await settle(b.ev, 'UI.started===true');
  b.dom.window.structuredClone = globalThis.structuredClone;
  b.ev("window.__q=[];rwOn=()=>!RW.dead;rwStart=()=>RW.w||(RW.w={postMessage:m=>__q.push(structuredClone(m)),terminate(){}});");
  assert.equal(b.ev('SLOT.big[UI.slot]===true&&SLOT.day[UI.slot]===S.day'), true, 'the slot knows its day and size');
  b.ev('S.day++;save()');
  assert.equal(b.ev('__q.length===1&&!!__q[0].sv'), true, 'the whole save went to the worker');
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
});
