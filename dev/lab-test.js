/* 檢驗值的偏高偏低：參考值的解析、標記的計算與顯示規則（從 src/index.html 抽出 shot helpers 與 lab helpers 區塊執行，不複製程式碼）。合成資料。
   高低只依報告的參考值或報告上的標記，頁面沒有內建任何參考值。
   執行：node dev/lab-test.js */
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.SRC?path.resolve(process.env.SRC):path.join(__dirname,'../src/index.html'),'utf8');
const block=n=>{const m=html.match(new RegExp('\\/\\* ---- '+n+' helpers: begin[^*]*\\*\\/([\\s\\S]*?)\\/\\* ---- '+n+' helpers: end ---- \\*\\/'));if(!m){console.error('找不到 '+n+' helpers 區塊');process.exit(1)}return m[1]};
const H=new Function(block('shot')+block('lab')+';return{flagKind,flagMark,flagArrow,labNum,parseRef,refFlag,labFlagOf,labNameKey,labAbnormal,labSummary,otherItem,parseShot,groupShot,LAB_FLAG_TXT}')();
const FX=require('./shot-fixtures.js');
let fail=0,n=0;
const eq=(name,got,want)=>{n++;const ok=JSON.stringify(got)===JSON.stringify(want);if(!ok)fail++;console.log((ok?'  ok   ':'  FAIL ')+name+(ok?'':' → '+JSON.stringify(got)+'（應為 '+JSON.stringify(want)+'）'))};
const R=(lo,hi)=>({lo,hi});

/* ---- 參考值的寫法 ---- */
eq('範圍：50–200、50-200、50~200、有空白、全形、to、至',['50–200','50-200','50~200','50 - 200','５０－２００','50～200','50 to 200','50至200','50—200'].map(H.parseRef),Array(9).fill(R(50,200)));
eq('範圍：小數、千分位、負數、外面一層括號',['0.27-4.20','4,000-10,000','-2.5--1.0','−1.0–1.0','(0.27-4.20)','[0.27-4.20]','（12～22）','.5-1.5'].map(H.parseRef),[R(0.27,4.2),R(4000,10000),R(-2.5,-1),R(-1,1),R(0.27,4.2),R(0.27,4.2),R(12,22),R(0.5,1.5)]);
eq('單邊：<5、≤5、<=5、＜5、≦5 是上限；>40、≥40、>=40、＞40、≧40 是下限',['<5','≤5','<=5','＜5','≦5','< 5.0','>40','≥40','>=40','＞40','≧40'].map(H.parseRef),[...Array(6).fill(R(null,5)),...Array(5).fill(R(40,null))]);
eq('不是範圍的都不解析：空的、文字、後面帶單位、兩段範圍、下限大於上限、單一數字、三段',['','Negative','陰性','0.27-4.20 μIU/mL','男 13-17 女 12-16','0.27-4.20; 0.7-6.4','200-50','5','1-2-3','<','50-','3,5-4,5',null,undefined].map(H.parseRef),Array(14).fill(null));

/* ---- 數值 ---- */
eq('數值：一般、千分位、全形、負號（− 與 -）、正號、比較符號',['5.2','1,234','５．２','−1.5','-1.5','+0.3','<0.01','≤3','>100','≧40'].map(H.labNum),
  [{op:'',eq:false,n:5.2},{op:'',eq:false,n:1234},{op:'',eq:false,n:5.2},{op:'',eq:false,n:-1.5},{op:'',eq:false,n:-1.5},{op:'',eq:false,n:0.3},{op:'<',eq:false,n:0.01},{op:'<',eq:true,n:3},{op:'>',eq:false,n:100},{op:'>',eq:true,n:40}]);
eq('數值：文字結果、帶單位、空的都不是數字',['Negative','陰性','5.2 mIU/L','','H 5.2','1.2.3',null].map(H.labNum),Array(7).fill(null));

