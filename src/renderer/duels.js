/* Independent SoloQ samples, never a prediction or direct head-to-head record. */
const DuelScouting=(()=>{
 const teams=typeof module!=='undefined'?require('./teams'):TeamScouting;
 const accountKey=a=>a?.gameName&&a?.tagLine?`${a.platform||'EUW1'}|${a.gameName.trim()}#${a.tagLine.trim()}`.toLowerCase():'';
 function pair(team,home,role,choices={},hasKey=false){
  if(!team||!home||team.id===home.id)return null;
  const sides=[team,home].map(t=>{
   const slot=teams.summarize(t.players,Date.now(),teams.lineup(choices,t.id)).slots.find(s=>s.role===role);
   const player=slot?.players.length===1?slot.players[0]:null;
   const account=player?.accounts?.find(a=>accountKey(a)&&accountKey(a)===accountKey(player.bestRankAccount))||player?.accounts?.[0];
   const reason=!player?(slot?.manual?'Choix local absent de l’effectif.':'Choisis un seul joueur déclaré pour ce rôle.'):
    !account?.gameName||!account?.tagLine?'Compte Riot non relié.':'';
   return {teamId:t.id,teamName:t.name,player,account,manual:!!slot?.manual,reason};
  });
  if(sides.every(s=>!s.reason)&&accountKey(sides[0].account)===accountKey(sides[1].account))for(const side of sides)side.reason='Même compte relié aux deux joueurs : comparaison exclue.';
  const key=JSON.stringify([role,hasKey,...sides.map(s=>[s.teamId,s.player?.id,s.account?.platform||'EUW1',s.account?.gameName,s.account?.tagLine,s.reason])]);
  return {key,role,sides,ready:hasKey&&sides.every(s=>!s.reason)};
 }
 function create(){
  const state={key:'',request:0,loading:false,sides:[]};
  function sync(key){if(key!==state.key){state.key=key;state.request++;state.loading=false;state.sides=[];}return state;}
  function cancel(){state.request++;state.loading=false;state.key='';state.sides=[];}
  async function load(pair,fetchReport,onUpdate=()=>{}){
   if(!pair?.ready)return;
   sync(pair.key);if(state.loading)return;
   const request=++state.request;state.loading=true;state.sides=[];onUpdate();
   const current=()=>request===state.request&&state.key===pair.key;
   try{
    for(const [i,side]of pair.sides.entries()){
     if(!current())return;
     try{
      const report=await fetchReport(side.account,pair.role);
      if(!current())return;
      if(report?.role!==pair.role||!Number.isInteger(report.games)||report.games<0)throw new Error('Rapport incohérent pour le rôle demandé.');
      state.sides[i]={report};onUpdate();
      if(['auth','rate_limit'].includes(report.coverage?.stop)){
       if(i===0)state.sides[1]={error:'Non chargé : collecte interrompue par Riot. Relance après vérification de la clé ou du quota.'};break;
      }
     }catch(e){
      if(!current())return;
      state.sides[i]={error:String(e.message||e)};
      if(i===0)state.sides[1]={error:'Non chargé après l’erreur du premier compte. Relance pour réessayer.'};break;
     }
    }
   }finally{if(current()){state.loading=false;onUpdate();}}
  }
  return {state,sync,cancel,load};
 }
 return {pair,create};
})();
if(typeof module!=='undefined')module.exports=DuelScouting;
