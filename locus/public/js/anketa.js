                                                                        
                                                                           
(function(root,factory){
 const schema=factory();
 if(typeof module==='object'&&module.exports)module.exports=schema;
 else root.LocusAnketa=schema;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const gruppy=[
  ['как со мной работать',[
   ['v_chem_polezna','в каких задачах я особенно полезна'],
   ['kogda_trudno','в каких ситуациях со мной бывает трудно'],
   ['dogovoritsja','о чём лучше договориться со мной заранее'],
   ['silnye_storony','сильные стороны'],['slabye_storony','слабые стороны'],
   ['chto_pomogaet','что мне помогает'],['chto_besit','что меня бесит']]],
  ['про меня',[
   ['kakaja_ja','какая я'],['missija','миссия'],['mechty','мечты'],
   ['chitaju','читаю'],['smotrju','смотрю'],['izuchaju','изучаю'],
   ['desert','любимый десерт'],['eschyo','чем ещё поделиться']]]
 ];
 const polja=gruppy.flatMap(([,fields])=>fields);
 const legacy=['kogda_v_seti','kak_obraschatsja','format_svjazi'];
 function podpis(field,gender){
  if(gender==='m'&&field==='v_chem_polezna')return 'в каких задачах я особенно полезен';
  if(gender==='m'&&field==='kakaja_ja')return 'какой я';
  if(!['m','zh'].includes(gender)&&field==='v_chem_polezna')return 'в каких задачах я могу помочь';
  if(!['m','zh'].includes(gender)&&field==='kakaja_ja')return 'обо мне';
  return polja.find(([key])=>key===field)?.[1]||'';
 }
 return {gruppy,polja,legacy,podpis};
});
