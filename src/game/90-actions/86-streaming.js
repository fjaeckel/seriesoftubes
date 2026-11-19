/* ---------- The Streaming service's actions (37-streaming.js) ---------- */
Object.assign(ACT,{
 // Launch in a country: a licence and a marketing push; the first subscribers sign up at once.
 cntLaunch:({cc})=>{if(!content()||typeof cc!=='string'||!ccInfo(cc)||S.cnt.cc[cc])return;const w=ccWhy(cc);if(w){toast(w,'bad');sfx('err');return;}
   if(!spend(ccLic(cc)))return;S.cnt.cc[cc]={d:Math.max(1,ccPot(cc)*CNT_START),since:S.day};toast(tr('streaming.launched_in_country',{country:esc(ccName(cc))}),'good');sfx('build');after();},
 // Build an origin where none is, or take the one here a size up. Either way it takes months.
 cntDc:({city})=>{if(!content()||!isCity(city)||!S.pops[city])return;const C=S.cnt,d=C.dc[city];
   if(d){const N=DC_T[d.t+1];if(!N||d.ready>S.day||d.up)return;if(N.lv>lvl()){toast(tr('streaming.cat_name_level_lv',{name:tr(N.n),lv:N.lv}),'bad');sfx('err');return;}if(!spend(N.cost))return;
     d.up={t:d.t+1,ready:S.day+leadDays(N.days)};toast(tr('streaming.origin_upgrade_started',{city:CITY[city].name,date:dateStr(d.up.ready)}),'good');sfx('build');after();return;}
   if(!dcSite(city))return;if(dcN()>=dcMax()){toast(tr('streaming.your_level_allows_n_origins',{n:dcMax()}),'bad');sfx('err');return;}const N=DC_T[1];if(!spend(N.cost))return;
   C.dc[city]={t:1,ready:S.day+leadDays(N.days)};toast(tr('streaming.origin_build_started',{city:CITY[city].name,date:dateStr(C.dc[city].ready)}),'good');sfx('build');after();},
 // A Binge Box in (d:1) or out of (d:-1) an eyeball network's network here.
 cntBox:({city,net,d})=>{if(!content()||!isCity(city)||!NET[net])return;d=+d;const C=S.cnt;
   if(d===-1){const i=C.box.findIndex(b=>b.city===city&&b.net===net);if(i<0)return;C.box.splice(i,1);after();return;}
   if(d!==1)return;const why=boxWhy(city,net);if(why){toast(why,'bad');sfx('err');return;}if(!spend(BOX_COST))return;
   C.box.push({id:uid(),city,net,day:S.day,f:FILL_NEW});{const v={net:esc(NET[net].name),city:CITY[city].name};toast(S.pops[city]?tr('streaming.box_up_in_net',v):tr('streaming_boxes.box_racked_inside',v),'good');}sfx('build');after();},
 // A bundle offer: sign it (its subscribers arrive at once) or let it go.
 cntBund:({id})=>{if(!content())return;const o=S.cnt.boff.find(x=>x.id===id);if(!o)return;const n=bundSign(o);toast(tr('streaming.bundle_signed',{net:esc(n.name)}),'good');sfx('coin');after();},
 cntBundNo:({id})=>{if(!content())return;S.cnt.boff=S.cnt.boff.filter(x=>x.id!==id);after();},
 // Event rights: pay up front and the event goes on your schedule; or pass.
 cntRights:({id})=>{if(!content())return;const C=S.cnt,o=C.roff.find(x=>x.id===id);if(!o||!spend(o.fee))return;C.roff=C.roff.filter(x=>x!==o);
   C.evs.push({id:o.id,n:o.n,reg:o.reg,mul:o.mul,gain:o.gain,fee:o.fee,day:o.day,w:1});toast(tr('streaming.rights_bought',{show:tr(EV_NAMES[o.n]),date:dateStr(o.day)}),'good');sfx('coin');after();},
 cntRightsNo:({id})=>{if(!content())return;S.cnt.roff=S.cnt.roff.filter(x=>x.id!==id);after();},
 cntCat:()=>{if(!content())return;const N=CAT_T[S.cnt.cat+1];if(!N||N.lv>lvl()||!spend(N.cost))return;S.cnt.cat++;for(const b of boxAll())b.f=Math.max(FILL_NEW,b.f*0.6);toast(tr('streaming.catalogue_now_name',{name:tr(N.n)}),'good');sfx('coin');after();},
 cntPrefill:()=>{if(!content())return;const p=S.cnt.prem;if(!p||p.pf||p.live||S.day>=p.day||!boxAll().length||!spend(prefillCost()))return;p.pf=1;for(const b of boxAll())b.f=1;toast(tr('streaming.boxes_pre_filled'),'good');after();},
 // A dispute: pay what they ask every month, or tell your viewers whose fault the buffering is.
 cntPay:()=>{if(!content())return;const D=S.cnt.disp;if(!D)return;S.cnt.paid[D.net]={fee:D.fee,until:S.day+DEAL_DAYS};cntEnd();toast(tr('streaming.you_pay_net2',{net:esc(NET[D.net].name),fee:fmt$(D.fee)}),'good');after();},
 cntCamp:()=>{if(!content())return;const D=S.cnt.disp;if(!D||D.camp||!spend(DISP_CAMP))return;D.camp=S.day+DISP_CAMP_DAYS;toast(tr('streaming.campaign_started',{net:esc(NET[D.net].name)}),'good');after();},
});
