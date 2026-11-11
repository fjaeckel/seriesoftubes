/* ---------- connections overview (#31, #33, #38) ----------
   Every transit port, PNI, IX port, cache and fabric port in one list, filterable by type, city and
   network, with a jump to the POP that holds it. The Networks tab shows the same per network. */
const CONN_K={t:N_('common.transit'),p:'PNI',ix:'IX',c:N_('common.cache'),nni:'NNI'},CONN_ORD=['t','p','ix','c','nni'],CONN_COL={t:'#FF8A3D',p:'#7B61FF',ix:'#2DB7F5',c:'#16A866',nni:'#1E2640'};
const connTab=k=>k==='t'?'up':k==='nni'?'links':'peer';
// How many rows conns() gives, without building them (the Networks tab only shows the count).
const connsN=()=>S.transit.length+S.pni.length+Object.keys(S.ixp).length+new Set(S.caches.map(x=>x.city+'|'+x.net)).size+(S.nni||[]).filter(x=>FAB[x.prov]&&NNI[x.tier]).length;
function conns(){const out=[],pn=(tier,n)=>(n||1)>1?`${n}×${PORT[tier].n} LAG`:PORT[tier].n;
  for(const t of S.transit){const q=(R.p95&&R.p95[t.id])||0;out.push({k:'t',id:t.id,city:t.city,net:t.net,name:NET[t.net].name,port:pn(t.tier,t.n),cap:lagCap(PORT[t.tier].g,t.n),use:R.useT[t.id]||0,mo:transitMo(t,q),down:t.down>S.day||!popUp(t.city),low:t.pref==='low',note:tr('connections.95th_percentile_g',{g:fmtG(q)})});}
  for(const x of S.pni){const u=R.usePni[x.id]||0;out.push({k:'p',id:x.id,city:x.city,net:x.net,name:NET[x.net].name,port:x.g1?((x.n||1)>1?x.n+'×1G':'1G'):pn(x.tier,x.n),cap:lagCap(pniG(x),x.n),use:u,mo:pniMo(x,u),down:!popUp(x.city)||!pniOn(x),low:x.pref==='low',note:!pniOn(x)?tr('connections.on_order_n_days',{n:x.ready-S.day}):NET[x.net].pol==='paid'?tr('common.paid_peering'):''});}
  for(const c in S.ixp){const ses=ixSessions(c),mine=!!S.myIx[c];out.push({k:'ix',id:c,city:ixCity(c),net:null,nets:[...ses],name:ixName(c),port:mine?tr('common.your_exchange'):pn(S.ixp[c],(S.ixn||{})[c]),cap:ixCap(c),use:R.useIx[c]||0,mo:ixMo(c),mine,down:!!(S.ev.ixdown&&S.ev.ixdown[c]>S.day),low:(S.ixPref&&S.ixPref[c])==='low',note:trn('connections.n_peering_session',ses.size)+(isRemote(c)?' · '+tr('common.remote'):'')});}
  const cg={};for(const x of S.caches){const key=x.city+'|'+x.net;(cg[key]=cg[key]||[]).push(x);}
  for(const key in cg){const g=cg[key],x=g[0];out.push({k:'c',id:x.id,n:g.length,city:x.city,net:x.net,name:NET[x.net].cache.name,port:trn('common.n_box',g.length),cap:g.reduce((a,y)=>a+cacheG(y),0),use:g.reduce((a,y)=>a+(R.useCache[y.id]||0),0),mo:g.reduce((a,y)=>a+cacheMo(y),0),down:!popUp(x.city),low:false,note:tr('common.from_net',{net:NET[x.net].name})});}
  for(const x of S.nni||[])if(FAB[x.prov]&&NNI[x.tier])out.push({k:'nni',id:x.city+'|'+x.prov,city:x.city,net:null,name:FAB[x.prov].name,port:pn(x.tier,x.n),cap:nniCap(x),use:nniUsed(x.city,x.prov),mo:nniMo(x),down:!popUp(x.city),low:false,note:tr('connections.virtual_circuits_and_fabric')});
  return out;}
