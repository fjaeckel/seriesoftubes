/* ---------- The Hyperscaler's director: one crisis at a time (37-hyper.js) ----------
   A cloud meets many kinds of trouble (protests and power events, rival clouds, regulators, outages, launch freezes,
   region failures, the classic world's cuts and floods) and a few kinds of luck (tenant offers, AI runs, resale offers).
   Each system was tuned on its own; together they piled up. So every Hyperscaler pressure event asks the director first,
   hsDirAsk(kind, weight, ref), and fires only on a yes. The director keeps:
   - a drama budget (S.hs.dir.b) that grows a little every day, more at higher levels, with more live regions and with the
     chaos rule (calm grows it slowly, none not at all), up to a cap; a crisis spends its weight;
   - one crisis at a time (S.hs.dir.c: the kind, the day and what it is about): while it is unresolved (an outage still
     on, a protest holding a build, a price war not answered, a law's answer due, a launch freeze), or any incident is
     on, nothing new starts; a crisis counts at most HS_DIR_SPAN days;
   - a quiet stretch after each (S.hs.dir.q, HS_DIR_Q days, fewer at higher levels).
   Opportunities are not crises: they are only capped, at most HS_DIR_OPP waiting at once.
   Each system switches on at its level (HS_DIR_LV, read by the story's unlock list, 39-hyper-story.js), and is
   introduced once with a short toast (S.hs.dir.i: the day each was). Whole-region failures need two live regions and
   day HS_DIR_BIG; one region bends (hsSoloSoft: an outage that would take it down serves HI_POW instead) and never breaks.
   Grid trips are announced a day ahead (S.hs.dir.w, 38-hyper-failover.js), with an answer (hsPrecool).
   No dice: the director is arithmetic on the day, so the games' other luck stays as it was. S.hs.dir.h keeps the last
   grants [kind, day]. */
const HS_DIR_RATE=0.02,HS_DIR_SPAN=30,HS_DIR_OPP=3,HS_DIR_BIG=180,HS_DIR_CHILL=25000;
// The level each system switches on at (anything not listed: from level 1).
const HS_DIR_LV={pev:2,ddos:2,rv:3,ai:3,freeze:3,inc:4,law:4,fail:4,monkey:5};
// What each kind asked for belongs to (its system), and which kinds are opportunities.
const HS_DIR_K={war:'rv',refugee:'rv',kong:'fail',trip:'fail',snip:'monkey',job:'ai'};
const HS_DIR_OPPS=['ten','job','resale','refugee'];
// The classic world's trouble (cuts, crashes, floods, world events, the monkey's snips) asks every day once it is due; from
// level 3 it leaves HS_DIR_KEEP of the budget to the cloud's own systems, which roll more rarely, so they get their turn.
const HS_DIR_FILL=['classic','ddos','event','snip'],HS_DIR_KEEP=0.5;
// Systems introduced when they switch on, in this order, one a day; with how the level-up list names them.
const HS_DIR_INTRO={pev:[N_('hyper_dir.intro_pev'),N_('hyper_dir.u_pev')],ddos:[N_('hyper_dir.intro_ddos'),N_('hyper_dir.u_ddos')],
 rv:[N_('hyper_dir.intro_rv'),N_('hyper_dir.u_rv')],ai:[N_('hyper_dir.intro_ai'),N_('hyper_dir.u_ai')],freeze:[N_('hyper_dir.intro_freeze'),N_('hyper_dir.u_freeze')],
 inc:[N_('hyper_dir.intro_inc'),N_('hyper_dir.u_inc')],law:[N_('hyper_dir.intro_law'),N_('hyper_dir.u_law')],fail:[N_('hyper_dir.intro_fail'),N_('hyper_dir.u_fail')]};
function hsDirDef(){return {b:0,t:S?S.day:0,q:0,c:null,i:{},w:null,h:[]};}
const hsDir=()=>S.hs.dir||(S.hs.dir=hsDirDef());
// Whether a system is on: its level, and what it needs to make sense (a studio for launches, two regions to fail over).
function hsDirCan(s){if(lvl()<(HS_DIR_LV[s]||1))return false;
  if(s==='freeze')return hsTen().some(b=>b.ck==='game');if(s==='ai')return hsRgs().length>=2;
  if(s==='fail'||s==='monkey')return hsRgs().length>=2&&S.day>=HS_DIR_BIG;return true;}
