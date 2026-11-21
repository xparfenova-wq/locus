
(async()=>{
'use strict';
const field=(label,value,root)=>{const item=document.createElement('div');item.className='l-field';const name=document.createElement('span');name.className='l-label';name.textContent=label;const text=document.createElement('span');text.textContent=value??'не указано';item.append(name,text);root.append(item);return text;};
const link=(root,label,href)=>{const a=document.createElement('a');a.href=href;a.textContent=label;a.className='account-create-link';root.append(a);return a;};
try{
 const id=Number(new URLSearchParams(location.search).get('id'));if(!Number.isSafeInteger(id)||id<1)throw new Error('Аккаунт не выбран');
 const spr=await SPR.zagruzit();window.DANNYE={...spr,zadachi:[]};let account=await API.odna('akkaunty',id);const module=await O.accountCreate();let trashContext=null;
 document.getElementById('menju').innerHTML=O.menju(account.proekt_id?'Люди':'Направления',{napravlenija:true});O.vkljuchitSkvoznoe();
 async function render(row){account=row;trashContext=account.napravlenie?{napravlenie:account.napravlenie}:null;
 document.getElementById('account-name').textContent=account.nazvanie||'Аккаунт';document.getElementById('account-title').textContent=account.zagolovok||account.nazvanie||'';document.title=(account.nazvanie||'Аккаунт')+' — Локус';
 const status=document.getElementById('account-status'),fields=document.getElementById('account-fields'),path=document.getElementById('account-path');fields.replaceChildren();path.replaceChildren();document.querySelector('.account-detail').classList.toggle('is-paused',!account.aktiven||!!account.udalen);status.textContent=account.udalen?'Аккаунт удалён':account.aktiven?'Сбор включён':'Сбор остановлен';
 field('Площадка',module.platforms[account.ploshadka]||'не указана',fields);field('Сбор',{public:'публичные цифры',mtproto:'личная статистика Telegram',graph:'личная статистика Instagram'}[account.uroven]||'не настроен',fields);
 if(account.napravlenie){const direction=spr.napravlenija.find(n=>n.kod===account.napravlenie);link(path,direction?.nazvanie||'Открыть направление','/napravlenija.html?napravlenie='+encodeURIComponent(account.napravlenie)+'&vkladka=socseti');}
 if(account.proekt_id){try{const project=await API.odna('proekty',account.proekt_id);if(project.klient_id)trashContext={klient_id:project.klient_id};link(path,project.nazvanie,'/proekt.html?id='+project.id);if(project.klient_id){path.append(' · ');link(path,'Карточка клиента','/klient.html?id='+project.klient_id);}}catch{field('Проект','связь с проектом требует проверки',fields);}}
 if(account.vladelec){try{const owner=await API.odna('ljudi',account.vladelec);field('Кто ведёт',owner.imja+(owner.arhiv?' (в архиве)':''),fields);}catch{field('Кто ведёт','связь с человеком требует проверки',fields);}}else field('Кто ведёт','не назначен',fields);
 if(account.ssylka){const text=field('Ссылка',account.ssylka,fields);try{const url=new URL(account.ssylka);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password){text.replaceChildren();const a=link(text,account.ssylka,url.href);a.target='_blank';a.rel='noopener noreferrer';}}catch{}}
 field('Заметка',account.zametka||'нет',fields);
 const metrics=document.getElementById('account-metrics');metrics.replaceChildren();const labels={podpischikov:'Подписчиков',prirost_podpischikov:'Прирост за неделю',publikacij:'Публикаций вышло',prosmotrov:'Просмотров',prosmotrov_srednee:'Средние просмотры',vovlechennost:'Вовлечённость',ohvat:'Охват',ohvat_k_podpischikam:'Охват к подписчикам'};
 if(account.udalen)metrics.textContent='Прежние данные аккаунта сохранены.';else try{const data=await API.ekran('akkaunty/'+id+'/metriki');for(const [code,label]of Object.entries(labels)){const metric=data.metriki?.[code],value=metric?.znachenie;const text=field(label,value==null?'неизвестно':String(value).replace('.',',')+(['vovlechennost','ohvat_k_podpischikam'].includes(code)?'%':''),metrics);if(metric?.pochemu||metric?.obnovleno){const note=document.createElement('span');note.className='account-card-title';note.textContent=metric.pochemu||'Замер '+SPR.data(metric.obnovleno);text.after(note);}}}catch{metrics.textContent='Показатели не загрузились. Обнови страницу.';}
 }
 await render(account);
 LocusAccountEdit.mount({host:document.getElementById('account-actions'),account,people:spr.ljudi,directions:spr.napravlenija,platforms:module.platforms,onSaved:render,getTrashURL:()=>module.trashURL(trashContext||{})});
 document.body.dataset.gotovo='1';
}catch(error){document.getElementById('account-status').textContent=error.message;document.body.dataset.oshibka='1';}
})();
