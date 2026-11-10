function newGame(name,home){
  S={v:1,name,asn:200000+Math.floor(_rand()*15000),home,day:0,cash:START_CASH,
    ltv:2,t1v:4,auV:1,calV:1,pieV:1,pie:null,ops:opsNew(),slAuto:slAutoNew(),achP:{},seen:NETS.map(n=>n.id),spares:{},pops:{[home]:{day:0,bb:null,boost:0,down:0,routers:1,gen:false}},links:[],nni:[],transit:[],ixp:{},rs:{},peers:{},pni:[],caches:[],biz:[],offers:[],myIx:{},pairMet:{},
    done:{},inc:[],fleet:{},ev:{ddosMore:[]},ddosStarts:[],priceMul:1,nextFail:45,nextEvent:40,usedNames:[],stats:{survived:0,incidents:0,peak:0},vol:0,cnLic:{state:'none'},scrubs:[],scrubMode:'always',ddosAuto:{rtbh:false,scrub:true},capDeal:null,core:{lv:0,run:0},popStd:null,popTiers:ptNew(),won:false,lost:false,neg:0,loans:[],loanOffers:[],loanStrikes:0,ppol:'open',pdesk:null,pdeskRep:null,hw:{},rules:makeRules('oncall'),charter:'global',cm:cmNew(),chartSet:false,demo:{},seatOff:null,solWon:0,monkey:{next:null,on:0}};
}