// And a system with an introduction waits for it (hsDirDay) before it does anything.
function hsDirOn(s){if(!hyper()||!S.hs)return true;return hsDirCan(s)&&(!own(HS_DIR_INTRO,s)||hsDir().i[s]!==undefined);}
const hsDirCap=()=>1+0.25*lvl();
const hsDirCm=()=>clamp(chaosMul(),0,2);
const hsDirQuiet=()=>Math.round(clamp(22-2*lvl(),10,20)/Math.max(0.5,hsDirCm()));
// Something is on: an incident (any kind, classic ones too).
// A zone out (38-hyper-zones.js) is a bad day the region shrugs off, not a crisis.
const hsDirInc=()=>S.inc.some(i=>i.until>S.day&&i.type!=='hsaz');
// Whether the crisis granted last is over: by what it was about.
function hsDirDone(x){const H=S.hs;if(S.day-x.d>=HS_DIR_SPAN)return true;if(hsDirInc())return false;
  if(x.k==='prot')return !hsProt(x.r)||!hsProtHeld(x.r);
  if(x.k==='war'){const P=H.rv&&H.rv.pw;return !P||P.until<=S.day||!!P.m;}
  if(x.k==='law'){const E=H.law&&H.law.egr;return E&&E.st==='open'?false:S.day-x.d>=10;}
  if(x.k==='pev')return !(H.pev||[]).some(e=>e.reg===x.r&&e.until>S.day)||S.day-x.d>=14;
  if(x.k==='freeze')return !H.lf;
  if(x.k==='trip')return !hsDir().w;
  return S.day>x.d;}
/* The day's bookkeeping, done whenever the director is asked (and once a day): the budget grows for the days gone by, a
   crisis that is over starts the quiet stretch, and so does the end of any incident. */
function hsDirSettle(){const D=hsDir(),d=S.day;if(d>D.t){const n=d-D.t,cap=hsDirCap(),r=HS_DIR_RATE*(1+0.15*(lvl()-1))*(1+0.3*Math.max(0,hsRgs().length-1))*hsDirCm();
    if(D.b<cap)D.b=Math.min(cap,D.b+r*n);D.t=d;}
  if(D.c&&hsDirDone(D.c)){D.c=null;D.q=Math.max(D.q,d+hsDirQuiet());}
  const on=hsDirInc();if(D.ib&&!on)D.q=Math.max(D.q,d+hsDirQuiet());D.ib=on?1:0;}
// Opportunities waiting for an answer: tenant offers, AI runs, resale offers.
const hsDirOpps=()=>S.offers.filter(o=>o.type==='cloud').length+(S.hs.jo||[]).length+(S.hs.rs?S.hs.rs.o.length:0);
/* The question every Hyperscaler pressure event asks: may kind (weight w, about r) happen now? Outside the charter
   always yes, so classic games never ask anything. */
function hsDirAsk(k,w,r){if(!hyper()||!S.hs)return true;const D=hsDir();hsDirSettle();if(!hsDirOn(HS_DIR_K[k]||k))return false;
  if(HS_DIR_OPPS.includes(k))return hsDirOpps()<HS_DIR_OPP;
  w=w||1;if(D.c||hsDirInc()||S.day<D.q||D.b<w+(lvl()>=3&&HS_DIR_FILL.includes(k)?HS_DIR_KEEP:0))return false;
  D.b-=w;D.c={k,d:S.day,r:r==null?'':String(r)};D.h.push([k,S.day]);if(D.h.length>30)D.h.shift();return true;}
// Whether a crisis is on (the card and the tests read it).
const hsDirBusy=()=>!!S.hs&&(hsDirSettle(),!!hsDir().c||hsDirInc());
/* One region bends, it does not break. While a Hyperscaler has a single region, an outage that would take its POP dark
   (a router crash, a power cut, a fat finger, a government order) leaves it serving HI_POW of its room instead: the POP
   stays up and the incident becomes grid trouble there (71-hyper-incidents.js), with the same repair. */
const HS_SOFT=['crash','power','oops','cleaner','shutdown'];
function hsSolo(){const H=S.hs;if(!H||!hyper())return '';const rs=Object.keys(H.rg).filter(c=>H.rg[c].ready<=S.day&&S.pops[c]&&!hsDownAt(c));return rs.length===1?rs[0]:'';}
// A region with a zone to spare loses only that zone, alone or not (hsAzSoft, 38-hyper-zones.js).
function hsSoloSoft(i){if(hsAzSoft(i))return true;if(!i||!HS_SOFT.includes(i.type))return false;const c=hsSolo();if(!c||i.ref!==c)return false;const p=S.pops[c];
  p.down=remainUntil(x=>x!==i&&x.ref===c&&HS_SOFT.includes(x.type))||0;if(!(p.down>S.day))delete p.down;
  i.type='hspow';i.msg+=' '+tr('hyper_dir.solo_soft',{p:pct(HI_POW)});return true;}
