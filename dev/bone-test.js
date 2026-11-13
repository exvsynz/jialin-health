/* 骨密度 DXA（bone_dxa）、檢查表單與設定頁的間隔驗證。全部是合成資料。
   - 九個分類（分類和間隔分開）：只有 POI 確診的兩個帶入間隔；其他六個與未分類不帶間隔，是「還沒有追蹤計畫」；nofollow 是手選的不追蹤。
     分類不從 T／Z 數值自動選，也不從 T 推 Z
   - 兩種待安排（2026-11-13 複查 R-01、R-07）：間隔 0 是「依報告盡快處理」，算逾期、排最前；沒有間隔的骨密度是「還沒有追蹤計畫」，
     不算逾期、排在有日期的項目之後，但在定期檢查頁、「接下來」、今天頁、回診摘要都列得出來（排程的部分在 remind-ref-test）
   - 間隔只收 0–120 的整數月，設定頁的固定間隔只收 1–120（R-02）；無效值顯示在欄位上、不寫入；已存的無效值讀出來不算出 NaN 日期
   - 表單：長標籤寫在選單下方（R-03）、說明文字（R-04）、改分類不洗掉醫師指定的間隔（R-05）、必填的錯誤不因離開欄位而消失（R-08）、
     選單沒有的分類代號原樣存回（R-09）、指定日期不能早於檢查日與無效的已存日期（R-10）
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
/* 代號、標籤、帶入的間隔（null = 不帶間隔）、依據。最後一個是不追蹤 */
const PRESETS=[
  ['none','未分類：報告未提供 Z 值（T 值僅記錄）',null,'ISCD 2023：停經前優先用 Z；現有資料不足以依 Z 分類。請補 Z 值報告或依醫師評估指定追蹤日期。'],
  ['zlow','停經前 Z ≤ −2.0（低於同齡預期）',null,Z_SRC],
  ['zok','停經前 Z > −2.0（在同齡預期範圍內）',null,Z_SRC],
  ['poiLow','POI 確診，骨密度低（Z ≤ −2.0）或骨質疏鬆',12,'ESHRE 2024 POI 建議 69：依個人風險每 1–3 年，本工具取下限 12 個月。'],
  ['poiNormHT','POI 確診，骨密度正常，且持續足量全身性荷爾蒙治療',60,'ESHRE 2024 POI 建議 68：5 年內重測價值低。60 個月是本工具換算的提醒日期，不是指引規定的重測時間。'],
  ['tnorm','停經後 T ≥ −1.0（WHO 正常）',null,T_SRC],
  ['tlow','停經後 −2.5 < T < −1.0（WHO 低骨量）',null,T_SRC],
  ['top','停經後 T ≤ −2.5，或醫師判定骨質疏鬆',null,T_SRC],
  ['nofollow','醫師表示目前不需例行追蹤',null,'依醫師判斷；ISCD 2023 未規定停經前或非 POI 的固定重測間隔。']];
const NOFOLLOW='nofollow';
/* 預覽與說明的文字 */
const UNPL='還沒有追蹤計畫：醫師指定後再填間隔或日期',ASAP='待安排（依報告盡快處理）：不排日期，一直列在最前面',NOFOLLOW_PV='不排例行追蹤；醫師有安排時，先改選別的分類再填間隔或日期',THY_NOFOLLOW_PV='不排例行追蹤；醫師有安排再填間隔或日期';
const NODEF='這個檢查沒有固定間隔，依分類或醫囑';
const STOP_ERR='這個分類不追蹤；要安排追蹤，請先改選別的分類';
const IV_ERR='間隔請填 0–120 的整數（月）；0 是盡快處理',IV_NEED='請填追蹤間隔或指定日期',FIXED_ERR='請填 1–120 的整數（月）；留空用預設值',DUE_EARLY='指定日期不能早於檢查日期';
const hintOf=p=>p[1]+'\n'+p[3]; // 骨密度：選單下方先寫完整標籤，再寫依據
const pvOf=p=>p[0]===NOFOLLOW?NOFOLLOW_PV:({poiLow:'下次檢查：2027/10/01（1 年後）',poiNormHT:'下次檢查：2031/10/01（5 年後）'}[p[0]]||UNPL);
/* 把標籤上寫的不等式讀成判斷式，用邊界值檢查各分類互不重疊。sym 是 'T' 或 'Z' */
function rule(label,sym){const s=label.replace(/−/g,'-'),n='(-?\\d+(?:\\.\\d+)?)';
  let m=s.match(new RegExp(n+' < '+sym+' < '+n));if(m)return x=>x>+m[1]&&x<+m[2];
  m=s.match(new RegExp(sym+' (≤|≥|<|>) '+n));if(!m)return null;const a=+m[2];return{'≤':x=>x<=a,'≥':x=>x>=a,'<':x=>x<a,'>':x=>x>a}[m[1]]}
const allLabs=k=>Object.fromEntries(LABS.map((n,i)=>[n,/BMD$/.test(n)?(0.9-i*0.01-k*0.02).toFixed(3):(-1.2-i*0.1-k*0.1).toFixed(1)]));
const bone=(date,o={})=>({exam:'bone_dxa',cat:'bone',date,preset:'poiLow',interval:12,nextDue:null,report:'',place:'測試醫院',doctor:'',note:'',labs:{},createdAt:10,updatedAt:10,...o});
const R=(exam,cat,date,o={})=>({exam,cat,date,preset:null,interval:12,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{},createdAt:1,updatedAt:1,...o});
const seed=(extra={})=>({...sampleSeed(T),...extra});
const noRecs=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!k.startsWith('records/')));
const boneRecs=page=>page.evaluate(()=>[...__mock.store.entries()].filter(([k,v])=>k.startsWith('records/')&&v.exam==='bone_dxa').map(([k,v])=>({id:k.slice(8),...v})).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.createdAt||0)-(b.createdAt||0)));
const writes=page=>page.evaluate(()=>__mock.writes.length);
const stored=(page,id)=>page.evaluate(id=>{const v=__mock.store.get('records/'+id);return v===undefined?null:JSON.parse(JSON.stringify(v))},id);
const txt=(page,s)=>page.evaluate(s=>{const e=document.querySelector(s);return e?e.textContent:null},s);
const flat=s=>(s||'').replace(/\s+/g,'');
const formState=page=>page.evaluate(()=>{const q=s=>document.querySelector(s),er=id=>q(id).hidden?null:q(id).textContent;return{exam:q('#fExam').value,preset:q('#fPreset').value,interval:q('#fInterval').value,due:q('#fDue').value,
  hint:q('#presetHint').textContent,preview:q('#duePreview').textContent,open:q('#dlgRec').open,ivErr:er('#fIntervalErr'),dueErr:er('#fDueErr'),dueNote:er('#dueNote'),ivInvalid:q('#fInterval').getAttribute('aria-invalid'),dueInvalid:q('#fDue').getAttribute('aria-invalid'),focus:document.activeElement?.id||null,
  z:q('[data-lab="L1–L4 Z"]')?.value??null}});
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
/* 骨密度卡片上看得到的狀態；next 是「接下來要做的檢查」每一列的文字，nextPills 是每一列標籤的樣式 */
const boneCard=page=>page.evaluate(()=>{const s=document.querySelector('#h-bone').closest('section');return{pill:s.querySelector('.pill')?.textContent,pillCls:s.querySelector('.pill')?.className||'',chip:s.querySelector('.exam-side .chip')?.textContent||null,facts:s.querySelector('.facts').textContent,sub:s.querySelector('.exam-sub').textContent,
  next:[...document.querySelectorAll('#nextList li')].map(li=>li.textContent.replace(/\s+/g,' ').trim()),nextPills:[...document.querySelectorAll('#nextList li .pill')].map(p=>p.className),tally:document.querySelector('#tally').textContent,all:document.querySelector('#p-exams').textContent}});
