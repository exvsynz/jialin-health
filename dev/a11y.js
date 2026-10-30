/* 版面自動檢查（在頁面內執行）：觸控目標、文字對比。被 e2e.js 使用。
   例外：[data-small-ok] 內的元件；停用的控制項；刻意淡化的預設值（.ghostval、.untouched）。 */
module.exports.scan=()=>{
  const parse=c=>{const m=c.match(/[\d.]+/g);return m?m.map(Number):[0,0,0,0]};
  const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const visible=el=>{if(el.closest('[hidden],dialog:not([open])'))return false;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return false;const b=el.getBoundingClientRect();return b.width>0&&b.height>0};
  const bgOf=el=>{for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor);if(c.length<4||c[3]>0.5)return c.slice(0,3)}return parse(getComputedStyle(document.body).backgroundColor).slice(0,3)};
  const name=el=>(el.id?'#'+el.id:el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\s+/).join('.'):''))+(el.textContent.trim()?' 「'+el.textContent.trim().slice(0,10)+'」':'');
  const small=[],low=[];
  for(const el of document.querySelectorAll('button,input,select,summary,[role=button]')){
    if(!visible(el)||el.disabled||el.closest('[data-small-ok]'))continue;
    const b=el.getBoundingClientRect();if(b.width<43.5||b.height<43.5)small.push(name(el)+` ${Math.round(b.width)}×${Math.round(b.height)}`);
  }
  for(const el of document.querySelectorAll('body *')){
    if(!visible(el)||['svg','path','circle','polyline','line','rect','text','g'].includes(el.tagName.toLowerCase()))continue;
    const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(!own)continue;
    if(el.closest('.ghostval .big,.untouched,:disabled,[aria-disabled=true],[aria-hidden=true]'))continue;
    let op=1;for(let e=el;e;e=e.parentElement)op*=parseFloat(getComputedStyle(e).opacity);
    const cs=getComputedStyle(el);const fg=parse(cs.color);const bg=bgOf(el);
    const a=(fg[3]??1)*op;const mix=fg.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a));
    const r=ratio(mix,bg);const px=parseFloat(cs.fontSize),bold=+cs.fontWeight>=700;const need=(px>=24||(px>=18.66&&bold))?3:4.5;
    if(r<need-0.05)low.push(name(el)+` ${r.toFixed(2)}:1`);
  }
  return{small:[...new Set(small)],low:[...new Set(low)]};
};
