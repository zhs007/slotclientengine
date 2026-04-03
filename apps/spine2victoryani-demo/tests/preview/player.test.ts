import { describe, expect, it, vi } from "vitest";
import { ExportPreviewPlayer } from "../../src/preview/player.js";
import type { VictoryProjectConfig } from "../../src/config/victory-types.js";

function createProject(): VictoryProjectConfig {
  return {
    version: "0.1.0",
    name: "test-project",
    duration: 1,
    width: 1280,
    height: 900,
    layers: [
      {
        id: "layer-a",
        type: "pic",
        asset: "asset-a",
        sourceAsset: "asset-a",
        text: "",
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        blendMode: "normal",
        visible: true,
        locked: true,
        maskId: null,
        animations: [
          {
            type: "timeline",
            startTime: 0,
            duration: 1,
            script: JSON.stringify({
              kind: "timeline",
              fps: 1,
              frames: [
                [0, 0, 1, 1, 0, 1, 1, 0],
                [0, 0, 1, 1, 0, 1, 1, 1]
              ]
            }),
            params: {}
          }
        ]
      },
      {
        id: "layer-b",
        type: "pic",
        asset: "asset-b",
        sourceAsset: "asset-b",
        text: "",
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        blendMode: "normal",
        visible: true,
        locked: true,
        maskId: null,
        animations: [
          {
            type: "timeline",
            startTime: 0,
            duration: 1,
            script: JSON.stringify({
              kind: "timeline",
              fps: 1,
              frames: [
                [0, 0, 1, 1, 0, 1, 1, 1],
                [0, 0, 1, 1, 0, 1, 1, 0]
              ]
            }),
            params: {}
          }
        ]
      }
    ]
  };
}

describe("ExportPreviewPlayer", () => {
  it("sorts sprites using sampled draw order instead of fixed layer order", () => {
    const app = {
      renderer: {
        render: vi.fn()
      },
      stage: {}
    } as never;
    const textures = new Map([
      ["asset-a", {} as never],
      ["asset-b", {} as never]
    ]);

    const player = new ExportPreviewPlayer(app, createProject(), textures);

    expect(player.root.children.map((child) => child.zIndex)).toEqual([0, 1001]);

    player.play();
    player.update(1);

    expect(player.root.children.map((child) => child.zIndex)).toEqual([1, 1000]);
  });
});
