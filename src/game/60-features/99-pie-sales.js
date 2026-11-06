/* ---------- Pie in the Sky: the sales desk sells orbit too (38-sales-desk.js, 99-pie-orbit-customers.js) ----------
   Orbit offers go through whoever runs sales, as ground offers do: they carry o.by (so the shark's commission, the
   renewal haggles and each one's mark at renewal apply), plus what each of them does with a sky to sell:
   - the engineer only offers a deal where the dish it lands on has room to spare (PIE_ENG_ROOM times the deal) and its
     POP is well served (PIE_ENG_SF), and their orbit customers renew like the nerds do (salesLeaveMul);
   - the shark calls airlines and cruise lines first, asks for the biggest size that fits at a quarter more, and promises
     half of them a full sky (REQS.skyfull) before the crust is there: those customers grumble until it is, but never
     cancel over the promise alone (they stop at PIE_GRUMBLE happiness);
   - the CEO plays some of his golf with the Founder (one game in two while a rocket company exists): the biggest orbit
     deal that fits, the Mars mission first, at 30% off and with a promise nobody checked. A jumpy market costs him:
     his orbit prices drop by PIE_CEO_JIT times the jitters, and from PIE_CEO_SKIP the Founder does not show up.
   Rolls are hashes of the deal (slR), never Math.random: without a salesperson orbit offers are drawn exactly as before. */
const PIE_ENG_ROOM=1.5,PIE_ENG_SF=0.98,PIE_SHARK=1.25,PIE_SHARK_OVER=0.5,PIE_PROMISE=0.9,PIE_GRUMBLE=40,PIE_GOLF_SKY=0.5,PIE_CEO_JIT=0.4,PIE_CEO_SKIP=0.6;
// What the salesperson can sell on a landing (pieServe()'s answer): the engineer keeps headroom on healthy dishes only.
function pieSlRoom(L){if(slP()!=='eng')return L.left;const d=pieDishes()[L.k];return d&&!R.pie.isl.includes(d.city)&&sfOf(R,d.city)>=PIE_ENG_SF?L.left/PIE_ENG_ROOM:0;}
// Which kinds get a call: the shark rings airlines and cruise lines first.
function pieSlTypes(t){if(slP()!=='shark')return t;const big=t.filter(x=>x==='flywifi'||x==='boat'||x==='marsorb');return big.length?big:t;}
// The size: the shark asks for the biggest that fits, everyone else as the customer asks (pick, as before).
const pieSlSize=opts=>slP()==='shark'?opts[opts.length-1]:pick(opts);
// A new orbit offer, dressed by whoever is at the desk.
function pieSlShape(o){const p=slP();if(!p)return;o.by=p;
  if(p==='shark'){o.rate=Math.round(o.rate*PIE_SHARK);if(!REQS.skyfull.ok()&&slR('skyover|'+slKey(o))<PIE_SHARK_OVER)o.reqs=['skyfull'];}
  if(p==='ceo'){const j=pieJit();if(j>0)o.rate=Math.round(o.rate*(1-PIE_CEO_JIT*j));}}
const pieJit=()=>(S.pie&&S.pie.founder&&S.pie.founder.jit)||0;
// The CEO's golf with the Founder (salesGolf, on a golf day): true when this game was in orbit, deal or no deal.
function pieGolf(d){if(!pieOn()||!S.pie||!S.pie.co||slR('golfsky|'+d)>=PIE_GOLF_SKY)return false;
  const ts=pieOfferTypes();if(!ts.length)return false;
  if(pieJit()>=PIE_CEO_SKIP){toast(tr('sales.ceo_golf_skip'),'');return true;}
  for(const t of ['marsorb','boat','flywifi','pizza']){if(!ts.includes(t))continue;const T=BIZ_T[t];
    const cs=pieCands(t).filter(c=>!c.cn).map(c=>[c,pieServe(c.id,t)]).filter(([,L])=>L&&L.left>=T.opts[0]).sort((a,b)=>b[0].P-a[0].P||(a[0].id<b[0].id?-1:1));if(!cs.length)continue;
    const [c,L]=cs[0],bw=T.opts.filter(g=>g<=Math.min(pieRoom(t),L.left)).pop();if(!bw)continue;
    const list=T.names.filter(n=>!S.usedNames.includes(n)),name=list.length?list[Math.floor(slR('golfskyn|'+d)*list.length)]:T.names[0];useName(name);
    const off=1-0.7*(1-PIE_CEO_JIT*pieJit()),o={id:uid(),city:c.id,city2:null,name,type:t,bw,rate:Math.round(T.rate*(1-off)),reqs:REQS.skyfull.ok()?[]:['skyfull'],exp:d+40};
    const b=offerCustomer(o);b.by='ceo';S.biz.push(clSign(b));
    toast(tr('sales.ceo_golf_sky',{name:esc(name),city:esc(c.name),bw:fmtG(bw),price:fmt$(bw*o.rate),p:pct(off)})+(o.reqs.length?' '+tr('sales.ceo_promised',{req:esc(REQS.skyfull.l())}):''),'goal',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);sfx('coin');return true;}
  return false;}
