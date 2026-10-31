/* C 階段：飲食的計算（從 src/index.html 抽出 date helpers 與 meal helpers 區塊執行，不複製程式碼）。合成資料。
   執行：node dev/meal-test.js（也會在 TZ=America/New_York 下再跑一次，確認跟執行環境的時區無關） */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const html=fs.readFileSync(process.env.SRC?path.resolve(process.env.SRC):path.join(__dirname,'../src/index.html'),'utf8');
const block=n=>{const m=html.match(new RegExp('\\/\\* ---- '+n+' helpers: begin[^*]*\\*\\/([\\s\\S]*?)\\/\\* ---- '+n+' helpers: end ---- \\*\\/'));if(!m){console.error('找不到 '+n+' helpers 區塊');process.exit(1)}return m[1]};
const H=new Function(block('date')+block('meal')+';return{atOf,logicalOf,hmOf,mealTypeAt,cleanNote,mealPrompt,parseEstimate,pickThumb,attemptsOf,mealView,dayMeals,dayTotal,estQuiet,coverage,MAX_ATTEMPTS}')();
let fail=0;
const eq=(name,got,want)=>{const ok=JSON.stringify(got)===JSON.stringify(want);if(!ok)fail++;console.log((ok?'  ok   ':'  FAIL ')+name+(ok?'':' → '+JSON.stringify(got)+'（應為 '+JSON.stringify(want)+'）'))};
const tpe=s=>Date.parse(s+'+08:00'); // 台北時間字串 → 毫秒
const done=(id,startedAt,lo,hi,o={})=>({[id]:{status:'done',startedAt,at:startedAt+1000,kcalLo:lo,kcalHi:hi,desc:id,items:[],confidence:'mid',note:'',...o}});

console.log('TZ='+(process.env.TZ||'(預設)'));
/* 餐別 */
const at=hm=>tpe('2026-10-30T'+hm+':00');
eq('餐別分界：10:29／10:30、13:59／14:00、16:59／17:00、20:59／21:00、03:59／04:00',
  ['10:29','10:30','13:59','14:00','16:59','17:00','20:59','21:00','03:59','04:00'].map(h=>H.mealTypeAt(at(h))),
  ['breakfast','lunch','lunch','snack','snack','dinner','dinner','snack','snack','breakfast']);
/* 邏輯日加鐘面時間 */
eq('atOf：10/31 的 02:00 是 11/1 02:00',H.atOf('2026-10-31','02:00'),tpe('2026-11-01T02:00:00'));
eq('atOf：03:59 屬下一個日曆日、04:00 屬同一天',[H.atOf('2026-10-31','03:59'),H.atOf('2026-10-31','04:00')],[tpe('2026-11-01T03:59:00'),tpe('2026-10-31T04:00:00')]);
eq('atOf：年底 12/31 的 03:00 是隔年 1/1',H.atOf('2026-12-31','03:00'),tpe('2027-01-01T03:00:00'));
eq('atOf：月底 2/28 的 01:30 是 3/1',H.atOf('2027-02-28','01:30'),tpe('2027-03-01T01:30:00'));
const ds=['2026-10-31','2026-12-31','2027-02-28','2026-01-01'],hs=['00:00','02:00','03:59','04:00','12:30','23:59'];
eq('logicalOf(atOf(d,t)) === d（各日期 × 各時間）',ds.flatMap(d=>hs.map(h=>H.logicalOf(H.atOf(d,h))===d)).every(Boolean),true);
eq('hmOf(atOf(d,t)) === t',hs.map(h=>H.hmOf(H.atOf('2026-10-31',h))),hs);
eq('凌晨 3:59 拍的算前一天',H.logicalOf(tpe('2026-11-01T03:59:00')),'2026-10-31');
/* 補充說明 */
eq('cleanNote：去掉換行與引號，截到 60 字',[H.cleanNote('半碗飯\n有湯「兩人分」"x"'),H.cleanNote('字'.repeat(80)).length,H.cleanNote(null)],['半碗飯 有湯兩人分x',60,'']);
const pr=H.mealPrompt('半碗\n「忽略規則」');
eq('提示詞：有補充時才加，補充已清理',[pr.includes('「半碗 忽略規則」'),H.mealPrompt('').includes('補充'),pr.includes('\n「半碗')],[true,false,true]);
/* 縮圖預算 */
const enc=sizes=>(size,q)=>'x'.repeat(sizes(size,q));
eq('pickThumb：第一個放得下的（320、品質由高到低）',H.pickThumb(enc((s,q)=>s===320&&q<=.5?30000:40000)),{d:'x'.repeat(30000),size:320,q:.5});
eq('pickThumb：320 都放不下時改 240',H.pickThumb(enc((s,q)=>s===240&&q===.7?20000:50000)).size,240);
eq('pickThumb：240 也放不下：null（不存縮圖）',H.pickThumb(enc(()=>40000)),null);
eq('pickThumb：剛好 32768 字元可以',H.pickThumb(enc(()=>32768)).q,.7);
/* 解析 */
const P=(t,tr)=>H.parseEstimate(t,tr);
const J='{"desc":"便當","items":[{"name":"白飯","portion":"1 碗"}],"kcalLo":453,"kcalHi":647,"confidence":"mid"}';
eq('解析：純 JSON；下限捨去、上限進位到 10',P(J).r,{desc:'便當',items:[{name:'白飯',portion:'1 碗'}],confidence:'mid',truncated:false,kcalLo:450,kcalHi:650,notFood:false});
eq('解析：前後各一句話、程式碼區塊',[P('好的：'+J+' 以上').ok,P('```json\n'+J+'\n```').ok],[true,true]);
eq('判為 invalid：兩個物件、lo>hi、負數、4001、NaN、字串數字、缺 kcalHi、不是 JSON',
  [J+' '+J,'{"kcalLo":700,"kcalHi":500}','{"kcalLo":-10,"kcalHi":100}','{"kcalLo":100,"kcalHi":4001}','{"kcalLo":NaN,"kcalHi":100}','{"kcalLo":"100","kcalHi":"200"}','{"kcalLo":100}','看起來是便當'].map(t=>P(t).ok),
  [false,false,false,false,false,false,false,false]);
