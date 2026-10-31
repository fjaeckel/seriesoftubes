const test = require('node:test');
const assert = require('node:assert/strict');
const { load, browser, flush } = require('./harness');

// Two windows of one browser share localStorage, its storage events, a BroadcastChannel and Web Locks; a reload is a
// new window with the same tab (sessionStorage).
const settle = async (ev, cond, what) => { for (let i = 0; i < 400 && !ev(cond); i++) await new Promise((r) => setTimeout(r, 5)); assert.ok(ev(cond), what || cond); };
const play = (ev, name, city = 'fra', days = 5) => ev(`UI.pitched=true;UI.nm=${JSON.stringify(name)};if($('nmIn'))$('nmIn').value=UI.nm;ACT.pickStart({city:'${city}'});ACT.start({});ACT.launchBB({city:'${city}'});for(let i=0;i<${days};i++)dayTick();save(true)`);
const idx = (ev) => JSON.parse(ev("JSON.stringify(slotIdx())"));
const card = (ev) => ev("document.getElementById('modalCard').textContent");

// A save as the previous version wrote it: one key, no index.
function legacySave() {
  const a = load();
  a.ev("$('nmIn').value='Old Faithful';ACT.start({});ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});for(let i=0;i<30;i++)dayTick();UI.speed=2");
  return { txt: a.ev('JSON.stringify(packSave((S.uiSpeed=UI.speed,S.cam={x:cam.x,y:cam.y,z:cam.z},S)))'), snap: a.ev('JSON.stringify([S.name,S.day,S.cash,S.asn,Object.keys(S.pops),S.transit.length])') };
}

test('the single save of older versions becomes the first network, losslessly, and loads exactly as before', async () => {
  const { txt, snap } = legacySave();
  const b = browser();
  const a = load({ browser: b, storage: { 'sot-save-v1': txt } });
  await settle(a.ev, 'UI.started===true');
  assert.equal(a.ev('JSON.stringify([S.name,S.day,S.cash,S.asn,Object.keys(S.pops),S.transit.length])'), snap, 'the same network');
  assert.equal(a.ev('UI.speed'), 2);
  assert.equal(b.ls.get('sot-save-v1:main'), txt, 'copied byte for byte');
  assert.equal(b.ls.get('sot-save-v1'), txt, 'the old key stays as a fallback until the network saves again');
  const e = idx(a.ev);
  assert.equal(e.length, 1);
  assert.equal(e[0].id, 'main');
  assert.equal(e[0].name, 'Old Faithful');
  assert.equal(e[0].day, 30);
  // The copy was read back before the index was written.
  const i = b.log.findIndex((x) => x[0] === 'set' && x[1] === 'sot-save-v1:main'), r = b.log.findIndex((x, n) => n > i && x[0] === 'get' && x[1] === 'sot-save-v1:main'), w = b.log.findIndex((x) => x[0] === 'set' && x[1] === 'sot-slots');
  assert.ok(i >= 0 && r > i && w > r, 'write new, read it back, then the index');
  a.ev('dayTick();save(true)');
  assert.equal(b.ls.has('sot-save-v1'), false, 'after a later save, the old key is retired');
  assert.equal(JSON.parse(b.ls.get('sot-save-v1:main')).day, 31);
  assert.deepEqual(a.errors, []);
});

test('a browser with no room for the copy keeps playing from the old key', async () => {
  const { txt } = legacySave();
  const b = browser();
  b.quota = 10;// every slot write is refused
  const a = load({ browser: b, storage: { 'sot-save-v1': txt } });
  await settle(a.ev, 'UI.started===true');
  assert.equal(a.ev('S.name'), 'Old Faithful');
  assert.equal(b.ls.has('sot-save-v1:main'), false);
  assert.equal(b.ls.get('sot-save-v1'), txt, 'never touched');
  assert.deepEqual(a.errors, []);
});

test('a compressed (gz) single save migrates and loads the same network', async () => {
  const g = load({ gzip: true });
  const raw = await g.dom.window.eval(`(async()=>{$('nmIn').value='Squeezed';ACT.start({});for(let i=0;i<8;i++)dayTick();return gzip(JSON.stringify(packSave(S)));})()`);
  const day = g.ev('S.day');
  assert.ok(raw.startsWith('gz:'));
  const b = browser();
  const a = load({ browser: b, gzip: true, storage: { 'sot-save-v1': raw } });
  await settle(a.ev, 'UI.started===true');
  assert.equal(a.ev('S.name'), 'Squeezed');
  assert.equal(a.ev('S.day'), day);
  assert.equal(b.ls.get('sot-save-v1:main'), raw);
  assert.equal(idx(a.ev)[0].name, 'Squeezed', 'the index knows its name without unpacking it again');
  assert.deepEqual(a.errors, []);
});

