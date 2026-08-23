import type { PopupManifest } from "../../popup/data/index.js";
import { SceneLayoutError } from "../errors.js";
import type { SceneLayoutManifestLatest } from "../types.js";
import {
  formatGameLayoutRuntimeAddress,
  type GameLayoutRuntimeAddress,
  type GameLayoutRuntimeAddressDescriptor,
} from "../data/runtime-address.js";

export type GameLayoutRuntimeEventFamily =
  | "variant"
  | "node-animation"
  | "symbol-state"
  | "mode-state"
  | "mode-bgm"
  | "transition-lifecycle"
  | "transition-effect-event"
  | "transition-effect-lifecycle"
  | "popup-session"
  | "popup-phase"
  | "popup-tier"
  | "popup-segment"
  | "audio-music"
  | "resource-animation";

export interface GameLayoutRuntimeEventFacet {
  readonly key: string;
  readonly value: string;
}

export interface GameLayoutRuntimeEventCatalogEntry {
  readonly descriptor: GameLayoutRuntimeAddressDescriptor & {
    readonly kind: "event";
  };
  readonly family: GameLayoutRuntimeEventFamily;
  readonly facets: readonly GameLayoutRuntimeEventFacet[];
  readonly dispatchAddresses: readonly GameLayoutRuntimeAddress[];
  readonly interestGroup?: string;
}

export interface GameLayoutRuntimeEventCatalog {
  readonly entries: readonly GameLayoutRuntimeEventCatalogEntry[];
}

export interface GameLayoutRuntimeEventCatalogSource {
  readonly manifest: SceneLayoutManifestLatest;
  readonly symbolPackages: Readonly<
    Record<
      string,
      {
        readonly symbols: readonly string[];
        readonly states: readonly string[];
      }
    >
  >;
  readonly popupManifests: Readonly<Record<string, PopupManifest>>;
  readonly audioMusicNames: readonly string[];
}

