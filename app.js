// 資産価値ナビ 関東
const VER='v9';
let D=null,P=[],map=null,mapLayers={},results=null,shown=40;
const S={tab:'search',detail:null,prev:'list',sort:'score',evalRes:null};
const LS={get(k,d){try{const v=localStorage.getItem('shisan-'+k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem('shisan-'+k,JSON.stringify(v))}catch(e){}}};
const PREFS=[['13','東京都','tokyo'],['14','神奈川県','kanagawa'],['11','埼玉県','saitama'],['12','千葉県','chiba'],['08','茨城県','ibaraki'],['09','栃木県','tochigi'],['10','群馬県','gunma']];
const DEF={prefs:['13'],munis:[],q:'',use:'all',pmin:'',pmax:'',walk:0,grade:'',noFlood:false,noSlide:false,noSea:false,proj:false,up:false,popUp:false};
let F=Object.assign({},DEF,LS.get('filter',{}));
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function distM(a,b,c,d){const x=(d-b)*Math.cos((a+c)/2*Math.PI/180)*111320,y=(c-a)*110540;return Math.hypot(x,y)}
function man(v){if(!v&&v!==0)return'—';if(v>=1e8)return(v/1e8).toFixed(2).replace(/\.?0+$/,'')+'億円';return Math.round(v/1e4).toLocaleString()+'万円'}
function unit(v){return v>=1e4?(v/1e4).toFixed(v>=1e6?0:1)+'万円':v.toLocaleString()+'円'}
const walkMin=m=>Math.max(1,Math.ceil(m/80));

// ---------- 評価のしくみ ----------
const DEPTH={0.3:'0.3m未満',0.5:'0.3〜0.5m',1:'0.5〜1m',3:'1〜3m',5:'3〜5m',10:'5〜10m',20:'10〜20m',30:'20m以上'};
// 微地形区分（J-SHIS）から液状化のしやすさの目安：2=しやすい、1=ややしやすい
function liqLand(g){g=String(g||'');if(/埋立|干拓|旧河道|河原|砂丘間/.test(g))return 2;if(/後背湿地|三角州|海岸低地|砂州|砂礫州|自然堤防|谷底低地|湿地/.test(g))return 1;return 0}
function liqCut(lq){const t=String(lq[1]||'');if(/しにくい|対象外|なし/.test(t))return 0;if(/非常に|極めて|きわめて|特に/.test(t))return 8;if(/やや/.test(t))return 3;if(/しやすい/.test(t))return 6;return 0}
const HZN={flood:'洪水（想定最大）',surge:'高潮',tsunami:'津波',debris:'土石流',slope:'がけ崩れ（急傾斜地）',slide:'地すべり'};
// 洪水タイルは6段階の凡例（0.5m未満／0.5〜3m／3〜5m…）、高潮・津波は8段階
const DEPTH_F={0.3:'0.5m未満',0.5:'0.5m未満',1:'0.5〜3m',3:'0.5〜3m',5:'3〜5m',10:'5〜10m',20:'10〜20m',30:'20m以上'};
const dl=(k,v)=>(k==='flood'?DEPTH_F:DEPTH)[v];
function waterCut(d,k){if(k==='flood'&&d<=3)return d>=1?9:3;return d>=5?15:d>=3?12:d>=1?8:d>=0.5?5:d>0?3:0}
function cagr(a,b,n){return a>0&&b>0?Math.pow(b/a,1/n)-1:null}
const W_ST={'事業中':1,'計画':0.7,'構想':0.4};
function score(f){
  const parts=[],tags=[];
  // 1 安全性 25
  {let n=[],cut=0;const hz=f.hz||{};
    const w=[];
    if(hz.flood){w.push(waterCut(hz.flood,'flood'));n.push(`洪水で${dl('flood',hz.flood)}の浸水想定`)}
    if(hz.surge){w.push(waterCut(hz.surge)*0.8);n.push(`高潮で${DEPTH[hz.surge]}の浸水想定`)}
    if(hz.tsunami){w.push(hz.tsunami>=3?15:hz.tsunami>=1?10:6);n.push(`津波で${DEPTH[hz.tsunami]}の浸水想定`)}
    w.sort((a,b)=>b-a);cut+=(w[0]||0)+(w.slice(1).reduce((a,b)=>a+b,0))*0.4;
    const ls=Math.max(hz.debris||0,hz.slope||0,hz.slide||0);
    if(ls){cut+=ls===2?20:10;n.push(ls===2?'土砂災害特別警戒区域（レッドゾーン）':'土砂災害警戒区域（イエローゾーン）')}
    const v=clamp(25-cut,0,25);
    if(!n.length)n.push('洪水・高潮・津波・土砂災害の想定区域に入っていない');
    parts.push({k:'水害・土砂',max:25,v,n});
    if(hz.flood||hz.surge||hz.tsunami){const [k,d]=[['flood',hz.flood||0],['surge',hz.surge||0],['tsunami',hz.tsunami||0]].sort((a,b)=>waterCut(b[1],b[0])-waterCut(a[1],a[0]))[0];tags.push([`浸水${dl(k,d)}`,waterCut(d,k)>=9?'bad':'warn'])}else tags.push(['浸水想定なし','good']);
    if(ls)tags.push([ls===2?'土砂レッド':'土砂イエロー','bad']);
  }
  // 1b 地震・火災 15
  {let n=[],cut=0;const q=f.qk,fr=f.fr;
    if(q){const [p6l,p6u,arv,geo]=q;
      cut+=clamp((p6u-0.03)/0.30,0,1)*4;
      n.push(`30年以内に震度6強以上の揺れ：${(p6u*100).toFixed(1)}%（6弱以上 ${(p6l*100).toFixed(0)}%）`);
      if(p6u>=0.2)tags.push([`震度6強 ${Math.round(p6u*100)}%`,'warn']);
      if(arv){cut+=clamp((arv-1.2)/0.9,0,1)*2;n.push(`地盤の揺れやすさ：${arv.toFixed(2)}倍${arv>=1.6?'（揺れやすい）':''}`)}
      const lv=liqLand(geo);
      if(lv){cut+=lv===2?4:2;n.push(`地形：${geo}（${lv===2?'液状化しやすい':'液状化ややしやすい'}）`);tags.push([lv===2?'液状化しやすい地形':'液状化ややしやすい',lv===2?'bad':'warn'])}
      else if(geo)n.push(`地形：${geo}`);
    }else{cut+=3;n.push('地震の揺れのデータなし（平均的な減点）')}
    if(f.lq){const lc=liqCut(f.lq);n.push('液状化（国の傾向図）：'+f.lq[1]);if(lc&&!(q&&liqLand(q[3])))cut+=lc>=6?4:2}
    if(fr){const [b,fi,t]=fr;cut+=(fi-1)*1.5+(b-1)*0.5;
      n.push(`東京都の地域危険度：火災 ランク${fi}・建物倒壊 ランク${b}・総合 ランク${t}（5段階で5が最も危険）`);
      if(fi>=4)tags.push([`火災危険度${fi}`,'bad']);else if(fi>=3)tags.push([`火災危険度${fi}`,'warn']);
      if(b>=4)tags.push([`倒壊危険度${b}`,'bad']);}
    else if(f.tokyo)n.push('東京都の地域危険度：この場所は調査の対象外（市街化区域外など）');
    else n.push('火災・建物倒壊の危険度：東京都以外は町丁目ごとの公表データがないため、評価に入っていません');
    const v=clamp(15-cut,0,15);
    parts.push({k:'地震・火災',max:15,v,n});
  }
  // 2 将来性 25
  {let n=[],v=0;
    if(f.g5!=null){v+=clamp((f.g5+0.01)/0.09,0,1)*15;n.push(`地価が5年で${f.g5>=0?'+':''}${((Math.pow(1+f.g5,5)-1)*100).toFixed(1)}%（年${(f.g5*100).toFixed(1)}%）`)}
    else{v+=6;n.push('地価の5年推移データなし')}
    let pj=0;const near=[];
    for(const {q,d} of f.pj||[]){const base=q.type==='st'?10:7,fd=d<800?1:d<1500?0.6:d<3000?(q.type==='st'?0.25:0.2):0;const s=base*fd*(W_ST[q.status]||0.5);if(s>0){pj+=s;near.push(`${q.name}（${(d/1000).toFixed(1)}km・${q.year}・${q.status}）`)}}
    v+=Math.min(10,pj);
    if(near.length)n.push(...near.slice(0,3).map(s=>'近くの計画：'+s));else n.push('3km以内に大きな新駅・再開発計画なし');
    parts.push({k:'将来性',max:25,v,n});
    if(f.g5!=null){const g=(Math.pow(1+f.g5,5)-1)*100;if(g>=20)tags.push([`5年+${g.toFixed(0)}%`,'good']);else if(g<=-1)tags.push([`5年${g.toFixed(0)}%`,'bad'])}
    if(pj>=4)tags.push([(f.pj||[]).some(x=>x.q.type==='st'&&x.d<1500)?'新駅・延伸の近く':'再開発の近く','good']);
  }
  // 3 人口 20
  {let n=[],v=0;
    if(f.pop){const i35=f.pop[3]/f.pop[0]*100,i50=f.pop[6]/f.pop[0]*100;v+=clamp((i35-85)/20,0,1)*14;
      n.push(`${f.muniName||'市区町村'}の人口：2020年を100として2035年${i35.toFixed(0)}・2050年${i50.toFixed(0)}`);
      if(i35>=100)tags.push(['人口増の予測','good']);else if(i35<90)tags.push(['人口減の予測','bad']);}
    else{v+=7;n.push('将来人口データなし')}
    if(f.st&&f.st.p19>0&&f.st.p24>0){const r=f.st.p24/f.st.p19;v+=clamp((r-0.8)/0.25,0,1)*6;n.push(`${f.st.n}駅の乗降客数：2019年度比${r>=1?'+':''}${((r-1)*100).toFixed(0)}%（2024年度）`)}
    else{v+=3;n.push('駅の乗降客数の推移データなし')}
    parts.push({k:'人口',max:20,v,n});
  }
  // 4 利便性 20
  {let n=[],v=0;
    if(f.walk!=null){v+=clamp((1500-f.walk)/1200,0,1)*10;n.push(`${f.st?f.st.n+'駅':'最寄り駅'}から${f.walk?`約${f.walk.toLocaleString()}m（徒歩${walkMin(f.walk)}分）`:'すぐ'}`);
      if(f.walk<=480)tags.push([`駅徒歩${walkMin(f.walk)}分`,'good']);else if(f.walk>1200)tags.push([`駅徒歩${walkMin(f.walk)}分`,'warn']);}
    if(f.st&&f.st.p24>0){v+=clamp((Math.log10(f.st.p24)-3)/3,0,1)*10;n.push(`${f.st.n}駅の1日の乗降客数 約${Math.round(f.st.p24).toLocaleString()}人`)}
    else n.push('駅の乗降客数データなし');
    parts.push({k:'利便性',max:20,v,n});
  }
  // 5 値動きの安定 10
  {let n=[],v=0;const h=f.h;
    if(h&&h[0]>0&&h[10]>0){const g10=cagr(h[0],h[10],10);v+=clamp((g10+0.01)/0.06,0,1)*6;
      let peak=0,dd=0;for(const x of h){if(!x)continue;peak=Math.max(peak,x);dd=Math.max(dd,1-x/peak)}
      v+=clamp(1-dd/0.15,0,1)*4;
      n.push(`10年で${g10>=0?'+':''}${((Math.pow(1+g10,10)-1)*100).toFixed(0)}%`);n.push(dd>0.005?`途中の最大下落 ${(dd*100).toFixed(1)}%`:'10年間で一度も下がっていない');}
    else{v+=5;n.push('10年分の推移データなし')}
    parts.push({k:'値動きの安定',max:10,v,n});
  }
  // 配点：水害・土砂20／地震・火災15／将来性22／人口18／利便性17／値動き8
  const W={'水害・土砂':20,'地震・火災':15,'将来性':22,'人口':18,'利便性':17,'値動きの安定':8};
  for(const p of parts){const w=W[p.k];p.v=p.v/p.max*w;p.max=w}
  const total=Math.round(parts.reduce((a,p)=>a+p.v,0));
  return {total,grade:grade(total),parts,tags};
}
function grade(t){return t>=78?'S':t>=68?'A':t>=58?'B':t>=48?'C':'D'}

function prep(){
  P=D.points.map(p=>{
    const st=p.si>=0?D.stations[p.si]:null,m=D.muni[p.c];
    const h=p.h,g5=h[5]>0&&h[10]>0?cagr(h[5],h[10],5):null;
    const f={hz:p.hz,lq:p.lq,qk:p.qk,fr:p.fr,tokyo:p.c.startsWith('13'),g5,h,pop:m?m[2]:null,muniName:m?m[1]:'',st,walk:p.sd,pj:p.pj.map(([j,d])=>({q:D.projects[j],d}))};
    const r=score(f);
    const z=p.z||'';const cat=/商業|近商/.test(z)||(!/住宅/.test(p.u))?'商業地':'住宅地';
    return Object.assign(p,{f,r,st,m,g5,cat,pref:p.c.slice(0,2),txt:(p.a+' '+p.sn+' '+(m?m[1]:'')).toLowerCase()});
  });
}

// ---------- 画面切り替え ----------
function go(t){S.tab=t;S.detail=null;document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));render();window.scrollTo(0,0)}
function render(){
  const m=$('#main');
  if(S.detail!=null)return (typeof S.detail==='string'?renderTxDetail:renderDetail)(m);
  if(TX.mode==='tx'&&['search','list','map'].includes(S.tab))return ({search:renderTxSearch,list:renderTxList,map:renderTxMap})[S.tab](m);
  ({search:renderSearch,list:renderList,map:renderMap,eval:renderEval,info:renderInfo,fav:renderFav,links:renderLinks})[S.tab](m);
}

