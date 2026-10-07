const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCoverage } = require("../src/services/sample-coverage");

test("marks a fully inspected history as controlled coverage", () => {
  const c = buildCoverage({ requested: 20, matchAttempts: 20, matchesLoaded: 20, midGames: 8,
    timelineAttempts: 8, timelinesLoaded: 8 });
  assert.equal(c.partial, false);
  assert.equal(c.targetReached, false);
});

test("a twelve-game target is complete even before all history is inspected", () => {
  const c = buildCoverage({ requested: 20, matchAttempts: 14, matchesLoaded: 14, midGames: 12,
    timelineAttempts: 12, timelinesLoaded: 12, stop: "target" });
  assert.equal(c.targetReached, true);
  assert.equal(c.partial, false);
});

test("rate limits and API errors explicitly mark partial samples", () => {
  assert.equal(buildCoverage({ requested: 20, matchAttempts: 5, matchesLoaded: 5, midGames: 4,
    timelineAttempts: 4, timelinesLoaded: 4, stop: "rate_limit" }).partial, true);
  assert.equal(buildCoverage({ requested: 20, matchAttempts: 20, matchesLoaded: 19, midGames: 12,
    matchErrors: 1, stop: "target" }).partial, true);
  assert.equal(buildCoverage({ requested: 20, matchAttempts: 12, matchesLoaded: 12, midGames: 12,
    timelineAttempts: 12, timelinesLoaded: 11, timelineErrors: 1, stop: "target" }).partial, true);
});

test("normalizes malformed counters instead of overstating coverage", () => {
  const c = buildCoverage({ requested: -4, matchAttempts: NaN, matchesLoaded: "20", midGames: 0 });
  assert.equal(c.requested, 0);
  assert.equal(c.matchesLoaded, 0);
  assert.equal(c.partial, false);
});
