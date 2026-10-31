/* 排程提醒的參考實作（docs/specs/phase-A.md 第 3 節）：照 ops/scheduled/*.md 的步驟，對 ArtifactData 測試替身實際執行一次。
   只用於測試，不發布。日期函式直接從 src/index.html 的 date helpers 區塊抽出。
   execute(kind, api, mode) → { entry, msg, delivery, reply, heartbeatWritten }；mode 是提示詞開頭的通知管道：'tool' | 'platform' | 'calendar'
   run(kind, nowIso, store, opt) 是測試用的簡便寫法：用 store 建立替身後執行。 */
const fs=require('fs'),path=require('path');
const {fakeApi,URL}=require('./fake-artifact-data');
const html=fs.readFileSync(process.env.SRC?path.resolve(process.env.SRC):path.join(__dirname,'../src/index.html'),'utf8');
const m=html.match(/\/\* ---- date helpers: begin[^*]*\*\/([\s\S]*?)\/\* ---- date helpers: end ---- \*\//);
if(!m)throw new Error('找不到 date helpers 區塊標記');
const RealDate=Date;let fake=0;
class FakeDate extends RealDate{constructor(...a){a.length?super(...a):super(fake)}static now(){return fake}}
const D=new Function('Date',m[1]+';return{tpeNow,logicalToday,addDays,addMonths,dnum,wd}')(FakeDate);
const clock=ms=>{fake=ms;return{date:D.logicalToday(),h:D.tpeNow().h}};

/* 代號、名稱、預設間隔（月）；和 src/index.html 的 EXAMS 一致（測試會比對） */
const EXAMS=[['breast_us','乳房超音波',12],['breast_mammo','乳房X光攝影',24],['breast_ct','乳房電腦斷層',12],['thy_us','甲狀腺超音波',12],['thy_lab','甲狀腺抽血',6],['lung_ldct','低劑量電腦斷層 LDCT',12],['gyn_horm','生殖軸激素',6],['gi_egd','上消化道內視鏡（胃鏡）',24],['gi_colo','大腸鏡',120]];
const EXAM_NAMES=Object.fromEntries(EXAMS.map(([id,n])=>[id,n])),EXAM_DEF=Object.fromEntries(EXAMS.map(([id,,d])=>[id,d]));
const NO_FOLLOW=[['thy_us','none'],['thy_us','vlowSmall']]; // 「不追蹤」的分類
const ITEMS=[['am','早上體重'],['med','服藥'],['pm','晚上體重']];
const CHECK={morning:['am','med'],evening:['am','med','pm']};
const KINDS=['morning','evening','weekly'],FIELDS=['run','at','kind','date','missing','paused','ok','skipped','shouldPush','delivery','msg'];
const SENT_AS=['tool_sent','tool_error','platform','calendar','calendar_error']; // 可能已經送出的結果都算送出：寧可少一則，不重複
/* 日曆模式：在家琳的 Google 日曆（連接器帳號的 primary）建一個活動，開始時用 popup 提醒。2026-10-31 實測手機會響（ops/scheduled/DEPLOYED.md）。 */
const CAL_LEAD_MIN=5,CAL_LEN_MIN=5;
function calendarEvent(msg,ms){const s=Math.floor(ms/6e4)*6e4+CAL_LEAD_MIN*6e4;const f=t=>tpeIso(t).slice(0,19);
  return{calendarId:'primary',summary:msg,startTime:f(s),endTime:f(s+CAL_LEN_MIN*6e4),timeZone:'Asia/Taipei',overrideReminders:[{method:'popup',minutes:0}],availability:'AVAILABILITY_FREE',notificationLevel:'NONE',description:'打開 '+URL+' 記錄'}}
const PUSH_REQUESTED='Mobile push requested.'; // 正式排程的 PushNotification 回傳這句，手機收得到（ops/scheduled/DEPLOYED.md 一次性測試）
const RECENT_MAX=21,SENT_DAYS=7,WINDOW_DAYS={evening:7,weekly:30},ERR_MSG='提醒檢查失敗：讀不到資料';

const remindOf=(profile,k)=>{const v=profile?.remind?.[k];return typeof v==='boolean'?v:k!=='food'};
/* 有飲食紀錄：meals 裡至少一個物件，at 是數字，而且沒有刪除（估算中、估算失敗的都算；沒有 at 的殘缺項目不算） */
const hasFood=d=>{const ms=d&&d.meals;return!!ms&&typeof ms==='object'&&Object.values(ms).some(m=>m&&typeof m==='object'&&typeof m.at==='number'&&Number.isFinite(m.at)&&m.deleted!==true)};
const isPaused=(profile,date)=>{const f=profile?.pauseFrom,t=profile?.pauseTo;return !!(f&&t&&date>=f&&date<=t)};
const mdShort=ds=>(+ds.slice(5,7))+'/'+(+ds.slice(8));
const daysFrom=(a,b)=>D.dnum(b)-D.dnum(a);
function inWindow(kind,h,date){if(kind==='morning')return h>=5&&h<=11;if(kind==='evening')return h>=18||h<4;return D.wd(date)==='日'&&h>=18}
function atMs(at){const ms=typeof at==='number'?at:typeof at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(at)?Date.parse(at):NaN;return Number.isFinite(ms)&&Number.isFinite(new Date(ms).getTime())?ms:null}
const tpeIso=ms=>new Date(ms+8*36e5).toISOString().slice(0,19)+'+08:00';
const rand4=()=>Math.random().toString(36).slice(2).padEnd(4,'0').slice(0,4);
const sentKey=(kind,date,cls)=>kind+'|'+date+'|'+cls;

/* 舊心跳：讀到就先整理 recent 與 sent，後面都用整理後的結果 */
function normalizeRecent(hb){
  const arr=Array.isArray(hb?.recent)?hb.recent:[];
  return arr.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)&&atMs(x.at)!=null&&KINDS.includes(x.kind)&&typeof x.date==='string'&&/^\d{4}-\d\d-\d\d$/.test(x.date))
    .map(x=>Object.fromEntries(FIELDS.filter(f=>f in x).map(f=>[f,x[f]])));
}
function normalizeSent(hb,today){
  const o=hb?.sent,out={};if(!o||typeof o!=='object'||Array.isArray(o))return out;
  const oldest=D.addDays(today,-(SENT_DAYS-1)); // 今天與前 6 天，共 7 個日期；未來的日期不留
  for(const[k,v]of Object.entries(o)){const p=k.split('|');
    if(p.length===3&&KINDS.includes(p[0])&&/^\d{4}-\d\d-\d\d$/.test(p[1])&&['remind','error'].includes(p[2])&&p[1]>=oldest&&p[1]<=today
      &&v&&typeof v==='object'&&!Array.isArray(v)&&typeof v.run==='string'&&v.run&&atMs(v.at)!=null&&SENT_AS.includes(v.delivery)) // 只有看起來真的送出過的紀錄才算
      out[k]={run:v.run,at:v.at,delivery:v.delivery}}
  return out;
}
function mergeRecent(entry,old){
  const all=[entry,...old.filter(x=>!(entry.run&&x.run===entry.run))];
  return all.sort((a,b)=>atMs(b.at)-atMs(a.at)).slice(0,RECENT_MAX);
}
/* 頁面 dueOf 的同一套規則 */
function dueOf(r,intervals={}){
  if(r.nextDue)return{due:r.nextDue};
  if(r.interval===0)return{asap:true};
  if(!Number.isFinite(r.interval)&&NO_FOLLOW.some(([e,p])=>e===r.exam&&p===r.preset))return null;
  const mo=Number.isFinite(r.interval)?r.interval:Number.isFinite(intervals?.[r.exam])?intervals[r.exam]:EXAM_DEF[r.exam];
  return{due:D.addMonths(r.date,mo)};
}
function latestByExam(records){const o={};for(const r of records||[]){if(!EXAM_NAMES[r.exam])continue;const c=o[r.exam];if(!c||r.date>c.date||(r.date===c.date&&(r.createdAt||0)>(c.createdAt||0)))o[r.exam]=r}return o}
function examsWithin(records,intervals,date,days){
  return Object.values(latestByExam(records)).map(r=>{const d=dueOf(r,intervals);if(!d)return null;const dd=d.asap?-Infinity:daysFrom(date,d.due);return{name:EXAM_NAMES[r.exam],due:d.due,asap:!!d.asap,dd}})
    .filter(x=>x&&x.dd<=days).sort((a,b)=>a.dd-b.dd||(a.name<b.name?-1:1));
}
/* TSH 複查（B 階段 3.4，和頁面 recheckState 同一套規則）：最新一筆生效的劑量或製劑變更，沒有明確連結的完成抽血，就依手動日期或週數排出到期日 */
const RECHECK_NAME='TSH 複查（劑量變更後）';
const validDate=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&D.addDays(s,0)===s;
const validDose=v=>typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=1000;
const cmpS=(a,b)=>a<b?-1:a>b?1:0;
function recheckDue(meddose,records,date,weeks){
  const list=(meddose||[]).filter(m=>m&&m.deleted!==true&&validDate(m.date)&&validDose(m.dose)).sort((a,b)=>cmpS(a.date,b.date)||((a.createdAt||0)-(b.createdAt||0))||cmpS(String(a.id),String(b.id)));
  let t=null;for(const m of list){if(m.date<=date)t=m;else break}
  if(!t||t.noRecheck===true)return null;
  const done=(records||[]).some(r=>r.exam==='thy_lab'&&r.drawCtx?.recheckOf===t.id&&validDate(r.date)&&r.date>t.date&&r.date<=date&&typeof r.labs?.TSH==='string'&&/\d/.test(r.labs.TSH));
  if(done)return null;
  if(validDate(t.recheckDue))return t.recheckDue;
  if(Number.isInteger(weeks)&&weeks>=1&&weeks<=52)return D.addDays(t.date,weeks*7);
  return null}