// ---------- さがす ----------
function renderSearch(m){
  const munis=Object.entries(D.muni).filter(([c])=>F.prefs.includes(c.slice(0,2))&&P.some(p=>p.c===c)).sort((a,b)=>a[0].localeCompare(b[0]));
  m.innerHTML=modeSwitch()+`
  <div class="card">
    <h2>地価地点をさがす</h2>
    <div class="note">関東の地価公示・地価調査の全地点（${P.length.toLocaleString()}か所）を、災害・将来性・人口・利便性・値動きで100点満点で評価しています。</div>
    <label class="f">都県</label>
    <div class="chips">${PREFS.map(([c,n])=>`<button class="chip ${F.prefs.includes(c)?'on':''}" onclick="togPref('${c}')">${n}</button>`).join('')}</div>
    <label class="f">市区町村（選ばなければ全部）</label>
    <div class="muni">${munis.map(([c,v])=>`<label><input type="checkbox" ${F.munis.includes(c)?'checked':''} onchange="togMuni('${c}',this.checked)">${esc(v[1])}</label>`).join('')||'<span class="note">都県を選んでください</span>'}</div>
    <label class="f">住所・駅名で絞り込む</label>
    <input type="text" id="q" value="${esc(F.q)}" placeholder="例：武蔵小杉、世田谷区、半蔵門">
    <label class="f">種類</label>
    <div class="chips">${[['all','すべて'],['住宅地','住宅地'],['商業地','商業地']].map(([k,n])=>`<button class="chip ${F.use===k?'on':''}" onclick="F.use='${k}';renderSearch($('#main'))">${n}</button>`).join('')}</div>
    <label class="f">土地の値段（1㎡あたり・万円）</label>
    <div class="row"><input type="number" id="pmin" inputmode="decimal" value="${F.pmin}" placeholder="下限なし"><span style="flex:0">〜</span><input type="number" id="pmax" inputmode="decimal" value="${F.pmax}" placeholder="上限なし"></div>
    <div class="note">参考：1坪＝約3.3㎡。土地100㎡の総額は「1㎡の値段×100」。</div>
    <label class="f">駅からの徒歩</label>
    <div class="chips">${[[0,'指定なし'],[5,'5分以内'],[10,'10分以内'],[15,'15分以内'],[20,'20分以内']].map(([k,n])=>`<button class="chip ${F.walk==k?'on':''}" onclick="F.walk=${k};renderSearch($('#main'))">${n}</button>`).join('')}</div>
    <label class="f">総合評価</label>
    <div class="chips">${[['','指定なし'],['S','Sのみ'],['A','A以上'],['B','B以上'],['C','C以上']].map(([k,n])=>`<button class="chip ${F.grade===k?'on':''}" onclick="F.grade='${k}';renderSearch($('#main'))">${n}</button>`).join('')}</div>
    <label class="f">こだわり条件</label>
    ${[['noFlood','洪水・高潮・津波の浸水想定なし'],['noSlide','土砂災害の区域外'],['noLiq','液状化しやすい地形を除く'],['noFire','火災危険度3以上を除く（東京都）'],['proj','新駅・延伸・再開発まで1.5km以内'],['up','地価が5年で10%以上上昇'],['popUp','2035年の人口が2020年以上（増加予測）']].map(([k,n])=>`<label class="ck"><input type="checkbox" ${F[k]?'checked':''} onchange="F.${k}=this.checked">${n}</label>`).join('')}
    <div style="height:12px"></div>
    <button class="btn" onclick="doSearch()">この条件で検索（<span id="cnt">${count()}</span>件）</button>
    <div style="height:8px"></div>
    <button class="btn sub" onclick="F=Object.assign({},DEF);LS.set('filter',F);renderSearch($('#main'))">条件をリセット</button>
  </div>`;
  ['q','pmin','pmax'].forEach(id=>$('#'+id).addEventListener('input',e=>{F[id]=e.target.value;$('#cnt').textContent=count()}));
  m.querySelectorAll('input[type=checkbox]').forEach(e=>e.addEventListener('change',()=>{$('#cnt').textContent=count()}));
}
function togPref(c){F.prefs=F.prefs.includes(c)?F.prefs.filter(x=>x!==c):[...F.prefs,c];F.munis=F.munis.filter(x=>F.prefs.includes(x.slice(0,2)));renderSearch($('#main'))}
function togMuni(c,on){F.munis=on?[...F.munis,c]:F.munis.filter(x=>x!==c)}
const GR={S:4,A:3,B:2,C:1,D:0};
function filt(){
  const q=F.q.trim().toLowerCase().split(/\s+/).filter(Boolean),mn=F.pmin?F.pmin*1e4:0,mx=F.pmax?F.pmax*1e4:Infinity;
  return P.filter(p=>{
    if(F.prefs.length&&!F.prefs.includes(p.pref))return false;
    if(F.munis.length&&!F.munis.includes(p.c))return false;
    if(q.length&&!q.every(w=>p.txt.includes(w)))return false;
    if(F.use!=='all'&&p.cat!==F.use)return false;
    if(p.pr<mn||p.pr>mx)return false;
    if(F.walk&&walkMin(p.sd)>F.walk)return false;
    if(F.grade&&GR[p.r.grade]<GR[F.grade]-(F.grade==='S'?0:0))return false;
    if(F.noFlood&&(p.hz.flood||p.hz.surge||p.hz.tsunami))return false;
    if(F.noSlide&&(p.hz.debris||p.hz.slope||p.hz.slide))return false;
    if(F.noLiq&&p.qk&&liqLand(p.qk[3]))return false;
    if(F.noFire&&p.fr&&p.fr[1]>=3)return false;
    if(F.proj&&!p.f.pj.some(x=>x.d<1500))return false;
    if(F.up&&!(p.g5!=null&&Math.pow(1+p.g5,5)>=1.1))return false;
    if(F.popUp&&!(p.m&&p.m[2][3]>=p.m[2][0]))return false;
    return true;
  });
}
function count(){return filt().length.toLocaleString()}
function doSearch(){LS.set('filter',F);results=null;shown=40;go('list')}
const SORTS={score:['評価が高い順',(a,b)=>b.r.total-a.r.total],cheap:['安い順',(a,b)=>a.pr-b.pr],dear:['高い順',(a,b)=>b.pr-a.pr],up:['5年の上昇率順',(a,b)=>(b.g5??-9)-(a.g5??-9)],yoy:['前年比が高い順',(a,b)=>b.yo-a.yo],walk:['駅に近い順',(a,b)=>a.sd-b.sd]};
function getResults(){if(!results){results=filt().sort(SORTS[S.sort][1])}return results}

