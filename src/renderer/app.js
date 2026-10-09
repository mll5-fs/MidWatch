let S={players:[],ouatPlayers:[],ouat:{},favorites:[],hasKey:false,leaguePath:"",proCacheAt:0};
let view="OUAT",liveOnly=false,busy=false,ouatDivision="ALL",liveState={},rankState={},rankMeta={},rankBusy=false,rankCooldownAt=0,rankFollowup=null,drawerRequest=0;
const $=q=>document.querySelector(q);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let patchRequest=0,patchPlayerId="",patchStats=null,patchError="",patchLoading=false;

function rankClass(r={}){return String(r.tier||"unranked").toLowerCase()}function rankLabel(r={}){const tier=String(r.tier||"").toUpperCase();if(!tier)return"";return `${tier}${r.rank&&r.rank!=="I"?" "+r.rank:""} · ${r.leaguePoints??r.lp??0} LP`}
function playerRankLabel(p={}){const label=rankLabel(p.bestRank);if(!label)return"";if(p.rankStatus==="error")return label+" · À REVÉRIFIER";return label+(p.rankStatus==="partial"?" · PARTIEL":"")}
function rankScore(p){const o={CHALLENGER:10,GRANDMASTER:9,MASTER:8,DIAMOND:7,EMERALD:6,PLATINUM:5,GOLD:4,SILVER:3,BRONZE:2,IRON:1};const r=p.bestRank||{};return(o[String(r.tier||"").toUpperCase()]||0)*100000+(+r.leaguePoints||+r.lp||0)}
function applyLive(list){return(list||[]).map(original=>{const p={...original,...rankMeta[original.id]};const x=liveState[p.id]===undefined?p:{...p,live:liveState[p.id]};return rankState[p.id]===undefined?x:{...x,bestRank:rankState[p.id]||{}}})}function allPlayers(){return applyLive(S.ouatPlayers)}
function rankPlaceholder(p){
  if(!p.accounts?.[0]?.gameName||!p.accounts?.[0]?.tagLine)return"COMPTE NON RELIÉ";
  if(p.rankStatus==="unranked")return"NON CLASSÉ SOLOQ";
  if(p.rankStatus==="error")return"RANG INDISPONIBLE";
  return S.hasKey?"RANG À CHARGER":"CLÉ RIOT REQUISE";
}
function tracked(p){return p.source==="DPM public data"||p.source==="live"||p.live===true}
function stateOf(p){if(p.live===true)return"live";return tracked(p)?"offline":"unknown"}
function dpmUrl(p){const a=(p.accounts||[])[0];if(p.region==="OUAT"){if(a?.gameName&&a?.tagLine)return`https://dpm.lol/${encodeURIComponent(a.gameName)}-${encodeURIComponent(a.tagLine)}`;return"https://dpm.lol/"}return`https://dpm.lol/pro/${encodeURIComponent(p.name)}`}

function setView(next){patchRequest++;patchLoading=false;view=next;liveOnly=false;$("#qTop").value="";renderNav();render();refreshRanks()}
function renderNav(){
  const live=allPlayers().filter(p=>p.live===true).length;
  $("#liveNavCount").textContent=live;
  $("#favCount").textContent=S.favorites.length;
  $("#ouatCount").textContent=S.ouatPlayers.length||"—";
  $("#overviewNav").classList.toggle("on",view==="OVERVIEW");
  $("#liveNav").classList.toggle("on",view==="LIVE");
  $("#favNav").classList.toggle("on",view==="FAV");
  $("#ouatNav").classList.toggle("on",view==="OUAT");
  $("#patchNav").classList.toggle("on",view==="PATCHES");
}

