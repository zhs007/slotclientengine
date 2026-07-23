import { describe, expect, it } from "vitest";
import { createDeterministicZip } from "../../browserartifactio/src/index.js";
import { game002LayoutFixture } from "../../rendercore/tests/scene-layout/fixtures.js";
import {
  inspectSceneLayoutPackageInput,
  inspectSceneLayoutTemplateInputs,
  parseSceneLayoutSlotTemplateConfig,
} from "../src/scene-layout-template/index.js";

function config(reelKind: "standard" | "grid-cell" = "standard") {
  return {
    kind: "scene-layout-slot-template",
    version: 1,
    title: "sample",
    live: {
      serverUrl: "wss://example.com/",
      gamecode: "code",
      clienttype: "web",
      requestTimeoutMs: 1000,
    },
    wager: {
      betOptions: [{ bet: 1, lines: 10 }],
      initialBetIndex: 0,
    },
    round: {
      kind: "slot-round-flow",
      version: 1,
      components: { spin: "spin", wins: [] },
      amount: { cashFields: ["cashWin64", "cashWin"], cashUnit: "cents" },
    },
    presentation: {
      reel:
        reelKind === "standard"
          ? {
              kind: "standard",
              version: 1,
              direction: "forward",
              speedSymbolsPerSecond: 20,
              minimumSpinCycles: 3,
              baseDurationMs: 800,
              startDelayMs: 0,
              stopDelayMs: 100,
              bounceStrength: 0,
            }
          : {
              kind: "grid-cell",
              version: 1,
              direction: "forward",
              order: "top-down-left-right",
              timing: {
                startStepMs: 10,
                stopStepMs: 20,
                settleAfterLastStartMs: 500,
                minimumSpinCycles: 3,
                speedSymbolsPerSecond: 20,
              },
              bounceStrength: 0,
            },
      flow: {
        version: 1,
        symbolStates: { normal: "normal", win: "win", remove: "remove" },
        dimmingAlpha: 0.5,
        popup: { enabled: false },
        cascade: {
          emphasisFadeInMs: 100,
          emphasisHoldMs: 100,
          emphasisFadeOutMs: 100,
          baseFallSeconds: 0.2,
          perRowFallSeconds: 0.1,
          maxFallSeconds: 1,
          settleSeconds: 0.1,
        },
      },
    },
  };
}

