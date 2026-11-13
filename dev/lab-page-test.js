/* 檢驗值的偏高偏低與「其他抽血」的頁面行為（Playwright + mock）。全部是合成資料。
   - 表單：每個檢驗欄位下方的參考值與標記；數值和參考值都能解析時自動算出；點一下切換 —／H／L／A，手動的不被自動計算蓋掉；骨密度沒有這一行
   - 顯示：歷史表格、歷次紀錄與卡片上的異常項目；不只靠顏色；aria-label；沒有 labMeta 或沒有 flagSrc 的舊紀錄
   - 其他抽血（lab_other）：新增多列、驗證、刪除與撤銷、編輯、同名檢驗排在同一欄、不列入到期與提醒，填了間隔才列
   - 從截圖填入：讀到的 ref 與 flag 保留；沒有對應欄位的檢驗可以另存成一筆「其他抽血」
   - 380 寬淺色與深色：沒有水平捲動、觸控目標、對比、截圖
   執行：node dev/lab-page-test.js        略過截圖：node dev/lab-page-test.js --no-shots */
const fs=require('fs'),path=require('path');
const {open,close,sampleSeed,check,summary}=require('./harness');
const {scan}=require('./a11y');
const REF=require('./remind-ref');
const SHOTS=path.join(__dirname,'screenshots'),NOSHOTS=process.argv.includes('--no-shots');
const T='2026-10-30',NOW=T+'T12:40:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(page,fn,ms=4000,arg){const t=Date.now();for(;;){const v=await page.evaluate(fn,arg).catch(()=>null);if(v)return v;if(Date.now()-t>ms)return v;await wait(40)}}
const SEEDREC=['records/r1','records/r2','records/r3'];
async function start(cfg={},o={}){const r=await open({time:NOW,hash:'exams',...o,cfg:{latencyComp:true,seed:sampleSeed(T),...cfg}});await wait(600);return r}
const J=x=>JSON.stringify(x);
const same=(a,b)=>J(a)===J(b);
const newRec=(page,exam)=>page.evaluate(e=>openRecord(e),exam).then(()=>wait(150));
const save=async page=>{await page.click('#btnSave');await wait(350)};
const saved=page=>until(page,()=>!document.querySelector('#dlgRec').open);
const writes=page=>page.evaluate(()=>__mock.writes.length);
const stored=(page,id)=>page.evaluate(id=>{const v=__mock.store.get('records/'+id);return v===undefined?null:JSON.parse(JSON.stringify(v))},id);
const newRecs=page=>page.evaluate(seed=>[...__mock.store.entries()].filter(([k])=>k.startsWith('records/')&&!seed.includes(k)).map(([k,v])=>({id:k.slice(8),...JSON.parse(JSON.stringify(v))})).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)),SEEDREC);
const toastText=page=>page.textContent('#toastText').catch(()=>'');
const go=async(page,hash,ms=350)=>{await page.evaluate(h=>{location.hash=h},hash);await wait(ms)};
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
const dlgOverflow=page=>page.evaluate(()=>{const b=document.querySelector('#recForm .dlg-body');return b.scrollWidth-b.clientWidth});
/* 一個固定欄位下方那一行 */
const box=(page,k)=>page.evaluate(k=>{const b=document.querySelector(`[data-lab="${k}"]`).closest('[data-labbox]'),f=b.querySelector('.flagbtn');return{v:b.querySelector('[data-lab]').value,ref:b.querySelector('[data-ref]')?.value??null,flag:f?f.textContent:null,src:f?f.dataset.src:null,aria:f?f.getAttribute('aria-label'):null,on:f?f.classList.contains('on'):null}},k);
const tapFlag=(page,k)=>page.click(`[data-labbox]:has([data-lab="${k}"]) .flagbtn`);
/* 「其他抽血」的列 */
const rows=page=>page.evaluate(()=>[...document.querySelectorAll('#labs .labrow')].map(d=>{const q=s=>d.querySelector(s),f=q('.flagbtn');return{n:q('[data-rn]').value,v:q('[data-rv]').value,u:q('[data-ru]').value,r:q('[data-rr]').value,flag:f.textContent,src:f.dataset.src,err:q('.ferr').hidden?'':q('.ferr').textContent,note:q('[data-shotn]')?.textContent||'',aria:d.getAttribute('aria-label')}}));
const rowSel=(i,s)=>`#labs .labrow:nth-child(${i+1}) ${s}`;
async function fillRow(page,i,{n,v,u,r}){if(n!==undefined)await page.fill(rowSel(i,'[data-rn]'),n);if(v!==undefined)await page.fill(rowSel(i,'[data-rv]'),v);if(u!==undefined)await page.fill(rowSel(i,'[data-ru]'),u);if(r!==undefined)await page.fill(rowSel(i,'[data-rr]'),r)}
const brief=rs=>rs.map(x=>[x.n,x.v,x.u,x.r,x.flag,x.src]);
/* 定期檢查頁上某個檢查的卡片 */
const card=(page,id)=>page.evaluate(id=>{const a=document.querySelector(`[data-add="${id}"]`).closest('article');return{pill:a.querySelector('.pill').textContent,facts:a.querySelector('.facts')?.textContent||'',abn:a.querySelector('.abn')?.textContent||null,abnAria:[...a.querySelectorAll('.abn .lab-flag')].map(x=>x.getAttribute('role')+'|'+x.getAttribute('aria-label')),open:!!a.querySelector('.hist'),sub:a.querySelector('.exam-sub').textContent}},id);
const openHistOf=async(page,id)=>{await page.evaluate(id=>{openHist.add(id);renderExams()},id);await wait(120)};
const table=(page,id)=>page.evaluate(id=>{const a=document.querySelector(`[data-add="${id}"]`).closest('article'),t=a.querySelector('.labtable');if(!t)return null;
  return{head:[...t.querySelectorAll('thead th')].map(th=>th.innerText.replace(/\s+/g,' ').trim()),rows:[...t.querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)),
    aria:[...t.querySelectorAll('.lab-flag')].map(x=>x.getAttribute('role')+'|'+x.getAttribute('aria-label')),abCells:[...t.querySelectorAll('td.lab-ab')].map(td=>td.textContent),noMark:[...t.querySelectorAll('td.lab-ab')].filter(td=>!td.querySelector('.lab-flag')?.textContent.trim()).length,
    lines:[...a.querySelectorAll('.hist li')].map(li=>li.querySelector('.labline')?.textContent||''),color:t.querySelector('td.lab-ab')?getComputedStyle(t.querySelector('td.lab-ab')).color:null,plain:getComputedStyle(t.querySelector('td:not(.lab-ab)')).color}},id);
