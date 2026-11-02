/* D 階段：從截圖填入檢查紀錄的頁面行為（Playwright + mock）。截圖是測試裡用 canvas 畫的合成圖，mock 的回覆是 dev/shot-fixtures.js 的假資料。
   執行：node dev/shot-page-test.js        略過截圖：node dev/shot-page-test.js --no-shots */
const fs=require('fs'),path=require('path');
const {open,close,sampleSeed,check,summary}=require('./harness');
const {scan}=require('./a11y');
const SHOTS=path.join(__dirname,'screenshots'),NOSHOTS=process.argv.includes('--no-shots');
const T='2026-10-30',NOW='2026-10-30T12:40:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SEEDREC=['records/r1','records/r2','records/r3'];
async function until(page,fn,ms=4000,arg){const t=Date.now();for(;;){const v=await page.evaluate(fn,arg).catch(()=>null);if(v)return v;if(Date.now()-t>ms)return v;await wait(40)}}
/* 合成截圖：白底黑字的 PNG；noise:true 時是不好壓縮的雜訊圖 */
async function shotFile(page,{w=600,h=1300,type='image/png',noise=false,name='s.png'}={}){
  const b64=await page.evaluate(([w,h,type,noise])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);
    if(noise){const d=x.createImageData(w,h);for(let i=0;i<d.data.length;i+=4){const v=(Math.random()*255)|0;d.data[i]=v;d.data[i+1]=(v*7)&255;d.data[i+2]=(v*13)&255;d.data[i+3]=255}x.putImageData(d,0,0)}
    x.fillStyle='#000';x.font='28px sans-serif';x.fillText('TSH 0.00 測試',40,80);return c.toDataURL(type,0.92).split(',')[1]},[w,h,type,noise]);
  return{name,mimeType:type,buffer:Buffer.from(b64,'base64')}}
async function start(cfg={},o={}){const r=await open({time:NOW,hash:'exams',...o,cfg:{latencyComp:true,seed:sampleSeed(T),...cfg}});await wait(600);return r}
const addRec=page=>page.click('#btnAdd');
async function pick(page,files){const [fc]=await Promise.all([page.waitForEvent('filechooser',{timeout:3000}),page.click('#shotBox label')]);await fc.setFiles(files)}
const drafted=page=>until(page,()=>!document.querySelector('#shotBar').hidden);
const boxText=page=>page.evaluate(()=>document.querySelector('#shotBox').hidden?null:document.querySelector('#shotBox').textContent);
const form=page=>page.evaluate(()=>({bar:document.querySelector('#shotBar').hidden?null:document.querySelector('#shotBar').textContent,exam:document.querySelector('#fExam').value,date:document.querySelector('#fDate').value,
  place:document.querySelector('#fPlace').value,report:document.querySelector('#fReport').value,preset:document.querySelector('#fPreset').value,interval:document.querySelector('#fInterval').value,
  labs:Object.fromEntries([...document.querySelectorAll('[data-lab]')].map(i=>[i.dataset.lab,i.value])),
  notes:[...document.querySelectorAll('#recForm .shotnote:not([hidden])')].map(n=>n.textContent),warn:[...document.querySelectorAll('#recForm .field.shotwarn')].map(f=>f.querySelector('label')?.textContent||'').map(t=>t.replace('截圖','').trim()),
  tags:document.querySelectorAll('#recForm .shottag').length,save:document.querySelector('#btnSave').textContent,saveOff:document.querySelector('#btnSave').disabled,
  preview:document.querySelector('#duePreview').textContent,dup:document.querySelector('#dupNote').hidden?null:document.querySelector('#dupNote').textContent,
  examNote:document.querySelector('#shotExamNote').hidden?null:document.querySelector('#shotExamNote').textContent,cls:document.querySelector('#presetField .shotcls')?.textContent||null,open:document.querySelector('#dlgRec').open}));
const labNotes=(page,k)=>page.evaluate(k=>[...document.querySelector(`[data-lab="${k}"]`).closest('.field').querySelectorAll('.shotnote')].map(n=>n.textContent),k);
const newRecs=page=>page.evaluate(seed=>[...__mock.store.entries()].filter(([k])=>k.startsWith('records/')&&!seed.includes(k)).map(([k,v])=>({id:k.slice(8),...v})).sort((a,b)=>a.date<b.date?1:-1),SEEDREC);
const toastText=page=>page.textContent('#toastText').catch(()=>'');
const calls=page=>page.evaluate(()=>__mock.sampleCalls.map(c=>({input:c.input,n:c.images.length,types:c.images.map(i=>i.type),sizes:c.images.map(i=>i.size),tier:c.opts.modelTier,cache:c.opts.cache,upstream:c.upstream})));

