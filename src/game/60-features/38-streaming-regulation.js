/* ---------- Regulation: governments discover the Streaming service (37-streaming.js) ----------
   Two kinds of law, after real ones, exaggerated (rule M8 keeps their thresholds honest):
   - Sending party pays (C.rg.spp, per country): a ministry makes the sender pay the country's ISPs per Gbps, as Korea
     did between ISPs in 2016 and pushed onto content in 2020. Every Gbps you send their homes costs SPP_FEE a month,
     except what your Binge Boxes inside their networks serve (on-net is not interconnection). Lobbying may repeal it.
   - Fair share (C.rg.fs, per continent): once you carry FS_SHARE of a continent's evening peak (the 2% of the Digital
     Networks Act draft of November 2026), the regulator forces you to negotiate with the big ISPs: pay into a network
     fund, or fight it in three hearings, where Binge Boxes inside their networks are your best argument. Ignore it and
     the regulator sets the price.
   New laws need the market rule (as disputes do: Change Freeze and Best Effort have none) and wait for day REG_FROM;
   what is already in force plays out. Rolls are hashes of the day. */
const SPP_LV=4,SPP_ODDS=200,SPP_MAX=2,SPP_FEE=55,SPP_MIN=10,SPP_LOB=60000,SPP_LOB_DAYS=20,SPP_LOB_P=0.3,REG_FROM=40;
const FS_LV=5,FS_SHARE=0.02,FS_K=2,FS_ODDS=20,FS_DL=30,FS_HEAR=3,FS_GAP=10,FS_LAW=90000,FS_PER_G=40,FS_LOSE=1.5,FS_IGNORE=1.25;
const FS_RU={EU:N_('streaming_reg.ru_eu'),AM:N_('streaming_reg.ru_am'),AS:N_('streaming_reg.ru_as'),SA:N_('streaming_reg.ru_sa'),AF:N_('streaming_reg.ru_af'),OC:N_('streaming_reg.ru_oc')};
const FS_HEARD=[N_('streaming_reg.fs_h1'),N_('streaming_reg.fs_h2'),N_('streaming_reg.fs_h3')];
const fsRu=reg=>tr(FS_RU[reg]||FS_RU.EU);
const sppRu=cc=>cc==='KR'?tr('streaming_reg.ru_kr'):tr('streaming_reg.ru_cc',{country:ccName(cc)});
CNT_NEW.push(o=>{o.rg={spp:{},fs:{},lob:0,fsWin:0};});
CNT_SAN.push((c0,o,s)=>{const g=c0.rg&&typeof c0.rg==='object'?c0.rg:{},n=(v,d)=>Number.isFinite(+v)?Math.round(+v):d,r={spp:{},fs:{},lob:Math.max(0,n(g.lob,0)),fsWin:Math.max(0,n(g.fsWin,0))};
  if(g.spp&&typeof g.spp==='object')for(const cc of Object.keys(g.spp).slice(0,SPP_MAX)){const x=g.spp[cc];if(o.cc[cc]&&x&&typeof x==='object')r.spp[cc]={day:n(x.day,0),lob:Math.max(0,n(x.lob,0)),fail:x.fail?1:0};}
  if(g.fs&&typeof g.fs==='object')for(const reg of Object.keys(g.fs)){const x=g.fs[reg];if(!own(REG,reg)||!x||typeof x!=='object'||!['neg','hear','fund','ex'].includes(x.st))continue;
    r.fs[reg]={st:x.st,day:n(x.day,0),dl:n(x.dl,0),n:clamp(n(x.n,0),0,FS_HEAR),nx:n(x.nx,0),fee:clamp(n(x.fee,0),0,1e8)};}
  o.rg=r;});
