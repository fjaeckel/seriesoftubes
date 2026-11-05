// Text that comes from a save (an imported file, or this device's storage) is shown as text, never as HTML: the
// name of your own subsea cable, the repair button of a POP that is down. sanitize() also keeps a cable's name short.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

function open() {
  const h = load({ seed: 777 });
  h.ev(`S=migrate(JSON.parse(${lit(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();S.nextFail=S.day+999;S.nextEvent=S.day+999;compute();`);
  return h;
}

test('text from a save is shown as text: a cable’s name and a repair button', () => {
  const { ev, errors } = open();
  const r = JSON.parse(ev(`(()=>{const s=JSON.parse(JSON.stringify(S)),b0=s.links[0],own=(id,cname)=>({...b0,id,kind:'df',own:true,sub:true,ch:[],sys:'roadm',seaDesign:'standard',cable:null,trench:'own:'+id,ready:0,mo:100,cname});
    const l=own('zzl1','<b id="xss1">Cable</b>'+'x'.repeat(200)),t=own('zzl2',12345);s.links.push(l,t);
    const c=Object.keys(s.pops)[0];s.pops[c].down=s.day+5;s.inc.push({id:'zz',type:'crash',ref:c,until:s.day+5,cost:1000,msg:'boom',fix:'<i id="xss2">fix</i>'});
    S=migrate(s);compute();UI.tab='links';const L=S.links.find(x=>x.id===l.id),T=t&&S.links.find(x=>x.id===t.id);
    const h1=cityPanel(L.a)+cityPanel(L.b),h2=cityPanel(c);
    return JSON.stringify({len:L.cname.length,num:T.cname,raw1:/<b id="xss1">/.test(h1),esc1:/&lt;b id=/.test(h1),raw2:/<i id="xss2">/.test(h2),esc2:/&lt;i id=/.test(h2)});})()`));
  assert.equal(r.len, 60, 'a cable name from a save is cut to 60 characters');
  assert.equal(r.num, '12345', 'and is always text');
  assert.equal(r.raw1, false); assert.equal(r.raw2, false);
  assert.equal(r.esc1, true, 'the cable\u2019s name shows, escaped');
  assert.equal(r.esc2, true, 'the repair button shows its text escaped');
  assert.deepEqual(errors, []);
});
