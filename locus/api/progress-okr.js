                                                                          
const known=value=>typeof value==='number'&&Number.isFinite(value);
function result(row,fact){
 if(row.tip==='veha')return known(fact)?(fact>=1?100:0):null;
 if(!known(row.baza)||!known(row.plan)||!known(fact))return null;
 const distance=row.plan-row.baza;
 if(distance===0)return fact>=row.plan?100:0;
 return Math.round(Math.max(0,Math.min(100,(fact-row.baza)/distance*100))*10)/10;
}
function goal(rows){
 if(!rows.length)return 0;
 const values=rows.map(row=>result(row,row.fakt));
 if(values.some(value=>value===null))return null;
 return Math.round(values.reduce((sum,value)=>sum+value,0)/values.length);
}
function week(row){
 if(!known(row.fakt)||!known(row.dvizhenie_nedeli))return null;
 const now=result(row,row.fakt),before=result(row,row.fakt-row.dvizhenie_nedeli);
 return now===null||before===null?null:Math.round((now-before)*10)/10;
}
function goalWeek(rows){
 if(!rows.length)return null;
 const values=rows.map(week);
 return values.some(value=>value===null)?null:Math.round(values.reduce((a,b)=>a+b,0)/values.length);
}
module.exports={result,goal,week,goalWeek};
