/* In-app notes stay short: at most NOTE_MAX changes, each cut to its first sentence. When anything was cut, a
   link leads to the full notes of this version on GitHub. The CHANGELOG and the GitHub release keep every word. */
const NOTE_MAX=5,NOTE_CH=140;
function slimNote(n){const m=String(n).match(/^(.+?[.!?])(\s|$)/);let t=m?m[1]:String(n);if(t.length>NOTE_CH)t=t.slice(0,NOTE_CH-1).replace(/\s+\S*$/,'')+'…';return t;}
const notesLong=ns=>ns.length>NOTE_MAX||ns.some(n=>slimNote(n)!==n);
// A release with a story tells it in full, then points to every change on GitHub.
const storyHtml=(ps,ver)=>`<div class="story">${ps.map(p=>`<p>${esc(p).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')}</p>`).join('')}</div><p style="margin:6px 0 0"><a class="b pink sm" href="https://github.com/fjaeckel/seriesoftubes/releases/tag/v${esc(ver)}" target="_blank" rel="noopener">${tr('release_notes.read_the_full_notes_on_github')}</a></p>`;
function notesHtml(ns,ver){if(RELEASE_STORY.length&&ver===APP_VERSION&&ns===RELEASE_NOTES)return storyHtml(RELEASE_STORY,ver);const more=Math.max(0,ns.length-NOTE_MAX);
  return `<ul class="notes">${ns.slice(0,NOTE_MAX).map(n=>`<li>${esc(slimNote(n))}</li>`).join('')}${more?`<li class="meta">${trn('release_notes.and_n_more_change',more)}</li>`:''}</ul>`+
    (notesLong(ns)?`<p style="margin:6px 0 0"><a class="b pink sm" href="https://github.com/fjaeckel/seriesoftubes/releases/tag/v${esc(ver)}" target="_blank" rel="noopener">${tr('release_notes.read_the_full_notes_on_github')}</a></p>`:'');}
function newerVer(a,b){const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<3;i++){if((x[i]||0)>(y[i]||0))return true;if((x[i]||0)<(y[i]||0))return false;}return false;}
// While the game is open, look for a newer release now and then and offer a reload.
function checkUpdate(){
  if(IS_DEV||location.protocol==='file:'||!window.fetch)return;const now=Date.now();if(now-(UI.updChecked||0)<60000)return;UI.updChecked=now;
  fetch('/version.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{
    if(!j||!j.version||!newerVer(j.version,APP_VERSION))return;if(UI.updLater&&now-UI.updLater<6*3600*1000)return;
    const top=(j.notes||[])[0]||'';$('update').innerHTML=`<div class="tx"><b>${tr('release_notes.series_of_tubes_v_is_out',{v:esc(j.version)})}</b>${top?`<br>${esc(top.length>120?top.slice(0,117)+'…':top)}`:''}<br><span class="meta">${tr('release_notes.your_game_is_saved_automatically')}</span></div>${btn(tr('common.reload_now'),'updateNow',{},'pink sm')}${btn(tr('common.later'),'updateLater',{},'ghost sm')}`;$('update').hidden=false;
  }).catch(()=>{});
}
