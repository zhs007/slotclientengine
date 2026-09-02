import {
  Assets,
  Cache,
  Container,
  Graphics,
  Sprite,
  type FederatedPointerEvent,
  type Texture,
} from "pixi.js";
import { VNIRuntime } from "@slotclientengine/vnicore/core";
import {
  assertValidSpineDeltaSeconds,
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
  type RendercoreSpineSlotPlayer,
} from "../spine/runtime-player.js";
import { SpineStateController } from "../spine/state-controller.js";
import {
  createRenderImageString,
  type RenderImageString,
} from "../image-string/core/index.js";
import type { RenderViewportSize } from "../viewport/index.js";
import { SceneLayoutError } from "./errors.js";
import { parseSceneLayoutManifestDocument } from "./manifest.js";
import { upgradeSceneLayoutManifestToLatest } from "./manifest-v3.js";
import { resolveSceneLayoutViewportV7 } from "./geometry.js";
import type {
  AttachChildOptions,
  AttachRelativeOptions,
  ResolvedSceneLayoutMainGrid,
  SceneLayoutNode,
  SceneLayoutGraphicNode,
  SceneLayoutManifest,
  SceneLayoutManifestLatest,
  SceneLayoutNodePlacement,
  SceneLayoutResource,
  SceneLayoutRuntime,
  SceneLayoutSnapshot,
  SceneLayoutNodeStateSnapshot,
  SceneLayoutOrientationVariantId,
  SceneLayoutNodeRenderLayerPlacement,
  SceneLayoutPoint,
  SceneLayoutPointSelector,
  SceneLayoutRenderLayerRef,
  SceneLayoutRenderObject,
  SceneLayoutRadioState,
  SceneLayoutStepSliderControlSpec,
  SceneLayoutUiControl,
  SceneLayoutUiControlStateSource,
  SceneLayoutRenderObjectMotion,
  SceneLayoutRenderObjectMotionOptions,
  SceneLayoutRenderObjectMotionTarget,
  SceneLayoutRenderObjectPropertyAnimation,
  SceneLayoutSpineAnimationPlayOptions,
  SceneLayoutSpineSlotObjectAttachment,
  SceneLayoutSpineSlotObjectBinding,
} from "./types.js";
import {
  assertStepSliderState,
  clampStepSliderPosition,
  resolveNearestStepSliderState,
  resolveSceneLayoutUiControlSize,
  resolveStepSliderPosition,
} from "./ui-control.js";
import type { RenderObjectChildLayerRef } from "../presentation/render-object.js";
import {
  createRenderObjectLayer,
  type RenderObjectLayer,
  type RenderObjectLayerController,
} from "../presentation/render-object-layer.js";
import { resolveSceneLayoutRenderLayerRef } from "./render-layer-ref.js";
import {
  getRenderObjectAdapter,
  registerRenderObjectCleanup,
} from "../presentation/render-object.js";
import {
  createContainerRenderAnchor,
  resolveRenderAnchor,
} from "../presentation/render-anchor.js";
import {
  attachRenderObjectMotionAdapter,
  cancelRenderObjectMotion,
  createRenderObjectMotionBinding,
  createRenderObjectMotionController,
  createRenderObjectMotionRuntime,
  type RenderObjectMotion,
  type RenderObjectMotionAttachment,
  type RenderObjectMotionBinding,
  type RenderObjectMotionRuntime,
  type RenderObjectMotionState,
} from "../presentation/render-object-motion.js";

export interface CreateSceneLayoutRuntimeOptions {
  readonly resource: SceneLayoutResource;
  /** @internal Package runtimes may defer non-initial mode node preparation. */
  readonly initialNodeIds?: readonly string[];
  readonly loadTexture?: (url: string) => Promise<Texture>;
  readonly unloadTexture?: (url: string) => Promise<void>;
  readonly createSpinePlayer?: (options: {
    readonly node: SceneLayoutGraphicNode;
    readonly resource: SceneLayoutResource["spineResources"][string];
  }) => RendercoreSpinePlayer;
  readonly createVniPlayer?: (options: {
    readonly node: SceneLayoutGraphicNode;
    readonly parent: Container;
    readonly resource: SceneLayoutResource["vniResources"][string];
  }) => SceneLayoutVniPlayer;
  /** @internal Package runtime instrumentation; not an authored layout hook. */
  readonly observeSpinePlayback?: (
    event: SceneLayoutSpinePlaybackEvent,
  ) => void;
  /** @internal Package runtime event bridge. */
  readonly observeUiControlState?: (
    event: SceneLayoutUiControlStateEvent,
  ) => void;
}

export type SceneLayoutUiControlStateEvent =
  | Readonly<{
      controlId: string;
      controlKind: "radio";
      previousState: SceneLayoutRadioState;
      state: SceneLayoutRadioState;
      source: SceneLayoutUiControlStateSource;
    }>
  | Readonly<{
      controlId: string;
      controlKind: "step-slider";
      previousState: number;
      state: number;
      source: SceneLayoutUiControlStateSource;
    }>;

export type SceneLayoutSpinePlaybackOutcome =
  "completed" | "stopped" | "superseded" | "aborted" | "failed" | "destroyed";

export interface SceneLayoutSpinePlaybackEvent {
  readonly nodeId: string;
  readonly animation: string;
  readonly loop: boolean;
  readonly phase: "started" | "ended";
  readonly outcome?: SceneLayoutSpinePlaybackOutcome;
}

export interface SceneLayoutVniPlayer {
  init(): Promise<void>;
  setLoop(loop: boolean): void;
  play(): void;
  update(deltaSeconds: number): void;
  destroy(): void;
  getDisplayObject(): Container;
  attachNodeToTextLayer?(options: {
    readonly id: string;
    readonly layerId: string;
    readonly node: Container;
    readonly destroyOnDetach?: boolean;
    readonly hideOriginal?: boolean;
  }): () => void;
}

interface RuntimeNode {
  readonly spec: SceneLayoutNode;
  readonly slot: Container;
  readonly named: Container;
  readonly before: Container;
  readonly after: Container;
  player: RendercoreSpinePlayer | null;
  vniPlayer: SceneLayoutVniPlayer | null;
  stateController: SpineStateController | null;
  imageString: RenderImageString | null;
  imageSprite: Sprite | null;
  texture: Texture | null;
  uiControl: RuntimeUiControl | null;
  programPlayback: NodeProgramPlayback | null;
  programMotion: RenderObjectMotion | null;
  programMotionAttachment: RenderObjectMotionAttachment | null;
  readonly programMotionBinding: RenderObjectMotionBinding;
  prepared: boolean;
  homeX: number;
  homeY: number;
  homeScale: number;
  homeRotationDegrees: number;
  motionState: RenderObjectMotionState;
  slotObjectAttachment: ActiveNodeSlotObjectAttachment | null;
}

interface RuntimeRadioControl {
  readonly kind: "radio";
  readonly textures: Readonly<Record<SceneLayoutRadioState, Texture>>;
  readonly sprite: Sprite;
  state: SceneLayoutRadioState;
}

interface StepSliderSnap {
  readonly fromX: number;
  readonly targetX: number;
  readonly targetState: number;
  readonly source: SceneLayoutUiControlStateSource | null;
  readonly durationSeconds: number;
  elapsedSeconds: number;
  readonly resolve?: () => void;
  readonly reject?: (error: Error) => void;
}

interface RuntimeStepSliderControl {
  readonly kind: "step-slider";
  readonly spec: SceneLayoutStepSliderControlSpec;
  readonly view: Container;
  readonly trackSprite: Sprite;
  readonly thumbSprite: Sprite;
  state: number;
  pointerId: number | null;
  snap: StepSliderSnap | null;
}

type RuntimeUiControl = RuntimeRadioControl | RuntimeStepSliderControl;

interface NodeProgramPlayback {
  readonly animation: string;
  readonly loop: boolean;
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
}

interface PreparedNodeSlotObjectBinding {
  readonly slot: string;
  readonly object: SceneLayoutSpineSlotObjectBinding["object"];
  readonly view: Container;
  readonly followSlotColor?: boolean;
}

interface ActiveNodeSlotObjectAttachment {
  active: boolean;
  readonly bindings: readonly PreparedNodeSlotObjectBinding[];
  readonly unregisterCleanup: (() => void)[];
  readonly motionAttachments: RenderObjectMotionAttachment[];
  detach(): void;
}

export function createSceneLayoutRuntime(
  options: CreateSceneLayoutRuntimeOptions,
): SceneLayoutRuntime {
  return new DefaultSceneLayoutRuntime(options);
}

/** @internal Package runtimes use this only after validating their owned document. */
export function createPreparedSceneLayoutRuntime(
  options: CreateSceneLayoutRuntimeOptions,
) {
  return new DefaultSceneLayoutRuntime(options);
}

