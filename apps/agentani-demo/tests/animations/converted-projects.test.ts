import { describe, expect, it } from "vitest";
import { animationRegistry } from "../../src/animations/registry.js";

describe("converted editor2 projects", () => {
  it("keeps every converted project independent from editor JSON", () => {
    for (const entry of animationRegistry) {
      expect(entry.status).toBe("ready");
      if (entry.status === "ready") {
        expect(JSON.stringify(entry.project)).not.toContain("project.json");
        expect(
          entry.project.layers.every((layer) =>
            layer.texture.includes("/assets/"),
          ),
        ).toBe(true);
      }
    }
  });

  it("covers the new effect types used by the remaining directories", () => {
    const effects = new Set(
      animationRegistry.flatMap((entry) =>
        entry.status === "ready"
          ? entry.project.layers.flatMap((layer) =>
              layer.animations.map((animation) => animation.type),
            )
          : [],
      ),
    );

    expect(effects).toEqual(
      new Set([
        "fadeIn",
        "fadeOut",
        "fireDistortion",
        "float",
        "leafFall",
        "particleBurst",
        "pulse",
        "slideOut",
        "starlight",
        "sweepLight",
        "swing",
        "zoomIn",
      ]),
    );
  });
});
