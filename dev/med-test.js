/* B 階段：用藥計算（從 src/index.html 抽出 date helpers 與 med helpers 區塊執行，不複製程式碼）。合成資料。
   執行：node dev/med-test.js */
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.SRC?path.resolve(process.env.SRC):path.join(__dirname,'../src/index.html'),'utf8');
const block=n=>{const m=html.match(new RegExp('\\/\\* ---- '+n+' helpers: begin[^*]*\\*\\/([\\s\\S]*?)\\/\\* ---- '+n+' helpers: end ---- \\*\\/'));if(!m){console.error('找不到 '+n+' helpers 區塊標記');process.exit(2)}return m[1]};
const H=new Function(block('date')+block('med')+';return{tookMed,validDate,validDose,sortMeddose,doseOn,hasResult,trackStart,countable,recheckState,dueWith,validInterval,validFixed,parseInterval,planOf,latestOf,summarize,summaryText,summaryMd,summaryHtml}')();
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

/* 回診摘要 */
const INFO={thy_lab:{name:'甲狀腺抽血',def:6,noFollow:[]},thy_us:{name:'甲狀腺超音波',def:12,noFollow:['none','vlowSmall']},breast_us:{name:'乳房超音波',def:12,noFollow:[]}};
const C=(o={})=>({days:{},exercise:[],records:[],meddose:[],settingDose:50,pause:null,weeks:undefined,info:INFO,intervals:{},...o});
const sec=(sm,t)=>(sm.sections.find(x=>x[0]===t)||[,[]])[1];
eq('期間反向：錯誤',H.summarize(C(),'2026-10-30','2026-10-01','2026-10-31').error,'開始日要在結束日之前。');
eq('結束日在未來：錯誤',H.summarize(C(),'2026-10-01','2026-11-01','2026-10-31').error,'結束日不能晚於今天。');
eq('日期空白：錯誤',H.summarize(C(),'','2026-10-01','2026-10-31').error,'請填開始日和結束日。');
let sm=H.summarize(C(),'2026-10-01','2026-10-30','2026-10-31');
eq('全空：每段都在，寫期間內沒有紀錄',sm.sections.map(x=>x[0]),['體重（早上）','服藥','劑量','甲狀腺抽血','運動','月經標記','檢查']);
eq('全空：各段的寫法',[sec(sm,'體重（早上）').at(-1),sec(sm,'服藥')[0],sec(sm,'甲狀腺抽血')[0],sec(sm,'運動')[0],sec(sm,'月經標記')[0]],['期間內沒有紀錄','期間內沒有紀錄','期間內沒有紀錄','期間內沒有運動紀錄','期間內沒有標記']);
eq('單日期間',H.summarize(C(),'2026-10-30','2026-10-30','2026-10-31').title,'家琳回診摘要 2026/10/30–2026/10/30（共 1 天）');
const W={};['2026-10-01','2026-10-02','2026-10-07'].forEach((k,i)=>W[k]={am:{w:[52,52.2,52.4][i]}});['2026-10-24','2026-10-30'].forEach(k=>W[k]={am:{w:53}});W['2026-09-30']={am:{w:99}};W['2026-10-31']={am:{w:99}};
sm=H.summarize(C({days:W}),'2026-10-01','2026-10-30','2026-10-31');
eq('體重：期初窗含頭尾 7 天（10/01–10/07）、期末不足 3 筆；區間外不混入',sec(sm,'體重（早上）'),['期初 7 天平均 52.2 kg（3 筆）','期末 7 天：資料不足（2 筆）','早上有量 5／30 天']);
sm=H.summarize(C({days:W}),'2026-10-01','2026-10-10','2026-10-31');
eq('少於 14 天：只寫期間平均',sec(sm,'體重（早上）')[0],'期間平均 52.2 kg（3 筆）');
const MD2={'2026-10-01':{am:{w:52},med:{taken:true,mode:'bedtime',interfere:{coffee:true,calcium:false}}},'2026-10-02':{med:{taken:true,mode:'weird',interfere:{coffee:true}}},'2026-10-03':{med:{interfere:{iron:true}}}};
sm=H.summarize(C({days:MD2}),'2026-10-01','2026-10-03','2026-10-31');
eq('服藥：可計日、方式分佈（不認得的算未填）、只算「有」的標記、沒有 taken 的不算',sec(sm,'服藥'),['已記錄服藥 2/3 天','未記錄的日子：10/03','服藥方式：睡前 1 天、未填 1 天','自行標記為「有」：咖啡 2 天']);
const MDS=[md('a','2026-09-01',50),md('b','2026-10-10',75,{createdAt:1}),md('c','2026-10-10',62,{createdAt:2,tablet:'100 mcg × ½',reason:'x'}),md('d','2026-11-01',88)];
sm=H.summarize(C({meddose:MDS}),'2026-10-01','2026-10-30','2026-10-31');
eq('劑量：期初的劑量紀錄、同日只列生效那筆、期間外不列',sec(sm,'劑量').slice(1),['期初的劑量紀錄：50 mcg','10/10 劑量變更 62 mcg・100 mcg × ½・x']);
eq('劑量：沒有紀錄時依目前設定推定',sec(H.summarize(C(),'2026-10-01','2026-10-30','2026-10-31'),'劑量'),['服藥紀錄上的劑量：期間內沒有服藥紀錄','期初的劑量紀錄：沒有（依目前設定推定 50 mcg）','期間內沒有變更']);
const RL=[{exam:'thy_lab',date:'2026-10-20',labs:{'Free T4':'1.1'},drawCtx:{medBeforeDraw:'no'}},{exam:'thy_lab',date:'2026-11-02',labs:{TSH:'9'}}];
sm=H.summarize(C({records:RL}),'2026-10-01','2026-10-30','2026-10-31');
eq('抽血：缺 TSH 寫未填、不省略整筆；期間外不列',sec(sm,'甲狀腺抽血').slice(1),['10/20 TSH 未填・Free T4 1.1・抽血前服藥：否・近一週生物素：未填']);
/* 偏高偏低：頁面把 lab helpers 的標記函式交給摘要（flagOf）；這裡用同一段程式碼，不複製 */
{const LH=new Function(block('shot')+block('lab')+';return{flagMark,labFlagOf}')(),flagOf=(v,m)=>LH.flagMark(LH.labFlagOf(v,m));
  const RF=[{exam:'thy_lab',date:'2026-10-20',labs:{TSH:'5.2','Free T4':'0.80'},labMeta:{TSH:{flag:'H',flagSrc:'report'},'Free T4':{ref:'0.93-1.70'}}},
    {exam:'thy_lab',date:'2026-10-25',labs:{TSH:'99','Free T4':'1.2'},labMeta:{TSH:{flag:'H',mark:'HH',flagSrc:'report'},'Free T4':{ref:'0.93-1.70',flag:null,flagSrc:'manual'}}},
    {exam:'thy_lab',date:'2026-10-28',labs:{TSH:'3.17'},labMeta:{TSH:{flag:'A',flagSrc:'report'}}}];
  const s1=sec(H.summarize(C({records:RF,flagOf}),'2026-10-01','2026-10-30','2026-10-31'),'甲狀腺抽血');
  eq('摘要的抽血：報告標的 H、依參考值算出的 L、HH、手動的「無」不標、A 寫 *；說明行提到標記',s1,['數值照輸入的原文；單位依表單欄位：TSH μIU/mL、Free T4 ng/dL；↑ H／↓ L／* 依報告的參考值或標記',
    '10/20 TSH 5.2 ↑ H・Free T4 0.80 ↓ L・抽血前服藥：未填・近一週生物素：未填','10/25 TSH 99 ↑ HH・Free T4 1.2・抽血前服藥：未填・近一週生物素：未填','10/28 TSH 3.17 *・Free T4 未填・抽血前服藥：未填・近一週生物素：未填']);
  eq('摘要的抽血：沒有交標記函式時，照舊不標、說明行不變',sec(H.summarize(C({records:RF}),'2026-10-01','2026-10-30','2026-10-31'),'甲狀腺抽血')[1],'10/20 TSH 5.2・Free T4 0.80・抽血前服藥：未填・近一週生物素：未填');
  const smF=H.summarize(C({records:RF,flagOf}),'2026-10-01','2026-10-30','2026-10-31');
  eq('摘要的 Markdown：* 有跳脫，箭頭照原樣',H.summaryMd(smF).includes('TSH 3.17 \\*')&&H.summaryMd(smF).includes('TSH 5.2 ↑ H'),true);
  eq('摘要的 HTML：標記是文字，沒有標籤',H.summaryHtml(smF).includes('<li>10/20 TSH 5.2 ↑ H・Free T4 0.80 ↓ L・'),true)}
