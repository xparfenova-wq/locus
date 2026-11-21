                                                                  
                                                                         
function data_zakrytija(alias='z') {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('неверный SQL alias');
  return `(SELECT datetime(MAX(datetime(j.kogda)),'+3 hours') FROM zhurnal j
    WHERE j.obekt='zadacha' AND j.obekt_id=${alias}.id
      AND ((j.pole='status' AND j.stalo='sdelano')
        OR (j.pole='kasanie' AND j.stalo='отмечено')))`;
}
module.exports={data_zakrytija};
