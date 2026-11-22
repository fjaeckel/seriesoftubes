const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Dragging a new link from one POP to another shows its length and price on a pill; city names were painted over it,
// so it could not be read (#454). It has to be drawn after every city and label.
test('#454 the new-link tooltip is drawn over city names', () => {
  const { ev, errors } = load();
  ev("UI.startCity='fra';ACT.start({});if(UI.pendGame)ACT.pitchSkip();for(const g of GOALS)S.done[g.id]=0;S.cash=1e8");
  ev("ACT.buildPop({city:'ams'});compute();cam.x=(CITY.fra.x+CITY.ams.x)/2;cam.y=(CITY.fra.y+CITY.ams.y)/2;cam.z=3;wrapCam()");
  const order = JSON.parse(ev(`(()=>{const log=[],p0=pill,d0=drawCity;
    pill=function(t){log.push(/ km/.test(t)?'tip':'pill');return p0.apply(this,arguments);};
    drawCity=function(){log.push('city');return d0.apply(this,arguments);};
    const [sx,sy]=toS(CITY.ams.x,CITY.ams.y,0);UI.drag={mode:'link',from:'fra',cx:sx,cy:sy};UI.snap={id:'ams',sx,sy};
    try{drawFrame(performance.now());}finally{pill=p0;drawCity=d0;UI.drag=null;UI.snap=null;}
    return JSON.stringify(log);})()`));
  assert.ok(order.includes('tip'), 'the tooltip is drawn');
  assert.ok(order.includes('city'), 'cities are drawn');
  assert.ok(order.lastIndexOf('city') < order.indexOf('tip'), `tooltip drawn before a city: ${order.join(',')}`);
  assert.deepEqual(errors, []);
});
