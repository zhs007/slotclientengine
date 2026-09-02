import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { RendercoreSpineSlotPlayer } from "../../src/spine/runtime-player.js";
import {
  attachPopupLayerRuntimes,
  validatePopupLayerAttachmentGraph,
  type PopupLayer,
} from "../../src/popup/index.js";

const spineLayer = (
  id: string,
  order: number,
  attachment: PopupLayer["attachment"],
) =>
  ({
    id,
    kind: "spine",
    resource: `${id}-resource`,
    order,
    alpha: 1,
    attachment,
    transform: { x: 0, y: 0, scale: 1 },
    playback: {
      mode: "segmented-animations",
      startAnimation: "start",
      loopAnimation: "loop",
      endAnimation: "end",
    },
  }) as const satisfies PopupLayer;

const imageLayer = (
  id: string,
  order: number,
  attachment: PopupLayer["attachment"],
) =>
  ({
    id,
    kind: "image",
    resource: `${id}-resource`,
    order,
    alpha: 1,
    attachment,
    transform: { x: 0, y: 0, scale: 1 },
    anchor: { x: 0.5, y: 0.5 },
    visibleSegments: ["start", "loop", "end"],
  }) as const satisfies PopupLayer;

const vniLayer = (
  id: string,
  order: number,
  attachment: PopupLayer["attachment"],
) =>
  ({
    id,
    kind: "vni",
    resource: `${id}-resource`,
    order,
    alpha: 1,
    attachment,
    transform: { x: 0, y: 0, scale: 1 },
    playback: {
      mode: "segmented",
      loopStartTime: 1,
      loopEndTime: 2,
      keepParticlesAlive: false,
    },
  }) as const satisfies PopupLayer;

