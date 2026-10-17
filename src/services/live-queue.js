const {fingerprint}=require('../renderer/identity');

// Keep the existing eight-player request budget, reserving background progress.
function createLiveQueue(){
 const attempts=new Map();let sequence=0;
 function select(players,priorityIds=[]){
  const linked=[...new Map(players.filter(p=>p.accounts?.some(a=>a?.gameName&&a?.tagLine)).map(p=>[p.id,p])).values()];
  const key=p=>JSON.stringify([p.id,fingerprint(p)]),valid=new Set(linked.map(key));
  for(const k of attempts.keys())if(!valid.has(k))attempts.delete(k);
  const ids=new Set(Array.isArray(priorityIds)?priorityIds.filter(id=>typeof id==='string').slice(0,100):[]);
  const byAge=(a,b)=>(attempts.get(key(a))||0)-(attempts.get(key(b))||0);
  const priority=linked.filter(p=>ids.has(p.id)).sort(byAge),background=linked.filter(p=>!ids.has(p.id)).sort(byAge);
  const batch=priority.splice(0,6);batch.push(...background.splice(0,8-batch.length));batch.push(...priority.splice(0,8-batch.length));
  for(const p of batch)attempts.set(key(p),++sequence);
  return batch;
 }
 return {select};
}
module.exports={createLiveQueue};
