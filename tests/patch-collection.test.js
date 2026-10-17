const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const main = fs.readFileSync("src/main.js", "utf8");
const preload = fs.readFileSync("src/preload.js", "utf8");
const renderer = fs.readFileSync("src/renderer/app.js", "utf8");

test("dedicated patch analysis requests a larger match-only mid sample", () => {
  const start = main.indexOf("async function playerPatchStats");
  const end = main.indexOf("\nasync function rankBatch", start);
  const source = main.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(source, /playerPatchStats\(a\)\{return playerRoleStats\(a,"MID",true\)/);
  const collector=fs.readFileSync('src/services/role-report.js','utf8');
  assert.match(collector, /requested=patchOnly\?60:20,target=patchOnly\?30:12/);
  assert.match(collector, /matches\.length>=target/);
  assert.doesNotMatch(source, /riot\.timeline/);
  assert.match(source, /rolePatchStatsCacheV2/);
});

test("patch analysis has an isolated IPC path from the regular scouting report", () => {
  assert.match(main, /ipcMain\.handle\("riot:patchStats"/);
  assert.match(preload, /patchStats:a=>ipcRenderer\.invoke\("riot:patchStats",a\)/);
  assert.match(renderer, /window\.mw\.patchStats\(scoutingAccount\(player\)\)/);
});
