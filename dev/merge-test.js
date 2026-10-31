/* C1：建立當天文件的租約（docs/specs/phase-C.md 2.5）。
   取得租約失敗時不可沒有租約就 get → set；只有 runtime 沒有租約時才照舊；租約快到期時不可 set。
   執行：node dev/merge-test.js */
const {open,close,check,summary}=require('./harness');
const T='2026-10-30',P='days/'+T;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tap=(page,sel)=>page.evaluate(s=>document.querySelector(s).click(),sel);
const sets=page=>page.evaluate(p=>window.__mock.writes.filter(w=>w.op==='set'&&w.path===p),P);

(async()=>{
  /* M1 acquire 暫時失敗兩次：重試後存好，而且每一次 set 都在持有租約時 */
  {const {page,doc}=await open({cfg:{latencyComp:true,acquireError:{code:'unavailable',count:2}}});await wait(400);
    await tap(page,'#medBtn');await wait(4000);
    const d=await doc(P),s=await sets(page);
    check('M1 acquire 失敗兩次後重試：服藥有存',d?.med?.taken===true,d);
    check('M1 每一次 set 都持有有效租約（不是他機的）',s.length>0&&s.every(w=>w.lease&&w.lease.valid&&w.lease.holder!=='other-device'),s.map(w=>w.lease));
    await page.context().close()}

  /* M2 acquire 一直失敗：不寫、回報沒有存到 */
  {const {page,doc}=await open({cfg:{latencyComp:true,acquireError:{code:'unavailable',count:99}}});await wait(400);
    await tap(page,'#medBtn');await wait(7000);
    const s=await sets(page),t=await page.textContent('#toastText').catch(()=>'');
    check('M2 acquire 一直失敗：沒有任何 set',s.length===0,s);
    check('M2 acquire 一直失敗：顯示沒有存到',/沒有存到/.test(t),t);
    check('M2 acquire 一直失敗：資料庫沒有這一天',(await doc(P))===null);
    await page.context().close()}

  /* M3 沒有 acquire（runtime 不支援租約）：照舊 get → set，console 有一筆 warn */
  {const {page,doc}=await open({cfg:{latencyComp:true,noAcquire:true}});const warns=[];
    page.on('console',m=>{if(m.type()==='warning')warns.push(m.text())});await wait(400);
    await tap(page,'#medBtn');await wait(1500);await page.click('[data-wslot="am"]').catch(()=>{});
    const d=await doc(P);
    check('M3 沒有 acquire：照舊存好',d?.med?.taken===true,d);
    check('M3 沒有 acquire：console 有提示',warns.some(w=>/租約|lease/i.test(w)),warns);
    await page.context().close()}

  /* M4 acquire 回 capability_removed：當作沒有租約，照舊存好 */
  {const {page,doc}=await open({cfg:{latencyComp:true,acquireError:{code:'capability_removed',count:99}}});await wait(400);
    await tap(page,'#medBtn');await wait(1500);
    check('M4 capability_removed：照舊存好',(await doc(P))?.med?.taken===true,await doc(P));
    await page.context().close()}

  /* M5 取得租約後 get 拖了 8 秒：不可在租約快到期時 set；重新取得租約後才 set */
  {const {page,doc}=await open({install:true,cfg:{latencyComp:true,getDelay:{[P]:8000}}});await page.clock.runFor(500);
    await tap(page,'#medBtn');await page.clock.runFor(20000);
    const d=await doc(P),s=await sets(page);
    check('M5 get 很慢：最後仍存好',d?.med?.taken===true,d);
    check('M5 get 很慢：每一次 set 都在有效租約內',s.length>0&&s.every(w=>w.lease&&w.lease.valid),s.map(w=>w.lease));
    await page.context().close()}

  /* M6 他機正在建立（持有租約）：等它建立後合併，兩邊欄位都在（原 H1 的情境，修改後仍成立） */
  {const {page,doc}=await open({cfg:{latencyComp:true,latency:50}});await wait(400);
    await page.evaluate(p=>window.__mock.holdLease(p,3000),P);
    await tap(page,'#medBtn');await wait(250);
    await page.evaluate(([p,b])=>{window.__mock.silentSet(p,b);window.__mock.releaseLease(p)},[P,{date:T,am:{w:52.3,bf:null,at:'07:00'}}]);
    await wait(2500);const d=await doc(P);
    check('M6 他機持有租約時：兩邊的欄位都保留',d?.am?.w===52.3&&d?.med?.taken===true,d);
    await page.context().close()}

  /* M7（程式審查 C2，使用者選乙）：這台建立當天之後，另一台遲到的建立整份蓋掉它；約 12 秒後重讀，補回整個不見的欄位 */
  {const {page,doc}=await open({install:true,cfg:{latencyComp:true}});await page.clock.runFor(800);
    await tap(page,'#medBtn');await page.clock.runFor(1500);
    check('M7 前提：這台建立了當天，有服藥',(await doc(P))?.med?.taken===true);
    await page.evaluate(([p,b])=>window.__mock.externalSet(p,b),[P,{date:T,am:{w:52.3,bf:null,at:'07:00'}}]); // 另一台遲到的 set 落地
    await page.clock.runFor(3000);
    check('M7 遲到的建立剛落地：服藥暫時不見了（重現審查的情境）',!(await doc(P))?.med,await doc(P));
    await page.clock.runFor(10000);
    const d=await doc(P);
    check('M7 約 12 秒後重讀：補回服藥，另一台的早上體重也保留',d?.med?.taken===true&&d?.am?.w===52.3,d);
    await page.context().close()}
  /* M8 核對只補「整個不見」的欄位：另一台之後改了同一個欄位的值，不蓋回去；沒有建立文件時不核對 */
  {const {page,doc}=await open({install:true,cfg:{latencyComp:true}});await page.clock.runFor(800);
    await tap(page,'#medBtn');await page.clock.runFor(1500);
    await page.evaluate(([p])=>{const d=JSON.parse(JSON.stringify(window.__mock.store.get(p)));d.med={...d.med,at:'09:00',mode:'bedtime'};window.__mock.externalSet(p,d)},[P]);
    await page.clock.runFor(13000);
    check('M8 另一台之後改了同一個欄位：不蓋回去',(await doc(P))?.med?.at==='09:00'&&(await doc(P)).med.mode==='bedtime',(await doc(P))?.med);
    await page.context().close()}
  {const {page}=await open({install:true,cfg:{latencyComp:true,seed:{[P]:{date:T}}}});await page.clock.runFor(800);
    await tap(page,'#medBtn');await page.clock.runFor(14000);
    check('M8 文件本來就存在（只有 update）：之後不再多讀一次',(await page.evaluate(p=>window.__mock.reads.filter(x=>x===p).length,P))===0);
    await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
