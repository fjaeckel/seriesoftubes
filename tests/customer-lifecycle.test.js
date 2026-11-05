// Customers come and go (#178): contract terms, renewals at the market price, growth, haggles, leaving for reasons that
// are not your fault, referrals, the bandwidth market, and old saves. Every roll is a hash of the customer and its
// term, so these tests pick ids that land where they need to and never depend on luck.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const start = "ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;for(const c of ['ams','lon','par'])ACT.buildPop({city:c});compute()";
// A signed customer, as an accepted offer makes it.
const sign = (ev, o) => ev(`(()=>{const b=clSign(offerCustomer(Object.assign({id:'c'+Math.random().toString(36).slice(2),city:'ams',city2:null,name:'Test Co',type:'dia',bw:5,rate:600,reqs:[],exp:S.day+40},${lit(o || {})})));S.biz.push(b);return b.id;})()`);
const B = (ev, id, k) => ev(`S.biz.find(b=>b.id===${lit(id)})${k ? '.' + k : ''}`);
// An id whose roll for question q (at term end te) is below p, or at least p when above is true.
// The rolls hash who the customer is, so the id found here is also its name (a Enterprise DIA in Amsterdam).
const idFor = (ev, q, p, te, above = false) => ev(`(()=>{for(let i=0;i<20000;i++){const id='x'+i,r=clR({type:'dia',city:'ams',name:id,te:${te}},'${q}');if(${above ? 'r>=' : 'r<'}${p})return id;}})()`);

test('every customer signs for a term that fits what it buys; events and scripted customers have none', () => {
  const { ev, errors } = load();
  ev(start);
  const months = (type) => { const id = sign(ev, { type, bw: 1, rate: 100 }); return Math.round((B(ev, id, 'te') - ev('S.day')) * 12 / 365); };
  for (const t of ['dia', 'host', 'game']) assert.ok([12, 24, 36].includes(months(t)), `${t}: one to three years`);
  for (const t of ['l2vpn', 'isp']) assert.ok([24, 36, 48, 60].includes(months(t)), `${t}: two to five years`);
  assert.ok([120, 180, 240].includes(months('dfpair')), 'fiber pairs: ten to twenty years');
  const ev1 = sign(ev, { type: 'event', start: ev('S.day') + 20, dur: 4, fee: 1000 });
  assert.equal(B(ev, ev1, 'te'), undefined, 'an event has its own ending');
  assert.equal(B(ev, sign(ev, {}), 'mk'), 1, 'signed in the market of the day');
  assert.equal(ev("S.cl.mo[S.cl.mo.length-1].won"), 7, 'and counted as won this month');
  assert.deepEqual(errors, []);
});

test('nothing happens during a first term, and a renewal reprices to the market at most 25% at once', () => {
  const { ev, errors } = load();
  ev(start);
  const te = ev('S.day') + 365;
  const id = idFor(ev, 'leave', 0.9, te, true);
  ev(`S.biz.push({id:'${id}',city:'ams',city2:null,name:'${id}',type:'dia',bw:5,rate:600,reqs:[],mood:100,since:S.day,te:${te},mk:2})`);
  ev(`for(let i=0;i<364;i++)clDay(S.day+i)`);
  assert.equal(B(ev, id, 'rate'), 600, 'first term: same price, still here');
  ev(`S.biz.find(b=>b.id==='${id}').mood=100;clDay(${te})`);
  assert.ok(B(ev, id), 'renewed');
  const rate = B(ev, id, 'rate');
  assert.ok(rate === 450 || B(ev, id, 'bw') > 5, `the market halved, but one renewal moves the price 25% at most (${rate})`);
  assert.ok(B(ev, id, 'te') > te, 'a new term starts where the old one ended');
  assert.deepEqual(errors, []);
});

