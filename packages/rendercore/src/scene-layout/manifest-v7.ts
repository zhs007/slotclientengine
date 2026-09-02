import { SceneLayoutError } from "./errors.js";
import { parseSceneLayoutManifestV6 } from "./manifest-v6.js";
import {
  createSceneLayoutRuntimeAllocation,
  parseSceneLayoutRuntimeAllocation,
} from "./runtime-allocation.js";
import type {
  SceneLayoutGameModeV2,
  SceneLayoutGameModeV7,
  SceneLayoutMainVariant,
  SceneLayoutManifestV6,
  SceneLayoutManifestV7,
  SceneLayoutUiControlNode,
  SceneLayoutGraphicNode,
  SceneLayoutNode,
  SceneLayoutNodePlacement,
  SceneLayoutOrientationVariantId,
  SceneLayoutRuntimeAllocationV2,
} from "./types.js";

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]*$/;
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const ORIENTATIONS = ["landscape", "portrait"] as const;
const ROOT_KEYS = new Set([
  "version",
  "kind",
  "id",
  "main",
  "nodes",
  "symbolPackage",
  "symbolPackages",
  "popups",
  "runtimeResources",
  "gameModes",
  "audio",
  "eventAudio",
  "runtimeAllocation",
]);
const MODE_KEYS = new Set([
  "id",
  "main",
  "nodeStates",
  "symbolPackage",
  "awardCelebrationPopup",
  "primaryAction",
  "bgm",
]);

export function parseSceneLayoutManifestV7(
  value: unknown,
): SceneLayoutManifestV7 {
  const root = record(value, "scene layout manifest");
  known(root, ROOT_KEYS, "scene layout manifest v7");
  if (root.version !== 7) fail("scene layout manifest.version must be 7.");
  if (root.kind !== "scene-layout")
    fail('scene layout manifest.kind must be "scene-layout".');
  identifier(root.id, "scene layout manifest.id");
  if (!Object.hasOwn(root, "runtimeAllocation"))
    fail("scene layout manifest v7.runtimeAllocation is required.");

  const main = parseMainDefinition(root.main);
  const gameModes = record(root.gameModes, "scene layout gameModes");
  known(
    gameModes,
    new Set(["initialMode", "modes", "transitions"]),
    "scene layout gameModes",
  );
  if (!Array.isArray(gameModes.modes) || gameModes.modes.length === 0)
    fail("scene layout gameModes.modes must be a non-empty array.");
  const modes = gameModes.modes.map(parseMode);
  const modeIds = unique(
    modes.map((mode) => mode.id),
    "scene layout game mode id",
  );
  if (
    typeof gameModes.initialMode !== "string" ||
    !modeIds.has(gameModes.initialMode)
  )
    fail("scene layout gameModes.initialMode must reference a declared mode.");

  if (!Array.isArray(root.nodes))
    fail("scene layout manifest.nodes must be an array.");
  const scopes = new Map<string, SceneLayoutNode["scope"]>();
  const uiControlNodes = new Map<string, SceneLayoutUiControlNode>();
  const nodeIds: string[] = [];
  const nodeOrders: number[] = [];
  for (const [index, raw] of root.nodes.entries()) {
    const node = record(raw, `scene layout nodes[${index}]`);
    const hasResource = Object.hasOwn(node, "resource");
    const hasUiControl = Object.hasOwn(node, "uiControl");
    if (hasResource === hasUiControl)
      fail(
        `scene layout nodes[${index}] must declare exactly one of resource or uiControl.`,
      );
    known(
      node,
      new Set([
        "id",
        "order",
        hasResource ? "resource" : "uiControl",
        "placements",
        "scope",
      ]),
      `scene layout nodes[${index}]`,
    );
    const id = identifier(node.id, `scene layout nodes[${index}].id`);
    const order = safeInteger(node.order, `scene layout nodes[${index}].order`);
    nodeIds.push(id);
    nodeOrders.push(order);
    const scope = parseScope(node.scope, modeIds, node.placements, id);
    scopes.set(id, scope);
    if (hasUiControl)
      uiControlNodes.set(id, parseUiControlNode(node, index, id, order, scope));
  }
  unique(nodeIds, "scene layout node id");
  if (new Set(nodeOrders).size !== nodeOrders.length)
    fail("scene layout node order must be unique.");

  const validation = createV6ValidationDocument(root, main, modes);
  const parsed = parseSceneLayoutManifestV6(validation.document);
  const graphicNodes = new Map(
    parsed.nodes
      .filter((node) => node.id !== validation.syntheticNodeId)
      .map((node) => {
        const scope = scopes.get(node.id);
        return [
          node.id,
          {
            ...node,
            ...(scope ? { scope } : {}),
          },
        ] as const;
      }),
  );
  const nodes = (root.nodes as readonly unknown[]).map((raw) => {
    const id = String(record(raw, "scene layout node").id);
    return uiControlNodes.get(id) ?? graphicNodes.get(id)!;
  });
  validateV7PresentationOrders(nodes, main, parsed.popups);
  const draft = {
    version: 7 as const,
    kind: "scene-layout" as const,
    id: parsed.id,
    main,
    nodes,
    ...(parsed.symbolPackage ? { symbolPackage: parsed.symbolPackage } : {}),
    ...(parsed.symbolPackages ? { symbolPackages: parsed.symbolPackages } : {}),
    ...(parsed.popups ? { popups: parsed.popups } : {}),
    ...(parsed.runtimeResources
      ? { runtimeResources: parsed.runtimeResources }
      : {}),
    gameModes: {
      initialMode: gameModes.initialMode as string,
      modes,
      ...(parsed.gameModes.transitions
        ? { transitions: parsed.gameModes.transitions }
        : {}),
    },
    audio: parsed.audio,
    eventAudio: parsed.eventAudio,
    runtimeAllocation: root.runtimeAllocation,
  } as SceneLayoutManifestV7;
  const runtimeAllocation = parseSceneLayoutRuntimeAllocation(
    root.runtimeAllocation,
    draft,
  );
  return deepFreeze({ ...draft, runtimeAllocation });
}

