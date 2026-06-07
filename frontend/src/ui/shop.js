// Centred shop window: shows the shop's stock + prices and lets the player buy with
// coins. (Selling stays in the right-hand Inventory tab.) Closing the window also ends
// the selling session (it emits shop:close, which rightPanel listens to).
import { bus, state } from "../core.js";
import { itemIcon } from "../data/items.js";

export const shop = {
  init() {
    document.getElementById("shop-close").addEventListener("click", () => bus.emit("shop:close"));
    bus.on("shop:open", () => this.open());
    bus.on("shop:close", () => this.close());
    bus.on("state:changed", () => {
      if (this.isOpen()) this.render(); // keep coins / affordability fresh after a buy/sell
    });
  },

  isOpen() {
    return !document.getElementById("shop-window").classList.contains("hidden");
  },

  open() {
    this.render();
    document.getElementById("shop-window").classList.remove("hidden");
  },

  close() {
    document.getElementById("shop-window").classList.add("hidden");
  },

  render() {
    const coins = state.inventory.find(i => i.item_name === "coins")?.quantity || 0;
    document.getElementById("shop-coins").textContent = coins;

    const shop = state.config?.shops?.shopkeeper;
    if (!shop) return;

    const host = document.getElementById("shop-stock");
    host.innerHTML = "";

    for (const itemName of shop.stock) {
      const item = state.config.items[itemName];
      const cost = Math.round(item.price * shop.buyMultiplier);

      const el = document.createElement("div");
      const afford = coins >= cost;

      el.className = "shop-item" + (afford ? "" : " cant");

      el.innerHTML = `
        ${itemIcon(itemName)}
        <span>${item.name}</span>
        <span>${cost} coin${cost === 1 ? "" : "s"}</span>
      `;

      el.title = afford
        ? `Buy ${item.name} for ${cost}`
        : "Not enough coins";

      el.addEventListener("click", () =>
        bus.emit("shop:buy", { item: itemName })
      );

      host.appendChild(el);
    }
  },
};
