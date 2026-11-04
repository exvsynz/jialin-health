/* 體重面板：第一次使用、「和上次一樣」、晚上估計值、刻度尺連按、點大數字直接打字。
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

  /* 5. 點大數字直接打字：不離開輸入框就按儲存（用 element.click()，滑鼠點會先讓輸入框失焦觸發 change，蓋掉要測的情況） */
  const saveNoBlur=page=>page.evaluate(()=>{const f=document.activeElement?.id||null;document.querySelector('#wsSave').click();return f});
  const toastShown=page=>page.evaluate(()=>!document.querySelector('#toast').hidden&&document.querySelector('#toastText').textContent);
  {const seed=sampleSeed(T);const {page,doc,errors}=await open({cfg:{latencyComp:true,seed}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(300);
    await page.click('#wsBig');await wait(100);
    let s=await sheet(page);
    check('點體重大數字：打開鍵盤並聚焦體重欄',s.kbdShown&&s.kbdFocused,s);
    check('點體重大數字：大數字是有名稱的按鈕',await page.evaluate(()=>{const b=document.querySelector('#wsBig');return b.tagName==='BUTTON'&&b.getAttribute('aria-label').includes('鍵盤輸入')}));
    await page.keyboard.type('4');await wait(50);
    s=await sheet(page);
    check('打到一半（4）：不跳警告、不能儲存',!(await toastShown(page))&&s.saveDisabled,{s,toast:await toastShown(page)});
    await page.keyboard.type('8.6');await wait(50);
    s=await sheet(page);
    check('打字取代舊值（舊值被全選）、大數字與儲存鍵即時更新',(await page.inputValue('#kbdIn'))==='48.6'&&s.big.startsWith('48.6')&&!s.saveDisabled&&s.save.includes('48.6'),{v:await page.inputValue('#kbdIn'),s});
    const f=await saveNoBlur(page);await wait(400);
    check('不離開體重欄直接按儲存：存到 48.6',f==='kbdIn'&&(await doc('days/'+T))?.am?.w===48.6,{f,am:(await doc('days/'+T))?.am});
    /* 晚上估計值：打字就算確認，儲存鍵立刻可以按 */
    await page.click('[data-wslot="pm"]');await wait(300);
    s=await sheet(page);check('晚上估計值：打字前不能儲存',s.saveDisabled&&s.save.includes('撥尺確認'),s);
    await page.click('#wsBig');await page.keyboard.type('49.2');
    s=await sheet(page);
    check('晚上估計值：打完不離開欄位，儲存鍵立刻可以按',s.kbdFocused&&!s.saveDisabled&&s.save.includes('49.2'),s);
    await saveNoBlur(page);await wait(400);
    check('晚上估計值：存到 49.2',(await doc('days/'+T))?.pm?.w===49.2,(await doc('days/'+T))?.pm);
    /* 體脂 */
    await page.click('[data-wslot="am"]');await wait(300);
    await page.click('#bfBig');await wait(100);
    check('點體脂大數字：打開鍵盤並聚焦體脂欄',await page.evaluate(()=>!document.querySelector('#kbdRow').hidden&&document.activeElement===document.querySelector('#kbdBf')));
    /* 體脂清空 = 這次不記 */
    await page.keyboard.type('26');await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');
    s=await sheet(page);
    check('體脂打字後清空：這次不記',await page.evaluate(()=>document.querySelector('#bfState').textContent)==='未記'&&!s.saveDisabled&&s.save.includes('體脂未記'),s);
    await page.keyboard.type('25.3');
    s=await sheet(page);check('體脂打字：儲存鍵即時顯示 25.3%',!s.saveDisabled&&s.save.includes('25.3%'),s);
    await saveNoBlur(page);await wait(400);
    let am=(await doc('days/'+T))?.am;
    check('不離開體脂欄直接按儲存：存到 bf 25.3、體重不變',am?.bf===25.3&&am?.w===48.6,am);
    /* 打過合法值再刪回不合法：不能存成刪掉前的值 */
    await page.click('[data-wslot="am"]');await wait(300);
    await page.click('#wsBig');await page.keyboard.type('47.5');await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');
    s=await sheet(page);
    check('打 47.5 再刪成 4：儲存鍵不能按',(await page.inputValue('#kbdIn'))==='4'&&s.saveDisabled,{v:await page.inputValue('#kbdIn'),s});
    await saveNoBlur(page);await wait(300);
    check('打 47.5 再刪成 4：沒有存成 47.0 或 47.5',(await doc('days/'+T))?.am?.w===48.6,(await doc('days/'+T))?.am);
    /* 刻度尺還沒重新置中：打字中送來的 scroll 事件不能蓋掉打的值；碰到刻度尺就結束打字 */
    await page.keyboard.press('Backspace');await page.keyboard.type('50.2');
    await page.evaluate(()=>{const r=document.querySelector('#ruler');r.scrollLeft-=36;r.dispatchEvent(new Event('scroll'))});await wait(50);
    s=await sheet(page);
    check('打字中刻度尺送來 scroll：不蓋掉打的 50.2',s.kbdFocused&&s.big.startsWith('50.2')&&s.save.includes('50.2'),s);
    await page.dispatchEvent('#ruler','pointerdown');await wait(300);
    await page.evaluate(()=>document.querySelector('#ruler').dispatchEvent(new Event('scroll')));await wait(50);
    s=await sheet(page);
    check('碰刻度尺：結束打字，刻度尺移到 50.2（重送 scroll 數值不變）',!s.kbdFocused&&s.big.startsWith('50.2'),s);
    /* 體脂打成 2e：number 欄位的 value 是 ''，不能當成清空 */
    await page.click('#bfBig');await page.keyboard.type('2e');
    s=await sheet(page);
    check('體脂打成 2e：不當成清空，儲存鍵不能按',s.saveDisabled,{v:await page.inputValue('#kbdBf'),s});
    await page.keyboard.press('Tab');await wait(100);
    check('體脂打成 2e：離開欄位時跳範圍警告',await toastShown(page)==='體脂請填 3–70',await toastShown(page));
    /* 真的點儲存（先失焦觸發 change 再 click） */
    await page.click('#bfBig');await page.keyboard.type('24.9');await page.click('#wsSave');await wait(400);
    am=(await doc('days/'+T))?.am;
    check('打完直接點儲存（會先失焦）：存到 50.2 kg、24.9%',am?.w===50.2&&am?.bf===24.9,am);
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* 6. 第一次記錄：鍵盤自動打開，打完直接存；輸入 15 不存，失焦才跳範圍警告 */
  {const {page,doc,errors}=await open({cfg:{latencyComp:true}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(300);
    await page.keyboard.type('15');await wait(50);
    let s=await sheet(page);
    check('輸入 15：還在欄位內，不跳警告、不能儲存',s.kbdFocused&&!(await toastShown(page))&&s.saveDisabled,{s,toast:await toastShown(page)});
    await saveNoBlur(page);await wait(300);
    check('輸入 15：按儲存也不存',(await doc('days/'+T))==null,await doc('days/'+T));
    await page.keyboard.press('Tab');await wait(100);
    check('輸入 15：離開欄位時才跳範圍警告',await toastShown(page)==='體重請填 20–200',await toastShown(page));
    check('輸入 15：離開欄位後仍不能儲存',(await sheet(page)).saveDisabled);
    await page.click('#wsBig');await page.keyboard.type('48.6');
    s=await sheet(page);
    check('第一次記錄：改成 48.6 後儲存鍵即時可以按',!s.saveDisabled&&s.save.includes('48.6'),s);
    await saveNoBlur(page);await wait(400);
    check('第一次記錄：不離開欄位直接按儲存，存到 48.6',(await doc('days/'+T))?.am?.w===48.6,(await doc('days/'+T))?.am);
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
