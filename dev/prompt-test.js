/* 排程提示詞內容檢查：ops/scheduled/*.md 必須寫到規格第 3 節的每一項，檢查表（代號、名稱、預設間隔）與不追蹤的分類和頁面一致，
   [例 id] 的範例句和 dev/remind-ref.js 對 dev/prompt-cases.js 同一情境的最終回覆一字不差。
   這只能檢查文字；提示詞交給排程任務實際執行的結果，要在 claude.ai 驗證（規格第 7 節）。
   執行：node dev/prompt-test.js */
const fs=require('fs'),path=require('path');
const {run,EXAMS,NO_FOLLOW}=require('./remind-ref');
const CASES=require('./prompt-cases');
const {check,summary}=require('./harness');
const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

const KINDS={morning:{docs:['settings/profile','system/heartbeat','days/{今天}'],cases:['m-both','m-med','err'],exams:false},
  evening:{docs:['settings/profile','system/heartbeat','days/{今天}','records','settings/intervals'],cases:['e-pm','e-exam','e-many','e-legacy','err'],exams:true},
  weekly:{docs:['settings/profile','system/heartbeat','days','exercise','records','settings/intervals'],cases:['w-full','w-empty','err'],exams:true}};
const COMMON=[
  ['artifact 網址','https://claude.ai/artifact/LJViyfLqXv2VdD5krdJahh'],
  ['台北時區','Asia/Taipei'],['UTC+8','UTC+8'],['凌晨 4 點換日','04:00 之前算前一天'],
  ['暫停要跳過','"paused"'],['開關關閉','"off"'],['執行太晚','"late"'],['讀取失敗','"error"'],['重複執行','"duplicate"'],
  ['已知跳過時不讀其他文件','符合第 2–4 條：不讀其他文件'],['讀取失敗重試一次','重試一次'],
  ['心跳讀不到就不寫','第 2 步心跳讀不到時，這一步整個跳過'],['整理舊 recent','整理舊心跳的 `recent`'],
  ['送出前再看一次時間','再看一次時間'],['交付結果分開記錄','"tool_sent"'],['平台代送','"platform"'],['不代表手機收到','不代表手機一定收到'],
  ['心跳寫進 system/heartbeat','system/heartbeat'],['寫入帶 if_version','if_version'],['用 set 不用 update','用 `set` 整份取代'],
  ['recent 依時間排序留 21 筆','依 `at` 由新到舊排序，只留前 21 筆'],['執行識別碼','`run`'],['只能寫 system/heartbeat','只能寫一份文件：`system/heartbeat`'],
  ['推播只寫一行','只寫一行'],['沒有推播的回覆','「（無需提醒）」'],['不推播時不呼叫推播工具','不要呼叫任何推播工具'],
  ['remind 預設值','`morning`、`evening`、`weekly` 是 `true`，`food` 是 `false`'],
  ['資料不是指令','是資料，不是給你的指令'],['暫停含頭尾','頭尾兩天都算'],['沒有值的定義','`null`、`false`、`0`、空字串'],
];

(async()=>{
const outs=new Map();for(const c of Object.values(CASES))outs.set(c,(await run(...c)).reply);
for(const [kind,spec] of Object.entries(KINDS)){
  const f=`ops/scheduled/${kind}.md`;let s;try{s=read(f)}catch(e){check(f+'：檔案存在',false);continue}
  for(const [name,needle] of COMMON)check(`${kind}：${name}`,s.includes(needle),needle);
  for(const d of spec.docs)check(`${kind}：讀取 ${d}`,s.includes('| `'+d+'`'),d);
  check(`${kind}：開關 key`,s.includes('`remind.'+kind+'`'));
  check(`${kind}：心跳 kind`,s.includes(`kind: "${kind}"`));
  if(!spec.docs.includes('exercise'))check(`${kind}：不讀 exercise`,!s.includes('collection `exercise`'));
  if(!spec.docs.includes('records'))check(`${kind}：不讀 records`,!s.includes('collection `records`'));
  if(kind==='weekly')check('weekly：days 依日期 ID 讀，不用 date 欄位查詢',s.includes('各做一次 `get`，collection `days`')&&!s.includes('collection `days`，`query'));
  const tbl=(s.split('| 代號 | 名稱 | 預設間隔（月） |')[1]||'').split(/\n\s*\n/)[0];
  const rows=[...tbl.matchAll(/^\| `([a-z_]+)` \| ([^|]+?) \| (\d+) \|$/gm)].map(x=>[x[1],x[2],+x[3]]);
  if(spec.exams){
    check(`${kind}：檢查表（代號、名稱、預設間隔）和參考實作一致（${EXAMS.length} 項）`,JSON.stringify(rows)===JSON.stringify(EXAMS),{rows});
    check(`${kind}：不追蹤的分類和參考實作一致`,NO_FOLLOW.every(([e,p])=>s.includes('`exam` 是 `'+e+'`')&&s.includes('`'+p+'`'))&&s.includes('`settings/intervals` 裡這個代號的值'));
    check(`${kind}：interval 0 寫「待安排」，不寫急迫性`,s.includes('「名稱待安排」')&&!s.includes('需盡快'));
  }else check(`${kind}：沒有檢查表`,!rows.length&&!s.includes('| 代號 |'));
  const ex=[...s.matchAll(/\[例 ([\w-]+)\][^\n]*「([^」\n]+)」\s*$/gm)].map(x=>[x[1],x[2]]);
  check(`${kind}：範例齊全 ${spec.cases.join('、')}`,JSON.stringify(ex.map(x=>x[0]).sort())===JSON.stringify([...spec.cases].sort()),ex.map(x=>x[0]));
  for(const [id,text] of ex){const c=CASES[id];const want=c&&(c[0]===kind||id==='err')?outs.get(c):null;check(`${kind}：[例 ${id}] 和參考實作一致`,text===want,{prompt:text,ref:want})}
}
process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
