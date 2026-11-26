// "Wants two different transit providers" is asked by the NOC intern for every seller in every city it shops in, once
// per customer with the requirement and twice per seller: on a very big network that was most of a game day. It now
// stops at the first port from a second provider instead of building a set of all transit, with the same answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

test('twoup answers exactly as the set of providers did', () => {
  const { ev, errors } = load({ seed: 11 });
  ev('ACT.start({});if(UI.pendGame)ACT.pitchSkip();');
  const cases = [
    [],
    ['cog'],
    ['cog', 'cog', 'cog'],
    ['cog', 'lvl'],
    ['lvl', 'lvl', 'lvl', 'cog'],
    ['cog', 'lvl', 'cog', 'ntt'],
    Array.from({ length: 400 }, () => 'cog'),
    [...Array.from({ length: 399 }, () => 'cog'), 'lvl'],
  ];
  for (const nets of cases) {
    const [now, old] = JSON.parse(ev(`(()=>{S.transit=${lit(nets)}.map((net,i)=>({id:'t'+i,net,city:'fra',tier:1,n:1}));
      return JSON.stringify([REQS.twoup.ok({}),new Set(S.transit.map(t=>t.net)).size>=2||S.transit.length===0]);})()`));
    assert.equal(now, old, nets.slice(0, 5).join(',') + (nets.length > 5 ? `… (${nets.length})` : ''));
  }
  assert.deepEqual(errors, []);
});
