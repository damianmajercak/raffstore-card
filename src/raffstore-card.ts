import { LitElement, html, svg, nothing, type PropertyValues, type TemplateResult } from "lit";
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

/* Window drawing geometry (SVG user units). */
const WIN_W = 220;
const WIN_H = 280;
const SLAT_TOP = 36;
const SLAT_SPAN = 232;
const SLAT_PITCH = 12;
const PROF_W = 120;

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
  private _profileDrag?: { y: number; angle: number };

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

  private _svgY(ev: PointerEvent, el: Element, height: number): number {
    const r = el.getBoundingClientRect();
    return ((ev.clientY - r.top) * height) / (r.height || 1);
  }

  private _loweredFromY(y: number): number {
    return clamp(((y - SLAT_TOP) / SLAT_SPAN) * 100, 0, 100);
  }

  private _winDown(ev: PointerEvent): void {
    if (isUnavailable(this._primary())) return;
    const el = ev.currentTarget as Element;
    el.setPointerCapture?.(ev.pointerId);
    window.clearTimeout(this._sendTimer);
    this._sendTimer = undefined;
    this._dragging = true;
    const base = this._baseTarget();
    this._target = {
      position: loweredToPosition(this._loweredFromY(this._svgY(ev, el, WIN_H))),
      tilt: base.tilt,
    };
  }

  private _winMove(ev: PointerEvent): void {
    if (!this._dragging || this._profileDrag || !this._target) return;
    const y = this._svgY(ev, ev.currentTarget as Element, WIN_H);
    this._target = { ...this._target, position: loweredToPosition(this._loweredFromY(y)) };
  }

  private _profDown(ev: PointerEvent): void {
    const st = this._primary();
    if (isUnavailable(st) || !supports(st, FEATURE_SET_TILT_POSITION)) return;
    const el = ev.currentTarget as Element;
    el.setPointerCapture?.(ev.pointerId);
    window.clearTimeout(this._sendTimer);
    this._sendTimer = undefined;
    this._dragging = true;
    const base = this._baseTarget();
    this._target = base;
    this._profileDrag = {
      y: this._svgY(ev, el, WIN_H),
      angle: tiltToAngle(base.tilt, this._closedAngle, this._openAngle),
    };
  }

  private _profMove(ev: PointerEvent): void {
    if (!this._profileDrag || !this._target) return;
    const closed = this._closedAngle;
    const open = this._openAngle;
    const dir = closed >= open ? 1 : -1;
    const dy = this._svgY(ev, ev.currentTarget as Element, WIN_H) - this._profileDrag.y;
    const angle = clamp(
      this._profileDrag.angle + dy * 0.6 * dir,
      Math.min(closed, open),
      Math.max(closed, open),
    );
    this._target = { ...this._target, tilt: angleToTilt(angle, closed, open) };
  }

  private _up(): void {
    if (!this._dragging) return;
    this._dragging = false;
    this._profileDrag = undefined;
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

  private _profKey(ev: KeyboardEvent): void {
    if (!supports(this._primary(), FEATURE_SET_TILT_POSITION)) return;
    const closed = this._closedAngle;
    const open = this._openAngle;
    const dir = closed >= open ? 1 : -1;
    const base = this._baseTarget();
    let angle = tiltToAngle(base.tilt, closed, open);
    if (ev.key === "ArrowDown") angle += 5 * dir;
    else if (ev.key === "ArrowUp") angle -= 5 * dir;
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

  private _yOf(lowered: number): number {
    return SLAT_TOP + (lowered / 100) * SLAT_SPAN;
  }

  private _renderWindow(lowered: number, angle: number, targetLowered: number | undefined, hasTilt: boolean) {
    const yb = this._yOf(lowered);
    const thick = hasTilt ? 2 + 10 * Math.abs(Math.sin((angle * Math.PI) / 180)) : 6;
    const slats: TemplateResult[] = [];
    for (let y = SLAT_TOP + 2; y < yb - 4; y += SLAT_PITCH) {
      slats.push(
        svg`<rect x="12" y=${(y - thick / 2).toFixed(1)} width="196" height=${thick.toFixed(1)} style="fill:var(--rc-slat)"></rect>`,
      );
    }
    const ghost =
      targetLowered !== undefined && Math.abs(targetLowered - lowered) > 0.5
        ? svg`<line x1="10" x2="210" y1=${this._yOf(targetLowered)} y2=${this._yOf(targetLowered)}
            style="stroke:var(--rc-target)" stroke-width="2.5" stroke-dasharray="7 5"></line>`
        : nothing;
    return svg`
      <rect x="10" y="30" width="200" height="244" rx="3" style="fill:var(--rc-glass)"></rect>
      <rect x="10" y="226" width="200" height="48" style="fill:var(--rc-ground)"></rect>
      ${slats}
      <rect x="10" y=${Math.max(30, yb - 4).toFixed(1)} width="200" height="7" rx="2" style="fill:var(--rc-rail)"></rect>
      ${ghost}
      <rect x="4" y="8" width="212" height="24" rx="4" style="fill:var(--rc-box)"></rect>
      <rect x="10" y="30" width="200" height="244" rx="3" fill="none" style="stroke:var(--rc-slat)" stroke-width="2"></rect>
    `;
  }

  private _renderProfile(angle: number, targetAngle: number | undefined) {
    const line = (a: number, y: number, ghost: boolean) => {
      const r = (a * Math.PI) / 180;
      const dx = 22 * Math.cos(r);
      const dy = 22 * Math.sin(r);
      return ghost
        ? svg`<line x1=${(60 - dx).toFixed(1)} y1=${(y - dy).toFixed(1)} x2=${(60 + dx).toFixed(1)} y2=${(y + dy).toFixed(1)}
            style="stroke:var(--rc-target)" stroke-width="2" stroke-dasharray="3 3" stroke-linecap="round"></line>`
        : svg`<line x1=${(60 - dx).toFixed(1)} y1=${(y - dy).toFixed(1)} x2=${(60 + dx).toFixed(1)} y2=${(y + dy).toFixed(1)}
            style="stroke:var(--rc-rail)" stroke-width="5" stroke-linecap="round"></line>`;
    };
    const showGhost = targetAngle !== undefined && Math.abs(targetAngle - angle) > 1;
    const rows: TemplateResult[] = [];
    for (let k = 0; k < 6; k++) {
      const y = 56 + k * 38;
      rows.push(line(angle, y, false));
      if (showGhost) rows.push(line(targetAngle!, y, true));
    }
    return svg`
      <text x="4" y="20" font-size="12" style="fill:var(--secondary-text-color)">${this._t("inside")}</text>
      <text x=${PROF_W - 4} y="20" font-size="12" text-anchor="end" style="fill:var(--secondary-text-color)">${this._t("outside")}</text>
      <line x1="60" y1="32" x2="60" y2="272" style="stroke:var(--rc-box)" stroke-width="1" stroke-dasharray="2 4"></line>
      ${rows}
    `;
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

    const locked = this._locked();
    let stateText = unavailable
      ? this._t("unavailable")
      : st.state === "opening"
        ? this._t("opening")
        : st.state === "closing"
          ? this._t("closing")
          : this._t("stopped");
    if (locked !== undefined) {
      stateText += ` · ${locked ? this._t("auto_paused") : this._t("automation")}`;
    }

    const name =
      this._config.name ??
      (this._entities.length === 1 || this._selected >= 0
        ? this._entityName(this._entities[Math.max(0, this._selected)])
        : this._entityName(this._entities[0]));
    const canStop = supports(st, FEATURE_STOP);

    return html`
      <ha-card>
        <div class="header">
          <div class="titles">
            <div class="title">${name}</div>
            <div class="state">${stateText}</div>
          </div>
          ${locked !== undefined
            ? html`<button class="pill ${locked ? "" : "auto"}" @click=${this._toggleLock}>
                ${locked ? this._t("manual") : this._t("auto")}
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
          <div>
            <svg
              class="ctl ${unavailable ? "disabled" : ""}"
              viewBox="0 0 ${WIN_W} ${WIN_H}"
              role="slider"
              tabindex="0"
              aria-label=${this._t("height_label")}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow=${round(tLowered ?? lowered)}
              aria-valuetext="${round(tLowered ?? lowered)} %"
              @pointerdown=${this._winDown}
              @pointermove=${this._winMove}
              @pointerup=${this._up}
              @pointercancel=${this._up}
              @keydown=${this._winKey}
            >
              ${this._renderWindow(lowered, angle, tLowered, hasTilt)}
            </svg>
            <div class="readout">
              <div class="label">${this._t("lowered")}</div>
              <div class="value ${posPending ? "pending" : ""}">${round(posPending ? tLowered! : lowered)} %</div>
              <div class="now">${posPending ? `${this._t("now")} ${round(lowered)} %` : ""}</div>
            </div>
          </div>
          <div>
            <svg
              class="ctl ${unavailable || !hasTilt ? "disabled" : ""}"
              viewBox="0 0 ${PROF_W} ${WIN_H}"
              role="slider"
              tabindex=${hasTilt ? "0" : "-1"}
              aria-label=${this._t("angle_label")}
              aria-valuemin=${Math.min(closed, open)}
              aria-valuemax=${Math.max(closed, open)}
              aria-valuenow=${round(tAngle ?? angle)}
              aria-valuetext="${round(tAngle ?? angle)}°"
              @pointerdown=${this._profDown}
              @pointermove=${this._profMove}
              @pointerup=${this._up}
              @pointercancel=${this._up}
              @keydown=${this._profKey}
            >
              ${this._renderProfile(hasTilt ? angle : closed, hasTilt ? tAngle : undefined)}
            </svg>
            <div class="readout">
              <div class="label">${this._t("slats")}</div>
              <div class="value ${anglePending ? "pending" : ""}">
                ${hasTilt ? `${round(anglePending ? tAngle! : angle)}°` : "–"}
              </div>
              <div class="now">${anglePending ? `${this._t("now")} ${round(angle)}°` : ""}</div>
            </div>
          </div>
        </div>

        ${this._renderPresets(hasTilt, unavailable)}

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

        ${!hasTilt && !unavailable ? html`<div class="note warning">${this._t("no_tilt")}</div>` : nothing}
      </ha-card>
    `;
  }

  private _renderPresets(hasTilt: boolean, unavailable: boolean) {
    const presets = this._presets(hasTilt);
    if (!presets.length) return nothing;
    return html`<div class="presets" style="--rc-n: ${presets.length}">
      ${presets.map(
        (p) => html`<button ?disabled=${unavailable} @click=${() => this._applyPreset(p)}>
          ${p.icon ? html`<ha-icon .icon=${p.icon}></ha-icon>` : nothing}${p.name}
        </button>`,
      )}
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
