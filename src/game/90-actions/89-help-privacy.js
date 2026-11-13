// How multiplayer works and the privacy sheet (95-modals/61-help-more.js). Each remembers where it was opened from
// (help, settings, fed: the multiplayer sheet, mp: how multiplayer works), so Back returns there.
const INFO_FROM=['help','settings','fed','mp'];
function infoPush(from){if(!UI.info)UI.info=[];if(INFO_FROM.includes(from))UI.info.push({f:from,set:!!UI.setOpen});UI.info=UI.info.slice(-4);
  UI.setOpen=false;}// Settings must not redraw itself over the sheet
Object.assign(ACT,{
 helpMp:({from}={})=>{infoPush(from);showMpHelp();},
 privacy:({from}={})=>{infoPush(from);showPrivacy();},
 infoBack:()=>{const e=UI.info&&UI.info.pop();if(!e)return ACT.infoClose();UI.setOpen=e.set;
   if(e.f==='mp')showMpHelp();else if(e.f==='help')showHelp();else if(e.f==='settings')ACT.settings();
   else if(e.f==='fed'&&typeof fuCan==='function'&&fuCan())ACT.fuOpen({v:'home'});else ACT.infoClose();},
 infoClose:()=>{UI.info=[];UI.setOpen=false;UI.fu=null;if(!S||!UI.started)showTitle();else closeModal();},
});
