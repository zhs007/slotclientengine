import { Container } from "pixi.js";
import {
  createRenderObject,
  type RenderObject,
} from "../presentation/render-object.js";
import type {
  PopupPackageResource,
  PopupStringNodeHandle,
  PopupStringNodeSelector,
  PopupRuntimeStateObserver,
  SingleStatePopupRuntime,
  SingleStatePopupSnapshot,
} from "./types.js";
import type { SingleStatePopupPlayer } from "./editor-types.js";
import type { PopupObjectInstanceHandle } from "./object-runtime.js";
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

const snapshotReaders = new WeakMap<
  SingleStatePopupRuntime,
  () => SingleStatePopupSnapshot
>();

export function createSingleStatePopupPlayer(options: {
  readonly resource: PopupPackageResource;
}): SingleStatePopupPlayer {
  return new SingleStatePopupEditorPlayer(
    createSingleStatePopupRuntime(options),
  );
}

export function createSingleStatePopupRuntime(options: {
  readonly resource: PopupPackageResource;
  readonly backdropController?: PopupBackdropController;
  readonly observeState?: PopupRuntimeStateObserver;
}): SingleStatePopupRuntime {
  if (options.resource.manifest.type !== "single-state")
    throw new Error(
      "Single-state popup runtime requires a single-state popup package.",
    );
  return new DefaultSingleStatePopupRuntime(
    options.resource as PopupPackageResource & {
      readonly manifest: Extract<
        PopupPackageResource["manifest"],
        { readonly type: "single-state" }
      >;
    },
    options.backdropController,
    options.observeState,
  );
}

class DefaultSingleStatePopupRuntime implements SingleStatePopupRuntime {
  readonly container: Container;
  readonly #manifest: Extract<
    PopupPackageResource["manifest"],
    { readonly type: "single-state" }
  >;
  readonly #layers: readonly SpinePopupOverlayRuntime[];
  readonly #layersByName: ReadonlyMap<string, SpinePopupOverlayRuntime>;
  readonly #renderObjects: ReadonlyMap<string, RenderObject>;
  readonly #objectsById: ReadonlyMap<string, PopupObjectInstanceHandle>;
  readonly #nodes: ReturnType<typeof createPopupStringNodeRegistry>;
  readonly #presentation: ReturnType<typeof createPopupPresentation>;
  readonly #observeState: PopupRuntimeStateObserver | undefined;
  readonly #popupRoot = new Container();
  #attachmentHandle: PopupLayerAttachmentHandle | null = null;
  #phase: SingleStatePopupSnapshot["phase"] = "idle";
  #initialized = false;
  #destroyed = false;

