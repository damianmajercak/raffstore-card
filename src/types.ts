export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed?: string;
  last_updated?: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  language?: string;
  locale?: { language: string };
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ): Promise<unknown>;
}

/** Seconds as a number, or the id of an entity whose state is the time in seconds. */
export type TimeSource = number | string;

export interface EntityConfig {
  entity: string;
  name?: string;
  open_time?: TimeSource;
  close_time?: TimeSource;
  tilt_time?: TimeSource;
}

export interface PresetConfig {
  name: string;
  icon?: string;
  /** Home Assistant position, 0 = fully lowered, 100 = fully raised. */
  position: number;
  /** Home Assistant tilt position, 0 = closed, 100 = open. */
  tilt?: number;
  /** Slat angle in degrees; used instead of `tilt` when set. */
  angle?: number;
}

/**
 * after_move: send the tilt only after the blind has stopped at the target height
 *             (works with any cover, needs the card to stay open during the move).
 * immediate:  send position and tilt right away; the device must queue the tilt
 *             until the move ends.
 */
export type TiltMode = "after_move" | "immediate";

/** Cross-section of the slats shown in the angle dial. */
export type SlatProfile = "z" | "c" | "flat";

export interface RaffstoreCardConfig {
  type: string;
  entity?: string;
  entities?: (string | EntityConfig)[];
  name?: string;
  lock_entity?: string;
  tilt_mode?: TiltMode;
  slat_profile?: SlatProfile;
  tilt_closed_angle?: number;
  tilt_open_angle?: number;
  presets?: PresetConfig[] | false;
  debounce?: number;
  service?: string;
  /** Full travel time up (seconds or entity id), used only to draw the move smoothly. */
  open_time?: TimeSource;
  /** Full travel time down (seconds or entity id). */
  close_time?: TimeSource;
  /** Slat turn from one end to the other (seconds or entity id). */
  tilt_time?: TimeSource;
}

export interface Target {
  position: number;
  tilt: number;
}
