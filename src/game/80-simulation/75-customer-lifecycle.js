/* ---------- Customers come and go (#178) ----------
   Every customer signs for a term. When it ends, most renew at today's market price, happy ones often grow, a few haggle
   for a discount, and some leave for reasons that are not your fault (or, when they were unhappy, because they were).
   Nothing changes during a customer's first term. Every roll is a hash of the customer and its term, never
   Math.random, so seeded games and tests keep their random stream. */

/* The bandwidth market: what a Gbps sells for, 1 when you start. Flat for the first six months, then about 10% cheaper
   a year (transit really does fall: 11–17% a year in the big hubs), slowed by dearer hardware, moving up and down in a
   slow three-year cycle, and pushed up while a shortage lasts. Without the market rule it stays at 1. */
const MK_YR=0.10,MK_FREE=180,MK_FLOOR=0.3,MK_SHOCK={opt:1.15,rt:1.1,build:1.08};
function mktBase(d){if(d<=MK_FREE)return 1;const y=(d-MK_FREE)/365;
  return Math.max(MK_FLOOR,Math.pow(1-MK_YR,y)*Math.sqrt(hwTrend(d))*(1+0.06*Math.sin(2*Math.PI*y/3)));}
function mkt(){if(!S||!rule('market'))return 1;const s=hwShock();return mktBase(S.day)*(s?MK_SHOCK[s.k]||1:1);}

// Terms in months: enterprise and hosting 1–3 years, wholesale and circuits 2–5, IRUs and fiber pairs 10–20.
const CL_TERMS={ip:[12,24,36],whole:[24,36,48,60],iru:[120,180,240]};
// Events, capacity deals and scripted scenario customers have their own endings.
const clKind=t=>{const T=BIZ_T[t];if(!T||T.event||T.cap)return null;if(t==='dfpair'||t==='pairs')return 'iru';return T.l2||T.fiber||t==='isp'||t==='gpu'?'whole':'ip';};
const clOn=b=>!!b&&!b.scripted&&!!clKind(b.type);
// A stable roll in [0,1) for this customer, this term and this question.
// Who the customer is (names are unique), not its id: ids come from the clock and would differ every time a game is replayed.
const clKey=b=>[b.type,b.city,b.city2||'',b.name].join('|');
const clR=(b,q)=>(hstr(((S&&S.asn)||0)+'|'+clKey(b)+'|'+b.te+'|'+q)%100000)/100000;
const clPick=(a,b,q)=>a[Math.floor(clR(b,q)*a.length)];
function clTerm(b,from){const m=clPick(CL_TERMS[clKind(b.type)],{type:b.type,city:b.city,city2:b.city2,name:b.name,te:from},'term');return from+Math.round(m*365/12);}
// What this customer's contract would be priced at today: its price moved by the market since it was signed.
// A renewal moves at most 25% down or 10% up at once, so an old save is not repriced in one go.
const clFair=b=>rule('market')&&b.mk>0?Math.round(b.rate*clamp(mkt()/b.mk,0.75,1.1)):b.rate;
// Competition where the customer is: carriers selling transit there (a fiber or circuit customer counts both ends).
const clComp=b=>{const cs=bCities(b);let n=0;for(const n2 of NETS)if(cs.some(c=>sellsAt(n2,c)))n++;return n;};