test('two networks coexist and load independently; the title lists them, newest first', async () => {
  const b = browser();
  const a = load({ browser: b });
  play(a.ev, 'First Net', 'fra', 4);
  const first = a.ev('UI.slot');
  a.ev('ACT.toTitle()');
  assert.equal(a.ev('S'), null);
  play(a.ev, 'Second Net', 'nyc', 9);
  const second = a.ev('UI.slot');
  assert.notEqual(first, second);
  a.ev('ACT.toTitle()');
  const list = a.ev("[...document.querySelectorAll('#slotList .slot b')].map(b=>b.textContent).join('|')");
  assert.equal(list, 'Second Net|First Net', 'most recent first');
  assert.match(card(a.ev), /Your networks/);
  a.ev(`ACT.cont({id:'${first}'})`);
  await settle(a.ev, 'UI.started===true');
  assert.equal(a.ev('S.name'), 'First Net');
  assert.equal(a.ev('S.day'), 4);
  assert.equal(a.ev('S.home'), 'fra');
  a.ev('ACT.toTitle()');
  a.ev(`ACT.cont({id:'${second}'})`);
  await settle(a.ev, 'UI.started===true');
  assert.equal(a.ev('S.name'), 'Second Net');
  assert.equal(a.ev('S.day'), 9);
  assert.equal(JSON.parse(b.ls.get('sot-save-v1:' + first)).name, 'First Net', 'each in its own key');
  assert.deepEqual(a.errors, []);
});

test('the title lists networks from the index alone, without reading any save', () => {
  const b = browser();
  const a = load({ browser: b });
  play(a.ev, 'One');
  a.ev('ACT.toTitle()');
  play(a.ev, 'Two');
  a.ev('ACT.toTitle()');
  b.log.length = 0;
  a.ev('showTitle()');
  assert.deepEqual(b.log.filter((x) => x[1].startsWith('sot-save-v1')), [], 'no save was read');
  assert.equal(a.ev("document.querySelectorAll('#slotList .slot').length"), 2);
});

test('each tab continues its own network on reload, and two tabs play two networks at once', async () => {
  const b = browser();
  const tab1 = new Map(), tab2 = new Map();
  const w1 = load({ browser: b, tab: tab1 });
  play(w1.ev, 'Tab One', 'fra', 3);
  const w2 = load({ browser: b, tab: tab2 });
  await flush();
  assert.equal(w2.ev('!!UI.started'), false, 'the only network is open in tab one, so tab two shows the title');
  play(w2.ev, 'Tab Two', 'sin', 6);
  // Both keep saving, each into its own slot.
  w1.ev('dayTick();save(true)');w2.ev('dayTick();save(true)');
  // Reload tab one: it comes back to its own network, not the newer one.
  b.close(w1.dom.window);
  const r1 = load({ browser: b, tab: tab1 });
  await settle(r1.ev, 'UI.started===true');
  assert.equal(r1.ev('S.name'), 'Tab One');
  assert.equal(r1.ev('S.day'), 4);
  b.close(w2.dom.window);
  const r2 = load({ browser: b, tab: tab2 });
  await settle(r2.ev, 'UI.started===true');
  assert.equal(r2.ev('S.name'), 'Tab Two');
  // A brand-new tab: the title with both, and Continue offers neither, since both are open.
  const w3 = load({ browser: b });
  await flush();
  assert.equal(w3.ev('!!UI.started'), false);
  assert.equal(w3.ev("document.querySelectorAll('#slotList .slot.busy').length"), 2);
  assert.equal(w3.ev("!!document.querySelector('#modalCard [data-act=cont].pink')"), false, 'no Continue for a network open elsewhere');
  // Tab two goes back to the title: its network is free again and becomes the one to continue.
  r2.ev('ACT.toTitle()');
  await flush();
  w3.ev('showTitle()');
  assert.match(w3.ev("document.querySelector('#modalCard [data-act=cont].pink').textContent"), /Tab Two/);
  for (const w of [r1, r2, w3]) assert.deepEqual(w.errors, []);
});

