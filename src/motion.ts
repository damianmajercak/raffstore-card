/**
 * Smooth display of a moving blind between state updates.
 *
 * Time-based covers (ESPHome `time_based` / `venetian_blinds`, Shelly, …) report their
 * position only about once per second while moving, so a card that just draws the last
 * reported value jumps in steps. The tracker predicts the pose in between and treats each
 * new report as a correction that is blended in smoothly.
 *
 * With known travel times the prediction follows the venetian blind model used by the
 * device: the slats turn first (tilt_time), then the height changes for the rest of the
 * travel time. Without travel times the speed is estimated from consecutive reports.
 */

export interface Pose {
  /** Home Assistant position, 0 = lowered, 100 = raised. */
  position: number;
  /** Home Assistant tilt position, 0 = closed, 100 = open. */
  tilt: number;
}

/** Full travel times in seconds, including the slat turn. */
export interface Timing {
  open: number;
  close: number;
  tilt: number;
}

/** Longest stretch predicted without a new report; after that the drawing waits. */
export const MAX_EXTRAPOLATION_S = 1.25;
/** Time constant for blending a correction in (ms). */
export const BLEND_TAU_MS = 250;

const clamp100 = (v: number): number => Math.min(100, Math.max(0, v));

/** Pose after `dt` seconds of travel in `dir` (+1 up, -1 down), slats first, then height. */
export function predictTimed(from: Pose, dir: 1 | -1, dt: number, timing: Timing, hasTilt: boolean): Pose {
  let { position, tilt } = from;
  let t = Math.max(0, dt);
  const tiltTime = hasTilt ? Math.max(0, timing.tilt) : 0;
  if (tiltTime > 0) {
    const need = ((dir > 0 ? 100 - tilt : tilt) / 100) * tiltTime;
    const used = Math.min(t, need);
    tilt = clamp100(tilt + (dir * used * 100) / tiltTime);
    t -= used;
  }
  const travel = dir > 0 ? timing.open : timing.close;
  const net = Math.max(0.1, travel - tiltTime);
  position = clamp100(position + (dir * t * 100) / net);
  return { position, tilt };
}

/** Pose after `dt` seconds at a constant speed (percent per second). */
export function predictLinear(from: Pose, speed: Pose, dt: number): Pose {
  const t = Math.max(0, dt);
  return {
    position: clamp100(from.position + speed.position * t),
    tilt: clamp100(from.tilt + speed.tilt * t),
  };
}

/** Limits a predicted pose so it does not run past a known target in the direction of travel. */
export function limitToTarget(p: Pose, from: Pose, dir: 1 | -1, target?: Pose): Pose {
  if (!target) return p;
  const lim = (v: number, start: number, goal: number) => {
    if (dir > 0 && goal >= start) return Math.min(v, goal);
    if (dir < 0 && goal <= start) return Math.max(v, goal);
    return v;
  };
  const tiltOnly = Math.abs(from.position - target.position) <= 1;
  return {
    position: lim(p.position, from.position, target.position),
    tilt: tiltOnly ? lim(p.tilt, from.tilt, target.tilt) : p.tilt,
  };
}

export const directionOf = (state: string | undefined): 1 | -1 | 0 =>
  state === "opening" ? 1 : state === "closing" ? -1 : 0;

interface Anchor {
  pose: Pose;
  at: number;
  dir: 1 | -1 | 0;
}

export class MotionTracker {
  private anchor?: Anchor;
  private speed?: Pose;
  private offset: Pose = { position: 0, tilt: 0 };
  private offsetAt = 0;

  /** Feed a new report (time in ms, e.g. performance.now()). */
  report(pose: Pose, state: string | undefined, now: number, timing?: Timing, hasTilt = true, target?: Pose): void {
    const dir = directionOf(state);
    const prev = this.anchor;
    if (prev) {
      const shown = this.pose(now, timing, hasTilt, target);
      this.offset = { position: shown.position - pose.position, tilt: shown.tilt - pose.tilt };
      this.offsetAt = now;
      if (dir !== 0 && prev.dir === dir && now - prev.at > 200) {
        const dt = (now - prev.at) / 1000;
        this.speed = {
          position: (pose.position - prev.pose.position) / dt,
          tilt: (pose.tilt - prev.pose.tilt) / dt,
        };
      } else if (dir !== prev.dir) {
        this.speed = undefined;
      }
    }
    this.anchor = { pose: { ...pose }, at: now, dir };
  }

  /** Pose to draw at time `now`. */
  pose(now: number, timing?: Timing, hasTilt = true, target?: Pose): Pose {
    const a = this.anchor;
    if (!a) return { position: 0, tilt: 0 };
    let base = a.pose;
    if (a.dir !== 0) {
      const dt = Math.min(now - a.at, MAX_EXTRAPOLATION_S * 1000) / 1000;
      if (timing) base = predictTimed(a.pose, a.dir, dt, timing, hasTilt);
      else if (this.speed) base = predictLinear(a.pose, this.speed, dt);
      base = limitToTarget(base, a.pose, a.dir, target);
    }
    const k = Math.exp(-(now - this.offsetAt) / BLEND_TAU_MS);
    return {
      position: clamp100(base.position + this.offset.position * k),
      tilt: clamp100(base.tilt + this.offset.tilt * k),
    };
  }

  /** True while the drawing still changes on its own (moving or blending a correction). */
  animating(now: number): boolean {
    if (!this.anchor) return false;
    if (this.anchor.dir !== 0 && now - this.anchor.at < MAX_EXTRAPOLATION_S * 1000) return true;
    const k = Math.exp(-(now - this.offsetAt) / BLEND_TAU_MS);
    return Math.max(Math.abs(this.offset.position), Math.abs(this.offset.tilt)) * k > 0.2;
  }
}
