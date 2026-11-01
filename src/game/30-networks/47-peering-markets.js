// Domestic concentration sets a minimum for private interconnection, separate from public IX policy.
const PNI_NEED={};
{for(const [cc,rows] of Object.entries(COUNTRY_EYES)){
 const total=Object.entries(rows).reduce((s,[id,v])=>s+(NET[id].wholesale?0:v),0);
 for(const [id,v] of Object.entries(rows)){const n=NET[id],share=v/total;
   if(!n.wholesale&&n.type!=='t1'&&(Array.isArray(n.cc)?n.cc:[n.cc]).includes(cc)&&share>=0.15)PNI_NEED[id]=Math.max(PNI_NEED[id]||0,Math.ceil((20+80*share)/5)*5);}
}}
// PeeringDB declarations: these networks do not exchange routes through public route servers.
const PEER_NORS=new Set([
 'alb',
 'amz',
 'bst',
 'cauc',
 'cit',
 'cog',
 'dtk',
 'fst',
 'gtt',
 'hrt',
 'init',
 'mat',
 'mgn',
 'msf',
 'mtf',
 'ntt',
 'o2g',
 'pcw',
 'pxm',
 'rtc',
 'sny',
 'spc',
 'sun',
 'tcn',
 'tdc',
 'tlt',
 'tlu',
 'tly',
 'tng',
 'tnr',
 'ups',
 'vdp',
 'work'
]);
