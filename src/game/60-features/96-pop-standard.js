/* ---------- The standard POP (#240) ----------
   Big networks run one design everywhere. A new POP gets the standard routers at once, while the box is still idle
   (no maintenance window): the model if it is unlocked and affordable, then the extra routers as cash allows. */
function popStdApply(city){const d=S.popStd,p=S.pops[city];if(!d||!p||pzOn())return;let miss=false;
  if(d.g!==(p.rgen||0)){if(techOk('rg',d.g,RG[d.g].lvl)&&S.cash>=swapCost(city,d.g)){spend(swapCost(city,d.g));p.rgen=d.g;}else miss=true;}
  while((p.routers||1)<d.rt){const k=routerCost(p.rgen||0,p.routers||1);if(S.cash<k){miss=true;break;}spend(k);p.routers=(p.routers||1)+1;}
  toast(miss?tr('pop_std.not_all_of_the_standard',{city:CITY[city].name}):tr('pop_std.city_gets_the_standard_n',{city:CITY[city].name,n:p.routers||1,model:esc(RG[p.rgen||0].n)}),miss?'bad':'good');}
// The line in a POP's router section: the standard, and a button to make this POP's routers the standard.
function popStdHtml(c){const p=S.pops[c];if(!p||pzOn())return '';const d=S.popStd,same=d&&d.g===(p.rgen||0)&&d.rt===(p.routers||1);
  return `<div class="kv"><span>${tr('pop_std.standard_for_new_pops')}</span><b>${d?`${d.rt} × ${esc(RG[d.g].n)}`:tr('pop_std.none')}</b></div><div class="btns">${same?'':btn(tr('pop_std.make_this_the_standard'),'popStdSet',{city:c},'ghost sm')}${d?btn(tr('pop_std.clear'),'popStdClear',{},'ghost sm'):''}</div>`;}