class DefaultSceneLayoutRuntime implements SceneLayoutRuntime {
  readonly container = new Container();
  readonly #resource: SceneLayoutResource;
  readonly #loadTexture: (url: string) => Promise<Texture>;
  readonly #unloadTexture: (url: string) => Promise<void>;
  readonly #createSpinePlayer: NonNullable<
    CreateSceneLayoutRuntimeOptions["createSpinePlayer"]
  >;
  readonly #createVniPlayer: NonNullable<
    CreateSceneLayoutRuntimeOptions["createVniPlayer"]
  >;
  readonly #observeSpinePlayback?: (
    event: SceneLayoutSpinePlaybackEvent,
  ) => void;
  readonly #observeUiControlState?: (
    event: SceneLayoutUiControlStateEvent,
  ) => void;
  readonly #initialNodeIds: readonly string[] | null;
  readonly #nodes: readonly RuntimeNode[];
  readonly #nodesById: ReadonlyMap<string, RuntimeNode>;
  readonly #viewportMask = new Graphics();
  readonly #rootRenderLayerContainer = new Container();
  readonly #rootRenderLayerController: RenderObjectLayerController;
  readonly #nodeRenderLayerControllers = new Map<
    string,
    Readonly<
      Record<SceneLayoutNodeRenderLayerPlacement, RenderObjectLayerController>
    >
  >();
  readonly #loadedTextureUrls = new Set<string>();
  readonly #texturesByUrl = new Map<string, Texture>();
  readonly #texturePromisesByUrl = new Map<string, Promise<Texture>>();
  readonly #authoredNodeActive = new Map<string, boolean>();
  readonly #programNodeVisible = new Map<string, boolean>();
  readonly #renderObjects = new Map<string, SceneLayoutRenderObject>();
  readonly #uiControls = new Map<string, SceneLayoutUiControl>();
  readonly #nodeChildLayers = new Map<
    string,
    Map<
      string,
      {
        readonly controller: RenderObjectLayerController;
        readonly view: Container;
        readonly detach: () => void;
      }
    >
  >();
  readonly #renderObjectMotionRuntime: RenderObjectMotionRuntime;
  #manifest: SceneLayoutManifestLatest;
  #snapshot: SceneLayoutSnapshot | null = null;
  #modeId: string;
  #initializing = false;
  #initialized = false;
  #destroyed = false;

  constructor(options: CreateSceneLayoutRuntimeOptions) {
    this.#renderObjectMotionRuntime = createRenderObjectMotionRuntime({
      createError: (message) => new SceneLayoutError(message),
    });
    this.#resource = options.resource;
    this.#manifest = upgradeSceneLayoutManifestToLatest(
      options.resource.manifest,
    );
    this.#modeId = this.#manifest.gameModes.initialMode;
    this.#loadTexture = options.loadTexture ?? loadSceneLayoutTexture;
    this.#unloadTexture =
      options.unloadTexture ??
      (options.loadTexture ? async () => undefined : unloadSceneLayoutTexture);
    this.#createSpinePlayer =
      options.createSpinePlayer ??
      ((playerOptions) =>
        createOfficialSpinePlayer({
          resource: playerOptions.resource,
          createError: (message) => new SceneLayoutError(message),
        }));
    this.#createVniPlayer =
      options.createVniPlayer ??
      ((playerOptions) => {
        const profile = playerOptions.resource.project.exportProfile;
        if (!profile || profile.purpose !== "runtime") {
          throw new SceneLayoutError(
            `Scene layout VNI node "${playerOptions.node.id}" is missing a runtime exportProfile.`,
          );
        }
        return new VNIRuntime({
          parent: playerOptions.parent,
          project: playerOptions.resource.project,
          assetUrls: playerOptions.resource.assetUrls,
        });
      });
    this.#observeSpinePlayback = options.observeSpinePlayback;
    this.#observeUiControlState = options.observeUiControlState;
    this.#initialNodeIds = options.initialNodeIds
      ? Object.freeze([...options.initialNodeIds])
      : null;
    this.container.label = `scene-layout:${this.#manifest.id}`;
    this.container.sortableChildren = false;
    const nodes = this.#manifest.nodes.map((spec) => {
      const slot = new Container();
      const before = new Container();
      const named = new Container();
      const after = new Container();
      slot.label = `scene-layout-slot:${spec.id}`;
      before.label = `scene-layout-before:${spec.id}`;
      named.label = spec.id;
      after.label = `scene-layout-after:${spec.id}`;
      before.sortableChildren = true;
      named.sortableChildren = true;
      after.sortableChildren = true;
      slot.addChild(before, named, after);
      this.container.addChild(slot);
      return {
        spec,
        slot,
        named,
        before,
        after,
        player: null,
        vniPlayer: null,
        stateController: null,
        imageString: null,
        imageSprite: null,
        texture: null,
        uiControl: null,
        programPlayback: null,
        programMotion: null,
        programMotionAttachment: null,
        programMotionBinding: createRenderObjectMotionBinding(),
        prepared: false,
        homeX: 0,
        homeY: 0,
        homeScale: 1,
        homeRotationDegrees: 0,
        motionState: createNeutralNodeMotionState(),
        slotObjectAttachment: null,
      };
    });
    this.#nodes = Object.freeze(nodes);
    this.#nodesById = new Map(nodes.map((node) => [node.spec.id, node]));
    for (const node of nodes) {
      this.#nodeRenderLayerControllers.set(
        node.spec.id,
        Object.freeze({
          child: this.createLayerController(
            node.named,
            `scene layout node "${node.spec.id}" child layer`,
          ),
          before: this.createLayerController(
            node.before,
            `scene layout node "${node.spec.id}" before layer`,
          ),
          after: this.createLayerController(
            node.after,
            `scene layout node "${node.spec.id}" after layer`,
          ),
        }),
      );
    }
    for (const node of nodes) {
      this.#authoredNodeActive.set(node.spec.id, true);
      this.#programNodeVisible.set(node.spec.id, true);
    }
    this.#rootRenderLayerContainer.label = "scene-layout-render-layer:layout";
    this.#rootRenderLayerContainer.sortableChildren = true;
    this.#rootRenderLayerController = this.createLayerController(
      this.#rootRenderLayerContainer,
      "scene layout root render layer",
    );
    this.#viewportMask.label = "scene-layout-viewport-mask";
    this.#viewportMask.visible = true;
    this.#viewportMask.renderable = true;
    this.#viewportMask.includeInBuild = false;
    this.#viewportMask.measurable = false;
    this.container.addChild(this.#rootRenderLayerContainer, this.#viewportMask);
    this.container.mask = this.#viewportMask;
  }

  async init(): Promise<void> {
    this.assertAlive();
    if (this.#initializing || this.#initialized) {
      throw new SceneLayoutError(
        "Scene layout runtime is already initializing or initialized.",
      );
    }
    this.#initializing = true;
    try {
      await this.prepareNodesInternal(
        this.#initialNodeIds ?? this.#nodes.map((node) => node.spec.id),
      );
      this.assertAlive();
      this.#initialized = true;
    } catch (error) {
      this.releaseNodeResources();
      throw asSceneLayoutError(error);
    } finally {
      this.#initializing = false;
    }
  }

  /** @internal Package runtimes call this only after the exact owner chunk is ready. */
  async prepareNodes(nodeIds: readonly string[]): Promise<void> {
    this.assertReady();
    await this.prepareNodesInternal(nodeIds);
  }

  applyViewport(viewportSize: RenderViewportSize): SceneLayoutSnapshot {
    this.assertReady();
    return this.applySnapshot(
      resolveSceneLayoutViewportV7({
        manifest: this.#manifest,
        viewportSize,
        modeId: this.#modeId,
        ...(this.#snapshot
          ? {
              previousVariantId: this.#snapshot.variantId,
            }
          : {}),
      }),
    );
  }

  private applySnapshot(snapshot: SceneLayoutSnapshot): SceneLayoutSnapshot {
    const variantChanged =
      this.#snapshot !== null &&
      this.#snapshot.variantId !== snapshot.variantId;
    if (variantChanged)
      this.resetAllNodeMotions("Scene layout variant was replaced.");
    this.#snapshot = snapshot;
    this.container.position.set(snapshot.worldOffset.x, snapshot.worldOffset.y);
    this.#viewportMask.clear();
    this.#viewportMask
      .rect(
        snapshot.visibleRect.x,
        snapshot.visibleRect.y,
        snapshot.visibleRect.width,
        snapshot.visibleRect.height,
      )
      .fill({ color: 0xffffff, alpha: 1 });
    for (const node of this.#nodes) {
      const spec = this.requireCurrentNode(node.spec.id);
      const placement = spec.placements[snapshot.variantId];
      const modeActive =
        !spec.scope ||
        spec.scope[this.#modeId]?.includes(snapshot.variantId) === true;
      const active =
        node.prepared &&
        modeActive &&
        this.#authoredNodeActive.get(node.spec.id) !== false &&
        this.#programNodeVisible.get(node.spec.id) !== false;
      if ((!placement || !active) && node.slot.renderable)
        this.cancelStepSliderInteraction(
          node,
          `Scene layout step-slider control "${node.spec.id}" was hidden.`,
        );
      node.slot.visible = Boolean(placement) && active;
      node.slot.renderable = Boolean(placement) && active;
      if (placement && node.prepared) {
        applyNodePlacementTransform(node, this.#resource, placement);
      }
    }
    return snapshot;
  }

  applyGeometryManifest(
    manifestValue: SceneLayoutManifest,
  ): SceneLayoutSnapshot | null {
    this.assertReady();
    const manifest = upgradeSceneLayoutManifestToLatest(
      parseSceneLayoutManifestDocument(manifestValue),
    );
    return this.commitGeometryManifest(manifest);
  }

  commitPreparedGeometryManifest(
    manifest: SceneLayoutManifestLatest,
  ): SceneLayoutSnapshot | null {
    this.assertReady();
    return this.commitGeometryManifest(manifest);
  }

  private commitGeometryManifest(
    manifest: SceneLayoutManifestLatest,
  ): SceneLayoutSnapshot | null {
    assertCompatibleSceneLayoutNodes(this.#manifest, manifest);
    if (!manifest.gameModes.modes.some((mode) => mode.id === this.#modeId))
      this.#modeId = manifest.gameModes.initialMode;
    const nextSnapshot = this.#snapshot
      ? resolveSceneLayoutViewportV7({
          manifest,
          viewportSize: this.#snapshot.viewportSize,
          modeId: this.#modeId,
          previousVariantId: this.#snapshot.variantId,
        })
      : null;
    this.resetAllNodeMotions("Scene layout geometry was replaced.");
    for (const node of this.#nodes)
      this.cancelStepSliderInteraction(
        node,
        `Scene layout step-slider control "${node.spec.id}" geometry was replaced.`,
      );
    this.#manifest = manifest;
    for (const [index, spec] of manifest.nodes.entries())
      this.container.setChildIndex(this.requireNode(spec.id).slot, index);
    for (const node of this.#nodes)
      if (node.imageSprite) node.imageSprite.anchor.set(0.5);
      else if (node.vniPlayer)
        applyVniOrigin(
          node.vniPlayer,
          this.#resource.vniResources[
            "resource" in node.spec && node.spec.resource.kind === "vni"
              ? node.spec.resource.project
              : ""
          ],
          "center",
        );
    return nextSnapshot ? this.applySnapshot(nextSnapshot) : null;
  }

  /** @internal Package runtimes commit the already validated active mode atomically. */
  commitGameMode(modeId: string): SceneLayoutSnapshot | null {
    if (!this.#manifest.gameModes.modes.some((mode) => mode.id === modeId))
      throw new SceneLayoutError(`Unknown scene layout game mode "${modeId}".`);
    this.#modeId = modeId;
    return this.#snapshot
      ? this.applySnapshot(
          resolveSceneLayoutViewportV7({
            manifest: this.#manifest,
            viewportSize: this.#snapshot.viewportSize,
            modeId,
            previousVariantId: this.#snapshot.variantId,
          }),
        )
      : null;
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    try {
      assertValidSpineDeltaSeconds(deltaSeconds);
    } catch (error) {
      throw asSceneLayoutError(error);
    }
    this.#renderObjectMotionRuntime.update(deltaSeconds);
    for (const node of this.#nodes) {
      this.updateStepSlider(node, deltaSeconds);
      if (node.player && node.slot.renderable) {
        const result = node.player.update(deltaSeconds);
        node.stateController?.updateCompleted(result.completed);
        const playback = node.programPlayback;
        if (
          playback &&
          ((playback.loop && result.loopCompleted) ||
            (!playback.loop && result.completed))
        ) {
          this.resolveNodeProgramPlayback(node, playback);
        }
      }
      if (node.vniPlayer && node.slot.renderable)
        node.vniPlayer.update(deltaSeconds);
    }
  }

  getSnapshot(): SceneLayoutSnapshot {
    this.assertReady();
    if (!this.#snapshot) {
      throw new SceneLayoutError("Scene layout viewport has not been applied.");
    }
    return this.#snapshot;
  }

  getLayoutPoint(selector: SceneLayoutPointSelector): SceneLayoutPoint {
    const snapshot = this.getSnapshot();
    if (!selector || typeof selector !== "object")
      throw new SceneLayoutError("Scene layout point selector is invalid.");
    let artPoint: SceneLayoutPoint;
    if (selector.kind === "origin") artPoint = { x: 0, y: 0 };
    else if (selector.kind === "main")
      artPoint = alignedPoint(snapshot.main.layoutRect, selector.align);
    else if (selector.kind === "viewport")
      artPoint = alignedPoint(snapshot.visibleRect, selector.align);
    else
      throw new SceneLayoutError(
        `Unknown scene layout point selector "${String((selector as { kind?: unknown }).kind)}".`,
      );
    return Object.freeze(artPoint);
  }

  getLayoutAnchor(point: SceneLayoutPoint) {
    this.getSnapshot();
    assertFiniteSceneLayoutPoint(point, "layout point");
    return this.#rootRenderLayerController.layer.getAnchor(
      this.authoredToArt(point),
    );
  }

  resolveLayoutAnchor(anchor: import("../presentation/index.js").RenderAnchor) {
    this.getSnapshot();
    return this.artToAuthored(
      this.#rootRenderLayerController.layer.resolveAnchor(anchor),
    );
  }

  getNode(id: string): Container {
    this.assertReady();
    return this.requireNode(id).named;
  }

  getRootRenderLayer(): RenderObjectLayer {
    this.assertReady();
    return this.#rootRenderLayerController.layer;
  }

  getNodeRenderLayer(
    nodeId: string,
    placement: SceneLayoutNodeRenderLayerPlacement = "child",
  ): RenderObjectLayer {
    this.assertReady();
    this.requireNode(nodeId);
    if (
      placement !== "child" &&
      placement !== "before" &&
      placement !== "after"
    ) {
      throw new SceneLayoutError(
        `Unknown scene layout node render layer placement "${String(placement)}".`,
      );
    }
    return this.#nodeRenderLayerControllers.get(nodeId)![placement].layer;
  }

  getRenderLayer(ref: SceneLayoutRenderLayerRef): RenderObjectLayer {
    this.assertReady();
    return resolveSceneLayoutRenderLayerRef(ref, {
      stable: (id) => {
        if (id === "layout") return this.getRootRenderLayer();
        throw new SceneLayoutError(
          `Scene layout render layer "${id}" is unavailable in the base runtime.`,
        );
      },
      area: (areaId, placement) => {
        throw new SceneLayoutError(
          `Scene layout symbol area layer "${areaId}.${placement}" is unavailable in the base runtime.`,
        );
      },
      node: (nodeId, placement) => this.getNodeRenderLayer(nodeId, placement),
    });
  }

  getRenderObject(nodeId: string): SceneLayoutRenderObject | null {
    this.assertReady();
    const node = this.requireNode(nodeId);
    if (!("resource" in node.spec)) return null;
    const cached = this.#renderObjects.get(nodeId);
    if (cached) return cached;
    const common = {
      getAnchor: () => this.getNodeRenderLayer(nodeId).getAnchor(),
      motion: this.createNodeMotion(nodeId),
      getChildLayer: (ref: RenderObjectChildLayerRef) =>
        this.getNodeChildLayer(nodeId, ref),
      setVisible: (visible: boolean) => {
        this.assertReady();
        if (typeof visible !== "boolean")
          throw new SceneLayoutError(
            `Scene layout node "${nodeId}" visibility must be boolean.`,
          );
        this.#programNodeVisible.set(nodeId, visible);
        this.refreshNodeVisibility(node);
      },
    };
    let object: SceneLayoutRenderObject | null;
    switch (node.spec.resource.kind) {
      case "image":
        object = Object.freeze({ kind: "image", ...common });
        break;
      case "image-string":
        object = Object.freeze({
          kind: "image-string",
          ...common,
          setText: (text: string) => this.setImageStringText(nodeId, text),
          getText: () => this.getImageStringText(nodeId),
        });
        break;
      case "vni":
        object = Object.freeze({
          kind: "vni",
          ...common,
          play: () => {
            this.assertReady();
            const player = this.requireNode(nodeId).vniPlayer;
            if (!player)
              throw new SceneLayoutError(
                `Scene layout VNI node "${nodeId}" is not prepared.`,
              );
            player.play();
          },
        });
        break;
      case "spine":
        if ("stateMachine" in node.spec.resource) {
          object = Object.freeze({
            kind: "spine",
            playback: "state",
            ...common,
            requestState: (state: string) =>
              this.requestNodeState(nodeId, state),
            canRequestState: (state: string) =>
              this.canRequestNodeState(nodeId, state),
            getStateSnapshot: () => this.getNodeStateSnapshot(nodeId),
          });
        } else {
          object = Object.freeze({
            kind: "spine",
            playback: "loop",
            ...common,
            play: () => {
              this.assertReady();
              const current = this.requireNode(nodeId);
              if (
                !current.player ||
                !("resource" in current.spec) ||
                current.spec.resource.kind !== "spine" ||
                !("defaultAnimation" in current.spec.resource)
              )
                throw new SceneLayoutError(
                  `Scene layout Spine node "${nodeId}" is not prepared.`,
                );
              this.rejectNodeProgramPlayback(
                current,
                `Scene layout Spine node "${nodeId}" playback was superseded.`,
                "superseded",
              );
              current.player.play({
                animationName: current.spec.resource.defaultAnimation,
                loop: current.spec.resource.loop,
              });
            },
            playAnimation: (
              animationName: string,
              options?: SceneLayoutSpineAnimationPlayOptions,
            ) => this.playNodeAnimation(nodeId, animationName, options),
            stopAnimation: () => this.stopNodeAnimation(nodeId),
            bindSlotObjects: (
              bindings: readonly SceneLayoutSpineSlotObjectBinding[],
            ) => this.bindNodeSlotObjects(nodeId, bindings),
          });
        }
        break;
      default:
        object = null;
    }
    if (object) this.#renderObjects.set(nodeId, object);
    return object;
  }

  getUiControl(nodeId: string): SceneLayoutUiControl | null {
    this.assertReady();
    const node = this.requireNode(nodeId);
    if (!("uiControl" in node.spec)) return null;
    const cached = this.#uiControls.get(nodeId);
    if (cached) return cached;
    const control: SceneLayoutUiControl =
      node.spec.uiControl.kind === "radio"
        ? Object.freeze({
            kind: "radio" as const,
            getState: () => {
              this.assertReady();
              return this.requireRadioControl(nodeId).state;
            },
            setState: (state: SceneLayoutRadioState) => {
              this.setRadioControlState(nodeId, state, "programmatic");
            },
          })
        : Object.freeze({
            kind: "step-slider" as const,
            steps: node.spec.uiControl.steps,
            getState: () => {
              this.assertReady();
              return this.requireStepSliderControl(nodeId).state;
            },
            setState: (state: number) => this.setStepSliderState(nodeId, state),
          });
    this.#uiControls.set(nodeId, control);
    return control;
  }

  private getNodeChildLayer(
    nodeId: string,
    ref: RenderObjectChildLayerRef,
  ): RenderObjectLayer {
    this.assertReady();
    const node = this.requireNode(nodeId);
    const discriminator = ref.kind === "spine-slot" ? "slot" : "text-layer";
    const exactId = ref.kind === "spine-slot" ? ref.slot : ref.layerId;
    if (typeof exactId !== "string" || exactId.length === 0)
      throw new SceneLayoutError(
        `Scene layout node "${nodeId}" child layer requires a non-empty exact name.`,
      );
    const colorKey =
      ref.kind === "spine-slot"
        ? `:${(ref.followSlotColor ?? true) ? "color" : "plain"}`
        : "";
    const key = `${discriminator}:${exactId}${colorKey}`;
    let layers = this.#nodeChildLayers.get(nodeId);
    const existing = layers?.get(key);
    if (existing) return existing.controller.layer;
    if (ref.kind === "spine-slot") {
      for (const existingKey of layers?.keys() ?? [])
        if (existingKey.startsWith(`slot:${exactId}:`))
          throw new SceneLayoutError(
            `Scene layout Spine node "${nodeId}" slot "${exactId}" already uses a different followSlotColor value.`,
          );
    }
    const view = new Container();
    view.label = `scene-layout-node:${nodeId}:${discriminator}:${exactId}`;
    view.sortableChildren = true;
    let detach: () => void;
    if (ref.kind === "spine-slot") {
      if (
        !("resource" in node.spec) ||
        node.spec.resource.kind !== "spine" ||
        !node.player
      )
        throw new SceneLayoutError(
          `Scene layout node "${nodeId}" does not expose Spine slot child layers.`,
        );
      const player = requireSpineSlotPlayer(node.player, nodeId);
      player.attachSlotObject({
        slot: ref.slot,
        object: view,
        followSlotColor: ref.followSlotColor ?? true,
      });
      detach = () => player.removeSlotObject(view);
    } else {
      if (
        !("resource" in node.spec) ||
        node.spec.resource.kind !== "vni" ||
        !node.vniPlayer
      )
        throw new SceneLayoutError(
          `Scene layout node "${nodeId}" does not expose VNI text-layer child layers.`,
        );
      const resource = this.#resource.vniResources[node.spec.resource.project];
      if (
        !resource?.project.layers.some(
          (layer) => layer.id === ref.layerId && layer.type === "text",
        )
      )
        throw new SceneLayoutError(
          `Unknown VNI text layer "${ref.layerId}" for scene layout node "${nodeId}".`,
        );
      if (!node.vniPlayer.attachNodeToTextLayer)
        throw new SceneLayoutError(
          `Scene layout VNI node "${nodeId}" does not support text-layer attachment.`,
        );
      detach = node.vniPlayer.attachNodeToTextLayer({
        id: `rendercore-authored-${nodeId}-${ref.layerId}`,
        layerId: ref.layerId,
        node: view,
        destroyOnDetach: false,
        hideOriginal: true,
      });
    }
    let controller: RenderObjectLayerController;
    try {
      controller = createRenderObjectLayer({
        view,
        label: view.label,
        assertUsable: () => this.assertReady(),
        createError: (message) => new SceneLayoutError(message),
        motionRuntime: this.#renderObjectMotionRuntime,
      });
    } catch (error) {
      detach();
      view.destroy({ children: false });
      throw error;
    }
    layers ??= new Map();
    layers.set(key, { controller, view, detach });
    this.#nodeChildLayers.set(nodeId, layers);
    return controller.layer;
  }

  attachChild(options: AttachChildOptions): () => void {
    this.assertReady();
    const node = this.requireNode(options.nodeId);
    assertAttachable(options.object);
    node.named.addChild(options.object);
    return createDisposer(node.named, options.object);
  }

  attachRelative(options: AttachRelativeOptions): () => void {
    this.assertReady();
    const node = this.requireNode(options.nodeId);
    assertAttachable(options.object);
    const parent = options.placement === "before" ? node.before : node.after;
    parent.addChild(options.object);
    return createDisposer(parent, options.object);
  }

  getReelGrid(id: "main"): ResolvedSceneLayoutMainGrid {
    this.assertReady();
    if (id !== "main")
      throw new SceneLayoutError(`Unknown scene layout main area "${id}".`);
    return (
      this.#snapshot ??
      resolveSceneLayoutViewportV7({
        manifest: this.#manifest,
        viewportSize: { width: 1, height: 1 },
        modeId: this.#modeId,
      })
    ).main;
  }

  getImageStringNodeNames(): readonly string[] {
    this.assertReady();
    return Object.freeze(
      this.#nodes
        .filter(
          (node) =>
            "resource" in node.spec &&
            node.spec.resource.kind === "image-string",
        )
        .map((node) => node.spec.id),
    );
  }

  setImageStringText(nodeId: string, text: string): void {
    this.assertReady();
    this.requireImageStringNode(nodeId).setText(text);
  }

  getImageStringText(nodeId: string): string {
    this.assertReady();
    return this.requireImageStringNode(nodeId).getText();
  }

  requestNodeState(nodeId: string, state: string): Promise<void> {
    this.assertReady();
    return this.requireStateController(nodeId).request(state);
  }

  canRequestNodeState(nodeId: string, state: string): boolean {
    this.assertReady();
    return this.requireStateController(nodeId).canRequest(state);
  }

  getNodeStateSnapshot(nodeId: string): SceneLayoutNodeStateSnapshot {
    this.assertReady();
    return this.requireStateController(nodeId).snapshot();
  }

  setNodeActive(nodeId: string, active: boolean): void {
    this.assertReady();
    const node = this.requireNode(nodeId);
    this.#authoredNodeActive.set(nodeId, active);
    this.refreshNodeVisibility(node);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.container.mask = null;
    this.#rootRenderLayerController.detachAll();
    for (const controllers of this.#nodeRenderLayerControllers.values())
      for (const controller of Object.values(controllers))
        controller.detachAll();
    this.releaseNodeResources();
    this.#renderObjectMotionRuntime.destroy();
    this.#viewportMask.destroy();
    this.#rootRenderLayerContainer.destroy({ children: false });
    for (const node of this.#nodes) {
      node.before.removeChildren();
      node.after.removeChildren();
      node.named.removeChildren();
      node.slot.destroy({ children: true });
    }
    this.container.removeChildren();
    this.container.parent?.removeChild(this.container);
    this.#resource.destroy();
    this.#snapshot = null;
    this.#renderObjects.clear();
    this.#uiControls.clear();
    this.#initialized = false;
  }

  private async initNode(node: RuntimeNode): Promise<void> {
    if ("uiControl" in node.spec) {
      const control = node.spec.uiControl;
      if (control.kind === "radio") {
        const offUrl = this.#resource.imageUrls[control.off.path];
        const onUrl = this.#resource.imageUrls[control.on.path];
        if (!offUrl || !onUrl)
          throw new SceneLayoutError(
            `Scene layout UI control "${node.spec.id}" image URL is missing.`,
          );
        const textures = await settleAllInOrder([
          this.loadTextureOnce(offUrl),
          this.loadTextureOnce(onUrl),
        ]);
        const off = textures[0]!;
        const on = textures[1]!;
        this.assertAlive();
        assertTextureSize(off, control.off, node.spec.id, "off");
        assertTextureSize(on, control.on, node.spec.id, "on");
        node.texture = off;
        const sprite = new Sprite(off);
        sprite.anchor.set(0.5);
        sprite.label = `scene-layout-ui-control:${node.spec.id}`;
        sprite.eventMode = "static";
        sprite.cursor = "pointer";
        sprite.on("pointertap", (event: FederatedPointerEvent) => {
          consumeUiControlPointerEvent(event, true);
          const runtimeControl = this.requireRadioControl(node.spec.id);
          this.setRadioControlState(
            node.spec.id,
            runtimeControl.state === "off" ? "on" : "off",
            "pointer",
          );
        });
        node.imageSprite = sprite;
        node.uiControl = {
          kind: "radio",
          textures: Object.freeze({ off, on }),
          sprite,
          state: "off",
        };
        node.named.addChild(sprite);
        return;
      }
      await this.initStepSlider(node, control);
      return;
    }
    if (node.spec.resource.kind === "image") {
      const url = this.#resource.imageUrls[node.spec.resource.path];
      if (!url) {
        throw new SceneLayoutError(
          `Scene layout image URL is missing: ${node.spec.resource.path}.`,
        );
      }
      const texture = await this.loadTextureOnce(url);
      if (!texture?.source) {
        throw new SceneLayoutError(
          `Scene layout image "${node.spec.resource.path}" failed to load a valid Pixi texture.`,
        );
      }
      const width = texture.width;
      const height = texture.height;
      if (
        width !== node.spec.resource.size.width ||
        height !== node.spec.resource.size.height
      ) {
        throw new SceneLayoutError(
          `Scene layout image "${node.spec.resource.path}" size mismatch: expected ${node.spec.resource.size.width}x${node.spec.resource.size.height}, actual ${width}x${height}.`,
        );
      }
      node.texture = texture;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      node.imageSprite = sprite;
      sprite.label = `scene-layout-image:${node.spec.id}`;
      node.named.addChild(sprite);
      return;
    }
    if (node.spec.resource.kind === "image-string") {
      const resource =
        this.#resource.imageStringResources[node.spec.resource.manifest];
      if (!resource) {
        throw new SceneLayoutError(
          `Scene layout image-string resource is missing for node "${node.spec.id}".`,
        );
      }
      const view = createRenderImageString({
        resource,
        text: node.spec.resource.text,
        anchor: node.spec.resource.anchor,
      });
      node.imageString = view;
      view.container.label = `scene-layout-image-string:${node.spec.id}`;
      node.named.addChild(view.container);
      return;
    }
    if (node.spec.resource.kind === "vni") {
      const resource = this.#resource.vniResources[node.spec.resource.project];
      if (!resource) {
        throw new SceneLayoutError(
          `Scene layout VNI resource is missing for node "${node.spec.id}".`,
        );
      }
      const host = new Container();
      host.label = `scene-layout-vni:${node.spec.id}`;
      node.named.addChild(host);
      const player = this.#createVniPlayer({
        node: node.spec,
        parent: host,
        resource,
      });
      node.vniPlayer = player;
      await player.init();
      this.assertAlive();
      applyVniOrigin(player, resource, "center");
      player.setLoop(node.spec.resource.loop);
      player.play();
      return;
    }
    const resource = this.#resource.spineResources[node.spec.id];
    if (!resource) {
      throw new SceneLayoutError(
        `Scene layout Spine resource is missing for node "${node.spec.id}".`,
      );
    }
    const player = this.#createSpinePlayer({ node: node.spec, resource });
    node.player = player;
    await player.init();
    this.assertAlive();
    if ("stateMachine" in node.spec.resource) {
      const controller = new SpineStateController({
        player,
        spec: node.spec.resource.stateMachine,
        createError: (message) => new SceneLayoutError(message),
      });
      node.stateController = controller;
      controller.start();
    } else {
      player.play({
        animationName: node.spec.resource.defaultAnimation,
        loop: node.spec.resource.loop,
      });
    }
    node.named.addChild(player.view);
  }

  private async initStepSlider(
    node: RuntimeNode,
    spec: SceneLayoutStepSliderControlSpec,
  ): Promise<void> {
    const trackUrl = this.#resource.imageUrls[spec.track.path];
    const thumbUrl = this.#resource.imageUrls[spec.thumb.path];
    if (!trackUrl || !thumbUrl)
      throw new SceneLayoutError(
        `Scene layout step-slider control "${node.spec.id}" image URL is missing.`,
      );
    const textures = await settleAllInOrder([
      this.loadTextureOnce(trackUrl),
      this.loadTextureOnce(thumbUrl),
    ]);
    const trackTexture = textures[0]!;
    const thumbTexture = textures[1]!;
    this.assertAlive();
    assertTextureSize(trackTexture, spec.track, node.spec.id, "track");
    assertTextureSize(thumbTexture, spec.thumb, node.spec.id, "thumb");
    const view = new Container();
    view.label = `scene-layout-ui-control:${node.spec.id}`;
    view.eventMode = "static";
    view.cursor = "pointer";
    const trackSprite = new Sprite(trackTexture);
    trackSprite.anchor.set(0.5);
    trackSprite.label = `scene-layout-step-slider-track:${node.spec.id}`;
    trackSprite.eventMode = "none";
    const thumbSprite = new Sprite(thumbTexture);
    thumbSprite.anchor.set(0.5);
    thumbSprite.label = `scene-layout-step-slider-thumb:${node.spec.id}`;
    thumbSprite.eventMode = "none";
    thumbSprite.x = resolveStepSliderPosition(spec, 0);
    view.addChild(trackSprite, thumbSprite);
    const control: RuntimeStepSliderControl = {
      kind: "step-slider",
      spec,
      view,
      trackSprite,
      thumbSprite,
      state: 0,
      pointerId: null,
      snap: null,
    };
    node.uiControl = control;
    const onPointerDown = (event: FederatedPointerEvent) => {
      consumeUiControlPointerEvent(event, false);
      this.rejectStepSliderSnap(
        control,
        `Scene layout step-slider control "${node.spec.id}" state change was superseded by pointer input.`,
      );
      if (control.pointerId !== null && control.pointerId !== event.pointerId)
        return;
      control.pointerId = event.pointerId;
      control.thumbSprite.x = clampStepSliderPosition(
        spec,
        event.getLocalPosition(view).x,
      );
    };
    const onPointerMove = (event: FederatedPointerEvent) => {
      if (control.pointerId !== event.pointerId) return;
      consumeUiControlPointerEvent(event, false);
      control.thumbSprite.x = clampStepSliderPosition(
        spec,
        event.getLocalPosition(view).x,
      );
    };
    const onPointerUp = (event: FederatedPointerEvent) => {
      if (control.pointerId !== event.pointerId) return;
      consumeUiControlPointerEvent(event, true);
      control.pointerId = null;
      const state = resolveNearestStepSliderState(spec, control.thumbSprite.x);
      this.startStepSliderSnap(node, state, "pointer");
    };
    const onPointerCancel = (event: FederatedPointerEvent) => {
      if (control.pointerId !== event.pointerId) return;
      consumeUiControlPointerEvent(event, true);
      control.pointerId = null;
      this.startStepSliderSnap(node, control.state, null);
    };
    view.on("pointerdown", onPointerDown);
    view.on("globalpointermove", onPointerMove);
    view.on("pointerup", onPointerUp);
    view.on("pointerupoutside", onPointerUp);
    view.on("pointercancel", onPointerCancel);
    node.named.addChild(view);
  }

  private startStepSliderSnap(
    node: RuntimeNode,
    targetState: number,
    source: SceneLayoutUiControlStateSource | null,
    resolve?: () => void,
    reject?: (error: Error) => void,
  ): void {
    const control = this.requireStepSliderControl(node.spec.id);
    const targetX = resolveStepSliderPosition(control.spec, targetState);
    control.snap = {
      fromX: control.thumbSprite.x,
      targetX,
      targetState,
      source,
      durationSeconds: control.spec.snapDurationSeconds,
      elapsedSeconds: 0,
      ...(resolve ? { resolve } : {}),
      ...(reject ? { reject } : {}),
    };
    if (control.thumbSprite.x === targetX)
      this.completeStepSliderSnap(node, control, control.snap);
  }

  private updateStepSlider(node: RuntimeNode, deltaSeconds: number): void {
    const control = node.uiControl;
    if (control?.kind !== "step-slider" || !control.snap) return;
    const snap = control.snap;
    snap.elapsedSeconds = Math.min(
      snap.durationSeconds,
      snap.elapsedSeconds + deltaSeconds,
    );
    const progress = snap.elapsedSeconds / snap.durationSeconds;
    const eased = 1 - Math.pow(1 - progress, 3);
    control.thumbSprite.x = snap.fromX + (snap.targetX - snap.fromX) * eased;
    if (progress === 1) this.completeStepSliderSnap(node, control, snap);
  }

  private completeStepSliderSnap(
    node: RuntimeNode,
    control: RuntimeStepSliderControl,
    snap: StepSliderSnap,
  ): void {
    if (control.snap !== snap) return;
    control.thumbSprite.x = snap.targetX;
    control.snap = null;
    const previousState = control.state;
    control.state = snap.targetState;
    if (snap.source && previousState !== snap.targetState)
      this.#observeUiControlState?.(
        Object.freeze({
          controlId: node.spec.id,
          controlKind: "step-slider",
          previousState,
          state: snap.targetState,
          source: snap.source,
        }),
      );
    snap.resolve?.();
  }

  private rejectStepSliderSnap(
    control: RuntimeStepSliderControl,
    message: string,
  ): void {
    const snap = control.snap;
    if (!snap) return;
    control.snap = null;
    snap.reject?.(new SceneLayoutError(message));
  }

  private cancelStepSliderInteraction(
    node: RuntimeNode,
    message: string,
  ): void {
    const control = node.uiControl;
    if (control?.kind !== "step-slider") return;
    control.pointerId = null;
    this.rejectStepSliderSnap(control, message);
    control.thumbSprite.x = resolveStepSliderPosition(
      control.spec,
      control.state,
    );
  }

  private async prepareNodesInternal(
    nodeIds: readonly string[],
  ): Promise<void> {
    const candidates = [...new Set(nodeIds)].map((id) => this.requireNode(id));
    const pending = candidates.filter((node) => !node.prepared);
    if (pending.length === 0) return;
    try {
      await settleAllInOrder(
        pending.map((node) =>
          this.initNode(node).then(() => {
            node.prepared = true;
          }),
        ),
      );
      this.assertAlive();
      if (this.#snapshot) {
        for (const node of pending) {
          const spec = this.requireCurrentNode(node.spec.id);
          const placement = spec.placements[this.#snapshot.variantId];
          if (placement)
            applyNodePlacementTransform(node, this.#resource, placement);
          this.refreshNodeVisibility(node);
        }
      }
    } catch (error) {
      for (const node of pending) {
        this.releaseNodeResource(node);
        node.prepared = false;
      }
      throw asSceneLayoutError(error);
    }
  }

  private releaseNodeResources(): void {
    for (const layers of this.#nodeChildLayers.values())
      for (const layer of layers.values()) {
        layer.controller.detachAll();
        layer.detach();
        layer.view.destroy({ children: false });
      }
    this.#nodeChildLayers.clear();
    for (const node of this.#nodes) this.releaseNodeResource(node);
    const textureUrls = [...this.#loadedTextureUrls];
    this.#loadedTextureUrls.clear();
    this.#texturesByUrl.clear();
    this.#texturePromisesByUrl.clear();
    for (const url of textureUrls) {
      try {
        void this.#unloadTexture(url).catch(() => undefined);
      } catch {
        // Resource release is best-effort and must remain idempotent.
      }
    }
  }

  private releaseNodeResource(node: RuntimeNode): void {
    node.programMotionAttachment?.detach();
    node.programMotionAttachment = null;
    node.programMotion = null;
    node.motionState = createNeutralNodeMotionState();
    node.slotObjectAttachment?.detach();
    node.slotObjectAttachment = null;
    this.rejectNodeProgramPlayback(
      node,
      `Scene layout Spine node "${node.spec.id}" was destroyed during playback.`,
      "destroyed",
    );
    node.stateController?.destroy(
      `Scene layout Spine node "${node.spec.id}" was destroyed.`,
    );
    node.stateController = null;
    node.player?.destroy();
    node.player = null;
    node.vniPlayer?.destroy();
    node.vniPlayer = null;
    node.imageString?.destroy();
    node.imageString = null;
    const sliderView =
      node.uiControl?.kind === "step-slider" ? node.uiControl.view : null;
    node.imageSprite?.destroy({ texture: false });
    node.imageSprite = null;
    node.texture = null;
    this.cancelStepSliderInteraction(
      node,
      `Scene layout step-slider control "${node.spec.id}" was destroyed.`,
    );
    sliderView?.destroy({ children: true, texture: false });
    node.uiControl = null;
    node.named.removeChildren();
    node.prepared = false;
  }

  private loadTextureOnce(url: string): Promise<Texture> {
    const loaded = this.#texturesByUrl.get(url);
    if (loaded) return Promise.resolve(loaded);
    const pending = this.#texturePromisesByUrl.get(url);
    if (pending) return pending;
    const created = this.#loadTexture(url)
      .then((texture) => {
        this.#loadedTextureUrls.add(url);
        if (!texture?.source) {
          throw new SceneLayoutError(
            "Scene layout image failed to load a valid Pixi texture.",
          );
        }
        this.#texturesByUrl.set(url, texture);
        this.assertAlive();
        return texture;
      })
      .finally(() => {
        this.#texturePromisesByUrl.delete(url);
      });
    this.#texturePromisesByUrl.set(url, created);
    return created;
  }

  private requireNode(id: string): RuntimeNode {
    const node = this.#nodesById.get(id);
    if (!node) throw new SceneLayoutError(`Unknown scene layout node "${id}".`);
    return node;
  }

  private createLayerController(
    view: Container,
    label: string,
  ): RenderObjectLayerController {
    return createRenderObjectLayer({
      view,
      label,
      assertUsable: () => this.assertReady(),
      createError: (message) => new SceneLayoutError(message),
      motionRuntime: this.#renderObjectMotionRuntime,
    });
  }

  private requireImageStringNode(id: string): RenderImageString {
    const node = this.requireNode(id);
    if (!node.imageString) {
      throw new SceneLayoutError(
        `Scene layout node "${id}" is not an image-string node.`,
      );
    }
    return node.imageString;
  }

  private requireStateController(id: string): SpineStateController {
    const node = this.requireNode(id);
    if (!node.stateController) {
      throw new SceneLayoutError(
        `Scene layout node "${id}" is not a stateful Spine node.`,
      );
    }
    return node.stateController;
  }

  private requireRadioControl(id: string): RuntimeRadioControl {
    const node = this.requireNode(id);
    if (node.uiControl?.kind !== "radio")
      throw new SceneLayoutError(
        `Scene layout node "${id}" is not a prepared radio control.`,
      );
    return node.uiControl;
  }

  private setRadioControlState(
    id: string,
    state: SceneLayoutRadioState,
    source: SceneLayoutUiControlStateSource,
  ): void {
    this.assertReady();
    if (state !== "off" && state !== "on")
      throw new SceneLayoutError(
        `Scene layout radio control "${id}" has unknown state "${String(state)}".`,
      );
    const node = this.requireNode(id);
    const control = this.requireRadioControl(id);
    const previousState = control.state;
    if (previousState === state) return;
    control.sprite.texture = control.textures[state];
    node.texture = control.textures[state];
    control.state = state;
    this.#observeUiControlState?.(
      Object.freeze({
        controlId: id,
        controlKind: "radio",
        previousState,
        state,
        source,
      }),
    );
  }

  private requireStepSliderControl(id: string): RuntimeStepSliderControl {
    const node = this.requireNode(id);
    if (node.uiControl?.kind !== "step-slider")
      throw new SceneLayoutError(
        `Scene layout node "${id}" is not a prepared step-slider control.`,
      );
    return node.uiControl;
  }

  private setStepSliderState(id: string, state: number): Promise<void> {
    this.assertReady();
    const node = this.requireNode(id);
    const control = this.requireStepSliderControl(id);
    try {
      assertStepSliderState(control.spec, state);
    } catch (error) {
      return Promise.reject(asSceneLayoutError(error));
    }
    control.pointerId = null;
    this.rejectStepSliderSnap(
      control,
      `Scene layout step-slider control "${id}" state change was superseded.`,
    );
    const targetX = resolveStepSliderPosition(control.spec, state);
    if (control.state === state && control.thumbSprite.x === targetX)
      return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.startStepSliderSnap(node, state, "programmatic", resolve, reject);
    });
  }

  private playNodeAnimation(
    nodeId: string,
    animationName: string,
    options: SceneLayoutSpineAnimationPlayOptions = {},
  ): Promise<void> {
    this.assertReady();
    const node = this.requireProgramSpineNode(nodeId);
    if (
      typeof animationName !== "string" ||
      animationName.length === 0 ||
      animationName !== animationName.trim()
    )
      return Promise.reject(
        new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" requires an exact non-empty animation name.`,
        ),
      );
    if (options.loop !== undefined && typeof options.loop !== "boolean")
      return Promise.reject(
        new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" playback loop must be boolean.`,
        ),
      );
    if (options.signal?.aborted)
      return Promise.reject(
        new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" playback was aborted.`,
        ),
      );

    this.rejectNodeProgramPlayback(
      node,
      `Scene layout Spine node "${nodeId}" playback was superseded.`,
      "superseded",
    );
    const loop = options.loop ?? false;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    let playback!: NodeProgramPlayback;
    const abortListener = options.signal
      ? () => {
          if (node.programPlayback !== playback) return;
          node.player?.reset();
          this.rejectNodeProgramPlayback(
            node,
            `Scene layout Spine node "${nodeId}" playback was aborted.`,
            "aborted",
          );
        }
      : undefined;
    playback = {
      animation: animationName,
      loop,
      promise,
      resolve,
      reject,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(abortListener ? { abortListener } : {}),
    };
    node.programPlayback = playback;
    options.signal?.addEventListener("abort", abortListener!, { once: true });
    try {
      node.player!.play({ animationName, loop });
    } catch (error) {
      this.rejectNodeProgramPlayback(
        node,
        error instanceof Error ? error.message : String(error),
        "failed",
      );
      return promise;
    }
    this.#observeSpinePlayback?.({
      nodeId,
      animation: animationName,
      loop,
      phase: "started",
    });
    return promise;
  }

  private stopNodeAnimation(nodeId: string): void {
    this.assertReady();
    const node = this.requireProgramSpineNode(nodeId);
    node.player!.reset();
    this.rejectNodeProgramPlayback(
      node,
      `Scene layout Spine node "${nodeId}" playback was stopped.`,
      "stopped",
    );
  }

  private resolveNodeProgramPlayback(
    node: RuntimeNode,
    playback: NodeProgramPlayback,
  ): void {
    if (node.programPlayback !== playback) return;
    playback.signal?.removeEventListener("abort", playback.abortListener!);
    node.programPlayback = null;
    playback.resolve();
    this.#observeSpinePlayback?.({
      nodeId: node.spec.id,
      animation: playback.animation,
      loop: playback.loop,
      phase: "ended",
      outcome: "completed",
    });
  }

  private rejectNodeProgramPlayback(
    node: RuntimeNode,
    message: string,
    outcome: Exclude<SceneLayoutSpinePlaybackOutcome, "completed">,
  ): void {
    const playback = node.programPlayback;
    if (!playback) return;
    playback.signal?.removeEventListener("abort", playback.abortListener!);
    node.programPlayback = null;
    playback.reject(new SceneLayoutError(message));
    this.#observeSpinePlayback?.({
      nodeId: node.spec.id,
      animation: playback.animation,
      loop: playback.loop,
      phase: "ended",
      outcome,
    });
  }

  private createNodeMotion(nodeId: string): SceneLayoutRenderObjectMotion {
    const node = this.requireNode(nodeId);
    if (node.programMotion)
      throw new SceneLayoutError(
        `Scene layout node "${nodeId}" motion was already created.`,
      );
    const adapter = Object.freeze({
      owned: true,
      assertUsable: () => this.assertReady(),
      capture: () => node.motionState,
      apply: (state: RenderObjectMotionState) => {
        this.assertReady();
        node.motionState = state;
        applyNodeProgramTransform(node);
      },
    });
    node.programMotionAttachment = attachRenderObjectMotionAdapter(
      this.#renderObjectMotionRuntime,
      node.programMotionBinding,
      adapter,
    );
    const common = createRenderObjectMotionController(
      node.programMotionBinding,
      () => this.assertReady(),
    );
    node.programMotion = common;
    const homeAnchor = createContainerRenderAnchor(
      () => {
        this.assertReady();
        return this.container;
      },
      () => {
        this.assertReady();
        return { x: node.homeX, y: node.homeY };
      },
    );
    return Object.freeze({
      getHomeAnchor: () => {
        this.assertReady();
        return homeAnchor;
      },
      snap: (target: SceneLayoutRenderObjectMotionTarget) => {
        common.snap({ position: this.resolveNodeMotionTarget(node, target) });
      },
      move: (options: SceneLayoutRenderObjectMotionOptions) =>
        common.animate({
          position: this.resolveNodeMotionTarget(node, options),
          durationSeconds: options.durationSeconds,
          ...(options.easing ? { easing: options.easing } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        }),
      animate: (animation: SceneLayoutRenderObjectPropertyAnimation) => {
        if (!animation || typeof animation !== "object")
          return Promise.reject(
            new SceneLayoutError(
              `Scene layout node "${nodeId}" motion animation is required.`,
            ),
          );
        let position: SceneLayoutPoint | undefined;
        try {
          position = animation.position
            ? this.resolveNodeMotionTarget(node, animation.position, {
                scale: animation.scale ?? node.motionState.scale,
                rotationDegrees:
                  animation.rotationDegrees ?? node.motionState.rotationDegrees,
              })
            : undefined;
        } catch (error) {
          return Promise.reject(asSceneLayoutError(error));
        }
        return common.animate({
          durationSeconds: animation.durationSeconds,
          ...(position ? { position } : {}),
          ...(animation.opacity === undefined
            ? {}
            : { opacity: animation.opacity }),
          ...(animation.scale === undefined ? {} : { scale: animation.scale }),
          ...(animation.rotationDegrees === undefined
            ? {}
            : { rotationDegrees: animation.rotationDegrees }),
          ...(animation.easing ? { easing: animation.easing } : {}),
          ...(animation.signal ? { signal: animation.signal } : {}),
        });
      },
      fadeIn: (
        options: import("../presentation/index.js").RenderObjectFadeOptions,
      ) => common.fadeIn(options),
      fadeOut: (
        options: import("../presentation/index.js").RenderObjectFadeOptions,
      ) => common.fadeOut(options),
      cancel: () => common.cancel(),
      reset: () => {
        cancelRenderObjectMotion(
          node.programMotionBinding,
          `Scene layout node "${nodeId}" motion was reset.`,
        );
        common.snap(createNeutralNodeMotionState());
      },
    });
  }

  private resolveNodeMotionTarget(
    node: RuntimeNode,
    target: SceneLayoutRenderObjectMotionTarget,
    finalTransform: Pick<
      RenderObjectMotionState,
      "scale" | "rotationDegrees"
    > = node.motionState,
  ): SceneLayoutPoint {
    if (!target || typeof target !== "object")
      throw new SceneLayoutError(
        `Scene layout node "${node.spec.id}" motion target is invalid.`,
      );
    if (target.axis !== "x" && target.axis !== "y" && target.axis !== "both")
      throw new SceneLayoutError(
        `Unknown scene layout node motion axis "${String(target.axis)}".`,
      );
    const bounds = node.slot.getLocalBounds();
    if (
      !Number.isFinite(bounds.x) ||
      !Number.isFinite(bounds.y) ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      bounds.width <= 0 ||
      bounds.height <= 0
    )
      throw new SceneLayoutError(
        `Scene layout node "${node.spec.id}" has no finite positive visual bounds for motion.`,
      );
    const selfLocal =
      target.selfAlign === "origin"
        ? Object.freeze({ x: 0, y: 0 })
        : alignedPoint(bounds, target.selfAlign);
    const selfRoot = this.container.toLocal(node.slot.toGlobal(selfLocal));
    const destination = resolveRenderAnchor(target.anchor, this.container);
    const offset = target.offset ?? { x: 0, y: 0 };
    assertFiniteSceneLayoutPoint(offset, "scene layout node motion offset");
    const desiredRoot = {
      x: target.axis === "y" ? selfRoot.x : destination.x + offset.x,
      y: target.axis === "x" ? selfRoot.y : destination.y + offset.y,
    };
    const angleRadians =
      ((node.homeRotationDegrees + finalTransform.rotationDegrees) * Math.PI) /
      180;
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);
    const localX =
      (selfLocal.x - node.slot.pivot.x) *
      node.homeScale *
      finalTransform.scale.x;
    const localY =
      (selfLocal.y - node.slot.pivot.y) *
      node.homeScale *
      finalTransform.scale.y;
    const finalOffset = {
      x: localX * cos - localY * sin,
      y: localX * sin + localY * cos,
    };
    return Object.freeze({
      x: desiredRoot.x - node.homeX - finalOffset.x,
      y: desiredRoot.y - node.homeY - finalOffset.y,
    });
  }

  private resetAllNodeMotions(message: string): void {
    for (const node of this.#nodes) {
      cancelRenderObjectMotion(node.programMotionBinding, message);
      node.motionState = createNeutralNodeMotionState();
      applyNodeProgramTransform(node);
    }
  }

  private bindNodeSlotObjects(
    nodeId: string,
    bindings: readonly SceneLayoutSpineSlotObjectBinding[],
  ): SceneLayoutSpineSlotObjectAttachment {
    this.assertReady();
    const node = this.requireProgramSpineNode(nodeId);
    const player = requireSpineSlotPlayer(node.player!, nodeId);
    const previous = node.slotObjectAttachment;
    const previousObjects = new Set(
      previous?.bindings.map((binding) => binding.object) ?? [],
    );
    if (!Array.isArray(bindings) || bindings.length === 0)
      throw new SceneLayoutError(
        `Scene layout Spine node "${nodeId}" slot bindings must not be empty.`,
      );
    const slots = new Set<string>();
    const objects = new Set<SceneLayoutSpineSlotObjectBinding["object"]>();
    const prepared = bindings.map((binding, index) => {
      if (!binding || typeof binding !== "object")
        throw new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" slot binding[${index}] is invalid.`,
        );
      if (
        typeof binding.slot !== "string" ||
        binding.slot.length === 0 ||
        binding.slot !== binding.slot.trim()
      )
        throw new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" slot binding[${index}] requires an exact non-empty slot.`,
        );
      if (slots.has(binding.slot))
        throw new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" has duplicate slot binding "${binding.slot}".`,
        );
      slots.add(binding.slot);
      if (objects.has(binding.object))
        throw new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" reuses one RenderObject in multiple slots.`,
        );
      objects.add(binding.object);
      if (
        binding.followSlotColor !== undefined &&
        typeof binding.followSlotColor !== "boolean"
      )
        throw new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" slot followSlotColor must be boolean.`,
        );
      const adapter = getRenderObjectAdapter(binding.object);
      if (!adapter.owned)
        throw new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" slot objects must be caller-owned.`,
        );
      if (adapter.view.parent && !previousObjects.has(binding.object))
        throw new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" slot object is already attached.`,
        );
      return Object.freeze({
        slot: binding.slot,
        object: binding.object,
        view: adapter.view,
        ...(binding.followSlotColor === undefined
          ? {}
          : { followSlotColor: binding.followSlotColor }),
      });
    });

    const detachBindings = (
      values: readonly PreparedNodeSlotObjectBinding[],
    ) => {
      for (const binding of values) player.removeSlotObject(binding.view);
    };
    const attachBindings = (
      values: readonly PreparedNodeSlotObjectBinding[],
    ) => {
      for (const binding of values)
        player.attachSlotObject({
          slot: binding.slot,
          object: binding.view,
          ...(binding.followSlotColor === undefined
            ? {}
            : { followSlotColor: binding.followSlotColor }),
        });
    };

    const oldBindings = previous?.bindings ?? [];
    previous?.motionAttachments.splice(0).forEach((item) => item.detach());
    detachBindings(oldBindings);
    const preparedMotionAttachments: RenderObjectMotionAttachment[] = [];
    try {
      attachBindings(prepared);
      for (const binding of prepared)
        preparedMotionAttachments.push(
          this.#renderObjectMotionRuntime.attach(binding.object),
        );
    } catch (error) {
      preparedMotionAttachments.splice(0).forEach((item) => item.detach());
      detachBindings(prepared);
      try {
        attachBindings(oldBindings);
        if (previous)
          for (const binding of oldBindings)
            previous.motionAttachments.push(
              this.#renderObjectMotionRuntime.attach(binding.object),
            );
      } catch (rollbackError) {
        previous?.unregisterCleanup.splice(0).forEach((dispose) => dispose());
        if (previous) previous.active = false;
        node.slotObjectAttachment = null;
        throw new SceneLayoutError(
          `Scene layout Spine node "${nodeId}" slot binding failed and rollback failed: ${formatRuntimeError(error)}; ${formatRuntimeError(rollbackError)}.`,
        );
      }
      throw asSceneLayoutError(error);
    }

    previous?.unregisterCleanup.splice(0).forEach((dispose) => dispose());
    if (previous) previous.active = false;
    const active: ActiveNodeSlotObjectAttachment = {
      active: true,
      bindings: Object.freeze(prepared),
      unregisterCleanup: [],
      motionAttachments: preparedMotionAttachments,
      detach: () => {
        if (!active.active) return;
        active.active = false;
        active.unregisterCleanup.splice(0).forEach((dispose) => dispose());
        active.motionAttachments.splice(0).forEach((item) => item.detach());
        detachBindings(active.bindings);
        if (node.slotObjectAttachment === active)
          node.slotObjectAttachment = null;
      },
    };
    for (const binding of prepared)
      active.unregisterCleanup.push(
        registerRenderObjectCleanup(binding.object, active.detach),
      );
    node.slotObjectAttachment = active;
    return Object.freeze({ detach: active.detach });
  }

  private requireProgramSpineNode(nodeId: string): RuntimeNode {
    const node = this.requireNode(nodeId);
    if (
      !("resource" in node.spec) ||
      node.spec.resource.kind !== "spine" ||
      "stateMachine" in node.spec.resource ||
      !node.player
    )
      throw new SceneLayoutError(
        `Scene layout node "${nodeId}" is not a prepared loop Spine node.`,
      );
    return node;
  }

  private refreshNodeVisibility(node: RuntimeNode): void {
    const spec = this.requireCurrentNode(node.spec.id);
    const placement = this.#snapshot
      ? spec.placements[this.#snapshot.variantId]
      : undefined;
    const visible =
      Boolean(placement) &&
      node.prepared &&
      this.#authoredNodeActive.get(node.spec.id) !== false &&
      this.#programNodeVisible.get(node.spec.id) !== false;
    if (!visible && node.slot.renderable)
      this.cancelStepSliderInteraction(
        node,
        `Scene layout step-slider control "${node.spec.id}" was hidden.`,
      );
    node.slot.visible = visible;
    node.slot.renderable = visible;
  }

  private authoredToArt(point: SceneLayoutPoint): SceneLayoutPoint {
    assertFiniteSceneLayoutPoint(point, "authored point");
    this.getSnapshot();
    return Object.freeze({ x: point.x, y: point.y });
  }

  private artToAuthored(point: SceneLayoutPoint): SceneLayoutPoint {
    assertFiniteSceneLayoutPoint(point, "art point");
    this.getSnapshot();
    return Object.freeze({ x: point.x, y: point.y });
  }

  private requireCurrentNode(id: string): SceneLayoutNode {
    const node = this.#manifest.nodes.find((candidate) => candidate.id === id);
    if (!node) throw new SceneLayoutError(`Unknown scene layout node "${id}".`);
    return node;
  }

  private assertReady(): void {
    this.assertAlive();
    if (!this.#initialized) {
      throw new SceneLayoutError("Scene layout runtime has not initialized.");
    }
  }

  private assertAlive(): void {
    if (this.#destroyed) {
      throw new SceneLayoutError("Scene layout runtime was destroyed.");
    }
  }
}

