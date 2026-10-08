const fs=require("fs"),path=require("path"),{execFile}=require("child_process");
const {fromProcessList,fromLockfile}=require("./lcu-auth");
const {requestLocal}=require("./lcu-http");
const {launchThroughClient}=require("./spectate-flow");
const valid=r=>r&&fs.existsSync(path.join(r,"Game","League of Legends.exe"));
function detect(saved=""){const drives=["C","D","E","F","G"],c=[saved,...drives.flatMap(d=>[`${d}:\\Riot Games\\League of Legends`,`${d}:\\Games\\Riot Games\\League of Legends`]),"C:\\Program Files\\Riot Games\\League of Legends"];return c.find(valid)||""}
function ps(script){return new Promise((resolve,reject)=>execFile("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true},(e,out)=>e?reject(e):resolve(String(out||"").trim())))}
async function lcu(root){
 for(const name of ["LeagueClientUx.exe","LeagueClient.exe"])try{
   const commands=await ps(`Get-CimInstance Win32_Process -Filter "Name='${name}'" | Select-Object -ExpandProperty CommandLine`);
   const processAuth=fromProcessList(commands);if(processAuth)return processAuth;
 }catch(_){}
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
