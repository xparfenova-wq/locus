const crypto=require('node:crypto');
function kljuch(){return String(process.env.LOCUS_KLJUCH_SBORA||'').trim();}
function proverit(value){
 const expected=Buffer.from(kljuch()),actual=Buffer.from(typeof value==='string'?value.trim():'');
 return expected.length>=32&&actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}
function zapros(req){
 const url=new URL(req.url,'http://localhost');
 const allowed=req.method==='GET'&&url.pathname==='/api/akkaunty'||
  req.method==='POST'&&/^\/api\/akkaunty\/[1-9]\d*\/prinjat_sbor$/.test(url.pathname);
 return allowed&&proverit(req.headers['x-locus-sborschik']);
}
module.exports={kljuch,proverit,zapros};
