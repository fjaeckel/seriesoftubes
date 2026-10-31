const test = require('node:test');
const assert = require('node:assert/strict');
const { load, seed } = require('./harness');

test('page boots to the title screen without errors', () => {
  const { ev, errors } = load();
  assert.equal(ev("document.getElementById('modal').hidden"), false);
  assert.match(ev("document.getElementById('modalCard').textContent"), /Series\s*of\s*Tubes/);
  assert.deepEqual(errors, []);
});

test('every city sits on its landmass', () => {
  const { ev } = load();
  const off = ev("CITIES.filter(c=>!inPoly(c.x,c.y,LANDS.find(l=>l.id===c.land).pts)).map(c=>c.id).join()");
  assert.equal(off, '');
});

test('every cable lands at two known cities and has a length', () => {
  const { ev } = load();
  const bad = ev("CABLE_PAIRS.filter(c=>!CITY[c.a]||!CITY[c.b]||!(c.km>0)).map(c=>c.cid).join()");
  assert.equal(bad, '');
});

test('a year of scripted play stays healthy', () => {
  const { ev, errors } = load();
  seed(ev, 7);
  ev("ACT.start({})");
  ev("ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'})");
  ev("UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});ACT.launchBB({city:'ams'})");
  for (let d = 0; d < 360; d++) {
    ev('dayTick()');
    if (d % 30 === 0) ev("for(const o of S.offers.slice())if(S.pops[o.city]&&(!o.city2||S.pops[o.city2]))ACT.accept({id:o.id})");
  }
  assert.ok(ev('S.day') >= 360);
  assert.ok(Number.isFinite(ev('S.cash')), 'cash is a number');
  assert.ok(ev('R.served') > 0, 'traffic is flowing');
  assert.equal(ev("JSON.stringify(R).includes('NaN')||JSON.stringify(S).includes('null,null')"), false);
  assert.deepEqual(errors, []);
});

test('every incident and event type fires and clears cleanly', () => {
  const { ev, errors } = load();
  seed(ev, 3);
  ev("ACT.start({});S.cash=1e8;S.lvl=4;S.day=100");
  ev("for(const c of ['ams','lon','nyc','mos','mnl'])ACT.buildPop({city:c})");
  ev("ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'})");
  ev("UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});UI.via='grace';openLinkModal('nyc','lon');ACT.buildLink({tier:1});closeModal()");
  ev("UI.pending={a:'fra',b:'ams'};UI.lmode='df';UI.dfSys='roadm';ACT.orderDf();UI.lmode='wave';S.pops.fra.rgen=2;S.pops.ams.rgen=2");
  ev("const df=S.links.find(l=>l.kind==='df');ACT.addCh({id:df.id,o:'zr4'});df.ready=S.day");
  const failSrc = ev('fireFailure.toString()');
  const types = ['harmless','fatwave','label','mtu','oops','cleaner','maxpfx','prepend','rpki','amp','roadmff','optic','ac','cut','crash','power','transit','ixloop','leak','ddos'];
  for (const t of types) {
    const funny = ['harmless','fatwave','label','mtu','oops','cleaner','maxpfx','prepend','rpki','roadmff','ac'].includes(t);
    const patched = failSrc
      .replace(/^function fireFailure/, 'function')
      .replace('let tot=opts.reduce', `if(!opts.some(o=>o[0]==='${funny ? 'funny' : t}'))return;opts.splice(0,opts.length,['${funny ? 'funny' : t}',1]);let tot=opts.reduce`)
      .replace('type=pick(f);}', `type=f.includes('${t}')?'${t}':pick(f);}`);
    ev('window.__ff=' + patched);
    ev('S.links.forEach(l=>{l.cut=0;l.eqDown=0;l.chFail=null});S.transit.forEach(t=>t.down=0);for(const c in S.pops)S.pops[c].down=0;compute()');
    ev('__ff()');
    ev('dayTick()');
  }
  const evSrc = ev('fireEvent.toString()');
  for (const e of ['viral','price','grant','sanction','tariff','hijack','landban','shutdown','redsea','baltic','runet','typhoon','golden','gfw']) {
    ev('window.__fe=' + evSrc.replace(/^function fireEvent/, 'function').replace('const e=pick(opts);', `const e='${e}';`));
    ev('__fe()');
    ev('dayTick()');
  }
  for (let d = 0; d < 60; d++) ev('dayTick()');
  assert.equal(ev('S.inc.filter(i=>i.until<=S.day).length'), 0, 'expired incidents are cleared');
  assert.deepEqual(errors, []);
});

