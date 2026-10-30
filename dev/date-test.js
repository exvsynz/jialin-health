/* 日期邏輯測試：直接從 src/index.html 抽出 date helpers 區塊執行，不複製程式碼。
   執行：node dev/date-test.js */
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
const m=html.match(/\/\* ---- date helpers: begin[^*]*\*\/([\s\S]*?)\/\* ---- date helpers: end ---- \*\//);
if(!m){console.error('找不到 date helpers 區塊標記');process.exit(2)}

const RealDate=Date;let fake=0;
class FakeDate extends RealDate{constructor(...a){a.length?super(...a):super(fake)}static now(){return fake}}
const f=new Function('Date',m[1]+';return{logicalToday,addMonths,addDays,wd,nowHM,dnum,dstr}')(FakeDate);
const at=iso=>{fake=new RealDate(iso).getTime()};

let fail=0;
const eq=(name,got,want)=>{const ok=got===want;if(!ok)fail++;console.log((ok?'  ok   ':'  FAIL ')+name+' → '+got+(ok?'':'（應為 '+want+'）'))};

// 台北時區與凌晨 4 點換日
at('2026-10-30T03:59:00+08:00');eq('台北 03:59 算前一天',f.logicalToday(),'2026-10-29');
at('2026-10-30T04:00:00+08:00');eq('台北 04:00 換日',f.logicalToday(),'2026-10-30');
at('2026-10-29T20:30:00Z');eq('UTC 20:30 = 台北 04:30',f.logicalToday(),'2026-10-30');
at('2026-10-29T19:59:00Z');eq('UTC 19:59 = 台北 03:59',f.logicalToday(),'2026-10-29');
at('2027-01-01T02:00:00+08:00');eq('元旦凌晨 2 點算前一年 12/31',f.logicalToday(),'2026-12-31');
at('2026-03-01T03:00:00+08:00');eq('3/1 凌晨 3 點算 2/28',f.logicalToday(),'2026-02-28');
at('2026-10-30T00:05:00+08:00');eq('nowHM 用台北時間',f.nowHM(),'00:05');
// 月底加月份
eq('1/31 + 1 個月',f.addMonths('2026-01-31',1),'2026-02-28');
eq('閏年 1/31 + 1 個月',f.addMonths('2028-01-31',1),'2028-02-29');
eq('8/31 + 6 個月',f.addMonths('2026-08-31',6),'2027-02-28');
eq('10/31 + 1 個月',f.addMonths('2026-10-31',1),'2026-11-30');
eq('12/15 + 120 個月',f.addMonths('2025-12-15',120),'2035-12-15');
eq('11/30 + 3 個月跨年',f.addMonths('2026-11-30',3),'2027-02-28');
// 日期加減與星期
eq('3/1 − 1 天',f.addDays('2026-03-01',-1),'2026-02-28');
eq('12/31 + 1 天',f.addDays('2026-12-31',1),'2027-01-01');
eq('2026-10-30 是週五',f.wd('2026-10-30'),'五');

console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
process.exit(fail?1:0);