function dueItems(data,date,days){
  const x=examsWithin(data.records,data.intervals,date,days);
  const due=recheckDue(data.meddose,data.records,date,data.profile?.tshRecheckWeeks);
  if(due){const dd=daysFrom(date,due);if(dd<=days)x.push({name:RECHECK_NAME,due,asap:false,dd})}
  return x.sort((a,b)=>a.dd-b.dd||(a.name<b.name?-1:1))}
const examPhrase=(x,withWord)=>x.asap?x.name+'待安排':x.dd<0?x.name+'已逾期':x.name+' '+mdShort(x.due)+(withWord?' 到期':'');

/* ArtifactData 呼叫，參數照工具的形狀 */
const T={
  get:(api,collection,doc_id)=>api.call({action:'get',url:URL,collection,doc_id}),
  set:(api,collection,doc_id,data,if_version)=>api.call({action:'set',url:URL,collection,doc_id,data,...(if_version!=null?{if_version}:{})}),
  async all(api,action,collection,where,withId){const out=[];let cursor;for(let i=0;i<100;i++){const q={limit:1000,...(where?{where}:{}),...(cursor?{cursor}:{})};const r=await api.call({action,url:URL,collection,query:q});out.push(...r.docs.map(d=>withId?{...d.data,id:d.id}:d.data));if(!r.next_cursor)return out;cursor=r.next_cursor}throw new Error('too many pages')},
};
async function retry(fn){try{return await fn()}catch(e){return fn()}} // 讀取失敗重試一次

