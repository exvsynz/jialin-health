/* B 階段：用藥計算（從 src/index.html 抽出 date helpers 與 med helpers 區塊執行，不複製程式碼）。合成資料。
   執行：node dev/med-test.js */
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.SRC?path.resolve(process.env.SRC):path.join(__dirname,'../src/index.html'),'utf8');
const block=n=>{const m=html.match(new RegExp('\\/\\* ---- '+n+' helpers: begin[^*]*\\*\\/([\\s\\S]*?)\\/\\* ---- '+n+' helpers: end ---- \\*\\/'));if(!m){console.error('找不到 '+n+' helpers 區塊標記');process.exit(2)}return m[1]};
const H=new Function(block('date')+block('med')+';return{tookMed,validDate,validDose,sortMeddose,doseOn}')();
let fail=0;
const eq=(name,got,want)=>{const ok=JSON.stringify(got)===JSON.stringify(want);if(!ok)fail++;console.log((ok?'  ok   ':'  FAIL ')+name+(ok?'':' → '+JSON.stringify(got)+'（應為 '+JSON.stringify(want)+'）'))};
const md=(id,date,dose,o={})=>({id,date,dose,kind:'dose',createdAt:1,...o});

/* 服藥成立 */
eq('taken:true 才算服藥',[H.tookMed({med:{taken:true}}),H.tookMed({med:{interfere:{coffee:true}}}),H.tookMed({med:null}),H.tookMed({}),H.tookMed(undefined)],[true,false,false,false,false]);
/* 合法值 */
eq('日期驗證',[H.validDate('2026-10-31'),H.validDate('2026-02-30'),H.validDate('2026-1-5'),H.validDate(null)],[true,false,false,false]);
eq('劑量驗證：1–1000 的有限數字',[H.validDose(50),H.validDose(0),H.validDose(-25),H.validDose(1001),H.validDose(Infinity),H.validDose('50'),H.validDose(NaN)],[true,false,false,false,false,false,false]);
/* doseOn */
eq('沒有劑量紀錄：依設定推定',H.doseOn('2026-10-31',[],50),{dose:50,src:'setting'});
eq('沒有紀錄、設定也無效：null',H.doseOn('2026-10-31',[],undefined),null);
const L=[md('a','2026-09-01',50),md('b','2026-11-01',75)];
eq('生效日前：前一筆',H.doseOn('2026-10-31',L,25),{dose:50,src:'history',id:'a'});
eq('生效日當天就用新劑量',H.doseOn('2026-11-01',L,25),{dose:75,src:'history',id:'b'});
eq('最早一筆之前：依設定推定',H.doseOn('2026-08-31',L,25),{dose:25,src:'setting'});
eq('只有未來的紀錄：生效前依設定',H.doseOn('2026-10-31',[md('f','2026-12-01',88)],50),{dose:50,src:'setting'});
eq('同日多筆：createdAt 大的生效',H.doseOn('2026-11-01',[md('x','2026-11-01',75,{createdAt:5}),md('y','2026-11-01',62,{createdAt:3})],50),{dose:75,src:'history',id:'x'});
eq('同日、createdAt 相同：依 id',H.doseOn('2026-11-01',[md('k2','2026-11-01',62),md('k1','2026-11-01',75)],50),{dose:62,src:'history',id:'k2'});
eq('同日、沒有 createdAt：依 id',H.doseOn('2026-11-01',[md('b2','2026-11-01',62,{createdAt:undefined}),md('b1','2026-11-01',75,{createdAt:undefined})],50).id,'b2');
eq('軟刪除不算',H.doseOn('2026-11-02',[...L,md('d','2026-11-02',100,{deleted:true})],50).dose,75);
eq('劑量無效（負數、0、字串）不算',H.doseOn('2026-11-02',[...L,md('n','2026-11-02',-25),md('z','2026-11-02',0),md('s','2026-11-02','100')],50).dose,75);
eq('日期無效不算',H.doseOn('2026-11-02',[...L,md('bad','2026-02-30',100)],50).dose,75);
eq('全部刪除：回到設定',H.doseOn('2026-11-02',L.map(m=>({...m,deleted:true})),50),{dose:50,src:'setting'});
eq('排序：依日期、createdAt、id',H.sortMeddose([md('c','2026-11-01',1,{createdAt:2}),md('a','2026-10-01',1),md('b','2026-11-01',1,{createdAt:2})]).map(m=>m.id),['a','b','c']);

console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
process.exit(fail?1:0);
