/* C1：mock 的 sample 是否照 docs/contract/0.2.94/sample.d.ts 行為。之後的頁面測試都靠它，所以先確認它本身。
   執行：node dev/sample-mock-test.js */
const {open,close,check,summary}=require('./harness');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
/* 在頁面裡用 canvas 畫一張合成圖（不是真實照片） */
const MK=`window.__mkImg=(w,h,type='image/jpeg',seed=1)=>new Promise(r=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  x.fillStyle='hsl('+(seed*47%360)+',60%,55%)';x.fillRect(0,0,w,h);x.fillStyle='#fff';x.fillRect(w/4,h/4,w/3,h/3);c.toBlob(r,type,0.85)});`;
const T0='2026-10-30T12:00:00+08:00';

(async()=>{
  /* S1 取得與形狀 */
  {const {page}=await open({time:T0,init:MK});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');return{fn:typeof s,json:typeof s?.json,limits:typeof s?.limits,frozen:Object.isFrozen(s)}});
    check('S1 use("sample") 是函式，有 json、limits，凍結',r.fn==='function'&&r.json==='function'&&r.limits==='function'&&r.frozen,r);
    await page.context().close()}
  {const {page}=await open({time:T0,cfg:{sample:{absent:true}}});await wait(200);
    check('S1 absent：use("sample") 是 null',await page.evaluate(async()=>(await claude.use('sample'))===null));
    await page.context().close()}

  /* S2 limits */
  {const {page}=await open({time:T0,cfg:{sample:{images:{maxCount:2,maxInputBytes:100000,mediaTypes:['image/jpeg']},modelTiers:['default','quick']}}});await wait(200);
    const l=await page.evaluate(async()=>(await claude.use('sample')).limits());
    check('S2 limits：images 照設定，有 maxPromptBytes 與 modelTiers',l.images?.maxCount===2&&l.images.mediaTypes.join()==='image/jpeg'&&l.maxPromptBytes===262144&&l.modelTiers.length===2,l);
    await page.context().close()}
  {const {page}=await open({time:T0,cfg:{sample:{images:null}},init:MK});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const l=await s.limits();const b=await __mkImg(64,48);
      const e=await s('看圖',{images:[b]}).catch(e=>e);const t=await s('只問文字');return{hasImages:'images' in l,code:e.code,text:t.text.length>0}});
    check('S2 沒宣告圖片：limits 沒有 images，傳圖 images_unavailable，文字照常',!r.hasImages&&r.code==='images_unavailable'&&r.text,r);
    await page.context().close()}
  {const {page}=await open({time:T0,cfg:{sample:{limitsReject:true}}});await wait(200);
    check('S2 limitsReject：limits reject',await page.evaluate(async()=>(await claude.use('sample')).limits().then(()=>false,()=>true)));
    await page.context().close()}

  /* S3 參數形狀錯誤 → invalid_request；S4 圖片內容 → image_rejected */
  {const {page}=await open({time:T0,cfg:{sample:{images:{maxCount:1,maxInputBytes:3000,mediaTypes:['image/jpeg','image/png']}}},init:MK});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const b=await __mkImg(32,24);const big=await __mkImg(800,600,'image/png',3);
      const code=p=>p.then(()=>'ok',e=>e.code);const ctl=new AbortController();
      return{
        blobOpts:await code(s('x',b)),ctl:await code(s('x',{signal:ctl})),strImg:await code(s('x',{images:['not a blob']})),gc0:await code(s('x',{cache:{gcTime:0}})),
        empty:await code(s('')),turns:await code(s([{role:'assistant',content:'hi'}])),
        tooMany:await code(s('x',{images:[b,b]})),type:await code(s('x',{images:[new Blob(['hello'],{type:'text/plain'})]})),size:await code(s('x',{images:[big]})),
        bigSize:big.size}});
    check('S3 options 不是 plain object：invalid_request',r.blobOpts==='invalid_request',r);
    check('S3 signal 傳成 controller：invalid_request',r.ctl==='invalid_request',r);
    check('S3 images 不是 Blob：invalid_request',r.strImg==='invalid_request',r);
    check('S3 gcTime 0：invalid_request',r.gc0==='invalid_request',r);
    check('S3 空 input、turns 不是 user 開頭：invalid_request',r.empty==='invalid_request'&&r.turns==='invalid_request',r);
    check('S4 張數超過 maxCount：image_rejected（不是 invalid_request）',r.tooMany==='image_rejected',r);
    check('S4 格式不對：image_rejected',r.type==='image_rejected',r);
    check('S4 超過 maxInputBytes：image_rejected',r.bigSize>3000&&r.size==='image_rejected',r);
    await page.context().close()}

  /* S5 成功的形狀、onText、錯誤是 plain object；S13 空回覆；S14 tools */
  {const {page}=await open({time:T0,cfg:{sample:{replies:['{"a":1}',{error:'rate_limited'},'   ']}}});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const ups=[];
      const ok=await s('q1',{onText:u=>ups.push(u)});const e=await s('q2').catch(e=>e);const em=await s('q3').catch(e=>e);const tl=await s('q4',{tools:[{name:'t',description:'d',execute(){}}]}).catch(e=>e);
      return{ok,ups,e:{code:e.code,isErr:e instanceof Error,keys:Object.keys(e)},em:em.code,tl:tl.code}});
    check('S5 成功：{text,truncated:false,modelTierApplied:"default"}',r.ok.text==='{"a":1}'&&r.ok.truncated===false&&r.ok.modelTierApplied==='default',r.ok);
    check('S5 onText 至少一次，最後的 text 等於結果',r.ups.length>=1&&r.ups[r.ups.length-1].text===r.ok.text,r.ups);
    check('S5 失敗是 plain object {code,message}，不是 Error',r.e.code==='rate_limited'&&!r.e.isErr&&r.e.keys.includes('message'),r.e);
    check('S13 空白回覆：empty_completion',r.em==='empty_completion',r.em);
    check('S14 傳 tools：tools_unavailable',r.tl==='tools_unavailable',r.tl);
    await page.context().close()}

  /* S6 快取：相同呼叫重播、cache:false 重問、圖片不同不命中、5 分鐘後不命中；S7 失敗不存；S8 截斷也存 */
  {const {page}=await open({time:T0,init:MK});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const a=await __mkImg(64,48,'image/jpeg',1),b=await __mkImg(64,48,'image/jpeg',2);
      await s('估',{images:[a]});await s('估',{images:[a]});const n1=__mock.sampleCalls.filter(c=>c.upstream).length;
      await s('估',{images:[a],cache:false});const n2=__mock.sampleCalls.filter(c=>c.upstream).length;
      await s('估',{images:[b]});const n3=__mock.sampleCalls.filter(c=>c.upstream).length;
      await s.json('估',{images:[a]});const n4=__mock.sampleCalls.filter(c=>c.upstream).length;
      const cachedFlags=__mock.sampleCalls.map(c=>c.cached);return{n1,n2,n3,n4,cachedFlags}});
    check('S6 相同呼叫 5 分鐘內重播：上游 1 次',r.n1===1&&r.cachedFlags[1]===true,r);
    check('S6 cache:false：一定重問',r.n2===2,r);
    check('S6 圖片位元組不同：不命中',r.n3===3,r);
    check('S6 呼叫方式不同（json）：不命中',r.n4===4,r);
    await page.clock.setFixedTime(new Date(Date.parse(T0)+301000));
    const n5=await page.evaluate(async()=>{const s=await claude.use('sample');const a=await __mkImg(64,48,'image/jpeg',1);await s('估',{images:[a]});return __mock.sampleCalls.filter(c=>c.upstream).length});
    check('S6 超過 5 分鐘：不命中',n5===5,n5);
    await page.context().close()}
  {const {page}=await open({time:T0,cfg:{sample:{replies:[{error:'upstream_error'},'{"ok":1}',{text:'{"half":1}',truncated:true}]}}});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const e=await s('同一題').catch(e=>e.code);const ok=await s('同一題');
      const t1=await s('截斷');const t2=await s('截斷');return{e,ok:ok.text,t1:t1.truncated,t2:t2.truncated,ups:__mock.sampleCalls.filter(c=>c.upstream).length}});
    check('S7 失敗不存：同一題再問會到上游並成功',r.e==='upstream_error'&&r.ok==='{"ok":1}',r);
    check('S8 截斷的成功回覆也存，重播時仍是 truncated',r.t1===true&&r.t2===true&&r.ups===3,r);
    await page.context().close()}

  /* S9 json 的寬鬆讀法與 invalid_json（不存） */
  {const {page}=await open({time:T0,cfg:{sample:{replies:['好的：{"k":2} 以上','{"a":1} {"b":2}','{"a":1} {"b":2}']}}});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const v=await s.json('p1');const e=await s.json('p2').catch(e=>e);const e2=await s.json('p2').catch(e=>e);
      return{v,code:e.code,text:e.text,again:e2.code,ups:__mock.sampleCalls.filter(c=>c.upstream).length}});
    check('S9 json：前後一句話也讀得到',r.v?.k===2,r);
    check('S9 兩個 JSON 值：invalid_json，text 是原始回覆',r.code==='invalid_json'&&r.text==='{"a":1} {"b":2}',r);
    check('S9 invalid_json 不存：再問會到上游',r.again==='invalid_json'&&r.ups===3,r);
    await page.context().close()}

  /* S10 中止；S11 拒絕同意；S12 相同呼叫同時進行時共用；R13 同意等待與排隊 */
  {const {page}=await open({time:T0,cfg:{sample:{delay:600}}});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const ctl=new AbortController();const ups=[];
      const p=s('慢',{signal:ctl.signal,onText:u=>ups.push(u)});setTimeout(()=>ctl.abort(),50);const e=await p.catch(e=>e.code);
      await new Promise(r=>setTimeout(r,800));
      const [a,b]=await Promise.all([s('同時'),s('同時')]);
      return{e,ups:ups.length,same:a.text===b.text,upstreamSame:__mock.sampleCalls.filter(c=>c.input==='同時'&&c.upstream).length}});
    check('S10 中止：cancelled，之後沒有 onText',r.e==='cancelled'&&r.ups===0,r);
    check('S12 相同呼叫同時進行：只到上游 1 次',r.same&&r.upstreamSame===1,r);
    await page.context().close()}
  {const {page}=await open({time:T0,cfg:{sample:{consent:'deny'}}});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const a=await s('一').catch(e=>e.code);const b=await s('二').catch(e=>e.code);return[a,b]});
    check('S11 拒絕同意：這次檢視每次都是 not_granted',r[0]==='not_granted'&&r[1]==='not_granted',r);
    await page.context().close()}
  {const {page}=await open({time:T0,cfg:{sample:{consent:{wait:700},queueWait:300}}});await wait(200);
    const ms=await page.evaluate(async()=>{const s=await claude.use('sample');const t=performance.now();await s('等');const first=performance.now()-t;const t2=performance.now();await s('等2');return{first,second:performance.now()-t2}});
    check('S15 同意等待只在第一次，排隊每次都有',ms.first>=950&&ms.second>=280&&ms.second<700,ms);
    await page.context().close()}

  /* S16 截圖情境（D 階段）：只有截圖讀取的提示詞回固定回覆；其他提示詞照舊；張數超過 maxCount 是 image_rejected */
  {const {page}=await open({time:T0,cfg:{sample:{shot:'single',images:{maxCount:2}}},init:MK});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const b=await __mkImg(64,48,'image/png');
      const a=await s('你會看到 1 張截圖，多半來自台灣「全民健保行動快易通｜健康存摺」',{images:[b]});const m=await s('估熱量',{images:[b]});
      const t=await s.json('健康存摺 json',{}).catch(e=>e.code);const tr=await s('健康存摺 3',{images:[b,b,b]}).catch(e=>e.code);
      return{a:JSON.parse(a.text).items.length,fx:a.text===window.__shotFixtures.single,meal:m.text.includes('kcalLo'),t:typeof t==='object',tr}});
    check('S16 shot：截圖提示詞回情境、其他提示詞照舊、json 也可、超過張數 image_rejected',r.a===2&&r.fx&&r.meal&&r.t&&r.tr==='image_rejected',r);
    await page.context().close()}
  {const {page}=await open({time:T0,cfg:{sample:{shot:'truncated'}}});await wait(200);
    const r=await page.evaluate(async()=>{const s=await claude.use('sample');const a=await s('健康存摺',{cache:false});return a.truncated});
    check('S16 shot：{text,truncated} 形式照樣回 truncated',r===true,r);
    await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
