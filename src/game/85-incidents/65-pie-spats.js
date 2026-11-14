/* ---------- Pie in the Sky: geopolitical spats (docs/plans/pie-in-the-sky.md) ----------
   Cartoon diplomacy, even-handed: countries come from the city table (CITIES[].cc, named by the browser), never a
   leader or a party, and the jokes are about paperwork, food, weather and national pride. Like every incident they need
   chaos on and 90 quiet days (rule O5); each asks one question with two answers (a bottom sheet, pieSpatSheet()), and an
   unanswered one decides itself on its deadline. State: S.pie.spat[id] = {st:'ask'|'on', cc, cc2?, ask, until, c, hold…},
   repaired by pieSpatFix() on load and ended by pieSpatDay() on o.until (then D.end()).
   Landing rights a spat takes away ('refused' or 'sus' in S.pie.lic) are held in o.hold {cc: days of rights left} and given
   back, those days and all, when the spat ends. For routing: pieSpatHome(cc) (that country's customers must land on a dish
   inside it) and pieAirBlock(a,b) (traffic from a must not use a dish in b), on top of pieDishes()' landing rights. */
const PIE_SPAT_ASK=20,PIE_SPAT_RATE=1/90,PIE_SPAT_MAX=2,PIE_BAND_DAYS=180,PIE_KILL_DAYS=90,PIE_KILL_MOOD=15,PIE_ASTRO_MOOD=20,PIE_VISOR=50000,
  PIE_HOME_DAYS=90,PIE_PAD_DISHES=3,PIE_PAD_DAYS=180,PIE_PAD_AID=0.75,PIE_GRAB_N=5,PIE_GRAB_FEE=40e6,PIE_JAM=0.4,PIE_JAM_FILTER=0.8,PIE_JAM_ANT=2e6,
  PIE_AIR=0.75,PIE_AIR_DAYS=120,PIE_AIR_SUS=60,PIE_LOBBY_DAYS=30;
// Country centroids from the city table, once; a neighbour is the nearest other one.
let PIE_CC=null;
function pieCcAll(){if(PIE_CC)return PIE_CC;const m={};for(const c of CITIES){const o=m[c.cc]||(m[c.cc]={lat:0,lon:0,n:0});o.lat+=c.lat;o.lon+=c.lon;o.n++;}
  for(const k in m){m[k].lat/=m[k].n;m[k].lon/=m[k].n;}return PIE_CC=m;}
function pieNb(cc){const A=pieCcAll(),a=A[cc];let b=null,m=1e9;if(!a)return null;for(const k in A){if(k===cc)continue;const d=hav(a.lon,a.lat,A[k].lon,A[k].lat);if(d<m){m=d;b=k;}}return b;}
const pieDishCc=()=>[...new Set(S.pie.dishes.filter(x=>S.pops[x.city]).map(x=>CITY[x.city].cc))].sort();
const piePopCc=()=>[...new Set(Object.keys(S.pops).map(c=>CITY[c].cc))].sort();
const pieDishesIn=cc=>S.pie.dishes.filter(x=>S.pops[x.city]&&CITY[x.city].cc===cc).length;
// A country nobody is already holding hostage.
const pieFree=cc=>{const l=S.pie.lic[cc];return !(l&&l.state!=='ok'&&l.until>S.day);};
const pieCcN=cc=>esc(pieLicCountry(cc));
function pieMood(f,dv){let n=0;for(const b of S.biz)if(f(b)){b.mood=clamp(b.mood+dv,1,100);n++;}return n;}
const pieInCc=cc=>b=>isCity(b.city)&&CITY[b.city].cc===cc;
// Take a country's landing rights away until o.until, remembering the days left; pieRelease() gives them back.
function pieHold(o,cc,state){const P=S.pie,l=P.lic[cc],h=o.hold||(o.hold={});if(!(cc in h))h[cc]=l&&l.state==='ok'&&l.until>S.day?l.until-S.day:0;P.lic[cc]={state,until:o.until};}
function pieRelease(o){const P=S.pie;for(const cc in o.hold||{}){const l=P.lic[cc];if(!l||l.state==='ok'||l.until!==o.until)continue;const r=o.hold[cc];if(r>0)P.lic[cc]={state:'ok',until:S.day+r};else delete P.lic[cc];}o.hold={};}
const pieSpatEnd=o=>{o.until=S.day+1;};
// Read by pieDishMul() (60-pie.js): jamming and a split network turn dishes down.
function pieSpatDishMul(x){const sp=S.pie.spat;if(!sp.jam&&!sp.air)return 1;const cc=CITY[x.city].cc;let m=1;
  if(sp.jam&&(sp.jam.cc===cc||sp.jam.cc2===cc))m*=sp.jam.c===0?PIE_JAM_FILTER:PIE_JAM;
  if(sp.air&&sp.air.st==='on'&&sp.air.c===0&&(sp.air.cc===cc||sp.air.cc2===cc))m*=PIE_AIR;return m;}
