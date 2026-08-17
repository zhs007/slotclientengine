import { SceneLayoutError } from "./errors.js";
import { parseSceneLayoutManifestV1 } from "./manifest.js";
import type {
  SceneLayoutAdaptation,
  SceneLayoutGameModeV2,
  SceneLayoutManifest,
  SceneLayoutManifestModern,
  SceneLayoutManifestV1,
  SceneLayoutManifestV2,
  SceneLayoutModeAdaptation,
  SceneLayoutNode,
  SceneLayoutPopupBinding,
  SceneLayoutReelDefinition,
  SceneLayoutVariantId,
} from "./types.js";

const ROOT_KEYS = new Set([
  "version",
  "kind",
  "id",
  "coordinateOrigin",
  "nodes",
  "reels",
  "symbolPackage",
  "symbolPackages",
  "popups",
  "runtimeResources",
  "gameModes",
]);
const MODE_KEYS = new Set([
  "id",
  "adaptation",
  "reelEnabled",
  "reelPlacements",
  "backgroundNodes",
  "nodeStates",
  "symbolPackage",
  "awardCelebrationPopup",
  "primaryAction",
]);

export function parseSceneLayoutManifestV2(
  value: unknown,
): SceneLayoutManifestV2 {
  const root = record(value, "scene layout manifest");
  known(root, ROOT_KEYS, "scene layout manifest");
  if (root.version !== 2) fail("scene layout manifest.version must be 2.");
  if (root.kind !== "scene-layout")
    fail('scene layout manifest.kind must be "scene-layout".');
  if (Object.hasOwn(root, "adaptation"))
    fail("scene layout manifest v2 must not declare root adaptation.");
  const gameModes = record(root.gameModes, "scene layout gameModes");
  known(
    gameModes,
    new Set(["initialMode", "modes", "transitions"]),
    "scene layout gameModes",
  );
  if (!Array.isArray(gameModes.modes) || gameModes.modes.length === 0)
    fail("scene layout gameModes.modes must be a non-empty array.");
  const modes = gameModes.modes.map((raw, index) =>
    parseModeHead(raw, index, root.reels),
  );
  const ids = new Set<string>();
  for (const mode of modes) {
    if (ids.has(mode.id))
      fail(`scene layout game mode id must be unique: ${mode.id}.`);
    ids.add(mode.id);
  }
  if (
    typeof gameModes.initialMode !== "string" ||
    !ids.has(gameModes.initialMode)
  )
    fail("scene layout gameModes.initialMode must reference a declared mode.");
  const transitions = Array.isArray(gameModes.transitions)
    ? gameModes.transitions
    : gameModes.transitions === undefined
      ? []
      : fail("scene layout gameModes.transitions must be an array.");
  for (const [index, transition] of transitions.entries()) {
    const item = record(
      transition,
      `scene layout gameModes.transitions[${index}]`,
    );
    if (typeof item.from !== "string" || !ids.has(item.from))
      fail(`scene layout gameModes.transitions[${index}].from is unknown.`);
    if (typeof item.to !== "string" || !ids.has(item.to))
      fail(`scene layout gameModes.transitions[${index}].to is unknown.`);
    if (item.from === item.to)
      fail(
        `scene layout gameModes.transitions[${index}] must not self-transition.`,
      );
    const overlay = record(
      item.overlay,
      `scene layout gameModes.transitions[${index}].overlay`,
    );
    const resource =
      overlay.resource === undefined
        ? undefined
        : record(
            overlay.resource,
            `scene layout gameModes.transitions[${index}].overlay.resource`,
          );
    if (resource?.kind === "spine") {
      const sourceMode = modes.find((mode) => mode.id === item.from)!;
      exactVariantMap(
        overlay.placements,
        activeVariants(sourceMode.adaptation),
        `scene layout gameModes.transitions[${index}].overlay.placements`,
      );
    }
  }
  for (const mode of modes) {
    if (!mode.primaryAction) continue;
    if (mode.primaryAction.kind !== "request-game-mode")
      fail(`scene layout mode "${mode.id}" primaryAction.kind is unknown.`);
    if (!ids.has(mode.primaryAction.targetMode))
      fail(`scene layout mode "${mode.id}" primaryAction target is unknown.`);
    if (mode.primaryAction.targetMode === mode.id)
      fail(
        `scene layout mode "${mode.id}" primaryAction must not target itself.`,
      );
    if (
      !transitions.some(
        (transition) =>
          record(transition, "scene transition").from === mode.id &&
          record(transition, "scene transition").to ===
            mode.primaryAction!.targetMode,
      )
    )
      fail(
        `scene layout mode "${mode.id}" primaryAction requires a direct transition.`,
      );
  }

  const draft = structuredClone(value) as SceneLayoutManifestV2;
  for (const mode of modes)
    if (!mode.reelEnabled && (mode.symbolPackage || draft.symbolPackage))
      fail(
        `scene layout mode "${mode.id}" cannot bind Symbols without reelPlacements.main.`,
      );
  for (const mode of modes)
    parseSceneLayoutManifestV1(materializeModeDraft(draft, mode.id));
  return deepFreeze(draft);
}

