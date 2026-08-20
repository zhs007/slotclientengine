import { SceneLayoutError } from "./errors.js";
import { collectAudioAssetPaths } from "@slotclientengine/audiocore/data";
import type {
  OrientationFocusSceneLayoutVariant,
  SceneLayoutAdaptation,
  SceneLayoutManifestV1,
  SceneLayoutManifest,
  SceneLayoutNode,
  SceneLayoutNodePlacement,
  SceneLayoutNodeResourceSpec,
  SceneLayoutReelGrid,
  SceneLayoutSpineStateMachine,
  SceneLayoutSymbolPackageBinding,
  SceneLayoutPopupBinding,
  SceneLayoutGameModes,
  SceneLayoutGameModeTransition,
  SceneLayoutRuntimeResourceSpec,
  SceneLayoutScaledPlacement,
  SceneLayoutVariantId,
} from "./types.js";
import {
  materializeInitialSceneLayoutManifest,
  normalizeLegacySceneLayoutPresentationOrders,
  parseSceneLayoutManifestV2,
} from "./manifest-v2.js";
import { upgradeSceneLayoutManifestToLatest } from "./manifest-v3.js";

const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]*$/;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const DEFAULT_SCENE_LAYOUT_POPUP_ORDER = 2000;

export function parseSceneLayoutManifest(
  value: unknown,
): SceneLayoutManifestV1 {
  const sourceRecord = readRecord(value, "scene layout manifest");
  if (sourceRecord.version === 3 || sourceRecord.version === 4)
    return materializeInitialSceneLayoutManifest(
      upgradeSceneLayoutManifestToLatest(value),
    );
  const normalized = normalizeLegacySceneLayoutPresentationOrders(value);
  const record = readRecord(normalized, "scene layout manifest");
  if (record.version === 2)
    return materializeInitialSceneLayoutManifest(
      parseSceneLayoutManifestV2(normalized),
    );
  return parseSceneLayoutManifestV1(normalized);
}

export function parseSceneLayoutManifestDocument(
  value: unknown,
): SceneLayoutManifest {
  const sourceRecord = readRecord(value, "scene layout manifest");
  if (sourceRecord.version === 3 || sourceRecord.version === 4)
    return upgradeSceneLayoutManifestToLatest(value);
  const normalized = normalizeLegacySceneLayoutPresentationOrders(value);
  const record = readRecord(normalized, "scene layout manifest");
  if (record.version === 2) return parseSceneLayoutManifestV2(normalized);
  return parseSceneLayoutManifestV1(normalized);
}

export function parseSceneLayoutManifestV1(
  value: unknown,
): SceneLayoutManifestV1 {
  const record = readRecord(value, "scene layout manifest");
  known(
    record,
    [
      "version",
      "kind",
      "id",
      "coordinateOrigin",
      "adaptation",
      "nodes",
      "reels",
      "symbolPackage",
      "symbolPackages",
      "popups",
      "runtimeResources",
      "gameModes",
    ],
    "scene layout manifest",
  );
  if (record.version !== 1) fail("scene layout manifest.version must be 1.");
  if (record.kind !== "scene-layout")
    fail('scene layout manifest.kind must be "scene-layout".');
  const id = identifier(record.id, "scene layout manifest.id");
  const coordinateOrigin =
    record.coordinateOrigin === undefined
      ? undefined
      : parseCoordinateOrigin(record.coordinateOrigin);
  const adaptation = parseAdaptation(record.adaptation);
  if (!Array.isArray(record.nodes) || record.nodes.length === 0) {
    fail("scene layout manifest.nodes must be a non-empty array.");
  }
  const nodes = record.nodes
    .map((node, index) => parseNode(node, index, adaptation.mode))
    .sort((left, right) => left.order - right.order);
  const nodeIds = unique(
    nodes.map((node) => node.id),
    "scene layout node id",
  );
  unique(
    nodes.map((node) => node.order),
    "scene layout node order",
  );
  const reelsRecord = readRecord(record.reels, "scene layout manifest.reels");
  if (Object.keys(reelsRecord).length === 0)
    fail("scene layout manifest.reels must not be empty.");
  const reels: Record<string, SceneLayoutReelGrid> = {};
  for (const [reelId, raw] of Object.entries(reelsRecord)) {
    identifier(reelId, "scene layout reel id");
    reels[reelId] = parseReel(raw, reelId, adaptation.mode);
  }
  const symbolPackage =
    record.symbolPackage === undefined
      ? undefined
      : parseSymbolPackageBinding(record.symbolPackage);
  const symbolPackages =
    record.symbolPackages === undefined
      ? undefined
      : parseSymbolPackageBindings(record.symbolPackages);
  if (symbolPackage && symbolPackages)
    fail(
      "scene layout manifest must not declare both symbolPackage and symbolPackages.",
    );
  if (symbolPackage || symbolPackages) {
    const main = reels.main;
    if (!main)
      fail('symbol package bindings require scene layout reel "main".');
    if (main.order === undefined)
      fail(
        "scene layout reels.main.order is required with symbol package bindings.",
      );
    unique(
      [...nodes.map((node) => node.order), main.order],
      "scene layout node/reel order",
    );
  }
  const popups =
    record.popups === undefined
      ? undefined
      : parsePopupBindings(record.popups, adaptation.mode);
  validatePresentationOrders(nodes, reels.main, popups);
  const runtimeResources =
    record.runtimeResources === undefined
      ? undefined
      : parseRuntimeResources(record.runtimeResources);
  const gameModes =
    record.gameModes === undefined
      ? undefined
      : parseGameModes(
          record.gameModes,
          adaptation,
          nodes,
          symbolPackage,
          symbolPackages,
          popups,
        );
  if (!gameModes && nodes.some((node) => node.gameMode !== undefined))
    fail("scene layout node gameMode requires gameModes.");
  if (symbolPackages && !gameModes)
    fail("scene layout symbolPackages requires gameModes.");
  validateReferences(adaptation, nodes, nodeIds);
  validatePathClosure(nodes, runtimeResources);
  return deepFreeze({
    version: 1,
    kind: "scene-layout",
    id,
    ...(coordinateOrigin ? { coordinateOrigin } : {}),
    adaptation,
    nodes,
    reels,
    ...(symbolPackage ? { symbolPackage } : {}),
    ...(symbolPackages ? { symbolPackages } : {}),
    ...(popups ? { popups } : {}),
    ...(runtimeResources ? { runtimeResources } : {}),
    ...(gameModes ? { gameModes } : {}),
  });
}

