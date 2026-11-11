import { LitElement, html, nothing, type PropertyValues } from "lit";
import {
  DIAL_H,
  DIAL_W,
  WIN_H,
  WIN_W,
  dialAngleAt,
  loweredFromY,
  renderDial,
  renderWindow,
} from "./drawing";
import { localize, type StringKey } from "./localize";
import { cardStyles } from "./styles";
import type {
  EntityConfig,
  HassEntity,
  HomeAssistant,
  PresetConfig,
  RaffstoreCardConfig,
  Target,
} from "./types";
import {
  DEFAULT_CLOSED_ANGLE,
  DEFAULT_OPEN_ANGLE,
  FEATURE_SET_TILT_POSITION,
  FEATURE_STOP,
  angleToTilt,
  clamp,
  currentPosition,
  currentTilt,
  isMoving,
  isUnavailable,
  loweredToPosition,
  normalizeEntities,
  positionToLowered,
  presetTarget,
  round,
  supports,
  targetReached,
  tiltToAngle,
  validateConfig,
} from "./utils";

declare const __CARD_VERSION__: string;
const CARD_VERSION = typeof __CARD_VERSION__ === "string" ? __CARD_VERSION__ : "dev";

let uidCounter = 0;

const MDI_UP = "M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z";
const MDI_DOWN = "M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z";
const MDI_STOP = "M18,18H6V6H18V18Z";

interface PendingTilt {
  ids: string[];
  position: number;
  tilt: number;
  since: number;
}

export class RaffstoreCard extends LitElement {
  static styles = cardStyles;

  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _selected: { state: true },
    _target: { state: true },
    _dragging: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _config?: RaffstoreCardConfig;
  declare _selected: number;
  declare _target?: Target;
  declare _dragging: boolean;

  private _entities: EntityConfig[] = [];
  private _sendTimer?: number;
  private _ticker?: number;
  private _pendingTilt?: PendingTilt;
  private _sentAt = 0;
  private _dialDrag = false;
  private _uid = `${++uidCounter}`;

  constructor() {
    super();
    this._selected = 0;
    this._dragging = false;
  }

  /* ---------- Home Assistant card API ---------- */

  public setConfig(config: RaffstoreCardConfig): void {
    validateConfig(config);
    this._config = { ...config };
    const before = this._entities.length;
    this._entities = normalizeEntities(config);
    if (this._entities.length <= 1) {
      this._selected = 0;
    } else if (before !== this._entities.length || this._selected >= this._entities.length) {
      this._selected = -1;
    }
  }

  public getCardSize(): number {
    return 8;
  }

  public getGridOptions() {
    return { columns: 6, min_columns: 4 };
  }

  public static getStubConfig(hass: HomeAssistant): Partial<RaffstoreCardConfig> {
    const covers = Object.values(hass?.states ?? {}).filter((s) => s.entity_id.startsWith("cover."));
    const withTilt = covers.find((s) => supports(s, FEATURE_SET_TILT_POSITION));
    const pick = withTilt ?? covers[0];
    return { entities: [pick ? pick.entity_id : "cover.example"] };
  }

