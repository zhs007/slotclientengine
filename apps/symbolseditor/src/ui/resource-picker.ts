import { resolvePackagePath } from "@slotclientengine/browserartifactio";
import {
  setStateVisual,
  setValuePresentation,
  type EditorAssetKind,
  type EditorStateVisual,
  type SymbolEditorProject,
} from "../model/editor-project.js";

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
    }
  | {
      readonly kind: "spine-atlas";
      readonly symbol: string;
      readonly state: string;
    }
  | {
      readonly kind: "vni-project";
      readonly symbol: string;
      readonly state: string;
    }
  | {
      readonly kind: "value-tier-resource";
      readonly symbol: string;
      readonly tierIndex: number;
      readonly field: "skeleton" | "atlas";
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
      text: { slot: string };
    };
    const tier = value.tiers[context.tierIndex];
    if (!tier) throw new Error(`value tier ${context.tierIndex + 1} 不存在。`);
    if (context.field === "atlas") {
      const binding = path ? resolveSpineAtlasBinding(project, path) : null;
      tier.animation.atlas = binding ? `./${binding.atlasPath}` : "";
      tier.animation.texture = binding ? `./${binding.texturePath}` : "";
    } else {
      tier.animation.skeleton = path ? `./${path}` : "";
      if (!tier.animation.atlas) {
        const binding = getDefaultSpineAtlasBinding(project);
        if (binding) {
          tier.animation.atlas = `./${binding.atlasPath}`;
          tier.animation.texture = `./${binding.texturePath}`;
        }
      }
    }
    if (context.field === "skeleton") {
      tier.animation.playback.animationName = "";
      value.text.slot = "";
    }
    setValuePresentation(project, context.symbol, value as never);
    return;
  }
  const symbol = project.symbols.get(context.symbol)!;
  const visual = symbol.states.get(context.state);
  if (!visual) throw new Error(`${context.symbol}.${context.state} 尚未添加。`);
  const next = structuredClone(visual) as EditorStateVisual;
  if (context.kind === "state-image") {
    if (next.kind !== "image") throw new Error("当前 state 不是图片资源类型。");
    setStateVisual(project, context.symbol, context.state, {
      ...next,
      imagePath: path,
    });
    return;
  }
  if (context.kind === "normal-base-image") {
    if (next.kind !== "spine" && next.kind !== "vni")
      throw new Error("当前 normal 不支持基础视觉。");
    setStateVisual(project, context.symbol, context.state, {
      ...next,
      baseVisual: { kind: "image", imagePath: path },
    });
    return;
  }
  if (context.kind === "layer-texture") {
    const source = context.baseVisual
      ? next.kind === "spine" || next.kind === "vni"
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
      context.baseVisual && (next.kind === "spine" || next.kind === "vni")
        ? { ...next, baseVisual: layered }
        : layered,
    );
    return;
  }
  if (context.kind === "spine-skeleton") {
    if (next.kind !== "spine") throw new Error("当前 state 不是 Spine 类型。");
    const binding = next.atlasPath
      ? null
      : getDefaultSpineAtlasBinding(project);
    setStateVisual(project, context.symbol, context.state, {
      ...next,
      skeletonPath: path,
      animationName: "",
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
    if (next.kind !== "spine") throw new Error("当前 state 不是 Spine 类型。");
    const binding = path ? resolveSpineAtlasBinding(project, path) : null;
    setStateVisual(project, context.symbol, context.state, {
      ...next,
      atlasPath: binding?.atlasPath ?? "",
      texturePath: binding?.texturePath ?? "",
    });
    return;
  }
  if (next.kind !== "vni") throw new Error("当前 state 不是 VNI 类型。");
  setStateVisual(project, context.symbol, context.state, {
    ...next,
    projectPath: path,
  });
}

function expectedKind(context: ResourceBindingContext): EditorAssetKind {
  if (
    context.kind === "state-image" ||
    context.kind === "normal-base-image" ||
    context.kind === "layer-texture"
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
  if (context.kind === "value-tier-resource") {
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
