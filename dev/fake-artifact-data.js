/* ArtifactData 工具的測試替身（只用合成資料）。
   參數照工具的 JSON schema 檢查（2026-10-30 工作階段載入的工具說明）：action、url、collection（奇數段）、doc_id（單段）、
   data、if_version、query{where,limit,cursor}；不符合就記進 contractErrors 並拒絕。
   回傳的形狀是假設（工具說明只有參數 schema，沒有回傳格式）：get → {exists, data, version}；
   list／query → {docs:[{id,data,version}], next_cursor}；set → {version}。
   語意：寫入已存在的文件必須帶 if_version 而且等於目前版本；建立新文件不帶 if_version；有下一頁才回 next_cursor。
   失敗注入：failGet {路徑:次數}、failList {collection:次數}、failSet（提交前失敗的次數）、failSetAfterCommit（提交後才回報失敗的次數）、
   beforeSet(path, store, nextVer)：模擬另一個工作階段搶先寫入。
   推播工具：push 是 'sent' | 'not_sent' | 'throw' | 'unknown'（不丟錯，但回傳看不出結果）| 'requested'（回傳正式環境的「Mobile push requested.」）；null 表示沒有推播工具。pushAttempts 是呼叫紀錄，pushAccepted 只記回報已送出的。
   日曆工具：calendar 是 'created' | 'not_created' | 'throw' | 'unknown'；null 表示沒有日曆工具。calendarCalls 記每次建立活動的參數。 */
