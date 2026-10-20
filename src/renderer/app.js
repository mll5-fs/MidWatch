let S={players:[],ouatPlayers:[],ouat:{},favorites:[],hasKey:false,leaguePath:"",proCacheAt:0};
let view="TEAMS",liveOnly=false,busy=false,ouatDivision="ALL",liveState={},liveMeta={},rankState={},rankMeta={},rankBusy=false,rankReloadPending=false,rankCooldownAt=0,rankFollowup=null,drawerRequest=0;
const $=q=>document.querySelector(q);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let patchRequest=0,patchPlayerId="",patchStats=null,patchError="",patchLoading=false;

function rankClass(r={}){return String(r.tier||"unranked").toLowerCase()}function rankLabel(r={}){const tier=String(r.tier||"").toUpperCase();if(!tier)return"";return `${tier}${r.rank&&!["MASTER","GRANDMASTER","CHALLENGER"].includes(tier)?" "+r.rank:""} · ${r.leaguePoints??r.lp??0} LP`}
function playerRankLabel(p={}){const label=rankLabel(p.bestRank),status=TeamScouting.rankObservation(p).status;if(!label||TeamScouting.points(p.bestRank)===null||['account_missing','account_changed','unranked','invalid'].includes(status))return"";return label+({error:' · À REVÉRIFIER',partial:' · PARTIEL',stale:' · PÉRIMÉ',pending:' · À VÉRIFIER'}[status]||'')}
function rankDateHtml(p){const at=TeamScouting.rankObservation(p).checkedAt;return '<small class="rank-checked">SOLOQ · '+esc(at?'vérifié le '+new Date(at).toLocaleString('fr-FR'):'date de vérification indisponible')+'</small>'}
function rankScore(p){const o={CHALLENGER:10,GRANDMASTER:9,MASTER:8,DIAMOND:7,EMERALD:6,PLATINUM:5,GOLD:4,SILVER:3,BRONZE:2,IRON:1};const r=p.bestRank||{};const tier=o[String(r.tier||"").toUpperCase()]||0;if(!tier)return 0;const apex=tier>=8,division=apex?0:({IV:0,III:1,II:2,I:3}[r.rank]||0),rawLp=Number(r.leaguePoints??r.lp??0),lp=Number.isFinite(rawLp)?Math.max(0,Math.min(rawLp,apex?99999:999)):0;return tier*100000+division*1000+lp}
function sameRiotAccount(a={},b={}){return String(a.gameName||"").trim().toLowerCase()===String(b.gameName||"").trim().toLowerCase()&&String(a.tagLine||"").trim().toLowerCase()===String(b.tagLine||"").trim().toLowerCase()&&String(a.platform||"EUW1").toUpperCase()===String(b.platform||"EUW1").toUpperCase()}
function scoutingAccount(p={}){const accounts=p.accounts||[],preferred=p.bestRankAccount;return(preferred&&accounts.find(a=>sameRiotAccount(a,preferred)))||accounts[0]}
function applyLive(list){return(list||[]).map(original=>{const rank=PlayerIdentity.matches(original,rankMeta[original.id]),live=PlayerIdentity.matches(original,liveMeta[original.id]),p={...original,...(rank?rankMeta[original.id]:{}),...(live?liveMeta[original.id]:{})};const x=LiveMonitor.project(p,live?liveState[p.id]:undefined,live?liveMeta[p.id]:{});return !rank||rankState[p.id]===undefined?x:{...x,bestRank:rankState[p.id]||{}}})}function allPlayers(){return applyLive(S.ouatPlayers)}
function rankPlaceholder(p){
  const status=TeamScouting.rankObservation(p).status;
  const labels={account_missing:'COMPTE NON RELIÉ',account_changed:'COMPTE MODIFIÉ · RANG À RECHARGER',unranked:'NON CLASSÉ SOLOQ',error:'RANG INDISPONIBLE',partial:'RANG PARTIEL',stale:p.rankStatus==='unranked'?'NON CLASSÉ · À REVÉRIFIER':'RANG PÉRIMÉ',invalid:'RANG INCOHÉRENT'};
  if(labels[status])return labels[status];
  return S.hasKey?"RANG À CHARGER":"CLÉ RIOT REQUISE";
}
function tracked(p){return p.source==="DPM public data"||p.source==="live"||p.live===true}
function stateOf(p){if(p.live===true)return"live";if(p.live===false)return"offline";return"unknown"}
function dpmUrl(p){const a=scoutingAccount(p);if(p.region==="OUAT"){if(a?.gameName&&a?.tagLine)return`https://dpm.lol/${encodeURIComponent(a.gameName)}-${encodeURIComponent(a.tagLine)}`;return"https://dpm.lol/"}return`https://dpm.lol/pro/${encodeURIComponent(p.name)}`}

