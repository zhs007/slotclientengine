import { Container, Sprite } from "pixi.js";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";
import { createRenderImageString } from "../image-string/index.js";
import { createOfficialSpinePlayer } from "../spine/runtime-player.js";
import {
  createAwardCountStages,
  type AwardCountStage,
} from "./award-sequence.js";
import { formatPopupAmount } from "./amount-format.js";
import {
  requestPopupVniPlaybackEnd,
  startPopupVniPlayback,
} from "./vni-playback.js";
import type {
  AwardCelebrationPlayer,
  AwardCelebrationSnapshot,
  AwardCelebrationPopupManifestV1,
  AwardTierId,
  PopupLayer,
  PopupAmountFormatter,
  PopupPackageResource,
  PopupPreparedImageString,
  PopupPreparedResource,
  PopupSegment,
} from "./types.js";

export interface PopupLayerRuntime {
  readonly container: Container;
  readonly animated: boolean;
  init(): Promise<void>;
  enter(amountText: string): void;
  updateAmount(amountText: string): void;
  update(deltaSeconds: number): void;
  isLoopReady(): boolean;
  requestEnd(): void;
  isEndComplete(): boolean;
  applySegment(segment: PopupSegment, amountText: string): void;
  rebindAmountLayer?(options: {
    readonly layer: Extract<PopupLayer, { readonly kind: "image-string" }>;
    readonly resource: PopupPreparedImageString;
    readonly amountText: string;
  }): void;
  mountNodeToTextLayer?(options: {
    readonly textLayerId: string;
    readonly node: Container;
  }): () => void;
  destroy(): void;
}
export type PopupLayerRuntimeFactory = (options: {
  readonly layer: PopupLayer;
  readonly resource: PopupPreparedResource;
  readonly popupId: string;
  readonly tierId: AwardTierId;
}) => PopupLayerRuntime;

interface TierRuntime {
  readonly id: AwardTierId;
  readonly container: Container;
  readonly layers: readonly PopupLayerRuntime[];
  readonly amountLayer: Extract<PopupLayer, { readonly kind: "image-string" }>;
  readonly amountResource: PopupPreparedImageString;
  readonly amountChildIndex: number;
  amountParent: Container;
  disposeAmountParent?: () => void;
  segment: PopupSegment;
  endRequested: boolean;
}

export function createAwardCelebrationPlayer(options: {
  readonly resource: PopupPackageResource;
  readonly layerFactory?: PopupLayerRuntimeFactory;
  readonly formatAmount?: PopupAmountFormatter | undefined;
}): AwardCelebrationPlayer {
  if (options.resource.manifest.type !== "award-celebration")
    throw new Error(
      "Award celebration player requires an award-celebration popup package.",
    );
  return new DefaultAwardCelebrationPlayer(options);
}