export function compileGameLayoutRuntimeEventCatalog(
  source: GameLayoutRuntimeEventCatalogSource,
): GameLayoutRuntimeEventCatalog {
  const entries: GameLayoutRuntimeEventCatalogEntry[] = [];
  const addresses = new Set<GameLayoutRuntimeAddress>();
  const add = (options: {
    readonly segments: readonly string[];
    readonly owner?: readonly string[];
    readonly family: GameLayoutRuntimeEventFamily;
    readonly facets: readonly (readonly [string, string])[];
    readonly detail?: Readonly<
      Record<string, string | number | boolean | null>
    >;
    readonly dispatchAddresses?: readonly GameLayoutRuntimeAddress[];
    readonly interestGroup?: string;
  }): GameLayoutRuntimeAddress => {
    const address = formatGameLayoutRuntimeAddress(...options.segments);
    if (addresses.has(address))
      throw new SceneLayoutError(
        `Duplicate Game Layout runtime event address: ${address}.`,
      );
    addresses.add(address);
    const descriptor = Object.freeze({
      address,
      kind: "event" as const,
      ownerAddress: options.owner
        ? formatGameLayoutRuntimeAddress(...options.owner)
        : null,
      authored: options.segments[0] !== "resource",
      capability: "event" as const,
      ...(options.detail
        ? { detail: Object.freeze({ ...options.detail }) }
        : {}),
    });
    entries.push(
      Object.freeze({
        descriptor,
        family: options.family,
        facets: Object.freeze(
          options.facets.map(([key, value]) => Object.freeze({ key, value })),
        ),
        dispatchAddresses: Object.freeze(
          options.dispatchAddresses
            ? [...options.dispatchAddresses]
            : [address],
        ),
        ...(options.interestGroup
          ? { interestGroup: options.interestGroup }
          : {}),
      }),
    );
    return address;
  };

  add({
    segments: ["event", "variant-changed"],
    family: "variant",
    facets: [["event", "variant-changed"]],
  });

  for (const node of source.manifest.nodes) {
    const resource = node.resource;
    if (!resource || resource.kind !== "spine" || "stateMachine" in resource)
      continue;
    const owner = ["node", node.id];
    for (const lifecycle of ["started", "ended"])
      add({
        segments: [...owner, "animation", "lifecycle", lifecycle],
        owner,
        family: "node-animation",
        facets: [
          ["node", node.id],
          ["animation", resource.defaultAnimation],
          ["lifecycle", lifecycle],
        ],
        detail: { eventFamily: "animation" },
      });
  }

  const mainReel = source.manifest.reels.main;
  for (const bindingId of Object.keys(
    source.manifest.symbolPackages ?? {},
  ).sort(compare)) {
    if (!mainReel)
      throw new SceneLayoutError(
        `Symbol package "${bindingId}" requires the main reel.`,
      );
    const symbolPackage = source.symbolPackages[bindingId];
    if (!symbolPackage)
      throw new SceneLayoutError(
        `Symbol package event catalog source is missing binding: ${bindingId}.`,
      );
    for (const symbol of [...symbolPackage.symbols].sort(compare))
      for (const state of symbolPackage.states)
        for (const edge of ["entered", "exited"])
          addSymbolAddresses({
            add,
            bindingId,
            symbol,
            state,
            edge,
            columns: mainReel.columns,
            rows: mainReel.rows,
          });
  }

  for (const mode of source.manifest.gameModes.modes) {
    const owner = ["mode", mode.id];
    for (const state of ["displayed", "stable"])
      for (const edge of ["entered", "exited"])
        add({
          segments: [...owner, "state", state, edge],
          owner,
          family: "mode-state",
          facets: [
            ["mode", mode.id],
            ["state", state],
            ["edge", edge],
          ],
        });
    if (mode.bgm)
      for (const lifecycle of ["started", "stopped"])
        add({
          segments: [...owner, "bgm", "lifecycle", lifecycle],
          owner: [...owner, "bgm"],
          family: "mode-bgm",
          facets: [
            ["mode", mode.id],
            ["music", mode.bgm],
            ["lifecycle", lifecycle],
          ],
        });
  }

  for (const transition of source.manifest.gameModes.transitions ?? []) {
    const owner = ["transition", transition.from, transition.to];
    for (const lifecycle of ["started", "switched", "ended", "failed"])
      add({
        segments: [...owner, "lifecycle", lifecycle],
        owner,
        family: "transition-lifecycle",
        facets: [
          ["from", transition.from],
          ["to", transition.to],
          ["lifecycle", lifecycle],
        ],
      });
    const effectKind =
      "animation" in transition.overlay
        ? "spine"
        : "fadeOutSeconds" in transition.overlay
          ? "video"
          : "none";
    const effectOwner = [...owner, "effect", effectKind];
    if (effectKind === "spine" && "switchEvent" in transition.overlay)
      add({
        segments: [...effectOwner, "event", transition.overlay.switchEvent],
        owner: effectOwner,
        family: "transition-effect-event",
        facets: [
          ["from", transition.from],
          ["to", transition.to],
          ["effect", effectKind],
          ["event", transition.overlay.switchEvent],
        ],
        detail: { animation: transition.overlay.animation },
      });
    if (effectKind === "video")
      for (const lifecycle of ["started", "ended"])
        add({
          segments: [...effectOwner, "lifecycle", lifecycle],
          owner: effectOwner,
          family: "transition-effect-lifecycle",
          facets: [
            ["from", transition.from],
            ["to", transition.to],
            ["effect", effectKind],
            ["lifecycle", lifecycle],
          ],
        });
  }

  for (const popupId of Object.keys(source.manifest.popups ?? {}).sort(
    compare,
  )) {
    const popup = source.popupManifests[popupId];
    if (!popup)
      throw new SceneLayoutError(
        `Popup event catalog source is missing binding: ${popupId}.`,
      );
    const owner = ["popup", popupId];
    for (const session of [
      "queued",
      "opening",
      "active",
      "closing",
      "finished",
      "cancelled",
      "failed",
    ])
      add({
        segments: [...owner, "session", session],
        owner,
        family: "popup-session",
        facets: [
          ["popup", popupId],
          ["session", session],
        ],
      });
    for (const phase of popupPhases(popup))
      for (const edge of ["entered", "exited"])
        add({
          segments: [...owner, "phase", phase, edge],
          owner,
          family: "popup-phase",
          facets: [
            ["popup", popupId],
            ["phase", phase],
            ["edge", edge],
          ],
        });
    if (popup.type !== "award-celebration") continue;
    for (const tier of [
      "base",
      "standard",
      ...popup.awardCelebration.celebrationTiers.map((item) => item.id),
    ]) {
      for (const edge of ["entered", "exited"])
        add({
          segments: [...owner, "tier", tier, edge],
          owner,
          family: "popup-tier",
          facets: [
            ["popup", popupId],
            ["tier", tier],
            ["edge", edge],
          ],
        });
      for (const segment of ["start", "loop", "end"])
        for (const edge of ["entered", "exited"])
          add({
            segments: [...owner, "tier", tier, "segment", segment, edge],
            owner,
            family: "popup-segment",
            facets: [
              ["popup", popupId],
              ["tier", tier],
              ["segment", segment],
              ["edge", edge],
            ],
          });
    }
  }

  for (const music of [...source.audioMusicNames].sort(compare)) {
    const owner = ["audio", "music", music];
    for (const lifecycle of ["started", "stopped"])
      add({
        segments: [...owner, "lifecycle", lifecycle],
        owner,
        family: "audio-music",
        facets: [
          ["music", music],
          ["lifecycle", lifecycle],
        ],
      });
  }

  for (const [name, spec] of Object.entries(
    source.manifest.runtimeResources ?? {},
  ).sort(([left], [right]) => compare(left, right))) {
    if (spec.kind !== "spine") continue;
    const owner = ["resource", "spine", name];
    for (const lifecycle of ["started", "ended"])
      add({
        segments: [...owner, "animation", "lifecycle", lifecycle],
        owner,
        family: "resource-animation",
        facets: [
          ["resource", name],
          ["lifecycle", lifecycle],
        ],
        detail: { eventFamily: "animation" },
      });
  }

  return Object.freeze({ entries: Object.freeze(entries) });
}

