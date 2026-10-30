/* B 階段 GPT 程式審查（docs/reviews/2026-10-30-phase-B-code-review-gpt.md）第 1–9 點的回歸測試。合成資料。
   每一點都先在修正前的程式上失敗，修正後通過。執行：node dev/review-b-test.js */
const {open,close,sampleSeed,check,summary}=require('./harness');
const T='2026-10-30',NOW=T+'T08:00:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const seed=(extra={})=>({...sampleSeed(T),...extra});
const md=(date,dose,o={})=>({kind:'dose',date,dose,tablet:'',brand:'',reason:'',note:'',createdAt:1,updatedAt:1,deleted:false,...o});
const txt=(page,s)=>page.evaluate(s=>{const e=document.querySelector(s);return e&&!e.hidden?e.textContent:null},s);

(async()=>{
  /* 第 1 點：編輯抽血保留表單沒有顯示的巢狀欄位 */
  {const s=seed();s['records/r3']={...s['records/r3'],labs:{TSH:'2.1','Free T4':'1.2',T3:'98',Custom:'x'},drawCtx:{biotin7d:'yes',labNote:'keep'}};
    const {page,doc}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:s}});await wait(500);
    await page.evaluate(()=>openRecord('thy_lab',records.find(r=>r.id==='r3')));await wait(200);
    await page.fill('[data-lab="TSH"]','3.4');await page.fill('[data-lab="T3"]','');await page.click('#btnSave');await wait(300);
    const r=await doc('records/r3');
    check('第 1 點：表單管理的檢驗值照改，清空的刪除',r.labs.TSH==='3.4'&&!('T3' in r.labs)&&r.labs['Free T4']==='1.2',r.labs);
    check('第 1 點：labs 裡表單沒有的 key 保留',r.labs.Custom==='x',r.labs);
    check('第 1 點：drawCtx 裡表單沒有的 key 保留',r.drawCtx?.labNote==='keep'&&r.drawCtx?.biotin7d==='yes',r.drawCtx);
    await page.context().close()}

  /* 第 7 點：切換檢查種類時清除抽血情境的暫存 */
  {const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:seed({'meddose/m2':md('2026-10-01',75)})}});await wait(500);
    await page.evaluate(()=>openRecord('thy_lab'));await wait(200);
    await page.click('[data-ctx="biotin7d"] [data-v="yes"]');await page.click('#fRecheck');
    await page.selectOption('#fExam','thy_us');await wait(100);await page.selectOption('#fExam','thy_lab');await wait(100);
    check('第 7 點：切走再切回，情境回到未填',await page.evaluate(()=>[...document.querySelectorAll('#ctxWrap [aria-pressed="true"]')].length)===0);
    check('第 7 點：切走再切回，複查切換鍵依日期重新預設（開）',await page.isChecked('#fRecheck'));
    await page.context().close()}

  /* 第 8 點：已有一次複查完成後，另一筆抽血仍可連到同一次變更 */
  {const s=seed({'meddose/m2':md('2026-10-01',75)});s['records/rc']={exam:'thy_lab',cat:'thyroid',date:'2026-10-20',preset:null,interval:6,nextDue:null,labs:{TSH:'2.0'},drawCtx:{recheckOf:'m2'},createdAt:5,updatedAt:5};
    const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:{...s,'settings/profile':{...s['settings/profile'],tshRecheckWeeks:4}}}});await wait(500);
    await page.evaluate(()=>openRecord('thy_lab'));await wait(200);
    check('第 8 點：複查已完成時，新抽血仍顯示切換鍵',await page.isVisible('#rcRow'),await txt(page,'#rcLabel'));
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
