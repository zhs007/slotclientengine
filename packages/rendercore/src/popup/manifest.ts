import { assertCanonicalPackagePath } from "@slotclientengine/browserartifactio";
import { assertEditorAssetKey } from "@slotclientengine/editorresource";
import type {
  AwardCelebrationPopupManifestV1,
  AwardCelebrationPopupManifestV2,
  AwardCelebrationPopupManifestV3,
  AwardCelebrationSpec,
  AwardCelebrationTier,
  AwardTierPresentation,
  PopupAmountFormat,
  PopupManifest,
  PopupLayer,
  PopupManifestV1,
  PopupManifestV2,
  PopupManifestV3,
  PopupOverlayLayer,
  PopupPromptSpec,
  PopupResourceSpec,
  PopupSegment,
  PopupSize,
  PopupTextStyle,
  SpinePopupManifestV1,
  SpinePopupManifestV2,
  SpinePopupManifestV3,
} from "./types.js";

const IDS = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const OWNED_PATH =
  /^assets\/[a-f0-9]{64}\.(?:png|webp|jpg|jpeg|json|atlas|woff2|woff|ttf|otf)$/u;
const SEGMENTS: readonly PopupSegment[] = ["start", "loop", "end"];

interface ParsePopupManifest {
  (value: AwardCelebrationPopupManifestV1): AwardCelebrationPopupManifestV1;
  (value: SpinePopupManifestV1): SpinePopupManifestV1;
  (value: AwardCelebrationPopupManifestV2): AwardCelebrationPopupManifestV2;
  (value: SpinePopupManifestV2): SpinePopupManifestV2;
  (value: AwardCelebrationPopupManifestV3): AwardCelebrationPopupManifestV3;
  (value: SpinePopupManifestV3): SpinePopupManifestV3;
  (value: PopupManifestV1): PopupManifestV1;
  (value: PopupManifestV2): PopupManifestV2;
  (value: PopupManifestV3): PopupManifestV3;
  (value: unknown): PopupManifest;
}

export const parsePopupManifest = ((value: unknown): PopupManifest => {
  const record = object(value, "popup manifest");
  if (record.version !== 1 && record.version !== 2 && record.version !== 3)
    fail("popup manifest.version must be 1, 2, or 3.");
  const version = record.version;
  const modern = version !== 1;
  const commonKeys = [
    "version",
    "kind",
    "id",
    "type",
    ...(version !== 3 ? ["designViewport"] : []),
    "resources",
    ...(modern ? ["name", "adaptation", "backdrop"] : []),
  ];
  keys(
    record,
    record.type === "spine"
      ? [...commonKeys, "spine"]
      : [...commonKeys, "amountFormat", "awardCelebration"],
    "popup manifest",
  );
  if (record.kind !== "popup") fail('popup manifest.kind must be "popup".');
  if (record.type !== "award-celebration" && record.type !== "spine")
    fail('popup manifest.type must be "award-celebration" or "spine".');
  const id = validatePopupId(record.id);
  const viewport =
    version !== 3 ? object(record.designViewport, "designViewport") : undefined;
  if (viewport) keys(viewport, ["width", "height"], "designViewport");
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
    version,
    kind: "popup" as const,
    id,
    ...(modern
      ? {
          name: nonEmptySingleLine(record.name, "name"),
          adaptation: parseAdaptation(
            record.adaptation,
            viewport
              ? {
                  width: positive(viewport.width, "designViewport.width"),
                  height: positive(viewport.height, "designViewport.height"),
                }
              : undefined,
          ),
          backdrop: parseBackdrop(record.backdrop),
        }
      : {}),
    ...(viewport
      ? {
          designViewport: {
            width: positive(viewport.width, "designViewport.width"),
            height: positive(viewport.height, "designViewport.height"),
          },
        }
      : {}),
    resources,
  };
  if (record.type === "spine") {
    const spine = parseSpinePopup(record.spine, resources, version);
    const used = new Set<string>([spine.resource]);
    if (spine.prompt?.font) used.add(spine.prompt.font);
    for (const overlay of spine.overlays ?? [])
      if (overlay.resource) used.add(overlay.resource);
    const unused = Object.keys(resources).filter(
      (resourceId) => !used.has(resourceId),
    );
    if (unused.length)
      fail(`popup production resources 包含未引用项：${unused.join(", ")}`);
    return freeze({ ...base, type: "spine" as const, spine }) as PopupManifest;
  }
  const awardCelebration = parseAwardCelebration(
    record.awardCelebration,
    resources,
    version,
  );
  const used = new Set<string>();
  for (const tier of allTiers(awardCelebration))
    for (const layer of tier.layers)
      if (layer.resource) used.add(layer.resource);
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
  }) as PopupManifest;
}) as ParsePopupManifest;

