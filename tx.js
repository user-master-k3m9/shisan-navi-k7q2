// 売買事例（国の不動産価格情報）・ニュース・更新日
const TYPE_N={m:'中古マンション',h:'土地と建物（戸建て等）',l:'土地'};
const TYPE_S={m:'マンション',h:'戸建て',l:'土地'};
const TDEF={prefs:['13'],munis:[],types:['m'],pmin:'',pmax:'',amin:'',amax:'',ageMax:0,walk:0,plan:'',closedOnly:false,years:2,grade:'',noFlood:false,noSlide:false,cheap:false};
let FT=Object.assign({},TDEF,LS.get('txfilter',{}));
const TX={
  mode:'tx',files:{},res:null,news:null,PI:{},
  init(){
    TX.mode=LS.get('mode',Object.keys(D.txindex||{}).length?'tx':'point');
    idbGet('txidx').then(v=>{TX.localIdx=v||{};if(Object.keys(TX.localIdx).length&&TX.mode==='tx'&&S.tab==='search'&&S.detail==null)render()}).catch(()=>{});
    for(const p of P)TX.PI[p.i]=p;
    fetch('news.json').then(r=>r.ok?r.json():null).then(j=>{if(j){TX.news=j;if(S.tab==='info'||S.detail!=null)render()}}).catch(()=>{});
  }
};
function setMode(m){TX.mode=m;LS.set('mode',m);results=null;TX.res=null;render()}
function modeSwitch(){
  return `<div class="seg" style="display:flex;margin-bottom:10px"><button style="flex:1" class="${TX.mode==='tx'?'on':''}" onclick="setMode('tx')">売買事例（実際の価格）</button><button style="flex:1" class="${TX.mode!=='tx'?'on':''}" onclick="setMode('point')">地価地点（土地の値段）</button></div>`;
}
const qNow=()=>{let mx=0;for(const v of Object.values(allIdx()))mx=Math.max(mx,v[1]);return mx};
function allIdx(){const o=Object.assign({},D.txindex||{});for(const [c,v] of Object.entries(TX.localIdx||{}))if(!o[c]||v[1]>o[c][1])o[c]=v;return o}
const perTxt=p=>p?`${Math.floor(p/10)}年${['','1〜3月','4〜6月','7〜9月','10〜12月'][p%10]}`:'—';

