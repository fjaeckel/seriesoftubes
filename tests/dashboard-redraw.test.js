// The NOC dashboard redraws after every day while it is open, so a tab must not pay for another tab's work: the
// traffic table is built for the Traffic tab only, and the connection list sorts on keys worked out once per row with
// one collator instead of localeCompare in its comparator. Both must show exactly what they showed before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const big = () => {
  const r = load({ seed: 777 });
  r.ev(`S=migrate(JSON.parse(${lit(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();renderAll();window.innerWidth=1280;`);
  return r;
};

test('the traffic table is built for the Traffic tab only', () => {
  const { ev, errors } = big();
  const calls = JSON.parse(ev(`(()=>{const real=dashNets,n={};let tab;dashNets=(...a)=>{n[tab]=(n[tab]||0)+1;return real(...a);};
    $('dash').hidden=false;for(const k of DTABS){tab=UI.dtab=k;UI._dh=null;renderDash();}$('dash').hidden=true;dashNets=real;return JSON.stringify(n);})()`));
  assert.deepEqual(calls, { traffic: 1 });
  // And the Traffic tab still lists the networks the big save sends traffic to.
  const rows = Number(ev(`(()=>{$('dash').hidden=false;UI.dtab='traffic';UI._dh=null;renderDash();const n=$('dashCard').querySelectorAll('tbody tr, .row').length;$('dash').hidden=true;return n;})()`));
  assert.ok(rows > 10, `traffic tab rows: ${rows}`);
  assert.deepEqual(errors, []);
});

test('the connection list keeps its order for every sort, both ways', () => {
  const { ev, errors } = big();
  for (const k of ['k', 'city', 'name', 'use', 'mo']) for (const dir of [1, -1]) {
    // The rows the tab shows, in order, against conns() sorted the way the list always sorted it.
    const got = JSON.parse(ev(`(()=>{UI.connSort='${k}';UI.connDir=${dir};UI.cf={};const d=document.createElement('div');d.innerHTML=connSection();
      return JSON.stringify([...d.querySelectorAll('tbody tr')].map(tr=>tr.querySelector('b').textContent));})()`));
    const want = JSON.parse(ev(`(()=>{const sk='${k}',dir=${dir},val=r=>sk==='city'?CITY[r.city].name:sk==='name'?r.name.toLowerCase():sk==='use'?(r.cap?r.use/r.cap:0):sk==='mo'?r.mo:CONN_ORD.indexOf(r.k);
      const rows=conns();rows.sort((a,b)=>{const A=val(a),B=val(b);return (A<B?-1:A>B?1:0)*dir||CONN_ORD.indexOf(a.k)-CONN_ORD.indexOf(b.k)||CITY[a.city].name.localeCompare(CITY[b.city].name)||a.name.localeCompare(b.name);});
      return JSON.stringify(rows.slice(0,listN('conn')).map(r=>r.name));})()`));
    assert.ok(got.length > 10, `${k} ${dir}: ${got.length} rows`);
    assert.deepEqual(got, want, `sort ${k} ${dir}`);
  }
  assert.deepEqual(errors, []);
});
