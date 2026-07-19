import { Assets, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { RenderGridCellReelSet, RenderReelSet } from "../../src/reel/index.js";
import {
  createSceneLayoutPackageResource,
  createSceneLayoutPackageRuntime,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

const symbolsPackage = {
  version: 1,
  kind: "symbol-package",
  id: "demo-symbols",
  cellSize: { width: 1, height: 1 },
  entrypoints: {
    gameConfig: "gameconfig.json",
    symbolManifest: "symbol-state-textures.manifest.json",
  },
  resources: ["a.png", "b.png"],
};

const gameConfig = {
  paytable: {
    "0": { code: 0, symbol: "A", pays: [1] },
    "1": { code: 1, symbol: "B", pays: [1] },
  },
  symbolCodes: { A: 0, B: 1 },
  reels: {
    main: [
      [0, 1],
      [1, 0],
    ],
  },
};

const symbolManifest = {
  version: 1,
  states: [],
  symbols: {
    A: { normal: "./a.png", scale: 1, renderPriority: 1 },
    B: { normal: "./b.png", scale: 1 },
  },
};

function layoutManifest(renderMode: "standard" | "grid-cell") {
  return {
    ...game002LayoutFixture,
    reels: {
      main: {
        order: 1,
        columns: 2,
        rows: 2,
        cellSize: { width: 1, height: 1 },
        gap: { x: 2, y: 3 },
        placements: { default: { x: 640, y: 337 } },
      },
    },
    symbolPackage: {
      manifest: "dependencies/symbols/demo-symbols/symbols.package.json",
      reel: "main" as const,
      reelSet: "main",
      renderMode,
    },
  };
}

function files(): Map<string, Uint8Array> {
  const prefix = "dependencies/symbols/demo-symbols/";
  return new Map([
    ["assets/bg.png", new Uint8Array([1])],
    [`${prefix}symbols.package.json`, encode(symbolsPackage)],
    [`${prefix}gameconfig.json`, encode(gameConfig)],
    [`${prefix}symbol-state-textures.manifest.json`, encode(symbolManifest)],
    [`${prefix}a.png`, new Uint8Array([2])],
    [`${prefix}b.png`, new Uint8Array([3])],
  ]);
}

describe("scene layout package runtime", () => {
  for (const renderMode of ["standard", "grid-cell"] as const) {
    it(`creates, orders and resets the ${renderMode} reel from package contracts`, async () => {
      const load = vi
        .spyOn(Assets, "load")
        .mockResolvedValue(Texture.WHITE as never);
      const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
      try {
        const resource = await createSceneLayoutPackageResource({
          manifest: layoutManifest(renderMode),
          files: files(),
        });
        const runtime = createSceneLayoutPackageRuntime({ resource });
        const initialScene = [
          [1, 1],
          [0, 0],
        ];
        await runtime.init({
          reels: {
            main: { scene: initialScene, localPhaseYs: [5, -3] },
          },
        });
        const reel = runtime.getReelPresentation("main");
        expect(
          renderMode === "standard"
            ? reel instanceof RenderReelSet
            : reel instanceof RenderGridCellReelSet,
        ).toBe(true);
        expect(runtime.container.getChildIndex(reel)).toBe(1);
        const snapshot = runtime.applyViewport({ width: 1920, height: 1080 });
        expect(snapshot.reels.main.artRect).toEqual({
          x: 640,
          y: 337,
          width: 4,
          height: 5,
        });
        expect(reel.position).toMatchObject({ x: 640, y: 337 });
        expect(
          renderMode === "standard"
            ? (reel as RenderReelSet).getVisibleScene()
            : (reel as RenderGridCellReelSet).getVisibleScene(),
        ).toEqual(initialScene);
        const nextScene = [
          [0, 1],
          [1, 0],
        ];
        runtime.resetReelScene("main", {
          scene: nextScene,
          localPhaseYs: [100, -100],
        });
        expect(
          renderMode === "standard"
            ? (reel as RenderReelSet).getVisibleScene()
            : (reel as RenderGridCellReelSet).getVisibleScene(),
        ).toEqual(nextScene);
        expect(() =>
          runtime.resetReelScene("main", {
            scene: [[0], [1]],
            localPhaseYs: [0, 0],
          }),
        ).toThrow(/2 rows/);
        expect(() =>
          runtime.resetReelScene("main", {
            scene: [
              [0, 9],
              [1, 0],
            ],
            localPhaseYs: [0, 0],
          }),
        ).toThrow(/not displayable/);
        expect(() =>
          runtime.resetReelScene("main", {
            scene: nextScene,
            localPhaseYs: [0, 0.5],
          }),
        ).toThrow(/safe integer/);
        runtime.update(1 / 60);
        runtime.destroy();
        runtime.destroy();
        expect(() => runtime.getReelPresentation("main")).toThrow(/destroyed/);
      } finally {
        load.mockRestore();
        unload.mockRestore();
      }
    });
  }

  it("requires explicit runtime scene input and rejects incompatible bindings", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource({
        manifest: layoutManifest("standard"),
        files: files(),
      });
      const runtime = createSceneLayoutPackageRuntime({ resource });
      await expect(runtime.init()).rejects.toThrow(
        /requires initial reels.main/,
      );

      await expect(
        createSceneLayoutPackageResource({
          manifest: {
            ...layoutManifest("standard"),
            reels: {
              main: {
                ...layoutManifest("standard").reels.main,
                cellSize: { width: 2, height: 1 },
              },
            },
          },
          files: files(),
        }),
      ).rejects.toThrow(/cellSize mismatch/);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("keeps the package runtime layout-only when no symbols binding exists", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const create = () =>
        createSceneLayoutPackageResource({
          manifest: game002LayoutFixture,
          files: new Map([["assets/bg.png", new Uint8Array([1])]]),
        });
      const resource = await create();
      const runtime = createSceneLayoutPackageRuntime({ resource });
      await runtime.init();
      runtime.applyViewport({ width: 100, height: 100 });
      expect(() => runtime.getReelPresentation("main")).toThrow(/unavailable/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [],
          localPhaseYs: [],
        }),
      ).toThrow(/unavailable/);
      expect(() => runtime.setImageStringText("bg", "0")).toThrow(
        /not an image-string/,
      );
      expect(() => runtime.requestNodeState("bg", "FG")).toThrow(
        /not a stateful Spine/,
      );
      runtime.destroy();

      const unexpected = createSceneLayoutPackageRuntime({
        resource: await create(),
      });
      await expect(
        unexpected.init({
          reels: { main: { scene: [], localPhaseYs: [] } },
        }),
      ).rejects.toThrow(/no symbol binding/);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("rejects lifecycle and every runtime matrix boundary without fallback", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource({
        manifest: layoutManifest("standard"),
        files: files(),
      });
      const runtime = createSceneLayoutPackageRuntime({ resource });
      expect(() => runtime.applyViewport({ width: 10, height: 10 })).toThrow(
        /not initialized/,
      );
      await runtime.init({
        reels: {
          main: {
            scene: [
              [0, 1],
              [1, 0],
            ],
            localPhaseYs: [0, 0],
          },
        },
      });
      await expect(runtime.init()).rejects.toThrow(/already/);

      expect(() =>
        runtime.resetReelScene("main", {
          scene: [],
          localPhaseYs: [0, 0],
        }),
      ).toThrow(/2x2/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0.5, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
        }),
      ).toThrow(/not displayable/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [],
        }),
      ).toThrow(/2 values/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
          presentationValues: [],
        }),
      ).toThrow(/2x2/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
          presentationValues: [[null], [null, null]],
        }),
      ).toThrow(/column 0/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
          presentationValues: [
            [-1, null],
            [null, null],
          ],
        }),
      ).toThrow(/positive/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
          presentationValues: [
            [0.5, null],
            [null, 7],
          ],
        }),
      ).toThrow(/safe integer/);
      runtime.resetReelScene("main", {
        scene: [
          [0, 1],
          [1, 0],
        ],
        localPhaseYs: [0, 0],
        presentationValues: [
          [null, 2],
          [1, null],
        ],
      });
      expect(() => runtime.getReelPresentation("other" as "main")).toThrow(
        /unavailable/,
      );
      runtime.destroy();

      const dead = createSceneLayoutPackageRuntime({
        resource: await createSceneLayoutPackageResource({
          manifest: layoutManifest("standard"),
          files: files(),
        }),
      });
      dead.destroy();
      await expect(dead.init()).rejects.toThrow(/destroyed/);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });
});