function applyVniOrigin(
  player: SceneLayoutVniPlayer,
  resource: SceneLayoutResource["vniResources"][string] | undefined,
  origin: "top-left" | "center",
): void {
  if (!resource) {
    throw new SceneLayoutError("Scene layout VNI resource is missing.");
  }
  const display = player.getDisplayObject();
  if (origin === "center") {
    display.pivot.set(
      resource.project.stage.width / 2,
      resource.project.stage.height / 2,
    );
  } else {
    display.pivot.set(0, 0);
  }
}

function alignedPoint(
  rect: Readonly<{ x: number; y: number; width: number; height: number }>,
  align: import("./types.js").RenderAlignment,
): SceneLayoutPoint {
  const known = new Set([
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
  ]);
  if (typeof align !== "string" || !known.has(align))
    throw new SceneLayoutError(
      `Unknown scene layout alignment "${String(align)}".`,
    );
  const horizontal = align.includes("left")
    ? 0
    : align.includes("right")
      ? 1
      : 0.5;
  const vertical = align.includes("top")
    ? 0
    : align.includes("bottom")
      ? 1
      : 0.5;
  return Object.freeze({
    x: rect.x + rect.width * horizontal,
    y: rect.y + rect.height * vertical,
  });
}

function assertFiniteSceneLayoutPoint(
  point: SceneLayoutPoint,
  label: string,
): void {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new SceneLayoutError(`${label} must contain finite coordinates.`);
}

