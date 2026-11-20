/* ---------- Hyperscaler outages (60-features/37-hyper.js) ----------
   A cloud breaks in its own ways, on top of what every network meets (and the region failures and Chaos Kong of
   38-hyper-failover.js). Only in the charter: classic failure odds and kinds stay as they were, and the rolls are hashes
   of the day (the game's random stream is untouched). Like every outage they read the chaos rule (rule M3) and wait
   for day HI_FROM (rule F1). Each is an ordinary S.inc entry, so the NOC list, the rush repair (fixInc, the player's
   answer), spicy stretching and the day tick's "resolved" work as for a cable; what one does is read back from S.inc,
   so nothing needs undoing.
   - hspow: grid trouble at a region's metro: it serves HI_POW of its room for a day or two (CX_ORG, as a power squeeze
     does in 38-hyper-power.js). Answer: truck in diesel. A region with a zone on another feed loses only that zone
     (hsAzPowF, 38-hyper-zones.js).
   - hsaz: one building of a region with zones is out (38-hyper-zones.js): it serves a zone's worth less, no failover.
   - hsstorm: a bad push makes a region re-replicate everything: its copies to its replica are HI_STORM times their
     size for a few days (hsRepX, read by hsBulk), so the backlog grows. Answer: roll back.
   - hsmelt: a game studio's launch night on a region too small for it (the launch's served share under HS_LF_OK,
     38-hyper-freeze.js): the retry storm takes the region down to HI_MELT of its room until the launch is over.
     Answer: rent a mirror cluster.
   - hsdns: Route 66 is down for a day: every tenant that bought DNS loses happiness at once, and DNS scores nothing for
     them while it lasts (hsIncNeed, read by hsNeedQ), which sours their whole bundle. Answer: roll back the zone file.
   - hscert: the TLS certificate at a front door expired: the door turns users away (hsCertOut, read by hsDoor), who go
     round to the next door, if there is one. Answer: renew it (it was free all along).
   They come after the day's routing (CX_DAY), so they show from the next evening. */
const HI_RATE=1/40,HI_FROM=45,HI_POW=0.5,HI_STORM=3,HI_MELT=0.6,HI_MELT_P=0.6,HI_DNS_MOOD=15;
const HI_T=['hspow','hsstorm','hsmelt','hsdns','hscert','hsaz'];
const HI_MSG={hspow:[N_('hyper_inc.pow_crane'),N_('hyper_inc.pow_diesel'),N_('hyper_inc.pow_kite')],
 hsstorm:[N_('hyper_inc.storm_flag'),N_('hyper_inc.storm_yaml'),N_('hyper_inc.storm_dedupe')],
 hsmelt:[N_('hyper_inc.melt_queue'),N_('hyper_inc.melt_retry')],
 hsdns:[N_('hyper_inc.dns_zone'),N_('hyper_inc.dns_ttl')],
 hscert:[N_('hyper_inc.cert_exp'),N_('hyper_inc.cert_cal')]};
const HI_PRESS=[N_('hyper_inc.press_status'),N_('hyper_inc.press_hn'),N_('hyper_inc.press_trend'),N_('hyper_inc.press_postmortem')];
const hiRoll=(k,d)=>hstr(S.asn+'|hinc|'+k+'|'+d)/4294967296;
const hiAct=(t,ref)=>S.inc.find(i=>i.type===t&&(ref===undefined||i.ref===ref)&&i.until>S.day)||null;
function hsIncTitle(t){return t==='hspow'?tr('hyper_inc.t_pow'):t==='hsstorm'?tr('hyper_inc.t_storm'):t==='hsmelt'?tr('hyper_inc.t_melt'):t==='hsdns'?tr('hyper_inc.t_dns'):t==='hscert'?tr('hyper_inc.t_cert'):t==='hsaz'?tr('hyper_az.t_inc'):'';}
// What a region can serve tonight: half in grid trouble, less while a launch melts it.
CX_ORG.push(c=>{if(!S.hs||!S.inc.length||!hyper())return 1;let m=1;for(const i of S.inc)if(i.ref===c&&i.until>S.day){if(i.type==='hspow')m*=hsAzPowF(c);else if(i.type==='hsmelt')m*=HI_MELT;}return m;});
// Hooks read by other files: a region's replication multiplier, a product's score, a front door turning users away.
function hsRepX(c){return S.inc.length&&hiAct('hsstorm',c)?HI_STORM:1;}
function hsIncNeed(id){return id==='dns'&&S.inc.length&&hiAct('hsdns')?0:1;}
function hsCertOut(c){return S.inc.length>0&&!!S.hs&&!!hiAct('hscert',c);}
function hiToast(i){const paused=pref('pauseIncident')&&autoPause(),h=hstr(i.id+'|press');
  toast(`<b>☁️ ${hsIncTitle(i.type)}</b><br>${esc(i.msg)}<br><i>📰 ${tr(HI_PRESS[h%HI_PRESS.length])}</i>${paused?`<br><b>${tr('common.game_paused')}</b>`:''}`,'bad',
    (i.cost?[{l:`${i.fix} ${fmt$(i.cost)}`,act:'fixInc',args:{id:i.id}}]:[]).concat(paused?[resumeAct()]:[]),incOpen(i));sfx('alert');}
