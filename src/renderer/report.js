/* Explicitly selected public scouting fields only; never serialize app settings. */
const ReportBuilder=(()=>{
 const T=typeof module!=='undefined'?require('./teams'):TeamScouting,D=typeof module!=='undefined'?require('./duels'):DuelScouting;
 const clean=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
 const date=v=>Number.isFinite(v)&&v>0&&Number.isFinite(new Date(v).getTime())?new Date(v).toISOString():'date indisponible';
 const reasons={...T.rankReasons,covered:'couvert'};
 const key=a=>`${a?.platform||'EUW1'}|${a?.gameName||''}#${a?.tagLine||''}`.toLowerCase();
 const integrity=c=>[['duplicateIds','identifiant(s) répété(s) ignoré(s)'],['invalidIds','entrée(s) d’historique invalide(s) ignorée(s)'],['identityErrors','réponse(s) avec identité incohérente exclue(s)']].filter(([k])=>Number.isInteger(c?.[k])&&c[k]>0).map(([k,label])=>c[k]+' '+label).join(' · ');
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
    if(p){const a=account(p),r=slot.status==='account_changed'?null:p.bestRank;lines.push(`  Riot ID : ${a?.gameName&&a?.tagLine?`${clean(a.gameName)}#${clean(a.tagLine)} (${clean(a.platform||'EUW1')})`:'non relié'}`);
     lines.push(`  ${slot.status==='covered'?'Rang':'Dernier rang connu, exclu de la moyenne'} : ${T.points(r)!==null?`${clean(r.tier)} ${clean(r.rank||'')} · ${r.leaguePoints??r.lp} LP`:'indisponible'} · vérifié ${date(T.rankObservation(p,now).checkedAt)}`);
    }else if(slot.declared.length)lines.push(`  Joueurs déclarés : ${slot.declared.map(p=>clean(p.name)).join(', ')}`);
   }
  }
  const paired=T.rankComparison(team,home,now,lineups);
  if(paired){
   lines.push('','RANGS COMPARÉS · MÊMES RÔLES',`${paired.covered}/5 rôles communs exploitables${paired.complete?' · COMPLET':' · PARTIEL'} : ${paired.roles.join(', ')||'aucun'}`,`${clean(team.name)} : ${paired.means[0].label}`,`${clean(home.name)} : ${paired.means[1].label}`,'Deux moyennes sur les mêmes rôles uniquement ; un rôle indisponible d’un côté est retiré des deux. Compte présent dans les deux équipes exclu. Les moyennes individuelles et le tableau du groupe restent indépendants. Pas un pronostic.');
   for(const row of paired.rows)lines.push(`  ${row.role} · ${row.included?'INCLUS':'EXCLU DES DEUX MOYENNES'} · `+row.sides.map((s,i)=>`${clean(i===0?team.name:home.name)} : ${clean(s.player?.name||'non sélectionné')} / ${T.rankReasons[s.status]||'indisponible'}${s.manual?' / composition locale non confirmée LEA':''}`).join(' ; '));
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
    if(integrity(s.coverage))lines.push('  INTÉGRITÉ DES PARTIES (collecte d’origine, avant filtres) : '+integrity(s.coverage));
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
   lines.push('','CHAMPIONS OBSERVÉS SUR PLUSIEURS RÔLES · '+(draftPatch==='ALL'?'tous les patchs retenus':'patch '+clean(draftPatch)),'Historiques SoloQ individuels de comptes distincts, pas des flex compétitifs confirmés ni une recommandation de ban. Compte ou joueur partagé entre rôles exclu même si son autre rapport est absent ou inutilisable. Périmètre des pools, indépendant des filtres du comparateur.');
   // Include selected identities even when a role has no retained analysis at all.
   const multiEntries=T.roles.map(role=>{
    const pair=D.pair(team,home,role,lineups,true),old=entries.find(e=>e.role===role);
    const same=(a,b)=>a?.player?.id&&a.teamId===b?.teamId&&a.player.id===b.player?.id&&key(a.account)===key(b.account);
    const saved=old?{...old.saved,sides:[0,1].map(i=>same(pair?.sides[i],old.pair.sides[i])?old.saved.sides[i]:null)}:null;
    return {role,pair,saved};
   });
   D.multiRolePools(multiEntries,draftPatch).forEach((side,i)=>{
    lines.push(`${clean(i===0?team.name:home?.name||'UWU GANG')} : ${side.covered}/5 rôles avec pool exploitable · exclus : ${side.excluded.join(', ')||'aucun'}`);
    if(!side.champions.length)lines.push('  Aucun champion observé sur au moins deux rôles, pas une absence de maîtrise.');
    for(const c of side.champions){lines.push('  '+clean(c.name));for(const v of c.cells)lines.push(`    ${v.role} · ${clean(v.player.name)} : ${v.games}/${v.total} (${v.share}%) · collecte ${date(v.sampledAt)} · période ${date(v.window?.oldestAt)} → ${date(v.window?.newestAt)}${v.limited?' · moins de 3 parties':''}${v.partial?' · COLLECTE PARTIELLE':''}${v.window?.stale?' · DONNÉES ANCIENNES':''}${v.restoredAfterError?' · RESTAURÉ APRÈS ÉCHEC':''}`);}
   });
   lines.push('','POOLS OBSERVÉS · PRÉPARATION DRAFT · '+(draftPatch==='ALL'?'tous les patchs retenus':'patch '+clean(draftPatch)),'Périmètre indépendant des filtres du comparateur détaillé. Fréquence = parties champion / parties retenues au rôle et au patch. Pas le répertoire complet, pas une recommandation de ban.');
   for(const row of D.draftPools(entries,draftPatch))row.sides.forEach((side,i)=>{
    lines.push(`${row.role} · ${clean(i===0?team.name:home?.name||'UWU GANG')} · ${clean(side.player?.name||'joueur non sélectionné')}`);
    if(row.restoredAfterError)lines.push('  RAPPORT RESTAURÉ APRÈS ÉCHEC : dates d’origine, pas une actualisation réussie.');
    if(side.poolStatus!=='loaded'){lines.push('  '+({unobserved:'Aucune partie observée sur ce patch dans cet échantillon.',empty:'Aucune partie exploitable.',invalid:'Pool incohérent : fréquences indisponibles.'}[side.poolStatus]||'Rapport non chargé ou indisponible.'));return;}
    const s=side.report;lines.push(`  ${s.games} parties · champions identifiés ${side.identifiedGames}/${s.games} · période ${date(s.window?.oldestAt)} → ${date(s.window?.newestAt)} · collecte ${date(s.sampledAt)}${s.coverage?.partial?' · COLLECTE PARTIELLE':''}${s.window?.stale?' · DONNÉES ANCIENNES':''}`);
    if(integrity(s.coverage))lines.push('  INTÉGRITÉ DES PARTIES (collecte d’origine, avant filtres) : '+integrity(s.coverage));
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
    if(p){const a=account(p),r=slot.status==='account_changed'?null:p.bestRank;lines.push(`  Riot ID : ${a?.gameName&&a?.tagLine?`${clean(a.gameName)}#${clean(a.tagLine)} (${clean(a.platform||'EUW1')})`:'non relié'}`);
     lines.push(`  ${slot.status==='covered'?'Rang':'Dernier rang connu, exclu de la moyenne'} : ${T.points(r)!==null?`${clean(r.tier)} ${clean(r.rank||'')} · ${r.leaguePoints??r.lp} LP`:'indisponible'} · vérifié ${date(T.rankObservation(p,now).checkedAt)}`);
    }else if(slot.declared.length)lines.push(`  Joueurs déclarés : ${slot.declared.map(p=>clean(p.name)).join(', ')}`);
   }
  }
  lines.push('','Conversion descriptive : 100 points/division, 400/palier + LP ; Master/Grandmaster/Challenger = base Master + LP. Ce n’est pas le MMR réel. Un compte distinct par rôle et un rang complet vérifié depuis moins de 15 min sont requis. Rôles absents, ambigus, comptes partagés, rangs partiels ou périmés exclus ; une moyenne partielle ne représente pas cinq joueurs.', 'Périmètre : toutes les équipes du groupe LEA sélectionné, indépendamment de la recherche et des filtres de parties. UWU GANG n’est inclus que si présent dans ce groupe. Pas de nouvelle collecte Riot ; les rangs absents ne sont pas inventés. Instantané à revérifier avant le match. Contient noms, Riot IDs publics et choix locaux ; aucune clé ni configuration privée.');
  return lines.join('\n');
 }
 function buildChampion({team,home,lineups={},version='',ouat={},entries=[],patch='ALL',champion='',now=Date.now()}){
  if(!team||!home||team.id===home.id)throw new Error('Comparaison d’équipes indisponible.');
  const current=T.roles.map(role=>{
   const pair=D.pair(team,home,role,lineups,true),hits=entries.filter(e=>e?.role===role&&e.pair?.key===pair.key);
   const saved=hits.length===1?hits[0].saved:null,age=saved?now-saved.loadedAt:Infinity;
   return {role,pair,saved:Number.isFinite(saved?.loadedAt)&&Number.isFinite(age)&&age>=0&&age<15*60*1000?saved:null,loading:hits.length===1&&!!hits[0].loading};
  });
  if(patch!=='ALL'&&!D.draftPatches(current).includes(patch))throw new Error('Patch absent des rapports actuels.');
  const lookup=D.championLookup(current,patch,champion);
  if(!lookup.selected)throw new Error('Champion absent des pools actuels.');
  const lines=['MIDPULSE '+clean(version)+' — FICHE DU CHAMPION',clean(lookup.selected)+' · '+(patch==='ALL'?'tous les patchs retenus':'patch '+clean(patch)),clean(team.name)+' / '+clean(home.name),'Généré : '+date(now),'Effectif LEA : '+clean(ouat.season||'saison inconnue')+' · actualisé '+date(ouat.updatedAt)];
  if(ouat.warning)lines.push('AVERTISSEMENT DE COLLECTE DE L’EFFECTIF.');
  lines.push('Couverture : '+lookup.rows.flatMap(r=>r.sides).filter(s=>s.poolStatus==='loaded').length+'/10 pools non vides au rôle/patch · '+lookup.rows.flatMap(r=>r.sides).filter(s=>s.champion).length+'/10 cases avec champion observé.');
  lines.push('Deux historiques SoloQ indépendants, pas des duels directs ni des flex compétitifs confirmés. Aucun total d’équipe.','Périmètre propre à cette fiche : champion et patch des pools ; filtres du comparateur détaillé indépendants.');
  for(const row of lookup.rows){
   lines.push('',row.role);
   if(row.loading)lines.push('COLLECTE EN COURS : instantané partiel.');
   if(row.restoredAfterError)lines.push('RESTAURÉ APRÈS ÉCHEC : dates d’origine, pas une actualisation réussie.');
   for(const [i,side]of row.sides.entries()){
    const a=side.account,r=side.report,c=side.champion,p=side.performance;
    lines.push(clean(i===0?team.name:home.name)+' · '+clean(side.player?.name||'joueur non sélectionné')+' · '+(side.manual?'composition locale non confirmée LEA':'déclaration LEA, titularisation non confirmée'));
    if(a?.gameName&&a?.tagLine)lines.push('  Riot ID : '+clean(a.gameName)+'#'+clean(a.tagLine)+' ('+clean(a.platform||'EUW1')+')');
    if(side.poolStatus!=='loaded'){const entry=current.find(e=>e.role===row.role),missing=entry.pair.sides[i].reason||(entry.saved?.sides[i]?.error?'Rapport indisponible après erreur de collecte':'Rapport non chargé');lines.push('  '+clean(({missing,unobserved:'Patch non observé dans le rapport',empty:'Aucune partie au rôle',invalid:'Pool incohérent'})[side.poolStatus]||'Indisponible'));continue;}
    lines.push('  '+(c?c.games+'/'+r.games+' parties au rôle ('+c.share+'%)'+(c.limited?' · moins de 3 parties':''):'Non observé parmi '+r.games+' parties au rôle · '+side.identifiedGames+' avec champion identifié'));
    lines.push('  Collecte : '+date(r.sampledAt)+' · période du rôle '+date(r.window?.oldestAt)+' → '+date(r.window?.newestAt));
    if(r.coverage?.partial)lines.push('  COLLECTE PARTIELLE');if(r.window?.stale)lines.push('  DONNÉES ANCIENNES');if(r.window?.partial)lines.push('  DATES PARTIELLES');if(integrity(r.coverage))lines.push('  INTÉGRITÉ DES PARTIES : '+integrity(r.coverage));
    if(!c)continue;
    if(p){lines.push('  CHAMPION : '+p.wins+'/'+p.games+' victoires ('+p.winrate+'%) · KDA '+p.kda+' · CS/min '+p.cspm+' · dégâts/min '+p.dpm+' · vision/partie '+p.vision,'  Période du champion : '+date(p.window.oldestAt)+' → '+date(p.window.newestAt)+(p.window.partial?' · DATES PARTIELLES':'')+(p.window.stale?' · DONNÉES ANCIENNES':''));
     if(p.omittedGames)lines.push('  '+p.omittedGames+' partie(s) avec champs numériques omis par Riot, traités comme zéro.');
    }else lines.push('  Statistiques du champion indisponibles ou incohérentes ; aucune métrique globale substituée.');
    const trace=c.trace||{status:'unavailable',rows:[]};
    lines.push('  PARTIES SOURCES : '+trace.rows.length+'/'+c.games+' · '+({complete:'COMPLÈTES',partial:'PARTIELLES',inconsistent:'INCOHÉRENTES, masquées',unavailable:'INDISPONIBLES'}[trace.status]||'INDISPONIBLES'));
    for(const m of trace.rows)lines.push('    '+clean(m.matchId||'Identifiant indisponible')+' · '+date(m.startedAt)+' · patch '+clean(m.patch||'indisponible')+' · '+(m.win?'Victoire':'Défaite')+' · '+(m.seconds===null?'durée indisponible':m.seconds+' s')+' · K/D/A '+[m.kills,m.deaths,m.assists].map(v=>Number.isFinite(v)?v:'—').join('/'));
   }
  }
  lines.push('','Limites : fréquence = parties champion / parties retenues au rôle et patch, pas le répertoire complet. Non observé ne signifie pas non maîtrisé. Une liste source partielle ne recalcule pas les fréquences.','KDA cumulé ; CS/min et dégâts/min pondérés par durée ; vision moyenne par partie. Pas du micro-gameplay, du MMR ou une preuve d’effet du patch.','Sources : https://api.leamateur.pro · API Riot Match-v5. Instantané sans nouvel appel Riot ; noms/Riot IDs publics et choix locaux, aucune clé ou configuration privée.');
  return lines.join('\n');
 }
 function buildBrief({team,home,lineups={},version='',ouat={},duels=[],now=Date.now()}){
  if(!team)throw new Error('Aucune équipe sélectionnée.');
  const sides=[team,...(home&&home.id!==team.id?[home]:[])],summaries=sides.map(t=>T.summarize(t.players,now,T.lineup(lineups,t.id)));
  const lines=[`MIDPULSE ${clean(version)} — FICHE EXPRESS · 5 RÔLES`,`${clean(team.name)} / ${clean(home?.name||'UWU GANG introuvable')}`,`Généré : ${date(now)}`,`LEA : ${clean(ouat.season||'saison inconnue')} · actualisé ${date(ouat.updatedAt)}`,`Division / groupe : ${clean(team.division)} / ${clean(team.group)}`];
  if(ouat.warning)lines.push('ATTENTION : avertissement de collecte LEA.');
  sides.forEach((t,i)=>lines.push(`Moyenne ${clean(t.name)} : ${summaries[i].label} · ${summaries[i].covered}/5 rôles${summaries[i].complete?'':' · PARTIEL'}`));
  const paired=T.rankComparison(team,home,now,lineups);
  if(paired)lines.push(`Mêmes rôles : ${paired.covered}/5 (${paired.roles.join(', ')||'aucun'}) · ${clean(team.name)} ${paired.means[0].label} / ${clean(home.name)} ${paired.means[1].label}`);
  const identity=a=>a?.gameName&&a?.tagLine?`${a.platform||'EUW1'}|${a.gameName.trim()}#${a.tagLine.trim()}`.toLowerCase():'';
  const matches=(a,b)=>!!a&&!!b&&a.role===b.role&&b.sides.every((s,i)=>!s.reason&&String(a.sides?.[i]?.teamId)===String(s.teamId)&&a.sides?.[i]?.player?.id===s.player?.id&&identity(a.sides?.[i]?.account)===identity(s.account));
  for(const [index,role]of T.roles.entries()){
   const expected=D.pair(team,home,role,lineups,true),analysis=(Array.isArray(duels)?duels:[]).find(a=>matches(a?.pair,expected));
   const patch=analysis?.patch||'ALL';lines.push('',`${role} · ${patch==='ALL'?'tous les patchs retenus':'patch '+clean(patch)}`);
   sides.forEach((t,i)=>{
    const slot=summaries[i].slots[index],p=slot.players.length===1?slot.players[0]:null;
    if(!p){lines.push(`${clean(t.name)} : non sélectionné · ${reasons[slot.status]||'indisponible'}${slot.declared.length?' · déclarés : '+slot.declared.map(p=>clean(p.name)).join(', '):''}`);return;}
    const observation=T.rankObservation(p,now),a=observation.account||p.accounts?.[0],r=slot.status==='account_changed'?null:p.bestRank;
    lines.push(`${clean(t.name)} : ${clean(p.name)} · ${a?.gameName&&a?.tagLine?clean(a.gameName)+'#'+clean(a.tagLine)+' ('+clean(a.platform||'EUW1')+')':'compte non relié'} · ${slot.manual?'choix local, non confirmé LEA':'déclaré LEA, titulaire non confirmé'}`);
    lines.push(`  Rang : ${T.points(r)!==null?clean(r.tier)+' '+clean(r.rank||'')+' · '+(r.leaguePoints??r.lp)+' LP':'indisponible'} · ${reasons[slot.status]||'indisponible'} · vérifié ${date(observation.checkedAt)}`);
    const champion=Array.isArray(analysis?.champions)&&analysis.champions.length===2?analysis.champions[i]:analysis?.champion||'ALL',raw=analysis?.reports?.[i];
    const s=raw?.role===role&&Number.isInteger(raw.games)&&raw.games>=0?D.scopeReport(raw,patch,champion):null;
    if(!s||!Number.isInteger(s.games)||s.games<0){lines.push('  SoloQ : rapport non chargé ou indisponible pour ce joueur/compte.');return;}
    const warnings=[s.games<3?'ÉCHANTILLON FAIBLE (<3)':null,s.coverage?.partial?'COLLECTE PARTIELLE':null,s.window?.stale?'DONNÉES ANCIENNES':null,analysis.loading?'COLLECTE EN COURS':null,analysis.restoredAfterError?'RESTAURÉ APRÈS ÉCHEC, dates d’origine':null].filter(Boolean);
    lines.push(`  SoloQ : ${s.games} parties · champion ${champion==='ALL'?'tous ceux retenus':clean(champion)} · période ${date(s.window?.oldestAt)} → ${date(s.window?.newestAt)} · collecte ${date(s.sampledAt)}${warnings.length?' · '+warnings.join(' · '):''}`);
    if(!s.games){lines.push('  Aucune partie exploitable dans ce périmètre ; pas une absence de maîtrise.');return;}
    const poolSide=D.draftPools([{role,pair:expected,saved:{sides:[0,1].map(n=>n===i?{report:s}:null)}}]).find(row=>row.role===role)?.sides[i];
    const pool=poolSide?.poolStatus==='loaded'?poolSide.champions:[];
    const metrics=[['winrate','WR (%)'],['cspm','CS/min'],['kda','KDA']].filter(([k])=>Number.isFinite(s[k])).map(([k,label])=>label+' '+s[k]);
    lines.push('  '+(metrics.join(' · ')||'Mesures indisponibles')+' · champions observés : '+(poolSide?.poolStatus==='invalid'?'POOL INCOHÉRENT':pool.slice(0,3).map(c=>clean(c.name)+' '+c.games+'/'+s.games+'G').join(', ')||'indisponibles')+(pool.length>3?' · autres dans le rapport détaillé':''));
    const ids=[...new Set((Array.isArray(s.evidence)?s.evidence:[]).filter(m=>m?.role===role&&typeof m.win==='boolean'&&/^[A-Z0-9]+_[0-9]+$/.test(m.matchId||'')).map(m=>m.matchId))];
    lines.push('  Sources Match-v5 (3 max listées) : '+(ids.slice(0,3).join(', ')||'indisponibles, recollecter pour les obtenir')+(ids.length>3?' · '+(ids.length-3)+' autres dans le rapport détaillé':''));
    if(integrity(s.coverage))lines.push('  INTÉGRITÉ : '+integrity(s.coverage));
   });
  }
  lines.push('','Conversion : 100 points/division, 400/palier + LP ; Master/Grandmaster/Challenger = base Master + LP. Pas le MMR réel. Moyennes : compte distinct, rang complet de moins de 15 min ; exclusions explicites. Une moyenne partielle ne représente pas cinq joueurs.',
   'Filtres : ceux mémorisés par rôle dans le comparateur, pas le filtre indépendant des pools draft. Jusqu’à 12 parties au rôle parmi les 20 dernières SoloQ par compte ; deux historiques individuels, pas des confrontations directes. Fréquences observées, pas le répertoire complet ni une recommandation de ban. Pas de pronostic ni de micro-gameplay.',
   'Sources : https://api.leamateur.pro (déclarations) · API Riot Match-v5/rangs SoloQ. Rapport détaillé pour toutes les parties et limites. Instantané sans nouvel appel Riot ; noms/Riot IDs publics et choix locaux, aucune clé ou configuration privée.');
  return lines.join('\n');
 }
 return {build,buildGroup,buildBrief,buildChampion};
})();
if(typeof module!=='undefined')module.exports=ReportBuilder;
