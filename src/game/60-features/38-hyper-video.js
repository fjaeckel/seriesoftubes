/* ---------- The Hyperscaler's own video platform, Tubular (37-hyper.js) ----------
   Video is most of what people pull from the internet (about 5.6 GB a user a day), and the biggest clouds run their own
   platforms. From level HS_VID.lv the player may launch Tubular, once, for HS_VID.cost. Its audience builds up over
   HS_VID.ramp days to HS_VID.max times what your users already pull (video becomes some 60% of it). Video is the most
   cacheable thing there is: HS_VID.edge of it can be served by an edge stack at the front door (and by edge nodes in
   partner networks), the rest comes from the region over your backbone. Ads pay little per bit: a Gbps of video earns
   HS_VID.rate of what other traffic does. Uploads are copied to each region's replica (HS_VID.rep of the video). So
   video pays only if it is served close and cheap: edge stacks, peering and backbone everywhere.
   S.hs.vid: {since} once launched. hsVidF(): video as a share of users' other traffic, today. */
const HS_VID={lv:6,cost:5000000,max:1.5,ramp:180,edge:0.8,rate:0.3,rep:0.1};
const hsVidF=()=>{const V=S&&S.hs&&S.hs.vid;return V?HS_VID.max*clamp((S.day-V.since)/HS_VID.ramp,0,1):0;};
// Users' demand with video on top, and the share of it an edge stack (or a partner's edge node) can serve.
const hsVidD=d=>d*(1+hsVidF());
const hsEdgeSh=()=>{const v=hsVidF();return (HS_EDGE+v*HS_VID.edge)/(1+v);};
// What a Gbps of a country's traffic earns, video included, against plain traffic.
const hsVidRev=()=>{const v=hsVidF();return (1+v*HS_VID.rate)/(1+v);};
// Why Tubular cannot launch now, or ''.
const hsVidWhy=()=>!S.hs?'':S.hs.vid?tr('hyper_video.live_already'):lvl()<HS_VID.lv?tr('hyper_video.need_level',{lv:HS_VID.lv}):!Object.keys(S.hs.cc).length?tr('hyper_video.need_users'):'';
CX_SAN.push((h0,o,s)=>{const V=h0.vid;if(V&&typeof V==='object'&&Number.isFinite(+V.since))o.vid={since:clamp(Math.round(+V.since),0,Math.max(0,s.day|0))};});
