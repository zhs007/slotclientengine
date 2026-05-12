import { describe, expect, it } from "vitest";
import { bgProject } from "../../src/animations/bg.js";

describe("bgProject", () => {
  it("stores the editor export as TypeScript configuration instead of JSON", () => {
    expect(bgProject.id).toBe("bg");
    expect(bgProject.duration).toBe(3);
    expect(bgProject.layers).toHaveLength(15);
    expect(JSON.stringify(bgProject)).not.toContain("project.json");
  });

  it("preserves mask, blend mode and mirrored layer data", () => {
    const sweepLayer = bgProject.layers.find((layer) => layer.id === "刷光");
    const mirroredLayer = bgProject.layers.find(
      (layer) => layer.id === "光_copy_9",
    );

    expect(sweepLayer?.maskId).toBe("隐形框_copy_7");
    expect(sweepLayer?.blendMode).toBe("add");
    expect(mirroredLayer?.scaleX).toBeLessThan(0);
  });
});
