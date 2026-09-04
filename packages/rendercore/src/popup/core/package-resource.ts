import { Assets, Cache, Texture } from "pixi.js";
import {
  assertVNIProject,
  resolveProjectAssetUrls,
} from "@slotclientengine/vnicore/data";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
  validateImageStringText,
} from "../../image-string/data/index.js";
import {
  createImageStringResourceFromResolvedFiles,
  type DecodeImageStringImage,
} from "../../image-string/core/index.js";
import { createImageStringResourceFromFiles } from "../../image-string/package-runtime.js";
import { validateOfficialSpineResource } from "../../spine/runtime-player.js";
import { requiredPopupAmountCharacters } from "../data/amount-format.js";
import { resolvePopupLayerAttachment } from "../data/attachment.js";
import {
  collectPopupObjectPackagePaths,
  collectPopupPackagePaths,
} from "../data/package-closure.js";
import { collectPopupDirectPaths } from "../data/manifest.js";
import { loadPopupManifest } from "../data/normalize.js";
import { resolveAwardTiming } from "../award-timing.js";
import {
  parsePopupObjectManifest,
  popupObjectToSingleStateManifest,
} from "../data/object-manifest.js";
import type { LatestPopupManifest } from "../data/normalize.js";
import type {
  PopupLayer,
  PopupLayerAttachment,
  PopupOverlayLayer,
  SingleStatePopupManifestV9,
  SingleStatePopupLayerV9,
} from "../data/types.js";
import {
  acquirePopupFont,
  type PopupFontHandle,
  type PopupFontLoader,
} from "../font-resource.js";
import type {
  PopupPackageResource,
  PopupPreparedObject,
  PopupPreparedResource,
} from "./types.js";

const ROOT = "popup.manifest.json";

/** Prepares a standalone Popup Object from an already resolved, exact closure. */
export async function createPopupObjectPackageResourceFromResolvedFiles(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
  readonly loadFont?: PopupFontLoader;
  readonly resolveAssetUrl?: (path: string) => string | undefined;
}): Promise<PopupPreparedObject> {
  const manifest = parsePopupObjectManifest(options.manifest);
  collectPopupObjectPackagePaths({ manifest, files: options.files });
  const resource = (await createPopupPackageResourceFromResolvedFiles({
    manifest: popupObjectToSingleStateManifest(manifest),
    files: options.files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
    ...(options.loadFont ? { loadFont: options.loadFont } : {}),
    ...(options.resolveAssetUrl
      ? { resolveAssetUrl: options.resolveAssetUrl }
      : {}),
  })) as PopupPackageResource<SingleStatePopupManifestV9>;
  return Object.freeze({ kind: "popup-object", manifest, resource });
}

