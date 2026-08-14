import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Assets, Texture } from "pixi.js";
import { exportLayoutZip } from "../src/io/exported-layout-zip.js";
import { importLayoutZip } from "../src/io/imported-layout-zip.js";
import { importSymbolsZipWithFiles } from "../src/io/imported-symbol-package.js";
import {
  editorProjectToManifest,
  manifestToEditorProject,
  type EditorProject,
} from "../src/model/editor-project.js";
import { replaceSymbolDependency } from "../src/model/game-mode-commands.js";

const workspace = resolve(import.meta.dirname, "../../..");
const taskId = process.env.GAME002_LAYOUT_BUILD_TASK ?? "132";
if (taskId !== "132" && taskId !== "135" && taskId !== "147")
  throw new Error(`Unsupported game002 Layout build task "${taskId}".`);
const outputDirectory = resolve(workspace, `tasks/artifacts/${taskId}`);
const inputLayout = new Uint8Array(
  await readFile("/Users/zerro/Downloads/crave-v2.zip"),
);
const inputSymbols = new Uint8Array(
  await readFile(
    resolve(outputDirectory, `game002-s3-symbols-task${taskId}.zip`),
  ),
);

const pixiAssets = Assets as unknown as {
  load: (...args: unknown[]) => Promise<Texture>;
  unload: (...args: unknown[]) => Promise<void>;
};
const originalLoad = pixiAssets.load;
const originalUnload = pixiAssets.unload;
pixiAssets.load = async () => Texture.WHITE;
pixiAssets.unload = async () => undefined;
const decodeImage = async (url: string) =>
  decodeImageSize(new Uint8Array(await (await fetch(url)).arrayBuffer()));
const importedLayout = await importLayoutZip(inputLayout, {
  decodeImage,
  loadSymbolTextures: false,
});
const importedSymbols = await importSymbolsZipWithFiles(inputSymbols, {
  loadTextures: false,
});
try {
  const project = manifestToEditorProject(
    importedLayout.manifest,
    importedLayout.assets,
    importedLayout.videoMetadata,
  );
  replaceSymbolDependency(project, "game002-s3", importedSymbols);
  assertEditorProject(project);

  const originalX = project.reel.placements.default!.x;
  project.reel.placements.default = {
    ...project.reel.placements.default!,
    x: originalX + 1,
  };
  const edited = await exportProject(project);
  const editedImport = await importLayoutZip(edited.bytes, {
    decodeImage,
    loadSymbolTextures: false,
  });
  try {
    if (
      editedImport.manifest.gameModes.modes.find(
        (mode) => mode.id === editedImport.manifest.gameModes.initialMode,
      )?.reelPlacements.main?.default?.x !==
      originalX + 1
    ) {
      throw new Error(
        "Game Layout Editor edit/export/reimport probe did not persist.",
      );
    }
  } finally {
    editedImport.destroy();
  }
  project.reel.placements.default = {
    ...project.reel.placements.default!,
    x: originalX,
  };

  const exported = await exportProject(project);
  const reimported = await importLayoutZip(exported.bytes, {
    decodeImage,
    loadSymbolTextures: false,
  });
  try {
    const reimportedProject = manifestToEditorProject(
      reimported.manifest,
      reimported.assets,
      reimported.videoMetadata,
    );
    assertEditorProject(reimportedProject);
    const manifest = editorProjectToManifest(reimportedProject);
    if (
      manifest.gameModes?.modes.some(
        (mode) => mode.symbolPackage !== "game002-s3",
      )
    ) {
      throw new Error("Task 132 layout lost a game mode Symbols binding.");
    }
  } finally {
    reimported.destroy();
  }

  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, `crave-layout-task${taskId}.zip`);
  await writeFile(outputPath, exported.bytes);
  process.stdout.write(
    `${JSON.stringify({
      outputPath,
      byteLength: exported.bytes.byteLength,
      sha256: createHash("sha256").update(exported.bytes).digest("hex"),
    })}\n`,
  );
} finally {
  importedSymbols.resource.destroy();
  importedLayout.destroy();
  pixiAssets.load = originalLoad;
  pixiAssets.unload = originalUnload;
}

async function exportProject(project: EditorProject) {
  return exportLayoutZip({
    manifest: editorProjectToManifest(project),
    assets: project.assets,
    symbolFilesById: new Map(
      [...project.symbolDependencies].map(([id, dependency]) => [
        id,
        dependencyFiles(
          project,
          dependency.rootKey,
          dependency.keys,
          "symbols.package.json",
        ),
      ]),
    ),
    popupFilesById: new Map(
      [...project.popupDependencies].map(([id, dependency]) => [
        id,
        dependencyFiles(
          project,
          dependency.rootKey,
          dependency.keys,
          "popup.manifest.json",
        ),
      ]),
    ),
    decodeImage,
    loadSymbolTextures: false,
  });
}

function dependencyFiles(
  project: EditorProject,
  rootKey: string,
  keys: readonly string[],
  sentinel: "symbols.package.json" | "popup.manifest.json",
): ReadonlyMap<string, Uint8Array> {
  return new Map(
    keys.map((key) => {
      const bytes = project.assets.get(key);
      if (!bytes) throw new Error(`Task 132 dependency is missing ${key}.`);
      return [key === rootKey ? sentinel : key, bytes.slice()] as const;
    }),
  );
}

function assertEditorProject(project: EditorProject): void {
  if (!project.symbolDependencies.has("game002-s3"))
    throw new Error("Task 132 layout is missing game002-s3.");
  for (const modeId of ["BaseGame", "FreeGame"]) {
    const mode = project.gameModes.modes.find(
      (candidate) => candidate.id === modeId,
    );
    if (mode?.symbols?.packageId !== "game002-s3") {
      throw new Error(
        `Task 132 layout mode ${modeId} is not bound to game002-s3.`,
      );
    }
  }
}

function decodeImageSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.byteLength >= 24 &&
    String.fromCharCode(...bytes.slice(1, 4)) === "PNG"
  ) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.byteLength >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      const size = view.getUint16(offset + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          width: view.getUint16(offset + 7),
          height: view.getUint16(offset + 5),
        };
      }
      if (size < 2) break;
      offset += size + 2;
    }
  }
  if (
    bytes.byteLength >= 30 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP" &&
    ascii(bytes, 12, 16) === "VP8X"
  ) {
    return {
      width: 1 + readUint24(bytes, 24),
      height: 1 + readUint24(bytes, 27),
    };
  }
  throw new Error("Task 132 encountered an unsupported image payload.");
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
  );
}