function assertTextureSize(
  texture: Texture,
  spec: Readonly<{
    path: string;
    size: Readonly<{ width: number; height: number }>;
  }>,
  controlId: string,
  role: string,
): void {
  if (!texture?.source)
    throw new SceneLayoutError(
      `Scene layout UI control "${controlId}" ${role} image failed to load a valid Pixi texture.`,
    );
  if (texture.width !== spec.size.width || texture.height !== spec.size.height)
    throw new SceneLayoutError(
      `Scene layout UI control "${controlId}" ${role} image "${spec.path}" size mismatch: expected ${spec.size.width}x${spec.size.height}, actual ${texture.width}x${texture.height}.`,
    );
}

function consumeUiControlPointerEvent(
  event: FederatedPointerEvent,
  suppressNativeClick: boolean,
): void {
  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event.nativeEvent as Event | undefined;
  nativeEvent?.preventDefault();
  nativeEvent?.stopImmediatePropagation();
  if (!suppressNativeClick) return;
  const target = nativeEvent?.target;
  if (!(target instanceof EventTarget)) return;
  const suppression = new AbortController();
  const suppressClick = (clickEvent: Event) => {
    clickEvent.preventDefault();
    clickEvent.stopImmediatePropagation();
    suppression.abort();
  };
  target.addEventListener("click", suppressClick, {
    capture: true,
    once: true,
    signal: suppression.signal,
  });
  target.addEventListener("pointerdown", () => suppression.abort(), {
    capture: true,
    once: true,
    signal: suppression.signal,
  });
}

