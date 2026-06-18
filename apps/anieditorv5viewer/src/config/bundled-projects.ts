import projectData from "../assets/project.json";
import bigwinData from "../assets/projects/bigwin.json";
import megawinData from "../assets/projects/megawin.json";
import superwinData from "../assets/projects/superwin.json";
import export2ManifestData from "../assets/export2/manifest.json";
import export2EditFullProjectData from "../assets/export2/edit_full/project.json";
import export2Runtime50ProjectData from "../assets/export2/runtime_50/project.json";
import {
  bundledAssetUrlManifest,
  export2EditFullAssetUrlManifest,
  export2Runtime50AssetUrlManifest,
  resolveProjectAssetUrls,
  type AssetUrlManifest,
} from "../runtime/asset-manifest";
import {
  assertV5GBundleManifest,
  assertV5GProject,
  validateManifestProjectProfile,
  validateV5GBundleManifest,
  validateV5GProject,
} from "../runtime/validation";
import type { V5GBundleManifestEntry, V5GProjectConfig } from "../v5g/types";

export type BundledProjectId =
  | "project"
  | "bigwin"
  | "megawin"
  | "superwin"
  | "bigwin-edit-full"
  | "bigwin-runtime-50";

export interface BundledV5GProject {
  id: BundledProjectId;
  label: string;
  sourcePath: string;
  bundleId: string;
  profileId: string;
  purpose: "editing" | "runtime" | "legacy";
  assetScale: number;
  project: V5GProjectConfig;
  assetUrls: AssetUrlManifest;
}

interface BundledProjectDefinition {
  id: BundledProjectId;
  filename: string;
  sourcePath: string;
  bundleId: string;
  profileId: string;
  purpose: "editing" | "runtime" | "legacy";
  assetScale: number;
  data: unknown;
  assetUrlManifest: AssetUrlManifest;
  manifestEntry?: V5GBundleManifestEntry;
}

const export2Manifest = assertV5GBundleManifest(export2ManifestData);
validateV5GBundleManifest(export2Manifest);
validateExport2ManifestPaths(export2Manifest.exports);
const export2EditFullEntry = requireExport2ManifestEntry(
  "edit_full",
  "edit_full/project.json",
);
const export2Runtime50Entry = requireExport2ManifestEntry(
  "runtime_50",
  "runtime_50/project.json",
);

const bundledProjectDefinitions: readonly BundledProjectDefinition[] = [
  {
    id: "project",
    filename: "project.json",
    sourcePath: "docs/anieditor5/export/project.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: projectData,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "bigwin",
    filename: "bigwin.json",
    sourcePath: "docs/anieditor5/export/bigwin.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: bigwinData,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "megawin",
    filename: "megawin.json",
    sourcePath: "docs/anieditor5/export/megawin.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: megawinData,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "superwin",
    filename: "superwin.json",
    sourcePath: "docs/anieditor5/export/superwin.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: superwinData,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "bigwin-edit-full",
    filename: "export2/edit_full/project.json",
    sourcePath: "docs/anieditor5/export2/edit_full/project.json",
    bundleId: "export2",
    profileId: export2EditFullEntry.id,
    purpose: export2EditFullEntry.purpose,
    assetScale: export2EditFullEntry.assetScale,
    data: export2EditFullProjectData,
    assetUrlManifest: export2EditFullAssetUrlManifest,
    manifestEntry: export2EditFullEntry,
  },
  {
    id: "bigwin-runtime-50",
    filename: "export2/runtime_50/project.json",
    sourcePath: "docs/anieditor5/export2/runtime_50/project.json",
    bundleId: "export2",
    profileId: export2Runtime50Entry.id,
    purpose: export2Runtime50Entry.purpose,
    assetScale: export2Runtime50Entry.assetScale,
    data: export2Runtime50ProjectData,
    assetUrlManifest: export2Runtime50AssetUrlManifest,
    manifestEntry: export2Runtime50Entry,
  },
];

export const bundledProjects: readonly BundledV5GProject[] = Object.freeze(
  bundledProjectDefinitions.map((definition) => {
    const project = assertV5GProject(definition.data);
    validateV5GProject(project);
    if (definition.manifestEntry) {
      validateManifestProjectProfile(definition.manifestEntry, project);
    }
    return Object.freeze({
      id: definition.id,
      label: createBundledProjectLabel(definition, project),
      sourcePath: definition.sourcePath,
      bundleId: definition.bundleId,
      profileId: definition.profileId,
      purpose: definition.purpose,
      assetScale: definition.assetScale,
      project,
      assetUrls: resolveProjectAssetUrls(project, definition.assetUrlManifest),
    });
  }),
);

export function getBundledProject(id: string): BundledV5GProject {
  const project = bundledProjects.find((item) => item.id === id);
  if (!project) {
    throw new Error(`Unknown bundled V5G project: ${id}`);
  }
  return project;
}

function requireExport2ManifestEntry(
  id: string,
  expectedPath: string,
): V5GBundleManifestEntry {
  const entry = export2Manifest.exports.find((item) => item.id === id);
  if (!entry) {
    throw new Error(`VNI bundle manifest is missing export "${id}".`);
  }
  if (entry.path !== expectedPath) {
    throw new Error(
      `VNI bundle export "${id}" path mismatch: expected ${expectedPath}, got ${entry.path}.`,
    );
  }
  return entry;
}

function validateExport2ManifestPaths(
  entries: readonly V5GBundleManifestEntry[],
): void {
  const knownPaths = new Set([
    "edit_full/project.json",
    "runtime_50/project.json",
  ]);
  for (const entry of entries) {
    if (!knownPaths.has(entry.path)) {
      throw new Error(
        `VNI bundle export "${entry.id}" path is not registered in anieditorv5viewer assets: ${entry.path}.`,
      );
    }
  }
}

function createBundledProjectLabel(
  definition: BundledProjectDefinition,
  project: V5GProjectConfig,
): string {
  if (definition.bundleId === "legacy") {
    return `${project.name} (legacy/${definition.filename}, 100%)`;
  }
  const percent = Math.round(definition.assetScale * 100);
  const suffix = definition.purpose === "runtime" ? "运行资源" : "原图";
  return `${project.name} (export2/${definition.profileId}, ${percent}% ${suffix})`;
}
