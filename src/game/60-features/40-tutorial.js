/* ---------- guided first game ---------- */
/* sel: where the pink glow goes, most specific first; the first one that is on screen wins (the phone and desktop
   each hide the other's buttons). no(el): skip that button while a better one is on screen. idle(): done, waiting: no glow. */
const TUT=[
 {t:tr('tutorial.your_router_is_live_press_launch'),sel:['[data-act="launchBB"]'],ok:()=>S.pops[S.home]&&S.pops[S.home].bb},
 {t:tr('tutorial.your_customers_want_the_whole'),sel:['[data-act="buyTransit"]','[data-act="tab"][data-args*=\'"up"\']'],ok:()=>S.transit.length>0,skip:()=>!NETS.some(n=>sellsAt(n,S.home))},
 // DE-KICKS ports are "price on request": a first-timer is better off on a challenger with a price list.
 {t:tr('tutorial.transit_costs_money_per_gigabit'),sel:['[data-act="rs"]','[data-act="buyIx"]','[data-act="tab"][data-args*=\'"peer"\']'],no:b=>b.dataset.act==='buyIx'&&tutDk(b),ok:()=>Object.keys(S.rs).length>0,skip:()=>modeOn('outcast')||!ixName(S.home)},
 {t:tr('tutorial.the_clock_runs_at_half_speed'),sel:['#sp1','[data-act="phoneSpeed"]'],idle:()=>UI.speed>=1,ok:()=>S.day>=5},
 {t:tr('tutorial.grow_lay_fiber_to_a_nearby_city'),sel:['[data-act="findLink"]','#panel [data-act="tab"][data-args*=\'"links"\']'],ok:()=>S.links.length>0},
 {t:tr('tutorial.businesses_pop_up_as_bubbles_on'),sel:['#left [data-act="accept"]','[data-act="leftTab"][data-args*=\'"deals"\']','[data-act="phoneTab"][data-args*=\'"deals"\']'],ok:()=>S.biz.length>0},
];
let coachT=null;
const tutDk=b=>{try{return isDk(JSON.parse(b.dataset.args).city);}catch(e){return false;}};
function tutorialStart(){let done=false;try{done=!!localStorage.getItem('sot-tut');}catch(e){}if(done||window.__TUBES_TEST__&&!window.__TUBES_TUT__)return;S.tut=0;renderCoach();}
function renderCoach(){const el=$('coach');if(!el)return;document.querySelectorAll('.coach-glow').forEach(x=>x.classList.remove('coach-glow'));
  if(S&&hsCoach(el))return;
  if(!S||S.tut===undefined||S.tut===null||S.lost){el.hidden=true;return;}
  while(S.tut<TUT.length){const st=TUT[S.tut];let ok=false;try{ok=st.ok()||(st.skip&&st.skip());}catch(e){}if(!ok)break;S.tut++;}
  if(S.tut>=TUT.length){S.tut=null;el.hidden=true;try{localStorage.setItem('sot-tut','1');}catch(e){}toast(tr('tutorial.you_know_the_basics_your_goals'),'goal');return;}
  const st=TUT[S.tut];el.innerHTML=`<div class="ct"><span class="cs">${tr('tutorial.step_n_of_total',{n:S.tut+1,total:TUT.length})}</span>${esc(st.t)}</div>${btn(tr('common.skip_tutorial'),'tutSkip',{},'ghost sm')}`;el.hidden=false;coachGlow();}
/* The glow follows the UI: re-rendering a panel drops the class, so renderLeft and renderPanel call this again. Only
   while the tutorial runs. A glowing button scrolled out of its panel is brought into view, once per button. */
function coachGlow(){document.querySelectorAll('.coach-glow').forEach(x=>x.classList.remove('coach-glow'));
  const st=S&&(S.tut!=null?TUT[S.tut]:hsGuideStep());if(!st||!st.sel||$('coach').hidden||st.idle&&st.idle())return;
  // Passes: on screen and not skipped, then loosened (a page without layout, like the tests', has nothing "on screen").
  let t=null;for(const [v,n] of [[1,1],[0,1],[1,0],[0,0]])for(const q of st.sel){if(t)break;for(const x of document.querySelectorAll(q))if((!v||x.getClientRects().length)&&!(n&&st.no&&st.no(x))){t=x;break;}}
  if(!t)return;t.classList.add('coach-glow');if(coachT===t)return;coachT=t;
  const sc=t.closest('.scroll,#leftBody');if(sc){const r=t.getBoundingClientRect(),q=sc.getBoundingClientRect();if(r.top<q.top||r.bottom>q.bottom)sc.scrollTop+=r.top-q.top-q.height/3;}}
