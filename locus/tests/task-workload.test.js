const {test}=require('node:test'),assert=require('node:assert/strict');
const {describe,create}=require('../public/js/task-workload.js');
const data=(person=61,week='2026-W43',hours=4)=>({chelovek_id:person,god:Number(week.slice(0,4)),nedelja:Number(week.slice(-2)),imja:'Гоша',chasov:hours,zadach_nedeli:7,est_grafik:true});
function fixture(){
 let context={active:true,actor:61,person:61,week:'2026-W43'};const states=[],requests=[];
 const controller=create({readContext:()=>context,onChange:state=>states.push(state),request:(scope,options)=>new Promise((resolve,reject)=>requests.push({scope,options,resolve,reject}))});
 return {controller,requests,states,get state(){return states.at(-1);},set(value){context={...context,...value};}};
}
const tick=()=>Promise.resolve();
test('workload: Russian hour/task forms and fractions, explicit zero remains known',()=>{
 for(const [hours,word]of [[0,'часов'],[1,'час'],[4,'часа'],[11,'часов'],[21,'час'],[24,'часа'],[19.5,'часа'],[0.25,'часа']]){
  for(const [tasks,taskWord]of [[0,'задач'],[1,'задача'],[4,'задачи'],[14,'задач'],[21,'задача'],[22,'задачи']]){
   const text=describe({...data(61,'2026-W43',hours),zadach_nedeli:tasks});
   assert.ok(text.includes(` ${word} на неделе, `));assert.ok(text.endsWith(' '+taskWord));
  }
 }
 assert.equal(describe(data(61,'2026-W43',19.5)),'Гоша: 19,5 часа на неделе, 7 задач');
 assert.equal(describe({...data(),est_grafik:false}),'');
 for(const extra of [{chasov:null},{chasov:'0'},{chasov:NaN},{chasov:-1},{zadach_nedeli:1.5},{imja:''}])assert.equal(describe({...data(),...extra}),'');
});
test('workload: duplicate pending read is shared; loading clears previous text',async()=>{
 const f=fixture(),a=f.controller.refresh(),b=f.controller.refresh();assert.equal(a,b);await tick();assert.equal(f.requests.length,1);assert.equal(f.state.kind,'loading');assert.equal(f.state.text,'');
 f.requests[0].resolve(data());await a;assert.equal(f.state.kind,'ready');
 f.set({week:'2026-W44'});const c=f.controller.refresh();assert.equal(f.state.kind,'loading');assert.equal(f.state.text,'');await tick();f.requests[1].resolve(data(61,'2026-W44',19.5));await c;assert.ok(f.state.text.includes('19,5'));
});
test('workload: slow person, old error and A→B→A cannot replace latest data',async()=>{
 const f=fixture(),a=f.controller.refresh();await tick();f.set({person:62});const b=f.controller.refresh();await tick();f.set({person:61});const c=f.controller.refresh();await tick();
 assert.equal(f.requests[0].options.signal.aborted,true);assert.equal(f.requests[1].options.signal.aborted,true);
 f.requests[2].resolve({...data(),imja:'Свежие данные'});await c;
 f.requests[0].resolve({...data(),imja:'Старые данные'});await a;f.requests[1].reject(Error('late failure'));await b;assert.ok(f.state.text.startsWith('Свежие данные:'));
});
test('workload: late year/week response and context change without refresh are ignored',async()=>{
 const f=fixture(),a=f.controller.refresh();await tick();f.set({week:'2027-W01'});const b=f.controller.refresh();await tick();f.requests[1].resolve(data(61,'2027-W01',2));await b;f.requests[0].resolve(data());await a;assert.ok(f.state.text.includes('2 часа'));
 const c=f.controller.refresh();await tick();f.set({actor:62});f.requests[2].resolve({...data(61,'2027-W01'),imja:'Чужая сессия'});await c;assert.ok(!f.state.text.includes('Чужая'));
});
test('workload: mismatched response, missing graph and read failure never paint stale or guessed zero',async()=>{
 for(const response of [data(62),data(61,'2025-W43'),{...data(),est_grafik:false}]){
  const f=fixture(),p=f.controller.refresh();await tick();f.requests[0].resolve(response);await p;assert.equal(f.state.text,'');assert.notEqual(f.state.kind,'ready');
 }
 const f=fixture(),a=f.controller.refresh();await tick();f.requests[0].reject(Error('offline'));await a;assert.equal(f.state.kind,'error');const b=f.controller.refresh();await tick();f.requests[1].resolve({...data(61,'2026-W43',0),zadach_nedeli:0});await b;assert.equal(f.state.kind,'ready');assert.ok(f.state.text.includes('0 часов'));
});
test('workload: close/reopen same scope invalidates outstanding response and preserves overload signal',async()=>{
 const f=fixture(),a=f.controller.refresh();await tick();f.set({active:false});f.controller.reset();f.set({active:true});const b=f.controller.refresh();await tick();f.requests[1].resolve({...data(),podsvetit:true});await b;assert.equal(f.state.overloaded,true);f.requests[0].resolve({...data(),imja:'До закрытия'});await a;assert.ok(!f.state.text.includes('До закрытия'));
 f.set({active:false});await f.controller.refresh();assert.equal(f.state.kind,'idle');assert.equal(f.requests.length,2);f.controller.destroy();f.set({active:true});await f.controller.refresh();assert.equal(f.requests.length,2);
});
test('workload: invalid person/week/session causes no request',async()=>{
 for(const change of [{actor:null},{person:''},{week:'43'},{week:'2026-W00'},{week:'2026-W54'},{active:false}]){const f=fixture();f.set(change);await f.controller.refresh();await tick();assert.equal(f.requests.length,0);assert.equal(f.state.kind,'idle');}
});
