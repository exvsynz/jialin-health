/* B 階段：用藥計算（從 src/index.html 抽出 date helpers 與 med helpers 區塊執行，不複製程式碼）。合成資料。
   執行：node dev/med-test.js */
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.SRC?path.resolve(process.env.SRC):path.join(__dirname,'../src/index.html'),'utf8');
const block=n=>{const m=html.match(new RegExp('\\/\\* ---- '+n+' helpers: begin[^*]*\\*\\/([\\s\\S]*?)\\/\\* ---- '+n+' helpers: end ---- \\*\\/'));if(!m){console.error('找不到 '+n+' helpers 區塊標記');process.exit(2)}return m[1]};
const H=new Function(block('date')+block('med')+';return{tookMed,validDate,validDose,sortMeddose,doseOn,hasResult,trackStart,countable,recheckState}')();
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

/* 檢驗值 */
eq('TSH 有結果：含數字才算',[H.hasResult('4.8'),H.hasResult('0'),H.hasResult('<0.01'),H.hasResult(''),H.hasResult('  '),H.hasResult('待報'),H.hasResult(undefined),H.hasResult(4.8)],[true,true,true,false,false,false,false,false]);

/* 可計日 */
const dd=(o={})=>({date:'',...o}),TK={med:{taken:true}};
const D0={'2026-10-25':dd({period:true}),'2026-10-26':{},'2026-10-27':dd({am:{w:52}}),'2026-10-28':dd(TK),'2026-10-29':dd({am:{w:52}}),'2026-10-30':dd(TK)};
eq('追蹤起點：只有月經標記或空文件不算',H.trackStart(D0),'2026-10-27');
eq('沒有任何體重或服藥：沒有起點',H.trackStart({'2026-10-25':dd({period:true})}),null);
let c=H.countable(D0,'2026-10-24','2026-10-30','2026-10-30',null);
eq('起點前不算；a/b 與未記錄日期一致',[c.a,c.b,c.missing],[2,4,['2026-10-27','2026-10-29']]);
eq('a ≤ b，b − a = 未記錄天數',c.b-c.a===c.missing.length&&c.a<=c.b,true);
c=H.countable({...D0,'2026-10-31':dd({am:{w:52}})},'2026-10-25','2026-10-31','2026-10-31',null);
eq('今天還沒服藥：不算進分母',[c.a,c.b,c.missing.includes('2026-10-31')],[2,4,false]);
c=H.countable({...D0,'2026-10-31':dd(TK)},'2026-10-25','2026-10-31','2026-10-31',null);
eq('今天服了：算進分子分母',[c.a,c.b],[3,5]);
c=H.countable(D0,'2026-10-24','2026-10-30','2026-10-30',{from:'2026-10-28',to:'2026-10-29'});
eq('暫停日分子分母都不算（暫停日有服藥也不算）',[c.a,c.b,c.paused,c.missing],[1,2,2,['2026-10-27']]);
c=H.countable(D0,'2026-10-24','2026-10-30','2026-10-30',{from:'2026-10-28',to:null});
eq('暫停只有開始日：不算暫停',c.paused,0);
eq('細節物件沒有 taken：不算服藥',H.countable({'2026-10-29':dd({am:{w:52}}),'2026-10-30':dd({med:{interfere:{coffee:true}}})},'2026-10-29','2026-10-30','2026-10-31',null).a,0);
eq('近 30 天的範圍：今天往前 29 天到今天（共 30 天）',(()=>{const ds={};for(let i=0;i<31;i++){const k=new Date(Date.UTC(2026,9,31)-i*864e5).toISOString().slice(0,10);ds[k]=dd(TK)}return H.countable(ds,'2026-10-02','2026-10-31','2026-10-31',null).b})(),30);
eq('期間反向：全部是 0',H.countable(D0,'2026-10-30','2026-10-24','2026-10-30',null),{a:0,b:0,missing:[],paused:0});