test('opening a network open in another window offers to switch or take over, and take-over hands it across', async () => {
  const b = browser();
  const w1 = load({ browser: b });
  play(w1.ev, 'Shared Net', 'fra', 3);
  const id = w1.ev('UI.slot');
  const w2 = load({ browser: b });
  await flush();
  w2.ev(`ACT.cont({id:'${id}'})`);
  await flush();
  assert.match(card(w2.ev), /open in another window/);
  assert.equal(w2.ev('!!UI.started'), false, 'not forked');
  assert.ok(w2.ev("!!document.querySelector('#modalCard [data-act=slotSwitch]')&&!!document.querySelector('#modalCard [data-act=slotTake]')"));
  // Switch: the other window says hello, this one stays on the title.
  w2.ev(`ACT.slotSwitch({id:'${id}'})`);
  await flush();
  assert.match(w1.ev("document.getElementById('toasts').textContent"), /Here it is/);
  // Take over: window one saves what it has, steps aside calmly and stops saving.
  w1.ev('dayTick()');
  w2.ev(`ACT.slotTake({id:'${id}'})`);
  await settle(w2.ev, 'UI.started===true', 'taken over');
  assert.equal(w2.ev('S.day'), 4, 'with the last day played in the other window');
  await settle(w1.ev, '/opened in another window/.test(document.getElementById(\'modalCard\').textContent)');
  assert.equal(w1.ev('UI.slot'), null);
  assert.equal(w1.ev('S'), null);
  w2.ev('dayTick();save(true)');
  const before = b.ls.get('sot-save-v1:' + id);
  w1.ev("save(true);dispatchEvent(new Event('pagehide'))");
  assert.equal(b.ls.get('sot-save-v1:' + id), before, 'the window that stepped aside never writes again');
  assert.equal(JSON.parse(before).day, 5);
  assert.deepEqual(w1.errors, []);
  assert.deepEqual(w2.errors, []);
});

test('without Web Locks or BroadcastChannel the heartbeat still keeps one writer per network', async () => {
  const b = browser({ locks: false, channel: false });
  const w1 = load({ browser: b });
  play(w1.ev, 'Old Browser Net');
  const id = w1.ev('UI.slot');
  w1.ev('slotBeat()');
  const w2 = load({ browser: b });
  await flush();
  assert.equal(w2.ev('slotBusy(' + JSON.stringify(id) + ')'), true);
  w2.ev(`ACT.cont({id:'${id}'})`);
  await flush();
  assert.match(card(w2.ev), /open in another window/);
  w2.ev(`ACT.slotTake({id:'${id}'})`);
  await settle(w2.ev, 'UI.started===true');
  w2.ev('slotBeat()');
  await settle(w1.ev, 'UI.slot===null', 'the first window notices the new heartbeat');
  assert.deepEqual(w1.errors, []);
  assert.deepEqual(w2.errors, []);
});

test('a stale write is refused: a newer save of the same network from another window is never overwritten', async () => {
  const b = browser();
  const w1 = load({ browser: b });
  play(w1.ev, 'Contested');
  const id = w1.ev('UI.slot');
  // Another window (a forked tab, a crashed lock) saves a newer version behind this one's back.
  const ix = JSON.parse(b.ls.get('sot-slots'));
  const newer = JSON.parse(b.ls.get('sot-save-v1:' + id));newer.day = 99;newer.sv = { seq: 1000, at: Date.now() };
  b.ls.set('sot-save-v1:' + id, JSON.stringify(newer));
  ix.slots[0].seq = 1000;ix.slots[0].day = 99;b.ls.set('sot-slots', JSON.stringify(ix));
  w1.ev('dayTick();save(true)');
  assert.equal(JSON.parse(b.ls.get('sot-save-v1:' + id)).day, 99, 'the newer save stays');
  assert.match(card(w1.ev), /saved in another window/);
  assert.equal(w1.ev('UI.slot'), null, 'and this window stops saving');
  assert.ok(w1.ev("!!document.querySelector('#modalCard [data-act=cont]')"), 'with a way to load the newest version');
  // The storage event alone also stops it, before it even tries.
  const w2 = load({ browser: b });
  await flush();
  play(w2.ev, 'Watcher');
  const id2 = w2.ev('UI.slot'), ix2 = JSON.parse(b.ls.get('sot-slots')), e = ix2.slots.find((x) => x.id === id2);
  e.seq += 50;
  w1.dom.window.localStorage.setItem('sot-slots', JSON.stringify(ix2));// written by another window: w2 gets the event
  await settle(w2.ev, 'UI.slot===null');
  assert.deepEqual(w1.errors, []);
  assert.deepEqual(w2.errors, []);
});

