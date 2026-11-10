/* ================= AGENT API: doing things =================
   One action, run as the game runs it, and reported through the game's own channels: what it said (toast), what it
   charged at the money gate (spend) and whether anything changed (a fingerprint of S). The API checks shape and domain
   only; whether a move is allowed is the game's to answer. */

// Arguments: shape and domain only. Anything beyond that is the game's to answer.
function apiValidate(spec,args){
  const problems=[],out={};
  for(const [name,dom,req] of spec.args||[]){
    const v=args[name];
    if(v===undefined){if(req!==false)problems.push(`${name} is required`);continue;}
    if(apiDomCheck(dom,v).ok){out[name]=v;continue;}
    const vs=apiDomValues(dom),d=API_DOMAINS[dom];
    problems.push(`${name}: ${JSON.stringify(v)} is not a ${dom}${d&&d.table&&d.kind==='id'?` (see catalog ${d.table} or find)`:Array.isArray(vs)?` (one of ${vs.slice(0,12).join(', ')}${vs.length>12?'…':''})`:vs&&typeof vs==='object'&&vs.from!==undefined?` (${vs.from}..${vs.to})`:''}`);}
  for(const k of Object.keys(args))if(!(spec.args||[]).some(a=>a[0]===k))problems.push(`${k} is not an argument of this action`);
  return {ok:!problems.length,problems,args:out};}

