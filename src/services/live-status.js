function accountKey(account = {}) {
  return `${String(account.platform || "EUW1").toUpperCase()}|${account.gameName}#${account.tagLine}`.toLowerCase();
}

async function checkLiveAccount(riot, account, { accountCache = {}, now = Date.now() } = {}) {
  const key = accountKey(account);
  let puuid = accountCache[key];
  if (!puuid) {
    puuid = (await riot.resolveAccount(account)).puuid;
    accountCache[key] = puuid;
  }
  try {
    const game = await riot.active(account.platform || "EUW1", puuid);
    return { live: true, checkedAt: now, gameId: game?.gameId || null, accountCache };
  } catch (error) {
    if (error.status === 404) return { live: false, checkedAt: now, gameId: null, accountCache };
    throw error;
  }
}

module.exports = { accountKey, checkLiveAccount };
