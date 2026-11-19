/* ---------- Streaming outages (60-features/37-streaming.js) ----------
   A Streaming service breaks in its own ways, on top of the cuts and crashes every network has. Like every outage they
   read the chaos rule (chaosMul(): none never, calm rarely, spicy often; rule M3) and wait for day CINC_FROM (rule F1).
   Each is an ordinary S.inc entry, so the NOC list, the rush repair (fixInc), spicy stretching and the day tick's
   "resolved" work as for a cable; what one does is read back from S.inc (CNT_ORG, the fill clamp), so nothing needs undoing.
   - cntorg: an origin goes dark for a day or two; its countries fall back to the next origin, or go short.
   - cntpush: a bad cache push empties every Binge Box on one continent; they cannot refill until it is rolled back.
   - cntmelt: a live event's first night on an origin too small for it: half its room until the event is over.
   They come after the day's routing (CNT_DAY), so they show from the next evening. Rolls are hashes of the day, so a
   game's random stream is untouched. */
const CINC_RATE=1/50,CINC_FROM=45,CINC_PUSH=0.1,CINC_MELT=0.5,CINC_MELT_P=0.6;
const CINC=['cntorg','cntpush','cntmelt'];
const ORG_MSG=[N_('streaming_inc.org_updates'),N_('streaming_inc.org_squirrel'),N_('streaming_inc.org_master'),N_('streaming_inc.org_thumbs')];
const PUSH_MSG=[N_('streaming_inc.push_fireplace'),N_('streaming_inc.push_slash'),N_('streaming_inc.push_cooking')];
const MELT_MSG=[N_('streaming_inc.melt_sprinklers'),N_('streaming_inc.melt_pizza')];
const PRESS_MSG=[N_('streaming_inc.press_trend'),N_('streaming_inc.press_spinner'),N_('streaming_inc.press_grandma'),N_('streaming_inc.press_refund')];
// A roll in [0,1) from the day: the same game rolls the same way, and Math.random is left alone.
const cRoll=(k,d)=>hstr(S.asn+'|'+k+'|'+d)/4294967296;
const cIncOn=(t,ref)=>S.inc.find(i=>i.type===t&&i.ref===ref&&i.until>S.day)||null;
// What an origin can serve tonight: nothing while it is dark, half while it melts.
CNT_ORG.push(c=>!S.inc.length?1:cIncOn('cntorg',c)?0:cIncOn('cntmelt',c)?CINC_MELT:1);
function cntIncTitle(t){return t==='cntorg'?tr('streaming_inc.t_org'):t==='cntpush'?tr('streaming_inc.t_push'):t==='cntmelt'?tr('streaming_inc.t_melt'):'';}
CNT_NEW.push(o=>{o.ic={org:0,push:0,melt:0};});
// Saves: the counters, and only streaming incidents that point at a real origin (or a city and a continent).
CNT_SAN.push((c0,o,s)=>{const x=c0.ic&&typeof c0.ic==='object'?c0.ic:{},n=k=>Math.max(0,Math.round(Number.isFinite(+x[k])?+x[k]:0));o.ic={org:n('org'),push:n('push'),melt:n('melt')};
  s.inc=s.inc.filter(i=>!CINC.includes(i.type)||(i.type==='cntpush'?isCity(i.ref)&&own(REG,i.reg):!!o.dc[i.ref]));});
function cIncToast(i,acts=[]){const paused=pref('pauseIncident')&&autoPause(),h=hstr(i.id+'|press');
  toast(`<b>📺 ${cntIncTitle(i.type)}</b><br>${esc(i.msg)}<br><i>${tr(PRESS_MSG[h%PRESS_MSG.length])}</i>${paused?`<br><b>${tr('common.game_paused')}</b>`:''}`,'bad',
    (i.cost?[{l:`${i.fix} ${fmt$(i.cost)}`,act:'fixInc',args:{id:i.id}}]:[]).concat(acts,paused?[resumeAct()]:[]),incOpen(i));sfx('alert');}
