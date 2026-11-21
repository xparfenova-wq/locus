const {createHash}=require('node:crypto');
const {OshibkaVvoda,Konflikt,NeNajdeno}=require('../db/db.js');
const OPEN="status NOT IN ('sdelano','kogda_nibud') AND COALESCE(udaleno,0)=0";
function snapshot(db,id){
 const project=db.prepare('SELECT * FROM proekty WHERE id=?').get(id);if(!project)throw new NeNajdeno();
 const tasks=db.prepare('SELECT * FROM zadachi WHERE proekt_id=? AND '+OPEN+' ORDER BY id').all(id);
 const payments=db.prepare('SELECT id,versija,summa FROM platezhi WHERE proekt_id=? AND oplachen_at IS NULL ORDER BY id').all(id);
 const outside=db.prepare(`SELECT z.id,z.versija FROM zadachi z WHERE z.roditel_id IN (SELECT id FROM zadachi WHERE proekt_id=? AND ${OPEN}) AND (z.proekt_id IS NULL OR z.proekt_id<>?) AND ${OPEN} ORDER BY z.id`).all(id,id);
 const token=createHash('sha256').update(JSON.stringify({project:[project.id,project.versija,project.status,project.klient_id,project.napravlenie,project.arhiv],tasks:tasks.map(x=>[x.id,x.versija,x.status,x.povtorjaetsja]),payments,outside})).digest('hex');
 return {project,tasks,payments,outside,token};
}
function observed(db,project,body){
 if(body.versija!==undefined){if(!Number.isSafeInteger(body.versija)||body.versija<1)throw new OshibkaVvoda('Обнови проект перед действием','versija');if(body.versija!==project.versija)throw new Konflikt('Проект уже изменили. Проверь текущие поля.',{project_changed:true,versija:project.versija});}
 if(body.hvosty_token!==undefined){if(typeof body.hvosty_token!=='string'||!/^[0-9a-f]{64}$/.test(body.hvosty_token))throw new OshibkaVvoda('Обнови предпросмотр завершения','hvosty_token');if(snapshot(db,project.id).token!==body.hvosty_token)throw new Konflikt('Задачи или платежи изменились. Пересчитай предпросмотр перед завершением.',{project_tails_changed:true});}
}
function transfer(db,source,target,tasks){
 if(target.id===source.id)throw new OshibkaVvoda('Выбери другой проект','v_proekt_id');
 if(target.arhiv||target.status==='zavershen')throw new OshibkaVvoda('Выбери действующий проект','v_proekt_id');
 if(target.klient_id!==source.klient_id||target.napravlenie!==source.napravlenie)throw new OshibkaVvoda('Нужен проект того же клиента и направления','v_proekt_id');
 for(const task of tasks){require('./svjazi.js').proverit(db,'zadachi',{...task,proekt_id:target.id});require('./akkaunt-zadachi.js').validate(db,{proekt_id:target.id},task,task.versija);}
}
module.exports={snapshot,observed,transfer,OPEN};
