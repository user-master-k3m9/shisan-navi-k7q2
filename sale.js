// 売り出し中の物件（SUUMO）：Macが読み、暗号化してこの端末にだけ届ける（個人の私的利用）
const SDEF={t:'m',pref:'13',codes:[],kb:'',kt:'',mb:'',mt:'',et:0,cn:0,pages:2,noFlood:false,noSlide:false,noLiq:false,noFire:false,cheap:false};
let FS=Object.assign({},SDEF,LS.get('salefilter',{}));
const SALE={items:null,at:'',ssort:LS.get('ssort','score'),busy:false};

// ---------- 暗号（この端末だけが読めるように） ----------
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u)));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function newKeys(){const k=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);return {k,pk:b64(await crypto.subtle.exportKey('raw',k.publicKey))}}
async function decryptFrom(keys,env){
  const epk=await crypto.subtle.importKey('raw',unb64(env.epk),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const bits=await crypto.subtle.deriveBits({name:'ECDH',public:epk},keys.k.privateKey,256);
  const hk=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new Uint8Array(32),info:new TextEncoder().encode('shisan')},hk,{name:'AES-GCM',length:256},false,['decrypt']);
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(env.iv)},key,unb64(env.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
// Macに依頼して、結果を受け取る
async function askMac(type,body,onStep){
  const keys=await newKeys(),rid=Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>x.toString(16).padStart(2,'0')).join('');
  return new Promise((res,rej)=>{
    let done=false,heard=false;const es=new EventSource(NTFY+TOPIC+'-r-'+rid+'/sse');
    const end=(f,v)=>{if(done)return;done=true;try{es.close()}catch(e){}f(v)};
    es.onmessage=async ev=>{let m;try{m=JSON.parse(ev.data)}catch(e){return}heard=true;
      if(m.attachment&&m.attachment.url){try{onStep&&onStep('受け取りました。開いています…');const env=await (await fetch(m.attachment.url)).json();end(res,await decryptFrom(keys,env))}catch(e){end(rej,new Error('受け取った結果を開けませんでした。'))}return}
      const [k,t]=String(m.message||'').split('|');if(k==='error')end(rej,new Error(t));else if(t&&onStep)onStep(t)};
    setTimeout(()=>{fetch(NTFY+TOPIC,{method:'POST',body:JSON.stringify(Object.assign({t:type,rid,pk:keys.pk},body))}).catch(()=>end(rej,new Error('合図を送れませんでした。電波の良い所でもう一度試してください。')))},1000);
    setTimeout(()=>{if(!heard)end(rej,new Error('Macから返事がありません。Macの電源が切れているかスリープ中です。Macを開いてからもう一度押してください。'))},45000);
    setTimeout(()=>end(rej,new Error('時間がかかりすぎました。もう一度試してください。')),240000);
  });
}

