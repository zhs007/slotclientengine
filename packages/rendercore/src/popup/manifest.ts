import { assertCanonicalPackagePath } from "@slotclientengine/browserartifactio";
import { assertEditorAssetKey } from "@slotclientengine/editorresource";
import type {
  AwardCelebrationPopupManifestV1,
  AwardCelebrationSpec,
  AwardCelebrationTier,
  AwardTierPresentation,
  PopupAmountFormat,
  PopupLayer,
  PopupManifestV1,
  PopupOverlayLayer,
  PopupPromptSpec,
  PopupResourceSpec,
  PopupSegment,
  SpinePopupManifestV1,
} from "./types.js";

const IDS = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const OWNED_PATH =
  /^assets\/[a-f0-9]{64}\.(?:png|webp|jpg|jpeg|json|atlas|woff2|woff|ttf|otf)$/u;
const SEGMENTS: readonly PopupSegment[] = ["start", "loop", "end"];

export function parsePopupManifest(
  value: AwardCelebrationPopupManifestV1,
): AwardCelebrationPopupManifestV1;
export function parsePopupManifest(
  value: SpinePopupManifestV1,
): SpinePopupManifestV1;
export function parsePopupManifest(value: unknown): PopupManifestV1;
export function parsePopupManifest(value: unknown): PopupManifestV1 {
  const record = object(value, "popup manifest");
  const commonKeys = [
    "version",
    "kind",
    "id",
    "type",
    "designViewport",
    "resources",
  ];
  keys(
    record,
    record.type === "spine"
      ? [...commonKeys, "spine"]
      : [...commonKeys, "amountFormat", "awardCelebration"],
    "popup manifest",
  );
  if (record.version !== 1) fail("popup manifest.version must be 1.");
  if (record.kind !== "popup") fail('popup manifest.kind must be "popup".');
  if (record.type !== "award-celebration" && record.type !== "spine")
    fail('popup manifest.type must be "award-celebration" or "spine".');
  const id = identifier(record.id, "popup manifest.id");
  const viewport = object(record.designViewport, "designViewport");
  keys(viewport, ["width", "height"], "designViewport");
  const resourcesRecord = object(record.resources, "resources");
  const resources: Record<string, PopupResourceSpec> = {};
  for (const [resourceId, spec] of Object.entries(resourcesRecord)) {
    const parsed = parseResource(spec, `resources.${resourceId}`);
    resourceKey(resourceId, `resources.${resourceId}`);
    if (resourceId.includes(".") && resourceId !== resourceRoot(parsed))
      fail(
        `resources.${resourceId} filename key 必须等于 resource root ${resourceRoot(parsed)}。`,
      );
    resources[resourceId] = parsed;
  }
  const base = {
    version: 1 as const,
    kind: "popup" as const,
    id,
    designViewport: {
      width: positive(viewport.width, "designViewport.width"),
      height: positive(viewport.height, "designViewport.height"),
    },
    resources,
  };
  if (record.type === "spine") {
    const spine = parseSpinePopup(record.spine, resources);
    const used = new Set<string>([spine.resource]);
    if (spine.prompt) used.add(spine.prompt.font);
    for (const overlay of spine.overlays ?? []) used.add(overlay.resource);
    const unused = Object.keys(resources).filter(
      (resourceId) => !used.has(resourceId),
    );
    if (unused.length)
      fail(`popup production resources 包含未引用项：${unused.join(", ")}`);
    return freeze({ ...base, type: "spine" as const, spine });
  }
  const awardCelebration = parseAwardCelebration(
    record.awardCelebration,
    resources,
  );
  const used = new Set<string>();
  for (const tier of allTiers(awardCelebration))
    for (const layer of tier.layers) used.add(layer.resource);
  const unused = Object.keys(resources).filter(
    (resourceId) => !used.has(resourceId),
  );
  if (unused.length)
    fail(`popup production resources 包含未引用项：${unused.join(", ")}`);
  return freeze({
    ...base,
    type: "award-celebration" as const,
    amountFormat: parseAmountFormat(record.amountFormat),
    awardCelebration,
  });
}

