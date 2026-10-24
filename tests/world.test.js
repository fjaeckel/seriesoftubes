const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('the world: thousands of cities, every PoP and exchange refers to a real one', () => {
  const { ev, errors } = load();
  assert.ok(ev('CITIES.length') > 4000, 'cities from GeoNames and PeeringDB');
  assert.equal(ev("CITIES.filter(c=>!c.land||!isFinite(c.x)||!isFinite(c.y)||!(c.P>0)||!c.name).length"), 0, 'every city has a landmass, a place on the map and some people');
  assert.equal(ev("new Set(CITIES.map(c=>c.id)).size"), ev('CITIES.length'), 'ids are unique');
  assert.equal(ev("NETS.filter(n=>n.pops.some(c=>!CITY[c])).length"), 0, 'PoPs are cities');
  assert.equal(ev("NETS.filter(n=>n.ix.some(x=>!(CITY[x]&&CITY[x].ix)&&!XIXM[x])).length"), 0, 'exchange memberships are exchanges');
  assert.equal(ev("NETS.filter(n=>n.ix.some(x=>!n.pops.includes(ixCity(x)))).length"), 0, 'a network on an exchange has a PoP in its city');
  assert.equal(ev("XIX.filter(x=>!CITY[x.c]||!ixMembers(x.id).length).length"), 0, 'challenger exchanges have a metro and members');
  assert.deepEqual(errors, []);
});

test('networks carry their real names and AS numbers', () => {
  const { ev } = load();
  const asn = (id) => ev(`NET.${id}.asn`), name = (id) => ev(`NET.${id}.name`);
  assert.deepEqual([asn('lvl'), asn('cog'), asn('ggl'), asn('cfl'), asn('nfx'), asn('drz'), asn('ntt'), asn('tly')], [3356, 174, 15169, 13335, 2906, 6939, 2914, 1299]);
  assert.deepEqual([name('lvl'), name('cog'), name('ggl'), name('nfx')], ['Lumen', 'Cogent', 'Google', 'Netflix']);
  assert.equal(ev("new Set(NETS.map(n=>n.asn)).size"), ev('NETS.length'), 'no AS number appears twice');
  assert.equal(ev("NETS.some(n=>/Cogentle|Goggle|Faceplant|Level Tree/.test(JSON.stringify(n)))"), false, 'no cartoon names left');
});

test('transit is sold only in cities where a transit network really has a PoP', () => {
  const { ev } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0");
  const none = ev("CITIES.find(c=>!sellersAt(c.id).length&&!c.cn&&!c.ru&&c.P>50).id");
  ev(`ACT.buildPop({city:'${none}'});ACT.buyTransit({city:'${none}',net:'cog',tier:0})`);
  assert.equal(ev('S.transit.length'), 0, 'refused: nobody sells there');
  const some = ev("CITIES.find(c=>sellersAt(c.id).length>3&&!c.cn&&!c.ru&&!S.pops[c.id]).id");
  const net = ev(`sellersAt('${some}')[0].id`);
  ev(`ACT.buildPop({city:'${some}'});ACT.buyTransit({city:'${some}',net:'${net}',tier:0})`);
  assert.equal(ev('S.transit.length'), 1);
});

test('home city search finds any city and says whether anyone sells transit there', () => {
  const { ev } = load();
  const m = JSON.parse(ev("JSON.stringify(cityMatches('manch').map(c=>c.name))"));
  assert.ok(m.includes('Manchester'));
  assert.ok(ev("cityMatches('zzzzqqqq').length") === 0);
  assert.ok(ev("cityMatches('são paulo').length") > 0 && ev("cityMatches('sao paulo').length") > 0, 'accents do not matter');
  const none = ev("CITIES.find(c=>!sellersAt(c.id).length&&c.P>200).id");
  assert.match(ev(`startCard('${none}')`), /Nobody sells transit here/);
  assert.doesNotMatch(ev("startCard('fra')"), /Nobody sells/);
  ev("showTitle()");
  assert.ok(ev("document.getElementById('cityQ')"), 'the title screen has a search box');
  assert.match(ev("document.querySelector('.disc').textContent"), /work of fiction/);
});

test('start anywhere: any city can be the home city', () => {
  const { ev, errors } = load();
  const c = ev("CITIES.find(c=>c.gen&&sellersAt(c.id).length>3&&!c.cn&&!c.ru).id");
  ev(`UI.startCity='${c}';ACT.start({})`);
  assert.equal(ev('S.home'), c);
  assert.ok(ev(`S.pops['${c}']`));
  assert.deepEqual(errors, []);
});

