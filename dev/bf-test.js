/* 體重與體脂的記錄與顯示（docs/specs/bf-fix.md）：同一個面板的兩把刻度尺、體脂的未記與已記、儲存鈕、鍵盤兩欄、
   一位小數、體脂圖、最近紀錄三欄、版面（380×820、380×667、淺色／深色）。合成資料。
   執行：node dev/bf-test.js        略過截圖：node dev/bf-test.js --no-shots */
const fs=require('fs'),path=require('path');
const {open,close,check,summary}=require('./harness');
const {scan}=require('./a11y');
const SHOTS=path.join(__dirname,'screenshots');
const T='2026-10-30',Y='2026-10-29',Y2='2026-10-28',NOW='2026-10-30T08:00:00+08:00',EVE='2026-10-30T21:00:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const st=page=>page.evaluate(()=>({
  w:document.querySelector('#wsBig').textContent.trim(),wUn:document.querySelector('#wsBig').classList.contains('untouched'),
  bf:document.querySelector('#bfBig').textContent.trim(),bfUn:document.querySelector('#bfBig').classList.contains('untouched'),
  state:document.querySelector('#bfState').textContent,clear:!document.querySelector('#bfClear').hidden,
  save:document.querySelector('#wsSave').textContent.trim(),dis:document.querySelector('#wsSave').disabled,
  bfRow:!document.querySelector('#bfRow').hidden,tabs:!!document.querySelector('[data-wseg]')}));
/* 程式捲動刻度尺 n 格（模擬撥尺；真人拖曳與慣性要實機確認） */
const scrollBy=(page,sel,n)=>page.evaluate(([sel,n])=>{const r=document.querySelector(sel);r.scrollLeft+=n*12;r.dispatchEvent(new Event('scroll'))},[sel,n]);
const seed=o=>({[`days/${Y2}`]:{date:Y2,am:{w:52.0,bf:24.0,at:'07:00'},pm:{w:52.5,bf:25.3,at:'22:00'}},[`days/${Y}`]:{date:Y,am:{w:52.2,bf:24.1,at:'07:00'}},...o});

