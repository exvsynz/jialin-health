/* 排程提醒的參考實作（docs/specs/phase-A.md 第 3 節）：照 ops/scheduled/*.md 的步驟，對 ArtifactData 測試替身實際執行一次。
   只用於測試，不發布。日期函式直接從 src/index.html 的 date helpers 區塊抽出。
   execute(kind, api) → { entry, msg, delivery, reply, heartbeatWritten }
   run(kind, nowIso, store) 是測試用的簡便寫法：用 store 建立替身後執行。 */
const fs=require('fs'),path=require('path');
const {fakeApi}=require('./fake-artifact-data');
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
const RECENT_MAX=21,WINDOW_DAYS={evening:7,weekly:30},ERR_MSG='提醒檢查失敗：讀不到資料';

const remindOf=(profile,k)=>{const v=profile?.remind?.[k];return typeof v==='boolean'?v:k!=='food'};
const isPaused=(profile,date)=>{const f=profile?.pauseFrom,t=profile?.pauseTo;return !!(f&&t&&date>=f&&date<=t)};
const mdShort=ds=>(+ds.slice(5,7))+'/'+(+ds.slice(8));
const daysFrom=(a,b)=>D.dnum(b)-D.dnum(a);
function inWindow(kind,h,date){if(kind==='morning')return h>=5&&h<=11;if(kind==='evening')return h>=18||h<4;return D.wd(date)==='日'&&h>=18}
function atMs(at){const ms=typeof at==='number'?at:typeof at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(at)?Date.parse(at):NaN;return Number.isFinite(ms)&&Number.isFinite(new Date(ms).getTime())?ms:null}
const tpeIso=ms=>new Date(ms+8*36e5).toISOString().slice(0,19)+'+08:00';

/* 舊心跳的 recent：讀到就先整理，週報計數和寫回都用這一份 */
function normalizeRecent(hb){
  const arr=Array.isArray(hb?.recent)?hb.recent:[];
  return arr.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)&&atMs(x.at)!=null&&KINDS.includes(x.kind)&&typeof x.date==='string'&&/^\d{4}-\d\d-\d\d$/.test(x.date))
    .map(x=>Object.fromEntries(FIELDS.filter(f=>f in x).map(f=>[f,x[f]])));
}
function mergeRecent(entry,old){
  const all=[entry,...old.filter(x=>!(entry.run&&x.run===entry.run))];
  return all.sort((a,b)=>atMs(b.at)-atMs(a.at)).slice(0,RECENT_MAX); // 新的在前；晚完成但較早開始的紀錄排在正確的位置
}
/* 頁面 dueOf 的同一套規則：nextDue → interval 0 待安排 → interval 數字 → 不追蹤的分類 → 設定的固定間隔或預設 */
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
const examPhrase=(x,withWord)=>x.asap?x.name+'待安排':x.dd<0?x.name+'已逾期':x.name+' '+mdShort(x.due)+(withWord?' 到期':'');

async function retry(fn){try{return await fn()}catch(e){return fn()}} // 讀取失敗重試一次
async function readAll(api,op,col,q){const out=[];let cursor;for(let i=0;i<100;i++){const r=await api[op](col,{...q,limit:1000,cursor});out.push(...r.docs.map(d=>d.data));if(!r.next_cursor)return out;cursor=r.next_cursor}throw new Error('too many pages')}

