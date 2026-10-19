/* Descriptive summary of official ranks; never an estimate of hidden MMR. */
const TeamScouting = (()=>{
 const roles=["TOP","JUNGLE","MID","ADC","SUPPORT"],tiers=["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND"];
 function points(rank){
  if(!rank)return null;const lp=rank.leaguePoints??rank.lp;
  if(!Number.isFinite(lp)||lp<0)return null;
  const tier=String(rank.tier||"").toUpperCase(),index=tiers.indexOf(tier);
  if(index>=0){const division={IV:0,III:1,II:2,I:3}[rank.rank];return division===undefined||lp>100?null:index*400+division*100+lp;}
  return ["MASTER","GRANDMASTER","CHALLENGER"].includes(tier)?2800+lp:null;
 }
 function label(score){
  if(!Number.isFinite(score))return "Indisponible";
  if(Math.round(score)>=2800)return `MASTER+ · ${Math.max(0,Math.round(score-2800))} LP moyens`;
  const value=Math.max(0,Math.round(score)),tier=Math.min(6,Math.floor(value/400)),division=Math.floor(value%400/100);
  return `${tiers[tier]} ${["IV","III","II","I"][division]} · ${value%100} LP`;
 }
 function lineup(choices,teamId){return Object.hasOwn(choices||{},String(teamId))?choices[String(teamId)]:{};}
 const rankAccountKey=a=>a?.gameName&&a?.tagLine?`${a.platform||'EUW1'}|${a.gameName.trim()}#${a.tagLine.trim()}`.toLowerCase():'';
 function rankObservation(player={},now=Date.now()){
  const accounts=(player.accounts||[]).filter(a=>rankAccountKey(a)),preferred=player.bestRankAccount;
  const account=preferred?accounts.find(a=>rankAccountKey(a)===rankAccountKey(preferred)):accounts[0];
  const at=player.rankCheckedAt,validDate=Number.isFinite(at)&&at>0&&at<=now;
  const fresh=validDate&&now-at<15*60*1000;
  const status=!accounts.length?'account_missing':!account?'account_changed':player.rankStatus==='error'?'error':player.rankStatus==='partial'?'partial':player.rankStatus==='ranked'&&points(player.bestRank)===null?'invalid':['ranked','unranked'].includes(player.rankStatus)?fresh?player.rankStatus:'stale':'pending';
  return {status,account:account||null,checkedAt:account&&validDate?at:null};
 }
 function updateLineup(choices,players,teamId,role,playerId){
  const team=group(players).find(t=>t.id===String(teamId));
  if(!team||!roles.includes(role)||typeof playerId!=="string"||playerId&&!team.players.some(p=>p.role===role&&p.id===playerId))throw new Error("Choix de composition invalide pour cet effectif LEA.");
  const next={...choices},selection={...lineup(choices,team.id)};
  if(playerId)selection[role]=playerId;else delete selection[role];
  Object.defineProperty(next,team.id,{value:selection,enumerable:true,configurable:true,writable:true});return next;
 }
 function summarize(players,now=Date.now(),selection={}){
  const slots=roles.map(role=>{const declared=players.filter(p=>p.role===role),chosen=Object.hasOwn(selection,role)?selection[role]:null;return {role,declared,manual:chosen!==null,players:chosen!==null?declared.filter(p=>p.id===chosen):declared};});
  const accountKey=p=>rankAccountKey(rankObservation(p,now).account);
  const keys=slots.filter(s=>s.players.length===1).map(s=>accountKey(s.players[0])).filter(Boolean);
  let excluded=0;
  const values=slots.flatMap(slot=>{
   if(slot.players.length!==1){slot.status=slot.manual?"selection_missing":slot.players.length?"ambiguous":"missing";excluded++;return [];}
   const p=slot.players[0],value=points(p.bestRank),key=accountKey(p),observation=rankObservation(p,now);
   slot.status=observation.status==='account_changed'?'account_changed':!key?'account_missing':keys.filter(k=>k===key).length>1?'duplicate':({ranked:'covered',error:'error',partial:'partial',stale:'stale'}[observation.status]||'rank_missing');
   if(slot.status!=="covered"){excluded++;return [];}
   return [value];
  });
  const score=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  return {slots,covered:values.length,excluded,score,label:label(score),complete:values.length===5};
 }
 const rankReasons={covered:'rang exploitable',missing:'joueur absent',ambiguous:'plusieurs joueurs, aucun choix local',selection_missing:'choix local absent de l’effectif',account_missing:'compte non relié',duplicate:'compte partagé entre rôles',error:'erreur Riot',partial:'rang partiel',rank_missing:'rang absent ou non classé',stale:'rang périmé ou date invalide',account_changed:'compte du rang absent de l’effectif actuel',shared:'compte présent dans les deux équipes'};
 function rankComparison(team,home,now=Date.now(),choices={}){
  if(!team||!home||team.id===home.id)return null;
  const key=a=>a?.gameName&&a?.tagLine?`${a.platform||'EUW1'}|${a.gameName.trim()}#${a.tagLine.trim()}`.toLowerCase():'';
  const summaries=[team,home].map(t=>summarize(t.players,now,lineup(choices,t.id)));
  const sides=summaries.map(s=>s.slots.map(slot=>{
   const p=slot.players.length===1?slot.players[0]:null,preferred=p?.bestRankAccount||p?.accounts?.[0];
   const account=p?.accounts?.find(a=>key(a)&&key(a)===key(preferred))||null;
   return {player:p,account,manual:slot.manual,status:slot.status==='covered'&&!account?'account_changed':slot.status,checkedAt:p?.rankCheckedAt,score:slot.status==='covered'&&account?points(p.bestRank):null};
  }));
  const keys=sides.map(ss=>new Set(ss.map(s=>key(s.account)).filter(Boolean)));
  const rows=roles.map((role,i)=>{
   const pair=sides.map((ss,j)=>{const s=ss[i];return {...s,status:s.status==='covered'&&keys[1-j].has(key(s.account))?'shared':s.status};});
   return {role,sides:pair,included:pair.every(s=>s.status==='covered')};
  });
  const common=rows.filter(r=>r.included),means=[0,1].map(i=>{const score=common.length?common.reduce((n,r)=>n+r.sides[i].score,0)/common.length:null;return {score,label:label(score)};});
  return {rows,roles:common.map(r=>r.role),covered:common.length,complete:common.length===5,means};
 }
 function group(players){const map=new Map();for(const p of players){const key=String(p.teamId||p.team);if(!map.has(key))map.set(key,{id:key,name:p.team||"Équipe inconnue",division:p.division||"Sans division",group:p.group||"Groupe non publié",players:[]});map.get(key).players.push(p);}return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));}
 function groupBoard(teams,selectedId,now=Date.now(),choices={}){
  const selected=teams.find(t=>t.id===selectedId);
  if(!selected||selected.division==="Sans division"||selected.group==="Groupe non publié")return {known:false,rows:[]};
  const rows=teams.filter(t=>t.division===selected.division&&t.group===selected.group).map(team=>({team,summary:summarize(team.players,now,lineup(choices,team.id))}));
  rows.sort((a,b)=>Number(b.summary.complete)-Number(a.summary.complete)||(a.summary.complete?b.summary.score-a.summary.score:0)||a.team.name.localeCompare(b.team.name));
  for(const row of rows)row.position=row.summary.complete?1+rows.filter(r=>r.summary.complete&&r.summary.score>row.summary.score).length:null;
  return {known:true,division:selected.division,group:selected.group,rows};
 }
 function rankPriority(players,selectedId,onScreen=[],fallback=[],now=Date.now(),choices={}){
  const teams=group(players),selected=teams.find(t=>t.id===selectedId),home=teams.find(t=>t.name.trim().toUpperCase()==='UWU GANG');
  const ids=t=>!t?[]:[...summarize(t.players,now,lineup(choices,t.id)).slots.flatMap(s=>s.players.length===1?s.players:[]),...t.players].map(p=>p.id);
  const groupIds=groupBoard(teams,selectedId,now,choices).rows.flatMap(row=>row.team.players.map(p=>p.id)),known=new Set(players.map(p=>p.id));
  return [...new Set([...ids(selected),...ids(home),...onScreen,...groupIds,...fallback])].filter(id=>known.has(id)).slice(0,100);
 }
 function rankProgress(players,now=Date.now()){
  const labels={ranked:'classé vérifié',unranked:'non classé vérifié',pending:'à charger',error:'erreur Riot',partial:'résultat partiel',stale:'vérification périmée',account_missing:'compte absent',account_changed:'compte du rang absent de l’effectif actuel',invalid:'rang incohérent'};
  const rows=players.map(player=>{
   const observation=rankObservation(player,now);
   return {player,...observation,label:labels[observation.status]};
  });
  return {rows,total:rows.length,counts:Object.fromEntries(Object.keys(labels).map(key=>[key,rows.filter(r=>r.status===key).length])),labels};
 }
 return {roles,points,label,summarize,group,groupBoard,lineup,updateLineup,rankPriority,rankProgress,rankObservation,rankComparison,rankReasons};
})();
if(typeof module!=="undefined")module.exports=TeamScouting;
