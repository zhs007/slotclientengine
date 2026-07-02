import {
  getDefaultEasing,
  isSupportedAnimationType,
  isSupportedEasing,
} from "./animation-sampler.js";
import {
  getVNIProjectRenderGroupOrder,
  normalizeVNIProjectLayerGroups,
} from "./layer-groups.js";
import type {
  V5GAnimationConfig,
  V5GAnimationParamValue,
  V5GAnimationType,
  V5GAssetConfig,
  V5GBlendMode,
  V5GBundleManifest,
  V5GBundleManifestEntry,
  V5GExportProfileConfig,
  V5GLayerConfig,
  V5GLayerGroupConfig,
  V5GLayerMaskConfig,
  V5GProjectConfig,
  V5GTransformConfig,
} from "./types.js";

const SUPPORTED_EDITOR_NAMES = ["victory_editor_v5_g", "VNI"] as const;

const SUPPORTED_BLEND_MODES: readonly V5GBlendMode[] = [
  "normal",
  "add",
  "screen",
  "multiply",
  "lighten",
];

const REQUIRED_NUMERIC_PARAMS: Readonly<
  Record<V5GAnimationType, readonly string[]>
> = {
  idle: [],
  move: ["fromX", "fromY", "toX", "toY"],
  fade: ["fromOpacity", "toOpacity"],
  scale_up: ["fromScaleX", "fromScaleY", "toScaleX", "toScaleY"],
  scale_down: ["fromScaleX", "fromScaleY", "toScaleX", "toScaleY"],
  scale_in: ["fromScale", "toScale"],
  scale_out: ["fromScale", "toScale"],
  pop: ["peakScale", "settleScale", "peakAt"],
  shake: ["amplitudeX", "amplitudeY", "cycles"],
  blink: ["minOpacity", "maxOpacity", "blinks", "endOpacity"],
  rotate: ["fromRotation", "toRotation"],
  slide_in: ["fromX", "fromY", "toX", "toY"],
  slide_out: ["fromX", "fromY", "toX", "toY"],
  bounce_in: ["fromScale", "toScale", "overshoot"],
  pulse: ["scale", "cycles"],
  float: ["amplitude", "cycles"],
  swing: ["angle", "cycles"],
  particles: ["count", "spread", "speed", "size", "gravity"],
  particle_twinkle: [
    "radius",
    "count",
    "spawnInterval",
    "twinkleDuration",
    "batchMin",
    "batchMax",
    "size",
  ],
  particle_wall: [
    "emitterWidth",
    "direction",
    "spreadAngle",
    "speed",
    "lifetimeMin",
    "lifetimeMax",
    "spawnRate",
    "size",
    "gravity",
    "startScaleMin",
    "startScaleMax",
    "endScaleMin",
    "endScaleMax",
  ],
  particle_combo: [
    "count",
    "size",
    "sourceOpacity",
    "spawnMode",
    "spawnRadius",
    "spawnRatio",
    "targetX",
    "targetY",
    "travelMode",
    "curve",
    "orbitRadius",
    "orbitTurns",
    "orbitSpeed",
    "orbitRatio",
    "staggerRatio",
    "trailCount",
    "trailSpacing",
    "trailFade",
    "vanishMode",
    "vanishRatio",
    "flashScale",
    "flashIntensity",
  ],
  particle_stream: [
    "spawnRate",
    "lifetime",
    "spread",
    "speed",
    "emissionAngle",
    "emissionSpreadAngle",
    "size",
    "gravity",
    "trailCount",
    "trailSpacing",
    "trailFade",
    "randomRotationDegrees",
    "spinSpeed",
  ],
  chaser_light: [
    "totalCount",
    "spacing",
    "lightDuration",
    "interval",
    "trajectory",
    "radius",
    "centerX",
    "centerY",
    "endX",
    "endY",
    "curve",
    "lightSize",
    "dimAlpha",
  ],
  shatter: [
    "count",
    "pieceSize",
    "force",
    "impactAngle",
    "spreadAngle",
    "gravity",
    "spin",
    "sourceOpacity",
  ],
  glow: ["intensity", "spread", "minAlpha", "maxAlpha", "pulses", "blendMode"],
  safe_glow: ["spread", "minOpacity", "maxOpacity", "pulses"],
  squash_stretch: [
    "squashAngle",
    "squashAmount",
    "decayOscillateCount",
    "fromX",
    "fromY",
    "toX",
    "toY",
  ],
};

