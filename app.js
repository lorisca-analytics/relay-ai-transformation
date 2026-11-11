// Page wiring: tabs, the December replay, and each tab's controls.
// All logic lives in src/ (tested in Node). This file only reads inputs and draws.
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const icon = (name, cls = "") => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const chip = (kind, iconName, text) => `<span class="chip ${kind}">${icon(iconName)}${esc(text)}</span>`;
const fmtDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- tabs (keyboard: arrows, Home, End) ---------- */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab, focus = true) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute("aria-controls")).hidden = !on;
  }
  if (focus) tab.focus();
  history.replaceState(null, "", `#${tab.getAttribute("aria-controls")}`);
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => selectTab(t));
  t.addEventListener("keydown", (e) => {
    const k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (k) { e.preventDefault(); selectTab(tabs[(i + k + tabs.length) % tabs.length]); }
    if (e.key === "Home") { e.preventDefault(); selectTab(tabs[0]); }
    if (e.key === "End") { e.preventDefault(); selectTab(tabs.at(-1)); }
  });
});
function tabFromHash() {
  const t = tabs.find((x) => `#${x.getAttribute("aria-controls")}` === location.hash);
  if (t) selectTab(t, false);
}
window.addEventListener("hashchange", tabFromHash);
tabFromHash();

/* ---------- theme ---------- */
$("theme").addEventListener("click", () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const now = document.documentElement.dataset.theme || (dark ? "dark" : "light");
  const next = now === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) { /* private mode: theme just won't persist */ }
});

/* ---------- data ---------- */
const load = (file, textColumns) => fetch(`data/${file}`).then((r) => {
  if (!r.ok) throw new Error(`${file}: ${r.status}`);
  return r.text();
}).then((t) => RelayCsv.parseCsv(t, { textColumns }));

Promise.all([
  load("december-synthetic.csv", ["date"]),
  load("sizes-synthetic.csv", ["size"]),
  load("channels-synthetic.csv", ["channel"]),
]).then(([december, sizes, channels]) => {
  initAlarm(december);
  initSizing(sizes);
  initMessages();
  initValue(channels);
}).catch((err) => {
  document.querySelector(".app").insertAdjacentHTML("afterbegin",
    `<p class="block" style="grid-column:1/-1">${chip("bad", "warn", "Data didn't load")} Open this page through a web server (see the README). ${esc(err.message)}</p>`);
});

