/* B 階段：頁面上的用藥功能（合成資料、假 window.claude）。各批逐步補上。
   執行：node dev/med-page-test.js        略過截圖：node dev/med-page-test.js --no-shots */
const fs=require('fs'),path=require('path');
const {open,close,sampleSeed,check,summary}=require('./harness');
const SHOTS=path.join(__dirname,'screenshots');
const T='2026-10-30',NOW=T+'T08:00:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const seed=(extra={})=>({...sampleSeed(T),...extra});
const md=(date,dose,o={})=>({kind:'dose',date,dose,tablet:'',brand:'',reason:'',note:'',createdAt:1,updatedAt:1,deleted:false,...o});
const txt=(page,s)=>page.evaluate(s=>{const e=document.querySelector(s);return e&&!e.hidden?e.textContent:null},s);

(async()=>{
  /* B1：劑量歷史載入完成才能記錄服藥 */
  {const {page,doc,errors}=await open({time:NOW,cfg:{latencyComp:true,seed:seed({'meddose/m1':md('2026-10-01',75)}),snapDelay:{meddose:1500}}});await wait(500);
    const before=await doc('days/'+T);
    await page.click('#medBtn',{force:true});await wait(200);
    check('劑量歷史還沒到：不能記錄服藥',!(await doc('days/'+T))?.med&&JSON.stringify(await doc('days/'+T))===JSON.stringify(before),await doc('days/'+T));
    await wait(1500);
    check('劑量歷史到了：服藥列顯示歷史劑量',(await txt(page,'#medBtn')).includes('75 mcg'),await txt(page,'#medBtn'));
    await page.click('#medBtn');await wait(300);const d=await doc('days/'+T);
    check('記錄服藥：寫入歷史劑量與來源',d.med.taken===true&&d.med.dose===75&&d.med.doseSrc==='history',d.med);
    check('記錄後顯示的劑量和寫入的一致',(await txt(page,'#medBtn')).includes('75 mcg'));
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}
  /* 沒有劑量紀錄：依設定推定 */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,seed:seed()}});await wait(500);
    check('沒有劑量紀錄：顯示設定的劑量',(await txt(page,'#medBtn')).includes('50 mcg'));
    await page.click('#medBtn');await wait(300);const d=await doc('days/'+T);
    check('沒有劑量紀錄：寫入設定劑量，來源 setting',d.med.dose===50&&d.med.doseSrc==='setting',d.med);
    await page.context().close()}
  /* 補登：用那一天的劑量 */
  {const back='2026-10-27';const s=seed({'meddose/m1':md('2026-10-28',75),'meddose/m0':md('2026-09-01',50)});delete s['days/'+back].med;
    const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,seed:s}});await wait(500);
    await page.click(`[data-day="${back}"]`);await wait(200);
    check('補登 10/27：服藥列顯示當天的 50 mcg（10/28 起才是 75）',(await txt(page,'#medBtn')).includes('50 mcg'),await txt(page,'#medBtn'));
    await page.click('#medBtn');await wait(300);
    check('補登 10/27：寫入 50 mcg',(await doc('days/'+back)).med.dose===50,(await doc('days/'+back)).med);
    await page.click('#goToday');await wait(200);
    check('回到今天：顯示 75 mcg',(await txt(page,'#medBtn')).includes('75 mcg'));
    await page.context().close()}
  /* 只有細節、沒有 taken 的服藥物件：不算服藥 */
  {const s=seed();s['days/'+T]={date:T,am:{w:52,bf:null,at:'07:00'},med:{interfere:{coffee:true}},updatedAt:1};
    const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:s}});await wait(500);
    check('只有細節的 med：標題仍是還差 1 項',(await page.textContent('#headline')).includes('還差 1 項'),await page.textContent('#headline'));
    check('只有細節的 med：服藥列是待辦',await page.evaluate(()=>document.querySelector('#medBtn').classList.contains('pend')));
    await page.context().close()}
  /* 劑量歷史監聽失敗：全頁顯示連線中斷 */
  {const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:seed(),failListen:['meddose']}});await wait(500);
    check('劑量歷史監聽失敗：顯示資料連線中斷',(await page.textContent('#dbNotice')).includes('資料連線中斷')&&await page.isVisible('#dbNotice'));
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
