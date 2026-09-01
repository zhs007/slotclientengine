import type {
  AudioPlaybackHandle,
  AudioRuntimeSnapshot,
} from "@slotclientengine/audiocore/core";
import type {
  ImgNumberRenderObject,
  RenderObject,
  RenderObjectLayer,
} from "../../presentation/index.js";
import type { SymbolHandle } from "../../symbol/symbol-handle.js";
import {
  createRenderObjectPool,
  type CreateRenderObjectPoolOptions,
  type RenderObjectPool,
} from "../../presentation/render-object-pool.js";
import {
  getRenderObjectAdapter,
  registerRenderObjectCleanup,
} from "../../presentation/render-object.js";
import { validateOfficialSpineResource } from "../../spine/runtime-player.js";
import type { PopupStringNodeHandle } from "../../popup/core/index.js";
import type { PopupManifest } from "../../popup/data/index.js";
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
import {
  createRuntimeEventManager,
  type RuntimeEventAddressMetadata,
} from "./runtime-event-manager.js";
import { compileGameLayoutRuntimeEventCatalog } from "./runtime-address-catalog.js";

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
  "mode" | "mode-bgm" | "transition" | "popup" | "symbol-package"
> {
  getGameModeSnapshot(): SceneLayoutGameModeSnapshot;
}
export interface GameLayoutRenderObjectEndpoint extends EndpointBase<"render-object"> {
  get(): SceneLayoutRenderObject;
}
export interface GameLayoutRenderObjectInstanceEndpoint extends EndpointBase<"render-object-instance"> {
  get(): RenderObject;
}
export interface GameLayoutRenderLayerEndpoint extends EndpointBase<"layer"> {
  get(): RenderObjectLayer;
}
export interface GameLayoutReelEndpoint extends EndpointBase<"reel"> {
  getArea(): import("../../reel/index.js").PresentableSymbolArea;
}
export interface GameLayoutPopupLayerEndpoint extends EndpointBase<"popup-layer"> {
  get(): RenderObject;
}
export interface GameLayoutPopupInstanceEndpoint extends EndpointBase<"popup-instance"> {}
export interface GameLayoutPopupStringEndpoint extends EndpointBase<"popup-string"> {
  readonly stringKind: "text" | "image-string";
  readonly name: string;
  get(): PopupStringNodeHandle;
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
    readonly instanceId?: string;
    readonly text?: string;
    readonly anchor?: { readonly x: number; readonly y: number };
    readonly pooled?: boolean;
    readonly presentationValue?: number | null;
  }): Promise<RenderObject | ImgNumberRenderObject>;
}
export interface GameLayoutEventEndpoint extends EndpointBase<"event"> {}
export type GameLayoutRuntimeEndpoint =
  | GameLayoutStructuralEndpoint
  | GameLayoutRenderObjectEndpoint
  | GameLayoutRenderObjectInstanceEndpoint
  | GameLayoutRenderLayerEndpoint
  | GameLayoutReelEndpoint
  | GameLayoutPopupLayerEndpoint
  | GameLayoutPopupInstanceEndpoint
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
  mount(
    parentAddress: string,
    child: RenderObject,
    options?: { readonly order?: number },
  ): GameLayoutRuntimeMount;
  addressOf(child: RenderObject): GameLayoutRuntimeAddress;
  bind(address: string, listener: GameLayoutRuntimeEventListener): () => void;
  wait(
    address: string,
    options?: GameLayoutRuntimeWaitOptions,
  ): Promise<GameLayoutRuntimeEvent>;
}
export interface GameLayoutRuntimeMount {
  detach(): void;
}
interface RuntimeBridge {
  getRenderObject(id: string): SceneLayoutRenderObject | null;
  getRenderLayer(ref: string): RenderObjectLayer;
  getArea(id: string): import("../../reel/index.js").PresentableSymbolArea;
  getGameModeSnapshot(): SceneLayoutGameModeSnapshot;
  playEffect(route: string): AudioPlaybackHandle;
  stopEffect(route: string): void;
  getAudioSnapshot(): AudioRuntimeSnapshot;
  getPopupLayer(popupId: string, layerId: string): RenderObject;
  getPopupString(
    popupId: string,
    kind: "text" | "image-string",
    name: string,
  ): PopupStringNodeHandle;
  createRenderObject(name: string): Promise<RenderObject>;
  createImgNumberRenderObject(
    name: string,
    options: {
      readonly text: string;
      readonly anchor?: { readonly x: number; readonly y: number };
    },
  ): Promise<ImgNumberRenderObject>;
  createSymbolRenderObject?(
    symbolPackageId: string,
    symbol: string,
    presentationValue: number | null,
  ): Promise<SymbolHandle>;
  assertReady(): void;
}
interface CatalogEntry {
  readonly descriptor: GameLayoutRuntimeAddressDescriptor;
  endpoint(): GameLayoutRuntimeEndpoint;
}
export interface GameLayoutRuntimeAddressController {
  readonly addresses: GameLayoutRuntimeAddresses;
  hasInterest(address: GameLayoutRuntimeAddress): boolean;
  hasSymbolInterest(symbolPackageId: string, symbol: string): boolean;
  emit(
    address: GameLayoutRuntimeAddress,
    detail?:
      | GameLayoutRuntimeEvent["detail"]
      | (() => GameLayoutRuntimeEvent["detail"]),
  ): void;
  registerPopupInstance(
    popupId: string,
    instanceId: string,
    rootLayer: RenderObjectLayer,
  ): {
    readonly address: GameLayoutRuntimeAddress;
    unregister(): void;
  };
  destroy(): void;
}