const EXs=[{date:'2026-10-02',min:60},{date:'2026-10-03',min:30,deleted:true},{date:'2026-10-04',min:-5},{date:'2026-10-05',min:'40'},{date:'2026-11-01',min:90}];
eq('運動：排除軟刪除與無效分鐘；7 天以上算每週平均',sec(H.summarize(C({exercise:EXs}),'2026-10-01','2026-10-14','2026-10-31'),'運動'),['每週平均 30 分（共 60 分）']);
eq('運動：少於 7 天只寫總分鐘',sec(H.summarize(C({exercise:EXs}),'2026-10-01','2026-10-03','2026-10-31'),'運動'),['共 60 分']);
const P={};['2026-10-01','2026-10-02','2026-10-09','2026-10-10','2026-10-12','2026-10-30'].forEach(k=>P[k]={period:true});
eq('月經：連續標記合併，不跨過沒標記的日子；碰到邊界加註',sec(H.summarize(C({days:P}),'2026-10-01','2026-10-30','2026-10-31'),'月經標記'),['10/01–10/02（期間外可能還有）','10/09–10/10','10/12','10/30（期間外可能還有）']);
const RX=[{exam:'breast_us',date:'2025-06-01',interval:12,createdAt:1},{exam:'thy_us',date:'2026-10-05',interval:0,createdAt:1},{exam:'thy_lab',date:'2026-07-01',interval:6,createdAt:1},{exam:'thy_lab',date:'2026-11-05',interval:6,createdAt:2}];
sm=H.summarize(C({records:RX,meddose:[md('m','2026-10-01',75)],weeks:4}),'2026-10-01','2026-10-30','2026-10-31');
eq('檢查：以 to 為基準；逾期、待安排、到期的 TSH 複查列為待處理；之後的抽血不抵銷',sec(sm,'檢查'),['截至 2026/10/30 仍待處理：甲狀腺超音波 待安排、乳房超音波 2026/06/01 到期、TSH 複查（劑量變更後）2026/10/29 到期','之後 180 天內到期：甲狀腺抽血 2027/01/01']);
eq('期間跨年：期間內的日期加上年份',sec(H.summarize(C({days:{'2025-12-31':{am:{w:52},med:{taken:true}},'2026-01-02':{am:{w:52},med:{taken:true}}}}),'2025-12-31','2026-01-02','2026-01-02'),'服藥')[1],'未記錄的日子：2026/01/01');
eq('dueWith 和頁面規則一致：不追蹤分類、設定的固定間隔、預設',[H.dueWith({exam:'thy_us',date:'2026-01-01',preset:'none',interval:null},INFO,{}),H.dueWith({exam:'thy_lab',date:'2026-01-31',interval:null},INFO,{thy_lab:1}),H.dueWith({exam:'thy_lab',date:'2026-01-31',interval:null},INFO,{})],[null,'2026-02-28','2026-07-31']);
/* 審查第 2 點：摘要要列出服藥紀錄上的劑量快照，和劑量變更紀錄、依設定推定的劑量分開 */
{const SD={'2026-10-01':{med:{taken:true,dose:50}},'2026-10-02':{med:{taken:true,dose:50}},'2026-10-05':{med:{taken:true,dose:75,doseSrc:'setting'}},'2026-10-06':{med:{taken:true}},'2026-10-07':{med:{dose:62}}};
  const L=sec(H.summarize(C({days:SD,settingDose:75}),'2026-10-01','2026-10-07','2026-10-31'),'劑量');
  eq('第 2 點：快照依劑量分組，標出記錄時依設定推定、沒有記劑量的天數；沒有 taken 的不算',L[0],'服藥紀錄上的劑量：50 mcg 2 天（10/01–10/02）、75 mcg（記錄時依設定推定）1 天（10/05）、劑量沒有記錄 1 天');
  eq('第 2 點：期初的劑量紀錄和目前設定分開寫',L[1],'期初的劑量紀錄：沒有（依目前設定推定 75 mcg）');
  eq('第 2 點：期間內沒有服藥紀錄',sec(H.summarize(C(),'2026-10-01','2026-10-07','2026-10-31'),'劑量')[0],'服藥紀錄上的劑量：期間內沒有服藥紀錄')}

