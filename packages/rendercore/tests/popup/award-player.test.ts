import { Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createAwardCelebrationPlayer,
  type AwardCelebrationPopupManifestV1,
  type PopupLayerRuntime,
  type PopupPackageResource,
} from "../../src/popup/index.js";
import { popupFixture } from "./fixtures.js";

describe("award celebration player", () => {
  it("rejects non-award packages and shares concurrent initialization", async () => {
    expect(() =>
      createAwardCelebrationPlayer({
        resource: {
          manifest: { type: "spine" } as never,
          resources: {},
          destroy() {},
        },
      }),
    ).toThrow(/requires an award-celebration/);
    const player = createAwardCelebrationPlayer({
      resource: fakeResource(),
      layerFactory: ({ layer }) => fakeLayer(layer.kind === "vni"),
    });
    const initializing = player.init();
    expect(player.init()).toBe(initializing);
    await initializing;
    expect(player.update(0).phase).toBe("idle");
    player.destroy();

    const wrongAmount = fakeResource();
    (wrongAmount.resources as any).amount = {
      kind: "image",
      texture: Texture.EMPTY,
    };
    const mismatched = createAwardCelebrationPlayer({ resource: wrongAmount });
    await expect(mismatched.init()).rejects.toThrow(/amount layer\/resource/);

    const noRebind = createAwardCelebrationPlayer({
      resource: fakeResource(),
      layerFactory: ({ layer }) => ({
        ...fakeLayer(layer.kind === "vni"),
        rebindAmountLayer: undefined,
      }),
    });
    await expect(noRebind.init()).rejects.toThrow(
      /must support resource rebinding/,
    );

    const badParent = fakeResource();
    const bigwin = badParent.manifest.awardCelebration.celebrationTiers[0];
    const effect = bigwin.layers.find(({ kind }) => kind === "vni")!;
    const amount = bigwin.layers.find(({ kind }) => kind === "image-string")!;
    (amount as any).parent = {
      kind: "vni-text-layer",
      vniLayerId: effect.id,
      textLayerId: "amount-text",
    };
    const unavailableMount = createAwardCelebrationPlayer({
      resource: badParent,
      layerFactory: ({ layer }) => fakeLayer(layer.kind === "vni"),
    });
    await expect(unavailableMount.init()).rejects.toThrow(
      /parent runtime unavailable/,
    );
  });

  it("preserves verified click tiers, awaiting-dismiss, ending drain, and cleanup", async () => {
    const resource = fakeResource();
    const createdKinds: string[] = [];
    const layerContainers = new Map<string, Container>();
    let amountContainer: Container | null = null;
    let amountRebinds = 0;
    const mega = resource.manifest.awardCelebration.celebrationTiers.find(
      (tier) => tier.id === "megawin",
    )!;
    (mega.layers[0] as { order: number }).order = 1;
    (mega.layers[1] as { order: number }).order = 0;
    const player = createAwardCelebrationPlayer({
      resource,
      layerFactory: ({ layer, tierId }) => {
        createdKinds.push(layer.kind);
        const runtime = fakeLayer(layer.kind === "vni", () => {
          amountRebinds += 1;
        });
        if (layer.kind === "image-string") amountContainer = runtime.container;
        else layerContainers.set(`${tierId}:${layer.kind}`, runtime.container);
        return runtime;
      },
    });
    await player.init();
    expect(createdKinds.filter((kind) => kind === "image-string")).toHaveLength(
      1,
    );
    player.start({ betAmountRaw: 100, winAmountRaw: 5000 });
    expect(player.getSnapshot()).toMatchObject({
      phase: "counting",
      activeTierId: "base",
      displayedAmountRaw: 0,
    });
    player.requestAdvance();
    expect(player.getSnapshot().activeTierId).toBe("bigwin");
    expect((player.container.children[2] as Container).children).toEqual([
      layerContainers.get("bigwin:vni"),
      amountContainer,
    ]);
    player.update(1);
    player.requestAdvance();
    expect(player.getSnapshot().activeTierId).toBe("superwin");
    player.update(1);
    player.requestAdvance();
    expect(player.getSnapshot().activeTierId).toBe("megawin");
    expect((player.container.children[4] as Container).children).toEqual([
      amountContainer,
      layerContainers.get("megawin:vni"),
    ]);
    expect(amountRebinds).toBe(4);
    player.requestAdvance();
    expect(player.getSnapshot()).toMatchObject({
      phase: "awaiting-dismiss",
      displayedAmountRaw: 5000,
    });
    player.requestAdvance();
    expect(player.getSnapshot().phase).toBe("dismissing");
    player.update(1);
    expect(player.getSnapshot().phase).toBe("complete");
    player.start({ betAmountRaw: 100, winAmountRaw: 50 });
    player.requestAdvance();
    expect(player.getSnapshot()).toMatchObject({
      phase: "awaiting-dismiss",
      displayedAmountRaw: 50,
    });
    player.dismissImmediately();
    expect(player.isPlaying()).toBe(false);
    player.destroy();
    expect(() => player.start({ betAmountRaw: 100, winAmountRaw: 1 })).toThrow(
      /destroyed/,
    );
  });

  it("runs default image/image-string layers and deterministic no-animation boundaries", async () => {
    const resource = staticResource();
    const player = createAwardCelebrationPlayer({ resource });
    await player.init();
    await player.init();
    expect(() => player.update(-1)).toThrow(/deltaSeconds/);
    player.start({ betAmountRaw: 100, winAmountRaw: 0 });
    expect(player.getSnapshot().phase).toBe("complete");
    player.requestAdvance();
    player.requestDismiss();
    player.dismissImmediately();
    player.start({ betAmountRaw: 100, winAmountRaw: 101 });
    expect(() => player.start({ betAmountRaw: 100, winAmountRaw: 1 })).toThrow(
      /already playing/,
    );
    player.update(2);
    expect(player.getSnapshot().activeTierId).toBe("standard");
    player.update(2);
    expect(player.getSnapshot()).toMatchObject({
      phase: "awaiting-dismiss",
      displayedAmountRaw: 101,
      formattedAmount: "$1.01",
    });
    player.requestDismiss();
    player.update(0);
    expect(player.getSnapshot().phase).toBe("complete");
    player.start({ betAmountRaw: 100, winAmountRaw: 50 });
    player.requestDismiss();
    expect(player.getSnapshot().phase).toBe("awaiting-dismiss");
    player.requestDismiss();
    expect(player.getSnapshot().phase).toBe("dismissing");
    player.update(0);
    player.destroy();
  });

  it("mounts the shared ImgNumber into the configured VNI text layer", async () => {
    const resource = fakeResource();
    const bigwin = resource.manifest.awardCelebration.celebrationTiers.find(
      (tier) => tier.id === "bigwin",
    )!;
    const amount = bigwin.layers.find(
      (
        layer,
      ): layer is Extract<
        (typeof bigwin.layers)[number],
        { kind: "image-string" }
      > => layer.kind === "image-string",
    )!;
    (amount as { parent: unknown }).parent = {
      kind: "vni-text-layer",
      vniLayerId: "effect",
      textLayerId: "amount-text",
    };
    const mounts: Container[] = [];
    const disposes = vi.fn();
    let amountContainer: Container | undefined;
    const player = createAwardCelebrationPlayer({
      resource,
      layerFactory: ({ layer }) => {
        const runtime = fakeLayer(layer.kind === "vni");
        if (layer.kind === "image-string") amountContainer = runtime.container;
        if (layer.kind !== "vni") return runtime;
        return {
          ...runtime,
          mountNodeToTextLayer({ textLayerId, node }) {
            expect(textLayerId).toBe("amount-text");
            mounts.push(node);
            return disposes;
          },
        };
      },
    });
    await player.init();
    expect(mounts).toHaveLength(1);
    player.start({ betAmountRaw: 100, winAmountRaw: 2000 });
    player.requestAdvance();
    expect(mounts[0]!.children).toEqual([amountContainer]);
    player.destroy();
    expect(disposes).toHaveBeenCalledOnce();
  });

  it("allows the host runtime to override preview-only amount formatting", async () => {
    const player = createAwardCelebrationPlayer({
      resource: fakeResource(),
      formatAmount: (amountRaw) => (amountRaw / 100).toFixed(2),
      layerFactory: ({ layer }) =>
        fakeLayer(layer.kind === "vni", () => undefined),
    });
    await player.init();
    player.start({ betAmountRaw: 100, winAmountRaw: 123 });
    player.requestDismiss();
    expect(player.getSnapshot().formattedAmount).toBe("1.23");
    player.destroy();
  });

  it("exposes the win amount by name and index with persistent overrides", async () => {
    const writes: string[] = [];
    const player = createAwardCelebrationPlayer({
      resource: fakeResource(),
      layerFactory: ({ layer }) => {
        const runtime = fakeLayer(layer.kind === "vni");
        return layer.kind === "image-string"
          ? { ...runtime, updateAmount: (text: string) => writes.push(text) }
          : runtime;
      },
    });
    await player.init();
    expect(player.imageStringNodes).toHaveLength(1);
    expect(player.textNodes).toHaveLength(0);
    const byName = player.getImageStringNode("win-amount");
    expect(player.getImageStringNode(0)).toBe(byName);
    byName.setText("999");
    player.start({ betAmountRaw: 100, winAmountRaw: 123 });
    player.requestDismiss();
    expect(player.getSnapshot().formattedAmount).toBe("999");
    byName.resetText();
    expect(player.getSnapshot().formattedAmount).toBe("$1.23");
    expect(() => player.getImageStringNode(1)).toThrow(/out of range/);
    player.destroy();
    expect(() => byName.setText("1")).toThrow(/destroyed/);
    expect(writes).toContain("999");
  });

  it("rebinds styled text and manual ImgNumber variants by logical name", async () => {
    const resource = fakeResource();
    const manifest = resource.manifest as any;
    manifest.resources.title = { kind: "font", path: "assets/title.woff2" };
    manifest.resources.bonus = {
      kind: "image-string",
      manifest: "dependencies/image-strings/bonus/image-string.manifest.json",
    };
    (resource.resources as any).title = { kind: "font", family: "title-font" };
    (resource.resources as any).bonus = resource.resources.amount;
    const tiers = [
      manifest.awardCelebration.base,
      manifest.awardCelebration.standard,
      ...manifest.awardCelebration.celebrationTiers,
    ];
    tiers.forEach((tier: any, index: number) => {
      if (index === 1) return;
      tier.layers.push({
        id: `title-${index}`,
        kind: "text",
        name: "heading",
        defaultText: `TITLE ${index}`,
        order: 10,
        resource: "title",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        anchor: { x: 0.5, y: 0.5 },
        style: {
          fontSize: 64,
          letterSpacing: 0,
          fill: { kind: "solid", color: "#ffffff" },
          arcDegrees: 0,
        },
        visibleSegments: ["start", "loop", "end"],
      });
      tier.layers.push({
        id: `bonus-${index}`,
        kind: "image-string",
        name: "bonus",
        binding: "manual",
        defaultText: String(index),
        order: 11,
        resource: "bonus",
        transform: { x: 0, y: 0, scale: 1 },
        anchor: { x: 0.5, y: 0.5 },
        parent: { kind: "popup-root" },
        visibleSegments: ["loop"],
      });
    });
    const writes = new Map<string, string[]>();
    const player = createAwardCelebrationPlayer({
      resource,
      layerFactory: ({ layer, tierId }) => {
        const runtime = fakeLayer(layer.kind === "vni");
        if (layer.kind !== "text" && layer.kind !== "image-string")
          return runtime;
        const key = `${tierId}:${layer.name ?? "win-amount"}`;
        const targetWrites: string[] = [];
        writes.set(key, targetWrites);
        return {
          ...runtime,
          stringNode: {
            kind: layer.kind,
            name: layer.name ?? "win-amount",
            defaultText:
              layer.kind === "text"
                ? layer.defaultText
                : layer.binding === "manual"
                  ? (layer.defaultText ?? "0")
                  : "0",
            setText: (text: string) => {
              targetWrites.push(text);
            },
          },
        };
      },
    });
    await player.init();
    expect(player.textNodes.map(({ name }) => name)).toEqual(["heading"]);
    expect(player.imageStringNodes.map(({ name }) => name)).toEqual([
      "win-amount",
      "bonus",
    ]);
    player.getTextNode("heading").setText("LOCALIZED");
    player.getImageStringNode("bonus").setText("8");
    player.start({ betAmountRaw: 100, winAmountRaw: 5000 });
    player.requestAdvance();
    expect(writes.get("bigwin:heading")).toContain("LOCALIZED");
    expect(writes.get("bigwin:bonus")).toContain("8");
    player.getTextNode("heading").resetText();
    expect(player.getTextNode("heading").text).toBe("TITLE 2");
    player.dismissImmediately();
    player.start({ betAmountRaw: 100, winAmountRaw: 101 });
    player.requestAdvance();
    expect(player.getSnapshot().activeTierId).toBe("standard");
    player.destroy();
  });

  it("keeps a completed once layer visible until the tier lifecycle ends", async () => {
    const resource = fakeResource();
    const player = createAwardCelebrationPlayer({
      resource,
      layerFactory: ({ layer }) =>
        layer.kind === "vni" ? completedOnceLayer() : fakeLayer(false),
    });
    await player.init();
    player.start({ betAmountRaw: 100, winAmountRaw: 1500 });
    player.requestAdvance();
    const bigwinContainer = player.container.children[2] as Container;
    player.update(0.2);
    expect(player.getSnapshot()).toMatchObject({
      phase: "counting",
      activeTierId: "bigwin",
    });
    expect(bigwinContainer.visible).toBe(true);
    player.update(3);
    expect(player.getSnapshot().phase).toBe("awaiting-dismiss");
    expect(bigwinContainer.visible).toBe(true);
    player.requestDismiss();
    player.update(0);
    expect(player.getSnapshot().phase).toBe("complete");
    expect(bigwinContainer.visible).toBe(false);
    player.destroy();
  });

  it.each([
    ["empty", () => ""],
    ["non-string", () => 123 as unknown as string],
  ])("rejects a %s host amount formatter result", async (_label, formatter) => {
    const player = createAwardCelebrationPlayer({
      resource: fakeResource(),
      formatAmount: formatter,
      layerFactory: ({ layer }) =>
        fakeLayer(layer.kind === "vni", () => undefined),
    });
    await player.init();
    expect(() =>
      player.start({ betAmountRaw: 100, winAmountRaw: 123 }),
    ).toThrow(/formatter must return a non-empty string/);
    player.destroy();
  });
});

