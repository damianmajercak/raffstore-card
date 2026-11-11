import "../src/raffstore-card";
import type { RaffstoreCard } from "../src/raffstore-card";
import type { RaffstoreCardConfig } from "../src/types";
import { MockHass } from "./mock-hass";

/* Minimal stand-in for Home Assistant's <ha-card>. */
class HaCard extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;background:var(--card-background-color);
      border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);color:var(--primary-text-color)}</style><slot></slot>`;
  }
}
customElements.define("ha-card", HaCard);

const logEl = document.getElementById("log")!;
const log = (line: string) => {
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `${time}  ${line}\n` + logEl.textContent;
};

const hass = new MockHass(log);
const ALL = 255;
const NO_TILT = 1 | 2 | 4 | 8;
hass.addCover("cover.hst_left", "HST ľavá", ALL, 100, 100);
hass.addCover("cover.hst_right", "HST pravá", ALL, 60, 40);
hass.addCover("cover.bedroom", "Spálňa", ALL, 0, 50);
hass.addCover("cover.garage", "Roleta technická", NO_TILT, 100);
hass.addSwitch("switch.shadow_control_lock", "Shadow Control – zámok", false);

const configs: RaffstoreCardConfig[] = [
  {
    type: "custom:raffstore-card",
    name: "Obývačka – HST portál",
    entities: [
      { entity: "cover.hst_left", name: "Ľavá" },
      { entity: "cover.hst_right", name: "Pravá" },
    ],
    lock_entity: "switch.shadow_control_lock",
    tilt_mode: "after_move",
  },
  { type: "custom:raffstore-card", entity: "cover.bedroom", tilt_mode: "immediate" },
  { type: "custom:raffstore-card", entity: "cover.garage" },
];

const grid = document.getElementById("cards")!;
const cards: RaffstoreCard[] = configs.map((cfg) => {
  const wrap = document.createElement("div");
  const label = document.createElement("pre");
  label.className = "cfg";
  label.textContent = JSON.stringify(cfg, null, 1).replace(/[{}"]/g, "").trim();
  const card = document.createElement("raffstore-card") as RaffstoreCard;
  card.setConfig(cfg);
  wrap.append(card, label);
  grid.append(wrap);
  return card;
});

hass.subscribe((h) => cards.forEach((c) => (c.hass = h)));

document.getElementById("lang")!.addEventListener("change", (e) => {
  hass.language = (e.target as HTMLSelectElement).value;
  hass.emit();
});
document.getElementById("theme")!.addEventListener("change", (e) => {
  document.documentElement.dataset.theme = (e.target as HTMLSelectElement).value;
});
document.getElementById("unavail")!.addEventListener("change", (e) => {
  hass.setAvailable("cover.bedroom", !(e.target as HTMLInputElement).checked);
});