function validateV7PresentationOrders(
  nodes: readonly SceneLayoutNode[],
  main: SceneLayoutManifestV7["main"],
  popups: SceneLayoutManifestV7["popups"],
): void {
  const artOrders = [
    ...nodes.map((node) => node.order),
    ...(main.order === undefined ? [] : [main.order]),
  ];
  const popupEntries = Object.entries(popups ?? {});
  const allOrders = [
    ...artOrders,
    ...popupEntries.map(([, popup]) => popup.order),
  ];
  if (new Set(allOrders).size !== allOrders.length)
    fail("scene layout node/reel/popup order must be unique.");
  const maximumArtOrder = Math.max(...artOrders, Number.MIN_SAFE_INTEGER);
  for (const [id, popup] of popupEntries)
    if (popup.order <= maximumArtOrder)
      fail(
        `scene layout popup "${id}" order must be greater than every node/reel order.`,
      );
}

export function upgradeSceneLayoutManifestV6ToV7(
  value: SceneLayoutManifestV6,
): SceneLayoutManifestV7 {
  const source = parseSceneLayoutManifestV6(value);
  const main = source.reels.main;
  if (!main) fail('legacy scene layout requires reel "main" for v7 upgrade.');
  const foreignReels = Object.keys(source.reels).filter((id) => id !== "main");
  if (foreignReels.length)
    fail(
      `legacy scene layout contains unsupported non-main reels: ${foreignReels.join(", ")}.`,
    );

  const modeVariants = new Map<
    string,
    Readonly<Record<SceneLayoutOrientationVariantId, LegacyVariant>>
  >();
  const modes: SceneLayoutGameModeV7[] = source.gameModes.modes.map((mode) => {
    const variants = Object.fromEntries(
      ORIENTATIONS.map((orientation) => {
        const legacy = legacyVariant(mode, orientation);
        const placement =
          mode.reelPlacements.main?.[
            mode.adaptation.mode === "maximized-focus" ? "default" : orientation
          ];
        const width =
          main.columns * main.cellSize.width +
          Math.max(0, main.columns - 1) * main.gap.x;
        const height =
          main.rows * main.cellSize.height +
          Math.max(0, main.rows - 1) * main.gap.y;
        const center = placement
          ? source.coordinateOrigin === "center"
            ? placement
            : {
                x: placement.x - legacy.artSize.width / 2 + width / 2,
                y: placement.y - legacy.artSize.height / 2 + height / 2,
              }
          : {
              x: legacy.focusRect.x - legacy.artSize.width / 2 + width / 2,
              y: legacy.focusRect.y - legacy.artSize.height / 2 + height / 2,
            };
        return [
          orientation,
          {
            x: center.x,
            y: center.y,
            focusRect: {
              x: legacy.focusRect.x - legacy.artSize.width / 2,
              y: legacy.focusRect.y - legacy.artSize.height / 2,
              width: legacy.focusRect.width,
              height: legacy.focusRect.height,
            },
            ...(legacy.minFocusMargin
              ? { minFocusMargin: definedMargin(legacy.minFocusMargin) }
              : {}),
          },
        ];
      }),
    ) as unknown as Readonly<
      Record<SceneLayoutOrientationVariantId, SceneLayoutMainVariant>
    >;
    modeVariants.set(
      mode.id,
      Object.fromEntries(
        ORIENTATIONS.map((orientation) => [
          orientation,
          legacyVariant(mode, orientation),
        ]),
      ) as unknown as Readonly<
        Record<SceneLayoutOrientationVariantId, LegacyVariant>
      >,
    );
    return {
      id: mode.id,
      main: { enabled: mode.reelEnabled, variants },
      nodeStates: {
        ...legacyInitialNodeStates(source, mode),
        ...structuredClone(mode.nodeStates),
      },
      ...(mode.symbolPackage ? { symbolPackage: mode.symbolPackage } : {}),
      ...(mode.awardCelebrationPopup
        ? { awardCelebrationPopup: mode.awardCelebrationPopup }
        : {}),
      ...(mode.primaryAction
        ? { primaryAction: structuredClone(mode.primaryAction) }
        : {}),
      ...(mode.bgm ? { bgm: mode.bgm } : {}),
    };
  });

  const backgroundScopes = collectLegacyBackgroundScopes(source);
  const nodes = source.nodes.map((node) => {
    const scope = backgroundScopes.get(node.id) ?? legacyOrdinaryScope(node);
    const placements = Object.fromEntries(
      ORIENTATIONS.flatMap((orientation) => {
        const sourcePlacement = legacyNodePlacement(
          source,
          node,
          orientation,
          backgroundScopes.has(node.id),
        );
        if (!sourcePlacement) return [];
        const contexts = legacyNodeContexts(
          source,
          node,
          orientation,
          backgroundScopes.get(node.id),
          modeVariants,
        );
        const converted = contexts.map((context) =>
          convertNodePlacement(
            source.coordinateOrigin ?? "top-left",
            node,
            sourcePlacement,
            context,
          ),
        );
        assertSamePlacements(node.id, orientation, converted);
        return [[orientation, converted[0]!]];
      }),
    );
    return {
      id: node.id,
      order: node.order,
      resource: structuredClone(node.resource),
      placements,
      ...(scope ? { scope } : {}),
    };
  });

  const transitions = (source.gameModes.transitions ?? []).map((transition) => {
    if ("kind" in transition.overlay) return structuredClone(transition);
    if (!("placements" in transition.overlay))
      return structuredClone(transition);
    const overlay = transition.overlay;
    const sourceMode = source.gameModes.modes.find(
      (mode) => mode.id === transition.from,
    )!;
    const placements = Object.fromEntries(
      ORIENTATIONS.map((orientation) => {
        const key =
          sourceMode.adaptation.mode === "maximized-focus"
            ? "default"
            : orientation;
        const placement = overlay.placements[key]!;
        const variant = legacyVariant(sourceMode, orientation);
        return [
          orientation,
          source.coordinateOrigin === "center"
            ? structuredClone(placement)
            : {
                ...structuredClone(placement),
                x: placement.x - variant.artSize.width / 2,
                y: placement.y - variant.artSize.height / 2,
              },
        ];
      }),
    );
    return {
      ...structuredClone(transition),
      overlay: { ...overlay, placements },
    };
  });
  const draft = {
    version: 7 as const,
    kind: "scene-layout" as const,
    id: source.id,
    main: {
      ...(main.order === undefined ? {} : { order: main.order }),
      columns: main.columns,
      rows: main.rows,
      cellSize: structuredClone(main.cellSize),
      gap: structuredClone(main.gap),
    },
    nodes,
    ...(source.symbolPackage
      ? { symbolPackage: structuredClone(source.symbolPackage) }
      : {}),
    ...(source.symbolPackages
      ? { symbolPackages: structuredClone(source.symbolPackages) }
      : {}),
    ...(source.popups ? { popups: upgradePopups(source.popups) } : {}),
    ...(source.runtimeResources
      ? { runtimeResources: structuredClone(source.runtimeResources) }
      : {}),
    gameModes: {
      initialMode: source.gameModes.initialMode,
      modes,
      ...(transitions.length ? { transitions } : {}),
    },
    audio: structuredClone(source.audio),
    eventAudio: structuredClone(source.eventAudio),
    runtimeAllocation: undefined as never,
  } as SceneLayoutManifestV7;
  return parseSceneLayoutManifestV7({
    ...draft,
    runtimeAllocation: createSceneLayoutRuntimeAllocation(draft),
  });
}

