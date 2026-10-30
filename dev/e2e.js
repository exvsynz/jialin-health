/* 主要流程與版面測試（合成資料）。
   截圖：380／1280 寬 × 淺色／深色，每一頁用 hash 直接載入；存到 dev/screenshots/（不進 repo）。
   流程：記體重、服藥與撤銷、運動新增／調分鐘／刪除與復原、切換日期補登、「更多」進出各頁。
   執行：node dev/e2e.js        只跑流程：node dev/e2e.js --no-shots */
const fs=require('fs'),path=require('path');
const {open,close,sampleSeed,check,summary}=require('./harness');
const SHOTS=path.join(__dirname,'screenshots');
const T='2026-10-30';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const PAGES=['today','weight','exercise','exams','setup'];

/* 版面檢查：沒有水平捲動、可點元素 ≥44×44、文字對比 ≥4.5:1（大字 3:1）。規則在 dev/a11y.js */
const {scan}=require('./a11y');
async function layout(page,label){
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  check(label+'：沒有水平捲動',overflow<=0,overflow);
  const r=await page.evaluate(`(${scan.toString()})()`);
  check(label+'：觸控目標 ≥44px',!r.small.length,r.small.slice(0,10));
  check(label+'：文字對比足夠',!r.low.length,r.low.slice(0,10));
}

