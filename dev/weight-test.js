/* 體重面板：第一次使用、「和上次一樣」、晚上估計值、刻度尺連按。
   執行：node dev/weight-test.js */
const {open,close,sampleSeed,check,summary}=require('./harness');
const T='2026-10-30';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const sheet=page=>page.evaluate(()=>({
  big:document.querySelector('#wsBig').textContent.trim(),
  save:document.querySelector('#wsSave').textContent.trim(),
  saveDisabled:document.querySelector('#wsSave').disabled,
  rulerShown:getComputedStyle(document.querySelector('#ruler')).display!=='none'&&!document.querySelector('#ruler').closest('[hidden]'),
  kbdShown:!document.querySelector('#kbdRow').hidden,
  kbdFocused:document.activeElement===document.querySelector('#kbdIn')}));

(async()=>{
  /* 1. 第一次使用：沒有任何體重紀錄 */
  {const {page,doc,errors}=await open({cfg:{latencyComp:true}});await wait(500);
    const cells=await page.$$eval('[data-wslot] .big',els=>els.map(e=>e.textContent));
    check('第一次使用：首頁兩格顯示「—」',cells.every(t=>t.startsWith('—')),cells);
    await page.click('[data-wslot="am"]');await wait(300);
    let s=await sheet(page);
    check('第一次使用：直接開鍵盤並聚焦',s.kbdShown&&s.kbdFocused,s);
    check('第一次使用：刻度尺先不顯示',!s.rulerShown,s);
    check('第一次使用：輸入前不能記下',s.saveDisabled,s);
    await page.fill('#kbdIn','51.4');await page.dispatchEvent('#kbdIn','change');await wait(300);
    s=await sheet(page);
    check('第一次使用：輸入後顯示刻度尺與數值',s.rulerShown&&s.big.startsWith('51.4'),s);
    check('第一次使用：輸入後可以記下',!s.saveDisabled&&s.save.includes('51.4'),s);
    const bf=await page.evaluate(()=>({row:document.querySelector('#bfRow').hidden,hint:!document.querySelector('#bfHint').hidden,kbdBf:!document.querySelector('#kbdBf').closest('[hidden]'),state:document.querySelector('#bfState').textContent}));
    check('第一次使用：體脂從來沒有記過，不顯示體脂刻度尺，提示用鍵盤（鍵盤的體脂欄也在）',bf.row&&bf.hint&&bf.kbdBf&&bf.state==='未記',bf);
    await page.click('#wsSave');await wait(400);
    const d=await doc('days/'+T);
    check('第一次使用：存入 51.4、沒有體脂',d?.am?.w===51.4&&d.am.bf==null,d?.am);
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* 2. 早上：沒動尺可直接存，按鈕寫明「和上次一樣」 */
  {const seed=sampleSeed(T);const last=seed['days/2026-10-29'].am.w;
    const {page,doc}=await open({cfg:{latencyComp:true,seed}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(300);
    let s=await sheet(page);
    check('早上預設是上次量測：按鈕寫「和上次一樣」且可按',s.save.includes('和上次一樣')&&s.save.includes(last.toFixed(1))&&!s.saveDisabled,s);
    await page.click('#wsSave');await wait(400);
    check('早上沒動尺：存入上次的值',(await doc('days/'+T))?.am?.w===last);
    /* 3. 晚上：預設是估計值，沒動尺不能存 */
    await page.click('[data-wslot="pm"]');await wait(300);s=await sheet(page);
    check('晚上預設是估計值：沒動尺不能記下',s.saveDisabled,s);
    await page.click('[data-step="1"]');await wait(150);s=await sheet(page);
    check('晚上動過尺：可以記下',!s.saveDisabled&&s.save.startsWith('記下'),s);
    await page.click('#wsClose');
    /* 4. 刻度尺連按 10 次 +0.1 */
    await page.click('[data-wslot="am"]');await wait(300);
    const v0=parseFloat((await sheet(page)).big);
    for(let i=0;i<10;i++){await page.click('[data-step="1"]',{delay:0});await wait(16)}
    await wait(600);
    const v1=parseFloat((await sheet(page)).big);
    check('連按 10 次 +0.1 剛好 +1.0',Math.abs(v1-v0-1)<1e-9,{v0,v1});
    /* 按 ±0.1 後同步送一個 scroll 事件：平滑捲動時位置還沒移動，數值會被拉回；即時捲動則位置已到位。
       這只驗證「按鈕後立即的 scroll 事件」，不模擬真人拖曳或 iOS 慣性，那些要實機確認。 */
    const pulled=await page.evaluate(()=>{const big=()=>parseFloat(document.querySelector('#wsBig').textContent);const a=big();
      document.querySelector('[data-step="1"]').click();document.querySelector('#ruler').dispatchEvent(new Event('scroll'));return{a,b:big()}});
    check('按 +0.1 後立即的 scroll 事件不會把數值拉回',Math.abs(pulled.b-pulled.a-0.1)<1e-9,pulled);
    const v1b=v1+0.1;await wait(300);
    await page.evaluate(()=>document.querySelector('#ruler').dispatchEvent(new Event('scroll')));await wait(100);
    const v2=parseFloat((await sheet(page)).big);
    check('刻度尺位置與大字一致（重送 scroll 事件數值不變）',Math.abs(v2-v1b)<1e-9,{v1b,v2});
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
