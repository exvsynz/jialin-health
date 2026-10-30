/* B 階段：用藥計算（從 src/index.html 抽出 date helpers 與 med helpers 區塊執行，不複製程式碼）。合成資料。
   執行：node dev/med-test.js */
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.SRC?path.resolve(process.env.SRC):path.join(__dirname,'../src/index.html'),'utf8');
const block=n=>{const m=html.match(new RegExp('\\/\\* ---- '+n+' helpers: begin[^*]*\\*\\/([\\s\\S]*?)\\/\\* ---- '+n+' helpers: end ---- \\*\\/'));if(!m){console.error('找不到 '+n+' helpers 區塊標記');process.exit(2)}return m[1]};
const H=new Function(block('date')+block('med')+';return{tookMed,validDate,validDose,sortMeddose,doseOn,hasResult,trackStart,countable,recheckState,dueWith,summarize,summaryText,summaryMd,summaryHtml}')();
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
eq('劑量：期初劑量、同日只列生效那筆、期間外不列',sec(sm,'劑量'),['期初劑量：50 mcg','10/10 劑量變更 62 mcg・100 mcg × ½・x']);
eq('劑量：沒有紀錄時依設定推定',sec(H.summarize(C(),'2026-10-01','2026-10-30','2026-10-31'),'劑量'),['期初劑量：50 mcg（依設定推定）','期間內沒有變更']);
const RL=[{exam:'thy_lab',date:'2026-10-20',labs:{'Free T4':'1.1'},drawCtx:{medBeforeDraw:'no'}},{exam:'thy_lab',date:'2026-11-02',labs:{TSH:'9'}}];
sm=H.summarize(C({records:RL}),'2026-10-01','2026-10-30','2026-10-31');
eq('抽血：缺 TSH 寫未填、不省略整筆；期間外不列',sec(sm,'甲狀腺抽血').slice(1),['10/20 TSH 未填・Free T4 1.1・抽血前服藥：否・近一週生物素：未填']);
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
/* 輸出與跳脫 */
const XSS=H.summarize(C({meddose:[md('x','2026-10-10',75,{reason:'<script>alert(1)</script>![img](http://e.x/a.png)',brand:'A & "B"'})]}),'2026-10-01','2026-10-30','2026-10-31');
const outH=H.summaryHtml(XSS),mdo=H.summaryMd(XSS),txt=H.summaryText(XSS);
eq('HTML：沒有 script、img 標籤，特殊字元跳脫',[/<script/i.test(outH),/<img/i.test(outH),outH.includes('&lt;script&gt;'),outH.includes('&amp; &quot;B&quot;')],[false,false,true,true]);
eq('HTML：不連外部資源',/(src|href)=/i.test(outH),false);
eq('Markdown：圖片語法被跳脫',[mdo.includes('![img](http'),mdo.includes('\\!\\[img\\]\\(http')],[false,true]);
eq('三種輸出來自同一份內容',[txt.includes('75 mcg'),mdo.includes('75 mcg'),outH.includes('75 mcg')],[true,true,true]);

console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
process.exit(fail?1:0);