/** Prepares a runtime resource from an already resolved, exact popup closure. */
export async function createPopupPackageResourceFromResolvedFiles(options: {
  readonly manifest?: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
  readonly loadFont?: PopupFontLoader;
  readonly resolveAssetUrl?: (path: string) => string | undefined;
}): Promise<PopupPackageResource<LatestPopupManifest>> {
  const manifest = loadPopupManifest(
    options.manifest ?? parseJson(requireBytes(options.files, ROOT), ROOT),
  ).manifest;
  const files = options.files;
  collectPopupPackagePaths({ manifest, files, allowExtraFiles: true });
  const mapped = collectPopupDirectPaths(manifest).every(
    (reference) => !reference.includes("/"),
  );
  const urls: string[] = [];
  const prepared: Record<string, PopupPreparedResource> = {};
  const ownedTextures = new Set<Texture>();
  const ownedAssetUrls = new Set<string>();
  const fonts: PopupFontHandle[] = [];
  try {
    for (const [id, spec] of Object.entries(manifest.resources)) {
      if (spec.kind === "image-string") {
        const imageStringResource = mapped
          ? await createMappedNestedImageStringResource({
              manifestKey: spec.manifest,
              files,
              ...(options.decodeImage
                ? { decodeImage: options.decodeImage }
                : {}),
              ...(options.loadTexture
                ? { loadTexture: options.loadTexture }
                : {}),
              ...(options.resolveAssetUrl
                ? { resolveAssetUrl: options.resolveAssetUrl }
                : {}),
            })
          : await createImageStringResourceFromFiles({
              files: extractPrefix(
                files,
                spec.manifest.slice(0, spec.manifest.lastIndexOf("/")),
              ),
              ...(options.decodeImage
                ? { decodeImage: options.decodeImage }
                : {}),
              ...(options.loadTexture
                ? { loadTexture: options.loadTexture }
                : {}),
            });
        prepared[id] = { kind: "image-string", resource: imageStringResource };
        if (
          manifest.type === "award-celebration" &&
          awardAmountResourceIds(manifest).has(id)
        )
          validateImageStringText(
            requiredPopupAmountCharacters(manifest.amountFormat).join(""),
            imageStringResource.manifest,
          );
      } else if (spec.kind === "image") {
        const resolvedUrl = options.resolveAssetUrl?.(spec.path);
        const url =
          resolvedUrl ??
          objectUrl(requireBytes(files, spec.path), spec.path, urls);
        const texture =
          url.startsWith("scene-layout-delivery:") && Cache.has(url)
            ? Cache.get<Texture>(url)
            : await (options.loadTexture
                ? options.loadTexture(url, spec.path)
                : Assets.load<Texture>({ src: url, parser: "loadTextures" }));
        if (!resolvedUrl) {
          if (options.loadTexture) ownedTextures.add(texture);
          else ownedAssetUrls.add(url);
        }
        if (
          texture.width !== spec.size.width ||
          texture.height !== spec.size.height
        )
          throw new Error(
            `popup image size mismatch ${spec.path}: expected ${spec.size.width}x${spec.size.height}, got ${texture.width}x${texture.height}.`,
          );
        prepared[id] = { kind: "image", texture };
      } else if (spec.kind === "font") {
        const font = await acquirePopupFont({
          bytes: requireBytes(files, spec.path),
          path: spec.path,
          ...(options.loadFont ? { loader: options.loadFont } : {}),
        });
        fonts.push(font);
        prepared[id] = { kind: "font", family: font.family };
      } else if (spec.kind === "vni") {
        const project = assertVNIProject(
          parseJson(requireBytes(files, spec.project), spec.project),
        );
        const assetUrls: Record<string, string> = {};
        for (const asset of project.assets) {
          const path = mapped
            ? asset.path
            : resolveRelative(spec.project, asset.path);
          assetUrls[asset.path] =
            options.resolveAssetUrl?.(path) ??
            objectUrl(requireBytes(files, path), asset.path, urls);
        }
        prepared[id] = {
          kind: "vni",
          project,
          assetUrls: resolveProjectAssetUrls(project, assetUrls),
        };
      } else if (spec.kind === "popup-object") {
        const objectManifest = parsePopupObjectManifest(
          parseJson(requireBytes(files, spec.manifest), spec.manifest),
        );
        const objectFiles = mapped
          ? files
          : extractPrefix(
              files,
              spec.manifest.slice(0, spec.manifest.lastIndexOf("/")),
            );
        const objectDirectory = spec.manifest.slice(
          0,
          spec.manifest.lastIndexOf("/") + 1,
        );
        const resource = (await createPopupPackageResourceFromResolvedFiles({
          manifest: popupObjectToSingleStateManifest(objectManifest),
          files: objectFiles,
          ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
          ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
          ...(options.loadFont ? { loadFont: options.loadFont } : {}),
          ...(options.resolveAssetUrl
            ? {
                resolveAssetUrl: mapped
                  ? options.resolveAssetUrl
                  : (path: string) =>
                      options.resolveAssetUrl?.(`${objectDirectory}${path}`),
              }
            : {}),
        })) as PopupPackageResource<SingleStatePopupManifestV9>;
        prepared[id] = {
          kind: "popup-object",
          manifest: objectManifest,
          resource,
        };
      } else {
        const skeleton = parseJson(
          requireBytes(files, spec.skeleton),
          spec.skeleton,
        );
        const atlasText = decode(requireBytes(files, spec.atlas), spec.atlas);
        const textureUrls = Object.fromEntries(
          Object.entries(spec.textures).map(([page, path]) => {
            const resolvedUrl = options.resolveAssetUrl?.(path);
            const url =
              resolvedUrl ?? objectUrl(requireBytes(files, path), path, urls);
            if (!resolvedUrl) ownedAssetUrls.add(url);
            return [page, url];
          }),
        );
        const spine = { skeleton, atlasText, textureUrls };
        const requiredAnimations =
          manifest.type === "spine" && manifest.spine.resource === id
            ? [
                manifest.spine.playback.startAnimation,
                manifest.spine.playback.loopAnimation,
                manifest.spine.playback.endAnimation,
              ]
            : [];
        validateOfficialSpineResource({ resource: spine, requiredAnimations });
        prepared[id] = { kind: "spine", resource: spine };
      }
    }
    validateAnimationBindings(manifest, prepared);
    const resolvedManifest =
      manifest.type === "award-celebration"
        ? (() => {
            const { megaOnce: _megaOnce, ...timing } = resolveAwardTiming(
              manifest.awardCelebration,
              (id) => {
                const resource = prepared[id];
                if (resource?.kind !== "vni")
                  throw new Error(
                    `award timing VNI resource unavailable: ${id}.`,
                  );
                return resource.project.stage.duration;
              },
            );
            return Object.freeze({
              ...manifest,
              awardCelebration: Object.freeze({
                ...manifest.awardCelebration,
                ...timing,
              }),
            });
          })()
        : manifest;
    let destroyed = false;
    return Object.freeze({
      manifest: resolvedManifest,
      resources: Object.freeze(prepared),
      async destroy() {
        if (destroyed) return;
        destroyed = true;
        await releasePrepared(
          prepared,
          fonts,
          ownedTextures,
          ownedAssetUrls,
          urls,
        );
      },
    });
  } catch (error) {
    await releasePrepared(prepared, fonts, ownedTextures, ownedAssetUrls, urls);
    throw error;
  }
}