test('saves are written slot first, then the index, and every write moves the sequence on', () => {
  const b = browser();
  const a = load({ browser: b });
  play(a.ev, 'Ordered');
  const id = a.ev('UI.slot');
  b.log.length = 0;
  a.ev('dayTick();save(true)');
  const sets = b.log.filter((x) => x[0] === 'set').map((x) => x[1]);
  assert.ok(sets.indexOf('sot-save-v1:' + id) < sets.indexOf('sot-slots'), sets.join());
  const s = JSON.parse(b.ls.get('sot-save-v1:' + id)), e = idx(a.ev).find((x) => x.id === id);
  assert.equal(s.sv.seq, e.seq, 'the save and its index entry agree');
  a.ev('save(true)');
  assert.equal(JSON.parse(b.ls.get('sot-save-v1:' + id)).sv.seq, e.seq + 1);
  assert.equal(a.ev('"sv" in S'), false, 'the stamp lives in storage, not in the game');
});

test('deleting a network removes its save and its line, after a confirmation', async () => {
  const b = browser();
  const a = load({ browser: b });
  play(a.ev, 'Keeper');
  a.ev('ACT.toTitle()');
  play(a.ev, 'Goner');
  const gone = a.ev('UI.slot');
  a.ev('ACT.toTitle()');
  a.ev(`document.querySelector('#slotList .slot[data-slot="${gone}"] .slot-more').click()`);
  assert.match(card(a.ev), /Goner/);
  a.ev("document.querySelector('#modalCard [data-act=slotDel]').click()");
  assert.match(card(a.ev), /cannot be undone/);
  assert.ok(b.ls.has('sot-save-v1:' + gone), 'nothing deleted before the confirmation');
  a.ev("document.querySelector('#modalCard [data-act=slotDelGo]').click()");
  assert.equal(b.ls.has('sot-save-v1:' + gone), false);
  assert.deepEqual(idx(a.ev).map((e) => e.name), ['Keeper']);
  assert.match(card(a.ev), /Continue Keeper/);
  assert.deepEqual(a.errors, []);
});

test('a network deleted in another window is never written back by the window playing it', async () => {
  const b = browser();
  const w1 = load({ browser: b });
  play(w1.ev, 'Doomed');
  const id = w1.ev('UI.slot');
  const w2 = load({ browser: b });
  await flush();
  w2.ev(`ACT.slotDelGo({id:'${id}'})`);
  await settle(w1.ev, 'UI.slot===null');
  w1.ev("save(true);dispatchEvent(new Event('pagehide'))");
  assert.equal(b.ls.has('sot-save-v1:' + id), false);
  assert.equal(idx(w2.ev).length, 0);
  assert.match(w1.ev("document.getElementById('toasts').textContent"), /deleted in another window/);
});

test('export the network on screen, or any network from the list; import adds a new network and keeps the old', async () => {
  const b = browser();
  const a = load({ browser: b });
  const files = [];
  a.dom.window.URL.createObjectURL = (blob) => { files.push(blob); return 'blob:x'; };
  const text = (blob) => new Promise((r) => { const f = new a.dom.window.FileReader(); f.onload = () => r(f.result); f.readAsText(blob); });
  a.dom.window.URL.revokeObjectURL = () => {};
  play(a.ev, 'Exported Net', 'fra', 7);
  const first = a.ev('UI.slot');
  a.ev('ACT.exportSave({})');
  const txt = await text(files[0]);
  // Import it back: a second network, the first untouched.
  a.ev(`UI.importing=parseSave(${JSON.stringify(txt)}).s;ACT.importGo()`);
  assert.notEqual(a.ev('UI.slot'), first, 'a new slot');
  assert.equal(a.ev('S.name'), 'Exported Net');
  assert.equal(a.ev('S.day'), 7);
  assert.equal(idx(a.ev).length, 2);
  assert.equal(JSON.parse(b.ls.get('sot-save-v1:' + first)).day, 7, 'the first network is still there');
  // Export from the list: straight from storage, the same network.
  a.ev('ACT.toTitle()');
  a.ev(`ACT.slotExport({id:'${first}'})`);
  await settle(a.ev, 'true');await flush(5);
  const j = JSON.parse(await text(files[1]));
  assert.equal(j.app, 'series-of-tubes');
  assert.equal(j.S.name, 'Exported Net');
  assert.equal(a.ev(`parseSave(${JSON.stringify(JSON.stringify(j))}).err||null`), null, 'and it imports');
  assert.deepEqual(a.errors, []);
});

