import { describe, expect, it } from "vitest";
import {
  createGame003BgBarLayout,
  getGame003BgBarSlotCenter,
} from "../src/bg-bar-layout.js";
import { createGame003Layout } from "../src/game-layout.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 bg-bar layout", () => {
  it("uses explicit conveyor slot rects for landscape and portrait", () => {
    const config = getGame003SkinConfig("1").bgBar;
    const landscape = createGame003BgBarLayout({
      layout: createGame003Layout({
        viewportSize: { width: 1600, height: 1000 },
      }),
      config,
    });
    const portrait = createGame003BgBarLayout({
      layout: createGame003Layout({
        viewportSize: { width: 1174, height: 2000 },
      }),
      config,
    });

    expect(landscape).toMatchObject({
      orientation: "landscape",
      movement: "down",
      conveyorFrame: { x: 288, y: 602.5, width: 284, height: 775 },
    });
    expect(landscape.slotRectsInConveyor).toEqual([
      { x: 55, y: 75, width: 174, height: 126 },
      { x: 55, y: 204, width: 174, height: 132 },
      { x: 55, y: 339, width: 174, height: 132 },
      { x: 55, y: 474, width: 174, height: 132 },
      { x: 55, y: 609, width: 174, height: 132 },
    ]);
    expect(portrait).toMatchObject({
      orientation: "portrait",
      movement: "right",
      conveyorFrame: { x: 120, y: 389.5, width: 934, height: 227 },
    });
    expect(portrait.slotRectsInConveyor).toEqual([
      { x: 74, y: 55, width: 153, height: 115 },
      { x: 232, y: 55, width: 153, height: 115 },
      { x: 390, y: 55, width: 153, height: 115 },
      { x: 548, y: 55, width: 153, height: 115 },
      { x: 706, y: 55, width: 153, height: 115 },
    ]);
  });

  it("calculates slot centers and rejects out-of-range slot indexes", () => {
    const layout = createGame003BgBarLayout({
      layout: createGame003Layout({
        viewportSize: { width: 1600, height: 1000 },
      }),
      config: getGame003SkinConfig("1").bgBar,
    });

    expect(getGame003BgBarSlotCenter(layout, 0)).toEqual({ x: 142, y: 138 });
    expect(getGame003BgBarSlotCenter(layout, 4)).toEqual({ x: 142, y: 675 });
    expect(() => getGame003BgBarSlotCenter(layout, 5)).toThrow(/out of range/);
  });

  it("fails when the generated bg-bar layout contract is incomplete", () => {
    const config = getGame003SkinConfig("1").bgBar;
    const landscapeLayout = createGame003Layout({
      viewportSize: { width: 1600, height: 1000 },
    });

    expect(() =>
      createGame003BgBarLayout({
        layout: landscapeLayout,
        config: {
          ...config,
          layout: { portrait: config.layout.portrait },
        } as never,
      }),
    ).toThrow(/layout is missing landscape/);

    expect(() =>
      createGame003BgBarLayout({
        layout: landscapeLayout,
        config: {
          ...config,
          layout: {
            ...config.layout,
            landscape: {
              ...config.layout.landscape,
              slotRectsInConveyor:
                config.layout.landscape.slotRectsInConveyor.slice(0, 4),
            },
          },
        } as never,
      }),
    ).toThrow(/slot rect count/);
  });
});