async function createMappedNestedImageStringResource(options: {
  readonly manifestKey: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
  readonly resolveAssetUrl?: (path: string) => string | undefined;
}) {
  const manifest = parseImageStringManifest(
    parseJson(
      requireBytes(options.files, options.manifestKey),
      options.manifestKey,
    ),
  );
  const nested = new Map<string, Uint8Array>([
    [
      "image-string.manifest.json",
      requireBytes(options.files, options.manifestKey),
    ],
  ]);
  for (const key of collectImageStringAssetPaths(manifest))
    nested.set(key, requireBytes(options.files, key));
  return createImageStringResourceFromResolvedFiles({
    manifest,
    files: nested,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
    ...(options.resolveAssetUrl
      ? { resolveAssetUrl: options.resolveAssetUrl }
      : {}),
  });
}

async function releasePrepared(
  prepared: Readonly<Record<string, PopupPreparedResource>>,
  fonts: readonly PopupFontHandle[],
  textures: ReadonlySet<Texture>,
  assetUrls: ReadonlySet<string>,
  urls: readonly string[],
): Promise<void> {
  try {
    const releases = Object.values(prepared)
      .filter(
        (value) =>
          value.kind === "image-string" || value.kind === "popup-object",
      )
      .map((value) => value.resource.destroy());
    const loadedUrls = [...assetUrls].filter((url) => Cache.has(url));
    if (loadedUrls.length) releases.push(Assets.unload(loadedUrls));
    const results = await Promise.allSettled(releases);
    for (const result of results)
      if (result.status === "rejected") throw result.reason;
  } finally {
    for (const font of fonts) font.release();
    for (const texture of textures) texture.destroy(false);
    for (const url of urls) URL.revokeObjectURL(url);
  }
}