test('the lifecycle never draws from Math.random, so seeded games keep their stream', () => {
  const { ev, errors } = load();
  ev(start);
  for (let i = 0; i < 40; i++) sign(ev, { name: 'Co ' + i, type: i % 3 ? 'dia' : 'l2vpn', city2: i % 3 ? null : 'lon' });
  ev('for(const b of S.biz)b.te=S.day+31');
  ev('window.__r=0;const r0=Math.random;Math.random=()=>{__r++;return r0();};for(let i=0;i<40;i++)clDay(S.day+i);Math.random=r0');
  assert.equal(ev('__r'), 0);
  // Nor from the clock: offer and customer ids come from Date.now(), so a roll must not depend on them.
  assert.equal(ev("clR({id:'a1',type:'dia',city:'ams',name:'Same Co',te:400},'leave')"), ev("clR({id:'zz9',type:'dia',city:'ams',name:'Same Co',te:400},'leave')"));
  assert.equal(ev("slR('over|'+slKey({id:'a1',type:'dia',city:'ams',name:'Same Co',bw:5,exp:40}))"), ev("slR('over|'+slKey({id:'zz9',type:'dia',city:'ams',name:'Same Co',bw:5,exp:40}))"));
  assert.ok(ev("S.cl.mo.reduce((a,e)=>a+e.ren+e.grew+Object.values(e.lost).reduce((x,y)=>x+y,0),0)") > 0, 'contracts did end');
  assert.deepEqual(errors, []);
});

test('happy customers renew or grow; an unhappy one leaves, and says it was the service', () => {
  const { ev, errors } = load();
  ev(start);
  const te = ev('S.day') + 10;
  const stay = idFor(ev, 'leave', 0.5, te, true), grow = ev(`(()=>{for(let i=0;i<20000;i++){const id='g'+i,b={type:'dia',city:'ams',name:id,te:${te}};if(clR(b,'leave')>=0.5&&clR(b,'grow')<0.3)return id;}})()`);
  const sad = idFor(ev, 'leave', 0.3, te);
  for (const [id, mood] of [[stay, 100], [grow, 100], [sad, 20]]) ev(`S.biz.push({id:'${id}',city:'ams',city2:null,name:'${id}',type:'dia',bw:2,rate:600,reqs:[],mood:${mood},since:S.day-400,te:${te},mk:1})`);
  ev(`clDay(${te})`);
  assert.ok(B(ev, stay), 'renewed');
  assert.equal(B(ev, grow, 'bw'), 5, 'grew to the next size their type sells');
  assert.equal(B(ev, sad), undefined, 'the unhappy one left');
  assert.equal(ev("S.cl.mo[S.cl.mo.length-1].lost.sad"), 1);
  assert.match(ev('S.log[0].t+S.log[1].t+S.log[2].t'), /did not renew: the service let them down/);
  assert.deepEqual(errors, []);
});

test('leaving that is not your fault: only reasons that fit the customer, and the odd ones at most every two months', () => {
  const { ev, errors } = load();
  ev(start);
  const r = JSON.parse(ev(`(()=>{const seen={};S.day=1000;S.cl={odd:-1e9,mo:[]};
    for(let i=0;i<3000;i++){const t=['dia','l2vpn','dfpair','isp','gpu'][i%5],b={id:'q'+i,city:'ams',city2:BIZ_T[t].l2||BIZ_T[t].fiber?'lon':null,name:'Q'+i,type:t,bw:4,rate:100,reqs:[],mood:90,since:0,te:S.day,mk:1};
      if(clR(b,'leave')>=(0.04+0.08*Math.min(1,clComp(b)/6)+0.35*0.01))continue;S.biz=[b];const before=JSON.stringify(S.cl.mo);clDay(S.day);
      const e=S.cl.mo[S.cl.mo.length-1];for(const k in e.lost)(seen[k]=seen[k]||new Set()).add(t);S.cl.mo=[];S.day+=7;}
    const out={};for(const k in seen)out[k]=[...seen[k]];return JSON.stringify(out);})()`));
  for (const k of Object.keys(r)) assert.ok(['acq', 'bust', 'insrc', 'moved', 'multi', 'ended', 'cheap', 'odd'].includes(k), k);
  assert.ok(!(r.ended || []).includes('dia'), 'an internet customer has no project circuit to end');
  assert.ok(!(r.moved || []).some(t => t === 'l2vpn' || t === 'dfpair'), 'circuits and fiber do not move away');
  assert.ok(!(r.bust || []).includes('dfpair'));
  // The odd reasons: never twice within 60 days.
  const gaps = JSON.parse(ev(`(()=>{S.day=5000;S.cl={odd:-1e9,mo:[]};const days=[];for(let d=0;d<400;d++){for(let i=0;i<6;i++){const b={id:'o'+d+'_'+i,city:'ams',city2:null,name:'O'+d+'_'+i,type:'dia',bw:1,rate:100,reqs:[],mood:90,since:0,te:S.day,mk:1};S.biz=[b];const o=S.cl.odd;clDay(S.day);if(S.cl.odd!==o)days.push(S.day);}S.day++;}return JSON.stringify(days);})()`));
  assert.ok(gaps.length >= 3, `odd reasons do come (${gaps.length} in 400 days)`);
  assert.ok(gaps.every((d, i) => !i || d - gaps[i - 1] >= 60), 'at most one every 60 days');
  assert.deepEqual(errors, []);
});

