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

  /* 7. 打字的字串與合法值分開（W-01、W-04、W-05）、刻度尺與面板一致（W-02）、存檔失敗後重試（W-03）。
     今天已有一筆 48.6／24.5，存檔走 update；每次存檔都用 mock 的寫入紀錄確認恰好一筆。 */
  {const seed=sampleSeed(T);seed['days/'+T]={date:T,am:{w:48.6,bf:24.5,at:'07:10'},updatedAt:1};
    const {page,doc,errors}=await open({cfg:{latencyComp:true,seed}});await wait(500);
    const nWrites=()=>page.evaluate(t=>window.__mock.writes.filter(x=>x.path==='days/'+t).length,T);
    const lastAm=()=>page.evaluate(t=>{const w=window.__mock.writes.filter(x=>x.path==='days/'+t);return w.length?w[w.length-1].data.am:null},T);
    /* 儲存鍵若慢一拍還沒停用：拿掉 disabled 直接 click，handler 自己也要擋 */
    const forceSave=()=>page.evaluate(()=>{const b=document.querySelector('#wsSave');b.disabled=false;b.click()});
    const st=()=>page.evaluate(()=>{const q=s=>document.querySelector(s),r=q('#ruler');return{
      ruler:Math.round((RL.w.min+Math.round(r.scrollLeft/12)/10)*10)/10,field:q('#kbdIn').value,bfField:q('#kbdBf').value,big:q('#wsBig').textContent,
      save:q('#wsSave').textContent,disabled:q('#wsSave').disabled,invW:q('#kbdIn').getAttribute('aria-invalid'),invBf:q('#kbdBf').getAttribute('aria-invalid'),
      focus:document.activeElement?.id||null}});
    const reopen=async()=>{if(await page.evaluate(()=>document.querySelector('#wSheet').open))await page.click('#wsClose');await page.click('[data-wslot="am"]');await wait(300)};
    /* 尺、輸入欄、大字、儲存鍵、寫入的值五者一致；存檔恰好寫一筆 */
    const agree=async(name,bf)=>{const s=await st(),v=s.ruler.toFixed(1),n0=await nWrites();
      check(name+'：尺、輸入欄、大字、儲存鍵一致',s.field===v&&s.big===v+'kg'&&s.save==='記下 '+v+' kg・'+bf+'%'&&!s.disabled,s);
      await page.click('#wsSave');await wait(400);const am=await lastAm(),n1=await nWrites();
      check(name+'：恰好寫入一筆，寫入的就是尺上的值',n1-n0===1&&am?.w===s.ruler,{n:n1-n0,am,ruler:s.ruler})};

    /* 201 → 點體脂 → 儲存 */
    await reopen();await page.click('#wsBig');await page.keyboard.type('201');
    let s=await st();
    check('打 201：還在欄位內，不跳警告，儲存鍵寫「請修正體重」並停用',!(await toastShown(page))&&s.save==='請修正體重'&&s.disabled&&s.invW==='true',{s,toast:await toastShown(page)});
    await page.click('#bfBig');await wait(100);
    check('201 → 點體脂：離開欄位才跳範圍警告',await toastShown(page)==='體重請填 20–200',await toastShown(page));
    s=await st();
    check('201 → 點體脂：體重欄仍是 201，大字回到打字前的 48.6，儲存鍵停用',s.field==='201'&&s.big==='48.6kg'&&s.save==='請修正體重'&&s.disabled&&s.invW==='true'&&s.focus==='kbdBf',s);
    await page.keyboard.type('25');s=await st();
    check('201 → 體脂打 25：體脂合法，體重仍擋住儲存',s.save==='請修正體重'&&s.disabled&&s.invBf==='false',s);
    let n0=await nWrites();await saveNoBlur(page);await wait(100);
    s=await st();check('201 → 按儲存：體重草稿保留、儲存鍵仍停用',s.field==='201'&&s.disabled&&s.save==='請修正體重',s);
    await forceSave();await wait(400);
    check('201 → 點體脂 → 儲存（含拿掉 disabled 直接 click）：寫入 0 次',(await nWrites())===n0&&(await doc('days/'+T)).am.w===48.6,{n:(await nWrites())-n0,am:(await doc('days/'+T)).am});
    await page.click('#wsBig');await page.keyboard.type('50.1');s=await st();
    check('改成 50.1：全選取代 201，儲存鍵即時寫出兩個值',s.field==='50.1'&&s.big==='50.1kg'&&s.save==='記下 50.1 kg・25.0%'&&!s.disabled&&s.invW==='false',s);
    n0=await nWrites();await saveNoBlur(page);await wait(400);
    check('改成 50.1 後儲存：恰好寫入一筆 50.1／25',(await nWrites())-n0===1&&(await lastAm())?.w===50.1&&(await lastAm())?.bf===25,{n:(await nWrites())-n0,am:await lastAm()});

    /* 47.5 → 刪成 4 → 換欄位 */
    await reopen();await page.click('#wsBig');await page.keyboard.type('47.5');
    for(let i=0;i<3;i++)await page.keyboard.press('Backspace');
    await page.click('#bfBig');await wait(100);s=await st();
    check('47.5 → 刪成 4 → 換欄位：體重欄仍是 4，大字是打字前的 50.1，儲存鍵停用',s.field==='4'&&s.big==='50.1kg'&&s.save==='請修正體重'&&s.disabled,s);
    n0=await nWrites();await forceSave();await wait(400);
    check('47.5 → 刪成 4 → 換欄位 → 儲存：寫入 0 次',(await nWrites())===n0,(await nWrites())-n0);
    await page.click('#kbdBtn');await page.click('#kbdBtn');s=await st();
    check('收起再展開鍵盤：草稿 4 仍在、儲存鍵仍停用',s.field==='4'&&s.disabled&&s.save==='請修正體重',s);
    await page.click('[data-step="1"]');await wait(100);s=await st();
    check('按 ＋0.1 明確換掉草稿：從打字前的 50.1 起算，成為 50.2',s.field==='50.2'&&s.big==='50.2kg'&&s.save==='記下 50.2 kg・25.0%'&&!s.disabled&&s.invW==='false',s);

    /* 文字欄位：全選取代、整串驗證 */
    await reopen();await page.click('#wsBig');await page.keyboard.type('4');s=await st();
    check('文字欄位：點大數字後打 4，取代整個舊值',s.field==='4'&&s.save==='請修正體重',s);
    for(const [str,k] of [['48abc','w'],['4..8','w'],['48.65','w'],['2e','bf'],['25.3%','bf']]){
      await page.click(k==='w'?'#wsBig':'#bfBig');await page.keyboard.type(str);s=await st();
      check(`文字欄位：「${str}」不合法，儲存鍵停用`,(k==='w'?s.field:s.bfField)===str&&s.disabled&&s.save===(k==='w'?'請修正體重':'請修正體脂')&&(k==='w'?s.invW:s.invBf)==='true',s);
      await page.click(k==='w'?'#wsBig':'#bfBig');await page.keyboard.type(k==='w'?'50.1':'25');}
    await page.evaluate(()=>{document.querySelector('#toast').hidden=true}); // 上面離開欄位時的警告
    await page.click('#wsBig');await page.keyboard.type('48.');s=await st();
    check('文字欄位：「48.」打到一半，不跳警告、儲存鍵停用',!(await toastShown(page))&&s.disabled&&s.save==='請修正體重',{s,toast:await toastShown(page)});
    await page.keyboard.press('Backspace');await page.keyboard.type(',7');s=await st();
    check('文字欄位：「48,7」逗號當小數點，等於 48.7',s.big==='48.7kg'&&s.save==='記下 48.7 kg・25.0%'&&!s.disabled,s);
    await page.click('#bfBig');await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');s=await st();
    check('文字欄位：體脂清空，儲存鍵不擋（已存過的 25 保留）',s.bfField===''&&!s.disabled&&s.invBf==='false'&&s.save==='記下 48.7 kg・25.0%',s);
    /* 大數字只在數字改變時更新：在體重欄打字不動體脂的 live region */
    const muts=await page.evaluate(async()=>{const q=s=>document.querySelector(s),n={w:0,bf:0};
      const ob=new MutationObserver(L=>L.forEach(m=>{if(m.target.closest('#bfBig'))n.bf++;else if(m.target.closest('#wsBig'))n.w++}));
      ob.observe(q('#wsBig'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label']});
      ob.observe(q('#bfBig'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label']});
      const el=q('#kbdIn');el.focus();for(const v of ['48.7','48.','48.7','48.71','48.7']){el.value=v;el.dispatchEvent(new Event('input'))}
      await new Promise(r=>setTimeout(r,0));ob.disconnect();return n});
    check('打字時數字沒變：體重、體脂大數字都不重寫',muts.w===0&&muts.bf===0,muts);
    await page.click('#wsClose');

    /* 刻度尺：碰尺後 35ms 內移動、rAF 前就移動、解除抑制之後移動、瀏覽器觸控拖曳 */
    await reopen();await page.click('#wsBig');await page.keyboard.type('50.2');
    await page.dispatchEvent('#ruler','pointerdown');await wait(35);
    await page.evaluate(()=>{const r=document.querySelector('#ruler');r.scrollLeft+=120;r.dispatchEvent(new Event('scroll'))});await wait(300);
    await agree('打 50.2、碰尺 35ms 後移動一格 kg','25.0');
    await reopen();await page.click('#wsBig');await page.keyboard.type('49.5');
    await page.evaluate(()=>{const r=document.querySelector('#ruler');r.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));r.scrollLeft+=120;r.dispatchEvent(new Event('scroll'))});await wait(300);
    await agree('打 49.5、碰尺後重新置中前就移動','25.0');
    await reopen();await page.click('#wsBig');await page.keyboard.type('50.6');
    await page.dispatchEvent('#ruler','pointerdown');await wait(300);
    await page.evaluate(()=>{const r=document.querySelector('#ruler');r.scrollLeft-=60;r.dispatchEvent(new Event('scroll'))});await wait(300);
    await agree('打 50.6、碰尺 300ms 後（重建完成）移動五格','25.0');
    await reopen();await page.click('#wsBig');await page.keyboard.type('50.2');
    {const cdp=await page.context().newCDPSession(page);const b=await page.locator('#ruler').boundingBox();const x=b.x+b.width*0.7,y=b.y+b.height/2;
      const touch=(type,px)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:px,y}]});
      await touch('touchStart',x);await wait(25);await touch('touchMove',x-39);await wait(300);await touch('touchEnd');await wait(400)}
    await agree('打 50.2 後瀏覽器觸控拖尺（25ms 後移 39px）','25.0');

    /* 慢速存檔、存檔中換欄位、存檔失敗、重試 */
    await reopen();await page.click('#wsBig');await page.keyboard.type('150');
    await page.evaluate(()=>{window.__mock.cfg.latency=500;window.__mock.cfg.failNext={code:'quota_exceeded',count:1}});
    n0=await nWrites();const f=await saveNoBlur(page);await wait(100);s=await st();
    check('慢速存檔：不離開體重欄按儲存，顯示「儲存中…」、輸入欄唯讀',f==='kbdIn'&&s.save==='儲存中…'&&s.disabled&&await page.evaluate(()=>document.querySelector('#kbdIn').readOnly),{f,s});
    await page.click('#bfBig');await wait(900);s=await st();
    check('存檔中換到體脂欄、存檔失敗：提示再試一次',await toastShown(page)==='沒有存到，請再試一次',await toastShown(page));
    check('存檔失敗後：輸入欄、大字、尺、儲存鍵都還是打的 150',s.field==='150'&&s.big==='150.0kg'&&s.ruler===150&&s.save==='記下 150.0 kg・25.0%'&&!s.disabled,s);
    check('存檔失敗：沒有寫入',(await nWrites())===n0,(await nWrites())-n0);
    await page.evaluate(()=>{window.__mock.cfg.latency=0});
    await page.click('#wsSave');await wait(400);
    check('重試：恰好寫入一筆，存的是打的 150',(await nWrites())-n0===1&&(await lastAm())?.w===150,{n:(await nWrites())-n0,am:await lastAm()});
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