  public static getConfigForm() {
    const lang = navigator.language;
    const t = (k: StringKey) => localize(lang, k);
    const labels: Record<string, string> = {
      entities: t("editor_entities"),
      name: t("editor_name"),
      lock_entity: t("editor_lock"),
      tilt_mode: t("editor_tilt_mode"),
      slat_profile: t("editor_profile"),
      tilt_closed_angle: t("editor_closed_angle"),
      tilt_open_angle: t("editor_open_angle"),
      debounce: t("editor_debounce"),
    };
    return {
      schema: [
        {
          name: "entities",
          required: true,
          selector: { entity: { multiple: true, filter: { domain: "cover" } } },
        },
        { name: "name", selector: { text: {} } },
        {
          name: "lock_entity",
          selector: { entity: { filter: { domain: ["switch", "input_boolean"] } } },
        },
        {
          name: "tilt_mode",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "after_move", label: t("editor_after_move") },
                { value: "immediate", label: t("editor_immediate") },
              ],
            },
          },
        },
        {
          name: "slat_profile",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "z", label: t("editor_profile_z") },
                { value: "c", label: t("editor_profile_c") },
                { value: "flat", label: t("editor_profile_flat") },
              ],
            },
          },
        },
        {
          type: "grid",
          name: "",
          schema: [
            {
              name: "tilt_closed_angle",
              selector: { number: { min: -180, max: 180, step: 1, mode: "box", unit_of_measurement: "°" } },
            },
            {
              name: "tilt_open_angle",
              selector: { number: { min: -180, max: 180, step: 1, mode: "box", unit_of_measurement: "°" } },
            },
          ],
        },
        {
          name: "debounce",
          selector: { number: { min: 0, max: 5000, step: 100, mode: "box", unit_of_measurement: "ms" } },
        },
      ],
      computeLabel: (s: { name: string }) => labels[s.name] ?? s.name,
      assertConfig: (config: RaffstoreCardConfig) => {
        if (config.entity || (config.entities ?? []).some((e) => typeof e !== "string")) {
          throw new Error("Per-entity names are only editable in YAML");
        }
      },
    };
  }

  /* ---------- lifecycle ---------- */

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._sendTimer);
    window.clearInterval(this._ticker);
    this._sendTimer = undefined;
    this._ticker = undefined;
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("hass")) this._tick();
  }

  /* ---------- helpers ---------- */

  private _t(key: StringKey): string {
    return localize(this.hass?.locale?.language ?? this.hass?.language, key);
  }

  private get _closedAngle(): number {
    return this._config?.tilt_closed_angle ?? DEFAULT_CLOSED_ANGLE;
  }

  private get _openAngle(): number {
    return this._config?.tilt_open_angle ?? DEFAULT_OPEN_ANGLE;
  }

  private _ids(): string[] {
    if (this._selected < 0 || this._selected >= this._entities.length) {
      return this._entities.map((e) => e.entity);
    }
    return [this._entities[this._selected].entity];
  }

  private _state(id: string): HassEntity | undefined {
    return this.hass?.states[id];
  }

  private _primary(): HassEntity | undefined {
    return this._state(this._ids()[0]);
  }

  private _entityName(e: EntityConfig): string {
    return e.name ?? this._state(e.entity)?.attributes.friendly_name ?? e.entity;
  }

  private _call(domain: string, service: string, data: Record<string, unknown>): Promise<unknown> {
    if (!this.hass) return Promise.resolve();
    return this.hass.callService(domain, service, data).catch((err: unknown) => {
      console.error("raffstore-card:", domain, service, err);
      this._target = undefined;
      this._pendingTilt = undefined;
    });
  }

  /* ---------- automation lock ---------- */

  private _locked(): boolean | undefined {
    const id = this._config?.lock_entity;
    if (!id) return undefined;
    return this._state(id)?.state === "on";
  }

  private _pauseAutomation(): void {
    const id = this._config?.lock_entity;
    if (id && this._locked() === false) {
      this._call("homeassistant", "turn_on", { entity_id: id });
    }
  }

  private _toggleLock(): void {
    const id = this._config?.lock_entity;
    if (!id) return;
    this._call("homeassistant", this._locked() ? "turn_off" : "turn_on", { entity_id: id });
  }

  /* ---------- sending ---------- */

  private _schedule(): void {
    window.clearTimeout(this._sendTimer);
    this._sendTimer = window.setTimeout(() => {
      this._sendTimer = undefined;
      this._send();
    }, this._config?.debounce ?? 800);
  }

  private async _send(): Promise<void> {
    const target = this._target;
    if (!target || !this._config) return;
    const ids = this._ids();
    const entities = ids.map((id) => this._state(id));
    this._pauseAutomation();
    this._sentAt = Date.now();

    if (this._config.service) {
      const [domain, service] = this._config.service.split(".");
      await this._call(domain, service, {
        entity_id: ids,
        position: round(target.position),
        tilt_position: round(target.tilt),
      });
      this._ensureTicker();
      return;
    }

    const toMove = ids.filter((_, i) => Math.abs(currentPosition(entities[i]) - target.position) >= 1);
    const tiltIds = ids.filter((_, i) => supports(entities[i], FEATURE_SET_TILT_POSITION));
    const wantTilt = target.position < 100 && tiltIds.length > 0;

    if (!toMove.length && !wantTilt) {
      this._target = undefined;
      return;
    }
    if (toMove.length) {
      await this._call("cover", "set_cover_position", {
        entity_id: toMove,
        position: round(target.position),
      });
    }
    if (wantTilt) {
      const mode = this._config.tilt_mode ?? "after_move";
      if (toMove.length && mode === "after_move") {
        this._pendingTilt = {
          ids: tiltIds,
          position: target.position,
          tilt: target.tilt,
          since: Date.now(),
        };
      } else {
        await this._call("cover", "set_cover_tilt_position", {
          entity_id: tiltIds,
          tilt_position: round(target.tilt),
        });
      }
    }
    this._ensureTicker();
  }

  private _ensureTicker(): void {
    if (this._ticker) return;
    this._ticker = window.setInterval(() => this._tick(), 1000);
  }

  /** Resolves a pending tilt and clears the target once the blind has settled. */
  private _tick(): void {
    const now = Date.now();
    const pending = this._pendingTilt;
    if (pending) {
      const ents = pending.ids.map((id) => this._state(id));
      if (now - pending.since > 300_000) {
        this._pendingTilt = undefined;
      } else if (!ents.some(isMoving)) {
        const reached = ents.every((e) => Math.abs(currentPosition(e) - pending.position) <= 1);
        if (reached || now - pending.since > 5000) {
          this._pendingTilt = undefined;
          this._sentAt = now;
          this._call("cover", "set_cover_tilt_position", {
            entity_id: pending.ids,
            tilt_position: round(pending.tilt),
          });
        }
      }
    }

    const target = this._target;
    if (target && !this._dragging && !this._sendTimer && !this._pendingTilt) {
      const ents = this._ids().map((id) => this._state(id));
      const settled = !ents.some(isMoving);
      if (settled && ents.every((e) => targetReached(e, target))) {
        this._target = undefined;
      } else if (settled && this._sentAt && now - this._sentAt > 4000) {
        this._target = undefined;
      } else if (this._sentAt && now - this._sentAt > 300_000) {
        this._target = undefined;
      }
    }

    if (!this._target && !this._pendingTilt && this._ticker) {
      window.clearInterval(this._ticker);
      this._ticker = undefined;
    }
  }

  /* ---------- user actions ---------- */

  private _setTarget(target: Target, sendNow = false): void {
    this._target = { position: clamp(target.position, 0, 100), tilt: clamp(target.tilt, 0, 100) };
    this._pendingTilt = undefined;
    if (sendNow) {
      window.clearTimeout(this._sendTimer);
      this._sendTimer = undefined;
      this._send();
    } else {
      this._schedule();
    }
  }

  private _baseTarget(): Target {
    const st = this._primary();
    return this._target ?? { position: currentPosition(st), tilt: currentTilt(st) };
  }

  private _command(service: "open_cover" | "close_cover" | "stop_cover"): void {
    window.clearTimeout(this._sendTimer);
    this._sendTimer = undefined;
    this._target = undefined;
    this._pendingTilt = undefined;
    if (service !== "stop_cover") this._pauseAutomation();
    this._call("cover", service, { entity_id: this._ids() });
  }

  private _applyPreset(p: PresetConfig): void {
    this._setTarget(presetTarget(p, this._closedAngle, this._openAngle), true);
  }

  private _svgPoint(ev: PointerEvent, el: Element, w: number, h: number): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) * w) / (r.width || 1),
      y: ((ev.clientY - r.top) * h) / (r.height || 1),
    };
  }

  private _winDown(ev: PointerEvent): void {
    if (isUnavailable(this._primary())) return;
    const el = ev.currentTarget as Element;
    el.setPointerCapture?.(ev.pointerId);
    window.clearTimeout(this._sendTimer);
    this._sendTimer = undefined;
    this._dragging = true;
    const base = this._baseTarget();
    const { y } = this._svgPoint(ev, el, WIN_W, WIN_H);
    this._target = { position: loweredToPosition(loweredFromY(y)), tilt: base.tilt };
  }

  private _winMove(ev: PointerEvent): void {
    if (!this._dragging || this._dialDrag || !this._target) return;
    const { y } = this._svgPoint(ev, ev.currentTarget as Element, WIN_W, WIN_H);
    this._target = { ...this._target, position: loweredToPosition(loweredFromY(y)) };
  }

  private _dialSet(ev: PointerEvent): void {
    const { x, y } = this._svgPoint(ev, ev.currentTarget as Element, DIAL_W, DIAL_H);
    const raw = dialAngleAt(x, y);
    if (raw === undefined || !this._target) return;
    const closed = this._closedAngle;
    const open = this._openAngle;
    const angle = clamp(raw, Math.min(closed, open), Math.max(closed, open));
    this._target = { ...this._target, tilt: angleToTilt(angle, closed, open) };
  }

  private _dialDown(ev: PointerEvent): void {
    const st = this._primary();
    if (isUnavailable(st) || !supports(st, FEATURE_SET_TILT_POSITION)) return;
    const el = ev.currentTarget as Element;
    el.setPointerCapture?.(ev.pointerId);
    window.clearTimeout(this._sendTimer);
    this._sendTimer = undefined;
    this._dragging = true;
    this._dialDrag = true;
    this._target = this._baseTarget();
    this._dialSet(ev);
  }

  private _dialMove(ev: PointerEvent): void {
    if (!this._dialDrag) return;
    this._dialSet(ev);
  }

  private _up(): void {
    if (!this._dragging) return;
    this._dragging = false;
    this._dialDrag = false;
    if (this._target) this._setTarget(this._target);
  }

  private _winKey(ev: KeyboardEvent): void {
    const steps: Record<string, number> = { ArrowDown: 5, ArrowUp: -5, PageDown: 25, PageUp: -25 };
    const base = this._baseTarget();
    let lowered = positionToLowered(base.position);
    if (ev.key in steps) lowered += steps[ev.key];
    else if (ev.key === "Home") lowered = 0;
    else if (ev.key === "End") lowered = 100;
    else return;
    ev.preventDefault();
    this._setTarget({ ...base, position: loweredToPosition(clamp(lowered, 0, 100)) });
  }

  private _dialKey(ev: KeyboardEvent): void {
    if (!supports(this._primary(), FEATURE_SET_TILT_POSITION)) return;
    const closed = this._closedAngle;
    const open = this._openAngle;
    const toClosed = closed >= open ? 1 : -1;
    const base = this._baseTarget();
    let angle = tiltToAngle(base.tilt, closed, open);
    if (ev.key === "ArrowDown" || ev.key === "ArrowRight") angle += 5 * toClosed;
    else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") angle -= 5 * toClosed;
    else if (ev.key === "Home") angle = open;
    else if (ev.key === "End") angle = closed;
    else return;
    ev.preventDefault();
    angle = clamp(angle, Math.min(closed, open), Math.max(closed, open));
    this._setTarget({ ...base, tilt: angleToTilt(angle, closed, open) });
  }

  /* ---------- rendering ---------- */

  private _presets(hasTilt: boolean): PresetConfig[] {
    if (this._config?.presets === false) return [];
    if (Array.isArray(this._config?.presets)) return this._config!.presets;
    const open = this._openAngle;
    const closed = this._closedAngle;
    if (!hasTilt) {
      return [
        { name: this._t("up"), position: 100 },
        { name: this._t("closed"), position: 0 },
      ];
    }
    return [
      { name: this._t("up"), position: 100, tilt: 100 },
      { name: this._t("view"), position: 0, angle: open },
      { name: this._t("shade"), position: 0, angle: (open + closed) / 2 },
      { name: this._t("closed"), position: 0, tilt: 0 },
    ];
  }

  private _presetActive(p: PresetConfig, st: HassEntity, hasTilt: boolean): boolean {
    if (isMoving(st) || this._target) return false;
    const t = presetTarget(p, this._closedAngle, this._openAngle);
    if (Math.abs(currentPosition(st) - t.position) > 1) return false;
    if (t.position >= 100 || !hasTilt) return true;
    return Math.abs(currentTilt(st) - t.tilt) <= 3;
  }

  private _slatWord(angle: number): string {
    const closed = this._closedAngle;
    const open = this._openAngle;
    const f = open === closed ? 1 : (angle - open) / (closed - open);
    if (f <= 0.12) return this._t("slats_open");
    if (f >= 0.88) return this._t("slats_closed");
    return this._t("slats_tilted");
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;
    const st = this._primary();
    if (!st) {
      return html`<ha-card><div class="warning">${this._t("not_found")}: ${this._ids()[0]}</div></ha-card>`;
    }

    const unavailable = isUnavailable(st);
    const hasTilt = supports(st, FEATURE_SET_TILT_POSITION);
    const closed = this._closedAngle;
    const open = this._openAngle;
    const pos = currentPosition(st);
    const tilt = currentTilt(st);
    const target = this._target;
    const lowered = positionToLowered(pos);
    const angle = tiltToAngle(tilt, closed, open);
    const tLowered = target ? positionToLowered(target.position) : undefined;
    const tAngle = target ? tiltToAngle(target.tilt, closed, open) : undefined;
    const posPending = tLowered !== undefined && Math.abs(tLowered - lowered) > 0.5;
    const anglePending = hasTilt && tAngle !== undefined && Math.abs(tAngle - angle) > 1;
    const shownLowered = posPending ? tLowered! : lowered;
    const shownAngle = anglePending ? tAngle! : angle;

    const locked = this._locked();
    const stateText = unavailable
      ? this._t("unavailable")
      : st.state === "opening"
        ? this._t("opening")
        : st.state === "closing"
          ? this._t("closing")
          : this._t("stopped");

    const name =
      this._config.name ??
      this._entityName(this._entities[Math.max(0, this._selected)] ?? this._entities[0]);
    const canStop = supports(st, FEATURE_STOP);
    const moving = isMoving(st);

    return html`
      <ha-card>
        <div class="header">
          <div class="titles">
            <div class="title">${name}</div>
            <div class="state ${moving ? "moving" : ""}">${stateText}</div>
          </div>
          ${locked !== undefined
            ? html`<button
                class="pill ${locked ? "manual" : "auto"}"
                title=${locked ? this._t("auto_paused") : this._t("automation")}
                @click=${this._toggleLock}
              >
                <span class="dot"></span>${locked ? this._t("manual") : this._t("auto")}
              </button>`
            : nothing}
        </div>

        ${this._entities.length > 1
          ? html`<div class="tabs" role="tablist">
              ${this._entities.map(
                (e, i) => html`<button
                  class="tab ${this._selected === i ? "on" : ""}"
                  role="tab"
                  aria-selected=${this._selected === i}
                  @click=${() => this._select(i)}
                >
                  ${this._entityName(e)}
                </button>`,
              )}
              <button
                class="tab ${this._selected < 0 ? "on" : ""}"
                role="tab"
                aria-selected=${this._selected < 0}
                @click=${() => this._select(-1)}
              >
                ${this._t("all")}
              </button>
            </div>`
          : nothing}

        <div class="visual">
          <div class="col">
            <svg
              class="ctl win ${unavailable ? "disabled" : ""}"
              viewBox="0 0 ${WIN_W} ${WIN_H}"
              role="slider"
              tabindex="0"
              aria-label=${this._t("height_label")}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow=${round(shownLowered)}
              aria-valuetext="${round(shownLowered)} %"
              @pointerdown=${this._winDown}
              @pointermove=${this._winMove}
              @pointerup=${this._up}
              @pointercancel=${this._up}
              @keydown=${this._winKey}
            >
              ${renderWindow({
                lowered,
                angle,
                hasTilt,
                targetLowered: tLowered,
                uid: this._uid,
              })}
            </svg>
            <div class="readout">
              <span class="value ${posPending ? "pending" : ""}">${round(shownLowered)}<small>%</small></span>
              <span class="label">${this._t("lowered")}</span>
            </div>
            <div class="now">${posPending ? `${this._t("now")} ${round(lowered)} %` : ""}</div>
          </div>
          <div class="col">
            <svg
              class="ctl dial ${unavailable || !hasTilt ? "disabled" : ""}"
              viewBox="0 0 ${DIAL_W} ${DIAL_H}"
              role="slider"
              tabindex=${hasTilt ? "0" : "-1"}
              aria-label=${this._t("angle_label")}
              aria-valuemin=${Math.min(closed, open)}
              aria-valuemax=${Math.max(closed, open)}
              aria-valuenow=${round(shownAngle)}
              aria-valuetext="${this._slatWord(shownAngle)} ${round(shownAngle)}°"
              @pointerdown=${this._dialDown}
              @pointermove=${this._dialMove}
              @pointerup=${this._up}
              @pointercancel=${this._up}
              @keydown=${this._dialKey}
            >
              ${renderDial({
                angle: hasTilt ? angle : closed,
                minAngle: Math.min(closed, open),
                maxAngle: Math.max(closed, open),
                closedAngle: closed,
                targetAngle: hasTilt ? tAngle : undefined,
                enabled: hasTilt && !unavailable,
                insideLabel: this._t("inside"),
                outsideLabel: this._t("outside"),
                profile: this._config.slat_profile ?? "z",
              })}
            </svg>
            <div class="readout">
              <span class="value ${anglePending ? "pending" : ""}">${hasTilt ? round(shownAngle) : "–"}<small>${hasTilt ? "°" : ""}</small></span>
              <span class="label">${hasTilt ? this._slatWord(shownAngle) : this._t("slats")}</span>
            </div>
            <div class="now">${anglePending ? `${this._t("now")} ${round(angle)}°` : ""}</div>
          </div>
        </div>

        ${this._renderPresets(st, hasTilt, unavailable)}

        <div class="controls">
          <button aria-label=${this._t("raise")} title=${this._t("raise")} ?disabled=${unavailable}
            @click=${() => this._command("open_cover")}>
            <svg viewBox="0 0 24 24"><path d=${MDI_UP}></path></svg>
          </button>
          <button aria-label=${this._t("stop")} title=${this._t("stop")} ?disabled=${unavailable || !canStop}
            @click=${() => this._command("stop_cover")}>
            <svg viewBox="0 0 24 24"><path d=${MDI_STOP}></path></svg>
          </button>
          <button aria-label=${this._t("lower")} title=${this._t("lower")} ?disabled=${unavailable}
            @click=${() => this._command("close_cover")}>
            <svg viewBox="0 0 24 24"><path d=${MDI_DOWN}></path></svg>
          </button>
        </div>

        ${!hasTilt && !unavailable ? html`<div class="note">${this._t("no_tilt")}</div>` : nothing}
      </ha-card>
    `;
  }

  private _renderPresets(st: HassEntity, hasTilt: boolean, unavailable: boolean) {
    const presets = this._presets(hasTilt);
    if (!presets.length) return nothing;
    return html`<div class="presets" style="--rc-n: ${presets.length}">
      ${presets.map((p) => {
        const active = !unavailable && this._presetActive(p, st, hasTilt);
        return html`<button
          class=${active ? "on" : ""}
          aria-pressed=${active}
          ?disabled=${unavailable}
          @click=${() => this._applyPreset(p)}
        >
          ${p.icon ? html`<ha-icon .icon=${p.icon}></ha-icon>` : nothing}${p.name}
        </button>`;
      })}
    </div>`;
  }

  private _select(i: number): void {
    window.clearTimeout(this._sendTimer);
    this._sendTimer = undefined;
    this._target = undefined;
    this._pendingTilt = undefined;
    this._selected = i;
  }
}

if (!customElements.get("raffstore-card")) {
  customElements.define("raffstore-card", RaffstoreCard);
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "raffstore-card")) {
  window.customCards.push({
    type: "raffstore-card",
    name: "Raffstore Card",
    description: "Exterior venetian blinds – set height and slat angle visually.",
    preview: true,
    documentationURL: "https://github.com/damianmajercak/raffstore-card",
  });
}

console.info(`%c RAFFSTORE-CARD %c v${CARD_VERSION} `, "color:#fff;background:#555;padding:2px 4px", "color:#555;background:#eee;padding:2px 4px");
