import { describe, expect, it } from "vitest";
import {
  collectAudioAssetPaths,
  compileAudioCueTable,
  compileAudioEffectRoutes,
  parseAudioCatalogManifestV1,
  parseAudioEffectBindingV1,
  parseAudioEventTrackBindingV1,
  rewriteAudioAssetPaths,
} from "../src/data/index.js";

const effect = parseAudioEffectBindingV1({
  name: "coin",
  asset: { sources: [{ path: "coin.mp3", mediaType: "audio/mpeg" }] },
  playback: "loop",
  offsetSeconds: 0.25,
  voices: { maxConcurrent: 1, overflow: "reject" },
  bgm: {
    kind: "duck",
    targetGain: 0.25,
    attackSeconds: 0.1,
    releaseSeconds: 0.2,
  },
});

describe("audio data", () => {
  it("strictly parses catalogs and rewrites only typed paths", () => {
    const catalog = parseAudioCatalogManifestV1({
      version: 1,
      effects: [effect],
      music: [
        {
          name: "base",
          asset: { sources: [{ path: "base.ogg", mediaType: "audio/ogg" }] },
          loop: true,
          fadeOutSeconds: 0.5,
          fadeInSeconds: 0.75,
        },
      ],
      programmaticEffects: ["coin"],
    });
    expect(collectAudioAssetPaths(catalog)).toEqual(["base.ogg", "coin.mp3"]);
    const rewritten = rewriteAudioAssetPaths(
      catalog,
      new Map([["coin.mp3", "coin-2.mp3"]]),
    );
    expect(collectAudioAssetPaths(rewritten)).toEqual([
      "base.ogg",
      "coin-2.mp3",
    ]);
    expect(Object.isFrozen(rewritten.effects[0])).toBe(true);
  });

  it("creates global routes only at composition", () => {
    expect(
      compileAudioEffectRoutes([{ owner: "award", effects: [effect] }])[0],
    ).toMatchObject({
      route: "award.coin",
      owner: "award",
      localName: "coin",
    });
    expect(() =>
      compileAudioEffectRoutes([
        { owner: "award", effects: [effect] },
        { owner: "award", effects: [effect] },
      ]),
    ).toThrow(/duplicate audio effect route/u);
  });

  it("sorts cues deterministically and rejects invalid focus", () => {
    expect(
      compileAudioCueTable([
        { id: "later", effect: "coin", offsetSeconds: 1 },
        { id: "first", effect: "coin", offsetSeconds: 0 },
      ]).cues.map(({ id }) => id),
    ).toEqual(["first", "later"]);
    expect(() =>
      parseAudioEffectBindingV1({
        ...effect,
        bgm: {
          kind: "duck",
          targetGain: 2,
          attackSeconds: 0,
          releaseSeconds: 0,
        },
      }),
    ).toThrow(/targetGain/u);
  });

  it("strictly parses generic event tracks and loop focus rules", () => {
    expect(
      parseAudioEventTrackBindingV1({
        name: "big-win",
        asset: {
          sources: [{ path: "big-win.mp3", mediaType: "audio/mpeg" }],
        },
        category: "effect",
        playback: "once",
        voices: { maxConcurrent: 2, overflow: "restart-oldest" },
        focus: {
          bgm: { targetGain: 0.5 },
          effects: { scope: "all", targetGain: 0 },
        },
      }),
    ).toMatchObject({
      category: "effect",
      focus: {
        bgm: { targetGain: 0.5 },
        effects: { scope: "all", targetGain: 0 },
      },
    });
    expect(() =>
      parseAudioEventTrackBindingV1({
        name: "loop",
        asset: {
          sources: [{ path: "loop.mp3", mediaType: "audio/mpeg" }],
        },
        category: "music",
        playback: "loop",
        voices: { maxConcurrent: 1, overflow: "restart-oldest" },
        focus: { bgm: { targetGain: 0.5 } },
      }),
    ).toThrow(/focus must be empty/u);
  });
});
