// The link panel is short: on a dark fiber the optics come first, one row per model in use with − count +, and what only
// explains or is rarely needed (other models, the spares shelf, the line system, selling, traffic, the metric) is a
// one-line summary or a button that unfolds it, once you run a real network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function setup(ev, pops) {
  ev(`ACT.start({});S.cash=1e9;S.lvl=13;S.day=100;for(const g of GOALS)S.done[g.id]=0;
   S.pops.fra.rgen=mainRG(4);S.pops.fra.routers=16;for(const c of ${JSON.stringify(pops)})S.pops[c]={...S.pops.fra};
   S.links=[{id:'fiber',a:'fra',b:'ams',kind:'df',own:true,sub:false,sys:'lite',km:400,ch:['zr4','zr4','zr8'],ready:0,day:0,cut:0,mo:1},
            {id:'wave',a:'fra',b:'ams',tier:0,km:400,sub:false,cable:null,mo:500,cut:0,day:0}];
   S.spares={zr4:2};compute();UI.sel={type:'link',id:'fiber'};renderPanel();`);
}
// Section titles in order: a plain heading, or the title of a section that folds to one line.
const heads = doc => [...doc.querySelectorAll('#panelBody .scroll>section')].map(x => { const h = x.querySelector(':scope>h3,:scope>.psh .pst'); return h ? h.firstChild.textContent.trim() : ''; });
const folded = (doc, k) => !doc.querySelector(`#panelBody section.psec[data-sec="${k}"]`).classList.contains('on');

