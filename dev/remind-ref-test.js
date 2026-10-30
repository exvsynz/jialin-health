/* 排程提醒規則測試（dev/remind-ref.js，合成資料）。最後一段用 Playwright 比對頁面的 dueOf。
   執行：node dev/remind-ref-test.js */
const fs=require('fs'),path=require('path');
const {run,EXAM_NAMES,RECENT_MAX}=require('./remind-ref');
const {open,close,sampleSeed,check,summary}=require('./harness');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SAT='2026-10-31',SUN='2026-11-01';
const day=(o={})=>({date:SAT,...o});
const full={am:{w:52.1,bf:24,at:'07:10'},med:{taken:true,at:'07:15',dose:50},pm:{w:52.6,bf:null,at:'22:05'}};
const st=(days={},extra={})=>({profile:{medDose:50},days,exercise:[],records:[],heartbeat:null,...extra});
const M=(t='07:23')=>SAT+'T'+t+':00+08:00',E=(t='22:21')=>SAT+'T'+t+':00+08:00';
const rec=(exam,date,o={})=>({exam,date,preset:null,interval:12,nextDue:null,createdAt:1,...o});
const eq=(name,got,want)=>check(name,JSON.stringify(got)===JSON.stringify(want),{got,want});

(async()=>{
  /* 早上 */
  let r=run('morning',M(),st({[SAT]:day(full)}));
  eq('早上全記了：不推播',[r.push,r.reply,r.heartbeat.missing,r.heartbeat.pushed],[null,'（無需提醒）',[],false]);
  r=run('morning',M(),st({[SAT]:day({med:full.med})}));
  eq('早上缺體重',r.push,'家琳今天還沒記：早上體重');
  r=run('morning',M(),st({[SAT]:day({am:full.am})}));
  eq('早上缺服藥',r.push,'家琳今天還沒記：服藥');
  r=run('morning',M(),st({}));
  eq('days 文件不存在：兩項都缺，固定順序',[r.push,r.heartbeat.missing],['家琳今天還沒記：早上體重、服藥',['早上體重','服藥']]);
  r=run('morning',M(),st({[SAT]:day({am:full.am,med:null})}));
  eq('med:null（撤銷過）算缺',r.push,'家琳今天還沒記：服藥');
  r=run('morning',M(),st({[SAT]:day({med:full.med,am:null})}));
  eq('am:null 算缺',r.push,'家琳今天還沒記：早上體重');
  r=run('morning',M(),st({[SAT]:day({am:full.am,med:full.med})}));
  eq('早上不檢查晚上體重',r.push,null);
  eq('心跳 at 是台北時間 ISO',r.heartbeat.at,'2026-10-31T07:23:00+08:00');
  r=run('morning','2026-10-30T23:23:00Z',st({}));
  eq('UTC 時間換算成台北邏輯日',r.heartbeat.date,SAT);

  /* 暫停（含頭尾）*/
  const P=(f,t)=>({profile:{pauseFrom:f,pauseTo:t}});
  eq('暫停：剛好開始日',run('morning',M(),st({},P(SAT,'2026-11-03'))).heartbeat.skipped,'paused');
  eq('暫停：剛好結束日',run('morning',M(),st({},P('2026-10-28',SAT))).heartbeat.skipped,'paused');
  eq('暫停：開始日前一天不算',run('morning',M(),st({},P(SUN,'2026-11-03'))).heartbeat.skipped,null);
  eq('暫停：結束日後一天不算',run('morning',M(),st({},P('2026-10-28','2026-10-30'))).heartbeat.skipped,null);
  eq('只有 pauseFrom 沒有 pauseTo：不算暫停',run('morning',M(),st({},{profile:{pauseFrom:SAT}})).heartbeat.skipped,null);
  r=run('morning',M(),st({},P(SAT,SAT)));
  eq('暫停：不推播，paused:true，missing 清空',[r.push,r.heartbeat.paused,r.heartbeat.missing,r.reply],[null,true,[],'（無需提醒）']);

  /* 開關 */
  eq('remind 不存在：會推播',!!run('morning',M(),st({})).push,true);
  r=run('morning',M(),st({},{profile:{remind:{morning:false}}}));
  eq('remind.morning:false：off，不推播',[r.heartbeat.skipped,r.push],['off',null]);
  eq('remind.morning:false 不影響晚上',!!run('evening',E(),st({},{profile:{remind:{morning:false}}})).push,true);
  eq('remind.weekly:false：週報 off',run('weekly',SUN+'T20:14:00+08:00',st({},{profile:{remind:{weekly:false}}})).heartbeat.skipped,'off');
  eq('暫停優先於開關',run('morning',M(),st({},{profile:{pauseFrom:SAT,pauseTo:SAT,remind:{morning:false}}})).heartbeat.skipped,'paused');

  /* 執行時間 */
  eq('早上 12:05 才執行：late',run('morning',M('12:05'),st({})).heartbeat.skipped,'late');
  eq('早上 11:59 仍正常',run('morning',M('11:59'),st({})).heartbeat.skipped,null);
  eq('早上 04:50 太早：late',run('morning',M('04:50'),st({})).heartbeat.skipped,'late');
  r=run('evening',SUN+'T03:59:00+08:00',st({}));
  eq('晚上 03:59 執行：邏輯日仍是前一天，正常判斷',[r.heartbeat.date,r.heartbeat.skipped,!!r.push],[SAT,null,true]);
  r=run('evening',SUN+'T04:01:00+08:00',st({}));
  eq('晚上 04:01 執行：late',[r.heartbeat.date,r.heartbeat.skipped,r.push],[SUN,'late',null]);
  eq('晚上 17:59 太早：late',run('evening',E('17:59'),st({})).heartbeat.skipped,'late');
  eq('週報週六執行：late',run('weekly',E('20:14'),st({})).heartbeat.skipped,'late');
  eq('週報週日 17:59：late',run('weekly',SUN+'T17:59:00+08:00',st({})).heartbeat.skipped,'late');

  /* 晚上 */
  r=run('evening',E(),st({[SAT]:day({am:full.am,med:full.med})}));
  eq('晚上缺晚上體重',r.push,'家琳今天還沒記：晚上體重');
  r=run('evening',E(),st({[SAT]:day({pm:full.pm})}));
  eq('晚上也提醒早上體重（8.1），順序固定',r.push,'家琳今天還沒記：早上體重、服藥');
  r=run('evening',E(),st({[SAT]:day(full)}));
  eq('晚上全記了：不推播',r.push,null);
  const need={[SAT]:day({am:full.am,med:full.med})};
  r=run('evening',E(),st(need,{records:[rec('thy_lab','2026-05-07',{interval:6})]}));
  eq('檢查剛好 7 天後到期：附在同一行',r.push,'家琳今天還沒記：晚上體重；甲狀腺抽血 11/7 到期');
  r=run('evening',E(),st(need,{records:[rec('thy_lab','2026-05-08',{interval:6})]}));
  eq('檢查 8 天後到期：不附加',r.push,'家琳今天還沒記：晚上體重');
  r=run('evening',E(),st(need,{records:[rec('breast_us','2025-06-01'),rec('thy_us','2026-10-20',{interval:0})]}));
  eq('需盡快處理排最前，已逾期寫已逾期',r.push,'家琳今天還沒記：晚上體重；甲狀腺超音波需盡快處理、乳房超音波已逾期');
  r=run('evening',E(),st(need,{records:[rec('thy_us','2025-01-01',{preset:'none',interval:null})]}));
  eq('不追蹤的分類（interval null、沒有 nextDue）不列入',r.push,'家琳今天還沒記：晚上體重');
  r=run('evening',E(),st(need,{records:[rec('gi_colo','2016-01-01',{interval:120,nextDue:'2026-11-02'})]}));
  eq('nextDue 優先',r.push,'家琳今天還沒記：晚上體重；大腸鏡 11/2 到期');
  r=run('evening',E(),st(need,{records:[rec('thy_lab','2025-04-01',{interval:6}),rec('thy_lab','2026-10-01',{interval:6})]}));
  eq('只看最新一筆：舊的逾期紀錄不列入',r.push,'家琳今天還沒記：晚上體重');
  r=run('evening',E(),st(need,{records:[rec('thy_lab','2026-05-01',{interval:6,createdAt:1}),rec('thy_lab','2026-05-01',{interval:12,createdAt:2})]}));
  eq('同一天取 createdAt 最大',r.push,'家琳今天還沒記：晚上體重');
  r=run('evening',E(),st({[SAT]:day(full)},{records:[rec('thy_lab','2026-05-07',{interval:6})]}));
  eq('沒有缺、只有檢查到期：不推播（8.2）',r.push,null);
  r=run('evening',E(),st(need,{records:[rec('unknown_exam','2020-01-01')]}));
  eq('不認得的檢查代號不列入',r.push,'家琳今天還沒記：晚上體重');
  r=run('evening',E(),st(need,{records:[rec('thy_lab','2026-05-31',{interval:5})]}));
  eq('月底加月份：5/31 + 5 個月 = 10/31（今天到期）',r.push,'家琳今天還沒記：晚上體重；甲狀腺抽血 10/31 到期');

  /* 週報 */
  const wk={},W=['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31',SUN];
  W.forEach((d,i)=>{wk[d]={date:d,med:full.med};if(i!==2)wk[d].am={w:[52.1,52.4,0,52.3,52.0,52.6,52.5][i]}});
  wk['2026-10-25']={date:'2026-10-25',am:{w:60},med:full.med}; // 範圍外
  const now=Date.parse(SUN+'T20:14:00+08:00');
  const recent=[];for(let i=0;i<7;i++){const d=W[6-i];recent.push({at:new Date(now-i*864e5-12.9*36e5).toISOString(),kind:'morning',date:d});if(i>0)recent.push({at:new Date(now-i*864e5+2.1*36e5).toISOString(),kind:'evening',date:d})}
  recent.push({at:new Date(now-7*864e5+2.1*36e5).toISOString(),kind:'evening',date:'2026-10-25'}); // 上週日 22:2x，在過去 7×24 小時內
  recent.push({at:new Date(now-7*864e5).toISOString(),kind:'morning',date:'2026-10-25'}); // 剛好 7×24 小時前：不算
  const wst=o=>st(wk,{profile:{lastExport:'2026/10/02'},heartbeat:{recent},exercise:[{date:'2026-10-26',min:60},{date:'2026-10-29',min:50},{date:SUN,min:70},{date:'2026-10-28',min:30,deleted:true},{date:'2026-10-25',min:90}],...o});
  r=run('weekly',SUN+'T20:14:00+08:00',wst());
  eq('週報：平均、服藥、運動、排程',r.push,'週報 10/26–11/1：早上平均 52.3 kg（6 天）、服藥 7/7 天、運動 180 分、排程 14/14');
  eq('週報：心跳 kind weekly，missing 空',[r.heartbeat.kind,r.heartbeat.missing,r.heartbeat.pushed],['weekly',[],true]);
  r=run('weekly',SUN+'T20:14:00+08:00',wst({profile:{lastExport:'2026/10/01'}}));
  eq('上次匯出 31 天前：該備份了',r.push.endsWith('；該備份了'),true);
  r=run('weekly',SUN+'T20:14:00+08:00',wst({profile:{}}));
  eq('從未匯出：該備份了',r.push.endsWith('；該備份了'),true);
  r=run('weekly',SUN+'T20:14:00+08:00',wst({profile:{lastExport:'2026-10-20'}}));
  eq('lastExport 格式不對：當作沒匯出',r.push.endsWith('；該備份了'),true);
  r=run('weekly',SUN+'T20:14:00+08:00',st({},{profile:{lastExport:'2026/10/30'}}));
  eq('沒有任何紀錄的一週',r.push,'週報 10/26–11/1：早上體重 0 天、服藥 0/7 天、運動 0 分、排程 0/14');
  r=run('weekly',SUN+'T20:14:00+08:00',wst({profile:{lastExport:'2026/10/30',pauseFrom:'2026-10-27',pauseTo:'2026-10-28'}}));
  eq('暫停日不算在服藥分母',r.push.includes('服藥 7/5 天')?'分子沒排除':r.push.match(/服藥 [^、]+/)[0],'服藥 5/5 天');
  r=run('weekly',SUN+'T20:14:00+08:00',wst({profile:{lastExport:'2026/10/30'},records:[rec('breast_us','2025-11-12'),rec('thy_lab','2026-05-30',{interval:6}),rec('lung_ldct','2025-12-10')]}));
  eq('30 天內到期（含 12/1 剛好 30 天，12/10 不列）',r.push.split('；')[1],'30 天內到期：乳房超音波 11/12、甲狀腺抽血 11/30');
  r=run('weekly',SUN+'T20:14:00+08:00',wst({profile:{lastExport:'2026/10/30'},records:[rec('lung_ldct','2025-12-01')]}));
  eq('剛好 30 天後到期列入',r.push.split('；')[1],'30 天內到期：低劑量電腦斷層 LDCT 12/1');
  eq('週報：週日暫停就跳過',run('weekly',SUN+'T20:14:00+08:00',wst({profile:{pauseFrom:SUN,pauseTo:SUN}})).heartbeat.skipped,'paused');
  const dup=[...recent,{...recent[0]}];
  eq('排程次數：同一天同一種重複執行只算一次',run('weekly',SUN+'T20:14:00+08:00',wst({heartbeat:{recent:dup}})).push.match(/排程 [\d/]+/)[0],'排程 14/14');

  /* 心跳文件 */
  const old={at:'2026-10-30T10:00:00Z',note:'test'};
  r=run('morning',M(),st({},{heartbeat:old}));
  eq('舊文件沒有 recent：從空陣列開始',r.heartbeat.recent.length,1);
  eq('舊文件的其他欄位不保留（set 取代）',r.heartbeat.note,undefined);
  const many=[...Array(25)].map((_,i)=>({at:'x'+i,kind:'morning'}));
  r=run('morning',M(),st({},{heartbeat:{recent:many}}));
  eq('recent 最多 21 筆，新的在前',[r.heartbeat.recent.length,r.heartbeat.recent[0].at,r.heartbeat.recent[20].at],[RECENT_MAX,r.heartbeat.at,'x19']);
  eq('recent 裡不再巢狀 recent',r.heartbeat.recent[0].recent,undefined);

  /* 讀取失敗 */
  r=run('morning',M(),st({},{readError:true}));
  eq('讀取失敗：ok:false、error，推播失敗訊息',[r.heartbeat.ok,r.heartbeat.skipped,r.push],[false,'error','提醒檢查失敗：讀不到資料']);

  /* 檢查名稱表和 src/index.html 的 EXAMS 一致 */
  const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
  const fromPage=Object.fromEntries([...html.matchAll(/\{id:'([a-z_]+)',cat:'[a-z]+',name:'([^']+)'/g)].map(x=>[x[1],x[2]]));
  eq('參考實作的檢查名稱表和 EXAMS 一致',EXAM_NAMES,fromPage);

  /* 到期日算法和頁面 dueOf 一致（一般紀錄） */
  const T='2026-10-30';
  const extra={'records/m1':rec('gyn_horm','2026-01-31',{interval:1}),'records/m2':rec('gi_egd','2025-08-31',{interval:6}),'records/m3':rec('gi_colo','2020-01-01',{interval:120,nextDue:'2027-03-01'}),'records/m4':rec('thy_us','2026-10-01',{preset:'none',interval:null}),'records/m5':rec('breast_ct','2026-10-01',{interval:0})};
  const {page}=await open({hash:'exams',cfg:{latencyComp:true,seed:{...sampleSeed(T),...extra}}});await wait(500);
  const pageDue=await page.evaluate(()=>records.map(r=>['records/'+r.id,r.interval===0&&!r.nextDue?'asap':dueOf(r)]));
  await page.context().close();
  const {dueOf:refDue}=require('./remind-ref');
  const recs=[...Object.entries(sampleSeed(T)).filter(([k])=>k.startsWith('records/')),...Object.entries(extra)];
  const refMap=Object.fromEntries(recs.map(([id,r])=>{const d=refDue(r);return[id,d?(d.asap?'asap':d.due):null]}));
  const sorted=o=>Object.fromEntries(Object.entries(o).sort());
  eq('到期日：參考實作和頁面 dueOf 一致（7 筆，含月底、nextDue、需盡快、不追蹤）',sorted(Object.fromEntries(pageDue)),sorted(refMap));

  await close();
  process.exit(summary()?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