function parseSpinePopup(
  value: unknown,
  resources: Readonly<Record<string, PopupResourceSpec>>,
  version: 1 | 2 | 3,
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
  if (version === 3 && Object.hasOwn(record, "prompt"))
    fail("spine.prompt is not supported in popup manifest v3.");
  const prompt = Object.hasOwn(record, "prompt")
    ? parsePrompt(record.prompt, resources)
    : undefined;
  const overlays = Object.hasOwn(record, "overlays")
    ? parseOverlays(record.overlays, resources, version)
    : undefined;
  unique(
    [
      ...(prompt ? [String(prompt.order)] : []),
      ...(overlays ?? []).map(({ order }) => String(order)),
    ],
    "spine prompt/overlay order",
  );
  if (
    prompt &&
    (overlays ?? []).some(
      (layer) =>
        (layer.kind === "text" || layer.kind === "image-string") &&
        layer.name === "prompt",
    )
  )
    fail("spine string node name prompt is reserved by spine.prompt.");
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
  const hasFont = Object.hasOwn(record, "font");
  keys(
    record,
    [...(hasFont ? ["font"] : []), "defaultText", "fill", "order", "area"],
    "spine.prompt",
  );
  const font = hasFont
    ? resourceKey(record.font, "spine.prompt.font")
    : undefined;
  if (font && resources[font]?.kind !== "font")
    fail("spine.prompt.font must reference a font resource.");
  const defaultText = nonEmptySingleLine(
    record.defaultText,
    "spine.prompt.defaultText",
  );
  const fill = nonEmpty(record.fill, "spine.prompt.fill");
  const area = object(record.area, "spine.prompt.area");
  keys(area, ["x", "y", "width", "height"], "spine.prompt.area");
  return freeze({
    ...(font ? { font } : {}),
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
  version: 1 | 2 | 3,
): readonly PopupOverlayLayer[] {
  if (!Array.isArray(value)) fail("spine.overlays must be an array.");
  const overlays = value.map((raw, index) => {
    const label = `spine.overlays[${index}]`;
    const record = object(raw, label);
    if (record.kind === "font") fail(`${label}.kind invalid.`);
    const transform = object(record.transform, `${label}.transform`);
    keys(transform, ["x", "y", "scale", "rotation"], `${label}.transform`);
    const parsed = parseLayer(
      {
        ...record,
        transform: { x: transform.x, y: transform.y, scale: transform.scale },
      },
      label,
      resources,
      version,
    );
    if (parsed.kind === "image-string" && parsed.binding !== "manual")
      fail(`${label}.binding must be manual.`);
    const overlay =
      parsed.kind === "image-string"
        ? (({ parent: _parent, ...rest }) => rest)(parsed)
        : parsed;
    return freeze({
      ...overlay,
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
  validateStringNodeNames(overlays, "spine");
  return Object.freeze([...overlays].sort((a, b) => a.order - b.order));
}

export function collectPopupDirectPaths(
  manifest: PopupManifest,
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

function parseAdaptation(value: unknown, designViewport?: PopupSize) {
  const record = object(value, "adaptation");
  keys(record, ["mode", "focus"], "adaptation");
  if (record.mode !== "maximized-focus")
    fail('adaptation.mode must be "maximized-focus".');
  const focus = object(record.focus, "adaptation.focus");
  keys(focus, ["left", "right", "top", "bottom"], "adaptation.focus");
  const result = {
    left: positive(focus.left, "adaptation.focus.left"),
    right: positive(focus.right, "adaptation.focus.right"),
    top: positive(focus.top, "adaptation.focus.top"),
    bottom: positive(focus.bottom, "adaptation.focus.bottom"),
  };
  if (
    designViewport &&
    (result.left > designViewport.width / 2 ||
      result.right > designViewport.width / 2 ||
      result.top > designViewport.height / 2 ||
      result.bottom > designViewport.height / 2)
  )
    fail("adaptation.focus must fit inside designViewport around its center.");
  return freeze({ mode: "maximized-focus" as const, focus: result });
}

function parseBackdrop(value: unknown) {
  const record = object(value, "backdrop");
  keys(record, ["enabled", "color", "alpha"], "backdrop");
  if (typeof record.enabled !== "boolean")
    fail("backdrop.enabled must be boolean.");
  return freeze({
    enabled: record.enabled,
    color: hexColor(record.color, "backdrop.color"),
    alpha: unit(record.alpha, "backdrop.alpha"),
  });
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
  version: 1 | 2 | 3,
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
    const presentation = parseTier(tierRecord, label, resources, version);
    return freeze({
      id: ids[index],
      thresholdMultiplier,
      ...presentation,
    }) as AwardCelebrationTier;
  });
  const result = freeze({
    base: parseTier(record.base, "awardCelebration.base", resources, version),
    standard: parseTier(
      record.standard,
      "awardCelebration.standard",
      resources,
      version,
    ),
    celebrationTiers,
  });
  const variants = allTiers(result).flatMap(({ layers }) => layers);
  validateStringNodeNames(variants, "awardCelebration", true);
  return result;
}

function parseTier(
  value: unknown,
  label: string,
  resources: Readonly<Record<string, PopupResourceSpec>>,
  version: 1 | 2 | 3,
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
    parseLayer(layer, `${label}.layers[${index}]`, resources, version),
  );
  unique(
    layers.map(({ id }) => id),
    `${label}.layers.id`,
  );
  unique(
    layers.map(({ order }) => String(order)),
    `${label}.layers.order`,
  );
  if (
    layers.filter(
      (layer) =>
        layer.kind === "image-string" && layer.binding === "win-amount",
    ).length !== 1
  )
    fail(`${label} 必须恰好包含一个 win-amount ImgNumber 图层。`);
  validateStringNodeNames(layers, label);
  const amount = layers.find(
    (layer): layer is Extract<PopupLayer, { readonly kind: "image-string" }> =>
      layer.kind === "image-string" && layer.binding === "win-amount",
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
  version: 1 | 2 | 3,
): PopupLayer {
  const record = object(value, label);
  const kind = record.kind;
  const hasResource = Object.hasOwn(record, "resource");
  const common = [
    "id",
    "kind",
    "order",
    ...(hasResource ? ["resource"] : []),
    "transform",
    ...(version !== 1 ? ["alpha"] : []),
  ];
  if (!hasResource && (version === 1 || kind !== "text"))
    fail(`${label}.resource is required.`);
  const resourceId = hasResource
    ? resourceKey(record.resource, `${label}.resource`)
    : undefined;
  const resource = resourceId ? resources[resourceId] : undefined;
  const expectedResourceKind = kind === "text" ? "font" : kind;
  if (resourceId && (!resource || resource.kind !== expectedResourceKind))
    fail(`${label}.resource 必须引用相同 kind 的 resource。`);
  const transform = object(record.transform, `${label}.transform`);
  keys(
    transform,
    [
      "x",
      "y",
      "scale",
      ...(Object.hasOwn(transform, "rotation") ? ["rotation"] : []),
    ],
    `${label}.transform`,
  );
  const base = {
    id: identifier(record.id, `${label}.id`),
    order: nonNegativeSafe(record.order, `${label}.order`),
    ...(resourceId ? { resource: resourceId } : {}),
    ...(version !== 1 ? { alpha: unit(record.alpha, `${label}.alpha`) } : {}),
    transform: {
      x: finite(transform.x, `${label}.transform.x`),
      y: finite(transform.y, `${label}.transform.y`),
      scale: positive(transform.scale, `${label}.transform.scale`),
      ...(Object.hasOwn(transform, "rotation")
        ? {
            rotation: finite(transform.rotation, `${label}.transform.rotation`),
          }
        : {}),
    },
  };
  if (kind === "image" || kind === "image-string") {
    if (kind === "image")
      keys(record, [...common, "anchor", "visibleSegments"], label);
    else
      keys(
        record,
        [
          ...common,
          ...(Object.hasOwn(record, "name") ? ["name"] : []),
          "binding",
          ...(Object.hasOwn(record, "defaultText") ? ["defaultText"] : []),
          "anchor",
          ...(Object.hasOwn(record, "parent") ? ["parent"] : []),
          ...(record.binding === "manual" &&
          Object.hasOwn(record, "visibleSegments")
            ? ["visibleSegments"]
            : []),
        ],
        label,
      );
    if (
      kind === "image-string" &&
      record.binding !== "win-amount" &&
      record.binding !== "manual"
    )
      fail(`${label}.binding must be win-amount or manual.`);
    const anchor = object(record.anchor, `${label}.anchor`);
    keys(anchor, ["x", "y"], `${label}.anchor`);
    const parsedAnchor = {
      x: unit(anchor.x, `${label}.anchor.x`),
      y: unit(anchor.y, `${label}.anchor.y`),
    };
    if (kind === "image-string") {
      const binding = record.binding as "win-amount" | "manual";
      const name =
        binding === "win-amount" && record.name === undefined
          ? "win-amount"
          : identifier(record.name, `${label}.name`);
      if (binding === "win-amount" && name !== "win-amount")
        fail(`${label}.name must be win-amount for win-amount binding.`);
      const defaultText =
        binding === "manual"
          ? singleLine(record.defaultText, `${label}.defaultText`)
          : undefined;
      return freeze({
        ...base,
        kind,
        resource: resourceId!,
        name,
        binding,
        ...(defaultText !== undefined ? { defaultText } : {}),
        anchor: parsedAnchor,
        parent: parseImageStringParent(record.parent, `${label}.parent`),
        ...(Object.hasOwn(record, "visibleSegments")
          ? {
              visibleSegments: parseSegments(
                record.visibleSegments,
                `${label}.visibleSegments`,
              ),
            }
          : {}),
      });
    }
    const visibleSegments = parseSegments(
      record.visibleSegments,
      `${label}.visibleSegments`,
    );
    return freeze({
      ...base,
      kind,
      resource: resourceId!,
      anchor: parsedAnchor,
      visibleSegments,
    });
  }
  if (kind === "text") {
    keys(
      record,
      [...common, "name", "defaultText", "anchor", "style", "visibleSegments"],
      label,
    );
    const anchor = object(record.anchor, `${label}.anchor`);
    keys(anchor, ["x", "y"], `${label}.anchor`);
    return freeze({
      ...base,
      kind: "text" as const,
      name: identifier(record.name, `${label}.name`),
      defaultText: singleLine(record.defaultText, `${label}.defaultText`),
      anchor: {
        x: unit(anchor.x, `${label}.anchor.x`),
        y: unit(anchor.y, `${label}.anchor.y`),
      },
      style: parseTextStyle(record.style, `${label}.style`),
      visibleSegments: parseSegments(
        record.visibleSegments,
        `${label}.visibleSegments`,
      ),
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
        resource: resourceId!,
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
      resource: resourceId!,
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
      resource: resourceId!,
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
function parseTextStyle(value: unknown, label: string): PopupTextStyle {
  const record = object(value, label);
  keys(
    record,
    [
      "fontSize",
      "letterSpacing",
      "fill",
      ...(Object.hasOwn(record, "stroke") ? ["stroke"] : []),
      ...(Object.hasOwn(record, "shadow") ? ["shadow"] : []),
      "arcDegrees",
    ],
    label,
  );
  const fillRecord = object(record.fill, `${label}.fill`);
  let fill: PopupTextStyle["fill"];
  if (fillRecord.kind === "solid") {
    keys(fillRecord, ["kind", "color"], `${label}.fill`);
    fill = freeze({
      kind: "solid" as const,
      color: hexColor(fillRecord.color, `${label}.fill.color`),
    });
  } else if (fillRecord.kind === "linear-gradient") {
    keys(fillRecord, ["kind", "angleDegrees", "stops"], `${label}.fill`);
    if (!Array.isArray(fillRecord.stops) || fillRecord.stops.length < 2)
      fail(`${label}.fill.stops must contain at least two stops.`);
    const stops = fillRecord.stops.map((raw, index) => {
      const stopLabel = `${label}.fill.stops[${index}]`;
      const stop = object(raw, stopLabel);
      keys(stop, ["offset", "color"], stopLabel);
      return freeze({
        offset: unit(stop.offset, `${stopLabel}.offset`),
        color: hexColor(stop.color, `${stopLabel}.color`),
      });
    });
    if (stops[0]!.offset !== 0 || stops.at(-1)!.offset !== 1)
      fail(`${label}.fill.stops must start at 0 and end at 1.`);
    for (let index = 1; index < stops.length; index += 1)
      if (stops[index]!.offset <= stops[index - 1]!.offset)
        fail(`${label}.fill.stops offsets must be strictly increasing.`);
    fill = freeze({
      kind: "linear-gradient" as const,
      angleDegrees: finite(
        fillRecord.angleDegrees,
        `${label}.fill.angleDegrees`,
      ),
      stops,
    });
  } else fail(`${label}.fill.kind invalid.`);
  const stroke = Object.hasOwn(record, "stroke")
    ? (() => {
        const raw = object(record.stroke, `${label}.stroke`);
        keys(raw, ["color", "width"], `${label}.stroke`);
        return freeze({
          color: hexColor(raw.color, `${label}.stroke.color`),
          width: nonNegative(raw.width, `${label}.stroke.width`),
        });
      })()
    : undefined;
  const shadow = Object.hasOwn(record, "shadow")
    ? (() => {
        const raw = object(record.shadow, `${label}.shadow`);
        keys(
          raw,
          ["color", "alpha", "blur", "distance", "angleDegrees"],
          `${label}.shadow`,
        );
        return freeze({
          color: hexColor(raw.color, `${label}.shadow.color`),
          alpha: unit(raw.alpha, `${label}.shadow.alpha`),
          blur: nonNegative(raw.blur, `${label}.shadow.blur`),
          distance: nonNegative(raw.distance, `${label}.shadow.distance`),
          angleDegrees: finite(
            raw.angleDegrees,
            `${label}.shadow.angleDegrees`,
          ),
        });
      })()
    : undefined;
  const arcDegrees = finite(record.arcDegrees, `${label}.arcDegrees`);
  if (arcDegrees < -180 || arcDegrees > 180)
    fail(`${label}.arcDegrees must be between -180 and 180.`);
  return freeze({
    fontSize: positive(record.fontSize, `${label}.fontSize`),
    letterSpacing: finite(record.letterSpacing, `${label}.letterSpacing`),
    fill,
    ...(stroke ? { stroke } : {}),
    ...(shadow ? { shadow } : {}),
    arcDegrees,
  });
}
function validateStringNodeNames(
  layers: readonly (PopupLayer | PopupOverlayLayer)[],
  label: string,
  allowVariants = false,
) {
  const kinds = new Map<string, "text" | "image-string">();
  const seenInLayerGroup = new Set<string>();
  for (const layer of layers) {
    if (layer.kind !== "text" && layer.kind !== "image-string") continue;
    const name = layer.name ?? "win-amount";
    const existing = kinds.get(name);
    if (existing && existing !== layer.kind)
      fail(`${label} string node ${name} must keep the same kind.`);
    if (!allowVariants && seenInLayerGroup.has(name))
      fail(`${label} string node names must be unique.`);
    kinds.set(name, layer.kind);
    seenInLayerGroup.add(name);
  }
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

export function validatePopupId(
  value: unknown,
  label = "popup manifest.id",
): string {
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
function singleLine(value: unknown, label: string): string {
  const result = printable(value, label);
  if (result.normalize("NFC") !== result)
    fail(`${label} must use Unicode NFC.`);
  if (/[\n\r\u2028\u2029]/u.test(result))
    fail(`${label} must be a single line.`);
  return result;
}
function hexColor(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/u.test(value)
  )
    fail(`${label} must be canonical lowercase #rrggbb or #rrggbbaa.`);
  return value;
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
