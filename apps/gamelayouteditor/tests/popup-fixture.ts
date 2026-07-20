export function popupFiles() {
  const characters = [..."$,.0123456789"];
  const glyphs = Object.fromEntries(
    characters.map((character, index) => [
      character,
      {
        path: `assets/g${index}.png`,
        size: { width: 1, height: 1 },
        offset: { x: 0, y: 0 },
      },
    ]),
  );
  const amountLayer = {
    id: "amount",
    kind: "image-string",
    order: 0,
    resource: "amount",
    binding: "win-amount",
    anchor: { x: 0.5, y: 0.5 },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const popup = {
    version: 1,
    kind: "popup",
    id: "fixture-popup",
    type: "award-celebration",
    designViewport: { width: 100, height: 100 },
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
    },
    awardCelebration: {
      base: { countDurationSeconds: 1, layers: [amountLayer] },
      standard: { countDurationSeconds: 1, layers: [amountLayer] },
      celebrationTiers: [
        {
          id: "bigwin",
          thresholdMultiplier: 15,
          countDurationSeconds: 1,
          layers: [amountLayer],
        },
        {
          id: "superwin",
          thresholdMultiplier: 30,
          countDurationSeconds: 1,
          layers: [amountLayer],
        },
        {
          id: "megawin",
          thresholdMultiplier: 50,
          countDurationSeconds: 1,
          layers: [amountLayer],
        },
      ],
    },
  };
  const nested = {
    version: 1,
    kind: "image-string",
    id: "amount",
    metrics: { lineHeight: 1, letterSpacing: 0 },
    glyphs,
    fixedAdvanceGroups: [],
  };
  const files = new Map<string, Uint8Array>([
    ["popup.manifest.json", new TextEncoder().encode(JSON.stringify(popup))],
    [
      "dependencies/image-strings/amount/image-string.manifest.json",
      new TextEncoder().encode(JSON.stringify(nested)),
    ],
  ]);
  characters.forEach((_, index) =>
    files.set(
      `dependencies/image-strings/amount/assets/g${index}.png`,
      new Uint8Array([index]),
    ),
  );
  return files;
}
