// The reflex: a signal becomes an alert with one named owner and two clocks.
// Pure functions over a plain state object, so the same events always give the same result
// and a replayed event changes nothing.
(function (root) {
  "use strict";

  const routes = typeof require === "function" ? require("./routes.js") : root.RelayRoutes;

  function emptyState() {
    return { alerts: {}, seen: {}, log: [] };
  }

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  // Events: { id, at, kind: "signal"|"ack"|"act", ... }
  //   signal: { alertId, type, detail }
  //   ack:    { alertId, by }
  //   act:    { alertId, by, note }
  function apply(state, event) {
    if (!event || !event.id) throw new Error("Every event needs an id.");
    if (state.seen[event.id]) return state; // delivered twice, applied once
    const next = clone(state);
    next.seen[event.id] = true;
    if (event.kind === "noop") return next; // only moves the clock forward
    const a = next.alerts[event.alertId];

    if (event.kind === "signal") {
      if (a) return note(next, event.at, `${event.alertId}: repeat signal folded into the open alert`);
      const r = routes.routeFor(event.type);
      next.alerts[event.alertId] = {
        id: event.alertId,
        type: event.type,
        detail: event.detail || "",
        status: "open",
        owner: r.owner,
        level: 0,
        openedAt: event.at,
        deadline: event.at + r.ackWithin,
        ackAt: null,
        actAt: null,
      };
      return note(next, event.at, `${event.alertId}: sent to ${r.owner}, told ${r.tells.join(", ")}`);
    }

    if (!a) throw new Error(`Event ${event.id} points at unknown alert ${event.alertId}.`);
    if (a.status === "closed") return note(next, event.at, `${a.id}: already closed, ${event.kind} ignored`);

    if (event.kind === "ack") {
      if (a.ackAt !== null) return next;
      a.ackAt = event.at;
      a.status = "acknowledged";
      a.deadline = event.at + routes.routeFor(a.type).actWithin;
      return note(next, event.at, `${a.id}: acknowledged by ${event.by}`);
    }

    if (event.kind === "act") {
      a.actAt = event.at;
      a.status = "closed";
      if (a.ackAt === null) a.ackAt = event.at;
      return note(next, event.at, `${a.id}: closed by ${event.by}. ${event.note || ""}`.trim());
    }

    throw new Error(`Unknown event kind "${event.kind}".`);
  }

  // Move every overdue alert one step up its chain. Safe to call as often as you like.
  function tick(state, now) {
    let next = state;
    for (const id of Object.keys(state.alerts)) {
      const a = state.alerts[id];
      if (a.status === "closed" || now < a.deadline) continue;
      if (next === state) next = clone(state);
      const b = next.alerts[id];
      const r = routes.routeFor(b.type);
      const chain = r.escalation;
      const waited = b.status === "acknowledged" ? "acknowledged but no action" : "no answer";
      if (b.level < chain.length) {
        b.level += 1;
        b.owner = chain[b.level - 1];
        b.deadline = b.deadline + r.ackWithin;
        note(next, now, `${id}: ${waited}, escalated to ${b.owner}`);
      } else {
        b.status = "stuck";
        b.deadline = Infinity;
        note(next, now, `${id}: ${waited} at the top of the chain, flagged as stuck`);
      }
    }
    return next;
  }

  function note(state, at, text) {
    state.log.push({ at, text });
    return state;
  }

  function run(events, { tickEvery = routes.HOUR } = {}) {
    const sorted = [...events].sort((x, y) => x.at - y.at);
    let s = emptyState();
    if (!sorted.length) return s;
    let clock = sorted[0].at;
    for (const e of sorted) {
      while (clock + tickEvery <= e.at) { clock += tickEvery; s = tick(s, clock); }
      s = apply(s, e);
    }
    return s;
  }

  const api = { emptyState, apply, tick, run };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RelayReflex = api;
})(typeof self !== "undefined" ? self : this);
