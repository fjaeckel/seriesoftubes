// Multiplayer (60-features/8x-fed-*.js). The interface that calls these comes separately; each answers what it did
// (a promise where it waits on WebCrypto or the network) and never opens a window of its own.
Object.assign(ACT,{
 fedJoin:({url}={})=>fedJoin(url),
 fedLeave:({url}={})=>fedLeave(typeof url==='string'?url:null),
 fedQuit:()=>fedQuit(),
 fedMute:({key,on}={})=>fedMute(key,on!==false),
 fedShare:({on}={})=>fedShare(on!==false),
 fedMoveExport:()=>fedExportMove(),
});