/* ---------- stock alarm ---------- */
function initAlarm(rows) {
  const signals = RelayReplay.detect(rows);
  const firstDay = signals.length ? signals[0].day : null;
  const outDay = rows.findIndex((r) => r.on_hand === 0);

  function drawChart(upTo) {
    const W = 720, H = 240, pad = { l: 44, r: 12, t: 12, b: 26 };
    const maxD = Math.max(...rows.map((r) => r.demand));
    const maxS = Math.max(...rows.map((r) => r.on_hand));
    const bw = (W - pad.l - pad.r) / rows.length;
    const y = (v, max) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="December demand and stock. First warning on ${firstDay !== null ? fmtDate(rows[firstDay].date) : "no day"}, stock runs out on ${outDay >= 0 ? fmtDate(rows[outDay].date) : "no day"}.">`;
    for (const f of [0, 0.5, 1]) s += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(maxD * f, maxD)}" y2="${y(maxD * f, maxD)}"/><text x="${pad.l - 6}" y="${y(maxD * f, maxD) + 4}" text-anchor="end">${Math.round(maxD * f / 1000)}k</text>`;
    rows.forEach((r, i) => {
      if (i > upTo) return;
      const x = pad.l + i * bw + 2;
      s += `<rect class="bar${r.on_hand === 0 ? " out" : ""}" x="${x}" y="${y(r.demand, maxD)}" width="${bw - 4}" height="${H - pad.b - y(r.demand, maxD)}" rx="2"/>`;
      if ((i + 1) % 5 === 1) s += `<text x="${x + (bw - 4) / 2}" y="${H - 8}" text-anchor="middle">Dec ${i + 1}</text>`;
    });
    const pts = rows.slice(0, upTo + 1).map((r, i) => `${pad.l + i * bw + bw / 2},${y(r.on_hand, maxS)}`).join(" ");
    s += `<polyline class="stock" points="${pts}"/>`;
    if (firstDay !== null && upTo >= firstDay) {
      const x = pad.l + firstDay * bw + bw / 2;
      s += `<line class="marker" x1="${x}" x2="${x}" y1="${pad.t}" y2="${H - pad.b}"/>`;
    }
    if (upTo < rows.length - 1) {
      const x = pad.l + upTo * bw + bw;
      s += `<line class="cursor" x1="${x}" x2="${x}" y1="${pad.t}" y2="${H - pad.b}"/>`;
    }
    $("dec-chart").innerHTML = s + "</svg>";
  }

  function hoursLabel(h) { return h === null ? "Not closed" : h < 48 ? `${h} hours` : `${Math.round(h / 24)} days`; }

  function render() {
    const response = document.querySelector('input[name="response"]:checked').value;
    const hours = Number($("hours").value);
    const out = RelayReplay.replay(rows, { response, hours });
    const a = out.alert;
    if (!a) { $("alert-card").innerHTML = "<p>No warning this month.</p>"; return; }

    const slowPct = 100;
    const fastPct = a.status === "closed" ? Math.max(1.5, (out.reflexHours / out.slowPathHours) * 100) : 100;
    $("lanes").innerHTML = `
      <div class="lane"><span class="small">Old path</span><div class="lane-track"><div class="lane-fill slow" style="transform:scaleX(${slowPct / 100})"></div></div><span class="lane-val">11 days</span></div>
      <div class="lane"><span class="small">Owner path</span><div class="lane-track"><div class="lane-fill ${a.status === "closed" ? "fast" : "stuck"}" style="transform:scaleX(${fastPct / 100})"></div></div><span class="lane-val">${hoursLabel(out.reflexHours)}</span></div>`;

    const r = RelayRoutes.routeFor(a.type);
    const chain = [r.owner, ...r.escalation];
    const status = a.status === "closed" ? chip("good", "check", "Closed: action taken")
      : a.status === "stuck" ? chip("bad", "warn", "Stuck at the top of the chain")
      : chip("warn", "warn", "Waiting");
    $("alert-card").innerHTML = `
      <div class="alert-top"><h3>${a.type === "stock_risk" ? "Stock running low" : "Demand spike"}, ${fmtDate(out.first.date)}</h3>${status}</div>
      <p class="small">${esc(out.first.detail)}.</p>
      <p class="small muted" style="margin-top:.4rem">Answer within ${r.ackWithin / RelayRoutes.HOUR} h, act within ${r.actWithin / RelayRoutes.HOUR} h. Next step: ${esc(r.action.toLowerCase())}.</p>
      <ol class="ladder" aria-label="Escalation chain">${chain.map((c, i) => `${i ? '<li class="sep" aria-hidden="true">›</li>' : ""}<li class="${c === a.owner ? "now" : ""}"${c === a.owner ? ' aria-current="step"' : ""}>${esc(c)}</li>`).join("")}</ol>`;

    const t0 = a.openedAt;
    $("log").innerHTML = out.state.log.map((l) => `<tr><td>+${Math.round((l.at - t0) / RelayRoutes.HOUR)} h</td><td>${esc(cap(l.text.replace(/^A1: /, "")))}</td></tr>`).join("");
  }

  drawChart(rows.length - 1);
  render();
  document.querySelectorAll('input[name="response"]').forEach((el) => el.addEventListener("change", render));
  $("hours").addEventListener("change", render);

  // The one authored moment: December plays out day by day, the warning lands, then the outcome.
  let timer = null;
  $("replay").addEventListener("click", () => {
    selectTab(tabs[0], false);
    if (reduceMotion) { drawChart(rows.length - 1); render(); return; }
    clearInterval(timer);
    let d = 0;
    $("replay").disabled = true;
    timer = setInterval(() => {
      drawChart(d);
      if (++d >= rows.length) { clearInterval(timer); $("replay").disabled = false; render(); }
    }, 70);
  });
}

/* ---------- sizing ---------- */
function initSizing(rows) {
  const bands = RelaySizing.byBand(rows);
  const g = RelaySizing.gap(rows);
  const W = 720, H = 220, pad = { l: 40, r: 12, t: 14, b: 26 };
  const max = 35;
  const bw = (W - pad.l - pad.r) / bands.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const limitAt = g.standard + g.limit;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Return rate by size, from ${bands[0].rate.toFixed(1)}% at XS to ${bands.at(-1).rate.toFixed(1)}% at 3X.">`;
  for (const v of [0, 10, 20, 30]) s += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
  bands.forEach((b, i) => {
    const x = pad.l + i * bw + 10;
    const over = b.rate > limitAt;
    s += `<rect class="bar${over ? " out" : ""}" x="${x}" y="${y(b.rate)}" width="${bw - 20}" height="${H - pad.b - y(b.rate)}" rx="3"/>`;
    s += `<text x="${x + (bw - 20) / 2}" y="${y(b.rate) - 5}" text-anchor="middle">${b.rate.toFixed(1)}%</text>`;
    s += `<text x="${x + (bw - 20) / 2}" y="${H - 8}" text-anchor="middle">${b.size}</text>`;
  });
  s += `<line class="limit" x1="${pad.l}" x2="${W - pad.r}" y1="${y(limitAt)}" y2="${y(limitAt)}"/>`;
  $("size-chart").innerHTML = s + "</svg>";
  $("gap-chip").innerHTML = g.paused ? chip("bad", "warn", "Fit tool paused for review") : chip("good", "check", "Fit tool on");
  $("gap-text").textContent = `Extended sizes (XL to 3X) come back ${g.extended.toFixed(1)}% of the time, standard sizes (XS to L) ${g.standard.toFixed(1)}%. That's a ${g.points.toFixed(1)}-point gap against a ${g.limit}-point limit (dashed line). Red bars sit above it.`;

  const cut = $("cut");
  cut.innerHTML = Object.entries(RelaySizing.CUTS).map(([k, c]) => `<option value="${k}">${esc(c.label)}</option>`).join("");
  function fit() {
    const r = RelaySizing.recommend({ chest: Number($("chest").value), waist: Number($("waist").value), hips: Number($("hips").value) }, cut.value);
    $("fit-result").innerHTML = r.size
      ? `<p class="small muted">Suggested size</p><p class="big">${r.size}</p><p class="small" style="margin-top:.5rem">${esc(r.note)}${r.base !== r.size ? ` Chart size before the cut rule: ${r.base}.` : ""}</p>${r.needsPerson ? `<p style="margin-top:.5rem">${chip("warn", "warn", "Send to a person")}</p>` : ""}${g.paused ? `<p class="small muted" style="margin-top:.5rem">While the fit tool is paused, the agent confirms every extended-size suggestion before it reaches the customer.</p>` : ""}`
      : `<p>${esc(r.note)}</p>`;
  }
  ["chest", "waist", "hips", "cut"].forEach((id) => $(id).addEventListener("input", fit));
  fit();
}