const cIncAdd=o=>{addInc(o);return S.inc[S.inc.length-1];};
// The origins that can go dark, and the continents with boxes a push can empty.
const cOrgs=()=>Object.keys(S.cnt.dc).filter(o=>dcLive(o)&&popUp(o)&&!cIncOn('cntorg',o)).sort();
const cPushRegs=()=>[...new Set(S.cnt.box.filter(b=>S.pops[b.city]).map(b=>CITY[b.city].reg))].filter(r=>!S.inc.some(i=>i.type==='cntpush'&&i.reg===r&&i.until>S.day)).sort();
// Fires one streaming outage ('org' or 'push'); tests call it directly. Returns the incident, or null.
function cntIncFire(k,d=S.day){const C=S.cnt;if(!content()||!C)return null;const h=hstr(S.asn+'|cincx|'+d);
  if(k==='org'){const os=cOrgs();if(!os.length)return null;const o=os[h%os.length],T=DC_T[C.dc[o].t];
    const i=cIncAdd({type:'cntorg',ref:o,until:d+1+(h>>>4)%2,msg:tr(ORG_MSG[(h>>>8)%ORG_MSG.length],{city:CITY[o].name}),cost:Math.max(5000,T.mo),fix:tr('streaming_inc.fix_org')},'');
    C.ic.org++;cIncToast(i);return i;}
  if(k==='push'){const rs=cPushRegs();if(!rs.length)return null;const reg=rs[h%rs.length],bs=C.box.filter(b=>S.pops[b.city]&&CITY[b.city].reg===reg);
    for(const b of bs)b.f=Math.min(b.f,CINC_PUSH);
    const i=cIncAdd({type:'cntpush',ref:bs[0].city,reg,until:d+2,msg:tr(PUSH_MSG[(h>>>8)%PUSH_MSG.length],{reg:REG[reg]}),cost:2000+500*bs.length,fix:tr('streaming_inc.fix_push')},'');
    C.ic.push++;cIncToast(i);return i;}
  return null;}
/* The live event's first night: an origin that ran full while demand went unserved may melt (CINC_MELT_P times the
   chaos multiplier). Half its room until the last night; renting a mirror cluster (the rush repair) ends it. */
function cntMeltDay(d,cm){const C=S.cnt,r=R&&R.cnt;if(!r||!(r.short>0.5))return 0;let n=0;
  const nights=C.evs.filter(e=>e.day===d).map(e=>[evName(e),e.day+EV_DAYS]),p=C.prem;if(p&&p.live&&p.day===d)nights.push([premShow(p),p.day+PREM_DAYS]);
  for(const [show,end] of nights)for(const o of Object.keys(r.org).sort()){if(!C.dc[o]||cIncOn('cntmelt',o)||cIncOn('cntorg',o))continue;const room=dcRoom(o);
    if(!(room>0)||r.org[o]<room*0.98||cRoll('melt|'+o,d)>=Math.min(1,CINC_MELT_P*cm))continue;const T=DC_T[C.dc[o].t],h=hstr(S.asn+'|meltm|'+o+d);
    const i=cIncAdd({type:'cntmelt',ref:o,until:end,msg:tr(MELT_MSG[h%MELT_MSG.length],{show,city:CITY[o].name}),cost:Math.max(20000,T.mo*2),fix:tr('streaming_inc.fix_melt')},'');
    i.until=end;// it ends with the event, however spicy the night (stretchInc)
    C.ic.melt++;n++;cIncToast(i);}
  return n;}
// A day of streaming outages, after the routing (CNT_DAY).
function cntIncDay(d){const C=S.cnt;
  // A push not yet rolled back pushes again every night: the boxes it emptied stay empty.
  for(const i of S.inc)if(i.type==='cntpush'&&i.until>d)for(const b of C.box)if(CITY[b.city].reg===i.reg)b.f=Math.min(b.f,CINC_PUSH);
  const cm=chaosMul();if(!cm||d<CINC_FROM||!Object.keys(C.cc).length)return;
  cntMeltDay(d,cm);
  if(cRoll('cinc',d)>=CINC_RATE*cm)return;
  const ks=[];if(cOrgs().length)ks.push('org');if(cPushRegs().length)ks.push('push');if(ks.length)cntIncFire(ks[hstr(S.asn+'|cinck|'+d)%ks.length],d);}
CNT_DAY.push(cntIncDay);
// The city's Streaming tab says when its origin is dark or melting, with the rush repair.
CNT_CITY.push(c=>{const i=S.cnt&&S.cnt.dc[c]&&(cIncOn('cntorg',c)||cIncOn('cntmelt',c));if(!i)return '';
  return `<section><p class="why">📺 <b>${cntIncTitle(i.type)}</b> · ${tr('streaming_inc.until_date',{date:dateStr(i.until)})}</p><p class="meta">${esc(i.msg)}</p>${i.cost?`<div class="btns">${btn(`${esc(i.fix)} ${fmt$(i.cost)}`,'fixInc',{id:i.id},'red sm',S.cash<i.cost)}</div>`:''}</section>`;});