describe("scene-layout template config", () => {
  it.each(["standard", "grid-cell"] as const)(
    "normalizes a serializable %s profile without callbacks",
    (kind) => {
      const parsed = parseSceneLayoutSlotTemplateConfig(config(kind));
      expect(parsed.presentation.reel.kind).toBe(kind);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(JSON.stringify(parsed)).not.toContain("function");
    },
  );

  it("strictly rejects URL query injection, unknown fields and invalid wager", () => {
    expect(() =>
      parseSceneLayoutSlotTemplateConfig({
        ...config(),
        live: {
          ...config().live,
          serverUrl: "wss://example.com/?token=secret",
        },
      }),
    ).toThrow(/query parameters/);
    expect(() =>
      parseSceneLayoutSlotTemplateConfig({ ...config(), callback: "bad" }),
    ).toThrow(/callback is not supported/);
    expect(() =>
      parseSceneLayoutSlotTemplateConfig({
        ...config(),
        wager: { betOptions: [], initialBetIndex: 0 },
      }),
    ).toThrow(/non-empty array/);
  });

  it("normalizes optional live and wager fields", () => {
    const parsed = parseSceneLayoutSlotTemplateConfig({
      ...config(),
      live: {
        ...config().live,
        jurisdiction: " MT ",
        language: " zh-CN ",
      },
      wager: {
        betOptions: [{ bet: 2, lines: 30, times: 3, label: " Main " }],
        initialBetIndex: 0,
        autonums: 0,
      },
    });
    expect(parsed.live).toMatchObject({
      jurisdiction: "MT",
      language: "zh-CN",
    });
    expect(parsed.wager).toEqual({
      betOptions: [{ bet: 2, lines: 30, times: 3, label: "Main" }],
      initialBetIndex: 0,
      autonums: 0,
    });
  });

  it.each([
    ["root", null, /config must be an object/],
    ["root array", [], /config must be an object/],
    ["kind", { ...config(), kind: "other" }, /config.kind/],
    ["version", { ...config(), version: 2 }, /config.version/],
    ["title", { ...config(), title: " " }, /config.title/],
    [
      "live object",
      { ...config(), live: null },
      /config.live must be an object/,
    ],
    [
      "live unknown",
      { ...config(), live: { ...config().live, token: "secret" } },
      /live.token is not supported/,
    ],
    [
      "URL fragment",
      {
        ...config(),
        live: { ...config().live, serverUrl: "wss://example.com/#secret" },
      },
      /query parameters or a fragment/,
    ],
    [
      "URL credentials",
      {
        ...config(),
        live: {
          ...config().live,
          serverUrl: "wss://user:secret@example.com/",
        },
      },
      /embedded credentials/,
    ],
    [
      "gamecode",
      { ...config(), live: { ...config().live, gamecode: "" } },
      /gamecode must be a non-blank string/,
    ],
    [
      "clienttype",
      { ...config(), live: { ...config().live, clienttype: null } },
      /clienttype must be a non-blank string/,
    ],
    [
      "request timeout",
      { ...config(), live: { ...config().live, requestTimeoutMs: 1.5 } },
      /requestTimeoutMs must be a positive safe integer/,
    ],
    [
      "server protocol",
      {
        ...config(),
        live: { ...config().live, serverUrl: "https://example.com/" },
      },
      /only accepts ws/,
    ],
    ["wager object", { ...config(), wager: null }, /wager must be an object/],
    [
      "bet options type",
      {
        ...config(),
        wager: { betOptions: "invalid", initialBetIndex: 0 },
      },
      /betOptions must be a non-empty array/,
    ],
    [
      "bet option object",
      {
        ...config(),
        wager: { betOptions: [null], initialBetIndex: 0 },
      },
      /betOptions\[0\] must be an object/,
    ],
    [
      "bet",
      {
        ...config(),
        wager: { betOptions: [{ bet: 0, lines: 10 }], initialBetIndex: 0 },
      },
      /\.bet must be a positive finite number/,
    ],
    [
      "bet type",
      {
        ...config(),
        wager: { betOptions: [{ bet: "1", lines: 10 }], initialBetIndex: 0 },
      },
      /\.bet must be a positive finite number/,
    ],
    [
      "lines",
      {
        ...config(),
        wager: { betOptions: [{ bet: 1, lines: -1 }], initialBetIndex: 0 },
      },
      /\.lines must be a positive safe integer/,
    ],
    [
      "times",
      {
        ...config(),
        wager: {
          betOptions: [{ bet: 1, lines: 10, times: Number.NaN }],
          initialBetIndex: 0,
        },
      },
      /\.times must be a positive finite number/,
    ],
    [
      "label",
      {
        ...config(),
        wager: {
          betOptions: [{ bet: 1, lines: 10, label: " " }],
          initialBetIndex: 0,
        },
      },
      /\.label must be a non-blank string/,
    ],
    [
      "initial index negative",
      {
        ...config(),
        wager: { betOptions: [{ bet: 1, lines: 10 }], initialBetIndex: -1 },
      },
      /initialBetIndex must be a non-negative safe integer/,
    ],
    [
      "initial index type",
      {
        ...config(),
        wager: {
          betOptions: [{ bet: 1, lines: 10 }],
          initialBetIndex: "0",
        },
      },
      /initialBetIndex must be a non-negative safe integer/,
    ],
    [
      "initial index bounds",
      {
        ...config(),
        wager: { betOptions: [{ bet: 1, lines: 10 }], initialBetIndex: 1 },
      },
      /outside betOptions bounds/,
    ],
    [
      "autonums",
      {
        ...config(),
        wager: {
          betOptions: [{ bet: 1, lines: 10 }],
          initialBetIndex: 0,
          autonums: -1,
        },
      },
      /autonums must be a non-negative safe integer/,
    ],
  ])("rejects invalid %s", (_label, input, message) => {
    expect(() => parseSceneLayoutSlotTemplateConfig(input)).toThrow(message);
  });

  it("inspects a canonical ZIP and binds its immutable hash to readiness", async () => {
    const bytes = createDeterministicZip(
      new Map([
        [
          "layout.manifest.json",
          new TextEncoder().encode(`${JSON.stringify(game002LayoutFixture)}\n`),
        ],
        ["assets/bg.png", new Uint8Array([1, 2, 3])],
      ]),
    );
    const layout = await inspectSceneLayoutPackageInput({
      layoutZipBytes: bytes,
    });
    expect(layout).toMatchObject({
      id: "game002",
      entryCount: 2,
      modes: [],
      popups: [],
    });
    expect(layout.sha256).toMatch(/^[0-9a-f]{64}$/u);

    await expect(
      inspectSceneLayoutTemplateInputs({
        layoutZipBytes: bytes,
        expectedLayoutSha256: layout.sha256.toUpperCase(),
        config: config("standard"),
      }),
    ).rejects.toThrow(/symbol package binding/);
    await expect(
      inspectSceneLayoutTemplateInputs({
        layoutZipBytes: bytes,
        expectedLayoutSha256: "f".repeat(64),
        config: config("standard"),
      }),
    ).rejects.toThrow(/hash mismatch/);
    await expect(
      inspectSceneLayoutTemplateInputs({
        layoutZipBytes: bytes,
        expectedLayoutSha256: "invalid",
        config: config("standard"),
      }),
    ).rejects.toThrow(/64-character SHA-256/);
  });
});
