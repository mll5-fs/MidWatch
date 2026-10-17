// A conservative, per-key pause shared by all public Riot API routes in this process.
// No retry is scheduled here; already in-flight requests are not cancelled.
function createRiotBackoff({now=Date.now}={}){
 const deadlines=new Map();
 function block(key,delay){
  const wait=Number.isFinite(delay)&&delay>0?delay:120000;
  const until=Math.max(deadlines.get(key)||0,now()+wait);deadlines.set(key,until);return until;
 }
 function assertAllowed(key){
  const time=now();for(const [k,until] of deadlines)if(until<=time)deadlines.delete(k);
  const until=deadlines.get(key)||0;if(until<=time)return;
  const delay=until-time,error=new Error(`Limite Riot API atteinte. Reprise dans ${Math.max(1,Math.ceil(delay/1000))} s.`);
  Object.assign(error,{status:429,retryAt:until,retryAfterMs:delay});throw error;
 }
 return {block,assertAllowed};
}
module.exports={createRiotBackoff};