/* ---- 由參考值算出高低；邊界值不算異常 ---- */
const F=(v,r)=>{const f=H.refFlag(v,r);return f===undefined?'?':f};
eq('範圍 0.27–4.20：剛好等於下限、上限都不算異常；低一點是 L、高一點是 H',[F('0.27','0.27-4.20'),F('4.20','0.27-4.20'),F('4.2','0.27–4.20'),F('0.26','0.27-4.20'),F('4.21','0.27-4.20'),F('2.1','0.27-4.20')],[null,null,null,'L','H',null]);
eq('單邊 <5：5 不算異常，5.1 是 H，再低都不是 L；≤5 相同',[F('5','<5'),F('5.1','<5'),F('0','<5'),F('5','≤5'),F('5.01','≤5')],[null,'H',null,null,'H']);
eq('單邊 >40：40 不算異常，39.9 是 L，再高都不是 H；≥40 相同',[F('40','>40'),F('39.9','>40'),F('400','>40'),F('40','≥40'),F('39','≥40')],[null,'L',null,null,'L']);
eq('負數範圍 -2.5–-1.0：-2.5、-1.0 不算異常，-2.6 是 L，-0.9 是 H；− 負號也可以',[F('-2.5','-2.5--1.0'),F('-1.0','-2.5--1.0'),F('-2.6','-2.5--1.0'),F('-0.9','-2.5--1.0'),F('−2.6','−2.5–−1.0')],[null,null,'L','H','L']);
eq('千分位：1,234 在 1,000–2,000 內；12,000 高於 4,000-10,000',[F('1,234','1,000-2,000'),F('12,000','4,000-10,000'),F('12000','4,000-10,000')],[null,'H','H']);
eq('數值帶比較符號：<0.01 一定低於 0.27 是 L；<0.27 也是 L；≤0.27 可能剛好等於下限，不判；<1 可能在範圍內，不判',[F('<0.01','0.27-4.20'),F('<0.27','0.27-4.20'),F('≤0.27','0.27-4.20'),F('<1','0.27-4.20')],['L','L','?','?']);
eq('數值帶比較符號：>1000 高於 <35 是 H；>4.20 是 H；≥4.20 不判；>3 不判',[F('>1000','<35'),F('>4.20','0.27-4.20'),F('≥4.20','0.27-4.20'),F('>3','0.27-4.20')],['H','H','?','?']);
eq('數值帶比較符號、參考值單邊：<3 在 <5 之內；<7 不判；>60 在 >40 之內；>30 不判',[F('<3','<5'),F('<7','<5'),F('>60','>40'),F('>30','>40')],[null,'?',null,'?']);
eq('算不出來的不判：文字結果、帶單位的值、沒有參考值、參考值解析不了',[F('Negative','0-5'),F('5.2 mIU/L','0.27-4.20'),F('5.2',''),F('5.2','0.27-4.20 μIU/mL'),F('','0.27-4.20'),F('5.2',null)],['?','?','?','?','?','?']);

/* ---- 標記的種類與寫法 ---- */
eq('flag 的方向：H、HH、小寫是 H；L、LL 是 L；A 與 * 是 A；其他是 null',['H','HH','h',' H ','L','LL','A','*','','X','N',null,undefined,5].map(H.flagKind),['H','H','H','H','L','L','A','A',null,null,null,null,null,null]);
eq('顯示：↑ H、↓ L、*；報告上的 HH、LL 照原樣；卡片上只有箭頭',[['H','HH','L','LL','A','*',null].map(H.flagMark),['H','HH','L','LL','A','*',null].map(H.flagArrow)],[['↑ H','↑ HH','↓ L','↓ LL','*','*',''],['↑','↑','↓','↓','*','*','']]);
eq('aria-label 用的字：偏高、偏低、異常',H.LAB_FLAG_TXT,{H:'偏高',L:'偏低',A:'異常'});