const OPTIONAL_BOOLEAN_PARAMS: Readonly<
  Partial<Record<V5GAnimationType, readonly string[]>>
> = {
  slide_in: ["fadeIn"],
  slide_out: ["fadeOut"],
  bounce_in: ["fadeIn"],
  scale_in: ["fadeIn"],
  scale_out: ["fadeOut"],
  shake: ["decay"],
  particles: ["fadeOut"],
  particle_stream: ["fadeOut", "rotateParticles", "randomRotation"],
  chaser_light: ["keepOriginal"],
  particle_wall: ["fadeOut"],
  shatter: ["fadeOut"],
  glow: ["keepOriginal"],
  safe_glow: ["keepOriginal"],
};

const OPTIONAL_NUMERIC_PARAMS: Readonly<
  Partial<Record<V5GAnimationType, readonly string[]>>
> = {
  particles: [
    "emissionAngle",
    "emissionSpreadAngle",
    "trailCount",
    "trailSpacing",
    "trailFade",
    "randomRotationDegrees",
    "spinSpeed",
  ],
};

export function assertV5GProject(value: unknown): V5GProjectConfig {
  const project = assertRecord(value, "V5G project");
  const schemaVersion = assertString(
    project.schemaVersion,
    "project.schemaVersion",
  );

  const editor = assertRecord(project.editor, "project.editor");
  const editorName = assertString(editor.name, "project.editor.name");
  const editorVersion = assertString(editor.version, "project.editor.version");

  const engineTarget = assertRecord(
    project.engineTarget,
    "project.engineTarget",
  );
  if (engineTarget.name !== "cocos_creator") {
    throw new Error("V5G project engineTarget.name must be cocos_creator.");
  }
  const engineTargetVersion = assertString(
    engineTarget.version,
    "project.engineTarget.version",
  );

  const projectName = assertString(project.name, "project.name");
  const exportProfile =
    project.exportProfile === undefined
      ? undefined
      : assertExportProfile(project.exportProfile, "project.exportProfile");

  const stage = assertRecord(project.stage, "project.stage");
  const stageWidth = assertNumber(stage.width, "project.stage.width");
  const stageHeight = assertNumber(stage.height, "project.stage.height");
  const stageCoordinate = assertString(
    stage.coordinate,
    "project.stage.coordinate",
  ) as V5GProjectConfig["stage"]["coordinate"];
  const stageDuration = assertNumber(stage.duration, "project.stage.duration");
  const stageBackgroundColor = assertString(
    stage.backgroundColor,
    "project.stage.backgroundColor",
  );

  const assets = assertArray(project.assets, "project.assets").map(
    (asset, index) => assertAsset(asset, index),
  );
  const layerGroups =
    project.layerGroups === undefined
      ? undefined
      : assertArray(project.layerGroups, "project.layerGroups").map(
          (group, index) => assertLayerGroup(group, index),
        );
  const layers = assertArray(project.layers, "project.layers").map(
    (layer, index) => assertLayer(layer, index),
  );
  const particles = assertArray(
    project.particles,
    "project.particles",
  ) as V5GProjectConfig["particles"];

  return normalizeVNIProjectLayerGroups({
    schemaVersion,
    editor: {
      name: editorName,
      version: editorVersion,
    },
    engineTarget: {
      name: "cocos_creator",
      version: engineTargetVersion,
    },
    name: projectName,
    exportProfile,
    stage: {
      width: stageWidth,
      height: stageHeight,
      coordinate: stageCoordinate,
      duration: stageDuration,
      backgroundColor: stageBackgroundColor,
    },
    assets,
    layerGroups,
    layers,
    particles,
  });
}

