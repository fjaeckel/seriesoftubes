// Moving a network to another device with QR codes or a link (#263): no server, the network travels in the link.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { load } = require('./harness');
const { until } = require('./net');

const settle = async (ev, cond, what) => assert.ok(await until(() => ev(cond)), what || cond);
const hash = (rows) => crypto.createHash('sha256').update(rows).digest('hex').slice(0, 16);

// Module matrices from Project Nayuki's reference encoder (qrcodegen), byte mode, one per mask.
const REF = [
  ['https://seriesoftub.es/#sot1.ab12c.0.3.HELLO-world_42', 'L', 3, ['30728883c56ec1b1', '18174c37d6786fa7', 'a981f41d89cceb7e', 'e28c29324d50ad09', 'd05a240976233180', 'd7ad281bfed61f9e', '083a4137b252f78f', 'a82468785d358d89']],
  ['x'.repeat(200), 'M', 10, ['750d745db4aee09b', '9ff2474eb4806262', 'c8294f9a437b1546', '1bf4d13e40b47c5f', 'fdce0323024df963', '87c3d49925e75834', 'b719f9e8d1b0dd89', '342f8ed986243039']],
  ['Series of Tubes '.repeat(40), 'L', 17, ['6d81d73a8426ecea', 'c36740777a080ce2', '79556df75d596a27', 'c4999ca1f4c7cdff', '23185df5abef3f74', '5b2fc9fa8d26aac0', '88b5814b383833f3', '298a1c7f2a08b6ae']],
  ['AS64512 '.repeat(120), 'L', 22, ['f8229058824f8960', '0c473ae025a4c779', '58c3ab340313be0a', 'd4fa9891688a1ccc', 'eaac167548e8e5f3', '3f14beb40d1dc4cf', 'a29dee8e6e34fd04', 'b0c682d9933fe28a']],
  ['peering '.repeat(360), 'L', 40, ['6efd1b3513f437d0', 'c18c188947dc52bc', 'cd93f7d4626a657f', 'a596a01654473a8d', '33fa5bbfe6b4915a', 'c547ade997387b9e', 'ed333919d660b05a', '44f32c8d979821a8']],
];

test('the QR encoder draws exactly the reference codes, for every mask, from version 3 to 40', () => {
  const { ev, errors } = load();
  for (const [s, ecc, v, masks] of REF) {
    masks.forEach((h, mask) => {
      const q = JSON.parse(ev(`(()=>{const q=qrEncode(new TextEncoder().encode(${JSON.stringify(s)}),{ecc:'${ecc}',mask:${mask}});return JSON.stringify({v:q.v,size:q.size,m:q.m.map(r=>r.map(b=>b?1:0).join('')).join('')});})()`));
      assert.equal(q.v, v, `${s.slice(0, 12)}… version`);
      assert.equal(q.size, v * 4 + 17);
      assert.equal(hash(q.m), h, `${s.slice(0, 12)}… ${ecc} mask ${mask}`);
    });
    // Left to choose, it picks one of the eight valid masks.
    const auto = JSON.parse(ev(`(()=>{const q=qrEncode(new TextEncoder().encode(${JSON.stringify(s)}),{ecc:'${ecc}'});return JSON.stringify({v:q.v,m:q.m.map(r=>r.map(b=>b?1:0).join('')).join(''),mask:q.mask});})()`));
    assert.equal(auto.v, v);
    assert.equal(hash(auto.m), masks[auto.mask]);
  }
  assert.equal(ev("qrEncode(new Uint8Array(2954))"), null, 'more than version 40 holds');
  assert.match(ev("qrSvg(qrEncode(new TextEncoder().encode('hi')),'x')"), /^<svg class="qr" viewBox="0 0 29 29"/);
  assert.deepEqual(errors, []);
});

// A network that has played a while, sent from page A.
async function sender() {
  const a = load({ gzip: true });
  a.ev("$('nmIn').value='Tube Mover';ACT.start({});S.cash=4321987;for(let i=0;i<40;i++)dayTick();save(true)");
  a.ev('ACT.xfer({})');
  await settle(a.ev, "!!document.querySelector('#modalCard svg.qr')", 'the codes are on screen');
  return a;
}