export function upgradeSceneLayoutManifestToV2(
  value: unknown,
): SceneLayoutManifestV2 {
  const normalized = normalizeLegacySceneLayoutPresentationOrders(value);
  const raw = record(normalized, "scene layout manifest");
  if (raw.version === 2) return parseSceneLayoutManifestV2(normalized);
  const source = parseSceneLayoutManifestV1(normalized);
  const fallbackBackgrounds = adaptationBackgrounds(source.adaptation);
  const sourceModes = source.gameModes?.modes ?? [
    {
      id: "BaseGame",
      nodeStates: {},
      ...(source.symbolPackage ? {} : {}),
    },
  ];
  const modes: SceneLayoutGameModeV2[] = sourceModes.map((mode) => ({
    id: mode.id,
    adaptation: stripAdaptationBackground(source.adaptation),
    reelEnabled: true,
    reelPlacements: Object.fromEntries(
      Object.entries(source.reels).map(([id, reel]) => [
        id,
        structuredClone(reel.placements),
      ]),
    ),
    backgroundNodes: structuredClone(
      mode.backgroundNodes ?? fallbackBackgrounds,
    ),
    nodeStates: structuredClone(mode.nodeStates),
    ...(mode.symbolPackage ? { symbolPackage: mode.symbolPackage } : {}),
    ...(mode.awardCelebrationPopup
      ? { awardCelebrationPopup: mode.awardCelebrationPopup }
      : {}),
  }));
  const latest: SceneLayoutManifestV2 = {
    version: 2,
    kind: "scene-layout",
    id: source.id,
    ...(source.coordinateOrigin
      ? { coordinateOrigin: source.coordinateOrigin }
      : {}),
    nodes: structuredClone(source.nodes),
    reels: Object.fromEntries(
      Object.entries(source.reels).map(
        ([id, { placements: _placements, ...reel }]) => [
          id,
          structuredClone(reel),
        ],
      ),
    ),
    ...(source.symbolPackage
      ? { symbolPackage: structuredClone(source.symbolPackage) }
      : {}),
    ...(source.symbolPackages
      ? { symbolPackages: structuredClone(source.symbolPackages) }
      : {}),
    ...(source.popups ? { popups: structuredClone(source.popups) } : {}),
    ...(source.runtimeResources
      ? { runtimeResources: structuredClone(source.runtimeResources) }
      : {}),
    gameModes: {
      initialMode: source.gameModes?.initialMode ?? "BaseGame",
      modes,
      ...(source.gameModes?.transitions
        ? { transitions: structuredClone(source.gameModes.transitions) }
        : {}),
    },
  };
  return parseSceneLayoutManifestV2(latest);
}

export function materializeInitialSceneLayoutManifest(
  manifest: SceneLayoutManifestModern,
): SceneLayoutManifestV1 {
  return materializeSceneLayoutManifestForMode(
    manifest,
    manifest.gameModes.initialMode,
  );
}

