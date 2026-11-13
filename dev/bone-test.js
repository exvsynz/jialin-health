/* 骨密度 DXA（bone_dxa）與檢查表單的間隔驗證。全部是合成資料。
   - 八個分類（分類和間隔分開）：只有 POI 確診的兩個帶入間隔，其他與未分類都是待安排；分類不從 T／Z 數值自動選，也不從 T 推 Z
   - 沒有固定間隔：待安排在定期檢查頁、今天頁、回診摘要都看得到（排程的部分在 remind-ref-test）
   - 間隔只收 0–120 的整數月；無效值顯示在欄位上、不寫入；已存的無效值讀出來是待安排，不算出 NaN 日期
   - 相容性：沒有 cat、舊的 preset id、表單沒有的 labs key、已存的醫師指定間隔、匯出匯入往返、舊備份
   - 歷次表格在自己的容器內水平捲動；--c-bone 在兩種主題的定義；從截圖填入時選得到
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
const Z_SRC='ISCD 2023 分類；分類本身不提供重測間隔，請依醫囑。',T_SRC='ISCD 2023／WHO 分類；重測間隔依個別臨床條件，請依醫囑。';
/* 代號、標籤、帶入的間隔（0 = 待安排）、依據 */
const PRESETS=[
  ['none','未分類：報告未提供 Z 值（T 值僅記錄）',0,'ISCD 2023：停經前優先用 Z；現有資料不足以依 Z 分類。請補 Z 值報告或依醫師評估指定追蹤日期。'],
  ['zlow','停經前 Z ≤ −2.0（低於同齡預期）',0,Z_SRC],
  ['zok','停經前 Z > −2.0（在同齡預期範圍內）',0,Z_SRC],
  ['poiLow','POI 確診，骨密度低（Z ≤ −2.0）或骨質疏鬆',12,'ESHRE 2024 POI 建議 69：依個人風險每 1–3 年，本工具取下限 12 個月。'],
  ['poiNormHT','POI 確診，骨密度正常，且持續足量全身性荷爾蒙治療',60,'ESHRE 2024 POI 建議 68：5 年內重測價值低。60 個月是本工具換算的提醒日期，不是指引規定的重測時間。'],
  ['tnorm','停經後 T ≥ −1.0（WHO 正常）',0,T_SRC],
  ['tlow','停經後 −2.5 < T < −1.0（WHO 低骨量）',0,T_SRC],
  ['top','停經後 T ≤ −2.5，或醫師判定骨質疏鬆',0,T_SRC]];
const ARRANGE='待安排：還沒有追蹤計畫，醫師指定後再填間隔或日期',NODEF='這個檢查沒有固定間隔：先列為待安排，醫師指定後再填間隔或日期';
const IV_ERR='間隔請填 0–120 的整數（月）；0 是待安排';
/* 把標籤上寫的不等式讀成判斷式，用邊界值檢查各分類互不重疊。sym 是 'T' 或 'Z' */
function rule(label,sym){const s=label.replace(/−/g,'-'),n='(-?\\d+(?:\\.\\d+)?)';
  let m=s.match(new RegExp(n+' < '+sym+' < '+n));if(m)return x=>x>+m[1]&&x<+m[2];
  m=s.match(new RegExp(sym+' (≤|≥|<|>) '+n));if(!m)return null;const a=+m[2];return{'≤':x=>x<=a,'≥':x=>x>=a,'<':x=>x<a,'>':x=>x>a}[m[1]]}
const allLabs=k=>Object.fromEntries(LABS.map((n,i)=>[n,/BMD$/.test(n)?(0.9-i*0.01-k*0.02).toFixed(3):(-1.2-i*0.1-k*0.1).toFixed(1)]));
const bone=(date,o={})=>({exam:'bone_dxa',cat:'bone',date,preset:'poiLow',interval:12,nextDue:null,report:'',place:'測試醫院',doctor:'',note:'',labs:{},createdAt:10,updatedAt:10,...o});
const seed=(extra={})=>({...sampleSeed(T),...extra});
const noRecs=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!k.startsWith('records/')));
const boneRecs=page=>page.evaluate(()=>[...__mock.store.entries()].filter(([k,v])=>k.startsWith('records/')&&v.exam==='bone_dxa').map(([k,v])=>({id:k.slice(8),...v})).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.createdAt||0)-(b.createdAt||0)));
const writes=page=>page.evaluate(()=>__mock.writes.length);
const stored=(page,id)=>page.evaluate(id=>{const v=__mock.store.get('records/'+id);return v===undefined?null:JSON.parse(JSON.stringify(v))},id);
const txt=(page,s)=>page.evaluate(s=>{const e=document.querySelector(s);return e?e.textContent:null},s);
const formState=page=>page.evaluate(()=>{const q=s=>document.querySelector(s),er=id=>q(id).hidden?null:q(id).textContent;return{exam:q('#fExam').value,preset:q('#fPreset').value,interval:q('#fInterval').value,due:q('#fDue').value,
  hint:q('#presetHint').textContent,preview:q('#duePreview').textContent,open:q('#dlgRec').open,ivErr:er('#fIntervalErr'),dueErr:er('#fDueErr'),ivInvalid:q('#fInterval').getAttribute('aria-invalid'),dueInvalid:q('#fDue').getAttribute('aria-invalid'),focus:document.activeElement?.id||null,
  z:q('[data-lab="L1–L4 Z"]')?.value??null}});
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
/* 骨密度卡片上看得到的狀態 */
const boneCard=page=>page.evaluate(()=>{const s=document.querySelector('#h-bone').closest('section');return{pill:s.querySelector('.pill')?.textContent,chip:s.querySelector('.exam-side .chip')?.textContent||null,facts:s.querySelector('.facts').textContent,sub:s.querySelector('.exam-sub').textContent,
  next:[...document.querySelectorAll('#nextList li')].map(li=>li.textContent.replace(/\s+/g,' ').trim()),tally:document.querySelector('#tally').textContent,all:document.querySelector('#p-exams').textContent}});