function parseSpinePopup(
  value: unknown,
  resources: Readonly<Record<string, PopupResourceSpec>>,
) {
  const record = object(value, "spine");
  keys(
    record,
    [
      "resource",
      "transform",
      "playback",
      ...(Object.hasOwn(record, "prompt") ? ["prompt"] : []),
      ...(Object.hasOwn(record, "overlays") ? ["overlays"] : []),
    ],
    "spine",
  );
  const resource = resourceKey(record.resource, "spine.resource");
  if (resources[resource]?.kind !== "spine")
    fail("spine.resource must reference a spine resource.");
  const transform = object(record.transform, "spine.transform");
  keys(transform, ["x", "y", "scale"], "spine.transform");
  const playback = object(record.playback, "spine.playback");
  keys(
    playback,
    ["mode", "startAnimation", "loopAnimation", "endAnimation"],
    "spine.playback",
  );
  if (playback.mode !== "segmented-animations")
    fail('spine.playback.mode must be "segmented-animations".');
  const animations = [
    nonEmpty(playback.startAnimation, "spine.playback.startAnimation"),
    nonEmpty(playback.loopAnimation, "spine.playback.loopAnimation"),
    nonEmpty(playback.endAnimation, "spine.playback.endAnimation"),
  ];
  unique(animations, "spine playback animations");
  const prompt = Object.hasOwn(record, "prompt")
    ? parsePrompt(record.prompt, resources)
    : undefined;
  const overlays = Object.hasOwn(record, "overlays")
    ? parseOverlays(record.overlays, resources)
    : undefined;
  unique(
    [
      ...(prompt ? [String(prompt.order)] : []),
      ...(overlays ?? []).map(({ order }) => String(order)),
    ],
    "spine prompt/overlay order",
  );
  return freeze({
    resource,
    transform: {
      x: finite(transform.x, "spine.transform.x"),
      y: finite(transform.y, "spine.transform.y"),
      scale: positive(transform.scale, "spine.transform.scale"),
    },
    playback: {
      mode: "segmented-animations" as const,
      startAnimation: animations[0]!,
      loopAnimation: animations[1]!,
      endAnimation: animations[2]!,
    },
    ...(prompt ? { prompt } : {}),
    ...(overlays ? { overlays } : {}),
  });
}

function parsePrompt(
  value: unknown,
  resources: Readonly<Record<string, PopupResourceSpec>>,
): PopupPromptSpec {
  const record = object(value, "spine.prompt");
  keys(
    record,
    ["font", "defaultText", "fill", "order", "area"],
    "spine.prompt",
  );
  const font = resourceKey(record.font, "spine.prompt.font");
  if (resources[font]?.kind !== "font")
    fail("spine.prompt.font must reference a font resource.");
  const defaultText = nonEmptySingleLine(
    record.defaultText,
    "spine.prompt.defaultText",
  );
  const fill = nonEmpty(record.fill, "spine.prompt.fill");
  const area = object(record.area, "spine.prompt.area");
  keys(area, ["x", "y", "width", "height"], "spine.prompt.area");
  return freeze({
    font,
    defaultText,
    fill,
    order: nonNegativeSafe(record.order, "spine.prompt.order"),
    area: {
      x: finite(area.x, "spine.prompt.area.x"),
      y: finite(area.y, "spine.prompt.area.y"),
      width: positive(area.width, "spine.prompt.area.width"),
      height: positive(area.height, "spine.prompt.area.height"),
    },
  });
}

function parseOverlays(
  value: unknown,
  resources: Readonly<Record<string, PopupResourceSpec>>,
): readonly PopupOverlayLayer[] {
  if (!Array.isArray(value)) fail("spine.overlays must be an array.");
  const overlays = value.map((raw, index) => {
    const label = `spine.overlays[${index}]`;
    const record = object(raw, label);
    if (record.kind === "image-string" || record.kind === "font")
      fail(`${label}.kind must be image, vni, or spine.`);
    const transform = object(record.transform, `${label}.transform`);
    keys(transform, ["x", "y", "scale", "rotation"], `${label}.transform`);
    const parsed = parseLayer(
      {
        ...record,
        transform: { x: transform.x, y: transform.y, scale: transform.scale },
      },
      label,
      resources,
    );
    if (parsed.kind === "image-string") fail(`${label}.kind invalid.`);
    return freeze({
      ...parsed,
      transform: {
        ...parsed.transform,
        rotation: finite(transform.rotation, `${label}.transform.rotation`),
      },
    }) as PopupOverlayLayer;
  });
  unique(
    overlays.map(({ id }) => id),
    "spine.overlays.id",
  );
  return Object.freeze([...overlays].sort((a, b) => a.order - b.order));
}