/* ---- 一個值顯示哪個標記：存的優先，沒有存的才由參考值算 ---- */
const OF=(v,m)=>H.labFlagOf(v,m);
eq('沒有 labMeta 的舊紀錄：沒有標記',[OF('5.2',undefined),OF('5.2',null),OF('5.2','x')],[null,null,null]);
eq('沒有 flagSrc 的舊紀錄：flag 當作報告上標的，照顯示（H、HH、*）',[OF('5.2',{raw:'H 5.2',unit:'μIU/mL',ref:'0.27-4.20',flag:'H'}),OF('99',{flag:'HH'}),OF('4.1',{flag:'*'})],['H','HH','*']);
eq('報告上的標記和參考值算出來的不同時，以報告為準',[OF('2.0',{ref:'0.27-4.20',flag:'H',flagSrc:'report'}),OF('9.9',{ref:'0.27-4.20',flag:'L',flagSrc:'report'})],['H','L']);
eq('沒有標記但有參考值的舊紀錄：顯示時由參考值算',[OF('5.2',{raw:'5.2',unit:null,ref:'0.27-4.20',flag:null}),OF('0.1',{ref:'0.27-4.20',flag:null}),OF('2.0',{ref:'0.27-4.20',flag:null}),OF('4.20',{ref:'0.27-4.20'})],['H','L',null,null]);
eq('手動設成沒有標記：就算超出參考值也不顯示；手動的 H、L、A 照顯示',[OF('5.2',{ref:'0.27-4.20',flag:null,flagSrc:'manual'}),OF('2.0',{ref:'0.27-4.20',flag:'H',flagSrc:'manual'}),OF('2.0',{flag:'L',flagSrc:'manual'}),OF('2.0',{flag:'A',flagSrc:'manual'})],[null,'H','L','A']);
eq('存的 flag 不是 H／L／A 之類時當作沒有，再看參考值',[OF('5.2',{ref:'0.27-4.20',flag:'N'}),OF('5.2',{flag:'N'}),OF('5.2',{ref:'0.27-4.20',flag:7})],['H',null,'H']);

/* ---- 卡片摘要 ---- */
const rec=(labs,labMeta)=>({labs,labMeta});
const five=rec({Hb:'10.0',MCV:'61.0',WBC:'6.5',PLT:'620',Ferritin:'4',CRP:'1.2',ANA:'1:80'},{Hb:{ref:'12.0-16.0',flag:'L',flagSrc:'report'},MCV:{ref:'80-100',flag:null},WBC:{ref:'4.0-10.0'},PLT:{flag:'HH',flagSrc:'report'},Ferritin:{ref:'>13'},CRP:{ref:'<0.5',flag:'H',flagSrc:'ref'},ANA:{flag:'A',flagSrc:'manual'}});
eq('異常項目：依紀錄自己的順序，只列有標記的（含由參考值算出的 MCV、Ferritin），在範圍內的 WBC 不列',H.labAbnormal(five).map(x=>x.name+' '+x.value+' '+x.flag),['Hb 10.0 L','MCV 61.0 L','PLT 620 HH','Ferritin 4 L','CRP 1.2 H','ANA 1:80 A']);
eq('卡片摘要最多 3 項，其餘寫「另 N 項」',H.labSummary(H.labAbnormal(five),3),'Hb 10.0 ↓、MCV 61.0 ↓、PLT 620 ↑、另 3 項');
eq('剛好 3 項不寫「另」；2 項就是 2 項；沒有異常是空的',[H.labSummary(H.labAbnormal(five).slice(0,3),3),H.labSummary(H.labAbnormal(five).slice(0,2),3),H.labSummary([],3)],['Hb 10.0 ↓、MCV 61.0 ↓、PLT 620 ↑','Hb 10.0 ↓、MCV 61.0 ↓','']);
eq('不給上限時全部列出，帶字母（歷次紀錄用）',H.labSummary(H.labAbnormal(five)),'Hb 10.0 ↓ L、MCV 61.0 ↓ L、PLT 620 ↑ HH、Ferritin 4 ↓ L、CRP 1.2 ↑ H、ANA 1:80 *');
eq('有固定欄位的檢查照欄位的順序；空的值、沒有 labs 的紀錄都不出錯',[H.labAbnormal(rec({'Free T4':'0.5',TSH:'9.9'},{TSH:{flag:'H'},'Free T4':{flag:'L'}}),['TSH','Free T4','T3']).map(x=>x.name),H.labAbnormal(rec({TSH:''},{TSH:{flag:'H'}})),H.labAbnormal({}),H.labAbnormal(null),H.labAbnormal({labs:'x',labMeta:5})],[['TSH','Free T4'],[],[],[],[]]);