/* World events (85-incidents/30-events.js) a cloud meets: what touches its own network (its waves, POPs, transit, the
   cables it rides) is a crisis the director allows or not; market news it lives with quietly; the eyeball world's
   (a streaming season, a rural broadband grant, Golden Week, a gigaproject's demo, a game leaving Korea) never reach it,
   and neither does a landing dispute while it owns no cable, or a cable cut far from anything it uses. */
const HS_EV_DROP=['viral','grant','cake','golden','mega','krexit','krroute'],HS_EV_LIVE=['price','tariff','sanction','hwshock','gulf','gfw','runet'];
// The cables the Baltic and Red Sea events cut (as 30-events.js lists them).
const HS_EV_CAB={baltic:['clion','havf','danice'],redsea:['twoaf','smw6','peace','aae','eig','eassy']};
function hsEvOk(e){if(HS_EV_DROP.includes(e))return false;if(HS_EV_LIVE.includes(e))return true;
  if(e==='landban')return S.links.some(l=>l.kind==='df'&&l.own&&l.sub);
  if(own(HS_EV_CAB,e)&&!S.links.some(l=>l.cable&&HS_EV_CAB[e].includes(l.cable)&&!(l.cut>S.day)))return false;
  return hsDirAsk('event');}
// Toasts (95-modals/10-toasts.js): what a Hyperscaler's day announces pops up only when it asks for a decision (it has a
// button) or is a milestone; everything else goes to the NOC log quietly. And never more than two at once.
const hsQuiet=()=>!!UI.tick&&hyper()&&!!S.hs;
/* A day: the bookkeeping, and the next system that switched on introduced, HS_DIR_GAP days after the last one so a
   level that unlocks three does not read as a flood. A save from before the director (D.old) knows its systems already:
   they are marked introduced, silently. */
const HS_DIR_GAP=4;
function hsDirDay(d){const H=S.hs;if(!H||!hyper())return;const D=hsDir();hsDirSettle();const last=Math.max(-HS_DIR_GAP,...Object.values(D.i));
  for(const s of Object.keys(HS_DIR_INTRO)){if(D.i[s]!==undefined||!hsDirCan(s))continue;if(D.old){D.i[s]=d;continue;}if(d<last+HS_DIR_GAP)break;
    D.i[s]=d;toast(tr(HS_DIR_INTRO[s][0]),'goal');break;}
  delete D.old;}
CX_DAY.push(hsDirDay);
CX_NEW.push(o=>{o.dir=hsDirDef();});
// Saves: every field repaired; a Hyperscaler save from before the director gets one, its systems already introduced.
CX_SAN.push((h0,o,s)=>{const n=(v,d)=>Number.isFinite(+v)?+v:d,I=v=>Math.round(n(v,0)),obj=v=>v&&typeof v==='object'&&!Array.isArray(v),x=obj(h0.dir)?h0.dir:null,day=I(s.day);
  const D={b:x?clamp(n(x.b,0),0,10):0,t:x?clamp(I(x.t),0,day):day,q:x?Math.max(0,I(x.q)):0,c:null,i:{},w:null,h:[]};if(!x)D.old=1;
  if(x&&obj(x.c)&&typeof x.c.k==='string'&&x.c.k.length<12)D.c={k:x.c.k,d:I(x.c.d),r:typeof x.c.r==='string'?x.c.r.slice(0,40):''};
  if(x&&obj(x.i))for(const k of Object.keys(HS_DIR_INTRO))if(x.i[k]!==undefined)D.i[k]=Math.max(0,I(x.i[k]));
  if(x&&obj(x.w)&&isCity(x.w.c)&&own(o.rg,x.w.c))D.w={c:x.w.c,d:I(x.w.d),k:x.w.k==='heat'?'heat':'cut',ok:x.w.ok?1:0};
  if(x&&Array.isArray(x.h))for(const e of x.h.slice(-30))if(Array.isArray(e)&&typeof e[0]==='string'&&e[0].length<12)D.h.push([e[0],I(e[1])]);
  if(x&&x.ib)D.ib=1;if(x&&x.old)D.old=1;
  o.dir=D;});