function validateAnimationBindings(
  manifest: LatestPopupManifest,
  resources: Readonly<Record<string, PopupPreparedResource>>,
): void {
  if (manifest.type === "spine") {
    const resource = resources[manifest.spine.resource];
    if (resource?.kind !== "spine")
      throw new Error("Spine popup resource mismatch.");
    validateOfficialSpineResource({
      resource: resource.resource,
      requiredAnimations: [
        manifest.spine.playback.startAnimation,
        manifest.spine.playback.loopAnimation,
        manifest.spine.playback.endAnimation,
      ],
      requiredSlots: Object.freeze([
        ...requiredPopupSpineSlots(manifest.spine.overlays ?? [], "main-spine"),
        ...(manifest.spine.tapInfoObject?.attachment.kind === "spine-slot"
          ? [manifest.spine.tapInfoObject.attachment.slot]
          : []),
      ]),
    });
    for (const overlay of manifest.spine.overlays ?? []) {
      const overlayResource = overlay.resource
        ? resources[overlay.resource]
        : undefined;
      if (overlay.kind === "image-string") {
        if (overlayResource?.kind !== "image-string")
          throw new Error("Spine popup ImgNumber overlay resource mismatch.");
        validateImageStringText(
          overlay.defaultText,
          overlayResource.resource.manifest,
        );
      } else if (overlay.kind === "text") {
        if (overlayResource && overlayResource.kind !== "font")
          throw new Error("Spine popup text overlay resource mismatch.");
      } else if (overlay.kind === "spine") {
        if (overlayResource?.kind !== "spine")
          throw new Error("Spine popup overlay resource mismatch.");
        validateOfficialSpineResource({
          resource: overlayResource.resource,
          requiredAnimations: [
            overlay.playback.startAnimation,
            overlay.playback.loopAnimation,
            overlay.playback.endAnimation,
          ],
          requiredSlots: requiredPopupSpineSlots(
            manifest.spine.overlays ?? [],
            overlay.id,
          ),
        });
      } else if (overlay.kind === "vni") {
        if (overlayResource?.kind !== "vni")
          throw new Error("Spine popup VNI overlay resource mismatch.");
        if (
          overlay.playback.mode === "segmented" &&
          overlay.playback.loopEndTime > overlayResource.project.stage.duration
        )
          throw new Error(
            `popup VNI overlay ${overlay.id} loopEndTime exceeds project duration.`,
          );
      } else if (
        overlay.kind === "popup-object" &&
        overlayResource?.kind !== "popup-object"
      ) {
        throw new Error("Spine popup object resource mismatch.");
      }
    }
    validatePopupVniTextLayerAttachments(
      manifest.spine.overlays ?? [],
      resources,
      "spine.overlays",
    );
    const tapInfoAttachment = manifest.spine.tapInfoObject?.attachment;
    if (tapInfoAttachment?.kind === "vni-text-layer")
      validatePopupVniTextLayerTarget(
        manifest.spine.overlays ?? [],
        resources,
        tapInfoAttachment,
        "spine.tapInfoObject.attachment",
      );
    return;
  }
  if (manifest.type === "single-state") {
    for (const layer of manifest.singleState.layers) {
      const resource = layer.resource ? resources[layer.resource] : undefined;
      if (layer.kind === "image-string") {
        if (resource?.kind !== "image-string")
          throw new Error("single-state popup ImgNumber resource mismatch.");
        validateImageStringText(layer.defaultText, resource.resource.manifest);
      } else if (layer.kind === "text") {
        if (resource && resource.kind !== "font")
          throw new Error("single-state popup text resource mismatch.");
      } else if (layer.kind === "vni") {
        if (resource?.kind !== "vni")
          throw new Error("single-state popup VNI resource mismatch.");
        if (
          layer.autoplay?.mode === "segmented" &&
          layer.autoplay.loopEndTime > resource.project.stage.duration
        )
          throw new Error(
            `single-state popup VNI layer ${layer.id} loopEndTime exceeds project duration.`,
          );
      } else if (layer.kind === "spine") {
        if (resource?.kind !== "spine")
          throw new Error("single-state popup Spine resource mismatch.");
        validateOfficialSpineResource({
          resource: resource.resource,
          requiredAnimations: layer.autoplay ? [layer.autoplay.animation] : [],
          requiredSlots: requiredPopupSpineSlots(
            manifest.singleState.layers,
            layer.id,
          ),
        });
      } else if (
        layer.kind === "popup-object" &&
        resource?.kind !== "popup-object"
      ) {
        throw new Error("single-state popup object resource mismatch.");
      }
    }
    validatePopupVniTextLayerAttachments(
      manifest.singleState.layers,
      resources,
      "singleState.layers",
    );
    return;
  }
  for (const [tierId, tier] of [
    ["base", manifest.awardCelebration.base],
    ["standard", manifest.awardCelebration.standard],
    ...manifest.awardCelebration.celebrationTiers.map(
      (tier) => [tier.id, tier] as const,
    ),
  ] as const) {
    for (const layer of tier.layers) {
      const resource = layer.resource ? resources[layer.resource] : undefined;
      if (layer.kind === "image-string" && layer.binding === "manual") {
        if (resource?.kind !== "image-string")
          throw new Error("popup manual ImgNumber resource mismatch.");
        validateImageStringText(
          layer.defaultText ?? "",
          resource.resource.manifest,
        );
      }
      if (layer.kind === "text" && resource && resource.kind !== "font")
        throw new Error("popup text resource mismatch.");
      if (layer.kind === "vni") {
        if (resource?.kind !== "vni")
          throw new Error("popup VNI resource mismatch.");
        if (
          layer.playback.mode === "segmented" &&
          layer.playback.loopEndTime > resource.project.stage.duration
        )
          throw new Error(
            `popup VNI layer ${layer.id} loopEndTime exceeds project duration.`,
          );
      }
      if (layer.kind === "spine") {
        if (resource?.kind !== "spine")
          throw new Error("popup Spine resource mismatch.");
        validateOfficialSpineResource({
          resource: resource.resource,
          requiredAnimations: [
            layer.playback.startAnimation,
            layer.playback.loopAnimation,
            layer.playback.endAnimation,
          ],
          requiredSlots: requiredPopupSpineSlots(tier.layers, layer.id),
        });
      }
      if (layer.kind === "popup-object" && resource?.kind !== "popup-object")
        throw new Error("award popup object resource mismatch.");
    }
    validatePopupVniTextLayerAttachments(
      tier.layers,
      resources,
      `awardCelebration.${tierId}.layers`,
    );
  }
}

