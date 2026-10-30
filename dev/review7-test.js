/* 第 7 批：使用者決定的甲狀腺分類（依 ATA 2015 Rec 23–24）、Q5 首屏不顯示差值、Q6 完成定義。
   執行：node dev/review7-test.js */
const {open,close,sampleSeed,check,summary}=require('./harness');
const T='2026-10-30';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const rec=(preset,interval,extra={})=>({exam:'thy_us',cat:'thyroid',date:'2026-10-01',preset,interval,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{},createdAt:1,updatedAt:1,...extra});

(async()=>{
  /* 甲狀腺：無結節、≤1 cm 極低懷疑不自動排日期；>1 cm 極低懷疑 24 個月；穿刺良性＋高度懷疑要提醒穿刺 */
  {const {page,doc}=await open({hash:'exams',cfg:{latencyComp:true,seed:{...sampleSeed(T),'records/r1':rec('none',null)}}});await wait(500);
    const card=await page.textContent('#cats');
    check('無結節：卡片顯示不需例行追蹤',card.includes('不需例行追蹤'),card.slice(card.indexOf('甲狀腺超音波'),card.indexOf('甲狀腺超音波')+80));
    check('無結節：不出現在首頁到期卡',!(await page.evaluate(()=>{location.hash='today';return new Promise(r=>setTimeout(()=>r(document.querySelector('#examSlot').textContent.includes('甲狀腺超音波')),300))})));
    await page.evaluate(()=>location.hash='exams');await wait(200);
    await page.click('[data-add="thy_us"]');await wait(200);
    await page.selectOption('#fPreset','none');await wait(100);
    check('無結節：選了不自動帶間隔',(await page.inputValue('#fInterval'))==='',await page.inputValue('#fInterval'));
    check('無結節：預覽寫明不排例行追蹤',(await page.textContent('#duePreview')).includes('不排例行追蹤'),await page.textContent('#duePreview'));
    await page.click('#btnSave');await wait(400);
    const saved=await page.evaluate(()=>[...window.__mock.store.entries()].filter(([k,v])=>k.startsWith('records/')&&v.exam==='thy_us'&&v.preset==='none'&&v.createdAt>1).map(([,v])=>v));
    check('無結節：不填間隔也能儲存，間隔存 null',saved.length===1&&saved[0].interval===null,saved);
    await page.click('[data-add="thy_us"]');await wait(200);
    const opts=await page.$$eval('#fPreset option',o=>o.map(x=>x.value+':'+x.textContent));
    check('極低懷疑拆成 ≤1 cm 與 >1 cm',opts.some(o=>o.startsWith('vlowSmall:')&&o.includes('≤1 cm'))&&opts.some(o=>o.startsWith('vlow:')&&o.includes('>1 cm')),opts);
    await page.selectOption('#fPreset','vlowSmall');await wait(100);
    check('≤1 cm 極低懷疑：不自動帶間隔',(await page.inputValue('#fInterval'))==='');
    await page.selectOption('#fPreset','vlow');await wait(100);
    check('>1 cm 極低懷疑：24 個月，依據寫 ≥24',(await page.inputValue('#fInterval'))==='24'&&(await page.textContent('#presetHint')).includes('≥24'),await page.textContent('#presetHint'));
    await page.selectOption('#fPreset','fnaHigh');await wait(100);
    check('穿刺良性＋高度懷疑：提醒重做穿刺',(await page.textContent('#presetHint')).includes('穿刺')&&(await page.inputValue('#fInterval'))==='12',await page.textContent('#presetHint'));
    await page.context().close()}

  /* 舊紀錄相容：舊的 vlow 紀錄仍是 24 個月 */
  {const {page}=await open({hash:'exams',cfg:{latencyComp:true,seed:{'records/r1':rec('vlow',24)}}});await wait(500);
    check('舊的 vlow 紀錄仍排 24 個月後',(await page.textContent('#cats')).includes('2028/10/01'));
    await page.context().close()}

  /* Q5：首屏完成後的事實不顯示升降差值 */
  {const {page}=await open({time:T+'T20:30:00+08:00',cfg:{latencyComp:true,seed:sampleSeed(T)}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(300);await page.click('#wsSave');await wait(300);
    await page.click('[data-wslot="pm"]');await wait(300);await page.click('[data-step="1"]');await page.click('#wsSave');await wait(300);
    await page.click('#medBtn');await wait(400);
    const fact=await page.textContent('#fact');
    check('Q5 首屏事實不含升降比較',fact&&!/比前一週|多 |少 |持平/.test(fact),fact);
    await page.context().close()}

  /* Q6：過去日期需要早上＋服藥＋晚上，週點與大標一致 */
  {const seed={'days/2026-10-28':{date:'2026-10-28',am:{w:52,bf:null,at:'07:00'},med:{taken:true,at:'07:00',dose:50}},
               'days/2026-10-27':{date:'2026-10-27',am:{w:52,bf:null,at:'07:00'},med:{taken:true,at:'07:00',dose:50},pm:{w:52.5,bf:null,at:'22:00'}}};
    const {page}=await open({cfg:{latencyComp:true,seed}});await wait(500);
    const dot=d=>page.evaluate(d=>document.querySelector(`[data-day="${d}"] .wdot`).className,d);
    check('Q6 缺晚上體重的過去日期：週點不是全滿',!(await dot('2026-10-28')).includes('full'),await dot('2026-10-28'));
    check('Q6 三項都有的過去日期：週點全滿',(await dot('2026-10-27')).includes('full'),await dot('2026-10-27'));
    await page.click('[data-day="2026-10-28"]');await wait(200);
    check('Q6 大標同樣顯示還差 1 項',(await page.textContent('#headline')).includes('還差 1 項'));
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
