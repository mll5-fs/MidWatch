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
  assert.match(source, /matchIds\(acc\.platform,acc\.puuid,60,420\)/);
  assert.match(source, /target:30/);
  assert.match(source, /matches\.length>=30/);
  assert.doesNotMatch(source, /riot\.timeline/);
  assert.match(source, /patchStatsCache/);
});

test("patch analysis has an isolated IPC path from the regular scouting report", () => {
  assert.match(main, /ipcMain\.handle\("riot:patchStats"/);
  assert.match(preload, /patchStats:a=>ipcRenderer\.invoke\("riot:patchStats",a\)/);
  assert.match(renderer, /window\.mw\.patchStats\(scoutingAccount\(player\)\)/);
});
