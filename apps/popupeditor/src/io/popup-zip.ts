import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  collectPopupPackagePaths,
  createPopupPackageResource,
  parsePopupManifest,
  type PopupManifestV1,
} from "@slotclientengine/rendercore/popup";
import {
  clonePopupEditorProject,
  createPopupEditorProject,
  projectToManifest,
  type PopupEditorProject,
} from "../model/project.js";
import { POPUP_ZIP_LIMITS } from "./resource-import.js";

export async function exportPopupZip(
  project: PopupEditorProject,
  options: { readonly prepare?: boolean } = {},
) {
  const manifest = projectToManifest(project);
  const files = productionFiles(project, manifest);
  collectPopupPackagePaths({ manifest, files });
  if (options.prepare !== false) {
    const resource = await createPopupPackageResource({ manifest, files });
    await resource.destroy();
  }
  const entries = new Map(files);
  entries.set("popup.manifest.json", encodeStable(manifest));
  const bytes = createDeterministicZip(entries, {
    level: 6,
    pathPolicy: { requireLowercase: true },
  });
  return Object.freeze({
    fileName: `${manifest.id}-popup.zip`,
    bytes,
    blob: new Blob([bytes.slice().buffer], { type: "application/zip" }),
  });
}

export function importPopupZip(bytes: Uint8Array): PopupEditorProject {
  const files = extractBoundedZip(bytes, {
    limits: POPUP_ZIP_LIMITS,
    pathPolicy: { requireLowercase: true },
  });
  const root = files.get("popup.manifest.json");
  if (!root)
    throw new Error("popup package 缺少 root popup.manifest.json sentinel。");
  const manifest = parsePopupManifest(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(root)),
  );
  collectPopupPackagePaths({ manifest, files });
  const project = createPopupEditorProject();
  project.id = manifest.id;
  project.designViewport = { ...manifest.designViewport };
  project.amountFormat = { ...manifest.amountFormat };
  project.resources.clear();
  project.blobs.clear();
  project.packageFiles.clear();
  for (const [path, payload] of files)
    if (path !== "popup.manifest.json")
      project.packageFiles.set(path, payload.slice());
  for (const [id, spec] of Object.entries(manifest.resources)) {
    const paths = resourcePaths(spec, manifest, files);
    project.resources.set(id, {
      id,
      kind: spec.kind,
      provenance: {
        sourceNames: [],
        sourceKind: "package-import",
        batchLabel: `${manifest.id}-popup.zip`,
      },
      spec,
      paths,
    });
  }
  for (const [path, payload] of project.packageFiles) {
    const match = /^assets\/([a-f0-9]{64})\.([a-z0-9]+)$/u.exec(path);
    if (match)
      project.blobs.set(`${match[1]}.${match[2]}`, {
        digest: match[1]!,
        extension: match[2]!,
        mediaType: media(path),
        byteLength: payload.byteLength,
        bytes: payload.slice(),
      });
  }
  project.tiers.set("base", {
    countDurationSeconds: manifest.awardCelebration.base.countDurationSeconds,
    layers: structuredClone([...manifest.awardCelebration.base.layers]),
  });
  project.tiers.set("standard", {
    countDurationSeconds:
      manifest.awardCelebration.standard.countDurationSeconds,
    layers: structuredClone([...manifest.awardCelebration.standard.layers]),
  });
  for (const tier of manifest.awardCelebration.celebrationTiers)
    project.tiers.set(tier.id, {
      countDurationSeconds: tier.countDurationSeconds,
      layers: structuredClone([...tier.layers]),
      thresholdMultiplier: tier.thresholdMultiplier,
    });
  return clonePopupEditorProject(project);
}

function productionFiles(
  project: PopupEditorProject,
  manifest: PopupManifestV1,
) {
  const files = new Map<string, Uint8Array>();
  const referenced = new Set<string>();
  for (const resource of Object.values(manifest.resources))
    for (const path of resourcePaths(resource, manifest, project.packageFiles))
      referenced.add(path);
  for (const path of referenced) {
    const bytes = project.packageFiles.get(path);
    if (!bytes) throw new Error(`project resource bytes 缺失：${path}`);
    files.set(path, bytes.slice());
  }
  return files;
}
function resourcePaths(
  spec: PopupManifestV1["resources"][string],
  manifest: PopupManifestV1,
  files: ReadonlyMap<string, Uint8Array>,
) {
  if (spec.kind === "image") return [spec.path];
  if (spec.kind === "spine")
    return [spec.skeleton, spec.atlas, ...Object.values(spec.textures)];
  if (spec.kind === "image-string") {
    const prefix = spec.manifest.slice(0, spec.manifest.lastIndexOf("/"));
    return [...files.keys()].filter(
      (path) => path === spec.manifest || path.startsWith(`${prefix}/assets/`),
    );
  }
  const projectBytes = files.get(spec.project);
  if (!projectBytes) return [spec.project];
  const project = JSON.parse(new TextDecoder().decode(projectBytes)) as {
    assets: readonly { path: string }[];
  };
  const directory = spec.project.slice(0, spec.project.lastIndexOf("/"));
  return [
    spec.project,
    ...project.assets.map((asset) => `${directory}/${asset.path}`),
  ];
}
function encodeStable(value: unknown) {
  return new TextEncoder().encode(`${JSON.stringify(sort(value), null, 2)}\n`);
}
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, child]) => [key, sort(child)]),
  );
}
function media(path: string) {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg")) return "image/jpeg";
  if (path.endsWith(".json")) return "application/json";
  return "text/plain";
}
