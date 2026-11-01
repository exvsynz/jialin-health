/* D 階段：從截圖讀出的內容怎麼變成表單草稿（從 src/index.html 抽出 shot helpers 區塊執行，不複製程式碼）。合成資料。
   執行：node dev/shot-test.js（也會在 TZ=America/New_York 下再跑一次，確認跟執行環境的時區無關） */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const html=fs.readFileSync(process.env.SRC?path.resolve(process.env.SRC):path.join(__dirname,'../src/index.html'),'utf8');
const block=n=>{const m=html.match(new RegExp('\\/\\* ---- '+n+' helpers: begin[^*]*\\*\\/([\\s\\S]*?)\\/\\* ---- '+n+' helpers: end ---- \\*\\/'));if(!m){console.error('找不到 '+n+' helpers 區塊');process.exit(1)}return m[1]};
const H=new Function(block('shot')+';return{shotPrompt,parseShotDate,splitLabValue,unitSame,labField,classPreset,redact,parseShot,groupShot,dupOf,SHOT_LABS,SHOT_MAX,SHOT_PROMPT_VER}')();
const FX=require('./shot-fixtures.js');
let fail=0;
const eq=(name,got,want)=>{const ok=JSON.stringify(got)===JSON.stringify(want);if(!ok)fail++;console.log((ok?'  ok   ':'  FAIL ')+name+(ok?'':' → '+JSON.stringify(got)+'（應為 '+JSON.stringify(want)+'）'))};
console.log('TZ='+(process.env.TZ||'(預設)'));
/* 頁面 EXAMS 的單位與順序（和 src/index.html 相同；shot-page-test 會在頁面上再確認一次） */
const UNITS={TSH:'μIU/mL','Free T4':'ng/dL',T3:'ng/dL','Anti-TPO':'IU/mL','Anti-Tg':'IU/mL',Thyroglobulin:'ng/mL',E2:'pg/mL',P4:'ng/mL',FSH:'mIU/mL',LH:'mIU/mL',AMH:'ng/mL',PRL:'ng/mL',Testosterone:'ng/dL'};
const ORDER=['breast_us','breast_mammo','breast_ct','thy_us','thy_lab','lung_ldct','gyn_horm','gi_egd','gi_colo'];
const fromEx=html.match(/\{id:'thy_lab'[^\n]*labs:(\[[^\n]*?\]\])\}/),fromEx2=html.match(/\{id:'gyn_horm'[^\n]*labs:(\[[^\n]*?\]\])\}/);
eq('測試用的單位表和頁面 EXAMS 一致',Object.fromEntries([...eval(fromEx[1]),...eval(fromEx2[1])]),UNITS);
eq('對應表的欄位和頁面 EXAMS 的 labs 名稱一致',Object.keys(H.SHOT_LABS).sort(),Object.keys(UNITS).sort());

/* 3.1 日期 */
eq('民國：各種分隔、全形、年月日、7 碼',['115/10/20','115-10-20','115.10.20','１１５／１０／２０','115年10月20日','115 年 1 月 2 日','1151020','99/1/5'].map(H.parseShotDate),
  ['2026-10-20','2026-10-20','2026-10-20','2026-10-20','2026-10-20','2026-01-02','2026-10-20','2010-01-05']);
eq('西元：各種分隔、8 碼、後面帶時間',['2026/10/20','2026-10-20','20261020','2026/10/20 08:30'].map(H.parseShotDate),['2026-10-20','2026-10-20','2026-10-20','2026-10-20']);
eq('不合法的日期回 null',['115/02/30','2026/13/01','2026/00/10','','abc',null,'12345','1/2/3'].map(H.parseShotDate),[null,null,null,null,null,null,null,null]);
eq('閏年 2 月 29 日',[H.parseShotDate('113/02/29'),H.parseShotDate('114/02/29')],['2024-02-29',null]);

/* 3.2 數值與旗標 */
const sv=(r,f)=>{const x=H.splitLabValue(r,f);return[x.value,x.flag]};
eq('規格 3.2 的表格',[sv('H 5.2'),sv('5.2 H'),sv('<0.01'),sv('＜0.01 L'),sv('1,234'),sv('陰性'),sv('5.2↑')],
  [['5.2','H'],['5.2','H'],['<0.01',null],['<0.01','L'],['1234',null],['陰性',null],['5.2','H']]);
eq('兩個旗標不一致時 flag 是 null；一致時保留',[sv('H 5.2 L'),sv('5.2','L'),sv('H 5.2','H'),sv('H 5.2','L')],[['5.2',null],['5.2','L'],['5.2','H'],['5.2',null]]);
eq('>=、≥、(H)、[L]、HH、*、↓、小寫 h',[sv('>=1000'),sv('≥ 3'),sv('(H) 6.0'),sv('0.1 [L]'),sv('HH 99'),sv('* 4.1'),sv('2.0↓'),sv('h 5.2')],
  [['>=1000',null],['≥3',null],['6.0','H'],['0.1','L'],['99','HH'],['4.1','*'],['2.0','L'],['5.2','H']]);