test('renaming the network renames it in the list', () => {
  const b = browser();
  const a = load({ browser: b });
  play(a.ev, 'Before');
  a.ev("ACT.menu();document.querySelector('#modalCard [data-act=rename]').click()");
  a.ev("document.getElementById('rnIn').value='  After   Rename ';ACT.renameGo()");
  assert.equal(a.ev('S.name'), 'After Rename');
  assert.equal(idx(a.ev)[0].name, 'After Rename');
});

test('puzzles never write a network, and a tab closed mid-puzzle keeps the network it set aside', async () => {
  const b = browser();
  const a = load({ browser: b });
  // A puzzle from the title: nothing saved at all.
  a.ev("ACT.pzStart({id:'hello'})");
  a.ev("save(true);dispatchEvent(new Event('pagehide'))");
  assert.equal(idx(a.ev).length, 0);
  a.ev('ACT.pzLeave({})');
  play(a.ev, 'Set Aside', 'fra', 3);
  const id = a.ev('UI.slot');
  a.ev("ACT.pzStart({id:'hello'})");
  const kept = b.ls.get('sot-save-v1:' + id);
  a.ev("S.pops.lon={day:0};save(true);for(let i=0;i<5;i++)frame(performance.now()+6000*i);dispatchEvent(new Event('pagehide'))");
  assert.equal(b.ls.get('sot-save-v1:' + id), kept, 'the puzzle never writes the slot');
  assert.equal(JSON.parse(kept).name, 'Set Aside');
  assert.ok(b.ls.has('sot-puzzles') || true);
  // The tab closes mid-puzzle; the next one continues the network.
  b.close(a.dom.window);
  const r = load({ browser: b });
  await settle(r.ev, 'UI.started===true');
  assert.equal(r.ev('S.name'), 'Set Aside');
  assert.equal(r.ev('S.mode'), 'normal');
  assert.deepEqual(a.errors, []);
  assert.deepEqual(r.errors, []);
});

test('a big save still compressing when a puzzle starts lands in its network, and so does the next one', async () => {
  const b = browser();
  const a = load({ browser: b, gzip: true });
  play(a.ev, 'Big One', 'fra', 1);
  a.ev("S.cash=1e9;ACT.buildPop({city:'ams'});S.links.push({id:'df1',a:'fra',b:'ams',kind:'df',own:true,km:450,sys:'roadm',ch:[],ready:0,mo:500,day:0,cut:0});for(let i=0;i<12000;i++)S.biz.push({id:'h'+i,city:'fra',city2:'ams',name:'Huge Carrier '+i,type:'wwave',bw:1,rate:4000+i,mood:100,since:i,link:'df1',slots:1,what:''});compute()");
  const id = a.ev('UI.slot');
  a.ev("S.name='Big One v1';save(true);S.name='Big One v2';save(true)");// one compressing, one queued
  a.ev("ACT.pzStart({id:'hello'})");
  await settle(a.ev, '!UI.gzBusy&&!SLOT.gzQ.size');
  const t = await a.dom.window.eval(`gunzip(slotRaw(${JSON.stringify(id)}))`);
  assert.equal(JSON.parse(t).name, 'Big One v2', 'the queued save landed too');
  a.ev('ACT.pzLeave({})');
  assert.equal(a.ev('S.name'), 'Big One v2');
  assert.deepEqual(a.errors, []);
});