function pieGrabMul(){const o=S.pie&&S.pie.spat.grab;return o&&o.st==='on'&&o.left>0?o.m:0;}
function pieSpatHome(cc){const o=S&&S.pie&&S.pie.spat.home;return !!o&&o.cc===cc&&!o.ok;}
function pieAirBlock(a,b){const o=S&&S.pie&&S.pie.spat.air;return !!o&&o.st==='on'&&o.c===0&&((o.cc===a&&o.cc2===b)||(o.cc===b&&o.cc2===a));}
// The spats. pick(o,c): c is 0, 1 or -1 (nobody answered); cost(o,c): what that answer costs now; def: the answer on the deadline.
const PIE_SPAT_DEF={
 air:{n:2,def:0,can:()=>pieDishCc().filter(pieFree).filter(cc=>{const b=pieNb(cc);return b&&pieFree(b);}),
  start:(o,cc)=>{o.cc=cc;o.cc2=pieNb(cc);},
  txt:o=>({t:tr('pie_spat.air_t'),b:tr('pie_spat.air_b',{a:pieCcN(o.cc),b:pieCcN(o.cc2)}),p:tr('pie_spat.air_p'),
    c:[tr('pie_spat.air_c0',{p:pct(PIE_AIR),n:PIE_AIR_DAYS}),tr('pie_spat.air_c1',{n:PIE_AIR_SUS})]}),
  pick:(o,c)=>{if(c===0){o.until=S.day+PIE_AIR_DAYS;compute();return tr('pie_spat.air_r0',{n:PIE_AIR_DAYS});}
    o.until=S.day+PIE_AIR_SUS;pieHold(o,o.cc,'sus');pieHold(o,o.cc2,'sus');compute();return tr('pie_spat.air_r1',{a:pieCcN(o.cc),b:pieCcN(o.cc2),d:dateStr(o.until)});}},
 astro:{n:0,def:1,can:()=>pieLiveAll()>=PIE_ASTRO_N?['']:[],start:o=>{o.n=pieLiveAll();},
  cost:(o,c)=>c===0?piePrice(o.n*PIE_VISOR):0,
  txt:o=>({t:tr('pie_spat.astro_t'),b:tr('pie_spat.astro_b',{n:o.n}),p:tr('pie_spat.astro_p'),
    c:[tr('pie_spat.astro_c0',{cost:fmt$(piePrice(o.n*PIE_VISOR))}),tr('pie_spat.astro_c1',{n:PIE_ASTRO_MOOD})]}),
  pick:(o,c)=>{pieSpatEnd(o);if(c===0)return tr('pie_spat.astro_r0');pieMood(b=>b.type==='edu'||b.type==='mars',-PIE_ASTRO_MOOD);pieFounder(N_('pie.fp_astro'));return tr('pie_spat.astro_r1');}},
 band:{n:2,def:-1,can:()=>pieDishCc().filter(pieFree).filter(cc=>{const b=pieNb(cc);return b&&pieFree(b);}),
  start:(o,cc)=>{o.cc=cc;o.cc2=pieNb(cc);},
  txt:o=>({t:tr('pie_spat.band_t'),b:tr('pie_spat.band_b',{a:pieCcN(o.cc),b:pieCcN(o.cc2)}),p:tr('pie_spat.band_p'),
    c:[tr('pie_spat.band_c',{a:pieCcN(o.cc),b:pieCcN(o.cc2),n:PIE_BAND_DAYS}),tr('pie_spat.band_c',{a:pieCcN(o.cc2),b:pieCcN(o.cc),n:PIE_BAND_DAYS})]}),
  pick:(o,c)=>{if(c<0){o.until=S.day+PIE_BAND_DAYS/2;pieHold(o,o.cc,'sus');pieHold(o,o.cc2,'sus');compute();return tr('pie_spat.band_r_none',{a:pieCcN(o.cc),b:pieCcN(o.cc2),n:PIE_BAND_DAYS/2});}
    const lose=c===0?o.cc2:o.cc;o.until=S.day+PIE_BAND_DAYS;pieHold(o,lose,'sus');compute();return tr('pie_spat.band_r',{a:pieCcN(c===0?o.cc:o.cc2),b:pieCcN(lose),d:dateStr(o.until)});}},
 grab:{n:0,def:1,can:()=>S.pie.fac?['']:[],start:()=>{},cost:(o,c)=>c===0?piePrice(PIE_GRAB_FEE):0,
  txt:()=>({t:tr('pie_spat.grab_t'),b:tr('pie_spat.grab_b'),p:tr('pie_spat.grab_p'),
    c:[tr('pie_spat.grab_c0',{cost:fmt$(piePrice(PIE_GRAB_FEE)),n:PIE_GRAB_N,p:'10%'}),tr('pie_spat.grab_c1',{n:PIE_GRAB_N,p:'30%'})]}),
  pick:(o,c)=>{o.m=c===0?0.1:0.3;o.left=PIE_GRAB_N;o.until=S.day+720;return tr('pie_spat.grab_r',{n:PIE_GRAB_N,p:pct(o.m)});}},
 home:{n:1,def:0,can:()=>S.pie.dishes.length?piePopCc().filter(cc=>!pieDishesIn(cc)):[],start:(o,cc)=>{o.cc=cc;},
  cost:(o,c)=>c===1?Math.round(pieLicPrice(o.cc)*0.5):0,
  txt:o=>({t:tr('pie_spat.home_t'),b:tr('pie_spat.home_b',{a:pieCcN(o.cc)}),p:tr('pie_spat.home_p'),
    c:[tr('pie_spat.home_c0',{n:PIE_HOME_DAYS}),tr('pie_spat.home_c1',{cost:fmt$(Math.round(pieLicPrice(o.cc)*0.5))})]}),
  pick:(o,c)=>{if(c===1){o.ok=1;pieSpatEnd(o);return tr('pie_spat.home_r1');}o.until=S.day+PIE_HOME_DAYS;return tr('pie_spat.home_r0',{a:pieCcN(o.cc),d:dateStr(o.until)});},
  day:(o,d)=>{if(o.st==='on'&&!o.ok&&pieDishesIn(o.cc)){o.ok=1;pieSpatEnd(o);pieMood(pieInCc(o.cc),5);toast(tr('pie_spat.home_won',{a:pieCcN(o.cc)}),'good');}},
  end:o=>{if(o.st!=='on'||o.ok)return;const f=pieLicPrice(o.cc);pieCharge(f);pieMood(pieInCc(o.cc),-10);toast(tr('pie_spat.home_fined',{a:pieCcN(o.cc),cost:fmt$(f)}),'bad');}},
 jam:{n:2,def:1,can:()=>pieDishCc().filter(cc=>pieNb(cc)),
  start:(o,cc)=>{o.cc=cc;o.cc2=pieNb(cc);o.until=S.day+rint(5,6);o.ask=o.until-1;compute();},
  cost:(o,c)=>c===0?piePrice(PIE_JAM_ANT)*(pieDishesIn(o.cc)+pieDishesIn(o.cc2)):0,
  txt:o=>({t:tr('pie_spat.jam_t'),b:tr('pie_spat.jam_b',{a:pieCcN(o.cc),b:pieCcN(o.cc2),p:pct(PIE_JAM),d:dateStr(o.until)}),p:tr('pie_spat.jam_p'),
    c:[tr('pie_spat.jam_c0',{cost:fmt$(piePrice(PIE_JAM_ANT)*(pieDishesIn(o.cc)+pieDishesIn(o.cc2))),p:pct(PIE_JAM_FILTER)}),tr('pie_spat.jam_c1',{p:pct(PIE_JAM)})]}),
  pick:(o,c)=>{compute();return c===0?tr('pie_spat.jam_r0',{p:pct(PIE_JAM_FILTER)}):tr('pie_spat.jam_r1',{d:dateStr(o.until)});},end:()=>compute()},
 kill:{n:1,def:0,can:()=>pieDishCc().filter(pieFree),start:(o,cc)=>{o.cc=cc;},
  txt:o=>({t:tr('pie_spat.kill_t'),b:tr('pie_spat.kill_b',{a:pieCcN(o.cc)}),p:tr('pie_spat.kill_p'),
    c:[tr('pie_spat.kill_c0',{a:pieCcN(o.cc),n:PIE_KILL_MOOD}),tr('pie_spat.kill_c1',{n:PIE_KILL_DAYS})]}),
  pick:(o,c)=>{if(c===0){pieSpatEnd(o);const n=pieMood(pieInCc(o.cc),-PIE_KILL_MOOD);return tr('pie_spat.kill_r0',{n});}
    o.until=S.day+PIE_KILL_DAYS;pieHold(o,o.cc,'sus');compute();return tr('pie_spat.kill_r1',{a:pieCcN(o.cc),d:dateStr(o.until)});}},
 lic:{n:1,def:1,can:()=>pieDishCc().filter(pieFree),start:(o,cc)=>{o.cc=cc;o.n=rint(90,91);},
  cost:(o,c)=>c===0?Math.round(pieLicPrice(o.cc)*0.25):0,
  txt:o=>({t:tr('pie_spat.lic_t'),b:tr('pie_spat.lic_b',{a:pieCcN(o.cc)}),p:tr('pie_spat.lic_p',{a:pieCcN(o.cc)}),
    c:[tr('pie_spat.lic_c0',{cost:fmt$(Math.round(pieLicPrice(o.cc)*0.25)),n:PIE_LOBBY_DAYS}),tr('pie_spat.lic_c1',{n:o.n})]}),
  pick:(o,c)=>{o.until=S.day+(c===0?PIE_LOBBY_DAYS:o.n);pieHold(o,o.cc,'refused');compute();return tr('pie_spat.lic_r',{a:pieCcN(o.cc),d:dateStr(o.until)});}},
 pad:{n:1,def:1,can:()=>piePopCc().filter(cc=>CITIES.some(c=>c.cc===cc&&pieCoast(c.id))&&!S.pie.pads.some(p=>CITY[p.city].cc===cc)),start:(o,cc)=>{o.cc=cc;},
  txt:o=>({t:tr('pie_spat.pad_t'),b:tr('pie_spat.pad_b',{a:pieCcN(o.cc),n:PIE_PAD_DISHES}),p:tr('pie_spat.pad_p'),
    c:[tr('pie_spat.pad_c0',{n:PIE_PAD_DISHES,a:pieCcN(o.cc),d:PIE_PAD_DAYS}),tr('pie_spat.pad_c1')]}),
  pick:(o,c)=>{if(c!==0){pieSpatEnd(o);return tr('pie_spat.pad_r1');}o.until=S.day+PIE_PAD_DAYS;return tr('pie_spat.pad_r0',{n:PIE_PAD_DISHES,a:pieCcN(o.cc),d:dateStr(o.until)});},
  day:(o,d)=>{if(o.st!=='on'||o.ok||o.fail)return;
    if(pieDishesIn(o.cc)>=PIE_PAD_DISHES){o.ok=1;pieSpatEnd(o);const P=S.pie,c=Object.keys(S.pops).filter(x=>CITY[x].cc===o.cc&&pieCoast(x)&&!P.pads.some(p=>p.city===x)).sort()[0];
      if(c&&P.pads.length<PIE_PAD_MAX){P.pads.push({city:c,next:d,t:1,boosters:[]});toast(tr('pie_spat.pad_won',{city:CITY[c].name}),'goal');}
      else{const v=Math.round(piePrice(PIE_PAD)*PIE_PAD_AID);pieRefund(v);toast(tr('pie_spat.pad_cheque',{a:pieCcN(o.cc),cost:fmt$(v)}),'goal');}sfx('coin');return;}
    if(d>=o.until-1){o.fail=1;o.until=d+PIE_AIR_SUS;pieHold(o,o.cc,'sus');compute();toast(tr('pie_spat.pad_failed',{a:pieCcN(o.cc),d:dateStr(o.until)}),'bad');}}},
};
const PIE_SPAT_KEYS=Object.keys(PIE_SPAT_DEF);
// Sanitize: only what the spat needs, countries that exist, days in range.
function pieSpatFix(id,o,s){const D=PIE_SPAT_DEF[id],A=pieCcAll(),day=s.day,cc=v=>typeof v==='string'&&own(A,v);
  const v={st:o.st==='on'?'on':'ask',ask:int(o.ask,0,day+PIE_SPAT_ASK,day),until:int(o.until,0,day+720,day),c:int(o.c,-1,1,-1)};
  if(D.n>=1){if(!cc(o.cc))return null;v.cc=o.cc;}if(D.n>=2){if(!cc(o.cc2)||o.cc2===o.cc)return null;v.cc2=o.cc2;}
  if(o.hold&&typeof o.hold==='object'){v.hold={};for(const k of Object.keys(o.hold))if(cc(k))v.hold[k]=int(o.hold[k],0,PIE_LIC_DAYS*10,0);}
  if(o.n!==undefined)v.n=int(o.n,0,1e6,0);if(o.ok)v.ok=1;if(o.fail)v.fail=1;
  if(id==='grab'){v.m=clamp(num(o.m,0.3),0,0.3);v.left=int(o.left,0,PIE_GRAB_N,0);}
  return v;}
