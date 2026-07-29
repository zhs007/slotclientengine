import { Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import { VNIPlayer } from "@slotclientengine/vnicore";
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
  assertSceneLayoutGeometryCompatible,
  parseSceneLayoutManifest,
} from "./manifest.js";
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
  readonly createVniPlayer?: (options: {
    readonly node: SceneLayoutNode;
    readonly parent: Container;
    readonly resource: SceneLayoutResource["vniResources"][string];
  }) => SceneLayoutVniPlayer;
}

export interface SceneLayoutVniPlayer {
  init(): Promise<void>;
  setLoop(loop: boolean): void;
  play(): void;
  update(deltaSeconds: number): void;
  destroy(): void;
  getDisplayObject(): Container;
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
  readonly #createVniPlayer: NonNullable<
    CreateSceneLayoutRuntimeOptions["createVniPlayer"]
  >;
  readonly #nodes: readonly RuntimeNode[];
  readonly #nodesById: ReadonlyMap<string, RuntimeNode>;
  readonly #artMask = new Graphics();
  readonly #loadedTextureUrls = new Set<string>();
  readonly #texturesByUrl = new Map<string, Texture>();
  readonly #activeNodes = new Map<string, boolean>();
  #manifest: SceneLayoutResource["manifest"];
  #snapshot: SceneLayoutSnapshot | null = null;
  #initializing = false;
  #initialized = false;
  #destroyed = false;

  constructor(options: CreateSceneLayoutRuntimeOptions) {
    this.#resource = options.resource;
    this.#manifest = options.resource.manifest;
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
        return new VNIPlayer({
          parent: playerOptions.parent,
          projectId: playerOptions.node.id,
          bundleId: options.resource.manifest.id,
          profileId: profile.id,
          profilePurpose: profile.purpose,
          assetScale: profile.assetScale,
          project: playerOptions.resource.project,
          assetUrls: playerOptions.resource.assetUrls,
          autoTick: false,
          fitPadding: 0,
        });
      });
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
        vniPlayer: null,
        stateController: null,
        imageString: null,
        imageSprite: null,
        texture: null,
      };
    });
    this.#nodes = Object.freeze(nodes);
    this.#nodesById = new Map(nodes.map((node) => [node.spec.id, node]));
    for (const node of nodes) this.#activeNodes.set(node.spec.id, true);
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
      manifest: this.#manifest,
      viewportSize,
    });
    this.#snapshot = snapshot;
    this.container.position.set(snapshot.worldOffset.x, snapshot.worldOffset.y);
    this.#artMask.clear();
    this.#artMask
      .rect(0, 0, snapshot.artSize.width, snapshot.artSize.height)
      .fill({ color: 0xffffff, alpha: 1 });
    for (const node of this.#nodes) {
      const spec = this.requireCurrentNode(node.spec.id);
      const placement = spec.placements[snapshot.variantId];
      const active = this.#activeNodes.get(node.spec.id) !== false;
      node.slot.visible = Boolean(placement) && active;
      node.slot.renderable = Boolean(placement) && active;
      if (placement) {
        const position = resolveNodePlacementPosition(
          this.#manifest,
          snapshot.variantId,
          placement,
        );
        node.slot.position.set(position.x, position.y);
        node.slot.scale.set(placement.scale);
      }
    }
    return snapshot;
  }

  applyGeometryManifest(
    manifestValue: SceneLayoutResource["manifest"],
  ): SceneLayoutSnapshot | null {
    this.assertReady();
    const manifest = parseSceneLayoutManifest(manifestValue);
    assertSceneLayoutGeometryCompatible(this.#manifest, manifest);
    const nextSnapshot = this.#snapshot
      ? resolveSceneLayoutViewport({
          manifest,
          viewportSize: this.#snapshot.viewportSize,
        })
      : null;
    this.#manifest = manifest;
    for (const node of this.#nodes)
      if (node.imageSprite)
        node.imageSprite.anchor.set(
          (manifest.coordinateOrigin ?? "top-left") === "center" ? 0.5 : 0,
        );
      else if (node.vniPlayer)
        applyVniOrigin(
          node.vniPlayer,
          this.#resource.vniResources[
            node.spec.resource.kind === "vni" ? node.spec.resource.project : ""
          ],
          manifest.coordinateOrigin ?? "top-left",
        );
    return nextSnapshot ? this.applyViewport(nextSnapshot.viewportSize) : null;
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
    return resolveSceneLayoutReelGrid(this.#manifest, id, variantId);
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

  setNodeActive(nodeId: string, active: boolean): void {
    this.assertReady();
    const node = this.requireNode(nodeId);
    this.#activeNodes.set(nodeId, active);
    const placement = this.#snapshot?.variantId
      ? node.spec.placements[this.#snapshot.variantId]
      : undefined;
    node.slot.visible = active && Boolean(placement);
    node.slot.renderable = active && Boolean(placement);
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
      let texture = this.#texturesByUrl.get(url);
      if (!texture) {
        texture = await this.#loadTexture(url);
        this.#loadedTextureUrls.add(url);
        this.assertAlive();
        if (!texture?.source) {
          throw new SceneLayoutError(
            `Scene layout image "${node.spec.resource.path}" failed to load a valid Pixi texture.`,
          );
        }
        this.#texturesByUrl.set(url, texture);
      }
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
      sprite.anchor.set(
        (this.#manifest.coordinateOrigin ?? "top-left") === "center" ? 0.5 : 0,
      );
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
      applyVniOrigin(
        player,
        resource,
        this.#manifest.coordinateOrigin ?? "top-left",
      );
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

  private releaseNodeResources(): void {
    for (const node of this.#nodes) {
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
      node.texture = null;
      node.named.removeChildren();
    }
    const textureUrls = [...this.#loadedTextureUrls];
    this.#loadedTextureUrls.clear();
    this.#texturesByUrl.clear();
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
    return this.#manifest.adaptation.mode === "maximized-focus"
      ? "default"
      : "landscape";
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

function resolveNodePlacementPosition(
  manifest: SceneLayoutResource["manifest"],
  variantId: SceneLayoutVariantId,
  placement: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  if ((manifest.coordinateOrigin ?? "top-left") === "top-left")
    return placement;
  const artSize =
    manifest.adaptation.mode === "maximized-focus"
      ? manifest.adaptation.artSize
      : manifest.adaptation.variants[variantId as "landscape" | "portrait"]
          .artSize;
  return {
    x: artSize.width / 2 + placement.x,
    y: artSize.height / 2 + placement.y,
  };
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
