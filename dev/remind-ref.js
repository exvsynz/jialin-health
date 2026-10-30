/* 排程提醒規則的參考實作（docs/specs/phase-A.md 第 3 節）。只用於測試，不發布。
   ops/scheduled/*.md 的提示詞照同一套規則寫；dev/prompt-test.js 會比對提示詞裡的範例句和這裡的輸出。
   日期函式直接從 src/index.html 的 date helpers 區塊抽出，不另寫一份。
   用法：run(kind, nowIso, store) → { heartbeat, push, reply }
     store = { profile, days:{日期:文件}, exercise:[文件], records:[文件], heartbeat:舊文件|null, readError:bool } */
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.SRC?path.resolve(process.env.SRC):path.join(__dirname,'../src/index.html'),'utf8');
const m=html.match(/\/\* ---- date helpers: begin[^*]*\*\/([\s\S]*?)\/\* ---- date helpers: end ---- \*\//);
if(!m)throw new Error('找不到 date helpers 區塊標記');
const RealDate=Date;let fake=0;
class FakeDate extends RealDate{constructor(...a){a.length?super(...a):super(fake)}static now(){return fake}}
const D=new Function('Date',m[1]+';return{tpeNow,logicalToday,addDays,addMonths,dnum,wd,pad}')(FakeDate);

const EXAM_NAMES={breast_us:'乳房超音波',breast_mammo:'乳房X光攝影',breast_ct:'乳房電腦斷層',thy_us:'甲狀腺超音波',thy_lab:'甲狀腺抽血',lung_ldct:'低劑量電腦斷層 LDCT',gyn_horm:'生殖軸激素',gi_egd:'上消化道內視鏡（胃鏡）',gi_colo:'大腸鏡'};
const ITEMS=[['am','早上體重'],['med','服藥'],['pm','晚上體重']]; // 固定順序
const CHECK={morning:['am','med'],evening:['am','med','pm']};
const RECENT_MAX=21,WINDOW_DAYS={evening:7,weekly:30};

const remindOf=(profile,k)=>{const v=profile?.remind?.[k];return typeof v==='boolean'?v:k!=='food'};
const isPaused=(profile,date)=>{const f=profile?.pauseFrom,t=profile?.pauseTo;return !!(f&&t&&date>=f&&date<=t)};
const mdShort=ds=>(+ds.slice(5,7))+'/'+(+ds.slice(8));
const daysFrom=(a,b)=>D.dnum(b)-D.dnum(a);
/* 執行時間太晚就不推播：早上 05–11 點；晚上 18–03 點；週報：邏輯日是週日且 18–23 點 */
function inWindow(kind,h,date){
  if(kind==='morning')return h>=5&&h<=11;
  if(kind==='evening')return h>=18||h<4;
  return D.wd(date)==='日'&&h>=18;
}
/* 每種檢查取最新一筆（日期最大；同日取 createdAt 最大），到期日：nextDue → interval 0 需盡快 → date+interval 月 → 不列入 */
function dueOf(r){if(r.nextDue)return{due:r.nextDue};if(r.interval===0)return{asap:true};if(Number.isFinite(r.interval))return{due:D.addMonths(r.date,r.interval)};return null}
function latestByExam(records){const o={};for(const r of records||[]){if(!EXAM_NAMES[r.exam])continue;const c=o[r.exam];if(!c||r.date>c.date||(r.date===c.date&&(r.createdAt||0)>(c.createdAt||0)))o[r.exam]=r}return o}
function examsWithin(records,date,days){
  return Object.values(latestByExam(records)).map(r=>{const d=dueOf(r);if(!d)return null;const dd=d.asap?-Infinity:daysFrom(date,d.due);return{name:EXAM_NAMES[r.exam],due:d.due,asap:!!d.asap,dd}})
    .filter(x=>x&&x.dd<=days).sort((a,b)=>a.dd-b.dd||(a.name<b.name?-1:1));
}
const examPhrase=(x,withWord)=>x.asap?x.name+'需盡快處理':x.dd<0?x.name+'已逾期':x.name+' '+mdShort(x.due)+(withWord?' 到期':'');

function tpeIso(ms){const t=new Date(ms+8*36e5);return t.toISOString().slice(0,19)+'+08:00'}
function atMs(at){const ms=typeof at==='number'?at:typeof at==='string'&&/^\d{4}-\d\d-\d\dT/.test(at)?Date.parse(at):NaN;return Number.isFinite(ms)?ms:null}

function weeklyLine(store,date,nowMs){
  const start=D.addDays(date,-6),range=[...Array(7)].map((_,i)=>D.addDays(start,i));
  const ws=range.map(d=>store.days?.[d]?.am?.w).filter(v=>typeof v==='number');
  const wPart=ws.length?'早上平均 '+(Math.round(ws.reduce((a,b)=>a+b,0)/ws.length*10)/10).toFixed(1)+' kg（'+ws.length+' 天）':'早上體重 0 天';
  const active=range.filter(d=>!isPaused(store.profile,d));
  const med=active.filter(d=>store.days?.[d]?.med).length;
  const ex=(store.exercise||[]).filter(e=>e.deleted!==true&&e.date>=start&&e.date<=date).reduce((a,e)=>a+(Number(e.min)||0),0);
  const seen=new Set();for(const r of store.heartbeat?.recent||[]){const ms=atMs(r.at);if((r.kind==='morning'||r.kind==='evening')&&ms!=null&&ms>nowMs-7*864e5&&ms<=nowMs)seen.add(r.kind+r.date)}
  let line='週報 '+mdShort(start)+'–'+mdShort(date)+'：'+wPart+'、服藥 '+med+'/'+active.length+' 天、運動 '+ex+' 分、排程 '+seen.size+'/14';
  const exams=examsWithin(store.records,date,WINDOW_DAYS.weekly);
  if(exams.length)line+='；30 天內到期：'+exams.map(x=>examPhrase(x,false)).join('、');
  const le=store.profile?.lastExport,ok=typeof le==='string'&&/^\d{4}\/\d\d\/\d\d$/.test(le);
  if(!ok||daysFrom(le.replace(/\//g,'-'),date)>30)line+='；該備份了';
  return line;
}

function run(kind,nowIso,store){
  const nowMs=Date.parse(nowIso);fake=nowMs;
  const date=D.logicalToday(),h=D.tpeNow().h;
  const e={at:tpeIso(nowMs),kind,date,missing:[],paused:false,ok:true,skipped:null,pushed:false,msg:''};
  if(store.readError){e.ok=false;e.skipped='error';e.msg='提醒檢查失敗：讀不到資料'}
  else{
    e.paused=isPaused(store.profile,date);
    if(kind!=='weekly'){const d=store.days?.[date]||{};e.missing=ITEMS.filter(([k])=>CHECK[kind].includes(k)&&!d[k]).map(([,l])=>l)}
    if(e.paused)e.skipped='paused';
    else if(!remindOf(store.profile,kind))e.skipped='off';
    else if(!inWindow(kind,h,date))e.skipped='late';
    else if(kind==='weekly')e.msg=weeklyLine(store,date,nowMs);
    else if(e.missing.length){
      e.msg='家琳今天還沒記：'+e.missing.join('、');
      if(kind==='evening'){const x=examsWithin(store.records,date,WINDOW_DAYS.evening);if(x.length)e.msg+='；'+x.map(y=>examPhrase(y,true)).join('、')}
    }
  }
  if(e.skipped)e.missing=[]; // 規格 2.2：跳過時不記缺漏
  e.pushed=!!e.msg;
  const old=Array.isArray(store.heartbeat?.recent)?store.heartbeat.recent:[];
  const heartbeat={...e,recent:[e,...old].slice(0,RECENT_MAX)};
  return{heartbeat,push:e.msg||null,reply:e.msg||'（無需提醒）'};
}

module.exports={run,EXAM_NAMES,dueOf,examsWithin,RECENT_MAX};
