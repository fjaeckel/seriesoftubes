/* ---------- The Hyperscaler's own story (37-hyper.js) ----------
   Its ladder (LV_X): thirteen level names that tell how a cloud grows from a rack under the stairs into a weather system,
   a quote per level, and what each level really unlocks in this charter, read from the code that gates it (region room
   HS_LV_RG, region tiers HS_T, leased cages and zones (38-hyper-zones.js), own generation HS_GEN, tenant kinds CLOUD_TENANTS, your own cable CAB_LV, and the trouble
   the director lets in, HS_DIR_LV), so a balance
   pass that moves a gate moves the text too. The "Next:" line says what the next level asks (lvNeed: peak, live regions,
   continents with one). Built on first use: some of those tables live in later files.
   And its first steps, in the tutorial's coach (40-tutorial.js), which a Hyperscaler skips: S.hs.guide is a bitmask of
   the steps done while the guide runs (null when it does not). Steps that cannot be played yet (no offer to take, no
   second region live) wait, hidden, while later ones show. */
const HS_STORY=[
 [tr('hyper_story.lv01'),tr('hyper_story.lv01_q')],
 [tr('hyper_story.lv02'),tr('hyper_story.lv02_q')],
 [tr('hyper_story.lv03'),tr('hyper_story.lv03_q')],
 [tr('hyper_story.lv04'),tr('hyper_story.lv04_q')],
 [tr('hyper_story.lv05'),tr('hyper_story.lv05_q')],
 [tr('hyper_story.lv06'),tr('hyper_story.lv06_q')],
 [tr('hyper_story.lv07'),tr('hyper_story.lv07_q')],
 [tr('hyper_story.lv08'),tr('hyper_story.lv08_q')],
 [tr('hyper_story.lv09'),tr('hyper_story.lv09_q')],
 [tr('hyper_story.lv10'),tr('hyper_story.lv10_q')],
 [tr('hyper_story.lv11'),tr('hyper_story.lv11_q')],
 [tr('hyper_story.lv12'),tr('hyper_story.lv12_q')],
 [tr('hyper_story.lv13'),tr('hyper_story.lv13_q')],
];
// How each unlock reads in a list (tenant kinds and generation in the plural, as something you now get).
const HS_ST_TEN={ent:N_('hyper_story.u_ent'),game:N_('hyper_story.u_game'),gov:N_('hyper_story.u_gov'),lab:N_('hyper_story.u_lab'),startup:N_('hyper_story.u_startup'),tv:N_('hyper_story.u_tv')};
const HS_ST_GEN={smr:N_('hyper_story.u_smr'),sol:N_('hyper_story.u_sol'),sub:N_('hyper_story.u_sub')};
// Regions a level lets you run (hsRgMax at that level).
const hsRgAt=lv=>HS_LV_RG[Math.min(lv,HS_LV_RG.length-1)]+1;
const hsList=a=>{try{return new Intl.ListFormat(LANG,{type:'conjunction'}).format(a);}catch(e){return a.join(', ');}};
// What reaching level lv brings a Hyperscaler, as one list.
function hsUnlocks(lv){const u=[];if(lv===1)u.push(tr('hyper_story.u_shack',{name:tr(HS_T[0].n)}));
  const n=hsRgAt(lv);if(lv===1||n>hsRgAt(lv-1))u.push(trn('hyper_story.u_room',n));
  HS_T.forEach((T,i)=>{if(i>0&&i<HS_CAGE&&T.lv===lv)u.push(tr('hyper_story.u_tier',{name:tr(T.n)}));});
  // The middle steps (38-hyper-zones.js): leased cages, and a second, then a third, zone per region.
  if(HS_T[HS_CAGE].lv===lv)u.push(tr('hyper_colo.u_cage'));if(HS_AZ_LV[0]===lv)u.push(tr('hyper_az.u_zone'));if(HS_AZ_LV[1]===lv)u.push(tr('hyper_az.u_zone3'));
  for(const k of Object.keys(HS_GEN))if(HS_GEN[k].lv===lv)u.push(own(HS_ST_GEN,k)?tr(HS_ST_GEN[k]):tr(HS_GEN[k].n));
  for(const k of Object.keys(CLOUD_TENANTS))if(CLOUD_TENANTS[k].lv===lv)u.push(own(HS_ST_TEN,k)?tr(HS_ST_TEN[k]):tr(CLOUD_TENANTS[k].n));
  if(CAB_LV===lv)u.push(tr('hyper_story.u_cable'));
  // The trouble that switches on at this level (the director's gates, 38-hyper-director.js), named as it comes.
  for(const k of Object.keys(HS_DIR_INTRO))if((HS_DIR_LV[k]||1)===lv)u.push(tr(HS_DIR_INTRO[k][1]));
  return u.length?hsList(u):tr('hyper_story.u_view');}
