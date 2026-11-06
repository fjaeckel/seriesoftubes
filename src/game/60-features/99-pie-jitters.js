/* ---------- Pie in the Sky: the Founder's antics and the market's jitters (docs/plans/pie-in-the-sky.md) ----------
   Every 60 to 120 days while a rocket company exists, the Founder does something daft: a post, a gasp (a toast) and a
   real effect that wears off. Each antic also bumps the market's jitters (S.pie.founder.jit, 0..1), which fade to nothing
   over PIE_JIT_DAYS and meanwhile make orbit customers call less and keep the happiest a little less happy (at most
   PIE_JIT_CAP under 100, never low enough to cancel over it): Ooooh, Uuuuuh, then it normalises.
   Rule O5: the harm needs pieChaos() (chaos on, the 90 quiet days over); without it he still posts and nothing else
   happens. Dice are rolled only with a company (pieAnticDay returns first), so every other game plays as before.
   State in S.pie.founder (pieBlank, pieSanitize): jit; next, the day of the next antic (0: not planned yet); kid, 1 + an
   index of PIE_KIDS (once a game, then a running gag); bill, the day orbit billing is back; nerv, hype, leak: the days
   those last until; mars, the due day (in due) of the Mars promise, whose slip costs a few orbit customers. */
const PIE_ANTIC_FIRST=90,PIE_ANTIC_GAP=60,PIE_ANTIC_SPAN=61,PIE_JIT_DAYS=30,PIE_JIT_OFFER=0.3,PIE_JIT_CAP=25,
  PIE_KID_DAYS=3,PIE_SPREE_DAYS=14,PIE_NERV=0.6,PIE_SPREE_MOOD=4,PIE_LEAK_DAYS=30,PIE_LEAK_INS=1.75,PIE_HYPE_DAYS=14,PIE_HYPE=1.5,PIE_MARS_CHURN=0.02;
// The kid's name (code, not words: never translated) and what the feed calls him afterwards.
const PIE_KIDS=[{n:"Orbit'); DROP TABLE invoices;--",k:'Orby Tables'},{n:"Perigee'); DELETE FROM billing;--",k:'Perry Tables'},{n:"Max Q'); TRUNCATE customers;--",k:'Maxie Tables'}];
FOUNDER_POSTS.push(N_('pie.fp_backup'),N_('pie.fp_kid'),N_('pie.fp_leak'),N_('pie.fp_leak_kid'),N_('pie.fp_mars'),N_('pie.fp_mars_kid'),N_('pie.fp_mars_slip'),N_('pie.fp_reg'),N_('pie.fp_spree'),N_('pie.fp_spree_kid'));
const pieKid=()=>{const F=S&&S.pie&&S.pie.founder;return F&&F.kid?PIE_KIDS[F.kid-1]:null;};
const pieBump=(F,v)=>{F.jit=Math.min(1,+(F.jit+v).toFixed(4));};
const pieOrbitBiz=()=>S.biz.filter(b=>BIZ_T[b.type].orbit);
// Read by pieMoney() (no orbit income while billing is down), pieQuote() (insurance) and the orbit sales desk (offers).
function pieBillOff(){const P=S&&S.pie;return !!P&&P.founder.bill>S.day&&pieChaos();}
function pieInsMul(){const P=S&&S.pie;return P&&P.founder.leak>S.day&&pieChaos()?PIE_LEAK_INS:1;}
function pieOfferMul(){const P=S.pie;if(!P||!pieChaos())return 1;const F=P.founder;let m=1-PIE_JIT_OFFER*F.jit;if(F.nerv>S.day)m*=PIE_NERV;if(F.hype>S.day)m*=PIE_HYPE;return m;}
// The antics: w their weight, ok(F) whether he can, go(F,harm,d) posts and, with harm, does it and returns the toast's text;
// j: how much it rattles the market.
const PIE_ANTICS={
 kid:{w:1.5,j:0.7,ok:F=>!F.kid,go:(F,h,d)=>{F.kid=1+Math.floor(Math.random()*PIE_KIDS.length);pieFounder(N_('pie.fp_kid'));if(!h)return '';
   const n=rint(PIE_KID_DAYS,3);F.bill=d+n+1;return tr('pie_ant.kid',{kid:esc(pieKid().n),n});}},
 spree:{w:3,j:0.6,ok:()=>true,go:(F,h,d)=>{const n=rint(40,50);pieFounder(F.kid?N_('pie.fp_spree_kid'):N_('pie.fp_spree'),{n});if(!h)return '';
   F.nerv=d+PIE_SPREE_DAYS;pieMood(b=>!!BIZ_T[b.type].orbit,-PIE_SPREE_MOOD);return tr('pie_ant.spree',{n,d:PIE_SPREE_DAYS});}},
 reg:{w:1,j:0.4,ok:()=>true,go:(F,h)=>{pieFounder(N_('pie.fp_reg'));if(!h)return '';const P=S.pie;
   // A country where you have a dish or landing rights, through the spats' own machinery (pieSpatStart).
   if(Object.keys(P.spat).length<PIE_SPAT_MAX){const cs=[...new Set([...pieDishCc(),...Object.keys(P.lic).filter(pieLicOk)])].sort(),o=cs.length?Math.floor(Math.random()*cs.length):0;
     for(const id of ['lic'])for(let i=0;i<cs.length;i++)if(!P.spat[id]&&pieSpatStart(id,cs[(o+i)%cs.length]))return tr('pie_ant.reg');}
   return tr('pie_ant.reg_none');}},
 leak:{w:2,j:0.3,ok:()=>true,go:(F,h,d)=>{pieFounder(F.kid?N_('pie.fp_leak_kid'):N_('pie.fp_leak'));if(!h)return '';
   F.leak=d+PIE_LEAK_DAYS;return tr('pie_ant.leak',{p:pct(PIE_INS*PIE_LEAK_INS),n:PIE_LEAK_DAYS});}},
 mars:{w:2,j:0.3,ok:F=>!F.mars,go:(F,h,d)=>{F.mars=piePromise(F.kid?N_('pie.fp_mars_kid'):N_('pie.fp_mars'));if(!h)return '';
   F.hype=d+PIE_HYPE_DAYS;return tr('pie_ant.mars',{n:PIE_HYPE_DAYS});}},
};
const PIE_ANTIC_KEYS=Object.keys(PIE_ANTICS);
// One antic (k forces which, for tests); true when he did something.
function pieAntic(k){const P=S.pie;if(!P||!P.co)return false;const F=P.founder,d=S.day,h=pieChaos();
  if(!k){const o=PIE_ANTIC_KEYS.filter(x=>PIE_ANTICS[x].ok(F));let r=Math.random()*o.reduce((a,x)=>a+PIE_ANTICS[x].w,0);k=o[o.length-1];for(const x of o){r-=PIE_ANTICS[x].w;if(r<=0){k=x;break;}}}
  const A=PIE_ANTICS[k];if(!A||!A.ok(F))return false;S.stats.pieAnt=(S.stats.pieAnt||0)+1;
  const b=A.go(F,h,d);if(!h)return true;
  pieBump(F,A.j);toast(`<b>😱 ${tr('pie_ant.gasp')}</b><br>${b}`,'bad');sfx('alert');return true;}
