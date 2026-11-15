// Lambda Bazaar, the capacity market's own window (94-dashboard/56-lambda-bazaar.js): its tabs, what needs you and the
// one-tap fixes, the routes (sorting, filtering, paging, one card unfolded), a route's own rules (S.cm.rt) and how they
// change what the broker lists and sells, and that nothing changes while none is set; saves; the ways in; phones.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = (ev) => ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();S.cash=1e9;S.lvl=6;S.offers=[];S.biz=[];S.inc=[];S.cm.sh=[];S.cm.news=[]");
// Dark fiber between two cities (POPs built first), lit with n channels of optic ch.
const fiber = (ev, id, a, b, ch = 'tp16', n = 8) => ev(`for(const c of ['${a}','${b}'])if(!S.pops[c])ACT.buildPop({city:c});closeModal();
  S.links.push({id:'${id}',a:'${a}',b:'${b}',kind:'df',own:true,sys:'cl',ch:Array(${n}).fill('${ch}'),km:Math.round(kmBetween('${a}','${b}')*1.05),ready:0,day:0,cut:0,mo:100,trench:'own:${id}',pairs:1});compute();`);
const card = (ev) => ev("$('modalCard').textContent");
const has = (ev, sel) => ev(`!!$('modalCard').querySelector(${JSON.stringify(sel)})`);
const PAIRS = [['fra', 'ams'], ['fra', 'par'], ['ams', 'lon'], ['lon', 'par'], ['fra', 'mil'], ['mil', 'zrh'], ['zrh', 'fra'], ['par', 'bru'], ['bru', 'ams'], ['fra', 'muc'], ['muc', 'vie'], ['vie', 'mil'], ['bru', 'lon'], ['ams', 'ham']];

test('the window: an empty state without dark fiber, then five tabs, only the open one drawn', () => {
  const { ev, errors } = load();
  start(ev);
  // No dark fiber: no way in from the NOC tab, and the window says how to get some.
  ev("UI.left='noc';renderLeft()");
  assert.equal(ev(`!!$('leftBody').querySelector('[data-act="marketOpen"]')`), false);
  ev('ACT.marketOpen({})');
  assert.equal(ev("$('modal').className"), 'baz');
  assert.match(card(ev), /No dark fiber yet/);
  ev('closeModal()');
  fiber(ev, 'f', 'fra', 'ams');
  ev("renderLeft()");
  assert.equal(ev(`!!$('leftBody').querySelector('[data-act="marketOpen"]')`), true, 'the NOC tab opens it once there is dark fiber');
  ev('ACT.marketOpen({})');
  assert.deepEqual(JSON.parse(ev(`JSON.stringify([...$('modalCard').querySelectorAll('.dtabs [data-act="bazTab"]')].map(b=>JSON.parse(b.dataset.args).t))`)), ['home', 'routes', 'prod', 'news', 'scout']);
  assert.match(card(ev), /Capacity you sell/);
  assert.equal(has(ev, '.bz-r'), false, 'the overview draws no route cards');
  ev("ACT.bazTab({t:'routes'})");
  assert.equal(has(ev, '.bz-r'), true);
  assert.equal(has(ev, '.bz-tiles'), false, 'the routes tab draws no overview');
  ev("ACT.bazTab({t:'prod'})");
  assert.equal(ev(`$('modalCard').querySelectorAll('.bz-pr').length`), 7, 'the share kept back and six products');
  ev("ACT.bazTab({t:'news'})");
  assert.match(card(ev), /Quiet so far/);
  // Routes to build is a Cable broker's: locked otherwise, the list with the charter.
  ev("ACT.bazTab({t:'scout'})");
  assert.match(card(ev), /Cable broker/);
  ev("closeModal();ACT.charter({k:'broker'});closeModal();S.cash=1e9;for(const c of ['par','bru'])ACT.buildPop({city:c});closeModal();ACT.marketOpen({t:'scout'})");
  assert.equal(ev(`$('modalCard').querySelectorAll('.bz-body .row').length > 0`), true, 'routes it could build');
  // The dashboard's tab is the overview with the way in.
  ev("closeModal();UI.dtab='market';$('dash').hidden=false;renderDash()");
  assert.equal(ev(`!!$('dashCard').querySelector('.bz-dash [data-act="marketOpen"]')`), true);
  assert.equal(ev(`!!$('dashCard').querySelector('.bz-r')`), false);
  assert.deepEqual(errors, []);
});

