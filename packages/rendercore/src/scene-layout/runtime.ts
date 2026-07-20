import { Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import {
  assertValidSpineDeltaSeconds,
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import { SpineStateController } from "../spine/state-controller.js";
import {
  createRenderImageString,
  type RenderImageString,
} from "../image-string/index.js";
import type { RenderViewportSize } from "../viewport/index.js";
import { SceneLayoutError } from "./errors.js";
import {
  resolveSceneLayoutReelGrid,
  resolveSceneLayoutViewport,
} from "./geometry.js";
import type {
  AttachChildOptions,
  AttachRelativeOptions,
  ResolvedSceneLayoutReelGrid,
  SceneLayoutNode,
  SceneLayoutResource,
  SceneLayoutRuntime,
  SceneLayoutSnapshot,
  SceneLayoutNodeStateSnapshot,
  SceneLayoutVariantId,
} from "./types.js";

export interface CreateSceneLayoutRuntimeOptions {
  readonly resource: SceneLayoutResource;
  readonly loadTexture?: (url: string) => Promise<Texture>;
  readonly unloadTexture?: (url: string) => Promise<void>;
  readonly createSpinePlayer?: (options: {
    readonly node: SceneLayoutNode;
    readonly resource: SceneLayoutResource["spineResources"][string];
  }) => RendercoreSpinePlayer;
}

interface RuntimeNode {
  readonly spec: SceneLayoutNode;
  readonly slot: Container;
  readonly named: Container;
  readonly before: Container;
  readonly after: Container;
  player: RendercoreSpinePlayer | null;
  stateController: SpineStateController | null;
  imageString: RenderImageString | null;
  texture: Texture | null;
}

export function createSceneLayoutRuntime(
  options: CreateSceneLayoutRuntimeOptions,
): SceneLayoutRuntime {
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
  readonly #nodes: readonly RuntimeNode[];
  readonly #nodesById: ReadonlyMap<string, RuntimeNode>;
  readonly #artMask = new Graphics();
  readonly #loadedTextureUrls = new Set<string>();
  #snapshot: SceneLayoutSnapshot | null = null;
  #initializing = false;
  #initialized = false;
  #destroyed = false;

  constructor(options: CreateSceneLayoutRuntimeOptions) {
    this.#resource = options.resource;
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
    this.container.label = `scene-layout:${options.resource.manifest.id}`;
    this.container.sortableChildren = false;
    const nodes = options.resource.manifest.nodes.map((spec) => {
      const slot = new Container();
      const before = new Container();
      const named = new Container();
      const after = new Container();
      slot.label = `scene-layout-slot:${spec.id}`;
      before.label = `scene-layout-before:${spec.id}`;
      named.label = spec.id;
      after.label = `scene-layout-after:${spec.id}`;
      slot.addChild(before, named, after);
      this.container.addChild(slot);
      return {
        spec,
        slot,
        named,
        before,
        after,
        player: null,
        stateController: null,
        imageString: null,
        texture: null,
      };
    });
    this.#nodes = Object.freeze(nodes);
    this.#nodesById = new Map(nodes.map((node) => [node.spec.id, node]));
    this.#artMask.label = "scene-layout-art-mask";
    this.#artMask.visible = true;
    this.#artMask.renderable = true;
    this.#artMask.includeInBuild = false;
    this.#artMask.measurable = false;
    this.container.addChild(this.#artMask);
    this.container.mask = this.#artMask;
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
      for (const node of this.#nodes) await this.initNode(node);
      this.assertAlive();
      this.#initialized = true;
    } catch (error) {
      this.releaseNodeResources();
      throw asSceneLayoutError(error);
    } finally {
      this.#initializing = false;
    }
  }

  applyViewport(viewportSize: RenderViewportSize): SceneLayoutSnapshot {
    this.assertReady();
    const snapshot = resolveSceneLayoutViewport({
      manifest: this.#resource.manifest,
      viewportSize,
    });
    this.#snapshot = snapshot;
    this.container.position.set(snapshot.worldOffset.x, snapshot.worldOffset.y);
    this.#artMask.clear();
    this.#artMask
      .rect(0, 0, snapshot.artSize.width, snapshot.artSize.height)
      .fill({ color: 0xffffff, alpha: 1 });
    for (const node of this.#nodes) {
      const placement = node.spec.placements[snapshot.variantId];
      node.slot.visible = Boolean(placement);
      node.slot.renderable = Boolean(placement);
      if (placement) {
        node.slot.position.set(placement.x, placement.y);
        node.slot.scale.set(placement.scale);
      }
    }
    return snapshot;
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    try {
      assertValidSpineDeltaSeconds(deltaSeconds);
    } catch (error) {
      throw asSceneLayoutError(error);
    }
    for (const node of this.#nodes) {
      if (node.player && node.slot.renderable) {
        const result = node.player.update(deltaSeconds);
        node.stateController?.updateCompleted(result.completed);
      }
    }
  }

  getSnapshot(): SceneLayoutSnapshot {
    this.assertReady();
    if (!this.#snapshot) {
      throw new SceneLayoutError("Scene layout viewport has not been applied.");
    }
    return this.#snapshot;
  }

  getNode(id: string): Container {
    this.assertReady();
    return this.requireNode(id).named;
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

  getReelGrid(id: string): ResolvedSceneLayoutReelGrid {
    this.assertReady();
    const variantId = this.#snapshot?.variantId ?? this.defaultVariantId();
    return resolveSceneLayoutReelGrid(this.#resource.manifest, id, variantId);
  }

  getImageStringNodeNames(): readonly string[] {
    this.assertReady();
    return Object.freeze(
      this.#nodes
        .filter((node) => node.spec.resource.kind === "image-string")
        .map((node) => node.spec.id),
    );
  }

  setImageStringText(nodeId: string, text: string): void {
    this.assertReady();
    this.requireImageStringNode(nodeId).setText(text);
  }

  getImageStringText(nodeId: string): string {
    this.assertReady();
    return this.requireImageStringNode(nodeId).getSnapshot().text;
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

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.container.mask = null;
    this.releaseNodeResources();
    this.#artMask.destroy();
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
    this.#initialized = false;
  }

  private async initNode(node: RuntimeNode): Promise<void> {
    if (node.spec.resource.kind === "image") {
      const url = this.#resource.imageUrls[node.spec.resource.path];
      if (!url) {
        throw new SceneLayoutError(
          `Scene layout image URL is missing: ${node.spec.resource.path}.`,
        );
      }
      const texture = await this.#loadTexture(url);
      this.#loadedTextureUrls.add(url);
      this.assertAlive();
      if (!texture?.source) {
        throw new SceneLayoutError(
          `Scene layout image "${node.spec.resource.path}" failed to load a valid Pixi texture.`,
        );
      }
      const width = texture.source.width;
      const height = texture.source.height;
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
        loop: true,
      });
    }
    node.named.addChild(player.view);
  }

  private releaseNodeResources(): void {
    for (const node of this.#nodes) {
      node.stateController?.destroy(
        `Scene layout Spine node "${node.spec.id}" was destroyed.`,
      );
      node.stateController = null;
      node.player?.destroy();
      node.player = null;
      node.imageString?.destroy();
      node.imageString = null;
      node.texture = null;
      node.named.removeChildren();
    }
    const textureUrls = [...this.#loadedTextureUrls];
    this.#loadedTextureUrls.clear();
    for (const url of textureUrls) {
      try {
        void this.#unloadTexture(url).catch(() => undefined);
      } catch {
        // Resource release is best-effort and must remain idempotent.
      }
    }
  }

  private requireNode(id: string): RuntimeNode {
    const node = this.#nodesById.get(id);
    if (!node) throw new SceneLayoutError(`Unknown scene layout node "${id}".`);
    return node;
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

  private defaultVariantId(): SceneLayoutVariantId {
    return this.#resource.manifest.adaptation.mode === "maximized-focus"
      ? "default"
      : "landscape";
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

async function loadSceneLayoutTexture(url: string): Promise<Texture> {
  const texture = (await Assets.load({
    src: url,
    parser: "loadTextures",
  })) as Texture | null | undefined;
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

function asSceneLayoutError(error: unknown): SceneLayoutError {
  return error instanceof SceneLayoutError
    ? error
    : new SceneLayoutError(
        error instanceof Error ? error.message : String(error),
      );
}
