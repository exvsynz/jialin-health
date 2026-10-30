/* A 階段：設定頁提醒區塊與今天頁的「提醒可能停了」（合成資料、假 window.claude）。
   執行：node dev/remind-test.js        略過截圖：node dev/remind-test.js --no-shots */
const fs=require('fs'),path=require('path');
const {open,close,sampleSeed,check,summary}=require('./harness');
const {scan}=require('./a11y');
const SHOTS=path.join(__dirname,'screenshots');
const T='2026-10-30',NOW=T+'T20:30:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const hoursAgo=(h,iso=NOW)=>new Date(Date.parse(iso)-h*36e5).toISOString().replace('Z','+00:00');
const hbDoc=(h,extra={})=>({at:hoursAgo(h),kind:'morning',date:T,missing:['服藥'],paused:false,ok:true,skipped:null,pushed:true,msg:'家琳今天還沒記：服藥',recent:[],...extra});
const seed=(extra={})=>({...sampleSeed(T),...extra});
const sw=(page,k)=>page.evaluate(k=>{const i=document.querySelector(`[data-remind="${k}"]`);return{checked:i.checked,disabled:i.disabled}},k);
const txt=(page,s)=>page.evaluate(s=>{const e=document.querySelector(s);return e.hidden?null:e.textContent},s);
async function layout(page,label){
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  check(label+'：沒有水平捲動',overflow<=0,overflow);
  const r=await page.evaluate(`(${scan.toString()})()`);
  check(label+'：觸控目標 ≥44px',!r.small.length,r.small);
  check(label+'：文字對比足夠',!r.low.length,r.low);
}

