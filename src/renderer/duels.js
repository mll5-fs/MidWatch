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
 function compare(left,right){
  if(!left?.games||!right?.games||left.role!==right.role)return null;
  const metric=(key,label,digits=1)=>{
   const a=Number(left[key]),b=Number(right[key]);if(!Number.isFinite(a)||!Number.isFinite(b))return null;
   const round=n=>Number(n.toFixed(digits));return {key,label,left:round(a),right:round(b),delta:round(a-b)};
  };
  const metrics=[metric('winrate','WIN RATE',0),metric('kda','KDA'),metric('kills','KILLS'),metric('deaths','DEATHS'),metric('assists','ASSISTS'),metric('cspm','CS/MIN'),metric('dpm','DÉGÂTS/MIN',0),metric('gpm','OR/MIN',0),metric('vision','VISION/PARTIE')].filter(Boolean);
  const pool=report=>new Map((report.champions||[]).filter(c=>c?.name&&Number.isFinite(c.games)&&c.games>0).map(c=>[String(c.name).toLowerCase(),{name:String(c.name),games:c.games}]));
  const a=pool(left),b=pool(right),common=[...a.keys()].filter(k=>b.has(k)).map(k=>({name:a.get(k).name,left:a.get(k).games,right:b.get(k).games}));
  const exclusive=(source,other)=>[...source.entries()].filter(([k])=>!other.has(k)).map(([,c])=>c);
  const patchGames=report=>new Map((report.patches||[]).filter(p=>p?.patch&&Number.isFinite(p.games)&&p.games>0).map(p=>[String(p.patch),p.games]));
  const pa=patchGames(left),pb=patchGames(right),patches=[...pa.keys()].filter(k=>pb.has(k)).sort().reverse().map(patch=>({patch,left:pa.get(patch),right:pb.get(patch)}));
  const interval=report=>Number.isFinite(report.interval?.low)&&Number.isFinite(report.interval?.high)?{low:report.interval.low,high:report.interval.high}:null;
  return {role:left.role,games:[left.games,right.games],metrics,intervals:[interval(left),interval(right)],champions:{common,leftOnly:exclusive(a,b),rightOnly:exclusive(b,a)},patches,
   limitations:{partial:[!!left.coverage?.partial,!!right.coverage?.partial],stale:[!!left.window?.stale,!!right.window?.stale]}};
 }
 return {pair,create,compare};
})();
if(typeof module!=='undefined')module.exports=DuelScouting;
