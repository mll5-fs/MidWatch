const fs=require("fs"),path=require("path"),https=require("https"),{execFile}=require("child_process");
const valid=r=>r&&fs.existsSync(path.join(r,"Game","League of Legends.exe"));
function detect(saved=""){const drives=["C","D","E","F","G"],c=[saved,...drives.flatMap(d=>[`${d}:\\Riot Games\\League of Legends`,`${d}:\\Games\\Riot Games\\League of Legends`]),"C:\\Program Files\\Riot Games\\League of Legends"];return c.find(valid)||""}
function ps(script){return new Promise((resolve,reject)=>execFile("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true},(e,out)=>e?reject(e):resolve(String(out||"").trim())))}
async function lcu(root){
 let cmd="";
 try{cmd=await ps("(Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)")}catch(_){}
 if(!cmd)try{cmd=await ps("(Get-CimInstance Win32_Process -Filter \"Name='LeagueClient.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)")}catch(_){}
 const pm=cmd.match(/--app-port(?:=|\\s+)(?:"(\\d+)"|(\\d+))/),tm=cmd.match(/--remoting-auth-token(?:=|\\s+)(?:"([^"]+)"|([^\\s"]+))/);
 if(pm&&tm)return{port:+(pm[1]||pm[2]),password:tm[1]||tm[2],source:"process"};
 const candidates=[path.join(root,"lockfile"),path.join(path.dirname(root),"League of Legends","lockfile")];
 for(const file of candidates)if(fs.existsSync(file)){const raw=fs.readFileSync(file,"utf8").trim().split(":");if(raw.length>=5)return{port:+raw[2],password:raw[3],source:"lockfile"}}
 throw new Error("MidPulse ne trouve pas les identifiants locaux du client League. Laisse le client ouvert et connecté puis réessaie.");
}
async function raw(root,method,endpoint,body){const a=await lcu(root);return new Promise((resolve,reject)=>{const data=body===undefined?"":JSON.stringify(body),req=https.request({hostname:"127.0.0.1",port:a.port,path:endpoint,method,rejectUnauthorized:false,headers:{Authorization:"Basic "+Buffer.from("riot:"+a.password).toString("base64"),"Content-Type":"application/json",...(data?{"Content-Length":Buffer.byteLength(data)}:{})}},res=>{let out="";res.on("data",d=>out+=d);res.on("end",()=>{let parsed=out;try{parsed=JSON.parse(out)}catch(_){};if(res.statusCode>=200&&res.statusCode<300)return resolve({status:res.statusCode,data:parsed,auth:a.source});reject(Object.assign(new Error(`Client League: HTTP ${res.statusCode}`),{status:res.statusCode,data:parsed,endpoint,auth:a.source}))})});req.on("error",e=>reject(new Error("Connexion au client League impossible : "+e.message));if(data)req.write(data);req.end()})}
async function request(root,endpoint,body){return raw(root,"POST",endpoint,body)}
async function launch(root,game,puuid){
 root=detect(root);if(!root)throw new Error("Installation de League of Legends introuvable. Choisis son dossier dans Réglages.");
 const id=String(game?.gameId||""),key=String(game?.observers?.encryptionKey||"");if(!id||!key||!puuid)throw new Error("Données spectateur Riot incomplètes.");
 let phase="";try{phase=String((await raw(root,"GET","/lol-gameflow/v1/gameflow-phase")).data||"")}catch(e){if(e.status===401)throw new Error("Session League locale non authentifiée. Relance le client League puis réessaie.")}
 const body={dropInSpectateGameId:id,gameQueueType:String(game?.gameQueueConfigId||""),allowObserveMode:"ALL",puuid:String(puuid),spectatorKey:key},errors=[];
 for(const ep of ["/lol-gameflow/v1/spectate/launch","/lol-spectator/v1/spectate/launch"]){try{await request(root,ep,body);return{root,verified:true,method:"LCU",endpoint:ep,phase}}catch(e){errors.push({endpoint:ep,status:e.status,data:e.data,auth:e.auth})}}
 const summary=errors.map(e=>e.endpoint+" → HTTP "+(e.status||"?")).join(" ; ");
 throw new Error("League refuse le lancement Spectate ("+summary+"). Phase client: "+(phase||"inconnue")+". MidPulse a bien détecté et authentifié le client ; le lancement LCU est refusé côté League.");
}
module.exports={detect,launch};