(function(root,factory){
  const value=factory();
  if(typeof module==='object'&&module.exports)module.exports=value;
  else root.LocusUpominanija=value;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const limit=5000;
  const normal=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ru-RU')
    .replace(/_/g,' ').replace(/ё/g,'е').replace(/\s+/gu,' ').trim();
  function kandidaty(label,people){
    const name=normal(label);
    return (people||[]).filter(person=>{
      if(!(person.komanda===true||person.komanda===1)||person.arhiv===true||person.arhiv===1)return false;
      const full=normal(person.imja);
      return full===name||(!name.includes(' ')&&full.split(' ')[0]===name);
    });
  }
  function razobrat(text,people){
    text=String(text??'');
    const result=[],urls=Array.from(text.matchAll(/https?:\/\/[^\s<>"']+/giu),match=>[match.index,match.index+match[0].length]);
    for(const match of text.matchAll(/(^|[^\p{L}\p{N}_])@([\p{L}\p{M}\p{N}_-]+)/gu)){
      const start=match.index+match[1].length;
      if(urls.some(([from,to])=>start>=from&&start<to))continue;
      result.push({nachalo:start,konec:start+match[2].length+1,label:match[2],kandidaty:kandidaty(match[2],people)});
    }
    return result;
  }
  function izmenenie(before,after){
    before=String(before??'');after=String(after??'');let start=0,left=before.length,right=after.length;
    while(start<left&&start<right&&before[start]===after[start])start++;
    while(left>start&&right>start&&before[left-1]===after[right-1]){left--;right--;}
    return {nachalo:start,konecBylo:left,konec:right,sdvig:right-left};
  }
  function perenesti(before,after,refs){
    const change=izmenenie(before,after);
    return (refs||[]).flatMap(ref=>{
      if(ref.konec<=change.nachalo)return [{...ref}];
      if(ref.nachalo>=change.konecBylo)return [{...ref,nachalo:ref.nachalo+change.sdvig,konec:ref.konec+change.sdvig}];
      return [];
    });
  }
  function ssylki(text){return Array.from(String(text??'').matchAll(/https?:\/\/[^\s<>"']+/giu),m=>({nachalo:m.index,konec:m.index+m[0].length}));}
  function vremja(value,now=Date.now()){
    let iso=String(value??'').replace(' ','T');if(iso&&!/(?:Z|[+-]\d{2}:\d{2})$/i.test(iso))iso+='Z';
    const date=new Date(iso);if(!Number.isFinite(date.getTime()))return {tekst:'',polnoe:'',iso:''};
    const parts=Object.fromEntries(new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
    const full=parts.day+'.'+parts.month+'.'+parts.year+' '+parts.hour+':'+parts.minute;
    const minutes=Math.max(0,Math.floor((Number(now)-date.getTime())/60000));
    const word=(n,one,two,many)=>n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?two:many;
    const hours=Math.floor(minutes/60);
    const text=minutes<1?'только что':minutes<60?minutes+' '+word(minutes,'минуту','минуты','минут')+' назад':minutes<1440?hours+' '+word(hours,'час','часа','часов')+' назад':full;
    return {tekst:text,polnoe:full,iso:date.toISOString()};
  }
  return {limit,dlina:text=>Array.from(String(text??'')).length,normal,kandidaty,razobrat,izmenenie,perenesti,ssylki,vremja};
});
