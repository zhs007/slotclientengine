import { describe, expect, it } from "vitest";
import { cabinAnimationData } from "../../src/data/cabin-animation-data.js";
import { buildVictoryProject } from "../../src/runtime/spine-to-victoryani.js";

function createAssetPaths() {
  return Object.fromEntries(cabinAnimationData.attachmentNames.map((name) => [name, `./assets/${name}.png`]));
}

describe("spine-to-victoryani", () => {
  it("maps the cabin animation to a VictoryAni-compatible project structure", () => {
    const project = buildVictoryProject(cabinAnimationData, "cabin", {
      fps: cabinAnimationData.skeleton.fps,
      assetPaths: createAssetPaths()
    });

    expect(project.version).toBe("0.1.0");
    expect(project.name).toBe("cabin:cabin");
    expect(project.duration).toBe(cabinAnimationData.animations.cabin.duration);
    expect(project.layers?.length).toBeGreaterThan(0);
    expect(project.layers?.every((layer) => layer.asset?.startsWith("./assets/") && layer.animations?.[0]?.type === "timeline")).toBe(true);
  });

  it("samples frame data into encoded timeline scripts", () => {
    const project = buildVictoryProject(cabinAnimationData, "cabin", {
      fps: cabinAnimationData.skeleton.fps,
      assetPaths: createAssetPaths()
    });

    const layer = project.layers?.find((item) => item.id === "ui14__ui6");
    const payload = JSON.parse(layer?.animations?.[0]?.script ?? "{}");

    expect(payload.kind).toBe("timeline");
    expect(payload.fps).toBe(cabinAnimationData.skeleton.fps);
    expect(payload.frames.length).toBeGreaterThan(1);
  });
});