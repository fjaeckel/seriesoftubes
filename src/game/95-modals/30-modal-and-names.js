// Keyboard focus moves into the modal, so Enter or Space can't keep pressing a hidden button behind it.
// The link check on phones sits above the tab bar and is not modal, so the tabs stay usable.
function openModal(html,cls=''){$('modal').className=cls;$('modalCard').setAttribute('aria-modal',cls==='link-check'&&isPhone()?'false':'true');if($('modal').hidden)markLayer();$('modalCard').innerHTML=html;$('modal').hidden=false;const a=document.activeElement;if(a&&a!==document.body&&!a.closest('#modal')){a.blur();const m=$('modalCard');m.tabIndex=-1;m.focus({preventScroll:true});}}
function closeModal(){if(!$('modal').hidden)markLayer();$('modal').hidden=true;UI.pending=null;}
const NETWORK_NAMES=[
  'Packet Pals','Shinternet','Post, Telegraph & Tubes','Peering Pressure','Best Effort Telecom',
  'Mostly Online','Buffering & Sons','Lord of the Pings','The Ping Dynasty',
  'LAN Before Time','Bits Please','Hopless Networks','Route of All Evil',
  'TTL You Later','Fiber McFiberface','RFC 1149 Avian Carriers','Spanning Tree Huggers',
  'Dial-Up & Cry','404 Telecom','Loss Leaders','Last Mile Standing',
  'Have You Tried Off & On','Bogon Voyage','Default Route 66','Anycast Away',
  'Hot Potato Routing','Null Route Rangers','Looking Glass Half Full','Jumbo Frame Shop',
  'Route Flap Jacks','Split Horizon & Co.','Path of Least Resistance',
];
function randomNetworkName(current){
  // Naming must not advance a running scenario's seeded simulation.
  const names=NETWORK_NAMES.filter(n=>n!==current);
  return names[Math.floor(_rand()*names.length)];
}
const HTIW='https://tkjaer.github.io/how-the-internet-works/';
// The real thing: an interactive, zoomable guide to how packets actually travel. Go read it.
// Where players hang out: the community Signal group.
const SIGNAL='https://signal.group/#CjQKIJwvEt5fYt1pvw7J2pV664CyUyGJXmAJLV8ia3nUdAD7EhA_FzdxflEzkNmcvDHdVgLQ';
const chatHtml=()=>`<a class="plug chat" href="${SIGNAL}" target="_blank" rel="noopener"><span class="pi" aria-hidden="true">💬</span><span><b>${tr('modal_and_names.join_the_noc_chat')}</b><span class="meta">${tr('modal_and_names.our_signal_group_screenshots_chat')}</span></span><span class="go">${tr('common.join')}</span></a>`;
// Bugs and ideas go to GitHub, where they get tracked; the chat is for chatting. Its forms sort them by kind.
const ISSUES='https://github.com/fjaeckel/seriesoftubes/issues/new/choose';
const issueHtml=()=>`<a class="plug" href="${ISSUES}" target="_blank" rel="noopener"><span class="pi" aria-hidden="true">🐛</span><span><b>${tr('modal_and_names.found_a_bug_or_have_an')}</b><span class="meta">${tr('modal_and_names.tell_us_on_github_a_short')}</span></span><span class="go">${tr('modal_and_names.open')}</span></a>`;
const plugHtml=(big)=>`<a class="plug" href="${HTIW}" target="_blank" rel="noopener"><span class="pi" aria-hidden="true">🌍</span><span><b>${tr('modal_and_names.how_the_internet_works')}</b><span class="meta">${big?tr('modal_and_names.the_real_thing_by_thomas_kj'):tr('modal_and_names.the_real_thing_follow_a_packet')}</span></span><span class="go">${tr('common.explore')}</span></a>`;