function legacyInitialNodeStates(
  manifest: SceneLayoutManifestV6,
  mode: SceneLayoutGameModeV2,
): Readonly<Record<string, string>> {
  const backgroundIds = new Set(Object.values(mode.backgroundNodes));
  return Object.fromEntries(
    manifest.nodes.flatMap((node) => {
      if (
        node.resource.kind !== "spine" ||
        !("stateMachine" in node.resource) ||
        (node.gameMode !== undefined && node.gameMode !== mode.id)
      )
        return [];
      const active =
        backgroundIds.has(node.id) || Object.keys(node.placements).length > 0;
      return active ? [[node.id, node.resource.stateMachine.initialState]] : [];
    }),
  );
}

interface LegacyVariant {
  readonly artSize: { readonly width: number; readonly height: number };
  readonly focusRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly minFocusMargin?: {
    readonly top?: number;
    readonly right?: number;
    readonly bottom?: number;
    readonly left?: number;
  };
}

function definedMargin(
  margin: NonNullable<LegacyVariant["minFocusMargin"]>,
): NonNullable<SceneLayoutMainVariant["minFocusMargin"]> {
  return Object.fromEntries(
    Object.entries(margin).filter((entry): entry is [string, number] =>
      Number.isFinite(entry[1]),
    ),
  );
}

