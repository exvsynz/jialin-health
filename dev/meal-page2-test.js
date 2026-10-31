/* C 階段：飲食頁、單餐畫面、估算的錯誤與重新估算、跨裝置競爭、時間與相簿（Playwright + mock）。合成資料與合成照片。
   執行：node dev/meal-page2-test.js        略過截圖：node dev/meal-page2-test.js --no-shots */
const {open,close,check,summary}=require('./harness');
const fs=require('fs'),path=require('path'),{scan}=require('./a11y');const SHOTS=path.join(__dirname,'screenshots');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tap=(page,sel)=>page.evaluate(s=>document.querySelector(s).click(),sel);
const toastText=page=>page.textContent('#toastText').catch(()=>'');
const T='2026-10-30',NOW='2026-10-30T12:40:00+08:00',NOWMS=Date.parse(NOW);
const J=(lo,hi,o={})=>JSON.stringify({desc:'便當',items:[{name:'白飯',portion:'1 碗'}],kcalLo:lo,kcalHi:hi,confidence:'mid',...o});
const done=(id,startedAt,lo,hi,o={})=>({[id]:{status:'done',startedAt,at:startedAt+1000,kcalLo:lo,kcalHi:hi,desc:'便當',items:[],confidence:'mid',note:'',imgSrc:'photo',promptVer:1,...o}});
const meal=(at,o={})=>({at:Date.parse(at),meal:'lunch',src:'camera',thumb:true,thumbBytes:100,note:'',createdAt:1,...o});
/* 1×1 的合成縮圖（PNG） */
const TH='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
async function photo(page,w,h){const b64=await page.evaluate(([w,h])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#c98b3a';x.fillRect(0,0,w,h);x.fillStyle='#fff';x.fillRect(w/3,h/3,w/3,h/3);return c.toDataURL('image/jpeg',0.9).split(',')[1]},[w,h]);
  return{name:'meal.jpg',mimeType:'image/jpeg',buffer:Buffer.from(b64,'base64')}}
async function snap(page,file){const [fc]=await Promise.all([page.waitForEvent('filechooser',{timeout:3000}),page.click('#mealSnap')]);await fc.setFiles(file)}
const mealsOf=d=>Object.entries((d&&d.meals)||{});
const atts=m=>Object.entries(m.attempts||{}).map(([id,a])=>({id,...a})).sort((a,b)=>a.startedAt-b.startedAt||(a.id<b.id?-1:1));
const goMeals=async page=>{await page.evaluate(()=>{location.hash='meals'});await wait(500)};

(async()=>{
  /* ---- 4.4 的每一種錯誤：顯示的文字與按鈕（種好的失敗紀錄） ---- */
  {const codes=['not_granted','sampling_disabled','images_unavailable','rate_limited','session_expired','upstream_error','cancelled','invalid','empty_completion','refused','image_rejected','invalid_request','queue_overflow','tools_unavailable','some_new_code'];
    const ms={};codes.forEach((c,i)=>ms['e'+i]=meal(`2026-10-30T${String(5+i).padStart(2,'0')}:00:00+08:00`,{attempts:{a:{status:'failed',startedAt:1,err:c,note:''}}}));
    const {page}=await open({time:'2026-10-30T23:00:00+08:00',hash:'meals',cfg:{latencyComp:true,seed:{['days/'+T]:{date:T,meals:ms}}}});await wait(900);
    const rows=await page.evaluate(()=>[...document.querySelectorAll('#mealDays li')].map(li=>({t:li.querySelector('.mact span')?.textContent,b:[...li.querySelectorAll('.mact button')].map(b=>b.textContent)})));
    const want={not_granted:['沒有允許使用 Claude，可以手動填熱量',[]],sampling_disabled:['這個檢視無法估算，可以手動填熱量',[]],images_unavailable:['這個檢視無法估算，可以手動填熱量',[]],
      rate_limited:['估算次數太多，稍後再估',['再估一次']],session_expired:['請重新登入 claude.ai 後再估',['再估一次']],upstream_error:['估算中斷',['再估一次']],cancelled:['已停止',['再估一次']],invalid:['估算結果看不懂',['再估一次']],
      empty_completion:['沒有估算結果，可以補充份量再估，或手動填熱量',['補充份量']],refused:['這張照片沒有估算結果，可以補充份量再估，或手動填熱量',['補充份量']],
      image_rejected:['這張照片無法估算，可以手動填熱量',[]],invalid_request:['估算沒有完成，可以手動填熱量',[]],queue_overflow:['估算沒有完成，可以手動填熱量',[]],tools_unavailable:['估算沒有完成，可以手動填熱量',[]],some_new_code:['估算中斷',['再估一次']]};
    codes.forEach((c,i)=>check('錯誤 '+c+'：文字與按鈕',JSON.stringify(rows[i])===JSON.stringify({t:want[c][0],b:want[c][1]}),rows[i]));
    await page.context().close()}

  /* ---- 實際呼叫的錯誤：not_granted 之後隱藏、沒有自動重試；upstream_error 再估一次用 cache:false、用記憶體裡的照片 ---- */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{consent:'deny'}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(2500);
    const [id,m]=mealsOf(await doc('days/'+T))[0]||[];
    check('not_granted：餐點與縮圖都在，估算記 not_granted',m&&atts(m)[0].err==='not_granted'&&!!(await doc('mealthumbs/'+id)),m&&atts(m));
    check('not_granted：「拍一餐」隱藏，之後沒有任何呼叫',await page.evaluate(()=>document.querySelector('#mealSnap').hidden)&&(await page.evaluate(()=>window.__mock.sampleCalls.length))===1);
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{replies:[{error:'upstream_error'},J(450,650)]}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(2000);await goMeals(page);
    await tap(page,'[data-retry]');await wait(1800);
    const [id,m]=mealsOf(await doc('days/'+T))[0]||[];const a=atts(m),calls=await page.evaluate(()=>window.__mock.sampleCalls);
    check('upstream_error → 再估一次：新的估算、cache:false、用記憶體裡的照片（1200 寬不放大）',a.length===2&&a[1].status==='done'&&a[1].imgSrc==='photo'&&calls[1].opts.cache===false&&calls[1].images[0].w===1200,{a,opts:calls.map(c=>c.opts)});
    check('再估一次成功後：顯示熱量，失敗那次仍留在紀錄裡',/約 450–650 kcal/.test(await page.textContent('#mealDays'))&&a[0].err==='upstream_error');
    await page.context().close()}
  /* 解析失敗：第一次的壞回覆會被 sample 快取；再估一次帶 cache:false，一定重問 */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{replies:['看起來是便當',J(500,700)]}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(2000);await goMeals(page);
    check('解析失敗：顯示「估算結果看不懂」與「再估一次」',/估算結果看不懂/.test(await page.textContent('#mealDays'))&&!!(await page.$('[data-retry]')));
    await tap(page,'[data-retry]');await wait(1800);
    const ups=await page.evaluate(()=>window.__mock.sampleCalls.filter(c=>c.upstream).length),[,m]=mealsOf(await doc('days/'+T))[0]||[];
    check('再估一次：沒有拿到快取裡的壞回覆，重新到上游並成功',ups===2&&atts(m)[1].status==='done',{ups,a:atts(m)});
    await page.context().close()}
  /* empty_completion：沒有原樣重送；補充份量後才能重新估算 */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{replies:['   ',J(300,500)]}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(2000);await goMeals(page);
    check('empty_completion：沒有「再估一次」，只有「補充份量」',!(await page.$('[data-retry]'))&&!!(await page.$('[data-note]')));
    await tap(page,'[data-note]');await wait(400);
    const st=await page.evaluate(()=>({open:document.querySelector('#dlgMeal').open,focus:document.activeElement?.id,re:document.querySelector('#mReest').disabled}));
    check('補充份量：打開單餐畫面並把游標放在補充欄；補充沒變時「重新估算」停用',st.open&&st.focus==='mNote'&&st.re,st);
    await page.fill('#mNote','半碗飯\n「兩人分」');await wait(100);
    check('補充改了以後：「重新估算」可以按',!(await page.evaluate(()=>document.querySelector('#mReest').disabled)));
    await tap(page,'#mReest');await wait(1800);
    const [,m]=mealsOf(await doc('days/'+T))[0]||[],a=atts(m),calls=await page.evaluate(()=>window.__mock.sampleCalls);
    check('重新估算：提示詞帶清理過的補充、cache:false，估算與餐點都記下補充',calls[1].input.includes('「半碗飯 兩人分」')&&calls[1].opts.cache===false&&a[1].note==='半碗飯 兩人分'&&m.note==='半碗飯 兩人分'&&a[1].status==='done',{note:m.note,a});
    check('重新估算之後：補充沒變，按鈕又停用',await page.evaluate(()=>document.querySelector('#mReest').disabled));
    await page.context().close()}

  /* ---- 快取：同一張照片 5 分鐘內加兩次，上游只呼叫 1 次 ---- */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true}});await wait(700);
    const f=await photo(page,1200,900);await snap(page,f);await wait(1800);await snap(page,f);await wait(1800);
    const calls=await page.evaluate(()=>window.__mock.sampleCalls),ms=mealsOf(await doc('days/'+T));
    check('同一張照片 5 分鐘內加兩次：上游 1 次，兩餐都有結果',calls.filter(c=>c.upstream).length===1&&calls[1].cached&&ms.length===2&&ms.every(([,m])=>atts(m)[0].status==='done'),calls.map(c=>({up:c.upstream,cached:c.cached})));
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{noCache:true}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(1800);
    check('快取沒有命中（盡力而為）時：第一次估算照常成功',atts(mealsOf(await doc('days/'+T))[0][1])[0].status==='done');
    await page.context().close()}

  /* ---- 停止 ---- */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{delay:4000}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(1200);await goMeals(page);
    check('估算中：顯示「估算中…」與「停止」',/估算中…/.test(await page.textContent('#mealDays'))&&!!(await page.$('[data-stop]')));
    const today=await page.evaluate(()=>{location.hash='';return 0});await wait(300);
    check('今天頁：「今天 1 餐・1 餐估算中」',(await page.textContent('#mealSub'))==='今天 1 餐・1 餐估算中',await page.textContent('#mealSub'));
    await goMeals(page);await tap(page,'[data-stop]');await wait(800);
    const [,m]=mealsOf(await doc('days/'+T))[0]||[];
    check('停止：記成 cancelled，顯示「已停止」與「再估一次」',atts(m)[0].err==='cancelled'&&/已停止/.test(await page.textContent('#mealDays'))&&!!(await page.$('[data-retry]')),atts(m));
    await page.context().close()}

  /* ---- 很久沒有更新：不改資料；重新估算用縮圖；舊的晚到不取代新的 ---- */
  {const seed={['days/'+T]:{date:T,meals:{q1:meal('2026-10-30T12:00:00+08:00',{attempts:{old:{status:'pending',startedAt:NOWMS-7*60000,imgSrc:'photo',note:''}}})}},'mealthumbs/q1':{date:T,thumb:TH,createdAt:1}};
    const {page,doc}=await open({time:NOW,hash:'meals',cfg:{latencyComp:true,seed,sample:{reply:J(600,800)}}});await wait(900);
    check('pending 超過 6 分鐘：顯示「很久沒有更新」與「重新估算」',/估算很久沒有更新，可能還在另一台裝置進行/.test(await page.textContent('#mealDays'))&&(await page.textContent('[data-retry]'))==='重新估算');
    check('很久沒有更新：資料庫裡仍是 pending',atts((await doc('days/'+T)).meals.q1)[0].status==='pending');
    await tap(page,'[data-retry]');await wait(1800);
    let a=atts((await doc('days/'+T)).meals.q1);
    check('重新估算：新的 attemptId、imgSrc 是 thumb，舊的那次仍是 pending',a.length===2&&a[1].id!=='old'&&a[1].imgSrc==='thumb'&&a[1].status==='done'&&a[0].status==='pending',a);
    await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(window.__mock.store.get('days/2026-10-30')));Object.assign(d.meals.q1.attempts.old,{status:'done',at:Date.now(),kcalLo:100,kcalHi:150,desc:'舊的',items:[],confidence:'low'});window.__mock.externalSet('days/2026-10-30',d)});
    await wait(600);
    check('舊的估算之後才完成：畫面仍是較新的結果',/約 600–800 kcal/.test(await page.textContent('#mealDays'))&&!/100–150/.test(await page.textContent('#mealDays')));
    await page.context().close()}

  /* ---- 跨裝置：A 估算中、B 手動改熱量，A 之後寫回：手動值保留 ---- */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{delay:2500,reply:J(700,900)}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(1200);
    const [id]=mealsOf(await doc('days/'+T))[0];
    await page.evaluate(id=>{const d=JSON.parse(JSON.stringify(window.__mock.store.get('days/2026-10-30')));d.meals[id].manual={kcalLo:350,kcalHi:350,at:Date.now()};window.__mock.externalSet('days/2026-10-30',d)},id);
    await wait(2500);const m=(await doc('days/'+T)).meals[id];await goMeals(page);
    check('A 的估算晚於 B 的手動值寫回：手動值保留，估算存在自己的 key',m.manual?.kcalLo===350&&atts(m)[0].status==='done'&&atts(m)[0].kcalLo===700,{manual:m.manual,a:atts(m)});
    check('畫面顯示手動值',/約 350 kcal（手動）/.test(await page.textContent('#mealDays')),await page.textContent('#mealDays'));
    await page.context().close()}
  /* A、B 先後重新估算，B 先完成、A 後完成：顯示 B；A 的取消晚到也一樣 */
  {const seed={['days/'+T]:{date:T,meals:{r1:meal('2026-10-30T12:00:00+08:00',{attempts:{
      ...done('a0',NOWMS-60000,400,500),A:{status:'pending',startedAt:NOWMS-20000,imgSrc:'photo',note:''},B:{status:'pending',startedAt:NOWMS-10000,imgSrc:'photo',note:''}}})}}};
    const {page}=await open({time:NOW,hash:'meals',cfg:{latencyComp:true,seed}});await wait(800);
    const setAtt=(k,v)=>page.evaluate(([k,v])=>{const d=JSON.parse(JSON.stringify(window.__mock.store.get('days/2026-10-30')));Object.assign(d.meals.r1.attempts[k],v);window.__mock.externalSet('days/2026-10-30',d)},[k,v]);
    await setAtt('B',{status:'done',at:NOWMS,kcalLo:800,kcalHi:900,desc:'B',items:[],confidence:'mid'});await wait(300);
    await setAtt('A',{status:'done',at:NOWMS+5000,kcalLo:200,kcalHi:300,desc:'A',items:[],confidence:'mid'});await wait(400);
    check('B 先完成、A 後完成：顯示 B（startedAt 較大）',/約 800–900 kcal/.test(await page.textContent('#mealDays')));
    await setAtt('A',{status:'failed',err:'cancelled'});await wait(400);
    const t=await page.textContent('#mealDays');
    check('A 的取消晚於 B 的成功：熱量與狀態都以 B 為準',/約 800–900 kcal/.test(t)&&!/已停止/.test(t),t);
    await page.context().close()}
  /* B 改了補充說明並重新估算但失敗：熱量仍是先前的結果，標「補充份量前的估算」 */
  {const seed={['days/'+T]:{date:T,meals:{s1:meal('2026-10-30T12:00:00+08:00',{note:'半碗',attempts:{...done('a0',1,400,600),b:{status:'failed',startedAt:2,err:'upstream_error',note:'半碗'}}})}}};
    const {page}=await open({time:NOW,hash:'meals',cfg:{latencyComp:true,seed}});await wait(800);
    const t=await page.textContent('#mealDays');
    check('補充後重新估算失敗：熱量仍在，標「補充份量前的估算」，另有失敗訊息',/約 400–600 kcal・信心中（補充份量前的估算）/.test(t)&&/估算中斷/.test(t),t);
    await page.context().close()}

  /* ---- 手動值、改回估算值、秤重參考值；單餐畫面不被快照蓋掉 ---- */
  {const seed={['days/'+T]:{date:T,meals:{h1:meal('2026-10-30T12:00:00+08:00',{attempts:done('a0',1,400,600)})}}};
    const {page,doc}=await open({time:NOW,hash:'meals',cfg:{latencyComp:true,seed}});await wait(800);
    await tap(page,'[data-mo="h1"]');await wait(300);
    await page.fill('#mLo','300');await page.fill('#mRef','520');await page.fill('#mRefSrc','便當標示');
    await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(window.__mock.store.get('days/2026-10-30')));d.meals.h1.note='另一台寫的';window.__mock.externalSet('days/2026-10-30',d)});await wait(400);
    check('單餐畫面編輯中收到另一台的快照：正在編輯的欄位不被蓋掉',(await page.inputValue('#mLo'))==='300'&&(await page.inputValue('#mRef'))==='520');
    await tap(page,'#mSave');await wait(700);let m=(await doc('days/'+T)).meals.h1;
    check('只填最低：最低最高相同，存成 manual；秤重參考值與來源；沒改的欄位不送（另一台的 note 保留）',m.manual?.kcalLo===300&&m.manual.kcalHi===300&&m.ref?.kcal===520&&m.ref.src==='便當標示'&&m.note==='另一台寫的'&&!('meal' in (await page.evaluate(()=>window.__mock.writes.slice(-1)[0].data.meals.h1))),{m,last:await page.evaluate(()=>window.__mock.writes.slice(-1)[0].data)});
    await tap(page,'[data-mo="h1"]');await wait(300);
    check('有手動值與估算時：「改回估算值」出現',!(await page.evaluate(()=>document.querySelector('#mRevert').hidden)));
    await tap(page,'#mRevert');await wait(600);m=(await doc('days/'+T)).meals.h1;
    check('改回估算值：manual 是 null，畫面回到估算值',m.manual===null&&/約 400–600 kcal/.test(await page.textContent('#mealDays')),m.manual);
    await page.fill('#mLo','700');await page.fill('#mHi','100');await tap(page,'#mSave');await wait(300);
    check('最低大於最高：不存，提示',/最低不能大於最高/.test(await toastText(page)));
    await page.context().close()}
  /* ---- 5 次上限；截斷 ---- */
  {const at={};for(let i=0;i<5;i++)Object.assign(at,i<4?done('x'+i,i+1,400,600,{note:'n'+i}):{x4:{status:'failed',startedAt:5,err:'upstream_error',note:'n4'}});
    const seed={['days/'+T]:{date:T,meals:{f1:meal('2026-10-30T12:00:00+08:00',{note:'n4',attempts:at})}}};
    const {page}=await open({time:NOW,hash:'meals',cfg:{latencyComp:true,seed}});await wait(800);
    check('估了 5 次：沒有「再估一次」',!(await page.$('[data-retry]')));
    await tap(page,'[data-mo="f1"]');await wait(300);await page.fill('#mNote','新的補充');await wait(100);
    check('估了 5 次：補充改了「重新估算」仍停用，資訊寫出次數',await page.evaluate(()=>document.querySelector('#mReest').disabled)&&/估了 5 次（最多 5 次）/.test(await page.textContent('#mInfo')));
    await page.context().close()}
  {const {page}=await open({time:NOW,cfg:{latencyComp:true,sample:{reply:{text:J(450,650),truncated:true}}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(1800);await goMeals(page);
    check('截斷但完整合規：採用並標「回覆不完整」',/約 450–650 kcal・信心中（回覆不完整）/.test(await page.textContent('#mealDays')));
    await page.context().close()}

  /* ---- 刪除與撤銷 ---- */
  {const seed={['days/'+T]:{date:T,meals:{d1:meal('2026-10-30T12:00:00+08:00',{attempts:done('a0',1,400,600)})}},'mealthumbs/d1':{date:T,thumb:TH,createdAt:1}};
    const {page,doc}=await open({time:NOW,hash:'meals',cfg:{latencyComp:true,seed}});await wait(800);
    await tap(page,'[data-mo="d1"]');await wait(300);await tap(page,'#mDel');await wait(600);
    check('刪除：直接軟刪除，沒有確認視窗，縮圖還在',(await doc('days/'+T)).meals.d1.deleted===true&&!!(await doc('mealthumbs/d1'))&&!(await page.evaluate(()=>document.querySelector('#dlgMeal').open)));
    check('刪除：飲食頁不再顯示',!(await page.$('[data-mo="d1"]')));
    await page.click('#toastActs button');await wait(600);
    check('撤銷：餐點回來',(await doc('days/'+T)).meals.d1.deleted===false&&!!(await page.$('[data-mo="d1"]')));
    await page.context().close()}

  /* ---- 跳脫 ---- */
  {const {page}=await open({time:NOW,cfg:{latencyComp:true,sample:{reply:J(400,500,{desc:'<img src=x onerror="window.__x=1">',items:[{name:'<b>粗</b>',portion:'<i>1</i>'}]})}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(1800);await goMeals(page);await tap(page,'[data-mo]');await wait(300);
    const r=await page.evaluate(()=>({x:window.__x,imgs:[...document.querySelectorAll('#mealDays img,#mItems img,#mItems b')].filter(e=>!e.dataset.th).length,txt:document.querySelector('#mealDays').textContent+document.querySelector('#mItems').textContent}));
    check('模型回覆含 HTML：只顯示文字，沒有插入元素',!r.x&&r.imgs===0&&r.txt.includes('<img src=x')&&r.txt.includes('<b>粗</b>'),r);
    await page.context().close()}

  /* ---- 時間：凌晨的時間屬於下一個日曆日，餐點留在同一份文件；非台北時區相同 ---- */
  for(const tz of [undefined,'America/New_York']){
    const seed={'days/2026-10-31':{date:'2026-10-31',meals:{t1:meal('2026-10-31T21:00:00+08:00',{meal:'snack',attempts:done('a0',1,200,300)})}}};
    const {page,doc}=await open({time:'2026-11-01T10:00:00+08:00',hash:'meals',tz,cfg:{latencyComp:true,seed}});await wait(800);
    await tap(page,'[data-mo="t1"]');await wait(300);await page.fill('#mTime','02:00');await tap(page,'#mSave');await wait(700);
    const m=(await doc('days/2026-10-31')).meals.t1;
    check('改時間成 02:00（'+(tz||'台北')+'）：存成 11/1 02:00，仍在 10/31 的文件',m.at===Date.parse('2026-11-01T02:00:00+08:00')&&!(await doc('days/2026-11-01')),{at:new Date(m.at).toISOString()});
    await tap(page,'[data-mo="t1"]');await wait(300);await page.fill('#mTime','04:00');await tap(page,'#mSave');await wait(700);
    check('改時間成 04:00（'+(tz||'台北')+'）：10/31 04:00',(await doc('days/2026-10-31')).meals.t1.at===Date.parse('2026-10-31T04:00:00+08:00'));
    await page.context().close()}

  /* ---- 飲食頁：合計、沒有熱量、更早的 7 天、縮圖只用 get、同時最多 4 個、讀不到顯示空框、載入中 ---- */
  {const seed={};const D=n=>{const t=new Date(Date.parse(T+'T00:00:00Z')-n*864e5);return t.toISOString().slice(0,10)};
    seed['days/'+T]={date:T,meals:{a1:meal(T+'T07:30:00+08:00',{meal:'breakfast',attempts:done('a',1,300,400)}),a2:meal(T+'T12:00:00+08:00',{attempts:done('a',1,500,700)}),a3:meal(T+'T19:00:00+08:00',{meal:'dinner',attempts:{a:{status:'failed',startedAt:1,err:'refused'}}}),
      a4:meal(T+'T15:00:00+08:00',{meal:'snack',attempts:done('a',1,100,150)}),a5:meal(T+'T16:00:00+08:00',{meal:'snack',attempts:done('a',1,100,150)}),a6:meal(T+'T17:30:00+08:00',{meal:'snack',attempts:done('a',1,100,150)})}};
    for(const id of ['a1','a2','a4','a5','a6'])seed['mealthumbs/'+id]={date:T,thumb:TH,createdAt:1};
    seed['days/'+D(9)]={date:D(9),meals:{old:meal(D(9)+'T12:00:00+08:00',{attempts:done('a',1,400,500)})}};
    const {page}=await open({time:'2026-10-30T23:00:00+08:00',hash:'meals',cfg:{latencyComp:true,latency:150,seed}});await wait(2500);
    const h=await page.evaluate(()=>[...document.querySelectorAll('#mealDays .sect-head')].map(x=>x.textContent));
    check('每天的標題：合計範圍與「1 餐沒有熱量」',h.length===1&&h[0].includes('10/30 週五')&&h[0].includes('約 1,100–1,550 kcal・1 餐沒有熱量'),h);
    check('「顯示更早的 7 天」：有更早的餐點時出現',!(await page.evaluate(()=>document.querySelector('#mealMore').hidden)));
    await tap(page,'#mealMore');await wait(600);
    check('按下後：顯示更早的那天',(await page.evaluate(()=>document.querySelectorAll('#mealDays .sect').length))===2);
    const r=await page.evaluate(()=>({reads:window.__mock.reads.filter(p=>p.includes('mealthumbs')),max:window.__mock.maxActive.mealthumbs,ls:window.__mock.listenPaths().filter(p=>p.includes('mealthumbs')),
      shown:[...document.querySelectorAll('#mealDays img[data-th]')].map(i=>[i.dataset.th,!i.hidden])}));
    check('縮圖只用 get 依 id 讀；沒有監聽、沒有查詢集合',r.reads.length>0&&r.reads.every(p=>p.startsWith('mealthumbs/'))&&r.ls.length===0,r);
    check('縮圖一次最多 4 個同時讀',r.max<=4&&r.max>=2,r.max);
    check('讀不到縮圖的餐點顯示空框（img 隱藏）；讀得到的顯示',r.shown.find(x=>x[0]==='a3')[1]===false&&r.shown.find(x=>x[0]==='a1')[1]===true,r.shown);
    await page.context().close()}
  {const {page}=await open({time:NOW,hash:'meals',cfg:{latencyComp:true,snapDelay:{days:1500}}});await wait(500);
    check('days 還沒載入：顯示「資料載入中…」，不說沒有紀錄',(await page.textContent('#mealDays')).includes('資料載入中')&&!(await page.textContent('#mealDays')).includes('沒有飲食紀錄'));
    await page.context().close()}

  /* ---- 從相簿加入 ---- */
  const album=async(page,lastModified)=>{await page.evaluate(async lm=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#88a';x.fillRect(0,0,800,600);
    const b=await new Promise(r=>c.toBlob(r,'image/jpeg',0.9));const f=new File([b],'line.jpg',{type:'image/jpeg',lastModified:lm});const dt=new DataTransfer();dt.items.add(f);
    const i=document.querySelector('#albumFile');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}))},lastModified);await wait(300)};
  {const {page,doc}=await open({time:NOW,hash:'meals',cfg:{latencyComp:true}});await wait(800);
    await album(page,Date.parse('2026-10-28T19:05:00+08:00'));
    check('相簿：lastModified 在 30 天內，預設用它的日期與時間',(await page.inputValue('#aDate'))==='2026-10-28'&&(await page.inputValue('#aTime'))==='19:05');
    await tap(page,'#aOk');await wait(2000);const [,m]=mealsOf(await doc('days/2026-10-28'))[0]||[];
    check('相簿：寫進那天的文件，src 是 album，餐別依時間（晚餐）',m&&m.src==='album'&&m.meal==='dinner'&&m.at===Date.parse('2026-10-28T19:05:00+08:00'),m);
    await album(page,Date.parse('2026-08-01T12:00:00+08:00'));
    check('相簿：超過 30 天，用目前檢視的日期加現在時間',(await page.inputValue('#aDate'))==='2026-10-30'&&(await page.inputValue('#aTime'))==='12:40');
    await page.evaluate(()=>document.querySelector('#dlgAlbum').close());
    await album(page,Date.parse('2026-11-05T12:00:00+08:00'));
    check('相簿：lastModified 在未來，同樣用目前檢視的日期',(await page.inputValue('#aDate'))==='2026-10-30');
    await page.fill('#aTime','13:30');await tap(page,'#aOk');await wait(500);
    check('相簿：時間在未來，不加入並提示',/不能在未來/.test(await toastText(page)));
    await page.context().close()}
  {const {page,doc}=await open({time:'2026-11-01T02:00:00+08:00',hash:'meals',cfg:{latencyComp:true}});await wait(800);
    await album(page,Date.parse('2026-08-01T12:00:00+08:00'));
    check('凌晨 02:00 檢視 10/31：預設 10/31 的 02:00',(await page.inputValue('#aDate'))==='2026-10-31'&&(await page.inputValue('#aTime'))==='02:00');
    await page.fill('#aTime','01:30');await tap(page,'#aOk');await wait(2000);
    const [,m]=mealsOf(await doc('days/2026-10-31'))[0]||[];
    check('凌晨補登：存成 11/1 01:30，寫進 10/31，沒有跑到 10/30',m&&m.at===Date.parse('2026-11-01T01:30:00+08:00')&&!(await doc('days/2026-10-30')),m&&new Date(m.at).toISOString());
    await page.context().close()}

  /* ---- 初步試用的對照 ---- */
  {const ms={c1:meal(T+'T08:00:00+08:00',{ref:{kcal:500,src:'標示'},attempts:done('a',1,400,600)}),c2:meal(T+'T12:00:00+08:00',{ref:{kcal:900,src:'標示'},attempts:{...done('a',1,400,600),...done('b',2,800,1000,{note:'兩人分'})}}),
      c3:meal(T+'T19:00:00+08:00',{ref:{kcal:450,src:''},attempts:done('a',1,400,500,{imgSrc:'thumb'})}),c4:meal(T+'T20:00:00+08:00',{ref:{kcal:300,src:''},attempts:{a:{status:'failed',startedAt:1,err:'refused'}}})};
    const {page}=await open({time:'2026-10-30T23:00:00+08:00',hash:'meals',cfg:{latencyComp:true,seed:{['days/'+T]:{date:T,meals:ms}}}});await wait(800);
    const t=await page.textContent('#mealCov');
    check('對照：落入、估低估高、寬度中位數、失敗、縮圖、補充後另列',t.includes('秤重參考 3 餐：2 餐落在第一次估算的範圍內（1 餐估低、0 餐估高），範圍寬度中位數 200 kcal')&&t.includes('另有 1 餐沒有估算結果')&&t.includes('其中 1 餐是用縮圖估的')&&t.includes('補充份量後再估：1 餐中 1 餐落在範圍內'),t);
    await page.context().close()}

  /* ---- 兩台裝置同一天各加一餐 ---- */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true}});await wait(700);
    await page.evaluate(()=>window.__mock.externalSet('days/2026-10-30',{date:'2026-10-30',meals:{other:{at:Date.parse('2026-10-30T08:00:00+08:00'),meal:'breakfast',src:'camera',thumb:false,note:'',createdAt:1,attempts:{}}}}));await wait(300);
    await snap(page,await photo(page,1200,900));await wait(1800);
    const ms=mealsOf(await doc('days/'+T)).map(([id])=>id);
    check('另一台先加了一餐，這台再加：兩餐都在',ms.length===2&&ms.includes('other'),ms);
    await page.context().close()}

  /* ---- 版面：380／1280 × 淺色／深色；飲食頁、單餐畫面、相簿確認、今天頁（估算中與沒有存到） ---- */
  const layoutSeed=()=>{const ms={
      l1:meal(T+'T07:40:00+08:00',{meal:'breakfast',attempts:done('a',1,320,450,{desc:'饅頭夾蛋與無糖豆漿'})}),
      l2:meal(T+'T12:20:00+08:00',{note:'半碗飯',manual:{kcalLo:520,kcalHi:520,at:1},attempts:done('a',1,600,850,{desc:'雞腿便當，白飯、三樣青菜、滷蛋',items:[{name:'白飯',portion:'約 1 碗'},{name:'滷雞腿',portion:'1 隻'},{name:'青菜',portion:'三樣各一小份'}]})}),
      l3:meal(T+'T15:30:00+08:00',{meal:'snack',attempts:{p:{status:'pending',startedAt:NOWMS-9*60000,imgSrc:'photo',note:''}}}),
      l4:meal(T+'T18:50:00+08:00',{meal:'dinner',attempts:{a:{status:'failed',startedAt:1,err:'refused',note:''}}}),
      l5:meal(T+'T20:10:00+08:00',{meal:'snack',attempts:done('a',1,null,null,{notFood:true,desc:'看起來是一張桌子'})}),
      l6:meal(T+'T21:00:00+08:00',{meal:'snack',ref:{kcal:260,src:'標示'},attempts:done('a',1,180,260,{truncated:true,desc:'一杯珍珠奶茶'})})};
    const sd={['days/'+T]:{date:T,meals:ms}};for(const k of ['l1','l2','l4','l6'])sd['mealthumbs/'+k]={date:T,thumb:TH,createdAt:1};return sd};
  for(const [w,h,tag,mobile] of [[380,820,'380',true],[1280,900,'1280',false]])for(const scheme of ['light','dark']){
    const {page,errors}=await open({time:'2026-10-30T22:30:00+08:00',hash:'meals',width:w,height:h,scheme,mobile,cfg:{latencyComp:true,seed:layoutSeed()}});await wait(900);
    const lay=async(label,shot,full=true)=>{const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      const r=await page.evaluate(`(${scan.toString()})()`);
      check(`${tag} ${scheme} ${label}：沒有水平捲動、觸控目標 ≥44px、文字對比`,overflow<=0&&!r.small.length&&!r.low.length,{overflow,small:r.small.slice(0,6),low:r.low.slice(0,6)});
      if(!process.argv.includes('--no-shots')){fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-${shot}.png`),fullPage:full})}};
    await lay('飲食頁','meals');
    await tap(page,'[data-mo="l2"]');await wait(400);await lay('單餐畫面','meal-sheet',false);
    await page.evaluate(()=>document.querySelector('#dlgMeal').close());
    await page.evaluate(()=>{document.querySelector('#aDate').value='2026-10-30';document.querySelector('#aTime').value='12:00';document.querySelector('#dlgAlbum').showModal()});await wait(300);
    await lay('相簿確認','meal-album',false);await page.evaluate(()=>document.querySelector('#dlgAlbum').close());
    check(`${tag} ${scheme} 飲食頁：沒有 JS 錯誤`,!errors.length,errors);
    await page.context().close();
    /* 今天頁：一餐估算中、一餐沒有存到 */
    const t=await open({time:NOW,width:w,height:h,scheme,mobile,cfg:{latencyComp:true,sample:{delay:20000}}});await wait(800);
    await snap(t.page,await photo(t.page,1200,900));await wait(1500);
    await t.page.evaluate(()=>{window.__mock.cfg.quota=['days/']});await snap(t.page,await photo(t.page,1000,750));await wait(1500);
    const sub=await t.page.textContent('#mealSub'),pend=await t.page.textContent('#mealPendT');
    check(`${tag} ${scheme} 今天頁：「今天 1 餐・1 餐估算中」與「1 餐沒有存到」`,sub==='今天 1 餐・1 餐估算中'&&pend==='1 餐沒有存到',{sub,pend});
    {const overflow=await t.page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);const r=await t.page.evaluate(`(${scan.toString()})()`);
      check(`${tag} ${scheme} 今天頁飲食列：沒有水平捲動、觸控目標、對比`,overflow<=0&&!r.small.length&&!r.low.length,{overflow,small:r.small.slice(0,6),low:r.low.slice(0,6)});
      if(!process.argv.includes('--no-shots'))await t.page.screenshot({path:path.join(SHOTS,`${tag}-${scheme}-today-meals.png`),fullPage:true})}
    await t.page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