test('every panel, tab and the dashboard render', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e7;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  for (let d = 0; d < 20; d++) ev('dayTick()');
  for (const t of ['cust', 'up', 'peer', 'links']) {
    ev(`selectCity('fra');ACT.tab({t:'${t}'})`);
    assert.ok(ev("document.getElementById('panelBody').textContent.length") > 50);
  }
  ev("selectCity('sha')");
  for (const t of ['goals', 'deals', 'noc', 'nets']) ev(`ACT.leftTab({t:'${t}'})`);
  ev('ACT.dash({})');
  assert.ok(ev("document.querySelectorAll('#dashCard svg').length") >= 1);
  ev('showHelp()');
  assert.deepEqual(errors, []);
});

test('saves never resurrect a bankrupt game', () => {
  const { ev } = load();
  ev("ACT.start({});S.day=9;S.cash=-2e5;dayTick()");
  assert.equal(ev('S.lost'), true);
  assert.equal(ev('loadSave()'), null);
});

test('LAGs add members, capacity and cost to transit, IX ports and PNIs', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e7;S.lvl=4;S.pops.fra.rgen=2;for(const g of GOALS)S.done[g.id]=0");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true})");
  ev("const t=S.transit[0];window.__c0=S.cash;ACT.lagT({id:t.id,d:1});ACT.lagT({id:t.id,d:1});ACT.lagIx({city:'fra',d:1});compute()");
  assert.equal(ev('S.transit[0].n'), 3);
  assert.equal(ev("S.ixn.fra"), 2);
  assert.equal(ev("__c0-S.cash"), 1500 * 2 + ev("ixPortMo('fra',1)"), 'two transit members and one IX member were charged');
  assert.equal(ev("ixCap('fra')"), 190);
  assert.equal(ev("R.cost.transit>0"), true);
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2})");
  assert.equal(ev('S.transit[0].tier'), 2, 'upgrading a LAG upgrades every member');
  ev("ACT.lagT({id:S.transit[0].id,d:-1})");
  assert.equal(ev('S.transit[0].n'), 2);
  ev("for(let i=0;i<10;i++)ACT.lagT({id:S.transit[0].id,d:1})");
  assert.equal(ev('S.transit[0].n'), 8, 'capped at 8 members');
  ev("selectCity('fra');ACT.tab({t:'up'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /8×400G LAG/);
  assert.deepEqual(errors, []);
});

test('goal rewards are paid once, even for goals finished on day 0', () => {
  const { ev } = load();
  ev("ACT.start({})");
  const c0 = ev('S.cash');
  ev("ACT.launchBB({city:'fra'})");
  const c1 = ev('S.cash');
  for (let i = 0; i < 5; i++) ev('after()');
  assert.equal(ev('S.cash'), c1, 'no repeated reward');
  assert.equal(c1 - c0, ev("GOALS.find(g=>g.id==='bb').r") - ev("bbCost('fra')"));
});

test('Stuttgart has only the Spätzle-IX: no transit, no PNIs', () => {
  const { ev } = load();
  assert.equal(ev("CITY.stg.ix"), 'Spätzle-IX');
  assert.equal(ev("NETS.filter(n=>n.pops.includes('stg')).length"), 0);
  ev('ACT.start({})');
  assert.ok(ev("ixMembers('stg').length") > 0, 'networks still peer at the exchange');
});

