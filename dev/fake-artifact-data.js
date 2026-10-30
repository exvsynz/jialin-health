/* ArtifactData 工具的測試替身（只用合成資料）。語意依工具說明：
   - get 回傳 {exists, data, version}；文件不存在不是錯誤
   - set：寫入已存在的文件必須帶 if_version，而且要等於目前版本，否則拒絕並回報目前版本；建立新文件不帶 if_version
   - list／query 用 limit 與 cursor 分頁，有下一頁才回 next_cursor
   失敗注入：failGet {path:次數}、failList {col:次數}、failSet 次數、beforeSet(path) 鉤子（模擬另一個工作階段搶先寫入）
   推播工具：push: 'sent' | 'not_sent' | 'throw' | null（沒有推播工具） */
function fakeApi({docs={},times=[],failGet={},failList={},failSet=0,beforeSet=null,push=null,pageSize=1000}={}){
  const store=new Map();let ver=1;
  for(const[p,d]of Object.entries(docs))if(d!==undefined&&d!==null)store.set(p,{data:JSON.parse(JSON.stringify(d)),version:ver++});
  const err=(code,extra={})=>Object.assign(new Error(code),{code,...extra});
  const calls=[],pushed=[];let ti=0;
  const take=(o,k)=>{if(o[k]>0){o[k]--;return true}return false};
  const page=(items,{limit=pageSize,cursor}={})=>{const start=cursor?Number(cursor):0,n=Math.min(limit,pageSize);const docs=items.slice(start,start+n);return{docs,next_cursor:start+n<items.length?String(start+n):undefined}};
  const colItems=col=>[...store.entries()].filter(([k])=>k.startsWith(col+'/')&&k.split('/').length===2).sort().map(([k,v])=>({id:k.split('/')[1],data:JSON.parse(JSON.stringify(v.data)),version:v.version}));
  const api={
    hasPush:push!==null,
    now(){const t=times[Math.min(ti,times.length-1)];ti++;return Date.parse(t)},
    async get(col,id){const p=col+'/'+id;calls.push(['get',p]);if(take(failGet,p))throw err('unavailable');const d=store.get(p);return d?{exists:true,data:JSON.parse(JSON.stringify(d.data)),version:d.version}:{exists:false}},
    async list(col,q={}){calls.push(['list',col,q.cursor||null]);if(take(failList,col))throw err('unavailable');return page(colItems(col),q)},
    async query(col,q={}){calls.push(['query',col,q.cursor||null]);if(take(failList,col))throw err('unavailable');
      const ok=d=>(q.where||[]).every(([f,op,v])=>op==='>='?d[f]>=v:op==='<='?d[f]<=v:op==='=='?d[f]===v:true);return page(colItems(col).filter(x=>ok(x.data)),q)},
    async set(col,id,data,ifVersion){const p=col+'/'+id;calls.push(['set',p,ifVersion??null]);
      if(beforeSet)beforeSet(p,store,()=>ver++);
      if(failSet>0){failSet--;throw err('unavailable')}
      const cur=store.get(p);
      if(cur&&ifVersion==null)throw err('version_required',{version:cur.version});
      if(cur&&ifVersion!==cur.version)throw err('conflict',{version:cur.version});
      if(!cur&&ifVersion!=null)throw err('conflict',{version:null});
      store.set(p,{data:JSON.parse(JSON.stringify(data)),version:ver++});return{version:store.get(p).version}},
    async push(message){calls.push(['push',message]);if(push==='throw')throw err('push_failed');pushed.push(message);return push},
  };
  return{api,store,calls,pushed,doc:p=>store.get(p)?.data};
}
module.exports={fakeApi};