export function validateV5GProject(project: V5GProjectConfig): void {
  if (!isSupportedProjectSchemaVersion(project.schemaVersion)) {
    throw new Error(
      `Unsupported V5G schemaVersion: ${project.schemaVersion}. Expected V5G_0.x or VNI_0.x.`,
    );
  }
  if (
    !SUPPORTED_EDITOR_NAMES.includes(
      project.editor.name as (typeof SUPPORTED_EDITOR_NAMES)[number],
    )
  ) {
    throw new Error(`Unsupported V5G editor: ${project.editor.name}.`);
  }
  if (project.stage.coordinate !== "center") {
    throw new Error(
      `Unsupported V5G coordinate mode: ${project.stage.coordinate}.`,
    );
  }
  assertPositiveFinite(project.stage.width, "project.stage.width");
  assertPositiveFinite(project.stage.height, "project.stage.height");
  assertPositiveFinite(project.stage.duration, "project.stage.duration");
  parseColorHex(project.stage.backgroundColor);

  if (project.particles.length > 0) {
    throw new Error(
      "Unsupported V5G top-level particles: layer particle animations are supported, project.particles is not implemented.",
    );
  }
  if (project.exportProfile) {
    validateExportProfile(project.exportProfile, "project.exportProfile");
  }
  validateLayerGroups(project);

  const assetsById = new Map<string, V5GAssetConfig>();
  const assetPaths = new Set<string>();
  for (const asset of project.assets) {
    if (assetsById.has(asset.id)) {
      throw new Error(`Duplicate V5G asset id: ${asset.id}.`);
    }
    if (assetPaths.has(asset.path)) {
      throw new Error(`Duplicate V5G asset path: ${asset.path}.`);
    }
    if (asset.type !== "image") {
      throw new Error(`Unsupported V5G asset type: ${asset.type}.`);
    }
    assertPositiveFinite(asset.width, `asset "${asset.id}" width`);
    assertPositiveFinite(asset.height, `asset "${asset.id}" height`);
    validateAssetFileMetadata(asset);
    assetsById.set(asset.id, asset);
    assetPaths.add(asset.path);
  }

  const layerIds = new Set<string>();
  for (const layer of project.layers) {
    if (layerIds.has(layer.id)) {
      throw new Error(`Duplicate V5G layer id: ${layer.id}.`);
    }
    layerIds.add(layer.id);
    assertSupportedLayer(layer, assetsById);
    for (const animation of layer.animations) {
      assertSupportedAnimation(animation, layer.id, project.stage.duration);
    }
  }
  validateLayerMasks(project, layerIds);

  getVNIProjectRenderGroupOrder(project);
}

export function assertV5GBundleManifest(value: unknown): V5GBundleManifest {
  const manifest = assertRecord(value, "VNI bundle manifest");
  const type = assertString(manifest.type, "manifest.type");
  if (type !== "vni_export_bundle") {
    throw new Error(`Unsupported VNI bundle manifest type: ${type}.`);
  }
  const version = assertString(manifest.version, "manifest.version");
  const exports = assertArray(manifest.exports, "manifest.exports").map(
    (entry, index) => assertBundleManifestEntry(entry, index),
  );
  return {
    type: "vni_export_bundle",
    version,
    exports,
  };
}