test('the first-run card sells everything wanted in one tap; the presets set only the products\' own settings', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'f', 'fra', 'ams');
  ev('ACT.marketOpen({})');
  assert.match(card(ev), /The broker is idle/);
  assert.equal(has(ev, '.bz-idle [data-act="mktPreset"]'), true);
  ev("ACT.mktPreset({v:'all'})");
  assert.equal(ev('CM_P.every(p=>S.cm.p[p].on&&S.cm.p[p].min===CM_MIN[p][0]&&S.cm.p[p].floor===CM_DEF[p].floor)'), true);
  assert.equal(ev("$('modal').className"), 'baz', 'the window stays open and is drawn again');
  assert.doesNotMatch(card(ev), /The broker is idle/);
  assert.match(card(ev), /Needs you/);
  ev("ACT.mktPreset({v:'careful'})");
  assert.equal(ev("CM_P.every(p=>S.cm.p[p].on&&S.cm.p[p].floor===(p==='iru'?120:100))"), true);
  ev("S.links[S.links.length-1].list={w:0,p:0,hw:0,m4:2};ACT.mktPreset({v:'stop'})");
  assert.equal(ev('CM_P.some(p=>S.cm.p[p].on)'), false);
  assert.equal(ev("(S.links.find(l=>l.id==='f').list||{}).m4||0"), 0, 'what the broker listed comes off');
  assert.equal(ev("S.cm.hold"), 25, 'the share kept back is left alone');
  ev("ACT.mktPreset({v:'nope'})");
  assert.deepEqual(errors, []);
});

test('needs you: one line per kind of blocker, with its fix', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'f', 'fra', 'ams', 'zr4', 8);
  // Buyers pay less than a 120% floor; 800G waves need an optic that big; dark pairs are wanted but off.
  ev("for(const p of ['spec','w100','w400','w800']){S.cm.p[p].on=true;S.cm.p[p].min=1;S.cm.p[p].floor=120;}S.cm.p.w800.floor=60;cmRelist()");
  ev("const r=cmRoutes().get('ams|fra');window.__dem=cmDem;cmDem=(x,p,d,f)=>p==='w800'||p==='iru'?3:__dem(x,p,d,f)");
  const D = JSON.parse(ev("JSON.stringify((({floor,room,optic,idle})=>({floor,room,optic,idle}))(bazData()))"));
  assert.equal(D.floor, 1);
  assert.equal(D.optic, 1);
  assert.deepEqual(D.idle, [{ p: 'iru', n: 1 }]);
  ev('ACT.marketOpen({})');
  assert.match(card(ev), /1 route: buyers pay less than your floor/);
  assert.match(card(ev), /1 route needs a bigger optic/);
  assert.match(card(ev), /Wanted but not selling: Dark pair IRUs on 1 route/);
  // See routes: the routes tab, filtered to that kind.
  ev("ACT.marketOpen({t:'routes',f:'optic'})");
  assert.equal(ev('UI.bazFilt'), 'optic');
  assert.equal(ev(`$('modalCard').querySelectorAll('.bz-r').length`), 1);
  // Lower the floor: every product held up by its floor drops to 60%.
  ev("ACT.bazTab({t:'home'});ACT.mktFloorLow()");
  assert.equal(ev("['spec','w100','w400'].every(p=>S.cm.p[p].floor===60)"), true);
  // Start selling: the product's switch.
  ev("ACT.mktCfg({p:'iru',k:'on',v:1})");
  assert.equal(ev('S.cm.p.iru.on'), true);
  ev('cmDem=__dem');
  assert.deepEqual(errors, []);
});