test('bank: offers arrive, loans pay out, cost money monthly and get paid off', () => {
  const { ev, errors } = load();
  seed(ev, 5);
  ev("ACT.start({});ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  ev("S.loanOffers=[];spawnLoanOffer(false)");
  assert.equal(ev('S.loanOffers.length'), 1);
  ev("S.loanOffers[0]={id:'x1',bank:'db',amount:100000,exp:S.day+20,covs:['fax'],apr:0.12,term:6,pay:Math.round(annuity(100000,0.12,6))}");
  const c0 = ev('S.cash');
  ev("ACT.takeLoan({id:'x1'})");
  assert.equal(ev('S.cash') - c0 >= 100000 - 1, true, 'cash paid out');
  assert.ok(ev('R.cost.loans') > 17000, 'monthly payment shows up in costs');
  for (let d = 0; d < 200; d++) ev('dayTick()');
  assert.equal(ev("S.loans.filter(l=>l.id==='x1').length"), 0, 'six-month loan is paid off');
  ev('ACT.bank({})');
  assert.match(ev("document.getElementById('bankCard').textContent"), /Credit rating/);
  assert.deepEqual(errors, []);
});

test('bank: broke players get emergency offers, broken conditions cost a penalty', () => {
  const { ev } = load();
  seed(ev, 9);
  ev("ACT.start({});S.cash=-20000");
  for (let d = 0; d < 20; d++) ev('loanTick(S.day)');
  assert.ok(ev('S.loanOffers.length') >= 1, 'someone offers money when you are broke');
  ev("S.cash=500000;S.loans.push({id:'c1',bank:'db',start:S.day-40,amount:100000,bal:100000,apr:0.1,pay:5000,left:24,term:24,share:0,covs:['gen'],base:{sub:0}})");
  for (let d = 0; d < 10; d++) ev('S.day++;loanTick(S.day)');
  assert.ok(ev("S.loans.find(l=>l.id==='c1').bal") > 100000, 'penalty added after 10 days of breach');
});

test('bank: the venture vultures take a share of revenue instead of payments', () => {
  const { ev } = load();
  ev("ACT.start({});ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});for(let i=0;i<30;i++)dayTick()");
  ev("S.loanOffers.push({id:'v1',bank:'vult',amount:500000,exp:S.day+20,covs:['blitz'],share:0.1});ACT.takeLoan({id:'v1'})");
  assert.equal(ev('R.cost.loans'), 0);
  assert.ok(Math.abs(ev('R.cost.revshare') - ev('R.revMo') * 0.1) < 1);
});

test('old saves load, and a stale flat DDoS object is repaired away', () => {
  const { ev } = load();
  ev("ACT.start({})");
  // An old save with a pre-1.17 flat attack (no vector) loads and the attack is dropped.
  const dropped = ev("const s=JSON.parse(JSON.stringify(S));s.ev={ddos:{city:'fra',until:9}};sanitize(s);s.ev.ddos===undefined");
  assert.equal(dropped, true, 'a vectorless attack is dropped');
  // A well-formed attack survives sanitize with its fields coerced.
  const kept = ev("const s=JSON.parse(JSON.stringify(S));s.ev={ddos:{city:'fra',vec:'dns',gbps:'80',until:9}};sanitize(s);JSON.stringify([s.ev.ddos&&s.ev.ddos.vec, s.ev.ddos&&s.ev.ddos.gbps])");
  assert.deepEqual(JSON.parse(kept), ['dns', 80], 'a shaped attack is kept, numbers coerced');
});

test('DDoS goal and badges unlock from the right state', () => {
  const { ev } = load();
  ev("ACT.start({});S.cash=1e8");
  const okg = id => ev(`GOALS.find(g=>g.id==='${id}').ok()`);
  const okb = id => ev(`BADGES.find(b=>b.id==='${id}').ok()`);
  assert.equal(okg('scrub'), false, 'the DDoS goal starts incomplete');
  ev("S.scrubs=[{city:'fra',tier:0}]");
  assert.equal(okg('scrub'), true, 'a scrubbing center completes the goal');
  assert.equal(okb('toaster'), false);
  ev("S.stats.ddosHeld=1"); assert.equal(okb('toaster'), true, 'weathering a DDoS earns Toaster Wrangler');
  ev("S.stats.ddosMonster=1"); assert.equal(okb('flood'), true, 'a multi-terabit hold earns Held the Flood');
  ev("S.transit.push({id:'t1',city:'fra',net:'cog',tier:1,n:1,site:'a',clean:true})");
  assert.equal(okb('cleanpipe'), true, 'a clean-pipe earns Clean Pipes');
  ev("S.pni.push({id:'p1',city:'fra',net:'ctc',tier:1,n:1,site:'a',sacrif:true})");
  assert.equal(okb('lamb'), true, 'a sacrificial PNI earns Sacrificial Lamb');
  // The hack-back win badge comes from the real action path.
  ev("S.ev.ddos={city:'fra',vec:'dns',gbps:50,until:S.day+3,entry:{k:'edge',lab:''},bh:false,start:S.day};const _r=Math.random;Math.random=()=>0.1;ACT.hackback();Math.random=_r");
  assert.equal(ev('S.stats.hackWin'), 1, 'a winning hack-back is recorded');
  assert.equal(okb('skynot'), true, 'and earns Skynot Smiles');
  assert.ok(ev("new Set(BADGES.map(b=>b.id)).size===BADGES.length"), 'badge ids stay unique');
  // The petabit badge needs a full 1 Pbps of served traffic.
  assert.equal(ev("R.served=999999;BADGES.find(b=>b.id==='petabit').ok()"), false, 'just under a petabit is not enough');
  assert.equal(ev("R.served=1e6;BADGES.find(b=>b.id==='petabit').ok()"), true, 'a petabit per second earns it');
});

test('#52 loan offers stop once you have half a billion in the bank, and come back if you lose it', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.day=100;S.cash=6e8;S.loanOffers=[{id:'x',bank:Object.keys(BANKS)[0],amount:1e5,exp:200}]");
  for (let i = 0; i < 60; i++) ev('S.day++;loanTick(S.day)');
  assert.equal(ev('S.loanOffers.length'), 0, 'no offers while rich');
  assert.match(ev("document.getElementById('toasts').textContent"), /stopped calling/);
  ev('S.cash=-5e4');
  let seen = 0;
  for (let i = 0; i < 40; i++) seen += ev('S.day++;loanTick(S.day);S.loanOffers.length') > 0 ? 1 : 0;
  assert.ok(seen > 0, 'broke again: the banks are back');
  assert.deepEqual(errors, []);
});