// ---------- 検索画面 ----------
const SKIND={m:['中古マンション','mansion'],h:['中古一戸建て','house'],l:['土地','land']};
function renderSaleSearch(m){
  const munis=Object.entries(D.muni).filter(([c])=>c.slice(0,2)===FS.pref&&P.some(p=>p.c===c)).sort((a,b)=>a[0].localeCompare(b[0]));
  m.innerHTML=modeSwitch()+(SALE.items?`<button class="btn sub" style="margin-bottom:10px" onclick="go('list')">前回の結果を見る（${SALE.items.length}件・${esc(SALE.at)}）</button>`:'')+`<div id="s_msg" class="note" style="margin-bottom:8px"></div>`+bookmarkletBox()+`<div class="card"><h2>Macを使って条件でさがす</h2>
  <div class="note">Macの電源が入っているときは、条件を選ぶだけで、MacがSUUMOの一覧を読んで評価を付けて届けます（暗号化。公開ページには載りません）。</div>
  <label class="f">種類</label><div class="chips">${Object.entries(SKIND).map(([k,[n]])=>`<button class="chip ${FS.t===k?'on':''}" onclick="FS.t='${k}';renderSaleSearch($('#main'))">${n}</button>`).join('')}</div>
  <label class="f">都県</label><div class="chips">${PREFS.map(([c,n])=>`<button class="chip ${FS.pref===c?'on':''}" onclick="FS.pref='${c}';FS.codes=[];renderSaleSearch($('#main'))">${n}</button>`).join('')}</div>
  <label class="f">市区町村（1〜5つ選ぶ）</label>
  <div class="muni">${munis.map(([c,v])=>`<label><input type="checkbox" ${FS.codes.includes(c)?'checked':''} onchange="FS.codes=this.checked?[...FS.codes,'${c}']:FS.codes.filter(x=>x!=='${c}')">${esc(v[1])}</label>`).join('')}</div>
  <label class="f">価格</label>${rangeSel('s_kb','s_kt',[500,1000,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500,7000,7500,8000,9000,10000,12000,15000,20000],FS.kb,FS.kt,manFmt)}
  ${FS.t==='m'?`<label class="f">専有面積</label>${rangeSel('s_mb','s_mt',[20,30,40,50,60,70,80,90,100,120],FS.mb,FS.mt,v=>v+'㎡')}`:''}
  <label class="f">駅からの徒歩</label><div class="chips">${[[0,'指定なし'],[3,'3分以内'],[5,'5分以内'],[7,'7分以内'],[10,'10分以内'],[15,'15分以内']].map(([k,n])=>`<button class="chip ${FS.et==k?'on':''}" onclick="FS.et=${k};renderSaleSearch($('#main'))">${n}</button>`).join('')}</div>
  ${FS.t!=='l'?`<label class="f">築年数</label><div class="chips">${[[0,'指定なし'],[5,'5年以内'],[10,'10年以内'],[15,'15年以内'],[20,'20年以内'],[30,'30年以内']].map(([k,n])=>`<button class="chip ${FS.cn==k?'on':''}" onclick="FS.cn=${k};renderSaleSearch($('#main'))">${n}</button>`).join('')}</div>`:''}
  <label class="f">こだわり条件（評価のあとで絞り込み）</label>
  ${[['cheap','相場より割安（相場の90%未満）'],['noFlood','洪水・高潮・津波の浸水想定なし'],['noSlide','土砂災害の区域外'],['noLiq','液状化しやすい地形を除く'],['noFire','火災危険度3以上を除く（東京都）']].map(([k,n])=>`<label class="ck"><input type="checkbox" ${FS[k]?'checked':''} onchange="FS.${k}=this.checked;SALE.res=null">${n}</label>`).join('')}
  <label class="f">読む件数</label><div class="chips">${[[1,'最大50件'],[2,'最大100件'],[4,'最大200件']].map(([k,n])=>`<button class="chip ${FS.pages==k?'on':''}" onclick="FS.pages=${k};renderSaleSearch($('#main'))">${n}</button>`).join('')}</div>
  <div style="height:12px"></div><button class="btn" id="s_go" onclick="doSaleSearch()">売り出し中の物件をさがす</button>
</div>`;
  for(const k of ['kb','kt','mb','mt']){const el=$('#s_'+k);if(el)el.onchange=e=>{FS[k]=e.target.value}}
}
async function doSaleSearch(){
  const msg=$('#s_msg'),btn=$('#s_go');
  if(!FS.codes.length){msg.textContent='市区町村を1つ以上選んでください。';return}
  if(FS.codes.length>5){msg.textContent='市区町村は5つまでにしてください。';return}
  LS.set('salefilter',FS);btn.disabled=true;
  try{
    const q={t:FS.t,pref:FS.pref,codes:FS.codes,kb:FS.kb,kt:FS.kt,mb:FS.mb,mt:FS.mt,et:FS.et||'',cn:FS.cn||'',pages:FS.pages};
    const r=await askMac('search',{q},t=>{msg.textContent=t});
    msg.textContent=`${r.items.length}件を評価しています…`;
    await scoreSale(r.items,(i,n)=>{msg.textContent=`評価しています… ${i}/${n}（災害・地震・相場を調べています）`});
    SALE.items=r.items;SALE.at=r.at;SALE.res=null;await idbSet('sale:last',{items:r.items,at:r.at}).catch(()=>{});
    shown=40;go('list');
  }catch(e){msg.textContent=e.message||String(e)}
  btn.disabled=false;
}
// 1件ずつ：位置→災害・地震→相場と比べて評価（結果は端末に覚えておく）
async function scoreSale(items,prog){
  const cache=(await idbGet('sale:geo').catch(()=>null))||{};let i=0;
  for(const x of items)x.code=codeFromAddr(x.addr)||FS.codes.find(c=>D.muni[c]&&x.addr.includes(D.muni[c][1]))||FS.codes[0];
  for(const c of [...new Set(items.map(x=>x.code).filter(Boolean))])await loadTx(c).catch(()=>null);
  const work=async x=>{
    try{
      let g=cache[x.addr];
      if(!g){const a=await geocode(x.addr);const [hz,qk]=await Promise.all([hazardAt(a.lat,a.lon),quakeAt(a.lat,a.lon)]);g={lat:a.lat,lon:a.lon,title:a.title,hz,qk};cache[x.addr]=g}
      const code=x.code;
      const age=x.by?Math.max(0,new Date().getFullYear()-x.by):'';
      const e={kind:SKIND[x.t][1],price:x.price?String(x.price):'',area:x.area?String(x.area):'',barea:x.barea?String(x.barea):'',age:age===''?'':String(age),stn:x.stn,walk:x.walk!=null?String(x.walk):'',plan:x.plan,url:x.url};
      const ev=evaluate(e,{lat:g.lat,lon:g.lon,title:g.title,qk:g.qk},g.hz,code);
      x.ev={r:ev.r,ratio:ev.val?ev.val.ratio:null,est:ev.val?ev.val.est:null,code,lat:g.lat,lon:g.lon,hz:g.hz,qk:g.qk,fr:ev.f.fr};x.e=e;
    }catch(err){x.ev=null}
    i++;prog&&prog(i,items.length);
  };
  for(let k=0;k<items.length;k+=4)await Promise.all(items.slice(k,k+4).map(work));
  idbSet('sale:geo',cache).catch(()=>{});
}

