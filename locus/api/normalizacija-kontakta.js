                                                                            
function norma_kontakta(value,tip){
 const text=String(value||'').trim().toLowerCase();
 if(tip==='telefon'){
  const digits=text.replace(/\D/g,'');
  return !text.startsWith('+')&&digits.startsWith('8')&&digits.length===11?'7'+digits.slice(1):digits;
 }
 if(tip==='telegram'){
  const link=text.match(/^(?:https?:\/\/)?t\.me\/([a-z0-9_]+)\/?(?:[?#].*)?$/);
  return link?link[1]:text.replace(/^@/,'');
 }
 return text;
}
module.exports={norma_kontakta};
