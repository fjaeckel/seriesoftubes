const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})";
// Where a world point lands on screen, in whichever wrapped copy of the map is nearest the middle.
const onScreen = (ev, x, y) => JSON.parse(ev(`JSON.stringify([-1,0,1].map(k=>toS(${x},${y},k)).sort((p,q)=>Math.abs(p[0]-CW/2)-Math.abs(q[0]-CW/2))[0])`));
const ends = (ev, id) => JSON.parse(ev(`JSON.stringify((()=>{const l=S.links.find(x=>x.id==='${id}');return [CITY[l.a],CITY[l.b]].map(c=>[c.x,c.y]);})())`));
const inBox = (p, b, why) => assert.ok(p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3], `${why}: ${p} not in ${b}`);

test('Inspect on a congested link moves the map to that link', () => {
  const { ev, errors, dom } = load();
  ev(start);
  ev("S.links.push({id:'hot',a:'fra',b:'ams',kind:'wave',tier:0,km:400,mo:100,cut:0});R.load.hot=capOf(S.links.find(l=>l.id==='hot'))*0.95");
  ev("const C=CITY.syd;cam.x=C.x;cam.y=C.y;cam.z=0.8;UI.left='noc';UI.leftOpen=true;renderLeft()");
  ev("document.querySelector('#leftBody [data-act=selLink][data-args*=hot]').click()");
  assert.equal(ev('UI.sel.id'), 'hot');
  assert.ok(ev('cam.z') >= 1.2, 'a short link zooms in like a city does');
  const box = [0, 0, ev('CW'), ev('CH')];
  for (const [x, y] of ends(ev, 'hot')) inBox(onScreen(ev, x, y), box, 'both cities are on screen');
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('a long link zooms out to fit, and stays clear of a bottom sheet', () => {
  const { ev, errors, dom } = load();
  ev(start);
  ev("S.links.push({id:'far',a:'fra',b:'sin',kind:'wave',tier:0,km:10000,mo:100,cut:0})");
  // jsdom lays nothing out, so stand in for a phone's bottom sheet covering the lower 60% of the map.
  ev("$('panel').getBoundingClientRect=()=>({left:0,top:CH*0.4,width:CW,height:CH*0.6,right:CW,bottom:CH});cam.z=3");
  ev("ACT.selLink({id:'far'})");
  assert.ok(ev('cam.z') < 1.2, 'zoomed out for a long link');
  const box = [0, 0, ev('CW'), ev('CH*0.4')];
  for (const [x, y] of ends(ev, 'far')) inBox(onScreen(ev, x, y), box, 'both cities are above the sheet');
  // The drawn line, not just its ends, fits.
  for (const [x, y] of JSON.parse(ev("JSON.stringify(linkGeom(S.links.find(l=>l.id==='far')).pts)"))) inBox(onScreen(ev, x, y), box, 'the whole line is above the sheet');
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('a puzzle keeps its own framing when a link is opened', () => {
  const { ev, errors, dom } = load();
  ev("ACT.pzStart({id:'hello'})");
  ev("S.links.push({id:'pz',a:'nyc',b:'lon',kind:'wave',tier:0,km:5600,mo:100,cut:0})");
  const before = ev('JSON.stringify(cam)');
  ev("ACT.selLink({id:'pz'})");
  assert.equal(ev('UI.sel.id'), 'pz');
  assert.equal(ev('JSON.stringify(cam)'), before, 'the camera stays on the whole puzzle');
  assert.deepEqual(errors, []);
  dom.window.close();
});
