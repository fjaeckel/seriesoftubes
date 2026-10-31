function opticCountControl(l,o,n){
 const key=JSON.stringify([l.id,o]);let draft=UI.opticCounts&&UI.opticCounts[key];
 if(draft&&draft.base!==n){delete UI.opticCounts[key];draft=null;}
 const v=draft?draft.n:n,value=draft?draft.value:n;
 const price=Number.isSafeInteger(v)&&v>=0&&v<=chMax(l)?opticCountCost(l,o,v):0;
 return `<form class="optic-count" data-link="${esc(l.id)}" data-optic="${o}"><label>${tr('optic_counts.target_count')}<input class="t" type="number" name="count" min="0" max="${chMax(l)}" step="1" inputmode="numeric" required value="${esc(value)}" aria-label="${esc(tr('optic_counts.count_for_model',{model:OPT[o].n}))}"></label><button class="b sm" type="submit">${tr('optic_counts.apply_price',{price:fmt$(price)})}</button></form>`;
}
document.addEventListener('input',e=>{
 const f=e.target.closest('form.optic-count');if(!f||!S)return;
 const l=S.links.find(x=>x.id===f.dataset.link),o=f.dataset.optic,n=f.elements.count.valueAsNumber;
 if(!l||!own(OPT,o))return;
 UI.opticCounts=UI.opticCounts||{};UI.opticCounts[JSON.stringify([l.id,o])]={base:(l.ch||[]).filter(k=>k===o).length,n,value:e.target.value};
 e.target.setAttribute('value',e.target.value);
 f.querySelector('button').textContent=tr('optic_counts.apply_price',{price:fmt$(Number.isSafeInteger(n)&&n>=0&&n<=chMax(l)?opticCountCost(l,o,n):0)});
});
document.addEventListener('submit',e=>{
 const f=e.target.closest('form.optic-count');if(!f)return;e.preventDefault();
 if(!S||!f.reportValidity()||!$('modal').hidden)return;
 ACT.setChCount({id:f.dataset.link,o:f.dataset.optic,n:f.elements.count.valueAsNumber});
});
