/* C 階段程式審查（docs/reviews/2026-10-31-phase-C-code-independent-review.md）C1、C3–C8 的重現。先在修改前的版本失敗，修正後通過。合成資料。
   執行：node dev/review-c-test.js */
const {open,close,check,summary}=require('./harness');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tap=(page,sel)=>page.evaluate(s=>document.querySelector(s).click(),sel);
const txt=(page,sel)=>page.textContent(sel).catch(()=>'');
const NOW='2026-10-30T12:40:00+08:00',NOWMS=Date.parse(NOW),T='2026-10-30';
const TH='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const done={a:{status:'done',startedAt:1,at:2,kcalLo:400,kcalHi:600,desc:'便當',items:[],confidence:'mid',note:''}};
const meal=(o={})=>({at:Date.parse('2026-10-29T12:00:00+08:00'),meal:'lunch',src:'camera',thumb:true,thumbBytes:20000,note:'',createdAt:1,attempts:done,...o});
async function exportNow(page){await page.evaluate(()=>{delete window.__lastDownload});await tap(page,'#btnExport');for(let i=0;i<40;i++){if(await page.evaluate(()=>!!window.__lastDownload))break;await wait(100)}return JSON.parse(await page.evaluate(()=>window.__lastDownload.data))}
async function importNow(page,bk){await page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bk))});await wait(300);await tap(page,'#impGo');await tap(page,'#impGo');await wait(2500)}
async function photo(page){const b64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#c98b3a';x.fillRect(0,0,800,600);return c.toDataURL('image/jpeg',0.9).split(',')[1]});return{name:'m.jpg',mimeType:'image/jpeg',buffer:Buffer.from(b64,'base64')}}

(async()=>{
  /* C1-1：清除舊縮圖後，再匯入清除前的完整備份：縮圖回來了，旗標也要回來；之後的完整匯出要包含它 */
  {const before={'days/2026-10-29':{date:'2026-10-29',meals:{k1:meal()}},'mealthumbs/k1':{date:'2026-10-29',thumb:TH,createdAt:1}};
    const bk={app:'jialin-health',version:3,exportedAt:'2026-10-29T00:00:00Z',thumbs:{included:'all'},collections:{days:{'2026-10-29':before['days/2026-10-29']},mealthumbs:{k1:before['mealthumbs/k1']}}};
    const now={'days/2026-10-29':{date:'2026-10-29',meals:{k1:meal({thumb:false,thumbCleared:true})}}};
    const {page,doc}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:now}});await wait(800);
    await importNow(page,bk);
    const m=(await doc('days/2026-10-29')).meals.k1;
    check('C1-1 匯入縮圖成功後，餐點旗標改成 thumb:true、thumbCleared:false',m.thumb===true&&m.thumbCleared===false,{thumb:m.thumb,thumbCleared:m.thumbCleared});
    const o=await exportNow(page);
    check('C1-1 之後的完整匯出包含這張縮圖，而且標 all',!!o.collections.mealthumbs?.k1&&o.thumbs.included==='all',{th:Object.keys(o.collections.mealthumbs||{}),thumbs:o.thumbs});
    await page.fill('#thMonth','2026-11');await wait(200);
    check('C1-1 清除工具看得到這張縮圖',(await txt(page,'#thInfo')).startsWith('2026/11 以前有 1 張'),await txt(page,'#thInfo'));
    await page.context().close()}
  /* C1-2：縮圖寫入成功、thumb:true 旗標沒送出就關頁：重新開啟後，匯出仍要讀到它 */
  {const sd={'days/2026-10-29':{date:'2026-10-29',meals:{k2:meal({thumb:false}),k3:meal({thumb:false,thumbBytes:0})}},'mealthumbs/k2':{date:'2026-10-29',thumb:TH,createdAt:1}};
    const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:sd}});await wait(800);
    const o=await exportNow(page),reads=await page.evaluate(()=>window.__mock.reads.filter(p=>p.startsWith('mealthumbs/')));
    check('C1-2 旗標沒寫成但縮圖存在：匯出包含它，標 all',!!o.collections.mealthumbs?.k2&&o.thumbs.included==='all',{th:Object.keys(o.collections.mealthumbs||{}),thumbs:o.thumbs});
    check('C1-2 從來沒有縮圖的餐點（thumbBytes 0）不讀',!reads.includes('mealthumbs/k3'),reads);
    await page.fill('#thMonth','2026-11');await wait(200);
    check('C1-2 清除工具也看得到旗標不一致的那張',(await txt(page,'#thInfo')).startsWith('2026/11 以前有 1 張'),await txt(page,'#thInfo'));
    await page.context().close()}

  /* C3：估算還在進行時匯出，估算完成後匯入那份備份：完成的估算不能退回 pending */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{delay:2500}}});await wait(700);
    const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.click('#mealSnap')]);await fc.setFiles(await photo(page));await wait(1200);
    await page.evaluate(()=>{location.hash='setup'});await wait(400);const bk=await exportNow(page);
    await wait(2500);
    const id=Object.keys((await doc('days/'+T)).meals)[0],before=Object.values((await doc('days/'+T)).meals[id].attempts)[0];
    await importNow(page,bk);
    const after=Object.values((await doc('days/'+T)).meals[id].attempts)[0];
    await page.evaluate(()=>{location.hash='meals'});await wait(500);
    check('C3 前提：匯入前這次估算已完成',before.status==='done',before.status);
    check('C3 匯入估算中的備份後：同一次估算仍是完成，熱量仍顯示',after.status==='done'&&/約 550–780 kcal/.test(await txt(page,'#mealDays')),{after:after.status,t:await txt(page,'#mealDays')});
    await page.context().close()}

  /* C4：重新估算沒有開始（沒有照片），補充說明不能被當成已存 */
  {const sd={['days/'+T]:{date:T,meals:{n1:meal({at:Date.parse(T+'T12:00:00+08:00'),thumb:false,thumbBytes:0})}}};
    const {page,doc}=await open({time:NOW,hash:'meals',cfg:{latencyComp:true,seed:sd}});await wait(800);
    await tap(page,'[data-mo="n1"]');await wait(300);await page.fill('#mNote','half bowl');await wait(100);
    await tap(page,'#mReest');await wait(600);
    check('C4 前提：提示沒有照片可以估算',/沒有照片可以估算/.test(await txt(page,'#toastText')),await txt(page,'#toastText'));
    await tap(page,'#mSave');await wait(700);
    check('C4 之後按儲存：補充說明有存進去',(await doc('days/'+T)).meals.n1.note==='half bowl',(await doc('days/'+T)).meals.n1.note);
    await page.context().close()}

  /* C5：估算中 5 分鐘、沒有新的快照，時間跨過 6 分鐘後，畫面自己變成「很久沒有更新」 */
  {const sd={['days/'+T]:{date:T,meals:{q1:meal({at:Date.parse(T+'T12:00:00+08:00'),attempts:{p:{status:'pending',startedAt:NOWMS-5*60000,imgSrc:'photo',note:''}}})}}};
    const {page}=await open({time:NOW,hash:'meals',install:true,cfg:{latencyComp:true,seed:sd}});await page.clock.runFor(1500);
    check('C5 前提：5 分鐘時顯示「估算中…」',/估算中…/.test(await txt(page,'#mealDays')));
    await page.clock.runFor(130000);
    check('C5 跨過 6 分鐘：不用切頁就顯示「很久沒有更新」與「重新估算」',/估算很久沒有更新/.test(await txt(page,'#mealDays'))&&!!(await page.$('[data-retry]')),await txt(page,'#mealDays'));
    await page.context().close()}

  /* C6：mock 的同意視窗：第一次呼叫在等待同意時取消，第二次呼叫仍要等同一個同意決定；最後拒絕時第二次也不能到上游 */
  {const {page}=await open({time:NOW,cfg:{sample:{consent:{wait:1000,answer:'deny'}}}});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const ctl=new AbortController();const p1=s('一',{signal:ctl.signal});setTimeout(()=>ctl.abort(),30);
      const e1=await p1.catch(e=>e.code);const t=performance.now();const e2=await s('二').catch(e=>e.code);return{e1,e2,ms:performance.now()-t,ups:window.__mock.sampleCalls.filter(c=>c.upstream).length}});
    check('C6 第一次取消：cancelled',r.e1==='cancelled',r);
    check('C6 第二次等同一個同意視窗，被拒絕就 not_granted，沒有到上游',r.e2==='not_granted'&&r.ms>=800&&r.ups===0,r);
    await page.context().close()}
  {const {page}=await open({time:NOW,cfg:{sample:{consent:{wait:1000}}}});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const ctl=new AbortController();const p1=s('一',{signal:ctl.signal});setTimeout(()=>ctl.abort(),30);
      await p1.catch(()=>0);const t=performance.now();const ok=await s('二');return{ms:performance.now()-t,ok:!!ok.text}});
    check('C6 同意之後：第二次在同意前不會先送出',r.ok&&r.ms>=800,r);
    await page.context().close()}

  /* C7：飲食提醒的成功訊息 */
  {const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true}});await wait(800);
    await page.click('[data-remind="food"]');await wait(600);
    check('C7 切換飲食提醒：訊息是「已開啟飲食提醒」',(await txt(page,'#toastText'))==='已開啟飲食提醒',await txt(page,'#toastText'));
    await page.context().close()}

  /* C8：「湯底」的出處 Nakagawa 2026a 列在第三段 */
  {const {page}=await open({time:NOW,hash:'meals',cfg:{latencyComp:true}});await wait(500);
    const p3=await page.evaluate(()=>document.querySelectorAll('#mealRef p')[2].textContent);
    check('C8 第三段列出 Nakagawa 2026a（doi:10.3390/nu18122017）',p3.includes('湯底')&&p3.includes('doi:10.3390/nu18122017'),p3);
    await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