export function materializeSceneLayoutManifestForMode(
  manifest: SceneLayoutManifest,
  modeId?: string,
): SceneLayoutManifestV1 {
  if (manifest.version === 1) return parseSceneLayoutManifestV1(manifest);
  const parsed = parseSceneLayoutManifestModernWithoutMaterialization(manifest);
  const selected = modeId ?? parsed.gameModes.initialMode;
  return parseSceneLayoutManifestV1(materializeModeDraft(parsed, selected));
}

function parseSceneLayoutManifestModernWithoutMaterialization(
  value: SceneLayoutManifestModern,
): SceneLayoutManifestModern {
  const mode = value.gameModes.modes.find(
    (candidate) => candidate.id === value.gameModes.initialMode,
  );
  if (!mode) fail("scene layout gameModes.initialMode is unknown.");
  return value;
}

function materializeModeDraft(
  manifest: SceneLayoutManifestModern,
  modeId: string,
): SceneLayoutManifestV1 {
  const mode = manifest.gameModes.modes.find(
    (candidate) => candidate.id === modeId,
  );
  if (!mode) fail(`Unknown scene layout game mode "${modeId}".`);
  const variants = activeVariants(mode.adaptation);
  const backgrounds = mode.backgroundNodes;
  const backgroundNodeIds = new Set(
    manifest.gameModes.modes.flatMap((candidate) =>
      Object.values(candidate.backgroundNodes),
    ),
  );
  const activeBackgroundNodeIds = new Set(Object.values(backgrounds));
  const maximumNodeOrder = Math.max(
    ...manifest.nodes.map((node) => node.order),
    0,
  );
  const nodes = manifest.nodes.map((node, index) => ({
    ...structuredClone(node),
    // Foreign mode backgrounds stay in the stable node façade, but are placed
    // behind the active mode's background-order validation and remain hidden.
    order:
      backgroundNodeIds.has(node.id) && !activeBackgroundNodeIds.has(node.id)
        ? maximumNodeOrder + index + 1
        : node.order,
    placements: effectivePlacements(node, variants),
  }));
  const validationBackgrounds = Object.fromEntries(
    variants.map((variant) => {
      const node = nodes
        .filter(
          (candidate) =>
            candidate.placements[variant] &&
            candidate.resource.kind !== "image-string" &&
            candidate.resource.kind !== "vni",
        )
        .sort((left, right) => left.order - right.order)[0];
      if (!node) fail(`scene layout ${variant} has no valid background node.`);
      return [variant, node.id];
    }),
  );
  const adaptation = addAdaptationBackground(
    mode.adaptation,
    validationBackgrounds,
  );
  const reels = Object.fromEntries(
    Object.entries(manifest.reels).map(([id, reel]) => [
      id,
      {
        ...structuredClone(reel),
        placements:
          structuredClone(mode.reelPlacements[id]) ??
          Object.fromEntries(
            variants.map((variant) => [
              variant,
              validationOnlyReelPlacement(
                mode.adaptation,
                variant,
                reel,
                manifest.coordinateOrigin ?? "top-left",
              ),
            ]),
          ),
      },
    ]),
  );
  const effectiveBackgrounds = structuredClone(backgrounds);
  const modes = manifest.gameModes.modes.map((candidate) => ({
    id: candidate.id,
    backgroundNodes: structuredClone(effectiveBackgrounds),
    nodeStates: structuredClone(candidate.nodeStates),
    ...(candidate.symbolPackage
      ? { symbolPackage: candidate.symbolPackage }
      : {}),
    ...(candidate.awardCelebrationPopup
      ? { awardCelebrationPopup: candidate.awardCelebrationPopup }
      : {}),
  }));
  return {
    version: 1,
    kind: "scene-layout",
    id: manifest.id,
    ...(manifest.coordinateOrigin
      ? { coordinateOrigin: manifest.coordinateOrigin }
      : {}),
    adaptation,
    nodes,
    reels,
    ...(manifest.symbolPackage
      ? { symbolPackage: structuredClone(manifest.symbolPackage) }
      : {}),
    ...(manifest.symbolPackages
      ? { symbolPackages: structuredClone(manifest.symbolPackages) }
      : {}),
    ...(manifest.popups
      ? { popups: effectivePopups(manifest.popups, variants) }
      : {}),
    ...(manifest.runtimeResources
      ? { runtimeResources: structuredClone(manifest.runtimeResources) }
      : {}),
    gameModes: {
      initialMode: manifest.gameModes.initialMode,
      modes,
      transitions: (manifest.gameModes.transitions ?? []).map((transition) =>
        effectiveTransition(transition, variants),
      ),
    },
  };
}

