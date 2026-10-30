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
    check('只有一次寫入',(await page.evaluate(()=>window.__mock.writes.length))-n0===1);
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
    check('沒有重新整理，表單沒有被重繪（值不變）',(await page.inputValue('#sDose'))==='50');
    await page.evaluate(at=>window.__mock.externalSet('system/heartbeat',{at,kind:'evening',date:'2026-10-30',missing:[],paused:false,ok:true,skipped:null,pushed:false,msg:'',recent:[]}),new Date(Date.now()-60000).toISOString());
    await page.clock.runFor(300);
    check('新心跳到達：狀態即時更新',(await txt(page,'#hbLine'))?.endsWith('・晚上・都記了'),await txt(page,'#hbLine'));
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