export function collectPopupDirectPaths(
  manifest: PopupManifestV1,
): readonly string[] {
  const parsed = parsePopupManifest(manifest);
  const result = new Set<string>();
  for (const resource of Object.values(parsed.resources)) {
    if (resource.kind === "image" || resource.kind === "font")
      result.add(resource.path);
    else if (resource.kind === "image-string") result.add(resource.manifest);
    else if (resource.kind === "vni") result.add(resource.project);
    else {
      result.add(resource.skeleton);
      result.add(resource.atlas);
      for (const path of Object.values(resource.textures)) result.add(path);
    }
  }
  return Object.freeze([...result].sort());
}

function parseAmountFormat(value: unknown): PopupAmountFormat {
  const record = object(value, "amountFormat");
  keys(
    record,
    [
      "rawScale",
      "fractionDigits",
      "useGrouping",
      "groupSeparator",
      "decimalSeparator",
      "prefix",
      "suffix",
      "rounding",
    ],
    "amountFormat",
  );
  if (record.rounding !== "floor")
    fail('amountFormat.rounding must be "floor".');
  if (typeof record.useGrouping !== "boolean")
    fail("amountFormat.useGrouping must be boolean.");
  return freeze({
    rawScale: positiveSafe(record.rawScale, "amountFormat.rawScale"),
    fractionDigits: safeRange(
      record.fractionDigits,
      0,
      6,
      "amountFormat.fractionDigits",
    ),
    useGrouping: record.useGrouping,
    groupSeparator: printable(
      record.groupSeparator,
      "amountFormat.groupSeparator",
    ),
    decimalSeparator: printable(
      record.decimalSeparator,
      "amountFormat.decimalSeparator",
    ),
    prefix: printable(record.prefix, "amountFormat.prefix"),
    suffix: printable(record.suffix, "amountFormat.suffix"),
    rounding: "floor" as const,
  });
}

function parseResource(value: unknown, label: string): PopupResourceSpec {
  const record = object(value, label);
  if (record.kind === "image") {
    keys(record, ["kind", "path", "size"], label);
    const size = object(record.size, `${label}.size`);
    keys(size, ["width", "height"], `${label}.size`);
    return freeze({
      kind: "image" as const,
      path: owned(record.path, `${label}.path`),
      size: {
        width: positiveSafe(size.width, `${label}.size.width`),
        height: positiveSafe(size.height, `${label}.size.height`),
      },
    });
  }
  if (record.kind === "font") {
    keys(record, ["kind", "path"], label);
    const fontPath = owned(record.path, `${label}.path`);
    if (!/\.(?:woff2|woff|ttf|otf)$/iu.test(fontPath))
      fail(`${label}.path must be a supported font file.`);
    return freeze({ kind: "font" as const, path: fontPath });
  }
  if (record.kind === "image-string") {
    keys(record, ["kind", "manifest"], label);
    const manifest = path(record.manifest, `${label}.manifest`);
    if (
      manifest.includes("/") &&
      !/^dependencies\/image-strings\/([a-z0-9]+(?:-[a-z0-9]+)*)\/image-string\.manifest\.json$/u.test(
        manifest,
      )
    )
      fail(
        `${label}.manifest 必须是 standalone image-string dependency path。`,
      );
    return freeze({ kind: "image-string" as const, manifest });
  }
  if (record.kind === "vni") {
    keys(record, ["kind", "project"], label);
    return freeze({
      kind: "vni" as const,
      project: owned(record.project, `${label}.project`, ".json"),
    });
  }
  if (record.kind === "spine") {
    keys(record, ["kind", "skeleton", "atlas", "textures"], label);
    const texturesRecord = object(record.textures, `${label}.textures`);
    if (!Object.keys(texturesRecord).length)
      fail(`${label}.textures must not be empty.`);
    const textures: Record<string, string> = {};
    for (const [page, rawPath] of Object.entries(texturesRecord)) {
      if (!page || page.includes("/") || page.includes("\\"))
        fail(`${label}.textures page invalid: ${page}`);
      textures[page] = owned(rawPath, `${label}.textures.${page}`);
    }
    return freeze({
      kind: "spine" as const,
      skeleton: owned(record.skeleton, `${label}.skeleton`, ".json"),
      atlas: owned(record.atlas, `${label}.atlas`, ".atlas"),
      textures,
    });
  }
  fail(`${label}.kind must be image, font, image-string, vni, or spine.`);
}

