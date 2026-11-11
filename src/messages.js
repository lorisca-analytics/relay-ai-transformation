// The send check for AI-written messages. These are plain rules, not AI: they catch the
// obvious cases and a person still reads every message before it goes out.
(function (root) {
  "use strict";

  // Phrases that tell a customer they were watched.
  const TRACKING = ["saw you looking", "we noticed you", "browsing history", "left in your cart", "you viewed", "you looked at", "seconds on"];
  // Pressure that a person on the team wouldn't write.
  const PRESSURE = ["act fast", "limited time", "hours left", "expires in", "last chance", "buy now"];

  const RULES = [
    {
      id: "voice",
      name: "Not in a real person's voice",
      why: "Messages never go out as an ambassador or any real person.",
      check: (m) => !m.inVoiceOf,
    },
    {
      id: "disclosed",
      name: "Says it was drafted with AI",
      why: "Customers can tell an AI draft from a person's note.",
      check: (m) => !m.aiDrafted || m.disclosed,
    },
    {
      id: "approved",
      name: "A person approved it",
      why: "AI drafts. A named person reads, edits and sends.",
      check: (m) => !m.aiDrafted || Boolean(m.approvedBy && m.approvedBy.trim()),
    },
    {
      id: "tracking",
      name: "No tracking talk",
      why: "Don't tell people they were watched.",
      check: (m) => !find(m.text, TRACKING),
    },
    {
      id: "pressure",
      name: "No countdown pressure",
      why: "Write it the way someone on the team would.",
      check: (m) => !find(m.text, PRESSURE),
    },
  ];

  function find(text, list) {
    const t = (text || "").toLowerCase();
    return list.find((p) => t.includes(p)) || null;
  }

  // Returns every rule's result, not just the first failure, so the writer sees the whole list.
  function review(msg) {
    const results = RULES.map((r) => {
      const ok = r.check(msg);
      let detail = r.why;
      if (!ok && r.id === "tracking") detail = `Contains "${find(msg.text, TRACKING)}". ${r.why}`;
      if (!ok && r.id === "pressure") detail = `Contains "${find(msg.text, PRESSURE)}". ${r.why}`;
      return { id: r.id, name: r.name, ok, detail };
    });
    return { send: results.every((r) => r.ok), results };
  }

  const SAMPLES = [
    {
      label: "Back-in-stock note",
      text: "Good news: the leggings you asked about are back in your size. Sorry for the wait in December.",
    },
    {
      label: "Cart nudge",
      text: "We noticed you left these in your cart. Act fast, only hours left before they're gone!",
    },
    {
      label: "Ambassador shout-out",
      text: "Hey runner, see you at Saturday's group run! Can't wait.",
      inVoiceOf: "a run-club ambassador",
    },
  ];

  const api = { RULES, SAMPLES, review };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RelayMessages = api;
})(typeof self !== "undefined" ? self : this);
