/* ---------- Pie in the Sky, scaling up: factory lines, launch towers, landing rights years ahead ----------
   S.pie.lines (1..PIE_LINE_MAX, repaired by pieSanitize) multiplies what the factory bakes and keeps on the shelf.
   pad.t (1..PIE_TOWER_MAX) is towers at one pad: a pad with t towers flies every leadDays(gap)/t days. */
const pieFacMonth=()=>PIE_FAC_MONTH*(S&&S.pie?S.pie.lines:1);
const pieStockMax=()=>PIE_STOCK_MAX*(S&&S.pie?S.pie.lines:1);
const piePadGap=(pad,rk)=>Math.max(1,Math.ceil(leadDays(ROCKETS[rk].gap)/pad.t));
// Landing rights can be held at most ten years ahead (pieSanitize clamps there); refused ones (not pieFree) cannot be bought.
// Whole years to buy so the rights in cc run at least y years from today: 0 when they already do or the cap is reached.
const pieLicBase=cc=>{const l=S.pie.lic[cc];return Math.max(S.day,l&&l.state==='ok'?l.until:0);};
const pieLicRoom=cc=>Math.max(0,Math.floor((S.day+PIE_LIC_DAYS*10-pieLicBase(cc))/PIE_LIC_DAYS));
const pieLicYears=(cc,y)=>Math.max(0,Math.min(Math.ceil((S.day+y*PIE_LIC_DAYS-pieLicBase(cc))/PIE_LIC_DAYS),pieLicRoom(cc)));
const pieLicAdd=(cc,n)=>{S.pie.lic[cc]={state:'ok',until:pieLicBase(cc)+n*PIE_LIC_DAYS};};
// Countries the ground segment needs: those with a dish, or with rights held.
const pieLicCcs=()=>[...new Set([...S.pie.dishes.map(x=>CITY[x.city].cc),...Object.keys(S.pie.lic)])];
// The bill to cover every such country for y years: [[cc,years]] and the total.
function pieLicAllQuote(y){const o=[];let cost=0;for(const cc of pieLicCcs()){if(!pieFree(cc))continue;const n=pieLicYears(cc,y);if(n){o.push([cc,n]);cost+=n*pieLicPrice(cc);}}return {list:o,cost};}
const pieAntLeft=x=>PIE_ANT_MAX-x.ant;
const pieAntAllCost=()=>S.pie.dishes.reduce((a,x)=>a+pieAntLeft(x)*pieAntPrice(x.band),0);
// A new dish comes at the best band researched; moving a dish up a band pays the difference on each antenna.
const pieDishPrice=()=>{const b=pieBandMax();return b?piePrice(PIE_DISH)+pieAntPrice(b):piePrice(PIE_DISH+PIE_ANT);};
const pieBandCost=x=>{const b=pieBandMax();return b>(x.band||0)?x.ant*(pieAntPrice(b)-pieAntPrice(x.band)):0;};
// POPs in cc that could still get a dish.
const pieDishFree=cc=>Object.keys(S.pops).filter(c=>CITY[c].cc===cc&&!S.pie.dishes.some(x=>x.city===c));
const piePadSalvage=p=>Math.round((piePrice(PIE_PAD)+(p.t-1)*piePrice(PIE_TOWER))*PIE_SALVAGE);
// Lasered pies in a crust, and whether it counts as lasered (pieLased: over PIE_RAW of a full crust), for the panels.
function pieLasLine(id){const n=pieLive(id);if(!(n>0))return '';const las=pieLiveLas(id),need=Math.max(0,Math.floor(CRUSTS[id].full*PIE_RAW)+1-las);
  return `<div class="meta pie-las${pieLased(id)?' on':''}">🔦 ${tr('pie.las_count',{las,n})} · ${pieLased(id)?tr('pie.las_yes'):pieLasCut(id)?tr('pie.las_cut'):tr('pie.las_need',{need,min:pct(PIE_RAW)})}</div>`;}
// Launch slots for "every pad": one per tower of each pad that reaches the crust.
const pieSlots=cr=>S.pie.pads.filter(p=>piePadOk(p.city,cr)).reduce((a,p)=>a+p.t,0);
