let S={players:[],ouatPlayers:[],ouat:{},favorites:[],hasKey:false,leaguePath:"",proCacheAt:0};
let view="OVERVIEW",liveOnly=false,busy=false,ouatDivision="ALL",liveState={},rankState={};
const $=q=>document.querySelector(q);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const REGIONS=["ALL","LCK","LCKCL","LEC","LFL","LPL","LCS","LCP"];

function rankClass(r={}){return String(r.tier||"unranked").toLowerCase()}function rankLabel(r={}){const tier=String(r.tier||"").toUpperCase();if(!tier)return"";return `${tier}${r.rank&&r.rank!=="I"?" "+r.rank:""} · ${r.leaguePoints??r.lp??0} LP`}
function rankScore(p){const o={CHALLENGER:10,GRANDMASTER:9,MASTER:8,DIAMOND:7,EMERALD:6,PLATINUM:5,GOLD:4,SILVER:3,BRONZE:2,IRON:1};const r=p.bestRank||{};return(o[String(r.tier||"").toUpperCase()]||0)*100000+(+r.leaguePoints||+r.lp||0)}
function applyLive(list){return(list||[]).map(p=>{const x=liveState[p.id]===undefined?p:{...p,live:liveState[p.id]};return rankState[p.id]===undefined?x:{...x,bestRank:rankState[p.id]||{}}})}function allPlayers(){return[...applyLive(S.players),...applyLive(S.ouatPlayers)]}
function tracked(p){return p.source==="DPM public data"||p.source==="live"||p.live===true}
function stateOf(p){if(p.live===true)return"live";return tracked(p)?"offline":"unknown"}
function dpmUrl(p){const a=(p.accounts||[])[0];if(p.region==="OUAT"){if(a?.gameName&&a?.tagLine)return`https://dpm.lol/${encodeURIComponent(a.gameName)}-${encodeURIComponent(a.tagLine)}`;return"https://dpm.lol/"}return`https://dpm.lol/pro/${encodeURIComponent(p.name)}`}

function setView(next){view=next;liveOnly=false;$("#qTop").value="";renderNav();render()}
function renderNav(){
  const live=allPlayers().filter(p=>p.live===true).length;
  $("#liveNavCount").textContent=live;
  $("#favCount").textContent=S.favorites.length;
  $("#ouatCount").textContent=S.ouatPlayers.length||"—";
  $("#overviewNav").classList.toggle("on",view==="OVERVIEW");
  $("#liveNav").classList.toggle("on",view==="LIVE");
  $("#favNav").classList.toggle("on",view==="FAV");
  $("#ouatNav").classList.toggle("on",view==="OUAT");
  const labels={ALL:"Tous les pros",LCKCL:"LCK CL"};$("#regions").innerHTML=REGIONS.map(r=>`<button data-region="${r}" class="${view===r?"on":""}"><span>◇</span><span>${labels[r]||r}</span><em>${r==="ALL"?S.players.length:S.players.filter(p=>p.region===r).length}</em></button>`).join("");
  document.querySelectorAll("[data-region]").forEach(b=>b.onclick=()=>setView(b.dataset.region));
}

