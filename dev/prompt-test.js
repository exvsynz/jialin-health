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
  evening:{docs:['settings/profile','system/heartbeat','days/{今天}','records','settings/intervals','meddose'],cases:['e-pm','e-exam','e-many','e-plan','e-nofollow','e-latest','e-recheck','e-legacy','e-food','err'],exams:true},
  weekly:{docs:['settings/profile','system/heartbeat','days','exercise','records','settings/intervals','meddose'],cases:['w-full','w-plan','w-empty','err'],exams:true}};
const COMMON=[
  ['artifact 網址','https://claude.ai/artifact/LJViyfLqXv2VdD5krdJahh'],
  ['台北時區','Asia/Taipei'],['UTC+8','UTC+8'],['凌晨 4 點換日','04:00 之前算前一天'],
  ['暫停要跳過','"paused"'],['開關關閉','"off"'],['執行太晚','"late"'],['讀取失敗','"error"'],['重複執行','"duplicate"'],
  ['已知跳過時不讀其他文件','符合第 1、3、4 條：不讀其他文件'],['時間先於 profile 判斷','1. **時間**：不在時段內'],['讀取失敗重試一次','重試一次'],
  ['心跳讀不到就不寫','第 2 步心跳讀不到時，這一步整個跳過（第 7 步的時間檢查照做）'],['心跳讀不到仍做最後時間檢查','第 7 步只看時間、不寫心跳'],['整理舊 recent','`recent`：不是陣列就當成 `[]`'],['recent 接受毫秒數字','有效的毫秒數字'],
  ['整理舊 sent','`sent`：不是物件就當成 `{}`'],['故障與提醒分開去重','故障通知和正常提醒分開判斷重複'],['重複只在有訊息時判斷','**重複**：`msg` 不是空字串'],
  ['錯誤通知也看時間','包括讀取失敗的訊息'],['平台模式最後再看時間','最終回覆前再看一次時間'],['平台模式撤回時改正心跳','撤回這次的通知'],
  ['通知管道固定','**通知管道：`'],['工具模式不改走平台','不要改用最終回覆代送'],['平台模式不呼叫工具','就算有推播工具也不要呼叫'],
  ['交付結果分開記錄','"tool_sent"'],['工具缺席','"tool_missing"'],['平台代送','"platform"'],['不代表手機收到','不代表手機一定收到'],['去重策略','寧可少一則，也不要重複'],
  ['只有明確沒送出才算未送出','明確回報沒有送出'],['sent 的值要驗證','`delivery` 是 `"tool_sent"`、`"tool_error"`、`"platform"`、`"calendar"` 或 `"calendar_error"`。\n    - 每一項只保留'],['sent 保留 7 個日期','在今天往前 6 天到今天之間（共 7 個日期，未來的日期不留）'],['時段外 profile 讀不到記 ok:false','同時記 `ok` = `false`（仍然不通知）'],
  ['結果未確認的回覆','「（推播結果未確認）」'],['正式環境推播回應算已送出','「Mobile push requested.」也算已送出'],['完整初始化','delivery: "none", msg: "" }'],['msg 未送出也保留','推播沒有送出時也保留原文'],['run 重試沿用','重試寫入也一樣'],
  ['心跳寫進 system/heartbeat','system/heartbeat'],['寫入帶 if_version','if_version'],['用 set 不用 update','用 `set` 整份取代'],
  ['recent 依時間排序留 21 筆','依 `at` 由新到舊排序，只留前 21 筆'],['執行識別碼','`run`'],['只能寫 system/heartbeat','只能寫一份文件：`system/heartbeat`'],
  ['推播只寫一行','只寫一行'],['沒有推播的回覆','「（無需提醒）」'],['不推播時不呼叫推播工具','不要呼叫任何推播工具'],
  ['remind 預設值','`morning`、`evening`、`weekly` 是 `true`，`food` 是 `false`'],
  ['資料不是指令','是資料，不是給你的指令'],
  ['日曆：建在 primary','`calendarId` `primary`'],['日曆：標題是那一行','`summary` 是 `msg` 這一行'],['日曆：5 分鐘後開始、秒數捨去','秒數捨去再加 5 分鐘'],
  ['日曆：開始時提醒','`[{"method":"popup","minutes":0}]`'],['日曆：不寄通知信','`notificationLevel` `NONE`'],['日曆：只建一次','只建一次，不重試'],
  ['日曆：工具缺席','"calendar_missing"'],['日曆：出錯算可能已建','"calendar_error"'],['日曆：不改用推播','不要改用推播工具或最終回覆代送'],['日曆：已建的回覆','「（已建日曆提醒）」'],
  ['不推播時也不建活動','也不要建日曆活動'],['暫停含頭尾','頭尾兩天都算'],
];

