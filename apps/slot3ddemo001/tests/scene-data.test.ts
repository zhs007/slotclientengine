import { calculateFrontCameraFrame } from "../src/camera.js";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  NORMAL_MAP_STRENGTH,
  SYMBOL_FIT_HEIGHT,
  SYMBOL_FIT_WIDTH,
} from "../src/config.js";
import {
  calculateDropY,
  createDropSchedule,
  getScheduleDuration,
} from "../src/drop-timeline.js";
import { sampleImpactCameraOffset } from "../src/impact-effects.js";
import { MeshBasicMaterial, MeshStandardMaterial } from "three";
import { tuneMegalithMaterial } from "../src/symbol.js";
import {
  createRandomScene,
  formatScene,
  type MegalithScene,
} from "../src/scene-data.js";

const FIXTURE = Object.freeze([
  Object.freeze(["megalith-a", "megalith-b", "megalith-a"] as const),
  Object.freeze(["megalith-b", "megalith-a", "megalith-b"] as const),
  Object.freeze(["megalith-a", "megalith-a", "megalith-b"] as const),
  Object.freeze(["megalith-b", "megalith-b", "megalith-a"] as const),
  Object.freeze(["megalith-a", "megalith-b", "megalith-b"] as const),
]) satisfies MegalithScene;

describe("megalith scene", () => {
  it("creates a frozen 5x3 scene from the supplied random source", () => {
    let index = 0;
    const values = [0.1, 0.9];
    const scene = createRandomScene(() => values[index++ % values.length]!);

    expect(scene).toHaveLength(5);
    expect(scene.every((column) => column.length === 3)).toBe(true);
    expect(scene[0]).toEqual(["megalith-a", "megalith-b", "megalith-a"]);
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene[0])).toBe(true);
  });

  it("formats rows from top to bottom for the Pixi readout", () => {
    expect(formatScene(FIXTURE)).toBe(
      "A  B  B  A  B\nB  A  A  B  B\nA  B  A  B  A",
    );
  });

  it("rejects an invalid random source", () => {
    expect(() => createRandomScene(() => 1)).toThrow(RangeError);
  });

  it("slightly overlaps normalized symbols so the wall has no open gaps", () => {
    expect(CELL_WIDTH).toBeLessThan(SYMBOL_FIT_WIDTH);
    expect(CELL_HEIGHT).toBeLessThan(SYMBOL_FIT_HEIGHT);
  });
});

describe("drop schedule", () => {
  it("schedules all cells bottom-to-top without changing symbol codes", () => {
    const schedule = createDropSchedule(FIXTURE);
    expect(schedule).toHaveLength(15);
    expect(schedule.slice(0, 5).every((entry) => entry.row === 0)).toBe(true);
    expect(schedule.slice(5, 10).every((entry) => entry.row === 1)).toBe(true);
    expect(schedule.map((entry) => entry.code)).toEqual([
      "megalith-a",
      "megalith-b",
      "megalith-a",
      "megalith-b",
      "megalith-a",
      "megalith-b",
      "megalith-a",
      "megalith-a",
      "megalith-b",
      "megalith-b",
      "megalith-a",
      "megalith-b",
      "megalith-b",
      "megalith-a",
      "megalith-b",
    ]);

    const bottomLastImpact = Math.max(
      ...schedule
        .filter((entry) => entry.row === 0)
        .map((entry) => entry.delaySeconds + entry.durationSeconds),
    );
    const middleFirstImpact = Math.min(
      ...schedule
        .filter((entry) => entry.row === 1)
        .map((entry) => entry.delaySeconds + entry.durationSeconds),
    );
    expect(middleFirstImpact).toBeGreaterThan(bottomLastImpact);
    expect(getScheduleDuration(schedule)).toBeGreaterThan(middleFirstImpact);
  });

  it("uses a gravity curve and clamps at the contact position", () => {
    const entry = createDropSchedule(FIXTURE)[0]!;
    expect(calculateDropY(entry, entry.delaySeconds - 0.01)).toBeNull();
    expect(calculateDropY(entry, entry.delaySeconds)).toBe(entry.startY);
    expect(
      calculateDropY(entry, entry.delaySeconds + entry.durationSeconds * 0.5),
    ).toBeGreaterThan(entry.finalY);
    expect(
      calculateDropY(entry, entry.delaySeconds + entry.durationSeconds + 10),
    ).toBe(entry.finalY);
  });
});

describe("front camera", () => {
  it("moves farther away for a portrait viewport while remaining centered", () => {
    const landscape = calculateFrontCameraFrame(16 / 9);
    const portrait = calculateFrontCameraFrame(9 / 16);
    expect(portrait.distance).toBeGreaterThan(landscape.distance);
    expect(portrait.targetY).toBe(landscape.targetY);
  });

  it("rejects an invalid aspect ratio", () => {
    expect(() => calculateFrontCameraFrame(0)).toThrow(RangeError);
  });
});

describe("impact feedback", () => {
  it("returns no camera movement without impact energy", () => {
    expect(sampleImpactCameraOffset(1, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("scales the deterministic camera impulse with impact energy", () => {
    const weak = sampleImpactCameraOffset(0.25, 0.5);
    const strong = sampleImpactCameraOffset(0.25, 1);
    expect(strong.x).toBeCloseTo(weak.x * 2);
    expect(strong.y).toBeCloseTo(weak.y * 2);
    expect(strong.z).toBeCloseTo(weak.z * 2);
    expect(() => sampleImpactCameraOffset(0, -1)).toThrow(RangeError);
  });
});

describe("megalith material tuning", () => {
  it("reduces PBR normal strength without changing unsupported materials", () => {
    const pbr = new MeshStandardMaterial();
    const basic = new MeshBasicMaterial();
    tuneMegalithMaterial(pbr);
    tuneMegalithMaterial(basic);
    expect(pbr.normalScale.toArray()).toEqual([
      NORMAL_MAP_STRENGTH,
      NORMAL_MAP_STRENGTH,
    ]);
    expect(basic.type).toBe("MeshBasicMaterial");
    pbr.dispose();
    basic.dispose();
  });
});
