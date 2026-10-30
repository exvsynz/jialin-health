/* 排程提醒規則測試：dev/remind-ref.js 對 ArtifactData 測試替身（dev/fake-artifact-data.js）實際執行。合成資料。
   最後一段用 Playwright 比對頁面的 dueOf。執行：node dev/remind-ref-test.js */
const fs=require('fs'),path=require('path');
const {run,EXAMS,NO_FOLLOW,RECENT_MAX,normalizeRecent}=require('./remind-ref');
const {open,close,sampleSeed,check,summary}=require('./harness');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SAT='2026-10-31',SUN='2026-11-01';
const day=(o={})=>({date:SAT,...o});
const full={am:{w:52.1,bf:24,at:'07:10'},med:{taken:true,at:'07:15',dose:50},pm:{w:52.6,bf:null,at:'22:05'}};
const st=(days={},extra={})=>({profile:{medDose:50},days,exercise:[],records:[],heartbeat:null,...extra});
const M=(t='07:23')=>SAT+'T'+t+':00+08:00',E=(t='22:21')=>SAT+'T'+t+':00+08:00',W=(t='20:14')=>SUN+'T'+t+':00+08:00';
const rec=(exam,date,o={})=>({exam,date,preset:null,interval:12,nextDue:null,createdAt:1,...o});
const eq=(name,got,want)=>check(name,JSON.stringify(got)===JSON.stringify(want),{got,want});

