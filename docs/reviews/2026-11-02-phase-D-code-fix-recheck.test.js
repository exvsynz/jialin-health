/* Synthetic data only. Run from repo root:
 * node docs/reviews/2026-11-02-phase-D-code-fix-recheck.test.js [case]
 * Cases: R1 R2 R3 R4 R5 R6 R7 C1 C2 controls original-D09
 * Requires the same Playwright installation/browser as dev/harness.js.
 * Assertions describe CORRECT behavior. R1-R7 and C1-C2 intentionally FAIL on 78c39b9.
 * SRC=/path/to/old.html works for C1, C2 and original-D09.
 * Discovery: lead Codex except R3 (GLM 5.3 draft worker), C2 (Mistral Large 4).
 */
const fs=require('fs'),assert=require('node:assert/strict');
const {open,close,sampleSeed,SRC}=require('../../dev/harness');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const html=fs.readFileSync(SRC,'utf8');
const block=html.match(/\/\* ---- shot helpers: begin[^*]*\*\/([\s\S]*?)\/\* ---- shot helpers: end/)[1];
const H=new Function(block+';return {classPreset,groupShot,parseShot,redact}')();
const lab=(o={})=>({type:'lab',name:'TSH',value:'2',unit:'mIU/L',date:'2026/10/20',place:'合成甲院',unclear:[],...o});
const rep=(title,text)=>({type:'report',exam:'breast_us',date:'2026/10/20',place:'合成甲院',title,text,class:'BI-RADS 3',unclear:[]});
let passed=0,failed=0;
function check(name,actual,expected){try{assert.deepStrictEqual(actual,expected);passed++;console.log('PASS',name)}catch{failed++;console.log('FAIL',name,JSON.stringify({actual,expected}))}}
async function png(page){return{name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=40;return c.toDataURL().split(',')[1]}),'base64')}}
async function boot(sample={},extra={}){const h=await open({hash:'exams',time:'2026-10-30T08:00:00+08:00',cfg:{seed:sampleSeed('2026-10-30'),latencyComp:true,sample,...extra}});h.page.setDefaultTimeout(5000);await h.page.waitForFunction(()=>canEstimate()&&db&&loaded.records);return h}
async function pick(page){await page.setInputFiles('[data-shotfile]',await png(page));await page.waitForFunction(()=>!!shotCur)}
async function start(items,extra={}){const h=await boot({reply:JSON.stringify({items})},extra);await h.page.click('#btnAdd');await pick(h.page);return h}
async function settle(page){await page.waitForFunction(()=>!recSaving)}
async function closeForm(page){await page.click('#dlgRec [data-close]');await page.waitForFunction(()=>shotCur===null)}
async function resume(page){await page.click('#btnAdd');await page.click('[data-shot="go"]')}
const writes=page=>page.evaluate(()=>__mock.writes.filter(w=>w.path.startsWith('records/')).map(w=>w.data));
const tests={
async R1(){ // distinct reports collide in shotKey
  const {page,ctx}=await start([rep('LEFT','left report'),rep('RIGHT','right report')]);
  try{await page.click('[data-shot="clsok"]');await page.click('#btnSave');await settle(page);
    check('R1 setup: only RIGHT remains',await page.evaluate(()=>shotQ.map(d=>d.title)),['RIGHT']);
    await page.click('[data-shot="reread"]');await page.waitForFunction(()=>shotSt.phase!=='reading');
    check('R1 unsaved RIGHT must survive reread',await page.evaluate(()=>shotQ.map(d=>d.title)),['RIGHT']);
  }finally{await ctx.close()}
},
async R2(){ // old skip undo restores a draft during reread; completion detaches it from queue
  const {page,ctx}=await start([lab(),lab({name:'E2',unit:'pg/mL'})]);
  try{await page.click('[data-shot="skip"]');await page.evaluate(()=>__mock.cfg.sample.delay=700);
    await page.click('[data-shot="reread"]');await page.click('#toastActs button');
    await page.waitForFunction(()=>shotSt.phase!=='reading');
    check('R2 displayed draft must belong to queue',await page.evaluate(()=>shotQ.includes(shotCur)),true);
    await page.click('#btnSave');await settle(page);
    check('R2 saved thyroid draft must leave queue',await page.evaluate(()=>shotQ.map(d=>d.exam)),['gyn_horm']);
    const duplicate=await page.evaluate(()=>shotCur?.exam==='thy_lab');
    if(duplicate){await page.click('#btnSave');await settle(page)}
    check('R2 thyroid draft written at most once',(await writes(page)).filter(d=>d.exam==='thy_lab').length,1);
  }finally{await ctx.close()}
},
async R3(){ // first found by GLM 5.3; force close/reopen before native close event is delivered
  const {page,ctx}=await start([rep('LEFT','left report')]);
  try{await page.click('[data-shot="clsok"]');await page.fill('#fDate','2026-10-25');await page.fill('#fNote','corrected');
    await page.evaluate(()=>{dlg.close();openRecord()}); // controlled event ordering; no product function replaced
    await page.click('[data-shot="go"]');
    check('R3 fast reopen preserves corrections and confirmed preset',await page.evaluate(()=>({date:document.querySelector('#fDate').value,note:document.querySelector('#fNote').value,preset:document.querySelector('#fPreset').value,ok:shotCur.clsOk})),{date:'2026-10-25',note:'corrected',preset:'b3',ok:true});
  }finally{await ctx.close()}
},
async R4(){ // delayed GC from A must not collect recently skipped B
  const {page,ctx}=await start([lab()]);
  try{await page.clock.install();await page.click('[data-shot="skip"]');await page.clock.runFor(3000);
    await page.click('#btnAdd');await pick(page);await page.click('[data-shot="skip"]');await page.clock.runFor(4100);
    check('R4 B undo still visible before its six seconds expire',await page.locator('#toastActs button').isVisible(),true);
    await page.click('#toastActs button');
    check('R4 B image and reread retained during its undo lease',await page.evaluate(()=>({batch:shotBatches.has(shotCur.batch),reread:!!document.querySelector('[data-shot="reread"]')})),{batch:true,reread:true});
  }finally{await ctx.close()}
},
async R5(){ // failed reread retains a second blob owner outside shotBatches
  const {page,ctx}=await start([lab()]);
  try{await page.evaluate(()=>__mock.cfg.sample.reply={error:'upstream_error'});await page.click('[data-shot="reread"]');await page.waitForFunction(()=>shotSt.phase==='msg');
    await page.clock.install();await page.click('[data-shot="drop"]');await page.clock.runFor(7100);
    check('R5 discarded batch must release all image owners after undo expiry',await page.evaluate(()=>({batches:shotBatches.size,retryBlobs:shotLast?.blobs.length||0,retryBatchBlobs:shotLast?.batch?.blobs.length||0})),{batches:0,retryBlobs:0,retryBatchBlobs:0});
  }finally{await ctx.close()}
},
async R6(){ // metadata merged into prev but not prev.item
  const d=H.groupShot([lab({unit:null}),lab({ref:'REF-X',flag:'H'}),lab({value:'3'})],{units:{TSH:'mIU/L'}})[0];
  check('R6 merged reference and flag survive a later conflict',d.report.includes('REF-X')&&d.report.includes(' H'),true);
  console.log('R6 report:',JSON.stringify(d.report));
},
async R7(){
  check('R7a excluded pattern must not be suggested',H.classPreset('thy_us',null,'ATA: high suspicion pattern ruled out').preset,null);
  check('R7b unrelated previous sentence must not negate explicit classification',H.classPreset('thy_us',null,'No abnormal lymph nodes. ATA high suspicion.').preset,'high');
  check('R7c case-insensitive ATA spelling remains supported',H.classPreset('thy_us',null,'ata high suspicion').preset,'high');
  // Per updated spec, a same-sentence 風險/without veto is deliberate, not an implementation defect.
  check('R7 control: explicit recurrence-risk veto',H.classPreset('thy_us',null,'ATA high risk of recurrence').preset,null);
},
async C1(){ // pre-existing toast host lifecycle, explicitly requested cross-page investigation
  for(const [id,openFn] of [['wSheet',()=>openSheet('am')],['dlgMeal',()=>openMeal('syntheticMeal','2026-10-30')],['dlgDose',()=>openDose()]]){
    const seed=sampleSeed('2026-10-30');seed['days/2026-10-30']={date:'2026-10-30',meals:{syntheticMeal:{meal:'lunch',at:Date.parse('2026-10-30T12:00:00+08:00'),manualKcal:400,note:'synthetic',createdAt:1}}};
    const {page,ctx}=await boot({}, {seed});
    try{await page.evaluate(openFn);check('C1 '+id+' setup opened',await page.evaluate(id=>document.getElementById(id).open,id),true);
      // A synthetic async completion uses the REAL toast; tests only host lifecycle, no model call.
      await page.evaluate(()=>toast('synthetic completion',[['撤銷',()=>{}]]));
      check('C1 '+id+' action clickable while open',await page.locator('#toastActs button').isVisible(),true);
      if(id==='wSheet')await page.click('#wsClose');else await page.click('#'+id+' [data-close]');
      check('C1 '+id+' live toast survives closing its host',await page.locator('#toastActs button').isVisible(),true);
    }finally{await ctx.close()}
  }
},
async C2(){ // Mistral Large 4 candidate, reproduced in old source too: not introduced by 78c39b9
  const {page,ctx}=await start([lab(),lab({name:'E2',unit:'pg/mL'})]);
  try{await page.click('#btnSave');await wait(100);await closeForm(page);await page.click('#btnAdd');await page.click('[data-shot="drop"]');await page.click('#toastActs button');await page.click('[data-shot="go"]');await page.click('#btnSave');await wait(150);
    check('C2 both records really written',(await writes(page)).length,2);
    check('C2 undo restores saved-count summary',await page.textContent('#toastText'),'已儲存 2 筆');
  }finally{await ctx.close()}
},
async controls(){
  const seed=sampleSeed('2026-10-30');seed['meddose/syntheticChange']={kind:'dose',date:'2026-10-01',dose:75,tablet:'',brand:'',reason:'',note:'',createdAt:1,updatedAt:1,deleted:false};
  const {page,ctx}=await start([lab()],{seed});
  try{await page.fill('[data-lab="TSH"]','9.9');await page.fill('#fDate','2026-10-21');await page.fill('#fInterval','9');await page.fill('#fDue','2027-03-05');await page.click('[data-ctx="biotin7d"] [data-v="yes"]');await page.click('[data-ctx="medBeforeDraw"] [data-v="no"]');
    check('controls real recheck toggle enabled',await page.locator('#fRecheck').isEnabled(),true);await page.uncheck('#fRecheck');
    const state=()=>page.evaluate(()=>({lab:document.querySelector('[data-lab="TSH"]').value,date:document.querySelector('#fDate').value,interval:document.querySelector('#fInterval').value,due:document.querySelector('#fDue').value,ctx:formCtx,rc:document.querySelector('#fRecheck').checked,rcTouched}));
    const before=await state();await closeForm(page);await resume(page);check('controls all correction fields survive normal close/resume',await state(),before);
    await page.evaluate(()=>__mock.cfg.sample.reply={error:'upstream_error'});await page.click('[data-shot="reread"]');await page.waitForFunction(()=>shotSt.phase==='msg');await page.click('[data-shot="go"]');check('controls all correction fields survive failed reread',await state(),before);
    await page.click('[data-shot="skip"]');await page.click('#toastActs button');check('controls all correction fields survive skip/undo',await state(),before);
    await page.evaluate(()=>{__mock.cfg.latency=500;__mock.cfg.failPath={prefix:'records/',code:'unavailable',count:1}});await page.click('#btnSave');await closeForm(page);await page.click('#btnAdd');await page.click('[data-shot="go"]');await page.click('[data-shot="drop"]');
    check('controls slow failed save blocks go/drop',await page.evaluate(()=>({cur:shotCur,q:shotQ.length})),{cur:null,q:1});await settle(page);await page.click('[data-shot="go"]');check('controls slow failure preserves corrected draft',await state(),before);
  }finally{await ctx.close()}
  const h=await start([rep('LEFT','left report')]);
  try{await closeForm(h.page);await resume(h.page);check('controls unconfirmed classification still blocks after restore',await h.page.locator('#btnSave').isDisabled(),true);await h.page.click('[data-shot="clsok"]');await closeForm(h.page);await resume(h.page);check('controls confirmed category survives normal restore',await h.page.inputValue('#fPreset'),'b3');await h.page.selectOption('#fExam','breast_mammo');check('controls exam change requires reconfirmation',await h.page.locator('#btnSave').isDisabled(),true);
  }finally{await h.ctx.close()}
  const h2=await boot();try{await h2.page.click('#btnAdd');await h2.page.evaluate(()=>__mock.cfg.latency=600);await h2.page.click('#btnSave');await closeForm(h2.page);await h2.page.click('#btnAdd');await h2.page.fill('#fNote','new form');await settle(h2.page);check('controls recEpoch keeps newer manual form open',await h2.page.evaluate(()=>({open:dlg.open,note:document.querySelector('#fNote').value})),{open:true,note:'new form'});}finally{await h2.ctx.close()}
  for(const [exam,input,expected] of [['breast_us','BI-RADS category 3','b3'],['breast_us','BI-RADS 4A; BI-RADS 4C',null],['lung_ldct','Lung-RADS v2022 category 2S','l12'],['lung_ldct','Lung-RADS v1.1 4X','l4b']])check('controls '+input,H.classPreset(exam,input).preset,expected);
  check('controls all persisted OCR text fields redacted',JSON.stringify(H.parseShot(JSON.stringify({items:[{...rep('a123456789','Ａ１２３４５６７８９'),place:'b223456789',class:'a123456789'},lab({value:'a123456789',unit:'a123456789',ref:'a123456789',flag:'a123456789',order:'a123456789'})]}))).includes('123456789'),false);
  check('controls two fences rejected',H.parseShot('```json\n{"items":[]}\n```\n```text\nx\n```').err,'invalid');
},
async 'original-D09'(){ // preserve original overlap timing: B sample is pending when A finishes prep
  const {page,ctx}=await boot({shot:'single',delay:400});try{await page.click('#btnAdd');
    const result=await page.evaluate(async()=>{const orig=prepShot;window.prepShot=async f=>{await new Promise(r=>setTimeout(r,f.name==='A.png'?150:20));return orig(f)};const mk=(n,w)=>new Promise(res=>{const c=document.createElement('canvas');c.width=w;c.height=100;c.toBlob(b=>res(new File([b],n,{type:'image/png'})))});const A=await mk('A.png',300),B=await mk('B.png',200);await Promise.all([shotPick([A]),shotPick([B])]);await new Promise(r=>setTimeout(r,700));return __mock.sampleCalls.map(c=>c.images[0].w)});
    check('original D09 first selection retained',result,[300]);
  }finally{await ctx.close()}
}
};
(async()=>{const names=process.argv[2]?[process.argv[2]]:Object.keys(tests);for(const n of names){if(!tests[n])throw Error('Unknown case '+n);try{await tests[n]()}catch(e){failed++;console.error('ERROR',n,e.stack)}}await close();console.log(`${passed} passed, ${failed} failed`);process.exitCode=failed?1:0})().catch(async e=>{console.error(e);await close();process.exitCode=1});
