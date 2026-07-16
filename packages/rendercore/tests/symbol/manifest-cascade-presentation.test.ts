import { describe, expect, it } from "vitest";
import {
  createSymbolCascadeWinPresentationMapFromManifest,
  createSymbolStatePresetFromManifest,
  parseSymbolStateTextureManifest,
} from "../../src/index.js";

describe("symbol manifest cascade presentation", () => {
  it("derives additional state definitions and validates generic choreography", () => {
    const manifest = createManifest();
    const parsed = parseSymbolStateTextureManifest(manifest);
    expect(parsed.statePreset.states.slice(-4)).toEqual([
      { id: "burst", phase: "once", playback: "once" },
      { id: "hover", phase: "stable", playback: "loop" },
      { id: "take", phase: "once", playback: "once" },
      { id: "fade", phase: "once", playback: "once" },
    ]);
    expect(createSymbolStatePresetFromManifest(manifest)).toEqual(
      parsed.statePreset,
    );
    expect(
      createSymbolCascadeWinPresentationMapFromManifest({ manifest }),
    ).toMatchObject({
      A: {
        order: 2,
        playback: {
          mode: "sequentialCollect",
          startState: "burst",
          loopState: "hover",
          collectState: "take",
          removeState: "fade",
        },
        summary: { mode: "itemAmount" },
      },
    });
  });

  it("rejects duplicate, contradictory and incompatible presentation states", () => {
    const duplicate = createManifest();
    duplicate.settings.additionalStateDefinitions[0].id = "win";
    expect(() => parseSymbolStateTextureManifest(duplicate)).toThrow(
      /duplicates or overrides/,
    );

    const contradictory = createManifest();
    contradictory.settings.additionalStateDefinitions[0].playback = "loop";
    expect(() => parseSymbolStateTextureManifest(contradictory)).toThrow(
      /once\/once or stable\/loop/,
    );

    const missingCapability = createManifest();
    delete missingCapability.symbols.A.animations.take;
    expect(() => parseSymbolStateTextureManifest(missingCapability)).toThrow(
      /requires symbol animation capability/,
    );

    const nonLoopingStableState = createManifest();
    nonLoopingStableState.symbols.A.animations.hover.playback.loop = false;
    expect(() =>
      parseSymbolStateTextureManifest(nonLoopingStableState),
    ).toThrow(/must be true for loop state/);

    const incompatibleSummary = createManifest();
    incompatibleSummary.symbols.A.cascadeWinPresentation.summary.mode =
      "groupAmount";
    expect(() => parseSymbolStateTextureManifest(incompatibleSummary)).toThrow(
      /incompatible/,
    );

    const reusedState = createManifest();
    reusedState.symbols.A.cascadeWinPresentation.playback.collectState =
      "burst";
    expect(() => parseSymbolStateTextureManifest(reusedState)).toThrow(
      /must be distinct/,
    );
  });
});

function createManifest(): any {
  const animation = (animationName: string, loop: boolean) => ({
    kind: "spine",
    skeleton: "./A.json",
    atlas: "./A.atlas",
    texture: "./A.png",
    playback: { mode: "animation", animationName, loop },
  });
  return {
    version: 1,
    states: [],
    settings: {
      additionalStateDefinitions: [
        { id: "burst", phase: "once", playback: "once" },
        { id: "hover", phase: "stable", playback: "loop" },
        { id: "take", phase: "once", playback: "once" },
        { id: "fade", phase: "once", playback: "once" },
      ],
    },
    symbols: {
      A: {
        normal: "./A.png",
        animations: {
          burst: animation("Burst", false),
          hover: animation("Hover", true),
          take: animation("Take", false),
          fade: animation("Fade", false),
        },
        cascadeWinPresentation: {
          order: 2,
          playback: {
            mode: "sequentialCollect",
            startState: "burst",
            loopState: "hover",
            collectState: "take",
            removeState: "fade",
          },
          summary: { mode: "itemAmount" },
        },
      },
    },
  };
}