export function createGameLayoutRuntimeAddresses(
  resource: SceneLayoutPackageResource,
  bridge: RuntimeBridge,
): GameLayoutRuntimeAddressController {
  const manifest = (resource.runtimeManifest ??
    resource.manifest) as SceneLayoutPackageResource["runtimeManifest"];
  const popupManifests =
    resource.popupManifests ??
    Object.fromEntries(
      Object.entries(resource.popupPackages).map(([id, popup]) => [
        id,
        popup.manifest,
      ]),
    );
  const entries = new Map<GameLayoutRuntimeAddress, CatalogEntry>();
  const liveEntries = new Map<GameLayoutRuntimeAddress, CatalogEntry>();
  const reservedInstanceAddresses = new Set<GameLayoutRuntimeAddress>();
  const instanceAddressByObject = new WeakMap<
    RenderObject,
    GameLayoutRuntimeAddress
  >();
  const eventMetadata = new Map<
    GameLayoutRuntimeAddress,
    RuntimeEventAddressMetadata
  >();
  const symbolInterestGroups = new Map<string, Map<string, string>>();
  const factoryPools = new Map<
    GameLayoutRuntimeAddress,
    RenderObjectPool<RenderObject>
  >();
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
    if (kind === "event")
      eventMetadata.set(address, {
        dispatchAddresses: Object.freeze([address]),
      });
    return address;
  };
  const addLive = (
    segments: readonly string[],
    kind: GameLayoutRuntimeAddressKind,
    owner: readonly string[],
    endpoint: (
      descriptor: GameLayoutRuntimeAddressDescriptor,
    ) => GameLayoutRuntimeEndpoint,
    detail?: GameLayoutRuntimeAddressDescriptor["detail"],
  ): GameLayoutRuntimeAddress => {
    const address = formatGameLayoutRuntimeAddress(...segments);
    if (entries.has(address) || liveEntries.has(address))
      throw new SceneLayoutError(
        `Duplicate live Game Layout runtime address: ${address}.`,
      );
    const descriptor = Object.freeze({
      address,
      kind,
      ownerAddress: formatGameLayoutRuntimeAddress(...owner),
      authored: false,
      capability: "caller-owned",
      ...(detail ? { detail: Object.freeze({ ...detail }) } : {}),
    }) satisfies GameLayoutRuntimeAddressDescriptor;
    liveEntries.set(address, {
      descriptor,
      endpoint: () => endpoint(descriptor),
    });
    return address;
  };
  const reserveInstance = (
    segments: readonly string[],
  ): GameLayoutRuntimeAddress => {
    const address = formatGameLayoutRuntimeAddress(...segments);
    if (
      entries.has(address) ||
      liveEntries.has(address) ||
      reservedInstanceAddresses.has(address)
    )
      throw new SceneLayoutError(
        `Duplicate live Game Layout runtime instance: ${address}.`,
      );
    reservedInstanceAddresses.add(address);
    return address;
  };
  const registerResourceInstance = (
    name: string,
    resourceKind: string,
    instanceId: string,
    object: RenderObject,
  ): GameLayoutRuntimeAddress => {
    const owner = ["resource", resourceKind, name];
    const baseSegments = [...owner, "instance", instanceId];
    const baseAddress = formatGameLayoutRuntimeAddress(...baseSegments);
    if (!reservedInstanceAddresses.delete(baseAddress))
      throw new SceneLayoutError(
        `Game Layout runtime instance was not reserved: ${baseAddress}.`,
      );
    const registeredAddresses: GameLayoutRuntimeAddress[] = [];
    const requireLiveObject = (): RenderObject => {
      if (!liveEntries.has(baseAddress))
        throw new SceneLayoutError(
          `Game Layout runtime instance is stale: ${baseAddress}.`,
        );
      getRenderObjectAdapter(object).assertUsable();
      return object;
    };
    try {
      registeredAddresses.push(
        addLive(
          baseSegments,
          "render-object-instance",
          owner,
          (descriptor) =>
            Object.freeze({
              kind: "render-object-instance",
              descriptor,
              get: requireLiveObject,
            }),
          { resourceKind, resourceKey: name, instanceId },
        ),
      );
      const loaded =
        resourceKind === "spine"
          ? resource.getLoadedRuntimeResource(name, "spine")
          : resourceKind === "vni"
            ? resource.getLoadedRuntimeResource(name, "vni")
            : resourceKind === "image"
              ? resource.getLoadedRuntimeResource(name, "image")
              : null;
      const childRefs:
        | readonly { readonly kind: "spine-slot"; readonly id: string }[]
        | readonly { readonly kind: "vni-text-layer"; readonly id: string }[] =
        loaded?.kind === "spine"
          ? validateOfficialSpineResource({
              resource: loaded,
              requiredAnimations: [],
            }).slotNames.map((id) => ({ kind: "spine-slot" as const, id }))
          : loaded?.kind === "vni"
            ? (loaded.project.layers ?? [])
                .filter((layer) => layer.type === "text")
                .map((layer) => ({
                  kind: "vni-text-layer" as const,
                  id: layer.id,
                }))
            : [];
      for (const ref of childRefs) {
        const discriminator = ref.kind === "spine-slot" ? "slot" : "text-layer";
        const segments = [...baseSegments, discriminator, ref.id];
        registeredAddresses.push(
          addLive(segments, "layer", baseSegments, (descriptor) =>
            Object.freeze({
              kind: "layer",
              descriptor,
              get: () =>
                requireLiveObject().getChildLayer(
                  ref.kind === "spine-slot"
                    ? { kind: "spine-slot", slot: ref.id }
                    : { kind: "vni-text-layer", layerId: ref.id },
                ),
            }),
          ),
        );
      }
    } catch (error) {
      for (const address of registeredAddresses) liveEntries.delete(address);
      throw error;
    }
    instanceAddressByObject.set(object, baseAddress);
    registerRenderObjectCleanup(object, () => {
      for (const address of registeredAddresses) liveEntries.delete(address);
      instanceAddressByObject.delete(object);
    });
    return baseAddress;
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
  const requirePool = <T extends RenderObject>(
    descriptor: GameLayoutRuntimeAddressDescriptor,
    options: CreateRenderObjectPoolOptions<T>,
  ): RenderObjectPool<T> => {
    let pool = factoryPools.get(descriptor.address) as
      | RenderObjectPool<T>
      | undefined;
    if (!pool) {
      pool = createRenderObjectPool({
        ...options,
        createError: (message) =>
          new SceneLayoutError(`${descriptor.address}: ${message}`),
      });
      factoryPools.set(
        descriptor.address,
        pool as RenderObjectPool<RenderObject>,
      );
    }
    return pool;
  };

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
    const authoredSpineResource = resource.layout?.spineResources?.[node.id];
    const childRefs =
      node.resource?.kind === "spine" && authoredSpineResource
        ? validateOfficialSpineResource({
            resource: authoredSpineResource,
            requiredAnimations: [],
          }).slotNames.map((id) => ({ kind: "spine-slot" as const, id }))
        : node.resource?.kind === "vni"
          ? (
              resource.layout?.vniResources?.[node.resource.project]?.project
                .layers ?? []
            )
              .filter((layer) => layer.type === "text")
              .map((layer) => ({
                kind: "vni-text-layer" as const,
                id: layer.id,
              }))
          : [];
    for (const ref of childRefs) {
      const discriminator = ref.kind === "spine-slot" ? "slot" : "text-layer";
      add(
        [...owner, discriminator, ref.id],
        "layer",
        owner,
        "borrowed",
        (descriptor) =>
          Object.freeze({
            kind: "layer",
            descriptor,
            get: () => {
              bridge.assertReady();
              const object = bridge.getRenderObject(node.id);
              if (!object)
                throw new SceneLayoutError(
                  `Authored render object is unavailable: ${descriptor.address}.`,
                );
              return object.getChildLayer(
                ref.kind === "spine-slot"
                  ? { kind: "spine-slot", slot: ref.id }
                  : { kind: "vni-text-layer", layerId: ref.id },
              );
            },
          }),
      );
    }
  }
  const reelIds = ["main"] as const;
  for (const reelId of reelIds) {
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
  for (const id of Object.keys(manifest.symbolPackages ?? {}).sort()) {
    add(
      ["symbol-package", id],
      "symbol-package",
      null,
      "structural",
      structural,
    );
    const symbolPackage = resource.symbolPackages[id];
    if (!symbolPackage)
      throw new SceneLayoutError(
        `Scene layout symbol package resource is unavailable: ${id}.`,
      );
    for (const symbol of Object.keys(
      symbolPackage.symbolManifest.symbols,
    ).sort()) {
      const owner = ["symbol-package", id];
      add(
        [...owner, "symbol", symbol],
        "resource-factory",
        owner,
        "caller-owned",
        (descriptor) => {
          const create = (
            presentationValue: number | null,
          ): Promise<SymbolHandle> => {
            if (!bridge.createSymbolRenderObject)
              return Promise.reject(
                new SceneLayoutError(
                  `Symbol RenderObject factory is unavailable: ${descriptor.address}.`,
                ),
              );
            return bridge.createSymbolRenderObject(
              id,
              symbol,
              presentationValue,
            );
          };
          return Object.freeze({
            kind: "resource-factory",
            descriptor,
            resourceKind: "symbol",
            create: (options?: {
              readonly instanceId?: string;
              readonly text?: string;
              readonly anchor?: { readonly x: number; readonly y: number };
              readonly pooled?: boolean;
              readonly presentationValue?: number | null;
            }) => {
              if (
                options?.instanceId !== undefined ||
                options?.text !== undefined ||
                options?.anchor !== undefined
              )
                throw new SceneLayoutError(
                  `Symbol factory only accepts pooled and presentationValue options: ${descriptor.address}.`,
                );
              if (
                options?.pooled !== undefined &&
                typeof options.pooled !== "boolean"
              )
                throw new SceneLayoutError(
                  `Symbol factory pooled option must be boolean: ${descriptor.address}.`,
                );
              const presentationValue = options?.presentationValue ?? null;
              return options?.pooled
                ? requirePool<SymbolHandle>(descriptor, {
                    create: () => create(null),
                  }).create((object) => object.setValue(presentationValue))
                : create(presentationValue);
            },
          });
        },
        { resourceKind: "symbol", symbolPackageId: id, symbol },
      );
    }
  }
  for (const mode of manifest.gameModes?.modes ?? []) {
    const owner = ["mode", mode.id];
    add(owner, "mode", null, "structural", structural);
    if (mode.bgm) {
      const bgm = [...owner, "bgm"];
      add(bgm, "mode-bgm", owner, "structural", structural, {
        music: mode.bgm,
      });
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
  }
  for (const [popupId, popup] of Object.entries(popupManifests).sort(
    ([a], [b]) => a.localeCompare(b, "en"),
  )) {
    const owner = ["popup", popupId];
    add(owner, "popup", null, "structural", structural, {
      popupType: popup.type,
    });
    const nested = collectPopupAddresses(popup);
    for (const layerId of nested.layers)
      add(
        [...owner, "layer", layerId],
        "popup-layer",
        owner,
        "borrowed",
        (descriptor) =>
          Object.freeze({
            kind: "popup-layer",
            descriptor,
            get: () => bridge.getPopupLayer(popupId, layerId),
          }),
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
            get: () => bridge.getPopupString(popupId, item.kind, item.name),
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
  ).sort(([a], [b]) => a.localeCompare(b, "en"))) {
    if (spec.kind === "json" || spec.kind === "audio") continue;
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
            readonly instanceId?: string;
            readonly text?: string;
            readonly anchor?: { readonly x: number; readonly y: number };
            readonly pooled?: boolean;
            readonly presentationValue?: number | null;
          }) => {
            if (options?.presentationValue !== undefined)
              throw new SceneLayoutError(
                `Runtime resource does not accept presentationValue: ${descriptor.address}.`,
              );
            if (
              options?.pooled !== undefined &&
              typeof options.pooled !== "boolean"
            )
              throw new SceneLayoutError(
                `Runtime resource pooled option must be boolean: ${descriptor.address}.`,
              );
            if (options?.pooled && options.instanceId !== undefined)
              throw new SceneLayoutError(
                `Pooled runtime resource cannot have an instanceId: ${descriptor.address}.`,
              );
            if (
              options?.instanceId !== undefined &&
              (typeof options.instanceId !== "string" ||
                options.instanceId.length === 0)
            )
              throw new SceneLayoutError(
                `Runtime resource instanceId must be a non-empty exact string: ${descriptor.address}.`,
              );
            if (spec.kind === "image-string") {
              if (options?.text === undefined)
                throw new SceneLayoutError(
                  `Image-string resource requires text: ${descriptor.address}.`,
                );
              if (options.pooled) {
                const text = options.text;
                const anchor = options.anchor ?? { x: 0.5, y: 0.5 };
                return requirePool<ImgNumberRenderObject>(descriptor, {
                  create: () =>
                    bridge.createImgNumberRenderObject(name, { text, anchor }),
                  decorate: (base, source) =>
                    Object.freeze({
                      ...base,
                      setText: (value: string) => source.setText(value),
                      getText: () => source.getText(),
                      setAnchor: (value: {
                        readonly x: number;
                        readonly y: number;
                      }) => source.setAnchor(value),
                      clone: () => source.clone(),
                    }),
                }).create((object) => {
                  object.setAnchor(anchor);
                  object.setText(text);
                });
              }
              return createAddressedResourceObject(
                () =>
                  bridge.createImgNumberRenderObject(name, {
                    text: options.text!,
                    ...(options.anchor ? { anchor: options.anchor } : {}),
                  }),
                name,
                spec.kind,
                options.instanceId,
              );
            }
            if (options?.text !== undefined || options?.anchor !== undefined)
              throw new SceneLayoutError(
                `Resource does not accept image-string options: ${descriptor.address}.`,
              );
            if (options?.pooled)
              return requirePool(descriptor, {
                create: () => bridge.createRenderObject(name),
              }).create();
            return createAddressedResourceObject(
              () => bridge.createRenderObject(name),
              name,
              spec.kind,
              options?.instanceId,
            );
          },
        }),
    );
  }

  function createAddressedResourceObject<T extends RenderObject>(
    create: () => Promise<T>,
    name: string,
    resourceKind: string,
    instanceId: string | undefined,
  ): Promise<T> {
    if (instanceId === undefined) return create();
    const baseSegments = [
      "resource",
      resourceKind,
      name,
      "instance",
      instanceId,
    ];
    const reserved = reserveInstance(baseSegments);
    let creation: Promise<T>;
    try {
      creation = create();
    } catch (error) {
      reservedInstanceAddresses.delete(reserved);
      throw error;
    }
    return creation.then(
      (object) => {
        try {
          registerResourceInstance(name, resourceKind, instanceId, object);
          return object;
        } catch (error) {
          object.destroy();
          throw error;
        }
      },
      (error) => {
        reservedInstanceAddresses.delete(reserved);
        throw error;
      },
    );
  }

  const eventSymbolPackages = { ...resource.symbolPackages };
  if (manifest.symbolPackage) {
    const legacyBindingId = manifest.symbolPackage.manifest.split("/").at(-2);
    if (!legacyBindingId || !resource.symbolPackage)
      throw new SceneLayoutError(
        `Cannot resolve legacy symbol package event binding: ${manifest.symbolPackage.manifest}.`,
      );
    eventSymbolPackages[legacyBindingId] = resource.symbolPackage;
  }
  const eventCatalog = compileGameLayoutRuntimeEventCatalog({
    manifest,
    symbolPackages: Object.fromEntries(
      Object.entries(eventSymbolPackages).map(([id, symbolPackage]) => [
        id,
        Object.freeze({
          symbols: Object.freeze(
            Object.keys(symbolPackage.symbolManifest.symbols),
          ),
          states: Object.freeze(
            symbolPackage.statePreset.states.map((state) => state.id),
          ),
        }),
      ]),
    ),
    popupManifests,
  });
  for (const entry of eventCatalog.entries) {
    if (entries.has(entry.descriptor.address))
      throw new SceneLayoutError(
        `Duplicate Game Layout runtime address: ${entry.descriptor.address}.`,
      );
    entries.set(entry.descriptor.address, {
      descriptor: entry.descriptor,
      endpoint: () => eventEndpoint(entry.descriptor),
    });
    eventMetadata.set(entry.descriptor.address, {
      dispatchAddresses: entry.dispatchAddresses,
      ...(entry.interestGroup ? { interestGroup: entry.interestGroup } : {}),
    });
    if (entry.interestGroup) {
      const symbolPackageId = entry.descriptor.detail?.symbolPackageId;
      const symbol = entry.descriptor.detail?.symbol;
      if (typeof symbolPackageId !== "string" || typeof symbol !== "string")
        throw new SceneLayoutError(
          `Symbol event is missing interest metadata: ${entry.descriptor.address}.`,
        );
      let groups = symbolInterestGroups.get(symbolPackageId);
      if (!groups) {
        groups = new Map<string, string>();
        symbolInterestGroups.set(symbolPackageId, groups);
      }
      groups.set(symbol, entry.interestGroup);
    }
  }

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
    const entry = entries.get(address) ?? liveEntries.get(address);
    if (!entry)
      throw new SceneLayoutError(
        `Unknown Game Layout runtime address: ${address}.`,
      );
    return entry;
  };
  const eventManager = createRuntimeEventManager({ metadata: eventMetadata });
  const addresses: GameLayoutRuntimeAddresses = Object.freeze({
    list(options?: { readonly kind?: GameLayoutRuntimeAddressKind }) {
      if (destroyed)
        throw new SceneLayoutError(
          "Game Layout runtime address resolver is destroyed.",
        );
      return Object.freeze(
        [
          ...entries.values(),
          ...[...liveEntries.values()].sort((a, b) =>
            a.descriptor.address.localeCompare(b.descriptor.address, "en"),
          ),
        ]
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
    mount(
      parentAddress: string,
      child: RenderObject,
      options: { readonly order?: number } = {},
    ) {
      const entry = requireEntry(parentAddress);
      if (entry.descriptor.kind !== "layer")
        throw new SceneLayoutError(
          `Game Layout runtime address is not a mount parent: ${entry.descriptor.address}.`,
        );
      const order = options.order ?? 0;
      if (!Number.isSafeInteger(order))
        throw new SceneLayoutError(
          "RenderObject mount order must be a safe integer.",
        );
      const adapter = getRenderObjectAdapter(child);
      adapter.assertUsable();
      if (!adapter.owned)
        throw new SceneLayoutError("Borrowed RenderObject cannot be mounted.");
      if (adapter.view.parent)
        throw new SceneLayoutError(
          "RenderObject is already attached to another parent.",
        );
      const endpoint = entry.endpoint() as GameLayoutRenderLayerEndpoint;
      const layer = endpoint.get();
      layer.add(child, order);
      let active = true;
      let unregisterCleanup = () => {};
      const detach = (): void => {
        if (!active) return;
        active = false;
        unregisterCleanup();
        if (adapter.view.parent) layer.remove(child);
      };
      unregisterCleanup = registerRenderObjectCleanup(child, detach);
      return Object.freeze({ detach });
    },
    addressOf(child: RenderObject) {
      getRenderObjectAdapter(child).assertUsable();
      const address = instanceAddressByObject.get(child);
      if (!address || !liveEntries.has(address))
        throw new SceneLayoutError(
          "RenderObject has no live Game Layout runtime instance address.",
        );
      return address;
    },
    bind(value: string, listener: GameLayoutRuntimeEventListener) {
      const entry = requireEntry(value);
      if (entry.descriptor.kind !== "event")
        throw new SceneLayoutError(
          `Game Layout runtime address is not an event: ${entry.descriptor.address}.`,
        );
      return eventManager.bind(entry.descriptor.address, listener);
    },
    wait(value: string, options?: GameLayoutRuntimeWaitOptions) {
      const entry = requireEntry(value);
      if (entry.descriptor.kind !== "event")
        return Promise.reject(
          new SceneLayoutError(
            `Game Layout runtime address is not an event: ${entry.descriptor.address}.`,
          ),
        );
      return eventManager.wait(entry.descriptor.address, options);
    },
  });
  return Object.freeze({
    addresses,
    hasInterest(address: GameLayoutRuntimeAddress) {
      return eventManager.hasInterest(address);
    },
    hasSymbolInterest(symbolPackageId: string, symbol: string) {
      const group = symbolInterestGroups.get(symbolPackageId)?.get(symbol);
      return group ? eventManager.hasGroupInterest(group) : false;
    },
    emit(
      address: GameLayoutRuntimeAddress,
      detail:
        | GameLayoutRuntimeEvent["detail"]
        | (() => GameLayoutRuntimeEvent["detail"]) = Object.freeze({}),
    ) {
      eventManager.emit(address, detail);
    },
    registerPopupInstance(
      popupId: string,
      instanceId: string,
      rootLayer: RenderObjectLayer,
    ) {
      if (destroyed)
        throw new SceneLayoutError(
          "Game Layout runtime address resolver is destroyed.",
        );
      if (typeof instanceId !== "string" || instanceId.length === 0)
        throw new SceneLayoutError(
          "Popup instanceId must be a non-empty exact string.",
        );
      const owner = ["popup", popupId];
      const ownerAddress = formatGameLayoutRuntimeAddress(...owner);
      if (!entries.has(ownerAddress))
        throw new SceneLayoutError(
          `Unknown Game Layout Popup owner: ${ownerAddress}.`,
        );
      const baseSegments = [...owner, "instance", instanceId];
      const baseAddress = reserveInstance(baseSegments);
      reservedInstanceAddresses.delete(baseAddress);
      const registered: GameLayoutRuntimeAddress[] = [];
      let live = true;
      const assertLive = (): void => {
        if (!live || !liveEntries.has(baseAddress))
          throw new SceneLayoutError(
            `Game Layout Popup instance is stale: ${baseAddress}.`,
          );
      };
      try {
        registered.push(
          addLive(
            baseSegments,
            "popup-instance",
            owner,
            (descriptor) =>
              Object.freeze({ kind: "popup-instance", descriptor }),
            { popupId, instanceId },
          ),
        );
        registered.push(
          addLive(
            [...baseSegments, "layer", "root"],
            "layer",
            baseSegments,
            (descriptor) =>
              Object.freeze({
                kind: "layer",
                descriptor,
                get: () => {
                  assertLive();
                  return rootLayer;
                },
              }),
          ),
        );
      } catch (error) {
        for (const address of registered) liveEntries.delete(address);
        throw error;
      }
      return Object.freeze({
        address: baseAddress,
        unregister: () => {
          if (!live) return;
          live = false;
          for (const address of registered) liveEntries.delete(address);
        },
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const pool of factoryPools.values()) pool.destroy();
      factoryPools.clear();
      liveEntries.clear();
      reservedInstanceAddresses.clear();
      eventManager.destroy();
    },
  });
}

function collectPopupAddresses(manifest: PopupManifest) {
  const layers = new Set<string>();
  const strings = new Map<string, "text" | "image-string">();
  const addString = (name: string, kind: "text" | "image-string") => {
    const previous = strings.get(name);
    if (previous && previous !== kind)
      throw new SceneLayoutError(
        `Popup string name has conflicting kinds: ${name}.`,
      );
    strings.set(name, kind);
  };
  if (manifest.type === "single-state") {
    for (const layer of manifest.singleState.layers) {
      layers.add(layer.id);
      if (layer.kind === "text" || layer.kind === "image-string")
        addString(layer.id, layer.kind);
    }
  } else if (manifest.type === "spine") {
    if (!("spine" in manifest))
      return Object.freeze({
        layers: Object.freeze([]),
        strings: Object.freeze([]),
      });
    if (manifest.spine.prompt) addString("prompt", "text");
    for (const layer of manifest.spine.overlays ?? []) {
      layers.add(layer.id);
      if (layer.kind === "text" || layer.kind === "image-string")
        addString(layer.name, layer.kind);
    }
  } else {
    if (!("awardCelebration" in manifest))
      return Object.freeze({
        layers: Object.freeze([]),
        strings: Object.freeze([]),
      });
    for (const tier of [
      manifest.awardCelebration.base,
      manifest.awardCelebration.standard,
      ...manifest.awardCelebration.celebrationTiers,
    ])
      for (const layer of tier.layers) {
        layers.add(layer.id);
        if (layer.kind === "text" || layer.kind === "image-string")
          addString(layer.name ?? "win-amount", layer.kind);
      }
  }
  return Object.freeze({
    layers: Object.freeze([...layers].sort((a, b) => a.localeCompare(b, "en"))),
    strings: Object.freeze(
      [...strings]
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([name, kind]) => Object.freeze({ name, kind })),
    ),
  });
}
