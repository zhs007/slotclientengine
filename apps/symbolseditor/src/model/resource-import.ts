import {
  createEditorAssetWorkspace,
  extensionOfEditorAssetKey,
  resolveEditorAssetImportReview,
  reviewEditorAssetImport,
  type EditorImportResolution,
  type EditorImportReview,
  type EditorImportSourceFile,
} from "@slotclientengine/editorresource";
import {
  cloneSymbolEditorProject,
  createEditorAssetRecord,
  getAssetReferences,
  getProjectDiagnostics,
  uploadAssetBatch,
  type EditorAssetRecord,
  type SymbolEditorProject,
} from "./editor-project.js";
import { exportSymbolPackageZip } from "../io/symbol-package-zip.js";

export interface PreparedSymbolResourceImport {
  readonly review: EditorImportReview;
  readonly records: readonly EditorAssetRecord[];
  readonly sources: readonly EditorImportSourceFile[];
}

export interface ClearedSpineAnimationBinding {
  readonly location: string;
  readonly animationName: string;
  readonly skeletonKeys: readonly string[];
}

export async function prepareSymbolResourceImport(options: {
  readonly project: SymbolEditorProject;
  readonly sources: readonly EditorImportSourceFile[];
}): Promise<PreparedSymbolResourceImport> {
  if (options.sources.length === 0) throw new Error("导入批次不能为空。");
  const records = options.sources.map(({ key, bytes }) =>
    createEditorAssetRecord(key, bytes, "prepared"),
  );
  const existingTokens = new Set(
    [...options.project.assetLibrary.records.keys()].map((key) =>
      key.toLocaleLowerCase("en-US"),
    ),
  );
  validateSymbolResourceDiscovery(records, {
    requireClosure: records.some(
      ({ path, kind }) =>
        kind !== "image" &&
        !existingTokens.has(path.toLocaleLowerCase("en-US")),
    ),
  });
  const workspace = await createEditorAssetWorkspace(
    [...options.project.assetLibrary.records.values()].map((record) => ({
      key: record.path,
      mediaType: mediaTypeForKey(record.path),
      bytes: record.bytes,
    })),
  );
  const review = await reviewEditorAssetImport({
    workspace,
    incoming: options.sources.map(({ key, bytes }) => ({
      key,
      mediaType: mediaTypeForKey(key),
      bytes,
    })),
    references: {
      references: getAssetReferences(options.project).map(
        ({ path, location }) => ({ key: path, location }),
      ),
    },
  });
  return Object.freeze({
    review,
    records: Object.freeze(records),
    sources: Object.freeze([...options.sources]),
  });
}

export async function commitSymbolResourceImport(options: {
  readonly project: SymbolEditorProject;
  readonly prepared: PreparedSymbolResourceImport;
  readonly resolutions: readonly EditorImportResolution[];
}): Promise<{
  readonly project: SymbolEditorProject;
  readonly review: EditorImportReview;
  readonly clearedAnimations: readonly ClearedSpineAnimationBinding[];
}> {
  const workspace = await createEditorAssetWorkspace(
    [...options.project.assetLibrary.records.values()].map((record) => ({
      key: record.path,
      mediaType: mediaTypeForKey(record.path),
      bytes: record.bytes,
    })),
  );
  const review = resolveEditorAssetImportReview({
    workspace,
    review: options.prepared.review,
    resolutions: options.resolutions,
  });
  if (!review.canCommit)
    throw new Error(review.blockingErrors.join("\n") || "导入冲突尚未解决。");

  for (const [index, item] of review.items.entries()) {
    if (item.action !== "keep-both") continue;
    const kind = options.prepared.records[index]?.kind;
    if (kind !== "image")
      throw new Error(
        `${item.incoming.key} 是 ${kind ?? "unknown"}；当前只能对普通图片保留两份，请选择覆盖或拆分后显式导入。`,
      );
  }

  const beforeDiagnostics = new Set(getProjectDiagnostics(options.project));
  const project = cloneSymbolEditorProject(options.project);
  const values = review.items
    .filter(({ action }) => action !== "noop")
    .map(({ incoming, targetKey }) => ({
      path: targetKey,
      bytes: incoming.bytes,
    }));
  if (values.length) uploadAssetBatch(project, values, "导入资源");
  const changed = values.map(
    ({ path }) => project.assetLibrary.records.get(path)!,
  );
  validateSymbolResourceDiscovery(changed, { requireClosure: false });
  const overwrittenSkeletonKeys = new Set(
    review.items.flatMap((item, index) =>
      item.action === "overwrite" &&
      options.prepared.records[index]?.kind === "spine-skeleton"
        ? [item.targetKey]
        : [],
    ),
  );
  const clearedAnimations = reconcileMissingSpineAnimations(
    project,
    overwrittenSkeletonKeys,
  );
  if (clearedAnimations.length > 0) {
    await validateReconciledSpineImport({
      project,
      beforeDiagnostics,
      clearedAnimations,
    });
    return Object.freeze({
      project,
      review,
      clearedAnimations: Object.freeze(clearedAnimations),
    });
  }
  const newDiagnostics = getProjectDiagnostics(project).filter(
    (diagnostic) => !beforeDiagnostics.has(diagnostic),
  );
  if (newDiagnostics.length)
    throw new Error(`资源替换与现有配置不兼容：\n${newDiagnostics.join("\n")}`);
  if (beforeDiagnostics.size === 0)
    await exportSymbolPackageZip(project, { loadTextures: false });
  return Object.freeze({
    project,
    review,
    clearedAnimations: Object.freeze([]),
  });
}

