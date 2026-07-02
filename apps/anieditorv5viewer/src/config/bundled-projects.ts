import projectData from "../assets/project.json";
import lock01Data from "../assets/projects/lock_01.json";
import twoXData from "../assets/projects/2x.json";
import fiveXData from "../assets/projects/5x.json";
import tenXData from "../assets/projects/10x.json";
import bigwinData from "../assets/projects/bigwin.json";
import megawinData from "../assets/projects/megawin.json";
import multipayData from "../assets/projects/multipay.json";
import threeReelMultipay01Data from "../assets/projects/3reel_multipay_01.json";
import threeReelMultipay02Data from "../assets/projects/3reel_multipay_02.json";
import respinData from "../assets/projects/respin.json";
import scatter1Data from "../assets/projects/scatter1.json";
import scatter2Data from "../assets/projects/scatter2.json";
import superwinData from "../assets/projects/superwin.json";
import roundreelData from "../assets/projects/roundreel.json";
import number2Data from "../assets/projects/number2.json";
import number3Data from "../assets/projects/number3.json";
import game003L1WinsData from "../../../../assets/game003-s1/L1-wins.json";
import game003L2WinsData from "../../../../assets/game003-s1/L2-wins.json";
import game003L3WinsData from "../../../../assets/game003-s1/L3-wins.json";
import game003L4WinsData from "../../../../assets/game003-s1/L4-wins.json";
import game003L5WinsData from "../../../../assets/game003-s1/L5-wins.json";
import export2ManifestData from "../assets/export2/manifest.json";
import export2EditFullProjectData from "../assets/export2/edit_full/project.json";
import export2Runtime50ProjectData from "../assets/export2/runtime_50/project.json";
import {
  bundledAssetUrlManifest,
  export2EditFullAssetUrlManifest,
  export2Runtime50AssetUrlManifest,
  game003S1AssetUrlManifest,
  resolveProjectAssetUrls,
  type AssetUrlManifest,
} from "../runtime/asset-manifest";
import {
  assertVNIBundleManifest,
  assertVNIProject,
  validateManifestProjectProfile,
  validateVNIBundleManifest,
  validateVNIProject,
  type VNIBundleManifestEntry,
  type VNIExportProfileConfig,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/core";

export type BundledProjectId =
  | "project"
  | "lock-01"
  | "roundreel"
  | "number2"
  | "number3"
  | "bigwin"
  | "megawin"
  | "superwin"
  | "2x"
  | "5x"
  | "10x"
  | "respin"
  | "scatter1"
  | "scatter2"
  | "multipay"
  | "3reel-multipay-01"
  | "3reel-multipay-02"
  | "game003-l1-wins"
  | "game003-l2-wins"
  | "game003-l3-wins"
  | "game003-l4-wins"
  | "game003-l5-wins"
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
  project: VNIProjectConfig;
  assetUrls: AssetUrlManifest;
  insertionAssets: readonly BundledInsertionAsset[];
}

export interface BundledInsertionAsset {
  path: string;
  label: string;
  url: string;
  projectAssetId?: string;
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
  manifestEntry?: VNIBundleManifestEntry;
}

