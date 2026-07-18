import { SceneLayoutError } from "./errors.js";
import type {
  OrientationFocusSceneLayoutVariant,
  SceneLayoutAdaptation,
  SceneLayoutManifestV1,
  SceneLayoutNode,
  SceneLayoutNodePlacement,
  SceneLayoutNodeResourceSpec,
  SceneLayoutReelGrid,
  SceneLayoutVariantId,
} from "./types.js";

const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]*$/;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function parseSceneLayoutManifest(
  value: unknown,
): SceneLayoutManifestV1 {
  const record = readRecord(value, "scene layout manifest");
  known(
    record,
    ["version", "kind", "id", "adaptation", "nodes", "reels"],
    "scene layout manifest",
  );
  if (record.version !== 1) fail("scene layout manifest.version must be 1.");
  if (record.kind !== "scene-layout")
    fail('scene layout manifest.kind must be "scene-layout".');
  const id = identifier(record.id, "scene layout manifest.id");
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
  validateReferencesAndBounds(adaptation, nodes, nodeIds, reels);
  validatePathClosure(nodes);
  return deepFreeze({
    version: 1,
    kind: "scene-layout",
    id,
    adaptation,
    nodes,
    reels,
  });
}

export function collectSceneLayoutAssetPaths(
  manifest: SceneLayoutManifestV1,
): readonly string[] {
  const parsed = parseSceneLayoutManifest(manifest);
  const paths = new Set<string>();
  for (const node of parsed.nodes) {
    const resource = node.resource;
    if (resource.kind === "image") paths.add(resource.path);
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
    fits(focusRect, artSize, "adaptation.focusRect");
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
  fits(focusRect, artSize, `${label}.focusRect`);
  const frameFocusRect = size(record.frameFocusRect, `${label}.frameFocusRect`);
  if (
    frameFocusRect.width > artSize.width ||
    frameFocusRect.height > artSize.height
  ) {
    fail(`${label}.frameFocusRect must fit inside artSize.`);
  }
  const minFocusMargin =
    record.minFocusMargin === undefined
      ? undefined
      : margin(record.minFocusMargin, `${label}.minFocusMargin`);
  if (
    frameFocusRect.width +
      (minFocusMargin?.left ?? 0) +
      (minFocusMargin?.right ?? 0) >
      artSize.width ||
    frameFocusRect.height +
      (minFocusMargin?.top ?? 0) +
      (minFocusMargin?.bottom ?? 0) >
      artSize.height
  ) {
    fail(`${label}.frameFocusRect and minFocusMargin must fit inside artSize.`);
  }
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
  known(record, ["id", "order", "resource", "placements"], label);
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
    resource: parseResource(record.resource, label),
    placements,
  });
}

function parseNodePlacement(
  value: unknown,
  label: string,
): SceneLayoutNodePlacement {
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
    known(
      record,
      ["kind", "skeleton", "atlas", "textures", "defaultAnimation", "loop"],
      label,
    );
    if (record.loop !== true) fail(`${label}.loop must be true.`);
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
      if (path.split("/").at(-1) !== page)
        fail(
          `${label}.textures.${page} path filename must match the atlas page.`,
        );
      textures[page] = path;
    }
    unique([skeleton, atlas, ...Object.values(textures)], `${label} path`);
    return deepFreeze({
      kind: "spine" as const,
      skeleton,
      atlas,
      textures,
      defaultAnimation: nonEmpty(
        record.defaultAnimation,
        `${label}.defaultAnimation`,
      ),
      loop: true as const,
    });
  }
  fail(`${label}.kind must be image or spine.`);
}

function parseReel(
  value: unknown,
  id: string,
  mode: SceneLayoutAdaptation["mode"],
): SceneLayoutReelGrid {
  const label = `scene layout reel "${id}"`;
  const record = readRecord(value, label);
  known(record, ["columns", "rows", "cellSize", "gap", "placements"], label);
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

function validateReferencesAndBounds(
  adaptation: SceneLayoutAdaptation,
  nodes: readonly SceneLayoutNode[],
  nodeIds: Set<unknown>,
  reels: Readonly<Record<string, SceneLayoutReelGrid>>,
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
    for (const [reelId, reel] of Object.entries(reels)) {
      const placement = reel.placements[variantId]!;
      const reelRect = {
        x: placement.x,
        y: placement.y,
        width:
          reel.columns * reel.cellSize.width + (reel.columns - 1) * reel.gap.x,
        height: reel.rows * reel.cellSize.height + (reel.rows - 1) * reel.gap.y,
      };
      fits(
        reelRect,
        variant.artSize,
        `scene layout reel "${reelId}" ${variantId} placement`,
      );
      contains(
        variant.focusRect,
        reelRect,
        `scene layout ${variantId} focusRect`,
        `reel "${reelId}"`,
      );
    }
  }
}

function validatePathClosure(nodes: readonly SceneLayoutNode[]): void {
  const owners = new Map<string, string>();
  for (const node of nodes) {
    const resource = node.resource;
    const signature =
      resource.kind === "image"
        ? JSON.stringify({
            kind: resource.kind,
            path: resource.path,
            size: resource.size,
          })
        : JSON.stringify({
            kind: resource.kind,
            skeleton: resource.skeleton,
            atlas: resource.atlas,
            textures: Object.fromEntries(
              Object.entries(resource.textures).sort(([left], [right]) =>
                left.localeCompare(right, "en"),
              ),
            ),
          });
    const paths =
      resource.kind === "image"
        ? [resource.path]
        : [
            resource.skeleton,
            resource.atlas,
            ...Object.values(resource.textures),
          ];
    for (const path of paths) {
      const key = path.toLowerCase();
      const owner = owners.get(key);
      if (owner !== undefined && owner !== signature) {
        fail(
          `lowercase scene layout asset path values must be unique across distinct resource signatures: "${path}".`,
        );
      }
      owners.set(key, signature);
    }
  }
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
    x: nonNegative(record.x, `${label}.x`),
    y: nonNegative(record.y, `${label}.y`),
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
function fits(
  rectValue: { x: number; y: number; width: number; height: number },
  sizeValue: { width: number; height: number },
  label: string,
): void {
  if (
    rectValue.x < 0 ||
    rectValue.y < 0 ||
    rectValue.x + rectValue.width > sizeValue.width ||
    rectValue.y + rectValue.height > sizeValue.height
  )
    fail(`${label} must fit inside artSize.`);
}
function contains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
  outerLabel: string,
  innerLabel: string,
): void {
  if (
    inner.x < outer.x ||
    inner.y < outer.y ||
    inner.x + inner.width > outer.x + outer.width ||
    inner.y + inner.height > outer.y + outer.height
  ) {
    fail(`${outerLabel} must contain ${innerLabel}.`);
  }
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