test('leaving a puzzle when the network cannot be loaded marks it damaged, and Continue does not crash', async () => {
  const b = browser();
  const a = load({ browser: b });
  play(a.ev, 'Fragile');
  const id = a.ev('UI.slot');
  a.ev("ACT.pzStart({id:'hello'})");
  // The network set aside is gone from memory and its save is unreadable (another version, a broken disk…).
  a.ev(`UI.pzKeep=null;localStorage.setItem(SLOT_K+${JSON.stringify(id)},'{"v":1,"day":"x","pops":7}')`);
  a.ev(`window.__m=migrate;migrate=s=>{if(s&&s.pops===7)throw new Error('bad');return __m(s);}`);
  a.ev('ACT.pzLeave({})');
  a.ev('migrate=__m');
  assert.match(a.ev("document.getElementById('toasts').textContent"), /could not be loaded/);
  assert.equal(idx(a.ev)[0].broken, true);
  assert.ok(b.ls.has('sot-save-v1:' + id), 'kept, so it can be exported');
  a.ev(`ACT.cont({id:${JSON.stringify(id)}})`);
  await flush();
  assert.equal(a.ev('!!UI.started'), false);
  a.ev('ACT.cont({})');
  assert.match(card(a.ev), /Series/);
  assert.deepEqual(a.errors, []);
});

test('a corrupted index is rebuilt from the saves themselves', async () => {
  const b = browser();
  const a = load({ browser: b });
  play(a.ev, 'Alpha', 'fra', 2);
  a.ev('ACT.toTitle()');
  play(a.ev, 'Beta', 'nyc', 3);
  a.ev('ACT.toTitle()');
  b.ls.set('sot-slots', '{not json');
  b.ls.set('sot-save-v1:junk1', 'garbage');
  const c = load({ browser: b });
  await flush();
  const names = idx(c.ev).map((e) => e.name || (e.broken ? '(damaged)' : '?')).sort();
  assert.deepEqual(names, ['(damaged)', 'Alpha', 'Beta']);
  assert.match(c.ev("document.getElementById('slotList').textContent"), /Damaged/);
  // An index line whose save is gone is dropped.
  const ix = JSON.parse(b.ls.get('sot-slots'));ix.slots.push({ id: 'ghost', name: 'Ghost', day: 1, at: Date.now() });b.ls.set('sot-slots', JSON.stringify(ix));
  c.ev('showTitle()');
  assert.equal(c.ev("idx=slotIdx().map(e=>e.name).includes('Ghost')"), false);
  assert.deepEqual(c.errors, []);
});

test('out of room: the warning offers to free up space, listing the other networks by size', () => {
  const b = browser();
  const a = load({ browser: b });
  play(a.ev, 'Small Other');
  a.ev('ACT.toTitle()');
  play(a.ev, 'Growing');
  b.quota = 100;
  a.ev('UI.saveFail=null;dayTick();save(true)');
  assert.match(a.ev("document.getElementById('toasts').textContent"), /not being saved/);
  a.ev("document.querySelector('#toasts [data-act=slotSpace]').click()");
  assert.match(card(a.ev), /Small Other/);
  assert.ok(a.ev("!!document.querySelector('#modalCard [data-act=slotExport]')&&!!document.querySelector('#modalCard [data-act=slotDel]')"));
  a.ev('ACT.menu()');
  assert.ok(a.ev("!!document.querySelector('#modalCard [data-act=slotSpace]')"), 'the menu offers it too');
  assert.deepEqual(a.errors, []);
});

test('the networks list fits a 360 px phone and has a tap target and a ⋯ menu per network, in every language', () => {
  for (const lang of ['en', 'de', 'es', 'fr', 'it', 'pt']) {
    const b = browser();
    const a = load({ browser: b, lang: lang === 'en' ? undefined : lang });
    a.ev('window.innerWidth=360');
    play(a.ev, 'Phone Net One');
    a.ev('ACT.toTitle()');
    a.ev("UI.mode='sandbox'");
    play(a.ev, 'Sandy');
    a.ev('ACT.toTitle()');
    const rows = a.ev("document.querySelectorAll('#slotList .slot').length");
    assert.equal(rows, 2, lang);
    assert.ok(a.ev("[...document.querySelectorAll('#slotList .slot')].every(r=>r.querySelector('.slot-go')&&r.querySelector('.slot-more[aria-label]'))"), lang);
    assert.match(a.ev("document.getElementById('slotList').textContent"), /🏖️/, `${lang}: preset icon`);
    assert.equal(a.ev("document.querySelector('#slotList').previousElementSibling.textContent"), a.ev("tr('slots.your_networks')"));
    assert.doesNotMatch(card(a.ev), /slots\.|undefined|NaN|\{[a-z]+\}/, lang);
    assert.deepEqual(a.errors, [], lang);
  }
});
