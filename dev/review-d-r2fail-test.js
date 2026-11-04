/* Synthetic-only R2 fix guard: a FAILED reread must not invalidate skip undo. From ccr-9364f60a-xq6vfj (docs/reviews/2026-11-02-phase-D-r2-failure-undo.test.js).
 * Run: node dev/review-d-r2fail-test.js
 * Uses real UI clicks and existing harness/mock; no product function replacements.
 * Written and executed by Codex while Claude proposed the product patch.
 */
const {open,close,sampleSeed,check,summary}=require('./harness');
async function run(reply,label){
  const {page,ctx}=await open({hash:'exams',time:'2026-10-30T12:40:00+08:00',cfg:{latencyComp:true,seed:sampleSeed('2026-10-30'),sample:{shot:'multi'}}});
  try{
    page.setDefaultTimeout(5000);
    await page.waitForFunction(()=>canEstimate()&&db&&loaded.records);
    await page.click('#btnAdd');
    const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=40;return c.toDataURL('image/png').split(',')[1]});
    await page.setInputFiles('[data-shotfile]',{name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
    await page.waitForFunction(()=>!!shotCur);
    await page.fill('#fDate','2026-10-21');
    await page.fill('#fNote','synthetic corrected draft');
    await page.fill('[data-lab="TSH"]','3.14');
    await page.evaluate(()=>{window.__r2Original=shotQ.slice()});
    await page.click('[data-shot="skip"]');
    await page.evaluate(value=>{__mock.sampleRespond=()=>value},reply);
    await page.click('[data-shot="reread"]');
    await page.waitForFunction(()=>shotSt.phase==='msg'&&!shotBusy());
    check(label+': undo remains visible',await page.locator('#toastActs button').isVisible());
    await page.click('#toastActs button');
    const state=await page.evaluate(()=>({same:shotQ.length===2&&shotQ.every((d,i)=>d===__r2Original[i])&&shotCur===__r2Original[0],date:document.querySelector('#fDate').value,note:document.querySelector('#fNote').value,value:document.querySelector('[data-lab="TSH"]').value,images:!!shotBatches.get(shotCur.batch)?.blobs?.length}));
    check(label+': original drafts and images survive',state.same&&state.images,state);
    check(label+': skipped corrections survive',state.date==='2026-10-21'&&state.note==='synthetic corrected draft'&&state.value==='3.14',state);
    await page.click('#btnSave');await page.waitForFunction(()=>!recSaving);
    const writes=await page.evaluate(()=>__mock.writes.filter(w=>w.path.startsWith('records/')&&w.data?.exam==='thy_lab').map(w=>w.data));
    check(label+': restored draft saves exactly once with corrections',writes.length===1&&writes[0].date==='2026-10-21'&&writes[0].labs.TSH==='3.14',writes);
  }finally{await ctx.close()}
}
(async()=>{
  for(const [reply,label] of [[{error:'upstream_error'},'upstream failure'],['not JSON','parse failure']]){
    try{await run(reply,label)}catch(e){check(label+' unexpected exception',false,e.stack)}
  }
  await close();process.exitCode=summary()?1:0;
})().catch(async e=>{console.error(e);await close();process.exitCode=1});
