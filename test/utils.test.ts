import { describe, expect, it } from "vitest";
import {
  angleToTilt,
  loweredToPosition,
  normalizeEntities,
  positionToLowered,
  presetTarget,
  targetReached,
  tiltToAngle,
  validateConfig,
} from "../src/utils";
import type { HassEntity } from "../src/types";

const cover = (position: number, tilt: number, features = 255): HassEntity => ({
  entity_id: "cover.x",
  state: "open",
  attributes: { current_position: position, current_tilt_position: tilt, supported_features: features },
});

describe("angle mapping", () => {
  it("maps tilt 0 to the closed angle and 100 to the open angle", () => {
    expect(tiltToAngle(0, 90, 0)).toBe(90);
    expect(tiltToAngle(100, 90, 0)).toBe(0);
    expect(tiltToAngle(50, 90, 0)).toBe(45);
  });
  it("round-trips angles", () => {
    for (const a of [0, 15, 45, 80, 90]) expect(angleToTilt(tiltToAngle(angleToTilt(a, 90, 0), 90, 0), 90, 0)).toBeCloseTo(angleToTilt(a, 90, 0));
  });
  it("supports an inverted range", () => {
    expect(angleToTilt(-30, -30, 60)).toBe(0);
    expect(angleToTilt(60, -30, 60)).toBe(100);
  });
  it("clamps out-of-range values", () => {
    expect(angleToTilt(120, 90, 0)).toBe(0);
    expect(tiltToAngle(150, 90, 0)).toBe(0);
  });
});

describe("position mapping", () => {
  it("converts HA position to lowered percent", () => {
    expect(positionToLowered(100)).toBe(0);
    expect(positionToLowered(0)).toBe(100);
    expect(loweredToPosition(30)).toBe(70);
  });
});

describe("config", () => {
  it("merges entity and entities without duplicates", () => {
    const list = normalizeEntities({ type: "x", entity: "cover.a", entities: ["cover.a", { entity: "cover.b", name: "B" }] });
    expect(list).toEqual([{ entity: "cover.a" }, { entity: "cover.b", name: "B" }]);
  });
  it("rejects configs without covers", () => {
    expect(() => validateConfig({ type: "x" })).toThrow();
    expect(() => validateConfig({ type: "x", entity: "light.a" })).toThrow();
    expect(() => validateConfig({ type: "x", entity: "cover.a", tilt_mode: "soon" as never })).toThrow();
  });
  it("accepts a valid config", () => {
    expect(() => validateConfig({ type: "x", entities: ["cover.a"], service: "script.set_blind" })).not.toThrow();
  });
});

describe("presets", () => {
  it("prefers angle over tilt", () => {
    expect(presetTarget({ name: "Shade", position: 0, angle: 45, tilt: 10 }, 90, 0)).toEqual({ position: 0, tilt: 50 });
  });
  it("defaults tilt to open", () => {
    expect(presetTarget({ name: "Up", position: 100 }, 90, 0)).toEqual({ position: 100, tilt: 100 });
  });
});

describe("targetReached", () => {
  it("needs height and tilt when lowered", () => {
    expect(targetReached(cover(0, 50), { position: 0, tilt: 50 })).toBe(true);
    expect(targetReached(cover(0, 20), { position: 0, tilt: 50 })).toBe(false);
  });
  it("ignores tilt when fully raised or unsupported", () => {
    expect(targetReached(cover(100, 0), { position: 100, tilt: 50 })).toBe(true);
    expect(targetReached(cover(40, 0, 15), { position: 40, tilt: 80 })).toBe(true);
  });
});