/* 輸出與跳脫 */
const XSS=H.summarize(C({meddose:[md('x','2026-10-10',75,{reason:'<script>alert(1)</script>![img](http://e.x/a.png)',brand:'A & "B"'})]}),'2026-10-01','2026-10-30','2026-10-31');
const outH=H.summaryHtml(XSS),mdo=H.summaryMd(XSS),txt=H.summaryText(XSS);
eq('HTML：沒有 script、img 標籤，特殊字元跳脫',[/<script/i.test(outH),/<img/i.test(outH),outH.includes('&lt;script&gt;'),outH.includes('&amp; &quot;B&quot;')],[false,false,true,true]);
eq('HTML：不連外部資源',/(src|href)=/i.test(outH),false);
eq('Markdown：圖片語法被跳脫',[mdo.includes('![img](http'),mdo.includes('\\!\\[img\\]\\(http')],[false,true]);
eq('三種輸出來自同一份內容',[txt.includes('75 mcg'),mdo.includes('75 mcg'),outH.includes('75 mcg')],[true,true,true]);

/* 2026-11-12 審查 B-03、B-04：間隔只收 0–120 的整數月；無效的間隔、沒有固定間隔的檢查都是待安排，不算出不合法的日期 */
eq('validInterval：0–120 的整數才算',[0,1,12,120,121,-1,1.5,1e12,NaN,Infinity,'12',null,undefined].map(H.validInterval),[true,true,true,true,false,false,false,false,false,false,false,false,false]);
eq('parseInterval：空白是沒有間隔；0–120 的整數照收（前後空白、前導 0 可以）',['','  ','0','12','120','012',' 6 '].map(H.parseInterval),[{ok:true,v:null},{ok:true,v:null},{ok:true,v:0},{ok:true,v:12},{ok:true,v:120},{ok:true,v:12},{ok:true,v:6}]);
{const bad=['-1','1.5','121','1e12','1000000000000','abc','12a','+5','１２','0x10','1e2','NaN','Infinity','−1','1 2','.5'];
  eq('parseInterval：負數、小數、超過範圍、極大數、非數字都不收，也不給值',bad.map(s=>H.parseInterval(s)),bad.map(()=>({ok:false,v:null})))}
