import {
  getDefaultEasing,
  isSupportedAnimationType,
  isSupportedEasing,
} from "./animation-sampler";
import type {
  V5GAnimationConfig,
  V5GAnimationParamValue,
  V5GAnimationType,
  V5GAssetConfig,
  V5GBlendMode,
  V5GLayerConfig,
  V5GProjectConfig,
  V5GTransformConfig,
} from "../v5g/types";

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
  const layers = assertArray(project.layers, "project.layers").map(
    (layer, index) => assertLayer(layer, index),
  );
  const particles = assertArray(
    project.particles,
    "project.particles",
  ) as V5GProjectConfig["particles"];

  return {
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
    stage: {
      width: stageWidth,
      height: stageHeight,
      coordinate: stageCoordinate,
      duration: stageDuration,
      backgroundColor: stageBackgroundColor,
    },
    assets,
    layers,
    particles,
  };
}

export function validateV5GProject(project: V5GProjectConfig): void {
  if (!/^V5G_0\.\d+$/u.test(project.schemaVersion)) {
    throw new Error(
      `Unsupported V5G schemaVersion: ${project.schemaVersion}. Expected V5G_0.x.`,
    );
  }
  if (project.editor.name !== "victory_editor_v5_g") {
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
  for (const paramKey of OPTIONAL_BOOLEAN_PARAMS[animation.type] ?? []) {
    assertOptionalBoolean(animation, paramKey);
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
  };
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
