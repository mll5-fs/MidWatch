const test = require("node:test");
const assert = require("node:assert/strict");
const cache = require("../src/services/stats-cache");
const account = { platform: "euw1", gameName: "Player", tagLine: "EUW" };

test("reuses a fresh report regardless of Riot ID casing", () => {
  const stored = cache.write({}, account, { games: 12 }, 1000);
  assert.deepEqual(cache.read(stored, { platform: "EUW1", gameName: "PLAYER", tagLine: "euw" }, 2000),
    { games: 12, cachedAt: 1000 });
});

test("expires reports after ten minutes", () => {
  const stored = cache.write({}, account, { games: 12 }, 1000);
  assert.equal(cache.read(stored, account, 1000 + cache.TTL), null);
});

test("keeps only the fifty most recent players", () => {
  let stored = {};
  for (let i = 0; i < 55; i++) stored = cache.write(stored, { gameName: `p${i}`, tagLine: "x" }, { games: i }, i);
  assert.equal(Object.keys(stored).length, cache.MAX_ENTRIES);
  assert.equal(cache.read(stored, { gameName: "p0", tagLine: "x" }, 56), null);
  assert.equal(cache.read(stored, { gameName: "p54", tagLine: "x" }, 56).games, 54);
});
