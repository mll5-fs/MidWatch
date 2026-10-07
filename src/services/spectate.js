const fs=require("fs"),path=require("path"),{execFile}=require("child_process");
const {fromCommandLine,fromLockfile}=require("./lcu-auth");
const {requestLocal}=require("./lcu-http");
const {launchThroughClient}=require("./spectate-flow");
const valid=r=>r&&fs.existsSync(path.join(r,"Game","League of Legends.exe"));
function detect(saved=""){const drives=["C","D","E","F","G"],c=[saved,...drives.flatMap(d=>[`${d}:\\Riot Games\\League of Legends`,`${d}:\\Games\\Riot Games\\League of Legends`]),"C:\\Program Files\\Riot Games\\League of Legends"];return c.find(valid)||""}
function ps(script){return new Promise((resolve,reject)=>execFile("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true},(e,out)=>e?reject(e):resolve(String(out||"").trim())))}
async function lcu(root){
 let cmd="";
 try{cmd=await ps("(Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)")}catch(_){}
 if(!cmd)try{cmd=await ps("(Get-CimInstance Win32_Process -Filter \"Name='LeagueClient.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)")}catch(_){}
 const processAuth=fromCommandLine(cmd);if(processAuth)return processAuth;
 const candidates=[path.join(root,"lockfile"),path.join(path.dirname(root),"League of Legends","lockfile")];
 for(const file of candidates){try{const auth=fromLockfile(fs.readFileSync(file,"utf8"));if(auth)return auth}catch(_){}}
 throw new Error("MidPulse ne trouve pas les identifiants locaux du client League. Laisse le client ouvert et connecté puis réessaie.");
}
async function raw(root,method,endpoint,body){return requestLocal(await lcu(root),method,endpoint,body)}
async function launch(root,game,puuid){
 root=detect(root);if(!root)throw new Error("Installation de League of Legends introuvable. Choisis son dossier dans Réglages.");
 const id=String(game?.gameId||""),key=String(game?.observers?.encryptionKey||"");if(!id||!key||!puuid)throw new Error("Données spectateur Riot incomplètes.");
 const body={dropInSpectateGameId:id,gameQueueType:String(game?.gameQueueConfigId||""),allowObserveMode:"ALL",puuid:String(puuid),spectatorKey:key};
 return launchThroughClient(raw,root,body);
}
module.exports={detect,launch};
