// Writes the three made-up data files the page reads. Seeded, so the output never changes
// unless this file does. CI regenerates them and fails if they drift.
//   data/december-synthetic.csv   one product line, 31 days: demand, stock, backorders
//   data/sizes-synthetic.csv      orders and returns by size for one season
//   data/channels-synthetic.csv   customer value and acquisition cost by channel
// Shaped like the case story (a December spike, plus sizes returned more often), with numbers made up here.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

let seed = 20251201;
function rand() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
const out = (name, lines) => {
  const file = path.join(__dirname, "..", "data", name);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  console.log(`Wrote ${lines.length - 1} rows to data/${name}`);
};

// December: steady demand, a campaign lift from day 8, the shelf runs out mid-month.
const dec = ["date,demand,on_hand,backordered"];
let onHand = 120000;
let backordered = 0;
for (let d = 1; d <= 31; d++) {
  const base = 6000 + Math.round(rand() * 600);
  const lift = d < 8 ? 1 : d <= 13 ? 1 + (d - 7) * 0.32 : 2.6 - (d - 13) * 0.04;
  const demand = Math.round(base * lift);
  const shipped = Math.min(onHand, demand);
  onHand -= shipped;
  backordered += demand - shipped;
  dec.push(`2025-12-${String(d).padStart(2, "0")},${demand},${onHand},${backordered}`);
}
out("december-synthetic.csv", dec);

// Sizes: one scale, XS to 3X. Return rates climb with size, the way the case describes.
const sizes = ["size,orders,returns"];
const curve = { XS: [1300, 0.205], S: [3600, 0.212], M: [5800, 0.219], L: [4500, 0.236], XL: [2400, 0.272], "2X": [1100, 0.298], "3X": [520, 0.311] };
for (const [size, [orders, rate]] of Object.entries(curve)) {
  const o = orders + Math.round(rand() * 120);
  sizes.push(`${size},${o},${Math.round(o * (rate + (rand() - 0.5) * 0.006))}`);
}
out("sizes-synthetic.csv", sizes);

// Channels: 24-month value per customer, what it cost to win them, and how often they return things.
const channels = ["channel,customers,value_24mo,acquisition_cost,return_rate"];
const ch = [
  ["Community referral", 8200, 410, 41, 0.20],
  ["Email", 5100, 372, 24, 0.21],
  ["Organic search", 6900, 351, 30, 0.22],
  ["Paid search", 9400, 298, 82, 0.25],
  ["Paid social", 12600, 256, 97, 0.27],
];
for (const [name, n, v, c, r] of ch) {
  channels.push(`${name},${n + Math.round(rand() * 200)},${v},${c},${r}`);
}
out("channels-synthetic.csv", channels);
