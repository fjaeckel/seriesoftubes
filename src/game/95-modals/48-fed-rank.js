/* ---------- MULTIPLAYER: the rank chip in the HUD ----------
   A save that joined Multimode shows 🏆 and its rank on the default board next to the HUD's boxes; a tap opens the
   leaderboards. The rank is this network's own row (me) from the last ranks answer for the default slice: the boards
   sheet feeds it whenever it loads that slice, and otherwise it is asked every 30 s while the tab is visible and a
   server is connected (offline, the kept answer counts). Nothing runs in the day loop, and the chip is
   touched only when what it shows changes. fuMyRank() is the one way in, so live data can feed it more often later. */
const FU_RANK_EVERY=30;// seconds between asks
const FUR={key:null,me:null,at:0,busy:false,shown:null,up:false,t:null};
const fuRankOn=()=>!!(S&&UI.started&&S.fed&&S.fed.on&&S.fed.key&&fedEligible());
// This network's {rank, value} on the default board, or null when there is none yet.
const fuMyRank=()=>fuRankOn()&&FUR.me&&FUR.me.rank?FUR.me:null;
function fuMyRankSet(me){FUR.me=me&&Number.isSafeInteger(me.rank)?{rank:me.rank,value:me.value}:null;FUR.at=fuNow();fuRankChip();fuRankTick();}
// Asks the default slice (the same request as the sheet, so the sheet's offline copy stays whole). force: now.
async function fuMyRankLoad(force){if(!fuRankOn()||FUR.busy)return;
  if(!force&&(fuNow()-FUR.at<FU_RANK_EVERY-2||!FED.visible()||fedStatus().state!=='connected'))return;
  const k=S.fed.key.pub;FUR.busy=true;try{const sl=await fedRankView(fuSliceQ(fuDefQ()));if(fuRankOn()&&S.fed.key.pub===k)fuMyRankSet(sl&&sl.me);}catch(e){console.error('[tubes] rank chip',e);}finally{FUR.busy=false;if(FUR.key!==k&&fuRankOn())fuMyRankLoad(true);}}
// Called with the status dot (fuDot): cheap when nothing changed. Another save (or network) starts from no rank.
function fuRankChip(){const el=$('hFu');if(!el)return;const on=fuRankOn();
  if(!on){if(!el.hidden){el.hidden=true;FUR.shown=null;fitHud();}return;}
  if(FUR.key!==S.fed.key.pub){FUR.key=S.fed.key.pub;FUR.me=null;FUR.at=0;FUR.shown=null;fuMyRankLoad(true);}
  const m=fuMyRank(),k=m?String(m.rank):'';if(!el.hidden&&FUR.shown===k)return;
  const was=el.hidden;el.hidden=false;FUR.shown=k;$('hFuVal').textContent=m?'#'+m.rank:'';
  const t=m?tr('fedui.leaderboards_you_are_rank',{rank:m.rank}):tr('fedui.leaderboards');el.setAttribute('aria-label',t);el.title=t;
  if(was)fitHud();}
// After boot: the chip follows the save and the connection; a slow timer asks again while someone is looking.
// Just connected (again) or looked at again: ask now (the chip, and the open board), the answer before may be old.
function fuRankBoot(){fedOn('status',st=>{const c=!!st&&st.state==='connected',was=FUR.up;FUR.up=c;if(c&&!was){fuMyRankLoad(true);fuBoardsRefresh();}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&FUR.up){fuMyRankLoad(true);fuBoardsRefresh();}});
  fuRankChip();}
// The 30 s timer runs only while a joined save is open (armed by its first answer), and stops with it.
function fuRankTick(){if(FUR.t||!fuRankOn())return;FUR.t=FED.set(()=>{FUR.t=null;fuMyRankLoad().finally(fuRankTick);},FU_RANK_EVERY*1000);}
