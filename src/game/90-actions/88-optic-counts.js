// Quote the whole change before spending: shelf optics still need regen cards.
function opticCountCost(l,o,n){
  const add=Math.max(0,n-(l.ch||[]).filter(k=>k===o).length),sp=Math.min(add,spareN(o)),r=REGEN_CH*(l.regen|0),c=optCost(o);
  return sp*Math.round(c*r)+(add-sp)*Math.round(c*(1+r));
}
// Managed waves sold on a fiber ride what its optics light (mwG()): taking optics out must leave more than that, or
// your own traffic gets nothing and the fiber goes dark (#440). An optic out of service for now does not count.
function mwShort(l,ch){const w=mwG(l);return w&&dfLit({...l,ch,chFail:null})<=w?tr('optic_counts.managed_waves_need_more',{g:fmtG(w)}):'';}
Object.assign(ACT,{
 setChCount:({id,o,n})=>{
  const l=S.links.find(x=>x.id===id);
  if(!l||l.kind!=='df'||!own(OPT,o)||!Number.isSafeInteger(n)||n<0||n>chMax(l))return;
  const old=(l.ch||[]).filter(k=>k===o).length,d=n-old;
  if(!d)return;
  if(d>0){
   const why=chWhy(l,o);
   if(why){toast(tr('fiber_and_hardware.can_t_add_optic_why',{optic:OPT[o].n,why:esc(why)}),'bad');sfx('err');return;}
   const free=chMax(l)-(l.ch||[]).length-soldSlots(l);
   if(d>free){toast(tr('optic_counts.only_n_channels_free',{n:free}),'bad');sfx('err');return;}
   if(!portGate(l.a,d*chPorts(o,l.a))||!portGate(l.b,d*chPorts(o,l.b))||!spend(opticCountCost(l,o,n)))return;
   const sp=Math.min(d,spareN(o));if(sp)S.spares[o]-=sp;
   (l.ch=l.ch||[]).push(...Array(d).fill(o));
  }else{
   let left=-d;const ch=l.ch.filter(k=>k!==o||left--<=0),why=mwShort(l,ch);
   if(why){toast(why,'bad');sfx('err');return;}
   l.ch=ch;
   S.spares=S.spares||{};S.spares[o]=(S.spares[o]||0)-d;
  }
  if(UI.opticCounts)delete UI.opticCounts[JSON.stringify([id,o])];
  after();
 },
});
