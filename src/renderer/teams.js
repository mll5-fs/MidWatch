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
  if(score>=2800)return `MASTER+ · ${Math.round(score-2800)} LP moyens`;
  const value=Math.max(0,Math.round(score)),tier=Math.min(6,Math.floor(value/400)),division=Math.floor(value%400/100);
  return `${tiers[tier]} ${["IV","III","II","I"][division]} · ${value%100} LP`;
 }
 function summarize(players,now=Date.now()){
  const slots=roles.map(role=>({role,players:players.filter(p=>p.role===role)}));
  const used=new Set();let excluded=0;
  const values=slots.flatMap(slot=>{
   if(slot.players.length!==1){excluded++;return [];}
   const p=slot.players[0],value=points(p.bestRank),a=p.bestRankAccount||p.accounts?.[0],key=a?`${a.platform||"EUW1"}|${a.gameName}#${a.tagLine}`.toLowerCase():"";
   const fresh=Number.isFinite(p.rankCheckedAt)&&p.rankCheckedAt<=now&&now-p.rankCheckedAt<15*60*1000;
   if(value===null||p.rankStatus!=="ranked"||!fresh||!key||used.has(key)){excluded++;return [];}
   used.add(key);return [value];
  });
  const score=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  return {slots,covered:values.length,excluded,score,label:label(score),complete:values.length===5};
 }
 function group(players){const map=new Map();for(const p of players){const key=String(p.teamId||p.team);if(!map.has(key))map.set(key,{id:key,name:p.team||"Équipe inconnue",division:p.division||"Sans division",group:p.group||"Groupe non publié",players:[]});map.get(key).players.push(p);}return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));}
 return {roles,points,label,summarize,group};
})();
if(typeof module!=="undefined")module.exports=TeamScouting;