// The day: an unanswered spat decides itself on its deadline.
function pieSpatTick(id,o,d){const D=PIE_SPAT_DEF[id];if(o.st==='ask'&&d>=o.ask){pieSpatChoose(id,D.def,true);return;}if(D.day)D.day(o,d);}
for(const id of PIE_SPAT_KEYS)PIE_SPATS[id]={fix:(o,s)=>pieSpatFix(id,o,s),day:(o,d)=>pieSpatTick(id,o,d),end:o=>{const D=PIE_SPAT_DEF[id];if(D.end)D.end(o);pieRelease(o);}};
// Starts one (id forces which, for tests, the astronomers and the Ex-Im Pie Bank; cc which country); true when it did.
function pieSpatStart(id,cc){const P=S.pie;if(!P||!P.co)return false;
  if(!id){const ok=PIE_SPAT_KEYS.filter(k=>k!=='astro'&&!P.spat[k]&&PIE_SPAT_DEF[k].can().length);if(!ok.length)return false;id=pick(ok);}
  const D=PIE_SPAT_DEF[id];if(!D||P.spat[id])return false;const cs=D.can();if(!cs.length)return false;
  if(cc&&!cs.includes(cc))return false;const o={st:'ask',ask:S.day+PIE_SPAT_ASK,c:-1};D.start(o,cc||pick(cs));if(!o.until)o.until=o.ask+1;P.spat[id]=o;
  S.stats.incidents++;S.stats.pieSpat=(S.stats.pieSpat||0)+1;pieFounder(N_('pie.fp_spat'));
  const t=D.txt(o);toast(`<b>🌍 ${t.t}</b><br>${t.b}`,'bad',[{l:tr('pie_spat.decide'),act:'pieSpatOpen',args:{id}}]);sfx('alert');return true;}