(async()=>{
  /* 1. 同一個畫面、預設值、未記 */
  {const {page,doc,errors}=await open({time:NOW,cfg:{latencyComp:true,seed:seed()}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(400);let s=await st(page);
    check('面板：沒有體重／體脂頁籤，體脂在同一個畫面',!s.tabs&&s.bfRow,s);
    check('體脂預設帶上次量的（同時段 24.1），淡色、標「未記」',s.bf.startsWith('24.1')&&s.bfUn&&s.state==='未記'&&!s.clear,s);
    check('儲存鈕：體脂沒動寫「（體脂未記）」',s.save==='和上次一樣 52.2 kg（體脂未記）',s.save);
    await page.click('[data-bfstep="1"]');await wait(200);s=await st(page);
    check('按體脂 ＋0.1：變成已記、正常顏色，出現「不記」',s.bf.startsWith('24.2')&&!s.bfUn&&s.state==='已記'&&s.clear,s);
    check('儲存鈕：寫明體重與體脂',s.save==='和上次一樣 52.2 kg・24.2%',s.save);
    await page.click('#bfClear');await wait(200);s=await st(page);
    check('「不記」：回到未記，數值回到預設',s.bf.startsWith('24.1')&&s.state==='未記'&&s.save.endsWith('（體脂未記）'),s);
    await page.click('[data-step="1"]');await page.click('[data-bfstep="-1"]');await wait(200);s=await st(page);
    check('兩邊各按一次：記下 52.3 kg・24.0%',s.save==='記下 52.3 kg・24.0%',s.save);
    await page.click('#wsSave');await wait(500);
    check('存入體重與體脂',(await doc('days/'+T))?.am?.w===52.3&&(await doc('days/'+T)).am.bf===24.0,(await doc('days/'+T))?.am);
    check('沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}
  /* 晚上：體脂一律帶上次量的（同時段優先），不用早上加早晚差推定；同時段沒有就用另一時段 */
  {const {page}=await open({time:EVE,cfg:{latencyComp:true,seed:seed({[`days/${T}`]:{date:T,am:{w:52.0,bf:23.0,at:'07:00'}}})}});await wait(500);
    await page.click('[data-wslot="pm"]');await wait(400);const s=await st(page);
    check('晚上體脂：帶上次晚上量的 25.3（不是早上 23.0 加差值）',s.bf.startsWith('25.3')&&s.state==='未記',s);
    await page.context().close()}
  {const {page}=await open({time:EVE,cfg:{latencyComp:true,seed:{[`days/${Y}`]:{date:Y,am:{w:52.2,bf:24.1,at:'07:00'}}}}});await wait(500);
    await page.click('[data-wslot="pm"]');await wait(400);const s=await st(page);
    check('晚上體脂：從來沒有晚上體脂時，帶早上最近一次的 24.1',s.bf.startsWith('24.1'),s);
    await page.context().close()}
  /* 這一筆已有體脂：帶它、已記；沒動就保留原值；改了再按「不記」回到原值 */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,seed:seed({[`days/${T}`]:{date:T,am:{w:52.0,bf:22.0,at:'07:00'}}})}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(400);let s=await st(page);
    check('已有體脂的一筆：帶 22.0、已記、沒有「不記」，儲存鈕寫出 22.0%',s.bf.startsWith('22.0')&&s.state==='已記'&&!s.clear&&s.save.endsWith('・22.0%'),s);
    await page.click('[data-bfstep="1"]');await wait(150);await page.click('#bfClear');await wait(150);s=await st(page);
    check('改了再按「不記」：回到原有的 22.0、已記',s.bf.startsWith('22.0')&&s.state==='已記'&&!s.clear,s);
    await page.click('[data-step="-1"]');await page.click('#wsSave');await wait(500);
    check('體重改了、體脂沒動：保留原有的 22.0',(await doc('days/'+T))?.am?.bf===22.0&&(await doc('days/'+T)).am.w===51.9,(await doc('days/'+T))?.am);
    await page.context().close()}

  /* 2. 兩把刻度尺各自捲動，互不影響 */
  {const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:seed()}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(600);
    await scrollBy(page,'#bfRuler',3);await wait(250);let s=await st(page);
    check('撥體脂刻度尺：體脂 +0.3、已記，體重不變',s.bf.startsWith('24.4')&&s.state==='已記'&&s.w.startsWith('52.2')&&s.wUn,s);
    await scrollBy(page,'#ruler',-2);await wait(250);s=await st(page);
    check('撥體重刻度尺：體重 -0.2，體脂不變',s.w.startsWith('52.0')&&s.bf.startsWith('24.4'),s);
    const pos=await page.evaluate(()=>({w:document.querySelector('#ruler').scrollLeft,bf:document.querySelector('#bfRuler').scrollLeft}));
    for(let i=0;i<10;i++){await page.click('[data-bfstep="1"]',{delay:0});await wait(16)}await wait(500);s=await st(page);
    const pos2=await page.evaluate(()=>({w:document.querySelector('#ruler').scrollLeft,bf:document.querySelector('#bfRuler').scrollLeft}));
    check('連按體脂 ＋0.1 十次：體脂 +1.0，體重刻度尺的位置不動',s.bf.startsWith('25.4')&&s.w.startsWith('52.0')&&pos2.w===pos.w&&pos2.bf>pos.bf,{s,pos,pos2});
    const ta=await page.evaluate(()=>[...document.querySelectorAll('#wSheet .ruler')].map(r=>getComputedStyle(r).touchAction));
    check('兩把刻度尺都是 touch-action: pan-x',ta.length===2&&ta.every(t=>t==='pan-x'),ta);
    await page.context().close()}

  /* 3. 鍵盤兩欄 */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,seed:seed()}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(400);await page.click('#kbdBtn');await wait(200);
    const ph=await page.evaluate(()=>({w:document.querySelector('#kbdIn').value,bf:document.querySelector('#kbdBf').value,phd:document.querySelector('#kbdBf').placeholder}));
    check('鍵盤：體重欄有值，體脂欄未記時留空、以預設值當提示',ph.w==='52.2'&&ph.bf===''&&ph.phd==='24.1',ph);
    await page.fill('#kbdBf','80');await page.dispatchEvent('#kbdBf','change');await wait(200);
    check('鍵盤：體脂超出範圍提示',/體脂請填 3–70/.test(await page.textContent('#toastText')));
    await page.fill('#kbdIn','51.6');await page.dispatchEvent('#kbdIn','change');await page.fill('#kbdBf','23.7');await page.dispatchEvent('#kbdBf','change');await wait(300);
    let s=await st(page);
    check('鍵盤：兩欄都填，已記',s.save==='記下 51.6 kg・23.7%'&&s.state==='已記',s);
    await page.fill('#kbdBf','');await page.dispatchEvent('#kbdBf','change');await wait(200);s=await st(page);
    check('鍵盤：體脂欄清空，回到未記',s.state==='未記'&&s.save==='記下 51.6 kg（體脂未記）',s);
    await page.fill('#kbdBf','23.7');await page.dispatchEvent('#kbdBf','change');await wait(200);
    await page.click('#wsSave');await wait(500);
    check('鍵盤：存入兩個值',(await doc('days/'+T))?.am?.w===51.6&&(await doc('days/'+T)).am.bf===23.7);
    await page.context().close()}
  {const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:{[`days/${Y}`]:{date:Y,am:{w:52.2,at:'07:00'}}}}});await wait(500);
    await page.click('[data-wslot="am"]');await wait(400);let s=await st(page);
    check('從來沒有體脂：顯示「— %」與未記，不顯示體脂刻度尺',s.bf.startsWith('—')&&s.state==='未記'&&!s.bfRow,s);
    await page.click('#kbdBtn');await page.fill('#kbdBf','26');await page.dispatchEvent('#kbdBf','change');await wait(400);s=await st(page);
    check('從來沒有體脂：用鍵盤輸入後出現刻度尺，已記、一位小數',s.bfRow&&s.bf.startsWith('26.0')&&s.state==='已記'&&s.save.endsWith('・26.0%'),s);
    await page.context().close()}

  /* 4. 一位小數、體脂圖、最近紀錄三欄 */
  {const sd={[`days/${T}`]:{date:T,am:{w:52.0,bf:25,at:'07:00'},pm:{w:52.4,bf:26,at:'22:00'}},[`days/${Y}`]:{date:Y,am:{w:52.1,bf:24.1,at:'07:00'},pm:{w:52.6,at:'22:00'}},[`days/${Y2}`]:{date:Y2,am:{w:52.3,bf:24.0,at:'07:00'},period:true}};
    const {page}=await open({time:EVE,cfg:{latencyComp:true,seed:sd}});await wait(500);
    const cells=await page.$$eval('[data-wslot] .sub',els=>els.map(e=>e.textContent));
    check('今天頁：體脂 25 顯示 25.0%、26 顯示 26.0%',cells[0].includes('體脂 25.0%')&&cells[1].includes('體脂 26.0%'),cells);
    await page.evaluate(()=>{location.hash='weight'});await wait(500);
    const log=await page.$$eval('#wLog li',els=>els.map(e=>e.textContent.replace(/\s+/g,' ').trim()));
    check('最近紀錄：體重與體脂都一位小數，日期是「10/30 五」',log[0].startsWith('10/30 五')&&log[0].includes('52.0・25.0%')&&log[0].includes('52.4・26.0%'),log);
    const rows=await page.$$eval('#wLog li.logrow',els=>els.map(li=>{const v=[...li.querySelectorAll('.lgv')].map(x=>x.getBoundingClientRect());return{same:Math.abs(v[0].top-v[1].top)<2,h:li.getBoundingClientRect().height,chip:!!li.querySelector('.lgd .chip')}}));
    check('最近紀錄（380 寬）：早和晚在同一行，月經標記在日期下方',rows.every(r=>r.same)&&rows.some(r=>r.chip),rows);
    const ch=await page.evaluate(()=>({am:document.querySelectorAll('#bfChart .dot-am').length,pm:document.querySelectorAll('#bfChart .dot-pm').length,avg:!!document.querySelector('#bfChart path.avg'),legend:document.querySelector('#bfLegend').textContent,title:document.querySelector('#bfLegend').closest('.sect').querySelector('h2').textContent}));
    check('體脂圖：早上實心點 3、晚上空心點 1、7 日平均線',ch.am===3&&ch.pm===1&&ch.avg,ch);
    check('體脂圖：標題「體脂」，圖例有早上 7 日平均、早上、晚上',ch.title==='體脂'&&/早上 7 日平均/.test(ch.legend)&&/早上/.test(ch.legend)&&/晚上/.test(ch.legend),ch);
    await page.context().close()}
  {const {page}=await open({time:NOW,hash:'weight',cfg:{latencyComp:true,seed:{[`days/${Y}`]:{date:Y,am:{w:52.2,at:'07:00'},pm:{w:52.6,bf:25.5,at:'22:00'}}}}});await wait(500);
    const r=await page.evaluate(()=>({empty:/還沒有紀錄/.test(document.querySelector('#bfChart').textContent),pm:document.querySelectorAll('#bfChart .dot-pm').length,avg:!!document.querySelector('#bfChart path.avg')}));
    check('體脂圖：只有 1 筆（晚上）也畫點，不畫平均線，不顯示空白訊息',!r.empty&&r.pm===1&&!r.avg,r);
    await page.context().close()}
  {const {page}=await open({time:NOW,hash:'weight',cfg:{latencyComp:true,seed:{[`days/${Y}`]:{date:Y,am:{w:52.2,at:'07:00'}}}}});await wait(500);
    check('體脂圖：期間內完全沒有體脂才顯示空白訊息',/這段期間還沒有紀錄/.test(await page.textContent('#bfChart')));
    await page.context().close()}

  /* 5. 版面：380×820 與 380×667，淺色／深色；儲存鈕不用捲動就看得到 */
  for(const [h,tag] of [[820,'380'],[667,'380x667']])for(const scheme of ['light','dark']){
    const {page}=await open({time:EVE,width:380,height:h,scheme,cfg:{latencyComp:true,seed:seed({[`days/${T}`]:{date:T,am:{w:52.0,bf:23.0,at:'07:00'}}})}});await wait(500);
    await page.click('[data-wslot="pm"]');await wait(500);await page.click('[data-bfstep="1"]');await wait(200);
    const r=await page.evaluate(()=>{const d=document.querySelector('#wSheet'),b=document.querySelector('#wsSave').getBoundingClientRect(),c=document.querySelector('#wsClose').getBoundingClientRect();
      return{over:document.documentElement.scrollWidth-document.documentElement.clientWidth,sheetScroll:d.scrollHeight-d.clientHeight,saveBottom:b.bottom,closeBottom:c.bottom,vh:innerHeight}});
    const a=await page.evaluate(`(${scan.toString()})()`);
    check(`${tag} ${scheme} 面板：沒有水平捲動、觸控目標 ≥44、對比`,r.over<=0&&!a.small.length&&!a.low.length,{over:r.over,small:a.small.slice(0,6),low:a.low.slice(0,6)});
    check(`${tag} ${scheme} 面板：不用捲動面板，儲存鈕和底部按鈕都在畫面內`,r.sheetScroll<=1&&r.saveBottom<=r.vh&&r.closeBottom<=r.vh,r);
    if(!process.argv.includes('--no-shots')){fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-weight-bf-sheet.png`)})}
    if(h===820){await page.click('#kbdBtn');await wait(200);const k=await page.evaluate(`(${scan.toString()})()`);
      check(`${tag} ${scheme} 鍵盤兩欄：觸控目標、對比`,!k.small.length&&!k.low.length,{small:k.small.slice(0,6),low:k.low.slice(0,6)});
      if(!process.argv.includes('--no-shots'))await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-weight-bf-kbd.png`)});
      await page.click('#wsClose');await page.evaluate(()=>{location.hash='weight'});await wait(500);
      const ov=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);const w=await page.evaluate(`(${scan.toString()})()`);
      check(`${tag} ${scheme} 體重頁：沒有水平捲動、觸控目標、對比`,ov<=0&&!w.small.length&&!w.low.length,{ov,small:w.small.slice(0,6),low:w.low.slice(0,6)});
      if(!process.argv.includes('--no-shots'))await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-weight-bf-page.png`),fullPage:true})}
    await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
