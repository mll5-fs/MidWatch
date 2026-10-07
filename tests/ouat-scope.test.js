const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('src/renderer/app.js','utf8');
const main = fs.readFileSync('src/main.js','utf8');
test('cached professional players cannot enter OUAT views or background batches',()=>{
 const source=app.slice(app.indexOf('function applyLive('),app.indexOf('function rankPlaceholder('));
 const context=vm.createContext({S:{players:[{id:'pro'}],ouatPlayers:[{id:'ouat'}]},rankMeta:{},rankState:{},liveState:{}});
 vm.runInContext(source,context);
 assert.deepEqual(Array.from(context.allPlayers(),p=>p.id),['ouat']);
 assert.doesNotMatch(main,/currentPros|pros:refresh|services\/pros|data\/players/);
 assert.doesNotMatch(app,/refreshPros|window\.mw\.profile|PRO CIRCUIT/);
});
test('patch section loads selected OUAT account and renders measured patch groups',async()=>{
 const nodes={};const $=id=>nodes[id]??={hidden:false,value:'',innerHTML:'',textContent:''};
 const p={id:'ouat',name:'Mid',team:'Team',accounts:[{gameName:'Riot',tagLine:'EUW'}]};let calls=0;
 const context=vm.createContext({$,S:{hasKey:true},allPlayers:()=>[p],queryMatch:()=>true,esc:String,
 window:{mw:{stats:async account=>{calls++;assert.equal(account.gameName,'Riot');return {patches:[{patch:'26.20',games:3}]};},open:()=>{}}},
 coverageReport:()=>'',sampleWindowReport:()=>'',patchReport:rows=>'PATCH '+rows[0].patch,render:()=>context.renderPatchSection()});
 vm.runInContext('let patchRequest=0,patchPlayerId="",patchStats=null,patchError="",patchLoading=false,view="PATCHES";'+app.slice(app.indexOf('function renderPatchSection('),app.indexOf('\nfunction render(){')),context);
 context.renderPatchSection();
 await nodes['#analyzePatch'].onclick();
 assert.equal(calls,1);assert.match(nodes['#grid'].innerHTML,/PATCH 26\.20/);
 assert.equal(nodes['#sort'].hidden,true);
});