  constructor(
    resource: PopupPackageResource & {
      readonly manifest: Extract<
        PopupPackageResource["manifest"],
        { readonly type: "single-state" }
      >;
    },
    backdropController?: PopupBackdropController,
    observeState?: PopupRuntimeStateObserver,
  ) {
    this.#manifest = resource.manifest;
    this.#presentation = createPopupPresentation(this.#manifest, {
      backdropController,
    });
    this.#observeState = observeState;
    this.container = this.#presentation.container;
    this.container.visible = false;
    this.#popupRoot.sortableChildren = true;
    this.#presentation.contentRoot.addChild(this.#popupRoot);
    this.#layers = this.#manifest.singleState.layers.map((layer) => {
      const prepared = layer.resource
        ? resource.resources[layer.resource]
        : undefined;
      if (!prepared && layer.kind !== "text")
        throw new Error(
          `single-state popup layer resource missing: ${layer.id}.`,
        );
      return createSpinePopupOverlayRuntime({
        popupId: this.#manifest.id,
        layer,
        resource: prepared,
      });
    });
    this.#layersByName = new Map(
      this.#manifest.singleState.layers.map(
        (layer, index) => [layer.id, this.#layers[index]!] as const,
      ),
    );
    this.#renderObjects = new Map(
      [...this.#layersByName].map(([name, runtime]) => [
        name,
        createRenderObject({
          view: runtime.container,
          owned: false,
          assertUsable: () => this.assertUsable(),
          destroy() {},
        }),
      ]),
    );
    this.#objectsById = new Map(
      [...this.#layersByName].flatMap(([id, runtime]) =>
        runtime.objectHandle ? [[id, runtime.objectHandle] as const] : [],
      ),
    );
    this.#nodes = createPopupStringNodeRegistry(
      this.#manifest.singleState.layers.flatMap((layer) =>
        layer.kind === "text" || layer.kind === "image-string"
          ? [
              {
                kind: layer.kind,
                name: layer.id,
                defaultText: layer.defaultText,
              } as const,
            ]
          : [],
      ),
    );
    for (const runtime of this.#layers)
      if (runtime.stringNode)
        this.#nodes.setTarget(runtime.stringNode.name, runtime.stringNode);
    snapshotReaders.set(this, () => this.#createSnapshot());
  }

  get textNodes(): readonly PopupStringNodeHandle[] {
    return this.#nodes.textNodes;
  }

  get imageStringNodes(): readonly PopupStringNodeHandle[] {
    return this.#nodes.imageStringNodes;
  }

  get objects(): readonly PopupObjectInstanceHandle[] {
    this.assertUsable();
    return Object.freeze([...this.#objectsById.values()]);
  }

  applyViewport(
    viewportSize: Parameters<
      NonNullable<SingleStatePopupRuntime["applyViewport"]>
    >[0],
    placement?: Parameters<
      NonNullable<SingleStatePopupRuntime["applyViewport"]>
    >[1],
  ) {
    return this.#presentation.applyViewport(viewportSize, placement);
  }

  async init(): Promise<void> {
    this.assertUsable();
    if (this.#initialized) return;
    try {
      for (const layer of this.#layers) {
        await layer.init();
        this.assertUsable();
      }
      this.#attachmentHandle = attachPopupLayerRuntimes({
        layers: this.#manifest.singleState.layers,
        runtimes: this.#layersByName,
        root: this.#popupRoot,
      });
      this.#initialized = true;
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  start(): void {
    this.assertReady();
    if (this.isPlaying())
      throw new Error("Single-state popup is already playing.");
    this.setPhase("active");
    this.#presentation.setState("active");
    this.container.visible = true;
    this.#presentation.setActive(true);
    for (const layer of this.#layers) layer.start();
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("deltaSeconds must be finite and non-negative.");
    if (!this.isPlaying()) return;
    for (const layer of this.#layers) layer.update(deltaSeconds);
  }

  requestDismiss(): void {
    this.assertReady();
    if (this.isPlaying()) this.complete();
  }

  dismissImmediately(): void {
    this.requestDismiss();
  }

  getPhase(): SingleStatePopupSnapshot["phase"] {
    return this.#phase;
  }

  private setPhase(next: SingleStatePopupSnapshot["phase"]): void {
    const previous = this.#phase;
    if (previous === next) return;
    this.#phase = next;
    this.#observeState?.({ kind: "phase", previous, current: next });
  }

  isPlaying(): boolean {
    return this.#phase === "active";
  }

  getLayer(name: string): RenderObject {
    this.assertReady();
    const layer = this.#renderObjects.get(name);
    if (!layer) throw new Error(`single-state popup layer not found: ${name}.`);
    return layer;
  }

  getObject(id: string): PopupObjectInstanceHandle {
    this.assertReady();
    const object = this.#objectsById.get(id);
    if (!object) throw new Error(`single-state popup object not found: ${id}.`);
    return object;
  }

  getTextNode(selector: PopupStringNodeSelector): PopupStringNodeHandle {
    this.assertUsable();
    return this.#nodes.getTextNode(selector);
  }

  getImageStringNode(selector: PopupStringNodeSelector): PopupStringNodeHandle {
    this.assertUsable();
    return this.#nodes.getImageStringNode(selector);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#attachmentHandle?.destroy();
    this.#attachmentHandle = null;
    for (const layer of this.#layers) layer.destroy();
    this.#nodes.destroy();
    this.#popupRoot.destroy({ children: false });
    this.#presentation.destroy();
  }

  #createSnapshot(): SingleStatePopupSnapshot {
    this.assertUsable();
    return Object.freeze({
      phase: this.#phase,
      activeLayerCount: this.#phase === "active" ? this.#layers.length : 0,
    });
  }

  private complete(): void {
    this.setPhase("complete");
    this.#presentation.setState(null);
    this.container.visible = false;
    this.#presentation.setActive(false);
  }

  private assertReady(): void {
    this.assertUsable();
    if (!this.#initialized)
      throw new Error(
        "Single-state popup runtime.init() must complete before use.",
      );
  }

  private assertUsable(): void {
    if (this.#destroyed)
      throw new Error("Single-state popup runtime was destroyed.");
  }
}

class SingleStatePopupEditorPlayer implements SingleStatePopupPlayer {
  readonly #runtime: SingleStatePopupRuntime;

  constructor(runtime: SingleStatePopupRuntime) {
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
  get objects() {
    return this.#runtime.objects;
  }
  applyViewport(
    ...args: Parameters<NonNullable<SingleStatePopupRuntime["applyViewport"]>>
  ) {
    return this.#runtime.applyViewport!(...args);
  }
  init() {
    return this.#runtime.init();
  }
  start() {
    this.#runtime.start();
  }
  update(deltaSeconds: number) {
    this.#runtime.update(deltaSeconds);
    return inspectSingleStatePopupRuntime(this.#runtime);
  }
  requestDismiss() {
    this.#runtime.requestDismiss();
  }
  dismissImmediately() {
    this.#runtime.dismissImmediately();
  }
  getSnapshot() {
    return inspectSingleStatePopupRuntime(this.#runtime);
  }
  setTextWidthGuidesVisible(visible: boolean, canvasPixelsPerViewportUnit = 1) {
    setPopupTextWidthGuidesInTree(
      this.#runtime.container,
      visible,
      canvasPixelsPerViewportUnit,
    );
  }
  getPhase() {
    return this.#runtime.getPhase();
  }
  isPlaying() {
    return this.#runtime.isPlaying();
  }
  getLayer(name: string) {
    return this.#runtime.getLayer(name);
  }
  getTextNode(selector: PopupStringNodeSelector) {
    return this.#runtime.getTextNode(selector);
  }
  getImageStringNode(selector: PopupStringNodeSelector) {
    return this.#runtime.getImageStringNode(selector);
  }
  getObject(id: string) {
    return this.#runtime.getObject(id);
  }
  destroy() {
    this.#runtime.destroy();
  }
}

export function inspectSingleStatePopupRuntime(
  runtime: SingleStatePopupRuntime,
): SingleStatePopupSnapshot {
  const read = snapshotReaders.get(runtime);
  if (!read)
    throw new Error(
      "Single-state popup runtime was not created by this package.",
    );
  return read();
}