// Why they leave when it is not your fault: which reasons fit which customers. Moved and multihomed may keep them.
const CL_WHY={
  acq:{l:N_('lifecycle.why_acquired'),left:N_('lifecycle.left_acquired'),ok:()=>true},
  bust:{l:N_('lifecycle.why_bust'),left:N_('lifecycle.left_bust'),ok:t=>['gpu','stream','game','cgame','metav','ai','agi','hft','provedor','dia','host','mars'].includes(t)},
  insrc:{l:N_('lifecycle.why_insourced'),left:N_('lifecycle.left_insourced'),ok:t=>['isp','hyper','onramp','provedor','edu','sov','aiwan','stream'].includes(t)},
  moved:{l:N_('lifecycle.why_moved'),left:N_('lifecycle.left_moved'),ok:t=>{const T=BIZ_T[t];return !T.l2&&!T.fiber&&!T.nni;}},
  multi:{l:N_('lifecycle.why_multihomed'),left:N_('lifecycle.left_multihomed'),ok:t=>{const T=BIZ_T[t];return !T.l2&&!T.fiber;}},
  ended:{l:N_('lifecycle.why_project_ended'),left:N_('lifecycle.left_project_ended'),ok:t=>{const T=BIZ_T[t];return T.l2||T.fiber||t==='bulk';}},
  cheap:{l:N_('lifecycle.why_cheaper_bid'),left:N_('lifecycle.left_cheaper'),ok:()=>true},
  sad:{l:N_('lifecycle.why_unhappy'),ok:()=>false},
  odd:{l:N_('lifecycle.why_other'),ok:()=>false},
};
// The other reasons: now and then (never more than once every two months) a customer leaves for one of these.
const CL_ODD=[N_('lifecycle.odd_asn_six'),N_('lifecycle.odd_bad_holiday'),N_('lifecycle.odd_rdns'),N_('lifecycle.odd_too_many_feet'),N_('lifecycle.odd_dead_beef'),N_('lifecycle.odd_looking_glass'),
  N_('lifecycle.odd_communities'),N_('lifecycle.odd_quadrant'),N_('lifecycle.odd_spreadsheet_cell'),N_('lifecycle.odd_fewer_vendors'),N_('lifecycle.odd_the_cloud'),N_('lifecycle.odd_bought_thrice'),
  N_('lifecycle.odd_alphabetical'),N_('lifecycle.odd_goat_farmer'),N_('lifecycle.odd_mate'),N_('lifecycle.odd_95th'),N_('lifecycle.odd_holiday_card'),N_('lifecycle.odd_raccoon'),N_('lifecycle.odd_espresso'),
  N_('lifecycle.odd_landlord'),N_('lifecycle.odd_wrong_blue'),N_('lifecycle.odd_space'),N_('lifecycle.odd_4g_dongle'),N_('lifecycle.odd_center'),N_('lifecycle.odd_wireguard')];
const CL_ODD_GAP=60,CL_HAG_MAX=3,CL_MONTHS=24;

// The month's tally for the dashboard: won, renewed, grew, haggled and who left why.
function clNote(k,why){const C=S.cl||(S.cl={odd:-1e9,mo:[]}),c=cal(S.day),m=c.y*12+c.m;let e=C.mo[C.mo.length-1];
  if(!e||e.m!==m){e={m,won:0,ren:0,grew:0,hag:0,lost:{}};C.mo.push(e);if(C.mo.length>CL_MONTHS)C.mo.shift();}
  if(k==='lost')e.lost[why]=(e.lost[why]||0)+1;else e[k]=(e[k]||0)+1;}
// A new customer: its first term and the market it signed in.
function clSign(b){if(!clOn(b))return b;b.mk=b.mk>0?b.mk:mkt();b.te=clTerm(b,S.day);clNote('won');return b;}
function clRenew(b,rate){b.rate=Math.max(0,Math.round(rate));b.mk=mkt();delete b.hag;delete b.hr;b.te=clTerm(b,b.te);}
function clGone(b,why){S.biz=S.biz.filter(x=>x!==b);clNote('lost',why);}
const clWhere=b=>bCities(b).map(c=>CITY[c].name).join(' ⇄ ');

