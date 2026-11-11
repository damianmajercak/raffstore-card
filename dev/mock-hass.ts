import type { HassEntity, HomeAssistant } from "../src/types";

/**
 * Simulated covers for local development. A cover behaves like an exterior venetian
 * blind: before moving down the slats close, before moving up they open, and a tilt
 * command received during a move is queued until the move ends (the behaviour the
 * ESPHome side is expected to implement).
 */

interface SimCover {
  id: string;
  name: string;
  features: number;
  pos: number;
  tilt: number;
  tpos: number;
  ttilt: number;
  queuedTilt?: number;
  phase: "idle" | "pre" | "move" | "tilt";
  available: boolean;
}

const FULL_TRAVEL_S = 10;
const FULL_TILT_S = 1.5;
const TICK_MS = 100;

export type Logger = (line: string) => void;

export class MockHass {
  private covers = new Map<string, SimCover>();
  private switches = new Map<string, { name: string; on: boolean }>();
  private listeners: Array<(hass: HomeAssistant) => void> = [];
  language = "sk";

  constructor(private log: Logger) {
    window.setInterval(() => this.step(), TICK_MS);
  }

  addCover(id: string, name: string, features: number, pos = 100, tilt = 100): void {
    this.covers.set(id, { id, name, features, pos, tilt, tpos: pos, ttilt: tilt, phase: "idle", available: true });
  }

  addSwitch(id: string, name: string, on = false): void {
    this.switches.set(id, { name, on });
  }

  setAvailable(id: string, available: boolean): void {
    const c = this.covers.get(id);
    if (c) c.available = available;
    this.emit();
  }

  subscribe(fn: (hass: HomeAssistant) => void): void {
    this.listeners.push(fn);
    fn(this.snapshot());
  }

  emit(): void {
    const h = this.snapshot();
    this.listeners.forEach((fn) => fn(h));
  }

  private coverState(c: SimCover): HassEntity {
    let state: string;
    if (!c.available) state = "unavailable";
    else if (c.phase === "pre" || c.phase === "move") state = c.tpos > c.pos ? "opening" : "closing";
    else state = c.pos <= 0 ? "closed" : "open";
    const attributes: Record<string, unknown> = {
      friendly_name: c.name,
      supported_features: c.features,
      current_position: Math.round(c.pos),
    };
    if (c.features & 128) attributes.current_tilt_position = Math.round(c.tilt);
    return { entity_id: c.id, state, attributes };
  }

  snapshot(): HomeAssistant {
    const states: Record<string, HassEntity> = {};
    this.covers.forEach((c) => (states[c.id] = this.coverState(c)));
    this.switches.forEach((s, id) => {
      states[id] = { entity_id: id, state: s.on ? "on" : "off", attributes: { friendly_name: s.name } };
    });
    return {
      states,
      language: this.language,
      locale: { language: this.language },
      callService: (domain, service, data) => this.callService(domain, service, data ?? {}),
    };
  }

  private ids(data: Record<string, unknown>): string[] {
    const e = data.entity_id;
    return Array.isArray(e) ? (e as string[]) : e ? [e as string] : [];
  }

  async callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
    const { entity_id, ...rest } = data;
    this.log(`${domain}.${service} ${JSON.stringify(entity_id)} ${Object.keys(rest).length ? JSON.stringify(rest) : ""}`);
    for (const id of this.ids(data)) {
      if (domain === "homeassistant") {
        const s = this.switches.get(id);
        if (s) s.on = service === "turn_on";
        continue;
      }
      const c = this.covers.get(id);
      if (!c || !c.available) continue;
      switch (service) {
        case "set_cover_position":
          this.startMove(c, Number(data.position));
          break;
        case "open_cover":
          this.startMove(c, 100);
          break;
        case "close_cover":
          this.startMove(c, 0);
          break;
        case "stop_cover":
          c.phase = "idle";
          c.tpos = c.pos;
          c.ttilt = c.tilt;
          c.queuedTilt = undefined;
          break;
        case "set_cover_tilt_position": {
          const t = Number(data.tilt_position);
          if (c.phase === "pre" || c.phase === "move") c.queuedTilt = t;
          else {
            c.ttilt = t;
            c.phase = "tilt";
          }
          break;
        }
      }
    }
    this.emit();
  }

  private startMove(c: SimCover, tpos: number): void {
    c.tpos = Math.max(0, Math.min(100, tpos));
    c.queuedTilt = undefined;
    if (Math.abs(c.tpos - c.pos) < 0.5) return;
    c.phase = c.features & 128 ? "pre" : "move";
  }

  private step(): void {
    let changed = false;
    const dPos = (100 / FULL_TRAVEL_S) * (TICK_MS / 1000);
    const dTilt = (100 / FULL_TILT_S) * (TICK_MS / 1000);
    const toward = (v: number, goal: number, d: number) => (Math.abs(goal - v) <= d ? goal : v + Math.sign(goal - v) * d);
    this.covers.forEach((c) => {
      if (c.phase === "idle") return;
      changed = true;
      if (c.phase === "pre") {
        const goal = c.tpos < c.pos ? 0 : 100;
        c.tilt = toward(c.tilt, goal, dTilt);
        if (c.tilt === goal) c.phase = "move";
      } else if (c.phase === "move") {
        c.pos = toward(c.pos, c.tpos, dPos);
        if (c.pos === c.tpos) {
          if (c.queuedTilt !== undefined && c.pos < 100) {
            c.ttilt = c.queuedTilt;
            c.queuedTilt = undefined;
            c.phase = "tilt";
          } else {
            c.queuedTilt = undefined;
            c.phase = "idle";
          }
        }
      } else if (c.phase === "tilt") {
        c.tilt = toward(c.tilt, c.ttilt, dTilt);
        if (c.tilt === c.ttilt) c.phase = "idle";
      }
    });
    if (changed) this.emit();
  }
}