// The answer: what it costs (sandbox keeps count), what happens, and the press office's line.
function pieSpatChoose(id,c,auto){const P=S.pie,o=P&&P.spat[id],D=PIE_SPAT_DEF[id];if(!o||!D||o.st!=='ask')return false;
  const cost=D.cost&&c>=0?D.cost(o,c):0;if(cost>0&&!pieSpend(cost))return false;
  o.st='on';o.c=c;const r=D.pick(o,c);S.stats.survived++;
  toast(`<b>🌍 ${D.txt(o).t}</b><br>${auto?tr('pie_spat.auto')+' ':''}${r}<br><i>${D.txt(o).p}</i>`,auto?'bad':'',[]);return true;}
// The NOC card and Pie Control list the questions waiting for an answer.
function pieSpatCard(){const P=S&&S.pie;if(!P)return '';const ks=PIE_SPAT_KEYS.filter(k=>P.spat[k]&&P.spat[k].st==='ask');if(!ks.length)return '';
  return `<div class="pspat-l">${ks.map(k=>`<div class="kv"><span>🌍 ${PIE_SPAT_DEF[k].txt(P.spat[k]).t}</span>${btn(tr('pie_spat.decide'),'pieSpatOpen',{id:k},'pink sm')}</div>`).join('')}</div>`;}
