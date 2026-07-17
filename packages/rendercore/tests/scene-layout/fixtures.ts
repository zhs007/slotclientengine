import type { SceneLayoutManifestV1 } from "../../src/scene-layout/index.js";

export const game002LayoutFixture = {
  version: 1,
  kind: "scene-layout",
  id: "game002",
  adaptation: {
    mode: "maximized-focus",
    artSize: { width: 2000, height: 2000 },
    focusRect: { x: 580, y: 277, width: 840, height: 1200 },
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
      columns: 6,
      rows: 9,
      cellSize: { width: 120, height: 120 },
      gap: { x: 0, y: 0 },
      placements: { default: { x: 640, y: 337 } },
    },
  },
} satisfies SceneLayoutManifestV1;

export const game003LayoutFixture = {
  version: 1,
  kind: "scene-layout",
  id: "game003",
  adaptation: {
    mode: "orientation-focus",
    variants: {
      landscape: {
        artSize: { width: 2000, height: 1125 },
        focusRect: { x: 288, y: 200, width: 1424, height: 824 },
        frameFocusRect: { width: 1424, height: 824 },
        backgroundNode: "bg1",
      },
      portrait: {
        artSize: { width: 1174, height: 2000 },
        focusRect: { x: 22, y: 469.5, width: 1130, height: 1061 },
        frameFocusRect: { width: 1130, height: 1061 },
        minFocusMargin: { left: 22, right: 22 },
        backgroundNode: "bg2",
      },
    },
  },
  nodes: [
    {
      id: "bg1",
      order: 0,
      resource: {
        kind: "image",
        path: "assets/bg1.png",
        size: { width: 1, height: 1 },
      },
      placements: { landscape: { x: 0, y: 0, scale: 1 } },
    },
    {
      id: "bg2",
      order: 1,
      resource: {
        kind: "image",
        path: "assets/bg2.png",
        size: { width: 1, height: 1 },
      },
      placements: { portrait: { x: 0, y: 0, scale: 1 } },
    },
    {
      id: "conveyor1",
      order: 2,
      resource: {
        kind: "image",
        path: "assets/conveyor1.png",
        size: { width: 1, height: 1 },
      },
      placements: { landscape: { x: 30, y: 40, scale: 1 } },
    },
    {
      id: "conveyor2",
      order: 3,
      resource: {
        kind: "image",
        path: "assets/conveyor2.png",
        size: { width: 1, height: 1 },
      },
      placements: { portrait: { x: 50, y: 60, scale: 1 } },
    },
    {
      id: "minibk",
      order: 4,
      resource: {
        kind: "image",
        path: "assets/minibk.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 100, y: 100, scale: 1 },
        portrait: { x: 200, y: 200, scale: 1 },
      },
    },
    {
      id: "mainreelbg",
      order: 5,
      resource: {
        kind: "image",
        path: "assets/mainreelbg.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 350, y: 180, scale: 1 },
        portrait: { x: 90, y: 520, scale: 1 },
      },
    },
    {
      id: "bgcobk",
      order: 6,
      resource: {
        kind: "image",
        path: "assets/bgcobk.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 500, y: 80, scale: 1 },
        portrait: { x: 140, y: 380, scale: 1 },
      },
    },
    {
      id: "bgco",
      order: 7,
      resource: {
        kind: "image",
        path: "assets/bgco.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 508, y: 87, scale: 1 },
        portrait: { x: 148, y: 387, scale: 1 },
      },
    },
    {
      id: "majorbk",
      order: 8,
      resource: {
        kind: "image",
        path: "assets/majorbk.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 620, y: 105, scale: 1 },
        portrait: { x: 260, y: 405, scale: 1 },
      },
    },
    {
      id: "major",
      order: 9,
      resource: {
        kind: "image",
        path: "assets/major.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 652, y: 116, scale: 1 },
        portrait: { x: 292, y: 416, scale: 1 },
      },
    },
    {
      id: "megabk",
      order: 10,
      resource: {
        kind: "image",
        path: "assets/megabk.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 850, y: 105, scale: 1 },
        portrait: { x: 490, y: 405, scale: 1 },
      },
    },
    {
      id: "mega",
      order: 11,
      resource: {
        kind: "image",
        path: "assets/mega.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 904, y: 116, scale: 1 },
        portrait: { x: 544, y: 416, scale: 1 },
      },
    },
    {
      id: "minorbk",
      order: 12,
      resource: {
        kind: "image",
        path: "assets/minorbk.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 1080, y: 105, scale: 1 },
        portrait: { x: 720, y: 405, scale: 1 },
      },
    },
    {
      id: "minor",
      order: 13,
      resource: {
        kind: "image",
        path: "assets/minor.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 1112, y: 116, scale: 1 },
        portrait: { x: 752, y: 416, scale: 1 },
      },
    },
    {
      id: "mini",
      order: 14,
      resource: {
        kind: "image",
        path: "assets/mini.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 154, y: 111, scale: 1 },
        portrait: { x: 254, y: 211, scale: 1 },
      },
    },
  ],
  reels: {
    main: {
      columns: 5,
      rows: 5,
      cellSize: { width: 165, height: 130 },
      gap: { x: 15, y: 0 },
      placements: {
        landscape: { x: 400, y: 250 },
        portrait: { x: 140, y: 600 },
      },
    },
  },
} satisfies SceneLayoutManifestV1;
