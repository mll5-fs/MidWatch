/* Descriptive summary of official ranks; never an estimate of hidden MMR. */
const TeamScouting = (()=>{
 const roles=["TOP","JUNGLE","MID","ADC","SUPPORT"],tiers=["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND"];
 function points(rank){
  if(!rank)return null;const lp=Number(rank.leaguePoints??rank.lp);
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
 function updateLineup(choices,players,teamId,role,playerId){
  const team=group(players).find(t=>t.id===String(teamId));
  if(!team||!roles.includes(role)||typeof playerId!=="string"||playerId&&!team.players.some(p=>p.role===role&&p.id===playerId))throw new Error("Choix de composition invalide pour cet effectif LEA.");
  const next={...choices},selection={...lineup(choices,team.id)};
  if(playerId)selection[role]=playerId;else delete selection[role];
  Object.defineProperty(next,team.id,{value:selection,enumerable:true,configurable:true,writable:true});return next;
 }
 function summarize(players,now=Date.now(),selection={}){
  const slots=roles.map(role=>{const declared=players.filter(p=>p.role===role),chosen=Object.hasOwn(selection,role)?selection[role]:null;return {role,declared,manual:chosen!==null,players:chosen!==null?declared.filter(p=>p.id===chosen):declared};});
  const accountKey=p=>{const a=p.bestRankAccount||p.accounts?.[0];return a?.gameName&&a?.tagLine?`${a.platform||"EUW1"}|${a.gameName.trim()}#${a.tagLine.trim()}`.toLowerCase():"";};
  const keys=slots.filter(s=>s.players.length===1).map(s=>accountKey(s.players[0])).filter(Boolean);
  let excluded=0;
  const values=slots.flatMap(slot=>{
   if(slot.players.length!==1){slot.status=slot.manual?"selection_missing":slot.players.length?"ambiguous":"missing";excluded++;return [];}
   const p=slot.players[0],value=points(p.bestRank),key=accountKey(p);
   const fresh=Number.isFinite(p.rankCheckedAt)&&p.rankCheckedAt<=now&&now-p.rankCheckedAt<15*60*1000;
   slot.status=!key?"account_missing":keys.filter(k=>k===key).length>1?"duplicate":p.rankStatus==="error"?"error":p.rankStatus==="partial"?"partial":value===null||p.rankStatus!=="ranked"?"rank_missing":!fresh?"stale":"covered";
   if(slot.status!=="covered"){excluded++;return [];}
   return [value];
  });
  const score=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  return {slots,covered:values.length,excluded,score,label:label(score),complete:values.length===5};
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
 return {roles,points,label,summarize,group,groupBoard,lineup,updateLineup};
})();
if(typeof module!=="undefined")module.exports=TeamScouting;
