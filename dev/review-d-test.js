/* D 階段程式審查（docs/reviews/2026-11-01-phase-D-code-independent-review.md）D-01–D-13 與附帶項目的重現。合成資料。
   每一項先在修改前的程式上確認失敗，修改後通過（處理說明在 docs/reviews/2026-11-02-phase-D-code-review-response.md）。
   執行：node dev/review-d-test.js */
const fs=require('fs'),path=require('path');
const {open,close,sampleSeed,check,summary,SRC}=require('./harness');
const T='2026-10-30',NOW='2026-10-30T12:40:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const html=fs.readFileSync(SRC,'utf8');
const block=n=>html.match(new RegExp('\\/\\* ---- '+n+' helpers: begin[^*]*\\*\\/([\\s\\S]*?)\\/\\* ---- '+n+' helpers: end ---- \\*\\/'))[1];
const H=new Function(block('shot')+';return{shotPrompt,classPreset,redact,parseShot,groupShot,SHOT_PROMPT_VER}')();
const SEEDREC=['records/r1','records/r2','records/r3'];
async function until(page,fn,ms=4000,arg){const t=Date.now();for(;;){const v=await page.evaluate(fn,arg).catch(()=>null);if(v)return v;if(Date.now()-t>ms)return v;await wait(40)}}
async function shotFile(page,{w=600,h=1300,name='s.png'}={}){const b64=await page.evaluate(([w,h])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.fillStyle='#000';x.fillText('TSH',20,40);return c.toDataURL('image/png').split(',')[1]},[w,h]);
  return{name,mimeType:'image/png',buffer:Buffer.from(b64,'base64')}}
async function start(cfg={},o={}){const r=await open({time:NOW,hash:'exams',...o,cfg:{latencyComp:true,seed:sampleSeed(T),...cfg}});r.page.setDefaultTimeout(4000);await wait(600);return r}
async function pick(page,files){const [fc]=await Promise.all([page.waitForEvent('filechooser',{timeout:3000}),page.click('#shotBox label')]);await fc.setFiles(files)}
const drafted=page=>until(page,()=>!document.querySelector('#shotBar').hidden);
const boxText=page=>page.evaluate(()=>document.querySelector('#shotBox').hidden?null:document.querySelector('#shotBox').textContent);
const st=page=>page.evaluate(()=>({open:document.querySelector('#dlgRec').open,bar:document.querySelector('#shotBar').hidden?null:document.querySelector('#shotBar').textContent,exam:document.querySelector('#fExam').value,
  date:document.querySelector('#fDate').value,preset:document.querySelector('#fPreset').value,note:document.querySelector('#fNote').value,report:document.querySelector('#fReport').value,
  labs:Object.fromEntries([...document.querySelectorAll('[data-lab]')].map(i=>[i.dataset.lab,i.value])),saveOff:document.querySelector('#btnSave').disabled,cls:!!document.querySelector('#presetField .shotcls')}));
const newRecs=page=>page.evaluate(seed=>[...__mock.store.entries()].filter(([k])=>k.startsWith('records/')&&!seed.includes(k)).map(([k,v])=>({id:k.slice(8),...v})),SEEDREC);
const T_=async fn=>{try{await fn()}catch(e){check('情境中斷（例外）',false,String(e&&e.message||e).split('\n')[0].slice(0,160))}};
const rep=(o)=>({type:'report',date:'2026/10/18',reportDate:null,place:'甲院',title:null,class:null,unclear:[],...o});

