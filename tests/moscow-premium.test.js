const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0";

test('#195 China Telecomet sells its premium crossing in Moscow, and nothing else there', () => {
  const { ev, errors } = load();
  ev(start);
  assert.equal(ev("sellsAt(NET.ctc,'mos')"), true, 'on sale in Moscow');
  assert.equal(ev("NET.ctc.pops.includes('mos')"), false, 'but no PoP there: no PNI, no exchange');
  assert.equal(ev("peerOk('ctc','pni','mos').ok"), false);
  ev("ACT.buildPop({city:'mos'});ACT.buyTransit({city:'mos',net:'ctc',tier:1})");
  const t = "S.transit.find(t=>t.net==='ctc'&&t.city==='mos')";
  assert.equal(ev(`!!${t}`), true, 'the order went through');
  assert.equal(ev(`${t}.premium`), true, 'it is the premium crossing from the start');
  ev(`ACT.togglePrem({id:${t}.id})`);
  assert.equal(ev(`${t}.premium`), true, 'and it cannot be switched to plain transit');
  assert.deepEqual(errors, []);
});

test('#195 it costs the same in Moscow as in Hong Kong, and the bill agrees with the panel', () => {
  const { ev, dom, errors } = load();
  ev(start);
  const mos = ev("transitPerG(NET.ctc,'mos',true)"), hkg = ev("transitPerG(NET.ctc,'hkg',true)");
  assert.equal(mos, hkg, 'same price per Gbps');
  assert.ok(hkg > ev("transitPerG(NET.ctc,'hkg',false)"), 'dearer than plain transit');
  ev("ACT.buildPop({city:'mos'});ACT.buyTransit({city:'mos',net:'ctc',tier:1});compute()");
  const t = "S.transit.find(t=>t.net==='ctc')";
  assert.equal(ev(`transitMo(${t},100)`), ev(`Math.max(100,PORT[${t}.tier].g*0.2)*${hkg}*S.priceMul+PORT[${t}.tier].tmo`), 'billed at the Hong Kong price');
  ev("UI.sel={type:'city',id:'mos'};UI.tab='up';renderPanel()");
  const body = dom.window.document.getElementById('panelBody').textContent;
  assert.match(body, /China Telecomet/);
  assert.match(body, /only their CN-Too premium crossing/);
  assert.match(body, new RegExp(ev(`(${hkg}*S.priceMul).toFixed(2)`).replace('.', '\\.')), 'the panel shows that price');
  assert.deepEqual(errors, []);
});

test('#195 European traffic hauled to Moscow crosses into China with far less loss on the premium port', () => {
  // Russians in the game send little to China; the point is Europe: carry Frankfurt's traffic to Moscow and hand it over there.
  const lost = premium => {
    const { ev, errors } = load();
    ev(start + ";ACT.launchBB({city:'fra'});S.pops.fra.bb.d=50;ACT.buildPop({city:'mos'});ACT.buyTransit({city:'mos',net:'ctc',tier:1})");
    ev("S.links.push({id:'w1',a:'fra',b:'mos',kind:'wave',tier:3,km:2000,sub:false,mo:1,mult:1,trench:'w1',cut:0,day:0})");
    if (!premium) ev("S.transit.find(t=>t.net==='ctc').premium=false");
    ev('compute()');
    assert.deepEqual(errors, []);
    return { cross: ev('R.gfwCross||0'), lost: ev('R.gfwLost||0') };
  };
  const p = lost(true), plain = lost(false);
  assert.ok(p.cross > 0, 'traffic for China goes out through Moscow');
  assert.ok(Math.abs(p.lost / p.cross - 0.03) < 0.005, `about 3% lost on the premium crossing (${(p.lost / p.cross * 100).toFixed(1)}%)`);
  assert.ok(plain.lost / plain.cross > 0.15, 'against about 20% without it');
});

test('#195 Hong Kong still works as before, and premium is not offered where it is not sold', () => {
  const { ev, errors } = load();
  ev(start + ";ACT.buildPop({city:'hkg'});ACT.buyTransit({city:'hkg',net:'ctc',tier:1})");
  const t = "S.transit.find(t=>t.city==='hkg')";
  assert.equal(ev(`!!${t}.premium`), false, 'plain transit by default in Hong Kong');
  ev(`ACT.togglePrem({id:${t}.id})`);
  assert.equal(ev(`${t}.premium`), true, 'switched on');
  ev(`ACT.togglePrem({id:${t}.id})`);
  assert.equal(ev(`${t}.premium`), false, 'and off again');
  ev("S.transit.push({id:'old-ctc',city:'fra',net:'ctc',tier:1,down:0})");
  ev("const f=S.transit.find(t=>t.city==='fra'&&t.net==='ctc');ACT.togglePrem({id:f.id})");
  assert.equal(ev("!!S.transit.find(t=>t.city==='fra'&&t.net==='ctc').premium"), false, 'no premium in Frankfurt');
  assert.deepEqual(errors, []);
});

test('#195 saves: a Moscow port stays premium, a bogus premium elsewhere is dropped, and it meets the China requirement', () => {
  const { ev, errors } = load();
  ev(start + ";ACT.buildPop({city:'mos'});ACT.buyTransit({city:'mos',net:'ctc',tier:1});S.transit.push({id:'old-ctc',city:'fra',net:'ctc',tier:1,down:0})");
  ev("const s=JSON.parse(JSON.stringify(S));for(const t of s.transit){if(t.city==='mos')t.premium=false;else if(t.net==='ctc')t.premium=true;}window.__t=migrate(s)");
  assert.equal(ev("__t.transit.find(t=>t.city==='mos').premium"), true);
  assert.equal(ev("__t.transit.find(t=>t.city==='fra'&&t.net==='ctc').premium"), false);
  assert.equal(ev("REQS.china.ok()"), true, 'a Moscow premium port counts as low-loss reach into China');
  assert.deepEqual(errors, []);
});
