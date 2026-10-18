const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const windowsPaths of [false,true])test('packaged-source assertions accept the current source with '+(windowsPaths?'Windows':'native')+' paths',()=>{
 // Test-only roster: never written to the app or passed to the production build.
 const fixture={schemaVersion:2,players:['TOP','JUNGLE','MID','ADC','SUPPORT'].map(role=>({role,team:'TEST FIXTURE'}))};let checked=false;
 const c=vm.createContext({process:{argv:['node','verify-packaged.cjs','test-only.asar']},console:{log:()=>checked=true},require:name=>{
  if(name==='@electron/asar')return {extractFile:(_archive,p)=>{const local=p.replaceAll('\\','/');return local==='src/data/ouat-current.json'?Buffer.from(JSON.stringify(fixture)):fs.readFileSync(local);}};
  if(name==='node:path'&&windowsPaths)return {...require(name),normalize:p=>p.replaceAll('/','\\')};
  return require(name);
 }});
 vm.runInContext(fs.readFileSync('scripts/verify-packaged.cjs','utf8'),c);assert.equal(checked,true);
});