export function validateV5GBundleManifest(manifest: V5GBundleManifest): void {
  if (!/^VNI_0\.\d+$/u.test(manifest.version)) {
    throw new Error(
      `Unsupported VNI bundle manifest version: ${manifest.version}. Expected VNI_0.x.`,
    );
  }
  const ids = new Set<string>();
  for (const entry of manifest.exports) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate VNI bundle export id: ${entry.id}.`);
    }
    ids.add(entry.id);
    validateExportProfile(
      {
        id: entry.id,
        purpose: entry.purpose,
        assetScale: entry.assetScale,
        label: entry.label,
      },
      `manifest export "${entry.id}"`,
    );
    validateBundleManifestEntryPath(entry);
  }
}

export function validateManifestProjectProfile(
  entry: V5GBundleManifestEntry,
  project: V5GProjectConfig,
): void {
  const profile = project.exportProfile;
  if (!profile) {
    throw new Error(
      `VNI bundle export "${entry.id}" project is missing exportProfile.`,
    );
  }
  if (
    profile.id !== entry.id ||
    profile.purpose !== entry.purpose ||
    profile.assetScale !== entry.assetScale
  ) {
    throw new Error(
      `VNI bundle export "${entry.id}" profile mismatch: manifest ${entry.purpose}/${entry.assetScale}, project ${profile.id}/${profile.purpose}/${profile.assetScale}.`,
    );
  }
}

export function parseColorHex(value: string): number {
  if (!/^#[0-9a-fA-F]{6}$/u.test(value)) {
    throw new Error(`Invalid V5G background color: ${value}.`);
  }
  return Number.parseInt(value.slice(1), 16);
}

export function assertSupportedLayer(
  layer: V5GLayerConfig,
  assetsById = new Map<string, V5GAssetConfig>(),
): void {
  if (layer.parentId !== null) {
    throw new Error(`Unsupported V5G parentId on layer "${layer.id}".`);
  }
  if (layer.type === "group") {
    throw new Error("Unsupported V5G layer type: group");
  }
  if (layer.type !== "image" && layer.type !== "text") {
    throw new Error(`Unsupported V5G layer type: ${layer.type}.`);
  }
  if (layer.type === "image") {
    if (!layer.assetId) {
      throw new Error(`V5G image layer "${layer.id}" requires assetId.`);
    }
    const asset = assetsById.get(layer.assetId);
    if (!asset) {
      throw new Error(
        `V5G image layer "${layer.id}" references missing asset "${layer.assetId}".`,
      );
    }
    if (asset.type !== "image") {
      throw new Error(
        `V5G image layer "${layer.id}" asset "${asset.id}" must be image.`,
      );
    }
  }
  if (layer.type === "text" && layer.assetId !== null) {
    throw new Error(`V5G text layer "${layer.id}" must not reference assetId.`);
  }
  if ((layer.keyframes ?? []).length > 0) {
    throw new Error(`Unsupported V5G keyframes on layer "${layer.id}".`);
  }
  validateTransform(layer.transform, `layer "${layer.id}" transform`);
  assertFiniteRange(layer.opacity, 0, 1, `layer "${layer.id}" opacity`);
  if (!SUPPORTED_BLEND_MODES.includes(layer.blendMode)) {
    throw new Error(`Unsupported V5G blendMode: ${layer.blendMode}.`);
  }
}

export function assertSupportedAnimation(
  animation: V5GAnimationConfig,
  layerId = "unknown",
  stageDuration = Number.POSITIVE_INFINITY,
): void {
  if (!isSupportedAnimationType(animation.type)) {
    throw new Error(`Unsupported V5G animation type: ${animation.type}`);
  }
  assertFiniteRange(
    animation.startTime,
    0,
    Number.POSITIVE_INFINITY,
    `animation "${animation.id}" startTime`,
  );
  assertPositiveFinite(
    animation.duration,
    `animation "${animation.id}" duration`,
  );
  if (animation.startTime + animation.duration > stageDuration) {
    throw new Error(
      `V5G animation "${animation.id}" on layer "${layerId}" exceeds stage.duration.`,
    );
  }
  const easing = animation.params.easing;
  if (easing !== undefined) {
    if (typeof easing !== "string" || !isSupportedEasing(easing)) {
      throw new Error(`Unsupported V5G easing: ${String(easing)}`);
    }
  } else {
    getDefaultEasing(animation.type);
  }

  for (const paramKey of REQUIRED_NUMERIC_PARAMS[animation.type]) {
    const value = animation.params[paramKey];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `V5G animation "${animation.id}" ${animation.type} requires numeric param "${paramKey}".`,
      );
    }
  }
  assertOptionalNumber(animation, "baseX");
  assertOptionalNumber(animation, "baseY");
  for (const paramKey of OPTIONAL_NUMERIC_PARAMS[animation.type] ?? []) {
    assertOptionalNumber(animation, paramKey);
  }
  for (const paramKey of OPTIONAL_BOOLEAN_PARAMS[animation.type] ?? []) {
    assertOptionalBoolean(animation, paramKey);
  }
  validateAnimationParamRanges(animation);
}

function validateAnimationParamRanges(animation: V5GAnimationConfig): void {
  if (animation.type === "chaser_light") {
    assertFiniteRange(
      getNumericParamForValidation(animation, "totalCount"),
      1,
      200,
      `animation "${animation.id}" chaser_light totalCount`,
    );
  }
}

function validateLayerMasks(
  project: V5GProjectConfig,
  layerIds: ReadonlySet<string>,
): void {
  for (const layer of project.layers) {
    const mask = layer.mask;
    if (!mask) continue;
    if (mask.mode !== "alpha") {
      throw new Error(
        `Unsupported VNI mask mode on layer "${layer.id}": ${mask.mode}.`,
      );
    }
    if (
      mask.compositeMode !== "legacy_alpha" &&
      mask.compositeMode !== "precompose_light_alpha"
    ) {
      throw new Error(
        `Unsupported VNI mask compositeMode on layer "${layer.id}": ${mask.compositeMode}.`,
      );
    }
    if (!mask.enabled) continue;
    if (!mask.sourceLayerId) {
      throw new Error(
        `VNI mask on layer "${layer.id}" requires sourceLayerId when enabled.`,
      );
    }
    if (mask.sourceLayerId === layer.id) {
      throw new Error(
        `VNI mask on layer "${layer.id}" must not reference itself.`,
      );
    }
    if (!layerIds.has(mask.sourceLayerId)) {
      throw new Error(
        `VNI mask on layer "${layer.id}" references missing source layer "${mask.sourceLayerId}".`,
      );
    }
  }
}

function validateLayerGroups(project: V5GProjectConfig): void {
  if (project.layerGroups.length === 0) {
    throw new Error("VNI project.layerGroups must be a non-empty array.");
  }

  const groupIds = new Set<string>();
  const groupOrders = new Set<number>();
  for (const group of project.layerGroups) {
    if (groupIds.has(group.id)) {
      throw new Error(`Duplicate VNI layer group id: ${group.id}.`);
    }
    groupIds.add(group.id);
    if (!Number.isFinite(group.order)) {
      throw new Error(`VNI layer group "${group.id}" order must be finite.`);
    }
    if (groupOrders.has(group.order)) {
      throw new Error(`Duplicate VNI layer group order: ${group.order}.`);
    }
    groupOrders.add(group.order);
  }

  for (const layer of project.layers) {
    if (!layer.groupId) {
      throw new Error(`VNI layer "${layer.id}" is missing groupId.`);
    }
    if (!groupIds.has(layer.groupId)) {
      throw new Error(
        `VNI layer "${layer.id}" references missing layer group "${layer.groupId}".`,
      );
    }
  }
}

function assertAsset(value: unknown, index: number): V5GAssetConfig {
  const asset = assertRecord(value, `project.assets[${index}]`);
  return {
    id: assertString(asset.id, `project.assets[${index}].id`),
    type: assertString(
      asset.type,
      `project.assets[${index}].type`,
    ) as V5GAssetConfig["type"],
    path: assertString(asset.path, `project.assets[${index}].path`),
    originalName: assertString(
      asset.originalName,
      `project.assets[${index}].originalName`,
    ),
    width: assertNumber(asset.width, `project.assets[${index}].width`),
    height: assertNumber(asset.height, `project.assets[${index}].height`),
    fileWidth: assertOptionalNumberField(
      asset.fileWidth,
      `project.assets[${index}].fileWidth`,
    ),
    fileHeight: assertOptionalNumberField(
      asset.fileHeight,
      `project.assets[${index}].fileHeight`,
    ),
    fileScale: assertOptionalNumberField(
      asset.fileScale,
      `project.assets[${index}].fileScale`,
    ),
  };
}

function assertExportProfile(
  value: unknown,
  path: string,
): V5GExportProfileConfig {
  const profile = assertRecord(value, path);
  return {
    id: assertString(profile.id, `${path}.id`),
    purpose: assertString(
      profile.purpose,
      `${path}.purpose`,
    ) as V5GExportProfileConfig["purpose"],
    assetScale: assertNumber(profile.assetScale, `${path}.assetScale`),
    label:
      profile.label === undefined
        ? undefined
        : assertString(profile.label, `${path}.label`),
  };
}

function assertBundleManifestEntry(
  value: unknown,
  index: number,
): V5GBundleManifestEntry {
  const entry = assertRecord(value, `manifest.exports[${index}]`);
  return {
    id: assertString(entry.id, `manifest.exports[${index}].id`),
    purpose: assertString(
      entry.purpose,
      `manifest.exports[${index}].purpose`,
    ) as V5GBundleManifestEntry["purpose"],
    assetScale: assertNumber(
      entry.assetScale,
      `manifest.exports[${index}].assetScale`,
    ),
    path: assertString(entry.path, `manifest.exports[${index}].path`),
    label:
      entry.label === undefined
        ? undefined
        : assertString(entry.label, `manifest.exports[${index}].label`),
  };
}

function validateBundleManifestEntryPath(entry: V5GBundleManifestEntry): void {
  if (!entry.path.endsWith(".json")) {
    throw new Error(`VNI bundle export "${entry.id}" path must be JSON.`);
  }
  if (
    entry.path.startsWith("/") ||
    entry.path.startsWith("\\") ||
    entry.path.includes("\\")
  ) {
    throw new Error(
      `VNI bundle export "${entry.id}" path must be a relative POSIX path.`,
    );
  }
  const parts = entry.path.split("/");
  if (
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error(
      `VNI bundle export "${entry.id}" path must not contain empty or parent segments.`,
    );
  }
}

function assertLayer(value: unknown, index: number): V5GLayerConfig {
  const layer = assertRecord(value, `project.layers[${index}]`);
  return {
    id: assertString(layer.id, `project.layers[${index}].id`),
    name: assertString(layer.name, `project.layers[${index}].name`),
    type: assertString(
      layer.type,
      `project.layers[${index}].type`,
    ) as V5GLayerConfig["type"],
    assetId:
      layer.assetId === null
        ? null
        : assertString(layer.assetId, `project.layers[${index}].assetId`),
    parentId:
      layer.parentId === null
        ? null
        : assertString(layer.parentId, `project.layers[${index}].parentId`),
    groupId:
      layer.groupId === undefined
        ? undefined
        : assertString(layer.groupId, `project.layers[${index}].groupId`),
    visible: assertBoolean(layer.visible, `project.layers[${index}].visible`),
    locked: assertBoolean(layer.locked, `project.layers[${index}].locked`),
    transform: assertTransform(
      layer.transform,
      `project.layers[${index}].transform`,
    ),
    opacity: assertNumber(layer.opacity, `project.layers[${index}].opacity`),
    blendMode: assertString(
      layer.blendMode,
      `project.layers[${index}].blendMode`,
    ) as V5GBlendMode,
    text:
      layer.text === undefined
        ? undefined
        : assertString(layer.text, `project.layers[${index}].text`),
    mask:
      layer.mask === undefined
        ? undefined
        : assertLayerMask(layer.mask, `project.layers[${index}].mask`),
    animations: assertArray(
      layer.animations,
      `project.layers[${index}].animations`,
    ).map((animation, animationIndex) =>
      assertAnimation(animation, index, animationIndex),
    ),
    keyframes: assertArray(
      layer.keyframes ?? [],
      `project.layers[${index}].keyframes`,
    ) as V5GLayerConfig["keyframes"],
  };
}

function assertLayerMask(value: unknown, path: string): V5GLayerMaskConfig {
  const mask = assertRecord(value, path);
  return {
    enabled: assertBoolean(mask.enabled, `${path}.enabled`),
    sourceLayerId:
      mask.sourceLayerId === null
        ? null
        : assertString(mask.sourceLayerId, `${path}.sourceLayerId`),
    mode: assertString(mask.mode, `${path}.mode`) as V5GLayerMaskConfig["mode"],
    compositeMode: assertString(
      mask.compositeMode,
      `${path}.compositeMode`,
    ) as V5GLayerMaskConfig["compositeMode"],
    showSourceLayer: assertBoolean(
      mask.showSourceLayer,
      `${path}.showSourceLayer`,
    ),
  };
}

function assertLayerGroup(value: unknown, index: number): V5GLayerGroupConfig {
  const group = assertRecord(value, `project.layerGroups[${index}]`);
  return {
    id: assertString(group.id, `project.layerGroups[${index}].id`),
    name: assertString(group.name, `project.layerGroups[${index}].name`),
    visible: assertBoolean(
      group.visible,
      `project.layerGroups[${index}].visible`,
    ),
    collapsed: assertBoolean(
      group.collapsed,
      `project.layerGroups[${index}].collapsed`,
    ),
    order: assertNumber(group.order, `project.layerGroups[${index}].order`),
  };
}

function assertAnimation(
  value: unknown,
  layerIndex: number,
  animationIndex: number,
): V5GAnimationConfig {
  const animation = assertRecord(
    value,
    `project.layers[${layerIndex}].animations[${animationIndex}]`,
  );
  const params = assertRecord(
    animation.params,
    `project.layers[${layerIndex}].animations[${animationIndex}].params`,
  );
  return {
    id: assertString(
      animation.id,
      `project.layers[${layerIndex}].animations[${animationIndex}].id`,
    ),
    type: assertString(
      animation.type,
      `project.layers[${layerIndex}].animations[${animationIndex}].type`,
    ) as V5GAnimationConfig["type"],
    name:
      animation.name === undefined
        ? undefined
        : assertString(
            animation.name,
            `project.layers[${layerIndex}].animations[${animationIndex}].name`,
          ),
    startTime: assertNumber(
      animation.startTime,
      `project.layers[${layerIndex}].animations[${animationIndex}].startTime`,
    ),
    duration: assertNumber(
      animation.duration,
      `project.layers[${layerIndex}].animations[${animationIndex}].duration`,
    ),
    enabled: assertBoolean(
      animation.enabled,
      `project.layers[${layerIndex}].animations[${animationIndex}].enabled`,
    ),
    seed: assertNumber(
      animation.seed,
      `project.layers[${layerIndex}].animations[${animationIndex}].seed`,
    ),
    params: params as Record<string, V5GAnimationParamValue>,
  };
}

function assertTransform(value: unknown, path: string): V5GTransformConfig {
  const transform = assertRecord(value, path);
  return {
    x: assertNumber(transform.x, `${path}.x`),
    y: assertNumber(transform.y, `${path}.y`),
    scaleX: assertNumber(transform.scaleX, `${path}.scaleX`),
    scaleY: assertNumber(transform.scaleY, `${path}.scaleY`),
    rotation: assertNumber(transform.rotation, `${path}.rotation`),
    anchorX: assertNumber(transform.anchorX, `${path}.anchorX`),
    anchorY: assertNumber(transform.anchorY, `${path}.anchorY`),
  };
}

function validateTransform(transform: V5GTransformConfig, path: string): void {
  assertFinite(transform.x, `${path}.x`);
  assertFinite(transform.y, `${path}.y`);
  assertFinite(transform.scaleX, `${path}.scaleX`);
  assertFinite(transform.scaleY, `${path}.scaleY`);
  assertFinite(transform.rotation, `${path}.rotation`);
  assertFiniteRange(transform.anchorX, 0, 1, `${path}.anchorX`);
  assertFiniteRange(transform.anchorY, 0, 1, `${path}.anchorY`);
}

function assertOptionalNumber(
  animation: V5GAnimationConfig,
  key: string,
): void {
  const value = animation.params[key];
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a finite number.`,
    );
  }
}

