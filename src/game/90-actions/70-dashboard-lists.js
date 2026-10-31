Object.assign(ACT,{
 custGo:({id})=>{const b=S.biz.find(x=>x.id===id);if(!b)return;$('dash').hidden=true;ACT.focusCity({city:b.city});UI.tab='cust';renderPanel();},
 listMore:({k})=>{if(k!=='conn'&&k!=='cust'&&k!=='nets'&&k!=='pni')return;UI.listN=UI.listN||{};UI.listN[k]=listN(k)+LIST_PAGE;if(k==='nets'){renderLeft();return;}if(k==='pni'){renderPanel();return;}renderDash();},
 custF:({v})=>{UI.kf=UI.kf||{};UI.kf.f=v==='sad'?'sad':'';listReset('cust');renderDash();},
 custCity:({v})=>{UI.kf=UI.kf||{};UI.kf.city=isCity(v)?v:'';listReset('cust');renderDash();},
 custSort:({k})=>{if(!['mood','mo','name','city'].includes(k))return;listReset('cust');if(UI.custSort===k)UI.custDir=-(UI.custDir||1);else{UI.custSort=k;UI.custDir=k==='mo'?-1:1;}renderDash();},
 custOpen:({sad}={})=>{if(!S)return;UI.kf=sad?{f:'sad'}:{};listReset('cust');UI.dtab='cust';const d=$('dash');d.hidden=false;renderDash();d.scrollTop=0;},
 goConn:({city,k})=>{if(!isCity(city)||!own(CONN_K,k))return;$('dash').hidden=true;ACT.goEgress({city,k});},
 connF:({f,v})=>{const F=UI.cf=UI.cf||{};listReset('conn');if(f==='all'){UI.cf={};}else if(f==='k'){F.k=own(CONN_K,v)?v:'';}renderDash();},
 connCity:({v})=>{UI.cf=UI.cf||{};listReset('conn');UI.cf.city=isCity(v)?v:'';renderDash();},
 connNet:({v})=>{UI.cf=UI.cf||{};listReset('conn');UI.cf.net=NET[v]?v:'';renderDash();},
 connSort:({k})=>{if(!['k','city','name','use','mo'].includes(k))return;listReset('conn');if(UI.connSort===k)UI.connDir=-(UI.connDir||1);else{UI.connSort=k;UI.connDir=k==='use'||k==='mo'?-1:1;}renderDash();},
 connFor:({net})=>{if(!NET[net])return;UI.cf={net};ACT.connOpen();},
 connCancel:({k,id})=>{const r=conns().find(x=>x.k===k&&x.id===id);if(!r||r.mine)return;const key='cc:'+k+':'+id;if(UI.confirm!==key){UI.confirm=key;renderDash();return;}UI.confirm=null;
   if(k==='t')ACT.cancelTransit({id,ok:1});else if(k==='p')ACT.cancelPni({id,ok:1});else if(k==='ix')ACT.cancelIx({city:id,ok:1});else if(k==='c')ACT.rmCache({id});else{const [city,prov]=id.split('|');ACT.rmNni({city,prov});}renderDash();},
 connOpen:()=>{if(!S)return;UI.dtab='conn';listReset('conn');const d=$('dash');d.hidden=false;renderDash();d.scrollTop=0;},
});