function weeklyLine(data,date,nowMs,recent){
  const start=D.addDays(date,-6),range=[...Array(7)].map((_,i)=>D.addDays(start,i));
  const ws=range.map(d=>data.days[d]?.am?.w).filter(v=>typeof v==='number'&&Number.isFinite(v));
  const wPart=ws.length?'早上平均 '+(Math.round(ws.reduce((a,b)=>a+b,0)/ws.length*10)/10).toFixed(1)+' kg（'+ws.length+' 天）':'早上體重 0 天';
  const active=range.filter(d=>!isPaused(data.profile,d));
  const med=active.filter(d=>data.days[d]?.med).length;
  const ex=data.exercise.filter(e=>e.deleted!==true&&e.date>=start&&e.date<=date).reduce((a,e)=>a+(Number(e.min)||0),0);
  let runs='排程讀不到';
  if(recent){const seen=new Set();for(const r of recent){const ms=atMs(r.at);if((r.kind==='morning'||r.kind==='evening')&&ms>nowMs-7*864e5&&ms<=nowMs)seen.add(r.kind+r.date)}runs='排程 '+seen.size+'/14'}
  let line='週報 '+mdShort(start)+'–'+mdShort(date)+'：'+wPart+'、服藥 '+med+'/'+active.length+' 天、運動 '+ex+' 分、'+runs;
  const exams=examsWithin(data.records,data.intervals,date,WINDOW_DAYS.weekly);
  if(exams.length)line+='；30 天內到期：'+exams.map(x=>examPhrase(x,false)).join('、');
  const le=data.profile?.lastExport,ok=typeof le==='string'&&/^\d{4}\/\d\d\/\d\d$/.test(le);
  if(!ok||daysFrom(le.replace(/\//g,'-'),date)>30)line+='；該備份了';
  return line;
}

async function execute(kind,api){
  /* 1. 時間 */
  const t0=api.now();const {date,h}=clock(t0);
  const entry={run:tpeIso(t0)+'#'+kind+'-'+Math.random().toString(36).slice(2,6),at:tpeIso(t0),kind,date,missing:[],paused:false,ok:true,skipped:null,shouldPush:false,delivery:'none',msg:''};
  /* 2. 讀 settings/profile 與 system/heartbeat */
  let profile=null,hb={ok:false};
  try{const r=await retry(()=>api.get('settings','profile'));profile=r.exists?r.data:{}}catch(e){}
  try{const r=await retry(()=>api.get('system','heartbeat'));hb={ok:true,exists:r.exists,version:r.version,recent:normalizeRecent(r.exists?r.data:null)}}catch(e){}
  /* 3. 跳過的判斷：已知暫停、關閉或太晚，就不再讀其他資料 */
  if(!profile){entry.ok=false;entry.skipped='error';entry.msg=ERR_MSG}
  else if(isPaused(profile,date)){entry.paused=true;entry.skipped='paused'}
  else if(!remindOf(profile,kind))entry.skipped='off';
  else if(!inWindow(kind,h,date))entry.skipped='late';
  else{
    /* 4. 讀其他資料 */
    let data=null;
    try{
      data={profile,days:{},records:[],exercise:[],intervals:{}};
      const dates=kind==='weekly'?[...Array(7)].map((_,i)=>D.addDays(date,i-6)):[date];
      for(const d of dates){const r=await retry(()=>api.get('days',d));if(r.exists)data.days[d]=r.data}
      if(kind!=='morning'){data.records=await retry(()=>readAll(api,'list','records',{}));const iv=await retry(()=>api.get('settings','intervals'));data.intervals=iv.exists?iv.data:{}}
      if(kind==='weekly')data.exercise=await retry(()=>readAll(api,'query','exercise',{where:[['date','>=',dates[0]],['date','<=',date]]}));
    }catch(e){data=null}
    if(!data){entry.ok=false;entry.skipped='error';entry.msg=ERR_MSG}
    /* 5. 組訊息 */
    else if(kind==='weekly')entry.msg=weeklyLine(data,date,t0,hb.ok?hb.recent:null);
    else{
      const d=data.days[date]||{};
      entry.missing=ITEMS.filter(([k])=>CHECK[kind].includes(k)&&!d[k]).map(([,l])=>l); // 和頁面相同：沒有值（不存在、null、false、0、空字串）就是缺
      if(entry.missing.length){
        entry.msg='家琳今天還沒記：'+entry.missing.join('、');
        if(kind==='evening'){const x=examsWithin(data.records,data.intervals,date,WINDOW_DAYS.evening);if(x.length)entry.msg+='；'+x.map(y=>examPhrase(y,true)).join('、')}
      }
    }
  }
  /* 6. 同一天同一種已經送出過，就不再送 */
  if(entry.msg&&hb.ok&&hb.recent.some(x=>x.kind===kind&&x.date===date&&x.shouldPush&&(x.delivery==='tool_sent'||x.delivery==='platform'))){entry.skipped='duplicate';entry.msg='';entry.missing=[]}
  /* 7. 送出前再看一次時間 */
  if(entry.msg&&entry.skipped!=='error'){const t1=api.now(),c=clock(t1);if(c.date!==date||!inWindow(kind,c.h,date)){entry.skipped='late';entry.msg='';entry.missing=[]}}
  if(entry.skipped&&entry.skipped!=='error')entry.missing=[];
  /* 8. 交付 */
  entry.shouldPush=!!entry.msg;
  if(entry.shouldPush){
    if(api.hasPush){try{entry.delivery=(await api.push(entry.msg))==='sent'?'tool_sent':'tool_not_sent'}catch(e){entry.delivery='tool_error'}}
    else entry.delivery='platform';
  }
  /* 9. 寫心跳：讀不到舊心跳就不寫，不用空的 recent 蓋掉不知道內容的文件 */
  let heartbeatWritten=false;
  if(hb.ok){
    let cur=hb;
    for(let attempt=0;attempt<2&&!heartbeatWritten;attempt++){
      if(attempt>0){try{const r=await api.get('system','heartbeat');cur={exists:r.exists,version:r.version,recent:normalizeRecent(r.exists?r.data:null)}}catch(e){break}}
      const recent=mergeRecent(entry,cur.recent);
      try{await api.set('system','heartbeat',{...recent[0],recent},cur.exists?cur.version:undefined);heartbeatWritten=true}catch(e){}
    }
  }
  /* 10. 最終回覆：沒有推播工具時由平台代送，回覆就是那一行 */
  const reply=entry.delivery==='platform'?entry.msg:entry.delivery==='tool_sent'?'（已推播）':entry.shouldPush?'（推播未送出）':'（無需提醒）';
  return{entry,msg:entry.msg,delivery:entry.delivery,reply,heartbeatWritten};
}

/* 測試用：store = { profile, days:{日期:文件}, exercise:[], records:[], intervals, heartbeat, readError, push, ... } */
async function run(kind,nowIso,store={},opt={}){
  const docs={};
  if(store.profile!==undefined)docs['settings/profile']=store.profile;
  if(store.intervals)docs['settings/intervals']=store.intervals;
  if(store.heartbeat)docs['system/heartbeat']=store.heartbeat;
  for(const[d,v]of Object.entries(store.days||{}))docs['days/'+d]=v;
  (store.exercise||[]).forEach((e,i)=>docs['exercise/e'+i]=e);
  (store.records||[]).forEach((r,i)=>docs['records/r'+i]=r);
  const f=fakeApi({docs,times:opt.times||[nowIso],push:opt.push===undefined?null:opt.push,failGet:store.readError?{'settings/profile':9}:opt.failGet||{},failList:opt.failList||{},failSet:opt.failSet||0,beforeSet:opt.beforeSet||null,pageSize:opt.pageSize||1000});
  const out=await execute(kind,f.api);
  return{...out,push:out.msg||null,heartbeat:f.doc('system/heartbeat'),fake:f};
}

module.exports={execute,run,EXAMS,EXAM_NAMES,NO_FOLLOW,dueOf,normalizeRecent,RECENT_MAX};