function applyNodePlacementTransform(
  node: RuntimeNode,
  resource: SceneLayoutResource,
  placement: SceneLayoutNodePlacement,
): void {
  const base = placement;
  const pivot = resolveNodePlacementPivot(node, resource, placement);
  node.slot.pivot.set(pivot.x, pivot.y);
  node.homeX = base.x + pivot.x * placement.scale;
  node.homeY = base.y + pivot.y * placement.scale;
  node.homeScale = placement.scale;
  node.homeRotationDegrees = placement.rotation ?? 0;
  applyNodeProgramTransform(node);
}

function applyNodeProgramTransform(node: RuntimeNode): void {
  node.slot.position.set(
    node.homeX + node.motionState.position.x,
    node.homeY + node.motionState.position.y,
  );
  node.slot.alpha = node.motionState.opacity;
  node.slot.scale.set(
    node.homeScale * node.motionState.scale.x,
    node.homeScale * node.motionState.scale.y,
  );
  node.slot.angle = node.homeRotationDegrees + node.motionState.rotationDegrees;
}

function createNeutralNodeMotionState(): RenderObjectMotionState {
  return Object.freeze({
    position: Object.freeze({ x: 0, y: 0 }),
    opacity: 1,
    scale: Object.freeze({ x: 1, y: 1 }),
    rotationDegrees: 0,
  });
}