/* ---- 名稱比對 ---- */
eq('名稱：大小寫、全形半形、前後與中間多的空白不算不同',['Hb','HB','ｈｂ',' hb ','Ｈb'].map(H.labNameKey).every(k=>k==='hb')&&H.labNameKey('Free  T4')===H.labNameKey('free t4')&&H.labNameKey('ＬＤＬ－Ｃ')===H.labNameKey('ldl-c'),true);
eq('名稱：不同的寫法不合併（HbA1c 與 Hb A1c、T3 與 T-3）',[H.labNameKey('HbA1c')===H.labNameKey('Hb A1c'),H.labNameKey('T3')===H.labNameKey('T-3')],[false,false]);

/* ---- 截圖：沒有對應欄位的檢驗保留各部分，供另存成「其他抽血」 ---- */
eq('otherItem：數值與旗標拆開，參考值、單位、原文保留；旗標在獨立一欄也採用；看不清楚的值標出來',
  [H.otherItem({name:'LDL-C',value:'H 135',flag:null,unit:'mg/dL',ref:'<130',unclear:[]}),H.otherItem({name:'MCV',value:'61.0',flag:'L',unit:'fL',ref:'80-100',unclear:[]}),H.otherItem({name:null,order:'血色素',value:null,flag:null,unit:null,ref:null,unclear:['value']})],
  [{name:'LDL-C',value:'135',unit:'mg/dL',ref:'<130',flag:'H',raw:'H 135',unclear:false},{name:'MCV',value:'61.0',unit:'fL',ref:'80-100',flag:'L',raw:'61.0',unclear:false},{name:'血色素',value:'',unit:'',ref:'',flag:null,raw:null,unclear:true}]);
{const p=H.parseShot(FX.unmapped,false),d=H.groupShot(p.items,{units:{TSH:'μIU/mL'},order:['thy_lab']});
  const host=d.find(x=>x.exam==='thy_lab'),lone=d.find(x=>x.labOnly);
  eq('unmapped：同一天的甲狀腺草稿帶著 FT3、Free testosterone 兩項（others），報告內容裡那幾行就是 othersBlock',[host.others.map(o=>[o.name,o.value,o.unit,o.ref,o.flag]),host.othersBlock,host.report.includes(host.othersBlock)],
    [[['FT3','3.1','pg/mL','2.0-4.4',null],['Free testosterone','0.9','pg/mL','',null]],'其他檢驗（沒有對應的欄位）：\nFT3 3.1 pg/mL（參考值 2.0-4.4）\nFree testosterone 0.9 pg/mL',true]);
  eq('unmapped：另一天只有對不到的那筆仍然是項目待選，帶著 LDL-C（135、H、<130）',[lone.exam,lone.others.map(o=>[o.name,o.value,o.unit,o.ref,o.flag,o.raw]),lone.report===lone.othersBlock],[null,[['LDL-C','135','mg/dL','<130','H','H 135']],true])}
{const p=H.parseShot(FX.single,false),d=H.groupShot(p.items,{units:{TSH:'μIU/mL','Free T4':'ng/dL'},order:['thy_lab']});
  eq('沒有對不到的檢驗時，草稿沒有 others',[d.length,d[0].others===undefined,d[0].othersBlock===undefined],[1,true,true])}
{const p=H.parseShot(FX.cbc,false),d=H.groupShot(p.items,{units:{},order:[]});
  eq('cbc：全部對不到，自成一筆；讀到的 ref 與 flag 都保留（值裡的 L、獨立一欄的 L、HH、沒有旗標）',d[0].others.map(o=>[o.name,o.value,o.unit,o.ref,o.flag]),[['Hb','10.0','g/dL','12.0-16.0','L'],['MCV','61.0','fL','80-100','L'],['WBC','6.5','10^3/uL','4.0-10.0',null],['PLT','620','10^3/uL','150-400','HH'],['Ferritin','4','ng/mL','>13',null]])}

console.log(fail?`\n${fail} 項失敗（共 ${n} 項）`:`\n全部通過（${n} 項）`);
process.exit(fail?1:0);