const export2Manifest = assertVNIBundleManifest(export2ManifestData);
validateVNIBundleManifest(export2Manifest);
validateExport2ManifestPaths(export2Manifest.exports);
const export2EditFullEntry = requireExport2ManifestEntry(
  "edit_full",
  "edit_full/project.json",
);
const export2Runtime50Entry = requireExport2ManifestEntry(
  "runtime_50",
  "runtime_50/project.json",
);
const roundreelProfile = requireBundledExportProfile(
  roundreelData,
  "roundreel",
);
const number2Profile = requireBundledExportProfile(number2Data, "number2");
const number3Profile = requireBundledExportProfile(number3Data, "number3");

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
    id: "lock-01",
    filename: "lock_01.json",
    sourcePath: "docs/anieditor5/export/lock_01.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: lock01Data,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "roundreel",
    filename: "roundreel.json",
    sourcePath: "docs/anieditor5/export/roundreel.json",
    bundleId: "export",
    profileId: roundreelProfile.id,
    purpose: roundreelProfile.purpose,
    assetScale: roundreelProfile.assetScale,
    data: roundreelData,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "number2",
    filename: "number2.json",
    sourcePath: "docs/anieditor5/export/number2.json",
    bundleId: "export",
    profileId: number2Profile.id,
    purpose: number2Profile.purpose,
    assetScale: number2Profile.assetScale,
    data: number2Data,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "number3",
    filename: "number3.json",
    sourcePath: "docs/anieditor5/export/number3.json",
    bundleId: "export",
    profileId: number3Profile.id,
    purpose: number3Profile.purpose,
    assetScale: number3Profile.assetScale,
    data: number3Data,
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
    id: "2x",
    filename: "2x.json",
    sourcePath: "docs/anieditor5/export/2x.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: twoXData,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "5x",
    filename: "5x.json",
    sourcePath: "docs/anieditor5/export/5x.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: fiveXData,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "10x",
    filename: "10x.json",
    sourcePath: "docs/anieditor5/export/10x.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: tenXData,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "respin",
    filename: "respin.json",
    sourcePath: "docs/anieditor5/export/respin.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: respinData,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "scatter1",
    filename: "scatter1.json",
    sourcePath: "docs/anieditor5/export/scatter1.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: scatter1Data,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "scatter2",
    filename: "scatter2.json",
    sourcePath: "docs/anieditor5/export/scatter2.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: scatter2Data,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "multipay",
    filename: "multipay.json",
    sourcePath: "docs/anieditor5/export/multipay.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: multipayData,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "3reel-multipay-01",
    filename: "3reel_multipay_01.json",
    sourcePath: "docs/anieditor5/export/3reel_multipay_01.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: threeReelMultipay01Data,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "3reel-multipay-02",
    filename: "3reel_multipay_02.json",
    sourcePath: "docs/anieditor5/export/3reel_multipay_02.json",
    bundleId: "legacy",
    profileId: "legacy_full",
    purpose: "legacy",
    assetScale: 1,
    data: threeReelMultipay02Data,
    assetUrlManifest: bundledAssetUrlManifest,
  },
  {
    id: "game003-l1-wins",
    filename: "L1-wins.json",
    sourcePath: "assets/game003-s1/L1-wins.json",
    bundleId: "game003-s1",
    profileId: "game003-s1",
    purpose: "runtime",
    assetScale: 1,
    data: game003L1WinsData,
    assetUrlManifest: game003S1AssetUrlManifest,
  },
  {
    id: "game003-l2-wins",
    filename: "L2-wins.json",
    sourcePath: "assets/game003-s1/L2-wins.json",
    bundleId: "game003-s1",
    profileId: "game003-s1",
    purpose: "runtime",
    assetScale: 1,
    data: game003L2WinsData,
    assetUrlManifest: game003S1AssetUrlManifest,
  },
  {
    id: "game003-l3-wins",
    filename: "L3-wins.json",
    sourcePath: "assets/game003-s1/L3-wins.json",
    bundleId: "game003-s1",
    profileId: "game003-s1",
    purpose: "runtime",
    assetScale: 1,
    data: game003L3WinsData,
    assetUrlManifest: game003S1AssetUrlManifest,
  },
  {
    id: "game003-l4-wins",
    filename: "L4-wins.json",
    sourcePath: "assets/game003-s1/L4-wins.json",
    bundleId: "game003-s1",
    profileId: "game003-s1",
    purpose: "runtime",
    assetScale: 1,
    data: game003L4WinsData,
    assetUrlManifest: game003S1AssetUrlManifest,
  },
  {
    id: "game003-l5-wins",
    filename: "L5-wins.json",
    sourcePath: "assets/game003-s1/L5-wins.json",
    bundleId: "game003-s1",
    profileId: "game003-s1",
    purpose: "runtime",
    assetScale: 1,
    data: game003L5WinsData,
    assetUrlManifest: game003S1AssetUrlManifest,
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
    const project = assertVNIProject(definition.data);
    validateVNIProject(project);
    if (definition.manifestEntry) {
      validateManifestProjectProfile(definition.manifestEntry, project);
    }
    const assetUrls = resolveProjectAssetUrls(
      project,
      definition.assetUrlManifest,
    );
    return Object.freeze({
      id: definition.id,
      label: createBundledProjectLabel(definition, project),
      sourcePath: definition.sourcePath,
      bundleId: definition.bundleId,
      profileId: definition.profileId,
      purpose: definition.purpose,
      assetScale: definition.assetScale,
      project,
      assetUrls,
      insertionAssets: createBundledInsertionAssets(
        project,
        definition.assetUrlManifest,
      ),
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

function requireBundledExportProfile(
  data: unknown,
  name: string,
): VNIExportProfileConfig {
  const project = assertVNIProject(data);
  if (!project.exportProfile) {
    throw new Error(`Bundled VNI project "${name}" is missing exportProfile.`);
  }
  return project.exportProfile;
}

function requireExport2ManifestEntry(
  id: string,
  expectedPath: string,
): VNIBundleManifestEntry {
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
  entries: readonly VNIBundleManifestEntry[],
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
  project: VNIProjectConfig,
): string {
  if (definition.bundleId === "legacy") {
    return `${project.name} (legacy/${definition.filename}, 100%)`;
  }
  if (definition.bundleId === "export") {
    const percent = Math.round(definition.assetScale * 100);
    const suffix = definition.purpose === "runtime" ? "运行资源" : "原图";
    return `${project.name} (export/${definition.filename}, ${definition.profileId}, ${percent}% ${suffix})`;
  }
  if (definition.bundleId === "game003-s1") {
    return `${project.name} (game003-s1/${definition.filename}, runtime source)`;
  }
  const percent = Math.round(definition.assetScale * 100);
  const suffix = definition.purpose === "runtime" ? "运行资源" : "原图";
  return `${project.name} (export2/${definition.profileId}, ${percent}% ${suffix})`;
}

function createBundledInsertionAssets(
  project: VNIProjectConfig,
  assetUrlManifest: AssetUrlManifest,
): readonly BundledInsertionAsset[] {
  const projectAssetByPath = new Map(
    project.assets.map((asset) => [asset.path, asset] as const),
  );
  return Object.freeze(
    Object.entries(assetUrlManifest)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, url]) => {
        const projectAsset = projectAssetByPath.get(path);
        const filename = getPathFilename(path);
        const insertionAsset = {
          path,
          label: projectAsset
            ? `${projectAsset.originalName} (${path})`
            : `${filename} (${path})`,
          url,
        };
        return Object.freeze(
          projectAsset
            ? { ...insertionAsset, projectAssetId: projectAsset.id }
            : insertionAsset,
        );
      }),
  );
}

function getPathFilename(path: string): string {
  const filename = path.split(/[\\/]/u).at(-1);
  if (!filename) {
    throw new Error(`Cannot parse bundled VNI asset path: ${path}`);
  }
  return filename;
}