async function shots(){
  fs.mkdirSync(SHOTS,{recursive:true});
  for(const [w,h,tag,mobile] of [[380,820,'380',true],[1280,900,'1280',false]])for(const scheme of ['light','dark'])for(const p of PAGES){
    const {page,errors}=await open({time:T+'T20:30:00+08:00',cfg:{latencyComp:true,seed:sampleSeed(T)},width:w,height:h,scheme,mobile,hash:p==='today'?'':p});
    await wait(500);
    const label=`${tag} ${scheme} ${p}`;
    const title=await page.evaluate(()=>document.querySelector('#subTitle').textContent);
    check(label+'：直接載入顯示正確頁面',p==='today'?title==='':title.length>0,title);
    await layout(page,label);
    check(label+'：沒有舊的卡片與統計方框',!(await page.$('.card,.stat')));
    await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-${p}.png`),fullPage:true});
    if(p==='today'){
      await page.click('[data-wslot="pm"]');await wait(350);await layout(page,label+' 體重面板');
      await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-weight-sheet.png`)});
      await page.click('#wsClose');await page.click('#moreBtn');await wait(350);await layout(page,label+' 更多');
      await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-more.png`)});
      await page.mouse.click(10,10);await wait(200);
      // 記完後（小折線）、展開一筆運動、補登某天
      await page.click('[data-wslot="pm"]');await wait(300);await page.click('[data-step="1"]');await page.click('#wsSave');await wait(300);
      await page.click('[data-wslot="am"]');await wait(300);await page.click('#wsSave');await wait(300);
      await page.click('#medBtn');await wait(300);await page.click('#pills [data-type="yoga"]');await wait(300);
      await page.click('#exToday [data-exopen]');await wait(200);await page.click('#medBtn');await wait(150);
      await layout(page,label+' 完成後');
      await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-today-done.png`),fullPage:true});
      await page.click('[data-day="2026-10-27"]');await wait(200);await layout(page,label+' 補登');
    }
    if(p==='exams'){
      await page.click('[data-hist="thy_lab"]');await wait(200);await layout(page,label+' 歷史');
      await page.click('[data-edit="r3"]');await wait(300);await layout(page,label+' 編輯對話框');
      await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-exam-dialog.png`)});
      check(label+'：檢查紀錄是底部 sheet',await page.evaluate(()=>document.querySelector('#dlgRec').classList.contains('sheet')));
      await page.mouse.click(10,10);await wait(200);
      check(label+'：點背景不會關掉檢查紀錄',await page.evaluate(()=>document.querySelector('#dlgRec').open));
    }
    check(label+'：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close();
  }
  // 第一次使用（空資料庫）
  for(const scheme of ['light','dark']){
    const {page}=await open({time:T+'T08:00:00+08:00',cfg:{latencyComp:true},scheme});await wait(500);
    await page.screenshot({path:path.join(SHOTS,`380-${scheme}-empty-today.png`),fullPage:true});
    await page.click('[data-wslot="am"]');await wait(350);
    await page.screenshot({path:path.join(SHOTS,`380-${scheme}-empty-weight-sheet.png`)});
    await page.context().close();
  }
}

async function flows(){
  const {page,doc,errors}=await open({time:T+'T08:00:00+08:00',cfg:{latencyComp:true,latency:40,seed:sampleSeed(T)}});
  await wait(500);
  const toast=()=>page.textContent('#toastText');

  // 記體重：開早上面板，＋0.1 兩次，記下
  const before=await page.evaluate(()=>parseFloat(document.querySelector('[data-wslot="am"] .big').textContent));
  await page.click('[data-wslot="am"]');await wait(300);
  await page.click('[data-step="1"]');await page.click('[data-step="1"]');await wait(300);
  await page.click('#wsSave');await wait(400);
  let d=await doc('days/'+T);
  check('記體重：存入預設值 +0.2',d?.am&&Math.abs(d.am.w-(before+0.2))<1e-9,{before,am:d?.am});
  check('記體重：面板關閉',!(await page.evaluate(()=>document.querySelector('#wSheet').open)));
  check('記體重：toast 顯示數值',/已記錄 \d+\.\d kg/.test(await toast()),await toast());
  check('記體重：首頁格子顯示已記',(await page.textContent('[data-wslot="am"]')).includes('✓'));

  // 服藥與撤銷
  await page.click('#medBtn');await wait(300);d=await doc('days/'+T);
  check('服藥：寫入 med 與時間',d?.med?.taken&&d.med.at==='08:00',d?.med);
  await page.click('#toastActs button:has-text("撤銷")');await wait(300);d=await doc('days/'+T);
  check('服藥撤銷：med 清除，早上體重保留',d&&!d.med&&d.am,d);
  await page.click('#medBtn');await wait(300);
  await page.click('#medBtn');await wait(150);
  check('服藥：再點已完成列出現取消鍵',await page.isVisible('#medCancel'));
  await page.click('#medCancel');await wait(300);d=await doc('days/'+T);
  check('服藥取消：med 清除',d&&!d.med,d?.med);
  await page.click('#toastActs button:has-text("復原")');await wait(300);d=await doc('days/'+T);
  check('服藥取消後復原：med 回來',d?.med?.taken,d?.med);

  // 運動：新增、調分鐘、刪除與復原
  await page.click('#pills [data-type="pilates"]');await wait(300);
  const ex=await page.evaluate(t=>[...window.__mock.store.entries()].filter(([k,v])=>k.startsWith('exercise/')&&v.date===t&&!v.deleted).map(([k,v])=>({id:k,...v})),T);
  check('運動新增：建立一筆皮拉提斯',ex.length===1&&ex[0].type==='pilates',ex);
  const id=ex[0]?.id;
  await page.click('#exToday [data-exopen]');await wait(150);
  await page.click('[data-exstep="5"]');await page.click('[data-exstep="5"]');await wait(1000);
  check('運動調分鐘：+10 分寫入',(await doc(id))?.min===ex[0].min+10,await doc(id));
  await page.click('[data-exdel]');await wait(300);
  check('運動刪除：軟刪除',(await doc(id))?.deleted===true,await doc(id));
  check('運動刪除：清單移除',!(await page.textContent('#exToday')).includes('皮拉提斯'));
  await page.click('#toastActs button:has-text("復原")');await wait(300);
  check('運動復原：deleted 回到 false',(await doc(id))?.deleted===false,await doc(id));

  // 月經
  await page.click('#perBtn');await wait(300);d=await doc('days/'+T);
  check('月經：開啟',d?.period===true,d?.period);
  await page.click('#perBtn');await wait(300);d=await doc('days/'+T);
  check('月經：關閉',d?.period===false,d?.period);

  // 切換日期補登：點兩天前的圓點
  const back='2026-10-27'; // 合成資料中這天沒有晚上體重
  await page.click(`[data-day="${back}"]`);await wait(200);
  check('補登：日期列顯示補登與回到今天',(await page.textContent('#tDate')).includes('補登')&&await page.isVisible('#goToday'));
  const prevMed=(await doc('days/'+back))?.med;
  await page.click('[data-wslot="pm"]');await wait(300);await page.click('[data-step="-1"]');await wait(200);await page.click('#wsSave');await wait(400);
  d=await doc('days/'+back);
  check('補登：晚上體重寫進該日、時間為補登',d?.pm?.at==='補登'&&d?.am,d);
  check('補登：該日原本的服藥紀錄保留',JSON.stringify(d?.med)===JSON.stringify(prevMed),d?.med);
  await page.click('#goToday');await wait(150);
  check('補登：回到今天',!(await page.textContent('#tDate')).includes('補登'));
  // 從「更多」選日期補登
  await page.click('#moreBtn');await wait(200);await page.fill('#dPick','2026-10-20');await page.dispatchEvent('#dPick','change');await wait(200);
  check('更多 → 選擇日期：切到 10/20',(await page.textContent('#tDate')).includes('10月20日'));
  await page.click('#goToday');await wait(150);

  // 「更多」進出各頁
  for(const [nav,title] of [['weight','體重與體脂'],['exercise','運動紀錄'],['exams','定期檢查'],['setup','設定與備份']]){
    await page.click('#moreBtn');await wait(200);await page.click(`[data-nav="${nav}"]`);await wait(250);
    check(`更多 → ${title}：頁面與標題正確`,(await page.isVisible('#p-'+nav))&&(await page.textContent('#subTitle'))===title);
    await page.click('#backBtn');await wait(200);
    check(`${title} → ‹ 今天：回到今天`,await page.isVisible('#p-today')&&!(await page.isVisible('#subbar')));
  }

  // 定期檢查：新增一筆紀錄
  await page.evaluate(()=>location.hash='exams');await wait(200);
  await page.click('[data-add="lung_ldct"]');await wait(200);
  await page.selectOption('#fPreset','l3');await page.fill('#fDate','2026-10-01');await page.click('#btnSave');await wait(400);
  const rec=await page.evaluate(()=>[...window.__mock.store.entries()].find(([k,v])=>k.startsWith('records/')&&v.exam==='lung_ldct')?.[1]);
  check('定期檢查新增：分類 Lung-RADS 3 帶入 6 個月',rec?.preset==='l3'&&rec?.interval===6,rec);

  // 刪除檢查紀錄：立即刪除，可撤銷
  const rid=await page.evaluate(()=>[...window.__mock.store.entries()].find(([k,v])=>k.startsWith('records/')&&v.exam==='lung_ldct')[0].split('/')[1]);
  check('新增檢查紀錄後歷史直接展開',await page.isVisible(`[data-edit="${rid}"]`));
  await page.click(`[data-edit="${rid}"]`);await wait(200);
  await page.click('#btnDel');await wait(400);
  check('刪除檢查紀錄：一按就刪除並關閉對話框',!(await doc('records/'+rid))&&!(await page.evaluate(()=>document.querySelector('#dlgRec').open)));
  await page.click('#toastActs button:has-text("撤銷")');await wait(400);
  check('刪除檢查紀錄後撤銷：內容完整回來',(await doc('records/'+rid))?.preset==='l3',await doc('records/'+rid));

  check('流程：沒有 JS 錯誤',!errors.length,errors);
  await page.context().close();
}

(async()=>{
  await flows();
  if(!process.argv.includes('--no-shots'))await shots();
  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
