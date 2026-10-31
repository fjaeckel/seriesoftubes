/* ================= ANALYTICS (ridiculytics) =================
   Off unless ANALYTICS.host is set. Fill in your collector when you self-host the game.
   Inside the claude.ai viewer outside requests are blocked, so it only reports from your own domain. */
const APP_VERSION='__VERSION__';
// Filled in by scripts/build.sh from CHANGELOG.md for this version.
const RELEASE_NOTES=/*__RELEASE_NOTES__*/[];
// A big release's story, shown in full in "What's new" (paragraphs; **bold** allowed). Empty for most releases.
const RELEASE_STORY=/*__RELEASE_STORY__*/[];
const IS_DEV=APP_VERSION.startsWith('__');
// Only report from the real site; previews, localhost and the Claude viewer stay silent.
const ANALYTICS={host:/(^|\.)seriesoftub\.es$/.test(location.hostname)?'https://stats.seriesoftub.es':'',site:'seriesoftub.es'};
(function(){
  try{
    window.ridiculytics=window.ridiculytics||function(){const q=window.ridiculytics.q=window.ridiculytics.q||[];if(q.length<100)q.push(arguments);};
    if(!ANALYTICS.host)return;
    const sc=document.createElement('script');sc.defer=true;sc.src='https://cdn.jsdelivr.net/npm/ridiculytics@1.0.1/web/counter.min.js';
    sc.setAttribute('data-host',ANALYTICS.host);if(ANALYTICS.site)sc.setAttribute('data-site',ANALYTICS.site);sc.setAttribute('data-spa','false');sc.integrity='sha384-uNCU8e2RB7Yn6lVNut2gupQsJwKwXPZu2i4t/Eg6Q59ki0kchBR4L4yoS3ZxxjEX';sc.crossOrigin='anonymous';sc.referrerPolicy='no-referrer';
    document.head.appendChild(sc);
  }catch(e){}
})();
const TRACKED=new Set();
function track(name,once){if(!ANALYTICS.host)return;if(once){if(TRACKED.has(name))return;TRACKED.add(name);}try{window.ridiculytics(name);}catch(e){}}
const PLAY_MARKS=[1,5,15,30,60,120];
