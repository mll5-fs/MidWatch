/* Tie asynchronous public account data to the accounts that were actually queried. */
const PlayerIdentity=(()=>{
 function fingerprint(player){return JSON.stringify([...new Set((player.accounts||[]).filter(a=>a?.gameName&&a?.tagLine).map(a=>JSON.stringify([a.platform||'EUW1',a.gameName,a.tagLine].map(v=>String(v).trim().toLowerCase()))))].sort());}
 function matches(player,metadata){return typeof metadata?.identity==='string'&&metadata.identity===fingerprint(player);}
 return {fingerprint,matches};
})();
if(typeof module!=='undefined')module.exports=PlayerIdentity;