function validatePopupVniTextLayerAttachments(
  layers: readonly (PopupLayer | PopupOverlayLayer | SingleStatePopupLayerV9)[],
  resources: Readonly<Record<string, PopupPreparedResource>>,
  label: string,
): void {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  for (const layer of layers) {
    const attachment = resolvePopupLayerAttachment(layer);
    if (attachment.kind !== "vni-text-layer") continue;
    validatePopupVniTextLayerTarget(
      layers,
      resources,
      attachment,
      `${label} layer ${layer.id}`,
      byId,
    );
  }
}

function validatePopupVniTextLayerTarget(
  layers: readonly (PopupLayer | PopupOverlayLayer | SingleStatePopupLayerV9)[],
  resources: Readonly<Record<string, PopupPreparedResource>>,
  attachment: Extract<
    PopupLayerAttachment,
    { readonly kind: "vni-text-layer" }
  >,
  label: string,
  existingById?: ReadonlyMap<
    string,
    PopupLayer | PopupOverlayLayer | SingleStatePopupLayerV9
  >,
): void {
  const byId =
    existingById ?? new Map(layers.map((layer) => [layer.id, layer]));
  const target = byId.get(attachment.vniLayerId);
  const targetResource =
    target?.kind === "vni" ? resources[target.resource] : undefined;
  if (target?.kind !== "vni" || targetResource?.kind !== "vni")
    throw new Error(
      `${label} references unavailable VNI parent ${attachment.vniLayerId}.`,
    );
  const textLayer = targetResource.project.layers.find(
    ({ id }) => id === attachment.textLayerId,
  );
  if (!textLayer || textLayer.type !== "text")
    throw new Error(
      `${label} references missing VNI text layer ${attachment.vniLayerId}/${attachment.textLayerId}.`,
    );
}

function requiredPopupSpineSlots(
  layers: readonly (PopupLayer | PopupOverlayLayer | SingleStatePopupLayerV9)[],
  target: string,
): readonly string[] {
  const slots = new Set<string>();
  for (const layer of layers) {
    const attachment = resolvePopupLayerAttachment(layer);
    if (attachment.kind !== "spine-slot") continue;
    const targetId =
      attachment.target.kind === "main-spine"
        ? "main-spine"
        : attachment.target.layerId;
    if (targetId === target) slots.add(attachment.slot);
  }
  return Object.freeze([...slots]);
}

function awardAmountResourceIds(
  manifest: Extract<
    LatestPopupManifest,
    { readonly type: "award-celebration" }
  >,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const tier of [
    manifest.awardCelebration.base,
    manifest.awardCelebration.standard,
    ...manifest.awardCelebration.celebrationTiers,
  ])
    for (const layer of tier.layers)
      if (layer.kind === "image-string" && layer.binding === "win-amount")
        result.add(layer.resource!);
  return result;
}

function extractPrefix(files: ReadonlyMap<string, Uint8Array>, prefix: string) {
  const result = new Map<string, Uint8Array>();
  const marker = `${prefix}/`;
  for (const [path, bytes] of files)
    if (path.startsWith(marker))
      result.set(path.slice(marker.length), bytes.slice());
  return result;
}

function resolveRelative(base: string, reference: string): string {
  const directory = base.slice(0, base.lastIndexOf("/") + 1);
  return `${directory}${reference}`;
}

function requireBytes(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
): Uint8Array {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`popup package missing ${path}.`);
  return bytes;
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(decode(bytes, path));
  } catch (error) {
    throw new Error(
      `invalid JSON ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function decode(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`invalid UTF-8 ${path}.`);
  }
}

function objectUrl(bytes: Uint8Array, path: string, urls: string[]): string {
  const url = URL.createObjectURL(
    new Blob([bytes.slice().buffer], { type: mime(path) }),
  );
  urls.push(url);
  return url;
}

function mime(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