test('a dark fiber on a real network: optics first, grouped counts, one stepper row per model, the rest folded', () => {
  const { ev, dom, errors } = load();
  try {
    setup(ev, ['ams', 'par', 'lon']);
    const doc = dom.window.document, body = doc.getElementById('panelBody');
    assert.ok(ev('pnVet()'));
    const hs = heads(doc), at = k => hs.indexOf(ev(`tr('${k}')`));
    assert.equal(at('common.capacity'), 0);
    assert.equal(at('common.optics'), 1, 'optics come right after capacity');
    assert.ok(at('common.line_system') < at('link_panels.selling_spare_capacity'), 'selling comes after the hardware');
    assert.ok(at('link_panels.selling_spare_capacity') < at('link_panels.what_s_on_this_link') && at('link_panels.what_s_on_this_link') < at('common.routing_metric'));
    assert.equal(doc.querySelector('.osum').textContent, '2× 400ZR+, 1× 800ZR+');
    // The latency sits in the header next to the length.
    assert.match(doc.querySelector('#panelBody .ph .eyebrow').textContent, /400 km · \d+\.\d ms/);
    assert.ok(![...doc.querySelectorAll('#panelBody .kv span')].some(x => x.textContent === ev("tr('common.latency')")));
    // The models in use only; the two that need a bigger line system wait behind "Other models (2)".
    assert.deepEqual([...doc.querySelectorAll('.orow form.optic-count')].map(f => f.dataset.optic), ['zr4', 'zr8']);
    const foldBtns = () => [...doc.querySelectorAll('.pnfold [data-act="panelFold"]')].map(b => JSON.parse(b.dataset.args).k);
    assert.deepEqual(foldBtns(), ['ox', 'sp'], 'other models and the shelf share one row');
    // The line system, selling, traffic and metric are one line each, with what matters in the summary.
    for (const k of ['ls', 'sell', 'traf', 'met']) assert.ok(folded(doc, k), k);
    assert.match(doc.querySelector('section[data-sec="ls"] .pss').textContent, /amplifiers/);
    assert.match(doc.querySelector('section[data-sec="sell"] .pss').textContent, /Free channels \d+\/\d+/);
    assert.equal(doc.querySelector('section[data-sec="met"] .pss').textContent, ev("tr('common.normal')"));
    for (const a of ['regen', 'upSys', 'spares', 'listFiber', 'setMetric']) assert.equal(doc.querySelectorAll(`#panelBody [data-act="${a}"]`).length, 0, a);
    ev("ACT.panelFold({k:'s:ls',o:1});ACT.panelFold({k:'s:sell',o:1});ACT.panelFold({k:'s:met',o:1})");
    for (const a of ['regen', 'spares', 'setMetric']) assert.ok(doc.querySelector(`#panelBody [data-act="${a}"]`), a);
    ev("ACT.panelFold({k:'s:ls',o:0});ACT.panelFold({k:'s:sell',o:0});ACT.panelFold({k:'s:met',o:0})");
    assert.ok(folded(doc, 'ls') && folded(doc, 'sell') && folded(doc, 'met'));
    for (const r of doc.querySelectorAll('.orow')) {
      const c = r.querySelector('.ochg');
      assert.ok(c.querySelector('[data-act="rmCh"]') && c.querySelector('[data-act="addCh"]') && c.querySelector('form.optic-count input'));
      assert.ok(c.querySelector('form.optic-count button').hidden, 'Apply only shows once a count is typed');
    }
    assert.ok(!body.textContent.includes(ev("tr('link_panels.each_channel_is_a_pair_of')")));
    assert.ok(!body.textContent.includes(ev("tr('link_panels.unplugged_optics_go_on_the_spares')")));
    assert.ok(!body.textContent.includes(ev("tr('link_panels.spare_optics_and_amplifier_cards_on')")));
    assert.equal(doc.querySelectorAll('[data-act="sellSpare"]').length, 0);
    // Nothing is lost: each fold opens.
    ev("ACT.panelFold({k:'ox'})");
    assert.deepEqual([...doc.querySelectorAll('.orow form.optic-count')].map(f => f.dataset.optic), ['zr4', 'zr8', 'tp16', 'tp32']);
    ev("ACT.panelFold({k:'sp'})");
    assert.equal(doc.querySelectorAll('[data-act="sellSpare"]').length, 1);
    assert.ok(doc.querySelector('[data-act="buySpare"]'));
    ev("ACT.panelFold({k:'h:opt'});ACT.panelFold({k:'h:ls'});ACT.panelFold({k:'h:sell'});ACT.panelFold({k:'s:ls',o:1});ACT.panelFold({k:'s:sell',o:1})");
    for (const k of ['link_panels.each_channel_is_a_pair_of', 'link_panels.spare_optics_and_amplifier_cards_on', 'link_panels.other_carriers_rent_what_you_do'])
      assert.ok(body.innerHTML.includes(ev(`tr('${k}')`)), k);
    // Typing a count shows Apply with the price; the stepper still works.
    const f = doc.querySelector('form.optic-count[data-optic="zr8"]');
    f.elements.count.value = '3'; f.elements.count.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(f.querySelector('button').hidden, false);
    f.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(ev("S.links[0].ch.filter(k=>k==='zr8').length"), 3);
    [...doc.querySelectorAll('[data-act="rmCh"]')].find(b => JSON.parse(b.dataset.args).o === 'zr8').click();
    assert.equal(ev("S.links[0].ch.filter(k=>k==='zr8').length"), 2);
    // The redundancy check is a button in the Redundancy section, giving the fiber up is the last and quietest thing.
    const secs = [...doc.querySelectorAll('#panelBody .scroll>section')];
    assert.ok(doc.querySelector('[data-act="linkCheck"]').closest('section').querySelector('[data-act="addParallel"]'));
    const last = secs[secs.length - 1].querySelector('button');
    assert.equal(last.dataset.act, 'rmLink'); assert.ok(last.classList.contains('ghost') && last.classList.contains('quiet'));
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('an offer for a dark fiber opens its selling section by itself, with Accept on the first screen', () => {
  const { ev, dom, errors } = load();
  try {
    setup(ev, ['ams', 'par', 'lon']);
    const doc = dom.window.document;
    ev("S.offers.push({id:'o1',link:'fiber',type:'dfpair',name:'Acme Pairs',what:'a spare pair',rate:1000,exp:S.day+20,city:'fra',city2:'ams'});renderPanel()");
    const sec = doc.querySelector('section[data-sec="sell"]');
    assert.ok(sec.classList.contains('on'));
    assert.ok(sec.querySelector('.psf'), 'flagged in the heading');
    assert.ok(sec.querySelector('[data-act="accept"]'));
    assert.equal(sec.querySelectorAll('[data-act="listFiber"]').length, 0, 'only the offer until "Show all"');
    ev("ACT.panelFold({k:'s:sell',o:1})");
    assert.ok(doc.querySelector('section[data-sec="sell"] [data-act="accept"]'));
    assert.match(doc.querySelector('section[data-sec="sell"]').textContent, /Free channels/);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('early on a dark fiber still explains itself and shows every model and the shelf', () => {
  const { ev, dom, errors } = load();
  try {
    setup(ev, ['ams']);
    const doc = dom.window.document, body = doc.getElementById('panelBody');
    assert.ok(!ev('pnVet()'));
    assert.equal(doc.querySelectorAll('.orow form.optic-count').length, 4);
    assert.ok(body.textContent.includes(ev("tr('link_panels.each_channel_is_a_pair_of')")));
    assert.ok(body.innerHTML.includes(ev("OPT.zr4.blurb")));
    assert.equal(doc.querySelectorAll('[data-act="sellSpare"]').length, 1);
    assert.equal(body.querySelectorAll('button.hb').length, 0);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('every kind of link has the one-line header class, and a fiber being built or dark renders', () => {
  const { ev, dom, errors } = load();
  try {
    setup(ev, ['ams', 'par', 'lon']);
    const doc = dom.window.document;
    ev(`S.links.push({id:'vx',a:'fra',b:'ams',kind:'vxc',prov:Object.keys(FAB)[0],vt:0,km:400,sub:false,mo:500,cut:0,day:0},
      {id:'bld',a:'fra',b:'par',kind:'df',own:true,sub:false,sys:'roadm',km:500,ch:[],ready:S.day+50,day:S.day,cut:0,mo:1},
      {id:'sea',a:'fra',b:'lon',kind:'df',own:true,sub:true,seaDesign:'standard',sys:'roadm',km:900,ch:['tp16'],ready:0,day:0,cut:0,mo:1,cname:'Test',pairs:1,trench:'own:sea'});compute()`);
    for (const id of ['fiber', 'wave', 'vx', 'bld', 'sea']) {
      ev(`UI.sel={type:'link',id:'${id}'};renderPanel()`);
      assert.ok(doc.querySelector('#panelBody .ph.lph h2'), id);
      const secs = [...doc.querySelectorAll('#panelBody .scroll>section')], last = secs[secs.length - 1].querySelector('button');
      assert.ok(last.classList.contains('ghost') && /^(rmLink|cancelVxc)$/.test(last.dataset.act), id + ': the destructive action is last');
    }
    ev("UI.sel={type:'link',id:'bld'};renderPanel()");
    assert.ok(!doc.querySelector('#panelBody').innerHTML.includes(ev("tr('link_panels.selling_spare_capacity')")), 'nothing to sell before it is ready');
    assert.ok(doc.querySelector('.orow [data-act="addCh"]'), 'optics can be pre-installed');
    ev("UI.sel={type:'link',id:'sea'};renderPanel()");
    // Terminal upgrades show while one would help; otherwise they wait behind their own button.
    if (!doc.querySelector('[data-act="subUpgrade"]')) ev("ACT.panelFold({k:'su'})");
    assert.ok(doc.querySelector('[data-act="subUpgrade"]'));
    ev("ACT.panelFold({k:'s:ls',o:1})");
    assert.ok(doc.querySelector('[data-act="spares"]'));
    assert.equal(doc.querySelectorAll('[data-act="regen"]').length, 0, 'no regen sites under the sea');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
