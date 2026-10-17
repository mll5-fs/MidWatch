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
 function create({now=Date.now}={}){
  const cache=new Map(),maxAge=15*60*1000;
  const state={key:'',request:0,loading:false,sides:[],loadedAt:null,reused:false};
  function peek(key){const value=cache.get(key),age=value?now()-value.loadedAt:Infinity;if(age<0||age>=maxAge){cache.delete(key);return null;}return value?{...value,sides:value.sides.slice()}:null;}
  function remember(){state.loadedAt=now();cache.delete(state.key);cache.set(state.key,{key:state.key,sides:state.sides.slice(),loadedAt:state.loadedAt});while(cache.size>30)cache.delete(cache.keys().next().value);}
  function sync(key){if(key!==state.key||(!state.loading&&state.loadedAt!==null&&!peek(key))){const saved=peek(key);state.key=key;state.request++;state.loading=false;state.sides=saved?.sides||[];state.loadedAt=saved?.loadedAt??null;state.reused=!!saved;}return state;}
  function cancel(){state.request++;state.loading=false;state.key='';state.sides=[];state.loadedAt=null;state.reused=false;}
  async function load(pair,fetchReport,onUpdate=()=>{}){
   if(!pair?.ready)return;
   sync(pair.key);if(state.loading)return;
   const request=++state.request;state.loading=true;state.sides=[];state.loadedAt=null;state.reused=false;cache.delete(pair.key);onUpdate();
   const current=()=>request===state.request&&state.key===pair.key;
   try{
    for(const [i,side]of pair.sides.entries()){
     if(!current())return;
     try{
      const report=await fetchReport(side.account,pair.role);
      if(!current())return;
      if(report?.role!==pair.role||!Number.isInteger(report.games)||report.games<0)throw new Error('Rapport incohérent pour le rôle demandé.');
      state.sides[i]={report};remember();onUpdate();
      if(['auth','rate_limit'].includes(report.coverage?.stop)){
       if(i===0)state.sides[1]={error:'Non chargé : collecte interrompue par Riot. Relance après vérification de la clé ou du quota.'};break;
      }
     }catch(e){
      if(!current())return;
      state.sides[i]={error:String(e.message||e)};
      if(i===0)state.sides[1]={error:'Non chargé après l’erreur du premier compte. Relance pour réessayer.'};break;
     }
    }
   }finally{if(current()){state.loading=false;remember();onUpdate();}}
  }
  return {state,sync,cancel,load,peek};
 }
 function compare(left,right){
  if(!Number.isInteger(left?.games)||left.games<=0||!Number.isInteger(right?.games)||right.games<=0||left.role!==right.role)return null;
  const metric=(key,label,digits=1)=>{
   const a=left[key],b=right[key];if(!Number.isFinite(a)||!Number.isFinite(b))return null;
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
 function commonPatches(reports){
  if(reports.length!==2||!reports.every(Boolean))return [];
  const valid=(row,role)=>/^\d+\.\d+$/.test(row?.patch||'')&&row.report?.role===role&&Number.isInteger(row.report.games)&&row.report.games>0;
  const right=new Set((reports[1].byPatch||[]).filter(p=>valid(p,reports[1].role)).map(p=>p.patch));
  return [...new Set((reports[0].byPatch||[]).filter(p=>valid(p,reports[0].role)&&right.has(p.patch)).map(p=>p.patch))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 }
 function scopeReport(report,patch){
  if(!report||patch==='ALL')return report;
  const scoped=report.byPatch?.find(p=>p.patch===patch)?.report;if(!scoped)return null;
  return {...scoped,scope:`SoloQ classée · rôle ${scoped.role} · patch ${patch}`,coverage:{...report.coverage,roleGames:scoped.games,targetReached:scoped.games>=(report.coverage?.target||12)},selectedPatch:patch};
 }
 return {pair,create,compare,commonPatches,scopeReport};
})();
if(typeof module!=='undefined')module.exports=DuelScouting;
