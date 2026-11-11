// Replay a month of daily demand and stock: find the first warning, open an alert,
// then play out how the owner responds. Compares the old path (someone notices eventually)
// with a signal that has an owner from the first hour.
(function (root) {
  "use strict";

  const node = typeof require === "function";
  const routes = node ? require("./routes.js") : root.RelayRoutes;
  const reflex = node ? require("./reflex.js") : root.RelayReflex;
  const DAY = 24 * routes.HOUR;
  const SLOW_PATH_DAYS = 11; // the case: demand turned Dec 10, the expedite went in Dec 21

  // Spike: today's demand above 1.5x the trailing 7-day average.
  // Stock risk: fewer than 10 days of cover at today's rate.
  function detect(rows, { spikeRatio = 1.5, coverDays = 10 } = {}) {
    const found = [];
    rows.forEach((r, i) => {
      if (i >= 7) {
        const avg = rows.slice(i - 7, i).reduce((s, x) => s + x.demand, 0) / 7;
        if (r.demand > spikeRatio * avg) found.push({ day: i, date: r.date, type: "demand_spike", detail: `Demand ${r.demand.toLocaleString("en-US")} vs a 7-day average of ${Math.round(avg).toLocaleString("en-US")}` });
      }
      const cover = r.demand > 0 ? r.on_hand / r.demand : Infinity;
      if (cover < coverDays) found.push({ day: i, date: r.date, type: "stock_risk", detail: `${cover.toFixed(1)} days of stock left at today's pace` });
    });
    return found;
  }

  // response: "acts" (acknowledges, then acts), "acks" (acknowledges, never acts), "silent" (never answers)
  // hours: how long the owner takes to answer, and again to act.
  function replay(rows, { response = "acts", hours = 1, start = Date.UTC(2025, 11, 1, 9) } = {}) {
    const signals = detect(rows);
    const base = { signals, first: null, alert: null, state: reflex.emptyState(), slowPathHours: SLOW_PATH_DAYS * 24, reflexHours: null };
    if (!signals.length) return base;
    const first = signals[0];
    const t0 = start + first.day * DAY;
    const H = routes.HOUR;
    const signal = { id: "s1", kind: "signal", at: t0, alertId: "A1", type: first.type, detail: first.detail };
    const events = [signal, { ...signal }]; // the feed delivers it twice; the second does nothing
    if (response !== "silent") events.push({ id: "k1", kind: "ack", at: t0 + hours * H, alertId: "A1", by: "whoever holds the alert" });
    if (response === "acts") events.push({ id: "a1", kind: "act", at: t0 + 2 * hours * H, alertId: "A1", by: "whoever holds the alert", note: routes.routeFor(first.type).action });
    // Keep the clock running long enough for escalation to show when nobody acts.
    events.push({ id: "end", kind: "noop", at: t0 + 24 * H });
    const state = reflex.run(events);
    const alert = state.alerts.A1;
    return {
      ...base,
      first,
      alert,
      state,
      reflexHours: alert.actAt === null ? null : (alert.actAt - alert.openedAt) / H,
    };
  }

  const api = { detect, replay, SLOW_PATH_DAYS };
  if (node && typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RelayReplay = api;
})(typeof self !== "undefined" ? self : this);
