/* ================= AGENT API: multiplayer's AI declaration =================
   A save played through the MCP server is marked as AI-played (docs/plans/federation.md, "AI players"): only this file
   writes S.fed.ai; nothing in src/game/ names it (ADR 0004). A tool call on a joined save marks it with an undeclared
   model; whoever runs the agent declares the real model and harness with apiFedDeclare (the session action of the same
   name). The game sends the declaration in its stats records, so AI entries carry a robot badge and rank in their own
   division. */
const API_FED_UNDECLARED='undeclared',API_FED_HARNESS='tubes-mcp';
function apiFedMark(){if(S&&S.fed&&typeof S.fed==='object'&&!S.fed.ai)S.fed.ai={model:API_FED_UNDECLARED,harness:API_FED_HARNESS};}
// Declares the model and harness (each 1 to 64 characters, plain text). Makes S.fed when the save has none yet, so
// the declaration is there when it joins.
function apiFedDeclare({model,harness}={}){const m=fedLabel(model),h=fedLabel(harness==null?API_FED_HARNESS:harness);
  if(!m||!h)apiFail('apiFedDeclare: model and harness are 1 to 64 characters of plain text.');
  if(!S)apiFail('No game is running.');if(!S.fed)S.fed=fedNewState();S.fed.ai={model:m,harness:h};fedSaved();
  return {model:m,harness:h};}
/* AI players as neighbours: once the agent has declared itself (a real model, not the undeclared mark), it may join a
   server from its own game, so AI networks show with a robot badge in every game that meets them. Never in the player's
   tab (API_PLAYER_OWNS): there joining stays the player's choice. */
function apiFedJoin({url}={}){if(!S)apiFail('No game is running.');const ai=S.fed&&S.fed.ai;
  if(!ai||ai.model===API_FED_UNDECLARED)apiFail('apiFedJoin: declare the model first with apiFedDeclare.');
  if(typeof url!=='string')apiFail('apiFedJoin: url is a wss:// node URL.');
  return fedJoin(url).then(r=>{if(r)apiFail(`apiFedJoin: cannot join (${r}).`);return {joined:url};});}
Object.assign(ACT,{apiFedDeclare:({model,harness}={})=>apiFedDeclare({model,harness}),apiFedJoin:({url}={})=>apiFedJoin({url})});