test('routes: sorted, filtered and paged, one card unfolded at a time', () => {
  const { ev, errors } = load();
  start(ev);
  PAIRS.forEach(([a, b], i) => fiber(ev, 'f' + i, a, b));
  assert.equal(ev('cmRoutes().size'), 14);
  ev("ACT.marketOpen({t:'routes'})");
  const keys = () => JSON.parse(ev(`JSON.stringify([...$('modalCard').querySelectorAll('.bz-r')].map(e=>e.dataset.route))`));
  assert.equal(keys().length, 12, 'a first page of twelve');
  assert.match(card(ev), /2 more routes/);
  ev('ACT.bazMore()');
  assert.equal(keys().length, 14);
  ev("ACT.bazSort({v:'name'})");
  const names = JSON.parse(ev(`JSON.stringify([...$('modalCard').querySelectorAll('.bz-rn b')].map(e=>e.textContent))`));
  assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b)));
  ev("ACT.bazSort({v:'heat'})");
  const heat = JSON.parse(ev("JSON.stringify(bazRows(bazData()).map(x=>x.H))"));
  assert.deepEqual(heat, heat.slice().sort((a, b) => b - a));
  ev("ACT.bazSort({v:'bogus'})");
  assert.equal(ev('UI.bazSort'), 'mo');
  // The broker left off one route: the "broker off" filter shows just that one.
  ev("ACT.mktRoute({k:'ams|fra'});ACT.bazFilt({v:'off'})");
  assert.deepEqual(keys(), ['ams|fra']);
  ev("ACT.bazFilt({v:'hot'})");
  assert.equal(keys().length, ev('bazData().rows.filter(bazHot).length'));
  ev("ACT.bazFilt({v:'all'})");
  // One card unfolded at a time, and the same card folds again.
  ev("ACT.bazRow({k:'fra|par'})");
  assert.deepEqual(JSON.parse(ev(`JSON.stringify([...$('modalCard').querySelectorAll('.bz-r.open')].map(e=>e.dataset.route))`)), ['fra|par']);
  assert.equal(has(ev, '.bz-r.open .bz-ctl select[data-chg="mktRt"]'), true, 'the route\'s own rules');
  ev("ACT.bazRow({k:'ams|lon'})");
  assert.deepEqual(JSON.parse(ev(`JSON.stringify([...$('modalCard').querySelectorAll('.bz-r.open')].map(e=>e.dataset.route))`)), ['ams|lon']);
  ev("ACT.bazRow({k:'ams|lon'})");
  assert.equal(has(ev, '.bz-r.open'), false);
  // From a fiber's panel: the window opens on that route, unfolded, on whichever page it is.
  ev("closeModal();UI.bazN=0;UI.bazSort='name';selectLink('f13');renderAll()");
  const go = ev(`(()=>{const b=$('panel').querySelector('[data-act="marketOpen"]');return b&&b.dataset.args})()`);
  assert.deepEqual(JSON.parse(go), { k: 'ams|ham' });
  ev(`ACT.marketOpen(${go})`);
  assert.equal(ev('UI.bazTab'), 'routes');
  assert.equal(ev(`$('modalCard').querySelector('.bz-r.open').dataset.route`), 'ams|ham');
  assert.deepEqual(errors, []);
});

