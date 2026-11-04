/* Synthetic-only supplementary sequences; reviewed source: 78c39b9. From ccr-9364f60a-xq6vfj (docs/reviews/2026-11-02-phase-D-code-fix-recheck.supplement.test.js).
 * Run from repo root, with the existing harness's Playwright available:
 * node dev/review-d-r2after-test.js [R2-after|R4-reskip]
 * Correct-behavior assertions intentionally fail on 78c39b9. No product functions replaced.
 */
const {open,close,sampleSeed,check,summary}=require('./harness');
async function boot(shot){
  const h=await open({hash:'exams',time:'2026-10-30T12:40:00+08:00',cfg:{latencyComp:true,seed:sampleSeed('2026-10-30'),sample:{shot}}});
  h.page.setDefaultTimeout(5000);
  await h.page.waitForFunction(()=>canEstimate()&&db&&loaded.records);
  await h.page.click('#btnAdd');
  const image=await h.page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=40;return c.toDataURL('image/png').split(',')[1]});
  await h.page.setInputFiles('[data-shotfile]',{name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await h.page.waitForFunction(()=>!!shotCur);
  return h;
}
const tests={
  // Candidate from the requested GLM save worker's partial output, verified by lead.
  // Extends R2: press the old undo AFTER reread completes, not while it is pending.
  async 'R2-after'(){const {page,ctx}=await boot('multi');try{
    await page.click('[data-shot="skip"]');
    await page.click('[data-shot="reread"]');
    await page.waitForFunction(()=>__mock.sampleCalls.length===2&&!shotBusy()&&!!shotCur);
    await page.click('#toastActs button');
    const q=await page.evaluate(()=>shotQ.map(d=>d.exam));
    check('R2-after: obsolete undo must not add another thyroid draft',JSON.stringify(q)===JSON.stringify(['thy_lab','gyn_horm']),q);
    await page.click('#btnSave');await page.waitForFunction(()=>!recSaving);
    await page.click('#btnSave');await page.waitForFunction(()=>!recSaving);
    const n=await page.evaluate(()=>__mock.writes.filter(w=>w.path.startsWith('records/')&&w.data?.exam==='thy_lab').length);
    check('R2-after: thyroid draft written once',n===1,n);
  }finally{await ctx.close()}},
  // First independently observed by lead; same GC defect as R4, within one batch.
  async 'R4-reskip'(){const {page,ctx}=await boot('single');try{
    await page.clock.install();
    await page.click('[data-shot="skip"]');await page.clock.runFor(4000);
    await page.click('#toastActs button');await page.click('[data-shot="skip"]');
    await page.clock.runFor(3300); // first GC has fired, second undo still valid
    check('R4-reskip: second undo remains visible',await page.locator('#toastActs button').isVisible());
    await page.click('#toastActs button');
    const s=await page.evaluate(()=>({drafts:shotQ.length,batch:shotBatches.has(shotCur.batch),reread:!!document.querySelector('[data-shot="reread"]')}));
    check('R4-reskip: renewed undo retains image and reread',s.drafts===1&&s.batch&&s.reread,s);
  }finally{await ctx.close()}}
};
(async()=>{for(const name of process.argv[2]?[process.argv[2]]:Object.keys(tests)){if(!tests[name])throw Error('Unknown case '+name);try{await tests[name]()}catch(e){check(name+' unexpected exception',false,e.stack)}}await close();process.exitCode=summary()?1:0})().catch(async e=>{console.error(e);await close();process.exitCode=1});
