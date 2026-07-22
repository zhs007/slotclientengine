import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  exportLayoutZip,
  stableManifestJson,
} from "../src/io/exported-layout-zip.js";
import {
  extractBoundedZip,
  importLayoutZip,
} from "../src/io/imported-layout-zip.js";
import {
  createNewEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import {
  addGameMode,
  createGameModeTransition,
  setGameModeTransitionKind,
  setGameModeVideoTransitionFadeOut,
  setGameModeVideoTransitionResource,
} from "../src/model/game-mode-commands.js";
import {
  assignBackgroundResource,
  uploadImageResource,
  uploadVideoResource,
} from "../src/model/resource-commands.js";

const workspace = resolve(import.meta.dirname, "../../..");
const assetDirectory = resolve(workspace, "assets/game003-s1");
const outputPath = resolve(workspace, "game003-layout.zip");
const temporaryOutputPath = resolve(workspace, ".game003-layout.zip.tmp");

const imageSizes = new Map([
  ["bg1.jpg", { width: 2000, height: 1125 }],
  ["bg2.jpg", { width: 1174, height: 2000 }],
  ["fg1.jpg", { width: 2000, height: 1125 }],
  ["fg2.jpg", { width: 1174, height: 2000 }],
]);
const sourceBytes = new Map<string, Uint8Array>();
for (const name of [...imageSizes.keys(), "bg2fg.mp4"])
  sourceBytes.set(
    name,
    new Uint8Array(await readFile(resolve(assetDirectory, name))),
  );

const imageSizeByDigest = new Map(
  [...imageSizes].map(([name, size]) => [sha256(sourceBytes.get(name)!), size]),
);
const decodeExportedImage = async (url: string) => {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const size = imageSizeByDigest.get(sha256(bytes));
  if (!size) throw new Error("验收 ZIP 中出现未知图片 payload。");
  return size;
};
const videoMetadata = {
  width: 1280,
  height: 720,
  durationSeconds: 3.625,
  hasAudio: true as const,
};

const project = createNewEditorProject("orientation-focus");
project.id = "game003";
for (const [id, name] of [
  ["base-landscape", "bg1.jpg"],
  ["base-portrait", "bg2.jpg"],
  ["free-landscape", "fg1.jpg"],
  ["free-portrait", "fg2.jpg"],
] as const) {
  await uploadImageResource({
    project,
    resourceId: id,
    file: new File([sourceBytes.get(name)! as BlobPart], name, {
      type: "image/jpeg",
    }),
    decodeImage: async () => imageSizes.get(name)!,
  });
}
await uploadVideoResource({
  project,
  resourceId: "bg2fg",
  file: new File([sourceBytes.get("bg2fg.mp4")! as BlobPart], "bg2fg.mp4", {
    type: "video/mp4",
  }),
  decodeVideo: async () => videoMetadata,
});

assignBackgroundResource({
  project,
  modeId: "BaseGame",
  variant: "landscape",
  resourceId: "base-landscape",
  nodeId: "base-landscape-background",
});
assignBackgroundResource({
  project,
  modeId: "BaseGame",
  variant: "portrait",
  resourceId: "base-portrait",
  nodeId: "base-portrait-background",
});
addGameMode(project, "FreeGame");
assignBackgroundResource({
  project,
  modeId: "FreeGame",
  variant: "landscape",
  resourceId: "free-landscape",
  nodeId: "free-landscape-background",
});
assignBackgroundResource({
  project,
  modeId: "FreeGame",
  variant: "portrait",
  resourceId: "free-portrait",
  nodeId: "free-portrait-background",
});
createGameModeTransition(project, "BaseGame", "FreeGame");
const transition = setGameModeTransitionKind(
  project,
  project.gameModes.transitions[0]!,
  "video",
);
setGameModeVideoTransitionResource(project, transition, "bg2fg");
setGameModeVideoTransitionFadeOut(project, transition, 0.5);

const first = await exportLayoutZip({
  manifest: editorProjectToManifest(project),
  assets: project.assets,
  decodeImage: decodeExportedImage,
  decodeVideo: async () => videoMetadata,
});
const imported = await importLayoutZip(first.bytes, {
  decodeImage: decodeExportedImage,
  decodeVideo: async () => videoMetadata,
});
const importedProject = manifestToEditorProject(
  imported.manifest,
  imported.assets,
  imported.videoMetadata,
);
const second = await exportLayoutZip({
  manifest: editorProjectToManifest(importedProject),
  assets: importedProject.assets,
  decodeImage: decodeExportedImage,
  decodeVideo: async () => videoMetadata,
});
if (
  stableManifestJson(imported.manifest) !==
  stableManifestJson(editorProjectToManifest(importedProject))
)
  throw new Error("验收 ZIP round-trip manifest 语义不一致。");
if (!sameBytes(first.bytes, second.bytes))
  throw new Error("验收 ZIP 重导出 bytes 不确定。 ");
const firstEntries = extractBoundedZip(first.bytes);
const secondEntries = extractBoundedZip(second.bytes);
if (
  JSON.stringify([...firstEntries.keys()]) !==
  JSON.stringify([...secondEntries.keys()])
)
  throw new Error("验收 ZIP round-trip entry 顺序不一致。");
for (const [path, bytes] of firstEntries) {
  const roundTripped = secondEntries.get(path);
  if (!roundTripped || !sameBytes(bytes, roundTripped))
    throw new Error(`验收 ZIP payload 往返漂移：${path}`);
}
const transitionOverlay = imported.manifest.gameModes!.transitions![0]!.overlay;
if (transitionOverlay.resource.kind !== "video")
  throw new Error("验收 ZIP 缺少 video transition。");
if (
  !sameBytes(
    firstEntries.get(transitionOverlay.resource.path)!,
    sourceBytes.get("bg2fg.mp4")!,
  )
)
  throw new Error("验收 ZIP MP4 bytes 被修改。");
if (firstEntries.size !== 6)
  throw new Error(
    `验收 ZIP 必须恰好包含 manifest、四张背景和一段 MP4，实际 ${firstEntries.size} entries。`,
  );
imported.destroy();

await writeFile(temporaryOutputPath, first.bytes);
await rename(temporaryOutputPath, outputPath);
process.stdout.write(
  `${JSON.stringify(
    {
      outputPath,
      size: first.bytes.byteLength,
      sha256: sha256(first.bytes),
      entries: [...firstEntries].map(([path, bytes]) => ({
        path,
        size: bytes.byteLength,
        sha256: sha256(bytes),
      })),
      videoMetadata,
      reverseTransitionConfigured: false,
      roundTripByteIdentical: true,
    },
    null,
    2,
  )}\n`,
);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}
