/* ---------- traceroute and looking glass ---------- */
const slug=t=>String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'x';
function trPaths(src){const live=S.links.filter(l=>!linkDown(l)),rem=remoteCities(),ok=c=>popUp(c)||rem.includes(c),adj={};
  // Every link between two cities costs what the pair costs, as in compute(); the trace shows an active link over one on standby.
  const pw={};for(const l of live){const k=edgeKey(l);pw[k]=Math.min(pw[k]??Infinity,pairW(k,l.km));}
  for(const l of live){if(!ok(l.a)||!ok(l.b))continue;const w=pw[edgeKey(l)]+(l.standby?1e-6:0);(adj[l.a]=adj[l.a]||[]).push([l.b,l,w]);(adj[l.b]=adj[l.b]||[]).push([l.a,l,w]);}
  const dist={[src]:0},prev={},done=new Set();for(;;){let u=null,ud=Infinity;for(const k in dist)if(!done.has(k)&&dist[k]<ud){u=k;ud=dist[k];}if(u===null)break;done.add(u);for(const [v,l,w] of adj[u]||[]){const nd=ud+w;if(nd<(dist[v]??Infinity)){dist[v]=nd;prev[v]=l;}}}
  const path=dst=>{if(dist[dst]===undefined)return null;const out=[];let v=dst;while(v!==src){const l=prev[v];out.unshift({l,from:l.a===v?l.b:l.a,to:v});v=l.a===v?l.b:l.a;}return out;};return {dist,path};}
function trExits(net){const day=S.day,ev=S.ev,leak=ev.leak&&ev.leak.until>day?ev.leak.net:null,out=[];
  for(const x of S.caches)if(x.net===net&&popUp(x.city)&&!siteDown(x.city,'a'))out.push({k:'c',rank:0,city:x.city,pref:'normal',lab:tr('common.name_cache',{name:NET[net].cache.name}),used:R.useCache[x.id]||0,cap:CACHE_CAP});
  // A peer's customer cone (#85): one AS hop more, so tried after direct peering and before transit, as in compute().
  for(const p of S.pni)if(CONE_S[p.net].has(net)&&pniOn(p)&&popUp(p.city)&&liveN(p.city,p.site,p.n))out.push({k:'p',rank:p.net===net?1:CONE_RANK,via:p.net===net?null:p.net,city:p.city,pref:p.pref||'normal',lab:tr('common.pni_with_net',{net:NET[p.net].name}),used:R.usePni[p.id]||0,cap:liveCap(pniG(p),p.city,p.site,p.n)});
  for(const c in S.ixp){const ses=ixSessions(c),via=ses.has(net)?null:ANC[net].find(u=>ses.has(u))||null;if((ses.has(net)||via)&&(popUp(ixCity(c))||remoteCities().includes(ixCity(c)))&&!(ev.ixdown&&ev.ixdown[c]>day))out.push({k:'ix',rank:via?CONE_RANK:2,via,city:ixCity(c),id:c,pref:(S.ixPref&&S.ixPref[c])||'normal',lab:tr('common.ix_peering',{ix:ixName(c)}),used:R.useIx[c]||0,cap:ixCap(c)});}
  for(const t of S.transit)if(popUp(t.city)&&!(t.down>day)&&liveN(t.city,t.site,t.n)&&net!==leak&&!((ev.depeer>day||scnRule('spat'))&&t.net==='cog'&&net==='ggl'))out.push({k:'t',rank:3,city:t.city,pref:t.pref||'normal',lab:tr('traceroute.name_transit',{name:NET[t.net].name}),tnet:t.net,used:R.useT[t.id]||0,cap:liveCap(PORT[t.tier].g,t.city,t.site,t.n)});
  return out;}
// coneChain(peer,net): [peer, …, net], the shortest walk down customer links (the network's up lists, read backwards).
function coneChain(top,id){const prev={[id]:null},q=[id];while(q.length){const x=q.shift();if(x===top)break;for(const u of NET[x].up||[])if(NET[u]&&!(u in prev)){prev[u]=x;q.push(u);}}
  if(!(top in prev))return [top,id];const out=[];for(let x=top;x!==null;x=prev[x])out.push(x);return out;}
