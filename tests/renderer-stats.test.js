const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "../src/renderer/app.js"), "utf8");

test("loads Riot scouting statistics for every linked player, not only OUAT", () => {
  assert.match(app, /if\(p\.accounts\?\.\[0\]&&S\.hasKey\)\{try\{const stats=await window\.mw\.stats/);
  assert.doesNotMatch(app, /if\(p\.region==="OUAT"&&p\.accounts\?\.\[0\]&&S\.hasKey\)/);
  assert.match(app, /p\.region!=="OUAT"&&p\.accounts\?\.\[0\]&&S\.hasKey/);
});

test("ignores stale profile and statistics responses after drawer navigation", () => {
  assert.match(app, /const request=\+\+drawerRequest/);
  assert.match(app, /function closeDrawer\(\)\{drawerRequest\+\+/);
  assert.ok((app.match(/if\(request!==drawerRequest\)return/g) || []).length >= 3);
});
