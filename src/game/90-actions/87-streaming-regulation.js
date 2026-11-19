/* ---------- The Streaming service and the regulators (60-features/38-streaming-regulation.js) ---------- */
Object.assign(ACT,{
 // Sending party pays: a fruit basket and a very long study; the vote comes in SPP_LOB_DAYS. One try per law.
 cntSppLobby:({cc})=>{if(!content()||!S.cnt.rg)return;const x=S.cnt.rg.spp[cc];if(!x||x.lob||x.fail||!spend(SPP_LOB))return;x.lob=S.day+SPP_LOB_DAYS;
   toast(tr('streaming_reg.spp_lobby_started',{ru:sppRu(cc)}),'good');after();},
 // Fair share: pay into the network fund at the price on the table, or go to the hearings.
 cntFsPay:({reg})=>{if(!content()||!S.cnt.rg)return;const f=S.cnt.rg.fs[reg];if(!f||f.st!=='neg')return;f.st='fund';
   toast(tr('streaming_reg.fs_paid',{region:REG[reg],fee:fmt$(f.fee)}),'good');after();},
 cntFsHear:({reg})=>{if(!content()||!S.cnt.rg)return;const f=S.cnt.rg.fs[reg];if(!f||f.st!=='neg'||!spend(FS_LAW))return;f.st='hear';f.n=0;f.nx=S.day+FS_GAP;
   toast(tr('streaming_reg.fs_hear_started',{ru:fsRu(reg)}),'good');after();},
});
