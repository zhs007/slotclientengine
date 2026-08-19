import type {
  AudioPlaybackHandle,
  AudioRuntimeSnapshot,
} from "@slotclientengine/audiocore/core";
import type {
  ImgNumberRenderObject,
  RenderObject,
  RenderObjectLayer,
} from "../../presentation/index.js";
import { SceneLayoutError } from "../errors.js";
import type {
  SceneLayoutGameModeSnapshot,
  SceneLayoutPackageResource,
  SceneLayoutPopupStringInput,
  SceneLayoutRenderObject,
} from "../types.js";
import {
  formatGameLayoutRuntimeAddress,
  parseGameLayoutRuntimeAddress,
  type GameLayoutRuntimeAddress,
  type GameLayoutRuntimeAddressDescriptor,
  type GameLayoutRuntimeAddressKind,
} from "../data/runtime-address.js";

export interface GameLayoutRuntimeEvent {
  readonly address: GameLayoutRuntimeAddress;
  readonly sequence: number;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}
export type GameLayoutRuntimeEventListener = (
  event: GameLayoutRuntimeEvent,
) => void;
export interface GameLayoutRuntimeWaitOptions {
  readonly signal?: AbortSignal;
}
interface EndpointBase<K extends GameLayoutRuntimeAddressKind> {
  readonly kind: K;
  readonly descriptor: GameLayoutRuntimeAddressDescriptor;
}
export interface GameLayoutStructuralEndpoint extends EndpointBase<
  | "mode"
  | "mode-bgm"
  | "transition"
  | "popup"
  | "popup-layer"
  | "symbol-package"
> {
  getGameModeSnapshot(): SceneLayoutGameModeSnapshot;
}
export interface GameLayoutRenderObjectEndpoint extends EndpointBase<"render-object"> {
  get(): SceneLayoutRenderObject;
}
export interface GameLayoutRenderLayerEndpoint extends EndpointBase<"layer"> {
  get(): RenderObjectLayer;
}
export interface GameLayoutReelEndpoint extends EndpointBase<"reel"> {
  getArea(): import("../../reel/index.js").PresentableSymbolArea;
}
export interface GameLayoutPopupStringEndpoint extends EndpointBase<"popup-string"> {
  readonly stringKind: "text" | "image-string";
  readonly name: string;
  input(text: string): SceneLayoutPopupStringInput;
}
export interface GameLayoutAudioEffectEndpoint extends EndpointBase<"audio-effect"> {
  play(): AudioPlaybackHandle;
  stop(): void;
}
export interface GameLayoutAudioMusicEndpoint extends EndpointBase<"audio-music"> {
  getSnapshot(): AudioRuntimeSnapshot;
}
export interface GameLayoutRuntimeResourceEndpoint extends EndpointBase<"resource-factory"> {
  readonly resourceKind: string;
  create(options?: {
    readonly text?: string;
    readonly anchor?: { readonly x: number; readonly y: number };
  }): Promise<RenderObject | ImgNumberRenderObject>;
}
export interface GameLayoutEventEndpoint extends EndpointBase<"event"> {}
export type GameLayoutRuntimeEndpoint =
  | GameLayoutStructuralEndpoint
  | GameLayoutRenderObjectEndpoint
  | GameLayoutRenderLayerEndpoint
  | GameLayoutReelEndpoint
  | GameLayoutPopupStringEndpoint
  | GameLayoutAudioEffectEndpoint
  | GameLayoutAudioMusicEndpoint
  | GameLayoutRuntimeResourceEndpoint
  | GameLayoutEventEndpoint;
