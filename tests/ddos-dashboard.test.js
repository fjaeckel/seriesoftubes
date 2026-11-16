// The NOC dashboard's DDoS tab: attacks under way with the NOC card's buttons, the game's totals, and every finished
// attack kept in the save (S.ddosLog). Attacks your network holds, and Auto-RTBH pulling the plug, go to the NOC log
// instead of popping up; an attack that hurts still pops up, and its button opens the tab.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// Frankfurt with 200 G of subscribers, one 100G Cogentle transit, a game server (the usual target) and a DIA customer.
function fra(ev) {
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40;ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  ev("S.pops.fra.rgen=RG.findIndex(r=>r.n==='Arrrhipster 7280R')");
  ev("S.biz.push({id:'g',type:'game',name:'Lag Lords',city:'fra',bw:10,rate:100,mood:80,since:0,reqs:[]},{id:'d',type:'dia',name:'Bystander',city:'fra',bw:5,rate:100,mood:80,since:0,reqs:[]});S.day=60;compute()");
}
const flood = (ev, o) => ev(`(()=>{const a=Object.assign({id:'a'+Math.random().toString(36).slice(2,7),city:'fra',tgt:'g',vec:'dns',gbps:200,start:S.day,until:S.day+1,bh:false},${lit(o || {})});if(!S.ev.ddos)S.ev.ddos=a;else S.ev.ddosMore.push(a);compute();return a.id})()`);
const spy = (ev) => ev("window.__t=[];{const t=toast;toast=(m,k,x,o)=>{__t.push({m,k,x:x||[]});return t(m,k,x,o)};}");
const log = (ev) => JSON.parse(ev('JSON.stringify(S.ddosLog)'));
// Text the player sees in the dashboard, checked for placeholders, undefined, NaN and raw labels.
function leaks(ev) {
  const txt = ev("document.getElementById('dashCard').textContent"), out = [];
  for (const m of txt.match(/[^\n]{0,30}(\{[a-z]\w*\}|undefined|NaN)[^\n]{0,30}/g) || []) out.push(m);
  for (const m of txt.match(/[a-z0-9_]+(\.[a-z0-9_]+)+/g) || []) if (ev(`!!EN[${lit(m)}]`)) out.push('raw label: ' + m);
  return out;
}

test('each finished attack goes into the history once, with how it ended', () => {
  const { ev, errors } = load();
  fra(ev);
  assert.deepEqual(log(ev), [], 'a new game starts with an empty history');
  // One a day: soaked up, then one that fills the port and hurts everyone, then one blackholed by hand.
  flood(ev, { gbps: 2, until: 61 }); ev('dayTick()');
  flood(ev, { gbps: 200, tgt: 'd', vec: 'ntp', start: 61, until: 62 }); ev('dayTick()');
  const sac = flood(ev, { gbps: 300, vec: 'memcached', start: 62, until: 63 });
  ev(`ACT.rtbh({id:'${sac}'})`);
  ev('dayTick()');
  assert.equal(ev('ddosAll(S,false).length'), 0, 'all three are over');
  const L = log(ev);
  assert.equal(L.length, 3, 'one entry each');
  const by = Object.fromEntries(L.map((e) => [e.g, e]));
  assert.equal(by[2].o, 'h'); assert.ok(by[2].w >= 0.97); assert.equal(by[2].t, 'game'); assert.equal(by[2].n, 'Lag Lords');
  assert.equal(by[200].o, 'l'); assert.ok(by[200].x >= 0.01, 'it cost everyone else'); assert.equal(by[200].v, 'ntp'); assert.equal(by[200].t, 'dia');
  assert.equal(by[300].o, 's'); assert.equal(by[300].bh, 1, 'blackholed by hand');
  assert.deepEqual(L.map((e) => [e.s, e.d, e.c]), [[62, 63, 'fra'], [61, 62, 'fra'], [60, 61, 'fra']], 'newest first');
  // The totals the tab shows agree with the list.
  assert.deepEqual([ev('S.stats.ddosHeld'), ev('S.stats.ddosSac'), ev('S.stats.ddosLost'), ev('S.stats.ddosMax')], [1, 1, 1, 300]);
  // Days later, nothing is counted again; an attack started by the game (with its incident) is counted once too.
  ev('dayTick();dayTick()');
  assert.equal(log(ev).length, 3);
  const d0 = ev('S.day');
  ev("const a=ddosAttack(false);a.until=S.inc.at(-1).until=S.day+1;dayTick();dayTick();dayTick()");
  assert.equal(log(ev).length, 4, 'the game\'s own attack, once');
  assert.ok(log(ev)[0].d > d0, 'newest first');
  // Only small plain fields.
  for (const e of log(ev)) for (const v of Object.values(e)) assert.ok(['number', 'string'].includes(typeof v));
  assert.deepEqual(errors, []);
});