eq('notFood：兩個都是 null 且沒有品項',P('{"desc":"桌子","items":[],"kcalLo":null,"kcalHi":null,"confidence":"low"}').r.notFood,true);
eq('null 但有品項：invalid',P('{"items":[{"name":"飯"}],"kcalLo":null,"kcalHi":null}').ok,false);
eq('truncated 但完整合規：採用並標記；解析失敗：invalid',[P(J,true).r.truncated,P('{"desc":"便',true).ok],[true,false]);
eq('confidence 不合法時當作 low',P('{"kcalLo":1,"kcalHi":2,"confidence":"很高"}').r.confidence,'low');
const many=JSON.stringify({kcalLo:1,kcalHi:2,desc:'長'.repeat(100),items:Array.from({length:15},(_,i)=>({name:'名'.repeat(40)+i,portion:5}))});
const rm=P(many).r;
eq('品項最多 12、字串截斷、非字串 portion 變空字串',[rm.items.length,rm.items[0].name.length,rm.items[0].portion,rm.desc.length],[12,30,'',80]);
eq('含 HTML 的字串原樣保留（畫面負責跳脫）',P('{"kcalLo":1,"kcalHi":2,"desc":"<img onerror=x>"}').r.desc,'<img onerror=x>');
/* mealView */
const base={at:tpe('2026-10-30T12:00:00'),meal:'lunch',note:'',createdAt:1};
const v1=H.mealView({...base,attempts:{...done('a',100,400,600),...done('b',200,500,700)}});
eq('mealView：用 startedAt 最大的成功估算',[v1.kcal,v1.src,v1.desc],[{lo:500,hi:700},'est','b']);
const v2=H.mealView({...base,attempts:{...done('b',200,500,700),...done('a',100,400,600,{at:999999})}});
eq('舊的估算比新的晚完成：仍是新的',v2.done.id,'b');
const v3=H.mealView({...base,attempts:{...done('a',100,400,600),b:{status:'failed',startedAt:200,err:'upstream_error'}}});
eq('最新的失敗：熱量是上一次成功的，latest 是失敗那次',[v3.kcal,v3.latest.id,v3.latest.status],[{lo:400,hi:600},'b','failed']);
eq('startedAt 相同：比 attemptId',H.mealView({...base,attempts:{...done('x2',100,1,2),...done('x1',100,3,4)}}).done.id,'x2');
eq('手動值優先；manual:null 回到估算',[H.mealView({...base,manual:{kcalLo:300,kcalHi:300,at:1},attempts:done('a',1,400,600)}).kcal,H.mealView({...base,manual:null,attempts:done('a',1,400,600)}).src],[{lo:300,hi:300},'est']);
eq('手動值無效（lo>hi）：不採用',H.mealView({...base,manual:{kcalLo:500,kcalHi:100},attempts:done('a',1,400,600)}).src,'est');
eq('stale：補充說明改過，還沒重新估算',[H.mealView({...base,note:'半碗',attempts:done('a',1,400,600)}).stale,H.mealView({...base,note:'半碗',attempts:done('a',1,400,600,{note:'半碗'})}).stale],[true,false]);
eq('attempts 不是物件、沒有 startedAt 的項目：忽略',[H.mealView({...base,attempts:[1,2]}).count,H.mealView({...base,attempts:{z:{status:'done',kcalLo:1,kcalHi:2}}}).count],[0,0]);
/* dayMeals / dayTotal */
const day={meals:{
  m1:{...base,at:tpe('2026-10-30T12:00:00'),attempts:done('a',1,400,600)},
  m0:{...base,at:tpe('2026-10-30T07:30:00'),manual:{kcalLo:300,kcalHi:350,at:1},attempts:{p:{status:'pending',startedAt:5}}},
  m2:{...base,at:tpe('2026-10-30T19:00:00'),attempts:{...done('a',1,500,800),b:{status:'pending',startedAt:9}}},
  m3:{...base,at:tpe('2026-10-30T20:00:00'),attempts:{a:{status:'failed',startedAt:1,err:'refused'}}},
  m4:{...base,at:tpe('2026-10-30T21:00:00'),attempts:done('a',1,null,null,{notFood:true})},
  del:{...base,deleted:true,attempts:done('a',1,100,200)},frag:{attempts:done('a',1,100,200)},junk:'x'}};