export function collectSceneLayoutAssetPaths(
  manifest: SceneLayoutManifest,
): readonly string[] {
  const parsed = parseSceneLayoutManifestDocument(manifest);
  const paths = new Set<string>();
  if (parsed.version === 4)
    for (const path of collectAudioAssetPaths(parsed.audio)) paths.add(path);
  for (const node of parsed.nodes) {
    const resource = node.resource;
    if (resource.kind === "image") paths.add(resource.path);
    else if (resource.kind === "image-string") paths.add(resource.manifest);
    else if (resource.kind === "vni") paths.add(resource.project);
    else {
      paths.add(resource.skeleton);
      paths.add(resource.atlas);
      for (const path of Object.values(resource.textures)) paths.add(path);
    }
  }
  if (parsed.symbolPackage) paths.add(parsed.symbolPackage.manifest);
  for (const binding of Object.values(parsed.symbolPackages ?? {}))
    paths.add(binding.manifest);
  for (const popup of Object.values(parsed.popups ?? {}))
    paths.add(popup.manifest);
  for (const resource of Object.values(parsed.runtimeResources ?? {})) {
    if (resource.kind === "image" || resource.kind === "video")
      paths.add(resource.path);
    else if (resource.kind === "image-string") paths.add(resource.manifest);
    else if (resource.kind === "vni") paths.add(resource.project);
    else {
      paths.add(resource.skeleton);
      paths.add(resource.atlas);
      for (const path of Object.values(resource.textures)) paths.add(path);
    }
  }
  for (const transition of parsed.gameModes?.transitions ?? []) {
    if ("kind" in transition.overlay) continue;
    const resource = transition.overlay.resource;
    if (resource.kind === "video") paths.add(resource.path);
    else {
      paths.add(resource.skeleton);
      paths.add(resource.atlas);
      for (const path of Object.values(resource.textures)) paths.add(path);
    }
  }
  return Object.freeze(
    [...paths].sort((left, right) => left.localeCompare(right, "en")),
  );
}

function parseAdaptation(value: unknown): SceneLayoutAdaptation {
  const record = readRecord(value, "scene layout adaptation");
  if (record.mode === "maximized-focus") {
    known(
      record,
      ["mode", "artSize", "focusRect", "backgroundNode"],
      "scene layout adaptation",
    );
    const artSize = size(record.artSize, "adaptation.artSize");
    const focusRect = rect(record.focusRect, "adaptation.focusRect");
    return deepFreeze({
      mode: "maximized-focus" as const,
      artSize,
      focusRect,
      backgroundNode: identifier(
        record.backgroundNode,
        "adaptation.backgroundNode",
      ),
    });
  }
  if (record.mode === "orientation-focus") {
    known(record, ["mode", "variants"], "scene layout adaptation");
    const variantsRecord = readRecord(record.variants, "adaptation.variants");
    known(variantsRecord, ["landscape", "portrait"], "adaptation.variants");
    if (
      !Object.hasOwn(variantsRecord, "landscape") ||
      !Object.hasOwn(variantsRecord, "portrait")
    ) {
      fail("adaptation.variants must include landscape and portrait.");
    }
    return deepFreeze({
      mode: "orientation-focus" as const,
      variants: {
        landscape: parseOrientationVariant(
          variantsRecord.landscape,
          "landscape",
        ),
        portrait: parseOrientationVariant(variantsRecord.portrait, "portrait"),
      },
    });
  }
  fail(
    'scene layout adaptation.mode must be "maximized-focus" or "orientation-focus".',
  );
}

function parseOrientationVariant(
  value: unknown,
  id: string,
): OrientationFocusSceneLayoutVariant {
  const label = `adaptation.variants.${id}`;
  const record = readRecord(value, label);
  known(
    record,
    [
      "artSize",
      "focusRect",
      "frameFocusRect",
      "minFocusMargin",
      "backgroundNode",
    ],
    label,
  );
  const artSize = size(record.artSize, `${label}.artSize`);
  const focusRect = rect(record.focusRect, `${label}.focusRect`);
  const frameFocusRect = size(record.frameFocusRect, `${label}.frameFocusRect`);
  const minFocusMargin =
    record.minFocusMargin === undefined
      ? undefined
      : margin(record.minFocusMargin, `${label}.minFocusMargin`);
  return deepFreeze({
    artSize,
    focusRect,
    frameFocusRect,
    ...(minFocusMargin ? { minFocusMargin } : {}),
    backgroundNode: identifier(
      record.backgroundNode,
      `${label}.backgroundNode`,
    ),
  });
}

function parseNode(
  value: unknown,
  index: number,
  mode: SceneLayoutAdaptation["mode"],
): SceneLayoutNode {
  const label = `scene layout node[${index}]`;
  const record = readRecord(value, label);
  known(record, ["id", "order", "gameMode", "resource", "placements"], label);
  const placementsRecord = readRecord(record.placements, `${label}.placements`);
  const allowed =
    mode === "maximized-focus" ? ["default"] : ["landscape", "portrait"];
  known(placementsRecord, allowed, `${label}.placements`);
  const placements: Partial<
    Record<SceneLayoutVariantId, SceneLayoutNodePlacement>
  > = {};
  for (const [variantId, placement] of Object.entries(placementsRecord)) {
    placements[variantId as SceneLayoutVariantId] = parseNodePlacement(
      placement,
      `${label}.placements.${variantId}`,
    );
  }
  if (mode === "maximized-focus" && !placements.default)
    fail(`${label}.placements.default is required.`);
  if (
    mode === "orientation-focus" &&
    !placements.landscape &&
    !placements.portrait
  ) {
    fail(`${label} must have a landscape or portrait placement.`);
  }
  return deepFreeze({
    id: identifier(record.id, `${label}.id`),
    order: safeInteger(record.order, `${label}.order`),
    ...(record.gameMode === undefined
      ? {}
      : { gameMode: stateIdentifier(record.gameMode, `${label}.gameMode`) }),
    resource: parseResource(record.resource, label),
    placements,
  });
}

function parseNodePlacement(
  value: unknown,
  label: string,
): SceneLayoutNodePlacement {
  const record = readRecord(value, label);
  known(record, ["x", "y", "scale", "rotation", "center"], label);
  const center =
    record.center === undefined
      ? { x: 0.5, y: 0.5 }
      : parseNodeCenter(record.center, `${label}.center`);
  return deepFreeze({
    x: finite(record.x, `${label}.x`),
    y: finite(record.y, `${label}.y`),
    scale: positive(record.scale, `${label}.scale`),
    rotation:
      record.rotation === undefined
        ? 0
        : finite(record.rotation, `${label}.rotation`),
    center,
  });
}

function parseNodeCenter(
  value: unknown,
  label: string,
): { readonly x: number; readonly y: number } {
  const record = readRecord(value, label);
  known(record, ["x", "y"], label);
  return deepFreeze({
    x: unit(record.x, `${label}.x`),
    y: unit(record.y, `${label}.y`),
  });
}

function parseScaledPlacement(
  value: unknown,
  label: string,
): SceneLayoutScaledPlacement {
  const record = readRecord(value, label);
  known(record, ["x", "y", "scale"], label);
  return deepFreeze({
    x: finite(record.x, `${label}.x`),
    y: finite(record.y, `${label}.y`),
    scale: positive(record.scale, `${label}.scale`),
  });
}

