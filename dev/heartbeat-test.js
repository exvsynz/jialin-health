/* 心跳狀態測試：從 src/index.html 抽出 date helpers 與 heartbeat helpers 區塊執行，不複製程式碼。
   執行：node dev/heartbeat-test.js */
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.SRC?path.resolve(process.env.SRC):path.join(__dirname,'../src/index.html'),'utf8');
const block=n=>{const m=html.match(new RegExp('\\/\\* ---- '+n+' helpers: begin[^*]*\\*\\/([\\s\\S]*?)\\/\\* ---- '+n+' helpers: end ---- \\*\\/'));if(!m){console.error('找不到 '+n+' helpers 區塊標記');process.exit(2)}return m[1]};
const f=new Function(block('date')+block('heartbeat')+';return{hbStatus,HB_STALE_H}')();

let fail=0;
const eq=(name,got,want)=>{const ok=JSON.stringify(got)===JSON.stringify(want);if(!ok)fail++;console.log((ok?'  ok   ':'  FAIL ')+name+' → '+JSON.stringify(got)+(ok?'':'（應為 '+JSON.stringify(want)+'）'))};
const NOW=Date.parse('2026-10-31T09:00:00+08:00');
const H=36e5,ago=h=>new Date(NOW-h*H).toISOString(); // ISO 字串（UTC 表示），頁面要換算成台北時間
const st=(hb,now=NOW)=>f.hbStatus(hb,now);

eq('沒有心跳：提示尚未收到，不警示',[st(null).text,st(null).warn],['還沒有收到排程檢查。',false]);
const m={at:'2026-10-31T07:23:05+08:00',kind:'morning',date:'2026-10-31',missing:['服藥'],paused:false,ok:true,skipped:null,pushed:true};
eq('早上、缺服藥',[st(m).text,st(m).warn],['上次檢查 10/31（六）07:23・早上・缺服藥',false]);
eq('早上、兩項都缺',st({...m,missing:['早上體重','服藥']}).text,'上次檢查 10/31（六）07:23・早上・缺早上體重、服藥');
eq('晚上、都記了',st({...m,at:'2026-10-30T22:21:00+08:00',kind:'evening',missing:[],pushed:false}).text,'上次檢查 10/30（五）22:21・晚上・都記了');
eq('週報只寫週報',st({...m,at:'2026-11-01T20:14:00+08:00',kind:'weekly',missing:[]},Date.parse('2026-11-01T21:00:00+08:00')).text,'上次檢查 11/01（日）20:14・週報');
eq('暫停中',st({...m,missing:[],skipped:'paused',paused:true}).text,'上次檢查 10/31（六）07:23・早上・暫停中，未推播');
eq('提醒關閉',st({...m,missing:[],skipped:'off'}).text,'上次檢查 10/31（六）07:23・早上・提醒關閉，未推播');
eq('執行太晚',st({...m,missing:[],skipped:'late'}).text,'上次檢查 10/31（六）07:23・早上・執行太晚，未推播');
eq('ok:false 顯示讀取失敗',st({...m,ok:false,skipped:'error'}).text,'上次檢查 10/31（六）07:23・早上・讀取失敗');
eq('舊格式（只有 at）只顯示時間',st({at:'2026-10-31T07:23:05+08:00'}).text,'上次檢查 10/31（六）07:23');
eq('舊格式：未知 kind 不加說明',st({at:'2026-10-31T07:23:05+08:00',kind:'test',missing:[]}).text,'上次檢查 10/31（六）07:23');

// 26 小時邊界（剛好 26:00:00 不算）
eq('25:59 不警示',st({at:NOW-(25*60+59)*6e4}).warn,false);
eq('26:00 不警示',st({at:NOW-26*H}).warn,false);
eq('26:01 警示，時數正確',[st({at:NOW-(26*60+1)*6e4}).warn,st({at:NOW-(26*60+1)*6e4}).warnText],[true,'提醒可能停了：上次檢查是 26 小時前。']);
eq('33 小時前',st({at:ago(33.5)}).warnText,'提醒可能停了：上次檢查是 33 小時前。');
eq('門檻是 26 小時',f.HB_STALE_H,26);

// at 的格式
eq('at 是毫秒數字',st({at:Date.parse('2026-10-31T07:23:05+08:00'),kind:'morning',missing:[]}).text,'上次檢查 10/31（六）07:23・早上・都記了');
eq('at 是 UTC ISO：換算成台北',st({at:'2026-10-30T23:30:00Z'}).text,'上次檢查 10/31（六）07:30');
for(const bad of ['abc',null,{t:1},'',true,[]])eq('at 無法辨識：'+JSON.stringify(bad),[st({at:bad}).text,st({at:bad}).warn],['上次檢查時間無法辨識。',true]);
eq('at 比現在晚：當作 0 小時，不警示',st({at:NOW+3*H}).warn,false);
eq('台北午夜後的心跳日期正確',st({at:'2026-10-31T16:10:00Z'}).text,'上次檢查 11/01（日）00:10');

console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
process.exit(fail?1:0);
