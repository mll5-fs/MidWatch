const fs=require("fs");const path=require("path");const{app}=require("electron");
const defaults={favorites:[],accounts:{},riotKey:"",leaguePath:"",proCache:[],proCacheAt:0,ouat:{url:"",players:[],updatedAt:0,season:""}};
let file="",state=null;const clone=x=>JSON.parse(JSON.stringify(x));
function init(){if(state)return;file=path.join(app.getPath("userData"),"midwatch.json");state=clone(defaults);try{const raw=JSON.parse(fs.readFileSync(file,"utf8"));state={...state,...raw,ouat:{...state.ouat,...(raw.ouat||{})}}}catch(_){}}
function save(){init();const tmp=file+".tmp";fs.writeFileSync(tmp,JSON.stringify(state,null,2),"utf8");fs.renameSync(tmp,file)}
function get(k,fallback){init();return state[k]===undefined?fallback:state[k]}function set(k,v){init();state[k]=v;save();return v}
module.exports={init,get,set};
