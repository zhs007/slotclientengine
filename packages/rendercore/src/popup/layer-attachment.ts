import { Container } from "pixi.js";
import type { RendercoreSpineSlotPlayer } from "../spine/runtime-player.js";
import type {
  PopupLayer,
  PopupLayerAttachment,
  PopupOverlayLayer,
} from "./types.js";

export type PopupAttachableLayer = PopupLayer | PopupOverlayLayer;

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

export function resolvePopupLayerAttachment(
  layer: PopupAttachableLayer,
): PopupLayerAttachment {
  if (layer.attachment) return layer.attachment;
  if (layer.kind === "image-string" && "parent" in layer && layer.parent)
    return layer.parent;
  return Object.freeze({ kind: "popup-root" });
}

export function popupLayerAttachmentParentKey(
  attachment: PopupLayerAttachment,
): string {
  if (attachment.kind === "popup-root") return "popup-root";
  if (attachment.kind === "vni-text-layer")
    return `vni:${attachment.vniLayerId}:${attachment.textLayerId}`;
  return attachment.target.kind === "main-spine"
    ? `spine:main:${attachment.slot}`
    : `spine:${attachment.target.layerId}:${attachment.slot}`;
}

export function validatePopupLayerAttachmentGraph(options: {
  readonly layers: readonly PopupAttachableLayer[];
  readonly label: string;
  readonly allowMainSpine: boolean;
}): void {
  const byId = new Map(options.layers.map((layer) => [layer.id, layer]));
  const orderByParent = new Map<string, Map<number, string>>();
  const edge = new Map<string, string>();

  for (const layer of options.layers) {
    const attachment = layer.attachment;
    if (!attachment)
      throw new Error(`${options.label} layer ${layer.id} missing attachment.`);
    const parentKey = popupLayerAttachmentParentKey(attachment);
    let orders = orderByParent.get(parentKey);
    if (!orders) {
      orders = new Map();
      orderByParent.set(parentKey, orders);
    }
    const duplicate = orders.get(layer.order);
    if (duplicate)
      throw new Error(
        `${options.label} attachment parent ${parentKey} order ${layer.order} is shared by ${duplicate} and ${layer.id}.`,
      );
    orders.set(layer.order, layer.id);

    if (attachment.kind === "vni-text-layer") {
      if (layer.kind !== "image-string")
        throw new Error(
          `${options.label} layer ${layer.id} must be image-string to attach to a VNI text layer.`,
        );
      const target = byId.get(attachment.vniLayerId);
      if (!target || target.kind !== "vni")
        throw new Error(
          `${options.label} layer ${layer.id} references missing VNI layer ${attachment.vniLayerId}.`,
        );
      continue;
    }
    if (attachment.kind !== "spine-slot") continue;
    if (attachment.target.kind === "main-spine") {
      if (!options.allowMainSpine)
        throw new Error(
          `${options.label} layer ${layer.id} cannot reference main-spine.`,
        );
      continue;
    }
    const target = byId.get(attachment.target.layerId);
    if (!target || target.kind !== "spine")
      throw new Error(
        `${options.label} layer ${layer.id} references missing Spine layer ${attachment.target.layerId}.`,
      );
    edge.set(layer.id, target.id);
  }

  const state = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const visit = (id: string): void => {
    const current = state.get(id);
    if (current === "visited") return;
    if (current === "visiting") {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      throw new Error(
        `${options.label} Spine attachment cycle: ${cycle.join(" -> ")}.`,
      );
    }
    state.set(id, "visiting");
    stack.push(id);
    const target = edge.get(id);
    if (target) visit(target);
    stack.pop();
    state.set(id, "visited");
  };
  for (const id of edge.keys()) visit(id);
}

export function attachPopupLayerRuntimes(options: {
  readonly layers: readonly PopupAttachableLayer[];
  readonly runtimes: ReadonlyMap<string, PopupLayerAttachmentRuntime>;
  readonly root: Container;
  readonly mainSpine?: RendercoreSpineSlotPlayer;
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