const lab=(date,labs,labMeta,o={})=>({exam:'thy_lab',cat:'thyroid',date,preset:null,interval:6,nextDue:null,report:'',place:'',doctor:'',note:'',labs,...(labMeta?{labMeta}:{}),createdAt:10,updatedAt:10,...o});
const other=(date,labs,labMeta,o={})=>lab(date,labs,labMeta,{exam:'lab_other',cat:'lab',interval:null,...o});
/* 合成截圖 */
async function shotFile(page){const b64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=900;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,600,900);x.fillStyle='#000';x.font='28px sans-serif';x.fillText('Hb 0.0 測試',40,80);return c.toDataURL('image/png').split(',')[1]});
  return{name:'s.png',mimeType:'image/png',buffer:Buffer.from(b64,'base64')}}
async function pick(page,files){const [fc]=await Promise.all([page.waitForEvent('filechooser',{timeout:3000}),page.click('#shotBox label')]);await fc.setFiles(files)}
const drafted=page=>until(page,()=>!document.querySelector('#shotBar').hidden);
const barIs=(page,s)=>until(page,s=>document.querySelector('#shotBar').textContent.startsWith(s),4000,s);
const sform=page=>page.evaluate(()=>({bar:document.querySelector('#shotBar').hidden?null:document.querySelector('#shotBar').textContent,exam:document.querySelector('#fExam').value,date:document.querySelector('#fDate').value,place:document.querySelector('#fPlace').value,report:document.querySelector('#fReport').value,
  split:document.querySelector('#shotSplitRow').hidden?null:document.querySelector('#shotSplitLbl').textContent,splitOn:document.querySelector('#fSplit').checked,examNote:document.querySelector('#shotExamNote').hidden?null:document.querySelector('#shotExamNote').textContent,
  reread:!!document.querySelector('#shotBar [data-shot="reread"]'),open:document.querySelector('#dlgRec').open}));
const shotStart=async name=>{const r=await start({sample:{shot:name}});await r.page.click('#btnAdd');await pick(r.page,await shotFile(r.page));await drafted(r.page);return r};