async function validateReconciledSpineImport(options: {
  readonly project: SymbolEditorProject;
  readonly beforeDiagnostics: ReadonlySet<string>;
  readonly clearedAnimations: readonly ClearedSpineAnimationBinding[];
}): Promise<void> {
  const validationProject = cloneSymbolEditorProject(options.project);
  for (const binding of options.clearedAnimations) {
    const animationName = validationAnimationName(validationProject, binding);
    if (!animationName) return;
    applyValidationAnimationName(validationProject, binding, animationName);
  }
  const newDiagnostics = getProjectDiagnostics(validationProject).filter(
    (diagnostic) => !options.beforeDiagnostics.has(diagnostic),
  );
  if (newDiagnostics.length) {
    throw new Error(`资源替换与现有配置不兼容：\n${newDiagnostics.join("\n")}`);
  }
  if (options.beforeDiagnostics.size === 0)
    await exportSymbolPackageZip(validationProject, { loadTextures: false });
}

function validationAnimationName(
  project: SymbolEditorProject,
  binding: ClearedSpineAnimationBinding,
): string | undefined {
  const [first, ...rest] = binding.skeletonKeys.map((key) =>
    animationNamesFor(project, key),
  );
  return [...(first ?? [])].find((name) =>
    rest.every((names) => names.has(name)),
  );
}

function applyValidationAnimationName(
  project: SymbolEditorProject,
  binding: ClearedSpineAnimationBinding,
  animationName: string,
): void {
  const symbol = [...project.symbols.values()].find((candidate) =>
    binding.location.startsWith(`${candidate.symbol}.`),
  );
  if (!symbol) throw new Error(`动画清理目标不存在：${binding.location}。`);
  const target = binding.location.slice(symbol.symbol.length + 1);
  if (target === "valuePresentation.normal") {
    for (const tier of symbol.valuePresentation?.tiers ?? []) {
      (tier.animation.playback as { animationName: string }).animationName =
        animationName;
    }
    return;
  }
  const visual = symbol.states.get(target);
  if (visual?.kind === "spine" || visual?.kind === "activeSpine") {
    symbol.states.set(target, { ...visual, animationName });
    return;
  }
  throw new Error(`动画清理目标不是 Spine binding：${binding.location}。`);
}

