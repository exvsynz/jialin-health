/* 底部分頁列（今天、體重、檢查、用藥、更多）：
   - 每個分頁有圖示加文字、標示目前所在的頁、觸控目標 ≥44；頂部的 #moreBtn 已移除
   - 每個分頁到對應頁；「更多」面板放運動紀錄、飲食、回診摘要、設定與備份與「選擇日期補登」
   - 380×667 淺色與深色：沒有水平捲動；頁面捲到底、每個控制項、toast 都不被分頁列擋住；對話框的儲存鍵按得到
   - 今天畫面：早上體重、服藥、晚上體重不用捲動就在分頁列上方，點擊次數沒有變多
   合成資料。執行：node dev/tabbar-test.js        略過截圖：node dev/tabbar-test.js --no-shots */
const fs=require('fs'),path=require('path');
const {open,close,sampleSeed,check,summary,SRC}=require('./harness');
const {scan}=require('./a11y');
const SHOTS=path.join(__dirname,'screenshots'),NOSHOTS=process.argv.includes('--no-shots');
const T='2026-10-30',NOW=T+'T12:40:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const TITLES={today:'',weight:'體重與體脂',exercise:'運動紀錄',meals:'飲食',exams:'定期檢查',meds:'用藥',summary:'回診摘要',setup:'設定與備份'};
const TABS=[['today','今天'],['weight','體重'],['exams','檢查'],['meds','用藥'],['more','更多']],MORE=['exercise','meals','summary','setup'];
const tab=t=>`#tabbar [data-tab="${t}"]`;
const LABS=['L1–L4 BMD','L1–L4 T','L1–L4 Z','左股骨頸 BMD','左股骨頸 T','右股骨頸 BMD','右股骨頸 T','左全髖 BMD','左全髖 T','右全髖 BMD','右全髖 T'];
const bone=(date,k)=>({exam:'bone_dxa',cat:'bone',date,preset:'low',interval:12,nextDue:null,report:'',place:'測試醫院',doctor:'',note:'',labs:Object.fromEntries(LABS.map((n,i)=>[n,/BMD$/.test(n)?(0.9-i*0.01-k*0.02).toFixed(3):(-1.2-i*0.1).toFixed(1)])),createdAt:10+k,updatedAt:10});
const seed=(extra={})=>({...sampleSeed(T),'records/b1':bone('2024-11-20',0),'records/b2':bone('2025-11-25',1),
  'meddose/m1':{kind:'dose',date:'2026-09-01',dose:50,tablet:'',brand:'',reason:'',note:'',createdAt:1,updatedAt:1,deleted:false},
  ['days/'+T]:{date:T,meals:{q1:{at:Date.parse(T+'T12:00:00+08:00'),meal:'lunch',src:'camera',thumb:false,note:'',createdAt:1,attempts:{a0:{status:'done',startedAt:1,at:1001,kcalLo:400,kcalHi:600,desc:'便當',items:[],confidence:'mid',note:'',imgSrc:'photo',promptVer:1}}}},updatedAt:1},...extra});
/* 目前的頁、各分頁的標示 */
const state=page=>page.evaluate(()=>({hash:location.hash.slice(1),shown:[...document.querySelectorAll('main section.panel')].filter(s=>!s.hidden).map(s=>s.id.slice(2)),title:document.querySelector('#subTitle').textContent,
  cur:Object.fromEntries([...document.querySelectorAll('#tabbar [data-tab]')].map(b=>[b.dataset.tab,b.getAttribute('aria-current')])),more:document.querySelector('#moreSheet').open}));
