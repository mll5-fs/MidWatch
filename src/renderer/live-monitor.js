const LiveMonitor=(()=>{
 const TTL=120000;
 function project(player,value,metadata={},now=Date.now()){
  const checkedAt=Number(metadata.liveCheckedAt),known=typeof value==='boolean';
  const fresh=known&&Number.isFinite(checkedAt)&&checkedAt>0&&now>=checkedAt&&now-checkedAt<=TTL;
  return {...player,live:fresh?value:null,liveAccount:fresh&&value?metadata.liveAccount||null:null,
   liveCheckedAt:Number.isFinite(checkedAt)&&checkedAt>0?checkedAt:null,liveStale:known&&!fresh,liveError:metadata.liveError||null};
 }
 function label(player){
  if(player.live===true)return '● EN GAME';
  if(player.live===false)return '○ HORS LIGNE';
  if(player.liveStale)return '◌ STATUT À REVÉRIFIER';
  if(player.liveError)return '◌ STATUT INDISPONIBLE';
  return '◌ LIVE NON VÉRIFIÉ';
 }
 function priority(players,selectedTeam,teams=[]){
  const selected=teams.find(t=>t.id===selectedTeam),home=teams.find(t=>t.name.trim().toUpperCase()==='UWU GANG');
  return [...new Set([...(selected?.players||[]),...(home?.players||[]),...players].map(p=>p.id))].slice(0,100);
 }
 return {TTL,project,label,priority};
})();
if(typeof module!=='undefined')module.exports=LiveMonitor;
