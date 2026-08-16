import { describe, expect, it } from "vitest";
import {
  createSceneLayoutRuntimeAllocation,
  parseSceneLayoutManifestV2,
  sceneLayoutTransitionOwnerId,
} from "../../src/scene-layout/index.js";

describe("scene layout runtime allocation", () => {
  it("derives exact per-mode and per-variant stable owners", () => {
    const manifest = parseSceneLayoutManifestV2({
      version: 2,
      kind: "scene-layout",
      id: "allocation",
      nodes: [
        node("base-bg", 0, { default: placement() }),
        node("free-bg", 1, { default: placement() }),
        node("shared", 2, { default: placement() }),
        { ...node("free-only", 3, { default: placement() }), gameMode: "Free" },
      ],
      reels: {
        main: {
          order: 10,
          columns: 1,
          rows: 1,
          cellSize: { width: 10, height: 10 },
          gap: { x: 0, y: 0 },
        },
      },
      symbolPackages: {
        shared: {
          manifest: "symbols.package.json",
          reel: "main",
          reelSet: "main",
          renderMode: "standard",
        },
      },
      popups: {
        award: {
          type: "award-celebration",
          manifest: "popup.manifest.json",
          order: 20,
          placements: { default: placement() },
        },
      },
      runtimeResources: {
        effect: {
          kind: "image",
          path: "effect.png",
          size: { width: 1, height: 1 },
        },
      },
      gameModes: {
        initialMode: "Base",
        modes: [
          mode("Base", "base-bg", "shared", "award"),
          mode("Free", "free-bg", "shared"),
        ],
        transitions: [{ from: "Base", to: "Free", overlay: { kind: "none" } }],
      },
    });
    expect(createSceneLayoutRuntimeAllocation(manifest)).toEqual({
      version: 1,
      package: {
        nodes: ["base-bg", "free-bg", "shared", "free-only"],
        symbolPackages: ["shared"],
        popups: ["award"],
      },
      onDemand: {
        transitions: [sceneLayoutTransitionOwnerId("Base", "Free")],
        runtimeResources: ["effect"],
      },
      modes: {
        Base: {
          variants: {
            default: { activeNodes: ["base-bg", "shared"] },
          },
          symbolPackage: "shared",
          awardCelebrationPopup: "award",
        },
        Free: {
          variants: {
            default: {
              activeNodes: ["free-bg", "shared", "free-only"],
            },
          },
          symbolPackage: "shared",
          awardCelebrationPopup: null,
        },
      },
    });
  });
});

function placement() {
  return { x: 0, y: 0, scale: 1 };
}

function node(id: string, order: number, placements: Record<string, unknown>) {
  return {
    id,
    order,
    resource: {
      kind: "image",
      path: `${id}.png`,
      size: { width: 100, height: 100 },
    },
    placements,
  };
}

function mode(
  id: string,
  background: string,
  symbolPackage: string,
  awardCelebrationPopup?: string,
) {
  return {
    id,
    adaptation: {
      mode: "maximized-focus",
      artSize: { width: 100, height: 100 },
      focusRect: { x: 0, y: 0, width: 100, height: 100 },
    },
    reelEnabled: true,
    reelPlacements: { main: { default: { x: 0, y: 0 } } },
    backgroundNodes: { default: background },
    nodeStates: {},
    symbolPackage,
    ...(awardCelebrationPopup ? { awardCelebrationPopup } : {}),
  };
}
