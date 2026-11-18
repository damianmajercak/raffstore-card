import { describe, expect, it } from "vitest";
import { MAX_EXTRAPOLATION_S, MotionTracker, limitToTarget, predictTimed } from "../src/motion";
import { resolveSeconds, validateConfig } from "../src/utils";
import type { HomeAssistant } from "../src/types";

const timing = { open: 48, close: 45, tilt: 2.4 };

describe("predictTimed (slats first, then height)", () => {
  it("opens the slats before the blind starts to rise", () => {
    const p = predictTimed({ position: 0, tilt: 0 }, 1, 1.2, timing, true);
    expect(p.tilt).toBeCloseTo(50);
    expect(p.position).toBe(0);
  });
  it("rises at the net speed once the slats are open", () => {
    const net = 48 - 2.4;
    const p = predictTimed({ position: 0, tilt: 0 }, 1, 2.4 + net / 2, timing, true);
    expect(p.tilt).toBe(100);
    expect(p.position).toBeCloseTo(50);
  });
  it("closes the slats before lowering", () => {
    const p = predictTimed({ position: 100, tilt: 100 }, -1, 2.4 + (45 - 2.4) / 4, timing, true);
    expect(p.tilt).toBe(0);
    expect(p.position).toBeCloseTo(75);
  });
  it("ignores the slat phase for covers without tilt", () => {
    const p = predictTimed({ position: 0, tilt: 0 }, 1, 24, { open: 48, close: 45, tilt: 0 }, false);
    expect(p.position).toBeCloseTo(50);
  });
  it("clamps at the ends", () => {
    expect(predictTimed({ position: 99, tilt: 100 }, 1, 60, timing, true).position).toBe(100);
    expect(predictTimed({ position: 1, tilt: 0 }, -1, 60, timing, true).position).toBe(0);
  });
});

describe("limitToTarget", () => {
  it("stops the prediction at a known target height", () => {
    const p = limitToTarget({ position: 60, tilt: 0 }, { position: 100, tilt: 100 }, -1, { position: 70, tilt: 40 });
    expect(p.position).toBe(70);
  });
  it("limits the slats on a tilt-only move", () => {
    const p = limitToTarget({ position: 0, tilt: 80 }, { position: 0, tilt: 0 }, 1, { position: 0, tilt: 50 });
    expect(p.tilt).toBe(50);
  });
});

describe("MotionTracker", () => {
  it("draws the reported pose when idle", () => {
    const tr = new MotionTracker();
    tr.report({ position: 40, tilt: 20 }, "open", 0, timing);
    expect(tr.pose(5000, timing)).toEqual({ position: 40, tilt: 20 });
    expect(tr.animating(5000)).toBe(false);
  });

  it("moves smoothly between reports and blends a correction in", () => {
    const tr = new MotionTracker();
    tr.report({ position: 50, tilt: 100 }, "opening", 0, timing);
    const mid = tr.pose(500, timing).position;
    expect(mid).toBeGreaterThan(50);
    expect(mid).toBeLessThan(52);
    // the device reports a bit less than predicted – no jump at the moment of the report
    const before = tr.pose(1000, timing).position;
    tr.report({ position: 51.5, tilt: 100 }, "opening", 1000, timing);
    expect(tr.pose(1000, timing).position).toBeCloseTo(before, 5);
    // …and the drawing converges to the corrected track
    const track = 51.5 + (0.5 * 100) / (48 - 2.4);
    expect(tr.pose(1500, timing).position).toBeCloseTo(track, 0);
  });

  it("stops predicting when reports stop arriving", () => {
    const tr = new MotionTracker();
    tr.report({ position: 50, tilt: 100 }, "opening", 0, timing);
    const a = tr.pose(MAX_EXTRAPOLATION_S * 1000, timing).position;
    const b = tr.pose(10_000, timing).position;
    expect(b).toBeCloseTo(a, 5);
  });

  it("estimates the speed from reports when no travel times are known", () => {
    const tr = new MotionTracker();
    tr.report({ position: 50, tilt: 100 }, "closing", 0);
    tr.report({ position: 48, tilt: 100 }, "closing", 1000);
    // 2 %/s down; half a second after the last report, with the correction mostly blended in
    expect(tr.pose(1500, undefined).position).toBeCloseTo(47, 0);
    // never predicted further than MAX_EXTRAPOLATION_S past the last report
    expect(tr.pose(10_000, undefined).position).toBeCloseTo(48 - 2 * MAX_EXTRAPOLATION_S, 5);
  });
});

describe("travel time options", () => {
  const hass = { states: { "sensor.up": { entity_id: "sensor.up", state: "48", attributes: {} } } } as unknown as HomeAssistant;
  it("reads seconds from numbers, numeric strings and entities", () => {
    expect(resolveSeconds(45, hass)).toBe(45);
    expect(resolveSeconds("2.4", hass)).toBe(2.4);
    expect(resolveSeconds("sensor.up", hass)).toBe(48);
    expect(resolveSeconds("sensor.missing", hass)).toBeUndefined();
  });
  it("validates the options", () => {
    expect(() => validateConfig({ type: "x", entity: "cover.a", open_time: "sensor.up" })).not.toThrow();
    expect(() => validateConfig({ type: "x", entity: "cover.a", open_time: -1 })).toThrow();
    expect(() =>
      validateConfig({ type: "x", entities: [{ entity: "cover.a", tilt_time: "bad value" }] }),
    ).toThrow();
  });
});