test('islands get a cable, and every city is connected to somewhere', () => {
  const { ev } = load();
  assert.equal(ev("WORLD.islands.filter(id=>!CABLE_PAIRS.some(p=>p.a===id||p.b===id)).length"), 0);
  assert.equal(ev("CABLE_PAIRS.filter(c=>!CITY[c.a]||!CITY[c.b]||!(c.km>0)).length"), 0);
  assert.ok(ev("CITIES.filter(c=>c.land.startsWith('i:')).length") > 50);
});

test('AS numbers: any free number works, reserved and taken ones do not', () => {
  const { ev } = load();
  const chk = (v) => JSON.parse(ev(`JSON.stringify(asnCheck(${JSON.stringify(String(v))}))`));
  assert.equal(chk(64512).n, 64512);
  assert.equal(chk('AS4200000001').n, 4200000001);
  assert.equal(chk(1).n, 1);
  for (const bad of ['0', '23456', '65535', '4294967295', '-5', '1.5', 'abc', '', '99999999999']) assert.ok(chk(bad).err, `${bad} is refused`);
  assert.match(chk(3356).err, /Lumen/);
  assert.match(chk(174).err, /Cogent/);
  const r = ev('randomAsn()');
  assert.ok(r >= 1 && !ev(`NETS.some(n=>n.asn===${r})`));
  assert.equal(ev("rirFor('fra')"), 'RIPE NCC');
  assert.equal(ev("rirFor('nyc')"), 'ARIN');
  assert.equal(ev("rirFor('sin')"), 'APNIC');
  assert.equal(ev("rirFor('sao')"), 'LACNIC');
  assert.equal(ev("rirFor('jnb')"), 'AFRINIC');
});

test('the title screen takes a chosen AS number', () => {
  const { ev, dom } = load();
  ev("showTitle()");
  const d = dom.window.document;
  d.getElementById('asnIn').value = '65001';
  d.querySelector('[data-act=start]').click();
  assert.equal(ev('S.asn'), 65001);
  assert.match(ev("document.getElementById('toasts').textContent"), /You announce AS65001/);
  const t = load();
  t.ev("showTitle()");
  t.dom.window.document.getElementById('asnIn').value = '3356';
  t.dom.window.document.querySelector('[data-act=start]').click();
  assert.equal(t.ev('S'), null, 'a taken number stops the game from starting');
});

test('old saves lose transit ports that no longer match a real PoP', () => {
  const { ev } = load();
  ev("ACT.start({})");
  const bad = ev("(()=>{for(const c of ['fra','ams']){const n=NETS.find(n=>n.price&&!n.pops.includes(c));if(n)return [c,n.id];}})()");
  ev(`S.transit.push({id:'x1',city:'${bad[0]}',net:'${bad[1]}',tier:0,down:0});S.ixp['nope~9']=1;S=migrate(JSON.parse(JSON.stringify(S)))`);
  assert.equal(ev("S.transit.some(t=>t.id==='x1')"), false);
  assert.equal(ev("S.ixp['nope~9']"), undefined);
});

test('Ukraine to Russia: no waves, dark fiber only, with a sanctions risk', () => {
  const { ev } = load({ seed: 5 });
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'kyv'});ACT.buildPop({city:'mos'})");
  assert.equal(ev("sanctionedPair('kyv','mos')"), true);
  assert.equal(ev("sanctionedPair('fra','mos')"), false);
  ev("openLinkModal('kyv','mos')");
  assert.match(ev("document.getElementById('modalCard').textContent"), /may get sanctioned/);
  assert.equal(ev("document.querySelector('#modalCard [data-act=dfMode]')"), null, 'no wave tab');
  ev("UI.pending={a:'kyv',b:'mos'};ACT.buildLink({tier:1})");
  assert.equal(ev('S.links.length'), 0, 'waves are refused');
  ev("S.links.push({id:'z',a:'kyv',b:'mos',kind:'df',km:900,mo:1,ch:[],sys:'lite',ready:0})");
  for (let i = 0; i < 40; i++) ev('fireEvent()');
  assert.ok(ev('S.links[0].cut') > ev('S.day'), 'sooner or later the regulators notice');
});

