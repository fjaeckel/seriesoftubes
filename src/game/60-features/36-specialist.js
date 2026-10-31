/* ---------- Specialist play (#187, #173) ----------
   You do not have to grow everywhere to grow up. Customers call when your network can already serve them, not only
   when your level says so; gear one level ahead comes early as a vendor demo unit at a premium; a seat on a
   consortium cable is the way onto your own subsea glass before Tier 1; and a charter picks what you set out to be. */
const FIN=['nyc','chi','lon','fra','tok','sin','hkg','ams','ash'];
// What a capability brings in, and why the offer says it came.
const SPOT_W={lat:N_('specialist.spotted_your_ms_ms_a_b_path'),df:N_('specialist.spotted_your_cap_of_dark_fiber'),div:N_('specialist.spotted_your_two_diverse_paths_a'),eye:N_('specialist.spotted_your_broadband_in_a_one')};
const SPOT_BIG=12,SPOT_DF=0.75;
const latMaxOf=(a,b)=>+(kmBetween(a,b)/200*1.35).toFixed(1);
let BIGEYE=null;const bigEye=()=>BIGEYE||(BIGEYE=CITIES.slice().sort((x,y)=>y.P-x.P).slice(0,SPOT_BIG).map(c=>c.id));
// Worked out at most once a day (and again when the network changes shape): offers spawn far less often than that.
let SPOTC=null;
function spots(){const lv=lvl(),k=S.day+'|'+lv+'|'+S.links.length+'|'+Object.keys(S.pops).length+'|'+charter();if(SPOTC&&SPOTC.s===S&&SPOTC.k===k)return SPOTC.v;const v=spots0(lv);SPOTC={s:S,k,v};return v;}
function spots0(lv){const out=[];if(gatesOpen()||S.scn)return out;const up=t=>BIZ_T[t].lv>lv,mine=Object.keys(S.pops);
  if(up('hft')){const f=FIN.filter(c=>S.pops[c]);for(let i=0;i<f.length;i++)for(let j=i+1;j<f.length;j++){const a=f[i],b=f[j],ms=bestLat(a,b);if(ms<=latMaxOf(a,b))out.push({t:'hft',a,b,k:'lat',n:+ms.toFixed(1)});}}
  const dci=['onramp','ai','hyper'].filter(up);
  if(dci.length)for(const l of S.links){if(l.kind!=='df'||l.sub||l.ready>S.day||linkDown(l))continue;const g=dfCap(l);
    for(const t of dci){const T=BIZ_T[t];if(g>=T.opts[0]*SPOT_DF&&(!T.div||reqCan('diverse',{city:l.a,city2:l.b})))out.push({t,a:l.a,b:l.b,k:'df',n:g});}}
  if(up('sov')){const by={};for(const c of mine)(by[CITY[c].cc]=by[CITY[c].cc]||[]).push(c);
    for(const cs of Object.values(by))for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++)if(diversePaths(cs[i],cs[j]))out.push({t:'sov',a:cs[i],b:cs[j],k:'div',n:0});}
  if(up('cgame')&&R)for(const c of bigEye())if(S.pops[c]&&S.pops[c].bb&&sfOf(R,c)>=0.95)out.push({t:'cgame',a:c,b:null,k:'eye',n:0});
  return out;}
// A spotted customer starts at the smallest size its type comes in; your level makes them bigger and more frequent.
function spawnSpot(t,s){const T=BIZ_T[t],list=T.names.filter(n=>!S.usedNames.includes(n)),name=list.length?pick(list):pick(T.names);useName(name);
  const o={id:uid(),city:s.a,city2:s.b,name,type:t,bw:T.opts[0],reqs:[],exp:S.day+40,spot:{k:s.k,n:s.n}};
  o.rate=T.l2?Math.round((150+kmBetween(s.a,s.b)*0.08)*T.km*(T.lat?latPay():1)*(T.div?1+REQS.diverse.bonus:1)):T.rate;
  if(T.lat){o.reqs=['lat'];o.latMax=latMaxOf(s.a,s.b);}else if(T.div)o.reqs=['diverse'];
  S.offers.push(o);}