// The Mars promise slipped (pieDay, when its due day comes): the unhappiest few orbit customers had enough.
function pieMarsSlip(d){const F=S.pie.founder;F.mars=0;pieFounder(N_('pie.fp_mars_slip'),{n:pieYear(d+360)});if(!pieChaos())return;pieBump(F,PIE_ANTICS.mars.j);
  const bs=pieOrbitBiz().sort((a,b)=>a.mood-b.mood),n=Math.round(bs.length*PIE_MARS_CHURN);
  if(n){const go=new Set(bs.slice(0,n));S.biz=S.biz.filter(b=>!go.has(b));S.stats.pieChurn=(S.stats.pieChurn||0)+n;}
  toast(`<b>😱 ${tr('pie_ant.gasp')}</b><br>${n?trn('pie_ant.mars_slip',n):tr('pie_ant.mars_slip_none')}`,'bad');}
function pieAnticDay(d){const P=S.pie,F=P.founder;if(!P.co)return;
  if(F.bill&&d>=F.bill-1){F.bill=0;pieFounder(N_('pie.fp_backup'));if(pieChaos())toast(tr('pie_ant.backup'),'good');}
  if(F.mars&&!F.due.includes(F.mars))F.mars=0;
  if(F.jit>0){if(pieChaos()){const top=100-PIE_JIT_CAP*F.jit;for(const b of S.biz)if(BIZ_T[b.type].orbit&&b.mood>top)b.mood=top;}const j=+(F.jit-1/PIE_JIT_DAYS).toFixed(4);F.jit=j<0.005?0:j;}
  if(!F.next)F.next=d+PIE_ANTIC_FIRST;else if(d>=F.next){F.next=d+rint(PIE_ANTIC_GAP,PIE_ANTIC_SPAN);pieAntic();}}
PIE_ON.day.push(pieAnticDay);
// sanitize: the antics' part of S.pie.founder (o: the repaired founder, F: the saved one).
function pieAnticFix(o,F,day){const n=(v,hi)=>int(v,0,hi,0);o.jit=clamp(num(F.jit,0),0,1);o.next=n(F.next,day+PIE_ANTIC_FIRST+PIE_ANTIC_GAP+PIE_ANTIC_SPAN);o.kid=n(F.kid,PIE_KIDS.length);
  o.bill=n(F.bill,day+PIE_KID_DAYS+3);if(o.bill<=day)o.bill=0;o.nerv=n(F.nerv,day+PIE_SPREE_DAYS);o.hype=n(F.hype,day+PIE_HYPE_DAYS);o.leak=n(F.leak,day+PIE_LEAK_DAYS);
  o.mars=n(F.mars,day+720);if(!o.due.includes(o.mars))o.mars=0;}
// The Company tab, next to the feed: how jumpy the market is and how long until it calms down.
function pieJitHtml(F){const j=F.jit||0,K=pieKid();let h='';
  if(!(j>0))h=`<p class="meta pie-jit">${tr('pie_ant.jit_calm')}</p>`;
  else{const l=j>=0.6?tr('pie_ant.jit_high'):j>=0.3?tr('pie_ant.jit_mid'):tr('pie_ant.jit_low');
    h=`<p class="meta pie-jit">${trn('pie_ant.jit_line',Math.ceil(j*PIE_JIT_DAYS),{lvl:l})}</p><div class="bar ${j>=0.6?'bad':'warn'} pie-jit-bar"><i style="width:${Math.round(j*100)}%"></i></div>`;}
  if(pieBillOff())h+=`<p class="note pie-jit">${tr('pie_ant.bill_paused',{d:dateStr(F.bill),kid:esc(K?K.n:'')})}</p>`;
  return h;}
