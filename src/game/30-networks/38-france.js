/* France beyond Paris and Marseille: the second and third mobile operators and the two big French clouds, with real ASNs.
   Orange (Tangerine Telecom) and Free (Free as in Beer) reach the new cities too; Andorable Telecom comes up to Toulouse.
   Sits before 40-traffic-shares.js, which indexes NETS. */
NETS.push(
 {id:'sfe',name:'SF-Error Telecom',asn:15557,type:'eye',cc:'FR',pol:'selective',minIx:6,minPni:20,share:.005,up:['cog','lvl','tly'],col:'#E4002B',pops:['par','mrs','lys','tls','lil','bod','sxb','rns','nte','lon','ams','fra'],ix:['par','mrs','lys','tls','lil','bod','sxb'],blurb:tr('france.france_s_number_two_it_bought_a')},
 {id:'byg',name:'Boy-Egg Telecom',asn:5410,type:'eye',cc:'FR',pol:'selective',minIx:6,minPni:20,share:.004,up:['cog','lvl','tng'],col:'#0072CE',pops:['par','mrs','lys','tls','lil','bod','sxb','rns','nte','lon','ams','fra'],ix:['par','mrs','lys','tls','lil','sxb'],blurb:tr('france.the_builder_that_became_a_mobile')},
 {id:'ovh',name:'Ov-Hatch Cloud',asn:16276,type:'cdn',pol:'selective',minIx:5,minPni:20,share:.004,col:'#123F6D',pops:['par','lil','sxb','lon','fra','ams','waw','sin','syd'],ix:['par','sxb','lon','fra','ams','sin'],blurb:tr('france.europe_s_biggest_hosting_cloud_from')},
 {id:'sca',name:'Scale-Away',asn:12876,type:'cdn',pol:'selective',minIx:5,minPni:20,share:.002,col:'#4F0599',pops:['par','ams','waw'],ix:['par'],blurb:tr('france.the_cloud_arm_of_the_free_group')});
