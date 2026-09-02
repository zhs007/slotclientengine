import { Container, Sprite } from "pixi.js";
import { VNIRuntime } from "@slotclientengine/vnicore/core";
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
  type RendercoreSpineSlotPlayer,
} from "../spine/runtime-player.js";
import {
  requestPopupVniPlaybackEnd,
  startPopupVniPlayback,
} from "./vni-playback.js";
import { createRenderImageString } from "../image-string/core/index.js";
import { createPopupStyledText } from "./styled-text.js";
import {
  createPopupObjectInstanceRuntime,
  type PopupObjectInstanceHandle,
} from "./object-runtime.js";
import type {
  AwardPopupLayerV9,
  PopupOverlayLayer,
  PopupPreparedResource,
  PopupSegment,
  SingleStatePopupLayerV8,
  SingleStatePopupLayerV9,
  SpinePopupOverlayLayerV5,
  SpinePopupOverlayLayerV9,
} from "./types.js";

export interface SpinePopupOverlayRuntime {
  readonly container: Container;
  readonly spinePlayer?: RendercoreSpineSlotPlayer;
  readonly objectHandle?: PopupObjectInstanceHandle;
  readonly stringNode?: {
    readonly kind: "text" | "image-string";
    readonly name: string;
    readonly defaultText: string;
    setText(text: string): void;
  };
  mountNodeToTextLayer?(options: {
    readonly textLayerId: string;
    readonly node: Container;
  }): () => void;
  init(): Promise<void>;
  start(): void;
  update(deltaSeconds: number): void;
  applySegment(segment: PopupSegment): void;
  destroy(): void;
}