function queryMatch(p,q){return`${p.name} ${p.team} ${p.division||""} ${p.group||""} ${(p.accounts||[]).map(a=>`${a.gameName||""}#${a.tagLine||""}`).join(" ")}`.toLowerCase().includes(q)}
function baseForView(){
  if(view==="OUAT"){const x=applyLive(S.ouatPlayers);return ouatDivision==="ALL"?x:x.filter(p=>String(p.division||"Sans division")===ouatDivision);}
  if(view==="LIVE")return allPlayers().filter(p=>p.live===true);
  if(view==="FAV")return allPlayers().filter(p=>S.favorites.includes(p.id));
  return applyLive(S.ouatPlayers);
}
function listForView(){
  let a=[...baseForView()];
  const q=$("#qTop").value.trim().toLowerCase();
  if(q){const scope=view==="OVERVIEW"?allPlayers():baseForView();a=scope.filter(p=>queryMatch(p,q));}
  if(liveOnly)a=a.filter(p=>p.live===true);
  const sort=$("#sort").value;
  if(sort==="rank")a.sort((x,y)=>rankScore(y)-rankScore(x));
  else a.sort((x,y)=>String(x[sort]||"").localeCompare(String(y[sort]||""))||x.name.localeCompare(y.name));
  return a;
}

function avatar(p,cls="avatar"){const pic=p.avatar||"";const initials=String(p.name||"?").slice(0,2).toUpperCase();return`<div class="${cls}">${pic?`<img src="${esc(pic)}" alt="">`:esc(initials)}</div>`}
function card(p){
  const state=stateOf(p),rank=playerRankLabel(p),fav=S.favorites.includes(p.id);
  const status=state==="live"?"● EN GAME":state==="offline"?"○ HORS LIGNE":p.accounts?.length?"◌ COMPTE LIÉ":"◌ NON SUIVI";
  return`<article class="player-card ${state}" data-id="${esc(p.id)}">
    <div class="card-top"><span class="card-scope">${esc(p.region)}${p.division?" · "+esc(p.division):""}</span><button class="star-btn ${fav?"on":""}" data-star="${esc(p.id)}">★</button></div>
    <div class="player-main">${avatar(p)}<div><div class="player-name-line"><div class="player-name">${esc(p.name)}</div>${rank?`<span class="elo-badge ${rankClass(p.bestRank)}">${esc(rank)}</span>`:`<span class="elo-badge unranked">${esc(rankPlaceholder(p))}</span>`}</div><div class="player-team">${esc(p.team)}</div></div></div>
    <div class="card-bottom"><span class="tag ${state}">${status}</span>${rank?`<span class="tag rank">${esc(rank)}</span>`:""}${p.accounts?.[0]?.tagLine?`<span class="tag">#${esc(p.accounts[0].tagLine)}</span>`:""}</div>
    <span class="status-light ${state}"></span>
  </article>`;
}
function bindCards(){
  document.querySelectorAll(".player-card").forEach(c=>c.onclick=e=>{if(e.target.closest("[data-star]"))return;openPlayer(c.dataset.id)});
  document.querySelectorAll("[data-star]").forEach(b=>b.onclick=async e=>{e.stopPropagation();S.favorites=await window.mw.favorite(b.dataset.star);renderNav();render()});
}
function ouatBrowser(players){
 const rows=[...players].sort((a,b)=>rankScore(b)-rankScore(a)||String(a.team||"").localeCompare(String(b.team||"")));
 return `<section class="scout-board"><div class="scout-board-head"><span>JOUEUR</span><span>ÉQUIPE</span><span>DIVISION</span><span>SOLOQ</span><span>RIOT ID</span><span>STATUT</span></div>
 ${rows.map((p,i)=>{const a=(p.accounts||[])[0],state=stateOf(p),rank=playerRankLabel(p);return`<button class="scout-row" data-id="${esc(p.id)}"><span class="scout-player"><em>${String(i+1).padStart(2,"0")}</em>${avatar(p,"ouat-avatar")}<strong>${esc(p.name)}</strong></span><span class="scout-team">${esc(p.team||"—")}</span><span><i>${esc(p.division||"—")}</i></span><span>${rank?`<b class="elo-badge ${rankClass(p.bestRank)}">${esc(rank)}</b>`:`<b class="elo-badge unranked">${esc(rankPlaceholder(p))}</b>`}</span><span class="scout-riot">${a?.gameName?`${esc(a.gameName)}#${esc(a.tagLine||"")}`:"Non relié"}</span><span class="scout-status ${state}">${state==="live"?"● EN GAME":a?.gameName?"● SUIVI":"○ INCOMPLET"}</span></button>`}).join("")}</section>`;
}

function hero(){
  const live=allPlayers().filter(p=>p.live===true);
  if(view==="OUAT"&&!$("#qTop").value){
    const divisions=["ALL",...new Set(S.ouatPlayers.map(p=>String(p.division||"Sans division")).filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})))];
    const teams=new Set((ouatDivision==="ALL"?S.ouatPlayers:S.ouatPlayers.filter(p=>String(p.division||"Sans division")===ouatDivision)).map(p=>p.team)).size;
    const ranked=S.ouatPlayers.filter(p=>rankScore(p)>0).length,masters=S.ouatPlayers.filter(p=>rankScore(p)>=800000).length,live=S.ouatPlayers.filter(p=>p.live===true).length;$("#hero").innerHTML=`<div class="scouting-hero"><div class="scouting-intro"><div class="panel-kicker">OUATVENTURE · SCOUTING DATABASE</div><h2>Repère les mids qui sortent du lot.</h2><p>Classement SoloQ, champion pool, forme récente et rapports de jeu réunis dans une seule base.</p></div><div class="scouting-kpis"><div><strong>${S.ouatPlayers.length}</strong><span>MIDS</span></div><div><strong>${ranked}</strong><span>CLASSÉS</span></div><div><strong>${masters}</strong><span>MASTER+</span></div><div><strong>${live}</strong><span>LIVE</span></div></div><div class="division-strip">${divisions.map(d=>`<button data-division="${esc(d)}" class="${ouatDivision===d?"on":""}">${d==="ALL"?"Toutes divisions":esc(d)}</button>`).join("")}</div></div>`;
    document.querySelectorAll("[data-division]").forEach(b=>b.onclick=()=>{ouatDivision=b.dataset.division;render()});
    return;
  }
  const ouatLive=applyLive(S.ouatPlayers).filter(p=>p.live===true).length;
  const followed=S.favorites.length;
  if(view==="OVERVIEW"&&!$("#qTop").value){
    const chips=live.slice(0,8).map(p=>`<div class="live-chip" data-id="${esc(p.id)}">${avatar(p,"live-chip-avatar")}<div><b>${esc(p.name)}</b><span>${esc(p.team)} · ${esc(p.region)}</span></div></div>`).join("");
    $("#hero").innerHTML=`<div class="overview-grid"><div class="live-panel"><div class="panel-kicker"><span class="pulse-dot"></span> LIVE NOW</div><div class="live-panel-head"><h2>${live.length?live.length+" midlaner"+(live.length>1?"s":"")+" en game":"Aucun midlaner en game"}</h2><p>Actualisation automatique toutes les 2 min</p></div><div class="live-rail">${chips||'<div class="live-empty">Rien à spectate pour le moment. Tu peux garder MidPulse ouvert en arrière-plan.</div>'}</div></div><div class="insight-panel"><div class="metric live"><strong>${live.length}</strong><span>LIVE</span></div><div class="metric accent"><strong>${followed}</strong><span>FAVORIS</span></div><div class="metric"><strong>${S.ouatPlayers.length}</strong><span>OUAT</span></div></div></div>`;
    document.querySelectorAll(".live-chip").forEach(x=>x.onclick=()=>openPlayer(x.dataset.id));
  }else{
    const base=baseForView(),known=base.filter(tracked).length,liveCount=base.filter(p=>p.live===true).length;
    $("#hero").innerHTML=`<div class="hero-simple"><div class="stat-pill"><b>${liveCount}</b><span>EN GAME</span></div><div class="stat-pill"><b>${base.length}</b><span>JOUEURS</span></div><div class="stat-pill"><b>${known}</b><span>SUIVIS EN LIVE</span></div></div>`;
  }
}

function titles(){
  const q=$("#qTop").value.trim();
  if(q)return["RECHERCHE",`Résultats pour “${q}”`,"Joueurs, équipes et Riot IDs"];
  if(view==="OVERVIEW")return["SCOUTING DESK","Dashboard","Analyse, compare et surveille les midlaners OUAT."];
  if(view==="LIVE")return["LIVE","En direct","Tous les midlaners actuellement détectés en partie."];
  if(view==="FAV")return["LIBRARY","Favoris","Les joueurs que tu veux garder sous les yeux."];
  if(view==="OUAT")return["OUAT SCOUTING",`OUATventure ${S.ouat.season||""}`,`Base scouting · ${S.ouatPlayers.length} midlaners · ${S.ouat.teams||0} équipes`];
  if(view==="PATCHES")return["PATCHS","Analyse de patchs","Notes officielles Riot et performances SoloQ des joueurs OUAT par version."];
  return["OUAT SCOUTING","OUATventure","Scouting des midlaners OUAT"];
}
function renderPatchSection(){
  $("#sort").hidden=true;$("#liveOnly").hidden=true;
  $("#hero").innerHTML=`<div class="panel"><div class="panel-title">NOTES OFFICIELLES RIOT</div><p>Consulte les changements de champions, objets et systèmes dans les notes officielles, puis compare les résultats observés du joueur entre les patchs.</p><button id="riotPatchNotes" class="action">Ouvrir les notes de patch Riot</button><p class="sample-note">Les différences de résultats ne prouvent pas qu’un buff ou un nerf en est la cause. Les données ci-dessous sont limitées aux parties SoloQ mid disponibles du compte sélectionné.</p></div>`;
  $("#riotPatchNotes").onclick=()=>window.mw.open("https://www.leagueoflegends.com/fr-fr/news/tags/patch-notes/");
  const players=allPlayers().filter(p=>p.accounts?.[0]?.gameName&&p.accounts?.[0]?.tagLine).filter(p=>queryMatch(p,$("#qTop").value.trim().toLowerCase()));
  $("#sectionTitle").textContent="PERFORMANCES OUAT PAR PATCH";$("#summary").textContent=`${players.length} joueurs avec un compte relié`;
  if(!players.some(p=>p.id===patchPlayerId)){patchRequest++;patchLoading=false;patchPlayerId=players[0]?.id||"";patchStats=null;patchError="";}
  if(!players.length){$("#grid").innerHTML='<div class="panel" style="grid-column:1/-1"><p>Aucun joueur OUAT avec un compte relié ne correspond à la recherche.</p></div>';return;}
  $("#grid").innerHTML=`<div class="panel" style="grid-column:1/-1"><label for="patchPlayer">Joueur OUAT</label><select id="patchPlayer" class="fullinput">${players.map(p=>`<option value="${esc(p.id)}" ${p.id===patchPlayerId?"selected":""}>${esc(p.name)} · ${esc(p.team)} · ${esc(p.accounts[0].gameName)}#${esc(p.accounts[0].tagLine)}</option>`).join("")}</select><button id="analyzePatch" class="action primary" ${patchLoading||!S.hasKey||!players.length?"disabled":""}>${patchLoading?"Analyse en cours…":"Analyser les patchs"}</button><div id="patchResults">${!S.hasKey?'<p>Configure une clé Riot valide dans Réglages.</p>':patchError?`<p>${esc(patchError)}</p>`:patchStats?coverageReport(patchStats.coverage)+sampleWindowReport(patchStats.window)+patchReport(patchStats.patches)+(!patchStats.patches?.length?'<p>Aucune partie mid avec un patch exploitable dans l’historique disponible.</p>':""):"<p>Sélectionne un joueur puis lance l’analyse. Les groupes affichent le nombre de parties, le winrate avec IC95 et le KDA.</p>"}</div></div>`;
  $("#patchPlayer").onchange=()=>{patchRequest++;patchLoading=false;patchPlayerId=$("#patchPlayer").value;patchStats=null;patchError="";render()};
  $("#analyzePatch").onclick=async()=>{const player=allPlayers().find(p=>p.id===patchPlayerId);if(!player||!S.hasKey||patchLoading)return;const request=++patchRequest;patchLoading=true;patchError="";render();try{const stats=await window.mw.patchStats(player.accounts[0]);if(request!==patchRequest||view!=="PATCHES")return;patchStats=stats;}catch(e){if(request!==patchRequest||view!=="PATCHES")return;patchError=String(e.message||e);}finally{if(request===patchRequest&&view==="PATCHES"){patchLoading=false;render()}}};
}

function render(){
  const [ey,title,sub]=titles();$("#eyebrow").textContent=ey;$("#title").textContent=title;$("#sub").textContent=sub;
  if(view==="PATCHES"){renderPatchSection();status();return}
  $("#sort").hidden=false;$("#liveOnly").hidden=false;
  hero();
  const list=listForView(),q=$("#qTop").value.trim();
  $("#sectionTitle").textContent=q?"Résultats":view==="OVERVIEW"?"Scouting OUAT":view==="LIVE"?"Live maintenant":view==="FAV"?"Ma watchlist":view==="OUAT"?"Scouting board OUAT":"Joueurs";
  $("#summary").textContent=`${list.length} résultat${list.length>1?"s":""}`;
  $("#liveOnly").classList.toggle("on",liveOnly);
  $("#grid").innerHTML=list.length?(view==="OUAT"&&!q?ouatBrowser(list):list.map(card).join("")):`<div class="empty">${q?"Aucun résultat pour cette recherche.":view==="LIVE"?"Aucun midlaner détecté en partie actuellement.":"Aucun joueur dans cette vue."}</div>`;
  bindCards();document.querySelectorAll(".ouat-player-row,.scout-row").forEach(r=>r.onclick=()=>openPlayer(r.dataset.id));status();
}
function status(){
  $("#apiDot").classList.toggle("ok",S.hasKey);
  $("#apiText").textContent=!S.hasKey?"Riot API à configurer":Date.now()<rankCooldownAt?"Riot API limitée · reprise auto":"Riot API connectée";
}
function notice(t=""){const n=$("#notice");n.textContent=t;n.classList.toggle("hidden",!t)}
function closeDrawer(){drawerRequest++;$("#drawer").classList.add("hidden");$("#shade").classList.add("hidden")}
function findPlayer(id){return allPlayers().find(p=>p.id===id)}
function normalizeProfile(p,d){
  if(!d)return p;const ep=d.esportPlayer||{},accounts=(d.players||[]).map(x=>({gameName:x.gameName||"",tagLine:x.tagLine||"",platform:String(x.platform||"").toUpperCase(),puuid:x.puuid||"",rank:(x.ranks||[]).find(r=>r.queue==="RANKED_SOLO_5x5")||{},isLive:!!x.isLive}));
  for(const a of p.accounts||[]){const f=accounts.find(x=>x.gameName.toLowerCase()===String(a.gameName||"").toLowerCase()&&x.tagLine.toLowerCase()===String(a.tagLine||"").toLowerCase());if(f)Object.assign(f,a);else accounts.push(a)}
  return{...p,country:ep.country||p.country,age:ep.age,lastChampions:d.lastChampions||[],accounts,profile:{...(p.profile||{}),league:p.region,team:p.team,role:"MID"}};
}
async function openPlayer(id){
  let p=findPlayer(id);if(!p)return;
  const request=++drawerRequest;
  $("#shade").classList.remove("hidden");$("#drawer").classList.remove("hidden");
  $("#drawer").innerHTML=`<div class="drawer-header"><div><div class="drawer-kicker">${esc(p.region)} · MID</div><h2>${esc(p.name)}</h2><div class="drawer-team">${esc(p.team)}</div></div><button class="drawer-close">✕</button></div><div class="panel"><span class="spinner">↻</span> Chargement…</div>`;
  $(".drawer-close").onclick=closeDrawer;

  if(request!==drawerRequest)return;
  drawPlayer(p);
  if(p.accounts?.[0]&&S.hasKey){
    try{
      const stats=await window.mw.stats(p.accounts[0]);if(request!==drawerRequest)return;
      const anchor=$("#scout-live");if(anchor)anchor.innerHTML=statReport(stats)+championLaneReport(stats.championLanes)+championTransitionReport(stats.championTransitions)+opponentLaneReport(stats.opponentLanes)+opponentTransitionReport(stats.opponentTransitions)+matchupReport(stats.matchups)+patchReport(stats.patches);
    }catch(e){
      if(request!==drawerRequest)return;const anchor=$("#scout-live");
      if(anchor)anchor.innerHTML=`<div class="panel"><div class="panel-title">PERFORMANCE RÉCENTE</div><p class="helper">${esc(String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,""))}</p></div>`;
    }
  }
}
function patchReport(patches=[]){
  if(!patches.length)return"";
  const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="panel"><div class="panel-title">PERFORMANCE PAR PATCH</div><div class="champions">${patches.map(p=>{const pool=(p.champions||[]).map(c=>`${esc(c.name)} ${esc(c.games)}G`).join(" · "),c=p.comparison;return`<span class="champ"><b>PATCH ${esc(p.patch)}</b> · ${esc(p.games)}G · ${esc(p.winrate)}% WR${confidenceLabel(p.interval)} · ${esc(p.kda)} KDA${pool?`<small>CHAMPIONS · ${pool}</small>`:""}${p.limited?" · ÉCHANTILLON FAIBLE":""}${c?`<small>VS PATCH OBSERVÉ ${esc(c.previousPatch)} · Δ WR ${esc(signed(c.winrateDelta))} points · Δ KDA ${esc(signed(c.kdaDelta))} · ${esc(c.currentGames)}G vs ${esc(c.previousGames)}G${c.limited?" · ÉCHANTILLON FAIBLE":""}</small>`:""}</span>`}).join("")}</div><p class="sample-note">Chaque version utilise son propre échantillon de parties SoloQ au rôle mid. La comparaison porte sur le patch observé précédent, qui n’est pas forcément la version Riot immédiatement précédente. Le pool de champions et le contexte peuvent différer ; les écarts restent descriptifs et ne prouvent pas un effet du patch.</p></div>`;
}
function championLaneReport(rows=[]){
  if(!rows.length)return"";const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="panel"><div class="panel-title">LANE À 10 PAR CHAMPION JOUÉ</div><div class="champions">${rows.map(r=>`<span class="champ"><b>${esc(r.champion)} · ${esc(r.games)}G</b> · ΔCS ${esc(signed(r.csDiff))} · ΔOR ${esc(signed(r.goldDiff))} · ΔXP ${esc(signed(r.xpDiff))} · MORT ${esc(r.deathRate)}%${r.limited?" · ÉCHANTILLON FAIBLE":""}</span>`).join("")}</div><p class="sample-note">Comparaison descriptive des snapshots complets à 10:00 face au mid adverse identifié. Chaque champion a son propre échantillon ; ces écarts n’expliquent ni la cause ni la qualité du micro-gameplay.</p></div>`;
}
function championTransitionReport(rows=[]){
  if(!rows.length)return"";const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="panel"><div class="panel-title">PROGRESSION 5 → 10 PAR CHAMPION</div><div class="champions">${rows.map(r=>`<span class="champ"><b>${esc(r.champion)} · ${esc(r.games)}G</b> · VAR ΔCS ${esc(signed(r.csSwing))} · VAR ΔOR ${esc(signed(r.goldSwing))} · VAR ΔXP ${esc(signed(r.xpSwing))} · OR AMÉLIORÉ ${esc(r.goldImprovedRate)}%${r.limited?" · ÉCHANTILLON FAIBLE":""}</span>`).join("")}</div><p class="sample-note">Chaque champion utilise uniquement les parties avec snapshots complets appariés à 5:00 et 10:00. Une variation positive signifie que l’écart relatif face au mid adverse a augmenté ; elle ne prouve ni un effet du champion ni la qualité du micro-gameplay.</p></div>`;
}
function opponentLaneReport(rows=[]){
  if(!rows.length)return"";const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="panel"><div class="panel-title">LANE À 10 PAR CHAMPION ADVERSE</div><div class="champions">${rows.map(r=>`<span class="champ"><b>VS ${esc(r.champion)} · ${esc(r.games)}G</b> · ΔCS ${esc(signed(r.csDiff))} · ΔOR ${esc(signed(r.goldDiff))} · ΔXP ${esc(signed(r.xpDiff))} · MORT ${esc(r.deathRate)}%${r.limited?" · ÉCHANTILLON FAIBLE":""}</span>`).join("")}</div><p class="sample-note">Snapshots complets à 10:00 face au mid adverse identifié. Chaque champion adverse a son propre échantillon ; ces écarts décrivent les parties observées et ne prouvent ni la cause du matchup ni la qualité du micro-gameplay.</p></div>`;
}
function opponentTransitionReport(rows=[]){
  if(!rows.length)return"";const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="panel"><div class="panel-title">PROGRESSION 5 → 10 PAR CHAMPION ADVERSE</div><div class="champions">${rows.map(r=>`<span class="champ"><b>VS ${esc(r.champion)} · ${esc(r.games)}G</b> · VAR ΔCS ${esc(signed(r.csSwing))} · VAR ΔOR ${esc(signed(r.goldSwing))} · VAR ΔXP ${esc(signed(r.xpSwing))} · OR AMÉLIORÉ ${esc(r.goldImprovedRate)}%${r.limited?" · ÉCHANTILLON FAIBLE":""}</span>`).join("")}</div><p class="sample-note">Chaque champion adverse utilise uniquement les parties avec snapshots complets appariés à 5:00 et 10:00. Ces variations décrivent l’échantillon observé et ne prouvent ni la cause du matchup ni la qualité du micro-gameplay.</p></div>`;
}
function matchupReport(matchups=[]){
  if(!matchups.length)return"";
  return`<div class="panel"><div class="panel-title">MATCHUPS MID RÉCENTS</div><div class="champions">${matchups.map(m=>`<span class="champ"><b>VS ${esc(m.champion)}</b> · ${esc(m.games)}G · ${esc(m.winrate)}% WR${confidenceLabel(m.interval)} · ${esc(m.kda)} KDA${m.limited?" · ÉCHANTILLON FAIBLE":""}</span>`).join("")}</div><p class="sample-note">Résultats regroupés par champion du mid adverse identifié. Ils ne mesurent ni la qualité du micro-gameplay ni la cause du résultat.</p></div>`;
}
function confidenceLabel(interval){return interval&&Number.isFinite(interval.low)&&Number.isFinite(interval.high)?` · IC95 ${esc(interval.low)}–${esc(interval.high)}%`:""}
function accountHtml(a,i){
  return`<div class="account"><div class="account-head"><div><b>${esc(a.gameName||"Compte")}#${esc(a.tagLine||"?")}</b><small>${esc(a.platform||"")}</small></div><span class="tag ${a.isLive?"live":"rank"}">${a.isLive?"● LIVE":esc(rankLabel(a.rank)||"CHECK")}</span></div><div class="account-actions"><button class="action" data-check="${i}">CHECK RIOT</button><button class="action live" data-spec="${i}">▶ SPECTATE</button></div><div id="res-${i}"></div></div>`;
}
function coverageReport(c={}){
  if(!c.requested)return"";
  const reason=c.stop==="rate_limit"?" · collecte arrêtée par la limite Riot":c.stop==="auth"?" · clé Riot refusée":c.targetReached?` · objectif de ${esc(c.target)} parties mid atteint`:"";
  const timelines=c.timelineAttempts?` · timelines ${c.timelinesLoaded}/${c.timelineAttempts}`:"";
  return`<p class="sample-note"><b>${c.partial?"ÉCHANTILLON PARTIEL":"COUVERTURE CONTRÔLÉE"}</b> · historique chargé ${c.matchesLoaded}/${c.requested} · parties mid ${c.midGames}${timelines}${reason}</p>`;
}
function sampleWindowReport(w={}){
  if(!w.games)return"";
  if(!w.datedGames)return`<p class="sample-note"><b>PÉRIODE INDISPONIBLE</b> · aucune des ${esc(w.games)} parties retenues ne contient un horodatage exploitable.</p>`;
  const date=value=>new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(value));
  const age=w.latestAgeDays===0?"dernière partie aujourd’hui":`dernière partie il y a ${esc(w.latestAgeDays)} jour${w.latestAgeDays>1?"s":""}`;
  return`<p class="sample-note"><b>${w.stale?"DONNÉES ANCIENNES":"PÉRIODE ANALYSÉE"}</b> · ${date(w.oldestAt)} → ${date(w.newestAt)} · ${esc(w.datedGames)}/${esc(w.games)} parties datées · ${age}${w.partial?" · datation partielle":""}</p>`;
}
function laneFiveReport(l={}){
  if(!l.games)return`<p class="sample-note">Lane@5 indisponible : aucun snapshot complet à 5:00 avec un mid adverse identifiable.</p>`;
  const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="lane-panel"><div class="lane-head"><small>LANE À 5 MINUTES</small><span>${l.games} match${l.games>1?"s":""} comparable${l.games>1?"s":""}${l.games<3?" · échantillon faible":""}</span></div><div class="lane-stats"><div><b>${l.cs}</b><span>CS@5</span></div><div><b class="${l.csDiff>=0?"up":"down"}">${signed(l.csDiff)}</b><span>Δ CS MOYEN</span></div><div><b class="${l.goldDiff>=0?"up":"down"}">${signed(l.goldDiff)}</b><span>Δ OR MOYEN</span></div><div><b class="${l.xpDiff>=0?"up":"down"}">${signed(l.xpDiff)}</b><span>Δ XP MOYEN</span></div><div><b>${l.goldAheadRate}%</b><span>DEVANT EN OR${confidenceLabel(l.goldAheadInterval)}</span></div><div><b>${l.deathRate}%</b><span>MORT AVANT 5${confidenceLabel(l.deathInterval)}</span></div></div><p>Snapshot Riot complet à 5:00 face au mid adverse identifié. « Devant » signifie strictement plus d’or ; les IC95 de Wilson montrent l’incertitude des fréquences. Ces valeurs sont descriptives et n’expliquent pas la cause de l’écart.</p></div>`;
}
function laneTransitionReport(t={}){
  if(!t.games)return`<p class="sample-note">Évolution 5→10 indisponible : aucune partie ne possède les deux snapshots complets avec un mid adverse identifiable.</p>`;
  const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="lane-panel"><div class="lane-head"><small>ÉVOLUTION DE LANE 5 → 10</small><span>${t.games} partie${t.games>1?"s":""} appariée${t.games>1?"s":""}${t.limited?" · échantillon faible":""}</span></div><div class="lane-stats"><div><b class="${t.csSwing>=0?"up":"down"}">${signed(t.csSwing)}</b><span>VARIATION Δ CS</span></div><div><b class="${t.goldSwing>=0?"up":"down"}">${signed(t.goldSwing)}</b><span>VARIATION Δ OR</span></div><div><b class="${t.xpSwing>=0?"up":"down"}">${signed(t.xpSwing)}</b><span>VARIATION Δ XP</span></div><div><b>${t.goldImprovedRate}%</b><span>ÉCART D’OR AMÉLIORÉ</span></div></div><p>Chaque partie compare ses propres snapshots complets à 5:00 et 10:00. Une variation positive signifie que l’écart relatif face au mid adverse a augmenté ; elle reste descriptive et ne prouve ni la cause ni la qualité du micro-gameplay.</p></div>`;
}
function earlyReport(e={}){
  if(!e.games)return"";
  const ward=Number.isFinite(e.firstWardSeconds)?`${Math.floor(e.firstWardSeconds/60)}:${String(e.firstWardSeconds%60).padStart(2,"0")}`:"—";
  const before=e.before5||{},after=e.fiveToTen||{};
  return laneFiveReport(e.lane5)+laneTransitionReport(e.laneTransition)+`<div class="lane-panel"><div class="lane-head"><small>HABITUDES 0 → 5 / 5 → 10</small><span>${e.games} timeline${e.games>1?"s":""}${e.limited?" · échantillon faible":""}</span></div><div class="lane-stats"><div><b>${before.takedownRate??"—"}${Number.isFinite(before.takedownRate)?"%":""}</b><span>0→5 · PARTIES AVEC TAKEDOWN</span></div><div><b>${before.takedowns??"—"}</b><span>0→5 · TAKEDOWNS/GAME</span></div><div><b>${before.deathRate??"—"}${Number.isFinite(before.deathRate)?"%":""}</b><span>0→5 · PARTIES AVEC MORT</span></div><div><b>${after.takedownRate??"—"}${Number.isFinite(after.takedownRate)?"%":""}</b><span>5→10 · PARTIES AVEC TAKEDOWN</span></div><div><b>${after.takedowns??"—"}</b><span>5→10 · TAKEDOWNS/GAME</span></div><div><b>${after.deathRate??"—"}${Number.isFinite(after.deathRate)?"%":""}</b><span>5→10 · PARTIES AVEC MORT</span></div><div><b>${ward}</b><span>1ER WARD · ${e.wardGames}/${e.games}</span></div></div><p>Événements Riot répartis sans double comptage : 5:00 appartient à 0→5 et 10:00 à 5→10. Fréquences descriptives sur le même échantillon de timelines ; elles n’indiquent ni la position, ni la cause, ni la qualité du micro-gameplay.</p></div>`;
}
function statReport(s){if(!s||!s.games)return`<div class="panel"><div class="panel-title">PERFORMANCE RÉCENTE</div><p class="helper">Pas assez de matchs Riot disponibles pour calculer les statistiques.</p>${coverageReport(s?.coverage)}</div>`;const sig=(s.champions||[]).slice(0,3),l=s.lane10||{};let strengths=[],weak=[];if(s.interval?.low>=50)strengths.push(`Forme positive étayée (${s.winrate}% WR)`);if(s.kda>=3)strengths.push(`KDA solide (${s.kda})`);if(s.cspm>=7)strengths.push(`Farm élevé (${s.cspm} CS/min)`);if(s.dpm>=650)strengths.push(`Forte pression dégâts (${s.dpm} DPM)`);if(s.interval?.high<50)weak.push(`Forme récente négative étayée (${s.winrate}% WR)`);if(s.deaths>=6)weak.push(`Mortalité élevée (${s.deaths}/game)`);if(s.cspm<6)weak.push(`Farm récent limité (${s.cspm} CS/min)`);const signed=n=>`${n>0?"+":""}${n}`,freshness=s.cachedAt?" · cache récent":"";return`<div class="panel scouting"><div class="panel-title">SCOUTING · ${s.games} DERNIÈRES GAMES${freshness}</div>${coverageReport(s.coverage)}${sampleWindowReport(s.window)}<div class="stats-grid"><div><b>${s.winrate}%</b><span>WIN RATE${confidenceLabel(s.interval)}</span></div><div><b>${s.kda}</b><span>KDA</span></div><div><b>${s.cspm}</b><span>CS/MIN</span></div><div><b>${s.dpm}</b><span>DPM</span></div><div><b>${s.gpm}</b><span>GOLD/MIN</span></div><div><b>${s.vision}</b><span>VISION/GAME</span></div></div>${l.games?`<div class="lane-panel"><div class="lane-head"><small>LANE À 10 MINUTES</small><span>${l.games} match${l.games>1?"s":""} comparable${l.games>1?"s":""}${l.games<3?" · échantillon faible":""}</span></div><div class="lane-stats"><div><b>${l.cs}</b><span>CS@10</span></div><div><b class="${l.csDiff>=0?"up":"down"}">${signed(l.csDiff)}</b><span>Δ CS MOYEN</span></div><div><b class="${l.goldDiff>=0?"up":"down"}">${signed(l.goldDiff)}</b><span>Δ OR MOYEN</span></div><div><b class="${l.xpDiff>=0?"up":"down"}">${signed(l.xpDiff)}</b><span>Δ XP MOYEN</span></div>${Number.isFinite(l.medianGoldDiff)?`<div><b class="${l.medianGoldDiff>=0?"up":"down"}">${signed(l.medianGoldDiff)}</b><span>MÉDIANE Δ OR</span></div>`:""}${Number.isFinite(l.goldAheadRate)?`<div><b>${l.goldAheadRate}%</b><span>DEVANT EN OR${confidenceLabel(l.goldAheadInterval)}</span></div>`:""}<div><b>${l.deathRate}%</b><span>MORT AVANT 10${confidenceLabel(l.deathInterval)}</span></div></div><p>Moyennes, médiane et fréquences mesurées sur les mêmes snapshots Riot complets. « Devant » signifie strictement plus d’or que le mid adverse à 10:00 ; les IC95 de Wilson montrent l’incertitude des fréquences. Ces valeurs n’expliquent pas la cause de l’écart.</p></div>`:`<p class="sample-note">Lane@10 indisponible : aucun match récent avec timeline et mid adverse identifiables.</p>`}${earlyReport(s.early)}<div class="scout-grid"><div><small>FORCES</small>${strengths.map(x=>`<p>+ ${esc(x)}</p>`).join("")||"<p>— Pas de signal fort</p>"}</div><div><small>POINTS À SURVEILLER</small>${weak.map(x=>`<p>− ${esc(x)}</p>`).join("")||"<p>— Pas de faiblesse statistique nette</p>"}</div></div>${sig.length?`<div class="signature"><small>CHAMPIONS SIGNATURES RÉCENTS</small><b>${sig.map(x=>`${esc(x.name)} · ${x.games}G · ${x.winrate}%${confidenceLabel(x.interval)}`).join(" &nbsp; / &nbsp; ")}</b></div>`:""}${s.habits?.length?`<div class="habit-block"><small>TENDANCES STATISTIQUES</small>${s.habits.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`:""}<p class="sample-note">Échantillon : ${s.games} parties récentes. IC95 de Wilson : incertitude d’échantillonnage, pas une prédiction. Signaux descriptifs, pas une évaluation vidéo du gameplay.</p></div>`}function scoutReport(p){const r=p.bestRank||{},cs=(p.lastChampions||[]).slice(0,5),top=cs.slice(0,3).map(x=>x.championName||x.champion_name).filter(Boolean);const score=rankScore(p);let strengths=[],weak=[];if(score>=900000)strengths.push("Très haut niveau SoloQ","Mécaniques et rythme de jeu à surveiller");else if(score>=700000)strengths.push("Niveau SoloQ solide");else weak.push("Elo inférieur aux profils les mieux classés");if(top.length)strengths.push("Pool identifié : "+top.join(", "));else weak.push("Peu de données champion disponibles");if((p.accounts||[]).length)strengths.push("Compte Riot suivi");else weak.push("Compte Riot non relié");return`<div class="panel scouting"><div class="panel-title">SCOUTING REPORT</div><div class="scout-grid"><div><small>FORCES</small>${strengths.map(x=>`<p>+ ${esc(x)}</p>`).join("")||"<p>— Données insuffisantes</p>"}</div><div><small>POINTS À SURVEILLER</small>${weak.map(x=>`<p>− ${esc(x)}</p>`).join("")||"<p>— Aucun signal faible détecté</p>"}</div></div>${top.length?`<div class="signature"><small>CHAMPIONS SIGNATURES</small><b>${esc(top.join(" · "))}</b></div>`:""}</div>`}function champHtml(p){const cs=(p.lastChampions||[]).slice(0,5);if(!cs.length)return"";return`<div class="panel"><div class="panel-title">RECENT CHAMPIONS</div><div class="champions">${cs.map(c=>`<span class="champ"><b>${esc(c.championName||c.champion_name||"?")}</b> · ${esc(c.games||0)} games</span>`).join("")}</div></div>`}
function scoutingPanel(p){
  const account=p.accounts?.[0];
  const message=!account?"Aucun compte Riot public relié : statistiques indisponibles.":!S.hasKey?"Configure une clé Riot valide dans Réglages pour charger les statistiques.":"Analyse des matchs Riot récents…";
  return `<div id="scout-live"><div class="panel"><div class="panel-title">SCOUTING SOLOQ · MID</div><p class="helper">${esc(message)}</p><p class="sample-note">Rapport récent · Lane à 10 min · Matchups · Comparaison par patch</p>${!S.hasKey&&account?'<button id="configureScouting" class="action primary">Configurer Riot</button>':""}</div></div>`;
}
function drawPlayer(p){
  const accounts=p.accounts||[],fav=S.favorites.includes(p.id),ouat=p.region==="OUAT";
  $("#drawer").innerHTML=`<div class="drawer-header"><div><div class="drawer-kicker">${esc(p.region)}${p.division?" · "+esc(p.division):""} · MID</div><h2>${esc(p.name)}</h2><div class="drawer-team">${esc(p.team)}${p.country?" · "+esc(p.country):""}</div></div><button class="drawer-close">✕</button></div>
    <div class="drawer-actions"><button id="fav" class="action">${fav?"★ Retirer des favoris":"☆ Ajouter aux favoris"}</button><button id="dpm" class="action primary">↗ DPM.LOL</button></div>${p.region==="LFL"||p.region==="LCKCL"?`<div class="panel"><div class="panel-title">PROFIL COMPÉTITIF</div><div class="champions"><span class="champ"><b>LIGUE</b> · ${esc(p.region==="LCKCL"?"LCK CL":p.region)}</span><span class="champ"><b>ÉQUIPE</b> · ${esc(p.team||"—")}</span><span class="champ"><b>RÔLE</b> · MID</span><span class="champ"><b>SOLOQ</b> · ${esc(rankLabel(p.bestRank)||"Non classé")}</span></div></div>`:""}
    <div class="panel"><div class="panel-title">SOLOQ ACCOUNTS</div>${accounts.length?accounts.map(accountHtml).join(""):'<p class="helper">Aucun compte public relié pour ce joueur.</p>'}
    ${ouat?`<div class="account"><div class="panel-title">CORRIGER LE RIOT ID LEA</div><p class="helper">Si le Riot ID LEA est ancien, remplace-le ici. La correction reste uniquement sur ton PC.</p><div class="fix-row"><input id="fixName" class="fullinput" placeholder="Game name" value="${esc(accounts[0]?.gameName||"")}"><input id="fixTag" class="fullinput" placeholder="TAG" value="${esc(accounts[0]?.tagLine||"")}"></div><button id="saveFix" class="action">Enregistrer</button>${p.accountOverride?'<button id="clearFix" class="action">Revenir au Riot ID LEA</button>':""}<div id="fixMsg"></div></div>`:""}</div>
    ${scoutingPanel(p)}${champHtml(p)}<div class="source">Source roster : ${esc(p.source||"snapshot")}.</div>`;
  $(".drawer-close").onclick=closeDrawer;
  if($("#configureScouting"))$("#configureScouting").onclick=settings;
  $("#fav").onclick=async()=>{S.favorites=await window.mw.favorite(p.id);renderNav();render();openPlayer(p.id)};
  $("#dpm").onclick=()=>window.mw.open(dpmUrl(p));
  document.querySelectorAll("[data-check]").forEach(b=>b.onclick=()=>checkAccount(p,+b.dataset.check));
  document.querySelectorAll("[data-spec]").forEach(b=>b.onclick=()=>spectateAccount(p,+b.dataset.spec));
  if($("#saveFix"))$("#saveFix").onclick=async()=>{try{const a=await window.mw.overrideAccount(p.id,{gameName:$("#fixName").value,tagLine:$("#fixTag").value,platform:"EUW1"});p={...p,accounts:[a],accountOverride:true};const idx=S.ouatPlayers.findIndex(x=>x.id===p.id);if(idx>=0)S.ouatPlayers[idx]=p;openPlayer(p.id);render();}catch(e){$("#fixMsg").innerHTML=`<div class="result">${esc(e.message)}</div>`}};
  if($("#clearFix"))$("#clearFix").onclick=async()=>{await window.mw.clearOverride(p.id);const fresh=await window.mw.data();S.ouatPlayers=fresh.ouatPlayers;openPlayer(p.id);render()};
}
async function checkAccount(p,i){
  const a=p.accounts[i],box=$(`#res-${i}`);if(!box)return;box.className="result";box.textContent="Vérification Riot…";
  try{const r=await window.mw.check(a),solo=(r.ranked||[]).find(x=>x.queueType==="RANKED_SOLO_5x5");box.className="result"+(r.active?" live":"");box.textContent=r.active?`● EN GAME · ${solo?rankLabel(solo):"SoloQ"}`:`○ HORS LIGNE · ${solo?rankLabel(solo):"non classé"}`}
  catch(e){const raw=String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,"");box.innerHTML=p.region==="OUAT"&&/not found|no results/i.test(raw)?"Riot ne trouve plus ce compte. Le Riot ID LEA est probablement ancien — corrige-le plus bas.":esc(raw)}
}
async function spectateAccount(p,i){
  const a=p.accounts[i],box=$(`#res-${i}`);if(!box)return;box.className="result";box.textContent="Recherche de la partie…";
  try{const r=await window.mw.spectate(a),route=String(r.endpoint||"").split("/").filter(Boolean).slice(0,1).join("")||"LCU",phase=r.phase||"inconnue";box.className="result live";box.textContent=`✓ Demande acceptée · phase ${phase} · route ${route}. Vérifie le lancement dans le client.`}catch(e){box.textContent=String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,"")}
}
function settings(){
  drawerRequest++;
  $("#shade").classList.remove("hidden");$("#drawer").classList.remove("hidden");
  $("#drawer").innerHTML=`<div class="drawer-header"><div><div class="drawer-kicker">MIDPULSE ${esc(S.version||"")}</div><h2>Réglages</h2><div class="drawer-team">Configuration locale</div></div><button class="drawer-close">✕</button></div>
  <div class="panel"><div class="panel-title">RIOT API KEY</div><p class="helper">Ta clé reste sur ce PC. Les Development Keys Riot expirent régulièrement.</p><input id="key" class="fullinput" type="password" placeholder="RGAPI-…"><button id="saveKey" class="action primary">Valider la clé</button><div id="keyMsg"></div><button id="portal" class="action">Ouvrir Riot Developer Portal</button></div>
  <div class="panel"><div class="panel-title">LEAGUE OF LEGENDS</div><p id="lolpath" class="helper">${S.leaguePath?"✓ "+esc(S.leaguePath):"Installation non détectée"}</p><button id="pick" class="action">Choisir le dossier League</button><button id="testLeague" class="action primary">Tester le client ouvert</button><div id="leagueTest"></div><p class="sample-note">Ce test vérifie uniquement la connexion locale à un client League ouvert et connecté. Il ne lance pas Spectate et ne nécessite pas de clé Riot.</p></div>`;
  $(".drawer-close").onclick=closeDrawer;
  $("#saveKey").onclick=async()=>{try{S.hasKey=await window.mw.saveKey($("#key").value);rankCooldownAt=0;status();$("#keyMsg").innerHTML='<div class="result live">✓ Clé valide. Rechargement des rangs lancé.</div>';refreshRanks()}catch(e){S.hasKey=false;status();$("#keyMsg").innerHTML=`<div class="result">${esc(e.message)}</div>`}};
  $("#portal").onclick=()=>window.mw.open("https://developer.riotgames.com/");
  $("#pick").onclick=async()=>{try{S.leaguePath=await window.mw.pickLeague();$("#lolpath").textContent=S.leaguePath?"✓ "+S.leaguePath:"Installation non détectée"}catch(e){$("#lolpath").textContent=e.message}};
  $("#testLeague").onclick=async()=>{const box=$("#leagueTest");box.className="result";box.textContent="Connexion au client League…";try{const r=await window.mw.diagnoseLeague();S.leaguePath=r.root;$("#lolpath").textContent="✓ "+r.root;const source=r.auth==="process"?"processus Windows":r.auth==="lockfile"?"lockfile":"locale";box.className="result live";box.textContent=`✓ Client joignable · phase ${r.phase||"inconnue"} · authentification ${source}`;}catch(e){box.textContent=String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,"")}};
}
async function refreshRanks(){
  if(!S.hasKey||rankBusy||Date.now()<rankCooldownAt)return;
  if(rankFollowup){clearTimeout(rankFollowup);rankFollowup=null}
  rankBusy=true;
  try{
    const onScreen=[...document.querySelectorAll(".player-card,.scout-row")].filter(node=>{
      const rect=node.getBoundingClientRect();return rect.bottom>0&&rect.top<window.innerHeight;
    }).map(node=>node.dataset.id);
    const visible=[...new Set([...onScreen,...listForView().slice(0,20).map(p=>p.id)])];
    const r=await window.mw.rankBatch(visible);
    rankCooldownAt=Number(r.retryAt)||0;
    if([401,403].includes(r.blockedStatus))S.hasKey=false;
    for(const u of r.updates||[]){if(u.rank!==undefined)rankState[u.id]=u.rank;rankMeta[u.id]={rankStatus:u.status,rankCheckedAt:u.checkedAt,rankError:u.error}}
    render();
    if(S.hasKey&&!r.retryAt&&(r.deferred||r.remaining>0))rankFollowup=setTimeout(refreshRanks,r.deferred?2000:4000);
  }catch(_){}finally{rankBusy=false}
}
async function refreshLive(){
  if(!S.hasKey)return;
  try{
    const r=await window.mw.liveBatch();
    for(const u of r.updates||[]){if(u.live===true||u.live===false)liveState[u.id]=u.live}
    renderNav();render();
  }catch(_){}
}
async function refresh(){
  if(busy)return;busy=true;$("#refresh").innerHTML='<span class="spinner">↻</span>';
  notice("");
  try{
    const r=await window.mw.refreshOuat(S.ouat.url||"");S.ouatPlayers=r.players;S.ouat={...S.ouat,...r};notice(`${r.players.length} midlaners · ${r.teams||0} équipes · ${r.season}${r.warning?" · "+r.warning:""}`);
  }catch(e){notice(String(e.message||e))}
  finally{busy=false;$("#refresh").textContent="↻";renderNav();render()}
}

