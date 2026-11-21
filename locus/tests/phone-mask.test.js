const {test}=require('node:test'),assert=require('node:assert/strict');
const phones=require('../api/telefony'),core=require('../public/js/telefony'),{norma_kontakta}=require('../api/normalizacija-kontakta');
test('explicit international plus always preserves its prefix, including ten-digit and eight-leading numbers',()=>{
 for(const raw of ['+4912345678','+81234567890']){const result=phones.razobrat(raw);assert.equal(result.e164,raw);assert.equal(norma_kontakta(raw,'telefon'),raw.slice(1));}
 assert.equal(phones.razobrat('+4912345678').strana,'de');assert.equal(phones.razobrat('+81234567890').bez_maski,true);
});
test('three configured masks format their international digits and round-trip without losing a digit',()=>{
 for(const [raw,country,display] of [['+79161234567','ru','+7 (916) 123-45-67'],['+15551234567','us','+1 (555) 123-4567'],['+4915112345678','de','+49 151 12345678']]){const r=phones.razobrat(raw);assert.equal(r.strana,country);assert.equal(r.pokaz,display);assert.equal(r.po_maske,true);assert.equal(phones.razobrat(display).e164,raw);assert.equal(phones.pokaz(raw),display);}
});
test('Russian local conventions remain compatible while explicit selected countries accept national input',()=>{
 for(const raw of ['89161234567','9161234567'])assert.equal(phones.razobrat(raw).e164,'+79161234567');
 assert.equal(phones.razobrat('15112345678',{strana:'de',strict:true}).e164,'+4915112345678');
 assert.equal(phones.razobrat('5551234567',{strana:'us',strict:true}).e164,'+15551234567');
 assert.equal(phones.razobrat('+77001234567',{strana:'kz'}).strana,'kz');assert.equal(norma_kontakta('8 (916) 123-45-67','telefon'),'79161234567');
});
test('unknown and explicitly unmasked input is canonicalized without adding the default country',()=>{
 const raw='00 11 22 (33) 44',r=phones.razobrat(raw,{bez_maski:true});assert.equal(r.e164,'+0011223344');assert.equal(r.bez_maski,true);assert.equal(r.mask,null);assert.equal(phones.razobrat(raw,{strana:null}).e164,r.e164);
 assert.equal(phones.razobrat('+999 (12) 345-67').e164,'+9991234567');
});
test('nonbreaking pasted spaces behave like ordinary spaces; malformed input never becomes a different number',()=>{
 assert.deepEqual(phones.razobrat('+49\u00a0151\u202f12345678'),phones.razobrat('+49 151 12345678'));
 for(const value of ['','+','call +79161234567','+7+9161234567','++79161234567','+7.916.123.45.67'])assert.throws(()=>phones.razobrat(value),e=>e.kod===422);
 assert.throws(()=>phones.razobrat('+79161234567',{strana:'de'}),e=>e.dannye.kod==='phone_country_mismatch');
 assert.throws(()=>phones.razobrat('+4912345678',{strana:'de',strict:true}),e=>e.dannye.kod==='phone_mask_mismatch');
});
test('display fallbacks preserve legacy literal values and formatting never truncates extra digits',()=>{
 for(const value of ['legacy invalid <b>phone</b>','8123','+9991234567'])assert.equal(phones.pokaz(value),value);
 assert.equal(core.format('+7916123456789','+7 (999) 123-45-67'),'+7916123456789');
 const input=Object.freeze({strana:'de'}),before=JSON.stringify(phones.STRANY);phones.razobrat('+4915112345678',input);assert.equal(JSON.stringify(phones.STRANY),before);
});
