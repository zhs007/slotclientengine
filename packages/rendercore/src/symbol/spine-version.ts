export type SupportedSpineSkeletonVersion = "4.3";

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
  if (/^4\.3(?:\.|$)/u.test(version)) {
    return "4.3";
  }
  throw new Error(
    `Unsupported Spine skeleton version "${version}"; supported version is 4.3.x.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