test('a route\'s own rules change what the broker lists there, and only there; reset brings it back', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'a', 'fra', 'ams', 'zr4', 8);
  fiber(ev, 'b', 'fra', 'par', 'zr4', 8);
  ev("for(const p of ['spec','w400','w100']){S.cm.p[p].floor=60;}for(const p of ['spec','w400']){S.cm.p[p].on=true;S.cm.p[p].min=1;}cmDem=((f)=>(r,p,d,x)=>p==='w400'||p==='spec'?40:f(r,p,d,x))(cmDem);cmRelist()");
  const L = (id) => JSON.parse(ev(`JSON.stringify(S.links.find(l=>l.id==='${id}').list||{})`));
  const a0 = L('a'), b0 = L('b');
  assert.ok(a0.m4 > 0 && b0.m4 > 0);
  // Not on this route: the broker's 400G waves come off it; the other route keeps them.
  ev("ACT.mktRt({k:'ams|fra',f:'w400',v:'0'})");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.cm.rt||{})")), { 'ams|fra': { p: { w400: 0 } } });
  assert.equal(L('a').m4 || 0, 0);
  assert.equal(L('b').m4, b0.m4);
  // Keep back half here: fewer waves listed on it.
  ev("ACT.mktRt({k:'ams|fra',f:'w400',v:''});ACT.mktRt({k:'ams|fra',f:'hold',v:'50'})");
  assert.ok(L('a').m4 < a0.m4, `keep back 50% here: ${L('a').m4} < ${a0.m4}`);
  assert.equal(ev("cmHold('ams|fra')"), 50);
  assert.equal(ev("cmHold('fra|par')"), 25);
  // Sell a product here that is off everywhere.
  ev("ACT.mktRt({k:'fra|par',f:'w100',v:1})");
  assert.ok(L('b').m1 > 0, 'managed 100G waves on this route only');
  assert.equal(L('a').m1 || 0, 0);
  // A floor of its own: below it, nothing listed here.
  ev("ACT.mktRt({k:'fra|par',f:'floor',v:120});const r=cmRoutes().get('fra|par');__pc=cmIdx(r,'w400',0,0,S.day)*100");
  if (ev('__pc') < 120) assert.equal(L('b').m4 || 0, 0, 'below its own floor');
  // Bad values change nothing.
  const before = ev('JSON.stringify(S.cm.rt||{})');
  ev("ACT.mktRt({k:'ams|fra',f:'hold',v:33});ACT.mktRt({k:'zzz|fra',f:'hold',v:10});ACT.mktRt({k:'ams|fra',f:'colour',v:1});ACT.mktRt({k:'ams|fra',f:'w400',v:2})");
  assert.equal(ev('JSON.stringify(S.cm.rt||{})'), before);
  // Reset: as everywhere again, and nothing kept.
  ev("ACT.mktRtReset({k:'fra|par'});ACT.mktRtReset({k:'ams|fra'})");
  assert.equal(ev("'rt' in S.cm"), false, 'no rules: nothing kept');
  assert.deepEqual(L('a'), a0);
  assert.deepEqual(L('b'), b0);
  // The fiber panel's reasons read the route's share kept back too.
  ev("ACT.mktRt({k:'ams|fra',f:'hold',v:0})");
  assert.equal(ev("cmSpare(S.links.find(l=>l.id==='a'),'spec')"), ev("Math.max(0,freeCh(S.links.find(l=>l.id==='a')))"));
  assert.deepEqual(errors, []);
});

test('with no route rules the broker sells exactly as before; rules that were set and reset change nothing', () => {
  const play = (pre) => {
    const { ev, errors } = load();
    start(ev);
    fiber(ev, 'a', 'fra', 'ams');
    fiber(ev, 'b', 'fra', 'par', 'zr4', 6);
    ev("for(const p of CM_P){S.cm.p[p].on=true;S.cm.p[p].min=1;}cmRelist()");
    if (pre) ev(pre);
    ev('__reseed(11);for(let d=0;d<120;d++){S.day++;cmDay(S.day);}');
    assert.deepEqual(errors, []);
    return ev("JSON.stringify([S.biz.map(b=>[b.type,b.link,b.rate,b.g||0,b.slots||1]),S.links.map(l=>l.list||null)])");
  };
  const plain = play('');
  assert.equal(play("ACT.mktRt({k:'ams|fra',f:'hold',v:0});ACT.mktRt({k:'fra|par',f:'w100',v:0});ACT.mktRtReset({k:'ams|fra'});ACT.mktRtReset({k:'fra|par'})"), plain);
  assert.notEqual(play("ACT.mktRt({k:'ams|fra',f:'hold',v:0});ACT.mktRt({k:'fra|par',f:'floor',v:120})"), plain, 'a rule that is set does change sales');
});

