/* 重繪不打斷輸入、單一 click handler、長開頁面的換日與 18 點。
   執行：node dev/render-test.js */
const {open,close,sampleSeed,check,summary}=require('./harness');
const T='2026-10-30';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
/* 統計 document 上的 click listener 數量 */
const COUNT_CLICKS=`(()=>{const o=EventTarget.prototype.addEventListener;window.__docClicks=0;EventTarget.prototype.addEventListener=function(t,...a){if(this===document&&t==='click')window.__docClicks++;return o.call(this,t,...a)}})();`;
const bumpProfile=page=>page.evaluate(()=>{const p=window.__mock.store.get('settings/profile')||{};window.__mock.externalSet('settings/profile',{...p,bump:Date.now()})});

(async()=>{
  /* 1. 輸入運動備註時有快照進來 */
  {const seed={...sampleSeed(T),['exercise/x1']:{date:T,type:'yoga',label:'瑜珈',min:60,note:'',at:'07:30',createdAt:9}};
    const {page,doc,errors}=await open({cfg:{latencyComp:true,seed},init:COUNT_CLICKS});await wait(500);
    check('全檔只有一個 document click listener',(await page.evaluate(()=>window.__docClicks))===1,await page.evaluate(()=>window.__docClicks));
    await page.click('#exToday [data-exopen]');await wait(150);
    await page.click('[data-exnote]');await page.keyboard.type('慢');
    await bumpProfile(page);await wait(300);
    const st=await page.evaluate(()=>({focused:document.activeElement?.hasAttribute('data-exnote'),value:document.querySelector('[data-exnote]')?.value}));
    check('備註：快照進來後仍保有焦點',st.focused,st);
    check('備註：快照進來後文字還在',st.value==='慢',st);
    check('備註：打到一半沒有被存進資料庫',(await doc('exercise/x1')).note==='',await doc('exercise/x1'));
    await page.keyboard.type('流');await page.click('.perrow > div');await wait(400);
    check('備註：離開欄位後存入完整備註',(await doc('exercise/x1')).note==='慢流',await doc('exercise/x1'));
    // 調分鐘期間有快照進來，數字不跳回
    await page.click('[data-exstep="5"]');await page.evaluate(()=>window.__mock.externalSet('exercise/other',{date:'2026-10-01',type:'yoga',label:'瑜珈',min:30,note:'',at:'',createdAt:1}));await wait(100);
    const shown=await page.textContent('#exToday .exhead .num');
    check('調分鐘：快照進來時顯示新值',shown.trim()==='65 分',shown);
    await wait(900);check('調分鐘：寫入 65',(await doc('exercise/x1')).min===65,await doc('exercise/x1'));
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* 1b. 點 sheet 外的背景會關閉 */
  {const {page}=await open({cfg:{latencyComp:true,seed:sampleSeed(T)}});await wait(500);
    await page.click('#moreBtn');await wait(300);await page.mouse.click(190,40);await wait(200);
    check('點背景關閉「更多」',!(await page.evaluate(()=>document.querySelector('#moreSheet').open)));
    await page.click('[data-wslot="am"]');await wait(300);await page.mouse.click(190,40);await wait(200);
    check('點背景關閉體重面板',!(await page.evaluate(()=>document.querySelector('#wSheet').open)));
    await page.context().close()}

  /* 2. 設定頁：改了沒存、點到別處，快照進來不蓋回 */
  {const {page}=await open({cfg:{latencyComp:true,seed:sampleSeed(T)},hash:'setup'});await wait(500);
    await page.fill('#sMedNote','睡前');await page.click('#p-setup h2');await bumpProfile(page);await wait(300);
    check('設定：未存的修改不被快照蓋回',(await page.inputValue('#sMedNote'))==='睡前',await page.inputValue('#sMedNote'));
    await page.fill('#iv-gi_egd','18');await page.click('#p-setup h2');await bumpProfile(page);await wait(300);
    check('間隔：未存的修改不被快照蓋回',(await page.inputValue('#iv-gi_egd'))==='18');
    await page.click('#profForm button[type=submit]');await wait(400);
    check('設定：儲存後寫入',(await page.evaluate(()=>window.__mock.store.get('settings/profile').medNote))==='睡前');
    // 離開再回來，未存的間隔修改捨棄、顯示資料庫的值
    await page.evaluate(()=>location.hash='today');await wait(150);await page.evaluate(()=>location.hash='setup');await wait(200);
    check('間隔：離開再進來顯示已存的值',(await page.inputValue('#iv-gi_egd'))==='24',await page.inputValue('#iv-gi_egd'));
    await page.context().close()}

  /* 3. 唯讀時運動控制項停用 */
  {const seed={...sampleSeed(T),['exercise/x1']:{date:T,type:'yoga',label:'瑜珈',min:60,note:'',at:'07:30',createdAt:9}};
    const {page}=await open({cfg:{latencyComp:true,seed,canWrite:false}});await wait(500);
    await page.click('#exToday [data-exopen]');await wait(150);
    const en=await page.evaluate(()=>[...document.querySelectorAll('#exToday [data-exstep],#exToday [data-exdel],#exToday [data-exnote]')].filter(x=>!x.disabled).length);
    check('唯讀：運動步進、備註、刪除都停用',en===0,en);
    await page.context().close()}

  /* 4. 頁面長開：跨過 18:00 與 04:00 */
  {const {page}=await open({time:T+'T17:58:00+08:00',install:true,cfg:{latencyComp:true,seed:sampleSeed(T)}});
    await page.clock.runFor(1500);
    check('17:58 晚上體重不是待辦',!(await page.evaluate(()=>document.querySelector('[data-wslot="pm"]').classList.contains('pend'))));
    await page.clock.runFor(3*60*1000);
    check('長開跨過 18:00 後晚上體重變待辦',await page.evaluate(()=>document.querySelector('[data-wslot="pm"]').classList.contains('pend')));
    await page.clock.setSystemTime(new Date('2026-10-31T04:01:00+08:00'));await page.clock.runFor(61*1000);
    const t=await page.textContent('#tDate');
    check('長開跨過 04:00 後切到新的一天',t.includes('10月31日')&&!t.includes('補登'),t);
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