// Cancel straight from the list, with the same "Really?" step as the POP panel.
// Grow a connection from the list: the next port size and one more LAG member, same actions and prices as the POP panel.
// nx looks up the next size in that kind of port's own table: fabric ports (NNI) stop at 400G.
function connUp(r){if(r.mine)return '';const nx=(t,T=PORT)=>T[t+1]&&portShown(t+1)?t+1:-1;let h='';
  if(r.k==='t'){const t=S.transit.find(x=>x.id===r.id);if(!t)return '';const n=t.n||1,i=nx(t.tier);
    if(i>=0){const a={port:PORT[i].n,cost:fmt$(PORT[i].setup*n),mo:fmt$(PORT[i].tmo*n)};h+=btn(n>1?tr('common.upgrade_all_to_port_cost_mo',a):tr('common.upgrade_port_cost_mo_mo',a),'buyTransit',{city:t.city,net:t.net,tier:i},'sm',S.cash<PORT[i].setup*n||!portOk(t.city,i));}
    if(n<LAG_MAX)h+=btn(tr('common.lag_member_cost_mo_mo',{cost:fmt$(PORT[t.tier].setup),mo:fmt$(PORT[t.tier].tmo)}),'lagT',{id:t.id,d:1},'sm',S.cash<PORT[t.tier].setup||!portOk(t.city,t.tier));}
  else if(r.k==='p'){const p=S.pni.find(x=>x.id===r.id);if(!p)return '';if(!pniOn(p)||p.up||msfNope(p.net,p.city))return `<span class="meta">${!pniOn(p)||p.up?tr('common.on_order'):''}</span>`;const n=p.n||1,i=p.g1?0:nx(p.tier),c=i>=0?(1500+PORT[i].setup/2)*n:0;
    if(i>=0){const a={port:PORT[i].n,cost:fmt$(c),mo:fmt$(PORT[i].pni*n)};h+=btn(n>1?tr('common.upgrade_all_to_port_cost_mo',a):tr('common.upgrade_port_cost_mo_mo',a),'pni',{city:p.city,net:p.net,tier:i},'sm',!portOk(p.city,i)||S.cash<c);}
    if(n<pniLagMax(p.city))h+=btn(tr('common.lag_member_cost_mo_mo',{cost:fmt$(1500+PORT[p.tier].setup/2),mo:fmt$(PORT[p.tier].pni)}),'lagP',{id:p.id,d:1},'sm',S.cash<1500+PORT[p.tier].setup/2);}
  else if(r.k==='ix'){const c=r.id,city=ixCity(c),n=(S.ixn||{})[c]||1,i=nx(S.ixp[c]);
    if(i>=0)h+=btn(tr('common.upgrade_port_price',{port:PORT[i].n,price:portMo(ixPortMo(c,i)*n)}),'buyIx',{city:c,tier:i},'sm',(!!S.pops[city]&&!portOk(city,i))||(!S.pops[city]&&i>1));
    if(S.pops[city]&&!S.myIx[c]&&n<LAG_MAX)h+=btn(tr('common.lag_member_price',{price:portMo(ixPortMo(c,S.ixp[c]))}),'lagIx',{city:c,d:1},'sm',S.cash<ixPortMo(c,S.ixp[c]));}
  else if(r.k==='c')h+=btn(tr('common.box'),'cache',{city:r.city,net:r.net},'sm');
  else if(r.k==='nni'){const [city,prov]=r.id.split('|'),pt=nniPort(city,prov);if(!pt)return '';const n=pt.n||1,i=nx(pt.tier,NNI);
    if(i>=0){const c=NNI[i].mo*n;h+=btn(n>1?tr('common.upgrade_all_to_port_cost_mo',{port:NNI[i].n,cost:fmt$(c),mo:fmt$(c)}):tr('common.upgrade_port_price_mo',{port:NNI[i].n,price:fmt$(c)}),'buyNni',{city,prov,tier:i},'sm',S.cash<c||!portOk(city,i));}
    if(n<LAG_MAX)h+=btn(tr('common.lag_member_price',{price:portMo(NNI[pt.tier].mo)}),'lagNni',{city,prov,d:1},'sm',S.cash<NNI[pt.tier].mo||!portOk(city,pt.tier));}
  return h;}