const hiAdd=o=>{addInc(o);const i=S.inc[S.inc.length-1];S.hs.ic[o.type.slice(2)]=(S.hs.ic[o.type.slice(2)]|0)+1;return i;};
const hiMsg=(t,h,v)=>tr(HI_MSG[t][h%HI_MSG[t].length],v);
// Where each can strike today.
const hiPows=()=>hsRgs().filter(c=>!hiAct('hspow',c));
const hiStorms=()=>R.hs&&R.hs.rep?Object.keys(R.hs.rep).filter(c=>hsLive(c)&&!hiAct('hsstorm',c)).sort():[];
const hiDnsTen=()=>hsTen().filter(b=>Array.isArray(b.p)&&b.p.includes('dns'));
// A front door turns users away only where they have another to go round to (one door alone is never shut).
const hiDoors=()=>{const ds=Object.keys(S.pops).filter(c=>hsDoor(c)).sort();return ds.length>=2?ds:[];};
// Fires one outage: k 'pow', 'storm', 'dns' or 'cert' (the meltdown waits for a launch, hsMeltDay). Tests call it directly.
function hsIncFire(k,d=S.day){const H=S.hs;if(!hyper()||!H)return null;const h=hstr(S.asn+'|hincx|'+k+'|'+d);let i=null;
  if(k==='pow'){const cs=hiPows();if(!cs.length)return null;const c=cs[h%cs.length];
    // One feed's trouble: with a zone on another feed, the region loses only that zone (38-hyper-zones.js).
    hsAzLocal(c);const az=hsAzHold(c);
    i=hiAdd({type:'hspow',ref:c,until:d+1+(h>>>4)%2,msg:az?tr('hyper_az.pow_msg',{city:CITY[c].name,util:tr(hsUtil(c)),zone:hsAzWho(c),p:pct(hsAzLossF(c))}):hiMsg('hspow',h>>>8,{city:CITY[c].name,util:tr(hsUtil(c))}),cost:Math.max(20000,HS_T[H.rg[c].t].mo),fix:tr('hyper_inc.fix_pow')});}
  else if(k==='storm'){const cs=hiStorms();if(!cs.length)return null;const c=cs[h%cs.length],b=R.hs.rep[c].b;
    i=hiAdd({type:'hsstorm',ref:c,until:d+3+(h>>>4)%3,msg:hiMsg('hsstorm',h>>>8,{city:CITY[c].name,b:CITY[b].name,x:HI_STORM}),cost:25000,fix:tr('hyper_inc.fix_storm')});}
  else if(k==='dns'){const ts=hiDnsTen();if(!ts.length||hiAct('hsdns'))return null;for(const b of ts)b.mood=Math.max(1,(b.mood===undefined?70:b.mood)-HI_DNS_MOOD);
    i=hiAdd({type:'hsdns',ref:'route66',until:d+1,msg:hiMsg('hsdns',h>>>8,{n:ts.length}),cost:15000,fix:tr('hyper_inc.fix_dns')});}
  else if(k==='cert'){const cs=hiDoors().filter(c=>!hiAct('hscert',c));if(!cs.length)return null;const c=cs[h%cs.length];
    i=hiAdd({type:'hscert',ref:c,until:d+1+(h>>>4)%2,msg:hiMsg('hscert',h>>>8,{city:CITY[c].name}),cost:500,fix:tr('hyper_inc.fix_cert')});}
  if(i)hiToast(i);return i;}