// A continent's evening peak, everyone's traffic: its people, times the era. The 2% is of this.
let FS_P=null;
const regPeak=reg=>{if(!FS_P){FS_P={};for(const c of CITIES)if(!c.off)FS_P[c.reg]=(FS_P[c.reg]||0)+c.P;}return (FS_P[reg]||0)*eraMul()*FS_K;};
const regG=reg=>{const C=S.cnt;let g=0;for(const k in C.cc)if(ccInfo(k).reg===reg)g+=C.cc[k].d;return g;};
const regShare=reg=>{const p=regPeak(reg);return p>0?regG(reg)/p:0;};
// What your boxes serve tonight in a country, or on a continent.
const boxUse=(r,f)=>{let g=0;const u=r&&r.useCache;if(!u)return 0;for(const b of S.cnt.box)if(f(CITY[b.city]))g+=u[b.id]||0;return g;};
// The Gbps a sending-party-pays country bills: everything its homes get from you that no box inside their ISPs served.
const sppBase=(r,cc)=>{const o=r&&r.cnt&&r.cnt.cc[cc],D=o?o.D-(o.short||0):(S.cnt.cc[cc]?S.cnt.cc[cc].d:0);return Math.max(0,D-boxUse(r,C=>C.cc===cc));};
const sppCost=r=>{let m=0;for(const cc in S.cnt.rg.spp)m+=SPP_FEE*sppBase(r,cc);return m;};
const fsCost=()=>{let m=0;const F=S.cnt.rg.fs;for(const reg in F)if(F[reg].st==='fund')m+=F[reg].fee;return m;};
CNT_COST.push(r=>S.cnt.rg?sppCost(r)+fsCost():0);
const fsFee=reg=>Math.max(5000,Math.round(regG(reg)*FS_PER_G/100)*100);
// Odds in the hearings: the more of the continent your boxes serve inside the ISPs, the better your case.
const fsOdds=reg=>{const g=regG(reg);return clamp(0.25+(g>0?boxUse(R,C=>C.reg===reg)/g:0)*0.6,0.25,0.85);};
const sppOdds=cc=>{const g=S.cnt.cc[cc]?S.cnt.cc[cc].d:0;return clamp(SPP_LOB_P+(g>0?boxUse(R,C=>C.cc===cc)/g:0)*0.3,SPP_LOB_P,0.6);};
const regGo=()=>[{l:tr('common.show_me'),act:'leftTab',args:{t:'goals'}}];
function sppStart(cc,d){const G=S.cnt.rg;G.spp[cc]={day:d,lob:0,fail:0};
  toast(tr('streaming_reg.spp_toast',{ru:sppRu(cc),country:esc(ccName(cc)),fee:fmt$(SPP_FEE)}),'bad',regGo());sfx('alert');}
function fsStart(reg,d){const G=S.cnt.rg;G.fs[reg]={st:'neg',day:d,dl:d+FS_DL,n:0,nx:0,fee:fsFee(reg)};
  toast(tr('streaming_reg.fs_toast',{ru:fsRu(reg),p:pctF(regShare(reg)),region:REG[reg],date:dateStr(d+FS_DL)}),'bad',regGo());sfx('alert');}
