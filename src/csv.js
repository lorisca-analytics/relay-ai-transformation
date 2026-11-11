// Tiny CSV reader for the made-up data files: no quotes, no commas inside fields.
(function (root) {
  "use strict";

  function parseCsv(text, { textColumns = [] } = {}) {
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const cols = head.split(",");
    return lines.filter(Boolean).map((line) => {
      const v = line.split(",");
      if (v.length !== cols.length) throw new Error(`Row has ${v.length} fields, expected ${cols.length}: ${line}`);
      const row = {};
      cols.forEach((c, i) => {
        const n = Number(v[i]);
        row[c] = textColumns.includes(c) || Number.isNaN(n) ? v[i] : n;
      });
      return row;
    });
  }

  const api = { parseCsv };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RelayCsv = api;
})(typeof self !== "undefined" ? self : this);