// Growing: the next size up their type sells, or twice the bandwidth past the top one. Fiber grows by renewing.
// A type with a most (max) never grows past it (#137).
function clGrow(b){const T=BIZ_T[b.type];if(T.fiber||(T.max&&b.bw>=T.max))return false;const up=(T.opts||[]).find(x=>x>b.bw);b.bw=T.max?Math.min(T.max,up||b.bw*2):up||b.bw*2;return true;}
// Leaving, or one of the not-your-fault turns that keeps them. Returns what the log says.
function clLeave(b,d,out){const T=BIZ_T[b.type],v={name:esc(b.name),city:esc(clWhere(b))};
  if(b.mood<50){clGone(b,'sad');out.lost.push(tr('lifecycle.left_unhappy',v));return;}
  const C=S.cl;if(d-C.odd>=CL_ODD_GAP&&clR(b,'odd')<0.25){C.odd=d;clGone(b,'odd');out.lost.push(tr('lifecycle.left_odd',{...v,why:tr(clPick(CL_ODD,b,'oddline'))}));return;}
  const ks=Object.keys(CL_WHY).filter(k=>CL_WHY[k].ok(b.type)),k=clPick(ks,b,'why');
  if(k==='acq'&&clR(b,'acqbig')<0.3&&clGrow(b)){clRenew(b,clFair(b));clNote('grew');out.ok.push(tr('lifecycle.acquired_stays_bigger',{...v,bw:fmtG(b.bw)}));return;}
  if(k==='moved'){const reg=CITY[b.city].reg,to=Object.keys(S.pops).filter(c=>c!==b.city&&CITY[c].reg===reg&&bizCity(c)).sort();
    const c2=to.length&&clR(b,'stay')<0.5?clPick(to,b,'to'):null;
    if(c2){const from=CITY[b.city].name;b.city=c2;clRenew(b,clFair(b));clNote('ren');out.ok.push(tr('lifecycle.moved_stays',{name:v.name,from:esc(from),to:esc(CITY[c2].name)}));return;}}
  if(k==='multi'&&b.bw>=2){const keep=(T.opts||[]).filter(x=>x<=b.bw/2).pop()||b.bw/2;b.bw=keep;clRenew(b,clFair(b));clNote('ren');out.ok.push(tr('lifecycle.multihomed_keeps',{...v,bw:fmtG(b.bw)}));return;}
  clGone(b,k);out.lost.push(tr(CL_WHY[k].left,v));}

/* A day of contracts, after the moods. 30 days before a term ends a customer with competitors around may ask for a
   discount (at most three open at a time); at the end, the rest renew, grow or leave. An unanswered haggle renews at
   the asked price. */
function clDay(d){if(!S.cl)S.cl={odd:-1e9,mo:[]};const out={ren:0,grew:0,ok:[],lost:[],hag:[]};let open=S.biz.reduce((a,b)=>a+(b.hag?1:0),0);
  const pat=rule('moods')==='patient'?0.5:1;
  for(const b of S.biz.slice()){if(!b.te||!clOn(b))continue;
    if(b.hag){if(d>=b.hag.until){clRenew(b,b.hag.rate);clNote('ren');out.ren++;}continue;}
    if(d<b.te-30)continue;
    if(d<b.te){if(b.hr===b.te)continue;b.hr=b.te;const comp=clComp(b),cf=Math.min(1,comp/6);
      if(open<CL_HAG_MAX&&comp>=2&&b.mood>=40&&clR(b,'hag')<(0.05+0.15*cf)*pat){const fair=clFair(b),ask=Math.round(fair*(salesAsk()+0.12*clR(b,'ask')));
        if(ask>0&&ask<b.rate){b.hag={rate:ask,until:b.te};open++;clNote('hag');out.hag.push(b);}}
      continue;}
    const cf=Math.min(1,clComp(b)/6),u=(100-b.mood)/100,leave=(0.04+0.08*cf+0.35*u*u)*pat*salesLeaveMul(b);
    if(clR(b,'leave')<leave){clLeave(b,d,out);continue;}
    const g=clR(b,'grow');if((b.mood>=80&&g<0.3)||(b.mood>=60&&g<0.12)){if(clGrow(b)){clRenew(b,clFair(b));clNote('grew');out.grew++;out.ok.push(tr('lifecycle.renewed_and_grew',{name:esc(b.name),city:esc(clWhere(b)),bw:fmtG(b.bw)}));continue;}}
    clRenew(b,clFair(b));clNote('ren');out.ren++;}
  clNews(out);clReferral(d);}