test('one link carries the whole network: opened on another device it loads the same game, and leaves the address bar', async () => {
  const a = await sender();
  const link = a.ev('UI.xfer.link'), want = a.ev("JSON.stringify({day:S.day,cash:S.cash,pops:Object.keys(S.pops),links:S.links.length,biz:S.biz.length,name:S.name})");
  assert.ok(link.startsWith('https://tests.invalid/#sot1.'), link.slice(0, 40));
  assert.ok(a.ev('UI.xfer.parts.length') > 1, 'a played network takes several codes');
  assert.ok(a.ev('UI.xfer.parts.every(p=>p.length<=qrCap(22))'), 'every code is small enough to scan from a phone screen');

  const b = load({ gzip: true, url: link });
  assert.equal(b.ev('location.hash'), '', 'the network is taken out of the address bar at once');
  await settle(b.ev, '!!UI.importing', 'it asks before loading');
  assert.match(b.ev("$('modalCard').textContent"), /Tube Mover/);
  assert.doesNotMatch(b.ev("$('modalCard').textContent"), /start fresh/, 'the link carries everything');
  const hist = a.ev('JSON.stringify(S.hist)'), log = a.ev('S.log.length');
  b.ev('ACT.importGo()');
  assert.equal(b.ev("JSON.stringify({day:S.day,cash:S.cash,pops:Object.keys(S.pops),links:S.links.length,biz:S.biz.length,name:S.name})"), want);
  assert.equal(b.ev('JSON.stringify(S.hist)'), hist, 'the charts came along');
  assert.equal(b.ev('S.log.length'), log + 1, 'the news came along (plus the welcome)');
  assert.equal(b.ev('slotIdx().length'), 1, 'it joins the networks on that device');
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
});

test('the codes arrive one by one, in any order; the network loads when the last one is in', async () => {
  const a = await sender();
  const parts = JSON.parse(a.ev('JSON.stringify(UI.xfer.parts)')), n = parts.length;
  // Paging through the codes on the sending device.
  a.ev('ACT.xferPage({i:1})');
  assert.match(a.ev("$('modalCard').textContent"), new RegExp(`Code 2 of ${n}`));

  const b = load({ gzip: true });
  const order = parts.map((p, i) => i).reverse();
  for (const [k, i] of order.entries()) {
    b.ev(`xferTake(${JSON.stringify(parts[i])})`);
    if (k < n - 1) {
      assert.match(b.ev("$('modalCard').textContent"), new RegExp(`${k + 1} of ${n} codes are here`));
      assert.equal(b.ev('document.querySelectorAll(".xfer-dots i.on").length'), k + 1);
      // The same code twice changes nothing.
      b.ev(`xferTake(${JSON.stringify(parts[i])})`);
      assert.equal(b.ev('Object.keys(xferStore().p).length'), k + 1);
    }
  }
  await settle(b.ev, '!!UI.importing', 'the last code opens the network');
  assert.equal(b.ev("localStorage.getItem('sot-xfer')"), null, 'the parts are cleaned up');
  assert.match(b.ev("$('modalCard').textContent"), /charts and news start fresh/, 'it says what the codes left out');
  const vol = a.ev('S.vol');
  b.ev('ACT.importGo()');
  assert.equal(b.ev('S.name'), 'Tube Mover');
  assert.equal(b.ev('S.cash'), a.ev('S.cash'));
  assert.equal(b.ev('S.day'), a.ev('S.day'));
  assert.equal(b.ev('S.vol'), vol, 'the traffic odometer keeps its count');
  assert.equal(b.ev('S.hist.length'), 0, 'only charts and news were left out');
  assert.equal(b.ev('S.log.length'), 1, 'the news starts with the welcome');
  b.ev('for(let i=0;i<3;i++)dayTick()');
  assert.equal(b.ev('S.hist.length'), 3, 'the charts start again');
  assert.deepEqual(b.errors, []);
});

