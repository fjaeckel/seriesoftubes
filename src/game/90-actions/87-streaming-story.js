/* ---------- The Streaming service's first-steps guide (39-streaming-story.js) ---------- */
Object.assign(ACT,{
 cntGuideSkip:()=>{if(!S.cnt)return;S.cnt.guide=null;try{localStorage.setItem(GUIDE_KEY,'1');}catch(e){}renderCoach();},
});
