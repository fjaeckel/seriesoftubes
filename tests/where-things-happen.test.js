// Network operators' meetings only meet where they really do, and North Korea stays a trickle with no customers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = (ev) => ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;for(const g of GOALS)S.done[g.id]=0");

test('each network operators\' meeting only comes to a city where it really meets', () => {
  const { ev, errors } = load();
  start(ev);
  // the conference calendar
  assert.deepEqual(JSON.parse(ev("JSON.stringify(CONFS.filter(cf=>!nogOk(cf.n,cf.c)).map(cf=>cf.n+'@'+cf.c))")), []);
  // the rules themselves, on cities people know
  const ok = (n, c) => ev(`nogOk(${JSON.stringify(n)},${JSON.stringify(c)})`);
  for (const c of ['chi', 'ash', 'sea', 'hnl']) assert.ok(ok('NANOG 99', c), `NANOG in ${c}`);
  for (const c of ['lon', 'tor', 'mex']) assert.ok(!ok('NANOG 99', c), `no NANOG in ${c}`);
  for (const c of ['sin', 'tok', 'syd', 'akl', 'bom', 'suv']) assert.ok(ok('APRICOT 2027', c), `APRICOT in ${c}`);
  for (const c of ['sha', 'pek', 'hkg', 'dxb', 'hnl', 'fnj', 'fra']) assert.ok(!ok('APRICOT 2027', c), `no APRICOT in ${c}`);
  assert.ok(ok('DENOG 18', 'fra') && ok('DENOG 18', 'ber') && !ok('DENOG 18', 'ams'));
  assert.ok(ok('UKNOF 56', 'lon') && !ok('UKNOF 56', 'dub'));
  for (const c of ['ams', 'ber', 'nbo', 'dxb']) assert.ok(ok('RIPE 94', c), `RIPE in ${c}`);
  for (const c of ['nyc', 'sin', 'sao']) assert.ok(!ok('RIPE 94', c), `no RIPE in ${c}`);
  assert.ok(ok('DKNOG 16', 'cph') && !ok('DKNOG 16', 'sto'));
  // event customers: many offers in every kind of city, and no meeting lands in the wrong place
  ev("for(const c of ['sha','lag','sao','tok','fra','lon','cph','nyc','syd','dxb'])ACT.buildPop({city:c})");
  const bad = JSON.parse(ev(`(()=>{const bad=[];for(let i=0;i<600;i++){S.offers=[];S.usedNames=[];spawnSpecial('event');
    for(const o of S.offers){const n=BIZ_T.event.names.find(x=>o.name.startsWith(x));if(!n)bad.push('unnamed '+o.name);else if(!nogOk(n,o.city))bad.push(n+'@'+o.city);}}return JSON.stringify(bad);})()`));
  assert.deepEqual(bad, []);
  assert.deepEqual(errors, []);
});

test('North Korea moves well under 1 Gbps and no customer calls from there', () => {
  const { ev, errors } = load();
  start(ev);
  // the most broadband Pyongyang can ever grow to, in the last traffic era and during a viral hit
  ev("S.lvl=LEVELS.length;S.won=true");
  assert.ok(ev("eyeP('fnj')*1.25") < 1, `eyeballs at most ${ev("eyeP('fnj')")} Gbps`);
  ev("ACT.buildPop({city:'fnj'});ACT.launchBB({city:'fnj'})");
  assert.ok(ev("!!(S.pops.fnj&&S.pops.fnj.bb)"), 'a POP with broadband in Pyongyang');
  // an old save that grew far more there shrinks back toward the cap
  ev("S.pops.fnj.bb.d=4;for(let i=0;i<200;i++)dayTick()");
  assert.ok(ev("S.pops.fnj.bb.d") <= ev("eyeP('fnj')") + 1e-9, `${ev("S.pops.fnj.bb.d")} Gbps after 200 days`);
  // no offer of any kind, even with your POP there and plenty of others to choose from
  ev("for(const c of ['fra','lon','ams','sin','tok','nyc','icn'])ACT.buildPop({city:c})");
  const hit = ev("(()=>{let n=0;for(let i=0;i<1500;i++){S.offers=[];spawnOffer();for(const t of ['event','sdwan'])spawnSpecial(t);for(const o of S.offers)if(o.city==='fnj'||o.city2==='fnj'||(o.sites||[]).includes('fnj'))n++;}return n;})()");
  assert.equal(hit, 0);
  assert.ok(!ev("OFFC.includes('fnj')"));
  assert.deepEqual(errors, []);
});