function parseResource(
  value: unknown,
  nodeLabel: string,
): SceneLayoutNodeResourceSpec {
  const label = `${nodeLabel}.resource`;
  const record = readRecord(value, label);
  if (record.kind === "image") {
    known(record, ["kind", "path", "size"], label);
    const path = localPath(record.path, `${label}.path`, IMAGE_EXTENSIONS);
    return deepFreeze({
      kind: "image" as const,
      path,
      size: size(record.size, `${label}.size`),
    });
  }
  if (record.kind === "spine") {
    const hasStateMachine = Object.hasOwn(record, "stateMachine");
    known(
      record,
      hasStateMachine
        ? ["kind", "skeleton", "atlas", "textures", "stateMachine"]
        : ["kind", "skeleton", "atlas", "textures", "defaultAnimation", "loop"],
      label,
    );
    const skeleton = localPath(
      record.skeleton,
      `${label}.skeleton`,
      new Set([".json"]),
    );
    const atlas = localPath(
      record.atlas,
      `${label}.atlas`,
      new Set([".atlas"]),
    );
    const texturesRecord = readRecord(record.textures, `${label}.textures`);
    if (Object.keys(texturesRecord).length === 0)
      fail(`${label}.textures must not be empty.`);
    const textures: Record<string, string> = {};
    for (const [page, rawPath] of Object.entries(texturesRecord)) {
      if (!PATH_SEGMENT.test(page))
        fail(`${label}.textures page "${page}" is invalid.`);
      const path = localPath(
        rawPath,
        `${label}.textures.${page}`,
        IMAGE_EXTENSIONS,
      );
      textures[page] = path;
    }
    unique([skeleton, atlas], `${label} path`);
    if (hasStateMachine) {
      return deepFreeze({
        kind: "spine" as const,
        skeleton,
        atlas,
        textures,
        stateMachine: parseSpineStateMachine(
          record.stateMachine,
          `${label}.stateMachine`,
        ),
      });
    }
    if (typeof record.loop !== "boolean")
      fail(`${label}.loop must be a boolean.`);
    return deepFreeze({
      kind: "spine" as const,
      skeleton,
      atlas,
      textures,
      defaultAnimation: nonEmpty(
        record.defaultAnimation,
        `${label}.defaultAnimation`,
      ),
      loop: record.loop,
    });
  }
  if (record.kind === "image-string") {
    known(record, ["kind", "manifest", "text", "anchor"], label);
    if (typeof record.text !== "string")
      fail(`${label}.text must be a string.`);
    const anchor = readRecord(record.anchor, `${label}.anchor`);
    known(anchor, ["x", "y"], `${label}.anchor`);
    return deepFreeze({
      kind: "image-string" as const,
      manifest: imageStringDependencyPath(record.manifest, `${label}.manifest`),
      text: record.text,
      anchor: {
        x: unit(anchor.x, `${label}.anchor.x`),
        y: unit(anchor.y, `${label}.anchor.y`),
      },
    });
  }
  if (record.kind === "vni") {
    known(record, ["kind", "project", "loop"], label);
    if (typeof record.loop !== "boolean")
      fail(`${label}.loop must be a boolean.`);
    return deepFreeze({
      kind: "vni" as const,
      project: localPath(
        record.project,
        `${label}.project`,
        new Set([".json"]),
      ),
      loop: record.loop,
    });
  }
  fail(`${label}.kind must be image, spine, image-string, or vni.`);
}

function parseRuntimeResources(
  value: unknown,
): Readonly<Record<string, SceneLayoutRuntimeResourceSpec>> {
  const record = readRecord(value, "scene layout runtimeResources");
  if (Object.keys(record).length === 0)
    fail("scene layout runtimeResources must not be empty when present.");
  const resources: Record<string, SceneLayoutRuntimeResourceSpec> = {};
  for (const [key, raw] of Object.entries(record)) {
    identifier(key, "scene layout runtime resource key");
    const label = `scene layout runtimeResources.${key}`;
    const resource = readRecord(raw, label);
    if (resource.kind === "image") {
      known(resource, ["kind", "path", "size"], label);
      resources[key] = deepFreeze({
        kind: "image",
        path: localPath(resource.path, `${label}.path`, IMAGE_EXTENSIONS),
        size: size(resource.size, `${label}.size`),
      });
      continue;
    }
    if (resource.kind === "spine") {
      known(resource, ["kind", "skeleton", "atlas", "textures"], label);
      const texturesRecord = readRecord(resource.textures, `${label}.textures`);
      if (Object.keys(texturesRecord).length === 0)
        fail(`${label}.textures must not be empty.`);
      const textures: Record<string, string> = {};
      for (const [page, rawPath] of Object.entries(texturesRecord)) {
        if (!PATH_SEGMENT.test(page))
          fail(`${label}.textures page "${page}" is invalid.`);
        textures[page] = localPath(
          rawPath,
          `${label}.textures.${page}`,
          IMAGE_EXTENSIONS,
        );
      }
      resources[key] = deepFreeze({
        kind: "spine",
        skeleton: localPath(
          resource.skeleton,
          `${label}.skeleton`,
          new Set([".json"]),
        ),
        atlas: localPath(resource.atlas, `${label}.atlas`, new Set([".atlas"])),
        textures,
      });
      continue;
    }
    if (resource.kind === "image-string") {
      known(resource, ["kind", "manifest"], label);
      resources[key] = deepFreeze({
        kind: "image-string",
        manifest: imageStringDependencyPath(
          resource.manifest,
          `${label}.manifest`,
        ),
      });
      continue;
    }
    if (resource.kind === "vni") {
      known(resource, ["kind", "project"], label);
      resources[key] = deepFreeze({
        kind: "vni",
        project: localPath(
          resource.project,
          `${label}.project`,
          new Set([".json"]),
        ),
      });
      continue;
    }
    if (resource.kind === "video") {
      known(resource, ["kind", "path", "mimeType"], label);
      if (resource.mimeType !== "video/mp4")
        fail(`${label}.mimeType must be video/mp4.`);
      resources[key] = deepFreeze({
        kind: "video",
        path: videoOwnedPath(resource.path, `${label}.path`),
        mimeType: "video/mp4",
      });
      continue;
    }
    fail(`${label}.kind must be image, spine, image-string, vni, or video.`);
  }
  return deepFreeze(resources);
}

