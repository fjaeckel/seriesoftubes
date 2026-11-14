// Pie in the Sky globe (src/game/96-map/89-pie-globe.js): a loop only while open, nothing left behind once closed,
// a capped sample of pies, the night view, and no surprises from empty or broken data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const DATA = `({crusts:[{id:'short',alt:550,inc:53,n:1584,las:true},{id:'frozen',alt:560,inc:97.6,n:260,las:false},{id:'upper',alt:1100,inc:60,n:5000,las:true},{id:'flaky',alt:340,inc:42,n:3,las:false}],
  dishes:[{city:'fra',up:true},{city:'nyc',up:false},{city:'sin',lat:1.3,lon:103.8,up:true},{city:'nowhere'}],
  pads:[{city:'mia'},{city:'nowhere'}],launches:[{city:'mia',at:1},{id:7,rk:'punch',cr:'short',n:20,day:3,pad:'lis'},{pad:'mia'},{pad:'nowhere'}]})`;

// A page with a canvas in the document, rAF and listeners counted.
const open = [];
test.afterEach(() => { for (const p of open.splice(0)) { try { p.ev('pieGlobeClose()'); } catch (e) {} p.dom.window.close(); } });
function page(opts) {
  const p = load(opts);
  open.push(p);
  p.ev(`window.__raf=0;window.__caf=0;const _r=requestAnimationFrame,_c=cancelAnimationFrame;
    window.requestAnimationFrame=f=>{__raf++;return _r(f);};window.cancelAnimationFrame=i=>{__caf++;return _c(i);};
    const cvs=document.createElement('canvas');cvs.id='pgTest';document.body.appendChild(cvs);window.__ls=0;
    const a=cvs.addEventListener.bind(cvs),r=cvs.removeEventListener.bind(cvs);cvs.addEventListener=(k,f)=>{__ls++;a(k,f);};cvs.removeEventListener=(k,f)=>{__ls--;r(k,f);};
    window.__pgData=()=>${DATA};`);
  return p;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('opening starts one loop, closing stops it and removes every listener', async () => {
  const { ev, errors } = page();
  assert.equal(ev('PG.raf'), 0, 'nothing runs before it is opened');
  assert.equal(ev("pieGlobeOpen($('pgTest'),__pgData)"), true);
  assert.ok(ev('PG.raf') > 0);
  assert.ok(ev('__ls') >= 4, 'pointer listeners on the canvas');
  assert.equal(ev("$('pgTest').style.touchAction"), 'none');
  ev("pieGlobeOpen($('pgTest'),__pgData)"); // opening twice keeps one loop
  assert.ok(ev('__ls') >= 4 && ev('__ls') <= 6); // pointer events and the wheel (zoom)
  await wait(120);
  assert.ok(ev('__raf') >= 2, 'the loop keeps itself going while open');
  ev('pieGlobeClose()');
  assert.equal(ev('PG.raf'), 0);
  assert.equal(ev('PG.cv'), null);
  assert.equal(ev('__ls'), 0, 'every listener removed');
  const n = ev('__raf');
  await wait(120);
  assert.equal(ev('__raf'), n, 'no frame is requested once closed');
  ev('pieGlobeClose()'); // closing twice is fine
  assert.deepEqual(errors, []);
});

test('it draws a capped sample of every crust, beams, lasers and launches', () => {
  const { ev, errors } = page();
  ev("pieGlobeOpen($('pgTest'),__pgData);PG.anim=true");
  assert.equal(ev('pgFrame(1000,true)'), true);
  assert.ok(ev("$('pgTest').__ctx.calls.n") > 50, 'the frame really drew');
  const cnt = ev('JSON.stringify(PG.sm.map(c=>c.cnt))');
  const c = JSON.parse(cnt);
  assert.equal(c.length, 4);
  assert.equal(c[0], 160, 'a full Shortcrust shows the desktop cap');
  assert.equal(c[2], 160, 'more pies than a full crust: still the cap');
  assert.ok(c[1] > 6 && c[1] < 160, 'half a frozen crust shows a share of the cap');
  assert.equal(c[3], 3, 'never more dots than pies');
  assert.equal(ev('PG.dish.length'), 3, 'a dish at an unknown city is dropped');
  assert.equal(ev('PG.pads.length'), 1);
  assert.equal(ev('PG.lch.length'), 3, 'launches by city or by pad id; unknown cities dropped');
  // Satellites stay in their crust: radius 1 + alt/6371 x 2.6.
  const r = ev('const a=PG.sm[0].pos;Math.hypot(a[0],a[1],a[2])');
  assert.ok(Math.abs(r - (1 + 550 / 6371 * 2.6)) < 1e-4);
  for (let i = 1; i < 5; i++) ev(`pgFrame(${1000 + i * 40},true)`);
  ev('pieGlobeClose()');
  assert.deepEqual(errors, []);
});

test('fewer dots on phones', () => {
  const { ev, errors } = page();
  ev('window.innerWidth=390');
  ev("pieGlobeOpen($('pgTest'),__pgData);pgFrame(1000,true)");
  const c = JSON.parse(ev('JSON.stringify(PG.sm.map(c=>c.cnt))'));
  assert.ok(Math.max(...c) <= 80, 'at most 80 per crust on a phone: ' + c);
  assert.equal(c[0], 80);
  ev('pieGlobeClose()');
  assert.deepEqual(errors, []);
});

test('night view toggles, updates its button and is remembered on this device', () => {
  const { dom, ev, errors } = page();
  ev('ACT.start({})'); // the click delegate only runs game actions in a game
  ev("document.body.insertAdjacentHTML('beforeend',pieGlobeHtml())");
  const b = dom.window.document.querySelector('.pgnight');
  assert.equal(b.getAttribute('aria-pressed'), 'false');
  assert.equal(b.getAttribute('aria-label'), ev("tr('pie_globe.switch_to_night_view')"));
  ev("pieGlobeOpen(document.querySelector('.pgcv'),__pgData)");
  b.click();
  assert.equal(ev('PG.night'), true);
  assert.equal(b.getAttribute('aria-pressed'), 'true');
  assert.equal(b.getAttribute('aria-label'), ev("tr('pie_globe.switch_to_day_view')"));
  assert.equal(ev("localStorage.getItem('sot-globe')"), 'night');
  assert.equal(ev('pgFrame(2000,true)'), true, 'draws at night');
  ev('pieGlobeNight(false)');
  assert.equal(ev('PG.night'), false);
  assert.equal(ev('pgFrame(2100,true)'), true);
  ev('pieGlobeClose()');
  assert.deepEqual(errors, []);
});

test('empty, missing or broken data never throws', () => {
  const { ev, errors } = page();
  for (const d of ['null', '{}', '({crusts:[],dishes:[],pads:[],launches:[]})', '({crusts:[null,{id:"x",n:"lots"},{n:NaN},{id:"short",n:-5}],dishes:[null,{}],pads:7,launches:"x"})', '(()=>{throw new Error("boom")})()']) {
    ev(`pieGlobeOpen($('pgTest'),()=>${d})`);
    assert.equal(ev('pgFrame(1000,true)'), true, d);
    assert.equal(ev('PG.sm.length'), 0, d);
    ev('pieGlobeClose()');
  }
  ev("pieGlobeOpen($('pgTest'))");
  assert.equal(ev('pgFrame(1000,true)'), true);
  ev('pieGlobeClose()');
  assert.equal(ev('pieGlobeOpen(null,()=>({}))'), false);
  assert.equal(ev('PG.raf'), 0);
  assert.deepEqual(errors, []);
});

test('closed, it does no work at all; a canvas that leaves the page closes it', async () => {
  const { ev, errors } = page();
  ev("pieGlobeOpen($('pgTest'),__pgData);pgFrame(1000,true)");
  ev('pieGlobeClose()');
  const calls = ev("$('pgTest').__ctx.calls.n");
  assert.equal(ev('pgFrame(5000,true)'), false, 'a stray frame after closing draws nothing');
  await wait(80);
  assert.equal(ev("$('pgTest').__ctx.calls.n"), calls);
  // The panel was rebuilt and the canvas thrown away without a close: the next frame cleans up.
  ev("pieGlobeOpen($('pgTest'),__pgData);$('pgTest').remove()");
  assert.equal(ev('pgFrame(6000,true)'), false);
  assert.equal(ev('PG.cv'), null);
  assert.equal(ev('PG.raf'), 0);
  assert.equal(ev('__ls'), 0);
  // A hidden tab draws nothing.
  ev("const c2=document.createElement('canvas');c2.id='pg2';document.body.appendChild(c2);pieGlobeOpen(c2,__pgData);Object.defineProperty(document,'hidden',{configurable:true,get:()=>true})");
  assert.equal(ev('pgFrame(7000,true)'), false);
  ev('pieGlobeClose()');
  assert.deepEqual(errors, []);
});

test('the map shows a pie dish badge only where there is one, and never satellites', () => {
  const { ev, errors } = page();
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("const C=CITY.fra;cam.x=C.x;cam.y=C.y;cam.z=1.5;draw(0)");
  assert.equal(ev('CM.dish'), null, 'no pies: no lookup table at all');
  ev("S.pie={dishes:[{id:1,city:'fra',ant:2,down:0},{id:2,city:'ams',ant:1,down:S.day+5}]};draw(0)");
  assert.equal(ev("CM.dish.get('fra')"), true);
  assert.equal(ev("CM.dish.get('ams')"), false, 'a dish that is down shows grey');
  assert.equal(ev('PG.raf'), 0, 'the map never starts the globe');
  ev('S.pie=null;draw(0)');
  assert.deepEqual(errors, []);
});

test('the globe replays recent flights: a payload at the top, or a fireball partway up', () => {
  const { ev, errors } = page();
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;if(!S.pops.mia)ACT.buildPop({city:'mia'});ACT.pieFound();ACT.piePad({city:'mia'});closeModal()");
  assert.equal(ev('S.pie.pads.length'), 1);
  const fly = (rk, test, rnd) => ev(`{const m=Math.random;Math.random=()=>${rnd};try{pieFly({id:${Math.round(rnd * 100)},rk:'${rk}',cr:'short',n:20,day:S.day,pad:'mia',cost:1,test:${test}});}finally{Math.random=m;}}`);
  fly('falcon', false, 0.99);
  fly('heavy', true, 0.99);
  const flown = JSON.parse(ev('JSON.stringify(pieGlobeData().flown)'));
  assert.deepEqual(flown.map((f) => [f.pad, f.ok, f.rk]), [['mia', true, 'falcon'], ['mia', false, 'heavy']]);
  for (let i = 0; i < 8; i++) fly('falcon', false, 0.99);
  assert.equal(ev('pieGlobeData().flown.length'), 6, 'only the last six flights');
  ev('S.day+=61');
  assert.equal(ev('pieGlobeData().flown.length'), 0, 'old flights stop replaying');
  // Drawing: an ok flight, a reusable one, a crash and junk, across a whole replay cycle.
  ev(`pieGlobeOpen($('pgTest'),()=>({crusts:[],dishes:[],pads:[{city:'mia'}],launches:[],flown:[{pad:'mia',ok:true,rk:'falcon'},{pad:'mia',ok:true,rk:'again'},{pad:'mia',ok:false},{pad:'nowhere'},null]}));PG.anim=true`);
  for (let i = 0; i < 40; i++) assert.equal(ev(`pgFrame(${1000 + i * 160},true)`), true);
  assert.equal(ev('PG.fly.length'), 3, 'unknown pads dropped');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(PG.fly.map(f=>[f.ok,f.re]))')), [[true, false], [true, true], [false, false]]);
  ev('pieGlobeClose()');
  assert.deepEqual(errors, []);
});

test('continents clip cleanly at the rim: the fill never laps the globe, from any angle', () => {
  const { ev, errors } = load({ seed: 1 });
  // A pretend canvas that adds up how far each fill runs along the rim.
  const r = ev(`(()=>{pgVecs();const rec={arcs:[],moveTo(){},lineTo(){},closePath(){},arc(x,y,R,a,b,ccw){let s=ccw?a-b:b-a;this.arcs.push(s);}};
    const coast=new Path2D();let worst=0,where='',shapes=0;
    for(let tilt=-60;tilt<=60;tilt+=15)for(let yaw=0;yaw<360;yaw+=5){PG.yaw=yaw;PG.tilt=tilt;pgCam();
      for(let li=0;li<PG_LAND.length;li++){const ring=PG_LAND[li],n=ring.length/3;rec.arcs=[];pgLandRing(rec,pgRot(ring,pgBuf(n),n),n,PG_LAND_DIR[li],0,0,1,coast);
        const lap=rec.arcs.reduce((a,b)=>a+Math.abs(b),0);shapes++;if(lap>worst){worst=lap;where=LANDS_LL[li].id+' yaw '+yaw+' tilt '+tilt;}}}
    return {worst,where,shapes,dirs:PG_LAND_DIR.length===PG_LAND.length&&PG_LAND_DIR.every(d=>d===1||d===-1)};})()`);
  assert.ok(r.dirs, 'every land ring knows which way it turns');
  // A fill that runs all the way round the rim paints the whole globe green (Eurasia from the south used to).
  assert.ok(r.worst < 2 * Math.PI - 0.1, 'the longest run along the rim is ' + r.worst.toFixed(2) + ' rad, at ' + r.where);
  assert.ok(r.shapes > 1000);
  assert.deepEqual(errors, []);
});
