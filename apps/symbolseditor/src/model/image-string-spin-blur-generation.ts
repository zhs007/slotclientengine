import { sha256Hex } from "@slotclientengine/browserartifactio";
import { extensionOfEditorAssetKey } from "@slotclientengine/editorresource";
import {
  generateSymbolStateTextureRgba,
  SYMBOL_STATE_TEXTURE_GENERATION_PRESET,
  type SymbolStateTexturePixels,
} from "@slotclientengine/rendercore/symbol";
import type { ImageStringManifestV1 } from "@slotclientengine/rendercore/image-string";
import {
  cloneSymbolEditorProject,
  installImageStringDependency,
  setValuePresentation,
  setSymbolImageStringNodes,
  uploadAssetBatch,
  type ImportedEditorImageStringDependency,
  type SymbolEditorProject,
} from "./editor-project.js";

export interface ImageStringSpinBlurCodec {
  readonly decode: (bytes: Uint8Array) => Promise<SymbolStateTexturePixels>;
  readonly encodePng: (pixels: SymbolStateTexturePixels) => Promise<Uint8Array>;
}

export type ImageStringSpinBlurAvailability =
  | { readonly ready: true; readonly alreadyBound: boolean }
  | { readonly ready: false; readonly reason: string };

export function getValueImageStringSpinBlurAvailability(
  project: SymbolEditorProject,
  symbolName: string,
  tierIndex: number,
): ImageStringSpinBlurAvailability {
  try {
    const shadow = createValueTierGenerationShadow(
      project,
      symbolName,
      tierIndex,
    );
    return getImageStringSpinBlurAvailability(
      shadow.project,
      symbolName,
      shadow.nodeIndex,
    );
  } catch (error) {
    return {
      ready: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function generateAndBindValueImageStringSpinBlur(options: {
  readonly project: SymbolEditorProject;
  readonly symbol: string;
  readonly tierIndex: number;
  readonly codec: ImageStringSpinBlurCodec;
}): Promise<{
  readonly project: SymbolEditorProject;
  readonly dependencyId: string;
  readonly generatedImageCount: number;
}> {
  const shadow = createValueTierGenerationShadow(
    options.project,
    options.symbol,
    options.tierIndex,
  );
  const generated = await generateAndBindImageStringSpinBlur({
    project: shadow.project,
    symbol: options.symbol,
    nodeIndex: shadow.nodeIndex,
    codec: options.codec,
  });
  const profile = generated.project.symbols.get(options.symbol)!
    .imageStringNodes[shadow.nodeIndex]?.spinBlurProfile;
  if (!profile) throw new Error("档位模糊 ImgNumber profile 未生成。");

  for (const original of options.project.symbols.values()) {
    generated.project.symbols.get(original.symbol)!.imageStringNodes =
      structuredClone(original.imageStringNodes);
  }
  const symbol = generated.project.symbols.get(options.symbol)!;
  const presentation = structuredClone(symbol.valuePresentation!);
  if (presentation.text.type !== "image-string") {
    throw new Error("当前档位没有 ImgNumber 配置。");
  }
  if ("tierResources" in presentation.text) {
    const profiles = [
      ...(presentation.text.tierSpinBlurProfiles ??
        presentation.tiers.map(() => null)),
    ];
    profiles[options.tierIndex] = profile;
    (
      presentation.text as typeof presentation.text & {
        tierSpinBlurProfiles: typeof profiles;
      }
    ).tierSpinBlurProfiles = profiles;
  } else {
    const binding = presentation.text.tiers[options.tierIndex];
    if (!binding) throw new Error("ImgNumber 档位不存在。");
    (
      binding as typeof binding & { spinBlurProfile: typeof profile }
    ).spinBlurProfile = profile;
  }
  setValuePresentation(generated.project, options.symbol, presentation);
  return Object.freeze({
    project: generated.project,
    dependencyId: generated.dependencyId,
    generatedImageCount: generated.generatedImageCount,
  });
}

function createValueTierGenerationShadow(
  project: SymbolEditorProject,
  symbolName: string,
  tierIndex: number,
): { readonly project: SymbolEditorProject; readonly nodeIndex: number } {
  const original = project.symbols.get(symbolName);
  const presentation = original?.valuePresentation;
  if (!original || !presentation) throw new Error("档位 symbol 不存在。");
  if (presentation.text.type !== "image-string") {
    throw new Error("当前档位没有 ImgNumber 配置。");
  }
  if (!project.stateDefinitions.some((state) => state.id === "spinBlur")) {
    throw new Error("请先添加 exact spinBlur state。");
  }
  const binding =
    "tierResources" in presentation.text
      ? {
          resource: presentation.text.tierResources[tierIndex],
          specialValueImages: presentation.text.specialValueImages,
          spinBlurProfile:
            presentation.text.tierSpinBlurProfiles?.[tierIndex] ?? undefined,
        }
      : presentation.text.tiers[tierIndex];
  if (!binding?.resource)
    throw new Error("请先选择本档 ImgNumber dependency。");
  const dependency = findDependency(project, binding.resource);
  if (!dependency) throw new Error("本档 ImgNumber dependency 不存在。");
  const initialText = Object.keys(dependency.manifest.glyphs)[0];
  if (!initialText) throw new Error("本档 ImgNumber 没有 glyph。");
  const shadow = cloneSymbolEditorProject(project);
  for (const symbol of shadow.symbols.values()) symbol.imageStringNodes = [];
  shadow.symbols.get(symbolName)!.imageStringNodes = [
    {
      name: "value-tier-blur",
      resource: binding.resource,
      ...(binding.spinBlurProfile
        ? { spinBlurProfile: binding.spinBlurProfile }
        : {}),
      targets: [{ state: "spinBlur" }],
      initialText,
      anchor: { x: 0.5, y: 0.5 },
      transform: { x: 0, y: 0, scale: 1 },
      followSlotColor: false,
      ...(binding.specialValueImages?.length
        ? { specialValueImages: binding.specialValueImages }
        : {}),
    },
  ];
  return Object.freeze({ project: shadow, nodeIndex: 0 });
}

export function getImageStringSpinBlurAvailability(
  project: SymbolEditorProject,
  symbolName: string,
  nodeIndex: number,
): ImageStringSpinBlurAvailability {
  const symbol = project.symbols.get(symbolName);
  const node = symbol?.imageStringNodes[nodeIndex];
  if (!symbol || !node)
    return { ready: false, reason: "ImgNumber node 不存在。" };
  if (
    !node.targets.some(
      (target) => target.state === "spinBlur" && target.slot === undefined,
    )
  ) {
    return { ready: false, reason: "请先添加 non-Spine spinBlur target。" };
  }
  const dependency = findDependency(project, node.resource);
  if (!dependency)
    return { ready: false, reason: "普通 ImgNumber dependency 不存在。" };
  for (const glyph of Object.values(dependency.manifest.glyphs)) {
    const record = project.assetLibrary.records.get(glyph.path);
    if (record?.kind !== "image" || record.diagnostics.length) {
      return { ready: false, reason: `普通 glyph 无效：${glyph.path}。` };
    }
  }
  for (const mapping of node.specialValueImages ?? []) {
    const key = mapping.image.replace(/^\.\//u, "");
    const record = project.assetLibrary.records.get(key);
    if (record?.kind !== "image" || record.diagnostics.length)
      return { ready: false, reason: `特殊数值图片无效：${key}。` };
  }
  if (node.spinBlurProfile) {
    const blurDependency = findDependency(
      project,
      node.spinBlurProfile.resource,
    );
    if (!blurDependency)
      return { ready: false, reason: "模糊 ImgNumber dependency 不存在。" };
    try {
      assertMatchingLayout(dependency.manifest, blurDependency.manifest);
    } catch (error) {
      return {
        ready: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    for (const glyph of Object.values(blurDependency.manifest.glyphs)) {
      const record = project.assetLibrary.records.get(glyph.path);
      if (record?.kind !== "image" || record.diagnostics.length)
        return { ready: false, reason: `模糊 glyph 无效：${glyph.path}。` };
    }
    const normalSpecialValues = (node.specialValueImages ?? [])
      .map(({ value }) => value)
      .sort((left, right) => left - right);
    const blurSpecialValues = (node.spinBlurProfile.specialValueImages ?? [])
      .map(({ value }) => value)
      .sort((left, right) => left - right);
    if (
      normalSpecialValues.length !== blurSpecialValues.length ||
      normalSpecialValues.some(
        (value, index) => value !== blurSpecialValues[index],
      )
    ) {
      return { ready: false, reason: "模糊特殊数值集合与普通配置不一致。" };
    }
    for (const mapping of node.spinBlurProfile.specialValueImages ?? []) {
      const key = mapping.image.replace(/^\.\//u, "");
      const record = project.assetLibrary.records.get(key);
      if (record?.kind !== "image" || record.diagnostics.length)
        return { ready: false, reason: `模糊特殊数值图片无效：${key}。` };
    }
  }
  return Object.freeze({
    ready: true,
    alreadyBound: node.spinBlurProfile !== undefined,
  });
}

export async function generateAndBindImageStringSpinBlur(options: {
  readonly project: SymbolEditorProject;
  readonly symbol: string;
  readonly nodeIndex: number;
  readonly codec: ImageStringSpinBlurCodec;
}): Promise<{
  readonly project: SymbolEditorProject;
  readonly dependencyId: string;
  readonly generatedImageCount: number;
  readonly boundNodeCount: number;
}> {
  const availability = getImageStringSpinBlurAvailability(
    options.project,
    options.symbol,
    options.nodeIndex,
  );
  if (!availability.ready) throw new Error(availability.reason);
  const sourceNode = options.project.symbols.get(options.symbol)!
    .imageStringNodes[options.nodeIndex]!;
  const sourceDependency = findDependency(
    options.project,
    sourceNode.resource,
  )!;
  const sourceDigest = await dependencySourceDigest(
    options.project,
    sourceDependency,
  );
  const dependencyId = `${sourceDependency.id}-spin-blur-${sourceDigest}`;
  let generatedImageCount = 0;
  let preparedDependency: ImportedEditorImageStringDependency | undefined;
  const existing = options.project.imageStringDependencies.get(dependencyId);
  if (existing) {
    assertMatchingLayout(sourceDependency.manifest, existing.manifest);
    for (const glyph of Object.values(existing.manifest.glyphs)) {
      const record = options.project.assetLibrary.records.get(glyph.path);
      if (record?.kind !== "image" || record.diagnostics.length)
        throw new Error(`现有模糊 glyph 无效：${glyph.path}。`);
    }
  } else {
    const pathMap = new Map<string, string>();
    const files = new Map<string, Uint8Array>();
    for (const glyph of Object.values(sourceDependency.manifest.glyphs)) {
      if (pathMap.has(glyph.path)) continue;
      const outputKey = `${dependencyId}-glyph-${pathMap.size + 1}.png`;
      pathMap.set(glyph.path, outputKey);
      files.set(
        outputKey,
        await generateImage(
          options.project.assetLibrary.records.get(glyph.path)!.bytes,
          options.codec,
        ),
      );
      generatedImageCount += 1;
    }
    const manifest = structuredClone(sourceDependency.manifest) as {
      id: string;
      glyphs: Record<string, { path: string }>;
    };
    manifest.id = dependencyId;
    for (const glyph of Object.values(manifest.glyphs))
      glyph.path = pathMap.get(glyph.path)!;
    const parsed = manifest as ImageStringManifestV1;
    const rootKey = "image-string.manifest.json";
    files.set(
      rootKey,
      new TextEncoder().encode(`${JSON.stringify(parsed, null, 2)}\n`),
    );
    preparedDependency = Object.freeze({
      id: dependencyId,
      rootKey,
      manifest: parsed,
      keys: Object.freeze([...files.keys()].sort()),
      files,
    });
  }

  const next = cloneSymbolEditorProject(options.project);
  if (preparedDependency)
    installImageStringDependency(next, preparedDependency);
  const blurDependency = next.imageStringDependencies.get(dependencyId)!;
  const eligible = [...next.symbols.values()].flatMap((symbol) =>
    symbol.imageStringNodes.flatMap((node, nodeIndex) =>
      sameResource(node.resource, sourceNode.resource) &&
      node.targets.some(
        (target) => target.state === "spinBlur" && target.slot === undefined,
      )
        ? [{ symbol, node, nodeIndex }]
        : [],
    ),
  );
  const specialOutputs = new Map<string, string>();
  const newSpecialFiles: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const { node } of eligible) {
    for (const mapping of node.specialValueImages ?? []) {
      const sourceKey = mapping.image.replace(/^\.\//u, "");
      if (specialOutputs.has(sourceKey)) continue;
      const record = next.assetLibrary.records.get(sourceKey)!;
      const digest = await sha256Hex(record.bytes);
      const extension = extensionOfEditorAssetKey(sourceKey);
      const stem = sourceKey.slice(0, -(extension.length + 1));
      const targetKey = `${stem}.imgnumber-spin-blur-${digest}.png`;
      specialOutputs.set(sourceKey, targetKey);
      const existingTarget = next.assetLibrary.records.get(targetKey);
      if (existingTarget) {
        if (
          existingTarget.kind !== "image" ||
          existingTarget.diagnostics.length
        )
          throw new Error(`现有模糊特殊数值图片无效：${targetKey}。`);
      } else {
        newSpecialFiles.push({
          path: targetKey,
          bytes: await generateImage(record.bytes, options.codec),
        });
        generatedImageCount += 1;
      }
    }
  }
  if (newSpecialFiles.length)
    uploadAssetBatch(next, newSpecialFiles, `ImgNumber blur · ${dependencyId}`);
  for (const { symbol, nodeIndex } of eligible) {
    const nodes = structuredClone(symbol.imageStringNodes);
    const node = nodes[nodeIndex]!;
    (
      node as { spinBlurProfile?: typeof node.spinBlurProfile }
    ).spinBlurProfile = {
      resource: `./${blurDependency.rootKey}`,
      ...(node.specialValueImages?.length
        ? {
            specialValueImages: node.specialValueImages.map((mapping) => ({
              value: mapping.value,
              image: `./${specialOutputs.get(mapping.image.replace(/^\.\//u, ""))!}`,
            })),
          }
        : {}),
    };
    setSymbolImageStringNodes(next, symbol.symbol, nodes);
  }
  return Object.freeze({
    project: next,
    dependencyId,
    generatedImageCount,
    boundNodeCount: eligible.length,
  });
}

async function dependencySourceDigest(
  project: SymbolEditorProject,
  dependency: SymbolEditorProject["imageStringDependencies"] extends Map<
    string,
    infer Dependency
  >
    ? Dependency
    : never,
): Promise<string> {
  const entries = await Promise.all(
    [
      ...new Set(
        Object.values(dependency.manifest.glyphs).map(({ path }) => path),
      ),
    ]
      .sort()
      .map(
        async (path) =>
          [
            path,
            await sha256Hex(project.assetLibrary.records.get(path)!.bytes),
          ] as const,
      ),
  );
  const contract = JSON.stringify({
    preset: SYMBOL_STATE_TEXTURE_GENERATION_PRESET,
    manifest: dependency.manifest,
    entries,
  });
  return (await sha256Hex(new TextEncoder().encode(contract))).slice(0, 16);
}

async function generateImage(
  bytes: Uint8Array,
  codec: ImageStringSpinBlurCodec,
): Promise<Uint8Array> {
  const decoded = await codec.decode(bytes);
  return codec.encodePng(
    generateSymbolStateTextureRgba({ state: "spinBlur", ...decoded }),
  );
}

function findDependency(project: SymbolEditorProject, resource: string) {
  const key = resource.replace(/^\.\//u, "");
  return [...project.imageStringDependencies.values()].find(
    (dependency) => dependency.rootKey === key,
  );
}

function sameResource(left: string, right: string): boolean {
  return left.replace(/^\.\//u, "") === right.replace(/^\.\//u, "");
}

function assertMatchingLayout(
  normal: ImageStringManifestV1,
  spinBlur: ImageStringManifestV1,
): void {
  const comparable = (manifest: ImageStringManifestV1) => ({
    metrics: manifest.metrics,
    glyphs: Object.fromEntries(
      Object.entries(manifest.glyphs)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([character, glyph]) => [
          character,
          { size: glyph.size, offset: glyph.offset },
        ]),
    ),
    fixedAdvanceGroups: manifest.fixedAdvanceGroups,
  });
  if (
    JSON.stringify(comparable(normal)) !== JSON.stringify(comparable(spinBlur))
  )
    throw new Error(
      "现有模糊 ImgNumber dependency 与普通 ImgNumber layout 不一致。",
    );
}
