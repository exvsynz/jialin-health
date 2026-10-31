/* 本機測試用的 window.claude 假物件（不可進入發布的 HTML）。
   db 依 0.2.92 起的行為，加上 0.2.94 的租約與容量錯誤；sample 依 0.2.94 的 sample.d.ts（docs/contract/0.2.94/）。
   db 的模擬：
   - update() 遇到不存在的文件 reject invalid_argument；巢狀物件遞迴合併，其他值整個取代
   - 快照非同步送出，data() 是 frozen
   - latencyComp:true 時，自己的寫入在 promise 完成前就送出快照（真實平台的行為）
   設定：在載入前指定 window.__mockCfg = {
     seed:{path:body}, latency:ms, latencyComp:bool, firstSnapDelay:ms, snapDelay:{path:ms},
     cacheFirst:{path:body|null}（先送 fromCache:true 的快照，serverDelay 毫秒後才送伺服器快照）, serverDelay:ms,
     failListen:[path], denyWrites:bool, failNext:{code,count}, canWrite:bool, noDb:bool,
     noDownloads:bool（沒有下載能力）, downloadError:code（下載時丟出這個錯誤，例如 'declined'）, downloadErrorCount:n（只有前 n 次丟錯）,
     downloadsReject:code（取得下載能力時就丟錯）, downloadsDelay:ms（取得下載能力要等多久）,
     acquireError:{code,count}（acquire 前 count 次丟出這個錯誤）, acquireDelay:ms, noAcquire:bool（文件參照沒有 acquire）,
     getDelay:{path:ms}（這個路徑下一次 get 要等多久，只作用一次）, quota:[路徑前綴]（set／update reject quota_exceeded）, failPath:{prefix,code,count}（這個前綴的寫入前 count 次失敗）, failGet:{prefix,code,count}（這個前綴的 get 前 count 次失敗）,
     sample:{…}（見檔尾 sample 的說明） }
   writes 的每一筆 set 會記下當時的租約 lease:{holder,valid}，用來檢查「只在持有租約時建立文件」。
   acquire() 依 db.d.ts 的租約語意：沒有人持有或已過期才給；不會自己建立文件。 */
