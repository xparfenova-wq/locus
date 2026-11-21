(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LocusFeedText=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const kinds=[['instrument','инструмент','Инструмент: '],['servis','сервис','Сервис: '],['lekcija','лекция','Лекция: '],['promt','промт','Промт: '],['kniga','книга','Книга: '],['statja','статья','Статья: '],['kejs','кейс','Кейс: '],['post','пост','Пост: '],['mysl','мысль','Мысль: ']];
 const facets=[['poluchilos','получилось','Что получилось: '],['zastrjalo','застряло','Что застряло: '],['obsuzhdaem','обсуждаем','Обсуждаем: '],['predlagaju','предлагаю','Предлагаю: '],['resurs','ресурс','Ресурс: ']];
 function classify(value,options){const text=String(value||'').trimStart().toLowerCase();return options.find(row=>text.startsWith(row[2].trim().toLowerCase()))?.[0]||null;}
 return {kinds,facets,kind:value=>classify(value,kinds)||(String(value||'').trimStart().toLowerCase().startsWith('вывод:')?'mysl':'bez_tipa'),facet:value=>classify(value,facets)};
});
