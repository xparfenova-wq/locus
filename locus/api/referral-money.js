                                                                             
function fraction(value) {
  if (!['number','string'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value)) return null;
  const m=String(value).trim().match(/^([+-]?)(\d+)(?:[.,](\d+))?(?:e([+-]?\d+))?$/i);
  if (!m || m[2].length+(m[3]||'').length>400) return null;
  const exponent=Number(m[4]||0)-(m[3]||'').length;
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent)>400) return null;
  const n=BigInt(m[2]+(m[3]||''))*(m[1]==='-'?-1n:1n);
  return exponent>=0 ? {n:n*10n**BigInt(exponent),d:1n} : {n,d:10n**BigInt(-exponent)};
}
function cents(value) {
  const f=fraction(value);
  return f && f.n>=0n && f.n*100n%f.d===0n ? f.n*100n/f.d : null;
}
function text(value) {
  if (value===null) return null;
  const a=value<0n?-value:value;
  return (value<0n?'-':'')+a/100n+'.'+String(a%100n).padStart(2,'0');
}
function number(value) {
  if (value===null) return null;
  const n=Number(text(value)),f=fraction(n);
  return Number.isFinite(n) && f && f.n*100n===value*f.d ? n : null;
}
function rate(value) {
  const f=fraction(value);
  return f && f.n>=0n && f.n<=100n*f.d ? f : null;
}
function accrual(income,percent,tax) {
  const p=rate(percent),t=rate(tax);
  if (income===null || !p || !t) return null;
  const numerator=income*p.n*(100n*t.d-t.n),denominator=10000n*p.d*t.d;
  return (numerator*2n+denominator)/(2n*denominator);
}
module.exports={fraction,cents,text,number,rate,accrual};