test('saves keep a route\'s rules; old saves load without any, and garbage is dropped', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'a', 'fra', 'ams');
  ev("ACT.mktRt({k:'ams|fra',f:'hold',v:10});ACT.mktRt({k:'ams|fra',f:'floor',v:100});ACT.mktRt({k:'ams|fra',f:'iru',v:1})");
  ev('const t=JSON.stringify(packSave(S));S=migrate(JSON.parse(t))');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.cm.rt||{})')), { 'ams|fra': { hold: 10, floor: 100, p: { iru: 1 } } });
  // An old save, from before route rules.
  ev('const o=JSON.parse(JSON.stringify(packSave(S)));delete o.cm.rt;S=migrate(o)');
  assert.equal(ev("'rt' in S.cm"), false);
  assert.equal(ev("cmHold('ams|fra')"), 25);
  // Garbage: wrong keys, wrong values, empty rules, an array.
  ev(`const o=JSON.parse(JSON.stringify(packSave(S)));o.cm.rt={'ams|fra':{hold:33,floor:100,p:{w400:1,w100:'yes',nope:1}},'fra|ams':{hold:10},'zzz|ams':{hold:10},'ams|fra|x':{hold:10},'fra|par':{},'ams|par':[1],'ams|lon':{p:[]},'bru|fra':{hold:'10'}};S=migrate(o)`);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.cm.rt||{})')), { 'ams|fra': { floor: 100, p: { w400: 1 } } });
  ev("const o=JSON.parse(JSON.stringify(packSave(S)));o.cm.rt=[1,2];S=migrate(o)");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.cm.rt||{})')), {});
  assert.deepEqual(errors, []);
});

test('on a 360 px phone: a bottom sheet with every tab in view, every control within reach', () => {
  const { ev, errors } = load();
  ev('window.innerWidth=360;window.innerHeight=740');
  start(ev);
  PAIRS.slice(0, 4).forEach(([a, b], i) => fiber(ev, 'f' + i, a, b));
  ev("ACT.mktPreset({v:'all'});ACT.marketOpen({t:'routes'});ACT.bazRow({k:'ams|fra'})");
  assert.equal(ev('isPhone()'), true);
  assert.equal(ev("$('modal').className"), 'baz');
  assert.equal(has(ev, '.dhead .dtabs'), true, 'the tabs stay pinned at the top');
  assert.equal(has(ev, '.bz-r.open .bz-ctl'), true);
  // Selects and chips are big enough to tap; the stylesheet wraps the tabs on phones, so none hides under the close button.
  const css = ev("[...document.querySelectorAll('style')].map(s=>s.textContent).join('')");
  assert.match(css, /@media \(max-width:760px\)\{[^@]*#modal\.baz \.dtabs\{flex-wrap:wrap;/);
  assert.match(css, /\.bz-chip\{min-height:34px\}/);
  for (const t of ['home', 'routes', 'prod', 'news', 'scout']) { ev(`ACT.bazTab({t:'${t}'})`); assert.ok(card(ev).length > 50, t); }
  assert.deepEqual(errors, []);
});

test('blocked counts only products that are on and wanted, says what is held up, and sorts by it', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'a', 'fra', 'ams', 'zr4', 8);
  fiber(ev, 'b', 'fra', 'par', 'zr4', 8);
  // Spectrum is on everywhere, wanted on ams|fra only; buyers pay 70% of list against a floor of 80%.
  ev("S.cm.p.spec.on=true;S.cm.p.spec.min=4;S.cm.p.spec.floor=80;window.__dem=cmDem;window.__idx=cmIdx;cmDem=(r,p,d,f)=>p==='spec'?(r.k==='ams|fra'?10:2):__dem(r,p,d,f);cmIdx=(r,p,s,i,d,f)=>p==='spec'?0.7:__idx(r,p,s,i,d,f);cmRelist()");
  const st = JSON.parse(ev("JSON.stringify(bazData().rows.map(x=>[x.k,x.ps.find(q=>q.p==='spec').st,x.bad,x.w>0]))"));
  assert.deepEqual(st.sort(), [['ams|fra', 'floor', true, true], ['fra|par', 'quiet', false, false]], 'under the minimum it waits, it is not blocked');
  ev('ACT.marketOpen({})');
  assert.equal(ev(`$('modalCard').querySelector('.dtabs .cnt.red').textContent`), '1', 'the tab badge counts the one route');
  assert.match(card(ev), /\/mo held up/);
  // Each line of Needs you opens its routes; the fix sits on the same line.
  assert.equal(has(ev, '.bz-need > button.bz-nb[data-act="marketOpen"]'), true);
  assert.equal(has(ev, '.bz-need > .btns [data-act="bazAsk"]'), true);
  ev("ACT.marketOpen({t:'routes'});ACT.bazSort({v:'held'})");
  assert.equal(ev(`$('modalCard').querySelector('.bz-r').dataset.route`), 'ams|fra');
  const w = JSON.parse(ev('JSON.stringify(bazRows(bazData()).map(x=>x.w))'));
  assert.deepEqual(w, w.slice().sort((a, b) => b - a));
  ev('cmDem=__dem;cmIdx=__idx');
  assert.deepEqual(errors, []);
});