(async()=>{
  /* 舊 profile 沒有 remind：三個開關都開，沒有飲食開關；沒有心跳文件 */
  {const {page,errors}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed()}});await wait(500);
    check('沒有 remind：早上、晚上、週報都開',(await sw(page,'morning')).checked&&(await sw(page,'evening')).checked&&(await sw(page,'weekly')).checked);
    check('沒有飲食開關',!(await page.$('[data-remind="food"]')));
    check('沒有心跳：顯示還沒有收到',(await txt(page,'#hbLine'))==='還沒有收到排程檢查。',await txt(page,'#hbLine'));
    check('沒有心跳：不警示',(await txt(page,'#hbWarn'))===null);
    check('提醒區塊在設定頁最上面',await page.evaluate(()=>document.querySelector('#p-setup').firstElementChild.id==='remindSect'));
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* 開關：只寫改動的 key，其他欄位不變；撤銷寫回；另一台裝置的開關不被蓋掉 */
  {const prof={medName:'Levothyroxine',medDose:50,medNote:'半顆',yogaMin:60,pilatesMin:50,pauseFrom:'2026-11-10',pauseTo:'2026-11-12',pauseNote:'出差'};
    const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,latency:40,seed:seed({'settings/profile':prof})}});await wait(500);
    const n0=await page.evaluate(()=>window.__mock.writes.length);
    await page.click('[data-remind="morning"]');await wait(300);
    let p=await doc('settings/profile');
    check('關掉早上提醒：remind.morning=false',p.remind?.morning===false,p.remind);
    check('只送改動的 key（evening、weekly 沒有寫入）',p.remind&&!('evening' in p.remind)&&!('weekly' in p.remind),p.remind);
    check('其他設定不變',p.pauseFrom==='2026-11-10'&&p.medDose===50&&p.pauseNote==='出差',p);
    const w1=await page.evaluate(n=>window.__mock.writes.slice(n),n0);
    check('只有一次寫入，payload 只有 remind.morning 與 updatedAt',w1.length===1&&JSON.stringify(Object.keys(w1[0].data).sort())==='["remind","updatedAt"]'&&JSON.stringify(w1[0].data.remind)==='{"morning":false}',w1);
    check('toast：已關閉早上提醒，附撤銷',(await page.textContent('#toastText'))==='已關閉早上提醒'&&await page.isVisible('#toastActs button:has-text("撤銷")'));
    check('開關顯示關',!(await sw(page,'morning')).checked);
    // 另一台裝置改了 evening
    await page.evaluate(()=>window.__mock.externalSet('settings/profile',{...window.__mock.store.get('settings/profile'),remind:{...window.__mock.store.get('settings/profile').remind,evening:false}}));await wait(200);
    check('另一台裝置關掉晚上：開關跟著變',!(await sw(page,'evening')).checked);
    check('本機剛關的早上仍是關',!(await sw(page,'morning')).checked);
    await page.click('#toastActs button:has-text("撤銷")');await wait(300);p=await doc('settings/profile');
    check('撤銷：早上回到開，晚上維持另一台裝置的關',p.remind.morning===true&&p.remind.evening===false,p.remind);
    check('撤銷後開關顯示開',(await sw(page,'morning')).checked);
    // 週報開關
    await page.click('label:has([data-remind="weekly"]) .grow');await wait(300);p=await doc('settings/profile');
    check('點整列文字也能切換（週報關）',p.remind.weekly===false,p.remind);
    await page.context().close()}

  /* 表單有未存修改時切開關：表單內容保留；之後儲存設定不會清掉 remind */
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed()}});await wait(500);
    await page.fill('#sMedNote','早上空腹，半顆');
    await page.click('[data-remind="evening"]');await wait(300);
    check('切開關後表單未存的文字還在',(await page.inputValue('#sMedNote'))==='早上空腹，半顆');
    await page.click('#profForm button[type="submit"]');await wait(300);const p=await doc('settings/profile');
    check('儲存設定後 remind 保留',p.remind?.evening===false&&p.medNote==='早上空腹，半顆',p);
    await page.context().close()}

  /* 伺服器快照到之前、沒有寫入權限：開關停用 */
  {const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed(),cacheFirst:{'settings/profile':{medDose:50}},serverDelay:1500}});await wait(400);
    check('伺服器快照到之前開關停用',(await sw(page,'morning')).disabled);
    await wait(1600);
    check('伺服器快照到之後開關可用',!(await sw(page,'morning')).disabled);
    await page.context().close()}
  {const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed(),canWrite:false}});await wait(500);
    check('沒有寫入權限：開關停用',(await sw(page,'morning')).disabled&&(await sw(page,'weekly')).disabled);
    await page.context().close()}

  /* 寫入失敗：開關退回原狀，出現錯誤 toast */
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:false,latency:40,seed:seed()}});await wait(500);
    await page.evaluate(()=>window.__mock.cfg.failNext={code:'internal',count:1});
    await page.click('[data-remind="morning"]');await wait(400);
    check('寫入失敗：開關退回開',(await sw(page,'morning')).checked);
    check('寫入失敗：錯誤 toast',(await page.textContent('#toastText'))==='沒有存到，請再試一次',await page.textContent('#toastText'));
    check('寫入失敗：資料庫沒有 remind',!(await doc('settings/profile')).remind);
    await page.context().close()}

  /* 心跳狀態：正常、跨過 26 小時自動警示、新心跳到達時即時更新 */
  {const {page,errors}=await open({time:NOW,install:true,hash:'setup',cfg:{latencyComp:true,seed:seed({'system/heartbeat':hbDoc(25+59/60)})}});
    await page.clock.runFor(800);
    check('25:59 前的心跳：顯示狀態，不警示',(await txt(page,'#hbLine'))?.startsWith('上次檢查 10/29（四）18:31・早上・缺服藥')&&(await txt(page,'#hbWarn'))===null,await txt(page,'#hbLine'));
    await page.clock.runFor(125000);
    check('頁面開著過了 26 小時：警示自動出現',(await txt(page,'#hbWarn'))==='提醒可能停了：上次檢查是 26 小時前。',await txt(page,'#hbWarn'));
    await page.click('#sDose');await page.fill('#sDose','62');
    await page.clock.runFor(125000);
    check('每分鐘重算時，輸入中的欄位不被重繪（值與焦點都在）',(await page.inputValue('#sDose'))==='62'&&await page.evaluate(()=>document.activeElement?.id)==='sDose');
    await page.evaluate(()=>window.__mock.externalSet('system/heartbeat',{at:new Date(Date.now()-60000).toISOString(),kind:'evening',date:'2026-10-30',missing:[],paused:false,ok:true,skipped:null,recent:[]})); // 頁面的假時鐘
    await page.clock.runFor(300);
    check('新心跳到達：狀態即時更新（時間取頁面時鐘）',(await txt(page,'#hbLine'))?.endsWith('・晚上・都記了'),await txt(page,'#hbLine'));
    check('新心跳到達：警示消失',(await txt(page,'#hbWarn'))===null);
    check('頁面從不寫入 system/heartbeat',!(await page.evaluate(()=>window.__mock.writes.some(w=>w.path==='system/heartbeat'))));
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* 今天頁：正常時沒有提醒那一行；超過 26 小時才在最下方出現，上方元件位置不變 */
  {const pos=page=>page.evaluate(()=>['#headline','[data-wslot="am"]','#medBtn','#pills','#perBtn','#examSlot'].map(s=>Math.round(document.querySelector(s).getBoundingClientRect().top)));
    const a=await open({time:NOW,cfg:{latencyComp:true,seed:seed({'system/heartbeat':hbDoc(2)})}});await wait(500);
    check('今天頁：心跳正常時不出現',(await txt(a.page,'#hbToday'))===null);
    const p0=await pos(a.page);await a.page.context().close();
    const b=await open({time:NOW,cfg:{latencyComp:true,seed:seed()}});await wait(500);
    check('今天頁：沒有心跳文件時不出現',(await txt(b.page,'#hbToday'))===null);await b.page.context().close();
    const c=await open({time:NOW,cfg:{latencyComp:true,seed:seed({'system/heartbeat':hbDoc(33)})}});await wait(500);
    check('今天頁：超過 26 小時出現提醒',(await txt(c.page,'#hbToday'))==='提醒可能停了：上次檢查是 33 小時前。',await txt(c.page,'#hbToday'));
    check('今天頁：提醒在最下方',await c.page.evaluate(()=>{const p=document.querySelector('#p-today');return p.lastElementChild.id==='hbToday'}));
    const p1=await pos(c.page);check('今天頁：上方元件位置不變',JSON.stringify(p0)===JSON.stringify(p1),{p0,p1});
    await layout(c.page,'今天頁 380 提醒停了');
    await c.page.context().close()}

  /* 時間無法辨識：設定頁警示，今天頁不顯示；超出範圍的數字不會讓今天頁停止重繪 */
  for(const at of ['abc',1e20,'2026-10-30T07:00:00']){
    const {page,errors}=await open({time:NOW,cfg:{latencyComp:true,seed:seed({'system/heartbeat':{at,kind:'morning'}})}});await wait(500);
    check(`at=${JSON.stringify(at)}：今天頁不顯示提醒停了`,(await txt(page,'#hbToday'))===null);
    await page.click('[data-wslot="am"]');await wait(300);await page.click('#wsSave');await wait(300);
    check(`at=${JSON.stringify(at)}：今天頁照常重繪（記完早上體重後格子更新）`,(await page.textContent('[data-wslot="am"]')).includes('✓'));
    await page.evaluate(()=>location.hash='setup');await wait(300);
    check(`at=${JSON.stringify(at)}：設定頁顯示無法辨識與警示`,(await txt(page,'#hbLine'))==='上次檢查時間無法辨識。'&&(await txt(page,'#hbWarn'))==='提醒可能停了。');
    check(`at=${JSON.stringify(at)}：沒有 JS 錯誤`,!errors.length,errors);
    await page.context().close()}

  /* 慢網路下連續切換：只有最後一次決定開關與 toast */
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:false,latency:400,seed:seed()}});await wait(800);
    await page.click('[data-remind="morning"]');await wait(50);await page.click('[data-remind="morning"]');
    const seen=[];for(let i=0;i<9;i++){seen.push((await sw(page,'morning')).checked);await wait(55)} // 涵蓋第一筆完成、第二筆還在等的時段
    // 這個 mock 在第一筆的快照送出前就已套用第二筆，所以「反跳」本身重現不出來；舊程式在這裡失敗的是下一項的過時 toast
    check('連續切換：寫入期間開關一直顯示最後點的值',seen.every(Boolean),seen);
    check('連續切換：沒有過時的「已關閉」toast',!(await page.isVisible('#toast'))||!(await page.textContent('#toastText')).includes('已關閉'),await page.textContent('#toastText'));
    await wait(500);
    check('連續切換：最後是開，toast 是已開啟',(await sw(page,'morning')).checked&&(await doc('settings/profile')).remind.morning===true&&(await page.textContent('#toastText'))==='已開啟早上提醒',[(await doc('settings/profile')).remind,await page.textContent('#toastText')]);
    await page.click('#toastActs button:has-text("撤銷")');await wait(100);
    check('撤銷進行中：開關立刻顯示關',!(await sw(page,'morning')).checked);
    await wait(500);check('撤銷完成：資料庫是關',(await doc('settings/profile')).remind.morning===false);
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:false,latency:300,seed:seed()}});await wait(700);
    await page.evaluate(()=>window.__mock.cfg.failNext={code:'internal',count:1});
    await page.click('[data-remind="weekly"]');await wait(50);await page.click('[data-remind="weekly"]');await wait(50);await page.click('[data-remind="weekly"]');await wait(1200);
    check('第一筆失敗、後兩筆成功：最後是關',!(await sw(page,'weekly')).checked&&(await doc('settings/profile')).remind?.weekly===false,(await doc('settings/profile')).remind);
    await page.context().close()}

  /* 同時寫入：兩個開關與「儲存設定」交錯 */
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:false,latency:300,seed:seed({'settings/profile':{...sampleSeed(T)['settings/profile'],remind:{weekly:false,food:false}}})}});await wait(700);
    const n0=await page.evaluate(()=>window.__mock.writes.length);
    await page.click('[data-remind="morning"]');await page.click('[data-remind="evening"]');
    await page.fill('#sMedNote','睡前');await page.click('#profForm button[type="submit"]');
    await wait(1500);const p=await doc('settings/profile');
    check('交錯寫入：兩個開關與表單都保留，既有的 weekly、food 不變',p.remind.morning===false&&p.remind.evening===false&&p.remind.weekly===false&&p.remind.food===false&&p.medNote==='睡前',p);
    const w=await page.evaluate(n=>window.__mock.writes.slice(n),n0);
    check('交錯寫入：開關的 payload 只有自己的 key',w.filter(x=>x.data?.remind).every(x=>Object.keys(x.data.remind).length===1),w);
    check('交錯寫入：表單的 payload 不含 remind',w.filter(x=>x.data&&'medNote' in x.data).every(x=>!('remind' in x.data)),w);
    await page.context().close()}

  /* 首次建立：沒有 settings/profile 文件 */
  {const s0=seed();delete s0['settings/profile'];
    const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:s0}});await wait(500);
    await page.click('[data-remind="evening"]');await wait(400);
    check('沒有 profile 文件時切換：建立文件並寫入 remind',(await doc('settings/profile'))?.remind?.evening===false,await doc('settings/profile'));
    await page.context().close()}

  /* 遠端快照延遲：本機切換後，另一台裝置的舊快照晚到，不會把開關蓋回去 */
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:false,latency:300,seed:seed()}});await wait(700);
    await page.click('[data-remind="morning"]');await wait(50);
    await page.evaluate(()=>window.__mock.externalSet('settings/profile',{...window.__mock.store.get('settings/profile'),yogaMin:45}));await wait(100);
    check('寫入中收到其他欄位的遠端快照：開關仍顯示本機的值',!(await sw(page,'morning')).checked);
    await wait(500);check('寫入完成後一致',!(await sw(page,'morning')).checked&&(await doc('settings/profile')).remind.morning===false);
    await page.context().close()}

  /* 心跳監聽失敗：只影響狀態行 */
  {const {page,errors}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed(),failListen:['system/heartbeat']}});await wait(500);
    check('監聽失敗：狀態行顯示讀不到檢查紀錄',(await txt(page,'#hbLine'))==='讀不到檢查紀錄。');
    check('監聽失敗：沒有全頁連線中斷訊息',await page.evaluate(()=>document.querySelector('#dbNotice').hidden));
    await page.evaluate(()=>location.hash='today');await wait(300);
    check('監聽失敗：今天頁正常',(await page.textContent('#headline')).trim().length>0&&(await txt(page,'#hbToday'))===null);
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* 版面與截圖：380 淺色／深色 */
  if(!process.argv.includes('--no-shots'))fs.mkdirSync(SHOTS,{recursive:true});
  for(const scheme of ['light','dark'])for(const [tag,h] of [['remind',2],['remind-stale',33]]){
    const {page}=await open({time:NOW,scheme,hash:'setup',cfg:{latencyComp:true,seed:seed({'system/heartbeat':hbDoc(h),'settings/profile':{...sampleSeed(T)['settings/profile'],remind:{weekly:false}}})}});await wait(500);
    await layout(page,`380 ${scheme} 設定頁 ${tag}`);
    if(!process.argv.includes('--no-shots'))await page.screenshot({path:path.join(SHOTS,`380-${scheme}-setup-${tag}.png`)});
    if(tag==='remind-stale'){await page.evaluate(()=>location.hash='today');await wait(300);await layout(page,`380 ${scheme} 今天頁 提醒停了`);
      if(!process.argv.includes('--no-shots'))await page.screenshot({path:path.join(SHOTS,`380-${scheme}-today-remind-stale.png`),fullPage:true})}
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