function parseAwardCelebration(
  value: unknown,
  resources: Readonly<Record<string, PopupResourceSpec>>,
): AwardCelebrationSpec {
  const record = object(value, "awardCelebration");
  keys(record, ["base", "standard", "celebrationTiers"], "awardCelebration");
  if (
    !Array.isArray(record.celebrationTiers) ||
    record.celebrationTiers.length !== 3
  )
    fail(
      "awardCelebration.celebrationTiers 必须恰好包含 bigwin/superwin/megawin。",
    );
  const ids = ["bigwin", "superwin", "megawin"] as const;
  let previous = 1;
  const celebrationTiers = record.celebrationTiers.map((value, index) => {
    const label = `awardCelebration.celebrationTiers[${index}]`;
    const tierRecord = object(value, label);
    keys(
      tierRecord,
      ["id", "thresholdMultiplier", "countDurationSeconds", "layers"],
      label,
    );
    if (tierRecord.id !== ids[index])
      fail(`${label}.id must be ${ids[index]}.`);
    const thresholdMultiplier = positiveSafe(
      tierRecord.thresholdMultiplier,
      `${label}.thresholdMultiplier`,
    );
    if (thresholdMultiplier <= previous)
      fail(
        "celebration tier thresholds must satisfy 1 < bigwin < superwin < megawin.",
      );
    previous = thresholdMultiplier;
    const presentation = parseTier(tierRecord, label, resources);
    return freeze({
      id: ids[index],
      thresholdMultiplier,
      ...presentation,
    }) as AwardCelebrationTier;
  });
  return freeze({
    base: parseTier(record.base, "awardCelebration.base", resources),
    standard: parseTier(
      record.standard,
      "awardCelebration.standard",
      resources,
    ),
    celebrationTiers,
  });
}

function parseTier(
  value: unknown,
  label: string,
  resources: Readonly<Record<string, PopupResourceSpec>>,
): AwardTierPresentation {
  const record = object(value, label);
  const allowed = [
    "countDurationSeconds",
    "layers",
    "id",
    "thresholdMultiplier",
  ];
  for (const key of Object.keys(record))
    if (!allowed.includes(key)) fail(`${label} contains unknown key: ${key}`);
  if (!Array.isArray(record.layers) || !record.layers.length)
    fail(`${label}.layers must be non-empty.`);
  const layers = record.layers.map((layer, index) =>
    parseLayer(layer, `${label}.layers[${index}]`, resources),
  );
  unique(
    layers.map(({ id }) => id),
    `${label}.layers.id`,
  );
  unique(
    layers.map(({ order }) => String(order)),
    `${label}.layers.order`,
  );
  if (layers.filter((layer) => layer.kind === "image-string").length !== 1)
    fail(`${label} 必须恰好包含一个动态 ImgNumber 图层。`);
  const amount = layers.find(
    (layer): layer is Extract<PopupLayer, { readonly kind: "image-string" }> =>
      layer.kind === "image-string",
  )!;
  const amountParent = amount.parent;
  if (amountParent.kind === "vni-text-layer") {
    const target = layers.find(({ id }) => id === amountParent.vniLayerId);
    if (!target || target.kind !== "vni")
      fail(
        `${label} ImgNumber parent.vniLayerId 必须引用同档 VNI layer：${amountParent.vniLayerId}。`,
      );
  }
  return freeze({
    countDurationSeconds: nonNegative(
      record.countDurationSeconds,
      `${label}.countDurationSeconds`,
    ),
    layers: [...layers].sort((a, b) => a.order - b.order),
  });
}

