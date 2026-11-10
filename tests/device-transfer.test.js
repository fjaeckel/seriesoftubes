// Moving a network to another device (#263): the save file through the share sheet, or a link to paste. No server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { until } = require('./net');

const settle = async (ev, cond, what) => assert.ok(await until(() => ev(cond)), what || cond);
const SNAP = "JSON.stringify({day:S.day,cash:S.cash,pops:Object.keys(S.pops),links:S.links.length,biz:S.biz.length,name:S.name,hist:S.hist.length})";
/* A share sheet like Chromium's: no .json files, .txt yes. Calls are recorded; share() is called at once (a sheet only
   opens straight from the tap). window.__shareResult: 'ok', 'abort' or 'fail'. */
const CHROMIUM_SHARE = `navigator.canShare=d=>!!d&&Array.isArray(d.files)&&d.files.every(f=>/\\.txt$/.test(f.name));
  window.__shared=[];window.__shareResult='ok';
  navigator.share=d=>{__shared.push(d);return __shareResult==='ok'?Promise.resolve():Promise.reject(new DOMException('x',__shareResult==='abort'?'AbortError':'NotAllowedError'));};`;

async function sender(opts = {}) {
  const a = load({ gzip: true, ...opts });
  if (opts.share) a.ev(CHROMIUM_SHARE);
  a.ev("$('nmIn').value='Tube Mover';ACT.start({});S.cash=4321987;for(let i=0;i<40;i++)dayTick();save(true)");
  a.ev('ACT.xfer({})');
  await settle(a.ev, '!!UI.xfer', 'the send screen opens');
  return a;
}

test('the save file goes to the share sheet straight from the tap, as a .txt where .json cannot be shared, and loads on the other device', async () => {
  const a = await sender({ share: true });
  assert.match(a.ev("$('modalCard').textContent"), /Send the save file/);
  assert.equal(a.ev('UI.xfer.file.name'), 'series-of-tubes-tube-mover-' + a.ev('new Date().toISOString().slice(0,10)') + '.txt');
  a.ev(`document.querySelector('#modalCard [data-act="xferShare"]').click()`);
  assert.equal(a.ev('__shared.length'), 1, 'the sheet opens in the same tap, not after waiting for anything');
  assert.equal(a.ev('__shared[0].files[0]===UI.xfer.file'), true);

  // The file arrives on the other device and opens with Import a save.
  const txt = await a.dom.window.eval('__shared[0].files[0].text()'), want = a.ev(SNAP);
  const b = load({ gzip: true });
  b.dom.window.__txt = txt;
  b.ev("importFile(new File([__txt],'series-of-tubes-tube-mover.txt',{type:'text/plain'}))");
  await settle(b.ev, '!!UI.importing', 'it asks before loading');
  b.ev('ACT.importGo()');
  assert.equal(b.ev(SNAP), want, 'the same network, charts and all');
  // The picker takes the .txt that Chromium shares as well as .json.
  b.ev("HTMLInputElement.prototype.click=function(){window.__accept=this.accept;};ACT.importPick()");
  assert.match(b.ev('__accept'), /\.txt/);
  assert.match(b.ev('__accept'), /\.json/);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
});

test('a browser that shares .json gets the .json; one that cannot share files gets a download button', async () => {
  const a = load({ gzip: true });
  a.ev("navigator.canShare=()=>true;navigator.share=()=>Promise.resolve();ACT.start({});save(true);ACT.xfer({})");
  await settle(a.ev, '!!UI.xfer');
  assert.match(a.ev('UI.xfer.file.name'), /\.json$/);
  assert.equal(a.ev('UI.xfer.file.type'), 'application/json');

  const c = await sender();
  assert.equal(c.ev('UI.xfer.file'), null);
  assert.ok(c.ev(`!!document.querySelector('#modalCard [data-act="xferFile"]')`), 'Export save instead');
  assert.ok(!c.ev(`document.querySelector('#modalCard [data-act="xferShare"]')`));
  assert.match(c.ev("$('modalCard').textContent"), /Download the save file/);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(c.errors, []);
});

