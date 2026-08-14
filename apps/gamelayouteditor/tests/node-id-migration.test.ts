import { describe, expect, it } from "vitest";
import {
  assertCanonicalEditorNodeId,
  migrateSceneLayoutNodeIds,
} from "../src/model/node-id.js";
import type { SceneLayoutManifestV1 } from "@slotclientengine/rendercore/scene-layout";

describe("Scene Layout node id policy", () => {
  it("migrates dot/reserved ids deterministically and rewrites typed references", () => {
    const image = {
      kind: "image" as const,
      path: "assets/bg.png",
      size: { width: 1, height: 1 },
    };
    const stateful = {
      kind: "spine" as const,
      skeleton: "assets/bg.json",
      atlas: "assets/bg.atlas",
      textures: { "bg.png": "assets/bg.png" },
      stateMachine: {
        initialState: "BG",
        states: { BG: { animation: "bg" } },
        transitions: [],
      },
    };
    const manifest: SceneLayoutManifestV1 = {
      version: 1,
      kind: "scene-layout",
      id: "legacy",
      adaptation: {
        mode: "maximized-focus",
        artSize: { width: 100, height: 100 },
        focusRect: { x: 0, y: 0, width: 100, height: 100 },
        backgroundNode: "main.top",
      },
      nodes: [
        {
          id: "main.top",
          order: 0,
          resource: stateful,
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
        {
          id: "main-top",
          order: 1,
          resource: image,
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
        {
          id: "reel",
          order: 2,
          resource: image,
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      ],
      reels: {
        main: {
          columns: 1,
          rows: 1,
          cellSize: { width: 10, height: 10 },
          gap: { x: 0, y: 0 },
          placements: { default: { x: 0, y: 0 } },
        },
      },
      gameModes: {
        initialMode: "base",
        modes: [
          {
            id: "base",
            backgroundNodes: { default: "main.top" },
            nodeStates: { "main.top": "BG" },
          },
        ],
      },
    };
    const result = migrateSceneLayoutNodeIds(manifest);
    expect(result.renames).toEqual([
      { from: "main.top", to: "main-top-2" },
      { from: "reel", to: "reel-node" },
    ]);
    expect(result.manifest.nodes.map(({ id }) => id)).toEqual([
      "main-top-2",
      "main-top",
      "reel-node",
    ]);
    expect(result.manifest.adaptation).toMatchObject({
      backgroundNode: "main-top-2",
    });
    expect(result.manifest.gameModes?.modes[0]?.backgroundNodes).toEqual({
      default: "main-top-2",
    });
    expect(result.manifest.gameModes?.modes[0]?.nodeStates).toEqual({
      "main-top-2": "BG",
    });
  });

  it("rejects dots and render-layer reserved names for new editor ids", () => {
    expect(() => assertCanonicalEditorNodeId("main.top")).toThrow(/连字符/);
    expect(() => assertCanonicalEditorNodeId("popup")).toThrow(/保留名/);
    expect(() => assertCanonicalEditorNodeId("main-top")).not.toThrow();
  });
});