(async()=>{
  /* ---- D-01：從別的編輯面板按 toast「繼續」，新草稿的分類確認不能被舊的 close 事件清掉 ---- */
  await T_(async()=>{const {page,errors}=await start({sample:{shot:'report',delay:900}});await page.click('#btnAdd');await pick(page,await shotFile(page));await wait(150);
    await page.click('#dlgRec [data-close]');await page.evaluate(()=>{openHist.add('thy_lab');renderExams()});await wait(100);await page.click('[data-edit="r3"]');
    await until(page,()=>document.querySelector('#toastText').textContent.includes('截圖讀好了'),4000);
    await page.click('#toastActs button');await wait(300);const s=await st(page);
    check('D-01 編輯面板中按「繼續」：載入草稿、分類待確認、儲存停用',s.open&&!!s.bar&&s.preset==='b3'&&s.cls&&s.saveOff,s);
    await page.evaluate(()=>document.querySelector('#btnSave').click());await wait(300);
    check('D-01 沒按確認分類就送出：不寫入',(await newRecs(page)).length===0);
    await page.click('[data-shot="clsok"]');await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 2/'),3000);
    const r=(await newRecs(page))[0];check('D-01 確認後存下的紀錄有 shot',r&&r.preset==='b3'&&r.shot?.n===1,r);
    check('D-01 沒有 JS 錯誤',!errors.length,errors);await page.context().close()});

  /* ---- D-02：存檔進行中不能重複送出；關掉面板後成功的那筆也要離開佇列 ---- */
  await T_(async()=>{const {page}=await start({sample:{shot:'report'}});await page.click('#btnAdd');await pick(page,await shotFile(page));await drafted(page);
    await page.click('[data-shot="clsok"]');await page.evaluate(()=>{__mock.cfg.latency=1000});await page.click('#btnSave');await wait(100);
    await page.selectOption('#fPreset','b12');await page.evaluate(()=>document.querySelector('#btnSave').click());await wait(1800);
    const rs=await newRecs(page);check('D-02A 存檔中改分類再按儲存：只存一筆、是第一次的分類',rs.length===1&&rs[0].preset==='b3',rs.map(r=>r.preset));
    await page.context().close()});
  await T_(async()=>{const {page}=await start({sample:{shot:'multi'}});await page.click('#btnAdd');await pick(page,await shotFile(page));await drafted(page);
    await page.evaluate(()=>{__mock.cfg.latency=1000});await page.click('#btnSave');await wait(100);await page.click('#dlgRec [data-close]');await wait(1500);
    await page.evaluate(()=>{__mock.cfg.latency=0});await page.click('#btnAdd');await wait(100);const t=await boxText(page);
    check('D-02B 存檔中關掉面板：成功後那筆離開佇列（剩 1 筆）',(await newRecs(page)).length===1&&t.includes('還有 1 筆沒確認'),t);
    await page.click('[data-shot="go"]');await wait(100);check('D-02B 繼續的是第 2 筆（生殖軸）',(await st(page)).exam==='gyn_horm');
    await page.context().close()});
  await T_(async()=>{const {page}=await start({sample:{shot:'multi'}});await page.click('#btnAdd');await pick(page,await shotFile(page));await drafted(page);
    await page.evaluate(()=>{__mock.cfg.latency=800});await page.click('#btnSave');await wait(100);
    const skipOff=await page.evaluate(()=>{const b=document.querySelector('[data-shot="skip"]');return!b||b.disabled});
    check('D-02C 存檔中「略過這筆」不能按',skipOff);await wait(1200);check('D-02C 存好後到第 2 筆',(await st(page)).bar?.startsWith('截圖 2/2'));await page.context().close()});

  /* ---- D-03：草稿上的修正要留著（關面板、略過撤銷、換項目） ---- */
  await T_(async()=>{const {page}=await start({sample:{shot:'multi'}});await page.click('#btnAdd');await pick(page,await shotFile(page));await drafted(page);
    await page.fill('[data-lab="TSH"]','9.9');await page.fill('#fNote','合成備註');await page.fill('#fDate','2026-10-21');
    await page.click('#dlgRec [data-close]');await page.click('#btnAdd');await page.click('[data-shot="go"]');await wait(100);let s=await st(page);
    check('D-03 關面板再繼續：TSH、備註、日期是改過的',s.labs.TSH==='9.9'&&s.note==='合成備註'&&s.date==='2026-10-21',s);
    await page.click('[data-shot="skip"]');await wait(150);await page.click('#toastActs button');await wait(150);s=await st(page);
    check('D-03 略過再撤銷：仍是改過的',s.labs.TSH==='9.9'&&s.note==='合成備註'&&s.date==='2026-10-21',s);
    await page.selectOption('#fExam','gyn_horm');await wait(50);await page.selectOption('#fExam','thy_lab');await wait(50);
    check('D-03 換項目再換回來：TSH 仍是 9.9',(await st(page)).labs.TSH==='9.9');
    await page.selectOption('#fExam','gyn_horm');await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 2/2'));
    const r=(await newRecs(page))[0];check('D-03 換項目存檔：報告內容是改過的 TSH 9.9，不是原本的 2.30',r.report.includes('TSH 9.9')&&!r.report.includes('TSH 2.30'),r.report);
    await page.context().close()});
  await T_(async()=>{const {page}=await start({sample:{shot:'multi'}});await page.click('#btnAdd');await pick(page,await shotFile(page));await drafted(page);
    await page.fill('[data-lab="TSH"]','9.9');await page.fill('[data-lab="TSH"]','2.30');await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 2/2'));
    const r=(await newRecs(page))[0];check('D-03 改了又改回原值：labMeta 照留',r.labMeta?.TSH?.raw==='2.30',r.labMeta);await page.context().close()});

  /* ---- D-04：ATA 只認寫明的超音波分類 ---- */
  const cp=(e,c,t)=>H.classPreset(e,c,t).preset;
  check('D-04 DATA／high resolution 不是 ATA 分類',cp('thy_us',null,'DATA: high resolution ultrasound')===null);
  check('D-04 ATA 復發風險不是結節分類',cp('thy_us',null,'ATA high risk of recurrence')===null);
  check('D-04 否定語句不建議',cp('thy_us',null,'ATA: no high suspicion pattern')===null&&cp('thy_us',null,'依 ATA 分類，未見高度懷疑')===null);
  check('D-04 寫明的分類照建議',cp('thy_us',null,'ATA high suspicion')==='high'&&cp('thy_us','ATA: intermediate suspicion')==='lowint'&&cp('thy_us','ATA low suspicion pattern')==='lowint'&&cp('thy_us','依 ATA 為高度懷疑')==='high');

  /* ---- D-05：不同醫院、不同標題的同文字報告不能被當成重疊 ---- */
  await T_(async()=>{const items=[rep({exam:'breast_us',text:'Benign cyst.',class:'BI-RADS 2'}),rep({exam:'breast_us',text:'Benign cyst.',class:'BI-RADS 2',place:'乙院'}),rep({exam:'gi_colo',title:'Colonoscopy',text:'Normal.'}),rep({exam:'gi_colo',title:'Pathology',text:'Normal.'})];
    check('D-05 跨院、不同標題各自一筆',H.groupShot(items,{order:[]}).length===4);
    check('D-05 完全相同（含醫院與標題）的重疊才合併',H.groupShot([rep({exam:'breast_us',text:'x'}),rep({exam:'breast_us',text:'x'})],{order:[]}).length===1)});

  /* ---- D-06：衝突的值保留單位、參考範圍、旗標 ---- */
  await T_(async()=>{const lab=o=>({type:'lab',date:'2026/10/20',reportDate:null,place:'甲院',order:null,flag:null,unit:null,ref:null,unclear:[],...o});
    const g=H.groupShot([lab({name:'TSH',value:'2',unit:'μIU/mL',ref:'0.27-4.2',flag:'N'}),lab({name:'TSH',value:'0.002',unit:'IU/L',ref:'0.00027-0.0042',flag:'L'})],{units:{TSH:'μIU/mL'},order:[]})[0];
    check('D-06 衝突寫進報告時有單位、參考範圍、獨立旗標',g.report.includes('2 μIU/mL（參考值 0.27-4.2）')&&g.report.includes('0.002 IU/L（參考值 0.00027-0.0042） L')&&!g.labs.TSH,g.report);
    const g2=H.groupShot([lab({name:'TSH',value:'2',unit:'μIU/mL'}),lab({name:'TSH',value:'2',unit:'μIU/mL',ref:'0.27-4.2'})],{units:{TSH:'μIU/mL'},order:[]})[0];
    check('D-06 同值重疊時補上另一列才有的參考範圍',g2.labs.TSH.ref==='0.27-4.2',g2.labs.TSH);
    const g3=H.groupShot([lab({name:'TSH',value:'2',unit:'μIU/mL'}),lab({name:'TSH',value:'2',unit:'pmol/L'})],{units:{TSH:'μIU/mL'},order:[]})[0];
    check('D-06 同數字不同單位算衝突',!g3.labs.TSH&&g3.report.includes('pmol/L'),g3.report)});

  /* ---- D-07：標題與分類原文要進報告內容；選了項目後重算分類建議 ---- */
  await T_(async()=>{const g=H.groupShot([rep({exam:'breast_us',title:'Breast US',class:'BI-RADS 4A',text:null})],{order:[]})[0];
    check('D-07 沒有全文時，標題與分類原文寫進報告內容，並標記沒有全文',g.report.includes('Breast US')&&g.report.includes('BI-RADS 4A')&&g.noText===true,g);
    const g2=H.groupShot([rep({exam:'thy_us',title:'Thyroid US',class:'ACR TI-RADS 4',text:'Left nodule 1.2 cm.'})],{order:[]})[0];
    check('D-07 全文沒有寫到的分類原文另起一行保留',g2.report.includes('ACR TI-RADS 4')&&g2.report.includes('Left nodule'),g2.report)});
  await T_(async()=>{const reply=JSON.stringify({items:[rep({exam:null,title:'Breast sonography',class:'BI-RADS 4A',text:'Nodule. BI-RADS 4A.'})]});
    const {page}=await start({sample:{reply}});await page.click('#btnAdd');await pick(page,await shotFile(page));await drafted(page);
    await page.selectOption('#fExam','breast_us');await wait(80);const s=await st(page);
    check('D-07 項目待選的報告，選了乳房超音波後才建議分類，且要確認',s.preset==='b45'&&s.cls&&s.saveOff,s);await page.context().close()});

  /* ---- D-08：按鈕式的手動輸入也算動過表單 ---- */
  await T_(async()=>{const {page}=await start({sample:{shot:'multi',delay:900}});await page.evaluate(()=>openRecord('thy_lab'));await pick(page,await shotFile(page));await wait(100);
    await page.click('[data-ctx="biotin7d"] [data-v="yes"]');await until(page,()=>document.querySelector('#shotBox').textContent.includes('讀出'),3000);
    const s=await page.evaluate(()=>({bar:!document.querySelector('#shotBar').hidden,ctx:formCtx.biotin7d}));
    check('D-08 讀取中按了抽血情境：讀完不自動載入，手動選擇還在',!s.bar&&s.ctx==='yes',s);await page.context().close()});

  /* ---- D-09：準備圖片期間再選一次，不能讓第一組無聲消失 ---- */
  await T_(async()=>{const {page}=await start({sample:{shot:'single'}});await page.click('#btnAdd');await wait(50);
    const r=await page.evaluate(async()=>{const orig=prepShot;window.prepShot=async f=>{await new Promise(r=>setTimeout(r,f.name==='A.png'?150:20));return orig(f)};
      const mk=(n,w)=>new Promise(res=>{const c=document.createElement('canvas');c.width=w;c.height=100;c.getContext('2d').fillRect(0,0,10,10);c.toBlob(b=>res(new File([b],n,{type:'image/png'})),'image/png')});
      const A=await mk('A.png',300),B=await mk('B.png',200);const p1=shotPick([A]);const p2=shotPick([B]);await Promise.all([p1,p2]);
      await new Promise(r=>setTimeout(r,400));return{calls:__mock.sampleCalls.map(c=>c.images.map(i=>i.w)),q:shotQ.length,box:document.querySelector('#shotBox').textContent}});
    check('D-09 準備中再選：第二次不受理，送出的是第一組（寬 300）',r.calls.length===1&&r.calls[0][0]===300,r);await page.context().close()});

  /* ---- D-10：兩個 code fence 不能只取第一個 ---- */
  check('D-10 兩個 JSON code fence → 看不懂',H.parseShot('```json\n{"items":[{"type":"lab","name":"TSH","value":"1"}]}\n```\n```json\n{"items":[{"type":"lab","name":"Free T4","value":"1"}]}\n```').err==='invalid');
  check('D-10 一個 code fence 照常',H.parseShot('說明\n```json\n{"items":[]}\n```').ok===true);

  /* ---- D-11：小寫、全形的身分證號也要擋 ---- */
  check('D-11 小寫、全形、混合',H.redact('a123456789 Ａ１２３４５６７８９ b2＊＊＊＊＊678')==='〔已移除〕 〔已移除〕 〔已移除〕',H.redact('a123456789 Ａ１２３４５６７８９ b2＊＊＊＊＊678'));
  await T_(async()=>{const p=H.parseShot(JSON.stringify({items:[{type:'lab',name:'TSH',value:'1',place:'甲院 a123456789',ref:'Ａ１２３４５６７８９',unit:null,date:'2026/10/20',unclear:[]}]}));
    check('D-11 醫院、參考範圍等每個文字欄位都擋',!/a123456789|Ａ１２３/.test(JSON.stringify(p.items)),p.items)});

  /* ---- D-12：原始分類不只一個就不建議（即使對到同一個既有分類） ---- */
  check('D-12 4A 與 4C 不建議並提示',cp('breast_us','R: BI-RADS 4A; L: BI-RADS 4C')===null&&/4A、4C/.test(H.classPreset('breast_us','R: BI-RADS 4A; L: BI-RADS 4C').hint||''));
  check('D-12 1 與 2 不建議',cp('breast_us','R: BI-RADS 1, L: BI-RADS 2')===null);
  check('D-12 同一個分類寫了兩次照建議',cp('breast_us','BI-RADS 3','Final: BI-RADS category 3')==='b3');

  /* ---- D-13：成功但讀錯時可以重讀（cache:false），不重複追加 ---- */
  await T_(async()=>{const {page}=await start({sample:{shot:'multi'}});await page.click('#btnAdd');await pick(page,await shotFile(page));await drafted(page);
    await page.click('#btnSave');await until(page,()=>document.querySelector('#shotBar').textContent.startsWith('截圖 2/2'));
    const has=await page.evaluate(()=>!!document.querySelector('[data-shot="reread"]'));check('D-13 草稿列有「重讀」',has);
    if(has){await page.click('[data-shot="reread"]');await until(page,()=>__mock.sampleCalls.length===2&&!document.querySelector('#shotBar').hidden,3000);
      const r=await page.evaluate(()=>({c:__mock.sampleCalls[1],q:shotQ.length,exams:shotQ.map(d=>d.exam)}));
      check('D-13 重讀帶 cache:false 並到上游；已存的那筆不再出現、不重複追加',r.c.opts.cache===false&&r.c.upstream&&r.q===1&&r.exams[0]==='gyn_horm',r)}
    await page.context().close()});

  /* ---- 附帶：提示詞不要求模型自己去重；頁面程式的錯不給重選；mock 拒絕壞圖；匯出匯入往返；點擊命中 ---- */
  check('提示詞：不再要求模型把兩張截圖的重複列只列一次（由頁面去重）',!H.shotPrompt(2).includes('只列一次')&&H.SHOT_PROMPT_VER!=='d1');
  await T_(async()=>{const {page}=await start({sample:{reply:{error:'invalid_request'}}});await page.click('#btnAdd');await pick(page,await shotFile(page));await until(page,()=>document.querySelector('#shotBox').textContent.includes('讀取沒有完成'));
    const t=await boxText(page);check('頁面程式的錯：只能手動填，不顯示選截圖',t.includes('讀取沒有完成，請手動填寫')&&!t.includes('從截圖填入')&&!t.includes('重新選截圖'),t);await page.context().close()});
  await T_(async()=>{const {page}=await start({sample:{}});const r=await page.evaluate(async()=>{const s=await claude.use('sample');
      const bad=new Blob([new Uint8Array([1,2,3,4])],{type:'image/png'});return await s('看圖',{images:[bad]}).then(()=>'ok',e=>e.code)});
    check('mock：解不開的圖片 image_rejected（照 contract）',r==='image_rejected',r);await page.context().close()});
  await T_(async()=>{const seed=sampleSeed(T);seed['records/rs']={exam:'thy_lab',cat:'thyroid',date:'2026-10-20',preset:null,interval:6,nextDue:null,report:'',place:'甲院',doctor:'',note:'',labs:{TSH:'5.2','Free T4':'1.10'},labMeta:{TSH:{raw:'H 5.2',unit:'μIU/mL',ref:'0.27-4.20',flag:'H'}},shot:{at:1,n:1,promptVer:'d1',tier:'default'},futureKey:{a:1},createdAt:5,updatedAt:5};
    const a=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed}});await wait(500);await a.page.click('#btnExport');await wait(500);
    const exported=JSON.parse(await a.page.evaluate(()=>window.__lastDownload.data));await a.page.context().close();
    const b=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:{}}});await wait(500);
    await b.page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await wait(300);
    await b.page.click('#impGo');await b.page.click('#impGo');await wait(1500);const r=await b.doc('records/rs');
    check('匯出→匯入：labMeta、shot、未知欄位原樣往返',JSON.stringify(r)===JSON.stringify(seed['records/rs']),r);await b.page.context().close()});
  for(const h of [820,667]){const {page}=await start({sample:{shot:'multi'}},{width:380,height:h});await page.click('#btnAdd');await wait(400);
    const hit=await page.evaluate(()=>{const l=document.querySelector('#shotBox label').getBoundingClientRect();const e=document.elementFromPoint(l.left+l.width/2,l.top+l.height/2);return!!e&&e.matches('[data-shotfile]')});
    check(`點擊命中 380×${h}：「從截圖填入」的中心點到的是檔案輸入`,hit);
    await pick(page,await shotFile(page));await drafted(page);await page.click('[data-shot="skip"]');await wait(200);
    const th=await page.evaluate(()=>{const b=document.querySelector('#toastActs button');if(!b)return false;const r=b.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===b});
    check(`點擊命中 380×${h}：面板開著時 toast 的「撤銷」按得到`,th);await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
