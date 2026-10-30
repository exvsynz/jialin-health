/* 本機測試用的 window.claude 假物件（不可進入發布的 HTML）。
   依 Artifact runtime contract 0.2.92 的 db.d.ts 模擬：
   - update() 遇到不存在的文件 reject invalid_argument；巢狀物件遞迴合併，其他值整個取代
   - 快照非同步送出，data() 是 frozen
   - latencyComp:true 時，自己的寫入在 promise 完成前就送出快照（真實平台的行為）
   設定：在載入前指定 window.__mockCfg = {
     seed:{path:body}, latency:ms, latencyComp:bool, firstSnapDelay:ms, snapDelay:{path:ms},
     cacheFirst:{path:body|null}（先送 fromCache:true 的快照，serverDelay 毫秒後才送伺服器快照）, serverDelay:ms,
     failListen:[path], denyWrites:bool, failNext:{code,count}, canWrite:bool, noDb:bool,
     noDownloads:bool（沒有下載能力）, downloadError:code（下載時丟出這個錯誤，例如 'declined'） }
   acquire() 依 db.d.ts 的租約語意：沒有人持有或已過期才給；不會自己建立文件。 */
(function(){
  const cfg=window.__mockCfg||{};
  const store=new Map(), listeners=new Set(), writes=[], leases=new Map();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const clone=o=>o==null?o:JSON.parse(JSON.stringify(o));
  const freeze=o=>{if(o&&typeof o==='object'){Object.freeze(o);Object.values(o).forEach(freeze)}return o};
  const err=code=>Object.assign(new Error(code),{code,message:code});
  const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const merge=(a,b)=>{const o={...a};for(const[k,v]of Object.entries(b))o[k]=isObj(v)&&isObj(a[k])?merge(a[k],v):clone(v);return o};
  const segs=p=>p.split('/').filter(Boolean);
  const parentOf=p=>segs(p).slice(0,-1).join('/');
  let auto=0;const newId=()=>'m'+(auto++).toString(36)+Math.random().toString(36).slice(2,8);
  const meta={fromCache:false,hasPendingWrites:false},cached={fromCache:true,hasPendingWrites:false};
  const docSnap=(p,m=meta,b=store.get(p))=>({id:segs(p).pop(),exists:b!==undefined&&b!==null,data:()=>b==null?undefined:freeze(clone(b)),metadata:m});
  const colSnap=c=>{const docs=[...store.keys()].filter(k=>parentOf(k)===c).sort().map(k=>docSnap(k));return{docs,size:docs.length,empty:!docs.length,docChanges:()=>[],metadata:meta}};
  function notify(p){for(const l of listeners){if(l.dead)continue;if(l.kind==='doc'&&l.path===p)setTimeout(()=>!l.dead&&l.next(docSnap(p)),0);if(l.kind==='col'&&l.path===parentOf(p))setTimeout(()=>!l.dead&&l.next(colSnap(l.path)),0)}}
  function gate(){if(cfg.denyWrites)throw err('invalid_argument');const f=cfg.failNext;if(f&&f.count>0){f.count--;throw err(f.code)}}
  /* apply → (latencyComp: notify now) → wait → (else: notify after) */
  async function write(op,p,apply,data){
    try{gate()}catch(e){await sleep(cfg.latency||0);throw e}
    apply();if(cfg.latencyComp)notify(p);
    await sleep(cfg.latency||0);writes.push({op,path:p,data:clone(data)});if(!cfg.latencyComp)notify(p);
  }
  function listen(kind,p,next,error,snap){
    const l={kind,path:p,next,error,dead:false};listeners.add(l);
    const first=(cfg.snapDelay||{})[p]??cfg.firstSnapDelay??0;
    const cache=cfg.cacheFirst&&p in cfg.cacheFirst;
    if(cache)setTimeout(()=>{if(!l.dead)next(docSnap(p,cached,cfg.cacheFirst[p]))},first);
    setTimeout(()=>{if(l.dead)return;if((cfg.failListen||[]).includes(p)){l.dead=true;error&&error(err('revoked'));return}next(snap())},cache?first+(cfg.serverDelay??800):first);
    return()=>{l.dead=true;listeners.delete(l)};
  }
  function docRef(p){if(segs(p).length%2)throw new TypeError('document path needs an even number of segments: '+p);return{
    id:segs(p).pop(),path:p,
    async get(){await sleep(cfg.latency||0);return docSnap(p)},
    set(d){return write('set',p,()=>store.set(p,clone(d)),d)},
    async update(d){if(!store.has(p)){await sleep(cfg.latency||0);throw err('invalid_argument')}return write('update',p,()=>store.set(p,merge(store.get(p),d)),d)},
    delete(){return write('delete',p,()=>store.delete(p))},
    onSnapshot(next,error){return listen('doc',p,next,error,()=>docSnap(p))},
    async acquire({holder,ttlMs}){await sleep(cfg.latency||0);const now=Date.now(),l=leases.get(p);
      if(l&&l.exp>now&&l.holder!==holder)return{acquired:false,expiresAt:new Date(l.exp).toISOString()};
      const exp=now+Math.min(600000,Math.max(1000,ttlMs||30000));leases.set(p,{holder,exp});return{acquired:true,expiresAt:new Date(exp).toISOString()}},
    collection(sub){return colRef(p+'/'+sub)}
  }}
  function colRef(p){if(segs(p).length%2===0)throw new TypeError('collection path needs an odd number of segments: '+p);const q={
    path:p,
    doc(id){return docRef(p+'/'+(id||newId()))},
    async add(d){const r=docRef(p+'/'+newId());await r.set(d);return r},
    async get(){await sleep(cfg.latency||0);return colSnap(p)},
    onSnapshot(next,error){return listen('col',p,next,error,()=>colSnap(p))},
    where(){return q},orderBy(){return q},limit(){return q}
  };return q}
  const db={doc:docRef,collection:colRef};
  const user={can:async()=>cfg.canWrite===false?false:true,canEdit:async()=>cfg.canWrite!==false,isOwner:async()=>true,id:async()=>'u1',me:async()=>({id:'u1',name:''})};
  const downloads={async save(f){if(cfg.downloadError)throw err(cfg.downloadError);window.__lastDownload=f}};
  for(const[p,b]of Object.entries(cfg.seed||{}))store.set(p,clone(b));
  /* 測試用：不經過 onSnapshot 直接改資料，模擬另一台裝置的寫入尚未送達 */
  window.__mock={store,writes,cfg,leases,holdLease:(p,ms)=>leases.set(p,{holder:'other-device',exp:Date.now()+ms}),releaseLease:p=>leases.delete(p),silentSet:(p,b)=>store.set(p,clone(b)),silentDelete:p=>store.delete(p),externalSet:(p,b)=>{store.set(p,clone(b));notify(p)},
    /* 讓已經在運作的監聽中途失敗（例如連線中斷） */
    breakListener:p=>{for(const l of listeners)if(!l.dead&&l.path===p){l.dead=true;l.error&&l.error(err('unavailable'))}},
    /* 送出一份帶舊內容的快照給文件監聽者，不改 store：模擬另一台裝置延遲送達的舊快照 */
    staleSnapshot:(p,b)=>{for(const l of listeners)if(!l.dead&&l.kind==='doc'&&l.path===p)setTimeout(()=>!l.dead&&l.next(docSnap(p,meta,clone(b))),0)}};
  window.claude={use:async name=>{await sleep(cfg.useDelay??20);if(cfg.noDb&&name==='db')return null;return name==='db'?db:name==='user'?user:name==='downloads'?(cfg.noDownloads?null:downloads):null}};
})();
