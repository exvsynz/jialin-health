/* C 階段：設定頁的飲食（提醒開關、估算狀態、縮圖用量、清除舊縮圖）、匯出 v3 與匯入合併（Playwright + mock）。合成資料。
   執行：node dev/meal-setup-test.js */
const {open,close,check,summary}=require('./harness');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tap=(page,sel)=>page.evaluate(s=>document.querySelector(s).click(),sel);
const txt=(page,sel)=>page.textContent(sel).catch(()=>'');
const NOW='2026-10-30T12:40:00+08:00',T='2026-10-30';
const TH='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const done=(lo,hi)=>({a:{status:'done',startedAt:1,at:2,kcalLo:lo,kcalHi:hi,desc:'便當',items:[],confidence:'mid',note:''}});
const meal=(at,o={})=>({at:Date.parse(at),meal:'lunch',src:'camera',thumb:true,thumbBytes:20000,note:'',createdAt:1,attempts:done(400,600),...o});
/* 三天、四餐、三張縮圖：9 月兩張、10 月一張 */
function seed(){return{
  'days/2026-09-10':{date:'2026-09-10',meals:{s1:meal('2026-09-10T12:00:00+08:00'),s2:meal('2026-09-10T19:00:00+08:00',{thumb:false,thumbBytes:0})}},
  'days/2026-09-20':{date:'2026-09-20',meals:{s3:meal('2026-09-20T12:00:00+08:00',{thumbBytes:30000})}},
  'days/2026-10-29':{date:'2026-10-29',am:{w:52,bf:null,at:'07:00'},meals:{o1:meal('2026-10-29T12:00:00+08:00',{thumbBytes:40000})}},
  'mealthumbs/s1':{date:'2026-09-10',thumb:TH,createdAt:1},'mealthumbs/s3':{date:'2026-09-20',thumb:TH,createdAt:1},'mealthumbs/o1':{date:'2026-10-29',thumb:TH,createdAt:1},
  'settings/profile':{medName:'Levothyroxine',medDose:50,lastExport:'2026/10/01',remind:{morning:false}}}}

