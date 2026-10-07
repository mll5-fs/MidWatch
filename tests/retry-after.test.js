const test = require("node:test");
const assert = require("node:assert/strict");
const { retryAfterMs } = require("../src/services/retry-after");

test("parses Retry-After seconds and HTTP dates", () => {
  assert.equal(retryAfterMs("17", 1000), 17000);
  assert.equal(retryAfterMs("Thu, 01 Jan 1970 00:00:21 GMT", 1000), 20000);
});

test("rejects invalid delays and caps pathological cooldowns", () => {
  assert.equal(retryAfterMs("not-a-delay"), 0);
  assert.equal(retryAfterMs("-2"), 0);
  assert.equal(retryAfterMs("99999"), 10 * 60 * 1000);
});