function legacyVariant(
  mode: SceneLayoutGameModeV2,
  orientation: SceneLayoutOrientationVariantId,
): LegacyVariant {
  return mode.adaptation.mode === "maximized-focus"
    ? mode.adaptation
    : mode.adaptation.variants[orientation];
}

function parseMainDefinition(value: unknown): SceneLayoutManifestV7["main"] {
  const main = record(value, "scene layout main");
  known(
    main,
    new Set(["order", "columns", "rows", "cellSize", "gap"]),
    "scene layout main",
  );
  const cellSize = parseSize(main.cellSize, "scene layout main.cellSize");
  const gap = record(main.gap, "scene layout main.gap");
  known(gap, new Set(["x", "y"]), "scene layout main.gap");
  return {
    ...(main.order === undefined
      ? {}
      : { order: safeInteger(main.order, "scene layout main.order") }),
    columns: positiveSafeInteger(main.columns, "scene layout main.columns"),
    rows: positiveSafeInteger(main.rows, "scene layout main.rows"),
    cellSize,
    gap: {
      x: nonNegative(gap.x, "scene layout main.gap.x"),
      y: nonNegative(gap.y, "scene layout main.gap.y"),
    },
  };
}

function parseMode(value: unknown, index: number): SceneLayoutGameModeV7 {
  const label = `scene layout gameModes.modes[${index}]`;
  const mode = record(value, label);
  known(mode, MODE_KEYS, label);
  const main = record(mode.main, `${label}.main`);
  known(main, new Set(["enabled", "variants"]), `${label}.main`);
  if (typeof main.enabled !== "boolean")
    fail(`${label}.main.enabled must be a boolean.`);
  const variants = record(main.variants, `${label}.main.variants`);
  known(variants, new Set(ORIENTATIONS), `${label}.main.variants`);
  const parsedVariants = Object.fromEntries(
    ORIENTATIONS.map((orientation) => {
      if (!Object.hasOwn(variants, orientation))
        fail(`${label}.main.variants.${orientation} is required.`);
      const variant = record(
        variants[orientation],
        `${label}.main.variants.${orientation}`,
      );
      known(
        variant,
        new Set(["x", "y", "focusRect", "minFocusMargin"]),
        `${label}.main.variants.${orientation}`,
      );
      return [
        orientation,
        {
          x: finite(variant.x, `${label}.main.variants.${orientation}.x`),
          y: finite(variant.y, `${label}.main.variants.${orientation}.y`),
          focusRect: parseRect(
            variant.focusRect,
            `${label}.main.variants.${orientation}.focusRect`,
          ),
          ...(variant.minFocusMargin === undefined
            ? {}
            : {
                minFocusMargin: parseMargin(
                  variant.minFocusMargin,
                  `${label}.main.variants.${orientation}.minFocusMargin`,
                ),
              }),
        },
      ];
    }),
  ) as unknown as SceneLayoutGameModeV7["main"]["variants"];
  const nodeStates = record(mode.nodeStates, `${label}.nodeStates`);
  for (const [id, state] of Object.entries(nodeStates)) {
    identifier(id, `${label}.nodeStates id`);
    if (typeof state !== "string" || state.length === 0)
      fail(`${label}.nodeStates.${id} must be a non-empty string.`);
  }
  return {
    ...(structuredClone(mode) as unknown as SceneLayoutGameModeV7),
    id: stateIdentifier(mode.id, `${label}.id`),
    main: { enabled: main.enabled, variants: parsedVariants },
    nodeStates: structuredClone(nodeStates) as Readonly<Record<string, string>>,
  };
}