function resolveNodePlacementPivot(
  node: RuntimeNode,
  sceneResource: SceneLayoutResource,
  placement: SceneLayoutNodePlacement,
): { readonly x: number; readonly y: number } {
  const rotation = placement.rotation ?? 0;
  if (rotation === 0) return { x: 0, y: 0 };
  const center = placement.center ?? { x: 0.5, y: 0.5 };
  if ("uiControl" in node.spec) {
    const size = resolveSceneLayoutUiControlSize(node.spec.uiControl);
    return {
      x: (center.x - 0.5) * size.width,
      y: (center.y - 0.5) * size.height,
    };
  }
  const resource = node.spec.resource;
  if (resource.kind === "image") {
    return {
      x: (center.x - 0.5) * resource.size.width,
      y: (center.y - 0.5) * resource.size.height,
    };
  }
  if (resource.kind === "vni") {
    const vni = sceneResource.vniResources[resource.project];
    if (!vni)
      throw new SceneLayoutError(
        `Scene layout VNI resource is missing for node "${node.spec.id}".`,
      );
    return {
      x: (center.x - 0.5) * vni.project.stage.width,
      y: (center.y - 0.5) * vni.project.stage.height,
    };
  }
  if (resource.kind === "image-string") {
    const geometry = node.imageString?.getGeometry();
    if (!geometry)
      throw new SceneLayoutError(
        `Scene layout image-string node "${node.spec.id}" is not prepared.`,
      );
    const bounds = geometry.visualBounds ?? geometry.logicalBounds;
    return validNodePivot(node.spec.id, {
      x: (center.x - geometry.anchor.x) * bounds.width,
      y: (center.y - geometry.anchor.y) * bounds.height,
    });
  }
  if (center.x === 0.5 && center.y === 0.5) return { x: 0, y: 0 };
  const view = node.player?.view;
  if (!view)
    throw new SceneLayoutError(
      `Scene layout Spine node "${node.spec.id}" is not prepared.`,
    );
  return validNodePivot(node.spec.id, {
    x: (center.x - 0.5) * view.width,
    y: (center.y - 0.5) * view.height,
  });
}

