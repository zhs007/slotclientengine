import { Container, type Text } from "pixi.js";
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
  type RendercoreSpineSlotPlayer,
} from "../spine/runtime-player.js";
import type {
  PopupPackageResource,
  PopupStringNodeHandle,
  PopupStringNodeSelector,
  PopupRuntimeStateObserver,
  SpinePopupRuntime,
  SpinePopupSnapshot,
} from "./types.js";
import type { SpinePopupPlayer } from "./editor-types.js";
import { createPopupPromptText } from "./prompt-text.js";
import { createPopupStringNodeRegistry } from "./string-node-registry.js";
import { setPopupTextWidthGuidesInTree } from "./styled-text.js";
import {
  createSpinePopupOverlayRuntime,
  type SpinePopupOverlayRuntime,
} from "./spine-overlay-runtime.js";
import {
  createPopupPresentation,
  type PopupBackdropController,
} from "./presentation.js";
import {
  attachPopupLayerRuntimes,
  type PopupLayerAttachmentHandle,
} from "./layer-attachment.js";

const spineSnapshotReaders = new WeakMap<
  SpinePopupRuntime,
  () => SpinePopupSnapshot
>();

export function createSpinePopupPlayer(options: {
  readonly resource: PopupPackageResource;
  readonly playerFactory?: () => RendercoreSpinePlayer;
  readonly measurePromptText?: (text: Text) => {
    readonly width: number;
    readonly height: number;
  };
}): SpinePopupPlayer {
  return new SpinePopupEditorPlayer(createSpinePopupRuntime(options));
}

export function createSpinePopupRuntime(options: {
  readonly resource: PopupPackageResource;
  readonly playerFactory?: () => RendercoreSpinePlayer;
  readonly measurePromptText?: (text: Text) => {
    readonly width: number;
    readonly height: number;
  };
  readonly backdropController?: PopupBackdropController;
  readonly observeState?: PopupRuntimeStateObserver;
}): SpinePopupRuntime {
  if (options.resource.manifest.type !== "spine")
    throw new Error("Spine popup player requires a spine popup package.");
  const manifest = options.resource.manifest;
  const prepared = options.resource.resources[manifest.spine.resource];
  if (prepared?.kind !== "spine")
    throw new Error("Spine popup prepared resource mismatch.");
  const player = options.playerFactory
    ? options.playerFactory()
    : createOfficialSpinePlayer({ resource: prepared.resource });
  return new DefaultSpinePopupRuntime(
    options.resource as PopupPackageResource & {
      readonly manifest: typeof manifest;
    },
    player,
    options.measurePromptText,
    options.backdropController,
    options.observeState,
  );
}

class DefaultSpinePopupRuntime implements SpinePopupRuntime {
  readonly container: Container;
  readonly #manifest: Extract<
    PopupPackageResource["manifest"],
    { readonly type: "spine" }
  >;
  readonly #player: RendercoreSpinePlayer;
  readonly #overlays: readonly SpinePopupOverlayRuntime[];
  readonly #prompt: ReturnType<typeof createPopupPromptText> | null;
  readonly #nodes: ReturnType<typeof createPopupStringNodeRegistry>;
  readonly #presentation: ReturnType<typeof createPopupPresentation>;
  readonly #observeState: PopupRuntimeStateObserver | undefined;
  readonly #popupRoot = new Container();
  #attachmentHandle: PopupLayerAttachmentHandle | null = null;
  #phase: SpinePopupSnapshot["phase"] = "idle";
  #dismissRequested = false;
  #initialized = false;
  #destroyed = false;