function pieSpatSheet(id){const o=S&&S.pie&&S.pie.spat[id],D=PIE_SPAT_DEF[id];if(!o||!D)return;const t=D.txt(o);
  let h=`<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">🌍 ${tr('pie_spat.eyebrow')}</div><h2 style="font-size:22px">${t.t}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  h+=`<p class="lead">${t.b}</p><p class="meta"><i>${t.p}</i></p>`;
  if(o.st==='ask')h+=`<p class="meta">${tr('pie_spat.decide_by',{d:dateStr(o.ask)})}</p><div class="pspat-c">${t.c.map((l,c)=>{const v=D.cost?D.cost(o,c):0;return btn(l,'pieSpatPick',{id,c},c?'ghost':'pink',v>0&&!pieSand()&&S.cash<v);}).join('')}</div>`;
  else h+=`<p class="meta">${tr('pie_spat.decided')}</p>`;
  openModal(h,'pie-spat');}
// A land grab bills the next few launches (counted when they are booked, which is when the quote is paid).
function pieGrabUse(q){const o=S.pie&&S.pie.spat.grab;if(!o||o.st!=='on'||!(o.left>0))return;o.left--;if(!o.left)pieSpatEnd(o);}
function pieSpatDayAll(d){if(!pieChaos())return;const P=S.pie;if(Object.keys(P.spat).length>=PIE_SPAT_MAX)return;if(Math.random()<PIE_SPAT_RATE*chaosMul())pieSpatStart();}
PIE_ON.day.push(pieSpatDayAll);
