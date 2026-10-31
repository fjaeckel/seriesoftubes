/* ---------- PNIs with the big networks: slow orders and no small ports ----------
   Big content networks, Tier 1s and big eyeball networks usually deliver a PNI or an augment in about 30 days, but
   15% of orders get lost in provisioning for 6 to 12 months. The content networks and Tier 1s start at 100G. Doitsche Telekomm sells PNIs down to 1G, and takes its time too. */
const pniBig=id=>{const n=NET[id];return n.type==='t1'||(n.type==='cdn'&&n.pol!=='open')||(n.type==='eye'&&n.share>=0.02);};
const pniMin=id=>{const n=NET[id];return n.type==='t1'||(n.type==='cdn'&&n.pol!=='open')?1:0;};
const pniG1=id=>id==='dtk';
// A beer with their peering coordinator at a conference halves the wait. It is how it really works.
const PNI_SLOW=0.15,pniLead=id=>{const n=pniBig(id)?(Math.random()<PNI_SLOW?180+Math.floor(Math.random()*186):30):14+Math.floor(Math.random()*29);return leadDays(S.conf&&S.conf.until>S.day?Math.round(n/2):n);};
const pniG=p=>p.g1?1:PORT[p.tier].g,pniPN=p=>p.g1?'1G':PORT[p.tier].n,pniOn=p=>!(p.ready>S.day);
const pniEta=id=>pniBig(id)?tr('pnis.delivery_about_a_month_sometimes_6'):tr('pnis.delivery_2_to_6_weeks');
const PNI_G1_COST=1200,pniWhen=n=>n>=60?tr('pnis.their_team_quotes_m_months',{m:Math.round(n/30)}):tr('pnis.ready_in_about_n_days',{n});
function pniWait(p,c){return `<div class="kv"><span>${(p.n||1)>1?p.n+'×':''}${pniPN(p)} PNI</span><b>${tr('common.on_order')}</b></div><div class="meta">${tr('pnis.about_n_days_to_go_nothing',{n:Math.max(0,p.ready-S.day)})}</div><div class="btns">${btn(tr('common.chase_it'),'pniChase',{id:p.id},'ghost sm')}${btn(UI.confirm===p.id?tr('common.really_remove'):tr('pnis.cancel_the_order'),'cancelPni',{id:p.id},'ghost sm')}</div>`;}
function pniDay(d){for(const p of S.pni){const nm=esc(NET[p.net].name),city=esc(CITY[p.city].name);
  if(p.ready===d)toast(tr('pnis.pni_with_net_is_up_in',{net:nm,city,dc:esc(siteName(p.city,'a'))}),'good');
  if(p.up&&p.up.ready<=d){p.tier=p.up.tier;p.n=p.up.n;if(p.up.site==='ab'&&p.n>=2&&S.pops[p.city]&&S.pops[p.city].site2)p.site='ab';if(p.up.g1)p.g1=true;else delete p.g1;delete p.up;toast(tr('pnis.augment_with_net_delivered_in_city',{net:nm,city,port:((p.n||1)>1?p.n+'×':'')+pniPN(p)}),'good');}}}
// Microsnoft has no capacity on the US east coast. Not for a PNI, not at an exchange, not for anyone.
const US_EAST=['ash','nyc','bos','atn','mia'];
const MSF_NOPE=[N_('pnis.no_capacity_in_us_east_you'),N_('pnis.us_east_is_sold_out_until'),N_('pnis.their_peering_team_says_us_east'),N_('pnis.a_new_region_is_coming_online')];
const msfNope=(id,city)=>id==='msf'&&!!city&&US_EAST.includes(ixCity(city));
