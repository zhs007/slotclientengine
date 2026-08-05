import { Container, Sprite } from "pixi.js";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import {
  requestPopupVniPlaybackEnd,
  startPopupVniPlayback,
} from "./vni-playback.js";
import type {
  PopupOverlayLayer,
  PopupPreparedResource,
  PopupSegment,
} from "./types.js";

export interface SpinePopupOverlayRuntime {
  readonly container: Container;
  init(): Promise<void>;
  start(): void;
  update(deltaSeconds: number): void;
  applySegment(segment: PopupSegment): void;
  destroy(): void;
}

export function createSpinePopupOverlayRuntime(options: {
  readonly popupId: string;
  readonly layer: PopupOverlayLayer;
  readonly resource: PopupPreparedResource;
  readonly spinePlayerFactory?: () => RendercoreSpinePlayer;
  readonly vniPlayerFactory?: (parent: Container) => VNIPlayer;
}): SpinePopupOverlayRuntime {
  const { layer, resource } = options;
  if (layer.kind !== resource.kind)
    throw new Error(`popup overlay/resource kind mismatch: ${layer.id}`);
  const container = new Container();
  container.position.set(layer.transform.x, layer.transform.y);
  container.scale.set(layer.transform.scale);
  container.rotation = (layer.transform.rotation * Math.PI) / 180;
  container.zIndex = layer.order;
  container.visible = false;
  if (layer.kind === "image" && resource.kind === "image") {
    const sprite = new Sprite(resource.texture);
    sprite.anchor.set(layer.anchor.x, layer.anchor.y);
    container.addChild(sprite);
    return {
      container,
      async init() {},
      start() {
        container.visible = layer.visibleSegments.includes("start");
      },
      update() {},
      applySegment(segment) {
        container.visible = layer.visibleSegments.includes(segment);
      },
      destroy() {
        container.destroy({ children: true });
      },
    };
  }
  if (layer.kind === "spine" && resource.kind === "spine") {
    const player = options.spinePlayerFactory
      ? options.spinePlayerFactory()
      : createOfficialSpinePlayer({ resource: resource.resource });
    container.addChild(player.view);
    let segment: PopupSegment = "start";
    return {
      container,
      async init() {
        await player.init();
      },
      start() {
        segment = "start";
        container.visible = true;
        player.play({
          animationName: layer.playback.startAnimation,
          loop: false,
        });
      },
      update(deltaSeconds) {
        const result = player.update(deltaSeconds);
        if (segment === "start" && result.completed) {
          segment = "loop";
          player.play({
            animationName: layer.playback.loopAnimation,
            loop: true,
          });
        }
      },
      applySegment(next) {
        if (next !== "end" || segment === "end") return;
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
  if (layer.kind === "vni" && resource.kind === "vni") {
    const player = options.vniPlayerFactory
      ? options.vniPlayerFactory(container)
      : new VNIPlayer({
          parent: container,
          projectId: `${options.popupId}-overlay-${layer.id}`,
          bundleId: "popup",
          profileId: "popup",
          profilePurpose: "spine-popup-overlay",
          assetScale: 1,
          project: resource.project,
          assetUrls: resource.assetUrls,
          autoTick: false,
          fitPadding: 0,
        });
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
        container.visible = true;
        startPopupVniPlayback(player, layer.playback);
      },
      update(deltaSeconds) {
        player.update(deltaSeconds);
      },
      applySegment(segment) {
        if (segment === "end")
          requestPopupVniPlaybackEnd(player, layer.playback);
      },
      destroy() {
        player.destroy();
        container.destroy({ children: false });
      },
    };
  }
  throw new Error(`unsupported popup overlay ${layer.id}.`);
}