// What the day says: haggles one by one (they want an answer), the rest in a few lines so a big network is not a wall of toasts.
function clNews(out){
  for(const b of out.hag){const was=bizMo(b),now=BIZ_T[b.type].fiber?b.hag.rate:b.bw*b.hag.rate;
    toast(tr('lifecycle.haggle',{name:esc(b.name),city:esc(clWhere(b)),price:fmt$(now),p:pct(1-now/Math.max(1,was)),n:b.hag.until-S.day}),'',[{l:tr('common.deals'),act:'leftTab',args:{t:'deals'}}],{a:'cust',v:b.id});}
  const few=(list,kind)=>{for(const t of list.slice(0,3))toast(t,kind);if(list.length>3)toast(trn('lifecycle.n_more',list.length-3),kind);};
  few(out.ok,'good');few(out.lost,'');
  if(out.ren)toast(trn('lifecycle.n_renewed',out.ren,{p:mktTxt()}),'');}
const mktTxt=()=>{const m=mkt();return Math.abs(m-1)<0.005?tr('lifecycle.market_as_start'):m<1?tr('lifecycle.market_below',{p:pct(1-m)}):tr('lifecycle.market_above',{p:pct(m-1)});};

/* Growth by word of mouth: about every six weeks the happiest long-standing customer (a year or more, 90%+ happy)
   tells someone like them, who shows up in Deals asking for the smallest size at today's price. */
const CL_REF=['dia','game','host','isp','stream','edu','scrub','provedor','gpu','cgame','metav'];
function clReferral(d){if(d%45!==0||S.offers.length>=6)return;
  const b=S.biz.filter(x=>clOn(x)&&CL_REF.includes(x.type)&&x.mood>=90&&d-(x.since||0)>=365&&bizCity(x.city)&&lvl()>=(BIZ_T[x.type].lv||1)).sort((a,c)=>c.mood-a.mood||(a.since||0)-(c.since||0)||(a.id<c.id?-1:1))[0];
  if(!b||S.offers.some(o=>o.ref===b.id))return;const T=BIZ_T[b.type],list=(T.names||BIZ_N).filter(n=>!S.usedNames.includes(n));if(!list.length)return;
  const name=clPick(list,{type:b.type,city:b.city,city2:b.city2,name:b.name,te:d},'refname');useName(name);
  S.offers.push({id:uid(),city:b.city,city2:null,name,type:b.type,bw:(T.opts||[1])[0],rate:Math.round((CITY[b.city].au?T.rate*AU_ARPU:T.rate)*mkt()),mk:mkt(),reqs:[],exp:d+40,ref:b.id,refN:b.name});}
// New offers are priced at today's market (spawnOffer and friends price at 1; this moves them).
function mktPrice(from){const m=mkt();for(let i=from;i<S.offers.length;i++){const o=S.offers[i];if(o.mk)continue;o.mk=m;if(m!==1){o.rate=Math.round(o.rate*m);if(o.fee)o.fee=Math.round(o.fee*m);}}}

// Meeting halfway: between what the customer pays now and what they ask, the two prices the Deals row shows (#293).
const clMid=b=>Math.round((b.rate+b.hag.rate)/2);
const clBill=(b,rate)=>BIZ_T[b.type].fiber?rate:b.bw*rate;
const clHags=()=>S?S.biz.reduce((a,b)=>a+(b.hag?1:0),0):0;
/* What is at stake in a renewal (#292): how much traffic they book and get, the price per Gbps now and asked, and the
   path terms they signed for (latency, diverse, no subsea), each ticked as it stands today. Two short lines for a phone. */