test('loans: good terms need good credit, big loans want revenue, and the weird lenders do weird things', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e6;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});for(let i=0;i<10;i++)dayTick()");
  // the premium: a weak rating pays more for the same bank
  assert.ok(ev('RATE_PREM.C') > ev('RATE_PREM.BBB') && ev('RATE_PREM.BBB') > ev('RATE_PREM.AAA'));
  assert.equal(ev("BANKS.gs.min"), 'AA', 'the best bank only lends to the best');
  // a big loan comes with a revenue share on top
  ev("S.loanOffers=[];const k0=Math.random;let n=0;for(let i=0;i<200&&!S.loanOffers.some(o=>o.share&&!BANKS[o.bank].equity);i++){S.loanOffers=[];spawnLoanOffer(false);}");
  const big = JSON.parse(ev('JSON.stringify(S.loanOffers.find(o=>o.share&&!BANKS[o.bank].equity)||null)'));
  if (big) assert.ok(big.amount > 5 * Math.max(60000, ev('R.revMo')) && big.share >= 0.02 && big.share <= 0.08);
  ev("S.loans=[];S.loanOffers=[{id:'b1',bank:'db',amount:2e6,exp:S.day+20,covs:['fax'],apr:0.1,term:12,pay:Math.round(annuity(2e6,0.1,12)),share:0.05}];ACT.takeLoan({id:'b1'})");
  assert.ok(Math.abs(ev('R.cost.revshare') - ev('R.revMo') * 0.05) < 1, 'pays a share of revenue while the loan runs');
  // balloon: nothing monthly, everything at the end
  ev("S.loans=[];S.loanOffers=[{id:'bl',bank:'balloon',amount:100000,exp:S.day+20,covs:[],apr:0.12,term:3,pay:0,model:'balloon'}];ACT.takeLoan({id:'bl'})");
  assert.equal(ev('R.cost.loans'), 0, 'no monthly payment');
  const cash0 = ev('S.cash');
  for (let d = 0; d < 95; d++) ev('dayTick()');
  assert.equal(ev("S.loans.some(l=>l.id==='bl')"), false, 'the balloon is gone');
  assert.ok(ev('S.stats.loans') >= 1);
  // transit-paid loan: 30% of the transit bill
  ev("S.loans=[];S.loanOffers=[{id:'tp',bank:'ppp',amount:100000,exp:S.day+20,covs:[],term:24,model:'transit',cut:0.3,owe:130000,apr:0,pay:0}];ACT.takeLoan({id:'tp'})");
  assert.ok(Math.abs(ev('R.cost.loans') - Math.round(ev('R.cost.transit') * 0.3)) <= 1, 'pays with the transit bill');
  // fees and pizza
  ev("S.loans=[{id:'f1',bank:'jpm',start:S.day,amount:1,bal:1,apr:0,pay:0,left:12,term:12,share:0,covs:['nephew','pizza'],base:{sub:0}}];compute()");
  assert.equal(ev('R.cost.loans'), 3000, 'the nephew costs money every month');
  const c1 = ev('S.cash');
  ev("addInc({type:'cut',ref:'x',until:S.day+1,msg:'test',cost:0})");
  assert.equal(c1 - ev('S.cash'), 400, 'pizza after every incident');
  assert.match(ev("covLabel('yacht')"), /\$8\.0k\/mo/);
  assert.equal(ev("COVS.oddpops.ok()"), true);
  ev("ACT.buildPop({city:'ams'})");
  assert.equal(ev("COVS.oddpops.ok()"), false, 'two POPs break the numerologist');
  // the bank screen renders every model
  ev("S.loanOffers=[{id:'o1',bank:'balloon',amount:1e5,exp:S.day+20,covs:['oddpops'],apr:0.1,term:12,pay:0,model:'balloon'},{id:'o2',bank:'ppp',amount:1e5,exp:S.day+20,covs:['nocache'],term:24,model:'transit',cut:0.3,owe:130000},{id:'o3',bank:'astro',amount:1e5,exp:S.day+20,covs:['friday'],apr:0.2,term:12,pay:5000,model:'astro'}];ACT.bank({})");
  const t = ev("document.getElementById('bankCard').textContent");
  assert.match(t, /Nothing to pay until the end/);
  assert.match(t, /of your transit bill/);
  assert.match(t, /rate set by the stars/);
  assert.match(t, /numerologist/);
  assert.deepEqual(errors, []);
});

