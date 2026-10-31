/* C 階段：飲食照片的頁面行為（Playwright + mock）。照片都是測試裡用 canvas 畫的合成圖，不是真實照片。
   執行：node dev/meal-page-test.js */
const {open,close,sampleSeed,check,summary}=require('./harness');
const T='2026-10-30',NOW='2026-10-30T12:40:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tap=(page,sel)=>page.evaluate(s=>document.querySelector(s).click(),sel);
const toastText=page=>page.textContent('#toastText').catch(()=>'');
/* 合成照片：kind 'plain' 色塊、'noise' 高細節雜訊；回傳 Playwright setFiles 用的物件 */
async function photo(page,w,h,kind='plain',type='image/jpeg'){
  const b64=await page.evaluate(([w,h,kind,type])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
    if(kind==='noise'){const d=x.createImageData(w,h);for(let i=0;i<d.data.length;i+=4){const v=(Math.random()*255)|0;d.data[i]=v;d.data[i+1]=(v*7)&255;d.data[i+2]=(v*13)&255;d.data[i+3]=255}x.putImageData(d,0,0);
      x.strokeStyle='#000';for(let i=0;i<w;i+=6){x.beginPath();x.moveTo(i,0);x.lineTo(w-i,h);x.stroke()}}
    else{x.fillStyle='#d9a441';x.fillRect(0,0,w,h);x.fillStyle='#fff';x.beginPath();x.arc(w/2,h/2,Math.min(w,h)/3,0,7);x.fill();x.fillStyle='#5a8f3c';x.fillRect(w*0.15,h*0.2,w*0.2,h*0.25)}
    return c.toDataURL(type,0.92).split(',')[1]},[w,h,kind,type]);
  return{name:'meal.'+(type==='image/png'?'png':'jpg'),mimeType:type,buffer:Buffer.from(b64,'base64')}}
/* 點「拍一餐」：確認點一次就打開選檔，送入照片 */
async function snap(page,file){const [fc]=await Promise.all([page.waitForEvent('filechooser',{timeout:3000}),page.click('#mealSnap')]);await fc.setFiles(file);return fc}
const mealsOf=(doc)=>Object.entries((doc&&doc.meals)||{});