export interface GameLayoutRuntimeAddresses {
  list(options?: {
    readonly kind?: GameLayoutRuntimeAddressKind;
  }): readonly GameLayoutRuntimeAddressDescriptor[];
  describe(address: string): GameLayoutRuntimeAddressDescriptor;
  resolve(
    address: string,
    expectedKind?: GameLayoutRuntimeAddressKind,
  ): GameLayoutRuntimeEndpoint;
  bind(address: string, listener: GameLayoutRuntimeEventListener): () => void;
  wait(
    address: string,
    options?: GameLayoutRuntimeWaitOptions,
  ): Promise<GameLayoutRuntimeEvent>;
}
interface RuntimeBridge {
  getRenderObject(id: string): SceneLayoutRenderObject | null;
  getRenderLayer(ref: string): RenderObjectLayer;
  getArea(id: string): import("../../reel/index.js").PresentableSymbolArea;
  getGameModeSnapshot(): SceneLayoutGameModeSnapshot;
  playEffect(route: string): AudioPlaybackHandle;
  stopEffect(route: string): void;
  getAudioSnapshot(): AudioRuntimeSnapshot;
  createRenderObject(name: string): Promise<RenderObject>;
  createImgNumberRenderObject(
    name: string,
    options: {
      readonly text: string;
      readonly anchor?: { readonly x: number; readonly y: number };
    },
  ): Promise<ImgNumberRenderObject>;
  assertReady(): void;
}
interface CatalogEntry {
  readonly descriptor: GameLayoutRuntimeAddressDescriptor;
  endpoint(): GameLayoutRuntimeEndpoint;
}
export interface GameLayoutRuntimeAddressController {
  readonly addresses: GameLayoutRuntimeAddresses;
  emit(
    address: GameLayoutRuntimeAddress,
    detail?: GameLayoutRuntimeEvent["detail"],
  ): void;
  destroy(): void;
}