function weeklyLine(data,date,nowMs,recent){
  const start=D.addDays(date,-6),range=[...Array(7)].map((_,i)=>D.addDays(start,i));
  const ws=range.map(d=>data.days[d]?.am?.w).filter(v=>typeof v==='number'&&Number.isFinite(v));
  const wPart=ws.length?'早上平均 '+(Math.round(ws.reduce((a,b)=>a+b,0)/ws.length*10)/10).toFixed(1)+' kg（'+ws.length+' 天）':'早上體重 0 天';
  /* 服藥天數和頁面 countable() 同一套規則：追蹤起點之前不算、暫停日不算、今天還沒服藥先不算 */
  const has=d=>!!(d&&(d.am||d.pm||d.med?.taken===true));
  const trackFrom=data.preStart||range.find(d=>has(data.days[d]))||null;
  let a=0,b=0;for(const d of range){if(!trackFrom||d<trackFrom||isPaused(data.profile,d))continue;const t=data.days[d]?.med?.taken===true;if(d===date&&!t)continue;b++;if(t)a++}
  const ex=data.exercise.filter(e=>e.deleted!==true&&e.date>=start&&e.date<=date).reduce((a,e)=>a+(Number(e.min)||0),0);
  let runs='排程讀不到';
  if(recent){const seen=new Set();for(const r of recent){const ms=atMs(r.at);if((r.kind==='morning'||r.kind==='evening')&&ms>nowMs-7*864e5&&ms<=nowMs)seen.add(r.kind+r.date)}runs='排程 '+seen.size+'/14'}
  let line='週報 '+mdShort(start)+'–'+mdShort(date)+'：'+wPart+'、'+(b?'服藥 '+a+'/'+b+' 天':'服藥還沒有紀錄')+'、運動 '+ex+' 分、'+runs;
  const exams=dueItems(data,date,WINDOW_DAYS.weekly);
  if(exams.length)line+='；30 天內到期：'+exams.map(x=>examPhrase(x,false)).join('、');
  const le=data.profile?.lastExport,ok=typeof le==='string'&&/^\d{4}\/\d\d\/\d\d$/.test(le);
  if(!ok||daysFrom(le.replace(/\//g,'-'),date)>30)line+='；該備份了';
  return line;
}

/* 新的心跳文件：recent 合併排序、sent 合併；頂層是最新那一筆 */
function buildDoc(entry,cur,cls){
  const recent=mergeRecent(entry,cur.recent);
  const sent={...cur.sent};const key=sentKey(entry.kind,entry.date,cls);
  if(SENT_AS.includes(entry.delivery))sent[key]={run:entry.run,at:entry.at,delivery:entry.delivery};
  else if(sent[key]?.run===entry.run)delete sent[key]; // 這次的送出被撤回（平台模式最後檢查太晚）
  return{...recent[0],recent,sent};
}
async function writeHeartbeat(api,entry,cur,cls,date){
  let c=cur;
  for(let attempt=0;attempt<2;attempt++){
    if(attempt>0){try{const r=await T.get(api,'system','heartbeat');c={exists:r.exists,version:r.version,recent:normalizeRecent(r.exists?r.data:null),sent:normalizeSent(r.exists?r.data:null,date)}}catch(e){return null}}
    const doc=buildDoc(entry,c,cls);
    try{const r=await T.set(api,'system','heartbeat',doc,c.exists?c.version:undefined);return{version:r.version,recent:doc.recent,sent:doc.sent}}catch(e){}
  }
  return null;
}

async function execute(kind,api,mode){
  if(!['tool','platform','calendar'].includes(mode))throw new Error('通知管道要是 tool、platform 或 calendar');
  /* 1. 時間與初始紀錄 */
  const t0=api.now();const {date,h}=clock(t0);const at=tpeIso(t0);
  const entry={run:at+'#'+kind+'-'+rand4(),at,kind,date,missing:[],paused:false,ok:true,skipped:null,shouldPush:false,delivery:'none',msg:''};
  /* 2. 讀 settings/profile 與 system/heartbeat */
  let profile=null,hb={ok:false};
  try{const r=await retry(()=>T.get(api,'settings','profile'));profile=r.exists?r.data:{}}catch(e){}
  try{const r=await retry(()=>T.get(api,'system','heartbeat'));hb={ok:true,exists:r.exists,version:r.version,recent:normalizeRecent(r.exists?r.data:null),sent:normalizeSent(r.exists?r.data:null,date)}}catch(e){}
  /* 3. 跳過：時間（不需要 profile）→ profile 讀不到 → 暫停 → 關閉 */
  if(!inWindow(kind,h,date)){entry.skipped='late';if(!profile)entry.ok=false}
  else if(!profile){entry.ok=false;entry.skipped='error';entry.msg=ERR_MSG}
  else if(isPaused(profile,date)){entry.paused=true;entry.skipped='paused'}
  else if(!remindOf(profile,kind))entry.skipped='off';
  else{
    /* 4. 讀其他資料，組訊息 */
    let data=null;
    try{
      data={profile,days:{},records:[],exercise:[],intervals:{},meddose:[]};
      const dates=kind==='weekly'?[...Array(7)].map((_,i)=>D.addDays(date,i-6)):[date];
      for(const d of dates){const r=await retry(()=>T.get(api,'days',d));if(r.exists)data.days[d]=r.data}
      if(kind!=='morning'){data.records=await retry(()=>T.all(api,'list','records'));const iv=await retry(()=>T.get(api,'settings','intervals'));data.intervals=iv.exists?iv.data:{};
        data.meddose=await retry(()=>T.all(api,'list','meddose',null,true))} // 文件 id 要留著：抽血紀錄用 id 連結到變更
      if(kind==='weekly'){data.exercise=await retry(()=>T.all(api,'query','exercise',[['date','>=',dates[0]],['date','<=',date]]));
        /* 追蹤起點：本週一之前最早的 31 筆日紀錄裡，第一天有體重或服藥的日子 */
        const pre=await retry(()=>api.call({action:'query',url:URL,collection:'days',query:{where:[['date','<',dates[0]]],order_by:{field:'date',direction:'asc'},limit:31}}));
        data.preStart=(pre.docs||[]).map(d=>({...d.data,id:d.id})).find(d=>d.am||d.pm||d.med?.taken===true)?.id||null}
    }catch(e){data=null}
    if(!data){entry.ok=false;entry.skipped='error';entry.msg=ERR_MSG}
    else if(kind==='weekly')entry.msg=weeklyLine(data,date,t0,hb.ok?hb.recent:null);
    else{
      const d=data.days[date]||{};
      entry.missing=ITEMS.filter(([k])=>CHECK[kind].includes(k)&&(k==='med'?d.med?.taken!==true:!d[k])).map(([,l])=>l); // 和頁面相同：服藥看 med.taken；體重沒有值就是缺
      if(kind==='evening'&&remindOf(profile,'food')&&!hasFood(d))entry.missing.push('飲食'); // C 階段：飲食提醒開啟時才看，排在最後
      if(entry.missing.length){
        entry.msg='家琳今天還沒記：'+entry.missing.join('、');
        if(kind==='evening'){const x=dueItems(data,date,WINDOW_DAYS.evening);if(x.length)entry.msg+='；'+x.map(y=>examPhrase(y,true)).join('、')}
      }
    }
  }
  const cls=entry.skipped==='error'?'error':'remind';
  const clear=reason=>{entry.skipped=reason;entry.msg='';entry.missing=[]};
  /* 5. 送出前：重複 → 再看一次時間 → 交付 */
  if(entry.msg&&hb.ok&&hb.sent[sentKey(kind,date,cls)])clear('duplicate');
  let tCheck=null;
  if(entry.msg){tCheck=api.now();const c=clock(tCheck);if(c.date!==date||!inWindow(kind,c.h,date))clear('late')}
  if(entry.msg){
    if(mode==='platform')entry.delivery='platform';
    else if(mode==='calendar'){if(!api.hasCalendar)entry.delivery='calendar_missing';
      else{try{const res=await api.createEvent(calendarEvent(entry.msg,tCheck));entry.delivery=res&&typeof res.id==='string'&&res.id?'calendar':res==='not_created'?'calendar_not_sent':'calendar_error'}catch(e){entry.delivery='calendar_error'}}} // 開始時間用第 2 小步取的時間
    else if(!api.hasPush)entry.delivery='tool_missing';
    else{try{const res=await api.push(entry.msg);entry.delivery=res==='sent'||res===PUSH_REQUESTED?'tool_sent':res==='not_sent'?'tool_not_sent':'tool_error'}catch(e){entry.delivery='tool_error'}} // 只有明確沒送出才是 not_sent；看不出結果算可能已送出
  }
  entry.shouldPush=!!entry.msg;
  /* 6. 寫心跳：讀不到舊心跳就不寫 */
  const written=hb.ok?await writeHeartbeat(api,entry,hb,cls,date):null;
  /* 7. 平台模式：最終回覆前再看一次時間；太晚就撤回，並把心跳改正一次 */
  if(entry.delivery==='platform'){const c=clock(api.now());if(c.date!==date||!inWindow(kind,c.h,date)){
    clear('late');entry.shouldPush=false;entry.delivery='none';
    if(written){const doc=buildDoc(entry,{exists:true,version:written.version,recent:written.recent,sent:written.sent},cls);try{await T.set(api,'system','heartbeat',doc,written.version)}catch(e){}}
  }}
  /* 8. 最終回覆 */
  const reply={calendar:'（已建日曆提醒）',calendar_not_sent:'（日曆提醒未建立）',calendar_missing:'（日曆提醒未建立）',calendar_error:'（日曆提醒結果未確認）',platform:entry.msg,tool_sent:'（已推播）',tool_not_sent:'（推播未送出）',tool_missing:'（推播未送出）',tool_error:'（推播結果未確認）',none:'（無需提醒）'}[entry.delivery];
  return{entry,msg:entry.msg,delivery:entry.delivery,reply,heartbeatWritten:!!written};
}

/* 測試用：store = { profile, days:{日期:文件}, exercise:[], records:[], intervals, heartbeat, readError }；
   opt.mode 預設：有指定 push 就是 'tool'，否則 'platform'。替身記到任何參數不合工具 schema 的呼叫就丟錯。 */
function storeDocs(store){
  const docs={};
  if(store.profile!==undefined)docs['settings/profile']=store.profile;
  if(store.intervals)docs['settings/intervals']=store.intervals;
  if(store.heartbeat)docs['system/heartbeat']=store.heartbeat;
  for(const[d,v]of Object.entries(store.days||{}))docs['days/'+d]=v;
  (store.exercise||[]).forEach((e,i)=>docs['exercise/e'+i]=e);
  (store.records||[]).forEach((r,i)=>docs['records/r'+i]=r);
  (store.meddose||[]).forEach((m,i)=>docs['meddose/'+(m.id||'m'+i)]=m);
  return docs;
}
async function run(kind,nowIso,store={},opt={}){
  const f=opt.fake||fakeApi({docs:storeDocs(store),times:opt.times||[nowIso],push:opt.push===undefined?null:opt.push,calendar:opt.calendar===undefined?null:opt.calendar,failGet:store.readError?{'settings/profile':9}:opt.failGet||{},failList:opt.failList||{},failSet:opt.failSet||0,failSetAfterCommit:opt.failSetAfterCommit||0,beforeSet:opt.beforeSet||null,pageSize:opt.pageSize||1000});
  const mode=opt.mode||(opt.calendar!==undefined?'calendar':opt.push!==undefined?'tool':'platform');
  const out=await execute(kind,f.api,mode);
  if(f.contractErrors.length)throw new Error('ArtifactData 參數不合 schema：'+f.contractErrors.join('；'));
  return{...out,push:out.msg||null,heartbeat:f.doc('system/heartbeat'),fake:f};
}

module.exports={calendarEvent,execute,run,storeDocs,EXAMS,EXAM_NAMES,NO_FOLLOW,dueOf,recheckDue,normalizeRecent,normalizeSent,RECENT_MAX};
