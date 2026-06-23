import {
  assertVNIBundleManifest,
  assertVNIProject,
  validateManifestProjectProfile,
  validateVNIBundleManifest,
  validateVNIProject,
  type VNIBundleManifestEntry,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/core";

export function loadValidatedProject(data: unknown): VNIProjectConfig {
  const project = assertVNIProject(data);
  validateVNIProject(project);
  return project;
}

export function loadValidatedBundleProject(
  manifestData: unknown,
  projectData: unknown,
  profileId: string,
): VNIProjectConfig {
  const manifest = assertVNIBundleManifest(manifestData);
  validateVNIBundleManifest(manifest);
  const entry = findManifestEntry(manifest.exports, profileId);
  const project = loadValidatedProject(projectData);
  validateManifestProjectProfile(entry, project);
  return project;
}

function findManifestEntry(
  entries: readonly VNIBundleManifestEntry[],
  profileId: string,
): VNIBundleManifestEntry {
  const entry = entries.find((item) => item.id === profileId);
  if (!entry) {
    throw new Error(`VNI bundle manifest is missing profile "${profileId}".`);
  }
  return entry;
}
