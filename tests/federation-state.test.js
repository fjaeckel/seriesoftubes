// S.fed, multiplayer's part of a save (docs/plans/federation.md, "State and saves"): null until a save joins, repaired
// by sanitize() like everything else from a save, joining only normal games, and the AI declaration only from the agent.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { fedPage, joinGame, settle, URL1, key, NOW } = require('./helpers/fed');

const J = (ev, src) => JSON.parse(ev(`JSON.stringify(${src})`));

test('a new game and an old save without it have no S.fed, and pay nothing for it', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  assert.equal(ev('S.fed'), null);
  const old = ev('(()=>{const s=JSON.parse(JSON.stringify(S));delete s.fed;return JSON.stringify(s);})()');
  assert.equal(ev(`migrate(JSON.parse(${JSON.stringify(old)})).fed`), null);
  assert.equal(ev('FED.live'), null);
  assert.deepEqual(errors, []);
});

test('sanitize() drops what is malformed, caps every list, and a broken key turns multiplayer off without deleting it', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  const pub = key('alice').pub, seed = key('alice').seed, bob = key('bob').pub;
  const fix = (fed) => J(ev, `(()=>{const s=JSON.parse(JSON.stringify(S));s.fed=${JSON.stringify(fed)};globalThis.__TUBES_WORKER__=1;sanitize(s);delete globalThis.__TUBES_WORKER__;return s.fed;})()`);
  for (const junk of ['yes', 7, [], true]) assert.equal(fix(junk), null);
  const urls = ['wss://a.example.net', 'http://b.example.net', 'wss://1.2.3.4', 'wss://a.example.net', 'wss://c.example.net', 'wss://d.example.net', 'wss://e.example.net', 'wss://f.example.net'];
  const muted = Array.from({ length: 600 }, (_, i) => i % 2 ? bob : 'nope' + i).concat([key('carol').pub]);
  const deal = { id: 'A'.repeat(43), deal: 'peering', key: bob, name: 'Bob Net', asn: 4281146038, start: NOW, end: null, terms: { at: ['fra'], via: 'ix' } };
  const f = fix({ on: true, key: { pub, priv: seed }, servers: urls, muted, ai: { model: '', harness: 'x' }, deals: [deal, deal, { id: 'x' }, { ...deal, id: 'B'.repeat(43), terms: { bad: null } }], share: 0, joined: -4, out: 'no' });
  assert.equal(f.on, true);
  assert.deepEqual(f.servers, ['wss://a.example.net', 'wss://c.example.net', 'wss://d.example.net', 'wss://e.example.net']);
  assert.deepEqual(f.muted, [bob, key('carol').pub]);
  assert.equal(f.ai, null, 'an empty model is no declaration');
  assert.equal(f.deals.length, 1);
  assert.equal(f.share, true);
  assert.equal(f.joined, 0);
  assert.deepEqual(f.out, []);
  // A broken key: off, deals and mutes kept, the key itself gone (joining makes a new one).
  const b = fix({ on: true, key: { pub: 'short', priv: seed }, servers: [urls[0]], deals: [deal], muted: [bob] });
  assert.equal(b.on, false);
  assert.equal(b.key, null);
  assert.equal(b.deals.length, 1);
  assert.deepEqual(b.muted, [bob]);
  // A public key without its private one (an ordinary export): detached, off.
  const d = fix({ on: true, key: { pub }, servers: [urls[0]] });
  assert.deepEqual([d.on, d.key], [false, { pub }]);
  assert.deepEqual(errors, []);
});

test('queued records survive only with their key, only this network\'s own, one stats at most', async () => {
  const p = fedPage();
  p.net.node(URL1).up = false;
  await joinGame(p);
  const out = await p.ev(`(async()=>{const a=await fedSignMine('stats',fedStatsBody());FED.now=()=>${NOW + 300};const b=await fedSignMine('stats',fedStatsBody());
    const other=${JSON.stringify(key('bob'))};return [a,b];})()`);
  const s = J(p.ev, `(()=>{const s=JSON.parse(JSON.stringify(S));s.fed.out=${JSON.stringify(out)}.concat([{v:1,kind:'stats',key:'${key('bob').pub}',t:1,body:{},sig:'x'},{nope:1}]);sanitize(s);return s.fed.out.map(r=>r.t);})()`);
  assert.deepEqual(s, [NOW + 300]);
  assert.deepEqual(p.errors, []);
});

