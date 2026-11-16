Object.assign(ACT,{
 custGo:({id})=>{const b=S.biz.find(x=>x.id===id);if(!b)return;$('dash').hidden=true;
  // An orbit terminal far from your POPs opens the POP whose dish lands it.
  {const L=!S.pops[b.city]&&pieLandOf(b);if(L){UI.tab='cust';ACT.focusCity({city:L});return;}}
  ACT.focusCity({city:b.city});UI.tab='cust';renderPanel();},
 dashRow:({k})=>{if(typeof k!=='string'||k.length>80)return;UI.dashOpen=UI.dashOpen===k?null:k;UI.confirm=null;renderDash();},
 listMore:({k})=>{if(!['traffic','lease','conn','cust','nets','pni','pops','links','routers','ddos'].includes(k))return;UI.listN=UI.listN||{};UI.listN[k]=listN(k)+listPg(k);if(k==='nets'){renderLeft();return;}if(k==='pni'){renderPanel();return;}renderDash();},
 custF:({v})=>{UI.kf=UI.kf||{};UI.kf.f=v==='sad'?'sad':'';listReset('cust');renderDash();},
 custCity:({v})=>{UI.kf=UI.kf||{};UI.kf.city=isCity(v)?v:'';listReset('cust');renderDash();},
 custSort:({k})=>{if(!['mood','mo','name','city'].includes(k))return;listReset('cust');if(UI.custSort===k)UI.custDir=-(UI.custDir||1);else{UI.custSort=k;UI.custDir=k==='mo'?-1:1;}renderDash();},
 custOpen:({sad}={})=>{if(!S)return;UI.kf=sad?{f:'sad'}:{};UI.custHi=null;listReset('cust');UI.dtab='cust';const d=$('dash');d.hidden=false;renderDash();d.scrollTop=0;},
 popGo:({city})=>{if(!isCity(city)||!cityOn(city))return;$('dash').hidden=true;ACT.focusCity({city});},
 popsReg:({v})=>{UI.popF=UI.popF||{};UI.popF.reg=own(REG,v)?v:'';listReset('pops');renderDash();},
 popsSort:({k})=>{if(!['eye','cost','name'].includes(k))return;listReset('pops');const sk=UI.popSort||'eye',d0=k==='eye'?-1:1;UI.popDir=sk===k?-(UI.popDir||d0):d0;UI.popSort=k;renderDash();},
 goConn:({city,k})=>{if(!isCity(city)||!own(CONN_K,k))return;$('dash').hidden=true;ACT.goEgress({city,k});},
 connF:({f,v})=>{const F=UI.cf=UI.cf||{};listReset('conn');if(f==='all'){UI.cf={};}else if(f==='k'){F.k=own(CONN_K,v)?v:'';}renderDash();},
 connCity:({v})=>{UI.cf=UI.cf||{};listReset('conn');UI.cf.city=isCity(v)?v:'';renderDash();},
 connNet:({v})=>{UI.cf=UI.cf||{};listReset('conn');UI.cf.net=NET[v]?v:'';renderDash();},
 connSort:({k})=>{if(!['k','city','name','use','mo'].includes(k))return;listReset('conn');if(UI.connSort===k)UI.connDir=-(UI.connDir||1);else{UI.connSort=k;UI.connDir=k==='use'||k==='mo'?-1:1;}renderDash();},
 infraF:({v})=>{if(v!==''&&!LK.includes(v))return;UI.infraF=v;listReset('links');renderDash();},
 infraHot:({w,v})=>{if((w!=='links'&&w!=='routers')||(v!==''&&!own(LH,v))||(w==='routers'&&v==='down'))return;listReset(w);UI.infraHot={...UI.infraHot,[w]:(UI.infraHot||{})[w]===v?'':v};renderDash();},
 rtrCity:({v})=>{UI.rtrF={...UI.rtrF,city:S.pops[v]?v:''};listReset('routers');renderDash();},
 rtrFs:({v})=>{UI.rtrF={...UI.rtrF,fs:['use','has','none'].includes(v)?v:''};listReset('routers');renderDash();},
 rtrReg:({v})=>{UI.rtrF={...UI.rtrF,reg:own(REG,v)?v:''};listReset('routers');renderDash();},
 infraCity:({v})=>{UI.infraCity=isCity(v)?v:'';listReset('links');renderDash();},
 infraSort:({w,k})=>{if((w!=='links'&&w!=='routers')||!['use','cap','name','ports','type','n','fs'].includes(k)||(w!=='routers'&&['ports','type','n','fs'].includes(k)))return;listReset(w);const I=UI.infraSort=UI.infraSort||{},o=I[w]||{},d0=k==='name'?1:-1;I[w]={k,d:(o.k||'use')===k?-(o.d||d0):d0};renderDash();},
 connFor:({net})=>{if(!NET[net])return;UI.cf={net};ACT.connOpen();},
 connCancel:({k,id})=>{const r=conns().find(x=>x.k===k&&x.id===id);if(!r||r.mine)return;const key='cc:'+k+':'+id;if(UI.confirm!==key){UI.confirm=key;renderDash();return;}UI.confirm=null;
   if(k==='t')ACT.cancelTransit({id,ok:1});else if(k==='p')ACT.cancelPni({id,ok:1});else if(k==='ix')ACT.cancelIx({city:id,ok:1});else if(k==='c')ACT.rmCache({id});else{const [city,prov]=id.split('|');ACT.rmNni({city,prov});}renderDash();},
 // The DDoS tab: from a toast, the NOC tab's attack card or the finder; its history filtered by outcome.
 ddosOpen:()=>{if(!S||pzOn())return;UI.dtab='ddos';const d=$('dash');if(d.hidden){d.hidden=false;winIn($('dashCard'));}renderDash();d.scrollTop=0;},
 ddosF:({v})=>{UI.ddF=DDOS_O.includes(v)&&UI.ddF!==v?v:'';listReset('ddos');renderDash();},
 connOpen:()=>{if(!S)return;UI.dtab='conn';listReset('conn');const d=$('dash');d.hidden=false;renderDash();d.scrollTop=0;},
});