function parseScope(
  value: unknown,
  modeIds: ReadonlySet<string>,
  placementsValue: unknown,
  nodeId: string,
): SceneLayoutNode["scope"] {
  if (value === undefined) return undefined;
  const scope = record(value, `scene layout node "${nodeId}".scope`);
  if (Object.keys(scope).length === 0)
    fail(`scene layout node "${nodeId}".scope must not be empty.`);
  const placements = record(
    placementsValue,
    `scene layout node "${nodeId}".placements`,
  );
  const parsed: Record<string, readonly SceneLayoutOrientationVariantId[]> = {};
  for (const [modeId, rawVariants] of Object.entries(scope)) {
    if (!modeIds.has(modeId))
      fail(
        `scene layout node "${nodeId}".scope references unknown mode "${modeId}".`,
      );
    if (!Array.isArray(rawVariants) || rawVariants.length === 0)
      fail(`scene layout node "${nodeId}".scope.${modeId} must not be empty.`);
    const variants = rawVariants.map((raw) => {
      if (raw !== "landscape" && raw !== "portrait")
        fail(
          `scene layout node "${nodeId}".scope.${modeId} has invalid orientation.`,
        );
      if (!Object.hasOwn(placements, raw))
        fail(
          `scene layout node "${nodeId}".scope.${modeId} requires ${raw} placement.`,
        );
      return raw;
    });
    if (new Set(variants).size !== variants.length)
      fail(`scene layout node "${nodeId}".scope.${modeId} must be unique.`);
    parsed[modeId] = Object.freeze(variants);
  }
  return deepFreeze(parsed);
}

function parseUiControlNode(
  node: Record<string, unknown>,
  index: number,
  id: string,
  order: number,
  scope: SceneLayoutNode["scope"],
): SceneLayoutUiControlNode {
  const label = `scene layout nodes[${index}]`;
  const placementsRecord = record(node.placements, `${label}.placements`);
  known(placementsRecord, new Set(ORIENTATIONS), `${label}.placements`);
  const placements = Object.fromEntries(
    Object.entries(placementsRecord).map(([orientation, value]) => [
      orientation,
      parseNodePlacementV7(value, `${label}.placements.${orientation}`),
    ]),
  );
  if (!placements.landscape && !placements.portrait)
    fail(`${label} must have a landscape or portrait placement.`);
  const control = record(node.uiControl, `${label}.uiControl`);
  let uiControl;
  if (control.kind === "radio") {
    known(control, new Set(["kind", "off", "on"]), `${label}.uiControl`);
    const off = parseUiControlImage(control.off, `${label}.uiControl.off`);
    const on = parseUiControlImage(control.on, `${label}.uiControl.on`);
    if (off.path === on.path)
      fail(`${label}.uiControl off/on paths must be different.`);
    if (off.size.width !== on.size.width || off.size.height !== on.size.height)
      fail(`${label}.uiControl off/on sizes must be equal.`);
    uiControl = { kind: "radio" as const, off, on };
  } else if (control.kind === "step-slider") {
    known(
      control,
      new Set(["kind", "track", "thumb", "steps", "snapDurationSeconds"]),
      `${label}.uiControl`,
    );
    const track = parseUiControlImage(
      control.track,
      `${label}.uiControl.track`,
    );
    const thumb = parseUiControlImage(
      control.thumb,
      `${label}.uiControl.thumb`,
    );
    if (track.path === thumb.path)
      fail(`${label}.uiControl track/thumb paths must be different.`);
    if (track.size.width <= thumb.size.width)
      fail(`${label}.uiControl track width must be greater than thumb width.`);
    const steps = safeInteger(control.steps, `${label}.uiControl.steps`);
    if (steps < 2) fail(`${label}.uiControl.steps must be at least 2.`);
    const snapDurationSeconds = positive(
      control.snapDurationSeconds,
      `${label}.uiControl.snapDurationSeconds`,
    );
    uiControl = {
      kind: "step-slider" as const,
      track,
      thumb,
      steps,
      snapDurationSeconds,
    };
  } else {
    fail(`${label}.uiControl.kind must be radio or step-slider.`);
  }
  return deepFreeze({
    id,
    order,
    ...(scope ? { scope } : {}),
    placements,
    uiControl,
  });
}