test('a code from another transfer starts over, and bad or cut links say so and load nothing', async () => {
  const a = await sender();
  const parts = JSON.parse(a.ev('JSON.stringify(UI.xfer.parts)')), link = a.ev('UI.xfer.link');
  const b = load({ gzip: true });
  b.ev(`xferTake(${JSON.stringify(parts[0])})`);
  b.ev(`xferTake(${JSON.stringify(parts[1].replace(/#sot1\.[a-z0-9]+\./, '#sot1.zzzzz.'))})`);
  assert.equal(b.ev("xferStore().id"), 'zzzzz');
  assert.equal(b.ev('Object.keys(xferStore().p).length'), 1);
  b.ev('ACT.xferReset()');
  assert.equal(b.ev("localStorage.getItem('sot-xfer')"), null);

  b.ev("xferTake('https://example.com/nothing-here')");
  assert.match(b.ev("$('toasts')?$('toasts').textContent:document.body.textContent"), /not a transfer link/);
  b.ev(`xferTake(${JSON.stringify(link.slice(0, -40))})`);
  await settle(b.ev, "/incomplete or damaged/.test(document.body.textContent)", 'a cut link is reported');
  assert.equal(b.ev('!!UI.importing'), false);
  assert.equal(b.ev('S'), null, 'nothing was loaded');

  // Pasted into the box on the title screen, the whole link works too.
  b.ev('ACT.xferRecv()');
  b.ev(`$('xferIn').value=${JSON.stringify('  ' + link + '\n')};ACT.xferPaste()`);
  await settle(b.ev, '!!UI.importing');
  assert.deepEqual(b.errors, []);
});

test('any network on the title screen can be sent, and the codes fit a 360 px phone', async () => {
  const a = await sender();
  a.ev("ACT.toTitle()");
  const id = a.ev('slotIdx()[0].id');
  a.ev(`ACT.slotMenu({id:'${id}'})`);
  assert.ok(a.ev(`!!document.querySelector('#modalCard [data-act="xfer"]')`), 'the network menu offers it');
  a.ev('window.innerWidth=360;UI.xfer=null');
  a.ev(`document.querySelector('#modalCard [data-act="xfer"]').click()`);
  await settle(a.ev, '!!UI.xfer&&!!document.querySelector("#modalCard svg.qr")', 'sent from storage, without loading it');
  assert.equal(a.ev('UI.xfer.name'), 'Tube Mover');
  assert.ok(a.ev("!!document.querySelector('#modalCard .xfer-nav')"));
  const css = a.ev("[...document.styleSheets].flatMap(s=>[...s.cssRules]).map(r=>r.cssText).join('\\n')");
  assert.match(css, /svg\.qr\s*\{[^}]*max-width:\s*300px/, 'the code never gets wider than a small phone');
  assert.ok(a.ev(`!!document.querySelector('#modalCard [data-act="xferLink"]')`));
  assert.deepEqual(a.errors, []);
});

test('a year-old network takes a handful of codes, because the codes leave out charts and news', async () => {
  const a = load({ gzip: true });
  a.ev("ACT.start({});for(let i=0;i<365;i++)dayTick();save(true);ACT.xfer({})");
  await settle(a.ev, '!!UI.xfer');
  const n = a.ev('UI.xfer.parts.length'), full = Math.ceil(a.ev("UI.xfer.link.split('.').pop().length") / 900);
  assert.ok(n <= 4, `${n} codes`);
  assert.ok(full >= 2 * n, `the whole network would take ${full}`);
  assert.match(a.ev("$('modalCard').textContent"), /leave out your charts and news/);
  assert.deepEqual(a.errors, []);
});

test('without compression in the browser it says so instead of failing', () => {
  const { ev, errors } = load();
  ev("ACT.start({});save(true);ACT.xfer({})");
  assert.equal(ev('UI.xfer'), undefined);
  assert.match(ev('document.body.textContent'), /cannot pack networks into links/);
  assert.deepEqual(errors, []);
});
