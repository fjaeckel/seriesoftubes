/* ---------- Launch freezes: a game studio's launch day (37-hyper.js, the change freeze in 37-content-core.js) ----------
   Game studio tenants (CLOUD_TENANTS.game) launch big games now and then, announced HS_LF_AHEAD days ahead: for two or
   three days the studio's traffic is several times its usual (hsSpike, read by hsFlows), and nobody load-tested it.
   From the day before the launch to its end the network is frozen (CX_FREEZE): every action in FREEZE_ACTS refuses,
   the intern's too. Build what the spike needs before the freeze. Each launch day counts how much of the studio's
   traffic was served (hsLfServed); a launch served on average at least HS_LF_OK pleases the studio (happier, and
   sometimes a new term at a better rate); less is a funny disaster, and a much unhappier studio.
   S.hs.lf: the launch announced or under way: id the tenant, g the game (an index in HS_GAMES), ann the day announced,
   from the first day of the spike, until the day after it, f the spike, q the served shares added up, k the days counted.
   S.hs.lfn: the earliest day the next launch is announced. Rolls are hashes (hsRvU), never Math.random. */
const HS_LF_AHEAD=10,HS_LF_OK=0.9,HS_LF_GAP=60;
const HS_GAMES=['Battle Royale with Cheese','Loot Goblins Online','Lag of Legends','Speedrun Simulator 2027','Farm Sim: Electric Boogaloo','Respawn Responsibly','Grand Theft Autocomplete','Call of Duty-Free'];
const HS_LF_FAIL=[N_('hyper_freeze.fail_queue'),N_('hyper_freeze.fail_lag'),N_('hyper_freeze.fail_meme'),N_('hyper_freeze.fail_refund')];
const hsLf=()=>S&&S.hs&&S.hs.lf||null;
const hsLfOn=L=>!!L&&S.day>=L.from&&S.day<L.until;
// The spike on a tenant tonight (hsFlows multiplies its Gbps).
const hsSpike=b=>{const L=hsLf();return L&&L.id===b.id&&hsLfOn(L)?L.f:1;};
// How much of a tenant's traffic was served this evening: placed in a region, through its front door, hauled.
function hsLfServed(r,b){const T=r&&r.hs&&r.hs.ten[b.id];if(!T||!T.v)return 0;const hw=T.hw+(T.bt||0),hauled=hw>1e-9?clamp((T.got+(T.btg||0))/hw,0,1):1;return clamp(T.f*sfOf(r,T.v)*hauled,0,1);}
// The freeze: from the day before the launch until it is over.
CX_FREEZE.push(()=>{const L=hsLf();return L&&S.day>=L.from-1&&S.day<L.until?{show:tr('hyper_freeze.show',{game:HS_GAMES[L.g]}),until:L.until}:null;});
/* A day: a launch day is counted, a launch ends (surviving or not), or a studio announces the next one. */
function hsLfDay(d){const H=S.hs;if(!H||!('lfn' in H))return;const L=H.lf;
  if(L){const b=S.biz.find(x=>x.id===L.id&&x.type==='cloud');
    if(!b){delete H.lf;H.lfn=d+30;toast(tr('hyper_freeze.cancelled',{game:HS_GAMES[L.g]}),'');return;}
    if(d>=L.from&&d<L.until){L.q+=hsLfServed(R,b);L.k++;}
    if(d>=L.until-1&&d>=L.from){const p=L.k?L.q/L.k:0,v={name:esc(b.name),game:HS_GAMES[L.g],p:pct(p)};delete H.lf;H.lfn=d+HS_LF_GAP+Math.floor(hsRvU('lfn|'+d)*60);
      if(p>=HS_LF_OK){b.mood=Math.min(100,b.mood+25);let t=`🚀 ${tr('hyper_freeze.survived',v)}`;
        if(hsRvU('lfr|'+b.name+'|'+d)<0.5&&clOn(b)){clRenew(b,b.rate*1.1);t+='<br>'+tr('hyper_freeze.renewed',{name:esc(b.name),date:dateStr(b.te)});}
        toast(t,'goal');sfx('coin');}
      else{b.mood=Math.max(1,b.mood-40);toast(`💥 ${tr(HS_LF_FAIL[Math.floor(hsRvU('lff|'+d)*HS_LF_FAIL.length)],v)}<br>${tr('hyper_freeze.failed_p',{p:pct(p),ok:pct(HS_LF_OK)})}`,'bad',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);sfx('err');}}
    return;}
  if(d<H.lfn)return;const gs=hsTen().filter(b=>b.ck==='game'&&d-(b.since||0)>=20).sort((a,b)=>a.id<b.id?-1:1);if(!gs.length){H.lfn=d+30;return;}
  // A launch is a crisis: the director (38-hyper-director.js) says when; asked again in a few days if not now.
  if(!hsDirAsk('freeze',1)){H.lfn=d+3;return;}
  const b=gs[Math.floor(hsRvU('lfb|'+d)*gs.length)],from=d+HS_LF_AHEAD+Math.floor(hsRvU('lfa|'+d)*5),n=2+(hsRvU('lfd|'+d)<0.5?1:0),f=Math.round((3+2*hsRvU('lff|'+b.name+'|'+d))*10)/10,g=Math.floor(hsRvU('lfg|'+d)*HS_GAMES.length);
  H.lf={id:b.id,g,ann:d,from,until:from+n,f,q:0,k:0};
  toast(`📣 ${tr('hyper_freeze.announced',{name:esc(b.name),game:HS_GAMES[g],date:dateStr(from),f,n,a:dateStr(from-1),z:dateStr(from+n)})}`,'warn',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);}
CX_DAY.push(hsLfDay);
CX_NEW.push(o=>{o.lfn=S.day+60;});
CX_SAN.push((h0,o,s)=>{const n=(v,d)=>Number.isFinite(+v)?+v:d,I=v=>Math.round(n(v,0)),x=h0.lf;
  o.lfn=h0.lfn===undefined?I(s.day)+60:I(h0.lfn);
  if(x&&typeof x==='object'&&!Array.isArray(x)&&(s.biz||[]).some(b=>b&&b.type==='cloud'&&b.id===x.id)){const from=I(x.from);
    o.lf={id:x.id,g:clamp(I(x.g),0,HS_GAMES.length-1),ann:I(x.ann),from,until:clamp(I(x.until),from+1,from+5),f:clamp(n(x.f,3),1,10),q:clamp(n(x.q,0),0,10),k:clamp(I(x.k),0,10)};}});
