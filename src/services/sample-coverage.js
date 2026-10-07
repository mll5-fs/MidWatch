function integer(value) { return Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0); }

function buildCoverage(input = {}) {
  const requested = integer(input.requested);
  const matchAttempts = integer(input.matchAttempts);
  const matchesLoaded = integer(input.matchesLoaded);
  const midGames = integer(input.midGames);
  const timelineAttempts = integer(input.timelineAttempts);
  const timelinesLoaded = integer(input.timelinesLoaded);
  const matchErrors = integer(input.matchErrors);
  const timelineErrors = integer(input.timelineErrors);
  const target = integer(input.target) || 12;
  const stop = ["rate_limit", "auth", "target"].includes(input.stop) ? input.stop : "complete";
  const targetReached = midGames >= target;
  const historyCovered = requested === 0 || matchAttempts >= requested;
  const partial = stop === "rate_limit" || stop === "auth" || matchErrors > 0 || timelineErrors > 0 || (!targetReached && !historyCovered);
  return { requested, matchAttempts, matchesLoaded, midGames, timelineAttempts, timelinesLoaded,
    matchErrors, timelineErrors, target, targetReached, partial, stop };
}

module.exports = { buildCoverage };