class DefaultAwardCelebrationPlayer implements AwardCelebrationPlayer {
  readonly container = new Container();
  readonly #resource: PopupPackageResource & {
    readonly manifest: AwardCelebrationPopupManifestV1;
  };
  readonly #factory: PopupLayerRuntimeFactory;
  readonly #formatAmount: PopupAmountFormatter;
  readonly #tiers = new Map<AwardTierId, TierRuntime>();
  #initialized = false;
  #initializing: Promise<void> | null = null;
  #destroyed = false;
  #phase: AwardCelebrationSnapshot["phase"] = "idle";
  #stages: readonly AwardCountStage[] = [];
  #stageIndex = -1;
  #elapsed = 0;
  #displayed = 0;
  #final = 0;
  #active: TierRuntime | null = null;
  #ending: TierRuntime[] = [];
  #amount: PopupLayerRuntime | null = null;
  constructor(options: {
    readonly resource: PopupPackageResource;
    readonly layerFactory?: PopupLayerRuntimeFactory;
    readonly formatAmount?: PopupAmountFormatter | undefined;
  }) {
    if (options.resource.manifest.type !== "award-celebration")
      throw new Error(
        "Award celebration player requires an award-celebration popup package.",
      );
    this.#resource = options.resource as PopupPackageResource & {
      readonly manifest: AwardCelebrationPopupManifestV1;
    };
    this.#factory = options.layerFactory ?? defaultLayerFactory;
    this.#formatAmount =
      options.formatAmount ??
      ((amountRaw) =>
        formatPopupAmount(amountRaw, this.#resource.manifest.amountFormat));
  }
  init(): Promise<void> {
    this.assertUsable();
    if (this.#initialized) return Promise.resolve();
    if (this.#initializing) return this.#initializing;
    this.#initializing = this.prepare();
    return this.#initializing;
  }
  start(input: {
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }): void {
    this.assertReady();
    if (this.isPlaying())
      throw new Error("award celebration is already playing.");
    this.clearPlayback();
    this.#final = input.winAmountRaw;
    this.#displayed = 0;
    this.#stages = createAwardCountStages(this.#resource.manifest, input);
    if (!this.#stages.length) {
      this.#phase = "complete";
      return;
    }
    this.startNextStage();
  }
  update(deltaSeconds: number): AwardCelebrationSnapshot {
    this.assertReady();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("deltaSeconds must be finite and non-negative.");
    for (const tier of [this.#active, ...this.#ending])
      if (tier) this.updateTier(tier, deltaSeconds);
    this.drainEnding();
    if (this.#phase === "dismissing") {
      if (!this.#active || tierEnded(this.#active)) this.complete();
      return this.getSnapshot();
    }
    if (this.#phase !== "counting" || !this.#active) return this.getSnapshot();
    const stage = this.#stages[this.#stageIndex]!;
    this.#elapsed = Math.min(
      stage.durationSeconds,
      this.#elapsed + deltaSeconds,
    );
    const progress =
      stage.durationSeconds === 0 ? 1 : this.#elapsed / stage.durationSeconds;
    this.#displayed =
      stage.fromAmountRaw +
      Math.floor((stage.toAmountRaw - stage.fromAmountRaw) * progress);
    this.updateAmount();
    if (progress >= 1) this.finishStage();
    return this.getSnapshot();
  }
  requestAdvance(): void {
    this.assertReady();
    if (!this.isPlaying()) return;
    if (this.#phase === "awaiting-dismiss") {
      this.requestDismiss();
      return;
    }
    if (this.#phase !== "counting") return;
    const nextCelebration = this.#stages.findIndex(
      (stage, index) =>
        index > this.#stageIndex &&
        !["base", "standard"].includes(stage.tierId),
    );
    if (
      ["base", "standard"].includes(this.#stages[this.#stageIndex]!.tierId) &&
      nextCelebration >= 0
    ) {
      this.#stageIndex = nextCelebration - 1;
      this.transitionToNext();
      return;
    }
    this.#displayed = this.#stages[this.#stageIndex]!.toAmountRaw;
    this.updateAmount();
    this.finishStage();
  }
  requestDismiss(): void {
    this.assertReady();
    if (!this.isPlaying()) return;
    if (this.#phase !== "awaiting-dismiss") {
      this.#displayed = this.#final;
      this.updateAmount();
      this.#phase = "awaiting-dismiss";
      return;
    }
    this.#phase = "dismissing";
    if (this.#active) requestTierEnd(this.#active, this.amountText());
    else this.complete();
  }
  dismissImmediately(): void {
    this.assertReady();
    if (this.isPlaying()) this.complete();
  }
  getSnapshot(): AwardCelebrationSnapshot {
    this.assertUsable();
    return Object.freeze({
      phase: this.#phase,
      activeTierId: this.#active?.id ?? null,
      activeSegment: this.#active?.segment ?? null,
      displayedAmountRaw: this.#displayed,
      finalAmountRaw: this.#final,
      formattedAmount: this.amountText(),
      activeLayerCount: this.#active ? this.#active.layers.length + 1 : 0,
      endingLayerCount: this.#ending.reduce(
        (sum, tier) => sum + tier.layers.length,
        0,
      ),
    });
  }
  isPlaying(): boolean {
    return !["idle", "complete"].includes(this.#phase);
  }
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    detach(this.#amount?.container);
    for (const tier of this.#tiers.values()) this.destroyTier(tier);
    this.#amount?.destroy();
    this.#amount = null;
    this.#tiers.clear();
    this.container.destroy({ children: false });
  }
  private async prepare() {
    const manifest = this.#resource.manifest;
    const specs: readonly (readonly [
      AwardTierId,
      { readonly layers: readonly PopupLayer[] },
    ])[] = [
      ["base", manifest.awardCelebration.base],
      ["standard", manifest.awardCelebration.standard],
      ...manifest.awardCelebration.celebrationTiers.map(
        (tier) => [tier.id, tier] as const,
      ),
    ];
    const created: TierRuntime[] = [];
    try {
      for (const [id, spec] of specs) {
        const container = new Container();
        container.visible = false;
        const orderedLayers = [...spec.layers].sort(
          (left, right) => left.order - right.order,
        );
        const amountLayer = orderedLayers.find(
          (
            layer,
          ): layer is Extract<PopupLayer, { readonly kind: "image-string" }> =>
            layer.kind === "image-string",
        )!;
        const amountResource = this.#resource.resources[amountLayer.resource]!;
        if (amountResource.kind !== "image-string")
          throw new Error("popup amount layer/resource kind mismatch.");
        if (!this.#amount) {
          this.#amount = this.#factory({
            layer: amountLayer,
            resource: amountResource,
            popupId: manifest.id,
            tierId: id,
          });
          if (!this.#amount.rebindAmountLayer)
            throw new Error(
              "popup ImgNumber runtime must support resource rebinding.",
            );
          this.#amount.container.visible = false;
          await this.#amount.init();
        }
        const layers: PopupLayerRuntime[] = [];
        const layersById = new Map<string, PopupLayerRuntime>();
        const tier: TierRuntime = {
          id,
          container,
          layers,
          amountLayer,
          amountResource,
          amountChildIndex: orderedLayers.indexOf(amountLayer),
          amountParent: container,
          segment: "start",
          endRequested: false,
        };
        created.push(tier);
        this.container.addChild(container);
        for (const layer of orderedLayers) {
          if (layer.kind === "image-string") continue;
          const runtime = this.#factory({
            layer,
            resource: this.#resource.resources[layer.resource]!,
            popupId: manifest.id,
            tierId: id,
          });
          layers.push(runtime);
          layersById.set(layer.id, runtime);
          container.addChild(runtime.container);
        }
        await Promise.all(layers.map((layer) => layer.init()));
        if (amountLayer.parent.kind === "vni-text-layer") {
          const target = layersById.get(amountLayer.parent.vniLayerId);
          if (!target?.mountNodeToTextLayer)
            throw new Error(
              `popup ImgNumber VNI parent runtime unavailable: ${amountLayer.parent.vniLayerId}.`,
            );
          const amountParent = new Container();
          amountParent.label = `popup ImgNumber mount ${amountLayer.id}`;
          let disposeAmountParent: () => void;
          try {
            disposeAmountParent = target.mountNodeToTextLayer({
              textLayerId: amountLayer.parent.textLayerId,
              node: amountParent,
            });
          } catch (error) {
            amountParent.destroy({ children: false });
            throw error;
          }
          tier.amountParent = amountParent;
          tier.disposeAmountParent = disposeAmountParent;
        }
        this.#tiers.set(id, tier);
      }
      this.#initialized = true;
    } catch (error) {
      for (const tier of created) this.destroyTier(tier);
      this.#amount?.destroy();
      this.#amount = null;
      throw error;
    } finally {
      this.#initializing = null;
    }
  }
  private startNextStage() {
    this.#stageIndex += 1;
    const stage = this.#stages[this.#stageIndex];
    if (!stage) {
      this.#displayed = this.#final;
      this.updateAmount();
      this.#phase = "awaiting-dismiss";
      return;
    }
    this.#elapsed = 0;
    this.#displayed = stage.fromAmountRaw;
    const tier = this.#tiers.get(stage.tierId)!;
    tier.segment = "start";
    tier.endRequested = false;
    tier.container.visible = true;
    for (const layer of tier.layers) layer.enter(this.amountText());
    detach(this.#amount!.container);
    if (tier.amountParent === tier.container)
      tier.container.addChildAt(this.#amount!.container, tier.amountChildIndex);
    else tier.amountParent.addChild(this.#amount!.container);
    this.#amount!.rebindAmountLayer!({
      layer: tier.amountLayer,
      resource: tier.amountResource,
      amountText: this.amountText(),
    });
    this.#amount!.enter(this.amountText());
    this.#active = tier;
    this.#phase = "counting";
  }
  private finishStage() {
    if (this.#stageIndex + 1 < this.#stages.length) this.transitionToNext();
    else {
      this.#displayed = this.#final;
      this.updateAmount();
      this.#phase = "awaiting-dismiss";
    }
  }
  private transitionToNext() {
    if (this.#active) {
      requestTierEnd(this.#active, this.amountText());
      this.#ending.push(this.#active);
      this.#active = null;
    }
    this.startNextStage();
  }
  private updateTier(tier: TierRuntime, delta: number) {
    for (const layer of tier.layers) layer.update(delta);
    if (
      tier.segment === "start" &&
      tier.layers
        .filter((layer) => layer.animated)
        .every((layer) => layer.isLoopReady())
    ) {
      tier.segment = "loop";
      for (const layer of tier.layers)
        layer.applySegment("loop", this.amountText());
    }
    if (
      tier.endRequested &&
      tier.segment !== "end" &&
      tier.layers
        .filter((layer) => layer.animated)
        .every((layer) => layer.isLoopReady())
    ) {
      tier.segment = "end";
      for (const layer of tier.layers)
        layer.applySegment("end", this.amountText());
    }
  }
  private drainEnding() {
    const remaining: TierRuntime[] = [];
    for (const tier of this.#ending) {
      if (tierEnded(tier)) {
        tier.container.visible = false;
      } else remaining.push(tier);
    }
    this.#ending = remaining;
  }
  private updateAmount() {
    this.#amount?.updateAmount(this.amountText());
  }
  private amountText() {
    const text = this.#formatAmount(Math.floor(this.#displayed));
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("popup amount formatter must return a non-empty string.");
    }
    return text;
  }
  private complete() {
    if (this.#active) this.#active.container.visible = false;
    for (const tier of this.#ending) tier.container.visible = false;
    if (this.#amount) this.#amount.container.visible = false;
    this.#active = null;
    this.#ending = [];
    this.#phase = "complete";
  }
  private clearPlayback() {
    for (const tier of this.#tiers.values()) tier.container.visible = false;
    if (this.#amount) this.#amount.container.visible = false;
    this.#active = null;
    this.#ending = [];
    this.#stages = [];
    this.#stageIndex = -1;
  }
  private destroyTier(tier: TierRuntime) {
    tier.disposeAmountParent?.();
    if (tier.amountParent !== tier.container)
      tier.amountParent.destroy({ children: false });
    for (const layer of tier.layers) layer.destroy();
    tier.container.destroy({ children: false });
  }
  private assertReady() {
    this.assertUsable();
    if (!this.#initialized)
      throw new Error(
        "award celebration player.init() must complete before use.",
      );
  }
  private assertUsable() {
    if (this.#destroyed)
      throw new Error("award celebration player was destroyed.");
  }
}

function requestTierEnd(tier: TierRuntime, text: string) {
  tier.endRequested = true;
  for (const layer of tier.layers) layer.requestEnd();
  if (!tier.layers.some((layer) => layer.animated)) {
    tier.segment = "end";
    for (const layer of tier.layers) layer.applySegment("end", text);
  }
}
function tierEnded(tier: TierRuntime) {
  return (
    tier.endRequested &&
    tier.layers.every((layer) => !layer.animated || layer.isEndComplete())
  );
}

function detach(container: Container | undefined): void {
  if (container?.parent) container.parent.removeChild(container);
}

function defaultLayerFactory(options: {
  readonly layer: PopupLayer;
  readonly resource: PopupPreparedResource;
  readonly popupId: string;
  readonly tierId: AwardTierId;
}): PopupLayerRuntime {
  const { layer, resource } = options;
  if (layer.kind !== resource.kind)
    throw new Error(`popup layer/resource kind mismatch: ${layer.id}`);
  const container = new Container();
  container.position.set(layer.transform.x, layer.transform.y);
  container.scale.set(layer.transform.scale);
  if (layer.kind === "image" && resource.kind === "image") {
    const sprite = new Sprite(resource.texture);
    sprite.anchor.set(layer.anchor.x, layer.anchor.y);
    container.addChild(sprite);
    return staticRuntime(container, layer.visibleSegments);
  }
  if (layer.kind === "image-string" && resource.kind === "image-string") {
    const renderer = createRenderImageString({
      resource: resource.resource,
      text: "0",
      anchor: layer.anchor,
    });
    container.addChild(renderer.container);
    return {
      container,
      animated: false,
      async init() {},
      enter(text) {
        renderer.setText(text);
        container.visible = true;
      },
      updateAmount(text) {
        renderer.setText(text);
      },
      update() {},
      isLoopReady() {
        return true;
      },
      requestEnd() {},
      isEndComplete() {
        return true;
      },
      applySegment(_segment, text) {
        renderer.setText(text);
      },
      rebindAmountLayer({
        layer: nextLayer,
        resource: nextResource,
        amountText,
      }) {
        renderer.setResource(nextResource.resource, amountText);
        renderer.setAnchor(nextLayer.anchor);
        container.position.set(nextLayer.transform.x, nextLayer.transform.y);
        container.scale.set(nextLayer.transform.scale);
      },
      destroy() {
        renderer.destroy();
        container.destroy({ children: false });
      },
    };
  }
  if (layer.kind === "spine" && resource.kind === "spine") {
    const player = createOfficialSpinePlayer({ resource: resource.resource });
    container.addChild(player.view);
    let state: PopupSegment = "start";
    let complete = false;
    return {
      container,
      animated: true,
      async init() {
        await player.init();
      },
      enter() {
        state = "start";
        complete = false;
        player.play({
          animationName: layer.playback.startAnimation,
          loop: false,
        });
        container.visible = true;
      },
      updateAmount() {},
      update(delta) {
        const result = player.update(delta);
        if (state === "start" && result.completed) {
          state = "loop";
          player.play({
            animationName: layer.playback.loopAnimation,
            loop: true,
          });
        } else if (state === "end" && result.completed) complete = true;
      },
      isLoopReady() {
        return state === "loop" || state === "end" || complete;
      },
      requestEnd() {},
      isEndComplete() {
        return complete;
      },
      applySegment(segment) {
        if (segment === "end" && state !== "end") {
          state = "end";
          player.play({
            animationName: layer.playback.endAnimation,
            loop: false,
          });
        }
      },
      destroy() {
        player.destroy();
        container.destroy({ children: false });
      },
    };
  }
  if (layer.kind === "vni" && resource.kind === "vni") {
    const player = new VNIPlayer({
      parent: container,
      projectId: `${options.popupId}-${options.tierId}-${layer.id}`,
      bundleId: "popup",
      profileId: "popup",
      profilePurpose: "award-celebration",
      assetScale: 1,
      project: resource.project,
      assetUrls: resource.assetUrls,
      autoTick: false,
      fitPadding: 0,
    });
    let elapsed = 0;
    let end = false;
    let complete = false;
    let dispose = () => {};
    let mountIndex = 0;
    return {
      container,
      animated: true,
      async init() {
        await player.init();
        player
          .getDisplayObject()
          .pivot.set(
            resource.project.stage.width / 2,
            resource.project.stage.height / 2,
          );
        dispose = player.onPlaybackComplete(() => {
          complete = true;
        });
      },
      enter() {
        elapsed = 0;
        end = false;
        complete = false;
        startPopupVniPlayback(player, layer.playback);
        container.visible = true;
      },
      updateAmount() {},
      update(delta) {
        elapsed += delta;
        player.update(delta);
      },
      isLoopReady() {
        return layer.playback.mode === "once"
          ? complete
          : elapsed >= layer.playback.loopStartTime || end || complete;
      },
      requestEnd() {
        end = true;
        requestPopupVniPlaybackEnd(player, layer.playback);
      },
      isEndComplete() {
        return complete;
      },
      applySegment() {},
      mountNodeToTextLayer({ textLayerId, node }) {
        mountIndex += 1;
        return player.attachNodeToTextLayer({
          id: `popup-text-mount-${layer.id}-${mountIndex}`,
          layerId: textLayerId,
          node,
          destroyOnDetach: false,
          hideOriginal: true,
        });
      },
      destroy() {
        dispose();
        player.destroy();
        container.destroy({ children: false });
      },
    };
  }
  throw new Error(`unsupported popup layer ${layer.id}.`);
}
function staticRuntime(
  container: Container,
  segments: readonly PopupSegment[],
): PopupLayerRuntime {
  return {
    container,
    animated: false,
    async init() {},
    enter() {
      container.visible = segments.includes("start");
    },
    updateAmount() {},
    update() {},
    isLoopReady() {
      return true;
    },
    requestEnd() {},
    isEndComplete() {
      return true;
    },
    applySegment(segment) {
      container.visible = segments.includes(segment);
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
}