function parseUiControlImage(value: unknown, label: string) {
  const image = record(value, label);
  known(image, new Set(["kind", "path", "size"]), label);
  if (image.kind !== "image") fail(`${label}.kind must be image.`);
  return deepFreeze({
    kind: "image" as const,
    path: localImagePath(image.path, `${label}.path`),
    size: parseSize(image.size, `${label}.size`),
  });
}

function parseNodePlacementV7(
  value: unknown,
  label: string,
): SceneLayoutNodePlacement {
  const placement = record(value, label);
  known(placement, new Set(["x", "y", "scale", "rotation", "center"]), label);
  const center =
    placement.center === undefined
      ? { x: 0.5, y: 0.5 }
      : parseCenter(placement.center, `${label}.center`);
  return deepFreeze({
    x: finite(placement.x, `${label}.x`),
    y: finite(placement.y, `${label}.y`),
    scale: positive(placement.scale, `${label}.scale`),
    rotation:
      placement.rotation === undefined
        ? 0
        : finite(placement.rotation, `${label}.rotation`),
    center,
  });
}

function parseCenter(value: unknown, label: string) {
  const center = record(value, label);
  known(center, new Set(["x", "y"]), label);
  const x = finite(center.x, `${label}.x`);
  const y = finite(center.y, `${label}.y`);
  if (x < 0 || x > 1 || y < 0 || y > 1)
    fail(`${label} values must be between 0 and 1.`);
  return { x, y };
}

function localImagePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim())
    fail(`${label} must be a non-empty string.`);
  if (
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    /^[a-z]+:/i.test(value)
  )
    fail(`${label} must be a relative local path.`);
  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        !PATH_SEGMENT.test(segment) || segment === "." || segment === "..",
    )
  )
    fail(`${label} contains an invalid path segment.`);
  const extension = value.slice(value.lastIndexOf(".")).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension))
    fail(`${label} has an unsupported extension.`);
  return value;
}