function clRenInfo(b){const T=BIZ_T[b.type],tick=v=>`<b style="color:${v?'var(--eye)':'var(--bad)'}">${v?'✓':'✗'}</b> `,top=[],rq=[];
  if(!T.fiber){const sf=bizSf(b),srv=`<b${sf<0.95?' style="color:var(--bad)"':''}>${fmtG(b.bw*sf)}</b>`;
    top.push(b.sites?trn('lifecycle.ren_sites_traffic',b.sites.length,{bw:fmtG(b.bw),srv}):tr('lifecycle.ren_traffic',{bw:fmtG(b.bw),srv}));
    top.push(tr('lifecycle.ren_per_g',{was:fmt$(b.rate),price:fmt$(b.hag.rate)}));}
  for(const k of b.reqs||[]){const Q=REQS[k];if(!Q)continue;const ok=Q.ok(b);
    if(k==='lat'){const v=R.l2lat[b.id]!==undefined?R.l2lat[b.id]:bestLat(b.city,b.city2);rq.push(tick(ok)+tr('lifecycle.ren_lat',{max:b.latMax,now:isFinite(v)?tr('common.ms_ms_one_way',{ms:v.toFixed(1)}):tr('common.no_path')}));}
    else rq.push(tick(ok)+(k==='diverse'?tr('lifecycle.ren_diverse'):k==='sharks'?tr('lifecycle.ren_no_subsea'):esc(typeof Q.l==='function'?Q.l(b):Q.l)));}
  return (top.length?`<div class="meta">${top.join(' · ')}</div>`:'')+(rq.length?`<div class="meta">${rq.join(' · ')}</div>`:'');}
// The renewals waiting for an answer, at the top of Deals.
function clDealsHtml(){const hs=S.biz.filter(b=>b.hag).sort((a,b)=>a.hag.until-b.hag.until);if(!hs.length)return '';
  return `<h3 class="sub4">${tr('lifecycle.renewals')}</h3><p class="meta" style="margin:0 0 6px">${tr('lifecycle.unanswered_matches')}</p>`+hs.map(b=>{const now=BIZ_T[b.type].fiber?b.hag.rate:b.bw*b.hag.rate,was=bizMo(b);
    return `<div class="row"><div class="grow"><div class="nm">${esc(b.name)}</div><div class="meta">${esc(BIZ_T[b.type].l)} · ${esc(clWhere(b))} · ${tr('ui.n_d_left',{n:b.hag.until-S.day})}</div>
    <div class="meta">${tr('lifecycle.wants_price',{was:fmt$(was),price:fmt$(now),p:pct(1-now/Math.max(1,was))})}</div>${clRenInfo(b)}${slRenRow(b)}
    <div class="btns">${btn(tr('lifecycle.match'),'renewMatch',{id:b.id},'green sm')}${btn(tr('lifecycle.meet_halfway',{price:fmt$(clBill(b,clMid(b)))}),'renewMeet',{id:b.id},'sm')}${btn(tr('lifecycle.let_them_go'),'renewLet',{id:b.id},'ghost sm')}</div></div></div>`;}).join('');}
// The contract line on a customer row.
const clTermTxt=b=>clOn(b)&&b.te?(b.hag?tr('lifecycle.renewal_haggle',{date:dateStr(b.te)}):tr('lifecycle.contract_until',{date:dateStr(b.te)})):'';