test('a lower floor asks where first: these routes or everywhere, and leaves routes no floor would help', () => {
  const setup = (ev) => {
    start(ev);
    fiber(ev, 'a', 'fra', 'ams', 'zr4', 8);
    fiber(ev, 'b', 'fra', 'par', 'zr4', 8);
    fiber(ev, 'c', 'ams', 'lon', 'zr4', 8);
    // Spectrum wanted everywhere at floor 80%: buyers pay 70% on ams|fra and ams|lon, 50% on fra|par (under any floor).
    ev("S.cm.p.spec.on=true;S.cm.p.spec.min=1;S.cm.p.spec.floor=80;window.__dem=cmDem;window.__idx=cmIdx;cmDem=(r,p,d,f)=>p==='spec'?10:__dem(r,p,d,f);cmIdx=(r,p,s,i,d,f)=>p==='spec'?(r.k==='fra|par'?0.5:0.7):__idx(r,p,s,i,d,f);cmRelist()");
    ev('ACT.marketOpen({})');
  };
  {
    const { ev, errors } = load();
    setup(ev);
    assert.equal(ev('bazData().floor'), 3);
    assert.equal(has(ev, '.bz-ask'), false, 'nothing changes, nothing asked, before the tap');
    ev("ACT.bazAsk({v:'floor'})");
    assert.match(card(ev), /A floor of 60% lets 2 routes sell again/);
    assert.match(card(ev), /1 route stays blocked: buyers there pay under 60%/);
    assert.match(card(ev), /On these 2 routes/);
    assert.match(card(ev), /The floor of Spectrum drops to 60% on every route/);
    assert.equal(ev('S.cm.p.spec.floor'), 80, 'asking changes nothing');
    ev("ACT.mktFloorLow({w:'here'})");
    assert.deepEqual(JSON.parse(ev('JSON.stringify(S.cm.rt)')), { 'ams|fra': { floor: 60 }, 'ams|lon': { floor: 60 } });
    assert.equal(ev('S.cm.p.spec.floor'), 80, 'everywhere stays as it was');
    assert.equal(ev("bazData().rows.filter(x=>x.ps.some(q=>q.st==='floor')).map(x=>x.k).join()"), 'fra|par');
    assert.equal(has(ev, '.bz-ask'), false, 'the question folds again');
    ev('cmDem=__dem;cmIdx=__idx');
    assert.deepEqual(errors, []);
  }
  {
    const { ev, errors } = load();
    setup(ev);
    ev("ACT.bazAsk({v:'floor'});ACT.mktFloorLow({w:'all'})");
    assert.equal(ev('S.cm.p.spec.floor'), 60);
    assert.equal(ev("'rt' in S.cm"), false, 'no route rules');
    // Nothing left that a lower floor could fix: no button, no question.
    ev("ACT.bazAsk({v:'floor'})");
    assert.equal(ev('UI.bazAsk'), 'floor');
    assert.equal(has(ev, '.bz-ask'), false);
    assert.equal(has(ev, '[data-act="mktFloorLow"]'), false);
    const before = ev('JSON.stringify(S.cm)');
    ev("ACT.mktFloorLow({w:'here'});ACT.bazAsk({v:'nope'})");
    assert.equal(ev('JSON.stringify(S.cm)'), before);
    ev('cmDem=__dem;cmIdx=__idx');
    assert.deepEqual(errors, []);
  }
});

test('a first-time player reads what the window is: one line in the empty and the idle state', () => {
  const { ev, errors } = load();
  start(ev);
  const lead = ev("tr('market.lead_short')");
  ev('ACT.marketOpen({})');
  assert.ok(card(ev).includes(lead), 'empty');
  ev('closeModal()');
  fiber(ev, 'f', 'fra', 'ams');
  ev('ACT.marketOpen({})');
  assert.match(card(ev), /The broker is idle/);
  assert.ok(card(ev).includes(lead), 'idle');
  assert.deepEqual(errors, []);
});
