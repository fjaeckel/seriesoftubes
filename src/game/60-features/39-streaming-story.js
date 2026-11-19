/* ---------- The Streaming service's own story (37-streaming.js) ----------
   Its own ladder: level names, quotes and what each level really unlocks for a streaming service (boxLv, PREM_LV,
   LIVE_LV, DISP_LV, CAT_T, DC_T, dcMax, EV_ALL_LV, PREM_ALL_LV and the eras), shown by the level card, the Deals tab and
   the level-up toast through lvInfo(). And its first steps, in the tutorial's coach (40-tutorial.js): S.cnt.guide is a
   bitmask of the steps done while the guide runs (null when it does not). The last chapters wait, hidden, until they
   can be played: a box needs level 3 and enough traffic, a hall needs the money. */
const CNT_LEVELS=[
 {n:tr('streaming_story.lv01'),q:tr('streaming_story.lv01_q'),unlock:tr('streaming_story.lv01_u')},
 {n:tr('streaming_story.lv02'),q:tr('streaming_story.lv02_q'),unlock:tr('streaming_story.lv02_u')},
 {n:tr('streaming_story.lv03'),q:tr('streaming_story.lv03_q'),unlock:tr('streaming_story.lv03_u')},
 {n:tr('streaming_story.lv04'),q:tr('streaming_story.lv04_q'),unlock:tr('streaming_story.lv04_u')},
 {n:tr('streaming_story.lv05'),q:tr('streaming_story.lv05_q'),unlock:tr('streaming_story.lv05_u')},
 {n:tr('streaming_story.lv06'),q:tr('streaming_story.lv06_q'),unlock:tr('streaming_story.lv06_u')},
 {n:tr('streaming_story.lv07'),q:tr('streaming_story.lv07_q'),unlock:tr('streaming_story.lv07_u')},
 {n:tr('streaming_story.lv08'),q:tr('streaming_story.lv08_q'),unlock:tr('streaming_story.lv08_u')},
 {n:tr('streaming_story.lv09'),q:tr('streaming_story.lv09_q'),unlock:tr('streaming_story.lv09_u')},
 {n:tr('streaming_story.lv10'),q:tr('streaming_story.lv10_q'),unlock:tr('streaming_story.lv10_u')},
 {n:tr('streaming_story.lv11'),q:tr('streaming_story.lv11_q'),unlock:tr('streaming_story.lv11_u')},
 {n:tr('streaming_story.lv12'),q:tr('streaming_story.lv12_q'),unlock:tr('streaming_story.lv12_u')},
 {n:tr('streaming_story.lv13'),q:tr('streaming_story.lv13_q'),unlock:tr('streaming_story.lv13_u')},
];
// Level i (0-based) as this charter tells it.
const lvInfo=i=>(content()?CNT_LEVELS:LEVELS)[i];
const lvEyebrow=lv=>content()?tr('streaming_story.audience_level_lv_of_max',{lv,max:LEVELS.length}):tr('progress.customer_level_lv_of_max',{lv,max:LEVELS.length});
const lvToast=lv=>{const L=lvInfo(lv-1);return (content()?tr('streaming_story.level_up',{lv,name:L.n,unlock:L.unlock}):tr('day_tick.customer_level_lv_name_new_customers',{lv,name:L.n,unlock:L.unlock}))+`<br><i>${esc(L.q)}</i>`;};
const cntLvNext=nx=>nx?tr('progress.next_name_unlocks_what',{name:esc(nx.n),what:esc(nx.unlock)}):tr('streaming_story.all_unlocked');
// The tutorial's tab glow, only on the city the step is about.
const gdTab=t=>`#panel [data-act="tab"][data-args*='"${t}"']`;
const GUIDE_KEY='sot-tut-tv';
const CNT_GUIDE=[
 {t:tr('streaming_story.g_launch'),get sel(){return [`[data-act="cntLaunch"][data-args*='"${CITY[S.home].cc}"']`,gdTab('cust'),'#coach [data-act="focusCity"]'];},ok:()=>!!S.cnt.cc[CITY[S.home].cc],skip:()=>!!ccWhy(CITY[S.home].cc),go:()=>S.home},
 {t:tr('streaming_story.g_transit'),sel:['[data-act="buyTransit"]',gdTab('up'),'#coach [data-act="focusCity"]'],ok:()=>cntOut(S.home),skip:()=>!NETS.some(n=>sellsAt(n,S.home)),go:()=>S.home},
 {t:tr('streaming_story.g_ix'),sel:['[data-act="rs"]','[data-act="buyIx"]',gdTab('peer'),'#coach [data-act="focusCity"]'],no:b=>b.dataset.act==='buyIx'&&tutDk(b),ok:()=>Object.keys(S.rs).length>0,skip:()=>modeOn('outcast')||!ixName(S.home),go:()=>S.home},
 {t:tr('streaming_story.g_speed'),sel:['#sp1','[data-act="phoneSpeed"]'],idle:()=>UI.speed>=1,ok:()=>S.day>=5},
 {t:tr('streaming_story.g_neighbour'),sel:['[data-act="cntLaunch"]','#coach [data-act="focusCity"]'],ok:()=>Object.keys(S.cnt.cc).length>=2,go:()=>gdNear()},
 {t:tr('streaming_story.g_box'),sel:['[data-act="cntBox"][data-args*=\'"d":1\']:not([disabled])',gdTab('cust'),'#coach [data-act="focusCity"]'],ok:()=>S.cnt.box.length>0,can:()=>!!gdBoxAt(),go:()=>gdBoxAt()},
 {t:tr('streaming_story.g_hall'),sel:['[data-act="cntDc"]:not([disabled])',gdTab('cust'),'#coach [data-act="focusCity"]'],ok:()=>Object.values(S.cnt.dc).some(d=>d.t>0||!!d.up),can:()=>gdHallAt()!==null,go:()=>gdHallAt()},
];
for(const g of CNT_GUIDE)if(g.go){const n0=g.no;g.no=b=>!!(n0&&n0(b))||b.dataset.act==='tab'&&!(UI.sel&&UI.sel.type==='city'&&UI.sel.id===g.go());}
// The nearest country you can launch in, at its biggest city.
function gdNear(){const hc=CITY[S.home].cc;let b=null,bk=Infinity;for(const C of CITIES){if(C.off||C.cc===hc||S.cnt.cc[C.cc])continue;const I=ccInfo(C.cc);if(!I||I.main!==C.id||ccWhy(C.cc))continue;
  const km=kmBetween(S.home,C.id);if(km<bk){bk=km;b=C.id;}}return b;}
