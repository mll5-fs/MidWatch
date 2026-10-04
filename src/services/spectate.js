const fs=require("fs"),path=require("path"),https=require("https"),{execFile}=require("child_process");
const valid=r=>r&&fs.existsSync(path.join(r,"Game","League of Legends.exe"));
function detect(saved=""){const drives=["C","D","E","F","G"],c=[saved,...drives.flatMap(d=>[`${d}:\\Riot Games\\League of Legends`,`${d}:\\Games\\Riot Games\\League of Legends`]),"C:\\Program Files\\Riot Games\\League of Legends"];return c.find(valid)||""}
function ps(script){return new Promise((resolve,reject)=>execFile("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true},(e,out)=>e?reject(e):resolve(String(out||"").trim())))}
async function lcu(root){
  const candidates=[path.join(root,"lockfile"),path.join(path.dirname(root),"League of Legends","lockfile")];
  for(const file of candidates)if(fs.existsSync(file)){const raw=fs.readFileSync(file,"utf8").trim().split(":");if(raw.length>=5)return{port:+raw[2],password:raw[3]}}
  let cmd="";try{cmd=await ps("(Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)")}catch(_){}
  if(!cmd)try{cmd=await ps("(Get-CimInstance Win32_Process -Filter \"Name='LeagueClient.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)")}catch(_){}
  const pm=cmd.match(/--app-port[= ](\d+)/),tm=cmd.match(/--remoting-auth-token[= ](?:\"([^\"]+)\"|(\S+))/);
  if(pm&&tm)return{port:+pm[1],password:tm[1]||tm[2]};
  throw new Error("Le client League est ouvert mais MidPulse n'arrive pas à lire sa connexion locale. Ferme puis relance League une fois, puis réessaie.");
}
async function request(root,endpoint,body){const a=await lcu(root);return new Promise((resolve,reject)=>{const data=JSON.stringify(body),req=https.request({hostname:"127.0.0.1",port:a.port,path:endpoint,method:"POST",rejectUnauthorized:false,headers:{Authorization:"Basic "+Buffer.from("riot:"+a.password).toString("base64"),"Content-Type":"application/json","Content-Length":Buffer.byteLength(data)}},res=>{let out="";res.on("data",d=>out+=d);res.on("end",()=>{if(res.statusCode>=200&&res.statusCode<300)return resolve(out);let msg=out;try{const j=JSON.parse(out);msg=j.message||j.errorCode||out}catch(_){}reject(new Error(`Client League: HTTP ${res.statusCode}${msg?": "+msg:""}`))})});req.on("error",e=>reject(new Error("Connexion au client League impossible : "+e.message));req.write(data);req.end()})}
async function launch(root,game,puuid){root=detect(root);if(!root)throw new Error("Installation de League of Legends introuvable. Choisis son dossier dans Réglages.");const id=String(game?.gameId||""),key=String(game?.observers?.encryptionKey||"");if(!id||!key||!puuid)throw new Error("Données spectateur Riot incomplètes.");const body={dropInSpectateGameId:id,gameQueueType:String(game?.gameQueueConfigId||""),allowObserveMode:"ALL",puuid:String(puuid),spectatorKey:key};let last;
 for(const ep of ["/lol-gameflow/v2/spectate/launch","/lol-spectator/v1/spectate/launch"]){try{await request(root,ep,body);return{root,verified:true,method:"LCU"}}catch(e){last=e}}
 throw last||new Error("Le client League n'a pas pu lancer le spectateur.");
}
module.exports={detect,launch};