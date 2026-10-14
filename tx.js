// 売買事例（国の不動産価格情報）・ニュース・更新日
const TYPE_N={m:'中古マンション',h:'土地と建物（戸建て等）',l:'土地'};
const TYPE_S={m:'マンション',h:'戸建て',l:'土地'};
const TDEF={prefs:['13'],munis:[],types:['m'],pmin:'',pmax:'',amin:'',amax:'',ageMax:0,plan:'',closedOnly:false,years:2,grade:'',noFlood:false,noSlide:false,cheap:false};
let FT=Object.assign({},TDEF,LS.get('txfilter',{}));
const TX={
  mode:'tx',files:{},res:null,news:null,PI:{},
  init(){
    TX.mode=LS.get('mode',Object.keys(D.txindex||{}).length?'tx':'point');
    for(const p of P)TX.PI[p.i]=p;
    fetch('news.json').then(r=>r.ok?r.json():null).then(j=>{if(j){TX.news=j;if(S.tab==='info'||S.detail!=null)render()}}).catch(()=>{});
  }
};
function setMode(m){TX.mode=m;LS.set('mode',m);results=null;TX.res=null;render()}
function modeSwitch(){
  return `<div class="seg" style="display:flex;margin-bottom:10px"><button style="flex:1" class="${TX.mode==='tx'?'on':''}" onclick="setMode('tx')">売買事例（実際の価格）</button><button style="flex:1" class="${TX.mode!=='tx'?'on':''}" onclick="setMode('point')">地価地点（土地の値段）</button></div>`;
}
const qNow=()=>{let mx=0;for(const v of Object.values(D.txindex||{}))mx=Math.max(mx,v[1]);return mx};
const perTxt=p=>p?`${Math.floor(p/10)}年${['','1〜3月','4〜6月','7〜9月','10〜12月'][p%10]}`:'—';