test('the history is capped, kept in the save, and a tampered one is repaired', () => {
  const { ev, errors } = load();
  fra(ev);
  ev("for(let i=0;i<130;i++){S.day=60+i;ddosDone({id:'x'+i,city:'fra',tgt:'bb:fra',vec:'syn',gbps:i+1,start:S.day,until:S.day,bh:false});}");
  const L = log(ev);
  assert.equal(L.length, ev('DDOS_LOG'));
  assert.equal(L[0].g, 130, 'newest first'); assert.equal(L.at(-1).g, 31, 'the oldest drop off');
  assert.equal(L[0].t, '', 'broadband subscribers have no customer type');
  // Through a real save and load.
  const back = JSON.parse(ev("(()=>{const q=parseSave(JSON.stringify(packSave(S)));S=migrate(q.s);return JSON.stringify(S.ddosLog)})()"));
  assert.deepEqual(back, L);
  // An old save without the field loads with an empty history.
  assert.equal(ev("(()=>{const s=JSON.parse(JSON.stringify(S));delete s.ddosLog;return migrate(s).ddosLog.length})()"), 0);
  // A tampered one: junk dropped, numbers clamped, unknown types and stray fields gone, at most DDOS_LOG kept.
  const fixed = JSON.parse(ev(`(()=>{const s=JSON.parse(JSON.stringify(S));s.ddosLog=[null,'x',42,{d:5,v:'nope',c:'fra',o:'h'},{d:5,v:'syn',c:'atlantis',o:'h'},{d:5,v:'syn',c:'fra',o:'won'},
    {d:'1e400',s:-5,g:'9e99',v:'syn',c:'fra',t:'nope',n:'<b>x</b>',o:'l',w:7,x:-3,bh:9,sc:'yes',hk:0,evil:{a:1}},
    {d:70,s:68,g:12,v:'dns',c:'fra',t:'game',n:${lit('A'.repeat(500))},o:'s',w:0.5,x:0.2,bh:2,sc:1,hk:1}].concat(Array.from({length:150},(_,i)=>({d:i,s:i,g:1,v:'syn',c:'fra',t:'',n:'',o:'h',w:1,x:0,bh:0,sc:0,hk:0})));
    return JSON.stringify(migrate(s).ddosLog)})()`));
  assert.equal(fixed.length, ev('DDOS_LOG'));
  assert.deepEqual(fixed[0], { d: 0, s: 0, g: 1e6, v: 'syn', c: 'fra', t: '', n: '', o: 'l', w: 1, x: 0, bh: 2, sc: 1, hk: 0 });
  assert.equal(fixed[1].n.length, 60); assert.equal(fixed[1].t, 'game'); assert.equal(fixed[1].bh, 2);
  // Routing never reads it, so a new entry does not route the network again.
  assert.equal(ev("RK_SKIP.has('ddosLog')"), true);
  assert.deepEqual(errors, []);
});

test('the tab shows attacks under way with their buttons, the totals and the history, on a phone and a wide screen, in every language', () => {
  for (const lang of ['en', 'it', 'pt', 'fr', 'es', 'de']) {
    const { ev, errors } = load(lang === 'en' ? {} : { lang });
    fra(ev);
    ev("for(let i=0;i<30;i++){S.day=40+i;ddosDone({id:'x'+i,city:'fra',tgt:i%2?'g':'bb:fra',vec:i%3?'syn':'dns',gbps:i*7+1,start:S.day,until:S.day,bh:false,sac:i%5===0?1:0,au:i%10===0?1:0,scr:i%4===0?1:0,hk:i===7?1:0,worst:i%3?0.5:1,colMax:i%6===1?0.2:0});}S.day=80;S.stats.hackback=2;S.stats.hackWin=1;");
    const live = flood(ev, { gbps: 200 });
    for (const w of [390, 1280]) {
      ev(`window.innerWidth=${w};$('dash').hidden=true;ACT.ddosOpen()`);
      assert.equal(ev("$('dash').hidden"), false, 'the dashboard opens');
      assert.equal(ev('UI.dtab'), 'ddos');
      const has = (sel) => ev(`!!document.querySelector('#dashCard ${sel.replace(/'/g, "\\'")}')`);
      assert.ok(has('.dtabs [data-args*="ddos"] .cnt.red'), 'the tab shows the attack count');
      assert.ok(has(`[data-act="rtbh"][data-args*="${live}"]`), `${lang} ${w}: RTBH button for the live attack`);
      assert.ok(has('[data-act="hackback"]') && has('[data-act="dashPop"]'), 'hack back and the POP');
      assert.ok(has('[data-act="routingOpen"]'), 'the settings');
      assert.equal(ev("document.querySelectorAll('#dashCard .ddtiles .tile').length"), 5);
      // 20 of the 30 on the first page, the rest a tap away.
      if (w < 760) { assert.equal(ev("document.querySelectorAll('#dashCard #ddosSec .ddrow').length"), 20); assert.ok(!has('.ddtbl')); }
      else { assert.equal(ev("document.querySelectorAll('#dashCard .ddtbl tbody tr').length"), 20); assert.ok(!has('.ddrow')); }
      assert.ok(has('[data-act="listMore"][data-args*="ddos"]'));
      assert.deepEqual(leaks(ev), [], `${lang} ${w}`);
    }
    // Filtered by outcome; the same chip again shows all.
    ev("ACT.ddosF({v:'s'})");
    assert.equal(ev("document.querySelectorAll('#dashCard .ddtbl tbody tr').length"), ev("S.ddosLog.filter(e=>e.o==='s').length"));
    assert.ok(ev("S.ddosLog.filter(e=>e.o==='s').length") > 1);
    ev("ACT.ddosF({v:'s'})");
    assert.equal(ev('UI.ddF'), '');
    ev('ACT.listMore({k:"ddos"})');
    assert.equal(ev("document.querySelectorAll('#dashCard .ddtbl tbody tr').length"), 30);
    assert.deepEqual(errors, [], lang);
  }
});