// The first POP where an eyeball network would take a box today.
// Asked on every render while the guide waits: kept until the day, the routing or the boxes change.
let GD_BOX={k:'',v:null};
function gdBoxAt(){if(lvl()<3)return null;const k=S.day+'|'+lvl()+'|'+S.cnt.box.length+'|'+Object.keys(S.pops).length+'|'+R.served+'|'+(S.cnt.disp?S.cnt.disp.net:'');if(GD_BOX.k===k)return GD_BOX.v;
  let v=null;for(const c of Object.keys(S.pops).sort()){for(const n of boxNets(c))if(!boxWhy(c,n.id)){v=c;break;}if(v)break;}GD_BOX={k,v};return v;}
// Your starter cage, once you can pay to grow it into a hall.
function gdHallAt(){const d=S.cnt.dc[S.home];return d&&!d.t&&!d.up&&d.ready<=S.day&&S.pops[S.home]&&S.cash>=DC_T[1].cost?S.home:null;}
const cntGuideOn=()=>content()&&!!S.cnt&&S.cnt.guide!=null&&!S.lost;
/* The step on now: its index, CNT_GUIDE.length when all are done, -2 while only waiting chapters are left, -1 when the
   guide is off. Steps done (or skipped) on the way are ticked off, as the tutorial does. */
function gdNow(){if(!cntGuideOn())return -1;const C=S.cnt;let wait=false;
  for(let i=0;i<CNT_GUIDE.length;i++){if(C.guide>>i&1)continue;const g=CNT_GUIDE[i];let ok=false;try{ok=g.ok()||!!(g.skip&&g.skip());}catch(e){}
    if(ok){C.guide|=1<<i;continue;}
    let can=true;if(g.can)try{can=g.can();}catch(e){can=false;}
    if(can)return i;wait=true;}
  return wait?-2:CNT_GUIDE.length;}
const cntGuideStep=()=>{const i=gdNow();return i>=0&&i<CNT_GUIDE.length?CNT_GUIDE[i]:null;};
const cntGuideUp=()=>!!cntGuideStep();
// Starts with a new Streaming service (the tutorial's place), unless this browser has seen it.
function cntGuideStart(){if(!content()||!S.cnt)return;S.tut=null;let done=false;try{done=!!localStorage.getItem(GUIDE_KEY);}catch(e){}
  if(done||window.__TUBES_TEST__&&!window.__TUBES_TUT__)return;S.cnt.guide=0;renderCoach();}
// renderCoach() asks here first: true when the coach is the guide's.
function cntCoach(el){if(!cntGuideOn())return false;const i=gdNow(),N=CNT_GUIDE.length;
  if(i===N){S.cnt.guide=null;el.hidden=true;try{localStorage.setItem(GUIDE_KEY,'1');}catch(e){}toast(tr('streaming_story.g_done'),'goal');return true;}
  if(i<0){el.hidden=true;return true;}
  const g=CNT_GUIDE[i],c=g.go&&g.go(),here=UI.sel&&UI.sel.type==='city'&&UI.sel.id===c;
  el.innerHTML=`<div class="ct"><span class="cs">${tr('tutorial.step_n_of_total',{n:i+1,total:N})}</span>${esc(g.t)}${c&&!here?' '+btn(tr('common.show_me'),'focusCity',{city:c},'sm'):''}</div>${btn(tr('common.skip_tutorial'),'cntGuideSkip',{},'ghost sm')}`;
  el.hidden=false;coachGlow();return true;}
CNT_NEW.push(o=>{o.guide=null;});
CNT_SAN.push((c0,o)=>{const g=c0.guide;o.guide=Number.isInteger(g)&&g>=0&&g<(1<<CNT_GUIDE.length)?g:null;});