function fakeResource(): PopupPackageResource<AwardCelebrationPopupManifestV1> {
  const manifest = popupFixture();
  return {
    manifest,
    resources: {
      amount: { kind: "image-string", resource: {} as never },
      bigwin: { kind: "vni", project: {} as never, assetUrls: {} },
      superwin: { kind: "vni", project: {} as never, assetUrls: {} },
      megawin: { kind: "vni", project: {} as never, assetUrls: {} },
    },
    destroy() {},
  };
}

function staticResource(): PopupPackageResource<AwardCelebrationPopupManifestV1> {
  const chars = [..."$,.0123456789"];
  const glyphs = Object.fromEntries(
    chars.map((character, index) => [
      character,
      {
        path: `assets/g${index}.png`,
        size: { width: 1, height: 1 },
        offset: { x: 0, y: 0 },
      },
    ]),
  );
  const imageStringResource = {
    manifest: {
      version: 1 as const,
      kind: "image-string" as const,
      id: "amount",
      metrics: { lineHeight: 1, letterSpacing: 0 },
      glyphs,
      fixedAdvanceGroups: [],
    },
    textures: Object.fromEntries(
      Object.values(glyphs).map((glyph) => [glyph.path, Texture.EMPTY]),
    ),
    destroyed: false,
    assertUsable() {},
    async destroy() {},
  };
  const amount = {
    id: "amount",
    kind: "image-string" as const,
    order: 1,
    resource: "amount",
    binding: "win-amount" as const,
    anchor: { x: 0.5, y: 0.5 },
    parent: { kind: "popup-root" as const },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const manifest = {
    ...popupFixture(),
    resources: {
      amount: {
        kind: "image-string" as const,
        manifest:
          "dependencies/image-strings/amount/image-string.manifest.json",
      },
      image: {
        kind: "image" as const,
        path: `assets/${"f".repeat(64)}.png`,
        size: { width: 1, height: 1 },
      },
    },
    awardCelebration: {
      base: {
        countDurationSeconds: 1,
        layers: [
          {
            id: "image",
            kind: "image" as const,
            order: 0,
            resource: "image",
            anchor: { x: 0.5, y: 0.5 },
            visibleSegments: ["start", "end"] as const,
            transform: { x: 0, y: 0, scale: 1 },
          },
          amount,
        ],
      },
      standard: { countDurationSeconds: 1, layers: [amount] },
      celebrationTiers: [
        {
          id: "bigwin" as const,
          thresholdMultiplier: 15,
          countDurationSeconds: 1,
          layers: [amount],
        },
        {
          id: "superwin" as const,
          thresholdMultiplier: 30,
          countDurationSeconds: 1,
          layers: [amount],
        },
        {
          id: "megawin" as const,
          thresholdMultiplier: 50,
          countDurationSeconds: 1,
          layers: [amount],
        },
      ],
    },
  };
  return {
    manifest,
    resources: {
      amount: { kind: "image-string", resource: imageStringResource },
      image: { kind: "image", texture: Texture.EMPTY },
    },
    destroy() {},
  };
}
function fakeLayer(
  animated: boolean,
  onAmountRebind: () => void = () => {},
): PopupLayerRuntime {
  const container = new Container();
  let elapsed = 0;
  let ended = false;
  return {
    container,
    animated,
    async init() {},
    enter() {
      elapsed = 0;
      ended = false;
    },
    updateAmount() {},
    update(delta) {
      elapsed += delta;
    },
    isLoopReady() {
      return !animated || elapsed >= 0.1;
    },
    requestEnd() {
      ended = true;
    },
    isEndComplete() {
      return ended && elapsed >= 0.2;
    },
    applySegment() {},
    rebindAmountLayer() {
      onAmountRebind();
    },
    destroy() {
      container.destroy();
    },
  };
}

function completedOnceLayer(): PopupLayerRuntime {
  const container = new Container();
  let complete = false;
  return {
    container,
    animated: true,
    async init() {},
    enter() {
      complete = false;
    },
    updateAmount() {},
    update(delta) {
      if (delta >= 0.1) complete = true;
    },
    isLoopReady() {
      return complete;
    },
    requestEnd() {},
    isEndComplete() {
      return complete;
    },
    applySegment() {},
    destroy() {
      container.destroy();
    },
  };
}
