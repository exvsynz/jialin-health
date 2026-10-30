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

  /* B2：每次記錄的點擊數不變 */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,seed:seed()}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(300);await page.click('#wsSave');await wait(300);await page.click('#medBtn');await wait(300);
    check('早上流程 3 次點擊：今天完成',(await page.textContent('#headline')).includes('今天完成'),await page.textContent('#headline'));
    check('細節不展開、不算進完成',await page.evaluate(()=>document.querySelector('#medMore').hidden));
    await page.context().close()}
  {const s=seed();s['days/'+T]={date:T,am:{w:52.1,bf:null,at:'07:10'},med:{taken:true,at:'07:15',dose:50},updatedAt:1};
    const {page}=await open({time:T+'T20:30:00+08:00',cfg:{latencyComp:true,seed:s}});await wait(500);
    await page.click('[data-wslot="pm"]');await wait(300);await page.click('[data-step="1"]');await page.click('#wsSave');await wait(300); // 估計值要先撥尺確認
    check('晚上流程 3 次點擊（開啟、撥尺、儲存）：今天完成',(await page.textContent('#headline')).includes('今天完成'),await page.textContent('#headline'));
    await page.context().close()}

  /* B2：服藥細節 */
  const taken=(o={})=>{const s=seed(o.extra||{});s['days/'+T]={date:T,am:{w:52.1,bf:null,at:'07:10'},med:{taken:true,at:'07:15',dose:50,...(o.med||{})},updatedAt:1};return s};
  const pos=page=>page.evaluate(()=>['#headline','[data-wslot="am"]','#medBtn'].map(q=>Math.round(document.querySelector(q).getBoundingClientRect().top)));
  {const {page,doc,errors}=await open({time:NOW,cfg:{latencyComp:true,seed:taken()}});await wait(500);
    const p0=await pos(page);
    await page.click('#medBtn');await wait(200);
    check('已記錄時點服藥列：展開細節',await page.isVisible('#medMore')&&await page.isVisible('#medCancel'));
    check('展開時上方元件位置不變',JSON.stringify(p0)===JSON.stringify(await pos(page)),{p0,p1:await pos(page)});
    await page.click('[data-mode="bedtime"]');await wait(300);let m=(await doc('days/'+T)).med;
    check('選服藥方式：只寫 mode，其他欄位不變',m.mode==='bedtime'&&m.taken===true&&m.at==='07:15'&&m.dose===50,m);
    check('選了的那顆顯示已選',await page.evaluate(()=>document.querySelector('[data-mode="bedtime"]').getAttribute('aria-pressed'))==='true');
    await page.click('[data-mode="bedtime"]');await wait(300);
    check('再點同一顆：回到未填（null）',(await doc('days/'+T)).med.mode===null);
    await page.click('[data-intf="coffee"]');await wait(300);
    check('自行標記：寫入 interfere.coffee=true',(await doc('days/'+T)).med.interfere?.coffee===true);
    await page.click('[data-intf="coffee"]');await wait(300);
    check('再點一次：寫入 false',(await doc('days/'+T)).med.interfere?.coffee===false);
    await page.evaluate(()=>window.__mock.externalSet('days/2026-10-30',{...window.__mock.store.get('days/2026-10-30'),period:true}));await wait(300);
    check('其他欄位的遠端更新重繪後：細節仍展開',await page.isVisible('#medMore'));
    await page.click('#medBtn');await wait(200);
    check('再點服藥列：收起',!(await page.isVisible('#medMore')));
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:false,latency:300,seed:taken()}});await wait(700);
    await page.click('#medBtn');await wait(100);
    await page.click('[data-intf="coffee"]');await page.click('[data-intf="calcium"]');await wait(100);
    check('慢網路連點兩項：寫入中兩顆都顯示已選',await page.evaluate(()=>['coffee','calcium'].every(k=>document.querySelector(`[data-intf="${k}"]`).getAttribute('aria-pressed')==='true')));
    await wait(900);const i=(await doc('days/'+T)).med.interfere;
    check('慢網路連點兩項：兩項都寫入',i?.coffee===true&&i?.calcium===true,i);
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:false,latency:300,seed:taken()}});await wait(700);
    await page.click('#medBtn');await wait(100);
    await page.click('[data-intf="coffee"]');
    await page.evaluate(()=>{const d=window.__mock.store.get('days/2026-10-30');window.__mock.externalSet('days/2026-10-30',{...d,med:{...d.med,interfere:{...(d.med.interfere||{}),iron:true}}})});
    await wait(900);const i=(await doc('days/'+T)).med.interfere;
    check('另一台裝置同時標記鐵劑：兩項都保留',i?.coffee===true&&i?.iron===true,i);
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:false,latency:300,seed:taken()}});await wait(700);
    await page.click('#medBtn');await wait(100);
    await page.click('[data-intf="soy"]');await page.click('#medCancel');await wait(1200);
    check('標記後立刻取消服藥：最後沒有服藥紀錄',!(await doc('days/'+T)).med,(await doc('days/'+T)).med);
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,seed:taken()}});await wait(500);
    await page.click('#medBtn');await wait(100);
    await page.evaluate(()=>{const d=window.__mock.store.get('days/2026-10-30');window.__mock.silentSet('days/2026-10-30',{...d,med:null})}); // 另一台裝置已取消，這個畫面還不知道
    await page.click('[data-intf="fiber"]');await wait(300);
    const m=(await doc('days/'+T)).med;
    check('遠端已取消、舊畫面再點細節：留下的物件沒有 taken',m&&m.taken!==true,m);
    await page.evaluate(()=>window.__mock.externalSet('days/2026-10-30',window.__mock.store.get('days/2026-10-30')));await wait(300);
    check('遠端已取消：快照到達後，今天頁顯示服藥未完成',(await page.textContent('#headline')).includes('還差'),await page.textContent('#headline'));
    check('遠端已取消：細節收起',!(await page.isVisible('#medMore')));
    await page.click('#medBtn');await wait(300);
    check('再點服藥列：重新記錄服藥',(await doc('days/'+T)).med.taken===true);
    await page.context().close()}
  {const s=taken();s['days/2026-10-29'].med={...s['days/2026-10-29'].med,mode:'bedtime'};
    const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,seed:s}});await wait(500);
    await page.click('#medBtn');await wait(200);
    check('還沒填服藥方式：上次的方式加上「上次」提示',(await page.textContent('[data-mode="bedtime"]')).includes('上次')&&await page.evaluate(()=>document.querySelector('[data-mode="bedtime"]').classList.contains('last')));
    check('不自動帶入：服藥方式仍是未填',(await doc('days/'+T)).med.mode===undefined);
    await page.click('[data-mode="bedtime"]');await wait(300);
    check('點上次的方式一下就套用',(await doc('days/'+T)).med.mode==='bedtime');
    check('套用後不再顯示「上次」',!(await page.textContent('[data-mode="bedtime"]')).includes('上次'));
    await page.context().close()}
  /* 版面：展開細節，380 淺色／深色 */
  const {scan}=require('./a11y');
  for(const scheme of ['light','dark']){
    const {page}=await open({time:NOW,scheme,cfg:{latencyComp:true,seed:taken({med:{mode:'fasting_am',interfere:{coffee:true}}})}});await wait(500);
    await page.click('#medBtn');await wait(200);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    const r=await page.evaluate(`(${scan.toString()})()`);
    check(`380 ${scheme} 服藥細節：沒有水平捲動、觸控目標、對比`,overflow<=0&&!r.small.length&&!r.low.length,{overflow,...r});
    if(!process.argv.includes('--no-shots')){fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:path.join(SHOTS,`380-${scheme}-today-med-details.png`),fullPage:true})}
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
