/* ---------- The cloud catalogue: what a Hyperscaler sells (37-hyper.js) ----------
   Every customer of a Hyperscaler is a tenant (S.biz of type cloud) buying a bundle of these products (b.p, ids from
   CLOUD_PRODUCTS, checked on load). A product is a traffic shape and a need, not a console: w its weight in the tenant's
   traffic, out the share that goes out to users, in the share coming in (ingest), bt the share between two regions,
   edge the share of out an edge stack can serve at the front door, lat how much users feel latency (0 to 1), need what
   it asks of your network (scored in hsNeedQ) and pr its price per Gbps a month. */
const CLOUD_PRODUCTS={
 ai:{n:N_('cloud.p_ai'),w:1,out:0.8,in:0.2,bt:0,edge:0,lat:0.9,need:'model',pr:750},
 arc:{n:N_('cloud.p_arc'),w:1,out:0,in:0.6,bt:0.4,edge:0,lat:0,need:'pair',pr:75},
 cdn:{n:N_('cloud.p_cdn'),w:4,out:1,in:0,bt:0,edge:0.8,lat:0.3,need:'edge',pr:175},
 db:{n:N_('cloud.p_db'),w:2,out:0.3,in:0.2,bt:0.5,edge:0,lat:0.6,need:'pair',pr:650},
 dns:{n:N_('cloud.p_dns'),w:0.2,out:0.5,in:0.5,bt:0,edge:1,lat:0.8,need:'doors',pr:1000},
 fn:{n:N_('cloud.p_fn'),w:1,out:0.6,in:0.4,bt:0,edge:0,lat:1,need:'near',pr:550},
 gpu:{n:N_('cloud.p_gpu'),w:4,out:0.1,in:0.3,bt:0.6,edge:0,lat:0,need:'power',pr:400},
 k8s:{n:N_('cloud.p_k8s'),w:2,out:0.5,in:0.1,bt:0.4,edge:0,lat:0.5,need:'pair',pr:450},
 obj:{n:N_('cloud.p_obj'),w:3,out:0.85,in:0.15,bt:0,edge:0.6,lat:0.1,need:'room',pr:225},
 out:{n:N_('cloud.p_out'),w:1,out:0.5,in:0.5,bt:0,edge:0,lat:0.4,need:'port',pr:600},
 pc:{n:N_('cloud.p_pc'),w:2,out:0.5,in:0.5,bt:0,edge:0,lat:0.4,need:'port',pr:500},
 snow:{n:N_('cloud.p_snow'),w:2,out:0,in:1,bt:0,edge:0,lat:0,need:'room',pr:100},
 sov:{n:N_('cloud.p_sov'),w:2,out:0.6,in:0.3,bt:0.1,edge:0,lat:0.5,need:'home',pr:800},
 vm:{n:N_('cloud.p_vm'),w:3,out:0.7,in:0.2,bt:0.1,edge:0,lat:0.5,need:'near',pr:350},
};
// What each need asks, as the Cloud tab and the offers say it.
const CLOUD_NEED={doors:N_('cloud.need_doors'),edge:N_('cloud.need_edge'),home:N_('cloud.need_home'),model:N_('cloud.need_model'),near:N_('cloud.need_near'),pair:N_('cloud.need_pair'),port:N_('cloud.need_port'),power:N_('cloud.need_power'),room:N_('cloud.need_room')};
/* Tenant kinds: their usual bundle (p), sizes in Gbps (opts), the level they start calling at, and pun names. */
const CLOUD_TENANTS={
 startup:{n:N_('cloud.k_startup'),p:['vm','obj','fn'],opts:[5,10,20],lv:1,names:['Uber for Hamsters','Blockchain for Bees','Yet Another To-Do App','Pivot Pivot Pivot Inc.','Disruptive Toaster Labs','Synergy Sandwiches','Moonshot Muffins','Hockey Stick Growth Co.']},
 ent:{n:N_('cloud.k_ent'),p:['vm','db','pc','out'],opts:[10,20,40],lv:2,names:['Federated Sock Wholesalers plc','Mega Mutual Insurance of Somewhere','Consolidated Paperclip Holdings','Legacy Mainframe & Sons','Synergistic Spreadsheets AG','Global Widget Logistics']},
 game:{n:N_('cloud.k_game'),p:['fn','k8s','cdn'],opts:[20,40,80],lv:2,names:['Pixel Punchers','Lag Free Games (Allegedly)','Loot Box Logistics','Ragequit Interactive','Respawn Point Studios','Patch Day Productions']},
 tv:{n:N_('cloud.k_tv'),p:['cdn','obj'],opts:[50,100,200],lv:3,names:['Binge Barn','Couch Potato Plus','Cliffhanger Central','Snooze Network','Next Episode Autoplay Co.']},
 lab:{n:N_('cloud.k_lab'),p:['gpu','obj','snow'],opts:[100,200,400],lv:4,names:['Overfit and Sons','DeepThink Tank','Gradient Gremlins','Token Tsunami Labs','Bigger Model Better Model Inc.']},
 gov:{n:N_('cloud.k_gov'),p:['sov','db','dns'],opts:[20,40,80],lv:5,names:['Ministry of Forms','Bank of Mattress','Department of Redundancy Department','Central Bank of Spare Change','Office of Stamps and Counterstamps']},
};
/* The one customer kind a Hyperscaler has. Not enumerable: lists of customer kinds (offers, the golf course, the world
   route fuzz compares with main) never see it, and classic games never meet it. */
Object.defineProperty(BIZ_T,'cloud',{value:{l:tr('cloud.tenant'),opts:[5,10,20,40,50,80,100,200,400],rate:0,cloud:true,lv:1},enumerable:false});
// A bundle's traffic shape: each share of the tenant's Gbps, weighted by product (eo: what an edge stack can serve).
function cloudShape(p){let w=0,out=0,inn=0,bt=0,eo=0,lat=0;for(const id of p){const P=CLOUD_PRODUCTS[id];if(!P)continue;w+=P.w;out+=P.w*P.out;inn+=P.w*P.in;bt+=P.w*P.bt;eo+=P.w*P.out*P.edge;lat=Math.max(lat,P.lat);}
  w=w||1;return {out:out/w,in:inn/w,bt:bt/w,eo:eo/w,lat};}
// What a bundle pays per Gbps a month: each product's price, by its weight.
function cloudRate(p){let w=0,v=0;for(const id of p){const P=CLOUD_PRODUCTS[id];if(!P)continue;w+=P.w;v+=P.w*P.pr;}return w?Math.round(v/w):0;}
const cloudList=p=>p.filter(id=>CLOUD_PRODUCTS[id]).map(id=>tr(CLOUD_PRODUCTS[id].n)).join(', ');
