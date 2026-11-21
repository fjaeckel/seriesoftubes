const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A line takes the short way round the map, so Seattle to Singapore runs off the left edge of Seattle's world copy.
// Zoomed in on Singapore that copy's world is off screen, and the line used to vanish with it (#446).
function game() {
  const t = load();
  t.ev("UI.startCity='sea';ACT.start({});if(UI.pendGame)ACT.pitchSkip();for(const g of GOALS)S.done[g.id]=0;");
  t.ev("ACT.buildPop({city:'sin'});S.links.push({id:'pac',a:'sea',b:'sin',kind:'wave',tier:1,km:13000,sub:true,cut:0,day:S.day,trench:'pac'});compute()");
  return t;
}
// Copies -3..3 in which some point of pts lands on screen.
const onScreen = (ev, pts) => JSON.parse(ev(`(()=>{const P=${JSON.stringify(pts)},on=[];for(let k=-3;k<=3;k++)if(P.some(p=>{const [x,y]=toS(p[0],p[1],k);return x>=0&&x<=CW&&y>=0&&y<=CH;}))on.push(k);return JSON.stringify(on);})()`));
const views = ['CITY.sin.x+60,CITY.sin.y,3', 'CITY.sin.x-200,CITY.sin.y,1.5', 'CITY.sea.x,CITY.sea.y,3', 'CITY.sin.x+300,CITY.sin.y-100,6', 'CITY.sin.x,CITY.sin.y,0.5'];

test('#446 a line across the map edge is drawn in every copy where it shows', () => {
  const { ev, errors } = game();
  const pts = JSON.parse(ev("JSON.stringify(mapLinks(S.day).GM.find((g,i)=>mapLinks(S.day).LG[i].some(l=>l.id==='pac')).pts)"));
  assert.ok(Math.min(...pts.map(p => p[0])) < 0, 'the Pacific line leaves its copy of the world');
  for (const v of views) {
    ev(`(()=>{const [x,y,z]=[${v}];cam.x=x;cam.y=y;cam.z=z;wrapCam();})()`);
    const need = onScreen(ev, pts), have = JSON.parse(ev('JSON.stringify(spanKs(mapLinks(S.day).xs))'));
    for (const k of need) assert.ok(have.includes(k), `view ${v}: copy ${k} shows the line but is not drawn (${have})`);
    ev('drawFrame(performance.now())');
  }
  // Tapping the line near Singapore still finds it.
  ev('cam.x=CITY.sin.x+60;cam.y=CITY.sin.y;cam.z=3;wrapCam()');
  const p = pts[pts.length - 2], k = onScreen(ev, [p])[0];
  assert.equal(ev(`(()=>{const q=toS(${p[0]},${p[1]},${k});return hitLink(q[0],q[1]);})()`), 'pac');
  assert.deepEqual(errors, []);
});

test('#446 cables across the map edge are drawn in every copy where they show', () => {
  const { ev, errors } = game();
  const pts = JSON.parse(ev('JSON.stringify(CABLE_PAIRS.flatMap(c=>c.pts))'));
  for (const v of views) {
    ev(`(()=>{const [x,y,z]=[${v}];cam.x=x;cam.y=y;cam.z=z;wrapCam();})()`);
    const need = onScreen(ev, pts), have = JSON.parse(ev('JSON.stringify(cabKs())'));
    for (const k of need) assert.ok(have.includes(k), `view ${v}: copy ${k} shows a cable but is not drawn (${have})`);
  }
  assert.deepEqual(errors, []);
});