test('notifications: the NOC keeps the last ten minutes, folds repeats and opens what each is about', () => {
  const { ev, errors, dom } = load();
  const doc = dom.window.document;
  ev("let __t=1e12;Date.now=()=>__t;window.__tick=ms=>{__t+=ms};");
  ev("ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;for(const c of ['ams','lon'])ACT.buildPop({city:c});UI.via=null;openLinkModal('ams','lon');ACT.buildLink({tier:1});closeModal();S.log=[];UI.logSeen=0");
  const linkId = ev("S.links.find(l=>[l.a,l.b].includes('ams')&&[l.a,l.b].includes('lon')).id");
  // what each notice is about: its own button, a link between two of your cities, one of your cities, or nothing
  ev("toast('<b>Customer upset</b><br>Fix it.','bad',[{l:'Show me',act:'focusCity',args:{city:'fra'}}])");
  ev("toast('<b>Fiber cut</b><br>Your Amsterdam–London link is down.','bad')");
  ev("toast('<b>Router crashed</b><br>Your router in London is rebooting.','bad')");
  ev("toast('<b>Raffle</b><br>You won a T-shirt.','good')");
  const os = JSON.parse(ev("JSON.stringify(S.log.map(e=>e.o))"));
  assert.deepEqual(os, [null, { a: 'city', v: 'lon' }, { a: 'link', v: linkId }, { a: 'city', v: 'fra' }]);
  assert.equal(ev("S.log[0].h"), 'Raffle'); assert.equal(ev("S.log[0].t"), 'Raffle You won a T-shirt.');
  // an incident points at what broke
  assert.deepEqual(JSON.parse(ev(`JSON.stringify(incOpen({ref:'${linkId}'}))`)), { a: 'link', v: linkId });
  assert.deepEqual(JSON.parse(ev("JSON.stringify(incOpen({ref:S.links[0].trench||S.links[0].id}))")), { a: 'link', v: ev('S.links[0].id') });
  // repeats within a minute fold into one line with a count; numbers in the title do not split them
  ev("for(let i=1;i<=5;i++)toast('<b>'+i+' new sessions at HAMS-IX.</b><br>Small networks.','')");
  assert.equal(ev("S.log.length"), 5); assert.equal(ev("S.log[0].n"), 5); assert.equal(ev("S.log[0].h"), '5 new sessions at HAMS-IX.');
  ev("__tick(61000);toast('<b>1 new session at HAMS-IX.</b><br>Small networks.','')");
  assert.equal(ev("S.log.length"), 6, 'a minute later it starts a new line');
  // the NOC shows them right after the incidents, with Open where there is something to open
  assert.equal(ev("logUnread()"), 6);
  ev("renderHUD()"); assert.equal(doc.getElementById('hNocNew').hidden, true, 'no unread count on the NOC button (2.0)');
  ev("UI.left='noc';UI.leftOpen=true;UI.sel=null;renderLeft();renderHUD()");
  const body = doc.getElementById('leftBody').textContent;
  assert.match(body, /Notifications\s*last 10 minutes/);
  assert.ok(body.indexOf('Notifications') < body.indexOf('DDoS scrubbing'), 'near the top, not at the bottom');
  assert.match(body, /×5/); assert.match(body, /just now/);
  assert.equal(doc.querySelectorAll('#leftBody [data-act=logOpen]').length, 2, 'Open only where it leads somewhere (2 of the 5 shown)');
  assert.equal(ev("logUnread()"), 0);
  ev("ACT.logAll()"); assert.equal(doc.querySelectorAll('#leftBody .note').length, 6); assert.equal(doc.querySelectorAll('#leftBody [data-act=logOpen]').length, 3);
  // Open goes there
  ev("ACT.logOpen({id:S.log.find(e=>e.o&&e.o.a==='link').id})"); assert.equal(ev("UI.sel.type+':'+UI.sel.id"), 'link:' + linkId);
  ev("ACT.logOpen({id:S.log.find(e=>e.o&&e.o.a==='city'&&e.o.v==='lon').id})"); assert.equal(ev("UI.sel.type+':'+UI.sel.id"), 'city:lon');
  ev(`S.links=S.links.filter(l=>l.id!=='${linkId}');ACT.logOpen({id:S.log.find(e=>e.o&&e.o.a==='link').id})`);
  assert.equal(ev("S.log[0].h"), 'That link is gone.', 'a removed link says so instead of failing silently');
  // ten minutes later it is gone from the list, but stays in the save's log
  ev("__tick(10*60*1000+1000);UI.left='noc';renderLeft()");
  assert.match(doc.getElementById('leftBody').textContent, /Nothing in the last 10 minutes/);
  assert.ok(ev("S.log.length") > 0);
  // saves: junk is dropped, old entries without a time stay but are not shown
  ev("S.log.push({t:'old',k:'weird',o:{a:'city',v:'atlantis'},n:'many'},{t:5},{t:'x',o:{a:'tab',v:'evil'}},{t:'y',o:{a:'link',v:'l1'},at:'soon'});S=sanitize(S)");
  const tail = JSON.parse(ev("JSON.stringify(S.log.slice(-3))"));
  assert.deepEqual(tail.map(e => [e.t, e.k, e.o, e.n, e.at]), [['old', '', null, 1, 0], ['x', '', null, 1, 0], ['y', '', { a: 'link', v: 'l1' }, 1, 0]]);
  // phones: the NOC tab shows no numbers, only a red dot while something is broken
  ev("__tick(1000);toast('<b>Router crashed</b><br>Your router in London is rebooting.','bad');UI.left='goals';UI.leftOpen=false");
  dom.window.innerWidth = 360; ev("renderAll&&renderAll()");
  const nocTab = [...doc.querySelectorAll('#tabbar [data-act=phoneTab]')].find(b => JSON.parse(b.dataset.args).t === 'noc');
  assert.equal(nocTab.querySelector('.cnt'), null, 'no number for unread notifications on the NOC tab');
  ev("S.inc.push({id:'x1',type:'crash',city:'lon',msg:'',until:S.day+3});renderAll()");
  const nocTab2 = [...doc.querySelectorAll('#tabbar [data-act=phoneTab]')].find(b => JSON.parse(b.dataset.args).t === 'noc');
  assert.ok(nocTab2.querySelector('.cnt.dot.red'), 'a live incident shows a red dot');
  assert.equal(nocTab2.querySelector('.cnt').textContent, '', 'and no number');
  assert.deepEqual(errors, []);
});