test('only normal games may join: never a sandbox or open gates, a puzzle, a scenario or the weekly', async () => {
  const p = fedPage();
  p.ev("ACT.start({})");
  assert.equal(p.ev('fedMode(S)'), 'normal');
  const why = async (setup) => { p.ev(setup); return p.ev(`fedJoinWhy(${JSON.stringify(URL1)})`); };
  assert.equal(await why(''), null);
  assert.equal(await why("S.mode='sandbox';S.rules=makeRules('sandbox',{})"), 'mode');
  assert.equal(p.ev('fedMode(S)'), 'sandbox');
  assert.equal(await why("S.mode='normal';S.rules=makeRules('oncall',{});S.rules.gates='open'"), 'mode');
  assert.equal(p.ev('fedMode(S)'), 'open_gates');
  assert.equal(await why("S.rules=makeRules('oncall',{});S.scn={id:'weekly'}"), 'mode');
  assert.equal(p.ev('fedMode(S)'), 'weekly');
  assert.equal(await why("S.scn={id:'stg'}"), 'mode');
  assert.equal(p.ev('fedMode(S)'), 'scenario');
  assert.equal(await why("S.scn=null;S.mode='puzzle';S.pz={id:1}"), 'mode');
  assert.equal(p.ev('fedMode(S)'), 'puzzle');
  assert.equal(await why("S.mode='normal';delete S.pz;"), null);
  assert.equal(await p.ev("fedJoinWhy('ws://insecure.example.net')"), 'url');
  // A sandbox save that says it joined is off after loading.
  const s = J(p.ev, `(()=>{const s=JSON.parse(JSON.stringify(S));s.mode='sandbox';s.fed={on:true,key:${JSON.stringify({ pub: key('alice').pub, priv: key('alice').seed })},servers:['${URL1}']};sanitize(s);return s.fed;})()`);
  assert.equal(s.on, false);
  assert.deepEqual(p.errors, []);
});

test('joining makes a key pair once; its ASN is the one the spec derives; WebCrypto without Ed25519 means no multiplayer', async () => {
  const p = fedPage();
  p.net.node(URL1);
  assert.equal(await joinGame(p), null);
  const f = J(p.ev, 'S.fed');
  assert.equal(f.on, true);
  assert.match(f.key.pub, /^[A-Za-z0-9_-]{43}$/);
  assert.match(f.key.priv, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(f.joined, Math.floor(NOW / 86400));
  assert.equal(await p.ev(`fedSigner(S.fed.key.priv).then(k=>k.pub)`), f.key.pub, 'the seed is the key');
  const { asn } = require('./helpers/fed');
  assert.equal(await p.ev('fedAsn(S.fed.key.pub)'), asn(f.key.pub));
  await p.ev("fedJoin('wss://second.example.org/fed')");
  assert.equal(p.ev('S.fed.key.pub'), f.key.pub, 'a second server, the same identity');
  // A browser with no Ed25519: the game says why and nothing else changes.
  const q = load({ crypto: false });
  q.ev('ACT.start({})');
  assert.equal(await q.ev(`fedJoin(${JSON.stringify(URL1)})`), 'crypto');
  assert.equal(q.ev('S.fed'), null);
  assert.deepEqual(q.errors, []);
});

test('the AI declaration is written only by the agent facade, and never shows the private key to a tool', async () => {
  const { ev, errors } = load({ agent: true, crypto: true });
  ev('FED.WS=()=>({send(){},close(){}});FED.set=()=>0;FED.fetch=()=>Promise.reject(new Error("offline"))');
  ev('ACT.start({})');
  assert.equal(ev('S.fed'), null);
  const r = ev("JSON.stringify(TUBES.call('act',{action:'apiFedDeclare',args:{model:'example-model-1',harness:'my-harness'}}))");
  assert.ok(r);
  assert.deepEqual(J(ev, 'S.fed.ai'), { model: 'example-model-1', harness: 'my-harness' });
  assert.throws(() => ev("TUBES.call('act',{action:'apiFedDeclare',args:{model:''}})"));
  // A joined save played through tools is AI-played even before anyone declares it.
  ev("S.fed.ai=null");
  await ev("fedJoin('wss://relay.example.net/fed')");
  assert.equal(ev("S.fed.ai"), null);
  ev("TUBES.call('status',{})");
  assert.deepEqual(J(ev, 'S.fed.ai'), { model: 'undeclared', harness: 'tubes-mcp' });
  const st = ev("JSON.stringify(TUBES.call('state',{path:'fed'}))");
  assert.ok(!st.includes(ev('S.fed.key.priv')), 'the state tool never shows the private key');
  assert.ok(!ev("JSON.stringify(TUBES.call('state',{}))").includes(ev('S.fed.key.priv')));
  // The stats a joined save sends carry it.
  assert.deepEqual(J(ev, 'fedStatsBody().ai'), { model: 'undeclared', harness: 'tubes-mcp' });
  assert.deepEqual(errors, []);
});

test('the players\' page has no way to declare an AI', () => {
  const { ev } = load();
  assert.equal(ev("typeof ACT.apiFedDeclare"), 'undefined');
});
