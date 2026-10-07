const TTL = 15 * 60 * 1000;
const RETRY = 2 * 60 * 1000;

function accountKey(account) {
  return `${String(account.platform || "EUW1").toUpperCase()}|${account.gameName}#${account.tagLine}`.toLowerCase();
}

function hydrate(players, cache = {}) {
  return players.map(player => {
    const account = player.accounts?.[0];
    const entry = account && cache[accountKey(account)];
    if (!entry) return player;
    return { ...player, ...(entry.rank !== undefined ? { bestRank: entry.rank || {} } : {}),
      rankStatus: entry.status, rankCheckedAt: entry.checkedAt, rankError: entry.error };
  });
}

function resetErrors(cache = {}) {
  for (const entry of Object.values(cache)) {
    if (entry?.status !== "error") continue;
    entry.status = entry.rank ? "ranked" : "pending";
    entry.nextCheck = 0;
    delete entry.error;
  }
  return cache;
}

async function loadBatch(riot, players, { cache = {}, accountCache = {}, priorityIds = [], now = Date.now() } = {}) {
  const priority = new Set(priorityIds);
  const candidates = players.filter(player => {
    const account = player.accounts?.[0];
    if (!account?.gameName || !account?.tagLine) return false;
    const entry = cache[accountKey(account)];
    return !entry || now >= (entry.nextCheck || 0);
  }).sort((a, b) => Number(priority.has(b.id)) - Number(priority.has(a.id)) ||
    (cache[accountKey(a.accounts[0])]?.checkedAt || 0) - (cache[accountKey(b.accounts[0])]?.checkedAt || 0));
  const updates = [];
  let retryAt = 0;
  let blockedStatus = 0;
  const seen = new Set();
  for (const player of candidates) {
    const account = player.accounts[0], key = accountKey(account);
    if (seen.has(key)) continue;
    if (seen.size >= 5) break;
    seen.add(key);
    try {
      let puuid = accountCache[key];
      if (!puuid) {
        puuid = (await riot.resolveAccount(account)).puuid;
        accountCache[key] = puuid;
      }
      const ranked = await riot.ranked(account.platform || "EUW1", puuid);
      if (!Array.isArray(ranked)) throw new Error("Réponse Riot de classement invalide.");
      const solo = ranked.find(rank => rank.queueType === "RANKED_SOLO_5x5");
      if (solo && (!solo.tier || !Number.isFinite(solo.leaguePoints))) throw new Error("Rang SoloQ incomplet.");
      const rank = solo ? { tier: solo.tier, rank: solo.rank, leaguePoints: solo.leaguePoints } : null;
      cache[key] = { rank, status: solo ? "ranked" : "unranked", checkedAt: now, nextCheck: now + TTL };
    } catch (error) {
      const delay = error.status === 429 && Number.isFinite(error.retryAfterMs) && error.retryAfterMs > 0 ? error.retryAfterMs : RETRY;
      cache[key] = { ...cache[key], status: "error", error: String(error.message || error), nextCheck: now + delay };
      if (error.status === 404) delete accountCache[key];
      if ([429, 401, 403].includes(error.status)) { retryAt = now + delay; blockedStatus = error.status; }
    }
    for (const linked of players.filter(p => p.accounts?.[0] && accountKey(p.accounts[0]) === key)) {
      const entry = cache[key];
      updates.push({ id: linked.id, rank: entry.rank, status: entry.status, checkedAt: entry.checkedAt, error: entry.error });
    }
    if (retryAt) break;
  }
  return { updates, checked: seen.size, total: players.length, retryAt, blockedStatus, cache, accountCache };
}

module.exports = { accountKey, hydrate, resetErrors, loadBatch };