// ---------- 一覧 ----------
function itemHtml(p){
  const g=p.r.grade;
  return `<div class="item" onclick="showDetail(${p.i})">
    <div class="grade g${g}"><b>${g}</b><small>${p.r.total}点</small></div>
    <div style="flex:1;min-width:0">
      <div class="t">${esc(p.a.replace(/^(東京都|神奈川県|埼玉県|千葉県|茨城県|栃木県|群馬県)\s*/,''))}</div>
      <div class="m">${esc(p.sn)}駅 徒歩${walkMin(p.sd)}分・${p.cat}・${p.s==='公示'?'公示2026':'調査2025'}・${esc(p.z||'')}</div>
      <div><span class="price">${unit(p.pr)}/㎡</span> <span class="m">坪${unit(Math.round(p.pr*3.30579))}・前年比${p.yo>=0?'+':''}${p.yo}%</span></div>
      <div class="tags">${p.r.tags.slice(0,5).map(([t,c])=>`<span class="tag ${c}">${esc(t)}</span>`).join('')}</div>
    </div></div>`;
}
function renderList(m){
  const r=getResults();
  m.innerHTML=`<div class="bar"><span class="n">${r.length.toLocaleString()}件</span>
    <select id="sort" style="width:auto;flex:1">${Object.entries(SORTS).map(([k,[n]])=>`<option value="${k}" ${S.sort===k?'selected':''}>${n}</option>`).join('')}</select>
    <button class="btn sm sub" onclick="go('search')">条件を変える</button></div>
    <div id="items">${r.slice(0,shown).map(itemHtml).join('')}</div>
    ${r.length>shown?`<button class="btn sub" onclick="shown+=40;renderList($('#main'))">もっと見る（残り${(r.length-shown).toLocaleString()}件）</button>`:''}
    ${!r.length?'<div class="card">条件に合う地点がありません。条件をゆるめてください。</div>':''}`;
  $('#sort').onchange=e=>{S.sort=e.target.value;results=null;shown=40;renderList(m)};
}