// ---------- 一覧 ----------
const SSORT={score:['評価が高い順',(a,b)=>(b.ev?b.ev.r.total:-1)-(a.ev?a.ev.r.total:-1)],cheap:['割安な順（相場比）',(a,b)=>((a.ev&&a.ev.ratio)??9)-((b.ev&&b.ev.ratio)??9)],price:['安い順',(a,b)=>(a.price||9e9)-(b.price||9e9)],dear:['高い順',(a,b)=>(b.price||0)-(a.price||0)],walk:['駅に近い順',(a,b)=>(a.walk??99)-(b.walk??99)],newer:['築年数が新しい順',(a,b)=>(b.by||0)-(a.by||0)],area:['広い順',(a,b)=>(b.area||0)-(a.area||0)],station:['駅ごと（利用者の多い駅から）',(a,b)=>stCmp(a.stn,b.stn)||(a.walk??99)-(b.walk??99)],pj:['再開発・新駅の効果が大きい順',(a,b)=>pjCmpV(a.ev&&a.ev.r,b.ev&&b.ev.r)],pjyear:['再開発・新駅の完成が早い順',(a,b)=>pjCmpY(a.ev&&a.ev.r,b.ev&&b.ev.r)||pjCmpV(a.ev&&a.ev.r,b.ev&&b.ev.r)]};
function saleFilt(){return (SALE.items||[]).filter(x=>{const v=x.ev;
  if(FS.cheap&&!(v&&v.ratio!=null&&v.ratio<0.9))return false;
  if(FS.noFlood&&v&&(v.hz.flood||v.hz.surge||v.hz.tsunami))return false;
  if(FS.noSlide&&v&&(v.hz.debris||v.hz.slope||v.hz.slide))return false;
  if(FS.noLiq&&v&&v.qk&&liqLand(v.qk[3]))return false;
  if(FS.noFire&&v&&v.fr&&v.fr[1]>=3)return false;
  if(SALE.stF&&x.stn!==SALE.stF)return false;return true})}
