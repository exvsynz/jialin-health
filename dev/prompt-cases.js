/* 提示詞範例句對應的情境（合成資料）。ops/scheduled/*.md 裡 [例 id] 那一行「」內的句子，
   必須等於 dev/remind-ref.js 對這裡同一情境算出的 msg。dev/prompt-test.js 會比對。 */
const SAT='2026-10-31',SUN='2026-11-01';
const am={w:52.1,bf:24,at:'07:10'},med={taken:true,at:'07:15',dose:50},pm={w:52.6,at:'22:05'};
const st=(days={},o={})=>({profile:{},days,exercise:[],records:[],heartbeat:null,...o});
const rec=(exam,date,o={})=>({exam,date,preset:null,interval:12,nextDue:null,createdAt:1,...o});
const week=()=>{const d={},ws=[52.1,52.4,null,52.3,52.0,52.6,52.5];['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30',SAT,SUN].forEach((k,i)=>{d[k]={date:k,med};if(ws[i]!=null)d[k].am={w:ws[i]}});return d};
const runs=()=>{const now=Date.parse(SUN+'T20:14:00+08:00'),r=[];for(let i=0;i<7;i++){r.push({at:new Date(now-i*864e5-12.9*36e5).toISOString(),kind:'morning',date:'2026-10-'+(25+i)});r.push({at:new Date(now-i*864e5-22*36e5+0.1*36e5).toISOString(),kind:'evening',date:'2026-10-'+(24+i)})}return r};
module.exports={
  'm-both':['morning',SAT+'T07:23:00+08:00',st()],
  'm-med':['morning',SAT+'T07:23:00+08:00',st({[SAT]:{am}})],
  'e-pm':['evening',SAT+'T22:21:00+08:00',st({[SAT]:{am,med}})],
  'e-exam':['evening',SAT+'T22:21:00+08:00',st({[SAT]:{am,med}},{records:[rec('thy_lab','2026-05-07',{interval:6})]})],
  'e-many':['evening',SAT+'T22:21:00+08:00',st({},{records:[rec('breast_us','2025-06-01'),rec('thy_us','2026-10-20',{interval:0})]})],
  'e-recheck':['evening',SAT+'T22:21:00+08:00',st({[SAT]:{am,med}},{meddose:[{id:'m2',kind:'dose',date:'2026-10-01',dose:75,createdAt:1}],profile:{tshRecheckWeeks:5}})],
  'e-food':['evening',SAT+'T22:21:00+08:00',st({[SAT]:{am,med,pm}},{profile:{remind:{food:true}}})],
  'e-legacy':['evening',SAT+'T22:21:00+08:00',st({[SAT]:{am,med}},{records:[rec('thy_lab','2026-05-03',{interval:null})]})],
  'w-full':['weekly',SUN+'T20:14:00+08:00',st(week(),{profile:{lastExport:'2026/09/20'},heartbeat:{recent:runs()},exercise:[{date:'2026-10-26',min:60},{date:'2026-10-29',min:50},{date:SUN,min:70}],records:[rec('breast_us','2025-11-12'),rec('thy_lab','2026-05-30',{interval:6})]})],
  'w-empty':['weekly',SUN+'T20:14:00+08:00',st({},{profile:{lastExport:'2026/10/30'}})],
  'err':['morning',SAT+'T07:23:00+08:00',st({},{readError:true})],
};
