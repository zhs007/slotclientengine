import { describe, expect, it } from "vitest";
import type { SlotRoundFlowProfileV1 } from "@slotclientengine/logiccore";
import {
  getSlotReelPresentationCapabilities,
  parseSlotTemplatePresentationProfile,
  validateSlotTemplateCompatibility,
  type GridCellReelPresentationProfileV1,
  type SceneLayoutManifestV1,
  type SceneLayoutPackageResource,
} from "../../src/scene-layout/index.js";

const roundBase = {
  kind: "slot-round-flow",
  version: 1,
  components: { spin: "spin", wins: ["wins"] },
  amount: { cashFields: ["cashWin64", "cashWin"], cashUnit: "cents" },
} as const satisfies SlotRoundFlowProfileV1;

const roundCascade = {
  ...roundBase,
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
      removeExcludedSymbols: [],
      dropHeldSymbols: [],
      valueSymbols: [],
    },
    amount: { cashFields: ["cashWin64", "cashWin"], cashUnit: "cents" },
  },
} as const satisfies SlotRoundFlowProfileV1;

const sharedFlow = {
  version: 1,
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
};

function presentation(kind: "standard" | "grid-cell") {
  return parseSlotTemplatePresentationProfile({
    reel:
      kind === "standard"
        ? {
            kind,
            version: 1,
            direction: "forward",
            speedSymbolsPerSecond: 20,
            minimumSpinCycles: 3,
            baseDurationMs: 800,
            startDelayMs: 50,
            stopDelayMs: 100,
            bounceStrength: 0,
          }
        : {
            kind,
            version: 1,
            direction: "forward",
            order: "top-down-left-right",
            timing: {
              startStepMs: 16,
              stopStepMs: 100,
              settleAfterLastStartMs: 800,
              minimumSpinCycles: 3,
              speedSymbolsPerSecond: 20,
            },
            bounceStrength: 0,
          },
    flow: sharedFlow,
  });
}

function gridReel(): GridCellReelPresentationProfileV1 {
  return presentation("grid-cell").reel as GridCellReelPresentationProfileV1;
}

