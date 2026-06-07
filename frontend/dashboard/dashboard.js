// Teacher dashboard: pupil progress overview + per-pupil drill-down + leaderboards.
import { loadToken } from "../src/core.js";
import { api } from "../src/net.js";
import { ACTIONS } from "../src/data/actions.js";

const content = document.getElementById("content");
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};

function message(title, body) {
  content.innerHTML = `<div class="msg"><h1>${title}</h1><p>${body}</p></div>`;
}

function fmtDate(d) {
  if (!d) return "never";
  const t = new Date(d);
  const days = Math.floor((Date.now() - t.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

let pupils = [];
let selectedId = null;

async function load() {
  if (!loadToken()) {
    return message("Teacher Dashboard", "Launch from joltcomputing.com/tools/codequest/?next=dashboard to sign in.");
  }
  content.innerHTML = "<p class='muted'>Loading…</p>";
  try {
    const data = await api.dashboardPupils();
    pupils = data.pupils;
    render();
  } catch (e) {
    if (e.status === 403) return message("Teachers only", "Your account isn't flagged as a teacher.");
    if (e.status === 401) return message("Session expired", "Relaunch from joltcomputing.com to sign back in.");
    return message("Error", e.message);
  }
}

function render() {
  const stuck = pupils.filter((p) => p.stuck).length;
  const totalCommands = pupils.reduce((s, p) => s + Number(p.commands_coded), 0);

  content.innerHTML = "";
  content.append(
    statRow([
      [pupils.length, "Pupils"],
      [stuck, "Flagged stuck"],
      [totalCommands, "Commands coded"],
    ]),
  );

  const cols = el("div", { className: "dash-cols" });
  cols.append(pupilTableCard(), el("div", {}, detailCard(), scoresCard()));
  content.append(cols);

  if (selectedId) loadDetail(selectedId);
  loadScores();
}

function statRow(items) {
  const row = el("div", { className: "stat-row" });
  for (const [n, l] of items) {
    row.append(el("div", { className: "stat" }, el("div", { className: "n", textContent: String(n) }), el("div", { className: "l", textContent: l })));
  }
  return row;
}

function pupilTableCard() {
  const card = el("div", { className: "card" });
  card.append(el("h2", { textContent: "Pupils" }));
  if (!pupils.length) {
    card.append(el("p", { className: "muted", textContent: "No pupils have played yet." }));
    return card;
  }
  const table = el("table", { className: "grid" });
  table.innerHTML =
    "<thead><tr><th>Name</th><th>Form</th><th class='num'>Actions</th><th class='num'>Commands</th>" +
    "<th class='num'>Defeated</th><th class='num'>Charges</th><th>Last seen</th></tr></thead>";
  const tb = el("tbody");
  for (const p of pupils) {
    const tr = el("tr", { className: "pupil" + (p.stuck ? " stuck" : "") + (p.id === selectedId ? " sel" : "") });
    tr.append(
      el("td", {}, p.display_name, p.stuck ? el("span", { className: "badge", textContent: "stuck", style: "margin-left:6px" }) : ""),
      el("td", { className: "muted", textContent: p.year_group || "—" }),
      el("td", { className: "num", textContent: String(p.actions_unlocked) }),
      el("td", { className: "num", textContent: String(p.commands_coded) }),
      el("td", { className: "num", textContent: String(p.enemies_defeated) }),
      el("td", { className: "num", textContent: String(p.charges_consumed) }),
      el("td", { className: "muted", textContent: fmtDate(p.last_seen_at) }),
    );
    tr.addEventListener("click", () => {
      selectedId = p.id;
      document.querySelectorAll("tr.pupil").forEach((r) => r.classList.remove("sel"));
      tr.classList.add("sel");
      loadDetail(p.id);
    });
    tb.append(tr);
  }
  table.append(tb);
  card.append(table);
  return card;
}

function detailCard() {
  const card = el("div", { className: "card", id: "detail" });
  card.append(el("h2", { textContent: "Pupil detail" }));
  card.append(el("div", { className: "empty", id: "detail-body", textContent: "Select a pupil to see their breakdown." }));
  return card;
}

async function loadDetail(id) {
  const body = document.getElementById("detail-body");
  if (!body) return;
  body.className = "";
  body.textContent = "Loading…";
  try {
    const d = await api.dashboardPupil(id);
    body.innerHTML = "";
    body.append(el("p", {}, el("strong", { textContent: d.user.display_name }), ` — ${d.user.year_group || "no form"}`));
    body.append(
      el("p", {
        className: "muted",
        textContent:
          `Combat Lv ${d.user.combat_level} · Survival Lv ${d.user.survival_level} · ` +
          `Total ${d.user.total_level} · HP ${d.user.health ?? d.user.max_health}/${d.user.max_health}`,
      }),
    );

    const at = el("table", { className: "grid" });
    at.innerHTML = "<thead><tr><th>Action</th><th class='num'>Tier</th><th class='num'>Charges</th><th class='num'>Coded</th><th>Key</th></tr></thead>";
    const atb = el("tbody");
    if (!d.actions.length) {
      atb.innerHTML = "<tr><td colspan='5' class='muted'>No actions unlocked.</td></tr>";
    } else {
      for (const a of d.actions) {
        const label = ACTIONS[a.action_name] ? ACTIONS[a.action_name].label : a.action_name;
        atb.append(
          el("tr", {},
            el("td", { textContent: label }),
            el("td", { className: "num", textContent: "T" + a.tier }),
            el("td", { className: "num", textContent: String(a.charges_remaining) }),
            el("td", { className: "num", textContent: String(a.times_coded) }),
            el("td", { className: "muted", textContent: a.bound_key || "—" }),
          ),
        );
      }
    }
    at.append(atb);
    body.append(el("h3", { textContent: "Actions", style: "color:var(--gold);font-size:13px;margin:10px 0 4px" }), at);

    const wins = d.combat.reduce((s, c) => s + Number(c.wins), 0);
    body.append(el("p", { className: "muted", style: "margin-top:10px", textContent: `Enemies defeated: ${wins} · Charges consumed: ${d.user.total_charges_consumed}` }));
  } catch (e) {
    body.textContent = "Couldn't load detail: " + e.message;
  }
}

function scoresCard() {
  const card = el("div", { className: "card", id: "scores", style: "margin-top:16px" });
  card.append(el("h2", { textContent: "Leaderboards" }));
  card.append(el("div", { id: "scores-body", className: "muted", textContent: "Loading…" }));
  return card;
}

async function loadScores() {
  const body = document.getElementById("scores-body");
  if (!body) return;
  try {
    const { leaderboard } = await api.highscores();
    body.innerHTML = "";
    if (!leaderboard.length) {
      body.append(el("div", { className: "muted", textContent: "No players yet." }));
      return;
    }
    const t = el("table", { className: "grid" });
    t.innerHTML =
      "<thead><tr><th>#</th><th>Player</th><th class='num'>Combat</th><th class='num'>Survival</th><th class='num'>Total</th></tr></thead>";
    const tb = el("tbody");
    leaderboard.forEach((r, i) => {
      tb.append(
        el("tr", {},
          el("td", { className: "muted", textContent: String(i + 1) }),
          el("td", { textContent: r.display_name }),
          el("td", { className: "num", textContent: String(r.combat_level) }),
          el("td", { className: "num", textContent: String(r.survival_level) }),
          el("td", { className: "num", textContent: String(r.total_level) }),
        ),
      );
    });
    t.append(tb);
    body.append(t);
  } catch (e) {
    body.textContent = "Couldn't load scores.";
  }
}

document.getElementById("refresh").addEventListener("click", load);
load();
