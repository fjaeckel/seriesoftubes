/* ---------- the chaos monkey in puzzles: the N-1 star, acted out ----------
   The third star already asks whether the build survives any single cut (pzEval tries every trench and cable). When a
   new star lands, and on request, the monkey plays that check on the map: it runs to each trench or cable, snips it,
   and the cities that lose traffic say so. Only while the map is really being drawn: the stars never wait on it. */
const PZ_RUN=450,PZ_HOLD=550; // ms: the run to a tube, then how long its cut shows
const pzMkCan=()=>animOn()&&!UI.mapHid&&performance.now()-(UI.drawnAt||-1e9)<2000;
function pzMonkey(then){pzMkStop();const units=[...new Set(S.links.map(pzUnit))];if(!units.length){if(then)then();return;}
  const c=S.pz.src[0]||S.pz.cities[0];UI.pzMk={units,i:-1,t:0,then,bad:0};if(CITY[c])mkStart(c);sfx('alert');pzMkStep();}
// Off to the next one: the tube it last snipped is whole again, the next one stays whole until it gets there.
function pzMkStep(){const m=UI.pzMk;if(!m||!pzOn())return;for(const l of S.links)l.cut=0;m.i++;if(m.i>=m.units.length){pzMkDone();return;}
  const u=m.units[m.i];compute();renderAll();mkRun(S.links.find(l=>pzUnit(l)===u),PZ_RUN/MK_RUN);m.t=setTimeout(pzMkHit,PZ_RUN);}
function pzMkHit(){const m=UI.pzMk;if(!m||!pzOn())return;const ls=S.links.filter(l=>pzUnit(l)===m.units[m.i]),l0=ls[0];for(const l of ls)l.cut=1;compute();
  const g=pzGot(),lost=[];S.pz.dem.forEach((f,i)=>{if(!f.be&&!pzFull(f,g[i]))lost.push({c:f.t==='l2'?f.b:f.a,g:Math.max(0,f.g-g[i].g)});});
  floater((CITY[l0.a].x+CITY[l0.a].x+wrapDx(CITY[l0.a].x,CITY[l0.b].x))/2,(CITY[l0.a].y+CITY[l0.b].y)/2-26,tr('puzzles.monkey_snip'),'#FF8A3D');
  for(const x of lost)floater(CITY[x.c].x,CITY[x.c].y-34,tr('puzzles.city_loses_g',{city:CITY[x.c].name,g:fmtG(x.g)}),'#FF4D5E');
  if(UI.mk)UI.mk.bad=lost.length>0;if(lost.length)m.bad++;sfx(lost.length?'err':'click');renderAll();m.t=setTimeout(pzMkStep,lost.length?PZ_HOLD*2:PZ_HOLD);}
// The end: a cheer if nothing broke, a tantrum if something did, then whatever was waiting (the stars).
function pzMkDone(bad){const m=UI.pzMk;if(!m)return;clearTimeout(m.t);UI.pzMk=null;for(const l of S.links)l.cut=0;compute();
  mkEnd(!(bad!=null?bad:m.bad),true);renderAll();if(m.then)m.then();}
// Skip: straight to the end; the verdict is already known.
function pzMkSkip(){if(UI.pzMk)pzMkDone(pzEval().n1?0:1);}
// Gone without a word: the build changed under it, or the puzzle closed.
function pzMkStop(){const m=UI.pzMk;if(!m)return;clearTimeout(m.t);UI.pzMk=null;for(const l of S.links)l.cut=0;mkStop();}