/* A launch night on a region too small for it: the studio's traffic was not all served tonight, and the dice say the
   retry storm wins (HI_MELT_P times the chaos multiplier). The region melts until the launch is over. */
function hsMeltDay(d,cm){const L=hsLf();if(!L||!hsLfOn(L)||!R.hs)return null;const b=S.biz.find(x=>x.id===L.id&&x.type==='cloud'),T=b&&R.hs.ten[b.id];if(!T||!T.r||hiAct('hsmelt',T.r))return null;
  if(hsLfServed(R,b)>=HS_LF_OK||hiRoll('melt|'+T.r,d)>=Math.min(1,HI_MELT_P*cm))return null;const h=hstr(S.asn+'|meltm|'+T.r+d);
  const i=hiAdd({type:'hsmelt',ref:T.r,until:L.until,msg:hiMsg('hsmelt',h,{game:HS_GAMES[L.g],name:b.name,city:CITY[T.r].name}),cost:Math.max(50000,2*HS_T[S.hs.rg[T.r]?S.hs.rg[T.r].t:0].mo),fix:tr('hyper_inc.fix_melt')});
  i.until=L.until;// it ends with the launch, however spicy the night (stretchInc)
  hiToast(i);return i;}
// A day of cloud outages, after the routing.
function hsIncDay(d){const H=S.hs;if(!H||!hyper()||!R.hs)return;const cm=chaosMul();if(!cm||d<HI_FROM)return;
  hsMeltDay(d,cm);
  if(hiRoll('rate',d)>=HI_RATE*cm)return;
  // An outage is a crisis: the director (38-hyper-director.js) says whether one may start today.
  if(!hsDirAsk('inc',1))return;
  const ks=[];if(hiPows().length)ks.push('pow');if(hiStorms().length)ks.push('storm');if(hiDnsTen().length&&!hiAct('hsdns'))ks.push('dns');if(hiDoors().length)ks.push('cert');
  if(ks.length)hsIncFire(ks[hstr(S.asn+'|hinck|'+d)%ks.length],d);}
CX_DAY.push(hsIncDay);
CX_NEW.push(o=>{o.ic={pow:0,storm:0,melt:0,dns:0,cert:0};});
// Saves: the counters, and only cloud outages that point at a real region (or front door).
CX_SAN.push((h0,o,s)=>{const x=h0.ic&&typeof h0.ic==='object'&&!Array.isArray(h0.ic)?h0.ic:{},n=k=>Math.max(0,Math.round(Number.isFinite(+x[k])?+x[k]:0));o.ic={pow:n('pow'),storm:n('storm'),melt:n('melt'),dns:n('dns'),cert:n('cert')};
  if(Array.isArray(s.inc))s.inc=s.inc.filter(i=>!i||!HI_T.includes(i.type)||(i.type==='hsdns'?i.ref==='route66':i.type==='hscert'?isCity(i.ref)&&!!s.pops[i.ref]:typeof i.ref==='string'&&own(o.rg,i.ref)));});
// The city's Cloud tab: an outage here, with its answer, as a folding section flagged down (55-hyper-panel.js).
function hsIncSpec(c){if(!hyper()||!S.hs)return null;const i=S.inc.filter(x=>HI_T.includes(x.type)&&x.ref===c&&x.until>S.day).sort((a,b)=>b.until-a.until)[0];if(!i)return null;
  return {t:`☁️ ${hsIncTitle(i.type)}`,sum:tr('hyper_inc.until_date',{date:dateStr(i.until)}),flags:[i.type==='hsaz'?['selective',tr('hyper_az.f_zone')]:['restrictive',tr('hyper_ui.f_down')]],
    body:()=>`<p class="meta">${esc(i.msg)}</p>${i.cost?`<div class="btns">${btn(`${esc(i.fix)} ${fmt$(i.cost)}`,'fixInc',{id:i.id},'red sm',S.cash<i.cost)}</div>`:''}`};}
// The charter card's alert list: Route 66 down (it has no city of its own), worst first.
function hsIncAlerts(){if(!hyper()||!S.hs)return [];const i=hiAct('hsdns');if(!i)return [];
  return [{lv:0,h:`☁️ ${tr('hyper_inc.card_dns',{n:hiDnsTen().length,date:dateStr(i.until)})}<div class="btns">${btn(`${esc(i.fix)} ${fmt$(i.cost)}`,'fixInc',{id:i.id},'red sm',S.cash<i.cost)}</div>`}];}
