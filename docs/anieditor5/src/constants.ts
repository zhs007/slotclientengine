export const TOOL_NAME = "VNI";
export const VNI_VERSION = "VNI_0.017";
export const COCOS_TARGET_VERSION = "3.8.6";

export const DEFAULT_STAGE_WIDTH = 900;
export const DEFAULT_STAGE_HEIGHT = 1600;
export const DEFAULT_DURATION_SECONDS = 5;
export const DEFAULT_BACKGROUND_COLOR = "#0a0a0a";

export const DEFAULT_EXPORT_ZIP_FILENAME = "vni_export.zip";

export function buildExportJsonFilename(projectName: string): string {
  const safe = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "vni_project";
}
