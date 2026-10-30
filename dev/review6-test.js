/* 第 6 批：GPT（Sol、Terra、Astra）整合審查指出的問題。每項先在舊版本重現，修正後通過。
   執行：node dev/review6-test.js */
const {open,close,sampleSeed,check,summary}=require('./harness');
const T='2026-10-30';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tap=(page,sel)=>page.evaluate(s=>document.querySelector(s).click(),sel);
const ex1=min=>({['exercise/x1']:{date:T,type:'yoga',label:'瑜珈',min,note:'',at:'07:30',createdAt:9}});

(async()=>{
  /* H1 新文件建立：另一台裝置持有建立租約時，本機不可搶先整份建立 */
  {const {page,doc}=await open({cfg:{latencyComp:true,latency:50}});await wait(400);
    await page.evaluate(p=>window.__mock.holdLease(p,3000),'days/'+T);
    await page.click('#medBtn');await wait(250);
    await page.evaluate(([p,b])=>{window.__mock.silentSet(p,b);window.__mock.releaseLease(p)},['days/'+T,{date:T,am:{w:52.3,bf:null,at:'07:00'}}]);
    await wait(2000);const d=await doc('days/'+T);
    check('H1 他機持有建立租約時，兩邊的欄位都保留',d?.am?.w===52.3&&d?.med?.taken,d);
    await page.context().close()}

  /* H2 體重面板開著跨過 04:00，仍存回開面板時的日期 */
  {const seed={['days/'+T]:{date:T,am:{w:52.0,bf:null,at:'07:00'},pm:{w:52.3,bf:null,at:'22:00'},med:{taken:true,at:'07:00',dose:50}}};
    const {page,doc}=await open({time:'2026-10-31T03:59:00+08:00',install:true,cfg:{latencyComp:true,seed}});
    await page.clock.runFor(1500);
    await page.click('[data-wslot="pm"]');await page.clock.runFor(400);await page.click('[data-step="1"]');
    await page.clock.setSystemTime(new Date('2026-10-31T04:02:00+08:00'));await page.clock.runFor(61000);
    await page.click('#wsSave');await page.clock.runFor(2000);
    const a=await doc('days/'+T),b=await doc('days/2026-10-31');
    check('H2 跨 04:00 儲存：寫回 10/30 晚上',a?.pm?.w===52.4,a?.pm);
    check('H2 跨 04:00 儲存：沒有寫到 10/31',!b?.pm,b);
    await page.context().close()}

  /* H3 設定的第一筆快照來自快取（且快取裡沒有設定）時，不可用內建劑量記錄 */
  {const {page,doc}=await open({cfg:{latencyComp:true,seed:{'settings/profile':{medDose:75}},cacheFirst:{'settings/profile':null},serverDelay:1200}});
    await wait(400);await tap(page,'#medBtn');await wait(1600);
    let d=await doc('days/'+T);
    check('H3 快取快照期間點服藥，不會記成內建 50',!d?.med||d.med.dose===75,d?.med);
    await page.click('#medBtn');await wait(400);d=await doc('days/'+T);
    check('H3 伺服器快照到了之後，服藥劑量是 75',d?.med?.dose===75,d?.med);
    await page.context().close()}

  /* H4 直接進設定、資料到之前先點欄位，資料到了之後欄位要顯示伺服器的值 */
  {const {page}=await open({hash:'setup',cfg:{latencyComp:true,snapDelay:{'settings/profile':1000},seed:{'settings/profile':{medName:'Levothyroxine',medDose:75,medNote:'空腹'}}}});
    await wait(300);await page.evaluate(()=>document.querySelector('#sMedNote').focus());
    await wait(1200);await page.click('#p-setup h2');await wait(200);
    check('H4 資料到之前聚焦過，離開後劑量顯示 75',(await page.inputValue('#sDose'))==='75',await page.inputValue('#sDose'));
    await page.click('#profForm button[type=submit]');await wait(400);
    check('H4 儲存後劑量仍是 75',(await page.evaluate(()=>window.__mock.store.get('settings/profile').medDose))===75);
    await page.context().close()}

  /* H5 刪除後撤銷，要回到刪除當下的版本，不是打開對話框時的舊版本 */
  {const seed={...sampleSeed(T)};seed['records/r1']={...seed['records/r1'],report:'A',updatedAt:1};
    const {page,doc}=await open({hash:'exams',cfg:{latencyComp:true,seed}});await wait(400);
    await page.click('[data-hist="thy_us"]');await wait(150);await page.click('[data-edit="r1"]');await wait(200);
    await page.evaluate(()=>{const r=window.__mock.store.get('records/r1');window.__mock.externalSet('records/r1',{...r,report:'B',updatedAt:2})});await wait(300);
    await page.click('#btnDel');await wait(400);await page.click('#toastActs button:has-text("撤銷")');await wait(400);
    const r=await doc('records/r1');
    check('H5 撤銷刪除回到最新版本 B',r?.report==='B'&&r.updatedAt===2,r&&{report:r.report,updatedAt:r.updatedAt});
    await page.context().close()}

  /* H6 舊的分鐘寫入失敗時，不可清掉較新的待寫值 */
  {const {page,doc}=await open({cfg:{latencyComp:false,latency:1500,failNext:{code:'unavailable',count:2},seed:{...sampleSeed(T),...ex1(60)}}});await wait(1700);
    await page.click('#exToday [data-exopen]');await wait(100);
    await page.click('[data-exstep="5"]');await wait(750);  // 65 開始寫入，會失敗兩次
    await page.click('[data-exstep="5"]');                    // 70 排在後面
    await wait(4150);                                         // 65 已失敗、70 的快照還沒回來
    await page.click('[data-exstep="5"]');                    // 應為 75
    await wait(8000);
    const d=await doc('exercise/x1');const shown=(await page.textContent('#exToday .exhead .num')).trim();
    check('H6 舊寫入失敗後再調，最後存 75',d?.min===75,d?.min);
    check('H6 畫面與資料庫一致',shown===d?.min+' 分',shown);
    await page.context().close()}

  /* M1 自己的分鐘寫入完成時，若他機已改值，畫面要顯示最新值 */
  {const {page,doc}=await open({cfg:{latencyComp:true,latency:400,seed:{...sampleSeed(T),...ex1(60)}}});await wait(600);
    await page.click('#exToday [data-exopen]');await wait(100);
    await page.click('[data-exstep="5"]');await wait(850);
    await page.evaluate(()=>{const e=window.__mock.store.get('exercise/x1');window.__mock.externalSet('exercise/x1',{...e,min:90})});
    await wait(900);
    const shown=(await page.textContent('#exToday .exhead .num')).trim();
    check('M1 他機改成 90 後，畫面顯示 90',shown==='90 分'&&(await doc('exercise/x1')).min===90,shown);
    await page.context().close()}

  /* H7 儲存中不可再改數值；舊的儲存完成時不可關掉新開的面板 */
  {const {page,doc}=await open({cfg:{latencyComp:true,latency:800,seed:sampleSeed(T)}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(300);await page.click('[data-step="1"]');
    const saved=parseFloat(await page.textContent('#wsBig'));
    await page.click('#wsSave');await wait(100);await tap(page,'[data-step="1"]');
    const during=parseFloat(await page.textContent('#wsBig'));
    await wait(4000); // 當天第一筆：update 失敗、acquire、get、set 四次往返
    check('H7 儲存中按 +0.1 不改變數值',during===saved,{saved,during});
    check('H7 存入的是按下儲存時的數值',(await doc('days/'+T))?.am?.w===saved,(await doc('days/'+T))?.am);
    await page.click('[data-wslot="pm"]');await wait(300);await page.click('[data-step="1"]');await page.click('#wsSave');await wait(50);
    await page.click('#wsClose');await page.click('[data-wslot="am"]');await wait(1500);
    check('H7 舊的儲存完成時，新開的面板不會被關掉',await page.evaluate(()=>document.querySelector('#wSheet').open));
    await page.context().close()}

  /* H8 設定送出後繼續改，舊的請求完成不可清掉新的修改 */
  {const {page}=await open({hash:'setup',cfg:{latencyComp:true,latency:600,seed:sampleSeed(T)}});await wait(500);
    await page.fill('#sMedNote','first');await page.evaluate(()=>document.querySelector('#profForm').requestSubmit());
    await wait(100);await page.fill('#sMedNote','second');await wait(1000);
    await page.evaluate(()=>{const p=window.__mock.store.get('settings/profile');window.__mock.externalSet('settings/profile',{...p,bump:1})});await wait(300);
    check('H8 舊請求完成、快照進來後，第二版仍在',(await page.inputValue('#sMedNote'))==='second',await page.inputValue('#sMedNote'));
    await page.context().close()}

  /* H9 間隔還沒載入時送出，不可蓋掉已存的自訂間隔；儲存不刪除表單沒有的欄位 */
  {const seed={...sampleSeed(T),'settings/intervals':{thy_us:36,breast_us:18,legacy_x:5}};
    const {page}=await open({hash:'setup',cfg:{latencyComp:true,snapDelay:{'settings/intervals':1500},seed}});
    await wait(300);await page.evaluate(()=>document.querySelector('#ivForm').requestSubmit());await wait(1800);
    let iv=await page.evaluate(()=>window.__mock.store.get('settings/intervals'));
    check('H9 載入前送出不蓋掉自訂間隔',iv.thy_us===36&&iv.breast_us===18&&iv.legacy_x===5,iv);
    check('H9 載入後欄位顯示已存的 36',(await page.inputValue('#iv-thy_us'))==='36');
    await page.fill('#iv-gi_egd','18');await page.click('#ivForm button[type=submit]');await wait(400);
    iv=await page.evaluate(()=>window.__mock.store.get('settings/intervals'));
    check('H9 儲存後保留表單沒有的欄位、寫入新值',iv.legacy_x===5&&iv.gi_egd===18&&iv.thy_us===36,iv);
    await page.context().close()}

  /* 趨勢小折線：全部完成前不出現，待辦按鈕位置不動 */
  {const {page}=await open({cfg:{latencyComp:true,seed:sampleSeed(T)}});await wait(500);
    const y0=(await page.locator('#medBtn').boundingBox()).y;
    await page.click('[data-wslot="am"]');await wait(300);await page.click('#wsSave');await wait(400);
    const y1=(await page.locator('#medBtn').boundingBox()).y;
    check('小折線：早上體重記完、還沒服藥時不出現',await page.evaluate(()=>document.querySelector('#spark').hidden));
    check('小折線：服藥按鈕位置不動',Math.abs(y1-y0)<1,{y0,y1});
    await page.click('#medBtn');await wait(400);
    check('小折線：今天完成後出現',!(await page.evaluate(()=>document.querySelector('#spark').hidden)));
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