const typeInterval=async(page,v)=>{await page.fill('#fInterval','');await page.click('#fInterval');await page.keyboard.type(v);await wait(60)};
/* 合成截圖（和 shot-page-test 相同的做法） */
async function shotFile(page){const b64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=900;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,600,900);x.fillStyle='#000';x.font='28px sans-serif';x.fillText('DXA 測試',40,80);return c.toDataURL('image/png').split(',')[1]});
  return{name:'s.png',mimeType:'image/png',buffer:Buffer.from(b64,'base64')}}

(async()=>{
  /* ---- 原始碼與文件 ---- */
  {const html=fs.readFileSync(SRC,'utf8'),css=html.slice(0,html.indexOf('</style>'));
    const iMedia=css.indexOf('@media (prefers-color-scheme: dark)'),iAttr=css.indexOf(':root[data-theme="dark"]{'),pos=[...css.matchAll(/--c-bone:\s*#[0-9a-f]{6}/g)].map(m=>m.index);
    check('--c-bone：:root、prefers-color-scheme 深色、data-theme 深色各定義一次',pos.length===3&&pos[0]<iMedia&&pos[1]>iMedia&&pos[1]<iAttr&&pos[2]>iAttr,pos);
    check('CATS 的骨骼顏色走 token',html.includes("{id:'bone',name:'骨骼',en:'Bone',color:'var(--c-bone)'}"));
    check('EXAMS：骨密度沒有固定間隔（def 是 null），舊的四個 preset id 不再出現',html.includes("{id:'bone_dxa',cat:'bone',name:'骨密度 DXA',def:null,")&&!/\{k:'(low|op|normHT|norm)',/.test(html));
    const doc=fs.readFileSync(path.join(ROOT,'docs/exam-intervals.md'),'utf8');
    check('docs/exam-intervals.md：骨密度段落有出處、短說明、八個分類，沒有「待使用者確認」',['doi:10.1093/hropen/hoae065','ISCD 2023 Adult Official Positions','停經前優先以 Z 值判讀；只有 T 值可先記錄，不自動分類。','同一台機器的 BMD (g/cm²) 變化',...PRESETS.map(p=>p[1])].every(t=>doc.includes(t))&&!doc.includes('待使用者確認'),PRESETS.map(p=>p[1]).filter(t=>!doc.includes(t)));
    check('DEPLOYED.md：保留要同步晚上與週報任務的註記',fs.readFileSync(path.join(ROOT,'ops/scheduled/DEPLOYED.md'),'utf8').includes('需由 claude.ai 用 update_trigger 同步晚上與週報任務'))}

  /* ---- 八個分類：標籤、間隔、依據；邊界；不自動分類 ---- */
  {const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:seed()}});await wait(600);
    const card=await page.evaluate(()=>{const s=document.querySelector('#h-bone')?.closest('section');return s?{h:s.querySelector('h3').textContent,en:s.querySelector('.en').textContent,name:s.querySelector('.exam-name').textContent,sub:s.querySelector('.exam-sub').textContent,pill:s.querySelector('.pill').textContent,facts:s.querySelector('.facts').textContent,last:document.querySelector('#cats').lastElementChild===s}:null});
    check('定期檢查頁：最後一類是「骨骼 Bone」，裡面是「骨密度 DXA」，還沒有紀錄',card&&card.h==='骨骼'&&card.en==='Bone'&&card.name==='骨密度 DXA'&&card.pill==='尚無紀錄'&&card.last,card);
    check('還沒有紀錄的卡片：寫明沒有固定間隔，不顯示 12 個月',card&&card.facts==='固定間隔沒有，依分類或醫囑'&&card.sub.includes('沒有固定間隔')&&!/1 年|12/.test(card.facts+card.sub),card);
    check('已追蹤的分母是 10 項',/\/10 項/.test(await txt(page,'#tally')),await txt(page,'#tally'));
    await page.click('[data-add="bone_dxa"]');await wait(250);
    const opts=await page.evaluate(()=>[...document.querySelectorAll('#fPreset option')].map(o=>[o.value,o.textContent]));
    check('報告分類：（未分類）加八個分類，代號與文字照規格',JSON.stringify(opts)===JSON.stringify([['','（未分類）'],...PRESETS.map(p=>[p[0],p[1]])]),opts);
    const labs=await page.evaluate(()=>[...document.querySelectorAll('#labs .field')].map(f=>{const i=f.querySelector('input'),b=f.getBoundingClientRect();return{n:i.dataset.lab,label:f.querySelector('label').textContent.replace(/\s+/g,' ').trim(),mode:i.getAttribute('inputmode'),left:Math.round(b.left),top:Math.round(b.top)}}));
    check('檢驗欄位：11 個，名稱與順序照規格',JSON.stringify(labs.map(l=>l.n))===JSON.stringify(LABS),labs.map(l=>l.n));
    check('檢驗欄位：BMD 標出 g/cm²，T／Z 沒有單位',labs.every(l=>/BMD$/.test(l.n)?l.label===l.n+' g/cm²':l.label===l.n),labs.map(l=>l.label));
    check('檢驗欄位：BMD 用小數鍵盤；T／Z 可能是負值，不用沒有負號的小數鍵盤',labs.every(l=>/BMD$/.test(l.n)?l.mode==='decimal':l.mode===null),labs.map(l=>l.mode));
    const by=Object.fromEntries(labs.map(l=>[l.n,l]));
    check('檢驗欄位（380 寬）：每個部位的 BMD 從新的一列開始，T 值在同一列',LABS.filter(n=>/BMD$/.test(n)).every(n=>by[n].left===by[LABS[0]].left&&by[n.replace('BMD','T')].top===by[n].top&&by[n.replace('BMD','T')].left>by[n].left),labs);
    let f=await formState(page);
    check('沒選分類：間隔帶 0（待安排），不帶 12；說明寫沒有固定間隔',f.preset===''&&f.interval==='0'&&f.hint===NODEF&&f.preview===ARRANGE&&f.ivErr===null,f);
    await page.fill('#fDate','2026-10-01');
    const got=[];
    for(const [k] of PRESETS){await page.selectOption('#fPreset',k);const s=await formState(page);got.push([k,s.interval,s.hint,s.preview])}
    check('每個分類帶入的間隔：只有 poiLow 是 12、poiNormHT 是 60，其他六個都是 0（待安排）',JSON.stringify(got.map(g=>[g[0],g[1]]))===JSON.stringify(PRESETS.map(p=>[p[0],String(p[2])])),got.map(g=>[g[0],g[1]]));
    check('每個分類的依據文字照規格',JSON.stringify(got.map(g=>g[2]))===JSON.stringify(PRESETS.map(p=>p[3])),got.map(g=>g[2]));
    check('預覽：待安排的六個不顯示日期；POI 兩個是 2027/10/01 與 2031/10/01',got.every(g=>g[3]===({poiLow:'下次檢查：2027/10/01（1 年後）',poiNormHT:'下次檢查：2031/10/01（5 年後）'}[g[0]]||ARRANGE)),got.map(g=>[g[0],g[3]]));
    check('POI 骨密度低：12 個月，依據寫 ESHRE 建議 69 與取下限',got[3][1]==='12'&&got[3][2]==='ESHRE 2024 POI 建議 69：依個人風險每 1–3 年，本工具取下限 12 個月。',got[3]);
    check('POI 正常且荷爾蒙治療：60 個月，依據寫明是本工具換算的提醒日期，不是指引規定的重測時間；標籤有「持續足量全身性」',got[4][1]==='60'&&got[4][2]==='ESHRE 2024 POI 建議 68：5 年內重測價值低。60 個月是本工具換算的提醒日期，不是指引規定的重測時間。'&&PRESETS[4][1].includes('持續足量全身性荷爾蒙治療')&&opts[5][1]===PRESETS[4][1],got[4]);
    check('只有標籤寫「POI 確診」的分類才帶入間隔；停經前、停經後的分類都不會自動帶 12 或 60',opts.slice(1).every(([k,l])=>l.startsWith('POI 確診')===(got.find(g=>g[0]===k)[1]!=='0')),got.map(g=>[g[0],g[1]]));
    await page.selectOption('#fPreset','poiNormHT');await page.selectOption('#fPreset','zok');f=await formState(page);
    check('從 POI 的 60 個月改選停經前 Z > −2.0：間隔回到 0，不留著 60',f.interval==='0'&&f.preview===ARRANGE,f);
    await page.selectOption('#fPreset','poiLow');await page.selectOption('#fPreset','');f=await formState(page);
    check('改回（未分類）：間隔回到 0',f.interval==='0'&&f.hint===NODEF,f);
    /* 邊界：正常包含 −1.0，骨質疏鬆包含 −2.5，Z 的 −2.0 屬於「低於同齡預期」，各分類不重疊 */
    const lab=k=>opts.find(o=>o[0]===k)[1],zr=['zlow','zok'].map(k=>[k,rule(lab(k),'Z')]),tr=['tnorm','tlow','top'].map(k=>[k,rule(lab(k),'T')]);
    const which=(rs,x)=>rs.filter(([,fn])=>fn&&fn(x)).map(r=>r[0]).join('+');
    check('Z 的邊界：−2.0 與更低是 zlow，高於 −2.0 是 zok，每個值只落在一個分類',JSON.stringify([-3,-2.01,-2.0,-1.99,0,1.5].map(x=>which(zr,x)))===JSON.stringify(['zlow','zlow','zlow','zok','zok','zok']),[-3,-2.01,-2.0,-1.99,0,1.5].map(x=>which(zr,x)));
    check('T 的邊界：−1.0 是正常，−2.5 是骨質疏鬆，兩者之間是低骨量，每個值只落在一個分類',JSON.stringify([1,-0.99,-1.0,-1.01,-2.49,-2.5,-2.51,-4].map(x=>which(tr,x)))===JSON.stringify(['tnorm','tnorm','tnorm','tlow','tlow','top','top','top']),[1,-0.99,-1.0,-1.01,-2.49,-2.5,-2.51,-4].map(x=>which(tr,x)));
    check('POI 骨密度低的標籤用 Z ≤ −2.0（和停經前的分類同一條界線）',rule(lab('poiLow'),'Z')(-2.0)&&!rule(lab('poiLow'),'Z')(-1.99));
    /* 只有 T 值：不自動歸入任何分類，也不把 T 推成 Z */
    for(const [k,v] of [['L1–L4 T','-2.6'],['左股骨頸 T','-1.2'],['右全髖 T','−2.8']])await page.fill(`[data-lab="${k}"]`,v);
    f=await formState(page);
    check('只填 T 值：分類仍是（未分類），Z 欄仍是空的，間隔仍是 0',f.preset===''&&f.z===''&&f.interval==='0',f);
    await page.fill('[data-lab="L1–L4 Z"]','-2.5');f=await formState(page);
    check('填了 Z −2.5：也不會自動選「停經前 Z ≤ −2.0」，分類要自己選',f.preset===''&&f.interval==='0',f);
    await page.fill('[data-lab="L1–L4 Z"]','');
    const w0=await writes(page);await page.click('#btnSave');await wait(400);let rs=await boneRecs(page);
    check('只有 T 值的紀錄：存成未分類、interval 0，labs 只有填的三個 T，沒有 Z',rs.length===1&&rs[0].preset===null&&rs[0].interval===0&&rs[0].nextDue===null&&rs[0].cat==='bone'&&JSON.stringify(rs[0].labs)===JSON.stringify({'L1–L4 T':'-2.6','左股骨頸 T':'-1.2','右全髖 T':'−2.8'})&&(await writes(page))===w0+1,rs);
    let c=await boneCard(page);
    check('定期檢查頁：待安排的骨密度有「待安排」標籤，下次寫待安排，不寫日期、沒有 NaN',c.pill==='待安排'&&c.facts.includes('下次待安排')&&!/NaN|下次\d/.test(c.facts),c.facts);
    check('「接下來要做的檢查」列出骨密度 DXA 待安排；已追蹤 4/10 項',c.next.some(t=>t.includes('骨密度 DXA')&&t.includes('待安排')&&!t.includes('NaN'))&&c.tally.includes('已追蹤 4/10 項'),c.next);
    /* 待安排在今天頁與回診摘要 */
    await page.evaluate(()=>{location.hash='today'});await wait(350);
    check('今天頁：到期卡第一項是「骨密度 DXA 待安排」',/^骨密度DXA待安排・另有\d項/.test((await txt(page,'#examCard')||'').replace(/\s+/g,'')),await txt(page,'#examCard'));
    await page.evaluate(()=>{location.hash='summary'});await wait(500);
    check('回診摘要：仍待處理列出「骨密度 DXA 待安排」',/仍待處理：[^\n]*骨密度 DXA 待安排/.test(await txt(page,'#smPreview')),(await txt(page,'#smPreview')).slice(-160));
    /* 使用者可以改填醫師指定的間隔或日期 */
    await page.evaluate(()=>{location.hash='exams'});await wait(350);
    await page.click(`[data-edit="${rs[0].id}"]`);await wait(250);await page.selectOption('#fPreset','zlow');await typeInterval(page,'24');f=await formState(page);
    check('選了待安排的分類後改填間隔 24：預覽 2028/10/01',f.preview==='下次檢查：2028/10/01（2 年後）'&&f.ivErr===null,f);
    await page.click('#btnSave');await wait(400);rs=await boneRecs(page);c=await boneCard(page);
    check('醫師指定的間隔照存、照算：preset zlow、interval 24，卡片下次 2028/10/01',rs[0].preset==='zlow'&&rs[0].interval===24&&c.facts.includes('下次2028/10/01')&&c.facts.includes('間隔2 年')&&c.chip==='停經前 Z ≤ −2.0（低於同齡預期）',{r:rs[0],facts:c.facts,chip:c.chip});
    await page.click('[data-add="bone_dxa"]');await wait(250);await page.fill('#fDate','2026-10-10');await page.selectOption('#fPreset','tlow');await page.fill('#fDue','2027-03-01');f=await formState(page);
    check('待安排的分類加上醫師指定日期：預覽是那個日期',f.preview==='下次檢查：2027/03/01（醫師指定）'&&f.interval==='0',f);
    await page.click('#btnSave');await wait(400);rs=await boneRecs(page);c=await boneCard(page);
    check('醫師指定日期：存 nextDue，卡片不再是待安排',rs.length===2&&rs[1].preset==='tlow'&&rs[1].interval===0&&rs[1].nextDue==='2027-03-01'&&c.facts.includes('下次2027/03/01')&&c.facts.includes('醫師指定日期')&&c.pill!=='待安排',{r:rs[1],c:c.facts,pill:c.pill});
    const ref=await page.evaluate(()=>{document.querySelector('details.refbox').open=true;return{rows:[...document.querySelectorAll('#refTable tbody tr')].filter(tr=>tr.cells[0].textContent==='骨密度 DXA').map(tr=>[...tr.cells].map(c=>c.textContent)),bone:document.querySelector('#boneRef').textContent}});
    check('追蹤間隔的依據：表格有八列骨密度，預設欄是待安排、1 年、5 年',JSON.stringify(ref.rows.map(x=>[x[1],x[2],x[3]]))===JSON.stringify(PRESETS.map(p=>[p[1],{0:'待安排',12:'1 年',60:'5 年'}[p[2]],p[3]])),ref.rows);
    check('追蹤間隔的依據：短說明照審查 4.1 的文字，寫明出處、60 個月是工具換算、同一台機器的 BMD；不再寫「不用 T 值」',['停經前優先以 Z 值判讀；只有 T 值可先記錄，不自動分類。停經後採 T／WHO；更年期過渡期是否採用由醫師判定。分類與追蹤間隔各有適用條件。','ESHRE 2024 POI guideline','doi:10.1093/hropen/hoae065','ISCD 2023 Adult Official Positions','只有 POI 確診的兩個分類帶入間隔','60 個月是本工具換算的提醒日期，不是指引規定的重測時間','看同一台機器的 BMD（g/cm²）變化'].every(t=>ref.bone.includes(t))&&!ref.bone.includes('不用 T 值'),ref.bone);
    check('設定頁的固定間隔沒有骨密度這一列（它沒有固定間隔）',await page.evaluate(()=>{location.hash='setup';return new Promise(r=>setTimeout(()=>r(!document.querySelector('#iv-bone_dxa')&&!!document.querySelector('#iv-gi_colo')),300))}));
    check('分類流程：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* ---- 間隔驗證（整個檢查表單共用）：0–120 的整數月；無效值顯示在欄位上，寫入 0 次 ---- */
  for(const scheme of ['light','dark']){
    const {page,errors}=await open({time:NOW,hash:'exams',scheme,cfg:{latencyComp:true,seed:seed()}});await wait(600);
    await page.click('[data-add="bone_dxa"]');await wait(250);await page.fill('#fDate','2026-10-05');await page.selectOption('#fPreset','zok');
    const w0=await writes(page),bad=[];
    for(const v of (scheme==='light'?['-1','1.5','121','1e12','1000000000000','e','--','240']:['-1','121'])){
      await typeInterval(page,v);const live=await formState(page);await page.click('#btnSave');await wait(250);const f=await formState(page);
      if(!(live.ivErr===IV_ERR&&live.ivInvalid==='true'&&!/NaN|下次檢查/.test(live.preview)&&f.open&&f.ivErr===IV_ERR&&f.focus==='fInterval'&&(await writes(page))===w0&&(await boneRecs(page)).length===0))bad.push([v,live.ivErr,live.preview,f.open,f.focus,await writes(page)])}
    check(`${scheme}：間隔填 −1、1.5、121、1e12 等無效值：一輸入就在欄位上顯示錯誤、預覽不算日期；按儲存不寫入、面板不關、焦點回到間隔欄`,!bad.length,bad);
    if(scheme==='light'){
      await typeInterval(page,'abc');let f=await formState(page);
      check('間隔打 abc：數字欄位不收字母，欄位是空的，預覽要求填間隔',f.interval===''&&f.preview==='請填追蹤間隔',f);
      await page.click('#btnSave');await wait(250);f=await formState(page);
      check('間隔是空的、也沒有指定日期：欄位上顯示要填、不寫入',f.open&&f.ivErr==='請填追蹤間隔或指定日期'&&f.ivInvalid==='true'&&f.focus==='fInterval'&&(await txt(page,'#toastText'))==='請填追蹤間隔或指定日期'&&(await writes(page))===w0,f);
      /* 有合法的指定日期，也不能順便存下不合法的間隔 */
      await page.fill('#fDue','2027-06-01');await typeInterval(page,'-1');await page.click('#btnSave');await wait(250);f=await formState(page);
      check('有指定日期時，間隔 −1 一樣擋下，不寫入',f.open&&f.ivErr===IV_ERR&&(await writes(page))===w0,f);
      /* 指定日期必須是有效日期 */
      await typeInterval(page,'0');
      await page.evaluate(()=>{const d=document.querySelector('#fDue');d.value='275760-01-01';d.dispatchEvent(new Event('input',{bubbles:true}))});await wait(80);f=await formState(page);
      check('指定日期超出範圍（年份 275760）：欄位上顯示錯誤，預覽不顯示日期',f.due==='275760-01-01'&&f.dueErr==='請填完整、有效的日期'&&f.dueInvalid==='true'&&!/下次檢查/.test(f.preview),f);
      await page.click('#btnSave');await wait(250);f=await formState(page);
      check('無效的指定日期：不寫入，焦點在日期欄',f.open&&f.focus==='fDue'&&(await writes(page))===w0,f);
      await page.fill('#fDue','');await page.click('#fDue');await page.keyboard.type('12');await wait(80);
      check('指定日期只打了一半：欄位的值是空的，但瀏覽器標成輸入不完整',await page.evaluate(()=>{const d=document.querySelector('#fDue');return d.value===''&&d.validity.badInput}));
      await page.click('#fNote');await wait(80);f=await formState(page);
      check('指定日期只打了一半：離開欄位就顯示錯誤，預覽不當成沒填',f.dueErr==='請填完整、有效的日期'&&f.dueInvalid==='true'&&f.preview==='先修正上面標出的欄位',f);
      await page.click('#btnSave');await wait(250);f=await formState(page);
      check('指定日期只打了一半：按儲存寫入 0 次（不會當成沒填日期而存成待安排），焦點回到日期欄',(await writes(page))===w0&&f.open&&f.dueErr==='請填完整、有效的日期'&&f.focus==='fDue',f);
      await page.evaluate(()=>{const d=document.querySelector('#fDue');d.value='';d.dispatchEvent(new Event('input',{bubbles:true}))});
      await typeInterval(page,'0');f=await formState(page);
      check('間隔 0：沒有錯誤，預覽是待安排',f.ivErr===null&&f.ivInvalid===null&&f.dueErr===null&&f.preview===ARRANGE,f);
      await page.click('#btnSave');await wait(400);const rs=await boneRecs(page);
      check('間隔 0：存成待安排（interval 0），只寫入一次',rs.length===1&&rs[0].interval===0&&rs[0].nextDue===null&&rs[0].preset==='zok'&&(await writes(page))===w0+1&&(await boneCard(page)).pill==='待安排',rs);
      /* 其他檢查用的是同一張表單 */
      await page.click('[data-add="gi_colo"]');await wait(250);await page.fill('#fDate','2026-10-06');const w1=await writes(page);
      await typeInterval(page,'121');await page.click('#btnSave');await wait(250);f=await formState(page);
      check('大腸鏡：間隔 121 一樣擋下，不寫入',f.open&&f.ivErr===IV_ERR&&(await writes(page))===w1,f);
      await typeInterval(page,'120');await page.click('#btnSave');await wait(400);
      check('大腸鏡：間隔 120 可以存',(await writes(page))===w1+1&&await page.evaluate(()=>[...__mock.store.values()].some(v=>v.exam==='gi_colo'&&v.interval===120&&v.date==='2026-10-06')));
      await page.click('[data-add="thy_us"]');await wait(250);await page.selectOption('#fPreset','none');f=await formState(page);
      check('甲狀腺超音波「無結節」照舊：間隔空白、不排例行追蹤、沒有錯誤',f.interval===''&&f.ivErr===null&&f.preview.startsWith('不排例行追蹤'),f);
      await page.click('#dlgRec [data-close]');await wait(150)}
    else{
      await typeInterval(page,'-1');await wait(100);const a=await page.evaluate(`(${scan.toString()})()`);
      check('dark 表單的錯誤訊息：對比足夠、沒有水平捲動',!a.low.length&&(await overflow(page))<=0,a.low.slice(0,6));
      if(!NOSHOTS){fs.mkdirSync(SHOTS,{recursive:true});await page.evaluate(()=>document.querySelector('#fInterval').scrollIntoView({block:'center'}));await wait(150);await page.screenshot({path:path.join(SHOTS,'380-dark-interval-error.png')})}
      await page.click('#dlgRec [data-close]');await wait(150)}
    if(scheme==='light'){await page.click('[data-add="bone_dxa"]');await wait(250);await typeInterval(page,'1.5');await wait(100);const a=await page.evaluate(`(${scan.toString()})()`);
      check('light 表單的錯誤訊息：對比足夠、沒有水平捲動',!a.low.length&&(await overflow(page))<=0,a.low.slice(0,6));
      if(!NOSHOTS){fs.mkdirSync(SHOTS,{recursive:true});await page.evaluate(()=>document.querySelector('#fInterval').scrollIntoView({block:'center'}));await wait(150);await page.screenshot({path:path.join(SHOTS,'380-light-interval-error.png')})}}
    check(`${scheme} 間隔驗證：沒有 JS 錯誤`,!errors.length,errors);
    await page.context().close()}

  /* ---- 讀到已存的無效間隔：顯示成待安排，不算出 NaN 日期，也不改資料 ---- */
  {const base=noRecs(seed()),rec=(exam,cat,date,o)=>({exam,cat,date,preset:null,interval:12,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{},createdAt:1,updatedAt:1,...o});
    const s={...base,'records/x1':bone('2026-10-01',{preset:'zok',interval:1e12}),'records/x2':rec('breast_us','breast','2026-09-01',{interval:-1}),'records/x3':rec('lung_ldct','lung','2026-08-01',{interval:1.5}),'records/x4':rec('gi_egd','gi','2026-07-01',{interval:121}),'records/x5':rec('thy_lab','thyroid','2026-07-01',{interval:6})};
    const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:s}});await wait(600);
    const v=await page.evaluate(()=>({pills:Object.fromEntries([...document.querySelectorAll('#cats article.exam')].map(a=>[a.querySelector('.exam-name').textContent,a.querySelector('.pill').textContent])),text:document.querySelector('#p-exams').textContent,next:[...document.querySelectorAll('#nextList li')].map(li=>li.textContent.replace(/\s+/g,' ').trim())}));
    check('定期檢查頁：間隔是 1e12、−1、1.5、121 的四筆都顯示「待安排」，正常的那筆照算',v.pills['骨密度 DXA']==='待安排'&&v.pills['乳房超音波']==='待安排'&&v.pills['低劑量電腦斷層 LDCT']==='待安排'&&v.pills['上消化道內視鏡（胃鏡）']==='待安排'&&/個月|天後/.test(v.pills['甲狀腺抽血']),v.pills);
    check('定期檢查頁：整頁沒有 NaN，也沒有把無效的數字印成間隔',!/NaN/.test(v.text)&&!/1000000000000|1\.5 個月|121 個月|-1 個月/.test(v.text),v.next);
    check('讀取不改資料：寫入 0 次，資料庫裡的 interval 原封不動',(await writes(page))===0&&(await stored(page,'x1')).interval===1e12&&(await stored(page,'x2')).interval===-1&&(await stored(page,'x3')).interval===1.5);
    await page.evaluate(()=>{location.hash='today'});await wait(350);const tc=(await txt(page,'#examCard')||'').replace(/\s+/g,'');
    check('今天頁：無效間隔的紀錄沒有消失，卡片顯示待安排與其他項數',/待安排・另有3項/.test(tc)&&!/NaN/.test(tc),tc);
    await page.evaluate(()=>{location.hash='summary'});await wait(500);const pv=await txt(page,'#smPreview');
    check('回診摘要：四筆都列在仍待處理（待安排），沒有 NaN',['骨密度 DXA 待安排','乳房超音波 待安排','低劑量電腦斷層 LDCT 待安排','上消化道內視鏡（胃鏡） 待安排'].every(t=>pv.includes(t))&&!/NaN/.test(pv),pv.slice(-220));
    await page.evaluate(()=>{location.hash='exams'});await wait(350);await page.evaluate(()=>openRecord('bone_dxa',records.find(r=>r.id==='x1')));await wait(250);
    let f=await formState(page);
    check('編輯無效間隔的舊紀錄：欄位保留原值讓人修正，並直接標出錯誤',f.interval==='1000000000000'&&f.ivErr===IV_ERR&&f.preset==='zok'&&!/NaN/.test(f.preview),f);
    await page.click('#btnSave');await wait(250);
    check('編輯無效間隔的舊紀錄：不修正就不能存',(await writes(page))===0&&(await formState(page)).open);
    await typeInterval(page,'6');await page.click('#btnSave');await wait(400);
    check('改成 6 之後可以存，卡片算出 2027/04/01',(await stored(page,'x1')).interval===6&&(await boneCard(page)).facts.includes('下次2027/04/01'),(await boneCard(page)).facts);
    check('無效間隔的讀取：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* ---- 相容性：沒有 cat、舊的 preset id、表單沒有的 labs key、已存的醫師指定間隔 ---- */
  {const old={exam:'bone_dxa',date:'2025-11-25',preset:'low',interval:12,nextDue:null,report:'舊紀錄',place:'測試醫院',doctor:'',note:'',labs:{'L1–L4 T':'-1.4','左前臂 BMD':'0.512'},createdAt:5,updatedAt:5}; // 沒有 cat，preset 是改版前的代號
    const s={...noRecs(seed()),'records/c1':old};
    const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:s}});await wait(600);
    let c=await boneCard(page);
    check('沒有 cat、preset 是舊代號的紀錄：照已存的 12 個月顯示（下次 2026/11/25、26 天後到期），不會壞',c.pill==='26 天後到期'&&c.facts.includes('下次2026/11/25')&&c.facts.includes('間隔1 年')&&c.chip===null&&c.next.some(t=>t.includes('骨密度 DXA')&&t.includes('2026/11/25')),c);
    await page.evaluate(()=>{location.hash='today'});await wait(350);
    check('沒有 cat 的紀錄：今天頁的到期卡照樣顯示',/骨密度 DXA.*26 天後到期/.test(await txt(page,'#examCard')||''),await txt(page,'#examCard'));
    await page.evaluate(()=>{location.hash='summary'});await wait(500);
    check('沒有 cat 的紀錄：回診摘要照樣列出',/骨密度 DXA 2026\/11\/25/.test(await txt(page,'#smPreview')));
    await page.evaluate(()=>{location.hash='exams'});await wait(350);await page.click('[data-hist="bone_dxa"]');await wait(200);await page.click('[data-edit="c1"]');await wait(250);
    let f=await formState(page);
    check('編輯舊紀錄：已存的間隔 12 原樣帶出，不因為分類改版而清掉或改成 0',f.interval==='12'&&f.ivErr===null&&f.preview==='下次檢查：2026/11/25（1 年後）',f);
    await page.fill('#fNote','補一句備註');await page.click('#btnSave');await wait(400);let r=await stored(page,'c1');
    check('編輯後：間隔仍是 12、補上 cat、表單沒有的 labs key 與其他欄位都保留',r.interval===12&&r.cat==='bone'&&r.note==='補一句備註'&&r.report==='舊紀錄'&&JSON.stringify(r.labs)===JSON.stringify({'L1–L4 T':'-1.4','左前臂 BMD':'0.512'})&&r.createdAt===5,r);
    /* 已存的醫師指定間隔與日期：只改別的欄位時不動 */
    await page.evaluate(()=>{__mock.externalSet('records/c2',{exam:'bone_dxa',cat:'bone',date:'2026-01-10',preset:'zok',interval:24,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{'L1–L4 Z':'-0.4'},createdAt:6,updatedAt:6});
      __mock.externalSet('records/c3',{exam:'bone_dxa',cat:'bone',date:'2026-02-10',preset:'top',interval:0,nextDue:'2026-12-15',report:'',place:'',doctor:'',note:'',labs:{},createdAt:7,updatedAt:7})});await wait(300);
    for(const id of ['c2','c3']){await page.click(`[data-edit="${id}"]`);await wait(250);await page.fill('#fPlace','另一家醫院');await page.click('#btnSave');await wait(400)}
    const c2=await stored(page,'c2'),c3=await stored(page,'c3');
    check('已存的醫師指定間隔（24）與指定日期：編輯別的欄位後原封不動',c2.interval===24&&c2.preset==='zok'&&c2.nextDue===null&&c2.place==='另一家醫院'&&c3.interval===0&&c3.nextDue==='2026-12-15'&&c3.preset==='top',{c2,c3});
    check('相容性：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* ---- 歷次表格、顏色、版面（380 寬，淺色與深色） ---- */
  for(const scheme of ['light','dark']){
    const s=seed({'records/b1':bone('2024-11-20',{labs:allLabs(0)}),'records/b2':bone('2025-11-25',{labs:allLabs(1),preset:'poiNormHT',interval:60,createdAt:11})});
    const {page,errors}=await open({time:NOW,hash:'exams',scheme,cfg:{latencyComp:true,seed:s}});await wait(600);
    await page.click('[data-hist="bone_dxa"]');await wait(250);
    const t=await page.evaluate(()=>{const s=document.querySelector('#h-bone').closest('section'),w=s.querySelector('.labtable'),bar=s.querySelector('.cat-head .bar');
      const probe=document.createElement('i');probe.style.color='var(--c-bone)';document.body.appendChild(probe);const want=getComputedStyle(probe).color;probe.remove();
      return{cols:[...w.querySelectorAll('thead th')].map(th=>th.textContent.trim()),rows:w.querySelectorAll('tbody tr').length,sw:w.scrollWidth,cw:w.clientWidth,ox:getComputedStyle(w).overflowX,
        token:getComputedStyle(document.documentElement).getPropertyValue('--c-bone').trim(),bar:getComputedStyle(bar).backgroundColor,want,cellRight:Math.round(w.querySelector('tbody tr td:last-child').getBoundingClientRect().right),boxRight:Math.round(w.getBoundingClientRect().right)}});
    check(`${scheme}：歷次表格有日期與 11 個欄位、兩列`,t.cols.length===12&&t.cols[0]==='日期'&&t.cols[1].startsWith('L1–L4 BMD')&&t.cols[1].includes('g/cm²')&&t.rows===2,t.cols);
    check(`${scheme}：歷次表格在自己的容器內水平捲動（overflow-x auto、內容比容器寬）`,t.ox==='auto'&&t.sw>t.cw+50&&t.cellRight>t.boxRight,{sw:t.sw,cw:t.cw});
    check(`${scheme}：頁面沒有水平捲動（最長的分類標籤也不會撐寬）`,(await overflow(page))<=0,await overflow(page));
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
    if(!NOSHOTS){await page.evaluate(()=>{document.querySelector('#presetField').scrollIntoView({block:'start'})});await wait(150);await page.screenshot({path:path.join(SHOTS,`380-${scheme}-bone-form.png`)})}
    check(`${scheme}：沒有 JS 錯誤`,!errors.length,errors);
    await page.context().close()}

  /* ---- 今天頁的到期卡、「接下來」清單（有到期日的） ---- */
  {const s={...noRecs(seed()),'records/b2':bone('2025-11-25')}; // POI 骨密度低，12 個月：2026/11/25 到期，26 天後
    const {page,errors}=await open({time:NOW,cfg:{latencyComp:true,seed:s}});await wait(600);
    const c=await page.evaluate(()=>{const e=document.querySelector('#examCard');return e?{t:e.textContent,dot:getComputedStyle(e.querySelector('.dot')).backgroundColor}:null});
    check('今天頁：60 天內到期的卡片顯示「骨密度 DXA・26 天後到期」，圓點是骨骼的顏色',c&&c.t.includes('骨密度 DXA')&&c.t.includes('26 天後到期')&&c.dot==='rgb(134, 101, 82)',c);
    await page.click('#examCard');await wait(300);
    const n=await page.evaluate(()=>({vis:!document.querySelector('#p-exams').hidden,li:[...document.querySelectorAll('#nextList li')].map(li=>li.textContent.replace(/\s+/g,' ').trim())}));
    check('點卡片到定期檢查頁；「接下來要做的檢查」第一項是骨密度 DXA 2026/11/25、26 天後到期',n.vis&&n.li.length===1&&n.li[0].includes('骨密度 DXA')&&n.li[0].includes('2026/11/25')&&n.li[0].includes('26 天後到期'),n);
    check('今天頁到期卡：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}
  {const s={...noRecs(seed()),'records/b0':{exam:'bone_dxa',date:'2024-11-20',preset:null,interval:null,nextDue:null,labs:{},createdAt:1}}; // 匯入的資料：沒有間隔、沒有日期、沒有 cat
    const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:s}});await wait(600);
    check('今天頁：沒有間隔的骨密度是待安排，不會套 12 個月變成「已逾期」，也不會消失',(await txt(page,'#examCard')||'').replace(/\s+/g,'')==='骨密度DXA待安排›',await txt(page,'#examCard'));
    await page.context().close()}

  /* ---- 回診摘要（有到期日的） ---- */
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

  /* ---- 匯出、匯入：新備份往返、舊備份 ---- */
  {let exported;const mine={'records/b2':bone('2025-11-25',{labs:allLabs(1)}),'records/b3':bone('2026-03-01',{preset:'none',interval:0,labs:{'L1–L4 T':'-1.1','左前臂 BMD':'0.5'},createdAt:12}),'records/b4':{exam:'bone_dxa',date:'2026-04-01',preset:'tlow',interval:0,nextDue:'2027-04-01',labs:{},createdAt:13}};
    {const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed(mine)}});await wait(700);
      await tap(page,'#btnExport');await until(page,()=>!!window.__lastDownload);
      exported=JSON.parse(await page.evaluate(()=>window.__lastDownload.data));
      check('匯出：備份裡有三筆骨密度，內容和資料庫相同（待安排、指定日期、沒有 cat、表單沒有的 labs key 都在）',['b2','b3','b4'].every(id=>JSON.stringify(exported.collections.records[id])===JSON.stringify(mine['records/'+id])),exported.collections.records.b3);
      await page.context().close()}
    {const {page,errors}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed()}});await wait(700);
      await page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await wait(300);
      const pv=await txt(page,'#impPreview');await tap(page,'#impGo');await tap(page,'#impGo');
      await until(page,()=>!document.querySelector('#impActions')||document.querySelector('#impActions').hidden,8000);
      const back=await Promise.all(['b2','b3','b4'].map(id=>stored(page,id)));
      check('匯入新備份：預覽算進定期檢查筆數，三筆骨密度和匯出時一字不差',/定期檢查 6 筆/.test(pv)&&['b2','b3','b4'].every((id,i)=>JSON.stringify(back[i])===JSON.stringify(mine['records/'+id])),{pv,back});
      await page.evaluate(()=>{location.hash='exams'});await wait(400);const c=await boneCard(page);
      check('匯入後：最新一筆（指定日期 2027/04/01）顯示在卡片上',c.facts.includes('下次2027/04/01')&&c.facts.includes('醫師指定日期'),c.facts);
      check('匯入新備份：沒有 JS 錯誤',!errors.length,errors);
      await page.context().close()}
    /* 舊備份（沒有 meddose、沒有骨密度）：照舊匯入，現有的骨密度紀錄不受影響 */
    {const base=sampleSeed(T),old={app:'jialin-health',version:1,exportedAt:'2026-06-01T00:00:00.000Z',collections:{days:{'2026-05-30':{date:'2026-05-30',am:{w:52.3,at:'07:10'},updatedAt:1}},exercise:{},
        records:{r1:base['records/r1'],r2:{...base['records/r2'],note:'舊備份'}},settings:{profile:base['settings/profile']}}};
      const {page,errors}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed(mine)}});await wait(700);
      await page.setInputFiles('#impFile',{name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await wait(300);
      const pv=await txt(page,'#impPreview');await tap(page,'#impGo');await tap(page,'#impGo');
      await until(page,()=>document.querySelector('#impActions').hidden,8000);
      const r2=await stored(page,'r2'),d=await page.evaluate(()=>__mock.store.get('days/2026-05-30')),back=await Promise.all(['b2','b3','b4'].map(id=>stored(page,id)));
      check('匯入舊備份：預覽照舊（定期檢查 2 筆）、舊紀錄寫入',/定期檢查 2 筆/.test(pv)&&r2?.note==='舊備份'&&d?.am?.w===52.3,{pv,r2,d});
      check('匯入舊備份：現有的三筆骨密度原封不動',['b2','b3','b4'].every((id,i)=>JSON.stringify(back[i])===JSON.stringify(mine['records/'+id])),back);
      check('匯入舊備份：沒有 JS 錯誤',!errors.length,errors);
      await page.context().close()}}

  /* ---- 從截圖填入：檢查項目選得到骨密度（不自動對應欄位、不自動選分類） ---- */
  {const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:seed(),sample:{shot:'single'}}});await wait(600);
    await page.click('#btnAdd');await wait(150);
    const [fc]=await Promise.all([page.waitForEvent('filechooser',{timeout:3000}),page.click('#shotBox label')]);await fc.setFiles(await shotFile(page));
    await until(page,()=>!document.querySelector('#shotBar').hidden);
    const grp=await page.evaluate(()=>{const o=document.querySelector('#fExam option[value="bone_dxa"]');return o?{label:o.textContent,group:o.parentElement.label}:null});
    check('從截圖填入：檢查項目的選單有「骨骼 › 骨密度 DXA」',grp&&grp.label==='骨密度 DXA'&&grp.group==='骨骼',grp);
    await page.selectOption('#fExam','bone_dxa');await wait(150);
    const st=await page.evaluate(()=>({labs:[...document.querySelectorAll('[data-lab]')].map(i=>[i.dataset.lab,i.value]),note:document.querySelector('#shotExamNote').hidden?null:document.querySelector('#shotExamNote').textContent,preset:document.querySelector('#fPreset').value,interval:document.querySelector('#fInterval').value}));
    check('從截圖填入：換成骨密度後是骨密度的 11 個欄位，全部空白；分類沒有被自動選，間隔是 0',JSON.stringify(st.labs.map(l=>l[0]))===JSON.stringify(LABS)&&st.labs.every(l=>l[1]==='')&&st.preset===''&&st.interval==='0',st);
    check('從截圖填入：截圖讀到的其他檢驗會放進報告內容',st.note&&st.note.includes('TSH')&&st.note.includes('會放進報告內容'),st.note);
    await page.selectOption('#fPreset','poiNormHT');await page.fill('[data-lab="L1–L4 BMD"]','0.955');await page.click('#btnSave');await wait(500);
    const rs=await boneRecs(page);
    check('從截圖填入：存成骨密度紀錄（自己選的分類、間隔、手填的數值、截圖的日期與醫院）',rs.length===1&&rs[0].preset==='poiNormHT'&&rs[0].interval===60&&rs[0].labs['L1–L4 BMD']==='0.955'&&rs[0].date==='2026-10-20'&&rs[0].place==='測試醫院'&&!!rs[0].shot&&rs[0].report.includes('TSH'),rs);
    check('從截圖填入：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