$("#overviewNav").onclick=()=>setView("OVERVIEW");
$("#liveNav").onclick=()=>setView("LIVE");
$("#favNav").onclick=()=>setView("FAV");
$("#ouatNav").onclick=()=>setView("OUAT");
$("#patchNav").onclick=()=>setView("PATCHES");
$("#settingsNav").onclick=settings;
$("#settingsTop").onclick=settings;
$("#refresh").onclick=refresh;
$("#shade").onclick=closeDrawer;
$("#sort").onchange=render;
$("#liveOnly").onclick=()=>{liveOnly=!liveOnly;render()};
$("#qTop").oninput=render;
window.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("#qTop").focus();$("#qTop").select()}
  else if(e.key==="Escape")closeDrawer();
  else if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement?.tagName)){e.preventDefault();$("#qTop").focus()}
});

(async()=>{
  S=await window.mw.data();S.players=[];S.favorites=S.favorites.filter(id=>S.ouatPlayers.some(p=>p.id===id));
  $("#appVersion").textContent=`MidPulse ${S.version||""}`;
  if(S.hasKey)try{S.hasKey=await window.mw.keyCheck()}catch(_){S.hasKey=false}
  renderNav();render();status();
  setTimeout(()=>{if(!S.ouatPlayers.length)refresh()},700);setTimeout(refreshLive,1200);setTimeout(refreshRanks,1800);
  setInterval(refreshLive,20000);setInterval(refreshRanks,20000);setInterval(refresh,120000);
})();
