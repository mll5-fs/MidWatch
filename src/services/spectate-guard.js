/* Reserve before queueing Riot work: duplicate clicks must not become queued POSTs. */
function createSpectateGuard({now=Date.now,cooldownMs=15000}={}){
 let pending=false,retryAt=0,pauseReason='';
 function snapshot(){return now()<retryAt?{retryAt,pauseReason}:{retryAt:0,pauseReason:''};}
 async function run(task){
  if(pending)throw new Error('Une demande Spectate est déjà en cours. Vérifie le client ; aucune nouvelle demande n’a été envoyée.');
  if(now()<retryAt)throw new Error(`Attends encore ${Math.ceil((retryAt-now())/1000)} s et vérifie le client avant de relancer Spectate. Aucune nouvelle demande n’a été envoyée.`);
  pending=true;
  try{const result=await task();if(result?.accepted){retryAt=now()+cooldownMs;pauseReason='accepted';}return {...result,...snapshot()};}
  catch(error){
   if(error?.launchUncertain||error?.spectateBusy){
    const delay=error.spectateBusy&&Number.isSafeInteger(error.retryAfterMs)&&error.retryAfterMs>0&&Number.isSafeInteger(now()+error.retryAfterMs)?error.retryAfterMs:0;
    retryAt=now()+Math.max(cooldownMs,delay);pauseReason=error.spectateBusy?'busy':'uncertain';
   }
   throw error;
  }
  finally{pending=false;}
 }
 return {run,snapshot};
}
module.exports={createSpectateGuard};