(async()=>{
  /* ---- 能力檢查 ---- */
  for(const [name,sample] of [['use("sample") 是 null',{absent:true}],['limits() reject',{limitsReject:true}],['沒有 images',{images:null}],['mediaTypes 不含 image/jpeg',{images:{maxCount:1,maxInputBytes:9e6,mediaTypes:['image/png']}}]]){
    const {page}=await open({time:NOW,cfg:{latencyComp:true,sample}});await wait(600);
    check('能力檢查：'+name+' → 今天沒有餐點時，整個飲食列隱藏',await page.evaluate(()=>document.querySelector('#mealRow').hidden));
    await page.context().close()}
  {const seed={['days/'+T]:{date:T,meals:{m1:{at:Date.parse('2026-10-30T12:00:00+08:00'),meal:'lunch',note:'',createdAt:1,attempts:{a:{status:'done',startedAt:1,kcalLo:400,kcalHi:600,desc:'便當',items:[],confidence:'mid',note:''}}}}}};
    const {page}=await open({time:NOW,cfg:{latencyComp:true,seed,sample:{absent:true}}});await wait(600);
    const r=await page.evaluate(()=>({row:document.querySelector('#mealRow').hidden,snap:document.querySelector('#mealSnap').hidden,sub:document.querySelector('#mealSub').textContent}));
    check('能力檢查：不能估算但今天有餐點 → 保留列、隱藏「拍一餐」',!r.row&&r.snap&&r.sub==='今天 1 餐',r);
    await page.context().close()}
  {const {page}=await open({time:NOW,cfg:{latencyComp:true,sample:{limitsDelay:1500}}});await wait(500);
    const before=await page.evaluate(()=>({row:document.querySelector('#mealRow').hidden,dis:document.querySelector('#mealSnap').getAttribute('aria-disabled'),inp:document.querySelector('#mealFile').disabled}));
    await wait(1500);const after=await page.evaluate(()=>document.querySelector('#mealSnap').getAttribute('aria-disabled'));
    check('能力檢查完成前：飲食列已出現，「拍一餐」停用',!before.row&&before.dis==='true'&&before.inp,before);
    check('能力檢查完成後：「拍一餐」可以按',after==='false',after);
    await page.context().close()}

  /* ---- 拍一餐：寫入順序、縮圖、送出的估算、今天頁不顯示熱量 ---- */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,seed:sampleSeed(T),sample:{delay:600}}});await wait(700);
    const f=await photo(page,4000,3000);await snap(page,f);
    await wait(300);const midToast=await toastText(page);
    await wait(2500);
    const d=await doc('days/'+T),ms=mealsOf(d);
    const [id,m]=ms[0]||[];const att=m&&Object.values(m.attempts||{});
    const th=id&&await doc('mealthumbs/'+id);
    const w=await page.evaluate(()=>window.__mock.writes.map(x=>({op:x.op,path:x.path,keys:x.data&&x.data.meals?JSON.stringify(x.data.meals):''})));
    const iBase=w.findIndex(x=>x.path==='days/'+T&&x.keys.includes('"createdAt"')),iThumb=w.findIndex(x=>x.path.startsWith('mealthumbs/')),iFlag=w.findIndex(x=>x.keys.includes('"thumb":true')),iDone=w.findIndex(x=>x.keys.includes('"status":"done"'));
    check('拍一餐：存了一餐，餐別依時間是午餐、src 是 camera',ms.length===1&&m.meal==='lunch'&&m.src==='camera'&&Number.isFinite(m.at),m);
    check('拍一餐：寫入順序是 餐點 → 縮圖 → thumb:true，估算結果在餐點之後',iBase>=0&&iBase<iThumb&&iThumb<iFlag&&iBase<iDone,{iBase,iThumb,iFlag,iDone});
    check('拍一餐：餐點建立時 thumb:false、估算是 pending',/"thumb":false/.test(w[iBase].keys)&&/"status":"pending"/.test(w[iBase].keys),w[iBase]);
    check('拍一餐：估算完成，有 modelTierApplied 與 promptVer',att&&att.length===1&&att[0].status==='done'&&att[0].modelTierApplied==='default'&&att[0].promptVer===1&&att[0].imgSrc==='photo',att);
    check('拍一餐：餐點存好之前顯示「儲存中…」或「已存一餐，估算中」',/儲存中|已存一餐，估算中/.test(midToast),midToast);
    const tinfo=th&&await page.evaluate(src=>new Promise(r=>{const im=new Image();im.onload=()=>r({w:im.naturalWidth,h:im.naturalHeight});im.src=src}),th.thumb);
    check('縮圖：data URI ≤ 32 KiB，長邊 ≤ 320，thumbBytes 對得上',th&&th.thumb.startsWith('data:image/jpeg')&&th.thumb.length<=32768&&Math.max(tinfo.w,tinfo.h)<=320&&m.thumbBytes===th.thumb.length,{len:th&&th.thumb.length,tinfo,thumbBytes:m&&m.thumbBytes});
    check('縮圖：寫入成功後餐點是 thumb:true',m.thumb===true,m.thumb);
    const calls=await page.evaluate(()=>window.__mock.sampleCalls);
    check('估算：sample 只呼叫 1 次，1 張 JPEG、長邊 1280、modelTier default、沒有 cache:false',calls.length===1&&calls[0].images.length===1&&calls[0].images[0].type==='image/jpeg'&&Math.max(calls[0].images[0].w,calls[0].images[0].h)===1280&&calls[0].opts.modelTier==='default'&&calls[0].opts.cache===undefined,calls.map(c=>({images:c.images,opts:c.opts})));
    const pr=calls[0].input;
    check('提示詞：不含體重、劑量、藥名或其他紀錄',!/kg|mcg|Levothyroxine|半顆|52\.|TSH|體重|服藥/.test(pr),pr.slice(0,80));
    const today=await page.evaluate(()=>({sub:document.querySelector('#mealSub').textContent,txt:document.querySelector('#p-today').innerText}));
    check('今天頁：只顯示餐數，不顯示熱量',today.sub==='今天 1 餐'&&!/kcal|大卡/.test(today.txt),today);
    console.log('    （縮圖實測）色塊 4000×3000：'+(th&&th.thumb.length)+' 字元，'+(tinfo&&tinfo.w+'×'+tinfo.h));
    await page.context().close()}

  /* 高細節的合成影像、PNG：縮圖仍在預算內；送出的版本不超過 maxInputBytes */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{images:{maxCount:1,maxInputBytes:400000,mediaTypes:['image/jpeg']}}}});await wait(700);
    await snap(page,await photo(page,2400,1800,'noise'));await wait(3500);
    await snap(page,await photo(page,1600,1200,'plain','image/png'));await wait(2500);
    const ms=mealsOf(await doc('days/'+T));const ths=[];for(const [id] of ms)ths.push(await doc('mealthumbs/'+id));
    const calls=await page.evaluate(()=>window.__mock.sampleCalls.map(c=>c.images[0]));
    check('高細節影像與 PNG：兩餐都有縮圖，都 ≤ 32 KiB',ms.length===2&&ths.every(t=>t&&t.thumb.length<=32768),ths.map(t=>t&&t.thumb.length));
    check('送出的照片不超過 maxInputBytes，而且都是 JPEG',calls.length===2&&calls.every(c=>c.size<=400000&&c.type==='image/jpeg'),calls);
    console.log('    （縮圖實測）雜訊 2400×1800：'+(ths[0]&&ths[0].thumb.length)+' 字元；PNG 1600×1200：'+(ths[1]&&ths[1].thumb.length)+' 字元；送出大小 '+calls.map(c=>c.size).join('、')+' bytes');
    await page.context().close()}
  /* maxInputBytes 小到降品質也放不下：不送，這一餐記 image_rejected，餐點照樣存 */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{images:{maxCount:1,maxInputBytes:20000,mediaTypes:['image/jpeg']}}}});await wait(700);
    await snap(page,await photo(page,2400,1800,'noise'));await wait(3000);
    const [id,m]=mealsOf(await doc('days/'+T))[0]||[];const a=m&&Object.values(m.attempts)[0];
    check('照片太大放不下：沒有呼叫 sample，估算記 image_rejected，餐點與縮圖都在',(await page.evaluate(()=>window.__mock.sampleCalls.length))===0&&a&&a.status==='failed'&&a.err==='image_rejected'&&!!(await doc('mealthumbs/'+id)),a);
    await page.context().close()}
  /* 解碼失敗：不寫入 */
  {const {page}=await open({time:NOW,cfg:{latencyComp:true}});await wait(700);
    await snap(page,{name:'x.jpg',mimeType:'image/jpeg',buffer:Buffer.from('this is not an image')});await wait(1200);
    const w=await page.evaluate(()=>window.__mock.writes.length);
    check('解碼失敗：提示打不開，沒有任何寫入',/打不開/.test(await toastText(page))&&w===0,{w,t:await toastText(page)});
    await page.context().close()}

  /* ---- 存檔失敗與恢復 ---- */
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,quota:['days/'],sample:{delay:300}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(2200);
    const t=await toastText(page),d=await doc('days/'+T),calls=await page.evaluate(()=>window.__mock.sampleCalls.length);
    const pend=await page.evaluate(()=>({hidden:document.querySelector('#mealPend').hidden,t:document.querySelector('#mealPendT').textContent}));
    check('餐點寫入失敗（空間已滿）：提示整餐沒存，不說「請先匯出」',/空間已滿，這餐沒有存到/.test(t)&&!/匯出/.test(t),t);
    check('餐點寫入失敗：估算照常進行，但資料庫沒有任何殘缺餐點',calls===1&&!d,d);
    check('餐點寫入失敗：今天頁出現「1 餐沒有存到」',!pend.hidden&&pend.t==='1 餐沒有存到',pend);
    check('餐點寫入失敗：縮圖也沒有先寫',(await page.evaluate(()=>window.__mock.writes.filter(w=>w.path.startsWith('mealthumbs/')).length))===0);
    await page.evaluate(()=>{location.hash='setup'});await wait(300);await page.evaluate(()=>{location.hash=''});await wait(300);
    check('切到其他頁再回來：「沒有存到」還在',!(await page.evaluate(()=>document.querySelector('#mealPend').hidden)));
    await page.evaluate(()=>{window.__mock.cfg.quota=[]});await tap(page,'#mealRetry');await wait(2000);
    const d2=await doc('days/'+T),[id,m]=mealsOf(d2)[0]||[];const a=m&&Object.values(m.attempts);
    check('再存一次：餐點、估算結果都寫入，沒有再呼叫模型',m&&a.length===1&&a[0].status==='done'&&(await page.evaluate(()=>window.__mock.sampleCalls.length))===1,{m,calls:await page.evaluate(()=>window.__mock.sampleCalls.length)});
    check('再存一次：縮圖寫入、thumb:true，「沒有存到」消失',m&&m.thumb===true&&!!(await doc('mealthumbs/'+id))&&await page.evaluate(()=>document.querySelector('#mealPend').hidden),m&&m.thumb);
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,quota:['mealthumbs/']}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(2200);
    const t=await toastText(page),[id,m]=mealsOf(await doc('days/'+T))[0]||[];
    check('縮圖寫入失敗（空間已滿）：餐點已存、thumb:false，提示清除舊縮圖',m&&m.thumb===false&&/縮圖沒有存到/.test(t)&&/清除舊縮圖/.test(t),{t,m:m&&m.thumb});
    check('縮圖因空間已滿沒存：這餐只有文字，不列入「沒有存到」',await page.evaluate(()=>document.querySelector('#mealPend').hidden));
    await page.evaluate(()=>{window.__mock.cfg.quota=[]});
    await snap(page,await photo(page,1000,750));await wait(2200);
    const ms=mealsOf(await doc('days/'+T));
    check('空間已滿之後：這次開啟的頁面不再嘗試存縮圖，第二餐也只有文字',ms.length===2&&ms.every(([i,x])=>x.thumb===false)&&(await page.evaluate(()=>window.__mock.writes.filter(w=>w.path.startsWith('mealthumbs/')).length))===0,ms.map(([i,x])=>x.thumb));
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,failPath:{prefix:'mealthumbs/',code:'unavailable',count:2}}});await wait(700);
    await snap(page,await photo(page,1200,900));await wait(2200);
    let [id,m]=mealsOf(await doc('days/'+T))[0]||[];
    check('縮圖暫時失敗（不是空間已滿）：餐點已存、列入「沒有存到」',m&&m.thumb===false&&!(await page.evaluate(()=>document.querySelector('#mealPend').hidden))&&/縮圖沒有存到/.test(await toastText(page)),m&&m.thumb);
    await tap(page,'#mealRetry');await wait(1500);[id,m]=mealsOf(await doc('days/'+T))[0]||[];
    check('再存一次：只重送縮圖與旗標',m.thumb===true&&!!(await doc('mealthumbs/'+id))&&await page.evaluate(()=>document.querySelector('#mealPend').hidden),m.thumb);
    await page.context().close()}
  {const {page,doc}=await open({time:NOW,cfg:{latencyComp:true,sample:{delay:4000}}});await wait(700);
    await snap(page,await photo(page,1200,900));
    /* 等餐點與縮圖旗標都寫好，再讓接下來的兩次寫入失敗：那就是估算結果的寫回（不受整體測試負載的時間影響） */
    for(let i=0;i<60;i++){const d=await doc('days/'+T);if(mealsOf(d)[0]&&mealsOf(d)[0][1].thumb===true)break;await wait(100)}
    await page.evaluate(()=>{window.__mock.cfg.failNext={code:'unavailable',count:2}});
    for(let i=0;i<80;i++){if(/估算結果沒有存到/.test(await toastText(page)))break;await wait(100)}
    let [id,m]=mealsOf(await doc('days/'+T))[0]||[];
    check('估算結果寫回失敗：提示，餐點仍是 pending',/估算結果沒有存到/.test(await toastText(page))&&Object.values(m.attempts)[0].status==='pending',Object.values(m.attempts));
    await tap(page,'#mealRetry');await wait(1200);[id,m]=mealsOf(await doc('days/'+T))[0]||[];
    check('再存一次：寫入已拿到的結果，不再呼叫模型',Object.values(m.attempts)[0].status==='done'&&(await page.evaluate(()=>window.__mock.sampleCalls.length))===1,Object.values(m.attempts));
    await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