/* TSH 複查 */
const M=[md('m1','2026-09-01',50),md('m2','2026-10-01',75)];
const lab=(id,date,tsh,ctx)=>({id,exam:'thy_lab',date,labs:tsh==null?{}:{TSH:tsh},...(ctx?{drawCtx:ctx}:{})});
eq('沒有變更：none',H.recheckState([],[],'2026-10-30',6).st,'none');
eq('noRecheck：none',H.recheckState([md('n','2026-10-01',75,{noRecheck:true})],[],'2026-10-30',6).st,'none');
eq('沒設週數、沒手動：unset',H.recheckState(M,[],'2026-10-30',undefined).st,'unset');
let rs=H.recheckState(M,[],'2026-10-30',6);
eq('週數 6：auto，生效後 42 天',[rs.st,rs.due,rs.target.id],['auto','2026-11-12','m2']);
eq('改週數立刻重算',H.recheckState(M,[],'2026-10-30',4).due,'2026-10-29');
eq('週數不合法（0、53、4.5、字串）：unset',[0,53,4.5,'6'].map(w=>H.recheckState(M,[],'2026-10-30',w).st),['unset','unset','unset','unset']);
rs=H.recheckState([M[0],{...M[1],recheckDue:'2026-12-01'}],[],'2026-10-30',6);
eq('手動日期優先於週數：manual',[rs.st,rs.due],['manual','2026-12-01']);
eq('只看最新一筆生效的變更；未來的不算',H.recheckState([...M,md('f','2026-12-01',88)],[],'2026-10-30',6).target.id,'m2');
eq('連結、晚於生效日、有 TSH：done',H.recheckState(M,[lab('r1','2026-11-10','2.1',{recheckOf:'m2'})],'2026-11-20',6).st,'done');
eq('同日的基準抽血：不算完成',H.recheckState(M,[lab('r1','2026-10-01','4.8',{recheckOf:'m2'})],'2026-11-20',6).st,'auto');
eq('生效日前的抽血：不算完成',H.recheckState(M,[lab('r1','2026-09-20','4.8',{recheckOf:'m2'})],'2026-11-20',6).st,'auto');
eq('未來的抽血：不算完成',H.recheckState(M,[lab('r1','2026-11-25','2.0',{recheckOf:'m2'})],'2026-11-20',6).st,'auto');
eq('沒有連結的抽血：不算完成',H.recheckState(M,[lab('r1','2026-11-10','2.1')],'2026-11-20',6).st,'auto');
eq('連結到別次變更：不算完成',H.recheckState(M,[lab('r1','2026-11-10','2.1',{recheckOf:'m1'})],'2026-11-20',6).st,'auto');
eq('TSH 是 0、<0.01：算完成',['0','<0.01'].map(t=>H.recheckState(M,[lab('r1','2026-11-10',t,{recheckOf:'m2'})],'2026-11-20',6).st),['done','done']);
eq('TSH 空白、待報、沒填：不算完成',['','待報',null].map(t=>H.recheckState(M,[lab('r1','2026-11-10',t,{recheckOf:'m2'})],'2026-11-20',6).st),['auto','auto','auto']);
eq('不是甲狀腺抽血：不算完成',H.recheckState(M,[{...lab('r1','2026-11-10','2.1',{recheckOf:'m2'}),exam:'thy_us'}],'2026-11-20',6).st,'auto');
eq('刪除連結的抽血後：提醒恢復',H.recheckState(M,[],'2026-11-20',6).st,'auto');
eq('改了生效日：複查日跟著變',H.recheckState([M[0],{...M[1],date:'2026-10-10'}],[],'2026-10-30',6).due,'2026-11-21');
eq('換製劑（kind product）也排複查',H.recheckState([M[0],md('p','2026-10-05',50,{kind:'product'})],[],'2026-10-30',6).due,'2026-11-16');

console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
process.exit(fail?1:0);
