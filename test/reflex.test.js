"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { emptyState, apply, tick, run } = require("../src/reflex.js");
const { HOUR } = require("../src/routes.js");

const T0 = Date.UTC(2025, 11, 10, 9);
const signal = (over = {}) => ({ id: "e1", kind: "signal", at: T0, alertId: "A1", type: "demand_spike", ...over });

test("a signal opens an alert with one named owner", () => {
  const s = apply(emptyState(), signal());
  assert.equal(s.alerts.A1.owner, "Inventory lead (Operations)");
  assert.equal(s.alerts.A1.status, "open");
});

test("a signal type with no owner cannot fire", () => {
  assert.throws(() => apply(emptyState(), signal({ type: "mystery" })), /No owner/);
});

test("the same event delivered twice changes nothing the second time", () => {
  const once = apply(emptyState(), signal());
  const twice = apply(once, signal());
  assert.deepEqual(twice, once);
});

test("a second signal for an open alert is folded in, not duplicated", () => {
  const s = apply(apply(emptyState(), signal()), signal({ id: "e2", at: T0 + HOUR }));
  assert.equal(Object.keys(s.alerts).length, 1);
});

test("no answer inside the ack window escalates one step", () => {
  const s = tick(apply(emptyState(), signal()), T0 + 2 * HOUR);
  assert.equal(s.alerts.A1.owner, "Head of data and operations");
  assert.equal(s.alerts.A1.level, 1);
});

test("acknowledging without acting still escalates when the action clock runs out", () => {
  let s = apply(emptyState(), signal());
  s = apply(s, { id: "e2", kind: "ack", at: T0 + HOUR, alertId: "A1", by: "inventory lead" });
  s = tick(s, T0 + HOUR + 5 * HOUR);
  assert.equal(s.alerts.A1.level, 0, "still inside the action window");
  s = tick(s, T0 + HOUR + 6 * HOUR);
  assert.equal(s.alerts.A1.level, 1);
  assert.match(s.log.at(-1).text, /acknowledged but no action/);
});

test("past the top of the chain the alert is marked stuck, never silently dropped", () => {
  let s = apply(emptyState(), signal());
  for (let h = 1; h <= 12; h++) s = tick(s, T0 + h * HOUR);
  assert.equal(s.alerts.A1.status, "stuck");
});

test("tick is safe to call repeatedly at the same time", () => {
  const s1 = tick(apply(emptyState(), signal()), T0 + 2 * HOUR);
  assert.deepEqual(tick(s1, T0 + 2 * HOUR), s1);
});

test("a closed alert ignores late events", () => {
  let s = apply(emptyState(), signal());
  s = apply(s, { id: "e2", kind: "act", at: T0 + HOUR, alertId: "A1", by: "lead" });
  s = apply(s, { id: "e3", kind: "ack", at: T0 + 2 * HOUR, alertId: "A1", by: "late" });
  assert.equal(s.alerts.A1.status, "closed");
  assert.equal(s.alerts.A1.ackAt, T0 + HOUR);
});

test("events for an unknown alert are refused", () => {
  assert.throws(() => apply(emptyState(), { id: "x", kind: "ack", at: T0, alertId: "nope" }), /unknown alert/);
});

test("run gives the same result in any input order", () => {
  const events = [
    signal(),
    { id: "e2", kind: "ack", at: T0 + HOUR, alertId: "A1", by: "lead" },
    { id: "e3", kind: "act", at: T0 + 3 * HOUR, alertId: "A1", by: "lead" },
  ];
  assert.deepEqual(run(events), run([...events].reverse()));
});