function saleItemHtml(x,i){
  const v=x.ev,g=v?v.r.grade:'D',rt=v?ratioTag(v.ratio):null,age=x.by?new Date().getFullYear()-x.by:null;
  const hz=v?v.r.tags.filter(t=>/浸水|土砂|液状化|火災|倒壊/.test(t[0])):[];
  return `<div class="item" style="flex-wrap:wrap">
    <div class="grade g${v?g:'D'}"><b>${v?g:'－'}</b><small>${v?v.r.total+'点':'評価不可'}</small></div>
    <div style="flex:1;min-width:0">
      <div style="color:var(--good);font-weight:700">売り出し中</div>
      <div class="t">${esc(x.name)}</div>
      <div class="m">${esc(x.addr)}・${x.stn?esc(x.stn)+'駅 徒歩'+x.walk+'分':esc(x.line)}</div>
      <div class="m">${[SKIND[x.t][0],x.plan,x.area?x.area+'㎡':'',x.barea?'建物'+x.barea+'㎡':'',age!=null?(age?'築'+age+'年':'新築'):''].filter(Boolean).map(esc).join('・')}</div>
      <div><span class="price">${x.price?man(x.price*1e4):'価格未定'}</span>${v&&v.est?` <span class="m">相場の目安 ${man(v.est)}</span>`:''}</div>
      ${v?pjLine(v.r):''}
      <div class="tags">${rt?`<span class="tag ${rt[1]}">${rt[0]}</span>`:''}${x.by&&x.by<=1981&&x.t!=='l'?'<span class="tag bad">旧耐震</span>':''}${hz.slice(0,3).map(([t,c])=>`<span class="tag ${c}">${esc(t)}</span>`).join('')}</div>
    </div>
    ${x.img?`<img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:96px;height:72px;object-fit:cover;border-radius:8px;flex:0 0 auto">`:''}
    <div style="flex-basis:100%;display:flex;gap:8px;margin-top:8px">
      <a class="btn sm" style="flex:1" href="${esc(x.url)}" target="_blank" rel="noopener">SUUMOでこの物件を見る ↗</a>
      <button class="chip" onclick="saveSale(${i})">☆ 保存</button></div></div>`;
}
function renderSaleList(m){
  if(!SALE.items){m.innerHTML=modeSwitch()+'<div class="card">「さがす」で条件を決めて「売り出し中の物件をさがす」を押してください。</div>';return}
  const all=SALE.items,r=saleFilt().map(x=>[x,all.indexOf(x)]).sort((a,b)=>SSORT[SALE.ssort][1](a[0],b[0]));
  m.innerHTML=modeSwitch()+`<div class="bar"><span class="n">${r.length}件</span><select id="ssort" style="width:auto;flex:1">${Object.entries(SSORT).map(([k,[n]])=>`<option value="${k}" ${SALE.ssort===k?'selected':''}>${n}</option>`).join('')}</select>
    <button class="btn sm sub" onclick="go('search')">条件を変える</button></div>
    ${stationSelect(all.map(x=>x.stn),SALE.stF,'SALE.stF=this.value;renderSaleList($(\'#main\'))')}
    <div class="note" style="margin-bottom:6px">${esc(SALE.at)}にSUUMOから取得。価格・掲載状況はSUUMOで確認してください。</div>
    ${grouped(r.slice(0,shown),SALE.ssort==='station',p=>p[0].stn,p=>saleItemHtml(p[0],p[1]))}
    ${r.length>shown?`<button class="btn sub" onclick="shown+=40;renderSaleList($('#main'))">もっと見る</button>`:''}
    ${!r.length?'<div class="card">条件に合う物件がありません。</div>':''}`;
  $('#ssort').onchange=e=>{SALE.ssort=e.target.value;LS.set('ssort',SALE.ssort);renderSaleList(m)};
}
function saveSale(i){const x=SALE.items[i];if(!x||!x.ev)return;let l=LS.get('evals',[]);l=l.filter(v=>v.e.url!==x.url);
  l.unshift({e:x.e,title:x.name+'（'+x.addr+'）',grade:x.ev.r.grade,total:x.ev.r.total,ratio:x.ev.ratio,date:new Date().toLocaleDateString('sv-SE'),stn:x.stn});LS.set('evals',l.slice(0,200));
  alertNote('気になる物件リストに保存しました')}
function alertNote(t){const d=document.createElement('div');d.textContent=t;d.style.cssText='position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:var(--acc);color:#fff;padding:8px 14px;border-radius:999px;z-index:2000;font-size:14px';document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}
function renderSaleMap(m){
  const r=saleFilt().filter(x=>x.ev);
  m.innerHTML=modeSwitch()+`<div class="bar"><span class="n">${r.length}件</span><button class="btn sm sub" onclick="go('search')">条件を変える</button></div><div id="map"></div>`;
  if(map){map.remove();map=null}
  map=L.map('map',{preferCanvas:true});map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{maxZoom:18,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'}).addTo(map);
  const b=[];for(const x of r){const c=L.circleMarker([x.ev.lat,x.ev.lon],{radius:8,color:'#fff',weight:1,fillColor:GC[x.ev.r.grade],fillOpacity:.9});
    c.bindPopup(`<b>${esc(x.name)}</b><br>${x.price?man(x.price*1e4):''}・${x.ev.r.grade}（${x.ev.r.total}点）<br><a href="${esc(x.url)}" target="_blank" rel="noopener">SUUMOで見る</a>`);c.addTo(map);b.push([x.ev.lat,x.ev.lon])}
  if(b.length)map.fitBounds(b,{maxZoom:15,padding:[20,20]});else map.setView([35.68,139.75],11);
}
// 前回の結果を読み込んでおく
idbGet('sale:last').then(v=>{if(v){SALE.items=v.items;SALE.at=v.at}}).catch(()=>{});

// ---------- サクラチェッカー式：URLだけで評価 ----------
async function evalByUrl(){
  const u=cleanUrl($('#e_url').value),msg=$('#e_parse');
  if(!u){msg.textContent='物件ページのURLを貼ってください。';return}
  msg.textContent='Macに依頼しています…';
  try{const r=await askMac('page',{url:u},t=>{msg.textContent=t});
    $('#e_text').value=r.text;readListing();
  }catch(e){msg.textContent=e.message||String(e)}
}

// ---------- Macなし：Safariのブックマーク（ブックマークレット）から取り込む ----------
// SUUMOを見ているSafariが、表示中のページから物件を読み取り、このアプリに渡す（端末の中だけで完結）
const APP_URL='https://user-master-k3m9.github.io/shisan-navi-k7q2/';
const BOOKMARKLET="javascript:(()=>{const A='"+APP_URL+"';const t=s=>(s||'').replace(/\\s+/g,' ').trim();const u=[...document.querySelectorAll('.property_unit')];let d;"+
 "if(u.length){d={t:'list',items:u.map(e=>{const o={};const a=e.querySelector('a[href*=\"/nc_\"]');o.url=a?a.href:'';e.querySelectorAll('dl').forEach(l=>{const k=l.querySelector('dt'),v=l.querySelector('dd');if(k&&v&&!(t(k.innerText) in o))o[t(k.innerText)]=t(v.innerText)});const im=e.querySelector('img[rel]');if(im)o.img=im.getAttribute('rel');return o}).filter(o=>o.url)}}"+
 "else{const L=document.body.innerText.split('\\n');const k=[];L.forEach((x,i)=>{if(/価格|所在地|住所|専有面積|土地面積|建物面積|築年月|間取り|徒歩|交通|物件名/.test(x)){k.push(x,L[i+1]||'')}});d={t:'page',url:location.href,text:k.join('\\n').slice(0,6000)}}"+
 "location.href=A+'#import='+btoa(unescape(encodeURIComponent(JSON.stringify(d))))})()";
function priceMan(s){s=String(s||'').normalize('NFKC').replace(/,/g,'');const m=s.match(/(?:(\d+)億)?\s*(\d+)?\s*万/);if(m&&(m[1]||m[2]))return (+(m[1]||0))*10000+(+(m[2]||0));const o=s.match(/(\d+)億/);return o?(+o[1])*10000:null}
function numOf(s){const m=String(s||'').normalize('NFKC').match(/[\d.]+/);return m?+m[0]:null}
function fromPage(o){// SUUMO一覧の1件 → アプリの形
  const st=String(o['沿線・駅']||'').normalize('NFKC'),m=st.match(/「([^」]+)」\s*(?:徒歩|歩)\s*(\d+)\s*分/),by=String(o['築年月']||'').match(/(\d{4})年/);
  const t=/\/ms\//.test(o.url)?'m':/ikkodate/.test(o.url)?'h':/tochi/.test(o.url)?'l':'m';
  return {t,url:o.url,name:o['物件名']||'',price:priceMan(o['販売価格']||o['価格']),addr:String(o['所在地']||'').normalize('NFKC'),stn:m?m[1]:'',walk:m?+m[2]:null,line:st,
    area:numOf(o['専有面積']||o['土地面積']),barea:numOf(o['建物面積']),plan:String(o['間取り']||'').normalize('NFKC'),by:by?+by[1]:null,img:o.img||''};
}
// 住所から市区町村コード（長い名前から先に照合。「川崎市中原区」が「中原区」より優先）
function codeFromAddr(a){a=String(a||'').normalize('NFKC');const ms=Object.entries(D.muni).filter(([c,v])=>v[1]&&a.includes(v[1])&&a.includes(v[0].replace(/[都県]$/,'')));
  ms.sort((x,y)=>y[1][1].length-x[1][1].length);return ms.length?ms[0][0]:null}
async function importFromHash(b64v){
  let d;try{d=JSON.parse(decodeURIComponent(escape(atob(String(b64v).replace(/ /g,"+")))))}catch(e){return}
  history.replaceState(null,'',location.pathname);
  if(d.t==='page'){S.tab='eval';const e=LS.get('evalForm',{kind:'mansion'});e.url=d.url;LS.set('evalForm',e);S.evalRes=null;render();
    setTimeout(()=>{$('#e_url').value=d.url;$('#e_text').value=d.text;readListing()},100);return}
  const items=(d.items||[]).map(fromPage).filter(x=>x.addr);
  const seen=new Set();const out=items.filter(x=>{const k=[x.name,x.price,x.area,x.plan,x.addr].join('|');if(seen.has(k))return false;seen.add(k);return true});
  TX.mode='sale';LS.set('mode','sale');S.tab='search';render();
  const msg=$('#s_msg');if(msg)msg.textContent=`SUUMOから${out.length}件を受け取りました。評価しています…`;
  await scoreSale(out,(i,n)=>{const m=$('#s_msg');if(m)m.textContent=`評価しています… ${i}/${n}（災害・地震・相場を調べています）`});
  SALE.items=out;SALE.at=new Date().toLocaleString('ja-JP');SALE.res=null;await idbSet('sale:last',{items:out,at:SALE.at}).catch(()=>{});
  shown=40;go('list');
}
function bookmarkletBox(){
  return `<div class="card"><h2>Macなしで使う（Safariのボタン）</h2>
  <div class="note">SUUMOの検索結果や物件ページをSafariで開いたまま、ブックマークの「資産価値ナビで評価」を押すと、表示中の物件がこのアプリで評価されます。最初に1回だけ、次の準備をしてください。</div>
  <ol class="note" style="font-size:13px;padding-left:18px;margin:8px 0">
  <li>下の「ボタンの中身をコピー」を押す</li>
  <li>Safariでどのページでもいいので開き、共有ボタン →「ブックマークを追加」→ 名前を「資産価値ナビで評価」にして保存</li>
  <li>ブックマーク一覧を開き「編集」→ いま保存したブックマークを選ぶ → アドレス欄を全部消して、コピーした中身を貼り付け →「完了」</li>
  <li>あとはSUUMOで検索結果か物件ページを開き、ブックマークから「資産価値ナビで評価」を押すだけ</li></ol>
  <button class="btn sm" onclick="copyBm()">ボタンの中身をコピー</button> <span id="bm_msg" class="note"></span></div>`;
}
async function copyBm(){try{await navigator.clipboard.writeText(BOOKMARKLET);$('#bm_msg').textContent='コピーしました'}catch(e){prompt('長押しで全部選んでコピーしてください',BOOKMARKLET)}}