(async()=>{
  /* 早上 */
  let r=await run('morning',M(),st({[SAT]:day(full)}));
  eq('早上全記了：不推播',[r.push,r.reply,r.entry.missing,r.entry.shouldPush,r.delivery],[null,'（無需提醒）',[],false,'none']);
  r=await run('morning',M(),st({[SAT]:day({med:full.med})}));
  eq('早上缺體重',r.push,'家琳今天還沒記：早上體重');
  r=await run('morning',M(),st({[SAT]:day({am:full.am})}));
  eq('早上缺服藥',r.push,'家琳今天還沒記：服藥');
  r=await run('morning',M(),st({}));
  eq('days 文件不存在：兩項都缺，固定順序',[r.push,r.entry.missing],['家琳今天還沒記：早上體重、服藥',['早上體重','服藥']]);
  for(const v of [null,false,0,''])eq(`med 是 ${JSON.stringify(v)}：算缺（和頁面的判斷相同）`,(await run('morning',M(),st({[SAT]:day({am:full.am,med:v})}))).push,'家琳今天還沒記：服藥');
  eq('早上不檢查晚上體重',(await run('morning',M(),st({[SAT]:day({am:full.am,med:full.med})}))).push,null);
  r=await run('morning',M(),st({[SAT]:day({am:full.am})}));
  eq('心跳 at 是台北時間 ISO',r.heartbeat.at,'2026-10-31T07:23:00+08:00');
  eq('UTC 時間換算成台北邏輯日',(await run('morning','2026-10-30T23:23:00Z',st({}))).entry.date,SAT);

  /* 暫停（含頭尾） */
  const P=(f,t,o={})=>({profile:{pauseFrom:f,pauseTo:t,...o}});
  eq('暫停：剛好開始日',(await run('morning',M(),st({},P(SAT,'2026-11-03')))).entry.skipped,'paused');
  eq('暫停：剛好結束日',(await run('morning',M(),st({},P('2026-10-28',SAT)))).entry.skipped,'paused');
  eq('暫停：開始日前一天不算',(await run('morning',M(),st({},P(SUN,'2026-11-03')))).entry.skipped,null);
  eq('暫停：結束日後一天不算',(await run('morning',M(),st({},P('2026-10-28','2026-10-30')))).entry.skipped,null);
  eq('只有 pauseFrom 沒有 pauseTo：不算暫停',(await run('morning',M(),st({},{profile:{pauseFrom:SAT}}))).entry.skipped,null);
  r=await run('morning',M(),st({},P(SAT,SAT)));
  eq('暫停：不推播，paused:true，missing 清空',[r.push,r.entry.paused,r.entry.missing,r.reply],[null,true,[],'（無需提醒）']);

  /* 開關 */
  eq('remind 不存在：會推播',!!(await run('morning',M(),st({}))).push,true);
  r=await run('morning',M(),st({},{profile:{remind:{morning:false}}}));
  eq('remind.morning:false：off，不推播',[r.entry.skipped,r.push],['off',null]);
  eq('remind.morning:false 不影響晚上',!!(await run('evening',E(),st({},{profile:{remind:{morning:false}}}))).push,true);
  eq('remind.weekly:false：週報 off',(await run('weekly',W(),st({},{profile:{remind:{weekly:false}}}))).entry.skipped,'off');
  eq('暫停優先於開關',(await run('morning',M(),st({},{profile:{pauseFrom:SAT,pauseTo:SAT,remind:{morning:false}}}))).entry.skipped,'paused');

  /* 已知關閉、暫停或太晚時，不讀其他資料，也就不會因為其他資料讀不到而推播 */
  for(const [name,s,t] of [['關閉',st({},{profile:{remind:{evening:false}}}),E()],['暫停',st({},P(SAT,SAT)),E()],['太晚',st({}),E('17:00')]]){
    r=await run('evening',t,s,{failGet:{['days/'+SAT]:9},failList:{records:9}});
    eq(`${name}時其他資料讀不到：不推播錯誤`,[r.push,r.entry.ok],[null,true]);
    eq(`${name}時只讀 profile 與 heartbeat`,r.fake.calls.filter(c=>c[0]!=='set').map(c=>c[1]),['settings/profile','system/heartbeat']);
  }

  /* 執行時間與送出前的再檢查 */
  eq('早上 12:05 才執行：late',(await run('morning',M('12:05'),st({}))).entry.skipped,'late');
  eq('早上 11:59 仍正常',(await run('morning',M('11:59'),st({}))).entry.skipped,null);
  eq('早上 04:50 太早：late',(await run('morning',M('04:50'),st({}))).entry.skipped,'late');
  r=await run('evening',SUN+'T03:59:00+08:00',st({}));
  eq('晚上 03:59 執行：邏輯日仍是前一天，正常判斷',[r.entry.date,r.entry.skipped,!!r.push],[SAT,null,true]);
  r=await run('evening',SUN+'T04:01:00+08:00',st({}));
  eq('晚上 04:01 執行：late',[r.entry.date,r.entry.skipped,r.push],[SUN,'late',null]);
  r=await run('evening',SUN+'T03:59:00+08:00',st({}),{times:[SUN+'T03:59:00+08:00',SUN+'T04:00:30+08:00']});
  eq('03:59 開始、04:00 後才要送：改成 late，不推播',[r.entry.skipped,r.push,r.delivery],['late',null,'none']);
  r=await run('morning',M('11:58'),st({}),{times:[M('11:58'),M('12:01')]});
  eq('早上 11:58 開始、12:01 才要送：late',r.entry.skipped,'late');
  eq('晚上 17:59 太早：late',(await run('evening',E('17:59'),st({}))).entry.skipped,'late');
  eq('週報週六執行：late',(await run('weekly',E('20:14'),st({}))).entry.skipped,'late');
  eq('週報週日 17:59：late',(await run('weekly',W('17:59'),st({}))).entry.skipped,'late');

  /* 晚上 */
  eq('晚上缺晚上體重',(await run('evening',E(),st({[SAT]:day({am:full.am,med:full.med})}))).push,'家琳今天還沒記：晚上體重');
  eq('晚上也提醒早上體重（8.1），順序固定',(await run('evening',E(),st({[SAT]:day({pm:full.pm})}))).push,'家琳今天還沒記：早上體重、服藥');
  eq('晚上全記了：不推播',(await run('evening',E(),st({[SAT]:day(full)}))).push,null);
  const need={[SAT]:day({am:full.am,med:full.med})};
  const ev=async o=>(await run('evening',E(),st(need,o))).push;
  eq('檢查剛好 7 天後到期：附在同一行',await ev({records:[rec('thy_lab','2026-05-07',{interval:6})]}),'家琳今天還沒記：晚上體重；甲狀腺抽血 11/7 到期');
  eq('檢查 8 天後到期：不附加',await ev({records:[rec('thy_lab','2026-05-08',{interval:6})]}),'家琳今天還沒記：晚上體重');
  eq('interval 0 寫「待安排」排最前，已逾期寫已逾期',await ev({records:[rec('breast_us','2025-06-01'),rec('thy_us','2026-10-20',{interval:0})]}),'家琳今天還沒記：晚上體重；甲狀腺超音波待安排、乳房超音波已逾期');
  eq('不追蹤的分類（無結節）不列入',await ev({records:[rec('thy_us','2025-01-01',{preset:'none',interval:null})]}),'家琳今天還沒記：晚上體重');
  eq('不追蹤的分類（≤1 cm 極低懷疑）不列入',await ev({records:[rec('thy_us','2025-01-01',{preset:'vlowSmall',interval:null})]}),'家琳今天還沒記：晚上體重');
  eq('interval null、不是不追蹤：用設定的固定間隔（舊資料）',await ev({records:[rec('thy_lab','2026-07-01',{interval:null})],intervals:{thy_lab:4}}),'家琳今天還沒記：晚上體重；甲狀腺抽血 11/1 到期');
  eq('interval null、沒有設定：用預設間隔（甲狀腺抽血 6 個月）',await ev({records:[rec('thy_lab','2026-05-03',{interval:null})]}),'家琳今天還沒記：晚上體重；甲狀腺抽血 11/3 到期');
  eq('interval 是字串（匯入資料）：當作沒有，用預設',await ev({records:[rec('thy_lab','2026-05-03',{interval:'6'})]}),'家琳今天還沒記：晚上體重；甲狀腺抽血 11/3 到期');
  eq('nextDue 優先',await ev({records:[rec('gi_colo','2016-01-01',{interval:120,nextDue:'2026-11-02'})]}),'家琳今天還沒記：晚上體重；大腸鏡 11/2 到期');
  eq('只看最新一筆：舊的逾期紀錄不列入',await ev({records:[rec('thy_lab','2025-04-01',{interval:6}),rec('thy_lab','2026-10-01',{interval:6})]}),'家琳今天還沒記：晚上體重');
  eq('同一天取 createdAt 最大',await ev({records:[rec('thy_lab','2026-05-01',{interval:6,createdAt:1}),rec('thy_lab','2026-05-01',{interval:12,createdAt:2})]}),'家琳今天還沒記：晚上體重');
  eq('沒有缺、只有檢查到期：不推播（8.2）',(await run('evening',E(),st({[SAT]:day(full)},{records:[rec('thy_lab','2026-05-07',{interval:6})]}))).push,null);
  eq('不認得的檢查代號不列入',await ev({records:[rec('unknown_exam','2020-01-01')]}),'家琳今天還沒記：晚上體重');
  eq('月底加月份：5/31 + 5 個月 = 10/31（今天到期）',await ev({records:[rec('thy_lab','2026-05-31',{interval:5})]}),'家琳今天還沒記：晚上體重；甲狀腺抽血 10/31 到期');
  r=await run('evening',E(),st(need,{records:[rec('thy_lab','2026-05-07',{interval:6}),rec('gi_colo','2016-01-01',{interval:120,nextDue:'2026-11-02'})]}),{pageSize:1});
  eq('records 分頁：每頁 1 筆也會讀完',r.push,'家琳今天還沒記：晚上體重；大腸鏡 11/2 到期、甲狀腺抽血 11/7 到期');
  eq('records 分頁：2 筆、每頁 1 筆，照 next_cursor 讀 2 次就停',r.fake.calls.filter(c=>c[0]==='list').length,2);

  /* 週報 */
  const wk={},WD=['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31',SUN];
  WD.forEach((d,i)=>{wk[d]={date:d,med:full.med};if(i!==2)wk[d].am={w:[52.1,52.4,0,52.3,52.0,52.6,52.5][i]}});
  wk['2026-10-25']={date:'2026-10-25',am:{w:60},med:full.med}; // 範圍外
  delete wk['2026-10-29'].date; // 舊文件沒有 date 欄位：依文件 ID 讀，仍算進來
  const now=Date.parse(W());
  const recent=[];for(let i=0;i<7;i++){const d=WD[6-i];recent.push({at:new Date(now-i*864e5-12.9*36e5).toISOString(),kind:'morning',date:d});if(i>0)recent.push({at:new Date(now-i*864e5+2.1*36e5).toISOString(),kind:'evening',date:d})}
  recent.push({at:new Date(now-7*864e5+2.1*36e5).toISOString(),kind:'evening',date:'2026-10-25'}); // 上週日 22:2x，在過去 7×24 小時內
  recent.push({at:new Date(now-7*864e5).toISOString(),kind:'morning',date:'2026-10-25'}); // 剛好 7×24 小時前：不算
  const wst=o=>st(wk,{profile:{lastExport:'2026/10/02'},heartbeat:{recent},exercise:[{date:'2026-10-26',min:60},{date:'2026-10-29',min:50},{date:SUN,min:70},{date:'2026-10-28',min:30,deleted:true},{date:'2026-10-25',min:90}],...o});
  r=await run('weekly',W(),wst());
  eq('週報：平均、服藥、運動、排程',r.push,'週報 10/26–11/1：早上平均 52.3 kg（6 天）、服藥 7/7 天、運動 180 分、排程 14/14');
  eq('週報：days 依 7 個日期逐一 get',r.fake.calls.filter(c=>c[0]==='get'&&c[1].startsWith('days/')).map(c=>c[1]),WD.map(d=>'days/'+d));
  eq('週報：心跳 kind weekly，missing 空',[r.entry.kind,r.entry.missing,r.entry.shouldPush],['weekly',[],true]);
  eq('上次匯出 31 天前：該備份了',(await run('weekly',W(),wst({profile:{lastExport:'2026/10/01'}}))).push.endsWith('；該備份了'),true);
  eq('從未匯出：該備份了',(await run('weekly',W(),wst({profile:{}}))).push.endsWith('；該備份了'),true);
  eq('lastExport 格式不對：當作沒匯出',(await run('weekly',W(),wst({profile:{lastExport:'2026-10-20'}}))).push.endsWith('；該備份了'),true);
  eq('沒有任何紀錄的一週',(await run('weekly',W(),st({},{profile:{lastExport:'2026/10/30'}}))).push,'週報 10/26–11/1：早上體重 0 天、服藥 0/7 天、運動 0 分、排程 0/14');
  r=await run('weekly',W(),wst({profile:{lastExport:'2026/10/30',pauseFrom:'2026-10-27',pauseTo:'2026-10-28'}}));
  eq('暫停日不算在服藥分母',r.push.match(/服藥 [^、]+/)[0],'服藥 5/5 天');
  r=await run('weekly',W(),wst({profile:{lastExport:'2026/10/30'},records:[rec('breast_us','2025-11-12'),rec('thy_lab','2026-05-30',{interval:6}),rec('lung_ldct','2025-12-10')]}));
  eq('30 天內到期（12/10 不列）',r.push.split('；')[1],'30 天內到期：乳房超音波 11/12、甲狀腺抽血 11/30');
  eq('剛好 30 天後到期列入',(await run('weekly',W(),wst({profile:{lastExport:'2026/10/30'},records:[rec('lung_ldct','2025-12-01')]}))).push.split('；')[1],'30 天內到期：低劑量電腦斷層 LDCT 12/1');
  eq('週報：週日暫停就跳過',(await run('weekly',W(),wst({profile:{pauseFrom:SUN,pauseTo:SUN}}))).entry.skipped,'paused');
  eq('排程次數：同一天同一種重複執行只算一次',(await run('weekly',W(),wst({heartbeat:{recent:[...recent,{...recent[0]}]}}))).push.match(/排程 [\d/]+/)[0],'排程 14/14');
  for(const bad of [{},[null],'x',[{at:'abc',kind:'morning',date:SAT}],[{at:recent[0].at,kind:'test',date:SAT}]])
    eq('舊 recent 異常（'+JSON.stringify(bad).slice(0,30)+'）：週報不丟錯，無效項不計',(await run('weekly',W(),wst({heartbeat:{recent:bad},profile:{lastExport:'2026/10/30'}}))).push.match(/排程 [\d/]+/)[0],'排程 0/14');
  r=await run('weekly',W(),wst({profile:{lastExport:'2026/10/30'}}),{failGet:{'system/heartbeat':2}});
  eq('心跳讀不到：週報寫「排程讀不到」，不寫 0/14',r.push.includes('排程讀不到')&&!r.push.includes('0/14'),true);
  eq('心跳讀不到：不寫入心跳',[r.heartbeatWritten,r.fake.calls.some(c=>c[0]==='set')],[false,false]);
  r=await run('weekly',W(),wst({profile:{lastExport:'2026/10/30'}}),{failGet:{'system/heartbeat':1}});
  eq('心跳第一次讀取失敗、重試成功：照常寫入',[r.heartbeatWritten,r.push.includes('排程 14/14')],[true,true]);
  r=await run('weekly',W(),wst(),{pageSize:2});
  eq('exercise 分頁：每頁 2 筆也會讀完',r.push.match(/運動 \d+ 分/)[0],'運動 180 分');

  /* 讀取失敗 */
  r=await run('morning',M(),st({},{readError:true}));
  eq('profile 讀不到：ok:false、error，推播失敗訊息',[r.entry.ok,r.entry.skipped,r.push],[false,'error','提醒檢查失敗：讀不到資料']);
  r=await run('morning',M(),st({}),{failGet:{'settings/profile':1}});
  eq('profile 第一次失敗、重試成功：正常判斷',[r.entry.ok,r.push],[true,'家琳今天還沒記：早上體重、服藥']);
  r=await run('evening',E(),st(need),{failList:{records:2}});
  eq('開啟中、records 讀不到：推播失敗訊息',[r.entry.skipped,r.push],['error','提醒檢查失敗：讀不到資料']);

  /* 交付結果 */
  r=await run('morning',M(),st({}),{push:'sent'});
  eq('推播工具回報已送：tool_sent，最終回覆不重複那一行',[r.delivery,r.reply,r.fake.pushed],['tool_sent','（已推播）',['家琳今天還沒記：早上體重、服藥']]);
  r=await run('morning',M(),st({}),{push:'not_sent'});
  eq('推播工具回報未送：tool_not_sent，回覆不說已推播',[r.delivery,r.heartbeat.delivery,r.heartbeat.shouldPush,r.reply],['tool_not_sent','tool_not_sent',true,'（推播未送出）']);
  r=await run('morning',M(),st({}),{push:'throw'});
  eq('推播工具出錯：tool_error，心跳照寫',[r.delivery,r.heartbeatWritten],['tool_error',true]);
  r=await run('morning',M(),st({}));
  eq('沒有推播工具：platform，最終回覆就是那一行',[r.delivery,r.reply],['platform','家琳今天還沒記：早上體重、服藥']);
  r=await run('morning',M(),st({[SAT]:day(full)}),{push:'sent'});
  eq('沒有缺：不呼叫推播工具',[r.fake.calls.some(c=>c[0]==='push'),r.delivery],[false,'none']);
  r=await run('morning',M(),st({}),{push:'sent',failGet:{'system/heartbeat':2}});
  eq('心跳讀不到：照常推播，但不寫心跳',[r.delivery,r.heartbeatWritten],['tool_sent',false]);

  /* 重複執行 */
  const prev=(await run('morning',M('07:21'),st({}),{push:'sent'})).heartbeat;
  r=await run('morning',M('07:40'),st({},{heartbeat:prev}),{push:'sent'});
  eq('同一天早上已送出過：duplicate，不再推播',[r.entry.skipped,r.fake.pushed.length,r.heartbeat.recent.length],['duplicate',0,2]);
  const prevNot=(await run('morning',M('07:21'),st({}),{push:'not_sent'})).heartbeat;
  eq('上一次未送出：這次照常推播',(await run('morning',M('07:40'),st({},{heartbeat:prevNot}),{push:'sent'})).fake.pushed.length,1);
  eq('早上送過，晚上照常',(await run('evening',E(),st({},{heartbeat:prev}),{push:'sent'})).fake.pushed.length,1);

  /* 心跳寫入：版本、衝突、建立競爭、排序 */
  r=await run('morning',M(),st({},{heartbeat:{at:'2026-10-30T10:00:00Z',note:'test'}}));
  eq('舊文件沒有 recent：從空陣列開始，舊欄位不保留',[r.heartbeat.recent.length,r.heartbeat.note],[1,undefined]);
  eq('寫入已存在的文件帶讀到的 if_version',r.fake.calls.find(c=>c[0]==='set')[2]!==null,true);
  r=await run('morning',M(),st({}));
  eq('第一次建立：不帶 if_version',r.fake.calls.find(c=>c[0]==='set')[2],null);
  const other={run:'other#evening-zz',at:'2026-10-30T22:21:00+08:00',kind:'evening',date:'2026-10-30',missing:[],paused:false,ok:true,skipped:null,shouldPush:false,delivery:'none',msg:''};
  const race=(p,store,nextVer)=>{if(p==='system/heartbeat'&&!race.done){race.done=true;store.set(p,{data:{...other,recent:[other]},version:nextVer()})}};
  r=await run('morning',M(),st({}),{beforeSet:race});
  eq('建立競爭：另一個工作階段先建立，重讀後合併兩筆',[r.heartbeatWritten,r.heartbeat.recent.map(x=>x.kind)],[true,['morning','evening']]);
  const race2=(p,store,nextVer)=>{if(p==='system/heartbeat'&&!race2.done){race2.done=true;const cur=store.get(p).data;store.set(p,{data:{...other,recent:[other,...cur.recent]},version:nextVer()})}};
  r=await run('morning',M(),st({},{heartbeat:{...other,at:'2026-10-29T22:21:00+08:00',run:'old',recent:[{...other,run:'old',at:'2026-10-29T22:21:00+08:00',date:'2026-10-29'}]}}),{beforeSet:race2});
  eq('版本衝突：重讀一次再寫，三筆都在',r.heartbeat.recent.length,3);
  const always=(p,store,nextVer)=>{if(p==='system/heartbeat'){const c=store.get(p);store.set(p,{data:c?c.data:{},version:nextVer()})}};
  r=await run('morning',M(),st({},{heartbeat:{recent:[]}}),{beforeSet:always,push:'sent'});
  eq('連續衝突：只重試一次就放棄，推播照常',[r.heartbeatWritten,r.fake.calls.filter(c=>c[0]==='set').length,r.delivery],[false,2,'tool_sent']);
  r=await run('morning',M(),st({},{heartbeat:{recent:[]}}),{failSet:1});
  eq('非版本衝突的寫入失敗：重讀後重寫一次成功',r.heartbeatWritten,true);
  const later={...other,run:'later',at:'2026-10-31T07:30:00+08:00',kind:'morning',date:SAT};
  r=await run('morning',M('07:23'),st({},{heartbeat:{...later,recent:[later]}}));
  eq('較早開始的這次較晚寫入：依時間排序，頂層仍是最新那筆',[r.heartbeat.recent.map(x=>x.run),r.heartbeat.at],[['later',r.entry.run],'2026-10-31T07:30:00+08:00']);
  const many=[...Array(25)].map((_,i)=>({at:new Date(Date.parse(M())-(i+1)*36e5).toISOString(),kind:'evening',date:'2026-10-30',run:'x'+i}));
  r=await run('morning',M(),st({},{heartbeat:{recent:many}}));
  eq('recent 最多 21 筆，留最新的',[r.heartbeat.recent.length,r.heartbeat.recent[0].run===r.entry.run,r.heartbeat.recent[20].run],[RECENT_MAX,true,'x19']);
  eq('recent 裡不含 recent，也不含未知欄位',normalizeRecent({recent:[{at:M(),kind:'morning',date:SAT,recent:[1],extra:1}]}),[{at:M(),kind:'morning',date:SAT}]);

  /* 檢查表和 src/index.html 一致：名稱、預設間隔、不追蹤的分類 */
  const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
  const fromPage=[...html.matchAll(/\{id:'([a-z_]+)',cat:'[a-z]+',name:'([^']+)',def:(\d+)/g)].map(x=>[x[1],x[2],+x[3]]);
  eq('參考實作的檢查表（代號、名稱、預設間隔）和 EXAMS 一致',EXAMS,fromPage);
  const nf=[];let curExam=null;for(const line of html.split('\n')){const e=line.match(/\{id:'([a-z_]+)',cat:/);if(e)curExam=e[1];for(const p of line.matchAll(/\{k:'([^']+)',[^}]*noFollow:true/g))nf.push([curExam,p[1]])}
  eq('不追蹤的分類和頁面一致',NO_FOLLOW,nf);

  /* 到期日：參考實作和頁面 dueOf 一致 */
  const T='2026-10-30';
  const extra={'records/m1':rec('gyn_horm','2026-01-31',{interval:1}),'records/m2':rec('gi_egd','2025-08-31',{interval:6}),'records/m3':rec('gi_colo','2020-01-01',{interval:120,nextDue:'2027-03-01'}),'records/m4':rec('thy_us','2026-10-01',{preset:'none',interval:null}),'records/m5':rec('breast_ct','2026-10-01',{interval:0}),'records/m6':rec('thy_lab','2026-07-01',{interval:null}),'records/m7':rec('breast_mammo','2025-12-31',{interval:null}),'records/m8':rec('lung_ldct','2026-03-31',{interval:'6'})};
  const ivs={thy_lab:3};
  const {page}=await open({hash:'exams',cfg:{latencyComp:true,seed:{...sampleSeed(T),...extra,'settings/intervals':ivs}}});await wait(500);
  const pageDue=await page.evaluate(()=>records.map(r=>['records/'+r.id,r.interval===0&&!r.nextDue?'asap':dueOf(r)]));
  await page.context().close();
  const {dueOf:refDue}=require('./remind-ref');
  const recs=[...Object.entries(sampleSeed(T)).filter(([k])=>k.startsWith('records/')),...Object.entries(extra)];
  const refMap=Object.fromEntries(recs.map(([id,r])=>{const d=refDue(r,ivs);return[id,d?(d.asap?'asap':d.due):null]}));
  const sorted=o=>Object.fromEntries(Object.entries(o).sort());
  eq('到期日：參考實作和頁面 dueOf 一致（11 筆，含 interval null 用設定與預設、字串 interval、月底、nextDue、待安排、不追蹤）',sorted(Object.fromEntries(pageDue)),sorted(refMap));

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
