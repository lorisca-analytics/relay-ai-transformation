// Customer value by channel, with returns counted. A channel can look cheap until you add
// what its customers send back. The return cost is an assumption the viewer can change.
(function (root) {
  "use strict";

  const TARGET = 3.0;

  // Effective cost = acquisition cost + return rate x cost of handling returns per customer.
  function byChannel(rows, returnCostPerCustomer) {
    if (!(returnCostPerCustomer >= 0)) throw new Error("Return cost must be zero or more.");
    return rows
      .map((r) => {
        const effectiveCost = r.acquisition_cost + r.return_rate * returnCostPerCustomer;
        return {
          channel: r.channel,
          plain: r.value_24mo / r.acquisition_cost,
          effective: r.value_24mo / effectiveCost,
          effectiveCost,
          belowTarget: r.value_24mo / effectiveCost < TARGET,
        };
      })
      .sort((a, b) => b.effective - a.effective);
  }

  const api = { TARGET, byChannel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RelayValue = api;
})(typeof self !== "undefined" ? self : this);