const typeInterval=async(page,v)=>{await page.fill('#fInterval','');await page.click('#fInterval');await page.keyboard.type(v);await wait(60)};
const clearDue=page=>page.evaluate(()=>{const d=document.querySelector('#fDue');d.value='';d.dispatchEvent(new Event('input',{bubbles:true}))});
const go=async(page,hash,ms=350)=>{await page.evaluate(h=>{location.hash=h},hash);await wait(ms)};
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
    check('原始碼：nofollow 這個代號只出現在分類的定義，沒有任何程式會自動選它',html.split("'nofollow'").length===2&&html.includes("{k:'nofollow',label:'醫師表示目前不需例行追蹤',m:null,noFollow:true,"),html.split("'nofollow'").length-1);
    check('原始碼：設定 #presetHint 文字的地方只有共用的 setPresetHint',(html.match(/\$\('#presetHint'\)\.textContent\s*=/g)||[]).length===1&&html.includes('function setPresetHint('),(html.match(/\$\('#presetHint'\)\.textContent\s*=/g)||[]).length);
    const doc=fs.readFileSync(path.join(ROOT,'docs/exam-intervals.md'),'utf8');
    check('docs/exam-intervals.md：骨密度段落有出處、短說明、九個分類與兩種待安排的說明，沒有「待使用者確認」',['doi:10.1093/hropen/hoae065','ISCD 2023 Adult Official Positions','停經前優先以 Z 值判讀；只有 T 值可先記錄，不自動分類。','同一台機器的 BMD (g/cm²) 變化','還沒有追蹤計畫','依報告盡快處理','`nofollow`',...PRESETS.map(p=>p[1]),PRESETS[8][3]].every(t=>doc.includes(t))&&!doc.includes('待使用者確認'),PRESETS.map(p=>p[1]).filter(t=>!doc.includes(t)));
    check('DEPLOYED.md：記著晚上與週報的提示詞是用哪個 commit 同步的（2026-11-13 已同步，取代原本「還沒同步」的註記）',fs.readFileSync(path.join(ROOT,'ops/scheduled/DEPLOYED.md'),'utf8').includes('晚上與週報的提示詞已用 update_trigger 同步，對應 commit f6e0b09'))}

  /* ---- 九個分類：標籤、間隔、依據；邊界；不自動分類；還沒有追蹤計畫在各頁的樣子 ---- */
  {const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:seed()}});await wait(600);
    const card=await page.evaluate(()=>{const s=document.querySelector('#h-bone')?.closest('section');return s?{h:s.querySelector('h3').textContent,en:s.querySelector('.en').textContent,name:s.querySelector('.exam-name').textContent,sub:s.querySelector('.exam-sub').textContent,pill:s.querySelector('.pill').textContent,facts:s.querySelector('.facts').textContent,last:document.querySelector('#cats').lastElementChild===s}:null});
    check('定期檢查頁：最後一類是「骨骼 Bone」，裡面是「骨密度 DXA」，還沒有紀錄',card&&card.h==='骨骼'&&card.en==='Bone'&&card.name==='骨密度 DXA'&&card.pill==='尚無紀錄'&&card.last,card);
    check('還沒有紀錄的卡片：寫明沒有固定間隔，不顯示 12 個月',card&&card.facts==='固定間隔沒有，依分類或醫囑'&&card.sub.includes('沒有固定間隔')&&!/1 年|12/.test(card.facts+card.sub),card);
    check('已追蹤的分母是 10 項',/\/10 項/.test(await txt(page,'#tally')),await txt(page,'#tally'));
    await page.click('[data-add="bone_dxa"]');await wait(250);
    const opts=await page.evaluate(()=>[...document.querySelectorAll('#fPreset option')].map(o=>[o.value,o.textContent]));
    check('報告分類：（未分類）加九個分類，代號與文字照規格；不追蹤的那一個排最後',JSON.stringify(opts)===JSON.stringify([['','（未分類）'],...PRESETS.map(p=>[p[0],p[1]])])&&opts[opts.length-1][0]===NOFOLLOW,opts);
    const labs=await page.evaluate(()=>[...document.querySelectorAll('#labs .field')].map(f=>{const i=f.querySelector('input'),b=f.getBoundingClientRect();return{n:i.dataset.lab,label:f.querySelector('label').textContent.replace(/\s+/g,' ').trim(),mode:i.getAttribute('inputmode'),left:Math.round(b.left),top:Math.round(b.top)}}));
    check('檢驗欄位：11 個，名稱與順序照規格',JSON.stringify(labs.map(l=>l.n))===JSON.stringify(LABS),labs.map(l=>l.n));
    check('檢驗欄位：BMD 標出 g/cm²，T／Z 沒有單位',labs.every(l=>/BMD$/.test(l.n)?l.label===l.n+' g/cm²':l.label===l.n),labs.map(l=>l.label));
    check('檢驗欄位：BMD 用小數鍵盤；T／Z 可能是負值，不用沒有負號的小數鍵盤',labs.every(l=>/BMD$/.test(l.n)?l.mode==='decimal':l.mode===null),labs.map(l=>l.mode));
    const by=Object.fromEntries(labs.map(l=>[l.n,l]));
    check('檢驗欄位（380 寬）：每個部位的 BMD 從新的一列開始，T 值在同一列',LABS.filter(n=>/BMD$/.test(n)).every(n=>by[n].left===by[LABS[0]].left&&by[n.replace('BMD','T')].top===by[n].top&&by[n.replace('BMD','T')].left>by[n].left),labs);
    let f=await formState(page);
    check('沒選分類：分類是（未分類），不是不追蹤；間隔是空的（不是 0，也不是 12），預覽寫還沒有追蹤計畫',f.preset===''&&f.interval===''&&f.hint===NODEF&&f.preview===UNPL&&f.ivErr===null,f);
    check('間隔欄下方的說明（R-04）：0 是依報告盡快處理、會一直列在最前面，不再寫「不排定期追蹤」',await page.evaluate(()=>{const t=document.querySelector('#fInterval').closest('.field').querySelector('.hint').textContent;return t==='0–120 的整數。0 = 依報告盡快處理，會一直列在最前面'&&!document.querySelector('#recForm').textContent.includes('不排定期追蹤')}));
    await page.fill('#fDate','2026-10-01');
    const got=[];
    for(const [k] of PRESETS){await page.selectOption('#fPreset',k);const s=await formState(page);got.push([k,s.interval,s.hint,s.preview])}
    check('每個分類帶入的間隔：只有 poiLow 是 12、poiNormHT 是 60；其他七個都不帶間隔（空白，不是 0）',JSON.stringify(got.map(g=>[g[0],g[1]]))===JSON.stringify(PRESETS.map(p=>[p[0],p[2]==null?'':String(p[2])])),got.map(g=>[g[0],g[1]]));
    check('每個分類：選單下方先寫完整標籤，換行後是依據（R-03），文字照規格',JSON.stringify(got.map(g=>g[2]))===JSON.stringify(PRESETS.map(hintOf)),got.map(g=>g[2]));
    check('預覽：六個沒有間隔的分類是「還沒有追蹤計畫」，不顯示日期；不追蹤的寫不排例行追蹤；POI 兩個是 2027/10/01 與 2031/10/01',got.every((g,i)=>g[3]===pvOf(PRESETS[i])),got.map(g=>[g[0],g[3]]));
    check('POI 骨密度低：12 個月，依據寫 ESHRE 建議 69 與取下限',got[3][1]==='12'&&got[3][2].endsWith('\nESHRE 2024 POI 建議 69：依個人風險每 1–3 年，本工具取下限 12 個月。'),got[3]);
    check('POI 正常且荷爾蒙治療：60 個月，依據寫明是本工具換算的提醒日期，不是指引規定的重測時間；標籤有「持續足量全身性」',got[4][1]==='60'&&got[4][2].endsWith('\nESHRE 2024 POI 建議 68：5 年內重測價值低。60 個月是本工具換算的提醒日期，不是指引規定的重測時間。')&&PRESETS[4][1].includes('持續足量全身性荷爾蒙治療')&&opts[5][1]===PRESETS[4][1],got[4]);
    check('只有標籤寫「POI 確診」的分類才帶入間隔；停經前、停經後、不追蹤的分類都不會自動帶 12 或 60',opts.slice(1).every(([k,l])=>l.startsWith('POI 確診')===(got.find(g=>g[0]===k)[1]!=='')),got.map(g=>[g[0],g[1]]));
    check('不追蹤的分類（R-01b）：標籤與依據照使用者指定的文字',got[8][0]===NOFOLLOW&&got[8][2]==='醫師表示目前不需例行追蹤\n依醫師判斷；ISCD 2023 未規定停經前或非 POI 的固定重測間隔。',got[8]);
    await page.selectOption('#fPreset','poiNormHT');await page.selectOption('#fPreset','zok');f=await formState(page);
    check('從 POI 的 60 個月改選停經前 Z > −2.0：60 是分類帶入的，清掉，不留給別的分類',f.interval===''&&f.preview===UNPL,f);
    await page.selectOption('#fPreset','poiLow');await page.selectOption('#fPreset','');f=await formState(page);
    check('改回（未分類）：間隔回到空白',f.interval===''&&f.hint===NODEF&&f.preview===UNPL,f);
    /* 邊界：正常包含 −1.0，骨質疏鬆包含 −2.5，Z 的 −2.0 屬於「低於同齡預期」，各分類不重疊 */
    const lab=k=>opts.find(o=>o[0]===k)[1],zr=['zlow','zok'].map(k=>[k,rule(lab(k),'Z')]),tr=['tnorm','tlow','top'].map(k=>[k,rule(lab(k),'T')]);
    const which=(rs,x)=>rs.filter(([,fn])=>fn&&fn(x)).map(r=>r[0]).join('+');
    check('Z 的邊界：−2.0 與更低是 zlow，高於 −2.0 是 zok，每個值只落在一個分類',JSON.stringify([-3,-2.01,-2.0,-1.99,0,1.5].map(x=>which(zr,x)))===JSON.stringify(['zlow','zlow','zlow','zok','zok','zok']),[-3,-2.01,-2.0,-1.99,0,1.5].map(x=>which(zr,x)));
    check('T 的邊界：−1.0 是正常，−2.5 是骨質疏鬆，兩者之間是低骨量，每個值只落在一個分類',JSON.stringify([1,-0.99,-1.0,-1.01,-2.49,-2.5,-2.51,-4].map(x=>which(tr,x)))===JSON.stringify(['tnorm','tnorm','tnorm','tlow','tlow','top','top','top']),[1,-0.99,-1.0,-1.01,-2.49,-2.5,-2.51,-4].map(x=>which(tr,x)));
    check('POI 骨密度低的標籤用 Z ≤ −2.0（和停經前的分類同一條界線）',rule(lab('poiLow'),'Z')(-2.0)&&!rule(lab('poiLow'),'Z')(-1.99));
    /* 只有 T 值：不自動歸入任何分類，也不把 T 推成 Z */
    for(const [k,v] of [['L1–L4 T','-2.6'],['左股骨頸 T','-1.2'],['右全髖 T','−2.8']])await page.fill(`[data-lab="${k}"]`,v);
    f=await formState(page);
    check('只填 T 值：分類仍是（未分類），Z 欄仍是空的，間隔仍是空的',f.preset===''&&f.z===''&&f.interval==='',f);
    await page.fill('[data-lab="L1–L4 Z"]','-2.5');f=await formState(page);
    check('填了 Z −2.5：也不會自動選「停經前 Z ≤ −2.0」，分類要自己選',f.preset===''&&f.interval==='',f);
    await page.fill('[data-lab="L1–L4 Z"]','');
    const w0=await writes(page);await page.click('#btnSave');await wait(400);let rs=await boneRecs(page);
    check('只有 T 值、沒填間隔的紀錄：可以存（R-08），存成未分類、interval null（不是 0），labs 只有填的三個 T，沒有 Z',rs.length===1&&rs[0].preset===null&&rs[0].interval===null&&rs[0].nextDue===null&&rs[0].cat==='bone'&&JSON.stringify(rs[0].labs)===JSON.stringify({'L1–L4 T':'-2.6','左股骨頸 T':'-1.2','右全髖 T':'−2.8'})&&(await writes(page))===w0+1,rs);
    let c=await boneCard(page);
    check('定期檢查頁：還沒有追蹤計畫的骨密度標籤是「待安排」，不是逾期的樣式；下次寫還沒有追蹤計畫，不寫日期、沒有 NaN',c.pill==='待安排'&&/\bnone\b/.test(c.pillCls)&&!/late/.test(c.pillCls)&&c.facts.includes('下次還沒有追蹤計畫')&&!/NaN|下次\d|間隔/.test(c.facts),{pill:c.pill,cls:c.pillCls,facts:c.facts});
    check('「接下來要做的檢查」列出骨密度 DXA 待安排，排在有日期的三項之後；統計不把它算進逾期（逾期 1・60 天內 1・已追蹤 4/10 項）',c.next.length===4&&c.next[0].includes('乳房超音波')&&c.next[3].includes('骨密度 DXA')&&c.next[3].includes('待安排')&&!c.next[3].includes('NaN')&&/\bnone\b/.test(c.nextPills[3])&&c.tally==='逾期 1・60 天內 1・已追蹤 4/10 項',{next:c.next,tally:c.tally});
    /* 今天頁與回診摘要：逾期的乳房超音波在前，骨密度不搶第一項，但仍然算在裡面 */
    await go(page,'today');
    check('今天頁：有逾期的乳房超音波＋還沒有追蹤計畫的骨密度時，到期卡第一項是乳房超音波（R-01），骨密度算在「另有 2 項」',flat(await txt(page,'#examCard'))==='乳房超音波已逾期151天・另有2項›',await txt(page,'#examCard'));
    await go(page,'summary',500);
    check('回診摘要：仍待處理列出「骨密度 DXA 待安排」，排在逾期的乳房超音波之後',/仍待處理：乳房超音波 2026\/06\/01 到期、骨密度 DXA 待安排/.test(await txt(page,'#smPreview')),(await txt(page,'#smPreview')).slice(-160));
    /* 使用者可以改填醫師指定的間隔或日期 */
    await go(page,'exams');
    await page.click(`[data-edit="${rs[0].id}"]`);await wait(250);f=await formState(page);
    check('編輯沒有間隔的骨密度紀錄：間隔欄是空的、預覽寫還沒有追蹤計畫，沒有錯誤（顯示和編輯同一套說法，R-08）',f.interval===''&&f.preview===UNPL&&f.ivErr===null&&f.preset==='',f);
    await page.selectOption('#fPreset','zlow');await typeInterval(page,'24');f=await formState(page);
    check('選了沒有間隔的分類後改填間隔 24：預覽 2028/10/01',f.preview==='下次檢查：2028/10/01（2 年後）'&&f.ivErr===null,f);
    await page.click('#btnSave');await wait(400);rs=await boneRecs(page);c=await boneCard(page);
    check('醫師指定的間隔照存、照算：preset zlow、interval 24，卡片下次 2028/10/01',rs[0].preset==='zlow'&&rs[0].interval===24&&c.facts.includes('下次2028/10/01')&&c.facts.includes('間隔2 年')&&c.chip==='停經前 Z ≤ −2.0（低於同齡預期）',{r:rs[0],facts:c.facts,chip:c.chip});
    /* R-05：改選分類不洗掉醫師指定的間隔 */
    await page.click(`[data-edit="${rs[0].id}"]`);await wait(250);await page.selectOption('#fPreset','zok');f=await formState(page);
    check('R-05 編輯 zlow、醫師指定 24 個月的紀錄，只把分類改成 zok：間隔仍是 24，沒有被清掉',f.interval==='24'&&f.preview==='下次檢查：2028/10/01（2 年後）'&&f.hint===hintOf(PRESETS[2]),f);
    await page.selectOption('#fPreset','');f=await formState(page);
    check('R-05 改回（未分類）：醫師指定的 24 也留著',f.interval==='24'&&f.preview==='下次檢查：2028/10/01（2 年後）',f);
    await page.selectOption('#fPreset','poiLow');const p1=await formState(page);await page.selectOption('#fPreset','tlow');const p2=await formState(page);
    check('R-05 改選 POI 骨密度低：帶入它自己的 12；再改選沒有間隔的分類：12 是分類帶的，清掉',p1.interval==='12'&&p2.interval===''&&p2.preview===UNPL,{poiLow:p1.interval,tlow:p2.interval});
    await typeInterval(page,'36');await page.selectOption('#fPreset',NOFOLLOW);f=await formState(page);
    check('R-05 選「醫師表示目前不需例行追蹤」：一定清空間隔（留著間隔就不是不追蹤）',f.interval===''&&f.preview===NOFOLLOW_PV,f);
    await page.selectOption('#fPreset','zok');await typeInterval(page,'24');await page.click('#btnSave');await wait(400);rs=await boneRecs(page);
    check('R-05 存檔：分類改成 zok，間隔仍是 24',rs[0].preset==='zok'&&rs[0].interval===24&&rs[0].nextDue===null,rs[0]);
    await page.click('[data-add="bone_dxa"]');await wait(250);await page.fill('#fDate','2026-10-10');await page.selectOption('#fPreset','tlow');await page.fill('#fDue','2027-03-01');f=await formState(page);
    check('沒有間隔的分類加上醫師指定日期：預覽是那個日期，間隔仍是空的',f.preview==='下次檢查：2027/03/01（醫師指定）'&&f.interval==='',f);
    await page.click('#btnSave');await wait(400);rs=await boneRecs(page);c=await boneCard(page);
    check('醫師指定日期：存 nextDue（interval null），卡片不再是待安排',rs.length===2&&rs[1].preset==='tlow'&&rs[1].interval===null&&rs[1].nextDue==='2027-03-01'&&c.facts.includes('下次2027/03/01')&&c.facts.includes('醫師指定日期')&&c.pill!=='待安排',{r:rs[1],c:c.facts,pill:c.pill});
    /* GPT 審查（75e0110）第 2 點：使用者打過的值就是使用者的，即使和分類帶入的數字相同；0 也一樣 */
    await page.click('[data-add="bone_dxa"]');await wait(250);await page.selectOption('#fPreset','poiNormHT');await typeInterval(page,'24');await typeInterval(page,'60');await page.selectOption('#fPreset','zok');f=await formState(page);
    check('改分類：分類帶入 60 之後，使用者自己打了 24 再打回 60；改選沒有間隔的分類時 60 留著（打過就是使用者的值）',f.interval==='60'&&f.preview==='下次檢查：2031/10/30（5 年後）',f);
    await typeInterval(page,'0');await page.selectOption('#fPreset','tlow');f=await formState(page);
    check('改分類：使用者填的 0（依報告盡快處理）在改選沒有間隔的分類時也留著，不會悄悄變成還沒有追蹤計畫',f.interval==='0'&&f.preview===ASAP,f);
    await page.selectOption('#fPreset','poiLow');f=await formState(page);
    check('改分類：改選有自己間隔的分類時，照舊換成它的 12',f.interval==='12',f);
    await page.click('#dlgRec [data-close]');await wait(150);
    const ref=await page.evaluate(()=>{document.querySelector('details.refbox').open=true;return{rows:[...document.querySelectorAll('#refTable tbody tr')].filter(tr=>tr.cells[0].textContent==='骨密度 DXA').map(tr=>[...tr.cells].map(c=>c.textContent)),other:[...document.querySelectorAll('#refTable tbody tr')].filter(tr=>tr.cells[0].textContent!=='骨密度 DXA').map(tr=>tr.cells[2].textContent),bone:document.querySelector('#boneRef').textContent}});
    check('追蹤間隔的依據：表格有九列骨密度；預設欄是「沒有」（六個）、1 年、5 年、不排，不寫成 0 的待安排',JSON.stringify(ref.rows.map(x=>[x[1],x[2],x[3]]))===JSON.stringify(PRESETS.map(p=>[p[1],p[0]===NOFOLLOW?'不排':{12:'1 年',60:'5 年'}[p[2]]||'沒有',p[3]])),ref.rows);
    check('追蹤間隔的依據：其他檢查的預設欄照舊（間隔 0 的八個分類仍寫待安排、甲狀腺兩個不排，沒有一列變成「沒有」）',ref.other.filter(t=>t==='待安排').length===8&&ref.other.filter(t=>t==='不排').length===2&&!ref.other.includes('沒有'),ref.other);
    check('追蹤間隔的依據：短說明照審查 4.1 的文字，寫明出處、60 個月是工具換算、同一台機器的 BMD；不再寫「不用 T 值」',['停經前優先以 Z 值判讀；只有 T 值可先記錄，不自動分類。停經後採 T／WHO；更年期過渡期是否採用由醫師判定。分類與追蹤間隔各有適用條件。','ESHRE 2024 POI guideline','doi:10.1093/hropen/hoae065','ISCD 2023 Adult Official Positions','只有 POI 確診的兩個分類帶入間隔','60 個月是本工具換算的提醒日期，不是指引規定的重測時間','看同一台機器的 BMD（g/cm²）變化'].every(t=>ref.bone.includes(t))&&!ref.bone.includes('不用 T 值'),ref.bone);
    check('追蹤間隔的依據：寫出兩種待安排的差別與不追蹤要自己選',['間隔留空是「還沒有追蹤計畫」，列為待安排、不算逾期','醫師表示目前不需例行追蹤時，要自己選那個分類，之後不列入到期與提醒','間隔填 0 是依報告盡快處理，算逾期、排最前'].every(t=>ref.bone.includes(t)),ref.bone);
    check('設定頁的固定間隔沒有骨密度這一列（它沒有固定間隔）',await page.evaluate(()=>{location.hash='setup';return new Promise(r=>setTimeout(()=>r(!document.querySelector('#iv-bone_dxa')&&!!document.querySelector('#iv-gi_colo')),300))}));
    check('分類流程：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* ---- R-01b：「醫師表示目前不需例行追蹤」只能手選；選了以後不列入到期與提醒 ---- */
  {const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:seed()}});await wait(600);
    check('截圖讀到的分類只在不是不追蹤的分類時才會填入：骨密度的 nofollow、甲狀腺超音波的 none 都不會；一般分類照舊',await page.evaluate(()=>!shotMayPick('bone_dxa','nofollow')&&!shotMayPick('thy_us','none')&&!shotMayPick('thy_us','vlowSmall')&&shotMayPick('bone_dxa','poiLow')&&shotMayPick('thy_us','lowint')&&shotMayPick('breast_us','b3')&&!shotMayPick('gi_egd','x')));
    const seen=[];
    await page.click('[data-add="bone_dxa"]');await wait(250);seen.push((await formState(page)).preset);
    await page.selectOption('#fExam','thy_us');await page.selectOption('#fExam','bone_dxa');seen.push((await formState(page)).preset);
    await page.fill('[data-lab="L1–L4 Z"]','0.3');await page.fill('#fReport','醫師表示目前不需例行追蹤');seen.push((await formState(page)).preset);
    check('新增骨密度：打開、換過檢查項目再換回來、填了數值與報告文字之後，分類都還是（未分類），不會自己變成不追蹤',seen.every(v=>v===''),seen);
    await page.fill('#fDate','2026-10-02');await page.fill('#fDue','2027-05-01');await typeInterval(page,'24');const before=await formState(page);
    await page.selectOption('#fPreset',NOFOLLOW);let f=await formState(page);
    check('手選「醫師表示目前不需例行追蹤」：先前填的間隔 24 與指定日期 2027-05-01 都清空（留著任何一個就仍會列入到期），預覽寫不排例行追蹤、沒有錯誤',before.due==='2027-05-01'&&before.interval==='24'&&f.preset===NOFOLLOW&&f.interval===''&&f.due===''&&f.preview===NOFOLLOW_PV&&f.ivErr===null&&f.dueErr===null&&f.hint===hintOf(PRESETS[8]),{before:[before.interval,before.due],f});
    /* GPT 第三輪：選了不追蹤以後，不能再和間隔或指定日期一起存 */
    const w0=await writes(page);
    await typeInterval(page,'12');let g=await formState(page);await page.click('#btnSave');await wait(250);let g2=await formState(page);
    check('選了不追蹤再填間隔 12：欄位上顯示錯誤、預覽不算日期；按儲存不寫入，焦點在間隔欄',g.ivErr===STOP_ERR&&g.ivInvalid==='true'&&g.preview==='先修正上面標出的欄位'&&g2.open&&g2.focus==='fInterval'&&(await writes(page))===w0,{g,g2});
    await typeInterval(page,'0');g=await formState(page);
    check('選了不追蹤再填間隔 0：同樣擋下',g.ivErr===STOP_ERR,g);
    await page.fill('#fInterval','');await page.fill('#fDue','2027-05-01');await wait(80);g=await formState(page);await page.click('#btnSave');await wait(250);g2=await formState(page);
    check('選了不追蹤再填指定日期：日期欄顯示錯誤，按儲存不寫入，焦點在日期欄',g.ivErr===null&&g.dueErr===STOP_ERR&&g.dueInvalid==='true'&&g2.open&&g2.focus==='fDue'&&(await writes(page))===w0,{g,g2});
    await page.selectOption('#fPreset','zok');g=await formState(page);
    check('改選別的分類：錯誤消失，剛填的指定日期留著，可以安排追蹤',g.dueErr===null&&g.due==='2027-05-01'&&g.preview==='下次檢查：2027/05/01（醫師指定）',g);
    await page.selectOption('#fPreset',NOFOLLOW);g=await formState(page);
    check('再選回不追蹤：指定日期又被清空，沒有錯誤',g.due===''&&g.interval===''&&g.dueErr===null&&g.ivErr===null&&g.preview===NOFOLLOW_PV,g);
    await page.click('#btnSave');await wait(400);const rs=await boneRecs(page),c=await boneCard(page);
    check('存檔：preset nofollow、interval null、nextDue null，寫入一次',rs.length===1&&rs[0].preset===NOFOLLOW&&rs[0].interval===null&&rs[0].nextDue===null&&(await writes(page))===w0+1,rs);
    check('紀錄卡片寫「醫師表示目前不需例行追蹤」；標籤是不需例行追蹤，不是待安排也不是逾期；間隔寫不排例行追蹤',c.chip==='醫師表示目前不需例行追蹤'&&c.pill==='不需例行追蹤'&&/\bnone\b/.test(c.pillCls)&&c.facts.includes('下次—')&&c.facts.includes('間隔不排例行追蹤'),{chip:c.chip,pill:c.pill,facts:c.facts});
    check('定期檢查頁：統計不算它逾期或快到期（逾期 1・60 天內 1・已追蹤 4/10 項）；「接下來」排在最後，寫不需例行追蹤',c.tally==='逾期 1・60 天內 1・已追蹤 4/10 項'&&c.next.length===4&&c.next[3].includes('骨密度 DXA')&&c.next[3].includes('不需例行追蹤'),{tally:c.tally,next:c.next});
    await go(page,'today');
    check('今天頁：到期卡不算它（乳房超音波已逾期・另有 1 項），卡片上沒有骨密度',flat(await txt(page,'#examCard'))==='乳房超音波已逾期151天・另有1項›',await txt(page,'#examCard'));
    await go(page,'summary',500);
    check('回診摘要：兩行都沒有骨密度',!/骨密度/.test((await txt(page,'#smPreview')).split('仍待處理')[1]||'x骨密度'),(await txt(page,'#smPreview')).slice(-160));
    await go(page,'exams');await page.click(`[data-edit="${rs[0].id}"]`);await wait(250);f=await formState(page);
    check('編輯這筆紀錄：分類仍是使用者選的不追蹤，只改備註可以存，分類不變',f.preset===NOFOLLOW&&f.interval===''&&f.ivErr===null,f);
    await page.fill('#fNote','回診時醫師說的');await page.click('#btnSave');await wait(400);const r2=await stored(page,rs[0].id);
    check('編輯後：preset 仍是 nofollow、interval 仍是 null',r2.preset===NOFOLLOW&&r2.interval===null&&r2.note==='回診時醫師說的',r2);
    check('不追蹤：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}
  {const s={...noRecs(seed()),'records/n1':bone('2026-10-01',{preset:NOFOLLOW,interval:null})};
    const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:s}});await wait(600);
    check('今天頁：只有一筆不追蹤的骨密度時，沒有到期卡',(await txt(page,'#examCard'))===null&&(await page.evaluate(()=>document.querySelector('#examSlot').innerHTML))==='',await txt(page,'#examCard'));
    await page.context().close()}

  /* ---- R-01、R-07：兩種待安排在今天頁到期卡與「接下來要做的檢查」的順序 ---- */
  {const base=noRecs(seed()),unpl=bone('2026-10-29',{preset:'zok',interval:null}); // 昨天做的骨密度，還沒有追蹤計畫
    const cardOf=async recs=>{const {page}=await open({time:NOW,cfg:{latencyComp:true,seed:{...base,...recs}}});await wait(600);const t=flat(await txt(page,'#examCard'));await page.context().close();return t};
    let t=await cardOf({'records/a':R('breast_us','breast','2025-06-01'),'records/b':unpl});
    check('今天頁：逾期的乳房超音波＋還沒有追蹤計畫的骨密度 → 第一項是乳房超音波，不是骨密度',t==='乳房超音波已逾期151天・另有1項›',t);
    t=await cardOf({'records/a':R('thy_lab','thyroid','2026-05-20',{interval:6}),'records/b':unpl});
    check('今天頁：60 天內到期的甲狀腺抽血＋還沒有追蹤計畫的骨密度 → 第一項是甲狀腺抽血',t==='甲狀腺抽血21天後到期・另有1項›',t);
    t=await cardOf({'records/a':R('breast_us','breast','2025-06-01'),'records/b':unpl,'records/c':R('thy_us','thyroid','2026-10-20',{interval:0})});
    check('今天頁：盡快處理（間隔 0）仍排最前，接著才是逾期的與還沒有追蹤計畫的',t==='甲狀腺超音波待安排・另有2項›',t);
    t=await cardOf({'records/a':R('thy_lab','thyroid','2026-10-01',{interval:6}),'records/b':unpl});
    check('今天頁：其他檢查都超過 60 天時，還沒有追蹤計畫的骨密度仍然列出（沒有被藏起來）',t==='骨密度DXA待安排›',t);
    t=await cardOf({'records/a':R('breast_us','breast','2025-06-01'),'records/b':bone('2026-10-29',{preset:'zok',interval:0})});
    check('今天頁：骨密度的間隔填 0 就是盡快處理，和其他檢查一樣排最前（0 和留空是兩回事）',t==='骨密度DXA待安排・另有1項›',t);
    /* GPT 複核（第二輪）：date 不合法的紀錄不能蓋過合法日期的紀錄；同順位照檢查表的順序，資料順序不影響 */
    t=await cardOf({'records/a':R('breast_us','breast','2025-06-01'),'records/b':R('breast_us','breast','zzzz',{interval:null,createdAt:9})});
    const t2=await cardOf({'records/a':R('breast_us','breast','zzzz',{interval:null,createdAt:9}),'records/b':R('breast_us','breast','2025-06-01')});
    check('今天頁：逾期的乳房超音波不會被另一筆 date 是 zzzz 的紀錄蓋掉（兩種資料順序都一樣）',t==='乳房超音波已逾期151天›'&&t2===t,{t,t2});
    t=await cardOf({'records/a':bone('2025-01-01'),'records/b':bone('zzzz',{preset:NOFOLLOW,interval:null,createdAt:99})});
    check('今天頁：逾期的骨密度不會被 date 是 zzzz 的不追蹤紀錄蓋掉（GPT 的反例）',/^骨密度DXA已逾期\d+天›$/.test(t),t);
    t=await cardOf({'records/a':R('thy_us','thyroid','2026-10-20',{interval:0}),'records/b':R('breast_us','breast','2026-10-21',{interval:0})});
    const t3=await cardOf({'records/a':R('breast_us','breast','2026-10-21',{interval:0}),'records/b':R('thy_us','thyroid','2026-10-20',{interval:0})});
    check('今天頁：兩筆都是盡快處理時照檢查表的順序（乳房超音波先），資料順序反過來也一樣',t==='乳房超音波待安排・另有1項›'&&t3===t,{t,t3});
    /* GPT 第四輪：資料裡自己帶的 id 欄位（匯入的資料）不能取代文件 id。兩筆同一天、createdAt 相同：照文件 id，b（12 個月）才是最新一筆 */
    {const s={...base,'records/a':bone('2025-01-01',{preset:NOFOLLOW,interval:null,createdAt:1,id:'z'}),'records/b':bone('2025-01-01',{createdAt:1,id:'a'})};
      const {page,errors}=await open({time:NOW,cfg:{latencyComp:true,seed:s}});await wait(600);const tc=flat(await txt(page,'#examCard'));
      await go(page,'exams');await page.click('[data-hist="bone_dxa"]');await wait(200);
      const ids=await page.evaluate(()=>[...document.querySelectorAll('#h-bone ~ * [data-edit], #cats [data-edit]')].map(b=>b.dataset.edit).sort());
      await page.click('[data-edit="b"]');await wait(250);await page.fill('#fNote','改 b');await page.click('#btnSave');await wait(400);
      const a=await stored(page,'a'),b=await stored(page,'b');
      check('文件 id 和資料裡的 id 不同時：今天頁照文件 id 選到 12 個月的那筆（骨密度已逾期），不是資料裡 id 較大的不追蹤那筆',/^骨密度DXA已逾期\d+天›$/.test(tc),tc);
      check('編輯按鈕用的是文件 id（a、b），存檔寫回的是 b 這份文件；a 沒有被動到，也沒有多出別的文件',ids.includes('a')&&ids.includes('b')&&!ids.includes('z')&&b.note==='改 b'&&a.note===''&&a.preset===NOFOLLOW&&(await page.evaluate(()=>[...__mock.store.keys()].filter(k=>k.startsWith('records/')).sort().join()))==='records/a,records/b'&&!errors.length,{ids,a,b,errors});
      await page.context().close()}
    /* 接下來要做的檢查 */
    const six={a:R('breast_us','breast','2025-01-01'),b:R('breast_mammo','breast','2024-01-01',{interval:12}),c:R('thy_us','thyroid','2025-02-01'),d:R('thy_lab','thyroid','2025-03-01',{interval:6}),e:R('lung_ldct','lung','2025-04-01'),f:R('gyn_horm','gyn','2025-05-01',{interval:6})};
    const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:{...base,...Object.fromEntries(Object.entries(six).map(([k,v])=>['records/'+k,v])),'records/g':unpl}}});await wait(600);let c=await boneCard(page);
    check('R-07 六項逾期＋昨天做的還沒有追蹤計畫的骨密度：清單有七列，骨密度在最後一列，沒有被擠出去',c.next.length===7&&c.next[6].includes('骨密度 DXA')&&c.next[6].includes('待安排')&&c.next.slice(0,6).every(x=>x.includes('已逾期'))&&/\bnone\b/.test(c.nextPills[6]),c.next);
    check('R-07 統計列寫逾期 6，不把還沒有追蹤計畫的骨密度算進逾期',c.tally==='逾期 6・60 天內 0・已追蹤 7/10 項',c.tally);
    const dues=c.next.slice(0,6).map(x=>(x.match(/\d{4}\/\d\d\/\d\d/)||[''])[0]);
    check('R-07 有日期的六項依到期日先後',JSON.stringify(dues)===JSON.stringify([...dues].sort())&&dues.every(Boolean),dues);
    await page.evaluate(r=>__mock.externalSet('records/h',r),R('gi_egd','gi','2026-10-28',{interval:0}));await wait(300);c=await boneCard(page);
    check('R-07 再加一筆盡快處理的胃鏡（間隔 0）：它排第一、是逾期的樣式；骨密度仍在最後；統計變成逾期 7',c.next[0].includes('胃鏡')&&c.next[0].includes('待安排')&&/late/.test(c.nextPills[0])&&c.next[c.next.length-1].includes('骨密度 DXA')&&/\bnone\b/.test(c.nextPills[c.nextPills.length-1])&&c.tally==='逾期 7・60 天內 0・已追蹤 8/10 項',{next:c.next,tally:c.tally});
    check('順序：沒有 JS 錯誤',!errors.length,errors);
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
      check('間隔打 abc：數字欄位不收字母，欄位是空的；骨密度留空是還沒有追蹤計畫，不是錯誤',f.interval===''&&f.preview===UNPL&&f.ivErr===null,f);
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
      /* R-10：指定日期不能早於檢查日（檢查日是 2026-10-05） */
      await page.fill('#fDue','2026-10-04');await wait(80);f=await formState(page);
      check('R-10 指定日期早於檢查日：欄位上顯示錯誤，預覽不採用這個日期',f.dueErr===DUE_EARLY&&f.dueInvalid==='true'&&f.preview==='先修正上面標出的欄位',f);
      await page.click('#btnSave');await wait(250);f=await formState(page);
      check('R-10 指定日期早於檢查日：按儲存不寫入，焦點在日期欄',f.open&&f.focus==='fDue'&&f.dueErr===DUE_EARLY&&(await writes(page))===w0,f);
      await page.fill('#fDue','2026-10-05');await wait(80);f=await formState(page);
      check('R-10 指定日期和檢查日同一天：不算早於，沒有錯誤',f.dueErr===null&&f.dueInvalid===null&&f.preview==='下次檢查：2026/10/05（醫師指定）',f);
      await page.fill('#fDate','2026-10-06');await wait(80);f=await formState(page);
      check('R-10 把檢查日改到指定日期之後：錯誤跟著出現',f.dueErr===DUE_EARLY,f);
      await page.fill('#fDate','2026-10-05');await clearDue(page);
      await typeInterval(page,'0');f=await formState(page);
      check('間隔 0：沒有錯誤，預覽寫依報告盡快處理、一直列在最前面（R-04），不寫「不排定期追蹤」',f.ivErr===null&&f.ivInvalid===null&&f.dueErr===null&&f.preview===ASAP,f);
      await page.click('#btnSave');await wait(400);const rs=await boneRecs(page),bc=await boneCard(page);
      check('間隔 0：存成 interval 0，只寫入一次；卡片的待安排是逾期的樣式，和還沒有追蹤計畫看得出差別',rs.length===1&&rs[0].interval===0&&rs[0].nextDue===null&&rs[0].preset==='zok'&&(await writes(page))===w0+1&&bc.pill==='待安排'&&/late/.test(bc.pillCls)&&bc.facts.includes('下次待安排')&&!bc.facts.includes('還沒有追蹤計畫')&&bc.tally.startsWith('逾期 2・'),{rs,bc:{pill:bc.pill,cls:bc.pillCls,facts:bc.facts,tally:bc.tally}});
      /* 其他檢查用的是同一張表單 */
      await page.click('[data-add="gi_colo"]');await wait(250);await page.fill('#fDate','2026-10-06');const w1=await writes(page);
      await typeInterval(page,'121');await page.click('#btnSave');await wait(250);f=await formState(page);
      check('大腸鏡：間隔 121 一樣擋下，不寫入',f.open&&f.ivErr===IV_ERR&&(await writes(page))===w1,f);
      await typeInterval(page,'120');await page.click('#btnSave');await wait(400);
      check('大腸鏡：間隔 120 可以存',(await writes(page))===w1+1&&await page.evaluate(()=>[...__mock.store.values()].some(v=>v.exam==='gi_colo'&&v.interval===120&&v.date==='2026-10-06')));
      /* R-08：有固定間隔的檢查，間隔與指定日期都沒填才是錯誤；這個錯誤要留到欄位有值為止 */
      await page.click('[data-add="gi_egd"]');await wait(250);await page.fill('#fDate','2026-10-07');const w2=await writes(page);f=await formState(page);
      check('胃鏡（有固定間隔）：打開就帶入 24，沒有分類選單的說明',f.interval==='24'&&f.ivErr===null&&f.preview==='下次檢查：2028/10/07（2 年後）',f);
      await page.fill('#fInterval','');await wait(80);f=await formState(page);
      check('胃鏡清空間隔：預覽要求填間隔（只有沒有固定間隔的骨密度可以留空）',f.preview==='請填追蹤間隔'&&f.ivErr===null,f);
      await page.click('#btnSave');await wait(250);f=await formState(page);
      check('間隔是空的、也沒有指定日期：欄位上顯示要填、不寫入',f.open&&f.ivErr===IV_NEED&&f.ivInvalid==='true'&&f.focus==='fInterval'&&(await txt(page,'#toastText'))===IV_NEED&&(await writes(page))===w2,f);
      await page.click('#fNote');await wait(120);f=await formState(page);
      check('R-08 點到別的欄位：必填的錯誤與 aria-invalid 都還在（表單仍然不能存，錯誤不能先消失）',f.ivErr===IV_NEED&&f.ivInvalid==='true'&&f.focus==='fNote',f);
      await page.click('#btnSave');await wait(250);
      check('R-08 再按儲存：仍然不寫入',(await writes(page))===w2&&(await formState(page)).open);
      await typeInterval(page,'1');f=await formState(page);
      check('R-08 欄位有值之後錯誤才消失',f.ivErr===null&&f.ivInvalid===null&&f.preview==='下次檢查：2026/11/07（1 個月後）',f);
      await page.fill('#fInterval','');await wait(80);f=await formState(page);
      check('R-08 之後再清空：還沒按儲存，不先標錯',f.ivErr===null&&f.preview==='請填追蹤間隔',f);
      await page.click('#btnSave');await wait(250);await page.fill('#fDue','2027-01-07');await wait(80);f=await formState(page);
      check('R-08 改填指定日期：必填的錯誤消失',f.ivErr===null&&f.ivInvalid===null&&f.preview==='下次檢查：2027/01/07（醫師指定）',f);
      await page.click('#btnSave');await wait(400);
      check('胃鏡只有指定日期：可以存（interval null、nextDue 2027-01-07）',(await writes(page))===w2+1&&await page.evaluate(()=>[...__mock.store.values()].some(v=>v.exam==='gi_egd'&&v.interval===null&&v.nextDue==='2027-01-07')));
      await page.click('[data-add="thy_us"]');await wait(250);await page.fill('#fInterval','');await page.click('#btnSave');await wait(250);const need=(await formState(page)).ivErr;
      await page.selectOption('#fPreset','none');f=await formState(page);
      check('R-08 選了不追蹤的分類：必填的錯誤消失。甲狀腺超音波「無結節」照舊：間隔空白、不排例行追蹤、說明只有依據（不重複標籤）',need===IV_NEED&&f.interval===''&&f.ivErr===null&&f.ivInvalid===null&&f.preview===THY_NOFOLLOW_PV&&f.hint==='ATA 2015 未建議例行追蹤；醫師有安排再填間隔或日期',{need,f});
      await page.selectOption('#fPreset','lowint');f=await formState(page);
      check('其他檢查的分類說明照舊：只有依據，不多一行標籤（R-03 只用在骨密度）；改選分類照舊帶入它的間隔',f.hint==='ATA 2015：12–24 個月，取下限'&&f.interval==='12',f);
      await typeInterval(page,'18');await page.selectOption('#fPreset','high');f=await formState(page);
      check('其他檢查照舊：分類有自己的間隔時，改選分類就換成它的（高度懷疑 6 個月）',f.interval==='6',f);
      await page.fill('#fDue','2027-02-01');await page.selectOption('#fPreset','none');f=await formState(page);
      check('其他檢查照舊：甲狀腺超音波選「無結節」只清間隔，已填的醫師指定日期留著（只有骨密度的「醫師表示不需追蹤」會清日期）',f.interval===''&&f.due==='2027-02-01'&&f.preview==='下次檢查：2027/02/01（醫師指定）',f);
      await typeInterval(page,'18');f=await formState(page);
      check('其他檢查照舊：甲狀腺超音波「無結節」之後仍可填間隔或日期，不算錯誤（擋下的只有骨密度的不追蹤）',f.ivErr===null&&f.dueErr===null,f);
      await page.fill('#fInterval','');
      await clearDue(page);
      await page.fill('#fDate','');await page.click('#btnSave');await wait(250);const t1=await txt(page,'#toastText');
      await page.evaluate(()=>{const d=document.querySelector('#fDate');d.value='275760-01-01';d.dispatchEvent(new Event('input',{bubbles:true}))});await wait(80);f=await formState(page);await page.click('#btnSave');await wait(250);const t2=await txt(page,'#toastText');
      check('檢查日期（R-04）：沒填時提示請填檢查日期；填了不合法的日期時，提示和預覽是同一句',t1==='請填檢查日期'&&f.preview==='檢查日期不是有效的日期'&&t2==='檢查日期不是有效的日期',{t1,pv:f.preview,t2});
      await page.click('#dlgRec [data-close]');await wait(150);
      /* 表單狀態不殘留（兩份審查都要求）：必填錯誤留在上一張表單，關掉後開另一張新表單 */
      await page.click('[data-add="gi_egd"]');await wait(250);await page.fill('#fInterval','');await page.click('#btnSave');await wait(250);const e1=(await formState(page)).ivErr;await page.click('#dlgRec [data-close]');await wait(150);
      await page.click('[data-add="gi_colo"]');await wait(250);f=await formState(page);
      check('表單狀態不殘留：上一張表單留著必填錯誤就關掉，再開另一張新表單時沒有錯誤，間隔是那個檢查自己的 120',e1===IV_NEED&&f.ivErr===null&&f.ivInvalid===null&&f.interval==='120'&&f.preview.startsWith('下次檢查：'),{e1,f});
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

  /* ---- R-03：360、380、412 寬，選了最長的分類後，表單上看得到完整的標籤 ---- */
  for(const width of [360,380,412]){
    const {page,errors}=await open({time:NOW,hash:'exams',width,cfg:{latencyComp:true,seed:seed()}});await wait(600);
    await page.click('[data-add="bone_dxa"]');await wait(250);await page.selectOption('#fPreset','poiNormHT');await wait(120);
    const v=await page.evaluate(()=>{const h=document.querySelector('#presetHint'),sel=document.querySelector('#fPreset'),bodyEl=document.querySelector('#recForm .dlg-body'),i=h.textContent.indexOf('荷爾蒙治療');
      if(i<0||h.childNodes.length!==1)return{found:false,text:h.textContent};
      h.scrollIntoView({block:'center'});
      const r=document.createRange();r.setStart(h.firstChild,i);r.setEnd(h.firstChild,i+5);const rects=[...r.getClientRects()],body=bodyEl.getBoundingClientRect();
      const inside=rects.length>0&&rects.every(b=>b.width>0&&b.height>0&&b.left>=body.left-0.5&&b.right<=body.right+0.5&&b.top>=body.top-0.5&&b.bottom<=body.bottom+0.5&&b.right<=innerWidth);
      const hit=rects.map(b=>document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)).every(e=>e===h);
      const cs=getComputedStyle(sel),ctx=document.createElement('canvas').getContext('2d');ctx.font=`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return{found:true,inside,hit,lines:h.textContent.split('\n'),ws:getComputedStyle(h).whiteSpace,labelW:Math.round(ctx.measureText(sel.selectedOptions[0].textContent).width),selInner:Math.round(sel.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)),
        ox:document.documentElement.scrollWidth-document.documentElement.clientWidth,bodyOx:bodyEl.scrollWidth-bodyEl.clientWidth}});
    check(`${width} 寬：選了 poiNormHT，表單上看得到「荷爾蒙治療」這幾個字（在對話框裡、沒有被裁掉或蓋住）`,v.found&&v.inside&&v.hit,v);
    check(`${width} 寬：選單下方第一行是完整的標籤，第二行是依據`,v.found&&v.lines.length===2&&v.lines[0]===PRESETS[4][1]&&v.lines[1]===PRESETS[4][3]&&v.ws==='pre-line',v.lines);
    check(`${width} 寬：收合的選單確實放不下這個標籤（標籤 ${v.labelW}px、選單內容區 ${v.selInner}px），所以要寫在下方；頁面與對話框沒有水平捲動`,v.labelW>v.selInner&&v.ox<=0&&v.bodyOx<=0,v);
    const d=await page.evaluate(`(${scan.toString()})()`);
    check(`${width} 寬：選了最長分類的骨密度表單，觸控目標 ≥44、文字對比足夠`,!d.small.length&&!d.low.length,{small:d.small.slice(0,6),low:d.low.slice(0,6)});
    if(!NOSHOTS&&width===360){fs.mkdirSync(SHOTS,{recursive:true});await page.evaluate(()=>document.querySelector('#presetField').scrollIntoView({block:'start'}));await wait(150);await page.screenshot({path:path.join(SHOTS,'360-light-bone-label.png')})}
    check(`${width} 寬 長標籤：沒有 JS 錯誤`,!errors.length,errors);
    await page.context().close()}

  /* ---- R-02：設定頁的固定間隔和 planOf 用同一個檢查（1–120 的整數）；舊的不合格設定值改用預設值 ---- */
  {const s={...noRecs(seed()),'settings/intervals':{gi_egd:180,gi_colo:1200,thy_lab:0.4,breast_us:0,thy_us:9},'records/e1':R('gi_egd','gi','2025-01-01',{interval:null}),'records/e2':R('gi_colo','gi','2020-05-01',{interval:null}),'records/e3':R('thy_us','thyroid','2026-03-01',{interval:null})};
    const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:s}});await wait(600);
    const facts=()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#cats article.exam')].map(a=>[a.querySelector('.exam-name').textContent,a.querySelector('.facts').textContent])));
    let cards=await facts();
    check('舊的不合格設定值（胃鏡 180、大腸鏡 1200）改用預設值：胃鏡下次 2027/01/01・間隔 2 年，大腸鏡 2030/05/01・間隔 10 年；合格的 9 個月照用',cards['上消化道內視鏡（胃鏡）'].includes('下次2027/01/01')&&cards['上消化道內視鏡（胃鏡）'].includes('間隔2 年')&&cards['大腸鏡'].includes('下次2030/05/01')&&cards['大腸鏡'].includes('間隔10 年')&&cards['甲狀腺超音波'].includes('下次2026/12/01')&&cards['甲狀腺超音波'].includes('間隔9 個月'),cards);
    check('還沒有紀錄的卡片：固定間隔顯示預設值，不顯示不合格的設定（甲狀腺抽血 0.4 → 6 個月、乳房超音波 0 → 1 年）',cards['甲狀腺抽血']==='固定間隔6 個月'&&cards['乳房超音波']==='固定間隔1 年',cards);
    check('整頁沒有 15 年、100 年、NaN，也沒有任何一項被當成 0 而變成待安排',await page.evaluate(()=>!/15 年|100 年|NaN/.test(['#tally','#nextList','#cats'].map(q=>document.querySelector(q).textContent).join(' '))&&![...document.querySelectorAll('#p-exams .pill')].some(p=>p.textContent==='待安排')));
    await page.click('[data-add="gi_egd"]');await wait(250);let f=await formState(page);
    check('設定是 180 時新增胃鏡：間隔欄帶入預設的 24，表單不會拒絕自己帶入的值',f.interval==='24'&&f.ivErr===null&&f.ivInvalid===null,f);
    await page.click('#dlgRec [data-close]');await wait(150);
    await go(page,'setup',400);
    const rows=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#setRows input')].map(i=>[i.id.slice(3),[i.value,i.min,i.max,i.step]])));
    check('設定頁：每一列 min 1、max 120、step 1；不合格的舊值顯示成預設值，合格的照舊；沒有骨密度',Object.keys(rows).length===9&&Object.values(rows).every(r=>r[1]==='1'&&r[2]==='120'&&r[3]==='1')&&rows.gi_egd[0]==='24'&&rows.gi_colo[0]==='120'&&rows.thy_lab[0]==='6'&&rows.breast_us[0]==='12'&&rows.thy_us[0]==='9'&&!rows.bone_dxa,rows);
    const w0=await writes(page),bad=[];
    check('讀取不改資料：到這裡寫入 0 次，資料庫裡不合格的設定值原封不動',w0===0&&JSON.stringify(await page.evaluate(()=>__mock.store.get('settings/intervals')))===JSON.stringify(s['settings/intervals']),w0);
    const ivState=id=>page.evaluate(id=>{const i=document.querySelector('#iv-'+id),e=document.querySelector('#iv-'+id+'-err'),t=document.querySelector('#toast');return{v:i.value,err:e.hidden?null:e.textContent,inv:i.getAttribute('aria-invalid'),desc:i.getAttribute('aria-describedby'),focus:document.activeElement?.id||null,toast:t.hidden?null:document.querySelector('#toastText').textContent}},id);
    const typeIv=async(id,v)=>{await page.fill('#iv-'+id,'');await page.click('#iv-'+id);await page.keyboard.type(v);await wait(60)};
    const save=async()=>{await page.click('#ivForm button[type=submit]');await wait(300)};
    for(const v of ['121','1200','0.4','0','-5','1e2','e','240']){await typeIv('gi_egd',v);await save();const st=await ivState('gi_egd');
      if(!(st.err===FIXED_ERR&&st.inv==='true'&&st.desc==='iv-gi_egd-err'&&st.focus==='iv-gi_egd'&&st.toast!=='間隔已儲存'&&(await writes(page))===w0))bad.push([v,st,await writes(page)])}
    check('設定頁：121、1200、0.4、0、−5、1e2、e、240 都不存；錯誤顯示在那一欄、焦點回到那一欄、寫入 0 次',!bad.length,bad);
    await typeIv('gi_egd','12');let st=await ivState('gi_egd');
    check('設定頁：改成合格的值，那一欄的錯誤馬上消失',st.err===null&&st.inv===null,st);
    await typeIv('gi_egd','121');await page.fill('#iv-thy_us','0.5');await save();
    const two=await page.evaluate(()=>({errs:[...document.querySelectorAll('#setRows .ferr')].filter(e=>!e.hidden).map(e=>e.id),focus:document.activeElement.id,ox:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
    check('設定頁：兩欄都不合格時兩欄都標出，焦點在前面那一欄，仍然不寫入；沒有水平捲動',JSON.stringify(two.errs)===JSON.stringify(['iv-thy_us-err','iv-gi_egd-err'])&&two.focus==='iv-thy_us'&&two.ox<=0&&(await writes(page))===w0,two);
    const a=await page.evaluate(`(${scan.toString()})()`);
    check('設定頁的錯誤訊息：觸控目標 ≥44、文字對比足夠',!a.small.length&&!a.low.length,{small:a.small.slice(0,6),low:a.low.slice(0,6)});
    await page.fill('#iv-thy_us','9');await typeIv('gi_egd','36');await page.fill('#iv-gyn_horm','');await save();
    const saved=await page.evaluate(()=>__mock.store.get('settings/intervals'));st=await ivState('gi_egd');
    check('設定頁：改成 36 後存入；同一次存檔把其他不合格的舊值換成畫面上的預設值，清空的那一欄回到預設（null）；只寫入一次',saved.gi_egd===36&&saved.gi_colo===120&&saved.thy_lab===6&&saved.breast_us===12&&saved.thy_us===9&&saved.gyn_horm===null&&st.toast==='間隔已儲存'&&st.err===null&&(await writes(page))===w0+1,{saved,st});
    await typeIv('gi_colo','120');await typeIv('thy_lab','1');await save();const edge=await page.evaluate(()=>__mock.store.get('settings/intervals'));
    check('設定頁：邊界值 120 與 1 可以存',edge.gi_colo===120&&edge.thy_lab===1&&(await writes(page))===w0+2,edge);
    await go(page,'exams');cards=await facts();
    check('存檔後：胃鏡照新的 36 個月算（下次 2028/01/01・間隔 3 年）',cards['上消化道內視鏡（胃鏡）'].includes('下次2028/01/01')&&cards['上消化道內視鏡（胃鏡）'].includes('間隔3 年'),cards['上消化道內視鏡（胃鏡）']);
    check('設定頁的固定間隔：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  /* ---- 讀到已存的無效間隔：顯示成待安排（盡快處理），不算出 NaN 日期，也不改資料 ---- */
  {const base=noRecs(seed());
    const s={...base,'records/x1':bone('2026-10-01',{preset:'zok',interval:1e12}),'records/x2':R('breast_us','breast','2026-09-01',{interval:-1}),'records/x3':R('lung_ldct','lung','2026-08-01',{interval:1.5}),'records/x4':R('gi_egd','gi','2026-07-01',{interval:121}),'records/x5':R('thy_lab','thyroid','2026-07-01',{interval:6})};
    const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:s}});await wait(600);
    const v=await page.evaluate(()=>({pills:Object.fromEntries([...document.querySelectorAll('#cats article.exam')].map(a=>[a.querySelector('.exam-name').textContent,a.querySelector('.pill').textContent])),text:document.querySelector('#p-exams').textContent,next:[...document.querySelectorAll('#nextList li')].map(li=>li.textContent.replace(/\s+/g,' ').trim())}));
    check('定期檢查頁：間隔是 1e12、−1、1.5、121 的四筆都顯示「待安排」，正常的那筆照算',v.pills['骨密度 DXA']==='待安排'&&v.pills['乳房超音波']==='待安排'&&v.pills['低劑量電腦斷層 LDCT']==='待安排'&&v.pills['上消化道內視鏡（胃鏡）']==='待安排'&&/個月|天後/.test(v.pills['甲狀腺抽血']),v.pills);
    check('定期檢查頁：整頁沒有 NaN，也沒有把無效的數字印成間隔',!/NaN/.test(v.text)&&!/1000000000000|1\.5 個月|121 個月|-1 個月/.test(v.text),v.next);
    check('讀取不改資料：寫入 0 次，資料庫裡的 interval 原封不動',(await writes(page))===0&&(await stored(page,'x1')).interval===1e12&&(await stored(page,'x2')).interval===-1&&(await stored(page,'x3')).interval===1.5);
    await go(page,'today');const tc=flat(await txt(page,'#examCard'));
    check('今天頁：無效間隔的紀錄沒有消失，卡片顯示待安排與其他項數',/待安排・另有3項/.test(tc)&&!/NaN/.test(tc),tc);
    await go(page,'summary',500);const pv=await txt(page,'#smPreview');
    check('回診摘要：四筆都列在仍待處理（待安排），沒有 NaN',['骨密度 DXA 待安排','乳房超音波 待安排','低劑量電腦斷層 LDCT 待安排','上消化道內視鏡（胃鏡） 待安排'].every(t=>pv.includes(t))&&!/NaN/.test(pv),pv.slice(-220));
    await go(page,'exams');await page.evaluate(()=>openRecord('bone_dxa',records.find(r=>r.id==='x1')));await wait(250);
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
    await go(page,'today');
    check('沒有 cat 的紀錄：今天頁的到期卡照樣顯示',/骨密度 DXA.*26 天後到期/.test(await txt(page,'#examCard')||''),await txt(page,'#examCard'));
    await go(page,'summary',500);
    check('沒有 cat 的紀錄：回診摘要照樣列出',/骨密度 DXA 2026\/11\/25/.test(await txt(page,'#smPreview')));
    await go(page,'exams');await page.click('[data-hist="bone_dxa"]');await wait(200);await page.click('[data-edit="c1"]');await wait(250);
    let f=await formState(page);
    check('編輯舊紀錄：已存的間隔 12 原樣帶出，不因為分類改版而清掉或改成 0',f.interval==='12'&&f.ivErr===null&&f.preview==='下次檢查：2026/11/25（1 年後）',f);
    check('R-09 選單找不到已存的代號 low：選單停在（未分類），下方寫明不改就原樣保留',f.preset===''&&f.hint==='已存的分類「low」不在選單裡，不改就原樣保留',f);
    await page.fill('#fNote','補一句備註');await page.click('#btnSave');await wait(400);let r=await stored(page,'c1');
    check('編輯後：間隔仍是 12、補上 cat、表單沒有的 labs key 與其他欄位都保留',r.interval===12&&r.cat==='bone'&&r.note==='補一句備註'&&r.report==='舊紀錄'&&JSON.stringify(r.labs)===JSON.stringify({'L1–L4 T':'-1.4','左前臂 BMD':'0.512'})&&r.createdAt===5,r);
    check('R-09 只補備註再存：preset 原樣存回 low，沒有被清成 null',r.preset==='low',r.preset);
    await page.click('[data-edit="c1"]');await wait(250);await page.selectOption('#fPreset','zok');await page.selectOption('#fPreset','');f=await formState(page);await page.click('#btnSave');await wait(400);r=await stored(page,'c1');
    check('R-09 自己動過分類選單、再選回（未分類）：這次是使用者的決定，存成 null；已存的 12 個月不是這些分類帶的，留著',r.preset===null&&r.interval===12&&f.hint===NODEF&&f.interval==='12',{r,f});
    await page.evaluate(()=>__mock.externalSet('records/c9',{exam:'gi_egd',cat:'gi',date:'2026-05-01',preset:'zzz',interval:24,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{},createdAt:9,updatedAt:9}));await wait(300);
    await page.click('[data-hist="gi_egd"]');await wait(200);await page.click('[data-edit="c9"]');await wait(250);await page.fill('#fPlace','某診所');await page.click('#btnSave');await wait(400);r=await stored(page,'c9');
    check('R-09 沒有分類選單的檢查（胃鏡）帶著不認得的代號：編輯後也原樣存回',r.preset==='zzz'&&r.place==='某診所'&&r.interval===24,r);
    /* 表單狀態不殘留：保留舊代號的那張表單沒存就關掉，接著新增的紀錄不能帶到那個代號 */
    await page.click('[data-edit="c9"]');await wait(250);await page.click('#dlgRec [data-close]');await wait(150);
    await page.click('[data-add="gi_egd"]');await wait(250);await page.fill('#fDate','2026-06-01');await page.click('#btnSave');await wait(400);
    const fresh=await page.evaluate(()=>[...__mock.store.entries()].filter(([k,v])=>k.startsWith('records/')&&v.exam==='gi_egd'&&k!=='records/c9').map(([,v])=>[v.date,v.preset,v.interval]));
    check('表單狀態不殘留：開過帶舊代號的紀錄再新增一筆胃鏡，新紀錄的 preset 是 null，不是上一張表單保留的代號',JSON.stringify(fresh)===JSON.stringify([['2026-06-01',null,24]]),fresh);
    /* 已存的醫師指定間隔與日期：只改別的欄位時不動 */
    await page.evaluate(()=>{__mock.externalSet('records/c2',{exam:'bone_dxa',cat:'bone',date:'2026-01-10',preset:'zok',interval:24,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{'L1–L4 Z':'-0.4'},createdAt:6,updatedAt:6});
      __mock.externalSet('records/c3',{exam:'bone_dxa',cat:'bone',date:'2026-02-10',preset:'top',interval:0,nextDue:'2026-12-15',report:'',place:'',doctor:'',note:'',labs:{},createdAt:7,updatedAt:7})});await wait(300);
    for(const id of ['c2','c3']){await page.click(`[data-edit="${id}"]`);await wait(250);await page.fill('#fPlace','另一家醫院');await page.click('#btnSave');await wait(400)}
    const c2=await stored(page,'c2'),c3=await stored(page,'c3');
    check('已存的醫師指定間隔（24）與指定日期：編輯別的欄位後原封不動',c2.interval===24&&c2.preset==='zok'&&c2.nextDue===null&&c2.place==='另一家醫院'&&c3.interval===0&&c3.nextDue==='2026-12-15'&&c3.preset==='top',{c2,c3});
    /* GPT 審查（75e0110）第 1 點：已有醫師指定日期的紀錄改選不追蹤，日期不能留著繼續提醒 */
    await page.click('[data-edit="c3"]');await wait(250);const was=await formState(page);await page.selectOption('#fPreset',NOFOLLOW);f=await formState(page);await page.click('#btnSave');await wait(400);r=await stored(page,'c3');
    check('已有指定日期 2026-12-15 的紀錄改選「醫師表示目前不需例行追蹤」：間隔與指定日期都清空；存檔後 nextDue、interval 都是 null，不再照那個日期列入',was.due==='2026-12-15'&&f.interval===''&&f.due===''&&f.preview===NOFOLLOW_PV&&r.preset===NOFOLLOW&&r.interval===null&&r.nextDue===null,{was:was.due,f,r});
    /* GPT 複核（第二輪）第 2 點：已存紀錄的間隔一律當作明確設定，就算剛好等於分類帶入的值 */
    await page.evaluate(()=>__mock.externalSet('records/c6',{exam:'bone_dxa',cat:'bone',date:'2025-12-20',preset:'poiLow',interval:12,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{},createdAt:8,updatedAt:8}));await wait(300);
    await page.click('[data-edit="c6"]');await wait(250);await page.selectOption('#fPreset','zok');f=await formState(page);
    check('已存的 poiLow＋12 個月改選沒有間隔的分類：12 留著（紀錄上看不出是分類帶的還是醫師指定的，不替使用者清掉）',f.interval==='12'&&f.preview==='下次檢查：2026/12/20（1 年後）',f);
    await page.selectOption('#fPreset','poiNormHT');const g1=await formState(page);await page.selectOption('#fPreset','tnorm');const g2=await formState(page);
    check('同一張表單裡再改選 POI 正常：換成它帶入的 60；之後改選沒有間隔的分類，這個 60 是表單剛帶入的，清掉',g1.interval==='60'&&g2.interval===''&&g2.preview===UNPL,{g1:g1.interval,g2:g2.interval});
    await page.click('#dlgRec [data-close]');await wait(150);
    await page.evaluate(()=>__mock.externalSet('records/c7',{exam:'bone_dxa',cat:'bone',date:'2025-12-21',preset:'nofollow',interval:24,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{},createdAt:8,updatedAt:8}));await wait(300);
    await page.click('[data-edit="c7"]');await wait(250);f=await formState(page);
    check('匯入的資料裡已經是不追蹤＋間隔 24：打開編輯就在間隔欄標出來，要改掉其中一個才能存',f.preset===NOFOLLOW&&f.interval==='24'&&f.ivErr===STOP_ERR,f);
    await page.click('#dlgRec [data-close]');await wait(150);
    /* R-08：沒有間隔的骨密度紀錄（匯入的資料），顯示與編輯是同一套說法 */
    await page.evaluate(()=>__mock.externalSet('records/c4',{exam:'bone_dxa',cat:'bone',date:'2026-03-10',preset:null,interval:null,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{},createdAt:8,updatedAt:8}));await wait(300);
    c=await boneCard(page);await page.click('[data-edit="c4"]');await wait(250);f=await formState(page);
    check('R-08 interval null 的骨密度：卡片是待安排（還沒有追蹤計畫）；打開編輯，間隔欄是空的、預覽同樣寫還沒有追蹤計畫，沒有錯誤',c.pill==='待安排'&&c.facts.includes('下次還沒有追蹤計畫')&&f.interval===''&&f.preview===UNPL&&f.ivErr===null,{facts:c.facts,f});
    const w4=await writes(page);await page.fill('#fNote','只補備註');await page.click('#btnSave');await wait(400);r=await stored(page,'c4');
    check('R-08 只改備註就可以存，interval 仍是 null（不被帶成 0）',(await writes(page))===w4+1&&r.note==='只補備註'&&r.interval===null&&r.preset===null,r);
    /* R-10：已存的 nextDue 不是合法日期 */
    await page.evaluate(()=>__mock.externalSet('records/c5',{exam:'bone_dxa',cat:'bone',date:'2026-03-11',preset:'zok',interval:6,nextDue:'2026-13-40',report:'',place:'',doctor:'',note:'',labs:{},createdAt:9,updatedAt:9}));await wait(300);
    await page.click('[data-edit="c5"]');await wait(250);f=await formState(page);
    check('R-10 已存的 nextDue 是 2026-13-40：日期欄是空的，但欄位下方寫明原本的值沒有採用、儲存後會清掉；預覽照間隔 6 個月',f.due===''&&f.dueNote==='原本存的「2026-13-40」不是有效日期，沒有採用；儲存後會清掉'&&f.dueErr===null&&f.preview==='下次檢查：2026/09/11（6 個月後）',f);
    await page.fill('#fNote','看過了');await page.click('#btnSave');await wait(400);r=await stored(page,'c5');
    check('R-10 存檔後 nextDue 是 null，間隔與到期日不變',r.nextDue===null&&r.interval===6&&r.note==='看過了',r);
    await page.click('[data-edit="c2"]');await wait(250);f=await formState(page);
    check('R-10 nextDue 正常或沒有的紀錄：沒有這行提示',f.dueNote===null,f.dueNote);
    await page.click('#dlgRec [data-close]');await wait(150);
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
    check(`${scheme} 骨密度表單：編輯已存的紀錄時，選單下方同樣寫出完整標籤與依據`,(await formState(page)).hint===hintOf(PRESETS[4]),(await formState(page)).hint);
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
    check('今天頁：沒有間隔的骨密度是待安排，不會套 12 個月變成「已逾期」，也不會消失',flat(await txt(page,'#examCard'))==='骨密度DXA待安排›',await txt(page,'#examCard'));
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
  /* R-06：date 不合法或不存在的紀錄，頁面與摘要用同一套說法 */
  {const s={...noRecs(seed()),'records/d1':R('thy_lab','thyroid','2026-02-31',{interval:6}),'records/d2':{exam:'gi_egd',cat:'gi',preset:null,interval:24,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{},createdAt:1,updatedAt:1}};
    const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:s}});await wait(600);
    const pills=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#cats article.exam')].map(a=>[a.querySelector('.exam-name').textContent,a.querySelector('.pill').textContent])));
    await go(page,'today');const tc=flat(await txt(page,'#examCard'));
    await go(page,'summary',500);const pv=await txt(page,'#smPreview');
    check('R-06 抽血的 date 是 2026-02-31、胃鏡沒有 date：定期檢查頁兩項都是待安排，今天頁列出兩項，回診摘要的仍待處理也列出這兩項（不再寫沒有）',pills['甲狀腺抽血']==='待安排'&&pills['上消化道內視鏡（胃鏡）']==='待安排'&&tc==='甲狀腺抽血待安排・另有1項›'&&/仍待處理：甲狀腺抽血 待安排、上消化道內視鏡（胃鏡） 待安排/.test(pv),{pills,tc,pv:pv.slice(-120)});
    check('R-06：沒有 JS 錯誤、沒有 NaN',!errors.length&&!/NaN/.test(pv),errors);
    await page.context().close()}

  {const s={...noRecs(seed()),'records/d3':{exam:'breast_us',cat:'breast',date:20260101,preset:null,interval:12,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{},createdAt:1,updatedAt:1},'records/d4':R('thy_lab','thyroid','2026-05-20',{interval:6})};
    const {page,errors}=await open({time:NOW,hash:'exams',cfg:{latencyComp:true,seed:s}});await wait(600);
    const v=await page.evaluate(()=>({pills:Object.fromEntries([...document.querySelectorAll('#cats article.exam')].map(a=>[a.querySelector('.exam-name').textContent,a.querySelector('.pill').textContent])),facts:document.querySelector('#h-breast').closest('section').querySelector('.facts').textContent,bone:!!document.querySelector('#h-bone'),next:[...document.querySelectorAll('#nextList li')].map(li=>li.textContent.replace(/\s+/g,' ').trim())}));
    await page.click('[data-hist="breast_us"]');await wait(200);const hist=await page.evaluate(()=>document.querySelector('#h-breast').closest('section').querySelector('.hist li')?.textContent||'');
    await page.click('[data-edit="d3"]');await wait(250);const fo=await formState(page);await page.click('#dlgRec [data-close]');await wait(150);
    await go(page,'today');const tc=flat(await txt(page,'#examCard'));
    await go(page,'summary',500);const pv=await txt(page,'#smPreview');
    check('R-06 date 是數字（匯入的資料）：定期檢查頁照樣整頁畫得出來（GPT 審查第 3 點），乳房超音波是待安排、上次寫「—」，其他檢查不受影響',v.pills['乳房超音波']==='待安排'&&v.pills['甲狀腺抽血']==='21 天後到期'&&v.bone&&v.facts.includes('上次—')&&v.next.length===2&&v.next[0].includes('乳房超音波'),v);
    check('R-06 date 是數字：歷史列與編輯表單打得開，今天頁與回診摘要同樣列為待安排；沒有 JS 錯誤、沒有 NaN',hist.includes('下次 待安排')&&fo.open&&fo.exam==='breast_us'&&tc==='乳房超音波待安排・另有1項›'&&/仍待處理：乳房超音波 待安排/.test(pv)&&!/NaN/.test(pv+tc+hist)&&!errors.length,{hist,fo,tc,pv:pv.slice(-120),errors});
    await page.context().close()}

  /* ---- 匯出、匯入：新備份往返、舊備份 ---- */
  {let exported;const mine={'records/b2':bone('2025-11-25',{labs:allLabs(1)}),'records/b3':bone('2026-03-01',{preset:'none',interval:null,labs:{'L1–L4 T':'-1.1','左前臂 BMD':'0.5'},createdAt:12}),'records/b4':{exam:'bone_dxa',date:'2026-04-01',preset:'tlow',interval:0,nextDue:'2027-04-01',labs:{},createdAt:13},'records/b5':bone('2025-01-05',{preset:NOFOLLOW,interval:null,createdAt:14})};
    const IDS=['b2','b3','b4','b5'];
    {const {page}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed(mine)}});await wait(700);
      await tap(page,'#btnExport');await until(page,()=>!!window.__lastDownload);
      exported=JSON.parse(await page.evaluate(()=>window.__lastDownload.data));
      check('匯出：備份裡有四筆骨密度，內容和資料庫相同（還沒有追蹤計畫、不追蹤、指定日期、沒有 cat、表單沒有的 labs key 都在）',IDS.every(id=>JSON.stringify(exported.collections.records[id])===JSON.stringify(mine['records/'+id])),exported.collections.records.b3);
      await page.context().close()}
    {const {page,errors}=await open({time:NOW,hash:'setup',cfg:{latencyComp:true,seed:seed()}});await wait(700);
      await page.setInputFiles('#impFile',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await wait(300);
      const pv=await txt(page,'#impPreview');await tap(page,'#impGo');await tap(page,'#impGo');
      await until(page,()=>!document.querySelector('#impActions')||document.querySelector('#impActions').hidden,8000);
      const back=await Promise.all(IDS.map(id=>stored(page,id)));
      check('匯入新備份：預覽算進定期檢查筆數，四筆骨密度和匯出時一字不差',/定期檢查 7 筆/.test(pv)&&IDS.every((id,i)=>JSON.stringify(back[i])===JSON.stringify(mine['records/'+id])),{pv,back});
      await go(page,'exams',400);const c=await boneCard(page);
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
      const r2=await stored(page,'r2'),d=await page.evaluate(()=>__mock.store.get('days/2026-05-30')),back=await Promise.all(IDS.map(id=>stored(page,id)));
      check('匯入舊備份：預覽照舊（定期檢查 2 筆）、舊紀錄寫入',/定期檢查 2 筆/.test(pv)&&r2?.note==='舊備份'&&d?.am?.w===52.3,{pv,r2,d});
      check('匯入舊備份：現有的四筆骨密度原封不動',IDS.every((id,i)=>JSON.stringify(back[i])===JSON.stringify(mine['records/'+id])),back);
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
    check('從截圖填入：換成骨密度後是骨密度的 11 個欄位，全部空白；分類沒有被自動選（也不是不追蹤），間隔是空的',JSON.stringify(st.labs.map(l=>l[0]))===JSON.stringify(LABS)&&st.labs.every(l=>l[1]==='')&&st.preset===''&&st.interval==='',st);
    check('從截圖填入：截圖讀到的其他檢驗會放進報告內容',st.note&&st.note.includes('TSH')&&st.note.includes('會放進報告內容'),st.note);
    await page.selectOption('#fPreset','poiNormHT');await page.fill('[data-lab="L1–L4 BMD"]','0.955');await page.click('#btnSave');await wait(500);
    const rs=await boneRecs(page);
    check('從截圖填入：存成骨密度紀錄（自己選的分類、間隔、手填的數值、截圖的日期與醫院）',rs.length===1&&rs[0].preset==='poiNormHT'&&rs[0].interval===60&&rs[0].labs['L1–L4 BMD']==='0.955'&&rs[0].date==='2026-10-20'&&rs[0].place==='測試醫院'&&!!rs[0].shot&&rs[0].report.includes('TSH'),rs);
    check('從截圖填入：沒有 JS 錯誤',!errors.length,errors);
    await page.context().close()}

  await close();process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