function parseSpineStateMachine(
  value: unknown,
  label: string,
): SceneLayoutSpineStateMachine {
  const record = readRecord(value, label);
  known(record, ["initialState", "states", "transitions"], label);
  const statesRecord = readRecord(record.states, `${label}.states`);
  if (Object.keys(statesRecord).length === 0)
    fail(`${label}.states must not be empty.`);
  const states: Record<string, { readonly animation: string }> = {};
  const animations: string[] = [];
  for (const [stateId, raw] of Object.entries(statesRecord)) {
    stateIdentifier(stateId, `${label}.states key`);
    const state = readRecord(raw, `${label}.states.${stateId}`);
    known(state, ["animation"], `${label}.states.${stateId}`);
    const animation = nonEmpty(
      state.animation,
      `${label}.states.${stateId}.animation`,
    );
    states[stateId] = deepFreeze({ animation });
    animations.push(animation);
  }
  const initialState = stateIdentifier(
    record.initialState,
    `${label}.initialState`,
  );
  if (!states[initialState])
    fail(`${label}.initialState must reference a declared state.`);
  if (!Array.isArray(record.transitions))
    fail(`${label}.transitions must be an array.`);
  const pairs = new Set<string>();
  const transitions = record.transitions.map((raw, index) => {
    const transitionLabel = `${label}.transitions[${index}]`;
    const transition = readRecord(raw, transitionLabel);
    known(transition, ["from", "to", "animation"], transitionLabel);
    const from = stateIdentifier(transition.from, `${transitionLabel}.from`);
    const to = stateIdentifier(transition.to, `${transitionLabel}.to`);
    if (!states[from] || !states[to])
      fail(`${transitionLabel} must reference declared states.`);
    if (from === to) fail(`${transitionLabel} must not be a self transition.`);
    const pair = `${from}\u0000${to}`;
    if (pairs.has(pair)) fail(`${label} transition pairs must be unique.`);
    pairs.add(pair);
    const animation = nonEmpty(
      transition.animation,
      `${transitionLabel}.animation`,
    );
    animations.push(animation);
    return deepFreeze({ from, to, animation });
  });
  unique(animations, `${label} animation`);
  return deepFreeze({ initialState, states, transitions });
}

function parseReel(
  value: unknown,
  id: string,
  mode: SceneLayoutAdaptation["mode"],
): SceneLayoutReelGrid {
  const label = `scene layout reel "${id}"`;
  const record = readRecord(value, label);
  known(
    record,
    ["order", "columns", "rows", "cellSize", "gap", "placements"],
    label,
  );
  const gapRecord = readRecord(record.gap, `${label}.gap`);
  known(gapRecord, ["x", "y"], `${label}.gap`);
  const placementsRecord = readRecord(record.placements, `${label}.placements`);
  const allowed =
    mode === "maximized-focus" ? ["default"] : ["landscape", "portrait"];
  known(placementsRecord, allowed, `${label}.placements`);
  const placements: Partial<
    Record<SceneLayoutVariantId, { x: number; y: number }>
  > = {};
  for (const [variantId, raw] of Object.entries(placementsRecord)) {
    const placement = readRecord(raw, `${label}.placements.${variantId}`);
    known(placement, ["x", "y"], `${label}.placements.${variantId}`);
    placements[variantId as SceneLayoutVariantId] = deepFreeze({
      x: finite(placement.x, `${label}.placements.${variantId}.x`),
      y: finite(placement.y, `${label}.placements.${variantId}.y`),
    });
  }
  if (mode === "maximized-focus" && !placements.default)
    fail(`${label}.placements.default is required.`);
  if (
    mode === "orientation-focus" &&
    (!placements.landscape || !placements.portrait)
  ) {
    fail(`${label}.placements must include landscape and portrait.`);
  }
  return deepFreeze({
    ...(record.order === undefined
      ? {}
      : { order: safeInteger(record.order, `${label}.order`) }),
    columns: positiveSafeInteger(record.columns, `${label}.columns`),
    rows: positiveSafeInteger(record.rows, `${label}.rows`),
    cellSize: size(record.cellSize, `${label}.cellSize`),
    gap: {
      x: nonNegative(gapRecord.x, `${label}.gap.x`),
      y: nonNegative(gapRecord.y, `${label}.gap.y`),
    },
    placements,
  });
}

function validateReferences(
  adaptation: SceneLayoutAdaptation,
  nodes: readonly SceneLayoutNode[],
  nodeIds: Set<unknown>,
): void {
  const variants: readonly SceneLayoutVariantId[] =
    adaptation.mode === "maximized-focus"
      ? ["default"]
      : ["landscape", "portrait"];
  for (const variantId of variants) {
    const variant =
      adaptation.mode === "maximized-focus"
        ? adaptation
        : adaptation.variants[variantId as "landscape" | "portrait"];
    const backgroundNode = variant.backgroundNode;
    if (!nodeIds.has(backgroundNode))
      fail(`backgroundNode "${backgroundNode}" does not exist.`);
    const background = nodes.find((node) => node.id === backgroundNode)!;
    if (
      background.resource.kind === "image-string" ||
      background.resource.kind === "vni"
    )
      fail(
        `backgroundNode "${backgroundNode}" cannot be ${background.resource.kind}.`,
      );
    if (
      background.resource.kind === "spine" &&
      !("stateMachine" in background.resource) &&
      !background.resource.loop
    )
      fail(`backgroundNode "${backgroundNode}" Spine animation must loop.`);
    if (!background.placements[variantId])
      fail(
        `backgroundNode "${backgroundNode}" must be visible in ${variantId}.`,
      );
    const visible = nodes.filter((node) => node.placements[variantId]);
    const minimumOrder = Math.min(...visible.map((node) => node.order));
    if (background.order !== minimumOrder)
      fail(
        `backgroundNode "${backgroundNode}" must have the lowest order in ${variantId}.`,
      );
  }
}

function parseCoordinateOrigin(value: unknown): "top-left" | "center" {
  if (value !== "top-left" && value !== "center")
    fail(
      'scene layout manifest.coordinateOrigin must be "top-left" or "center".',
    );
  return value;
}

export function assertSceneLayoutGeometryCompatible(
  currentValue: SceneLayoutManifest,
  nextValue: SceneLayoutManifest,
): void {
  const current = parseSceneLayoutManifest(currentValue);
  const next = parseSceneLayoutManifest(nextValue);
  if (
    JSON.stringify(sceneLayoutStructure(current)) !==
    JSON.stringify(sceneLayoutStructure(next))
  )
    fail("scene layout geometry update changed immutable structure.");
}

function sceneLayoutStructure(manifest: SceneLayoutManifestV1): unknown {
  return {
    version: manifest.version,
    kind: manifest.kind,
    id: manifest.id,
    nodes: manifest.nodes.map(({ placements: _placements, ...node }) => node),
    reels: Object.fromEntries(
      Object.entries(manifest.reels).map(
        ([id, { placements: _placements, ...reel }]) => [id, reel],
      ),
    ),
    symbolPackage: manifest.symbolPackage,
    symbolPackages: manifest.symbolPackages,
    popups: manifest.popups,
    runtimeResources: manifest.runtimeResources,
    gameModes: manifest.gameModes
      ? {
          ...manifest.gameModes,
          modes: manifest.gameModes.modes.map(
            ({ backgroundNodes: _backgroundNodes, ...mode }) => mode,
          ),
          transitions: manifest.gameModes.transitions?.map((transition) =>
            "placements" in transition.overlay
              ? {
                  ...transition,
                  overlay: {
                    ...transition.overlay,
                    placements: undefined,
                  },
                }
              : transition,
          ),
        }
      : undefined,
  };
}

