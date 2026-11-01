// Severe conflicts and closed cross-border capacity. Existing circuits keep working.
const CLOSED_CC=new Set(['AF:PK','AM:AZ','AM:TR','BY:UA','DZ:MA','IL:IR','IL:LB','IL:PS','IL:SY','IN:PK','KH:TH','KP:KR','RU:UA']);
const closedPair=(a,b)=>CLOSED_CC.has([CITY[a].cc,CITY[b].cc].sort().join(':'));
const corridorWhy=(a,b)=>closedPair(a,b)?tr('link_modal.closed_corridor',{a:CITY[a].name,b:CITY[b].name}):'';
