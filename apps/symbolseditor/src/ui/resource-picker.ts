import { resolvePackagePath } from "@slotclientengine/browserartifactio";
import {
  setStateVisual,
  setSymbolImageStringNodes,
  setValuePresentation,
  type EditorAssetKind,
  type EditorStateVisual,
  type SymbolEditorProject,
} from "../model/editor-project.js";
import {
  intersectSpineMetadataNames,
  spineMetadataNames,
  stripLocalRef,
} from "../model/spine-binding-reconciliation.js";

export type ResourceBindingContext =
  | {
      readonly kind: "state-image";
      readonly symbol: string;
      readonly state: string;
    }
  | {
      readonly kind: "normal-base-image";
      readonly symbol: string;
      readonly state: "normal";
    }
  | {
      readonly kind: "layer-texture";
      readonly symbol: string;
      readonly state: string;
      readonly layerIndex: number;
      readonly keyframeIndex?: number;
      readonly baseVisual?: boolean;
    }
  | {
      readonly kind: "spine-skeleton";
      readonly symbol: string;
      readonly state: string;
      readonly compositeLayerIndex?: number;
    }
  | {
      readonly kind: "spine-atlas";
      readonly symbol: string;
      readonly state: string;
      readonly compositeLayerIndex?: number;
    }
  | {
      readonly kind: "vni-project";
      readonly symbol: string;
      readonly state: string;
      readonly compositeLayerIndex?: number;
    }
  | {
      readonly kind: "value-tier-resource";
      readonly symbol: string;
      readonly tierIndex: number;
      readonly field: "skeleton" | "atlas";
    }
  | {
      readonly kind: "image-string-special-image";
      readonly symbol: string;
      readonly nodeIndex: number;
      readonly mappingIndex: number;
    }
  | {
      readonly kind: "value-image-string-special-image";
      readonly symbol: string;
      readonly tierIndex: number;
      readonly mappingIndex: number;
    };

export interface ResourcePickerCandidate {
  readonly path: string;
  readonly kind: EditorAssetKind;
  readonly status: "ready" | "error";
  readonly summary: string;
  readonly disabledReason?: string;
}