let HS_LVS=null;
const hsLevels=()=>HS_LVS||(HS_LVS=HS_STORY.map(([n,q],i)=>({n,q,unlock:hsUnlocks(i+1)})));
// The "Next:" line: the next level by name, what it asks and what it brings.
function hsLvNext(nx){if(!nx)return tr('hyper_story.top');const i=hsLevels().indexOf(nx);if(i<1)return tr('hyper_story.top');const q=lvNeed(i),v={name:esc(nx.n),pk:fmtG(q.pk),c:q.reg,unlock:esc(nx.unlock)};
  return q.reg>=2?trn('hyper_story.next_ct',q.pops,v):trn('hyper_story.next',q.pops,v);}
Object.assign(HS_LVX,{title:lv=>tr('hyper_story.title',{lv,name:hsLevels()[lv-1].n}),eyebrow:lv=>tr('hyper_story.eyebrow',{lv,max:HS_STORY.length}),
  toast:lv=>{const L=hsLevels()[lv-1];return tr('hyper_story.level_up',{lv,name:esc(L.n),unlock:esc(L.unlock)})+`<br><i>${esc(L.q)}</i>`;},next:hsLvNext});
Object.defineProperty(HS_LVX,'levels',{get:hsLevels});
// The charter picker says how Cloud Nine is won, with the real marks (38-hyper-win.js).
CHARTERS.hyper.v=()=>({ct:HS_C9_CT,g:fmtG(HS_C9_BTW)});

/* First steps: launch at home, a front door, watch users grow, a first tenant, a second region, its replica, a drill.
   sel: where the glow goes, most specific first (as the tutorial's TUT); go: the city the step is about. */
const HS_GD_KEY='sot-tut-hs';
const hsGdTab=t=>`#panel [data-act="tab"][data-args*='"${t}"']`,HS_GD_FOCUS='#coach [data-act="focusCity"]';
const hsGdCc=()=>CITY[S.home].cc;
// Where a second region would go: the POP of yours nearest home in a region metro, else such a metro.
function hsGdRgAt(){const H=S.hs,mine=Object.keys(S.pops).filter(c=>!H.rg[c]&&hsSite(c)),L=mine.length?mine:CITIES.filter(C=>!C.off&&!H.rg[C.id]&&siteOk(C.id,HS_MIN_P)).map(C=>C.id);
  let b=null,bk=Infinity;for(const c of L){const km=kmBetween(S.home,c);if(km<bk||km===bk&&c<b){bk=km;b=c;}}return b;}
