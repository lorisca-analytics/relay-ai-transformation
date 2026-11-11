"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseCsv } = require("../src/csv.js");
const sizing = require("../src/sizing.js");
const messages = require("../src/messages.js");
const value = require("../src/value.js");
const { detect, replay } = require("../src/replay.js");
const { ROUTES } = require("../src/routes.js");

const read = (f, textColumns) => parseCsv(fs.readFileSync(path.join(__dirname, "..", "data", f), "utf8"), { textColumns });
const december = read("december-synthetic.csv", ["date"]);
const sizes = read("sizes-synthetic.csv", ["size"]);
const channels = read("channels-synthetic.csv", ["channel"]);

// Stock alarm
test("every route has an owner, an escalation chain and two clocks", () => {
  for (const [type, r] of Object.entries(ROUTES)) assert.ok(r.owner && r.escalation.length && r.ackWithin > 0 && r.actWithin > 0, type);
});

test("the first warning fires before the shelf is empty", () => {
  const firstOut = december.findIndex((r) => r.on_hand === 0);
  assert.ok(detect(december)[0].day < firstOut);
});

test("a flat month raises nothing", () => {
  const flat = Array.from({ length: 20 }, (_, i) => ({ date: `d${i}`, demand: 100, on_hand: 100000 }));
  assert.equal(detect(flat).length, 0);
});

test("an owner who acts closes the alert within hours, and the double delivery opens one alert", () => {
  const out = replay(december, { response: "acts", hours: 1 });
  assert.equal(out.alert.status, "closed");
  assert.equal(out.reflexHours, 2);
  assert.equal(Object.keys(out.state.alerts).length, 1);
  assert.ok(out.reflexHours < out.slowPathHours);
});

test("acknowledging without acting climbs the chain and ends stuck, never silently closed", () => {
  const out = replay(december, { response: "acks", hours: 1 });
  assert.equal(out.alert.status, "stuck");
  assert.ok(out.state.log.some((l) => /acknowledged but no action/.test(l.text)));
});

test("silence climbs the chain too", () => {
  const out = replay(december, { response: "silent" });
  assert.equal(out.alert.status, "stuck");
  assert.equal(out.reflexHours, null);
});

// Sizing check
test("the size chart grows on every measure", () => {
  const s = sizing.SIZES;
  for (let i = 1; i < s.length; i++) {
    for (const m of ["chest", "waist", "hips"]) assert.ok(sizing.CHART[s[i]][m] > sizing.CHART[s[i - 1]][m], `${s[i]} ${m}`);
  }
});

test("a gap over 5 points pauses the fit tool", () => {
  const g = sizing.gap(sizes);
  assert.ok(g.points > 5);
  assert.equal(g.paused, true);
});

test("an even gap keeps the fit tool on", () => {
  const even = sizing.SIZES.map((size) => ({ size, orders: 1000, returns: 220 }));
  assert.equal(sizing.gap(even).paused, false);
});

test("cut rules move the size the right way", () => {
  const m = { chest: 36, waist: 29, hips: 39 };
  assert.equal(sizing.recommend(m, "core").size, "M");
  assert.equal(sizing.recommend(m, "compressive").size, "L");
  assert.equal(sizing.recommend(m, "relaxed").size, "S");
});

test("off-chart measurements ask for a person", () => {
  const r = sizing.recommend({ chest: 52, waist: 45, hips: 55 }, "core");
  assert.equal(r.size, "3X");
  assert.equal(r.needsPerson, true);
});

test("missing measurements give no size", () => {
  assert.equal(sizing.recommend({ chest: 36, waist: 0, hips: 39 }, "core").size, null);
});

// Message check
test("a disclosed draft a person approved can send", () => {
  const ok = messages.review({ text: messages.SAMPLES[0].text, aiDrafted: true, disclosed: true, approvedBy: "Support lead" });
  assert.equal(ok.send, true);
});

test("the cart nudge fails tracking and pressure and lists both", () => {
  const r = messages.review({ text: messages.SAMPLES[1].text, aiDrafted: true, disclosed: true, approvedBy: "x" });
  assert.equal(r.send, false);
  assert.deepEqual(r.results.filter((x) => !x.ok).map((x) => x.id), ["tracking", "pressure"]);
});

test("a message in a real person's voice never sends, even when approved", () => {
  const r = messages.review({ text: "Hi!", inVoiceOf: "an ambassador", aiDrafted: true, disclosed: true, approvedBy: "CMO" });
  assert.equal(r.send, false);
});

test("an AI draft without approval or disclosure is blocked", () => {
  const r = messages.review({ text: "Your order shipped.", aiDrafted: true, disclosed: false, approvedBy: "" });
  assert.deepEqual(r.results.filter((x) => !x.ok).map((x) => x.id), ["disclosed", "approved"]);
});

// Customer value
test("counting returns lowers every channel and keeps the order sensible", () => {
  const rows = value.byChannel(channels, 60);
  for (const r of rows) assert.ok(r.effective < r.plain, r.channel);
  assert.equal(rows.at(-1).channel, "Paid social");
});

test("paid social falls below the 3.0 target once returns count", () => {
  const ps = value.byChannel(channels, 60).find((r) => r.channel === "Paid social");
  assert.equal(ps.belowTarget, true);
});

test("a negative return cost is refused", () => {
  assert.throws(() => value.byChannel(channels, -1));
});