const pctF=x=>(Math.round(x*1000)/10).toLocaleString()+'%';
// A day of regulation (CNT_DAY): hearings, deadlines and votes go on; new laws need the market rule.
function cntRegDay(d){const C=S.cnt,G=C.rg;
  for(const reg of Object.keys(G.fs).sort()){const f=G.fs[reg],ru=fsRu(reg),region=REG[reg];
    if(f.st==='neg'&&d>=f.dl){f.st='fund';f.fee=Math.round(f.fee*FS_IGNORE/100)*100;toast(tr('streaming_reg.fs_imposed',{ru,region,fee:fmt$(f.fee)}),'bad');sfx('err');}
    else if(f.st==='hear'&&d>=f.nx){f.n++;const line=tr(FS_HEARD[f.n-1],{ru});
      if(f.n<FS_HEAR){f.nx=d+FS_GAP;toast(`⚖️ ${line}`,'goal');continue;}
      if(cRoll('fsv|'+reg,d)<fsOdds(reg)){f.st='ex';G.fsWin++;toast(`⚖️ ${line}<br><b>${tr('streaming_reg.fs_win',{ru,region})}</b>`,'goal');sfx('coin');checkBadges();}
      else{f.st='fund';f.fee=Math.round(f.fee*FS_LOSE/100)*100;S.cash-=f.fee;toast(`⚖️ ${line}<br><b>${tr('streaming_reg.fs_lose',{ru,region,fee:fmt$(f.fee)})}</b>`,'bad');sfx('err');}}}
  for(const cc of Object.keys(G.spp).sort()){const x=G.spp[cc];if(!x.lob||d<x.lob)continue;x.lob=0;
    if(cRoll('lob|'+cc,d)<sppOdds(cc)){delete G.spp[cc];G.lob++;toast(tr('streaming_reg.spp_repealed',{ru:sppRu(cc),country:esc(ccName(cc))}),'goal');sfx('coin');checkBadges();}
    else{x.fail=1;toast(tr('streaming_reg.spp_kept',{ru:sppRu(cc),country:esc(ccName(cc))}),'bad');}}
  if(!rule('market')||d<REG_FROM)return;
  if(lvl()>=FS_LV)for(const reg of Object.keys(REG).sort())if(!G.fs[reg]&&regShare(reg)>=FS_SHARE&&cRoll('fs|'+reg,d)<1/FS_ODDS){fsStart(reg,d);break;}
  if(lvl()>=SPP_LV&&Object.keys(G.spp).length<SPP_MAX&&cRoll('spp',d)<1/SPP_ODDS){
    // Korea first, where it all began; then the country you send most to.
    const cs=Object.keys(C.cc).filter(k=>!G.spp[k]&&C.cc[k].d>=SPP_MIN).sort((a,b)=>(b==='KR')-(a==='KR')||C.cc[b].d-C.cc[a].d||(a<b?-1:1));
    if(cs.length)sppStart(cs[0],d);}}
CNT_DAY.push(cntRegDay);
// The charter card: laws in force, with what you can do about them, and a hint before a fair share law applies.
CNT_CARD.push(()=>{const C=S.cnt,G=C.rg;if(!G)return '';let h='';
  for(const cc of Object.keys(G.spp)){const x=G.spp[cc],g=sppBase(R,cc);
    h+=`<div class="meta" style="color:var(--bad)">${tr('streaming_reg.spp_line',{country:esc(ccName(cc)),cost:fmt$(g*SPP_FEE),g:fmtG(g)})}</div><div class="meta">${tr('streaming_reg.spp_hint')}</div>`;
    h+=`<div class="btns">${x.lob?`<span class="tag st on">${trn('streaming_reg.spp_lobbying',Math.max(0,x.lob-S.day))}</span>`:x.fail?`<span class="tag st">${tr('streaming_reg.spp_failed_tag')}</span>`:btn(tr('streaming_reg.spp_lobby_btn',{cost:fmt$(SPP_LOB)}),'cntSppLobby',{cc},'sm',S.cash<SPP_LOB)}</div>`;}
  for(const reg of Object.keys(G.fs)){const f=G.fs[reg],ru=fsRu(reg),region=REG[reg];
    if(f.st==='neg')h+=`<div class="meta" style="color:var(--bad)">${tr('streaming_reg.fs_neg_line',{region,ru,date:dateStr(f.dl),p:pctF(regShare(reg))})}</div><div class="btns">${btn(tr('streaming_reg.fs_pay_btn',{fee:fmt$(f.fee)}),'cntFsPay',{reg},'sm')}${btn(tr('streaming_reg.fs_hear_btn',{cost:fmt$(FS_LAW)}),'cntFsHear',{reg},'pink sm',S.cash<FS_LAW)}</div>`;
    else if(f.st==='hear')h+=`<div class="meta">${tr('streaming_reg.fs_hear_line',{ru,n:f.n,date:dateStr(f.nx)})}</div>`;
    else if(f.st==='fund')h+=`<div class="meta">${tr('streaming_reg.fs_fund_line',{region,fee:fmt$(f.fee)})}</div>`;
    else h+=`<div class="meta">${tr('streaming_reg.fs_ex_line',{region})}</div>`;}
  for(const reg of Object.keys(REG).sort()){if(G.fs[reg])continue;const p=regShare(reg);if(p>=FS_SHARE/2)h+=`<div class="meta">${tr('streaming_reg.fs_share_line',{region:REG[reg],p:pctF(p)})}</div>`;}
  return h;});