// ---------- 地図 ----------
const GC={S:'#7a3b6e',A:'#1f7a4d',B:'#2c6ea0',C:'#b7791f',D:'#8a8a8a'};
const HZ_TILES={flood:['洪水','01_flood_l2_shinsuishin_data'],surge:['高潮','03_hightide_l2_shinsuishin_data'],tsunami:['津波','04_tsunami_newlegend_data'],dosha:['土砂災害','05_dosekiryukeikaikuiki']};
function renderMap(m){
  const r=getResults();
  m.innerHTML=`<div class="bar"><span class="n">${r.length.toLocaleString()}件</span><span class="note">${r.length>4000?'評価の高い4,000件を表示':''}</span><button class="btn sm sub" onclick="go('search')">条件を変える</button></div>
  <div class="chips" style="margin-bottom:8px">${Object.entries(HZ_TILES).map(([k,[n]])=>`<button class="chip ${mapLayers[k]?'on':''}" onclick="togHz('${k}',this)">${n}の想定を重ねる</button>`).join('')}<button class="chip ${LS.get('showProj',true)?'on':''}" onclick="togProj(this)">新駅・再開発</button></div>
  <div id="map"></div>
  <div class="legend">${Object.entries(GC).map(([g,c])=>`<span><i style="background:${c}"></i>${g}</span>`).join('')}<span>★＝新駅・延伸（紫）／再開発（橙）</span></div>
  <div class="note">地図：国土地理院。災害の想定：重ねるハザードマップ。</div>`;
  if(map){map.remove();map=null}
  map=L.map('map',{preferCanvas:true});map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');map.setView([35.68,139.75],11);
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{maxZoom:18,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'}).addTo(map);
  for(const k in mapLayers){mapLayers[k]=L.tileLayer(`https://disaportaldata.gsi.go.jp/raster/${HZ_TILES[k][1]}/{z}/{x}/{y}.png`,{opacity:.55,maxNativeZoom:17,maxZoom:18}).addTo(map)}
  const pts=r.slice().sort((a,b)=>b.r.total-a.r.total).slice(0,4000),grp=[];
  for(const p of pts){const c=L.circleMarker([p.la,p.lo],{radius:6,color:'#fff',weight:1,fillColor:GC[p.r.grade],fillOpacity:.9});
    c.bindPopup(`<b>${p.r.grade}（${p.r.total}点）</b> ${esc(p.a)}<br>${unit(p.pr)}/㎡・${esc(p.sn)}駅 徒歩${walkMin(p.sd)}分<br><a href="#" onclick="showDetail(${p.i});return false">詳しく見る</a>`);c.addTo(map);grp.push([p.la,p.lo])}
  projLayer=L.layerGroup();
  for(const q of D.projects){L.marker([q.lat,q.lon],{icon:L.divIcon({className:'',html:`<div style="font-size:20px;color:${q.type==='st'?'#7a3b6e':'#d9822b'};text-shadow:0 0 3px #fff">★</div>`,iconSize:[20,20],iconAnchor:[10,10]})}).bindPopup(`<b>${esc(q.name)}</b><br>${esc(q.year)}・${esc(q.status)}<br>${esc(q.note)}`).addTo(projLayer)}
  if(LS.get('showProj',true))projLayer.addTo(map);
  if(grp.length){const q=(a,f)=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*f))]};
    const la=grp.map(x=>x[0]),lo=grp.map(x=>x[1]),lw=grp.length>20?.03:0;map.fitBounds([[q(la,lw),q(lo,lw)],[q(la,1-lw),q(lo,1-lw)]],{maxZoom:14,padding:[20,20]})}
}
let projLayer=null;
function togHz(k,el){if(mapLayers[k]){map.removeLayer(mapLayers[k]);delete mapLayers[k];el.classList.remove('on')}else{mapLayers[k]=L.tileLayer(`https://disaportaldata.gsi.go.jp/raster/${HZ_TILES[k][1]}/{z}/{x}/{y}.png`,{opacity:.55,maxNativeZoom:17,maxZoom:18}).addTo(map);el.classList.add('on')}}
function togProj(el){const on=!LS.get('showProj',true);LS.set('showProj',on);el.classList.toggle('on',on);if(on)projLayer.addTo(map);else map.removeLayer(projLayer)}

