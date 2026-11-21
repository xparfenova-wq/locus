(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.LocusDecimalPlan=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function read(value){
  const text=String(value).trim().replace(',','.');
  if(text.length>1024)throw new TypeError('План слишком длинный');
  const match=text.match(/^([+-]?)(\d*(?:\.\d*)?)(?:e([+-]?\d+))?$/i);
  if(!match||!/[0-9]/.test(match[2])||!Number.isFinite(Number(text)))throw new TypeError('Нужен конечный десятичный план');
  const [whole,fraction='']=match[2].split('.'),digits=(whole+fraction).replace(/^0+/,'');
  if(!digits)return {number:0n,exponent:0};
  if(Number(text)===0)throw new RangeError('План слишком мал для хранения');
  const exponent=Number(match[3]||0)-fraction.length;
  if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>1024)throw new RangeError('Недопустимый порядок плана');
  return {number:BigInt((match[1]==='-'?'-':'')+digits),exponent};
 }
 function text(number,exponent){
  if(number===0n)return '0';
  const sign=number<0n?'-':'',digits=(number<0n?-number:number).toString();
  if(exponent>=0)return sign+digits+'0'.repeat(exponent);
  const point=digits.length+exponent;
  const value=point>0?digits.slice(0,point)+'.'+digits.slice(point):'0.'+'0'.repeat(-point)+digits;
  return sign+value.replace(/0+$/,'').replace(/\.$/,'');
 }
 function sum(values){
  const parts=values.map(read);if(!parts.length)return '0';
  const exponent=Math.min(...parts.map(part=>part.exponent));
  return text(parts.reduce((total,part)=>total+part.number*10n**BigInt(part.exponent-exponent),0n),exponent);
 }
 function subtract(left,right){const b=read(right),a=read(left),exponent=Math.min(a.exponent,b.exponent);return text(a.number*10n**BigInt(a.exponent-exponent)-b.number*10n**BigInt(b.exponent-exponent),exponent);}
 function format(value){const normalized=sum([value]),[whole,fraction]=normalized.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,' ')+(fraction?','+fraction:'');}
 function split(value,count){
  if(!Number.isSafeInteger(count)||count<1||count>12)throw new TypeError('Нужно от одного до двенадцати периодов');
  const normalized=read(sum([value]));if(normalized.number<0n)throw new RangeError('Разбивается неотрицательный план');
                                                                              
                                                                                 
  let left=normalized.number;const parts=[];
  for(let i=0;i<count;i++){const remaining=BigInt(count-i),part=(left+remaining-1n)/remaining;parts.push(text(part,normalized.exponent));left-=part;}
  return parts;
 }
 return {sum,subtract,format,split};
});