test('a share that fails falls back to the download; closing the sheet does nothing', async () => {
  const a = await sender({ share: true });
  a.ev("window.__dl=0;exportSlot=()=>{__dl++;}");
  a.ev("__shareResult='abort';ACT.xferShare()");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(a.ev('__dl'), 0, 'the player closed the sheet: nothing else happens');
  a.ev("__shareResult='fail';ACT.xferShare()");
  await settle(a.ev, '__dl===1', 'a refused share downloads the file instead');
  assert.deepEqual(a.errors, []);
});

test('one link carries the whole network: opened on another device it loads the same game, and leaves the address bar', async () => {
  const a = await sender();
  const link = a.ev('UI.xfer.link'), want = a.ev(SNAP);
  assert.ok(link.startsWith('https://tests.invalid/#sot1.'), link.slice(0, 40));
  const b = load({ gzip: true, url: link });
  assert.equal(b.ev('location.hash'), '', 'the network is taken out of the address bar at once');
  await settle(b.ev, '!!UI.importing', 'it asks before loading');
  assert.match(b.ev("$('modalCard').textContent"), /Tube Mover/);
  b.ev('ACT.importGo()');
  assert.equal(b.ev(SNAP), want);
  assert.equal(b.ev('slotIdx().length'), 1, 'it joins the networks on that device');

  // Pasted on the title screen, with whatever whitespace a clipboard adds.
  const c = load({ gzip: true });
  c.ev('ACT.xferRecv()');
  assert.ok(c.ev(`!!document.querySelector('#modalCard [data-act="importPick"]')`), 'Import a save is right there for the file');
  c.ev(`$('xferIn').value=${JSON.stringify('  ' + link + '\n')};ACT.xferPaste()`);
  await settle(c.ev, '!!UI.importing');
  for (const x of [a, b, c]) assert.deepEqual(x.errors, []);
});

test('bad or cut links say so and load nothing', async () => {
  const a = await sender();
  const link = a.ev('UI.xfer.link');
  const b = load({ gzip: true });
  b.ev("xferTake('https://example.com/nothing-here')");
  assert.match(b.ev('document.body.textContent'), /not a transfer link/);
  b.ev(`xferTake(${JSON.stringify(link.slice(0, -40))})`);
  await settle(b.ev, '/incomplete or damaged/.test(document.body.textContent)', 'a cut link is reported');
  assert.equal(b.ev('!!UI.importing'), false);
  assert.equal(b.ev('S'), null, 'nothing was loaded');
  assert.deepEqual(b.errors, []);
});

test('any network on the title screen can be sent without loading it, and the screen fits a 360 px phone', async () => {
  const a = await sender({ share: true });
  a.ev('ACT.toTitle()');
  const id = a.ev('slotIdx()[0].id');
  a.ev(`ACT.slotMenu({id:'${id}'})`);
  a.ev('window.innerWidth=360;UI.xfer=null');
  a.ev(`document.querySelector('#modalCard [data-act="xfer"]').click()`);
  await settle(a.ev, '!!UI.xfer', 'sent from storage');
  assert.equal(a.ev('S'), null, 'not loaded');
  assert.equal(a.ev('UI.xfer.name'), 'Tube Mover');
  assert.match(await a.dom.window.eval('UI.xfer.file.text()'), /"name":"Tube Mover"/);
  assert.ok(a.ev(`!!document.querySelector('#modalCard [data-act="xferShare"]')`));
  assert.ok(a.ev(`!!document.querySelector('#modalCard [data-act="xferLink"]')`));
  assert.deepEqual(a.errors, []);
});

test('without compression the file still goes, only the link is missing', async () => {
  const a = load();
  a.ev(CHROMIUM_SHARE + "ACT.start({});save(true);ACT.xfer({})");
  await settle(a.ev, '!!UI.xfer');
  assert.equal(a.ev('UI.xfer.link'), null);
  assert.ok(a.ev(`!!document.querySelector('#modalCard [data-act="xferShare"]')`));
  assert.ok(!a.ev(`document.querySelector('#modalCard [data-act="xferLink"]')`));
  assert.deepEqual(a.errors, []);
});
