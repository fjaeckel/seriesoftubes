/* ---------- conference season ---------- */
const CONFS=[{n:'PTC',c:'hnl',m:0,cap:1},{n:'NANOG',c:'chi',m:1},{n:'APRICOT',c:'sin',m:1},{n:'Peering Days',c:'waw',m:2},{n:'DKNOG',c:'cph',m:2,j:N_('conferences.the_hallway_track_moved_to_a')},{n:'UKNOF',c:'lon',m:3},{n:'MENOG',c:'dxb',m:3},{n:'NZNOG',c:'akl',m:3},{n:'RIPE',c:'ams',m:4},{n:'NANOG',c:'sea',m:5},{n:'IX Forum',c:'tok',m:6},{n:'AfPIF',c:'nbo',m:7},{n:'AusNOG',c:'syd',m:8},{n:'NLNOG Day',c:'ams',m:8},{n:'LACNOG',c:'sao',m:9},{n:'NANOG',c:'ash',m:9},{n:'Capacity Europe',c:'lon',m:9,cap:1},{n:'DENOG',c:'fra',m:10},{n:'RIPE',c:'ber',m:10},{n:'PTT Forum',c:'sao',m:11},{n:'PacNOG',c:'suv',m:11}];
const CONF_COST=8000,CONF_DAYS=45;
// Sponsoring (#168) puts your logo on the lanyards: more customers call from that region while the glow lasts.
// Only some meetings sell sponsorships, the same ones every time you look. Capacity conferences are where carriers buy in bulk.
const CONF_SP=40000,CAP_COST=30000,CAP_LV=3;
const confSp=cf=>!cf.cap&&[...cf.key].reduce((a,ch)=>(a*31+ch.charCodeAt(0))>>>0,7)%3!==0;
const confCost=cf=>cf.cap?CAP_COST:CONF_COST;
const confDay=(cf,y)=>dayOf(y+1,cf.m,10);
function confKey(cf,y){return cf.n+'@'+cf.c+'@'+y;}
function upcomingConfs(within){const y0=cal(S.day).y-1,out=[];for(const y of [y0,y0+1])for(const cf of CONFS){const d=confDay(cf,y);if(d>=S.day&&d-S.day<=within)out.push({...cf,day:d,key:confKey(cf,y)});}return out.sort((a,b)=>a.day-b.day);}
function confBoost(id){const cb=S.conf;if(!cb||!(cb.until>S.day))return 1;const n=NET[id];return n&&n.pops.some(c=>CITY[c]&&CITY[c].reg===cb.reg)?0.5:1;}
function confTick(d){S.confReg=S.confReg||{};
  for(const cf of upcomingConfs(30)){if(cf.day-d===30&&!S.confReg[cf.key])toast(tr('conferences.conf_comes_to_city_in_30',{conf:esc(cf.n),city:esc(CITY[cf.c].name)}),'goal',[{l:tr('common.show_me'),act:'leftTab',args:{t:'deals'}}]);}
  for(const cf of upcomingConfs(0)){if(cf.day!==d||!S.confReg[cf.key])continue;const reg=CITY[cf.c].reg,sp=S.confReg[cf.key]==='sp';S.conf={until:d+CONF_DAYS,reg,name:cf.n,sp};S.stats.confs=(S.stats.confs||0)+1;if(sp)S.stats.confSp=(S.stats.confSp||0)+1;
    if(cf.cap)S.capDeal={at:d+4+Math.floor(Math.random()*5),c:cf.c};
    const r=Math.random();let extra='';if(r<0.3){const cash=5000+Math.floor(Math.random()*4)*5000;S.cash+=cash;extra=' '+tr('conferences.you_also_won_the_raffle_cash',{cash:fmt$(cash)});}else if(r<0.5)extra=' '+tr('conferences.someone_from_goggle_bought_you_a');if(cf.j)extra=' '+tr(cf.j)+(r<0.3?extra:'');
    toast(tr('conferences.conf_in_city_you_shook_a',{conf:esc(cf.n),city:esc(CITY[cf.c].name),n:CONF_DAYS,region:esc(REG[reg])})+(sp?' '+tr('conferences.your_logo_was_on_every_lanyard',{region:esc(REG[reg])}):'')+(cf.cap?' '+tr('conferences.carriers_took_your_card_expect_big'):'')+extra,'goal');sfx('coin');}
  capDealTick(d);}
function confSection(){const up=upcomingConfs(75).slice(0,3),cb=S.conf&&S.conf.until>S.day?S.conf:null;if(!up.length&&!cb)return '';
  return `<h3 style="font-size:15px;margin:10px 0 4px">${tr('common.conferences')}</h3>${cb?`<div class="inc" style="background:#EAF7EE"><div class="nm">${tr('conferences.name_glow_n_days_left',{name:esc(cb.name),n:cb.until-S.day})}</div><div class="meta">${tr('conferences.selective_networks_in_region_need',{region:esc(REG[cb.reg])})}${cb.sp?' '+tr('conferences.as_a_sponsor_you_also_get',{region:esc(REG[cb.reg])}):''}</div></div>`:''}${up.map(confRow).join('')}`;}
function confRow(cf){const reg=S.confReg&&S.confReg[cf.key],open=cf.day>S.day,sp=confSp(cf),cost=confCost(cf),lk=cf.cap&&lvl()<CAP_LV;
  const tags=(reg==='sp'?'<span class="tag st on">'+tr('conferences.sponsor')+'</span>':reg?'<span class="tag st on">'+tr('common.registered')+'</span>':open?'':'<span class="tag st">'+tr('common.registration_closed')+'</span>');
  const btns=!open||reg==='sp'?'':(reg?'':lk?btn(tr('sites_and_service.level_n',{n:CAP_LV}),'confGo',{key:cf.key},'sm',true):btn(tr('conferences.attend_cost',{cost:fmt$(cost)}),'confGo',{key:cf.key},'sm',S.cash<cost))+(sp?btn(tr('conferences.sponsor_cost',{cost:fmt$(CONF_SP-(reg?CONF_COST:0))}),'confSponsor',{key:cf.key},'pink sm',S.cash<CONF_SP-(reg?CONF_COST:0)):'');
  return `<div class="row"><div class="grow"><div class="nm">${esc(cf.n)} · ${esc(CITY[cf.c].name)}</div><div class="meta">${cf.day===S.day?tr('common.today'):tr('conferences.in_n_days',{n:cf.day-S.day})} · ${esc(REG[CITY[cf.c].reg])}${cf.cap?' · '+tr('conferences.capacity_conference_carriers_buy_in'):sp&&open&&reg!=='sp'?' · '+tr('conferences.sponsorships_available'):''}</div></div>${tags}${btns?`<div class="btns">${btns}</div>`:''}</div>`;}