test('the broadband panel shows what homes in that city really pay, not the base rate', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'del'})");
  assert.equal(ev('CITY.del.arpu'), 0.4);
  assert.match(ev("cityPanel('del')"), new RegExp('Pays \\' + ev('fmt$(EYE_RATE*CITY.del.arpu)') + ' per Gbps'), 'Delhi homes pay 40% of the base rate');
  assert.match(ev("cityPanel('fra')"), new RegExp('Pays \\' + ev('fmt$(EYE_RATE)') + ' per Gbps'), 'a city without its own rate pays the base rate');
  ev("const t=NETS.find(n=>n.price&&n.pops.includes('del'));ACT.buyTransit({city:'del',net:t.id,tier:1});ACT.launchBB({city:'del'});compute()");
  const rev = ev("fmt$(R.cityEye.del*sfOf(R,'del')*EYE_RATE*CITY.del.arpu)");
  assert.ok(ev("R.cityEye.del*sfOf(R,'del')") > 0);
  assert.ok(ev("cityPanel('del')").includes(rev + '/mo'), `revenue line matches what the month pays (${rev})`);
  assert.deepEqual(errors, []);
});

// Custom routing metrics: a fra–ams–par triangle where the direct fra–par link is normally shortest.
const triangle = (ev) => {
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("for(const c of ['ams','par'])ACT.buildPop({city:c});const L=(a,b)=>{UI.via=null;openLinkModal(a,b);ACT.buildLink({tier:1});closeModal();};L('fra','ams');L('ams','par');L('fra','par');compute()");
  ev("window.FP=S.links.find(l=>(l.a==='fra'&&l.b==='par')||(l.a==='par'&&l.b==='fra')).id;window.FK=edgeKey(S.links.find(l=>l.id===FP));window.pmOf=()=>S.pairMet[FK];window.hops=()=>JSON.stringify(trPaths('fra').path('par').map(h=>h.l.id))");
};