function spotWhy(o){const s=o&&o.spot;if(!s||!own(SPOT_W,s.k))return '';
  return `<div class="meta">🔭 ${tr(SPOT_W[s.k],{ms:s.n,cap:fmtCap(s.n),a:CITY[o.city].name,b:o.city2?CITY[o.city2].name:''})}</div>`;}

/* Vendor demo units: gear one level above yours, early, at a markup and after a short wait. Never two levels ahead. */
const DEMO_MUL=1.6,DEMO_DAYS=14;
function demoItem(k,id){return k==='rg'?RG[+id]||null:k==='sys'?(own(DF_SYS,id)?DF_SYS[id]:null):k==='opt'?(own(OPT,id)?OPT[id]:null):null;}
const demoAt=(k,id)=>{const d=S&&S.demo&&S.demo[k+':'+id];return d===undefined?null:d;};
const demoCan=L=>!gatesOpen()&&L===lvl()+1;
function techOk(k,id,L){if(L<=lvl())return true;const d=demoAt(k,id);return demoCan(L)&&d!==null&&d<=S.day;}
const techMul=L=>L>lvl()?DEMO_MUL:1;
function demoBtn(k,id,L,lock,cls){const d=demoAt(k,id);if(!demoCan(L))return btn(lock,'demoAsk',{k,id},cls,true);
  if(d!==null&&d>S.day)return btn(tr('specialist.demo_unit_ships_in_n_days',{n:d-S.day}),'demoAsk',{k,id},cls,true);
  return btn(tr('specialist.ask_for_a_demo_unit_p_n',{p:Math.round((DEMO_MUL-1)*100),n:leadDays(DEMO_DAYS)}),'demoAsk',{k,id},cls);}
const sysCost=k=>Math.round(DF_SYS[k].cost*techMul(DF_SYS[k].lvl));
// Digging your own fiber before level 3: the pioneer pays for the permits nobody has asked for yet.
const PIONEER=1.6;
const digMul=()=>lvl()>=3?1:PIONEER,digCost=km=>Math.round(dfBuildCost(km)*digMul());

/* A seat on a consortium cable (#173): pay your share of the build, wait for the ship, and own fiber pairs on it,
   lit with your own optics like your own cable. Capacity conferences offer them, and now and then a consortium calls. */
const SEAT_ROUTES={
 lon:[['nyc','bde','Amity Ville'],['lis','for','Ella Fitz-Link'],['mrs','sin','Sea, Me, We, Us, Them'],['lon','lag','Equi-Not']],
 hnl:[['syd','lax','Southern Double-Cross'],['tok','sea','Kuro-Show'],['sin','hkg','Dim Sum Express'],['syd','akl','Tasman Devil']],
};
const SEAT_N=[1,2,4],SEAT_SHARE=10,SEAT_LV=2,SEAT_ODDS=240,SEAT_EXP=30;
const seatKm=(a,b)=>Math.round(kmBetween(a,b)*1.2),seatCost=(km,n)=>Math.round(ownCabCost(km)*n/SEAT_SHARE),seatMo=(km,n)=>Math.round(ownCabMo(km)*n/SEAT_SHARE),seatDays=km=>Math.max(1,Math.round(ownCabDays(km)*0.6));
const seatRoute=name=>Object.values(SEAT_ROUTES).flat().find(r=>r[2]===name);
// A conference names its own routes; a cold call is about a route with one of your POPs at an end. Picked by a hash, not
// by the dice, so the rest of the game rolls exactly as before.
function seatOffer(c,d){const rs=(c?SEAT_ROUTES[c]||[]:Object.values(SEAT_ROUTES).flat()).filter(r=>isCity(r[0])&&isCity(r[1])&&(c||S.pops[r[0]]||S.pops[r[1]])&&!S.links.some(l=>l.seat&&l.cname===r[2]));
  if(!rs.length)return null;const r=rs[hstr(S.asn+'|seat|'+d)%rs.length];return {a:r[0],b:r[1],name:r[2],km:seatKm(r[0],r[1]),exp:d+SEAT_EXP};}