// Shrink a connection from the list, or chase a PNI order: the same buttons and conditions as the POP panel (#336).
function connDown(r){if(r.mine)return '';const dn=(port,price,act,args)=>btn(tr('link_panels.downgrade_port_price',{port,price}),act,args,'ghost sm'),less=(act,args)=>btn(tr('common.member'),act,{...args,d:-1},'ghost sm');let h='';
  if(r.k==='t'){const t=S.transit.find(x=>x.id===r.id);if(!t)return '';const n=t.n||1;
    if(t.tier>0)h+=dn(PORT[t.tier-1].n,portMo(PORT[t.tier-1].tmo*n),'downT',{id:t.id});if(n>1)h+=less('lagT',{id:t.id});}
  else if(r.k==='p'){const p=S.pni.find(x=>x.id===r.id);if(!p)return '';const n=p.n||1,chase=btn(tr('common.chase_it'),'pniChase',{id:p.id},'ghost sm');
    if(!pniOn(p))return chase;
    if(p.up)h+=chase;else if(!p.g1&&p.tier>pniMin(p.net)&&!msfNope(p.net,p.city))h+=dn(PORT[p.tier-1].n,portMo(PORT[p.tier-1].pni*n),'downP',{id:p.id});
    if(n>1)h+=less('lagP',{id:p.id});}
  else if(r.k==='ix'){const c=r.id,n=(S.ixn||{})[c]||1;
    if(n>1)h+=less('lagIx',{city:c});if(S.ixp[c]>0)h+=dn(PORT[S.ixp[c]-1].n,portMo(ixPortMo(c,S.ixp[c]-1)*n),'downIx',{city:c});}
  else if(r.k==='nni'){const [city,prov]=r.id.split('|'),pt=nniPort(city,prov);if(pt&&(pt.n||1)>1)h+=less('lagNni',{city,prov});}
  return h;}
function connX(r){if(r.mine)return '';const on=UI.confirm==='cc:'+r.k+':'+r.id;
  return btn(on?(r.k==='ix'?tr('common.really_leave'):r.k==='t'?tr('common.really_cancel'):tr('common.really_remove')):r.k==='ix'?tr('common.leave_ix'):r.k==='t'?tr('common.cancel'):r.k==='c'&&r.n>1?tr('common.box_6ee3'):r.k==='nni'?tr('common.remove_port'):tr('common.remove'),'connCancel',{k:r.k,id:r.id},on?'red sm':'ghost sm');}
