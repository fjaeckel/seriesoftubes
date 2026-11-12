// Shared saves and bug reports never carry a way to act as the network (docs/plans/federation.md, Identity): every
// export, every way, leaves out the private key and the queued signed records; only "Move to another device" keeps
// them, and only its import carries the identity over. Everything else imports detached.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, URL1 } = require('./helpers/fed');

async function joined() {
  const p = fedPage({ gzip: true });
  p.net.node(URL1).up = false;// offline: the queue keeps its records
  await joinGame(p);
  await p.ev(`(async()=>{fedQueue(await fedSignMine('stats',fedStatsBody()));})()`);
  // Every file the game would hand over, as {name, text}.
  p.ev('window.__files=[];saveDl=(txt,nm,fn)=>__files.push({name:fn||saveFileName(nm),text:txt});');
  return p;
}
const files = (p) => JSON.parse(p.ev('JSON.stringify(__files)'));

test('only the move file contains the private key; every other export, link and copy leaves it and the queue out', async () => {
  const p = await joined();
  const priv = p.ev('S.fed.key.priv'), pub = p.ev('S.fed.key.pub'), id = p.ev('UI.slot');
  assert.equal(p.ev('S.fed.out.length'), 1);
  const sig = p.ev('S.fed.out[0].sig');
  // The menu's Export save (also what the bug report form asks for).
  p.ev('exportSave()');
  // This network from the list of networks, and another network's slot read straight from storage.
  p.ev(`exportSlot(${JSON.stringify(id)})`);
  p.ev(`save(true);localStorage.setItem('sot-save-v1:other',localStorage.getItem('sot-save-v1:'+UI.slot));slotIdxPut(slotIdx().concat([{...slotIdx()[0],id:'other'}]))`);
  p.ev("exportSlot('other')");
  await settle();
  // The transfer to another device (share sheet file and link) and the agent's state tool are covered by the same strip.
  const xfer = await p.ev(`xferText(${JSON.stringify(id)})`);
  const xferOther = await p.ev("xferText('other')");
  p.ev('fedExportMove()');
  const out = files(p);
  assert.equal(out.length, 4);
  const [a, b, c, move] = out;
  for (const f of [a, b, c, { name: 'xfer', text: xfer }, { name: 'xfer other', text: xferOther }]) {
    assert.ok(!f.text.includes(priv), `${f.name}: no private key`);
    assert.ok(!f.text.includes(sig), `${f.name}: no queued signed record`);
    assert.ok(f.text.includes(pub), `${f.name}: the public key stays, so a bug reproduces with the network as others saw it`);
    assert.doesNotMatch(f.name, /PRIVATE/);
  }
  assert.match(move.name, /^series-of-tubes-.*-move-PRIVATE\.json$/);
  assert.ok(move.text.includes(priv));
  assert.ok(move.text.includes(sig));
  // The save in the browser's own storage keeps it, of course: that is where the identity lives.
  assert.ok(p.ev("localStorage.getItem('sot-save-v1:'+UI.slot)").includes(priv));
  assert.deepEqual(p.errors, []);
});

test('importing an ordinary export gives a detached save; joining it makes a new identity', async () => {
  const p = await joined();
  const pub = p.ev('S.fed.key.pub');
  p.ev('exportSave()');
  const txt = files(p)[0].text;
  // The same file even with the key pasted back in by hand: only a move file carries an identity over.
  const forged = JSON.stringify({ ...JSON.parse(txt), S: { ...JSON.parse(txt).S, fed: { ...JSON.parse(txt).S.fed, key: { pub, priv: p.ev('S.fed.key.priv') } } } });
  for (const t of [txt, forged]) {
    p.ev(`(()=>{const r=parseSave(${JSON.stringify(t)});UI.importing=r.s;ACT.importGo();})()`);
    await settle();
    assert.equal(p.ev('S.fed.on'), false);
    assert.equal(p.ev('S.fed.key.priv'), undefined);
    assert.equal(p.ev('S.fed.key.pub'), pub);
    assert.equal(p.ev('S.fed.out.length'), 0);
  }
  assert.equal(await p.ev(`fedJoin(${JSON.stringify(URL1)})`), null);
  assert.notEqual(p.ev('S.fed.key.pub'), pub, 'a new identity');
  assert.deepEqual(p.errors, []);
});

test('importing the move file carries the identity and the queue over', async () => {
  const p = await joined();
  const priv = p.ev('S.fed.key.priv');
  p.ev('fedExportMove()');
  const txt = files(p)[0].text;
  const q = fedPage();
  q.net.node(URL1).up = false;
  q.ev(`(()=>{const r=parseSave(${JSON.stringify(txt)});UI.importing=r.s;ACT.importGo();})()`);
  await settle();
  assert.equal(q.ev('S.fed.key.priv'), priv);
  assert.equal(q.ev('S.fed.on'), true);
  assert.equal(q.ev('S.fed.out.length'), 1);
  assert.deepEqual(q.errors, []);
});

test('a link from the transfer sheet imports detached too', async () => {
  const p = await joined();
  const t = await p.ev('xferText(UI.slot)');
  const s = JSON.parse(p.ev(`JSON.stringify(parseSave(${JSON.stringify(t)}).s.fed)`));
  assert.equal(s.on, false);
  assert.equal(s.key.priv, undefined);
});
