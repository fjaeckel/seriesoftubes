// A dark fiber's side panel shows its capacity used against lit: what your traffic uses, what is left for it after
// managed waves (which the capacity line above already names), and everything the optics light.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// The big-network fixture's first two links become dark fiber of your own, each with four channels of the fastest optic
// that fits; the first also has 2 × 400G sold as managed waves.
const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const game = (t) => { const h = load({ seed: 777 }); t.after(() => h.dom.window.close());
  h.ev(`S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();
    for(const l of S.links.slice(0,2)){Object.assign(l,{kind:'df',own:true,sys:'roadm',ch:[],ready:0});
      let o=null,g=0;for(const k of Object.keys(OPT))if(!chWhy(l,k)){const m=optMode(k,l);if(m&&m.g>g){g=m.g;o=k;}}l.ch=[o,o,o,o];}
    {const l=S.links[0];S.biz.push({id:'mw',type:'mwave',link:l.id,slots:2,g:400,rate:5000,name:'Managed',city:l.a,city2:l.b,bw:1,reqs:[],mood:80,since:0,day:0,route:'normal',what:'x'});}
    compute();`); return h; };
const json = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));
// The panel's key-value rows for one link, as {label: value}.
const rows = (ev, i) => json(ev, `(()=>{selectLink(S.links[${i}].id);return Object.fromEntries([...$('panel').querySelectorAll('.kv')].map(k=>[k.children[0].textContent,k.children[1].textContent]));})()`);

test('with managed waves sold: used, left for your traffic and lit, and lit = left + managed', (t) => {
  const { ev, errors } = game(t);
  const r = rows(ev, 0), L = 'S.links[0]';
  assert.equal(r['Used by your traffic'], ev(`fmtG(R.load[${L}.id]||0)`));
  assert.equal(r['Left for your traffic'], ev(`fmtG(dfCap(${L}))`));
  assert.ok(ev("$('panel').textContent.includes('800G sold as managed waves')"), 'the managed waves, named once in the capacity line');
  assert.equal(r['Lit on this fiber'], ev(`fmtG(dfLit(${L}))`));
  assert.equal(ev(`dfLit(${L})-dfCap(${L})`), 800, 'managed waves come out of your own lit capacity');
  assert.deepEqual(errors, []);
});

test('without managed waves the capacity line says it all: no split', (t) => {
  const { ev, errors } = game(t);
  const r = rows(ev, 1);
  for (const k of ['Used by your traffic', 'Left for your traffic', 'Lit on this fiber']) assert.ok(!(k in r), k);
  assert.ok(ev("$('panel').textContent.includes(fmtG(R.load[S.links[1].id]||0)+' / '+fmtG(dfLit(S.links[1])))"), 'used / lit in the capacity line');
  assert.deepEqual(errors, []);
});

test('a fiber with nothing lit, or still being built, shows no split', (t) => {
  const { ev, errors } = game(t);
  const ch = ev('JSON.stringify(S.links[0].ch)');
  ev("S.links[0].ch=[];compute()");
  assert.ok(!('Lit on this fiber' in rows(ev, 0)), 'dark fiber, managed waves or not');
  ev(`S.links[0].ch=${ch};compute()`);
  assert.ok('Lit on this fiber' in rows(ev, 0), 'lit again');
  ev('S.links[0].ready=S.day+30;compute()');
  assert.ok(!('Lit on this fiber' in rows(ev, 0)), 'still being built');
  assert.deepEqual(errors, []);
});