test('find any city on the map, and hide the small ones', () => {
  const { ev, dom } = load();
  ev("ACT.start({})");
  ev('ACT.citySearch()');
  const d = dom.window.document;
  const q = d.getElementById('fcQ'); q.value = 'manch';
  q.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  d.querySelector('#fcRes button').click();
  assert.equal(ev("UI.sel.type"), 'city');
  assert.match(ev("CITY[UI.sel.id].name"), /Manchester/);
  assert.ok(ev('cam.z') >= 2.4, 'zoomed in on it');
  const all = ev('lodList().length');
  ev("ACT.citySet({v:'hide'})");
  assert.equal(ev('UI.hideSmall'), true);
  ev('cam.z=3.5');
  const hidden = ev('lodList().length');
  ev("ACT.citySet({v:'show'})");
  assert.ok(hidden < ev('lodList().length'), 'small cities come back');
  assert.ok(ev("lodList().some(c=>c.id===UI.sel.id)") , 'the selected city is always drawn');
  assert.ok(ev("lodList().every(c=>c.P>=200||UI.sel.id===c.id||S.pops[c.id])===false")); // sanity: shown now
  ev("ACT.citySet({v:'hide'})");
  assert.ok(ev("lodList().every(c=>c.P>=200||UI.sel.id===c.id||S.pops[c.id]||S.links.some(l=>l.a===c.id||l.b===c.id))"));
  void all;
});

test('no joke names are left in the customer, bank and network lists', () => {
  const { ev } = load();
  const bad = /Hamster|Kebab|Llama|Snack|Git Happens|Skynet|Goldman Sacks|Crypto Bros|Dracula|-ish\b|eBuy|Paperworkistan/;
  const text = ev("JSON.stringify([BIZ_N,Object.values(BIZ_T).map(t=>t.names),Object.values(BANKS).map(b=>[b.name,b.blurb]),NETS.map(n=>[n.name,n.blurb]),CONFS.map(c=>c.n),MEGA.map(m=>m.n),SITE2_N])");
  assert.doesNotMatch(text, bad);
});

test('real routers and optics, and dark fiber takes any number of transceivers at once', () => {
  const { ev, errors } = load({ seed: 4 });
  assert.match(ev("RG.map(r=>r.n).join()"), /Juniper MX204.*Cisco 8201.*PTX10001.*Silicon One G300.*MikroTik.*Edgecore.*Arista 7280.*Arista 7800.*Cisco 8808.*Tomahawk 6.*Nokia 7750/);
  assert.equal(ev("RG.some(r=>/Rusty|Chonk|Absolute|Arrrhipster|Knockia/.test(r.n))"), false);
  assert.equal(ev("PORT[PORT.length-1].n"), '1.6T', 'no router port is faster than 1.6T today');
  assert.equal(ev("Object.values(OPT).some(o=>/Ackackia|Sizzle|Sienna/.test(o.n))"), false);
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0");
  ev("ACT.buildPop({city:'ams'});for(const c of ['fra','ams'])S.pops[c].rgen=3;");
  ev("UI.pending={a:'fra',b:'ams'};UI.lmode='df';UI.dfSrc='lease';ACT.orderDf()");
  const id = ev("S.links.find(l=>l.kind==='df').id");
  ev(`S.links.find(l=>l.id==='${id}').ready=0;S.links.find(l=>l.id==='${id}').sys='lite'`);
  ev(`ACT.addCh({id:'${id}',o:'zr4',n:5})`);
  assert.equal(ev(`S.links.find(l=>l.id==='${id}').ch.filter(x=>x==='zr4').length`), 5, 'five 400ZR+ at once');
  ev(`ACT.addCh({id:'${id}',o:'zr4',n:99})`);
  assert.equal(ev(`S.links.find(l=>l.id==='${id}').ch.length`), 16, 'stops at what the line system can light');
  ev(`ACT.rmCh({id:'${id}',o:'zr4',n:3})`);
  assert.equal(ev(`S.links.find(l=>l.id==='${id}').ch.length`), 13);
  // the page: a number box per optic
  ev(`UI.sel={type:'link',id:'${id}'};renderPanel()`);
  ev("document.getElementById('chn-zr4').value='2'");
  ev(`ACT.addChN({id:'${id}',o:'zr4'})`);
  assert.equal(ev(`S.links.find(l=>l.id==='${id}').ch.length`), 15);
  // a better line system unlocks the big transponders
  assert.match(ev(`chWhy(S.links.find(l=>l.id==='${id}'),'tp16')`), /Ciena 6500 ROADM/);
  ev(`ACT.upSys({id:'${id}',to:'roadm'})`);
  assert.equal(ev(`chWhy(S.links.find(l=>l.id==='${id}'),'tp16')`), '');
  ev(`ACT.upSys({id:'${id}',to:'cl'})`);
  assert.equal(ev(`S.links.find(l=>l.id==='${id}').sys`), 'cl');
  assert.deepEqual(errors, []);
});