test('empty states: no attack yet, none under way, and an older game whose attacks are only in the totals', () => {
  const { ev, errors } = load();
  fra(ev);
  ev("$('dash').hidden=false;UI.dtab='ddos';UI._dh=null;renderDash()");
  const txt = () => ev("document.getElementById('dashCard').textContent");
  assert.match(txt(), /No attack under way/);
  assert.match(txt(), /No attack yet/);
  assert.ok(ev("!!document.querySelector('#dashCard [data-act=\"routingOpen\"]')"));
  assert.equal(ev("!!document.querySelector('#dashCard .dtabs [data-args*=\"ddos\"] .cnt')"), false, 'no count on the tab');
  ev("S.stats.ddosHeld=3;UI._dh=null;renderDash()");
  assert.match(txt(), /only in the totals/);
  assert.deepEqual(errors, []);
});

test('a held attack and Auto-RTBH go to the NOC log; an attack that hurts still pops up, and its button opens the tab', () => {
  const { ev, errors } = load();
  fra(ev);
  spy(ev);
  flood(ev, { gbps: 2, fresh: 1 });
  ev('ddosNews()');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(__t)')), [], 'nothing pops up for an attack nobody notices');
  assert.match(ev('S.log[0].t'), /attack is hitting Lag Lords/);
  assert.equal(ev('S.log[0].k'), 'good');
  // Auto-RTBH pulls the plug on a flood that fills the port: logged, not popped, and shown on the attack's card.
  ev("ddosDrop(S.ev.ddos);S.ddosAuto.rtbh=true;__t=[]");
  const id = flood(ev, { gbps: 200, fresh: 1 });
  ev('ddosNews()');
  assert.equal(ev(`ddosFind('${id}').bh`), true);
  assert.equal(ev(`ddosFind('${id}').au`), 1);
  // The attack itself still pops up once (its target is dark), but Auto-RTBH's own notice does not.
  assert.deepEqual(JSON.parse(ev('JSON.stringify(__t.map(t=>/Auto-RTBH/.test(t.m)))')), [false], 'Auto-RTBH does not pop up');
  assert.ok(ev("S.log.some(e=>/Auto-RTBH/.test(e.t)&&e.k==='bad')"));
  assert.match(ev(`ddosOne(ddosFind('${id}'),true)`), /Auto-RTBH blackholed the target/);
  ev('dayTick();dayTick()');
  assert.equal(log(ev)[0].bh, 2, 'remembered as Auto-RTBH');
  // A flood that hurts, with Auto-RTBH off: the toast, its alert, and a button to the DDoS tab.
  ev("S.ddosAuto.rtbh=false;__t=[];$('dash').hidden=true");
  flood(ev, { gbps: 200, fresh: 1 });
  ev('ddosNews()');
  // (The once-a-game lesson about full ports comes with it, as before.)
  const t = JSON.parse(ev('JSON.stringify(__t.filter(t=>t.k===\'bad\'))'));
  assert.equal(t.length, 1); assert.match(t[0].m, /attack is hitting/);
  assert.ok(ev("__t.some(t=>t.m===tr('ddos.learn_port'))"));
  assert.deepEqual(t[0].x.map((a) => a.act), ['ddosOpen']);
  ev('ACT.ddosOpen()');
  assert.equal(ev("$('dash').hidden"), false); assert.equal(ev('UI.dtab'), 'ddos');
  // The NOC tab's card links to the dashboard's tab.
  ev("UI.left='noc';UI.leftOpen=true;renderLeft()");
  assert.ok(ev("!!document.querySelector('#leftBody [data-act=\"ddosOpen\"]')"));
  assert.deepEqual(errors, []);
});
