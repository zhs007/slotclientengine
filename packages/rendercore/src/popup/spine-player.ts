import { Container, type Text } from "pixi.js";
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import type {
  PopupPackageResource,
  PopupStringNodeHandle,
  PopupStringNodeSelector,
  SpinePopupPlayer,
  SpinePopupSnapshot,
} from "./types.js";
import { createPopupPromptText } from "./prompt-text.js";
import { createPopupStringNodeRegistry } from "./string-node-registry.js";
import {
  createSpinePopupOverlayRuntime,
  type SpinePopupOverlayRuntime,
} from "./spine-overlay-runtime.js";
import { createPopupPresentation } from "./presentation.js";

export function createSpinePopupPlayer(options: {
  readonly resource: PopupPackageResource;
  readonly playerFactory?: () => RendercoreSpinePlayer;
  readonly measurePromptText?: (text: Text) => {
    readonly width: number;
    readonly height: number;
  };
}): SpinePopupPlayer {
  if (options.resource.manifest.type !== "spine")
    throw new Error("Spine popup player requires a spine popup package.");
  const manifest = options.resource.manifest;
  const prepared = options.resource.resources[manifest.spine.resource];
  if (prepared?.kind !== "spine")
    throw new Error("Spine popup prepared resource mismatch.");
  const player = options.playerFactory
    ? options.playerFactory()
    : createOfficialSpinePlayer({ resource: prepared.resource });
  return new DefaultSpinePopupPlayer(
    options.resource as PopupPackageResource & {
      readonly manifest: typeof manifest;
    },
    player,
    options.measurePromptText,
  );
}

class DefaultSpinePopupPlayer implements SpinePopupPlayer {
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
  readonly #popupRoot = new Container();
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
  ) {
    const manifest = resource.manifest;
    this.#manifest = manifest;
    this.#player = player;
    this.#presentation = createPopupPresentation(manifest);
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
      this.#popupRoot.addChild(runtime.container);
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
    viewportSize: Parameters<NonNullable<SpinePopupPlayer["applyViewport"]>>[0],
    placement?: Parameters<NonNullable<SpinePopupPlayer["applyViewport"]>>[1],
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
    this.#phase = "start";
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

  update(deltaSeconds: number): SpinePopupSnapshot {
    this.assertReady();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("deltaSeconds must be finite and non-negative.");
    if (!this.isPlaying()) return this.getSnapshot();
    const result = this.#player.update(deltaSeconds);
    for (const overlay of this.#overlays) overlay.update(deltaSeconds);
    if (this.#phase === "start" && result.completed) {
      this.#phase = "loop";
      for (const overlay of this.#overlays) overlay.applySegment("loop");
      this.#player.play({
        animationName: this.#manifest.spine.playback.loopAnimation,
        loop: true,
      });
    } else if (
      this.#phase === "loop" &&
      this.#dismissRequested &&
      result.loopCompleted
    ) {
      this.#phase = "end";
      if (this.#prompt) this.#prompt.text.visible = false;
      for (const overlay of this.#overlays) overlay.applySegment("end");
      this.#player.play({
        animationName: this.#manifest.spine.playback.endAnimation,
        loop: false,
      });
    } else if (this.#phase === "end" && result.completed) {
      this.complete();
    }
    return this.getSnapshot();
  }

  requestDismiss(): void {
    this.assertReady();
    if (this.isPlaying()) this.#dismissRequested = true;
  }

  dismissImmediately(): void {
    this.assertReady();
    if (this.isPlaying()) this.complete();
  }

  getSnapshot(): SpinePopupSnapshot {
    this.assertUsable();
    return Object.freeze({
      phase: this.#phase,
      dismissRequested: this.#dismissRequested,
    });
  }

  isPlaying(): boolean {
    return ["start", "loop", "end"].includes(this.#phase);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
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
    this.#phase = "complete";
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
