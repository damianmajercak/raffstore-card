import type {
  EntityConfig,
  HassEntity,
  PresetConfig,
  RaffstoreCardConfig,
  Target,
} from "./types";

export const FEATURE_SET_POSITION = 4;
export const FEATURE_STOP = 8;
export const FEATURE_SET_TILT_POSITION = 128;

export const DEFAULT_CLOSED_ANGLE = 90;
export const DEFAULT_OPEN_ANGLE = 0;

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export const round = (v: number): number => Math.round(v);

/** Converts a Home Assistant tilt position (0 closed – 100 open) to slat degrees. */
export function tiltToAngle(tilt: number, closed: number, open: number): number {
  return closed + ((open - closed) * clamp(tilt, 0, 100)) / 100;
}

/** Converts slat degrees to a Home Assistant tilt position (0 closed – 100 open). */
export function angleToTilt(angle: number, closed: number, open: number): number {
  if (open === closed) return 0;
  return clamp(((angle - closed) / (open - closed)) * 100, 0, 100);
}

/** Home Assistant position (100 = raised) to how far the blind is lowered (100 = fully down). */
export const positionToLowered = (position: number): number => 100 - clamp(position, 0, 100);
export const loweredToPosition = (lowered: number): number => 100 - clamp(lowered, 0, 100);

export function normalizeEntities(config: RaffstoreCardConfig): EntityConfig[] {
  const list: EntityConfig[] = [];
  if (config.entity) list.push({ entity: config.entity });
  for (const e of config.entities ?? []) {
    const item = typeof e === "string" ? { entity: e } : e;
    if (item?.entity && !list.some((x) => x.entity === item.entity)) list.push(item);
  }
  return list;
}

export function validateConfig(config: RaffstoreCardConfig): void {
  if (!config) throw new Error("Invalid configuration");
  const entities = normalizeEntities(config);
  if (!entities.length) throw new Error("Define `entity` or `entities` (cover entities)");
  for (const e of entities) {
    if (!e.entity.startsWith("cover.")) throw new Error(`${e.entity} is not a cover entity`);
  }
  if (config.tilt_mode && !["after_move", "immediate"].includes(config.tilt_mode)) {
    throw new Error("tilt_mode must be after_move or immediate");
  }
  if (config.presets) {
    if (!Array.isArray(config.presets)) throw new Error("presets must be a list");
    for (const p of config.presets) {
      if (typeof p?.position !== "number") throw new Error("Each preset needs a position (0–100)");
    }
  }
  if (config.service && !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(config.service)) {
    throw new Error("service must look like domain.service");
  }
}

export const supports = (entity: HassEntity | undefined, feature: number): boolean =>
  !!entity && ((entity.attributes.supported_features ?? 0) & feature) !== 0;

export const isMoving = (entity: HassEntity | undefined): boolean =>
  entity?.state === "opening" || entity?.state === "closing";

export const isUnavailable = (entity: HassEntity | undefined): boolean =>
  !entity || entity.state === "unavailable" || entity.state === "unknown";

export function currentPosition(entity: HassEntity | undefined): number {
  if (!entity) return 100;
  const p = entity.attributes.current_position;
  if (typeof p === "number") return p;
  return entity.state === "closed" ? 0 : 100;
}

export function currentTilt(entity: HassEntity | undefined): number {
  const t = entity?.attributes.current_tilt_position;
  return typeof t === "number" ? t : 100;
}

export function presetTarget(preset: PresetConfig, closed: number, open: number): Target {
  const tilt =
    typeof preset.angle === "number"
      ? angleToTilt(preset.angle, closed, open)
      : typeof preset.tilt === "number"
        ? clamp(preset.tilt, 0, 100)
        : 100;
  return { position: clamp(preset.position, 0, 100), tilt };
}

/** True when the target height and (for a lowered blind) the slat angle are reached. */
export function targetReached(entity: HassEntity | undefined, target: Target): boolean {
  if (!entity) return true;
  const posOk = Math.abs(currentPosition(entity) - target.position) <= 1;
  if (!posOk) return false;
  if (target.position >= 100 || !supports(entity, FEATURE_SET_TILT_POSITION)) return true;
  return Math.abs(currentTilt(entity) - target.tilt) <= 2;
}