function traceroute(src,to){const P=trPaths(src),me=slug(S.name)+'.net',lines=[],ip=(a,b)=>`100.64.${a%250}.${b%250}`;let rtt=0.3,n=1;
  const hop=(host,addr,extra,note)=>{rtt+=extra;lines.push(`${String(n++).padStart(2)}  ${host} (${addr})  ${rtt.toFixed(1)} ms${note?'   ← '+note:''}`);};
  hop(`lo0.cr1.${src}.${me}`,ip(hstr(src),1),0,tr('traceroute.city_your_router',{city:CITY[src].name}));
  const walk=path=>{for(const h of path){const l=h.l,lat=linkLat(l)*2+0.15;hop(`ae${1+hstr(l.id)%9}.cr1.${h.to}.${me}`,ip(hstr(h.to),2),lat,`${CITY[h.to].name} · ${l.kind==='df'?tr('common.own_dark_fiber'):l.kind==='vxc'?tr('common.fabric_circuit'):l.cable?CAB[l.cable].name:tr('common.terrestrial_wave')} · ${capName(l)}`);}};
  if(to.city){const path=P.path(to.city);lines.unshift(`traceroute to ${to.city}.${me} (${CITY[to.city].name}), 30 hops max`);if(!path){lines.push(' 2  * * *   ← '+tr('traceroute.no_working_path_between_these_pops'));return {text:lines.join('\n'),why:tr('traceroute.no_path_every_route_between_these')};}walk(path);return {text:lines.join('\n'),why:S.te&&S.te.on?trn('traceroute.internal_path_over_n_link_chosen',path.length):trn('traceroute.internal_path_over_n_link_chosen_8620',path.length)};}
  const N=NET[to.net],ex=trExits(to.net).filter(e=>P.dist[e.city]!==undefined);
  lines.unshift(`traceroute to www.${slug(N.name)}.example (${N.name}, AS${N.asn}) from ${CITY[src].name}, 30 hops max`);
  if(!ex.length){lines.push(' 2  * * *\n 3  * * *   ← '+tr('traceroute.n_network_unreachable'));return {text:lines.join('\n'),why:tr('traceroute.nothing_on_your_network_reaches_net',{net:N.name,city:CITY[src].name}),asPath:null};}
  ex.sort((a,b)=>(a.pref==='low'?4:a.rank)-(b.pref==='low'?4:b.rank)||(a.pref==='high'?0:1)-(b.pref==='high'?0:1)||P.dist[a.city]-P.dist[b.city]);
  const e=ex.find(x=>x.used<x.cap*0.999)||ex[0];walk(P.path(e.city));
  let asPath=[S.asn];
  if(e.k==='t'){const T=NET[e.tnet];asPath.push(T.asn);hop(`be-${S.asn}.${e.city}.${slug(T.name)}.net`,`203.0.113.${hstr(e.city)%250}`,0.4,tr('traceroute.hand_off_to_net',{net:T.name}));
    if(T.id!==N.id){const far=(N.pops&&N.pops.length?N.pops:[e.city]).reduce((a,c)=>kmBetween(e.city,c)<kmBetween(e.city,a)?c:a,(N.pops||[e.city])[0]);const km=CITY[far]?kmBetween(e.city,far):0;
      hop(`ae-2.core.${far}.${slug(T.name)}.net`,`203.0.113.${(hstr(far)+7)%250}`,km*1.3/100+0.3,CITY[far]?tr('traceroute.net_carries_it_to_city',{net:T.name,city:CITY[far].name}):'');
      hop(`${slug(N.name)}-peer.${far}.${slug(T.name)}.net`,`198.51.100.${hstr(N.id)%250}`,0.4,tr('traceroute.net_hands_it_to_to',{net:T.name,to:N.name}));}}
  else if(e.k==='ix'){hop(`${slug(ixName(e.city))}.peering.${e.city}`,`185.0.${hstr(e.city)%250}.${hstr(N.id)%250}`,0.3,tr('traceroute.across_the_ix_switch',{ix:ixName(e.city)}));}
  else if(e.k==='p'){hop(`pni-${slug(NET[e.via||N.id].name)}.${e.city}.${me}`,ip(hstr(N.id),3),0.2,tr('traceroute.private_cross_connect'));}
  // Down the cone one customer at a time: the shortest chain of upstreams from the peer to the network, each AS on the path.
  if(e.via){const ch=coneChain(e.via,N.id);for(let i=0;i<ch.length-1;i++){const V=NET[ch[i]],C=NET[ch[i+1]];asPath.push(V.asn);hop(`${slug(C.name)}-cust.${e.city}.${slug(V.name)}.net`,`198.51.100.${(hstr(V.id)+3)%250}`,1.2,tr('traceroute.net_hands_it_to_its_customer',{net:V.name,to:C.name}));}}
  else{hop(`cache-${slug(N.name)}.${e.city}.${me}`,ip(hstr(N.id),4),0.1,tr('traceroute.embedded_cache_in_your_rack'));}
  asPath.push(N.asn);if(e.k!=='c')hop(`www.${slug(N.name)}.example`,`198.51.100.${(hstr(N.id)+1)%250}`,0.5+(e.k==='t'?1:0.2),`${N.name}`);
  const order=e.via?tr('traceroute.a_peer_s_customers_come_after'):{c:tr('traceroute.caches_beat_pnis'),p:tr('traceroute.pnis_beat_ix_peering'),ix:tr('traceroute.ix_peering_beats_transit'),t:tr('traceroute.transit_is_the_last_resort')}[e.k];
  const cn=cnCity(src)!==!!N.cn?' '+tr('traceroute.crossing_the_great_firewall_here',{p:S.ev.gfw>S.day?35:20}):'';
  return {text:lines.join('\n'),why:`${tr('traceroute.exit_exit_in_city',{exit:e.lab,city:CITY[e.city].name})} ${tr('traceroute.rule_and_closer_exits_win_ties',{rule:order[0].toUpperCase()+order.slice(1)})}${e.pref!=='normal'?tr('traceroute.this_one_is_set_to_mode',{mode:e.pref==='high'?tr('common.prefer'):tr('common.backup_only')}):''}.${e.used>=e.cap*0.999?' '+tr('traceroute.it_is_full_so_some_traffic'):''}${cn}`,asPath};}
