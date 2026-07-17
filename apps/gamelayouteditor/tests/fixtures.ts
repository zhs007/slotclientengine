import type { SceneLayoutManifestV1 } from "@slotclientengine/rendercore/scene-layout";

export const imageManifest = {
  version: 1,
  kind: "scene-layout",
  id: "fixture",
  adaptation: {
    mode: "maximized-focus",
    artSize: { width: 100, height: 100 },
    focusRect: { x: 10, y: 10, width: 80, height: 80 },
    backgroundNode: "bg",
  },
  nodes: [
    {
      id: "bg",
      order: 0,
      resource: {
        kind: "image",
        path: "assets/bg.png",
        size: { width: 1, height: 1 },
      },
      placements: { default: { x: 0, y: 0, scale: 1 } },
    },
  ],
  reels: {
    main: {
      columns: 2,
      rows: 2,
      cellSize: { width: 20, height: 20 },
      gap: { x: 5, y: 3 },
      placements: { default: { x: 20, y: 20 } },
    },
  },
} satisfies SceneLayoutManifestV1;

export const assetBytes = new Map([
  ["assets/bg.png", new Uint8Array([1, 2, 3])],
]);
