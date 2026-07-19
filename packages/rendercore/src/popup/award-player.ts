import { Container, Sprite } from "pixi.js";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";
import { createRenderImageString } from "../image-string/index.js";
import { createOfficialSpinePlayer } from "../spine/runtime-player.js";
import {
  createAwardCountStages,
  type AwardCountStage,
} from "./award-sequence.js";
import { formatPopupAmount } from "./amount-format.js";
import type {
  AwardCelebrationPlayer,
  AwardCelebrationSnapshot,
  AwardTierId,
  PopupLayer,
  PopupManifestV1,
  PopupPackageResource,
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
  segment: PopupSegment;
  endRequested: boolean;
}

export function createAwardCelebrationPlayer(options: {
  readonly resource: PopupPackageResource;
  readonly layerFactory?: PopupLayerRuntimeFactory;
}): AwardCelebrationPlayer {
  return new DefaultAwardCelebrationPlayer(options);
}

class DefaultAwardCelebrationPlayer implements AwardCelebrationPlayer {
  readonly container = new Container();
  readonly #resource: PopupPackageResource;
  readonly #factory: PopupLayerRuntimeFactory;
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
  constructor(options: {
    readonly resource: PopupPackageResource;
    readonly layerFactory?: PopupLayerRuntimeFactory;
  }) {
    this.#resource = options.resource;
    this.#factory = options.layerFactory ?? defaultLayerFactory;
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
      activeLayerCount: this.#active?.layers.length ?? 0,
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
    for (const tier of this.#tiers.values()) {
      for (const layer of tier.layers) layer.destroy();
      tier.container.destroy({ children: false });
    }
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
        const layers = spec.layers.map((layer) => {
          const runtime = this.#factory({
            layer,
            resource: this.#resource.resources[layer.resource]!,
            popupId: manifest.id,
            tierId: id,
          });
          container.addChild(runtime.container);
          return runtime;
        });
        const tier: TierRuntime = {
          id,
          container,
          layers,
          segment: "start",
          endRequested: false,
        };
        created.push(tier);
        this.container.addChild(container);
        await Promise.all(layers.map((layer) => layer.init()));
        this.#tiers.set(id, tier);
      }
      this.#initialized = true;
    } catch (error) {
      for (const tier of created)
        for (const layer of tier.layers) layer.destroy();
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
    const text = this.amountText();
    for (const layer of this.#active?.layers ?? []) layer.updateAmount(text);
  }
  private amountText() {
    return formatPopupAmount(
      Math.floor(this.#displayed),
      this.#resource.manifest.amountFormat,
    );
  }
  private complete() {
    if (this.#active) this.#active.container.visible = false;
    for (const tier of this.#ending) tier.container.visible = false;
    this.#active = null;
    this.#ending = [];
    this.#phase = "complete";
  }
  private clearPlayback() {
    for (const tier of this.#tiers.values()) tier.container.visible = false;
    this.#active = null;
    this.#ending = [];
    this.#stages = [];
    this.#stageIndex = -1;
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
      ...staticRuntime(container, layer.visibleSegments),
      updateAmount(text) {
        renderer.setText(text);
      },
      applySegment(segment, text) {
        renderer.setText(text);
        container.visible = layer.visibleSegments.includes(segment);
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
        player.play({
          mode: "segmented",
          loopStart: { unit: "time", at: layer.playback.loopStartTime },
          loopEnd: { unit: "time", at: layer.playback.loopEndTime },
          keepParticlesAlive: layer.playback.keepParticlesAlive,
        });
        container.visible = true;
      },
      updateAmount() {},
      update(delta) {
        elapsed += delta;
        player.update(delta);
      },
      isLoopReady() {
        return elapsed >= layer.playback.loopStartTime || end || complete;
      },
      requestEnd() {
        end = true;
        player.requestSegmentedPlaybackEnd();
      },
      isEndComplete() {
        return complete;
      },
      applySegment() {},
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
