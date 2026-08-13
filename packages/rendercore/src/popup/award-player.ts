import { Container, Sprite } from "pixi.js";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";
import { createRenderImageString } from "../image-string/index.js";
import {
  createOfficialSpinePlayer,
  type RendercoreSpineSlotPlayer,
} from "../spine/runtime-player.js";
import {
  createAwardCountStages,
  type AwardCountStage,
} from "./award-sequence.js";
import { formatPopupAmount } from "./amount-format.js";
import { createPopupStringNodeRegistry } from "./string-node-registry.js";
import { createPopupStyledText } from "./styled-text.js";
import {
  requestPopupVniPlaybackEnd,
  startPopupVniPlayback,
} from "./vni-playback.js";
import type {
  AwardCelebrationPlayer,
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
} from "./types.js";
import { createPopupPresentation } from "./presentation.js";
import { popupLayerVisibleInState } from "./state-visibility.js";
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
  readonly #showing = new Set<TierRuntime>();
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
      readonly manifest: Extract<
        PopupManifest,
        { readonly type: "award-celebration" }
      >;
    };
    this.#presentation = createPopupPresentation(this.#resource.manifest);
    this.container = this.#presentation.container;
    this.#factory = options.layerFactory ?? defaultLayerFactory;
    this.#formatAmount =
      options.formatAmount ??
      ((amountRaw) =>
        formatPopupAmount(amountRaw, this.#resource.manifest.amountFormat));
    this.#nodes = createPopupStringNodeRegistry(
      collectAwardStringNodeDefinitions(this.#resource.manifest),
    );
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
      NonNullable<AwardCelebrationPlayer["applyViewport"]>
    >[0],
    placement?: Parameters<
      NonNullable<AwardCelebrationPlayer["applyViewport"]>
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
    this.#displayed = 0;
    this.#nodes.setAutomaticText("win-amount", this.formatAmount(0));
    this.#stages = createAwardCountStages(this.#resource.manifest, input);
    if (!this.#stages.length) {
      this.#phase = "complete";
      this.#presentation.setActive(false);
      return;
    }
    this.startNextStage();
  }
  update(deltaSeconds: number): AwardCelebrationSnapshot {
    this.assertReady();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("deltaSeconds must be finite and non-negative.");
    for (const tier of new Set([...this.#showing, ...this.#ending]))
      this.updateTier(tier, deltaSeconds);
    this.drainEnding();
    if (this.#phase === "dismissing") {
      if (!this.#showing.size && !this.#ending.length) this.complete();
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
    for (const tier of this.#showing) {
      requestTierEnd(tier, this.amountText());
      if (!this.#ending.includes(tier)) this.#ending.push(tier);
    }
    this.#showing.clear();
    if (!this.#ending.length) this.complete();
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
          segment: "start",
          endRequested: false,
        };
        created.push(tier);
        this.#presentation.contentRoot.addChild(container);
        const runtimesById = new Map<string, PopupLayerRuntime>();
        for (const layer of orderedLayers) {
          if (layer.kind === "image-string" && layer.binding === "win-amount")
            continue;
          const runtime = this.#factory({
            layer,
            resource: layer.resource
              ? this.#resource.resources[layer.resource]
              : undefined,
            popupId: manifest.id,
            tierId: id,
          });
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
        await Promise.all(layers.map((layer) => layer.init()));
        if (manifest.version >= 4) {
          const amountMount = new Container();
          amountMount.label = `popup amount mount ${id}`;
          runtimesById.set(amountLayer.id, {
            container: amountMount,
          } as PopupLayerRuntime);
          tier.amountMount = amountMount;
          tier.amountParent = amountMount;
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
    this.#active = tier;
    this.#presentation.setState(stage.tierId);
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
    this.#active = null;
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
      this.applyTierStateGate(tier);
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
      this.applyTierStateGate(tier);
    }
  }
  private drainEnding() {
    const remaining: TierRuntime[] = [];
    for (const tier of this.#ending) {
      if (tierEnded(tier)) {
        if (!this.#showing.has(tier)) tier.container.visible = false;
      } else remaining.push(tier);
    }
    this.#ending = remaining;
  }
  private updateAmount() {
    const automatic = this.formatAmount(Math.floor(this.#displayed));
    this.#nodes.setAutomaticText("win-amount", automatic);
    this.#amount?.updateAmount(this.amountText());
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
    this.#active = null;
    this.#showing.clear();
    this.#ending = [];
    this.#phase = "complete";
    this.#presentation.setActive(false);
    this.#presentation.setState(null);
  }
  private clearPlayback() {
    for (const tier of this.#tiers.values()) tier.container.visible = false;
    if (this.#amount) this.#amount.container.visible = false;
    this.#active = null;
    this.#showing.clear();
    this.#ending = [];
    this.#stages = [];
    this.#stageIndex = -1;
  }
  private switchVisibleTiers(state: AwardTierId) {
    if (this.#resource.manifest.version !== 5) {
      const tier = this.#tiers.get(state)!;
      for (const current of this.#showing)
        if (current !== tier) {
          requestTierEnd(current, this.amountText());
          if (!this.#ending.includes(current)) this.#ending.push(current);
        }
      this.#showing.clear();
      this.startTier(tier);
      return;
    }
    const next = new Set(
      [...this.#tiers.values()].filter((tier) =>
        tier.layerSpecs.some((layer) =>
          popupLayerVisibleInState(this.#resource.manifest, layer, state),
        ),
      ),
    );
    for (const tier of this.#showing)
      if (!next.has(tier)) {
        requestTierEnd(tier, this.amountText());
        if (!this.#ending.includes(tier)) this.#ending.push(tier);
      }
    for (const tier of next) {
      const endingIndex = this.#ending.indexOf(tier);
      if (endingIndex >= 0) this.#ending.splice(endingIndex, 1);
      if (!this.#showing.has(tier)) this.startTier(tier);
      else this.applyTierStateGate(tier, state);
    }
    this.#showing.clear();
    for (const tier of next) this.#showing.add(tier);
  }
  private startTier(tier: TierRuntime) {
    tier.segment = "start";
    tier.endRequested = false;
    tier.container.visible = true;
    for (const layer of tier.layers) layer.enter(this.amountText());
    this.#showing.add(tier);
    this.applyTierStateGate(tier);
  }
  private applyTierStateGate(tier: TierRuntime, state?: AwardTierId) {
    if (this.#resource.manifest.version !== 5) return;
    const current = state ?? this.#stages[this.#stageIndex]?.tierId;
    if (!current) return;
    tier.layers.forEach((runtime, index) => {
      runtime.container.visible = popupLayerVisibleInState(
        this.#resource.manifest,
        tier.layerSpecs[index]!,
        current,
      );
    });
  }
  private destroyTier(tier: TierRuntime) {
    if (tier.amountMount && this.#amount?.container.parent === tier.amountMount)
      tier.amountMount.removeChild(this.#amount.container);
    tier.attachmentHandle?.destroy();
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

function amountVisibleInState(
  manifest: PopupManifest,
  layer: PopupLayer,
  state: AwardTierId,
): boolean {
  return popupLayerVisibleInState(manifest, layer, state);
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
    return staticRuntime(
      container,
      layer.visibleSegments ?? ["start", "loop", "end"],
    );
  }
  if (layer.kind === "image-string" && resource?.kind === "image-string") {
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
      stringNode: {
        kind: "image-string",
        name: layer.name ?? "win-amount",
        defaultText: initialText,
        setText(text) {
          renderer.setText(text);
        },
      },
      async init() {},
      enter(text) {
        if (layer.binding === "win-amount") renderer.setText(text);
        container.visible =
          layer.binding === "win-amount" ||
          (layer.visibleSegments ?? ["start", "loop", "end"]).includes("start");
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
        if (layer.binding === "win-amount") renderer.setText(text);
        else
          container.visible = (
            layer.visibleSegments ?? ["start", "loop", "end"]
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
      stringNode: {
        kind: "text",
        name: layer.name,
        defaultText: layer.defaultText,
        setText(text) {
          renderer.setText(text);
        },
      },
      async init() {},
      enter() {
        container.visible = (
          layer.visibleSegments ?? ["start", "loop", "end"]
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
          layer.visibleSegments ?? ["start", "loop", "end"]
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
    let state: PopupSegment = "start";
    let complete = false;
    return {
      container,
      spinePlayer: player,
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
  if (layer.kind === "vni" && resource?.kind === "vni") {
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
