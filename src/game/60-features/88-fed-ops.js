/* ================= FEDERATION: operating a server from the game =================
   An operator who imported their operator key acts on a server over the game's own connection to it (plan, "On the go,
   in the game"): signed hide, shun and unshun records go out as `put`, proposals get a `cosign`. Only a server this
   save is connected to can be reached; nothing here opens a socket of its own. Also the short log of recent errors the
   operator panel shows (memory only, never in a save). */
const FED_ERRS_MAX=24;
function fedErrLog(node,srv,why){const l=FED.errs||(FED.errs=[]);l.unshift({t:fedNow(),node:node||null,srv:srv||null,why:String(why||'')});if(l.length>FED_ERRS_MAX)l.length=FED_ERRS_MAX;}
const fedErrs=srv=>(FED.errs||[]).filter(e=>!srv||e.srv===srv);
// A ready connection to one of a server's nodes, or null.
function fedConnTo(srv){const M=FED.live;if(!M)return null;for(const c of M.conns.values())if(c.srv===srv&&c.phase==='ready')return c;return null;}
// Puts an operator-signed record to a server: {ok:true} or {error} ('offline' when no node of it is connected).
async function fedOpPut(srv,rec){const c=fedConnTo(srv);if(!c||!rec)return {error:'offline'};const a=await fedAsk(c,{m:'put',rec});
  if(!a)return {error:'timeout'};if(a.m==='err'){fedErrLog(c.node,srv,a.code);return {error:a.code};}return {ok:true};}
/* The server's chain records (genesis, operators, server) from a connected node, checked: {chain (fedChain), pending
   [{id, rec}]} or null. The node keeps pending proposals 14 days. */
async function fedOpChain(srv){const c=fedConnTo(srv);if(!c)return null;const q=fedAsk(c,{m:'sub',kinds:['genesis','operators','server'],since:''},true),a=await q;
  // The backlog is all this needs: the unsub names the sub's own id (§9.3), or the node would keep it live.
  if(fedConnTo(srv)===c&&q.id)fedSend(c,{m:'unsub',id:q.id});
  if(!a||a.m!=='recs')return null;const now=fedNow(),props=[];let gen=null;
  // Checked in the federation worker (fedCheckItems), in one batch.
  const L=a.items.slice(0,2000),ck=await fedCheckItems(L,now,c,[]);
  for(const chk of ck){if(!chk||!chk.ok)continue;
    if(chk.rec.kind==='genesis'&&chk.id===srv)gen=chk;else if(chk.rec.kind==='operators')props.push({rec:chk.rec,id:chk.id});}
  if(!gen)return null;const ch=fedChain(gen.rec,gen.id,props,now),by=new Map(props.map(p=>[p.id,p]));
  return {chain:ch,pending:ch.pending.map(id=>by.get(id)).filter(Boolean)};}
// Adds the operator key's signature to a pending proposal: {ok:true} or {error}.
async function fedOpCosign(srv,p){const k=await fedOpKey(),c=fedConnTo(srv);if(!k)return {error:'no_key'};if(!c)return {error:'offline'};
  const signed=await fedCosign(k.seed,p.rec),mine=signed.sigs.find(x=>x.key===k.pub);
  const a=await fedAsk(c,{m:'cosign',rid:p.id,key:k.pub,sig:mine.sig});
  if(!a)return {error:'timeout'};if(a.m==='err'){fedErrLog(c.node,srv,a.code);return {error:a.code};}return {ok:true};}
// A server's current hide record body (lists of keys), or empty lists.
async function fedHideOf(srv){const h=await fedHides(srv),b=h&&h.rec.body;
  return {server:srv,hide:b?b.hide.slice():[],names:b?b.names.slice():[],refuse:b?b.refuse.slice():[]};}
/* Operator actions: hide/unhide (list 'hide' or 'names'), shun with a pre-made reason, unshun. Signed with the operator
   key and put to the server; kept here too once the server took it. Gives {ok:true} or {error}. */
async function fedOpHide(srv,key,list,on){if(FdK(key)||!['hide','names','refuse'].includes(list))return {error:'bad_field'};const b=await fedHideOf(srv);
  b[list]=b[list].filter(k=>k!==key);if(on)b[list].push(key);b[list].sort(fedByStr);
  const r=await fedOpSign('hide',b);if(!r)return {error:'no_key'};const x=await fedOpPut(srv,r);
  if(x.ok)await fedPut('kv','hide:'+srv,{rec:r,id:await fedId(r)});return x;}
async function fedOpShun(srv,target,reason){if(FdK(target))return {error:'bad_field'};
  const body=reason?{server:srv,target,reason}:{server:srv,target};if(reason&&!['cheating','offensive_name','spam','abuse'].includes(reason))return {error:'bad_field'};
  const r=await fedOpSign(reason?'shun':'unshun',body);if(!r)return {error:'no_key'};const x=await fedOpPut(srv,r);
  if(x.ok)await fedVotesAdd([{id:await fedId(r),rec:r}]);return x;}