/* ---------- message check ---------- */
function initMessages() {
  $("samples").innerHTML = RelayMessages.SAMPLES.map((s, i) => `<button type="button" data-i="${i}">${esc(s.label)}</button>`).join("");
  function pick(i) {
    const s = RelayMessages.SAMPLES[i];
    $("msg").value = s.text;
    $("voice").checked = Boolean(s.inVoiceOf);
    check();
  }
  $("samples").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) pick(Number(b.dataset.i)); });

  function check() {
    const r = RelayMessages.review({
      text: $("msg").value,
      aiDrafted: $("ai").checked,
      disclosed: $("disclosed").checked,
      approvedBy: $("approver").value,
      inVoiceOf: $("voice").checked ? "a real person" : null,
    });
    $("rules").innerHTML = r.results.map((x) => `<li>${icon(x.ok ? "check" : "x", x.ok ? "ok" : "no")}<span><b>${esc(x.name)}</b> <span class="sr">${x.ok ? "passes" : "fails"}</span></span><p>${esc(x.detail)}</p></li>`).join("");
    const fails = r.results.filter((x) => !x.ok).length;
    $("send").disabled = !r.send || !$("msg").value.trim();
    $("send-note").textContent = !$("msg").value.trim() ? "Write or pick a message first." : r.send ? "All checks pass." : `${fails} check${fails > 1 ? "s" : ""} to fix before it can send.`;
  }
  ["msg", "ai", "disclosed", "voice", "approver"].forEach((id) => $(id).addEventListener("input", check));
  $("send").addEventListener("click", () => { $("send-note").textContent = "Ready to send. In the demo nothing actually goes out."; });
  pick(1);
}

/* ---------- customer value ---------- */
function initValue(rows) {
  function render() {
    const cost = Number($("retcost").value);
    $("retcost-val").textContent = `$${cost}`;
    const list = RelayValue.byChannel(rows, cost);
    const W = 720, rowH = 40, pad = { l: 150, r: 56, t: 8 };
    const max = Math.max(16, ...list.map((x) => x.plain));
    const H = pad.t + list.length * rowH + 22;
    const x = (v) => pad.l + (W - pad.l - pad.r) * (v / max);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Customer value per dollar of acquisition cost by channel, with returns counted at $${cost} per customer.">`;
    list.forEach((c, i) => {
      const yy = pad.t + i * rowH;
      s += `<text x="${pad.l - 10}" y="${yy + 21}" text-anchor="end">${esc(c.channel)}</text>`;
      s += `<rect class="plain" x="${pad.l}" y="${yy + 6}" width="${x(c.plain) - pad.l}" height="22" rx="3"/>`;
      s += `<rect class="bar${c.belowTarget ? " out" : ""}" x="${pad.l}" y="${yy + 10}" width="${x(c.effective) - pad.l}" height="14" rx="3"/>`;
      s += `<text x="${Math.max(x(c.plain), x(c.effective)) + 6}" y="${yy + 21}">${c.effective.toFixed(1)}x</text>`;
    });
    s += `<line class="target" x1="${x(3)}" x2="${x(3)}" y1="${pad.t}" y2="${H - 18}"/><text x="${x(3)}" y="${H - 4}" text-anchor="middle">3.0x</text>`;
    $("value-chart").innerHTML = s + "</svg>";
    const below = list.filter((c) => c.belowTarget).map((c) => c.channel);
    $("value-text").textContent = below.length
      ? `At $${cost} per customer, ${below.join(" and ")} ${below.length > 1 ? "fall" : "falls"} under the 3.0x target. Community referral stays at ${list.find((c) => c.channel === "Community referral").effective.toFixed(1)}x.`
      : `At $${cost} per customer, every channel stays above the 3.0x target. Push the assumption up to see which one breaks first.`;
  }
  $("retcost").addEventListener("input", render);
  render();
}