function validNodePivot(
  nodeId: string,
  pivot: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  if (!Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) {
    throw new SceneLayoutError(
      `Scene layout node "${nodeId}" produced an invalid rotation center.`,
    );
  }
  return pivot;
}

function assertCompatibleSceneLayoutNodes(
  current: SceneLayoutManifestLatest,
  next: SceneLayoutManifestLatest,
): void {
  const structure = (manifest: SceneLayoutManifestLatest) => ({
    id: manifest.id,
    main: manifest.main,
    nodes: manifest.nodes.map(
      ({ placements: _placements, scope: _scope, ...node }) => node,
    ),
    symbolPackage: manifest.symbolPackage,
    symbolPackages: manifest.symbolPackages,
    popups: manifest.popups
      ? Object.fromEntries(
          Object.entries(manifest.popups).map(
            ([id, { placements: _placements, ...popup }]) => [id, popup],
          ),
        )
      : undefined,
    runtimeResources: manifest.runtimeResources,
  });
  if (JSON.stringify(structure(current)) !== JSON.stringify(structure(next)))
    throw new SceneLayoutError(
      "scene layout geometry update changed immutable structure.",
    );
}

async function loadSceneLayoutTexture(url: string): Promise<Texture> {
  const texture =
    url.startsWith("scene-layout-delivery:") && Cache.has(url)
      ? Cache.get<Texture>(url)
      : ((await Assets.load({
          src: url,
          parser: "loadTextures",
        })) as Texture | null | undefined);
  if (!texture?.source) {
    throw new SceneLayoutError(
      "Scene layout image failed to load a valid Pixi texture.",
    );
  }
  return texture;
}