eq('不是數字的整段保留：待報、1:80、見報告、空字串',[sv('待報'),sv('1:80'),sv('見報告'),sv(''),sv('Negative','A')],[['待報',null],['1:80',null],['見報告',null],['',null],['Negative','A']]);

/* 3.3 單位 */
eq('相同單位的不同寫法',[H.unitSame('μIU/mL','mIU/L'),H.unitSame('uIU/ml','µIU/mL'),H.unitSame('mIU/mL','IU/L'),H.unitSame('ng/mL','μg/L'),H.unitSame('pg/mL','ng/L'),H.unitSame('IU/mL','kIU/L'),H.unitSame('NG/DL','ng / dL')],[true,true,true,true,true,true,true]);
eq('真的不同',[H.unitSame('pmol/L','ng/dL'),H.unitSame('ng/mL','ng/dL'),H.unitSame('mIU/mL','μIU/mL'),H.unitSame('pg/mL','pmol/L')],[false,false,false,false]);

/* 3.4 名稱 */
const al=Object.entries(H.SHOT_LABS).flatMap(([f,[,a]])=>a.map(x=>[x,f]));
eq('對應表每一種寫法都對得到自己的欄位（'+al.length+' 種）',al.filter(([a,f])=>H.labField(a)!==f),[]);
eq('正規化：大小寫、空白、-、括號、全形',[H.labField('free t4'),H.labField('F T 4'),H.labField('ＦＴ４'),H.labField('Anti TPO'),H.labField('(TSH)'),H.labField('anti-mullerian hormone')],['Free T4','Free T4','Free T4','Anti-TPO','TSH','AMH']);
eq('故意不對應：FT3、Free T3、Free testosterone、Anti-microsomal、LDL',[H.labField('FT3'),H.labField('Free T3'),H.labField('Free testosterone'),H.labField('Anti-microsomal antibody'),H.labField('LDL-C')],[null,null,null,null,null]);
eq('有檢驗名稱時只看名稱；沒有名稱才看醫令名稱',[H.labField('FT3','甲狀腺刺激素'),H.labField(null,'甲狀腺刺激素'),H.labField('','游離甲狀腺素'),H.labField(null,'甲狀腺功能檢查')],[null,'TSH','Free T4',null]);

/* 3.6 分類 */
const cp=(e,c,t)=>H.classPreset(e,c,t).preset;
eq('BI-RADS 1–5 與 0 對到既有分類',['1','2','3','0','4','4A','4b','4C','5'].map(n=>cp('breast_us','BI-RADS '+n)),['b12','b12','b3','b0','b45','b45','b45','b45','b45']);
eq('BI-RADS 的寫法：category、冒號、BIRADS、乳房 X 光與電腦斷層',[cp('breast_mammo','BIRADS: 3'),cp('breast_ct',null,'Final assessment BI-RADS category 2, benign'),cp('breast_us','BI-RADS 5th edition')],['b3','b12',null]);
eq('BI-RADS 6 不建議並提示',H.classPreset('breast_us','BI-RADS 6').hint,'BI-RADS 6 沒有對應的分類，請自己選');
eq('兩個不同分類不建議並提示',[cp('breast_mammo','R: BI-RADS 2; L: BI-RADS 3'),H.classPreset('breast_mammo','R: BI-RADS 2; L: BI-RADS 3').hint],[null,'截圖裡有不只一個分類（2、3），請自己選']);
eq('兩個分類對到同一個既有分類時照建議（1 與 2）',cp('breast_us','R: BI-RADS 1, L: BI-RADS 2'),'b12');
eq('Lung-RADS 0–4X',['0','1','2','3','4A','4B','4X','4'].map(n=>cp('lung_ldct','Lung-RADS '+n)),['l0','l12','l12','l3','l4a','l4b','l4b',null]);
eq('Lung-RADS 的版本號不是分類；2S 照 2',[cp('lung_ldct','Lung-RADS v2022 category 2S'),cp('lung_ldct','Lung-RADS 2022: 3'),cp('lung_ldct','LungRADS v1.1 category 4A')],['l12','l3','l4a']);
eq('甲狀腺：寫了 ATA 才建議',[cp('thy_us','ATA high suspicion'),cp('thy_us',null,'Pattern: ATA intermediate suspicion'),cp('thy_us','ATA low suspicion'),cp('thy_us','依 ATA 分類為高度懷疑'),cp('thy_us','高度懷疑'),cp('thy_us','ACR TI-RADS 4')],['high','lowint','lowint','high',null,null]);
eq('甲狀腺：極低懷疑、benign 不建議並提示',[cp('thy_us','ATA very low suspicion'),H.classPreset('thy_us','ATA very low suspicion').hint,cp('thy_us','ATA benign')],[null,'這個分類還要看結節大小或穿刺結果，請自己選',null]);
eq('甲狀腺：同一份有高度與低度兩個結節不建議',cp('thy_us',null,'Nodule 1: ATA high suspicion.\nNodule 2: ATA low suspicion.'),null);
eq('大腸鏡、胃鏡、抽血一律不建議',[cp('gi_colo','No polyp'),cp('gi_egd','BI-RADS 2'),cp('thy_lab','BI-RADS 2')],[null,null,null]);
eq('建議時附上截圖的原文',H.classPreset('breast_us',null,'Right breast. BI-RADS category 3.').text,'BI-RADS category 3');

