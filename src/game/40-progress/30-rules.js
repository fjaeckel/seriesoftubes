/* ---------- The ruleset: one game, many doors ----------
   Every network carries its own rules (S.rules), picked when it starts and locked from then on. Modes are presets of
   these rules, not separate code: Normal comes as Change Freeze, On-call (the classic game) and BGP at 3 a.m.;
   Sandbox and Puzzles are presets too. Saves without rules load as On-call, so nothing changes for them.
   Scenarios and the weekly challenge run on On-call plus their own S.scn.rules (scnRule()). */
const RULE_DEF={clock:true,chaos:'normal',lead:'real',market:true,money:'normal',gates:'ladder',mods:[]};
const RULE_OK={clock:[true,false],chaos:['none','calm','normal','spicy'],lead:['real','quick'],market:[true,false],money:['normal','infinite'],gates:['ladder','open']};
// i: icon, n: name, d: the one-line joke, x: what is different, in small print.
const PRESETS={
 freeze:{i:'🧊',n:tr('rules.change_freeze'),d:tr('rules.nobody_touches_prod_even_the_backhoes'),x:tr('rules.a_third_of_the_outages_no_ddos_pnis'),clock:true,chaos:'calm',lead:'quick',market:false,money:'normal',gates:'ladder'},
 oncall:{i:'📟',n:tr('rules.on_call'),d:tr('rules.the_real_thing_your_pager_has'),x:tr('rules.real_lead_times_real_outages_a_real'),clock:true,chaos:'normal',lead:'real',market:true,money:'normal',gates:'ladder'},
 bgp:{i:'🔥',n:tr('rules.bgp_at_3_a_m'),d:tr('rules.everything_is_on_fire_and_it'),x:tr('rules.more_and_longer_outages_more_ddos'),clock:true,chaos:'spicy',lead:'real',market:true,money:'normal',gates:'ladder'},
 sandbox:{i:'🏖️',n:tr('common.sandbox'),d:tr('rules.a_billion_dollars_every_unlock_your'),x:tr('rules.infinite_money_everything_unlocked_quick'),clock:true,chaos:'none',lead:'quick',market:true,money:'infinite',gates:'open'},
 puzzle:{i:'🧩',n:tr('rules.puzzle'),d:tr('rules.one_small_network_one_tricky_goal'),x:tr('rules.no_clock_no_bills_nothing_breaks'),clock:false,chaos:'none',lead:'quick',market:false,money:'normal',gates:'open'},
};
const NORMAL_PRESETS=['freeze','oncall','bgp'];
// How often things break, against the classic game. Spicy outages also last half as long again.
const CHAOS={none:{i:'😴',n:tr('rules.chaos_none'),d:tr('rules.nothing_ever_breaks'),m:0},calm:{i:'🧊',n:tr('rules.chaos_calm'),d:tr('rules.a_cut_now_and_then'),m:0.35},normal:{i:'📟',n:tr('rules.chaos_normal'),d:tr('rules.like_the_real_game'),m:1},spicy:{i:'🔥',n:tr('rules.chaos_spicy'),d:tr('rules.your_pager_never_sleeps'),m:1.8}};
const SPICY_LONG=1.5,LEAD_QUICK=10;
function rule(k){const r=S&&S.rules;return r&&r[k]!==undefined?r[k]:RULE_DEF[k];}
function rulePreset(){const p=S&&S.rules&&S.rules.preset;return p&&Object.prototype.hasOwnProperty.call(PRESETS,p)?p:'oncall';}
function gatesOpen(){return rule('gates')==='open';}
function chaosMul(){const c=CHAOS[rule('chaos')];return c?c.m:1;}
// Days until something ordered arrives: as quoted, or a tenth of it (at least a day) with quick lead times.
function leadDays(n){return rule('lead')==='quick'?Math.max(1,Math.round(n/LEAD_QUICK)):n;}
// A fresh, valid rules object: the preset's values, with any valid overrides on top.
function makeRules(preset,o){const p=Object.prototype.hasOwnProperty.call(PRESETS,preset)?preset:'oncall',P=PRESETS[p],r={preset:p};o=o&&typeof o==='object'?o:{};
  for(const k of Object.keys(RULE_OK)){const d=P[k]!==undefined?P[k]:RULE_DEF[k];r[k]=RULE_OK[k].includes(o[k])?o[k]:d;}
  r.mods=Array.isArray(o.mods)?[...new Set(o.mods.filter(m=>typeof m==='string'&&/^[a-z0-9_-]{1,24}$/.test(m)))].slice(0,16):[];
  return r;}
// What the HUD and the share card say about the rules. On-call says nothing: it is the game.
function ruleTag(){const p=rulePreset();if(S&&S.mode==='sandbox'){const c=CHAOS[rule('chaos')];return tr('common.sandbox')+(c&&rule('chaos')!=='none'?' '+c.i:'');}
  return p==='oncall'||p==='sandbox'?'':PRESETS[p].i+' '+PRESETS[p].n;}
/* Spicy outages last longer: stretch a fresh incident by half, and exactly what it holds down (found by its ref, as
   clearInc() finds it), never something else that happens to end the same day. */
function stretchInc(i){if(rule('chaos')!=='spicy'||!i||!(i.until>S.day)||i.start!==S.day)return;const U=i.until,V=S.day+Math.ceil((U-S.day)*SPICY_LONG);if(V===U)return;i.until=V;
  const f=(o,k)=>{if(o&&o[k]===U)o[k]=V;},E=S.ev,T=i.type,r=i.ref,L=()=>S.links.find(l=>l.id===r);
  if(T==='cut'||T==='redsea'){for(const l of S.links)if((l.trench||l.id)===r)f(l,'cut');}
  else if(T==='fatwave'||T==='label')f(L(),'cut');
  else if(T==='ctrlplane'){for(const id of Array.isArray(i.links)?i.links:[])f(S.links.find(l=>l.id===id),'cut');}
  else if(T==='amp'||T==='roadmff')f(L(),'eqDown');else if(T==='mtu')f(L(),'deg');else if(T==='loss')f(L()?.loss,'until');else if(T==='optic')f(L()?.chFail,'until');
  else if(['crash','power','oops','cleaner','maint','shutdown'].includes(T))f(S.pops[r],'down');
  else if(T==='ring')f(S.pops[r],'ringcut');else if(T==='ac')f(S.pops[r],'hot');
  else if(T==='transit'||T==='prepend')f(S.transit.find(t=>t.id===r),'down');
  else if(T==='ixloop'&&E.ixdown)f(E.ixdown,r);else if(T==='fabric'&&E.fab)f(E.fab,r);
  else if(T==='lacp'){const [k,...x]=String(r).split(':'),id=x.join(':');f(k==='ix'?E.ixlacp&&E.ixlacp[id]:(k==='t'?S.transit:S.pni).find(o=>o.id===id)?.lacp,'until');}
  else if(T==='rpki'||T==='hijack')f(E.rpki,'until');else if(T==='leak'||T==='pmtud')f(E[T],'until');else if(T==='krroute'||T==='depeer')f(E,T);
  else if(T==='ddos')f(ddosAll(S,false).find(a=>a.id===i.atk),'until');}