/* 頁面自己的檢查表：直接從 src/index.html 取出 EXAMS 與 EXINFO 那一行來執行，不另外抄一份。頁面的不追蹤分類或預設間隔設錯，下面的測試就會失敗（複查報告第 5 節） */
const PAGE=(()=>{const ex=html.match(/const BIRADS=[\s\S]*?\nconst EXAMS=\[[\s\S]*?\n\];/),info=html.match(/\nconst EXINFO=[^\n]*\n/);
  if(!ex||!info){console.error('找不到 EXAMS 或 EXINFO');process.exit(2)}return new Function(ex[0]+info[0]+';return{EXAMS,EXINFO}')()})();
const PI=PAGE.EXINFO;
eq('頁面的 EXINFO：十一項檢查；不追蹤的分類只有甲狀腺超音波的 none、vlowSmall 與骨密度的 nofollow；沒有固定間隔的是骨密度與其他抽血；預設不排追蹤（noPlan）的只有其他抽血',[Object.keys(PI).length,Object.entries(PI).filter(([,v])=>v.noFollow.length).map(([k,v])=>[k,v.noFollow]),Object.entries(PI).filter(([,v])=>v.def==null).map(([k])=>k),Object.entries(PI).filter(([,v])=>v.noPlan).map(([k])=>k)],[11,[['thy_us',['none','vlowSmall']],['bone_dxa',['nofollow']]],['bone_dxa','lab_other'],['lab_other']]);
eq('頁面的 EXAMS：骨密度的分類只有 POI 兩個帶入間隔，其他都沒有（不是 0）；nofollow 是唯一的不追蹤',PAGE.EXAMS.find(e=>e.id==='bone_dxa').presets.map(p=>[p.k,p.m,!!p.noFollow]),[['none',null,false],['zlow',null,false],['zok',null,false],['poiLow',12,false],['poiNormHT',60,false],['tnorm',null,false],['tlow',null,false],['top',null,false],['nofollow',null,true]]);
eq('validFixed：固定間隔只收 1–120 的整數（0 不算）',[1,12,120,0,121,180,1200,-1,0.4,1.5,1e12,NaN,Infinity,'12',null,undefined].map(H.validFixed),[true,true,true,false,false,false,false,false,false,false,false,false,false,false,false,false]);
/* planOf 的四種結果：A 盡快處理、D 有到期日、U 還沒有追蹤計畫、N 不追蹤 */
{const P=(r,ivs={})=>H.planOf(r,PI,ivs),A=d=>({due:d,asap:true,unplanned:false}),D=d=>({due:d,asap:false,unplanned:false}),U={due:null,asap:false,unplanned:true},N=D(null);
  eq('planOf：interval 0 是盡快處理；1–120 的整數照算（含月底）',[P({exam:'thy_lab',date:'2026-10-01',interval:0}),P({exam:'thy_lab',date:'2026-01-31',interval:1}),P({exam:'thy_lab',date:'2016-10-01',interval:120})],[A('2026-10-01'),D('2026-02-28'),D('2026-10-01')]);
  eq('planOf：-1、1.5、121、1e12、NaN、Infinity 都是盡快處理，不拿去算日期',[-1,1.5,121,1e12,NaN,Infinity].map(iv=>P({exam:'thy_lab',date:'2026-10-01',interval:iv})),Array(6).fill(A('2026-10-01')));
  eq('planOf：無效的 interval 加上合法的醫師指定日期 → 照日期',P({exam:'thy_lab',date:'2026-10-01',interval:1e12,nextDue:'2027-04-01'}),D('2027-04-01'));
  eq('planOf：nextDue 不是合法日期就不採用',[P({exam:'thy_lab',date:'2026-10-01',interval:6,nextDue:'2026-13-40'}),P({exam:'thy_lab',date:'2026-10-01',interval:0,nextDue:'NaN-NaN-NaN'})],[D('2027-04-01'),A('2026-10-01')]);
  eq('planOf：沒有固定間隔的檢查（骨密度），interval 是 null、不存在、字串時都是還沒有追蹤計畫，不看設定',[P({exam:'bone_dxa',date:'2025-11-25',interval:null}),P({exam:'bone_dxa',date:'2025-11-25'}),P({exam:'bone_dxa',date:'2025-11-25',interval:'12'}),P({exam:'bone_dxa',date:'2025-11-25',interval:null},{bone_dxa:12})],Array(4).fill(U));
  eq('planOf：其他抽血（noPlan）沒有間隔也沒有日期時不追蹤（due 是 null，不是還沒有追蹤計畫，也不是盡快處理）；不看設定',[P({exam:'lab_other',date:'2026-10-01',interval:null}),P({exam:'lab_other',date:'2026-10-01'}),P({exam:'lab_other',date:'2026-10-01',interval:'6'}),P({exam:'lab_other',date:'2026-10-01',interval:null},{lab_other:6}),P({exam:'lab_other',date:'zzzz',interval:null})],Array(5).fill(N));
  eq('planOf：其他抽血填了間隔或日期就照算：6 個月、0 是盡快處理、醫師指定日期優先、無效的間隔是盡快處理',[P({exam:'lab_other',date:'2026-01-10',interval:6}),P({exam:'lab_other',date:'2026-10-01',interval:0}),P({exam:'lab_other',date:'2026-10-01',interval:null,nextDue:'2027-02-03'}),P({exam:'lab_other',date:'2026-10-01',interval:121})],[D('2026-07-10'),A('2026-10-01'),D('2027-02-03'),A('2026-10-01')]);
  eq('planOf：骨密度每個沒有間隔的分類都是還沒有追蹤計畫（none 不是不追蹤）',['none','zlow','zok','tnorm','tlow','top',null,'low'].map(k=>P({exam:'bone_dxa',date:'2025-11-25',preset:k,interval:null})),Array(8).fill(U));
  eq('planOf：骨密度的 interval 0 和其他檢查一樣是盡快處理，和還沒有追蹤計畫是兩回事；有 12、60 就照算',[P({exam:'bone_dxa',date:'2025-11-25',preset:'zok',interval:0}),P({exam:'bone_dxa',date:'2025-11-25',preset:'poiLow',interval:12}),P({exam:'bone_dxa',date:'2025-11-25',preset:'poiNormHT',interval:60})],[A('2025-11-25'),D('2026-11-25'),D('2030-11-25')]);
  eq('planOf：骨密度 nofollow 是不追蹤；又填了間隔、0 或醫師指定日期，就照那個算',[P({exam:'bone_dxa',date:'2025-11-25',preset:'nofollow',interval:null}),P({exam:'bone_dxa',date:'2025-11-25',preset:'nofollow'}),P({exam:'bone_dxa',date:'2025-11-25',preset:'nofollow',interval:24}),P({exam:'bone_dxa',date:'2025-11-25',preset:'nofollow',interval:0}),P({exam:'bone_dxa',date:'2025-11-25',preset:'nofollow',interval:null,nextDue:'2027-01-05'})],[N,N,D('2027-11-25'),A('2025-11-25'),D('2027-01-05')]);
  eq('planOf：其他檢查照舊（不追蹤的分類、字串 interval 用固定間隔、設定優先於預設）；別的檢查叫 nofollow 的 preset 不是不追蹤',[P({exam:'thy_us',date:'2026-01-01',preset:'none',interval:null}),P({exam:'thy_us',date:'2026-01-01',preset:'vlowSmall',interval:null}),P({exam:'thy_lab',date:'2026-01-31',interval:'6'}),P({exam:'thy_lab',date:'2026-01-31',interval:null},{thy_lab:1}),P({exam:'thy_lab',date:'2026-01-31',preset:'nofollow',interval:null})],[N,N,D('2026-07-31'),D('2026-02-28'),D('2026-07-31')]);
  /* 2026-11-13 複查 R-02：設定的固定間隔和設定頁用同一個檢查，不合格就當作沒有設定 */
  eq('planOf：設定的固定間隔不是 1–120 的整數（0、0.4、−1、121、180、1200、1e12、字串、NaN、null）→ 用預設值',[0,0.4,-1,121,180,1200,1e12,'3',NaN,null].map(v=>P({exam:'thy_lab',date:'2026-01-31',interval:null},{thy_lab:v})),Array(10).fill(D('2026-07-31')));
  eq('planOf：設定的固定間隔 1 與 120 是邊界，照用',[P({exam:'thy_lab',date:'2026-01-31',interval:null},{thy_lab:1}),P({exam:'thy_lab',date:'2026-01-31',interval:null},{thy_lab:120})],[D('2026-02-28'),D('2036-01-31')]);
  eq('planOf：檢查日期不合法或不存在 → 盡快處理；有合法的 nextDue 照日期；沒有間隔的骨密度仍是還沒有追蹤計畫',[P({exam:'thy_lab',date:'2026-02-31',interval:6}),P({exam:'thy_lab',interval:6}),P({exam:'thy_lab',date:'2026-02-31',interval:6,nextDue:'2027-01-05'}),P({exam:'bone_dxa',date:'2026-02-31',interval:null})],[A('2026-02-31'),A(undefined),D('2027-01-05'),U]);
  /* 回診摘要的仍待處理：盡快處理 → 有到期日（依到期日）→ 還沒有追蹤計畫 */
  const S=(records,o={})=>sec(H.summarize({...C({records,...o}),info:PI},'2026-10-01','2026-10-30','2026-10-31'),'檢查');
  const RB=[{exam:'bone_dxa',date:'2025-11-25',preset:'none',interval:null,createdAt:1},{exam:'breast_us',date:'2026-10-01',interval:1e12,createdAt:1},{exam:'thy_lab',date:'2026-07-01',interval:1.5,createdAt:1}];
  eq('摘要：無效間隔的紀錄是盡快處理，排最前；沒有間隔的骨密度是還沒有追蹤計畫，排最後；都寫待安排，不會消失',S(RB),['截至 2026/10/30 仍待處理：乳房超音波 待安排、甲狀腺抽血 待安排、骨密度 DXA 待安排','之後 180 天內到期：沒有']);
  eq('摘要：沒有 NaN',/NaN/.test(H.summaryText(H.summarize({...C({records:RB}),info:PI},'2026-10-01','2026-10-30','2026-10-31'))),false);
  eq('摘要（R-01）：骨密度還沒有追蹤計畫排在逾期的乳房超音波之後，盡快處理的甲狀腺超音波仍在最前',S([{exam:'bone_dxa',date:'2026-10-01',preset:'zok',interval:null,createdAt:1},{exam:'breast_us',date:'2025-06-01',interval:12,createdAt:1},{exam:'thy_us',date:'2026-10-05',interval:0,createdAt:1},{exam:'thy_lab',date:'2026-07-01',interval:6,createdAt:1}]),['截至 2026/10/30 仍待處理：甲狀腺超音波 待安排、乳房超音波 2026/06/01 到期、骨密度 DXA 待安排','之後 180 天內到期：甲狀腺抽血 2027/01/01']);
  eq('摘要（R-01）：只有還沒有追蹤計畫時也列出',S([{exam:'bone_dxa',date:'2026-10-01',preset:null,interval:null,createdAt:1}]),['截至 2026/10/30 仍待處理：骨密度 DXA 待安排','之後 180 天內到期：沒有']);
  eq('摘要（R-01b）：骨密度 nofollow 不列入',S([{exam:'bone_dxa',date:'2026-10-01',preset:'nofollow',interval:null,createdAt:1}]),['截至 2026/10/30 仍待處理：沒有','之後 180 天內到期：沒有']);
  eq('摘要（R-02）：設定的固定間隔 1200、0.4 不合格，用預設值（甲狀腺抽血 6 個月、胃鏡 24 個月）',S([{exam:'thy_lab',date:'2026-07-01',interval:null,createdAt:1},{exam:'gi_egd',date:'2024-10-15',interval:null,createdAt:1}],{intervals:{thy_lab:1200,gi_egd:0.4}}),['截至 2026/10/30 仍待處理：上消化道內視鏡（胃鏡） 2026/10/15 到期','之後 180 天內到期：甲狀腺抽血 2027/01/01']);
  /* 2026-11-13 複查 R-06：date 不合法或不存在的紀錄，摘要和其他三處一樣照 planOf 列出 */
  eq('摘要（R-06）：date 是 2026-02-31 的抽血、沒有 date 的胃鏡都列為待安排，不再是「沒有」',S([{exam:'thy_lab',date:'2026-02-31',interval:6,createdAt:1},{exam:'gi_egd',interval:24,createdAt:1}]),['截至 2026/10/30 仍待處理：甲狀腺抽血 待安排、上消化道內視鏡（胃鏡） 待安排','之後 180 天內到期：沒有']);
  eq('摘要（R-06）：date 不合法但有合法的醫師指定日期 → 照日期列；不追蹤的分類照樣不列',S([{exam:'thy_lab',date:'2026-02-31',interval:6,nextDue:'2026-12-01',createdAt:1},{exam:'thy_us',date:'not-a-date',preset:'none',interval:null,createdAt:1}]),['截至 2026/10/30 仍待處理：沒有','之後 180 天內到期：甲狀腺抽血 2026/12/01']);
  eq('摘要（R-06）：結束日之後才做的檢查（合法日期）照舊不算',S([{exam:'thy_lab',date:'2026-10-31',interval:0,createdAt:1}]),['截至 2026/10/30 仍待處理：沒有','之後 180 天內到期：沒有']);
  /* GPT 複核（第二輪）第 1 點：date 不合法的紀錄不能蓋過有合法 date 的紀錄，結果也不能隨資料順序改變 */
  const L=(recs)=>Object.fromEntries(Object.entries(H.latestOf(recs,x=>!!PI[x])).map(([k,r])=>[k,r.tag])),both=recs=>[L(recs),L([...recs].reverse())];
  const V1={exam:'bone_dxa',date:'2025-01-01',interval:12,createdAt:1,tag:'valid-old'},V2={exam:'bone_dxa',date:'2026-03-01',interval:12,createdAt:1,tag:'valid-new'};
  eq('latestOf：date 是 zzzz 的紀錄不蓋過合法日期的紀錄（兩種順序都一樣）',both([V1,{exam:'bone_dxa',date:'zzzz',interval:null,preset:'nofollow',createdAt:9,tag:'bad'}]),[{bone_dxa:'valid-old'},{bone_dxa:'valid-old'}]);
  eq('latestOf：沒有 date、date 是數字、date 是 2026-02-31 的紀錄也一樣不蓋過（兩種順序都一樣）',[{interval:0},{date:20270101,interval:0},{date:'2026-02-31',interval:0}].map(o=>both([V1,{exam:'bone_dxa',createdAt:9,tag:'bad',...o}])),Array(3).fill([{bone_dxa:'valid-old'},{bone_dxa:'valid-old'}]));
  eq('latestOf：兩筆合法日期取 date 大的；同一天取 createdAt 大的（兩種順序都一樣）',[both([V1,V2]),both([V2,{...V2,createdAt:2,tag:'same-day-later'}])],[[{bone_dxa:'valid-new'},{bone_dxa:'valid-new'}],[{bone_dxa:'same-day-later'},{bone_dxa:'same-day-later'}]]);
  eq('latestOf：這種檢查沒有任何合法日期的紀錄時，取 createdAt 最大的那筆（兩種順序都一樣）；頁面沒有的檢查代號不看',both([{exam:'gi_egd',createdAt:1,tag:'bad1'},{exam:'gi_egd',date:'zzzz',createdAt:5,tag:'bad5'},{exam:'gi_egd',date:'2026-02-31',createdAt:3,tag:'bad3'},{exam:'nope',date:'2026-01-01',tag:'x'}]),[{gi_egd:'bad5'},{gi_egd:'bad5'}]);
  /* GPT 第三輪：完全同順位（同一天、createdAt 相同或沒有）用文件 id 決定；createdAt 不是數字當成 0。任何排列都選同一筆 */
  const perms=a=>a.length<2?[a]:a.flatMap((x,i)=>perms([...a.slice(0,i),...a.slice(i+1)]).map(r=>[x,...r]));
  const pickAll=recs=>[...new Set(perms(recs).map(o=>L(o).bone_dxa))];
  eq('latestOf：同一天、都沒有 createdAt 的兩筆（一筆 12 個月、一筆不追蹤）：取文件 id 大的那筆，兩種順序都一樣',pickAll([{...V1,id:'a',tag:'a'},{...V1,id:'b',preset:'nofollow',interval:null,tag:'b'}].map(({createdAt,...r})=>r)),['b']);
  eq('latestOf：同一天、createdAt 相同的三筆：六種排列都取文件 id 最大的',pickAll(['k2','k9','k5'].map(id=>({...V1,createdAt:7,id,tag:id}))),['k9']);
  eq('latestOf：createdAt 混用文字與數字（"10"、"2"、3）：文字當成 0，六種排列都取數字 3 的那筆',pickAll([{...V1,createdAt:'10',id:'x1',tag:'s10'},{...V1,createdAt:'2',id:'x2',tag:'s2'},{...V1,createdAt:3,id:'x0',tag:'n3'}]),['n3']);
  eq('latestOf：createdAt 是 NaN、Infinity、null 也當成 0，再比文件 id',pickAll([{...V1,createdAt:NaN,id:'p1',tag:'nan'},{...V1,createdAt:Infinity,id:'p3',tag:'inf'},{...V1,createdAt:null,id:'p2',tag:'null'}]),['inf']);
  eq('latestOf：都沒有合法日期、createdAt 也相同：同樣用文件 id，六種排列一樣',[...new Set(perms([{exam:'gi_egd',id:'g1',tag:'g1'},{exam:'gi_egd',date:'zzzz',id:'g3',tag:'g3'},{exam:'gi_egd',date:20260101,id:'g2',tag:'g2'}]).map(o=>L(o).gi_egd))],['g3']);
  const SS=recs=>[S(recs),S([...recs].reverse())];
  eq('摘要：逾期的骨密度（2025-01-01＋12 個月）不會因為另一筆 date 是 zzzz 的不追蹤紀錄而消失（GPT 的反例，兩種順序）',SS([{exam:'bone_dxa',date:'2025-01-01',interval:12,createdAt:1},{exam:'bone_dxa',date:'zzzz',interval:null,preset:'nofollow',createdAt:2}]),Array(2).fill(['截至 2026/10/30 仍待處理：骨密度 DXA 2026/01/01 到期','之後 180 天內到期：沒有']));
  eq('摘要：有合法日期的紀錄時，沒有 date、interval 0 的紀錄不會讓結果隨順序改變',SS([{exam:'thy_lab',date:'2026-07-01',interval:6,createdAt:1},{exam:'thy_lab',interval:0,createdAt:2}]),Array(2).fill(['截至 2026/10/30 仍待處理：沒有','之後 180 天內到期：甲狀腺抽血 2027/01/01']));
  /* GPT 審查第 4 點：同順位照檢查表的順序，不看資料順序 */
  eq('摘要：兩筆都是盡快處理、兩筆同一天到期，都照檢查表的順序（乳房超音波在甲狀腺超音波之前；胃鏡在大腸鏡之前），資料順序反過來也一樣',
    SS([{exam:'thy_us',date:'2026-10-05',interval:0,createdAt:1},{exam:'breast_us',date:'2026-10-06',interval:0,createdAt:1},{exam:'gi_colo',date:'2025-12-01',interval:12,createdAt:1},{exam:'gi_egd',date:'2025-12-01',interval:12,createdAt:1}]),
    Array(2).fill(['截至 2026/10/30 仍待處理：乳房超音波 待安排、甲狀腺超音波 待安排','之後 180 天內到期：上消化道內視鏡（胃鏡） 2026/12/01、大腸鏡 2026/12/01']));
  eq('摘要：TSH 複查和檢查同一天到期時排在檢查之後',sec(H.summarize({...C({records:[{exam:'gi_colo',date:'2025-10-29',interval:12,createdAt:1}],meddose:[md('m','2026-10-01',75)],weeks:4}),info:PI},'2026-10-01','2026-10-30','2026-10-31'),'檢查')[0],'截至 2026/10/30 仍待處理：大腸鏡 2026/10/29 到期、TSH 複查（劑量變更後）2026/10/29 到期')}

console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
process.exit(fail?1:0);
