import { resolvePackagePath } from "@slotclientengine/browserartifactio";
import type {
  EditorAssetRecord,
  SymbolEditorProject,
} from "./editor-project.js";

export interface ClearedSpineAnimationBinding {
  readonly location: string;
  readonly animationName: string;
  readonly skeletonKeys: readonly string[];
}

export interface RewrittenSpineTextureBinding {
  readonly location: string;
  readonly atlasPath: string;
  readonly previousTexturePath: string;
  readonly texturePath: string;
}

export interface SpineResourceReconciliation {
  readonly clearedAnimations: readonly ClearedSpineAnimationBinding[];
  readonly rewrittenTextures: readonly RewrittenSpineTextureBinding[];
}

export function reconcileSpineResourceOverwrites(options: {
  readonly before: SymbolEditorProject;
  readonly candidate: SymbolEditorProject;
  readonly overwrittenSkeletonKeys: ReadonlySet<string>;
  readonly overwrittenAtlasKeys: ReadonlySet<string>;
}): SpineResourceReconciliation {
  const rewrittenTextures = rewriteChangedAtlasPages(options);
  const clearedAnimations = reconcileMissingSpineAnimations(
    options.candidate,
    options.overwrittenSkeletonKeys,
  );
  return Object.freeze({
    clearedAnimations: Object.freeze(clearedAnimations),
    rewrittenTextures: Object.freeze(rewrittenTextures),
  });
}

export function spineMetadataNames(
  project: SymbolEditorProject,
  skeletonKey: string,
  field: "animationNames" | "slotNames",
): ReadonlySet<string> {
  return new Set(
    metadataList(project.assetLibrary.records.get(skeletonKey), field),
  );
}

export function intersectSpineMetadataNames(
  project: SymbolEditorProject,
  skeletonKeys: readonly string[],
  field: "animationNames" | "slotNames",
): Set<string> {
  const [first, ...rest] = skeletonKeys.map((key) =>
    spineMetadataNames(project, key, field),
  );
  if (!first) return new Set();
  return new Set(
    [...first].filter((name) => rest.every((names) => names.has(name))),
  );
}

function rewriteChangedAtlasPages(options: {
  readonly before: SymbolEditorProject;
  readonly candidate: SymbolEditorProject;
  readonly overwrittenAtlasKeys: ReadonlySet<string>;
}): RewrittenSpineTextureBinding[] {
  const rewritten: RewrittenSpineTextureBinding[] = [];
  for (const atlasPath of options.overwrittenAtlasKeys) {
    const previousTexturePath = singleAtlasTexturePath(
      options.before.assetLibrary.records.get(atlasPath),
    );
    const texturePath = singleAtlasTexturePath(
      options.candidate.assetLibrary.records.get(atlasPath),
    );
    if (
      !previousTexturePath ||
      !texturePath ||
      previousTexturePath === texturePath
    ) {
      continue;
    }
    rewriteAtlasReferences({
      project: options.candidate,
      atlasPath,
      previousTexturePath,
      texturePath,
      rewritten,
    });
  }
  return rewritten;
}

function singleAtlasTexturePath(
  record: EditorAssetRecord | undefined,
): string | undefined {
  if (record?.kind !== "spine-atlas" || record.diagnostics.length > 0)
    return undefined;
  const pages = metadataList(record, "pageNames");
  return pages.length === 1
    ? resolvePackagePath(record.path, pages[0]!)
    : undefined;
}

function rewriteAtlasReferences(options: {
  readonly project: SymbolEditorProject;
  readonly atlasPath: string;
  readonly previousTexturePath: string;
  readonly texturePath: string;
  readonly rewritten: RewrittenSpineTextureBinding[];
}): void {
  for (const symbol of options.project.symbols.values()) {
    for (const [state, visual] of symbol.states) {
      if (
        visual.kind === "spine" &&
        visual.atlasPath === options.atlasPath &&
        visual.texturePath === options.previousTexturePath
      ) {
        symbol.states.set(state, {
          ...visual,
          texturePath: options.texturePath,
        });
        options.rewritten.push({
          location: `${symbol.symbol}.${state}`,
          atlasPath: options.atlasPath,
          previousTexturePath: options.previousTexturePath,
          texturePath: options.texturePath,
        });
        continue;
      }
      if (visual.kind !== "composite") continue;
      let changed = false;
      const layers = visual.layers.map((layer) => {
        const animation = layer.animation;
        if (
          animation.kind !== "spine" ||
          animation.atlasPath !== options.atlasPath ||
          animation.texturePath !== options.previousTexturePath
        ) {
          return layer;
        }
        changed = true;
        options.rewritten.push({
          location: `${symbol.symbol}.${state}.layers.${layer.id}`,
          atlasPath: options.atlasPath,
          previousTexturePath: options.previousTexturePath,
          texturePath: options.texturePath,
        });
        return {
          ...layer,
          animation: { ...animation, texturePath: options.texturePath },
        };
      });
      if (changed) symbol.states.set(state, { ...visual, layers });
    }

    for (const [index, tier] of (
      symbol.valuePresentation?.tiers ?? []
    ).entries()) {
      if (
        stripLocalRef(tier.animation.atlas) !== options.atlasPath ||
        stripLocalRef(tier.animation.texture) !== options.previousTexturePath
      ) {
        continue;
      }
      (
        tier.animation as unknown as { atlas: string; texture: string }
      ).texture = preserveLocalRefStyle(
        tier.animation.texture,
        options.texturePath,
      );
      options.rewritten.push({
        location: `${symbol.symbol}.valuePresentation.tiers[${index}]`,
        atlasPath: options.atlasPath,
        previousTexturePath: options.previousTexturePath,
        texturePath: options.texturePath,
      });
    }
  }
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
        spineMetadataNames(project, visual.skeletonPath, "animationNames").has(
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
    for (const [state, visual] of symbol.states) {
      if (visual.kind !== "composite") continue;
      let changed = false;
      const layers = visual.layers.map((layer) => {
        const animation = layer.animation;
        if (
          animation.kind !== "spine" ||
          !overwrittenSkeletonKeys.has(animation.skeletonPath) ||
          !animation.animationName ||
          spineMetadataNames(
            project,
            animation.skeletonPath,
            "animationNames",
          ).has(animation.animationName)
        ) {
          return layer;
        }
        changed = true;
        cleared.push({
          location: `${symbol.symbol}.${state}.layers.${layer.id}`,
          animationName: animation.animationName,
          skeletonKeys: Object.freeze([animation.skeletonPath]),
        });
        return {
          ...layer,
          animation: { ...animation, animationName: "" },
        };
      });
      if (changed) symbol.states.set(state, { ...visual, layers });
    }

    const value = symbol.valuePresentation;
    if (!value) continue;
    const skeletonKeys = value.tiers.map((tier) =>
      stripLocalRef(tier.animation.skeleton),
    );
    if (!skeletonKeys.some((key) => overwrittenSkeletonKeys.has(key))) continue;
    const sharedAnimations = intersectSpineMetadataNames(
      project,
      skeletonKeys,
      "animationNames",
    );
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

function preserveLocalRefStyle(reference: string, path: string): string {
  return reference.startsWith("./") ? `./${path}` : path;
}

export function stripLocalRef(path: string): string {
  return path.startsWith("./") ? path.slice(2) : path;
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
