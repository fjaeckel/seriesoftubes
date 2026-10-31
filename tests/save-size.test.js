const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Make the browser's storage refuse the save: 'QuotaExceededError' (too big) or 'SecurityError' (not allowed).
const refuse = name => `window.__err=${JSON.stringify(name)};{const P=Object.getPrototypeOf(localStorage),set=P.setItem;
  P.setItem=function(k,v){if(k.startsWith('sot-save-v1')&&__err){const e=new Error('no');e.name=__err;throw e;}return set.call(this,k,v);};}`;

test('#176 a save that does not fit tells the player once, with Export, and the menu says so', () => {
  const { ev, dom, errors } = load();
  ev("ACT.start({});UI.saveFail=null;" + refuse('QuotaExceededError'));
  ev('save()');
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
  ev("ACT.start({});UI.saveFail=null;" + refuse('SecurityError') + ';save()');
  assert.match(dom.window.document.body.textContent, /private window/);
  assert.deepEqual(errors, []);
});

// A network with plenty of alien waves and ordinary customers, the shape of big late-game saves.
const bigBiz = "ACT.start({});S.cash=1e9;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});" +
  "S.links.push({id:'df1',a:'fra',b:'ams',kind:'df',own:true,km:450,sys:'roadm',ch:[],ready:0,mo:500,day:0,cut:0});" +
  "for(let i=0;i<300;i++){const slots=1+i%4;S.biz.push({id:'w'+i,city:'fra',city2:'ams',reqs:[],latMax:null,route:'normal',name:'Carrier '+i,type:'wwave',bw:1,rate:4000,mood:100-i%9*1.37,since:i,sites:null,link:'df1',slots,what:wwWhat(S.links.find(l=>l.id==='df1'),slots),pm:i%2?100:99,warned:i%5===0,warn60:false});}" +
  "S.biz.push({id:'l2',city:'fra',city2:'ams',reqs:['diverse'],latMax:3.2,route:'fast',name:'Fast Co',type:'hft',bw:5,rate:900,mood:80,since:0,sites:null,slots:0,pm:81,warned:false,warn60:true});" +
  "S.biz.push({id:'d1',city:'fra',city2:null,reqs:[],latMax:null,route:'normal',name:'Plain Co',type:'dia',bw:5,rate:600,mood:100,since:0,sites:null,slots:0});compute()";
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
const settle = async (ev, cond) => { for (let i = 0; i < 400 && !ev(cond); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(ev(cond), cond); };
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
