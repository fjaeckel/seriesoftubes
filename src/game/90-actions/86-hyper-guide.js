/* ---------- The Hyperscaler's first steps: actions (39-hyper-story.js) ---------- */
Object.assign(ACT,{
 // Dismiss the guide for good: this save and this browser.
 hsGuideSkip:()=>{if(S&&S.hs)S.hs.guide=null;try{localStorage.setItem(HS_GD_KEY,'1');}catch(e){}renderCoach();},
});