export function createGameLayoutRuntimeAddresses(
  resource: SceneLayoutPackageResource,
  bridge: RuntimeBridge,
): GameLayoutRuntimeAddressController {
  const manifest = (resource.runtimeManifest ??
    resource.manifest) as SceneLayoutPackageResource["runtimeManifest"];
  const entries = new Map<GameLayoutRuntimeAddress, CatalogEntry>();
  const listeners = new Map<
    GameLayoutRuntimeAddress,
    Set<GameLayoutRuntimeEventListener>
  >();
  const waiters = new Map<
    GameLayoutRuntimeAddress,
    Set<{
      resolve(event: GameLayoutRuntimeEvent): void;
      reject(error: Error): void;
      dispose(): void;
    }>
  >();
  let sequence = 0;
  let destroyed = false;
  const add = (
    segments: readonly string[],
    kind: GameLayoutRuntimeAddressKind,
    owner: readonly string[] | null,
    capability: GameLayoutRuntimeAddressDescriptor["capability"],
    endpoint: (
      descriptor: GameLayoutRuntimeAddressDescriptor,
    ) => GameLayoutRuntimeEndpoint,
    detail?: GameLayoutRuntimeAddressDescriptor["detail"],
  ) => {
    const address = formatGameLayoutRuntimeAddress(...segments);
    if (entries.has(address))
      throw new SceneLayoutError(
        `Duplicate Game Layout runtime address: ${address}.`,
      );
    const descriptor = Object.freeze({
      address,
      kind,
      ownerAddress: owner ? formatGameLayoutRuntimeAddress(...owner) : null,
      authored: segments[0] !== "resource",
      capability,
      ...(detail ? { detail: Object.freeze({ ...detail }) } : {}),
    }) satisfies GameLayoutRuntimeAddressDescriptor;
    entries.set(address, { descriptor, endpoint: () => endpoint(descriptor) });
    return address;
  };
  const structural = (
    descriptor: GameLayoutRuntimeAddressDescriptor,
  ): GameLayoutStructuralEndpoint =>
    Object.freeze({
      kind: descriptor.kind as GameLayoutStructuralEndpoint["kind"],
      descriptor,
      getGameModeSnapshot: bridge.getGameModeSnapshot,
    });
  const eventEndpoint = (
    descriptor: GameLayoutRuntimeAddressDescriptor,
  ): GameLayoutEventEndpoint => Object.freeze({ kind: "event", descriptor });

  for (const id of ["layout", "reel", "transition", "popup"])
    add(["layer", id], "layer", null, "borrowed", (descriptor) =>
      Object.freeze({
        kind: "layer",
        descriptor,
        get: () => bridge.getRenderLayer(id),
      }),
    );
  for (const node of manifest.nodes) {
    const owner = ["node", node.id];
    add(
      owner,
      "render-object",
      null,
      "borrowed",
      (descriptor) =>
        Object.freeze({
          kind: "render-object",
          descriptor,
          get: () => {
            bridge.assertReady();
            const value = bridge.getRenderObject(node.id);
            if (!value)
              throw new SceneLayoutError(
                `Authored render object is unavailable: ${descriptor.address}.`,
              );
            return value;
          },
        }),
      { resourceKind: node.resource?.kind ?? "unknown" },
    );
    for (const placement of ["before", "child", "after"] as const)
      add(
        [...owner, "layer", placement],
        "layer",
        owner,
        "borrowed",
        (descriptor) =>
          Object.freeze({
            kind: "layer",
            descriptor,
            get: () => bridge.getRenderLayer(`node:${node.id}:${placement}`),
          }),
      );
  }
  for (const reelId of Object.keys(manifest.reels).sort()) {
    const owner = ["reel", reelId];
    add(owner, "reel", null, "borrowed", (descriptor) =>
      Object.freeze({
        kind: "reel",
        descriptor,
        getArea: () => bridge.getArea(reelId),
      }),
    );
    for (const placement of ["bottom", "top", "win"] as const)
      add(
        [...owner, "layer", placement],
        "layer",
        owner,
        "borrowed",
        (descriptor) =>
          Object.freeze({
            kind: "layer",
            descriptor,
            get: () => bridge.getRenderLayer(`${reelId}.${placement}`),
          }),
      );
  }
  for (const id of Object.keys(manifest.symbolPackages ?? {}).sort())
    add(
      ["symbol-package", id],
      "symbol-package",
      null,
      "structural",
      structural,
    );
  for (const mode of manifest.gameModes?.modes ?? []) {
    const owner = ["mode", mode.id];
    add(owner, "mode", null, "structural", structural);
    if (mode.bgm) {
      const bgm = [...owner, "bgm"];
      add(bgm, "mode-bgm", owner, "structural", structural, {
        music: mode.bgm,
      });
      for (const lifecycle of ["started", "stopped"])
        add(
          [...bgm, "lifecycle", lifecycle],
          "event",
          bgm,
          "event",
          eventEndpoint,
        );
    }
  }
  for (const transition of manifest.gameModes?.transitions ?? []) {
    const owner = ["transition", transition.from, transition.to];
    const effectKind =
      "animation" in transition.overlay
        ? "spine"
        : "fadeOutSeconds" in transition.overlay
          ? "video"
          : "none";
    add(owner, "transition", null, "structural", structural, { effectKind });
    const effectOwner = [...owner, "effect", effectKind];
    add(effectOwner, "transition", owner, "structural", structural);
    if (effectKind === "spine" && "switchEvent" in transition.overlay)
      add(
        [...effectOwner, "event", transition.overlay.switchEvent],
        "event",
        effectOwner,
        "event",
        eventEndpoint,
        { animation: transition.overlay.animation },
      );
    if (effectKind === "video")
      for (const lifecycle of ["started", "ended"])
        add(
          [...effectOwner, "lifecycle", lifecycle],
          "event",
          effectOwner,
          "event",
          eventEndpoint,
        );
  }
  for (const [popupId, popup] of Object.entries(resource.popupPackages).sort(
    ([a], [b]) => a.localeCompare(b, "en"),
  )) {
    const owner = ["popup", popupId];
    add(owner, "popup", null, "structural", structural, {
      popupType: popup.manifest.type,
    });
    const nested = collectPopupAddresses(popup.manifest);
    for (const layerId of nested.layers)
      add(
        [...owner, "layer", layerId],
        "popup-layer",
        owner,
        "structural",
        structural,
      );
    for (const item of nested.strings)
      add(
        [...owner, "string", item.kind, item.name],
        "popup-string",
        owner,
        "borrowed",
        (descriptor) =>
          Object.freeze({
            kind: "popup-string",
            descriptor,
            stringKind: item.kind,
            name: item.name,
            input: (text: string) =>
              Object.freeze({ kind: item.kind, name: item.name, text }),
          }),
      );
  }
  for (const name of Object.keys(resource.audioMusic ?? {}).sort()) {
    const owner = ["audio", "music", name];
    add(owner, "audio-music", null, "structural", (descriptor) =>
      Object.freeze({
        kind: "audio-music",
        descriptor,
        getSnapshot: bridge.getAudioSnapshot,
      }),
    );
    for (const lifecycle of ["started", "stopped"])
      add(
        [...owner, "lifecycle", lifecycle],
        "event",
        owner,
        "event",
        eventEndpoint,
      );
  }
  for (const route of [...(resource.programmaticAudioEffects ?? [])].sort())
    add(
      ["audio", "effect", route],
      "audio-effect",
      null,
      "borrowed",
      (descriptor) =>
        Object.freeze({
          kind: "audio-effect",
          descriptor,
          play: () => bridge.playEffect(route),
          stop: () => bridge.stopEffect(route),
        }),
    );
  for (const [name, spec] of Object.entries(
    manifest.runtimeResources ?? {},
  ).sort(([a], [b]) => a.localeCompare(b, "en")))
    add(
      ["resource", spec.kind, name],
      "resource-factory",
      null,
      "caller-owned",
      (descriptor) =>
        Object.freeze({
          kind: "resource-factory",
          descriptor,
          resourceKind: spec.kind,
          create: (options?: {
            readonly text?: string;
            readonly anchor?: { readonly x: number; readonly y: number };
          }) => {
            if (spec.kind === "image-string") {
              if (options?.text === undefined)
                throw new SceneLayoutError(
                  `Image-string resource requires text: ${descriptor.address}.`,
                );
              return bridge.createImgNumberRenderObject(name, {
                text: options.text,
                ...(options.anchor ? { anchor: options.anchor } : {}),
              });
            }
            if (options?.text !== undefined || options?.anchor !== undefined)
              throw new SceneLayoutError(
                `Resource does not accept image-string options: ${descriptor.address}.`,
              );
            return bridge.createRenderObject(name);
          },
        }),
    );

  const requireEntry = (value: string): CatalogEntry => {
    if (destroyed)
      throw new SceneLayoutError(
        "Game Layout runtime address resolver is destroyed.",
      );
    let address: GameLayoutRuntimeAddress;
    try {
      address = parseGameLayoutRuntimeAddress(value);
    } catch (error) {
      throw new SceneLayoutError(
        error instanceof Error ? error.message : String(error),
      );
    }
    const entry = entries.get(address);
    if (!entry)
      throw new SceneLayoutError(
        `Unknown Game Layout runtime address: ${address}.`,
      );
    return entry;
  };
  const addresses: GameLayoutRuntimeAddresses = Object.freeze({
    list(options?: { readonly kind?: GameLayoutRuntimeAddressKind }) {
      if (destroyed)
        throw new SceneLayoutError(
          "Game Layout runtime address resolver is destroyed.",
        );
      return Object.freeze(
        [...entries.values()]
          .map(({ descriptor }) => descriptor)
          .filter(
            (descriptor) => !options?.kind || descriptor.kind === options.kind,
          ),
      );
    },
    describe(value: string) {
      return requireEntry(value).descriptor;
    },
    resolve(value: string, expectedKind?: GameLayoutRuntimeAddressKind) {
      const entry = requireEntry(value);
      if (expectedKind && entry.descriptor.kind !== expectedKind)
        throw new SceneLayoutError(
          `Game Layout runtime address kind mismatch: expected ${expectedKind}, received ${entry.descriptor.kind}.`,
        );
      return entry.endpoint();
    },
    bind(value: string, listener: GameLayoutRuntimeEventListener) {
      const entry = requireEntry(value);
      if (entry.descriptor.kind !== "event")
        throw new SceneLayoutError(
          `Game Layout runtime address is not an event: ${entry.descriptor.address}.`,
        );
      const bucket =
        listeners.get(entry.descriptor.address) ??
        new Set<GameLayoutRuntimeEventListener>();
      bucket.add(listener);
      listeners.set(entry.descriptor.address, bucket);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        bucket.delete(listener);
      };
    },
    wait(value: string, options?: GameLayoutRuntimeWaitOptions) {
      const entry = requireEntry(value);
      if (entry.descriptor.kind !== "event")
        return Promise.reject(
          new SceneLayoutError(
            `Game Layout runtime address is not an event: ${entry.descriptor.address}.`,
          ),
        );
      if (options?.signal?.aborted) return Promise.reject(abortError());
      return new Promise<GameLayoutRuntimeEvent>((resolve, reject) => {
        const bucket = waiters.get(entry.descriptor.address) ?? new Set();
        const onAbort = () => {
          waiter.dispose();
          reject(abortError());
        };
        const waiter = {
          resolve,
          reject,
          dispose: () => {
            bucket.delete(waiter);
            options?.signal?.removeEventListener("abort", onAbort);
          },
        };
        options?.signal?.addEventListener("abort", onAbort, { once: true });
        bucket.add(waiter);
        waiters.set(entry.descriptor.address, bucket);
      });
    },
  });
  return Object.freeze({
    addresses,
    emit(
      address: GameLayoutRuntimeAddress,
      detail: GameLayoutRuntimeEvent["detail"] = Object.freeze({}),
    ) {
      const entry = entries.get(address);
      if (destroyed || entry?.descriptor.kind !== "event") return;
      const occurrence = Object.freeze({
        address,
        sequence: ++sequence,
        detail: Object.freeze({ ...detail }),
      });
      const callbacks = [...(listeners.get(address) ?? [])];
      const pending = [...(waiters.get(address) ?? [])];
      for (const waiter of pending) {
        waiter.dispose();
        waiter.resolve(occurrence);
      }
      for (const listener of callbacks) {
        const result = (
          listener as unknown as (event: GameLayoutRuntimeEvent) => unknown
        )(occurrence);
        if (
          result &&
          typeof (result as unknown as { then?: unknown }).then === "function"
        )
          throw new SceneLayoutError(
            "Game Layout runtime event listeners must be synchronous.",
          );
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      const error = new SceneLayoutError(
        "Game Layout runtime address resolver is destroyed.",
      );
      for (const bucket of waiters.values())
        for (const waiter of bucket) {
          waiter.dispose();
          waiter.reject(error);
        }
      waiters.clear();
      listeners.clear();
    },
  });
}

function collectPopupAddresses(manifest: object) {
  const layers = new Set<string>();
  const strings = new Map<string, "text" | "image-string">();
  const visit = (value: unknown, inLayers = false): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, inLayers);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (inLayers && typeof record.id === "string") layers.add(record.id);
    if (
      (record.kind === "text" || record.kind === "image-string") &&
      typeof record.name === "string"
    ) {
      const previous = strings.get(record.name);
      if (previous && previous !== record.kind)
        throw new SceneLayoutError(
          `Popup string name has conflicting kinds: ${record.name}.`,
        );
      strings.set(record.name, record.kind);
    }
    for (const [key, child] of Object.entries(record))
      visit(child, key === "layers" || key === "overlays");
  };
  visit(manifest);
  return Object.freeze({
    layers: Object.freeze([...layers].sort((a, b) => a.localeCompare(b, "en"))),
    strings: Object.freeze(
      [...strings]
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([name, kind]) => Object.freeze({ name, kind })),
    ),
  });
}
function abortError(): Error {
  return new DOMException(
    "Game Layout runtime event wait was aborted.",
    "AbortError",
  );
}