function assertOptionalBoolean(
  animation: V5GAnimationConfig,
  key: string,
): void {
  const value = animation.params[key];
  if (value === undefined) return;
  if (typeof value !== "boolean") {
    throw new Error(
      `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a boolean.`,
    );
  }
}

function getNumericParamForValidation(
  animation: V5GAnimationConfig,
  key: string,
): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} requires numeric param "${key}".`,
  );
}

function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  return value;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return value;
}

function assertOptionalNumberField(
  value: unknown,
  path: string,
): number | undefined {
  if (value === undefined) return undefined;
  return assertNumber(value, path);
}

function assertNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean.`);
  }
  return value;
}

function assertPositiveFinite(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
}

function assertFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
}

function assertFiniteRange(
  value: number,
  min: number,
  max: number,
  path: string,
): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${path} must be in range ${min}..${max}.`);
  }
}

function isSupportedProjectSchemaVersion(value: string): boolean {
  return /^V5G_0\.\d+$/u.test(value) || /^VNI_0\.\d+$/u.test(value);
}

function validateAssetFileMetadata(asset: V5GAssetConfig): void {
  const fields = [asset.fileWidth, asset.fileHeight, asset.fileScale];
  const presentCount = fields.filter((value) => value !== undefined).length;
  if (presentCount === 0) return;
  if (presentCount !== fields.length) {
    throw new Error(
      `V5G asset "${asset.id}" fileWidth/fileHeight/fileScale must be provided together.`,
    );
  }
  if (
    asset.fileWidth === undefined ||
    asset.fileHeight === undefined ||
    asset.fileScale === undefined
  ) {
    throw new Error(
      `V5G asset "${asset.id}" fileWidth/fileHeight/fileScale must be provided together.`,
    );
  }
  assertPositiveInteger(asset.fileWidth, `asset "${asset.id}" fileWidth`);
  assertPositiveInteger(asset.fileHeight, `asset "${asset.id}" fileHeight`);
  const fileWidth = asset.fileWidth;
  const fileHeight = asset.fileHeight;
  const fileScale = asset.fileScale;
  assertFiniteRange(
    fileScale,
    Number.MIN_VALUE,
    1,
    `asset "${asset.id}" fileScale`,
  );

  const expectedFileWidth = Math.max(1, Math.round(asset.width * fileScale));
  const expectedFileHeight = Math.max(1, Math.round(asset.height * fileScale));
  if (fileWidth !== expectedFileWidth || fileHeight !== expectedFileHeight) {
    throw new Error(
      `V5G asset "${asset.id}" file size metadata mismatch: expected ${expectedFileWidth}x${expectedFileHeight} from logical ${asset.width}x${asset.height} at scale ${fileScale}, got ${fileWidth}x${fileHeight}.`,
    );
  }
}

function validateExportProfile(
  profile: V5GExportProfileConfig,
  path: string,
): void {
  if (profile.id.length === 0) {
    throw new Error(`${path}.id must be a non-empty string.`);
  }
  if (profile.purpose !== "editing" && profile.purpose !== "runtime") {
    throw new Error(`${path}.purpose must be editing or runtime.`);
  }
  assertFiniteRange(
    profile.assetScale,
    Number.MIN_VALUE,
    1,
    `${path}.assetScale`,
  );
}

function assertPositiveInteger(value: number | undefined, path: string): void {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${path} must be an integer.`);
  }
}

export const assertVNIProject = assertV5GProject;
export const validateVNIProject = validateV5GProject;
export const assertVNIBundleManifest = assertV5GBundleManifest;
export const validateVNIBundleManifest = validateV5GBundleManifest;
