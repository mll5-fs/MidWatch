const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");

test("player statistics count match and timeline collection separately", () => {
  assert.match(main, /tracking\.matchAttempts\+\+/);
  assert.match(main, /tracking\.matchesLoaded\+\+/);
  assert.match(main, /tracking\.timelineAttempts\+\+/);
  assert.match(main, /tracking\.timelinesLoaded\+\+/);
  assert.match(main, /tracking\.matchErrors\+\+/);
  assert.match(main, /tracking\.timelineErrors\+\+/);
});

test("authentication and rate limits stop collection and remain in coverage", () => {
  assert.match(main, /tracking\.stop="auth"/);
  assert.match(main, /tracking\.stop="rate_limit"/);
  assert.match(main, /coverage=buildCoverage\(tracking\)/);
  assert.match(main, /coverage,sampledAt,scope/);
});

test("zero-game coverage is cached to avoid immediately repeating an empty collection", () => {
  assert.match(main, /if\(!rows\.length\)\{const empty=.*statsCache\.write[\s\S]*?return empty\}/);
});
