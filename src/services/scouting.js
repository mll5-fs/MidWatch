const isMid = x => [x?.teamPosition, x?.individualPosition].some(v => String(v || "").toUpperCase() === "MIDDLE");

function midOpponent(participants, player) {
  return participants.find(x => x.teamId !== player.teamId && isMid(x));
}

function frameAt(timeline, minute) {
  const target = minute * 60 * 1000;
  return (timeline?.info?.frames || []).reduce((best, frame) => {
    if (!best) return frame;
    return Math.abs((frame.timestamp || 0) - target) < Math.abs((best.timestamp || 0) - target) ? frame : best;
  }, null);
}

function laneAt10(samples, puuid) {
  const rows = [];
  for (const { match, timeline } of samples) {
    const participants = match?.info?.participants || [];
    const player = participants.find(x => x.puuid === puuid);
    const opponent = isMid(player) && midOpponent(participants, player);
    const frame = frameAt(timeline, 10);
    const mine = frame?.participantFrames?.[player?.participantId];
    const theirs = frame?.participantFrames?.[opponent?.participantId];
    if (!player || !opponent || !mine || !theirs) continue;
    const cs = (mine.minionsKilled || 0) + (mine.jungleMinionsKilled || 0);
    const oppCs = (theirs.minionsKilled || 0) + (theirs.jungleMinionsKilled || 0);
    const earlyDeaths = (timeline.info?.frames || []).flatMap(x => x.events || [])
      .filter(e => e.type === "CHAMPION_KILL" && e.victimId === player.participantId && e.timestamp <= 600000).length;
    rows.push({ cs, gold: mine.totalGold || 0, xp: mine.xp || 0,
      csDiff: cs - oppCs, goldDiff: (mine.totalGold || 0) - (theirs.totalGold || 0),
      xpDiff: (mine.xp || 0) - (theirs.xp || 0), earlyDeaths });
  }
  if (!rows.length) return { games: 0 };
  const avg = key => Math.round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length);
  return { games: rows.length, cs: avg("cs"), gold: avg("gold"), xp: avg("xp"),
    csDiff: avg("csDiff"), goldDiff: avg("goldDiff"), xpDiff: avg("xpDiff"),
    deathRate: Math.round(100 * rows.filter(x => x.earlyDeaths > 0).length / rows.length) };
}

module.exports = { laneAt10 };