function parseLayer(
  value: unknown,
  label: string,
  resources: Readonly<Record<string, PopupResourceSpec>>,
): PopupLayer {
  const record = object(value, label);
  const kind = record.kind;
  const common = ["id", "kind", "order", "resource", "transform"];
  const resourceId = resourceKey(record.resource, `${label}.resource`);
  const resource = resources[resourceId];
  if (!resource || resource.kind !== kind)
    fail(`${label}.resource 必须引用相同 kind 的 resource。`);
  const transform = object(record.transform, `${label}.transform`);
  keys(transform, ["x", "y", "scale"], `${label}.transform`);
  const base = {
    id: identifier(record.id, `${label}.id`),
    order: nonNegativeSafe(record.order, `${label}.order`),
    resource: resourceId,
    transform: {
      x: finite(transform.x, `${label}.transform.x`),
      y: finite(transform.y, `${label}.transform.y`),
      scale: positive(transform.scale, `${label}.transform.scale`),
    },
  };
  if (kind === "image" || kind === "image-string") {
    if (kind === "image")
      keys(record, [...common, "anchor", "visibleSegments"], label);
    else
      keys(
        record,
        Object.hasOwn(record, "parent")
          ? [...common, "binding", "anchor", "parent"]
          : [...common, "binding", "anchor"],
        label,
      );
    if (kind === "image-string" && record.binding !== "win-amount")
      fail(`${label}.binding must be win-amount.`);
    const anchor = object(record.anchor, `${label}.anchor`);
    keys(anchor, ["x", "y"], `${label}.anchor`);
    const parsedAnchor = {
      x: unit(anchor.x, `${label}.anchor.x`),
      y: unit(anchor.y, `${label}.anchor.y`),
    };
    if (kind === "image-string")
      return freeze({
        ...base,
        kind,
        binding: "win-amount" as const,
        anchor: parsedAnchor,
        parent: parseImageStringParent(record.parent, `${label}.parent`),
      });
    const visibleSegments = parseSegments(
      record.visibleSegments,
      `${label}.visibleSegments`,
    );
    return freeze({
      ...base,
      kind,
      anchor: parsedAnchor,
      visibleSegments,
    });
  }
  if (kind === "vni") {
    keys(record, [...common, "playback"], label);
    const playback = object(record.playback, `${label}.playback`);
    if (playback.mode === "once") {
      keys(playback, ["mode"], `${label}.playback`);
      return freeze({
        ...base,
        kind: "vni" as const,
        playback: { mode: "once" as const },
      });
    }
    keys(
      playback,
      ["mode", "loopStartTime", "loopEndTime", "keepParticlesAlive"],
      `${label}.playback`,
    );
    if (
      playback.mode !== "segmented" ||
      typeof playback.keepParticlesAlive !== "boolean"
    )
      fail(`${label}.playback invalid.`);
    const start = nonNegative(
      playback.loopStartTime,
      `${label}.playback.loopStartTime`,
    );
    const end = positive(playback.loopEndTime, `${label}.playback.loopEndTime`);
    if (start >= end) fail(`${label}.playback loop points invalid.`);
    return freeze({
      ...base,
      kind: "vni" as const,
      playback: {
        mode: "segmented" as const,
        loopStartTime: start,
        loopEndTime: end,
        keepParticlesAlive: playback.keepParticlesAlive,
      },
    });
  }
  if (kind === "spine") {
    keys(record, [...common, "playback"], label);
    const playback = object(record.playback, `${label}.playback`);
    keys(
      playback,
      ["mode", "startAnimation", "loopAnimation", "endAnimation"],
      `${label}.playback`,
    );
    if (playback.mode !== "segmented-animations")
      fail(`${label}.playback.mode invalid.`);
    const animations = [
      nonEmpty(playback.startAnimation, `${label}.startAnimation`),
      nonEmpty(playback.loopAnimation, `${label}.loopAnimation`),
      nonEmpty(playback.endAnimation, `${label}.endAnimation`),
    ];
    unique(animations, `${label} animations`);
    return freeze({
      ...base,
      kind: "spine" as const,
      playback: {
        mode: "segmented-animations" as const,
        startAnimation: animations[0]!,
        loopAnimation: animations[1]!,
        endAnimation: animations[2]!,
      },
    });
  }
  fail(`${label}.kind invalid.`);
}

