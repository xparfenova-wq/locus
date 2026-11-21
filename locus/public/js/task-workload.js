(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusTaskWorkload=value;})(globalThis,function(){
 'use strict';
 const number=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:20});
 function noun(n,one,few,many){if(!Number.isInteger(n))return few;const last=n%10,tail=n%100;return tail>=11&&tail<=14?many:last===1?one:last>=2&&last<=4?few:many;}
 function describe(data){
  if(data?.est_grafik!==true||typeof data.imja!=='string'||!data.imja.trim()
   ||typeof data.chasov!=='number'||!Number.isFinite(data.chasov)||data.chasov<0
   ||!Number.isSafeInteger(data.zadach_nedeli)||data.zadach_nedeli<0)return '';
  return `${data.imja}: ${number.format(data.chasov)} ${noun(data.chasov,'час','часа','часов')} на неделе, ${number.format(data.zadach_nedeli)} ${noun(data.zadach_nedeli,'задача','задачи','задач')}`;
 }
 function context(value){
  const actor=Number(value?.actor),person=Number(value?.person),week=value?.week;
  if(!value?.active||!Number.isSafeInteger(actor)||actor<1||!Number.isSafeInteger(person)||person<1||!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(week||''))return null;
  return {actor,person,week,key:JSON.stringify([actor,person,week])};
 }
                                                                        
                                                                                    
 function create({readContext,request,onChange}){
  let epoch=0,pending=null,destroyed=false;
  const paint=state=>onChange({text:'',overloaded:false,...state});
  function reset(){epoch++;pending?.controller.abort();pending=null;paint({kind:'idle'});}
  function refresh(){
   if(destroyed)return Promise.resolve();
   const scope=context(readContext());
   if(!scope){reset();return Promise.resolve();}
   if(pending?.scope.key===scope.key)return pending.promise;
   reset();const id=epoch,controller=new AbortController();
   const current=()=>!destroyed&&id===epoch&&context(readContext())?.key===scope.key;
   paint({kind:'loading'});
   const promise=Promise.resolve().then(()=>request(scope,{signal:controller.signal})).then(data=>{
    if(!current())return;
    const responseWeek=`${data?.god}-W${String(data?.nedelja).padStart(2,'0')}`;
    if(data?.chelovek_id!==scope.person||responseWeek!==scope.week){paint({kind:'error'});return;}
    const text=describe(data);
    paint(text?{kind:'ready',text,overloaded:Boolean(data.podsvetit||data.peregruz_po_chasam)}:{kind:'empty'});
   },()=>{if(current())paint({kind:'error'});}).finally(()=>{if(id===epoch)pending=null;});
   pending={scope,controller,promise};return promise;
  }
  return {refresh,reset,destroy(){reset();destroyed=true;}};
 }
 return {describe,create};
});
