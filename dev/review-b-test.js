/* B 階段 GPT 程式審查（docs/reviews/2026-10-30-phase-B-code-review-gpt.md）第 1–9 點的回歸測試。合成資料。
   每一點都先在修正前的程式上失敗，修正後通過。執行：node dev/review-b-test.js */
const {open,close,sampleSeed,check,summary}=require('./harness');
const T='2026-10-30',NOW=T+'T08:00:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const seed=(extra={})=>({...sampleSeed(T),...extra});
const md=(date,dose,o={})=>({kind:'dose',date,dose,tablet:'',brand:'',reason:'',note:'',createdAt:1,updatedAt:1,deleted:false,...o});
const txt=(page,s)=>page.evaluate(s=>{const e=document.querySelector(s);return e&&!e.hidden?e.textContent:null},s);

(async()=>{
  /* 第 1 點：編輯抽血保留表單沒有顯示的巢狀欄位 */
  {const s=seed();s['records/r3']={...s['records/r3'],labs:{TSH:'2.1','Free T4':'1.2',T3:'98',Custom:'x'},drawCtx:{biotin7d:'yes',labNote:'keep'}};
    const {page,doc}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:s}});await wait(500);
    await page.evaluate(()=>openRecord('thy_lab',records.find(r=>r.id==='r3')));await wait(200);
    await page.fill('[data-lab="TSH"]','3.4');await page.fill('[data-lab="T3"]','');await page.click('#btnSave');await wait(300);
    const r=await doc('records/r3');
    check('第 1 點：表單管理的檢驗值照改，清空的刪除',r.labs.TSH==='3.4'&&!('T3' in r.labs)&&r.labs['Free T4']==='1.2',r.labs);
    check('第 1 點：labs 裡表單沒有的 key 保留',r.labs.Custom==='x',r.labs);
    check('第 1 點：drawCtx 裡表單沒有的 key 保留',r.drawCtx?.labNote==='keep'&&r.drawCtx?.biotin7d==='yes',r.drawCtx);
    await page.context().close()}

  /* 第 7 點：切換檢查種類時清除抽血情境的暫存 */
  {const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:seed({'meddose/m2':md('2026-10-01',75)})}});await wait(500);
    await page.evaluate(()=>openRecord('thy_lab'));await wait(200);
    await page.click('[data-ctx="biotin7d"] [data-v="yes"]');await page.click('#fRecheck');
    await page.selectOption('#fExam','thy_us');await wait(100);await page.selectOption('#fExam','thy_lab');await wait(100);
    check('第 7 點：切走再切回，情境回到未填',await page.evaluate(()=>[...document.querySelectorAll('#ctxWrap [aria-pressed="true"]')].length)===0);
    check('第 7 點：切走再切回，複查切換鍵依日期重新預設（開）',await page.isChecked('#fRecheck'));
    await page.context().close()}

  /* 第 8 點：已有一次複查完成後，另一筆抽血仍可連到同一次變更 */
  {const s=seed({'meddose/m2':md('2026-10-01',75)});s['records/rc']={exam:'thy_lab',cat:'thyroid',date:'2026-10-20',preset:null,interval:6,nextDue:null,labs:{TSH:'2.0'},drawCtx:{recheckOf:'m2'},createdAt:5,updatedAt:5};
    const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:{...s,'settings/profile':{...s['settings/profile'],tshRecheckWeeks:4}}}});await wait(500);
    await page.evaluate(()=>openRecord('thy_lab'));await wait(200);
    check('第 8 點：複查已完成時，新抽血仍顯示切換鍵',await page.isVisible('#rcRow'),await txt(page,'#rcLabel'));
    await page.context().close()}

  /* 第 3 點：用藥頁不把「尚未載入」當成「沒有紀錄」；劑量監聽中斷後不能記錄服藥 */
  {const {page}=await open({time:NOW,hash:'meds',cfg:{latencyComp:true,seed:seed({'meddose/m2':md('2026-10-01',75)}),snapDelay:{meddose:1500}}});await wait(500);
    const now=await txt(page,'#medNow'),rc=await txt(page,'#rcState'),adh=await txt(page,'#medAdh'),tl=await txt(page,'#medTl');
    check('第 3 點：劑量歷史載入前，目前劑量不寫推定，寫載入中',now.includes('載入中')&&!now.includes('推定'),now);
    check('第 3 點：載入前，複查與時間軸不寫「還沒有…紀錄」',!rc.includes('還沒有')&&!tl.includes('還沒有'),{rc,tl});
    check('第 3 點：載入前，服藥紀錄不寫還沒有紀錄',!adh.includes('還沒有紀錄'),adh);
    check('第 3 點：載入前，新增變更停用',await page.isDisabled('#mdAdd'));
    await wait(1500);
    check('第 3 點：載入後，目前劑量 75 mcg',(await txt(page,'#medNow')).includes('75 mcg'));
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,seed:seed({'meddose/m2':md('2026-10-01',75)})}});await wait(500);
    await page.evaluate(()=>window.__mock.breakListener('meddose'));await wait(200);
    await page.evaluate(()=>document.querySelector('#medBtn').click());await wait(300);
    check('第 3 點：劑量監聽中斷後，不能記錄服藥',!(await doc('days/'+T))?.med?.taken,(await doc('days/'+T))?.med);
    check('第 3 點：監聽中斷時顯示連線中斷',(await txt(page,'#dbNotice'))?.includes('資料連線中斷'));
    await page.context().close()}

  /* 第 4 點：同一個未來日期有多筆變更時，預告用最後生效的那筆 */
  {const {page}=await open({time:NOW,hash:'meds',cfg:{latencyComp:true,seed:seed({'meddose/a':md('2026-11-15',50,{createdAt:1}),'meddose/b':md('2026-11-15',75,{createdAt:2})})}});await wait(500);
    check('第 4 點：預定 11/15 起 75 mcg（同日排最後的那筆）',(await txt(page,'#medNow')).includes('預定 11/15 起 75 mcg'),await txt(page,'#medNow'));
    await page.context().close()}

  /* 第 5 點：備份有 meddose 集合，但要覆蓋的紀錄缺新欄位時，也要警告 */
  {const s=seed();s['days/2026-10-29']={...s['days/2026-10-29'],med:{taken:true,at:'07:20',dose:50,mode:'bedtime',interfere:{coffee:true}}};
    const bk={app:'jialin-health',version:2,exportedAt:'2026-10-20T00:00:00Z',collections:{days:{'2026-10-29':{date:'2026-10-29',med:{taken:true,at:'07:20',dose:50}}},meddose:{}}};
    const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:s}});await wait(500);
    await page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bk))});await wait(300);
    check('第 5 點：要覆蓋的紀錄缺服藥細節，預覽警告會被取代',(await txt(page,'#impPreview')).includes('會被備份內容取代'),await txt(page,'#impPreview'));
    await page.context().close()}

  /* 第 6 點：正在改摘要期間時，遠端重繪不把日期改回預設 */
  {const {page}=await open({time:NOW,hash:'summary',cfg:{latencyComp:true,seed:seed()}});await wait(500);
    await page.evaluate(()=>{const i=document.querySelector('#smFrom');i.value='2026-09-01';i.dispatchEvent(new Event('input',{bubbles:true}))});
    await page.evaluate(()=>window.__mock.externalSet('days/2026-10-29',{...window.__mock.store.get('days/2026-10-29'),period:true}));await wait(300);
    check('第 6 點：輸入中的開始日不被重繪蓋掉',(await page.inputValue('#smFrom'))==='2026-09-01',await page.inputValue('#smFrom'));
    await page.context().close()}

  /* 第 9 點：取得下載能力失敗要提示；等待期間改日期，下載仍是按下時的期間 */
  {const {page,errors}=await open({time:NOW,hash:'summary',cfg:{latencyComp:true,seed:seed(),downloadsReject:'unavailable'}});await wait(500);
    await page.click('#smMd');await wait(300);
    check('第 9 點：取得下載能力失敗：顯示提示',await page.isVisible('#toast')&&(await page.textContent('#toastText')).includes('下載'),await page.textContent('#toastText'));
    check('第 9 點：沒有未處理的錯誤',!errors.length,errors);
    await page.context().close()}
  {const {page}=await open({time:NOW,hash:'summary',cfg:{latencyComp:true,seed:seed(),downloadsDelay:600}});await wait(500);
    await page.click('#smMd');await page.fill('#smTo','2026-10-15');await page.dispatchEvent('#smTo','change');await wait(900);
    const dl=await page.evaluate(()=>window.__lastDownload);
    check('第 9 點：等待期間改了結束日，檔名仍是按下時的期間',dl?.filename==='家琳回診摘要-20260802-20261030.md',dl?.filename);
    check('第 9 點：內容也是按下時的期間',dl?.data.startsWith('# 家琳回診摘要 2026/08/02–2026/10/30'),dl?.data.slice(0,40));
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
