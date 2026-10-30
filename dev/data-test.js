/* 資料寫入的情境測試。每個情境在「自寫立即可見」開與關兩種模式下各跑一次。
   執行：node dev/data-test.js */
const {open,close,check,summary}=require('./harness');
const T='2026-10-30', NOW=T+'T08:00:00+08:00';
const AM={w:52.3,bf:null,at:'07:00'};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tap=(page,sel)=>page.evaluate(s=>document.querySelector(s).click(),sel); // 不等待 enabled，模擬「打開就點」

(async()=>{
  for(const latencyComp of [true,false]){
    const L=latencyComp?'[自寫立即可見] ':'[寫入完成才可見] ';

    /* 1. 首筆快照前點擊：不可覆蓋當天已有的資料，劑量要用設定值 */
    {const {page,doc,errors}=await open({time:NOW,cfg:{latencyComp,firstSnapDelay:1200,latency:80,seed:{['days/'+T]:{date:T,am:AM},'settings/profile':{medDose:75}}}});
      await wait(300);await tap(page,'#medBtn');await tap(page,'#perBtn');await tap(page,'#pills [data-type="yoga"]');
      await wait(1600);
      let d=await doc('days/'+T);
      check(L+'載入前點擊不覆蓋早上體重',d&&d.am&&d.am.w===52.3,d);
      check(L+'載入前點擊不寫入任何東西',d&&!d.med&&!d.period,d);
      await page.click('#medBtn');await wait(400);d=await doc('days/'+T);
      check(L+'載入後服藥劑量用設定值 75',d&&d.med&&d.med.dose===75,d&&d.med);
      check(L+'載入後服藥仍保留早上體重',d&&d.am&&d.am.w===52.3,d);
      check(L+'沒有 JS 錯誤',!errors.length,errors);
      await page.context().close()}

    /* 2. 另一台裝置先建了當天文件（本機快照還沒收到） */
    {const {page,doc}=await open({time:NOW,cfg:{latencyComp,latency:60}});
      await wait(400);
      await page.evaluate(([p,b])=>window.__mock.silentSet(p,b),['days/'+T,{date:T,am:AM}]);
      await page.click('#medBtn');await wait(400);
      const d=await doc('days/'+T);
      check(L+'他機已建當天文件時，服藥不覆蓋早上體重',d&&d.am&&d.am.w===52.3&&d.med,d);
      await page.context().close()}

    /* 3. 文件已被刪除（本機快照還以為存在） */
    {const {page,doc,errors}=await open({time:NOW,cfg:{latencyComp,latency:60,seed:{['days/'+T]:{date:T,am:AM}}}});
      await wait(400);
      await page.evaluate(p=>window.__mock.silentDelete(p),'days/'+T);
      await page.click('#perBtn');await wait(500);
      const d=await doc('days/'+T);
      check(L+'文件已刪除時，月經仍能存',d&&d.period===true&&d.date===T,d);
      const t=await page.textContent('#toastText').catch(()=>'');
      check(L+'文件已刪除時不誤報「沒有寫入權限」',!/權限/.test(t||''),t);
      await page.context().close()}

    /* 4. 設定監聽失敗後匯出：不可洗掉設定 */
    {const prof={medName:'Levothyroxine',medDose:75,medNote:'半顆'};
      const {page,doc}=await open({time:NOW,cfg:{latencyComp,failListen:['settings/profile'],seed:{'settings/profile':prof}},hash:'setup'});
      await wait(400);await tap(page,'#btnExport');await wait(500);
      const p=await doc('settings/profile');
      check(L+'設定監聽失敗後匯出，藥名劑量仍在',p&&p.medDose===75&&p.medName==='Levothyroxine',p);
      const n=await page.evaluate(()=>{const e=document.querySelector('#dbNotice');return e&&!e.hidden&&getComputedStyle(e).display!=='none'?e.textContent:''});
      check(L+'設定監聽失敗時畫面有提示',!!n,n);
      await page.context().close()}

    /* 5. 暫時性錯誤重試一次；體重面板等寫入成功才關 */
    {const {page,doc}=await open({time:NOW,cfg:{latencyComp,latency:40,failNext:{code:'unavailable',count:1},seed:{['days/2026-10-29']:{date:'2026-10-29',am:AM}}}});
      await wait(400);await page.click('#medBtn');await wait(1500);
      let d=await doc('days/'+T);
      check(L+'unavailable 一次後重試成功',d&&d.med,d);
      await page.evaluate(()=>{window.__mock.cfg.denyWrites=true});
      await page.click('[data-wslot="am"]');await wait(300);await page.click('#wsSave');await wait(400);
      const openSheet=await page.evaluate(()=>document.querySelector('#wSheet').open);
      check(L+'寫入失敗時體重面板保持開啟',openSheet);
      await page.context().close()}

    /* 6. 只點體脂分頁不存體脂 */
    {const {page,doc}=await open({time:NOW,cfg:{latencyComp,seed:{['days/2026-10-29']:{date:'2026-10-29',am:{w:52.3,bf:24.1,at:'07:00'}}}}});
      await wait(400);await page.click('[data-wslot="am"]');await wait(300);
      await page.click('[data-wseg="bf"]');await wait(250);await page.click('[data-wseg="w"]');await wait(250);
      await page.click('#wsSave');await wait(500);
      const d=await doc('days/'+T);
      check(L+'切到體脂分頁沒調整就不存體脂',d&&d.am&&d.am.bf==null,d&&d.am);
      await page.context().close()}
  }

  /* 7. 首頁檢查卡：需盡快處理排第一、文字正確 */
  {const seed={'records/a':{exam:'thy_us',cat:'thyroid',date:'2025-04-01',preset:'lowint',interval:12,nextDue:null,createdAt:1},
               'records/b':{exam:'breast_us',cat:'breast',date:'2026-10-01',preset:'b45',interval:0,nextDue:null,createdAt:2}};
    const {page}=await open({time:NOW,cfg:{latencyComp:true,seed}});await wait(400);
    const t=await page.textContent('#examSlot');
    check('首頁檢查卡：需盡快處理排第一',/乳房超音波/.test(t)&&/需盡快處理/.test(t),t);
    check('首頁檢查卡：不出現「已逾期 1 天」',!/已逾期 1 天/.test(t),t);
    await page.context().close()}

  /* 8. 體重頁不顯示 -0.0 */
  {const seed={};for(let i=1;i<=14;i++){const k='2026-10-'+String(30-i).padStart(2,'0');seed['days/'+k]={date:k,am:{w:i<=7?52.31:52.33,bf:null,at:'07:00'}}}
    const {page}=await open({time:NOW,cfg:{latencyComp:true,seed},hash:'weight'});await wait(500);
    const t=await page.textContent('#wStats');
    check('體重頁不顯示 -0.0',!/-0\.0/.test(t),t);
    await page.context().close()}

  /* 9. hidden 屬性在沒有外框 reset 時仍有效 */
  {const {page}=await open({time:NOW,cfg:{latencyComp:true}});await wait(400);
    const vis=await page.evaluate(()=>['#p-weight','#p-exercise','#p-exams','#p-setup','#toast','#kbdRow'].filter(s=>getComputedStyle(document.querySelector(s)).display!=='none'));
    check('隱藏的分頁與元件不會顯示',!vis.length,vis);
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