function seatConf(c){if(S.seatOff||lvl()<SEAT_LV||S.scn)return;S.seatOff=seatOffer(c,S.day);if(S.seatOff)toast(tr('specialist.a_consortium_is_selling_seats_on',{name:esc(S.seatOff.name),a:CITY[S.seatOff.a].name,b:CITY[S.seatOff.b].name}),'goal',[{l:tr('common.show_me'),act:'leftTab',args:{t:'deals'}}]);}
function seatSection(){const o=S.seatOff;if(!o||o.exp<=S.day)return '';const pop=[o.a,o.b].filter(c=>!S.pops[c]).reduce((x,c)=>x+popCost(c),0);
  return `<div class="inc" style="background:#E6F4FF"><div class="nm">🚢 ${tr('specialist.consortium_seat_name',{name:esc(o.name)})}</div><div class="meta">${tr('specialist.a_b_km_km_ready_in',{a:CITY[o.a].name,b:CITY[o.b].name,km:o.km.toLocaleString(),n:seatDays(o.km),ms:linkLat({kind:'df',own:true,sub:true,km:o.km,seaDesign:'standard'}).toFixed(1)})} · ${tr('ui.n_d_left',{n:o.exp-S.day})}</div>
  <div class="meta">${tr('specialist.your_own_fiber_pairs_on_a')}${pop?' '+tr('specialist.includes_pops_at_the_landings_price',{price:fmt$(pop)}):''}</div>
  <div class="btns">${SEAT_N.map(n=>{const c=seatCost(o.km,n)+pop;return btn(`${trn('specialist.n_fiber_pairs',n)} <small>${fmt$(c)} · ${tr('common.price_mo',{price:fmt$(seatMo(o.km,n))})}</small>`,'seatBuy',{n},'sm',S.cash<c);}).join('')}${btn(tr('common.decline'),'seatNo',{},'ghost sm')}</div></div>`;}
function seatPanel(l){if(!l.seat)return '';return `<div class="kv"><span>${tr('specialist.consortium_seat')}</span><b>${esc(l.cname||'')} · ${trn('specialist.n_fiber_pairs',Math.max(1,l.pairs|0))}</b></div><p class="note">${tr('specialist.the_consortium_runs_the_cable_your')}</p>`;}

/* Charters: what the network sets out to be, picked once at the start of a Normal game. Global backbone is the game as
   it always was; the Low-latency boutique sells speed to traders and has its own win, Speed of Light. */
const CHARTERS={global:{i:'🌐',n:N_('specialist.global_backbone'),d:N_('specialist.the_classic_game_grow_everywhere_and')},boutique:{i:'⚡',n:N_('specialist.low_latency_boutique'),d:N_('specialist.trading_firms_and_other_latency_customers')}};
const CHARTER_DAYS=30,LAT_PAY=1.4,SOL_ROUTES=3,SOL_CUST=2;
const charter=()=>S&&!S.scn&&S.mode==='normal'&&S.charter==='boutique'?'boutique':'global';
const latPay=()=>charter()==='boutique'?LAT_PAY:1;
// The fastest a leased wave or fiber gets between two cities: overland, or the quickest cable on the route.
function leasedLat(a,b){let best=isSub(a,b)?Infinity:kmBetween(a,b)*1.25/200;for(const c of cablesFor(a,b))best=Math.min(best,c.km*Math.min(CAB[c.cid].lat||1,1.25)/200);return best;}
const ownGlass=l=>l.kind==='df'&&l.own&&l.ready<=S.day&&dfCap(l)>0;
let SOLC=null;
function solRoutes(){const k=S.day+'|'+S.links.length+'|'+S.links.reduce((n,l)=>n+(l.ch||[]).length,0);if(SOLC&&SOLC.s===S&&SOLC.k===k)return SOLC.v;
  const f=FIN.filter(c=>S.pops[c]),v=[];if(S.links.some(ownGlass))for(let i=0;i<f.length;i++)for(let j=i+1;j<f.length;j++){const a=f[i],b=f[j],o=bestLat(a,b,ownGlass),l=leasedLat(a,b);if(isFinite(o)&&isFinite(l)&&o<l)v.push({a,b,o,l});}
  SOLC={s:S,k,v};return v;}