function parseModeHead(
  value: unknown,
  index: number,
  reelsValue: unknown,
): SceneLayoutGameModeV2 {
  const label = `scene layout gameModes.modes[${index}]`;
  const mode = record(value, label);
  known(mode, MODE_KEYS, label);
  if (typeof mode.id !== "string" || !mode.id)
    fail(`${label}.id must be a non-empty string.`);
  const adaptation = parseModeAdaptation(
    mode.adaptation,
    `${label}.adaptation`,
  );
  const variants = activeVariants(adaptation);
  const backgrounds = exactVariantMap(
    mode.backgroundNodes,
    variants,
    `${label}.backgroundNodes`,
  );
  const reels = record(reelsValue, "scene layout manifest.reels");
  const placements = record(mode.reelPlacements, `${label}.reelPlacements`);
  known(placements, new Set(Object.keys(reels)), `${label}.reelPlacements`);
  if (typeof mode.reelEnabled !== "boolean")
    fail(`${label}.reelEnabled must be boolean.`);
  if (!mode.reelEnabled && Object.keys(placements).length > 0)
    fail(`${label}.reelPlacements must be empty when reelEnabled is false.`);
  if (mode.reelEnabled)
    for (const id of Object.keys(reels))
      if (!Object.hasOwn(placements, id))
        fail(
          `${label}.reelPlacements.${id} is required when reelEnabled is true.`,
        );
  for (const id of Object.keys(placements)) {
    exactVariantMap(placements[id], variants, `${label}.reelPlacements.${id}`);
  }
  const primaryAction =
    mode.primaryAction === undefined
      ? undefined
      : record(mode.primaryAction, `${label}.primaryAction`);
  if (primaryAction) {
    known(
      primaryAction,
      new Set(["kind", "targetMode"]),
      `${label}.primaryAction`,
    );
    if (
      primaryAction.kind !== "request-game-mode" ||
      typeof primaryAction.targetMode !== "string" ||
      !primaryAction.targetMode
    )
      fail(`${label}.primaryAction is invalid.`);
  }
  return {
    ...(structuredClone(mode) as unknown as SceneLayoutGameModeV2),
    adaptation,
    backgroundNodes: backgrounds,
  };
}

function parseModeAdaptation(
  value: unknown,
  label: string,
): SceneLayoutModeAdaptation {
  const adaptation = record(value, label);
  if (adaptation.mode === "maximized-focus") {
    known(adaptation, new Set(["mode", "artSize", "focusRect"]), label);
    return structuredClone(adaptation) as SceneLayoutModeAdaptation;
  }
  if (adaptation.mode === "orientation-focus") {
    known(adaptation, new Set(["mode", "variants"]), label);
    const variants = record(adaptation.variants, `${label}.variants`);
    known(variants, new Set(["landscape", "portrait"]), `${label}.variants`);
    for (const id of ["landscape", "portrait"] as const) {
      const variant = record(variants[id], `${label}.variants.${id}`);
      known(
        variant,
        new Set(["artSize", "focusRect", "frameFocusRect", "minFocusMargin"]),
        `${label}.variants.${id}`,
      );
    }
    return structuredClone(adaptation) as SceneLayoutModeAdaptation;
  }
  fail(`${label}.mode is unknown.`);
}