function createV6ValidationDocument(
  root: Record<string, unknown>,
  main: SceneLayoutManifestV7["main"],
  modes: readonly SceneLayoutGameModeV7[],
): {
  readonly document: SceneLayoutManifestV6;
  readonly syntheticNodeId: string;
} {
  const rawNodes = (root.nodes as readonly unknown[]).filter((raw) =>
    Object.hasOwn(record(raw, "scene layout node"), "resource"),
  );
  const ids = new Set(
    rawNodes.map((raw) => String(record(raw, "scene layout node").id)),
  );
  let syntheticNodeId = "v7-validation-background";
  while (ids.has(syntheticNodeId)) syntheticNodeId += "-x";
  const orders = [
    ...rawNodes.map((raw) => record(raw, "scene layout node").order),
    ...(main.order === undefined ? [] : [main.order]),
  ].filter(
    (value): value is number =>
      typeof value === "number" && Number.isSafeInteger(value),
  );
  const syntheticOrder = Math.min(...orders, 0) - 1;
  if (!Number.isSafeInteger(syntheticOrder))
    fail(
      "scene layout v7 cannot allocate validation order below MIN_SAFE_INTEGER.",
    );
  const nodes = [
    ...rawNodes.map((raw) => {
      const node = structuredClone(record(raw, "scene layout node"));
      delete node.scope;
      const resource = record(node.resource, "scene layout node resource");
      return node;
    }),
    {
      id: syntheticNodeId,
      order: syntheticOrder,
      resource: {
        kind: "image",
        path: "v7-validation-background.png",
        size: { width: 1, height: 1 },
      },
      placements: {
        landscape: { x: 0, y: 0, scale: 1 },
        portrait: { x: 0, y: 0, scale: 1 },
      },
    },
  ];
  const draft = {
    version: 6 as const,
    kind: "scene-layout" as const,
    id: root.id,
    coordinateOrigin: "center" as const,
    nodes,
    reels: { main },
    ...(root.symbolPackage ? { symbolPackage: root.symbolPackage } : {}),
    ...(root.symbolPackages ? { symbolPackages: root.symbolPackages } : {}),
    ...(root.popups ? { popups: root.popups } : {}),
    ...(root.runtimeResources
      ? { runtimeResources: root.runtimeResources }
      : {}),
    gameModes: {
      initialMode: record(root.gameModes, "scene layout gameModes").initialMode,
      modes: modes.map((mode) => ({
        id: mode.id,
        adaptation: {
          mode: "orientation-focus" as const,
          variants: Object.fromEntries(
            ORIENTATIONS.map((orientation) => [
              orientation,
              {
                artSize: { width: 1, height: 1 },
                focusRect: {
                  ...mode.main.variants[orientation].focusRect,
                  x: mode.main.variants[orientation].focusRect.x + 0.5,
                  y: mode.main.variants[orientation].focusRect.y + 0.5,
                },
                frameFocusRect: {
                  width: mode.main.variants[orientation].focusRect.width,
                  height: mode.main.variants[orientation].focusRect.height,
                },
                ...(mode.main.variants[orientation].minFocusMargin
                  ? {
                      minFocusMargin:
                        mode.main.variants[orientation].minFocusMargin,
                    }
                  : {}),
              },
            ]),
          ),
        },
        reelEnabled: mode.main.enabled,
        reelPlacements: mode.main.enabled
          ? {
              main: Object.fromEntries(
                ORIENTATIONS.map((orientation) => [
                  orientation,
                  {
                    x: mode.main.variants[orientation].x,
                    y: mode.main.variants[orientation].y,
                  },
                ]),
              ),
            }
          : {},
        backgroundNodes: {
          landscape: syntheticNodeId,
          portrait: syntheticNodeId,
        },
        nodeStates: mode.nodeStates,
        ...(mode.symbolPackage ? { symbolPackage: mode.symbolPackage } : {}),
        ...(mode.awardCelebrationPopup
          ? { awardCelebrationPopup: mode.awardCelebrationPopup }
          : {}),
        ...(mode.primaryAction ? { primaryAction: mode.primaryAction } : {}),
        ...(mode.bgm ? { bgm: mode.bgm } : {}),
      })),
      ...(record(root.gameModes, "scene layout gameModes").transitions
        ? {
            transitions: record(root.gameModes, "scene layout gameModes")
              .transitions,
          }
        : {}),
    },
    audio: root.audio,
    eventAudio: root.eventAudio,
    runtimeAllocation: undefined as never,
  } as unknown as SceneLayoutManifestV6;
  return {
    document: {
      ...draft,
      runtimeAllocation: createSceneLayoutRuntimeAllocation(
        draft,
      ) as SceneLayoutRuntimeAllocationV2,
    },
    syntheticNodeId,
  };
}

function collectLegacyBackgroundScopes(manifest: SceneLayoutManifestV6) {
  const result = new Map<
    string,
    Record<string, SceneLayoutOrientationVariantId[]>
  >();
  for (const mode of manifest.gameModes.modes)
    for (const orientation of ORIENTATIONS) {
      const key =
        mode.adaptation.mode === "maximized-focus" ? "default" : orientation;
      const nodeId = mode.backgroundNodes[key];
      if (!nodeId) continue;
      const scope = result.get(nodeId) ?? {};
      (scope[mode.id] ??= []).push(orientation);
      result.set(nodeId, scope);
    }
  return result;
}

function legacyOrdinaryScope(
  node: SceneLayoutGraphicNode,
): SceneLayoutNode["scope"] {
  if (!node.gameMode) return undefined;
  const variants = ORIENTATIONS.filter(
    (orientation) => node.placements[orientation],
  );
  return { [node.gameMode]: variants };
}

function legacyNodePlacement(
  manifest: SceneLayoutManifestV6,
  node: SceneLayoutGraphicNode,
  orientation: SceneLayoutOrientationVariantId,
  background: boolean,
): SceneLayoutNodePlacement | undefined {
  if (!background) return node.placements[orientation];
  for (const mode of manifest.gameModes.modes) {
    const key =
      mode.adaptation.mode === "maximized-focus" ? "default" : orientation;
    if (mode.backgroundNodes[key] === node.id) return node.placements[key];
  }
  return undefined;
}