function traceModal(src,to){const pops=Object.keys(S.pops).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name));src=src&&S.pops[src]?src:UI.trFrom&&S.pops[UI.trFrom]?UI.trFrom:S.home&&S.pops[S.home]?S.home:pops[0];
  const nets=NETS.slice().sort((a,b)=>b.share-a.share),t=to||UI.trTo||'net:ggl';UI.trFrom=src;UI.trTo=t;
  const r=t.startsWith('net:')?traceroute(src,{net:t.slice(4)}):traceroute(src,{city:t.slice(5)});
  openModal(`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('common.looking_glass')}</div><h2 style="font-size:26px">${tr('common.traceroute')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <div class="trsel"><label>${tr('common.from')} <select id="trFrom">${pops.map(c=>`<option value="${c}"${c===src?' selected':''}>${esc(CITY[c].name)}</option>`).join('')}</select></label>
  <label>${tr('common.to')} <select id="trTo"><optgroup label="${tr('common.networks')}">${nets.map(n=>`<option value="net:${n.id}"${t==='net:'+n.id?' selected':''}>${esc(n.name)} (AS${n.asn})</option>`).join('')}</optgroup><optgroup label="${tr('common.your_pops')}">${pops.filter(c=>c!==src).map(c=>`<option value="city:${c}"${t==='city:'+c?' selected':''}>${esc(CITY[c].name)}</option>`).join('')}</optgroup></select></label>${btn(tr('common.run'),'traceRun',{},'pink sm')}</div>
  <pre class="term">${esc(r.text)}</pre>${r.asPath?`<p class="meta">${tr('traceroute.as_path_path',{path:r.asPath.map(a=>'AS'+a).join(' → ')})}</p>`:''}<p class="note">${esc(r.why)}</p>
  <div class="btns">${btn(tr('common.copy'),'traceCopy',{},'ghost sm')}</div>`);UI.trText=r.text;}