/* 3.8 個資 */
eq('身分證號、居留證號、遮罩寫法改成〔已移除〕',H.redact('ID A123456789 / A12****789 / B8XXXXXXXX / C912345678'),'ID 〔已移除〕 / 〔已移除〕 / 〔已移除〕 / 〔已移除〕');
eq('不誤傷一般數字、日期、檢驗名稱',H.redact('TSH 5.2 2026/10/20 A1234 Lung-RADS 2 H123 0912345678'),'TSH 5.2 2026/10/20 A1234 Lung-RADS 2 H123 0912345678');

/* 4.4 解析 */
const ps=x=>H.parseShot(typeof x==='string'?x:x.text,typeof x==='string'?false:x.truncated);
eq('整段 JSON、code fence、前後各一句話',[ps('{"items":[]}').ok,ps('```json\n{"items":[]}\n```').ok,ps('結果如下：{"items":[]} 以上').ok],[true,true,true]);
eq('truncated、不是 JSON、items 不是陣列、超過 200 項',[ps(FX.truncated).err,ps(FX.bad).err,ps('{"items":{}}').err,ps(JSON.stringify({items:Array(201).fill({type:'lab',name:'TSH'})})).err],['too_long','invalid','invalid','invalid']);
const pp=ps(FX.partial);
eq('單項不合規的略過並計數',[pp.ok,pp.items.length,pp.skipped],[true,1,2]);
eq('報告的 exam 不在 7 個代號裡時當作 null；抽血代號也不行',[ps('{"items":[{"type":"report","exam":"thy_lab","text":"x"}]}').items[0].exam,ps('{"items":[{"type":"report","exam":"x","text":"x"}]}').items[0].exam],[null,null]);
eq('讀出的文字先去掉個資',ps(FX.pii).items[0].text,'ID 〔已移除〕 / 〔已移除〕. Benign cyst. BI-RADS 2.');
eq('提示詞：張數、規則、沒有任何紀錄資料',[H.shotPrompt(2).includes('你會看到 2 張截圖'),H.shotPrompt(1).includes('不要自己判斷報告分類'),H.shotPrompt(1).includes('不要抄錄姓名'),/\d+\.\d+ kg|家琳/.test(H.shotPrompt(1))],[true,true,true,false]);

/* 3.7 分組 */
const G=k=>H.groupShot(ps(FX[k]).items,{units:UNITS,order:ORDER});
const s1=G('single');
eq('single：一筆甲狀腺抽血、民國日期、H 拆出、原文與參考範圍保留',[s1.length,s1[0].exam,s1[0].date,s1[0].place,s1[0].labs.TSH.value,s1[0].labs.TSH.flag,s1[0].labs.TSH.raw,s1[0].labs.TSH.ref,s1[0].labs['Free T4'].value],
  [1,'thy_lab','2026-10-20','測試醫院','5.2','H','H 5.2','0.27-4.20','1.10']);
const m1=G('multi');
eq('multi：拆成甲狀腺與生殖軸兩筆，甲狀腺在前；重疊的 TSH 只留一個',[m1.map(d=>d.exam),Object.keys(m1[0].labs),Object.keys(m1[1].labs),m1[1].labs.LH.flag,m1[0].report],[['thy_lab','gyn_horm'],['TSH','Free T4'],['E2','FSH','LH'],'L','']);
const u1=G('unmapped');
eq('unmapped：同一天的併入第一筆報告內容；另一天只有對不到的自成一筆、項目待選',[u1.length,u1[0].exam,u1[0].report,u1[1].exam,u1[1].labOnly,u1[1].report],
  [2,'thy_lab','其他檢驗（沒有對應的欄位）：\nFT3 3.1 pg/mL（參考值 2.0-4.4）\nFree testosterone 0.9 pg/mL',null,true,'其他檢驗（沒有對應的欄位）：\nLDL-C H 135 mg/dL（參考值 <130）']);
