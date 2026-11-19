// The Streaming service tells its own story: its level names, quotes and honest "Next:" lines, its level-up toast, and a
// first-steps guide in the tutorial's coach whose glow always sits on a real button, on a phone and on a desktop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = () => {
  const page = load();
  page.ev("ACT.start({});ACT.charter({k:'content'});S.cash=1e9;compute();renderAll()");
  return page;
};

test('the level card, the Deals tab and the level-up toast tell the streaming story', () => {
  const { ev, errors } = start();
  ev("S.lvl=3;renderAll()");
  const card = ev("lvlCard()");
  assert.match(card, /Audience level 3 of 13/);
  assert.ok(card.includes(ev("tr('streaming_story.lv03')")));
  assert.ok(card.includes(ev("esc(tr('streaming_story.lv03_q'))")));
  assert.ok(card.includes(ev("esc(tr('streaming_story.lv04_u'))")), 'Next: names what level 4 unlocks');
  assert.doesNotMatch(card, /Customer level|customers/i);
  assert.match(ev("dlLvl()"), /Audience level 3: Binge Factory/);
  ev("S.lvl=13");
  assert.ok(ev("lvlCard()").includes(ev("tr('streaming_story.all_unlocked')")));
  // A level up toasts the streaming name and what it unlocks.
  ev("S.lvl=1;S.stats.peak=1e6;ACT.buyTransit({city:S.home,net:'cog',tier:1});ACT.cntLaunch({cc:'DE'});ACT.cntLaunch({cc:'FR'});compute();dayTick();renderAll()");
  assert.ok(ev("S.lvl") >= 2);
  const toasts = ev("$('toasts').textContent");
  assert.match(toasts, /Audience level 2: Couch Startup/);
  assert.match(toasts, /400G routers/);
  assert.deepEqual(errors, []);
});

test('the classic game keeps its carrier levels', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.lvl=3;renderAll()");
  const card = ev("lvlCard()");
  assert.match(card, /Customer level 3 of 13/);
  assert.ok(card.includes(ev("esc(LEVELS[2].n)")));
  assert.equal(ev("lvInfo(2)===LEVELS[2]"), true);
  assert.match(ev("lvToast(2)"), /Customer level 2/);
  assert.equal(ev("cntGuideOn()"), false);
  assert.deepEqual(errors, []);
});

test('each "Next:" line matches what the streaming constants really unlock', () => {
  const { ev, errors } = start();
  const j = (x) => JSON.parse(ev(`JSON.stringify(${x})`));
  assert.equal(ev("CNT_LEVELS.length"), ev("LEVELS.length"));
  // The texts say these levels: if a constant moves, the story must move with it.
  assert.deepEqual(j("[PREM_LV,DISP_LV,LIVE_LV,EV_ALL_LV,PREM_ALL_LV]"), [3, 5, 6, 9, 11]);
  assert.deepEqual(j("[boxLv({pol:'open'}),boxLv({pol:'selective'}),boxLv({pol:'paid'}),boxLv({pol:'restrictive'})]"), [3, 3, 5, 8]);
  assert.deepEqual(j("CAT_T.map(c=>c.lv)"), [1, 3, 6, 9]);
  assert.deepEqual(j("DC_T.map(c=>c.lv)"), [1, 1, 4, 8]);
  assert.deepEqual(j("LEVELS.map((L,i)=>L.era?i+1:0).filter(Boolean)"), [5, 8, 10, 12]);
  const origins = j("[1,2,3,4,5,6,7,8,9,10,11,12,13].map(l=>{S.lvl=l;return dcMax();})");
  const u = (lv) => ev(`CNT_LEVELS[${lv - 1}].unlock`);
  for (let lv = 2; lv <= 13; lv++) if (origins[lv - 1] > origins[lv - 2]) assert.match(u(lv), /origin/, `level ${lv} brings an origin`);
  assert.match(u(3), /Binge Boxes.*open or selective.*premieres.*live event/);
  assert.match(u(5), /charge for peering.*disputes.*15%/);
  assert.match(u(6), /Originals.*live premiere/);
  assert.match(u(8), /incumbents.*hyper origin.*15%/);
  assert.match(u(9), /everything, ever.*whole world/);
  assert.match(u(11), /whole planet/);
  assert.deepEqual(errors, []);
});

const VIEWS = { phone: 390, desktop: 1440 };
const glow = (ev) => ev(`(()=>{const g=[...document.querySelectorAll('.coach-glow')];if(g.length!==1)return {n:g.length};const b=g[0];
  let hid=false;for(let e=b;e;e=e.parentElement)if(e.hidden)hid=true;return {n:1,act:b.dataset.act||b.id,args:b.dataset.args||'',hid,dis:!!b.disabled};})()`);