/* Dashboard: customers won and lost per month (and why), renewals coming up, and the bandwidth market. */
function clPanel(){const C=S.cl||{mo:[]},mo=C.mo.slice(-12);const soon=S.biz.filter(b=>clOn(b)&&b.te&&b.te-S.day<=30&&b.te>=S.day).length;
  const sum=k=>mo.reduce((a,e)=>a+(k==='lost'?Object.values(e.lost).reduce((x,y)=>x+y,0):e[k]||0),0),why={};for(const e of mo)for(const k in e.lost)why[k]=(why[k]||0)+e.lost[k];
  let h=`<div class="panel2" id="churnSec" style="margin-top:12px"><h3>${tr('lifecycle.won_and_lost')}</h3><p class="note" style="margin-top:0">${tr('lifecycle.won_and_lost_note')}</p>
  <div class="dgrid" style="margin:0 0 8px"><div class="tile"><div class="lbl">${tr('lifecycle.won')}</div><div class="val">${sum('won')}</div><div class="sub">${tr('lifecycle.last_12_months')}</div></div>
  <div class="tile"><div class="lbl">${tr('lifecycle.lost')}</div><div class="val" style="color:${sum('lost')>sum('won')?'var(--bad)':'inherit'}">${sum('lost')}</div><div class="sub">${trn('lifecycle.n_grew',sum('grew'))}</div></div>
  <div class="tile"><div class="lbl">${tr('lifecycle.renewals_soon')}</div><div class="val">${soon}</div><div class="sub">${tr('lifecycle.next_30_days')}</div></div>
  <div class="tile"><div class="lbl">${tr('lifecycle.bandwidth_market')}</div><div class="val">${Math.round(mkt()*100)}</div><div class="sub">${mktTxt()}</div></div></div>`;
  if(mo.length){const max=Math.max(1,...mo.map(e=>Math.max(e.won,Object.values(e.lost).reduce((x,y)=>x+y,0)))),W=600,H=120,mid=H/2,bw=W/12;
    let g=`<line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="#D5DEEC"/>`;
    mo.forEach((e,i)=>{const lost=Object.values(e.lost).reduce((x,y)=>x+y,0),x=(i+12-mo.length)*bw+bw*0.2,w=bw*0.6,hw=(mid-12)*e.won/max,hl=(mid-12)*lost/max;
      g+=`<rect x="${x}" y="${mid-hw}" width="${w}" height="${hw}" fill="#16A866" rx="2"><title>${MONTHS[e.m%12]} · ${tr('lifecycle.won')} ${e.won}</title></rect><rect x="${x}" y="${mid}" width="${w}" height="${hl}" fill="#FF4D5E" rx="2"><title>${MONTHS[e.m%12]} · ${tr('lifecycle.lost')} ${lost}</title></rect><text x="${x+w/2}" y="${H-1}" text-anchor="middle" font-size="9" fill="#55608A" font-weight="700">${MONTHS[e.m%12]}</text>`;});
    h+=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr('lifecycle.won_and_lost')}">${g}</svg>`;}
  const ks=Object.keys(why).sort((a,b)=>why[b]-why[a]);
  h+=ks.length?`<h4 class="sub4">${tr('lifecycle.why_they_left')}</h4>`+ks.map(k=>`<div class="kv"><span>${tr(CL_WHY[k]?CL_WHY[k].l:CL_WHY.odd.l)}</span><b>${why[k]}</b></div>`).join(''):`<p class="empty">${tr('lifecycle.nobody_left_yet')}</p>`;
  return h+`</div>`;}

/* Saves from before contracts: renewals spread over the next year (from the customer's id, so they do not all fall on
   one day), and the market they signed in from the day they signed. */
function clFix(s,b){if(b.scripted||!clKind(b.type)){delete b.te;delete b.mk;delete b.hag;delete b.hr;return b;}
  const day=Math.max(0,Math.floor(+s.day||0)),ok=v=>typeof v==='number'&&isFinite(v);
  if(!ok(b.te)||b.te<day-1||b.te>day+365*21)b.te=day+30+hstr('te|'+b.id)%335;b.te=Math.floor(b.te);
  if(!ok(b.mk)||b.mk<=0||b.mk>5)b.mk=mktBase(Math.max(0,Math.floor(+b.since||0)));
  if(b.hag&&(typeof b.hag!=='object'||!ok(b.hag.rate)||b.hag.rate<0||!ok(b.hag.until)))delete b.hag;else if(b.hag)b.hag={rate:Math.round(b.hag.rate),until:Math.floor(Math.min(b.hag.until,b.te))};
  if(b.hr!==undefined&&b.hr!==b.te)delete b.hr;return b;}
function clFixState(s){const C=s.cl&&typeof s.cl==='object'&&!Array.isArray(s.cl)?s.cl:{},o={odd:typeof C.odd==='number'&&isFinite(C.odd)?C.odd:-1e9,mo:[]};
  if(Array.isArray(C.mo))for(const e of C.mo.slice(-CL_MONTHS)){if(!e||typeof e!=='object'||!Number.isInteger(e.m))continue;const n=v=>Math.max(0,Math.min(1e7,Math.floor(+v)||0)),lost={};
    if(e.lost&&typeof e.lost==='object')for(const k in e.lost)if(own(CL_WHY,k))lost[k]=n(e.lost[k]);o.mo.push({m:e.m,won:n(e.won),ren:n(e.ren),grew:n(e.grew),hag:n(e.hag),lost});}
  s.cl=o;}
