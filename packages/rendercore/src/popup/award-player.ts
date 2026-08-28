import { Container, Sprite } from "pixi.js";
import { VNIRuntime } from "@slotclientengine/vnicore/core";
import { createRenderImageString } from "../image-string/core/index.js";
import {
  createOfficialSpinePlayer,
  type RendercoreSpineSlotPlayer,
} from "../spine/runtime-player.js";
import {
  createAwardCountStages,
  type AwardCountStage,
} from "./award-sequence.js";
import {
  awardAmountMotionAmountAtElapsed,
  awardAmountMotionElapsedForAmount,
  awardAmountTerminalBrakeAmountAtElapsed,
  awardAmountTerminalBrakeElapsedForAmount,
  createAwardAmountMotionPlan,
  type AwardAmountMotionPlan,
  type AwardAmountMotionStage,
} from "./award-amount-motion.js";
import { formatPopupAmount } from "./amount-format.js";
import { createPopupStringNodeRegistry } from "./string-node-registry.js";
import {
  createPopupStyledText,
  setPopupTextWidthGuidesInTree,
} from "./styled-text.js";
import {
  requestPopupVniPlaybackEnd,
  startPopupVniPlayback,
} from "./vni-playback.js";
import type { AwardCelebrationPlayer } from "./editor-types.js";
import type {
  AwardCelebrationRuntime,
  AwardCelebrationSnapshot,
  AwardTierId,
  PopupLayer,
  PopupAmountFormatter,
  PopupPackageResource,
  PopupPreparedImageString,
  PopupPreparedResource,
  PopupSegment,
  PopupStringNodeHandle,
  PopupStringNodeSelector,
  PopupManifest,
  PopupRuntimeStateObserver,
} from "./types.js";
import {
  createPopupPresentation,
  type PopupBackdropController,
} from "./presentation.js";
import {
  attachPopupLayerRuntimes,
  type PopupLayerAttachmentHandle,
} from "./layer-attachment.js";

export interface PopupLayerRuntime {
  readonly container: Container;
  readonly animated: boolean;
  readonly spinePlayer?: RendercoreSpineSlotPlayer;
  readonly stringNode?: {
    readonly kind: "text" | "image-string";
    readonly name: string;
    readonly defaultText: string;
    setText(text: string): void;
  };
  configure?(layer: PopupLayer): void;
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
  readonly resource?: PopupPreparedResource;
  readonly popupId: string;
  readonly tierId: AwardTierId;
}) => PopupLayerRuntime;

interface TierRuntime {
  readonly id: AwardTierId;
  readonly container: Container;
  readonly layers: readonly PopupLayerRuntime[];
  readonly layerSpecs: readonly PopupLayer[];
  readonly stringNodes: ReadonlyMap<string, PopupLayerRuntime["stringNode"]>;
  readonly amountLayer: Extract<PopupLayer, { readonly kind: "image-string" }>;
  readonly amountResource: PopupPreparedImageString;
  readonly amountChildIndex: number;
  amountParent: Container;
  amountMount?: Container;
  disposeAmountParent?: () => void;
  attachmentHandle?: PopupLayerAttachmentHandle;
  readonly runtimesById: ReadonlyMap<string, PopupLayerRuntime>;
  segment: PopupSegment;
  endRequested: boolean;
}

const awardSnapshotReaders = new WeakMap<
  AwardCelebrationRuntime,
  () => AwardCelebrationSnapshot
>();

export function createAwardCelebrationPlayer(options: {
  readonly resource: PopupPackageResource;
  readonly layerFactory?: PopupLayerRuntimeFactory;
  readonly formatAmount?: PopupAmountFormatter | undefined;
}): AwardCelebrationPlayer {
  return new AwardCelebrationEditorPlayer(
    createAwardCelebrationRuntime(options),
  );
}

export function createAwardCelebrationRuntime(options: {
  readonly resource: PopupPackageResource;
  readonly layerFactory?: PopupLayerRuntimeFactory;
  readonly formatAmount?: PopupAmountFormatter | undefined;
  readonly backdropController?: PopupBackdropController;
  readonly observeState?: PopupRuntimeStateObserver;
}): AwardCelebrationRuntime {
  if (options.resource.manifest.type !== "award-celebration")
    throw new Error(
      "Award celebration player requires an award-celebration popup package.",
    );
  return new DefaultAwardCelebrationRuntime(options);
}

/** @internal Editor/diagnostic bridge; intentionally omitted from the popup barrel. */
export function inspectAwardCelebrationRuntime(
  runtime: AwardCelebrationRuntime,
): AwardCelebrationSnapshot {
  const read = awardSnapshotReaders.get(runtime);
  if (!read)
    throw new Error("Award celebration runtime inspection is unavailable.");
  return read();
}

