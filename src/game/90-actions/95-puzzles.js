// Can a wave of this size be lit between a and b here? Router ports and models as in the main game; a city without a
// POP yet will get a Rusty Router.
function pzWaveWhy(a,b,tier,r){if(r&&subWaveWhy(tier,r.km,r.sub))return tr('common.too_far_for_this_cable');if(!S.ar&&!waveOk(a,b,tier))return tr('puzzles.needs_what',{what:waveNeed(tier)});return '';}
const pzPortsFree=c=>!S.pops[c]||portsUsed(c)+1<=portsMax(c)+1e-9;
Object.assign(ACT,{
 // The chaos monkey acts out the N-1 check, or is told to get on with it.
 pzMonkey:()=>{if(pzOn()&&pzEval().goal)pzMonkey();},
 pzMkSkip:()=>{if(pzOn())pzMkSkip();},
 // The puzzle list. The ruleset's title-screen door calls this.
 puzzleMenu:()=>{if(S&&UI.started&&!pzOn())UI.nm=S.name;pzMenu();},
 pzStart:({id})=>{const d=pzDef(id);if(!d||!pzPackOpen(d.pack))return;pzBegin(d);},
 pzWeekly:()=>{if(pzWkLoading())return;pzBegin(pzWkDef());},
 pzFinish:()=>{if(!pzOn())return;if(S.ar){arResults(false);return;}const e=pzEval();if(e.stars)pzResults(e,e.stars);},
 pzRetry:()=>{if(!pzOn())return;if(S.ar){arBegin(arRun());return;}pzBegin(S.pz.id==='weekly'?pzWkDef():pzDef(S.pz.id));},
 pzLeave:()=>{if(pzOn())pzLeave();},
 pzPop:({city})=>{if(!pzOn()||S.pops[city]||!['goal','via','off'].includes(pzKind(city)))return;pzSnap();S.pops[city]=pzNewPop(city);sfx('build');haptic(10);floater(CITY[city].x,CITY[city].y-30,tr('common.new_pop'),'#FF4F9A');pzAfter();},
 pzRmPop:({city})=>{if(!pzOn()||!S.pops[city]||(S.ar&&city===S.ar.hq))return;pzSnap();if(S.ar)arSink([city],S.links.filter(l=>l.a===city||l.b===city));delete S.pops[city];S.links=S.links.filter(l=>l.a!==city&&l.b!==city);prunePairMet();sfx('click');UI.sel=null;pzAfter();},
 pzLinkTo:({a,b})=>{if(!pzOn()||!S.pops[a]||a===b)return;pzLinkModal(a,b);},
 pzVia:({v})=>{const p=UI.pending;if(!pzOn()||!p)return;UI.pzVia=v;pzLinkModal(p.a,p.b,true);},
 pzDiv:({v})=>{const p=UI.pending;if(!pzOn()||!p)return;UI.pzDiv=!!+v;pzLinkModal(p.a,p.b,true);},
 pzLink:({tier})=>{tier=+tier;const p=UI.pending;if(!pzOn()||!p||!(S.ar?AR_TIERS:PZ_TIERS).includes(tier))return;const {a,b}=p,kb=pzKind(b);if(!S.pops[a]||!['goal','via','off'].includes(kb))return;
   const r=pzRoutes(a,b).find(x=>x.via===UI.pzVia);if(!r||(S.pz.noSub&&r.sub))return;
   const why=pzWaveWhy(a,b,tier,r);if(why){toast(esc(why),'bad');sfx('err');return;}
   if(!S.ar&&(!portGate(a,1)||(S.pops[b]&&!portGate(b,1))))return;
   // Overland: the same trench as a link already on the pair (the one picked from, or the first), or a diverse route
   // of its own. Every trench but the first runs the long way round and costs 40% more.
   const lands=pzOn()&&!r.sub?S.links.filter(l=>edgeKey(l)===edgeKey({a,b})&&!l.cable):[],t0=lands.length?pzUnit(lands[0]):null;
   const same=UI.pzDiv===false&&lands.length?(lands.find(l=>pzUnit(l)===UI.pzTrench)||lands[0]):null,trench=same?pzUnit(same):null,div=!!t0&&trench!==t0;
   pzSnap();if(!S.pops[b])S.pops[b]=pzNewPop(b);const id=uid(),f=r.f*(div?DIVERSE:1);
   S.links.push({id,a,b,kind:'wave',border:false,premium:false,tier,km:r.km,sub:r.sub,cable:r.cab,mo:pzMo(r,tier,div),mult:f,trench:r.cab?'cab:'+r.cab:trench||id,cut:0,day:0,br:S.ar?S.ar.bi:0});
   closeModal();sfx('build');haptic(12);floater((CITY[a].x+CITY[a].x+wrapDx(CITY[a].x,CITY[b].x))/2,(CITY[a].y+CITY[b].y)/2-20,S.ar?tr('architect.tube_laid'):tr('links.wave_lit',{wave:LT[tier].n}),'#FF4F9A');UI.sel=null;pzAfter();},
 // Another link next to this one: the picker opens on the same pair, on the same route, in the same trench or a diverse one.
 pzAddPar:({id,div})=>{const l=pzOn()&&S.links.find(x=>x.id===id);if(!l)return;UI.pzVia=l.cable||'land';UI.pzDiv=!!+div;UI.pzTrench=l.cable?null:pzUnit(l);
   if(+div&&l.cable){const o=pzRoutes(l.a,l.b).find(x=>x.via!==l.cable&&!(S.pz.noSub&&x.sub));if(o)UI.pzVia=o.via;}
   pzLinkModal(l.a,l.b,true);},
 pzTier:({id,tier})=>{tier=+tier;const l=pzOn()&&S.links.find(x=>x.id===id);if(!l||!(S.ar?AR_TIERS:PZ_TIERS).includes(tier)||l.tier===tier)return;const why=pzWaveWhy(l.a,l.b,tier,{km:l.km,sub:l.sub});if(why){toast(esc(why),'bad');sfx('err');return;}
   pzSnap();if(S.ar){if(arAge(l)<S.ar.bi)S.ar.sunk+=arLinkCost(l);l.ub=S.ar.bi;}l.tier=tier;l.mo=pzMo({km:l.km,sub:l.sub,f:l.mult||1},tier,false);sfx('build');pzAfter();},
 pzRmLink:({id})=>{if(!pzOn()||!S.links.some(l=>l.id===id))return;pzSnap();if(S.ar)arSink([],S.links.filter(l=>l.id===id));S.links=S.links.filter(l=>l.id!==id);prunePairMet();sfx('click');UI.sel=null;pzAfter();},
 // Routers: one more of the same model, one fewer, or every router in the POP swapped for another model.
 pzRtAdd:({city})=>{const p=pzOn()&&!S.ar&&S.pops[city];if(!p||(p.routers||1)>=RMAX)return;pzSnap();p.routers=(p.routers||1)+1;sfx('build');floater(CITY[city].x,CITY[city].y-30,tr('common.router_added'),'#FF4F9A');pzAfter();},
 pzRtRm:({city})=>{const p=pzOn()&&!S.ar&&S.pops[city];if(!p||(p.routers||1)<=1)return;if(portsUsed(city)>portsMax(city,undefined,p.routers-1)){toast(tr('routing_and_routers.unplug_something_first_used_ports',{used:fmtPorts(portsUsed(city)),max:portsMax(city,undefined,p.routers-1)}),'bad');sfx('err');return;}
   pzSnap();p.routers--;sfx('click');pzAfter();},
 pzRtModel:({city,g})=>{g=+g;const p=pzOn()&&!S.ar&&S.pops[city];if(!p||!PZ_RG.includes(g)||g===(p.rgen||0))return;const why=modelFits(city,g);if(why){toast(tr('routing_and_routers.the_model_won_t_fit_why',{model:esc(RG[g].n),why:esc(why)}),'bad');sfx('err');return;}
   pzSnap();p.rgen=g;sfx('build');floater(CITY[city].x,CITY[city].y-30,RG[g].n+'!','#FF4F9A');pzAfter();},
 // A circuit follows the metrics (the IGP's shortest path) or takes the lowest-latency path, as customers can in the main game.
 pzRoute:({i,m})=>{const b=pzOn()&&S.biz.find(x=>x.id===pzFlowId(+i));if(!b||!['normal','fast'].includes(m)||b.route===m)return;pzSnap();b.route=m;sfx('click');pzAfter();},
 pzUndo:()=>{const h=UI.pzHist;if(!pzOn()||!h||!h.length)return;if(S.ar)arStop(true);const o=JSON.parse(h.pop());S.pops=o.p;S.links=o.l;S.pairMet=o.m||{};if(S.ar){S.ar.sunk=o.k||0;arDemand();}(o.r||[]).forEach((m,i)=>{if(S.biz[i])S.biz[i].route=m;});sfx('click');pzAfter();},
 pzReset:()=>{if(!pzOn())return;pzSnap();if(S.ar){arReset();sfx('click');pzAfter();return;}S.pops={};S.links=[];S.pairMet={};for(const b of S.biz)b.route='normal';UI.sel=null;sfx('click');pzAfter();},
 pzShare:()=>{if(!pzOn())return;const t=S.ar?arShareText(arStars(arSpend()),arSpend()):pzShareText(pzEval());
   const copied=()=>toast(tr('puzzles.copied_paste_it_anywhere',{t:esc(t)}),'good'),copy=()=>{try{navigator.clipboard.writeText(t).then(copied,()=>toast(esc(t),''));}catch(e){toast(esc(t),'');}};
   if(navigator.share&&isPhone()){navigator.share({text:t}).catch(()=>{});return;}copy();track('puzzle_share');},
});
// A puzzle is its own S: a leftover main-game button (an old toast, a stale panel, a shortcut) must not build, buy or
// open anything in it. Everything but these and the pz* actions does nothing while a puzzle is on. The main game's
// routing controls (metric, standby, the redundancy check) work in a puzzle too, and their changes can be undone.
// This file is the last of the actions, so every one is here to wrap.
const PZ_ACTS=new Set(['animSet','closeModal','closePanel','help','helpClose','install','keepPlaying','langSet','linkCheck','menu','metricMode','metricSet','mute','prefSet','puzzleDoor','puzzleMenu','selLink','setMetric','setStandby','settings','settingsClose','soundSet','speed','updateLater','updateNow','vpSet','whatsNewShow']);
const PZ_UNDO=new Set(['metricMode','metricSet','setMetric','setStandby']);
for(const k of Object.keys(ACT)){const f=ACT[k];if(PZ_UNDO.has(k))ACT[k]=a=>{if(pzOn())pzSnap();return f(a);};else if(!PZ_ACTS.has(k)&&!/^pz[A-Z]/.test(k))ACT[k]=a=>pzOn()?undefined:f(a);}
