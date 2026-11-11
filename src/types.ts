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

export interface EntityConfig {
  entity: string;
  name?: string;
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

export interface RaffstoreCardConfig {
  type: string;
  entity?: string;
  entities?: (string | EntityConfig)[];
  name?: string;
  lock_entity?: string;
  tilt_mode?: TiltMode;
  tilt_closed_angle?: number;
  tilt_open_angle?: number;
  presets?: PresetConfig[] | false;
  debounce?: number;
  service?: string;
}

export interface Target {
  position: number;
  tilt: number;
}