function connMatch(r,F){return (!F.k||r.k===F.k)&&(!F.city||r.city===F.city)&&(!F.net||r.net===F.net||(r.nets&&r.nets.includes(F.net)));}
function connSection(){const all=conns(),F=UI.cf||{};
  let h=`<div class="panel2" id="connSec" style="margin-top:12px"><h3>${tr('common.connections')}</h3><p class="note" style="margin-top:0">${tr('connections.every_port_that_connects_you_to')}</p>`;
  if(!all.length)return h+`<p class="empty">${tr('connections.no_connections_yet_buy_transit_or')}</p></div>`;
  const cnt=k=>all.filter(r=>r.k===k&&connMatch(r,{...F,k:null})).length;
  h+=`<div class="seg" style="margin-bottom:6px">${btn(tr('dashboard.all_n',{n:all.filter(r=>connMatch(r,{...F,k:null})).length}),'connF',{f:'k',v:''},!F.k?'pink sm':'ghost sm')}${CONN_ORD.filter(k=>all.some(r=>r.k===k)).map(k=>btn(`${tr(CONN_K[k])} (${cnt(k)})`,'connF',{f:'k',v:k},F.k===k?'pink sm':'ghost sm')).join('')}</div>`;
  const cities=[...new Set(all.map(r=>r.city))].sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name));
  const nets=[...new Set(all.flatMap(r=>r.net?[r.net]:(r.nets||[])))].filter(id=>NET[id]&&!NET[id].tail).sort((a,b)=>NET[a].name.localeCompare(NET[b].name));
  h+=`<div class="trsel" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px"><label>${tr('common.city_906b')} <select data-chg="connCity"><option value="">${tr('common.all_cities')}</option>${cities.map(c=>`<option value="${c}"${F.city===c?' selected':''}>${esc(CITY[c].name)}</option>`).join('')}</select></label><label>${tr('common.network_6974')} <select data-chg="connNet"><option value="">${tr('common.all_networks')}</option>${nets.map(id=>`<option value="${id}"${F.net===id?' selected':''}>${esc(NET[id].name)}</option>`).join('')}</select></label>${F.k||F.city||F.net?btn(tr('common.clear_filters'),'connF',{f:'all',v:''},'ghost sm'):''}</div>`;
  const rows=all.filter(r=>connMatch(r,F));
  const sk=UI.connSort||'k',dir=UI.connDir||1,val=r=>sk==='city'?CITY[r.city].name:sk==='name'?r.name.toLowerCase():sk==='use'?(r.cap?r.use/r.cap:0):sk==='mo'?r.mo:CONN_ORD.indexOf(r.k);
  rows.sort((a,b)=>{const A=val(a),B=val(b);return (A<B?-1:A>B?1:0)*dir||CONN_ORD.indexOf(a.k)-CONN_ORD.indexOf(b.k)||CITY[a.city].name.localeCompare(CITY[b.city].name)||a.name.localeCompare(b.name);});
  const tc=rows.reduce((a,r)=>a+r.cap,0),tu=rows.reduce((a,r)=>a+r.use,0),tm=rows.reduce((a,r)=>a+r.mo,0);
  if(isPhone()){const st=(r)=>r.down?` <span class="tag restrictive">${tr('common.down')}</span>`:r.low?` <span class="tag st">${tr('common.backup')}</span>`:'';
    h+=`<div class="seg" style="margin-bottom:4px">${[['k',tr('common.type')],['city',tr('common.where')],['use',tr('common.in_use')],['mo',tr('common.per_month')]].map(([k,l])=>btn(l+(sk===k?(dir>0?' ▲':' ▼'):''),'connSort',{k},sk===k?'pink sm':'ghost sm')).join('')}</div>`;
    h+=rows.slice(0,listN('conn')).map(r=>{const u=r.cap?r.use/r.cap:0,N=r.net&&NET[r.net];return `<div class="row"${r.down?' style="opacity:.55"':''}>${N?logo(N):`<span class="logo" style="--c:${CONN_COL[r.k]}">${r.k==='nni'?'NNI':'IX'}</span>`}<div class="grow"><div class="nm">${esc(r.name)} <span class="tag" style="background:${CONN_COL[r.k]}">${tr(CONN_K[r.k])}</span>${st(r)}</div><div class="meta">${esc(CITY[r.city].name)} · ${esc(r.port)} · ${tr('common.price_mo',{price:fmt$(r.mo)})}${r.note?' · '+esc(r.note):''}</div><div class="kv"><span>${tr('common.in_use')}</span><b>${fmtG(r.use)} / ${fmtCap(Math.round(r.cap))}</b></div><div class="bar ${barCls(u)}"><i style="width:${Math.min(100,u*100)}%"></i></div>${r.mine?'':`<div class="btns">${connUp(r)}${connDown(r)}${connX(r)}</div>`}</div>${btn(tr('common.open'),'goConn',{city:r.city,k:r.k},'ghost sm')}</div>`;}).join('');
    return h+listMore('conn',rows.length,n=>trn('connections.n_more_connection',n))+`<div class="kv" style="margin-top:6px"><span><b>${trn('connections.n_connection',rows.length)}</b></span><b>${fmtG(tu)} / ${fmtCap(Math.round(tc))} · ${tr('common.price_mo',{price:fmt$(tm)})}</b></div></div>`;}
  const th=(k,l,c)=>`<th class="${c||''}">${k?`<button class="thb" data-act="connSort" data-args="${esc(JSON.stringify({k}))}">${l}${sk===k?(dir>0?' ▲':' ▼'):''}</button>`:l}</th>`;
  h+=`<div class="tscroll"><table class="tbl"><thead><tr>${th('k',tr('common.type'))}${th('city',tr('common.where'))}${th('name',tr('common.with'))}${th('',tr('common.port'))}${th('use',tr('common.in_use'),'r')}${th('mo',tr('common.per_month'),'r')}<th></th></tr></thead><tbody>`;
  h+=rows.slice(0,listN('conn')).map(r=>{const u=r.cap?r.use/r.cap:0,N=r.net&&NET[r.net];return `<tr${r.down?' style="opacity:.55"':''}><td><span class="tag" style="background:${CONN_COL[r.k]}">${tr(CONN_K[r.k])}</span></td><td>${esc(CITY[r.city].name)}</td><td><span style="display:inline-flex;align-items:center;gap:6px">${N?logo(N):''}<span><b>${esc(r.name)}</b>${r.note?`<br><span class="meta">${esc(r.note)}</span>`:''}</span></span></td><td>${esc(r.port)}${r.down?` <span class="tag restrictive">${tr('common.down')}</span>`:r.low?` <span class="tag st">${tr('common.backup')}</span>`:''}</td><td class="r">${fmtG(r.use)} / ${fmtCap(Math.round(r.cap))}<div class="bar ${barCls(u)}" style="margin-top:3px"><i style="width:${Math.min(100,u*100)}%"></i></div></td><td class="r">${fmt$(r.mo)}</td><td><div style="display:flex;flex-wrap:wrap;gap:6px;min-width:220px">${btn(tr('common.open'),'goConn',{city:r.city,k:r.k},'ghost sm')}${connUp(r)}${connDown(r)}${connX(r)}</div></td></tr>`;}).join('');
  h+=`</tbody><tfoot><tr><td colspan="4"><b>${trn('connections.n_connection',rows.length)}</b></td><td class="r"><b>${fmtG(tu)} / ${fmtCap(Math.round(tc))}</b></td><td class="r"><b>${fmt$(tm)}</b></td><td></td></tr></tfoot></table></div>${listMore('conn',rows.length,n=>trn('connections.n_more_connection',n))}</div>`;
  return h;}