function legacyNodeContexts(
  manifest: SceneLayoutManifestV6,
  node: SceneLayoutGraphicNode,
  orientation: SceneLayoutOrientationVariantId,
  backgroundScope:
    Record<string, SceneLayoutOrientationVariantId[]> | undefined,
  modeVariants: ReadonlyMap<
    string,
    Readonly<Record<SceneLayoutOrientationVariantId, LegacyVariant>>
  >,
): readonly LegacyVariant[] {
  const modeIds = backgroundScope
    ? Object.entries(backgroundScope)
        .filter(([, variants]) => variants.includes(orientation))
        .map(([id]) => id)
    : node.gameMode
      ? [node.gameMode]
      : manifest.gameModes.modes.map((mode) => mode.id);
  return modeIds.map((id) => modeVariants.get(id)![orientation]);
}

function convertNodePlacement(
  origin: "top-left" | "center",
  node: SceneLayoutGraphicNode,
  placement: SceneLayoutNodePlacement,
  variant: LegacyVariant,
): SceneLayoutNodePlacement {
  if (origin === "center") return structuredClone(placement);
  const base = {
    ...structuredClone(placement),
    x: placement.x - variant.artSize.width / 2,
    y: placement.y - variant.artSize.height / 2,
  };
  if (node.resource.kind === "image")
    return {
      ...base,
      x: base.x + (node.resource.size.width * placement.scale) / 2,
      y: base.y + (node.resource.size.height * placement.scale) / 2,
    };
  return base;
}

function assertSamePlacements(
  nodeId: string,
  orientation: SceneLayoutOrientationVariantId,
  placements: readonly SceneLayoutNodePlacement[],
): void {
  if (!placements.length)
    fail(`scene layout node "${nodeId}" has no ${orientation} context.`);
  const expected = JSON.stringify(placements[0]);
  if (placements.some((placement) => JSON.stringify(placement) !== expected))
    fail(
      `legacy scene layout node "${nodeId}" cannot be losslessly centered across ${orientation} modes with different art sizes.`,
    );
}

function upgradePopups(popups: NonNullable<SceneLayoutManifestV6["popups"]>) {
  return Object.fromEntries(
    Object.entries(popups).map(([id, popup]) => {
      const fallback = popup.placements.default;
      return [
        id,
        {
          ...structuredClone(popup),
          placements: Object.fromEntries(
            ORIENTATIONS.map((orientation) => [
              orientation,
              structuredClone(popup.placements[orientation] ?? fallback),
            ]),
          ),
        },
      ];
    }),
  );
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function known(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value))
    if (!keys.has(key)) fail(`${label}.${key} is unknown.`);
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value))
    fail(`${label} must be a lowercase identifier.`);
  return value;
}

function stateIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(value))
    fail(`${label} must be an ASCII state identifier.`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(`${label} must be finite.`);
  return value;
}

function positive(value: unknown, label: string): number {
  const parsed = finite(value, label);
  if (parsed <= 0) fail(`${label} must be positive.`);
  return parsed;
}

function nonNegative(value: unknown, label: string): number {
  const parsed = finite(value, label);
  if (parsed < 0) fail(`${label} must be non-negative.`);
  return parsed;
}

function safeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    fail(`${label} must be a safe integer.`);
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  const parsed = safeInteger(value, label);
  if (parsed <= 0) fail(`${label} must be positive.`);
  return parsed;
}

function parseSize(value: unknown, label: string) {
  const size = record(value, label);
  known(size, new Set(["width", "height"]), label);
  return {
    width: positive(size.width, `${label}.width`),
    height: positive(size.height, `${label}.height`),
  };
}

function parseRect(value: unknown, label: string) {
  const rect = record(value, label);
  known(rect, new Set(["x", "y", "width", "height"]), label);
  return {
    x: finite(rect.x, `${label}.x`),
    y: finite(rect.y, `${label}.y`),
    width: positive(rect.width, `${label}.width`),
    height: positive(rect.height, `${label}.height`),
  };
}

function parseMargin(value: unknown, label: string) {
  const margin = record(value, label);
  known(margin, new Set(["top", "right", "bottom", "left"]), label);
  const result = Object.fromEntries(
    (["top", "right", "bottom", "left"] as const).flatMap((side) =>
      margin[side] === undefined
        ? []
        : [[side, nonNegative(margin[side], `${label}.${side}`)]],
    ),
  );
  if (Object.keys(result).length === 0)
    fail(`${label} must declare at least one side.`);
  return result;
}

function unique(values: readonly string[], label: string): ReadonlySet<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (result.has(value)) fail(`${label} must be unique: ${value}.`);
    result.add(value);
  }
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

function fail(message: string): never {
  throw new SceneLayoutError(message);
}