const URL='https://claude.ai/artifact/LJViyfLqXv2VdD5krdJahh';
const SEG='(?!\\.\\.?(?:\\/|$))[A-Za-z0-9_\\-.~:@+]{1,200}';
const COL_RE=new RegExp('^'+SEG+'(?:\\/'+SEG+'){0,14}$'),ID_RE=new RegExp('^'+SEG+'$');
const ACTIONS=['get','list','query','set','update','delete'],OPS=['eq','ne','in','not-in','lt','lte','gt','gte','array-contains','==','!=','<','<=','>','>='];
const KEYS=['action','url','collection','doc_id','data','if_version','query'];
function contract(a){
  const e=[];
  for(const k of Object.keys(a))if(!KEYS.includes(k))e.push('未知參數 '+k);
  if(!ACTIONS.includes(a.action))e.push('action 不對：'+a.action);
  if(a.url!==URL)e.push('url 不對：'+a.url);
  if(typeof a.collection!=='string'||!COL_RE.test(a.collection)||a.collection.split('/').length%2!==1)e.push('collection 不對：'+a.collection);
  const needId=['get','set','update','delete'].includes(a.action);
  if(needId&&(typeof a.doc_id!=='string'||!ID_RE.test(a.doc_id)))e.push('doc_id 不對：'+a.doc_id);
  if(!needId&&'doc_id' in a)e.push(a.action+' 不能帶 doc_id');
  if(['set','update'].includes(a.action)&&(!a.data||typeof a.data!=='object'||Array.isArray(a.data)))e.push('data 要是物件');
  if(!['set','update'].includes(a.action)&&'data' in a)e.push(a.action+' 不能帶 data');
  if('if_version' in a&&!(Number.isInteger(a.if_version)&&a.if_version>=1))e.push('if_version 要是 ≥1 的整數');
  if('if_version' in a&&!['set','update','delete'].includes(a.action))e.push(a.action+' 不能帶 if_version');
  if('query' in a){const q=a.query;
    if(!['list','query'].includes(a.action))e.push(a.action+' 不能帶 query');
    for(const k of Object.keys(q||{}))if(!['limit','cursor','where','order_by'].includes(k))e.push('query 未知參數 '+k);
    if('limit' in q&&!(Number.isInteger(q.limit)&&q.limit>=1&&q.limit<=1000))e.push('query.limit 要在 1–1000');
    if('cursor' in q&&typeof q.cursor!=='string')e.push('query.cursor 要是字串');
    if('order_by' in q&&(!q.order_by||typeof q.order_by.field!=='string'||('direction' in q.order_by&&!['asc','desc'].includes(q.order_by.direction))))e.push('query.order_by 格式不對');
    if('order_by' in q&&a.action!=='query')e.push('只有 query 能帶 order_by');
    if('where' in q){if(a.action!=='query')e.push('只有 query 能帶 where');if(!Array.isArray(q.where)||q.where.length>10||q.where.some(w=>!Array.isArray(w)||w.length!==3||typeof w[0]!=='string'||!OPS.includes(w[1])))e.push('query.where 格式不對')}}
  return e;
}
function fakeApi({docs={},times=[],failGet={},failList={},failSet=0,failSetAfterCommit=0,beforeSet=null,push=null,calendar=null,pageSize=1000}={}){
  const store=new Map();let ver=1;
  for(const[p,d]of Object.entries(docs))if(d!==undefined&&d!==null)store.set(p,{data:JSON.parse(JSON.stringify(d)),version:ver++});
  const err=(code,extra={})=>Object.assign(new Error(code),{code,...extra});
  const clone=o=>JSON.parse(JSON.stringify(o));
  const calls=[],contractErrors=[],pushAttempts=[],pushAccepted=[],calendarCalls=[];let ti=0;
  const take=(o,k)=>{if(o[k]>0){o[k]--;return true}return false};
  const page=(items,q={})=>{const start=q.cursor?Number(q.cursor):0,n=Math.min(q.limit||pageSize,pageSize);return{docs:items.slice(start,start+n),next_cursor:start+n<items.length?String(start+n):undefined}};
  const colItems=col=>[...store.entries()].filter(([k])=>k.startsWith(col+'/')&&k.split('/').length===col.split('/').length+1).sort().map(([k,v])=>({id:k.split('/').pop(),data:clone(v.data),version:v.version}));
  const api={
    hasPush:push!==null,hasCalendar:calendar!==null,
    async createEvent(ev){calendarCalls.push(clone(ev));if(calendar==='throw')throw err('calendar_failed');return calendar==='created'?{id:'ev'+calendarCalls.length,status:'confirmed'}:calendar==='not_created'?'not_created':undefined},
    now(){const t=times[Math.min(ti,times.length-1)];ti++;return Date.parse(t)},
    async call(a){
      const bad=contract(a);const path=a.collection+(a.doc_id?'/'+a.doc_id:'');
      calls.push({action:a.action,path,if_version:a.if_version??null,cursor:a.query?.cursor??null,data:a.data?clone(a.data):undefined});
      if(bad.length){contractErrors.push(...bad);throw err('contract',{detail:bad})}
      if(a.action==='get'){if(take(failGet,path))throw err('unavailable');const d=store.get(path);return d?{exists:true,data:clone(d.data),version:d.version}:{exists:false}}
      if(a.action==='list'||a.action==='query'){if(take(failList,a.collection))throw err('unavailable');
        const ok=d=>(a.query?.where||[]).every(([f,op,v])=>op==='>='||op==='gte'?d[f]>=v:op==='<='||op==='lte'?d[f]<=v:op==='<'||op==='lt'?d[f]<v:op==='=='||op==='eq'?d[f]===v:true);
        const items=colItems(a.collection).filter(x=>ok(x.data));
        if(a.query?.order_by){const {field,direction}=a.query.order_by,sgn=direction==='desc'?-1:1;items.sort((x,y)=>sgn*(x.data[field]<y.data[field]?-1:x.data[field]>y.data[field]?1:0));
          return{docs:items.slice(0,Math.min(a.query.limit||pageSize,pageSize))}} // 工具說明：有 order_by 的 query 只有一頁，沒有 next_cursor
        return page(items,a.query)}
      if(a.action==='set'){
        if(beforeSet)beforeSet(path,store,()=>ver++);
        if(failSet>0){failSet--;throw err('unavailable')}
        const cur=store.get(path);
        if(cur&&a.if_version==null)throw err('version_required',{version:cur.version});
        if(cur&&a.if_version!==cur.version)throw err('conflict',{version:cur.version});
        if(!cur&&a.if_version!=null)throw err('conflict',{version:null});
        store.set(path,{data:clone(a.data),version:ver++});
        if(failSetAfterCommit>0){failSetAfterCommit--;throw err('unavailable')} // 已寫入，但回應遺失
        return{version:store.get(path).version}}
      throw err('unsupported_in_fake');
    },
    async push(message){pushAttempts.push(message);if(push==='throw')throw err('push_failed');if(push==='sent'||push==='requested')pushAccepted.push(message);return push==='unknown'?undefined:push==='requested'?'Mobile push requested.':push},
  };
  return{api,store,calls,contractErrors,pushAttempts,pushAccepted,calendarCalls,doc:p=>store.get(p)?.data,URL,contract};
}
module.exports={fakeApi,URL,contract};
