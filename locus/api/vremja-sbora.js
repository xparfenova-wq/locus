const {AsyncLocalStorage}=require('node:async_hooks');
const context=new AsyncLocalStorage();
module.exports={tekuschee:()=>context.getStore(),s_vremenem:(value,fn)=>context.run(value,fn)};
