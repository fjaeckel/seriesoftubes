/* Step a port down one size: exchange ports, transit ports and PNIs. Upgrading was possible, downsizing meant leaving and rejoining.
   A PNI stops at the smallest size the network sells (Tier 1s and closed CDNs: no 10G). */
Object.assign(ACT,{
 downIx:({city})=>{const had=S.ixp[city];if(had===undefined||S.myIx[city]||!(had>0))return;
   S.ixp[city]=had-1;toast(tr('ix_downgrade.port_downgraded_at_ix',{port:PORT[had-1].n,ix:esc(ixName(city))}),'good');sfx('click');after();},
 downT:({id})=>{const t=S.transit.find(x=>x.id===id);if(!t||!(t.tier>0))return;t.tier--;
   toast(tr('ix_downgrade.transit_downgraded',{net:esc(NET[t.net].name),city:CITY[t.city].name,port:lagName(t.tier,t.n)}),'good');sfx('click');after();},
 downP:({id})=>{const p=S.pni.find(x=>x.id===id);if(!p||!pniOn(p)||p.up||p.g1||!(p.tier>pniMin(p.net)))return;p.tier--;
   toast(tr('ix_downgrade.pni_downgraded',{net:esc(NET[p.net].name),city:CITY[p.city].name,port:pniPN(p)}),'good');sfx('click');after();},
});
