const test = require("node:test");
const assert = require("node:assert/strict");
const { RiotScheduler } = require("../src/services/riot-scheduler");

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("foreground work waits for an existing background request and blocks new background batches", async () => {
  const scheduler = new RiotScheduler(), background = deferred();
  let started = false;
  const result = scheduler.foreground(() => [background.promise], async () => { started = true; return "done"; });
  await Promise.resolve();
  assert.equal(started, false);
  assert.equal(scheduler.shouldDeferBackground(), true);
  background.resolve();
  assert.equal(await result, "done");
  assert.equal(scheduler.shouldDeferBackground(), false);
});

test("foreground Riot operations are serialized even after a failure", async () => {
  const scheduler = new RiotScheduler(), first = deferred(), order = [];
  const one = scheduler.foreground(() => [], async () => { order.push("one"); await first.promise; throw new Error("failed"); });
  const two = scheduler.foreground(() => [], async () => { order.push("two"); return 2; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ["one"]);
  first.resolve();
  await assert.rejects(one, /failed/);
  assert.equal(await two, 2);
  assert.deepEqual(order, ["one", "two"]);
  assert.equal(scheduler.shouldDeferBackground(), false);
});