// ---------- 詳細 ----------
function showDetail(i){S.prev=S.tab;S.detail=i;render();window.scrollTo(0,0)}
function scoreHtml(r){
  return r.parts.map(p=>`<div class="sbar"><div class="h"><span>${p.k}</span><span>${p.v.toFixed(1)} / ${p.max}</span></div>
    <div class="track"><div class="fill" style="width:${p.v/p.max*100}%"></div></div><ul>${p.n.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`).join('');
}
function lineChart(vals,labels,fmt){
  const w=320,h=140,pl=44,pr=8,pt=10,pb=22,xs=vals.map((v,i)=>[i,v]).filter(x=>x[1]>0);if(xs.length<2)return'';
  const mn=Math.min(...xs.map(x=>x[1]))*0.95,mx=Math.max(...xs.map(x=>x[1]))*1.02,X=i=>pl+i/(vals.length-1)*(w-pl-pr),Y=v=>pt+(1-(v-mn)/(mx-mn))*(h-pt-pb);
  const d=xs.map(([i,v],k)=>(k?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%"><line x1="${pl}" x2="${w-pr}" y1="${h-pb}" y2="${h-pb}" stroke="var(--line)"/>
  <text x="${pl-4}" y="${Y(mx)+4}" text-anchor="end">${fmt(mx)}</text><text x="${pl-4}" y="${Y(mn)}" text-anchor="end">${fmt(mn)}</text>
  <path d="${d}" fill="none" stroke="var(--acc)" stroke-width="2.5"/>${xs.map(([i,v])=>`<circle cx="${X(i)}" cy="${Y(v)}" r="2.5" fill="var(--acc)"/>`).join('')}
  ${labels.map((l,i)=>l?`<text x="${X(i)}" y="${h-6}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}">${l}</text>`:'').join('')}</svg>`;
}
function hazardTable(hz,lq,qk,fr,tokyo){
  return `<table class="t">${Object.entries(HZN).map(([k,n])=>{const v=hz[k];let t='想定区域外',c='good';
    if(v){if(['debris','slope','slide'].includes(k)){t=v===2?'特別警戒区域（レッド）':'警戒区域（イエロー）';c='bad'}else{t=dl(k,v)+'の浸水';c=waterCut(v,k)>=9?'bad':'warn'}}
    return `<tr><td>${n}</td><td><span class="tag ${c}">${t}</span></td></tr>`}).join('')}</table>
    <table class="t">${qk?`<tr><td>震度6強以上（30年）</td><td><span class="tag ${qk[1]>=0.2?'warn':'good'}">${(qk[1]*100).toFixed(1)}%</span></td></tr>
      <tr><td>震度6弱以上（30年）</td><td><span class="tag ${qk[0]>=0.5?'warn':'good'}">${(qk[0]*100).toFixed(0)}%</span></td></tr>
      <tr><td>地盤の揺れやすさ</td><td><span class="tag ${qk[2]>=1.6?'warn':'good'}">${qk[2]?qk[2].toFixed(2)+'倍':'—'}</span></td></tr>
      <tr><td>地形（液状化の目安）</td><td><span class="tag ${liqLand(qk[3])===2?'bad':liqLand(qk[3])?'warn':'good'}">${esc(qk[3]||'—')}${liqLand(qk[3])===2?'・しやすい':liqLand(qk[3])?'・ややしやすい':''}</span></td></tr>`:''}
      ${fr?`<tr><td>火災危険度（東京都）</td><td><span class="tag ${fr[1]>=4?'bad':fr[1]>=3?'warn':'good'}">ランク${fr[1]}／5</span></td></tr>
      <tr><td>建物倒壊危険度（東京都）</td><td><span class="tag ${fr[0]>=4?'bad':fr[0]>=3?'warn':'good'}">ランク${fr[0]}／5</span></td></tr>
      <tr><td>総合危険度（東京都）</td><td><span class="tag ${fr[2]>=4?'bad':fr[2]>=3?'warn':'good'}">ランク${fr[2]}／5</span>${fr[4]?`<br><span class="note">${esc(fr[4])}</span>`:''}</td></tr>`:`<tr><td>火災・建物倒壊</td><td><span class="note">${tokyo?'東京都の調査の対象外の場所':'東京都以外は公表データなし'}</span></td></tr>`}</table>
    ${lq?`<table class="t"><tr><td>液状化</td><td><span class="tag ${liqCut(lq)>=6?'bad':liqCut(lq)?'warn':'good'}">${esc(lq[1]||'')}</span></td></tr></table>`:''}
    <div class="note">地震：J-SHIS（30年以内の確率・地盤）。火災・倒壊：東京都の地域危険度（ランク5が最も危険）。内水氾濫（下水があふれる浸水）は含みません。リンク先の重ねるハザードマップで確認してください。</div>`;
}
function popHtml(m){
  if(!m)return'<div class="note">データなし</div>';
  const y=[2020,2025,2030,2035,2040,2045,2050];
  return `<div class="note">${esc(m[0])} ${esc(m[1])}（社人研の推計）</div>`+lineChart(m[2],y.map(String),v=>(v/1e4).toFixed(v>=1e5?0:1)+'万');
}
function linksHtml(lat,lon,code,addr){
  const pref=PREFS.find(x=>x[0]===code.slice(0,2))||PREFS[0];
  const su=bs=>`https://suumo.jp/jj/bukken/ichiran/JJ012FC001/?ar=030&bs=${bs}&ta=${pref[0]}&sc=${code}`;
  const mu=D.muni[code];
  return `<h3>この地域の売り物件をさがす（外部サイト）</h3>
  ${linkGroups(pref[0],code).slice(0,2).map(g=>linkGroupHtml(g)).join('')}
  <div class="note">SUUMOは${mu?esc(mu[1]):'市区町村'}まで、ほかのサイトは${esc(pref[1])}の一覧が開きます。気になる物件は「物件を評価」に住所と価格を入れると評価できます。</div>
  <button class="btn sub sm" style="margin-top:6px" onclick="go('links')">ほかの外部リンクを見る</button>
  <h3>確認用リンク</h3>
  <div class="links">
    <a class="btn sub sm" target="_blank" rel="noopener" href="https://disaportal.gsi.go.jp/maps/?ll=${lat},${lon}&z=16&base=pale&vs=c1j0l0u0t0h0z0">重ねるハザードマップ</a>
    <a class="btn sub sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}">Googleマップ</a>
    <a class="btn sub sm" target="_blank" rel="noopener" href="https://www.reinfolib.mlit.go.jp/">不動産情報ライブラリ（国交省）</a>
    <a class="btn sub sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(addr+' 再開発')}">「再開発」でネット検索</a>
  </div>`;
}
function projList(pj){
  if(!pj.length)return'<div class="note">3km以内に登録されている計画はありません。</div>';
  return `<table class="t">${pj.map(({q,d})=>`<tr><td>${q.type==='st'?'🚉':'🏗'} <b>${esc(q.name)}</b><br><span class="note">${esc(q.note)}</span></td><td style="white-space:nowrap">${(d/1000).toFixed(1)}km<br>${esc(q.year)}<br><span class="tag ${q.status==='事業中'?'good':q.status==='計画'?'':'warn'}">${esc(q.status)}</span></td></tr>`).join('')}</table>`;
}
function renderDetail(m){
  const p=P.find(x=>x.i===S.detail);if(!p){S.detail=null;return render()}
  const fav=LS.get('fav',[]),isFav=fav.includes(p.i),yr=p.y,h=p.h;
  m.innerHTML=`<button class="back" onclick="S.detail=null;go(S.prev)">‹ 戻る</button>
  <div class="card">
    <div class="big"><div class="grade g${p.r.grade}"><b>${p.r.grade}</b><small>${p.r.total}点</small></div>
      <div><div class="t" style="font-weight:700">${esc(p.a)}</div><div class="note">${p.s==='公示'?'地価公示':'都道府県地価調査'}（${yr}年）・${esc(p.cu||'')}・${p.cat}</div>
      <div class="tags">${p.r.tags.map(([t,c])=>`<span class="tag ${c}">${esc(t)}</span>`).join('')}</div></div></div>
    <div class="boxes">
      <div class="box"><small>1㎡あたり</small><b>${unit(p.pr)}</b></div>
      <div class="box"><small>1坪あたり</small><b>${unit(Math.round(p.pr*3.30579))}</b></div>
      <div class="box"><small>前年比</small><b>${p.yo>=0?'+':''}${p.yo}%</b></div>
      <div class="box"><small>この土地（${p.ar}㎡）の総額の目安</small><b>${man(p.pr*p.ar)}</b></div>
    </div>
    <div style="height:10px"></div>
    <button class="btn sub" onclick="togFav(${p.i})">${isFav?'★ 保存済み（タップで外す）':'☆ 保存する'}</button>
  </div>
  <div class="card"><h2>評価の内訳</h2>${scoreHtml(p.r)}</div>
  <div class="card"><h2>地価の推移（1㎡あたり）</h2>${lineChart(h,h.map((_,i)=>i%2===0?String(yr-10+i).slice(2)+'年':''),v=>(v/1e4).toFixed(v>=1e5?0:1)+'万')}</div>
  <div class="card"><h2>災害リスク（水害・土砂・地震・火災）</h2>${hazardTable(p.hz,p.lq,p.qk,p.fr,p.c.startsWith('13'))}</div>
  <div class="card"><h2>新駅・延伸・再開発（3km以内）</h2>${projList(p.f.pj)}</div>
  <div class="card"><h2>将来の人口</h2>${popHtml(p.m)}</div>
  ${newsCard([p.c])}
  <div class="card"><h2>土地の条件</h2><dl class="kv">
    <dt>最寄り駅</dt><dd>${esc(p.sn)}駅 ${p.sd?p.sd.toLocaleString()+'m':''}${p.st?`（${esc(p.st.l)}）`:''}</dd>
    <dt>用途地域</dt><dd>${esc(p.z)}</dd><dt>建ぺい率／容積率</dt><dd>${p.bcr}%／${p.far}%</dd>
    <dt>周辺の様子</dt><dd>${esc(p.e)}</dd><dt>利用状況</dt><dd>${esc(p.u)}・${esc(p.cu)}</dd></dl></div>
  <div class="card">${linksHtml(p.la,p.lo,p.c,p.a)}</div>`;
}
function togFav(i){let f=LS.get('fav',[]);f=f.includes(i)?f.filter(x=>x!==i):[...f,i];LS.set('fav',f);render()}

// ---------- 物件を評価 ----------
function renderEval(m){
  const e=LS.get('evalForm',{kind:'mansion',addr:'',price:'',area:'',barea:'',age:'',rent:'',url:''});
  m.innerHTML=`<div class="card"><h2>気になる物件を評価する</h2>
  <div class="note">アットホームやSUUMOで見つけた物件の住所と価格を入れると、その場所の評価（100点満点）と、相場と比べた割安・割高を出します。</div>
  <label class="f">種類</label>
  <div class="chips">${[['mansion','中古マンション'],['house','一戸建て'],['land','土地']].map(([k,n])=>`<button class="chip ${e.kind===k?'on':''}" onclick="evKind('${k}')">${n}</button>`).join('')}</div>
  <label class="f">住所（番地まで入れると正確です）</label><input type="text" id="e_addr" value="${esc(e.addr)}" placeholder="例：川崎市中原区小杉町3丁目">
  <label class="f">価格（万円）</label><input type="number" inputmode="decimal" id="e_price" value="${esc(e.price)}" placeholder="例：6980">
  <label class="f">${e.kind==='mansion'?'専有面積':'土地面積'}（㎡）</label><input type="number" inputmode="decimal" id="e_area" value="${esc(e.area)}">
  ${e.kind==='house'?`<label class="f">建物面積（㎡）</label><input type="number" inputmode="decimal" id="e_barea" value="${esc(e.barea)}">`:''}
  ${e.kind!=='land'?`<label class="f">築年数（年）</label><input type="number" inputmode="numeric" id="e_age" value="${esc(e.age)}">`:''}
  <label class="f">想定の家賃（月額・万円、分かれば）</label><input type="number" inputmode="decimal" id="e_rent" value="${esc(e.rent)}" placeholder="入れると利回りを計算">
  <label class="f">物件ページのURL（メモ用・任意）</label><input type="url" id="e_url" value="${esc(e.url)}" placeholder="https://www.athome.co.jp/...">
  <div style="height:12px"></div>
  <button class="btn" id="e_go" onclick="doEval()">評価する</button>
  <div id="e_msg" class="note" style="margin-top:8px"></div></div>
  <div id="e_res"></div>
  ${evalSavedHtml()}`;
  if(S.evalRes)showEval(S.evalRes);
}
function readForm(){const g=id=>{const el=$('#'+id);return el?el.value.trim():''};const e=LS.get('evalForm',{kind:'mansion'});
  return {kind:e.kind,addr:g('e_addr'),price:g('e_price'),area:g('e_area'),barea:g('e_barea'),age:g('e_age'),rent:g('e_rent'),url:g('e_url')}}
function evKind(k){const e=readForm();e.kind=k;LS.set('evalForm',e);S.evalRes=null;renderEval($('#main'))}
async function geocode(q){
  const r=await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(q));const j=await r.json();
  if(!j.length)throw new Error('住所が見つかりませんでした。市区町村から入れ直してください。');
  return {lon:j[0].geometry.coordinates[0],lat:j[0].geometry.coordinates[1],title:j[0].properties.title};
}
async function muniCode(lat,lon){
  try{const ac=new AbortController();setTimeout(()=>ac.abort(),5000);const r=await fetch(`https://mreversegeoc.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`,{signal:ac.signal});const j=await r.json();return j.results&&j.results.muniCd}catch(e){return null}
}
// その地点のハザードをタイルから読む（ズーム17、約1m精度）
function tileXY(lat,lon,z){const n=2**z,fx=(lon+180)/360*n,fy=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n;return [Math.floor(fx),Math.floor(fy),Math.floor((fx%1)*256),Math.floor((fy%1)*256)]}
const DEPTH_C=[[[255,255,179],0.3],[[247,245,169],0.5],[[248,225,166],1],[[255,216,192],3],[[255,183,183],5],[[255,145,145],10],[[242,133,201],20],[[220,122,220],30]];
function classify(k,[r,g,b,a]){if(a<128)return 0;if(['debris','slope','slide'].includes(k))return(r<240&&g<100)?2:1;
  let best=DEPTH_C[0],bd=1e9;for(const c of DEPTH_C){const d=(c[0][0]-r)**2+(c[0][1]-g)**2+(c[0][2]-b)**2;if(d<bd){bd=d;best=c}}return best[1]}
const HZL={flood:'01_flood_l2_shinsuishin_data',surge:'03_hightide_l2_shinsuishin_data',tsunami:'04_tsunami_newlegend_data',debris:'05_dosekiryukeikaikuiki',slope:'05_kyukeishakeikaikuiki',slide:'05_jisuberikeikaikuiki'};
function samp(k,lat,lon){return new Promise(res=>{const [x,y,px,py]=tileXY(lat,lon,17),img=new Image();img.crossOrigin='anonymous';
  img.onload=()=>{try{const c=document.createElement('canvas');c.width=c.height=256;const t=c.getContext('2d');t.drawImage(img,0,0);
    const d=t.getImageData(Math.max(0,px-2),Math.max(0,py-2),5,5).data;let v=0;for(let i=0;i<d.length;i+=4)v=Math.max(v,classify(k,[d[i],d[i+1],d[i+2],d[i+3]]));res(v)}catch(e){res(0)}};
  img.onerror=()=>res(0);img.src=`https://disaportaldata.gsi.go.jp/raster/${HZL[k]}/17/${x}/${y}.png`})}
async function hazardAt(lat,lon){const o={};await Promise.all(Object.keys(HZL).map(async k=>{const v=await samp(k,lat,lon);if(v)o[k]=v}));return o}
function nearest(lat,lon,n,pred){return P.filter(pred||(()=>true)).map(p=>[p,distM(lat,lon,p.la,p.lo)]).sort((a,b)=>a[1]-b[1]).slice(0,n)}
async function doEval(){
  const e=readForm();LS.set('evalForm',e);const msg=$('#e_msg');
  if(!e.addr){msg.textContent='住所を入れてください。';return}
  $('#e_go').disabled=true;msg.textContent='住所の位置と、災害の想定を調べています…';
  try{
    const g=await geocode(e.addr);
    const [hz,mc,qk]=await Promise.all([hazardAt(g.lat,g.lon),muniCode(g.lat,g.lon),quakeAt(g.lat,g.lon)]);g.qk=qk;
    const code0=mc&&D.muni[mc]?mc:nearest(g.lat,g.lon,1)[0][0].c;
    msg.textContent='近くで実際に売れた価格を読み込んでいます…';
    await loadTx(code0).catch(()=>null);
    const res=evaluate(e,g,hz,mc);S.evalRes=res;msg.textContent='';showEval(res);
  }catch(err){msg.textContent=err.message||'通信できませんでした。電波の良い所でもう一度試してください。'}
  $('#e_go').disabled=false;
}
function evaluate(e,g,hz,mc){
  const {lat,lon}=g;
  // 最寄り駅
  const st=D.stations.map(s=>[s,distM(lat,lon,s.lat,s.lon)]).sort((a,b)=>a[1]-b[1])[0];
  // 近くの地価地点（住宅地優先）で地価・上昇率
  const res=e.kind==='land'||e.kind==='house';
  const nb=nearest(lat,lon,4,p=>p.cat==='住宅地'||!res);
  let wsum=0,pr=0,g5=0,gw=0,h=Array(11).fill(0),hw=Array(11).fill(0);
  for(const [p,d] of nb){const w=1/Math.max(200,d)**2;wsum+=w;pr+=p.pr*w;if(p.g5!=null){g5+=p.g5*w;gw+=w}p.h.forEach((v,i)=>{if(v&&p.h[10]){h[i]+=v/p.h[10]*w;hw[i]+=w}})}
  const landPrice=pr/wsum,h2=h.map((v,i)=>hw[i]?v/hw[i]*landPrice:0);
  const code=mc&&D.muni[mc]?mc:nb[0][0].c,m=D.muni[code];
  const pj=D.projects.map(q=>({q,d:distM(lat,lon,q.lat,q.lon)})).filter(x=>x.d<3000).sort((a,b)=>a.d-b.d).slice(0,6);
  const f={hz,g5:gw?g5/gw:null,h:h2,pop:m?m[2]:null,muniName:m?m[1]:'',st:st[0],walk:Math.round(st[1]*1.25),pj};
  const lqp=nb[0]&&nb[0][1]<1500?nb[0][0].lq:null;if(lqp)f.lq=lqp;
  f.qk=g.qk||(nb[0]&&nb[0][1]<300?nb[0][0].qk:null);f.tokyo=String(code).startsWith('13');f.fr=f.tokyo?fireAt(lat,lon):null;
  const r=score(f);
  // 割安度
  const price=+e.price*1e4,area=+e.area,barea=+e.barea,age=+e.age;let val=null;
  const MARKET=1.15;// 公示地価→実際の売買価格のおおよその補正（関東・近年）
  const cmp=txCompare(e,lat,lon,code);
  if(price&&area&&cmp&&cmp.est){val={est:cmp.est,ratio:price/cmp.est,how:cmp.how,cmp:cmp.list}}
  else if(price&&area){
    if(e.kind==='land'){const est=landPrice*MARKET*area;val={est,ratio:price/est,how:`近くの地価 ${unit(Math.round(landPrice))}/㎡ ×補正1.15 × ${area}㎡`}}
    else if(e.kind==='house'&&barea){const land=landPrice*MARKET*area,bld=barea*22e4*Math.max(0.1,1-(age||0)/25);
      val={est:land+bld,ratio:price/(land+bld),how:`土地 ${man(land)}（地価×1.15×${area}㎡）＋建物 ${man(bld)}（木造の建て直し費用22万円/㎡を築${age||0}年で目減り）`}}
  }
  return {e,g,hz,f,r,val,code,m,nb,landPrice,price,st:st[0],stD:st[1],date:new Date().toISOString().slice(0,10)};
}
function showEval(x){
  const {e,g,r,val,m,price}=x,box=$('#e_res');if(!box)return;
  let valHtml='';
  if(val){const p=val.ratio,j=p<0.85?['割安','good']:p<=1.15?['相場並み','']:['割高','bad'];
    valHtml=`<div class="boxes"><div class="box"><small>相場から見た目安</small><b>${man(val.est)}</b></div><div class="box"><small>売り出し価格</small><b>${man(price)}</b></div>
    <div class="box"><small>判定</small><b><span class="tag ${j[1]}" style="font-size:15px">${j[0]}</span> ${(p*100).toFixed(0)}%</b></div></div><div class="note">計算：${esc(val.how)}</div>`}
  if(val&&val.cmp&&val.cmp.length)valHtml+=`<h3>比べた売買事例（近い順）</h3>${val.cmp.map(txItemHtml).join('')}`;
  else if(!val&&e.kind==='mansion')valHtml=`<div class="warnbox">${Object.keys(D.txindex||{}).length?(e.age===''?'築年数を入れると、近くで実際に売れたマンションと比べて割安・割高を判定できます。':'この近くで比べられる売買事例が足りないため、判定できませんでした。'):'マンションの割安・割高は、近くで実際に売れたマンションの価格と比べて判定します。国の売買価格データが取り込まれると使えるようになります。'}<br>参考：この場所の土地の値段は約${unit(Math.round(x.landPrice))}/㎡です。</div>`;
  let bld='';if(e.kind!=='land'&&e.age!==''&&e.age!=null){const by=new Date().getFullYear()-(+e.age);bld=by<=1981?`<div class="warnbox" style="margin-top:8px">築${e.age}年（${by}年ごろの建築）は、旧耐震基準（1981年5月以前）の可能性があります。地震での被害が大きくなりやすく、ローンや保険にも影響します。耐震診断・補強の有無を確認してください。</div>`:''}
  let yld='';if(e.rent&&price){const y=e.rent*1e4*12/price*100;yld=`<div class="box"><small>表面利回り（家賃×12÷価格）</small><b>${y.toFixed(2)}%</b></div>`}
  box.innerHTML=`<div class="card">
    <div class="big"><div class="grade g${r.grade}"><b>${r.grade}</b><small>${r.total}点</small></div>
    <div><b>${esc(g.title)}</b><div class="note">${m?esc(m[0]+' '+m[1]):''}・${esc(x.st.n)}駅まで直線${Math.round(x.stD).toLocaleString()}m</div>
    <div class="tags">${r.tags.map(([t,c])=>`<span class="tag ${c}">${esc(t)}</span>`).join('')}</div></div></div>
    ${val||e.kind==='mansion'?'<h3>価格は相場と比べてどうか</h3>'+valHtml:''}
    ${yld?`<div class="boxes">${yld}</div>`:''}${bld}
    <div style="height:10px"></div><button class="btn sub" onclick="saveEval()">☆ この評価を保存</button></div>
  <div class="card"><h2>評価の内訳</h2>${scoreHtml(r)}<div class="note">駅までの距離は直線距離×1.25で見積もっています。</div></div>
  <div class="card"><h2>災害リスク（この住所の位置）</h2>${hazardTable(x.hz,x.f.lq,x.f.qk,x.f.fr,x.f.tokyo)}</div>
  <div class="card"><h2>新駅・延伸・再開発（3km以内）</h2>${projList(x.f.pj)}</div>
  <div class="card"><h2>将来の人口</h2>${popHtml(m)}</div>
  ${newsCard([x.code])}
  <div class="card"><h2>近くの地価地点</h2>${x.nb.map(([p,d])=>itemHtml(p).replace('<div class="item"','<div class="item" data-d="'+Math.round(d)+'"')).join('')}</div>
  <div class="card">${linksHtml(g.lat,g.lon,x.code||x.nb[0][0].c,g.title)}</div>`;
}
function saveEval(){const x=S.evalRes;if(!x)return;const l=LS.get('evals',[]);l.unshift({e:x.e,title:x.g.title,grade:x.r.grade,total:x.r.total,ratio:x.val?x.val.ratio:null,date:x.date});LS.set('evals',l.slice(0,100));renderEval($('#main'))}
function evalSavedHtml(){const l=LS.get('evals',[]);if(!l.length)return'';
  return `<div class="card"><h2>保存した評価</h2>${l.map((v,i)=>`<div class="item" onclick="reEval(${i})"><div class="grade g${v.grade}"><b>${v.grade}</b><small>${v.total}点</small></div>
  <div style="flex:1"><div class="t">${esc(v.title)}</div><div class="m">${({mansion:'中古マンション',house:'一戸建て',land:'土地'})[v.e.kind]}・${v.e.price?Number(v.e.price).toLocaleString()+'万円':''}${v.ratio?`・相場比${(v.ratio*100).toFixed(0)}%`:''}・${v.date}</div>
  ${v.e.url?`<a class="m" href="${esc(v.e.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">物件ページを開く</a>`:''}</div>
  <button class="chip" onclick="event.stopPropagation();delEval(${i})">削除</button></div>`).join('')}</div>`}
function reEval(i){const v=LS.get('evals',[])[i];LS.set('evalForm',v.e);S.evalRes=null;renderEval($('#main'));doEval()}
function delEval(i){const l=LS.get('evals',[]);l.splice(i,1);LS.set('evals',l);renderEval($('#main'))}

// ---------- 保存 ----------
function renderFav(m){
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.remove('on'));
  const f=LS.get('fav',[]),ps=P.filter(p=>f.includes(p.i));
  m.innerHTML=`<h2>保存した地点</h2>${ps.map(itemHtml).join('')||'<div class="card">まだありません。地点の詳しい画面で「☆ 保存する」を押すとここに入ります。</div>'}${evalSavedHtml()}`;
}

