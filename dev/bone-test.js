/* 骨密度 DXA（bone_dxa）：新增、選分類、算出下次日期、「正常（未使用荷爾蒙治療）」要求自己填間隔；
   歷次表格在自己的容器內水平捲動；今天頁的到期卡、「接下來」清單、回診摘要、匯出匯入、從截圖填入都認得這個項目；
   --c-bone 在淺色與深色主題都有定義。全部是合成資料。
   執行：node dev/bone-test.js        略過截圖：node dev/bone-test.js --no-shots */
const fs=require('fs'),path=require('path');
const {open,close,sampleSeed,check,summary,ROOT,SRC}=require('./harness');
const {scan}=require('./a11y');
const SHOTS=path.join(__dirname,'screenshots'),NOSHOTS=process.argv.includes('--no-shots');
const T='2026-10-30',NOW=T+'T12:40:00+08:00';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tap=(page,sel)=>page.evaluate(s=>document.querySelector(s).click(),sel);
async function until(page,fn,ms=4000,arg){const t=Date.now();for(;;){const v=await page.evaluate(fn,arg).catch(()=>null);if(v)return v;if(Date.now()-t>ms)return v;await wait(40)}}
const LABS=['L1–L4 BMD','L1–L4 T','L1–L4 Z','左股骨頸 BMD','左股骨頸 T','右股骨頸 BMD','右股骨頸 T','左全髖 BMD','左全髖 T','右全髖 BMD','右全髖 T'];
const allLabs=k=>Object.fromEntries(LABS.map((n,i)=>[n,/BMD$/.test(n)?(0.9-i*0.01-k*0.02).toFixed(3):(-1.2-i*0.1-k*0.1).toFixed(1)]));
const bone=(date,o={})=>({exam:'bone_dxa',cat:'bone',date,preset:'low',interval:12,nextDue:null,report:'',place:'測試醫院',doctor:'',note:'',labs:{},createdAt:10,updatedAt:10,...o});
const seed=(extra={})=>({...sampleSeed(T),...extra});
const noRecs=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!k.startsWith('records/')));
const boneRecs=page=>page.evaluate(()=>[...__mock.store.entries()].filter(([k,v])=>k.startsWith('records/')&&v.exam==='bone_dxa').map(([k,v])=>({id:k.slice(8),...v})).sort((a,b)=>a.date<b.date?-1:1));
const txt=(page,s)=>page.evaluate(s=>{const e=document.querySelector(s);return e?e.textContent:null},s);
const formState=page=>page.evaluate(()=>({exam:document.querySelector('#fExam').value,preset:document.querySelector('#fPreset').value,interval:document.querySelector('#fInterval').value,
  hint:document.querySelector('#presetHint').textContent,preview:document.querySelector('#duePreview').textContent,open:document.querySelector('#dlgRec').open}));
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
/* 合成截圖（和 shot-page-test 相同的做法） */
async function shotFile(page){const b64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=900;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,600,900);x.fillStyle='#000';x.font='28px sans-serif';x.fillText('DXA 測試',40,80);return c.toDataURL('image/png').split(',')[1]});
  return{name:'s.png',mimeType:'image/png',buffer:Buffer.from(b64,'base64')}}