(function(){
  const cfg=window.__mockCfg||{};
  const store=new Map(), listeners=new Set(), writes=[], leases=new Map(), reads=[], active={}, maxActive={};
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
  function gate(p){if(cfg.denyWrites)throw err('invalid_argument');if(p&&(cfg.quota||[]).some(q=>p.startsWith(q)))throw err('quota_exceeded');const fp=cfg.failPath;if(p&&fp&&fp.count>0&&p.startsWith(fp.prefix)){fp.count--;throw err(fp.code)}const f=cfg.failNext;if(f&&f.count>0){f.count--;throw err(f.code)}}
  /* apply → (latencyComp: notify now) → wait → (else: notify after) */
  async function write(op,p,apply,data){
    try{gate(p)}catch(e){await sleep(cfg.latency||0);throw e}
    const l=leases.get(p),lease=l?{holder:l.holder,valid:l.exp>Date.now()}:null;
    apply();if(cfg.latencyComp)notify(p);
    await sleep(cfg.latency||0);writes.push({op,path:p,data:clone(data),lease});if(!cfg.latencyComp)notify(p);
  }
  function listen(kind,p,next,error,snap){
    const l={kind,path:p,next,error,dead:false};listeners.add(l);
    const first=(cfg.snapDelay||{})[p]??cfg.firstSnapDelay??0;
    const cache=cfg.cacheFirst&&p in cfg.cacheFirst;
    if(cache)setTimeout(()=>{if(!l.dead)next(docSnap(p,cached,cfg.cacheFirst[p]))},first);
    setTimeout(()=>{if(l.dead)return;if((cfg.failListen||[]).includes(p)){l.dead=true;error&&error(err('revoked'));return}next(snap())},cache?first+(cfg.serverDelay??800):first);
    return()=>{l.dead=true;listeners.delete(l)};
  }
  function docRef(p){if(segs(p).length%2)throw new TypeError('document path needs an even number of segments: '+p);const r={
    id:segs(p).pop(),path:p,
    async get(){const gd=cfg.getDelay||{},ms=gd[p];if(ms!=null)delete gd[p];const k=segs(p)[0];reads.push(p);active[k]=(active[k]||0)+1;maxActive[k]=Math.max(maxActive[k]||0,active[k]);
      try{await sleep(ms??cfg.latency??0);const fg=cfg.failGet;if(fg&&fg.count>0&&p.startsWith(fg.prefix)){fg.count--;throw err(fg.code)}return docSnap(p)}finally{active[k]--}},
    set(d){return write('set',p,()=>store.set(p,clone(d)),d)},
    async update(d){if(!store.has(p)){await sleep(cfg.latency||0);throw err('invalid_argument')}return write('update',p,()=>store.set(p,merge(store.get(p),d)),d)},
    delete(){return write('delete',p,()=>store.delete(p))},
    onSnapshot(next,error){return listen('doc',p,next,error,()=>docSnap(p))},
    async acquire({holder,ttlMs}){await sleep(cfg.acquireDelay??cfg.latency??0);const ae=cfg.acquireError;if(ae&&ae.count>0){ae.count--;throw err(ae.code)}
      const now=Date.now(),l=leases.get(p);
      if(l&&l.exp>now&&l.holder!==holder)return{acquired:false,expiresAt:new Date(l.exp).toISOString()};
      const exp=now+Math.min(600000,Math.max(1000,ttlMs||30000));leases.set(p,{holder,exp});return{acquired:true,expiresAt:new Date(exp).toISOString()}},
    collection(sub){return colRef(p+'/'+sub)}
  };if(cfg.noAcquire)delete r.acquire;return r}
  function colRef(p){if(segs(p).length%2===0)throw new TypeError('collection path needs an odd number of segments: '+p);const q={
    path:p,
    doc(id){return docRef(p+'/'+(id||newId()))},
    async add(d){const r=docRef(p+'/'+newId());await r.set(d);return r},
    async get(){reads.push('collection:'+p);await sleep(cfg.latency||0);return colSnap(p)},
    onSnapshot(next,error){return listen('col',p,next,error,()=>colSnap(p))},
    where(){return q},orderBy(){return q},limit(){return q}
  };return q}
  const db={doc:docRef,collection:colRef};
  const user={can:async()=>cfg.canWrite===false?false:true,canEdit:async()=>cfg.canWrite!==false,isOwner:async()=>true,id:async()=>'u1',me:async()=>({id:'u1',name:''})};
  const downloads={async save(f){(window.__downloads=window.__downloads||[]).push(f.filename);if(cfg.downloadError&&(cfg.downloadErrorCount==null||cfg.downloadErrorCount-->0))throw err(cfg.downloadError);window.__lastDownload=f}};
  for(const[p,b]of Object.entries(cfg.seed||{}))store.set(p,clone(b));
  /* 測試用：不經過 onSnapshot 直接改資料，模擬另一台裝置的寫入尚未送達 */
  window.__mock={store,writes,cfg,leases,reads,maxActive,listenPaths:()=>[...listeners].filter(l=>!l.dead).map(l=>l.kind+':'+l.path),holdLease:(p,ms)=>leases.set(p,{holder:'other-device',exp:Date.now()+ms}),releaseLease:p=>leases.delete(p),silentSet:(p,b)=>store.set(p,clone(b)),silentDelete:p=>store.delete(p),externalSet:(p,b)=>{store.set(p,clone(b));notify(p)},
    /* 讓已經在運作的監聽中途失敗（例如連線中斷） */
    breakListener:p=>{for(const l of listeners)if(!l.dead&&l.path===p){l.dead=true;l.error&&l.error(err('unavailable'))}},
    /* 送出一份帶舊內容的快照給文件監聽者，不改 store：模擬另一台裝置延遲送達的舊快照 */
    staleSnapshot:(p,b)=>{for(const l of listeners)if(!l.dead&&l.kind==='doc'&&l.path===p)setTimeout(()=>!l.dead&&l.next(docSnap(p,meta,clone(b))),0)}};
  /* ---- sample（依 docs/contract/0.2.94/sample.d.ts）----
     cfg.sample = {
       absent:bool（use("sample") 回 null）, limitsReject:bool, limitsDelay:ms,
       images:{maxCount,maxInputBytes,mediaTypes} | null（null：沒宣告圖片）。不給時用 {maxCount:5,maxInputBytes:20000000,mediaTypes:[jpeg,png,webp,gif]},
       modelTiers:[…], tools:bool（limits 回報 tools；預設沒有）,
       consent:"grant"|"deny"|{wait:ms,answer?:"deny"}（同意視窗 wait 毫秒後才回答；中途取消的呼叫不影響視窗，之後的呼叫等同一個答案）, queueWait:ms（每次呼叫排隊的時間）,
       replies:[…]（依序取用；空了就用 reply）, reply:回覆（預設是一份合規的估算 JSON）, delay:ms（回覆前等待，可被 signal 中止）,
       tierApplied:"default"|…（預設等於要求的 tier）, noCache:bool（關掉快取，模擬盡力而為沒有命中） }
     回覆的形式：字串（成功）、{text, truncated:true}、{error:code, text?}。
     另外可在頁面設定 window.__mock.sampleRespond=(input,opts)=>回覆，優先於 replies。
     失敗一律 reject 成 plain object {code,message,text?}，不是 Error（型別定義的 SampleError）。
     快取照型別定義：鍵含 input、modelTier、model、effort、圖片位元組、呼叫方式；只存成功的回覆（含 truncated）；
     cache:false 不讀不存不共用；{gcTime,refresh}；相同的呼叫同時進行時共用結果。mock 的快取是確定的，正式平台是盡力而為。 */
  const sc=cfg.sample||{};
  const sampleCalls=[],scache=new Map(),sflight=new Map();let consentP=null,releaseHold=null;
  const holdP=sc.hold?new Promise(r=>releaseHold=r):null; // hold:true：所有估算等到 __mock.releaseSample() 才回覆
  const IMG_TYPES=['image/jpeg','image/png','image/webp','image/gif'];
  const imgLim=()=>sc.images===null?null:{maxCount:5,maxInputBytes:20000000,mediaTypes:IMG_TYPES.slice(),...(sc.images||{})};
  const sErr=(code,message,text)=>{const e={code,message:message||code};if(text!=null)e.text=text;return e};
  const isPlain=o=>o!==null&&typeof o==='object'&&Object.getPrototypeOf(o)===Object.prototype;
  const DEFAULT_REPLY='{"desc":"一碗白飯、一份炒青菜和滷雞腿","items":[{"name":"白飯","portion":"約 1 碗"},{"name":"炒青菜","portion":"約半盤"},{"name":"滷雞腿","portion":"1 隻"}],"kcalLo":550,"kcalHi":780,"confidence":"mid"}';
  function fnv(bytes,h=2166136261){for(let i=0;i<bytes.length;i++){h^=bytes[i];h=Math.imul(h,16777619)>>>0}return h.toString(16)}
  async function imgInfo(b){const bytes=new Uint8Array(await b.arrayBuffer());let w=null,h=null;try{const bm=await createImageBitmap(b);w=bm.width;h=bm.height;bm.close&&bm.close()}catch(_){}
    return{type:b.type,size:b.size,w,h,hash:fnv(bytes)}}
  function parseLoose(t){const tryj=x=>{try{return{ok:true,v:JSON.parse(x)}}catch(_){return{ok:false}}};
    let r=tryj(t.trim());if(r.ok)return r;const f=t.match(/```(?:json)?\s*([\s\S]*?)```/g);
    if(f&&f.length===1){r=tryj(f[0].replace(/^```(?:json)?\s*/,'').replace(/```$/,''));if(r.ok)return r}
    const i=Math.min(...['{','['].map(c=>{const k=t.indexOf(c);return k<0?Infinity:k})),j=Math.max(t.lastIndexOf('}'),t.lastIndexOf(']'));
    if(i<Infinity&&j>i)return tryj(t.slice(i,j+1));return{ok:false}}
  function validate(input,o){
    if(typeof input==='string'){if(!input.trim())return'input is empty'}
    else if(Array.isArray(input)){if(!input.length||input[0].role!=='user'||input[input.length-1].role!=='user')return'turns must start and end on a user turn';
      if(input.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content))return'bad turn'}
    else return'input must be a string or a list of turns';
    if(o===undefined)return null;if(!isPlain(o))return'options must be a plain object';
    if(o.signal!==undefined&&!(o.signal instanceof AbortSignal))return'signal must be an AbortSignal';
    if(o.onText!==undefined&&typeof o.onText!=='function')return'onText must be a function';
    if(o.modelTier!==undefined&&!['default','complex','quick','inherit'].includes(o.modelTier))return'unknown modelTier';
    if(o.cache!==undefined&&!(o.cache===true||o.cache===false||(isPlain(o.cache)&&(o.cache.gcTime===undefined||(Number.isFinite(o.cache.gcTime)&&o.cache.gcTime>0)))))return'bad cache';
    if(o.tools!==undefined&&o.cache!==undefined&&o.cache!==false)return'cache with tools';
    if(o.images!==undefined){const l=(o.images instanceof Blob)?[o.images]:Array.isArray(o.images)||(typeof FileList!=='undefined'&&o.images instanceof FileList)?[...o.images]:null;
      if(!l||l.some(b=>!(b instanceof Blob)))return'images must be Blobs'}
    return null}
  function nextReply(input,o){if(typeof window.__mock?.sampleRespond==='function')return window.__mock.sampleRespond(input,o);
    if(Array.isArray(sc.replies)&&sc.replies.length)return sc.replies.shift();return sc.reply??DEFAULT_REPLY}
  /* one consent dialog per view: a call that stops waiting is cancelled, but the dialog stays up and its answer governs every later call */
  function consentGate(signal){
    if(!consentP){const c=sc.consent,deny=c==='deny'||(isPlain(c)&&c.answer==='deny');consentP=sleep(isPlain(c)&&c.wait||0).then(()=>!deny)}
    return new Promise((res,rej)=>{if(signal&&signal.aborted)return rej(sErr('cancelled','aborted'));const on=()=>rej(sErr('cancelled','aborted'));
      signal&&signal.addEventListener('abort',on,{once:true});consentP.then(ok=>{signal&&signal.removeEventListener('abort',on);ok?res():rej(sErr('not_granted','declined'))})})}
  const abortable=(ms,signal)=>new Promise((res,rej)=>{if(!ms)return res();const t=setTimeout(res,ms);signal&&signal.addEventListener('abort',()=>{clearTimeout(t);rej('abort')},{once:true})});
  async function sampleCall(verb,input,o){
    await Promise.resolve(); // the request leaves on the next microtask
    const bad=validate(input,o);if(bad)throw sErr('invalid_request',bad);
    o=o||{};const signal=o.signal;if(signal&&signal.aborted)throw sErr('cancelled','aborted');
    const text0=typeof input==='string'?input:input.map(m=>m.content).join('\n');
    if(new TextEncoder().encode(text0).length>262144)throw sErr('prompt_too_large','over 256 KiB');
    if(o.tools!==undefined&&!sc.tools)throw sErr('tools_unavailable','no tools in this view');
    let imgs=[];
    if(o.images!==undefined){const lim=imgLim();if(!lim)throw sErr('images_unavailable','images not declared');
      const l=(o.images instanceof Blob)?[o.images]:[...o.images];
      if(l.length>lim.maxCount)throw sErr('image_rejected','too many images');
      for(const b of l){if(!IMG_TYPES.includes(b.type)||!lim.mediaTypes.includes(b.type))throw sErr('image_rejected','unsupported type '+b.type);if(b.size>lim.maxInputBytes)throw sErr('image_rejected','too large')}
      imgs=await Promise.all(l.map(imgInfo))}
    const tier=o.modelTier||'default';
    const key=JSON.stringify([verb,input,tier,o.model??null,o.effort??null,imgs.map(i=>i.hash)]);
    const rec={verb,input,opts:{modelTier:o.modelTier,cache:o.cache,model:o.model,effort:o.effort,signal:!!signal},images:imgs.map(({hash,...r})=>r),cached:false,upstream:false,at:Date.now()};
    sampleCalls.push(rec);
    const useCache=o.cache!==false&&!sc.noCache,refresh=isPlain(o.cache)&&o.cache.refresh===true,gc=isPlain(o.cache)&&o.cache.gcTime?Math.min(o.cache.gcTime,864e5):300000;
    const emit=t=>{if(o.onText&&!(signal&&signal.aborted))try{o.onText({text:t,delta:t})}catch(e){console.warn(e)}};
    if(useCache&&!refresh){const c=scache.get(key);if(c&&Date.now()-c.at<Math.min(gc,c.gc)){rec.cached=true;emit(c.res.text);return verb==='json'?parseLoose(c.res.text).v:{...c.res}}
      if(sflight.has(key)){rec.cached=true;const res=await sflight.get(key);emit(res.text);return verb==='json'?parseLoose(res.text).v:{...res}}}
    const run=(async()=>{
      await consentGate(signal);
      await abortable(sc.queueWait||0,signal).catch(()=>{throw sErr('cancelled','aborted')});
      if(holdP)await new Promise((res,rej)=>{holdP.then(res);signal&&signal.addEventListener('abort',()=>rej(sErr('cancelled','aborted')),{once:true})});
      rec.upstream=true;
      const r=nextReply(input,o);
      await abortable(sc.delay||0,signal).catch(()=>{throw sErr('cancelled','aborted')});
      if(r&&typeof r==='object'&&r.error)throw sErr(r.error,r.error,r.text);
      const text=typeof r==='string'?r:String(r.text??'');if(!text.trim())throw sErr('empty_completion','no text');
      return{text,truncated:!!(r&&r.truncated),modelTierApplied:sc.tierApplied||(tier==='inherit'?'default':tier)}})();
    if(useCache)sflight.set(key,run);
    let res;try{res=await run}finally{if(sflight.get(key)===run)sflight.delete(key)}
    if(signal&&signal.aborted)throw sErr('cancelled','aborted',res.text);
    if(verb==='json'){const p=parseLoose(res.text);if(!p.ok||res.truncated)throw sErr('invalid_json',p.ok?'cut short':'no JSON value',res.text);
      if(useCache)scache.set(key,{at:Date.now(),gc,res});emit(res.text);return p.v}
    if(useCache)scache.set(key,{at:Date.now(),gc,res});
    emit(res.text);return{...res}}
  const sample=(input,o)=>sampleCall('sample',input,o);
  sample.json=(input,o)=>sampleCall('json',input,o);
  sample.limits=async()=>{await sleep(sc.limitsDelay??5);if(sc.limitsReject)throw sErr('upstream_error','limits failed');const out={maxPromptBytes:262144};const l=imgLim();if(l)out.images=l;if(sc.tools)out.tools={maxCount:8};if(sc.modelTiers)out.modelTiers=sc.modelTiers.slice();return out};
  Object.freeze(sample);
  window.__mock.sampleCalls=sampleCalls;window.__mock.sampleCache=scache;window.__mock.releaseSample=()=>releaseHold&&releaseHold();
  window.claude={use:async name=>{await sleep(cfg.useDelay??20);if(name==='downloads'){if(cfg.downloadsReject)throw err(cfg.downloadsReject);await sleep(cfg.downloadsDelay||0)}if(cfg.noDb&&name==='db')return null;if(name==='sample')return sc.absent?null:sample;return name==='db'?db:name==='user'?user:name==='downloads'?(cfg.noDownloads?null:downloads):null}};
})();
