/* ---------- The Hyperscaler between regions: actions (38-hyper-traffic.js) ---------- */
Object.assign(ACT,{
 // Pick a region's replica (v: a region, or '' for the suggestion; the Cloud tab's list). What it still owed the old one goes to the new one.
 hsReplica:({city,v})=>{const H=hyper()&&S.hs,c=city,to=v;if(!H||!isCity(c)||!H.rg[c]||typeof to!=='string')return;
   if(to===''||to===c){delete H.rep[c];after();return;}if(!isCity(to)||!H.rg[to])return;H.rep[c]=to;
   toast(tr('hyper_traffic.replica_set',{a:CITY[c].name,b:CITY[to].name}),'good');after();},
 // How a region pair's bulk traffic travels: the shortest path (v ''), scenic (around busy links) or diverse halves.
 hsPath:({a,b,v})=>{const H=hyper()&&S.hs,m=v;if(!H||!isCity(a)||!isCity(b)||a===b||!H.rg[a]||!H.rg[b])return;
   const k=hsPk(a,b);if(HS_PATHS.includes(m))H.pp[k]=m;else if(!m)delete H.pp[k];else return;after();},
 // Take an AI lab's training run: compute slots and megawatts in both regions, paid on completion (half if late).
 hsJobTake:({id})=>{const H=hyper()&&S.hs,o=H&&H.jo.find(x=>x.id===id);if(!o)return;const why=hsTrainWhy(o.a,o.b,o.g);if(why){toast(why,'bad');sfx('err');return;}
   H.jo.splice(H.jo.indexOf(o),1);H.jobs.push({id:o.id,n:o.n,a:o.a,b:o.b,g:o.g,tb:o.tb,done:0,due:S.day+Math.ceil(o.wk*7*HS_SLACK),fee:o.fee,start:S.day});
   toast(tr('hyper_traffic.job_taken',{lab:esc(o.n),date:dateStr(S.day+Math.ceil(o.wk*7*HS_SLACK)),fee:fmt$(o.fee)}),'good');sfx('build');after();},
 hsJobNo:({id})=>{const H=hyper()&&S.hs;if(!H||!H.jo.some(x=>x.id===id))return;H.jo=H.jo.filter(x=>x.id!==id);toast(tr('hyper_traffic.job_declined'),'');after();},
 // Train a model of your own between this region and its replica (or to): k its size. One at a time.
 hsTrain:({city,k,to})=>{const H=hyper()&&S.hs,c=city,P=Number.isInteger(+k)?HS_OWN[+k]:null;k=+k;if(!H||!P||!isCity(c)||!H.rg[c])return;
   if(H.own.length){toast(tr('hyper_traffic.one_model_at_a_time'),'bad');sfx('err');return;}
   const b=to&&H.rg[to]?to:hsRepOf(c),why=hsTrainWhy(c,b,P.g);if(why){toast(why,'bad');sfx('err');return;}
   const n=hstr(c+'|'+b+'|'+S.day)%HS_MODELS.length,due=S.day+Math.ceil(P.wk*7*HS_SLACK);
   H.own.push({id:uid(),n,k,a:c,b,g:P.g,tb:Math.round(P.g*TB_DAY*P.wk*7),done:0,mw:hsTrainMw(P),start:S.day,due});
   toast(tr('hyper_traffic.training_started',{name:HS_MODELS[n],a:CITY[c].name,b:CITY[b].name,date:dateStr(due)}),'good');sfx('build');after();},
});
FREEZE_ACTS.push('hsReplica','hsPath');
