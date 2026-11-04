/* ================= STATE ================= */
let S=null, R=emptyR();
const UI={sel:null,tab:'cust',left:'goals',speed:1,hover:null,drag:null,snap:null,pending:null,confirm:null,leftOpen:false,muted:false,startCity:'fra',hintOff:false,clockLocked:false};
/* Where tools that are not part of the game (the development page's agent, src/agent/) may hook in. Empty in the page
   players get, and the game only ever calls into it with ?.(), so nothing changes there. clockLocked: the clock is not
   the player's (an agent drives): no pause, no speed buttons, no auto-pause, and the speed is HOOKS.speed()'s. */
const HOOKS={};
let uidN=1; const uid=()=>'i'+(Date.now()%1e7).toString(36)+(uidN++);
function emptyR(){return {nt:{},cone:{},reachNT:0,teBlack:0,tNet:{},egT:{},netEg:{},l2lat:{},nodeLoad:{},nodeCap:{},div:{},l2:{},gfwLost:0,gfwCross:0,ef:{},egDesc:{},p95:{},peered:0,peerShare:0,load:{},useT:{},useIx:{},usePni:{},useCache:{},cityDem:{},citySrv:{},cityEye:{},latF:{},latFar:{},demTo:{},served:0,demand:0,reach:0,sessions:0,revMo:0,costMo:0,cost:{},rev:{},reachable:{},ddos:[],haul:[],tgtF:{},bbF:{},fsUse:{},ddosHot:{}};}