test('a custom multiplier routes exactly like the matching preset', () => {
  const { ev, errors } = load();
  triangle(ev);
  assert.equal(ev("hops()"), JSON.stringify([ev("FP")]), 'direct link wins by default');
  ev("ACT.setMetric({id:FP,v:'avoid'})");
  const avoid = ev("JSON.stringify({h:hops(),load:R.load,served:R.served})");
  ev("ACT.setMetric({id:FP,v:'custom'})");
  assert.equal(ev("pairMet(FK)"), 'custom');
  const m = ev("pmOf()");
  assert.equal(m.k, 'f');
  assert.equal(m.v, 4, 'custom starts from the preset it replaces');
  assert.equal(ev("JSON.stringify({h:hops(),load:R.load,served:R.served})"), avoid);
  ev("ACT.setMetric({id:FP,v:'normal'})");
  assert.equal(ev("FK in S.pairMet"), false, 'presets drop the custom metric');
  assert.deepEqual(errors, []);
});

test('an absolute custom cost steers the path, and switching modes keeps the cost', () => {
  const { ev, errors } = load();
  triangle(ev);
  ev("ACT.setMetric({id:FP,v:'custom'});ACT.metricMode({id:FP,k:'w'})");
  const l = ev("S.links.find(l=>l.id===FP)");
  assert.equal(ev("pmOf().k"), 'w');
  assert.equal(ev("pmOf().v"), Math.round(l.km + 60), 'switching to cost keeps the effective metric');
  ev("ACT.selLink({id:FP});renderAll();$('metIn').value='65535';ACT.metricSet({id:FP})");
  assert.equal(ev("pmOf().v"), 65535);
  assert.ok(!JSON.parse(ev("hops()")).includes(ev("FP")), 'a huge cost sends traffic round via Amsterdam');
  ev("renderAll();$('metIn').value='1';ACT.metricSet({id:FP})");
  assert.equal(ev("hops()"), JSON.stringify([ev("FP")]));
  ev("ACT.metricMode({id:FP,k:'f'})");
  assert.equal(ev("pmOf().v"), 0.1, 'converted back to a multiplier, clamped to the minimum');
  assert.deepEqual(errors, []);
});

test('custom metric input is validated and clamped', () => {
  const { ev, errors } = load();
  triangle(ev);
  ev("ACT.setMetric({id:FP,v:'custom'});ACT.selLink({id:FP});renderAll()");
  ev("$('metIn').value='';ACT.metricSet({id:FP})");
  assert.equal(ev("pmOf().v"), 1, 'empty input changes nothing');
  ev("renderAll();$('metIn').value='9999';ACT.metricSet({id:FP})");
  assert.equal(ev("pmOf().v"), 100);
  ev("renderAll();$('metIn').value='0';ACT.metricSet({id:FP})");
  assert.equal(ev("pmOf().v"), 0.1);
  ev("ACT.metricMode({id:FP,k:'x'});ACT.setMetric({id:FP,v:'bogus'})");
  assert.equal(ev("pairMet(FK)"), 'custom');
  assert.deepEqual(errors, []);
});

test('custom metrics survive a save, and broken ones are repaired', () => {
  const { ev, errors } = load();
  triangle(ev);
  ev("ACT.setMetric({id:FP,v:'custom'});ACT.metricMode({id:FP,k:'w'});pmOf().v=777;S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(pmOf())")), { k: 'w', v: 777 });
  ev("S.pairMet[FK]={k:'zz',v:'lots'};S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(pmOf())")), { k: 'f', v: 1 });
  ev("S.pairMet[FK]={k:'w',v:1e9};S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev("pmOf().v"), 65535);
  // An old save: a preset metric on the link itself, from before metrics moved to the city pair.
  ev("delete S.pairMet[FK];S.links.find(l=>l.id===FP).metric='avoid';S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.equal(ev("pmOf()"), 'avoid');
  assert.equal(ev("'metric' in S.links.find(l=>l.id===FP)"), false);
  assert.equal(JSON.parse(ev("hops()")).length, 2, 'the old save still routes, avoiding the direct link');
  assert.deepEqual(errors, []);
});

