const TTL = 10 * 60 * 1000;
const MAX_ENTRIES = 50;

function accountKey(account = {}) {
  return `ranked-mid-v1|${String(account.platform || "EUW1").toUpperCase()}|${account.gameName || ""}#${account.tagLine || ""}`.toLowerCase();
}

function read(cache, account, now = Date.now()) {
  const hit = cache?.[accountKey(account)];
  return hit && now - hit.at < TTL ? { ...hit.value, cachedAt: hit.at } : null;
}

function write(cache, account, value, now = Date.now()) {
  const next = { ...(cache || {}), [accountKey(account)]: { at: now, value } };
  const recent = Object.entries(next).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES);
  return Object.fromEntries(recent);
}

module.exports = { accountKey, read, write, TTL, MAX_ENTRIES };