// The region the replica and the drill are about: home if it is live, else the first live one.
const hsGdRg1=()=>{const rs=hsRgs();return rs.includes(S.home)?S.home:rs[0]||S.home;};
const HS_GUIDE=[
 {t:()=>tr('hyper_story.g_launch',{country:esc(ccName(hsGdCc()))}),get sel(){return [`[data-act="hsLaunch"][data-args*='"${hsGdCc()}"']`,hsGdTab('cust'),HS_GD_FOCUS];},
  ok:()=>!!S.hs.cc[hsGdCc()],skip:()=>!!hsWhy(hsGdCc()),go:()=>S.home},
 {t:()=>tr('hyper_story.g_door'),sel:['[data-act="rs"]','[data-act="buyIx"]','[data-act="buyTransit"]',hsGdTab('peer'),hsGdTab('up'),HS_GD_FOCUS],no:b=>b.dataset.act==='buyIx'&&tutDk(b),
  ok:()=>Object.keys(S.pops).some(hsDoor),go:()=>S.home},
 {t:()=>tr('hyper_story.g_grow',{p:pct(CX_GOOD)}),sel:['#sp1','[data-act="phoneSpeed"]'],idle:()=>UI.speed>=1,ok:()=>S.day>=5},
 {t:()=>tr('hyper_story.g_tenant'),sel:['#left [data-act="accept"]','#panel [data-act="accept"]','[data-act="leftTab"][data-args*=\'"deals"\']','[data-act="phoneTab"][data-args*=\'"deals"\']'],
  ok:()=>hsTen().length>0,can:()=>S.offers.some(o=>o.type==='cloud')},
 // Once leased cages are allowed, the step offers one too: a region in two weeks while the money for a Barn comes in.
 {t:()=>{const c=hsGdRgAt(),v={name:tr(HS_T[1].n),cost:fmt$(HS_T[1].cost),city:esc(CITY[c].name)};return HS_T[HS_CAGE].lv<=lvl()?tr('hyper_story.g_region_cage',{...v,prov:tr(hsColoP(c)),mo:fmt$(HS_T[HS_CAGE].mo)}):tr('hyper_story.g_region',v);},
  get sel(){const c=hsGdRgAt();return [`[data-act="hsRegion"][data-args*='"${c}"']:not([disabled])`,`[data-act="hsColo"][data-args*='"${c}"']:not([disabled])`,`[data-act="buildPop"][data-args*='"${c}"']:not([disabled])`,hsGdTab('cust'),HS_GD_FOCUS];},
  ok:()=>hsRgN()>=2,can:()=>hsRgMax()>=2&&!!hsGdRgAt(),go:()=>hsGdRgAt()},
 {t:()=>tr('hyper_story.g_replica',{city:esc(CITY[hsGdRg1()].name),p:pct(HS_REP)}),sel:['[data-chg="hsReplica"]',hsGdTab('cust'),HS_GD_FOCUS],
  ok:()=>Object.keys(S.hs.rep).length>0,can:()=>hsRgs().length>=2,go:()=>hsGdRg1()},
 {t:()=>tr('hyper_story.g_drill',{city:esc(CITY[hsGdRg1()].name)}),sel:['[data-act="hsDrill"]:not([disabled])',hsGdTab('cust'),HS_GD_FOCUS],
  ok:()=>!!S.hs.dx||Object.keys(S.hs.drill).length>0,can:()=>hsRgs().length>=2,go:()=>hsGdRg1()},
];
// A city tab glows only while that city is open.
for(const g of HS_GUIDE)if(g.go){const n0=g.no;g.no=b=>!!(n0&&n0(b))||b.dataset.act==='tab'&&!(UI.sel&&UI.sel.type==='city'&&UI.sel.id===g.go());}
const hsGuideOn=()=>hyper()&&!!S.hs&&S.hs.guide!=null&&!S.lost;
/* The step on now: its index, HS_GUIDE.length when all are done, -2 while only waiting steps are left, -1 when the guide
   is off. Steps done (or skipped) on the way are ticked off, as the tutorial does. */
function hsGdNow(){if(!hsGuideOn())return -1;const H=S.hs;let wait=false;
  for(let i=0;i<HS_GUIDE.length;i++){if(H.guide>>i&1)continue;const g=HS_GUIDE[i];let ok=false;try{ok=g.ok()||!!(g.skip&&g.skip());}catch(e){}
    if(ok){H.guide|=1<<i;continue;}
    let can=true;if(g.can)try{can=g.can();}catch(e){can=false;}
    if(can)return i;wait=true;}
  return wait?-2:HS_GUIDE.length;}
const hsGuideStep=()=>{const i=hsGdNow();return i>=0&&i<HS_GUIDE.length?HS_GUIDE[i]:null;};
const hsGuideUp=()=>!!hsGuideStep();
// Starts with a new Hyperscaler, in the tutorial's place, unless this browser has seen it. Seeded tests skip it unless they ask.
function hsGuideStart(){if(!hyper()||!S.hs)return;S.tut=null;let done=false;try{done=!!localStorage.getItem(HS_GD_KEY);}catch(e){}
  if(done||window.__TUBES_TEST__&&!window.__TUBES_TUT__)return;S.hs.guide=0;renderCoach();}
// renderCoach() asks here first: true when the coach is the guide's.
function hsCoach(el){if(!hsGuideOn())return false;const i=hsGdNow(),N=HS_GUIDE.length;
  if(i===N){S.hs.guide=null;el.hidden=true;try{localStorage.setItem(HS_GD_KEY,'1');}catch(e){}toast(tr('hyper_story.g_done'),'goal');return true;}
  if(i<0){el.hidden=true;return true;}
  const g=HS_GUIDE[i],c=g.go&&g.go(),here=UI.sel&&UI.sel.type==='city'&&UI.sel.id===c;
  el.innerHTML=`<div class="ct"><span class="cs">${tr('tutorial.step_n_of_total',{n:i+1,total:N})}</span>${g.t()}${c&&!here?' '+btn(tr('common.show_me'),'focusCity',{city:c},'sm'):''}</div>${btn(tr('common.skip_tutorial'),'hsGuideSkip',{},'ghost sm')}`;
  el.hidden=false;coachGlow();return true;}
CX_NEW.push(o=>{o.guide=null;});
CX_SAN.push((h0,o)=>{const g=h0.guide;o.guide=Number.isInteger(g)&&g>=0&&g<(1<<HS_GUIDE.length)?g:null;});