// ---------- 読み込みと相場モデル ----------
async function loadTx(code){
  if(TX.files[code])return TX.files[code];
  const pub=(D.txindex||{})[code],loc=(TX.localIdx||{})[code];
  if(!pub&&!loc)return null;
  let j=null;
  if(pub){const r=await fetch('tx/'+code+'.json');if(r.ok)j=await r.json()}
  if(loc&&(!pub||loc[1]>pub[1]||!j)){j=await localFile(code,j)}
  if(!j)return null;
  const ds=j.d.map(([n,la,lo,hz,lq,pi,qk,fr])=>({n,la,lo,hz:hz||{},lq,pi,qk,fr,sc:null}));
  const recs=j.r.map((a,k)=>{const o={code,k,t:a[0],closed:a[1],D:ds[a[2]],price:a[3],area:a[4],unit:a[5],plan:a[6]||'',tfa:a[7],by:a[8],st:a[9]||'',per:a[10],far:a[11],ren:a[12]||'',rem:a[13]||'',shape:a[14]||'',road:a[15],stn:a[16]||'',stm:a[17]};
    o.age=o.by&&o.per?Math.max(0,Math.floor(o.per/10)-o.by):null;return o});
  // 町丁ごとに、国のデータに書かれた最寄り駅（一番多いもの）と徒歩分数（中央値）をまとめる
  const sg=new Map();for(const o of recs){if(!o.stn)continue;const m=sg.get(o.D)||{};m[o.stn]=m[o.stn]||[];if(o.stm!=null)m[o.stn].push(o.stm);else m[o.stn].push(null);sg.set(o.D,m)}
  for(const [d,m] of sg){const [n,a]=Object.entries(m).sort((x,y)=>y[1].length-x[1].length)[0];const mins=a.filter(x=>x!=null);d.stn=n;d.stm=mins.length?median(mins):null}
  const f={code,ds,recs,model:{}};
  for(const t of ['m','h','l'])f.model[t]=fitModel(recs.filter(o=>o.t===t&&o.unit>0));
  for(const o of recs)o.ratio=ratioOf(f,o);
  TX.files[code]=f;return f;
}
function median(a){if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
// ln(㎡単価) = a + b×築年数 + c×駅徒歩分 （マンション・戸建て）／土地は中央値
function ols(X,y){// 最小二乗（列数3まで）
  const k=X[0].length,A=Array.from({length:k},()=>Array(k+1).fill(0));
  for(let i=0;i<X.length;i++)for(let r=0;r<k;r++){for(let c=0;c<k;c++)A[r][c]+=X[i][r]*X[i][c];A[r][k]+=X[i][r]*y[i]}
  for(let c=0;c<k;c++){let p=c;for(let r=c+1;r<k;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];if(Math.abs(A[c][c])<1e-12)return null;
    for(let r=0;r<k;r++)if(r!==c){const f=A[r][c]/A[c][c];for(let j=c;j<=k;j++)A[r][j]-=f*A[c][j]}}
  return A.map((r,i)=>r[k]/r[i]);
}
const WM=w=>Math.min(w,30);
function fitModel(rs){
  const md=median(rs.map(o=>o.unit));if(md==null)return null;
  const xs=rs.filter(o=>o.age!=null&&o.age<=60);
  if(xs.length<10)return {med:md,a:null};
  const b2=ols(xs.map(o=>[1,o.age]),xs.map(o=>Math.log(o.unit)));
  const ws=xs.filter(o=>o.stm!=null);
  const b3=ws.length>=30?ols(ws.map(o=>[1,o.age,WM(o.stm)]),ws.map(o=>Math.log(o.unit))):null;
  return {med:md,a:b2?b2[0]:null,b:b2?b2[1]:0,w:b3&&b3[2]<0.02?b3:null,n:xs.length};
}
function expUnit(f,t,age,stm){const m=f.model[t];if(!m)return null;
  if(t!=='l'&&age!=null){if(m.w&&stm!=null)return Math.exp(m.w[0]+m.w[1]*Math.min(age,60)+m.w[2]*WM(stm));if(m.a!=null)return Math.exp(m.a+m.b*Math.min(age,60))}
  return m.med}
function ratioOf(f,o){
  if(!o.unit)return null;
  if(o.t==='l'){const same=f.recs.filter(x=>x.t==='l'&&x.D===o.D&&x.unit>0);const md=same.length>=5?median(same.map(x=>x.unit)):f.model.l&&f.model.l.med;return md?o.unit/md:null}
  const e=expUnit(f,o.t,o.age,o.stm);return e?o.unit/e:null;
}
const ratioTag=r=>r==null?null:r<0.85?['相場より割安 '+Math.round(r*100)+'%','good']:r>1.15?['相場より割高 '+Math.round(r*100)+'%','bad']:['相場並み '+Math.round(r*100)+'%',''];

// 地区（町丁）の場所の評価
function districtScore(d,code){
  if(d.sc)return d.sc;
  if(d.la==null){d.sc=null;return null}
  const p=TX.PI[d.pi],m=D.muni[code];
  let st=null,sd=1e9;
  if(d.stn){for(const s of D.stations){if(s.n!==d.stn)continue;const x=distM(d.la,d.lo,s.lat,s.lon);if(x<sd&&x<6000){sd=x;st=s}}}
  if(!st)for(const s of D.stations){const x=distM(d.la,d.lo,s.lat,s.lon);if(x<sd){sd=x;st=s}}
  if(d.stm!=null){sd=d.stm*80/1.25}
  const pj=D.projects.map(q=>({q,d:distM(d.la,d.lo,q.lat,q.lon)})).filter(x=>x.d<3000).sort((a,b)=>a.d-b.d).slice(0,6);
  const f={hz:d.hz,lq:d.lq,qk:d.qk,fr:d.fr,tokyo:String(code).startsWith('13'),g5:p?p.g5:null,h:p?p.h:null,pop:m?m[2]:null,muniName:m?m[1]:'',st,walk:Math.round(sd*1.25),pj};
  d.sc={f,r:score(f),st,sd};return d.sc;
}

// ---------- 検索 ----------
function renderTxSearch(m){
  const idx=allIdx();
  if(!Object.keys(idx).length){
    m.innerHTML=modeSwitch()+updateBox()+`<div class="card"><h2>売買事例をさがす</h2>
    <div class="warnbox">実際に売れたマンション・戸建て・土地の価格（国の不動産情報ライブラリ）は、まだ取り込まれていません。取り込まれると、ここで検索できるようになります。<br>それまでは「地価地点」と「物件を評価」を使ってください。</div></div>`;return;
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
  <label class="f">価格</label>
  ${rangeSel('t_pmin','t_pmax',[300,500,800,1000,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500,7000,7500,8000,9000,10000,12000,15000,20000,30000,50000],FT.pmin,FT.pmax,manFmt)}
  <label class="f">面積</label>
  ${rangeSel('t_amin','t_amax',[20,25,30,40,50,60,70,80,90,100,120,150,200,300,500],FT.amin,FT.amax,v=>v+'㎡')}
  <label class="f">築年数</label>
  <div class="chips">${[[0,'指定なし'],[5,'5年以内'],[10,'10年以内'],[20,'20年以内'],[30,'30年以内']].map(([k,n])=>`<button class="chip ${FT.ageMax==k?'on':''}" onclick="FT.ageMax=${k};renderTxSearch($('#main'))">${n}</button>`).join('')}</div>
  <label class="f">駅からの徒歩</label>
  <div class="chips">${[[0,'指定なし'],[5,'5分以内'],[10,'10分以内'],[15,'15分以内']].map(([k,n])=>`<button class="chip ${FT.walk==k?'on':''}" onclick="FT.walk=${k};renderTxSearch($('#main'))">${n}</button>`).join('')}</div>
  <label class="f">間取り（いくつでも選べます）</label>
  <div class="chips">${PLANS.map(([k])=>`<button class="chip ${(FT.plans||[]).includes(k)?'on':''}" onclick="togPlan('${k}')">${k}</button>`).join('')}</div>
  <label class="f">売買の時期</label>
  <div class="chips">${[[1,'直近1年'],[2,'直近2年'],[3,'直近3年']].map(([k,n])=>`<button class="chip ${FT.years==k?'on':''}" onclick="FT.years=${k};renderTxSearch($('#main'))">${n}</button>`).join('')}</div>
  <label class="f">場所の総合評価</label>
  <div class="chips">${[['','指定なし'],['S','Sのみ'],['A','A以上'],['B','B以上'],['C','C以上']].map(([k,n])=>`<button class="chip ${FT.grade===k?'on':''}" onclick="FT.grade='${k}';renderTxSearch($('#main'))">${n}</button>`).join('')}</div>
  <label class="f">こだわり条件</label>
  ${[['cheap','相場より割安（相場の90%未満）'],['closedOnly','成約価格のみ（不動産会社経由で成約した価格）'],['noFlood','洪水・高潮・津波の浸水想定なし'],['noSlide','土砂災害の区域外'],['noLiq','液状化しやすい地形を除く'],['noFire','火災危険度3以上を除く（東京都）'],['proj','新駅・延伸・再開発まで1.5km以内']].map(([k,n])=>`<label class="ck"><input type="checkbox" ${FT[k]?'checked':''} onchange="FT.${k}=this.checked">${n}</label>`).join('')}
  <div style="height:12px"></div>
  <button class="btn" id="t_go" onclick="doTxSearch()">この条件で検索</button>
  <div id="t_msg" class="note" style="margin-top:6px"></div>
  <div style="height:8px"></div>
  <button class="btn sub" onclick="FT=Object.assign({},TDEF);LS.set('txfilter',FT);renderTxSearch($('#main'))">条件をリセット</button></div>`+updateBox();
  ['pmin','pmax','amin','amax'].forEach(k=>$('#t_'+k).addEventListener('change',e=>{FT[k]=e.target.value}));

}
function togT(k){FT.types=FT.types.includes(k)?FT.types.filter(x=>x!==k):[...FT.types,k];if(!FT.types.length)FT.types=[k];renderTxSearch($('#main'))}
function togTP(c){FT.prefs=FT.prefs.includes(c)?FT.prefs.filter(x=>x!==c):[...FT.prefs,c];FT.munis=FT.munis.filter(x=>FT.prefs.includes(x.slice(0,2)));renderTxSearch($('#main'))}
function togTM(c,on){FT.munis=on?[...FT.munis,c]:FT.munis.filter(x=>x!==c)}
async function doTxSearch(){
  const msg=$('#t_msg');
  if(!FT.munis.length){msg.textContent='市区町村を1つ以上選んでください。';return}
  if(FT.munis.length>20){msg.textContent='市区町村は20までにしてください。';return}
  LS.set('txfilter',FT);$('#t_go').disabled=true;msg.textContent='売買事例を読み込んでいます…';
  try{TX.prog=t=>{msg.textContent=t};for(const c of FT.munis)await loadTx(c);TX.prog=null}catch(e){msg.textContent='読み込めませんでした。電波の良い所でもう一度試してください。';$('#t_go').disabled=false;return}
  TX.res=null;shown=40;go('list');
}
function txFilt(){
  const lim=(Math.floor(qNow()/10)-FT.years)*10+qNow()%10;
  const plans=(FT.plans||[]).map(k=>PLANS.find(p=>p[0]===k)[1]);
  const pmn=FT.pmin?FT.pmin*1e4:0,pmx=FT.pmax?FT.pmax*1e4:Infinity,amn=+FT.amin||0,amx=+FT.amax||Infinity;
  const out=[];
  for(const c of FT.munis){const f=TX.files[c];if(!f)continue;
    for(const o of f.recs){
      if(!FT.types.includes(o.t))continue;
      if(o.per&&o.per<=lim)continue;
      if(o.price<pmn||o.price>pmx)continue;
      if(o.area!=null&&(o.area<amn||o.area>amx))continue;
      if(FT.ageMax&&(o.age==null||o.age>FT.ageMax))continue;
      if(plans.length&&!plans.some(re=>re.test(o.plan)))continue;
      if(FT.walk&&(o.stm==null||o.stm>FT.walk))continue;
      if(FT.closedOnly&&!o.closed)continue;
      if(FT.cheap&&!(o.ratio!=null&&o.ratio<0.9))continue;
      const sc=districtScore(o.D,c);
      if(FT.grade&&(!sc||GR[sc.r.grade]<GR[FT.grade]))continue;
      if(FT.noFlood&&(o.D.hz.flood||o.D.hz.surge||o.D.hz.tsunami))continue;
      if(FT.noSlide&&(o.D.hz.debris||o.D.hz.slope||o.D.hz.slide))continue;
      if(FT.noLiq&&o.D.qk&&liqLand(o.D.qk[3]))continue;
      if(FT.noFire&&o.D.fr&&o.D.fr[1]>=3)continue;
      if(FT.proj&&!(sc&&sc.f.pj.some(x=>x.d<1500)))continue;
      out.push(o);
    }}
  return out;
}
const TSORT={score:['場所の評価が高い順',(a,b)=>((b.D.sc&&b.D.sc.r.total)||0)-((a.D.sc&&a.D.sc.r.total)||0)],cheap:['割安な順（相場比）',(a,b)=>(a.ratio??9)-(b.ratio??9)],price:['安い順',(a,b)=>a.price-b.price],dear:['高い順',(a,b)=>b.price-a.price],unit:['㎡単価が安い順',(a,b)=>(a.unit||9e9)-(b.unit||9e9)],new:['新しい順',(a,b)=>(b.per||0)-(a.per||0)],area:['広い順',(a,b)=>(b.area||0)-(a.area||0)],walk:['駅に近い順',(a,b)=>(a.stm??99)-(b.stm??99)],station:['駅ごと（利用者の多い駅から）',(a,b)=>stCmp(a.stn,b.stn)||(a.stm??99)-(b.stm??99)],pj:['再開発・新駅の効果が大きい順',(a,b)=>pjCmpV(a.D.sc&&a.D.sc.r,b.D.sc&&b.D.sc.r)],pjyear:['再開発・新駅の完成が早い順',(a,b)=>pjCmpY(a.D.sc&&a.D.sc.r,b.D.sc&&b.D.sc.r)||pjCmpV(a.D.sc&&a.D.sc.r,b.D.sc&&b.D.sc.r)]};
let tsort=LS.get('tsort','score');
function getTx(){if(!TX.res)TX.res=txFilt().sort(TSORT[tsort][1]);return TX.res}

// ---------- 一覧・詳細 ----------
function txTitle(o){return [TYPE_S[o.t],o.plan,o.area?o.area+'㎡':'',o.age!=null?(o.age?'築'+o.age+'年':'新築'):''].filter(Boolean).join('・')}
// 建物の地震・火災への強さ（旧耐震＝1981年以前の建築、木造）
function bldTags(o){const a=[];if(o.t!=='l'&&o.by&&o.by<=1981)a.push(['旧耐震（'+o.by+'年築）','bad']);
  if(o.t!=='l'&&/木造/.test(o.st||'')&&o.D.fr&&o.D.fr[1]>=3)a.push(['木造×火災危険度'+o.D.fr[1],'bad']);return a}
function txItemHtml(o){
  const sc=districtScore(o.D,o.code),g=sc?sc.r.grade:'D',m=D.muni[o.code],rt=ratioTag(o.ratio);
  const hz=sc?sc.r.tags.filter(t=>/浸水|土砂|液状化|火災|倒壊/.test(t[0])):[];
  return `<div class="item" onclick="showTx('${o.code}',${o.k})">
    <div class="grade g${sc?g:'D'}"><b>${sc?g:'－'}</b><small>${sc?sc.r.total+'点':'位置不明'}</small></div>
    <div style="flex:1;min-width:0">
      <div style="color:var(--bad);font-weight:700">売却済み（${perTxt(o.per)}に${o.closed?'成約':'取引'}）</div>
      <div class="t">${esc(txTitle(o))}</div>
      <div class="m">${esc(m?m[1]:'')}${esc(o.D.n)}${o.stn?`・${esc(o.stn)}駅${o.stm!=null?' 徒歩'+o.stm+'分':''}`:''}・${perTxt(o.per)}・${o.closed?'成約':'取引'}</div>
      <div><span class="price">${man(o.price)}</span> <span class="m">${o.unit?'㎡'+unit(o.unit):''}</span></div>
      ${sc?pjLine(sc.r):''}
      <div class="tags">${rt?`<span class="tag ${rt[1]}">${rt[0]}</span>`:''}${bldTags(o).map(([x,c])=>`<span class="tag ${c}">${esc(x)}</span>`).join('')}${hz.slice(0,3).map(([t,c])=>`<span class="tag ${c}">${esc(t)}</span>`).join('')}${o.stm!=null&&o.stm<=7?`<span class="tag good">駅徒歩${o.stm}分</span>`:''}</div>
      ${o.D.la!=null?viewLinks({lat:o.D.la,lon:o.D.lo,code:o.code,town:o.D.n,kind:o.t,small:true}):''}
    </div></div>`;
}
function renderTxList(m){
  if(!FT.munis.length||!FT.munis.every(c=>TX.files[c])){m.innerHTML=modeSwitch()+'<div class="card">「さがす」で市区町村を選んで検索してください。</div>';return}
  const r0=getTx(),r=TX.stF?r0.filter(o=>o.stn===TX.stF):r0;
  m.innerHTML=modeSwitch()+`<div class="bar"><span class="n">${r.length.toLocaleString()}件</span>
    <select id="tsort" style="width:auto;flex:1">${Object.entries(TSORT).map(([k,[n]])=>`<option value="${k}" ${tsort===k?'selected':''}>${n}</option>`).join('')}</select>
    <button class="btn sm sub" onclick="go('search')">条件を変える</button></div>
    ${stationSelect(r0.map(o=>o.stn),TX.stF,'TX.stF=this.value;shown=40;renderTxList($(\'#main\'))')}
    ${marketHtml(r)}
    <div>${grouped(r.slice(0,shown),tsort==='station',o=>o.stn,txItemHtml)}</div>
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
  const o=f.recs[+k],sc=districtScore(o.D,code),mu=D.muni[code],rt=ratioTag(o.ratio),e=expUnit(f,o.t,o.age,o.stm);
  m.innerHTML=`<button class="back" onclick="S.detail=null;go(S.prev)">‹ 戻る</button>
  <div class="card"><div class="big"><div class="grade g${sc?sc.r.grade:'D'}"><b>${sc?sc.r.grade:'－'}</b><small>${sc?sc.r.total+'点':''}</small></div>
    <div><div style="color:var(--bad);font-weight:700">売却済み（${perTxt(o.per)}に${o.closed?'成約':'取引'}）</div><div style="font-weight:700">${esc(txTitle(o))}</div><div class="note">${esc(mu?mu[0]+' '+mu[1]:'')}${esc(o.D.n)}・${perTxt(o.per)}に${o.closed?'成約':'取引'}</div>
    <div class="tags">${rt?`<span class="tag ${rt[1]}">${rt[0]}</span>`:''}${bldTags(o).map(([x,c])=>`<span class="tag ${c}">${esc(x)}</span>`).join('')}${sc?sc.r.tags.filter(x=>!/^駅徒歩/.test(x[0])).map(([t,c])=>`<span class="tag ${c}">${esc(t)}</span>`).join(''):''}</div></div></div>
    <div class="boxes">
      <div class="box"><small>価格</small><b>${man(o.price)}</b></div>
      ${o.unit?`<div class="box"><small>1㎡あたり</small><b>${unit(o.unit)}</b></div>`:''}
      ${e?`<div class="box"><small>同じ市区町村の相場（${o.t==='l'?'土地の中央値':'築'+(o.age??'?')+'年'+(o.stm!=null&&f.model[o.t]&&f.model[o.t].w?'・駅徒歩'+o.stm+'分':'')+'なら'}）</small><b>${unit(Math.round(e))}/㎡</b></div>`:''}
      ${o.ratio?`<div class="box"><small>相場比</small><b>${Math.round(o.ratio*100)}%</b></div>`:''}
    </div>
    <div class="note" style="margin-top:6px">相場は、同じ市区町村で直近3年に売れた同じ種類の物件から、築年数と駅からの徒歩分数による価格の違いを考えて計算しています${o.t==='l'?'（土地は同じ町丁に5件以上あればその中央値）':''}。</div></div>
  <div class="card"><h2>この物件を見る</h2>
    ${o.D.la!=null?viewLinks({lat:o.D.la,lon:o.D.lo,code,town:o.D.n,kind:o.t}):''}
    <div class="note">国の売買データは、個人が特定されないよう番地・物件名・部屋番号が公表されていません。そのため、売れた物件そのもののページはありません。ストリートビューは${esc(o.D.n)}の中心付近を、SUUMOは同じ町で今売り出し中の${BS[o.t][1]}を開きます。</div></div>
  <div class="card"><h2>物件の情報</h2><dl class="kv">
    <dt>種類</dt><dd>${TYPE_N[o.t]}</dd>${o.stn?`<dt>最寄り駅</dt><dd>${esc(o.stn)}駅${o.stm!=null?' 徒歩'+o.stm+'分':''}</dd>`:''}<dt>面積</dt><dd>${o.area??'—'}㎡${o.tfa?`（延床 ${o.tfa}㎡）`:''}</dd>
    ${o.plan?`<dt>間取り</dt><dd>${esc(o.plan)}</dd>`:''}<dt>建築年</dt><dd>${o.by?o.by+'年':'—'}</dd>
    ${o.st?`<dt>構造</dt><dd>${esc(o.st)}${/木造/.test(o.st)?'（燃えやすい構造）':/ＲＣ|RC|ＳＲＣ|SRC/.test(o.st)?'（鉄筋コンクリート：燃えにくい）':''}</dd>`:''}
    ${o.t!=='l'&&o.by?`<dt>耐震基準</dt><dd>${o.by<=1981?'<span class="tag bad">旧耐震の可能性（1981年以前の建築）</span>':'新耐震（1982年以降の建築）'}</dd>`:''}${o.far?`<dt>容積率</dt><dd>${o.far}%</dd>`:''}${o.road?`<dt>前面道路</dt><dd>幅${o.road}m</dd>`:''}
    ${o.shape?`<dt>土地の形</dt><dd>${esc(o.shape)}</dd>`:''}${o.ren?`<dt>改装</dt><dd>${esc(o.ren)}</dd>`:''}${o.rem?`<dt>事情</dt><dd>${esc(o.rem)}</dd>`:''}
    <dt>出典</dt><dd>国土交通省 不動産情報ライブラリ（${o.closed?'成約価格':'取引価格'}）</dd></dl></div>
  ${sc?`<div class="card"><h2>場所の評価の内訳（${esc(o.D.n)}の中心付近）</h2>${scoreHtml(sc.r)}<div class="note">住所は町丁までしか公表されていないため、町丁の中心付近で判定しています。駅までは、国のデータにある最寄り駅と徒歩分数（その町丁の中央値）を使っています。</div></div>
  <div class="card"><h2>災害リスク（町丁の中心付近）</h2>${hazardTable(o.D.hz,o.D.lq,o.D.qk,o.D.fr,String(code).startsWith('13'))}</div>
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
function txCompare(e,lat,lon,code,walkM){
  const f=TX.files[code];if(!f)return null;
  const t={mansion:'m',house:'h',land:'l'}[e.kind],age=e.age!==''&&e.age!=null?+e.age:null,area=+e.area;
  const near=f.recs.filter(o=>o.t===t&&o.unit>0&&o.D.la!=null).map(o=>[o,distM(lat,lon,o.D.la,o.D.lo)]).filter(x=>x[1]<2000).sort((a,b)=>a[1]-b[1]);
  let base,how;
  if(t==='l'){const u=near.slice(0,30).map(x=>x[0].unit);if(u.length<5)return null;base=median(u);how=`半径2km以内で売れた土地${u.length}件の㎡単価の中央値 ${unit(Math.round(base))} × ${area}㎡`}
  else{
    if(age==null)return {est:null,list:near.slice(0,5).map(x=>x[0])};
    const wmin=walkM!=null?Math.ceil(walkM/80):null;
    const ex=expUnit(f,t,age,wmin);if(!ex)return null;
    const rs=near.filter(x=>x[1]<1500).map(x=>x[0].ratio).filter(v=>v!=null);
    const adj=rs.length>=5?median(rs):1;base=ex*adj;
    how=`${D.muni[code]?D.muni[code][1]:''}で売れた${TYPE_S[t]}の相場（築${age}年${wmin!=null&&f.model[t].w?'・駅徒歩約'+wmin+'分':''}なら ${unit(Math.round(ex))}/㎡）${rs.length>=5?`× この近く1.5km以内の事例${rs.length}件の傾向 ${Math.round(adj*100)}%`:''} × ${area}㎡`;
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
  <dt>アプリのデータ</dt><dd>${esc(D.built)}（毎週月曜に自動で更新）</dd>
  <dt>地価</dt><dd>公示 ${mt.land?mt.land.L01:''}年・調査 ${mt.land?mt.land.L02:''}年</dd>
  <dt>売買事例</dt><dd>${mt.tx?esc(mt.tx)+(mt.txsrc==='CSV'?'取込':'取得')+'（'+perTxt(qNow())+'まで）':'まだ入っていません'}</dd>
  <dt>災害の想定</dt><dd>${esc(mt.hazard||'')}取得（3か月ごと）</dd>
  <dt>ニュース</dt><dd>${esc(mt.news||'')}</dd></dl></div>`;
}

// ---------- 最新の売買データを端末に取り込む ----------
const RP_URL='https://www.reinfolib.mlit.go.jp/realEstatePrices/';
function updateBox(){
  const q=qNow(),li=TX.localIdx||{},n=Object.values(li).reduce((s,v)=>s+v[0],0);
  return `<div class="card"><h2>売買データを最新にする</h2>
  <div class="note">今のデータ：${q?perTxt(q)+'まで':'なし'}${n?`（この端末で取り込んだ ${n.toLocaleString()}件を含む）`:''}。国は3か月ごとに新しい期間を追加します。</div>
  <button class="btn" id="auto_btn" style="margin-top:10px" onclick="autoUpdate()">最新の売買データをダウンロード（自動）</button>
  <div id="auto_msg" class="note" style="margin-top:6px">${(()=>{const j=LS.get('justUpdated','');if(j){LS.set('justUpdated','');return '<b style="color:var(--good)">✓ '+esc(j)+'</b><br>'}return''})()}押すと、Macが国のサイトからダウンロード・解凍・取り込み・公開まで行い、終わるとこのアプリが自動で最新になります（数分）。</div>
  <details style="margin-top:10px"><summary class="note">Macが使えないとき（手動で取り込む）</summary>
  <ol class="note" style="font-size:13px;padding-left:18px;margin:8px 0">
  <li>下のボタンで国のサイトを開く</li>
  <li>「住所から」で都道府県を選び、市区町村は「市区町村」のまま。取引価格・成約価格の両方にチェック</li>
  <li>種類は「中古マンション等」（土地・戸建ても見たいときは「宅地」でもう1回）、時期は一番新しい期間まで</li>
  <li>「ダウンロード」を押す（zipファイルが保存されます）</li>
  <li>このアプリに戻り「ダウンロードしたファイルを取り込む」でそのzipを選ぶ（複数選べます）</li></ol>
  <div class="links"><a class="btn sm" href="${RP_URL}" target="_blank" rel="noopener">国のサイトを開く（ダウンロード）</a>
  <label class="btn sm sub" style="cursor:pointer">ダウンロードしたファイルを取り込む<input type="file" accept=".zip,.csv,application/zip,text/csv" multiple style="display:none" onchange="importTx(this.files)"></label></div>
  <div id="imp_msg" class="note" style="margin-top:6px"></div>
  ${n?`<button class="chip" style="margin-top:8px" onclick="clearLocalTx()">この端末で取り込んだデータを消す</button>`:''}</details></div>`;
}
// IndexedDB（取り込んだデータは大きいので localStorage ではなくこちら）
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open('shisan-navi',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbGet(k){const db=await idb();return new Promise((res,rej)=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function idbSet(k,v){const db=await idb();return new Promise((res,rej)=>{const tr=db.transaction('kv','readwrite');tr.objectStore('kv').put(v,k);tr.oncomplete=()=>res();tr.onerror=()=>rej(tr.error)})}
async function idbClear(){const db=await idb();return new Promise(res=>{const tr=db.transaction('kv','readwrite');tr.objectStore('kv').clear();tr.oncomplete=()=>res()})}
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
function parseCSV(text){
  const rows=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!=='\r')f+=c}
  if(f||row.length){row.push(f);rows.push(row)}return rows;
}
const TXT={'中古マンション等':'m','宅地(土地と建物)':'h','宅地(土地)':'l'};
const nk=s=>String(s||'').normalize('NFKC').trim();
const numv=s=>{const m=nk(s).replace(/,/g,'').match(/\d+(\.\d+)?/);return m?+m[0]:null};
function decodeCSV(buf){let t=new TextDecoder('utf-8').decode(buf);if(!t.includes('種類'))t=new TextDecoder('shift_jis').decode(buf);return t.replace(/^﻿/,'')}
async function importTx(files){
  const msg=$('#imp_msg');if(!files||!files.length)return;
  try{
    msg.textContent='ファイルを読んでいます…';
    const texts=[];
    for(const f of files){
      if(/\.zip$/i.test(f.name)||f.type.includes('zip')){
        if(!window.JSZip)await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        const z=await JSZip.loadAsync(await f.arrayBuffer());
        for(const n of Object.keys(z.files))if(/\.csv$/i.test(n))texts.push(decodeCSV(await z.files[n].async('uint8array')));
      }else texts.push(decodeCSV(new Uint8Array(await f.arrayBuffer())));
    }
    const by={};let cnt=0;
    for(const text of texts){
      const rows=parseCSV(text),h=(rows.shift()||[]).map(nk),ix=l=>h.findIndex(x=>x.includes(nk(l)));
      const I={type:ix('種類'),cat:ix('価格情報区分'),code:ix('市区町村コード'),pref:ix('都道府県名'),muni:ix('市区町村名'),dist:ix('地区名'),stn:ix('最寄駅:名称'),stm:ix('最寄駅:距離'),
        price:ix('取引価格(総額)'),plan:ix('間取り'),area:ix('面積('),unit:ix('取引価格(㎡単価)'),shape:ix('土地の形状'),tfa:ix('延床面積'),by:ix('建築年'),st:ix('建物の構造'),
        road:ix('幅員'),far:ix('容積率'),per:ix('取引時期'),ren:ix('改装'),rem:ix('取引の事情')};
      if(I.type<0||I.price<0)continue;
      const g=(r,k)=>I[k]>=0?nk(r[I[k]]):'';
      for(const r of rows){
        const t=TXT[g(r,'type')],price=numv(g(r,'price'));if(!t||!price)continue;
        const code=g(r,'code').slice(0,5);if(!code)continue;
        const pm=g(r,'per').match(/(\d{4})年第(\d)四半期/),per=pm?+pm[1]*10+ +pm[2]:null;
        const bym=g(r,'by').match(/(\d{4})/),byv=g(r,'by').includes('戦前')?1945:bym?+bym[1]:null;
        const area=numv(g(r,'area')),unitv=numv(g(r,'unit'))||(area?Math.round(price/area):null);
        (by[code]=by[code]||{pref:g(r,'pref'),muni:g(r,'muni'),rows:[]}).rows.push([t,g(r,'cat').includes('成約')?1:0,g(r,'dist'),price,area,unitv,g(r,'plan'),numv(g(r,'tfa')),byv,g(r,'st'),per,numv(g(r,'far')),g(r,'ren'),g(r,'rem'),g(r,'shape'),numv(g(r,'road')),g(r,'stn'),g(r,'stm')?numv(g(r,'stm')):null]);
        cnt++;
      }
    }
    if(!cnt){msg.textContent='売買価格のデータが見つかりませんでした。国のサイトでダウンロードしたzipを選んでください。';return}
    msg.textContent=`${cnt.toLocaleString()}件を保存しています…`;
    const idx=Object.assign({},TX.localIdx||{});
    for(const [code,v] of Object.entries(by)){
      const old=await idbGet('tx:'+code),seen=new Set(),rows=[];
      for(const r of (old?old.rows:[]).concat(v.rows)){const k=r.join('|');if(!seen.has(k)){seen.add(k);rows.push(r)}}
      await idbSet('tx:'+code,{pref:v.pref,muni:v.muni,rows});
      idx[code]=[rows.length,Math.max(...rows.map(r=>r[10]||0))];delete TX.files[code];
    }
    await idbSet('txidx',idx);TX.localIdx=idx;TX.res=null;
    msg.textContent=`${cnt.toLocaleString()}件を取り込みました（${Object.keys(by).length}市区町村）。検索で使えます。`;
    setTimeout(()=>renderTxSearch($('#main')),1500);
  }catch(e){msg.textContent='取り込めませんでした：'+(e.message||e)}
}
async function clearLocalTx(){if(!confirm('この端末で取り込んだ売買データを消しますか？'))return;await idbClear();TX.localIdx={};TX.files={};TX.res=null;renderTxSearch($('#main'))}
// 取り込んだデータを、公開データと同じ形にする（町丁の位置は公開データ→端末の記録→住所検索の順）
async function localFile(code,pub){
  const L=await idbGet('tx:'+code);if(!L)return pub;
  const known={};if(pub)for(const d of pub.d)known[d[0]]=d;
  const cache=(await idbGet('geo:'+code))||{};
  const names=[...new Set(L.rows.map(r=>r[2]))],need=names.filter(n=>!known[n]&&!(n in cache));
  let done=0;
  const work=async n=>{try{const g=await geocode(L.pref+L.muni+n);const [hz,qk]=await Promise.all([hazardAt(g.lat,g.lon),quakeAt(g.lat,g.lon)]);const np=nearest(g.lat,g.lon,1)[0];cache[n]=[n,g.lat,g.lon,hz,null,np?np[0].i:-1,qk,String(code).startsWith('13')?fireAt(g.lat,g.lon):null]}catch(e){cache[n]=[n,null,null,{},null,-1]}
    done++;if(TX.prog)TX.prog(`${L.muni}の町丁の位置と災害の想定を調べています… ${done}/${need.length}`)};
  for(let i=0;i<need.length;i+=4)await Promise.all(need.slice(i,i+4).map(work));
  if(need.length)await idbSet('geo:'+code,cache);
  const d=[],di={};
  for(const n of names){di[n]=d.length;d.push(known[n]||cache[n]||[n,null,null,{},null,-1])}
  return {d,r:L.rows.map(r=>{const a=r.slice();a[2]=di[r[2]];return a})};
}

// ---------- ボタン1つで最新に（Macが国のサイトから取ってきて公開する） ----------
const NTFY='https://ntfy.sh/',TOPIC='shisan-navi-ab2dc4cb2fe42622297ccb68';
function autoUpdate(){
  const btn=$('#auto_btn'),msg=$('#auto_msg');btn.disabled=true;
  const show=t=>{msg.textContent=t};
  let started=false,es=null;
  try{es=new EventSource(NTFY+TOPIC+'-status/sse')}catch(e){}
  const end=()=>{try{es&&es.close()}catch(e){};btn.disabled=false};
  if(es)es.onmessage=ev=>{let m;try{m=JSON.parse(ev.data)}catch(e){return}
    const [k,txt]=String(m.message||'').split('|');if(!txt)return;
    started=true;show(txt);
    if(k==='done'){end();show(txt+' 読み込み直します…');LS.set('justUpdated',txt);setTimeout(()=>location.reload(),1500)}
    if(k==='error'||k==='recent')end();};
  // 受け手の準備ができてから合図を送る
  setTimeout(()=>{fetch(NTFY+TOPIC,{method:'POST',body:'update'}).then(()=>show('Macに合図を送りました。返事を待っています…')).catch(()=>{show('合図を送れませんでした。電波の良い所でもう一度押してください。');end()})},1200);
  setTimeout(()=>{if(!started){show('Macから返事がありません。Macの電源が切れているか、スリープ中です。Macを開いてからもう一度押すか、下の「Macが使えないとき」から手動で取り込んでください。');end()}},45000);
}

// 間取り（SUUMOと同じ分け方）
const PLANS=[['ワンルーム',/^1R/],['1K',/^1K/],['1DK',/^1DK/],['1LDK',/^1LDK/],['2K',/^2K/],['2DK',/^2DK/],['2LDK',/^2LDK/],['3K',/^3K/],['3DK',/^3DK/],['3LDK',/^3LDK/],['4K以上',/^([4-9]|\d\d)/]];
function togPlan(k){const a=FT.plans||[];FT.plans=a.includes(k)?a.filter(x=>x!==k):[...a,k];renderTxSearch($('#main'))}