const n1=G('unit');
eq('unit：mIU/L 不標；pmol/L、ng/mL 加上單位並標 diff；沒有單位標 none',[n1[0].labs.TSH.value,n1[0].labs.TSH.unitNote,n1[0].labs['Free T4'].value,n1[0].labs['Free T4'].unitNote,n1[1].labs.Testosterone.value,n1[1].labs.Testosterone.unitNote,n1[1].labs.E2.unitNote],
  ['2.0',null,'15.4 pmol/L','diff','0.35 ng/mL','diff','none']);
const c1=G('unclear');
eq('unclear：值看不清楚時空著並標記；日期看不清楚；只有報告日期',[c1.find(d=>d.exam==='thy_lab').labs.TSH.unclear,c1.find(d=>d.exam==='thy_lab').labs.TSH.value,c1.find(d=>d.exam==='thy_lab').date,c1.find(d=>d.exam==='thy_lab').unclear,c1.find(d=>d.exam==='thy_us').date,c1.find(d=>d.exam==='thy_us').dateNote],
  [true,'',null,['date'],'2026-10-25','report']);
eq('unclear：沒有日期的排在最後',c1.map(d=>d.date),['2026-10-25',null]);
const f1=G('conflict');
eq('conflict：兩個不同的值不填，兩個都寫進報告內容；其他欄位照填',[f1[0].labs.TSH,f1[0].labs['Free T4'].value,f1[0].report],[undefined,'1.0','截圖裡 TSH 有不同的值：5.2、5.3']);
const r1=G('report');
eq('report：每份一筆、依日期新到舊、分類只在寫出時建議',[r1.map(d=>d.exam),r1.map(d=>d.cls.preset)],[['breast_us','lung_ldct','thy_us','gi_colo'],['b3','l12',null,null]]);
const rm=G('reportMulti');
eq('reportMulti：兩側不同與 BI-RADS 6 都不建議、各有提示',[rm.map(d=>d.cls.preset),rm.map(d=>!!d.cls.hint)],[[null,null],[true,true]]);
const long=H.groupShot([{type:'report',exam:'breast_us',date:'2026/10/01',text:'字'.repeat(5000),unclear:[]}],{units:UNITS,order:ORDER})[0];
eq('報告內容超過 4000 字截斷並標記',[long.report.length,long.reportCut],[4000,true]);
eq('重疊的同一份報告只留一份',H.groupShot([{type:'report',exam:'breast_us',date:'2026/10/01',text:'x',unclear:[]},{type:'report',exam:'breast_us',date:'2026/10/01',text:'x',unclear:[]}],{units:UNITS,order:ORDER}).length,1);
eq('不同醫院同一天分成兩筆',H.groupShot([{type:'lab',name:'TSH',value:'1',date:'2026/10/01',place:'甲',unclear:[]},{type:'lab',name:'TSH',value:'2',date:'2026/10/01',place:'乙',unclear:[]}],{units:UNITS,order:ORDER}).length,2);
eq('一個看不清楚、一個清楚：用清楚的',H.groupShot([{type:'lab',name:'TSH',value:null,date:'2026/10/01',unclear:['value']},{type:'lab',name:'TSH',value:'2',date:'2026/10/01',unclear:[]}],{units:UNITS,order:ORDER})[0].labs.TSH.value,'2');

/* 3.9 重複 */
const recs=[{id:'a',exam:'thy_lab',date:'2026-07-01'},{id:'b',exam:'breast_us',date:'2026-07-01'}];
eq('同日同項才算重複；排除自己；沒有日期或項目不算',[H.dupOf('thy_lab','2026-07-01',recs)?.id,H.dupOf('gyn_horm','2026-07-01',recs),H.dupOf('thy_lab','2026-07-02',recs),H.dupOf('thy_lab','2026-07-01',recs,'a'),H.dupOf(null,'2026-07-01',recs),H.dupOf('thy_lab',null,recs)],['a',null,null,null,null,null]);
eq('剛存、還沒有編號的草稿也算重複（沒有 skipId 時不排除）',H.dupOf('gyn_horm','2026-07-01',[{exam:'gyn_horm',date:'2026-07-01'}])?.exam,'gyn_horm');
eq('上限常數',[H.SHOT_MAX,H.SHOT_PROMPT_VER],[6,'d1']);

console.log(fail?`\n${fail} FAIL`:'\nall ok');
if(!process.env.TZ&&!fail){try{execFileSync(process.execPath,[__filename],{env:{...process.env,TZ:'America/New_York'},stdio:'inherit'})}catch(_){process.exit(1)}}
process.exit(fail?1:0);