function setView(next){teamBatch.cancel();teamDuel.cancel();patchRequest++;patchLoading=false;view=next;liveOnly=false;$("#qTop").value="";renderNav();render();refreshRanks()}
function renderNav(){
  const live=allPlayers().filter(p=>p.live===true).length;
  $("#liveNavCount").textContent=live;
  $("#favCount").textContent=S.favorites.length;
  $("#ouatCount").textContent=S.ouatPlayers.length||"—";
  $("#overviewNav").classList.toggle("on",view==="OVERVIEW");
  $("#liveNav").classList.toggle("on",view==="LIVE");
  $("#favNav").classList.toggle("on",view==="FAV");
  $("#ouatNav").classList.toggle("on",view==="OUAT");
  $("#teamsNav").classList.toggle("on",view==="TEAMS");
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
  const state=stateOf(p),rank=playerRankLabel(p),fav=S.favorites.includes(p.id),account=scoutingAccount(p);
  const status=p.accounts?.length?LiveMonitor.label(p):"◌ COMPTE NON RELIÉ";
  return`<article class="player-card ${state}" data-id="${esc(p.id)}">
    <div class="card-top"><span class="card-scope">${esc(p.region)}${p.division?" · "+esc(p.division):""}</span><button class="star-btn ${fav?"on":""}" data-star="${esc(p.id)}">★</button></div>
    <div class="player-main">${avatar(p)}<div><div class="player-name-line"><div class="player-name">${esc(p.name)}</div>${rank?`<span class="elo-badge ${rankClass(p.bestRank)}">${esc(rank)}</span>`:`<span class="elo-badge unranked">${esc(rankPlaceholder(p))}</span>`}</div>${rankDateHtml(p)}<div class="player-team">${esc(p.team)}</div></div></div>
    <div class="card-bottom"><span class="tag ${state}">${status}</span>${rank?`<span class="tag rank">${esc(rank)}</span>`:""}${account?.tagLine?`<span class="tag">#${esc(account.tagLine)}</span>`:""}</div>
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
 ${rows.map((p,i)=>{const a=scoutingAccount(p),state=stateOf(p),rank=playerRankLabel(p);return`<button class="scout-row" data-id="${esc(p.id)}"><span class="scout-player"><em>${String(i+1).padStart(2,"0")}</em>${avatar(p,"ouat-avatar")}<strong>${esc(p.name)}</strong></span><span class="scout-team">${esc(p.team||"—")}</span><span><i>${esc(p.division||"—")}</i></span><span>${rank?`<b class="elo-badge ${rankClass(p.bestRank)}">${esc(rank)}</b>`:`<b class="elo-badge unranked">${esc(rankPlaceholder(p))}</b>`}${rankDateHtml(p)}</span><span class="scout-riot">${a?.gameName?`${esc(a.gameName)}#${esc(a.tagLine||"")}`:"Non relié"}</span><span class="scout-status ${state}">${esc(a?.gameName?LiveMonitor.label(p):"○ COMPTE NON RELIÉ")}</span></button>`}).join("")}</section>`;
}

function hero(){
  const live=allPlayers().filter(p=>p.live===true);
  if(view==="OUAT"&&!$("#qTop").value){
    const divisions=["ALL",...new Set(S.ouatPlayers.map(p=>String(p.division||"Sans division")).filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})))];
    const teams=new Set((ouatDivision==="ALL"?S.ouatPlayers:S.ouatPlayers.filter(p=>String(p.division||"Sans division")===ouatDivision)).map(p=>p.team)).size;
    const ranked=allPlayers().filter(p=>rankScore(p)>0).length,masters=allPlayers().filter(p=>rankScore(p)>=800000).length,live=allPlayers().filter(p=>p.live===true).length;$("#hero").innerHTML=`<div class="scouting-hero"><div class="scouting-intro"><div class="panel-kicker">OUATVENTURE · SCOUTING DATABASE</div><h2>Scoute les joueurs OUAT.</h2><p>Classement SoloQ, champion pool, forme récente et rapports de jeu réunis dans une seule base.</p></div><div class="scouting-kpis"><div><strong>${S.ouatPlayers.length}</strong><span>JOUEURS</span></div><div><strong>${ranked}</strong><span>CLASSÉS</span></div><div><strong>${masters}</strong><span>MASTER+</span></div><div><strong>${live}</strong><span>LIVE</span></div></div><div class="division-strip">${divisions.map(d=>`<button data-division="${esc(d)}" class="${ouatDivision===d?"on":""}">${d==="ALL"?"Toutes divisions":esc(d)}</button>`).join("")}</div></div>`;
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
  if(view==="OVERVIEW")return["SCOUTING DESK","Dashboard","Analyse, compare et surveille les joueurs OUAT."];
  if(view==="LIVE")return["LIVE","En direct","Tous les joueurs actuellement détectés en partie."];
  if(view==="FAV")return["LIBRARY","Favoris","Les joueurs que tu veux garder sous les yeux."];
  if(view==="TEAMS")return["SCOUTING D’ÉQUIPE","Équipes OUAT · 5 rôles","Effectifs LEA, rangs SoloQ et comparaison avec UWU GANG."];
  if(view==="OUAT")return["OUAT SCOUTING",`OUATventure ${S.ouat.season||""}`,`Base scouting · ${S.ouatPlayers.length} joueurs · ${S.ouat.teams||0} équipes`];
  if(view==="PATCHES")return["PATCHS","Analyse de patchs","Notes officielles Riot et performances SoloQ des cinq rôles OUAT par version."];
  return["OUAT SCOUTING","OUATventure","Scouting des joueurs OUAT"];
}
function renderPatchSection(){
  $("#sort").hidden=true;$("#liveOnly").hidden=true;
  $("#hero").innerHTML=`<div class="panel"><div class="panel-title">NOTES OFFICIELLES RIOT</div><p>Consulte les changements de champions, objets et systèmes dans les notes officielles, puis compare les résultats observés du joueur entre les patchs.</p><button id="riotPatchNotes" class="action">Ouvrir les notes de patch Riot</button><p class="sample-note">Les différences de résultats ne prouvent pas qu’un buff ou un nerf en est la cause. Les données ci-dessous sont limitées aux parties SoloQ au rôle du joueur disponibles du compte sélectionné.</p></div>`;
  $("#riotPatchNotes").onclick=()=>window.mw.open("https://www.leagueoflegends.com/fr-fr/news/tags/patch-notes/");
  const players=allPlayers().filter(p=>scoutingAccount(p)?.gameName&&scoutingAccount(p)?.tagLine).filter(p=>queryMatch(p,$("#qTop").value.trim().toLowerCase()));
  $("#sectionTitle").textContent="PERFORMANCES OUAT PAR PATCH";$("#summary").textContent=`${players.length} joueurs avec un compte relié`;
  if(!players.some(p=>p.id===patchPlayerId)){patchRequest++;patchLoading=false;patchPlayerId=players[0]?.id||"";patchStats=null;patchError="";}
  if(!players.length){$("#grid").innerHTML='<div class="panel" style="grid-column:1/-1"><p>Aucun joueur OUAT avec un compte relié ne correspond à la recherche.</p></div>';return;}
  $("#grid").innerHTML=`<div class="panel" style="grid-column:1/-1"><label for="patchPlayer">Joueur OUAT</label><select id="patchPlayer" class="fullinput">${players.map(p=>{const a=scoutingAccount(p);return`<option value="${esc(p.id)}" ${p.id===patchPlayerId?"selected":""}>${esc(p.name)} · ${esc(p.team)} · ${esc(a.gameName)}#${esc(a.tagLine)}</option>`}).join("")}</select><button id="analyzePatch" class="action primary" ${patchLoading||!S.hasKey||!players.length?"disabled":""}>${patchLoading?"Analyse en cours…":"Analyser les patchs"}</button><div id="patchResults">${!S.hasKey?'<p>Configure une clé Riot valide dans Réglages.</p>':patchError?`<p>${esc(patchError)}</p>`:patchStats?coverageReport(patchStats.coverage,patchStats.normalization)+sampleWindowReport(patchStats.window)+patchReport(patchStats.patches)+(patchStats.evidence?matchEvidenceReport(patchStats):"")+(!patchStats.patches?.length?'<p>Aucune partie au rôle sélectionné avec un patch exploitable dans l’historique disponible.</p>':""):"<p>Sélectionne un joueur puis lance l’analyse. Les groupes affichent le nombre de parties, le winrate avec IC95 et le KDA.</p>"}</div></div>`;
  $("#patchPlayer").onchange=()=>{patchRequest++;patchLoading=false;patchPlayerId=$("#patchPlayer").value;patchStats=null;patchError="";render()};
  $("#analyzePatch").onclick=async()=>{const player=allPlayers().find(p=>p.id===patchPlayerId);if(!player||!S.hasKey||patchLoading)return;const request=++patchRequest;patchLoading=true;patchError="";render();try{const stats=player.role&&player.role!=="MID"?await window.mw.roleStats(scoutingAccount(player),player.role,true):await window.mw.patchStats(scoutingAccount(player));if(request!==patchRequest||view!=="PATCHES")return;patchStats=stats;}catch(e){if(request!==patchRequest||view!=="PATCHES")return;patchError=String(e.message||e);}finally{if(request===patchRequest&&view==="PATCHES"){patchLoading=false;render()}}};
}

let teamDivision="ALL",teamGroup="ALL",selectedTeam="";
let duelRole="MID",duelPatch="ALL",duelChampion="ALL",duelChampionMode="COMMON",duelSideChampions=["ALL","ALL"];
function duelChampionFor(i){return duelChampionMode==="SIDES"?duelSideChampions[i]:duelChampion;}
let draftPatch="ALL",draftContext="",draftChampion="",championContext="";
const teamDuel=DuelScouting.create();
const teamBatch=DuelScouting.createBatch();
const roleFilters=DuelScouting.createFilterMemory();
function duelSynthesis(pair,state){
 const reports=state.sides.map((x,i)=>DuelScouting.scopeReport(x?.report,duelPatch,duelChampionFor(i))),c=DuelScouting.compare(reports[0],reports[1]);if(!c)return"";
 const signed=n=>`${n>0?"+":""}${n}`,team=pair.sides[0].teamName;
 const list=items=>items.length?items.map(x=>`${esc(x.name)} (${esc(x.games)}G)`).join(" · "):"aucun dans l’échantillon";
 return `<div class="duel-synthesis"><div class="panel-title">SYNTHÈSE DES ÉCHANTILLONS · ${esc(c.role)}</div><p class="sample-note"><b>${esc(team)}</b> : ${c.games[0]} parties · <b>UWU GANG</b> : ${c.games[1]} parties. L’écart est ${esc(team)} moins UWU GANG ; son signe n’indique pas automatiquement une force ou une faiblesse. ${c.intervals.every(Boolean)?`IC95 du winrate : ${esc(team)} ${c.intervals[0].low}–${c.intervals[0].high}% · UWU ${c.intervals[1].low}–${c.intervals[1].high}%.`:""}</p><div class="group-table-scroll"><table class="group-table duel-metrics"><thead><tr><th>Mesure</th><th>${esc(team)}</th><th>UWU GANG</th><th>Écart descriptif</th></tr></thead><tbody>${c.metrics.map(m=>`<tr><td>${esc(m.label)}</td><td>${esc(m.left)}</td><td>${esc(m.right)}</td><td>${esc(signed(m.delta))}</td></tr>`).join("")}</tbody></table></div><div class="duel-evidence"><div><b>CHAMPIONS COMMUNS</b><p>${c.champions.common.length?c.champions.common.map(x=>`${esc(x.name)} (${x.left}G / ${x.right}G)`).join(" · "):"Aucun dans les échantillons."}</p></div><div><b>UNIQUEMENT OBSERVÉS · ${esc(team)}</b><p>${list(c.champions.leftOnly)}</p></div><div><b>UNIQUEMENT OBSERVÉS · UWU</b><p>${list(c.champions.rightOnly)}</p></div><div><b>PATCHS COMMUNS</b><p>${c.patches.length?c.patches.map(x=>`${esc(x.patch)} (${x.left}G / ${x.right}G)`).join(" · "):"Aucun patch commun : les écarts sont particulièrement peu comparables."}</p></div></div><p class="sample-note">${c.limitations.partial.some(Boolean)?"Au moins une collecte est partielle. ":""}${c.limitations.stale.some(Boolean)?"Au moins un échantillon est ancien. ":""}Les moyennes agrègent des parties différentes. Elles ne contrôlent pas le matchup, les coéquipiers ou la durée et ne mesurent pas le micro-gameplay. Filtrer un patch ne démontre pas son effet causal.</p></div>`;
}
function roleMemories(team,home){
 return TeamScouting.roles.map(role=>{const pair=DuelScouting.pair(team,home,role,S.lineups,S.hasKey),saved=pair?teamDuel.peek(pair.key):null;return {pair,saved,role};});
}
function roleMemoryPanel(team,home){
 const rows=roleMemories(team,home);
 const batch=teamBatch.sync(rows.map(r=>r.pair)),labels={restored:'ancien rapport conservé (daté)',waiting:'en attente',loading:'collecte en cours',blocked:'indisponible',reused:'mémoire réutilisée',loaded:'chargé',partial:'collecte partielle',error:'interrompu',stopped:'non lancé',cancelled:'arrêté'};
 return '<div class="panel"><div class="panel-title">ANALYSES MÉMORISÉES · 5 RÔLES</div><p class="sample-note">Charge les cinq rôles en une action, ou chaque rôle depuis le comparateur. Les rapports complets déjà mémorisés sont réutilisés sans appel Riot. Les autres rapports sont recollectés depuis Riot, y compris les collectes partielles lors d’un nouveau clic. Jusqu’à dix rapports individuels, collectés successivement ; le lot s’arrête sur erreur ou refus Riot. Les rôles sans compte ou composition univoque sont ignorés, jamais inventés.</p><button id="loadTeamDuels" class="action primary" '+(!S.hasKey||batch.running||teamDuel.state.loading||!rows.some(r=>r.pair?.ready)?'disabled':'')+'>'+(batch.running?'Chargement des cinq rôles…':'Charger les 5 rôles')+'</button><button id="refreshTeamDuels" class="action" '+(!S.hasKey||batch.running||teamDuel.state.loading||!rows.some(r=>r.pair?.ready)?'disabled':'')+'>'+(batch.running&&batch.force?'Actualisation des cinq rôles…':'Actualiser les 5 rôles depuis Riot')+'</button><p class="sample-note">Actualiser relit Riot même si la mémoire contient des rapports complets. Jusqu’à dix rapports successifs, sans contourner les délais ni les quotas. En cas d’échec ou de collecte partielle, une ancienne paire complète encore valide peut être conservée avec ses dates et signalée comme restaurée ; ce n’est pas une actualisation réussie.</p>'+(batch.running?'<button id="stopTeamDuels" class="action">Arrêter le chargement</button>':'')+'<p class="sample-note" role="status" aria-live="polite">'+batch.rows.map(r=>esc(r.role)+' : '+esc(labels[r.status]||r.status)+(r.reason?' — '+esc(r.reason):'')).join(' · ')+(batch.stop==='cancelled'?' · Arrêt demandé : une requête déjà partie peut encore finir, mais son résultat ne sera pas ajouté.':'')+'</p><p class="sample-note">Les résultats restent consultables pendant 15 min dans cette session, sans nouvel appel Riot lors du changement de rôle. La mémoire ne confirme ni une composition titulaire ni la fraîcheur de l’historique : vérifie les dates des rapports. Elle expire après 15 min ou à la fermeture de l’application.</p><div class="team-filters">'+rows.map(({pair,saved,role})=>{const reports=saved?.sides.filter(s=>s?.report?.role===role)||[],counts=reports.map(s=>s.report.games+'G').join(' / ');return '<button class="action" data-saved-role="'+role+'" '+(!pair?'disabled':'')+'>'+role+' · '+reports.length+'/2 rapports'+(counts?' · '+counts:'')+'</button>';}).join('')+'</div></div>';
}
function teamOverviewPanel(team,home){
 if(!team||!home||team.id===home.id)return '';
 const rows=DuelScouting.overview(roleMemories(team,home).map(entry=>({...entry,loading:teamDuel.state.loading&&teamDuel.state.key===entry.pair?.key||teamBatch.state.running&&teamBatch.state.rows.some(r=>r.role===entry.role&&r.status==='loading')})));
 const date=v=>Number.isFinite(v)&&v>0&&Number.isFinite(new Date(v).getTime())?new Date(v).toLocaleString('fr-FR'):'date indisponible';
 const sideHtml=side=>{
  const r=side.report,a=side.account,identity=`<b>${esc(side.player?.name||'Joueur non sélectionné')}</b><small>${esc(a?.gameName&&a?.tagLine?`${a.gameName}#${a.tagLine} · ${a.platform||'EUW1'}`:'Compte non relié')}${side.manual?' · composition locale':''}</small>`;
  if(!r)return identity+`<p>${esc(side.reason||(side.status==='loading'?'Collecte en cours…':'Rapport non chargé ou mémoire expirée.'))}</p>`;
  const metrics=r.games>0?[['winrate','WIN','%'],['kda','KDA',''],['cspm','CS/min',''],['dpm','Dégâts/min',''],['vision','Vision/partie','']].filter(([k])=>Number.isFinite(r[k])).map(([k,label,unit])=>`${esc(label)} ${esc(r[k])}${unit}`).join(' · '):'Aucune partie exploitable : aucune statistique déduite.';
  const pool=r.games>0?(r.champions||[]).filter(c=>typeof c.name==='string'&&c.name.trim()&&Number.isInteger(c.games)&&c.games>0):[],champions=pool.slice(0,3).map(c=>`${esc(c.name)} (${c.games}G)`).join(' · ');
  const warnings=[r.games<3?'ÉCHANTILLON FAIBLE (<3 parties)':'',r.coverage?.partial?'COLLECTE PARTIELLE':'',r.window?.stale?'DONNÉES ANCIENNES':'',!r.coverage?'COUVERTURE INDISPONIBLE':'',r.normalization?.games?`CONVENTION RIOT : ${r.normalization.fields} CHAMP(S) OMIS → ZÉRO / ${r.normalization.games} PARTIE(S)`:''].filter(Boolean).join(' · ');
  return identity+`<p><strong>${r.games} parties</strong> · ${metrics}</p><small>Période : ${esc(date(r.window?.oldestAt))} → ${esc(date(r.window?.newestAt))}<br>Collecte : ${esc(date(r.sampledAt))}</small><p>Champions les plus joués dans cet échantillon : ${champions||'indisponibles'}${pool.length>3?` · +${pool.length-3} autres (voir le détail)`:''}</p>${warnings?`<p class="sample-note">${esc(warnings)}</p>`:''}`;
 };
 return `<section id="team-overview" class="panel team-overview team-section-anchor" tabindex="-1" aria-label="Vue d’ensemble des cinq rôles"><div class="panel-title">VUE D’ENSEMBLE SOLOQ · 5 RÔLES</div><p class="sample-note">${rows.filter(r=>r.comparison).length}/5 rôles avec deux échantillons non vides. Toutes les parties retenues, tous patchs et champions : les filtres du comparateur détaillé ne modifient pas ce tableau. Aucun nouvel appel Riot. Historiques individuels, pas des confrontations directes ; aucun classement des joueurs ou pronostic. Les périodes, adversaires et coéquipiers ne sont pas contrôlés. Une collecte partielle ou un petit échantillon limite la lecture.</p><div class="group-table-scroll"><table class="group-table"><caption>Comparaison descriptive par rôle · ${esc(team.name)} / UWU GANG</caption><thead><tr><th scope="col">Rôle</th><th scope="col">${esc(team.name)}</th><th scope="col">UWU GANG</th><th scope="col">Observations communes</th></tr></thead><tbody>${rows.map(row=>`<tr><th scope="row"><button class="action" data-saved-role="${row.role}">Voir ${row.role}</button>${row.restoredAfterError?'<small>RAPPORT RESTAURÉ APRÈS ÉCHEC · dates d’origine</small>':""}${row.loading?'<small>Collecte en cours · les données déjà présentes restent datées.</small>':''}</th>${row.sides.map(side=>`<td>${sideHtml(side)}</td>`).join('')}<td>${row.comparison?`<p>Champions observés des deux côtés : ${row.comparison.champions.common.map(c=>`${esc(c.name)} (${c.left}G / ${c.right}G)`).join(' · ')||'aucun'}</p><p>Patchs observés des deux côtés : ${row.comparison.patches.map(p=>`${esc(p.patch)} (${p.left}G / ${p.right}G)`).join(' · ')||'aucun'}</p><small>Ces listes ne garantissent pas une intersection champion/patch. Utilise les filtres dans le détail.</small>`:'Deux échantillons non vides sont nécessaires ; aucune comparaison inventée.'}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function draftPoolPanel(team,home){
 if(!team||!home||team.id===home.id)return "";
 const entries=roleMemories(team,home),context=JSON.stringify(entries.map(e=>e.pair?.key||""));
 if(context!==draftContext){draftContext=context;draftPatch="ALL";}
 const patches=DuelScouting.draftPatches(entries);if(draftPatch!=="ALL"&&!patches.includes(draftPatch))draftPatch="ALL";
 const rows=DuelScouting.draftPools(entries,draftPatch),date=v=>Number.isFinite(v)&&v>0&&Number.isFinite(new Date(v).getTime())?new Date(v).toLocaleDateString("fr-FR"):"date indisponible";
 const traceHtml=c=>draftPoolEvidence(c,date);
 const cell=side=>{
  const identity='<b>'+esc(side.player?.name||"Joueur non sélectionné")+'</b>';
  const messages={missing:side.reason||"Rapport non chargé : lance Charger les 5 rôles.",unobserved:"Aucune partie observée sur ce patch dans l’échantillon chargé ; cela ne décrit pas le pool complet du joueur.",empty:"Aucune partie exploitable au rôle demandé.",invalid:"Pool incohérent : aucune fréquence calculée."};
  if(side.poolStatus!=="loaded")return identity+'<p>'+esc(messages[side.poolStatus]||"Indisponible")+'</p>';
  const r=side.report;
  return identity+'<p>'+esc(r.games)+' parties au rôle · '+esc(side.identifiedGames)+'/'+esc(r.games)+' avec champion identifié<br>'+esc(date(r.window?.oldestAt))+' → '+esc(date(r.window?.newestAt))+'</p><small>Collecte : '+esc(date(r.sampledAt))+(r.coverage?.partial?' · COLLECTE PARTIELLE':'')+(r.window?.stale?' · DONNÉES ANCIENNES':'')+'</small>'+(side.champions.length?'<ul class="draft-pool-list">'+side.champions.map(c=>'<li><b>'+esc(c.name)+'</b> · '+c.games+'/'+r.games+' ('+c.share+'%) · '+(c.wins===null?'résultats indisponibles':c.wins+'/'+c.games+' victoires ('+c.winrate+'%)')+(c.limited?' · <span>moins de 3 parties</span>':'')+traceHtml(c)+'</li>').join("")+'</ul>':'<p>Aucun champion identifiable ; aucun nom inventé.</p>');
 };
 return '<section id="team-draft-pools" class="panel draft-pools team-section-anchor" tabindex="-1" aria-label="Pools de draft observés"><div class="panel-title">POOLS OBSERVÉS · PRÉPARATION DRAFT · 5 RÔLES</div><label>Patch des pools<select id="draftPatch" class="fullinput"><option value="ALL">Toutes les parties retenues</option>'+patches.map(p=>'<option value="'+esc(p)+'" '+(p===draftPatch?'selected':'')+'>'+esc(p)+'</option>').join("")+'</select></label><p class="sample-note">Lance Charger les 5 rôles pour alimenter ce tableau. Fréquence = parties sur le champion / parties retenues au rôle et au patch choisi, pas tous les matchs du compte ni le répertoire complet. Tri par fréquence observée, pas par menace ou recommandation de ban. Les résultats SoloQ ne prédisent pas une draft compétitive ; une absence n’est pas une absence de maîtrise.</p><p class="sample-note">Périmètre des pools et de leur export : '+esc(draftPatch==="ALL"?"tous les patchs retenus":"patch "+draftPatch)+'. Indépendant des filtres du comparateur détaillé. Chaque côté est filtré séparément : aucun échantillon ajouté si le patch manque. Mémoire de session existante, aucun appel Riot supplémentaire.</p><div class="group-table-scroll"><table class="group-table"><caption>Pools individuels observés · '+esc(team.name)+' / UWU GANG</caption><thead><tr><th>Rôle</th><th>'+esc(team.name)+'</th><th>UWU GANG</th></tr></thead><tbody>'+rows.map(row=>'<tr><th>'+esc(row.role)+(row.restoredAfterError?'<small>RAPPORT RESTAURÉ APRÈS ÉCHEC</small>':'')+'</th>'+row.sides.map(side=>'<td>'+cell(side)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>'+multiRolePoolPanel(entries,team,home,draftPatch)+'</section>';
}
function draftPoolEvidence(c,date){
  const trace=c.trace||{status:"unavailable",rows:[]},message={complete:"Sources couvrant les parties affichées.",partial:"TRAÇABILITÉ PARTIELLE : des parties ou métadonnées manquent.",unavailable:"Sources indisponibles dans ce rapport. Actualise la collecte pour les obtenir.",inconsistent:"SOURCES INCOHÉRENTES : lien au pool non vérifiable, aucune liste présentée."}[trace.status];
  return '<details class="match-evidence"><summary>Voir les parties · '+esc(c.name)+' · '+trace.rows.length+'/'+c.games+(trace.status==='complete'?'':trace.status==='inconsistent'?' · INCOHÉRENT':trace.status==='partial'?' · PARTIEL':' · INDISPONIBLE')+'</summary><p class="sample-note">'+esc(message)+' Fréquences calculées sur le rapport, pas recalculées depuis une liste incomplète. Historiques individuels, pas des confrontations directes. Aucun nouvel appel Riot.</p><ul>'+trace.rows.map(m=>'<li>'+esc(date(m.startedAt))+' · '+esc(m.matchId||"Identifiant indisponible")+' · patch '+esc(m.patch||"indisponible")+' · '+(m.win?"Victoire":"Défaite")+' · '+esc(m.seconds===null?"Durée indisponible":m.seconds+" s jouées")+' · K/D/A '+[m.kills,m.deaths,m.assists].map(v=>Number.isFinite(v)?esc(v):"—").join("/")+'</li>').join("")+'</ul></details>';
}
function draftChampionPanel(team,home){
 if(!team||!home||team.id===home.id)return '';
 const entries=roleMemories(team,home),context=JSON.stringify([draftPatch,entries.map(e=>e.pair?.key||'')]);
 if(championContext!==context){championContext=context;draftChampion='';}
 const lookup=DuelScouting.championLookup(entries,draftPatch,draftChampion);draftChampion=lookup.selected;
 const date=v=>Number.isFinite(v)&&v>0&&Number.isFinite(new Date(v).getTime())?new Date(v).toLocaleString('fr-FR'):'date indisponible';
 const performanceHtml=p=>p?'<div class="champion-performance"><p>STATISTIQUES DU CHAMPION · '+esc(p.games)+' parties<br>'+esc(p.wins)+'/'+esc(p.games)+' victoires ('+esc(p.winrate)+'%) · KDA '+esc(p.kda)+' · CS/min '+esc(p.cspm)+' · dégâts/min '+esc(p.dpm)+' · vision/partie '+esc(p.vision)+'</p><small>Période du champion : '+esc(date(p.window.oldestAt))+' → '+esc(date(p.window.newestAt))+(p.window.partial?' · DATES PARTIELLES':'')+(p.window.stale?' · DONNÉES ANCIENNES':'')+(p.omittedGames?' · '+esc(p.omittedGames)+' partie(s) avec champs numériques omis par Riot, traités comme zéro':'')+'</small></div>':'<p>Statistiques du champion indisponibles ou incohérentes dans ce rapport. Aucune métrique globale substituée.</p>';
 const cell=side=>{
  const identity='<b>'+esc(side.player?.name||'Joueur non sélectionné')+'</b>';
  if(side.poolStatus!=='loaded')return identity+'<p>'+esc(({missing:side.reason||'Rapport non chargé',unobserved:'Patch non observé dans le rapport chargé',empty:'Aucune partie au rôle',invalid:'Pool incohérent'})[side.poolStatus]||'Indisponible')+'</p>';
  const r=side.report,c=side.champion;
  return identity+'<p>'+(c?esc(c.games)+'/'+esc(r.games)+' parties ('+esc(c.share)+'%)'+(c.limited?' · moins de 3 parties':''):'Non observé parmi '+esc(r.games)+' parties au rôle · '+esc(side.identifiedGames)+' avec champion identifié')+'</p><small>Collecte : '+esc(date(r.sampledAt))+'<br>Période : '+esc(date(r.window?.oldestAt))+' → '+esc(date(r.window?.newestAt))+(r.coverage?.partial?' · COLLECTE PARTIELLE':'')+(r.window?.stale?' · DONNÉES ANCIENNES':'')+'</small>'+(c?performanceHtml(side.performance)+draftPoolEvidence(c,date):'');
 };
 return '<section id="team-champion-lookup" class="panel team-section-anchor" tabindex="-1" aria-label="Recherche de champion sur cinq rôles"><div class="panel-title">RETROUVER UN CHAMPION · 5 RÔLES</div><label>Champion observé<select id="draftChampion" class="fullinput"><option value="">Choisir un champion</option>'+lookup.choices.map(name=>'<option value="'+esc(name)+'" '+(name===lookup.selected?'selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label><p class="sample-note">Patch : '+esc(draftPatch==='ALL'?'tous les patchs retenus':draftPatch)+'. Recherche dans les pools chargés, sans appel Riot. Statistiques sur le champion, rôle et patch retenus uniquement. KDA = (kills + assists) cumulés / max(1, morts cumulées) ; CS/min et dégâts/min pondérés par durée ; vision moyenne par partie. Échantillons SoloQ indépendants : pas des duels directs, pas du micro-gameplay ni une preuve d’effet du patch. Les dix cases restent séparées : aucun total d’équipe, pas des flex compétitifs confirmés. Non observé ne signifie pas non maîtrisé ; un champion non identifié limite la lecture. Les rapports et exports conservent leur périmètre complet : ce sélecteur ne les filtre pas.</p>'+(lookup.selected?'<div class="group-table-scroll"><table class="group-table"><caption>'+esc(lookup.selected)+' · '+esc(team.name)+' / '+esc(home.name)+'</caption><thead><tr><th>Rôle</th><th>'+esc(team.name)+'</th><th>'+esc(home.name)+'</th></tr></thead><tbody>'+lookup.rows.map(row=>'<tr><th scope="row">'+row.role+(row.restoredAfterError?'<small>RESTAURÉ APRÈS ÉCHEC</small>':'')+'</th>'+row.sides.map(side=>'<td>'+cell(side)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<p>'+(!lookup.choices.length?'Aucun champion identifiable dans les pools disponibles. Lance Charger les 5 rôles et vérifie le patch.':'Choisis un champion pour voir ses observations sur les cinq rôles des deux équipes.')+'</p>')+'</section>';
}
function multiRolePoolPanel(entries,team,home,patch){
 const date=v=>Number.isFinite(v)&&v>0&&Number.isFinite(new Date(v).getTime())?new Date(v).toLocaleString('fr-FR'):'date indisponible';
 const sides=DuelScouting.multiRolePools(entries,patch);
 return '<div class="multi-role-pools"><div class="panel-title">CHAMPIONS OBSERVÉS SUR PLUSIEURS RÔLES</div><p class="sample-note">Même patch que les pools ci-dessus, indépendant des filtres du comparateur. Au moins deux rôles de joueurs sélectionnés, comptes distincts. Un compte ou joueur partagé entre rôles reste exclu même si son autre rapport est absent ou inutilisable. Historiques SoloQ individuels : pas des flex compétitifs confirmés, pas une recommandation de ban. Une absence ne prouve pas une absence de maîtrise. Aucun appel Riot supplémentaire.</p>'+sides.map((side,i)=>'<h3>'+esc(i===0?team.name:home.name)+' · '+side.covered+'/5 rôles avec pool exploitable</h3><p class="sample-note">Rôles indisponibles ou comptes partagés exclus : '+esc(side.excluded.join(', ')||'aucun')+'</p>'+(side.champions.length?'<div class="group-table-scroll"><table class="group-table"><caption>Observations multirôles · '+esc(i===0?team.name:home.name)+'</caption><thead><tr><th>Champion</th>'+TeamScouting.roles.map(r=>'<th>'+r+'</th>').join('')+'</tr></thead><tbody>'+side.champions.map(c=>'<tr><th scope="row">'+esc(c.name)+'</th>'+TeamScouting.roles.map(role=>{const cell=c.cells.find(v=>v.role===role);return '<td>'+(cell?'<b>'+esc(cell.player.name)+'</b><p>'+cell.games+'/'+cell.total+' ('+cell.share+'%)'+(cell.limited?' · moins de 3 parties':'')+'</p><small>Collecte : '+esc(date(cell.sampledAt))+'<br>Période : '+esc(date(cell.window?.oldestAt))+' → '+esc(date(cell.window?.newestAt))+(cell.partial?' · COLLECTE PARTIELLE':'')+(cell.window?.stale?' · DONNÉES ANCIENNES':'')+(cell.restoredAfterError?' · RESTAURÉ APRÈS ÉCHEC':'')+'</small>':'— · non observé ou indisponible')+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div>':'<p>Aucun champion observé sur au moins deux rôles parmi les pools exploitables. Cela ne décrit pas le répertoire complet.</p>')).join('')+'</div>';
}
function duelPanel(team,home){
 const pair=DuelScouting.pair(team,home,duelRole,S.lineups,S.hasKey);
 const cached=pair?teamDuel.peek(pair.key):null;
 if(teamDuel.state.key!==(pair?.key||"")||(!teamDuel.state.loading&&teamDuel.state.loadedAt!==null&&!cached)){const filters=roleFilters.read(pair?.key,cached);duelPatch=filters.patch;duelChampion=filters.champion;duelChampionMode=filters.mode;duelSideChampions=filters.champions;}
 teamDuel.sync(pair?.key||"");
 if(!pair)return '<div class="panel team-duel"><p>Sélectionne une autre équipe pour comparer ses rapports SoloQ avec UWU GANG.</p></div>';
 const state=teamDuel.state,patches=DuelScouting.commonPatches(state.sides.map(s=>s?.report));
 if(duelPatch!=="ALL"&&!patches.includes(duelPatch))duelPatch="ALL";
 const champions=DuelScouting.commonChampions(state.sides.map(s=>s?.report),duelPatch);
 if(duelChampion!=="ALL"&&!champions.includes(duelChampion))duelChampion="ALL";
 const sideChoices=[0,1].map(i=>DuelScouting.championChoices(state.sides[i]?.report,duelPatch));
 duelSideChampions=duelSideChampions.map((c,i)=>c==="ALL"||sideChoices[i].includes(c)?c:"ALL");
 if(!state.loading)roleFilters.remember(pair.key,teamDuel.peek(pair.key),{patch:duelPatch,champion:duelChampion,mode:duelChampionMode,champions:duelSideChampions.slice()});
 const championPicker=`<label>Sélection des champions<select id="duelChampionMode" class="fullinput"><option value="COMMON" ${duelChampionMode==="COMMON"?"selected":""}>Champion commun</option><option value="SIDES" ${duelChampionMode==="SIDES"?"selected":""}>Un champion par joueur</option></select></label>`+(duelChampionMode==="SIDES"?pair.sides.map((side,i)=>`<label>Champion · ${esc(side.teamName)} · ${esc(side.player?.name||"Joueur non sélectionné")}<select id="duelSideChampion${i}" class="fullinput"><option value="ALL">Tous les champions retenus</option>${sideChoices[i].map(c=>`<option value="${esc(c)}" ${c===duelSideChampions[i]?"selected":""}>${esc(c)}</option>`).join("")}</select></label>`).join(""):`<label>Champion commun<select id="duelChampion" class="fullinput"><option value="ALL">Tous les champions retenus</option>${champions.map(c=>`<option value="${esc(c)}" ${c===duelChampion?"selected":""}>${esc(c)}</option>`).join("")}</select></label>`);
 const patchPicker=`<label>Périmètre des rapports<select id="duelPatch" class="fullinput"><option value="ALL">Toutes les parties retenues</option>${patches.map(p=>`<option value="${esc(p)}" ${duelPatch===p?"selected":""}>Patch commun ${esc(p)}</option>`).join("")}</select></label>`;
 return `<section id="team-comparator" class="panel team-duel team-section-anchor" tabindex="-1" aria-label="Comparateur détaillé par rôle"><div class="panel-title">COMPARATEUR SOLOQ PAR RÔLE · ${esc(team.name)} / UWU GANG</div><div class="team-filters"><label>Rôle à comparer<select id="duelRole" class="fullinput">${TeamScouting.roles.map(r=>`<option value="${r}" ${r===duelRole?"selected":""}>${r}</option>`).join("")}</select></label>${patchPicker}${championPicker}<button id="loadDuel" class="action primary" ${!pair.ready||state.loading?"disabled":""}>${state.loading?"Chargement des rapports…":state.loadedAt!==null?"Actualiser depuis Riot":"Comparer ce rôle"}</button></div><p class="sample-note">Les boutons de collecte relancent la lecture Riot sans réutiliser le cache disque des rapports ; les délais de quota restent respectés. Deux historiques SoloQ individuels au même rôle, pas des confrontations directes. Jusqu’à 12 parties retenues parmi les 20 dernières SoloQ de chaque compte ; périodes, patchs, champions et adversaires peuvent différer. Aucun pronostic de victoire ni conclusion de micro-gameplay. Les compositions locales sont utilisées sans confirmer des titulaires officiels. ${!S.hasKey?"Configure une clé Riot valide dans Réglages.":""}</p><p class="sample-note">Périmètre : ${duelPatch==="ALL"?"tous les patchs des parties retenues":`patch commun ${esc(duelPatch)} uniquement`}. ${duelChampionMode==="SIDES"?`Champions sélectionnés séparément : ${pair.sides.map((s,i)=>esc(s.teamName)+" — "+esc(duelChampionFor(i)==="ALL"?"tous ceux retenus":duelChampionFor(i))).join(" / ")}. Deux historiques sur des champions éventuellement différents, pas des parties jouées l’un contre l’autre ni un taux de victoire de matchup.`:`Champion commun : ${duelChampion==="ALL"?"tous ceux retenus":esc(duelChampion)}.`} Les filtres recalculent les deux rapports sans requête Riot supplémentaire ; chaque liste ne propose que les champions observés dans son périmètre. Si un choix devient indisponible après changement de patch, ce côté revient explicitement à tous les champions. Les adversaires, périodes et coéquipiers ne sont pas contrôlés. Les parties sans version exploitable restent uniquement dans « Toutes les parties ».</p>${state.reused?'<p class="sample-note">Rapports restaurés depuis la mémoire de cette session. Aucun appel Riot supplémentaire.</p>':""}${state.restoredAfterError?'<p class="sample-note" role="status"><b>RAPPORT PRÉCÉDENT RESTAURÉ APRÈS ÉCHEC</b> · Cette restauration n’est pas une actualisation réussie. Dates et expiration d’origine conservées ; aucune requête Riot.</p>':""}${teamDuel.canRestore()?'<p class="sample-note">Collecte échouée ou incomplète : une comparaison précédente reste récupérable avant son expiration et tant que tu restes sur ce rôle.</p><button id="restoreDuel" class="action">Revenir au rapport précédent (daté)</button>':""}${duelSynthesis(pair,state)}<div class="duel-columns">${pair.sides.map((side,i)=>{const stored=state.sides[i],result=stored?.report?{...stored,report:DuelScouting.scopeReport(stored.report,duelPatch,duelChampionFor(i))}:stored,a=side.account;return `<div><h3>${esc(side.teamName)} · ${esc(side.player?.name||"Joueur non sélectionné")}</h3><p>${esc(a?`${a.gameName}#${a.tagLine} · ${a.platform||"EUW1"}`:"Compte indisponible")} · ${side.manual?"composition locale":"seul joueur déclaré"}</p>${side.reason?`<p>${esc(side.reason)}</p>`:result?.error?`<p role="alert">${esc(result.error)}</p>`:result?.report?roleStatReport(result.report)+patchReport(result.report.patches):`<p>${state.loading?"Rapport en attente…":"Lance la comparaison pour charger les résultats mesurés."}</p>`}</div>`;}).join("")}</div></section>`;
}
function bindDuel(team,home){
 if($("#resetTeamFilters"))$("#resetTeamFilters").onclick=()=>{roleFilters.forget(roleMemories(team,home).map(e=>e.pair?.key));duelPatch="ALL";duelChampion="ALL";duelChampionMode="COMMON";duelSideChampions=["ALL","ALL"];render()};
 if($("#restoreDuel")){$("#restoreDuel").disabled=teamBatch.state.running;$("#restoreDuel").onclick=()=>{if(teamBatch.state.running)return;if(teamDuel.restorePrevious())render()};}
 if($("#draftPatch"))$("#draftPatch").onchange=e=>{draftPatch=e.target.value;render()};
 if($("#draftChampion"))$("#draftChampion").onchange=e=>{draftChampion=e.target.value;render();$("#draftChampion")?.focus({preventScroll:true})};
 if($("#loadTeamDuels"))$("#loadTeamDuels").onclick=()=>teamBatch.load(roleMemories(team,home).map(r=>r.pair),teamDuel,(account,role)=>window.mw.roleStats(account,role,false,true),()=>{if(view==="TEAMS")render()});
 if($("#refreshTeamDuels"))$("#refreshTeamDuels").onclick=()=>teamBatch.load(roleMemories(team,home).map(r=>r.pair),teamDuel,(account,role)=>window.mw.roleStats(account,role,false,true),()=>{if(view==="TEAMS")render()},{force:true});
 if($("#stopTeamDuels"))$("#stopTeamDuels").onclick=()=>{teamBatch.cancel();render()};
 if($("#duelChampionMode"))$("#duelChampionMode").onchange=e=>{duelChampionMode=e.target.value==="SIDES"?"SIDES":"COMMON";duelChampion="ALL";duelSideChampions=["ALL","ALL"];render()};
 [0,1].forEach(i=>{if($("#duelSideChampion"+i))$("#duelSideChampion"+i).onchange=e=>{duelSideChampions[i]=e.target.value;render()};});
 if($("#duelChampion"))$("#duelChampion").onchange=e=>{duelChampion=e.target.value;render()};
 document.querySelectorAll("[data-saved-role]").forEach(button=>button.onclick=()=>{duelRole=button.dataset.savedRole;render()});
 if($("#duelPatch"))$("#duelPatch").onchange=e=>{duelPatch=e.target.value;render()};
 if($("#duelRole"))$("#duelRole").onchange=e=>{duelRole=e.target.value;render()};
 if($("#loadDuel")){if(teamBatch.state.running)$("#loadDuel").disabled=true;$("#loadDuel").onclick=()=>{if(teamBatch.state.running)return;return teamDuel.load(DuelScouting.pair(team,home,duelRole,S.lineups,S.hasKey),(account,role)=>window.mw.roleStats(account,role,false,true),()=>{if(view==="TEAMS")render()});};}
}
function rankProgressPanel(team,home){
 const rosters=[team,...(home&&home.id!==team?.id?[home]:[])].filter(Boolean);
 return `<section id="team-rank-progress" class="panel group-board team-section-anchor" tabindex="-1" aria-label="Suivi des rangs SoloQ"><div class="panel-title">SUIVI DES RANGS SOLOQ</div><p class="sample-note">Priorité : joueurs sélectionnés par rôle dans l’équipe consultée, son effectif déclaré, puis UWU GANG, les joueurs visibles et le reste du groupe. Cinq comptes maximum par passe, cache de 15 min et délais Riot conservés. Ce suivi compte les joueurs déclarés, pas les cinq titulaires ni la couverture de la moyenne. ${!S.hasKey?'Configure une clé Riot valide dans Réglages.':''}</p>${rosters.map(t=>{const progress=TeamScouting.rankProgress(t.players),counts=Object.entries(progress.counts).filter(([,n])=>n).map(([key,n])=>`${n} ${progress.labels[key]}`).join(' · ');return `<h3>${esc(t.name)} · ${progress.total} joueurs déclarés</h3><p>${esc(counts||'Aucun joueur déclaré.')}</p><details><summary>Détail des rangs et blocages · ${esc(t.name)}</summary>${progress.rows.map(row=>`<p>${esc(row.player.role||'Rôle inconnu')} · ${esc(row.player.name)} : <b>${esc(row.label)}</b>${row.checkedAt?' · dernière vérification '+esc(new Date(row.checkedAt).toLocaleString('fr-FR')):''}</p>`).join('')}</details>`;}).join('')}<p class="sample-note">Un non-classé est confirmé uniquement par une réponse SoloQ sans rang. Une erreur n’est pas un non-classé ; ouvre la fiche du joueur pour vérifier son Riot ID. Les résultats partiels et périmés restent exclus de la moyenne. Valider une nouvelle clé ne revalide pas les anciens rangs en erreur : ils restent partiels jusqu’à une lecture SoloQ réussie.</p></section>`;
}
function groupBoardHtml(board){
 if(!board.known)return '<div id="team-group-ranks" class="panel group-board team-section-anchor" tabindex="-1" aria-label="Rangs moyens du groupe"><p>Groupe LEA non publié : comparaison du groupe indisponible.</p></div>';
 const reasons={...TeamScouting.rankReasons,selection_missing:"choix local absent de l’effectif",missing:"joueur absent",ambiguous:"titulaire non confirmé",account_missing:"compte absent",duplicate:"compte partagé",error:"erreur Riot",partial:"rang partiel",rank_missing:"rang absent / non classé",stale:"rang périmé"};
 return `<div id="team-group-ranks" class="panel group-board team-section-anchor" tabindex="-1" aria-label="Rangs moyens du groupe"><div class="panel-title">RANGS MOYENS DU GROUPE · ${esc(board.division)} · ${esc(board.group)}</div><p class="sample-note">Résumé des rangs SoloQ officiels, pas un classement du tournoi ni du MMR. Seules les équipes avec 5/5 rôles couverts sont ordonnées par moyenne ; les équipes incomplètes restent ensuite par ordre alphabétique. Les ex æquo partagent le même ordre.</p><div class="group-table-scroll"><table class="group-table"><thead><tr><th scope="col">Ordre SoloQ</th><th scope="col">Équipe</th><th scope="col">Moyenne observée</th><th scope="col">Couverture</th><th scope="col">Données exclues</th></tr></thead><tbody>${board.rows.map(({team,summary,position})=>`<tr class="${team.name.trim().toUpperCase()==="UWU GANG"?"home-team":""}"><td>${position??"—"}</td><td><button class="action" data-group-team="${esc(team.id)}">${esc(team.name)}</button></td><td>${esc(summary.label)}</td><td>${summary.covered}/5${summary.complete?" · COMPLET":" · PARTIEL"}${summary.slots.some(s=>s.manual)?" · COMPOSITION LOCALE":""}</td><td>${summary.slots.filter(s=>s.status!=="covered").map(s=>`${esc(s.role)} : ${esc(reasons[s.status]||"indisponible")}`).join(" · ")||"—"}</td></tr>`).join("")}</tbody></table></div><p class="sample-note">Exporter toutes les équipes de ce groupe, même masquées par la recherche, avec les cinq rôles et exclusions. Les rangs sont réévalués à la copie sans appel Riot.</p><button id="copyGroupRanks" class="action primary">Copier les rangs du groupe</button><details><summary>Aperçu des rangs du groupe</summary><pre id="groupRanksPreview"></pre></details></div>`;
}
function preparationPanel(team,home){
 const duels=preparationAnalyses(team,home);
 const filtered=duels.filter(a=>a.patch!=="ALL"||a.champion!=="ALL"||a.champions?.some(c=>c!=="ALL")).length;
 const scopes=duels.map(a=>'<li>'+esc(a.pair.role)+' · '+esc(a.patch==="ALL"?"tous les patchs":"patch "+a.patch)+' · '+(a.champions?a.pair.sides.map((s,i)=>esc(s.teamName)+' : '+esc(a.champions[i]==="ALL"?"tous les champions":a.champions[i])).join(' / '):'champion commun : '+esc(a.champion==="ALL"?"tous les champions":a.champion))+'</li>').join("");
 const text=ReportBuilder.build({team,home,lineups:S.lineups,version:S.version,ouat:S.ouat,duels,draftPatch});
 const brief=ReportBuilder.buildBrief({team,home,lineups:S.lineups,version:S.version,ouat:S.ouat,duels});
 return `<div id="team-preparation-report" class="panel preparation-report team-section-anchor" tabindex="-1" aria-label="Rapport de préparation"><div class="panel-title">RAPPORT DE PRÉPARATION D’ÉQUIPE</div><p>Copie un instantané des cinq rôles, rangs, exclusions et de toutes les analyses SoloQ mémorisées pour cette comparaison. Aucun nouvel appel Riot. Contient les Riot IDs publics et tes choix de composition locale ; aucune clé Riot.</p><div class="panel-title">PÉRIMÈTRES MÉMORISÉS · 5 RÔLES</div><p class="sample-note">${filtered}/5 rôles avec filtres actifs. Les choix de patch et champions sont conservés séparément pour chaque comparaison et rôle pendant la disponibilité des rapports en mémoire de session. Changer de rôle ne les efface plus ; l’export ci-dessous les reprend tous. Une nouvelle collecte ou une mémoire expirée peut les réinitialiser. Les vues globales et pools draft restent indépendants.</p><ul>${scopes||"<li>Aucun rapport mémorisé.</li>"}</ul><div class="panel-title">FICHE EXPRESS · 5 RÔLES</div><p class="sample-note">Résumé court des rangs datés, échantillons et trois champions observés par joueur. Suit les filtres mémorisés du comparateur, pas ceux des pools draft. Réévalué à la copie sans appel Riot ; sources complètes dans le rapport détaillé.</p><button id="copyTeamBrief" class="action primary">Copier la fiche express</button><details><summary>Aperçu de la fiche express</summary><pre id="teamBriefPreview">${esc(brief)}</pre></details><button id="resetTeamFilters" class="action">Réinitialiser les filtres des 5 rôles</button><button id="copyPreparation" class="action primary">Copier le rapport d’équipe</button><details><summary>Aperçu du texte à copier</summary><pre id="preparationPreview">${esc(text)}</pre></details></div>`;
}
function preparationAnalyses(team,home){
 return roleMemories(team,home).filter(x=>x.saved?.sides.some(s=>s?.report?.role===x.role)).map(({pair,saved,role})=>{const f=roleFilters.read(pair.key,saved);return {pair,reports:saved.sides.map(s=>s?.report),patch:f.patch,champion:f.champion,champions:f.mode==="SIDES"?f.champions:null,restoredAfterError:!!saved.restoredAfterError,loading:role===duelRole&&teamDuel.state.loading};});
}
function bindPreparation(team,home){
 const button=$("#copyPreparation");if(!button)return;
 button.onclick=async()=>{button.disabled=true;try{
  const teams=TeamScouting.group(allPlayers()),current=teams.find(t=>t.id===team?.id),currentHome=teams.find(t=>t.id===home?.id);
  if(!current)throw new Error('Équipe absente de l’effectif courant.');
  const text=ReportBuilder.build({team:current,home:currentHome,lineups:S.lineups,version:S.version,ouat:S.ouat,duels:preparationAnalyses(current,currentHome),draftPatch});
  $("#preparationPreview").textContent=text;await window.mw.copyReport(text);notice("Rapport copié. Rangs, compositions et rapports mémorisés réévalués au clic, sans appel Riot.");
 }catch(_){notice("Copie impossible. Vérifie l’effectif courant ou sélectionne le texte dans l’aperçu daté du rapport.")}finally{button.disabled=false}};
 const brief=$("#copyTeamBrief");if(!brief)return;
 brief.onclick=async()=>{brief.disabled=true;try{
  const teams=TeamScouting.group(allPlayers()),current=teams.find(t=>t.id===team?.id),currentHome=teams.find(t=>t.id===home?.id);
  if(!current)throw new Error('Équipe absente de l’effectif courant.');
  const text=ReportBuilder.buildBrief({team:current,home:currentHome,lineups:S.lineups,version:S.version,ouat:S.ouat,duels:preparationAnalyses(current,currentHome)});
  $("#teamBriefPreview").textContent=text;await window.mw.copyReport(text);notice("Fiche express copiée. Rangs et rapports mémorisés réévalués au clic, sans appel Riot.");
 }catch(_){notice("Fiche express non copiée. Vérifie l’effectif courant ou sélectionne le texte dans l’aperçu daté.")}finally{brief.disabled=false}};
}
function bindGroupRanks(team){
 const button=$("#copyGroupRanks"),preview=$("#groupRanksPreview");if(!button||!preview)return;
 const snapshot=()=>ReportBuilder.buildGroup({teams:TeamScouting.group(allPlayers()),selectedId:team.id,lineups:S.lineups,version:S.version,ouat:S.ouat});
 preview.textContent=snapshot();
 button.onclick=async()=>{button.disabled=true;try{const text=snapshot();preview.textContent=text;await window.mw.copyReport(text);notice("Rangs du groupe copiés. Instantané daté, sans nouvelle collecte Riot.")}catch(_){notice("Copie impossible. Sélectionne le texte dans l’aperçu, ou vérifie que le groupe LEA est disponible.")}finally{button.disabled=false}};
}
function rankComparisonPanel(team,home){
 const comparison=TeamScouting.rankComparison(team,home,Date.now(),S.lineups);if(!comparison)return '';
 const date=v=>Number.isFinite(v)&&v>0&&v<=Date.now()&&Number.isFinite(new Date(v).getTime())?new Date(v).toLocaleString('fr-FR'):'date indisponible';
 const sideHtml=side=>'<b>'+esc(side.player?.name||'Joueur non sélectionné')+'</b><p>'+esc(side.player?playerRankLabel(side.player)||rankPlaceholder(side.player):'Rang indisponible')+'</p><small>'+esc(TeamScouting.rankReasons[side.status]||'indisponible')+' · '+(side.manual?'composition locale, non confirmée LEA':'effectif déclaré, titularisation non confirmée')+'<br>Vérifié : '+esc(date(side.checkedAt))+'</small>';
 return '<section id="team-paired-ranks" class="panel group-board team-section-anchor" tabindex="-1" aria-label="Comparaison des rangs sur les mêmes rôles"><div class="panel-title">RANGS COMPARÉS · MÊMES RÔLES</div><p>'+comparison.covered+'/5 rôles communs exploitables'+(comparison.complete?' · COMPLET':' · PARTIEL')+' : '+esc(comparison.roles.join(', ')||'aucun')+'</p><p>'+esc(team.name)+' : '+esc(comparison.means[0].label)+'<br>'+esc(home.name)+' : '+esc(comparison.means[1].label)+'</p><p class="sample-note">Ces deux moyennes utilisent uniquement les mêmes rôles avec un rang complet de moins de 15 min des deux côtés. Un rôle indisponible d’un côté est retiré des deux moyennes ; un compte présent dans les deux équipes est exclu. Les moyennes individuelles au-dessus et le tableau du groupe restent indépendants. Pas le MMR, pas un pronostic de match. Conversion : 100 points/division, 400/palier + LP ; Master/Grandmaster/Challenger = base Master + LP. Aucune nouvelle requête Riot.</p><div class="group-table-scroll"><table class="group-table"><caption>Rangs SoloQ officiels disponibles · périmètre commun</caption><thead><tr><th>Rôle</th><th>'+esc(team.name)+'</th><th>'+esc(home.name)+'</th><th>Dans les deux moyennes</th></tr></thead><tbody>'+comparison.rows.map(row=>'<tr><th scope="row">'+row.role+'</th>'+row.sides.map(side=>'<td>'+sideHtml(side)+'</td>').join('')+'<td>'+(row.included?'INCLUS':'EXCLU DES DEUX MOYENNES')+'</td></tr>').join('')+'</tbody></table></div></section>';
}
function teamWorkspaceNav(team,home){
 if(!team)return '';
 const sections=[['team-roster','Effectifs et rangs'],['team-rank-progress','Suivi Riot'],['team-group-ranks','Rangs du groupe']];
 if(home&&home.id!==team.id)sections.push(['team-paired-ranks','Rangs comparés'],['team-draft-pools','Pools draft'],['team-overview','Vue des 5 rôles'],['team-comparator','Comparateur détaillé']);
 if(home&&home.id!==team.id)sections.push(['team-champion-lookup','Retrouver un champion']);
 sections.push(['team-preparation-report','Rapport à copier']);
 return '<nav id="team-preparation-nav" class="panel team-workspace-nav team-section-anchor" aria-label="Sommaire de préparation d’équipe" tabindex="-1"><div class="panel-title">PRÉPARATION · '+esc(team.name)+'</div><p class="sample-note">Commence par les effectifs et les choix de composition, puis accède directement au groupe, aux analyses chargées ou au rapport. Ces liens ne lancent aucune collecte Riot.</p><div class="team-workspace-links">'+sections.map(([id,label])=>'<a href="#'+id+'">'+label+'</a>').join('')+'</div></nav>';
}
function renderTeamSection(){
 $("#sort").hidden=true;$("#liveOnly").hidden=true;
 const teams=TeamScouting.group(allPlayers()),q=$("#qTop").value.trim().toLowerCase();
 const divisions=[...new Set(teams.map(t=>t.division))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 const inDivision=teams.filter(t=>teamDivision==="ALL"||t.division===teamDivision),groups=[...new Set(inDivision.map(t=>t.group))].sort();
 if(teamGroup!=="ALL"&&!groups.includes(teamGroup))teamGroup="ALL";
 const visible=inDivision.filter(t=>(teamGroup==="ALL"||t.group===teamGroup)&&(!q||t.name.toLowerCase().includes(q)||t.players.some(p=>queryMatch(p,q))));
 const home=teams.find(t=>t.name.trim().toUpperCase()==="UWU GANG");
 if(!visible.some(t=>t.id===selectedTeam))selectedTeam=visible.find(t=>t.id===home?.id)?.id||visible[0]?.id||"";
 const team=visible.find(t=>t.id===selectedTeam),summary=team?TeamScouting.summarize(team.players,Date.now(),TeamScouting.lineup(S.lineups,team.id)):null,homeSummary=home?TeamScouting.summarize(home.players,Date.now(),TeamScouting.lineup(S.lineups,home.id)):null;
 const option=(value,label,selected)=>`<option value="${esc(value)}" ${value===selected?"selected":""}>${esc(label)}</option>`;
 $("#hero").innerHTML=`<div class="panel"><div class="panel-title">SCOUTING D’ÉQUIPE · TOP / JUNGLE / MID / ADC / SUPPORT</div><div class="team-filters"><label>Division<select id="teamDivision" class="fullinput">${option("ALL","Toutes divisions",teamDivision)+divisions.map(d=>option(d,d,teamDivision)).join("")}</select></label><label>Groupe<select id="teamGroup" class="fullinput">${option("ALL","Tous groupes",teamGroup)+groups.map(g=>option(g,g,teamGroup)).join("")}</select></label><label>Équipe<select id="teamSelect" class="fullinput">${visible.map(t=>option(t.id,t.name,selectedTeam)).join("")}</select></label></div><p class="sample-note">LIVE : équipe sélectionnée et UWU GANG prioritaires, huit joueurs maximum par passe. Un statut de plus de deux minutes devient « à revérifier », pas « hors ligne ». Les délais Riot peuvent ralentir le suivi. Effectifs LEA · ${esc(S.ouat.season||"")} · ${S.ouat.updatedAt?esc(new Date(S.ouat.updatedAt).toLocaleString("fr-FR")):"date inconnue"}. ${esc(S.ouat.warning||"")} Les rôles LEA ne garantissent pas une composition titulaire. Plusieurs joueurs au même rôle restent affichés. Choisis une composition locale pour les moyennes et la comparaison : ce choix personnel ne confirme pas les titulaires officiels LEA.</p></div>`;
 if(home&&home.division!=="Sans division"&&home.group!=="Groupe non publié"){
  $("#hero").innerHTML+='<button id="uwuGroup" class="action primary">Voir le groupe d’UWU GANG</button>';
  $("#uwuGroup").onclick=()=>{teamDivision=home.division;teamGroup=home.group;selectedTeam=home.id;$("#qTop").value="";render();refreshRanks()};
 }
 $("#teamDivision").onchange=e=>{teamDivision=e.target.value;teamGroup="ALL";render();refreshRanks()};
 $("#teamGroup").onchange=e=>{teamGroup=e.target.value;render();refreshRanks()};
 $("#teamSelect").onchange=e=>{selectedTeam=e.target.value;render();refreshRanks()};
 $("#sectionTitle").textContent=team?`${team.name} · ${team.division} · ${team.group}`:"Aucune équipe";
 $("#summary").textContent=`${visible.length} équipes · ${allPlayers().length} joueurs OUAT`;
 if(!team){teamBatch.cancel();teamDuel.cancel();$("#grid").innerHTML='<div class="panel">Aucune équipe ne correspond aux filtres.</div>';return;}
 const rosterRows=(roster,compare=false)=>TeamScouting.roles.map(role=>{
  const ps=roster.players.filter(p=>p.role===role),selection=TeamScouting.lineup(S.lineups,roster.id),chosen=selection[role];
  const picker=`<label class="lineup-picker">Composition locale · ${role}<select class="fullinput" data-lineup-team="${esc(roster.id)}" data-lineup-role="${role}"><option value="">${ps.length===1?"Automatique · seul joueur déclaré":"Aucun choix · rôle exclu"}</option>${chosen&&!ps.some(p=>p.id===chosen)?`<option value="${esc(chosen)}" selected>Choix précédent absent · à revoir</option>`:""}${ps.map(p=>`<option value="${esc(p.id)}" ${chosen===p.id?"selected":""}>${esc(p.name)} · choix personnel</option>`).join("")}</select></label>`;
  return `<div class="team-role"><b>${role}</b><div>${picker}${chosen?'<small>COMPOSITION LOCALE · non confirmée par LEA</small>':""}${ps.length?ps.map(p=>`<button class="team-player" data-team-player="${esc(p.id)}"><strong>${esc(p.name)}</strong><span>${esc(playerRankLabel(p)||rankPlaceholder(p))}</span>${rankDateHtml(p)}<small>${esc(LiveMonitor.label(p))}${p.liveCheckedAt?" · vérifié à "+esc(new Date(p.liveCheckedAt).toLocaleTimeString("fr-FR")):""}</small><small>${esc((scoutingAccount(p)?.gameName||"Compte non relié")+(scoutingAccount(p)?.tagLine?"#"+scoutingAccount(p).tagLine:""))}</small></button>`).join(""):"<p>Joueur non renseigné par LEA</p>"}${ps.length>1?'<small>Plusieurs joueurs déclarés · titulaire non confirmé</small>':""}</div></div>`;
 }).join("");
 const average=(s)=>`${esc(s.label)} · ${s.covered}/5 rôles couverts${s.complete?"":" · MOYENNE PARTIELLE"}`;
 $("#grid").innerHTML=`<div id="team-roster" class="team-scouting team-section-anchor" tabindex="-1" aria-label="Effectifs et rangs des cinq rôles"><div class="panel"><div class="panel-title">RANG SOLOQ MOYEN OBSERVÉ</div><h2>${average(summary)}</h2><p class="sample-note">Résumé descriptif des rangs officiels : 100 points par division, 400 par palier, plus les LP ; Master/Grandmaster/Challenger partagent la base Master + LP. Ce n’est pas le MMR. Un seul joueur déclaré ou choisi localement par rôle, compte distinct, rang complet vérifié depuis moins de 15 min. Rangs manquants, partiels ou périmés exclus. ${summary.excluded} rôle(s) exclu(s). Une moyenne partielle ne représente pas les cinq joueurs.</p></div><div class="team-columns"><div class="panel"><div class="panel-title">${esc(team.name)}</div>${rosterRows(team)}</div><div class="panel"><div class="panel-title">COMPARAISON · UWU GANG</div>${home?`<p>${average(homeSummary)}</p>${home.id===team.id?"<p>Sélectionne une autre équipe pour comparer les effectifs.</p>":rosterRows(home)}`:"<p>UWU GANG introuvable dans l’effectif LEA chargé. Aucune composition inventée.</p>"}</div></div></div>`;
 const duelHtml=duelPanel(team,home);
 $("#grid").innerHTML=teamWorkspaceNav(team,home)+$("#grid").innerHTML+rankComparisonPanel(team,home)+rankProgressPanel(team,home)+groupBoardHtml(TeamScouting.groupBoard(teams,team.id,Date.now(),S.lineups))+draftPoolPanel(team,home)+preparationPanel(team,home)+roleMemoryPanel(team,home)+teamOverviewPanel(team,home)+duelHtml;
 $("#grid").innerHTML+=draftChampionPanel(team,home);
 bindDuel(team,home);bindPreparation(team,home);bindGroupRanks(team);
 document.querySelectorAll("[data-lineup-team]").forEach(select=>select.onchange=async()=>{select.disabled=true;try{S.lineups=await window.mw.setLineup(select.dataset.lineupTeam,select.dataset.lineupRole,select.value);render();refreshRanks()}catch(e){notice("Composition non enregistrée : "+String(e.message||e));render()}});
 document.querySelectorAll("[data-team-player]").forEach(b=>b.onclick=()=>openPlayer(b.dataset.teamPlayer));
 document.querySelectorAll("[data-group-team]").forEach(b=>b.onclick=()=>{const t=teams.find(t=>t.id===b.dataset.groupTeam);if(!t)return;selectedTeam=t.id;teamDivision=t.division;teamGroup=t.group;$("#qTop").value="";render();refreshRanks()});
}

function render(){
  const [ey,title,sub]=titles();$("#eyebrow").textContent=ey;$("#title").textContent=title;$("#sub").textContent=sub;
  if(view==="TEAMS"){renderTeamSection();status();return}
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
  $("#apiText").textContent=!S.hasKey?"Riot API à configurer":Date.now()<rankCooldownAt?`Riot API limitée · reprise dans ${Math.max(1,Math.ceil((rankCooldownAt-Date.now())/1000))} s`:"Riot API connectée";
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
  $("#drawer").innerHTML=`<div class="drawer-header"><div><div class="drawer-kicker">${esc(p.region)} · ${esc(p.role||"MID")}</div><h2>${esc(p.name)}</h2><div class="drawer-team">${esc(p.team)}</div></div><button class="drawer-close">✕</button></div><div class="panel"><span class="spinner">↻</span> Chargement…</div>`;
  $(".drawer-close").onclick=closeDrawer;

  if(request!==drawerRequest)return;
  drawPlayer(p);
  if(scoutingAccount(p)&&S.hasKey){
    try{
      if(p.role&&p.role!=="MID"){const stats=await window.mw.roleStats(scoutingAccount(p),p.role);if(request!==drawerRequest)return;const anchor=$("#scout-live");if(anchor)anchor.innerHTML=roleStatReport(stats)+patchReport(stats.patches);return;}
      const stats=await window.mw.stats(scoutingAccount(p));if(request!==drawerRequest)return;
      const anchor=$("#scout-live");if(anchor)anchor.innerHTML=statReport(stats)+championLaneReport(stats.championLanes)+championTransitionReport(stats.championTransitions)+opponentLaneReport(stats.opponentLanes)+opponentTransitionReport(stats.opponentTransitions)+matchupReport(stats.matchups)+patchReport(stats.patches);
    }catch(e){
      if(request!==drawerRequest)return;const anchor=$("#scout-live");
      if(anchor)anchor.innerHTML=`<div class="panel"><div class="panel-title">PERFORMANCE RÉCENTE</div><p class="helper">${esc(String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,""))}</p></div>`;
    }
  }
}
function patchReport(patches=[]){
  if(!patches.length)return"";
  const role=patches[0]?.role||"MID";
  const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="panel"><div class="panel-title">PERFORMANCE PAR PATCH</div><div class="champions">${patches.map(p=>{const pool=(p.champions||[]).map(c=>`${esc(c.name)} ${esc(c.games)}G`).join(" · "),c=p.comparison;return`<span class="champ"><b>PATCH ${esc(p.patch)}</b> · ${esc(p.games)}G · ${esc(p.winrate)}% WR${confidenceLabel(p.interval)} · ${esc(p.kda)} KDA · K/D/A MOYEN ${esc(p.avgKills)}/${esc(p.avgDeaths)}/${esc(p.avgAssists)}${pool?`<small>CHAMPIONS · ${pool}</small>`:""}${p.limited?" · ÉCHANTILLON FAIBLE":""}${c?`<small>VS PATCH OBSERVÉ ${esc(c.previousPatch)} · Δ WR ${esc(signed(c.winrateDelta))} points · Δ KDA ${esc(signed(c.kdaDelta))} · ${esc(c.currentGames)}G vs ${esc(c.previousGames)}G${c.limited?" · ÉCHANTILLON FAIBLE":""}</small>`:""}</span>`}).join("")}</div><p class="sample-note">Chaque version utilise son propre échantillon de parties SoloQ au rôle ${esc(role)}. La comparaison porte sur le patch observé précédent, qui n’est pas forcément la version Riot immédiatement précédente. Le pool de champions et le contexte peuvent différer ; les écarts restent descriptifs et ne prouvent pas un effet du patch.</p></div>`;
}
function championLaneReport(rows=[]){
  if(!rows.length)return"";const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="panel"><div class="panel-title">LANE À 10 PAR CHAMPION JOUÉ</div><div class="champions">${rows.map(r=>`<span class="champ"><b>${esc(r.champion)} · ${esc(r.games)}G</b> · ΔCS ${esc(signed(r.csDiff))} · ΔOR ${esc(signed(r.goldDiff))} · ΔXP ${esc(signed(r.xpDiff))} · MORT ${esc(r.deathRate)}%${confidenceLabel(r.deathInterval)}${r.limited?" · ÉCHANTILLON FAIBLE":""}</span>`).join("")}</div><p class="sample-note">Comparaison descriptive des snapshots complets à 10:00 face au mid adverse identifié. Chaque champion a son propre échantillon ; l’IC95 de Wilson montre l’incertitude de sa fréquence de mort. Ces écarts n’expliquent ni la cause ni la qualité du micro-gameplay.</p></div>`;
}
function championTransitionReport(rows=[]){
  if(!rows.length)return"";const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="panel"><div class="panel-title">PROGRESSION 5 → 10 PAR CHAMPION</div><div class="champions">${rows.map(r=>`<span class="champ"><b>${esc(r.champion)} · ${esc(r.games)}G</b> · VAR ΔCS ${esc(signed(r.csSwing))} · VAR ΔOR ${esc(signed(r.goldSwing))} · VAR ΔXP ${esc(signed(r.xpSwing))} · OR AMÉLIORÉ ${esc(r.goldImprovedRate)}%${r.limited?" · ÉCHANTILLON FAIBLE":""}</span>`).join("")}</div><p class="sample-note">Chaque champion utilise uniquement les parties avec snapshots complets appariés à 5:00 et 10:00. Une variation positive signifie que l’écart relatif face au mid adverse a augmenté ; elle ne prouve ni un effet du champion ni la qualité du micro-gameplay.</p></div>`;
}
function opponentLaneReport(rows=[]){
  if(!rows.length)return"";const signed=n=>`${n>0?"+":""}${n}`;
  return`<div class="panel"><div class="panel-title">LANE À 10 PAR CHAMPION ADVERSE</div><div class="champions">${rows.map(r=>`<span class="champ"><b>VS ${esc(r.champion)} · ${esc(r.games)}G</b> · ΔCS ${esc(signed(r.csDiff))} · ΔOR ${esc(signed(r.goldDiff))} · ΔXP ${esc(signed(r.xpDiff))} · MORT ${esc(r.deathRate)}%${confidenceLabel(r.deathInterval)}${r.limited?" · ÉCHANTILLON FAIBLE":""}</span>`).join("")}</div><p class="sample-note">Snapshots complets à 10:00 face au mid adverse identifié. Chaque champion adverse a son propre échantillon ; l’IC95 de Wilson montre l’incertitude de sa fréquence de mort. Ces écarts décrivent les parties observées et ne prouvent ni la cause du matchup ni la qualité du micro-gameplay.</p></div>`;
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
function accountHtml(a,i,p){
  const live=a.isLive||sameRiotAccount(a,p.liveAccount);
  return`<div class="account"><div class="account-head"><div><b>${esc(a.gameName||"Compte")}#${esc(a.tagLine||"?")}</b><small>${esc(a.platform||"")}</small></div><span class="tag ${live?"live":"rank"}">${live?"● LIVE":esc(rankLabel(a.rank)||"CHECK")}</span></div><div class="account-actions"><button class="action" data-check="${i}">CHECK RIOT</button><button class="action live" data-spec="${i}">▶ SPECTATE</button></div><div id="res-${i}"></div></div>`;
}
function coverageReport(c={},normalization={}){
  const role=c.role?esc(c.role):"mid";
  if(!c.requested&&!c.historyEntries)return"";
  const integrity=[['duplicateIds','identifiant(s) répété(s) ignoré(s)'],['invalidIds','entrée(s) d’historique invalide(s) ignorée(s)'],['identityErrors','réponse(s) avec identité incohérente exclue(s)']].filter(([k])=>Number.isInteger(c[k])&&c[k]>0).map(([k,label])=>esc(c[k])+' '+label).join(' · ');
  const reason=c.stop==="rate_limit"?" · collecte arrêtée par la limite Riot":c.stop==="auth"?" · clé Riot refusée":c.targetReached?` · objectif de ${esc(c.target)} parties ${role} atteint`:"";
  const timelines=c.timelineAttempts?` · timelines ${c.timelinesLoaded}/${c.timelineAttempts}`:"";
  return`<p class="sample-note"><b>${c.partial?"ÉCHANTILLON PARTIEL":"COUVERTURE CONTRÔLÉE"}</b> · historique chargé ${c.matchesLoaded}/${c.requested} · parties ${role} ${c.roleGames??c.midGames}${c.invalidGames?` · ${esc(c.invalidGames)} partie(s) incomplète(s) exclue(s)`:""}${integrity?` · INTÉGRITÉ DES PARTIES (collecte d’origine, avant filtres) : ${integrity}`:""}${timelines}${reason}${normalization.games?` · Convention Riot : ${esc(normalization.fields)} champ(s) numérique(s) omis traité(s) à zéro dans ${esc(normalization.games)} partie(s) de cet échantillon ; valeurs nulles ou invalides exclues`:""}</p>`;
}
function roleStatReport(s={}){
 const role=s.role||"RÔLE INCONNU";
 const header=`<div class="panel scouting"><div class="panel-title">SCOUTING SOLOQ · ${esc(role)} · ${esc(s.games||0)} PARTIES${s.limited?" · ÉCHANTILLON FAIBLE":""}</div>${coverageReport(s.coverage,s.normalization)}${sampleWindowReport(s.window)}`;
 if(!s.games)return header+`<p>Aucune partie SoloQ exploitable au rôle ${esc(role)} dans l’historique chargé.</p></div>`;
 const metrics=[[`${s.winrate}%`,'WIN RATE'+confidenceLabel(s.interval)],[s.kda,'KDA'],[`${s.kills}/${s.deaths}/${s.assists}`,'K/D/A MOYEN'],[s.cspm,'CS/MIN'],[s.dpm,'DÉGÂTS/MIN'],[s.gpm,'OR/MIN'],[s.vision,'VISION/PARTIE']];
 return header+`<div class="stats-grid">${metrics.map(([value,label])=>`<div><b>${esc(value)}</b><span>${label}</span></div>`).join("")}</div><div class="panel-title">CHAMPIONS JOUÉS · ${esc(role)}</div><div class="champions">${(s.champions||[]).map(c=>`<span class="champ"><b>${esc(c.name)}</b> · ${esc(c.games)}G · ${esc(c.winrate)}% WR${confidenceLabel(c.interval)}</span>`).join("")}</div><p class="sample-note">Seules les parties SoloQ au rôle ${esc(role)} identifié par Riot sont retenues. CS, dégâts et or sont pondérés par le temps joué ; vision et K/D/A sont des moyennes par partie. Aucun seuil mid n’est appliqué aux autres rôles : un faible CS de support n’est pas une faiblesse déduite. Ces mesures ne décrivent ni les déplacements ni la qualité du micro-gameplay. Les timelines de lane et les habitudes précoces restent réservées au rapport mid.</p>${matchEvidenceReport(s)}</div>`;
}
function matchEvidenceReport(s={}){
 const role=s.role||"MID",rows=(Array.isArray(s.evidence)?s.evidence:[]).filter(r=>r&&r.role===role&&typeof r.win==="boolean").slice(0,30);
 if(!s.games)return "";
 if(!rows.length)return '<p class="sample-note">Parties sources indisponibles dans ce rapport ancien. Actualise la collecte pour les consulter.</p>';
 const date=v=>Number.isFinite(v)&&v>0&&Number.isFinite(new Date(v).getTime())?new Date(v).toLocaleString("fr-FR"):"Date indisponible";
 const duration=v=>Number.isFinite(v)&&v>0?Math.floor(v/60)+":"+String(Math.floor(v%60)).padStart(2,"0"):"Durée indisponible";
 return '<details class="match-evidence"><summary>Parties sources · '+rows.length+'/'+esc(s.games)+' · '+esc(role)+'</summary><p class="sample-note">Parties SoloQ retenues uniquement, dans l’ordre de la collecte. Les filtres patch/champion s’appliquent à cette liste. Aucun nouvel appel Riot. K/D/A et durée décrivent ces parties, pas le micro-gameplay ; aucune partie personnalisée.</p><div class="group-table-scroll"><table class="group-table"><caption>Sources Match-v5 de cet échantillon</caption><thead><tr><th>Date / identifiant</th><th>Champion</th><th>Patch</th><th>Résultat</th><th>Temps joué</th><th>K/D/A</th><th>Convention Riot</th></tr></thead><tbody>'+rows.map(m=>'<tr><td>'+esc(date(m.startedAt))+'<small>'+esc(typeof m.matchId==="string"&&/^[A-Z0-9]+_[0-9]+$/.test(m.matchId)?m.matchId:"Identifiant indisponible")+'</small></td><td>'+esc(m.champion||"Champion indisponible")+'</td><td>'+esc(m.patch||"Indisponible")+'</td><td>'+(m.win?"Victoire":"Défaite")+'</td><td>'+esc(duration(m.seconds))+'</td><td>'+[m.kills,m.deaths,m.assists].map(v=>Number.isFinite(v)&&v>=0?esc(v):"—").join("/")+'</td><td>'+esc(Array.isArray(m.omittedStats)&&m.omittedStats.length?m.omittedStats.join(", ")+" : omis → zéro":"Aucun compteur omis")+'</td></tr>').join("")+'</tbody></table></div></details>';
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
  return laneFiveReport(e.lane5)+laneTransitionReport(e.laneTransition)+`<div class="lane-panel"><div class="lane-head"><small>HABITUDES 0 → 5 / 5 → 10</small><span>${e.games} timeline${e.games>1?"s":""}${e.limited?" · échantillon faible":""}</span></div><div class="lane-stats"><div><b>${before.takedownRate??"—"}${Number.isFinite(before.takedownRate)?"%":""}</b><span>0→5 · PARTIES AVEC TAKEDOWN${confidenceLabel(before.takedownInterval)}</span></div><div><b>${before.takedowns??"—"}</b><span>0→5 · TAKEDOWNS/GAME</span></div><div><b>${before.deathRate??"—"}${Number.isFinite(before.deathRate)?"%":""}</b><span>0→5 · PARTIES AVEC MORT${confidenceLabel(before.deathInterval)}</span></div><div><b>${after.takedownRate??"—"}${Number.isFinite(after.takedownRate)?"%":""}</b><span>5→10 · PARTIES AVEC TAKEDOWN${confidenceLabel(after.takedownInterval)}</span></div><div><b>${after.takedowns??"—"}</b><span>5→10 · TAKEDOWNS/GAME</span></div><div><b>${after.deathRate??"—"}${Number.isFinite(after.deathRate)?"%":""}</b><span>5→10 · PARTIES AVEC MORT${confidenceLabel(after.deathInterval)}</span></div><div><b>${ward}</b><span>1ER WARD · ${e.wardGames}/${e.games}</span></div></div><p>Événements Riot répartis sans double comptage : 5:00 appartient à 0→5 et 10:00 à 5→10. Les IC95 de Wilson montrent l’incertitude de chaque fréquence sur le même échantillon de timelines ; ces valeurs descriptives n’indiquent ni la position, ni la cause, ni la qualité du micro-gameplay.</p></div>`;
}
function statReport(s){if(!s||!s.games)return`<div class="panel"><div class="panel-title">PERFORMANCE RÉCENTE</div><p class="helper">Pas assez de matchs Riot disponibles pour calculer les statistiques.</p>${coverageReport(s?.coverage,s?.normalization)}</div>`;const sig=(s.champions||[]).slice(0,3),l=s.lane10||{};let strengths=[],weak=[];if(s.interval?.low>=50)strengths.push(`Forme positive étayée (${s.winrate}% WR)`);if(s.kda>=3)strengths.push(`KDA solide (${s.kda})`);if(s.cspm>=7)strengths.push(`Farm élevé (${s.cspm} CS/min)`);if(s.dpm>=650)strengths.push(`Forte pression dégâts (${s.dpm} DPM)`);if(s.interval?.high<50)weak.push(`Forme récente négative étayée (${s.winrate}% WR)`);if(s.deaths>=6)weak.push(`Mortalité élevée (${s.deaths}/game)`);if(s.cspm<6)weak.push(`Farm récent limité (${s.cspm} CS/min)`);const signed=n=>`${n>0?"+":""}${n}`,freshness=s.cachedAt?" · cache récent":"";return`<div class="panel scouting"><div class="panel-title">SCOUTING · ${s.games} DERNIÈRES GAMES${freshness}</div>${coverageReport(s.coverage,s.normalization)}${sampleWindowReport(s.window)}<div class="stats-grid"><div><b>${s.winrate}%</b><span>WIN RATE${confidenceLabel(s.interval)}</span></div><div><b>${s.kda}</b><span>KDA</span></div><div><b>${s.cspm}</b><span>CS/MIN</span></div><div><b>${s.dpm}</b><span>DPM</span></div><div><b>${s.gpm}</b><span>GOLD/MIN</span></div><div><b>${s.vision}</b><span>VISION/GAME</span></div></div>${l.games?`<div class="lane-panel"><div class="lane-head"><small>LANE À 10 MINUTES</small><span>${l.games} match${l.games>1?"s":""} comparable${l.games>1?"s":""}${l.games<3?" · échantillon faible":""}</span></div><div class="lane-stats"><div><b>${l.cs}</b><span>CS@10</span></div><div><b class="${l.csDiff>=0?"up":"down"}">${signed(l.csDiff)}</b><span>Δ CS MOYEN</span></div><div><b class="${l.goldDiff>=0?"up":"down"}">${signed(l.goldDiff)}</b><span>Δ OR MOYEN</span></div><div><b class="${l.xpDiff>=0?"up":"down"}">${signed(l.xpDiff)}</b><span>Δ XP MOYEN</span></div>${Number.isFinite(l.medianGoldDiff)?`<div><b class="${l.medianGoldDiff>=0?"up":"down"}">${signed(l.medianGoldDiff)}</b><span>MÉDIANE Δ OR</span></div>`:""}${Number.isFinite(l.goldAheadRate)?`<div><b>${l.goldAheadRate}%</b><span>DEVANT EN OR${confidenceLabel(l.goldAheadInterval)}</span></div>`:""}<div><b>${l.deathRate}%</b><span>MORT AVANT 10${confidenceLabel(l.deathInterval)}</span></div></div><p>Moyennes, médiane et fréquences mesurées sur les mêmes snapshots Riot complets. « Devant » signifie strictement plus d’or que le mid adverse à 10:00 ; les IC95 de Wilson montrent l’incertitude des fréquences. Ces valeurs n’expliquent pas la cause de l’écart.</p></div>`:`<p class="sample-note">Lane@10 indisponible : aucun match récent avec timeline et mid adverse identifiables.</p>`}${earlyReport(s.early)}<div class="scout-grid"><div><small>FORCES</small>${strengths.map(x=>`<p>+ ${esc(x)}</p>`).join("")||"<p>— Pas de signal fort</p>"}</div><div><small>POINTS À SURVEILLER</small>${weak.map(x=>`<p>− ${esc(x)}</p>`).join("")||"<p>— Pas de faiblesse statistique nette</p>"}</div></div>${sig.length?`<div class="signature"><small>CHAMPIONS SIGNATURES RÉCENTS</small><b>${sig.map(x=>`${esc(x.name)} · ${x.games}G · ${x.winrate}%${confidenceLabel(x.interval)}`).join(" &nbsp; / &nbsp; ")}</b></div>`:""}${s.habits?.length?`<div class="habit-block"><small>TENDANCES STATISTIQUES</small>${s.habits.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`:""}<p class="sample-note">Échantillon : ${s.games} parties récentes. IC95 de Wilson : incertitude d’échantillonnage, pas une prédiction. Signaux descriptifs, pas une évaluation vidéo du gameplay.</p>${matchEvidenceReport(s)}</div>`}function scoutReport(p){const r=p.bestRank||{},cs=(p.lastChampions||[]).slice(0,5),top=cs.slice(0,3).map(x=>x.championName||x.champion_name).filter(Boolean);const score=rankScore(p);let strengths=[],weak=[];if(score>=900000)strengths.push("Très haut niveau SoloQ","Mécaniques et rythme de jeu à surveiller");else if(score>=700000)strengths.push("Niveau SoloQ solide");else weak.push("Elo inférieur aux profils les mieux classés");if(top.length)strengths.push("Pool identifié : "+top.join(", "));else weak.push("Peu de données champion disponibles");if((p.accounts||[]).length)strengths.push("Compte Riot suivi");else weak.push("Compte Riot non relié");return`<div class="panel scouting"><div class="panel-title">SCOUTING REPORT</div><div class="scout-grid"><div><small>FORCES</small>${strengths.map(x=>`<p>+ ${esc(x)}</p>`).join("")||"<p>— Données insuffisantes</p>"}</div><div><small>POINTS À SURVEILLER</small>${weak.map(x=>`<p>− ${esc(x)}</p>`).join("")||"<p>— Aucun signal faible détecté</p>"}</div></div>${top.length?`<div class="signature"><small>CHAMPIONS SIGNATURES</small><b>${esc(top.join(" · "))}</b></div>`:""}</div>`}function champHtml(p){const cs=(p.lastChampions||[]).slice(0,5);if(!cs.length)return"";return`<div class="panel"><div class="panel-title">RECENT CHAMPIONS</div><div class="champions">${cs.map(c=>`<span class="champ"><b>${esc(c.championName||c.champion_name||"?")}</b> · ${esc(c.games||0)} games</span>`).join("")}</div></div>`}
function scoutingPanel(p){
  const account=scoutingAccount(p);
  const message=!account?"Aucun compte Riot public relié : statistiques indisponibles.":!S.hasKey?"Configure une clé Riot valide dans Réglages pour charger les statistiques.":"Analyse des matchs Riot récents…";
  return `<div id="scout-live"><div class="panel"><div class="panel-title">SCOUTING SOLOQ · ${esc(p.role||"MID")}</div><p class="helper">${esc(message)}</p><p class="sample-note">${p.role&&p.role!=="MID"?"Rapport SoloQ au rôle déclaré · Champions · Comparaison par patch":"Rapport récent · Lane à 10 min · Matchups · Comparaison par patch"}</p>${!S.hasKey&&account?'<button id="configureScouting" class="action primary">Configurer Riot</button>':""}</div></div>`;
}
function drawPlayer(p){
  const accounts=p.accounts||[],fav=S.favorites.includes(p.id),ouat=p.region==="OUAT";
  $("#drawer").innerHTML=`<div class="drawer-header"><div><div class="drawer-kicker">${esc(p.region)}${p.division?" · "+esc(p.division):""} · ${esc(p.role||"MID")}</div><h2>${esc(p.name)}</h2><div class="drawer-team">${esc(p.team)}${p.country?" · "+esc(p.country):""}</div></div><button class="drawer-close">✕</button></div>
    <div class="drawer-actions"><button id="fav" class="action">${fav?"★ Retirer des favoris":"☆ Ajouter aux favoris"}</button><button id="dpm" class="action primary">↗ DPM.LOL</button></div><div class="panel"><div class="panel-title">RANG SOLOQ OBSERVÉ</div><p>${esc(playerRankLabel(p)||rankPlaceholder(p))}</p>${rankDateHtml(p)}<p class="sample-note">Rang complet valable pour les moyennes pendant moins de 15 min. Valeur périmée ou partielle : dernier état connu, pas un rang actuel confirmé. Pas le MMR.</p></div>${p.region==="LFL"||p.region==="LCKCL"?`<div class="panel"><div class="panel-title">PROFIL COMPÉTITIF</div><div class="champions"><span class="champ"><b>LIGUE</b> · ${esc(p.region==="LCKCL"?"LCK CL":p.region)}</span><span class="champ"><b>ÉQUIPE</b> · ${esc(p.team||"—")}</span><span class="champ"><b>RÔLE</b> · MID</span><span class="champ"><b>SOLOQ</b> · ${esc(rankLabel(p.bestRank)||"Non classé")}</span></div></div>`:""}
    <div class="panel"><div class="panel-title">SOLOQ ACCOUNTS</div>${accounts.length?accounts.map((a,i)=>accountHtml(a,i,p)).join(""):'<p class="helper">Aucun compte public relié pour ce joueur.</p>'}
    ${ouat?`<div class="account"><div class="panel-title">CORRIGER LE RIOT ID LEA</div><p class="helper">Si le Riot ID LEA est ancien, remplace-le ici. La correction reste uniquement sur ton PC.</p><div class="fix-row"><input id="fixName" class="fullinput" placeholder="Game name" value="${esc(accounts[0]?.gameName||"")}"><input id="fixTag" class="fullinput" placeholder="TAG" value="${esc(accounts[0]?.tagLine||"")}"></div><button id="saveFix" class="action">Enregistrer</button>${p.accountOverride?'<button id="clearFix" class="action">Revenir au Riot ID LEA</button>':""}<div id="fixMsg"></div></div>`:""}</div>
    ${scoutingPanel(p)}${champHtml(p)}<div class="source">Source roster : ${esc(p.source||"snapshot")}.</div>`;
  $(".drawer-close").onclick=closeDrawer;
  if($("#configureScouting"))$("#configureScouting").onclick=settings;
  $("#fav").onclick=async()=>{S.favorites=await window.mw.favorite(p.id);renderNav();render();openPlayer(p.id)};
  $("#dpm").onclick=()=>window.mw.open(dpmUrl(p));
  document.querySelectorAll("[data-check]").forEach(b=>b.onclick=()=>checkAccount(p,+b.dataset.check));
  document.querySelectorAll("[data-spec]").forEach(b=>b.onclick=()=>spectateAccount(p,+b.dataset.spec));syncSpectateButtons();
  if($("#saveFix"))$("#saveFix").onclick=async()=>{try{await window.mw.overrideAccount(p.id,{gameName:$("#fixName").value,tagLine:$("#fixTag").value,platform:"EUW1"});await reloadAccountIdentity(p.id);}catch(e){$("#fixMsg").innerHTML=`<div class="result">${esc(e.message)}</div>`}};
  if($("#clearFix"))$("#clearFix").onclick=async()=>{await window.mw.clearOverride(p.id);await reloadAccountIdentity(p.id)};
}
async function reloadAccountIdentity(id){
 delete rankState[id];delete rankMeta[id];delete liveState[id];delete liveMeta[id];teamBatch.cancel();teamDuel.cancel();
 const fresh=await window.mw.data();S.ouatPlayers=fresh.ouatPlayers;
 notice("Compte mis à jour. Les données de l’ancien Riot ID sont retirées ; rechargement des rangs lancé.");
 openPlayer(id);renderNav();render();if(rankBusy)rankReloadPending=true;else refreshRanks();
}
async function checkAccount(p,i){
  const a=p.accounts[i],box=$(`#res-${i}`);if(!box)return;box.className="result";box.textContent="Vérification Riot…";
  try{const r=await window.mw.check(a),solo=(r.ranked||[]).find(x=>x.queueType==="RANKED_SOLO_5x5");box.className="result"+(r.active?" live":"");box.textContent=r.active?`● EN GAME · ${solo?rankLabel(solo):"SoloQ"}`:`○ HORS LIGNE · ${solo?rankLabel(solo):"non classé"}`}
  catch(e){const raw=String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,"");box.innerHTML=p.region==="OUAT"&&/not found|no results/i.test(raw)?"Riot ne trouve plus ce compte. Le Riot ID LEA est probablement ancien — corrige-le plus bas.":esc(raw)}
}
let spectatePending=false,spectateRetryAt=0,spectateTimer=null,spectatePauseReason="";
function syncSpectateButtons(){
 const paused=Date.now()<spectateRetryAt,seconds=Math.max(0,Math.ceil((spectateRetryAt-Date.now())/1000));
 const reasons={accepted:"Demande acceptée : vérifie le lancement dans League.",uncertain:"Lancement non confirmé : vérifie le client avant de réessayer.",busy:"Client League occupé : respecte la pause avant de réessayer."};
 document.querySelectorAll("[data-spec]").forEach(b=>{b.disabled=spectatePending||paused;b.textContent=spectatePending?"Demande en cours…":paused?`Pause · ${seconds} s`:"▶ SPECTATE";b.title=paused?(reasons[spectatePauseReason]||"Vérifie le client avant de réessayer."):""});
 if(spectateTimer)clearTimeout(spectateTimer);
 if(paused)spectateTimer=setTimeout(syncSpectateButtons,Math.min(1000,Math.max(1,spectateRetryAt-Date.now())));
}
async function spectateAccount(p,i){
  if(spectatePending||Date.now()<spectateRetryAt)return;
  const a=p.accounts[i],box=$(`#res-${i}`);if(!box)return;box.className="result";box.textContent="Recherche de la partie…";
  spectatePending=true;syncSpectateButtons();
  try{const r=await window.mw.spectate(a),route=String(r.endpoint||"").split("/").filter(Boolean).slice(0,1).join("")||"LCU",phase=r.phase||"inconnue";spectateRetryAt=Number(r.retryAt)||0;spectatePauseReason=r.pauseReason||"accepted";box.className="result live";box.textContent=`✓ Demande acceptée · phase ${phase} · route ${route}. Vérifie le lancement dans le client. Attends la fin de la pause avant toute nouvelle demande.`}catch(e){
   box.textContent=String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,"");
   try{if(typeof window.mw.spectateStatus==="function"){const status=await window.mw.spectateStatus();spectateRetryAt=Number.isFinite(status?.retryAt)?status.retryAt:0;spectatePauseReason=status?.pauseReason||"";if(Date.now()<spectateRetryAt)box.textContent+=" Pause Spectate active : vérifie le client ; aucune relance automatique.";}}catch(_){}
  }
  finally{spectatePending=false;syncSpectateButtons();}
}
function settings(){
  drawerRequest++;
  $("#shade").classList.remove("hidden");$("#drawer").classList.remove("hidden");
  $("#drawer").innerHTML=`<div class="drawer-header"><div><div class="drawer-kicker">MIDPULSE ${esc(S.version||"")}</div><h2>Réglages</h2><div class="drawer-team">Configuration locale</div></div><button class="drawer-close">✕</button></div>
  <div class="panel"><div class="panel-title">RIOT API KEY</div><p class="helper">Ta clé reste sur ce PC. Les Development Keys Riot expirent régulièrement.</p><input id="key" class="fullinput" type="password" placeholder="RGAPI-…"><button id="saveKey" class="action primary">Valider la clé</button><div id="keyMsg"></div><button id="portal" class="action">Ouvrir Riot Developer Portal</button></div>
  <div class="panel"><div class="panel-title">LEAGUE OF LEGENDS</div><p id="lolpath" class="helper">${S.leaguePath?"✓ "+esc(S.leaguePath):"Installation non détectée"}</p><button id="pick" class="action">Choisir le dossier League</button><button id="testLeague" class="action primary">Tester le client ouvert</button><div id="leagueTest"></div><p class="sample-note">Ce test vérifie uniquement la connexion locale à un client League ouvert et connecté. Il ne lance pas Spectate et ne nécessite pas de clé Riot.</p></div>`;
  $(".drawer-close").onclick=closeDrawer;
  $("#saveKey").onclick=async()=>{try{S.hasKey=await window.mw.saveKey($("#key").value);rankCooldownAt=0;status();$("#keyMsg").innerHTML='<div class="result live">✓ Clé valide. Rechargement des rangs lancé. Les rangs en erreur restent exclus des moyennes jusqu’à leur nouvelle vérification.</div>';refreshRanks()}catch(e){S.hasKey=false;status();$("#keyMsg").innerHTML=`<div class="result">${esc(e.message)}</div>`}};
  $("#portal").onclick=()=>window.mw.open("https://developer.riotgames.com/");
  $("#pick").onclick=async()=>{try{S.leaguePath=await window.mw.pickLeague();$("#lolpath").textContent=S.leaguePath?"✓ "+S.leaguePath:"Installation non détectée"}catch(e){$("#lolpath").textContent=e.message}};
  $("#testLeague").onclick=async()=>{const box=$("#leagueTest");box.className="result";box.textContent="Connexion au client League…";try{const r=await window.mw.diagnoseLeague();S.leaguePath=r.root;$("#lolpath").textContent="✓ "+r.root;const source=r.auth==="process"?"processus Windows":r.auth==="lockfile"?"lockfile":"locale";box.className="result live";box.textContent=`✓ Client joignable · phase ${r.phase||"inconnue"} · authentification ${source}`;}catch(e){box.textContent=String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,"")}};
}
// Data refresh redraws preserve reading state. Explicit navigation,
// filters and new collections still render normally; no state survives this call.
function renderBackground(){
  if(view!=="TEAMS"){render();return}
  const context=JSON.stringify([selectedTeam,teamDivision,teamGroup]),grid=$("#grid"),workspace=$(".workspace"),scroll=workspace?.scrollTop;
  const details=()=>[...(grid?.querySelectorAll?.("details")||[])];
  const keyed=()=>{
    const occurrences=new Map();
    return details().map(node=>{
      const section=node.closest(".team-section-anchor")?.id||"",summary=node.querySelector("summary");
      // Rank progress changes while read; other disclosures must have identical
      // content (same sources/export), never transfer openness to a new report.
      const content=section==="team-rank-progress"?summary?.textContent:node.innerHTML;
      const base=JSON.stringify([section,content]),index=occurrences.get(base)||0;occurrences.set(base,index+1);
      return {node,summary,key:JSON.stringify([base,index])};
    });
  };
  const before=keyed(),opened=new Map(before.map(x=>[x.key,x.node.open]));
  const focused=before.find(x=>x.summary===document.activeElement)?.key;
  render();
  if(view!=="TEAMS"||context!==JSON.stringify([selectedTeam,teamDivision,teamGroup]))return;
  for(const x of keyed()){
    if(opened.has(x.key))x.node.open=opened.get(x.key);
    if(x.key===focused)x.summary?.focus({preventScroll:true});
  }
  if(workspace&&Number.isFinite(scroll))workspace.scrollTop=scroll;
}
async function refreshRanks(){
  if(!S.hasKey||rankBusy||Date.now()<rankCooldownAt)return;
  if(rankFollowup){clearTimeout(rankFollowup);rankFollowup=null}
  rankBusy=true;
  try{
    const onScreen=[...document.querySelectorAll(".player-card,.scout-row,[data-team-player]")].filter(node=>{
      const rect=node.getBoundingClientRect();return rect.bottom>0&&rect.top<window.innerHeight;
    }).map(node=>node.dataset.teamPlayer||node.dataset.id);
    const fallback=listForView().slice(0,20).map(p=>p.id);
    const visible=view==="TEAMS"?TeamScouting.rankPriority(allPlayers(),selectedTeam,onScreen,fallback,Date.now(),S.lineups):[...new Set([...onScreen,...fallback])];
    const r=await window.mw.rankBatch(visible);
    rankCooldownAt=Math.max(rankCooldownAt,Number(r.retryAt)||0);
    if([401,403].includes(r.blockedStatus))S.hasKey=false;
    for(const u of r.updates||[]){if(!S.ouatPlayers.some(p=>p.id===u.id&&PlayerIdentity.matches(p,u)))continue;if(rankMeta[u.id]?.identity!==u.identity)delete rankState[u.id];if(u.rank!==undefined)rankState[u.id]=u.rank;rankMeta[u.id]={identity:u.identity,rankStatus:u.status,rankCheckedAt:u.checkedAt,rankError:u.error,...(u.rankAccount?{bestRankAccount:u.rankAccount}:{})}}
    renderBackground();
    if(S.hasKey&&!r.retryAt&&(r.deferred||r.remaining>0))rankFollowup=setTimeout(refreshRanks,r.deferred?2000:4000);
  }catch(_){}finally{rankBusy=false;if(rankReloadPending){rankReloadPending=false;refreshRanks()}}
}
async function refreshLive(){
  if(!S.hasKey||Date.now()<rankCooldownAt){renderNav();renderBackground();return;}
  try{
    const scope=view==="TEAMS"?[]:listForView().slice(0,20);
    const ids=LiveMonitor.priority(scope,view==="TEAMS"?selectedTeam:"",view==="TEAMS"?TeamScouting.group(allPlayers()):[]);
    const r=await window.mw.liveBatch(ids);
    rankCooldownAt=Math.max(rankCooldownAt,Number(r.retryAt)||0);
    if([401,403].includes(r.blockedStatus))S.hasKey=false;
    for(const u of r.updates||[]){if(!S.ouatPlayers.some(p=>p.id===u.id&&PlayerIdentity.matches(p,u)))continue;if(Object.prototype.hasOwnProperty.call(u,"live")){liveState[u.id]=u.live;liveMeta[u.id]={identity:u.identity,liveAccount:u.liveAccount||null,liveCheckedAt:u.checkedAt,liveError:u.error||null}}}
  }catch(_){}finally{renderNav();renderBackground();}
}
async function refresh(){
  if(busy)return;busy=true;$("#refresh").innerHTML='<span class="spinner">↻</span>';
  notice("");
  try{
    const r=await window.mw.refreshOuat(S.ouat.url||"");S.ouatPlayers=r.players;S.ouat={...S.ouat,...r};notice(`${r.players.length} joueurs · ${r.teams||0} équipes · ${r.season}${r.warning?" · "+r.warning:""}`);
  }catch(e){notice(String(e.message||e))}
  finally{busy=false;$("#refresh").textContent="↻";renderNav();renderBackground()}
}

$("#overviewNav").onclick=()=>setView("OVERVIEW");
$("#liveNav").onclick=()=>setView("LIVE");
$("#favNav").onclick=()=>setView("FAV");
$("#ouatNav").onclick=()=>setView("OUAT");
$("#teamsNav").onclick=()=>setView("TEAMS");
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
