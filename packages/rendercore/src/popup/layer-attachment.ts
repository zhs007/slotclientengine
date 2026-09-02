import { Container } from "pixi.js";
import type { RendercoreSpineSlotPlayer } from "../spine/runtime-player.js";
import type {
  PopupLayerAttachment,
  SpinePopupTapInfoAttachment,
} from "./data/types.js";
import {
  popupLayerAttachmentParentKey,
  resolvePopupLayerAttachment,
  type PopupAttachableLayer,
} from "./data/attachment.js";
export {
  popupLayerAttachmentParentKey,
  resolvePopupLayerAttachment,
  validatePopupLayerAttachmentGraph,
  type PopupAttachableLayer,
} from "./data/attachment.js";

export interface PopupLayerAttachmentRuntime {
  readonly container: Container;
  readonly spinePlayer?: RendercoreSpineSlotPlayer;
  mountNodeToTextLayer?(options: {
    readonly textLayerId: string;
    readonly node: Container;
  }): () => void;
}

export interface PopupLayerAttachmentHandle {
  destroy(): void;
}

export function attachPopupLayerRuntimes(options: {
  readonly layers: readonly PopupAttachableLayer[];
  readonly runtimes: ReadonlyMap<string, PopupLayerAttachmentRuntime>;
  readonly root: Container;
  readonly mainSpine?: RendercoreSpineSlotPlayer;
  readonly supplemental?: readonly {
    readonly attachment: SpinePopupTapInfoAttachment;
    readonly container: Container;
  }[];
}): PopupLayerAttachmentHandle {
  const groups = new Map<
    string,
    {
      readonly attachment: Exclude<
        PopupLayerAttachment,
        { readonly kind: "popup-root" }
      >;
      readonly container: Container;
      readonly children: Container[];
      dispose?: () => void;
      spinePlayer?: RendercoreSpineSlotPlayer;
    }
  >();
  const rootChildren: Container[] = [];
  let destroyed = false;
  options.root.sortableChildren = true;
  try {
    for (const layer of [...options.layers].sort(
      (left, right) => left.order - right.order,
    )) {
      const runtime = options.runtimes.get(layer.id);
      if (!runtime)
        throw new Error(`popup attachment runtime missing: ${layer.id}.`);
      const attachment = resolvePopupLayerAttachment(layer);
      runtime.container.zIndex = layer.order;
      if (attachment.kind === "popup-root") {
        options.root.addChild(runtime.container);
        rootChildren.push(runtime.container);
        continue;
      }
      const key = popupLayerAttachmentParentKey(attachment);
      let group = groups.get(key);
      if (!group) {
        const container = new Container();
        container.label = `popup-attachment:${key}`;
        container.sortableChildren = true;
        group = { attachment, container, children: [] };
        groups.set(key, group);
      }
      group.container.addChild(runtime.container);
      group.children.push(runtime.container);
    }

    const supplementalZIndex = Math.max(
      0,
      ...options.layers.map((layer) => layer.order),
    );
    for (const supplemental of options.supplemental ?? []) {
      const attachment = supplemental.attachment;
      const key = popupLayerAttachmentParentKey(attachment);
      let group = groups.get(key);
      if (!group) {
        const container = new Container();
        container.label = `popup-attachment:${key}`;
        container.sortableChildren = true;
        group = { attachment, container, children: [] };
        groups.set(key, group);
      }
      supplemental.container.zIndex = supplementalZIndex;
      group.container.addChild(supplemental.container);
      group.children.push(supplemental.container);
    }

    for (const group of groups.values()) {
      const attachment = group.attachment;
      if (attachment.kind === "vni-text-layer") {
        const target = options.runtimes.get(attachment.vniLayerId);
        if (!target?.mountNodeToTextLayer)
          throw new Error(
            `popup VNI attachment runtime unavailable: ${attachment.vniLayerId}.`,
          );
        group.dispose = target.mountNodeToTextLayer({
          textLayerId: attachment.textLayerId,
          node: group.container,
        });
        continue;
      }
      const player =
        attachment.target.kind === "main-spine"
          ? options.mainSpine
          : options.runtimes.get(attachment.target.layerId)?.spinePlayer;
      if (!player)
        throw new Error(
          `popup Spine attachment runtime unavailable: ${attachment.target.kind === "main-spine" ? "main-spine" : attachment.target.layerId}.`,
        );
      player.attachSlotObject({
        slot: attachment.slot,
        object: group.container,
      });
      group.spinePlayer = player;
    }
  } catch (error) {
    cleanup();
    throw error;
  }

  return Object.freeze({ destroy: cleanup });

  function cleanup(): void {
    if (destroyed) return;
    destroyed = true;
    for (const group of [...groups.values()].reverse()) {
      group.dispose?.();
      if (group.spinePlayer)
        group.spinePlayer.removeSlotObject(group.container);
      for (const child of group.children)
        if (child.parent === group.container)
          group.container.removeChild(child);
      group.container.destroy({ children: false });
    }
    for (const child of rootChildren)
      if (child.parent === options.root) options.root.removeChild(child);
  }
}