(async()=>{
  /* 提醒開關與兩行狀態 */
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed(),sample:{images:{maxCount:3,maxInputBytes:5242880,mediaTypes:['image/jpeg']}}}});await wait(800);
    check('飲食提醒：沒有 remind.food 時是關閉',await page.$eval('[data-remind="food"]',i=>!i.checked));
    await page.click('[data-remind="food"]');await wait(600);
    const p=await doc('settings/profile'),last=await page.evaluate(()=>window.__mock.writes.slice(-1)[0].data);
    check('飲食提醒：只寫 remind.food，其他開關保留',p.remind.food===true&&p.remind.morning===false&&JSON.stringify(last.remind)==='{"food":true}',{remind:p.remind,last});
    check('估算狀態：可以使用，張數與大小取自 limits',(await txt(page,'#mealCap'))==='照片估算：可以使用（每次最多 3 張，單張上限 5.0 MB）',await txt(page,'#mealCap'));
    check('縮圖用量：只算 thumb:true 的（含 thumbBytes）',(await txt(page,'#mealUse'))==='縮圖約 0.09 MB（3 張）',await txt(page,'#mealUse'));
    await page.context().close()}
  {const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,sample:{absent:true}}});await wait(800);
    check('估算狀態：不能用時寫「這個檢視無法使用」',(await txt(page,'#mealCap'))==='照片估算：這個檢視無法使用');
    await page.context().close()}

  /* 清除舊縮圖：按兩次、只刪所選月份以前、文字保留、失敗有計數 */
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed(),failPath:{prefix:'mealthumbs/s3',code:'invalid_argument',count:9}}});await wait(800);
    check('沒選月份：清除鍵停用',await page.$eval('#thClear',b=>b.disabled));
    await page.fill('#thMonth','2026-10');await wait(200);
    check('選 2026/10：顯示 10 月以前 2 張與上次匯出',(await txt(page,'#thInfo'))==='2026/10 以前有 2 張縮圖，約 0.05 MB。上次匯出：2026/10/01',await txt(page,'#thInfo'));
    await tap(page,'#thClear');await wait(200);
    check('第一次按：只是預備，沒有刪除',(await txt(page,'#thClear'))==='再按一次清除 2 張'&&!!(await doc('mealthumbs/s1')));
    await tap(page,'#thClear');await wait(1500);
    const d=await doc('days/2026-09-10');
    check('第二次按：刪掉 9 月的縮圖，10 月的保留',!(await doc('mealthumbs/s1'))&&!!(await doc('mealthumbs/o1')),null);
    check('刪除失敗的有計數',/已清除 1 張縮圖，1 張失敗/.test(await txt(page,'#toastText')),await txt(page,'#toastText'));
    check('清除後：餐點的文字與熱量保留，標 thumbCleared、thumb:false；失敗的那張不標',d.meals.s1.thumbCleared===true&&d.meals.s1.thumb===false&&d.meals.s1.attempts.a.kcalLo===400&&!(await doc('days/2026-09-20')).meals.s3.thumbCleared,d.meals.s1);
    await page.evaluate(()=>{location.hash='meals'});await wait(400);await page.evaluate(()=>openMeal('s1','2026-09-10'));await wait(400);
    check('單餐畫面：寫出「縮圖已清除」',(await txt(page,'#mInfo')).includes('縮圖已清除'),await txt(page,'#mInfo'));
    await page.context().close()}

  /* 匯出 v3：縮圖依 id 讀、完整性標記、檔名；缺圖；too_large 改匯出不含縮圖 */
  let full=null;
  {const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed()}});await wait(800);
    await tap(page,'#btnExport');await wait(1200);full=JSON.parse(await page.evaluate(()=>window.__lastDownload.data));
    const r=await page.evaluate(()=>({reads:window.__mock.reads.filter(p=>p.includes('mealthumbs')),name:window.__lastDownload.filename}));
    check('匯出：version 3，mealthumbs 有 3 張，thumbs.included 是 all',full.version===3&&Object.keys(full.collections.mealthumbs).sort().join()==='o1,s1,s3'&&full.thumbs.included==='all',full.thumbs);
    check('匯出：縮圖依 id 用 get 讀，不查詢集合',r.reads.length===3&&r.reads.every(p=>p.startsWith('mealthumbs/')),r.reads);
    check('匯出：檔名沒有標記',r.name==='家琳健康追蹤備份-2026-10-30.json',r.name);
    await page.context().close()}
  {const s=seed();delete s['mealthumbs/s3'];
    const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:s}});await wait(800);
    await tap(page,'#btnExport');await wait(1200);const o=JSON.parse(await page.evaluate(()=>window.__lastDownload.data));
    check('缺圖：thumbs 是 partial、列出缺的 id，檔名標張數，提示',o.thumbs.included==='partial'&&o.thumbs.missing.join()==='s3'&&(await page.evaluate(()=>window.__lastDownload.filename))==='家琳健康追蹤備份-2026-10-30-缺1張縮圖.json'&&/有 1 張縮圖沒有匯出/.test(await txt(page,'#toastText')),o.thumbs);
    await page.context().close()}
  {const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed(),downloadError:'too_large',downloadErrorCount:1}});await wait(800);
    await tap(page,'#btnExport');await wait(1200);
    check('too_large：提示檔案太大，提供「匯出（不含縮圖）」',(await txt(page,'#toastText'))==='檔案太大'&&(await txt(page,'#toastActs'))==='匯出（不含縮圖）');
    await page.click('#toastActs button');await wait(1000);const o=JSON.parse(await page.evaluate(()=>window.__lastDownload.data));
    check('不含縮圖的匯出：thumbs.included 是 none，沒有 mealthumbs，檔名標出',o.thumbs.included==='none'&&!o.collections.mealthumbs&&(await page.evaluate(()=>window.__lastDownload.filename)).endsWith('-不含縮圖.json'),o.thumbs);
    await page.context().close()}

  /* 匯入：days 合併；同 id 回退的預覽；匯入中另一台加的餐點與晚到的估算保留；縮圖 */
  {const cur=seed();
    cur['days/2026-10-29'].meals.o1={...cur['days/2026-10-29'].meals.o1,manual:{kcalLo:999,kcalHi:999,at:5},deleted:true};
    cur['days/2026-10-29'].meals.n1=meal('2026-10-29T19:00:00+08:00',{thumb:false});
    const bk=JSON.parse(JSON.stringify(full));
    for(let i=1;i<=6;i++){const d='2026-08-0'+i;bk.collections.days[d]={date:d,am:{w:51,bf:null,at:'07:00'}}}
    const keys=Object.keys(bk.collections.days).filter(k=>k!=='2026-10-29');const last=bk.collections.days['2026-10-29'];
    bk.collections.days=Object.fromEntries([...keys.map(k=>[k,bk.collections.days[k]]),['2026-10-29',last]]); // the day with meals goes last
    const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,latency:120,seed:cur}});await wait(1500);
    await page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bk))});await wait(400);
    const pv=await txt(page,'#impPreview');
    check('匯入預覽：餐數與縮圖張數、合併的說明',pv.includes('飲食 4 餐、縮圖 3 張')&&pv.includes('日紀錄會合併')&&pv.includes('之後新增的餐點'),pv);
    check('匯入預覽：備份的 o1 沒有 manual、deleted 欄位，不算回退',!pv.includes('改回備份時的內容'),pv);
    await tap(page,'#impGo');await tap(page,'#impGo');await wait(200);
    /* 匯入進行中：另一台在同一天加了一餐，另一個估算結果也晚到 */
    await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(window.__mock.store.get('days/2026-10-29')));d.meals.x9={at:Date.parse('2026-10-29T21:00:00+08:00'),meal:'snack',src:'camera',thumb:false,note:'',createdAt:9,attempts:{}};
      d.meals.n1.attempts.late={status:'done',startedAt:9,at:10,kcalLo:100,kcalHi:120,desc:'晚到',items:[],confidence:'low',note:''};window.__mock.externalSet('days/2026-10-29',d)});
    await wait(9000);
    const d=await doc('days/2026-10-29');
    check('匯入後：備份之後才加的餐點（n1、匯入中另一台加的 x9）都保留',!!d.meals.n1&&!!d.meals.x9,Object.keys(d.meals));
    check('匯入後：晚到的估算結果留在自己的 key',d.meals.n1.attempts.late?.status==='done');
    check('匯入後：備份沒有的欄位保留，o1 仍是刪除、手動值仍在（合併，較新的動作不會被抹掉）',d.meals.o1.deleted===true&&d.meals.o1.manual?.kcalLo===999,{deleted:d.meals.o1.deleted,manual:d.meals.o1.manual});
    check('匯入後：備份裡沒有的欄位保留（早上體重）',d.am?.w===52);
    check('匯入後：縮圖都在，沒有殘缺餐點',!!(await doc('mealthumbs/s3'))&&Object.values(d.meals).every(m=>Number.isFinite(m.at)));
    await page.context().close()}
  /* 備份明確有 deleted:false 與不同的手動值：預覽列出回退，匯入後改回 */
  {const cur=seed();cur['days/2026-10-29'].meals.o1={...cur['days/2026-10-29'].meals.o1,manual:{kcalLo:999,kcalHi:999,at:5},deleted:true};
    const bk=JSON.parse(JSON.stringify(full));Object.assign(bk.collections.days['2026-10-29'].meals.o1,{deleted:false,manual:{kcalLo:450,kcalHi:450,at:1}});
    const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:cur}});await wait(800);
    await page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bk))});await wait(300);
    const pv=await txt(page,'#impPreview');
    check('備份有 deleted:false 與不同手動值：預覽寫出回退與會回來的刪除',pv.includes('1 餐會改回備份時的內容（其中 1 餐是目前已刪除、匯入後會回來）'),pv);
    await tap(page,'#impGo');await tap(page,'#impGo');await wait(2500);const o1=(await doc('days/2026-10-29')).meals.o1;
    check('匯入後：o1 回來、手動值改回備份的',o1.deleted===false&&o1.manual.kcalLo===450,o1);
    await page.context().close()}
  /* 缺圖備份還原：空資料庫 → 餐點在、縮圖空框；已有縮圖的資料庫 → 縮圖保留 */
  {const bk=JSON.parse(JSON.stringify(full));delete bk.collections.mealthumbs.s3;bk.thumbs={included:'partial',missing:['s3']};
    for(const [name,sd] of [['空資料庫',{}],['已有那張縮圖',{'mealthumbs/s3':{date:'2026-09-20',thumb:TH,createdAt:1}}]]){
      const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:sd}});await wait(800);
      await page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bk))});await wait(300);
      const pv=await txt(page,'#impPreview');
      await tap(page,'#impGo');await tap(page,'#impGo');await wait(2500);
      check('缺圖備份還原到'+name+'：預覽寫出缺 1 張，餐點都在',pv.includes('這份備份缺 1 張縮圖')&&!!(await doc('days/2026-09-20'))?.meals?.s3,pv);
      check('缺圖備份還原到'+name+'：s3 的縮圖'+(sd['mealthumbs/s3']?'保留':'不存在'),!!(await doc('mealthumbs/s3'))===!!sd['mealthumbs/s3']);
      await page.context().close()}}
  {const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,failPath:{prefix:'mealthumbs/o1',code:'invalid_argument',count:9}}});await wait(800);
    await page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(full))});await wait(300);
    await tap(page,'#impGo');await tap(page,'#impGo');await wait(2500);
    check('匯入時縮圖寫入失敗：有計數，餐點照樣匯入',/1 筆失敗/.test(await txt(page,'#toastText'))&&!!(await doc('days/2026-10-29'))?.meals?.o1,await txt(page,'#toastText'));
    await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