test('preset buttons stay plain, and Custom explains the numbers, also on phones', () => {
  const { ev, dom, errors } = load();
  triangle(ev);
  for (const w of [1280, 390]) {
    ev(`window.innerWidth=${w};ACT.setMetric({id:FP,v:'normal'});ACT.selLink({id:FP});renderAll()`);
    const doc = dom.window.document;
    const btns = [...doc.querySelectorAll('#panel [data-act="setMetric"]')];
    assert.equal(btns.length, 5);
    const km = ev("S.links.find(l=>l.id===FP).km");
    assert.deepEqual(btns.map(b => b.textContent), ['Prefer', 'Normal', 'Avoid', 'Backup only', 'Custom']);
    assert.equal(doc.getElementById('metIn'), null);
    assert.doesNotMatch(doc.getElementById('panel').textContent, /times a multiplier/);
    ev("ACT.setMetric({id:FP,v:'custom'})");
    assert.ok(doc.getElementById('metIn'), `custom editor at ${w}px`);
    assert.ok(doc.querySelector('#panel [data-act="metricMode"]'));
    const txt = doc.getElementById('panel').textContent;
    assert.match(txt, /times a multiplier/);
    assert.match(txt, new RegExp(`Normal ×1 = ${Math.round(km + 60)}, Avoid ×4 = ${Math.round((km + 60) * 4)}`));
    assert.match(txt, /Multiplier: scales the distance cost/);
    assert.match(txt, /Cost on this link/);
    ev("ACT.metricMode({id:FP,k:'w'})");
    assert.match(doc.getElementById('panel').textContent, /Cost: the exact number/);
  }
  assert.deepEqual(errors, []);
});

test('a custom metric belongs to the city pair, like the presets, and a standby link keeps it', () => {
  const { ev, errors } = load();
  triangle(ev);
  ev("UI.via=null;openLinkModal('fra','par');ACT.buildLink({tier:1});closeModal();compute()");
  ev("ACT.setMetric({id:FP,v:'custom'});ACT.metricMode({id:FP,k:'w'});ACT.selLink({id:FP});renderAll();$('metIn').value='65535';ACT.metricSet({id:FP})");
  const other = ev("S.links.find(l=>l.id!==FP&&edgeKey(l)===FK).id");
  assert.equal(ev(`pairMet(edgeKey(S.links.find(l=>l.id==='${other}')))`), 'custom', 'the second link between the cities shares it');
  ev(`ACT.setStandby({id:'${other}',on:1})`);
  assert.ok(!JSON.parse(ev("hops()")).includes(ev("FP")), 'the pair is still avoided');
  assert.equal(ev("pmOf().v"), 65535);
  // Removing every link of the pair drops the metric with it.
  ev("S.links=S.links.filter(l=>edgeKey(l)!==FK);prunePairMet()");
  assert.equal(ev("FK in S.pairMet"), false);
  assert.deepEqual(errors, []);
});


test('overlapping DDoS saves round trip and legacy attacks migrate safely', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.ev.ddos={city:'fra',vec:'dns',gbps:'80',until:7,start:0};delete S.ev.ddosMore;delete S.ddosStarts;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('ddosAll().length'), 1);
  assert.equal(ev('S.ev.ddos.gbps'), 80);
  assert.equal(ev('S.ev.ddosMore.length'), 0);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.ddosStarts)')), [0]);
  ev("S.ev.ddosMore=[{id:'overlap',city:'fra',vec:'ack',gbps:50,until:5,start:0,sla:['customer']},null,{city:'bad',vec:'dns'}, {city:'fra',vec:'unknown'}];S.ddosStarts=[0,'bad',Infinity,-9,99];S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('ddosAll().length'), 2);
  assert.equal(ev('S.ev.ddosMore[0].id'), 'overlap');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.ddosStarts)')), [0]);
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.equal(ev('R.ddos.length'), 2);
  assert.deepEqual(errors, []);
});

