const RT={normal:tr('common.follow_metrics'),fast:tr('common.lowest_latency'),scenic:tr('sites_and_service.scenic_quietest_links')};
function routeCtl(b){const lt=R.l2lat[b.id];return `<div class="btns"><span class="meta" style="align-self:center">${tr('common.route_4a2e')}</span>${Object.keys(RT).map(m=>btn(RT[m],'setRoute',{id:b.id,m},(b.route||'normal')===m?'pink sm':'ghost sm')).join('')}</div><div class="meta">${tr('sites_and_service.path_latency_lat',{lat:lt!==undefined&&isFinite(lt)?tr('common.ms_ms_one_way',{ms:lt.toFixed(1)}):tr('sites_and_service.no_path_right_now')})}${b.route==='scenic'&&R.l2split&&R.l2split[b.id]?' · '+tr('sites_and_service.split_over_two_equally_quiet_paths'):''}${b.latMax?' · '+tr('sites_and_service.budget_ms_ms',{ms:b.latMax}):''}</div>`;}
function nodeCap(c){const p=S.pops[c];if(!p)return Infinity;const eff=(p.routers||1)-(p.rdown>S.day?1:0);return RG[p.rgen||0].cap*coreCpu(c)*Math.max(1,eff)*(p.hot>S.day?(p.site2?0.75:0.5):1)*(p.site2&&(siteDown(c,'a')||siteDown(c,'b'))?0.5:1);}
// With a second site, one building can be dark (or cut off by a ring cut) while the other carries on.
function siteDown(c,s){const p=S.pops[c];if(!p||!p.site2)return false;if(S.inc.some(i=>i.type==='site'&&i.ref===c&&i.site===s&&i.until>S.day))return true;return s==='b'&&p.ringcut>S.day;}
// Ports can live in site A, site B, or be split across both ('ab'): a LAG with members in each
// building, so one dark building only takes out its half.
function liveN(c,site,n){n=n||1;const p=S.pops[c];if(!p||!p.site2)return n;if(site==='ab'){const a=Math.ceil(n/2),b=n-a;return (siteDown(c,'a')?0:a)+(siteDown(c,'b')?0:b);}return siteDown(c,site==='b'?'b':'a')?0:n;}
// Your own IX is a switch, not a port: it lives in building A or B, or in both with a second switch (#36).
const myIxLive=c=>{const ct=ixCity(c),st=(S.ixSite||{})[c]||'a';return st==='ab'?!(siteDown(ct,'a')&&siteDown(ct,'b')):!siteDown(ct,st);};
const liveCap=(g,c,site,n)=>{const k=liveN(c,site,n);return k?lagCap(g,k):0;};
const onSite=(site,s)=>(site||'a')===s||site==='ab';
function siteCtl(k,id,c,cur){const p=S.pops[c];if(!p||!p.site2)return '';cur=cur||'a';const n=k==='t'?(S.transit.find(x=>x.id===id)||{}).n:k==='p'?(S.pni.find(x=>x.id===id)||{}).n:(S.ixn||{})[id];return `<div class="seg site"><span class="meta">${tr('common.site')}</span>${['a','b'].map(x=>btn(`${x.toUpperCase()} <small>${esc(siteName(c,x))}</small>`,'siteSet',{k,id,s:x},cur===x?'pink sm':'ghost sm')).join('')}${btn(k==='ix'&&S.myIx[id]?tr('sites_and_service.both_a_second_switch_price_mo',{price:fmt$(Math.round(myFab(id).mo/2))}):(n||1)<2?tr('sites_and_service.both_adds_a_lag_member'):tr('sites_and_service.both_split_the_lag'),'siteSet',{k,id,s:'ab'},cur==='ab'?'pink sm':'ghost sm')}</div>`;}
function portOk(c,i){const p=S.pops[c];return i<=RG[p?(p.rgen||0):0].maxP;}
function waveOk(a,b,i){return [a,b].every(c=>i<=RG[S.pops[c]?(S.pops[c].rgen||0):0].maxLT);}
function waveNeed(i){const g=RG.find(r=>r.maxLT>=i);return g?tr('sites_and_service.pn_routers',{pn:g.pn}):'?';}
function routerModels(c){const p=S.pops[c],g=p.rgen||0,rt=p.routers||1;
  return `<div style="margin-top:6px">${RG.map((M,i)=>{if(i===g)return '';const why=modelFits(c,i),lk=!techOk('rg',i,M.lvl);
    return `<div class="row"><span class="logo" style="--c:${M.badge?'#2C7A7B':'#FF4F9A'}">${M.badge||'R'+(M.cls+1)}</span><div class="grow"><div class="nm">${esc(M.n)} <span class="meta">${M.pn} · ${tr('sites_and_service.n_ports',{n:M.ports})} · ${fmtG(M.cap)} · ${tr('sites_and_service.boots_in_n_min',{n:M.boot})}${M.flaky?' · '+tr('common.crashes_more'):''}</span></div><div class="meta">${esc(M.blurb)}</div><div class="meta">${coreMeta(i)}${coreOn()&&coreRun()>0&&!rgCore(i,coreRun())?' · <b style="color:var(--bad)">'+tr('core.can_t_run_your_lv',{lv:tr(CORE_LV[coreRun()])})+'</b>':''}</div>${why?`<div class="why">${esc(why)}</div>`:''}</div>${lk?demoBtn('rg',i,M.lvl,tr('sites_and_service.level_n',{n:M.lvl}),'sm'):btn(tr('sites_and_service.swap_cost_mo_mo',{cost:fmt$(swapCost(c,i)),mo:fmt$(M.mo*rt)}),'upRouter',{city:c,g:i},'sm',!!why||S.cash<swapCost(c,i)||p.rupDay===S.day)}</div>`;}).join('')}</div>`;}
function portNote(c){const p=S.pops[c];if(!p)return '';const g=p.rgen||0;return RG[g].maxP<PORT.length-1?`<p class="note" style="margin-top:0">${tr('sites_and_service.your_model_here_tops_out_at',{model:esc(RG[g].n),pn:RG[g].pn})}</p>`:'';}
// Service: what you deliver, times how it feels. Traffic backhauled far to transit is slow, and users notice.
const latSlow=c=>!!(R&&R.latF&&R.latF[c]<0.97&&R.latFar[c]);
function latNote(c){if(!latSlow(c))return '';const f=R.latFar[c];const v={p:pct(Math.min(1,f.share)),city:esc(CITY[c].name),to:esc(CITY[f.to].name),ms:Math.round(f.ms)};return `<div class="latwarn">🐢 ${CITY[c].kr&&scnRule('sender')?tr('sites_and_service.p_of_city_s_traffic_comes_from_kr',v):tr('sites_and_service.p_of_city_s_traffic_is',v)}</div>`;}
const LAT_OK=20,LAT_BAD=50,latLoss=rtt=>rtt<=LAT_OK?0:rtt<=LAT_BAD?0.2*(rtt-LAT_OK)/(LAT_BAD-LAT_OK):0.5;
const krLatLoss=rtt=>rtt<=KR_LAT_OK?0:rtt<=KR_LAT_BAD?0.25*(rtt-KR_LAT_OK)/(KR_LAT_BAD-KR_LAT_OK):0.5;
function sfOf(r,c){const d=r.cityDem[c]||0;return d<=1e-6?1:clamp(r.citySrv[c]/d,0,1)*((r.latF&&r.latF[c])??1);}

