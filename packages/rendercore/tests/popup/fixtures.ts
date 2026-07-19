import type { PopupManifestV1 } from "../../src/popup/index.js";

const digest = "0".repeat(64);
const amountLayer = (scale = 1) => ({
  id: "amount",
  kind: "image-string" as const,
  order: 10,
  resource: "amount",
  binding: "win-amount" as const,
  visibleSegments: ["start", "loop", "end"] as const,
  anchor: { x: 0.5, y: 0.5 },
  transform: { x: 0, y: 100, scale },
});
const vniLayer = (id: string, resource: string) => ({
  id,
  kind: "vni" as const,
  order: 0,
  resource,
  transform: { x: 0, y: 0, scale: 1 },
  playback: {
    mode: "segmented" as const,
    loopStartTime: 1,
    loopEndTime: 2.5,
    keepParticlesAlive: true,
  },
});

export function popupFixture(): PopupManifestV1 {
  return {
    version: 1,
    kind: "popup",
    id: "game003-win-celebration",
    type: "award-celebration",
    designViewport: { width: 900, height: 1600 },
    amountFormat: {
      rawScale: 100,
      fractionDigits: 2,
      useGrouping: true,
      groupSeparator: ",",
      decimalSeparator: ".",
      prefix: "$",
      suffix: "",
      rounding: "floor",
    },
    resources: {
      amount: {
        kind: "image-string",
        manifest:
          "dependencies/image-strings/amount/image-string.manifest.json",
      },
      bigwin: { kind: "vni", project: `assets/${digest}.json` },
      superwin: { kind: "vni", project: `assets/${"1".repeat(64)}.json` },
      megawin: { kind: "vni", project: `assets/${"2".repeat(64)}.json` },
    },
    awardCelebration: {
      base: { countDurationSeconds: 1.5, layers: [amountLayer()] },
      standard: { countDurationSeconds: 3, layers: [amountLayer(1.2)] },
      celebrationTiers: [
        {
          id: "bigwin",
          thresholdMultiplier: 15,
          countDurationSeconds: 2.9,
          layers: [vniLayer("effect", "bigwin"), amountLayer(1.5)],
        },
        {
          id: "superwin",
          thresholdMultiplier: 30,
          countDurationSeconds: 2.9,
          layers: [vniLayer("effect", "superwin"), amountLayer(1.5)],
        },
        {
          id: "megawin",
          thresholdMultiplier: 50,
          countDurationSeconds: 2.9,
          layers: [vniLayer("effect", "megawin"), amountLayer(1.5)],
        },
      ],
    },
  };
}
