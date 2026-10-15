// ホーム：iPhoneだけで完結（SUUMOで探す → 物件の文章を貼って評価 → 気になる物件リスト）
const HDEF={t:'m',pref:'13',code:'',kb:'',kt:'',mb:'',mt:'',et:0,cn:0};
let FH=Object.assign({},HDEF,LS.get('homefilter',{}));
const BSH={m:'011',h:'021',l:'030'};
function suumoSearchUrl(){
  const p=[['ar','030'],['bs',BSH[FH.t]],['ta',FH.pref]];if(FH.code)p.push(['sc',FH.code]);
  if(FH.kb)p.push(['kb',FH.kb]);if(FH.kt)p.push(['kt',FH.kt]);
  if(FH.t==='m'){if(FH.mb)p.push(['mb',FH.mb]);if(FH.mt)p.push(['mt',FH.mt])}
  if(FH.et)p.push(['et',FH.et]);if(FH.cn&&FH.t!=='l')p.push(['cn',FH.cn]);
  return 'https://suumo.jp/jj/bukken/ichiran/JJ012FC001/?'+p.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
}
function renderHome(m){
  const munis=Object.entries(D.muni).filter(([c])=>c.slice(0,2)===FH.pref&&P.some(p=>p.c===c)).sort((a,b)=>a[0].localeCompare(b[0]));
  m.innerHTML=`
  <div class="card" style="border:2px solid var(--acc)"><h2>物件を評価</h2>
    <div class="note">SUUMOなどの物件ページで、価格・所在地・面積などが書かれた部分を長押しで選んでコピーし、ここに貼って「評価」を押してください。URLも一緒に貼ると、あとで物件ページに戻れます。</div>
    <textarea id="h_text" rows="5" style="width:100%;margin-top:8px;font:inherit;font-size:15px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)" placeholder="ここに貼る"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn sub" onclick="homePaste()">貼り付け</button><button class="btn" onclick="homeEval()">評価</button></div>
    <div id="h_fix"></div><div id="e_parse" class="note" style="margin-top:6px"></div>
  </div>
  <div id="e_res"></div>
  <div class="card"><h2>SUUMOで探す</h2>
    <label class="f">種類</label><div class="chips">${[['m','中古マンション'],['h','中古一戸建て'],['l','土地']].map(([k,n])=>`<button class="chip ${FH.t===k?'on':''}" onclick="FH.t='${k}';renderHome($('#main'))">${n}</button>`).join('')}</div>
    <label class="f">都県</label><div class="chips">${PREFS.map(([c,n])=>`<button class="chip ${FH.pref===c?'on':''}" onclick="FH.pref='${c}';FH.code='';renderHome($('#main'))">${n}</button>`).join('')}</div>
    <label class="f">市区町村</label><select id="h_code"><option value="">${esc((PREFS.find(x=>x[0]===FH.pref)||[])[1]||'')}全体</option>${munis.map(([c,v])=>`<option value="${c}" ${FH.code===c?'selected':''}>${esc(v[1])}</option>`).join('')}</select>
    <label class="f">価格</label>${rangeSel('h_kb','h_kt',[500,1000,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500,7000,7500,8000,9000,10000,12000,15000,20000],FH.kb,FH.kt,manFmt)}
    ${FH.t==='m'?`<label class="f">専有面積</label>${rangeSel('h_mb','h_mt',[20,30,40,50,60,70,80,90,100,120],FH.mb,FH.mt,v=>v+'㎡')}`:''}
    <label class="f">駅からの徒歩</label><div class="chips">${[[0,'指定なし'],[3,'3分以内'],[5,'5分以内'],[7,'7分以内'],[10,'10分以内'],[15,'15分以内']].map(([k,n])=>`<button class="chip ${FH.et==k?'on':''}" onclick="FH.et=${k};renderHome($('#main'))">${n}</button>`).join('')}</div>
    ${FH.t!=='l'?`<label class="f">築年数</label><div class="chips">${[[0,'指定なし'],[5,'5年以内'],[10,'10年以内'],[15,'15年以内'],[20,'20年以内'],[30,'30年以内']].map(([k,n])=>`<button class="chip ${FH.cn==k?'on':''}" onclick="FH.cn=${k};renderHome($('#main'))">${n}</button>`).join('')}</div>`:''}
    <div style="height:12px"></div><a class="btn" id="h_go" href="${esc(suumoSearchUrl())}" target="_blank" rel="noopener" onclick="LS.set('homefilter',FH)">この条件でSUUMOを開く ↗</a>
    <div class="note" style="margin-top:6px">気になる物件があったら、その物件ページの文章をコピーして、上の「物件を評価」に貼ってください。</div>
  </div>
  ${evalSavedHtml()||''}`;
  const upd=()=>{LS.set('homefilter',FH);$('#h_go').href=suumoSearchUrl()};
  $('#h_code').onchange=e=>{FH.code=e.target.value;upd()};
  for(const k of ['kb','kt','mb','mt']){const el=$('#h_'+k);if(el)el.onchange=e=>{FH[k]=e.target.value;upd()}}
  if(S.evalRes)showEval(S.evalRes);
}
async function homePaste(){try{const t=await navigator.clipboard.readText();if(t){const el=$('#h_text');el.value=(el.value?el.value+'\n':'')+t}}catch(e){$('#e_parse').textContent='欄を長押しして「ペースト」を選んでください。'}}
// 貼られた文章を読み取って評価。足りない項目だけ入力欄を出す
async function homeEval(extra){
  const text=$('#h_text').value,url=cleanUrl(text),o=Object.assign(parseListing(text,url),extra||{}),msg=$('#e_parse');
  const e={kind:o.kind||'mansion',addr:o.addr||'',price:o.price||'',area:o.area||'',barea:o.barea||'',age:o.age||'',rent:'',url,stn:o.stn||'',walk:o.walk||'',plan:o.plan||''};
  const miss=[['addr','所在地（例：川崎市中原区小杉町3丁目）','text'],['price','価格（万円）','number'],['area',e.kind==='mansion'?'専有面積（㎡）':'土地面積（㎡）','number']].filter(([k])=>!e[k]);
  if(e.kind!=='land'&&e.age==='')miss.push(['age','築年数（年）','number']);
  if(miss.length){
    $('#h_fix').innerHTML=`<div class="warnbox" style="margin-top:8px">読み取れなかった項目を入れてください。${miss.map(([k,n,t])=>`<label class="f">${n}</label><input type="${t}" ${t==='number'?'inputmode="decimal"':''} id="hf_${k}">`).join('')}
      <div style="height:8px"></div><button class="btn" onclick="homeFix()">評価</button></div>`;
    msg.textContent='';return;
  }
  $('#h_fix').innerHTML='';runEval(e);
}
async function runEval(e){
  const msg=$('#e_parse');LS.set('evalForm',e);
  if(msg)msg.textContent='位置・災害・地震・相場を調べています…';
  try{
    const g=await geocode(e.addr);
    const [hz,mc,qk]=await Promise.all([hazardAt(g.lat,g.lon),muniCode(g.lat,g.lon),quakeAt(g.lat,g.lon)]);g.qk=qk;
    const code0=mc&&D.muni[mc]?mc:nearest(g.lat,g.lon,1)[0][0].c;
    await loadTx(code0).catch(()=>null);
    S.evalRes=evaluate(e,g,hz,mc);if(msg)msg.textContent='';showEval(S.evalRes);
    $('#e_res').scrollIntoView({behavior:'smooth'});
  }catch(err){if(msg)msg.textContent=err.message||'通信できませんでした。電波の良い所でもう一度試してください。'}
}
function homeFix(){const x={};for(const k of ['addr','price','area','age']){const el=$('#hf_'+k);if(el&&el.value.trim())x[k]=el.value.trim()}homeEval(x)}