(async()=>{
  /* ---- 原始碼與文件 ---- */
  {const html=fs.readFileSync(SRC,'utf8'),css=html.slice(0,html.indexOf('</style>'));
    const iMedia=css.indexOf('@media (prefers-color-scheme: dark)'),iAttr=css.indexOf(':root[data-theme="dark"]{'),pos=[...css.matchAll(/--c-bone:\s*#[0-9a-f]{6}/g)].map(m=>m.index);
    check('--c-bone：:root、prefers-color-scheme 深色、data-theme 深色各定義一次',pos.length===3&&pos[0]<iMedia&&pos[1]>iMedia&&pos[1]<iAttr&&pos[2]>iAttr,pos);
    check('CATS 的骨骼顏色走 token',html.includes("{id:'bone',name:'骨骼',en:'Bone',color:'var(--c-bone)'}"));
    const doc=fs.readFileSync(path.join(ROOT,'docs/exam-intervals.md'),'utf8');
    check('docs/exam-intervals.md：骨密度段落有兩個出處、Z 值、WHO 分類、同一台機器的 BMD',['doi:10.1093/hropen/hoae065','ISCD 2023 Adult Official Positions','停經前女性以 Z 值判讀，不用 T 值','WHO 分類只適用停經後與更年期過渡期','同一台機器的 BMD (g/cm²) 變化'].every(t=>doc.includes(t)));
    check('DEPLOYED.md：註記要同步晚上與週報任務',fs.readFileSync(path.join(ROOT,'ops/scheduled/DEPLOYED.md'),'utf8').includes('需由 claude.ai 用 update_trigger 同步晚上與週報任務'))}

  /* ---- 新增、選分類、下次日期、norm 要求填間隔 ---- */
  {const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:seed()}});await wait(600);
    const card=await page.evaluate(()=>{const s=document.querySelector('#h-bone')?.closest('section');return s?{h:s.querySelector('h3').textContent,en:s.querySelector('.en').textContent,name:s.querySelector('.exam-name').textContent,sub:s.querySelector('.exam-sub').textContent,pill:s.querySelector('.pill').textContent,last:document.querySelector('#cats').lastElementChild===s}:null});
    check('定期檢查頁：最後一類是「骨骼 Bone」，裡面是「骨密度 DXA」，還沒有紀錄',card&&card.h==='骨骼'&&card.en==='Bone'&&card.name==='骨密度 DXA'&&card.pill==='尚無紀錄'&&card.last&&card.sub.includes('ESHRE 2024 POI：骨密度低每 1–3 年，取下限；其他情況依醫囑'),card);
    check('已追蹤的分母是 10 項',/\/10 項/.test(await txt(page,'#tally')),await txt(page,'#tally'));
    await page.click('[data-add="bone_dxa"]');await wait(250);
    const opts=await page.evaluate(()=>[...document.querySelectorAll('#fPreset option')].map(o=>[o.value,o.textContent]));
    check('報告分類：未分類＋四個分類，文字照規格',JSON.stringify(opts)===JSON.stringify([['','（未分類）'],['low','骨量較低（T −1.0 ～ −2.5）'],['op','骨質疏鬆（T ≤ −2.5）'],['normHT','正常，且規律使用荷爾蒙治療'],['norm','正常（未使用荷爾蒙治療）']]),opts);
    const labs=await page.evaluate(()=>[...document.querySelectorAll('#labs .field')].map(f=>{const i=f.querySelector('input'),b=f.getBoundingClientRect();return{n:i.dataset.lab,label:f.querySelector('label').textContent.replace(/\s+/g,' ').trim(),mode:i.getAttribute('inputmode'),left:Math.round(b.left),top:Math.round(b.top)}}));
    check('檢驗欄位：11 個，名稱與順序照規格',JSON.stringify(labs.map(l=>l.n))===JSON.stringify(LABS),labs.map(l=>l.n));
    check('檢驗欄位：BMD 標出 g/cm²，T／Z 沒有單位',labs.every(l=>/BMD$/.test(l.n)?l.label===l.n+' g/cm²':l.label===l.n),labs.map(l=>l.label));
    check('檢驗欄位：BMD 用小數鍵盤；T／Z 可能是負值，不用沒有負號的小數鍵盤',labs.every(l=>/BMD$/.test(l.n)?l.mode==='decimal':l.mode===null),labs.map(l=>l.mode));
    const by=Object.fromEntries(labs.map(l=>[l.n,l]));
    check('檢驗欄位（380 寬）：每個部位的 BMD 從新的一列開始，T 值在同一列',LABS.filter(n=>/BMD$/.test(n)).every(n=>by[n].left===by[LABS[0]].left&&by[n.replace('BMD','T')].top===by[n].top&&by[n.replace('BMD','T')].left>by[n].left),labs);
    check('未分類：帶入固定間隔 12 個月',(await formState(page)).interval==='12');
    await page.fill('#fDate','2026-10-01');
    await page.selectOption('#fPreset','low');let f=await formState(page);
    check('骨量較低：12 個月，下次 2027/10/01，出處 ESHRE 2024',f.interval==='12'&&f.preview==='下次檢查：2027/10/01（1 年後）'&&f.hint==='ESHRE 2024 POI：骨密度低或骨質疏鬆，依風險每 1–3 年，取下限',f);
    await page.selectOption('#fPreset','op');f=await formState(page);
    check('骨質疏鬆：12 個月，出處相同',f.interval==='12'&&f.preview==='下次檢查：2027/10/01（1 年後）'&&f.hint==='ESHRE 2024 POI：骨密度低或骨質疏鬆，依風險每 1–3 年，取下限',f);
    await page.selectOption('#fPreset','normHT');f=await formState(page);
    check('正常且規律荷爾蒙治療：60 個月，下次 2031/10/01',f.interval==='60'&&f.preview==='下次檢查：2031/10/01（5 年後）'&&f.hint==='ESHRE 2024 POI：骨密度正常且規律荷爾蒙治療，5 年內重測價值低',f);
    await page.selectOption('#fPreset','norm');f=await formState(page);
    check('正常（未使用荷爾蒙治療）：間隔欄清空、不帶預設值，出處 ISCD 2023',f.interval===''&&f.hint==='ISCD 2023：無固定間隔，依年齡、基準值與風險個別決定，請依醫囑填寫',f);
    check('正常（未使用荷爾蒙治療）：預覽要求自己填，不寫「不排例行追蹤」',f.preview.includes('請依醫囑填間隔或指定日期')&&!f.preview.includes('不排例行追蹤'),f.preview);
    await page.click('#btnSave');await wait(300);
    check('norm 沒填間隔也沒填日期：不能儲存，提示要填，焦點在間隔欄',(await boneRecs(page)).length===0&&(await formState(page)).open&&(await txt(page,'#toastText'))==='請填追蹤間隔或指定日期'&&await page.evaluate(()=>document.activeElement?.id==='fInterval'),await txt(page,'#toastText'));
    await page.fill('#fDue','2028-04-01');f=await formState(page);
    check('norm 填指定日期：預覽是那個日期',f.preview==='下次檢查：2028/04/01（醫師指定）',f.preview);
    await page.click('#btnSave');await wait(400);let rs=await boneRecs(page);
    check('norm＋指定日期：存下 preset norm、interval null、nextDue',rs.length===1&&rs[0].preset==='norm'&&rs[0].interval===null&&rs[0].nextDue==='2028-04-01'&&rs[0].cat==='bone',rs);
    await page.click('[data-add="bone_dxa"]');await wait(250);await page.fill('#fDate','2026-10-02');await page.selectOption('#fPreset','norm');await page.fill('#fInterval','24');
    check('norm 填間隔 24：預覽 2028/10/02',(await formState(page)).preview==='下次檢查：2028/10/02（2 年後）',(await formState(page)).preview);
    await page.click('#btnSave');await wait(400);rs=await boneRecs(page);
    check('norm＋間隔：存下 interval 24',rs.length===2&&rs[1].preset==='norm'&&rs[1].interval===24&&rs[1].nextDue===null,rs);
    check('norm 不是不追蹤的分類；舊資料 interval 是 null 時照固定間隔算',await page.evaluate(()=>EXINFO.bone_dxa.noFollow.length===0&&dueOf({exam:'bone_dxa',date:'2026-01-01',preset:'norm',interval:null})==='2027-01-01'));
    await page.click(`[data-edit="${rs[1].id}"]`);await wait(250);f=await formState(page);
    check('編輯 norm 的紀錄：分類與自己填的間隔都在',f.preset==='norm'&&f.interval==='24',f);
    await page.click('#dlgRec [data-close]');await wait(150);
    /* 選分類、填數值、存檔 */
    await page.click('[data-add="bone_dxa"]');await wait(250);await page.fill('#fDate','2026-10-10');await page.selectOption('#fPreset','low');
    for(const [k,v] of [['L1–L4 BMD','0.912'],['L1–L4 T','-1.8'],['L1–L4 Z','-1.2'],['左股骨頸 BMD','0.701'],['左股骨頸 T','−1.5']])await page.fill(`[data-lab="${k}"]`,v);
    await page.click('#btnSave');await wait(400);rs=await boneRecs(page);const r=rs[2];
    check('新增：exam bone_dxa、cat bone、preset low、interval 12',r&&r.exam==='bone_dxa'&&r.cat==='bone'&&r.preset==='low'&&r.interval===12&&r.nextDue===null&&r.date==='2026-10-10',r);
    check('新增：labs 存成字串，沒填的不存',r&&JSON.stringify(r.labs)===JSON.stringify({'L1–L4 BMD':'0.912','L1–L4 T':'-1.8','L1–L4 Z':'-1.2','左股骨頸 BMD':'0.701','左股骨頸 T':'−1.5'}),r&&r.labs);
    const after=await page.evaluate(()=>{const s=document.querySelector('#h-bone').closest('section');return{facts:s.querySelector('.facts').textContent,chip:s.querySelector('.chip')?.textContent,next:[...document.querySelectorAll('#nextList li')].map(li=>li.textContent.replace(/\s+/g,' ').trim()),tally:document.querySelector('#tally').textContent}});
    check('卡片：上次 2026/10/10、下次 2027/10/10、分類標籤',after.facts.includes('上次2026/10/10')&&after.facts.includes('下次2027/10/10')&&after.chip==='骨量較低（T −1.0 ～ −2.5）',after);
    check('「接下來要做的檢查」列出骨密度 DXA 與到期日；已追蹤 4/10 項',after.next.some(t=>t.includes('骨密度 DXA')&&t.includes('2027/10/10'))&&after.tally.includes('已追蹤 4/10 項'),after);
    const ref=await page.evaluate(()=>{document.querySelector('details.refbox').open=true;return{rows:[...document.querySelectorAll('#refTable tbody tr')].filter(tr=>tr.cells[0].textContent==='骨密度 DXA').map(tr=>[...tr.cells].map(c=>c.textContent)),bone:document.querySelector('#boneRef').textContent}});
    check('追蹤間隔的依據：表格有四列骨密度，norm 寫「自行填寫」',ref.rows.length===4&&JSON.stringify(ref.rows.map(x=>x[2]))===JSON.stringify(['1 年','1 年','5 年','自行填寫']),ref.rows);
    check('追蹤間隔的依據：骨密度段落寫明出處、Z 值、WHO 分類、同一台機器的 BMD',['ESHRE 2024 POI guideline','Panay N, et al. Hum Reprod Open 2024','doi:10.1093/hropen/hoae065','ISCD 2023 Adult Official Positions','停經前女性以 Z 值判讀，不用 T 值','WHO 分類只適用停經後與更年期過渡期（ISCD 2023）','看同一台機器的 BMD（g/cm²）變化'].every(t=>ref.bone.includes(t)),ref.bone);
    check('新增流程：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* ---- 歷次表格、顏色、版面（380 寬，淺色與深色） ---- */
  for(const scheme of ['light','dark']){
    const s=seed({'records/b1':bone('2024-11-20',{labs:allLabs(0)}),'records/b2':bone('2025-11-25',{labs:allLabs(1),preset:'op',createdAt:11})});
    const {page,errors}=await open({time:NOW,hash:'exams',scheme,cfg:{latencyComp:true,seed:s}});await wait(600);
    await page.click('[data-hist="bone_dxa"]');await wait(250);
    const t=await page.evaluate(()=>{const s=document.querySelector('#h-bone').closest('section'),w=s.querySelector('.labtable'),bar=s.querySelector('.cat-head .bar');
      const probe=document.createElement('i');probe.style.color='var(--c-bone)';document.body.appendChild(probe);const want=getComputedStyle(probe).color;probe.remove();
      return{cols:[...w.querySelectorAll('thead th')].map(th=>th.textContent.trim()),rows:w.querySelectorAll('tbody tr').length,sw:w.scrollWidth,cw:w.clientWidth,ox:getComputedStyle(w).overflowX,
        token:getComputedStyle(document.documentElement).getPropertyValue('--c-bone').trim(),bar:getComputedStyle(bar).backgroundColor,want,cellRight:Math.round(w.querySelector('tbody tr td:last-child').getBoundingClientRect().right),boxRight:Math.round(w.getBoundingClientRect().right)}});
    check(`${scheme}：歷次表格有日期與 11 個欄位、兩列`,t.cols.length===12&&t.cols[0]==='日期'&&t.cols[1].startsWith('L1–L4 BMD')&&t.cols[1].includes('g/cm²')&&t.rows===2,t.cols);
    check(`${scheme}：歷次表格在自己的容器內水平捲動（overflow-x auto、內容比容器寬）`,t.ox==='auto'&&t.sw>t.cw+50&&t.cellRight>t.boxRight,{sw:t.sw,cw:t.cw});
    check(`${scheme}：頁面沒有水平捲動`,(await overflow(page))<=0,await overflow(page));
    await page.evaluate(()=>{const w=document.querySelector('#h-bone').closest('section').querySelector('.labtable');w.scrollLeft=w.scrollWidth});await wait(100);
    check(`${scheme}：表格捲到最右，頁面仍沒有水平捲動，最後一欄進到容器內`,(await overflow(page))<=0&&await page.evaluate(()=>{const w=document.querySelector('#h-bone').closest('section').querySelector('.labtable');return w.scrollLeft>0&&w.querySelector('tbody tr td:last-child').getBoundingClientRect().right<=w.getBoundingClientRect().right+1}));
    check(`${scheme}：--c-bone 是 ${scheme==='light'?'#866552':'#d3b8a4'}，類別色條用這個 token`,t.token===(scheme==='light'?'#866552':'#d3b8a4')&&t.bar===t.want,t);
    const a=await page.evaluate(`(${scan.toString()})()`);
    check(`${scheme} 定期檢查頁（骨密度歷史展開）：觸控目標 ≥44、文字對比`,!a.small.length&&!a.low.length,{small:a.small.slice(0,6),low:a.low.slice(0,6)});
    /* 使用者在 claude.ai 明確選了主題時（data-theme），和系統設定相反也要跟著換 */
    const flip=await page.evaluate(sc=>{const r=document.documentElement;r.dataset.theme=sc==='light'?'dark':'light';const v=getComputedStyle(r).getPropertyValue('--c-bone').trim();delete r.dataset.theme;return v},scheme);
    check(`${scheme}：data-theme 指定相反的主題時，--c-bone 跟著換`,flip===(scheme==='light'?'#d3b8a4':'#866552'),flip);
    if(!NOSHOTS){fs.mkdirSync(SHOTS,{recursive:true});await page.evaluate(()=>{const w=document.querySelector('#h-bone').closest('section');w.querySelector('.labtable').scrollLeft=0;w.scrollIntoView({block:'start'})});await wait(150);
      await page.screenshot({path:path.join(SHOTS,`380-${scheme}-bone-history.png`)})}
    await page.click('[data-edit="b2"]');await wait(300);
    const d=await page.evaluate(`(${scan.toString()})()`);
    check(`${scheme} 骨密度表單：沒有水平捲動、觸控目標 ≥44、文字對比`,(await overflow(page))<=0&&!d.small.length&&!d.low.length,{small:d.small.slice(0,6),low:d.low.slice(0,6)});
    check(`${scheme} 骨密度表單：對話框內容沒有水平捲動`,await page.evaluate(()=>{const b=document.querySelector('#recForm .dlg-body');return b.scrollWidth<=b.clientWidth}));
    if(!NOSHOTS){await page.evaluate(()=>{document.querySelector('#labWrap').scrollIntoView({block:'start'})});await wait(150);await page.screenshot({path:path.join(SHOTS,`380-${scheme}-bone-form.png`)})}
    check(`${scheme}：沒有 JS 錯誤`,!errors.length,errors);
    await page.context().close()}

  /* ---- 今天頁的到期卡、「接下來」清單 ---- */
  {const s={...noRecs(seed()),'records/b2':bone('2025-11-25')}; // 2026/11/25 到期，26 天後
    const {page,errors}=await open({time:NOW,cfg:{latencyComp:true,seed:s}});await wait(600);
    const c=await page.evaluate(()=>{const e=document.querySelector('#examCard');return e?{t:e.textContent,dot:getComputedStyle(e.querySelector('.dot')).backgroundColor}:null});
    check('今天頁：60 天內到期的卡片顯示「骨密度 DXA・26 天後到期」，圓點是骨骼的顏色',c&&c.t.includes('骨密度 DXA')&&c.t.includes('26 天後到期')&&c.dot==='rgb(134, 101, 82)',c);
    await page.click('#examCard');await wait(300);
    const n=await page.evaluate(()=>({vis:!document.querySelector('#p-exams').hidden,li:[...document.querySelectorAll('#nextList li')].map(li=>li.textContent.replace(/\s+/g,' ').trim())}));
    check('點卡片到定期檢查頁；「接下來要做的檢查」第一項是骨密度 DXA 2026/11/25、26 天後到期',n.vis&&n.li.length===1&&n.li[0].includes('骨密度 DXA')&&n.li[0].includes('2026/11/25')&&n.li[0].includes('26 天後到期'),n);
    check('今天頁到期卡：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}
  {const s={...noRecs(seed()),'records/b0':bone('2024-11-20',{preset:'norm',interval:null,nextDue:null})}; // 匯入的舊資料：norm 沒有間隔 → 固定間隔 12 個月 → 已逾期
    const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:s}});await wait(600);
    check('今天頁：逾期的骨密度也會出現在卡片上',/骨密度 DXA.*已逾期 \d+ 天/.test(await txt(page,'#examCard')||''),await txt(page,'#examCard'));
    await page.context().close()}

  /* ---- 回診摘要 ---- */
  {const s=seed({'records/b2':bone('2025-11-25')});
    const {page,errors}=await open({time:NOW,hash:'summary',cfg:{latencyComp:true,seed:s}});await wait(700);
    const pv=await txt(page,'#smPreview');
    check('回診摘要：之後 180 天內到期列出「骨密度 DXA 2026/11/25」',/之後 180 天內到期：[^\n]*骨密度 DXA 2026\/11\/25/.test(pv),pv&&pv.slice(-200));
    check('回診摘要：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}
  {const s=seed({'records/b1':bone('2024-11-20')});
    const {page}=await open({time:NOW,hash:'summary',cfg:{latencyComp:true,seed:s}});await wait(700);
    const pv=await txt(page,'#smPreview');
    check('回診摘要：逾期的骨密度列在仍待處理「骨密度 DXA 2025/11/20 到期」',/仍待處理：[^\n]*骨密度 DXA 2025\/11\/20 到期/.test(pv),pv&&pv.slice(-200));
    await page.context().close()}

  /* ---- 匯出、匯入 ---- */
  {let exported;
    {const s=seed({'records/b2':bone('2025-11-25',{labs:allLabs(1)})});
      const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:s}});await wait(700);
      await tap(page,'#btnExport');await until(page,()=>!!window.__lastDownload);
      exported=JSON.parse(await page.evaluate(()=>window.__lastDownload.data));
      check('匯出：備份裡有骨密度紀錄與全部數值',exported.collections.records.b2?.exam==='bone_dxa'&&Object.keys(exported.collections.records.b2.labs).length===11,exported.collections.records.b2);
      await page.context().close()}
    {const {page,errors}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed()}});await wait(700);
      await page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await wait(300);
      const pv=await txt(page,'#impPreview');await tap(page,'#impGo');await tap(page,'#impGo');
      await until(page,()=>!document.querySelector('#impActions')||document.querySelector('#impActions').hidden,8000);
      const rs=await boneRecs(page);
      check('匯入含骨密度的備份：預覽算進定期檢查筆數，紀錄原樣寫入',/定期檢查 4 筆/.test(pv)&&rs.length===1&&rs[0].id==='b2'&&rs[0].preset==='low'&&rs[0].labs['右全髖 T']===exported.collections.records.b2.labs['右全髖 T'],{pv,rs});
      await page.evaluate(()=>{location.hash='exams'});await wait(400);
      check('匯入後：定期檢查頁的骨密度卡片顯示下次 2026/11/25',(await page.evaluate(()=>document.querySelector('#h-bone').closest('section').querySelector('.facts').textContent)).includes('下次2026/11/25'));
      check('匯入含骨密度的備份：沒有 JS 錯誤',!errors.length,errors);
      await page.context().close()}
    /* 舊備份（沒有 meddose、沒有骨密度）：照舊匯入，現有的骨密度紀錄不受影響 */
    {const base=sampleSeed(T),old={app:'jialin-health',version:1,exportedAt:'2026-06-01T00:00:00.000Z',collections:{days:{'2026-05-30':{date:'2026-05-30',am:{w:52.3,at:'07:10'},updatedAt:1}},exercise:{},
        records:{r1:base['records/r1'],r2:{...base['records/r2'],note:'舊備份'}},settings:{profile:base['settings/profile']}}};
      const {page,errors}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed({'records/b2':bone('2025-11-25',{labs:allLabs(1)})})}});await wait(700);
      await page.setInputFiles('#impFile',{name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await wait(300);
      const pv=await txt(page,'#impPreview');await tap(page,'#impGo');await tap(page,'#impGo');
      await until(page,()=>document.querySelector('#impActions').hidden,8000);
      const rs=await boneRecs(page),r2=await page.evaluate(()=>__mock.store.get('records/r2')),d=await page.evaluate(()=>__mock.store.get('days/2026-05-30'));
      check('匯入舊備份：預覽照舊（定期檢查 2 筆）、舊紀錄寫入',/定期檢查 2 筆/.test(pv)&&r2?.note==='舊備份'&&d?.am?.w===52.3,{pv,r2,d});
      check('匯入舊備份：現有的骨密度紀錄原封不動',rs.length===1&&rs[0].id==='b2'&&Object.keys(rs[0].labs).length===11,rs);
      check('匯入舊備份：沒有 JS 錯誤',!errors.length,errors);
      await page.context().close()}}

  /* ---- 從截圖填入：檢查項目選得到骨密度（不自動對應欄位） ---- */
  {const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:seed(),sample:{shot:'single'}}});await wait(600);
    await page.click('#btnAdd');await wait(150);
    const [fc]=await Promise.all([page.waitForEvent('filechooser',{timeout:3000}),page.click('#shotBox label')]);await fc.setFiles(await shotFile(page));
    await until(page,()=>!document.querySelector('#shotBar').hidden);
    const grp=await page.evaluate(()=>{const o=document.querySelector('#fExam option[value="bone_dxa"]');return o?{label:o.textContent,group:o.parentElement.label}:null});
    check('從截圖填入：檢查項目的選單有「骨骼 › 骨密度 DXA」',grp&&grp.label==='骨密度 DXA'&&grp.group==='骨骼',grp);
    await page.selectOption('#fExam','bone_dxa');await wait(150);
    const st=await page.evaluate(()=>({labs:[...document.querySelectorAll('[data-lab]')].map(i=>[i.dataset.lab,i.value]),note:document.querySelector('#shotExamNote').hidden?null:document.querySelector('#shotExamNote').textContent,bar:document.querySelector('#shotBar').textContent}));
    check('從截圖填入：換成骨密度後是骨密度的 11 個欄位，全部空白（不自動對應）',JSON.stringify(st.labs.map(l=>l[0]))===JSON.stringify(LABS)&&st.labs.every(l=>l[1]===''),st.labs);
    check('從截圖填入：截圖讀到的其他檢驗會放進報告內容',st.note&&st.note.includes('TSH')&&st.note.includes('會放進報告內容'),st.note);
    await page.selectOption('#fPreset','normHT');await page.fill('[data-lab="L1–L4 BMD"]','0.955');await page.click('#btnSave');await wait(500);
    const rs=await boneRecs(page);
    check('從截圖填入：存成骨密度紀錄（分類、間隔、手填的數值、截圖的日期與醫院）',rs.length===1&&rs[0].preset==='normHT'&&rs[0].interval===60&&rs[0].labs['L1–L4 BMD']==='0.955'&&rs[0].date==='2026-10-20'&&rs[0].place==='測試醫院'&&!!rs[0].shot&&rs[0].report.includes('TSH'),rs);
    check('從截圖填入：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
