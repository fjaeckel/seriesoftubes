// #505: what the player's own tap says shows at once, even while the day's notices wait in line (one toast at a time,
// #498). A full router port when adding optics used to wait behind every notice already queued: a beep and nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const setup = (ev) => ev(`ACT.start({});S.cash=1e9;S.lvl=13;S.day=100;for(const g of GOALS)S.done[g.id]=0;
 S.pops.fra.rgen=mainRG(4);S.pops.fra.routers=16;S.pops.ams={...S.pops.fra,routers:1};
 S.links=[{id:'fiber',a:'fra',b:'ams',kind:'df',own:true,sys:'roadm',km:400,ch:[],ready:0,day:0,cut:0,mo:1}];
 while(portsMax('ams')-portsUsed('ams')>=chPorts('zr4','ams')&&S.links[0].ch.length<chMax(S.links[0]))S.links[0].ch.push('zr4');
 UI.sel=null;renderAll();$('toasts').textContent='';
 // The day queues trouble of its own: one showing, more waiting.
 UI.tick=true;try{for(const c of ['Paris','Madrid','Rome'])toast('<b>Fiber cut</b><br>'+c+' is down.','bad');}finally{UI.tick=false;}`);
const shown = (ev) => ev("(document.querySelector('#toasts .toast:not(.tq)')||{}).textContent||''");
const portsFull = /No free router ports in Amsterdam/;

test('#505 a full port when the player adds an optic shows at once, ahead of the day\'s notices', () => {
  const { ev, dom, errors } = load();
  try {
    setup(ev);
    assert.ok(ev("portsMax('ams')-portsUsed('ams')<chPorts('zr4','ams')"), 'Amsterdam is full');
    assert.match(shown(ev), /Paris is down/);
    const n = ev('S.links[0].ch.length');
    ev("const b=document.createElement('div');b.innerHTML=btn('+','addCh',{id:'fiber',o:'zr4'});document.body.append(b);b.querySelector('button').click()");
    assert.equal(ev('S.links[0].ch.length'), n, 'nothing bought');
    assert.match(shown(ev), portsFull, 'the answer to the tap is the toast showing');
    assert.equal(ev("document.querySelectorAll('#toasts .toast.tq').length"), 3, 'the day\'s notices still wait, none lost');
    assert.match(ev("document.querySelector('#toasts .toast.tq').textContent"), /Paris is down/, 'the one it covered is next');
    // Tapped again while it waits behind something that stopped the clock: it comes back to the front, counted.
    ev("toastShow('<b>Game paused</b><br>Outage in Lisbon.','bad',[],null,0,'out',true)");
    assert.doesNotMatch(shown(ev), portsFull);
    ev("document.querySelector('[data-act=addCh]').click()");
    assert.match(shown(ev), portsFull);
    assert.match(shown(ev), /×2/);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('#505 the typed optic count gets the same answer at once', () => {
  const { ev, dom, errors } = load();
  try {
    setup(ev);
    ev("UI.sel={type:'link',id:'fiber'};renderPanel()");
    const doc = dom.window.document, f = doc.querySelector('form.optic-count[data-optic="zr4"]'), input = f.elements.count;
    input.value = String(ev('S.links[0].ch.length') + 1);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    f.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.doesNotMatch(shown(ev), /Paris is down/, 'the reply to the player is showing');
    assert.match(shown(ev), portsFull);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('the day\'s own notices still wait their turn, even when a tap ran the day', () => {
  const { ev, dom } = load();
  try {
    setup(ev);
    ev("UI.tap=true;UI.tick=true;try{toast('<b>Router crash</b><br>Lisbon.','bad')}finally{UI.tick=false;UI.tap=false}");
    assert.match(shown(ev), /Paris is down/);
  } finally { dom.window.close(); }
});
