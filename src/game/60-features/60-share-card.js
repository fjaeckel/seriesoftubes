/* ---------- share card ---------- */
// Straight link segments in map coordinates for flat maps. A link across the date line leaves one edge
// and comes back in at the other, so it becomes two segments, one per edge (#42).
function linkSegs(){const out=[];for(const l of S.links){const A=CITY[l.a],B=CITY[l.b];if(!A||!B)continue;const d=Math.abs(B.x-A.x)>W/2?(B.x<A.x?W:-W):0;
  for(const o of d?[0,-d]:[0])out.push([A.x+o,A.y,B.x+d+o,B.y]);}return out;}
function shareCanvas(){const Wc=1200,Hc=630,cv=document.createElement('canvas');cv.width=Wc;cv.height=Hc;const g=cv.getContext&&cv.getContext('2d');if(!g)return null;
  g.fillStyle='#57C4E5';g.fillRect(0,0,Wc,Hc);
  // mini map
  const mx=40,my=150,mw=700,mh=350,sx=mw/W,sy=mh/H;g.save();g.beginPath();g.rect(mx,my,mw,mh);g.clip();g.fillStyle='#3AA6CF';g.fillRect(mx,my,mw,mh);
  g.fillStyle='#9BDA6C';g.strokeStyle='#1E2640';g.lineWidth=1.5;for(const pts of COAST){g.beginPath();pts.forEach((q,i)=>i?g.lineTo(mx+q[0]*sx,my+q[1]*sy):g.moveTo(mx+q[0]*sx,my+q[1]*sy));g.closePath();g.fill();g.stroke();}
  g.strokeStyle='#FF4F9A';g.lineWidth=2.5;for(const [x1,y1,x2,y2] of linkSegs()){g.beginPath();g.moveTo(mx+x1*sx,my+y1*sy);g.lineTo(mx+x2*sx,my+y2*sy);g.stroke();}
  for(const c in S.pops){const C=CITY[c];g.fillStyle='#FF4F9A';g.strokeStyle='#1E2640';g.lineWidth=2;g.beginPath();g.arc(mx+C.x*sx,my+C.y*sy,5,0,7);g.fill();g.stroke();}
  g.restore();g.strokeStyle='#1E2640';g.lineWidth=5;g.strokeRect(mx,my,mw,mh);
  // header
  g.fillStyle='#1E2640';g.font='900 54px "Baloo 2", sans-serif';g.textBaseline='top';g.fillText(S.name,40,28);
  g.font='800 26px Nunito, sans-serif';g.fillText(`AS${S.asn} · ${tierLabel()} · ${dateStr(S.day)}${ruleTag()?' · '+ruleTag():''}`,42,92);
  // stats
  const got=BADGES.filter(b=>S.ach&&S.ach[b.id]!==undefined),rk={l:0,e:1,r:2,c:3},lv=b=>bvar(S.achP&&S.achP[b.id]).lv,top=got.slice().sort((a,b)=>rk[a.r]-rk[b.r]||lv(b)-lv(a)).slice(0,8);
  const rows=[[tr('common.peak_traffic'),fmtG(S.stats.peak||0)],[tr('common.peered'),pct(R.peerShare||0)],[tr('common.pops'),tr('share_card.n_in_r_regions',{n:Object.keys(S.pops).length,r:regionsCount()})],[tr('common.links'),String(S.links.length)],[tr('common.customers'),String(S.biz.length)],[tr('common.incidents_survived'),String(S.stats.survived||0)],[tr('common.shark_bites'),String(S.stats.sharks||0)],[tr('common.badges'),`${got.length}/${BADGES.length}`]];
  if(S.solWon)rows.unshift(['⚡ '+tr('specialist.speed_of_light'),dateStr(S.solWon)]);
  if(S.scn)rows.unshift([scnName(),S.scn.done?(S.scn.id==='weekly'?tr('share_card.score_v',{v:fmtG(S.scn.score||S.stats.peak||0)}):tr('features.done_in_d_days',{d:S.scn.done})):S.scn.failed?tr('share_card.not_this_time'):tr('common.in_progress')]);
  let y=150;for(const [k,v] of rows.slice(0,9)){g.fillStyle='#fff';g.strokeStyle='#1E2640';g.lineWidth=3;g.beginPath();g.roundRect?g.roundRect(770,y,390,42,12):g.rect(770,y,390,42);g.fill();g.stroke();g.fillStyle='#5A6280';g.font='800 18px Nunito, sans-serif';g.fillText(k,786,y+11);g.fillStyle='#1E2640';g.font='900 22px Nunito, sans-serif';const tw=g.measureText(v).width;g.fillText(v,1146-tw,y+9);y+=48;}
  // Badge variants show as a ring: frosted for Change Freeze, fiery for BGP at 3 a.m.
  top.forEach((b,i)=>{const v=S.achP&&S.achP[b.id];if(v&&v!=='oncall'&&own(BVAR,v)){g.strokeStyle=BVAR[v].col;g.lineWidth=4;g.beginPath();g.arc(60+i*48,537,22,0,7);g.stroke();}});
  g.font='34px sans-serif';top.forEach((b,i)=>g.fillText(b.i,40+i*48,520));
  {const n=v=>got.filter(b=>(S.achP&&S.achP[b.id]||'oncall')===v).length,f=n('freeze'),h=n('bgp');if(f||h){g.fillStyle='#1E2640';g.font='800 18px Nunito, sans-serif';g.fillText([h?`🔥 ${h}`:'',f?`🧊 ${f}`:''].filter(Boolean).join('  '),40+Math.max(1,top.length)*48+8,526);}}
  g.fillStyle='#1E2640';g.font='900 30px "Baloo 2", sans-serif';g.fillText('seriesoftub.es',40,572);g.font='700 20px Nunito, sans-serif';g.fillText(tr('share_card.build_the_internet_one_tube_at'),300,580);
  return cv;}
function shareModal(){const cv=shareCanvas();if(!cv){toast(tr('share_card.your_browser_cannot_draw_the_card'),'bad');return;}let url='';try{url=cv.toDataURL('image/png');}catch(e){}
  UI.shareCv=cv;openModal(`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('common.share')}</div><h2 style="font-size:26px">${tr('share_card.your_network_card')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>${url?`<img src="${url}" alt="${tr('share_card.stats_card_for_name',{name:esc(S.name)})}" style="width:100%;border:3px solid var(--ink);border-radius:12px;margin-top:8px">`:''}<div class="btns" style="margin-top:10px">${navigator.share?btn(tr('common.share_2cd9'),'shareGo',{},'pink'):''}${btn(tr('common.download_png'),'shareDl',{},navigator.share?'':'pink')}</div><p class="note">${tr('share_card.post_it_wherever_your_peering')}</p>`);track('share_open');}
function shareFile(cb){const cv=UI.shareCv;if(!cv||!cv.toBlob){cb(null);return;}cv.toBlob(b=>cb(b?new File([b],`series-of-tubes-${slug(S.name)}.png`,{type:'image/png'}):null),'image/png');}
