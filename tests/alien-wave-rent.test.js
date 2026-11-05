// #203: renting out alien waves was a money machine. A wave is now priced against what the fiber itself costs, and gets
// cheaper as a route fills; extra crews cut a build to half its planned time at most; a typed order cannot end a link
// in a city the map does not show.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const fiber = (ev, id, a, b, km) => ev(`S.links.push({id:'${id}',a:'${a}',b:'${b}',kind:'df',own:true,sys:'cl',ch:[],km:${km},ready:0,day:0,cut:0,mo:1,trench:'own:${id}',pairs:1})`);
const sell = (ev, id) => ev(`(()=>{const l=S.links.find(x=>x.id==='${id}'),r=wwRate(l,1);S.biz.push({id:uid(),type:'wwave',link:l.id,slots:1,rate:r,city:l.a,city2:l.b,name:'n'+S.biz.length,bw:1,mood:80,since:0,reqs:[]});return r})()`);

test('#203 an alien wave rents for a share of the fiber, and each one sold on a route makes the next cheaper', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;S.biz=[];S.offers=[];for(const c of ['lon','nyc'])if(!S.pops[c])ACT.buildPop({city:c})");
  fiber(ev, 'f', 'lon', 'nyc', 5570);
  const F = ev('dfLeaseMo(5570)+ampCount(5570)*AMP_MO'), M = ev("brMarket('lon','nyc')");
  const rates = [];
  for (let i = 0; i < M; i++) rates.push(sell(ev, 'f'));
  assert.ok(rates[0] <= 0.3 * F + 1, `the first wave costs at most 30% of the fiber: ${rates[0]} vs ${F}`);
  for (let i = 1; i < rates.length; i++) assert.ok(rates[i] <= rates[i - 1], 'never dearer than the one before');
  assert.ok(rates.at(-1) < rates[0] * 0.45, 'the last waves of a full route go cheap');
  const full = rates.reduce((a, b) => a + b, 0);
  assert.ok(full / F > 2 && full / F < 8, `a full route earns a few times its lease, not dozens: ${(full / F).toFixed(1)}×`);
  // The old price: one wave cost about as much as the whole fiber, and a full route earned ~29× its lease.
  assert.ok(full < ev(`Math.round(waveMo(5570,false,2)*0.55)*${M}`) / 3);
  // A random offer and a broker sale on the same route follow the same price.
  fiber(ev, 'g', 'lon', 'nyc', 5570);
  ev("S.biz=[]");
  assert.equal(ev("(()=>{let n=0;const o=fiberOffer('wwave',S.links.find(l=>l.id==='g'),()=>'x');return o.rate===wwRate(S.links.find(l=>l.id==='g'),o.slots)})()"), true);
  assert.deepEqual(errors, []);
});

test('#203 extra crews cut a build to half its planned time, no further', () => {
  const { ev, errors, dom } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;for(const c of ['fra','waw'])if(!S.pops[c])ACT.buildPop({city:c})");
  const km = Math.round(ev("kmBetween('fra','waw')")), days = ev(`dfBuildDays(${km})`);
  ev(`S.links.push({id:'b',a:'fra',b:'waw',kind:'df',own:true,sys:'roadm',ch:[],km:${km},ready:S.day+${days},day:S.day,cut:0,mo:1,trench:'own:b',pairs:1});after();UI.sel={type:'link',id:'b'};renderPanel()`);
  const start = ev('S.day');
  assert.match(ev("document.getElementById('panelBody').textContent"), new RegExp(`All the crews: done in ${Math.ceil(days / 2)} days`));
  const cash = ev('S.cash');
  ev("ACT.crews({id:'b',all:1})");
  assert.equal(ev("S.links.find(l=>l.id==='b').ready"), start + Math.ceil(days / 2), 'half the planned build');
  assert.ok(ev('S.cash') < cash);
  const c2 = ev('S.cash');
  ev("ACT.crews({id:'b'});ACT.crews({id:'b',all:1})");
  assert.equal(ev('S.cash'), c2, 'no more crews to buy');
  ev('renderPanel()');
  const crews = [...dom.window.document.querySelectorAll('#panelBody [data-act=crews]')];
  assert.ok(crews.length && crews.every((b) => b.disabled));
  assert.match(ev("document.getElementById('panelBody').textContent"), /half its planned time/);
  // Phone: the panel still renders with the note.
  ev("window.innerWidth=360;renderAll()");
  assert.deepEqual(errors, []);
});

test('#203 a dark fiber, cable or wave cannot be ordered to a city the map does not show', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6");
  ev("ACT.buildPop({city:'sao'})");
  const home = 'sao', off = ev("(()=>{const c=CITIES.find(c=>c.off&&!cityOn(c.id)&&dfAllowed('sao',c.id));return c?c.id:null})()");
  assert.ok(off, 'there is a hidden city to try');
  const pops = ev('Object.keys(S.pops).length');
  ev(`UI.pending={a:'${home}',b:'${off}'};UI.dfSrc='lease';UI.dfSys='lite';ACT.orderDf()`);
  ev(`UI.pending={a:'${home}',b:'${off}'};ACT.buildLink({tier:0})`);
  assert.equal(ev('Object.keys(S.pops).length'), pops, 'no POP appears there');
  assert.equal(ev(`S.links.some(l=>l.b==='${off}'||l.a==='${off}')`), false);
  assert.deepEqual(errors, []);
});

test('#203 a dark fiber lease costs more, and a lease already signed keeps its price', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;for(const c of ['fra','ams'])if(!S.pops[c])ACT.buildPop({city:c})");
  assert.equal(ev('dfLeaseMo(1000)'), 2100);
  ev("UI.pending={a:'fra',b:'ams'};UI.dfSrc='lease';UI.dfSys='lite';ACT.orderDf()");
  const km = ev("S.links.find(l=>l.kind==='df').km");
  assert.equal(ev("S.links.find(l=>l.kind==='df').mo"), Math.round(600 + km * 1.5));
  // An old save's lease, signed at the old price, keeps it.
  const old = Math.round(400 + km);
  ev(`S.links.find(l=>l.kind==='df').mo=${old};S=migrate(JSON.parse(JSON.stringify(S)))`);
  assert.equal(ev("S.links.find(l=>l.kind==='df').mo"), old);
  assert.deepEqual(errors, []);
});