// ---------- 情報 ----------
function renderInfo(m){
  m.innerHTML=updatedCard()+newsCard(null,30)+`<div class="card"><h2>評価のしかた（100点満点）</h2>
  <table class="t">
  <tr><th>項目</th><th>点</th><th>見ていること</th></tr>
  <tr><td>水害・土砂</td><td>20</td><td>洪水・高潮・津波の浸水の深さ、土砂災害の警戒区域。深いほど・レッドゾーンほど減点</td></tr>
  <tr><td>地震・火災</td><td>15</td><td>30年以内に震度6強以上の揺れの確率、地盤の揺れやすさ、液状化しやすい地形（J-SHIS）、東京都の火災・建物倒壊危険度ランク</td></tr>
  <tr><td>将来性</td><td>22</td><td>地価の5年の上がり方（15点）＋近くの新駅・延伸・再開発（10点。事業中＞計画＞構想、近いほど高い）</td></tr>
  <tr><td>人口</td><td>18</td><td>市区町村の2035年の人口予測（14点）＋最寄り駅の乗降客数の回復・増加（6点）</td></tr>
  <tr><td>利便性</td><td>17</td><td>駅からの距離（10点）＋駅の乗降客数の多さ（10点）</td></tr>
  <tr><td>値動きの安定</td><td>8</td><td>10年の上がり方（6点）＋途中で下がった幅の小ささ（4点）</td></tr></table>
  <p class="note">S＝78点以上、A＝68〜77、B＝58〜67、C＝48〜57、D＝47以下。</p></div>
  <div class="card"><h2>このアプリでできないこと（大事）</h2>
  <ul class="note" style="font-size:13px">
  <li>アットホーム・SUUMOの物件そのものは載せていません（各サイトの規約で、許可のない転載が禁止されているため）。各地点・評価画面のボタンから、同じ地域の売り物件を開けます。</li>
  <li>${Object.keys(D.txindex||{}).length?'売買事例は国の不動産情報ライブラリの公開データです（住所は町丁まで。番地や物件名は公表されていません）。':'売買事例とマンションの割安判定は、国の売買価格データが取り込まれると使えます。'}</li>
  <li>火災・建物倒壊の危険度は、町丁目ごとに公表している東京都のみ評価に入っています（ほかの県は地震の揺れと地形まで）。</li>
  <li>内水氾濫・建物の状態（耐震・築年）・管理状態は、場所の評価には入っていません。</li>
  <li>新駅・再開発の一覧は調べた時点のもので、開業時期は変わることがあります。最新の動きは上の「最新ニュース」で確認できます（毎週自動更新）。</li>
  <li>この評価は目安です。購入前には、現地・重要事項説明・ハザードマップを必ず確認してください。</li></ul></div>
  <div class="card"><h2>新駅・延伸・再開発の一覧（${D.projects.length}件）</h2>${projList(D.projects.map(q=>({q,d:0}))).replace(/<td style="white-space:nowrap">0\.0km<br>/g,'<td style="white-space:nowrap">')}</div>
  <div class="card"><h2>出典</h2><dl class="kv">${Object.entries(D.sources).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  <p class="note">データ作成日：${esc(D.built)}</p></div>
  <div class="card"><h2>記録のリセット</h2><button class="btn sub" onclick="if(confirm('保存した地点・評価・検索条件をすべて消しますか？')){['fav','evals','filter','evalForm'].forEach(k=>localStorage.removeItem('shisan-'+k));location.reload()}">保存した内容をすべて消す</button></div>
  <div class="ver">資産価値ナビ 関東 ${VER}<br><span id="offline">オフライン利用：確認中</span></div>`;
  offlineStatus();
}
function offlineStatus(){const el=$('#offline');if(!el)return;if(!('serviceWorker' in navigator)){el.textContent='オフライン利用：このブラウザは非対応';return}
  navigator.serviceWorker.ready.then(()=>caches.keys()).then(k=>{el.textContent=k.length?'オフライン利用：準備OK':'オフライン利用：準備中'}).catch(()=>{})}

