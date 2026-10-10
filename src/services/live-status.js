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

async function checkLiveAccounts(riot, accounts = [], { accountCache = {}, now = Date.now() } = {}) {
  const linked = accounts.filter(account => account?.gameName && account?.tagLine);
  if (!linked.length) throw new Error("Aucun compte Riot relié.");
  let firstError;
  for (const account of linked) {
    try {
      const status = await checkLiveAccount(riot, account, { accountCache, now });
      if (status.live) return { ...status, account };
    } catch (error) {
      firstError ||= error;
    }
  }
  if (firstError) throw firstError;
  return { live: false, checkedAt: now, gameId: null, account: null, accountCache };
}

module.exports = { accountKey, checkLiveAccount, checkLiveAccounts };