function manifest(renderMode: "standard" | "grid-cell"): SceneLayoutManifestV1 {
  return {
    version: 1,
    kind: "scene-layout",
    id: "fixture",
    adaptation: {
      mode: "maximized-focus",
      artSize: { width: 100, height: 100 },
      focusRect: { x: 0, y: 0, width: 100, height: 100 },
      backgroundNode: "background",
    },
    nodes: [
      {
        id: "background",
        order: 0,
        resource: {
          kind: "image",
          path: "assets/background.png",
          size: { width: 100, height: 100 },
        },
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
    ],
    reels: {
      main: {
        columns: 3,
        rows: 3,
        cellSize: { width: 10, height: 10 },
        gap: { x: 0, y: 0 },
        placements: { default: { x: 0, y: 0 } },
      },
    },
    symbolPackage: {
      manifest: "dependencies/symbols/fixture/symbols.package.json",
      reel: "main",
      reelSet: "public-reels",
      renderMode,
    },
  };
}

describe("slot template presentation compatibility", () => {
  it.each([
    ["standard", roundBase],
    ["standard", roundCascade],
    ["grid-cell", roundBase],
    ["grid-cell", roundCascade],
  ] as const)("accepts orthogonal %s reel and cascade=%s", (kind, round) => {
    const snapshot = validateSlotTemplateCompatibility({
      roundFlow: round,
      presentation: presentation(kind),
      packageResource: { manifest: manifest(kind) },
    });
    expect(snapshot.reelKind).toBe(kind);
    expect(snapshot.cascadeEnabled).toBe(
      "cascade" in round && Boolean(round.cascade),
    );
    expect(snapshot.capabilities).toMatchObject({
      removeOccurrences: true,
      dropdownOccurrences: true,
      refillOccurrences: true,
    });
  });

  it("rejects renderMode mismatch before runtime mutation", () => {
    expect(() =>
      validateSlotTemplateCompatibility({
        roundFlow: roundBase,
        presentation: presentation("standard"),
        packageResource: { manifest: manifest("grid-cell") },
      }),
    ).toThrow(/incompatible/);
  });

  it("strictly rejects unknown motion fields and invalid ranges", () => {
    expect(() =>
      parseSlotTemplatePresentationProfile({
        reel: {
          ...presentation("standard").reel,
          hiddenFallback: true,
        },
        flow: sharedFlow,
      }),
    ).toThrow(/hiddenFallback is not supported/);
    expect(() =>
      parseSlotTemplatePresentationProfile({
        reel: {
          ...presentation("standard").reel,
          bounceStrength: -1,
        },
        flow: sharedFlow,
      }),
    ).toThrow(/must be non-negative/);
  });

  it.each([
    ["root must be an object", null, /presentation must be an object/],
    [
      "unknown reel kind",
      { reel: { kind: "columns" }, flow: sharedFlow },
      /kind must be/,
    ],
    [
      "standard version",
      {
        reel: { ...presentation("standard").reel, version: 2 },
        flow: sharedFlow,
      },
      /version must be 1/,
    ],
    [
      "standard direction",
      {
        reel: { ...presentation("standard").reel, direction: "sideways" },
        flow: sharedFlow,
      },
      /direction must be/,
    ],
    [
      "standard positive speed",
      {
        reel: {
          ...presentation("standard").reel,
          speedSymbolsPerSecond: 0,
        },
        flow: sharedFlow,
      },
      /must be positive/,
    ],
    [
      "standard safe integer cycles",
      {
        reel: { ...presentation("standard").reel, minimumSpinCycles: 1.5 },
        flow: sharedFlow,
      },
      /positive safe integer/,
    ],
    [
      "grid order",
      {
        reel: {
          ...presentation("grid-cell").reel,
          order: "left-right",
        },
        flow: sharedFlow,
      },
      /top-down-left-right/,
    ],
    [
      "grid timing object",
      {
        reel: { ...presentation("grid-cell").reel, timing: null },
        flow: sharedFlow,
      },
      /timing must be an object/,
    ],
    [
      "grid timing unknown",
      {
        reel: {
          ...presentation("grid-cell").reel,
          timing: {
            ...gridReel().timing,
            fallbackMs: 1,
          },
        },
        flow: sharedFlow,
      },
      /fallbackMs is not supported/,
    ],
    [
      "grid negative start",
      {
        reel: {
          ...presentation("grid-cell").reel,
          timing: {
            ...gridReel().timing,
            startStepMs: -1,
          },
        },
        flow: sharedFlow,
      },
      /must be non-negative/,
    ],
    [
      "flow version",
      {
        reel: presentation("standard").reel,
        flow: { ...sharedFlow, version: 2 },
      },
      /flow.version must be 1/,
    ],
    [
      "flow unknown",
      {
        reel: presentation("standard").reel,
        flow: { ...sharedFlow, fallback: true },
      },
      /fallback is not supported/,
    ],
    [
      "popup boolean",
      {
        reel: presentation("standard").reel,
        flow: { ...sharedFlow, popup: { enabled: "yes" } },
      },
      /enabled must be a boolean/,
    ],
    [
      "finite dimming",
      {
        reel: presentation("standard").reel,
        flow: { ...sharedFlow, dimmingAlpha: Number.NaN },
      },
      /finite number/,
    ],
    [
      "bounded dimming",
      {
        reel: presentation("standard").reel,
        flow: { ...sharedFlow, dimmingAlpha: 1.1 },
      },
      /between 0 and 1/,
    ],
    [
      "non-blank state",
      {
        reel: presentation("standard").reel,
        flow: {
          ...sharedFlow,
          symbolStates: { ...sharedFlow.symbolStates, win: " " },
        },
      },
      /non-blank string/,
    ],
    [
      "positive fall",
      {
        reel: presentation("standard").reel,
        flow: {
          ...sharedFlow,
          cascade: { ...sharedFlow.cascade, baseFallSeconds: 0 },
        },
      },
      /must be positive/,
    ],
  ])("rejects invalid %s", (_label, input, message) => {
    expect(() => parseSlotTemplatePresentationProfile(input)).toThrow(message);
  });

  it("rejects an unsupported capability kind", () => {
    expect(() =>
      getSlotReelPresentationCapabilities({
        kind: "unknown",
      } as never),
    ).toThrow(/Unsupported reel presentation kind/);
  });

  it("requires a reel and an initial symbol binding", () => {
    const noReel = manifest("standard");
    delete (noReel.reels as { main?: unknown }).main;
    expect(() =>
      validateSlotTemplateCompatibility({
        roundFlow: roundBase,
        presentation: presentation("standard"),
        packageResource: { manifest: noReel },
      }),
    ).toThrow(/reels.main/);

    const noBinding = manifest("standard");
    delete (noBinding as { symbolPackage?: unknown }).symbolPackage;
    expect(() =>
      validateSlotTemplateCompatibility({
        roundFlow: roundBase,
        presentation: presentation("standard"),
        packageResource: { manifest: noBinding },
      }),
    ).toThrow(/symbol package binding/);
  });

  it("requires an explicitly bound popup when popup presentation is enabled", () => {
    const enabled = parseSlotTemplatePresentationProfile({
      reel: presentation("standard").reel,
      flow: { ...sharedFlow, popup: { enabled: true } },
    });
    expect(() =>
      validateSlotTemplateCompatibility({
        roundFlow: roundBase,
        presentation: enabled,
        packageResource: { manifest: manifest("standard") },
      }),
    ).toThrow(/no explicit award-celebration popup/);
  });

  it("validates cascade symbols against loaded package ownership", () => {
    const resource = {
      manifest: manifest("standard"),
      symbolPackage: {
        displaySymbols: ["A", "VALUE"],
        valuePresentationResources: {},
      },
      symbolPackages: {},
    } as unknown as SceneLayoutPackageResource;
    const unknownSymbol = {
      ...roundCascade,
      cascade: {
        ...roundCascade.cascade,
        symbols: {
          ...roundCascade.cascade.symbols,
          removeExcludedSymbols: ["MISSING"],
        },
      },
    } satisfies SlotRoundFlowProfileV1;
    expect(() =>
      validateSlotTemplateCompatibility({
        roundFlow: unknownSymbol,
        presentation: presentation("standard"),
        packageResource: resource,
      }),
    ).toThrow(/not in the active symbol package/);

    const missingValueBinding = {
      ...roundCascade,
      cascade: {
        ...roundCascade.cascade,
        symbols: {
          ...roundCascade.cascade.symbols,
          valueSymbols: ["VALUE"],
        },
      },
    } satisfies SlotRoundFlowProfileV1;
    expect(() =>
      validateSlotTemplateCompatibility({
        roundFlow: missingValueBinding,
        presentation: presentation("standard"),
        packageResource: resource,
      }),
    ).toThrow(/no manifest-owned value presentation binding/);
  });

  it("resolves plural per-mode bindings, popup ownership, and value resources", () => {
    const binding = {
      manifest: "dependencies/symbols/fixture/symbols.package.json",
      reel: "main",
      reelSet: "public-reels",
      renderMode: "grid-cell",
    } as const;
    const pluralManifest = {
      ...manifest("grid-cell"),
      symbolPackage: undefined,
      symbolPackages: { primary: binding },
      gameModes: {
        initialMode: "base",
        modes: [
          {
            id: "base",
            backgroundNode: "background",
            symbolPackage: "primary",
            awardCelebrationPopup: "popup",
          },
        ],
      },
    } as unknown as SceneLayoutManifestV1;
    const symbolResource = {
      displaySymbols: ["VALUE"],
      valuePresentationResources: { VALUE: {} },
    };
    const resource = {
      manifest: pluralManifest,
      symbolPackages: { primary: symbolResource },
    } as unknown as SceneLayoutPackageResource;
    const withValue = {
      ...roundCascade,
      cascade: {
        ...roundCascade.cascade,
        symbols: {
          ...roundCascade.cascade.symbols,
          valueSymbols: ["VALUE"],
        },
      },
    } satisfies SlotRoundFlowProfileV1;
    const popupPresentation = parseSlotTemplatePresentationProfile({
      reel: presentation("grid-cell").reel,
      flow: { ...sharedFlow, popup: { enabled: true } },
    });

    expect(
      validateSlotTemplateCompatibility({
        roundFlow: withValue,
        presentation: popupPresentation,
        packageResource: resource,
      }),
    ).toMatchObject({
      initialMode: "base",
      popupAvailable: true,
      reelKind: "grid-cell",
    });
  });
});
