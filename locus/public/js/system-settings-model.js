(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusSystemSettingsModel=value;})(globalThis,function(){
 'use strict';
 const fields=Object.freeze(['nedel_v_okne','porog_peregruza','dnej_bez_obschenija_porog','chasovoj_pojas']);
 const defaults=Object.freeze({nedel_v_okne:8,porog_peregruza:1.5,dnej_bez_obschenija_porog:14,chasovoj_pojas:'Europe/Moscow'});
 const labels=Object.freeze({nedel_v_okne:'Окно личной нормы, недель',porog_peregruza:'Коэффициент перегруза',dnej_bez_obschenija_porog:'Без общения, дней',chasovoj_pojas:'Часовой пояс'});
 const number=value=>typeof value==='string'&&/^\d+(?:[.,]\d+)?$/.test(value.trim())?Number(value.trim().replace(',','.')):typeof value==='number'?value:NaN;
 function errors(value){const out={};for(const field of fields){const v=value[field];if(field==='chasovoj_pojas'){try{if(typeof v!=='string'||!v.length||v!==v.trim())throw Error();new Intl.DateTimeFormat('ru',{timeZone:v});}catch{out[field]='Укажи действующий часовой пояс, например Europe/Moscow';}}else{const n=number(v);if(!Number.isFinite(n)||n<=0||n>Number.MAX_SAFE_INTEGER||field!=='porog_peregruza'&&!Number.isSafeInteger(n)||field==='nedel_v_okne'&&n>52)out[field]=field==='nedel_v_okne'?'Укажи целое число от 1 до 52':field==='porog_peregruza'?'Укажи положительное число, например 1,5':'Укажи целое число от 1';}}return out;}
 function normalize(value){const e=errors(value);if(Object.keys(e).length)throw Object.assign(new Error('Проверь параметры расчёта'),{fields:e});return Object.fromEntries(fields.map(k=>[k,k==='chasovoj_pojas'?value[k]:number(value[k])]));}
 const same=(a,b)=>a===b||typeof a!=='string'&&typeof b!=='string'&&Number.isNaN(a)&&Number.isNaN(b);
 const changes=(base,draft)=>Object.fromEntries(fields.filter(k=>!same(base[k],draft[k])).map(k=>[k,draft[k]]));
 function compare(base,draft,current){return fields.filter(k=>!same(base[k],draft[k])||!same(base[k],current[k])).map(k=>({field:k,before:base[k],mine:draft[k],current:current[k],conflict:!same(base[k],draft[k])&&!same(base[k],current[k])&&!same(draft[k],current[k])}));}
 function rebase(base,draft,current){return {...current,...changes(base,draft)};}
 return {fields,defaults,labels,number,errors,normalize,changes,compare,rebase};
});