// ---------- 読み込みと相場モデル ----------
async function loadTx(code){
  if(TX.files[code])return TX.files[code];
  if(!(D.txindex||{})[code])return null;
  const r=await fetch('tx/'+code+'.json');if(!r.ok)return null;
  const j=await r.json();
  const ds=j.d.map(([n,la,lo,hz,lq,pi])=>({n,la,lo,hz:hz||{},lq,pi,sc:null}));
  const recs=j.r.map((a,k)=>{const o={code,k,t:a[0],closed:a[1],D:ds[a[2]],price:a[3],area:a[4],unit:a[5],plan:a[6]||'',tfa:a[7],by:a[8],st:a[9]||'',per:a[10],far:a[11],ren:a[12]||'',rem:a[13]||'',shape:a[14]||'',road:a[15]};
    o.age=o.by&&o.per?Math.max(0,Math.floor(o.per/10)-o.by):null;return o});
  const f={code,ds,recs,model:{}};
  for(const t of ['m','h','l'])f.model[t]=fitModel(recs.filter(o=>o.t===t&&o.unit>0));
  for(const o of recs)o.ratio=ratioOf(f,o);
  TX.files[code]=f;return f;
}
function median(a){if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
// ln(㎡単価) = a + b×築年数 （マンション・戸建て）／土地は中央値
function fitModel(rs){
  const md=median(rs.map(o=>o.unit));if(md==null)return null;
  const xs=rs.filter(o=>o.age!=null&&o.age<=60);
  if(xs.length<10)return {med:md,a:null};
  const n=xs.length,mx=xs.reduce((s,o)=>s+o.age,0)/n,my=xs.reduce((s,o)=>s+Math.log(o.unit),0)/n;
  let sxy=0,sxx=0;for(const o of xs){sxy+=(o.age-mx)*(Math.log(o.unit)-my);sxx+=(o.age-mx)**2}
  const b=sxx?sxy/sxx:0;return {med:md,a:my-b*mx,b,n};
}
function expUnit(f,t,age){const m=f.model[t];if(!m)return null;if(t!=='l'&&m.a!=null&&age!=null)return Math.exp(m.a+m.b*Math.min(age,60));return m.med}
function ratioOf(f,o){
  if(!o.unit)return null;
  if(o.t==='l'){const same=f.recs.filter(x=>x.t==='l'&&x.D===o.D&&x.unit>0);const md=same.length>=5?median(same.map(x=>x.unit)):f.model.l&&f.model.l.med;return md?o.unit/md:null}
  const e=expUnit(f,o.t,o.age);return e?o.unit/e:null;
}
const ratioTag=r=>r==null?null:r<0.85?['相場より割安 '+Math.round(r*100)+'%','good']:r>1.15?['相場より割高 '+Math.round(r*100)+'%','bad']:['相場並み '+Math.round(r*100)+'%',''];

// 地区（町丁）の場所の評価
function districtScore(d,code){
  if(d.sc)return d.sc;
  if(d.la==null){d.sc=null;return null}
  const p=TX.PI[d.pi],m=D.muni[code];
  let st=null,sd=1e9;for(const s of D.stations){const x=distM(d.la,d.lo,s.lat,s.lon);if(x<sd){sd=x;st=s}}
  const pj=D.projects.map(q=>({q,d:distM(d.la,d.lo,q.lat,q.lon)})).filter(x=>x.d<3000).sort((a,b)=>a.d-b.d).slice(0,6);
  const f={hz:d.hz,lq:d.lq,g5:p?p.g5:null,h:p?p.h:null,pop:m?m[2]:null,muniName:m?m[1]:'',st,walk:Math.round(sd*1.25),pj};
  d.sc={f,r:score(f),st,sd};return d.sc;
}

// ---------- 検索 ----------
function renderTxSearch(m){
  const idx=D.txindex||{};
  if(!Object.keys(idx).length){
    m.innerHTML=modeSwitch()+`<div class="card"><h2>売買事例をさがす</h2>
    <div class="warnbox">実際に売れたマンション・戸建て・土地の価格は、国の「不動産情報ライブラリ」のAPIキーが設定されると、毎週自動で入ります（今は準備中です）。<br>それまでは「地価地点」と「物件を評価」を使ってください。</div></div>`;return;
  }
  const munis=Object.entries(D.muni).filter(([c])=>FT.prefs.includes(c.slice(0,2))&&idx[c]).sort((a,b)=>a[0].localeCompare(b[0]));
  m.innerHTML=modeSwitch()+`<div class="card"><h2>売買事例をさがす</h2>
  <div class="note">国土交通省が公開している、実際の売買価格（${perTxt(qNow())}まで）です。場所の評価（100点満点）と、同じ市区町村の相場と比べた割安・割高を出します。</div>
  <label class="f">種類</label>
  <div class="chips">${Object.entries(TYPE_N).map(([k,n])=>`<button class="chip ${FT.types.includes(k)?'on':''}" onclick="togT('${k}')">${n}</button>`).join('')}</div>
  <label class="f">都県</label>
  <div class="chips">${PREFS.map(([c,n])=>`<button class="chip ${FT.prefs.includes(c)?'on':''}" onclick="togTP('${c}')">${n}</button>`).join('')}</div>
  <label class="f">市区町村（1つ以上選ぶ・最大20）</label>
  <div class="muni">${munis.map(([c,v])=>`<label><input type="checkbox" ${FT.munis.includes(c)?'checked':''} onchange="togTM('${c}',this.checked)">${esc(v[1])}<span class="note">${idx[c][0]}</span></label>`).join('')}</div>
  <label class="f">価格（万円）</label>
  <div class="row"><input type="number" inputmode="decimal" id="t_pmin" value="${FT.pmin}" placeholder="下限なし"><span style="flex:0">〜</span><input type="number" inputmode="decimal" id="t_pmax" value="${FT.pmax}" placeholder="上限なし"></div>
  <label class="f">面積（㎡）</label>
  <div class="row"><input type="number" inputmode="decimal" id="t_amin" value="${FT.amin}" placeholder="下限なし"><span style="flex:0">〜</span><input type="number" inputmode="decimal" id="t_amax" value="${FT.amax}" placeholder="上限なし"></div>
  <label class="f">築年数</label>
  <div class="chips">${[[0,'指定なし'],[5,'5年以内'],[10,'10年以内'],[20,'20年以内'],[30,'30年以内']].map(([k,n])=>`<button class="chip ${FT.ageMax==k?'on':''}" onclick="FT.ageMax=${k};renderTxSearch($('#main'))">${n}</button>`).join('')}</div>
  <label class="f">間取り（例：2LDK、空欄なら全部）</label><input type="text" id="t_plan" value="${esc(FT.plan)}">
  <label class="f">売買の時期</label>
  <div class="chips">${[[1,'直近1年'],[2,'直近2年'],[3,'直近3年']].map(([k,n])=>`<button class="chip ${FT.years==k?'on':''}" onclick="FT.years=${k};renderTxSearch($('#main'))">${n}</button>`).join('')}</div>
  <label class="f">場所の総合評価</label>
  <div class="chips">${[['','指定なし'],['S','Sのみ'],['A','A以上'],['B','B以上'],['C','C以上']].map(([k,n])=>`<button class="chip ${FT.grade===k?'on':''}" onclick="FT.grade='${k}';renderTxSearch($('#main'))">${n}</button>`).join('')}</div>
  <label class="f">こだわり条件</label>
  ${[['cheap','相場より割安（相場の90%未満）'],['closedOnly','成約価格のみ（不動産会社経由で成約した価格）'],['noFlood','洪水・高潮・津波の浸水想定なし'],['noSlide','土砂災害の区域外']].map(([k,n])=>`<label class="ck"><input type="checkbox" ${FT[k]?'checked':''} onchange="FT.${k}=this.checked">${n}</label>`).join('')}
  <div style="height:12px"></div>
  <button class="btn" id="t_go" onclick="doTxSearch()">この条件で検索</button>
  <div id="t_msg" class="note" style="margin-top:6px"></div>
  <div style="height:8px"></div>
  <button class="btn sub" onclick="FT=Object.assign({},TDEF);LS.set('txfilter',FT);renderTxSearch($('#main'))">条件をリセット</button></div>`;
  ['pmin','pmax','amin','amax','plan'].forEach(k=>$('#t_'+k).addEventListener('input',e=>{FT[k]=e.target.value}));
}
function togT(k){FT.types=FT.types.includes(k)?FT.types.filter(x=>x!==k):[...FT.types,k];if(!FT.types.length)FT.types=[k];renderTxSearch($('#main'))}
function togTP(c){FT.prefs=FT.prefs.includes(c)?FT.prefs.filter(x=>x!==c):[...FT.prefs,c];FT.munis=FT.munis.filter(x=>FT.prefs.includes(x.slice(0,2)));renderTxSearch($('#main'))}
function togTM(c,on){FT.munis=on?[...FT.munis,c]:FT.munis.filter(x=>x!==c)}
async function doTxSearch(){
  const msg=$('#t_msg');
  if(!FT.munis.length){msg.textContent='市区町村を1つ以上選んでください。';return}
  if(FT.munis.length>20){msg.textContent='市区町村は20までにしてください。';return}
  LS.set('txfilter',FT);$('#t_go').disabled=true;msg.textContent='売買事例を読み込んでいます…';
  try{await Promise.all(FT.munis.map(loadTx))}catch(e){msg.textContent='読み込めませんでした。電波の良い所でもう一度試してください。';$('#t_go').disabled=false;return}
  TX.res=null;shown=40;go('list');
}
function txFilt(){
  const lim=(Math.floor(qNow()/10)-FT.years)*10+qNow()%10;
  const pmn=FT.pmin?FT.pmin*1e4:0,pmx=FT.pmax?FT.pmax*1e4:Infinity,amn=+FT.amin||0,amx=+FT.amax||Infinity,plan=FT.plan.trim().toUpperCase();
  const out=[];
  for(const c of FT.munis){const f=TX.files[c];if(!f)continue;
    for(const o of f.recs){
      if(!FT.types.includes(o.t))continue;
      if(o.per&&o.per<=lim)continue;
      if(o.price<pmn||o.price>pmx)continue;
      if(o.area!=null&&(o.area<amn||o.area>amx))continue;
      if(FT.ageMax&&(o.age==null||o.age>FT.ageMax))continue;
      if(plan&&!o.plan.toUpperCase().includes(plan))continue;
      if(FT.closedOnly&&!o.closed)continue;
      if(FT.cheap&&!(o.ratio!=null&&o.ratio<0.9))continue;
      const sc=districtScore(o.D,c);
      if(FT.grade&&(!sc||GR[sc.r.grade]<GR[FT.grade]))continue;
      if(FT.noFlood&&(o.D.hz.flood||o.D.hz.surge||o.D.hz.tsunami))continue;
      if(FT.noSlide&&(o.D.hz.debris||o.D.hz.slope||o.D.hz.slide))continue;
      out.push(o);
    }}
  return out;
}
const TSORT={score:['場所の評価が高い順',(a,b)=>((b.D.sc&&b.D.sc.r.total)||0)-((a.D.sc&&a.D.sc.r.total)||0)],cheap:['割安な順（相場比）',(a,b)=>(a.ratio??9)-(b.ratio??9)],price:['安い順',(a,b)=>a.price-b.price],dear:['高い順',(a,b)=>b.price-a.price],unit:['㎡単価が安い順',(a,b)=>(a.unit||9e9)-(b.unit||9e9)],new:['新しい順',(a,b)=>(b.per||0)-(a.per||0)],area:['広い順',(a,b)=>(b.area||0)-(a.area||0)]};
let tsort=LS.get('tsort','score');
function getTx(){if(!TX.res)TX.res=txFilt().sort(TSORT[tsort][1]);return TX.res}

// ---------- 一覧・詳細 ----------
function txTitle(o){return [TYPE_S[o.t],o.plan,o.area?o.area+'㎡':'',o.age!=null?(o.age?'築'+o.age+'年':'新築'):''].filter(Boolean).join('・')}
function txItemHtml(o){
  const sc=districtScore(o.D,o.code),g=sc?sc.r.grade:'D',m=D.muni[o.code],rt=ratioTag(o.ratio);
  const hz=sc?sc.r.tags.filter(t=>/浸水|土砂|液状化/.test(t[0])):[];
  return `<div class="item" onclick="showTx('${o.code}',${o.k})">
    <div class="grade g${sc?g:'D'}"><b>${sc?g:'－'}</b><small>${sc?sc.r.total+'点':'位置不明'}</small></div>
    <div style="flex:1;min-width:0">
      <div class="t">${esc(txTitle(o))}</div>
      <div class="m">${esc(m?m[1]:'')}${esc(o.D.n)}・${perTxt(o.per)}・${o.closed?'成約':'取引'}</div>
      <div><span class="price">${man(o.price)}</span> <span class="m">${o.unit?'㎡'+unit(o.unit):''}</span></div>
      <div class="tags">${rt?`<span class="tag ${rt[1]}">${rt[0]}</span>`:''}${hz.slice(0,3).map(([t,c])=>`<span class="tag ${c}">${esc(t)}</span>`).join('')}${sc&&sc.sd<640?`<span class="tag good">${esc(sc.st.n)}駅 近い</span>`:''}</div>
    </div></div>`;
}
function renderTxList(m){
  if(!FT.munis.length||!FT.munis.every(c=>TX.files[c])){m.innerHTML=modeSwitch()+'<div class="card">「さがす」で市区町村を選んで検索してください。</div>';return}
  const r=getTx();
  m.innerHTML=modeSwitch()+`<div class="bar"><span class="n">${r.length.toLocaleString()}件</span>
    <select id="tsort" style="width:auto;flex:1">${Object.entries(TSORT).map(([k,[n]])=>`<option value="${k}" ${tsort===k?'selected':''}>${n}</option>`).join('')}</select>
    <button class="btn sm sub" onclick="go('search')">条件を変える</button></div>
    ${marketHtml(r)}
    <div>${r.slice(0,shown).map(txItemHtml).join('')}</div>
    ${r.length>shown?`<button class="btn sub" onclick="shown+=40;renderTxList($('#main'))">もっと見る（残り${(r.length-shown).toLocaleString()}件）</button>`:''}
    ${!r.length?'<div class="card">条件に合う売買事例がありません。条件をゆるめてください。</div>':''}`;
  $('#tsort').onchange=e=>{tsort=e.target.value;LS.set('tsort',tsort);TX.res=null;shown=40;renderTxList(m)};
}
// 相場のまとめ（中央値と、四半期ごとの㎡単価の推移）
function marketHtml(r){
  if(r.length<5)return'';
  const by={};for(const o of r){if(!o.unit||!o.per)continue;(by[o.per]=by[o.per]||[]).push(o.unit)}
  const ks=Object.keys(by).map(Number).sort();
  const vals=ks.map(k=>median(by[k]));
  return `<div class="card"><div class="boxes" style="margin-top:0">
    <div class="box"><small>価格の中央値</small><b>${man(median(r.map(o=>o.price)))}</b></div>
    <div class="box"><small>㎡単価の中央値</small><b>${unit(Math.round(median(r.filter(o=>o.unit).map(o=>o.unit))||0))}</b></div>
    <div class="box"><small>件数</small><b>${r.length.toLocaleString()}件</b></div></div>
    ${ks.length>=3?'<div class="note" style="margin-top:8px">㎡単価の推移（四半期ごとの中央値）</div>'+lineChart(vals,ks.map((k,i)=>i===0||i===ks.length-1||k%10===1?String(Math.floor(k/10)).slice(2)+'/'+(k%10):''),v=>(v/1e4).toFixed(v>=1e5?0:1)+'万'):''}</div>`;
}
function showTx(code,k){S.prev=S.tab;S.detail=code+':'+k;render();window.scrollTo(0,0)}
function renderTxDetail(m){
  const [code,k]=S.detail.split(':'),f=TX.files[code];
  if(!f){S.detail=null;return render()}
  const o=f.recs[+k],sc=districtScore(o.D,code),mu=D.muni[code],rt=ratioTag(o.ratio),e=expUnit(f,o.t,o.age);
  m.innerHTML=`<button class="back" onclick="S.detail=null;go(S.prev)">‹ 戻る</button>
  <div class="card"><div class="big"><div class="grade g${sc?sc.r.grade:'D'}"><b>${sc?sc.r.grade:'－'}</b><small>${sc?sc.r.total+'点':''}</small></div>
    <div><div style="font-weight:700">${esc(txTitle(o))}</div><div class="note">${esc(mu?mu[0]+' '+mu[1]:'')}${esc(o.D.n)}・${perTxt(o.per)}に${o.closed?'成約':'取引'}</div>
    <div class="tags">${rt?`<span class="tag ${rt[1]}">${rt[0]}</span>`:''}${sc?sc.r.tags.map(([t,c])=>`<span class="tag ${c}">${esc(t)}</span>`).join(''):''}</div></div></div>
    <div class="boxes">
      <div class="box"><small>価格</small><b>${man(o.price)}</b></div>
      ${o.unit?`<div class="box"><small>1㎡あたり</small><b>${unit(o.unit)}</b></div>`:''}
      ${e?`<div class="box"><small>同じ市区町村の相場（${o.t==='l'?'土地の中央値':'築'+(o.age??'?')+'年なら'}）</small><b>${unit(Math.round(e))}/㎡</b></div>`:''}
      ${o.ratio?`<div class="box"><small>相場比</small><b>${Math.round(o.ratio*100)}%</b></div>`:''}
    </div>
    <div class="note" style="margin-top:6px">相場は、同じ市区町村で直近3年に売れた同じ種類の物件から、築年数による値下がりを考えて計算しています${o.t==='l'?'（土地は同じ町丁に5件以上あればその中央値）':''}。</div></div>
  <div class="card"><h2>物件の情報</h2><dl class="kv">
    <dt>種類</dt><dd>${TYPE_N[o.t]}</dd><dt>面積</dt><dd>${o.area??'—'}㎡${o.tfa?`（延床 ${o.tfa}㎡）`:''}</dd>
    ${o.plan?`<dt>間取り</dt><dd>${esc(o.plan)}</dd>`:''}<dt>建築年</dt><dd>${o.by?o.by+'年':'—'}</dd>
    ${o.st?`<dt>構造</dt><dd>${esc(o.st)}</dd>`:''}${o.far?`<dt>容積率</dt><dd>${o.far}%</dd>`:''}${o.road?`<dt>前面道路</dt><dd>幅${o.road}m</dd>`:''}
    ${o.shape?`<dt>土地の形</dt><dd>${esc(o.shape)}</dd>`:''}${o.ren?`<dt>改装</dt><dd>${esc(o.ren)}</dd>`:''}${o.rem?`<dt>事情</dt><dd>${esc(o.rem)}</dd>`:''}
    <dt>出典</dt><dd>国土交通省 不動産情報ライブラリ（${o.closed?'成約価格':'取引価格'}）</dd></dl></div>
  ${sc?`<div class="card"><h2>場所の評価の内訳（${esc(o.D.n)}の中心付近）</h2>${scoreHtml(sc.r)}<div class="note">住所は町丁までしか公表されていないため、町丁の中心付近で判定しています。駅まではその直線距離×1.25です。</div></div>
  <div class="card"><h2>災害リスク（町丁の中心付近）</h2>${hazardTable(o.D.hz,o.D.lq)}</div>
  <div class="card"><h2>新駅・延伸・再開発（3km以内）</h2>${projList(sc.f.pj)}</div>`:''}
  <div class="card"><h2>将来の人口</h2>${popHtml(mu)}</div>
  ${newsCard([code])}
  <div class="card">${linksHtml(o.D.la||35.68,o.D.lo||139.76,code,(mu?mu[0]+mu[1]:'')+o.D.n)}</div>`;
}

// ---------- 地図 ----------
function renderTxMap(m){
  if(!FT.munis.length||!FT.munis.every(c=>TX.files[c])){m.innerHTML=modeSwitch()+'<div class="card">「さがす」で市区町村を選んで検索してください。</div>';return}
  const r=getTx(),g={};
  for(const o of r){if(o.D.la==null)continue;(g[o.code+'|'+o.D.n]=g[o.code+'|'+o.D.n]||{d:o.D,c:o.code,l:[]}).l.push(o)}
  m.innerHTML=modeSwitch()+`<div class="bar"><span class="n">${r.length.toLocaleString()}件・${Object.keys(g).length}町丁</span><button class="btn sm sub" onclick="go('search')">条件を変える</button></div>
  <div class="chips" style="margin-bottom:8px">${Object.entries(HZ_TILES).map(([k,[n]])=>`<button class="chip ${mapLayers[k]?'on':''}" onclick="togHz('${k}',this)">${n}の想定を重ねる</button>`).join('')}</div>
  <div id="map"></div><div class="legend">${Object.entries(GC).map(([k,c])=>`<span><i style="background:${c}"></i>${k}</span>`).join('')}<span>円の大きさ＝件数</span></div>`;
  if(map){map.remove();map=null}
  map=L.map('map',{preferCanvas:true});map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{maxZoom:18,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'}).addTo(map);
  for(const k in mapLayers){mapLayers[k]=L.tileLayer(`https://disaportaldata.gsi.go.jp/raster/${HZ_TILES[k][1]}/{z}/{x}/{y}.png`,{opacity:.55,maxNativeZoom:17,maxZoom:18}).addTo(map)}
  const b=[];
  for(const v of Object.values(g)){const sc=districtScore(v.d,v.c),gr=sc?sc.r.grade:'D';
    const c=L.circleMarker([v.d.la,v.d.lo],{radius:Math.min(16,5+Math.sqrt(v.l.length)*2),color:'#fff',weight:1,fillColor:GC[gr],fillOpacity:.85});
    c.bindPopup(`<b>${esc(v.d.n)}</b> 場所の評価 ${gr}${sc?'（'+sc.r.total+'点）':''}<br>${v.l.length}件・中央値 ${man(median(v.l.map(o=>o.price)))}<br>${v.l.slice(0,5).map(o=>`<a href="#" onclick="showTx('${o.code}',${o.k});return false">${esc(txTitle(o))} ${man(o.price)}</a>`).join('<br>')}`);
    c.addTo(map);b.push([v.d.la,v.d.lo])}
  if(b.length)map.fitBounds(b,{maxZoom:15,padding:[20,20]});else map.setView([35.68,139.75],11);
}

// ---------- 物件評価：近くの売買事例と比べる ----------
function txCompare(e,lat,lon,code){
  const f=TX.files[code];if(!f)return null;
  const t={mansion:'m',house:'h',land:'l'}[e.kind],age=e.age!==''&&e.age!=null?+e.age:null,area=+e.area;
  const near=f.recs.filter(o=>o.t===t&&o.unit>0&&o.D.la!=null).map(o=>[o,distM(lat,lon,o.D.la,o.D.lo)]).filter(x=>x[1]<2000).sort((a,b)=>a[1]-b[1]);
  let base,how;
  if(t==='l'){const u=near.slice(0,30).map(x=>x[0].unit);if(u.length<5)return null;base=median(u);how=`半径2km以内で売れた土地${u.length}件の㎡単価の中央値 ${unit(Math.round(base))} × ${area}㎡`}
  else{
    if(age==null)return {est:null,list:near.slice(0,5).map(x=>x[0])};
    const ex=expUnit(f,t,age);if(!ex)return null;
    const rs=near.filter(x=>x[1]<1500).map(x=>x[0].ratio).filter(v=>v!=null);
    const adj=rs.length>=5?median(rs):1;base=ex*adj;
    how=`${D.muni[code]?D.muni[code][1]:''}で売れた${TYPE_S[t]}の相場（築${age}年なら ${unit(Math.round(ex))}/㎡）${rs.length>=5?`× この近く1.5km以内の事例${rs.length}件の傾向 ${Math.round(adj*100)}%`:''} × ${area}㎡`;
  }
  const list=near.filter(x=>age==null||x[0].age==null||Math.abs(x[0].age-age)<=10).slice(0,5).map(x=>x[0]);
  return {est:base*area,how,list};
}

// ---------- ニュース・更新日 ----------
function newsCard(codes,limit){
  const n=TX.news;if(!n||!n.items)return'';
  let it=n.items;
  if(codes){const pr=codes.map(c=>String(c).slice(0,2));const a=it.filter(x=>x.m.some(c=>codes.includes(c)));it=a.length?a:it.filter(x=>x.p.some(p=>pr.includes(p)));}
  it=it.slice(0,limit||6);if(!it.length)return'';
  return `<div class="card"><h2>最新ニュース（再開発・新駅・延伸）</h2>${it.map(x=>`<div style="padding:6px 0;border-bottom:1px solid var(--line)"><a href="${esc(x.u)}" target="_blank" rel="noopener" style="color:var(--ink)">${esc(x.t)}</a><div class="note">${esc(x.d)}・${esc(x.s)}</div></div>`).join('')}
  <div class="note" style="margin-top:6px">見出しとリンクのみ（Googleニュース）。${esc(n.built)}に自動更新。</div></div>`;
}
function updatedCard(){
  const mt=D.meta||{};
  return `<div class="card"><h2>データの更新日</h2><dl class="kv">
  <dt>アプリのデータ</dt><dd>${esc(D.built)}（毎週月曜に自動で確認）</dd>
  <dt>地価</dt><dd>公示 ${mt.land?mt.land.L01:''}年・調査 ${mt.land?mt.land.L02:''}年</dd>
  <dt>売買事例</dt><dd>${mt.tx?esc(mt.tx)+'取得（'+perTxt(qNow())+'まで）':'APIキーの設定待ち'}</dd>
  <dt>災害の想定</dt><dd>${esc(mt.hazard||'')}取得（3か月ごと）</dd>
  <dt>ニュース</dt><dd>${esc(mt.news||'')}</dd></dl></div>`;
}
