// Right panel: quests (list + current-quest progress), actions, inventory, high scores.
import { bus, state } from "../core.js";
import { api } from "../net.js";
import { ACTIONS } from "../data/actions.js";
import { QUESTS } from "../data/quests.js";
import { itemIcon } from "../data/items.js";
import { bottom, keyLabel } from "./bottomPanel.js";

const INV_SLOTS = 32; // 4 columns x 8 rows
const ACTION_ORDER = [
  "move_right", "move_left", "move_up", "move_down",
  "attack", "pick_up", "chop", "mine", "use", "cook", "eat", "equip",
];
const CLICK_ACTIONS = new Set(["use", "pick_up", "cook", "eat"]); // triggered by clicking, not a key
const td = (text, cls) => {
  const c = document.createElement("td");
  if (cls) c.className = cls;
  c.textContent = text;
  return c;
};

let sessionWins = 0; // animals defeated this session (for the "defeat 2" step)
const ljSteps = new Set(); // completed Lumberjack quest steps this session
let sellMode = false; // true while the shopkeeper sell window is open

export const right = {
  init() {
    document.querySelectorAll("#right-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => this.switchTab(tab.dataset.tab));
    });
    bus.on("state:changed", () => {
      this.renderActions();
      this.renderInventory();
      this.renderQuests();
      this.renderSkills();
      this.updateOrb();
    });
    bus.on("combat:won", () => {
      sessionWins += 1;
      this.renderQuests();
    });
    bus.on("quest:step:done", (id) => {
      ljSteps.add(id);
      this.renderQuests();
    });
    bus.on("use:selection", () => this.renderInventory());
    bus.on("shop:open", () => {
      sellMode = true;
      state.useSelection = null;
      this.switchTab("inventory");
      this.renderInventory();
      document.getElementById("sell-note")?.classList.remove("hidden");
    });
    bus.on("shop:close", () => {
      sellMode = false;
      this.renderInventory();
      document.getElementById("sell-note")?.classList.add("hidden");
    });
    this.renderActions();
    this.renderInventory();
    this.renderQuests();
    this.renderSkills();
    this.updateOrb();
  },

  switchTab(name) {
    document.querySelectorAll("#right-tabs .tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    ["quest", "skills", "actions", "inventory", "scores"].forEach((n) => {
      document.getElementById(`tab-${n}`).classList.toggle("hidden", n !== name);
    });
    if (name === "scores") this.renderScores();
  },

  renderSkills() {
    const body = document.getElementById("skills-body");
    if (!body) return;
    body.innerHTML = "";
    for (const [key, label] of [["combat", "Combat"], ["survival", "Survival"], ["coding", "Coding"]]) {
      const s = state.skills[key];
      const row = document.createElement("div");
      row.className = "skill-row";
      const name = document.createElement("span");
      name.className = "skill-name";
      name.textContent = label;
      const meta = document.createElement("span");
      meta.className = "skill-meta";
      meta.innerHTML = `<span class="skill-lvl">Lv ${s.level}</span><span class="skill-xp">${s.xp} XP</span>`;
      row.append(name, meta);
      body.appendChild(row);
    }
  },

  updateOrb() {
    const fill = document.getElementById("hp-orb-fill");
    const text = document.getElementById("hp-orb-text");
    if (!fill || !text) return;
    const pct = state.maxHealth ? Math.max(0, Math.min(100, (state.health / state.maxHealth) * 100)) : 0;
    fill.style.height = `${pct}%`;
    text.textContent = `${state.health}/${state.maxHealth}`;
  },

  // ---- Quests ----
  renderQuests() {
    const list = document.getElementById("quest-list");
    list.innerHTML = "";
    const active = activeQuest();
    for (const q of QUESTS) {
      const { done, total } = progress(q);
      const li = document.createElement("li");
      const complete = done === total;
      li.className = "quest-item" + (complete ? " complete" : active && q.id === active.id ? " active" : "");
      const name = document.createElement("span");
      name.textContent = (complete ? "✓ " : "") + q.title;
      const count = document.createElement("span");
      count.className = "qcount";
      count.textContent = `${done}/${total}`;
      li.append(name, count);
      list.appendChild(li);
    }

    const panel = document.getElementById("active-quest");
    panel.innerHTML = "";
    if (!active) {
      panel.innerHTML = "<div class='none'>All quests complete — well done!</div>";
      return;
    }
    panel.appendChild(Object.assign(document.createElement("div"), { className: "qtitle", textContent: active.title }));
    for (const s of active.steps) {
      const done = stepDone(s.id);
      const row = document.createElement("div");
      row.className = "quest-step " + (done ? "done" : "todo");
      row.textContent = (done ? "✓ " : "• ") + s.text;
      panel.appendChild(row);
    }
  },

  // ---- Actions ----
  // Lists every action. Unlocked ones show charges/tier/key + a bind button; not-yet-
  // learned ones are greyed out (no button). "use" is triggered from the inventory, so
  // it shows "click" instead of a key/bind.
  renderActions() {
    const host = document.getElementById("action-list");
    host.innerHTML = "";
    const table = document.createElement("table");
    table.className = "action-table";
    table.innerHTML =
      "<thead><tr><th>Action</th><th class='num'>Charges</th><th class='num'>Tier</th>" +
      "<th class='num'>Key</th><th></th></tr></thead>";
    const tb = document.createElement("tbody");

    for (const name of ACTION_ORDER) {
      const def = ACTIONS[name];
      if (!def) continue;
      const a = state.getAction(name);
      const tr = document.createElement("tr");

      if (!a) {
        tr.className = "locked-action";
        tr.append(td(def.label), td("—", "num"), td("—", "num"), td("—", "num"), td("", "num"));
        tb.appendChild(tr);
        continue;
      }

      if (a.charges_remaining <= 0) tr.className = "locked";
      const keyTd = document.createElement("td");
      keyTd.className = "num";
      const btnTd = document.createElement("td");
      btnTd.className = "num";

      if (CLICK_ACTIONS.has(name)) {
        keyTd.textContent = "click";
        keyTd.title =
          name === "use"
            ? "Use: click an item in your inventory, then another."
            : "Pick up: click a ground item you're on or next to.";
      } else {
        const key = document.createElement("span");
        key.className = "keybind";
        key.textContent = a.bound_key ? keyLabel(a.bound_key) : "—";
        keyTd.appendChild(key);
        const btn = document.createElement("button");
        btn.className = "secondary";
        btn.textContent = a.bound_key ? "rebind" : "bind";
        btn.addEventListener("click", () => bottom.bindKeyFlow(name));
        btnTd.appendChild(btn);
      }

      tr.append(td(def.label), td(a.charges_remaining, "num charges"), td(`T${a.tier}`, "num"), keyTd, btnTd);
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    host.appendChild(table);
  },

  renderInventory() {
    const host = document.getElementById("inventory-grid");
    if (!host) return;
    host.innerHTML = "";
    const items = state.inventory.filter((it) => it.quantity > 0);
    if (state.useSelection && !items.some((i) => i.item_name === state.useSelection)) state.useSelection = null;
    for (let i = 0; i < INV_SLOTS; i++) {
      const slot = document.createElement("div");
      slot.className = "inv-slot";
      const it = items[i];
      if (it) {
        slot.classList.add("filled");
        if (it.item_name === state.useSelection) slot.classList.add("sel");
        const hint = sellMode
          ? "  (click to sell)"
          : state.config.items[it.itemName]?.edible
            ? "  (click to eat)"
            : state.useSelection
              ? "  (click to use on)"
              : "  (click to use)";
        slot.title = `${it.item_name} ×${it.quantity}${hint}`;
        const itemDef = state.config.items[it.item_name];
        const isStackable = itemDef?.stackable === true;

        slot.innerHTML = `
          ${itemIcon(it.item_name)}
          ${isStackable && it.quantity > 1 ? `<span class="inv-qty">${it.quantity}</span>` : ""}
        `;
        slot.addEventListener("click", () => this.onSlotClick(it.item_name));
      } else {
        slot.addEventListener("click", () => {
          state.useSelection = null;
          this.renderInventory();
        });
      }
      host.appendChild(slot);
    }
  },

  // Click to select an item for "use"; click another item to combine them; clicking an
  // edible item (with nothing selected) eats it.
  onSlotClick(itemName) {
    if (sellMode) return bus.emit("shop:sell", { item: itemName });
    if (state.useSelection) {
      const a = state.useSelection;
      state.useSelection = null;
      if (a !== itemName) bus.emit("interact", { a, b: itemName, targetId: null });
    } else if (state.config.items[itemName]?.edible) {
      bus.emit("interact:eat", { item: itemName });
    } else {
      state.useSelection = itemName;
    }
    this.renderInventory();
  },

  async renderScores() {
    const body = document.getElementById("scores-body");
    body.innerHTML = "<p style='color:#a89e88'>Loading…</p>";
    try {
      const { leaderboard } = await api.highscores();
      body.innerHTML = "";
      const table = document.createElement("table");
      table.className = "score-table";
      const cap = document.createElement("caption");
      cap.textContent = "Total level";
      table.appendChild(cap);
      if (!leaderboard.length) {
        table.insertRow().insertCell().textContent = "No players yet.";
      } else {
        leaderboard.forEach((r, i) => {
          const tr = table.insertRow();
          tr.insertCell().textContent = `${i + 1}. ${r.display_name}`;
          const lvl = tr.insertCell();
          lvl.textContent = r.total_level;
          lvl.title = `Combat ${r.combat_level} · Survival ${r.survival_level}`;
        });
      }
      body.appendChild(table);
    } catch (e) {
      body.innerHTML = `<p style='color:#e08a7b'>Couldn't load scores (${e.message}).</p>`;
    }
  },
};

// A step is "done" if the matching action is unlocked + bound, or (for defeat2)
// if two animals have been beaten this session / the player already has attack.
function stepDone(stepId) {
  if (stepId.startsWith("lj_")) return ljSteps.has(stepId) || state.questsDone.includes("lumberjack");
  if (stepId === "defeat2") return sessionWins >= 2 || !!state.getAction("attack");
  const a = state.getAction(stepId);
  return !!(a && a.bound_key);
}
function progress(q) {
  const done = q.steps.filter((s) => stepDone(s.id)).length;
  return { done, total: q.steps.length };
}
function activeQuest() {
  return QUESTS.find((q) => progress(q).done < q.steps.length) || null;
}
