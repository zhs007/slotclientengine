import { describe, expect, it } from "vitest";
import type { RenderVisibleSymbolGeometrySnapshot } from "@slotclientengine/rendercore/reel";
import {
  createGame003CoinOverlayRuntime,
  type Game003CoinOverlayRuntimeOptions,
} from "../src/coin-overlay-runtime.js";

describe("game003 coin overlay runtime", () => {
  it("shows raw coin amount text at visible symbol geometry positions", () => {
    const reelRuntime = new FakeCoinOverlayReelRuntime();
    const runtime = createRuntime({ reelRuntime: reelRuntime.asRuntime() });

    runtime.show([
      { x: 1, y: 1, amount: 2, text: "2" },
      { x: 1, y: 3, amount: 150, text: "150" },
    ]);

    expect(runtime.container.children).toHaveLength(2);
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "showing",
      texts: [
        { text: "2", x: 150, y: 158 },
        { text: "150", x: 150, y: 358 },
      ],
    });
  });

  it("clears old text and does not accumulate between shows", () => {
    const runtime = createRuntime();

    runtime.show([{ x: 1, y: 1, amount: 2, text: "2" }]);
    runtime.show([{ x: 1, y: 3, amount: 150, text: "150" }]);
    expect(runtime.getSnapshot()).toMatchObject({
      texts: [{ text: "150" }],
    });

    runtime.clear();
    expect(runtime.container.children).toHaveLength(0);
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "idle",
      items: [],
      texts: [],
    });
  });

  it("refreshes positions when geometry changes", () => {
    const reelRuntime = new FakeCoinOverlayReelRuntime();
    const runtime = createRuntime({ reelRuntime: reelRuntime.asRuntime() });

    runtime.show([{ x: 1, y: 1, amount: 2, text: "2" }]);
    reelRuntime.offsetX = 10;
    reelRuntime.offsetY = 20;
    runtime.refresh();

    expect(runtime.getSnapshot()).toMatchObject({
      texts: [{ text: "2", x: 160, y: 178 }],
    });
  });

  it("fails fast for invalid items, missing geometry, and use after destroy", () => {
    const reelRuntime = new FakeCoinOverlayReelRuntime();
    const runtime = createRuntime({ reelRuntime: reelRuntime.asRuntime() });

    reelRuntime.dropLastGeometry = true;
    expect(() => runtime.show([{ x: 1, y: 1, amount: 2, text: "2" }])).toThrow(
      /geometry count/,
    );

    reelRuntime.dropLastGeometry = false;
    expect(() => runtime.show([{ x: 1, y: 1, amount: 0, text: "0" }])).toThrow(
      /positive integer/,
    );
    expect(() => runtime.show([{ x: 1, y: 1, amount: 2, text: "" }])).toThrow(
      /raw amount/,
    );

    runtime.destroy();
    expect(() => runtime.show([{ x: 1, y: 1, amount: 2, text: "2" }])).toThrow(
      /destroyed/,
    );
    expect(() => runtime.clear()).toThrow(/destroyed/);
  });
});

function createRuntime(
  overrides: Partial<Game003CoinOverlayRuntimeOptions> = {},
) {
  return createGame003CoinOverlayRuntime({
    reelRuntime: new FakeCoinOverlayReelRuntime().asRuntime(),
    config: {
      componentName: "bg-gencoins",
      coinSymbol: "CO",
      text: {
        yOffsetRatioFromCellCenter: 0.08,
        fontSize: 32,
        fill: "#fff7d6",
        stroke: "#5a2500",
        strokeWidth: 4,
      },
    },
    ...overrides,
  });
}

class FakeCoinOverlayReelRuntime {
  offsetX = 0;
  offsetY = 0;
  dropLastGeometry = false;

  asRuntime(): Game003CoinOverlayRuntimeOptions["reelRuntime"] {
    return {
      getVisibleSymbolGeometrySnapshots: (positions) => {
        const snapshots = positions.map((position) =>
          this.createGeometrySnapshot(position),
        );
        return this.dropLastGeometry ? snapshots.slice(0, -1) : snapshots;
      },
    };
  }

  private createGeometrySnapshot(position: {
    readonly x: number;
    readonly y: number;
  }): RenderVisibleSymbolGeometrySnapshot {
    return {
      x: position.x,
      y: position.y,
      code: 11,
      kind: "textured",
      centerX: position.x * 100 + 50 + this.offsetX,
      centerY: position.y * 100 + 50 + this.offsetY,
      cellWidth: 100,
      cellHeight: 100,
    };
  }
}