(async()=>{
  /* ================= 表單：參考值與標記 ================= */
  {const {page,errors}=await start();await newRec(page,'thy_lab');
    const ui=await page.evaluate(()=>({refs:[...document.querySelectorAll('#labs [data-ref]')].map(i=>[i.dataset.ref,i.placeholder,i.getAttribute('aria-label'),i.value]),btns:[...document.querySelectorAll('#labs .flagbtn')].map(b=>b.textContent+'|'+b.getAttribute('aria-label')),
      hints:[...document.querySelectorAll('#labWrap .hint,#labWrap .shotnote')].filter(h=>!h.closest('[hidden]')).map(h=>h.textContent),add:document.querySelector('#labAddRow').hidden}));
    check('表單：甲狀腺抽血 6 個欄位下方各有選填的「參考值」與標記（—），預設是空的',ui.refs.length===6&&ui.refs.every(r=>r[1]==='參考值'&&r[2]===r[0]+' 參考值'&&r[3]==='')&&ui.btns.length===6&&ui.btns.every(b=>b.startsWith('—|')&&b.endsWith(' 標記：無'))&&ui.add,ui);
    check('表單：沒有新增常駐說明文字（檢驗區只有原本那一句）',same(ui.hints,['單位以報告為準，沒做的項目留空']),ui.hints);
    await page.fill('[data-lab="TSH"]','5.2');let b=await box(page,'TSH');check('只填數值、沒有參考值：沒有標記',b.flag==='—'&&b.src===''&&!b.on,b);
    await page.fill('[data-ref="TSH"]','0.27–4.20');b=await box(page,'TSH');
    check('數值 5.2、參考值 0.27–4.20：自動算出偏高（↑ H），來源是參考值，aria-label 寫「偏高」',b.flag==='↑ H'&&b.src==='ref'&&b.aria==='TSH 標記：偏高'&&b.on,b);
    const seq=[];for(const v of ['4.20','4.21','0.27','0.26','2.1','']){await page.fill('[data-lab="TSH"]',v);const x=await box(page,'TSH');seq.push([v,x.flag,x.src])}
    check('邊界值不算異常：4.20、0.27 沒有標記；4.21 是 ↑ H、0.26 是 ↓ L；清空就沒有',same(seq,[['4.20','—',''],['4.21','↑ H','ref'],['0.27','—',''],['0.26','↓ L','ref'],['2.1','—',''],['','—','']]),seq);
    const forms=[];for(const r of ['0.27-4.20','0.27~4.20','<5','>40','0.27-4.20 μIU/mL','']){await page.fill('[data-lab="TSH"]','45');await page.fill('[data-ref="TSH"]',r);forms.push((await box(page,'TSH')).flag)}
    check('參考值的寫法：50-200 這類、~、<5、>40 都能算（45 分別是高、高、高、不算異常）；帶單位的解析不了、空的都沒有標記',same(forms,['↑ H','↑ H','↑ H','—','—','—']),forms);
    /* 手動切換 */
    await page.fill('[data-lab="TSH"]','5.2');await page.fill('[data-ref="TSH"]','0.27-4.20');
    const cyc=[];for(let i=0;i<4;i++){await tapFlag(page,'TSH');const x=await box(page,'TSH');cyc.push([x.flag,x.src,x.aria])}
    check('點一下切換：自動的 ↑ H 之後依序是 ↓ L、*、—、↑ H，來源都是手動；aria-label 跟著寫偏低、異常、無、偏高',same(cyc,[['↓ L','manual','TSH 標記：偏低'],['*','manual','TSH 標記：異常'],['—','manual','TSH 標記：無'],['↑ H','manual','TSH 標記：偏高']]),cyc);
    await tapFlag(page,'TSH');await page.fill('[data-lab="TSH"]','9.9');await page.fill('[data-ref="TSH"]','0.27-5.0');b=await box(page,'TSH');
    check('手動設成 ↓ L 之後，改數值、改參考值都不會被自動計算蓋掉',b.flag==='↓ L'&&b.src==='manual'&&b.v==='9.9',b);
    await tapFlag(page,'TSH');await tapFlag(page,'TSH');await page.fill('[data-lab="TSH"]','99');b=await box(page,'TSH');
    check('手動設成沒有標記（—）也一樣：之後填超出參考值的數值，仍然沒有標記',b.flag==='—'&&b.src==='manual'&&!b.on,b);
    /* 其他欄位：自動、沒有參考值、比較符號、文字結果 */
    await page.fill('[data-lab="Free T4"]','0.5');await page.fill('[data-ref="Free T4"]','0.93-1.70');
    await page.fill('[data-lab="T3"]','100');
    await page.fill('[data-lab="Anti-TPO"]','40');await page.fill('[data-ref="Anti-TPO"]','<35');
    await page.fill('[data-lab="Anti-Tg"]','>1000');await page.fill('[data-ref="Anti-Tg"]','<115');
    await page.fill('[data-lab="Thyroglobulin"]','Negative');await page.fill('[data-ref="Thyroglobulin"]','0-5');
    const fl=[];for(const k of ['Free T4','T3','Anti-TPO','Anti-Tg','Thyroglobulin'])fl.push((await box(page,k)).flag);
    check('各欄位：0.5 對 0.93-1.70 是 ↓ L；沒有參考值沒有標記；40 對 <35 是 ↑ H；>1000 對 <115 是 ↑ H；文字結果不判',same(fl,['↓ L','—','↑ H','↑ H','—']),fl);
    check('380 寬：填了參考值與標記的表單沒有水平捲動',(await overflow(page))<=0&&(await dlgOverflow(page))<=0,[await overflow(page),await dlgOverflow(page)]);
    await save(page);await saved(page);const r=(await newRecs(page))[0],N=null;
    check('存檔：labs 照舊存文字',same(r.labs,{TSH:'99','Free T4':'0.5',T3:'100','Anti-TPO':'40','Anti-Tg':'>1000',Thyroglobulin:'Negative'}),r.labs);
    check('存檔：labMeta 每項是 { raw, unit, ref, flag, flagSrc }；手動的「沒有標記」存 flag null、flagSrc manual；算出來的存 ref；沒有參考值也沒有標記的 T3 不存',
      same(r.labMeta,{TSH:{raw:N,unit:N,ref:'0.27-5.0',flag:N,flagSrc:'manual'},'Free T4':{raw:N,unit:N,ref:'0.93-1.70',flag:'L',flagSrc:'ref'},'Anti-TPO':{raw:N,unit:N,ref:'<35',flag:'H',flagSrc:'ref'},'Anti-Tg':{raw:N,unit:N,ref:'<115',flag:'H',flagSrc:'ref'},Thyroglobulin:{raw:N,unit:N,ref:'0-5',flag:N,flagSrc:N}}),r.labMeta);
    /* 編輯：標記照存的顯示；手動的仍然不被蓋掉；改數值後重算 */
    await openHistOf(page,'thy_lab');await page.click(`[data-edit="${r.id}"]`);await wait(150);
    const e1=[await box(page,'TSH'),await box(page,'Free T4'),await box(page,'T3')];
    check('編輯：參考值與標記照存的顯示（TSH 手動的 —、Free T4 算出的 ↓ L、T3 空的）',e1[0].ref==='0.27-5.0'&&e1[0].flag==='—'&&e1[0].src==='manual'&&e1[1].ref==='0.93-1.70'&&e1[1].flag==='↓ L'&&e1[1].src==='ref'&&e1[2].ref===''&&e1[2].flag==='—',e1);
    await page.fill('[data-lab="TSH"]','120');await page.fill('[data-lab="Free T4"]','1.0');await page.fill('[data-ref="T3"]','80-200');await tapFlag(page,'Anti-TPO');await tapFlag(page,'Anti-TPO');
    const e2=[(await box(page,'TSH')).flag,(await box(page,'Free T4')).flag,(await box(page,'T3')).flag,(await box(page,'Anti-TPO')).flag];
    check('編輯：手動的 TSH 改數值仍是 —；Free T4 改成 1.0 回到範圍內；T3 補了參考值 80-200（100 在範圍內）；Anti-TPO 手動改成 *',same(e2,['—','—','—','*']),e2);
    await save(page);await saved(page);const r2=await stored(page,r.id);
    check('編輯後存檔：TSH 仍是手動的沒有標記；Free T4 的標記清掉；T3 多了參考值；Anti-TPO 是手動的 A；沒動的 Anti-Tg 原樣',
      same(r2.labMeta,{TSH:{raw:N,unit:N,ref:'0.27-5.0',flag:N,flagSrc:'manual'},'Free T4':{raw:N,unit:N,ref:'0.93-1.70',flag:N,flagSrc:N},'Anti-TPO':{raw:N,unit:N,ref:'<35',flag:'A',flagSrc:'manual'},'Anti-Tg':{raw:N,unit:N,ref:'<115',flag:'H',flagSrc:'ref'},Thyroglobulin:{raw:N,unit:N,ref:'0-5',flag:N,flagSrc:N},T3:{raw:N,unit:N,ref:'80-200',flag:N,flagSrc:N}}),r2.labMeta);
    /* 骨密度：沒有參考值與標記那一行 */
    await newRec(page,'bone_dxa');const bone=await page.evaluate(()=>({labs:document.querySelectorAll('#labs [data-lab]').length,refs:document.querySelectorAll('#labs [data-ref]').length,btns:document.querySelectorAll('#labs .flagbtn').length}));
    check('骨密度的 11 個欄位沒有參考值與標記（T、Z 沒有參考範圍，分類一律手選）',bone.labs===11&&bone.refs===0&&bone.btns===0,bone);
    await page.fill('[data-lab="L1–L4 T"]','-2.6');await page.fill('#fDate','2026-10-01');await save(page);await saved(page);
    const rb=(await newRecs(page)).find(x=>x.exam==='bone_dxa');check('骨密度存檔照舊：沒有 labMeta',rb&&same(rb.labs,{'L1–L4 T':'-2.6'})&&!('labMeta' in rb),rb);
    check('表單：沒有 JS 錯誤',!errors.length,errors);await page.context().close()}

  /* ================= 顯示：歷史表格、歷次紀錄、卡片 ================= */
  for(const scheme of ['light','dark']){
    const seed={...sampleSeed(T),
      /* a1：沒有 flagSrc 的舊紀錄（當作報告上標的）＋由參考值算出的 L */
      'records/a1':lab('2026-10-20',{TSH:'5.2','Free T4':'0.80',T3:'100'},{TSH:{raw:'H 5.2',unit:'μIU/mL',ref:'0.27-4.20',flag:'H'},'Free T4':{raw:null,unit:null,ref:'0.93-1.70',flag:'L',flagSrc:'ref'}}),
      /* a2：報告上的 HH、手動設成沒有標記、手動的 A、舊紀錄的 * */
      'records/a2':lab('2026-09-20',{TSH:'99','Free T4':'2.5',T3:'80','Anti-TPO':'40'},{TSH:{flag:'HH',flagSrc:'report'},'Free T4':{ref:'0.93-1.70',flag:null,flagSrc:'manual'},T3:{flag:'A',flagSrc:'manual'},'Anti-TPO':{flag:'*'}}),
      /* a3：只有參考值、沒有標記的舊紀錄（顯示時由參考值算）；剛好在上限的不算 */
      'records/a3':lab('2026-08-20',{TSH:'0.10','Free T4':'1.70'},{TSH:{raw:'0.10',unit:'μIU/mL',ref:'0.27-4.20',flag:null},'Free T4':{ref:'0.93-1.70',flag:null}}),
      /* 生殖軸激素：5 項異常 → 卡片列 3 項加「另 2 項」 */
      'records/g1':lab('2026-10-10',{E2:'10',P4:'0.1',FSH:'60',LH:'50',AMH:'0.01',PRL:'10'},{E2:{flag:'L',flagSrc:'report'},P4:{ref:'0.2-25',flag:'L',flagSrc:'ref'},FSH:{flag:'H',flagSrc:'manual'},LH:{flag:'H',flagSrc:'report'},AMH:{ref:'>1.0'}},{exam:'gyn_horm',cat:'gyn'}),
      /* 其他抽血：剛好 3 項異常 */
      'records/o1':other('2026-10-05',{Hb:'10.0',MCV:'61.0',WBC:'6.5',PLT:'620'},{Hb:{unit:'g/dL',ref:'12.0-16.0',flag:'L',flagSrc:'ref'},MCV:{unit:'fL',ref:'80-100',flag:'L',flagSrc:'report'},WBC:{unit:'10^3/uL',ref:'4.0-10.0'},PLT:{unit:'10^3/uL',flag:'HH',flagSrc:'report'}})};
    const {page,errors}=await start({seed},{scheme});
    const c=await card(page,'thy_lab'),g=await card(page,'gyn_horm'),o=await card(page,'lab_other');
    check(`${scheme} 卡片（沒有展開）：甲狀腺抽血列出最近一筆的異常項目「TSH 5.2 ↑、Free T4 0.80 ↓」，箭頭有偏高、偏低的 aria-label`,!c.open&&c.abn==='TSH 5.2 ↑、Free T4 0.80 ↓'&&same(c.abnAria,['img|偏高','img|偏低']),c);
    check(`${scheme} 卡片：5 項異常時列 3 項，其餘寫「另 2 項」`,g.abn==='E2 10 ↓、P4 0.1 ↓、FSH 60 ↑、另 2 項',g.abn);
    check(`${scheme} 卡片：剛好 3 項異常時全部列出，不寫「另」（報告上的 HH 在卡片上是 ↑）`,o.abn==='Hb 10.0 ↓、MCV 61.0 ↓、PLT 620 ↑',o.abn);
    check(`${scheme} 卡片：沒有異常項目的檢查沒有這一行`,(await card(page,'thy_us')).abn===null&&(await card(page,'breast_us')).abn===null);
    await openHistOf(page,'thy_lab');const t=await table(page,'thy_lab');
    check(`${scheme} 歷史表格：異常值寫成「數值 ↑ H」「數值 ↓ L」「數值 *」；HH 照報告寫；手動設成沒有標記的 2.5、剛好在上限的 1.70、沒有 labMeta 的舊紀錄都照常顯示`,
      t&&same(t.head,['日期','TSH μIU/mL','Free T4 ng/dL','T3 ng/dL','Anti-TPO IU/mL'])&&same(t.rows,[['2026/10/20','5.2 ↑ H','0.80 ↓ L','100','—'],['2026/09/20','99 ↑ HH','2.5','80 *','40 *'],['2026/08/20','0.10 ↓ L','1.70','—','—'],['2026/07/01','2.1','1.2','—','—']]),t);
    check(`${scheme} 歷史表格：每個標記有 aria-label（偏高、偏低、偏高、異常、異常、偏低）；有顏色的格子一定同時有箭頭或 *，不只靠顏色`,t&&same(t.aria,['img|偏高','img|偏低','img|偏高','img|異常','img|異常','img|偏低'])&&t.abCells.length===6&&t.noMark===0,t&&{aria:t.aria,ab:t.abCells,noMark:t.noMark});
    check(`${scheme} 歷次紀錄：每筆列出自己的異常項目（帶字母）；沒有異常的那筆不多一行`,t&&same(t.lines,['TSH 5.2 ↑ H、Free T4 0.80 ↓ L','TSH 99 ↑ HH、T3 80 *、Anti-TPO 40 *','TSH 0.10 ↓ L','']),t&&t.lines);
    const tok=await page.evaluate(()=>{const cs=getComputedStyle(document.documentElement),v=n=>cs.getPropertyValue(n).trim();const hue=h=>{const [r,g,b]=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;return d===0?0:Math.round(((mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360)};
      const p=document.createElement('span');p.style.color='var(--lab-ab)';document.body.appendChild(p);const rgb=getComputedStyle(p).color;p.remove();return{ab:v('--lab-ab'),lab:v('--c-lab'),late:v('--st-late'),ok:v('--st-ok'),hue:hue(v('--lab-ab')),rgb}});
    check(`${scheme} 顏色：異常值用新的 --lab-ab，和一般文字不同色；不是逾期的紅（--st-late）也不是綠（--st-ok），色相在橙色一帶`,t&&t.color===tok.rgb&&t.color!==t.plain&&tok.ab&&tok.ab!==tok.late&&tok.ab!==tok.ok&&tok.hue>=15&&tok.hue<=45,{tok,color:t&&t.color,plain:t&&t.plain});
    check(`${scheme} token：--lab-ab 與 --c-lab 都有定義（${scheme==='light'?'#a54800、#566b7d':'#ffad66、#a9bccb'}）`,same([tok.ab,tok.lab],scheme==='light'?['#a54800','#566b7d']:['#ffad66','#a9bccb']),tok);
    await openHistOf(page,'gyn_horm');await openHistOf(page,'lab_other');
    const sc=await page.evaluate(scan);check(`${scheme} 380 寬定期檢查頁（展開三種抽血）：沒有水平捲動、觸控目標 ≥44、文字對比足夠`,(await overflow(page))<=0&&!sc.small.length&&!sc.low.length,{ox:await overflow(page),...sc});
    if(!NOSHOTS){fs.mkdirSync(SHOTS,{recursive:true});await page.evaluate(()=>document.querySelector('[data-add="thy_lab"]').closest('article').scrollIntoView({block:'start'}));await wait(150);await page.screenshot({path:path.join(SHOTS,`380-${scheme}-lab-flags-history.png`)});
      await page.evaluate(()=>document.querySelector('#h-lab').scrollIntoView({block:'start'}));await wait(150);await page.screenshot({path:path.join(SHOTS,`380-${scheme}-lab-other-history.png`)})}
    /* 表單：參考值那一行與「其他抽血」的列，380 寬 */
    await page.click('[data-edit="a1"]');await wait(200);
    const f1=await page.evaluate(scan);check(`${scheme} 380 寬甲狀腺抽血表單（有參考值與標記）：沒有水平捲動、觸控目標 ≥44、文字對比足夠`,(await overflow(page))<=0&&(await dlgOverflow(page))<=0&&!f1.small.length&&!f1.low.length,{ox:await overflow(page),dx:await dlgOverflow(page),...f1});
    const old=[await box(page,'TSH'),await box(page,'Free T4')];check(`${scheme} 編輯沒有 flagSrc 的舊紀錄：標記當作報告上標的（↑ H、report）`,old[0].flag==='↑ H'&&old[0].src==='report'&&old[0].ref==='0.27-4.20'&&old[1].flag==='↓ L'&&old[1].src==='ref',old);
    if(!NOSHOTS){await page.evaluate(()=>document.querySelector('#labWrap').scrollIntoView({block:'start'}));await wait(150);await page.screenshot({path:path.join(SHOTS,`380-${scheme}-lab-flags-form.png`)})}
    await page.click('#dlgRec [data-close]');await wait(150);await page.click('[data-edit="o1"]');await wait(200);
    const f2=await page.evaluate(scan);check(`${scheme} 380 寬「其他抽血」表單（4 列）：沒有水平捲動、觸控目標 ≥44、文字對比足夠`,(await overflow(page))<=0&&(await dlgOverflow(page))<=0&&!f2.small.length&&!f2.low.length,{ox:await overflow(page),dx:await dlgOverflow(page),...f2});
    if(!NOSHOTS){await page.evaluate(()=>document.querySelector('#labWrap').scrollIntoView({block:'start'}));await wait(150);await page.screenshot({path:path.join(SHOTS,`380-${scheme}-lab-other-form.png`)})}
    check(`${scheme} 顯示：沒有 JS 錯誤`,!errors.length,errors);await page.context().close()}

  /* ================= 其他抽血：新增、驗證、刪除、編輯 ================= */
  {const {page,errors}=await start();
    const opt=await page.evaluate(()=>{const o=document.querySelector('#fExam option[value="lab_other"]');return o&&[o.textContent,o.parentElement.label]});
    check('檢查項目選單：「其他檢驗」底下有「其他抽血」',same(opt,['其他抽血','其他檢驗']),opt);
    const sec=await page.evaluate(()=>{const h=document.querySelector('#h-lab'),s=h&&h.closest('section');return s&&{name:h.textContent,en:s.querySelector('.en').textContent,color:s.style.getPropertyValue('--cat'),card:s.querySelector('.exam-name').textContent,sub:s.querySelector('.exam-sub').textContent,pill:s.querySelector('.pill').textContent,facts:!!s.querySelector('.facts'),last:document.querySelector('#cats').lastElementChild===s}});
    check('定期檢查頁：新分類「其他檢驗」排在最後，顏色走 --c-lab，裡面是「其他抽血」，還沒有紀錄',same(sec,{name:'其他檢驗',en:'Other labs',color:'var(--c-lab)',card:'其他抽血',sub:'預設不排追蹤；醫師有安排時可以填間隔或日期',pill:'尚無紀錄',facts:false,last:true}),sec);
    const tally0=await page.textContent('#tally');
    await newRec(page,'lab_other');
    const init=await page.evaluate(()=>({rows:document.querySelectorAll('#labs .labrow').length,fixed:document.querySelectorAll('#labs [data-lab]').length,add:!document.querySelector('#labAddRow').hidden,hint:document.querySelector('#labHint').hidden,iv:document.querySelector('#fInterval').value,pv:document.querySelector('#duePreview').textContent,preset:document.querySelector('#presetField').hidden,
      ph:[...document.querySelectorAll('#labs .labrow input')].map(i=>i.placeholder+'|'+i.getAttribute('aria-label'))}));
    check('新增「其他抽血」：沒有固定欄位，先有一列（名稱、數值、單位、參考值）與「＋ 新增一列」；間隔是空的，預覽寫不排追蹤',init.rows===1&&init.fixed===0&&init.add&&init.hint&&init.iv===''&&init.pv==='不排追蹤；醫師有安排時再填間隔或日期'&&init.preset&&same(init.ph,['名稱|名稱','數值|數值','單位|單位','參考值|參考值']),init);
    await fillRow(page,0,{n:'Hb',v:'10.0',u:'g/dL',r:'12.0-16.0'});
    await page.click('#labAddRow');await wait(60);
    check('「＋ 新增一列」：多一列，焦點在新那一列的名稱',(await rows(page)).length===2&&await page.evaluate(()=>document.activeElement===document.querySelector('#labs .labrow:nth-child(2) [data-rn]')));
    await fillRow(page,1,{n:'MCV',v:'61.0',u:'fL',r:'80–100'});await page.click('#labAddRow');await fillRow(page,2,{n:'WBC',v:'6.5',u:'10^3/uL',r:'4.0-10.0'});
    let rs=await rows(page);
    check('列：數值和參考值都能解析時自動算出標記（Hb ↓ L、MCV ↓ L、WBC 沒有），每列有「第 n 列」的群組名稱',same(brief(rs),[['Hb','10.0','g/dL','12.0-16.0','↓ L','ref'],['MCV','61.0','fL','80–100','↓ L','ref'],['WBC','6.5','10^3/uL','4.0-10.0','—','']])&&same(rs.map(x=>x.aria),['第 1 列','第 2 列','第 3 列']),rs);
    /* 驗證 */
    const w0=await writes(page);await page.click('#labAddRow');await fillRow(page,3,{v:'5'});await save(page);rs=await rows(page);
    check('驗證：有數值沒有名稱 → 那一列寫「請填名稱」，不存，焦點在名稱',rs[3].err==='請填名稱'&&(await writes(page))===w0&&await page.evaluate(()=>document.activeElement===document.querySelector('#labs .labrow:nth-child(4) [data-rn]')),rs[3]);
    await fillRow(page,3,{n:'ｈｂ '});rs=await rows(page);check('驗證：名稱和上面的列只差大小寫與全形 → 邊打邊改成「名稱和上面的列重複」',rs[3].err==='名稱和上面的列重複',rs[3]);
    await save(page);check('驗證：名稱重複不存',(await writes(page))===w0&&(await page.evaluate(()=>document.querySelector('#dlgRec').open)));
    await fillRow(page,3,{n:'Note',v:''});await save(page);rs=await rows(page);check('驗證：有名稱沒有數值 → 「請填數值，或刪除這一列」，不存',rs[3].err==='請填數值，或刪除這一列'&&(await writes(page))===w0,rs[3]);
    await fillRow(page,3,{n:'__proto__',v:'1'});await save(page);rs=await rows(page);check('驗證：物件存不了的名稱（__proto__）→「請換一個名稱」，不存',rs[3].err==='請換一個名稱'&&(await writes(page))===w0,rs[3]);
    await fillRow(page,3,{n:'Note',v:''});
    /* 刪除與撤銷 */
    await page.click(rowSel(3,'[data-rdel]'));await wait(80);const tDel=await toastText(page);
    check('刪除有內容的列：少一列，toast「已刪除一列」有撤銷',(await rows(page)).length===3&&tDel.includes('已刪除一列')&&await page.evaluate(()=>!!document.querySelector('#toastActs button')),tDel);
    await page.click('#toastActs button');await wait(80);rs=await rows(page);check('撤銷：那一列回到原位，內容還在',rs.length===4&&rs[3].n==='Note',brief(rs));
    await page.click(rowSel(3,'[data-rdel]'));await wait(80);
    await page.click('#labAddRow');await wait(40);await page.click(rowSel(3,'[data-rdel]'));await wait(80);
    check('刪除空白的列：直接刪掉',(await rows(page)).length===3);
    await save(page);await saved(page);const r=(await newRecs(page))[0],N=null;
    check('存檔：exam 是 lab_other、cat 是 lab，labs 以名稱為 key 存文字，間隔與指定日期都是 null',r&&r.exam==='lab_other'&&r.cat==='lab'&&same(r.labs,{Hb:'10.0',MCV:'61.0',WBC:'6.5'})&&r.interval===null&&r.nextDue===null&&r.preset===null,r);
    check('存檔：labMeta 存每列的單位、參考值與標記；沒有標記的 WBC 也存單位與參考值',r&&same(r.labMeta,{Hb:{raw:N,unit:'g/dL',ref:'12.0-16.0',flag:'L',flagSrc:'ref'},MCV:{raw:N,unit:'fL',ref:'80–100',flag:'L',flagSrc:'ref'},WBC:{raw:N,unit:'10^3/uL',ref:'4.0-10.0',flag:N,flagSrc:N}}),r&&r.labMeta);
    /* 不列入到期 */
    const c=await card(page,'lab_other'),next=await page.textContent('#nextList'),tally=await page.textContent('#tally');
    check('不列入到期：卡片寫「未排追蹤」、只有上次的日期；「接下來要做的檢查」沒有它；已追蹤仍是 3/10 項',c.pill==='未排追蹤'&&c.facts==='上次2026/10/30'&&c.abn==='Hb 10.0 ↓、MCV 61.0 ↓'&&!next.includes('其他抽血')&&tally===tally0&&tally.endsWith('已追蹤 3/10 項'),{c,next,tally,tally0});
    const sm=await page.evaluate(()=>summarize(summaryCtx(),'2026-10-01','2026-10-30','2026-10-30').sections.find(s=>s[0]==='檢查')[1]);
    await go(page,'today');const slot=await page.textContent('#examSlot');
    check('不列入到期：回診摘要的「檢查」與今天頁的到期卡都沒有它',!sm.join().includes('其他抽血')&&!slot.includes('其他抽血'),{sm,slot});
    /* 編輯 */
    await go(page,'exams');await openHistOf(page,'lab_other');await page.click(`[data-edit="${r.id}"]`);await wait(150);rs=await rows(page);
    check('編輯：每個已存的檢驗一列，名稱、數值、單位、參考值、標記都回來',same(brief(rs),[['Hb','10.0','g/dL','12.0-16.0','↓ L','ref'],['MCV','61.0','fL','80–100','↓ L','ref'],['WBC','6.5','10^3/uL','4.0-10.0','—','']]),brief(rs));
    await fillRow(page,0,{v:'13.0'});await page.click(rowSel(1,'.flagbtn'));await page.click(rowSel(2,'[data-rdel]'));await wait(60);await page.click('#labAddRow');await fillRow(page,2,{n:'Ferritin',v:'4',u:'ng/mL',r:'>13'});
    rs=await rows(page);check('編輯：Hb 改成 13.0 回到範圍內；MCV 手動點成 *；刪掉 WBC；新增 Ferritin 4（>13）是 ↓ L',same(brief(rs),[['Hb','13.0','g/dL','12.0-16.0','—',''],['MCV','61.0','fL','80–100','*','manual'],['Ferritin','4','ng/mL','>13','↓ L','ref']]),brief(rs));
    await save(page);await saved(page);const r2=await stored(page,r.id);
    check('編輯後存檔：列就是全部（WBC 不見了）；手動的 A 存 flagSrc manual',same(r2.labs,{Hb:'13.0',MCV:'61.0',Ferritin:'4'})&&same(r2.labMeta,{Hb:{raw:N,unit:'g/dL',ref:'12.0-16.0',flag:N,flagSrc:N},MCV:{raw:N,unit:'fL',ref:'80–100',flag:'A',flagSrc:'manual'},Ferritin:{raw:N,unit:'ng/mL',ref:'>13',flag:'L',flagSrc:'ref'}})&&r2.createdAt===r.createdAt,r2);
    /* 填了間隔或日期就列入 */
    await page.click(`[data-edit="${r.id}"]`);await wait(150);await page.fill('#fDate','2026-01-10');await page.fill('#fInterval','6');const pv=await page.textContent('#duePreview');await save(page);await saved(page);
    const c2=await card(page,'lab_other'),next2=await page.textContent('#nextList'),tally2=await page.textContent('#tally');
    const sm2=await page.evaluate(()=>summarize(summaryCtx(),'2026-10-01','2026-10-30','2026-10-30').sections.find(s=>s[0]==='檢查')[1]);
    check('填了間隔 6 個月（2026-01-10 檢查）：預覽算出下次日期；卡片與「接下來」列為已逾期、回診摘要列入；已追蹤的 3/10 不變',pv==='下次檢查：2026/07/10（6 個月後）'&&c2.pill.startsWith('已逾期')&&next2.includes('其他抽血')&&tally2.startsWith('逾期 2')&&tally2.endsWith('已追蹤 3/10 項')&&sm2[0].includes('其他抽血 2026/07/10 到期'),{pv,c2,tally2,sm2});
    await go(page,'today');check('填了間隔之後：今天頁的到期卡也算它（另有項數加一）',(await page.textContent('#examSlot')).includes('另有 2 項'),await page.textContent('#examSlot'));
    /* 排程提醒不看它 */
    const recs=(await newRecs(page)).concat([{id:'x',exam:'breast_us',date:'2025-06-01',interval:12,createdAt:1}]);
    check('排程的參考實作：表上沒有 lab_other，就算填了間隔也不看（只選出乳房超音波）',same(Object.keys(REF.latestByExam(recs)),['breast_us'])&&!REF.EXAMS.some(x=>x[0]==='lab_other'),Object.keys(REF.latestByExam(recs)));
    check('其他抽血：沒有 JS 錯誤',!errors.length,errors);await page.context().close()}

  /* ================= 其他抽血：同名的檢驗排在同一欄 ================= */
  {const seed={...sampleSeed(T),
      'records/o0':other('2026-10-01',{Hb:'10.0',MCV:'61.0',Glucose:'98'},{Hb:{unit:'g/dL',ref:'12.0-16.0',flag:'L',flagSrc:'ref'},MCV:{unit:'fL',ref:'80-100',flag:'L',flagSrc:'report'},Glucose:{unit:'mg/dL',ref:'70-99'}}),
      'records/o1':other('2026-09-01',{'ＨＢ':'11.2',mcv:'70.5',Glucose:'5.4'},{'ＨＢ':{unit:'g/dL',ref:'12.0-16.0'},mcv:{unit:'fL'},Glucose:{unit:'mmol/L'}}),
      'records/o2':other('2026-08-01',{'hb ':'9.8',Glucose:'95',CRP:'<0.5'},{'hb ':{unit:'g/dL',flag:'L'},Glucose:{unit:'mg/dL',ref:'70-99'}}),
      'records/o3':other('2026-07-01',{Hb:'12.5'},null)};
    const {page,errors}=await start({seed});await openHistOf(page,'lab_other');const t=await table(page,'lab_other');
    check('歷史表格：Hb、ＨＢ、「hb 」是同一欄，MCV 與 mcv 是同一欄；欄名與單位用最新一筆的寫法；最新一筆沒有的 CRP 另成一欄',t&&same(t.head,['日期','Hb g/dL','MCV fL','Glucose mg/dL','CRP']),t&&t.head);
    check('歷史表格：跨次比較。沒有標記但有參考值的 11.2 由參考值算出 ↓ L；單位不同的 5.4 帶著自己的單位；沒有的寫 —；沒有 labMeta 的舊紀錄照常顯示',
      t&&same(t.rows,[['2026/10/01','10.0 ↓ L','61.0 ↓ L','98','—'],['2026/09/01','11.2 ↓ L','70.5','5.4 mmol/L','—'],['2026/08/01','9.8 ↓ L','—','95','<0.5'],['2026/07/01','12.5','—','—','—']]),t&&t.rows);
    const w=await page.evaluate(()=>{const a=document.querySelector('[data-add="lab_other"]').closest('article'),x=a.querySelector('.labtable');return{ox:getComputedStyle(x).overflowX,page:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
    check('歷史表格：欄位多的時候在自己的容器內水平捲動，頁面不捲',w.ox==='auto'&&w.page<=0,w);
    check('同名比較：沒有 JS 錯誤',!errors.length,errors);await page.context().close()}

  /* ================= 從截圖填入：沒有對應欄位的檢驗另存成「其他抽血」 ================= */
  {const {page,errors}=await shotStart('unmapped');const BLK='其他檢驗（沒有對應的欄位）：\nFT3 3.1 pg/mL（參考值 2.0-4.4）\nFree testosterone 0.9 pg/mL';
    let f=await sform(page);
    check('unmapped：預設照舊寫進報告內容；報告下方多一個選項「其他 2 項檢驗另存成一筆「其他抽血」」，預設關',f.exam==='thy_lab'&&f.report===BLK&&f.split==='其他 2 項檢驗另存成一筆「其他抽血」'&&!f.splitOn&&f.bar.startsWith('截圖 1/2'),f);
    await page.click('#fSplit');f=await sform(page);check('打開選項：那幾行從報告內容拿掉',f.splitOn&&f.report==='',f);
    await page.click('#fSplit');f=await sform(page);check('關掉選項：那幾行放回報告內容',!f.splitOn&&f.report===BLK,f);
    await page.fill('#fReport','醫師說三個月後再抽\n'+BLK);await page.click('#fSplit');f=await sform(page);check('報告內容有自己打的字時：只拿掉那幾行，自己打的留著',f.report==='醫師說三個月後再抽',f.report);
    await page.click('#btnSave');await barIs(page,'截圖 2/3');f=await sform(page);let rs=await rows(page);
    const r1=(await newRecs(page))[0];
    check('存檔：甲狀腺抽血的報告內容沒有那幾行；接著多一筆草稿「截圖 2/3・其他抽血」，日期與醫院照剛存的那筆，不能重讀',r1.exam==='thy_lab'&&r1.report==='醫師說三個月後再抽'&&same(r1.labs,{TSH:'1.80'})&&f.exam==='lab_other'&&f.bar.startsWith('截圖 2/3・其他抽血・10/20')&&f.date==='2026-10-20'&&f.place==='測試醫院'&&f.report===''&&!f.reread&&f.split===null,{r1,f});
    check('另存的草稿：兩項各一列，讀到的單位與參考值都在；3.1 在 2.0-4.4 內沒有標記',same(brief(rs),[['FT3','3.1','pg/mL','2.0-4.4','—',''],['Free testosterone','0.9','pg/mL','','—','']]),brief(rs));
    await page.click('#btnSave');await barIs(page,'截圖 3/3');const r2=(await newRecs(page)).find(x=>x.exam==='lab_other'),N=null;
    check('另存的那筆：是一筆「其他抽血」，labMeta 保留原文、單位與參考值，也有 shot',r2&&same(r2.labs,{FT3:'3.1','Free testosterone':'0.9'})&&same(r2.labMeta,{FT3:{raw:'3.1',unit:'pg/mL',ref:'2.0-4.4',flag:N,flagSrc:N},'Free testosterone':{raw:'0.9',unit:'pg/mL',ref:N,flag:N,flagSrc:N}})&&r2.date==='2026-10-20'&&r2.shot?.n===1&&r2.interval===null,r2);
    /* 第 3 筆：只有對不到的那天，項目待選 → 選「其他抽血」 */
    f=await sform(page);check('只有對不到的那天：仍然是項目待選、寫在報告內容，這時沒有另存的選項',f.exam===''&&f.report.includes('LDL-C H 135 mg/dL（參考值 <130）')&&f.split===null,f);
    await page.selectOption('#fExam','lab_other');await wait(80);f=await sform(page);rs=await rows(page);
    check('項目選「其他抽血」：那幾行變成列，報告內容清掉；讀到的 flag（H）與 ref（<130）保留，來源是報告',f.report===''&&same(brief(rs),[['LDL-C','135','mg/dL','<130','↑ H','report']]),{f,rs});
    await page.selectOption('#fExam','thy_us');await wait(80);f=await sform(page);check('再換成別的項目：那幾行回到報告內容，並出現另存的選項',f.report.includes('LDL-C H 135 mg/dL（參考值 <130）')&&f.split==='其他 1 項檢驗另存成一筆「其他抽血」',f);
    await page.selectOption('#fExam','lab_other');await wait(80);await page.click('#btnSave');await until(page,()=>!document.querySelector('#dlgRec').open);
    const r3=(await newRecs(page)).find(x=>x.exam==='lab_other'&&x.date==='2026-09-01');
    check('存檔：截圖讀到的標記有保留（flag H、flagSrc report、原文 H 135）',r3&&same(r3.labs,{'LDL-C':'135'})&&same(r3.labMeta,{'LDL-C':{raw:'H 135',unit:'mg/dL',ref:'<130',flag:'H',flagSrc:'report'}})&&r3.report==='',r3);
    check('unmapped：共存 3 筆，沒有 JS 錯誤',(await newRecs(page)).length===3&&!errors.length,errors);await page.context().close()}
  {const {page,errors}=await shotStart('unmapped');
    await page.click('#btnSave');await barIs(page,'截圖 2/2');const r=(await newRecs(page))[0];
    check('不開選項：和以前一樣，那幾行存在報告內容，只有 2 筆草稿',r.report==='其他檢驗（沒有對應的欄位）：\nFT3 3.1 pg/mL（參考值 2.0-4.4）\nFree testosterone 0.9 pg/mL'&&(await newRecs(page)).length===1,r.report);
    check('不開選項：沒有 JS 錯誤',!errors.length,errors);await page.context().close()}
  /* 換了檢查項目之後，不屬於新項目的檢驗 */
  {const {page,errors}=await shotStart('multi');
    await page.selectOption('#fExam','gyn_horm');await wait(80);let f=await sform(page);
    check('換項目：原本的 TSH、Free T4 會放進報告內容；多一個另存的選項',f.examNote==='換成這個項目後，TSH、Free T4 會放進報告內容'&&f.split==='其他 2 項檢驗另存成一筆「其他抽血」',f);
    await page.click('#fSplit');f=await sform(page);check('打開選項：提示改成「會另存成「其他抽血」」',f.examNote==='換成這個項目後，TSH、Free T4 會另存成「其他抽血」',f.examNote);
    await page.click('#btnSave');await barIs(page,'截圖 2/3');f=await sform(page);const rs=await rows(page),r=(await newRecs(page))[0];
    check('存檔：生殖軸那筆的報告內容沒有「截圖讀到的其他檢驗」；下一筆是其他抽血，TSH、Free T4 各一列，單位與參考值照截圖',r.exam==='gyn_horm'&&!r.report.includes('截圖讀到的其他檢驗')&&f.exam==='lab_other'&&same(brief(rs),[['TSH','2.30','uIU/mL','0.27-4.20','—',''],['Free T4','1.25','ng/dL','0.93-1.70','—','']]),{r:r.report,rs});
    await page.click('[data-shot="skip"]');await barIs(page,'截圖 3/3');check('另存的草稿可以略過：不存，接著是原本的下一筆',(await newRecs(page)).length===1&&(await sform(page)).exam==='gyn_horm');
    check('換項目另存：沒有 JS 錯誤',!errors.length,errors);await page.context().close()}
  /* 截圖讀到的 ref 與 flag：全部沒有對應欄位的一批 */
  {const {page,errors}=await shotStart('cbc');let f=await sform(page);
    check('cbc：全部對不到，項目待選，5 項寫在報告內容',f.exam===''&&f.report.startsWith('其他檢驗（沒有對應的欄位）：\nHb L 10.0 g/dL（參考值 12.0-16.0）'),f);
    await page.selectOption('#fExam','lab_other');await wait(80);let rs=await rows(page);
    check('選「其他抽血」：5 列；值裡的 L、獨立一欄的 L、HH 都是報告上的標記；沒有旗標的 Ferritin 4（>13）由參考值算出；WBC 在範圍內',
      same(brief(rs),[['Hb','10.0','g/dL','12.0-16.0','↓ L','report'],['MCV','61.0','fL','80-100','↓ L','report'],['WBC','6.5','10^3/uL','4.0-10.0','—',''],['PLT','620','10^3/uL','150-400','↑ HH','report'],['Ferritin','4','ng/mL','>13','↓ L','ref']]),brief(rs));
    /* 關掉再打開：改過的列、參考值、標記都留在草稿上 */
    await fillRow(page,2,{v:'6.6'});await page.click(rowSel(4,'.flagbtn'));await page.click('#dlgRec [data-close]');await wait(150);await page.click('#btnAdd');await wait(150);await page.click('[data-shot="go"]');await wait(150);rs=await rows(page);
    check('關掉面板再繼續：改過的數值與手動的標記都還在（WBC 6.6、Ferritin 手動的 *）',(await sform(page)).exam==='lab_other'&&same(brief(rs).map(x=>[x[0],x[1],x[4],x[5]]),[['Hb','10.0','↓ L','report'],['MCV','61.0','↓ L','report'],['WBC','6.6','—',''],['PLT','620','↑ HH','report'],['Ferritin','4','*','manual']]),brief(rs));
    await page.click('#btnSave');await until(page,()=>!document.querySelector('#dlgRec').open);const r=(await newRecs(page))[0],N=null;
    check('存檔：讀到的 flag 與 ref 保留（HH 照原樣）；改過的 WBC 不留原文；手動的標記存 manual',r&&same(r.labMeta,{Hb:{raw:'L 10.0',unit:'g/dL',ref:'12.0-16.0',flag:'L',flagSrc:'report'},MCV:{raw:'61.0',unit:'fL',ref:'80-100',flag:'L',flagSrc:'report'},WBC:{raw:N,unit:'10^3/uL',ref:'4.0-10.0',flag:N,flagSrc:N},PLT:{raw:'HH 620',unit:'10^3/uL',ref:'150-400',flag:'HH',flagSrc:'report'},Ferritin:{raw:'4',unit:'ng/mL',ref:'>13',flag:'A',flagSrc:'manual'}}),r&&r.labMeta);
    const c=await card(page,'lab_other');check('存好後卡片列出異常項目：Hb 10.0 ↓、MCV 61.0 ↓、PLT 620 ↑、另 1 項',c.abn==='Hb 10.0 ↓、MCV 61.0 ↓、PLT 620 ↑、另 1 項',c.abn);
    check('cbc：沒有 JS 錯誤',!errors.length,errors);await page.context().close()}
  /* 固定欄位的草稿：參考值與標記的修改不因換項目而消失 */
  {const {page,errors}=await shotStart('single');
    await page.fill('[data-ref="Free T4"]','1.20-1.70');await tapFlag(page,'TSH');let b=[await box(page,'TSH'),await box(page,'Free T4')];
    check('single：把 Free T4 的參考值改成 1.20-1.70 → 1.10 變成 ↓ L（ref）；TSH 手動點成 ↓ L',b[0].flag==='↓ L'&&b[0].src==='manual'&&b[1].flag==='↓ L'&&b[1].src==='ref',b);
    await page.selectOption('#fExam','gyn_horm');await wait(60);await page.selectOption('#fExam','thy_lab');await wait(60);b=[await box(page,'TSH'),await box(page,'Free T4')];
    check('換到別的項目再換回來：改過的參考值與標記都還在',b[0].flag==='↓ L'&&b[0].src==='manual'&&b[0].ref==='0.27-4.20'&&b[1].flag==='↓ L'&&b[1].src==='ref'&&b[1].ref==='1.20-1.70',b);
    await page.click('#btnSave');await until(page,()=>!document.querySelector('#dlgRec').open);const r=(await newRecs(page))[0];
    check('存檔：TSH 是手動的 L（原文 H 5.2 仍留著）；Free T4 是由改過的參考值算出的 L',r&&same(r.labMeta,{TSH:{raw:'H 5.2',unit:'μIU/mL',ref:'0.27-4.20',flag:'L',flagSrc:'manual'},'Free T4':{raw:'1.10',unit:'ng/dL',ref:'1.20-1.70',flag:'L',flagSrc:'ref'}}),r&&r.labMeta);
    check('single 草稿：沒有 JS 錯誤',!errors.length,errors);await page.context().close()}

  /* ================= 匯出匯入往返 ================= */
  {const seed={...sampleSeed(T),'records/o1':other('2026-10-05',{Hb:'10.0','T.Bil':'1.9'},{Hb:{raw:'L 10.0',unit:'g/dL',ref:'12.0-16.0',flag:'L',flagSrc:'report'},'T.Bil':{raw:null,unit:'mg/dL',ref:'<1.2',flag:'H',flagSrc:'ref'}})};
    const {page,errors}=await start({seed});await openHistOf(page,'lab_other');const t=await table(page,'lab_other');
    check('名稱裡有句點（T.Bil）也照常存取與顯示',t&&same(t.rows,[['2026/10/05','10.0 ↓ L','1.9 ↑ H']]),t&&t.rows);
    await page.click('[data-edit="o1"]');await wait(150);await page.fill('#fNote','往返');await save(page);await saved(page);const r=await stored(page,'o1');
    check('只改備註再存：labs、labMeta（含報告的原文與 flagSrc）一字不變',same(r.labs,seed['records/o1'].labs)&&same(r.labMeta,seed['records/o1'].labMeta)&&r.note==='往返',r);
    check('往返：沒有 JS 錯誤',!errors.length,errors);await page.context().close()}

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