function exactVariantMap(
  value: unknown,
  variants: readonly SceneLayoutVariantId[],
  label: string,
): Record<string, unknown> {
  const result = record(value, label);
  known(result, new Set(variants), label);
  for (const variant of variants)
    if (!Object.hasOwn(result, variant))
      fail(`${label}.${variant} is required.`);
  return result;
}

function activeVariants(
  adaptation: SceneLayoutModeAdaptation,
): readonly SceneLayoutVariantId[] {
  return adaptation.mode === "maximized-focus"
    ? ["default"]
    : ["landscape", "portrait"];
}

function stripAdaptationBackground(
  adaptation: SceneLayoutAdaptation,
): SceneLayoutModeAdaptation {
  if (adaptation.mode === "maximized-focus") {
    const { backgroundNode: _backgroundNode, ...rest } = adaptation;
    return structuredClone(rest);
  }
  return {
    mode: "orientation-focus",
    variants: {
      landscape: stripVariantBackground(adaptation.variants.landscape),
      portrait: stripVariantBackground(adaptation.variants.portrait),
    },
  };
}

function stripVariantBackground<T extends { readonly backgroundNode: string }>(
  variant: T,
): Omit<T, "backgroundNode"> {
  const { backgroundNode: _backgroundNode, ...rest } = variant;
  return structuredClone(rest);
}

function adaptationBackgrounds(
  adaptation: SceneLayoutAdaptation,
): Partial<Record<SceneLayoutVariantId, string>> {
  return adaptation.mode === "maximized-focus"
    ? { default: adaptation.backgroundNode }
    : {
        landscape: adaptation.variants.landscape.backgroundNode,
        portrait: adaptation.variants.portrait.backgroundNode,
      };
}

function addAdaptationBackground(
  adaptation: SceneLayoutModeAdaptation,
  backgrounds: Readonly<Partial<Record<SceneLayoutVariantId, string>>>,
): SceneLayoutAdaptation {
  if (adaptation.mode === "maximized-focus")
    return {
      ...structuredClone(adaptation),
      backgroundNode: requireVariant(backgrounds, "default"),
    };
  return {
    mode: "orientation-focus",
    variants: {
      landscape: {
        ...structuredClone(adaptation.variants.landscape),
        backgroundNode: requireVariant(backgrounds, "landscape"),
      },
      portrait: {
        ...structuredClone(adaptation.variants.portrait),
        backgroundNode: requireVariant(backgrounds, "portrait"),
      },
    },
  };
}

function requireVariant(
  values: Readonly<Partial<Record<SceneLayoutVariantId, string>>>,
  id: SceneLayoutVariantId,
): string {
  const value = values[id];
  if (!value) fail(`scene layout mode backgroundNodes.${id} is required.`);
  return value;
}

function effectivePlacements(
  node: SceneLayoutNode,
  variants: readonly SceneLayoutVariantId[],
) {
  const selected = Object.fromEntries(
    variants.flatMap((variant) =>
      node.placements[variant]
        ? [[variant, structuredClone(node.placements[variant])]]
        : [],
    ),
  );
  if (Object.keys(selected).length) return selected;
  const fallback = Object.values(node.placements).find(Boolean);
  return fallback ? { [variants[0]!]: structuredClone(fallback) } : selected;
}

function validationOnlyReelPlacement(
  adaptation: SceneLayoutModeAdaptation,
  variantId: SceneLayoutVariantId,
  reel: SceneLayoutReelDefinition,
  origin: "top-left" | "center",
): { readonly x: number; readonly y: number } {
  const variant =
    adaptation.mode === "maximized-focus"
      ? adaptation
      : adaptation.variants[variantId as "landscape" | "portrait"];
  const reelWidth =
    reel.columns * reel.cellSize.width +
    Math.max(0, reel.columns - 1) * reel.gap.x;
  const reelHeight =
    reel.rows * reel.cellSize.height + Math.max(0, reel.rows - 1) * reel.gap.y;
  if (origin === "top-left")
    return { x: variant.focusRect.x, y: variant.focusRect.y };
  return {
    x: variant.focusRect.x + reelWidth / 2 - variant.artSize.width / 2,
    y: variant.focusRect.y + reelHeight / 2 - variant.artSize.height / 2,
  };
}

