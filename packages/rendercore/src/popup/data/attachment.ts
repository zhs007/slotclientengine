import type {
  PopupLayer,
  PopupLayerAttachment,
  PopupOverlayLayer,
} from "./types.js";

export type PopupAttachableLayer = PopupLayer | PopupOverlayLayer;

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
    const orders = orderByParent.get(parentKey) ?? new Map<number, string>();
    if (!orderByParent.has(parentKey)) orderByParent.set(parentKey, orders);
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
      throw new Error(
        `${options.label} Spine attachment cycle: ${[...stack.slice(start), id].join(" -> ")}.`,
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
