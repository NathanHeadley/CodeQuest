// Controls the bottom context panel: NPC dialogue OR the code editor.
import { bus, state } from "../core.js";
import { api } from "../net.js";
import { ACTIONS, scaffoldFor } from "../data/actions.js";

let els = {};
let currentAction = null;

export function keyLabel(key) {
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

export const bottom = {
  init() {
    els = {
      dialogue: document.getElementById("dialogue-mode"),
      code: document.getElementById("code-mode"),
      speaker: document.getElementById("speaker"),
      text: document.getElementById("dialogue-text"),
      actions: document.getElementById("dialogue-actions"),
      codeTitle: document.getElementById("code-title"),
      codeTier: document.getElementById("code-tier"),
      codePrompt: document.getElementById("code-prompt"),
      input: document.getElementById("code-input"),
      feedback: document.getElementById("code-feedback"),
      run: document.getElementById("code-run"),
    };
    els.run.addEventListener("click", () => this.runCode());
    // Ctrl+Enter runs the code too.
    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.runCode();
      }
    });
  },

  showDialogue(speaker, text, actions = []) {
    els.code.classList.add("hidden");
    els.dialogue.classList.remove("hidden");
    bus.emit("ui:codeClose");
    els.speaker.textContent = speaker || "";
    els.text.textContent = text || "";
    els.actions.innerHTML = "";
    for (const a of actions) {
      const btn = document.createElement("button");
      btn.textContent = a.label;
      if (a.secondary) btn.className = "secondary";
      btn.addEventListener("click", a.onClick);
      els.actions.appendChild(btn);
    }
  },

  openCode(actionName, promptOverride) {
    currentAction = actionName;
    const prog = state.getAction(actionName);
    const tier = prog ? prog.tier : 1;
    const sc = scaffoldFor(actionName, tier);

    els.dialogue.classList.add("hidden");
    els.code.classList.remove("hidden");
    bus.emit("ui:codeOpen");

    els.codeTitle.textContent = `Code: ${sc.label}`;
    els.codeTier.textContent = `Tier ${sc.tier}`;
    els.codePrompt.textContent = promptOverride || sc.hint;
    els.input.value = sc.starter;
    this.setFeedback("", "");
    els.input.focus();
    // Put the caret where the first blank is, if any.
    const blank = sc.starter.indexOf("_");
    if (blank >= 0) els.input.setSelectionRange(blank, els.input.value.length);
  },

  async runCode() {
    const code = els.input.value;
    this.setFeedback("Checking…", "");
    els.run.disabled = true;
    try {
      const res = await api.validateCode(currentAction, code);
      if (res.valid) {
        state.upsertAction(res.progress);
        if (res.coding) {
          const prev = state.skills.coding.level;
          state.skills.coding = { xp: res.coding.xp, level: res.coding.level };
          bus.emit("state:changed");
          if (res.coding.leveledUp) {
            bus.emit("toast", `💻 Coding level up — now level ${res.coding.level}!`);
          }
        }
        this.setFeedback(res.feedback || "Correct!", "good");
        const done = currentAction;
        setTimeout(() => {
          // Always leave the editor so the player is never trapped. Tutorial / other
          // listeners may immediately replace this dialogue with their own next step.
          const def = ACTIONS[done];
          const prog = state.getAction(done);
          this.showDialogue(
            "",
            `✅ ${def ? def.label : done} coded!` +
              (prog ? ` ${prog.charges_remaining} charges ready — press your key to use it.` : ""),
            [],
          );
          bus.emit("code:success", done);
        }, 600);
      } else {
        this.setFeedback(res.feedback || "Not quite — try again.", "bad");
      }
    } catch (e) {
      this.setFeedback(`Error: ${e.message}`, "bad");
    } finally {
      els.run.disabled = false;
    }
  },

  setFeedback(text, kind) {
    els.feedback.textContent = text;
    els.feedback.className = kind || "";
  },

  // Capture one keypress and bind it to an action.
  bindKeyFlow(actionName, after) {
    const a = ACTIONS[actionName];
    bus.emit("ui:codeOpen"); // lock world input during capture
    this.showDialogue(
      "Keybinding",
      `Press the key you want to use for "${a.label}" now — for example an arrow key or a letter.`,
      [],
    );
    const handler = async (ev) => {
      ev.preventDefault();
      window.removeEventListener("keydown", handler, true);
      try {
        await api.bindKey(actionName, ev.key);
        // A key maps to one action: clear it from any other action that had it.
        const k = ev.key.toLowerCase();
        for (const [n, a] of state.actions) {
          if (n !== actionName && a.bound_key && a.bound_key.toLowerCase() === k) a.bound_key = null;
        }
        const prog = state.getAction(actionName);
        if (prog) {
          prog.bound_key = ev.key;
          state.upsertAction(prog);
        }
        bus.emit("ui:codeClose");
        this.showDialogue(
          "Keybinding",
          `Bound "${a.label}" to [${keyLabel(ev.key)}]. Press that key to use it!`,
          [
            {
              label: "Continue",
              onClick: () =>
                after
                  ? after()
                  : this.showDialogue("", "Explore the town! Press your bound keys to act.", []),
            },
          ],
        );
        // Announce the bind so the tutorial (or anything else) can react, no matter
        // whether the player bound via the tutorial or the right-hand panel button.
        bus.emit("key:bound", { action_name: actionName, key: ev.key });
      } catch (e) {
        bus.emit("ui:codeClose");
        this.showDialogue("Keybinding", `Couldn't bind that key (${e.message}).`, [
          { label: "Retry", onClick: () => this.bindKeyFlow(actionName, after) },
        ]);
      }
    };
    window.addEventListener("keydown", handler, true);
  },
};