// The fingerprint tells "did nothing" from "did something quietly": cash, day, the entity counts, the small settings
// maps, and the paths a command declares in watch. R is left out: it is rebuilt after every action.
const API_FP_LEN=['links','transit','pni','caches','biz','offers','nni','loans','loanOffers','inc','scrubs'];
const API_FP_KEYS=['pops','ixp','peers','myIx','done','ach','merged','confReg'];
const API_FP_JSON=['name','pairMet','rs','ixn','ixSite','ixPref','spares','te','cnLic','hw','scrubMode','ppol','ops','core','ddosAuto','popStd','popTiers','demo','charter','monkey','seatOff','pz','ar','dk','ev'];
function apiFp(watch,args){
  if(!S)return null;
  const f={cash:S.cash,day:S.day,lvl:S.lvl||1,won:!!S.won,lost:!!S.lost};
  for(const k of API_FP_LEN)f[k]=(S[k]||[]).length;
  for(const k of API_FP_KEYS)f[k]=Object.keys(S[k]||{}).length;
  for(const k of API_FP_JSON)f[k]=JSON.stringify(apiJson(S[k])??null);
  for(const p of watch||[])f['@'+p]=JSON.stringify(apiJson(apiPath(S,String(p).replace(/#(\w+)/g,(m,k)=>args&&args[k]!==undefined?args[k]:m)))??null);
  return JSON.stringify(f);}
// spend() is the game's money gate and a top-level function, so every action reaches it by its global name.
function apiMeter(){const real=window.spend;let paid=0;window.spend=c=>{const ok=real(c);if(ok)paid+=c;return ok;};return ()=>{window.spend=real;return paid;};}

/* typed: through the command table (bind the UI, type into fields, pass the confirmation); otherwise as a button click
   does it, with the button's own arguments. */
function apiDispatch(name,kind,spec,args,typed){
  const mine=apiIsSheet()||(typed&&kind==='game'&&!!spec.open),held=apiPlayerWin()?apiHold():null;
  apiTake();
  const ref=S,cash=S?S.cash:0,f0=apiFp(spec&&spec.watch,args),paid=apiMeter();
  let threw=null,report;
  try{
    if(typed&&kind==='game'){
      if(spec.open){ACT[spec.open]({});apiMarkSheet();}
      // The custom metric's field lives in the link's panel.
      if(name==='metricSet'&&!$('metIn')){UI.sel={type:'link',id:args.id};renderAll();}
      const gone=(spec.dom||[]).filter(f=>!$(f));
      if(gone.length)throw new Error(`the field it types into (${gone.join(', ')}) is not on screen${name==='metricSet'?': set the link\'s metric to custom first (setMetric v "custom")':''}`);
      if(spec.bind)spec.bind(args);
      const a=spec.pass?spec.pass(args):args;
      ACT[name](a);
      if(spec.confirm==='double')ACT[name](a);
      if(spec.reads==='modal'&&apiModalOpen()&&!apiPlayerWin()){report=apiText($('modal'));closeModal();}
    }else ACT[name](args);
  }catch(e){threw=e;}
  const charged=paid();
  if(held&&(threw||!apiDecision())){
    // The tool's own sheet is read before the player's window goes back over it.
    const shot=!threw&&apiModalOpen()&&!apiPlayerWin()?apiScreen('modal'):null;
    apiRestore(held);
    if(shot)shot.note='The player has a window open, so this one was shown to you and closed again.';
    held.shot=shot;}
  if(threw){apiTake();apiFail(`${name} failed: ${threw&&threw.message||threw}`);}
  if(!apiModalOpen()||apiPlayerWin())API_SHEET=null;
  else if(mine||kind!=='game')apiMarkSheet();
  else API_SHEET=null;
  const said=apiTake(),d=apiDecision();
  const outcome=d?'decision':S!==ref||apiFp(spec&&spec.watch,args)!==f0||report!==undefined?'applied'
    :said.some(t=>t.kind==='bad')?'rejected':kind==='view'||kind==='draft'?'shown':'no_effect';
  return {action:name,outcome,toasts:apiToastLines(said),charged,cashChange:Math.round((S?S.cash:0)-cash),
    ...(report!==undefined?{report}:{}),...(d?{decision:d}:{}),screen:held&&held.shot||apiScreen()};}
// While the game waits for an answer, game commands other than its options report the question instead.
function apiWaiting(name){
  const d=apiDecision();
  return d&&name!=='closeModal'&&!d.options.some(o=>o.command===name)
    ?{action:name,outcome:'decision',reason:'A window is waiting for an answer: run one of its options, or closeModal.',decision:d,screen:apiScreen()}:null;}
function apiQuote(name,spec,args){
  const ui0={};
  for(const k of spec.bindsUI||[])ui0[k]=UI[k];
  const f0=apiFp(spec.watch,args);
  // A dry run must not use up the dice: some helpers draw (a PNI's lead time), and a draw here would move the seeded
  // game. They get the middle of the range instead, so a drawn figure in a quote is a typical one.
  const dice=Math.random;
  Math.random=()=>0.5;
  let q={};
  try{
    if(spec.bind&&!spec.dom)spec.bind(args);
    if(spec.quote)q=spec.quote(args)||{};
  }catch(e){apiFail(`${name}: the price could not be worked out: ${e&&e.message||e}`);}finally{Math.random=dice;for(const k of Object.keys(ui0))UI[k]=ui0[k];}
  return {action:name,outcome:'quote',quote:{setup:0,monthly:0,...q,blocked:(q.blocked||[]).map(b=>apiText(String(b),400))},consistent:apiFp(spec.watch,args)===f0,
    ...(spec.quote?{}:{note:'This command has no price of its own: it costs nothing up front.'})};}
// Checks shared by act and click: what no tool runs, and what only the player runs in their own tab.
function apiAllowed(name,what){
  const no=apiDenied(name);
  if(no)apiFail(`${name} is not available here: ${no}.`);
  if(API_CTX.relay&&API_PLAYER_OWNS[name])apiFail(`${name} is not available here: ${API_OWN_WHY}.`);
  const kind=apiKind(name);
  if(!kind||typeof ACT[name]!=='function')apiFail(what);
  return kind;}
function apiRun(name,args,opts={}){
  name=String(name||'');
  if(name.startsWith('view.'))name=name.slice(5);
  const kind=apiAllowed(name,`There is no action "${name}". See actions or schema.`);
  args=args&&typeof args==='object'&&!Array.isArray(args)?args:{};
  const spec=apiSpec(name);
  if(spec){const v=apiValidate(spec,args);if(!v.ok)apiFail(`${name}: ${v.problems.join('; ')}. See schema for its arguments.`);args=v.args;}
  if(kind==='game'){
    if(S&&S.lost&&name!=='closeModal')return {action:name,outcome:'stopped',reason:'The network went bankrupt: start or load another game.'};
    const w=apiWaiting(name);
    if(w)return w;
    if(opts.dryRun)return apiQuote(name,spec,args);
  }else if(opts.dryRun)apiFail(`${name} has no price: only game commands (see schema commands) dry-run.`);
  return apiDispatch(name,kind,spec,args,true);}
function apiClick(n,value){
  const b=API_LAST[n];
  if(!b)apiFail(`No button ${n} on the last screen. Call screen first.`);
  if(b.disabled)apiFail(`"${b.label}" is greyed out.`);
  if(b.player&&apiPlayerWin())apiFail(`"${b.label}" is in a window the player opened: it is theirs to press.`);
  const name=b.select||b.act,args=b.select?{v:value===undefined?undefined:String(value)}:b.args;
  if(b.select&&!b.options.some(o=>o.value===args.v))apiFail(`"${b.label}" is a list: click it with a value, one of ${b.options.map(o=>JSON.stringify(o.value)).join(', ')}.`);
  const kind=apiAllowed(name,`"${b.label}" runs ${name}, which is not an action.`);
  if(kind==='game'){const w=apiWaiting(name);if(w)return {clicked:b.label,...w};}
  return {clicked:b.label,...apiDispatch(name,kind,apiSpec(name),args,false)};}
