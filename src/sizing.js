// Sizing check: are bigger sizes sent back more often, and does that cross the line
// where the fit tool should stop recommending sizes until someone reviews it?
(function (root) {
  "use strict";

  const SIZES = ["XS", "S", "M", "L", "XL", "2X", "3X"];
  const STANDARD = ["XS", "S", "M", "L"];
  const GAP_LIMIT = 5; // percentage points between extended and standard sizes

  // One scale, each size bigger than the last on every measure (inches).
  const CHART = {
    XS: { chest: 32, waist: 25, hips: 35 },
    S: { chest: 34, waist: 27, hips: 37 },
    M: { chest: 36, waist: 29, hips: 39 },
    L: { chest: 38, waist: 31, hips: 41 },
    XL: { chest: 41, waist: 34, hips: 44 },
    "2X": { chest: 44, waist: 37, hips: 47 },
    "3X": { chest: 47, waist: 40, hips: 50 },
  };

  // How each cut fits, from the team's prototype and a customer review in the case data.
  const CUTS = {
    core: { label: "Core line", shift: 0, note: "Runs true to size." },
    compressive: { label: "Compressive knit", shift: 1, note: "Runs snug at the hips, so go one size up." },
    relaxed: { label: "Relaxed waistband", shift: -1, note: "The waistband runs wide, so go one size down." },
  };

  function rate(rows, names) {
    const picked = rows.filter((r) => names.includes(r.size));
    const orders = picked.reduce((s, r) => s + r.orders, 0);
    const returns = picked.reduce((s, r) => s + r.returns, 0);
    if (!orders) throw new Error(`No orders for ${names.join(", ")}.`);
    return (returns / orders) * 100;
  }

  function gap(rows) {
    const standard = rate(rows, STANDARD);
    const extended = rate(rows, SIZES.filter((s) => !STANDARD.includes(s)));
    const points = extended - standard;
    return { standard, extended, points, paused: points > GAP_LIMIT, limit: GAP_LIMIT };
  }

  function byBand(rows) {
    return SIZES.map((size) => {
      const r = rows.find((x) => x.size === size);
      if (!r) throw new Error(`Size ${size} missing from data.`);
      return { size, rate: (r.returns / r.orders) * 100, orders: r.orders };
    });
  }

  function recommend({ chest, waist, hips }, cut) {
    const c = CUTS[cut];
    if (!c) throw new Error(`Unknown cut "${cut}".`);
    for (const m of [chest, waist, hips]) {
      if (!(m > 0)) return { size: null, note: "Enter all three measurements." };
    }
    let i = SIZES.findIndex((s) => CHART[s].chest >= chest && CHART[s].waist >= waist && CHART[s].hips >= hips);
    const offChart = i === -1;
    if (offChart) i = SIZES.length - 1;
    const base = SIZES[i];
    const j = Math.min(SIZES.length - 1, Math.max(0, i + c.shift));
    const notes = [c.note];
    if (offChart) notes.push("Measurements are above the chart, so a person should check this one.");
    else if (j === i && c.shift !== 0) notes.push("Already at the end of the range, so no change.");
    return { size: SIZES[j], base, note: notes.join(" "), needsPerson: offChart };
  }

  const api = { SIZES, STANDARD, GAP_LIMIT, CHART, CUTS, gap, byBand, recommend };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RelaySizing = api;
})(typeof self !== "undefined" ? self : this);
