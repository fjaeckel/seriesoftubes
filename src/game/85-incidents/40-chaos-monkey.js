/* ---------- the chaos monkey: a visitor that breaks things on purpose ----------
   Like the real one (Netflix, 2011): something switches off random bits of production so you find out whether the
   rest copes. Now and then, in On-call and BGP at 3 a.m. only, a monkey moves in for 120 to 240 days and snips a tube
   every couple of weeks, preferring tubes with no other path round them. Its snips stand in for the usual random
   failures while it is here, so the visit is a test, not a pile-on. Get through it without a customer noticing and
   there is a bonus; a banana sends it home early. S.monkey: next (day of the next visit, null until the first tick),
   on, start, until, snip (day of the next snip), n (snips), hurt (snips customers felt), c (city it last snipped by). */
const MK_SNIPS=[N_('chaos_monkey.snip_unplugged'),N_('chaos_monkey.snip_sprayed'),N_('chaos_monkey.snip_to_see')];
const mkSpicy=()=>rule('chaos')==='spicy';
// Only the real game with real chaos: not Change Freeze (calm), Sandbox, puzzles or scenarios.
function mkElig(){return !!S&&S.mode!=='sandbox'&&S.mode!=='puzzle'&&!S.scn&&!S.lost&&['normal','spicy'].includes(rule('chaos'));}
const mkOn=()=>!!(S&&S.monkey&&S.monkey.on&&mkElig());
const rint=(a,n)=>a+Math.floor(Math.random()*n);
// A quarter of a month's revenue to send it home; half a month's as the bonus for outlasting it.
const mkBananaCost=()=>Math.round(Math.min(1e6,Math.max(10000,(R.revMo||0)*0.25))/1000)*1000;
const mkBonus=()=>Math.round(Math.min(2e6,Math.max(20000,(R.revMo||0)*0.5))/1000)*1000;
// Is there another way between this tube's ends once its whole trench is gone? If not, it is a weak spot.
function mkWeak(l){const trc=l.trench||l.id,adj={};
  for(const x of S.links){if(x===l||(x.trench||x.id)===trc||linkDown(x))continue;(adj[x.a]||(adj[x.a]=[])).push(x.b);(adj[x.b]||(adj[x.b]=[])).push(x.a);}
  const seen=new Set([l.a]),q=[l.a];while(q.length){const c=q.pop();if(c===l.b)return false;for(const n of adj[c]||[])if(!seen.has(n)){seen.add(n);q.push(n);}}return true;}
function mkTick(d){const M=S.monkey;if(!M)return;
  if(!mkElig()){if(M.on)mkLeave('quiet');return;}
  // The first visit is spread by the ASN, not the dice, so a game's other luck stays exactly as it was.
  if(M.next==null)M.next=d+(mkSpicy()?180:270)+(S.asn||0)%120;
  if(!M.on){if(d<M.next)return;if(S.links.filter(l=>l.kind!=='vxc'&&!linkDown(l)).length<3){M.next=d+30;return;}mkArrive(d);return;}
  if(d>=M.until){mkLeave();return;}
  if(d>=M.snip){mkSnip();M.snip=d+(mkSpicy()?rint(9,7):rint(14,11));}}
function mkArrive(d){const M=S.monkey,cs=Object.keys(S.pops),len=mkSpicy()?rint(180,61):rint(120,121);
  S.stats.mkMet=(S.stats.mkMet||0)+1;
  Object.assign(M,{on:1,start:d,until:d+len,snip:d+3,n:0,hurt:0,c:cs.length?pick(cs):S.home});
  toast(tr('chaos_monkey.arrived',{n:len}),'bad',[{l:tr('chaos_monkey.banana',{cost:fmt$(mkBananaCost())}),act:'mkBanana',args:{}}],{a:'tab',v:'noc'});sfx('alert');track('monkey_arrive');
  if(typeof mkStart==='function'&&CITY[M.c])mkStart(M.c);}
function mkSnip(){const M=S.monkey,live=S.links.filter(l=>l.kind!=='vxc'&&!linkDown(l));if(!live.length)return;
  // Weak spots first: a sample keeps this cheap on big networks.
  const smp=live.length>40?Array.from({length:40},()=>pick(live)):live,l=pick(smp.flatMap(x=>mkWeak(x)?[x,x,x,x,x]:[x]));
  const dur=rint(3,4),trc=l.trench||l.id,hit=S.links.filter(x=>(x.trench||x.id)===trc),A=CITY[l.a].name,B=CITY[l.b].name,before=R.served;
  hit.forEach(x=>x.cut=Math.max(x.cut||0,S.day+dur));M.n++;M.c=l.a;
  addInc({type:'cut',ref:trc,until:S.day+dur,msg:tr(pick(MK_SNIPS),{a:A,b:B}),cost:Math.max(4000,Math.round(hit.reduce((a,x)=>a+x.mo,0)*0.5))},'');
  compute();const i=S.inc[S.inc.length-1],imp=Math.max(0,before-R.served);if(i)i.impact=imp;
  const felt=before>1&&imp>=before*0.03;if(felt)M.hurt++;else S.stats.survived++;
  toast(felt?`<b>🐒 ${incTitle('cut')}</b><br>${esc(i?i.msg:'')}`:tr('chaos_monkey.rerouted',{a:A,b:B}),felt?'bad':'good',[],i?incOpen(i):null);sfx(felt?'err':'alert');
  if(typeof mkRun==='function'){if(!UI.mk&&CITY[M.c])mkStart(M.c);mkRun(l,1400,felt);}}
// why: 'banana' (bribed), 'quiet' (the rules or the game changed under it), or nothing (its time was up).
function mkLeave(why){const M=S.monkey,d=S.day,ok=!why&&M.n>0&&M.hurt===0;M.on=0;M.next=d+(mkSpicy()?rint(220,181):rint(360,361));
  // The usual failures were paused for the visit; give the NOC a breather before they start again.
  S.nextFail=Math.max(S.nextFail,d+15);
  if(why==='banana')toast(tr('chaos_monkey.bribed'),'good');
  else if(ok){const b=mkBonus();S.cash+=b;S.stats.mkSurv=(S.stats.mkSurv||0)+1;toast(tr('chaos_monkey.survived',{n:M.n,cash:fmt$(b)}),'goal');sfx('coin');track('monkey_survived');}
  else if(!why)toast(tr('chaos_monkey.went_home',{n:M.n,hurt:M.hurt}),'');
  if(typeof mkEnd==='function')mkEnd(ok,true);}
// The NOC tab's card while it is here.
function mkCard(){if(!mkOn())return '';const M=S.monkey,c=mkBananaCost();
  return `<div class="inc" style="background:#FFF1D6;border:1px solid #FFC56B"><div class="nm">🐒 ${tr('chaos_monkey.loose')}</div><div class="meta">${tr('chaos_monkey.card',{n:Math.max(1,M.until-S.day),s:M.n,hurt:M.hurt})}</div><div class="btns">${btn(tr('chaos_monkey.banana',{cost:fmt$(c)}),'mkBanana',{},'sm',S.cash<c)}</div></div>`;}
