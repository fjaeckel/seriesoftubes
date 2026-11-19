/* ---------- Event rights: a Streaming service buys the ridiculous live events everyone will watch ----------
   From level PREM_LV a rights agent calls now and then (C.roff) with a live event for one continent, or later the whole
   world: a fee up front, a night where demand multiplies (mul) and no box can help much (LIVE_HIT), and a reward if it
   streams without buffering: new subscribers there (gain), or cancellations if it buffers. Live means live: from
   FREEZE_PRE days before until the last night, the network is in a change freeze (cntFrozen()): nobody touches a port,
   a link, a router, a box or an origin (90-actions/99-change-freeze.js). Rolls are hashes of the day. */
const EV_NAMES=[N_('streaming.ev_splice'),N_('streaming.ev_moon'),N_('streaming.ev_wedding'),N_('streaming.ev_grandma'),N_('streaming.ev_ironing'),N_('streaming.ev_finale'),
 N_('streaming.ev_rps'),N_('streaming.ev_laser'),N_('streaming.ev_backhoe'),N_('streaming.ev_eclipse'),N_('streaming.ev_goat'),N_('streaming.ev_toast')];
const EV_DAYS=2,EV_WAIT=20,EV_MAX=2,EV_EVERY=45,FREEZE_PRE=2,EV_ALL_LV=9;
const evName=e=>tr(EV_NAMES[e.n%EV_NAMES.length]);
const evWhere=e=>e.reg==='ALL'?tr('streaming.everywhere'):REG[e.reg];
const evOn=(e,d)=>d>=e.day&&d<e.day+EV_DAYS;
// Tonight's biggest multiplier for a continent from the events you bought.
const evMulAt=reg=>{const C=S.cnt;let m=1;for(const e of (C&&C.evs)||[])if(evOn(e,S.day)&&(e.reg==='ALL'||e.reg===reg))m=Math.max(m,e.mul);return m;};
const evLiveAt=reg=>evMulAt(reg)>1;
/* The freeze: a bought event, or a live premiere, from FREEZE_PRE days before its first night to its last. Returns what
   froze it ({show, until}) or null. */
function cntFrozen(){if(!content()||!S.cnt)return null;const d=S.day,C=S.cnt;
  for(const e of C.evs)if(d>=e.day-FREEZE_PRE&&d<e.day+EV_DAYS)return {show:evName(e),until:e.day+EV_DAYS};
  const p=C.prem;if(p&&p.live&&d>=p.day-FREEZE_PRE&&d<p.day+PREM_DAYS)return {show:premShow(p),until:p.day+PREM_DAYS};return null;}
// What a continent's subscribers are, for pricing rights.
const evSubs=reg=>{const C=S.cnt;let g=0;for(const k in C.cc)if(reg==='ALL'||ccInfo(k).reg===reg)g+=C.cc[k].d;return g;};
function evDay(d){const C=S.cnt;C.roff=C.roff.filter(o=>o.exp>d);
  for(const e of C.evs){if(d===e.day-FREEZE_PRE)toast(tr('streaming.freeze_starts',{show:evName(e),date:dateStr(e.day+EV_DAYS)}),'bad');
    if(evOn(e,d))for(const k in C.cc)if(e.reg==='ALL'||ccInfo(k).reg===e.reg)e.w=Math.min(e.w,ccQ(R,k));}
  for(const e of C.evs.slice()){if(d!==e.day+EV_DAYS-1)continue;const ok=e.w>=PREM_OK;
    for(const k in C.cc)if(e.reg==='ALL'||ccInfo(k).reg===e.reg)C.cc[k].d*=ok?1+e.gain:1-e.gain/2;
    if(ok){C.evOk++;toast(tr('streaming.event_triumph',{show:evName(e),where:evWhere(e),p:pct(e.gain)}),'goal');sfx('coin');}
    else toast(tr('streaming.event_flop',{show:evName(e),where:evWhere(e),q:pct(e.w)}),'bad');
    C.evs=C.evs.filter(x=>x!==e);}
  if(lvl()<PREM_LV||!Object.keys(C.cc).length||C.roff.length>=EV_MAX||d<C.rnext)return;C.rnext=d+EV_EVERY+hstr(S.asn+'|rnext|'+d)%20;
  const w={};for(const k in C.cc){const r=ccInfo(k).reg;w[r]=(w[r]||0)+C.cc[k].d;}const h=hstr(S.asn+'|rights|'+d),all=lvl()>=EV_ALL_LV&&h%3===0;
  const reg=all?'ALL':Object.keys(w).sort((a,b)=>w[b]-w[a]||(a<b?-1:1))[0],mul=all?5:3+h%2,gain=all?0.3:0.15+(h%3)*0.05,
    fee=Math.max(25000,Math.round(evSubs(reg)*CNT_RATE*(mul-1)*0.8/1000)*1000);
  C.roff.push({id:uid(),n:h%EV_NAMES.length,reg,mul,gain,fee,day:d+leadDays(EV_WAIT+10+h%20),exp:d+EV_WAIT});
  toast(tr('streaming.rights_offer_toast',{show:tr(EV_NAMES[h%EV_NAMES.length]),where:all?tr('streaming.everywhere'):REG[reg]}),'goal',[{l:tr('common.show_me'),act:'leftTab',args:{t:'goals'}}]);}
function evSanitize(c0,o,s){const rd=(x,k,d)=>Number.isFinite(+x[k])?+x[k]:d,reg=r=>r==='ALL'||own(REG,r);
  const ev=x=>({id:String(x.id==null?uid():x.id).slice(0,40),n:Math.round(clamp(rd(x,'n',0),0,EV_NAMES.length-1)),reg:x.reg,mul:clamp(rd(x,'mul',3),1,10),gain:clamp(rd(x,'gain',0.2),0,1),fee:Math.round(clamp(rd(x,'fee',0),0,1e10)),day:Math.round(rd(x,'day',0))});
  o.roff=Array.isArray(c0.roff)?c0.roff.slice(0,EV_MAX).filter(x=>x&&reg(x.reg)).map(x=>({...ev(x),exp:Math.round(rd(x,'exp',0))})):[];
  o.evs=Array.isArray(c0.evs)?c0.evs.slice(0,20).filter(x=>x&&reg(x.reg)).map(x=>({...ev(x),w:clamp(rd(x,'w',1),0,1)})):[];
  o.rnext=Math.round(Number.isFinite(+c0.rnext)?+c0.rnext:(s.day||0)+EV_EVERY);o.evOk=Math.max(0,Math.round(rd(c0,'evOk',0)));}
