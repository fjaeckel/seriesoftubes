const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = ev => ev("beginGame('Outcast','fra',{mode:'normal',preset:'oncall',rules:{mods:['outcast']}});if(UI.pendGame)ACT.pitchSkip()");

test('Outcast blocks built-in IX ports and additions without blocking own IXes or PNIs', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev("peerOk('cog','ix','fra').why"), ev("tr('sold_out.outcast_blocks_public_ix_peering')"), 'public IX refusals use their own short reason');
  ev("S.cash=1e12;ACT.buyIx({city:'fra',tier:1,signed:true})");
  assert.equal(ev('S.ixp.fra'), undefined, 'even a signed purchase cannot add a public IX port');
  ev("S.ixp.fra=0;S.ixn={fra:1};ACT.lagIx({city:'fra',d:1})");
  assert.equal(ev('S.ixn.fra'), 1, 'a direct action cannot add a public IX LAG member');
  assert.doesNotMatch(ev("ixBlock('fra',false)"), /data-act="buyIx"/, 'the POP panel hides public port purchases');
  assert.doesNotMatch(ev("connUp({k:'ix',id:'fra'})"), /data-act="buyIx"|data-act="lagIx"[^>]+d&amp;quot;?:1/, 'the connections dashboard hides upgrades and LAG additions');
  assert.equal(ev("opsTplQuote('ams').ix"), null, 'the POP template does not include a public IX port');

  const city = ev("CITIES.find(c=>!c.ix&&!c.cn&&!c.off).id");
  ev(`S.lvl=LEVELS.length;ACT.buildPop({city:'${city}'});ACT.foundIx({city:'${city}'})`);
  assert.equal(ev(`!!S.myIx['${city}']`), true, 'founding your own exchange remains available');
  assert.notEqual(ev(`peerOk('cog','ix','${city}').why`), ev("tr('sold_out.outcast_blocks_public_ix_peering')"), 'peering at your own IX is not refused');
  ev("window.__pni=NETS.filter(n=>!n.fed&&n.pol==='open'&&n.pops.includes('fra')).map(n=>pniQuote('fra',n.id,1)).find(q=>q&&!q.why);if(window.__pni)ACT.pni({city:'fra',net:window.__pni.net,tier:1})");
  assert.ok(ev('window.__pni'), 'a valid PNI quote remains available');
  assert.equal(ev("S.pni.some(p=>p.net===window.__pni.net&&p.city==='fra')"), true);
  assert.deepEqual(errors, []);
});

test('additional modifiers survive Normal saves and are cleared from Sandbox and scenarios', () => {
  const { ev, errors } = load();
  start(ev);
  ev('S=migrate(JSON.parse(JSON.stringify(S)))');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.rules.mods)')), ['outcast']);
  assert.equal(ev("modeOn('outcast')"), true);
  ev("S.mode='sandbox';S.rules.mods=['outcast'];sanitize(S)");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.rules.mods)')), []);
  assert.equal(ev("modeOn('outcast')"), false);
  ev("beginGame('Scenario','stg',{scn:SCN.find(x=>x.id==='stg')});S.rules.mods=['outcast'];sanitize(S)");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.rules.mods)')), []);
  assert.equal(ev("modeOn('outcast')"), false);
  assert.deepEqual(errors, []);
});

test('Outcast and Multimode cannot be selected or joined together', () => {
  const { ev, dom, errors } = load();
  ev("FU.can=true;UI.mode='normal';UI.mods=[];UI.fs={on:false,url:null,typed:'',inv:null,note:null};showTitle()");
  const doc=dom.window.document;
  assert.ok(doc.querySelector('#fsTog'), 'Multimode is available before a challenge option is selected');
  doc.querySelector('.add-options summary').click();
  doc.querySelector('[data-mode-id=outcast]').click();
  assert.equal(doc.querySelector('#fsTog'), null, 'selecting Outcast hides the Multimode switch');
  ev("UI.fs.on=true;UI.fs.url='wss://s1.seriesoftub.es/fed'");
  assert.equal(ev('fsChoice()'), undefined, 'a remembered server choice is ignored in challenge mode');
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(ev('S.fed'), null, 'a challenge-mode game starts without Multimode');
  assert.equal(ev('fedEligible(S)'), false);
  assert.deepEqual(errors, []);
});
test('Outcast says how to get its IX goals: found your own exchange', () => {
  const { ev, errors } = load();
  start(ev);
  ev("UI.left='goals';renderAll()");
  const goals = () => ev("document.getElementById('leftBody').textContent");
  assert.match(goals(), /found your own exchange in a city that has none/, 'the IX goal points at founding one');
  assert.doesNotMatch(goals(), /Get a port at an IX/);
  assert.match(goals(), /your own count/, 'Tier 2 counts your own exchanges');
  assert.match(ev("ixBlock('fra',false)"), /Found your own exchange in a city that has none/, 'a public IX says what to do instead');
  // A normal game keeps the usual words.
  ev("beginGame('Normal','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();UI.left='goals';renderAll()");
  assert.match(goals(), /Get a port at an IX/);
  assert.deepEqual(errors, []);
});
