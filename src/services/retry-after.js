function retryAfterMs(value, now = Date.now()) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const seconds = Number(raw);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - now;
  if (!Number.isFinite(delay) || delay <= 0) return 0;
  return Math.ceil(delay);
}

module.exports = { retryAfterMs };