function effectivePopups(
  popups: Readonly<Record<string, SceneLayoutPopupBinding>>,
  variants: readonly SceneLayoutVariantId[],
): Readonly<Record<string, SceneLayoutPopupBinding>> {
  return Object.fromEntries(
    Object.entries(popups).map(([id, popup]) => {
      const fallback = Object.values(popup.placements).find(Boolean);
      return [
        id,
        {
          ...structuredClone(popup),
          placements: Object.fromEntries(
            variants.map((variant) => [
              variant,
              structuredClone(popup.placements[variant] ?? fallback),
            ]),
          ),
        },
      ];
    }),
  );
}

function effectiveTransition<T extends { readonly overlay: unknown }>(
  transition: T,
  variants: readonly SceneLayoutVariantId[],
): T {
  const copy = structuredClone(transition) as T;
  const overlay = record(copy.overlay, "scene transition overlay");
  if (!Object.hasOwn(overlay, "placements")) return copy;
  const placements = record(overlay.placements, "scene transition placements");
  const fallback = Object.values(placements).find(Boolean);
  (overlay as { placements: unknown }).placements = Object.fromEntries(
    variants.map((variant) => [
      variant,
      structuredClone(placements[variant] ?? fallback),
    ]),
  );
  return copy;
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object.`);
  return value as Record<string, any>;
}

function known(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
) {
  for (const key of Object.keys(value))
    if (!allowed.has(key)) fail(`${label} contains unknown field "${key}".`);
}

function fail(message: string): never {
  throw new SceneLayoutError(message);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

export function normalizeLegacySceneLayoutPresentationOrders(
  value: unknown,
): unknown {
  const source = mutableRecord(value);
  if (!source || (source.version !== 1 && source.version !== 2)) return value;
  const draft = structuredClone(source);
  const nodes = Array.isArray(draft.nodes) ? draft.nodes : undefined;
  if (!nodes || nodes.length === 0) return draft;
  const indexedNodes = nodes.map((value, index) => {
    const node = mutableRecord(value);
    if (
      !node ||
      typeof node.id !== "string" ||
      !Number.isSafeInteger(node.order)
    )
      return undefined;
    return { node, id: node.id, order: node.order as number, index };
  });
  if (indexedNodes.some((node) => node === undefined)) return draft;
  const validNodes = indexedNodes.filter(
    (node): node is NonNullable<typeof node> => node !== undefined,
  );
  const reels = mutableRecord(draft.reels);
  const main = mutableRecord(reels?.main);
  const reelOrder = main?.order;
  if (reelOrder !== undefined && !Number.isSafeInteger(reelOrder)) return draft;

  const authoredOrders = validNodes.map((node) => node.order);
  const hasArtConflict =
    new Set(authoredOrders).size !== authoredOrders.length ||
    (typeof reelOrder === "number" && authoredOrders.includes(reelOrder));
  if (hasArtConflict) {
    const { initialBackgrounds, allBackgrounds } =
      legacyBackgroundGroups(draft);
    validNodes.sort((left, right) => {
      const group = (nodeId: string): number =>
        initialBackgrounds.has(nodeId) ? 0 : allBackgrounds.has(nodeId) ? 1 : 2;
      return (
        group(left.id) - group(right.id) ||
        left.order - right.order ||
        left.index - right.index
      );
    });
    if (typeof reelOrder !== "number") {
      validNodes.forEach(({ node }, order) => {
        node.order = order;
      });
    } else {
      let reelInsertionIndex = validNodes.filter(
        (node) => node.order < reelOrder,
      ).length;
      const availableBelow = reelOrder - Number.MIN_SAFE_INTEGER;
      const availableAbove = Number.MAX_SAFE_INTEGER - reelOrder;
      reelInsertionIndex = Math.min(reelInsertionIndex, availableBelow);
      reelInsertionIndex = Math.max(
        reelInsertionIndex,
        validNodes.length - availableAbove,
      );
      const belowStart =
        reelOrder >= reelInsertionIndex ? 0 : reelOrder - reelInsertionIndex;
      validNodes.forEach(({ node }, index) => {
        node.order =
          index < reelInsertionIndex
            ? belowStart + index
            : reelOrder + 1 + index - reelInsertionIndex;
      });
    }
  }

  normalizeLegacyPopupOrders(draft, validNodes, reelOrder);
  return draft;
}

function normalizeLegacyPopupOrders(
  draft: Record<string, unknown>,
  nodes: readonly { readonly node: Record<string, unknown> }[],
  reelOrder: unknown,
): void {
  const popups = mutableRecord(draft.popups);
  if (!popups) return;
  const indexedPopups = Object.entries(popups).map(([id, value], index) => {
    const popup = mutableRecord(value);
    const order = popup?.order === undefined ? 2000 : popup.order;
    if (!popup || !Number.isSafeInteger(order)) return undefined;
    return { id, popup, order: order as number, index };
  });
  if (indexedPopups.some((popup) => popup === undefined)) return;
  const validPopups = indexedPopups.filter(
    (popup): popup is NonNullable<typeof popup> => popup !== undefined,
  );
  const artOrders = [
    ...nodes.map(({ node }) => node.order as number),
    ...(typeof reelOrder === "number" ? [reelOrder] : []),
  ];
  const maximumArtOrder = Math.max(...artOrders, Number.MIN_SAFE_INTEGER);
  const popupOrders = validPopups.map((popup) => popup.order);
  const hasConflict =
    new Set([...artOrders, ...popupOrders]).size !==
      artOrders.length + popupOrders.length ||
    popupOrders.some((order) => order <= maximumArtOrder);
  if (!hasConflict) return;
  const firstOrder = Math.max(2000, maximumArtOrder + 1);
  if (
    !Number.isSafeInteger(firstOrder) ||
    firstOrder > Number.MAX_SAFE_INTEGER - validPopups.length + 1
  )
    return;
  validPopups
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .forEach(({ popup }, index) => {
      popup.order = firstOrder + index;
    });
}

function legacyBackgroundGroups(value: Record<string, unknown>): {
  readonly initialBackgrounds: ReadonlySet<string>;
  readonly allBackgrounds: ReadonlySet<string>;
} {
  const initialBackgrounds = new Set<string>();
  const allBackgrounds = new Set<string>();
  addBackgroundIds(
    mutableRecord(value.adaptation),
    initialBackgrounds,
    allBackgrounds,
  );
  const gameModes = mutableRecord(value.gameModes);
  const initialMode = gameModes?.initialMode;
  const modes = Array.isArray(gameModes?.modes) ? gameModes.modes : [];
  for (const rawMode of modes) {
    const mode = mutableRecord(rawMode);
    if (!mode) continue;
    const target = mode.id === initialMode ? initialBackgrounds : undefined;
    addStringValues(mode.backgroundNodes, target, allBackgrounds);
  }
  return { initialBackgrounds, allBackgrounds };
}

function addBackgroundIds(
  adaptation: Record<string, unknown> | undefined,
  initial: Set<string>,
  all: Set<string>,
): void {
  if (!adaptation) return;
  addStringValues(adaptation.backgroundNode, initial, all);
  const variants = mutableRecord(adaptation.variants);
  for (const variant of Object.values(variants ?? {}))
    addStringValues(mutableRecord(variant)?.backgroundNode, initial, all);
}

function addStringValues(
  value: unknown,
  primary: Set<string> | undefined,
  all: Set<string>,
): void {
  const values =
    typeof value === "string"
      ? [value]
      : Object.values(mutableRecord(value) ?? {}).filter(
          (candidate): candidate is string => typeof candidate === "string",
        );
  for (const candidate of values) {
    primary?.add(candidate);
    all.add(candidate);
  }
}

function mutableRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