export function getResourcePickerCandidates(
  project: SymbolEditorProject,
  context: ResourceBindingContext,
  query = "",
): readonly ResourcePickerCandidate[] {
  requireTarget(project, context);
  const expected = expectedKind(context);
  const normalizedQuery = query.trim().toLowerCase();
  return Object.freeze(
    [...project.assetLibrary.records.values()]
      .filter((record) => record.kind === expected)
      .filter((record) =>
        `${record.path} ${record.kind} ${getEditorAssetDiagnostics(project, record.path).join(" ")}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .sort((left, right) => left.path.localeCompare(right.path, "en"))
      .map((record) => {
        const disabledReason =
          getEditorAssetDiagnostics(project, record.path).join("；") ||
          undefined;
        return Object.freeze({
          path: record.path,
          kind: record.kind,
          status: disabledReason ? ("error" as const) : ("ready" as const),
          summary: `${record.kind} · ${formatBytes(record.size)}`,
          ...(disabledReason ? { disabledReason } : {}),
        });
      }),
  );
}

export function getEditorAssetDiagnostics(
  project: SymbolEditorProject,
  path: string,
): readonly string[] {
  const record = project.assetLibrary.records.get(path);
  if (!record) return Object.freeze([`资源不存在：${path}`]);
  const diagnostics = [...record.diagnostics];
  const dependencies: string[] = [];
  const dependencyNames =
    record.kind === "vni-project"
      ? record.metadata?.assetPaths
      : record.kind === "spine-atlas"
        ? record.metadata?.pageNames
        : undefined;
  if (
    record.kind === "spine-atlas" &&
    Array.isArray(dependencyNames) &&
    dependencyNames.length !== 1
  ) {
    diagnostics.push(
      `Symbol Spine 当前只支持单 page atlas，实际为 ${dependencyNames.length} pages`,
    );
  }
  if (Array.isArray(dependencyNames)) {
    for (const dependency of dependencyNames) {
      if (typeof dependency === "string")
        dependencies.push(resolvePackagePath(record.path, dependency));
    }
  }
  const missing = dependencies.filter(
    (dependency) => !project.assetLibrary.records.has(dependency),
  );
  if (missing.length > 0)
    diagnostics.push(`缺少直接依赖：${missing.join("、")}`);
  return Object.freeze(diagnostics);
}

export interface SpineAtlasBinding {
  readonly atlasPath: string;
  readonly texturePath: string;
}

export function resolveSpineAtlasBinding(
  project: SymbolEditorProject,
  atlasPath: string,
): SpineAtlasBinding {
  const atlas = project.assetLibrary.records.get(atlasPath);
  if (atlas?.kind !== "spine-atlas") {
    throw new Error(`Spine atlas 不存在或类型错误：${atlasPath}。`);
  }
  const diagnostics = getEditorAssetDiagnostics(project, atlasPath);
  if (diagnostics.length > 0) {
    throw new Error(
      `Spine atlas ${atlasPath} 无效：${diagnostics.join("；")}。`,
    );
  }
  const pages = atlas.metadata?.pageNames;
  if (
    !Array.isArray(pages) ||
    pages.length !== 1 ||
    typeof pages[0] !== "string"
  ) {
    throw new Error(`Spine atlas ${atlasPath} 必须声明一个 page。`);
  }
  const texturePath = resolvePackagePath(atlasPath, pages[0]);
  const texture = project.assetLibrary.records.get(texturePath);
  if (texture?.kind !== "image") {
    throw new Error(`Spine atlas page 不是有效图片资源：${texturePath}。`);
  }
  return Object.freeze({ atlasPath, texturePath });
}

export function getDefaultSpineAtlasBinding(
  project: SymbolEditorProject,
): SpineAtlasBinding | null {
  const readyAtlases = [...project.assetLibrary.records.values()].filter(
    (record) =>
      record.kind === "spine-atlas" &&
      getEditorAssetDiagnostics(project, record.path).length === 0,
  );
  return readyAtlases.length === 1
    ? resolveSpineAtlasBinding(project, readyAtlases[0]!.path)
    : null;
}

export function getResourceBindingLabel(
  context: ResourceBindingContext,
): string {
  if (context.kind === "image-string-special-image")
    return `${context.symbol}.imageStringNodes[${context.nodeIndex}].specialValueImages[${context.mappingIndex}]`;
  if (context.kind === "value-image-string-special-image")
    return `${context.symbol}.valuePresentation.text.specialValueImages[${context.mappingIndex}]`;
  const target = `${context.symbol}.${"state" in context ? context.state : `tier ${context.tierIndex + 1}`}`;
  const field =
    context.kind === "value-tier-resource"
      ? context.field
      : context.kind.replaceAll("-", " ");
  return `${target} · ${field}`;
}

export function applyResourceBinding(
  project: SymbolEditorProject,
  context: ResourceBindingContext,
  path: string,
): void {
  requireTarget(project, context);
  if (path) {
    const candidate = getResourcePickerCandidates(project, context).find(
      (item) => item.path === path,
    );
    if (!candidate) throw new Error(`资源 ${path} 与当前字段不兼容。`);
    if (candidate.status !== "ready")
      throw new Error(candidate.disabledReason ?? `资源 ${path} 不可绑定。`);
  }
  if (
    context.kind === "image-string-special-image" ||
    context.kind === "value-image-string-special-image"
  ) {
    const symbol = project.symbols.get(context.symbol)!;
    if (context.kind === "image-string-special-image") {
      const nodes = structuredClone(symbol.imageStringNodes);
      const mapping =
        nodes[context.nodeIndex]?.specialValueImages?.[context.mappingIndex];
      if (!mapping) throw new Error("ImgNumber 特殊值映射不存在。");
      (mapping as { image: string }).image = path ? `./${path}` : "";
      setSymbolImageStringNodes(project, context.symbol, nodes);
    } else {
      const value = structuredClone(symbol.valuePresentation!);
      if (value.text.type !== "image-string")
        throw new Error("当前数值展示不是 ImgNumber。");
      const mapping = (
        "tierResources" in value.text
          ? value.text
          : value.text.tiers[context.tierIndex]
      )?.specialValueImages?.[context.mappingIndex];
      if (!mapping) throw new Error("ImgNumber 特殊值映射不存在。");
      (mapping as { image: string }).image = path ? `./${path}` : "";
      setValuePresentation(project, context.symbol, value);
    }
    return;
  }
  if (context.kind === "value-tier-resource") {
    const symbol = project.symbols.get(context.symbol)!;
    const value = structuredClone(symbol.valuePresentation!) as unknown as {
      tiers: Array<{
        animation: {
          skeleton: string;
          atlas: string;
          texture: string;
          playback: { animationName: string };
        };
      }>;
      text:
        | { type: "font" | "image"; slot: string }
        | { type: "image-string"; tiers: Array<{ slot: string }> }
        | { type: "image-string"; tierResources: string[]; slot: string };
    };
    const tier = value.tiers[context.tierIndex];
    if (!tier) throw new Error(`value tier ${context.tierIndex + 1} 不存在。`);
    if (context.field === "atlas") {
      if (stripLocalRef(tier.animation.atlas) === path) return;
      const binding = path ? resolveSpineAtlasBinding(project, path) : null;
      tier.animation.atlas = binding ? `./${binding.atlasPath}` : "";
      tier.animation.texture = binding ? `./${binding.texturePath}` : "";
    } else {
      if (stripLocalRef(tier.animation.skeleton) === path) return;
      tier.animation.skeleton = path ? `./${path}` : "";
      if (!tier.animation.atlas) {
        const binding = getDefaultSpineAtlasBinding(project);
        if (binding) {
          tier.animation.atlas = `./${binding.atlasPath}`;
          tier.animation.texture = `./${binding.texturePath}`;
        }
      }
      const skeletonKeys = value.tiers.map((candidate) =>
        stripLocalRef(candidate.animation.skeleton),
      );
      const sharedAnimations = intersectSpineMetadataNames(
        project,
        skeletonKeys,
        "animationNames",
      );
      const currentAnimation =
        value.tiers[0]?.animation.playback.animationName ?? "";
      if (currentAnimation && !sharedAnimations.has(currentAnimation)) {
        for (const candidate of value.tiers)
          candidate.animation.playback.animationName = "";
      }
      preserveCompatibleValueSlot(
        project,
        value,
        context.tierIndex,
        skeletonKeys,
      );
      const sharedStateAnimations = sharedAnimations;
      for (const [state, stateVisual] of symbol.states) {
        if (
          stateVisual.kind === "activeSpine" &&
          stateVisual.animationName &&
          !sharedStateAnimations.has(stateVisual.animationName)
        ) {
          symbol.states.set(state, { ...stateVisual, animationName: "" });
        }
      }
    }
    setValuePresentation(project, context.symbol, value as never);
    return;
  }
  const symbol = project.symbols.get(context.symbol)!;
  const visual = symbol.states.get(context.state);
  if (!visual) throw new Error(`${context.symbol}.${context.state} 尚未添加。`);
  const next = structuredClone(visual) as EditorStateVisual;
  if (context.kind === "state-image") {
    if (next.kind === "composite") {
      if (next.base !== "stateTexture")
        throw new Error("当前 composite 未选择 state texture base。");
      setStateVisual(project, context.symbol, context.state, {
        ...next,
        stateTexturePath: path,
      });
      return;
    }
    if (next.kind !== "image") throw new Error("当前 state 不是图片资源类型。");
    setStateVisual(project, context.symbol, context.state, {
      ...next,
      imagePath: path,
    });
    return;
  }
  if (context.kind === "normal-base-image") {
    if (
      next.kind !== "spine" &&
      next.kind !== "vni" &&
      next.kind !== "composite"
    )
      throw new Error("当前 normal 不支持基础视觉。");
    setStateVisual(project, context.symbol, context.state, {
      ...next,
      baseVisual: { kind: "image", imagePath: path },
    });
    return;
  }
  if (context.kind === "layer-texture") {
    const source = context.baseVisual
      ? next.kind === "spine" ||
        next.kind === "vni" ||
        next.kind === "composite"
        ? next.baseVisual
        : undefined
      : next;
    if (source?.kind !== "layered-image")
      throw new Error("当前字段不属于 layered image。");
    const layers = source.layers.map((layer) => ({
      index: layer.index,
      texturePath: layer.texturePath,
      keyframePaths: [...layer.keyframePaths],
    }));
    const layer = layers[context.layerIndex];
    if (!layer) throw new Error(`layer ${context.layerIndex} 不存在。`);
    if (context.keyframeIndex === undefined) layer.texturePath = path;
    else {
      if (context.keyframeIndex >= layer.keyframePaths.length)
        throw new Error(`keyframe ${context.keyframeIndex} 不存在。`);
      layer.keyframePaths[context.keyframeIndex] = path;
    }
    const layered = { kind: "layered-image" as const, layers };
    setStateVisual(
      project,
      context.symbol,
      context.state,
      context.baseVisual &&
        (next.kind === "spine" ||
          next.kind === "vni" ||
          next.kind === "composite")
        ? { ...next, baseVisual: layered }
        : layered,
    );
    return;
  }
  if (context.kind === "spine-skeleton") {
    if (next.kind === "composite") {
      updateCompositeLayer(project, context, next, (animation) => {
        if (animation.kind !== "spine")
          throw new Error("当前 composite layer 不是 Spine 类型。");
        if (animation.skeletonPath === path) return animation;
        const binding = animation.atlasPath
          ? null
          : getDefaultSpineAtlasBinding(project);
        return {
          ...animation,
          skeletonPath: path,
          animationName: compatibleAnimationName(
            project,
            path,
            animation.animationName,
          ),
          ...(binding
            ? {
                atlasPath: binding.atlasPath,
                texturePath: binding.texturePath,
              }
            : {}),
        };
      });
      return;
    }
    if (next.kind !== "spine") throw new Error("当前 state 不是 Spine 类型。");
    if (next.skeletonPath === path) return;
    const binding = next.atlasPath
      ? null
      : getDefaultSpineAtlasBinding(project);
    setStateVisual(project, context.symbol, context.state, {
      ...next,
      skeletonPath: path,
      animationName: compatibleAnimationName(project, path, next.animationName),
      ...(binding
        ? {
            atlasPath: binding.atlasPath,
            texturePath: binding.texturePath,
          }
        : {}),
    });
    return;
  }
  if (context.kind === "spine-atlas") {
    if (next.kind === "composite") {
      updateCompositeLayer(project, context, next, (animation) => {
        if (animation.kind !== "spine")
          throw new Error("当前 composite layer 不是 Spine 类型。");
        if (animation.atlasPath === path) return animation;
        const binding = path ? resolveSpineAtlasBinding(project, path) : null;
        return {
          ...animation,
          atlasPath: binding?.atlasPath ?? "",
          texturePath: binding?.texturePath ?? "",
        };
      });
      return;
    }
    if (next.kind !== "spine") throw new Error("当前 state 不是 Spine 类型。");
    if (next.atlasPath === path) return;
    const binding = path ? resolveSpineAtlasBinding(project, path) : null;
    setStateVisual(project, context.symbol, context.state, {
      ...next,
      atlasPath: binding?.atlasPath ?? "",
      texturePath: binding?.texturePath ?? "",
    });
    return;
  }
  if (next.kind === "composite") {
    updateCompositeLayer(project, context, next, (animation) => {
      if (animation.kind !== "vni")
        throw new Error("当前 composite layer 不是 VNI 类型。");
      return { ...animation, projectPath: path };
    });
    return;
  }
  if (next.kind !== "vni") throw new Error("当前 state 不是 VNI 类型。");
  setStateVisual(project, context.symbol, context.state, {
    ...next,
    projectPath: path,
  });
}

function compatibleAnimationName(
  project: SymbolEditorProject,
  skeletonPath: string,
  animationName: string,
): string {
  return skeletonPath &&
    animationName &&
    spineMetadataNames(project, skeletonPath, "animationNames").has(
      animationName,
    )
    ? animationName
    : "";
}

function preserveCompatibleValueSlot(
  project: SymbolEditorProject,
  value: {
    tiers: Array<{ animation: { skeleton: string } }>;
    text:
      | { type: "font" | "image"; slot: string }
      | { type: "image-string"; tiers: Array<{ slot: string }> }
      | { type: "image-string"; tierResources: string[]; slot: string };
  },
  tierIndex: number,
  skeletonKeys: readonly string[],
): void {
  if (value.text.type === "image-string" && !("tierResources" in value.text)) {
    const binding = value.text.tiers[tierIndex];
    const skeletonKey = skeletonKeys[tierIndex];
    if (
      binding?.slot &&
      (!skeletonKey ||
        !spineMetadataNames(project, skeletonKey, "slotNames").has(
          binding.slot,
        ))
    ) {
      binding.slot = "";
    }
    return;
  }
  const sharedSlots = intersectSpineMetadataNames(
    project,
    skeletonKeys,
    "slotNames",
  );
  if (value.text.slot && !sharedSlots.has(value.text.slot))
    value.text.slot = "";
}

function updateCompositeLayer(
  project: SymbolEditorProject,
  context: Extract<
    ResourceBindingContext,
    { kind: "spine-skeleton" | "spine-atlas" | "vni-project" }
  >,
  visual: Extract<EditorStateVisual, { kind: "composite" }>,
  update: (
    animation: Extract<
      EditorStateVisual,
      { kind: "composite" }
    >["layers"][number]["animation"],
  ) => Extract<
    EditorStateVisual,
    { kind: "composite" }
  >["layers"][number]["animation"],
): void {
  const index = context.compositeLayerIndex;
  if (index === undefined || !visual.layers[index]) {
    throw new Error("composite layer 不存在。");
  }
  const layers = [...visual.layers];
  layers[index] = {
    ...layers[index]!,
    animation: update(layers[index]!.animation),
  };
  setStateVisual(project, context.symbol, context.state, { ...visual, layers });
}

function expectedKind(context: ResourceBindingContext): EditorAssetKind {
  if (
    context.kind === "state-image" ||
    context.kind === "normal-base-image" ||
    context.kind === "layer-texture" ||
    context.kind === "image-string-special-image" ||
    context.kind === "value-image-string-special-image"
  )
    return "image";
  if (
    context.kind === "spine-skeleton" ||
    (context.kind === "value-tier-resource" && context.field === "skeleton")
  )
    return "spine-skeleton";
  if (
    context.kind === "spine-atlas" ||
    (context.kind === "value-tier-resource" && context.field === "atlas")
  )
    return "spine-atlas";
  return "vni-project";
}

function requireTarget(
  project: SymbolEditorProject,
  context: ResourceBindingContext,
): void {
  const symbol = project.symbols.get(context.symbol);
  if (!symbol) throw new Error(`symbol ${context.symbol} 不存在。`);
  if (context.kind === "image-string-special-image") {
    if (
      !symbol.imageStringNodes[context.nodeIndex]?.specialValueImages?.[
        context.mappingIndex
      ]
    )
      throw new Error("ImgNumber 特殊值映射不存在。");
  } else if (context.kind === "value-image-string-special-image") {
    const text = symbol.valuePresentation?.text;
    if (
      text?.type !== "image-string" ||
      !("tierResources" in text ? text : text.tiers[context.tierIndex])
        ?.specialValueImages?.[context.mappingIndex]
    )
      throw new Error("数值 ImgNumber 特殊值映射不存在。");
  } else if (context.kind === "value-tier-resource") {
    if (!symbol.valuePresentation?.tiers[context.tierIndex])
      throw new Error(`value tier ${context.tierIndex + 1} 不存在。`);
  } else if (!symbol.states.has(context.state)) {
    throw new Error(`${context.symbol}.${context.state} 尚未添加。`);
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}
