const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// An own subsea cable between Perth and Cape Town (8,891 km with the standard design), lit and ready, with its two POPs.
function cable(opts = {}) {
  const g = load(opts);
  g.ev(`ACT.start({});S.cash=1e10;S.lvl=13;for(const g of GOALS)S.done[g.id]=0;S.won=true;ACT.launchBB({city:'fra'});
    for(const c of ['per','cpt']){ACT.buildPop({city:c});S.pops[c].rgen=RG.length-1;}
    const q=seaQuote('per','cpt','standard');
    S.links.push({id:'sea1',a:'per',b:'cpt',kind:'df',own:true,sub:true,seaDesign:'standard',seaPath:q.pts.map(p=>p.slice()),sys:'roadm',ch:[],km:q.km,cable:null,cname:'Test',mo:1,trench:'own:sea1',cut:0,day:S.day,ready:0,spares:false,pairs:1});compute()`);
  g.km = g.ev('S.links[0].km');
  g.why = (o) => g.ev(`chWhy(S.links[0],'${o}')`);
  return g;
}

test('a plug-in optic that is too short for a subsea cable is not sent to upgrades that cannot stretch it (#253)', () => {
  const { ev, why, km, errors } = cable();
  assert.equal(km, 8891, 'Perth to Cape Town');
  for (const [o, max] of [['zr8', '5,400'], ['zr4', '4,500']]) {
    const w = why(o);
    assert.match(w, new RegExp(`reaches ${max} km on this cable; the route is 8,891 km`), `${o}: still says how far it reaches`);
    assert.doesNotMatch(w, /Consider submarine terminals/, `${o}: no advice that cannot help`);
    assert.match(w, /do not stretch this optic/, `${o}: says so`);
    assert.match(w, /These reach it: Sienna WaveMagic 1\.6T, Sienna WaveMagic 3\.2T\./, `${o}: and names what does reach`);
  }
  assert.equal(why('tp16'), '', 'the 1.6T transponder lights it, in its 800G mode');
  assert.equal(ev("optMode('tp16',S.links[0]).g"), 800);
  // The upgrades change nothing for the plug-ins, installed or not.
  ev("S.links[0].subterminal=0;S.links[0].subengineering=0");
  assert.match(why('zr8'), /do not stretch this optic/, 'with both upgrades installed the advice is the same');
  assert.deepEqual(errors, []);
});

test('an optic the upgrades can stretch still gets the advice to consider them, and the advice stops once they are in', () => {
  const { ev, why, errors } = cable();
  // A route of 21,000 km: the 1.6T needs engineering (22,500 km at 400G) or both upgrades; terminals alone reach 20,000.
  ev("S.links[0].km=21000");
  assert.match(why('tp16'), /Consider submarine terminals or optical engineering\./);
  assert.doesNotMatch(why('tp16'), /do not stretch/);
  assert.match(why('zr8'), /do not stretch this optic/, 'the plug-in on the same cable is told something else');
  ev("S.links[0].subengineering=0");
  assert.equal(why('tp16'), '', 'with optical engineering in service it is lit');
  assert.deepEqual(errors, []);
});

test('a consortium seat and a leased line keep their own message', () => {
  const { ev, why, errors } = cable();
  ev("S.links[0].seat=true");
  assert.match(why('zr8'), /Too far even at its slowest setting/);
  ev("S.links[0].seat=false;S.links[0].own=false");
  assert.match(why('zr8'), /Too far even at its slowest setting/);
  assert.deepEqual(errors, []);
});

test('the optics list on the cable shows the new hint under the plug-in and none under the transponder', () => {
  const { ev, dom, errors } = cable();
  ev("ACT.selLink({id:'sea1'})");
  const html = dom.window.document.getElementById('panelBody').innerHTML;
  const rows = html.split('<div class="row">').filter((r) => /Sizzle 800ZR\+|Ackackia 400ZR\+|Sienna WaveMagic 1\.6T/.test(r));
  const row = (n) => rows.find((r) => r.includes('<div class="nm">' + n)) || ''; // by the optic's own name: other rows name it in their hint
  assert.match(row('Sizzle 800ZR+'), /do not stretch this optic/);
  assert.match(row('Ackackia 400ZR+'), /do not stretch this optic/);
  assert.doesNotMatch(row('Sienna WaveMagic 1.6T'), /do not stretch|Consider submarine/);
  assert.doesNotMatch(dom.window.document.getElementById('panelBody').textContent, /Consider submarine terminals/, 'no wrong advice anywhere on the panel');
  assert.deepEqual(errors, []);
});

test('the hint reads right in every language', () => {
  for (const lang of ['it', 'pt', 'fr', 'es', 'de']) {
    const { why, errors } = cable({ lang });
    const w = why('zr8');
    assert.ok(!/\{[a-z]+\}|action_helpers\./.test(w), `${lang}: no raw placeholders or labels: ${w}`);
    assert.ok(w.includes('5.400') || w.includes('5,400') || w.includes('5 400') || w.includes('5 400'), `${lang}: the reach is in it: ${w}`);
    assert.ok(w.includes('Sienna WaveMagic 1.6T'), `${lang}: names the optics that reach`);
    assert.notEqual(w, cable().why('zr8'), `${lang}: translated`);
    assert.deepEqual(errors, [], lang);
  }
});
