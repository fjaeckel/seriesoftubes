const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A level-6 Streaming service in Frankfurt with a big origin, live in Germany.
const start = () => {
  const page = load();
  page.ev("ACT.start({});ACT.charter({k:'content'});S.cash=1e9;S.lvl=6;ACT.cntLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});S.cnt.dc[S.home].t=3;S.day=100;compute()");
  return page;
};
// Regulation days, one after another, with nothing else of the day in the way.
const days = (ev, n) => ev(`for(let i=0;i<${n};i++){S.day++;cntRegDay(S.day);}`);

test('sending party pays bills every Gbps into the country, except what boxes inside its ISPs serve', () => {
  const { ev, errors } = start();
  ev("S.cnt.cc.DE.d=200;compute()");
  const before = ev("R.cost.content");
  ev("sppStart('DE',S.day);compute()");
  const base = ev("sppBase(R,'DE')");
  assert.ok(Math.abs(base - 200) < 1e-6, 'all of Germany comes from the origin');
  assert.ok(Math.abs(ev("R.cost.content") - before - base * ev('SPP_FEE')) < 1e-6);
  assert.match(ev("cntCard()"), /Sending party pays in Germany/);
  // A box inside a German ISP: what it serves is on-net, not interconnection.
  ev("S.cnt.box.push({id:'b1',city:S.home,net:boxNets(S.home)[0].id,day:0,f:1});compute()");
  const used = ev("R.useCache.b1");
  assert.ok(used > 0);
  assert.ok(Math.abs(ev("sppBase(R,'DE')") - (200 - used)) < 1e-6);
  assert.deepEqual(errors, []);
});

test('lobbying sends a fruit basket; the vote repeals the rule or keeps it, once', () => {
  const { ev, errors } = start();
  ev("S.cnt.cc.DE.d=200;sppStart('DE',S.day)");
  ev("checkGoals()");
  const cash = ev("S.cash");
  ev("ACT.cntSppLobby({cc:'DE'})");
  assert.equal(ev("S.cash"), cash - ev('SPP_LOB'));
  assert.equal(ev("S.cnt.rg.spp.DE.lob"), ev('S.day') + 20);
  assert.match(ev("cntCard()"), /vote is in 20 days/);
  ev("ACT.cntSppLobby({cc:'DE'})");
  assert.equal(ev("S.cash"), cash - ev('SPP_LOB'), 'one basket at a time');
  days(ev, 20);
  const G = JSON.parse(ev("JSON.stringify(S.cnt.rg)"));
  assert.ok(G.lob === 1 && !G.spp.DE || G.lob === 0 && G.spp.DE.fail === 1, JSON.stringify(G));
  if (G.spp.DE) { ev("ACT.cntSppLobby({cc:'DE'})"); assert.equal(ev("S.cnt.rg.spp.DE.lob"), 0, 'no second try'); }
  else assert.equal(ev("BADGES.find(b=>b.id==='cnt_basket').ok()"), true);
  assert.deepEqual(errors, []);
});

test('a fair share law comes only above 2% of a continent\'s evening peak, and sets the price if you ignore it', () => {
  const { ev, errors } = start();
  ev("S.rules.market=true;S.cnt.cc.DE.d=regPeak('EU')*0.019;compute()");
  days(ev, 300);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.cnt.rg.fs)")), {}, 'below the threshold, no law');
  assert.match(ev("cntCard()"), /share of Europe's evening peak/);
  ev("S.cnt.cc.DE.d=regPeak('EU')*0.03;compute()");
  days(ev, 300);
  const f = JSON.parse(ev("JSON.stringify(S.cnt.rg.fs.EU)"));
  assert.equal(f.st, 'fund', 'ignored, the regulator set the price');
  assert.equal(f.fee, Math.round(ev("fsFee('EU')") * ev('FS_IGNORE') / 100) * 100);
  ev("compute()");
  assert.ok(ev("R.cost.content") >= f.fee);
  assert.match(ev("cntCard()"), /Network fund in Europe/);
  assert.deepEqual(errors, []);
});