  constructor(
    resource: PopupPackageResource & {
      readonly manifest: Extract<
        PopupPackageResource["manifest"],
        { readonly type: "spine" }
      >;
    },
    player: RendercoreSpinePlayer,
    measurePromptText?: (text: Text) => {
      readonly width: number;
      readonly height: number;
    },
    backdropController?: PopupBackdropController,
    observeState?: PopupRuntimeStateObserver,
  ) {
    const manifest = resource.manifest;
    this.#manifest = manifest;
    this.#player = player;
    this.#presentation = createPopupPresentation(manifest, {
      backdropController,
    });
    this.#observeState = observeState;
    this.container = this.#presentation.container;
    this.#popupRoot.position.set(
      manifest.spine.transform.x,
      manifest.spine.transform.y,
    );
    this.#popupRoot.scale.set(manifest.spine.transform.scale);
    this.container.visible = false;
    this.#popupRoot.sortableChildren = true;
    this.#presentation.contentRoot.addChild(this.#popupRoot);
    player.view.zIndex = -1;
    this.#popupRoot.addChild(player.view);
    this.#overlays = (manifest.spine.overlays ?? []).map((layer) => {
      const prepared = layer.resource
        ? resource.resources[layer.resource]
        : undefined;
      if (!prepared && layer.kind !== "text")
        throw new Error(
          `Spine popup overlay resource missing: ${layer.resource}`,
        );
      const runtime = createSpinePopupOverlayRuntime({
        popupId: manifest.id,
        layer,
        resource: prepared,
      });
      if (manifest.version < 4) this.#popupRoot.addChild(runtime.container);
      return runtime;
    });
    const prompt = manifest.spine.prompt;
    if (prompt) {
      const font = prompt.font ? resource.resources[prompt.font] : undefined;
      if (prompt.font && font?.kind !== "font")
        throw new Error("Spine popup prompt font resource mismatch.");
      this.#prompt = createPopupPromptText({
        spec: prompt,
        ...(font?.kind === "font" ? { family: font.family } : {}),
        measureText: measurePromptText,
      });
      this.#prompt.text.zIndex = prompt.order;
      this.#popupRoot.addChild(this.#prompt.text);
    } else this.#prompt = null;
    this.#nodes = createPopupStringNodeRegistry(
      collectSpineStringNodeDefinitions(manifest),
    );
    spineSnapshotReaders.set(this, () => this.#createSnapshot());
    for (const overlay of this.#overlays)
      if (overlay.stringNode)
        this.#nodes.setTarget(overlay.stringNode.name, overlay.stringNode);
    if (this.#prompt)
      this.#nodes.setTarget("prompt", {
        setText: (text) => this.#prompt!.setText(text),
      });
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
      NonNullable<SpinePopupRuntime["applyViewport"]>
    >[0],
    placement?: Parameters<NonNullable<SpinePopupRuntime["applyViewport"]>>[1],
  ) {
    return this.#presentation.applyViewport(viewportSize, placement);
  }

  async init(): Promise<void> {
    this.assertUsable();
    if (this.#initialized) return;
    try {
      await this.#player.init();
      this.assertUsable();
      for (const overlay of this.#overlays) {
        await overlay.init();
        this.assertUsable();
      }
      if (this.#manifest.version >= 4) {
        const layers = this.#manifest.spine.overlays ?? [];
        this.#attachmentHandle = attachPopupLayerRuntimes({
          layers,
          runtimes: new Map(
            layers.map(
              (layer, index) => [layer.id, this.#overlays[index]!] as const,
            ),
          ),
          root: this.#popupRoot,
          ...(isSpineSlotPlayer(this.#player)
            ? { mainSpine: this.#player }
            : {}),
        });
      }
      this.#initialized = true;
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  start(text?: string): void {
    this.assertReady();
    if (this.isPlaying()) throw new Error("Spine popup is already playing.");
    if (this.#prompt) {
      this.#nodes.setAutomaticText(
        "prompt",
        text ?? this.#manifest.spine.prompt!.defaultText,
      );
    } else if (text !== undefined) {
      throw new Error("Spine popup does not define a prompt.");
    }
    this.#dismissRequested = false;
    this.setPhase("start");
    this.#presentation.setState("start");
    this.container.visible = true;
    this.#presentation.setActive(true);
    if (this.#prompt) {
      this.#prompt.text.visible = true;
    }
    for (const overlay of this.#overlays) overlay.start();
    this.#player.play({
      animationName: this.#manifest.spine.playback.startAnimation,
      loop: false,
    });
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("deltaSeconds must be finite and non-negative.");
    if (!this.isPlaying()) return;
    const result = this.#player.update(deltaSeconds);
    for (const overlay of this.#overlays) overlay.update(deltaSeconds);
    if (this.#phase === "start" && result.completed) {
      this.setPhase("loop");
      this.#presentation.setState("loop");
      for (const overlay of this.#overlays) overlay.applySegment("loop");
      this.#player.play({
        animationName: this.#manifest.spine.playback.loopAnimation,
        loop: true,
      });
    } else if (this.#phase === "end" && result.completed) {
      this.complete();
    }
  }

  requestDismiss(): void {
    this.assertReady();
    if (this.#phase !== "loop") return;
    this.#dismissRequested = true;
    this.setPhase("end");
    this.#presentation.setState("end");
    if (this.#prompt) this.#prompt.text.visible = false;
    for (const overlay of this.#overlays) overlay.applySegment("end");
    this.#player.play({
      animationName: this.#manifest.spine.playback.endAnimation,
      loop: false,
    });
  }

  dismissImmediately(): void {
    this.assertReady();
    if (this.isPlaying()) this.complete();
  }

  #createSnapshot(): SpinePopupSnapshot {
    this.assertUsable();
    return Object.freeze({
      phase: this.#phase,
      dismissRequested: this.#dismissRequested,
    });
  }

  isPlaying(): boolean {
    return ["start", "loop", "end"].includes(this.#phase);
  }

  getPhase(): SpinePopupSnapshot["phase"] {
    return this.#phase;
  }

  private setPhase(next: SpinePopupSnapshot["phase"]): void {
    const previous = this.#phase;
    if (previous === next) return;
    this.#phase = next;
    this.#observeState?.({ kind: "phase", previous, current: next });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#attachmentHandle?.destroy();
    this.#attachmentHandle = null;
    this.#player.destroy();
    for (const overlay of this.#overlays) overlay.destroy();
    this.#prompt?.text.destroy();
    this.#nodes.destroy();
    this.#popupRoot.destroy({ children: false });
    this.#presentation.destroy();
  }

  private complete(): void {
    this.#player.reset();
    if (this.#prompt) this.#prompt.text.visible = false;
    this.setPhase("complete");
    this.#presentation.setState(null);
    this.container.visible = false;
    this.#presentation.setActive(false);
  }

  private assertReady(): void {
    this.assertUsable();
    if (!this.#initialized)
      throw new Error("Spine popup player.init() must complete before use.");
  }

  private assertUsable(): void {
    if (this.#destroyed) throw new Error("Spine popup player was destroyed.");
  }
}

class SpinePopupEditorPlayer implements SpinePopupPlayer {
  readonly #runtime: SpinePopupRuntime;
  constructor(runtime: SpinePopupRuntime) {
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
    ...args: Parameters<NonNullable<SpinePopupRuntime["applyViewport"]>>
  ) {
    return this.#runtime.applyViewport!(...args);
  }
  init() {
    return this.#runtime.init();
  }
  start(text?: string) {
    this.#runtime.start(text);
  }
  update(deltaSeconds: number) {
    this.#runtime.update(deltaSeconds);
    return inspectSpinePopupRuntime(this.#runtime);
  }
  requestDismiss() {
    this.#runtime.requestDismiss();
  }
  dismissImmediately() {
    this.#runtime.dismissImmediately();
  }
  getSnapshot() {
    return inspectSpinePopupRuntime(this.#runtime);
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

function inspectSpinePopupRuntime(runtime: SpinePopupRuntime) {
  const read = spineSnapshotReaders.get(runtime);
  if (!read) throw new Error("Spine popup runtime inspection is unavailable.");
  return read();
}

function isSpineSlotPlayer(
  player: RendercoreSpinePlayer,
): player is RendercoreSpineSlotPlayer {
  const candidate = player as Partial<RendercoreSpineSlotPlayer>;
  return (
    typeof candidate.attachSlotObject === "function" &&
    typeof candidate.removeSlotObject === "function"
  );
}

function collectSpineStringNodeDefinitions(
  manifest: Extract<
    PopupPackageResource["manifest"],
    { readonly type: "spine" }
  >,
) {
  const values: {
    order: number;
    kind: "text" | "image-string";
    name: string;
    defaultText: string;
  }[] = [];
  if (manifest.spine.prompt)
    values.push({
      order: manifest.spine.prompt.order,
      kind: "text",
      name: "prompt",
      defaultText: manifest.spine.prompt.defaultText,
    });
  for (const layer of manifest.spine.overlays ?? [])
    if (layer.kind === "text" || layer.kind === "image-string")
      values.push({
        order: layer.order,
        kind: layer.kind,
        name: layer.name,
        defaultText: layer.defaultText,
      });
  return values.sort((a, b) => a.order - b.order);
}
