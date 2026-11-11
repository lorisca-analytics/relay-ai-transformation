// Who owns each kind of signal, how fast they must answer, and who hears about it next.
// Edit this table, not the engine. Every signal type needs an owner role before it can fire.
(function (root) {
  "use strict";

  const HOUR = 60 * 60 * 1000;

  // ackWithin: time to say "I have it". actWithin: time from ack to a real action.
  // The second clock exists because the first one is easy to game: clicking "seen" is not acting.
  const ROUTES = {
    demand_spike: {
      owner: "Inventory lead (Operations)",
      escalation: ["Head of data and operations", "CFO"],
      ackWithin: 2 * HOUR,
      actWithin: 6 * HOUR,
      action: "Place or expedite a reorder, or move stock between warehouses",
      tells: ["Marketing", "Community"],
    },
    stock_risk: {
      owner: "Inventory lead (Operations)",
      escalation: ["Head of data and operations", "CFO"],
      ackWithin: 2 * HOUR,
      actWithin: 6 * HOUR,
      action: "Expedite a reorder before the shelf is empty",
      tells: ["Marketing", "Community"],
    },
    trust_drop: {
      owner: "Head of community",
      escalation: ["Founder"],
      ackWithin: 12 * HOUR,
      actWithin: 48 * HOUR,
      action: "Pause automated posting and reach the affected ambassadors in person",
      tells: ["Governance lead"],
    },
    size_return_gap: {
      owner: "Data lead and merchandising lead",
      escalation: ["Head of data and operations"],
      ackWithin: 24 * HOUR,
      actWithin: 7 * 24 * HOUR,
      action: "Pause the fit predictor for that product line and start a bias review",
      tells: ["Head of community", "Governance lead"],
    },
  };

  function routeFor(type) {
    const r = ROUTES[type];
    if (!r) throw new Error(`No owner for signal type "${type}". Add a route before it can fire.`);
    return r;
  }

  const api = { ROUTES, routeFor, HOUR };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RelayRoutes = api;
})(typeof self !== "undefined" ? self : this);