// ---------- 起動 ----------
async function boot(){
  try{const r=await fetch('data.json');D=await r.json()}catch(e){$('#main').innerHTML='<div class="card">データを読み込めませんでした。電波の良い所で開き直してください。</div>';return}
  prep();TX.init();
  const h=new URLSearchParams(location.hash.slice(1));
  if(h.get('d')){S.prev='list';S.detail=+h.get('d')}else if(h.get('t'))S.tab=h.get('t');
  if(h.get('tx')){TX.mode='tx';FT.munis=h.get('tx').split(',');FT.prefs=[...new Set(FT.munis.map(c=>c.slice(0,2)))];if(h.get('types'))FT.types=h.get('types').split(',');
    Promise.all(FT.munis.map(loadTx)).then(()=>{TX.res=null;if(h.get('k'))showTx(FT.munis[0],+h.get('k'));else go(h.get('t')||'list')})}
  if(h.get('addr')){S.tab='eval';LS.set('evalForm',{kind:h.get('kind')||'mansion',addr:h.get('addr'),price:h.get('price')||'',area:h.get('area')||'',barea:h.get('barea')||'',age:h.get('age')||'',rent:h.get('rent')||'',url:''});setTimeout(doEval,50)}
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===S.tab));
  render();
}
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js');let r=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!r){r=true;location.reload()}})}
boot();