(async()=>{
  /* ---- 能力 ---- */
  for(const [name,sample] of [['use("sample") 是 null',{absent:true}],['沒有 images',{images:null}],['limits() reject',{limitsReject:true}],['mediaTypes 沒有 JPEG',{images:{mediaTypes:['image/png']}}]]){
    const {page}=await start({sample});await addRec(page);await wait(100);
    check('能力：'+name+' → 新增檢查紀錄沒有「從截圖填入」',(await boxText(page))===null);await page.context().close()}
  {const {page,errors}=await start({sample:{shot:'single'}});await addRec(page);await wait(100);
    const t=await boxText(page);check('能力：可以讀圖時，新增面板最上方有「從截圖填入」與隱私說明',t&&t.includes('從截圖填入')&&t.includes('截圖會送給 Claude 讀取；有姓名或身分證號，可以先在相簿裁切。'),t);
    const acc=await page.evaluate(()=>{const i=document.querySelector('[data-shotfile]');return{accept:i.accept,multiple:i.multiple,capture:i.hasAttribute('capture')}});
    check('能力：選檔是相簿（accept image/*、可多選、不帶 capture）',acc.accept==='image/*'&&acc.multiple&&!acc.capture,acc);
    await page.click('#dlgRec [data-close]');await page.evaluate(()=>{openHist.add('thy_lab');renderExams()});await wait(100);await page.click('[data-edit="r3"]');await wait(100);
    check('能力：編輯既有紀錄時不顯示',(await boxText(page))===null);
    check('能力：沒有 JS 錯誤',!errors.length,errors);await page.context().close()}
  {const {page}=await start({sample:{consent:'deny'}});await addRec(page);await pick(page,await shotFile(page));
    await until(page,()=>document.querySelector('#shotBox').textContent.includes('沒有允許'));
    const t=await boxText(page);await page.click('#dlgRec [data-close]');await page.evaluate(()=>go('today'));await wait(200);
    const meal=await page.evaluate(()=>document.querySelector('#mealSnap').closest('[hidden]')!==null||document.querySelector('#mealSnap').hidden);
    await page.evaluate(()=>go('exams'));await wait(100);await addRec(page);await wait(100);
    check('能力：拒絕同意 → 顯示「沒有允許使用 Claude，請手動填寫」、沒有重選；「拍一餐」也隱藏；之後不再顯示入口',t.includes('沒有允許使用 Claude，請手動填寫')&&!t.includes('重新選')&&meal&&(await boxText(page))===null,{t,meal});
    await page.context().close()}

  /* ---- 呼叫內容 ---- */
  {const {page}=await start({sample:{shot:'single'}});await addRec(page);const f=await shotFile(page);await pick(page,f);await drafted(page);
    const c=(await calls(page))[0];
    check('呼叫：1 張 PNG 原檔直接送（類型與大小不變）、modelTier default、第一次不帶 cache',c.n===1&&c.types[0]==='image/png'&&c.sizes[0]===f.buffer.length&&c.tier==='default'&&c.cache===undefined,c);
    check('呼叫：提示詞有張數與規則，沒有任何資料庫裡的資料',c.input.includes('你會看到 1 張截圖')&&c.input.includes('不要自己判斷報告分類')&&!/右葉|Levothyroxine|半顆|52\.|測試醫院/.test(c.input));
    await page.context().close()}
  {const {page}=await start({sample:{shot:'single',images:{mediaTypes:['image/jpeg']}}});await addRec(page);await pick(page,await shotFile(page,{w:1179,h:2556}));await drafted(page);
    const c=(await calls(page))[0];
    check('呼叫：這個檢視不收 PNG 時轉成 JPEG（約 1.2 百萬像素以內）',c.types[0]==='image/jpeg',c);
    const px=await page.evaluate(()=>__mock.sampleCalls[0].images[0]);check('呼叫：轉出的 JPEG 不超過 1.2 百萬像素',px.w*px.h<=1.2e6+2000&&px.w>0,px);
    await page.context().close()}
  {const {page}=await start({sample:{shot:'single',images:{maxInputBytes:250000}}});await addRec(page);const f=await shotFile(page,{w:500,h:500,noise:true});await pick(page,f);await drafted(page);
    const c=(await calls(page))[0];check('呼叫：原檔太大時轉成 JPEG 並在上限內',f.buffer.length>250000&&c?.types[0]==='image/jpeg'&&c.sizes[0]<=250000,{orig:f.buffer.length,c});
    await page.context().close()}
  {const {page}=await start({sample:{shot:'single'}});await addRec(page);const f=await shotFile(page);await pick(page,[1,2,3,4,5,6,7].map(i=>({...f,name:i+'.png'})));await wait(400);
    const t=await boxText(page);check('張數：選 7 張不呼叫，提示「一次最多 5 張」（mock 的 maxCount 是 5）',(await calls(page)).length===0&&t.includes('一次最多 5 張，請分次讀取')&&t.includes('重新選截圖'),t);
    await page.context().close()}
  {const {page}=await start({sample:{shot:'single',images:{maxCount:20}}});await addRec(page);const f=await shotFile(page);await pick(page,[1,2,3,4,5,6,7].map(i=>({...f,name:i+'.png'})));await wait(400);
    check('張數：maxCount 比 6 大時，上限是 6',(await calls(page)).length===0&&(await boxText(page)).includes('一次最多 6 張'));
    await pick(page,[1,2,3,4,5,6].map(i=>({...f,name:i+'.png'})));await drafted(page);check('張數：6 張可以讀',(await calls(page))[0].n===6);
    await page.context().close()}
  {const {page}=await start({sample:{shot:'single'}});await addRec(page);const bad={name:'x.png',mimeType:'image/heic',buffer:Buffer.from('not an image')};const f=await shotFile(page);
    await pick(page,[f,bad]);await wait(500);const t=await boxText(page);
    check('打不開的截圖：不呼叫，提示第幾張',(await calls(page)).length===0&&t.includes('第 2 張截圖打不開，請換一張'),t);await page.context().close()}
  {const {page}=await start({sample:{shot:'single',delay:800}});await addRec(page);await pick(page,await shotFile(page,{w:400,h:1600}));
    const t=await until(page,()=>document.querySelector('#shotBox').textContent.includes('截圖很長，字可能讀不清楚，建議分段截圖'),2000);
    await drafted(page);check('長截圖（1:4）照常讀；讀取中提示「截圖很長」',!!t&&(await calls(page)).length===1);
    await page.click('#dlgRec [data-close]');await addRec(page);await pick(page,await shotFile(page,{w:600,h:1300}));
    const t2=await until(page,()=>document.querySelector('#shotBox').textContent.includes('讀取 1 張'),2000);
    check('一般截圖（約 1:2.2）不提示「截圖很長」',!!t2&&!(await boxText(page)).includes('截圖很長'));await page.context().close()}

  /* ---- 讀取中、停止、關掉面板 ---- */
  {const {page}=await start({sample:{shot:'multi',delay:2500}});await addRec(page);await pick(page,await shotFile(page));
    await until(page,()=>document.querySelector('#shotBox').textContent.includes('讀取 1 張截圖中'));
    const t=await boxText(page);check('讀取中：顯示「讀取 1 張截圖中…」與「停止」',t.includes('讀取 1 張截圖中…')&&t.includes('停止'),t);
    await page.click('[data-shot="stop"]');await until(page,()=>document.querySelector('#shotBox').textContent.includes('已停止'));
    const t2=await boxText(page);check('停止：「已停止」＋「再讀一次」，沒有寫入資料庫',t2.includes('已停止')&&t2.includes('再讀一次')&&(await newRecs(page)).length===0,t2);
    await page.evaluate(()=>{__mock.cfg.sample.delay=0});await page.click('[data-shot="retry"]');await drafted(page);
    const cs=await calls(page);check('再讀一次：帶 cache:false、同樣的圖',cs.length===2&&cs[1].cache===false&&cs[1].sizes[0]===cs[0].sizes[0],cs.map(c=>c.cache));
    await page.context().close()}
  {const {page}=await start({sample:{shot:'multi',consent:{wait:3000}}});await addRec(page);await pick(page,await shotFile(page));await wait(300);
    await page.click('[data-shot="stop"]');await until(page,()=>document.querySelector('#shotBox').textContent.includes('已停止'),1500);
    check('等待同意時停止：馬上「已停止」，沒有到上游',(await boxText(page)).includes('已停止')&&!(await calls(page))[0].upstream);await page.context().close()}
  {const {page}=await start({sample:{shot:'multi',delay:1200}});await addRec(page);await pick(page,await shotFile(page));await wait(200);
    await page.click('#dlgRec [data-close]');await until(page,()=>document.querySelector('#toastText').textContent.includes('截圖讀好了'),4000);
    const tt=await toastText(page);check('讀取中關掉面板：讀取不中止，讀完 toast「截圖讀好了，2 筆待確認」',tt.includes('截圖讀好了，2 筆待確認'),tt);
    await addRec(page);await wait(100);const t=await boxText(page);check('重開面板：「截圖讀出的紀錄還有 2 筆沒確認」＋繼續＋丟棄',t.includes('截圖讀出的紀錄還有 2 筆沒確認')&&t.includes('繼續')&&t.includes('丟棄'),t);
    await page.click('[data-shot="drop"]');await wait(100);const t3=await boxText(page);
    check('丟棄：草稿清掉，toast 有撤銷',!t3.includes('沒確認')&&(await toastText(page)).includes('已丟棄 2 筆'),t3);
    await page.click('#toastActs button');await wait(100);check('丟棄後撤銷：草稿回來',(await boxText(page)).includes('還有 2 筆沒確認'));
    await page.click('[data-shot="go"]');await wait(100);const f=await form(page);check('繼續：載入第 1 筆，草稿列 1/2',f.bar.startsWith('截圖 1/2・甲狀腺抽血'),f.bar);
    await page.context().close()}
  {const {page}=await start({sample:{shot:'multi',delay:800}});await addRec(page);await pick(page,await shotFile(page));await wait(100);
    await page.fill('#fNote','手動打的備註');await until(page,()=>document.querySelector('#shotBox').textContent.includes('讀出'),3000);
    const t=await boxText(page),f=await form(page);
    check('手動填了一半時讀完：不蓋掉，顯示「讀出 2 筆」＋「開始確認」',t.includes('讀出 2 筆')&&t.includes('開始確認')&&f.bar===null&&(await page.inputValue('#fNote'))==='手動打的備註',t);
    await page.click('[data-shot="go"]');await wait(100);check('開始確認：載入第 1 筆',(await form(page)).bar.startsWith('截圖 1/2'));await page.context().close()}

  /* ---- 情境 ---- */
  {const {page,errors}=await start({sample:{shot:'single'}});let clicks=0;await addRec(page);clicks++;await pick(page,await shotFile(page));clicks++;await drafted(page);
    const f=await form(page);
    check('single：填入項目、日期（民國轉西元）、醫院、數值；草稿列 1/1',f.exam==='thy_lab'&&f.date==='2026-10-20'&&f.place==='測試醫院'&&f.labs.TSH==='5.2'&&f.labs['Free T4']==='1.10'&&f.bar.startsWith('截圖 1/1・甲狀腺抽血・10/20'),f);
    check('single：填入的欄位有「截圖」小標；參考範圍、旗標、原文在欄位下方',f.tags>=5&&(await labNotes(page,'TSH')).includes('參考 0.27-4.20・H・原文 H 5.2'),{tags:f.tags,n:await labNotes(page,'TSH')});
    check('single：沒有提醒樣式、沒有重複提示、可以直接存',!f.warn.length&&!f.dup&&!f.saveOff&&f.save==='儲存',f);
    await page.click('#btnSave');clicks++;await until(page,()=>!document.querySelector('#dlgRec').open);
    const r=(await newRecs(page))[0];
    check('single：頁面上 3 次點擊（新增、從截圖填入、儲存）就存好，面板關閉',clicks===3&&!(await form(page)).open&&!!r,clicks);
    check('single：labs 存 5.2、labMeta 存原文 H 5.2 與旗標 H、shot 有張數與版本',r.labs.TSH==='5.2'&&r.labMeta.TSH.raw==='H 5.2'&&r.labMeta.TSH.flag==='H'&&r.labMeta.TSH.ref==='0.27-4.20'&&r.labMeta.TSH.unit==='μIU/mL'&&r.shot.n===1&&r.shot.promptVer==='d2'&&r.shot.tier==='default'&&r.interval===6,r);
    await page.evaluate(()=>{openHist.add('thy_lab');renderExams()});await wait(100);
    const cell=await page.evaluate(()=>[...document.querySelectorAll('.labtable td')].map(t=>t.textContent));
    check('歷史表格：數值後面加旗標（5.2 H），手動輸入的照舊',cell.includes('5.2 H')&&cell.includes('2.1'),cell);
    /* 編輯：改過的檢驗刪掉 labMeta，沒改的保留；編輯畫面顯示參考範圍 */
    await page.click(`[data-edit="${r.id}"]`);await wait(100);
    check('編輯：欄位下方顯示參考範圍與旗標',(await labNotes(page,'TSH')).includes('參考 0.27-4.20・H・原文 H 5.2')&&(await boxText(page))===null);
    await page.fill('[data-lab="TSH"]','5.0');await page.click('#btnSave');await until(page,()=>!document.querySelector('#dlgRec').open);
    const r2=await page.evaluate(id=>__mock.store.get('records/'+id),r.id);
    check('編輯：改過的 TSH 刪掉 labMeta，沒改的 Free T4 保留；shot 保留',!r2.labMeta.TSH&&r2.labMeta['Free T4']?.raw==='1.10'&&r2.shot?.n===1&&r2.labs.TSH==='5.0',r2.labMeta);
    check('匯入檢查：備份裡沒有 labMeta／shot 的紀錄算進「會被取代」',await page.evaluate(id=>{const b={...__mock.store.get('records/'+id)};delete b.labMeta;delete b.shot;return importLoses({records:{[id]:b}})===1&&importLoses({records:{[id]:__mock.store.get('records/'+id)}})===0},r.id));
    check('single：沒有 JS 錯誤',!errors.length,errors);await page.context().close()}
  {const {page}=await start({sample:{shot:'multi'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    const f1=await form(page);check('multi：第 1 筆甲狀腺（重疊的 TSH 只一個）',f1.bar.startsWith('截圖 1/2・甲狀腺抽血')&&f1.labs.TSH==='2.30'&&f1.labs['Free T4']==='1.25',f1);
    await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 2/2'));
    const f2=await form(page);check('multi：存好後 toast「已儲存 1/2」，自動載入第 2 筆生殖軸',(await toastText(page)).includes('已儲存 1/2')&&f2.exam==='gyn_horm'&&f2.labs.E2==='85.2'&&f2.labs.LH==='1.2',f2);
    await page.click('#btnSave');await until(page,()=>!document.querySelector('#dlgRec').open);
    const rs=await newRecs(page);check('multi：存成兩筆、最後 toast「已儲存 2 筆」、面板關閉',rs.length===2&&rs.map(r=>r.exam).sort().join()==='gyn_horm,thy_lab'&&(await toastText(page)).includes('已儲存 2 筆'),rs.map(r=>r.exam));
    await page.context().close()}
  {const {page}=await start({sample:{shot:'unmapped'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    const f1=await form(page);check('unmapped：對不到的 FT3、Free testosterone 寫進同一天的報告內容',f1.report==='其他檢驗（沒有對應的欄位）：\nFT3 3.1 pg/mL（參考值 2.0-4.4）\nFree testosterone 0.9 pg/mL'&&f1.labs.T3==='',f1.report);
    await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 2/2'));
    const f2=await form(page);check('unmapped：只有對不到的那天自成一筆，項目待選',f2.exam===''&&f2.bar.includes('檢查項目待選')&&f2.report.includes('LDL-C H 135 mg/dL（參考值 <130）'),f2);
    await page.click('#btnSave');await wait(150);check('unmapped：沒選項目不能存',(await toastText(page)).includes('請選擇檢查項目')&&(await newRecs(page)).length===1);
    await page.click('[data-shot="skip"]');await wait(150);
    check('略過：不存、面板關閉、toast「已略過」有撤銷',(await newRecs(page)).length===1&&!(await form(page)).open&&(await toastText(page)).includes('已略過'));
    await page.click('#toastActs button');await wait(150);const f3=await form(page);
    check('略過後撤銷：回到那一筆',f3.open&&f3.exam===''&&f3.report.includes('LDL-C'),f3);
    await page.selectOption('#fExam','gyn_horm');await wait(50);await page.click('#btnSave');await until(page,()=>!document.querySelector('#dlgRec').open);
    const rs=await newRecs(page);check('unmapped：選了項目就能存，報告內容保留',rs.length===2&&rs.some(r=>r.exam==='gyn_horm'&&r.report.includes('LDL-C')),rs.map(r=>r.exam));
    await page.context().close()}
  {const {page}=await start({sample:{shot:'unit'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    const f=await form(page);
    check('unit：pmol/L 照填並加上單位、標「未換算」；mIU/L 視為相同不標',f.labs['Free T4']==='15.4 pmol/L'&&(await labNotes(page,'Free T4')).includes('單位和表單（ng/dL）不同，未換算')&&f.labs.TSH==='2.0'&&!(await labNotes(page,'TSH')).some(t=>t.includes('單位')),{fl:f.labs,n:await labNotes(page,'TSH')});
    await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 2/2'));
    const f2=await form(page);check('unit：Testosterone ng/mL 加單位並標記；E2 沒有單位標「截圖沒有單位」',f2.labs.Testosterone==='0.35 ng/mL'&&(await labNotes(page,'Testosterone')).some(t=>t.includes('不同，未換算'))&&(await labNotes(page,'E2')).includes('截圖沒有單位'),f2.labs);
    await page.click('#btnSave');await until(page,()=>!document.querySelector('#dlgRec').open);
    const r=(await newRecs(page)).find(x=>x.exam==='thy_lab');check('unit：存下的 labs 是「15.4 pmol/L」，labMeta.unit 是 pmol/L',r.labs['Free T4']==='15.4 pmol/L'&&r.labMeta['Free T4'].unit==='pmol/L',r.labs);
    await page.context().close()}
  {const {page}=await start({sample:{shot:'unclear'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    const f1=await form(page);check('unclear：只有報告日期的報告排在前面，日期帶報告日期並提示',f1.exam==='thy_us'&&f1.date==='2026-10-25'&&f1.notes.includes('截圖只有報告日期，請確認檢查日期'),f1);
    await page.click('[data-shot="skip"]');await wait(150);const f2=await form(page);
    check('unclear：看不清楚的日期與數值空著、提醒樣式',f2.exam==='thy_lab'&&f2.date===''&&f2.labs.TSH===''&&f2.labs['Free T4']==='1.2'&&(await labNotes(page,'TSH')).includes('截圖看不清楚')&&f2.warn.some(t=>t.includes('檢查日期')),f2);
    await page.click('#btnSave');await wait(150);check('unclear：沒有日期不能存',(await toastText(page)).includes('請填檢查日期')&&(await newRecs(page)).length===0);
    await page.context().close()}
  {const {page}=await start({sample:{shot:'dup'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    const f=await form(page);check('dup：同一天已有甲狀腺抽血 → 提示可能重複並列出既有數值',f.dup==='這天已有一筆甲狀腺抽血（TSH 2.1・Free T4 1.2）。可能重複，仍要新增就按儲存。'&&!f.saveOff,f.dup);
    await page.fill('#fDate','2026-07-02');await wait(50);check('dup：改日期後提示消失',(await form(page)).dup===null);
    await page.fill('#fDate','2026-07-01');await page.click('#btnSave');await until(page,()=>!document.querySelector('#dlgRec').open);
    check('dup：不擋儲存',(await newRecs(page)).length===1);
    await addRec(page);await page.selectOption('#fExam','thy_lab');await page.fill('#fDate','2026-07-01');await wait(50);
    check('dup：手動新增時也提示',(await form(page)).dup?.startsWith('這天已有一筆甲狀腺抽血'));await page.context().close()}
  {const {page}=await start({sample:{shot:'report'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    const f1=await form(page);
    check('report：BI-RADS 3 預先選好、提醒樣式、「由截圖判讀，請確認」、儲存停用',f1.exam==='breast_us'&&f1.preset==='b3'&&f1.interval==='6'&&f1.cls.includes('由截圖判讀，請確認：截圖寫「BI-RADS 3」')&&f1.warn.includes('報告分類')&&f1.saveOff&&f1.save==='先確認報告分類'&&f1.preview.endsWith('（分類待確認）'),f1);
    await page.click('[data-shot="clsok"]');const f1b=await form(page);check('report：按「確認分類」後提醒拿掉、可以存',!f1b.saveOff&&f1b.save==='儲存'&&!f1b.cls&&!f1b.preview.includes('待確認'),f1b);
    await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 2/4'));
    const f2=await form(page);check('report：Lung-RADS 2S 建議 1–2，待確認',f2.exam==='lung_ldct'&&f2.preset==='l12'&&f2.saveOff,f2);
    await page.selectOption('#fPreset','l3');await wait(50);const f2b=await form(page);check('report：自己改選也算確認',!f2b.saveOff&&!f2b.cls&&f2b.interval==='6',f2b);
    await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 3/4'));
    const f3=await form(page);check('report：只寫 TI-RADS 的甲狀腺超音波不建議、不擋儲存',f3.exam==='thy_us'&&f3.preset===''&&!f3.saveOff&&!f3.cls,f3);
    await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 4/4'));
    const f4=await form(page);check('report：大腸鏡不建議分類，報告全文照填',f4.exam==='gi_colo'&&f4.preset===''&&!f4.saveOff&&f4.report.includes('Two small polyps'),f4);
    await page.click('[data-shot="skip"]');await wait(150);
    const rs=await newRecs(page);check('report：存下的分類是確認過的（b3、l3）、TI-RADS 那筆沒有分類',rs.find(r=>r.exam==='breast_us').preset==='b3'&&rs.find(r=>r.exam==='lung_ldct').preset==='l3'&&rs.find(r=>r.exam==='thy_us').preset===null&&rs.length===3,rs.map(r=>[r.exam,r.preset]));
    await page.context().close()}
  {const {page}=await start({sample:{shot:'report'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    await page.click('#dlgRec [data-close]');await wait(100);
    check('report：分類確認前關掉面板，什麼都不存',(await newRecs(page)).length===0);
    await addRec(page);await page.click('[data-shot="go"]');await wait(100);check('report：重開繼續時仍要確認',(await form(page)).saveOff);await page.context().close()}
  {const {page}=await start({sample:{shot:'reportMulti'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    const f1=await form(page);check('reportMulti：兩側分類不同 → 不建議、提示、不擋儲存',f1.preset===''&&f1.notes.includes('截圖裡有不只一個分類（2、3），請自己選')&&!f1.saveOff,f1.notes);
    await page.click('[data-shot="skip"]');await wait(150);const f2=await form(page);
    check('reportMulti：BI-RADS 6 不建議並提示',f2.preset===''&&f2.notes.includes('BI-RADS 6 沒有對應的分類，請自己選'),f2.notes);await page.context().close()}
  {const {page}=await start({sample:{shot:'pii'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    await page.click('[data-shot="clsok"]');await page.click('#btnSave');await until(page,()=>!document.querySelector('#dlgRec').open);
    const r=(await newRecs(page))[0];check('pii：存下的報告沒有身分證號（含遮罩寫法）',!/A123456789|A12\*\*\*\*789/.test(r.report)&&r.report.includes('〔已移除〕'),r.report);await page.context().close()}
  {const {page}=await start({sample:{shot:'conflict'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    const f=await form(page);check('conflict：兩個不同的值不填、提示、寫進報告內容；Free T4 照填',f.labs.TSH===''&&(await labNotes(page,'TSH')).includes('截圖裡有不同的值：5.2 μIU/mL、5.3 μIU/mL')&&f.report.includes('截圖裡 TSH 有不同的值：\nTSH 5.2 μIU/mL\nTSH 5.3 μIU/mL')&&f.labs['Free T4']==='1.0',f);
    await page.context().close()}
  {const {page,errors}=await start({sample:{shot:'xss'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);await wait(200);
    const f=await form(page);check('跳脫：讀出的 HTML 只當文字，不執行',await page.evaluate(()=>window.__xss===undefined)&&f.report.includes('<script>')&&!errors.length,errors);await page.context().close()}
  {const {page}=await start({sample:{shot:'multi'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    await page.selectOption('#fExam','gyn_horm');await wait(50);const f=await form(page);
    check('換項目：原本的 TSH、Free T4 提示會放進報告內容',f.examNote==='換成這個項目後，TSH、Free T4 會放進報告內容',f.examNote);
    await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 2/2'));
    const r=(await newRecs(page))[0];check('換項目：存檔時寫進報告內容，不會丟掉',r.exam==='gyn_horm'&&r.report.includes('截圖讀到的其他檢驗：\nTSH 2.30 uIU/mL（參考值 0.27-4.20）\nFree T4 1.25 ng/dL（參考值 0.93-1.70）')&&!r.labMeta,r.report);
    await page.context().close()}
  {const {page}=await start({sample:{shot:'multi'},failNext:{code:'unavailable',count:1}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    await page.click('#btnSave');await wait(400);const f=await form(page);
    check('存檔失敗：停在這一筆、草稿不丟',f.open&&f.bar.startsWith('截圖 1/2')&&f.labs.TSH==='2.30'&&(await newRecs(page)).length===0&&!f.saveOff,f);
    await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 2/2'));check('存檔失敗後再按儲存：存好並到下一筆',(await newRecs(page)).length===1);
    await page.context().close()}
  {const {page}=await start({sample:{shot:'partial'}});await addRec(page);await pick(page,await shotFile(page));await drafted(page);
    const f=await form(page);check('部分不合規：可用的照填，草稿列註明「有 2 項看不懂，已略過」',f.labs.TSH==='1.5'&&f.bar.includes('有 2 項看不懂，已略過'),f.bar);await page.context().close()}

  /* ---- 錯誤碼（19 種、頁面的 invalid／too_long、讀到 0 項、不認得的 code） ---- */
  const HIDE=['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed','images_unavailable'],BUG=['invalid_request','transform_error','prompt_too_large','queue_overflow','tools_unavailable'];
  const CASES=[...HIDE.map(c=>[c,{reply:{error:c}},c==='not_granted'?'沒有允許使用 Claude，請手動填寫':'這個檢視無法讀取截圖，請手動填寫','none']),
    ...BUG.map(c=>[c,{reply:{error:c}},'讀取沒有完成，請手動填寫','none']),
    ['rate_limited',{reply:{error:'rate_limited'}},'讀取次數太多，稍後再讀','retry'],['session_expired',{reply:{error:'session_expired'}},'請重新登入 claude.ai 後再讀','retry'],
    ['upstream_error',{reply:{error:'upstream_error'}},'讀取中斷','retry'],['cancelled（上游）',{reply:{error:'cancelled'}},'已停止','retry'],['不認得的 code',{reply:{error:'weird_code'}},'讀取中斷','retry'],
    ['invalid_json',{reply:{error:'invalid_json'}},'讀取結果看不懂','retry'],['頁面的 invalid（不是 JSON）',{shot:'bad'},'讀取結果看不懂','retry'],
    ['頁面的 too_long（truncated）',{shot:'truncated'},'截圖內容太多，請少選幾張分次讀取','pick'],
    ['empty_completion',{reply:{error:'empty_completion'}},'沒有讀到內容，可以換截圖再試，或手動填寫','pick'],['refused',{reply:{error:'refused',text:'部分'}},'這組截圖沒有讀取結果，可以換截圖再試，或手動填寫','pick'],
    ['image_rejected',{reply:{error:'image_rejected'}},'有截圖無法讀取（太大、格式不支援或張數太多），請換一張','pick'],['讀到 0 項',{shot:'empty'},'截圖裡沒有讀到檢查結果','pick']];
  for(const [name,sample,msg,act] of CASES){const {page,errors}=await start({sample});await addRec(page);await pick(page,await shotFile(page));
    await until(page,m=>document.querySelector('#shotBox').textContent.includes(m),3000,msg);await wait(300);
    const t=await boxText(page)||'',n=(await calls(page)).length,w=await page.evaluate(()=>__mock.writes.length);
    const ok=!errors.length&&t.includes(msg)&&n===1&&w===0&&(await form(page)).bar===null&&(act==='retry'?t.includes('再讀一次')&&t.includes('從截圖填入'):act==='pick'?t.includes('重新選截圖')&&!t.includes('再讀一次'):act==='pickOnly'?t.includes('從截圖填入')&&!t.includes('再讀一次'):!t.includes('從截圖填入')&&!t.includes('再讀一次'));
    check(`錯誤 ${name}：「${msg}」、${({retry:'再讀一次',pick:'重新選截圖',none:'隱藏入口'})[act]}；不寫資料庫、不自動重試`,ok,{t,n,w,errors});
    await page.context().close()}
  {const {page}=await start({sample:{reply:{error:'rate_limited'}}});await addRec(page);await pick(page,await shotFile(page));await until(page,()=>document.querySelector('#shotBox').textContent.includes('稍後再讀'));
    await page.click('#dlgRec [data-close]');await addRec(page);await wait(100);
    check('錯誤訊息只留到面板關閉',!(await boxText(page)).includes('稍後再讀'));await page.context().close()}
  {const {page}=await start({sample:{reply:{error:'upstream_error'},delay:800}});await addRec(page);await pick(page,await shotFile(page));await page.click('#dlgRec [data-close]');
    await until(page,()=>document.querySelector('#toastText').textContent.includes('讀取中斷'),3000);check('讀取中關掉面板後失敗：toast 告知',(await toastText(page)).includes('讀取中斷'));await page.context().close()}

  /* ---- 版面：380×820、380×667，淺色／深色 ---- */
  for(const [h,tag] of [[820,'380'],[667,'380x667']])for(const scheme of ['light','dark']){
    const states=[['entry',{shot:'single'},null],['reading',{shot:'single',delay:60000},'reading'],['draft',{shot:'unit'},'draft'],['class',{shot:'report'},'draft'],['error',{reply:{error:'image_rejected'}},'error']];
    for(const [st,sample,mode] of states){
      const {page}=await start({sample},{width:380,height:h,scheme});await addRec(page);await wait(100);
      if(mode){await pick(page,await shotFile(page));if(mode==='draft')await drafted(page);else await until(page,m=>m==='reading'?document.querySelector('#shotBox').textContent.includes('讀取 1 張'):document.querySelector('#shotBox').textContent.includes('請換一張'),3000,mode);await wait(150)}
      await wait(400);if(st==='class'&&h===820)await page.evaluate(()=>document.querySelector('#presetField').scrollIntoView({block:'center'}));
      const r=await page.evaluate(()=>({over:document.documentElement.scrollWidth-document.documentElement.clientWidth,dlgOver:(()=>{const b=document.querySelector('#recForm .dlg-body');return b.scrollWidth-b.clientWidth})()}));
      const a=await page.evaluate(`(${scan.toString()})()`);
      check(`版面 ${tag} ${scheme} ${st}：沒有水平捲動、觸控目標 ≥44、對比`,r.over<=0&&r.dlgOver<=0&&!a.small.length&&!a.low.length,{r,small:a.small.slice(0,6),low:a.low.slice(0,6)});
      if(!NOSHOTS){fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-shot-${st}.png`)})}
      if(st==='draft'&&h===820){await page.evaluate(()=>document.querySelector('#labWrap').scrollIntoView({block:'start'}));await wait(100);const a2=await page.evaluate(`(${scan.toString()})()`);
        check(`版面 ${tag} ${scheme} 檢驗欄位的提醒：觸控目標、對比`,!a2.small.length&&!a2.low.length,{small:a2.small.slice(0,6),low:a2.low.slice(0,6)});
        if(!NOSHOTS)await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-shot-labs.png`)})}
      await page.context().close()}}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