function validatePathClosure(
  nodes: readonly SceneLayoutNode[],
  runtimeResources?: Readonly<Record<string, SceneLayoutRuntimeResourceSpec>>,
): void {
  const paths: string[] = [];
  for (const node of nodes) {
    const resource = node.resource;
    paths.push(
      ...(resource.kind === "image"
        ? [resource.path]
        : resource.kind === "image-string"
          ? [resource.manifest]
          : resource.kind === "vni"
            ? [resource.project]
            : [
                resource.skeleton,
                resource.atlas,
                ...Object.values(resource.textures),
              ]),
    );
  }
  for (const resource of Object.values(runtimeResources ?? {})) {
    paths.push(
      ...(resource.kind === "image" || resource.kind === "video"
        ? [resource.path]
        : resource.kind === "image-string"
          ? [resource.manifest]
          : resource.kind === "vni"
            ? [resource.project]
            : [
                resource.skeleton,
                resource.atlas,
                ...Object.values(resource.textures),
              ]),
    );
  }
  try {
    assertNoPackagePathAliases(paths);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function parseSymbolPackageBinding(
  value: unknown,
): SceneLayoutSymbolPackageBinding {
  return parseSymbolPackageBindingAt(value, "scene layout symbolPackage");
}

function parseSymbolPackageBindings(
  value: unknown,
): Readonly<Record<string, SceneLayoutSymbolPackageBinding>> {
  const record = readRecord(value, "scene layout symbolPackages");
  const entries = Object.entries(record);
  if (entries.length === 0)
    fail("scene layout symbolPackages must not be empty when present.");
  const result: Record<string, SceneLayoutSymbolPackageBinding> = {};
  for (const [id, value] of entries) {
    identifier(id, "scene layout symbol package id");
    const label = `scene layout symbolPackages.${id}`;
    const binding = parseSymbolPackageBindingAt(value, label);
    if (
      binding.manifest.includes("/") &&
      binding.manifest.split("/").at(-2) !== id
    )
      fail(`${label}.manifest dependency id must equal binding id "${id}".`);
    result[id] = binding;
  }
  return deepFreeze(result);
}

function parseSymbolPackageBindingAt(
  value: unknown,
  label: string,
): SceneLayoutSymbolPackageBinding {
  const record = readRecord(value, label);
  known(record, ["manifest", "reel", "reelSet", "renderMode"], label);
  if (record.reel !== "main") fail(`${label}.reel must be "main".`);
  if (record.renderMode !== "standard" && record.renderMode !== "grid-cell")
    fail(`${label}.renderMode must be "standard" or "grid-cell".`);
  return deepFreeze({
    manifest: symbolDependencyPath(record.manifest, `${label}.manifest`),
    reel: "main" as const,
    reelSet: nonEmpty(record.reelSet, `${label}.reelSet`),
    renderMode: record.renderMode,
  });
}

function parsePopupBindings(
  value: unknown,
  mode: SceneLayoutAdaptation["mode"],
): Readonly<Record<string, SceneLayoutPopupBinding>> {
  const record = readRecord(value, "scene layout popups");
  const entries = Object.entries(record);
  if (entries.length === 0)
    fail("scene layout popups must not be empty when present.");
  const result: Record<string, SceneLayoutPopupBinding> = {};
  for (const [id, raw] of entries) {
    identifier(id, "scene layout popup id");
    const label = `scene layout popups.${id}`;
    const binding = readRecord(raw, label);
    known(binding, ["type", "manifest", "order", "placements"], label);
    if (
      binding.type !== "award-celebration" &&
      binding.type !== "spine" &&
      binding.type !== "single-state"
    )
      fail(
        `${label}.type must be "award-celebration", "spine", or "single-state".`,
      );
    const placementsRecord = readRecord(
      binding.placements,
      `${label}.placements`,
    );
    const expected =
      mode === "maximized-focus"
        ? (["default"] as const)
        : (["landscape", "portrait"] as const);
    known(placementsRecord, expected, `${label}.placements`);
    for (const variant of expected)
      if (!Object.hasOwn(placementsRecord, variant))
        fail(`${label}.placements.${variant} is required.`);
    const placements = Object.fromEntries(
      expected.map((variant) => [
        variant,
        parseScaledPlacement(
          placementsRecord[variant],
          `${label}.placements.${variant}`,
        ),
      ]),
    );
    const manifest = popupDependencyPath(binding.manifest, `${label}.manifest`);
    if (manifest.includes("/") && manifest.split("/").at(-2) !== id)
      fail(`${label}.manifest dependency id must equal binding id "${id}".`);
    result[id] = {
      type: binding.type,
      manifest,
      order:
        binding.order === undefined
          ? DEFAULT_SCENE_LAYOUT_POPUP_ORDER
          : safeInteger(binding.order, `${label}.order`),
      placements,
    };
  }
  return deepFreeze(result);
}

function validatePresentationOrders(
  nodes: readonly SceneLayoutNode[],
  main: SceneLayoutReelGrid | undefined,
  popups: Readonly<Record<string, SceneLayoutPopupBinding>> | undefined,
): void {
  const artOrders = [
    ...nodes.map((node) => node.order),
    ...(main?.order === undefined ? [] : [main.order]),
  ];
  const popupOrders = Object.values(popups ?? {}).map((popup) => popup.order);
  unique([...artOrders, ...popupOrders], "scene layout node/reel/popup order");
  const maximumArtOrder = Math.max(...artOrders, Number.MIN_SAFE_INTEGER);
  for (const [id, popup] of Object.entries(popups ?? {}))
    if (popup.order <= maximumArtOrder)
      fail(
        `scene layout popup "${id}" order must be greater than every node/reel order.`,
      );
}

function parseGameModes(
  value: unknown,
  adaptation: SceneLayoutAdaptation,
  nodes: readonly SceneLayoutNode[],
  legacySymbolPackage: SceneLayoutSymbolPackageBinding | undefined,
  symbolPackages:
    | Readonly<Record<string, SceneLayoutSymbolPackageBinding>>
    | undefined,
  popups: Readonly<Record<string, SceneLayoutPopupBinding>> | undefined,
): SceneLayoutGameModes {
  const record = readRecord(value, "scene layout gameModes");
  known(
    record,
    ["initialMode", "modes", "transitions"],
    "scene layout gameModes",
  );
  const initialMode = stateIdentifier(
    record.initialMode,
    "scene layout gameModes.initialMode",
  );
  if (!Array.isArray(record.modes) || record.modes.length === 0)
    fail("scene layout gameModes.modes must be a non-empty array.");
  const rawModes = record.modes.map((rawMode, index) => {
    const label = `scene layout gameModes.modes[${index}]`;
    const mode = readRecord(rawMode, label);
    known(
      mode,
      [
        "id",
        "backgroundNodes",
        "nodeStates",
        "symbolPackage",
        "awardCelebrationPopup",
      ],
      label,
    );
    return { mode, label };
  });
  const canonical =
    symbolPackages !== undefined ||
    rawModes.some(
      ({ mode }) =>
        mode.backgroundNodes !== undefined || mode.symbolPackage !== undefined,
    );
  if (
    legacySymbolPackage &&
    rawModes.some(({ mode }) => mode.symbolPackage !== undefined)
  )
    fail(
      "gameModes symbolPackage bindings cannot be combined with legacy symbolPackage.",
    );
  const variants = activeVariantIds(adaptation);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const backgroundNodesByMode = new Map<
    string,
    Readonly<Partial<Record<SceneLayoutVariantId, string>>>
  >();
  const parsedHeads = rawModes.map(({ mode, label }) => {
    const id = stateIdentifier(mode.id, `${label}.id`);
    let backgroundNodes:
      | Readonly<Partial<Record<SceneLayoutVariantId, string>>>
      | undefined;
    if (canonical) {
      if (mode.backgroundNodes === undefined)
        fail(`${label}.backgroundNodes is required for canonical gameModes.`);
      const rawBackgrounds = readRecord(
        mode.backgroundNodes,
        `${label}.backgroundNodes`,
      );
      known(rawBackgrounds, variants, `${label}.backgroundNodes`);
      const result: Partial<Record<SceneLayoutVariantId, string>> = {};
      for (const variant of variants) {
        if (!Object.hasOwn(rawBackgrounds, variant))
          fail(`${label}.backgroundNodes.${variant} is required.`);
        const nodeId = identifier(
          rawBackgrounds[variant],
          `${label}.backgroundNodes.${variant}`,
        );
        const node = nodesById.get(nodeId);
        if (!node)
          fail(
            `${label}.backgroundNodes.${variant} references unknown node "${nodeId}".`,
          );
        if (
          node.resource.kind === "image-string" ||
          node.resource.kind === "vni"
        )
          fail(
            `${label}.backgroundNodes.${variant} cannot reference ${node.resource.kind} node "${nodeId}".`,
          );
        if (
          node.resource.kind === "spine" &&
          !("stateMachine" in node.resource) &&
          !node.resource.loop
        )
          fail(
            `${label}.backgroundNodes.${variant} Spine node "${nodeId}" must loop.`,
          );
        if (!node.placements[variant])
          fail(
            `${label}.backgroundNodes.${variant} node "${nodeId}" has no ${variant} placement.`,
          );
        result[variant] = nodeId;
      }
      backgroundNodes = deepFreeze(result);
      backgroundNodesByMode.set(id, backgroundNodes);
    }
    const symbolPackage =
      mode.symbolPackage === undefined
        ? undefined
        : identifier(mode.symbolPackage, `${label}.symbolPackage`);
    if (symbolPackage && !symbolPackages?.[symbolPackage])
      fail(
        `${label}.symbolPackage references unknown binding "${symbolPackage}".`,
      );
    const popup =
      mode.awardCelebrationPopup === undefined
        ? undefined
        : identifier(
            mode.awardCelebrationPopup,
            `${label}.awardCelebrationPopup`,
          );
    if (popup && !popups?.[popup])
      fail(
        `${label}.awardCelebrationPopup references unknown popup "${popup}".`,
      );
    if (popup && popups?.[popup]?.type !== "award-celebration")
      fail(`${label}.awardCelebrationPopup must reference award-celebration.`);
    return { id, label, mode, backgroundNodes, symbolPackage, popup };
  });
  unique(
    parsedHeads.map((mode) => mode.id),
    "scene layout game mode id",
  );
  const candidateBackgroundIds = new Set(
    [
      ...Object.values(adaptationBackgroundNodes(adaptation)),
      ...[...backgroundNodesByMode.values()].flatMap((bindings) =>
        Object.values(bindings),
      ),
    ].filter((nodeId): nodeId is string => nodeId !== undefined),
  );
  const modeIds = new Set(parsedHeads.map((mode) => mode.id));
  for (const node of nodes) {
    if (node.gameMode === undefined) continue;
    if (!modeIds.has(node.gameMode))
      fail(
        `scene layout node "${node.id}" gameMode references unknown mode "${node.gameMode}".`,
      );
    if (candidateBackgroundIds.has(node.id))
      fail(
        `scene layout background node "${node.id}" must not declare gameMode.`,
      );
  }
  const stateful = nodes.filter(
    (
      node,
    ): node is SceneLayoutNode & {
      readonly resource: Extract<
        SceneLayoutNode["resource"],
        { readonly stateMachine: unknown }
      >;
    } => node.resource.kind === "spine" && "stateMachine" in node.resource,
  );
  const statefulById = new Map(stateful.map((node) => [node.id, node]));
  const sharedStatefulIds = stateful
    .filter(
      (node) =>
        !candidateBackgroundIds.has(node.id) && node.gameMode === undefined,
    )
    .map((node) => node.id);
  const modes = parsedHeads.map(
    ({ id, label, mode, backgroundNodes, symbolPackage, popup }) => {
      const rawStates = readRecord(mode.nodeStates, `${label}.nodeStates`);
      const keys = Object.keys(rawStates);
      const activeStatefulBackgroundIds = canonical
        ? [...new Set(Object.values(backgroundNodes!))].filter((nodeId) =>
            statefulById.has(nodeId),
          )
        : [];
      const activeScopedStatefulIds = canonical
        ? stateful
            .filter(
              (node) =>
                !candidateBackgroundIds.has(node.id) && node.gameMode === id,
            )
            .map((node) => node.id)
        : [];
      const expectedStatefulIds = canonical
        ? [
            ...sharedStatefulIds,
            ...activeScopedStatefulIds,
            ...activeStatefulBackgroundIds,
          ]
        : stateful
            .filter(
              (node) => node.gameMode === undefined || node.gameMode === id,
            )
            .map((node) => node.id);
      const expectedSet = new Set(expectedStatefulIds);
      if (
        keys.length !== expectedSet.size ||
        keys.some((nodeId) => !expectedSet.has(nodeId))
      )
        fail(
          `${label}.nodeStates must cover every active/shared stateful Spine node exactly.`,
        );
      const nodeStates: Record<string, string> = {};
      for (const nodeId of expectedStatefulIds) {
        const node = statefulById.get(nodeId)!;
        const state = stateIdentifier(
          rawStates[nodeId],
          `${label}.nodeStates.${nodeId}`,
        );
        if (!Object.hasOwn(node.resource.stateMachine.states, state))
          fail(
            `${label}.nodeStates.${nodeId} references unknown stable state "${state}".`,
          );
        nodeStates[nodeId] = state;
      }
      return deepFreeze({
        id,
        ...(backgroundNodes ? { backgroundNodes } : {}),
        nodeStates,
        ...(symbolPackage ? { symbolPackage } : {}),
        ...(popup ? { awardCelebrationPopup: popup } : {}),
      });
    },
  );
  const initial = modes.find((mode) => mode.id === initialMode);
  if (!initial)
    fail(
      `scene layout gameModes.initialMode references unknown mode "${initialMode}".`,
    );
  if (canonical) {
    const bootstrap = adaptationBackgroundNodes(adaptation);
    for (const variant of variants)
      if (initial.backgroundNodes?.[variant] !== bootstrap[variant])
        fail(
          `scene layout initial mode backgroundNodes.${variant} must equal adaptation bootstrap backgroundNode.`,
        );
    validateBackgroundOnlyOrdering(nodes, variants, candidateBackgroundIds);
  }
  for (const [nodeId, state] of Object.entries(initial.nodeStates)) {
    const node = statefulById.get(nodeId)!;
    if (state !== node.resource.stateMachine.initialState)
      fail(
        `scene layout initial mode nodeStates.${nodeId} must equal the node initialState.`,
      );
  }
  const transitions = parseGameModeTransitions(
    record.transitions ?? [],
    modes,
    adaptation,
    popups,
  );
  const referencedSymbols = new Set(
    modes.flatMap((mode) => (mode.symbolPackage ? [mode.symbolPackage] : [])),
  );
  for (const id of Object.keys(symbolPackages ?? {}))
    if (!referencedSymbols.has(id))
      fail(`scene layout symbol package "${id}" is orphaned by gameModes.`);
  return deepFreeze({ initialMode, modes, transitions });
}

function parseGameModeTransitions(
  value: unknown,
  modes: readonly import("./types.js").SceneLayoutGameMode[],
  adaptation: SceneLayoutAdaptation,
  popups: Readonly<Record<string, SceneLayoutPopupBinding>> | undefined,
): readonly SceneLayoutGameModeTransition[] {
  if (!Array.isArray(value))
    fail("scene layout gameModes.transitions must be an array.");
  const modeIds = new Set(modes.map((mode) => mode.id));
  const variants = activeVariantIds(adaptation);
  const pairs = new Set<string>();
  return deepFreeze(
    value.map((raw, index) => {
      const label = `scene layout gameModes.transitions[${index}]`;
      const transition = readRecord(raw, label);
      known(transition, ["from", "to", "preludePopup", "overlay"], label);
      const from = stateIdentifier(transition.from, `${label}.from`);
      const to = stateIdentifier(transition.to, `${label}.to`);
      if (!modeIds.has(from) || !modeIds.has(to))
        fail(`${label} must reference declared game modes.`);
      if (from === to) fail(`${label} must not be a self transition.`);
      const pair = `${from}\u0000${to}`;
      if (pairs.has(pair))
        fail("scene layout game mode transition pairs must be unique.");
      pairs.add(pair);
      const overlayLabel = `${label}.overlay`;
      const overlay = readRecord(transition.overlay, overlayLabel);
      const preludePopup =
        transition.preludePopup === undefined
          ? undefined
          : identifier(transition.preludePopup, `${label}.preludePopup`);
      if (preludePopup && !popups?.[preludePopup])
        fail(
          `${label}.preludePopup references unknown popup "${preludePopup}".`,
        );
      if (preludePopup && popups?.[preludePopup]?.type !== "spine")
        fail(`${label}.preludePopup must reference a spine popup.`);
      if (overlay.kind === "none") {
        known(overlay, ["kind"], overlayLabel);
        return deepFreeze({
          from,
          to,
          ...(preludePopup ? { preludePopup } : {}),
          overlay: { kind: "none" as const },
        });
      }
      const resourceLabel = `${overlayLabel}.resource`;
      const resource = readRecord(overlay.resource, resourceLabel);
      if (resource.kind === "video") {
        known(overlay, ["resource", "fit", "fadeOutSeconds"], overlayLabel);
        known(resource, ["kind", "path", "mimeType"], resourceLabel);
        if (resource.mimeType !== "video/mp4")
          fail(`${resourceLabel}.mimeType must be video/mp4.`);
        if (overlay.fit !== "contain")
          fail(`${overlayLabel}.fit must be contain.`);
        return deepFreeze({
          from,
          to,
          ...(preludePopup ? { preludePopup } : {}),
          overlay: {
            resource: {
              kind: "video" as const,
              path: videoOwnedPath(resource.path, `${resourceLabel}.path`),
              mimeType: "video/mp4" as const,
            },
            fit: "contain" as const,
            fadeOutSeconds: positive(
              overlay.fadeOutSeconds,
              `${overlayLabel}.fadeOutSeconds`,
            ),
          },
        });
      }
      known(
        overlay,
        ["resource", "animation", "switchEvent", "placements"],
        overlayLabel,
      );
      known(resource, ["kind", "skeleton", "atlas", "textures"], resourceLabel);
      if (resource.kind !== "spine")
        fail(`${resourceLabel}.kind must be spine or video.`);
      const skeleton = localPath(
        resource.skeleton,
        `${resourceLabel}.skeleton`,
        new Set([".json"]),
      );
      const atlas = localPath(
        resource.atlas,
        `${resourceLabel}.atlas`,
        new Set([".atlas"]),
      );
      const texturesRecord = readRecord(
        resource.textures,
        `${resourceLabel}.textures`,
      );
      if (Object.keys(texturesRecord).length === 0)
        fail(`${resourceLabel}.textures must not be empty.`);
      const textures: Record<string, string> = {};
      for (const [page, path] of Object.entries(texturesRecord)) {
        if (!PATH_SEGMENT.test(page))
          fail(`${resourceLabel}.textures page "${page}" is invalid.`);
        textures[page] = localPath(
          path,
          `${resourceLabel}.textures.${page}`,
          IMAGE_EXTENSIONS,
        );
      }
      const placementsRecord = readRecord(
        overlay.placements,
        `${overlayLabel}.placements`,
      );
      known(placementsRecord, variants, `${overlayLabel}.placements`);
      const placements: Partial<
        Record<SceneLayoutVariantId, SceneLayoutScaledPlacement>
      > = {};
      for (const variant of variants) {
        if (!Object.hasOwn(placementsRecord, variant))
          fail(`${overlayLabel}.placements.${variant} is required.`);
        placements[variant] = parseScaledPlacement(
          placementsRecord[variant],
          `${overlayLabel}.placements.${variant}`,
        );
      }
      return deepFreeze({
        from,
        to,
        ...(preludePopup ? { preludePopup } : {}),
        overlay: {
          resource: { kind: "spine" as const, skeleton, atlas, textures },
          animation: exactName(overlay.animation, `${overlayLabel}.animation`),
          switchEvent: exactName(
            overlay.switchEvent,
            `${overlayLabel}.switchEvent`,
          ),
          placements,
        },
      });
    }),
  );
}

function videoOwnedPath(value: unknown, label: string): string {
  const path = localPath(value, label, new Set([".mp4"]));
  if (!path.includes("/")) return assertEditorAssetKey(path);
  if (!/^assets\/[a-f0-9]{64}\.mp4$/u.test(path))
    fail(
      `${label} must be a filename key or assets/<full-lowercase-sha256>.mp4.`,
    );
  return path;
}

function assertEditorAssetKey(value: string): string {
  if (
    value.length === 0 ||
    value.normalize("NFC") !== value ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    !/\.[^.]+$/u.test(value) ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  )
    fail(`asset filename key is invalid: ${value}`);
  return value;
}

function assertNoPackagePathAliases(paths: readonly string[]): void {
  const canonical = new Map<string, string>();
  for (const path of paths) {
    const key = path.normalize("NFC").toLocaleLowerCase("en-US");
    const previous = canonical.get(key);
    if (previous !== undefined && previous !== path)
      fail(`package path canonical alias collision: ${previous} / ${path}`);
    canonical.set(key, path);
  }
}

function activeVariantIds(
  adaptation: SceneLayoutAdaptation,
): readonly SceneLayoutVariantId[] {
  return adaptation.mode === "maximized-focus"
    ? ["default"]
    : ["landscape", "portrait"];
}

function adaptationBackgroundNodes(
  adaptation: SceneLayoutAdaptation,
): Readonly<Partial<Record<SceneLayoutVariantId, string>>> {
  return adaptation.mode === "maximized-focus"
    ? { default: adaptation.backgroundNode }
    : {
        landscape: adaptation.variants.landscape.backgroundNode,
        portrait: adaptation.variants.portrait.backgroundNode,
      };
}

function validateBackgroundOnlyOrdering(
  nodes: readonly SceneLayoutNode[],
  variants: readonly SceneLayoutVariantId[],
  backgroundIds: ReadonlySet<string>,
): void {
  for (const variant of variants) {
    const backgrounds = nodes.filter(
      (node) => backgroundIds.has(node.id) && node.placements[variant],
    );
    const ordinary = nodes.filter(
      (node) => !backgroundIds.has(node.id) && node.placements[variant],
    );
    const firstOrdinaryOrder = Math.min(
      ...ordinary.map((node) => node.order),
      Number.POSITIVE_INFINITY,
    );
    for (const background of backgrounds)
      if (background.order >= firstOrdinaryOrder)
        fail(
          `mode background node "${background.id}" must be ordered below ordinary layers in ${variant}.`,
        );
  }
}

function imageStringDependencyPath(value: unknown, label: string): string {
  if (typeof value === "string" && !value.includes("/"))
    return assertEditorAssetKey(value);
  const path = canonicalLowercasePath(value, label);
  const match =
    /^dependencies\/image-strings\/([a-z0-9]+(?:-[a-z0-9]+)*)\/image-string\.manifest\.json$/u.exec(
      path,
    );
  if (!match)
    fail(
      `${label} must be dependencies/image-strings/<id>/image-string.manifest.json.`,
    );
  return path;
}

function symbolDependencyPath(value: unknown, label: string): string {
  if (typeof value === "string" && !value.includes("/"))
    return assertEditorAssetKey(value);
  const path = canonicalLowercasePath(value, label);
  const match =
    /^dependencies\/symbols\/([a-z0-9]+(?:-[a-z0-9]+)*)\/symbols\.package\.json$/u.exec(
      path,
    );
  if (!match)
    fail(`${label} must be dependencies/symbols/<id>/symbols.package.json.`);
  return path;
}

function popupDependencyPath(value: unknown, label: string): string {
  if (typeof value === "string" && !value.includes("/"))
    return assertEditorAssetKey(value);
  const path = canonicalLowercasePath(value, label);
  if (
    !/^dependencies\/popups\/([a-z0-9]+(?:-[a-z0-9]+)*)\/popup\.manifest\.json$/u.test(
      path,
    )
  )
    fail(`${label} must be dependencies/popups/<id>/popup.manifest.json.`);
  return path;
}

function canonicalLowercasePath(value: unknown, label: string): string {
  const path = localPath(value, label, new Set([".json"]));
  if (path !== path.toLowerCase() || path !== path.normalize("NFC"))
    fail(`${label} must be a canonical lowercase NFC path.`);
  return path;
}

function localPath(
  value: unknown,
  label: string,
  extensions: ReadonlySet<string>,
): string {
  const path = nonEmpty(value, label);
  if (
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    /^[a-z]+:/i.test(path)
  )
    fail(`${label} must be a relative local path.`);
  const segments = path.split("/");
  if (
    segments.some(
      (segment) =>
        !PATH_SEGMENT.test(segment) || segment === "." || segment === "..",
    )
  )
    fail(`${label} contains an invalid path segment.`);
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (!extensions.has(extension))
    fail(`${label} has an unsupported extension.`);
  return path;
}

function identifier(value: unknown, label: string): string {
  const id = nonEmpty(value, label);
  if (!IDENTIFIER.test(id)) fail(`${label} must match ${IDENTIFIER.source}.`);
  return id;
}
function stateIdentifier(value: unknown, label: string): string {
  const id = nonEmpty(value, label);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(id))
    fail(`${label} must be an ASCII state identifier.`);
  return id;
}
function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function known(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(record))
    if (!allowed.includes(key)) fail(`${label} contains unknown key "${key}".`);
}
function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    fail(`${label} must be a non-empty string.`);
  return value;
}
function exactName(value: unknown, label: string): string {
  const name = nonEmpty(value, label);
  if (
    name !== name.trim() ||
    [...name].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 0x1f || code === 0x7f;
    })
  )
    fail(
      `${label} must be an exact non-control name without outer whitespace.`,
    );
  return name;
}
function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(`${label} must be finite.`);
  return value;
}
function positive(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result <= 0) fail(`${label} must be positive.`);
  return result;
}
function nonNegative(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result < 0) fail(`${label} must be non-negative.`);
  return result;
}