describe("popup layer attachment graph", () => {
  it("accepts every layer kind as a VNI text-layer child", () => {
    const layers = [
      vniLayer("host", 0, { kind: "popup-root" }),
      imageLayer("image", 1, {
        kind: "vni-text-layer",
        vniLayerId: "host",
        textLayerId: "content",
      }),
      spineLayer("spine", 2, {
        kind: "vni-text-layer",
        vniLayerId: "host",
        textLayerId: "content",
      }),
      vniLayer("vni", 3, {
        kind: "vni-text-layer",
        vniLayerId: "host",
        textLayerId: "content",
      }),
    ];
    expect(() =>
      validatePopupLayerAttachmentGraph({
        layers,
        label: "tier",
        allowMainSpine: false,
      }),
    ).not.toThrow();
  });

  it("rejects VNI self references and mixed VNI/Spine cycles", () => {
    expect(() =>
      validatePopupLayerAttachmentGraph({
        layers: [
          vniLayer("self", 0, {
            kind: "vni-text-layer",
            vniLayerId: "self",
            textLayerId: "content",
          }),
        ],
        label: "tier",
        allowMainSpine: false,
      }),
    ).toThrow(/self -> self/);

    expect(() =>
      validatePopupLayerAttachmentGraph({
        layers: [
          vniLayer("vni", 0, {
            kind: "spine-slot",
            target: { kind: "layer", layerId: "spine" },
            slot: "Content",
          }),
          spineLayer("spine", 1, {
            kind: "vni-text-layer",
            vniLayerId: "vni",
            textLayerId: "content",
          }),
        ],
        label: "tier",
        allowMainSpine: false,
      }),
    ).toThrow(/vni -> spine -> vni/);
  });

  it("accepts nested Spine targets and per-parent order", () => {
    const layers = [
      spineLayer("host", 1, { kind: "popup-root" }),
      spineLayer("nested", 1, {
        kind: "spine-slot",
        target: { kind: "layer", layerId: "host" },
        slot: "Fx",
      }),
      imageLayer("background", 2, {
        kind: "spine-slot",
        target: { kind: "layer", layerId: "host" },
        slot: "Value",
      }),
      imageLayer("foreground", 3, {
        kind: "spine-slot",
        target: { kind: "layer", layerId: "host" },
        slot: "Value",
      }),
    ];
    expect(() =>
      validatePopupLayerAttachmentGraph({
        layers,
        label: "tier",
        allowMainSpine: false,
      }),
    ).not.toThrow();
  });

  it("rejects self, long cycles, invalid targets, and duplicate sibling order", () => {
    expect(() =>
      validatePopupLayerAttachmentGraph({
        layers: [
          spineLayer("self", 0, {
            kind: "spine-slot",
            target: { kind: "layer", layerId: "self" },
            slot: "Fx",
          }),
        ],
        label: "tier",
        allowMainSpine: false,
      }),
    ).toThrow(/self -> self/);

    const cycle = [
      spineLayer("a", 0, {
        kind: "spine-slot",
        target: { kind: "layer", layerId: "b" },
        slot: "Fx",
      }),
      spineLayer("b", 0, {
        kind: "spine-slot",
        target: { kind: "layer", layerId: "c" },
        slot: "Fx",
      }),
      spineLayer("c", 0, {
        kind: "spine-slot",
        target: { kind: "layer", layerId: "a" },
        slot: "Fx",
      }),
    ];
    expect(() =>
      validatePopupLayerAttachmentGraph({
        layers: cycle,
        label: "tier",
        allowMainSpine: false,
      }),
    ).toThrow(/a -> b -> c -> a/);

    expect(() =>
      validatePopupLayerAttachmentGraph({
        layers: [
          imageLayer("image", 0, {
            kind: "spine-slot",
            target: { kind: "layer", layerId: "missing" },
            slot: "Fx",
          }),
        ],
        label: "tier",
        allowMainSpine: false,
      }),
    ).toThrow(/missing Spine layer/);

    expect(() =>
      validatePopupLayerAttachmentGraph({
        layers: [
          spineLayer("host", 0, { kind: "popup-root" }),
          imageLayer("a", 1, {
            kind: "spine-slot",
            target: { kind: "layer", layerId: "host" },
            slot: "Value",
          }),
          imageLayer("b", 1, {
            kind: "spine-slot",
            target: { kind: "layer", layerId: "host" },
            slot: "Value",
          }),
        ],
        label: "tier",
        allowMainSpine: false,
      }),
    ).toThrow(/order 1.*a and b/);
  });

  it("mounts one official slot owner group with ordered children", () => {
    const root = new Container();
    const slotRoot = new Container();
    const attachSlotObject = vi.fn(
      ({ object }: { readonly object: Container }) => slotRoot.addChild(object),
    );
    const removeSlotObject = vi.fn((object: Container) => {
      if (object.parent === slotRoot) slotRoot.removeChild(object);
    });
    const player = {
      attachSlotObject,
      removeSlotObject,
    } as unknown as RendercoreSpineSlotPlayer;
    const layers = [
      spineLayer("host", 0, { kind: "popup-root" }),
      imageLayer("front", 20, {
        kind: "spine-slot",
        target: { kind: "layer", layerId: "host" },
        slot: "Value",
      }),
      imageLayer("back", 10, {
        kind: "spine-slot",
        target: { kind: "layer", layerId: "host" },
        slot: "Value",
      }),
    ];
    const host = new Container();
    const front = new Container();
    const back = new Container();
    const handle = attachPopupLayerRuntimes({
      layers,
      root,
      runtimes: new Map([
        ["host", { container: host, spinePlayer: player }],
        ["front", { container: front }],
        ["back", { container: back }],
      ]),
    });

    expect(root.children).toEqual([host]);
    expect(attachSlotObject).toHaveBeenCalledTimes(1);
    const group = attachSlotObject.mock.calls[0]![0].object as Container;
    expect(group.children).toEqual([back, front]);
    expect(back.zIndex).toBe(10);
    expect(front.zIndex).toBe(20);

    handle.destroy();
    handle.destroy();
    expect(removeSlotObject).toHaveBeenCalledTimes(1);
    expect(host.parent).toBeNull();
    expect(back.parent).toBeNull();
    expect(front.parent).toBeNull();
  });

  it("appends a supplemental tap info object to the existing official slot owner", () => {
    const root = new Container();
    const slotRoot = new Container();
    const attachSlotObject = vi.fn(
      ({ object }: { readonly object: Container }) => slotRoot.addChild(object),
    );
    const removeSlotObject = vi.fn((object: Container) => {
      if (object.parent === slotRoot) slotRoot.removeChild(object);
    });
    const player = {
      attachSlotObject,
      removeSlotObject,
    } as unknown as RendercoreSpineSlotPlayer;
    const attachment = {
      kind: "spine-slot" as const,
      target: { kind: "main-spine" as const },
      slot: "Value",
    };
    const overlay = new Container();
    const tapInfo = new Container();
    const handle = attachPopupLayerRuntimes({
      layers: [imageLayer("overlay", 20, attachment)],
      root,
      runtimes: new Map([["overlay", { container: overlay }]]),
      mainSpine: player,
      supplemental: [{ attachment, container: tapInfo }],
    });

    expect(attachSlotObject).toHaveBeenCalledTimes(1);
    const group = attachSlotObject.mock.calls[0]![0].object as Container;
    expect(group.children).toEqual([overlay, tapInfo]);
    expect(tapInfo.zIndex).toBe(20);

    handle.destroy();
    expect(removeSlotObject).toHaveBeenCalledTimes(1);
    expect(overlay.parent).toBeNull();
    expect(tapInfo.parent).toBeNull();
  });

  it("mounts one VNI text owner group with ordered caller-owned children", () => {
    const root = new Container();
    const textRoot = new Container();
    const mountNodeToTextLayer = vi.fn(
      ({
        node,
      }: {
        readonly textLayerId: string;
        readonly node: Container;
      }) => {
        textRoot.addChild(node);
        return () => node.parent?.removeChild(node);
      },
    );
    const layers = [
      vniLayer("host", 0, { kind: "popup-root" }),
      imageLayer("front", 20, {
        kind: "vni-text-layer",
        vniLayerId: "host",
        textLayerId: "content",
      }),
      imageLayer("back", 10, {
        kind: "vni-text-layer",
        vniLayerId: "host",
        textLayerId: "content",
      }),
    ];
    const host = new Container();
    const front = new Container();
    const back = new Container();
    const handle = attachPopupLayerRuntimes({
      layers,
      root,
      runtimes: new Map([
        ["host", { container: host, mountNodeToTextLayer }],
        ["front", { container: front }],
        ["back", { container: back }],
      ]),
    });

    expect(root.children).toEqual([host]);
    expect(mountNodeToTextLayer).toHaveBeenCalledWith({
      textLayerId: "content",
      node: expect.any(Container),
    });
    const group = textRoot.children[0] as Container;
    expect(group.children).toEqual([back, front]);

    handle.destroy();
    handle.destroy();
    expect(textRoot.children).toEqual([]);
    expect(host.parent).toBeNull();
    expect(back.parent).toBeNull();
    expect(front.parent).toBeNull();
  });
});