function queryMatch(p,q){return`${p.name} ${p.team} ${p.division||""} ${p.group||""} ${(p.accounts||[]).map(a=>`${a.gameName||""}#${a.tagLine||""}`).join(" ")}`.toLowerCase().includes(q)}
function baseForView(){
  if(view==="OUAT"){const x=applyLive(S.ouatPlayers);return ouatDivision==="ALL"?x:x.filter(p=>String(p.division||"Sans division")===ouatDivision);}
  if(view==="LIVE")return allPlayers().filter(p=>p.live===true);
  if(view==="FAV")return allPlayers().filter(p=>S.favorites.includes(p.id));
  if(REGIONS.includes(view)){const x=applyLive(S.players);return view==="ALL"?x:x.filter(p=>p.region===view);}
  return applyLive(S.players);
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
  const state=stateOf(p),rank=rankLabel(p.bestRank),fav=S.favorites.includes(p.id);
  const status=state==="live"?"● EN GAME":state==="offline"?"○ HORS LIGNE":p.accounts?.length?"◌ COMPTE LIÉ":"◌ NON SUIVI";
  return`<article class="player-card ${state}" data-id="${esc(p.id)}">
    <div class="card-top"><span class="card-scope">${esc(p.region)}${p.division?" · "+esc(p.division):""}</span><button class="star-btn ${fav?"on":""}" data-star="${esc(p.id)}">★</button></div>
    <div class="player-main">${avatar(p)}<div><div class="player-name-line"><div class="player-name">${esc(p.name)}</div>${rank?`<span class="elo-badge ${rankClass(p.bestRank)}">${esc(rank)}</span>`:"<span class=\"elo-badge unranked\">NON CLASSÉ</span>"}</div><div class="player-team">${esc(p.team)}</div></div></div>
    <div class="card-bottom"><span class="tag ${state}">${status}</span>${rank?`<span class="tag rank">${esc(rank)}</span>`:""}${p.accounts?.[0]?.tagLine?`<span class="tag">#${esc(p.accounts[0].tagLine)}</span>`:""}</div>
    <span class="status-light ${state}"></span>
  </article>`;
}
function bindCards(){
  document.querySelectorAll(".player-card").forEach(c=>c.onclick=e=>{if(e.target.closest("[data-star]"))return;openPlayer(c.dataset.id)});
  document.querySelectorAll("[data-star]").forEach(b=>b.onclick=async e=>{e.stopPropagation();S.favorites=await window.mw.favorite(b.dataset.star);renderNav();render()});
}
function ouatBrowser(players){
  const teams=new Map();
  for(const p of players){const key=`${p.team||"Équipe inconnue"}|${p.division||"Sans division"}`;if(!teams.has(key))teams.set(key,[]);teams.get(key).push(p)}
  return`<div class="ouat-team-grid">${[...teams.entries()].map(([key,ps])=>{const[team,division]=key.split("|"),logo=ps.find(p=>p.teamLogo)?.teamLogo||"";
    return`<section class="ouat-team-card"><div class="ouat-team-head">${logo?`<img src="${esc(logo)}" alt="">`:`<div class="ouat-team-fallback">${esc(team.slice(0,2).toUpperCase())}</div>`}<div><h3>${esc(team)}</h3><span>${esc(division)}</span></div><em>${ps.length} MID</em></div><div class="ouat-roster">${ps.map(p=>{const a=(p.accounts||[])[0],state=stateOf(p);return`<button class="ouat-player-row" data-id="${esc(p.id)}"><span class="ouat-player-main">${avatar(p,"ouat-avatar")}<span><span class="ouat-name-line"><b>${esc(p.name)}</b>${rankLabel(p.bestRank)?`<span class="elo-badge ${rankClass(p.bestRank)}">${esc(rankLabel(p.bestRank))}</span>`:"<span class=\"elo-badge unranked\">—</span>"}</span><small>${a?.gameName?`${esc(a.gameName)}#${esc(a.tagLine||"")}`:"Riot ID non renseigné"}</small></span></span><span class="ouat-row-state ${state}">${state==="live"?"● LIVE":a?.gameName?"DPM ↗":"—"}</span></button>`}).join("")}</div></section>`
  }).join("")}</div>`;
}

function hero(){
  const live=allPlayers().filter(p=>p.live===true);
  if(view==="OUAT"&&!$("#qTop").value){
    const divisions=["ALL",...new Set(S.ouatPlayers.map(p=>String(p.division||"Sans division")).filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})))];
    const teams=new Set((ouatDivision==="ALL"?S.ouatPlayers:S.ouatPlayers.filter(p=>String(p.division||"Sans division")===ouatDivision)).map(p=>p.team)).size;
    $("#hero").innerHTML=`<div class="ouat-control-panel"><div class="ouat-control-copy"><div class="panel-kicker">OUATVENTURE · ${esc(S.ouat.season||"SAISON EN COURS")}</div><h2>Parcours les équipes, pas une liste infinie.</h2><p>${S.ouatPlayers.length} midlaners · ${S.ouat.teams||teams} équipes référencées depuis LEA</p></div><div class="ouat-kpis"><div><b>${teams}</b><span>ÉQUIPES AFFICHÉES</span></div><div><b>${S.ouatPlayers.filter(p=>p.accounts?.length).length}</b><span>RIOT IDS</span></div></div><div class="division-strip">${divisions.map(d=>`<button data-division="${esc(d)}" class="${ouatDivision===d?"on":""}">${d==="ALL"?"Toutes":esc(d)}</button>`).join("")}</div></div>`;
    document.querySelectorAll("[data-division]").forEach(b=>b.onclick=()=>{ouatDivision=b.dataset.division;render()});
    return;
  }
  const proLive=applyLive(S.players).filter(p=>p.live===true).length,ouatLive=applyLive(S.ouatPlayers).filter(p=>p.live===true).length;
  const followed=S.favorites.length;
  if(view==="OVERVIEW"&&!$("#qTop").value){
    const chips=live.slice(0,8).map(p=>`<div class="live-chip" data-id="${esc(p.id)}">${avatar(p,"live-chip-avatar")}<div><b>${esc(p.name)}</b><span>${esc(p.team)} · ${esc(p.region)}</span></div></div>`).join("");
    $("#hero").innerHTML=`<div class="overview-grid"><div class="live-panel"><div class="panel-kicker"><span class="pulse-dot"></span> LIVE NOW</div><div class="live-panel-head"><h2>${live.length?live.length+" midlaner"+(live.length>1?"s":"")+" en game":"Aucun midlaner en game"}</h2><p>Actualisation automatique toutes les 2 min</p></div><div class="live-rail">${chips||'<div class="live-empty">Rien à spectate pour le moment. Tu peux garder MidPulse ouvert en arrière-plan.</div>'}</div></div><div class="insight-panel"><div class="metric live"><strong>${live.length}</strong><span>LIVE</span></div><div class="metric accent"><strong>${followed}</strong><span>FAVORIS</span></div><div class="metric"><strong>${S.players.length}</strong><span>PROS</span></div><div class="metric"><strong>${S.ouatPlayers.length}</strong><span>OUAT</span></div></div></div>`;
    document.querySelectorAll(".live-chip").forEach(x=>x.onclick=()=>openPlayer(x.dataset.id));
  }else{
    const base=baseForView(),known=base.filter(tracked).length,liveCount=base.filter(p=>p.live===true).length;
    $("#hero").innerHTML=`<div class="hero-simple"><div class="stat-pill"><b>${liveCount}</b><span>EN GAME</span></div><div class="stat-pill"><b>${base.length}</b><span>JOUEURS</span></div><div class="stat-pill"><b>${known}</b><span>SUIVIS EN LIVE</span></div></div>`;
  }
}

function titles(){
  const q=$("#qTop").value.trim();
  if(q)return["RECHERCHE",`Résultats pour “${q}”`,"Joueurs, équipes et Riot IDs"];
  if(view==="OVERVIEW")return["MIDPULSE","Vue d’ensemble","Ton cockpit pour suivre les midlaners au quotidien."];
  if(view==="LIVE")return["LIVE","En direct","Tous les midlaners actuellement détectés en partie."];
  if(view==="FAV")return["LIBRARY","Favoris","Les joueurs que tu veux garder sous les yeux."];
  if(view==="OUAT")return["ONCE UPON A TEAM",`OUATventure ${S.ouat.season||""}`,`${S.ouat.teams||0} équipes · ${S.ouatPlayers.length} midlaners`];
  if(view==="ALL")return["PRO SCENE","Tous les pros","LCK · LCK CL · LEC · LFL · LPL · LCS · LCP"];
  return["PRO LEAGUE",view,`Midlaners ${view}`];
}
function render(){
  const [ey,title,sub]=titles();$("#eyebrow").textContent=ey;$("#title").textContent=title;$("#sub").textContent=sub;
  hero();
  const list=listForView(),q=$("#qTop").value.trim();
  $("#sectionTitle").textContent=q?"Résultats":view==="OVERVIEW"?"Tous les pros":view==="LIVE"?"Live maintenant":view==="FAV"?"Mes favoris":view==="OUAT"?"Équipes OUAT":"Joueurs";
  $("#summary").textContent=`${list.length} résultat${list.length>1?"s":""}`;
  $("#liveOnly").classList.toggle("on",liveOnly);
  $("#grid").innerHTML=list.length?(view==="OUAT"&&!q?ouatBrowser(list):list.map(card).join("")):`<div class="empty">${q?"Aucun résultat pour cette recherche.":view==="LIVE"?"Aucun midlaner détecté en partie actuellement.":"Aucun joueur dans cette vue."}</div>`;
  bindCards();document.querySelectorAll(".ouat-player-row").forEach(r=>r.onclick=()=>openPlayer(r.dataset.id));status();
}
function status(){
  $("#apiDot").classList.toggle("ok",S.hasKey);
  $("#apiText").textContent=S.hasKey?"Riot API connectée":"Riot API à configurer";
}
function notice(t=""){const n=$("#notice");n.textContent=t;n.classList.toggle("hidden",!t)}
function closeDrawer(){$("#drawer").classList.add("hidden");$("#shade").classList.add("hidden")}
function findPlayer(id){return allPlayers().find(p=>p.id===id)}
function normalizeProfile(p,d){
  if(!d)return p;const ep=d.esportPlayer||{},accounts=(d.players||[]).map(x=>({gameName:x.gameName||"",tagLine:x.tagLine||"",platform:String(x.platform||"").toUpperCase(),puuid:x.puuid||"",rank:(x.ranks||[]).find(r=>r.queue==="RANKED_SOLO_5x5")||{},isLive:!!x.isLive}));
  for(const a of p.accounts||[]){const f=accounts.find(x=>x.gameName.toLowerCase()===String(a.gameName||"").toLowerCase()&&x.tagLine.toLowerCase()===String(a.tagLine||"").toLowerCase());if(f)Object.assign(f,a);else accounts.push(a)}
  return{...p,country:ep.country||p.country,age:ep.age,lastChampions:d.lastChampions||[],accounts,profile:{...(p.profile||{}),league:p.region,team:p.team,role:"MID"}};
}
async function openPlayer(id){
  let p=findPlayer(id);if(!p)return;
  $("#shade").classList.remove("hidden");$("#drawer").classList.remove("hidden");
  $("#drawer").innerHTML=`<div class="drawer-header"><div><div class="drawer-kicker">${esc(p.region)} · MID</div><h2>${esc(p.name)}</h2><div class="drawer-team">${esc(p.team)}</div></div><button class="drawer-close">✕</button></div><div class="panel"><span class="spinner">↻</span> Chargement…</div>`;
  $(".drawer-close").onclick=closeDrawer;
  if(p.region!=="OUAT")try{p=normalizeProfile(p,await window.mw.profile(p.name,p.region))}catch(_){}
  drawPlayer(p);
  if(p.region==="OUAT"&&p.accounts?.[0]&&S.hasKey){try{const stats=await window.mw.stats(p.accounts[0]);const anchor=$("#scout-live");if(anchor)anchor.innerHTML=statReport(stats)}catch(e){const anchor=$("#scout-live");if(anchor)anchor.innerHTML=`<div class="panel"><div class="panel-title">PERFORMANCE RÉCENTE</div><p class="helper">${esc(String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,""))}</p></div>`}} 
}
function accountHtml(a,i){
  return`<div class="account"><div class="account-head"><div><b>${esc(a.gameName||"Compte")}#${esc(a.tagLine||"?")}</b><small>${esc(a.platform||"")}</small></div><span class="tag ${a.isLive?"live":"rank"}">${a.isLive?"● LIVE":esc(rankLabel(a.rank)||"CHECK")}</span></div><div class="account-actions"><button class="action" data-check="${i}">CHECK RIOT</button><button class="action live" data-spec="${i}">▶ SPECTATE</button></div><div id="res-${i}"></div></div>`;
}
function statReport(s){if(!s||!s.games)return`<div class="panel"><div class="panel-title">PERFORMANCE RÉCENTE</div><p class="helper">Pas assez de matchs Riot disponibles pour calculer les statistiques.</p></div>`;const sig=(s.champions||[]).slice(0,3);let strengths=[],weak=[];if(s.winrate>=55)strengths.push(`Forme positive (${s.winrate}% WR)`);if(s.kda>=3)strengths.push(`KDA solide (${s.kda})`);if(s.cspm>=7)strengths.push(`Farm élevé (${s.cspm} CS/min)`);if(s.dpm>=650)strengths.push(`Forte pression dégâts (${s.dpm} DPM)`);if(s.winrate<48)weak.push(`Forme récente négative (${s.winrate}% WR)`);if(s.deaths>=6)weak.push(`Mortalité élevée (${s.deaths}/game)`);if(s.cspm<6)weak.push(`Farm récent limité (${s.cspm} CS/min)`);return`<div class="panel scouting"><div class="panel-title">SCOUTING · ${s.games} DERNIÈRES GAMES</div><div class="stats-grid"><div><b>${s.winrate}%</b><span>WIN RATE</span></div><div><b>${s.kda}</b><span>KDA</span></div><div><b>${s.cspm}</b><span>CS/MIN</span></div><div><b>${s.dpm}</b><span>DPM</span></div><div><b>${s.gpm}</b><span>GOLD/MIN</span></div><div><b>${s.vision}</b><span>VISION/GAME</span></div></div><div class="scout-grid"><div><small>FORCES</small>${strengths.map(x=>`<p>+ ${esc(x)}</p>`).join("")||"<p>— Pas de signal fort</p>"}</div><div><small>POINTS À SURVEILLER</small>${weak.map(x=>`<p>− ${esc(x)}</p>`).join("")||"<p>— Pas de faiblesse statistique nette</p>"}</div></div>${sig.length?`<div class="signature"><small>CHAMPIONS SIGNATURES RÉCENTS</small><b>${sig.map(x=>`${esc(x.name)} · ${x.games}G · ${x.winrate}%`).join(" &nbsp; / &nbsp; ")}</b></div>`:""}</div>`}function scoutReport(p){const r=p.bestRank||{},cs=(p.lastChampions||[]).slice(0,5),top=cs.slice(0,3).map(x=>x.championName||x.champion_name).filter(Boolean);const score=rankScore(p);let strengths=[],weak=[];if(score>=900000)strengths.push("Très haut niveau SoloQ","Mécaniques et rythme de jeu à surveiller");else if(score>=700000)strengths.push("Niveau SoloQ solide");else weak.push("Elo inférieur aux profils les mieux classés");if(top.length)strengths.push("Pool identifié : "+top.join(", "));else weak.push("Peu de données champion disponibles");if((p.accounts||[]).length)strengths.push("Compte Riot suivi");else weak.push("Compte Riot non relié");return`<div class="panel scouting"><div class="panel-title">SCOUTING REPORT</div><div class="scout-grid"><div><small>FORCES</small>${strengths.map(x=>`<p>+ ${esc(x)}</p>`).join("")||"<p>— Données insuffisantes</p>"}</div><div><small>POINTS À SURVEILLER</small>${weak.map(x=>`<p>− ${esc(x)}</p>`).join("")||"<p>— Aucun signal faible détecté</p>"}</div></div>${top.length?`<div class="signature"><small>CHAMPIONS SIGNATURES</small><b>${esc(top.join(" · "))}</b></div>`:""}</div>`}function champHtml(p){const cs=(p.lastChampions||[]).slice(0,5);if(!cs.length)return"";return`<div class="panel"><div class="panel-title">RECENT CHAMPIONS</div><div class="champions">${cs.map(c=>`<span class="champ"><b>${esc(c.championName||c.champion_name||"?")}</b> · ${esc(c.games||0)} games</span>`).join("")}</div></div>`}
function drawPlayer(p){
  const accounts=p.accounts||[],fav=S.favorites.includes(p.id),ouat=p.region==="OUAT";
  $("#drawer").innerHTML=`<div class="drawer-header"><div><div class="drawer-kicker">${esc(p.region)}${p.division?" · "+esc(p.division):""} · MID</div><h2>${esc(p.name)}</h2><div class="drawer-team">${esc(p.team)}${p.country?" · "+esc(p.country):""}</div></div><button class="drawer-close">✕</button></div>
    <div class="drawer-actions"><button id="fav" class="action">${fav?"★ Retirer des favoris":"☆ Ajouter aux favoris"}</button><button id="dpm" class="action primary">↗ DPM.LOL</button></div>${p.region==="LFL"||p.region==="LCKCL"?`<div class="panel"><div class="panel-title">PROFIL COMPÉTITIF</div><div class="champions"><span class="champ"><b>LIGUE</b> · ${esc(p.region==="LCKCL"?"LCK CL":p.region)}</span><span class="champ"><b>ÉQUIPE</b> · ${esc(p.team||"—")}</span><span class="champ"><b>RÔLE</b> · MID</span><span class="champ"><b>SOLOQ</b> · ${esc(rankLabel(p.bestRank)||"Non classé")}</span></div></div>`:""}
    <div class="panel"><div class="panel-title">SOLOQ ACCOUNTS</div>${accounts.length?accounts.map(accountHtml).join(""):'<p class="helper">Aucun compte public relié pour ce joueur.</p>'}
    ${ouat?`<div class="account"><div class="panel-title">CORRIGER LE RIOT ID LEA</div><p class="helper">Si le Riot ID LEA est ancien, remplace-le ici. La correction reste uniquement sur ton PC.</p><div class="fix-row"><input id="fixName" class="fullinput" placeholder="Game name" value="${esc(accounts[0]?.gameName||"")}"><input id="fixTag" class="fullinput" placeholder="TAG" value="${esc(accounts[0]?.tagLine||"")}"></div><button id="saveFix" class="action">Enregistrer</button>${p.accountOverride?'<button id="clearFix" class="action">Revenir au Riot ID LEA</button>':""}<div id="fixMsg"></div></div>`:""}</div>
    ${ouat?`<div id="scout-live"><div class="panel"><div class="panel-title">SCOUTING</div><p class="helper"><span class="spinner">↻</span> Analyse des matchs Riot récents…</p></div></div>`:""}${champHtml(p)}<div class="source">Source roster : ${esc(p.source||"snapshot")}.</div>`;
  $(".drawer-close").onclick=closeDrawer;
  $("#fav").onclick=async()=>{S.favorites=await window.mw.favorite(p.id);renderNav();render();drawPlayer(p)};
  $("#dpm").onclick=()=>window.mw.open(dpmUrl(p));
  document.querySelectorAll("[data-check]").forEach(b=>b.onclick=()=>checkAccount(p,+b.dataset.check));
  document.querySelectorAll("[data-spec]").forEach(b=>b.onclick=()=>spectateAccount(p,+b.dataset.spec));
  if($("#saveFix"))$("#saveFix").onclick=async()=>{try{const a=await window.mw.overrideAccount(p.id,{gameName:$("#fixName").value,tagLine:$("#fixTag").value,platform:"EUW1"});p={...p,accounts:[a],accountOverride:true};const idx=S.ouatPlayers.findIndex(x=>x.id===p.id);if(idx>=0)S.ouatPlayers[idx]=p;drawPlayer(p);render();}catch(e){$("#fixMsg").innerHTML=`<div class="result">${esc(e.message)}</div>`}};
  if($("#clearFix"))$("#clearFix").onclick=async()=>{await window.mw.clearOverride(p.id);const fresh=await window.mw.data();S.ouatPlayers=fresh.ouatPlayers;drawPlayer(findPlayer(p.id));render()};
}
async function checkAccount(p,i){
  const a=p.accounts[i],box=$(`#res-${i}`);if(!box)return;box.className="result";box.textContent="Vérification Riot…";
  try{const r=await window.mw.check(a),solo=(r.ranked||[]).find(x=>x.queueType==="RANKED_SOLO_5x5");box.className="result"+(r.active?" live":"");box.textContent=r.active?`● EN GAME · ${solo?rankLabel(solo):"SoloQ"}`:`○ HORS LIGNE · ${solo?rankLabel(solo):"non classé"}`}
  catch(e){const raw=String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,"");box.innerHTML=p.region==="OUAT"&&/not found|no results/i.test(raw)?"Riot ne trouve plus ce compte. Le Riot ID LEA est probablement ancien — corrige-le plus bas.":esc(raw)}
}
async function spectateAccount(p,i){
  const a=p.accounts[i],box=$(`#res-${i}`);if(!box)return;box.className="result";box.textContent="Recherche de la partie…";
  try{await window.mw.spectate(a);box.className="result live";box.textContent="✓ Spectateur lancé dans League of Legends."}catch(e){box.textContent=String(e.message||e).replace(/^Error invoking remote method [^:]+:\s*Error:\s*/,"")}
}
function settings(){
  $("#shade").classList.remove("hidden");$("#drawer").classList.remove("hidden");
  $("#drawer").innerHTML=`<div class="drawer-header"><div><div class="drawer-kicker">MIDPULSE 4.0</div><h2>Réglages</h2><div class="drawer-team">Configuration locale</div></div><button class="drawer-close">✕</button></div>
  <div class="panel"><div class="panel-title">RIOT API KEY</div><p class="helper">Ta clé reste sur ce PC. Les Development Keys Riot expirent régulièrement.</p><input id="key" class="fullinput" type="password" placeholder="RGAPI-…"><button id="saveKey" class="action primary">Valider la clé</button><div id="keyMsg"></div><button id="portal" class="action">Ouvrir Riot Developer Portal</button></div>
  <div class="panel"><div class="panel-title">LEAGUE OF LEGENDS</div><p id="lolpath" class="helper">${S.leaguePath?"✓ "+esc(S.leaguePath):"Installation non détectée"}</p><button id="pick" class="action">Choisir le dossier League</button></div>`;
  $(".drawer-close").onclick=closeDrawer;
  $("#saveKey").onclick=async()=>{try{S.hasKey=await window.mw.saveKey($("#key").value);status();$("#keyMsg").innerHTML='<div class="result live">✓ Clé valide et enregistrée.</div>'}catch(e){S.hasKey=false;status();$("#keyMsg").innerHTML=`<div class="result">${esc(e.message)}</div>`}};
  $("#portal").onclick=()=>window.mw.open("https://developer.riotgames.com/");
  $("#pick").onclick=async()=>{try{S.leaguePath=await window.mw.pickLeague();$("#lolpath").textContent=S.leaguePath?"✓ "+S.leaguePath:"Installation non détectée"}catch(e){$("#lolpath").textContent=e.message}};
}
async function refreshRanks(){
  if(!S.hasKey)return;
  try{
    const r=await window.mw.rankBatch();
    for(const u of r.updates||[]){if(u.rank!==undefined)rankState[u.id]=u.rank}
    render();
  }catch(_){}
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
    if(view==="OUAT"){const r=await window.mw.refreshOuat(S.ouat.url||"");S.ouatPlayers=r.players;S.ouat={...S.ouat,...r};notice(`${r.players.length} midlaners · ${r.teams||0} équipes · ${r.season}${r.warning?" · "+r.warning:""}`)}
    else{const r=await window.mw.refreshPros();if(r.players?.length){S.players=r.players;S.proCacheAt=r.at}if(r.errors?.length)notice(`Données live partielles : ${r.errors.join(" · ")}`)}
  }catch(e){notice(String(e.message||e))}
  finally{busy=false;$("#refresh").textContent="↻";renderNav();render()}
}

$("#overviewNav").onclick=()=>setView("OVERVIEW");
$("#liveNav").onclick=()=>setView("LIVE");
$("#favNav").onclick=()=>setView("FAV");
$("#ouatNav").onclick=()=>setView("OUAT");
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
  S=await window.mw.data();
  if(S.hasKey)try{S.hasKey=await window.mw.keyCheck()}catch(_){S.hasKey=false}
  renderNav();render();status();
  setTimeout(()=>{if(!S.proCacheAt)refresh()},700);setTimeout(refreshLive,1200);setTimeout(refreshRanks,1800);
  setInterval(refreshLive,20000);setInterval(refreshRanks,30000);setInterval(async()=>{if(busy)return;try{const r=await window.mw.refreshPros();if(r.players?.length){S.players=r.players;S.proCacheAt=r.at;renderNav();render()}}catch(_){}},120000);
})();