class DefaultAwardCelebrationRuntime implements AwardCelebrationRuntime {
  readonly container: Container;
  readonly #resource: PopupPackageResource & {
    readonly manifest: Extract<
      PopupManifest,
      { readonly type: "award-celebration" }
    >;
  };
  readonly #presentation: ReturnType<typeof createPopupPresentation>;
  readonly #factory: PopupLayerRuntimeFactory;
  readonly #formatAmount: PopupAmountFormatter;
  readonly #nodes: ReturnType<typeof createPopupStringNodeRegistry>;
  readonly #observeState: PopupRuntimeStateObserver | undefined;
  readonly #tiers = new Map<AwardTierId, TierRuntime>();
  readonly #runtimeVariants = new Map<string, PopupLayerRuntime>();
  readonly #initializedRuntimes = new WeakSet<PopupLayerRuntime>();
  readonly #destroyedRuntimes = new WeakSet<PopupLayerRuntime>();
  #initialized = false;
  #initializing: Promise<void> | null = null;
  #destroyed = false;
  #phase: AwardCelebrationSnapshot["phase"] = "idle";
  #stages: readonly AwardCountStage[] = [];
  #motionPlan: AwardAmountMotionPlan | null = null;
  #motionMode: "stage" | "braking" | null = null;
  #stageIndex = -1;
  #elapsed = 0;
  #displayed = 0;
  #final = 0;
  #lastAutomaticAmount: number | null = null;
  #lastFormattedAmount = "";
  #active: TierRuntime | null = null;
  readonly #showing = new Set<TierRuntime>();
  readonly #tiersToUpdate: TierRuntime[] = [];
  #ending: TierRuntime[] = [];
  #amount: PopupLayerRuntime | null = null;
  constructor(options: {
    readonly resource: PopupPackageResource;
    readonly layerFactory?: PopupLayerRuntimeFactory;
    readonly formatAmount?: PopupAmountFormatter | undefined;
    readonly backdropController?: PopupBackdropController;
    readonly observeState?: PopupRuntimeStateObserver;
  }) {
    if (options.resource.manifest.type !== "award-celebration")
      throw new Error(
        "Award celebration player requires an award-celebration popup package.",
      );
    this.#resource = options.resource as PopupPackageResource & {
      readonly manifest: Extract<
        PopupManifest,
        { readonly type: "award-celebration" }
      >;
    };
    this.#presentation = createPopupPresentation(this.#resource.manifest, {
      backdropController: options.backdropController,
    });
    this.container = this.#presentation.container;
    this.#factory = options.layerFactory ?? defaultLayerFactory;
    this.#formatAmount =
      options.formatAmount ??
      ((amountRaw) =>
        formatPopupAmount(amountRaw, this.#resource.manifest.amountFormat));
    this.#nodes = createPopupStringNodeRegistry(
      collectAwardStringNodeDefinitions(this.#resource.manifest),
    );
    this.#observeState = options.observeState;
    awardSnapshotReaders.set(this, () => this.#createSnapshot());
  }
  get textNodes(): readonly PopupStringNodeHandle[] {
    return this.#nodes.textNodes;
  }
  get imageStringNodes(): readonly PopupStringNodeHandle[] {
    return this.#nodes.imageStringNodes;
  }
  getTextNode(selector: PopupStringNodeSelector): PopupStringNodeHandle {
    this.assertUsable();
    return this.#nodes.getTextNode(selector);
  }
  getImageStringNode(selector: PopupStringNodeSelector): PopupStringNodeHandle {
    this.assertUsable();
    return this.#nodes.getImageStringNode(selector);
  }
  applyViewport(
    viewportSize: Parameters<
      NonNullable<AwardCelebrationRuntime["applyViewport"]>
    >[0],
    placement?: Parameters<
      NonNullable<AwardCelebrationRuntime["applyViewport"]>
    >[1],
  ) {
    return this.#presentation.applyViewport(viewportSize, placement);
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
    this.#presentation.setActive(true);
    this.#final = input.winAmountRaw;
    this.#stages = createAwardCountStages(this.#resource.manifest, input);
    if (!this.#stages.length) {
      this.#displayed = 0;
      this.updateAmount();
      this.setPhase("complete");
      this.#presentation.setActive(false);
      return;
    }
    this.#motionPlan = createAwardAmountMotionPlan(
      this.#resource.manifest,
      input,
      this.#stages,
    );
    if (!this.#motionPlan) {
      this.startStage(0, this.#final);
      this.beginDismissing();
      return;
    }
    const standardIndex = this.#stages.findIndex(
      (stage) => stage.tierId === "standard",
    );
    if (standardIndex < 0)
      throw new Error("award amount motion is missing its standard stage.");
    this.startStage(standardIndex, input.betAmountRaw);
  }
  update(deltaSeconds: number): void {
    this.assertReady();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("deltaSeconds must be finite and non-negative.");
    this.#tiersToUpdate.length = 0;
    for (const tier of this.#showing) this.#tiersToUpdate.push(tier);
    for (const tier of this.#ending)
      if (!this.#showing.has(tier)) this.#tiersToUpdate.push(tier);
    for (const tier of this.#tiersToUpdate) this.updateTier(tier, deltaSeconds);
    this.drainEnding();
    if (this.#phase === "dismissing") {
      if (!this.#showing.size && !this.#ending.length) this.complete();
      return;
    }
    if (this.#phase !== "counting" || !this.#active) return;
    this.updateAmountMotion(deltaSeconds);
  }
  requestAdvance(): void {
    this.assertReady();
    if (!this.isPlaying()) return;
    if (this.#phase !== "counting") return;
    if (this.#motionMode === "braking") return;
    const nextCelebration = this.#stages.findIndex(
      (stage, index) =>
        index > this.#stageIndex &&
        !["base", "standard"].includes(stage.tierId) &&
        stage.fromAmountRaw < this.#final,
    );
    if (nextCelebration >= 0)
      this.startStage(
        nextCelebration,
        this.#stages[nextCelebration]!.fromAmountRaw,
      );
    else this.beginTerminalBraking();
  }
  requestDismiss(): void {
    this.assertReady();
    if (!this.isPlaying()) return;
    if (this.#phase === "dismissing") return;
    this.#displayed = this.#final;
    this.updateAmount();
    this.beginDismissing();
  }
  private beginDismissing() {
    this.setPhase("dismissing");
    for (const tier of this.#showing) {
      requestTierEnd(tier, this.amountText(), (previous, current) =>
        this.observeSegment(tier, previous, current),
      );
      if (!this.#ending.includes(tier)) this.#ending.push(tier);
    }
    this.#showing.clear();
    if (!this.#ending.length) this.complete();
  }
  dismissImmediately(): void {
    this.assertReady();
    if (this.isPlaying()) this.complete();
  }
  #createSnapshot(): AwardCelebrationSnapshot {
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
  getPhase(): AwardCelebrationSnapshot["phase"] {
    return this.#phase;
  }
  private setPhase(next: AwardCelebrationSnapshot["phase"]): void {
    const previous = this.#phase;
    if (previous === next) return;
    this.#phase = next;
    this.#observeState?.({ kind: "phase", previous, current: next });
  }
  private setActiveTier(next: TierRuntime | null): void {
    const previous = this.#active;
    if (previous === next) return;
    this.#active = next;
    this.#observeState?.({
      kind: "tier",
      previous: previous?.id ?? null,
      previousSegment: previous?.segment ?? null,
      current: next?.id ?? null,
      currentSegment: next?.segment ?? null,
    });
  }
  private setTierSegment(tier: TierRuntime, next: PopupSegment): void {
    const previous = tier.segment;
    if (previous === next) return;
    tier.segment = next;
    this.observeSegment(tier, previous, next);
  }
  private observeSegment(
    tier: TierRuntime,
    previous: PopupSegment,
    current: PopupSegment,
  ): void {
    this.#observeState?.({
      kind: "segment",
      tier: tier.id,
      previous,
      current,
    });
  }
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    detach(this.#amount?.container);
    this.destroyTiers([...this.#tiers.values()]);
    this.#amount?.destroy();
    this.#amount = null;
    this.#tiers.clear();
    this.#runtimeVariants.clear();
    this.#nodes.destroy();
    this.#presentation.destroy();
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
            layer.kind === "image-string" && layer.binding === "win-amount",
        )!;
        if (!amountLayer.resource)
          throw new Error("popup amount layer resource is required.");
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
          this.#nodes.setTarget(
            "win-amount",
            this.#amount.stringNode ?? {
              setText: (text) => this.#amount!.updateAmount(text),
            },
          );
        }
        const layers: PopupLayerRuntime[] = [];
        const layerSpecs: PopupLayer[] = [];
        const layersById = new Map<string, PopupLayerRuntime>();
        const runtimesById = new Map<string, PopupLayerRuntime>();
        const tier: TierRuntime = {
          id,
          container,
          layers,
          layerSpecs,
          stringNodes: new Map(),
          amountLayer,
          amountResource,
          amountChildIndex: orderedLayers.indexOf(amountLayer),
          amountParent: container,
          runtimesById,
          segment: "start",
          endRequested: false,
        };
        created.push(tier);
        this.#presentation.contentRoot.addChild(container);
        for (const layer of orderedLayers) {
          if (layer.kind === "image-string" && layer.binding === "win-amount")
            continue;
          const resource = layer.resource
            ? this.#resource.resources[layer.resource]
            : undefined;
          const variantKey =
            manifest.version >= 6 ? awardLayerVariantKey(layer) : null;
          let runtime = variantKey
            ? this.#runtimeVariants.get(variantKey)
            : undefined;
          if (!runtime) {
            runtime = this.#factory({
              layer,
              resource,
              popupId: manifest.id,
              tierId: id,
            });
            if (variantKey) this.#runtimeVariants.set(variantKey, runtime);
          }
          layers.push(runtime);
          layerSpecs.push(layer);
          layersById.set(layer.id, runtime);
          runtimesById.set(layer.id, runtime);
          if (runtime.stringNode)
            (
              tier.stringNodes as Map<string, PopupLayerRuntime["stringNode"]>
            ).set(runtime.stringNode.name, runtime.stringNode);
          if (manifest.version < 4) container.addChild(runtime.container);
        }
        await Promise.all(
          layers.map(async (layer) => {
            if (this.#initializedRuntimes.has(layer)) return;
            await layer.init();
            this.#initializedRuntimes.add(layer);
          }),
        );
        if (manifest.version >= 4) {
          const amountMount = new Container();
          amountMount.label = `popup amount mount ${id}`;
          runtimesById.set(amountLayer.id, {
            container: amountMount,
          } as PopupLayerRuntime);
          tier.amountMount = amountMount;
          tier.amountParent = amountMount;
          if (manifest.version < 6)
            tier.attachmentHandle = attachPopupLayerRuntimes({
              layers: orderedLayers,
              runtimes: runtimesById,
              root: container,
            });
        } else if (amountLayer.parent?.kind === "vni-text-layer") {
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
      this.destroyTiers(created);
      this.#amount?.destroy();
      this.#amount = null;
      this.#tiers.clear();
      this.#runtimeVariants.clear();
      throw error;
    } finally {
      this.#initializing = null;
    }
  }
  private startNextStage() {
    const nextIndex = this.#stageIndex + 1;
    const stage = this.#stages[nextIndex];
    if (!stage) {
      this.finishAtFinalAmount();
      return;
    }
    this.startStage(nextIndex, stage.fromAmountRaw);
  }
  private startStage(stageIndex: number, displayedAmountRaw: number) {
    const stage = this.#stages[stageIndex]!;
    this.#elapsed = 0;
    this.#motionMode = "stage";
    this.#displayed = displayedAmountRaw;
    this.updateAmount();
    this.#stageIndex = stageIndex;
    const tier = this.#tiers.get(stage.tierId)!;
    this.switchVisibleTiers(stage.tierId);
    if (!this.#showing.has(tier)) this.startTier(tier);
    else this.applyTierStateGate(tier, stage.tierId);
    this.activateTierStringNodes(tier);
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
    this.#amount!.container.visible = amountVisibleInState(
      this.#resource.manifest,
      tier.amountLayer,
      stage.tierId,
    );
    this.setActiveTier(tier);
    this.#presentation.setState(stage.tierId);
    this.setPhase("counting");
  }
  private finishAtFinalAmount() {
    const finalStageIndex = this.#stages.length - 1;
    if (this.#stageIndex !== finalStageIndex)
      this.startStage(finalStageIndex, this.#final);
    else {
      this.#displayed = this.#final;
      this.updateAmount();
    }
    this.beginDismissing();
  }
  private transitionToNext() {
    this.setActiveTier(null);
    this.startNextStage();
  }
  private updateAmountMotion(deltaSeconds: number) {
    if (!this.#motionPlan || !this.#motionMode)
      throw new Error("award amount motion is unavailable while counting.");
    let remaining = deltaSeconds;
    const maxTransitions = this.#stages.length + 2;
    for (let transition = 0; transition < maxTransitions; transition += 1) {
      if (this.#phase !== "counting") return;
      if (this.#motionMode === "braking") {
        const brake = this.#motionPlan.terminalBrake;
        const available = Math.max(0, brake.durationSeconds - this.#elapsed);
        const consumed = Math.min(remaining, available);
        this.#elapsed += consumed;
        remaining -= consumed;
        this.#displayed = Math.floor(
          awardAmountTerminalBrakeAmountAtElapsed(brake, this.#elapsed),
        );
        this.updateAmount();
        if (this.#elapsed < brake.durationSeconds) return;
        this.finishAtFinalAmount();
        return;
      }

      const stage = this.currentMotionStage();
      const brake = this.#motionPlan.terminalBrake;
      const targetAmountRaw =
        stage.tierId === brake.tierId
          ? brake.startAmountRaw
          : stage.toAmountRaw;
      const targetElapsed = awardAmountMotionElapsedForAmount(
        stage,
        targetAmountRaw,
      );
      const available = Math.max(0, targetElapsed - this.#elapsed);
      const consumed = Math.min(remaining, available);
      this.#elapsed += consumed;
      remaining -= consumed;
      this.#displayed = Math.floor(
        awardAmountMotionAmountAtElapsed(stage, this.#elapsed, targetAmountRaw),
      );
      this.updateAmount();
      if (this.#elapsed < targetElapsed) return;
      this.#displayed = targetAmountRaw;
      this.updateAmount();
      if (stage.tierId === brake.tierId) {
        this.#motionMode = "braking";
        this.#elapsed = 0;
      } else {
        this.transitionToNext();
      }
    }
    throw new Error("award amount motion exceeded its transition bound.");
  }
  private beginTerminalBraking() {
    if (!this.#motionPlan)
      throw new Error("award amount terminal braking is unavailable.");
    const brake = this.#motionPlan.terminalBrake;
    const brakingStageIndex = this.#stages.findIndex(
      (stage) => stage.tierId === brake.tierId,
    );
    if (brakingStageIndex < 0)
      throw new Error("award amount terminal braking tier is unavailable.");
    const brakingAmount = Math.max(this.#displayed, brake.startAmountRaw);
    if (this.#stageIndex !== brakingStageIndex)
      this.startStage(brakingStageIndex, brakingAmount);
    else {
      this.#displayed = brakingAmount;
      this.updateAmount();
    }
    this.#motionMode = "braking";
    this.#elapsed = awardAmountTerminalBrakeElapsedForAmount(
      brake,
      brakingAmount,
    );
    if (this.#elapsed >= brake.durationSeconds) this.finishAtFinalAmount();
  }
  private currentMotionStage(): AwardAmountMotionStage {
    const tierId = this.#stages[this.#stageIndex]?.tierId;
    const stage = this.#motionPlan?.stages.find(
      (candidate) => candidate.tierId === tierId,
    );
    if (!stage)
      throw new Error(`award amount motion stage is unavailable: ${tierId}.`);
    return stage;
  }
  private updateTier(tier: TierRuntime, delta: number) {
    for (const layer of tier.layers) layer.update(delta);
    if (tier.segment === "start" && animatedLayersLoopReady(tier.layers)) {
      this.setTierSegment(tier, "loop");
      for (const layer of tier.layers)
        layer.applySegment("loop", this.amountText());
      this.applyTierStateGate(tier);
    }
  }
  private drainEnding() {
    let write = 0;
    for (const tier of this.#ending) {
      if (tierEnded(tier)) {
        if (!this.#showing.has(tier)) tier.container.visible = false;
      } else {
        this.#ending[write] = tier;
        write += 1;
      }
    }
    this.#ending.length = write;
  }
  private updateAmount() {
    const amount = Math.floor(this.#displayed);
    if (amount === this.#lastAutomaticAmount) return;
    this.#lastAutomaticAmount = amount;
    this.#lastFormattedAmount = this.formatAmount(amount);
    this.#nodes.setAutomaticText("win-amount", this.#lastFormattedAmount);
  }
  private amountText() {
    return this.#nodes.getImageStringNode("win-amount").text;
  }
  private formatAmount(amountRaw: number) {
    const text = this.#formatAmount(amountRaw);
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("popup amount formatter must return a non-empty string.");
    }
    return text;
  }
  private activateTierStringNodes(tier: TierRuntime) {
    const names = new Set([
      ...this.#nodes.textNodes.map(({ name }) => name),
      ...this.#nodes.imageStringNodes
        .map(({ name }) => name)
        .filter((name) => name !== "win-amount"),
    ]);
    for (const name of names) {
      const target = tier.stringNodes.get(name) ?? null;
      if (target) this.#nodes.setAutomaticText(name, target.defaultText);
      this.#nodes.setTarget(name, target ?? null);
    }
  }
  private complete() {
    if (this.#active) this.#active.container.visible = false;
    for (const tier of this.#showing) tier.container.visible = false;
    for (const tier of this.#ending) tier.container.visible = false;
    if (this.#amount) this.#amount.container.visible = false;
    this.setActiveTier(null);
    this.#showing.clear();
    this.#ending = [];
    this.setPhase("complete");
    this.#presentation.setActive(false);
    this.#presentation.setState(null);
  }
  private clearPlayback() {
    for (const tier of this.#tiers.values()) tier.container.visible = false;
    if (this.#amount) this.#amount.container.visible = false;
    this.setActiveTier(null);
    this.#showing.clear();
    this.#ending = [];
    this.#stages = [];
    this.#motionPlan = null;
    this.#motionMode = null;
    this.#stageIndex = -1;
    this.#lastAutomaticAmount = null;
    this.#lastFormattedAmount = "";
  }
  private switchVisibleTiers(state: AwardTierId) {
    const next = this.#tiers.get(state)!;
    for (const tier of this.#showing)
      if (tier !== next) {
        tier.container.visible = false;
        requestTierEnd(tier, this.amountText(), (previous, current) =>
          this.observeSegment(tier, previous, current),
        );
        if (this.#resource.manifest.version >= 6) {
          tier.attachmentHandle?.destroy();
          tier.attachmentHandle = undefined;
        }
      }
    const endingIndex = this.#ending.indexOf(next);
    if (endingIndex >= 0) this.#ending.splice(endingIndex, 1);
    this.#showing.clear();
    if (!next.container.visible) this.startTier(next);
    else this.applyTierStateGate(next, state);
    this.#showing.add(next);
  }
  private startTier(tier: TierRuntime) {
    this.setTierSegment(tier, "start");
    tier.endRequested = false;
    if (this.#resource.manifest.version >= 6) {
      tier.layers.forEach((runtime, index) =>
        configureAwardRuntime(runtime, tier.layerSpecs[index]!),
      );
      tier.attachmentHandle?.destroy();
      tier.attachmentHandle = attachPopupLayerRuntimes({
        layers: [...tier.layerSpecs, tier.amountLayer].sort(
          (left, right) => left.order - right.order,
        ),
        runtimes: tier.runtimesById,
        root: tier.container,
      });
    }
    tier.container.visible = true;
    for (const layer of tier.layers) layer.enter(this.amountText());
    this.#showing.add(tier);
    this.applyTierStateGate(tier);
  }
  private applyTierStateGate(tier: TierRuntime, state?: AwardTierId) {
    void tier;
    void state;
  }
  private destroyTiers(tiers: readonly TierRuntime[]) {
    for (const tier of tiers) {
      if (
        tier.amountMount &&
        this.#amount?.container.parent === tier.amountMount
      )
        tier.amountMount.removeChild(this.#amount.container);
      tier.attachmentHandle?.destroy();
      tier.disposeAmountParent?.();
      if (tier.amountParent !== tier.container)
        tier.amountParent.destroy({ children: false });
    }
    for (const tier of tiers)
      for (const layer of tier.layers)
        if (!this.#destroyedRuntimes.has(layer)) {
          this.#destroyedRuntimes.add(layer);
          layer.destroy();
        }
    for (const tier of tiers) tier.container.destroy({ children: false });
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

class AwardCelebrationEditorPlayer implements AwardCelebrationPlayer {
  readonly #runtime: AwardCelebrationRuntime;
  constructor(runtime: AwardCelebrationRuntime) {
    this.#runtime = runtime;
  }
  get container() {
    return this.#runtime.container;
  }
  get textNodes() {
    return this.#runtime.textNodes;
  }
  get imageStringNodes() {
    return this.#runtime.imageStringNodes;
  }
  applyViewport(
    ...args: Parameters<NonNullable<AwardCelebrationRuntime["applyViewport"]>>
  ) {
    return this.#runtime.applyViewport!(...args);
  }
  init() {
    return this.#runtime.init();
  }
  start(input: Parameters<AwardCelebrationRuntime["start"]>[0]) {
    this.#runtime.start(input);
  }
  update(deltaSeconds: number) {
    this.#runtime.update(deltaSeconds);
    return inspectAwardCelebrationRuntime(this.#runtime);
  }
  requestAdvance() {
    this.#runtime.requestAdvance();
  }
  requestDismiss() {
    this.#runtime.requestDismiss();
  }
  dismissImmediately() {
    this.#runtime.dismissImmediately();
  }
  getSnapshot() {
    return inspectAwardCelebrationRuntime(this.#runtime);
  }
  setTextWidthGuidesVisible(visible: boolean) {
    setPopupTextWidthGuidesInTree(this.#runtime.container, visible);
  }
  getPhase() {
    return this.#runtime.getPhase();
  }
  isPlaying() {
    return this.#runtime.isPlaying();
  }
  getTextNode(selector: PopupStringNodeSelector) {
    return this.#runtime.getTextNode(selector);
  }
  getImageStringNode(selector: PopupStringNodeSelector) {
    return this.#runtime.getImageStringNode(selector);
  }
  destroy() {
    this.#runtime.destroy();
  }
}

function collectAwardStringNodeDefinitions(
  manifest: Extract<PopupManifest, { readonly type: "award-celebration" }>,
) {
  const tiers = [
    manifest.awardCelebration.base,
    manifest.awardCelebration.standard,
    ...manifest.awardCelebration.celebrationTiers,
  ];
  const result: {
    kind: "text" | "image-string";
    name: string;
    defaultText: string;
  }[] = [];
  const names = new Set<string>();
  for (const tier of tiers)
    for (const layer of [...tier.layers].sort((a, b) => a.order - b.order)) {
      if (layer.kind !== "text" && layer.kind !== "image-string") continue;
      const name = layer.name ?? "win-amount";
      if (names.has(name)) continue;
      names.add(name);
      result.push({
        kind: layer.kind,
        name,
        defaultText:
          layer.kind === "text"
            ? layer.defaultText
            : layer.binding === "manual"
              ? (layer.defaultText ?? "")
              : "0",
      });
    }
  return result;
}

function requestTierEnd(
  tier: TierRuntime,
  text: string,
  observe: (previous: PopupSegment, current: PopupSegment) => void,
) {
  if (tier.endRequested) return;
  tier.endRequested = true;
  const previous = tier.segment;
  tier.segment = "end";
  if (previous !== tier.segment) observe(previous, tier.segment);
  for (const layer of tier.layers) layer.requestEnd();
  for (const layer of tier.layers) layer.applySegment("end", text);
}
function animatedLayersLoopReady(layers: readonly PopupLayerRuntime[]) {
  for (const layer of layers)
    if (layer.animated && !layer.isLoopReady()) return false;
  return true;
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

function amountVisibleInState(
  manifest: PopupManifest,
  layer: PopupLayer,
  state: AwardTierId,
): boolean {
  void manifest;
  void layer;
  void state;
  return true;
}

function awardLayerVariantKey(layer: PopupLayer): string {
  return JSON.stringify({
    id: layer.id,
    kind: layer.kind,
    resource: layer.resource ?? null,
  });
}

function configureAwardRuntime(
  runtime: PopupLayerRuntime,
  layer: PopupLayer,
): void {
  runtime.container.position.set(layer.transform.x, layer.transform.y);
  runtime.container.scale.set(layer.transform.scale);
  runtime.container.rotation =
    ((layer.transform.rotation ?? 0) * Math.PI) / 180;
  runtime.container.alpha = layer.alpha ?? 1;
  runtime.configure?.(layer);
}

function defaultLayerFactory(options: {
  readonly layer: PopupLayer;
  readonly resource?: PopupPreparedResource;
  readonly popupId: string;
  readonly tierId: AwardTierId;
}): PopupLayerRuntime {
  const { layer, resource } = options;
  if (layer.kind === "text") {
    if (resource && resource.kind !== "font")
      throw new Error(`popup layer/resource kind mismatch: ${layer.id}`);
  } else if (!resource || layer.kind !== resource.kind) {
    throw new Error(`popup layer/resource kind mismatch: ${layer.id}`);
  }
  const container = new Container();
  container.position.set(layer.transform.x, layer.transform.y);
  container.scale.set(layer.transform.scale);
  container.rotation = ((layer.transform.rotation ?? 0) * Math.PI) / 180;
  container.alpha = layer.alpha ?? 1;
  if (layer.kind === "image" && resource?.kind === "image") {
    const sprite = new Sprite(resource.texture);
    sprite.anchor.set(layer.anchor.x, layer.anchor.y);
    container.addChild(sprite);
    return {
      ...staticRuntime(
        container,
        layer.visibleSegments ?? ["start", "loop", "end"],
      ),
      configure(nextLayer) {
        if (nextLayer.kind !== "image")
          throw new Error(`popup layer kind changed for ${layer.id}.`);
        sprite.anchor.set(nextLayer.anchor.x, nextLayer.anchor.y);
      },
    };
  }
  if (layer.kind === "image-string" && resource?.kind === "image-string") {
    let currentLayer = layer;
    let currentDefaultText =
      layer.binding === "manual" ? (layer.defaultText ?? "") : "0";
    const initialText =
      layer.binding === "manual" ? (layer.defaultText ?? "") : "0";
    const renderer = createRenderImageString({
      resource: resource.resource,
      text: initialText,
      anchor: layer.anchor,
    });
    container.addChild(renderer.container);
    return {
      container,
      animated: false,
      configure(nextLayer) {
        if (nextLayer.kind !== "image-string")
          throw new Error(`popup layer kind changed for ${layer.id}.`);
        currentLayer = nextLayer;
        currentDefaultText =
          nextLayer.binding === "manual" ? (nextLayer.defaultText ?? "") : "0";
        renderer.setAnchor(nextLayer.anchor);
      },
      stringNode: {
        kind: "image-string",
        name: layer.name ?? "win-amount",
        get defaultText() {
          return currentDefaultText;
        },
        setText(text) {
          renderer.setText(text);
        },
      },
      async init() {},
      enter(text) {
        if (currentLayer.binding === "win-amount") renderer.setText(text);
        container.visible =
          currentLayer.binding === "win-amount" ||
          (currentLayer.visibleSegments ?? ["start", "loop", "end"]).includes(
            "start",
          );
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
        if (currentLayer.binding === "win-amount") renderer.setText(text);
        else
          container.visible = (
            currentLayer.visibleSegments ?? ["start", "loop", "end"]
          ).includes(_segment);
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
        container.rotation =
          ((nextLayer.transform.rotation ?? 0) * Math.PI) / 180;
        container.alpha = nextLayer.alpha ?? 1;
      },
      destroy() {
        renderer.destroy();
        container.destroy({ children: false });
      },
    };
  }
  if (layer.kind === "text" && (!resource || resource.kind === "font")) {
    let currentLayer = layer;
    const renderer = createPopupStyledText({
      family: resource?.family ?? "system-ui",
      text: layer.defaultText,
      style: layer.style,
      anchor: layer.anchor,
    });
    container.addChild(renderer.container);
    return {
      container,
      animated: false,
      configure(nextLayer) {
        if (nextLayer.kind !== "text")
          throw new Error(`popup layer kind changed for ${layer.id}.`);
        currentLayer = nextLayer;
        renderer.setPresentation({
          family: resource?.family ?? "system-ui",
          style: nextLayer.style,
          anchor: nextLayer.anchor,
        });
      },
      stringNode: {
        kind: "text",
        name: layer.name,
        get defaultText() {
          return currentLayer.defaultText;
        },
        setText(text) {
          renderer.setText(text);
        },
      },
      async init() {},
      enter() {
        container.visible = (
          currentLayer.visibleSegments ?? ["start", "loop", "end"]
        ).includes("start");
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
        container.visible = (
          currentLayer.visibleSegments ?? ["start", "loop", "end"]
        ).includes(segment);
      },
      destroy() {
        renderer.destroy();
        container.destroy({ children: false });
      },
    };
  }
  if (layer.kind === "spine" && resource?.kind === "spine") {
    const player = createOfficialSpinePlayer({ resource: resource.resource });
    container.addChild(player.view);
    let currentPlayback = layer.playback;
    let state: PopupSegment = "start";
    let complete = false;
    return {
      container,
      spinePlayer: player,
      animated: true,
      configure(nextLayer) {
        if (nextLayer.kind !== "spine")
          throw new Error(`popup layer kind changed for ${layer.id}.`);
        currentPlayback = nextLayer.playback;
      },
      async init() {
        await player.init();
      },
      enter() {
        state = "start";
        complete = false;
        player.play({
          animationName: currentPlayback.startAnimation,
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
            animationName: currentPlayback.loopAnimation,
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
            animationName: currentPlayback.endAnimation,
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
  if (layer.kind === "vni" && resource?.kind === "vni") {
    const player = new VNIRuntime({
      parent: container,
      project: resource.project,
      assetUrls: resource.assetUrls,
    });
    let elapsed = 0;
    let currentPlayback = layer.playback;
    let end = false;
    let complete = false;
    let dispose = () => {};
    let mountIndex = 0;
    return {
      container,
      animated: true,
      configure(nextLayer) {
        if (nextLayer.kind !== "vni")
          throw new Error(`popup layer kind changed for ${layer.id}.`);
        currentPlayback = nextLayer.playback;
      },
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
        startPopupVniPlayback(player, currentPlayback);
        container.visible = true;
      },
      updateAmount() {},
      update(delta) {
        elapsed += delta;
        player.update(delta);
      },
      isLoopReady() {
        return currentPlayback.mode === "once"
          ? complete
          : elapsed >= currentPlayback.loopStartTime || end || complete;
      },
      requestEnd() {
        end = true;
        requestPopupVniPlaybackEnd(player, currentPlayback, {
          immediate: true,
        });
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