function parseImageStringParent(value: unknown, label: string) {
  if (value === undefined) return freeze({ kind: "popup-root" as const });
  const record = object(value, label);
  if (record.kind === "popup-root") {
    keys(record, ["kind"], label);
    return freeze({ kind: "popup-root" as const });
  }
  if (record.kind === "vni-text-layer") {
    keys(record, ["kind", "vniLayerId", "textLayerId"], label);
    return freeze({
      kind: "vni-text-layer" as const,
      vniLayerId: nonEmpty(record.vniLayerId, `${label}.vniLayerId`),
      textLayerId: nonEmpty(record.textLayerId, `${label}.textLayerId`),
    });
  }
  fail(`${label}.kind must be popup-root or vni-text-layer.`);
}

function parseSegments(value: unknown, label: string): readonly PopupSegment[] {
  if (!Array.isArray(value) || !value.length)
    fail(`${label} must be non-empty.`);
  const values = value.map((item) => {
    if (!SEGMENTS.includes(item as PopupSegment))
      fail(`${label} contains invalid segment.`);
    return item as PopupSegment;
  });
  unique(values, label);
  return Object.freeze(SEGMENTS.filter((item) => values.includes(item)));
}
function allTiers(spec: AwardCelebrationSpec) {
  return [spec.base, spec.standard, ...spec.celebrationTiers];
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const actual = Object.keys(record);
  for (const key of actual)
    if (!allowed.includes(key)) fail(`${label} contains unknown key: ${key}`);
  for (const key of allowed)
    if (!Object.hasOwn(record, key)) fail(`${label} missing key: ${key}`);
}
function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !IDS.test(value))
    fail(`${label} must be a lowercase kebab-case id.`);
  return value;
}
function path(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} must be string.`);
  try {
    return value.includes("/")
      ? assertCanonicalPackagePath(value, { requireLowercase: true })
      : assertEditorAssetKey(value);
  } catch (error) {
    fail(`${label}: ${message(error)}`);
  }
}
function owned(value: unknown, label: string, extension?: string): string {
  const result = path(value, label);
  if (
    (result.includes("/") && !OWNED_PATH.test(result)) ||
    (extension && !result.toLowerCase().endsWith(extension))
  )
    fail(`${label} must use full SHA-256 content-addressed assets path.`);
  return result;
}

function resourceKey(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} must be string.`);
  if (IDS.test(value)) return value;
  try {
    return assertEditorAssetKey(value);
  } catch (error) {
    fail(`${label}: ${message(error)}`);
  }
}

function resourceRoot(resource: PopupResourceSpec): string {
  if (resource.kind === "image" || resource.kind === "font")
    return resource.path;
  if (resource.kind === "image-string") return resource.manifest;
  if (resource.kind === "vni") return resource.project;
  return resource.skeleton;
}
function nonEmptySingleLine(value: unknown, label: string): string {
  const result = nonEmpty(value, label);
  if (/[\n\r\u2028\u2029]/u.test(result))
    fail(`${label} must be a single line.`);
  return result;
}
function printable(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    [...value].some((character) => {
      const point = character.codePointAt(0)!;
      return point <= 0x1f || point === 0x7f;
    })
  )
    fail(`${label} contains control characters.`);
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
function positiveSafe(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    fail(`${label} must be a positive safe integer.`);
  return value as number;
}
function nonNegativeSafe(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label} must be a non-negative safe integer.`);
  return value as number;
}
function safeRange(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    fail(`${label} out of range.`);
  return value as number;
}
function unit(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result < 0 || result > 1) fail(`${label} must be between 0 and 1.`);
  return result;
}
function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    fail(`${label} must be non-empty.`);
  return value;
}
function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) fail(`${label} must be unique.`);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>))
      freeze(child);
    Object.freeze(value);
  }
  return value;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function fail(message: string): never {
  throw new Error(message);
}
