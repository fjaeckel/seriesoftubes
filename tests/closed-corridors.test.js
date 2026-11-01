const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const PAIRS = [['kyv', 'ovb'], ['kyv', 'msq'], ['tlv', 'rml'], ['tlv', 'bey'], ['tlv', 'dam'], ['tlv', 'thr'], ['bkk', 'pnh'], ['evn', 'gyd'], ['evn', 'ist'], ['del', 'lhe'], ['kbl', 'khi'], ['alg', 'cas'], ['pyo', 'icn']];

test('closed corridors reject new waves and both forms of private fiber in either direction', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Borders','fra',{mode:'sandbox'});S.cash=1e12");
  for (const pair of PAIRS) for (const [a, b] of [pair, pair.slice().reverse()]) {
    ev(`UI.pending={a:'${a}',b:'${b}'};ACT.buildLink({tier:0});ACT.orderDf();ACT.orderCable()`);
    assert.equal(ev('S.links.length'), 0, `${a}-${b}`);
    assert.equal(ev(`dfAllowed('${a}','${b}')`), false);
  }
  assert.equal(ev("closedPair('ams','fra')"), false, 'ordinary international links remain available');
  ev("openLinkModal('tlv','rml')");
  assert.match(dom.window.document.getElementById('modalCard').textContent, /Not happening/);
  assert.doesNotMatch(dom.window.document.getElementById('modalCard').textContent, /Conflict or a closed border prevents new circuits/);
  assert.deepEqual(errors, []);
});

test('old circuits across a restricted country pair survive migration', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Legacy','kyv',{mode:'sandbox'});S.cash=1e9;ACT.buildPop({city:'mos'});S.links.push({id:'old-border',a:'kyv',b:'mos',kind:'wave',tier:1,km:1200,sub:false,mo:100,cut:0,day:0});S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.equal(ev("S.links.some(l=>l.id==='old-border')"), true);
  assert.ok(ev("capOf(S.links.find(l=>l.id==='old-border'))>0"));
  assert.deepEqual(errors, []);
});