const onlyCur=(st,t,v='page')=>Object.entries(st.cur).every(([k,x])=>k===t?x===v:x===null);
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
/* 頁面捲到底時，main 裡看得到的東西最低到哪裡；分頁列的上緣在哪裡 */
const atEnd=page=>page.evaluate(()=>{window.scrollTo(0,document.documentElement.scrollHeight);const tb=document.querySelector('#tabbar').getBoundingClientRect();let max=0,who='';
  for(const el of document.querySelectorAll('main *')){if(el.closest('[hidden]')||!el.checkVisibility())continue; // 收合的 details 內容不算
    const cs=getComputedStyle(el);if(cs.visibility==='hidden')continue;const b=el.getBoundingClientRect();if(b.width&&b.height&&b.bottom>max){max=b.bottom;who=el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+el.className}}
  return{max:Math.round(max),tabTop:Math.round(tb.top),tabBottom:Math.round(tb.bottom),vh:innerHeight,who,over:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
/* 每個看得到的控制項，捲進畫面後都在分頁列上方，而且點它的中心點不會點到分頁列 */
const blocked=page=>page.evaluate(()=>{window.scrollTo(0,0);const bar=document.querySelector('#tabbar'),out=[];let n=0;
  for(const el of document.querySelectorAll('main button,main input,main select,main textarea,main summary,main label.snap,main a[href]')){
    if(el.closest('[hidden]'))continue;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')continue;let b=el.getBoundingClientRect();if(!b.width||!b.height)continue;
    el.scrollIntoView({block:'nearest'});b=el.getBoundingClientRect();const top=bar.getBoundingClientRect().top;n++;
    const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
    if(b.bottom>top+0.5||(hit&&hit.closest('#tabbar')))out.push((el.id?'#'+el.id:el.tagName.toLowerCase())+' 「'+(el.textContent||el.value||'').trim().slice(0,8)+'」 bottom '+Math.round(b.bottom)+' > '+Math.round(top))}
  window.scrollTo(0,0);return{n,out}});
/* 元素的中心點點得到它自己（沒有被別的東西蓋住），而且整個在畫面內 */
const hittable=(page,sel)=>page.evaluate(sel=>{const el=document.querySelector(sel);if(!el)return{ok:false,why:'not found'};const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
  return{ok:!!hit&&(hit===el||el.contains(hit))&&b.bottom<=innerHeight+0.5&&b.top>=0,hit:hit?(hit.id||hit.tagName):null,bottom:Math.round(b.bottom),vh:innerHeight}},sel);
/* 分頁列的中心點現在點到的是什麼（對話框打開時，應該是對話框或它的背景，不是分頁列） */
const barHit=page=>page.evaluate(()=>{const b=document.querySelector('#tabbar').getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return hit?!!hit.closest('#tabbar'):false});
const shot=async(page,name)=>{if(NOSHOTS)return;fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:path.join(SHOTS,name)})};

(async()=>{
  /* ---- 1. 結構 ---- */
  {const html=fs.readFileSync(SRC,'utf8');
    check('原始碼：分頁列固定在底部、自己留 safe-area-inset-bottom、左右走 gutter',/\.tabbar\{position:fixed;left:0;right:0;bottom:0;[^}]*padding-bottom:env\(safe-area-inset-bottom,0px\)\}/.test(html)&&html.includes('<nav class="tabbar gutter" id="tabbar"'));
    check('原始碼：頁面底部留出分頁列的高度',/main\{padding-block:14px calc\(var\(--tabbar-h\) \+ \d+px\)\}/.test(html));
    check('原始碼：分頁列的顏色都走 token（沒有寫死的色碼）',!/#[0-9a-f]{3,6}|rgb/i.test((html.match(/\.tabbar[^\n]*/g)||[]).join('\n')))}
  {const {page,errors}=await open({time:NOW,width:380,height:667,cfg:{latencyComp:true,seed:seed()}});await wait(600);
    check('頂部的 #moreBtn 已移除',await page.evaluate(()=>!document.querySelector('#moreBtn')&&!document.querySelector('.morebtn')));
    const s=await page.evaluate(()=>{const nav=document.querySelector('#tabbar'),b=nav.getBoundingClientRect(),cs=getComputedStyle(nav);
      return{tag:nav.tagName,label:nav.getAttribute('aria-label'),pos:cs.position,left:b.left,right:b.right,bottom:b.bottom,vw:innerWidth,vh:innerHeight,
        tabs:[...nav.querySelectorAll('button[data-tab]')].map(x=>{const r=x.getBoundingClientRect(),g=x.querySelector('svg'),gr=g?g.getBoundingClientRect():{width:0,height:0},sp=x.querySelector('span');
          return{t:x.dataset.tab,text:x.textContent.trim(),w:r.width,h:r.height,svg:!!g&&g.getAttribute('aria-hidden')==='true'&&gr.width>=20&&gr.height>=20,label:sp?sp.getBoundingClientRect().height>0:false,cur:x.getAttribute('aria-current')}})}});
    check('分頁列是 nav，固定在畫面底部、貼齊左右',s.tag==='NAV'&&!!s.label&&s.pos==='fixed'&&s.left===0&&s.right===s.vw&&Math.round(s.bottom)===s.vh,s);
    check('五個分頁：今天、體重、檢查、用藥、更多',JSON.stringify(s.tabs.map(x=>[x.t,x.text]))===JSON.stringify(TABS),s.tabs.map(x=>[x.t,x.text]));
    check('每個分頁都有圖示（看得到的 svg）加文字',s.tabs.every(x=>x.svg&&x.label),s.tabs);
    check('每個分頁的觸控目標 ≥44×44',s.tabs.every(x=>x.w>=44&&x.h>=44),s.tabs.map(x=>[x.t,Math.round(x.w),Math.round(x.h)]));
    check('打開就是今天，只有「今天」標示為目前的頁',onlyCur(await state(page),'today'),(await state(page)).cur);
    const mark=await page.evaluate(()=>{const on=document.querySelector('#tabbar [aria-current]'),off=document.querySelector('#tabbar [data-tab="weight"]');return{on:getComputedStyle(on).color,off:getComputedStyle(off).color,onW:getComputedStyle(on).fontWeight,offW:getComputedStyle(off).fontWeight,line:getComputedStyle(on,'::before').height}});
    check('目前的頁不只靠顏色標示：字重加粗、上緣有一條線',mark.on!==mark.off&&+mark.onW>=700&&+mark.offW<700&&parseFloat(mark.line)>=2,mark);

    /* ---- 2. 每個分頁到對應頁 ---- */
    for(const t of ['weight','exams','meds','today']){
      await page.click(tab(t));await wait(250);const st=await state(page);
      check(`分頁列 → ${TABS.find(x=>x[0]===t)[1]}：只顯示這一頁、標題正確、只有這個分頁標示為目前的頁`,JSON.stringify(st.shown)===JSON.stringify([t])&&st.title===TITLES[t]&&onlyCur(st,t)&&!st.more,st)}
    await page.click(tab('more'));await wait(300);
    const sheet=await page.evaluate(()=>({open:document.querySelector('#moreSheet').open,items:[...document.querySelectorAll('#moreSheet .menu button')].map(b=>[b.dataset.nav,b.childNodes[0].textContent.trim()]),
      date:{label:document.querySelector('#moreSheet label[for="dPick"]')?.textContent,value:document.querySelector('#dPick').value,max:document.querySelector('#dPick').max},shown:[...document.querySelectorAll('main section.panel')].filter(s=>!s.hidden).map(s=>s.id.slice(2))}));
    check('更多：打開原本的面板，頁面不變',sheet.open&&JSON.stringify(sheet.shown)===JSON.stringify(['today']),sheet);
    check('更多：裡面是運動紀錄、飲食、回診摘要、設定與備份',JSON.stringify(sheet.items)===JSON.stringify([['exercise','運動紀錄'],['meals','飲食'],['summary','回診摘要'],['setup','設定與備份']]),sheet.items);
    check('更多：有「選擇日期補登」，預設是目前的日期、不能選未來',sheet.date.label==='選擇日期補登'&&sheet.date.value===T&&sheet.date.max===T,sheet.date);
    await page.mouse.click(190,30);await wait(250);
    check('更多：點背景關閉',!(await state(page)).more);
    for(const p of MORE){
      await page.click(tab('more'));await wait(250);await page.click(`#moreSheet [data-nav="${p}"]`);await wait(300);const st=await state(page);
      check(`更多 → ${TITLES[p]}：只顯示這一頁、標題正確、面板關閉、「更多」標示為目前的頁`,JSON.stringify(st.shown)===JSON.stringify([p])&&st.title===TITLES[p]&&!st.more&&onlyCur(st,'more','true'),st);
      await page.click(tab('more'));await wait(250);
      check(`更多（在${TITLES[p]}）：面板裡這一列標示為目前的頁`,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('#moreSheet [aria-current]')].map(b=>b.dataset.nav)))===JSON.stringify([p]));
      await page.mouse.click(190,30);await wait(200)}
    await page.click(tab('today'));await wait(250);
    check('從「更多」裡的頁按「今天」：回到今天頁',JSON.stringify((await state(page)).shown)===JSON.stringify(['today'])&&onlyCur(await state(page),'today'));
    /* 選擇日期補登 */
    await page.click(tab('more'));await wait(250);await page.fill('#dPick','2026-10-20');await page.dispatchEvent('#dPick','change');await wait(300);
    let td=await page.textContent('#tDate');
    check('更多 → 選擇日期補登：今天頁切到 10/20，標示補登',td.includes('10月20日')&&td.includes('補登')&&!(await state(page)).more&&onlyCur(await state(page),'today'),td);
    await page.click(tab('weight'));await wait(200);await page.click(tab('today'));await wait(250);
    check('補登中切到別頁再回來：還是補登的那一天',(await page.textContent('#tDate')).includes('10月20日'));
    await page.click(tab('today'));await wait(250);td=await page.textContent('#tDate');
    check('已經在今天頁時再按「今天」：回到今天的日期',td.includes('10月30日')&&!td.includes('補登'),td);
    check('導覽：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}
  for(const [hash,t,v] of [['meds','meds','page'],['exams','exams','page'],['setup','more','true'],['meals','more','true']]){
    const {page}=await open({time:NOW,width:380,height:667,hash,cfg:{latencyComp:true,seed:seed()}});await wait(500);const st=await state(page);
    check(`直接載入 #${hash}：顯示這一頁，「${TABS.find(x=>x[0]===t)[1]}」標示為目前的頁`,JSON.stringify(st.shown)===JSON.stringify([hash])&&onlyCur(st,t,v),st);
    await page.context().close()}

  /* ---- 3. 380×667，淺色與深色：水平捲動、被分頁列擋住的元素、toast ---- */
  for(const scheme of ['light','dark']){
    for(const p of Object.keys(TITLES)){
      const {page,errors}=await open({time:NOW,width:380,height:667,scheme,hash:p==='today'?'':p,cfg:{latencyComp:true,seed:seed()}});await wait(700);
      if(p==='exams'){await page.click('[data-hist="bone_dxa"]');await wait(200)}
      const label=`380×667 ${scheme} ${TITLES[p]||'今天'}`;
      const a=await page.evaluate(`(${scan.toString()})()`);
      check(`${label}：沒有水平捲動、觸控目標 ≥44、文字對比足夠`,(await overflow(page))<=0&&!a.small.length&&!a.low.length,{over:await overflow(page),small:a.small.slice(0,6),low:a.low.slice(0,6)});
      const b=await blocked(page);
      check(`${label}：${b.n} 個控制項捲進畫面後都在分頁列上方，沒有被擋住`,b.n>0&&!b.out.length,b.out.slice(0,6));
      const e=await atEnd(page);
      check(`${label}：捲到底時，最後的內容在分頁列上方；分頁列貼齊畫面底部；仍沒有水平捲動`,e.max<=e.tabTop&&e.tabBottom===e.vh&&e.over<=0,e);
      if(p==='today'||p==='exams'||p==='setup'){await page.evaluate(()=>window.scrollTo(0,0));await wait(100);await shot(page,`380x667-${scheme}-tabbar-${p}.png`)}
      if(p==='exams'){await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await wait(100);await shot(page,`380x667-${scheme}-tabbar-exams-end.png`)}
      if(p==='today'){
        /* toast 浮在分頁列上方，按鈕按得到 */
        await page.evaluate(()=>window.scrollTo(0,0));await page.click('#medBtn');await wait(350);
        const t=await page.evaluate(()=>{const el=document.querySelector('#toast'),b=el.getBoundingClientRect(),bar=document.querySelector('#tabbar').getBoundingClientRect(),btn=el.querySelector('button'),r=btn.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
          return{hidden:el.hidden,bottom:Math.round(b.bottom),tabTop:Math.round(bar.top),text:el.textContent,hit:hit===btn,over:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
        check(`${label}：toast 在分頁列上方，「撤銷」按得到`,!t.hidden&&t.bottom<=t.tabTop&&t.hit&&t.over<=0,t);
        await shot(page,`380x667-${scheme}-tabbar-toast.png`);
        await page.click('#toastActs button');await wait(300);
        await page.click(tab('more'));await wait(350);
        const m=await page.evaluate(`(${scan.toString()})()`);
        check(`${label} 更多面板：沒有水平捲動、觸控目標 ≥44、文字對比足夠`,(await overflow(page))<=0&&!m.small.length&&!m.low.length,{small:m.small.slice(0,6),low:m.low.slice(0,6)});
        await shot(page,`380x667-${scheme}-tabbar-more.png`);
        await page.mouse.click(190,30);await wait(200)}
      check(`${label}：沒有 JS 錯誤`,!errors.length,errors);
      await page.context().close()}

    /* ---- 4. 對話框打開時，分頁列不蓋住儲存鍵 ---- */
    {const {page,errors}=await open({time:NOW,width:380,height:667,scheme,cfg:{latencyComp:true,seed:seed()}});await wait(700);
      const dialogs=[
        ['體重面板','#wSheet','#wsSave',()=>page.click('[data-wslot="am"]')],
        ['檢查紀錄（骨密度，欄位最多）','#dlgRec','#btnSave',()=>page.evaluate(()=>openRecord('bone_dxa'))],
        ['劑量變更','#dlgDose','#dSave',()=>page.evaluate(()=>openDose())],
        ['餐點','#dlgMeal','#mSave',()=>page.evaluate(d=>openMeal('q1',d),T)],
        ['相簿的時間','#dlgAlbum','#aOk',()=>page.evaluate(()=>document.querySelector('#dlgAlbum').showModal())],
        ['更多','#moreSheet','#dPick',()=>page.click(tab('more'))]];
      for(const [name,dlg,btn,openIt] of dialogs){
        await openIt();await wait(400);
        const isOpen=await page.evaluate(s=>document.querySelector(s).open,dlg),h=await hittable(page,btn),bar=await barHit(page);
        check(`380×667 ${scheme} ${name}：對話框底部的按鍵在畫面內、按得到，沒有被分頁列蓋住`,isOpen&&h.ok&&!bar,{isOpen,h,barOnTop:bar});
        if(dlg==='#dlgRec'){
          await page.evaluate(()=>{document.querySelector('#fDate').value=''});await page.click('#btnSave');await wait(250);
          const t=await page.evaluate(()=>{const el=document.querySelector('#toast'),b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return{in:!!el.closest('#dlgRec'),hidden:el.hidden,hit:!!hit&&el.contains(hit),bottom:Math.round(b.bottom),vh:innerHeight}});
          check(`380×667 ${scheme} ${name}：對話框裡的 toast 看得到、在畫面內`,t.in&&!t.hidden&&t.hit&&t.bottom<=t.vh,t);
          await shot(page,`380x667-${scheme}-tabbar-dialog.png`)}
        await page.evaluate(s=>document.querySelector(s).close(),dlg);await wait(200)}
      check(`380×667 ${scheme} 對話框：沒有 JS 錯誤`,!errors.length,errors);
      await page.context().close()}
  }

  /* ---- 5. 今天畫面的標準：每次記錄 ≤3 次點擊，要點的東西不用捲動就在分頁列上方 ---- */
  for(const [time,name,slot] of [[T+'T07:30:00+08:00','早上','am'],[T+'T22:10:00+08:00','晚上','pm']]){
    const base=sampleSeed(T);if(slot==='pm')base['days/'+T]={date:T,am:{w:52.4,bf:24.1,at:'07:10'},med:{taken:true,at:'07:20',dose:50},updatedAt:1};
    const {page,doc,errors}=await open({time,width:380,height:667,cfg:{latencyComp:true,seed:base}});await wait(700);
    const v=await page.evaluate(()=>{const top=document.querySelector('#tabbar').getBoundingClientRect().top,r=s=>Math.round(document.querySelector(s).getBoundingClientRect().bottom);return{y:scrollY,top:Math.round(top),am:r('[data-wslot="am"]'),pm:r('[data-wslot="pm"]'),med:r('#medBtn')}});
    check(`${name}（380×667）：打開不用捲動，體重兩格與服藥列都在分頁列上方`,v.y===0&&v.am<=v.top&&v.pm<=v.top&&v.med<=v.top,v);
    let n=0;const tap=async s=>{n++;await page.click(s)};
    await tap(`[data-wslot="${slot}"]`);await wait(350);
    check(`${name}：體重面板的儲存鍵在畫面內，沒有被蓋住`,(await hittable(page,'#wsSave')).ok,await hittable(page,'#wsSave'));
    /* 晚上的預設值是推估的，照原本的規則要先撥一下刻度尺才能存；早上是上次的量測值，可以直接存 */
    if(slot==='pm')await tap('[data-step="1"]');
    await tap('#wsSave');await wait(450);
    const d=await doc('days/'+T),want=slot==='pm'?3:2;
    check(`${name}體重：${want} 次點擊就存好，和改版前相同（標準是 ≤3 次）`,n===want&&n<=3&&typeof d?.[slot]?.w==='number'&&!(await page.evaluate(()=>document.querySelector('#wSheet').open)),{n,slot:d?.[slot]});
    if(slot==='am'){n=0;await tap('#medBtn');await wait(350);const d2=await doc('days/'+T);
      check('服藥：1 次點擊就存好',n===1&&d2?.med?.taken===true,{n,med:d2?.med});
      check('早上記完：標題是完成的狀態，不用再做別的',(await page.textContent('#headline')).trim().length>0&&await page.evaluate(()=>document.querySelector('#headline').classList.contains('done')),await page.textContent('#headline'))}
    check(`${name}：沒有 JS 錯誤`,!errors.length,errors);
    await page.context().close()}

  /* ---- 6. 寬螢幕：分頁列置中，各頁寬度不同時位置不變 ---- */
  {const {page}=await open({time:NOW,width:1280,height:900,mobile:false,cfg:{latencyComp:true,seed:seed()}});await wait(600);
    const pos=()=>page.evaluate(()=>[...document.querySelectorAll('#tabbar button')].map(b=>Math.round(b.getBoundingClientRect().left)));
    const a=await pos();await page.click(tab('exams'));await wait(250);const b=await pos(),sc=await page.evaluate(`(${scan.toString()})()`);
    check('1280 寬：分頁列在今天頁與定期檢查頁的位置相同；沒有水平捲動、觸控目標與對比足夠',JSON.stringify(a)===JSON.stringify(b)&&(await overflow(page))<=0&&!sc.small.length&&!sc.low.length,{a,b,small:sc.small.slice(0,4),low:sc.low.slice(0,4)});
    await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