test('three comedic hearings, then a verdict: exempt, or the fund at a higher price', () => {
  const { ev, errors } = start();
  ev("S.cnt.cc.DE.d=regPeak('EU')*0.03;compute();fsStart('EU',S.day)");
  assert.match(ev("cntCard()"), /Fight it in three hearings/);
  const fee = ev("S.cnt.rg.fs.EU.fee");
  ev("ACT.cntFsHear({reg:'EU'})");
  assert.equal(ev("S.cnt.rg.fs.EU.st"), 'hear');
  days(ev, 10);
  assert.equal(ev("S.cnt.rg.fs.EU.n"), 1);
  assert.match(ev("cntCard()"), /1 of 3 held/);
  days(ev, 20);
  const f = JSON.parse(ev("JSON.stringify(S.cnt.rg.fs.EU)"));
  assert.equal(f.n, 3);
  assert.ok(f.st === 'ex' && ev("S.cnt.rg.fsWin") === 1 || f.st === 'fund' && f.fee === Math.round(fee * 1.5 / 100) * 100, JSON.stringify(f));
  assert.equal(ev("BADGES.find(b=>b.id==='cnt_tubes').ok()"), f.st === 'ex');
  assert.deepEqual(errors, []);
});

test('paying into the fund ends the negotiation at the price on the table', () => {
  const { ev, errors } = start();
  ev("S.cnt.cc.DE.d=regPeak('EU')*0.03;compute();fsStart('EU',S.day);ACT.cntFsPay({reg:'EU'})");
  assert.equal(ev("S.cnt.rg.fs.EU.st"), 'fund');
  assert.equal(ev("S.cnt.rg.fs.EU.fee"), ev("fsFee('EU')"));
  assert.deepEqual(errors, []);
});

test('no market, no new laws; carriers and old saves have none', () => {
  const { ev, errors } = start();
  ev("S.rules.market=false;S.cnt.cc.DE.d=regPeak('EU')*0.05;compute()");
  days(ev, 2000);
  assert.equal(ev("Object.keys(S.cnt.rg.fs).length+Object.keys(S.cnt.rg.spp).length"), 0);
  ev("S.rules.market=true");
  days(ev, 2000);
  assert.ok(ev("Object.keys(S.cnt.rg.fs).length+Object.keys(S.cnt.rg.spp).length") > 0, 'with a market, regulators notice');
  // An old save without regulation, and one with junk in it.
  const r = ev("(()=>{const s=JSON.parse(JSON.stringify(S));delete s.cnt.rg;sanitize(s);const t=JSON.parse(JSON.stringify(S));t.cnt.rg={spp:{XX:{day:1},DE:{day:'x',lob:-3}},fs:{EU:{st:'bogus'},AS:{st:'fund',fee:1e12}},lob:'many'};sanitize(t);return JSON.stringify([s.cnt.rg,t.cnt.rg]);})()");
  const [a, b] = JSON.parse(r);
  assert.deepEqual(a, { spp: {}, fs: {}, lob: 0, fsWin: 0 });
  assert.deepEqual(Object.keys(b.spp), ['DE']);
  assert.deepEqual(Object.keys(b.fs), ['AS']);
  assert.equal(b.fs.AS.fee, 1e8);
  assert.equal(b.lob, 0);
  const g = load();
  g.ev("ACT.start({});S.cash=1e9;compute()");
  assert.equal(g.ev("S.cnt"), undefined);
  assert.deepEqual(g.errors, []);
  assert.deepEqual(errors, []);
});

test('streaming badges count for a Streaming service only, and the share card shows its stats', () => {
  const { ev, errors } = start();
  ev("S.cnt.won=S.day;S.cnt.ic.org=3;S.cnt.ic.push=1;S.cnt.cc.DE.d=ccPot('DE');compute()");
  for (const id of ['cnt_mc', 'cnt_dark', 'cnt_fire', 'cnt_couch']) assert.equal(ev(`BADGES.find(b=>b.id==='${id}').ok()`), true, id);
  assert.equal(ev("BADGES.filter(b=>b.id.startsWith('cnt_')).length"), 8);
  assert.ok(ev("BADGES.filter(b=>b.id.startsWith('cnt_')&&b.secret).length") >= 2);
  const rows = JSON.parse(ev("(()=>{let rows=null;const f=cntShareRows;cntShareRows=g=>rows=f(g);shareCanvas();cntShareRows=f;return JSON.stringify(rows);})()"));
  assert.equal(rows[0][0], '📺 Must-Carry');
  assert.ok(rows.some(([k]) => k === 'Subscribers') && rows.some(([k]) => k === 'Live events streamed'));
  const g = load();
  g.ev("ACT.start({});S.cash=1e9;compute()");
  assert.equal(g.ev("BADGES.filter(b=>b.id.startsWith('cnt_')).some(b=>b.ok())"), false);
  assert.deepEqual(g.errors, []);
  assert.deepEqual(errors, []);
});
