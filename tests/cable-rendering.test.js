const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('cable bounds skip offscreen point transforms without changing drawing commands', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Drawing','fra',{mode:'sandbox'})");
  const src = ev('drawCables.toString()');
  const plain = src.replace('const box=polyBox(cp.pts);', '').replace('if(toS(box[2],0,k)[0]<-20||toS(box[0],0,k)[0]>CW+20)continue;const sp=cp.pts.map(p=>toS(p[0],p[1],k));', 'const sp=cp.pts.map(p=>toS(p[0],p[1],k));let mn=Infinity,mx=-Infinity;for(const q of sp){mn=Math.min(mn,q[0]);mx=Math.max(mx,q[0]);}if(mx<-20||mn>CW+20)continue;');
  assert.notEqual(src, plain);
  ev(`window.plainCables=eval('('+${JSON.stringify(plain)}+')');window.cmd=[];for(const k of ['beginPath','moveTo','lineTo','stroke','setLineDash','strokeText','fillText'])ctx[k]=(...a)=>cmd.push([k,...a]);`);
  for (const [city, x, z] of [['fra', 1050, 3.2], ['hkg', 1700, 7], ['hnl', -50, 2], [null, 2050, 1]]) {
    ev(`cam.x=${x};cam.y=350;cam.z=${z};UI.sel=${city ? `{type:'city',id:'${city}'}` : 'null'};WL.key=null`);
    const actual = ev('cmd=[];drawCables(visibleKs());JSON.stringify(cmd)');
    const expected = ev('cmd=[];plainCables(visibleKs());JSON.stringify(cmd)');
    assert.equal(actual, expected, `${city || 'wrapped map'} at zoom ${z}`);
  }
  assert.deepEqual(errors, []);
});