function addSymbolAddresses(options: {
  readonly add: (options: {
    readonly segments: readonly string[];
    readonly owner?: readonly string[];
    readonly family: GameLayoutRuntimeEventFamily;
    readonly facets: readonly (readonly [string, string])[];
    readonly detail?: Readonly<
      Record<string, string | number | boolean | null>
    >;
    readonly dispatchAddresses?: readonly GameLayoutRuntimeAddress[];
    readonly interestGroup?: string;
  }) => GameLayoutRuntimeAddress;
  readonly bindingId: string;
  readonly symbol: string;
  readonly state: string;
  readonly edge: string;
  readonly columns: number;
  readonly rows: number;
}): void {
  const addresses = new Map<string, GameLayoutRuntimeAddress>();
  const interestGroup = `${options.bindingId}\u0000${options.symbol}`;
  const owner = ["symbol-package", options.bindingId];
  const addCoordinate = (
    x: number | "*",
    y: number | "*",
    dispatchAddresses?: readonly GameLayoutRuntimeAddress[],
  ) => {
    const scope =
      x === "*" && y === "*"
        ? "all"
        : x === "*"
          ? "row"
          : y === "*"
            ? "column"
            : "cell";
    const address = options.add({
      segments: [
        ...owner,
        "symbol",
        options.symbol,
        "instance",
        "reel",
        "main",
        "x",
        String(x),
        "y",
        String(y),
        "state",
        options.state,
        options.edge,
      ],
      owner,
      family: "symbol-state",
      facets: [
        ["symbol-package", options.bindingId],
        ["symbol", options.symbol],
        ["state", options.state],
        ["scope", scope],
        ...(x === "*" ? [] : ([["x", String(x)]] as const)),
        ...(y === "*" ? [] : ([["y", String(y)]] as const)),
        ["edge", options.edge],
      ],
      detail: {
        eventFamily: "symbol-state",
        symbolPackageId: options.bindingId,
        symbol: options.symbol,
        reelId: "main",
        x: String(x),
        y: String(y),
        state: options.state,
      },
      ...(dispatchAddresses ? { dispatchAddresses } : {}),
      interestGroup,
    });
    addresses.set(`${String(x)}\u0000${String(y)}`, address);
    return address;
  };
  addCoordinate("*", "*");
  for (let x = 0; x < options.columns; x += 1) addCoordinate(x, "*");
  for (let y = 0; y < options.rows; y += 1) addCoordinate("*", y);
  for (let x = 0; x < options.columns; x += 1)
    for (let y = 0; y < options.rows; y += 1) {
      const exact = formatGameLayoutRuntimeAddress(
        ...owner,
        "symbol",
        options.symbol,
        "instance",
        "reel",
        "main",
        "x",
        String(x),
        "y",
        String(y),
        "state",
        options.state,
        options.edge,
      );
      addCoordinate(x, y, [
        exact,
        addresses.get(`${String(x)}\u0000*`)!,
        addresses.get(`*\u0000${String(y)}`)!,
        addresses.get("*\u0000*")!,
      ]);
    }
}

function popupPhases(manifest: PopupManifest): readonly string[] {
  switch (manifest.type) {
    case "award-celebration":
      return Object.freeze(["idle", "counting", "dismissing", "complete"]);
    case "spine":
      return Object.freeze(["idle", "start", "loop", "end", "complete"]);
    case "single-state":
      return Object.freeze(["idle", "active", "complete"]);
  }
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