// ---------- 外部リンク ----------
function linkGroups(pc,code){
  const p=PREFS.find(x=>x[0]===pc)||PREFS[0],sl=p[2],sc=code?`&sc=${code}`:'';
  const su=bs=>`https://suumo.jp/jj/bukken/ichiran/JJ012FC001/?ar=030&bs=${bs}&ta=${pc}${sc}`;
  return [
    {h:'売り物件（中古マンション・戸建て・土地）',l:[
      ['SUUMO 中古マンション',su('011')],['SUUMO 中古一戸建て',su('021')],['SUUMO 土地',su('030')],
      ['アットホーム 中古マンション',`https://www.athome.co.jp/mansion/chuko/${sl}/list/`],['アットホーム 中古一戸建て',`https://www.athome.co.jp/kodate/chuko/${sl}/list/`],['アットホーム 土地',`https://www.athome.co.jp/tochi/${sl}/list/`],
      ["LIFULL HOME'S 中古マンション",`https://www.homes.co.jp/mansion/chuko/${sl}/list/`],["LIFULL HOME'S 中古一戸建て",`https://www.homes.co.jp/kodate/chuko/${sl}/list/`],["LIFULL HOME'S 土地",`https://www.homes.co.jp/tochi/${sl}/list/`],
      ['Yahoo!不動産 中古マンション',`https://realestate.yahoo.co.jp/used/mansion/search/03/${pc}/`],['不動産ジャパン',`https://www.fudousan.or.jp/`]]},
    {h:'投資用（収益物件）',l:[
      ['楽待 収益物件',`https://www.rakumachi.jp/syuuekibukken/area/prefecture/dimAll/?pref=${+pc}`],['健美家 収益物件',`https://www.kenbiya.com/pp0/s/${sl}/`]]},
    {h:'大手の仲介会社',l:[
      ['三井のリハウス','https://www.rehouse.co.jp/'],['東急リバブル','https://www.livable.co.jp/'],['住友不動産販売','https://www.stepon.co.jp/'],['ノムコム（野村の仲介）','https://www.nomu.com/']]},
    {h:'相場・成約価格を調べる',l:[
      ['不動産情報ライブラリ（国交省）','https://www.reinfolib.mlit.go.jp/'],['レインズ（成約価格の公開）','https://www.reins.or.jp/'],['全国地価マップ','https://www.chikamap.jp/']]},
    {h:'地図・災害',l:[
      ['重ねるハザードマップ','https://disaportal.gsi.go.jp/'],['地理院地図','https://maps.gsi.go.jp/'],['Googleマップ','https://www.google.com/maps/']]},
  ];
}
function linkGroupHtml(g){return `<h3>${esc(g.h)}</h3><div class="links">${g.l.map(([n,u])=>`<a class="btn sub sm" target="_blank" rel="noopener" href="${esc(u)}">${esc(n)} ↗</a>`).join('')}</div>`}
function renderLinks(m){
  const pc=LS.get('linkPref','13');
  m.innerHTML=`<div class="card"><h2>外部リンク</h2>
  <div class="note">物件サイトや調べもの用のサイトに、すぐ移動できます。都県を選ぶと、その地域の一覧が開きます。</div>
  <label class="f">都県</label>
  <div class="chips">${PREFS.map(([c,n])=>`<button class="chip ${pc===c?'on':''}" onclick="LS.set('linkPref','${c}');renderLinks($('#main'))">${n}</button>`).join('')}</div>
  ${linkGroups(pc,'').map(linkGroupHtml).join('')}
  <div class="note" style="margin-top:10px">気になる物件を見つけたら、住所と価格を「物件を評価」に入れると、災害・将来性・相場との比較が出ます。</div></div>`;
}

// ---------- 地震（J-SHIS）・火災（東京都）をその場で調べる ----------
async function quakeAt(lat,lon){
  try{
    const get=async p=>{const ac=new AbortController();setTimeout(()=>ac.abort(),8000);const r=await fetch(`https://www.j-shis.bosai.go.jp/map/api/${p}/meshinfo.geojson?position=${lon},${lat}&epsg=4326`,{signal:ac.signal});return (await r.json()).features[0].properties};
    const [a,b]=await Promise.all([get('pshm/Y2024/AVR/TTL_MTTL'),get('sstrct/V4')]);
    return [+a.T30_I55_PS||0,+a.T30_I60_PS||0,+b.ARV||null,b.JNAME||''];
  }catch(e){return null}
}
function fireAt(lat,lon){
  let best=null,bd=800;for(const f of D.fire||[]){const d=distM(lat,lon,f[1],f[2]);if(d<bd){bd=d;best=f}}
  return best?[best[3],best[4],best[5],0,best[0]]:null;
}