function reconcileMissingSpineAnimations(
  project: SymbolEditorProject,
  overwrittenSkeletonKeys: ReadonlySet<string>,
): ClearedSpineAnimationBinding[] {
  if (overwrittenSkeletonKeys.size === 0) return [];
  const cleared: ClearedSpineAnimationBinding[] = [];
  for (const symbol of project.symbols.values()) {
    for (const [state, visual] of symbol.states) {
      if (
        visual.kind !== "spine" ||
        !overwrittenSkeletonKeys.has(visual.skeletonPath) ||
        !visual.animationName ||
        animationNamesFor(project, visual.skeletonPath).has(
          visual.animationName,
        )
      ) {
        continue;
      }
      symbol.states.set(state, { ...visual, animationName: "" });
      cleared.push({
        location: `${symbol.symbol}.${state}`,
        animationName: visual.animationName,
        skeletonKeys: Object.freeze([visual.skeletonPath]),
      });
    }

    const value = symbol.valuePresentation;
    if (!value) continue;
    const skeletonKeys = value.tiers.map((tier) =>
      stripLocalRef(tier.animation.skeleton),
    );
    if (!skeletonKeys.some((key) => overwrittenSkeletonKeys.has(key))) continue;
    const sharedAnimations = intersectAnimationNames(project, skeletonKeys);
    const normalAnimation = value.tiers[0]?.animation.playback.animationName;
    if (normalAnimation && !sharedAnimations.has(normalAnimation)) {
      for (const tier of value.tiers) {
        (tier.animation.playback as { animationName: string }).animationName =
          "";
      }
      cleared.push({
        location: `${symbol.symbol}.valuePresentation.normal`,
        animationName: normalAnimation,
        skeletonKeys: Object.freeze([...skeletonKeys]),
      });
    }
    for (const [state, visual] of symbol.states) {
      if (
        visual.kind !== "activeSpine" ||
        !visual.animationName ||
        sharedAnimations.has(visual.animationName)
      ) {
        continue;
      }
      symbol.states.set(state, { ...visual, animationName: "" });
      cleared.push({
        location: `${symbol.symbol}.${state}`,
        animationName: visual.animationName,
        skeletonKeys: Object.freeze([...skeletonKeys]),
      });
    }
  }
  return cleared;
}

function intersectAnimationNames(
  project: SymbolEditorProject,
  skeletonKeys: readonly string[],
): Set<string> {
  const [first, ...rest] = skeletonKeys.map((key) =>
    animationNamesFor(project, key),
  );
  if (!first) return new Set();
  return new Set(
    [...first].filter((name) => rest.every((names) => names.has(name))),
  );
}

function animationNamesFor(
  project: SymbolEditorProject,
  skeletonKey: string,
): Set<string> {
  return new Set(
    metadataList(
      project.assetLibrary.records.get(skeletonKey),
      "animationNames",
    ),
  );
}

function stripLocalRef(path: string): string {
  return path.startsWith("./") ? path.slice(2) : path;
}

export function validateSymbolResourceDiscovery(
  records: readonly EditorAssetRecord[],
  options: { readonly requireClosure?: boolean } = {},
): void {
  const diagnostics = records.flatMap((record) =>
    record.diagnostics.map((diagnostic) => `${record.path}: ${diagnostic}`),
  );
  if (diagnostics.length) throw new Error(diagnostics.join("\n"));
  if (options.requireClosure === false) return;
  const skeletons = records.filter(({ kind }) => kind === "spine-skeleton");
  const atlases = records.filter(({ kind }) => kind === "spine-atlas");
  if (skeletons.length || atlases.length) {
    if (skeletons.length === 0 || atlases.length !== 1)
      throw new Error(
        `Spine closure 存在歧义：${skeletons.length} skeleton / ${atlases.length} atlas。`,
      );
    for (const page of metadataList(atlases[0]!, "pageNames")) {
      const matches = records.filter(
        (record) =>
          record.kind === "image" &&
          record.path.toLocaleLowerCase("en-US") ===
            page.toLocaleLowerCase("en-US"),
      );
      if (matches.length !== 1)
        throw new Error(`Spine atlas page ${page} 缺失或大小写匹配歧义。`);
    }
  }
  for (const project of records.filter(({ kind }) => kind === "vni-project")) {
    for (const assetPath of metadataList(project, "assetPaths")) {
      const key = assetPath.replace(/^.*[\\/]/u, "");
      const matches = records.filter(
        ({ path }) =>
          path.toLocaleLowerCase("en-US") === key.toLocaleLowerCase("en-US"),
      );
      if (matches.length !== 1)
        throw new Error(`VNI asset ${assetPath} 缺失或大小写匹配歧义。`);
    }
  }
}

function mediaTypeForKey(key: string): string {
  switch (extensionOfEditorAssetKey(key)) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "json":
      return "application/json";
    case "atlas":
      return "text/plain";
    default:
      throw new Error(`Symbols Editor 不支持资源类型：${key}`);
  }
}

function metadataList(
  record: EditorAssetRecord | undefined,
  key: string,
): string[] {
  const value = record?.metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