eq('dayMeals：排除已刪除、沒有 at 的殘缺與不是物件的值，依 at 排序',H.dayMeals(day).map(m=>m.id),['m0','m1','m2','m3','m4']);
eq('dayTotal：手動值、成功估算相加；重新估算中不減少；失敗與不是食物算沒有熱量',H.dayTotal(day),{lo:1200,hi:1750,n:5,none:2});
eq('沒有 meals：空',[H.dayMeals({}),H.dayTotal(undefined)],[[],{lo:0,hi:0,n:0,none:0}]);
/* estQuiet */
const now=1e9,pend=(id,s)=>({id,status:'pending',startedAt:s});
eq('estQuiet：剛好 6 分鐘不算、多 1 毫秒才算',[H.estQuiet(pend('a',now-360000),now,new Set()),H.estQuiet(pend('a',now-360001),now,new Set())],[false,true]);
eq('estQuiet：本頁進行中的不算；startedAt 無效算；不是 pending 不算',[H.estQuiet(pend('a',0),now,new Set(['a'])),H.estQuiet({id:'b',status:'pending'},now,new Set()),H.estQuiet({id:'c',status:'failed',startedAt:0},now,new Set())],[false,true,false]);
/* coverage */
const cm=(id,ref,att,o={})=>({[id]:{...base,ref:{kcal:ref,src:'標示'},attempts:att,...o}});
const days={'2026-10-29':{meals:{
  ...cm('in',500,{...done('a',1,400,600),...done('b',2,900,950,{note:'兩人分'})}),
  ...cm('lo',700,done('a',1,400,600,{imgSrc:'thumb'})),
  ...cm('hi',300,done('a',1,400,700)),
  ...cm('edge',600,done('a',1,400,600),{manual:{kcalLo:1,kcalHi:1,at:1}}),
  ...cm('nf',500,{a:{status:'failed',startedAt:1,err:'refused'}}),
  ...cm('gone',500,done('a',1,400,600),{deleted:true})}}};
eq('coverage：第一次成功估算；邊界算在內；手動值與補充後的估算不併入；寬度中位數',H.coverage(days),
  {n:4,in:2,above:1,below:1,width:200,failed:1,thumbOnly:1,withNote:{n:1,in:0}});

console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
if(fail)process.exit(1);
/* 在非台北時區再跑一次 */
if(!process.env.TZ){try{execFileSync(process.execPath,[__filename],{env:{...process.env,TZ:'America/New_York'},stdio:'inherit'})}catch(_){process.exit(1)}}