test('a haggle: 30 days ahead, in Deals; match, meet halfway, let go, or no answer matches their price', () => {
  const { ev, errors } = load();
  ev(start);
  const te = ev('S.day') + 30;
  const id = idFor(ev, 'hag', 0.05, te);
  ev(`S.biz.push({id:'${id}',city:'ams',city2:null,name:'${id}',type:'dia',bw:5,rate:600,reqs:[],mood:90,since:S.day-800,te:${te},mk:1})`);
  ev(`clDay(S.day)`);
  const hag = JSON.parse(ev(`JSON.stringify(S.biz.find(b=>b.id==='${id}').hag)`));
  assert.ok(hag && hag.rate < 600 && hag.rate >= 480 && hag.until === te, `asks 8–20% off until the term ends (${lit(hag)})`);
  ev("UI.left='deals';renderLeft()");
  const deals = ev("document.getElementById('leftBody')?document.getElementById('leftBody').innerHTML:document.getElementById('left').innerHTML");
  assert.match(deals, /data-act="renewMatch"/);
  assert.match(deals, /data-act="renewMeet"/);
  assert.match(deals, /data-act="renewLet"/);
  assert.match(ev("document.getElementById('leftTabs').innerHTML"), /cnt">\d/, 'counted on the Deals tab');
  ev(`ACT.renewMatch({id:'${id}'})`);
  assert.equal(B(ev, id, 'rate'), hag.rate, 'matched');
  assert.equal(B(ev, id, 'hag'), undefined);
  // No answer: renews at the asked price when the term ends.
  ev(`(()=>{const b=S.biz.find(b=>b.id==='${id}');b.hag={rate:500,until:S.day+5};})()`);
  ev(`for(let i=0;i<6;i++)clDay(S.day+i)`);
  assert.equal(B(ev, id, 'rate'), 500);
  ev(`(()=>{const b=S.biz.find(b=>b.id==='${id}');b.hag={rate:400,until:S.day+5};})()`);
  ev(`ACT.renewLet({id:'${id}'})`);
  assert.equal(B(ev, id), undefined, 'let go');
  assert.deepEqual(errors, []);
});

test('meeting halfway lands between what the customer pays and what they ask, as the button says (#293)', () => {
  const { ev, errors } = load();
  ev(start);
  // The market has fallen a lot since they signed, so the old reference (today's fair price) sat right next to the ask.
  // A name whose roll accepts the offer: the rolls are hashes of the deal, so the test picks one, never luck.
  const id = ev(`(()=>{for(let i=0;i<200;i++){const b={id:'m'+i,city:'ams',city2:null,name:'m'+i,type:'dia',bw:5,rate:1000,reqs:[],mood:90,since:S.day-800,te:S.day+20,mk:2,hag:{rate:700,until:S.day+20}};if(clR(b,'meet')<salesMeet()){S.biz.push(b);return b.id;}}return null;})()`);
  assert.ok(id, 'a customer that takes the offer');
  ev("UI.left='deals';renderLeft()");
  const deals = ev("document.getElementById('leftBody')?document.getElementById('leftBody').innerHTML:document.getElementById('left').innerHTML");
  assert.ok(deals.includes(ev('fmt$(5*850)')), `the button shows the halfway bill, ${ev('fmt$(5*850)')}`);
  ev(`ACT.renewMeet({id:'${id}'})`);
  assert.equal(B(ev, id, 'rate'), 850, 'halfway between 1000 and 700');
  assert.equal(B(ev, id, 'hag'), undefined);
  assert.deepEqual(errors, []);
});

test('the bandwidth market: flat for six months, then cheaper each year, up in a shortage, 1 without the market rule', () => {
  const { ev, errors } = load();
  ev(start);
  assert.equal(ev('mktBase(0)'), 1);
  assert.equal(ev('mktBase(180)'), 1);
  const y1 = ev('mktBase(180+365)'), y3 = ev('mktBase(180+3*365)');
  assert.ok(y1 < 0.97 && y1 > 0.85, `a year on: ${y1}`);
  assert.ok(y3 < y1 && y3 > 0.6, `three years on: ${y3}`);
  assert.ok(ev('mktBase(180+40*365)') >= 0.3, 'never below the floor');
  ev('S.day=900');
  const calm = ev('mkt()');
  ev("S.hw={shock:{k:'opt',until:S.day+30,mul:1.5}}");
  assert.ok(ev('mkt()') > calm * 1.1, 'a laser shortage pushes bandwidth prices up');
  ev("S.rules=Object.assign({},S.rules||RULE_DEF,{market:false})");
  assert.equal(ev('mkt()'), 1);
  assert.deepEqual(errors, []);
});

test('word of mouth: a happy customer of a year or more brings a referral at the smallest size and today\'s price', () => {
  const { ev, errors } = load();
  ev(start);
  ev("S.day=900;S.offers=[];S.biz.push({id:'fan',city:'ams',city2:null,name:'Big Fan Ltd',type:'host',bw:40,rate:60,reqs:[],mood:100,since:100,te:2000,mk:1})");
  ev('clReferral(899)');
  assert.equal(ev('S.offers.length'), 0, 'about every six weeks, not every day');
  ev('clReferral(900)');
  const o = JSON.parse(ev('JSON.stringify(S.offers[0])'));
  assert.equal(o.type, 'host');
  assert.equal(o.bw, 10, 'the smallest size');
  assert.equal(o.refN, 'Big Fan Ltd');
  assert.equal(o.rate, Math.round(60 * ev('mkt()')));
  ev("UI.left='deals';renderLeft()");
  assert.match(ev("document.getElementById('left').innerHTML"), /Referred by Big Fan Ltd/);
  assert.deepEqual(errors, []);
});

test('old saves: renewals spread over the next year, the market from the signing day, broken fields repaired', () => {
  const { ev, errors } = load();
  ev(start);
  const s = JSON.parse(ev('JSON.stringify(packSave(S))'));
  s.day = 1500;
  s.biz = [];
  for (let i = 0; i < 200; i++) s.biz.push({ id: 'old' + i, city: 'ams', name: 'Old ' + i, type: i % 2 ? 'dia' : 'host', bw: 5, rate: 600, mood: 90, since: 200 });
  s.biz.push({ id: 'bad', city: 'ams', name: 'Bad', type: 'dia', bw: 5, rate: 600, mood: 90, since: 200, te: 'soon', mk: -3, hag: { rate: 'x' } });
  s.cl = { odd: 'never', mo: [{ m: 30, won: 3, lost: { acq: 1, nonsense: 5 } }, 'junk'] };
  const out = JSON.parse(ev(`JSON.stringify(sanitize(JSON.parse(${lit(JSON.stringify(s))})))`));
  const tes = out.biz.map(b => b.te - 1500);
  assert.ok(tes.every(t => t >= 30 && t <= 365), 'within the next year, never on day one');
  assert.ok(new Set(tes).size > 100, 'spread out, not one wave');
  const bad = out.biz.find(b => b.id === 'bad');
  assert.equal(bad.hag, undefined);
  assert.ok(bad.mk > 0 && bad.mk === ev('mktBase(200)'), 'the market of the day it signed');
  assert.deepEqual(out.cl, { odd: -1e9, mo: [{ m: 30, won: 3, ren: 0, grew: 0, hag: 0, lost: { acq: 1 } }] });
  assert.deepEqual(errors, []);
});

test('the dashboard shows customers won and lost, why, renewals coming up and the market; rows show the contract', () => {
  const { ev, errors } = load();
  ev(start);
  const id = sign(ev, {});
  ev("clNote('lost','bust');clNote('lost','odd');clNote('grew')");
  ev("ACT.dash({});UI.dtab='cust';renderDash()");
  const h = ev("document.getElementById('dash').innerHTML");
  assert.match(h, /Customers won and lost/);
  assert.match(h, /Went bust/);
  assert.match(h, /Other reasons/);
  assert.match(h, /Bandwidth market/);
  assert.match(h, /contract until/);
  ev(`selectCity('ams');UI.tab='cust';renderPanel()`);
  assert.match(ev("document.getElementById('panel').innerHTML"), /contract until/);
  assert.ok(B(ev, id));
  assert.deepEqual(errors, []);
});
