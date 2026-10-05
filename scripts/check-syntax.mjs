import fs from "node:fs";import path from "node:path";import {spawnSync} from "node:child_process";
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):e.isFile()&&p.endsWith(".js")?[p]:[]})}
let failed=false;for(const file of walk("src")){const r=spawnSync(process.execPath,["--check",file],{encoding:"utf8"});if(r.status!==0){failed=true;console.error("\nSyntax error in "+file+"\n"+(r.stderr||r.stdout))}}
if(failed)process.exit(1);console.log("Syntax OK");
