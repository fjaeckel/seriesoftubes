// More real cables: the North Sea and the Baltic, the Indian Ocean and Asia-Pacific.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./harness');

function start(ev) { ev("ACT.start({});S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0"); }
const lands = (ev, cid, a, b) => ev(`CABLE_PAIRS.some(p=>p.cid==='${cid}'&&[p.a,p.b].sort().join()==='${[a, b].sort().join()}')`);

test('the North Sea and the Baltic: new landings, real cables, and anchors on the Baltic ones', () => {
  const { ev, errors } = load();
  start(ev);
  for (const c of ['krs', 'ebj', 'rix']) {
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.a==='${c}'||p.b==='${c}')`), `${c} has a cable`);
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
  }
  assert.ok(ev("CITY.rix.ix.length>0&&ixMembers('rix').includes('tet')"), 'Riga has its exchange');
  assert.ok(lands(ev, 'havf', 'ebj', 'krs') && lands(ev, 'havf', 'nyc', 'ebj') && lands(ev, 'havsil', 'krs', 'ebj') && lands(ev, 'norfest', 'svg', 'krs'));
  assert.ok(lands(ev, 'havh', 'dub', 'man') && lands(ev, 'clion', 'hel', 'ham') && lands(ev, 'e4', 'ber', 'cph') && lands(ev, 'lvse', 'rix', 'sto'));
  // Tampnet: NorSea Com from Kårstø past the Draupner and Ekofisk platforms to Lowestoft, and Norfest down the coast
  assert.ok(lands(ev, 'tampn', 'svg', 'lon') && lands(ev, 'norfest', 'krs', 'osl'));
  // the Baltic cables are the ones the anchors find
  for (const c of ['clion', 'balt', 'e4', 'elight', 'elisa', 'lvse', 'bcs']) assert.equal(ev(`CAB.${c}.anchor`), true, c);
  assert.equal(ev('CAB.marea.anchor'), undefined);
  // old pairs stay where they were, so saved links keep their cable
  assert.equal(ev("CAB.havf.pairs.slice(0,2).map(p=>p.slice(0,2).join()).join(' ')"), 'nyc,cph dub,cph');
  assert.equal(ev("CAB.clion.pairs[0].slice(0,2).join()"), 'hel,fra');
  assert.deepEqual(errors, []);
});

test('the Indian Ocean and Asia-Pacific: the big real cables, Muscat, the Maldives and Fukuoka', () => {
  const { ev, errors } = load();
  start(ev);
  for (const c of ['mct', 'mle', 'fuk']) {
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.a==='${c}'||p.b==='${c}')`), `${c} has a cable`);
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
  }
  assert.ok(ev("isSub('mle','cbo')&&!isSub('mct','dxb')&&!isSub('fuk','tok')"), 'the Maldives are islands, Muscat and Fukuoka are not');
  for (const [cid, a, b] of [['sjc2', 'tpe', 'osa'], ['adc', 'sin', 'bkk'], ['apcn2', 'tpe', 'sha'], ['flag', 'bde', 'pmo'], ['smw5', 'khi', 'cbo'], ['unity', 'tok', 'lax'],
    ['tpe2', 'sea', 'sha'], ['mist', 'maa', 'kul'], ['iax', 'bom', 'mle'], ['kjcn', 'icn', 'fuk'], ['smw6', 'bom', 'mle'], ['twoaf', 'mct', 'khi'], ['ohman', 'per', 'mct'], ['bifrost', 'jkt', 'gum'], ['indigo', 'per', 'syd']]) {
    assert.ok(lands(ev, cid, a, b), `${cid} ${a}-${b}`);
  }
  // every cable pair has a drawn route and a sane length
  assert.equal(ev("CABLE_PAIRS.filter(p=>!(p.km>0&&p.km<25000)||p.pts.some(q=>!isFinite(q[0])||!isFinite(q[1]))).length"), 0);
  // no route jumps across the whole map at the ±180° seam: waypoints keep continuous longitudes (#183)
  assert.deepEqual(JSON.parse(ev("JSON.stringify(CABLE_PAIRS.filter(p=>p.pts.some((q,i)=>i&&Math.abs(q[0]-p.pts[i-1][0])>W/3)).map(p=>p.cid+':'+p.a+'-'+p.b))")), []);
  assert.ok(ev("cablePair('fast','sea','osa').km") < 9500, 'FASTEST to Osaka crosses the Pacific, not the world');
  // Published landing spurs and legacy schematic routes are checked in landing-stations.test.js.
  // a hop on one of the new cables carries traffic
  ev("for(const c of ['sin','hkg']){ACT.buildPop({city:c});S.pops[c].rgen=3;}UI.via='sjc2';UI.route='same';openLinkModal('sin','hkg');ACT.buildLink({tier:2});closeModal();compute()");
  assert.ok(ev("S.links.some(l=>l.cable==='sjc2')"), 'a wave on SJC2');
  ev('cam.z=0.5;draw(0);cam.z=4;cam.x=CITY.mle.x;cam.y=CITY.mle.y;draw(0)');
  assert.deepEqual(errors, []);
});
