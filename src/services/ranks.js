const TTL = 15 * 60 * 1000;
const RETRY = 2 * 60 * 1000;

function accountKey(account) {
  return `${String(account.platform || "EUW1").toUpperCase()}|${account.gameName}#${account.tagLine}`.toLowerCase();
}

function rankPoints(rank = {}) {
  const tiers = { CHALLENGER: 10, GRANDMASTER: 9, MASTER: 8, DIAMOND: 7, EMERALD: 6,
    PLATINUM: 5, GOLD: 4, SILVER: 3, BRONZE: 2, IRON: 1 };
  const tier = tiers[String(rank.tier || "").toUpperCase()] || 0;
  if (!tier) return 0;
  const apex = tier >= 8;
  const division = apex ? 0 : ({ IV: 0, III: 1, II: 2, I: 3 }[rank.rank] || 0);
  const rawLp = Number(rank.leaguePoints ?? rank.lp ?? 0);
  const lp = Number.isFinite(rawLp) ? Math.max(0, Math.min(rawLp, apex ? 99999 : 999)) : 0;
  return tier * 100000 + division * 1000 + lp;
}

function playerRankState(player, cache = {}) {
  const accounts = (player.accounts || []).filter(account => account?.gameName && account?.tagLine);
  if (!accounts.length) return {};
  const entries = accounts.map(account => ({ account, entry: cache[accountKey(account)] })).filter(item => item.entry);
  const ranked = entries.filter(item => item.entry.rank?.tier)
    .sort((a, b) => rankPoints(b.entry.rank) - rankPoints(a.entry.rank));
  const checkedAt = entries.reduce((latest, item) => Math.max(latest, Number(item.entry.checkedAt) || 0), 0) || undefined;
  if (ranked.length) {
    const best = ranked[0], stale = best.entry.status === "error";
    const failed = entries.find(item => item.entry.status === "error");
    const partial = entries.length < accounts.length || entries.some(item => item.entry.status === "pending" || item.entry.status === "error");
    return { rank: best.entry.rank, rankAccount: best.account,
      status: stale ? "error" : partial ? "partial" : "ranked", checkedAt,
      error: stale ? best.entry.error : failed?.entry.error };
  }
  if (entries.length < accounts.length) return { status: "pending", checkedAt };
  if (entries.every(item => item.entry.status === "unranked")) return { rank: null, status: "unranked", checkedAt };
  const failed = entries.find(item => item.entry.status === "error");
  return { status: failed ? "error" : "pending", checkedAt, error: failed?.entry.error };
}

function hydrate(players, cache = {}) {
  return players.map(player => {
    const state = playerRankState(player, cache);
    if (!state.status) return player;
    return { ...player, ...(state.rank !== undefined ? { bestRank: state.rank || {} } : {}),
      ...(state.rankAccount ? { bestRankAccount: state.rankAccount } : {}),
      rankStatus: state.status, rankCheckedAt: state.checkedAt, rankError: state.error };
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
  const candidates = players.flatMap(player => (player.accounts || []).map((account, accountIndex) => ({ player, account, accountIndex }))).filter(({ account }) => {
    if (!account?.gameName || !account?.tagLine) return false;
    const entry = cache[accountKey(account)];
    return !entry || now >= (entry.nextCheck || 0);
  }).sort((a, b) => Number(priority.has(b.player.id)) - Number(priority.has(a.player.id)) ||
    (cache[accountKey(a.account)]?.checkedAt || 0) - (cache[accountKey(b.account)]?.checkedAt || 0) ||
    a.accountIndex - b.accountIndex);
  const updates = [];
  let retryAt = 0;
  let blockedStatus = 0;
  const seen = new Set();
  const affected = new Set();
  for (const { player, account } of candidates) {
    const key = accountKey(account);
    if (seen.has(key)) continue;
    if (seen.size >= 5) break;
    seen.add(key);
    try {
      let puuid = accountCache[key];
      const cachedPuuid = Boolean(puuid);
      if (!puuid) {
        puuid = (await riot.resolveAccount(account)).puuid;
        accountCache[key] = puuid;
      }
      let ranked;
      try {
        ranked = await riot.ranked(account.platform || "EUW1", puuid);
      } catch (error) {
        if (error.status !== 404 || !cachedPuuid) throw error;
        delete accountCache[key];
        puuid = (await riot.resolveAccount(account)).puuid;
        accountCache[key] = puuid;
        ranked = await riot.ranked(account.platform || "EUW1", puuid);
      }
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
    for (const linked of players.filter(p => (p.accounts || []).some(a => a?.gameName && a?.tagLine && accountKey(a) === key))) affected.add(linked.id);
    if (retryAt) break;
  }
  for (const player of players.filter(p => affected.has(p.id))) {
    const state = playerRankState(player, cache);
    updates.push({ id: player.id, rank: state.rank, rankAccount: state.rankAccount,
      status: state.status, checkedAt: state.checkedAt, error: state.error });
  }
  const candidateAccounts = new Set(candidates.map(({ account }) => accountKey(account))).size;
  return { updates, checked: seen.size, remaining: Math.max(0, candidateAccounts - seen.size),
    total: players.length, retryAt, blockedStatus, cache, accountCache };
}

module.exports = { accountKey, playerRankState, hydrate, resetErrors, loadBatch };
