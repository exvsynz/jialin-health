/* 共用：把 src/index.html 包成 Artifact 外框的樣子、注入假 window.claude、固定台北時間。
   外框只加 doctype、charset、viewport 與 body margin，不補 [hidden]，讓頁面自己負責。 */
const fs=require('fs'),os=require('os'),path=require('path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const SRC=process.env.SRC?path.resolve(process.env.SRC):path.join(ROOT,'src/index.html'); // SRC=舊檔路徑 可對舊版本跑同一組測試
const MOCK=fs.readFileSync(path.join(__dirname,'mock-claude.js'),'utf8');

function wrap(){
  const out=path.join(os.tmpdir(),'jialin-health-wrapped.html');
  fs.writeFileSync(out,'<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}</style></head><body>'+fs.readFileSync(SRC,'utf8')+'</body></html>');
  return out;
}

/* 合成資料（不是真實資料）：today 前 20 天的早晚體重、服藥、運動、三筆檢查 */
function sampleSeed(today){
  const [y,m,d]=today.split('-').map(Number);const d0=Date.UTC(y,m-1,d);
  const ds=n=>new Date(d0-n*864e5).toISOString().slice(0,10);
  const s={};let w=52.6;
  for(let i=20;i>=1;i--){
    w+=Math.sin(i*1.7)*0.25;const k=ds(i);
    s['days/'+k]={date:k,am:{w:Math.round(w*10)/10,bf:Math.round((24+Math.sin(i)*0.6)*10)/10,at:'07:1'+(i%10)},updatedAt:1};
    if(i%3)s['days/'+k].pm={w:Math.round((w+0.5)*10)/10,bf:null,at:'22:05'};
    if(i!==4)s['days/'+k].med={taken:true,at:'07:2'+(i%10),dose:50};
    if(i>=9&&i<=12)s['days/'+k].period=true;
  }
  [[1,'yoga',60],[3,'pilates',50],[6,'yoga',60],[8,'other',30,'快走'],[10,'pilates',50]].forEach(([n,t,mn,l],j)=>{
    s['exercise/e'+j]={date:ds(n),type:t,label:l||({yoga:'瑜珈',pilates:'皮拉提斯'})[t],min:mn,note:'',at:'19:00',createdAt:j+1};
  });
  s['records/r1']={exam:'thy_us',cat:'thyroid',date:'2025-12-10',preset:'lowint',interval:12,nextDue:null,report:'右葉 0.5 cm 等回音結節',place:'測試醫院',doctor:'',note:'',labs:{},createdAt:1,updatedAt:1};
  s['records/r2']={exam:'breast_us',cat:'breast',date:'2025-06-01',preset:'b12',interval:12,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{},createdAt:2,updatedAt:2};
  s['records/r3']={exam:'thy_lab',cat:'thyroid',date:'2026-07-01',preset:null,interval:6,nextDue:null,report:'',place:'',doctor:'',note:'',labs:{TSH:'2.1','Free T4':'1.2'},createdAt:3,updatedAt:3};
  s['settings/profile']={medName:'Levothyroxine',medDose:50,medNote:'半顆，早上空腹',yogaMin:60,pilatesMin:50};
  return s;
}

let browser;
async function launch(){browser=browser||await chromium.launch();return browser}
async function close(){if(browser)await browser.close();browser=null}

/* 開一頁：time 是台北時間 ISO（含 +08:00），cfg 傳給假物件 */
/* install:true 用可推進的假時鐘（page.clock.runFor）；init 是額外的頁面初始化 script */
async function open({time='2026-10-30T08:00:00+08:00',cfg={},width=380,height=820,scheme='light',mobile=true,hash='',install=false,init=''}={}){
  const b=await launch();
  const ctx=await b.newContext({viewport:{width,height},colorScheme:scheme,deviceScaleFactor:mobile?2:1,hasTouch:mobile,isMobile:mobile});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
  if(install)await page.clock.install({time:new Date(time)});else await page.clock.setFixedTime(new Date(time));
  if(init)await page.addInitScript(init);
  await page.addInitScript('window.__mockCfg='+JSON.stringify(cfg)+';'+MOCK);
  await page.goto('file://'+wrap()+(hash?'#'+hash:''));
  return {page,ctx,errors,doc:p=>page.evaluate(p=>{const v=window.__mock.store.get(p);return v===undefined?null:v},p)};
}

/* 極簡斷言 */
const results=[];
function check(name,ok,detail){results.push({name,ok:!!ok,detail});console.log((ok?'  ok   ':'  FAIL ')+name+(ok||detail===undefined?'':'  → '+JSON.stringify(detail)))}
function summary(){const f=results.filter(r=>!r.ok);console.log(`\n${results.length-f.length}/${results.length} passed`);return f.length}

module.exports={open,close,sampleSeed,check,summary,ROOT,SRC};