async function unloadSceneLayoutTexture(url: string): Promise<void> {
  await Assets.unload(url);
}

async function settleAllInOrder<T>(promises: readonly Promise<T>[]) {
  const results = await Promise.allSettled(promises);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) throw failure.reason;
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}

function assertAttachable(object: Container): void {
  if (!(object instanceof Container)) {
    throw new SceneLayoutError(
      "Attached scene layout object must be a Container.",
    );
  }
  if (object.parent) {
    throw new SceneLayoutError(
      "Attached scene layout object already has a parent.",
    );
  }
}

function createDisposer(parent: Container, object: Container): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (object.parent === parent) parent.removeChild(object);
  };
}

function requireSpineSlotPlayer(
  player: RendercoreSpinePlayer,
  nodeId: string,
): RendercoreSpineSlotPlayer {
  const candidate = player as Partial<RendercoreSpineSlotPlayer>;
  if (
    typeof candidate.attachSlotObject !== "function" ||
    typeof candidate.removeSlotObject !== "function"
  )
    throw new SceneLayoutError(
      `Scene layout Spine node "${nodeId}" does not support slot objects.`,
    );
  return candidate as RendercoreSpineSlotPlayer;
}

function formatRuntimeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asSceneLayoutError(error: unknown): SceneLayoutError {
  return error instanceof SceneLayoutError
    ? error
    : new SceneLayoutError(
        error instanceof Error ? error.message : String(error),
      );
}