const solCust=()=>S.biz.filter(b=>BIZ_T[b.type]&&BIZ_T[b.type].lat&&b.mood>=50&&reqOk(b)).length;
function charterCard(){if(S.scn||S.mode!=='normal')return '';
  if(!S.chartSet&&S.day<=CHARTER_DAYS)return `<div class="inc" style="background:#EEF0FF"><div class="nm">${tr('specialist.pick_a_charter')}</div><div class="meta">${tr('specialist.what_kind_of_network_are_you',{n:CHARTER_DAYS-S.day})}</div>${Object.entries(CHARTERS).map(([k,C])=>`<div class="row"><div class="grow"><div class="nm">${C.i} ${tr(C.n)}</div><div class="meta">${tr(C.d,{p:Math.round((LAT_PAY-1)*100),r:SOL_ROUTES,c:SOL_CUST})}</div></div>${btn(charter()===k?tr('specialist.keep_it'):tr('specialist.pick'),'charter',{k},k==='global'?'ghost sm':'pink sm')}</div>`).join('')}</div>`;
  if(charter()!=='boutique')return '';
  if(S.solWon)return `<div class="inc" style="background:#EAF7EE"><div class="nm">⚡ ${tr('specialist.speed_of_light')}</div><div class="meta">${tr('specialist.won_on_date_your_own_glass',{date:dateStr(S.solWon)})}</div></div>`;
  const r=solRoutes();return `<div class="inc" style="background:#EEF0FF"><div class="nm">⚡ ${tr('specialist.speed_of_light')}</div><div class="meta">${tr('specialist.routes_r_of_n_beat_the',{r:Math.min(r.length,SOL_ROUTES),n:SOL_ROUTES,c:Math.min(solCust(),SOL_CUST),m:SOL_CUST})}</div>${r.slice(0,SOL_ROUTES).map(x=>`<div class="meta">✓ ${CITY[x.a].name} ⇄ ${CITY[x.b].name}: ${tr('common.ms_ms_one_way',{ms:x.o.toFixed(1)})} &lt; ${x.l.toFixed(1)}</div>`).join('')}</div>`;}
// Once a day: seats expire or call, and the boutique checks its win.
function specDay(d){if(S.seatOff&&S.seatOff.exp<=d)S.seatOff=null;
  if(!S.seatOff&&!S.scn&&S.mode!=='puzzle'&&lvl()>=SEAT_LV&&hstr(S.asn+'|seatcall|'+d)%SEAT_ODDS===0)seatConf(null);
  if(charter()==='boutique'&&!S.solWon&&solRoutes().length>=SOL_ROUTES&&solCust()>=SOL_CUST){S.solWon=Math.max(1,d);track('win_sol');toast(`<b>⚡ ${tr('specialist.speed_of_light')}</b><br>${tr('specialist.your_own_glass_beats_every_leased')}`,'goal');sfx('coin');checkBadges();}}
// Saves: the charter, demo orders, a seat on offer and the boutique's win. Old saves are Global backbone, picked.
function specSanitize(s){s.charter=s.charter==='boutique'&&s.mode==='normal'&&!s.scn?'boutique':'global';s.chartSet=s.chartSet===false&&s.day<=CHARTER_DAYS?false:true;
  const dm={};if(s.demo&&typeof s.demo==='object'&&!Array.isArray(s.demo))for(const key of Object.keys(s.demo).slice(0,64)){const [k,id]=key.split(':');if(demoItem(k,id)&&Number.isFinite(+s.demo[key]))dm[key]=Math.round(+s.demo[key]);}s.demo=dm;
  const o=s.seatOff;s.seatOff=o&&typeof o==='object'&&typeof o.name==='string'&&seatRoute(o.name)&&seatRoute(o.name)[0]===o.a&&seatRoute(o.name)[1]===o.b?{a:o.a,b:o.b,name:o.name,km:seatKm(o.a,o.b),exp:num(o.exp,0)}:null;
  s.solWon=Number.isFinite(+s.solWon)&&+s.solWon>0?Math.round(+s.solWon):0;
  for(const l of s.links)if(l.seat!==undefined){if(l.seat===true&&l.kind==='df'&&l.own&&l.sub)l.pairs=Math.max(1,Math.min(Math.max(...SEAT_N),l.pairs|0));else delete l.seat;}
  for(const b of [...s.biz,...s.offers])if(b.spot!==undefined){const x=b.spot;if(x&&typeof x==='object'&&own(SPOT_W,x.k))b.spot={k:x.k,n:num(x.n,0)};else delete b.spot;}}