export function createSpinePopupOverlayRuntime(options: {
  readonly popupId: string;
  readonly layer:
    | PopupOverlayLayer
    | AwardPopupLayerV9
    | SpinePopupOverlayLayerV5
    | SpinePopupOverlayLayerV9
    | SingleStatePopupLayerV8
    | SingleStatePopupLayerV9;
  readonly resource?: PopupPreparedResource;
  readonly spinePlayerFactory?: () => RendercoreSpinePlayer;
  readonly vniPlayerFactory?: (parent: Container) => VNIRuntime;
}): SpinePopupOverlayRuntime {
  const { layer, resource } = options;
  if (layer.kind === "text") {
    if (resource && resource.kind !== "font")
      throw new Error(`popup overlay/resource kind mismatch: ${layer.id}`);
  } else if (!resource || layer.kind !== resource.kind) {
    throw new Error(`popup overlay/resource kind mismatch: ${layer.id}`);
  }
  const container = new Container();
  container.position.set(layer.transform.x, layer.transform.y);
  container.scale.set(layer.transform.scale);
  container.rotation = ((layer.transform.rotation ?? 0) * Math.PI) / 180;
  container.alpha = layer.alpha ?? 1;
  container.zIndex = layer.order;
  container.visible = false;
  if (layer.kind === "popup-object" && resource?.kind === "popup-object") {
    const object = createPopupObjectInstanceRuntime({ resource });
    container.addChild(object.container);
    let active = false;
    const setActive = (next: boolean) => {
      if (next === active) return;
      active = next;
      object.setActive(next);
      container.visible = next;
    };
    return {
      container,
      objectHandle: object.handle,
      async init() {
        await object.init();
      },
      start() {
        setActive(visibleInSegment(layer, "start"));
      },
      update(deltaSeconds) {
        if (active) object.update(deltaSeconds);
      },
      applySegment(segment) {
        setActive(visibleInSegment(layer, segment));
      },
      destroy() {
        object.destroy();
        container.destroy({ children: false });
      },
    };
  }
  if (layer.kind === "image" && resource?.kind === "image") {
    const sprite = new Sprite(resource.texture);
    sprite.anchor.set(layer.anchor.x, layer.anchor.y);
    container.addChild(sprite);
    return {
      container,
      async init() {},
      start() {
        container.visible = visibleInSegment(layer, "start");
      },
      update() {},
      applySegment(segment) {
        container.visible = visibleInSegment(layer, segment);
      },
      destroy() {
        container.destroy({ children: true });
      },
    };
  }
  if (layer.kind === "image-string" && resource?.kind === "image-string") {
    const renderer = createRenderImageString({
      resource: resource.resource,
      text: layer.defaultText ?? "",
      anchor: layer.anchor,
    });
    container.addChild(renderer.container);
    return {
      container,
      stringNode: {
        kind: "image-string",
        name: "name" in layer ? (layer.name ?? layer.id) : layer.id,
        defaultText: layer.defaultText ?? "",
        setText(text) {
          renderer.setText(text);
        },
      },
      async init() {},
      start() {
        container.visible = visibleInSegment(layer, "start");
      },
      update() {},
      applySegment(segment) {
        container.visible = visibleInSegment(layer, segment);
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
      stringNode: {
        kind: "text",
        name: "name" in layer ? layer.name : layer.id,
        defaultText: layer.defaultText,
        setText(text) {
          renderer.setText(text);
        },
      },
      async init() {},
      start() {
        container.visible = visibleInSegment(layer, "start");
      },
      update() {},
      applySegment(segment) {
        container.visible = visibleInSegment(layer, segment);
      },
      destroy() {
        renderer.destroy();
        container.destroy({ children: false });
      },
    };
  }
  if (layer.kind === "spine" && resource?.kind === "spine") {
    const player = options.spinePlayerFactory
      ? options.spinePlayerFactory()
      : createOfficialSpinePlayer({ resource: resource.resource });
    container.addChild(player.view);
    let segment: PopupSegment = "start";
    return {
      container,
      ...(isSpineSlotPlayer(player) ? { spinePlayer: player } : {}),
      async init() {
        await player.init();
      },
      start() {
        segment = "start";
        container.visible = visibleInSegment(layer, "start");
        if ("playback" in layer)
          player.play({
            animationName: layer.playback.startAnimation,
            loop: false,
          });
        else if (layer.autoplay)
          player.play({
            animationName: layer.autoplay.animation,
            loop: layer.autoplay.loop,
          });
      },
      update(deltaSeconds) {
        const result = player.update(deltaSeconds);
        if ("playback" in layer && segment === "start" && result.completed) {
          segment = "loop";
          player.play({
            animationName: layer.playback.loopAnimation,
            loop: true,
          });
        }
      },
      applySegment(next) {
        container.visible = visibleInSegment(layer, next);
        if (!("playback" in layer) || next !== "end" || segment === "end")
          return;
        segment = "end";
        player.play({
          animationName: layer.playback.endAnimation,
          loop: false,
        });
      },
      destroy() {
        player.destroy();
        container.destroy({ children: false });
      },
    };
  }
  if (layer.kind === "vni" && resource?.kind === "vni") {
    const player = options.vniPlayerFactory
      ? options.vniPlayerFactory(container)
      : new VNIRuntime({
          parent: container,
          project: resource.project,
          assetUrls: resource.assetUrls,
        });
    let mountIndex = 0;
    return {
      container,
      async init() {
        await player.init();
        player
          .getDisplayObject()
          .pivot.set(
            resource.project.stage.width / 2,
            resource.project.stage.height / 2,
          );
      },
      start() {
        container.visible = visibleInSegment(layer, "start");
        const playback = "playback" in layer ? layer.playback : layer.autoplay;
        if (playback) startPopupVniPlayback(player, playback);
      },
      update(deltaSeconds) {
        player.update(deltaSeconds);
      },
      applySegment(segment) {
        container.visible = visibleInSegment(layer, segment);
        if (segment === "end" && "playback" in layer)
          requestPopupVniPlaybackEnd(player, layer.playback);
      },
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
        player.destroy();
        container.destroy({ children: false });
      },
    };
  }
  throw new Error(`unsupported popup overlay ${layer.id}.`);
}

function visibleInSegment(
  layer:
    | PopupOverlayLayer
    | AwardPopupLayerV9
    | SpinePopupOverlayLayerV5
    | SpinePopupOverlayLayerV9
    | SingleStatePopupLayerV8
    | SingleStatePopupLayerV9,
  segment: PopupSegment,
): boolean {
  if ("visibleStates" in layer && layer.visibleStates)
    return layer.visibleStates.includes(segment);
  if ("visibleSegments" in layer && layer.visibleSegments)
    return layer.visibleSegments.includes(segment);
  return true;
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
