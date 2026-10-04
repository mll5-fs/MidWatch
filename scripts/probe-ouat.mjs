const api="https://api.leamateur.pro";
for(const id of [301,438,584]){
  const r=await fetch(api+"/team/"+id);
  const t=await r.text();
  console.log("\nTEAM",id,"STATUS",r.status,"LEN",t.length);
  console.log(t.slice(0,50000));
}