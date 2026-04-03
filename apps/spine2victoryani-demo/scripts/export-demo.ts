import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptSpineData } from "../src/runtime/spine-adapter.js";
import { parseAtlas, sanitizeAssetName } from "../src/runtime/atlas-core.js";
import { writeSlicedAtlasAssets } from "../src/runtime/atlas-slicer.js";
import { buildVictoryProject, createMirrorCheckPairs, EXPORT_STAGE, EXPORT_VERSION, getStageScale } from "../src/runtime/spine-to-victoryani.js";
import type { ExportManifest } from "../src/runtime/export-types.js";
import type { RawSpineSkeleton } from "../src/runtime/spine-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const sourceAtlasPath = join(appRoot, "src", "assets", "cabin.atlas");
const sourceImagePath = join(appRoot, "src", "assets", "cabin.png");
const sourceSpinePath = join(appRoot, "src", "data", "cabin-spine.json");
const outputRoot = join(appRoot, "public", "exported");
const outputAssetsDir = join(outputRoot, "assets");
const outputAnimationsDir = join(outputRoot, "animations");

async function main() {
  const [atlasText, rawSpineText] = await Promise.all([
    readFile(sourceAtlasPath, "utf8"),
    readFile(sourceSpinePath, "utf8")
  ]);

  const atlas = parseAtlas(atlasText);
  const model = adaptSpineData(JSON.parse(rawSpineText) as RawSpineSkeleton);
  const fileNames = Object.fromEntries(
    Object.keys(atlas.regions).map((regionName) => [regionName, `${sanitizeAssetName(regionName)}.png`])
  );

  await rm(outputRoot, { recursive: true, force: true });
  await Promise.all([mkdir(outputAssetsDir, { recursive: true }), mkdir(outputAnimationsDir, { recursive: true })]);

  const slicedAssets = await writeSlicedAtlasAssets(sourceImagePath, atlas, outputAssetsDir, fileNames);
  const assetPaths = Object.fromEntries(slicedAssets.map((asset) => [asset.textureName, asset.relativePath]));
  const animationNames = Object.keys(model.animations);
  const defaultAnimation = animationNames.includes("cabin") ? "cabin" : animationNames[0];
  const projects = new Map<string, ReturnType<typeof buildVictoryProject>>();

  for (const animationName of animationNames) {
    const animationAssetPaths = Object.fromEntries(
      Object.entries(assetPaths).map(([textureName, relativePath]) => [textureName, relativePath.replace(/^\.\//, "../")])
    );
    const project = buildVictoryProject(model, animationName, {
      fps: model.skeleton.fps,
      assetPaths: animationAssetPaths,
      stageWidth: EXPORT_STAGE.width,
      stageHeight: EXPORT_STAGE.height,
      stageAnchorX: EXPORT_STAGE.anchorX,
      stageAnchorY: EXPORT_STAGE.anchorY
    });

    projects.set(animationName, project);
    await writeFile(join(outputAnimationsDir, `${animationName}.project.json`), JSON.stringify(project, null, 2));
  }

  await writeFile(join(outputRoot, "project.json"), JSON.stringify(projects.get(defaultAnimation), null, 2));

  const manifest: ExportManifest = {
    version: EXPORT_VERSION,
    generatedAt: new Date().toISOString(),
    defaultAnimation,
    stage: {
      width: EXPORT_STAGE.width,
      height: EXPORT_STAGE.height,
      anchorX: EXPORT_STAGE.anchorX,
      anchorY: EXPORT_STAGE.anchorY,
      scale: getStageScale(model, EXPORT_STAGE.width, EXPORT_STAGE.height)
    },
    source: {
      skeletonWidth: model.skeleton.width,
      skeletonHeight: model.skeleton.height,
      bones: model.bones.length,
      slots: model.slots.length,
      attachments: model.attachmentNames.length
    },
    assetCount: slicedAssets.length,
    animations: animationNames.map((animationName) => ({
      name: animationName,
      duration: model.animations[animationName].duration,
      fps: model.skeleton.fps,
      projectPath: `./animations/${animationName}.project.json`,
      layerCount: projects.get(animationName)?.layers?.length ?? 0
    })),
    mirrorChecks: createMirrorCheckPairs()
  };

  await writeFile(join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
}

void main().catch((error) => {
  console.error("Failed to export spine2victoryani demo", error);
  process.exitCode = 1;
});