// Where you connect to one network, as buttons that jump to the POP (Networks tab).
// Where you connect to each network, as [label, city, kind]: transit, PNIs, IX sessions, then caches. Built for all
// networks at once, so the network list works out each IX port's sessions a single time, not once per network.
function netWhereIdx(){const B={t:{},p:{},ix:{},c:{}},add=(k,id,x)=>(B[k][id]||(B[k][id]=[])).push(x);
  for(const t of S.transit)add('t',t.net,[tr('common.transit'),t.city,'t']);
  for(const x of S.pni)add('p',x.net,['PNI',x.city,'p']);
  for(const c in S.ixp){const nm=ixName(c),ct=ixCity(c);for(const id of ixSessions(c))add('ix',id,[nm,ct,'ix']);}
  const seen=new Set();for(const x of S.caches){const k=x.net+'|'+x.city;if(!seen.has(k)){seen.add(k);add('c',x.net,[tr('common.cache'),x.city,'c']);}}
  return id=>[].concat(B.t[id]||[],B.p[id]||[],B.ix[id]||[],B.c[id]||[]);}
function netWhere(n,where){const ch=(where||netWhereIdx())(n.id);
  if(!ch.length)return '';const MAX=6;
  return `<div class="btns">${ch.slice(0,MAX).map(([l,c,k])=>btn(`${esc(l)} <small>${esc(CITY[c].name)}</small>`,'goConn',{city:c,k},'ghost sm')).join('')}${ch.length>MAX?btn(tr('dashboard.n_more',{n:ch.length-MAX}),'connFor',{net:n.id},'ghost sm'):''}</div>`;}
const DTABS=['overview','cust','conn','traffic','infra','pops','lease','market'];
