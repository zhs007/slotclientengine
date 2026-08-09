import { describe, expect, it, vi } from "vitest";
import type { SceneLayoutPackageResource } from "@slotclientengine/rendercore";
import { prepareGame002v2ReelPresentation } from "../src/reel-presentation.js";

describe("game002v2 reel presentation resources", () => {
  it("loads only exact Nearwin1/2 Crave runtime resources", async () => {
    const loadRuntimeResource = vi.fn(async () => ({
      kind: "spine" as const,
      skeleton: {
        skeleton: { spine: "4.3.23" },
        bones: [{ name: "root" }],
        animations: {
          Loop: {
            bones: { root: { rotate: [{ time: 0 }, { time: 0.5 }] } },
          },
        },
      },
      atlasText:
        "effect.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\n",
      textureUrls: { "effect.png": "/effect.png" },
    }));
    const resource = {
      manifest: {
        reels: { main: { columns: 6, rows: 9 } },
      },
      loadRuntimeResource,
    } as unknown as SceneLayoutPackageResource;

    const presentation = await prepareGame002v2ReelPresentation(resource);

    expect(loadRuntimeResource.mock.calls).toEqual([
      ["nearwin1", "spine"],
      ["nearwin2", "spine"],
    ]);
    expect(presentation.resources).toHaveProperty("anticipation");
    expect(presentation.resources).toHaveProperty("refillSweep");
    expect(loadRuntimeResource).not.toHaveBeenCalledWith("nearwin3", "spine");
  });
});
