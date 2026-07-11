export type SupportedSpineSkeletonVersion = "3.8" | "4.2";

export function readSupportedSpineSkeletonVersion(
  skeleton: unknown,
): SupportedSpineSkeletonVersion {
  if (!isRecord(skeleton)) {
    throw new Error("Spine skeleton must be an object.");
  }
  const metadata = skeleton.skeleton;
  if (!isRecord(metadata)) {
    throw new Error("Spine skeleton metadata must be an object.");
  }
  const version = metadata.spine;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("Spine skeleton version must be a non-empty string.");
  }
  if (/^3\.8(?:\.|$)/u.test(version)) {
    return "3.8";
  }
  if (/^4\.2(?:\.|$)/u.test(version)) {
    return "4.2";
  }
  throw new Error(
    `Unsupported Spine skeleton version "${version}"; supported versions are 3.8.x and 4.2.x.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
