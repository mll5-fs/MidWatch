const api="https://api.leamateur.pro";
for(const u of [
  api+"/tournaments/OUATventure%20Saison%2023",
  api+"/tournaments/21",
  api+"/clasification/byTournament/21",
  api+"/calendar/byTournament/21"
]){
 try{
  const r=await fetch(u);
  const t=await r.text();
  console.log("\nURL",u,"STATUS",r.status,"LEN",t.length);
  console.log(t.slice(0,100000));
 }catch(e){console.log("ERR",u,e.message)}
}