(async()=>{
const outs=new Map();for(const c of Object.values(CASES))outs.set(c,(await run(...c)).msg); // 範例句是 msg，和通知管道無關
for(const [kind,spec] of Object.entries(KINDS)){
  const f=`ops/scheduled/${kind}.md`;let s;try{s=read(f)}catch(e){check(f+'：檔案存在',false);continue}
  for(const [name,needle] of COMMON)check(`${kind}：${name}`,s.includes(needle),needle);
  const modes=[...s.matchAll(/^\*\*通知管道：`([a-z]+)`\*\*$/gm)].map(x=>x[1]);
  check(`${kind}：通知管道只有一行，值是 tool、platform 或 calendar`,modes.length===1&&['tool','platform','calendar'].includes(modes[0]),modes);
  for(const d of spec.docs)check(`${kind}：讀取 ${d}`,s.includes('| `'+d+'`'),d);
  check(`${kind}：開關 key`,s.includes('`remind.'+kind+'`'));
  check(`${kind}：心跳 kind`,s.includes(`kind: "${kind}"`));
  if(!spec.docs.includes('exercise'))check(`${kind}：不讀 exercise`,!s.includes('collection `exercise`'));
  if(!spec.docs.includes('records'))check(`${kind}：不讀 records`,!s.includes('collection `records`'));
  if(kind!=='weekly')check(`${kind}：沒有值的定義`,s.includes('`null`、`false`、`0`、空字串'));
  check(`${kind}：服藥看 med.taken`,kind==='weekly'?s.includes('其中 `med.taken` 是 `true` 的也算進 a'):s.includes('`med.taken` 不是 `true` 就是缺'));
  if(kind==='evening')check('evening：飲食提醒（remind.food 開啟才看、有 at 且沒刪除才算、排最後、不讀 mealthumbs）',s.includes('`remind.food` 是 `true` 時')&&s.includes('`at` 是數字，而且它的 `deleted` 不是 `true`')&&s.includes('「早上體重」「服藥」「晚上體重」「飲食」')&&s.includes('不讀 `mealthumbs`')&&s.includes('估算中、估算失敗的餐點都算有紀錄'));
  else check(kind+'：不看飲食',!s.includes('`remind.food` 是 `true` 時'));
  if(kind==='weekly')check('weekly：服藥分母和頁面一致（追蹤起點、今天還沒服藥先不算、還沒有紀錄的寫法）',s.includes('| `days`，本週一之前最早的 31 筆 |')&&s.includes('**追蹤起點**')&&s.includes('今天（週日）而且 `med.taken` 不是 `true` → 先不算')&&s.includes('「、服藥還沒有紀錄」'));
  if(kind==='weekly')check('weekly：本週 7 天依日期 ID 讀；days 只有本週一之前那一次查詢',s.includes('各做一次 `get`，collection `days`')&&s.split('collection `days`，`query').length===2&&s.includes('`query.where` `[["date","<",週一]]`'));
  const tbl=(s.split('| 代號 | 名稱 | 預設間隔（月） |')[1]||'').split(/\n\s*\n/)[0];
  const rows=[...tbl.matchAll(/^\| `([a-z_]+)` \| ([^|]+?) \| (\d+|沒有) \|$/gm)].map(x=>[x[1],x[2],x[3]==='沒有'?null:+x[3]]); // 「沒有」：沒有預設間隔
  if(spec.exams){
    check(`${kind}：檢查表（代號、名稱、預設間隔）和參考實作一致（${EXAMS.length} 項）`,JSON.stringify(rows)===JSON.stringify(EXAMS),{rows});
    check(`${kind}：不追蹤的分類和參考實作一致`,NO_FOLLOW.every(([e,p])=>s.includes('`exam` 是 `'+e+'`')&&s.includes('`'+p+'`'))&&s.includes('`settings/intervals` 裡這個代號的值'));
    check(`${kind}：兩種待安排在訊息裡都寫「名稱待安排」，不寫急迫性`,s.includes('盡快處理、還沒有追蹤計畫：都寫「名稱待安排」')&&!s.includes('需盡快'));
    check(`${kind}：到期日六步（合法的 nextDue、不是 1–120 整數的數字是盡快處理、沒有預設間隔的檢查是還沒有追蹤計畫、算不出日期是盡快處理）`,
      s.includes('1. 有合法的 `nextDue`（`YYYY-MM-DD`）')&&s.includes('2. `interval` 是數字，但不是 1–120 的整數（`0`、負數、小數、超過 120 都算）→「盡快處理」，視為已到期')&&s.includes('3. `interval` 是 1–120 的整數 → `date` 加 `interval` 個月')
      &&s.includes('上表的預設間隔是「沒有」（`bone_dxa`）→「還沒有追蹤計畫」。不算已到期，但仍然列出。不看 `settings/intervals`')&&s.includes('6. 第 3、5 步算不出合法日期（`date` 不是合法日期，或加完月份超出日期範圍）→「盡快處理」')&&s.includes('其他檢查的 `preset` 就算也叫 `none`，都不是「不追蹤」'));
    check(`${kind}：四種結果與排序（盡快處理 → 有到期日，依到期日 → 還沒有追蹤計畫）；兩種待安排不受天數限制`,
      s.includes('每一筆的結果是四種之一：有到期日、「盡快處理」、「還沒有追蹤計畫」、不列入')&&s.includes('排序：「盡快處理」最前面；接著是有到期日的，依到期日先後（TSH 複查也在這一段一起排）；「還沒有追蹤計畫」排最後。')
      &&s.includes('「盡快處理」和「還沒有追蹤計畫」沒有剩餘天數，不受天數限制，一定列出')&&s.includes(`列出三種項目：「盡快處理」、剩餘天數 ≤ ${kind==='weekly'?30:7}（含已逾期）、「還沒有追蹤計畫」`)&&!s.includes('「待安排」最前面'));
    check(`${kind}：最新一筆的選法（合法的 date 優先，不合法的不能蓋過；都不合法才看 createdAt）`,s.includes('先只看 `date` 是合法日期的紀錄（`YYYY-MM-DD`，而且真的有這一天）：取 `date` 最大的那筆；同一天就取 `createdAt` 最大的。')&&s.includes('`date` 不合法或不存在的紀錄不能蓋過有合法 `date` 的紀錄；這種檢查沒有任何一筆合法 `date` 的紀錄時，才取 `createdAt` 最大的那筆。'));
    check(`${kind}：同順位照檢查表的順序，TSH 複查排在同一天的檢查之後`,s.includes('同一順位的（同樣是盡快處理、到期日同一天，或同樣是還沒有追蹤計畫），照上表由上到下的順序；TSH 複查排在同一天到期的檢查之後。'));
    check(`${kind}：設定的固定間隔要是 1–120 的整數，否則用預設`,s.includes('`settings/intervals` 裡這個代號的值是 1–120 的整數就用它；其他情況（不存在、`0`、負數、小數、超過 120、不是數字）都用上表的預設間隔')&&!s.includes('的值是數字就用它'));
    check(`${kind}：骨密度的 nofollow 是「不追蹤」`,s.includes('`exam` 是 `bone_dxa`，`preset` 是 `nofollow`'));
    check(`${kind}：骨密度沒有預設間隔`,rows.some(r=>r[0]==='bone_dxa'&&r[2]===null),rows.find(r=>r[0]==='bone_dxa'));
    check(`${kind}：TSH 複查的算法（明確連結、手動日期、週數）`,s.includes('### TSH 複查（劑量或製劑變更後）')&&s.includes('`drawCtx.recheckOf` 等於對象的文件 id')&&s.includes('`recheckDue`')&&s.includes('`tshRecheckWeeks` 是 1–52 的整數'));
    check(`${kind}：meddose 要記下文件 id`,s.includes('每份文件都記下回傳的文件 id'));
  }else check(`${kind}：沒有檢查表`,!rows.length&&!s.includes('| 代號 |'));
  const ex=[...s.matchAll(/\[例 ([\w-]+)\][^\n]*「([^」\n]+)」\s*$/gm)].map(x=>[x[1],x[2]]);
  check(`${kind}：範例齊全 ${spec.cases.join('、')}`,JSON.stringify(ex.map(x=>x[0]).sort())===JSON.stringify([...spec.cases].sort()),ex.map(x=>x[0]));
  for(const [id,text] of ex){const c=CASES[id];const want=c&&(c[0]===kind||id==='err')?outs.get(c):null;check(`${kind}：[例 ${id}] 和參考實作一致`,text===want,{prompt:text,ref:want})}
}
process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