const click = (ev, sel) => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return false;b.click();return true;})()`);
const coach = (ev) => ev("document.getElementById('coach').hidden?null:document.getElementById('coach').textContent");
// Click the glow until the step is done (a tab first, then the button inside it).
function play(ev, stepNow, max = 4) {
  for (let i = 0; i < max && ev('gdNow()') === stepNow; i++) {
    const g = glow(ev);
    assert.equal(g.n, 1, `one glow at step ${stepNow + 1}`);
    assert.equal(g.hid, false);
    assert.equal(g.dis, false, 'never on a disabled button');
    click(ev, '.coach-glow');
  }
  assert.notEqual(ev('gdNow()'), stepNow, `step ${stepNow + 1} gets done by following the glow`);
}

for (const [view, width] of Object.entries(VIEWS)) {
  test(`the streaming guide walks its first steps by its glow (${view})`, () => {
    const page = load();
    const { ev, dom, errors } = page;
    dom.window.__TUBES_TUT__ = true;
    dom.window.__TUBES_CHARTER__ = true;
    ev(`window.innerWidth=${width};localStorage.removeItem('sot-tut-tv');`);
    assert.ok(click(ev, '[data-act="start"]'));
    if (view === 'phone') click(ev, '#modal [data-act="pitchSkip"]');
    assert.ok(click(ev, `#modal [data-act="charter"][data-args*='"content"']`));
    assert.equal(ev('charter()'), 'content');
    assert.equal(ev('S.tut'), null, 'no carrier tutorial for a streaming service');
    assert.equal(ev('S.cnt.guide'), 0);
    assert.match(coach(ev), /Step 1 of 7/);
    assert.equal(glow(ev).act, 'cntLaunch');
    play(ev, 0);
    assert.equal(ev("!!S.cnt.cc[CITY[S.home].cc]"), true);
    play(ev, 1);
    assert.equal(ev("cntOut(S.home)"), true);
    play(ev, 2);
    assert.ok(ev("Object.keys(S.rs).length") > 0, 'on the route server');
    assert.equal(ev('gdNow()'), 3);
    assert.match(coach(ev), /½ speed/);
    ev("UI.speed=1;S.day=5;renderAll()");
    // A neighbour: the coach offers to show one, then glows its Launch button.
    assert.equal(ev('gdNow()'), 4);
    assert.equal(glow(ev).act, 'focusCity');
    play(ev, 4);
    assert.equal(ev("Object.keys(S.cnt.cc).length"), 2);
    // Box and hall wait, out of sight, until they can be played (Frankfurt's home ISPs charge: boxes from level 5).
    ev("S.cash=1000;renderAll()");
    assert.equal(ev('gdNow()'), -2);
    assert.equal(coach(ev), null);
    assert.equal(ev('S.cnt.guide===null'), false, 'still running');
    ev("S.lvl=5;S.cnt.cc.DE.d=300;compute();S.cash=1e5;renderAll()");
    assert.equal(ev('gdNow()'), 5);
    assert.match(coach(ev), /Step 6 of 7.*Binge Box/);
    play(ev, 5);
    assert.equal(ev("S.cnt.box.length"), 1);
    ev("S.cash=1e7;renderAll()");
    assert.equal(ev('gdNow()'), 6);
    assert.equal(glow(ev).act, 'cntDc');
    play(ev, 6);
    assert.ok(ev("S.cnt.dc[S.home].up"), 'the hall is being built');
    ev('renderAll()');
    assert.equal(ev('S.cnt.guide'), null, 'the guide is over');
    assert.equal(coach(ev), null);
    assert.equal(ev("localStorage.getItem('sot-tut-tv')"), '1');
    assert.match(ev("$('toasts').textContent"), /pilot episode/);
    assert.deepEqual(errors, []);
  });
}

test('the guide can be skipped, survives a save and never trusts one', () => {
  const page = load();
  const { ev, dom, errors } = page;
  dom.window.__TUBES_TUT__ = true;
  ev("ACT.start({});UI.tutLater=true;ACT.charter({k:'content'});renderAll()");
  assert.equal(ev('S.cnt.guide'), 0);
  ev("S.cnt.guide=5");
  const back = (edit) => ev(`(()=>{const s=JSON.parse(JSON.stringify(S));${edit};sanitize(s);return s.cnt.guide;})()`);
  assert.equal(back(''), 5);
  assert.equal(back("s.cnt.guide='x'"), null);
  assert.equal(back('s.cnt.guide=1<<20'), null);
  assert.equal(back('s.cnt.guide=-1'), null);
  assert.equal(back('delete s.cnt.guide'), null, 'an old save loads, guide off');
  ev("S.cnt.guide=0;renderAll()");
  assert.equal(coach(ev) !== null, true);
  assert.ok(click(ev, '#coach [data-act="cntGuideSkip"]'));
  assert.equal(ev('S.cnt.guide'), null);
  assert.equal(coach(ev), null);
  // Seen once in this browser: the next streaming service starts without it.
  ev("ACT.start({});UI.tutLater=true;ACT.charter({k:'content'})");
  assert.equal(ev('S.cnt.guide'), null);
  assert.deepEqual(errors, []);
});