function unit(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result < 0 || result > 1) fail(`${label} must be between 0 and 1.`);
  return result;
}
function safeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    fail(`${label} must be a safe integer.`);
  return value;
}
function positiveSafeInteger(value: unknown, label: string): number {
  const result = safeInteger(value, label);
  if (result <= 0) fail(`${label} must be positive.`);
  return result;
}
function size(value: unknown, label: string) {
  const record = readRecord(value, label);
  known(record, ["width", "height"], label);
  return deepFreeze({
    width: positive(record.width, `${label}.width`),
    height: positive(record.height, `${label}.height`),
  });
}
function rect(value: unknown, label: string) {
  const record = readRecord(value, label);
  known(record, ["x", "y", "width", "height"], label);
  return deepFreeze({
    x: finite(record.x, `${label}.x`),
    y: finite(record.y, `${label}.y`),
    width: positive(record.width, `${label}.width`),
    height: positive(record.height, `${label}.height`),
  });
}
function margin(value: unknown, label: string) {
  const record = readRecord(value, label);
  known(record, ["left", "right", "top", "bottom"], label);
  const result: Record<string, number> = {};
  for (const key of ["left", "right", "top", "bottom"] as const)
    if (record[key] !== undefined)
      result[key] = nonNegative(record[key], `${label}.${key}`);
  return deepFreeze(result);
}
function unique(values: readonly unknown[], label: string): Set<unknown> {
  const set = new Set(values);
  if (set.size !== values.length) fail(`${label} values must be unique.`);
  return set;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function fail(message: string): never {
  throw new SceneLayoutError(message);
}
