const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Zoomed in, cable names sit on their cables. Where short cables crowd (the Philippine islands), a name that would
// land on another is left out, unless the cable touches the selected city.
const labels = (ev, sel) => JSON.parse(ev(`(()=>{ACT.start({});S.nextFail=1e9;S.nextEvent=1e9;UI.sel=${sel ? `{type:'city',id:'${sel}'}` : 'null'};
  cam.x=(CITY.mnl.x+CITY.dvo.x)/2;cam.y=(CITY.mnl.y+CITY.dvo.y)/2;cam.z=4.5;const out=[];
  ctx.fillText=(t,x,y)=>out.push({t,x,y,w:ctx.measureText(t).width});ctx.strokeText=()=>{};drawCables([0]);return JSON.stringify(out);})()`));

test('cable names never sit on top of each other', () => {
  const { ev, errors } = load();
  const L = labels(ev);
  assert.ok(L.length > 5, 'names are drawn');
  assert.ok(L.some(l => l.t === 'Pan de Sal Cable Network'), 'the domestic cables are named');
  const hit = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 6 && Math.abs(a.y - b.y) < 14;
  const clash = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (hit(L[i], L[j])) clash.push(`${L[i].t} / ${L[j].t}`);
  assert.deepEqual(clash, []);
  assert.deepEqual(errors, []);
});

test("a selected city's cables are always named", () => {
  const { ev, errors } = load();
  const plain = labels(ev).map(l => l.t), sel = labels(ev, 'ceb').map(l => l.t);
  for (const n of ['Pan de Sal Cable Network', 'Philippines Long Distance Relationship', 'Diverge VisMin Express']) assert.ok(sel.includes(n), n);
  assert.ok(sel.length >= plain.length);
  assert.deepEqual(errors, []);
});
