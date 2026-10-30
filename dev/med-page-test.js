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

  /* B3：用藥頁 */
  const toMeds=async page=>{await page.evaluate(()=>location.hash='meds');await wait(300)};
  {const {page,errors}=await open({time:NOW,cfg:{latencyComp:true,seed:seed()}});await wait(500);
    await page.click('#moreBtn');await wait(200);await page.click('[data-nav="meds"]');await wait(300);
    check('更多 → 用藥：頁面與標題',await page.isVisible('#p-meds')&&(await page.textContent('#subTitle'))==='用藥');
    check('沒有劑量紀錄：目前劑量標「依設定推定」',(await txt(page,'#medNow')).includes('50 mcg')&&(await txt(page,'#medNow')).includes('依設定推定'),await txt(page,'#medNow'));
    const adh=await txt(page,'#medAdh');
    check('服藥紀錄：近 30 天、近 90 天，寫成 a/b 天',/近 30 天已記錄服藥 \d+\/\d+ 天/.test(adh)&&adh.includes('近 90 天'),adh);
    check('複查：沒有變更時的狀態',(await txt(page,'#rcState'))==='還沒有劑量或製劑變更紀錄。');
    check('複查週數沒有預設值',(await page.inputValue('#rcWeeks'))==='');
    check('依據：ATA 建議 3a、4b 與說明書出處',(await page.textContent('#medRef')).includes('建議 3a')&&(await page.textContent('#rcSrc')).includes('§2.4'));
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,seed:seed()}});await wait(500);await toMeds(page);
    await page.click('#mdAdd');await wait(200);
    check('新增變更：劑量預填目前劑量，生效日預填今天',(await page.inputValue('#dDose'))==='50'&&(await page.inputValue('#dDate'))===T);
    await page.fill('#dDose','');await page.click('#dSave');await wait(200);
    check('劑量空白：不存，提示',(await page.textContent('#toastText')).includes('劑量')&&!(await page.evaluate(()=>[...window.__mock.store.keys()].some(k=>k.startsWith('meddose/')))));
    await page.fill('#dDose','75');await page.fill('#dRecheck','2026-10-20');await page.click('#dSave');await wait(200);
    check('複查日早於生效日：不存，提示',(await page.textContent('#toastText')).includes('複查日'));
    await page.fill('#dRecheck','');await page.fill('#dReason','TSH 偏高');await page.fill('#dTablet','<b>x</b>');await page.click('#dSave');await wait(400);
    const id=await page.evaluate(()=>[...window.__mock.store.keys()].find(k=>k.startsWith('meddose/')));const m=await doc(id);
    check('存檔：寫入劑量變更',m&&m.kind==='dose'&&m.date===T&&m.dose===75&&m.reason==='TSH 偏高'&&m.deleted===false&&m.recheckDue===null,m);
    check('目前劑量更新為 75，不再標推定',(await txt(page,'#medNow')).includes('75 mcg')&&!(await txt(page,'#medNow')).includes('推定'));
    check('時間軸：劑量 50 → 75',(await txt(page,'#medTl')).includes('劑量 50 → 75 mcg'),await txt(page,'#medTl'));
    check('自由文字只當文字顯示',!(await page.$('#medTl b'))&&(await txt(page,'#medTl')).includes('<b>x</b>'));
    await page.click('#toastActs button:has-text("撤銷")');await wait(300);
    check('新增後撤銷：軟刪除',(await doc(id)).deleted===true);
    await page.evaluate(id=>window.__mock.externalSet(id,{...window.__mock.store.get(id),deleted:false}),id);await wait(200);
    await page.click(`[data-dose="${id.split('/')[1]}"]`);await wait(200);
    await page.fill('#dDose','62.5');await page.click('#dSave');await wait(300);
    check('編輯：劑量改 62.5，其他欄位保留',(await doc(id)).dose===62.5&&(await doc(id)).reason==='TSH 偏高'&&(await doc(id)).createdAt>0,await doc(id));
    await page.click('#toastActs button:has-text("撤銷")');await wait(300);
    check('編輯後撤銷：回到 75',(await doc(id)).dose===75);
    await page.click(`[data-dose="${id.split('/')[1]}"]`);await wait(200);await page.click('#dDel');await wait(300);
    check('刪除：軟刪除，時間軸不再顯示',(await doc(id)).deleted===true&&!(await txt(page,'#medTl')).includes('75 mcg'));
    await page.click('#toastActs button:has-text("撤銷")');await wait(300);
    check('刪除後撤銷：回來',(await doc(id)).deleted===false&&(await txt(page,'#medTl')).includes('75 mcg'));
    await page.context().close()}
  {const s=seed({'meddose/a':md('2026-11-15',88,{createdAt:3}),'meddose/b':md('2026-10-01',75,{createdAt:2}),'meddose/c':md('2026-10-01',62,{createdAt:1}),'meddose/bad':md('2026-02-30',50)});
    const {page}=await open({time:NOW,hash:'meds',cfg:{latencyComp:true,seed:s}});await wait(500);
    const tl=await txt(page,'#medTl');
    check('時間軸：由新到舊；預定、同日較早、資料不完整都加註',tl.indexOf('2026/11/15')<tl.indexOf('2026/10/01')&&tl.includes('預定')&&tl.includes('同日較早的紀錄（未生效）')&&tl.includes('資料不完整'),tl);
    check('目前劑量用同日排最後的 75；預定 11/15 起 88',(await txt(page,'#medNow')).includes('75 mcg')&&(await txt(page,'#medNow')).includes('預定 11/15 起 88 mcg'),await txt(page,'#medNow'));
    check('時間軸也列出甲狀腺抽血',tl.includes('甲狀腺抽血')&&tl.includes('TSH 2.1'),tl);
    await page.click('#medTl [data-edit]');await wait(300);
    check('點抽血那一列：開啟檢查紀錄表單',await page.evaluate(()=>document.querySelector('#dlgRec').open));
    await page.context().close()}

  /* B3：TSH 複查 */
  {const s=seed({'meddose/m2':md('2026-10-01',75)});delete s['records/r1'];delete s['records/r2'];
    s['records/r3']={...s['records/r3'],date:'2026-06-01'}; // 例行甲狀腺抽血 12/01 到期，在 60 天內
    const {page,doc}=await open({time:NOW,hash:'meds',cfg:{latencyComp:true,seed:s}});await wait(500);
    check('週數未設定：不排',(await txt(page,'#rcState')).includes('未設定'));
    await page.fill('#rcWeeks','53');await page.dispatchEvent('#rcWeeks','change');await wait(200);
    check('週數 53：提示、不存',(await page.textContent('#toastText')).includes('1–52')&&(await doc('settings/profile')).tshRecheckWeeks===undefined);
    await page.fill('#rcWeeks','4');await page.dispatchEvent('#rcWeeks','change');await wait(300);
    check('週數 4：寫入設定',(await doc('settings/profile')).tshRecheckWeeks===4);
    check('複查日：生效後 4 週',(await txt(page,'#rcState')).includes('2026/10/29（生效後 4 週）'),await txt(page,'#rcState'));
    await page.evaluate(()=>location.hash='');await wait(300);
    check('今天頁到期卡：TSH 複查已逾期',(await txt(page,'#examSlot')).includes('TSH 複查（劑量變更後）')&&(await txt(page,'#examSlot')).includes('已逾期 1 天'),await txt(page,'#examSlot'));
    check('和例行甲狀腺抽血並列：另有 1 項',(await txt(page,'#examSlot')).includes('另有 1 項'),await txt(page,'#examSlot'));
    await page.click('#examCard');await wait(300);
    check('點 TSH 複查卡：到用藥頁',await page.isVisible('#p-meds'));
    await page.evaluate(()=>openRecord('thy_lab'));await wait(200);
    check('新抽血（10/30，生效日之後）：複查切換鍵出現並預設開',await page.isVisible('#rcRow')&&await page.isChecked('#fRecheck'));
    await page.fill('[data-lab="TSH"]','2.3');
    await page.click('[data-ctx="medBeforeDraw"] [data-v="no"]');await page.click('[data-ctx="biotin7d"] [data-v="unsure"]');
    await page.click('#btnSave');await wait(400);
    const rec=await page.evaluate(()=>[...window.__mock.store.entries()].find(([k,v])=>k.startsWith('records/')&&v.labs?.TSH==='2.3'));
    check('存檔：drawCtx 有連結與兩個情境',rec&&JSON.stringify(rec[1].drawCtx)===JSON.stringify({medBeforeDraw:'no',biotin7d:'unsure',recheckOf:'m2'}),rec&&rec[1].drawCtx);
    check('複查完成：用藥頁顯示已完成',(await txt(page,'#rcState')).includes('已完成'),await txt(page,'#rcState'));
    await page.evaluate(()=>location.hash='');await wait(300);
    check('複查完成：今天頁不再有 TSH 複查卡',!(await txt(page,'#examSlot')||'').includes('TSH 複查'),await txt(page,'#examSlot'));
    await page.evaluate(id=>window.__mock.externalSet(id,null),rec[0]);await page.evaluate(id=>{window.__mock.store.delete(id)},rec[0]);
    await page.evaluate(()=>window.__mock.externalSet('records/r3',window.__mock.store.get('records/r3')));await wait(300);
    check('刪掉那筆抽血：TSH 複查卡恢復',(await txt(page,'#examSlot')).includes('TSH 複查'),await txt(page,'#examSlot'));
    await page.context().close()}
  {const s=seed({'meddose/m2':md(T,75)});
    const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:{...s,'settings/profile':{...s['settings/profile'],tshRecheckWeeks:6}}}});await wait(500);
    await page.evaluate(()=>openRecord('thy_lab'));await wait(200);
    check('同日（基準）抽血：切換鍵關閉並停用，附原因',await page.isVisible('#rcRow')&&!(await page.isChecked('#fRecheck'))&&await page.isDisabled('#fRecheck')&&(await txt(page,'#rcHint')).includes('之後'));
    await page.context().close()}

  /* B3：抽血表單 */
  {const s=seed();s['records/r3']={...s['records/r3'],legacy:'keep',drawCtx:{biotin7d:'yes'}};
    const {page,doc}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:s}});await wait(500);
    await page.evaluate(()=>openRecord('thy_lab',records.find(r=>r.id==='r3')));await wait(200);
    check('編輯舊紀錄：情境顯示已存的值',await page.evaluate(()=>document.querySelector('[data-ctx="biotin7d"] [data-v="yes"]').getAttribute('aria-pressed'))==='true');
    await page.click('[data-ctx="biotin7d"] [data-v="yes"]');await page.click('[data-ctx="medBeforeDraw"] [data-v="yes"]');await page.click('#btnSave');await wait(300);
    const r3=await doc('records/r3');
    check('再點已選的那顆：回到未填；保留表單沒有的欄位',JSON.stringify(r3.drawCtx)==='{"medBeforeDraw":"yes"}'&&r3.legacy==='keep',r3);
    await page.evaluate(()=>openRecord('thy_lab'));await wait(200);
    await page.click('[data-ctx="medBeforeDraw"] [data-v="unsure"]');
    await page.selectOption('#fExam','thy_us');await wait(100);
    check('切到其他檢查：情境區塊隱藏',!(await page.isVisible('#ctxWrap')));
    await page.fill('#fInterval','12');await page.click('#btnSave');await wait(300);
    const us=await page.evaluate(()=>[...window.__mock.store.values()].find(v=>v.exam==='thy_us'&&v.date==='2026-10-30'));
    check('其他檢查存檔：不寫 drawCtx',us&&!('drawCtx' in us),us);
    await page.evaluate(()=>openRecord('thy_lab',records.find(r=>r.id==='r1')));await wait(200);
    check('其他檢查的舊紀錄：沒有情境區塊',!(await page.isVisible('#ctxWrap')));
    await page.context().close()}

  /* 版面：用藥頁、劑量表單、抽血表單 */
  for(const scheme of ['light','dark']){
    const s=seed({'meddose/b':md('2026-10-01',75,{tablet:'100 mcg × ½',reason:'TSH 偏高，回診時醫師建議調整劑量並於六週後複查'}),'meddose/a':md('2026-11-15',88)});
    s['records/r3']={...s['records/r3'],drawCtx:{medBeforeDraw:'no',biotin7d:'unsure'}};
    const {page}=await open({time:NOW,scheme,hash:'meds',cfg:{latencyComp:true,seed:{...s,'settings/profile':{...s['settings/profile'],tshRecheckWeeks:6}}}});await wait(500);
    await page.evaluate(()=>document.querySelector('#p-meds details').open=true);await wait(100);
    for(const [label,act,shot] of [['用藥頁',null,'meds'],['劑量表單',async()=>{await page.click('#mdAdd');await wait(300)},'meds-dose-form'],['抽血表單',async()=>{await page.evaluate(()=>{document.querySelector('#dlgDose').close();openRecord('thy_lab')});await wait(300)},'thy-lab-form']]){
      if(act)await act();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      const r=await page.evaluate(`(${scan.toString()})()`);
      check(`380 ${scheme} ${label}：沒有水平捲動、觸控目標、對比`,overflow<=0&&!r.small.length&&!r.low.length,{overflow,...r});
      if(!process.argv.includes('--no-shots'))await page.screenshot({path:path.join(SHOTS,`380-${scheme}-${shot}.png`),fullPage:!act});
    }
    await page.context().close()}

  /* B4：回診摘要 */
  const clipOK="Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{window.__clip=t}},configurable:true})";
  const clipNO="Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('NotAllowedError')}},configurable:true})";
  {const {page,errors}=await open({time:NOW,init:clipOK,cfg:{latencyComp:true,seed:seed()}});await wait(500);
    await page.click('#moreBtn');await wait(200);await page.click('[data-nav="summary"]');await wait(400);
    check('更多 → 回診摘要：頁面與標題',await page.isVisible('#p-summary')&&(await page.textContent('#subTitle'))==='回診摘要');
    check('沒有上次回診日：預設今天往前 89 天到今天',(await page.inputValue('#smFrom'))==='2026-08-02'&&(await page.inputValue('#smTo'))===T,[await page.inputValue('#smFrom'),await page.inputValue('#smTo')]);
    const pv=await txt(page,'#smPreview');
    check('預覽：七段都在',['體重（早上）','服藥','劑量','甲狀腺抽血','運動','月經標記','檢查'].every(h=>pv.includes(h)),pv.slice(0,200));
    await page.click('#smCopy');await wait(200);
    const clip=await page.evaluate(()=>window.__clip);
    check('複製文字：剪貼簿拿到摘要文字',typeof clip==='string'&&clip.startsWith('家琳回診摘要 2026/08/02–2026/10/30')&&(await page.textContent('#toastText'))==='已複製');
    await page.click('#smMd');await wait(200);let dl=await page.evaluate(()=>window.__lastDownload);
    check('存成 .md：檔名與內容',dl.filename==='家琳回診摘要-20260802-20261030.md'&&dl.data.startsWith('# 家琳回診摘要'),dl.filename);
    const mdData=dl.data;
    await page.click('#smHtml');await wait(200);dl=await page.evaluate(()=>window.__lastDownload);
    check('存成 .html：完整文件、不連外部資源',dl.filename.endsWith('.html')&&dl.data.startsWith('<!doctype html>')&&!/(src|href)=/i.test(dl.data),dl.filename);
    const line=pv.match(/已記錄服藥 \d+\/\d+ 天/)[0];
    check('預覽、複製、.md、.html 內容一致',[clip,mdData,dl.data].every(x=>x.includes(line)),line);
    await page.fill('#smFrom','2026-10-31');await page.dispatchEvent('#smFrom','change');await wait(200);
    check('期間反向：顯示原因，按鈕停用',(await txt(page,'#smErr'))==='開始日要在結束日之前。'&&await page.isDisabled('#smMd'));
    await page.fill('#smFrom','2026-10-01');await page.dispatchEvent('#smFrom','change');await wait(200);
    await page.click('#smVisit');await wait(300);
    check('設為這次回診日：寫入 lastVisit',(await page.evaluate(()=>window.__mock.store.get('settings/profile').lastVisit))===T);
    await page.click('#toastActs button:has-text("撤銷")');await wait(300);
    check('撤銷：lastVisit 回到沒有',(await page.evaluate(()=>window.__mock.store.get('settings/profile').lastVisit))===null);
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}
  {const s=seed();s['settings/profile']={...s['settings/profile'],lastVisit:'2026-09-15'};
    const {page}=await open({time:NOW,hash:'summary',init:clipNO,cfg:{latencyComp:true,seed:s}});await wait(500);
    check('有上次回診日：從那天開始',(await page.inputValue('#smFrom'))==='2026-09-15');
    await page.click('#smCopy');await wait(200);
    check('剪貼簿被拒：改成選取文字並提示長按複製',await page.isVisible('#smText')&&(await page.inputValue('#smText')).startsWith('家琳回診摘要')&&(await page.textContent('#toastText')).includes('長按複製'));
    await page.context().close()}
  {const s=seed();s['settings/profile']={...s['settings/profile'],lastVisit:'2026-12-01'};
    const {page}=await open({time:NOW,hash:'summary',cfg:{latencyComp:true,seed:s,downloadError:'declined'}});await wait(500);
    check('上次回診日在未來：不用，改用 90 天',(await page.inputValue('#smFrom'))==='2026-08-02');
    await page.click('#smMd');await wait(200);
    check('下載被拒：顯示已取消，不顯示已存',(await page.textContent('#toastText'))==='已取消下載');
    await page.context().close()}
  {const {page}=await open({time:NOW,hash:'summary',cfg:{latencyComp:true,seed:seed(),noDownloads:true}});await wait(500);
    await page.click('#smHtml');await wait(200);
    check('沒有下載能力：提示到 claude.ai 開啟',(await page.textContent('#toastText')).includes('無法下載'));
    await page.context().close()}
  {const {page}=await open({time:NOW,hash:'summary',cfg:{latencyComp:true,seed:seed(),snapDelay:{records:1500}}});await wait(400);
    check('資料還沒載入：顯示載入中，按鈕停用',(await txt(page,'#smPreview'))==='資料載入中…'&&await page.isDisabled('#smCopy'));
    await wait(1500);
    check('載入後：顯示摘要',(await txt(page,'#smPreview')).includes('家琳回診摘要'));
    await page.context().close()}
  for(const scheme of ['light','dark']){
    const s=seed({'meddose/b':md('2026-10-01',75,{tablet:'100 mcg × ½',reason:'TSH 偏高'})});
    const {page}=await open({time:NOW,scheme,hash:'summary',cfg:{latencyComp:true,seed:s}});await wait(500);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    const r=await page.evaluate(`(${scan.toString()})()`);
    check(`380 ${scheme} 回診摘要：沒有水平捲動、觸控目標、對比`,overflow<=0&&!r.small.length&&!r.low.length,{overflow,...r});
    if(!process.argv.includes('--no-shots'))await page.screenshot({path:path.join(SHOTS,`380-${scheme}-summary.png`),fullPage:true});
    await page.context().close()}

  /* B5：匯出與匯入 */
  const full=()=>{const s=seed({'meddose/a':md('2026-10-01',75,{tablet:'100 mcg × ½'}),'meddose/gone':md('2026-09-01',62,{deleted:true}),'system/heartbeat':{at:'2026-10-30T07:20:00+08:00',kind:'morning'}});
    s['days/2026-10-29']={...s['days/2026-10-29'],med:{taken:true,at:'07:20',dose:75,doseSrc:'history',mode:'bedtime',interfere:{coffee:true,iron:false}}};
    s['records/r3']={...s['records/r3'],drawCtx:{medBeforeDraw:'no',biotin7d:'unsure',recheckOf:'a'}};
    s['settings/profile']={...s['settings/profile'],tshRecheckWeeks:6,lastVisit:'2026-09-15'};return s};
  let exported;
  {const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:full()}});await wait(500);
    await page.click('#btnExport');await wait(500);
    exported=JSON.parse(await page.evaluate(()=>window.__lastDownload.data));
    check('匯出：版本 2，包含劑量變更（含已刪除的），不包含 system',exported.version===2&&Object.keys(exported.collections).sort().join()==='days,exercise,meddose,records,settings'&&exported.collections.meddose.gone?.deleted===true,Object.keys(exported.collections));
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:{}}});await wait(500);
    await page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await wait(300);
    check('匯入預覽：列出劑量變更筆數，新備份沒有「比較舊」的警告',(await txt(page,'#impPreview')).includes('劑量變更 2 筆')&&!(await txt(page,'#impPreview')).includes('比用藥功能舊'),await txt(page,'#impPreview'));
    await page.click('#impGo');await page.click('#impGo');await wait(1500);
    const d=await doc('days/2026-10-29'),r3=await doc('records/r3'),p=await doc('settings/profile');
    check('完整往返：服藥細節、劑量來源',JSON.stringify(d.med)===JSON.stringify({taken:true,at:'07:20',dose:75,doseSrc:'history',mode:'bedtime',interfere:{coffee:true,iron:false}}),d.med);
    check('完整往返：抽血情境、複查週數、上次回診日',JSON.stringify(r3.drawCtx)===JSON.stringify({medBeforeDraw:'no',biotin7d:'unsure',recheckOf:'a'})&&p.tshRecheckWeeks===6&&p.lastVisit==='2026-09-15');
    check('完整往返：劑量變更、已刪除的仍是已刪除',(await doc('meddose/a'))?.tablet==='100 mcg × ½'&&(await doc('meddose/gone'))?.deleted===true);
    check('完整往返：沒有寫入 system/heartbeat',!(await doc('system/heartbeat')));
    await page.context().close()}
  {const old={app:'jialin-health',version:1,exportedAt:'2026-09-01T00:00:00Z',collections:{days:{'2026-10-29':{date:'2026-10-29',am:{w:52},med:{taken:true,at:'07:00',dose:50}}}}};
    const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:full()}});await wait(500);
    await page.setInputFiles('#impFile',{name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await wait(300);
    check('舊備份：預覽警告會取代服藥細節、建議先匯出',(await txt(page,'#impPreview')).includes('比用藥功能舊')&&(await txt(page,'#impPreview')).includes('先匯出'));
    await page.click('#impGo');await page.click('#impGo');await wait(800);
    check('舊備份：相同日期的紀錄被備份取代（還原語意），劑量變更保留',!(await doc('days/2026-10-29')).med.mode&&(await doc('meddose/a'))?.dose===75);
    await page.context().close()}

  /* B5：設定頁的劑量 */
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:full()}});await wait(500);
    check('有劑量紀錄：設定頁劑量改成唯讀，顯示目前劑量',!(await page.isVisible('#sDose'))&&(await txt(page,'#sDoseRo'))==='目前 75 mcg'&&await page.isVisible('#sDoseGo'));
    const n0=await page.evaluate(()=>window.__mock.writes.length);
    await page.fill('#sMedNote','睡前');await page.click('#profForm button[type="submit"]');await wait(300);
    const w=await page.evaluate(n=>window.__mock.writes.slice(n).filter(x=>x.path==='settings/profile'),n0);
    check('送出設定：不含 medDose',w.length===1&&!('medDose' in w[0].data)&&w[0].data.medNote==='睡前',w);
    await page.click('#sDoseGo');await wait(300);
    check('到「用藥」頁變更',await page.isVisible('#p-meds'));
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed()}});await wait(500);
    check('沒有劑量紀錄：設定頁劑量照舊可以編輯',await page.isVisible('#sDose')&&!(await page.isVisible('#sDoseRo')));
    await page.fill('#sDose','62');await page.click('#profForm button[type="submit"]');await wait(300);
    check('沒有劑量紀錄：送出時寫入劑量',(await doc('settings/profile')).medDose===62);
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
