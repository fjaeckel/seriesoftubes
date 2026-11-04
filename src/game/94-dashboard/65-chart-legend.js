/* The NOC charts: legend entries switch a series on and off (the scale follows what is left), and hovering or
   touching a chart shows every visible series on that day. View state only: UI.chartOff is never saved. */
const CHARTS={
  traffic:{stack:['c','p','ix','t','l2'],lines:['dem'],fmt:v=>fmtG(v),name:k=>k==='dem'?tr('common.demand'):EGC[k][0],col:k=>k==='dem'?'#1E2640':EGC[k][1]},
  mix:{stack:['c','p','ix','t'],lines:[],fmt:v=>fmtG(v),name:k=>EGC[k][0],col:k=>EGC[k][1]},   // the Traffic tab's table
  money:{stack:[],lines:['rev','cost'],fmt:v=>fmt$(v),name:k=>k==='rev'?tr('common.revenue'):tr('common.costs'),col:k=>k==='rev'?'#16A866':'#FF4D5E'}
};
const chartKeys=C=>[...C.stack,...C.lines];
function chartLegend(id,label){const C=CHARTS[id],off=(UI.chartOff&&UI.chartOff[id])||{};
  return `<div class="legend">${chartKeys(C).map(k=>`<button class="lg${off[k]?' off':''}" aria-pressed="${!off[k]}" data-act="chartToggle" data-args="${esc(JSON.stringify({c:id,k}))}"><i style="background:${k==='dem'?'#fff;border-style:dashed':C.col(k)}"></i>${C.name(k)}${label?label(k):''}</button>`).join('')}</div>`;}
Object.assign(ACT,{
  chartToggle:({c,k})=>{const C=CHARTS[c];if(!C||!chartKeys(C).includes(k))return;
    const off=((UI.chartOff=UI.chartOff||{})[c]=UI.chartOff[c]||{});if(off[k])delete off[k];else off[k]=1;
    if(chartKeys(C).every(x=>off[x]))UI.chartOff[c]={};   // nothing left to draw: show everything again
    renderDash();},
});
// The tooltip and its cursor line sit on <body>, outside the dashboard, so the per-tick redraw never removes them.
// Pointer moves are frequent: the tip is only rebuilt (and measured) when what it shows changes, not on every pixel.
let chartTip=null,chartCur=null,chartKey='',chartTw=0,chartTh=0;
function chartHide(){if(chartTip&&!chartTip.hidden){chartTip.hidden=chartCur.hidden=true;chartKey='';}}
function chartEnsure(){if(!chartTip){chartTip=document.createElement('div');chartTip.className='chtip';chartCur=document.createElement('div');chartCur.className='chcur';document.body.append(chartCur,chartTip);}}
// Fill the tip when its content key changes; measure it once, so moving inside the same content reads no layout.
function chartFill(key,html,showCur){if(key===chartKey&&!chartTip.hidden)return false;chartKey=key;chartTip.innerHTML=html;chartTip.hidden=false;chartCur.hidden=!showCur;chartTw=chartTip.offsetWidth;chartTh=chartTip.offsetHeight;return true;}
// Keep the tip inside the window, beside x and above y (below it when there is no room).
function chartPlace(x,cy){const tw=chartTw,th=chartTh;
  chartTip.style.left=Math.max(4,Math.min(innerWidth-tw-4,x+12>innerWidth-tw-4?x-tw-12:x+12))+'px';
  chartTip.style.top=Math.max(4,Math.min(innerHeight-th-4,cy-th-8<4?cy+14:cy-th-8))+'px';}
function chartShow(svg,cx,cy){const id=svg.dataset.ch,C=CHARTS[id],H=S&&S.hist||[],n=Math.min(90,H.length),r=svg.getBoundingClientRect(),[bW,bH,bL,bT,bB,bR]=svg.dataset.box?svg.dataset.box.split(',').map(Number):[CHBOX.W,CHBOX.H,CHBOX.L,CHBOX.T,CHBOX.B,CHBOX.R];
  if(!C||n<2||!r.width)return chartHide();
  chartEnsure();
  const sx=r.width/bW,i=Math.max(0,Math.min(n-1,Math.round(((cx-r.left)/sx-bL)/(bW-bL-bR)*(n-1)))),row=H[H.length-n+i],off=(UI.chartOff&&UI.chartOff[id])||{};
  const x=r.left+(bL+(bW-bL-bR)*i/(n-1))*sx;
  const key=id+'|'+row.d+'|'+Object.keys(off).join();
  if(chartFill(key,chartHtml(C,row,off),true)||chartCur.dataset.x!==String(x)){chartCur.dataset.x=x;chartCur.style.cssText=`left:${x}px;top:${r.top+bT*sx}px;height:${(bH-bT-bB)*sx}px`;}
  chartPlace(x,cy);}
function chartHtml(C,row,off){const ks=chartKeys(C).filter(k=>!off[k]),st=C.stack.filter(k=>!off[k]);
  return `<b>${dateStr(row.d)}</b>`+ks.map(k=>`<div><i style="background:${C.col(k)}"></i>${C.name(k)}<span>${C.fmt(row[k]||0)}</span></div>`).join('')+(st.length>1?`<div class="tot">${tr('dashboard.chart_total')}<span>${C.fmt(st.reduce((a,k)=>a+(row[k]||0),0))}</span></div>`:'');}
// The "how it arrives" bars of the Traffic tab: the same tip, with each way in and its share.
function mixShow(el,cx,cy){const raw=el.dataset.mix;chartEnsure();
  if(chartKey!=='mix|'+raw||chartTip.hidden){let m;try{m=JSON.parse(raw);}catch(e){return chartHide();}
    const ks=['c','p','ix','t'].filter(k=>m[k]>0),tot=ks.reduce((a,k)=>a+m[k],0);
    chartFill('mix|'+raw,ks.length?ks.map(k=>`<div><i style="background:${EGC[k][1]}"></i>${EGC[k][0]}<span>${fmtG(m[k])} · ${pct(m[k]/tot)}</span></div>`).join(''):tr('common.nothing_yet'),false);}
  chartPlace(cx,cy);}
for(const t of ['pointermove','pointerdown'])document.addEventListener(t,e=>{const c=e.target.closest&&e.target.closest('svg[data-ch],.mix[data-mix]');if(!c)chartHide();else if(c.dataset.mix!==undefined)mixShow(c,e.clientX,e.clientY);else chartShow(c,e.clientX,e.clientY);});
