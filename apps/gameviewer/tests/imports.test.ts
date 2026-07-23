import { beforeEach, describe, expect, it, vi } from "vitest";

const { inspectSceneLayoutPackageInput, parseServerGameAuthoringSummary } =
  vi.hoisted(() => ({
    inspectSceneLayoutPackageInput: vi.fn(),
    parseServerGameAuthoringSummary: vi.fn(),
  }));

vi.mock(
  "@slotclientengine/gameframeworks/scene-layout-template",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@slotclientengine/gameframeworks/scene-layout-template")
    >()),
    inspectSceneLayoutPackageInput,
    parseServerGameAuthoringSummary,
  }),
);

import {
  importLayoutFile,
  importServerAuthoringFile,
  importTemplateConfigFile,
  serializeTemplateConfig,
} from "../src/io/imports.js";

function templateConfig() {
  return {
    kind: "scene-layout-slot-template",
    version: 1,
    title: "fixture",
    live: {
      serverUrl: "wss://example.com/",
      gamecode: "code",
      clienttype: "web",
      requestTimeoutMs: 1000,
    },
    wager: {
      betOptions: [{ bet: 1, lines: 30 }],
      initialBetIndex: 0,
    },
    round: {
      kind: "slot-round-flow",
      version: 1,
      components: { spin: "spin", wins: ["wins"], valueUpdates: ["values"] },
      cascade: {
        kind: "cascade",
        version: 1,
        components: {
          remove: "remove",
          dropdown: "dropdown",
          refill: "refill",
        },
        symbols: {
          emptyCode: -1,
          removeExcludedSymbols: ["HOLD"],
          dropHeldSymbols: ["HOLD"],
          valueSymbols: ["VALUE"],
          sequentialWinCompanionSymbols: ["HOLD"],
        },
        amount: {
          cashFields: ["cashWin64", "cashWin"],
          coinFields: ["coinWin64", "coinWin"],
          cashUnit: "cents",
        },
      },
      amount: {
        cashFields: ["cashWin64", "cashWin"],
        coinFields: ["coinWin64", "coinWin"],
        cashUnit: "cents",
      },
    },
    presentation: {
      reel: {
        kind: "standard",
        version: 1,
        direction: "forward",
        speedSymbolsPerSecond: 20,
        minimumSpinCycles: 3,
        baseDurationMs: 800,
        startDelayMs: 0,
        stopDelayMs: 100,
        bounceStrength: 0,
      },
      flow: {
        version: 2,
        symbolStates: { normal: "normal", win: "win", remove: "remove" },
        dimmingAlpha: 0.5,
        popup: { enabled: false },
        cascade: {
          emphasisFadeInMs: 100,
          emphasisHoldMs: 1000,
          emphasisFadeOutMs: 100,
          baseFallSeconds: 0.2,
          perRowFallSeconds: 0.05,
          maxFallSeconds: 1,
          settleSeconds: 0.1,
        },
        collect: {
          startPresentationsWithEmphasis: true,
          formatter: { kind: "decimal-cents", prefix: "$" },
          itemOrder: "row-major",
          amountText: {
            yOffsetRatioFromCellCenter: 0.2,
            fontSize: 24,
            fill: "#fff",
            stroke: "#000",
            strokeWidth: 2,
          },
          summary: {
            countDurationSeconds: 0.3,
            startIntervalSeconds: 0.2,
            position: { x: 10, y: 20 },
            textStyle: {
              fontSize: 30,
              fontWeight: 900,
              fill: "#fff",
              stroke: "#000",
              strokeWidth: 2,
            },
          },
        },
      },
    },
  };
}

describe("gameviewer file imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectSceneLayoutPackageInput.mockResolvedValue({
      sha256: "a".repeat(64),
      id: "layout",
      entryCount: 1,
      totalBytes: 3,
      modes: [],
      symbolPackages: [],
      popups: [],
    });
    parseServerGameAuthoringSummary.mockReturnValue({
      gameName: "sample",
      gamecode: "code",
      parameters: [],
      betMethods: [],
    });
  });

  it("accepts only ZIP layout files and delegates strict inspection", async () => {
    await expect(
      importLayoutFile(new File(["bad"], "layout.json")),
    ).rejects.toThrow(/\.zip/);
    const imported = await importLayoutFile(
      new File([new Uint8Array([1, 2, 3])], "layout.ZIP"),
    );
    expect(imported.summary.id).toBe("layout");
    expect(imported.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(inspectSceneLayoutPackageInput).toHaveBeenCalledOnce();
  });

  it("parses UTF-8 JSON and reports extension and syntax failures", async () => {
    await expect(
      importServerAuthoringFile(new File(["{}"], "server.txt")),
    ).rejects.toThrow(/\.json/);
    await expect(
      importServerAuthoringFile(new File(["{"], "server.json")),
    ).rejects.toThrow(/JSON 无效/);

    const imported = await importServerAuthoringFile(
      new File(['{"game":"sample"}'], "server.JSON"),
    );
    expect(imported.summary.gamecode).toBe("code");
    expect(imported.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(parseServerGameAuthoringSummary).toHaveBeenCalledWith({
      game: "sample",
    });
  });

  it("strictly imports and deterministically re-exports runtime config JSON", async () => {
    await expect(
      importTemplateConfigFile(new File(["{}"], "config.txt")),
    ).rejects.toThrow(/\.json/);
    await expect(
      importTemplateConfigFile(new File(["{"], "config.json")),
    ).rejects.toThrow(/运行配置 JSON 无效/);
    await expect(
      importTemplateConfigFile(
        new File(
          [JSON.stringify({ ...templateConfig(), hiddenFallback: true })],
          "config.json",
        ),
      ),
    ).rejects.toThrow(/hiddenFallback is not supported/);

    const parsed = await importTemplateConfigFile(
      new File([JSON.stringify(templateConfig())], "config.JSON"),
    );
    const serialized = serializeTemplateConfig(parsed);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual(parsed);
    expect(serialized).not.toContain("token");
    expect(serialized).toContain('"sequentialWinCompanionSymbols"');
  });
});
