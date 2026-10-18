/* Explicitly selected public scouting fields only; never serialize app settings. */
const ReportBuilder=(()=>{
 const T=typeof module!=='undefined'?require('./teams'):TeamScouting,D=typeof module!=='undefined'?require('./duels'):DuelScouting;
 const clean=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
 const date=v=>Number.isFinite(v)&&v>0&&Number.isFinite(new Date(v).getTime())?new Date(v).toISOString():'date indisponible';
 const reasons={covered:'couvert',missing:'joueur absent',ambiguous:'plusieurs joueurs, aucun choix local',selection_missing:'choix local absent de l’effectif',account_missing:'compte non relié',duplicate:'compte partagé entre rôles',error:'erreur Riot',partial:'rang partiel',rank_missing:'rang absent ou non classé',stale:'rang périmé ou date invalide'};
 const key=a=>`${a?.platform||'EUW1'}|${a?.gameName||''}#${a?.tagLine||''}`.toLowerCase();
 function account(p){return p.accounts?.find(a=>key(a)===key(p.bestRankAccount))||p.accounts?.[0];}
 function build({team,home,lineups={},version='',ouat={},duel=null,duels=null,draftPatch='ALL',now=Date.now()}){
  if(!team)throw new Error('Aucune équipe sélectionnée.');
  const lines=[`MIDPULSE ${clean(version)} — RAPPORT DE PRÉPARATION`,`${clean(team.name)} / ${clean(home?.name||'UWU GANG introuvable')}`,`Généré : ${date(now)}`,`Effectif LEA : ${clean(ouat.season||'saison inconnue')} · actualisé ${date(ouat.updatedAt)}`,'Source effectifs : https://api.leamateur.pro · rangs et parties : API Riot.'];
  if(ouat.warning)lines.push('Attention : l’effectif chargé comporte un avertissement de collecte.');
  for(const t of [team,...(home&&home.id!==team.id?[home]:[])]){
   const s=T.summarize(t.players,now,T.lineup(lineups,t.id));
   lines.push('',`ÉQUIPE : ${clean(t.name)} · ${clean(t.division)} · ${clean(t.group)}`,`Rang SoloQ moyen observé : ${s.label} · ${s.covered}/5 rôles couverts${s.complete?'':' · PARTIEL'}`);
   for(const slot of s.slots){
    const p=slot.players.length===1?slot.players[0]:null;
    lines.push(`${slot.role} : ${p?clean(p.name):'non sélectionné'} · ${slot.manual?'composition locale non confirmée par LEA':'effectif déclaré, titularisation non confirmée'} · ${reasons[slot.status]||'indisponible'}`);
    if(p){const a=account(p),r=p.bestRank;lines.push(`  Riot ID : ${a?.gameName&&a?.tagLine?`${clean(a.gameName)}#${clean(a.tagLine)} (${clean(a.platform||'EUW1')})`:'non relié'}`);
     lines.push(`  ${slot.status==='covered'?'Rang':'Dernier rang connu, exclu de la moyenne'} : ${T.points(r)!==null?`${clean(r.tier)} ${clean(r.rank||'')} · ${r.leaguePoints??r.lp} LP`:'indisponible'} · vérifié ${date(p.rankCheckedAt)}`);
    }else if(slot.declared.length)lines.push(`  Joueurs déclarés : ${slot.declared.map(p=>clean(p.name)).join(', ')}`);
   }
  }
  lines.push('','Moyenne descriptive, pas le MMR réel : 100 points/division, 400/palier + LP ; Master/Grandmaster/Challenger = base Master + LP. Compte distinct et rang complet vérifié depuis moins de 15 min requis. Les rôles manquants, ambigus, partiels ou périmés sont exclus. Une moyenne partielle ne représente pas cinq joueurs.');
  const analyses=(Array.isArray(duels)?duels:[duel]).filter(a=>a?.pair&&T.roles.includes(a.pair.role)&&(!Array.isArray(duels)||(a.reports||[]).some(r=>r?.role===a.pair.role&&Number.isInteger(r.games)&&r.games>=0))),roles=new Set();
  for(const analysis of analyses){
   const reports=analysis.reports||[],pair=analysis.pair,champions=Array.isArray(analysis.champions)&&analysis.champions.length===2?analysis.champions:null;if(roles.has(pair.role))continue;roles.add(pair.role);
   lines.push('',`ANALYSE SOLOQ CHARGÉE : ${clean(pair.role)} · ${analysis.patch&&analysis.patch!=='ALL'?`patch ${clean(analysis.patch)}`:'toutes les parties retenues'}${!champions&&analysis.champion&&analysis.champion!=='ALL'?' · champion '+clean(analysis.champion):''}`);
   if(analysis.loading)lines.push('Collecte encore en cours : ce rapport est un instantané partiel.');
   if(analysis.restoredAfterError)lines.push('RAPPORT PRÉCÉDENT RESTAURÉ APRÈS ÉCHEC : pas une actualisation réussie, dates et expiration d’origine conservées.');
   if(champions)lines.push('CHAMPIONS SÉLECTIONNÉS SÉPARÉMENT : deux historiques individuels, pas des confrontations directes ni un taux de victoire de matchup.');
   pair.sides.forEach((side,i)=>{
    lines.push(`${clean(side.teamName)} · ${clean(side.player?.name||'joueur non sélectionné')}`);
    const champion=champions?champions[i]:analysis.champion||'ALL';
    lines.push('  Champion sélectionné : '+(champion==='ALL'?'tous ceux retenus':clean(champion)));
    const raw=reports[i],s=raw?.role===pair.role?D.scopeReport(raw,analysis.patch||'ALL',champion):null;
    if(!s||!Number.isInteger(s.games)||s.games<=0){lines.push('  Rapport non chargé ou aucune partie exploitable.');return;}
    lines.push(`  ${s.games} parties au rôle ${clean(s.role)} · période ${date(s.window?.oldestAt)} → ${date(s.window?.newestAt)} · collecte ${date(s.sampledAt)}`);
    if(s.normalization?.games)lines.push(`  Convention Riot : ${s.normalization.fields} champ(s) numérique(s) omis traité(s) à zéro dans ${s.normalization.games} partie(s) de cet échantillon. Source : https://developer.riotgames.com/docs/portal#response-codes`);
    if(s.coverage?.partial)lines.push('  COLLECTE PARTIELLE : erreurs, quota ou données incomplètes.');
    if(s.window?.stale)lines.push('  DONNÉES ANCIENNES.');
    if(Array.isArray(s.evidence)&&s.evidence.length){
     lines.push('  PARTIES SOURCES · SoloQ retenues dans le périmètre sélectionné :');
     for(const m of s.evidence.filter(m=>m?.role===s.role&&typeof m.win==='boolean').slice(0,30)){
      const id=typeof m.matchId==='string'&&/^[A-Z0-9]+_[0-9]+$/.test(m.matchId)?m.matchId:'identifiant indisponible',kda=[m.kills,m.deaths,m.assists].map(v=>Number.isFinite(v)&&v>=0?v:'—').join('/');
      lines.push(`    ${id} · ${date(m.startedAt)} · ${clean(m.champion||'champion indisponible')} · patch ${clean(m.patch||'indisponible')} · ${m.win?'victoire':'défaite'} · ${Number.isFinite(m.seconds)&&m.seconds>0?m.seconds+' s':'durée indisponible'} jouées · K/D/A ${kda}${m.omittedStats?.length?' · convention Riot : '+m.omittedStats.map(clean).join(', ')+' omis → zéro':''}`);
     }
    }else lines.push('  Parties sources indisponibles dans ce rapport ancien : recollecter pour les obtenir.');
    for(const [field,label]of [['winrate','Winrate (%)'],['kda','KDA'],['cspm','CS/min'],['dpm','Dégâts/min'],['gpm','Or/min'],['vision','Vision/partie']])if(Number.isFinite(s[field]))lines.push(`  ${label} : ${s[field]}`);
    if(Number.isFinite(s.interval?.low)&&Number.isFinite(s.interval?.high))lines.push(`  IC95 winrate : ${s.interval.low}–${s.interval.high}%`);
    lines.push(`  Champions observés : ${(s.champions||[]).filter(c=>c.name&&Number.isFinite(c.games)&&c.games>0).map(c=>`${clean(c.name)} (${c.games}G)`).join(', ')||'indisponibles'}`);
    lines.push(`  Patchs observés : ${(s.patches||[]).filter(p=>p.patch&&Number.isFinite(p.games)&&p.games>0).map(p=>`${clean(p.patch)} (${p.games}G)`).join(', ')||'indisponibles'}`);
   });
   if(!Array.isArray(duels))lines.push('Les autres rôles ne disposent pas d’une analyse SoloQ dans ce rapport.');
  }
  if(Array.isArray(duels)&&roles.size)lines.push('Rôles sans analyse mémorisée : '+(T.roles.filter(r=>!roles.has(r)).join(', ')||'aucun'));
  if(Array.isArray(duels)&&analyses.length){
   const entries=analyses.map(a=>({role:a.pair.role,pair:a.pair,saved:{restoredAfterError:!!a.restoredAfterError,sides:(a.reports||[]).map(report=>({report}))}}));
   lines.push('','POOLS OBSERVÉS · PRÉPARATION DRAFT · '+(draftPatch==='ALL'?'tous les patchs retenus':'patch '+clean(draftPatch)),'Périmètre indépendant des filtres du comparateur détaillé. Fréquence = parties champion / parties retenues au rôle et au patch. Pas le répertoire complet, pas une recommandation de ban.');
   for(const row of D.draftPools(entries,draftPatch))row.sides.forEach((side,i)=>{
    lines.push(`${row.role} · ${clean(i===0?team.name:home?.name||'UWU GANG')} · ${clean(side.player?.name||'joueur non sélectionné')}`);
    if(row.restoredAfterError)lines.push('  RAPPORT RESTAURÉ APRÈS ÉCHEC : dates d’origine, pas une actualisation réussie.');
    if(side.poolStatus!=='loaded'){lines.push('  '+({unobserved:'Aucune partie observée sur ce patch dans cet échantillon.',empty:'Aucune partie exploitable.',invalid:'Pool incohérent : fréquences indisponibles.'}[side.poolStatus]||'Rapport non chargé ou indisponible.'));return;}
    const s=side.report;lines.push(`  ${s.games} parties · champions identifiés ${side.identifiedGames}/${s.games} · période ${date(s.window?.oldestAt)} → ${date(s.window?.newestAt)} · collecte ${date(s.sampledAt)}${s.coverage?.partial?' · COLLECTE PARTIELLE':''}${s.window?.stale?' · DONNÉES ANCIENNES':''}`);
    for(const c of side.champions){lines.push(`  ${clean(c.name)} : ${c.games}/${s.games} (${c.share}%) · ${c.wins===null?'résultats indisponibles':c.wins+'/'+c.games+' victoires ('+c.winrate+'%)'}${c.limited?' · moins de 3 parties':''}`);
     const trace=c.trace||{status:'unavailable',rows:[]};lines.push('    PARTIES SOURCES DU POOL : '+trace.rows.length+'/'+c.games+' · '+({complete:'sources disponibles',partial:'TRAÇABILITÉ PARTIELLE',unavailable:'sources indisponibles, recollecter',inconsistent:'SOURCES INCOHÉRENTES, lien non vérifiable'}[trace.status]));
     for(const m of trace.rows)lines.push('      '+clean(m.matchId||'identifiant indisponible')+' · '+date(m.startedAt)+' · '+clean(c.name)+' · patch '+clean(m.patch||'indisponible')+' · '+(m.win?'victoire':'défaite')+' · '+(m.seconds===null?'durée indisponible':m.seconds+' s jouées')+' · K/D/A '+[m.kills,m.deaths,m.assists].map(v=>Number.isFinite(v)?v:'—').join('/'));
    }
   });
  }
  if(!analyses.length)lines.push('','Aucune comparaison SoloQ chargée : seuls les effectifs et les rangs disponibles sont rapportés.');
  lines.push('','LIMITES : jusqu’à 12 parties au rôle parmi les 20 dernières SoloQ de chaque compte. Historiques individuels, pas des confrontations directes. Périodes, champions, adversaires et coéquipiers peuvent différer. Filtrer un patch ne prouve pas son effet causal. Aucun pronostic, classement alternatif ou analyse de micro-gameplay.','Instantané à revérifier avant le match. Contient des noms et Riot IDs publics ainsi que vos choix locaux ; aucune clé Riot ni configuration privée.');
  return lines.join('\n');
 }
 function buildGroup({teams=[],selectedId,lineups={},version='',ouat={},now=Date.now()}){
  const board=T.groupBoard(teams,selectedId,now,lineups);
  if(!board.known)throw new Error('Groupe LEA non publié : export indisponible.');
  const complete=board.rows.filter(r=>r.summary.complete).length;
  const lines=[`MIDPULSE ${clean(version)} — RANGS SOLOQ DU GROUPE`,`${clean(board.division)} · ${clean(board.group)}`,`Généré : ${date(now)}`,`Effectif LEA : ${clean(ouat.season||'saison inconnue')} · actualisé ${date(ouat.updatedAt)}`,'Sources : https://api.leamateur.pro (effectifs déclarés) · API Riot (rangs SoloQ officiels).',`${board.rows.length} équipes du groupe · ${complete} avec 5/5 rôles couverts · ${board.rows.length-complete} incomplètes.`, 'Ordre descriptif des moyennes complètes uniquement ; équipes incomplètes ensuite par nom, ex æquo conservés. Pas un classement du tournoi, pas le MMR réel.'];
  if(ouat.warning)lines.push('ATTENTION : avertissement de collecte des effectifs LEA.');
  for(const {team,summary:s,position}of board.rows){
   lines.push('',`ÉQUIPE : ${clean(team.name)}${team.name.trim().toUpperCase()==='UWU GANG'?' · UWU GANG (repère)':''}`,`Ordre SoloQ : ${position??'non attribué'} · moyenne observée : ${s.label} · ${s.covered}/5 rôles couverts${s.complete?' · COMPLET':' · PARTIEL'}`);
   for(const slot of s.slots){
    const p=slot.players.length===1?slot.players[0]:null;
    lines.push(`${slot.role} : ${p?clean(p.name):'non sélectionné'} · ${slot.manual?'composition locale non confirmée par LEA':'effectif déclaré, titularisation non confirmée'} · ${reasons[slot.status]||'indisponible'}`);
    if(p){const a=account(p),r=p.bestRank;lines.push(`  Riot ID : ${a?.gameName&&a?.tagLine?`${clean(a.gameName)}#${clean(a.tagLine)} (${clean(a.platform||'EUW1')})`:'non relié'}`);
     lines.push(`  ${slot.status==='covered'?'Rang':'Dernier rang connu, exclu de la moyenne'} : ${T.points(r)!==null?`${clean(r.tier)} ${clean(r.rank||'')} · ${r.leaguePoints??r.lp} LP`:'indisponible'} · vérifié ${date(p.rankCheckedAt)}`);
    }else if(slot.declared.length)lines.push(`  Joueurs déclarés : ${slot.declared.map(p=>clean(p.name)).join(', ')}`);
   }
  }
  lines.push('','Conversion descriptive : 100 points/division, 400/palier + LP ; Master/Grandmaster/Challenger = base Master + LP. Ce n’est pas le MMR réel. Un compte distinct par rôle et un rang complet vérifié depuis moins de 15 min sont requis. Rôles absents, ambigus, comptes partagés, rangs partiels ou périmés exclus ; une moyenne partielle ne représente pas cinq joueurs.', 'Périmètre : toutes les équipes du groupe LEA sélectionné, indépendamment de la recherche et des filtres de parties. UWU GANG n’est inclus que si présent dans ce groupe. Pas de nouvelle collecte Riot ; les rangs absents ne sont pas inventés. Instantané à revérifier avant le match. Contient noms, Riot IDs publics et choix locaux ; aucune clé ni configuration privée.');
  return lines.join('\n');
 }
 return {build,buildGroup};
})();
if(typeof module!=='undefined')module.exports=ReportBuilder;
